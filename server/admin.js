'use strict';
// टेलीग्राम बॉट वाला एडमिन पैनल. webhook से चलता है, इसलिए सर्वर सोया हो तो संदेश आते ही जाग जाता है.
const crypto = require('crypto');
const auth = require('./auth.js');

const HELP = [
  'एडमिन आदेश:',
  '/stats : खिलाड़ी, कमरे, मैच और खातों की गिनती',
  '/notify पाठ : सबको सूचना भेजें',
  '/notifs : आख़िरी 5 सूचनाएँ',
  '/clearnotifs : सारी सूचनाएँ मिटाएँ (पुष्टि पूछेगा)',
  '/ban आईडी : खिलाड़ी को रोकें',
  '/unban आईडी : खिलाड़ी को वापस खोलें',
  '/release : एडमिन का ताला खोलें',
].join('\n');

function secretFor(token) { return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 32); }

async function telegramSend(token, chatId, text, extra) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...(extra || {}) }),
  });
  return res.ok;
}

function createAdmin({ store, hub, token, ctl, send }) {
  const out = send || ((chatId, text, extra) => telegramSend(token, chatId, text, extra));
  let adminId;           // undefined = अभी पढ़ा नहीं, null = कोई एडमिन नहीं
  const tail = String(token).slice(-6);
  // एडमिन बनने का एक बार वाला कोड: हर बार सर्वर चालू होने पर नया बनता है और सिर्फ़ Render के लॉग में दिखता है
  const claimCode = crypto.randomBytes(9).toString('base64url');

  async function getAdmin() {
    if (adminId === undefined) adminId = await store.getSetting('adminChatId');
    return adminId;
  }

  async function notifyAdmin(text) {
    try { const a = await getAdmin(); if (a) await out(a, text); } catch (e) { /* सूचना न जाए तो खेल न रुके */ }
  }

  async function handleUpdate(u) {
    if (u && u.callback_query) return handleCallback(u.callback_query);
    const m = u && u.message;
    if (!m || typeof m.text !== 'string' || !m.chat) return;
    const chat = m.chat.id;
    const text = m.text.trim();
    const admin = await getAdmin();

    if (/^\/start(\s|$)/.test(text)) {
      const arg = text.slice(6).trim();
      if (admin) {
        if (String(admin) === String(chat)) await out(chat, 'आप एडमिन हैं. आदेशों के लिए /help भेजिए.');
        return;
      }
      if (arg === tail || arg === claimCode) {
        adminId = String(chat);
        await store.setSetting('adminChatId', adminId);
        await out(chat, 'आप इस बॉट के एडमिन बन गए. यह चैट अब ताले में है, और किसी और के संदेश अनदेखे रहेंगे.\n\n' + HELP);
      } else {
        await out(chat, 'यह निजी बॉट है. एडमिन बनने के लिए /start के बाद एक खाली जगह छोड़कर टोकन के आख़िरी 6 अक्षर भेजिए.');
      }
      return;
    }

    if (!admin || String(admin) !== String(chat)) return;

    if (/^\/help(\s|$)/.test(text)) return void (await out(chat, HELP));

    if (/^\/stats(\s|$)/.test(text)) {
      const s = hub.summary();
      const users = await store.countUsers();
      const notifs = (await store.listNotifications()).length;
      return void (await out(chat,
        `अभी ऑनलाइन खिलाड़ी: ${s.online}\nखुले कमरे: ${s.openPublic}, कोड वाले कमरे: ${s.openPrivate}\n` +
        `चल रहे मैच: ${s.playing}\nइंतज़ार में खिलाड़ी: ${s.waiting}\nकुल खाते: ${users}\nसूचनाएँ: ${notifs}`));
    }

    if (/^\/notify(\s|$)/.test(text)) {
      const body = text.slice(7).trim();
      if (body.length < 2) return void (await out(chat, 'ऐसे लिखिए: /notify आपका संदेश'));
      if (body.length > 500) return void (await out(chat, 'सूचना 500 अक्षर से छोटी रखिए.'));
      await store.addNotification(body);
      return void (await out(chat, 'सूचना भेज दी गई. ऐप खुलते ही खिलाड़ियों को दिखेगी.'));
    }

    if (/^\/notifs(\s|$)/.test(text)) {
      const list = (await store.listNotifications(5));
      if (!list.length) return void (await out(chat, 'कोई सूचना नहीं है.'));
      return void (await out(chat, list.map((n, i) => `${i + 1}. ${n.text}`).join('\n')));
    }

    if (/^\/clearnotifs(\s|$)/.test(text)) {
      return void (await out(chat, 'क्या सारी सूचनाएँ मिटानी हैं? यह वापस नहीं आएँगी.', {
        reply_markup: { inline_keyboard: [[{ text: 'हाँ, सब मिटाओ', callback_data: 'clear_yes' }, { text: 'नहीं, रहने दो', callback_data: 'clear_no' }]] },
      }));
    }

    const ban = /^\/(ban|unban)\s+(\S+)/.exec(text);
    if (ban) {
      const id = auth.normaliseId(ban[2]);
      if (!auth.isOurId(id)) return void (await out(chat, 'यह आईडी सही नहीं लगती. 16 अक्षर की आईडी लिखिए.'));
      const rec = await store.getUser(id);
      if (!rec) return void (await out(chat, 'ऐसा कोई खाता नहीं मिला.'));
      const on = ban[1] === 'ban';
      await ctl.setBanned(id, on);
      return void (await out(chat, on ? `${rec.name} को रोक दिया गया.` : `${rec.name} को वापस खोल दिया गया.`));
    }

    if (/^\/release(\s|$)/.test(text)) {
      adminId = null;
      await store.setSetting('adminChatId', null);
      return void (await out(chat, 'ताला खुल गया. नया एडमिन बनने के लिए /start के बाद टोकन के आख़िरी 6 अक्षर भेजना होगा.'));
    }

    await out(chat, 'यह आदेश समझ नहीं आया. /help भेजिए.');
  }

  async function handleCallback(cb) {
    const admin = await getAdmin();
    const chat = cb.message && cb.message.chat && cb.message.chat.id;
    if (!admin || String(admin) !== String(chat)) return;
    if (cb.data === 'clear_yes') {
      const n = await store.clearNotifications();
      await out(chat, `${n} सूचनाएँ मिटा दी गईं.`);
    } else if (cb.data === 'clear_no') {
      await out(chat, 'ठीक है, कुछ नहीं मिटाया.');
    }
  }

  return { handleUpdate, notifyAdmin, secret: secretFor(token), claimCode };
}

async function botUsername(token) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  if (!res.ok) return null;
  const j = await res.json();
  return j && j.result && j.result.username ? j.result.username : null;
}

async function setupWebhook(token, publicUrl) {
  const secret = secretFor(token);
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${publicUrl.replace(/\/$/, '')}/tg/${secret}`, secret_token: secret, allowed_updates: ['message', 'callback_query'] }),
  });
  return res.ok;
}

module.exports = { createAdmin, setupWebhook, secretFor, botUsername };

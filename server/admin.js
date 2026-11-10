'use strict';
// टेलीग्राम बॉट वाला एडमिन पैनल. webhook से चलता है, इसलिए सर्वर सोया हो तो संदेश आते ही जाग जाता है.
const crypto = require('crypto');
const auth = require('./auth.js');
const { START_BALANCE } = require('./store.js');
const KEYBOARD = { keyboard: [[{ text: 'Allot Money' }, { text: 'Reset Balance' }]], resize_keyboard: true };
const MAX_ALLOT = 100000000;
const DOC_LIMIT = 4 * 1024 * 1024;

const HELP = [
  'एडमिन आदेश:',
  '/stats : खिलाड़ी, कमरे, मैच और खातों की गिनती',
  '/notify पाठ : सबको सूचना भेजें',
  '/notifs : आख़िरी 5 सूचनाएँ',
  '/clearnotifs : सारी सूचनाएँ मिटाएँ (पुष्टि पूछेगा)',
  '/ban आईडी : खिलाड़ी को रोकें',
  '/unban आईडी : खिलाड़ी को वापस खोलें',
  '/allot आईडी रकम : खिलाड़ी के बैलेंस में रकम जोड़ें (बटन: Allot Money)',
  '/resetbalance आईडी [रकम] : बैलेंस रीसेट करें, रकम न दें तो 20000 (बटन: Reset Balance)',
  '/balance आईडी : बैलेंस देखें',
  '/notifyuser नाम पाठ : किसी एक खिलाड़ी को निजी सूचना भेजें',
  '/suspend नाम, /unsuspend नाम : खाता रोकें या खोलें (नाम या आईडी)',
  '/release : एडमिन का ताला खोलें',
].join('\n');

function secretFor(token) { return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 32); }

async function telegramDelete(token, chatId, messageId) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
  } catch (e) { /* हटाना न हो पाए तो भी आगे बढ़ो */ }
}

async function telegramSendFile(token, chatId, buf, filename, caption) {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('caption', String(caption || '').slice(0, 900));
  fd.append('document', new Blob([buf]), filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
  return res.ok;
}

async function telegramSend(token, chatId, text, extra) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...(extra || {}) }),
  });
  return res.ok;
}

function createAdmin({ store, hub, token, ctl, send, del, passHash, sendFile }) {
  const out = send || ((chatId, text, extra) => telegramSend(token, chatId, text, extra));
  const remove = del || ((chatId, messageId) => telegramDelete(token, chatId, messageId));
  const outFile = sendFile || ((chatId, buf, filename, caption) => telegramSendFile(token, chatId, buf, filename, caption));
  const pendingOp = new Map();     // चैट -> 'allot' | 'reset' (बटन दबने के बाद अगला संदेश आईडी (और रकम) है)
  const awaiting = new Map();      // वे चैट जो पासवर्ड भेजने वाली हैं
  const fails = { n: 0, until: 0 };
  let adminId;           // undefined = अभी पढ़ा नहीं, null = कोई एडमिन नहीं
  // एडमिन बनने का एक बार वाला कोड: हर बार सर्वर चालू होने पर नया बनता है और सिर्फ़ Render के लॉग में दिखता है
  const claimCode = crypto.randomBytes(9).toString('base64url');

  async function getAdmin() {
    if (adminId === undefined) adminId = await store.getSetting('adminChatId');
    return adminId;
  }

  async function notifyAdmin(text) {
    try { const a = await getAdmin(); if (a) await out(a, text); } catch (e) { /* सूचना न जाए तो खेल न रुके */ }
  }

  async function toId(raw) {
    const id = auth.normaliseId(raw);
    if (auth.isOurId(id)) return id;
    const u = await store.getUserByName(auth.nameKey(String(raw)));
    return u ? u.id : id;
  }

  async function forwardFile(buf, filename, caption) {
    try { const a = await getAdmin(); if (!a) return false; return !!(await outFile(a, buf, filename, caption)); } catch (e) { return false; }
  }

  async function sendTo(chatId, text) { try { return !!(await out(chatId, text)); } catch (e) { return false; } }

  async function doAllot(chat, idRaw, amtRaw) {
    const id = await toId(idRaw);
    const amt = Number(amtRaw);
    if (!auth.isOurId(id)) return void (await out(chat, 'यह आईडी या यूज़रनेम नहीं मिला.'));
    if (!Number.isInteger(amt) || amt <= 0 || amt > MAX_ALLOT) return void (await out(chat, 'रकम 1 से 100000000 के बीच पूरी संख्या होनी चाहिए.'));
    const rec = await store.getUser(id);
    if (!rec) return void (await out(chat, 'ऐसा कोई खाता नहीं मिला.'));
    const nb = await store.adjustBalance(id, amt);
    await out(chat, `${rec.name} के खाते में ${amt} रुपये जुड़ गए. नया बैलेंस: ${nb}.`, KEYBOARD);
  }

  async function doReset(chat, idRaw, amtRaw) {
    const id = await toId(idRaw);
    const amt = amtRaw === undefined || amtRaw === '' ? START_BALANCE : Number(amtRaw);
    if (!auth.isOurId(id)) return void (await out(chat, 'यह आईडी या यूज़रनेम नहीं मिला.'));
    if (!Number.isInteger(amt) || amt < 0 || amt > MAX_ALLOT) return void (await out(chat, 'रकम 0 से 100000000 के बीच पूरी संख्या होनी चाहिए.'));
    const rec = await store.getUser(id);
    if (!rec) return void (await out(chat, 'ऐसा कोई खाता नहीं मिला.'));
    const nb = await store.setBalance(id, amt);
    await out(chat, `${rec.name} का बैलेंस रीसेट हुआ. नया बैलेंस: ${nb}.`, KEYBOARD);
  }

  async function handleUpdate(u) {
    if (u && u.callback_query) return handleCallback(u.callback_query);
    const m = u && u.message;
    if (!m || typeof m.text !== 'string' || !m.chat) return;
    const chat = m.chat.id;
    const text = m.text.trim();
    const admin = await getAdmin();

    // खिलाड़ी का Telegram जोड़ना: /link कोड, या ऐप के लिंक से /start link_कोड
    const lk = /^\/(?:link|start)\s+(?:link_)?([A-Za-z0-9]{6})\s*$/.exec(text);
    if (lk && ctl && typeof ctl.linkTelegram === 'function') {
      const nm = await ctl.linkTelegram(lk[1], chat);
      if (nm) return void (await out(chat, `${nm} का खाता इस Telegram से जुड़ गया. अब पासवर्ड भूलने पर कोड यहीं आएगा.`));
      if (String(text).startsWith('/link')) return void (await out(chat, 'यह कोड सही नहीं है या समय निकल चुका है. ऐप में दोबारा कोड बनाइए.'));
    }

    // पासवर्ड वाला तरीक़ा: /start के बाद अगला संदेश पासवर्ड माना जाता है
    if (!admin && passHash && awaiting.has(String(chat)) && !text.startsWith('/')) {
      const now = Date.now();
      if (fails.until > now) {
        await remove(chat, m.message_id);
        return void (await out(chat, 'बहुत ग़लत कोशिशें हुईं. कुछ देर बाद फिर कोशिश कीजिए.'));
      }
      let good = false;
      try {
        const [salt, hash] = String(passHash).split(':');
        good = auth.verifyPassword(text, salt, hash);
      } catch (e) { good = false; }
      await remove(chat, m.message_id);          // पासवर्ड वाला संदेश चैट से हटा दो
      if (good) {
        awaiting.delete(String(chat));
        fails.n = 0;
        adminId = String(chat);
        await store.setSetting('adminChatId', adminId);
        return void (await out(chat, 'सही पासवर्ड. आप इस बॉट के एडमिन बन गए. यह चैट अब ताले में है, और किसी और के संदेश अनदेखे रहेंगे.\n\n' + HELP, KEYBOARD));
      }
      fails.n += 1;
      if (fails.n >= 5) { fails.n = 0; fails.until = now + 10 * 60 * 1000; }
      return void (await out(chat, 'पासवर्ड ग़लत है.'));
    }

    if (/^\/start(\s|$)/.test(text)) {
      const arg = text.slice(6).trim();
      if (admin) {
        if (String(admin) === String(chat)) await out(chat, 'आप एडमिन हैं. आदेशों के लिए /help भेजिए.');
        return;
      }
      if (arg === claimCode) {
        adminId = String(chat);
        await store.setSetting('adminChatId', adminId);
        await out(chat, 'आप इस बॉट के एडमिन बन गए. यह चैट अब ताले में है, और किसी और के संदेश अनदेखे रहेंगे.\n\n' + HELP, KEYBOARD);
      } else if (passHash) {
        awaiting.set(String(chat), Date.now());
        await out(chat, 'यह निजी बॉट है. एडमिन बनने के लिए अगले संदेश में एडमिन का पासवर्ड भेजिए.');
      } else {
        await out(chat, 'यह निजी बॉट है.');
      }
      return;
    }

    if (!admin || String(admin) !== String(chat)) return;

    // बटन वाला तरीक़ा: पहले बटन, फिर अगले संदेश में आईडी (और रकम)
    if (text === 'Allot Money') { pendingOp.set(String(chat), 'allot'); return void (await out(chat, 'ऐसे भेजिए: आईडी रकम\nउदाहरण: abcdefghijklmnop 5000', KEYBOARD)); }
    if (text === 'Reset Balance') { pendingOp.set(String(chat), 'reset'); return void (await out(chat, 'ऐसे भेजिए: आईडी [रकम]. रकम न दें तो 20000.', KEYBOARD)); }
    const op = pendingOp.get(String(chat));
    if (op && !text.startsWith('/')) {
      pendingOp.delete(String(chat));
      const [pid, pamt] = text.split(/\s+/);
      return void (await (op === 'allot' ? doAllot(chat, pid, pamt) : doReset(chat, pid, pamt)));
    }
    let cm;
    if ((cm = /^\/allot(?:@\w+)?\s+(\S+)\s+(\S+)/.exec(text))) return void (await doAllot(chat, cm[1], cm[2]));
    if (/^\/allot(\s|$)/.test(text)) return void (await out(chat, 'ऐसे लिखिए: /allot आईडी रकम', KEYBOARD));
    if ((cm = /^\/resetbalance(?:@\w+)?\s+(\S+)(?:\s+(\S+))?/.exec(text))) return void (await doReset(chat, cm[1], cm[2]));
    if (/^\/resetbalance(\s|$)/.test(text)) return void (await out(chat, 'ऐसे लिखिए: /resetbalance आईडी [रकम]', KEYBOARD));
    if ((cm = /^\/balance(?:@\w+)?\s+(\S+)/.exec(text))) {
      const id = await toId(cm[1]);
      const b = auth.isOurId(id) ? await store.getBalance(id) : null;
      return void (await out(chat, b === null ? 'ऐसा कोई खाता नहीं मिला.' : `बैलेंस: ${b}`));
    }

    if (/^\/help(\s|$)/.test(text)) return void (await out(chat, HELP, KEYBOARD));

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

    const nu = /^\/notifyuser\s+(\S+)\s+([\s\S]{2,300})$/.exec(text);
    if (nu) {
      const uid = await toId(nu[1]);
      const ok = auth.isOurId(uid) && (await store.pushInbox(uid, nu[2].trim()));
      return void (await out(chat, ok ? 'खिलाड़ी को निजी सूचना भेज दी गई. ऐप खुलते ही दिखेगी.' : 'ऐसा कोई खाता नहीं मिला.'));
    }

    const ban = /^\/(ban|unban|suspend|unsuspend)\s+(\S+)/.exec(text);
    if (ban) {
      const id = await toId(ban[2]);
      if (!auth.isOurId(id)) return void (await out(chat, 'यह आईडी या यूज़रनेम नहीं मिला.'));
      const rec = await store.getUser(id);
      if (!rec) return void (await out(chat, 'ऐसा कोई खाता नहीं मिला.'));
      const on = ban[1] === 'ban' || ban[1] === 'suspend';
      await ctl.setBanned(id, on);
      return void (await out(chat, on ? `${rec.name} को रोक दिया गया.` : `${rec.name} को वापस खोल दिया गया.`));
    }

    if (/^\/release(\s|$)/.test(text)) {
      adminId = null;
      await store.setSetting('adminChatId', null);
      return void (await out(chat, 'ताला खुल गया. नया एडमिन बनने के लिए /start भेजकर पासवर्ड भेजना होगा.'));
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

  return { handleUpdate, notifyAdmin, secret: secretFor(token), claimCode, sendTo, forwardFile, toId };
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

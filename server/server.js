'use strict';
const crypto = require('crypto');
const http = require('http');
const auth = require('./auth.js');
const { createStore, START_BALANCE } = require('./store.js');
const { Hub } = require('./hub.js');
const { createAdmin, setupWebhook, botUsername } = require('./admin.js');
const { Race } = require('./race.js');

const levelOf = (wins) => Math.floor((wins || 0) / 9) + 1;

function makeCtl(store, banned = new Set(), hub = null) {
  const linkCodes = new Map();
  return {
    linkCodes,
    botName: '',
    async linkTelegram(code, chatId) {
      const key = String(code).toUpperCase();
      const c = linkCodes.get(key);
      if (!c || c.exp < Date.now()) return null;
      linkCodes.delete(key);
      await store.updateUser(c.id, { tgChat: String(chatId) });
      const rec = await store.getUser(c.id);
      return rec ? rec.name : null;
    },
    async setBanned(id, on) {
      await store.updateUser(id, { banned: on });
      if (on) { banned.add(id); if (hub) hub.leave({ id }); } else banned.delete(id);
    },
  };
}

function createApp(store, hub, opts = {}) {
  const ctl = opts.ctl || makeCtl(store);
  const race = opts.race || new Race();
  const resetCodes = new Map();
  const DEFAULT_PRICES = { engine_fast: 3000, engine_heavy: 3000, engine_super: 5000 };
  async function getPrices() { return { ...DEFAULT_PRICES, ...JSON.parse((await store.getSetting('prices')) || '{}') }; }
  const banned = opts.banned || new Set();
  const admin = opts.admin || null;
  let notifCache = { at: 0, list: [] };
  const sessions = new Map();           // tokenKey -> {id}
  const users = new Map();
  ctl.onConsent = (id, status) => { const u = users.get(id); if (u) u.consent = status; };              // id -> {id, name}
  const failures = new Map();           // id -> {n, until}
  const ipHits = new Map();             // ip -> [timestamps]

  function limited(ip, max, windowMs) {
    const t = Date.now();
    const arr = (ipHits.get(ip) || []).filter((x) => t - x < windowMs);
    arr.push(t);
    ipHits.set(ip, arr);
    return arr.length > max;
  }

  async function userFromToken(req) {
    const h = req.headers['authorization'] || '';
    const m = /^Bearer (.+)$/.exec(h);
    if (!m) return null;
    const key = auth.tokenKey(m[1]);
    let s = sessions.get(key);
    if (!s) {
      s = await store.getSession(key);
      if (!s) return null;
      sessions.set(key, s);
    }
    let u = users.get(s.id);
    if (!u) {
      const rec = await store.getUser(s.id);
      if (!rec) return null;
      if (rec.banned) banned.add(rec.id);
      u = { id: rec.id, name: rec.name, minor: !!rec.minor, consent: rec.consent || 'na' };
      users.set(u.id, u);
    }
    if (banned.has(u.id)) return null;
    return { user: u, key };
  }

  async function newSession(id) {
    const token = auth.newToken();
    const key = auth.tokenKey(token);
    const s = { id, createdAt: Date.now() };
    sessions.set(key, s);
    await store.putSession(key, s);
    return token;
  }

  function readBody(req, max = 8192) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (c) => { data += c; if (data.length > max) { reject(new Error('big')); req.destroy(); } });
      req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
      req.on('error', reject);
    });
  }

  function send(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }

  const errStatus = { not_found: 404, already_in_room: 409, room_full: 409, own_room: 409, not_waiting: 409,
    not_playing: 409, not_your_turn: 409, too_soon: 429, bad_shot: 400, banned: 403 };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();

    if (path === '/' ) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Blind Carrom server is running'); }
    if (path === '/api/shop' && req.method === 'GET') {
      return send(res, 200, { open: (await store.getSetting('shopOpen')) === '1', opensOn: '12 December 2026', prices: await getPrices() });
    }

    if (path === '/api/coins/rate' && req.method === 'GET') {
      return send(res, 200, { on: (await store.getSetting('convertOn')) === '1', rate: Number(await store.getSetting('coinRate')) || 5 });
    }

    if (path === '/api/ping') return send(res, 200, { ok: true, t: Date.now(), store: store.kind });

    if (admin && req.method === 'POST' && path === `/tg/${admin.secret}`) {
      if (req.headers['x-telegram-bot-api-secret-token'] !== admin.secret) return send(res, 403, { error: 'forbidden' });
      let upd = {};
      try { upd = await readBody(req); } catch (e) { return send(res, 400, { error: 'bad_request' }); }
      send(res, 200, { ok: true });
      admin.handleUpdate(upd).catch((e) => console.error('बॉट त्रुटि:', e && e.message));
      return;
    }

    if (path === '/api/notifications' && req.method === 'GET') {
      if (Date.now() - notifCache.at > 20000) {
        notifCache = { at: Date.now(), list: await store.listNotifications(100) };
      }
      return send(res, 200, { notifications: notifCache.list });
    }

    let body = {};
    if (req.method === 'POST') {
      try { body = await readBody(req, path === '/api/consent' ? 6000000 : 8192); } catch (e) { return send(res, 400, { error: 'bad_request' }); }
    }

    if (path === '/api/register' && req.method === 'POST') {
      if (limited(ip + ':reg', 20, 3600000)) return send(res, 429, { error: 'too_many' });
      const name = auth.validateName(body.name);
      if (!name) return send(res, 400, { error: 'bad_name' });
      if (!auth.validatePassword(body.password)) return send(res, 400, { error: 'bad_password' });
      const birthYear = Number(body.birthYear) || 0;
      const guardian = String(body.guardian || '').trim().slice(0, 40);
      const nowYear = new Date().getFullYear();
      if (birthYear && (birthYear < nowYear - 120 || birthYear > nowYear)) return send(res, 400, { error: 'bad_birth' });
      const minor = birthYear > 0 && (nowYear - birthYear) < 13;
      if (minor && guardian.length < 3) return send(res, 400, { error: 'guardian_needed' });
      const nameLower = auth.nameKey(name);
      if (await store.getUserByName(nameLower)) return send(res, 409, { error: 'name_taken' });
      let id;
      for (let i = 0; i < 5; i++) {
        const cand = auth.genId();
        if (!(await store.getUser(cand))) { id = cand; break; }
      }
      if (!id) return send(res, 500, { error: 'try_again' });
      const { salt, hash } = auth.hashPassword(body.password);
      await store.putUser({ id, name, salt, hash, createdAt: Date.now(), wins: 0, losses: 0, balance: START_BALANCE,
        birthYear, minor, guardian: minor ? guardian : '', nameLower, consent: minor ? 'none' : 'na' });
      const token = await newSession(id);
      users.set(id, { id, name, minor, consent: minor ? 'none' : 'na' });
      if (admin) admin.notifyAdmin(`नया खाता बना: ${name}`);
      return send(res, 200, { id, name, token, wins: 0, losses: 0, level: 1, minor, consent: minor ? 'none' : 'na' });
    }

    if (path === '/api/login' && req.method === 'POST') {
      if (limited(ip + ':login', 30, 600000)) return send(res, 429, { error: 'too_many' });
      let id = auth.normaliseId(body.id);
      if (!auth.isOurId(id) && body.username) {
        const byName = await store.getUserByName(auth.nameKey(body.username));
        if (byName) id = byName.id;
      }
      if (!auth.isOurId(id) || !auth.validatePassword(body.password)) return send(res, 401, { error: 'bad_login' });
      const f = failures.get(id);
      if (f && f.until > Date.now()) return send(res, 429, { error: 'locked', retryMs: f.until - Date.now() });
      const rec = await store.getUser(id);
      if (!rec || !auth.verifyPassword(body.password, rec.salt, rec.hash)) {
        const n = ((f && f.n) || 0) + 1;
        failures.set(id, { n, until: n >= 5 ? Date.now() + 5 * 60000 : 0 });
        if (n >= 5) failures.set(id, { n: 0, until: Date.now() + 5 * 60000 });
        return send(res, 401, { error: 'bad_login' });
      }
      if (rec.banned) return send(res, 403, { error: 'banned' });
      failures.delete(id);
      const token = await newSession(id);
      users.set(id, { id, name: rec.name, minor: !!rec.minor, consent: rec.consent || 'na' });
      return send(res, 200, { id, name: rec.name, token, wins: rec.wins || 0, losses: rec.losses || 0, level: levelOf(rec.wins), minor: !!rec.minor, consent: rec.consent || 'na' });
    }

    if (path === '/api/password/forgot' && req.method === 'POST') {
      if (limited(ip + ':forgot', 10, 3600000)) return send(res, 429, { error: 'too_many' });
      const rec = await store.getUserByName(auth.nameKey(body.username || ''));
      if (rec && rec.tgChat && admin && !limited(rec.id + ':fcode', 1, 60000)) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        resetCodes.set(rec.id, { hash: crypto.createHash('sha256').update(code).digest('hex'), exp: Date.now() + 600000, tries: 0 });
        admin.sendTo(rec.tgChat, `Blind Hub: आपका पासवर्ड बदलने का कोड ${code} है. यह 10 मिनट चलेगा. किसी को मत बताइए.`);
      }
      return send(res, 200, { ok: true });
    }

    if (path === '/api/password/reset' && req.method === 'POST') {
      if (limited(ip + ':reset', 20, 3600000)) return send(res, 429, { error: 'too_many' });
      const rec = await store.getUserByName(auth.nameKey(body.username || ''));
      const c = rec && resetCodes.get(rec.id);
      if (!rec || !c || c.exp < Date.now() || c.tries >= 5) return send(res, 400, { error: 'bad_code' });
      if (!auth.validatePassword(body.newPassword)) return send(res, 400, { error: 'bad_password' });
      if (crypto.createHash('sha256').update(String(body.code || '')).digest('hex') !== c.hash) { c.tries += 1; return send(res, 400, { error: 'bad_code' }); }
      resetCodes.delete(rec.id);
      const pw = auth.hashPassword(body.newPassword);
      await store.updateUser(rec.id, { salt: pw.salt, hash: pw.hash });
      await store.deleteSessionsOf(rec.id);
      for (const [k, sess] of Array.from(sessions.entries())) if (sess.id === rec.id) sessions.delete(k);
      users.delete(rec.id);
      return send(res, 200, { ok: true });
    }

    // आगे के सारे रास्तों में लॉगिन ज़रूरी
    const a = await userFromToken(req);
    if (!a) return send(res, 401, { error: 'unauthorized' });
    const user = a.user;
    hub.touch(user.id);

    const gated = path.startsWith('/api/rooms') || path === '/api/shoot' || path === '/api/state' || path.startsWith('/api/race');
    if (gated && user.minor && user.consent === 'none') return send(res, 403, { error: 'consent_needed' });

    const reply = (r) => {
      if (r && r.error) return send(res, errStatus[r.error] || 400, r);
      return send(res, 200, r);
    };

    if (path === '/api/account/delete' && req.method === 'POST') {
      const rec = await store.getUser(user.id);
      if (!rec || !auth.verifyPassword(String(body.password || ''), rec.salt, rec.hash)) return send(res, 401, { error: 'bad_login' });
      await store.deleteUser(user.id);
      for (const [k, sess] of Array.from(sessions.entries())) if (sess.id === user.id) sessions.delete(k);
      users.delete(user.id);
      hub.leave({ id: user.id });
      return send(res, 200, { ok: true });
    }

    if (path === '/api/consent' && req.method === 'POST') {
      if (!user.minor) return send(res, 200, { ok: true });
      const buf = Buffer.from(String(body.audio || ''), 'base64');
      if (buf.length < 2000 || buf.length > 4 * 1024 * 1024) return send(res, 400, { error: 'bad_audio' });
      const ext = /^[a-z0-9]{2,5}$/i.test(String(body.ext || '')) ? String(body.ext).toLowerCase() : 'm4a';
      const rec0 = await store.getUser(user.id);
      const sent = admin ? await admin.forwardFile(buf, `consent-${user.name}.${ext}`, `अभिभावक की सहमति (ऑडियो)\nखाता: ${user.name}\nअभिभावक: ${(rec0 && rec0.guardian) || ''}\nरोकने के लिए: /suspend ${user.name}`, { inline_keyboard: [[{ text: 'मंज़ूर', callback_data: 'c_ok:' + user.id }, { text: 'नामंज़ूर', callback_data: 'c_no:' + user.id }]] }) : false;
      if (!sent) return send(res, 503, { error: 'admin_unavailable' });
      await store.updateUser(user.id, { consent: 'submitted', consentAt: Date.now() });
      user.consent = 'submitted';
      return send(res, 200, { ok: true });
    }

    if (path === '/api/telegram/link-start' && req.method === 'POST') {
      const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 6; i++) code += alpha[crypto.randomInt(alpha.length)];
      ctl.linkCodes.set(code, { id: user.id, exp: Date.now() + 900000 });
      return send(res, 200, { code, bot: ctl.botName || '' });
    }

    if (path === '/api/race/create' && req.method === 'POST') return reply(race.create(user));
    if (path === '/api/race/join' && req.method === 'POST') return reply(race.join(user, body.code));
    if (path === '/api/race/state') return reply(race.state(user.id));
    if (path === '/api/race/input' && req.method === 'POST') return reply(race.input(user.id, body));
    if (path === '/api/race/leave' && req.method === 'POST') { race.leave(user.id); return send(res, 200, { ok: true }); }

    if (path === '/api/shop/buy' && req.method === 'POST') {
      if ((await store.getSetting('shopOpen')) !== '1') return send(res, 403, { error: 'shop_closed' });
      const item = String(body.item || '');
      const price = (await getPrices())[item];
      if (!price) return send(res, 400, { error: 'bad_item' });
      const rec = await store.getUser(user.id);
      const owned = (rec && rec.owned) || [];
      if (owned.includes(item)) return send(res, 409, { error: 'already_owned' });
      const bal = await store.getBalance(user.id);
      if (bal === null || bal < price) return send(res, 402, { error: 'insufficient', balance: bal || 0, price });
      const nb = await store.adjustBalance(user.id, -price);
      await store.updateUser(user.id, { owned: [...owned, item] });
      return send(res, 200, { ok: true, balance: nb, item });
    }

    if (path === '/api/promo/redeem' && req.method === 'POST') {
      const code = String(body.code || '').trim().toUpperCase();
      const amount = JSON.parse((await store.getSetting('promos')) || '{}')[code];
      if (!amount) return send(res, 400, { error: 'bad_code' });
      const rec = await store.getUser(user.id);
      const used = (rec && rec.promosUsed) || [];
      if (used.includes(code)) return send(res, 409, { error: 'already_used' });
      const nb = await store.adjustBalance(user.id, amount);
      await store.updateUser(user.id, { promosUsed: [...used, code] });
      return send(res, 200, { ok: true, added: amount, balance: nb });
    }

    if (path === '/api/coins/convert' && req.method === 'POST') {
      if ((await store.getSetting('convertOn')) !== '1') return send(res, 403, { error: 'convert_off' });
      const coins = Math.floor(Number(body.coins) || 0);
      if (coins < 1 || coins > 1000) return send(res, 400, { error: 'bad_coins' });
      if (limited(user.id + ':conv', 3, 600000)) return send(res, 429, { error: 'too_many' });
      const rate = Number(await store.getSetting('coinRate')) || 5;
      const nb = await store.adjustBalance(user.id, coins * rate);
      return send(res, 200, { ok: true, added: coins * rate, balance: nb, rate });
    }

    if (path === '/api/me') {
      const rec = await store.getUser(user.id);
      return send(res, 200, { owned: (rec && rec.owned) || [], minor: !!(rec && rec.minor), consent: (rec && rec.consent) || 'na', telegram: !!(rec && rec.tgChat), inbox: (rec && rec.inbox) || [], id: user.id, name: user.name, balance: (rec && typeof rec.balance === 'number') ? rec.balance : START_BALANCE, wins: (rec && rec.wins) || 0, losses: (rec && rec.losses) || 0, level: levelOf(rec && rec.wins) });
    }
    if (path === '/api/balance' && req.method === 'GET') return send(res, 200, { balance: await store.getBalance(user.id) });
    // खेल का जुर्माना/इनाम. सीमाएँ: जुर्माना <= 20000, इनाम <= 1000 और इनाम की गति 20 सेकंड में एक.
    if (path === '/api/balance/apply' && req.method === 'POST') {
      const amt = Number(body.amount);
      if (!Number.isInteger(amt) || amt <= 0 || (body.kind !== 'fine' && body.kind !== 'reward')) return send(res, 400, { error: 'bad_amount' });
      if (body.kind === 'fine' && amt > 20000) return send(res, 400, { error: 'bad_amount' });
      if (body.kind === 'reward') {
        if (amt > 1000) return send(res, 400, { error: 'bad_amount' });
        if (limited(user.id + ':reward', 1, 20000)) return send(res, 429, { error: 'too_many' });
      }
      return send(res, 200, { balance: await store.adjustBalance(user.id, body.kind === 'fine' ? -amt : amt) });
    }
    if (path === '/api/logout' && req.method === 'POST') {
      sessions.delete(a.key); await store.deleteSession(a.key);
      return send(res, 200, { ok: true });
    }
    if (path === '/api/rooms' && req.method === 'GET') return send(res, 200, { rooms: hub.listPublic(), online: hub.onlineCount() });
    if (path === '/api/rooms' && req.method === 'POST') return reply(hub.createRoom(user, body));
    if (path === '/api/rooms/join' && req.method === 'POST') return reply(hub.join(user, body));
    if (path === '/api/rooms/accept' && req.method === 'POST') return reply(hub.accept(user, String(body.userId || '')));
    if (path === '/api/rooms/leave' && req.method === 'POST') return reply(hub.leave(user));
    if (path === '/api/state' && req.method === 'GET') return send(res, 200, hub.stateFor(user, Number(url.searchParams.get('seq') || 0)));
    if (path === '/api/shoot' && req.method === 'POST') return reply(hub.shoot(user, body));
    if (path === '/api/resign' && req.method === 'POST') return reply(hub.resign(user));

    return send(res, 404, { error: 'not_found' });
  }

  return http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error('त्रुटि:', e && e.message);
      try { send(res, 500, { error: 'server_error' }); } catch (x) { /* जवाब पहले ही जा चुका */ }
    });
  });
}

function start() {
  const store = createStore();
  const banned = new Set();
  const hub = new Hub(Date.now, (match, winner) => {
    // जीत-हार के आँकड़े
    match.players.forEach((p, i) => {
      store.getUser(p.id).then((u) => {
        if (!u) return;
        const patch = i === winner ? { wins: (u.wins || 0) + 1 } : { losses: (u.losses || 0) + 1 };
        return store.updateUser(p.id, patch);
      }).catch(() => {});
    });
  });
  const ctl = makeCtl(store, banned, hub);
  const race = new Race();
  setInterval(() => race.cleanup(), 60000).unref();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const admin = token ? createAdmin({ store, hub, token, ctl, passHash: process.env.ADMIN_PASS_HASH }) : null;
  setInterval(() => hub.tick(), 5000).unref();
  const server = createApp(store, hub, { admin, banned, ctl, race });
  const port = Number(process.env.PORT) || 10000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`Blind Carrom server चालू, पोर्ट ${port}, डेटाबेस: ${store.kind}, टेलीग्राम बॉट: ${admin ? 'चालू' : 'बंद'}`);
    if (admin) {
      botUsername(token).then(async (u) => {
        ctl.botName = u || '';
        const claimed = await store.getSetting('adminChatId').catch(() => null);
        if (claimed) console.log('टेलीग्राम एडमिन पहले से तय है.');
        else if (u) console.log(`एडमिन बनने का लिंक (इसे अपने फ़ोन पर खोलिए, फिर Start दबाइए): https://t.me/${u}?start=${admin.claimCode}`);
        else console.log('बॉट का यूज़रनेम नहीं मिला. टोकन जाँचिए.');
      }).catch(() => {});
    }
    const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
    if (admin && publicUrl) {
      setupWebhook(token, publicUrl)
        .then((ok) => console.log('टेलीग्राम webhook:', ok ? 'लग गया' : 'नहीं लगा'))
        .catch((e) => console.error('webhook त्रुटि:', e && e.message));
    }
  });
  return server;
}

if (require.main === module) start();
module.exports = { createApp, makeCtl };

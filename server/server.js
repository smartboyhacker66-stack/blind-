'use strict';
const http = require('http');
const auth = require('./auth.js');
const { createStore } = require('./store.js');
const { Hub } = require('./hub.js');
const { createAdmin, setupWebhook, botUsername } = require('./admin.js');

const levelOf = (wins) => Math.floor((wins || 0) / 9) + 1;

function createApp(store, hub, opts = {}) {
  const banned = opts.banned || new Set();
  const admin = opts.admin || null;
  let notifCache = { at: 0, list: [] };
  const sessions = new Map();           // tokenKey -> {id}
  const users = new Map();              // id -> {id, name}
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
      u = { id: rec.id, name: rec.name };
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

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (c) => { data += c; if (data.length > 8192) { reject(new Error('big')); req.destroy(); } });
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
      try { body = await readBody(req); } catch (e) { return send(res, 400, { error: 'bad_request' }); }
    }

    if (path === '/api/register' && req.method === 'POST') {
      if (limited(ip + ':reg', 20, 3600000)) return send(res, 429, { error: 'too_many' });
      const name = auth.validateName(body.name);
      if (!name) return send(res, 400, { error: 'bad_name' });
      if (!auth.validatePassword(body.password)) return send(res, 400, { error: 'bad_password' });
      let id;
      for (let i = 0; i < 5; i++) {
        const cand = auth.genId();
        if (!(await store.getUser(cand))) { id = cand; break; }
      }
      if (!id) return send(res, 500, { error: 'try_again' });
      const { salt, hash } = auth.hashPassword(body.password);
      await store.putUser({ id, name, salt, hash, createdAt: Date.now(), wins: 0, losses: 0 });
      const token = await newSession(id);
      users.set(id, { id, name });
      if (admin) admin.notifyAdmin(`नया खाता बना: ${name}`);
      return send(res, 200, { id, name, token, wins: 0, losses: 0, level: 1 });
    }

    if (path === '/api/login' && req.method === 'POST') {
      if (limited(ip + ':login', 30, 600000)) return send(res, 429, { error: 'too_many' });
      const id = auth.normaliseId(body.id);
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
      users.set(id, { id, name: rec.name });
      return send(res, 200, { id, name: rec.name, token, wins: rec.wins || 0, losses: rec.losses || 0, level: levelOf(rec.wins) });
    }

    // आगे के सारे रास्तों में लॉगिन ज़रूरी
    const a = await userFromToken(req);
    if (!a) return send(res, 401, { error: 'unauthorized' });
    const user = a.user;
    hub.touch(user.id);

    const reply = (r) => {
      if (r && r.error) return send(res, errStatus[r.error] || 400, r);
      return send(res, 200, r);
    };

    if (path === '/api/me') {
      const rec = await store.getUser(user.id);
      return send(res, 200, { id: user.id, name: user.name, wins: (rec && rec.wins) || 0, losses: (rec && rec.losses) || 0, level: levelOf(rec && rec.wins) });
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
  const ctl = {
    async setBanned(id, on) {
      await store.updateUser(id, { banned: on });
      if (on) { banned.add(id); hub.leave({ id }); } else banned.delete(id);
    },
  };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const admin = token ? createAdmin({ store, hub, token, ctl, passHash: process.env.ADMIN_PASS_HASH }) : null;
  setInterval(() => hub.tick(), 5000).unref();
  const server = createApp(store, hub, { admin, banned });
  const port = Number(process.env.PORT) || 10000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`Blind Carrom server चालू, पोर्ट ${port}, डेटाबेस: ${store.kind}, टेलीग्राम बॉट: ${admin ? 'चालू' : 'बंद'}`);
    if (admin) {
      botUsername(token).then(async (u) => {
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
module.exports = { createApp };

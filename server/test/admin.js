'use strict';
const assert = require('assert');
const http = require('http');
const { createApp } = require('../server.js');
const { MemoryStore, MAX_NOTIFS } = require('../store.js');
const { Hub } = require('../hub.js');
const { createAdmin } = require('../admin.js');

const TOKEN = '123456789:AAFakeTokenForTestingXYZ123';
const store = new MemoryStore();
const hub = new Hub();
const banned = new Set();
const sent = [];
const ctl = { async setBanned(id, on) { await store.updateUser(id, { banned: on }); if (on) { banned.add(id); hub.leave({ id }); } else banned.delete(id); } };
const admin = createAdmin({ store, hub, token: TOKEN, ctl, send: async (chat, text, extra) => { sent.push({ chat: String(chat), text, extra }); return true; } });
const server = createApp(store, hub, { admin, banned });

function call(port, method, path, body, token, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: {
      'Content-Type': 'application/json', ...headers,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
    } }, (res) => {
      let b = ''; res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : {} }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const hook = `/tg/${admin.secret}`;
  const hdr = { 'x-telegram-bot-api-secret-token': admin.secret };
  const tg = async (chat, text) => { sent.length = 0; const r = await call(port, 'POST', hook, { message: { chat: { id: chat }, text } }, null, hdr); assert.strictEqual(r.status, 200); await wait(30); return sent.slice(); };
  const cb = async (chat, data) => { sent.length = 0; await call(port, 'POST', hook, { callback_query: { data, message: { chat: { id: chat } } } }, null, hdr); await wait(30); return sent.slice(); };
  let n = 0; const ok = (m) => console.log(`${++n} ठीक: ${m}`);

  // webhook सुरक्षा
  assert.strictEqual((await call(port, 'POST', hook, { message: { chat: { id: 1 }, text: '/start' } })).status, 403);
  assert.strictEqual((await call(port, 'POST', '/tg/wrongsecret', { message: {} }, null, hdr)).status, 401);
  ok('webhook बिना सही गुप्त शब्द के नहीं चलता');

  // एडमिन का ताला
  let r = await tg(555, '/start');
  assert.ok(r[0].text.includes('आख़िरी 6 अक्षर'));
  r = await tg(555, '/start wrong1');
  assert.ok(r[0].text.includes('निजी बॉट'));
  assert.strictEqual(await store.getSetting('adminChatId'), null);
  r = await tg(555, '/start ' + TOKEN.slice(-6));
  assert.ok(r[0].text.includes('एडमिन बन गए'));
  assert.strictEqual(await store.getSetting('adminChatId'), '555');
  r = await tg(999, '/start ' + TOKEN.slice(-6)); assert.strictEqual(r.length, 0);
  r = await tg(999, '/stats'); assert.strictEqual(r.length, 0);
  r = await tg(999, '/notify हैकर का संदेश'); assert.strictEqual(r.length, 0);
  assert.strictEqual((await store.listNotifications()).length, 0);
  ok('जो सही आख़िरी 6 अक्षर भेजे वही एडमिन बना और ताले में गया, बाक़ी सबके संदेश अनदेखे');

  // सूचनाएँ
  r = await tg(555, '/notify');
  assert.ok(r[0].text.includes('ऐसे लिखिए'));
  r = await tg(555, '/notify नया संस्करण आ गया है');
  assert.ok(r[0].text.includes('सूचना भेज दी'));
  let pub = await call(port, 'GET', '/api/notifications');
  assert.strictEqual(pub.status, 200); assert.strictEqual(pub.body.notifications[0].text, 'नया संस्करण आ गया है');
  ok('एडमिन की सूचना बिना लॉगिन के (मेहमान को भी) ऐप के रास्ते से दिखी');
  for (let i = 0; i < MAX_NOTIFS + 20; i++) await store.addNotification('भरती ' + i);
  assert.strictEqual((await store.listNotifications()).length, MAX_NOTIFS);
  assert.strictEqual((await store.listNotifications())[0].text, 'भरती ' + (MAX_NOTIFS + 19));
  ok('सूचनाएँ 100 पर रुकती हैं, सबसे नई रहती हैं, पुरानी अपने आप हटती हैं');

  // मिटाने की पुष्टि
  r = await tg(555, '/clearnotifs');
  assert.ok(r[0].extra && r[0].extra.reply_markup.inline_keyboard[0].length === 2);
  r = await cb(999, 'clear_yes'); assert.strictEqual(r.length, 0);
  assert.strictEqual((await store.listNotifications()).length, MAX_NOTIFS);
  r = await cb(555, 'clear_no'); assert.ok(r[0].text.includes('कुछ नहीं मिटाया'));
  assert.strictEqual((await store.listNotifications()).length, MAX_NOTIFS);
  r = await cb(555, 'clear_yes'); assert.ok(r[0].text.includes(`${MAX_NOTIFS} सूचनाएँ मिटा`));
  assert.strictEqual((await store.listNotifications()).length, 0);
  ok('मिटाना पुष्टि पर ही होता है और दूसरे के बटन दबाने से नहीं');

  // खाते, लेवल, रोक
  const A = (await call(port, 'POST', '/api/register', { name: 'Aditya', password: 'abcd1234' })).body;
  await wait(30);
  assert.ok(sent.some((m) => m.chat === '555' && m.text.includes('Aditya')));
  ok('नया खाता बनते ही एडमिन को टेलीग्राम पर सूचना गई');
  assert.strictEqual((await call(port, 'GET', '/api/me', null, A.token)).body.level, 1);
  await store.updateUser(A.id, { wins: 8 });
  assert.strictEqual((await call(port, 'GET', '/api/me', null, A.token)).body.level, 1);
  await store.updateUser(A.id, { wins: 9 });
  assert.strictEqual((await call(port, 'GET', '/api/me', null, A.token)).body.level, 2);
  await store.updateUser(A.id, { wins: 26 });
  assert.strictEqual((await call(port, 'GET', '/api/me', null, A.token)).body.level, 3);
  await store.updateUser(A.id, { wins: 27 });
  assert.strictEqual((await call(port, 'GET', '/api/me', null, A.token)).body.level, 4);
  const lg = await call(port, 'POST', '/api/login', { id: A.id, password: 'abcd1234' });
  assert.strictEqual(lg.body.level, 4);
  ok('लेवल: 0-8 जीत = 1, 9-17 = 2, 18-26 = 3, 27 = 4; लॉगिन और /me दोनों में आता है');

  r = await tg(555, '/stats');
  assert.ok(r[0].text.includes('कुल खाते: 1'));
  await call(port, 'POST', '/api/rooms', { type: 'public' }, A.token);
  r = await tg(555, '/stats'); assert.ok(r[0].text.includes('खुले कमरे: 1'));
  ok('/stats में खाते और खुले कमरे सही गिने गए');

  r = await tg(555, '/ban ' + A.id);
  assert.ok(r[0].text.includes('रोक दिया'));
  assert.strictEqual((await call(port, 'GET', '/api/me', null, A.token)).status, 401);
  assert.strictEqual((await call(port, 'POST', '/api/login', { id: A.id, password: 'abcd1234' })).status, 403);
  assert.strictEqual(hub.rooms.size, 0);
  r = await tg(555, '/unban ' + A.id); assert.ok(r[0].text.includes('वापस खोल'));
  assert.strictEqual((await call(port, 'POST', '/api/login', { id: A.id, password: 'abcd1234' })).status, 200);
  r = await tg(555, '/ban abc'); assert.ok(r[0].text.includes('सही नहीं'));
  ok('रोकने पर टोकन और लॉगिन बंद, कमरा हट गया; वापस खोलने पर सब चालू');

  // ताला खोलना
  r = await tg(555, '/release'); assert.ok(r[0].text.includes('ताला खुल'));
  r = await tg(555, '/stats'); assert.strictEqual(r.length, 0);
  r = await tg(777, '/start ' + TOKEN.slice(-6)); assert.ok(r[0].text.includes('एडमिन बन गए'));
  ok('/release से ताला खुला और नया एडमिन बना');

  console.log('\nसारी एडमिन जाँचें पास');
  server.close(); process.exit(0);
})().catch((e) => { console.error('फ़ेल:', e); process.exit(1); });

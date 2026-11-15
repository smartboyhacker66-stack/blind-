'use strict';
const assert = require('assert');
const http = require('http');
const { createApp, makeCtl } = require('../server.js');
const { MemoryStore } = require('../store.js');
const { Hub } = require('../hub.js');
const { createAdmin } = require('../admin.js');
const store = new MemoryStore(); const hub = new Hub(); const banned = new Set();
const ctl = makeCtl(store, banned, hub);
const sent = [];
const admin = createAdmin({ store, hub, token: '123456789:AAFakeShopTokenXYZ', ctl, passHash: undefined,
  send: async (c, t, e) => { sent.push({ chat: String(c), text: t, extra: e }); return true; },
  sendFile: async () => true });
const server = createApp(store, hub, { admin, ctl, banned });
function call(port, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { 'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : {} }));
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; const C = (m, p, b, t) => call(port, m, p, b, t);
  await store.setSetting('adminChatId', '555');
  const tg = async (text) => { sent.length = 0; await admin.handleUpdate({ message: { chat: { id: 555 }, text, message_id: 1 } }); return sent.slice(); };
  // दुकान चालू/बंद
  let m = await tg('/shop status'); assert.ok(m[0].text.includes('बंद'));   // शुरू में बंद (12 दिसंबर तक)
  m = await tg('/shop off'); assert.ok(m[0].text.includes('बंद'));
  let r = await C('GET', '/api/shop'); assert.strictEqual(r.body.open, false);
  m = await tg('/shop on'); r = await C('GET', '/api/shop'); assert.strictEqual(r.body.open, true);
  // कीमत और खरीद
  m = await tg('/price engine_fast 300'); assert.ok(m[0].text.includes('300'));
  const u = (await C('POST', '/api/register', { name: 'Kharidar', password: 'abcd1234', birthYear: 1995 })).body;
  await store.adjustBalance(u.id, -(await store.getBalance(u.id)));
  r = await C('POST', '/api/shop/buy', { item: 'engine_fast' }, u.token); assert.strictEqual(r.status, 402);
  m = await tg('/promo gift500 500'); assert.ok(m[0].text.includes('GIFT500'));
  r = await C('POST', '/api/promo/redeem', { code: 'gift500' }, u.token); assert.strictEqual(r.body.added, 500);
  r = await C('POST', '/api/promo/redeem', { code: 'GIFT500' }, u.token); assert.strictEqual(r.status, 409);
  r = await C('POST', '/api/shop/buy', { item: 'engine_fast' }, u.token); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.balance, 200);
  r = await C('POST', '/api/shop/buy', { item: 'engine_fast' }, u.token); assert.strictEqual(r.status, 409);
  r = await C('POST', '/api/shop/buy', { item: 'nahi_hai' }, u.token); assert.strictEqual(r.status, 400);
  r = await C('POST', '/api/promo/redeem', { code: 'NAHI' }, u.token); assert.strictEqual(r.status, 400);
  // दुकान बंद हो तो खरीद बंद
  await tg('/shop off');
  r = await C('POST', '/api/shop/buy', { item: 'engine_fast' }, u.token); assert.strictEqual(r.status, 403);
  await tg('/promooff GIFT500');
  await tg('/shop on');
  m = await tg('/promo gift500 0'); assert.ok(m[0].text.includes('1 से'));
  m = await tg('/menu'); assert.ok(m[0].extra && m[0].extra.inline_keyboard.length === 4);
  sent.length = 0; await admin.handleUpdate({ callback_query: { data: 'm_shop_off', message: { chat: { id: 555 } } } }); await new Promise((x) => setTimeout(x, 20));
  assert.ok(sent.some((s) => s.text.includes('बंद')));
  m = await tg('/menu'); assert.ok(m[0].extra && m[0].extra.inline_keyboard && m[0].extra.inline_keyboard.length === 4);
  sent.length = 0; await admin.handleUpdate({ callback_query: { data: 'm_shop_off', message: { chat: { id: 555 } } } }); await new Promise((x) => setTimeout(x, 20));
  assert.ok(sent.some((x) => x.text.includes('बंद')));
  // सिक्का बदलना
  m = await tg('/convert status'); assert.ok(m[0].text.includes('बंद'));
  r = await C('POST', '/api/coins/convert', { coins: 200 }, u.token); assert.strictEqual(r.status, 403);
  m = await tg('/convert on'); assert.ok(m[0].text.includes('चालू'));
  m = await tg('/rate 5'); assert.ok(m[0].text.includes('5'));
  const b0 = await store.getBalance(u.id);
  r = await C('POST', '/api/coins/convert', { coins: 200 }, u.token); assert.strictEqual(r.body.added, 1000); assert.strictEqual(r.body.balance, b0 + 1000);
  r = await C('POST', '/api/coins/convert', { coins: 5000 }, u.token); assert.strictEqual(r.status, 400);
  r = await C('GET', '/api/coins/rate'); assert.strictEqual(r.body.on, true); assert.strictEqual(r.body.rate, 5);
  // इंजन /me में दिखता है
  r = await C('GET', '/api/me', null, u.token); assert.ok(r.body.owned.includes('engine_fast'));
  console.log('सारी दुकान जाँचें पास'); server.close(); process.exit(0);
})().catch((e) => { console.error('फ़ेल:', e); process.exit(1); });

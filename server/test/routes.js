'use strict';
const assert = require('assert');
const http = require('http');
const { createApp, makeCtl } = require('../server.js');
const { MemoryStore } = require('../store.js');
const { Hub } = require('../hub.js');
const { createAdmin } = require('../admin.js');
const store = new MemoryStore(); const hub = new Hub(); const banned = new Set();
const ctl = makeCtl(store, banned, hub); const sent = [];
const admin = createAdmin({ store, hub, token: '123456789:AAFakeRoutesTokenZZ', ctl, passHash: undefined,
  send: async (c, t, e) => { sent.push({ chat: String(c), text: t, extra: e }); return true; }, sendFile: async () => true });
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
const tg = async (text) => { sent.length = 0; await admin.handleUpdate({ message: { chat: { id: 555 }, text, message_id: 1 } }); return sent.slice(); };
const routeText = (n, price) => ['ROUTE: Karnataka to Mumbai', 'FROM: Bengaluru City', 'TO: Mumbai CST', `STATIONS: ${n}`]
  .concat(Array.from({ length: n }, (_, i) => `Station ${i}, ${i * 10}`)).concat(['TRAINS: 12627 Karnataka Express', `PRICE: ${price}`]);
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; const C = (m, p, b, t) => call(port, m, p, b, t);
  await store.setSetting('adminChatId', '555');
  await store.setSetting('shopOpen', '1');
  let m = await tg('/routeadd\n' + routeText(3, 800).join('\n')); assert.ok(m[0].text.includes('route_1'));
  m = await tg('/routeadd\n' + routeText(5000, 800).join('\n')); assert.ok(m[0].text.includes('route_2') && m[0].text.includes('5000'));
  m = await tg('/routeadd\n' + routeText(3, 800).slice(0, 5).join('\n')); assert.ok(!m[0].text.includes('जुड़ गया'));
  const bad = routeText(3, 800); bad[4] = 'Station X, 90'; bad[5] = 'Station Y, 20';
  m = await tg('/routeadd\n' + bad.join('\n')); assert.ok(m[0].text.includes('घट'));
  m = await tg('/routeadd\n' + routeText(2, 0).join('\n')); assert.ok(m[0].text.includes('PRICE'));
  m = await tg('/routes'); assert.ok(m[0].text.includes('route_1') && m[0].text.includes('route_2'));
  m = await tg('/routeprice route_1 500'); assert.ok(m[0].text.includes('500'));
  m = await tg('/routeoff route_1'); assert.ok(m[0].text.includes('बंद'));
  let r = await C('GET', '/api/shop'); assert.deepStrictEqual(r.body.routes.map((x) => x.id), ['route_2']);
  assert.strictEqual(r.body.routes[0].stationCount, 5000);
  const u = (await C('POST', '/api/register', { name: 'Routewala', password: 'abcd1234', birthYear: 1995 })).body;
  await store.adjustBalance(u.id, -(await store.getBalance(u.id)));
  await store.adjustBalance(u.id, 5000);
  r = await C('POST', '/api/shop/buy', { item: 'route_2' }, u.token); assert.strictEqual(r.status, 200);
  r = await C('POST', '/api/shop/buy', { item: 'route_2' }, u.token); assert.strictEqual(r.status, 409);
  r = await C('POST', '/api/shop/buy', { item: 'route_1' }, u.token); assert.strictEqual(r.status, 400);
  r = await C('GET', '/api/route/route_2', null, u.token); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.stations.length, 5000);
  const other = (await C('POST', '/api/register', { name: 'Nakhareed', password: 'abcd1234', birthYear: 1995 })).body;
  r = await C('GET', '/api/route/route_2', null, other.token); assert.strictEqual(r.status, 403);
  await tg('/shop off');
  r = await C('POST', '/api/shop/buy', { item: 'route_2' }, other.token); assert.strictEqual(r.status, 403);
  await tg('/shop on');
  console.log('सारी रूट जाँचें पास'); server.close(); process.exit(0);
})().catch((e) => { console.error('फ़ेल:', e); process.exit(1); });

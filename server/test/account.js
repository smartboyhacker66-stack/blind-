'use strict';
const assert = require('assert');
const http = require('http');
const { createApp } = require('../server.js');
const { MemoryStore } = require('../store.js');
const { Hub } = require('../hub.js');
const store = new MemoryStore();
const hub = new Hub();
const server = createApp(store, hub, {});
function call(port, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : {} }));
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const C = (m, p, b, t) => call(port, m, p, b, t);
  // उम्र और अभिभावक
  let r = await C('POST', '/api/register', { name: 'Chhota', password: 'abcd1234', birthYear: 2016 });
  assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'guardian_needed');
  r = await C('POST', '/api/register', { name: 'Chhota', password: 'abcd1234', birthYear: 2016, guardian: 'Ramesh Kumar' });
  assert.strictEqual(r.status, 200);
  const kid = r.body;
  assert.strictEqual((await store.getUser(kid.id)).minor, true);
  r = await C('POST', '/api/register', { name: 'Bada', password: 'abcd1234', birthYear: 1990 });
  assert.strictEqual(r.status, 200); const adult = r.body;
  assert.strictEqual((await store.getUser(adult.id)).minor, false);
  r = await C('POST', '/api/register', { name: 'Galat', password: 'abcd1234', birthYear: 1800 });
  assert.strictEqual(r.body.error, 'bad_birth');
  console.log('1 ठीक: उम्र की जाँच, 13 से कम पर अभिभावक ज़रूरी');
  // खाता मिटाना
  r = await C('POST', '/api/account/delete', { password: 'wrong123' }, adult.token);
  assert.strictEqual(r.status, 401);
  r = await C('POST', '/api/account/delete', { password: 'abcd1234' }, adult.token);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(await store.getUser(adult.id), null);
  r = await C('GET', '/api/me', null, adult.token);
  assert.strictEqual(r.status, 401);
  r = await C('POST', '/api/login', { id: adult.id, password: 'abcd1234' });
  assert.strictEqual(r.status, 401);
  console.log('2 ठीक: ग़लत पासवर्ड पर खाता नहीं मिटा; सही पर मिटा, टोकन और लॉगिन बंद');
  server.close(); process.exit(0);
})().catch((e) => { console.error('फ़ेल:', e); process.exit(1); });

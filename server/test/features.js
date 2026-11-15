'use strict';
const assert = require('assert');
const http = require('http');
const { createApp, makeCtl } = require('../server.js');
const { MemoryStore } = require('../store.js');
const { Hub } = require('../hub.js');
const { createAdmin } = require('../admin.js');
const { Race, LENGTH } = require('../race.js');
const auth = require('../auth.js');

const TOKEN = '123456789:AAFakeTokenForFeatureTests';
const store = new MemoryStore();
const hub = new Hub();
const banned = new Set();
const ctl = makeCtl(store, banned, hub);
const sent = [], files = [];
const admin = createAdmin({ store, hub, token: TOKEN, ctl, passHash: undefined,
  send: async (c, t) => { sent.push({ chat: String(c), text: t }); return true; },
  sendFile: async (c, buf, name, cap, markup) => { files.push({ chat: String(c), size: buf.length, name, cap, markup }); return true; } });
const race = new Race();
const server = createApp(store, hub, { admin, ctl, race, banned });

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
let n = 0; const ok = (m) => console.log(`${++n} ठीक: ${m}`);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const C = (m, p, b, t) => call(port, m, p, b, t);
  // एडमिन तय करना
  await store.setSetting('adminChatId', '555');
  const tg = async (chat, text) => { sent.length = 0; await admin.handleUpdate({ message: { chat: { id: chat }, text, message_id: 1 } }); return sent.slice(); };

  // 1) यूज़रनेम से लॉगिन और अनोखा नाम
  let r = await C('POST', '/api/register', { name: 'Asha', password: 'abcd1234', birthYear: 1995 });
  assert.strictEqual(r.status, 200); const asha = r.body;
  r = await C('POST', '/api/register', { name: 'ASHA', password: 'abcd1234', birthYear: 1990 });
  assert.strictEqual(r.status, 409); assert.strictEqual(r.body.error, 'name_taken');
  r = await C('POST', '/api/login', { username: 'asha', password: 'abcd1234' });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.id, asha.id);
  r = await C('POST', '/api/login', { username: 'asha', password: 'wrong123' });
  assert.strictEqual(r.status, 401);
  r = await C('POST', '/api/login', { username: 'nobody', password: 'abcd1234' });
  assert.strictEqual(r.status, 401);
  r = await C('POST', '/api/login', { id: asha.id, password: 'abcd1234' });
  assert.strictEqual(r.status, 200);
  ok('यूज़रनेम (बड़े-छोटे अक्षर बराबर) से लॉगिन, अनोखा नाम, पुरानी आईडी भी चलती है');

  // 2) 13 से कम: सहमति आने तक ऑनलाइन बंद, ऑडियो आने पर खुला, एडमिन को फ़ाइल गई
  r = await C('POST', '/api/register', { name: 'Chhotu', password: 'abcd1234', birthYear: new Date().getFullYear() - 9, guardian: 'Ramesh Kumar' });
  assert.strictEqual(r.status, 200); const kid = r.body;
  assert.strictEqual(r.body.consent, 'none');
  r = await C('POST', '/api/rooms', { type: 'public', rules: 'icf' }, kid.token);
  assert.strictEqual(r.status, 403); assert.strictEqual(r.body.error, 'consent_needed');
  r = await C('GET', '/api/race/state', null, kid.token);
  assert.strictEqual(r.status, 403);
  r = await C('POST', '/api/consent', { audio: Buffer.alloc(500).toString('base64'), ext: 'm4a' }, kid.token);
  assert.strictEqual(r.body.error, 'bad_audio');
  r = await C('POST', '/api/consent', { audio: Buffer.alloc(5000, 7).toString('base64'), ext: 'm4a' }, kid.token);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(files.length, 1); assert.strictEqual(files[0].chat, '555');
  assert.ok(files[0].cap.includes('Chhotu') && files[0].cap.includes('Ramesh Kumar'));
  assert.ok(files[0].cap.includes('\n') && !files[0].cap.includes('\\n'));
  r = await C('POST', '/api/rooms', { type: 'public', rules: 'icf' }, kid.token);
  assert.notStrictEqual(r.status, 403);
  ok('बच्चे के लिए ऑडियो सहमति आने तक ऑनलाइन बंद; आने पर खुला; एडमिन के पास फ़ाइल और नाम पहुँचा');

  // 3) Telegram जोड़ना और पासवर्ड भूलने पर कोड से रीसेट
  r = await C('POST', '/api/telegram/link-start', {}, asha.token);
  assert.strictEqual(r.status, 200); const code = r.body.code; assert.strictEqual(code.length, 6);
  let m = await tg(777, '/link WRONG1'); assert.ok(m[0].text.includes('सही नहीं'));
  m = await tg(777, '/link ' + code); assert.ok(m[0].text.includes('Asha'));
  assert.strictEqual((await store.getUser(asha.id)).tgChat, '777');
  m = await tg(778, '/link ' + code); assert.ok(m[0].text.includes('सही नहीं'));   // कोड दोबारा नहीं चलता
  sent.length = 0;
  r = await C('POST', '/api/password/forgot', { username: 'asha' });
  assert.strictEqual(r.status, 200);
  await new Promise((x) => setTimeout(x, 30));
  const msg = sent.find((s) => s.chat === '777'); assert.ok(msg);
  const otp = /(\d{6})/.exec(msg.text)[1];
  r = await C('POST', '/api/password/reset', { username: 'asha', code: '000000', newPassword: 'newpas99' });
  assert.strictEqual(r.status, 400);
  r = await C('POST', '/api/password/reset', { username: 'asha', code: otp, newPassword: 'short' });
  assert.strictEqual(r.status, 400);
  r = await C('POST', '/api/password/reset', { username: 'asha', code: otp, newPassword: 'newpas99' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await C('GET', '/api/me', null, asha.token)).status, 401);   // पुराना टोकन बंद
  assert.strictEqual((await C('POST', '/api/login', { username: 'asha', password: 'abcd1234' })).status, 401);
  assert.strictEqual((await C('POST', '/api/login', { username: 'asha', password: 'newpas99' })).status, 200);
  r = await C('POST', '/api/password/reset', { username: 'asha', code: otp, newPassword: 'anothr11' });
  assert.strictEqual(r.status, 400);   // वही कोड दोबारा नहीं
  r = await C('POST', '/api/password/forgot', { username: 'chhotu' }); assert.strictEqual(r.status, 200);  // Telegram बिना: कोई जानकारी लीक नहीं
  r = await C('POST', '/api/password/forgot', { username: 'nobody' }); assert.strictEqual(r.status, 200);
  ok('Telegram जुड़ना, कोड से पासवर्ड रीसेट, ग़लत और दोहराया कोड बंद, पुराने टोकन बंद, किसी खाते का पता नहीं चलता');

  // 4) एडमिन: नाम से निजी सूचना, रोकना, खोलना
  m = await tg(555, '/notifyuser asha आपका स्वागत है');
  assert.ok(m[0].text.includes('भेज दी'));
  let me = (await C('POST', '/api/login', { username: 'asha', password: 'newpas99' })).body;
  r = await C('GET', '/api/me', null, me.token);
  assert.strictEqual(r.body.inbox[0].text, 'आपका स्वागत है'); assert.strictEqual(r.body.telegram, true);
  m = await tg(555, '/suspend asha'); assert.ok(m[0].text.includes('रोक'));
  assert.strictEqual((await C('GET', '/api/me', null, me.token)).status, 401);
  m = await tg(555, '/unsuspend asha');
  assert.strictEqual((await C('POST', '/api/login', { username: 'asha', password: 'newpas99' })).status, 200);
  m = await tg(555, '/notifyuser kisinahi नमस्ते'); assert.ok(m[0].text.includes('नहीं मिला'));
  ok('नाम से निजी सूचना (ऐप में inbox), /suspend और /unsuspend');

  // 5) बाइक रेस: दो खिलाड़ी, गिनती, चलना, मोड़ पर फिसलना, फ़िनिश, विजेता
  const R = new Race(() => 0);
  const A = { id: 'a1', name: 'Asha' }, B = { id: 'b1', name: 'Bala' };
  const c1 = R.create(A).code;
  assert.strictEqual(R.join(A, c1).error, 'own_room');
  assert.strictEqual(R.join(B, '000000').error, 'not_found');
  assert.ok(R.join(B, c1).code);
  assert.strictEqual(R.state('a1', 1000).status, 'countdown');
  assert.ok(R.state('a1', 1000).countdown > 3000);
  assert.strictEqual(R.state('a1', 6000).status, 'racing');
  R.input('a1', { gas: true }, 6000); R.input('b1', { gas: true }, 6000);
  let st = R.state('a1', 16000);
  assert.ok(st.you.pos > 50 && st.you.kmh > 30, 'गैस पर चलना चाहिए');
  // आसान: A पूरी गैस से मोड़ पर फिसलता है, B ब्रेक लगाकर बचता है (मोड़ पर गति कम रखकर)
  let t = 16000; let skidA = 0;
  for (let i = 0; i < 400; i++) {
    t += 1000;
    const b = R.state('b1', t);
    R.input('b1', { gas: b.you.kmh < 70, brake: false }, t);
    const a = R.state('a1', t);
    skidA = a.events.filter((e) => e.type === 'skid' && e.who === 'you').length;
    if (a.status === 'done') break;
  }
  const fin = R.state('a1', t);
  assert.strictEqual(fin.status, 'done');
  assert.ok(fin.winner === 'you' || fin.winner === 'opp');
  assert.ok(skidA >= 1, 'तेज़ गति पर कम से कम एक बार फिसलना चाहिए');
  ok(`बाइक रेस: गिनती, चलना, मोड़ पर फिसलना (${skidA} बार), फ़िनिश और विजेता (${fin.winner === 'you' ? 'Asha' : 'Bala'})`);
  // बूस्ट सिर्फ़ तैयार होने पर, और बीच में छोड़ने पर दूसरा जीतता है
  const R2 = new Race(() => 0);
  const X = { id: 'x', name: 'X' }, Y = { id: 'y', name: 'Y' };
  const c2 = R2.create(X).code; R2.join(Y, c2); R2.state('x', 7000);
  R2.input('x', { gas: true, boost: true }, 7000);
  assert.strictEqual(R2.state('x', 7500).events.filter((e) => e.type === 'boost').length, 1);
  R2.input('x', { gas: true, boost: true }, 8000);
  assert.strictEqual(R2.state('x', 8100).events.filter((e) => e.type === 'boost').length, 1);
  R2.leave('y'); assert.strictEqual(R2.state('x', 9000).winner, 'you');
  ok('बूस्ट का रुकाव (12 सेकंड), और बीच में छोड़ने पर दूसरा विजेता');

  // 6) रेस HTTP पर
  const u1 = (await C('POST', '/api/register', { name: 'Ravi', password: 'abcd1234', birthYear: 1990 })).body;
  const u2 = (await C('POST', '/api/register', { name: 'Rina', password: 'abcd1234', birthYear: 1991 })).body;
  r = await C('POST', '/api/race/create', {}, u1.token); assert.strictEqual(r.status, 200);
  r = await C('POST', '/api/race/join', { code: r.body.code }, u2.token); assert.strictEqual(r.status, 200);
  r = await C('GET', '/api/race/state', null, u2.token);
  assert.strictEqual(r.body.status, 'countdown'); assert.strictEqual(r.body.opp.name, 'Ravi');
  r = await C('POST', '/api/race/input', { gas: true }, u1.token); assert.strictEqual(r.status, 200);
  r = await C('POST', '/api/race/leave', {}, u1.token); assert.strictEqual(r.status, 200);
  ok('रेस के HTTP रास्ते: बनाना, जुड़ना, स्थिति, इनपुट, छोड़ना');

  // सहमति: एडमिन मंज़ूर/नामंज़ूर बटन
  const kid2 = (await C('POST', '/api/register', { name: 'Bachcha2', password: 'abcd1234', birthYear: new Date().getFullYear() - 8, guardian: 'Suresh Rao' })).body;
  r = await C('POST', '/api/consent', { audio: Buffer.alloc(6000, 3).toString('base64'), ext: 'm4a' }, kid2.token);
  assert.strictEqual(r.status, 200);
  assert.ok(files[files.length - 1].markup && files[files.length - 1].markup.inline_keyboard[0].length === 2);
  await admin.handleUpdate({ callback_query: { data: 'c_no:' + kid2.id, message: { chat: { id: 555 } } } });
  assert.strictEqual((await store.getUser(kid2.id)).consent, 'none');
  r = await C('GET', '/api/race/state', null, kid2.token); assert.strictEqual(r.status, 403);
  await admin.handleUpdate({ callback_query: { data: 'c_ok:' + kid2.id, message: { chat: { id: 555 } } } });
  assert.strictEqual((await store.getUser(kid2.id)).consent, 'approved');
  r = await C('GET', '/api/race/state', null, kid2.token); assert.notStrictEqual(r.status, 403);
  assert.ok(((await store.getUser(kid2.id)).inbox || []).length >= 2);
  ok('सहमति: नामंज़ूर पर फिर बंद, मंज़ूर पर खुला, खिलाड़ी को सूचना');
  console.log('\nसारी नई जाँचें पास'); server.close(); process.exit(0);
})().catch((e) => { console.error('फ़ेल:', e); process.exit(1); });

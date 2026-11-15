'use strict';
const assert = require('assert');
const http = require('http');
const { createApp } = require('../server.js');
const { MemoryStore } = require('../store.js');
const { Hub } = require('../hub.js');
const auth = require('../auth.js');

let clock = 1000000;
const store = new MemoryStore();
const hub = new Hub(() => clock, (m, w) => {
  m.players.forEach((p, i) => store.getUser(p.id).then((u) => store.updateUser(p.id, i === w ? { wins: (u.wins || 0) + 1 } : { losses: (u.losses || 0) + 1 })));
});
const server = createApp(store, hub);

function call(port, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: {
      'Content-Type': 'application/json',
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

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const C = (m, p, b, t) => call(port, m, p, b, t);
  let n = 0;
  const ok = (msg) => console.log(`${++n} ठीक: ${msg}`);

  // आईडी का पैटर्न
  const id1 = auth.genId();
  assert.ok(auth.isOurId(id1) && id1.length === 16);
  assert.ok(!/[01lo]/.test(id1));
  assert.ok(!auth.isOurId(id1.slice(0, 10) + 'x' + id1.slice(11)) || id1[10] === 'x');
  ok('आईडी 16 अक्षर की, भ्रम वाले अक्षर नहीं, छिपा पैटर्न जाँचा जा सकता है: ' + id1);

  // खाता बनाना
  assert.strictEqual((await C('POST', '/api/register', { name: 'ab', password: 'abcd1234' })).status, 400);
  assert.strictEqual((await C('POST', '/api/register', { name: 'Asha', password: 'short' })).status, 400);
  const A = (await C('POST', '/api/register', { name: 'Asha', password: 'abcd1234' })).body;
  const B = (await C('POST', '/api/register', { name: 'Bhanu', password: 'wxyz9876' })).body;
  const Cc = (await C('POST', '/api/register', { name: 'Charu', password: 'qwer5555' })).body;
  const D = (await C('POST', '/api/register', { name: 'हर्ष कुमार', password: 'hind1234' })).body;
  assert.ok(A.token && A.id && auth.isOurId(A.id));
  assert.ok(D.token, 'हिंदी नाम (मात्राओं और हलंत के साथ) स्वीकार होना चाहिए');
  const u = await store.getUser(A.id);
  assert.notStrictEqual(u.hash, 'abcd1234'); assert.ok(u.salt && !JSON.stringify(u).includes('abcd1234'));
  ok('खाते बने, पासवर्ड हैश करके रखा गया (सीधा नहीं), हिंदी नाम चला');

  // लॉगिन और रोक
  assert.strictEqual((await C('POST', '/api/login', { id: A.id, password: 'abcd1234' })).status, 200);
  assert.strictEqual((await C('POST', '/api/login', { id: A.id.toUpperCase().replace(/(.{4})/g, '$1-'), password: 'abcd1234' })).status, 200);
  for (let i = 0; i < 5; i++) assert.strictEqual((await C('POST', '/api/login', { id: B.id, password: 'wrongpw1' })).status, i < 5 ? 401 : 429);
  assert.strictEqual((await C('POST', '/api/login', { id: B.id, password: 'wxyz9876' })).status, 429);
  ok('लॉगिन चला (4-4 के समूह और बड़े अक्षर भी), 5 ग़लत कोशिशों पर रोक लगी');
  assert.strictEqual((await C('GET', '/api/rooms')).status, 401);
  ok('बिना लॉगिन के कमरे नहीं दिखते');

  // खुला कमरा, इंतज़ार-सूची, चयन
  const r = await C('POST', '/api/rooms', { type: 'public', rules: 'icf' }, A.token);
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await C('POST', '/api/rooms', { type: 'public' }, A.token)).status, 409);
  const list = (await C('GET', '/api/rooms', null, B.token)).body.rooms;
  assert.strictEqual(list.length, 1); assert.strictEqual(list[0].owner, 'Asha'); assert.strictEqual(list[0].waiting, 0);
  assert.strictEqual((await C('POST', '/api/rooms/join', { roomId: list[0].roomId }, B.token)).status, 200);
  assert.strictEqual((await C('POST', '/api/rooms/join', { roomId: list[0].roomId }, Cc.token)).status, 200);
  assert.strictEqual((await C('POST', '/api/rooms/join', { roomId: list[0].roomId }, A.token)).status, 409);
  let sA = (await C('GET', '/api/state', null, A.token)).body;
  assert.strictEqual(sA.phase, 'open'); assert.strictEqual(sA.waiting.length, 2);
  assert.deepStrictEqual(sA.waiting.map((w) => w.name), ['Bhanu', 'Charu']);
  assert.strictEqual((await C('GET', '/api/rooms', null, D.token)).body.rooms[0].waiting, 2);
  const sB = (await C('GET', '/api/state', null, B.token)).body;
  assert.strictEqual(sB.phase, 'waiting'); assert.strictEqual(sB.position, 1);
  ok('खुला कमरा: नाम, जुड़ने वालों की गिनती और इंतज़ार-सूची की जगह ठीक');
  assert.strictEqual((await C('POST', '/api/rooms/accept', { userId: B.id }, Cc.token)).status, 404);
  assert.strictEqual((await C('POST', '/api/rooms/accept', { userId: B.id }, A.token)).status, 200);
  const sC = (await C('GET', '/api/state', null, Cc.token)).body;
  assert.strictEqual(sC.phase, 'none'); assert.strictEqual(sC.notice, 'chosenOther');
  ok('कमरे वाले ने एक को चुना, बाक़ी को "किसी और को चुना गया" की सूचना मिली, कोई और चुन नहीं सकता');

  // मैच
  let st = (await C('GET', '/api/state', null, A.token)).body;
  assert.strictEqual(st.phase, 'playing'); assert.strictEqual(st.coins.length, 20);
  const tokens = { [A.id]: A.token, [B.id]: B.token };
  const ids = [A.id, B.id];
  const names = st.players;
  const firstIdx = st.cur;
  const meIdx = st.you;
  const tokOf = (nm) => (nm === 'Asha' ? A.token : B.token);
  const first = tokOf(names[firstIdx]);
  const second = tokOf(names[1 - firstIdx]);
  assert.strictEqual((await C('POST', '/api/shoot', { x: 500, angle: 0, power: 5 }, second)).status, 409);
  assert.strictEqual((await C('POST', '/api/shoot', { x: 10, angle: 0, power: 5 }, first)).status, 400);
  assert.strictEqual((await C('POST', '/api/shoot', { x: 500, angle: 0, power: 5.5 }, first)).status, 400);
  const s1 = await C('POST', '/api/shoot', { x: 500, angle: 0, power: 8 }, first);
  assert.strictEqual(s1.status, 200); assert.strictEqual(s1.body.seq, 1);
  st = (await C('GET', '/api/state?seq=0', null, second)).body;
  assert.ok(st.lastShot && st.lastShot.frames.length > 5 && st.lastShot.ev.length > 0);
  const st2 = (await C('GET', '/api/state?seq=1', null, second)).body;
  assert.ok(!st2.lastShot);
  ok(`शॉट चला, ${st.lastShot.frames.length} फ़्रेम, घटनाएँ: ${JSON.stringify(st.lastShot.ev.map((e) => e.t))}; seq पुराना हो तो दोबारा नहीं भेजा`);
  const curNow = st.cur;
  const curTok = tokOf(names[curNow]);
  assert.strictEqual((await C('POST', '/api/shoot', { x: 500, angle: 0, power: 5 }, curTok)).status, 429);
  clock += 15000;
  const s2 = await C('POST', '/api/shoot', { x: 650, angle: -10, power: 6 }, curTok);
  assert.strictEqual(s2.status, 200);
  ok('शॉट के बाद एनीमेशन पूरा होने से पहले अगला शॉट नहीं (too_soon), फिर चला');

  // समय-सीमा
  clock += 15000;
  hub.tick(); // दोनों अब भी "देखे" हुए हों ताकि निष्क्रियता न गिनी जाए
  let st3 = (await C('GET', '/api/state', null, A.token)).body;
  const before = st3.cur;
  await C('GET', '/api/state', null, B.token);
  clock += 61000;
  await C('GET', '/api/state', null, A.token); await C('GET', '/api/state', null, B.token);
  hub.tick();
  st3 = (await C('GET', '/api/state?seq=0', null, A.token)).body;
  assert.notStrictEqual(st3.cur, before);
  assert.ok(st3.lastShot.ev.some((e) => e.t === 'timeout'));
  ok('60 सेकंड में शॉट न मारने पर बारी बदल गई ("timeout" घटना)');

  // निष्क्रियता
  clock += 130000;
  await C('GET', '/api/state', null, A.token); // सिर्फ़ A जीवित
  hub.tick();
  st3 = (await C('GET', '/api/state', null, A.token)).body;
  assert.strictEqual(st3.phase, 'ended');
  assert.strictEqual(st3.endedReason, 'idle');
  assert.strictEqual(names[st3.winner], 'Asha');
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual((await store.getUser(A.id)).wins, 1);
  assert.strictEqual((await store.getUser(B.id)).losses, 1);
  ok('एक खिलाड़ी 2 मिनट ग़ायब रहा तो दूसरा जीता, जीत-हार के आँकड़े लिखे गए');
  assert.strictEqual((await C('POST', '/api/rooms/leave', {}, A.token)).status, 200);
  assert.strictEqual((await C('POST', '/api/rooms/leave', {}, B.token)).status, 200);
  assert.strictEqual(hub.rooms.size, 0);
  ok('दोनों के बाहर आते ही कमरा साफ़ हो गया');

  // निजी (कोड वाला) कमरा
  const pr = (await C('POST', '/api/rooms', { type: 'private', rules: 'simple' }, D.token)).body;
  assert.strictEqual((await C('GET', '/api/rooms', null, A.token)).body.rooms.length, 0);
  assert.strictEqual((await C('POST', '/api/rooms/join', { code: '000000' }, A.token)).status, 404);
  const j = await C('POST', '/api/rooms/join', { code: pr.code }, A.token);
  assert.strictEqual(j.status, 200); assert.ok(j.body.started);
  const sp = (await C('GET', '/api/state', null, D.token)).body;
  assert.strictEqual(sp.phase, 'playing'); assert.strictEqual(sp.match25, false);
  ok('कोड वाला कमरा सूची में नहीं दिखता, कोड डालते ही सीधा मैच शुरू');
  // हार मानना
  assert.strictEqual((await C('POST', '/api/resign', {}, A.token)).status, 200);
  const se = (await C('GET', '/api/state', null, D.token)).body;
  assert.strictEqual(se.phase, 'ended'); assert.strictEqual(se.players[se.winner], 'हर्ष कुमार');
  ok('हार मानने पर विरोधी जीता');

  // कमरा बंद करने पर इंतज़ार वालों को सूचना
  const r2 = (await C('POST', '/api/rooms', { type: 'public' }, Cc.token)).body;
  await C('POST', '/api/rooms/join', { roomId: r2.roomId }, B.token);
  await C('POST', '/api/rooms/leave', {}, Cc.token);
  const sb = (await C('GET', '/api/state', null, B.token)).body;
  assert.strictEqual(sb.phase, 'none'); assert.strictEqual(sb.notice, 'roomClosed');
  ok('कमरा बंद होने पर इंतज़ार वाले को सूचना मिली');

  // 15 मिनट पुराना कमरा
  const r3 = (await C('POST', '/api/rooms', { type: 'public' }, Cc.token)).body;
  clock += 16 * 60000; hub.tick();
  assert.strictEqual((await C('GET', '/api/rooms', null, B.token)).body.rooms.length, 0);
  ok('15 मिनट पुराना खुला कमरा अपने आप बंद');

  // 9 पूरे मैच बेतरतीब शॉट से, कोई गड़बड़ न हो
  const Rules = require('../rules.js').Rules; const { World } = require('../engine.js');
  let boards = 0, matches = 0, shots = 0;
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let g = 0; g < 6; g++) {
    const w = new World(), rl = new Rules(true);
    for (let i = 0; i < 3000 && !rl.matchOver; i++) {
      // जानबूझकर अच्छा निशाना: सबसे नज़दीकी गोटी की ओर
      const cand = w.coins.filter((c) => c.alive && c.type !== 3);
      const t = cand[Math.floor(rnd() * cand.length)];
      const sx = 150 + Math.floor(rnd() * 15) * 50;
      let ang = Math.atan2(t.x - sx, 850 - t.y) * 180 / Math.PI;
      ang = Math.max(-75, Math.min(75, ang));
      w.placeStriker(sx); w.shoot(ang, 6 + Math.floor(rnd() * 4));
      const res = w.runShot(); w.placeStriker(500);
      rl.process(w, res.pocketed, res.foul); shots++;
      if (rl.boardOver) { boards++; if (!rl.matchOver) rl.nextBoard(w); }
      for (const c of w.coins) assert.ok(!isNaN(c.x) && c.x >= 0 && c.x <= 1000);
    }
    if (rl.matchOver) matches++;
  }
  ok(`नियम-इंजन पर ${shots} शॉट, ${boards} बोर्ड ख़त्म, ${matches} पूरे मैच, कोई गड़बड़ नहीं`);

  console.log('\nसारी जाँचें पास');
  server.close();
  process.exit(0);
})().catch((e) => { console.error('फ़ेल:', e); process.exit(1); });

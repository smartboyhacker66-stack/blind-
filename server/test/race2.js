'use strict';
const assert = require('assert');
const { Race, VEHICLES, LENGTHS } = require('../race.js');
let n = 0; const ok = (m) => console.log(`${++n} ठीक: ${m}`);
const U = (id) => ({ id, name: 'P' + id });

// 1) तीन खिलाड़ी: तीसरे के जुड़ते ही गिनती; सबकी स्थिति और क्रम
let R = new Race(() => 0);
const code = R.create(U('a'), { max: 3, vehicle: 'car_sport', length: 1000 }).code;
assert.strictEqual(R.state('a', 0).status, 'waiting');
assert.ok(R.join(U('b'), code, 'bike_nimble').code);
assert.strictEqual(R.state('a', 0).status, 'waiting');      // 3 की जगह में अभी 2
assert.ok(R.join(U('c'), code, 'car_heavy').code);
assert.strictEqual(R.join(U('d'), code).error, 'not_found');  // शुरू होने के बाद या भरा हुआ
let st = R.state('a', 1000); assert.strictEqual(st.status, 'countdown'); assert.strictEqual(st.others.length, 2);
assert.strictEqual(st.length, 1000);
['a', 'b', 'c'].forEach((id) => R.input(id, { gas: true }, 6000));
let t = 6000, fin;
for (let i = 0; i < 300; i++) { t += 1000; fin = R.state('a', t); if (fin.status === 'done') break; }
assert.strictEqual(fin.status, 'done'); assert.strictEqual(fin.results.length, 3);
assert.ok(fin.results[0].finished); assert.ok(fin.rank >= 1 && fin.rank <= 3);
ok('तीन खिलाड़ी, 1000 मीटर, गिनती, क्रम और नतीजे');

// 2) गाड़ियों की खासियत अलग: स्पोर्ट कार ज़्यादा तेज़, भारी कार धीमी पर ब्रेक अच्छा
R = new Race(() => 0);
const c2 = R.create(U('x'), { vehicle: 'car_sport', length: 3000 }).code; R.join(U('y'), c2, 'car_heavy');
R.state('x', 6000); R.input('x', { gas: true }, 6000); R.input('y', { gas: true }, 6000);
const s2 = R.state('x', 40000);
assert.ok(s2.you.kmh > s2.opp.kmh, `स्पोर्ट ${s2.you.kmh} > भारी ${s2.opp.kmh}`);
assert.ok(VEHICLES.car_heavy.brake > VEHICLES.car_sport.brake && VEHICLES.car_sport.vmax > VEHICLES.car_heavy.vmax);
assert.strictEqual(Object.keys(VEHICLES).length, 6);
ok('हर गाड़ी की अपनी रफ़्तार, पकड़ और ब्रेक');

// 3) खुली लॉबी: सिर्फ़ इंतज़ार वाले कमरे दिखें; भरने पर हट जाएँ
R = new Race(() => 0);
const l1 = R.create(U('h1'), { vehicle: 'bike_cruiser' }).code;
const l2 = R.create(U('h2'), { max: 3, length: 500 }).code;
let lob = R.lobby(); assert.strictEqual(lob.length, 2);
assert.ok(lob.find((r) => r.code === l2 && r.max === 3 && r.length === 500));
R.join(U('g1'), l1, 'bike_sprint');       // l1 भर गया (2/2), शुरू
lob = R.lobby(); assert.deepStrictEqual(lob.map((r) => r.code), [l2]);
R.leave('h2'); assert.strictEqual(R.lobby().length, 0);   // मेज़बान गया तो कमरा बंद
ok('खुली लॉबी: खुले कमरे दिखे, भरे या बंद कमरे हटे');

// 4) मेज़बान "अभी शुरू करें" (3 की जगह 2 आने पर)
R = new Race(() => 0);
const c4 = R.create(U('m'), { max: 3 }).code;
assert.strictEqual(R.start('m').error, 'not_ready');
R.join(U('n'), c4);
assert.strictEqual(R.start('n').error, 'not_host');
assert.strictEqual(R.start('m').ok, true);
assert.strictEqual(R.state('m', 100).status, 'countdown');
ok('मेज़बान ही शुरू कर सकता है, कम से कम दो खिलाड़ी चाहिए');

// 5) बीच में एक छोड़े तो बाक़ी दो चलते रहें; दो छोड़ें तो आख़िरी जीतता है
R = new Race(() => 0);
const c5 = R.create(U('p'), { max: 3 }).code; R.join(U('q'), c5); R.join(U('r'), c5);
R.state('p', 6000); R.leave('q');
assert.notStrictEqual(R.state('p', 6100).status, 'done');
R.leave('r');
assert.strictEqual(R.state('p', 6200).status, 'done'); assert.strictEqual(R.state('p', 6200).winner, 'you');
ok('बीच में छोड़ने पर रेस जारी, और आख़िरी बचा खिलाड़ी जीतता है');

// 6) दूरी के विकल्प
assert.deepStrictEqual(LENGTHS, [500, 1000, 1500, 3000]);
R = new Race(() => 0); const c6 = R.create(U('z'), { length: 777 }).code;
assert.strictEqual(R.state('z', 0).length, 1500);   // ग़लत दूरी पर डिफ़ॉल्ट
ok('दूरी 500, 1000, 1500, 3000; ग़लत मान पर 1500');
console.log('\nसारी रेस जाँचें पास');

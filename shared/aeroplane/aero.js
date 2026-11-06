'use strict';
// Aeroplane Simulator v4. Flight, landing and every sound are generated with the Web Audio API (no audio files).
// New: pre-take-off and landing checklists, touch gesture pad, ATC phonetics and read-backs, transponder,
// graded alarms, uploaded route maps, and speech-aware audio ducking (see ../common/hubaudio.js).
(function () {
  const q = new URLSearchParams(location.search);
  const HI = q.get('lang') === 'hi';
  const tr = (hi, en) => (HI ? hi : en);
  const A = HubAudio.create({ hi: HI, sound: q.get('sound') !== '0', voice: q.get('voice') !== '0' });
  const TITLE = tr('हवाई जहाज़ सिम्युलेटर', 'Aeroplane Simulator');
  document.documentElement.lang = HI ? 'hi' : 'en';
  document.getElementById('title').textContent = TITLE;
  document.title = TITLE;

  // ---------- route map (uploaded from Settings, or the standard route) ----------
  const parsedRoute = window.RouteMap ? RouteMap.parse(q.get('route') || '') : { ok: false };
  const ROUTE = parsedRoute.ok ? parsedRoute.map : { name: '', destinationNm: 6, cruiseFt: 3000, waypoints: [] };
  const CRUISE_FT = ROUTE.cruiseFt, DEST_NM = ROUTE.destinationNm, RUNWAY_NM = 1, ROT_KT = 60;
  const routeName = () => (parsedRoute.ok ? ROUTE.name : tr('मानक रूट', 'Standard route'));

  // ---------- phonetics ----------
  const NATO = { A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliet', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu' };
  const DIG = ['zero', 'one', 'two', 'tree', 'four', 'fife', 'six', 'seven', 'eight', 'niner'];
  const phon = (s) => String(s).toUpperCase().split('').map((c) => NATO[c] || (/[0-9]/.test(c) ? DIG[+c] : c)).join(' ');
  const spellName = (n) => (/^[A-Z0-9]{2,5}$/.test(n) ? phon(n) : n);
  const rnd = (n) => Math.floor(Math.random() * n);

  // ---------- speech ----------
  const say = (text, flush = true) => A.say(text, flush);
  const csSay = () => `Hub ${phon(S.cs.l)} ${DIG[S.cs.d]}`;
  const csShow = () => `Hub ${S.cs.l}${S.cs.d}`;
  function atcSay(hi, en, flush = false) { fx.atc(); A.say(tr(hi, en), flush, true); }

  // ---------- sound effects (all through the shared limiter bus) ----------
  const eng = {};
  let roll = null;
  function initAudio() {
    if (!A.init()) return;
    if (eng.gain) return;
    const ac = A.ac;
    eng.gain = ac.createGain(); eng.gain.gain.value = 0;
    eng.filter = ac.createBiquadFilter(); eng.filter.type = 'lowpass'; eng.filter.frequency.value = 400;
    eng.oscs = [0, 7, -9].map((det) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 50; o.detune.value = det; o.connect(eng.filter); o.start(); return o; });
    eng.filter.connect(eng.gain); eng.gain.connect(A.out);
    eng.wind = ac.createGain(); eng.wind.gain.value = 0;
    const ns = ac.createBufferSource(); ns.buffer = A.noiseBuf; ns.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    ns.connect(bp); bp.connect(eng.wind); eng.wind.connect(A.out); ns.start();
    roll = { src: ac.createBufferSource(), bp: ac.createBiquadFilter(), g: ac.createGain() };
    roll.src.buffer = A.noiseBuf; roll.src.loop = true;
    roll.bp.type = 'lowpass'; roll.bp.frequency.value = 260; roll.bp.Q.value = 0.7; roll.g.gain.value = 0;
    roll.src.connect(roll.bp); roll.bp.connect(roll.g); roll.g.connect(A.out); roll.src.start();
  }
  const tone = (f, ms, v, t, p, d) => A.tone(f, ms, v, t, p, d);
  const burst = (ms, f, qv, v, t) => A.burst(ms, f, qv, v, t);
  function thump() { tone(110, 420, 0.8); tone(55, 500, 0.6); burst(320, 140, 0.6, 0.9, 'lowpass'); }
  const fx = {
    gear() { burst(250, 200, 1, 0.8); tone(70, 300, 0.6); tone(55, 200, 0.6, 'sine', 0, 0.45); burst(180, 300, 1, 0.7); },
    flaps() { tone(120, 800, 0.12, 'sawtooth'); tone(125, 800, 0.08, 'sawtooth'); },
    chime() { tone(880, 180, 0.25); tone(1320, 260, 0.25, 'sine', 0, 0.18); },
    stall() { tone(1200, 120, 0.3, 'square'); tone(1200, 120, 0.3, 'square', 0, 0.25); },
    touch() { tone(60, 350, 0.8); burst(300, 150, 0.7, 0.8, 'lowpass'); },
    crash() { burst(1500, 120, 0.5, 0.9, 'lowpass'); tone(40, 1200, 0.7, 'sawtooth'); },
    squeal() { burst(500, 2500, 6, 0.3); },
    atc() { burst(120, 2000, 2, 0.4, 'highpass'); tone(1000, 80, 0.2, 'sine', 0, 0.14); tone(1300, 80, 0.2, 'sine', 0, 0.26); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 260, 0.3, 'triangle', 0, i * 0.2)); },
    warn() { tone(500, 200, 0.3, 'square'); },
    caution() { tone(660, 140, 0.25, 'triangle'); },
    warning() { tone(880, 120, 0.3, 'square'); tone(660, 120, 0.3, 'square', 0, 0.16); },
    pullup() { tone(1500, 90, 0.3, 'square'); tone(1100, 90, 0.3, 'square', 0, 0.12); tone(1500, 90, 0.3, 'square', 0, 0.24); },
    over() { tone(1400, 70, 0.25, 'sawtooth'); tone(1400, 70, 0.25, 'sawtooth', 0, 0.12); },
    clear() { tone(740, 90, 0.18, 'sine'); tone(988, 120, 0.18, 'sine', 0, 0.09); },
    click() { tone(1800, 25, 0.18, 'square'); },
    ident() { tone(1200, 60, 0.2); tone(1200, 60, 0.2, 'sine', 0, 0.12); tone(1200, 60, 0.2, 'sine', 0, 0.24); },
    ok() { tone(1046, 70, 0.2, 'triangle'); },
  };
  const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) { /* ignore */ } };

  // ---------- flight state ----------
  const S = {};
  function reset() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[rnd(26)] + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[rnd(26)];
    const code = [2 + rnd(4), rnd(8), rnd(8), rnd(8)].join('');
    const rwT = ['09', '27', '18', '36', '04', '22'][rnd(6)];
    Object.assign(S, { phase: 'ground', throttle: 0, speed: 0, alt: 0, pitch: 0, bank: 0, heading: 0, dev: 0, dist: 0, flaps: 0, gear: true, brake: false,
      vs: 0, airborne: false, cruiseTold: false, descentTold: false, finalTold: false, nmTold: 0, wind: 0, score: 100, notes: [], touched: false, t: 0,
      alignBeep: 0, squealT: 0, over: false, rwWarn1: false, rwWarn2: false, landTold: null, beepT: 0,
      cs: { l: letters, d: 1 + rnd(9) }, assigned: code, rwT, rwL: ['09', '27', '18', '36', '04', '22'].filter((r) => r !== rwT)[rnd(5)],
      wd: String(10 * (1 + rnd(36))).padStart(3, '0'), wk: 3 + rnd(10),
      xp: { mode: 'stby', code: [1, 2, 0, 0], entry: null }, radar: false, cleared: false, pendingRB: null, rbTold: false,
      ck: null, ck4land: false, ckDone: { takeoff: false, landing: false }, pen: {}, al: {}, wpTold: {} });
  }
  reset();

  const stallSpeed = () => (S.flaps === 2 ? 45 : S.flaps === 1 ? 50 : 55);
  const fmtNm = (x) => (Math.round(x * 10) / 10).toString();
  const xpCode = () => S.xp.code.join('');
  const spkDigits = (s) => String(s).split('').map((c) => DIG[+c]).join(' ');
  const xmName = (m) => ({ off: tr('बंद', 'off'), stby: tr('स्टैंडबाय', 'standby'), on: tr('चालू', 'on') })[m];

  function statusText() {
    const lim = S.dist < DEST_NM - 0.01 ? tr(`गंतव्य तक ${fmtNm(DEST_NM - S.dist)} समुद्री मील`, `${fmtNm(DEST_NM - S.dist)} nautical miles to the runway`) : tr('गंतव्य रनवे पर', 'on the destination runway');
    const al = activeAlarms();
    return tr(
      `${S.airborne ? 'हवा में' : 'ज़मीन पर'}. गति ${Math.round(S.speed)} नॉट, ऊँचाई ${Math.round(S.alt)} फ़ीट, चढ़ने की दर ${Math.round(S.vs)} फ़ीट प्रति मिनट, थ्रॉटल ${S.throttle} प्रतिशत, नाक ${S.pitch} डिग्री, झुकाव ${S.bank} डिग्री, पहिये ${S.gear ? 'नीचे' : 'ऊपर'}, फ़्लैप ${S.flaps}, ब्रेक ${S.brake ? 'लगा' : 'छूटा'}. ${lim}. रनवे की रेखा से ${Math.abs(Math.round(S.dev))} मीटर ${S.dev < 0 ? 'बाएँ' : 'दाएँ'}. ट्रांसपोंडर ${xmName(S.xp.mode)}, स्क्वॉक ${spkDigits(xpCode())}. ${al.length ? 'अलार्म: ' + al.map((a) => a.hiName).join(', ') + '.' : 'कोई अलार्म नहीं.'}`,
      `${S.airborne ? 'Airborne' : 'On the ground'}. Speed ${Math.round(S.speed)} knots, altitude ${Math.round(S.alt)} feet, vertical speed ${Math.round(S.vs)} feet per minute, throttle ${S.throttle} percent, pitch ${S.pitch} degrees, bank ${S.bank} degrees, gear ${S.gear ? 'down' : 'up'}, flaps ${S.flaps}, brake ${S.brake ? 'on' : 'off'}. ${lim}. ${Math.abs(Math.round(S.dev))} metres ${S.dev < 0 ? 'left' : 'right'} of the centre line. Transponder ${xmName(S.xp.mode)}, squawk ${spkDigits(xpCode())}. ${al.length ? 'Alarms: ' + al.map((a) => a.enName).join(', ') + '.' : 'No alarms.'}`);
  }

  function crash(why) {
    if (S.over) return; S.over = true; S.phase = 'crashed'; S.speed = 0; fx.crash(); setThrottleSound();
    say(tr('दुर्घटना! ', 'Crash! ') + why + ' ' + tr('उड़ान विफल. फिर से कोशिश कीजिए.', 'Flight failed. Please try again.'));
    showEnd();
  }
  function finish(good) {
    if (S.over) return; S.over = true; S.phase = 'done'; setThrottleSound();
    const sc = Math.max(0, Math.round(S.score));
    if (good) fx.win();
    say(tr(`गाड़ी रुक गई. उड़ान पूरी! स्कोर ${sc} में से सौ. `, `The aircraft has stopped. Flight complete! Score ${sc} out of one hundred. `) + S.notes.join(' '));
    showEnd();
  }
  function penalty(n, hi, en) { S.score -= n; S.notes.push(tr(hi, en)); }
  function penaltyOnce(key, n, hi, en) { if (!S.pen[key]) { S.pen[key] = true; penalty(n, hi, en); } }

  // ---------- checklists ----------
  const CKS = {
    takeoff: () => ({
      title: tr('टेक-ऑफ़ से पहले की चेकलिस्ट', 'Before take-off checklist'),
      items: [
        { ch: tr('पार्किंग ब्रेक', 'Parking brake'), rs: tr('लगा है', 'Set'), ok: () => S.brake, bad: () => tr('ब्रेक बटन दबाकर ब्रेक लगाइए.', 'Press the brake control to set the brake.') },
        { ch: tr('फ़्लैप', 'Flaps'), rs: tr('एक पर', 'Set to one'), ok: () => S.flaps === 1, bad: () => tr(`फ़्लैप ${S.flaps} पर हैं. फ़्लैप बदलकर एक कीजिए.`, `Flaps are at ${S.flaps}. Change flaps until they read one.`) },
        { ch: tr('ट्रांसपोंडर', 'Transponder'), rs: tr('चालू, दिया हुआ कोड', 'On, assigned code'), ok: () => S.xp.mode === 'on' && xpCode() === S.assigned, bad: () => tr(`ट्रांसपोंडर चालू कीजिए और स्क्वॉक ${spkDigits(S.assigned)} लगाइए.`, `Set the transponder to on and squawk ${spkDigits(S.assigned)}.`) },
        { ch: tr('पहिये', 'Landing gear'), rs: tr('नीचे और लॉक', 'Down and locked'), ok: () => S.gear, bad: () => tr('पहिये नीचे कीजिए.', 'Lower the landing gear.') },
        { ch: tr('कमान', 'Flight controls'), rs: tr('सीधे और बीच में', 'Wings level, nose neutral'), ok: () => S.bank === 0 && S.pitch === 0, bad: () => tr('पंख सीधे और नाक शून्य डिग्री पर कीजिए.', 'Level the wings and set the nose to zero degrees.') },
        { ch: tr('थ्रॉटल', 'Throttle'), rs: tr('बंद', 'Idle'), ok: () => S.throttle === 0, bad: () => tr('थ्रॉटल शून्य कीजिए.', 'Close the throttle to zero.') },
        { ch: tr('पार्किंग ब्रेक', 'Parking brake'), rs: tr('छूटा', 'Released'), ok: () => !S.brake, bad: () => tr('ब्रेक छोड़िए.', 'Release the brake.') },
      ],
    }),
    landing: () => ({
      title: tr('लैंडिंग से पहले की चेकलिस्ट', 'Before landing checklist'),
      items: [
        { ch: tr('पहिये', 'Landing gear'), rs: tr('नीचे और लॉक', 'Down and locked'), ok: () => S.gear, bad: () => tr('पहिये नीचे कीजिए.', 'Lower the landing gear.') },
        { ch: tr('फ़्लैप', 'Flaps'), rs: tr('दो पर', 'Set to two'), ok: () => S.flaps === 2, bad: () => tr(`फ़्लैप ${S.flaps} पर हैं. दो कीजिए.`, `Flaps are at ${S.flaps}. Set two.`) },
        { ch: tr('गति', 'Speed'), rs: tr('नब्बे नॉट से कम', 'Below ninety knots'), ok: () => S.speed < 90, bad: () => tr(`गति ${Math.round(S.speed)} नॉट है. थ्रॉटल घटाइए.`, `Speed is ${Math.round(S.speed)} knots. Reduce power.`) },
        { ch: tr('ट्रांसपोंडर', 'Transponder'), rs: tr('चालू', 'On'), ok: () => S.xp.mode === 'on', bad: () => tr('ट्रांसपोंडर चालू कीजिए.', 'Switch the transponder on.') },
        { ch: tr('पंख', 'Wings'), rs: tr('लगभग सीधे', 'Nearly level'), ok: () => Math.abs(S.bank) <= 5, bad: () => tr('पंख सीधे कीजिए.', 'Level the wings.') },
      ],
    }),
  };
  function ckStart(name) {
    const c = CKS[name]();
    S.ck = { name, c, i: 0 };
    say(tr(`${c.title}. ${c.items.length} चीज़ें. सुनने के लिए C, जाँचकर पक्का करने के लिए V दबाइए.`, `${c.title}. ${c.items.length} items. Press C to hear an item, V to check it.`), false);
    ckRead(false);
  }
  function ckRead(flush = true) {
    const k = S.ck;
    if (!k) { say(tr('कोई चेकलिस्ट चालू नहीं है.', 'No checklist is active.')); return; }
    if (k.i >= k.c.items.length) { say(tr('चेकलिस्ट पूरी हो चुकी है.', 'The checklist is complete.')); return; }
    const it = k.c.items[k.i];
    say(tr(`${k.i + 1} में से ${k.c.items.length}: ${it.ch}. पक्का करने के लिए V.`, `${k.i + 1} of ${k.c.items.length}: ${it.ch}. Press V to check.`), flush);
  }
  function ckConfirm() {
    const k = S.ck;
    if (!k || k.i >= k.c.items.length) { say(tr('जाँचने के लिए कोई चीज़ नहीं बची.', 'Nothing left to check.')); return; }
    const it = k.c.items[k.i];
    if (!it.ok()) { fx.warn(); say(tr(`${it.ch}: तैयार नहीं. ${it.bad()}`, `${it.ch}: not ready. ${it.bad()}`)); return; }
    fx.ok(); k.i++;
    if (k.i < k.c.items.length) { say(tr(`${it.ch}, ${it.rs}. जाँच पूरी.`, `${it.ch}, ${it.rs}. Checked.`)); ckRead(false); return; }
    say(tr(`${it.ch}, ${it.rs}. जाँच पूरी. ${k.c.title} पूरी हुई.`, `${it.ch}, ${it.rs}. Checked. ${k.c.title} complete.`));
    S.ckDone[k.name] = true;
    if (k.name === 'takeoff') grantTakeoff();
  }
  function grantTakeoff() {
    S.cleared = true;
    S.pendingRB = { hi: `रनवे ${spkDigits(S.rwT)} पर टेक-ऑफ़ की अनुमति, ${csSay()}.`, en: `Cleared for take-off runway ${spkDigits(S.rwT)}, ${csSay()}.` };
    atcSay(`${csSay()}, हब टावर. हवा ${spkDigits(S.wd)} डिग्री से ${S.wk} नॉट. रनवे ${spkDigits(S.rwT)}, टेक-ऑफ़ की अनुमति है. दोहराने के लिए K दबाइए.`,
      `${csSay()}, Hub Tower. Wind ${spkDigits(S.wd)} degrees at ${S.wk} knots. Runway ${spkDigits(S.rwT)}, cleared for take-off. Press K to read back.`);
  }
  function readback() {
    if (!S.pendingRB) { say(tr('दोहराने के लिए कोई अनुमति नहीं है.', 'There is no clearance to read back.')); return; }
    const rb = S.pendingRB; S.pendingRB = null; S.rbTold = true;
    say(tr(rb.hi, rb.en), true);
    setTimeout(() => { if (!S.over) atcSay(`${csSay()}, रीडबैक सही है.`, `${csSay()}, readback correct.`); }, 1800);
  }

  // ---------- transponder ----------
  const XM = ['off', 'stby', 'on'];
  let xpBtns = [];
  function xpRefresh() { xpBtns.forEach((b, i) => { b.textContent = tr(`स्क्वॉक अंक ${i + 1}: ${S.xp.code[i]}. बढ़ाने के लिए दबाइए`, `Squawk digit ${i + 1}: ${S.xp.code[i]}. Press to increase`); }); }
  function xpSet(code) {
    S.xp.code = String(code).split('').map(Number); xpRefresh(); fx.click();
    const c = xpCode();
    say(tr(`स्क्वॉक ${spkDigits(c)}.`, `Squawk ${spkDigits(c)}.`));
    if (c === '7700') atcSay(`${csSay()}, समझ गया, मेडे. अपना इरादा बताइए.`, `${csSay()}, roger, squawking seven seven zero zero. State your intentions.`);
    else if (c === '7600') atcSay(`${csSay()}, रेडियो ख़राबी की सूचना मिली.`, `${csSay()}, roger, radio failure noted.`);
  }
  const xpDigit = (i) => { S.xp.code[i] = (S.xp.code[i] + 1) % 8; xpRefresh(); fx.click(); say(tr(`अंक ${i + 1}: ${S.xp.code[i]}. स्क्वॉक ${spkDigits(xpCode())}`, `Digit ${i + 1}: ${S.xp.code[i]}. Squawk ${spkDigits(xpCode())}`)); };
  function xpMode() { S.xp.mode = XM[(XM.indexOf(S.xp.mode) + 1) % 3]; fx.click(); say(tr(`ट्रांसपोंडर ${xmName(S.xp.mode)}.`, `Transponder ${xmName(S.xp.mode)}.`)); }
  function ident() {
    if (S.xp.mode !== 'on') { fx.warn(); say(tr('आइडेंट के लिए ट्रांसपोंडर चालू होना चाहिए.', 'The transponder must be on to ident.')); return; }
    fx.ident();
    const c = xpCode();
    if (c === S.assigned) {
      if (S.airborne && !S.radar) { S.radar = true; setTimeout(() => { if (!S.over) atcSay(`${csSay()}, रडार संपर्क हो गया. चढ़ते रहिए.`, `${csSay()}, radar contact. Continue climb.`); }, 900); }
      else setTimeout(() => { if (!S.over) atcSay(`${csSay()}, आइडेंट मिला.`, `${csSay()}, ident received.`); }, 900);
    } else if (c !== '7700' && c !== '7600') {
      setTimeout(() => { if (!S.over) atcSay(`${csSay()}, आपका स्क्वॉक ${spkDigits(c)} मेल नहीं खाता. स्क्वॉक ${spkDigits(S.assigned)} लगाइए.`, `${csSay()}, your squawk ${spkDigits(c)} does not match. Squawk ${spkDigits(S.assigned)}.`); }, 900);
    }
  }
  function xpStartEntry() { S.xp.entry = []; fx.click(); say(tr('स्क्वॉक भरना शुरू. शून्य से सात तक चार अंक दबाइए.', 'Squawk entry. Type four digits, zero to seven.')); }

  // ---------- alarms ----------
  const ALARMS = [
    { id: 'stall', lvl: 3, hiName: 'स्टॉल', enName: 'stall', every: 0.6, snd: () => fx.stall(), when: () => S.airborne && S.speed < stallSpeed(), hi: 'स्टॉल! नाक नीचे कीजिए और थ्रॉटल बढ़ाइए.', en: 'Stall! Lower the nose and add power.' },
    { id: 'pullup', lvl: 3, hiName: 'तेज़ उतराई', enName: 'sink rate', every: 0.7, snd: () => fx.pullup(), when: () => S.airborne && S.alt > 0 && S.alt < 500 && S.vs < -700, hi: 'बहुत तेज़ी से नीचे आ रहे हैं! नाक ऊपर कीजिए और थ्रॉटल बढ़ाइए.', en: 'Sink rate! Raise the nose and add power.' },
    { id: 'over', lvl: 2, hiName: 'ज़्यादा गति', enName: 'overspeed', every: 0.8, snd: () => fx.over(), when: () => S.airborne && S.speed > (S.flaps > 0 ? 110 : S.gear ? 120 : 135), hi: 'गति बहुत ज़्यादा! थ्रॉटल घटाइए, पहिये या फ़्लैप समेटिए.', en: 'Overspeed! Reduce power, or raise the gear or flaps.' },
    { id: 'gear', lvl: 2, hiName: 'पहिये ऊपर', enName: 'gear up', every: 1.2, snd: () => fx.warning(), when: (left) => S.airborne && !S.gear && S.alt < 300 && left < 2.5 && left > 0, hi: 'पहिये नीचे नहीं हैं! अभी नीचे कीजिए.', en: 'Gear is not down! Lower it now.' },
    { id: 'stallwarn', lvl: 1, hiName: 'कम गति', enName: 'low speed', every: 1, snd: () => fx.warn(), when: () => S.airborne && S.speed >= stallSpeed() && S.speed < stallSpeed() + 8, hi: 'गति कम है.', en: 'Speed low.' },
    { id: 'bank', lvl: 1, hiName: 'ज़्यादा झुकाव', enName: 'bank angle', every: 2, snd: () => fx.caution(), when: () => S.airborne && Math.abs(S.bank) >= 25, hi: 'झुकाव बहुत ज़्यादा. पंख सीधे कीजिए.', en: 'Bank angle. Level the wings.' },
    { id: 'xpdr', lvl: 1, hiName: 'ट्रांसपोंडर', enName: 'transponder', every: 3, snd: () => fx.caution(), when: () => S.airborne && S.alt >= 500 && S.xp.mode !== 'on' && xpCode() !== '7700' && xpCode() !== '7600', hi: 'ट्रांसपोंडर चालू नहीं है.', en: 'Transponder is not on.' },
  ];
  const activeAlarms = () => ALARMS.filter((a) => S.al[a.id] && S.al[a.id].on);
  function updateAlarms(dt) {
    const left = DEST_NM - S.dist;
    for (const a of ALARMS) {
      const st = S.al[a.id] || (S.al[a.id] = { on: false, t: 0, said: 0 });
      if (a.when(left)) {
        if (!st.on) { st.on = true; st.t = 0; st.said = 0; }
        st.t -= dt; st.said -= dt;
        if (st.t <= 0) { st.t = a.every; a.snd(); }
        if (st.said <= 0) { st.said = a.lvl >= 3 ? 6 : 12; say(tr(a.hi, a.en), a.lvl >= 3); }
      } else if (st.on) { st.on = false; if (a.lvl >= 2) fx.clear(); }
    }
  }

  // ---------- flight model ----------
  function step(dt) {
    if (S.over || S.phase === 'menu') return;
    S.t += dt;
    const flapDrag = 1 + 0.12 * S.flaps, gearDrag = S.gear ? 1.2 : 1;
    const k = 0.000595 * flapDrag * gearDrag;
    let dv = S.throttle * 0.12 - k * S.speed * S.speed - S.pitch * 0.4;
    if (!S.airborne) { dv -= 0.4; if (S.brake) dv -= 7; }
    S.speed = Math.max(0, S.speed + dv * dt);
    if (!S.airborne && S.throttle === 0 && !S.brake && S.speed < 1) S.speed = 0;
    S.wind += (Math.random() - 0.5) * 0.4 * dt; S.wind = Math.max(-0.6, Math.min(0.6, S.wind));
    S.dist += S.speed / 3600 * dt;
    S.heading += S.bank * 0.5 * dt * (S.airborne ? 1 : 0);
    S.dev += (Math.sin(S.heading * Math.PI / 180) * S.speed * 0.514 + S.wind) * dt;
    if (!S.airborne) {
      if (S.speed > 8 && !S.cleared && !S.pen.unauth) {
        penaltyOnce('unauth', 10, 'अनुमति के बिना दौड़ शुरू की.', 'Started rolling without take-off clearance.');
        fx.warning(); atcSay(`${csSay()}, रुकिए! आपको टेक-ऑफ़ की अनुमति नहीं मिली. चेकलिस्ट पूरी कीजिए.`, `${csSay()}, hold position! You are not cleared for take-off. Complete the checklist.`, true);
      }
      if (S.speed >= ROT_KT && S.pitch > 0 && S.gear) {
        S.airborne = true; S.phase = 'flight';
        if (!S.ckDone.takeoff) penaltyOnce('ck1', 10, 'टेक-ऑफ़ चेकलिस्ट पूरी नहीं की.', 'Took off without completing the checklist.');
        if (S.pendingRB) penaltyOnce('rb', 5, 'अनुमति दोहराई नहीं.', 'Clearance was not read back.');
        say(tr('जहाज़ ज़मीन छोड़ चुका है. पहिये ऊपर कीजिए.', 'Airborne. Raise the landing gear.'));
        atcSay(`${csSay()}, हब टावर, उड़ान देखी. डिपार्चर से संपर्क कीजिए, स्क्वॉक आइडेंट.`, `${csSay()}, Hub Tower, airborne. Contact departure, squawk ident.`);
      }
      else if (S.dist > RUNWAY_NM - 0.12 && !S.rwWarn1) { S.rwWarn1 = true; fx.warn(); say(tr('रनवे का अंत पास है, थ्रॉटल पूरा दीजिए और नाक ऊपर कीजिए!', 'Runway end ahead! Full power and raise the nose now!')); }
      else if (S.dist > RUNWAY_NM - 0.04 && !S.rwWarn2) { S.rwWarn2 = true; fx.stall(); say(tr('आख़िरी मौक़ा! अभी उड़ान भरिए, नहीं तो रनवे ख़त्म हो जाएगा.', 'Last chance! Take off now or you will run out of runway.')); }
      else if (S.dist > RUNWAY_NM && S.dist < DEST_NM - 0.5) return crash(tr('रनवे ख़त्म हो गया, उड़ान भरने से पहले.', 'You ran out of runway before take-off.'));
      else if (S.dist > DEST_NM + RUNWAY_NM && S.dist >= DEST_NM) return crash(tr('लैंडिंग के बाद रनवे के आगे निकल गए.', 'You ran past the end of the runway.'));
      if (Math.abs(S.dev) > 45 && S.dist > 0.05) return crash(tr('रनवे से बाहर निकल गए.', 'You left the runway.'));
      if (S.touched && S.speed <= 0.5 && S.dist >= DEST_NM) { finish(true); return; }
      S.vs = 0;
    } else {
      if (S.speed < stallSpeed()) S.vs = -900;
      else S.vs = S.pitch * S.speed * 1.5;
      const prev = S.alt; S.alt += S.vs / 60 * dt;
      if (Math.floor(S.alt / 500) !== Math.floor(prev / 500) && S.alt > 400 && S.alt > 0) { fx.chime(); say(tr(`${Math.round(Math.floor(Math.max(S.alt, prev) / 500) * 500)} फ़ीट`, `${Math.round(Math.floor(Math.max(S.alt, prev) / 500) * 500)} feet`), false); }
      if (S.alt > 6000) { S.alt = 6000; if (S.vs > 0) S.vs = 0; }
      if (S.alt >= 500 && !S.radar && !S.pen.noident) { if (!S.pen.identWarn) { S.pen.identWarn = true; atcSay(`${csSay()}, स्क्वॉक आइडेंट कीजिए.`, `${csSay()}, squawk ident.`); } }
      if (S.alt >= 1000 && !S.radar) penaltyOnce('noident', 5, 'ट्रांसपोंडर आइडेंट नहीं किया.', 'Did not ident on the transponder.');
      if (S.alt >= CRUISE_FT - 100 && !S.cruiseTold) { S.cruiseTold = true; atcSay(`${csSay()}, क्रूज़ ऊँचाई ${CRUISE_FT} फ़ीट पहुँच गए. पहिये ऊपर रखिए और सीधा चलिए.`, `${csSay()}, cruise altitude ${CRUISE_FT} feet reached. Keep the gear up and fly straight.`); }
      ROUTE.waypoints.forEach((w, i) => {
        if (S.dist >= w.nm && !S.wpTold[i]) { S.wpTold[i] = true; fx.chime(); say(tr(`वेपॉइंट ${spellName(w.name)}. ${fmtNm(Math.max(0, DEST_NM - w.nm))} समुद्री मील बाक़ी.`, `Waypoint ${spellName(w.name)}. ${fmtNm(Math.max(0, DEST_NM - w.nm))} nautical miles to go.`), false); }
      });
      const left = DEST_NM - S.dist;
      if (Math.floor(S.dist) > S.nmTold && left > 0) { S.nmTold = Math.floor(S.dist); if (!ROUTE.waypoints.length) say(tr(`गंतव्य तक ${fmtNm(left)} समुद्री मील.`, `${fmtNm(left)} nautical miles to go.`), false); }
      if (left < 2.5 && !S.descentTold) { S.descentTold = true; atcSay(`${csSay()}, हब अप्रोच. उतरना शुरू कीजिए. थ्रॉटल घटाइए और नाक थोड़ी नीची कीजिए.`, `${csSay()}, Hub Approach. Begin your descent. Reduce power and lower the nose a little.`); }
      if (left < 2 && !S.ck4land) { S.ck4land = true; ckStart('landing'); }
      if (left < 1.2 && !S.finalTold) {
        S.finalTold = true;
        S.pendingRB = { hi: `रनवे ${spkDigits(S.rwL)} पर लैंडिंग की अनुमति, ${csSay()}.`, en: `Cleared to land runway ${spkDigits(S.rwL)}, ${csSay()}.` };
        atcSay(`${csSay()}, हब टावर. हवा ${spkDigits(S.wd)} डिग्री से ${S.wk} नॉट. रनवे ${spkDigits(S.rwL)}, लैंडिंग की अनुमति है. दोहराने के लिए K. फ़ाइनल: पहिये नीचे, फ़्लैप दो, गति नब्बे नॉट से कम. रनवे की रेखा की बीप सुनिए: जिस कान में बीप, उधर रनवे है.`,
          `${csSay()}, Hub Tower. Wind ${spkDigits(S.wd)} degrees at ${S.wk} knots. Runway ${spkDigits(S.rwL)}, cleared to land. Press K to read back. Final: gear down, flaps two, speed below ninety knots. Listen to the alignment beeps: the side the beep is on is where the runway is.`);
      }
      if (left < 2.5 && left > 0) {
        S.alignBeep -= dt;
        if (S.alignBeep <= 0) {
          const off = Math.abs(S.dev);
          S.alignBeep = off < 6 ? 0.9 : 0.5;
          if (off < 6) tone(1000, 80, 0.2); else tone(off > 40 ? 500 : 700, 100, 0.3, 'sine', Math.max(-1, Math.min(1, -S.dev / 60)));
        }
        if (!S.landTold) S.landTold = {};
        for (const h of [1000, 500, 200, 100, 50, 20, 10]) {
          if (S.alt <= h && !S.landTold[h]) {
            S.landTold[h] = true;
            if (h === 1000 && !S.gear) say(tr('एक हज़ार फ़ीट. पहिये अभी ऊपर हैं, पहिये नीचे कीजिए!', 'One thousand feet. Gear is still up, lower the gear now!'), false);
            else if (h === 1000) say(tr('एक हज़ार फ़ीट. फ़्लैप लगाइए और गति घटाइए.', 'One thousand feet. Set flaps and reduce speed.'), false);
            else say(tr(`${h} फ़ीट`, `${h} feet`), false);
          }
        }
      }
      if (S.alt <= 0) {
        S.alt = 0;
        const inZone = S.dist >= DEST_NM - 0.05 && S.dist <= DEST_NM + RUNWAY_NM - 0.1;
        if (!inZone) return crash(tr('रनवे से बाहर उतरे.', 'You landed away from the runway.'));
        if (!S.gear) return crash(tr('पहिये ऊपर थे.', 'The landing gear was up.'));
        if (S.vs < -700) return crash(tr('बहुत तेज़ी से नीचे उतरे.', 'You came down far too hard.'));
        if (Math.abs(S.dev) > 40) return crash(tr('रनवे की रेखा से बहुत दूर.', 'Too far from the centre line.'));
        if (Math.abs(S.bank) > 15) return crash(tr('पंख झुके हुए थे.', 'The wing was too low.'));
        if (S.speed > 110) return crash(tr('गति बहुत ज़्यादा थी.', 'You were going too fast.'));
        S.airborne = false; S.touched = true; S.phase = 'landed'; S.heading = 0; S.bank = 0; fx.touch();
        if (S.vs < -450) penalty(15, 'ज़ोर का टच-डाउन.', 'Hard touchdown.');
        if (S.speed > 90) penalty(10, 'गति थोड़ी ज़्यादा थी.', 'Speed was a little high.');
        if (Math.abs(S.dev) > 15) penalty(10, 'रेखा से हटकर उतरे.', 'Touched down off the centre line.');
        if (S.flaps < 1) penalty(5, 'फ़्लैप नहीं लगाए.', 'Flaps were not set.');
        if (!S.ckDone.landing) penalty(5, 'लैंडिंग चेकलिस्ट पूरी नहीं की.', 'Landing checklist was not completed.');
        thump();
        say(tr(`टच-डाउन! गति ${Math.round(S.speed)} नॉट. अब ब्रेक लगाइए और थ्रॉटल शून्य कीजिए.`, `Touchdown! Speed ${Math.round(S.speed)} knots. Now apply the brake and close the throttle.`));
      }
    }
    // speed beep: pitch rises and beeps quicken with speed
    if (A.soundOn && A.ac && !S.over && S.phase !== 'menu') {
      S.beepT -= dt;
      if (S.beepT <= 0) { S.beepT = Math.max(0.12, 1.1 - S.speed / 160); tone(380 + S.speed * 7, 55, 0.1, 'sine'); }
    }
    if (S.brake && S.speed > 20 && !S.airborne) { S.squealT -= dt; if (S.squealT <= 0) { S.squealT = 0.4; fx.squeal(); } }
    updateAlarms(dt);
    setThrottleSound();
  }

  function setThrottleSound() {
    if (!A.ac || !eng.gain) return;
    const t = A.ac.currentTime, on = !S.over, rpm = on ? S.throttle / 100 : 0;
    const air = S.airborne ? 1 : 0;
    if (roll) {
      const groundSpeed = !S.airborne && S.speed > 1 ? Math.min(1, S.speed / 150) : 0;
      roll.bp.frequency.setTargetAtTime(160 + groundSpeed * 340, t, 0.2);
      roll.g.gain.setTargetAtTime(on ? groundSpeed * (S.brake ? 0.4 : 0.28) : 0, t, 0.15);
    }
    eng.oscs.forEach((o) => o.frequency.setTargetAtTime((air ? 52 : 36) + rpm * (air ? 90 : 60), t, 0.2));
    eng.filter.frequency.setTargetAtTime((air ? 700 : 250) + rpm * (air ? 1400 : 700), t, 0.2);
    eng.gain.gain.setTargetAtTime(on ? (air ? 0.07 : 0.11) + rpm * 0.17 : 0, t, 0.2);
    eng.wind.gain.setTargetAtTime(on ? (air ? Math.min(0.3, 0.14 + S.speed / 430) : Math.min(0.14, S.speed / 700)) : 0, t, 0.3);
  }

  // ---------- controls ----------
  const box = document.getElementById('controls'), stat = document.getElementById('status');
  let timer = null, last = 0, statT = 0, pad = null;
  function btn(text, fn, parent) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.addEventListener('click', () => { initAudio(); fn(); });
    (parent || box).append(b); return b;
  }
  let gid = 0;
  function group(label, parent) {
    const sec = document.createElement('section'), h = document.createElement('h2'), g = document.createElement('div');
    h.id = 'g' + (++gid); h.textContent = label; sec.setAttribute('role', 'group'); sec.setAttribute('aria-labelledby', h.id); g.className = 'grid';
    sec.append(h, g); (parent || box).append(sec); return g;
  }
  const guard = (fn) => () => { if (S.over || S.phase === 'menu') return; fn(); };
  const act = {
    throttleUp: guard(() => { S.throttle = Math.min(100, S.throttle + 10); say(tr(`थ्रॉटल ${S.throttle}`, `Throttle ${S.throttle}`)); setThrottleSound(); }),
    throttleDown: guard(() => { S.throttle = Math.max(0, S.throttle - 10); say(tr(`थ्रॉटल ${S.throttle}`, `Throttle ${S.throttle}`)); setThrottleSound(); }),
    pitchUp: guard(() => { S.pitch = Math.min(15, S.pitch + 2); say(tr(`नाक ऊपर ${S.pitch} डिग्री`, `Pitch ${S.pitch} degrees`)); }),
    pitchDown: guard(() => { S.pitch = Math.max(-10, S.pitch - 2); say(tr(`नाक ${S.pitch} डिग्री`, `Pitch ${S.pitch} degrees`)); }),
    bankLeft: guard(() => { S.bank = Math.max(-30, S.bank - 5); say(tr(`झुकाव ${S.bank}`, `Bank ${S.bank}`)); }),
    bankRight: guard(() => { S.bank = Math.min(30, S.bank + 5); say(tr(`झुकाव ${S.bank}`, `Bank ${S.bank}`)); }),
    level: guard(() => { S.bank = 0; say(tr('पंख सीधे.', 'Wings level.')); }),
    flaps: guard(() => { S.flaps = (S.flaps + 1) % 3; fx.flaps(); say(tr(`फ़्लैप ${S.flaps}`, `Flaps ${S.flaps}`)); }),
    gear: guard(() => { if (!S.airborne && S.speed > 5) { say(tr('चलते समय पहिये ऊपर नहीं हो सकते.', 'The gear cannot be raised while rolling.')); return; } S.gear = !S.gear; fx.gear(); say(S.gear ? tr('पहिये नीचे.', 'Gear down.') : tr('पहिये ऊपर.', 'Gear up.')); }),
    brake: guard(() => { S.brake = !S.brake; say(S.brake ? tr('ब्रेक लगा.', 'Brake on.') : tr('ब्रेक छूटा.', 'Brake released.')); }),
    status: () => { if (S.phase !== 'menu') say(statusText()); },
    repeat: () => say(A.lastSaid || tr('अभी कुछ नहीं कहा गया.', 'Nothing has been said yet.')),
    checkRead: guard(() => ckRead()),
    checkConfirm: guard(() => ckConfirm()),
    readback: guard(readback),
    xpMode: guard(xpMode),
    ident: guard(ident),
    xpEntry: guard(xpStartEntry),
    alarms: guard(() => { const al = activeAlarms(); say(al.length ? tr('सक्रिय अलार्म: ' + al.map((a) => a.hiName).join(', '), 'Active alarms: ' + al.map((a) => a.enName).join(', ')) : tr('कोई अलार्म सक्रिय नहीं.', 'No alarms are active.')); }),
    volUp: () => say(tr(`आवाज़ों का स्तर ${A.volStep(1)} प्रतिशत`, `Effects volume ${A.volStep(1)} percent`)),
    volDown: () => say(tr(`आवाज़ों का स्तर ${A.volStep(-1)} प्रतिशत`, `Effects volume ${A.volStep(-1)} percent`)),
    guide: () => say(tr(
      'कीबोर्ड: ऊपर और नीचे तीर नाक, बाएँ और दाएँ तीर झुकाव, प्लस और माइनस थ्रॉटल, F फ़्लैप, G पहिये, B ब्रेक, L पंख सीधे, S स्थिति, R दोहराएँ, C चेकलिस्ट सुनें, V चेकलिस्ट पक्की करें, K अनुमति दोहराएँ, T ट्रांसपोंडर मोड, I आइडेंट, X स्क्वॉक भरें, A अलार्म, खुली और बंद चौकोर कोष्ठक आवाज़ का स्तर. स्पर्श पैड पर: एक उँगली ऊपर नीचे थ्रॉटल, बाएँ दाएँ झुकाव. दो उँगली ऊपर नीचे नाक, बाएँ चेकलिस्ट सुनें, दाएँ पक्की करें. तीन उँगली ऊपर नीचे फ़्लैप, बाएँ ट्रांसपोंडर मोड, दाएँ आइडेंट. एक टैप स्थिति, दो बार टैप दोहराएँ, लंबा दबाना ब्रेक, दो उँगली टैप पंख सीधे, तीन उँगली टैप पहिये. स्क्रीन रीडर चालू हो तो पैड पर डबल टैप और होल्ड करके फिर स्वाइप कीजिए.',
      'Keyboard: up and down arrows pitch, left and right arrows bank, plus and minus throttle, F flaps, G gear, B brake, L wings level, S status, R repeat, C hear checklist item, V check the item, K read back clearance, T transponder mode, I ident, X enter squawk, A alarms, left and right square brackets effects volume. On the touch pad: one finger up or down is throttle, left or right is bank. Two fingers up or down is pitch, left reads the checklist, right checks the item. Three fingers up or down is flaps, left is transponder mode, right is ident. Single tap is status, double tap repeats, press and hold is brake, two finger tap levels the wings, three finger tap is gear. With a screen reader on, double tap and hold on the pad, then swipe.')),
  };
  function back() { if (window.AndroidHub && window.AndroidHub.back) window.AndroidHub.back(); else parent.postMessage({ hub: 'back' }, '*'); }

  // ---------- touch gesture pad ----------
  function gesture(n, dx, dy) {
    const dist = Math.hypot(dx, dy);
    if (dist < 20) {
      if (n === 1) { const now = performance.now(); if (now - gesture.last < 350) { clearTimeout(gesture.tap); gesture.last = 0; act.repeat(); } else { gesture.last = now; gesture.tap = setTimeout(act.status, 360); } }
      else if (n === 2) act.level(); else act.gear();
      return;
    }
    if (dist < 40) return;
    const horiz = Math.abs(dx) > Math.abs(dy), up = dy < 0, left = dx < 0;
    buzz();
    if (n === 1) { if (horiz) (left ? act.bankLeft() : act.bankRight()); else (up ? act.throttleUp() : act.throttleDown()); }
    else if (n === 2) { if (horiz) (left ? act.checkRead() : act.checkConfirm()); else (up ? act.pitchUp() : act.pitchDown()); }
    else if (horiz) (left ? act.xpMode() : act.ident()); else act.flaps();
  }
  gesture.last = 0; gesture.tap = null;
  function makePad(parent) {
    pad = document.createElement('div');
    pad.id = 'pad'; pad.tabIndex = 0; pad.setAttribute('role', 'application');
    pad.setAttribute('aria-label', tr('उड़ान कमान पैड. कीबोर्ड कुंजियाँ और स्वाइप चालू हैं. गाइड के लिए H दबाइए.', 'Flight control pad. Keyboard keys and swipes are active. Press H for the guide.'));
    pad.textContent = tr('उड़ान पैड: यहाँ स्वाइप कीजिए', 'Flight pad: swipe here');
    const ptr = new Map(); let maxN = 0, held = null, longDone = false, ended = [];
    pad.addEventListener('pointerdown', (e) => {
      initAudio();
      if (!ptr.size) { maxN = 0; longDone = false; ended = []; }
      ptr.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
      maxN = Math.max(maxN, ptr.size);
      try { pad.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      clearTimeout(held);
      if (ptr.size === 1) held = setTimeout(() => { const p = ptr.values().next().value; if (ptr.size === 1 && p && Math.hypot(p.x - p.x0, p.y - p.y0) < 14) { longDone = true; buzz(); act.brake(); } }, 650);
      e.preventDefault();
    });
    pad.addEventListener('pointermove', (e) => { const p = ptr.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; } });
    const up = (e) => {
      const p = ptr.get(e.pointerId); if (!p) return;
      p.x = e.clientX; p.y = e.clientY; ended.push({ dx: p.x - p.x0, dy: p.y - p.y0 }); ptr.delete(e.pointerId);
      if (ptr.size) return;
      clearTimeout(held);
      if (longDone || e.type === 'pointercancel') return;
      let dx = 0, dy = 0; for (const g of ended) { dx += g.dx; dy += g.dy; }
      gesture(maxN, dx / ended.length, dy / ended.length);
    };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    parent.append(pad);
  }

  // ---------- screens ----------
  function showMenu() {
    box.textContent = ''; S.phase = 'menu'; stat.textContent = tr('शुरू करने के लिए उड़ान शुरू करें बटन दबाइए.', 'Press Start flight to begin.');
    const g = group(tr('मेनू', 'Menu'));
    const s = btn(tr('उड़ान शुरू करें', 'Start flight'), startFlight, g);
    const sb = btn('', () => { A.setSound(!A.soundOn); sb.textContent = soundText(); say(soundText()); }, g);
    const soundText = () => (A.soundOn ? tr('आवाज़ें: चालू', 'Sound effects: on') : tr('आवाज़ें: बंद', 'Sound effects: off'));
    sb.textContent = soundText();
    if (!window.AndroidHub) {
      const vb = btn('', () => { A.voiceOn = !A.voiceOn; if (!A.voiceOn) A.stopSpeech(); vb.textContent = voiceText(); say(voiceText()); }, g);
      const voiceText = () => (A.voiceOn ? tr('अपनी बोली: चालू. NVDA या JAWS इस्तेमाल करें तो बंद कीजिए', 'Built-in voice: on. Turn off if you use NVDA or JAWS') : tr('अपनी बोली: बंद. स्क्रीन रीडर बोलेगा', 'Built-in voice: off. Your screen reader will speak'));
      vb.textContent = voiceText();
    }
    btn(tr('आवाज़ों का स्तर बढ़ाएँ', 'Effects volume up'), act.volUp, g);
    btn(tr('आवाज़ों का स्तर घटाएँ', 'Effects volume down'), act.volDown, g);
    btn(tr('मुख्य मेनू पर वापस', 'Back to main menu'), back, g);
    setTimeout(() => s.focus(), 80);
    say(tr(`हवाई जहाज़ सिम्युलेटर. ${parsedRoute.ok ? RouteMap.describe(ROUTE, true) : `रूट: ${routeName()}, ${DEST_NM} समुद्री मील, ${CRUISE_FT} फ़ीट.`} पहले चेकलिस्ट, फिर टावर की अनुमति, फिर उड़ान. सारी आवाज़ें इसी ऐप में बनती हैं. शुरू करने के लिए बटन दबाइए.`,
      `Aeroplane Simulator. ${parsedRoute.ok ? RouteMap.describe(ROUTE, false) : `Route: ${routeName()}, ${DEST_NM} nautical miles at ${CRUISE_FT} feet.`} You will run the checklist, get tower clearance, take off and land at the destination runway. All sounds are generated inside the app. Press the button to begin.`));
  }
  function showEnd() {
    clearInterval(timer); timer = null;
    box.textContent = ''; stat.textContent = tr('उड़ान समाप्त.', 'Flight over.');
    const g = group(tr('उड़ान समाप्त', 'Flight over'));
    const b = btn(tr('दोबारा उड़ान भरें', 'Fly again'), startFlight, g);
    btn(tr('मुख्य मेनू पर वापस', 'Back to main menu'), back, g);
    setTimeout(() => b.focus(), 1500);
  }
  function startFlight() {
    reset(); S.phase = 'ground'; box.textContent = ''; xpBtns = [];
    makePad(box);
    let g = group(tr('जानकारी', 'Information'));
    btn(tr('स्थिति सुनें (S)', 'Hear status (S)'), act.status, g);
    btn(tr('आख़िरी बात दोहराएँ (R)', 'Repeat last message (R)'), act.repeat, g);
    btn(tr('सक्रिय अलार्म सुनें (A)', 'Hear active alarms (A)'), act.alarms, g);
    btn(tr('कीबोर्ड और स्पर्श गाइड (H)', 'Keyboard and gesture guide (H)'), act.guide, g);
    g = group(tr('उड़ान की कमान', 'Flight controls'));
    btn(tr('थ्रॉटल बढ़ाएँ (प्लस)', 'Throttle up (plus)'), act.throttleUp, g);
    btn(tr('थ्रॉटल घटाएँ (माइनस)', 'Throttle down (minus)'), act.throttleDown, g);
    btn(tr('नाक ऊपर (ऊपर तीर)', 'Nose up (up arrow)'), act.pitchUp, g);
    btn(tr('नाक नीचे (नीचे तीर)', 'Nose down (down arrow)'), act.pitchDown, g);
    btn(tr('बाएँ झुकें (बायाँ तीर)', 'Bank left (left arrow)'), act.bankLeft, g);
    btn(tr('दाएँ झुकें (दायाँ तीर)', 'Bank right (right arrow)'), act.bankRight, g);
    btn(tr('पंख सीधे (L)', 'Wings level (L)'), act.level, g);
    g = group(tr('जहाज़ की प्रणाली', 'Aircraft systems'));
    btn(tr('फ़्लैप बदलें (F)', 'Change flaps (F)'), act.flaps, g);
    btn(tr('पहिये ऊपर या नीचे (G)', 'Gear up or down (G)'), act.gear, g);
    btn(tr('ब्रेक (B)', 'Brake (B)'), act.brake, g);
    g = group(tr('चेकलिस्ट और टावर', 'Checklist and tower'));
    btn(tr('चेकलिस्ट की चीज़ सुनें (C)', 'Hear checklist item (C)'), act.checkRead, g);
    btn(tr('चीज़ जाँचकर पक्की करें (V)', 'Check the item (V)'), act.checkConfirm, g);
    btn(tr('अनुमति दोहराएँ (K)', 'Read back clearance (K)'), act.readback, g);
    g = group(tr('ट्रांसपोंडर', 'Transponder'));
    btn(tr('ट्रांसपोंडर मोड बदलें (T)', 'Change transponder mode (T)'), act.xpMode, g);
    btn(tr('आइडेंट (I)', 'Ident (I)'), act.ident, g);
    for (let i = 0; i < 4; i++) xpBtns.push(btn('', guard(() => xpDigit(i)), g));
    xpRefresh();
    btn(tr('कोड टाइप करें (X)', 'Type a squawk code (X)'), act.xpEntry, g);
    btn(tr('स्क्वॉक 1200, सामान्य उड़ान', 'Squawk 1200, visual flight'), guard(() => xpSet('1200')), g);
    btn(tr('स्क्वॉक 7600, रेडियो ख़राब', 'Squawk 7600, radio failure'), guard(() => xpSet('7600')), g);
    btn(tr('स्क्वॉक 7700, आपातकाल', 'Squawk 7700, emergency'), guard(() => xpSet('7700')), g);
    g = group(tr('आवाज़', 'Audio'));
    btn(tr('आवाज़ों का स्तर बढ़ाएँ', 'Effects volume up'), act.volUp, g);
    btn(tr('आवाज़ों का स्तर घटाएँ', 'Effects volume down'), act.volDown, g);
    btn(tr('उड़ान छोड़ें', 'Leave the flight'), () => { clearInterval(timer); S.over = true; setThrottleSound(); A.stopSpeech(); back(); }, g);
    stat.textContent = tr('रनवे पर खड़े हैं.', 'Standing on the runway.');
    initAudio(); setThrottleSound();
    say(tr(`रनवे पर तैयार. पहले चेकलिस्ट पूरी कीजिए. अनुमति मिलने पर थ्रॉटल पूरा दीजिए, साठ नॉट पर नाक थोड़ी ऊपर कीजिए, पहिये ऊपर कीजिए और ${CRUISE_FT} फ़ीट तक चढ़िए. गाइड के लिए H दबाइए.`,
      `Ready on the runway. Complete the checklist first. When cleared, push the throttle to full, raise the nose a little at sixty knots, raise the gear and climb to ${CRUISE_FT} feet. Press H for the guide.`));
    atcSay(`${csSay()}, हब ग्राउंड. रनवे ${spkDigits(S.rwT)}, स्क्वॉक ${spkDigits(S.assigned)}. टेक-ऑफ़ से पहले की चेकलिस्ट पूरी कीजिए.`,
      `${csSay()}, Hub Ground. Runway ${spkDigits(S.rwT)}, squawk ${spkDigits(S.assigned)}. Complete the before take-off checklist.`);
    setTimeout(() => { if (!S.over && S.phase === 'ground') ckStart('takeoff'); }, 400);
    last = performance.now(); statT = 0; clearInterval(timer);
    timer = setInterval(() => {
      const n = performance.now(); const dt = Math.min(0.25, (n - last) / 1000); last = n; step(dt);
      statT += dt; if (statT >= 1) { statT = 0; stat.textContent = `${csShow()}: ${Math.round(S.speed)} kt, ${Math.round(S.alt)} ft, ${fmtNm(S.dist)} nm`; }
    }, 100);
    setTimeout(() => pad && pad.focus(), 80);
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (S.phase !== 'menu' && S.xp.entry) {
      if (e.key === 'Escape') { e.preventDefault(); S.xp.entry = null; say(tr('स्क्वॉक भरना रद्द.', 'Squawk entry cancelled.')); return; }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (+e.key > 7) { say(tr('सिर्फ़ शून्य से सात.', 'Digits zero to seven only.')); return; }
        S.xp.entry.push(+e.key); fx.click();
        if (S.xp.entry.length === 4) { const c = S.xp.entry.join(''); S.xp.entry = null; xpSet(c); }
        return;
      }
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const m = { ArrowUp: act.pitchUp, ArrowDown: act.pitchDown, ArrowLeft: act.bankLeft, ArrowRight: act.bankRight, '+': act.throttleUp, '=': act.throttleUp, '-': act.throttleDown,
      f: act.flaps, g: act.gear, b: act.brake, l: act.level, s: act.status, r: act.repeat, c: act.checkRead, v: act.checkConfirm, k: act.readback, t: act.xpMode, i: act.ident, x: act.xpEntry, a: act.alarms, h: act.guide, '[': act.volDown, ']': act.volUp }[key];
    if (m && (S.phase !== 'menu' || key === '[' || key === ']')) { e.preventDefault(); initAudio(); m(); }
    if (e.key === 'Escape') back();
  });

  window.__aero = { S, step, act, startFlight, fx, tone, crash, ROUTE, A, ALARMS, ckConfirm };
  showMenu();
})();

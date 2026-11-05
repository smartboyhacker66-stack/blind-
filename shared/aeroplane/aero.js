'use strict';
// Aeroplane Simulator: उड़ान, लैंडिंग और सारी आवाज़ें Web Audio API से बनती हैं (कोई ऑडियो फ़ाइल नहीं).
(function () {
  const q = new URLSearchParams(location.search);
  const HI = q.get('lang') === 'hi';
  let soundOn = q.get('sound') !== '0';
  const voiceOn = q.get('voice') !== '0';
  const tr = (hi, en) => (HI ? hi : en);
  document.documentElement.lang = HI ? 'hi' : 'en';
  document.getElementById('title').textContent = tr('हवाई जहाज़ सिम्युलेटर', 'Aeroplane Simulator');
  document.title = tr('हवाई जहाज़ सिम्युलेटर', 'Aeroplane Simulator');

  // ---------- बोलना ----------
  const live = document.getElementById('live');
  let lastSaid = '';
  function say(text, flush = true) {
    lastSaid = text;
    if (flush) live.textContent = '';
    setTimeout(() => { live.textContent = (flush ? '' : live.textContent + ' ') + text; }, 30);
    if (window.AndroidHub && window.AndroidHub.speak) { try { window.AndroidHub.speak(text); } catch (e) { /* अनदेखा */ } }
    else if (voiceOn && window.speechSynthesis) {
      try { if (flush) speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = HI ? 'hi-IN' : 'en-US'; speechSynthesis.speak(u); } catch (e) { /* अनदेखा */ }
    }
  }

  // ---------- आवाज़ें (Web Audio) ----------
  let ac = null, master = null, noiseBuf = null;
  const eng = {};
  function initAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    ac = new C(); master = ac.createGain(); master.gain.value = soundOn ? 0.8 : 0; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // इंजन: तीन थोड़े बेसुरे आरे जैसे सुर + फ़िल्टर किया शोर
    eng.gain = ac.createGain(); eng.gain.gain.value = 0;
    eng.filter = ac.createBiquadFilter(); eng.filter.type = 'lowpass'; eng.filter.frequency.value = 400;
    eng.oscs = [0, 7, -9].map((det) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 50; o.detune.value = det; o.connect(eng.filter); o.start(); return o; });
    eng.filter.connect(eng.gain); eng.gain.connect(master);
    // हवा की सनसनाहट
    eng.wind = ac.createGain(); eng.wind.gain.value = 0;
    const ns = ac.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    ns.connect(bp); bp.connect(eng.wind); eng.wind.connect(master); ns.start();
  }
  function setSound(on) { soundOn = on; if (master) master.gain.value = on ? 0.8 : 0; }
  function tone(freq, ms, vol = 0.4, type = 'sine', pan = 0, delay = 0) {
    if (!ac || !soundOn) return;
    const t = ac.currentTime + delay, d = ms / 1000, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol, t + d - 0.01); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(g); let n = g; if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); n = p; }
    n.connect(master); o.start(t); o.stop(t + d + 0.02);
  }
  function burst(ms, freq, qv, vol = 0.5, type = 'bandpass') {
    if (!ac || !soundOn) return;
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = qv;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + ms / 1000 + 0.05);
  }
  const fx = {
    gear() { burst(250, 200, 1, 0.9); tone(70, 300, 0.7); tone(55, 200, 0.7, 'sine', 0, 0.45); burst(180, 300, 1, 0.8); },
    flaps() { tone(120, 800, 0.15, 'sawtooth'); tone(125, 800, 0.1, 'sawtooth'); },
    chime() { tone(880, 180, 0.3); tone(1320, 260, 0.3, 'sine', 0, 0.18); },
    stall() { tone(1200, 120, 0.35, 'square'); tone(1200, 120, 0.35, 'square', 0, 0.25); },
    touch() { tone(60, 350, 0.9); burst(300, 150, 0.7, 0.9, 'lowpass'); },
    crash() { burst(1500, 120, 0.5, 1, 'lowpass'); tone(40, 1200, 0.8, 'sawtooth'); },
    squeal() { burst(500, 2500, 6, 0.35); },
    atc() { burst(120, 2000, 2, 0.5, 'highpass'); tone(1000, 80, 0.25, 'sine', 0, 0.14); tone(1300, 80, 0.25, 'sine', 0, 0.26); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 260, 0.35, 'triangle', 0, i * 0.2)); },
    warn() { tone(500, 200, 0.4, 'square'); },
  };

  // ---------- उड़ान का हिसाब ----------
  const CRUISE_FT = 3000, RUNWAY_NM = 1, DEST_NM = 6, ROT_KT = 60;
  const S = {};
  function reset() {
    Object.assign(S, { phase: 'ground', throttle: 0, speed: 0, alt: 0, pitch: 0, bank: 0, heading: 0, dev: 0, dist: 0, flaps: 0, gear: true, brake: false,
      vs: 0, airborne: false, cruiseTold: false, lastChime: 0, descentTold: false, finalTold: false, nmTold: 0, wind: 0, score: 100, notes: [], touched: false, t: 0, stallBeep: 0, alignBeep: 0, squealT: 0, over: false, rwWarn1: false, rwWarn2: false, landTold: null, sinkTold: false, gearTold: false });
  }
  reset();
  const stallSpeed = () => (S.flaps === 2 ? 45 : S.flaps === 1 ? 50 : 55);
  const fmtNm = (x) => (Math.round(x * 10) / 10).toString();
  function statusText() {
    const lim = S.dist < DEST_NM - 0.01 ? tr(`गंतव्य तक ${fmtNm(DEST_NM - S.dist)} समुद्री मील`, `${fmtNm(DEST_NM - S.dist)} nautical miles to the runway`) : tr('गंतव्य रनवे पर', 'on the destination runway');
    return tr(
      `${S.airborne ? 'हवा में' : 'ज़मीन पर'}. गति ${Math.round(S.speed)} नॉट, ऊँचाई ${Math.round(S.alt)} फ़ीट, चढ़ने की दर ${Math.round(S.vs)} फ़ीट प्रति मिनट, थ्रॉटल ${S.throttle} प्रतिशत, नाक ${S.pitch} डिग्री, झुकाव ${S.bank} डिग्री, पहिये ${S.gear ? 'नीचे' : 'ऊपर'}, फ़्लैप ${S.flaps}, ब्रेक ${S.brake ? 'लगा' : 'छूटा'}. ${lim}. रनवे की रेखा से ${Math.abs(Math.round(S.dev))} मीटर ${S.dev < 0 ? 'बाएँ' : 'दाएँ'}.`,
      `${S.airborne ? 'Airborne' : 'On the ground'}. Speed ${Math.round(S.speed)} knots, altitude ${Math.round(S.alt)} feet, vertical speed ${Math.round(S.vs)} feet per minute, throttle ${S.throttle} percent, pitch ${S.pitch} degrees, bank ${S.bank} degrees, gear ${S.gear ? 'down' : 'up'}, flaps ${S.flaps}, brake ${S.brake ? 'on' : 'off'}. ${lim}. ${Math.abs(Math.round(S.dev))} metres ${S.dev < 0 ? 'left' : 'right'} of the centre line.`);
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
      if (S.speed >= ROT_KT && S.pitch > 0 && S.gear) { S.airborne = true; S.phase = 'flight'; say(tr('जहाज़ ज़मीन छोड़ चुका है. पहिये ऊपर कीजिए.', 'Airborne. Raise the landing gear.')); fx.atc(); }
      else if (S.dist > RUNWAY_NM - 0.12 && !S.rwWarn1) { S.rwWarn1 = true; fx.warn(); say(tr('रनवे का अंत पास है, थ्रॉटल पूरा दीजिए और नाक ऊपर कीजिए!', 'Runway end ahead! Full power and raise the nose now!')); }
      else if (S.dist > RUNWAY_NM - 0.04 && !S.rwWarn2) { S.rwWarn2 = true; fx.stall(); say(tr('आख़िरी मौक़ा! अभी उड़ान भरिए, नहीं तो रनवे ख़त्म हो जाएगा.', 'Last chance! Take off now or you will run out of runway.')); }
      else if (S.dist > RUNWAY_NM && S.dist < DEST_NM - 0.5) return crash(tr('रनवे ख़त्म हो गया, उड़ान भरने से पहले.', 'You ran out of runway before take-off.'));
      else if (S.dist > DEST_NM + RUNWAY_NM && S.dist >= DEST_NM) return crash(tr('लैंडिंग के बाद रनवे के आगे निकल गए.', 'You ran past the end of the runway.'));
      if (Math.abs(S.dev) > 45 && S.dist > 0.05) return crash(tr('रनवे से बाहर निकल गए.', 'You left the runway.'));
      if (S.touched && S.speed <= 0.5 && S.dist >= DEST_NM) { finish(true); return; }
      S.vs = 0;
    } else {
      if (S.speed < stallSpeed()) { S.vs = -900; S.stallBeep -= dt; if (S.stallBeep <= 0) { S.stallBeep = 0.6; fx.stall(); } if (S.alt > 80 && !S.stallSaid) { S.stallSaid = true; say(tr('स्टॉल! नाक नीचे कीजिए और थ्रॉटल बढ़ाइए.', 'Stall! Lower the nose and add power.')); } }
      else { S.vs = S.pitch * S.speed * 1.5; S.stallSaid = false; if (S.speed < stallSpeed() + 8) { S.stallBeep -= dt; if (S.stallBeep <= 0) { S.stallBeep = 1; fx.warn(); } } }
      const prev = S.alt; S.alt += S.vs / 60 * dt;
      if (Math.floor(S.alt / 500) !== Math.floor(prev / 500) && S.alt > 400 && S.alt > 0) { fx.chime(); say(tr(`${Math.round(Math.floor(Math.max(S.alt, prev) / 500) * 500)} फ़ीट`, `${Math.round(Math.floor(Math.max(S.alt, prev) / 500) * 500)} feet`), false); }
      if (S.alt > 6000) { S.alt = 6000; if (S.vs > 0) S.vs = 0; }
      if (S.alt >= CRUISE_FT - 100 && !S.cruiseTold) { S.cruiseTold = true; fx.atc(); say(tr('क्रूज़ ऊँचाई तीन हज़ार फ़ीट पहुँच गए. पहिये ऊपर रखिए और सीधा चलिए.', 'Cruise altitude of three thousand feet reached. Keep the gear up and fly straight.')); }
      const left = DEST_NM - S.dist;
      if (Math.floor(S.dist) > S.nmTold && left > 0) { S.nmTold = Math.floor(S.dist); say(tr(`गंतव्य तक ${fmtNm(left)} समुद्री मील.`, `${fmtNm(left)} nautical miles to go.`), false); }
      if (left < 2.5 && !S.descentTold) { S.descentTold = true; fx.atc(); say(tr('उतरना शुरू कीजिए. थ्रॉटल घटाइए और नाक थोड़ी नीची कीजिए.', 'Begin your descent. Reduce power and lower the nose a little.')); }
      if (left < 1.2 && !S.finalTold) { S.finalTold = true; fx.atc(); say(tr('फ़ाइनल. पहिये नीचे, फ़्लैप दो, गति नब्बे नॉट से कम रखिए. रनवे की रेखा की बीप सुनिए: जिस कान में बीप, उधर रनवे है.', 'Final approach. Gear down, flaps two, speed below ninety knots. Listen to the alignment beeps: the side the beep is on is where the runway is.')); }
      // रनवे की सीध की बीप: बायाँ/दायाँ कान, पास आने पर तेज़
      if (left < 2.5 && left > 0) {
        S.alignBeep -= dt;
        if (S.alignBeep <= 0) {
          const off = Math.abs(S.dev);
          S.alignBeep = off < 6 ? 0.9 : 0.5;
          if (off < 6) tone(1000, 80, 0.25); else tone(off > 40 ? 500 : 700, 100, 0.35, 'sine', Math.max(-1, Math.min(1, -S.dev / 60)));
        }
      }
      // लैंडिंग के निर्देश: ऊँचाई की घोषणा, पहिये और नीचे उतरने की गति की चेतावनी (दोनों भाषाओं में)
      if (S.airborne && left < 2.5 && left > 0) {
        if (!S.landTold) S.landTold = {};
        for (const h of [1000, 500, 200, 100, 50, 20, 10]) {
          if (S.alt <= h && !S.landTold[h]) {
            S.landTold[h] = true;
            if (h === 1000 && !S.gear) say(tr('एक हज़ार फ़ीट. पहिये अभी ऊपर हैं, पहिये नीचे कीजिए!', 'One thousand feet. Gear is still up, lower the gear now!'), false);
            else if (h === 1000) say(tr('एक हज़ार फ़ीट. फ़्लैप लगाइए और गति घटाइए.', 'One thousand feet. Set flaps and reduce speed.'), false);
            else say(tr(`${h} फ़ीट`, `${h} feet`), false);
          }
        }
        if (S.alt < 400 && S.vs < -700 && !S.sinkTold) { S.sinkTold = true; fx.warn(); say(tr('बहुत तेज़ी से नीचे आ रहे हैं! नाक ऊपर कीजिए और थ्रॉटल बढ़ाइए.', 'You are sinking too fast! Raise the nose and add power.'), false); }
        if (S.alt < 300 && !S.gear && !S.gearTold) { S.gearTold = true; fx.warn(); say(tr('पहिये नीचे नहीं हैं! अभी नीचे कीजिए.', 'Gear is not down! Lower it now.'), false); }
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
        say(tr(`टच-डाउन! गति ${Math.round(S.speed)} नॉट. अब ब्रेक लगाइए और थ्रॉटल शून्य कीजिए.`, `Touchdown! Speed ${Math.round(S.speed)} knots. Now apply the brake and close the throttle.`));
      }
    }
    if (S.brake && S.speed > 20 && !S.airborne) { S.squealT -= dt; if (S.squealT <= 0) { S.squealT = 0.4; fx.squeal(); } }
    setThrottleSound();
  }

  function setThrottleSound() {
    if (!ac) return;
    const t = ac.currentTime, on = !S.over, rpm = on ? S.throttle / 100 : 0;
    eng.oscs.forEach((o) => o.frequency.setTargetAtTime(38 + rpm * 70, t, 0.2));
    eng.filter.frequency.setTargetAtTime(300 + rpm * 900, t, 0.2);
    eng.gain.gain.setTargetAtTime(on ? 0.12 + rpm * 0.25 : 0, t, 0.2);
    eng.wind.gain.setTargetAtTime(Math.min(0.5, S.speed / 260), t, 0.3);
  }

  // ---------- बटन ----------
  const box = document.getElementById('controls'), stat = document.getElementById('status');
  let timer = null, last = 0;
  function btn(text, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', () => { initAudio(); fn(); }); box.append(b); return b; }
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
    repeat: () => say(lastSaid || tr('अभी कुछ नहीं कहा गया.', 'Nothing has been said yet.')),
  };
  function back() { if (window.AndroidHub && window.AndroidHub.back) window.AndroidHub.back(); else parent.postMessage({ hub: 'back' }, '*'); }

  function showMenu() {
    box.textContent = ''; S.phase = 'menu'; stat.textContent = tr('शुरू करने के लिए उड़ान शुरू करें बटन दबाइए.', 'Press Start flight to begin.');
    const s = btn(tr('उड़ान शुरू करें', 'Start flight'), startFlight);
    btn(soundOn ? tr('आवाज़: चालू', 'Sound: on') : tr('आवाज़: बंद', 'Sound: off'), () => { setSound(!soundOn); showMenu(); });
    btn(tr('मुख्य मेनू पर वापस', 'Back to main menu'), back);
    setTimeout(() => s.focus(), 80);
    say(tr('हवाई जहाज़ सिम्युलेटर. आप रनवे से उड़ान भरेंगे, तीन हज़ार फ़ीट पर छह समुद्री मील उड़ेंगे और दूसरे रनवे पर उतरेंगे. सारी आवाज़ें इसी ऐप में बनती हैं. शुरू करने के लिए बटन दबाइए.', 'Aeroplane Simulator. You will take off, fly six nautical miles at three thousand feet and land on the destination runway. All sounds are generated inside the app. Press the button to begin.'));
  }
  function showEnd() {
    clearInterval(timer); timer = null;
    box.textContent = ''; stat.textContent = tr('उड़ान समाप्त.', 'Flight over.');
    const b = btn(tr('दोबारा उड़ान भरें', 'Fly again'), startFlight);
    btn(tr('मुख्य मेनू पर वापस', 'Back to main menu'), back);
    setTimeout(() => b.focus(), 1500);
  }
  function startFlight() {
    reset(); S.phase = 'ground'; box.textContent = '';
    const top = btn(tr('स्थिति सुनें', 'Hear status'), act.status);
    btn(tr('थ्रॉटल बढ़ाएँ (अप)', 'Throttle up (plus)'), act.throttleUp);
    btn(tr('थ्रॉटल घटाएँ (माइनस)', 'Throttle down (minus)'), act.throttleDown);
    btn(tr('नाक ऊपर (ऊपर तीर)', 'Nose up (up arrow)'), act.pitchUp);
    btn(tr('नाक नीचे (नीचे तीर)', 'Nose down (down arrow)'), act.pitchDown);
    btn(tr('बाएँ झुकें (बायाँ तीर)', 'Bank left (left arrow)'), act.bankLeft);
    btn(tr('दाएँ झुकें (दायाँ तीर)', 'Bank right (right arrow)'), act.bankRight);
    btn(tr('पंख सीधे (L)', 'Wings level (L)'), act.level);
    btn(tr('फ़्लैप बदलें (F)', 'Change flaps (F)'), act.flaps);
    btn(tr('पहिये ऊपर या नीचे (G)', 'Gear up or down (G)'), act.gear);
    btn(tr('ब्रेक (B)', 'Brake (B)'), act.brake);
    btn(tr('आख़िरी बात दोहराएँ (R)', 'Repeat last message (R)'), act.repeat);
    btn(tr('उड़ान छोड़ें', 'Leave the flight'), () => { clearInterval(timer); setThrottleSound(); S.over = true; if (eng.gain) eng.gain.gain.value = 0; back(); });
    stat.textContent = tr('रनवे पर खड़े हैं.', 'Standing on the runway.');
    initAudio(); setThrottleSound(); fx.atc();
    say(tr('रनवे पर तैयार. थ्रॉटल बढ़ाकर पूरी ताकत दीजिए. साठ नॉट पर नाक थोड़ी ऊपर कीजिए. फिर पहिये ऊपर और तीन हज़ार फ़ीट तक चढ़िए.', 'Ready on the runway. Push the throttle to full. At sixty knots raise the nose a little. Then raise the gear and climb to three thousand feet.'));
    last = performance.now(); clearInterval(timer);
    timer = setInterval(() => { const n = performance.now(); const dt = Math.min(0.25, (n - last) / 1000); last = n; step(dt); stat.textContent = `${Math.round(S.speed)} kt, ${Math.round(S.alt)} ft, ${fmtNm(S.dist)} nm`; }, 100);
    setTimeout(() => top.focus(), 80);
  }

  document.addEventListener('keydown', (e) => {
    const m = { ArrowUp: act.pitchUp, ArrowDown: act.pitchDown, ArrowLeft: act.bankLeft, ArrowRight: act.bankRight, '+': act.throttleUp, '=': act.throttleUp, '-': act.throttleDown, f: act.flaps, g: act.gear, b: act.brake, l: act.level, s: act.status, r: act.repeat }[e.key];
    if (m && S.phase !== 'menu') { e.preventDefault(); initAudio(); m(); }
    if (e.key === 'Escape') back();
  });

  window.__aero = { S, step, act, startFlight, fx, tone, crash };
  showMenu();
})();

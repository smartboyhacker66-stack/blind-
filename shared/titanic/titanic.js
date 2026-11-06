'use strict';
// Titanic: Survive. Real-time story: every decision has a countdown, the ship keeps sinking while you decide,
// and the ending pays +1000 rupees (rescued) or costs 100 rupees (lost). Sounds are synthesised (no audio files).
(function () {
  const q = new URLSearchParams(location.search);
  const HI = q.get('lang') === 'hi';
  const tr = (hi, en) => (HI ? hi : en);
  const A = HubAudio.create({ hi: HI, sound: q.get('sound') !== '0', voice: q.get('voice') !== '0' });
  const T = TitanicStory;
  const TITLE = tr('टाइटैनिक: जीवित रहो', 'Titanic: Survive');
  document.documentElement.lang = HI ? 'hi' : 'en';
  document.getElementById('title').textContent = TITLE;
  document.title = TITLE;

  const box = document.getElementById('controls'), story = document.getElementById('story'), clockEl = document.getElementById('clock');
  const say = (t, flush = true) => A.say(t, flush);
  const S = {};
  function reset() { Object.assign(S, { scene: null, left: 0, elapsed: 0, min: 0, paused: false, over: true, score: 0, inBoat: false, evI: 0, said10: false, said5: false, lastTick: 0, nextCreak: 8, prefix: '' }); }
  reset();
  let timer = null, last = 0, clockT = 0;

  // ---------- wallet (host provides it: Android bridge, or the Windows page via postMessage) ----------
  function walletCall(msg) {
    return new Promise((res) => {
      const id = Math.random().toString(36).slice(2);
      const on = (e) => { if (e.data && e.data.hub === 'wallet-result' && e.data.id === id) { window.removeEventListener('message', on); res(typeof e.data.balance === 'number' ? e.data.balance : null); } };
      window.addEventListener('message', on);
      setTimeout(() => { window.removeEventListener('message', on); res(null); }, 35000);
      parent.postMessage(Object.assign({ id }, msg), '*');
    });
  }
  function walletApply(kind, amount) {
    if (window.AndroidHub && window.AndroidHub.walletApply) { try { return Promise.resolve(window.AndroidHub.walletApply(kind, amount)); } catch (e) { return Promise.resolve(null); } }
    if (parent !== window) return walletCall({ hub: 'wallet', kind, amount });
    return Promise.resolve(null);
  }
  function walletBalance() {
    if (window.AndroidHub && window.AndroidHub.walletBalance) { try { return Promise.resolve(window.AndroidHub.walletBalance()); } catch (e) { return Promise.resolve(null); } }
    if (parent !== window) return walletCall({ hub: 'wallet-get' });
    return Promise.resolve(null);
  }
  function back() { if (window.AndroidHub && window.AndroidHub.back) window.AndroidHub.back(); else parent.postMessage({ hub: 'back' }, '*'); }

  // ---------- sounds ----------
  const fx = {
    scene() { A.tone(660, 110, 0.2, 'triangle'); A.tone(880, 140, 0.2, 'triangle', 0, 0.1); },
    choose() { A.tone(520, 60, 0.18, 'square'); },
    tick(c) { A.tone(c <= 2 ? 1100 : 800, 40, 0.16, 'square'); },
    water() { A.burst(900, 300, 0.8, 0.5, 'lowpass'); },
    horn() { A.tone(110, 1000, 0.22, 'sawtooth'); A.tone(165, 1000, 0.16, 'square'); },
    creak() { A.tone(52 + Math.random() * 20, 700, 0.12, 'sawtooth'); A.burst(500, 400, 6, 0.1); },
    rocket() { A.burst(900, 2500, 3, 0.25, 'highpass'); A.tone(1800, 200, 0.08); },
    sink() { A.burst(2500, 200, 0.8, 0.6, 'lowpass'); A.tone(40, 2500, 0.4, 'sine'); },
    scrape() { A.burst(1600, 900, 1, 0.45); A.tone(55, 1400, 0.35, 'sawtooth'); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => A.tone(f, 280, 0.28, 'triangle', 0, i * 0.2)); },
    lose() { A.tone(130, 1400, 0.3, 'sine'); A.tone(98, 1800, 0.25, 'sine', 0, 0.5); A.burst(900, 250, 0.7, 0.35, 'lowpass'); },
  };
  let amb = null;
  function ambient(level) {
    if (!A.ac) return;
    if (!amb) {
      amb = { g: A.ac.createGain(), f: A.ac.createBiquadFilter(), s: A.ac.createBufferSource() };
      amb.g.gain.value = 0; amb.f.type = 'lowpass'; amb.f.frequency.value = 160; amb.s.buffer = A.noiseBuf; amb.s.loop = true;
      amb.s.connect(amb.f); amb.f.connect(amb.g); amb.g.connect(A.out); amb.s.start();
    }
    const t = A.ac.currentTime;
    amb.g.gain.setTargetAtTime(level, t, 0.5);
    amb.f.frequency.setTargetAtTime(140 + level * 1200, t, 0.5);
  }

  // ---------- clock ----------
  function shipClock(m) {
    const total = 23 * 60 + 40 + Math.floor(m), h = Math.floor(total / 60) % 24, mm = String(total % 60).padStart(2, '0');
    return `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  }
  function clockText() {
    return tr(`टक्कर के ${Math.floor(S.min)} मिनट बाद. जहाज़ की घड़ी ${shipClock(S.min)}. फ़ैसले के लिए ${Math.max(0, Math.ceil(S.left))} सेकंड बचे.`,
      `${Math.floor(S.min)} minutes since the collision. Ship clock ${shipClock(S.min)}. ${Math.max(0, Math.ceil(S.left))} seconds left to decide.`);
  }

  // ---------- UI helpers ----------
  function btn(text, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', () => { A.init(); fn(); }); box.append(b); return b; }
  const soundText = () => (A.soundOn ? tr('आवाज़ें: चालू', 'Sound effects: on') : tr('आवाज़ें: बंद', 'Sound effects: off'));
  const volUp = () => say(tr(`आवाज़ों का स्तर ${A.volStep(1)} प्रतिशत`, `Effects volume ${A.volStep(1)} percent`));
  const volDown = () => say(tr(`आवाज़ों का स्तर ${A.volStep(-1)} प्रतिशत`, `Effects volume ${A.volStep(-1)} percent`));

  function showMenu() {
    S.over = true; clearInterval(timer); timer = null; box.textContent = '';
    clockEl.textContent = tr('शुरू करने के लिए खेल शुरू करें बटन दबाइए.', 'Press Start game to begin.');
    story.textContent = tr('14-15 अप्रैल 1912 की रात. हर फ़ैसले के लिए सीमित समय है और जहाज़ डूबता जा रहा है.', 'The night of April 14 to 15, 1912. Every decision has a time limit while the ship sinks.');
    const s = btn(tr('खेल शुरू करें', 'Start game'), start);
    const sb = btn(soundText(), () => { A.setSound(!A.soundOn); sb.textContent = soundText(); say(soundText()); });
    if (!window.AndroidHub) {
      const voiceText = () => (A.voiceOn ? tr('अपनी बोली: चालू. NVDA या JAWS इस्तेमाल करें तो बंद कीजिए', 'Built-in voice: on. Turn off if you use NVDA or JAWS') : tr('अपनी बोली: बंद. स्क्रीन रीडर बोलेगा', 'Built-in voice: off. Your screen reader will speak'));
      const vb = btn(voiceText(), () => { A.voiceOn = !A.voiceOn; if (!A.voiceOn) A.stopSpeech(); vb.textContent = voiceText(); say(voiceText()); });
    }
    btn(tr('आवाज़ों का स्तर बढ़ाएँ', 'Effects volume up'), volUp);
    btn(tr('आवाज़ों का स्तर घटाएँ', 'Effects volume down'), volDown);
    btn(tr('मुख्य मेनू पर वापस', 'Back to main menu'), back);
    setTimeout(() => s.focus(), 80);
    say(tr(`${TITLE}. फ़ैसले असली समय में होते हैं: हर फ़ैसले पर गिनती चलती है, और समय निकल जाए तो आप हिचकिचा गए माने जाते हैं. बचकर निकले तो ${T.REWARD} रुपये का इनाम, हारे तो ${T.PENALTY} रुपये का जुर्माना. शुरू करने के लिए बटन दबाइए.`,
      `${TITLE}. Decisions happen in real time: every choice has a countdown, and if it runs out you hesitated. Survive and you earn ${T.REWARD} rupees. Lose and you pay ${T.PENALTY} rupees. Press the button to begin.`));
    walletBalance().then((b) => { if (typeof b === 'number' && S.over && !S.scene) say(tr(`आपका बैलेंस ${b} रुपये है.`, `Your balance is ${b} rupees.`), false); });
  }

  function start() {
    reset(); S.over = false; A.init(); ambient(0.05);
    fx.scrape(); fx.water();
    last = performance.now(); clearInterval(timer); timer = setInterval(loop, 100);
    showScene(T.START);
  }

  function narration(sc) {
    const ch = sc.choices.map((c, i) => `${i + 1}: ${tr(c.hi, c.en)}.`).join(' ');
    return `${S.prefix}${tr(sc.hi, sc.en)} ${tr(`आपके पास ${sc.limit} सेकंड हैं.`, `You have ${sc.limit} seconds.`)} ${ch}`;
  }
  function showScene(id) {
    S.scene = id; const sc = T.scenes[id];
    story.textContent = tr(sc.hi, sc.en); box.textContent = '';
    if (id === 'boats') S.inBoat = true;
    if (sc.end) { finish(sc.end === 'win', sc); return; }
    S.left = sc.limit; S.said10 = false; S.said5 = false; S.lastTick = Math.ceil(S.left); clockEl.textContent = clockText();
    sc.choices.forEach((c, i) => btn(`${i + 1}. ${tr(c.hi, c.en)}`, () => choose(i)));
    const pb = btn('', togglePause); pb.id = 'pause'; pb.textContent = tr('रोकें (P)', 'Pause (P)');
    btn(tr('फ़ैसला दोहराएँ (R)', 'Repeat the scene (R)'), repeat);
    btn(tr('बचा समय सुनें (T)', 'Hear time left (T)'), timeLeft);
    btn(tr('खेल छोड़ें', 'Leave the game'), () => { S.over = true; clearInterval(timer); ambient(0); A.stopSpeech(); back(); });
    fx.scene();
    const first = box.querySelector('button'); if (first) first.focus();
    const text = narration(sc); S.prefix = '';
    setTimeout(() => say(text), 250);
  }
  function choose(i) {
    if (S.over || S.paused) return;
    const sc = T.scenes[S.scene]; if (!sc || sc.end) return;
    const c = sc.choices[i]; if (!c) return;
    S.score += c.pts || 0; fx.choose(); showScene(c.to);
  }
  function repeat() { const sc = T.scenes[S.scene]; if (sc && !sc.end && !S.over) say(narration(sc)); }
  function timeLeft() { if (!S.over) say(clockText()); }
  function togglePause() {
    if (S.over) return;
    S.paused = !S.paused; last = performance.now();
    ambient(S.paused ? 0 : level());
    const pb = document.getElementById('pause'); if (pb) pb.textContent = S.paused ? tr('जारी रखें (P)', 'Resume (P)') : tr('रोकें (P)', 'Pause (P)');
    say(S.paused ? tr('रुका हुआ. जहाज़ इंतज़ार करता है. जारी रखने के लिए P.', 'Paused. The ship waits. Press P to resume.') : tr('खेल जारी.', 'Resumed.'));
  }
  const level = () => 0.05 + 0.15 * Math.min(1, S.min / 160);

  function onEvent(e) {
    if (e.m >= T.BOATS_GONE && e.m === T.BOATS_GONE && !S.inBoat) { fx.horn(); showScene('tooLate'); return; }
    fx[e.snd] && fx[e.snd]();
    say(tr(e.hi, e.en), false);
  }
  function loop() {
    const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (S.over || S.paused) return;
    S.elapsed += dt; S.min = S.elapsed * T.MIN_PER_SEC;
    ambient(level());
    if (S.elapsed >= S.nextCreak) { S.nextCreak = S.elapsed + 7 + Math.random() * 6; fx.creak(); }
    while (!S.over && S.evI < T.events.length && S.min >= T.events[S.evI].m) onEvent(T.events[S.evI++]);
    if (S.over) return;
    const sc = T.scenes[S.scene]; if (!sc || sc.end) return;
    S.left -= dt;
    const c = Math.ceil(S.left);
    if (c !== S.lastTick && c > 0) {
      S.lastTick = c;
      if (c <= 5) fx.tick(c);
      if (c === 10 && !S.said10 && sc.limit > 10) { S.said10 = true; say(tr('दस सेकंड.', 'Ten seconds.'), false); }
      if (c === 5 && !S.said5) { S.said5 = true; say(tr('पाँच सेकंड!', 'Five seconds!'), false); }
    }
    if (S.left <= 0) { S.prefix = tr('समय ख़त्म! आप हिचकिचा गए. ', "Time's up! You hesitated. "); showScene(sc.timeout); return; }
    clockT += dt; if (clockT >= 1) { clockT = 0; clockEl.textContent = clockText(); }
  }

  function finish(win, sc) {
    S.over = true; ambient(0); clearInterval(timer); timer = null;
    (win ? fx.win : fx.lose)();
    const kind = win ? 'reward' : 'fine', amt = win ? T.REWARD : T.PENALTY;
    const money = win ? tr(`आपने ${amt} रुपये का इनाम कमाया.`, `You earned a reward of ${amt} rupees.`) : tr(`${amt} रुपये का जुर्माना लगा.`, `A penalty of ${amt} rupees was charged.`);
    clockEl.textContent = money;
    const text = `${S.prefix}${tr(sc.hi, sc.en)} ${money} ${tr(`कुल अंक ${S.score}.`, `Total score ${S.score}.`)}`; S.prefix = '';
    box.textContent = '';
    say(text);
    walletApply(kind, amt).then((b) => { if (typeof b === 'number') say(tr(`आपका बैलेंस ${b} रुपये है.`, `Your balance is ${b} rupees.`), false); });
    const again = btn(tr('फिर से खेलें', 'Play again'), start);
    btn(tr('मुख्य मेनू पर वापस', 'Back to main menu'), back);
    setTimeout(() => again.focus(), 1800);
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Escape') { back(); return; }
    if (k === '[') { e.preventDefault(); volDown(); return; }
    if (k === ']') { e.preventDefault(); volUp(); return; }
    if (S.over) return;
    if (/^[1-9]$/.test(k)) { e.preventDefault(); A.init(); choose(+k - 1); }
    else if (k === 'r') { e.preventDefault(); repeat(); }
    else if (k === 't') { e.preventDefault(); timeLeft(); }
    else if (k === 'p') { e.preventDefault(); togglePause(); }
  });

  window.__titanic = { S, T, start, choose, loop, finish, A, showScene };
  showMenu();
})();

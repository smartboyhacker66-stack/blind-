'use strict';
// कैरम का खेल: कंप्यूटर, लोकल, डेमो और ऑनलाइन. GameView.kt + GameActivity.kt की नक़ल.
(function () {
  const { World, Rules, OnlineText, POCKETS, POCKET_R, BASE_Y } = Carrom;
  const tr = (hi, en) => Hub.tr(hi, en);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function startGame(opts, root, exit) {
    const mode = opts.mode;                       // ai | local | demo | online
    const online = mode === 'online', demo = mode === 'demo', vsAi = mode === 'ai' || demo;
    const names = ['', ''];
    names[0] = demo ? 'Aditya' : (opts.p1 || '').trim() || tr('खिलाड़ी 1', 'Player 1');
    names[1] = demo ? 'Monicaa' : vsAi ? tr('कंप्यूटर', 'Computer') : (opts.p2 || '').trim() || tr('खिलाड़ी 2', 'Player 2');
    const rules = new Rules(opts.rules !== 'simple');
    const world = new World();
    const B = { strikerX: 500, aim: 0, power: 5, fine: false, shooting: false };
    let destroyed = false, over = false, aiBusy = false, hint = null, hintBusy = false, speechUntil = 0, briefT = 0, prefix = '';
    let coachOn = Hub.store.get('coach', false);
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms); timers.add(t); return t; };
    // ऑनलाइन की स्थिति
    let myIdx = 0, seqSeen = 0, replaying = false, shotPending = false, firstState = true, polling = false, failCount = 0, onlineCur = 0,
      onlineBoard = 1, onlineMatch25 = true, onlineColour = [1, 0], onlineScore = [0, 0], onlineCoins = null, exitArmedAt = 0, pollT = null;
    const cur = () => (online ? onlineCur : rules.cur);

    // ---------- पर्दा ----------
    root.textContent = '';
    const statusEl = Hub.el('h1', { id: 'game-status', tabindex: '-1' });
    const canvas = Hub.el('canvas', { width: '600', height: '600', 'aria-hidden': 'true' });
    const ctx2 = canvas.getContext('2d');
    root.append(statusEl, canvas);
    const bar = Hub.el('div', { class: 'btnrow' });
    root.append(bar);

    function speak(text, opt) { speechUntil = Date.now() + Math.min(text.length * 70, 15000); Hub.say(text, opt); }
    const canAct = () => !over && !B.shooting && !aiBusy && !demo && !(vsAi && cur() === 1) && (!online || (!firstState && onlineCur === myIdx && !replaying && !shotPending));

    // ---------- आवाज़/शब्द ----------
    const positionIdx = () => Math.round((B.strikerX - 150) / 50) + 1;
    const aimWord = () => (B.aim === 0 ? tr('सीधा', 'straight') : B.aim > 0 ? tr(`दाएँ ${B.aim} डिग्री`, `${B.aim} degrees right`) : tr(`बाएँ ${-B.aim} डिग्री`, `${-B.aim} degrees left`));
    const strikerWord = () => {
      if (!B.fine) { const i = positionIdx(); return i === 8 ? tr('स्थिति आठ, बीच में', 'position eight, centre') : tr(`स्थिति ${i}`, `position ${i}`); }
      const off = Math.round(B.strikerX - 500);
      return off === 0 ? tr('बीच में', 'at the centre') : off < 0 ? tr(`बीच से ${-off} इकाई बाएँ`, `${-off} units left of centre`) : tr(`बीच से ${off} इकाई दाएँ`, `${off} units right of centre`);
    };
    const coinName = (t) => (t === 0 ? tr('काली गोटी', 'black coin') : t === 1 ? tr('सफ़ेद गोटी', 'white coin') : tr('रानी', 'the queen'));
    const distWord = (d) => (d < 120 ? tr('बहुत पास', 'very close') : d < 350 ? tr('मध्यम दूरी पर', 'at medium distance') : tr('दूर', 'far'));
    const pocketNames = () => (Hub.isHindi() ? ['ऊपर बाएँ', 'ऊपर दाएँ', 'नीचे बाएँ', 'नीचे दाएँ'] : ['top left', 'top right', 'bottom left', 'bottom right']);
    function brief() {
      const h = world.firstHit(B.aim);
      if (!h) return tr('सामने कोई गोटी नहीं', 'No coin ahead');
      let s = tr(`सामने ${coinName(h.coin.type)}, ${distWord(h.dist)}`, `Ahead: ${coinName(h.coin.type)}, ${distWord(h.dist)}`);
      if (h.pocket >= 0) s += tr(', पॉकेट की सीध में', ', in line with a pocket');
      return s;
    }
    function detail() {
      const h = world.firstHit(B.aim);
      let s = tr(`स्ट्राइकर ${strikerWord()}. निशाना ${aimWord()}. ताकत ${B.power}. ${brief()}.`, `Striker ${strikerWord()}. Aim ${aimWord()}. Power ${B.power}. ${brief()}.`);
      if (h) s += h.pocket >= 0 ? tr(` यह गोटी ${pocketNames()[h.pocket]} पॉकेट में जा सकती है.`, ` This coin can go into the ${pocketNames()[h.pocket]} pocket.`) : tr(' इस शॉट से गोटी के पॉकेट में जाने की संभावना कम है.', ' This shot is unlikely to pocket the coin.');
      return s;
    }
    function scoreText() {
      if (!online) return rules.scoreText(names, world);
      if (!onlineCoins) return '';
      let s = '';
      if (onlineMatch25) s += tr(`${names[0]} ${onlineScore[0]} अंक, ${names[1]} ${onlineScore[1]} अंक. बोर्ड ${onlineBoard}. `, `${names[0]} ${onlineScore[0]} points, ${names[1]} ${onlineScore[1]} points. Board ${onlineBoard}. `);
      return s + OnlineText.remain(onlineCoins, onlineColour);
    }
    function updateStatus() { statusEl.textContent = tr(`${names[cur()]} का टर्न | ${scoreText()}`, `${names[cur()]}'s turn | ${scoreText()}`); }
    function scheduleBrief(p) { prefix = p; beepForAim(); clearTimeout(briefT); briefT = later(() => { speak(prefix + brief()); prefix = ''; }, 600); }
    function beepForAim() {
      const h = world.firstHit(B.aim);
      if (!h) Hub.sfx.tone(300, 120, 0.3);
      else if (h.dist < 120) { Hub.sfx.tone(900, 70, 0.5); later(() => Hub.sfx.tone(900, 70, 0.5), 130); }
      else if (h.dist < 350) Hub.sfx.tone(700, 100, 0.35);
      else Hub.sfx.tone(700, 100, 1);
    }
    const lastSound = {};
    function playEvent(ev) {
      const now = performance.now();
      if (now - (lastSound[ev] || 0) < 50) return;
      lastSound[ev] = now;
      if (ev === Carrom.EV_COIN) Hub.sfx.play('coin_hit'); else if (ev === Carrom.EV_STRIKER) Hub.sfx.play('striker_hit');
      else if (ev === Carrom.EV_WALL) Hub.sfx.play('wall_hit'); else if (ev === Carrom.EV_POCKET) Hub.sfx.play('pocket'); else if (ev === Carrom.EV_FOUL) Hub.sfx.tone(150, 400, 1);
    }
    world.listener = playEvent;

    // ---------- चित्र ----------
    function draw() {
      const c = ctx2, s = canvas.width / 1000;
      c.save(); c.scale(s, s);
      c.fillStyle = 'rgb(222,184,120)'; c.fillRect(0, 0, 1000, 1000);
      c.fillStyle = '#000'; for (const p of POCKETS) { c.beginPath(); c.arc(p[0], p[1], POCKET_R, 0, 7); c.fill(); }
      c.strokeStyle = 'rgb(120,80,40)'; c.lineWidth = 4; c.beginPath(); c.moveTo(150, BASE_Y); c.lineTo(850, BASE_Y); c.stroke();
      const fillOf = ['rgb(40,40,40)', 'rgb(250,245,235)', 'rgb(200,30,50)', 'rgb(30,90,200)'];
      for (const k of world.coins) {
        if (!k.alive) continue;
        c.fillStyle = fillOf[k.type]; c.beginPath(); c.arc(k.x, k.y, k.radius, 0, 7); c.fill();
        c.strokeStyle = '#000'; c.lineWidth = 3; c.stroke();
      }
      if (!B.shooting && world.striker.alive) {
        const a = B.aim * Math.PI / 180, sx = world.striker.x, sy = world.striker.y;
        c.strokeStyle = 'red'; c.lineWidth = 5; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.sin(a) * 400, sy - Math.cos(a) * 400); c.stroke();
      }
      c.restore();
    }

    // ---------- बोर्ड की चाल ----------
    const aimStep = () => (B.fine ? 1 : 5), strikerStep = () => (B.fine ? 10 : 50);
    const moveStriker = (d) => { if (B.shooting) return; B.strikerX = clamp(B.strikerX + d * strikerStep(), 150, 850); world.placeStriker(B.strikerX); draw(); };
    const changeAim = (d) => { if (B.shooting) return; B.aim = clamp(B.aim + d * aimStep(), -75, 75); draw(); };
    const aimStraight = () => { if (B.shooting) return; B.aim = 0; draw(); };
    const strikerCenter = () => { if (B.shooting) return; B.strikerX = 500; world.placeStriker(500); draw(); };
    function toggleFine() {
      if (B.shooting) return B.fine;
      B.fine = !B.fine;
      if (!B.fine) { B.strikerX = clamp(Math.round((B.strikerX - 150) / 50) * 50 + 150, 150, 850); world.placeStriker(B.strikerX); B.aim = clamp(Math.round(B.aim / 5) * 5, -75, 75); }
      draw(); return B.fine;
    }
    function aimNextCoin() {
      if (B.shooting) return null;
      const sx = world.striker.x, sy = world.striker.y, list = [];
      for (const c of world.coins) {
        if (!c.alive || c.type === 3) continue;
        const dx = c.x - sx, dy = sy - c.y; if (dy <= 0) continue;
        const ang = Math.atan2(dx, dy) * 180 / Math.PI; if (ang < -75 || ang > 75) continue;
        list.push([ang, c]);
      }
      if (!list.length) return null;
      list.sort((a, b) => a[0] - b[0]);
      const next = list.find((e) => e[0] > B.aim + 0.5) || list[0];
      B.aim = Math.round(next[0]); draw(); return next[1];
    }
    const setAim = (x, a, p) => { B.strikerX = x; B.aim = a; B.power = p; world.placeStriker(x); draw(); };

    let raf = 0, lastT = 0;
    function shoot() {
      if (B.shooting) return;
      world.shoot(B.aim, B.power); B.shooting = true; lastT = performance.now();
      const tick = () => {
        if (destroyed) return;
        const now = performance.now(); let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
        while (dt > 0) { const s = Math.min(dt, 1 / 120); world.step(s); dt -= s; }
        if (!world.moving()) finishShot(); else { draw(); raf = requestAnimationFrame(tick); }
      };
      raf = requestAnimationFrame(tick);
    }
    function finishShot() {
      B.shooting = false;
      const res = world.pocketed.slice(), foul = world.foul;
      B.strikerX = 500; B.aim = 0; B.power = 5; world.placeStriker(500); draw();
      onShotFinished(res, foul);
    }

    // ---------- नियम और बारी ----------
    function onShotFinished(pocketed, foul) {
      let msg = rules.process(world, names, pocketed, foul);
      draw();
      if (pocketed.includes(2)) Hub.sfx.play('queen_pocket');
      if (rules.lastQueenCovered) later(() => Hub.sfx.play('queen_cover'), 400);
      if (rules.lastReturned > 0) later(() => Hub.sfx.play('coin_return'), 700);
      if (rules.matchOver) {
        over = true; statusEl.textContent = tr(`खेल ख़त्म | ${scoreText()}`, `Game over | ${scoreText()}`);
        later(() => Hub.sfx.play('win'), 900); speak(msg + ' ' + scoreText()); showEndButtons(); return;
      }
      if (rules.boardOver) { rules.nextBoard(world); draw(); msg += tr(' नया बोर्ड शुरू. ', ' New board started. ') + rules.startText(names); }
      updateStatus(); speak(msg); afterSpeech();
    }
    function afterSpeech() {
      if (over) return;
      const wait = Math.max(0, speechUntil - Date.now());
      if (vsAi && (cur() === 1 || demo)) maybeAi(wait);
      else if (coachOn && !demo) later(() => { if (!over && !B.shooting) coachSuggest(true); }, wait + 600);
    }

    // ---------- कोच और कंप्यूटर ----------
    const positionWord = (x) => { const i = Math.floor((x - 150) / 50) + 1; return i === 8 ? tr('स्थिति आठ, बीच में', 'position eight, centre') : tr(`स्थिति ${i}`, `position ${i}`); };
    const angleWord = (a) => (a === 0 ? tr('सीधा', 'straight') : a > 0 ? tr(`दाएँ ${a} डिग्री`, `${a} degrees right`) : tr(`बाएँ ${-a} डिग्री`, `${-a} degrees left`));
    function hintText(h) {
      let s = tr(`कोच का सुझाव: स्ट्राइकर को ${positionWord(h.x)} पर लाइए, निशाना ${angleWord(h.angle)} कीजिए, ताकत ${h.power} रखिए और शॉट मारिए. `, `Coach suggestion: put the striker at ${positionWord(h.x)}, aim ${angleWord(h.angle)}, set the power to ${h.power} and shoot. `);
      s += h.foul ? tr('सावधान, इस शॉट में स्ट्राइकर पॉकेट में जा सकता है. ', 'Careful, the striker may go into a pocket on this shot. ')
        : h.queen ? tr('इससे रानी पॉकेट में जा सकती है. फिर अपनी गोटी डालकर उसे कवर करना होगा. ', 'This can pocket the queen. You must then cover her with one of your coins. ')
          : h.own > 0 ? tr('इससे आपकी गोटी पॉकेट में जा सकती है, और आपको दोबारा टर्न मिलेगा. ', 'This can pocket your coin and give you another turn. ')
            : h.opp > 0 ? tr('सावधान, इससे विरोधी की गोटी जा सकती है. ', "Careful, this may pocket the opponent's coin. ")
              : tr('कोई गोटी जाने की संभावना कम है, पर अभी यही सबसे अच्छा शॉट है. ', 'A coin is unlikely to go in, but this is the best shot right now. ');
      return s + tr('सुझाव को सीधे लगाने के लिए सुझाव लागू करें बटन दबाइए.', 'To set it up directly, press the Apply suggestion button.');
    }
    /** सबसे अच्छा शॉट खोजता है; मुख्य थ्रेड न रुके इसलिए x के टुकड़ों में. */
    function searchBest(w, ownC, jitter) {
      return new Promise((resolve) => {
        let best = null, bestScore = -1e9; const xs = [200, 300, 400, 500, 600, 700, 800]; let xi = 0;
        const part = () => {
          if (destroyed) return resolve(null);
          const x = xs[xi++];
          for (let ang = -70; ang <= 70; ang += 5) for (const p of [5, 8]) {
            const sim = w.copy(); sim.placeStriker(x); sim.shoot(ang, p); sim.simulate();
            let own = 0, opp = 0, queen = false;
            for (const t of sim.pocketed) { if (t === ownC) own++; else if (t === 2) queen = true; else opp++; }
            let sc = own * 10 + (queen ? 14 : 0) - opp * 9; if (sim.foul) sc -= 25; if (jitter) sc += Math.random() * 2;
            if (sc > bestScore) { bestScore = sc; best = { x, angle: ang, power: p, own, opp, queen, foul: sim.foul }; }
          }
          if (xi < xs.length) setTimeout(part, 0); else resolve(best);
        };
        part();
      });
    }
    function coachSuggest(auto) {
      if (hintBusy || over) return; hintBusy = true;
      if (!auto) speak(tr('सोच रहा हूँ, कुछ सेकंड रुकिए.', 'Thinking, please wait a few seconds.'));
      searchBest(world.copy(), rules.colour[cur()], false).then((best) => { hintBusy = false; if (destroyed || !best) return; hint = best; if (!B.shooting && !over) speak(hintText(best)); });
    }
    function maybeAi(wait) {
      if (!(vsAi && (cur() === 1 || demo)) || over) return;
      aiBusy = true; const snap = world.copy(), ownC = rules.colour[cur()];
      later(() => {
        searchBest(snap, ownC, true).then((best) => {
          if (destroyed) return; aiBusy = false;
          if (best) setAim(best.x, best.angle, best.power);
          if (!demo) speak(tr('कंप्यूटर शॉट मार रहा है', 'The computer is taking its shot'));
          shoot();
        });
      }, Math.max(2500, (wait || 0) + 800));
    }

    // ---------- ऑनलाइन ----------
    const notOnline = () => tr('यह सुविधा ऑनलाइन खेल में उपलब्ध नहीं है.', 'This feature is not available in online games.');
    function readMeta(j) { onlineMatch25 = j.match25 !== false; onlineBoard = j.board || 1; onlineColour = j.colour; onlineScore = j.score; }
    function resultText(j) {
      const w = j.winner == null ? -1 : j.winner, mine = w === myIdx, reason = j.endedReason || '';
      const head = mine ? tr('बधाई हो, आप जीते!', 'Congratulations, you won!') : tr('आप हार गए.', 'You lost.');
      let why = '';
      if (reason === 'resign' || reason === 'left') why = mine ? tr(' विरोधी मैच छोड़कर चले गए.', ' Your opponent left the match.') : '';
      else if (reason === 'idle') why = mine ? tr(' विरोधी का कनेक्शन टूट गया.', ' Your opponent was disconnected.') : tr(' आपका कनेक्शन टूट गया था.', ' You were disconnected.');
      else if (reason === 'timeout') why = mine ? tr(' विरोधी ने बार-बार समय पर शॉट नहीं मारा.', ' Your opponent kept missing the time limit.') : tr(' आपने बार-बार समय पर शॉट नहीं मारा.', ' You kept missing the time limit.');
      return head + why;
    }
    function finishOnline(j, announce = true) {
      over = true; clearTimeout(pollT);
      statusEl.textContent = tr(`खेल ख़त्म | ${scoreText()}`, `Game over | ${scoreText()}`);
      if (announce) speak(resultText(j) + ' ' + scoreText());
      if (j.winner === myIdx) later(() => Hub.sfx.play('win'), 600);
      showEndButtons();
    }
    async function pollOnce() {
      if (polling) return; polling = true;
      const r = await Hub.net.call('GET', '/api/state?seq=' + seqSeen);
      polling = false; if (!destroyed) handleState(r);
    }
    function schedulePoll() { clearTimeout(pollT); if (destroyed || over) return; pollT = setTimeout(async () => { await pollOnce(); schedulePoll(); }, onlineCur === myIdx ? 1500 : 1000); }
    function handleState(r) {
      if (r.code === 401) { speak(tr('आप लॉग आउट हो गए हैं.', 'You have been signed out.')); later(exit, 2000); return; }
      const j = r.json;
      if (!r.ok || !j) { failCount++; if (failCount === 5) speak(tr('कनेक्शन में दिक़्क़त है, दोबारा जुड़ रहे हैं.', 'Connection problem, trying to reconnect.')); return; }
      failCount = 0;
      if (j.phase !== 'playing' && j.phase !== 'ended') { if (!over) speak(tr('मैच ख़त्म हो चुका है.', 'The match is over.')); over = true; later(exit, 2500); return; }
      if (replaying) return;
      if (firstState) {
        firstState = false; myIdx = j.you; names[0] = j.players[0]; names[1] = j.players[1]; seqSeen = j.shotSeq; readMeta(j);
        onlineCur = j.cur; onlineCoins = j.coins; world.applyServerCoins(j.coins); B.strikerX = world.striker.x; draw(); updateStatus();
        const opp = names[1 - myIdx];
        const m = onlineMatch25 ? tr('असली कैरम नियम, पच्चीस अंक तक का मैच.', 'Real carrom rules, a match to twenty five points.') : tr('सादा खेल, सिर्फ़ एक बोर्ड.', 'Simple game, one board only.');
        speak(tr(`ऑनलाइन मैच शुरू. आप ${opp} के साथ खेल रहे हैं. `, `The online match has started. You are playing against ${opp}. `) + m + ' ' + OnlineText.startText(names, onlineColour, onlineCur) + ' ' + (onlineCur === myIdx ? tr('आपकी बारी है.', 'It is your turn.') : ''));
        if (j.phase === 'ended') finishOnline(j);
        return;
      }
      const shot = j.lastShot;
      if (shot && shot.seq > seqSeen) { seqSeen = shot.seq; startReplay(shot, j); }
      else { readMeta(j); onlineCur = j.cur; onlineCoins = j.coins; world.applyServerCoins(j.coins); draw(); updateStatus(); if (j.phase === 'ended') finishOnline(j); }
    }
    function startReplay(shot, j) {
      replaying = true;
      const frames = shot.frames, n = frames.length;
      for (const e of shot.sounds) later(() => playEvent(e[1]), e[0] * 1000 / 90);
      frames.forEach((f, i) => later(() => { world.showFrame(f); draw(); }, i * 2000 / 90));
      later(() => {
        readMeta(j); world.applyServerCoins(j.coins); onlineCoins = j.coins; onlineCur = j.cur; replaying = false; draw();
        let covered = false, returned = false;
        for (const e of shot.ev) {
          if (e.t === 'queenCovered' || e.t === 'queenWithOwn') covered = true;
          if (['shotCoinsReturned', 'penaltyReturned', 'queenReturned', 'queenNotCovered', 'owedReturned', 'lastCoinBack', 'oppLastBack'].includes(e.t)) returned = true;
        }
        if (covered) later(() => Hub.sfx.play('queen_cover'), 300);
        if (returned) later(() => Hub.sfx.play('coin_return'), 700);
        updateStatus();
        let text = OnlineText.render(shot.ev, names[shot.by], names, onlineColour, j.coins);
        const ended = j.phase === 'ended';
        if (ended) text += ' ' + resultText(j);
        speak(text);
        if (ended) finishOnline(j, false); else if (onlineCur === myIdx) later(() => Hub.sfx.play('turn_change'), 400);
      }, n * 2000 / 90 + 150);
    }
    async function onlineShoot() {
      shotPending = true;
      const r = await Hub.net.call('POST', '/api/shoot', { x: B.strikerX, angle: B.aim, power: B.power });
      shotPending = false; if (destroyed) return;
      if (r.ok) { clearTimeout(pollT); pollOnce().then(schedulePoll); }
      else speak(r.error === 'too_soon' ? tr('थोड़ा रुकिए, फिर शॉट मारिए.', 'Wait a moment, then shoot.') : r.error === 'not_your_turn' ? tr('अभी आपकी बारी नहीं है.', 'It is not your turn.') : tr('शॉट नहीं पहुँचा. दोबारा कोशिश कीजिए.', 'The shot did not go through. Please try again.'));
    }

    // ---------- बटन ----------
    function bind(text, key, pan, fn, shortcut) {
      const b = Hub.el('button', { type: 'button', text, 'aria-keyshortcuts': shortcut || '' });
      b.addEventListener('click', () => { if (canAct()) { Hub.press(key, pan); fn(); } });
      bar.append(b); return b;
    }
    const actions = {
      sl: () => { moveStriker(-1); scheduleBrief(strikerWord() + '. '); },
      sr: () => { moveStriker(1); scheduleBrief(strikerWord() + '. '); },
      al: () => { changeAim(-1); scheduleBrief(aimWord() + '. '); },
      ar: () => { changeAim(1); scheduleBrief(aimWord() + '. '); },
      straight: () => { aimStraight(); scheduleBrief(tr('निशाना सीधा. ', 'Aim straight. ')); },
      centre: () => { strikerCenter(); scheduleBrief(tr('स्ट्राइकर बीच में. ', 'Striker in the centre. ')); },
      fine: () => { const f = toggleFine(); speak(f ? tr('बारीक मोड चालू. निशाना एक डिग्री और स्ट्राइकर दस इकाई के कदम से चलेगा.', 'Fine mode on. Aim moves one degree and the striker ten units at a time.') : tr('बारीक मोड बंद. निशाना पाँच डिग्री और स्ट्राइकर पचास इकाई के कदम से चलेगा.', 'Fine mode off. Aim moves five degrees and the striker fifty units at a time.')); },
      next: () => { const c = aimNextCoin(); if (!c) speak(tr('सामने कोई गोटी नहीं है', 'There is no coin ahead')); else scheduleBrief(`${coinName(c.type)}, ${aimWord()}. `); },
      pu: () => { B.power = clamp(B.power + 1, 1, 10); speak(tr(`ताकत ${B.power}`, `Power ${B.power}`)); },
      pd: () => { B.power = clamp(B.power - 1, 1, 10); speak(tr(`ताकत ${B.power}`, `Power ${B.power}`)); },
      shoot: () => { clearTimeout(briefT); if (online) onlineShoot(); else shoot(); },
      hint: () => { if (online) speak(notOnline()); else coachSuggest(false); },
      apply: () => {
        if (online) speak(notOnline());
        else if (!hint) speak(tr('पहले कोच का सुझाव सुनिए.', 'Please hear the coach suggestion first.'));
        else { setAim(hint.x, hint.angle, hint.power); speak(tr('सुझाव लागू हो गया. ', 'Suggestion applied. ') + `${strikerWord()}. ${aimWord()}. ` + tr(`ताकत ${B.power}. अब शॉट मारिए.`, `Power ${B.power}. Now shoot.`)); }
      },
    };
    bind(tr('स्ट्राइकर बाएँ', 'Striker left'), 'striker_left', -1, actions.sl, 'Q');
    bind(tr('स्ट्राइकर दाएँ', 'Striker right'), 'striker_right', 1, actions.sr, 'E');
    bind(tr('निशाना बाएँ', 'Aim left'), 'aim_left', -1, actions.al, 'A');
    bind(tr('निशाना दाएँ', 'Aim right'), 'aim_right', 1, actions.ar, 'D');
    bind(tr('निशाना सीधा करें', 'Aim straight'), 'straight', 0, actions.straight, 'X');
    bind(tr('स्ट्राइकर बीच में लाएँ', 'Bring striker to centre'), 'center', 0, actions.centre, 'Z');
    bind(tr('बारीक मोड बदलें', 'Switch fine mode'), 'fine', 0, actions.fine, 'F');
    bind(tr('अगली गोटी पर निशाना', 'Aim at next coin'), 'next_coin', 0, actions.next, 'N');
    bind(tr('ताकत बढ़ाएँ', 'Increase power'), 'power_up', 0, actions.pu, 'W');
    bind(tr('ताकत घटाएँ', 'Decrease power'), 'power_down', 0, actions.pd, 'S');
    const info = Hub.el('button', { type: 'button', text: tr('विस्तार से सुनें', 'Hear details'), 'aria-keyshortcuts': 'H' });
    info.addEventListener('click', () => { Hub.press('info'); clearTimeout(briefT); prefix = ''; speak(detail()); }); bar.append(info);
    bind(tr('शॉट मारें', 'Shoot'), 'shoot', 0, actions.shoot, 'Space');
    bind(tr('कोच का सुझाव सुनें', 'Hear coach suggestion'), 'hint', 0, actions.hint, 'T');
    bind(tr('सुझाव लागू करें', 'Apply suggestion'), 'apply', 0, actions.apply, 'Y');
    const coachBtn = Hub.el('button', { type: 'button', text: tr('सिखाने वाला मोड चालू या बंद', 'Coach mode on or off') });
    coachBtn.addEventListener('click', () => {
      if (online) { speak(notOnline()); return; }
      coachOn = !coachOn; Hub.store.set('coach', coachOn); Hub.press('coach');
      speak(coachOn ? tr('सिखाने वाला मोड चालू. हर टर्न पर मैं आपको सुझाव दूँगा.', 'Coach mode on. I will give you a suggestion on every turn.') : tr('सिखाने वाला मोड बंद.', 'Coach mode off.'));
    });
    bar.append(coachBtn);
    const scoreBtn = Hub.el('button', { type: 'button', text: tr('स्कोर सुनें', 'Hear score'), 'aria-keyshortcuts': 'C' });
    scoreBtn.addEventListener('click', () => { Hub.press('score'); speak(scoreText()); }); bar.append(scoreBtn);
    const exitBtn = Hub.el('button', { type: 'button', text: tr('खेल से बाहर', 'Leave game') });
    exitBtn.addEventListener('click', () => {
      Hub.press('exit');
      if (online && !over) {
        const now = Date.now();
        if (now - exitArmedAt > 6000) { exitArmedAt = now; speak(tr('बाहर जाने पर आप मैच हार जाएँगे. पक्का बाहर जाना है तो यही बटन छह सेकंड के अंदर दोबारा दबाइए.', 'If you leave, you lose the match. To leave, press this button again within six seconds.')); return; }
      }
      if (online) Hub.net.call('POST', '/api/rooms/leave', {});
      exit();
    });
    bar.append(exitBtn);
    function showEndButtons() { Hub.focus(exitBtn); }

    function onKey(e) {
      if (e.ctrlKey || e.altKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === ' ' && e.target.tagName === 'BUTTON') return;
      const m = { q: actions.sl, e: actions.sr, a: actions.al, d: actions.ar, x: actions.straight, z: actions.centre, f: actions.fine, n: actions.next, w: actions.pu, s: actions.pd, ' ': actions.shoot, t: actions.hint, y: actions.apply }[k];
      if (m) { e.preventDefault(); if (canAct()) m(); }
      else if (k === 'h') { e.preventDefault(); info.click(); } else if (k === 'c') { e.preventDefault(); scoreBtn.click(); }
    }
    document.addEventListener('keydown', onKey);

    // ---------- शुरुआत ----------
    world.placeStriker(500); draw();
    if (online) {
      statusEl.textContent = tr('मैच से जुड़ रहे हैं', 'Joining the match'); pollOnce().then(schedulePoll);
    } else {
      updateStatus();
      later(() => {
        const intro = demo ? tr('यह डेमो मैच है. दो कंप्यूटर खिलाड़ी खेल रहे हैं और मैं हर शॉट के बाद बताऊँगा कि क्या हुआ. असली खेल में आप स्ट्राइकर को बाएँ दाएँ करेंगे, निशाना लगाएँगे, ताकत चुनेंगे और शॉट मारेंगे. ', 'This is a demo match. Two computer players are playing, and after every shot I will tell you what happened. In a real game you move the striker left and right, set your aim, choose the power and shoot. ') : '';
        speak(intro + tr(`खेल शुरू. ${rules.modeText()} ${rules.startText(names)} स्ट्राइकर बीच में है.`, `Game started. ${rules.modeText()} ${rules.startText(names)} The striker is in the centre.`));
        afterSpeech();
      }, 1200);
    }
    Hub.focus(statusEl);

    return {
      destroy() {
        destroyed = true; document.removeEventListener('keydown', onKey); cancelAnimationFrame(raf);
        clearTimeout(pollT); timers.forEach(clearTimeout); timers.clear(); Hub.stopSpeech();
      },
    };
  }

  Carrom.startGame = startGame;
})();

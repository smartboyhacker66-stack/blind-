'use strict';
// Blind Hub shared audio + speech layer for the web mini-games (Aeroplane, Titanic).
// Goals: effects never drown out speech. A limiter sits on the output, effects are
// ducked while anything is being spoken (screen reader live region, built-in voice,
// or Android TTS), and the user can set the effects volume.
(function () {
  const BASE = 0.8;      // headroom: effects volume 100% maps to this bus gain
  const DUCK = 0.28;     // effects level while speech is playing

  function create(o) {
    o = o || {};
    const A = { hi: !!o.hi, soundOn: o.sound !== false, voiceOn: o.voice !== false, vol: 0.6, lastSaid: '', ac: null, bus: null, out: null, noiseBuf: null };
    try { const v = parseFloat(localStorage.getItem('bh_fx_vol')); if (v >= 0.1 && v <= 1) A.vol = v; } catch (e) { /* storage may be unavailable */ }

    const live = document.getElementById('live');
    let duck = 1, speechUntil = 0, timer = null, nativeOn = false, nativeSince = 0, queued = 0;

    const level = () => (A.soundOn ? A.vol * duck * BASE : 0);
    function applyLevel(tc) {
      if (!A.ac || !A.bus) return;
      const t = A.ac.currentTime;
      A.bus.gain.cancelScheduledValues(t);
      A.bus.gain.setTargetAtTime(level(), t, tc);
    }
    function setDuck(on) { const d = on ? DUCK : 1; if (d !== duck) { duck = d; applyLevel(on ? 0.04 : 0.3); } }
    function tick() {
      timer = null;
      const nat = nativeOn && Date.now() - nativeSince < 30000;
      if (nat || Date.now() < speechUntil) timer = setTimeout(tick, 120); else setDuck(false);
    }
    function noteSpeech(text, flush) {
      const est = 300 + text.length * (A.hi ? 65 : 52);   // rough speaking time in ms
      const now = Date.now();
      speechUntil = Math.min((flush ? now : Math.max(now, speechUntil)) + est, now + 25000);   // never mute effects for more than 25 s
      setDuck(true);
      if (!timer) timer = setTimeout(tick, 120);
    }
    /** Called by the Android host when the native TTS starts or stops. */
    A.nativeSpeech = function (on) {
      nativeOn = !!on;
      if (on) { nativeSince = Date.now(); setDuck(true); if (!timer) timer = setTimeout(tick, 120); }
      else speechUntil = Math.min(speechUntil, Date.now() + 250);
    };
    window.__nativeSpeech = A.nativeSpeech;

    /** Speak: always updates the live region (NVDA, JAWS, TalkBack read it); the built-in voice or Android TTS is added when enabled. */
    A.say = function (text, flush, atc) {
      if (!text) return;
      flush = flush !== false;
      A.lastSaid = text;
      if (live) {
        if (flush || live.textContent.length > 500) live.textContent = '';
        setTimeout(() => { live.textContent = (flush ? '' : live.textContent + ' ') + text; }, 30);
      }
      noteSpeech(text, flush);
      const nat = window.AndroidHub;
      if (nat && nat.speak) { try { nat.speak(text, flush); } catch (e) { /* ignore */ } return; }
      if (A.voiceOn && window.speechSynthesis) {
        try {
          if (flush) { speechSynthesis.cancel(); queued = 0; }
          const u = new SpeechSynthesisUtterance(text);
          u.lang = A.hi ? 'hi-IN' : 'en-US';
          if (atc) { u.pitch = 0.8; u.rate = 1.05; }
          const done = () => { queued = Math.max(0, queued - 1); if (!queued) speechUntil = Math.min(speechUntil, Date.now() + 200); };
          u.onend = done; u.onerror = done;
          queued++;
          speechSynthesis.speak(u);
        } catch (e) { /* speech must never break the game */ }
      }
    };
    A.stopSpeech = function () { speechUntil = 0; try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* ignore */ } queued = 0; };

    A.init = function () {
      if (A.ac) { if (A.ac.state === 'suspended') A.ac.resume(); return true; }
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return false;
      A.ac = new C();
      const comp = A.ac.createDynamicsCompressor();   // limiter: stacked effects cannot clip or swamp the voice
      comp.threshold.value = -22; comp.knee.value = 10; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.25;
      A.bus = A.ac.createGain(); A.bus.gain.value = level();
      A.bus.connect(comp); comp.connect(A.ac.destination);
      A.out = A.bus;
      A.noiseBuf = A.ac.createBuffer(1, A.ac.sampleRate * 2, A.ac.sampleRate);
      const d = A.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    };
    A.setSound = function (on) { A.soundOn = !!on; applyLevel(0.05); };
    /** dir +1 or -1; returns the new percentage. */
    A.volStep = function (dir) {
      A.vol = Math.min(1, Math.max(0.1, Math.round((A.vol + dir * 0.1) * 10) / 10));
      try { localStorage.setItem('bh_fx_vol', String(A.vol)); } catch (e) { /* ignore */ }
      applyLevel(0.05);
      return Math.round(A.vol * 100);
    };

    A.tone = function (freq, ms, vol, type, pan, delay) {
      if (!A.ac || !A.soundOn) return;
      vol = vol == null ? 0.4 : vol; type = type || 'sine'; delay = delay || 0;
      const t = A.ac.currentTime + delay, d = ms / 1000, osc = A.ac.createOscillator(), g = A.ac.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol, Math.max(t + 0.011, t + d - 0.01)); g.gain.linearRampToValueAtTime(0, t + d);
      osc.connect(g);
      let n = g;
      if (pan && A.ac.createStereoPanner) { const p = A.ac.createStereoPanner(); p.pan.value = pan; g.connect(p); n = p; }
      n.connect(A.out); osc.start(t); osc.stop(t + d + 0.02);
    };
    A.burst = function (ms, freq, qv, vol, type) {
      if (!A.ac || !A.soundOn) return;
      vol = vol == null ? 0.5 : vol;
      const t = A.ac.currentTime, s = A.ac.createBufferSource(), f = A.ac.createBiquadFilter(), g = A.ac.createGain();
      s.buffer = A.noiseBuf; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = qv;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      s.connect(f); f.connect(g); g.connect(A.out); s.start(t); s.stop(t + ms / 1000 + 0.05);
    };
    return A;
  }

  window.HubAudio = { create };
})();

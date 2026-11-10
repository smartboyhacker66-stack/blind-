'use strict';
// Blind Hub साझा कोर: भाषा, आवाज़ें (Web Audio), बोलना, नेटवर्क, वॉलेट, खेलों की सूची.
// क्लासिक स्क्रिप्ट है (module नहीं). सब कुछ window.Hub में.
(function () {
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bh_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bh_' + k, JSON.stringify(v)); } catch (e) { /* अनदेखा */ } },
    del(k) { try { localStorage.removeItem('bh_' + k); } catch (e) { /* अनदेखा */ } },
  };

  const Hub = { store, START_MONEY: 20000, games: {}, gameOrder: [] };

  // ---------- भाषा ----------
  Hub.lang = store.get('lang', 'en');
  Hub.isHindi = () => Hub.lang === 'hi';
  Hub.tr = (hi, en) => (Hub.lang === 'hi' ? hi : en);
  Hub.setLang = (c) => { Hub.lang = c; store.set('lang', c); document.documentElement.lang = c; };
  document.documentElement.lang = Hub.lang;

  // ---------- सेटिंग ----------
  Hub.soundOn = store.get('sound', true);
  Hub.voiceOn = store.get('voice', true);   // अपनी बोली (speechSynthesis). स्क्रीन रीडर के साथ बंद कर सकते हैं.
  Hub.setSound = (v) => { Hub.soundOn = !!v; store.set('sound', Hub.soundOn); if (!Hub.soundOn) Hub.sfx.stopAll(); };
  Hub.setVoice = (v) => { Hub.voiceOn = !!v; store.set('voice', Hub.voiceOn); if (!v && window.speechSynthesis) speechSynthesis.cancel(); };

  // ---------- DOM के औज़ार ----------
  Hub.el = (tag, attrs, kids) => {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    for (const c of (kids || [])) e.append(c);
    return e;
  };
  Hub.focus = (el) => { if (!el) return; if (!el.hasAttribute('tabindex') && !/^(BUTTON|INPUT|A|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute('tabindex', '-1'); setTimeout(() => el.focus(), 60); };
  Hub.heading = (parent, text, level = 1) => { const h = Hub.el('h' + level, { text }); parent.append(h); return h; };
  Hub.para = (parent, text) => { const p = Hub.el('p', { text }); parent.append(p); return p; };
  /** बटन: key हो तो ui_<key> आवाज़ बजती है. */
  Hub.button = (parent, text, key, onClick) => {
    const b = Hub.el('button', { type: 'button', text });
    b.addEventListener('click', () => { if (key) Hub.press(key); onClick && onClick(b); });
    parent.append(b);
    return b;
  };

  // ---------- बोलना ----------
  let live = null;
  function liveRegion() {
    if (!live) {
      live = document.getElementById('hub-live') || Hub.el('div', { id: 'hub-live', 'aria-live': 'assertive', 'aria-atomic': 'true', role: 'status', class: 'sr-only' });
      if (!live.parentNode) document.body.append(live);
    }
    return live;
  }
  /** voice: 0 खेल, 1 घोषणा (महिला), 2 पुरुष, 3 महिला, 4 गार्ड/कंट्रोल. */
  Hub.say = (text, opts) => {
    opts = opts || {};
    const flush = opts.flush !== false, voice = opts.voice || 0;
    if (!text) return;
    const r = liveRegion();
    if (flush) r.textContent = '';
    setTimeout(() => { r.textContent = (flush ? '' : r.textContent + ' ') + text; }, 30);
    if (Hub.voiceOn && window.speechSynthesis) {
      try {
        if (flush) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = Hub.isHindi() ? 'hi-IN' : 'en-US';
        const pr = { 1: [1.25, 0.92], 2: [0.85, 1], 3: [1.35, 1.05], 4: [0.75, 0.95] }[voice] || [1, 1];
        u.pitch = pr[0]; u.rate = pr[1];
        speechSynthesis.speak(u);
      } catch (e) { /* बोली न चले तो भी खेल चले */ }
    }
  };
  Hub.stopSpeech = () => { if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* अनदेखा */ } };

  // ---------- आवाज़ें ----------
  let ctx = null, manifest = null;
  const buffers = new Map(), pending = new Map();
  const live_streams = new Set();
  function ac() {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; ctx = new C(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  Hub.audioContext = ac;
  function xhr(url, type) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('GET', url); x.responseType = type;
      x.onload = () => ((x.status === 200 || x.status === 0) && x.response ? res(x.response) : rej(new Error('load')));
      x.onerror = () => rej(new Error('net'));
      x.send();
    });
  }
  const AUDIO_DIR = '../assets/audio/';
  Hub.audioReady = xhr(AUDIO_DIR + 'manifest.json', 'json').then((m) => { manifest = m; }).catch(() => { manifest = {}; });
  function load(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (pending.has(name)) return pending.get(name);
    const p = Hub.audioReady.then(() => {
      const ext = manifest && manifest[name];
      if (!ext) return null;
      return xhr(AUDIO_DIR + name + '.' + ext, 'arraybuffer').then((ab) => new Promise((res) => ac().decodeAudioData(ab, res, () => res(null))));
    }).then((b) => { if (b) buffers.set(name, b); pending.delete(name); return b; }).catch(() => { pending.delete(name); return null; });
    pending.set(name, p);
    return p;
  }
  Hub.preload = (names) => Promise.all(names.map(load));

  function startSource(name, vol, rate, loop, left, right) {
    const h = { stopped: false, src: null, gain: null, pan: null, stop() { this.stopped = true; try { this.src && this.src.stop(); } catch (e) { /* अनदेखा */ } live_streams.delete(this); },
      tune(v, r) { if (!this.gain) return; const t = ac().currentTime; this.gain.gain.setTargetAtTime(v, t, 0.05); if (r != null) this.src.playbackRate.setTargetAtTime(Math.min(2, Math.max(0.5, r)), t, 0.05); },
      tuneLR(l, r, rate2) { if (!this.gain) return; const t = ac().currentTime; const v = Math.max(l, r, 0.0001); this.gain.gain.setTargetAtTime(v, t, 0.05); if (this.pan) this.pan.pan.setTargetAtTime((r - l) / v, t, 0.05); if (rate2 != null) this.src.playbackRate.setTargetAtTime(Math.min(2, Math.max(0.5, rate2)), t, 0.05); } };
    live_streams.add(h);
    load(name).then((buf) => {
      if (!buf || h.stopped) return;
      const c = ac();
      const s = c.createBufferSource(); s.buffer = buf; s.loop = !!loop;
      s.playbackRate.value = Math.min(2, Math.max(0.5, rate || 1));
      const g = c.createGain(); g.gain.value = vol;
      let node = g;
      if (left != null) { const p = c.createStereoPanner(); const v = Math.max(left, right, 0.0001); g.gain.value = v; p.pan.value = (right - left) / v; g.connect(p); h.pan = p; node = p; }
      s.connect(g); node.connect(c.destination);
      s.onended = () => live_streams.delete(h);
      s.start(); h.src = s; h.gain = g;
    });
    return h;
  }
  Hub.sfx = {
    play(name, vol = 1, rate = 1) { if (!Hub.soundOn) return null; return startSource(name, vol, rate, false); },
    loop(name, vol = 0.6, rate = 1) { if (!Hub.soundOn) return { stop() {}, tune() {}, tuneLR() {} }; return startSource(name, vol, rate, true); },
    playLR(name, l, r, rate = 1) { if (!Hub.soundOn) return { stop() {}, tune() {}, tuneLR() {} }; return startSource(name, 1, rate, false, l, r); },
    /** सीधी सादी सुर की बीप (Android के SoundHelper जैसी). */
    tone(freq, ms, vol = 1, pan = 0) {
      if (!Hub.soundOn) return;
      const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime, d = ms / 1000;
      o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * 0.8, t + 0.005); g.gain.setValueAtTime(vol * 0.8, t + d - 0.005); g.gain.linearRampToValueAtTime(0, t + d);
      o.connect(g); let n = g; if (pan) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); n = p; }
      n.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
    },
    stopAll() { for (const h of Array.from(live_streams)) h.stop(); },
  };
  /** हर बटन की आवाज़ ui_<key>. pan: -1 बायाँ, 1 दायाँ. */
  Hub.press = (key, pan = 0) => { Hub.sfx.playLR('ui_' + key, pan > 0 ? 0.25 : 0.7, pan < 0 ? 0.25 : 0.7, 1); };

  // ---------- नेटवर्क ----------
  const SERVERS = ['https://blind-b81m.onrender.com', 'https://blind-b8lm.onrender.com'];
  const net = { base: store.get('net_base', SERVERS[0]), token: store.get('net_token', null), id: store.get('net_id', ''), name: store.get('net_name', ''), level: store.get('net_level', 1) };
  if (!SERVERS.includes(net.base)) net.base = SERVERS[0];
  net.saveSession = (id, name, token, level) => { Object.assign(net, { id, name, token, level: level || 1 }); store.set('net_id', id); store.set('net_name', name); store.set('net_token', token); store.set('net_level', net.level); };
  net.saveLevel = (l) => { net.level = l; store.set('net_level', l); };
  net.clearSession = () => { Object.assign(net, { id: '', name: '', token: null, level: 1 }); ['net_id', 'net_name', 'net_token', 'net_level'].forEach(store.del); };
  net.call = async (method, path, body, timeout = 20000) => {
    const headers = { 'Content-Type': 'application/json' };
    if (net.token) headers.Authorization = 'Bearer ' + net.token;
    const payload = body == null ? undefined : JSON.stringify(body);
    let code = -1, text = '';
    try {
      if (window.hubNative) { const r = await window.hubNative.request({ url: net.base + path, method, headers, body: payload, timeout }); code = r.code; text = r.text; }
      else { const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout); const r = await fetch(net.base + path, { method, headers, body: payload, signal: c.signal }); clearTimeout(t); code = r.status; text = await r.text(); }
    } catch (e) { code = -1; }
    let json = null; try { json = text ? JSON.parse(text) : {}; } catch (e) { json = null; }
    return { code, json, ok: code >= 200 && code < 300, error: (json && json.error) || '' };
  };
  net.ping = async (timeout = 90000) => {
    for (const u of [net.base].concat(SERVERS.filter((x) => x !== net.base))) {
      net.base = u;
      if ((await net.call('GET', '/api/ping', null, timeout)).ok) { store.set('net_base', u); return true; }
    }
    return false;
  };
  Hub.net = net;

  // ---------- वॉलेट (यूज़र आईडी से जुड़ा Firestore बैलेंस; लॉगिन न हो तो इसी कंप्यूटर में) ----------
  const wallet = {
    local() { return store.get('train_money_v2', Hub.START_MONEY); },
    /** ताज़ा बैलेंस. लॉगिन हो तो सर्वर से, वरना स्थानीय. */
    async get() {
      if (net.token) { const r = await net.call('GET', '/api/balance', null, 30000); if (r.ok && r.json && typeof r.json.balance === 'number') { store.set('train_money_v2', r.json.balance); return r.json.balance; } }
      return wallet.local();
    },
    /** kind: 'fine' या 'reward'. नया बैलेंस लौटाता है. */
    async apply(kind, amount) {
      const cur = wallet.local();
      const next = Math.max(0, kind === 'fine' ? cur - amount : cur + amount);
      store.set('train_money_v2', next);
      if (net.token) { const r = await net.call('POST', '/api/balance/apply', { kind, amount }, 30000); if (r.ok && r.json && typeof r.json.balance === 'number') { store.set('train_money_v2', r.json.balance); return r.json.balance; } }
      return next;
    },
  };
  Hub.wallet = wallet;

  // ---------- खेलों की सूची ----------
  /** def: { label(): string, key: 'ai' (बटन की आवाज़), mount(root, exit) -> {destroy()} } */
  Hub.registerGame = (id, def) => { Hub.games[id] = def; Hub.gameOrder.push(id); };

  window.Hub = Hub;
})();

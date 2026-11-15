'use strict';
// Blind Hub का शेल: स्प्लैश, मुख्य मेनू, स्थानीय, और, सेटिंग, सहायता, सूचनाएँ, ट्यूटोरियल और खेलों का मंच.
(function () {
  const app = document.getElementById('app');
  const tr = Hub.tr;
  let current = null, backFn = null, icf = true, notifList = null, announced = false, splashT = null;

  function show(build, back) {
    if (current && current.destroy) { try { current.destroy(); } catch (e) { /* अनदेखा */ } }
    clearTimeout(splashT); Hub.sfx.stopAll(); Hub.stopSpeech();
    app.textContent = ''; current = null; backFn = back || null;
    current = build(app) || null;
  }
  const head = (parent, text) => { const h = Hub.heading(parent, text); Hub.focus(h); return h; };
  const back = (parent, fn) => Hub.button(parent, tr('वापस', 'Back'), 'back', fn);

  // ---------- स्प्लैश ----------
  function splash() {
    show((r) => {
      const wrap = Hub.el('div', { class: 'center' }); r.append(wrap);
      head(wrap, 'Blind Indian Tech Support');
      Hub.para(wrap, tr('Blind Hub शुरू हो रहा है', 'Blind Hub is starting'));
      Hub.button(wrap, tr('छोड़ें', 'Skip'), 'skip', menu);
      Hub.audioReady.then(() => Hub.preload(['startup', 'ui_skip', 'ui_back']));
      splashT = setTimeout(() => Hub.sfx.play('startup'), 400);
      const t2 = setTimeout(menu, 4600);
      return { destroy() { clearTimeout(t2); } };
    });
  }

  // ---------- सूचनाएँ ----------
  async function refreshHome() {
    if (!(await Hub.net.ping(90000))) return;
    const n = await Hub.net.call('GET', '/api/notifications', null, 30000);
    if (n.ok && n.json) notifList = n.json.notifications || [];
    if (Hub.net.token) {
      const me = await Hub.net.call('GET', '/api/me', null, 30000);
      if (me.ok && me.json) Hub.net.saveLevel(me.json.level || 1); else if (me.code === 401) Hub.net.clearSession();
    }
    if (current && current.onHome) current.onHome();
  }
  const newCount = () => { if (!notifList) return 0; const seen = Hub.store.get('notif_seen', 0); return notifList.filter((n) => (n.at || 0) > seen).length; };
  const timeAgo = (at) => {
    const m = Math.max(0, Math.floor((Date.now() - at) / 60000));
    if (m < 1) return tr('अभी', 'just now'); if (m < 60) return tr(`${m} मिनट पहले`, `${m} minutes ago`);
    if (m < 1440) return tr(`${Math.floor(m / 60)} घंटे पहले`, `${Math.floor(m / 60)} hours ago`); return tr(`${Math.floor(m / 1440)} दिन पहले`, `${Math.floor(m / 1440)} days ago`);
  };

  // ---------- मुख्य मेनू ----------
  function menu() {
    show((r) => {
      head(r, tr('Blind Hub, मुख्य मेनू', 'Blind Hub, main menu'));
      const ident = Hub.para(r, '');
      const idText = () => (Hub.net.token && Hub.net.name ? tr(`${Hub.net.name}, लेवल ${Hub.net.level}`, `${Hub.net.name}, level ${Hub.net.level}`) : tr('मेहमान. ऑनलाइन खेलने के लिए लॉगिन कीजिए.', 'Guest. Sign in to play online.'));
      ident.textContent = idText(); ident.setAttribute('tabindex', '0');
      Hub.button(r, tr('और: ट्यूटोरियल, सेटिंग, सहायता', 'More: tutorial, settings, support'), 'settings', more);
      const nb = Hub.button(r, '', 'info', notifs);
      const nbText = () => { const n = newCount(); return n > 0 ? tr(`सूचनाएँ, ${n} नई`, `Notifications, ${n} new`) : tr('सूचनाएँ', 'Notifications'); };
      nb.textContent = nbText();
      Hub.button(r, tr('कंप्यूटर के साथ खेलें', 'Play against the computer'), 'ai', () => startCarrom({ mode: 'ai' }));
      Hub.button(r, tr('लोकल मल्टीप्लेयर, दोस्तों के साथ खेलें', 'Local multiplayer, play with friends'), 'local', localPanel);
      Hub.button(r, tr('ऑनलाइन मल्टीप्लेयर', 'Online multiplayer'), 'local', onlinePanel);
      for (const id of Hub.gameOrder) { const g = Hub.games[id]; Hub.button(r, g.label(), g.key || 'ai', () => startGame(id)); }
      const rb = Hub.button(r, '', 'rules', () => { icf = !icf; rb.textContent = rulesText(); Hub.say(rulesText()); });
      const rulesText = () => (icf ? tr('नियम: असली कैरम, पच्चीस अंक का मैच. बदलने के लिए दबाएँ', 'Rules: real carrom, match to twenty five points. Press to change') : tr('नियम: सादा खेल, सिर्फ़ एक बोर्ड. बदलने के लिए दबाएँ', 'Rules: simple game, one board only. Press to change'));
      rb.textContent = rulesText();
      setTimeout(() => { const n = newCount(); if (n > 0 && !announced) { announced = true; Hub.say(tr(`आपकी ${n} नई सूचनाएँ हैं.`, `You have ${n} new notifications.`), { flush: false }); } }, 1500);
      return { onHome() { ident.textContent = idText(); nb.textContent = nbText(); } };
    }, () => {});
  }

  function startCarrom(o) { o.rules = icf ? 'icf' : 'simple'; show((r) => Carrom.startGame(o, r, menu), menu); }
  function startGame(id) { show((r) => Hub.games[id].mount(r, menu), menu); }
  function onlinePanel() { show((r) => Carrom.mountOnline(r, icf ? 'icf' : 'simple', menu), menu); }

  function localPanel() {
    show((r) => {
      head(r, tr('लोकल मल्टीप्लेयर', 'Local multiplayer'));
      const l1 = Hub.el('label', { for: 'etP1', text: tr('खिलाड़ी 1 का नाम', 'Player 1 name') }), p1 = Hub.el('input', { id: 'etP1', type: 'text', autocomplete: 'off' });
      const l2 = Hub.el('label', { for: 'etP2', text: tr('खिलाड़ी 2 का नाम', 'Player 2 name') }), p2 = Hub.el('input', { id: 'etP2', type: 'text', autocomplete: 'off' });
      r.append(l1, p1, l2, p2);
      Hub.button(r, tr('शुरू करें', 'Start'), 'start', () => startCarrom({ mode: 'local', p1: p1.value, p2: p2.value }));
      back(r, menu);
    }, menu);
  }

  function notifs() {
    show((r) => {
      head(r, tr('सूचनाएँ', 'Notifications'));
      const list = Hub.el('div'); r.append(list);
      const render = () => {
        list.textContent = '';
        if (!notifList) { Hub.para(list, tr('सूचनाएँ लाई जा रही हैं. इंटरनेट चालू रखिए, पहली बार कुछ देर लग सकती है.', 'Loading notifications. Keep your internet on, the first time can take a while.')); return; }
        if (!notifList.length) Hub.para(list, tr('अभी कोई सूचना नहीं है.', 'There are no notifications.'));
        let newest = Hub.store.get('notif_seen', 0);
        for (const n of notifList) { const p = Hub.para(list, `${n.text}. ${timeAgo(n.at || 0)}`); p.setAttribute('tabindex', '0'); if ((n.at || 0) > newest) newest = n.at; }
        Hub.store.set('notif_seen', newest);
      };
      render(); back(r, menu);
      if (!notifList) refreshHome();
      return { onHome: render };
    }, menu);
  }

  // ---------- और / सेटिंग / सहायता ----------
  function more() {
    show((r) => {
      head(r, tr('और', 'More'));
      Hub.button(r, tr('ऑडियो ट्यूटोरियल', 'Audio tutorial'), 'tutorial', () => tutorial(0));
      Hub.button(r, tr('सेटिंग', 'Settings'), 'settings', settings);
      Hub.button(r, tr('सहायता', 'Support'), 'support', support);
      const c = Hub.para(r, 'Copyright © Blind Indian Tech Support 2026'); c.className = 'center'; c.setAttribute('tabindex', '0');
      back(r, menu);
    }, menu);
  }

  function settings() {
    show((r) => {
      head(r, tr('सेटिंग', 'Settings'));
      const soundT = () => (Hub.soundOn ? tr('आवाज़: चालू. बंद करने के लिए दबाएँ', 'Sound: on. Press to turn off') : tr('आवाज़: बंद. चालू करने के लिए दबाएँ', 'Sound: off. Press to turn on'));
      const voiceT = () => (Hub.voiceOn ? tr('अपनी बोली: चालू. स्क्रीन रीडर इस्तेमाल करें तो बंद कीजिए', 'Built-in voice: on. Turn off if you use a screen reader') : tr('अपनी बोली: बंद. चालू करने के लिए दबाएँ', 'Built-in voice: off. Press to turn on'));
      const sb = Hub.button(r, soundT(), null, () => { Hub.setSound(!Hub.soundOn); if (Hub.soundOn) Hub.press('fx'); sb.textContent = soundT(); Hub.say(soundT()); });
      const vb = Hub.button(r, voiceT(), 'fx', () => { Hub.setVoice(!Hub.voiceOn); vb.textContent = voiceT(); Hub.say(voiceT()); });
      const setL = (c) => { Hub.press('fx'); if (Hub.lang === c) return; Hub.setLang(c); settings(); };
      Hub.button(r, Hub.isHindi() ? 'English' : 'English, selected', null, () => setL('en'));
      Hub.button(r, Hub.isHindi() ? 'हिन्दी, चुनी हुई' : 'हिन्दी (Hindi)', null, () => setL('hi'));
      Hub.button(r, tr('वापस', 'Back'), 'back', more);
    }, more);
  }

  function support() {
    show((r) => {
      head(r, tr('सहायता', 'Support'));
      Hub.para(r, tr('शिकायत या सवालों के लिए संपर्क करें', 'Contact us for complaints or questions'));
      const a = Hub.el('a', { href: 'mailto:bits.headquarter505@gmail.com', class: 'link', text: 'bits.headquarter505@gmail.com' });
      a.addEventListener('click', (e) => { e.preventDefault(); if (window.hubNative) window.hubNative.open('mailto:bits.headquarter505@gmail.com'); else window.open('mailto:bits.headquarter505@gmail.com'); });
      const p = Hub.el('p', {}, [a]); r.append(p);
      back(r, more);
    }, more);
  }

  // ---------- ट्यूटोरियल ----------
  function tutorial(start) {
    show((r) => {
      const ch = Hub_TUTORIAL[Hub.isHindi() ? 'hi' : 'en'];
      let i = start;
      const title = Hub.heading(r, ''), body = Hub.para(r, '');
      const read = () => Hub.say(`${title.textContent}. ${body.textContent}`);
      const showCh = (n) => {
        i = n;
        title.textContent = tr(`अध्याय ${n + 1} में से ${ch.length}: ${ch[n][0]}`, `Chapter ${n + 1} of ${ch.length}: ${ch[n][0]}`);
        body.textContent = ch[n][1]; Hub.focus(title); read();
      };
      Hub.button(r, tr('ज़ोर से पढ़ें', 'Read aloud'), 'info', read);
      Hub.button(r, tr('अगला अध्याय', 'Next chapter'), 'next_coin', () => { if (i < ch.length - 1) showCh(i + 1); else Hub.say(tr('यह आख़िरी अध्याय है.', 'This is the last chapter.')); });
      Hub.button(r, tr('पिछला अध्याय', 'Previous chapter'), 'back', () => { if (i > 0) showCh(i - 1); else Hub.say(tr('यह पहला अध्याय है.', 'This is the first chapter.')); });
      Hub.button(r, tr('डेमो मैच देखें', 'Watch a demo match'), 'demo', () => show((rr) => Carrom.startGame({ mode: 'demo', rules: 'icf' }, rr, () => tutorial(i)), () => tutorial(i)));
      Hub.button(r, tr('वापस', 'Back'), 'back', more);
      showCh(start);
    }, more);
  }

  // Esc या Backspace (लिखते समय नहीं) = वापस
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || (e.key === 'Backspace' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName))) {
      if (backFn) { e.preventDefault(); Hub.press('back'); backFn(); }
    }
  });

  window.Hub.shell = { menu, show };
  splash();
  refreshHome();
})();

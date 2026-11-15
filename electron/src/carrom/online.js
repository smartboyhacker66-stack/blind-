'use strict';
// ऑनलाइन मल्टीप्लेयर: जुड़ना, लॉगिन, लॉबी, कमरे. OnlineActivity.kt की नक़ल.
(function () {
  const tr = (hi, en) => Hub.tr(hi, en);
  const net = Hub.net;
  const spoken = (s) => s.match(/.{1,4}/g).map((c) => c.split('').join(' ')).join(',  ');

  function mountOnline(root, rules, exit) {
    let stage = 'connect', destroyed = false, busy = false, ticking = false, tickT = null, roomsKey = '', waitKey = '', lastWait = 0, myCode = '', loop = null, game = null;
    const live = (msg) => Hub.say(msg);
    const errBox = Hub.el('p', { role: 'alert' });

    function clearView() { root.textContent = ''; clearTimeout(tickT); if (loop) { loop.stop(); loop = null; } }
    function heading(text) { const h = Hub.heading(root, text); Hub.focus(h); return h; }
    function field(label, id, type = 'text', max = 40) {
      const l = Hub.el('label', { for: id, text: label }); const i = Hub.el('input', { id, type, maxlength: String(max), autocomplete: 'off' });
      root.append(l, i); return i;
    }

    // ---------- सर्वर से जुड़ना ----------
    async function connect() {
      stage = 'connect'; clearView();
      heading(tr('सर्वर से जुड़ रहे हैं', 'Connecting to the server'));
      const st = Hub.para(root, tr('पहली बार में एक मिनट तक लग सकता है. कृपया रुकिए.', 'The first time this can take up to a minute. Please wait.'));
      loop = Hub.sfx.loop('net_wait', 0.6);
      const ok = await net.ping();
      if (destroyed) return;
      if (loop) { loop.stop(); loop = null; }
      if (!ok) {
        st.textContent = tr('सर्वर से नहीं जुड़ पाए. इंटरनेट जाँचिए और दोबारा कोशिश कीजिए.', 'Could not connect to the server. Check your internet and try again.');
        live(st.textContent);
        Hub.button(root, tr('दोबारा कोशिश करें', 'Try again'), 'info', connect);
        Hub.button(root, tr('वापस', 'Back'), 'back', exit);
        return;
      }
      Hub.sfx.play('net_connected');
      if (!net.token) return showAuth();
      const me = await net.call('GET', '/api/me');
      if (destroyed) return;
      if (me.ok) { if (me.json) net.saveLevel(me.json.level || 1); showLobby(); } else { if (me.code === 401) net.clearSession(); showAuth(); }
    }

    // ---------- लॉगिन ----------
    function authError(r) {
      if (r.code === -1) return tr('सर्वर से बात नहीं हो पाई. इंटरनेट जाँचिए.', 'Could not reach the server. Check your internet.');
      return ({
        bad_login: tr('आईडी या पासवर्ड ग़लत है.', 'The ID or password is wrong.'),
        locked: tr('बहुत ग़लत कोशिशें हुईं. पाँच मिनट बाद कोशिश कीजिए.', 'Too many wrong attempts. Try again in five minutes.'),
        bad_name: tr('नाम तीन से सोलह अक्षर का होना चाहिए, सिर्फ़ अक्षर, अंक और खाली जगह.', 'The name must be three to sixteen characters, using only letters, numbers and spaces.'),
        bad_password: tr('पासवर्ड ठीक आठ अक्षर या अंकों का होना चाहिए.', 'The password must be exactly eight letters or numbers.'),
        too_many: tr('बहुत कोशिशें हुईं. कुछ देर बाद कोशिश कीजिए.', 'Too many tries. Please try again later.'),
      })[r.error] || tr('कुछ गड़बड़ हुई. दोबारा कोशिश कीजिए.', 'Something went wrong. Please try again.');
    }
    function showAuth() {
      stage = 'auth'; clearView();
      heading(tr('ऑनलाइन मल्टीप्लेयर: लॉगिन', 'Online multiplayer: sign in'));
      Hub.para(root, tr('ऑनलाइन खेलने के लिए खाता चाहिए. नए हैं तो अपना नाम लिखिए, अक्षरों और अंकों वाला आठ अक्षर का पासवर्ड चुनिए और खाता बनाएँ दबाइए. आपको सोलह अक्षर की आईडी मिलेगी. दूसरे कंप्यूटर पर लॉगिन के लिए अपनी आईडी और पासवर्ड डालकर लॉगिन दबाइए.',
        'You need an account to play online. If you are new, type a name, choose an eight character password using letters and numbers, and press Create account. You will get a sixteen character ID. To sign in on another computer, type your ID and password and press Sign in.'));
      const id = field(tr('आपकी आईडी, सोलह अक्षर', 'Your ID, sixteen characters'), 'etId', 'text', 20);
      const pw = field(tr('पासवर्ड, आठ अक्षर या अंक', 'Password, eight letters or numbers'), 'etPw', 'password', 8);
      const nm = field(tr('आपका नाम, सिर्फ़ नए खाते के लिए', 'Your name, only for a new account'), 'etName', 'text', 16);
      root.append(errBox); errBox.textContent = '';
      const go = async (register) => {
        if (busy) return;
        if (pw.value.length !== 8) return live(tr('पासवर्ड ठीक आठ अक्षर या अंकों का होना चाहिए.', 'The password must be exactly eight letters or numbers.'));
        const body = { password: pw.value };
        if (register) { if (nm.value.trim().length < 3) return live(tr('नाम कम से कम तीन अक्षर का लिखिए.', 'Type a name of at least three characters.')); body.name = nm.value.trim(); }
        else { if (!id.value.trim()) return live(tr('अपनी आईडी डालिए.', 'Type your ID.')); body.id = id.value.trim(); }
        busy = true; live(register ? tr('खाता बन रहा है.', 'Creating your account.') : tr('लॉगिन हो रहा है.', 'Signing in.'));
        const r = await net.call('POST', register ? '/api/register' : '/api/login', body, 60000);
        busy = false; if (destroyed) return;
        if (r.ok && r.json) { net.saveSession(r.json.id, r.json.name, r.json.token, r.json.level || 1); if (register) showId(); else showLobby(); }
        else { errBox.textContent = authError(r); live(errBox.textContent); }
      };
      Hub.button(root, tr('लॉगिन', 'Sign in'), 'start', () => go(false));
      Hub.button(root, tr('खाता बनाएँ', 'Create account'), 'start', () => go(true));
      Hub.button(root, tr('वापस', 'Back'), 'back', exit);
    }
    function showId() {
      stage = 'id'; clearView();
      heading(tr('आपका खाता तैयार है', 'Your account is ready'));
      Hub.para(root, tr(`आपकी आईडी है: ${spoken(net.id)}. इसे लिख लीजिए या कॉपी कर लीजिए. नए कंप्यूटर पर लॉगिन के लिए यही आईडी और आपका पासवर्ड चाहिए होगा. पासवर्ड वही आठ अक्षर हैं जो आपने चुने.`,
        `Your ID is: ${spoken(net.id)}. Write it down or copy it. To sign in on a new computer you need this ID and your password. Your password is the eight characters you chose.`));
      Hub.button(root, tr('आईडी कॉपी करें', 'Copy ID'), 'fx', () => { try { navigator.clipboard.writeText(net.id); } catch (e) { /* अनदेखा */ } live(tr('आईडी कॉपी हो गई.', 'ID copied.')); });
      Hub.button(root, tr('आगे बढ़ें', 'Continue'), 'start', showLobby);
    }

    // ---------- लॉबी ----------
    function showLobby() {
      stage = 'lobby'; clearView(); roomsKey = '';
      heading(tr('ऑनलाइन लॉबी', 'Online lobby'));
      Hub.para(root, tr(`${net.name} के रूप में लॉगिन हैं, लेवल ${net.level}.`, `Signed in as ${net.name}, level ${net.level}.`));
      Hub.button(root, tr('खुला कमरा बनाएँ, कोई भी जुड़ने को कह सकता है', 'Create an open room, anyone can ask to join'), 'start', () => createRoom('public'));
      Hub.button(root, tr('कोड वाला निजी कमरा बनाएँ', 'Create a private room with a code'), 'start', () => createRoom('private'));
      const code = field(tr('कमरे का कोड, छह अंक', 'Room code, six digits'), 'etCode', 'text', 6);
      Hub.button(root, tr('कोड से जुड़ें', 'Join with code'), 'start', () => { const c = code.value.trim(); if (c.length !== 6) live(tr('छह अंकों का कोड डालिए.', 'Enter the six digit code.')); else join({ code: c }); });
      Hub.button(root, tr('सूची ताज़ा करें', 'Refresh the list'), 'info', () => { roomsKey = ''; doTick(); });
      root.append(Hub.el('h2', { id: 'roomsTitle', text: tr('खुले कमरे', 'Open rooms') }), Hub.el('div', { id: 'roomsList' }));
      Hub.button(root, tr('लॉग आउट', 'Sign out'), 'exit', () => { net.call('POST', '/api/logout', {}); net.clearSession(); showAuth(); });
      Hub.button(root, tr('मुख्य मेनू पर वापस', 'Back to main menu'), 'back', exit);
      scheduleTick(0);
    }
    function scheduleTick(ms) { clearTimeout(tickT); if (destroyed) return; tickT = setTimeout(async () => { await doTick(); scheduleTick(stage === 'room' ? 1500 : 3000); }, ms); }
    async function doTick() {
      if (ticking || (stage !== 'lobby' && stage !== 'room')) return; ticking = true;
      const st = await net.call('GET', '/api/state');
      const rooms = stage === 'lobby' ? await net.call('GET', '/api/rooms') : null;
      ticking = false; if (!destroyed) handleTick(st, rooms);
    }
    function handleTick(st, rooms) {
      if (st.code === 401) { net.clearSession(); showAuth(); return; }
      const j = st.json; if (!st.ok || !j) return;
      if (j.phase === 'open') { if (stage !== 'room') enterRoom(); renderOpen(j); }
      else if (j.phase === 'waiting') { if (stage !== 'room') enterRoom(); renderWaiting(j); }
      else if (j.phase === 'playing') launch();
      else if (j.phase === 'ended') net.call('POST', '/api/rooms/leave', {});
      else if (stage === 'room') {
        const n = { chosenOther: tr('कमरे वाले ने किसी और को चुना.', 'The room owner chose another player.'), roomClosed: tr('कमरा बंद हो गया.', 'The room was closed.'), expired: tr('कमरे का समय पूरा हो गया.', 'The room expired.') }[j.notice];
        if (n) live(n);
        showLobby();
      } else if (stage === 'lobby' && rooms) renderRooms(rooms);
    }
    function row(parent, text, fn) { Hub.button(parent, text, 'start', fn); }
    function renderRooms(r) {
      const j = r.json; if (!j) return;
      const arr = j.rooms || [], key = JSON.stringify(arr); if (key === roomsKey) return; roomsKey = key;
      const list = document.getElementById('roomsList'), title = document.getElementById('roomsTitle'); if (!list) return;
      list.textContent = '';
      title.textContent = tr(`खुले कमरे, अभी ${j.online} खिलाड़ी ऑनलाइन`, `Open rooms, ${j.online} players online now`);
      if (!arr.length) { Hub.para(list, tr('अभी कोई खुला कमरा नहीं है. आप एक बनाइए.', 'There are no open rooms right now. Create one.')); return; }
      for (const room of arr) {
        const simple = room.rules === 'simple';
        row(list, tr(`${room.owner} का कमरा${simple ? ', सादा खेल' : ''}, ${room.waiting} लोग इंतज़ार में. जुड़ने के लिए दबाइए.`, `${room.owner}'s room${simple ? ', simple game' : ''}, ${room.waiting} waiting. Press to ask to join.`), () => join({ roomId: room.roomId }));
      }
    }

    // ---------- कमरा ----------
    async function createRoom(type) {
      if (busy) return; busy = true;
      const r = await net.call('POST', '/api/rooms', { type, rules });
      busy = false; if (destroyed) return;
      if (r.ok) { enterRoom(); doTick(); } else if (r.error === 'already_in_room') doTick(); else live(tr('कमरा नहीं बन पाया. दोबारा कोशिश कीजिए.', 'Could not create the room. Please try again.'));
    }
    async function join(body) {
      if (busy) return; busy = true;
      const r = await net.call('POST', '/api/rooms/join', body);
      busy = false; if (destroyed) return;
      if (r.ok) { if (r.json && r.json.started) launch(); else { enterRoom(); doTick(); } return; }
      live({ not_found: tr('यह कमरा नहीं मिला या बंद हो चुका है.', 'That room was not found or is already closed.'), room_full: tr('इस कमरे की इंतज़ार-सूची भर चुकी है.', "This room's waiting list is full."), own_room: tr('यह आपका ही कमरा है.', 'This is your own room.'), already_in_room: tr('आप पहले से किसी कमरे में हैं.', 'You are already in a room.') }[r.error] || tr('जुड़ नहीं पाए. दोबारा कोशिश कीजिए.', 'Could not join. Please try again.'));
      if (r.error === 'already_in_room') doTick();
    }
    function enterRoom() {
      stage = 'room'; clearView(); waitKey = ''; lastWait = 0;
      heading(tr('आपका कमरा', 'Your room')).id = 'roomTitle';
      root.append(Hub.el('p', { id: 'roomInfo' }), Hub.el('div', { id: 'waitList' }));
      Hub.button(root, tr('कमरे का कोड कॉपी करें', 'Copy the room code'), 'fx', () => { try { navigator.clipboard.writeText(myCode); } catch (e) { /* अनदेखा */ } live(tr('कोड कॉपी हो गया.', 'Code copied.')); }).id = 'btnCopyCode';
      Hub.button(root, tr('कमरा छोड़ें', 'Leave the room'), 'exit', leaveRoom);
      scheduleTick(1500);
    }
    function renderOpen(j) {
      const room = j.room; myCode = room.code;
      const pub = room.type === 'public';
      document.getElementById('roomTitle').textContent = tr('आपका कमरा', 'Your room');
      document.getElementById('roomInfo').textContent = tr(`कमरे का कोड: ${spoken(myCode).replace(/,  /g, ' ')}. इसे दोस्त को भेज दीजिए${pub ? ', या खुले कमरों की सूची से जुड़ने वालों का इंतज़ार कीजिए.' : '.'}`,
        `Room code: ${spoken(myCode).replace(/,  /g, ' ')}. Send it to a friend${pub ? ', or wait for players to ask to join from the open rooms list.' : '.'}`);
      document.getElementById('btnCopyCode').hidden = false;
      const arr = j.waiting || [], key = JSON.stringify(arr); if (key === waitKey) return; waitKey = key;
      if (arr.length > lastWait) { Hub.sfx.play('turn_change'); live(tr(`${arr.length} खिलाड़ी इंतज़ार में हैं.`, `${arr.length} players are waiting.`)); }
      lastWait = arr.length;
      const list = document.getElementById('waitList'); list.textContent = '';
      for (const w of arr) row(list, tr(`${w.name} खेलना चाहते हैं. ${w.name} के साथ मैच शुरू करने के लिए दबाइए.`, `${w.name} wants to play. Press to start a match with ${w.name}.`), () => accept(w.id));
    }
    function renderWaiting(j) {
      document.getElementById('roomTitle').textContent = tr('इंतज़ार', 'Waiting');
      document.getElementById('roomInfo').textContent = tr(`${j.owner} के चुनने का इंतज़ार है. आप ${j.waitingCount} इंतज़ार करने वालों में से नंबर ${j.position} पर हैं.`, `Waiting for ${j.owner} to choose a player. You are number ${j.position} of ${j.waitingCount} waiting.`);
      document.getElementById('btnCopyCode').hidden = true;
      document.getElementById('waitList').textContent = ''; waitKey = '';
    }
    async function accept(userId) {
      if (busy) return; busy = true;
      const r = await net.call('POST', '/api/rooms/accept', { userId });
      busy = false; if (destroyed) return;
      if (r.ok) doTick(); else live(tr('यह खिलाड़ी अब उपलब्ध नहीं है.', 'That player is no longer available.'));
    }
    async function leaveRoom() { await net.call('POST', '/api/rooms/leave', {}); if (!destroyed) showLobby(); }

    function launch() {
      if (game || destroyed) return;
      clearTimeout(tickT); stage = 'game'; clearView();
      game = Carrom.startGame({ mode: 'online' }, root, () => { if (game) { game.destroy(); game = null; } if (!destroyed) showLobby(); });
    }

    connect();
    return { destroy() { destroyed = true; clearTimeout(tickT); if (loop) loop.stop(); if (game) game.destroy(); } };
  }

  Carrom.mountOnline = mountOnline;
})();

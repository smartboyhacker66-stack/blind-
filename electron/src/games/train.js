'use strict';
// Train Simulator: TrainActivity.kt और TrainData.kt का JS रूप.
// नए तरीक़े: (A) हर स्टेशन पर पक्का 40 सेकंड का रुकने का टाइमर, (C) सबसे ऊपर का बटन (चलने को तैयार / स्थिति सुनें).
(function () {
  const tr = (hi, en) => Hub.tr(hi, en);

  // ================= TrainData =================
  class Station { constructor(hi, en, main) { this.hi = hi; this.en = en; this.main = !!main; } name() { return tr(this.hi, this.en); } }
  class Route {
    constructor(hi, en, stations, o) {
      o = o || {};
      this.hi = hi; this.en = en; this.stations = stations;
      this.maxKmh = o.maxKmh || 80; this.kms = o.kms || null;
      this.trainNo = o.trainNo || '98045'; this.trainName = o.trainName || 'Blind Hub Local';
    }
    title() { return tr(this.hi, this.en); }
    hopM(i, j) {
      if (!this.kms) return HOP_M;
      const real = Math.abs(this.kms[j] - this.kms[i]);
      return Math.max(1500, 1200 + 26 * real);
    }
  }
  const HOP_M = 700;
  const S = (hi, en, main) => new Station(hi, en, main);
  const csmt = S('छत्रपति शिवाजी महाराज टर्मिनस', 'CSMT', true), masjid = S('मस्जिद', 'Masjid'), sandhurst = S('सैंडहर्स्ट रोड', 'Sandhurst Road'),
    dockyard = S('डॉकयार्ड रोड', 'Dockyard Road'), reay = S('रे रोड', 'Reay Road'), cotton = S('कॉटन ग्रीन', 'Cotton Green'), sewri = S('शिवड़ी', 'Sewri'),
    wadala = S('वडाला रोड', 'Wadala Road', true), gtb = S('जीटीबी नगर', 'GTB Nagar'), chuna = S('चुनाभट्टी', 'Chunabhatti'), kurla = S('कुर्ला', 'Kurla', true),
    tilak = S('तिलक नगर', 'Tilak Nagar'), chembur = S('चेंबूर', 'Chembur', true), govandi = S('गोवंडी', 'Govandi'), mankhurd = S('मानखुर्द', 'Mankhurd', true),
    vashi = S('वाशी', 'Vashi', true), sanpada = S('सानपाड़ा', 'Sanpada'), juinagar = S('जुईनगर', 'Juinagar'), nerul = S('नेरुल', 'Nerul', true),
    seawoods = S('सीवुड्स-दारावे', 'Seawoods-Darave'), belapur = S('सीबीडी बेलापुर', 'CBD Belapur', true), kharghar = S('खारघर', 'Kharghar'),
    mansarovar = S('मानसरोवर', 'Mansarovar'), khandeshwar = S('खांडेश्वर', 'Khandeshwar'), panvel = S('पनवेल', 'Panvel', true),
    kings = S('किंग्स सर्कल', "King's Circle"), mahim = S('माहिम', 'Mahim', true), bandra = S('बांद्रा', 'Bandra', true), khar = S('खार रोड', 'Khar Road'),
    santacruz = S('सांताक्रुज', 'Santacruz'), vileparle = S('विलेपार्ले', 'Vile Parle'), andheri = S('अंधेरी', 'Andheri', true),
    jogeshwari = S('जोगेश्वरी', 'Jogeshwari'), rammandir = S('राम मंदिर', 'Ram Mandir'), goregaon = S('गोरेगांव', 'Goregaon', true),
    thane = S('ठाणे', 'Thane', true), digha = S('दिघा गांव', 'Digha Gaon'), airoli = S('ऐरोली', 'Airoli', true), rabale = S('रबाले', 'Rabale'),
    ghansoli = S('घंसोली', 'Ghansoli'), koparkhairane = S('कोपरखैराने', 'Koparkhairane'), turbhe = S('तुर्भे', 'Turbhe', true),
    byculla = S('भायखला', 'Byculla', true), chinchpokli = S('चिंचपोकली', 'Chinchpokli'), curreyRoad = S('करी रोड', 'Currey Road'), parel = S('परेल', 'Parel'),
    dadar = S('दादर', 'Dadar', true), matunga = S('माटुंगा', 'Matunga'), sion = S('सायन', 'Sion'), vidyavihar = S('विद्याविहार', 'Vidyavihar'),
    ghatkopar = S('घाटकोपर', 'Ghatkopar', true), mmct = S('मुंबई सेंट्रल', 'Mumbai Central', true), bvi = S('बोरीवली', 'Borivali', true),
    vapi = S('वापी', 'Vapi'), surat = S('सूरत', 'Surat', true), bharuch = S('भरूच', 'Bharuch'), vadodara = S('वडोदरा जंक्शन', 'Vadodara Junction', true),
    ratlam = S('रतलाम जंक्शन', 'Ratlam Junction', true), nagda = S('नागदा जंक्शन', 'Nagda Junction'), bhawani = S('भवानी मंडी', 'Bhawani Mandi'),
    kota = S('कोटा जंक्शन', 'Kota Junction', true), sawai = S('सवाई माधोपुर', 'Sawai Madhopur'), gangapur = S('गंगापुर सिटी', 'Gangapur City'),
    bharatpur = S('भरतपुर जंक्शन', 'Bharatpur Junction'), mathura = S('मथुरा जंक्शन', 'Mathura Junction'), nizamuddin = S('हज़रत निज़ामुद्दीन', 'Hazrat Nizamuddin', true),
    ndls = S('नई दिल्ली', 'New Delhi', true);
  const harbourMain = [csmt, masjid, sandhurst, dockyard, reay, cotton, sewri, wadala];
  const ROUTES = [
    new Route('राजधानी एक्सप्रेस: मुंबई सेंट्रल से नई दिल्ली', 'Rajdhani Express: Mumbai Central to New Delhi',
      [mmct, bvi, vapi, surat, bharuch, vadodara, ratlam, nagda, bhawani, kota, sawai, gangapur, bharatpur, mathura, nizamuddin, ndls],
      { maxKmh: 180, kms: [0, 30, 170, 263, 322, 392, 653, 694, 840, 920, 1028, 1092, 1211, 1244, 1377, 1384], trainNo: '12951', trainName: 'Mumbai Rajdhani Express' }),
    new Route('हार्बर लाइन: CSMT से पनवेल', 'Harbour line: CSMT to Panvel',
      harbourMain.concat([gtb, chuna, kurla, tilak, chembur, govandi, mankhurd, vashi, sanpada, juinagar, nerul, seawoods, belapur, kharghar, mansarovar, khandeshwar, panvel])),
    new Route('हार्बर लाइन: CSMT से गोरेगांव', 'Harbour line: CSMT to Goregaon',
      harbourMain.concat([kings, mahim, bandra, khar, santacruz, vileparle, andheri, jogeshwari, rammandir, goregaon])),
    new Route('ट्रांस-हार्बर लाइन: ठाणे से पनवेल', 'Trans-Harbour line: Thane to Panvel',
      [thane, digha, airoli, rabale, ghansoli, koparkhairane, turbhe, sanpada, juinagar, nerul, seawoods, belapur, kharghar, mansarovar, khandeshwar, panvel]),
    new Route('ट्रांस-हार्बर लाइन: ठाणे से वाशी', 'Trans-Harbour line: Thane to Vashi',
      [thane, digha, airoli, rabale, ghansoli, koparkhairane, turbhe, sanpada, vashi]),
    new Route('सेंट्रल लाइन: CSMT से घाटकोपर', 'Central line: CSMT to Ghatkopar',
      [csmt, masjid, sandhurst, byculla, chinchpokli, curreyRoad, parel, dadar, matunga, sion, kurla, vidyavihar, ghatkopar]),
  ];

  const START_MONEY = 20000, SIGNAL_FINE = 8000, MINOR_FINE = 500, LATE_BRAKE_FINE = 50, GIVE_WAY_FINE = 100, COLLISION_FINE = 15000, REWARD = 1000;
  const DWELL_MS = 40000; // (A) हर स्टेशन पर पक्का 40 सेकंड

  const maleNames = ['रमेश यादव', 'आदित्य राव', 'जयंत कुलकर्णी', 'फ़ारूक़ शेख़', 'विजय पाटिल', 'संजय गोस्वामी', 'अरुण मिश्रा', 'सलीम अंसारी', 'हरीश नायर', 'प्रकाश दुबे'];
  const femaleNames = ['सुनीता शर्मा', 'मीना पटेल', 'नेहा वर्मा', 'अंजलि नायर', 'कविता जोशी', 'रुख़साना ख़ान', 'पूजा सिंह', 'लता मराठे', 'गीता रेड्डी', 'सीमा त्रिपाठी'];
  const otherTrains = [['12009', 'Shatabdi Express'], ['22209', 'Duronto Express'], ['12137', 'Punjab Mail'], ['11057', 'Amritsar Express'], ['19019', 'Dehradun Express'], ['12301', 'Howrah Rajdhani']];
  const controlQs = [
    ['सेफ़्टी चेन खींचूँ?', 'Should I pull the safety chain?', 'नहीं! जब तक स्टेशन मास्टर न कहें, चेन मत खींचिए. और हाँ, बचा हुआ समोसा इमरजेंसी नहीं है.', 'No! Do not pull the chain unless the station master says so. And no, a leftover samosa is not an emergency.'],
    ['गाड़ी कितनी देर रुकेगी?', 'How long will the train stop?', 'चलने का समय पूरा होने तक. यात्री चढ़ते रहें, चाय पीने वालों को छोड़कर.', 'Until the departure time. Let the passengers board, except the ones still buying tea.'],
    ['अगला सिग्नल कैसा है?', 'What is the next signal?', 'आगे का सिग्नल हरा है, गति बनाए रखिए.', 'The next signal is green, keep your speed.'],
    ['पीछे का इंजन लगाऊँ?', 'Should I attach the rear engine?', 'तभी लगाइए जब गाड़ी रुकी हो और सचमुच ज़रूरत हो.', 'Only when the train is stopped and you really need it.'],
    ['आगे वाली गाड़ी से रास्ता मांगूँ?', 'Should I ask the train ahead for a side?', 'मांग लीजिए, पर 80 किमी/घंटा से तेज़ चलने वाली गाड़ी को कोई साइड नहीं देगा.', 'You may ask, but no train going faster than 80 km per hour will give way.'],
    ['मौसम कैसा है?', 'What is the weather?', 'बारिश है, गति सीमित रखिए.', 'It is raining. Keep the speed limited.'],
    ['यात्री क्या कह रहे हैं?', 'What are the passengers saying?', 'कुछ नाराज़ हैं, कुछ ख़ुश. चाय वाला भी आपको सलाम कर रहा है.', 'Some are angry, some are happy. Even the tea seller is waving at you.'],
    ['ड्यूटी कब ख़त्म होगी?', 'When does my duty end?', 'आख़िरी स्टेशन पर. तब तक चाय मत मांगिए.', 'At the last station. Until then, do not ask for tea.'],
    ['ब्रेक छोड़ सकता हूँ?', 'Can I release the brake?', 'पहले बताइए कि आप क्या करने वाले हैं, फिर ब्रेक छोड़िए.', 'Tell us what you plan first, then release the brake.'],
  ];

  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a)); // [a,b)
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const nowMs = () => performance.now();
  const digits = (s) => String(s).split('').join(' ');
  const rupees = (n) => tr(n + ' रुपये', n + ' game rupees');

  function mount(root, exitGame) {
    let destroyed = false;
    const timeouts = new Set();
    let ticker = null;
    const later = (fn, ms) => { const id = setTimeout(() => { timeouts.delete(id); if (!destroyed) fn(); }, ms); timeouts.add(id); return id; };

    const content = Hub.el('div', { class: 'game-train' });
    root.append(content);

    // ---- यात्रा की योजना ----
    let screen = 'routes';
    let route = ROUTES[0], idxs = [], seq = [], stationPos = [], stops = [], maxKmh = 80, trainNo = '', trainName = '';
    let platAnn = [], sigPos = [], sigRed = [];
    // ---- खेल की स्थिति ----
    let phase = 0, pos = 0, speed = 0, targetKmh = 0, braking = false, brakeDecel = 0, curIdx = 0, nextIdx = 1;
    let money = Hub.wallet.local(), practice = false, missed = 0, complaints = 0, violations = 0;
    let departing = false, scheduledAt = 0, lateStage = 0, lastAnnounce = '', lastApproach = 0, lastJoint = 0;
    let cueNext = 0, shortTold = false, markTold = false, platNow = 1, sigIdx = 1, sigState = 0, redGreenAt = 0, redCleared = false;
    let passStarted = false, passActive = false, nextAmbientPass = 0;
    let engineStream = null, humStream = null, rollStream = null, brakeStream = null, rollKind = -1, jerkCountdown = 0;
    let engineOn = true, chainOn = false, silentDepart = false, readyPressed = false, nextChainCheck = 0, nextRadio = 0;
    let rearEngine = false, lastBrakeHeavy = false, yardStart = false, giveWayPending = false, driverName = '';
    const reactions = [];
    let lastControl = '', lateBrakeCharged = false, coachFan = false, coachAc = false, yardAnnounced = false, journeyStart = 0;
    let otherTrack = 0, otherTrackUntil = 0, otherNo = '', otherName = '', otherFrom = '', otherTo = '', otherDriver = '', otherKmh = 0;
    let nextSideReq = 0, nextTrackInfo = 0, sideDialogOpen = false, collisionNote = '';
    let giveWayDeadline = 0, nextGiveWay = 0, complaintView = null, passTicks = 0, passStream = null, passTimer = null;
    let topBtn = null, topLabel = '', statusEl = null, timerEl = null, dynBox = null, countdownMarks = {};
    const fast = () => maxKmh > 100;
    const feel = () => Hub.store.get('train_feel', 2);

    // ================= बोली =================
    function say(text, flush = true, voice = 0) {
      if (flush) lastAnnounce = text;
      Hub.say(text, { flush, voice });
    }
    function pa(text) {
      if (silentDepart) return;
      Hub.sfx.play('train_pa', 0.8);
      later(() => say(text, true, 1), 1500);
    }
    function control(text, flush = true) { lastControl = text; say(text, flush, 4); }

    // ================= स्क्रीन के औज़ार =================
    function clearScreen() {
      content.textContent = '';
      stopTicker();
      stopLoops();
      dynBox = null; topBtn = null; statusEl = null; timerEl = null; complaintView = null;
    }
    const title = (t) => { const h = Hub.heading(content, t, 1); Hub.focus(h); return h; };
    const info = (t) => Hub.para(content, t);
    const add = (t, key, fn) => Hub.button(content, t, key === undefined ? 'start' : key, fn);
    const mk = (parent, t, key, fn) => Hub.button(parent, t, key, fn);

    // ================= 1. रास्ता =================
    function feelText() {
      const f = feel();
      return f === 0 ? tr('सिर्फ़ स्क्रीन पर', 'screen only') : f === 1 ? tr('सिर्फ़ आवाज़ में', 'voice only') : tr('स्क्रीन और आवाज़ दोनों', 'screen and voice');
    }
    function screenRoutes() {
      screen = 'routes';
      clearScreen();
      title(tr('ट्रेन सिम्युलेटर', 'Train Simulator'));
      const bal = info('');
      const setBal = () => {
        bal.textContent = tr(
          'आप मोटरमैन हैं. अपना रास्ता चुनिए. आपके खाते में ' + rupees(money) + ' हैं.' + (money === 0 ? ' पैसे ख़त्म हैं, इसलिए अभी अभ्यास यात्राएँ चलेंगी, जिनमें जुर्माना नहीं लगेगा.' : ''),
          'You are the motorman. Choose your route. Your balance is ' + rupees(money) + '.' + (money === 0 ? ' Your money is finished, so you will get practice journeys with no fines.' : ''));
      };
      setBal();
      Hub.wallet.get().then((m) => { if (!destroyed && screen === 'routes') { money = m; setBal(); } });
      for (const r of ROUTES) {
        add(tr(r.title() + ', ' + r.stations.length + ' स्टेशन, अधिकतम ' + r.maxKmh + ' किलोमीटर प्रति घंटा',
          r.title() + ', ' + r.stations.length + ' stations, top speed ' + r.maxKmh + ' kilometres per hour'), 'start', () => screenMode(r));
      }
      add(tr('यात्री की प्रतिक्रिया: ', 'Passenger reactions: ') + feelText(), 'fx', () => { Hub.store.set('train_feel', (feel() + 1) % 3); screenRoutes(); });
      add(tr('मुख्य मेनू पर वापस', 'Back to main menu'), 'back', () => exitGame());
    }

    // ================= 2. अपनी पसंद या ड्यूटी =================
    function screenMode(r) {
      screen = 'mode'; route = r; clearScreen();
      title(r.title());
      info(tr('अपनी यात्रा कैसे तय करेंगे?', 'How do you want to set up your journey?'));
      add(tr('अपनी पसंद के स्टेशन चुनूँगा', 'I will choose my own stations'), 'start', () => pickStart(r));
      add(tr('मुझे ड्यूटी दी जाए', 'Assign me a duty'), 'start', () => assignDuty(r));
      add(tr('वापस', 'Back'), 'back', () => screenRoutes());
    }
    function stationPicker(r, heading, exclude, onPick) {
      clearScreen();
      title(heading);
      const et = Hub.el('input', { type: 'text', maxlength: '30', 'aria-label': tr('स्टेशन का नाम खोजिए', 'Search station name'), placeholder: tr('स्टेशन का नाम खोजिए', 'Search station name') });
      content.append(et);
      const list = Hub.el('div');
      content.append(list);
      const fill = (q) => {
        list.textContent = '';
        r.stations.forEach((st, i) => {
          const ok = !q || st.hi.includes(q) || st.en.toLowerCase().includes(q.toLowerCase());
          if (i !== exclude && ok) mk(list, (i + 1) + '. ' + st.name(), 'start', () => onPick(i));
        });
      };
      fill('');
      et.addEventListener('input', () => fill(et.value.trim()));
      add(tr('वापस', 'Back'), 'back', () => screenMode(r));
    }
    function pickStart(r) { screen = 'pick'; stationPicker(r, tr('शुरू का स्टेशन चुनिए', 'Choose your starting station'), -1, (a) => pickEnd(r, a)); }
    function pickEnd(r, a) {
      screen = 'pick';
      stationPicker(r, tr(r.stations[a].name() + ' से चलेंगे. आख़िरी स्टेशन चुनिए', 'Starting at ' + r.stations[a].name() + '. Choose your last station'), a, (b) => pickPattern(r, a, b));
    }
    const indices = (a, b) => { const o = []; if (a <= b) for (let i = a; i <= b; i++) o.push(i); else for (let i = a; i >= b; i--) o.push(i); return o; };

    // ================= 3. कहाँ-कहाँ रुकेंगे =================
    function pickPattern(r, a, b) {
      screen = 'pattern'; clearScreen();
      const ix = indices(a, b), st = ix.map((i) => r.stations[i]);
      title(tr(st[0].name() + ' से ' + st[st.length - 1].name(), st[0].name() + ' to ' + st[st.length - 1].name()));
      info(tr('कितने स्टेशनों पर रुकेंगे? पहला और आख़िरी स्टेशन हमेशा रुकना है.', 'How many stations will you stop at? The first and last stations are always stops.'));
      add(tr('सभी स्टेशन, धीमी गाड़ी', 'All stations, slow train'), 'start', () => toTrain(r, ix, ix.map(() => true)));
      add(tr('सिर्फ़ मुख्य स्टेशन, फ़ास्ट', 'Main stations only, fast'), 'start', () => toTrain(r, ix, ix.map((_, i) => i === 0 || i === ix.length - 1 || st[i].main)));
      add(tr('मैं ख़ुद चुनूँगा', 'I will choose myself'), 'start', () => pickStops(r, ix));
      add(tr('वापस', 'Back'), 'back', () => screenMode(r));
    }
    function pickStops(r, ix) {
      screen = 'pattern'; clearScreen();
      const st = ix.map((i) => r.stations[i]);
      title(tr('रुकने के स्टेशन चुनिए', 'Choose your stops'));
      info(tr('हर स्टेशन पर दबाने से रुकना या न रुकना बदलता है.', 'Press a station to switch between stopping and not stopping.'));
      const flags = st.map(() => true);
      const label = (i) => (flags[i] ? tr(st[i].name() + ': रुकेगी', st[i].name() + ': stops') : tr(st[i].name() + ': नहीं रुकेगी', st[i].name() + ': does not stop'));
      st.forEach((s, i) => {
        if (i === 0 || i === st.length - 1) info(tr(s.name() + ': हमेशा रुकेगी', s.name() + ': always stops'));
        else { const btn = mk(content, label(i), 'fine', () => { flags[i] = !flags[i]; btn.textContent = label(i); Hub.say(label(i)); }); }
      });
      add(tr('चुनाव पूरा हुआ', 'Done'), 'start', () => toTrain(r, ix, flags));
      add(tr('वापस', 'Back'), 'back', () => screenMode(r));
    }
    function assignDuty(r) {
      const n = r.stations.length, gap = Math.min(5, n - 1);
      let a, b;
      do { a = rnd(0, n); b = rnd(0, n); } while (Math.abs(a - b) < gap);
      const ix = indices(a, b), st = ix.map((i) => r.stations[i]), all = Math.random() < 0.5;
      toTrain(r, ix, ix.map((_, i) => all || i === 0 || i === ix.length - 1 || st[i].main));
    }

    // ================= 4. ट्रेन का नंबर और नाम =================
    function toTrain(r, ix, fl) {
      route = r; idxs = ix; stops = fl; seq = ix.map((i) => r.stations[i]);
      screen = 'train'; clearScreen();
      const stopCount = fl.filter(Boolean).length;
      title(tr('आपकी ड्यूटी', 'Your duty'));
      info(tr(seq[0].name() + ' से ' + seq[seq.length - 1].name() + ' तक, कुल ' + seq.length + ' स्टेशन, जिनमें से ' + stopCount + ' पर रुकना है. अधिकतम रफ़्तार ' + r.maxKmh + ' किलोमीटर प्रति घंटा.',
        'From ' + seq[0].name() + ' to ' + seq[seq.length - 1].name() + ', ' + seq.length + ' stations in all, with ' + stopCount + ' stops. Top speed ' + r.maxKmh + ' kilometres per hour.'));
      const no = Hub.el('input', { type: 'text', inputmode: 'numeric', maxlength: '6', 'aria-label': tr('ट्रेन का नंबर, अंकों में', 'Train number, digits only') });
      const nm = Hub.el('input', { type: 'text', maxlength: '24', 'aria-label': tr('ट्रेन का नाम', 'Train name') });
      no.value = r.trainNo; nm.value = r.trainName;
      content.append(no, nm);
      add(yardStart ? tr('यार्ड से शुरू: चालू (बदलने के लिए दबाएँ)', 'Start from yard: on (press to change)') : tr('यार्ड से शुरू: बंद (बदलने के लिए दबाएँ)', 'Start from yard: off (press to change)'),
        'start', () => { yardStart = !yardStart; toTrain(r, ix, fl); });
      add(tr('यात्रा शुरू करें', 'Start the journey'), 'start', () => {
        const n = no.value.replace(/\D/g, '').slice(0, 6);
        const t = nm.value.trim().replace(/[^\p{L}\p{M}\p{N} ]/gu, '').slice(0, 24);
        trainNo = n || r.trainNo; trainName = t || r.trainName;
        startJourney();
      });
      add(tr('वापस', 'Back'), 'back', () => screenMode(r));
    }

    // ================= सहायक: प्रतिक्रिया, कंट्रोल, कोच =================
    function reaction(text) {
      if (phase === 2 || screen !== 'drive') return;
      reactions.unshift(text);
      while (reactions.length > 4) reactions.pop();
      const f = feel();
      if (f !== 1 && complaintView) complaintView.textContent = reactions.join('\n');
      if (f !== 0) say(tr('यात्री: ', 'Passenger: ') + text, false, Math.random() < 0.5 ? 2 : 3);
    }
    function closeDyn() { if (dynBox) { dynBox.remove(); dynBox = null; } }
    function openDyn(heading) {
      closeDyn();
      dynBox = Hub.el('div', { role: 'group', 'aria-label': heading });
      const h = Hub.el('h2', { text: heading });
      dynBox.append(h);
      content.append(dynBox);
      Hub.focus(h);
      return dynBox;
    }
    function talkControl() {
      if (phase === 2) return;
      Hub.sfx.play('train_phone', 0.8);
      say(tr('कंट्रोल रूम से बात हो रही है. सवाल चुनिए.', 'Connected to control room. Choose a question.'), true, 4);
      const box = openDyn(tr('कंट्रोल रूम से सवाल:', 'Questions for control room:'));
      for (const q of controlQs) mk(box, tr(q[0], q[1]), 'info', () => { closeDyn(); control(tr(q[2], q[3])); });
      mk(box, tr('बातचीत बंद करें', 'End the call'), 'back', () => { closeDyn(); say(tr('बातचीत बंद.', 'Call ended.'), false); });
    }
    function announceStaff() {
      if (phase !== 1 && phase !== 0) return;
      yardAnnounced = true;
      control(tr('स्टेशन स्टाफ़ को सूचना दी गई: गाड़ी यार्ड से निकल रही है. मोटरमैन पटरी बदल सकते हैं.', 'Station staff informed: the train is leaving the yard. The motorman may change track.'));
    }
    function toggleFan() {
      coachFan = !coachFan;
      Hub.sfx.play(coachFan ? 'train_fan_on' : 'train_fan_off', 0.8);
      reaction(coachFan ? tr('कोच का पंखा चालू, यात्री राहत में हैं.', 'Coach fan is on, passengers are relieved.') : tr('कोच का पंखा बंद, यात्री गर्मी की शिकायत कर रहे हैं.', 'Coach fan is off, passengers are complaining about the heat.'));
    }
    function toggleAc() {
      coachAc = !coachAc;
      Hub.sfx.play(coachAc ? 'train_ac_on' : 'train_ac_off', 0.8);
      reaction(coachAc ? tr('कोच का AC चालू, यात्री ख़ुश हैं. एक अंकल बोले, अब तो गाड़ी में भी ठंडी चाय मिलेगी!', 'Coach AC is on, passengers are happy. One uncle says, now they will serve cold tea in the train too!') : tr('कोच का AC बंद, यात्री परेशान हैं.', 'Coach AC is off, passengers are upset.'));
    }
    const newDriverName = () => { driverName = Math.random() < 0.5 ? pick(maleNames) : pick(femaleNames); };

    // ---- दूसरी गाड़ियाँ ----
    function pickOther() {
      const t = pick(otherTrains);
      otherNo = t[0]; otherName = t[1];
      const names = route.stations.map((s) => s.name());
      otherFrom = pick(names);
      otherTo = pick(names.filter((n) => n !== otherFrom));
      otherDriver = Math.random() < 0.5 ? pick(maleNames) : pick(femaleNames);
      otherKmh = 40 + rnd(0, 101);
    }
    const otherDesc = () => tr(
      'ट्रेन नंबर ' + digits(otherNo) + ', ' + otherName + ', ' + otherFrom + ' से ' + otherTo + ' जा रही है, ड्राइवर ' + otherDriver + ', गति ' + otherKmh + ' किलोमीटर प्रति घंटा',
      'train number ' + digits(otherNo) + ', ' + otherName + ', going from ' + otherFrom + ' to ' + otherTo + ', driver ' + otherDriver + ', speed ' + otherKmh + ' kilometres per hour');

    function askSide() {
      if (phase !== 1) { say(tr('रास्ता सिर्फ़ चलती गाड़ी से मांग सकते हैं.', 'You can ask for a side only while the train is moving.'), false); return; }
      pickOther();
      const ours = speed * 3.6, d = otherDesc();
      if (ours > 80) {
        if (rnd(0, 100) < 30) control(tr('कंट्रोल रूम: ' + d + ' को आपको साइड देने को कहा गया, पर वह रुकी नहीं. कंट्रोल ने उसे रोका और उसके ड्राइवर से ₹100 जुर्माना वसूला.', 'Control: ' + d + ' was told to give you a side but did not stop. Control stopped it and collected a fine of 100 rupees from its driver.'));
        else control(tr('कंट्रोल रूम: ' + d + ' ने आपको साइड दे दी, क्योंकि आपकी गति 80 से ज़्यादा है.', 'Control: ' + d + ' has given you a side, because your speed is above 80.'));
        Hub.sfx.play('train_horn', 0.7);
        startPassingTrain(false);
      } else if (otherKmh > 80) {
        control(tr('कंट्रोल रूम: ' + d + '. यह गाड़ी 80 से तेज़ है, इसलिए यह किसी को साइड नहीं देती. आपको साइड नहीं मिलेगी.', 'Control: ' + d + '. This train is above 80 and gives side to nobody. You will not get a side.'));
      } else {
        control(tr('कंट्रोल रूम: ' + d + ' ने आपको साइड दे दी. कंट्रोल ने उसकी गति जाँची और उसे रोका. अब गति धीमी कीजिए और बाईं लूप से निकलिए.', 'Control: ' + d + ' has agreed to give you a side. Control checked its speed and stopped it. Now slow down and take the left loop.'));
        Hub.sfx.play('train_horn', 0.7);
        startPassingTrain(false);
      }
    }
    function sideRequestFromOther() {
      if (sideDialogOpen || giveWayPending) return;
      pickOther();
      const d = otherDesc(), ours = speed * 3.6;
      if (ours > 80) { control(tr('कंट्रोल रूम: ' + d + ' आपसे आगे निकलना चाहती है, पर आपकी गति 80 से ज़्यादा है, इसलिए वह आपको साइड देगी. आप चलते रहिए.', 'Control: ' + d + ' wants to pass, but your speed is above 80, so it will give you a side. Keep going.')); return; }
      if (otherKmh > 80) { control(tr('कंट्रोल रूम: ' + d + '. यह गाड़ी 80 से तेज़ है, सब इसे साइड देते हैं. गाड़ी रोककर साइड दीजिए.', 'Control: ' + d + '. This train is above 80, everyone gives it a side. Stop and give it a side.')); stopForOther(12000); return; }
      sideDialogOpen = true;
      control(tr('कंट्रोल रूम: ' + d + '. यह आपसे साइड मांग रही है. क्या आप साइड देना चाहते हैं? हाँ या ना चुनिए.', 'Control: ' + d + '. It is asking you for a side. Do you want to give it a side? Choose yes or no.'));
      const box = openDyn(tr('साइड का अनुरोध:', 'Side request:'));
      const close = () => { closeDyn(); sideDialogOpen = false; };
      mk(box, tr('हाँ, साइड दूँगा', 'Yes, I will give a side'), 'start', () => { close(); reaction(tr('आपने साइड देने की हाँ कही, यात्री इंतज़ार कर रहे हैं.', 'You agreed to give a side, passengers are waiting.')); stopForOther(12000); });
      mk(box, tr('ना, साइड नहीं दूँगा', 'No, I will not give a side'), 'back', () => { close(); control(tr('कंट्रोल रूम: आपने मना कर दिया. वह गाड़ी अपने रास्ते से आगे बढ़ेगी. कोई जुर्माना नहीं.', 'Control: you refused. That train will go ahead on its own. There is no fine.')); startPassingTrain(false); });
      later(() => { if (sideDialogOpen) { close(); control(tr('कंट्रोल रूम: जवाब नहीं मिला, इसलिए वह गाड़ी आगे बढ़ गई.', 'Control: no answer, so that train went ahead.')); } }, 20000);
    }
    function stopForOther(ms) {
      braking = true; brakeDecel = 1.0; targetKmh = 0;
      brakeLoopOn();
      startPassingTrain(false);
      later(() => {
        if (phase === 1) {
          braking = false;
          if (brakeStream) brakeLoopOff(false);
          control(tr('कंट्रोल रूम: गाड़ी निकल गई. अब आप चला सकते हैं.', 'Control: the train has passed. You may move now.'));
        }
      }, ms);
    }
    function collide(why) {
      Hub.sfx.play('train_horn', 1);
      Hub.sfx.play('train_brake_clunk', 1);
      collisionNote = tr(' कंट्रोल रूम: टक्कर! मोटरमैन ' + driverName + ' और मोटरमैन ' + otherDriver + ', आप दोनों को कंट्रोल की तरफ़ से कड़ी डाँट. दोनों पर जुर्माना लगा है.',
        ' Control: collision! Motorman ' + driverName + ' and motorman ' + otherDriver + ', both of you get a stern reprimand from control. Both are fined.');
      fine(COLLISION_FINE, why);
      finish(false, false, true);
    }
    function trackInfo() {
      const others = [1, 2, 3, 4].filter((x) => x !== platNow);
      otherTrack = pick(others);
      otherTrackUntil = nowMs() + 20000;
      pickOther();
      control(tr('कंट्रोल रूम: आपकी गाड़ी पटरी नंबर ' + platNow + ' पर है. ' + otherDesc() + ', पटरी नंबर ' + otherTrack + ' पर बीस सेकंड में आएगी. पटरी आप कभी भी बदल सकते हैं, पर उस पटरी पर मत जाइए.',
        'Control: your train is on track ' + platNow + '. ' + otherDesc() + ', will be on track ' + otherTrack + ' in twenty seconds. You may change track at any time, but do not go onto that track.'), false);
    }
    function startGiveWay(now) {
      giveWayPending = true; giveWayDeadline = now + 20000;
      startPassingTrain(false);
      control(tr('कंट्रोल रूम: सामने से एक्सप्रेस आ रही है. गाड़ी रोककर रास्ता दीजिए, फिर रास्ता दिया बटन दबाइए.', 'Control: an express is coming towards you. Stop and give way, then press Give way.'));
    }
    function giveWay() {
      if (!giveWayPending) { say(tr('अभी रास्ता देने की ज़रूरत नहीं.', 'No need to give way now.'), false); return; }
      giveWayPending = false; braking = true; brakeDecel = 1.0; targetKmh = 0;
      brakeLoopOn();
      reaction(tr('आपने एक्सप्रेस को रास्ता दिया, यात्री इंतज़ार कर रहे हैं.', 'You gave way to the express. Passengers are waiting.'));
      later(() => {
        if (phase === 1) { braking = false; if (brakeStream) brakeLoopOff(false); say(tr('एक्सप्रेस निकल गई. अब गाड़ी चला सकते हैं.', 'The express has passed. You may move now.'), false, 4); }
      }, 12000);
    }
    function closeDoors() {
      if (phase !== 0 || departing) { say(tr('अभी दरवाज़े बंद नहीं किए जा सकते.', 'The doors cannot be closed now.'), false); return; }
      if (readyPressed) { say(tr('दरवाज़े पहले से बंद हैं.', 'The doors are already closed.'), false); return; }
      Hub.sfx.play('train_door_close', 0.8);
      depart(true);
    }
    function toggleEngine() {
      engineOn = !engineOn;
      if (engineOn) { Hub.sfx.play('train_engine_on', 0.9); startLoops(); say(tr('इंजन चालू. पंखे, बत्तियाँ और केबिन की रोशनी चालू.', 'Engine on. Fans, lights and cabin lights are on.'), false); }
      else { Hub.sfx.play('train_engine_off', 0.9); stopLoops(); say(tr('इंजन बंद. पंखे और बत्तियाँ भी बंद. गाड़ी धीरे-धीरे रुकेगी.', 'Engine off. Fans and lights are off too. The train will slow down and stop.'), false); }
    }
    function releaseBrake() {
      if (!braking && !brakeStream) { say(tr('ब्रेक लगा नहीं है.', 'The brake is not on.'), false); return; }
      braking = false;
      if (brakeStream) brakeLoopOff(true);
      say(tr('ब्रेक छोड़ा.', 'Brake released.'), false);
    }
    function pullChain() {
      if (chainOn || phase !== 1) return;
      chainOn = true;
      reaction(tr('सेफ़्टी चेन खिंचने से यात्री घबराए हुए हैं.', 'Passengers are alarmed because the safety chain was pulled.'));
      braking = true; brakeDecel = 1.4; targetKmh = 0;
      brakeLoopOn();
      Hub.sfx.play('train_phone', 0.9);
      control(tr('कंट्रोल रूम: सेफ़्टी चेन खिंची है. गाड़ी रोकिए, जाँच कीजिए, फिर सेफ़्टी चेन हटाएँ बटन दबाइए.', 'Control: the safety chain was pulled. Stop, check, then press Reset the safety chain.'));
    }
    function resetChain() {
      if (!chainOn) { say(tr('सेफ़्टी चेन खिंची नहीं है.', 'The safety chain is not pulled.'), false); return; }
      chainOn = false; braking = false;
      if (brakeStream) brakeLoopOff(true);
      complaints++;
      say(tr('सेफ़्टी चेन रिसेट हो गई. कंट्रोल रूम की अनुमति से गाड़ी चला सकते हैं.', 'Safety chain reset. You may move with control\'s permission.'), false, 4);
    }
    function radioMessage() {
      const msgs = Hub.isHindi()
        ? ['कंट्रोल रूम: पीछे की गाड़ी देरी से है, गति बनाए रखिए.', 'कंट्रोल रूम: आगे लूप लाइन ख़ाली है, सिग्नल पर ध्यान दीजिए.', 'कंट्रोल रूम: मौसम ख़राब है, गति सीमित रखिए.']
        : ['Control: the train behind is running late, keep your speed.', 'Control: the loop line ahead is clear, watch the signals.', 'Control: bad weather, keep your speed limited.'];
      Hub.sfx.play('train_phone', 0.5);
      const m = pick(msgs);
      lastControl = m;
      later(() => say(tr('अगले ड्राइवर के लिए कंट्रोल रूम का संदेश. ', 'Control room message for the next driver. ') + m, false, 3), 1500);
    }

    // ================= 5. गाड़ी चलाना =================
    const step = () => (fast() ? 20 : 10);
    const dwellMs = () => DWELL_MS;
    const cues = () => (fast() ? [5000, 2000, 1000, 500, 300] : [1000, 300]);
    function resetCues() { cueNext = 0; shortTold = false; markTold = false; platNow = platAnn[nextIdx] || 1; }
    function nextStop(from) { for (let i = from + 1; i < seq.length; i++) if (stops[i]) return i; return seq.length - 1; }
    function clockText() {
      const mins = Math.floor((nowMs() - journeyStart) / 10000), total = 8 * 60 + mins;
      return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
    }
    const secsToGo = () => Math.max(0, Math.ceil((scheduledAt - nowMs()) / 1000));
    function statusTextRaw() {
      const kmh = Math.floor(speed * 3.6);
      if (phase === 0) {
        const wait = Math.floor(Math.max(0, (scheduledAt - nowMs()) / 1000));
        return tr('गाड़ी ' + seq[curIdx].name() + ' ' + (yardStart && curIdx === 0 ? 'यार्ड में' : 'स्टेशन पर') + ' खड़ी है. अगला रुकने का स्टेशन ' + seq[nextStop(curIdx)].name() + '. चलने का समय ' + wait + ' सेकंड बाद. खाते में ' + rupees(money) + '.',
          'The train is standing at ' + seq[curIdx].name() + '. The next stop is ' + seq[nextStop(curIdx)].name() + '. Departure in ' + wait + ' seconds. Balance ' + rupees(money) + '.');
      }
      if (nextIdx >= seq.length) return '';
      const d = Math.max(0, Math.floor(stationPos[nextIdx] - pos)), st = seq[nextIdx].name(), ds = Math.floor(sigPos[nextIdx] - pos);
      const red = sigRed[nextIdx] && !redCleared;
      const sig = sigIdx === nextIdx && ds > 0 ? tr(' अगला सिग्नल ' + ds + ' मीटर आगे, ' + (red ? 'लाल.' : 'हरा.'), ' Next signal ' + ds + ' metres ahead, ' + (red ? 'red.' : 'green.')) : '';
      return tr('रफ़्तार ' + kmh + ' किलोमीटर प्रति घंटा, लक्ष्य ' + targetKmh + '. अगला स्टेशन ' + st + ', ' + d + ' मीटर आगे, प्लेटफ़ॉर्म ' + platNow + '. ' + (stops[nextIdx] ? 'यहाँ रुकना है.' : 'यहाँ नहीं रुकना.') + sig + ' खाते में ' + rupees(money) + '.',
        'Speed ' + kmh + ' kilometres per hour, target ' + targetKmh + '. Next station ' + st + ', ' + d + ' metres ahead, platform ' + platNow + '. ' + (stops[nextIdx] ? 'You must stop here.' : 'No stop here.') + sig + ' Balance ' + rupees(money) + '.');
    }
    const statusText = () => tr('समय ' + clockText() + '. ', 'Time ' + clockText() + '. ') + statusTextRaw();

    // (C) सबसे ऊपर का बटन
    function topAction() {
      if (phase === 0) depart();
      else { const t = statusText(); if (statusEl) statusEl.textContent = t; say(t); }
    }
    function refreshTop() {
      if (!topBtn) return;
      let label;
      if (phase === 0) label = departing ? tr('गाड़ी चल रही है', 'Departing') : tr('चलने को तैयार (' + secsToGo() + ' सेकंड)', 'Ready to depart (' + secsToGo() + ' s)');
      else label = tr('स्थिति सुनें', 'Hear status');
      if (label !== topLabel) { topLabel = label; topBtn.textContent = label; }
      if (timerEl) {
        const t = phase === 0 && !departing ? tr('चलने में ' + secsToGo() + ' सेकंड बाक़ी', secsToGo() + ' seconds to departure') : '';
        if (timerEl.textContent !== t) timerEl.textContent = t;
      }
    }

    function startJourney() {
      screen = 'drive'; clearScreen();
      maxKmh = route.maxKmh;
      practice = money === 0;
      stationPos = [0];
      for (let k = 1; k < seq.length; k++) stationPos[k] = stationPos[k - 1] + route.hopM(idxs[k - 1], idxs[k]);
      const gapBase = fast() ? 1800 : 500;
      sigPos = seq.map((_, k) => (k === 0 ? -1 : stationPos[k] - Math.min(gapBase, (stationPos[k] - stationPos[k - 1]) * 0.55)));
      sigRed = seq.map((_, k) => k > 0 && Math.random() < 0.35);
      platAnn = seq.map(() => rnd(1, 5));
      phase = 0; pos = 0; speed = 0; targetKmh = 0; braking = false; curIdx = 0; nextIdx = 1;
      missed = 0; complaints = 0; violations = 0; departing = false; readyPressed = false; silentDepart = false; chainOn = false;
      rearEngine = false; lastBrakeHeavy = false; reactions.length = 0; lateStage = 0; countdownMarks = {};
      sigIdx = 1; sigState = 0; passActive = false; passStarted = false; engineOn = true; rollKind = -1;
      resetCues();
      const now = nowMs();
      scheduledAt = now + dwellMs();
      nextAmbientPass = now + 60000; nextChainCheck = now + 120000; nextRadio = now + 60000;
      newDriverName();
      yardAnnounced = false; journeyStart = now; otherTrack = 0; otherTrackUntil = 0; sideDialogOpen = false; collisionNote = '';
      nextSideReq = journeyStart + 80000; nextTrackInfo = journeyStart + 30000; giveWayPending = false; nextGiveWay = now + 90000;
      if (yardStart) {
        pos = -600; phase = 1; nextIdx = 0; sigIdx = 0; sigState = 0; redCleared = false; passStarted = false;
        resetCues(); scheduledAt = now + 90000;
        Hub.sfx.play('train_start', 0.6);
        say(tr('गाड़ी यार्ड की साइडिंग में है. प्लेटफ़ॉर्म तक ले जाइए और समय पर रोकिए.', 'The train is in the yard siding. Take it to the platform and stop on time.'), false, 4);
      }

      // (C) पहला फ़ोकस वाला बटन
      topLabel = '';
      topBtn = Hub.el('button', { type: 'button', class: 'top-button' });
      topBtn.addEventListener('click', () => { Hub.press(phase === 0 ? 'start' : 'info'); topAction(); });
      content.append(topBtn);
      const head = Hub.heading(content, seq[0].name() + ' → ' + seq[seq.length - 1].name(), 1);
      statusEl = info(yardStart ? tr('गाड़ी ' + seq[0].name() + ' यार्ड में खड़ी है.', 'The train is standing in the yard at ' + seq[0].name() + '.') : tr('गाड़ी ' + seq[0].name() + ' स्टेशन पर खड़ी है.', 'The train is standing at ' + seq[0].name() + '.'));
      timerEl = Hub.el('p', { class: 'timer', 'aria-hidden': 'true' });
      content.append(timerEl);
      complaintView = Hub.el('p', { 'aria-live': 'off' });
      content.append(complaintView);
      Hub.focus(topBtn);
      refreshTop();

      add(tr('स्थिति सुनें', 'Hear status'), 'info', () => { statusEl.textContent = statusText(); say(statusText()); });
      add(tr('रफ़्तार बढ़ाएँ', 'Speed up'), 'power_up', speedUp);
      add(tr('रफ़्तार घटाएँ', 'Slow down'), 'power_down', slowDown);
      add(tr('हल्का ब्रेक', 'Light brake'), 'aim_left', () => brake(0.5));
      add(tr('मध्यम ब्रेक', 'Medium brake'), 'aim_right', () => brake(0.9));
      add(tr('तेज़ ब्रेक', 'Heavy brake'), 'exit', () => brake(1.4));
      add(tr('ब्रेक छोड़ें', 'Release the brake'), 'power_up', releaseBrake);
      add(tr('हॉर्न', 'Horn'), 'shoot', horn);
      add(tr('पटरी बदलें', 'Change track'), 'center', changeTrack);
      add(tr('चलने को तैयार', 'Ready to depart'), 'start', () => depart());
      add(tr('दरवाज़े बंद करें', 'Close the doors'), 'start', closeDoors);
      add(tr('इंजन चालू या बंद', 'Engine on or off'), 'settings', toggleEngine);
      add(tr('सेफ़्टी चेन हटाएँ', 'Reset the safety chain'), 'shoot', resetChain);
      add(tr('कंट्रोल रूम से बात करें', 'Talk to control room'), 'info', talkControl);
      add(tr('कंट्रोल रूम के निर्देश दोहराएँ', 'Repeat control room instructions'), 'info', () => say(lastControl || tr('अभी कोई निर्देश नहीं है.', 'There is no instruction yet.'), true, 4));
      add(tr('आगे की गाड़ी से रास्ता मांगें', 'Ask the train ahead for a side'), 'start', askSide);
      add(tr('ड्राइवर का नाम बदलें', 'Change driver name'), 'info', () => { newDriverName(); say(tr('आपका नाम अब ' + driverName + ' है.', 'Your name is now ' + driverName + '.'), false); });
      add(tr('रास्ता दिया (गाड़ी रोकें)', 'Give way (stop the train)'), 'start', giveWay);
      add(tr('गैस रिलीज़ करें (ब्रेक का दबाव छोड़ें)', 'Release gas (let go of brake pressure)'), 'fine', releaseBrake);
      add(tr('कोच का पंखा चालू या बंद', 'Coach fan on or off'), 'settings', toggleFan);
      add(tr('कोच का AC चालू या बंद', 'Coach AC on or off'), 'settings', toggleAc);
      add(tr('स्टेशन स्टाफ़ को सूचित करें (यार्ड से निकलने से पहले)', 'Inform station staff (before leaving the yard)'), 'info', announceStaff);
      add(tr('आख़िरी घोषणा दोहराएँ', 'Repeat last announcement'), 'score', () => say(lastAnnounce));
      add(tr('यात्रा छोड़ें', 'End the journey'), 'back', () => finish(false, true, false));

      startLoops();
      startTicker();
      later(() => {
        pa(tr('यात्रीगण कृपया ध्यान दें. ट्रेन नंबर ' + digits(trainNo) + ', ' + trainName + ', ' + seq[0].name() + ' से ' + seq[seq.length - 1].name() + ' के लिए प्लेटफ़ॉर्म नंबर ' + platAnn[0] + ' पर खड़ी है. गाड़ी सुबह 8 बजे चलनी है.',
          'Attention please. Train number ' + digits(trainNo) + ', ' + trainName + ', for ' + seq[seq.length - 1].name() + ', is standing on platform ' + platAnn[0] + ' at ' + seq[0].name() + '.'));
        later(() => {
          const sc = stops.filter(Boolean).length, secs = Math.ceil(secsToGo());
          say(tr(seq[0].name() + ' स्टेशन पर आप हैं. आपको ' + seq[seq.length - 1].name() + ' तक जाना है, और ' + sc + ' स्टेशनों पर रुकना है. अगला रुकने का स्टेशन ' + seq[nextStop(0)].name() + '. चलने का समय ' + secs + ' सेकंड बाद है. सबसे ऊपर का बटन या R दबाकर चलने को तैयार हो सकते हैं.' + (practice ? ' यह अभ्यास यात्रा है, जुर्माना नहीं लगेगा.' : ''),
            'You are at ' + seq[0].name() + '. You must reach ' + seq[seq.length - 1].name() + ' and stop at ' + sc + ' stations. The next stop is ' + seq[nextStop(0)].name() + '. Departure time is in ' + secs + ' seconds. Press the top button or R when you are ready to depart.' + (practice ? ' This is a practice journey, so there are no fines.' : '')), false);
        }, 6500);
      }, 600);
    }

    function speedUp() {
      if (phase !== 1) { say(tr('पहले चलने को तैयार बटन दबाइए.', 'First press the Ready to depart button.'), false); return; }
      if (yardStart && !yardAnnounced && curIdx === 0 && nextIdx === 0) { say(tr('पहले स्टेशन स्टाफ़ को सूचित कीजिए कि गाड़ी यार्ड से निकल रही है.', 'First inform the station staff that the train is leaving the yard.'), false); return; }
      if (braking) { say(tr('पहले ब्रेक छोड़िए.', 'Release the brake first.'), false); return; }
      targetKmh = Math.min(maxKmh, targetKmh + step());
      say(tr('रफ़्तार का लक्ष्य ' + targetKmh + ' किलोमीटर प्रति घंटा', 'Target speed ' + targetKmh + ' kilometres per hour'), false);
    }
    function slowDown() {
      if (phase !== 1) return;
      targetKmh = Math.max(0, targetKmh - step());
      say(tr('रफ़्तार का लक्ष्य ' + targetKmh + ' किलोमीटर प्रति घंटा', 'Target speed ' + targetKmh + ' kilometres per hour'), false);
    }
    function horn() { Hub.sfx.play('train_horn', 0.9); }
    function brake(decel) {
      if (phase !== 1) return;
      targetKmh = 0; braking = true; brakeDecel = decel; lastBrakeHeavy = decel > 1.0;
      if (lastBrakeHeavy && speed * 3.6 > 60) reaction(tr('अचानक तेज़ ब्रेक से यात्री आगे गिरे!', 'A sudden heavy brake threw passengers forward!'));
      Hub.sfx.play('train_brake_clunk', 0.8);
      brakeLoopOn();
      say(decel < 0.6 ? tr('हल्का ब्रेक लगा.', 'Light brake on.') : decel < 1.0 ? tr('मध्यम ब्रेक लगा.', 'Medium brake on.') : tr('तेज़ ब्रेक लगा.', 'Heavy brake on.'), false);
    }
    function changeTrack() {
      if (phase !== 1) { say(tr('पटरी चलती गाड़ी में बदली जा सकती है.', 'You can change track while the train is moving.'), false); return; }
      platNow = (platNow % 4) + 1;
      Hub.sfx.play('train_points', 0.9);
      if (platNow === otherTrack && nowMs() < otherTrackUntil) { collide(tr('आप दूसरी गाड़ी वाली पटरी पर चले गए', 'You moved onto the track of another train')); return; }
      say(tr('पटरी बदली. अब गाड़ी पटरी नंबर ' + platNow + ' पर जाएगी.', 'Track changed. The train will now go onto track ' + platNow + '.'), false);
    }

    // ---- चलने की तैयारी ----
    function depart(silent) {
      if (phase !== 0 || departing) return;
      departing = true; silentDepart = !!silent;
      if (!silent) readyPressed = true;
      const now = nowMs(), early = now < scheduledAt - 1500;
      if (early) { giveComplaints(2, true); if (!practice) fine(MINOR_FINE, tr('समय से पहले गाड़ी चलाई', 'Departed before the time')); }
      if (silent) {
        complaints++;
        if (!practice) fine(MINOR_FINE, tr('बिना घोषणा के गाड़ी चलाई', 'Departed without an announcement'));
        later(() => say(tr('यात्री चिल्लाए: बिना घोषणा के गाड़ी चल पड़ी!', 'Passengers shout: the train left without any announcement!'), false, 2), 1200);
      }
      later(() => {
        if (screen !== 'drive') return;
        pa(tr('ट्रेन नंबर ' + digits(trainNo) + ', ' + trainName + ', चलने को तैयार है.', 'Train number ' + digits(trainNo) + ', ' + trainName + ', is ready to depart.'));
        later(() => Hub.sfx.play('train_whistle', 0.9), 4000);
        later(() => Hub.sfx.play('train_door_close', 0.8), 4800);
        later(() => {
          if (screen === 'drive') {
            pos = stationPos[curIdx]; nextIdx = curIdx + 1; sigIdx = nextIdx; sigState = 0; redCleared = false; passStarted = false;
            resetCues(); braking = false; departing = false; silentDepart = false; phase = 1;
            Hub.sfx.play('train_start', 0.6);
            say(tr('दरवाज़े बंद. गाड़ी चलाइए.', 'Doors closed. You may move.'), false);
          }
        }, 5800);
      }, early ? 4500 : 0);
    }

    // ---- यात्रियों की शिकायतें ----
    function giveComplaints(n, early) {
      const earlyHi = [['जयंत', 'मेरा बेटा अभी चढ़ा नहीं, गाड़ी इतनी जल्दी क्यों निकाल दी?'], ['सुनीता', 'अरे रुको! मेरा सामान प्लेटफ़ॉर्म पर रह गया!'], ['एक बुज़ुर्ग यात्री', 'दरवाज़े पर भीड़ थी, कुछ लोग चढ़ ही नहीं पाए.'], ['रमेश', 'घोषणा में तो और समय बताया था, इतनी जल्दी क्यों?'], ['एक महिला', 'मेरे पति स्टेशन पर ही छूट गए, गाड़ी रोकिए!'], ['गार्ड साहब', 'मोटरमैन, तय समय से पहले गाड़ी क्यों चलाई?']];
      const earlyEn = [['Jayant', 'My son has not boarded yet, why did you start the train so early?'], ['Sunita', 'Wait! My luggage is still on the platform!'], ['An elderly passenger', 'The door was crowded, some people could not board.'], ['Ramesh', 'The announcement gave a later time, why so early?'], ['A woman', 'My husband was left behind on the station, stop the train!'], ['The guard', 'Motorman, why did you start before the scheduled time?']];
      const missHi = [['मीना', 'हमें इसी स्टेशन पर उतरना था, गाड़ी रुकी ही नहीं!'], ['किशोर', 'अरे भाई, हमारा स्टेशन निकल गया!'], ['एक यात्री', 'इतनी बड़ी गाड़ी और हमारे स्टेशन पर नहीं रुकी, यह कैसे हुआ?']];
      const missEn = [['Meena', 'We had to get off at this station, the train did not stop!'], ['Kishore', 'Hey, our station has gone past!'], ['A passenger', 'Such a big train and it did not stop at our station, how?']];
      const pool = early ? (Hub.isHindi() ? earlyHi : earlyEn) : (Hub.isHindi() ? missHi : missEn);
      const picks = shuffle(pool).slice(0, n);
      complaints += picks.length;
      const f = feel();
      if (complaintView) complaintView.textContent = f === 1 ? '' : tr('यात्रियों की शिकायतें:\n', 'Passenger complaints:\n') + picks.map((p) => p[0] + ': ' + p[1]).join('\n');
      Hub.sfx.play('train_crowd', 0.5);
      picks.forEach((p, i) => later(() => { if (f !== 0) say(p[0] + ': ' + p[1], i === 0, /साहब|guard/i.test(p[0]) ? 4 : i % 2 === 0 ? 2 : 3); }, i * 4200));
    }

    // ================= हर 0.1 सेकंड का हिसाब =================
    function startTicker() { stopTicker(); ticker = setInterval(() => { if (destroyed || screen !== 'drive' || phase === 2) return; tick(0.1); refreshTop(); }, 100); }
    function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }
    function tick(dt) {
      const now = nowMs();
      if (phase === 0) { speed = 0; boardingTick(now); updateLoops(); return; }
      if (brakeStream && speed === 0) brakeLoopOff(false);
      const target = engineOn ? targetKmh / 3.6 : 0;
      let v = speed;
      if (braking) v -= brakeDecel * dt;
      else if (v < target) v += 0.8 * dt;
      else if (v > target) v -= 0.25 * dt;
      v = Math.min(maxKmh / 3.6, Math.max(0, v));
      if (v < 0.15 && (targetKmh === 0 || braking)) v = 0;
      speed = v; pos += v * dt;
      updateLoops(); ambient(now); signalLogic(now);
      if (phase === 1) stationLogic(now);
    }
    // (A) 40 सेकंड का टाइमर: 30, 15, 10, 5 सेकंड बाक़ी पर बोलता है
    function boardingTick(now) {
      if (departing) return;
      const left = Math.ceil((scheduledAt - now) / 1000);
      for (const mark of [30, 15, 10, 5]) {
        if (left <= mark && left > 0 && !countdownMarks[mark] && (scheduledAt - now) <= mark * 1000 && (scheduledAt - now) > (mark - 1) * 1000 - 100) {
          countdownMarks[mark] = true;
          say(tr('गाड़ी चलने में ' + mark + ' सेकंड बाक़ी हैं.', mark + ' seconds to departure.'), false, 4);
        }
      }
      const late = now - scheduledAt;
      if (late > 25000 && lateStage === 0) {
        lateStage = 1; Hub.sfx.play('train_whistle', 0.8);
        say(tr('घोषणा: गाड़ी के चलने का समय हो चुका है. मोटरमैन कृपया गाड़ी चलाएँ.', 'Announcement: it is time for the train to depart. Motorman, please start the train.'), true, 1);
      } else if (late > 50000 && lateStage === 1) {
        lateStage = 2; Hub.sfx.play('train_phone', 0.9);
        later(() => say(tr('स्टेशन मास्टर का फ़ोन: मोटरमैन साहब, गाड़ी का समय हो चुका है, कृपया गाड़ी चलाइए.', 'Station master on the phone: Motorman, your departure time has passed. Please start the train.'), true, 4), 2800);
      } else if (late > 75000 && lateStage === 2) {
        lateStage = 3; complaints++;
        say(tr('एक यात्री: अरे भाई, गाड़ी कब चलेगी? हमें देर हो रही है.', 'A passenger: Hey, when will this train leave? We are getting late.'), true, 2);
      } else if (late > 100000 && lateStage === 3) { lateStage = 2; scheduledAt = now - 50000; }
    }

    // ---- सिग्नल ----
    function signalLogic(now) {
      if (sigIdx >= seq.length) return;
      const dS = sigPos[sigIdx] - pos, red = sigRed[sigIdx], vis = fast() ? 3500 : 800;
      if (sigState === 0 && dS < vis) {
        sigState = 1; lateBrakeCharged = false; redCleared = !red; passStarted = false;
        if (red) {
          redGreenAt = now + 24000 + rnd(0, 8000);
          Hub.sfx.play('train_signal_red', 0.9);
          say(tr('आगे लाल सिग्नल. गाड़ी रोकिए.', 'Red signal ahead. Stop the train.'), true, 4);
        } else {
          Hub.sfx.play('train_signal_green', 0.7);
          say(tr('आगे हरा सिग्नल. रास्ता साफ़ है.', 'Green signal ahead. The line is clear.'), false, 4);
        }
      }
      if (sigState === 1 && red && !redCleared) {
        if (!chainOn && !lateBrakeCharged && dS < 250 && dS > 0 && !braking && speed * 3.6 > 10) {
          lateBrakeCharged = true;
          fine(LATE_BRAKE_FINE, tr('लाल सिग्नल के पास देर से ब्रेक लगाया', 'Braked late for a red signal'));
          control(tr('कंट्रोल रूम: ब्रेक पहले लगाइए, सिग्नल लाल है.', 'Control: brake earlier, the signal is red.'));
        }
        if (!passStarted && now >= redGreenAt - 10000) { passStarted = true; startPassingTrain(true); }
        if (now >= redGreenAt) {
          redCleared = true; Hub.sfx.play('train_signal_green', 0.8);
          say(tr('सिग्नल हरा हो गया. गाड़ी चला सकते हैं.', 'The signal has turned green. You may proceed.'), true, 4);
        }
        if (dS >= 0 && dS <= 700 && now - lastApproach > 500) { lastApproach = now; Hub.sfx.play('train_approach', 0.7, 0.55); }
      }
      if (dS <= 0) {
        if (red && !redCleared && speed > 1) {
          redCleared = true; violations++;
          if (passActive) { collide(tr('आप लाल सिग्नल तोड़कर आती हुई ट्रेन से टकरा गए', 'You passed a red signal and collided with an oncoming train')); return; }
          reaction(tr('लाल सिग्नल तोड़ने से यात्री परेशान हैं.', 'Passengers are upset that you passed a red signal.'));
          fine(SIGNAL_FINE, tr('आपने लाल सिग्नल तोड़ा', 'You passed a signal at danger'));
        }
        sigIdx++; sigState = 0; redCleared = false; passStarted = false;
      }
    }

    // ---- बगल से गुज़रती ट्रेनें ----
    function startPassingTrain(redWait) {
      if (passActive) return;
      passActive = true; passTicks = 0;
      const side = Math.random() < 0.5 ? -1 : 1, total = 140, horn2 = Math.random() < 0.5;
      passStream = Hub.sfx.playLR('train_pass', side < 0 ? 1 : 0.3, side > 0 ? 1 : 0.3, 1.1);
      if (horn2) later(() => Hub.sfx.play('train_horn', 0.5), 1500);
      if (passTimer) clearInterval(passTimer);
      passTimer = setInterval(() => {
        if (destroyed) { clearInterval(passTimer); return; }
        passTicks++;
        const f = passTicks / total, rate = 1.12 - 0.25 * f;
        if (passStream) passStream.tuneLR(side < 0 ? 1 : 0.3, side > 0 ? 1 : 0.3, rate);
        if (passTicks >= total) { clearInterval(passTimer); passTimer = null; passActive = false; if (passStream) passStream.stop(); passStream = null; }
      }, 100);
      if (redWait) say(tr('बगल की पटरी से एक गाड़ी गुज़र रही है.', 'A train is passing on the neighbouring track.'), false);
    }
    function ambient(now) {
      if (now > nextChainCheck && speed * 3.6 > 40) { nextChainCheck = now + 120000; if (rnd(0, 100) < 20) pullChain(); }
      if (!giveWayPending && phase === 1 && speed > 3 && now > nextGiveWay) { nextGiveWay = now + 100000 + rnd(0, 80000); startGiveWay(now); }
      if (giveWayPending && now > giveWayDeadline) { giveWayPending = false; if (!chainOn) fine(GIVE_WAY_FINE, tr('एक्सप्रेस को रास्ता नहीं दिया', 'You did not give way to the express')); }
      if (phase === 1 && !sideDialogOpen && !giveWayPending && speed > 3 && now > nextSideReq) { nextSideReq = now + 110000 + rnd(0, 90000); sideRequestFromOther(); }
      if (phase === 1 && now > nextTrackInfo) { nextTrackInfo = now + 60000 + rnd(0, 40000); trackInfo(); }
      if (now > nextRadio && phase === 1 && speed > 0.5) { nextRadio = now + 80000 + rnd(0, 60000); radioMessage(); }
      if (speed * 3.6 > 20 && now > nextAmbientPass && !passActive) { nextAmbientPass = now + 70000 + rnd(0, 70000); startPassingTrain(false); }
      if (speed > 8 && now - lastJoint > Math.max(700, 4200 - speed * 45)) {
        lastJoint = now;
        Hub.sfx.play('train_jerk' + rnd(1, 6), 0.35, 0.8 + 0.5 * (speed / (maxKmh / 3.6)));
      }
    }

    // ---- स्टेशन ----
    function stationLogic(now) {
      const last = seq.length - 1;
      if (nextIdx > last) return;
      const name = seq[nextIdx].name(), d = stationPos[nextIdx] - pos;
      if (!stops[nextIdx]) {
        if (d <= 0) {
          say(tr(name + ' स्टेशन से गाड़ी निकल रही है, यहाँ नहीं रुकना.', 'Passing ' + name + ', no stop here.'), false);
          Hub.sfx.play('train_approach', 0.5, 1.2);
          nextIdx++; resetCues();
        }
        return;
      }
      const cs = cues();
      if (cueNext < cs.length && d < cs[cueNext]) {
        const first = cueNext === 0;
        let k = cueNext;
        while (k + 1 < cs.length && d < cs[k + 1]) k++;
        const dist = cs[k];
        cueNext = k + 1;
        if (first) pa(tr('यात्रीगण कृपया ध्यान दें. ट्रेन नंबर ' + digits(trainNo) + ', ' + trainName + ', ' + name + ' स्टेशन के प्लेटफ़ॉर्म नंबर ' + platNow + ' पर आने वाली है.', 'Attention please. Train number ' + digits(trainNo) + ', ' + trainName + ', will shortly arrive at ' + name + ' on platform ' + platNow + '.'));
        const msg = dist >= 1000 ? tr(name + ' ' + Math.floor(dist / 1000) + ' किलोमीटर आगे. यहाँ रुकना है.', name + ' is ' + Math.floor(dist / 1000) + ' kilometres ahead. You must stop here.')
          : tr(name + ' ' + dist + ' मीटर आगे. ब्रेक लगाना शुरू कीजिए.', name + ' is ' + dist + ' metres ahead. Start braking.');
        later(() => { if (phase === 1) say(msg, false); }, first ? 7000 : 0);
      }
      const range = fast() ? 1500 : 600;
      if (d >= 0 && d <= range && now - lastApproach > 150 + d * (fast() ? 0.6 : 1.5)) { lastApproach = now; Hub.sfx.play('train_approach', 0.7, 0.6 + (1 - d / range) * 1.4); }
      if (d <= 0 && !markTold) { markTold = true; Hub.sfx.play('train_approach', 0.9, 2); }
      if (d < 0 && d > -100 && speed > 0.5 && now - lastApproach > 400) { lastApproach = now; Hub.sfx.play('train_approach', 0.8, 0.5); }
      const waitingAtSignal = sigIdx === nextIdx && sigState === 1 && sigRed[nextIdx] && !redCleared;
      if (speed === 0) {
        if (Math.abs(d) <= 30) { arrive(false); return; }
        if (d < -30 && d >= -100) { arrive(true); return; }
        if (d > 30 && d < 400 && !shortTold && !waitingAtSignal) { shortTold = true; say(tr('प्लेटफ़ॉर्म से पहले रुक गए हैं. थोड़ा आगे बढ़ाइए.', 'You have stopped short of the platform. Move forward a little.'), false); }
      } else shortTold = false;
      if (d < -100) {
        missed++;
        say(tr('आप ' + name + ' पर नहीं रुके.', 'You did not stop at ' + name + '.'), true);
        reaction(tr('आपने ' + name + ' पर गाड़ी नहीं रोकी, यात्री छूट गए!', 'You did not stop at ' + name + ', passengers were left behind!'));
        giveComplaints(1, false);
        nextIdx++; resetCues();
        if (nextIdx > last) finish(false, false, false);
      }
    }
    function arrive(overshoot) {
      if (overshoot) reaction(tr('गाड़ी निशान से आगे रुकी, यात्री दूर तक चलकर आए.', 'The train stopped past the mark, passengers had to walk back.'));
      else if (!lastBrakeHeavy) reaction(tr('शाबाश, गाड़ी आराम से रुकी. यात्री ख़ुश हैं.', 'Well done, the train stopped smoothly. Passengers are happy.'));
      lastBrakeHeavy = false;
      if (overshoot && !practice) fine(MINOR_FINE, tr('आप निशान से आगे निकल गए', 'You overshot the mark'));
      speed = 0; targetKmh = 0; braking = false; curIdx = nextIdx;
      const name = seq[curIdx].name(), changed = platNow !== platAnn[curIdx];
      Hub.sfx.play('train_arrive', 0.9);
      later(() => Hub.sfx.play('train_bell', 0.6), 800);
      later(() => Hub.sfx.play('train_door_open', 0.8), 2400);
      later(() => Hub.sfx.play('train_crowd', 0.5), 3200);
      if (curIdx === seq.length - 1) { finish(true, false, false); return; }
      phase = 0; departing = false; readyPressed = false; lateStage = 0; countdownMarks = {};
      scheduledAt = nowMs() + dwellMs(); // (A) हर स्टेशन पर 40 सेकंड
      const nxt = seq[nextStop(curIdx)].name();
      if (changed) {
        later(() => Hub.sfx.play('train_rush', 0.8), 1800);
        later(() => pa(tr('यात्रीगण कृपया ध्यान दें. ट्रेन नंबर ' + digits(trainNo) + ', ' + trainName + ', जो प्लेटफ़ॉर्म नंबर ' + platAnn[curIdx] + ' पर आने वाली थी, अब प्लेटफ़ॉर्म नंबर ' + platNow + ' पर आ रही है. असुविधा के लिए खेद है.',
          'Attention please. Train number ' + digits(trainNo) + ', ' + trainName + ', which was scheduled on platform ' + platAnn[curIdx] + ', is now arriving on platform ' + platNow + '. We regret the inconvenience.')), 1200);
        later(() => say(tr('एक यात्री: प्लेटफ़ॉर्म बदल गया! सामान उठाओ, जल्दी चलो!', 'A passenger: The platform has changed! Grab the luggage, hurry!'), false, 2), 8500);
      } else {
        later(() => pa(tr('ट्रेन नंबर ' + digits(trainNo) + ', ' + trainName + ', ' + name + ' स्टेशन के प्लेटफ़ॉर्म नंबर ' + platNow + ' पर आ गई है.', 'Train number ' + digits(trainNo) + ', ' + trainName + ', has arrived at ' + name + ' on platform ' + platNow + '.')), 1200);
      }
      later(() => say(tr(name + ' स्टेशन. यात्री उतर और चढ़ रहे हैं. अगला रुकने का स्टेशन ' + nxt + '. चलने का समय ' + (dwellMs() / 1000) + ' सेकंड बाद. सबसे ऊपर का बटन दबाकर चलने को तैयार हों.',
        name + ' station. Passengers are getting off and on. The next stop is ' + nxt + '. Departure in ' + (dwellMs() / 1000) + ' seconds. Press the top button when you are ready to depart.'), false), changed ? 13000 : 7500);
    }

    function fine(amount, why) {
      Hub.sfx.play('train_penalty', 0.9);
      if (practice) { say(tr(why + '. यह अभ्यास यात्रा है, इसलिए जुर्माना नहीं लगा.', why + '. This is a practice journey, so there is no fine.')); return; }
      money = Math.max(0, money - amount);
      Hub.wallet.apply('fine', amount).then((m) => { if (!destroyed && typeof m === 'number') money = m; });
      say(tr(why + '. जुर्माना ' + rupees(amount) + '. खाते में ' + rupees(money) + ' बचे.', why + '. Fine ' + rupees(amount) + '. You have ' + rupees(money) + ' left.'));
    }

    function finish(success, abandoned, collision) {
      phase = 2; stopTicker(); stopLoops();
      if (passTimer) { clearInterval(passTimer); passTimer = null; }
      if (passStream) { passStream.stop(); passStream = null; }
      let earned = 0;
      if (success && violations === 0 && !practice) {
        earned = REWARD; money += earned;
        Hub.wallet.apply('reward', earned).then((m) => { if (!destroyed && typeof m === 'number') money = m; });
      }
      const comp = tr(' यात्रियों की शिकायतें: ' + complaints + '.', ' Passenger complaints: ' + complaints + '.');
      const last = seq[seq.length - 1].name();
      let text;
      if (collision) text = tr('यात्रा ख़त्म. टक्कर हो गई. खाते में ' + rupees(money) + '.', 'Journey over. A collision happened. Balance ' + rupees(money) + '.') + collisionNote;
      else if (abandoned) text = tr('यात्रा बीच में छोड़ दी गई. खाते में ' + rupees(money) + '.', 'The journey was abandoned. Balance ' + rupees(money) + '.');
      else if (success && violations === 0) text = tr('बधाई हो, आप ' + last + ' सुरक्षित पहुँच गए. इनाम ' + rupees(earned) + '. खाते में अब ' + rupees(money) + '.', 'Congratulations, you reached ' + last + ' safely. Reward ' + rupees(earned) + '. Your balance is now ' + rupees(money) + '.') + (practice ? tr(' यह अभ्यास यात्रा थी, इसलिए इनाम नहीं मिला.', ' This was a practice journey, so there is no reward.') : '') + comp;
      else if (success) text = tr('आप ' + last + ' पहुँच गए, पर सिग्नल तोड़ने की वजह से इनाम नहीं मिला. खाते में ' + rupees(money) + '.', 'You reached ' + last + ', but there is no reward because you broke a signal. Balance ' + rupees(money) + '.') + comp;
      else text = tr('यात्रा विफल रही, क्योंकि आख़िरी स्टेशन पर नहीं रुके. खाते में ' + rupees(money) + '.', 'The journey failed because you did not stop at the last station. Balance ' + rupees(money) + '.') + comp;
      later(() => {
        screen = 'end'; clearScreen();
        title(tr('यात्रा समाप्त', 'Journey over'));
        info(text); say(text);
        add(tr('दोबारा यात्रा चुनें', 'Choose another journey'), 'start', () => { phase = 2; screenRoutes(); });
        add(tr('मुख्य मेनू पर वापस', 'Back to main menu'), 'back', () => exitGame());
      }, abandoned ? 100 : collision ? 2500 : 3500);
    }

    // ================= इंजन, पटरी और गूँज की आवाज़ =================
    function startLoops() {
      stopLoops();
      if (!engineOn || !Hub.soundOn) return;
      engineStream = Hub.sfx.loop('train_motor', 0, 0.6);
      humStream = Hub.sfx.loop('train_hum', 0.05, 1.0);
      rollStream = Hub.sfx.loop('train_cruise', 0, 0.8);
      rollKind = 0;
    }
    function stopLoops() {
      for (const s of [engineStream, humStream, rollStream]) if (s) s.stop();
      engineStream = humStream = rollStream = null;
      brakeLoopOff(false);
    }
    function brakeLoopOn() { if (brakeStream) return; brakeStream = Hub.sfx.loop('train_brake_loop', 0.55, 1); }
    function brakeLoopOff(fadeClunk) {
      if (brakeStream) { brakeStream.stop(); brakeStream = null; if (fadeClunk) Hub.sfx.play('train_brake_hiss', 0.6); }
    }
    function updateLoops() {
      if (!engineOn) return;
      if (!engineStream || !humStream || !rollStream) { if (Hub.soundOn) startLoops(); return; }
      const mx = maxKmh / 3.6, f = Math.min(1, Math.max(0, speed / mx));
      const slowing = braking || targetKmh / 3.6 < speed - 0.3;
      const want = speed < 0.3 ? 0 : slowing ? 2 : f > 0.6 ? 3 : 1;
      if (want !== rollKind) {
        rollStream.stop(); rollKind = want;
        rollStream = Hub.sfx.loop(['train_cruise', 'train_accel', 'train_decel', 'train_cruise_hi'][want], 0, 1);
      }
      engineStream.tune(0.08 + 0.5 * f, 0.5 + 1.2 * f);
      humStream.tune(0.05 + 0.1 * f, 1.0);
      rollStream.tune(speed < 0.3 ? 0 : 0.1 + 0.5 * f, 0.85 + 0.25 * f);
      const now = nowMs();
      if (speed > 3 && now > jerkCountdown) {
        jerkCountdown = now + (9000 - f * 6000) + rnd(0, 2500);
        Hub.sfx.play('train_jerk' + rnd(1, 6), 0.5, 0.85 + 0.3 * f);
      }
    }

    // ================= कीबोर्ड (सिर्फ़ चलती यात्रा में) =================
    function onKey(e) {
      if (screen !== 'drive' || phase === 2 || e.ctrlKey || e.altKey || e.metaKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key;
      if (k === 'ArrowUp') { e.preventDefault(); Hub.press('power_up'); speedUp(); }
      else if (k === 'ArrowDown') { e.preventDefault(); Hub.press('power_down'); slowDown(); }
      else if (k === 'b' || k === 'B') { Hub.press('aim_left'); brake(0.5); }
      else if (k === ' ') { e.preventDefault(); Hub.press('shoot'); horn(); }
      else if (k === 's' || k === 'S') { Hub.press('info'); const t = statusText(); if (statusEl) statusEl.textContent = t; say(t); }
      else if (k === 'r' || k === 'R') { Hub.press('start'); depart(); }
    }
    function onKeyUp(e) { if (screen === 'drive' && e.key === ' ' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) e.preventDefault(); }
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);

    screenRoutes();

    return {
      destroy() {
        destroyed = true;
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keyup', onKeyUp);
        stopTicker();
        if (passTimer) { clearInterval(passTimer); passTimer = null; }
        for (const id of timeouts) clearTimeout(id);
        timeouts.clear();
        stopLoops();
        if (passStream) { passStream.stop(); passStream = null; }
        Hub.stopSpeech();
        content.remove();
      },
    };
  }

  Hub.registerGame('train', { label: () => Hub.tr('ट्रेन सिम्युलेटर', 'Train Simulator'), key: 'ai', mount });
})();

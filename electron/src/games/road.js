'use strict';
// हदाल रोड: पहाड़ी सफ़र. RoadActivity.kt का JS रूप. कोई सांप नहीं, और पुल कभी नहीं टूटता.
(function () {
  const ROAD_M = 2000, BRIDGE_M = 1200, SIGNAL_M = 1600, SUMMIT_M = 1800, MAX_KMH = 180, BIKE_MAX_KMH = 140;
  const BRIDGE_NAME = 'Hadal Bridge';

  Hub.registerGame('road', {
    label: () => Hub.tr('हदाल रोड: पहाड़ी सफ़र', 'Hadal Road'),
    key: 'ai',
    mount(root, exit) {
      const tr = Hub.tr, S = Hub.store;
      let timer = null, destroyed = false, running = false, engine = null, statusEl = null, gasBtn = null, brakeBtn = null;
      let g = { vehicle: 0, engineLvl: 0, tankLvl: 0, suspLvl: 0, coins: 0, gems: 0 };
      let pos, kmh, gas, brakeOn, tilt, fuel, coinsGot, gems, damage, lastMeter, fuelDone, bridgeDone, bridgeWarned, bridgeMax, creaked,
        signalMin, signalDone, done, fuelWarned, lastBump, runSaved, lastTick;

      const vName = () => (g.vehicle === 1 ? 'Smart Runner' : 'Shark');
      const maxKmh = () => (g.vehicle === 1 ? BIKE_MAX_KMH : MAX_KMH);
      const bridgeLimit = () => (g.vehicle === 1 ? 35 : 20);
      const load = () => { g = { vehicle: S.get('road_vehicle', 0), engineLvl: S.get('road_engine', 0), tankLvl: S.get('road_tank', 0), suspLvl: S.get('road_susp', 0), coins: S.get('road_coins', 0), gems: S.get('road_gems', 0) }; };
      const save = () => { S.set('road_engine', g.engineLvl); S.set('road_tank', g.tankLvl); S.set('road_susp', g.suspLvl); S.set('road_coins', g.coins); S.set('road_gems', g.gems); };
      const engineCost = () => 300 * (g.engineLvl + 1), tankCost = () => 250 * (g.tankLvl + 1), suspCost = () => 2 * (g.suspLvl + 1);
      const say = (t, flush = true) => Hub.say(t, { flush });
      const stopEngine = () => { if (engine) { engine.stop(); engine = null; } };
      const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

      function garage() {
        running = false; stopTimer(); stopEngine(); load();
        root.textContent = '';
        Hub.focus(Hub.heading(root, tr('गैराज: हदाल रोड', 'Garage: Hadal Road')));
        Hub.para(root, tr(
          `आपके पास ${g.coins} सिक्के और ${g.gems} रत्न हैं. इंजन स्तर ${g.engineLvl}, टंकी स्तर ${g.tankLvl}, सस्पेंशन स्तर ${g.suspLvl}. इंजन से गाड़ी तेज़ पकड़ती है, टंकी से ईंधन कम ख़र्च होता है, और सस्पेंशन से झटके कम लगते हैं.`,
          `You have ${g.coins} coins and ${g.gems} gems. Engine level ${g.engineLvl}, tank level ${g.tankLvl}, suspension level ${g.suspLvl}. The engine speeds you up faster, the tank saves fuel, and the suspension softens jolts.`));
        Hub.button(root, tr(`गाड़ी: ${vName()} (बदलने के लिए दबाएँ)`, `Vehicle: ${vName()} (press to change)`), 'fx', () => {
          g.vehicle = 1 - g.vehicle; S.set('road_vehicle', g.vehicle); garage();
          say(tr(`अब आपकी गाड़ी ${vName()} है.`, `Your vehicle is now ${vName()}.`), false);
        });
        Hub.button(root, tr('दौड़ शुरू करें', 'Start the run'), 'start', startRun);
        const up = (txt, cost, field, cur, unit, ok, bad) => Hub.button(root, txt, 'power_up', () => {
          if (g[unit] >= cost) { g[unit] -= cost; g[field]++; save(); garage(); say(ok, false); } else say(bad, false);
        });
        up(tr(`इंजन सुधारें, ${engineCost()} सिक्के`, `Upgrade the engine, ${engineCost()} coins`), engineCost(), 'engineLvl', 0, 'coins', tr('इंजन सुधर गया.', 'Engine upgraded.'), tr('सिक्के कम हैं.', 'Not enough coins.'));
        up(tr(`टंकी सुधारें, ${tankCost()} सिक्के`, `Upgrade the fuel tank, ${tankCost()} coins`), tankCost(), 'tankLvl', 0, 'coins', tr('टंकी सुधर गई.', 'Tank upgraded.'), tr('सिक्के कम हैं.', 'Not enough coins.'));
        up(tr(`सस्पेंशन सुधारें, ${suspCost()} रत्न`, `Upgrade the suspension, ${suspCost()} gems`), suspCost(), 'suspLvl', 0, 'gems', tr('सस्पेंशन सुधर गया.', 'Suspension upgraded.'), tr('रत्न कम हैं.', 'Not enough gems.'));
        Hub.button(root, tr('मुख्य मेनू पर वापस', 'Back to main menu'), 'back', () => exit());
      }

      function startRun() {
        load();
        pos = 0; kmh = 0; gas = false; brakeOn = false; tilt = 0; fuel = 100; coinsGot = 0; gems = 0; damage = 0; lastMeter = 0;
        fuelDone = new Set(); bridgeDone = false; bridgeWarned = false; bridgeMax = 0; creaked = false;
        signalMin = -1; signalDone = false; done = false; fuelWarned = false; lastBump = 0; runSaved = false;
        buildScreen();
        lastTick = performance.now();
        stopEngine(); engine = Hub.sfx.loop('train_motor', 0, 0.5);
        running = true; stopTimer(); timer = setInterval(tick, 100);
        say(tr(
          `आप हदाल रोड पर ${vName()} चला रहे हैं. दो किलोमीटर का रास्ता है. गैस और ब्रेक के बटन दबाकर चलाइए, नाक ऊपर या नीचे करके संतुलन रखिए. आगे ${BRIDGE_NAME} है, वह कभी नहीं टूटता, पर ${bridgeLimit()} किमी प्रति घंटा से धीमे पार करने पर बोनस सिक्के मिलते हैं. सिग्नल के खंभे के पास धीमा ब्रेक लगाइए. चोटी पर चढ़ाई और झटके मिलेंगे. कीबोर्ड: G गैस, B ब्रेक, ऊपर नीचे तीर नाक, S स्थिति.`,
          `You are running on Hadal Road with the ${vName()}. It is two kilometres long. Use the gas and brake buttons, and keep the nose up or down to stay balanced. The ${BRIDGE_NAME} is ahead. It never breaks, but crossing it below ${bridgeLimit()} km per hour earns bonus coins. Brake gently near the signal marker. The summit has a steep climb and jolts. Keys: G gas, B brake, up and down arrows for the nose, S status.`));
      }

      function endRun() { if (!runSaved) { runSaved = true; g.coins += coinsGot; g.gems += gems; save(); } }

      const gasText = () => (gas ? tr('गैस बंद करें', 'Gas off') : tr('गैस चालू करें', 'Gas on'));
      const brakeText = () => (brakeOn ? tr('ब्रेक छोड़ें', 'Release the brake') : tr('ब्रेक लगाएँ', 'Apply the brake'));
      function toggleGas() { gas = !gas; gasBtn.textContent = gasText(); say(gas ? tr('गैस चालू', 'Gas on') : tr('गैस बंद', 'Gas off'), false); }
      function toggleBrake() { brakeOn = !brakeOn; brakeBtn.textContent = brakeText(); say(brakeOn ? tr('ब्रेक लगा', 'Brake on') : tr('ब्रेक छूटा', 'Brake released'), false); }
      function noseUp() { tilt -= 20; say(tr('नाक ऊपर', 'Nose up'), false); }
      function noseDown() { tilt += 20; say(tr('नाक नीचे', 'Nose down'), false); }

      function buildScreen() {
        root.textContent = '';
        Hub.focus(Hub.heading(root, tr('हदाल रोड: पहाड़ी सफ़र', 'Hadal Road: hill trail')));
        statusEl = Hub.el('p', { tabindex: '0' }); root.append(statusEl);
        gasBtn = Hub.button(root, gasText(), 'start', toggleGas);
        brakeBtn = Hub.button(root, brakeText(), 'fine', toggleBrake);
        Hub.button(root, tr('नाक ऊपर करें', 'Nose up'), 'aim_left', noseUp);
        Hub.button(root, tr('नाक नीचे करें', 'Nose down'), 'aim_right', noseDown);
        Hub.button(root, tr('स्थिति सुनें', 'Hear status'), 'info', () => say(statusText()));
        Hub.button(root, tr('गैराज में वापस', 'Back to the garage'), 'back', () => { endRun(); garage(); });
        Hub.button(root, tr('मुख्य मेनू पर वापस', 'Back to main menu'), 'back', () => { endRun(); exit(); });
        refresh();
      }

      function statusText() {
        const bal = tilt > 30 ? tr('नाक नीचे की ओर झुकी', 'nose tilting down') : tilt < -30 ? tr('नाक ऊपर की ओर झुकी', 'nose tilting up') : tr('संतुलन ठीक', 'balanced');
        return tr(`हदाल रोड, ${vName()}. दूरी ${Math.floor(pos)} मीटर, गति ${Math.floor(kmh)} किलोमीटर प्रति घंटा, ईंधन ${Math.floor(fuel)} प्रतिशत, ${bal}, सिक्के ${coinsGot}, रत्न ${gems}, नुकसान ${damage}.`,
          `Hadal Road, ${vName()}. Distance ${Math.floor(pos)} metres, speed ${Math.floor(kmh)} km per hour, fuel ${Math.floor(fuel)} percent, ${bal}, coins ${coinsGot}, gems ${gems}, damage ${damage}.`);
      }

      function crash(msg) { damage++; kmh = 0; tilt = 0; pos = Math.max(0, pos - 100); Hub.sfx.play('train_brake_clunk', 0.9); say(msg); }

      function tick() {
        if (destroyed || done || !running) return;
        const now = performance.now();
        const dt = Math.min(200, now - lastTick) / 1000;
        lastTick = now;
        step(dt); refresh();
      }

      function step(dt) {
        const slope = pos >= SUMMIT_M ? 1 : 0;
        if (gas && fuel > 0) kmh += (30 * (1 - kmh / maxKmh()) + 4) * (1 + 0.1 * g.engineLvl) * (g.vehicle === 1 ? 1.3 : 1) * dt;
        if (brakeOn) kmh -= 60 * dt;
        kmh -= (slope * 14 + 2 + kmh / MAX_KMH * 12) * dt;
        kmh = Math.min(maxKmh(), Math.max(0, kmh));
        if (kmh > 0) fuel = Math.max(0, fuel - kmh * 0.004 * Math.max(0.3, 1 - 0.1 * g.tankLvl) * (g.vehicle === 1 ? 0.8 : 1) * dt);
        if (fuel <= 0 && !fuelWarned) { fuelWarned = true; say(tr('ईंधन ख़त्म!', 'Out of fuel!')); }
        pos += kmh / 3.6 * dt;

        tilt += (slope * 25 + (Math.random() - 0.5) * 10 * (g.vehicle === 1 ? 1.6 : 1)) * dt;
        if (pos >= SUMMIT_M && pos - lastBump > 150) {
          lastBump = pos;
          tilt += (Math.random() - 0.5) * 80 * Math.max(0.3, 1 - 0.15 * g.suspLvl);
          Hub.sfx.play('train_jerk' + (1 + Math.floor(Math.random() * 5)), 0.5);
          say(tr('पथरीली चोटी पर झटका!', 'A jolt on the rocky summit!'), false);
        }
        if (Math.abs(tilt) >= 100) { crash(tr('गाड़ी संतुलन खोकर पलट गई', 'The truck lost balance and flipped')); return; }

        const m = Math.floor(pos);
        while (lastMeter < m) { lastMeter++; coinsGot++; if (lastMeter % 50 === 0) Hub.sfx.play('ui_info', 0.5); }

        const fs = Math.floor(pos / 200);
        if (fs > 0 && !fuelDone.has(fs)) { fuelDone.add(fs); fuel = Math.min(100, fuel + 30); Hub.sfx.play('ui_power_up', 0.6); say(tr('ईंधन भरा', 'Fuel filled'), false); }

        // अटूट पुल: तेज़ गति पर सिर्फ़ चरमराता है, टूटता नहीं
        if (!bridgeDone) {
          if (!bridgeWarned && pos >= BRIDGE_M - 150) {
            bridgeWarned = true;
            say(tr(`आगे ${BRIDGE_NAME} है. यह कभी नहीं टूटता. ${bridgeLimit()} किमी प्रति घंटा से धीमे पार कीजिए तो बोनस मिलेगा.`, `Ahead is the ${BRIDGE_NAME}. It never breaks. Cross below ${bridgeLimit()} km per hour for a bonus.`), false);
          }
          if (pos >= BRIDGE_M && pos <= BRIDGE_M + 40) {
            bridgeMax = Math.max(bridgeMax, kmh);
            if (!creaked && kmh > bridgeLimit()) { creaked = true; Hub.sfx.play('road_bridge_creak', 0.9); }
          }
          if (pos > BRIDGE_M + 40) {
            bridgeDone = true;
            if (bridgeMax > bridgeLimit()) say(tr(`${BRIDGE_NAME} तेज़ गति से पार हुआ. वह चरमराया, पर मज़बूत रहा. बोनस नहीं मिला.`, `You crossed the ${BRIDGE_NAME} fast. It creaked but stayed strong. No bonus.`));
            else { coinsGot += 50; Hub.sfx.play('ui_power_up', 0.8); say(tr(`${BRIDGE_NAME} धीमे पार हुआ. पचास बोनस सिक्के.`, `You crossed the ${BRIDGE_NAME} slowly. Fifty bonus coins.`)); }
          }
        }

        if (!signalDone) {
          if (pos >= SIGNAL_M - 10 && pos <= SIGNAL_M + 10) signalMin = signalMin < 0 ? kmh : Math.min(signalMin, kmh);
          if (pos > SIGNAL_M + 10) {
            signalDone = true;
            if (signalMin >= 0 && signalMin <= 15) { gems += 3; fuel = Math.min(100, fuel + 15); say(tr('सिग्नल पर सही ब्रेक, तीन रत्न और ईंधन मिला', 'Correct braking at the signal. Three gems and fuel earned.')); }
            else say(tr('सिग्नल के पास सही ब्रेक नहीं लगा, रत्न नहीं मिले', 'No correct braking at the signal, no gems.'));
          }
        }

        if (pos >= ROAD_M) {
          done = true; pos = ROAD_M; kmh = 0;
          Hub.sfx.play('win', 0.9); endRun();
          say(tr(`फ़िनिश लाइन पार! सिक्के ${coinsGot}, रत्न ${gems}, नुकसान ${damage}.`, `Finish line crossed! Coins ${coinsGot}, gems ${gems}, damage ${damage}.`));
        }
      }

      function refresh() {
        if (statusEl) statusEl.textContent = statusText();
        if (engine) engine.tune(0.1 + 0.4 * (kmh / MAX_KMH), 0.6 + 1.2 * (kmh / MAX_KMH));
        if (done) stopEngine();
      }

      function onKey(e) {
        if (!running || done || e.ctrlKey || e.altKey || e.metaKey) return;
        const k = e.key.toLowerCase();
        if (k === 'g') toggleGas(); else if (k === 'b') toggleBrake();
        else if (e.key === 'ArrowUp') noseUp(); else if (e.key === 'ArrowDown') noseDown();
        else if (k === 's') say(statusText()); else return;
        e.preventDefault();
      }
      document.addEventListener('keydown', onKey);

      garage();
      return {
        destroy() {
          destroyed = true; endRun && running && endRun(); stopTimer(); stopEngine();
          document.removeEventListener('keydown', onKey); Hub.stopSpeech();
        },
      };
    },
  });
})();

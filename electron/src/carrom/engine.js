'use strict';
// कैरम का इंजन और नियम: Android के World.kt, Rules.kt और OnlineText.kt की नक़ल. window.Carrom में.
(function () {
  const tr = (hi, en) => Hub.tr(hi, en);
  const COIN_R = 22, STRIKER_R = 30, POCKET_R = 48, BASE_Y = 850;
  const EV_COIN = 1, EV_WALL = 2, EV_POCKET = 3, EV_FOUL = 4, EV_STRIKER = 5;
  const POCKETS = [[40, 40], [960, 40], [40, 960], [960, 960]];

  class Coin {
    constructor(x, y, type) { this.x = x; this.y = y; this.type = type; this.vx = 0; this.vy = 0; this.alive = true; }
    get radius() { return this.type === 3 ? STRIKER_R : COIN_R; }
    get mass() { return this.type === 3 ? 1.5 : 1; }
  }

  class World {
    constructor() { this.coins = []; this.pocketed = []; this.foul = false; this.listener = null; this.reset(); }
    reset() {
      this.coins = [new Coin(500, BASE_Y, 3), new Coin(500, 500, 2)];
      for (let i = 0; i < 6; i++) { const a = (60 * i) * Math.PI / 180; this.coins.push(new Coin(500 + 46 * Math.cos(a), 500 + 46 * Math.sin(a), i % 2)); }
      for (let i = 0; i < 12; i++) { const a = (30 * i) * Math.PI / 180; this.coins.push(new Coin(500 + 92 * Math.cos(a), 500 + 92 * Math.sin(a), i % 2)); }
      this.pocketed = []; this.foul = false;
    }
    get striker() { return this.coins[0]; }
    copy() {
      const w = new World(); w.coins = this.coins.map((c) => { const n = new Coin(c.x, c.y, c.type); n.vx = c.vx; n.vy = c.vy; n.alive = c.alive; return n; });
      return w;
    }
    placeStriker(x) { const s = this.striker; s.x = x; s.y = BASE_Y; s.vx = 0; s.vy = 0; s.alive = true; }
    shoot(angleDeg, power) {
      const a = angleDeg * Math.PI / 180, sp = power * 180;
      this.striker.vx = Math.sin(a) * sp; this.striker.vy = -Math.cos(a) * sp;
      this.pocketed = []; this.foul = false;
    }
    moving() { for (const c of this.coins) if (c.alive && (c.vx !== 0 || c.vy !== 0)) return true; return false; }
    count(type) { let n = 0; for (const c of this.coins) if (c.alive && c.type === type) n++; return n; }
    spotFree(x, y) {
      for (const c of this.coins) { if (!c.alive) continue; const dx = c.x - x, dy = c.y - y, m = c.radius + COIN_R + 2; if (dx * dx + dy * dy < m * m) return false; }
      return true;
    }
    returnCoin(type) {
      const c = this.coins.find((k) => !k.alive && k.type === type); if (!c) return false;
      const spots = [[500, 500]];
      for (let ring = 1; ring <= 6; ring++) { const r = ring * 50, n = ring * 6; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; spots.push([500 + r * Math.cos(a), 500 + r * Math.sin(a)]); } }
      for (const s of spots) if (this.spotFree(s[0], s[1])) { c.x = s[0]; c.y = s[1]; c.vx = 0; c.vy = 0; c.alive = true; return true; }
      return false;
    }
    simulate(maxSteps = 700) { let i = 0; while (i < maxSteps && this.moving()) { this.step(1 / 90); i++; } }
    emit(ev) { if (this.listener) this.listener(ev); }
    step(dt) {
      const decay = Math.exp(-1.3 * dt);
      for (const c of this.coins) {
        if (!c.alive) continue;
        c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= decay; c.vy *= decay;
        if (c.vx * c.vx + c.vy * c.vy < 100) { c.vx = 0; c.vy = 0; }
        let inP = false;
        for (const p of POCKETS) { const dx = c.x - p[0], dy = c.y - p[1]; if (dx * dx + dy * dy < POCKET_R * POCKET_R) { inP = true; break; } }
        if (inP) {
          c.alive = false; c.vx = 0; c.vy = 0;
          if (c.type === 3) { this.foul = true; this.emit(EV_FOUL); } else { this.pocketed.push(c.type); this.emit(EV_POCKET); }
          continue;
        }
        const r = c.radius;
        if (c.x < r) { c.x = r; if (Math.abs(c.vx) > 60) this.emit(EV_WALL); c.vx = Math.abs(c.vx) * 0.8; }
        if (c.x > 1000 - r) { c.x = 1000 - r; if (Math.abs(c.vx) > 60) this.emit(EV_WALL); c.vx = -Math.abs(c.vx) * 0.8; }
        if (c.y < r) { c.y = r; if (Math.abs(c.vy) > 60) this.emit(EV_WALL); c.vy = Math.abs(c.vy) * 0.8; }
        if (c.y > 1000 - r) { c.y = 1000 - r; if (Math.abs(c.vy) > 60) this.emit(EV_WALL); c.vy = -Math.abs(c.vy) * 0.8; }
      }
      const n = this.coins.length;
      for (let i = 0; i < n; i++) {
        const a = this.coins[i]; if (!a.alive) continue;
        for (let j = i + 1; j < n; j++) {
          const b = this.coins[j]; if (!b.alive) continue;
          const dx = b.x - a.x, dy = b.y - a.y, minD = a.radius + b.radius, d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, overlap = minD - d, ma = a.mass, mb = b.mass, tot = ma + mb;
          a.x -= nx * overlap * (mb / tot); a.y -= ny * overlap * (mb / tot);
          b.x += nx * overlap * (ma / tot); b.y += ny * overlap * (ma / tot);
          const rvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rvn > 0) {
            const imp = (1 + 0.9) * rvn / (1 / ma + 1 / mb);
            a.vx -= imp / ma * nx; a.vy -= imp / ma * ny; b.vx += imp / mb * nx; b.vy += imp / mb * ny;
            if (rvn > 40) this.emit((a.type === 3 || b.type === 3) ? EV_STRIKER : EV_COIN);
          }
        }
      }
    }
    firstHit(angleDeg) {
      const s = this.striker, a = angleDeg * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), rr = COIN_R + STRIKER_R;
      let best = null, bestDist = Infinity;
      for (let i = 1; i < this.coins.length; i++) {
        const c = this.coins[i]; if (!c.alive) continue;
        const tx = c.x - s.x, ty = c.y - s.y, t = tx * dx + ty * dy; if (t <= 0) continue;
        const perp = Math.abs(tx * dy - ty * dx); if (perp >= rr) continue;
        const dist = t - Math.sqrt(rr * rr - perp * perp);
        if (dist < bestDist) { bestDist = dist; best = c; }
      }
      if (!best) return null;
      const d = Math.max(bestDist, 0), cx = s.x + dx * d, cy = s.y + dy * d;
      let ux = best.x - cx, uy = best.y - cy; const len = Math.sqrt(ux * ux + uy * uy);
      if (len > 0) { ux /= len; uy /= len; }
      let pk = -1, bestAlong = Infinity;
      for (let k = 0; k < 4; k++) {
        const wx = POCKETS[k][0] - best.x, wy = POCKETS[k][1] - best.y, along = wx * ux + wy * uy; if (along <= 0) continue;
        const perp2 = Math.abs(wx * uy - wy * ux);
        if (perp2 < 40 && along < bestAlong) { bestAlong = along; pk = k; }
      }
      return { coin: best, dist: d, pocket: pk };
    }
    /** सर्वर की [[x,y,type,alive],..] स्थिति लगाता है. */
    applyServerCoins(arr) {
      for (let i = 0; i < Math.min(arr.length, this.coins.length); i++) { const a = arr[i], c = this.coins[i]; c.x = a[0]; c.y = a[1]; c.alive = a[3] === 1; c.vx = 0; c.vy = 0; }
    }
    /** शॉट की एक तस्वीर [x,y,alive,...]. */
    showFrame(f) {
      for (let i = 0; i < Math.min(Math.floor(f.length / 3), this.coins.length); i++) { const c = this.coins[i]; c.x = f[i * 3]; c.y = f[i * 3 + 1]; c.alive = f[i * 3 + 2] === 1; }
    }
  }

  const Q_BOARD = 0, Q_PENDING = 1, Q_COVERED = 2;
  const colourName = (c) => (c === 1 ? tr('सफ़ेद', 'White') : tr('काली', 'Black'));

  class Rules {
    constructor(match25) {
      this.match25 = match25; this.colour = [1, 0]; this.matchScore = [0, 0]; this.owed = [0, 0];
      this.cur = 0; this.board = 1; this.boardOver = false; this.matchOver = false;
      this.queenState = Q_BOARD; this.queenOwner = -1; this.lastQueenCovered = false; this.lastReturned = 0;
    }
    startText(n) {
      const c = this.colour;
      return tr(`${n[0]} ${colourName(c[0])} गोटियाँ खेलेंगे, ${n[1]} ${colourName(c[1])}. ${n[this.cur]} का टर्न.`, `${n[0]} plays ${colourName(c[0])}, ${n[1]} plays ${colourName(c[1])}. It is ${n[this.cur]}'s turn.`);
    }
    modeText() { return this.match25 ? tr('असली कैरम नियम, पच्चीस अंक तक का मैच.', 'Real carrom rules, a match to twenty five points.') : tr('सादा खेल, सिर्फ़ एक बोर्ड.', 'Simple game, one board only.'); }
    remainText(w) {
      const c = this.colour;
      return tr(`${colourName(c[0])} गोटियाँ ${w.count(c[0])} बाकी, ${colourName(c[1])} गोटियाँ ${w.count(c[1])} बाकी.`, `${w.count(c[0])} ${colourName(c[0])} coins left, ${w.count(c[1])} ${colourName(c[1])} coins left.`);
    }
    scoreText(n, w) {
      let s = '';
      if (this.match25) s += tr(`${n[0]} ${this.matchScore[0]} अंक, ${n[1]} ${this.matchScore[1]} अंक. बोर्ड ${this.board}. `, `${n[0]} ${this.matchScore[0]} points, ${n[1]} ${this.matchScore[1]} points. Board ${this.board}. `);
      s += tr(`${n[0]} की ${w.count(this.colour[0])} गोटियाँ बाकी, ${n[1]} की ${w.count(this.colour[1])} गोटियाँ बाकी.`, `${n[0]} has ${w.count(this.colour[0])} coins left, ${n[1]} has ${w.count(this.colour[1])} coins left.`);
      return s;
    }
    giveBack(w, t) { if (w.returnCoin(t)) this.lastReturned++; }
    process(world, names, pocketed, foul) {
      this.lastQueenCovered = false; this.lastReturned = 0;
      const p = this.cur, o = this.colour[p], q = this.colour[1 - p];
      let sb = '';
      const wasPending = this.queenState === Q_PENDING && this.queenOwner === p;
      let keep;
      if (foul) {
        sb += tr('स्ट्राइकर पॉकेट में गया, फ़ाउल. ', 'The striker went into a pocket. Foul. ');
        for (const t of pocketed) this.giveBack(world, t);
        if (pocketed.length) sb += tr('इस शॉट की गोटियाँ वापस बोर्ड पर रखी गईं. ', 'The coins pocketed in this shot were put back on the board. ');
        if (wasPending) { this.giveBack(world, 2); this.queenState = Q_BOARD; this.queenOwner = -1; sb += tr('रानी वापस बीच में रखी गई. ', 'The queen was put back in the centre. '); }
        if (9 - world.count(o) > 0) { this.giveBack(world, o); sb += tr('दंड में आपकी एक गोटी वापस बोर्ड पर रखी गई. ', 'As a penalty, one of your coins was put back on the board. '); }
        else { this.owed[p] += 1; sb += tr('आपकी कोई गोटी अभी डाली नहीं गई थी, इसलिए अगली गोटी जो आप डालेंगे वह वापस रखी जाएगी. ', 'You had not pocketed any coin yet, so the next coin you pocket will be put back. '); }
        keep = false;
      } else {
        let own = 0, opp = 0, queenNow = false;
        for (const t of pocketed) { if (t === o) own++; else if (t === 2) queenNow = true; else opp++; }
        while (own > 0 && this.owed[p] > 0) { this.giveBack(world, o); own--; this.owed[p]--; sb += tr('पहले के दंड की वजह से यह गोटी वापस बोर्ड पर रखी गई. ', 'Because of an earlier penalty, this coin was put back on the board. '); }
        keep = false;
        if (own > 0) { keep = true; sb += own === 1 ? tr('आपकी गोटी पॉकेट में गई. ', 'Your coin was pocketed. ') : tr(`आपकी ${own} गोटियाँ पॉकेट में गईं. `, `Your ${own} coins were pocketed. `); }
        if (opp > 0) sb += opp === 1 ? tr('विरोधी की गोटी पॉकेट में गई. ', "The opponent's coin was pocketed. ") : tr(`विरोधी की ${opp} गोटियाँ पॉकेट में गईं. `, `The opponent's ${opp} coins were pocketed. `);
        if (wasPending) {
          if (own > 0) { this.queenState = Q_COVERED; this.lastQueenCovered = true; sb += tr('रानी कवर हो गई. ', 'The queen is covered. '); }
          else { this.giveBack(world, 2); this.queenState = Q_BOARD; this.queenOwner = -1; keep = false; sb += tr('रानी कवर नहीं हुई, वापस बीच में रखी गई. ', 'The queen was not covered and was put back in the centre. '); }
        }
        if (queenNow) {
          keep = true; this.queenOwner = p;
          if (own > 0) { this.queenState = Q_COVERED; this.lastQueenCovered = true; sb += tr('रानी और आपकी गोटी साथ में गई, रानी कवर हो गई. ', 'The queen and your coin went in together. The queen is covered. '); }
          else { this.queenState = Q_PENDING; sb += tr('रानी पॉकेट में गई. अब अपनी गोटी डालकर उसे कवर कीजिए. ', 'The queen is pocketed. Now pocket one of your coins to cover her. '); }
        }
        if (world.count(o) === 0 && this.queenState === Q_BOARD) {
          this.giveBack(world, o); own--;
          sb += tr('रानी से पहले आख़िरी गोटी नहीं डाली जा सकती, वह वापस रखी गई. ', 'The last coin cannot be pocketed before the queen, so it was put back. ');
          if (own <= 0 && !queenNow && !wasPending) keep = false;
        }
        if (world.count(q) === 0 && this.queenState === Q_BOARD) { this.giveBack(world, q); sb += tr('रानी से पहले विरोधी की आख़िरी गोटी नहीं गिनी जाती, वह वापस रखी गई. ', "The opponent's last coin does not count before the queen, so it was put back. "); }
        if (!pocketed.length) sb += tr('कोई गोटी पॉकेट में नहीं गई. ', 'No coin was pocketed. ');
      }
      sb += this.checkBoardEnd(world, names);
      if (!this.boardOver) {
        if (!keep) this.cur = 1 - this.cur;
        sb += tr(`अब ${names[this.cur]} का टर्न. `, `Now it is ${names[this.cur]}'s turn. `) + this.remainText(world);
      }
      return sb;
    }
    checkBoardEnd(world, names) {
      const c0 = world.count(this.colour[0]), c1 = world.count(this.colour[1]);
      if (c0 !== 0 && c1 !== 0) return '';
      const w = (c0 === 0 && c1 !== 0) ? 0 : (c1 === 0 && c0 !== 0) ? 1 : this.cur;
      const remaining = world.count(this.colour[1 - w]);
      let bonus = 0;
      if (this.queenState === Q_COVERED && this.queenOwner === w && this.matchScore[w] <= 22) bonus = 3;
      const pts = remaining + bonus;
      this.matchScore[w] += pts; this.boardOver = true;
      let sb = tr(`बोर्ड ख़त्म. ${names[w]} ने बोर्ड जीता. विरोधी की ${remaining} गोटियाँ बाकी थीं`, `Board over. ${names[w]} won the board. The opponent had ${remaining} coins left`);
      if (bonus > 0) sb += tr(', और रानी के तीन अंक', ', plus three points for the queen');
      sb += tr(`, कुल ${pts} अंक. `, `, ${pts} points in total. `);
      if (!this.match25) { this.matchOver = true; sb += tr(`खेल ख़त्म. ${names[w]} जीते. `, `Game over. ${names[w]} wins. `); }
      else if (this.matchScore[w] >= 25) { this.matchOver = true; sb += tr(`मैच ख़त्म. ${names[w]} जीते. `, `Match over. ${names[w]} wins. `); }
      return sb;
    }
    nextBoard(world) {
      world.reset(); this.queenState = Q_BOARD; this.queenOwner = -1; this.owed = [0, 0];
      const t = this.colour[0]; this.colour[0] = this.colour[1]; this.colour[1] = t;
      this.board += 1; this.boardOver = false; this.cur = this.colour[0] === 1 ? 0 : 1;
    }
  }

  const OnlineText = {
    count(coins, type) { let n = 0; for (const c of coins) if (c[2] === type && c[3] === 1) n++; return n; },
    remain(coins, c) { const n0 = this.count(coins, c[0]), n1 = this.count(coins, c[1]); return tr(`${colourName(c[0])} गोटियाँ ${n0} बाकी, ${colourName(c[1])} गोटियाँ ${n1} बाकी.`, `${n0} ${colourName(c[0])} coins left, ${n1} ${colourName(c[1])} coins left.`); },
    startText(n, c, cur) { return tr(`${n[0]} ${colourName(c[0])} गोटियाँ खेलेंगे, ${n[1]} ${colourName(c[1])}. ${n[cur]} का टर्न.`, `${n[0]} plays ${colourName(c[0])}, ${n[1]} plays ${colourName(c[1])}. It is ${n[cur]}'s turn.`); },
    render(ev, s, names, colour, coins) {
      let sb = '';
      for (const e of ev) {
        switch (e.t) {
          case 'foul': sb += tr(`${s} का स्ट्राइकर पॉकेट में गया, फ़ाउल. `, `${s}'s striker went into a pocket. Foul. `); break;
          case 'shotCoinsReturned': sb += tr('इस शॉट की गोटियाँ वापस बोर्ड पर रखी गईं. ', 'The coins from this shot were put back on the board. '); break;
          case 'queenReturned': sb += tr('रानी वापस बीच में रखी गई. ', 'The queen was put back in the centre. '); break;
          case 'penaltyReturned': sb += tr(`दंड में ${s} की एक गोटी वापस बोर्ड पर रखी गई. `, `As a penalty, one of ${s}'s coins was put back on the board. `); break;
          case 'penaltyOwed': sb += tr(`${s} की कोई गोटी अभी डाली नहीं गई थी, इसलिए अगली डाली गई गोटी वापस रखी जाएगी. `, `${s} had not pocketed any coin yet, so the next coin pocketed will be put back. `); break;
          case 'owedReturned': sb += tr('पहले के दंड की वजह से यह गोटी वापस बोर्ड पर रखी गई. ', 'Because of an earlier penalty, this coin was put back on the board. '); break;
          case 'own': sb += e.n === 1 ? tr(`${s} की गोटी पॉकेट में गई. `, `${s} pocketed one of their coins. `) : tr(`${s} की ${e.n} गोटियाँ पॉकेट में गईं. `, `${s} pocketed ${e.n} of their coins. `); break;
          case 'opp': sb += e.n === 1 ? tr('विरोधी की गोटी पॉकेट में गई. ', "An opponent's coin was pocketed. ") : tr(`विरोधी की ${e.n} गोटियाँ पॉकेट में गईं. `, `${e.n} opponent coins were pocketed. `); break;
          case 'queenCovered': sb += tr('रानी कवर हो गई. ', 'The queen is covered. '); break;
          case 'queenNotCovered': sb += tr('रानी कवर नहीं हुई, वापस बीच में रखी गई. ', 'The queen was not covered and was put back in the centre. '); break;
          case 'queenWithOwn': sb += tr(`रानी और ${s} की गोटी साथ में गई, रानी कवर हो गई. `, `The queen and ${s}'s coin went in together. The queen is covered. `); break;
          case 'queenPending': sb += tr(`रानी पॉकेट में गई. अब ${s} को अपनी गोटी डालकर उसे कवर करना है. `, `The queen is pocketed. Now ${s} must pocket one of their coins to cover her. `); break;
          case 'lastCoinBack': sb += tr('रानी से पहले आख़िरी गोटी नहीं डाली जा सकती, वह वापस रखी गई. ', 'The last coin cannot be pocketed before the queen, so it was put back. '); break;
          case 'oppLastBack': sb += tr('रानी से पहले विरोधी की आख़िरी गोटी नहीं गिनी जाती, वह वापस रखी गई. ', "The opponent's last coin does not count before the queen, so it was put back. "); break;
          case 'none': sb += tr('कोई गोटी पॉकेट में नहीं गई. ', 'No coin was pocketed. '); break;
          case 'boardOver':
            sb += tr(`बोर्ड ख़त्म. ${names[e.winner]} ने बोर्ड जीता. विरोधी की ${e.remaining} गोटियाँ बाकी थीं`, `Board over. ${names[e.winner]} won the board. The opponent had ${e.remaining} coins left`);
            if (e.bonus > 0) sb += tr(', और रानी के तीन अंक', ', plus three points for the queen');
            sb += tr(`, कुल ${e.pts} अंक. `, `, ${e.pts} points in total. `); break;
          case 'matchOver': sb += tr(`मैच ख़त्म. ${names[e.winner]} जीते. `, `Match over. ${names[e.winner]} wins. `); break;
          case 'newBoard': sb += tr('नया बोर्ड शुरू. ', 'A new board has started. ') + this.startText(names, colour, e.cur) + ' '; break;
          case 'timeout': sb += tr(`${names[e.player]} ने समय पर शॉट नहीं मारा, बारी बदल गई. `, `${names[e.player]} did not shoot in time, so the turn passed. `); break;
          case 'turn': sb += tr(`अब ${names[e.cur]} का टर्न. `, `Now it is ${names[e.cur]}'s turn. `) + this.remain(coins, colour); break;
        }
      }
      return sb;
    },
  };

  window.Carrom = { World, Rules, OnlineText, colourName, POCKETS, POCKET_R, BASE_Y, EV_COIN, EV_WALL, EV_POCKET, EV_FOUL, EV_STRIKER };
})();

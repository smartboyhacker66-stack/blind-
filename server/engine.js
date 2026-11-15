'use strict';
// खेल का इंजन और असली कैरम के नियम. ऐप के Kotlin कोड (World.kt, Rules.kt) की हू-ब-हू नक़ल.
// इसमें कोई बाहरी पैकेज नहीं है.

const COIN_R = 22, STRIKER_R = 30, POCKET_R = 48, BASE_Y = 850;
const EV_COIN = 1, EV_WALL = 2, EV_POCKET = 3, EV_FOUL = 4, EV_STRIKER = 5;
const POCKETS = [[40, 40], [960, 40], [40, 960], [960, 960]];

class Coin {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.vx = 0; this.vy = 0; this.alive = true;
  }
  get radius() { return this.type === 3 ? STRIKER_R : COIN_R; }
  get mass() { return this.type === 3 ? 1.5 : 1; }
}

class World {
  constructor() {
    this.coins = [];
    this.pocketed = [];
    this.foul = false;
    this.listener = null;
    this.reset();
  }

  reset() {
    this.coins = [];
    this.coins.push(new Coin(500, BASE_Y, 3));
    this.coins.push(new Coin(500, 500, 2));
    for (let i = 0; i < 6; i++) {
      const a = (60 * i) * Math.PI / 180;
      this.coins.push(new Coin(500 + 46 * Math.cos(a), 500 + 46 * Math.sin(a), i % 2));
    }
    for (let i = 0; i < 12; i++) {
      const a = (30 * i) * Math.PI / 180;
      this.coins.push(new Coin(500 + 92 * Math.cos(a), 500 + 92 * Math.sin(a), i % 2));
    }
    this.pocketed = [];
    this.foul = false;
  }

  get striker() { return this.coins[0]; }

  placeStriker(x) {
    const s = this.striker;
    s.x = x; s.y = BASE_Y; s.vx = 0; s.vy = 0; s.alive = true;
  }

  shoot(angleDeg, power) {
    const a = angleDeg * Math.PI / 180;
    const sp = power * 180;
    this.striker.vx = Math.sin(a) * sp;
    this.striker.vy = -Math.cos(a) * sp;
    this.pocketed = [];
    this.foul = false;
  }

  moving() {
    for (const c of this.coins) {
      if (c.alive && (c.vx !== 0 || c.vy !== 0)) return true;
    }
    return false;
  }

  count(type) {
    let n = 0;
    for (const c of this.coins) if (c.alive && c.type === type) n++;
    return n;
  }

  emit(ev) { if (this.listener) this.listener(ev); }

  step(dt) {
    const decay = Math.exp(-1.3 * dt);
    for (const c of this.coins) {
      if (!c.alive) continue;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= decay;
      c.vy *= decay;
      if (c.vx * c.vx + c.vy * c.vy < 100) { c.vx = 0; c.vy = 0; }
      let inPocket = false;
      for (const p of POCKETS) {
        const dx = c.x - p[0], dy = c.y - p[1];
        if (dx * dx + dy * dy < POCKET_R * POCKET_R) { inPocket = true; break; }
      }
      if (inPocket) {
        c.alive = false; c.vx = 0; c.vy = 0;
        if (c.type === 3) { this.foul = true; this.emit(EV_FOUL); }
        else { this.pocketed.push(c.type); this.emit(EV_POCKET); }
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
      const a = this.coins[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.coins[j];
        if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const minD = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const overlap = minD - d;
        const ma = a.mass, mb = b.mass, tot = ma + mb;
        a.x -= nx * overlap * (mb / tot);
        a.y -= ny * overlap * (mb / tot);
        b.x += nx * overlap * (ma / tot);
        b.y += ny * overlap * (ma / tot);
        const rvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rvn > 0) {
          const e = 0.9;
          const imp = (1 + e) * rvn / (1 / ma + 1 / mb);
          a.vx -= imp / ma * nx; a.vy -= imp / ma * ny;
          b.vx += imp / mb * nx; b.vy += imp / mb * ny;
          if (rvn > 40) this.emit((a.type === 3 || b.type === 3) ? EV_STRIKER : EV_COIN);
        }
      }
    }
  }

  spotFree(x, y) {
    for (const c of this.coins) {
      if (!c.alive) continue;
      const dx = c.x - x, dy = c.y - y;
      const minD = c.radius + COIN_R + 2;
      if (dx * dx + dy * dy < minD * minD) return false;
    }
    return true;
  }

  returnCoin(type) {
    const c = this.coins.find((k) => !k.alive && k.type === type);
    if (!c) return false;
    const spots = [[500, 500]];
    for (let ring = 1; ring <= 6; ring++) {
      const r = ring * 50, n = ring * 6;
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n;
        spots.push([500 + r * Math.cos(a), 500 + r * Math.sin(a)]);
      }
    }
    for (const s of spots) {
      if (this.spotFree(s[0], s[1])) {
        c.x = s[0]; c.y = s[1]; c.vx = 0; c.vy = 0; c.alive = true;
        return true;
      }
    }
    return false;
  }

  // शॉट चलाकर हर दूसरे क़दम की तस्वीर और आवाज़ों के संकेत लौटाता है.
  // frames: [[x0,y0,alive0, x1,y1,alive1, ...], ...] पूर्णांकों में, events: [[क़दम, संकेत], ...]
  runShot(maxSteps = 1500) {
    const frames = [];
    const events = [];
    let stepNo = 0;
    this.listener = (ev) => events.push([stepNo, ev]);
    const snap = () => {
      const f = [];
      for (const c of this.coins) { f.push(Math.round(c.x), Math.round(c.y), c.alive ? 1 : 0); }
      return f;
    };
    frames.push(snap());
    while (stepNo < maxSteps && this.moving()) {
      this.step(1 / 90);
      stepNo++;
      if (stepNo % 2 === 0) frames.push(snap());
    }
    // हर कैरम-गोटी को पूरी तरह रोक दो
    for (const c of this.coins) { c.vx = 0; c.vy = 0; }
    frames.push(snap());
    this.listener = null;
    return { frames, events, pocketed: this.pocketed.slice(), foul: this.foul };
  }

  state() {
    return this.coins.map((c) => [Math.round(c.x), Math.round(c.y), c.type, c.alive ? 1 : 0]);
  }
}

module.exports = { World, COIN_R, STRIKER_R, BASE_Y, EV_COIN, EV_WALL, EV_POCKET, EV_FOUL, EV_STRIKER };

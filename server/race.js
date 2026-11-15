'use strict';
// ऑनलाइन रेस (बाइक और कार): 2 या 3 खिलाड़ी. सर्वर ही गति का हिसाब रखता है. हर अनुरोध पर समय के हिसाब से आगे बढ़ाता है.
const LENGTHS = [500, 1000, 1500, 3000];
const STEP = 0.1;

// हर गाड़ी की अपनी खासियत. vmax किमी/घंटा, acc और brake मीटर/सेकंड², skid मीटर/सेकंड (इससे तेज़ मोड़ पर फिसलना).
const VEHICLES = {
  bike_sprint:  { kind: 'bike', vmax: 130, acc: 10,  brake: 14, skid: 24 },
  bike_cruiser: { kind: 'bike', vmax: 150, acc: 6.5, brake: 13, skid: 26 },
  bike_nimble:  { kind: 'bike', vmax: 120, acc: 8,   brake: 16, skid: 30 },
  car_sedan:    { kind: 'car',  vmax: 140, acc: 7,   brake: 15, skid: 27 },
  car_sport:    { kind: 'car',  vmax: 170, acc: 9,   brake: 14, skid: 22 },
  car_heavy:    { kind: 'car',  vmax: 125, acc: 5.5, brake: 17, skid: 32 },
};
const DEFAULT_VEHICLE = 'bike_sprint';

function curvesFor(length) {
  const c = [];
  for (let m = 300; m < length - 100; m += 300) c.push(m);
  return c;
}

function newCode(rooms) {
  for (let i = 0; i < 20; i++) {
    const c = String(Math.floor(100000 + Math.random() * 900000));
    if (!rooms.has(c)) return c;
  }
  return null;
}

class Race {
  constructor(now = Date.now) { this.now = now; this.rooms = new Map(); this.byUser = new Map(); }

  create(user, opts = {}) {
    this.leave(user.id);
    const code = newCode(this.rooms);
    if (!code) return { error: 'try_again' };
    const length = LENGTHS.includes(Number(opts.length)) ? Number(opts.length) : 1500;
    const max = Number(opts.max) === 3 ? 3 : 2;
    const room = { code, status: 'waiting', createdAt: this.now(), startAt: 0, last: 0, host: user.id, max, length,
      players: [this._player(user, opts.vehicle)], winner: null, firstFinishAt: 0, seq: 0, events: [] };
    this.rooms.set(code, room); this.byUser.set(user.id, code);
    return { code, max, length };
  }

  join(user, code, vehicle) {
    const room = this.rooms.get(String(code));
    if (!room || room.status !== 'waiting') return { error: 'not_found' };
    if (room.players.some((p) => p.id === user.id)) return { error: 'own_room' };
    if (room.players.length >= room.max) return { error: 'full' };
    this.leave(user.id);
    room.players.push(this._player(user, vehicle));
    this.byUser.set(user.id, room.code);
    if (room.players.length >= room.max) this._begin(room);
    return { code: room.code };
  }

  // मेज़बान कम से कम दो खिलाड़ी होने पर ख़ुद शुरू कर सकता है
  start(userId) {
    const room = this._room(userId); if (!room) return { error: 'not_found' };
    if (room.host !== userId) return { error: 'not_host' };
    if (room.status !== 'waiting' || room.players.length < 2) return { error: 'not_ready' };
    this._begin(room);
    return { ok: true };
  }

  // खुली लॉबी: सारे खुले, इंतज़ार वाले कमरे
  lobby() {
    const out = [];
    for (const room of this.rooms.values()) {
      if (room.status !== 'waiting') continue;
      const h = room.players.find((p) => p.id === room.host);
      out.push({ code: room.code, host: h ? h.name : '', vehicle: h ? h.vehicle : DEFAULT_VEHICLE, players: room.players.length, max: room.max, length: room.length });
    }
    return out.slice(0, 30);
  }

  leave(userId) {
    const code = this.byUser.get(userId);
    if (!code) return;
    this.byUser.delete(userId);
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.status === 'waiting') {
      if (room.host === userId) { room.players.forEach((p) => this.byUser.delete(p.id)); this.rooms.delete(code); }
      else room.players = room.players.filter((p) => p.id !== userId);
      return;
    }
    const me = room.players.find((p) => p.id === userId);
    if (me) { me.left = true; me.finished = me.finished || false; this._ev(room, 'left', userId); }
    const active = room.players.filter((p) => !p.left);
    if (room.status !== 'done' && active.length <= 1) {
      if (active.length === 1 && !room.winner) room.winner = active[0].id;
      room.status = 'done';
    }
    if (active.length === 0) this.rooms.delete(code);
  }

  input(userId, inp, now = this.now()) {
    const room = this._room(userId); if (!room) return { error: 'not_found' };
    this._advance(room, now);
    const p = room.players.find((x) => x.id === userId);
    if (room.status !== 'racing' || p.finished || p.left) return { ok: true };
    p.gas = !!inp.gas; p.brake = !!inp.brake;
    if (inp.boost && now >= p.boostReadyAt) {
      p.boostUntil = now + 3000; p.boostReadyAt = now + 12000; this._ev(room, 'boost', userId);
    }
    return { ok: true };
  }

  state(userId, now = this.now()) {
    const room = this._room(userId); if (!room) return { error: 'not_found' };
    this._advance(room, now);
    const me = room.players.find((x) => x.id === userId);
    const others = room.players.filter((x) => x.id !== userId && !x.left);
    const view = (p) => ({ name: p.name, vehicle: p.vehicle, pos: Math.round(p.pos * 10) / 10, kmh: Math.round(p.v * 3.6), finished: p.finished, time: p.time });
    const order = room.players.slice().sort((a, b) => (b.finished - a.finished) || (a.finished ? a.time - b.time : b.pos - a.pos));
    const rank = order.findIndex((p) => p.id === userId) + 1;
    const winnerP = room.players.find((p) => p.id === room.winner);
    return {
      code: room.code, status: room.status, length: room.length, curves: curvesFor(room.length),
      players: room.players.length, max: room.max, host: room.host === userId,
      countdown: room.status === 'countdown' ? Math.max(0, room.startAt - now) : 0,
      you: { ...view(me), boostReady: now >= me.boostReadyAt }, rank,
      others: others.map(view), opp: others[0] ? view(others[0]) : null,
      winner: room.winner ? (room.winner === userId ? 'you' : 'opp') : null,
      winnerName: winnerP ? winnerP.name : '',
      results: room.status === 'done' ? order.map((p) => ({ name: p.name, finished: p.finished, time: p.time, you: p.id === userId })) : [],
      seq: room.seq,
      events: room.events.slice(-12).map((e) => ({ n: e.n, type: e.type, who: e.who === userId ? 'you' : 'opp', name: (room.players.find((p) => p.id === e.who) || {}).name || '' })),
    };
  }

  cleanup(now = this.now()) {
    for (const [code, room] of this.rooms.entries()) {
      if (now - room.createdAt > 30 * 60000) { room.players.forEach((p) => this.byUser.delete(p.id)); this.rooms.delete(code); }
    }
  }

  _begin(room) { room.status = 'countdown'; room.startAt = this.now() + 5000; room.last = room.startAt; }
  _player(user, vehicle) {
    const v = VEHICLES[vehicle] ? vehicle : DEFAULT_VEHICLE;
    return { id: user.id, name: user.name, vehicle: v, pos: 0, v: 0, gas: false, brake: false, boostUntil: 0, boostReadyAt: 0, finished: false, time: 0, curve: 0, left: false };
  }
  _room(userId) { const c = this.byUser.get(userId); return c ? this.rooms.get(c) : null; }
  _ev(room, type, who) { room.seq += 1; room.events.push({ n: room.seq, type, who }); if (room.events.length > 40) room.events.shift(); }

  _advance(room, now) {
    if (room.status === 'countdown' && now >= room.startAt) { room.status = 'racing'; room.last = room.startAt; }
    if (room.status !== 'racing') return;
    const curves = curvesFor(room.length);
    let t = room.last; let guard = 0;
    while (t + STEP * 1000 <= now && guard++ < 400) {
      t += STEP * 1000;
      for (const p of room.players) {
        if (p.finished || p.left) continue;
        const spec = VEHICLES[p.vehicle];
        const boost = t < p.boostUntil; const vmax = (spec.vmax / 3.6) * (boost ? 1.2 : 1);
        let a = -1.5 - 0.02 * p.v;
        if (p.gas) a = spec.acc * Math.max(0, 1 - p.v / vmax) + 0.5;
        if (boost) a += 6;
        if (p.brake) a = -spec.brake;
        p.v = Math.max(0, Math.min(vmax, p.v + a * STEP));
        p.pos += p.v * STEP;
        while (p.curve < curves.length && p.pos >= curves[p.curve]) {
          if (p.v > spec.skid) { p.v *= 0.5; this._ev(room, 'skid', p.id); }
          p.curve += 1;
        }
        if (p.pos >= room.length && !p.finished) {
          p.finished = true; p.time = Math.round((t - room.startAt) / 100) / 10; p.pos = room.length;
          if (!room.winner) { room.winner = p.id; room.firstFinishAt = t; this._ev(room, 'finish', p.id); }
        }
      }
      const active = room.players.filter((p) => !p.left);
      if (active.every((p) => p.finished) || (room.firstFinishAt && t - room.firstFinishAt > 20000)) { room.status = 'done'; break; }
    }
    room.last = t;
  }
}

module.exports = { Race, VEHICLES, LENGTHS, curvesFor };

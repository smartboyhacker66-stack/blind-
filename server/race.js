'use strict';
// दो दोस्तों की ऑनलाइन बाइक रेस. सर्वर ही गति का हिसाब रखता है (धोखा मुश्किल). हर अनुरोध पर समय के हिसाब से आगे बढ़ाता है.
const LENGTH = 1500;                 // मीटर
const CURVES = [300, 600, 900, 1200];
const VMAX = 140 / 3.6;              // मीटर प्रति सेकंड
const STEP = 0.1;

function newCode(rooms) {
  for (let i = 0; i < 20; i++) {
    const c = String(Math.floor(100000 + Math.random() * 900000));
    if (!rooms.has(c)) return c;
  }
  return null;
}

class Race {
  constructor(now = Date.now) { this.now = now; this.rooms = new Map(); this.byUser = new Map(); }

  create(user) {
    this.leave(user.id);
    const code = newCode(this.rooms);
    if (!code) return { error: 'try_again' };
    const room = { code, status: 'waiting', createdAt: this.now(), startAt: 0, last: 0, players: [this._player(user)], winner: null, seq: 0, events: [] };
    this.rooms.set(code, room); this.byUser.set(user.id, code);
    return { code };
  }

  join(user, code) {
    const room = this.rooms.get(String(code));
    if (!room || room.status !== 'waiting') return { error: 'not_found' };
    if (room.players[0].id === user.id) return { error: 'own_room' };
    this.leave(user.id);
    room.players.push(this._player(user));
    this.byUser.set(user.id, room.code);
    room.status = 'countdown'; room.startAt = this.now() + 5000; room.last = room.startAt;
    return { code: room.code };
  }

  leave(userId) {
    const code = this.byUser.get(userId);
    if (!code) return;
    this.byUser.delete(userId);
    const room = this.rooms.get(code);
    if (!room) return;
    const other = room.players.find((p) => p.id !== userId);
    if (room.status === 'racing' || room.status === 'countdown') {
      if (other) { room.winner = other.id; room.status = 'done'; this._ev(room, 'left', userId); }
      else this.rooms.delete(code);
    } else if (room.status === 'waiting') this.rooms.delete(code);
  }

  input(userId, inp, now = this.now()) {
    const room = this._room(userId); if (!room) return { error: 'not_found' };
    this._advance(room, now);
    const p = room.players.find((x) => x.id === userId);
    if (room.status !== 'racing' || p.finished) return { ok: true };
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
    const op = room.players.find((x) => x.id !== userId) || null;
    const view = (p) => ({ name: p.name, pos: Math.round(p.pos * 10) / 10, kmh: Math.round(p.v * 3.6), finished: p.finished, time: p.time });
    return {
      code: room.code, status: room.status, length: LENGTH, curves: CURVES,
      countdown: room.status === 'countdown' ? Math.max(0, room.startAt - now) : 0,
      you: { ...view(me), boostReady: now >= me.boostReadyAt },
      opp: op ? view(op) : null,
      winner: room.winner ? (room.winner === userId ? 'you' : 'opp') : null,
      seq: room.seq,
      events: room.events.slice(-12).map((e) => ({ n: e.n, type: e.type, who: e.who === userId ? 'you' : 'opp' })),
    };
  }

  cleanup(now = this.now()) {
    for (const [code, room] of this.rooms.entries()) {
      if (now - room.createdAt > 30 * 60000) { room.players.forEach((p) => this.byUser.delete(p.id)); this.rooms.delete(code); }
    }
  }

  _player(user) { return { id: user.id, name: user.name, pos: 0, v: 0, gas: false, brake: false, boostUntil: 0, boostReadyAt: 0, skidUntil: 0, finished: false, time: 0, curve: 0 }; }
  _room(userId) { const c = this.byUser.get(userId); return c ? this.rooms.get(c) : null; }
  _ev(room, type, who) { room.seq += 1; room.events.push({ n: room.seq, type, who }); if (room.events.length > 40) room.events.shift(); }

  _advance(room, now) {
    if (room.status === 'countdown' && now >= room.startAt) { room.status = 'racing'; room.last = room.startAt; }
    if (room.status !== 'racing') return;
    let t = room.last; let guard = 0;
    while (t + STEP * 1000 <= now && guard++ < 400) {
      t += STEP * 1000;
      for (const p of room.players) {
        if (p.finished) continue;
        const boost = t < p.boostUntil; const vmax = VMAX * (boost ? 1.2 : 1);
        let a = -1.5 - 0.02 * p.v;
        if (p.gas) a = 8 * Math.max(0, 1 - p.v / vmax) + 0.5;
        if (boost) a += 6;
        if (p.brake) a = -14;
        p.v = Math.max(0, Math.min(vmax, p.v + a * STEP));
        p.pos += p.v * STEP;
        // मोड़: निशान पार करते समय गति 25 मीटर प्रति सेकंड (90 किमी/घंटा) से ज़्यादा हो तो फिसलना
        while (p.curve < CURVES.length && p.pos >= CURVES[p.curve]) {
          if (p.v > 25) { p.v *= 0.5; this._ev(room, 'skid', p.id); }
          p.curve += 1;
        }
        if (p.pos >= LENGTH && !p.finished) {
          p.finished = true; p.time = Math.round((t - room.startAt) / 100) / 10; p.pos = LENGTH;
          if (!room.winner) { room.winner = p.id; this._ev(room, 'finish', p.id); }
        }
      }
      if (room.players.every((p) => p.finished) || (room.winner && room.players.some((p) => p.finished) && t - room.startAt > 120000)) { room.status = 'done'; break; }
      if (room.winner && room.status === 'racing') room.status = 'done';
    }
    room.last = t;
  }
}

module.exports = { Race, LENGTH, CURVES };

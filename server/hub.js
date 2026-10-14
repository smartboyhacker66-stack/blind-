'use strict';
const crypto = require('crypto');
const { World } = require('./engine.js');
const { Rules } = require('./rules.js');

const MAX_WAITING = 8;
const ROOM_TTL_MS = 15 * 60 * 1000;
const ENDED_TTL_MS = 5 * 60 * 1000;
const TURN_MS = 60 * 1000;
const IDLE_FORFEIT_MS = 120 * 1000;
const NOTICE_MS = 30 * 1000;

class Hub {
  constructor(now = () => Date.now(), onMatchEnd = () => {}) {
    this.now = now;
    this.onMatchEnd = onMatchEnd;
    this.rooms = new Map();
    this.byCode = new Map();
    this.playerRoom = new Map();
    this.lastSeen = new Map();
    this.notices = new Map();
  }

  touch(userId) { this.lastSeen.set(userId, this.now()); }

  onlineCount() {
    const t = this.now();
    let n = 0;
    for (const ts of this.lastSeen.values()) if (t - ts < 60000) n++;
    return n;
  }

  notice(userId, t) { this.notices.set(userId, { t, at: this.now() }); }

  // ---------- कमरे ----------
  createRoom(user, opts) {
    if (this.playerRoom.has(user.id)) return { error: 'already_in_room' };
    const id = crypto.randomBytes(6).toString('hex');
    let code;
    do { code = String(crypto.randomInt(100000, 1000000)); } while (this.byCode.has(code));
    const room = {
      id, code,
      type: opts && opts.type === 'private' ? 'private' : 'public',
      rules: opts && opts.rules === 'simple' ? 'simple' : 'icf',
      owner: { id: user.id, name: user.name },
      createdAt: this.now(), endedAt: 0,
      waiting: [], status: 'open', match: null,
    };
    this.rooms.set(id, room);
    this.byCode.set(code, id);
    this.playerRoom.set(user.id, id);
    return { ok: true, roomId: id, code };
  }

  listPublic() {
    const out = [];
    for (const r of this.rooms.values()) {
      if (r.status === 'open' && r.type === 'public') {
        out.push({
          roomId: r.id, owner: r.owner.name, waiting: r.waiting.length,
          rules: r.rules, ageSec: Math.floor((this.now() - r.createdAt) / 1000),
        });
      }
    }
    out.sort((a, b) => a.ageSec - b.ageSec);
    return out.slice(0, 50);
  }

  join(user, q) {
    let room = null;
    if (q && q.roomId) room = this.rooms.get(String(q.roomId));
    else if (q && q.code) room = this.rooms.get(this.byCode.get(String(q.code).trim()));
    if (!room || room.status !== 'open') return { error: 'not_found' };
    if (room.owner.id === user.id) return { error: 'own_room' };
    const existing = this.playerRoom.get(user.id);
    if (existing && existing !== room.id) return { error: 'already_in_room' };
    if (room.waiting.some((w) => w.id === user.id)) return { ok: true, roomId: room.id, already: true };
    if (room.waiting.length >= MAX_WAITING) return { error: 'room_full' };
    this.playerRoom.set(user.id, room.id);
    if (room.type === 'private' && q.code) {
      this.startMatch(room, { id: user.id, name: user.name });
      return { ok: true, roomId: room.id, started: true };
    }
    room.waiting.push({ id: user.id, name: user.name, since: this.now() });
    return { ok: true, roomId: room.id };
  }

  accept(owner, userId) {
    const rid = this.playerRoom.get(owner.id);
    const room = rid && this.rooms.get(rid);
    if (!room || room.owner.id !== owner.id || room.status !== 'open') return { error: 'not_found' };
    const w = room.waiting.find((x) => x.id === userId);
    if (!w) return { error: 'not_waiting' };
    this.startMatch(room, { id: w.id, name: w.name });
    return { ok: true };
  }

  startMatch(room, joiner) {
    for (const w of room.waiting) {
      if (w.id !== joiner.id) {
        this.playerRoom.delete(w.id);
        this.notice(w.id, 'chosenOther');
      }
    }
    room.waiting = [];
    let players = [{ id: room.owner.id, name: room.owner.name }, { id: joiner.id, name: joiner.name }];
    if (crypto.randomInt(2) === 1) players = [players[1], players[0]];
    room.match = {
      players, world: new World(), rules: new Rules(room.rules === 'icf'),
      shotSeq: 0, lastShot: null, busyUntil: 0, turnStart: this.now(),
      timeouts: [0, 0], over: false, winner: -1, endedReason: null,
    };
    room.status = 'playing';
    this.touch(room.owner.id);
    this.touch(joiner.id);
  }

  closeRoom(room, reason) {
    for (const w of room.waiting) {
      this.playerRoom.delete(w.id);
      this.notice(w.id, reason || 'roomClosed');
    }
    this.playerRoom.delete(room.owner.id);
    this.byCode.delete(room.code);
    this.rooms.delete(room.id);
  }

  leave(user) {
    const rid = this.playerRoom.get(user.id);
    const room = rid && this.rooms.get(rid);
    if (!room) { this.playerRoom.delete(user.id); return { ok: true }; }
    if (room.status === 'open') {
      if (room.owner.id === user.id) this.closeRoom(room, 'roomClosed');
      else {
        room.waiting = room.waiting.filter((w) => w.id !== user.id);
        this.playerRoom.delete(user.id);
      }
    } else if (room.status === 'playing') {
      const idx = room.match.players.findIndex((p) => p.id === user.id);
      this.endMatch(room, 1 - idx, 'left');
      this.playerRoom.delete(user.id);
    } else {
      this.playerRoom.delete(user.id);
      const m = room.match;
      if (!m.players.some((p) => this.playerRoom.get(p.id) === room.id)) this.closeRoom(room);
    }
    return { ok: true };
  }

  resign(user) {
    const rid = this.playerRoom.get(user.id);
    const room = rid && this.rooms.get(rid);
    if (!room || room.status !== 'playing') return { error: 'not_playing' };
    const idx = room.match.players.findIndex((p) => p.id === user.id);
    this.endMatch(room, 1 - idx, 'resign');
    return { ok: true };
  }

  endMatch(room, winner, reason) {
    const m = room.match;
    if (m.over) return;
    m.over = true; m.winner = winner; m.endedReason = reason;
    room.status = 'ended';
    room.endedAt = this.now();
    this.byCode.delete(room.code);
    try { this.onMatchEnd(m, winner, reason); } catch (e) { /* आँकड़े में गड़बड़ खेल न रोके */ }
  }

  // ---------- शॉट ----------
  shoot(user, p) {
    const rid = this.playerRoom.get(user.id);
    const room = rid && this.rooms.get(rid);
    if (!room || room.status !== 'playing') return { error: 'not_playing' };
    const m = room.match;
    const idx = m.players.findIndex((x) => x.id === user.id);
    if (m.rules.cur !== idx) return { error: 'not_your_turn' };
    if (this.now() < m.busyUntil) return { error: 'too_soon' };
    const x = Number(p && p.x), angle = Number(p && p.angle), power = Number(p && p.power);
    if (!(x >= 150 && x <= 850) || !(angle >= -75 && angle <= 75) ||
        !Number.isInteger(power) || power < 1 || power > 10) return { error: 'bad_shot' };

    const w = m.world;
    w.placeStriker(x);
    w.shoot(angle, power);
    const res = w.runShot();
    w.placeStriker(500);
    const ev = m.rules.process(w, res.pocketed, res.foul);
    if (m.rules.boardOver && !m.rules.matchOver) {
      m.rules.nextBoard(w);
      ev.push({ t: 'newBoard', cur: m.rules.cur });
    }
    m.shotSeq += 1;
    m.lastShot = {
      seq: m.shotSeq, by: idx, x, angle, power,
      frames: res.frames, sounds: res.events, foul: res.foul, pocketed: res.pocketed, ev,
    };
    const animMs = Math.ceil(res.frames.length * 2 / 90 * 1000);
    m.busyUntil = this.now() + animMs + 2500;
    m.turnStart = m.busyUntil;
    m.timeouts[idx] = 0;
    this.touch(user.id);
    if (m.rules.matchOver) this.endMatch(room, m.rules.winner, 'normal');
    return { ok: true, seq: m.shotSeq };
  }

  // ---------- स्थिति ----------
  stateFor(user, seqSeen) {
    const rid = this.playerRoom.get(user.id);
    const room = rid && this.rooms.get(rid);
    if (!room) {
      const n = this.notices.get(user.id);
      return { phase: 'none', notice: n && this.now() - n.at < NOTICE_MS ? n.t : null };
    }
    if (room.status === 'open') {
      if (room.owner.id === user.id) {
        return {
          phase: 'open',
          room: { id: room.id, code: room.code, type: room.type, rules: room.rules },
          waiting: room.waiting.map((w) => ({ id: w.id, name: w.name })),
        };
      }
      const pos = room.waiting.findIndex((w) => w.id === user.id) + 1;
      return { phase: 'waiting', owner: room.owner.name, position: pos, waitingCount: room.waiting.length };
    }
    const m = room.match;
    const idx = m.players.findIndex((x) => x.id === user.id);
    const st = {
      phase: room.status === 'ended' ? 'ended' : 'playing',
      you: idx,
      players: m.players.map((x) => x.name),
      colour: m.rules.colour.slice(),
      cur: m.rules.cur,
      board: m.rules.board,
      score: m.rules.matchScore.slice(),
      match25: m.rules.match25,
      queen: m.rules.queenState,
      coins: m.world.state(),
      shotSeq: m.shotSeq,
      busyMs: Math.max(0, m.busyUntil - this.now()),
      turnLeftMs: Math.max(0, m.turnStart + TURN_MS - this.now()),
    };
    if (m.shotSeq > (seqSeen || 0) && m.lastShot) st.lastShot = m.lastShot;
    if (m.over) { st.winner = m.winner; st.endedReason = m.endedReason; }
    return st;
  }

  // ---------- सफ़ाई और समय-सीमा ----------
  tick() {
    const t = this.now();
    for (const room of Array.from(this.rooms.values())) {
      if (room.status === 'open' && t - room.createdAt > ROOM_TTL_MS) this.closeRoom(room, 'expired');
      else if (room.status === 'ended' && t - room.endedAt > ENDED_TTL_MS) {
        for (const p of room.match.players) if (this.playerRoom.get(p.id) === room.id) this.playerRoom.delete(p.id);
        this.closeRoom(room);
      } else if (room.status === 'playing') {
        const m = room.match;
        const cur = m.rules.cur;
        const other = 1 - cur;
        const seenCur = this.lastSeen.get(m.players[cur].id) || 0;
        const seenOther = this.lastSeen.get(m.players[other].id) || 0;
        if (t - seenCur > IDLE_FORFEIT_MS) { this.endMatch(room, other, 'idle'); continue; }
        if (t - seenOther > IDLE_FORFEIT_MS) { this.endMatch(room, cur, 'idle'); continue; }
        if (t > m.turnStart + TURN_MS && t >= m.busyUntil) {
          m.timeouts[cur] += 1;
          if (m.timeouts[cur] >= 3) { this.endMatch(room, other, 'timeout'); continue; }
          m.rules.cur = other;
          m.shotSeq += 1;
          m.lastShot = {
            seq: m.shotSeq, by: cur, x: 500, angle: 0, power: 0, frames: [], sounds: [], foul: false, pocketed: [],
            ev: [{ t: 'timeout', player: cur }, { t: 'turn', cur: other }],
          };
          m.busyUntil = t + 1500;
          m.turnStart = m.busyUntil;
        }
      }
    }
    for (const [id, n] of Array.from(this.notices.entries())) if (t - n.at > NOTICE_MS * 2) this.notices.delete(id);
  }
}

module.exports = { Hub, MAX_WAITING, TURN_MS };

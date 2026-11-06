'use strict';
// असली कैरम के नियम. यह सर्वर के लिए है और वाक्य नहीं, "घटनाएँ" (events) लौटाता है,
// ताकि हर खिलाड़ी का ऐप अपनी भाषा में उन्हें बोल सके.

const Q_BOARD = 0, Q_PENDING = 1, Q_COVERED = 2;

class Rules {
  constructor(match25) {
    this.match25 = match25;
    this.colour = [1, 0]; // 1 = सफ़ेद, 0 = काली
    this.matchScore = [0, 0];
    this.owed = [0, 0];
    this.cur = 0;
    this.board = 1;
    this.boardOver = false;
    this.matchOver = false;
    this.winner = -1;
    this.queenState = Q_BOARD;
    this.queenOwner = -1;
  }

  giveBack(world, type) { return world.returnCoin(type); }

  /** एक शॉट के नतीजे पर नियम लगाता है और घटनाओं की सूची लौटाता है. */
  process(world, pocketed, foul) {
    const ev = [];
    const p = this.cur;
    const o = this.colour[p];
    const q = this.colour[1 - p];
    const wasPending = this.queenState === Q_PENDING && this.queenOwner === p;
    let keep;

    if (foul) {
      ev.push({ t: 'foul' });
      for (const t of pocketed) this.giveBack(world, t);
      if (pocketed.length > 0) ev.push({ t: 'shotCoinsReturned' });
      if (wasPending) {
        this.giveBack(world, 2);
        this.queenState = Q_BOARD; this.queenOwner = -1;
        ev.push({ t: 'queenReturned' });
      }
      if (9 - world.count(o) > 0) {
        this.giveBack(world, o);
        ev.push({ t: 'penaltyReturned' });
      } else {
        this.owed[p] += 1;
        ev.push({ t: 'penaltyOwed' });
      }
      keep = false;
    } else {
      let own = 0, opp = 0, queenNow = false;
      for (const t of pocketed) {
        if (t === o) own++; else if (t === 2) queenNow = true; else opp++;
      }
      while (own > 0 && this.owed[p] > 0) {
        this.giveBack(world, o);
        own--; this.owed[p]--;
        ev.push({ t: 'owedReturned' });
      }
      keep = false;
      if (own > 0) { keep = true; ev.push({ t: 'own', n: own }); }
      if (opp > 0) ev.push({ t: 'opp', n: opp });
      if (wasPending) {
        if (own > 0) {
          this.queenState = Q_COVERED;
          ev.push({ t: 'queenCovered' });
        } else {
          this.giveBack(world, 2);
          this.queenState = Q_BOARD; this.queenOwner = -1; keep = false;
          ev.push({ t: 'queenNotCovered' });
        }
      }
      if (queenNow) {
        keep = true;
        this.queenOwner = p;
        if (own > 0) {
          this.queenState = Q_COVERED;
          ev.push({ t: 'queenWithOwn' });
        } else {
          this.queenState = Q_PENDING;
          ev.push({ t: 'queenPending' });
        }
      }
      if (world.count(o) === 0 && this.queenState === Q_BOARD) {
        this.giveBack(world, o);
        own--;
        ev.push({ t: 'lastCoinBack' });
        if (own <= 0 && !queenNow && !wasPending) keep = false;
      }
      if (world.count(q) === 0 && this.queenState === Q_BOARD) {
        this.giveBack(world, q);
        ev.push({ t: 'oppLastBack' });
      }
      if (pocketed.length === 0) ev.push({ t: 'none' });
    }

    this.checkBoardEnd(world, ev);
    if (!this.boardOver) {
      if (!keep) this.cur = 1 - this.cur;
      ev.push({ t: 'turn', cur: this.cur });
    }
    return ev;
  }

  checkBoardEnd(world, ev) {
    const c0 = world.count(this.colour[0]);
    const c1 = world.count(this.colour[1]);
    if (c0 !== 0 && c1 !== 0) return;
    const w = (c0 === 0 && c1 !== 0) ? 0 : (c1 === 0 && c0 !== 0) ? 1 : this.cur;
    const remaining = world.count(this.colour[1 - w]);
    let bonus = 0;
    if (this.queenState === Q_COVERED && this.queenOwner === w && this.matchScore[w] <= 22) bonus = 3;
    const pts = remaining + bonus;
    this.matchScore[w] += pts;
    this.boardOver = true;
    this.winner = w;
    ev.push({ t: 'boardOver', winner: w, remaining, bonus, pts });
    if (!this.match25 || this.matchScore[w] >= 25) {
      this.matchOver = true;
      ev.push({ t: 'matchOver', winner: w });
    }
  }

  nextBoard(world) {
    world.reset();
    this.queenState = Q_BOARD; this.queenOwner = -1;
    this.owed = [0, 0];
    const t = this.colour[0]; this.colour[0] = this.colour[1]; this.colour[1] = t;
    this.board += 1;
    this.boardOver = false;
    this.cur = this.colour[0] === 1 ? 0 : 1;
  }
}

module.exports = { Rules, Q_BOARD, Q_PENDING, Q_COVERED };

/* Hanpath — spaced repetition engine (simplified SM-2). */
"use strict";

const SRS = {
  MASTERED_DAYS: 21,   // interval at which a card counts as mastered
  UNLOCK_PCT: 65,      // deck mastery needed to open the next level
  DAY: 86400000,

  newCard() { return { e: 2.5, i: 0, r: 0, lp: 0, d: 0 }; },

  // grade: 0 again, 1 hard, 2 good, 3 easy
  grade(card, g) {
    const c = { ...card };
    if (g === 0) {
      c.lp += 1; c.r = 0; c.i = 0; c.d = Date.now() + 10 * 60 * 1000; // relearn in 10 min
      c.e = Math.max(1.3, c.e - 0.2);
    } else {
      c.r += 1;
      if (g === 1) { c.e = Math.max(1.3, c.e - 0.15); c.i = c.i === 0 ? 1 : Math.round(c.i * 1.2); }
      if (g === 2) { c.i = c.i === 0 ? 1 : Math.round(c.i * c.e); }
      if (g === 3) { c.e = Math.min(3.2, c.e + 0.15); c.i = c.i === 0 ? 3 : Math.round(c.i * c.e * 1.3); }
      c.i = Math.min(c.i, 365);
      c.d = Date.now() + c.i * this.DAY;
    }
    c.h = (c.h || []).concat([{ t: Date.now(), g }]).slice(-20);  // per-card history, last 20
    return c;
  },

  isMastered(card) { return card.i >= this.MASTERED_DAYS; },
  isDue(card) { return card.d !== 0 && card.d <= Date.now(); },
  isLearning(card) { return card.r > 0 && !this.isMastered(card); },

  // mastery % of a set of cards (0..100)
  pct(cards) {
    if (!cards.length) return 0;
    const mastered = cards.filter(c => this.isMastered(c)).length;
    return Math.round(100 * mastered / cards.length);
  },
};
if (typeof module !== "undefined") module.exports = SRS;
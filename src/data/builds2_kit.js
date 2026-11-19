// Small shared helpers for the Builds 2 class data (src/data/builds2*.js). Plain functions that build plain data.
export const ranks = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));
export const pct = (x) => Math.round(x * 1e6) / 1e6;
export const lv = (base, perLevel) => ({ base, perLevel });
export const mod = (stat, op, extra = {}) => ({ stat, ...op, ...extra });
export const abl = (id, path, op) => ({ id, path, ...op });
export const rep = (id, n) => Array.from({ length: n }, () => id);
export const dmgUp = (k, extra = {}) => mod('damageDone', { mul: pct(1 + k) }, extra);
export const healUp = (k, extra = {}) => mod('healingDone', { mul: pct(1 + k) }, extra);
export const MELEE = { min: 0, max: 40 };

/** A node factory for one class: N(track, tier, slug, name, maxRanks, icon, text, byRank, extra). */
export const nodeMaker = (cls) => (track, tier, slug, name, maxRanks, icon, text, byRank, extra = {}) =>
  ({ id: `b2_${cls}_${track}_${slug}`, cls, track, tier, maxRanks, name, icon, text, byRank, ...extra });
export const pathMaker = (cls) => (track, slug) => `b2_${cls}_${track}_${slug}`;

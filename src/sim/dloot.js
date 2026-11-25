// Delve loot rolls (wave 10 dloot, Scott 2026-11-25; D:/LQOnline/wave10/dloot/BRIEF.md). Pure and deterministic.
// Rules: content.dropRules.dloot (src/data/dloot.js DLOOT_RULES).
//
//   const DL = createDloot(content)
//   DL.seedFor({ world, zid, made, hero, tpl, n }) -> uint32   one drop's own seed (the copy, the hero, the boss, the
//                       hero's boss kills in that copy). Stateless: it never draws from the world's stream, so friends'
//                       drops do not depend on which kill the sim handled first, and a guest computes what the host does.
//   DL.bossDrop({ seed, place, tpl, hero, tally }) -> { items: [{ item, qty, inst }], tally, legend }   for ONE hero
//   DL.rollNamed(rng, id, cls, { illum })  -> inst { ilvl, rarity, affixes, q, illum?, armorType?, weaponType? }
//   DL.pickSmart(rng, list, hero)          -> id   (class only, track lean, weak slot, owned legendaries skipped)
//   DL.tallyChance(misses)                 -> this clear's legendary chance
//   lootSummary(list)                      -> { best, count, legendaries, illuminated }   for a run summary (dflow)
import { createRng, hashSeed } from './rng.js';
import { rollAffixes, resolveItem } from './loot.js';

export const DLOOT_DEFAULTS = Object.freeze({
  namedAffixes: { magic: [0, 1], rare: [1, 1], epic: [1, 1], set: [1, 1], legendary: [2, 2] },
  illuminated: { chance: 1 / 8, rarities: ['legendary', 'set'], extraAffix: 1 },
  smart: { classOnly: true, trackBias: 0.5, trackWeight: 3, weakSlot: 2, skipOwned: true },
  tally: { start: 0.10, step: 0.025, sure: 25 },
});
const RANK = { common: 0, magic: 1, rare: 2, epic: 3, set: 4, legendary: 5 };

export function createDloot(content) {
  const rules = (content.dropRules && content.dropRules.dloot) || DLOOT_DEFAULTS;
  const items = content.items || {};
  const cgOf = (cls) => (content.classGear || {})[cls] || null;

  function seedFor({ world = 0, zid = '', made = 0, hero = 0, tpl = '', n = 0 }) {
    return hashSeed(`dloot:${world}:${zid}:${made}:${hero}:${tpl}:${n}`);
  }
  function fits(id, cls) {
    const d = items[id];
    if (!d) return false;
    if (d.classes && !d.classes.includes(cls)) return false;
    const cg = cgOf(cls);
    if (!cg) return true;
    if (d.kind === 'weapon') return (Array.isArray(d.weaponType) ? d.weaponType : [d.weaponType]).some((w) => cg.weapons.includes(w));
    if (d.kind === 'armor' && d.slot !== 'trinket') {
      const a = d.armorType;
      return a === 'class' || (Array.isArray(a) ? a.includes(cg.armor) : a === cg.armor);
    }
    return true;
  }
  function wornLevel(hero, slot) {
    const e = (hero.equip || {})[slot];
    if (!e) return 0;
    const r = resolveItem(content, e, hero.cls);
    return r ? r.level || 0 : 0;
  }
  function owns(hero, id) {
    for (const list of [hero.bag, Object.values(hero.equip || {}), hero.pendingLoot]) for (const s of list || []) if (s && (s === id || s.item === id)) return true;
    return false;
  }
  function pickSmart(rng, list, hero) {
    const S = rules.smart;
    let pool = (list || []).filter((id) => items[id]);
    if (S.classOnly) { const ok = pool.filter((id) => fits(id, hero.cls)); if (ok.length) pool = ok; }
    if (S.skipOwned) { const fresh = pool.filter((id) => items[id].rarity !== 'legendary' || !owns(hero, id)); if (fresh.length) pool = fresh; }
    if (!pool.length) return null;
    if (pool.length === 1) return pool[0];
    const lean = hero.track && rng.chance(S.trackBias);
    const levels = pool.map((id) => wornLevel(hero, items[id].slot));
    const low = Math.min(...levels);
    const w = pool.map((id, i) => (levels[i] === low ? S.weakSlot : 1) * (lean && items[id].forTrack === hero.track ? S.trackWeight : 1));
    return rng.weighted(pool, w);
  }
  function topOf(aid, ilvl) {
    const A = content.affixes[aid];
    const tops = (content.dropRules || {}).affixTierTop || [3, 6, 9, 12, 20, 23, 26, 30];
    const t = Math.max(1, (tops.findIndex((x) => ilvl <= x) + 1) || tops.length);
    return A.values[Math.min(t, A.values.length) - 1][1];
  }
  function rollNamed(rng, id, cls, { illum = false } = {}) {
    const d = items[id];
    if (!d || (d.kind !== 'weapon' && d.kind !== 'armor')) return null;
    const cg = cgOf(cls);
    const inst = { ilvl: d.level, rarity: d.rarity, affixes: [] };
    if (d.armorType === 'class') inst.armorType = cg ? cg.armor : 'cloth';
    else if (Array.isArray(d.armorType)) inst.armorType = cg && d.armorType.includes(cg.armor) ? cg.armor : d.armorType[0];
    if (Array.isArray(d.weaponType)) inst.weaponType = cg ? (d.weaponType.find((w) => cg.weapons.includes(w)) || d.weaponType[0]) : d.weaponType[0];
    const [lo, hi] = rules.namedAffixes[d.rarity] || [0, 0];
    const want = rng.int(lo, hi) + (illum ? rules.illuminated.extraAffix : 0);
    if (want > 0) {
      const half = Math.ceil(want / 2) + 1;
      const R = { ...(content.rarity || {}), _named: { affixes: [want, want], prefixMax: half, suffixMax: half } };
      inst.affixes = rollAffixes({ content: { ...content, rarity: R }, rng }, d.slot, d.level, '_named');
      if (illum) inst.affixes = inst.affixes.map((a) => ({ id: a.id, value: topOf(a.id, d.level) }));
    }
    inst.q = illum ? 1 : Math.round(rng.next() * 100) / 100;
    if (illum) inst.illum = true;
    return inst;
  }
  function tallyChance(misses) {
    const T = rules.tally;
    if ((misses | 0) + 1 >= T.sure) return 1;
    return Math.min(1, T.start + T.step * (misses | 0));
  }
  /** One hero's drop from one boss kill at a place. tally = that hero's misses at this place. */
  function bossDrop({ seed, place, tpl, hero, tally = 0 }) {
    const rng = createRng(seed);
    const out = { items: [], tally, legend: null };
    const P = (content.dungeons || {})[place];
    if (!P || !(P.bosses || []).includes(tpl)) return out;
    const add = (id) => {
      if (!id || !items[id]) return;
      const illum = rules.illuminated.rarities.includes(items[id].rarity) && rng.chance(rules.illuminated.chance);
      const inst = rollNamed(rng, id, hero.cls, { illum });
      if (inst) out.items.push({ item: id, qty: 1, inst });
    };
    add(pickSmart(rng, (P.drops || {})[tpl], hero));
    const slot = (P.setSlot || {})[tpl];
    if (slot) { const set = Object.values(content.sets || {}).find((s) => s.cls === hero.cls); if (set && set.pieces[slot]) add(set.pieces[slot][0]); }
    if (tpl !== P.last) return out;
    if (P.rare) add(pickSmart(rng, P.rare, hero));
    if (P.legendary && P.legend) {
      const chance = tallyChance(tally);
      out.legend = { chance, misses: tally | 0 };
      if (rng.next() < chance) {
        const pool = [].concat(P.legendary, P.retold || []);
        const id = pickSmart(rng, pool, hero);
        add(id);
        out.legend.got = true; out.legend.item = id; out.tally = 0;
      } else out.tally = (tally | 0) + 1;
    }
    return out;
  }
  return { rules, seedFor, bossDrop, rollNamed, pickSmart, tallyChance, fits };
}

/** A run's loot for a summary: list = [{ item, inst }] (one hero's pieces); content for names and rarity. */
export function lootSummary(content, list) {
  const items = (content && content.items) || {};
  let best = null, legendaries = 0, illuminated = 0;
  for (const it of list || []) {
    const d = items[it.item];
    if (!d) continue;
    const r = (it.inst && it.inst.rarity) || d.rarity;
    if (r === 'legendary') legendaries++;
    if (it.inst && it.inst.illum) illuminated++;
    if (!best || (RANK[r] || 0) > (RANK[best.rarity] || 0)) best = { item: it.item, name: d.name, rarity: r, illum: !!(it.inst && it.inst.illum) };
  }
  return { best, count: (list || []).length, legendaries, illuminated };
}

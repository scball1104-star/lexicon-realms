// Gear affixes and minor powers that act in a fight (polish 2026-11-22; GAP 2.1 "item procs", BUILDS_2 6.1). Pure.
//
//   gearEffects(content, e)            -> { dps: { main, off }, leech, onHit: [{ school, chance, amount, ability }],
//                                           minors: [powerId], any }   from what `e` wears (src/sim/stats.js recalcPlayer)
//   minorDef(content, id)              -> the minor power record (content.rarity[r].minor.powers, src/data/legendary_powers.js)
//   minorsOf(content, e)               -> the minor power records `e` wears (e.minors, set by recalcPlayer)
//   rollMinor(content, rng, rarity, ilvl) -> a minor power id or null (src/sim/loot.js rollGear; one rng draw when it can roll)
//
// The affix records are content.affixes[id].combat (src/data/items.js AFFIXES): kind 'dps' (weapon damage per second, on
// that weapon only), 'leech' (`per` of the damage dealt a point comes back as health) and 'onHit' (a direct hit has `chance`
// to deal value x `per` more damage of `school`). src/sim/combat.js afterDamage applies leech and onHit; the weapon's swing
// carries the dps. No imports from outside sim.

const WEAPON_SLOTS = { main: 'main', two: 'main', off: 'off' };
// Caps (loot fixes 2026-11-26): gear leech tops out at 10% of the damage dealt (two of Leeching weapons cannot reach 18%),
// and only the strongest chance-on-hit fires on a blow (two of Embers weapons roll one Embers, not two). src/sim/combat.js
// also caps all leech on one hit (talents plus gear) at LEECH_TOTAL_CAP.
export const GEAR_LEECH_CAP = 0.1;
export const LEECH_TOTAL_CAP = 0.3;
export const GEAR_ONHIT_MAX = 1;

export function gearEffects(content, e) {
  const A = content.affixes || {};
  const items = content.items || {};
  const out = { dps: { main: 0, off: 0 }, leech: 0, onHit: [], minors: [], any: false };
  for (const [slot, entry] of Object.entries(e.equip || {})) {
    if (!entry || typeof entry === 'string' || !items[entry.item]) continue;
    const inst = entry.inst || null;
    if (!inst) continue;
    for (const a of inst.affixes || []) {
      const c = A[a.id] && A[a.id].combat;
      if (!c) continue;
      if (c.kind === 'dps' && WEAPON_SLOTS[slot]) out.dps[WEAPON_SLOTS[slot]] += a.value;
      else if (c.kind === 'leech') out.leech += a.value * (c.per || 0.01);
      else if (c.kind === 'onHit') out.onHit.push({ school: c.school || 'physical', chance: c.chance == null ? 1 : c.chance, amount: a.value * (c.per || 1), ability: c.ability || `affix_${a.id}` });
    }
    if (inst.minor && minorDef(content, inst.minor) && !out.minors.includes(inst.minor)) out.minors.push(inst.minor);
  }
  out.leech = Math.min(out.leech, GEAR_LEECH_CAP);
  out.onHit.sort((a, b) => b.amount * b.chance - a.amount * a.chance || (a.ability < b.ability ? -1 : 1));
  out.onHit.length = Math.min(out.onHit.length, GEAR_ONHIT_MAX);
  out.any = out.leech > 0 || out.onHit.length > 0;
  return out;
}

export function minorDef(content, id) {
  for (const r of Object.values(content.rarity || {})) if (r && r.minor && r.minor.powers && r.minor.powers[id]) return r.minor.powers[id];
  return null;
}

export function minorsOf(content, e) {
  const out = [];
  for (const id of e.minors || []) { const d = minorDef(content, id); if (d) out.push(d); }
  return out;
}

export function rollMinor(content, rng, rarity, ilvl) {
  const R = (content.rarity || {})[rarity];
  const M = R && R.minor;
  if (!M || !M.powers || ilvl < (M.fromIlvl || 0)) return null;
  if (!rng.chance(M.chance)) return null;
  const ids = Object.keys(M.powers).sort();
  return ids.length ? ids[rng.int(0, ids.length - 1)] : null;
}

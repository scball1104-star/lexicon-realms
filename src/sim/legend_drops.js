// Random legendaries from the world's rares and bosses (polish 2026-11-22; BUILDS_2 6.1 and 6.8). Pure, deterministic.
//
//   const LD = createLegendDrops({ content, rng, state, emit })
//   LD.onKill(mob, p, drop)     after rollKill and the dungeon's own drops: maybe one legendary for `p`
//
// Rules (content.rarity.legendary.random, src/data/legendary_powers.js LEGEND_DROPS): a world rare (content.rares, or a
// template's `rare`) rolls `rare`, any other boss (`boss` on the template: a dungeon's lesser bosses, the Archivore) rolls
// `boss`; never a dungeon's last boss that has its own roll (src/sim/dungeons.js), never a foe below `fromLevel`, never a
// grey foe. The pool is every legendary item (content.items rarity 'legendary') the hero's class can use whose item level
// is at most the foe's level + `ilvlOver`. The roll uses its own stream forked from the sim's seed (saved as
// state.legendRng), so it never reshuffles the world's other rolls.
// Emits { type: 'legendary', id, item, source: 'rare' | 'boss', template, chance }.

export function createLegendDrops({ content, rng, state, emit }) {
  const R = content.rarity && content.rarity.legendary && content.rarity.legendary.random;
  if (!R) return { onKill() {}, sourceOf: () => null, pool: () => [] };
  const items = content.items || {};
  // a place's last boss that rolls its own legendary (src/data/dungeons.js `legend`) is left to that roll
  const lastBosses = new Set(Object.values(content.dungeons || {}).filter((d) => d && d.legend && d.legendary).map((d) => d.last).filter(Boolean));
  const pool = Object.values(items).filter((d) => d && d.rarity === 'legendary' && (d.kind === 'armor' || d.kind === 'weapon')).map((d) => d.id).sort();
  let own = null;
  function next() {
    if (!own) { own = rng.fork ? rng.fork('legend') : rng; if (state.legendRng != null && own !== rng) own.state = state.legendRng; }
    const v = own.next();
    if (own !== rng) state.legendRng = own.state;
    return v;
  }
  function fits(id, cls) {
    const d = items[id];
    if (!d) return false;
    if (d.classes && !d.classes.includes(cls)) return false;
    const cg = (content.classGear || {})[cls];
    if (cg && d.kind === 'weapon') return (Array.isArray(d.weaponType) ? d.weaponType : [d.weaponType]).some((w) => cg.weapons.includes(w));
    if (cg && d.kind === 'armor' && d.armorType && d.armorType !== 'class' && !Array.isArray(d.armorType)) return d.armorType === cg.armor;
    return true;
  }
  function instFor(id, cls) {
    const d = items[id];
    const cg = (content.classGear || {})[cls];
    const inst = { ilvl: d.level, rarity: d.rarity, affixes: [] };
    if (d.armorType === 'class') inst.armorType = cg ? cg.armor : 'cloth';
    else if (Array.isArray(d.armorType)) inst.armorType = cg && d.armorType.includes(cg.armor) ? cg.armor : d.armorType[0];
    if (Array.isArray(d.weaponType)) inst.weaponType = cg ? (d.weaponType.find((w) => cg.weapons.includes(w)) || d.weaponType[0]) : d.weaponType[0];
    return inst;
  }
  /** 'rare' | 'boss' | null: what kind of dropper this foe is for the roll. */
  function sourceOf(mob) {
    const t = (content.mobs || {})[mob.template] || {};
    if (lastBosses.has(mob.template)) return null;
    if ((content.rares || {})[mob.template] || t.rare) return 'rare';
    if (t.boss) return 'boss';
    return null;
  }
  function onKill(mob, p, drop) {
    if (!mob || !p || p.kind !== 'player' || !drop) return;
    const src = sourceOf(mob);
    if (!src) return;
    const L = mob.level || 1;
    if (L < (R.fromLevel || 1) || L - p.level <= -5) return;
    const chance = R[src] || 0;
    if (!(chance > 0)) return;
    const can = pool.filter((id) => items[id].level <= L + (R.ilvlOver || 0) && fits(id, p.cls));
    if (!can.length) return;
    if (next() >= chance) return;
    const id = can[Math.floor(next() * can.length)];
    drop.items.push({ item: id, qty: 1, inst: instFor(id, p.cls) });
    emit({ type: 'legendary', id: p.id, item: id, source: src, template: mob.template, chance });
  }
  return { onKill, sourceOf, pool: () => pool.slice() };
}

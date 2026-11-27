// Content layer for combat: ability lookup, talent ranks -> mods / procs / scripts / ability patches. Pure.
//
// Nothing here is stored in world state; caches are keyed by an entity's talent signature, so they never change the
// state hash. Ability patches (talent `modAbility`) produce an "effective" ability: a deep copy of the data with the
// talent edits applied (CONTRACTS 7.2, 5.8).
import { TICK_HZ } from './constants.js';

export const ticks = (sec) => Math.round((sec || 0) * TICK_HZ);
export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function createData(content) {
  // Builds 2 (src/data/builds2.js): its new skills join the table only when the flag is on, so the live game cannot learn them
  const b2 = content.builds2 || null;
  const b2On = !!(b2 && content.progression && content.progression.builds2 && content.progression.builds2.enabled);
  const abilities = { ...(content.mobAbilities || {}), ...(content.abilities || {}), ...(b2On ? b2.abilities || {} : {}) };
  const classes = content.classes || {};
  const talentTrees = content.talents || {};
  const talentIndex = {};
  for (const [cls, tree] of Object.entries(talentTrees)) for (const t of Object.values(tree.talents)) talentIndex[t.id] = { ...t, cls };
  // Builds 2 track nodes: their own index (ids start b2_), read from e.build.ranks when the hero runs Builds 2 (e.b2)
  const b2Index = {};
  if (b2) for (const [cls, c] of Object.entries(b2.classes || {})) for (const n of Object.values(c.nodes || {})) b2Index[n.id] = { ...n, cls };
  const cache = new Map();          // entity id -> { key, mods, procs, scripts, patches, eff: {} }

  function talentKey(e) {
    const t = e.talents || {};
    let key = Object.keys(t).sort().map((k) => `${k}:${t[k]}`).join(',');
    if (e.sets) key += `|sets|${Object.keys(e.sets).sort().map((k) => `${k}:${e.sets[k]}`).join(',')}`;   // set bonuses (dungeons)
    if (e.powers && e.powers.length) key += `|pw|${e.powers.join(',')}`;   // legendary powers that change a skill (modAbility)
    const pas = passivesKnown(e);
    if (pas.length) key += `|pas|${pas.join(',')}`;
    if (!e.b2 || !e.build) return key;
    const r = e.build.ranks || {};
    return `${key}|b2|${Object.keys(r).sort().map((k) => `${k}:${r[k]}`).join(',')}`;
  }
  // passive skills (the cap 30 level 25 picks, src/data/builds2_cap30.js): known = on; never on the bar, never cast
  const passiveIds = new Set(Object.keys(abilities).filter((id) => abilities[id] && abilities[id].passive && typeof abilities[id].passive === 'object'));
  function passivesKnown(e) { return passiveIds.size && e.known ? e.known.filter((id) => passiveIds.has(id)).sort() : []; }
  /** Every (node, rank) that applies to `e`: today's talents, plus the Builds 2 ranks when the hero runs Builds 2. */
  function rankedNodes(e) {
    const out = [];
    for (const [id, r] of Object.entries(e.talents || {})) { const t = talentIndex[id]; if (t && r) out.push([t, r]); }
    if (e.b2 && e.build) for (const [id, r] of Object.entries(e.build.ranks || {})) { const t = b2Index[id]; if (t && r) out.push([t, r]); }
    return out;
  }
  function talentInfo(e) {
    const key = talentKey(e);
    let c = cache.get(e.id);
    if (c && c.key === key) return c;
    c = { key, mods: [], procs: [], scripts: new Set(), patches: {}, eff: {}, grants: [] };
    const ranked = rankedNodes(e);
    for (const id of passivesKnown(e)) ranked.push([{ id, byRank: [abilities[id].passive] }, 1]);
    for (const [t, r] of ranked) {
      const id = t.id;
      const fx = t.byRank[Math.min(r, t.byRank.length) - 1];
      if (!fx) continue;
      for (const m of fx.mods || []) c.mods.push({ ...m, src: id });
      for (const p of fx.procs || []) c.procs.push({ ...p, src: id });
      if (fx.script) c.scripts.add(fx.script);
      for (const sc of fx.scripts || []) c.scripts.add(sc);
      if (fx.grant && !c.grants.includes(fx.grant)) c.grants.push(fx.grant);     // Builds 2 +skill nodes (Gate Charge, Vellum Ward, ...)
      for (const p of fx.modAbility || []) (c.patches[p.id] = c.patches[p.id] || []).push(p);
    }
    // class passives (class identity pass): every hero of the class has them, talents or not (CLASSES.md strengths table)
    const pas = (classes[e.cls] || {}).passives;
    if (pas) {
      for (const m of pas.mods || []) c.mods.push({ ...m, src: 'class' });
      for (const p of pas.procs || []) c.procs.push({ ...p, src: 'class' });
    }
    // Builds 2 baseline strengths and weaknesses (BUILDS_2 4.x, e.g. the Mender's healing +10%)
    const base = e.b2 && b2 && b2.classes[e.cls] ? b2.classes[e.cls].baseline : null;
    if (base) {
      for (const m of base.mods || []) c.mods.push({ ...m, src: 'b2_baseline' });
      for (const p of base.procs || []) c.procs.push({ ...p, src: 'b2_baseline' });
    }
    // set bonuses (src/data/items.js SETS and raid RAID_SETS): every threshold met adds its mods, procs and
    // skill patches (modAbility), the same engine legendary powers use
    for (const [sid, n] of Object.entries(e.sets || {})) {
      const s = (content.sets || {})[sid];
      if (!s) continue;
      for (const [need, fx] of Object.entries(s.bonus || {})) {
        if (n < Number(need)) continue;
        for (const m of fx.mods || []) c.mods.push({ ...m, src: `${sid}_${need}` });
        for (const p of fx.procs || []) c.procs.push({ ...p, src: `${sid}_${need}` });
        for (const p of fx.modAbility || []) (c.patches[p.id] = c.patches[p.id] || []).push(p);
      }
    }
    // legendary item powers that change a skill (BUILDS_2 6.3): `modAbility` on the worn item's power, class-gated by `cls`
    for (const iid of e.powers || []) {
      const pw = ((content.items || {})[iid] || {}).power;
      if (!pw || !pw.modAbility || (pw.cls && pw.cls !== e.cls)) continue;
      for (const p of pw.modAbility) (c.patches[p.id] = c.patches[p.id] || []).push(p);
    }
    cache.set(e.id, c);
    return c;
  }

  /** The ability as this entity casts it (talent patches applied). Mobs and talent-less players get the data itself. */
  function ability(e, id) {
    const base = abilities[id];
    if (!base) return null;
    if (!e || e.kind !== 'player') return base;
    if (e.moveCharges) return moreCharges(e, abilityOf(e, id, base));   // Inscriptions: GO, one more charge on a movement skill
    return abilityOf(e, id, base);
  }
  const moved = new WeakMap();
  function moreCharges(e, ab) {
    if (!ab || !ab.cooldown || !(ab.effects || []).some((f) => f && f.type === 'move')) return ab;
    let m = moved.get(ab);
    if (!m) moved.set(ab, (m = {}));
    if (!m[e.moveCharges]) m[e.moveCharges] = { ...ab, charges: (ab.charges || 1) + e.moveCharges };
    return m[e.moveCharges];
  }
  function abilityOf(e, id, base) {
    const info = talentInfo(e);
    if (!info.patches[id]) return base;
    if (!info.eff[id]) {
      const a = clone(base);
      for (const p of info.patches[id]) applyPatch(a, p);
      info.eff[id] = a;
    }
    return info.eff[id];
  }

  const hasScript = (e, name) => e.kind === 'player' && talentInfo(e).scripts.has(name);

  return { abilities, classes, talentTrees, talentIndex, b2Index, b2, b2On, talentInfo, ability, hasScript, forget: (id) => cache.delete(id) };
}

// ------------------------------------------------------------------------------------------- ability patch engine
function resolveSeg(obj, seg) {
  if (seg[0] === '#') {
    if (!Array.isArray(obj)) return undefined;
    const i = obj.findIndex((x) => x && x.key === seg.slice(1));
    return i < 0 ? undefined : i;
  }
  return /^\d+$/.test(seg) ? Number(seg) : seg;
}

function mulDeep(v, k) {
  if (typeof v === 'number') return v * k;
  if (v && typeof v === 'object') { for (const key of Object.keys(v)) if (key !== 'stat') v[key] = mulDeep(v[key], k); }
  return v;
}

export function applyPatch(root, p) {
  const segs = p.path.split('.');
  let obj = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const k = resolveSeg(obj, segs[i]);
    if (k === undefined) return false;
    if (obj[k] == null || typeof obj[k] !== 'object') obj[k] = {};
    obj = obj[k];
  }
  const last = resolveSeg(obj, segs[segs.length - 1]);
  if (last === undefined) return false;
  if ('set' in p) obj[last] = clone(p.set);
  else if ('push' in p) { if (!Array.isArray(obj[last])) obj[last] = []; obj[last].push(clone(p.push)); }
  else if ('add' in p) obj[last] = (typeof obj[last] === 'number' ? obj[last] : 0) + p.add;
  else if ('mul' in p) obj[last] = mulDeep(obj[last] == null ? 0 : obj[last], p.mul);
  return true;
}

/** `{ base, perLevel }` | number | [min, max] (rolled) at a level. */
export function levelValue(v, level, rng) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return rng ? v[0] + rng.next() * (v[1] - v[0]) : (v[0] + v[1]) / 2;
  return (v.base || 0) + (v.perLevel || 0) * level;
}

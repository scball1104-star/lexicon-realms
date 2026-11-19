// Content layer for combat: ability lookup, talent ranks -> mods / procs / scripts / ability patches. Pure.
//
// Nothing here is stored in world state; caches are keyed by an entity's talent signature, so they never change the
// state hash. Ability patches (talent `modAbility`) produce an "effective" ability: a deep copy of the data with the
// talent edits applied (CONTRACTS 7.2, 5.8).
import { TICK_HZ } from './constants.js';

export const ticks = (sec) => Math.round((sec || 0) * TICK_HZ);
export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function createData(content) {
  const abilities = { ...(content.mobAbilities || {}), ...(content.abilities || {}) };
  const classes = content.classes || {};
  const talentTrees = content.talents || {};
  const talentIndex = {};
  for (const [cls, tree] of Object.entries(talentTrees)) for (const t of Object.values(tree.talents)) talentIndex[t.id] = { ...t, cls };
  const cache = new Map();          // entity id -> { key, mods, procs, scripts, patches, eff: {} }

  function talentKey(e) {
    const t = e.talents || {};
    return Object.keys(t).sort().map((k) => `${k}:${t[k]}`).join(',');
  }
  function talentInfo(e) {
    const key = talentKey(e);
    let c = cache.get(e.id);
    if (c && c.key === key) return c;
    c = { key, mods: [], procs: [], scripts: new Set(), patches: {}, eff: {} };
    for (const [id, r] of Object.entries(e.talents || {})) {
      const t = talentIndex[id];
      if (!t || !r) continue;
      const fx = t.byRank[Math.min(r, t.byRank.length) - 1];
      if (!fx) continue;
      for (const m of fx.mods || []) c.mods.push({ ...m, src: id });
      for (const p of fx.procs || []) c.procs.push({ ...p, src: id });
      if (fx.script) c.scripts.add(fx.script);
      for (const p of fx.modAbility || []) (c.patches[p.id] = c.patches[p.id] || []).push(p);
    }
    cache.set(e.id, c);
    return c;
  }

  /** The ability as this entity casts it (talent patches applied). Mobs and talent-less players get the data itself. */
  function ability(e, id) {
    const base = abilities[id];
    if (!base) return null;
    if (!e || e.kind !== 'player') return base;
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

  return { abilities, classes, talentTrees, talentIndex, talentInfo, ability, hasScript, forget: (id) => cache.delete(id) };
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

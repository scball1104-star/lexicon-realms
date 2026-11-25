// Dungeon copies (dungeons build, 2026-11-22; CONTRACTS "Dungeons and caves"). A copy of a dungeon or cave is the same
// zone data under its own zone id, `<place>#<key>` (key: the party, today the hero's id), so every entity in a copy names
// that id and nothing from another copy can see, hit or target it (the sim compares zone ids everywhere).
//
//   zoneBase('barrow#12') -> 'barrow'          zoneBase('world') -> 'world'
//   withCopies(ZONES)                          a lookup table where zones['barrow#12'] is ZONES.barrow (keys, values and
//                                              Object.keys stay the real zones; renderers and the sim read through it)
// src/sim/dungeons.js has its own copy of these two (the sim imports nothing from src/data).
export const COPY_SEP = '#';
export const zoneBase = (id) => { const s = String(id); const i = s.indexOf(COPY_SEP); return i < 0 ? s : s.slice(0, i); };

const WRAPPED = new WeakSet();
// wave 10 drift: zones made on first use (a word rift, src/data/rift.js riftZoneMaker): addZoneMaker(zones, fn) where
// fn(id) -> zone | null. A made zone is kept on the table, so it is made once per id. Pure makers only (same id, same zone).
const MAKERS = new WeakMap();
export function addZoneMaker(zones, fn) { const t = MAKERS.get(zones) || []; t.push(fn); MAKERS.set(zones, t); }
function make(t, id) {
  const list = MAKERS.get(t);
  if (!list || !/^[a-z0-9_]+$/.test(id)) return;
  for (const fn of list) { const z = fn(id); if (z) { t[id] = z; return; } }
}
export function withCopies(zones) {
  if (WRAPPED.has(zones)) return zones;
  if (!MAKERS.has(zones)) MAKERS.set(zones, []);    // wave 10 drift
  const p = new Proxy(zones, {
    get(t, k) {
      if (typeof k !== 'string' || Object.prototype.hasOwnProperty.call(t, k)) return t[k];
      const b = zoneBase(k);
      if (!Object.prototype.hasOwnProperty.call(t, b)) make(t, b);     // wave 10 drift: a made zone (a word rift)
      return b !== k && Object.prototype.hasOwnProperty.call(t, b) ? t[b] : t[k];
    },
    has(t, k) {
      if (typeof k !== 'string') return k in t;
      const b = zoneBase(k);
      if (!Object.prototype.hasOwnProperty.call(t, b)) make(t, b);     // wave 10 drift
      return k in t || (b !== k && Object.prototype.hasOwnProperty.call(t, b));
    },
  });
  WRAPPED.add(p);
  MAKERS.set(p, MAKERS.get(zones));                 // wave 10 drift: addZoneMaker(ZONES, fn) reaches the table
  return p;
}

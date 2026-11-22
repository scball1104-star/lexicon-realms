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
export function withCopies(zones) {
  if (WRAPPED.has(zones)) return zones;
  const p = new Proxy(zones, {
    get(t, k) {
      if (typeof k !== 'string' || Object.prototype.hasOwnProperty.call(t, k)) return t[k];
      const b = zoneBase(k);
      return b !== k && Object.prototype.hasOwnProperty.call(t, b) ? t[b] : t[k];
    },
    has(t, k) {
      if (typeof k !== 'string') return k in t;
      const b = zoneBase(k);
      return k in t || (b !== k && Object.prototype.hasOwnProperty.call(t, b));
    },
  });
  WRAPPED.add(p);
  return p;
}

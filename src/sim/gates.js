// Level gates on zones (cap 35 review fix, 2026-11-27). Pure, data-driven: a zone's gate is the lowest `minLevel` on the
// joins that lead into it from other outdoor zones, when every such join carries one (the Millrace: Ferrick's chain on the
// Downs road, 30). A zone any ungated join leads into has no gate (0). Doors into dungeons and caves keep their own
// `minLevel` on the door; the exits back out of a place are not counted (they lead out, not in).
//
//   zoneGate(zones, zid)        -> the level a hero needs to be in that zone on foot (0: none)
//   heroLevel(p)                -> the hero's own level (a synced hero's own, not the band's)
const cache = new WeakMap();

export function zoneGate(zones, zid) {
  if (!zones || zid == null) return 0;
  let m = cache.get(zones);
  if (!m) { m = new Map(); cache.set(zones, m); }
  const id = String(zid).split('#')[0];
  if (m.has(id)) return m.get(id);
  let min = null, open = false;
  for (const z of Object.values(zones)) {
    if (!z || z.id === id || z.kind === 'dungeon' || z.kind === 'cave') continue;
    for (const j of z.joins || []) {
      if (j.to !== id) continue;
      if (j.minLevel) min = min == null ? j.minLevel : Math.min(min, j.minLevel);
      else open = true;
    }
  }
  const out = open || min == null ? 0 : min;
  m.set(id, out);
  return out;
}

export const heroLevel = (p) => (p && p.sync && p.sync.from != null ? p.sync.from : (p && p.level) || 1);

/**
 * Where a hero of `level` may stand, starting from a spot in zone `zid` (tiles): the spot itself when the zone's gate allows,
 * else the far side of the zone's way out, walked outward until a zone they may be in (a co-op guest joining a host who
 * stands past a gate they cannot pass: src/net/coop.js spawnGuest). Returns { zone, x, y }.
 */
export function gateSafeSpot(zones, zid, x, y, level) {
  let at = { zone: zid, x, y };
  for (let hop = 0; hop < 4; hop++) {
    const z = zones && zones[at.zone];
    if (!z || level >= zoneGate(zones, at.zone)) return at;
    const out = (z.joins || []).find((j) => j.to && j.to !== at.zone && zones[j.to] && !j.door);
    if (!out) return at;
    at = { zone: out.to, x: out.tx, y: out.ty };
  }
  return at;
}

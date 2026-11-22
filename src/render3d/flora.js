// Tree sizes for the 3D zone builder (landscape pass 2026-11-20, docs/design/LANDSCAPE_PASS.md). Pure, no three.js, so
// tools/maps/landscape_metrics.mjs scores the same canopies the renderer draws.
//
//   treeDims(t, x, y, edge) -> { kind: 'cone' | 'blob', h, xz, R, base, ox } | null
//     h     model height (m)          xz    horizontal squash on top of the height scale (slimmer crowns)
//     R     canopy radius (m)         base  crown bottom (m)            ox    crown offset east (the willow leans)
//   edge: the tree stands on the zone's border band or a cliff top (a frame for the zone, so it may stay taller)
//
// The hero is 1.8 m. Before the pass a pine was 4.8 to 7 m with a 2 to 2.8 m crown radius, so a tree a tile south of
// the road hid the hero from the 40 degree camera. Now an inland pine is 3.3 to 4.3 m with a 1 to 1.4 m crown, an
// inland willow 4.2 to 4.7 m (was 6.5 to 7.5).
export const hashXY = (x, y, s = 0) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1103515245)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Does (x, y) sit on the zone's (or its area's) border band (3 tiles) or on a cliff / crag top? */
export function edgeCell(zone, x, y) {
  if (x < 3 || y < 3 || x >= zone.w - 3 || y >= zone.h - 3) return true;
  // the one world (zone.regions): an area keeps the taller frame trees on its own border band, as when it was a zone
  for (const r of zone.regions || []) {
    if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) continue;
    if (x < r.x + 3 || y < r.y + 3 || x >= r.x + r.w - 3 || y >= r.y + r.h - 3) return true;
    break;
  }
  const row = zone.ground && zone.ground[y];
  const id = row && zone.legend ? zone.legend[row[x]] : null;
  return id === 'cliff_top' || id === 'x1_crag_top';
}

export function treeDims(t, x, y, edge = false) {
  const r = (s) => hashXY(x, y, s);
  if (t === 'tree_pine') {
    const h = edge ? 4.4 + r(2) * 1.4 : 3.3 + r(2) * 1.0;
    const xz = edge ? 0.9 : 0.8;
    return { kind: 'cone', h, xz, R: 0.4 * xz * h, base: 0.3 * h, ox: 0 };
  }
  if (t === 'tree_willow') {
    // the kit willow (TwistedTree_1) leans: its crown is 0.8 of its height across, centred 0.28 of it east
    const h = edge ? 5.2 + r(2) * 0.6 : 4.2 + r(2) * 0.5, xz = edge ? 0.85 : 0.7;
    return { kind: 'blob', h, xz, R: 0.41 * xz * h, base: 0.35 * h, ox: 0.28 * xz * h };
  }
  return null;
}

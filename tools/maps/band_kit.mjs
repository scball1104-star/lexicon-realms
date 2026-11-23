// The 20 to 30 band zones' shared stamps (band lane, 2026-11-22; D:/LQOnline/world3/BRIEF.md sections 2 and 4). Dev only,
// never imported at runtime. Used by zone_larchhill.mjs and zone_drovers_reach.mjs on top of the big-zone kit
// (bigzone_kit.mjs): the hub town, a river with fords where the roads cross it, a scatter of trees and stones on the
// open floor, and a camp's dressing. Deterministic (hash01), so build_world.mjs always writes the same modules.
//
//   town(k, cx, cy, { name, fail })     the hub: plaza, inn, shop, smithy, houses, well, stalls, lamps, signposts;
//                                       returns { box, spots } (spots: where its people stand, in tiles)
//   riverFords(k, pts, { width, ford }) a river along a curve; road cells it meets become a walkable ford
//   scatter(k, { box, avoid, every, seed, pick }) trees and stones on the open floor, never on a road
//   campDress(k, x, y, kind)            a hearth and a few crates (a camp the foes keep), or a turf hut (an outpost)
import { curve } from './bigzone_kit.mjs';
import { hash01 } from './kit.mjs';

/** The hub town round (cx, cy): a stone plaza 64 x 36 with its buildings on the north side and the houses south. */
export function town(k, cx, cy, { label = 'town' } = {}) {
  const box = { x0: cx - 34, y0: cy - 20, x1: cx + 34, y1: cy + 20 };
  // the plaza floor (walkable stone) and the town's own clear ground round it
  for (let y = box.y0 - 6; y <= box.y1 + 6; y++) for (let x = box.x0 - 6; x <= box.x1 + 6; x++) k.open(x, y);
  k.paint((x, y, ch, fl) => (fl && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1 ? 'o' : null));
  const put = (t, x, y, extra = {}) => { if (!k.put(t, x, y, extra)) throw new Error(`${label}: ${t} at ${x},${y} does not fit`); };
  // north row: the shop, the smithy, the inn (doors face the plaza)
  put('item_shop', cx - 22, cy - 6);        // x cx-22..cx-18, door (cx-19, cy-6)
  put('smithy', cx - 10, cy - 6);           // x cx-10..cx-5, door (cx-6, cy-6)
  put('inn', cx + 8, cy - 6);               // x cx+8..cx+15
  // south: houses and cottages
  put('house_small', cx - 28, cy + 16); put('x1_cottage_a', cx - 16, cy + 17); put('house_medium', cx + 14, cy + 17); put('x1_cottage_b', cx + 24, cy + 16);
  put('well', cx, cy + 6);
  put('market_stall_fruit', cx - 12, cy + 9); put('market_stall_cloth', cx + 8, cy + 9);
  for (const [x, y] of [[cx - 26, cy - 2], [cx - 2, cy - 4], [cx + 20, cy - 2], [cx - 30, cy + 8], [cx + 30, cy + 8], [cx - 4, cy + 14], [cx + 4, cy + 14]]) k.put('lamp_post', x, y, { state: 1 });
  // the signposts stand beside the four ways in (roads arrive on the row cy and the column cx + 2)
  for (const [x, y] of [[box.x0 - 2, cy + 3], [box.x1 + 2, cy + 3], [cx + 6, box.y0 - 2], [cx + 6, box.y1 + 2]]) k.put('signpost_arrow', x, y);
  return {
    box,
    spots: {
      shop: [cx - 19, cy - 4], smith: [cx - 6, cy - 4], inn: [cx + 12, cy - 4], master: [cx + 4, cy + 3], lantern: [cx - 3, cy + 4],
      well: [cx + 3, cy + 7], stallW: [cx - 11, cy + 11], stallE: [cx + 9, cy + 11], south: [cx, cy + 12], west: [cx - 26, cy + 4], east: [cx + 26, cy + 4],
    },
  };
}

/** A river along pts (tile coords). Cells it covers turn to water (blocking) unless a road runs there: those become a
 *  walkable ford of `ford` (sand) with pebbles. Banks within a tile of the water get `bank`. Returns the ford cells. */
export function riverFords(k, pts, { width = 6, deep = '~', shallow = '-', bank = 's', ford = 's' } = {}) {
  const r = width / 2;
  const fords = [];
  for (const [fx, fy] of curve(pts, 0.004)) {
    for (let y = Math.floor(fy - r - 2); y <= Math.ceil(fy + r + 2); y++) for (let x = Math.floor(fx - r - 2); x <= Math.ceil(fx + r + 2); x++) {
      if (!k.inb(x, y) || k.kind[y][x] === 9) continue;
      const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy);
      if (d < r) {
        if (k.kind[y][x] === 2 || k.kind[y][x] === 6) { if (k.kind[y][x] !== 6) { k.kind[y][x] = 6; k.ground[y][x] = ford; fords.push([x, y]); } continue; }
        if (k.kind[y][x] === 4) continue;
        k.ground[y][x] = d < r * 0.6 ? deep : shallow; k.coll[y][x] = '~'; k.kind[y][x] = 4;
      } else if (d < r + 1.4 && k.kind[y][x] === 1) k.ground[y][x] = bank;
    }
  }
  // a ford is road for every later rule (props keep off it)
  for (const [x, y] of fords) { k.kind[y][x] = 2; if (hash01(x, y, 5) < 0.35) k.overlay(['pebbles_0', 'pebbles_1', 'pebbles_2'][Math.floor(hash01(x, y, 6) * 3)], x, y); }
  return fords;
}

/** Trees and stones on the open floor (an open woodland, not a field): one try every `every` tiles. `avoid` boxes stay
 *  clear (towns, camps). pick(r) -> a decor id or null. */
export function scatter(k, { every = 4, seed = 71, avoid = [], pick, roadGap = 3 }) {
  for (let y = 3; y < k.H - 3; y += every) for (let x = 3; x < k.W - 3; x += every) {
    const X = x + Math.floor(hash01(x, y, seed + 1) * every), Y = y + Math.floor(hash01(x, y, seed + 2) * every);
    if (avoid.some((b) => X >= b.x0 && X <= b.x1 && Y >= b.y0 && Y <= b.y1)) continue;
    if (!k.free(X, Y, roadGap)) continue;
    const t = pick(hash01(X, Y, seed), X, Y);
    if (t) k.put(t, X, Y);
  }
}

/** A camp's dressing at (x, y): `foe` a hearth with crates and sacks; `outpost` a turf hut, a hearth and supplies. */
export function campDress(k, x, y, kind = 'foe') {
  if (kind === 'outpost') { k.put('x1_turf_hut', x - 2, y - 3); k.put('x1_hearth', x + 4, y); k.put('x1_sack_stack', x + 8, y - 2); k.put('crates_barrels', x - 6, y + 1); return; }
  k.put('x1_hearth', x - 1, y); k.put('crates_barrels', x + 3, y - 2); k.put('x1_sack_stack', x - 4, y - 2); k.put('barrel', x + 4, y + 2);
}

/** The box round a point (for scatter's `avoid`). */
export const around = (x, y, r) => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });

// Dungeon and cave dressing plan (render lane, dungeons build 2026-11-22). Pure: both renderers and the tests read it.
//
//   isPlaceZone(zone)        -> true for a zone of kind 'dungeon' or 'cave'
//   dungeonPlan(zone)        -> { kind, props: [{ t, x, y, face?, r }], columns: [[x, y]], skip: Set('x,y') } (cached per zone)
//   doorMouths(zone)         -> the world's dungeon and cave doors with the side their opening faces ('s', 'w', 'n', 'e')
//   DG_KNOWN                 -> the dungeon decor ids the renderers draw (anything else that starts dg_ gets a plain fallback)
//
// Authored decor wins: a zone whose `decor` holds any dg_* piece is dressed from those pieces only (the map lane places
// them; ids agreed in docs/INTEGRATION_TODO.md "Dungeons"). A zone with none is dressed here from its collision and its
// `areas`, deterministically (same zone, same dressing, in 2D and 3D): torches on the back walls (the wall faces the
// camera looks at), coffin niches between them in dungeons, braziers in the corners of the big rooms and all four corners
// of a boss room, banners behind a boss, bones, skulls, urns and rubble along the wall feet; caves get fewer torches,
// hanging roots, mushrooms and loose rock. Nothing tall is placed in the open floor, since the sim does not know about
// these pieces (a hero can walk through a corner brazier, not through the middle of a hall). Columns come only from the
// collision (a lone solid cell), so they are real blockers.
//
// Tiles: x, y are tile coordinates; `face` is the side of a wall cell the piece hangs on, toward the floor:
// 's' (the back wall, seen from the camera), 'e' or 'w' (side walls).
export const DG_KNOWN = Object.freeze(['dg_torch', 'dg_brazier', 'dg_column', 'dg_niche', 'dg_bier', 'dg_bones', 'dg_skulls', 'dg_urn',
  'dg_rubble', 'dg_candles', 'dg_coins', 'dg_chain', 'dg_cage', 'dg_banner', 'dg_roots', 'dg_mushrooms', 'dg_stalagmite']);
// wall-mounted pieces (drawn on a wall face, cut away with the wall)
export const DG_WALL = Object.freeze(new Set(['dg_torch', 'dg_niche', 'dg_banner', 'dg_roots']));
// pieces that carry a flame (a light)
export const DG_FIRE = Object.freeze(new Set(['dg_torch', 'dg_brazier', 'dg_candles']));

export const isPlaceZone = (zone) => !!zone && (zone.kind === 'dungeon' || zone.kind === 'cave');

export function hashXY(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1103515245)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Cell tests for a place zone: solid rock, open floor (water is open but takes no props). */
export function cells(zone) {
  const W = zone.w, H = zone.h, col = zone.collision || [];
  const ch = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : (col[y] || '')[x] || '#');
  return { W, H, solid: (x, y) => ch(x, y) === '#', floor: (x, y) => ch(x, y) === '.', water: (x, y) => ch(x, y) === '~' };
}

const cache = new WeakMap();
export function dungeonPlan(zone) {
  if (!isPlaceZone(zone)) return { kind: null, props: [], columns: [], skip: new Set() };
  if (cache.has(zone)) return cache.get(zone);
  const { W, H, solid, floor } = cells(zone);
  const cave = zone.kind === 'cave';
  const key = (x, y) => `${x},${y}`;
  // cells nothing is placed on or near: the doors, the lantern and its post, the arrival, the chests
  const keep = new Set();
  const near = (x, y, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) keep.add(key(x + i, y + j)); };
  for (const j of zone.joins || []) for (let i = 0; i < (j.w || 1); i++) for (let k = 0; k < (j.h || 1); k++) near(j.x + i, j.y + k, 2);
  for (const l of zone.lanterns || []) { near(l.x, l.y, 1); if (l.post) near(l.post[0], l.post[1], 1); }
  if (zone.arrival) near(zone.arrival[0], zone.arrival[1], 1);
  for (const c of (zone.dungeon && zone.dungeon.chests) || []) near(c.x, c.y, 1);
  const posts = new Set((zone.lanterns || []).filter((l) => l.post).map((l) => key(l.post[0], l.post[1])));
  for (const d of zone.decor || []) if (d.t === 'lamp_post') posts.add(key(d.x, d.y));
  // a lone solid cell with floor all round is a column (the lantern post is drawn as itself)
  const columns = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!solid(x, y) || posts.has(key(x, y))) continue;
    if (!solid(x - 1, y) && !solid(x + 1, y) && !solid(x, y - 1) && !solid(x, y + 1)) columns.push([x, y]);
  }
  const skip = new Set([...posts, ...columns.map(([x, y]) => key(x, y))]);
  const authored = (zone.decor || []).filter((d) => /^dg_/.test(d.t));
  let props;
  if (authored.length) {
    props = authored.map((d) => ({ t: DG_KNOWN.includes(d.t) ? d.t : 'dg_unknown', id: d.t, x: d.x, y: d.y, face: d.face || 's', r: d.r != null ? d.r : hashXY(d.x, d.y, 1) }));
    for (const p of props) if (p.t === 'dg_column' || p.t === 'dg_stalagmite') skip.add(key(p.x, p.y));
  } else props = autoDress(zone, { W, H, solid, floor, cave, keep, key, skip });
  const plan = { kind: zone.kind, props, columns, skip };
  cache.set(zone, plan);
  return plan;
}

function autoDress(zone, { W, H, solid, floor, cave, keep, key, skip }) {
  const props = [], used = new Set();
  const put = (t, x, y, extra = {}) => { props.push({ t, x, y, r: hashXY(x, y, t.length), ...extra }); used.add(key(x, y)); };
  const free = (x, y) => floor(x, y) && !keep.has(key(x, y)) && !used.has(key(x, y));
  // back walls: runs of solid cells with floor straight south (the faces the camera sees)
  const step = cave ? 8 : 5;
  for (let y = 1; y < H - 1; y++) {
    let x = 0;
    while (x < W) {
      if (!(solid(x, y) && floor(x, y + 1) && !skip.has(key(x, y)))) { x++; continue; }
      let x1 = x;
      while (x1 + 1 < W && solid(x1 + 1, y) && floor(x1 + 1, y + 1) && !skip.has(key(x1 + 1, y))) x1++;
      const L = x1 - x + 1;
      if (L >= 3) {
        const n = Math.max(1, Math.floor((L + 1) / step));
        const slots = [];
        for (let i = 0; i < n; i++) slots.push(x + Math.floor(((i + 0.5) * L) / n));
        for (const sx of slots) if (!keep.has(key(sx, y + 1))) put('dg_torch', sx, y, { face: 's' });
        // between the torches: coffin niches (dungeons) or hanging roots (caves)
        for (let i = 0; i + 1 < slots.length; i++) {
          const mx = Math.floor((slots[i] + slots[i + 1]) / 2);
          if (mx === slots[i] || keep.has(key(mx, y + 1))) continue;
          if (!cave && hashXY(mx, y, 21) < 0.55) put('dg_niche', mx, y, { face: 's' });
          else if (cave && hashXY(mx, y, 22) < 0.7) put('dg_roots', mx, y, { face: 's' });
        }
        if (cave) for (let xx = x; xx <= x1; xx++) if (!used.has(key(xx, y)) && hashXY(xx, y, 23) < 0.18) put('dg_roots', xx, y, { face: 's' });
      }
      x = x1 + 1;
    }
  }
  // long side walls (corridors running north to south) get a torch every 7 cells
  for (const [dx, face] of [[1, 'e'], [-1, 'w']]) {
    for (let x = 1; x < W - 1; x++) {
      let y = 0;
      while (y < H) {
        if (!(solid(x, y) && floor(x + dx, y))) { y++; continue; }
        let y1 = y;
        while (y1 + 1 < H && solid(x, y1 + 1) && floor(x + dx, y1 + 1)) y1++;
        const L = y1 - y + 1;
        if (L >= 7) for (let k = 3; k < L - 2; k += 7) { const yy = y + k; if (!keep.has(key(x + dx, yy)) && !used.has(key(x, yy))) put('dg_torch', x, yy, { face }); }
        y = y1 + 1;
      }
    }
  }
  // rooms: braziers in the corners (big rooms: the two back corners; a boss room: all four), banners behind a boss
  const bossAt = (zone.spawns || []).filter((s) => s.boss);
  for (const a of zone.areas || []) {
    const boss = bossAt.some((s) => s.x >= a.x && s.x < a.x + a.w && s.y >= a.y && s.y < a.y + a.h);
    if (!boss && (a.w < 10 || a.h < 7)) continue;
    const cs = [[a.x + 1, a.y + 1], [a.x + a.w - 2, a.y + 1]];
    if (boss) cs.push([a.x + 1, a.y + a.h - 2], [a.x + a.w - 2, a.y + a.h - 2]);
    for (const [x, y] of cs) {
      // a corner spot: floor, with rock within two cells on its outer sides (the room's real corner)
      if (!free(x, y)) continue;
      const ox = x < a.x + a.w / 2 ? -1 : 1, oy = y < a.y + a.h / 2 ? -1 : 1;
      if (!(solid(x + ox, y) || solid(x + 2 * ox, y)) || !(solid(x, y + oy) || solid(x, y + 2 * oy))) continue;
      put('dg_brazier', x, y);
    }
    if (boss && !cave) {
      const cx = Math.floor(a.x + a.w / 2);
      for (const bx of [cx - 2, cx + 1]) { let by = a.y - 1; while (by < a.y + 2 && !(solid(bx, by) && floor(bx, by + 1))) by++; if (solid(bx, by) && floor(bx, by + 1) && !used.has(key(bx, by))) put('dg_banner', bx, by, { face: 's' }); }
    }
  }
  // the wall feet: bones, skulls, urns and rubble (dungeons); mushrooms, rock and bones (caves)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!free(x, y)) continue;
    const walls = (solid(x - 1, y) ? 1 : 0) + (solid(x + 1, y) ? 1 : 0) + (solid(x, y - 1) ? 1 : 0) + (solid(x, y + 1) ? 1 : 0);
    if (!walls) continue;
    const h = hashXY(x, y, 31);
    if (h > (cave ? 0.11 : 0.08)) continue;
    const k = hashXY(x, y, 32);
    if (cave) put(k < 0.4 ? 'dg_mushrooms' : k < 0.75 ? 'dg_rubble' : 'dg_bones', x, y);
    else put(k < 0.35 ? 'dg_bones' : k < 0.5 ? 'dg_skulls' : k < 0.8 ? 'dg_urn' : k < 0.93 ? 'dg_rubble' : 'dg_chain', x, y);
  }
  return props;
}

/** The world's doors into dungeons and caves, with the side the opening faces (from the join's walk direction). */
export function doorMouths(zone) {
  const FACE = { up: 's', right: 'w', down: 'n', left: 'e' };
  return ((zone && zone.doors) || []).map((d) => {
    const j = (zone.joins || []).find((jj) => jj.door === d.id || (jj.to === d.to && jj.x === d.x && jj.y === d.y));
    const dir = (j && j.dir) || 'up';
    return { ...d, dir, face: FACE[dir] || 's' };
  });
}

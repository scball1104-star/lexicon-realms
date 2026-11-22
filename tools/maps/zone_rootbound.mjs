// The Rootbound (big world piece 1, 2026-11-22; WORLD_2.md 1.3, D:/LQOnline/world3/BRIEF.md): the Scribe's start realm,
// levels 1 to 6. A library grown inside the roots of the Great Willow, under Willowmere: halls of moss and stone joined
// by root passages, a river of glowing ink through the chasm, the Willow Library as its town, the Archivore in the
// willow's heart at the bottom. Its own outdoor zone, 576 x 384 tiles (about 2 minutes across on foot), joined to the
// world at the Root Stair (a short load at the pass north of Willowmere, tools/maps/zone_wilds.mjs).
//
// Built with the big-zone kit (bigzone_kit.mjs): halls and passages carve the floor, roads and the ink river run along
// it, the root walls fill the rest (a tree line of root columns near the floor, cheap canopy behind). Pockets (the
// town, the camps, the outposts, the boss's heart) are stamped by hand below. Deterministic.
import { bigZone, curve } from './bigzone_kit.mjs';
import { hash01, vnoise } from './kit.mjs';

export const W = 576, H = 384;
// the world side of the Root Stair: the pass tiles on the world (zone_wilds.mjs) and where a hero lands there coming up
export const STAIR = { x: 286, y: 0, w: 4, h: 1, arrive: [288, 5] };
// the pass on the world (world tiles): the join cells at the top of the spur north off the North Road, and where a hero
// coming up the stair lands (zone_wilds.mjs carves the spur)
export const WORLD_STAIR = { x: 185, y: 78, w: 4, h: 1, arrive: [186, 82] };

// hall centres (tiles): the pockets the passages join
export const P = {
  stair: [288, 12], library: [288, 64], catalog: [150, 112], warrens: [86, 196], chasm: [204, 210], galleries: [432, 150],
  lamplighter: [482, 62], aisles: [474, 268], echo: [288, 262], heart: [288, 336], stacks: [108, 324], longaisle: [288, 160],
};

export function build(db) {
  const LEG = { '.': 'moss', ':': 'dirt', '=': 'plaza', ',': 'tallgrass', '~': 'ink', 'o': 'plaza' };
  const k = bigZone(W, H, { legend: LEG, floor: '.', seed: 20261122, db });

  // ---- halls (the floor)
  k.hall(...P.stair, 14, 9, 2);
  k.hall(...P.library, 40, 28, 3);
  k.hall(...P.catalog, 40, 27, 4);
  k.hall(...P.warrens, 32, 30, 5);
  k.hall(...P.chasm, 46, 34, 6);
  k.hall(...P.galleries, 46, 34, 7);
  k.hall(...P.lamplighter, 26, 18, 8);
  k.hall(...P.aisles, 40, 30, 9);
  k.hall(...P.echo, 24, 18, 10);
  k.hall(...P.heart, 42, 32, 11);
  k.hall(...P.stacks, 30, 24, 12);
  k.hall(...P.longaisle, 18, 30, 13);
  // ---- passages between them (root tunnels, about 9 tiles wide)
  const ways = [
    [P.stair, [288, 30], P.library],
    [P.library, [236, 74], [196, 90], P.catalog],
    [P.catalog, [112, 150], P.warrens],
    [P.catalog, [176, 160], P.chasm],
    [P.library, [344, 84], [388, 112], P.galleries],
    [P.galleries, [468, 104], P.lamplighter],
    [P.galleries, [462, 212], P.aisles],
    [P.aisles, [396, 274], [330, 266], P.echo],
    [P.chasm, [246, 242], P.echo],
    [P.library, [288, 110], P.longaisle, [288, 220], P.echo],
    [P.echo, [288, 296], P.heart],
    [P.warrens, [96, 262], P.stacks],
    [P.stacks, [176, 344], [234, 344], P.heart],
  ];
  for (const w of ways) k.passage(w, 9);
  // the stair up to the world: a narrow slope to the top edge
  k.passage([[288, 0], [288, 8]], 6);
  for (let x = STAIR.x; x < STAIR.x + STAIR.w; x++) for (let y = 0; y < 3; y++) k.open(x, y);

  // ---- ground: dirt drifts and tall moss on the floor
  k.paint((x, y, ch, fl) => {
    if (!fl) return null;
    const n = vnoise(x, y, 16, 3);
    if (n > 0.66) return ':';
    if (vnoise(x, y, 11, 9) > 0.7) return ',';
    return null;
  });
  // the town plaza (stone floor)
  const T = { x0: 256, y0: 44, x1: 320, y1: 86 };
  k.paint((x, y, ch, fl) => (fl && x >= T.x0 && x <= T.x1 && y >= T.y0 && y <= T.y1 ? 'o' : null));

  // ---- roads (stone walkways) along the passages
  const road = (pts) => k.road(pts, { ch: '=', verge: 1 });
  road([[288, 0], [288, 30], [288, 44]]);
  road([[256, 66], [236, 74], [196, 90], [150, 112], [112, 150], [86, 196], [96, 262], [108, 324]]);
  road([[150, 112], [176, 160], [204, 210], [246, 242], [288, 262]]);
  road([[320, 66], [344, 84], [388, 112], [432, 150], [468, 104], [482, 62]]);
  road([[432, 150], [462, 212], [474, 268], [396, 274], [330, 266], [288, 262]]);
  road([[288, 86], [288, 110], [288, 160], [288, 220], [288, 262], [288, 296], [288, 320]]);
  road([[108, 324], [176, 344], [234, 344], [262, 338]]);
  // two short walkways across the chasm (with the main road, the three ink bridges of "Bridges of Ink")
  road([[190, 182], [216, 190], [242, 198]]);
  road([[170, 226], [194, 234], [222, 242]]);

  // ---- the Inkrun: a river of glowing ink down through the chasm; the walkways cross it on ink bridges
  const inkPts = [[262, 128], [238, 160], [214, 196], [196, 230], [172, 268], [140, 300], [100, 352], [70, 383]];
  const bridges = [];
  {
    const pts = curve(inkPts, 0.005);
    const r = 2.2;
    const tan = (i) => { const a = pts[Math.max(0, i - 3)], b = pts[Math.min(pts.length - 1, i + 3)]; return [b[0] - a[0], b[1] - a[1]]; };
    pts.forEach(([fx, fy], i) => {
      const [tx, ty] = tan(i);
      for (let y = Math.floor(fy - r - 1); y <= Math.ceil(fy + r + 1); y++) for (let x = Math.floor(fx - r - 1); x <= Math.ceil(fx + r + 1); x++) {
        if (!k.inb(x, y)) continue;
        const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy);
        if (d >= r) { if (d < r + 1.3 && k.kind[y][x] === 1) k.ground[y][x] = ':'; continue; }
        if (k.kind[y][x] === 2) { bridges.push([x, y, Math.abs(tx) > Math.abs(ty) ? 'v' : 'h']); continue; }   // a walkway crossing: an ink bridge
        if (k.kind[y][x] === 4) continue;
        k.ground[y][x] = '~'; k.coll[y][x] = '~'; k.kind[y][x] = 4;
      }
    });
  }
  const seenB = new Set();
  for (const [x, y, o] of bridges) { if (seenB.has(`${x},${y}`)) continue; seenB.add(`${x},${y}`); k.overlay(o === 'h' ? 'ink_bridge_h_faint' : 'ink_bridge_v_faint', x, y); }
  // ink pools in the heart and the chasm (blocking, glowing)
  const pool = (cx, cy, rx, ry) => { for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (k.isFloor(x, y) && k.kind[y][x] !== 2 && Math.hypot((x - cx) / rx, (y - cy) / ry) < 1) { k.ground[y][x] = '~'; k.coll[y][x] = '~'; k.kind[y][x] = 4; } };
  pool(252, 350, 5, 3); pool(326, 352, 6, 3); pool(178, 216, 4, 3);

  // ---- the Willow Library (the town)
  const put = (t, x, y, extra = {}) => { if (!k.put(t, x, y, extra)) throw new Error(`rootbound: ${t} at ${x},${y} does not fit`); };
  put('library', 283, 54);                  // north side of the plaza, door at (288, 54)
  put('inn', 302, 66);                      // the Lamplit Shelf (inn), door at (306, 66)
  put('item_shop', 264, 66);                // the binder's shop, door at (267, 66)
  put('house_small', 266, 80); put('house_medium', 302, 82); put('house_small', 274, 54);
  put('well', 287, 72);
  put('market_stall_cloth', 279, 76); put('market_stall_fruit', 293, 76);
  for (const [x, y] of [[281, 60], [296, 60], [281, 70], [296, 70], [270, 74], [308, 74], [288, 84]]) k.put('lamp_post', x, y, { state: 1 });
  // a signpost at each way out of town
  k.put('signpost_arrow', 258, 70); k.put('signpost_arrow', 318, 70); k.put('signpost_arrow', 291, 88); k.put('signpost_arrow', 291, 40);

  // ---- shelves (the library's own: tall bookcases in the 3D view, x1_blank_slab on the map) in rows, leaving aisles
  const shelfRow = (x0, y, n, gapEvery = 5) => { for (let i = 0; i < n; i++) if (i % gapEvery !== gapEvery - 1) k.put('x1_blank_slab', x0 + i, y); };
  for (const y of [96, 104, 120, 128]) { shelfRow(126, y, 12); shelfRow(158, y, 12); }          // the Catalog Halls
  for (const y of [132, 140, 160, 168]) { shelfRow(404, y, 14, 6); shelfRow(440, y, 14, 6); }   // the Reading Galleries
  for (const x of [452, 460, 468, 484, 492]) for (let y = 252; y < 286; y++) if ((y - 252) % 9 !== 8) k.put('x1_blank_slab', x, y);   // the Shelf Aisles
  // root columns round the heart, and along the long aisle
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; k.put('root_column', Math.round(288 + Math.cos(a) * 30), Math.round(336 + Math.sin(a) * 21)); }
  for (const y of [126, 146, 176, 196]) { k.put('root_column', 280, y); k.put('root_column', 295, y); }
  // the outposts: Hollis's camp in the Deep Stacks, the Lamplighter's Rest
  put('x1_turf_hut', 100, 316); put('x1_hearth', 110, 324); k.put('x1_sack_stack', 106, 320); k.put('crates_barrels', 114, 318);
  put('x1_turf_hut', 476, 56); put('x1_hearth', 484, 64); k.put('x1_sack_stack', 490, 60);
  // the echo stair: a pair of stones at the top of the stair down
  k.put('x1_menhir_a', 282, 274); k.put('x1_menhir_b', 295, 274);
  // ink puddles and fallen pages on the floor
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!k.free(x, y, 1)) continue;
    const r = hash01(x, y, 61);
    if (r < 0.004) k.overlay(hash01(x, y, 62) < 0.5 ? 'ink_puddle_0' : 'ink_puddle_1', x, y);
    else if (r < 0.011) k.overlay(['roots_0', 'roots_1', 'roots_2'][Math.floor(hash01(x, y, 63) * 3)], x, y);
    else if (r < 0.014 && k.ground[y][x] === ',') k.overlay(hash01(x, y, 64) < 0.5 ? 'flowers_blue' : 'flowers_violet', x, y);
  }
  // scattered root columns and boulders on the open floor (not in the town, not on the walkways)
  for (let y = 4; y < H; y += 5) for (let x = 4; x < W; x += 5) {
    if (x >= T.x0 - 4 && x <= T.x1 + 4 && y >= T.y0 - 4 && y <= T.y1 + 4) continue;
    if (!k.free(x, y, 3)) continue;
    const r = hash01(x, y, 71);
    if (r < 0.06) k.put('root_column', x, y);
    else if (r < 0.09) k.put('x1_boulder_a', x, y);
  }

  // ---- the walls: root columns on the line, root canopy behind (canopy 'roots' in the 3D view)
  k.dress({ line: 'root_column', lineAlt: 'x1_boulder_a', deep: 'tree_pine', step: 2, skip: 0.1, lineR: 2 });
  // a root column is two cells wide: the tree line's must not stand on the floor (dress only uses non-floor cells)
  for (const d of k.decor) if (d.line && d.t === 'root_column' && k.isWalk(d.x + 1, d.y)) d.t = 'x1_boulder_a';

  const areas = [
    { id: 'rb_library', name: 'The Willow Library', x: T.x0 - 6, y: T.y0 - 6, w: T.x1 - T.x0 + 13, h: T.y1 - T.y0 + 13, levels: [1, 2], safe: true },
    { id: 'rb_root_stair', name: 'The Root Stair', x: 270, y: 0, w: 36, h: 30, levels: [1, 1] },
    { id: 'rb_catalog', name: 'The Catalog Halls', x: 108, y: 84, w: 86, h: 56, levels: [1, 2] },
    { id: 'rb_warrens', name: 'The Mite Warrens', x: 52, y: 164, w: 70, h: 64, levels: [2, 3] },
    { id: 'rb_chasm', name: 'The Ink Chasm', x: 158, y: 176, w: 94, h: 70, levels: [3, 4] },
    { id: 'rb_galleries', name: 'The Reading Galleries', x: 386, y: 116, w: 94, h: 68, levels: [3, 4] },
    { id: 'rb_lamplighter', name: "The Lamplighter's Rest", x: 456, y: 44, w: 54, h: 38, levels: [3, 4] },
    { id: 'rb_aisles', name: 'The Shelf Aisles', x: 434, y: 238, w: 82, h: 62, levels: [4, 5] },
    { id: 'rb_long_aisle', name: 'The Long Aisle', x: 270, y: 96, w: 36, h: 140, levels: [2, 4] },
    { id: 'rb_echo_stair', name: 'The Echo Stair', x: 264, y: 244, w: 48, h: 40, levels: [5, 5] },
    { id: 'rb_heart', name: "The Willow's Heart", x: 246, y: 304, w: 86, h: 66, levels: [5, 6] },
    { id: 'rb_deep_stacks', name: 'The Deep Stacks', x: 78, y: 300, w: 62, h: 48, levels: [4, 5] },
  ];
  const lanterns = [
    { id: 'rb_library', name: 'The Willow Library', x: 288, y: 64, post: [288, 63] },
    { id: 'rb_deep_stacks', name: 'The Deep Stacks', x: 114, y: 329, post: [117, 327] },
    { id: 'rb_lamplighter', name: "The Lamplighter's Rest", x: 476, y: 66, post: [475, 65] },
    { id: 'rb_echo', name: 'The Echo Stair', x: 288, y: 246, post: [290, 245] },
  ];
  for (const l of lanterns) { k.coll[l.post[1]][l.post[0]] = '#'; }

  // ---- the three ink bridges across the chasm (explore areas for "Bridges of Ink"), north to south
  {
    const cl = [];
    for (const o of k.overlays) {
      if (!/^ink_bridge/.test(o.t) || o.y > 300) continue;
      let c = cl.find((q) => Math.abs(q.x - o.x) < 8 && Math.abs(q.y - o.y) < 8);
      if (!c) { c = { x: o.x, y: o.y, xs: [], ys: [] }; cl.push(c); }
      c.xs.push(o.x); c.ys.push(o.y);
    }
    cl.sort((a, b) => a.y - b.y);
    if (cl.length !== 3) throw new Error(`rootbound: ${cl.length} ink bridges in the chasm, want 3`);
    ['north', 'middle', 'south'].forEach((id, i) => {
      const c = cl[i], x0 = Math.min(...c.xs) - 2, y0 = Math.min(...c.ys) - 2;
      areas.push({ id: `rb_bridge_${id}`, name: `The ${id[0].toUpperCase() + id.slice(1)} Ink Bridge`, x: x0, y: y0, w: Math.max(...c.xs) - x0 + 3, h: Math.max(...c.ys) - y0 + 3, levels: [3, 3] });
    });
  }

  // ---- people (src/data/rootbound.js has who they are; src/data/travel.js places the innkeeper and the kitemaster)
  const npcs = [
    { npc: 'rb_ottilie', x: 288, y: 58, dir: 'down' },     // before the library door: the Head Archivist, the Scribe's first teacher
    { npc: 'rb_tobin', x: 267, y: 68, dir: 'down' },       // the binder's shop
    { npc: 'rb_fen', x: 279, y: 72, dir: 'right' },        // the page, by the stalls
    { npc: 'rb_greta', x: 480, y: 68, dir: 'down' },       // the Lamplighter's Rest
    { npc: 'rb_hollis', x: 112, y: 330, dir: 'down' },     // the Deep Stacks: the Keeper who stayed down
  ];
  // ---- foes: camps along the halls, levels 1 to 6 (bookmites swarm, slimes drip, tomes read, shelves walk)
  const spawns = [];
  const camp = (mob, levels, pts, group, extra = {}) => pts.forEach(([x, y], i) => spawns.push({ mob, level: levels[i % levels.length], x, y, wander: 3, respawn: 60, group, ...extra }));
  // the Catalog Halls (1 to 2): mites in the aisles, slimes by the shelves
  camp('rb_bookmite', [1, 1, 2], [[134, 100], [140, 108], [146, 100], [132, 116], [150, 124], [164, 116], [170, 100], [176, 124], [124, 124], [158, 132]], null);
  camp('ink_slime', [1, 2], [[118, 108], [128, 132], [176, 110], [178, 118], [142, 92], [166, 94]], null);
  // the Long Aisle (2)
  camp('rb_bookmite', [2], [[284, 124], [292, 136], [284, 150], [292, 166], [286, 184], [290, 200]], null);
  camp('ink_slime', [2], [[278, 140], [298, 158], [280, 176], [296, 192]], null);
  // the Mite Warrens (2 to 3): mites in nests of three
  camp('rb_bookmite', [2, 3, 2], [[70, 180], [74, 184], [68, 186]], 'rb_nest_a');
  camp('rb_bookmite', [3, 2, 3], [[96, 176], [100, 172], [102, 178]], 'rb_nest_b');
  camp('rb_bookmite', [2, 3, 3], [[78, 206], [82, 212], [74, 212]], 'rb_nest_c');
  camp('rb_bookmite', [3, 3, 2], [[100, 204], [104, 210], [96, 212]], 'rb_nest_d');
  // the Ink Chasm (3): slimes on the banks
  camp('ink_slime', [3], [[186, 200], [226, 214], [188, 220], [224, 230], [212, 178], [178, 240]], null);
  // the Reading Galleries (3 to 4): animated tomes, alone, then in pairs
  camp('rb_tome', [3, 4], [[410, 136], [424, 128], [452, 136], [470, 128]], null);
  camp('rb_tome', [4, 4], [[414, 156], [418, 152]], 'rb_tomes_a');
  camp('rb_tome', [4, 4], [[446, 164], [450, 158]], 'rb_tomes_b');
  camp('rb_tome', [3, 4], [[460, 176], [432, 178]], null);
  // the Shelf Aisles (4 to 5): shelf golems walk the aisles
  camp('rb_shelf_golem', [4, 5], [[456, 258], [464, 268], [472, 280], [480, 258], [488, 270], [496, 280], [448, 278], [500, 262]], null);
  // the Deep Stacks (4 to 5): tomes and mites that ate the names
  camp('rb_tome', [4, 5], [[96, 312], [124, 312], [92, 336], [130, 340]], null);
  camp('rb_bookmite', [4, 5, 4], [[100, 338], [104, 342], [96, 342]], 'rb_nest_deep');
  camp('rb_shelf_golem', [5], [[136, 322], [86, 324]], null);
  // the Echo Stair (5): the Echo Warden guards the way down; the Willow's Heart (6): the Archivore and its mites
  spawns.push({ mob: 'rb_echo_warden', level: 5, x: 288, y: 280, wander: 1, respawn: 120, group: 'rb_echo' });
  spawns.push({ mob: 'rb_archivore', level: 6, x: 288, y: 338, wander: 1, respawn: 180, group: 'rb_heart' });
  camp('rb_bookmite', [5], [[270, 326], [306, 326], [272, 350], [304, 350]], null);
  // ---- nodes: lamp wicks gone dark in the Reading Galleries ("Lamps Out")
  const nodes = [[404, 146], [420, 140], [440, 146], [462, 144], [430, 170], [408, 168], [456, 170], [474, 150]]
    .map(([x, y], i) => ({ id: `rb_wick_${i + 1}`, item: 'rb_lamp_wick', x, y, respawn: 30, name: 'Dark Lamp Wick', sprite: 'x1_sack_stack' }));
  const zone = k.zone({
    id: 'rootbound', name: 'The Rootbound', music: 'high_moor', under: 'moss',
    lighting: { tint: 'none', dark: 0.5 },
    // the 3D view: underground (no sun, a cool dark fog with a long reach), the wall canopy drawn as roots, the slabs as
    // bookcases (src/render3d/zone3d.js, renderer3d.js)
    cavern: true, canopy: 'roots', style: 'library',
    levels: [1, 6], arrival: [288, 70],
    // the town camera over the Willow Library (renderer3d reads zone.regions like the one world's areas)
    regions: [{ id: 'rb_library', name: 'The Willow Library', kind: 'town', x: T.x0 - 6, y: T.y0 - 6, w: T.x1 - T.x0 + 13, h: T.y1 - T.y0 + 13, levels: [1, 2], music: 'high_moor', lighting: { tint: 'none', dark: 0.5 }, under: 'moss' }],
    areas, lanterns, npcs, spawns, nodes, signs: [], hooks: [], secrets: [],
    joins: [{ x: STAIR.x, y: STAIR.y, w: STAIR.w, h: STAIR.h, to: 'world', tx: WORLD_STAIR.arrive[0], ty: WORLD_STAIR.arrive[1], dir: 'down' }],
  });
  return zone;
}

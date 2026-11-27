// The Millrace (cap 35, stage 1, 2026-11-27; docs/handoff/briefs/BRIEF_cap35_millrace.md sections 1 to 3): the land
// and the hub, levels 30 to 35. A mill hamlet in flood below a broken weir. Its own outdoor zone, 128 x 88 tiles
// (Downs-sized), joined to the world at Ferrick's chain on the Downs' south-east road (a level 30 gate, zone_downs.mjs).
//
//   south         The Chain Road: the arrival from the Downs, Ferrick's chain lying slack across the road, the board,
//                 a short flooded verge, the first lantern in sight.
//   centre east   Ferrick's Mill: the hub. A wooden plaza, the mill (a two-floor loomhouse) on the race, the code-built
//                 water wheel in the race beside it, an inn, provisions, a kitemaster, a bounty board, the lantern. A
//                 door spot in the mill's undercroft is kept for the Weir Works (the cave lane builds the cave).
//   centre west   The Flood Lanes: shallows you wade (a slow), deep pools you cannot cross except on the plank catwalks,
//                 cottages standing in the wet, washed ledgers on the verges.
//   north         The Upper Weir: the broken dam, deep water behind it, the gap the race runs out of.
//
// The wade rule (zone.wade, src/sim/realm_mech.js): shallow water is walkable and slows a hero by 15%; deep water blocks,
// except on the catwalks (plank overlays, walkable) and the two lower fords (walkable shallows across the race).
// Foes are another lane: the camp spots are marked (zone.camps, with a suggested level), no spawns are placed here.
// Built with the big-zone kit (bigzone_kit.mjs). Code-built props (the wheel, the board, the ledgers, the slack chain,
// the undercroft door) are zone.millProps, drawn by src/render3d/mill3d.js. Deterministic. All names are drafts.
import { bigZone } from './bigzone_kit.mjs';
import { hash01, vnoise } from './kit.mjs';

export const W = 128, H = 88;
// the pass south to the world: its cells here, where a hero lands coming in, and where they land on the world going
// back (downs tiles 100, 90 = world 100, 190: just north of Ferrick's chain)
export const GATE = { x: 91, y: 87, w: 3, h: 1, arrive: [92, 84] };
export const WORLD_GATE = { arrive: [100, 190] };
// the Weir Works door spot (the cave lane adds the cave and its door entry in src/data/dungeons.js, door.zone
// 'millrace'): the cells in the mill's undercroft on the race side, and the walkable cell outside it
export const WEIR_WORKS_DOOR = { x: 77, y: 35, w: 1, h: 2, out: [77, 38], dir: 'left' };
// the hub's named spots (tiles)
export const HUB = {
  plaza: { x0: 78, y0: 40, x1: 108, y1: 55 }, lantern: [92, 48], board: [86, 42], kitemaster: [106, 47], land: [106, 48],
  inn: [91, 42], innkeeper: [92, 41], vendor: [102, 41], clerk: [83, 41], hand: [79, 45], child: [98, 50],
};
// camp spots (foes are another lane): 8 to 12 tiles apart, a suggested level each
export const CAMPS = [
  { id: 'mr_camp_flood_nw', x: 14, y: 34, level: 31, area: 'mr_flood' },
  { id: 'mr_camp_flood_n', x: 24, y: 38, level: 31, area: 'mr_flood' },
  { id: 'mr_camp_flood_ne', x: 35, y: 34, level: 32, area: 'mr_flood' },
  { id: 'mr_camp_flood_w', x: 14, y: 49, level: 32, area: 'mr_flood' },
  { id: 'mr_camp_flood_c', x: 25, y: 51, level: 32, area: 'mr_flood' },
  { id: 'mr_camp_flood_e', x: 44, y: 47, level: 32, area: 'mr_flood' },
  { id: 'mr_camp_flood_s', x: 38, y: 62, level: 33, area: 'mr_flood' },
  { id: 'mr_camp_flood_se', x: 48, y: 57, level: 33, area: 'mr_flood' },
  { id: 'mr_camp_ford_n', x: 58, y: 66, level: 32, area: 'mr_fords' },
  { id: 'mr_camp_ford_s', x: 55, y: 77, level: 33, area: 'mr_fords' },
  { id: 'mr_camp_weir_w', x: 42, y: 18, level: 33, area: 'mr_weir' },
  { id: 'mr_camp_weir_c', x: 52, y: 22, level: 34, area: 'mr_weir' },
  { id: 'mr_camp_weir_elite', x: 67, y: 16, level: 34, area: 'mr_weir', elite: true },
  { id: 'mr_camp_weir_e', x: 76, y: 21, level: 34, area: 'mr_weir' },
  { id: 'mr_camp_verge', x: 104, y: 72, level: 30, area: 'mr_chain_road' },
  { id: 'mr_camp_verge_s', x: 106, y: 81, level: 30, area: 'mr_chain_road' },
];

// the race: out of the weir gap, past the mill wheel, south out of the zone
const RACE = [[60.5, 6], [61, 14], [64, 21], [69, 28], [73, 34], [74, 40], [73.5, 48], [71, 56], [67, 64], [63, 72], [60, 80], [58, 89]];
const GAP = { x0: 58, x1: 63 };          // the break in the dam
const DAM_Y = 11;                         // the dam's two rows: 11 and 12

export function build(db) {
  const LEG = { '.': 'grass', ',': 'tallgrass', '=': 'dirt', p: 'plaza', '~': 'water', '-': 'shallow', d: 'x1_peat', r: 'x1_bracken', s: 'sand', w: 'x1_drystone' };
  const k = bigZone(W, H, { legend: LEG, floor: '.', seed: 20261127, db });
  const { ground, coll, kind } = k;
  const deep = (x, y) => { if (!k.inb(x, y) || kind[y][x] === 9) return; ground[y][x] = '~'; coll[y][x] = '~'; kind[y][x] = 4; };
  const shallow = (x, y) => { if (!k.inb(x, y) || kind[y][x] === 9) return; ground[y][x] = '-'; coll[y][x] = '.'; kind[y][x] = 4; };
  const dry = (x, y, ch = '.') => { if (!k.inb(x, y)) return; ground[y][x] = ch; coll[y][x] = '.'; kind[y][x] = 1; };
  const blob = (cx, cy, rx, ry, salt) => (x, y) => Math.hypot((x - cx) / rx, (y - cy) / ry) + 0.18 * (vnoise(x, y, 5, salt) - 0.5) < 1;

  // ---- the floor: the whole interior, a ragged tree margin all round (the north is the weir pond, open to the edge)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = 3 + 3 * vnoise(x, y, 7, 11);
    if (x >= m && x <= W - 1 - m && y >= Math.min(m, 2) && y <= H - 1 - m * 0.8) k.open(x, y);
  }
  // ground drifts: tall grass and bracken on the dry land, peat near the wet
  k.paint((x, y, ch, fl) => {
    if (!fl) return null;
    if (vnoise(x, y, 11, 21) > 0.68) return ',';
    if (vnoise(x, y, 9, 23) > 0.74) return 'r';
    return null;
  });

  // ---- the Upper Weir: the pond behind the dam (deep, a shallow fringe you can wade), the dam, the gap
  for (let y = 0; y < DAM_Y + 1; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - 62) / 38, (y + 2) / (DAM_Y + 3)) + 0.12 * (vnoise(x, y, 6, 31) - 0.5);
    if (d < 0.86) deep(x, y);
    else if (d < 1 && kind[y][x]) shallow(x, y);
  }
  k.river(RACE, { width: 7, deep: '~', shallow: '-', bank: 'd' });
  for (let x = 24; x <= 100; x++) for (let y = DAM_Y; y <= DAM_Y + 1; y++) {
    if (x >= GAP.x0 && x <= GAP.x1) { deep(x, y); continue; }
    k.wall(x, y, x, y, 'w');
  }
  // the broken stones below the dam on both sides of the gap (blocking rubble)
  const rubble = [[55, 13], [56, 14], [65, 13], [66, 14], [50, 13], [71, 13], [47, 14], [74, 14]];

  // ---- the Flood Lanes: a wide basin of shallows, deep pools in it, two dry hummocks
  const basin = blob(32, 47, 28, 19, 41);
  const pools = [blob(20, 44, 5.5, 3.6, 43), blob(42, 52, 6, 4, 44), blob(28, 58, 5, 3, 45), blob(48, 38, 4.5, 3.2, 46), blob(12, 55, 3.6, 3, 47), blob(36, 40, 3.2, 2.4, 48)];
  const hummocks = [blob(16, 37, 3.2, 2.4, 51), blob(50, 61, 3.4, 2.4, 52), blob(25, 51, 2.6, 2.0, 53)];
  for (let y = 24; y < 72; y++) for (let x = 2; x < 62; x++) {
    if (!kind[y][x] || kind[y][x] === 9 || kind[y][x] === 4 && ground[y][x] === '~' && !basin(x, y)) continue;
    if (!basin(x, y)) { if (kind[y][x] !== 4 && (basin(x - 2, y) || basin(x + 2, y) || basin(x, y - 2) || basin(x, y + 2))) dry(x, y, 'd'); continue; }   // the wet verge
    if (hummocks.some((f) => f(x, y))) dry(x, y, hash01(x, y, 3) < 0.5 ? '.' : ',');
    else if (pools.some((f) => f(x, y))) deep(x, y);
    else shallow(x, y);
  }
  // the short flooded verge by the Chain Road
  for (let y = 66; y < 82; y++) for (let x = 97; x < 110; x++) if (kind[y][x] && kind[y][x] !== 9 && blob(103, 74, 5, 6, 55)(x, y)) shallow(x, y);
  // every shallow cell is walkable (the wade rule); deep stays blocking
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ground[y][x] === '-' && kind[y][x] !== 9) coll[y][x] = '.';

  // ---- Ferrick's Mill: the town ground (open, dry, off the race), the plaza in wood planks
  for (let y = 28; y <= 62; y++) for (let x = 76; x <= 113; x++) if (kind[y][x] !== 4 && kind[y][x] !== 9) dry(x, y, ground[y][x] === 'p' ? 'p' : '.');
  const PZ = HUB.plaza;
  for (let y = PZ.y0; y <= PZ.y1; y++) for (let x = PZ.x0; x <= PZ.x1; x++) if (kind[y][x] !== 4) { dry(x, y, 'p'); kind[y][x] = 2; }
  // the bank between the race and the mill's west wall: the undercroft door stands on it
  for (let y = 32; y <= 40; y++) { dry(77, y, 'd'); if (kind[y][76] !== 4) deep(76, y); }

  // ---- roads (dirt): the Chain Road north into the plaza, the weir road, the ford tracks
  const road = (pts, extra = {}) => k.road(pts, { ch: '=', verge: 1, ...extra });
  road([[92, 88], [92, 80], [91.5, 70], [92, 60], [92, 56]]);
  road([[86, 40], [86, 32], [84, 26], [78, 20], [70, 17]]);
  road([[91, 66], [82, 65], [72, 64]]);
  road([[91, 77], [80, 77], [68, 76]]);
  road([[40, 25], [46, 19], [54, 16]]);

  // ---- crossings: plank catwalks (walkable deck over water) and the two lower fords (shallows across the race)
  const deck = (x0, y0, x1, y1) => {
    const horiz = x1 - x0 >= y1 - y0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!k.inb(x, y) || kind[y][x] === 9) continue;
      if (kind[y][x] !== 4 && kind[y][x] !== 2) { kind[y][x] = 2; coll[y][x] = '.'; continue; }   // dry ground the walk crosses: leave the ground, keep props off it
      ground[y][x] = 'p'; coll[y][x] = '.'; kind[y][x] = 2;
      k.overlay(horiz ? (y === y0 ? 'bridge_wood_h_n_m' : 'bridge_wood_h_s_m') : (x === x0 ? 'bridge_wood_h_n_m' : 'bridge_wood_h_s_m'), x, y);
    }
  };
  deck(8, 44, 77, 45);        // the long walk: the west cottages, across the pools and the race, onto the plaza
  deck(30, 28, 31, 64);       // north to south through the lanes
  deck(31, 55, 54, 56);       // the south walk, east to the ford track
  deck(50, 30, 51, 43);       // up past the north-east pool
  deck(54, 17, 68, 18);       // over the race below the dam
  deck(14, 29, 30, 30);       // the north verge to the north-west cottages
  const ford = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!k.inb(x, y) || kind[y][x] !== 4) continue;
      ground[y][x] = '-'; coll[y][x] = '.';
      if (hash01(x, y, 7) < 0.4) k.overlay(['pebbles_0', 'pebbles_1', 'pebbles_2'][Math.floor(hash01(x, y, 8) * 3)], x, y);
    }
  };
  ford(60, 63, 74, 65);       // the north ford
  ford(54, 75, 70, 77);       // the south ford
  // the paths on to the fords from the lanes
  road([[52, 57], [56, 62], [60, 64]], { verge: 0 });
  road([[48, 66], [52, 72], [55, 76]], { verge: 0 });

  // ---- the hub's buildings (doors face the plaza), people's spots stay clear
  const put = (t, x, y, extra = {}, force = false) => { if (!k.put(t, x, y, extra, force)) throw new Error(`millrace: ${t} at ${x},${y} does not fit`); };
  put('x1_loomhouse', 78, 39);     // Ferrick's Mill: x 78..84, door (81, 39)
  put('inn', 88, 39);              // the inn: x 88..95, door (92, 39)
  put('item_shop', 99, 39);        // provisions: x 99..103, door (102, 39)
  put('house_medium', 105, 39);
  put('x1_cottage_a', 80, 61); put('house_small', 98, 61); put('x1_cottage_b', 104, 61);
  // plaza dressing
  for (const [x, y] of [[80, 42], [89, 46], [96, 46], [86, 53], [100, 53], [108, 43], [96, 57], [88, 57]]) put('lamp_post', x, y, { state: 1 });
  put('x1_trough', 95, 52); put('x1_haystack_a', 99, 51); put('x1_haybale', 102, 52); put('x1_sack_stack', 85, 46); put('x1_sack_stack', 86, 47);
  put('barrel', 96, 42); put('barrel', 97, 42); put('crate', 104, 44); put('crates_barrels', 81, 52); put('bench', 88, 50);
  put('signpost_arrow', 97, 58);
  // the bounty board (code-built, a solid cell) and the mill's race-side props
  k.wall(HUB.board[0], HUB.board[1], HUB.board[0], HUB.board[1]);
  // the Chain Road: the slack chain's posts either side of the road, the board, the lantern
  k.wall(89, 82, 89, 82); k.wall(96, 82, 96, 82);
  put('signboard', 97, 80);
  // the flood lanes: cottages standing in the wet, a trough and barrels on the hummocks
  for (const [t, x, y] of [['x1_cottage_a', 10, 42], ['x1_cottage_b', 20, 35], ['house_small', 22, 64], ['x1_cottage_a', 44, 33], ['house_small', 6, 36], ['x1_cottage_b', 16, 62]]) put(t, x, y, {}, true);
  put('x1_trough', 15, 37); put('barrel', 18, 37); put('barrel', 49, 60); put('crate', 51, 61);
  // the weir: rubble and cairns
  for (const [x, y] of rubble) put('x1_boulder_a', x, y, {}, true);
  for (const [x, y] of [[34, 20], [88, 18], [46, 24]]) put('x1_cairn_moor', x, y);

  // ---- lanterns (the post stands just north of the spot)
  const lanterns = [
    { id: 'mr_mill', name: "Ferrick's Mill", x: HUB.lantern[0], y: HUB.lantern[1], post: [HUB.lantern[0], HUB.lantern[1] - 1] },
    { id: 'mr_chain_road', name: 'The Chain Road', x: 95, y: 77, post: [95, 76] },
    { id: 'mr_flood', name: 'The Flood Lanes', x: 32, y: 46, post: [32, 43] },
    { id: 'mr_weir', name: 'The Upper Weir', x: 82, y: 20, post: [82, 19] },
  ];
  for (const l of lanterns) { put('lamp_post', l.post[0], l.post[1], { state: 1 }, true); coll[l.post[1]][l.post[0]] = '#'; }

  // ---- washed ledgers on the flood verges and the hummocks: the nearest free walkable cell to each spot, kept clear
  const ledgers = [];
  for (const [lx, ly] of [[17, 39], [27, 41], [40, 46], [48, 62], [24, 53], [12, 47], [33, 63], [53, 47], [45, 29]]) {
    let at = null;
    for (let r = 0; r <= 3 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r && !at; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && k.free(lx + dx, ly + dy, 0)) at = [lx + dx, ly + dy];
    }
    if (!at) throw new Error(`millrace: no free cell for a ledger near ${lx},${ly}`);
    k.reserve(at[0], at[1], at[0], at[1]); ledgers.push(at);
  }

  // ---- the walls: willows along the wet, pines on the dry; then the deep canopy
  const avoid = (x, y) => (x >= 74 && x <= 114 && y >= 28 && y <= 63) || (x >= 84 && x <= 100 && y >= 64);
  for (let y = 3; y < H - 3; y += 3) for (let x = 3; x < W - 3; x += 3) {
    const X = x + Math.floor(hash01(x, y, 61) * 3), Y = y + Math.floor(hash01(x, y, 62) * 3);
    if (avoid(X, Y) || !k.free(X, Y, 2) || kind[Y][X] === 4) continue;
    const wetNear = [[-2, 0], [2, 0], [0, -2], [0, 2]].some(([dx, dy]) => k.inb(X + dx, Y + dy) && kind[Y + dy][X + dx] === 4);
    const r = hash01(X, Y, 63);
    if (wetNear) { if (r < 0.22) k.put('tree_willow', X, Y); else if (r < 0.3) k.put('bush', X, Y); }
    else if (r < 0.1) k.put('tree_pine', X, Y); else if (r < 0.14) k.put('x1_boulder_a', X, Y); else if (r < 0.18) k.put('bush', X, Y);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!k.free(x, y, 1) || kind[y][x] === 4 || avoid(x, y)) continue;
    const r = hash01(x, y, 64);
    if (r < 0.012) k.overlay(['tuft_0', 'tuft_1', 'pebbles_0'][Math.floor(hash01(x, y, 65) * 3)], x, y);
    else if (r < 0.018) k.overlay(['flowers_white', 'flowers_blue'][Math.floor(hash01(x, y, 66) * 2)], x, y);
  }
  k.dress({ line: 'tree_willow', lineAlt: 'tree_pine', deep: 'tree_pine', step: 2, deepStep: 3, skip: 0.16, lineR: 2 });

  // ---- code-built props (src/render3d/mill3d.js): x, y in tiles; the wheel's axle runs east to west (r: degrees)
  const millProps = [
    { t: 'mr_wheel', x: 73, y: 37, r: 0, scale: 1 },                  // the great wheel in the race, beside the mill
    { t: 'mr_undercroft', x: WEIR_WORKS_DOOR.x + 1, y: WEIR_WORKS_DOOR.y, h: WEIR_WORKS_DOOR.h },   // the undercroft door in the mill's west wall
    { t: 'mr_board', x: HUB.board[0], y: HUB.board[1] },              // the bounty board by the mill door
    { t: 'mr_chain_down', x: 89, y: 82, w: 7 },                        // Ferrick's chain, lying slack across the road
    // washed ledgers on the flood verges and the hummocks
    ...ledgers.map(([x, y]) => ({ t: 'mr_ledger', x, y })),
  ];

  const area = (id, name, x, y, w, h, levels, extra = {}) => ({ id, name, x, y, w, h, levels, ...extra });
  const areas = [
    area('mr_mill', "Ferrick's Mill", 74, 28, 40, 34, [30, 35], { safe: true }),
    area('mr_chain_road', 'The Chain Road', 76, 62, 40, 26, [30, 30]),
    area('mr_fords', 'The Lower Fords', 48, 63, 28, 25, [32, 33]),
    area('mr_flood', 'The Flood Lanes', 2, 24, 64, 39, [31, 33]),
    area('mr_weir', 'The Upper Weir', 22, 0, 84, 28, [33, 34]),
  ];
  const npcs = [
    { npc: 'mr_clerk', x: HUB.clerk[0], y: HUB.clerk[1], dir: 'down' },
    { npc: 'mr_hand', x: HUB.hand[0], y: HUB.hand[1], dir: 'left' },
    { npc: 'mr_child', x: HUB.child[0], y: HUB.child[1], dir: 'down' },
    { npc: 'mr_vendor', x: HUB.vendor[0], y: HUB.vendor[1], dir: 'down' },
  ];
  const signs = [
    { id: 'mr_chain_board', x: 97, y: 80, text: "THE CHAIN ROAD. FERRICK'S MILL: NORTH. MIND THE WATER: THE SHALLOWS WILL HOLD YOU, THE DEEP WILL NOT." },
    { id: 'mr_mill_sign', x: 97, y: 58, text: "FERRICK'S MILL. WEST: THE FLOOD LANES, BY THE CATWALKS. NORTH: THE UPPER WEIR. SOUTH: THE CHAIN ROAD." },
  ];
  return k.zone({
    id: 'millrace', name: 'The Millrace', music: 'the_downs', under: 'grass', style: 'mill', mounts: true,
    palette: { grass: '#4a5e40', tallgrass: '#3e5440', dirt: '#6a5a44', plaza: '#7a6a50', sand: '#8a7a60', x1_peat: '#3a3a2a', x1_bracken: '#4a4a32' },
    lighting: { tint: 'none', dark: 0 }, grade: { tint: 'rgba(80,90,70,0.10)', desat: 0.12 },
    levels: [30, 35], arrival: [GATE.arrive[0], GATE.arrive[1]],
    wade: { terrains: ['shallow'], slow: 0.15 },
    regions: [{ id: 'mr_mill', name: "Ferrick's Mill", kind: 'town', x: 74, y: 28, w: 40, h: 34, levels: [30, 35], music: 'the_downs', lighting: { tint: 'none', dark: 0 }, under: 'grass' }],
    areas, lanterns, npcs, spawns: [], nodes: [], signs, hooks: [], secrets: [],
    camps: CAMPS.map((c) => ({ ...c })),
    spots: { weirWorksDoor: { ...WEIR_WORKS_DOOR, out: [...WEIR_WORKS_DOOR.out] }, bountyBoard: [...HUB.board], plaza: { ...HUB.plaza }, fords: [[60, 63, 74, 65], [54, 75, 70, 77]] },
    millProps,
    joins: [{ x: GATE.x, y: GATE.y, w: GATE.w, h: GATE.h, to: 'world', tx: WORLD_GATE.arrive[0], ty: WORLD_GATE.arrive[1], dir: 'up' }],
  });
}

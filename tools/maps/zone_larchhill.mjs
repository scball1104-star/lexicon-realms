// Larchhill (band lane, 2026-11-22; D:/LQOnline/world3/BRIEF.md sections 2, 4, 5; docs/design/BUILDS_2.md 5.5): the
// first 20 to 30 band zone, levels 20 to 25. A larch-forest mining valley south of Shepherd's Downs, where the
// list-writer's grey couriers come and go. Its own outdoor zone, 1088 x 704 tiles (about 4 minutes across on foot),
// joined to the world at the Larchhill gate (the Downs' old shut gate, south-west, now open) and to Drovers' Reach at
// Drovers' Gap on its west edge. The Larch Mine (a cave, 21 to 23, zone_larch_mine.mjs) opens off Shaftmouth Camp.
//
// Built with the big-zone kit (bigzone_kit.mjs) and the band stamps (band_kit.mjs): wide glades (the pockets) joined by
// forest rides, the dirt roads along them, the Larchwater down the valley with fords where the roads cross, larch
// woods on every side. Quests, people and camps: src/data/larchhill.js (the content), placed here. Deterministic.
import { bigZone } from './bigzone_kit.mjs';
import { hash01, vnoise } from './kit.mjs';
import { town, riverFords, scatter, campDress, around } from './band_kit.mjs';

export const W = 1088, H = 704;
// the gate up to the world (the Downs' Larchhill gate): its cells here, and where a hero lands coming down
export const GATE = { x: 543, y: 0, w: 4, h: 1, arrive: [545, 5] };
// the world side: the Downs gate (downs tiles 19..21, 95 = world 19..21, 195) and where a hero coming up lands
export const WORLD_GATE = { arrive: [20, 192] };
// Drovers' Gap: the west edge pass to Drovers' Reach (zone_drovers_reach.mjs), and where a hero lands coming back
export const GAP = { x: 0, y: 570, w: 1, h: 4, arrive: [4, 571] };
// the Larch Mine's door (src/data/dungeons.js door, zone 'larchhill'): the cells and the walkable cell outside it
export const MINE_DOOR = { x: 1004, y: 298, w: 1, h: 3, out: [1000, 299] };

// glade centres and radii (tiles): the pockets the rides join
export const P = {
  gate: [544, 40, 30, 24], apiary: [400, 92, 70, 48], cross: [570, 178, 80, 52], sawpit: [800, 112, 72, 48],
  kestrel: [210, 140, 60, 44], meads: [720, 262, 64, 40], cudgel: [220, 292, 66, 48], greypost: [432, 346, 80, 54],
  shaftmouth: [900, 300, 62, 42], spoil: [760, 412, 74, 50], oldlarch: [600, 562, 96, 62], pitch: [900, 592, 70, 48],
  gap: [150, 562, 70, 50],
};
const C = (id) => [P[id][0], P[id][1]];

export function build(db) {
  const LEG = { '.': 'grass', ',': 'x1_bracken', ':': 'dirt', '=': 'dirt', h: 'x1_heath', p: 'x1_peat', o: 'plaza', s: 'sand', '~': 'water', '-': 'shallow', t: 'tallgrass' };
  const k = bigZone(W, H, { legend: LEG, floor: '.', seed: 20261123, db });

  // ---- glades (the floor)
  let sd = 2;
  for (const [cx, cy, rx, ry] of Object.values(P)) k.hall(cx, cy, rx * 1.15, ry * 1.15, sd++);
  // ---- forest rides between them (about 18 tiles wide)
  const rides = [
    [C('gate'), [548, 100], C('cross')],
    [C('cross'), [480, 128], C('apiary')],
    [C('apiary'), [310, 110], C('kestrel')],
    [C('cross'), [680, 136], C('sawpit')],
    [C('cross'), [650, 226], C('meads'), [820, 282], C('shaftmouth')],
    [C('sawpit'), [860, 200], C('shaftmouth')],
    [C('kestrel'), [214, 216], C('cudgel')],
    [C('cudgel'), [330, 318], C('greypost')],
    [C('cross'), [500, 262], C('greypost')],
    [C('shaftmouth'), [830, 360], C('spoil')],
    [C('spoil'), [600, 382], C('greypost')],
    [C('spoil'), [690, 486], C('oldlarch')],
    [C('greypost'), [500, 452], C('oldlarch')],
    [C('oldlarch'), [760, 590], C('pitch')],
    [C('oldlarch'), [400, 590], [270, 580], C('gap')],
  ];
  for (const r of rides) k.passage(r, 24);
  // the gate: a narrow cut up to the top edge
  k.passage([[545, 0], [545, 22]], 8);
  for (let x = GATE.x; x < GATE.x + GATE.w; x++) for (let y = 0; y < 3; y++) k.open(x, y);
  // Drovers' Gap: a narrow cut to the west edge
  k.passage([[0, 572], [90, 566]], 9);
  for (let y = GAP.y; y < GAP.y + GAP.h; y++) for (let x = 0; x < 3; x++) k.open(x, y);
  // the mine spur off Shaftmouth, east, ending at the door in the rock
  for (let y = 294; y <= 304; y++) for (let x = 950; x <= MINE_DOOR.x; x++) k.open(x, y);
  k.wall(MINE_DOOR.x + 1, 286, MINE_DOOR.x + 10, 312);
  for (let y = 286; y <= 312; y++) if (y < 294 || y > 304) for (let x = 990; x <= MINE_DOOR.x; x++) k.wall(x, y, x, y);

  // ---- ground: bracken and dirt drifts, heath on the high glades, peat at the spoil banks
  k.paint((x, y, ch, fl) => {
    if (!fl) return null;
    if (Math.hypot((x - P.spoil[0]) / 60, (y - P.spoil[1]) / 40) < 1 && vnoise(x, y, 9, 4) > 0.35) return 'p';
    if (y < 150 && x < 330 && vnoise(x, y, 18, 5) > 0.5) return 'h';
    const n = vnoise(x, y, 16, 3);
    if (n > 0.68) return ':';
    if (vnoise(x, y, 12, 9) > 0.62) return ',';
    if (vnoise(x, y, 10, 11) > 0.74) return 't';
    return null;
  });

  // ---- roads (dirt tracks) along the rides
  const road = (pts) => k.road(pts, { ch: '=', verge: 1 });
  road([[545, 0], [545, 22], [548, 100], [572, 158]]);                         // the gate road down to the Cross
  road([[536, 180], [480, 128], [400, 92], [310, 110], [210, 140], [214, 216], [220, 292], [330, 318], [432, 346]]);   // the west loop
  road([[606, 178], [680, 136], [800, 112], [860, 200], [900, 300]]);           // the sawpit road to Shaftmouth
  road([[572, 200], [650, 226], [720, 262], [820, 282], [900, 300], [950, 299]]);   // the meads road and the mine spur
  road([[572, 200], [500, 262], [432, 346], [500, 452], [600, 562]]);           // the courier road south
  road([[900, 300], [830, 360], [760, 412], [690, 486], [600, 562]]);           // the spoil road
  road([[600, 562], [760, 590], [900, 592]]);                                    // the Pitch Hollow track
  road([[600, 562], [400, 590], [270, 580], [150, 562], [90, 566], [0, 572]]);  // the west road to Drovers' Gap
  road([[950, 299], [1003, 299]]);

  // ---- the Larchwater: down the valley from the north edge, fords where the roads cross it
  riverFords(k, [[690, 0], [702, 90], [684, 196], [712, 300], [664, 424], [704, 520], [760, 626], [780, 703]], { width: 7 });

  // ---- Larch Cross (the hub)
  const T = town(k, C('cross')[0] + 2, C('cross')[1], { label: 'larchhill' });

  // ---- pockets: the apiary skeps, the sawpit logs, the camps, the outposts
  const avoid = [T.box, around(...C('gate'), 8)];
  for (const [x, y] of [[372, 80], [380, 72], [388, 84], [412, 70], [420, 82], [428, 96], [376, 100], [404, 104]]) k.put('x1_haystack_a', x, y);   // the skeps
  k.put('x1_cottage_a', 392, 112); avoid.push(around(400, 90, 34));
  for (const [x, y] of [[778, 96], [790, 104], [812, 100], [824, 118], [796, 128]]) k.put('x1_fallen_oak', x, y);   // felled larch
  k.put('crates_barrels', 806, 92); k.put('x1_sack_stack', 770, 120); avoid.push(around(800, 112, 30));
  campDress(k, 220, 292); avoid.push(around(220, 292, 12));
  campDress(k, 432, 346); k.put('x1_turf_hut', 420, 338); k.put('x1_turf_hut', 446, 340); k.put('signpost_arrow', 440, 356); avoid.push(around(432, 346, 22));
  campDress(k, 900, 300, 'outpost'); k.put('anvil', 912, 296); k.put('crates_barrels', 930, 296); avoid.push(around(905, 300, 18));
  campDress(k, 150, 562, 'outpost'); avoid.push(around(150, 562, 16));
  for (const [x, y] of [[740, 400], [752, 418], [776, 404], [786, 424], [726, 424]]) k.put('x1_cairn_moor', x, y);   // spoil heaps
  campDress(k, 600, 560); avoid.push(around(600, 560, 14));
  campDress(k, 900, 592); avoid.push(around(900, 592, 12));
  // Kestrel Rock: the lookout (a ring of boulders on the heath)
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; k.put('x1_boulder_a', Math.round(206 + Math.cos(a) * 9), Math.round(136 + Math.sin(a) * 6)); }
  k.put('x1_menhir_a', 206, 136); avoid.push(around(206, 136, 12));
  // the Larchhill gate and the mine mouth
  k.put('x1_chain_gate', 530, 18);     // the old shut gate, lifted off and leant by the road
  k.put('lamp_post', 540, 10, { state: 1 }); k.put('lamp_post', 551, 10, { state: 1 }); k.put('signpost_arrow', 552, 20);
  k.put('lamp_post', 998, 294, { state: 1 }); k.put('lamp_post', 998, 304, { state: 1 }); k.put('crates_barrels', 980, 296);

  // ---- open woodland: larches, a few stones and bushes on the glades (never on the roads, never in town)
  scatter(k, { every: 5, seed: 81, avoid, pick: (r) => (r < 0.16 ? 'tree_pine' : r < 0.19 ? 'x1_boulder_a' : r < 0.22 ? 'bush' : null) });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!k.free(x, y, 1)) continue;
    const r = hash01(x, y, 61);
    if (r < 0.004) k.overlay(['leaves', 'tuft_0', 'tuft_1'][Math.floor(hash01(x, y, 62) * 3)], x, y);
    else if (r < 0.007) k.overlay(['flowers_yellow', 'flowers_white', 'flowers_violet'][Math.floor(hash01(x, y, 63) * 3)], x, y);
  }
  // ---- the walls: larches on the line, deep larch canopy behind
  k.dress({ line: 'tree_pine', lineAlt: 'x1_boulder_a', deep: 'tree_pine', step: 2, deepStep: 4, skip: 0.1, lineR: 2 });

  const area = (id, name, x, y, w, h, levels, extra = {}) => ({ id, name, x, y, w, h, levels, ...extra });
  const box = (pid, name, levels, id, extra) => { const [cx, cy, rx, ry] = P[pid]; return area(id, name, cx - rx, cy - ry, rx * 2, ry * 2, levels, extra); };
  const areas = [
    area('lh_larch_cross', 'Larch Cross', T.box.x0 - 6, T.box.y0 - 6, T.box.x1 - T.box.x0 + 13, T.box.y1 - T.box.y0 + 13, [20, 25], { safe: true }),
    box('gate', 'The Larchhill Gate', [20, 20], 'lh_gate'),
    box('apiary', "Hobb's Hives", [20, 21], 'lh_apiary'),
    box('sawpit', 'Sawpit Clearing', [21, 22], 'lh_sawpit'),
    box('kestrel', 'Kestrel Rock', [21, 22], 'lh_kestrel'),
    box('meads', 'The Larchwater Meads', [21, 22], 'lh_meads'),
    box('cudgel', "The Cudgels' Camp", [22, 23], 'lh_cudgel'),
    box('greypost', 'The Grey Post', [23, 24], 'lh_greypost'),
    box('shaftmouth', 'Shaftmouth Camp', [21, 23], 'lh_shaftmouth'),
    box('spoil', 'The Spoil Banks', [21, 23], 'lh_spoil'),
    box('oldlarch', 'The Old Larches', [24, 25], 'lh_oldlarch'),
    box('pitch', 'Pitch Hollow', [23, 24], 'lh_pitch'),
    box('gap', "Drovers' Gap", [25, 25], 'lh_gap'),
  ];
  const lanterns = [
    { id: 'lh_cross', name: 'Larch Cross', x: T.spots.lantern[0], y: T.spots.lantern[1], post: [T.spots.lantern[0], T.spots.lantern[1] - 1] },
    { id: 'lh_gate', name: 'The Larchhill Gate', x: 548, y: 30, post: [548, 29] },
    { id: 'lh_shaftmouth', name: 'Shaftmouth Camp', x: 892, y: 310, post: [892, 309] },
    { id: 'lh_gap', name: "Drovers' Gap", x: 140, y: 572, post: [140, 571] },
  ];
  for (const l of lanterns) k.coll[l.post[1]][l.post[0]] = '#';

  // ---- people (src/data/larchhill.js says who they are; src/data/band_travel.js places the innkeeper and kitemaster)
  const S = T.spots;
  const npcs = [
    { npc: 'lh_mabry', x: 556, y: 32, dir: 'down' },            // the beekeeper at the gate
    { npc: 'lh_alder', x: S.well[0] - 6, y: S.well[1] - 4, dir: 'down' },   // the Reeve by the well
    { npc: 'lh_joss', x: S.smith[0], y: S.smith[1], dir: 'down' },          // the smith
    { npc: 'lh_ashby', x: S.shop[0], y: S.shop[1], dir: 'down' },           // the shop
    { npc: 'lh_ines', x: S.stallE[0], y: S.stallE[1], dir: 'down' },        // the copyist, by the cloth stall
    { npc: 'lh_brann', x: S.west[0], y: S.west[1], dir: 'right' },          // the constable at the west way
    { npc: 'lh_kit', x: S.stallW[0], y: S.stallW[1], dir: 'down' },         // a child
    { npc: 'lh_tam', x: 786, y: 120, dir: 'down' },             // the sawyer at Sawpit Clearing
    { npc: 'lh_hesketh', x: 896, y: 306, dir: 'down' },         // the foreman at Shaftmouth
    { npc: 'lh_pegg', x: 914, y: 304, dir: 'left' },            // an old miner at Shaftmouth
    { npc: 'lh_orla', x: 616, y: 548, dir: 'down' },            // the huntress at the Old Larches
  ];
  // ---- foes: twelve camps, levels 20 to 25
  const spawns = [];
  const camp = (mob, levels, pts, group = null, extra = {}) => pts.forEach(([x, y], i) => spawns.push({ mob, level: levels[i % levels.length], x, y, wander: 3, respawn: 90, group, ...extra }));
  const trio = (mob, levels, x, y, group) => { const pts = [[x, y], [x + 2, y + 1], [x - 1, y + 2]]; pts.forEach(([a, b], i) => spawns.push({ mob, level: levels[i % levels.length], x: a, y: b, wander: 1, respawn: 120, group, pack: 3 })); };
  const pair = (mob, levels, x, y, group) => { [[x, y], [x + 2, y + 1]].forEach(([a, b], i) => spawns.push({ mob, level: levels[i % levels.length], x: a, y: b, wander: 1, respawn: 120, group, pack: 2 })); };
  // 1, 2. Hobb's Hives (20 to 21): larch hornets round the skeps
  camp('lh_hornet', [20, 20, 21], [[356, 70], [366, 92], [440, 76], [452, 98], [430, 116], [348, 106], [396, 54], [464, 112]], 'lh_hives_a');
  camp('lh_hornet', [20, 21], [[470, 70], [486, 94], [330, 86], [342, 120], [410, 130], [372, 128]], 'lh_hives_b');
  // 3, 4. Sawpit Clearing (21 to 22): larch lynx among the felled logs
  camp('lh_lynx', [21, 22], [[760, 90], [836, 96], [842, 130], [760, 136], [820, 78], [748, 116]], 'lh_saw_a');
  pair('lh_lynx', [22, 22], 812, 140, 'lh_saw_pair_a'); pair('lh_lynx', [21, 22], 772, 74, 'lh_saw_pair_b');
  // 5, 6. the Spoil Banks (21 to 23): tunnel grubs heaved up out of the spoil
  camp('lh_grub', [21, 22, 23], [[712, 392], [724, 440], [796, 396], [808, 436], [760, 446], [744, 378], [790, 380], [700, 420]], 'lh_spoil_a');
  trio('lh_grub', [22, 23], 770, 432, 'lh_spoil_trio');
  // 7. the Cudgels' Camp (22 to 23): the couriers' hired hands
  camp('lh_cudgel', [22, 23], [[196, 276], [244, 278], [208, 312], [236, 310], [182, 296], [258, 298]], 'lh_cudgels');
  pair('lh_cudgel', [23, 23], 222, 270, 'lh_cudgel_pair');
  // 8, 9. the Grey Post (23 to 24): couriers and their hired hands
  camp('lh_courier', [23, 24], [[404, 326], [462, 330], [396, 362], [470, 364], [432, 314], [420, 378]], 'lh_post_a');
  trio('lh_cudgel', [23, 24], 450, 372, 'lh_post_trio'); pair('lh_courier', [24, 24], 410, 350, 'lh_post_pair');
  // 10, 11. the Old Larches (24 to 25): barkhide bears
  camp('lh_bear', [24, 25], [[560, 536], [640, 540], [548, 590], [652, 586], [600, 610], [580, 516], [626, 514]], 'lh_bears_a');
  pair('lh_bear', [25, 25], 676, 562, 'lh_bear_pair');
  // 12. Pitch Hollow (23 to 24): lynx and hornets round the resin pools
  camp('lh_lynx', [23, 24], [[870, 570], [930, 574], [880, 616], [926, 612]], 'lh_pitch_a');
  camp('lh_hornet', [23], [[904, 560], [944, 596], [862, 600]], 'lh_pitch_b');
  // Drovers' Gap (25): couriers watching the road west
  pair('lh_courier', [25, 25], 186, 556, 'lh_gap_pair'); pair('lh_cudgel', [25, 25], 120, 548, 'lh_gap_pair_b');
  // the rides: a few strays
  camp('lh_hornet', [20], [[548, 86], [505, 140]], null);
  camp('lh_lynx', [22], [[660, 220], [640, 226]], null);
  camp('lh_grub', [22], [[840, 350], [700, 470]], null);
  // the courier captain at the Grey Post's heart (the story's end here): a fixed spot
  spawns.push({ mob: 'lh_courier_captain', level: 25, x: 432, y: 340, wander: 0, respawn: 300, group: 'lh_captain' });

  // ---- nodes: marked logs at the sawpit, resin at Pitch Hollow
  const nodes = [
    ...[[768, 104], [782, 92], [818, 108], [830, 124], [794, 120], [806, 136], [756, 124], [840, 112]].map(([x, y], i) => ({ id: `lh_log_${i + 1}`, item: 'lh_marked_log', x, y, respawn: 30, name: 'Tally-Marked Log', sprite: 'x1_sack_stack' })),
    ...[[884, 582], [916, 586], [896, 606], [872, 590], [924, 600], [906, 570]].map(([x, y], i) => ({ id: `lh_resin_${i + 1}`, item: 'lh_larch_resin', x, y, respawn: 30, name: 'Larch Resin Pool', sprite: 'x1_sack_stack' })),
  ];
  const signs = [
    { id: 'lh_gate_sign', x: 552, y: 20, text: 'LARCHHILL. MIND THE BEES. THE CROSS: SOUTH.' },
    { id: 'lh_cross_sign', x: T.box.x0 - 2, y: C('cross')[1] + 3, text: 'WEST: HOBBS HIVES, KESTREL ROCK. SOUTH: THE GREY POST. EAST: SAWPIT, SHAFTMOUTH.' },
    { id: 'lh_post_sign', x: 440, y: 356, text: 'THE GREY POST. COURIERS ONLY. A cold, careful hand has written it.' },
  ];
  const zone = k.zone({
    id: 'larchhill', name: 'Larchhill', music: 'valley', under: 'grass', style: 'larch',
    palette: { grass: '#4a6a3a', tallgrass: '#3e5c32', dirt: '#8a6a42', plaza: '#8a7048', x1_bracken: '#5a6a32', x1_heath: '#6a7a4a' },
    lighting: { tint: 'none', dark: 0 },
    levels: [20, 25], arrival: [GATE.arrive[0], GATE.arrive[1]],
    regions: [{ id: 'lh_larch_cross', name: 'Larch Cross', kind: 'town', x: T.box.x0 - 6, y: T.box.y0 - 6, w: T.box.x1 - T.box.x0 + 13, h: T.box.y1 - T.box.y0 + 13, levels: [20, 25], music: 'valley', lighting: { tint: 'none', dark: 0 }, under: 'grass' }],
    areas, lanterns, npcs, spawns, nodes, signs, hooks: [], secrets: [],
    joins: [
      { x: GATE.x, y: GATE.y, w: GATE.w, h: GATE.h, to: 'world', tx: WORLD_GATE.arrive[0], ty: WORLD_GATE.arrive[1], dir: 'up' },
      { x: GAP.x, y: GAP.y, w: GAP.w, h: GAP.h, to: 'drovers_reach', tx: 1082, ty: 381, dir: 'left' },
    ],
  });
  return zone;
}

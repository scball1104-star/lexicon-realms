// Drovers' Reach (band lane, 2026-11-22; D:/LQOnline/world3/BRIEF.md sections 2, 4, 5; docs/design/BUILDS_2.md 5.5): the
// second 20 to 30 band zone, levels 25 to 30. The old drove roads west of the Downs, walled in drystone, held by the
// Drovers' chain gang. Its own outdoor zone, 1088 x 704 tiles, joined to Larchhill at Drovers' Gap (its east edge).
// The Barrow Deep Halls are not here (the cap30 lane builds them, with their door at the Downs stones).
//
// Built with the big-zone kit (bigzone_kit.mjs) and the band stamps (band_kit.mjs): wide leys (the pockets) joined by
// drove rides, the Great Drove running east to west between drystone walls, the Drove Beck down the middle with fords,
// moorland and pine on every side. Quests, people and camps: src/data/drovers_reach.js, placed here. Deterministic.
import { bigZone } from './bigzone_kit.mjs';
import { hash01, vnoise } from './kit.mjs';
import { town, riverFords, scatter, campDress, around } from './band_kit.mjs';

export const W = 1088, H = 704;
// the east edge pass to Larchhill (zone_larchhill.mjs GAP): its cells here, and where a hero lands coming west
export const GAP = { x: 1087, y: 379, w: 1, h: 4, arrive: [1082, 381] };
export const LARCH_GAP = { arrive: [4, 571] };

export const P = {
  eastgap: [1010, 380, 50, 34], highdrove: [860, 404, 80, 52], herd: [700, 566, 84, 54], scar: [860, 170, 70, 46],
  leys: [700, 290, 56, 38], kennels: [580, 420, 70, 46], waystone: [520, 250, 60, 40], olddrove: [330, 140, 92, 50],
  breakstone: [410, 586, 84, 54], toll: [262, 404, 70, 46], pound: [140, 236, 76, 52], cairns: [124, 566, 60, 44],
};
const C = (id) => [P[id][0], P[id][1]];

export function build(db) {
  const LEG = { '.': 'x1_moor_turf', ',': 'grass', ':': 'x1_heath', '=': 'dirt', b: 'x1_bracken', o: 'plaza', s: 'sand', '~': 'water', '-': 'shallow', w: 'x1_drystone', p: 'x1_peat' };
  const k = bigZone(W, H, { legend: LEG, floor: '.', seed: 20261124, db });

  let sd = 20;
  for (const [cx, cy, rx, ry] of Object.values(P)) k.hall(cx, cy, rx * 1.15, ry * 1.15, sd++);
  const rides = [
    [C('eastgap'), [940, 392], C('highdrove')],
    [C('highdrove'), [780, 500], C('herd')],
    [C('highdrove'), [880, 280], C('scar')],
    [C('highdrove'), [780, 330], C('leys'), [610, 266], C('waystone')],
    [C('highdrove'), [720, 420], C('kennels')],
    [C('kennels'), [500, 510], C('breakstone')],
    [C('herd'), [560, 600], C('breakstone')],
    [C('kennels'), [420, 410], C('toll')],
    [C('waystone'), [430, 190], C('olddrove')],
    [C('olddrove'), [220, 190], C('pound')],
    [C('toll'), [190, 320], C('pound')],
    [C('toll'), [180, 490], C('cairns')],
    [C('breakstone'), [260, 590], C('cairns')],
    [C('waystone'), [560, 330], C('kennels')],
  ];
  for (const r of rides) k.passage(r, 24);
  // the pass east to Larchhill: a narrow cut to the edge
  k.passage([[1087, 381], [1040, 382]], 9);
  for (let y = GAP.y; y < GAP.y + GAP.h; y++) for (let x = W - 3; x < W; x++) k.open(x, y);

  k.paint((x, y, ch, fl) => {
    if (!fl) return null;
    if (vnoise(x, y, 20, 3) > 0.64) return ':';
    if (vnoise(x, y, 14, 7) > 0.66) return ',';
    if (vnoise(x, y, 11, 13) > 0.76) return 'b';
    if (Math.hypot((x - P.breakstone[0]) / 50, (y - P.breakstone[1]) / 30) < 1 && vnoise(x, y, 8, 2) > 0.45) return 'p';
    return null;
  });

  const road = (pts) => k.road(pts, { ch: '=', verge: 1 });
  // the Great Drove: east to west across the Reach, the gang's road
  const great = road([[1087, 381], [1040, 382], [940, 392], [896, 404], [828, 404], [720, 420], [580, 420], [420, 410], [262, 404], [190, 320], [140, 236]]);
  road([[862, 426], [780, 500], [700, 566], [560, 600], [410, 586], [260, 590], [124, 566]]);   // the south drove
  road([[862, 382], [880, 280], [860, 170]]);                                                   // up to Kite Scar
  road([[828, 396], [780, 330], [700, 290], [610, 266], [520, 250], [430, 190], [330, 140], [220, 190], [140, 236]]);   // the Old Drove
  road([[580, 420], [500, 510], [410, 586]]);
  road([[262, 404], [180, 490], [124, 566]]);
  road([[520, 250], [560, 330], [580, 420]]);
  // the Drove Beck, north to south, fords at the crossings
  riverFords(k, [[700, 0], [660, 110], [646, 200], [612, 330], [640, 470], [580, 560], [500, 640], [470, 703]], { width: 6 });

  // drystone walls along the Great Drove outside the leys: a wall line 5 tiles out each side, with gaps
  {
    const dist = new Map();
    const q = [];
    for (const [x, y] of great) { const key = y * W + x; if (!dist.has(key)) { dist.set(key, 0); q.push([x, y]); } }
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i]; const d = dist.get(y * W + x);
      if (d >= 5) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (!k.inb(X, Y) || dist.has(Y * W + X)) continue;
        dist.set(Y * W + X, d + 1); q.push([X, Y]);
      }
    }
    const inLey = (x, y) => Object.values(P).some(([cx, cy, rx, ry]) => Math.hypot((x - cx) / (rx * 1.25), (y - cy) / (ry * 1.25)) < 1);
    for (const [key, d] of dist) {
      if (d !== 5) continue;
      const x = key % W, y = Math.floor(key / W);
      if (k.kind[y][x] !== 1 || inLey(x, y) || x > W - 60) continue;
      if (hash01(Math.floor(x / 6), Math.floor(y / 6), 33) < 0.18) continue;   // a gap every so often
      k.wall(x, y, x, y, 'w');
    }
  }

  // ---- Highdrove (the hub)
  const T = town(k, C('highdrove')[0], C('highdrove')[1], { label: 'drovers_reach' });
  const avoid = [T.box];
  // pens and troughs on the leys, hay for the herd
  for (const [x, y] of [[684, 548], [716, 548], [700, 584], [672, 576], [732, 580]]) k.put('x1_trough', x, y);
  for (const [x, y] of [[690, 292], [712, 300], [700, 276]]) k.put('x1_haystack_b', x, y);
  avoid.push(around(700, 566, 22), around(700, 290, 14));
  // the Chain Kennels and the Breakstone Cut: the gang's camps
  campDress(k, 580, 420); k.put('x1_drovers_chain', 566, 404); k.put('x1_drovers_chain', 590, 436); avoid.push(around(580, 420, 18));
  campDress(k, 410, 586); for (const [x, y] of [[388, 570], [430, 572], [396, 604], [426, 604], [410, 560]]) k.put('x1_boulder_a', x, y);
  k.put('x1_drovers_chain', 400, 594); avoid.push(around(410, 586, 22));
  // Tallyman's Toll: a chain across the drove, a hut
  k.put('x1_turf_hut', 250, 390); campDress(k, 270, 416); k.put('signpost_arrow', 276, 398); avoid.push(around(262, 404, 18));
  // Coyle's Pound: a walled pen with the gang's hold
  for (let x = 116; x <= 166; x++) for (const y of [214, 258]) if (x < 138 || x > 143) k.wall(x, y, x, y, 'w');
  for (let y = 214; y <= 258; y++) for (const x of [116, 166]) if (y < 234 || y > 239) k.wall(x, y, x, y, 'w');
  campDress(k, 140, 236); k.put('x1_turf_hut', 128, 226); k.put('x1_turf_hut', 150, 226); avoid.push(around(140, 236, 28));
  // the Waystone Fold (outpost) and the waystone itself
  campDress(k, 520, 250, 'outpost'); k.put('x1_menhir_b', 530, 240); avoid.push(around(520, 250, 16));
  // the Old Drove: cairns along the ghost road; the Drovers' Cairns in the south-west
  for (const [x, y] of [[290, 130], [318, 150], [350, 128], [376, 154], [300, 160], [404, 136]]) k.put('x1_cairn_moor', x, y);
  for (const [x, y] of [[100, 552], [118, 574], [140, 552], [150, 584], [96, 586], [130, 540]]) k.put('x1_cairn_moor', x, y);
  avoid.push(around(124, 566, 20));
  // Kite Scar: boulders under the crag
  for (const [x, y] of [[834, 150], [850, 140], [884, 146], [896, 164], [872, 190], [828, 176]]) k.put('x1_boulder_a', x, y);
  // the gap
  k.put('lamp_post', 1076, 376, { state: 1 }); k.put('lamp_post', 1076, 387, { state: 1 }); k.put('signpost_arrow', 1064, 376);

  scatter(k, { every: 6, seed: 91, avoid, pick: (r) => (r < 0.08 ? 'tree_pine' : r < 0.12 ? 'x1_gorse_a' : r < 0.15 ? 'x1_gorse_b' : r < 0.18 ? 'x1_boulder_a' : null) });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!k.free(x, y, 1)) continue;
    const r = hash01(x, y, 64);
    if (r < 0.005) k.overlay(['tuft_0', 'tuft_1', 'pebbles_0'][Math.floor(hash01(x, y, 65) * 3)], x, y);
    else if (r < 0.007) k.overlay(['flowers_white', 'flowers_pink'][Math.floor(hash01(x, y, 66) * 2)], x, y);
  }
  k.dress({ line: 'tree_pine', lineAlt: 'x1_boulder_a', deep: 'tree_pine', step: 2, deepStep: 4, skip: 0.14, lineR: 2 });

  const area = (id, name, x, y, w, h, levels, extra = {}) => ({ id, name, x, y, w, h, levels, ...extra });
  const box = (pid, name, levels, id) => { const [cx, cy, rx, ry] = P[pid]; return area(id, name, cx - rx, cy - ry, rx * 2, ry * 2, levels); };
  const areas = [
    area('dr_highdrove', 'Highdrove', T.box.x0 - 6, T.box.y0 - 6, T.box.x1 - T.box.x0 + 13, T.box.y1 - T.box.y0 + 13, [25, 30], { safe: true }),
    box('eastgap', "The Reach Gap", [25, 25], 'dr_eastgap'),
    box('herd', 'The Wild Herd Leys', [25, 26], 'dr_herd'),
    box('leys', 'Highdrove Leys', [25, 26], 'dr_leys'),
    box('scar', 'Kite Scar', [25, 27], 'dr_scar'),
    box('kennels', 'The Chain Kennels', [26, 27], 'dr_kennels'),
    box('waystone', 'Waystone Fold', [26, 28], 'dr_waystone'),
    box('olddrove', 'The Old Drove', [27, 28], 'dr_olddrove'),
    box('breakstone', 'The Breakstone Cut', [26, 27], 'dr_breakstone'),
    box('toll', "Tallyman's Toll", [27, 28], 'dr_toll'),
    box('pound', "Coyle's Pound", [28, 30], 'dr_pound'),
    box('cairns', "The Drovers' Cairns", [28, 29], 'dr_cairns'),
  ];
  const lanterns = [
    { id: 'dr_highdrove', name: 'Highdrove', x: T.spots.lantern[0], y: T.spots.lantern[1], post: [T.spots.lantern[0], T.spots.lantern[1] - 1] },
    { id: 'dr_eastgap', name: 'The Reach Gap', x: 1030, y: 372, post: [1030, 371] },
    { id: 'dr_waystone', name: 'Waystone Fold', x: 512, y: 262, post: [512, 261] },
    { id: 'dr_toll', name: "Tallyman's Toll", x: 300, y: 430, post: [300, 429] },
  ];
  for (const l of lanterns) k.coll[l.post[1]][l.post[0]] = '#';

  const S = T.spots;
  const npcs = [
    { npc: 'dr_marrow', x: S.well[0] - 6, y: S.well[1] - 4, dir: 'down' },  // the drove-boss
    { npc: 'dr_una', x: S.smith[0], y: S.smith[1], dir: 'down' },           // the smith
    { npc: 'dr_ned', x: S.shop[0], y: S.shop[1], dir: 'down' },             // the shop
    { npc: 'dr_tobias', x: S.east[0], y: S.east[1], dir: 'left' },          // the warden of the roads
    { npc: 'dr_wick', x: S.stallW[0], y: S.stallW[1], dir: 'down' },        // a child
    { npc: 'dr_rook', x: S.stallE[0], y: S.stallE[1], dir: 'down' },        // the parson
    { npc: 'dr_gil', x: 716, y: 560, dir: 'down' },             // the herdsman on the leys
    { npc: 'dr_hester', x: 872, y: 200, dir: 'down' },          // the shepherd under Kite Scar
    { npc: 'dr_maudie', x: 520, y: 262, dir: 'down' },          // the waystone keeper
    { npc: 'dr_bede', x: 412, y: 150, dir: 'left' },            // the ghost-teller at the Old Drove
    { npc: 'dr_dunstan', x: 528, y: 274, dir: 'down' },         // a freed drover at the Fold
  ];
  const spawns = [];
  const camp = (mob, levels, pts, group = null, extra = {}) => pts.forEach(([x, y], i) => spawns.push({ mob, level: levels[i % levels.length], x, y, wander: 3, respawn: 90, group, ...extra }));
  const trio = (mob, levels, x, y, group) => { [[x, y], [x + 2, y + 1], [x - 1, y + 2]].forEach(([a, b], i) => spawns.push({ mob, level: levels[i % levels.length], x: a, y: b, wander: 1, respawn: 120, group, pack: 3 })); };
  const pair = (mob, levels, x, y, group) => { [[x, y], [x + 2, y + 1]].forEach(([a, b], i) => spawns.push({ mob, level: levels[i % levels.length], x: a, y: b, wander: 1, respawn: 120, group, pack: 2 })); };
  // 1, 2. the Wild Herd Leys and Highdrove Leys (25 to 26): drove oxen gone wild
  camp('dr_ox', [25, 26], [[652, 540], [748, 540], [640, 590], [760, 594], [700, 614], [666, 520], [732, 520], [700, 530]], 'dr_herd_a');
  camp('dr_ox', [25], [[668, 280], [732, 284], [690, 310], [716, 262]], 'dr_leys_a');
  // 3, 4. Kite Scar (25 to 27): carrion kites
  camp('dr_kite', [25, 26], [[820, 160], [900, 156], [830, 196], [904, 190], [860, 132]], 'dr_scar_a');
  camp('dr_kite', [26, 27], [[840, 214], [884, 216], [812, 182], [912, 176]], 'dr_scar_b');
  // 5, 6. the Chain Kennels (26 to 27): the gang's hounds
  pair('dr_hound', [26, 26], 556, 410, 'dr_kennel_a'); pair('dr_hound', [26, 27], 604, 432, 'dr_kennel_b');
  camp('dr_hound', [26, 27], [[540, 432], [620, 404], [570, 446], [596, 396]], 'dr_kennel_c');
  camp('dr_ganger', [27], [[580, 400], [560, 440]], 'dr_kennel_d');
  // 7, 8. the Breakstone Cut (26 to 27): chain gangers breaking stone
  camp('dr_ganger', [26, 27], [[370, 566], [450, 566], [366, 606], [452, 608], [410, 624], [384, 548], [436, 548]], 'dr_break_a');
  trio('dr_ganger', [27, 27], 410, 600, 'dr_break_trio'); pair('dr_hound', [27, 27], 392, 584, 'dr_break_pair');
  // 9, 10. Tallyman's Toll (27 to 28): tallymen and warders
  camp('dr_tallyman', [27, 28], [[236, 386], [290, 390], [232, 424], [294, 424], [262, 380]], 'dr_toll_a');
  pair('dr_warder', [28, 28], 262, 424, 'dr_toll_pair'); camp('dr_ganger', [28], [[222, 404], [302, 404]], 'dr_toll_b');
  // 11, 12. Coyle's Pound (28 to 29): the gang's hold
  camp('dr_warder', [28, 29], [[126, 246], [156, 246], [124, 222], [158, 222]], 'dr_pound_a');
  trio('dr_warder', [29, 29], 140, 248, 'dr_pound_trio'); camp('dr_tallyman', [29], [[132, 238], [150, 238]], 'dr_pound_b');
  camp('dr_hound', [28], [[96, 236], [184, 236], [140, 280], [140, 196]], 'dr_pound_c');
  // the Old Drove and the Drovers' Cairns (27 to 29): drover shades walk the ghost road (more come at night: the event)
  camp('dr_shade', [27, 28], [[286, 140], [330, 128], [372, 146], [310, 168], [356, 172], [250, 150]], 'dr_drove_day');
  camp('dr_shade', [28, 29], [[104, 560], [146, 566], [120, 588], [130, 544]], 'dr_cairn_day');
  // the gap and the roads: strays
  camp('dr_kite', [25], [[980, 360], [1000, 400]], null);
  camp('dr_ox', [25], [[780, 496], [760, 330]], null);
  // the Chainmaster in the Pound's heart: a fixed spot
  spawns.push({ mob: 'dr_chainmaster', level: 30, x: 140, y: 232, wander: 0, respawn: 300, group: 'dr_chainmaster' });

  const nodes = [
    ...[[372, 584], [444, 588], [390, 612], [430, 616], [400, 556], [420, 556]].map(([x, y], i) => ({ id: `dr_stake_${i + 1}`, item: 'dr_chain_link', x, y, respawn: 30, name: 'Chain Stake', sprite: 'x1_sack_stack' })),
    ...[[294, 146], [324, 136], [358, 140], [382, 160], [304, 172], [340, 176]].map(([x, y], i) => ({ id: `dr_bell_${i + 1}`, item: 'dr_drovers_bell', x, y, respawn: 30, name: "A Drover's Bell", sprite: 'x1_sack_stack' })),
  ];
  const signs = [
    { id: 'dr_gap_sign', x: 1064, y: 376, text: "DROVERS' REACH. HIGHDROVE: WEST, ALONG THE GREAT DROVE. KEEP TO THE ROAD." },
    { id: 'dr_toll_sign', x: 276, y: 398, text: 'TOLL. PAY THE TALLYMAN. EVERY HEAD IS COUNTED. EVERY NAME IS WRITTEN.' },
  ];
  return k.zone({
    id: 'drovers_reach', name: "Drovers' Reach", music: 'the_downs', under: 'x1_moor_turf',
    lighting: { tint: 'none', dark: 0 },
    levels: [25, 30], arrival: [GAP.arrive[0], GAP.arrive[1]],
    regions: [{ id: 'dr_highdrove', name: 'Highdrove', kind: 'town', x: T.box.x0 - 6, y: T.box.y0 - 6, w: T.box.x1 - T.box.x0 + 13, h: T.box.y1 - T.box.y0 + 13, levels: [25, 30], music: 'the_downs', lighting: { tint: 'none', dark: 0 }, under: 'x1_moor_turf' }],
    areas, lanterns, npcs, spawns, nodes, signs, hooks: [], secrets: [],
    joins: [{ x: GAP.x, y: GAP.y, w: GAP.w, h: GAP.h, to: 'larchhill', tx: LARCH_GAP.arrive[0], ty: LARCH_GAP.arrive[1], dir: 'right' }],
  });
}

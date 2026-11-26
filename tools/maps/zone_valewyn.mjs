// Valewyn (wave 3 start realms, 2026-11-22; WORLD_2.md 1.2, D:/LQOnline/world3/BRIEF.md): the Mender's start realm,
// levels 1 to 6. A lake town half under water: the town and the Tide Chapel on the north shore, the drowned quarter's
// rooftops on the east shore, fishing nets on the west, a leech fen and the eel channels to the south, and the Brine
// Widow's sunken keep on the island in the middle, reached by a causeway that floods. Its own outdoor zone, 576 x 384
// tiles, reached by a ride: Maren's ferry from the dock up the channel to Willowmere (src/data/valewyn.js VW_RIDES),
// the Lantern Kite from level 6.
//
// The signature (src/sim/realm_mech.js): the tide. Every 3 minutes the lake rises and falls (zone.tide). The tide flats
// ('f': the causeway, the drowned quarter's streets, the low-tide market, the west shallows) are dry streets at low tide
// and wading water at high tide (a slow); the drowned rise on them at high tide; the stranded villagers can be reached
// only while the water is up, the drowned bells only while it is down.
//
// Built with the big-zone kit (bigzone_kit.mjs) like the Rootbound. Deterministic.
import { bigZone } from './bigzone_kit.mjs';
import { hash01, vnoise } from './kit.mjs';

export const W = 576, H = 384;
export const P = {
  town: [300, 100], quarter: [462, 176], nets: [112, 204], fen: [128, 318], channels: [476, 312], shore: [300, 360],
  island: [300, 252], dock: [344, 104], reeds: [196, 92], orchard: [420, 60], cove: [172, 150],
};
export const LAKE = { cx: 300, cy: 236, rx: 150, ry: 94 };
// the ferry leaves from the dock and runs up the channel to the north edge
export const FERRY = { dock: [346, 100], edge: [350, 0] };

export function build(db) {
  const LEG = { '.': 'grass', ',': 'tallgrass', ':': 'sand', '=': 'plaza', 'o': 'plaza', '~': 'water', '-': 'shallow', 'f': 'sand', 'p': 'x1_peat', 'b': 'dirt' };
  const k = bigZone(W, H, { legend: LEG, floor: '.', seed: 20261124, db });

  // ---- halls round the lake (the shore), the island in it
  k.hall(...P.town, 54, 34, 3);
  k.hall(...P.quarter, 50, 40, 4);
  k.hall(...P.nets, 50, 40, 5);
  k.hall(...P.fen, 56, 40, 6);
  k.hall(...P.channels, 50, 36, 7);
  k.hall(...P.shore, 96, 20, 8);
  k.hall(...P.reeds, 40, 28, 9);
  k.hall(...P.orchard, 50, 30, 10);
  k.hall(...P.cove, 30, 24, 11);
  // the shore ring round the lake: a wide band of land the lake then eats into
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - LAKE.cx) / (LAKE.rx + 40), (y - LAKE.cy) / (LAKE.ry + 34));
    if (d < 1 + 0.05 * (vnoise(x, y, 18, 4) - 0.5)) k.open(x, y);
  }
  const ways = [
    [P.town, [240, 96], P.reeds], [P.reeds, [176, 120], P.cove], [P.cove, [130, 170], P.nets],
    [P.nets, [116, 262], P.fen], [P.fen, [210, 356], P.shore], [P.shore, [400, 352], P.channels],
    [P.channels, [470, 250], P.quarter], [P.quarter, [400, 130], [360, 110], P.town], [P.town, [360, 72], P.orchard], [P.orchard, [460, 110], P.quarter],
  ];
  for (const w of ways) k.passage(w, 14);

  // ---- ground: grass, reeds, sand at the water
  k.paint((x, y, ch, fl) => {
    if (!fl) return null;
    if (vnoise(x, y, 12, 5) > 0.66) return ',';
    return null;
  });
  // the leech fen: peat and pools
  k.paint((x, y, ch, fl) => (fl && Math.hypot((x - P.fen[0]) / 56, (y - P.fen[1]) / 40) < 1 && vnoise(x, y, 9, 21) > 0.4 ? 'p' : null));
  const T = { x0: 266, y0: 80, x1: 334, y1: 120 };
  k.paint((x, y, ch, fl) => (fl && x >= T.x0 && x <= T.x1 && y >= T.y0 && y <= T.y1 ? 'o' : null));

  // ---- roads round the lake
  const road = (pts) => k.road(pts, { ch: '=', verge: 1 });
  road([[266, 100], [240, 96], P.reeds, [176, 120], P.cove, [130, 170], P.nets, [116, 262], P.fen, [210, 356], P.shore, [400, 352], P.channels, [470, 250], P.quarter, [400, 130], [360, 110], [334, 104]]);
  road([[300, 80], [320, 70], [360, 72], P.orchard, [460, 110], [466, 140]]);

  // ---- the lake: deep in the middle, a shallow ring (both block: you cannot swim), then the tide flats on it
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - LAKE.cx) / LAKE.rx, (y - LAKE.cy) / LAKE.ry) + 0.06 * (vnoise(x, y, 14, 8) - 0.5);
    if (d < 0.9) { k.ground[y][x] = '~'; k.coll[y][x] = '~'; k.kind[y][x] = 4; }
    else if (d < 1) { k.ground[y][x] = '-'; k.coll[y][x] = '~'; k.kind[y][x] = 4; }
    else if (d < 1.06 && k.isFloor(x, y) && k.kind[y][x] !== 2) k.ground[y][x] = ':';
  }
  // the channel north of the lake past the town's east side (the ferry's way out), crossed by two rope bridges
  k.river([[350, 0], [348, 40], [352, 90], [350, 130], [338, 150]], { width: 7, deep: '~', shallow: '-', bank: ':' });
  // the eel channels: water through the south-east hall
  k.river([[430, 300], [466, 292], [500, 312], [540, 300], [575, 296]], { width: 5, deep: '~', shallow: '-', bank: ':' });
  k.river([[452, 330], [486, 322], [520, 340]], { width: 4, deep: '~', shallow: '-', bank: ':' });
  // fen pools
  for (const [cx, cy, rx, ry] of [[110, 310, 5, 3], [146, 300, 4, 3], [130, 336, 6, 3], [96, 334, 3, 2]]) for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (k.isFloor(x, y) && k.kind[y][x] !== 2 && Math.hypot((x - cx) / rx, (y - cy) / ry) < 1) { k.ground[y][x] = '-'; k.coll[y][x] = '~'; k.kind[y][x] = 4; }

  // ---- the tide flats ('f', walkable): the causeway, the island's ring, the drowned quarter, the market, the west shallows
  const flat = (x, y) => { if (!k.inb(x, y)) return; k.ground[y][x] = 'f'; k.coll[y][x] = '.'; k.kind[y][x] = 1; };
  for (let y = 118; y <= 236; y++) for (let x = 296; x <= 304; x++) flat(x, y);                               // the causeway
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const di = Math.hypot((x - P.island[0]) / 30, (y - P.island[1]) / 20);
    if (di < 1) { if (di < 0.72) { k.ground[y][x] = '.'; k.coll[y][x] = '.'; k.kind[y][x] = 1; } else flat(x, y); }   // the keep island, its rim floods
    const dq = Math.hypot((x - 432) / 34, (y - 196) / 34);                                                      // the drowned quarter's streets
    if (dq < 1 && (k.kind[y][x] === 4 || k.isFloor(x, y)) && k.kind[y][x] !== 2 && x < 470) flat(x, y);
    const dw = Math.hypot((x - 168) / 24, (y - 206) / 40);                                                      // the west shallows (a low-tide shortcut)
    if (dw < 1 && k.kind[y][x] === 4) flat(x, y);
  }
  for (let y = 118; y <= 130; y++) for (let x = 276; x <= 324; x++) if (k.isFloor(x, y) || k.kind[y][x] === 4) flat(x, y);   // the low-tide market
  const flatsCount = (() => { let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (k.ground[y][x] === 'f') n++; return n; })();
  // the rope bridges over the channel (walkable decks; the quarter road already crosses at the south one)
  const bridges = [];
  for (const by of [71, 96, 112]) { k.ford(344, by, 356, by + 1, '=', (x, y) => (y === by ? 'bridge_wood_h_n_m' : 'bridge_wood_h_s_m')); bridges.push(by); }

  // ---- Valewyn (the town)
  const put = (t, x, y, extra = {}) => { if (!k.put(t, x, y, extra)) throw new Error(`valewyn: ${t} at ${x},${y} does not fit`); };
  put('inn', 272, 94);                      // the Dry Loft, door at (276, 94)
  put('chapel_bell_tower', 290, 94);        // the Tide Chapel, door at (292, 94)
  put('house_medium', 310, 94); put('house_small', 320, 94);
  put('item_shop', 276, 114);               // Perrin's chandlery, door at (279, 114)
  put('house_small', 310, 114); put('house_small', 322, 112);
  put('well', 300, 108);
  for (const [x, y] of [[270, 100], [286, 100], [314, 100], [330, 100], [270, 110], [330, 110], [300, 118]]) k.put('lamp_post', x, y, { state: 1 });
  k.put('signpost_arrow', 264, 98); k.put('signpost_arrow', 336, 106); k.put('signpost_arrow', 302, 78);
  // the low-tide market: stalls on the flats
  put('market_stall_fruit', 284, 124); put('market_stall_cloth', 310, 124);
  // the dock: crates on the bank
  k.put('crates_barrels', 340, 92); k.put('x1_sack_stack', 341, 108);
  // the drowned quarter: rooftops (houses standing in the flats), the stranded on their steps
  const roofs = [[414, 180], [430, 172], [448, 186], [420, 204], [440, 212], [456, 202], [410, 194]];
  const props = [];
  for (const [x, y] of roofs) { if (!k.put(['house_small', 'house_medium', 'x1_cottage_a'][(x + y) % 3], x, y)) k.put('house_small', x, y); }
  // the sunken keep on the island: a tower and its broken walls (3D: code-built, zone.realmProps)
  props.push({ t: 'vw_keep', x: 300, y: 244 });
  for (let x = 292; x <= 308; x++) k.wall(x, 240, x, 242);
  props.push({ t: 'vw_ferry', x: FERRY.dock[0] + 3, y: FERRY.dock[1] });
  // the drowned bells (3D: a bell frame over each; the nodes are the bells)
  const BELLS = [[300, 188], [414, 224], [166, 214]];
  for (const [x, y] of BELLS) props.push({ t: 'vw_bell', x, y: y - 1 });
  // the nets on the west shore, fishing posts
  for (const [x, y] of [[96, 188], [104, 214], [90, 226], [122, 182]]) props.push({ t: 'vw_nets', x, y });
  put('x1_turf_hut', 100, 196); put('x1_hearth', 110, 204);
  put('x1_cottage_b', 410, 58); put('x1_haystack_a', 426, 62);
  // reeds and flowers on the grass; rocks and trees on the open shore (not the town, not the roads, not the flats)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!k.free(x, y, 1) || k.ground[y][x] === 'f') continue;
    const r = hash01(x, y, 61);
    if (r < 0.006) k.overlay(['flowers_white', 'flowers_blue', 'tuft_0'][Math.floor(hash01(x, y, 62) * 3)], x, y);
    else if (r < 0.012) k.overlay(['tuft_0', 'tuft_1', 'pebbles_0'][Math.floor(hash01(x, y, 63) * 3)], x, y);
  }
  for (let y = 4; y < H; y += 5) for (let x = 4; x < W; x += 5) {
    if (x >= T.x0 - 4 && x <= T.x1 + 4 && y >= T.y0 - 4 && y <= T.y1 + 4) continue;
    if (!k.free(x, y, 3) || k.ground[y][x] === 'f') continue;
    const r = hash01(x, y, 71);
    if (r < 0.05) k.put('tree_pine', x, y);
    else if (r < 0.07) k.put('x1_boulder_a', x, y);
  }

  // ---- the woods round the lake
  k.dress({ line: 'tree_pine', lineAlt: 'x1_boulder_a', deep: 'tree_pine', step: 2, skip: 0.1, lineR: 2 });
  for (let i = k.decor.length - 1; i >= 0; i--) { const d = k.decor[i]; if ((d.line || d.deep) && k.kind[d.y][d.x] === 9) k.decor.splice(i, 1); }

  const areas = [
    { id: 'vw_town', name: 'Valewyn', x: T.x0 - 6, y: T.y0 - 6, w: T.x1 - T.x0 + 13, h: T.y1 - T.y0 + 9, levels: [1, 2], safe: true },
    { id: 'vw_chapel', name: 'The Tide Chapel', x: 288, y: 92, w: 10, h: 7, levels: [1, 1] },
    { id: 'vw_market', name: 'The Low-Tide Market', x: 276, y: 119, w: 49, h: 12, levels: [1, 1] },
    { id: 'vw_bridges', name: 'The Rope Bridges', x: 342, y: 94, w: 16, h: 22, levels: [1, 1] },
    { id: 'vw_dock', name: "Maren's Dock", x: 336, y: 96, w: 8, h: 16, levels: [1, 6] },
    { id: 'vw_reeds', name: 'The Reed Bank', x: 160, y: 68, w: 76, h: 50, levels: [1, 2] },
    { id: 'vw_nets', name: 'The Netting Shore', x: 64, y: 166, w: 96, h: 80, levels: [1, 2] },
    { id: 'vw_fen', name: 'The Leech Fen', x: 74, y: 280, w: 110, h: 78, levels: [2, 3] },
    { id: 'vw_quarter', name: 'The Drowned Quarter', x: 398, y: 150, w: 76, h: 76, levels: [3, 4] },
    { id: 'vw_causeway', name: 'The Causeway', x: 294, y: 132, w: 13, h: 100, levels: [4, 5] },
    { id: 'vw_keep', name: 'The Keep Steps', x: 270, y: 232, w: 61, h: 41, levels: [6, 6] },
    { id: 'vw_channels', name: 'The Eel Channels', x: 426, y: 278, w: 100, h: 70, levels: [4, 5] },
    { id: 'vw_shore', name: 'The South Shore', x: 204, y: 340, w: 192, h: 40, levels: [3, 5] },
    { id: 'vw_orchard', name: 'The Salt Orchard', x: 370, y: 30, w: 100, h: 60, levels: [2, 3] },
  ];
  const lanterns = [
    { id: 'vw_town', name: 'Valewyn', x: 300, y: 104, post: [300, 103] },
    { id: 'vw_nets', name: 'The Netting Shore', x: 128, y: 196, post: [130, 195] },
    { id: 'vw_fen', name: 'The Leech Fen', x: 150, y: 324, post: [152, 323] },
    { id: 'vw_quarter', name: 'The Drowned Quarter', x: 470, y: 178, post: [472, 177] },
    { id: 'vw_shore', name: 'The South Shore', x: 300, y: 362, post: [302, 361] },
  ];
  for (const l of lanterns) k.coll[l.post[1]][l.post[0]] = '#';

  const npcs = [
    { npc: 'vw_orla', x: 292, y: 97, dir: 'down' },       // Sister Orla of the Tide Chapel, the Mender's first teacher
    { npc: 'vw_maren', x: 340, y: 102, dir: 'right' },    // Maren the ferrywoman, at her dock (the ferry to Willowmere)
    { npc: 'vw_tilly', x: 300, y: 126, dir: 'down' },     // Tilly, her daughter, in the market where she should not be
    { npc: 'vw_hamish', x: 116, y: 200, dir: 'down' },    // Hamish Netter, by his nets on the west shore
    { npc: 'vw_perrin', x: 279, y: 117, dir: 'down' },    // Perrin, the chandler
  ];
  const spawns = [];
  const camp = (mob, levels, pts, group, extra = {}) => pts.forEach(([x, y], i) => spawns.push({ mob, level: levels[i % levels.length], x, y, wander: 3, respawn: 60, group, ...extra }));
  // the netting shore and the reed bank (1 to 2): mudsnappers along the nets
  camp('vw_mudsnapper', [1, 1, 2], [[84, 196], [92, 208], [100, 222], [112, 230], [128, 222], [136, 204], [86, 230], [120, 186], [144, 214], [104, 180]], null);
  camp('vw_mudsnapper', [1], [[186, 84], [204, 96], [212, 82], [180, 100]], null);
  // the salt orchard (2 to 3): snappers in the windfalls, leeches in the ditch
  camp('vw_mudsnapper', [2, 3], [[400, 48], [420, 40], [440, 54], [430, 72], [452, 66]], null);
  // the leech fen (2 to 3): bog leeches
  camp('vw_bog_leech', [2, 3, 2], [[100, 300], [118, 318], [136, 312], [154, 330], [120, 344], [92, 320], [160, 304], [140, 350], [108, 290]], null);
  // the drowned quarter (3 to 4): snappers on the steps; the drowned rise from the flats at high tide
  camp('vw_mudsnapper', [3, 4], [[474, 160], [480, 194], [470, 212]], null);
  camp('vw_drowned', [3, 4], [[424, 188], [438, 200], [450, 194], [416, 214], [432, 220], [446, 176]], null, { respawn: 45 });
  // the causeway (4 to 5): the drowned at high tide
  camp('vw_drowned', [4, 5], [[300, 148], [298, 164], [302, 212], [300, 224]], null, { respawn: 45 });
  // the eel channels and the south shore (4 to 5)
  camp('vw_brine_eel', [4, 5], [[435, 295], [458, 300], [482, 298], [506, 318], [520, 302], [470, 318], [494, 334], [512, 296]], null);
  camp('vw_bog_leech', [4], [[240, 356], [270, 364], [330, 364], [360, 356]], null);
  // the keep steps (6): the Brine Widow, and her drowned
  spawns.push({ mob: 'vw_brine_widow', level: 6, x: 300, y: 256, wander: 1, respawn: 180, group: 'vw_keep_boss' });
  camp('vw_drowned', [5], [[284, 250], [316, 250]], null, { respawn: 45 });
  // ---- nodes: the stranded on the rooftops' steps (high tide only), the drowned bells (low tide only)
  const nodes = [];
  [[418, 182], [434, 175], [452, 189], [424, 206], [444, 214], [460, 205]].forEach(([x, y], i) => nodes.push({ id: `vw_stranded_${i + 1}`, item: 'vw_safe_villager', x, y, respawn: 20, channel: 2, name: 'Stranded Villager', sprite: 'x1_sack_stack', tide: 'high' }));
  BELLS.forEach(([x, y], i) => nodes.push({ id: `vw_bell_${i + 1}`, item: 'vw_bell_note', x, y, respawn: 20, channel: 1.5, name: 'Drowned Bell', sprite: 'x1_sack_stack', tide: 'low' }));
  const zone = k.zone({
    id: 'valewyn', name: 'Valewyn', music: 'valley', under: 'grass',
    lighting: { tint: 'none', dark: 0 },
    grade: { tint: 'rgba(60,170,180,0.07)', desat: 0.1 },
    style: 'lake', palette: { grass: '#4f6e52', tallgrass: '#46664a', sand: '#b8b49a', plaza: '#8a8e8a', x1_peat: '#3a3a2a', dirt: '#7a6e58' },
    levels: [1, 6], arrival: [300, 106],
    regions: [{ id: 'vw_town', name: 'Valewyn', kind: 'town', x: T.x0 - 6, y: T.y0 - 6, w: T.x1 - T.x0 + 13, h: T.y1 - T.y0 + 9, levels: [1, 2], music: 'valley', lighting: { tint: 'none', dark: 0 }, under: 'grass' }],
    areas, lanterns, npcs, spawns, nodes, signs: [], hooks: [], secrets: [],
    // the tide (seconds): period, and the flats char; high = the water over the flats (src/sim/realm_mech.js)
    tide: { ch: 'f', period: 180, flats: flatsCount, slow: 0.5 },
    realmProps: props,
    joins: [],
  });
  void bridges;
  return zone;
}

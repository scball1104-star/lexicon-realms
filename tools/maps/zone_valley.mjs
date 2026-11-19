// Willowmere Valley, grown to 96 x 64 from Lexicon Quest's 60 x 40 `valley` (docs/design/ZONES_QUESTS.md 2.2).
// LQ's bones, scaled about 1.6: the river out of the north cliff and down the middle, the stone bridge with Penny's cart
// at its far end, the pilgrim road climbing the east bank to the fork (milestone, signpost, the Pilgrim's Rest) and on
// to the Archive door under the Mother Willow, the north landing with the empty bell post, the west plateau with the
// hollow tree and its ledge hop, the meadows, and the Whisperwood edge thickening to the east. New room goes to Cobb's
// fields (fenced, furrowed), a bigger south meadow with a pond, and a real Whisperwood edge with clearings for camps.
//
// Closed hooks (OPEN_QUESTIONS Q19): the east road (a fallen oak, Holt's sign) and the Keepers' stair over the cleft
// (black ink across its foot; it wants the Lantern).
import { Canvas, bridgeH, bridgeV, scatter, hash01, vnoise, dresser } from './kit.mjs';

export const W = 96, H = 64;

export function build(db) {
  const c = new Canvas(W, H, '.');
  const at = (x, y) => c.at(x, y);

  // ---------------------------------------------------------------- the north cliff band
  c.box(0, 0, W - 1, 3, '^');
  c.box(0, 4, W - 1, 5, '|');
  // the Archive's notch: a forecourt cut into the cliff under the Mother Willow (door on the face, x 45..46, y 2..3)
  c.box(41, 2, 51, 3, '|');
  c.box(41, 4, 51, 5, '.');
  c.box(40, 4, 40, 5, '|'); c.box(52, 4, 52, 5, '|');
  // the Keepers' stair in the cliff west of the river, and the black cleft across its foot (the Lantern hook)
  c.put(24, 3, 'S'); c.put(24, 4, 't'); c.put(24, 5, 'z');
  c.box(22, 6, 26, 7, 'i'); c.put(21, 7, 'i'); c.put(27, 6, 'i');

  // ---------------------------------------------------------------- the river
  const CENTER = [[0, 32], [6, 32.5], [14, 34], [22, 37], [30, 41], [38, 45.5], [42, 47.5], [50, 48.5], [63, 47.5]];
  const cx = (y) => {
    for (let i = 0; i + 1 < CENTER.length; i++) {
      const [ya, xa] = CENTER[i], [yb, xb] = CENTER[i + 1];
      if (y >= ya && y <= yb) return xa + (xb - xa) * (y - ya) / (yb - ya);
    }
    return CENTER[CENTER.length - 1][1];
  };
  const RIVER = [];
  for (let y = 0; y < H; y++) {
    const m = cx(y);
    const wl = Math.round(m - 3 + (vnoise(0, y, 5, 61) - 0.5) * 1.6);
    const wr = Math.round(m + 3 + (vnoise(1, y, 5, 62) - 0.5) * 1.6);
    RIVER[y] = [wl, wr];
    for (let x = wl; x <= wr; x++) c.put(x, y, '~');
    if (y >= 6) {
      if (hash01(0, y, 11) < 0.8) c.put(wl - 1, y, 's');
      if (hash01(1, y, 11) < 0.8) c.put(wr + 1, y, 's');
      if (vnoise(2, y, 4, 12) > 0.62) c.put(wl - 2, y, 's');
      if (vnoise(3, y, 4, 13) > 0.62) c.put(wr + 2, y, 's');
    }
  }
  // the north landing: a sandy beach on the east bank and the shallows where Nella's bell hung
  c.blob(39, 10, 3.2, 3, 's', 4, ['.', ',']);
  for (let y = 9; y <= 12; y++) { const [, wr] = RIVER[y]; c.box(wr - 2, y, wr, y, '-'); }
  // a gravel bar in the south reach
  c.blob(RIVER[57][0] + 3, 57, 1.4, 2.2, 's', 9, ['~']);

  // ---------------------------------------------------------------- the west plateau (cliff ring, face, stairs, ledge hop)
  const PX0 = 3, PX1 = 22, PY0 = 9, PY1 = 16;
  c.box(PX0, PY0, PX1, PY1, '^');
  c.box(PX0 + 1, PY0 + 1, PX1 - 1, PY1 - 1, '.');
  c.box(PX0, PY1 + 1, PX1, PY1 + 2, '|');
  for (const [x, y] of [[PX0 + 1, PY0 + 1], [PX1 - 1, PY0 + 1], [PX0 + 1, PY1 - 1]]) c.put(x, y, '^');   // bitten corners
  c.put(PX1 - 3, PY1, 'S'); c.put(PX1 - 3, PY1 + 1, 't'); c.put(PX1 - 3, PY1 + 2, 'z');                 // stairs up, (19, 16..18)
  c.put(8, PY1, 'L'); c.put(9, PY1, 'M'); c.put(10, PY1, 'R');                                         // one-way hop down
  c.box(8, PY1 + 1, 10, PY1 + 2, '.');
  c.blob(12, 12.5, 5, 2.4, 'm', 2, ['.']);                                                           // moss round the hollow tree

  // ---------------------------------------------------------------- roads (tile-corner coordinates)
  const ROADS = {
    west: [[0, 53], [5, 52.7], [11, 51.5], [17, 49.7], [23, 47.6], [29, 45.8], [35, 44.2], [40, 43.2], [43, 43]],
    pilgrim: [[53, 43], [57, 43], [60, 41.6], [62, 38], [62.6, 33], [61.6, 28.6], [58.6, 25], [54.6, 23.2], [51, 22.6]],
    archive: [[51, 22.4], [50.2, 18], [48.8, 13.6], [47.6, 9.6], [46.6, 6.4], [46.4, 4.6]],
    landing: [[48.2, 12.2], [45, 11.4], [42, 10.6], [40, 10.2]],
    east: [[54, 22.6], [60, 22.2], [66, 23], [72, 24.4], [78, 24.6], [84, 24]],
    downs: [[0, 19.2], [3, 19.6], [7, 21.2], [11, 24], [15, 28.6], [19, 33.4], [23, 38.4], [26.4, 42.4], [29.4, 45.6]],
  };
  for (const [k, pts] of Object.entries(ROADS)) c.ribbon(pts, 2, '=', 20 + k.length, ['.', ',', 'm', 's']);
  c.ribbon([[84, 23.5], [92, 23.5]], 1, '=', 31, ['.', ',']);                                       // the east road narrows to the oak
  c.ribbon([[0, 18], [3, 18.6]], 2, '=', 32, ['.', ',', '|']);                                       // the Downs lane meets the edge
  c.ribbon([[56, 44.5], [60, 47.4], [66, 50.4], [73, 53], [80, 54.8]], 1, '=', 33, ['.', ',', 's']); // the east bank fishing track
  c.ribbon([[31.5, 46], [31.6, 50.5]], 2, '=', 34, ['.', ',']);                                      // Cobb's track to his gate
  c.blob(51, 23.4, 3.6, 2.4, '=', 35, ['.', ',']);                                                   // the fork's trodden yard
  c.box(43, 5, 49, 6, '=', ['.']);                                                                   // the Archive forecourt

  // ---------------------------------------------------------------- Cobb's fields (fence, gate, furrows)
  const F = { x0: 29, x1: 42, y0: 49, y1: 61 };
  for (let x = F.x0; x <= F.x1; x++) { c.put(x, F.y0, 'F'); c.put(x, F.y1, 'F'); }
  for (let y = F.y0; y <= F.y1; y++) { c.put(F.x0, y, 'F'); c.put(F.x1, y, 'F'); }
  c.put(31, F.y0, '='); c.put(32, F.y0, '=');                                                       // the gate gap
  c.box(F.x0 + 1, F.y0 + 1, F.x1 - 1, F.y1 - 1, '.');
  for (let y = F.y0 + 3; y <= F.y1 - 2; y += 2) for (let x = F.x0 + 4; x <= F.x1 - 2; x++) c.put(x, y, hash01(x, y, 36) < 0.92 ? '=' : '.');   // furrows
  for (let y = F.y0 + 4; y <= F.y1 - 2; y += 2) for (let x = F.x0 + 4; x <= F.x1 - 2; x++) c.put(x, y, ',');                                 // barley

  // ---------------------------------------------------------------- the south meadow pond
  c.blob(13, 57.5, 3.4, 2.2, '~', 5, ['.']);
  c.blob(13, 57.5, 4.6, 3.2, 's', 5, ['.']);

  // ---------------------------------------------------------------- tall grass drifts, kept off road verges
  c.drift(',', '.', 0.6, 21, [6, 3], [0, 6, W - 1, H - 1]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y) !== ',') continue;
    const inField = x > F.x0 && x < F.x1 && y > F.y0 && y < F.y1;
    if (!inField && c.near(x, y, '=', 1)) c.put(x, y, '.');
  }
  // a drift of moss under the Whisperwood
  c.drift('m', '.', 0.62, 71, [5, 3], [70, 6, W - 1, 44]);

  const ground = c.rows();

  // ---------------------------------------------------------------- overlays
  const overlays = [
    ...bridgeH(42, 53, 42, 'stone', true),
    ...bridgeH(RIVER[9][1] - 4, RIVER[9][1] + 1, 8, 'wood', true),       // the landing pier
    { t: 'door_double_closed', x: 45, y: 2 },
    { t: 'roots_0', x: 43, y: 4 }, { t: 'roots_1', x: 49, y: 4 }, { t: 'roots_2', x: 50, y: 5 }, { t: 'roots_1', x: 42, y: 5 },
    { t: 'ink_bridge_v_faint', x: 24, y: 6 }, { t: 'ink_bridge_v_faint', x: 24, y: 7 },
    ...scatter(ground, ['.'], ['flowers_white', 'flowers_yellow', 'tuft_0', 'tuft_1', 'pebbles_0', 'flowers_violet', 'leaves'], 0.07, 31),
    ...scatter(ground, [','], ['flowers_yellow', 'flowers_white', 'flowers_pink'], 0.1, 32, [0, 0, 28, H - 1]),
    ...scatter(ground, ['s'], ['pebbles_0', 'pebbles_1', 'pebbles_2'], 0.25, 33),
    ...scatter(ground, ['='], ['pebbles_0', 'pebbles_1'], 0.05, 34),
    ...scatter(ground, ['m'], ['leaves', 'tuft_1', 'pebbles_1'], 0.12, 35),
    { t: 'hydrangea_blue', x: 47, y: 25 }, { t: 'hydrangea_violet', x: 55, y: 25 },
  ].filter((o) => !(o.t.startsWith('flowers') && ground[o.y][o.x] === '=') );

  // ---------------------------------------------------------------- decor
  const d = dresser(c, db);
  // landmarks first (forced), so trees keep off them
  d.reserve(40, 2, 53, 8);                 // the Archive forecourt
  d.reserve(44, 18, 58, 28);               // the fork
  d.reserve(36, 6, 47, 14);                // the north landing
  d.reserve(54, 38, 62, 46);               // Penny's cart
  d.reserve(0, 49, 8, 56);                 // the arrival from town
  d.reserve(0, 16, 4, 21);                 // the Downs lane mouth
  d.reserve(F.x0 - 1, F.y0 - 2, F.x1 + 1, F.y1 + 1);
  d.reserve(84, 24, 92, 31);               // Lark's clearing
  d.reserve(20, 5, 28, 10);                // the cleft
  d.reserve(17, 14, 21, 20); d.reserve(7, 15, 11, 19);   // the plateau stairs and the ledge hop
  d.add('tree_willow', 45, 1);             // the Mother Willow above the door
  d.add('tree_willow', 41, 0); d.add('tree_willow', 49, 0);
  d.add('root_column', 42, 5); d.add('root_column', 48, 5);
  d.add('signboard', 21, 8);               // the cleft sign (hook)
  d.add('signpost', 39, 8);                // the empty bell post
  d.add('prop_milestone', 48, 22);         // the milestone at the fork
  d.add('signpost_arrow', 53, 20);         // the fork signpost
  d.add('bench', 46, 25); d.add('crates_barrels', 48, 27);   // the Pilgrim's Rest
  d.add('market_stall_cloth', 58, 40);     // Penny's cart
  d.add('crates_barrels', 54, 40);
  d.add('signboard', 41, 41);              // the bridge plaque
  d.add('x1_fallen_oak', 91, 23);          // the east road hook: the oak across the road
  d.add('signboard', 87, 22);              // Holt's sign
  d.add('signboard', 33, 48);              // Cobb's gate board
  d.add('x1_haystack_a', 39, 51); d.add('x1_haybale', 41, 52); d.add('x1_trough', 30, 51);
  d.add('tree_willow', 17, 12);            // the hollow tree on the plateau
  d.add('tree_willow', 56, 47); d.add('tree_willow', 40, 36); d.add('tree_willow', 24, 31);
  d.add('tree_willow', 52, 58); d.add('tree_willow', 18, 55);
  for (const [x, y] of [[13, 13], [20, 13], [15, 11], [21, 11]]) d.try('bush', x, y);
  // lanterns (lamp posts) are placed by the zone table below; keep their cells clear
  const LANTERNS = [
    { id: 'south_gate', name: 'South Gate', x: 4, y: 52, post: [4, 51] },
    { id: 'pilgrims_rest', name: "Pilgrim's Rest", x: 50, y: 24, post: [50, 25] },
    { id: 'north_landing', name: 'The North Landing', x: 41, y: 9, post: [42, 8] },
    { id: 'east_bank', name: 'The East Bank', x: 64, y: 49, post: [64, 48] },
  ];
  for (const l of LANTERNS) d.add('lamp_post', l.post[0], l.post[1], { state: 1 });

  // ---------------------------------------------------------------- the zone table (sim data)
  const areas = [
    { id: 'south_meadow', name: 'The South Meadow', x: 2, y: 40, w: 28, h: 22, levels: [1, 2] },
    { id: 'cobbs_fields', name: "Cobb's Fields", x: 29, y: 46, w: 15, h: 16, levels: [1, 2] },
    { id: 'stone_bridge', name: 'The Stone Bridge', x: 42, y: 40, w: 14, h: 6, levels: [2, 2] },
    { id: 'river_bank_e', name: 'The East Bank', x: 56, y: 44, w: 38, h: 18, levels: [2, 3] },
    { id: 'pilgrim_road', name: 'The Pilgrim Road', x: 56, y: 26, w: 14, h: 14, levels: [3, 5] },
    { id: 'the_fork', name: 'The Fork', x: 44, y: 18, w: 14, h: 10, levels: [3, 3], safe: true },
    { id: 'north_landing', name: 'The North Landing', x: 36, y: 6, w: 10, h: 8, levels: [3, 4] },
    { id: 'archive_door', name: 'The Archive Door', x: 40, y: 0, w: 12, h: 8 },
    { id: 'west_plateau', name: 'The West Plateau', x: 3, y: 9, w: 20, h: 8, levels: [2, 3] },
    { id: 'west_meadow', name: 'The West Meadow', x: 2, y: 17, w: 26, h: 21, levels: [2, 3] },
    { id: 'whisperwood_edge', name: 'The Whisperwood Edge', x: 70, y: 6, w: 26, h: 38, levels: [4, 6] },
    { id: 'the_cleft', name: "The Keepers' Stair", x: 19, y: 3, w: 10, h: 7 },
  ];
  const spawns = [];
  const camp = (mob, level, pts, group, extra = {}) => pts.forEach(([x, y], i) => spawns.push({ mob, level: Array.isArray(level) ? level[i % level.length] : level, x, y, wander: 3, respawn: 90, group, ...extra }));
  // south meadow: ink slimes (passive), level 1 to 2
  camp('ink_slime', [1, 2, 1, 2], [[10, 44], [16, 42], [20, 46], [8, 47]], 'sm_slimes_a');
  camp('ink_slime', [1, 1, 2, 2], [[12, 54], [20, 52], [24, 57], [7, 59]], 'sm_slimes_b');
  camp('ink_slime', [2, 1, 2], [[25, 50], [22, 61], [27, 43]], 'sm_slimes_c');
  // Cobb's fields: moss scarabs among the barley
  camp('moss_scarab', 2, [[34, 53], [38, 55], [35, 58], [40, 59], [37, 52]], 'cobb_scarabs', { wander: 2 });
  // the east bank: slimes and scarabs, level 2 to 3
  camp('ink_slime', [2, 3, 2, 3], [[60, 52], [66, 56], [72, 58], [62, 59]], 'eb_slimes_a');
  camp('ink_slime', [3, 2, 3], [[78, 50], [84, 56], [76, 60]], 'eb_slimes_b');
  camp('moss_scarab', [2, 3, 3], [[68, 47], [86, 51], [70, 61]], 'eb_scarabs');
  // the pilgrim road: briar wolf pairs every 8 tiles, 3 tiles off the road
  camp('briar_wolf', [3, 3], [[66, 40], [67, 41]], 'pr_wolves_a');
  camp('briar_wolf', [3, 4], [[66, 33], [67, 34]], 'pr_wolves_b');
  camp('briar_wolf', [4, 4], [[58, 31], [57, 32]], 'pr_wolves_c');
  camp('briar_wolf', [4, 5], [[64, 27], [65, 28]], 'pr_wolves_d');
  camp('briar_wolf', [5, 4], [[57, 37], [56, 36]], 'pr_wolves_e');
  // the north landing: slimes in the shallows (level 3 to 4, Quill's pages)
  camp('ink_slime', [3, 4, 3, 4], [[38, 12], [41, 13], [44, 9], [37, 7]], 'nl_slimes', { wander: 2 });
  camp('ink_slime', [4, 3], [[43, 13], [45, 7]], 'nl_slimes_b', { wander: 2 });
  // the west meadow and plateau: moss scarabs
  camp('moss_scarab', [2, 3, 2], [[8, 25], [14, 23], [6, 31]], 'wm_scarabs_a');
  camp('moss_scarab', [3, 2, 3], [[20, 27], [12, 34], [24, 22]], 'wm_scarabs_b');
  camp('moss_scarab', [3, 3], [[8, 11], [14, 14]], 'wp_scarabs');
  // the Whisperwood edge: thornback wolf pairs in clearings, ink blots under the trees
  camp('thornback_wolf', [5, 5], [[76, 14], [77, 15]], 'ww_wolves_a');
  camp('thornback_wolf', [5, 6], [[84, 17], [85, 18]], 'ww_wolves_b');
  camp('thornback_wolf', [6, 5], [[78, 30], [79, 31]], 'ww_wolves_c');
  camp('thornback_wolf', [6, 6], [[86, 37], [87, 38]], 'ww_wolves_d');
  camp('thornback_wolf', [5, 6], [[74, 36], [75, 35]], 'ww_wolves_e');
  camp('ink_blot', [5, 6, 5, 6, 6], [[80, 10], [88, 12], [82, 22], [90, 32], [80, 40]], 'ww_blots', { wander: 1 });
  // clearings: reserve camp cells so the forest leaves room round each camp
  // (done before tree placement would be cleaner; the dresser's later pass treats spawns as reserved)

  const npcs = [
    { npc: 'cobb', x: 31, y: 48, dir: 'down' },
    { npc: 'penny', x: 57, y: 42, dir: 'left' },
    { npc: 'quill', x: 47, y: 24, dir: 'right' },
  ];
  const nodes = [];
  [[33, 52], [36, 54], [40, 56], [34, 58], [38, 60], [31, 56], [41, 54], [37, 50]].forEach(([x, y], i) => nodes.push({ id: `hen_${i + 1}`, item: 'stray_hen', x, y, respawn: 30, name: i === 0 ? 'Henrietta' : i === 1 ? 'Bertha' : 'Stray Hen', sprite: 'animal_chicken' }));
  // clearings round every camp, node and NPC, then the trees
  for (const p of [...spawns, ...nodes, ...npcs]) d.reserve(p.x - 2, p.y - 2, p.x + 2, p.y + 1);
  // trees: a broken line on the cliff top, Whisperwood thickening east, copses in the meadows, a hedge on the south edge
  for (let x = 1; x < W - 1; x++) {
    if ((x >= 20 && x <= 36) || (x >= 39 && x <= 53)) continue;
    const r = hash01(x, 1, 41);
    if (r < 0.45) d.add('tree_pine', x, Math.floor(hash01(x, 2, 42) * 3));
  }
  const pineDensity = (x, y) => {
    let p = 0;
    if (x >= 68) p = 0.05 + Math.pow(Math.min(1, (x - 68) / 22), 1.2) * 0.8;   // the Whisperwood edge
    if (x >= 68 && y >= 44) p *= 0.45;                                          // thinner over the east bank
    if (x >= 68 && vnoise(x, y, 6, 48) < 0.32) p *= 0.15;                      // glades
    const cop = vnoise(x, y, 7, 47);
    if (x < 68 && cop > 0.74) p = 0.45;                                         // copses in the meadows
    if (y >= 60) p = Math.max(p, 0.55);                                         // the south hedge of trees
    if (x <= 1) p = Math.max(p, 0.6);                                           // the west edge
    return p;
  };
  for (let y = 7; y < H; y++) for (let x = 0; x < W; x++) {
    const p = pineDensity(x, y);
    if (p > 0 && hash01(x, y, 43) < p) d.try('tree_pine', x, y);
  }
  // camp clearings in the Whisperwood are left by reserving them before the forest fill (below, the spawn table)
  for (let x = 1; x < W - 1; x += 1) if (hash01(x, 63, 44) < 0.5) d.try('tree_pine', x, H - 1);
  for (let y = 7; y < H - 1; y++) { if (hash01(0, y, 45) < 0.5) d.try('tree_pine', 0, y); if (hash01(95, y, 46) < 0.8) d.try('tree_pine', W - 1, y); }
  for (let y = 20; y <= 28; y++) for (let x = 92; x <= 95; x++) if (!(y === 23)) d.add('tree_pine', x, y);   // the far side of the oak is forest
  d.add('tree_pine', 95, 23);
  // bushes along the river and in the meadows
  for (let y = 7; y < H; y += 2) for (let x = 1; x < W - 1; x += 2) {
    const r = hash01(x, y, 53);
    if (r < 0.06) d.try(r < 0.012 ? 'x1_boulder_a' : 'bush', x + (hash01(x, y, 54) < 0.5 ? 0 : 1), y + (hash01(x, y, 55) < 0.5 ? 0 : 1));
  }

  const signs = [
    { id: 'cleft_sign', x: 21, y: 8, text: "THE KEEPERS' STAIR. The cleft at its foot is black and wants a light you do not have.", hook: 'x1_terrace' },
    { id: 'bell_post', x: 39, y: 8, text: "The bell post. A rope's end and a bracket. Nella's bell hung here once." },
    { id: 'milestone', x: 48, y: 22, text: 'A Keeper milestone. Worn letters, and a hand pointing north to the Archive.' },
    { id: 'fork_sign', x: 53, y: 20, text: 'NORTH: THE ARCHIVE. EAST: THE EAST ROAD. SOUTH: THE BRIDGE AND WILLOWMERE.' },
    { id: 'bridge_plaque', x: 41, y: 41, text: 'THE STONE BRIDGE. Mind the third step. It knows.' },
    { id: 'east_road_sign', x: 87, y: 22, text: 'ROAD CLOSED. A FALLEN OAK. CLEARING IT IS ON MY LIST. - HOLT', hook: 'east_road' },
    { id: 'cobbs_gate', x: 33, y: 48, text: "COBB'S FIELDS. Shut the gate. The hens can count." },
    { id: 'archive_door', x: 45, y: 3, text: 'A great door under the Mother Willow, sealed fast. Carved over it: SPEAK, AND BE KEPT. Smaller lines run round the frame: KEEP THE NAME, KEEP THE ROAD, and a row of Keeper marks. Forty-one letters in all.' },
  ];
  const hooks = [
    { id: 'east_road', to: 'east_road', x: 89, y: 23, text: 'A fallen oak blocks the east road. Holt says it is on his list.' },
    { id: 'x1_terrace', to: 'x1_terrace', x: 24, y: 8, text: 'The cleft is black ink, too wide to step. The stair beyond climbs into the cliff.' },
  ];
  const joins = [
    { x: 0, y: 52, w: 1, h: 2, to: 'willowmere', tx: 20, ty: 30, dir: 'up' },
    { x: 0, y: 18, w: 1, h: 2, to: 'downs', tx: 142, ty: 20, dir: 'left' },
    { x: 95, y: 23, w: 1, h: 2, to: 'east_road', tx: 1, ty: 16, dir: 'right' },
  ];
  // solids: the sealed Archive door (the overlay is walkable art), the signs are props already
  const solids = [[45, 2], [46, 2], [45, 3], [46, 3]];

  return {
    map: {
      id: 'valley', name: 'Willowmere Valley', kind: 'field', w: W, h: H, music: 'valley', lighting: { tint: 'none', dark: 0 },
      under: 'grass',
      legend: { '.': 'grass', ',': 'tallgrass', '=': 'dirt', s: 'sand', '~': 'water', '-': 'shallow', i: 'ink', m: 'moss', F: 'fence_wood',
        '^': 'cliff_top', '|': 'cliff_face', S: 'cliff_stairs_top', t: 'cliff_stairs_mid', z: 'cliff_stairs_bot', L: 'ledge_s_a', M: 'ledge_s_m', R: 'ledge_s_b' },
      ground, overlays, decor: d.decor, overhead: [], solids,
    },
    realm: { levels: [1, 6], arrival: [1, 52], areas, lanterns: LANTERNS, spawns, npcs, nodes, signs, hooks, joins },
  };
}

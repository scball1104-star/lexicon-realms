// Shepherd's Downs, grown to 144 x 96 from Lexicon Quest's 56 x 34 `x1_downs` (docs/design/ZONES_QUESTS.md 3).
// LQ's layout, stretched: the gate lanes in the east meeting at the signpost, Thornfold in the middle (the Loom House,
// cottages, the well, the sheep fold with Brindle at its gate), the Standing Stones in the north-west with the barrow
// mound under the cliff, the Old Fold in the south-west, the Ridge bluff in the north with Patch and the gap to the
// moor, the Drovers' Road south-east. "Rolling grass under a high sky, drystone walls, a few stands of hawthorn, gentle
// ledges." New room goes to the fold pastures (north-east), a stream with the drovers' ford, and the Larchhill road.
//
// Closed hooks: the Drovers' Road (Ferrick's chain), the Larchhill gate. The Watchtower stands on the north skyline as
// a far-off decal, so the next zone is promised before it is reached.
import { Canvas, scatter, hash01, vnoise, dresser, carveSecret, dressSecret, secretEntry } from './kit.mjs';

export const W = 144, H = 96;

// Secrets (landscape pass 2026-11-20, docs/design/LANDSCAPE_PASS.md; kit.mjs carveSecret): a false face in the cliff
// over the Standing Stones (a shelf behind it), and a hawthorn ring south of the ford with one bush you can push through.
const RING_B = { x0: 125, y0: 80, x1: 131, y1: 85 };
const HAWTHORN = [];
// a ragged thicket, not a square (Scott 2026-11-21: the square read as obvious): the sealed inner ring stays, with a
// broken outer layer and a few strays round it; the approach to the push-through bush stays open
const hh = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 100;
for (let x = RING_B.x0 - 2; x <= RING_B.x1 + 2; x++) for (let y = RING_B.y0 - 2; y <= RING_B.y1 + 2; y++) {
  const d = Math.max(RING_B.x0 - x, x - RING_B.x1, RING_B.y0 - y, y - RING_B.y1, 0);
  const border = d === 0 && (x === RING_B.x0 || x === RING_B.x1 || y === RING_B.y0 || y === RING_B.y1);
  if (border) { if (!(x === 128 && y === 85)) HAWTHORN.push(['bush', x, y]); continue; }
  if (x >= 126 && x <= 130 && y >= 85) continue;                    // the way in stays clear
  if ((d === 1 && hh(x, y) < 85) || (d === 2 && hh(x, y) < 40)) HAWTHORN.push(['bush', x, y]);
}

export const SECRETS = [
  { id: 'downs_shelf', name: "The Stone-Cutters' Shelf", kind: 'rockface', passage: [[44, 3], [45, 3], [44, 4], [45, 4]], nook: [41, 1, 48, 2], top: '^',
    floor: '.', look: '|', chest: [44, 1], hint: [44, 5], gold: [60, 85],
    chestName: "Stone-Cutter's Chest", text: 'A shelf cut behind the cliff. The stones of the ring were dressed here, and one was left half done.' },
  { id: 'downs_hawthorn', name: 'The Hawthorn Ring', kind: 'bushwall', passage: [[128, 85]], nook: [126, 81, 130, 84], floor: '.', look: '.',
    ring: HAWTHORN, chest: [128, 82], hint: [128, 85], gold: [55, 80],
    chestName: "Drover's Strongbox", text: 'Inside the hawthorn the grass is short and green. A drover hid his strongbox here and never came back for it.' },
];

export function build(db) {
  const c = new Canvas(W, H, '.');

  // ---------------------------------------------------------------- the north: cliff band west and east, the Ridge bluff between
  const band = (x0, x1, salt) => {
    for (let x = x0; x <= x1; x++) {
      const extra = vnoise(x, 0, 5, salt) > 0.6 ? 1 : 0;           // the band breathes: a row deeper here and there
      c.box(x, 0, x, 2 + extra, '^');
      c.box(x, 3 + extra, x, 4 + extra, '|');
    }
  };
  band(0, 55, 81);
  band(100, 143, 82);
  // the Ridge: a grass plateau (x 58..98, y 0..12) ringed by crag top, a two-row face on its south side
  c.box(56, 0, 57, 13, '^'); c.box(99, 0, 99, 13, '^');
  c.box(56, 13, 99, 13, '^');
  c.box(56, 14, 99, 15, '|');
  c.box(58, 0, 98, 0, '^');
  c.box(74, 0, 77, 0, '=');                                          // the gap north to the moor
  for (const [x, y] of [[58, 1], [59, 1], [98, 1], [97, 1], [58, 12], [98, 12], [58, 11]]) c.put(x, y, '^');
  c.put(64, 13, 'S'); c.put(64, 14, 't'); c.put(64, 15, 'z');       // stairs up from Thornfold's lane
  c.put(86, 13, 'L'); c.put(87, 13, 'M'); c.put(88, 13, 'R');       // the one-way hop back down
  c.box(86, 14, 88, 15, '.');
  c.blob(78, 6, 14, 4.5, 'm', 3, ['.']);                             // moor turf creeping over the bluff

  // ---------------------------------------------------------------- the Standing Stones: a moss rise, the ring, the barrow mound
  c.blob(28, 20, 15, 11, 'm', 5, ['.']);
  c.blob(14, 26, 4, 2.6, ',', 7, ['.']);
  c.blob(44, 8, 3, 2, ',', 9, ['.']);

  // ---------------------------------------------------------------- the stream and the drovers' ford
  const STREAM = [[144, 60], [134, 60.6], [124, 63], [114, 65.4], [106, 67], [98, 69.6], [90, 73.4], [82, 78.6], [76, 85], [73, 90.5], [72, 96]];
  c.ribbon(STREAM, 5.2, 's', 41, null, 0.6);
  c.ribbon(STREAM, 3, '~', 42, null, 0.5);

  // ---------------------------------------------------------------- lanes (tile-corner coordinates)
  const L = {
    valley: [[144, 21], [138, 20.8], [131, 21.6], [125, 23.6], [119, 26.4], [115, 29.4], [113, 31.4]],
    town: [[144, 43], [138, 42.6], [131, 41], [125, 38.4], [119, 35.4], [115, 32.6], [113, 31.6]],
    thornfold: [[113, 31.4], [106, 31.6], [99, 32.6], [92, 33.6], [84, 34.4], [76, 34.6], [68, 34], [62, 33.2]],
    stones: [[62, 33.2], [56, 32.2], [50, 30], [44, 27], [38.6, 24.4]],
    ridge: [[64.5, 33], [64.6, 26], [64.5, 20], [64.5, 15.6]],
    ridgeTop: [[64.5, 12], [66, 9], [70, 6.6], [74, 4.4], [75.6, 2], [76, 0]],
    patch: [[72, 7], [76, 8.6], [79, 10.4]],
    drovers: [[100, 32.6], [101, 40], [101.4, 48], [102.2, 56], [103.4, 62], [103.6, 68], [102.4, 76], [101, 84], [100.6, 96]],
    oldfold: [[62, 33.2], [58, 37], [52, 42], [46, 46.4], [40, 49.6], [35.4, 52]],
    larch: [[46, 46.4], [44, 54], [40.6, 62], [34, 70], [28, 76], [23, 82], [21, 88], [20.6, 96]],
    pasture: [[120, 25.2], [123, 18], [126, 12], [128, 8.6]],
  };
  for (const [k, pts] of Object.entries(L)) c.ribbon(pts, k === 'drovers' ? 3 : 2, '=', 50 + k.length, ['.', ',', 'm', 's']);
  c.box(102, 63, 105, 72, '-', ['~']);                               // the ford: shallows across the stream on the road
  c.box(101, 63, 106, 72, '-', ['s']);
  c.blob(84, 35.5, 12, 3.2, '=', 24, ['.', ',']);                    // Thornfold's trodden yard
  c.blob(28, 20, 4.5, 3.4, '.', 6, ['m']);                           // the ring's worn heart

  // ---------------------------------------------------------------- drystone walls (ragged on purpose)
  // the sheep fold (gate gap at the north side, x 95..96)
  for (let x = 92; x <= 100; x++) { c.put(x, 38, 'w'); c.put(x, 46, 'w'); }
  for (let y = 38; y <= 46; y++) { c.put(92, y, 'w'); c.put(100, y, 'w'); }
  c.put(95, 38, '.'); c.put(96, 38, '.');
  // the Old Fold: a ruin with gaps (east and south and a broken north wall)
  const OF = { x0: 14, x1: 36, y0: 48, y1: 62 };
  for (let x = OF.x0; x <= OF.x1; x++) { c.put(x, OF.y0, 'w'); c.put(x, OF.y1, 'w'); }
  for (let y = OF.y0; y <= OF.y1; y++) { c.put(OF.x0, y, 'w'); c.put(OF.x1, y, 'w'); }
  for (const [x, y] of [[36, 52], [36, 53], [35, 48], [24, 62], [25, 62], [14, 55], [14, 56], [20, 48], [21, 48], [30, 62]]) c.put(x, y, '.');
  c.box(OF.x0 + 1, OF.y0 + 1, OF.x1 - 1, OF.y1 - 1, ',', ['.']);    // hay grass inside
  // field walls: the pastures, the Thornfold paddocks, the Drovers' Road sunk between walls near the chain
  c.wallRun(104, 15, 143, 15, 'w', 61, 0.18);
  c.wallRun(104, 6, 104, 15, 'w', 62, 0.2);
  c.wallRun(118, 6, 118, 14, 'w', 63, 0.35);
  c.wallRun(66, 40, 80, 40, 'w', 64, 0.25); c.wallRun(66, 40, 66, 47, 'w', 65, 0.25);
  c.wallRun(108, 36, 108, 50, 'w', 66, 0.3);
  c.wallRun(4, 40, 12, 40, 'w', 67, 0.2); c.wallRun(48, 64, 48, 74, 'w', 68, 0.3);
  c.wallRun(120, 74, 140, 74, 'w', 69, 0.3);
  for (let y = 84; y <= 95; y++) { c.put(98, y, 'w'); c.put(102, y, 'w'); }
  for (let x = 1; x <= 72; x++) if ((x < 19 || x > 21) && c.at(x, 93) !== '~') c.put(x, 93, 'w');   // the Larchhill field wall to the stream; the gate fills the gap
  // gentle ledges in the open grass (one-way, south), with ways round each end
  const ledge = (x0, x1, y) => { for (let x = x0; x <= x1; x++) c.put(x, y, x === x0 ? 'L' : x === x1 ? 'R' : 'M'); };
  const ledges = [];
  for (const [x0, x1, y] of [[52, 60, 54], [112, 122, 52], [70, 78, 58], [124, 132, 30]]) {
    let ok = true;
    for (let x = x0; x <= x1; x++) if (!'.,m'.includes(c.at(x, y)) || !'.,m'.includes(c.at(x, y + 1)) || !'.,m'.includes(c.at(x, y - 1))) ok = false;
    if (ok) { ledge(x0, x1, y); ledges.push([x0, x1, y]); }
  }

  // ---------------------------------------------------------------- tall grass drifts, off the lanes and out of the hamlet
  c.drift(',', '.', 0.62, 31, [7, 3]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (c.at(x, y) !== ',') continue;
    const inHamlet = x >= 64 && x <= 104 && y >= 24 && y <= 48;
    const inFold = x > OF.x0 && x < OF.x1 && y > OF.y0 && y < OF.y1;
    if (!inFold && (inHamlet || c.near(x, y, '=', 1))) c.put(x, y, '.');
  }

  for (const s of SECRETS) carveSecret(c, s);
  const ground = c.rows();

  // ---------------------------------------------------------------- overlays
  const overlays = [
    ...scatter(ground, ['.'], ['flowers_white', 'flowers_yellow', 'tuft_0', 'tuft_1', 'pebbles_0', 'flowers_violet', 'leaves'], 0.07, 41),
    ...scatter(ground, [','], ['flowers_yellow', 'flowers_white', 'flowers_pink'], 0.1, 42),
    ...scatter(ground, ['m'], ['tuft_0', 'tuft_1', 'pebbles_1', 'leaves', 'flowers_white'], 0.12, 43),
    ...scatter(ground, ['='], ['pebbles_0', 'pebbles_1', 'pebbles_2'], 0.08, 44),
    ...scatter(ground, ['s'], ['pebbles_0', 'pebbles_1', 'pebbles_2'], 0.25, 45),
    ...scatter(ground, [','], ['ink_puddle_0', 'ink_puddle_1'], 0.06, 46, [OF.x0 + 1, OF.y0 + 1, OF.x1 - 1, OF.y1 - 1]),
  ];

  // ---------------------------------------------------------------- decor
  const d = dresser(c, db, { roadGap: 2 });   // landscape pass: nothing stands within 2 tiles of a lane
  const RING_C = [28, 20];
  const RING = [];
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 6;
    RING.push([Math.round(RING_C[0] + Math.cos(a) * 7.5), Math.round(RING_C[1] + Math.sin(a) * 5.6)]);
  }
  d.reserve(18, 12, 38, 28);                                // the ring
  d.reserve(60, 0, 99, 16);                                 // the Ridge top (hand dressed)
  d.reserve(64, 22, 106, 48);                               // Thornfold
  d.reserve(105, 24, 120, 38);                              // the signpost
  d.reserve(OF.x0, OF.y0, OF.x1, OF.y1);
  d.reserve(96, 82, 104, 95); d.reserve(14, 86, 28, 95);    // the two closed roads
  d.reserve(136, 18, 143, 24); d.reserve(136, 40, 143, 45); // the east lanes' mouths
  // the landing strip under every one-way ledge stays clear: a bush or rock there made a one-cell pit you hop into and
  // can never leave (PLAYTEST_BOT bug 2, (114, 53))
  for (const [x0, x1, y] of ledges) d.reserve(x0 - 1, y + 1, x1 + 1, y + 2);
  const open = [];
  for (const s of SECRETS) open.push(...dressSecret(d, s, db));
  RING.forEach(([x, y], i) => d.add(i % 3 === 1 ? 'x1_menhir_b' : 'x1_menhir_a', x, y));
  d.add('x1_cairn_moor', RING_C[0], RING_C[1] - 1);
  d.add('x1_blank_slab', 40, 14);                           // the thirteenth stone, apart
  d.add('x1_barrow_door_closed', 26, 7);                    // the mound under the cliff; doorway (28, 7) sealed
  // Thornfold
  d.add('x1_loomhouse', 75, 32);                            // door (78, 32)
  d.add('x1_cottage_a', 66, 31); d.add('x1_cottage_b', 86, 31); d.add('x1_cottage_a', 70, 44); d.add('x1_cottage_b', 84, 46);
  d.add('crate', 67, 31); d.add('barrel', 87, 31); d.add('barrel', 71, 44); d.add('crate', 85, 46);
  d.add('well', 82, 37);
  d.add('x1_haystack_a', 90, 30); d.add('x1_haystack_b', 72, 38); d.add('x1_haybale', 89, 36); d.add('x1_haybale', 74, 38);
  d.add('x1_trough', 97, 42); d.add('x1_trough_dry', 79, 41);
  d.add('bench', 80, 36); d.add('crates_barrels', 92, 35);
  d.add('signboard', 99, 35);                               // the hamlet board
  d.add('tree_willow', 62, 38); d.add('tree_willow', 102, 28);
  // the gate lanes: the signpost
  d.add('signpost_arrow', 112, 29);
  d.add('signboard', 141, 19); d.add('signboard', 141, 40);
  // the Ridge: Patch and a few gorse
  d.add('x1_scarecrow', 79, 9);
  for (const [x, y] of [[61, 4], [66, 3], [70, 9], [84, 4], [90, 7], [94, 3], [92, 10], [61, 9], [96, 9]]) d.try('x1_gorse_a', x, y);
  for (const [x, y] of [[68, 11], [88, 2], [82, 11]]) d.try('x1_boulder_a', x, y);
  d.add('signboard', 73, 2);                                // the moor sign at the gap
  // the Old Fold: hay, a trough, a hawthorn
  d.add('x1_haystack_b', 28, 55); d.add('x1_haystack_a', 19, 52); d.add('x1_haybale', 23, 58); d.add('x1_haybale', 31, 51);
  d.add('x1_trough_dry', 17, 59); d.add('tree_willow', 32, 57);
  // the closed roads
  d.add('x1_drovers_chain', 99, 92);
  d.add('signboard', 103, 90);
  d.add('x1_chain_gate', 19, 93);
  d.add('signboard', 23, 92);

  const LANTERNS = [
    { id: 'downs_signpost', name: 'The Signpost', x: 110, y: 30, post: [110, 29] },
    { id: 'thornfold_hearth', name: 'Thornfold Hearth', x: 78, y: 34, post: [80, 33] },
    { id: 'standing_stones', name: 'The Standing Stones', x: 40, y: 27, post: [41, 26] },
    { id: 'drovers_ford', name: "Drovers' Ford", x: 99, y: 58, post: [98, 57] },
  ];
  for (const l of LANTERNS) d.add('lamp_post', l.post[0], l.post[1], { state: 1 });

  // ---------------------------------------------------------------- the zone table
  const areas = [
    { id: 'gate_lanes', name: 'The Gate Lanes', x: 112, y: 16, w: 32, h: 32, levels: [5, 5] },
    { id: 'thornfold', name: 'Thornfold', x: 64, y: 20, w: 42, h: 28, safe: true },
    { id: 'fold_pastures', name: 'The Fold Pastures', x: 104, y: 0, w: 40, h: 16, levels: [6, 7] },
    { id: 'the_ridge', name: 'The Ridge', x: 56, y: 0, w: 44, h: 18, levels: [8, 8] },
    { id: 'standing_stones', name: 'The Standing Stones', x: 6, y: 4, w: 46, h: 34, levels: [8, 9] },
    { id: 'old_fold', name: 'The Old Fold', x: 6, y: 42, w: 48, h: 26, levels: [6, 7] },
    { id: 'drovers_ford', name: "Drovers' Ford", x: 86, y: 50, w: 52, h: 32, levels: [7, 8] },
    { id: 'larchhill_road', name: 'The Larchhill Road', x: 6, y: 70, w: 40, h: 26 },
  ];
  const spawns = [];
  const camp = (mob, level, pts, group, extra = {}) => pts.forEach(([x, y], i) => spawns.push({ mob, level: Array.isArray(level) ? level[i % level.length] : level, x, y, wander: 3, respawn: 90, group, ...extra }));
  // the fold pastures: rams grazing (passive)
  camp('fold_ram', [6, 7, 6], [[108, 9], [112, 12], [115, 7]], 'pa_rams_a');
  camp('fold_ram', [7, 6, 7], [[122, 9], [126, 12], [129, 6]], 'pa_rams_b');
  camp('fold_ram', [6, 7, 6, 7], [[134, 10], [138, 7], [140, 12], [131, 13]], 'pa_rams_c');
  camp('fold_ram', [6, 6], [[46, 44], [50, 48]], 'of_rams');
  // the Old Fold: scarabs and ink blots in the hay
  camp('moss_scarab', [6, 7, 6], [[18, 51], [26, 50], [33, 59]], 'of_scarabs_a');
  camp('moss_scarab', [7, 6, 7], [[10, 46], [40, 58], [12, 64]], 'of_scarabs_b');
  camp('ink_blot', 7, [[21, 55], [26, 57], [30, 53], [17, 57], [33, 55], [24, 52], [28, 60]], 'of_blots', { wander: 1 });
  // Drovers' Ford: thornback packs of three
  camp('thornback_wolf', [7, 7, 8], [[92, 56], [93, 57], [91, 57]], 'df_pack_a');
  camp('thornback_wolf', [7, 8, 7], [[114, 58], [115, 59], [113, 59]], 'df_pack_b');
  camp('thornback_wolf', [8, 7, 8], [[118, 72], [119, 73], [117, 73]], 'df_pack_c');
  camp('thornback_wolf', [7, 8, 8], [[92, 78], [93, 79], [91, 79]], 'df_pack_d');
  camp('thornback_wolf', [8, 7, 7], [[130, 66], [131, 67], [129, 67]], 'df_pack_e');
  // the Ridge: gorse crows round Patch
  camp('gorse_crow', 8, [[74, 8], [82, 7], [77, 4], [84, 10], [72, 11], [80, 12], [86, 6], [70, 5]], 'rg_crows', { wander: 2, respawn: 60 });
  // the Standing Stones: barrow shades walk the ring (two more at night)
  camp('barrow_shade', [8, 9, 8, 9, 8, 9, 8], [[22, 15], [34, 15], [36, 22], [20, 24], [28, 28], [14, 18], [42, 20]], 'ss_shades');
  camp('barrow_shade', [9, 9], [[25, 19], [31, 21]], 'ss_shades_night', { night: true });

  const npcs = [
    { npc: 'brindle', x: 95, y: 37, dir: 'up' },
    { npc: 'tamsin', x: 77, y: 33, dir: 'down' },
  ];
  const nodes = [];
  [[18, 54], [22, 50], [27, 53], [32, 56], [20, 59], [29, 59], [34, 50], [16, 50]].forEach(([x, y], i) => nodes.push({ id: `hay_${i + 1}`, item: 'ink_soaked_hay', x, y, respawn: 30, name: 'Ink-Soaked Hay', sprite: 'x1_haybale' }));
  RING.forEach(([x, y], i) => nodes.push({ id: `stone_${i + 1}`, item: 'stone_rubbing', x, y: y + 1, respawn: 30, name: 'Standing Stone', channel: 3, perPlayer: true, at: [x, y] }));

  // clearings round every camp and node, then the hawthorn stands, pines on the cliff tops, boulders
  for (const p of [...spawns, ...nodes, ...npcs]) d.reserve(p.x - 2, p.y - 2, p.x + 2, p.y + 3);   // landscape pass: wider clearings, deeper south
  for (let x = 1; x < W - 1; x++) {
    if (x >= 56 && x <= 99) continue;
    if (hash01(x, 1, 51) < 0.4) d.try('tree_pine', x, Math.floor(hash01(x, 2, 52) * 3));
  }
  for (let y = 5; y < H; y++) for (let x = 0; x < W; x++) {
    // landscape pass 2026-11-20: fewer, smaller hawthorn stands and almost no lone bushes in the open grass
    const stand = vnoise(x, y, 6, 53);
    let p = stand > 0.78 ? 0.24 : 0.004;
    if (x <= 1 || x >= W - 2 || y >= H - 2) p = Math.max(p, 0.45);
    const r = hash01(x, y, 54);
    if (r < p) d.try(r < p * 0.12 ? 'x1_boulder_a' : r < p * 0.3 ? 'tree_pine' : 'bush', x, y);
  }
  for (const [x, y] of [[8, 44], [10, 45], [44, 60], [46, 62], [56, 24], [58, 22], [126, 46], [128, 48], [134, 28], [136, 30], [52, 70], [56, 72], [120, 84], [122, 86], [86, 88], [130, 90]]) d.try('bush', x, y);

  const signs = [
    { id: 'downs_signpost', x: 112, y: 29, text: 'WEST: THORNFOLD. NORTH-WEST: THE STONES. SOUTH: DROVERS\' ROAD.' },
    { id: 'thornfold_board', x: 99, y: 35, text: 'THORNFOLD. Twelve in the fold. Wool cart Fridays. Do not feed the rams your hat.' },
    { id: 'valley_lane', x: 141, y: 19, text: 'EAST: WILLOWMERE VALLEY.' },
    { id: 'town_lane', x: 141, y: 40, text: 'EAST: WILLOWMERE, BY ORCHARD LANE.' },
    { id: 'moor_sign', x: 73, y: 2, text: 'NORTH: THE HIGH MOOR. FOLLOW THE CHIME POSTS.' },
    { id: 'drovers_chain', x: 103, y: 90, text: 'ROAD CLOSED. THE WEIR BROKE AND NOBODY CAME. - F.', hook: 'x1_millrace' },
    { id: 'larchhill_gate', x: 23, y: 92, text: 'LARCHHILL. MIND THE BEES.', hook: 'x1_larchhill' },
    { id: 'blank_slab', x: 40, y: 14, text: 'A pale slab, apart from the ring. No name on it at all.' },
    { id: 'barrow_door', x: 28, y: 7, text: 'A turf mound with a doorway sealed by a blank stone. From under it, very faintly, something is counting.' },
  ];
  const hooks = [
    { id: 'x1_millrace', to: 'x1_millrace', x: 100, y: 90, text: "Ferrick's chain is across the Drovers' Road. The road beyond is closed." },
    { id: 'x1_larchhill', to: 'x1_larchhill', x: 20, y: 92, text: 'The Larchhill gate is shut. Somewhere past it, bees.' },
    { id: 'x1_barrow', to: 'x1_barrow', x: 28, y: 8, text: 'The barrow door is sealed.' },
  ];
  const joins = [
    { x: 143, y: 20, w: 1, h: 2, to: 'valley', tx: 1, ty: 18, dir: 'right' },
    { x: 143, y: 42, w: 1, h: 2, to: 'willowmere', tx: 1, ty: 16, dir: 'right' },
    { x: 74, y: 0, w: 4, h: 1, to: 'moor', tx: 78, ty: 97, dir: 'up' },
    { x: 99, y: 95, w: 3, h: 1, to: 'x1_millrace', tx: 4, ty: 1, dir: 'down' },
    { x: 19, y: 95, w: 3, h: 1, to: 'x1_larchhill', tx: 31, ty: 1, dir: 'down' },
  ];

  return {
    map: {
      id: 'downs', name: "Shepherd's Downs", kind: 'field', w: W, h: H, music: 'the_downs', lighting: { tint: 'none', dark: 0 },
      under: 'grass',
      legend: { '.': 'grass', ',': 'tallgrass', '=': 'dirt', m: 'x1_moor_turf', w: 'x1_drystone', s: 'sand', '~': 'water', '-': 'shallow',
        '^': 'cliff_top', '|': 'cliff_face', S: 'cliff_stairs_top', t: 'cliff_stairs_mid', z: 'cliff_stairs_bot', L: 'ledge_s_a', M: 'ledge_s_m', R: 'ledge_s_b' },
      ground, overlays, decor: d.decor, open,
      // the Watchtower on the north skyline above the Ridge gap; the Windmill a speck to the south-west
      overhead: [{ t: 'x1_far_tower', x: 80, y: -3 }, { t: 'x1_far_windmill', x: 4, y: 84 }],
      solids: [],
    },
    realm: { levels: [5, 10], arrival: [141, 42], areas, lanterns: LANTERNS, spawns, npcs, nodes, signs, hooks, joins, secrets: SECRETS.map(secretEntry) },
  };
}

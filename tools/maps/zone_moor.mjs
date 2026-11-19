// The High Moor, grown to 160 x 100 from Lexicon Quest's 72 x 36 `x1_highmoor` (docs/design/ZONES_QUESTS.md 4).
// "A wide heath under a bigger sky than the valley's: gorse, heather, grey rock, a black tarn, and on the skyline, the
// broken Watchtower." LQ's three ways across are kept: the Chime Road west round the tarn and back east along the north
// (nine chime posts, about fifty paces apart), the Ridgeline over the hump (one-way ledge drops), and the Hidden Fold
// across the tarn, which in phase 1 is only water with a faint ink path to the islet (an Episode 1 tease, no access).
//
// Closed hook: the stile to the Keepers' Terrace, choked with roots. The Orrery's dome shows over the north-east rim.
import { Canvas, scatter, hash01, vnoise, dresser } from './kit.mjs';

export const W = 160, H = 100;

export function build(db) {
  const c = new Canvas(W, H, '.');

  // ---------------------------------------------------------------- heath, bracken, peat: cool and sparse
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = 0.7 * vnoise(x, y, 11, 11) + 0.25 * vnoise(x, y, 4, 13) + 0.05 * hash01(x, y, 12);
    const m = 0.7 * vnoise(x + 40, y + 9, 12, 21) + 0.3 * vnoise(x, y, 5, 22);
    if (n > 0.64) c.put(x, y, ',');
    else if (m > 0.7) c.put(x, y, 'b');
  }

  // ---------------------------------------------------------------- crag: the north rim, the east rim, the south rim with the arrival gap, masses
  for (let x = 0; x < W; x++) {
    const d = vnoise(x, 0, 6, 31) > 0.55 ? 1 : 0;
    c.box(x, 0, x, 1 + d, '^'); c.box(x, 2 + d, x, 3 + d, '|');
  }
  for (let y = 0; y < H; y++) {
    const d = vnoise(0, y, 6, 32) > 0.5 ? 1 : 0;
    c.box(0, y, 1 + d, y, '^');
    c.box(W - 2 - d, y, W - 1, y, '^');
  }
  for (let x = 0; x < W; x++) {
    if (x >= 74 && x <= 81) continue;                                   // the Ridge Path comes up through the gap
    const d = vnoise(x, 99, 5, 33) > 0.5 ? 1 : 0;
    c.box(x, 98 - d, x, 99, '^');
  }
  const crag = (cx, cy, rx, ry, seed) => {
    c.blob(cx, cy, rx, ry, '^', seed);
    // a face under every top cell whose south neighbour is not crag: two rows deep
    for (let y = H - 3; y >= 0; y--) for (let x = 0; x < W; x++) {
      if (c.at(x, y) === '^' && c.at(x, y + 1) !== '^' && c.at(x, y + 1) !== '|' && Math.hypot((x - cx) / (rx + 3), (y - cy) / (ry + 3)) < 1.3) {
        c.put(x, y + 1, '|'); if (c.at(x, y + 2) !== '^') c.put(x, y + 2, '|');
      }
    }
  };
  // the mass the tower stands against, west crags, the Ridgeline hump (with ledge drops), the south-west crags
  crag(118, 2, 18, 2.2, 1);
  crag(8, 84, 6, 5, 2); crag(30, 92, 9, 3.4, 3); crag(124, 92, 14, 3.4, 4); crag(150, 70, 4, 6, 5);
  crag(108, 34, 9, 3.2, 6); crag(126, 30, 6, 2.6, 7);
  crag(6, 8, 4, 3, 8);

  // ---------------------------------------------------------------- the tarn, its peat banks, the islet, the faint ink path
  c.blob(50, 38, 34, 8.6, 'p', 11, ['.', ',', 'b']);
  c.blob(50, 38, 31, 7.2, 'T', 12, ['.', ',', 'b', 'p']);
  c.blob(30, 40, 9, 5, 'T', 13, ['.', ',', 'b', 'p']);
  c.blob(52, 37, 3.4, 1.8, 'p', 14, ['T']);                             // the islet
  for (let x = 30; x <= 33; x++) for (let y = 31; y <= 32; y++) c.put(x, y, 'T');

  // ---------------------------------------------------------------- roads (tile-corner coordinates)
  const CHIME = [[78, 98], [77.6, 92], [75, 87.4], [68, 83], [58, 78.6], [48, 74.4], [40, 70.4], [32, 65], [24, 58.6], [18, 52],
    [14.6, 44], [13.6, 36], [14.4, 28], [17.4, 21], [22, 15], [30, 11.4], [40, 9.6], [50, 9], [60, 9.4], [70, 10.6], [80, 11.4],
    [90, 12], [98, 12.4], [106, 11.6], [114, 10.4], [122, 10.4], [130, 11], [138, 12.8], [146, 14.4], [152, 15.4]];
  c.ribbon(CHIME, 2, '=', 41, ['.', ',', 'b', 'p']);
  const RIDGELINE = [[80, 88], [86, 82], [92, 74], [98, 64], [102, 56], [104, 48], [104, 40], [102, 31], [100, 24], [100, 17], [100, 12.4]];
  c.ribbon(RIDGELINE, 2, '=', 42, ['.', ',', 'b', 'p']);
  c.ribbon([[100.6, 52], [94, 54], [86, 56], [78, 57]], 2, '=', 43, ['.', ',', 'b', 'p']);        // the spur to the overlook
  c.ribbon([[104, 48], [112, 50], [122, 54], [132, 58], [142, 62]], 2, '=', 44, ['.', ',', 'b', 'p']);   // the heath track
  c.ribbon([[100, 26], [108, 24.6], [116, 23.6], [124, 24.4]], 1, '=', 45, ['.', ',', 'b', 'p']);      // the view point path
  c.blob(118, 9, 9, 2.6, '=', 46, ['.', ',', 'b', 'p']);                                               // the tower yard
  c.blob(106, 20.6, 4.4, 2, '=', 47, ['.', ',', 'b', 'p']);                                             // Odo's doorstep
  c.blob(78, 91, 5, 3, '=', 48, ['.', ',', 'b', 'p']);                                                  // the Ridge Path landing
  c.blob(76, 56, 5, 3, '=', 49, ['.', ',', 'b', 'p']);                                                  // the overlook
  // peat cuttings at the overlook: dark peat in rows
  for (let y = 59; y <= 63; y += 2) for (let x = 80; x <= 88; x++) if (hash01(x, y, 50) < 0.9 && '.,b'.includes(c.at(x, y))) c.put(x, y, 'p');
  // the Ridgeline's one-way drops (south, down only) across the hump, with the road crossing at the ledge
  for (const [x0, x1, y] of [[96, 112, 39], [114, 130, 33]]) for (let x = x0; x <= x1; x++) if (c.at(x, y) !== '^' && c.at(x, y) !== '|') c.put(x, y, x === x0 ? 'L' : x === x1 ? 'R' : 'M');

  const ground = c.rows();

  // ---------------------------------------------------------------- overlays
  const overlays = [
    ...scatter(ground, ['.'], ['tuft_0', 'tuft_1', 'pebbles_0', 'pebbles_1', 'flowers_violet', 'flowers_white'], 0.06, 81),
    ...scatter(ground, [','], ['flowers_violet', 'flowers_pink'], 0.08, 82),
    ...scatter(ground, ['b'], ['tuft_0', 'leaves'], 0.08, 83),
    ...scatter(ground, ['p'], ['pebbles_2', 'tuft_0'], 0.1, 84),
    ...scatter(ground, ['='], ['pebbles_0', 'pebbles_1', 'pebbles_2'], 0.08, 85),
    // the faint ink path across the tarn to the islet (Episode 1: the Lantern shows it; here it only glints)
    ...[46, 47, 48, 49].map((x) => ({ t: 'ink_bridge_h_faint', x, y: 44 })),
    ...[[49, 43], [49, 42], [50, 41], [50, 40], [51, 39]].map(([x, y]) => ({ t: 'ink_bridge_v_faint', x, y })),
  ].filter((o) => !(o.t.startsWith('ink_bridge') ? false : ground[o.y][o.x] === 'T'));

  // ---------------------------------------------------------------- decor
  const d = dresser(c, db, { soft: '.,bp' });
  d.reserve(104, 2, 134, 14);           // the tower yard
  d.reserve(98, 15, 114, 24);           // Odo's hut
  d.reserve(64, 46, 94, 66);            // the overlook
  d.reserve(66, 80, 92, 99);            // the Ridge Path
  d.reserve(144, 10, 159, 22);          // the stile
  d.add('x1_watchtower', 116, 6);       // foot (116..119, 5..6); the elite stands at (118, 8)
  d.add('x1_turf_hut', 103, 19);        // door (104, 19)
  d.add('x1_hearth', 110, 21);
  // chime posts (nine, fifty paces apart along the Chime Road)
  const POSTS = [[73, 86], [42, 73], [21, 56], [12, 33], [21, 16], [44, 7], [66, 8], [108, 9], [128, 8]];
  POSTS.forEach(([x, y], i) => d.add(`x1_chimepost_${i + 1}`, x, y));
  d.add('signboard', 82, 93);           // the moor sign at the arrival
  d.add('x1_roots_stile', 152, 15);     // the stile, choked with roots
  for (let y = 9; y <= 22; y++) if (y < 15 || y > 15) { d.add('x1_boulder_a', 153 + (y % 2), y); }
  d.add('signboard', 149, 17);
  d.add('x1_cairn_moor', 125, 23);      // the view point
  d.add('bench', 72, 54);               // the overlook bench
  d.add('x1_haystack_a', 86, 57);       // Sorrel's turf stack
  d.add('x1_haybale', 84, 57); d.add('x1_sack_stack', 89, 58);
  for (const [x, y] of [[96, 70], [110, 62], [136, 52], [142, 74], [118, 80], [60, 92], [40, 84]]) d.try('x1_cairn_moor', x, y);

  const LANTERNS = [
    { id: 'ridge_path', name: 'The Ridge Path', x: 80, y: 92, post: [81, 91] },
    { id: 'tarn_overlook', name: 'The Tarn Overlook', x: 76, y: 56, post: [77, 55] },
    { id: 'odos_hut', name: "Odo's Hut", x: 107, y: 21, post: [108, 20] },
    { id: 'chime_road_west', name: 'The Chime Road', x: 16, y: 46, post: [15, 46] },
  ];
  for (const l of LANTERNS) d.add('lamp_post', l.post[0], l.post[1], { state: 1 });

  // ---------------------------------------------------------------- the zone table
  const areas = [
    { id: 'ridge_path', name: 'The Ridge Path', x: 60, y: 78, w: 40, h: 22, levels: [10, 10], safe: true },
    { id: 'chime_road_south', name: 'The Chime Road', x: 4, y: 44, w: 56, h: 36, levels: [10, 11] },
    { id: 'chime_road_north', name: 'The Chime Road', x: 4, y: 0, w: 60, h: 30, levels: [11, 12] },
    { id: 'tarn_overlook', name: 'The Tarn Overlook', x: 64, y: 46, w: 30, h: 22, safe: true },
    { id: 'the_tarn', name: 'The Tarn', x: 16, y: 30, w: 72, h: 18 },
    { id: 'tarn_north_shore', name: "The Tarn's North Shore", x: 24, y: 18, w: 50, h: 12, levels: [12, 13] },
    { id: 'ridgeline', name: 'The Ridgeline', x: 90, y: 24, w: 40, h: 22, levels: [13, 13] },
    { id: 'gorse_heath', name: 'The Gorse Heath', x: 100, y: 46, w: 56, h: 40, levels: [11, 12] },
    { id: 'watchtower', name: 'The Watchtower', x: 96, y: 0, w: 44, h: 16, levels: [13, 14] },
    { id: 'odos_hut', name: "Odo's Hut", x: 98, y: 16, w: 16, h: 8, safe: true },
    { id: 'the_stile', name: 'The Stile', x: 146, y: 10, w: 14, h: 12 },
  ];
  POSTS.forEach(([x, y], i) => areas.push({ id: `chime_post_${i + 1}`, name: `Chime Post ${i + 1}`, x: x - 2, y: y - 1, w: 5, h: 4, banner: false }));

  const spawns = [];
  const camp = (mob, level, pts, group, extra = {}) => pts.forEach(([x, y], i) => spawns.push({ mob, level: Array.isArray(level) ? level[i % level.length] : level, x, y, wander: 3, respawn: 90, group, ...extra }));
  // the Chime Road south: mist wolf pairs beside the road
  camp('mist_wolf', [10, 10], [[50, 70], [51, 71]], 'cs_wolves_a');
  camp('mist_wolf', [10, 11], [[30, 66], [31, 67]], 'cs_wolves_b');
  camp('mist_wolf', [10, 11], [[22, 50], [23, 51]], 'cs_wolves_c');
  camp('mist_wolf', [11, 10], [[60, 84], [61, 83]], 'cs_wolves_d');
  // the Chime Road north: packs of three
  // fix pass 1 (bug 7 rule: no foe more than one over its quest's level): the chime road packs that Fifty Paces (10) and
  // the Mist Pack (11) send you past are 10 to 11, not 11 to 12
  camp('mist_wolf', [10, 11, 10], [[18, 38], [19, 39], [17, 39]], 'cn_pack_a');
  camp('mist_wolf', [11, 10, 11], [[26, 22], [27, 23], [25, 23]], 'cn_pack_b');
  camp('mist_wolf', [11, 11, 10], [[52, 13], [53, 14], [51, 14]], 'cn_pack_c');
  // the tarn's north shore: page wraiths over the reeds
  // fix pass 1: the east-most wraith (70, 24) sat on the way back from the chime posts to Odo's hut; it reads the shore further west
  camp('page_wraith', [12, 13, 12, 13, 12, 13, 12, 13], [[30, 26], [38, 24], [46, 27], [54, 25], [62, 27], [34, 20], [42, 21], [58, 21]], 'ns_wraiths');
  // the gorse heath: boars and scarabs
  camp('gorse_boar', [11, 12, 11], [[112, 56], [120, 62], [128, 52]], 'gh_boars_a');
  camp('gorse_boar', [12, 11, 12], [[138, 66], [132, 76], [116, 72]], 'gh_boars_b');
  camp('gorse_boar', [11, 12], [[146, 56], [106, 64]], 'gh_boars_c');
  camp('moss_scarab', 11, [[124, 66], [140, 80], [110, 78], [148, 48]], 'gh_scarabs');
  // the Ridgeline: ink wraiths
  // fix pass 1 (PLAYTEST_BOT bug 13, critique 17): the Ridgeline wraiths sit 14+ tiles from Odo's hut, leaving a lane west
  // of the Ridgeline (x 84 to 90) and along row 20 to the hut with no foe above level 10 within 8 tiles
  camp('ink_wraith', 13, [[117, 31], [124, 36], [128, 42], [118, 44], [127, 28]], 'rl_wraiths');   // east of the natural line Ridge Path -> hut
  // the Watchtower: sentinels on their rounds, the elite and its two lamps
  // fix pass 1 (critique 17): sentinel rounds start 16+ tiles from Odo's hut (they wander 4), and none stands within
  // 8 tiles of the elite, so its pull is the elite and its own two lamps, the fight you chose
  camp('tower_sentinel', [13, 14, 13], [[98, 4], [112, 3], [130, 13]], 'wt_sentinels_a');
  camp('tower_sentinel', [14, 13, 14], [[136, 8], [92, 4], [134, 3]], 'wt_sentinels_b');
  camp('ink_wraith', 13, [[88, 6], [140, 13]], 'wt_wraiths');
  spawns.push({ mob: 'sentinel_long_watch', level: 14, x: 118, y: 8, wander: 0, respawn: 360, group: 'wt_elite', leash: 16 });
  spawns.push({ mob: 'watch_lamp', level: 13, x: 114, y: 8, wander: 0, respawn: 360, group: 'wt_elite' });
  spawns.push({ mob: 'watch_lamp', level: 13, x: 122, y: 8, wander: 0, respawn: 360, group: 'wt_elite' });

  const npcs = [
    { npc: 'odo', x: 106, y: 21, dir: 'down' },
    { npc: 'sorrel', x: 82, y: 58, dir: 'left' },
  ];
  const nodes = [];

  // clearings round camps, then gorse, boulders and the odd wind-bent pine
  for (const p of [...spawns, ...npcs]) d.reserve(p.x - 1, p.y - 1, p.x + 1, p.y + 1);
  for (let y = 4; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const heath = x >= 100 && y >= 44;
    const stand = vnoise(x, y, 5, 61);
    let p = heath ? (stand > 0.6 ? 0.22 : 0.03) : (stand > 0.74 ? 0.14 : 0.008);
    const r = hash01(x, y, 62);
    if (r < p) d.try(r < p * 0.3 ? 'x1_boulder_a' : r < p * 0.38 ? 'tree_pine' : (r < p * 0.7 ? 'x1_gorse_a' : 'x1_gorse_b'), x, y);
  }
  for (let x = 2; x < W - 2; x++) if (hash01(x, 0, 63) < 0.25) d.try('tree_pine', x, Math.floor(hash01(x, 1, 64) * 2));

  const signs = [
    { id: 'moor_sign', x: 82, y: 93, text: 'THE HIGH MOOR. CHIME POSTS EVERY FIFTY PACES. FOLLOW THEM OR DO NOT.' },
    { id: 'stile_sign', x: 149, y: 17, text: "THE KEEPERS' STILE. Roots have grown through it, thick as wrists. Nobody has climbed it in a long time.", hook: 'x1_terrace' },
    { id: 'view_point', x: 125, y: 23, text: 'From here: the Downs, the valley, the river. Far east, past the river, a town. You cannot read its name, however long you look.' },
    ...POSTS.map(([x, y], i) => ({ id: `chime_post_${i + 1}`, x, y, text: i === 8 ? 'The ninth chime post. One word cut into it: KEPT. No chime hangs from it.' : `Chime post ${i + 1}. A word is cut into the post, and the chime says it back in the wind.` })),
  ];
  const hooks = [
    { id: 'x1_terrace', to: 'x1_terrace', x: 150, y: 15, text: "The stile is choked with roots. The Keepers' Terrace lies beyond, out of reach." },
    { id: 'the_islet', to: null, x: 50, y: 46, text: 'A faint ink path glints across the black water to the islet. It will not take your weight.' },
  ];
  const joins = [
    { x: 74, y: 99, w: 8, h: 1, to: 'downs', tx: 75, ty: 1, dir: 'down' },
    { x: 159, y: 14, w: 1, h: 3, to: 'x1_terrace', tx: 1, ty: 10, dir: 'right' },
  ];
  // the elite's ring (Odo rings the eighth post): the fight script reads these spots
  const script = { long_watch: { elite: [118, 8], odo_post: POSTS[7], adds_from: [118, 5], lamps: [[114, 8], [122, 8]], leash: 16 } };

  return {
    map: {
      id: 'moor', name: 'The High Moor', kind: 'field', w: W, h: H, music: 'high_moor', lighting: { tint: 'none', dark: 0 },
      under: 'x1_moor_turf',
      legend: { '.': 'x1_moor_turf', ',': 'x1_heath', b: 'x1_bracken', p: 'x1_peat', '=': 'dirt', T: 'x1_tarn',
        '^': 'x1_crag_top', '|': 'x1_crag_face', L: 'ledge_s_a', M: 'ledge_s_m', R: 'ledge_s_b' },
      ground, overlays, decor: d.decor,
      overhead: [{ t: 'x1_far_dome', x: 148, y: -2 }],
      solids: [],
    },
    realm: { levels: [10, 15], arrival: [78, 96], areas, lanterns: LANTERNS, spawns, npcs, nodes, signs, hooks, joins, script },
  };
}

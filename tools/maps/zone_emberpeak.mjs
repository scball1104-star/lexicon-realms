// Emberpeak (wave 3 start realms, 2026-11-22; WORLD_2.md 1.1, D:/LQOnline/world3/BRIEF.md): the Warden's start realm,
// levels 1 to 6. A forge town cut into a black mountain: Bellows Square and its smithies in the middle, rivers of lava
// between the roads, the Ember Gate across the only pass east, the Ashen Foundry beyond it where Brask the Bellowsman
// woke the furnace golems. Its own outdoor zone, 576 x 384 tiles, reached by a ride: the ore cart line runs from the
// cart station south of the square down the mountain to Willowmere (src/data/emberpeak.js EP_RIDES), the Lantern Kite
// flies in from level 6.
//
// The signature (src/sim/realm_mech.js): the lava crossings. Three roads cross lava; their crossing cells ('c') crust
// black and glow on a 40 second cycle (zone.lava), and standing on a glowing crossing burns. Hold the Gate: the wave
// raiders camp outside the Gate hidden until a hero on the quest steps up to it (zone.gate).
//
// Built with the big-zone kit (bigzone_kit.mjs) like the Rootbound: halls and passages carve the floor, roads and the
// lava run along it, the mountain fills the rest. Pockets stamped by hand below. Deterministic.
import { bigZone, curve } from './bigzone_kit.mjs';
import { hash01, vnoise } from './kit.mjs';

export const W = 576, H = 384;
// pocket centres (tiles)
export const P = {
  square: [300, 202], switchbacks: [150, 72], top: [96, 26], slopes: [338, 84], quench: [128, 262], slag: [300, 326],
  gatefield: [444, 202], works: [486, 150], yard: [516, 258], station: [384, 272], lookout: [430, 96],
  barrens: [150, 170], highforge: [500, 56], mine: [66, 148], ridge: [270, 34],
};
// where the ore cart leaves (tiles, on the rail just south of the station) and the end of the line at the zone edge
export const CART = { station: [384, 276], edge: [396, 383] };

export function build(db) {
  const LEG = { '.': 'x1_peat', ':': 'dirt', ',': 'x1_bracken', '=': 'plaza', 'o': 'plaza', '~': 'ink', 'c': 'x1_crag_top', 'r': 'cliff_stairs_mid' };
  const k = bigZone(W, H, { legend: LEG, floor: '.', seed: 20261123, db });

  // ---- halls (the floor)
  k.hall(...P.square, 48, 30, 3);
  k.hall(...P.switchbacks, 58, 36, 4);
  k.hall(...P.top, 34, 20, 5);
  k.hall(...P.slopes, 62, 36, 6);
  k.hall(...P.quench, 52, 38, 7);
  k.hall(...P.slag, 56, 34, 8);
  k.hall(...P.gatefield, 26, 22, 9);
  k.hall(...P.works, 48, 34, 10);
  k.hall(...P.yard, 46, 36, 11);
  k.hall(...P.station, 18, 12, 12);
  k.hall(...P.lookout, 32, 20, 13);
  // open ash country between the pockets (quiet stretches with a camp or a landmark; the brief's 40% walkable)
  k.hall(...P.barrens, 52, 40, 14);
  k.hall(...P.highforge, 44, 24, 16);
  k.hall(...P.mine, 30, 26, 17);
  k.hall(...P.ridge, 40, 22, 18);
  // ---- passages (mountain roads, about 14 tiles wide)
  const ways = [
    [P.top, [124, 44], P.switchbacks],
    [P.switchbacks, [200, 100], [240, 140], [272, 180], P.square],
    [P.square, [318, 150], [326, 118], P.slopes],
    [P.slopes, [388, 92], P.lookout],
    [P.square, [262, 222], [214, 246], [170, 256], P.quench],
    [P.square, [300, 250], [300, 290], P.slag],
    [P.square, [350, 202], [400, 202], P.gatefield],
    [P.gatefield, [468, 176], P.works],
    [P.gatefield, [478, 226], P.yard],
    [P.square, [336, 228], [366, 256], P.station],
    [P.switchbacks, [160, 130], P.barrens],
    [P.barrens, [110, 176], P.mine],
    [P.lookout, [456, 74], P.highforge],
    [P.slopes, [300, 40], P.ridge],
  ];
  for (const w of ways) k.passage(w, 14);
  // the rail bed down the mountain: narrow, along the cart line to the bottom edge (the ride's road, no foes on it)
  k.passage([P.station, [388, 300], [392, 340], CART.edge], 6);
  // the pass through the Ember Gate is narrow: a bottleneck the Watch can hold
  k.passage([[392, 202], [416, 202]], 8);

  // ---- ground: ash drifts and cinder patches on the dark basalt
  k.paint((x, y, ch, fl) => {
    if (!fl) return null;
    if (vnoise(x, y, 15, 3) > 0.64) return ':';
    if (vnoise(x, y, 10, 9) > 0.72) return ',';
    return null;
  });
  const T = { x0: 274, y0: 186, x1: 328, y1: 218 };
  k.paint((x, y, ch, fl) => (fl && x >= T.x0 && x <= T.x1 && y >= T.y0 && y <= T.y1 ? 'o' : null));

  // ---- roads
  const road = (pts) => k.road(pts, { ch: '=', verge: 1 });
  road([P.top, [124, 44], P.switchbacks, [200, 100], [240, 140], [272, 180], [286, 194]]);
  road([[300, 186], [318, 150], [326, 118], P.slopes, [388, 92], P.lookout]);
  road([[278, 214], [262, 222], [214, 246], [170, 256], P.quench]);
  road([[300, 218], [300, 250], [300, 290], P.slag]);
  road([[328, 202], [350, 202], [400, 202], P.gatefield, [468, 176], P.works]);
  road([P.gatefield, [478, 226], P.yard]);
  road([[322, 216], [336, 228], [366, 256], P.station]);
  // the rail: an iron track ('r') on the rail bed
  const rail = k.road([P.station, [388, 300], [392, 340], CART.edge], { ch: 'r', verge: 1 });

  // ---- the lava: the Glowrun down the west of the town, the Slagrun east from it under the slag road. Where a road
  // crosses, the road cells stay walkable as a crossing ('c'): it crusts black and glows on the cycle (zone.lava)
  const crossing = [];
  const lava = (pts, r) => {
    const cpts = curve(pts, 0.004);
    cpts.forEach(([fx, fy]) => {
      for (let y = Math.floor(fy - r - 1); y <= Math.ceil(fy + r + 1); y++) for (let x = Math.floor(fx - r - 1); x <= Math.ceil(fx + r + 1); x++) {
        if (!k.inb(x, y)) continue;
        const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy);
        if (d >= r) { if (d < r + 1.3 && k.kind[y][x] === 1) k.ground[y][x] = ':'; continue; }
        if (k.kind[y][x] === 2) { if (k.ground[y][x] === '=') { k.ground[y][x] = 'c'; crossing.push([x, y]); } continue; }   // a road crossing
        if (k.kind[y][x] === 4) continue;
        k.ground[y][x] = '~'; k.coll[y][x] = '~'; k.kind[y][x] = 4;
      }
    });
  };
  lava([[250, 0], [246, 60], [238, 134], [222, 204], [212, 252], [196, 320], [180, 383]], 2.6);
  lava([[214, 268], [260, 278], [300, 276], [350, 284], [420, 292], [470, 300], [575, 312]], 2.3);
  // the rail crosses the Slagrun on an iron bridge, not a crossing: it never glows
  for (let i = crossing.length - 1; i >= 0; i--) { const [x, y] = crossing[i]; if (k.ground[y][x] === 'c' && rail.some(([a, b]) => a === x && b === y)) { k.ground[y][x] = 'r'; crossing.splice(i, 1); } }
  // a glowing pool in the Foundry yard and one in the slag pits (blocking, glowing)
  const pool = (cx, cy, rx, ry) => { for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (k.isFloor(x, y) && k.kind[y][x] !== 2 && Math.hypot((x - cx) / rx, (y - cy) / ry) < 1) { k.ground[y][x] = '~'; k.coll[y][x] = '~'; k.kind[y][x] = 4; } };
  pool(532, 272, 6, 4); pool(320, 336, 6, 3); pool(278, 338, 4, 3);

  // ---- the Ember Gate: a wall of iron across the pass, one road-wide gap the Watch holds
  const GATE = { x: 404, y0: 190, y1: 214, gap: [199, 204] };
  for (let y = GATE.y0; y <= GATE.y1; y++) for (let x = GATE.x; x <= GATE.x + 2; x++) {
    if (y >= GATE.gap[0] && y <= GATE.gap[1]) continue;
    if (k.isFloor(x, y)) { k.wall(x, y, x, y, '='); }
  }

  // ---- Bellows Square (the town)
  const put = (t, x, y, extra = {}) => { if (!k.put(t, x, y, extra)) throw new Error(`emberpeak: ${t} at ${x},${y} does not fit`); };
  put('smithy', 280, 196);                  // Corwin's forge, door at (284, 196)
  put('bakery', 292, 196);                  // Bess's canteen, door at (295, 196)
  put('inn', 304, 196);                     // the Bellows Inn, door at (308, 196)
  put('smithy', 314, 196);                  // the old forge (Harl's armoury), door at (318, 196)
  put('item_shop', 280, 216); put('house_small', 290, 216); put('house_medium', 306, 216); put('house_small', 316, 216);
  put('well', 300, 208);
  put('market_stall_cloth', 286, 206); put('market_stall_fruit', 312, 206);
  for (const [x, y] of [[278, 200], [290, 200], [312, 200], [324, 200], [278, 210], [324, 210], [296, 214]]) k.put('lamp_post', x, y, { state: 1 });
  k.put('signpost_arrow', 274, 194); k.put('signpost_arrow', 330, 204); k.put('signpost_arrow', 302, 220); k.put('signpost_arrow', 302, 184);
  // forges and anvils in the square (3D: code-built, zone.realmProps; 2D: their stone footing)
  const props = [];
  const prop = (t, x, y, extra = {}) => { props.push({ t, x, y, ...extra }); };
  for (const [x, y] of [[276, 191], [326, 191]]) { k.wall(x, y, x + 1, y); prop('ep_chimney', x, y); }
  prop('ep_anvil', 288, 199); prop('ep_anvil', 320, 199);
  // the gate's two iron towers (3D) either side of the gap
  prop('ep_gate', GATE.x + 1, GATE.gap[0] - 1, { side: 'n', y0: GATE.y0 }); prop('ep_gate', GATE.x + 1, GATE.gap[1] + 1, { side: 's', y1: GATE.y1 });
  for (let y = GATE.y0; y <= GATE.y1; y++) if (y < GATE.gap[0] || y > GATE.gap[1]) for (let x = GATE.x; x <= GATE.x + 2; x++) if (k.coll[y][x] === '#' && k.kind[y][x] === 9) k.decor.push({ t: 'x1_blank_slab', x, y });
  // the cart station: a hut, sacks of ore, the cart on the rail (3D)
  put('x1_turf_hut', 374, 266); k.put('x1_sack_stack', 392, 268); k.put('crates_barrels', 376, 278);
  prop('ep_ore_cart', CART.station[0], CART.station[1]);
  // the Ashen Foundry: furnaces in the yard (3D), the outer works' sheds
  for (const [x, y] of [[506, 244], [528, 248], [540, 262]]) { if (k.isFloor(x, y) && k.isFloor(x + 1, y)) { k.wall(x, y, x + 1, y); prop('ep_furnace', x, y); } }
  put('x1_turf_hut', 478, 142); put('x1_turf_hut', 494, 156); k.put('crates_barrels', 486, 146); k.put('x1_sack_stack', 472, 154);
  // the lookout over the gate, the switchback shrine at the top
  put('x1_turf_hut', 424, 92); put('x1_hearth', 432, 100);
  k.put('x1_menhir_a', 90, 22); k.put('x1_menhir_b', 102, 22);
  // scattered rocks on the open floor (not in the town, not on the roads)
  for (let y = 4; y < H; y += 5) for (let x = 4; x < W; x += 5) {
    if (x >= T.x0 - 4 && x <= T.x1 + 4 && y >= T.y0 - 4 && y <= T.y1 + 4) continue;
    if (!k.free(x, y, 3)) continue;
    const r = hash01(x, y, 71);
    if (r < 0.08) k.put('x1_boulder_a', x, y);
    else if (r < 0.1) k.put('x1_gorse_b', x, y);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!k.free(x, y, 1)) continue;
    const r = hash01(x, y, 61);
    if (r < 0.006) k.overlay(['pebbles_0', 'pebbles_1', 'pebbles_2'][Math.floor(hash01(x, y, 62) * 3)], x, y);
  }

  // ---- the mountain: boulders on the line, dark pines behind
  k.dress({ line: 'x1_boulder_a', lineAlt: 'tree_pine', deep: 'tree_pine', step: 2, skip: 0.1, lineR: 2 });
  // the gate's iron, the chimneys and furnaces stand on forced-solid cells: no mountain decor on them
  for (let i = k.decor.length - 1; i >= 0; i--) { const d = k.decor[i]; if ((d.line || d.deep) && k.kind[d.y][d.x] === 9) k.decor.splice(i, 1); }

  const areas = [
    { id: 'ep_square', name: 'Bellows Square', x: T.x0 - 6, y: T.y0 - 6, w: T.x1 - T.x0 + 13, h: T.y1 - T.y0 + 13, levels: [1, 2], safe: true },
    { id: 'ep_canteen', name: "Bess's Canteen", x: 290, y: 194, w: 9, h: 8, levels: [1, 1] },
    { id: 'ep_forge', name: "Corwin's Forge", x: 278, y: 194, w: 10, h: 8, levels: [1, 1] },
    { id: 'ep_top', name: 'The Switchback Top', x: 70, y: 10, w: 54, h: 34, levels: [1, 1] },
    { id: 'ep_switchbacks', name: 'The Switchbacks', x: 104, y: 46, w: 92, h: 56, levels: [1, 2] },
    { id: 'ep_slopes', name: 'The Hound Slopes', x: 290, y: 56, w: 96, h: 56, levels: [2, 4] },
    { id: 'ep_lookout', name: 'The Gate Lookout', x: 410, y: 82, w: 40, h: 28, levels: [3, 4] },
    { id: 'ep_quench', name: 'The Quench Fields', x: 88, y: 232, w: 80, h: 60, levels: [3, 3] },
    { id: 'ep_slag', name: 'The Slag Pits', x: 256, y: 298, w: 88, h: 56, levels: [4, 5] },
    { id: 'ep_gate', name: 'The Ember Gate', x: 392, y: 188, w: 20, h: 28, levels: [5, 5] },
    { id: 'ep_gate_field', name: 'Before the Gate', x: 412, y: 186, w: 46, h: 34, levels: [5, 5] },
    { id: 'ep_works', name: "The Foundry's Outer Works", x: 450, y: 124, w: 72, h: 52, levels: [4, 5] },
    { id: 'ep_yard', name: 'The Foundry Yard', x: 480, y: 228, w: 72, h: 60, levels: [6, 6] },
    { id: 'ep_station', name: 'The Cart Station', x: 368, y: 260, w: 30, h: 24, levels: [1, 6] },
  ];
  // the three crossings, grouped (explore areas: "Bellows Square" walks the first)
  const groups = [];
  for (const [x, y] of crossing) {
    let gr = groups.find((q) => q.cells.some(([a, b]) => Math.abs(a - x) <= 3 && Math.abs(b - y) <= 3));
    if (!gr) { gr = { cells: [] }; groups.push(gr); }
    gr.cells.push([x, y]);
  }
  groups.sort((a, b) => a.cells[0][1] - b.cells[0][1]);
  if (groups.length !== 3) throw new Error(`emberpeak: ${groups.length} lava crossings, want 3 (${groups.map((g) => g.cells[0].join(',')).join(' ')})`);
  const CROSS = [['ep_cross_road', 'The Switchback Crossing'], ['ep_cross_quench', 'The Quench Crossing'], ['ep_cross_slag', 'The Slag Crossing']];
  // by y: the switchback road crosses highest, the quench road next, the slag road lowest
  const crossings = groups.map((gr, i) => {
    const xs = gr.cells.map((c) => c[0]), ys = gr.cells.map((c) => c[1]);
    const a = { id: CROSS[i][0], name: CROSS[i][1], x: Math.min(...xs) - 2, y: Math.min(...ys) - 2, w: Math.max(...xs) - Math.min(...xs) + 5, h: Math.max(...ys) - Math.min(...ys) + 5, levels: [1, 4] };
    areas.push(a);
    return { id: a.id, name: a.name, cells: gr.cells.length };
  });
  const lanterns = [
    { id: 'ep_square', name: 'Bellows Square', x: 300, y: 204, post: [300, 203] },
    { id: 'ep_top', name: 'The Switchback Top', x: 96, y: 30, post: [98, 29] },
    { id: 'ep_quench', name: 'The Quench Fields', x: 140, y: 256, post: [142, 255] },
    { id: 'ep_gate', name: 'The Ember Gate', x: 396, y: 206, post: [396, 207] },
    { id: 'ep_slag', name: 'The Slag Pits', x: 300, y: 304, post: [302, 303] },
  ];
  for (const l of lanterns) k.coll[l.post[1]][l.post[0]] = '#';

  // ---- people (src/data/emberpeak.js has who they are; src/data/emberpeak.js EP_TRAVEL places the innkeeper and the kitemaster)
  const npcs = [
    { npc: 'ep_harl', x: 304, y: 205, dir: 'down' },      // Captain Harl of the Gate Watch, the Warden's first teacher
    { npc: 'ep_bess', x: 295, y: 198, dir: 'down' },      // Bess, before her canteen door
    { npc: 'ep_corwin', x: 285, y: 199, dir: 'down' },    // Corwin, at his forge
    { npc: 'ep_tibb', x: 394, y: 208, dir: 'right' },     // Watchman Tibb, inside the Gate
    { npc: 'ep_carter', x: 380, y: 276, dir: 'right' },   // the cart station: the ride to Willowmere
  ];
  // ---- foes: levels 1 to 6 along the roads (cinderlings burst, hounds hunt in pairs, golems hit hard, the Crew raids)
  const spawns = [];
  const camp = (mob, levels, pts, group, extra = {}) => pts.forEach(([x, y], i) => spawns.push({ mob, level: levels[i % levels.length], x, y, wander: 3, respawn: 60, group, ...extra }));
  // the switchbacks (1 to 2): cinderlings on the road down
  camp('ep_cinderling', [1, 1, 2], [[132, 60], [140, 70], [150, 62], [160, 74], [170, 64], [176, 82], [128, 82], [146, 88], [164, 90], [186, 78]], null);
  camp('ep_cinderling', [1], [[96, 34], [108, 30], [84, 28]], null);
  // the hound slopes (2 to 4): ash hounds alone low, in pairs from level 4 up top
  camp('ep_ash_hound', [2, 3], [[312, 96], [324, 88], [340, 100], [356, 92], [330, 76], [302, 80]], null);
  camp('ep_ash_hound', [4, 4], [[352, 70], [356, 74]], 'ep_hounds_a');
  camp('ep_ash_hound', [4, 4], [[372, 84], [376, 80]], 'ep_hounds_b');
  camp('ep_ash_hound', [3, 4], [[424, 104], [436, 90], [418, 86]], null);
  // the quench fields (3): cinderlings round the quench stones, a hound or two
  camp('ep_cinderling', [2, 2, 3], [[112, 250], [124, 270], [138, 276], [108, 268], [146, 246], [118, 284]], null);
  camp('ep_ash_hound', [2], [[100, 258], [150, 266]], null);
  // the slag pits (4 to 5): slag golems
  camp('ep_slag_golem', [4, 5], [[278, 318], [290, 330], [308, 316], [320, 324], [296, 342], [330, 312], [270, 334], [312, 344]], null);
  // the outer works (4 to 5): the Ashen Crew, fire-throwers behind the brawlers
  camp('ep_raider', [4, 5], [[466, 140], [474, 160], [490, 132], [502, 146], [498, 166], [512, 156], [480, 170], [458, 152]], null);
  camp('ep_firethrower', [5], [[486, 138], [506, 158], [470, 164]], null);
  // before the Gate (5): the Hold the Gate waves (hidden until a hero on the quest steps up: src/sim/realm_mech.js)
  camp('ep_gate_raider', [5], [[438, 194], [440, 210], [444, 200], [446, 206]], 'ep_wave_1', { respawn: 600 });
  camp('ep_gate_raider', [5], [[448, 192], [450, 212], [452, 198], [454, 206]], 'ep_wave_2', { respawn: 600 });
  camp('ep_gate_raider', [5], [[456, 196], [456, 208], [446, 202]], 'ep_wave_3', { respawn: 600 });
  camp('ep_firethrower', [5], [[460, 202]], 'ep_wave_3', { respawn: 600, gateWave: 3 });
  // the Foundry yard (6): Brask and his furnace golems
  spawns.push({ mob: 'ep_brask', level: 6, x: 518, y: 258, wander: 1, respawn: 180, group: 'ep_yard_boss' });
  camp('ep_furnace_golem', [5], [[500, 252], [534, 250]], null, { respawn: 120 });
  camp('ep_raider', [5], [[498, 268], [526, 276]], null);
  // ---- nodes: quench stones on the far side of the quench crossing ("Cool Iron")
  const nodes = [[104, 254], [116, 262], [132, 268], [110, 276], [126, 280], [142, 262], [100, 270], [136, 250]]
    .map(([x, y], i) => ({ id: `ep_quench_${i + 1}`, item: 'ep_quench_stone', x, y, respawn: 30, name: 'Quench Stone', sprite: 'x1_sack_stack' }));
  const zone = k.zone({
    id: 'emberpeak', name: 'Emberpeak', music: 'high_moor', under: 'x1_peat',
    lighting: { tint: 'none', dark: 0.2 },
    // the 2D grade: a warm forge glow over everything; the 3D view: its own ground colours (palette), lava for ink
    grade: { tint: 'rgba(255,96,24,0.10)', desat: 0.15 },
    style: 'forge', palette: { x1_peat: '#2a2624', dirt: '#5e5a56', x1_bracken: '#3a302a', plaza: '#4a4440', x1_crag_top: '#1c1a1a', cliff_stairs_mid: '#3a3634', ink: '#ff5a12' },
    levels: [1, 6], arrival: [300, 207],
    regions: [{ id: 'ep_square', name: 'Bellows Square', kind: 'town', x: T.x0 - 6, y: T.y0 - 6, w: T.x1 - T.x0 + 13, h: T.y1 - T.y0 + 13, levels: [1, 2], music: 'high_moor', lighting: { tint: 'none', dark: 0.2 }, under: 'x1_peat' }],
    areas, lanterns, npcs, spawns, nodes, signs: [], hooks: [], secrets: [],
    // the lava cycle (seconds) and the crossing char; the Gate waves (src/sim/realm_mech.js)
    lava: { ch: 'c', cycle: 40, hot: 16, burnPct: 0.06, crossings },
    gate: { quest: 'ep_hold_the_gate', area: 'ep_gate_field', waves: ['ep_wave_1', 'ep_wave_2', 'ep_wave_3'], pause: 8, giveUp: 30 },
    realmProps: props,
    joins: [],
  });
  return zone;
}

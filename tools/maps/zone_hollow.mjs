// The Nameless Hollow (wave 3 realms2 lane, 2026-11-22; WORLD_2.md 1.5, D:/LQOnline/world3/BRIEF.md): the Inkblade's
// start realm, levels 1 to 6. A town in fog at night whose name was stolen: every sign is blank, grey watchmen walk
// slow rounds with lanterns, and the Faceless Steward keeps the name locked in a mirror in the Court of Mirrors on the
// east side. Its own outdoor zone, 576 x 384 tiles (about 2 minutes across on foot). The journey out is the Fading Road:
// its far west end is a one-way join onto the world (Gate Road East, the edge of Willowmere); the way back home is the
// Lantern Kite or the Lantern Stone.
//
// The signature (src/sim/realms2.js, src/data/realms2.js): the lantern watch. A watchman sees only inside his lantern's
// cone (drawn on the ground in front of him); outside it you can walk right past. Seen, he raises the alarm and every
// watchman near comes running. Hollow ravens on the chimneys squawk a moment after they spot you and wake the watch:
// drop them first. Fog banks drift through the streets: inside one, foes forget you and drop the chase.
//
// Built with the big-zone kit (bigzone_kit.mjs): squares and yards joined by cobbled streets, the houses of the town
// fill the rest (drawn as roofs in the 3D view, canopy 'roofs'). Pockets are stamped by hand below. Deterministic.
import { bigZone } from './bigzone_kit.mjs';
import { hash01, vnoise } from './kit.mjs';

export const W = 576, H = 384;
// the Fading Road's far end (the west edge) and where it comes out on the world (Gate Road East, by Willowmere)
export const ROAD_END = { x: 0, y: 189, w: 2, h: 5 };
export const WORLD_LANDING = [203, 140];

// pocket centres (tiles)
export const P = {
  hub: [100, 192], chimney: [184, 104], lanes: [196, 298], square: [300, 192], watch: [406, 104], tower: [420, 300],
  court: [506, 192], yard: [300, 320], garden: [470, 250], mill: [292, 66],
};
// the watch's lantern rounds (pingpong / loop routes, tiles): every one walks inside the open streets
export const ROUNDS = {
  nh_round_street: { mode: 'pingpong', route: [[232, 192], [264, 192]] },
  nh_round_ns: { mode: 'pingpong', route: [[292, 168], [292, 216]] },
  nh_round_ew: { mode: 'pingpong', route: [[272, 200], [330, 200]] },
  nh_round_ring: { mode: 'loop', route: [[282, 180], [318, 180], [318, 206], [282, 206]] },
  nh_round_house: { mode: 'pingpong', route: [[388, 98], [424, 112]] },
  nh_round_court: { mode: 'pingpong', route: [[444, 188], [480, 188]] },
  nh_round_tower: { mode: 'pingpong', route: [[400, 292], [440, 304]] },
};
// fog banks drifting through the streets (loops, tiles; r in tiles; speed in tiles a second)
export const FOG = [
  { id: 'nh_fog_square', route: [[270, 170], [330, 176], [326, 214], [276, 212]], r: 7, speed: 0.9 },
  { id: 'nh_fog_lanes', route: [[166, 282], [226, 290], [222, 316], [170, 312]], r: 6, speed: 0.8 },
  { id: 'nh_fog_court', route: [[440, 180], [490, 186], [486, 214], [446, 208]], r: 6, speed: 0.7 },
  { id: 'nh_fog_house', route: [[384, 92], [428, 96], [424, 120], [388, 118]], r: 6, speed: 0.8 },
];
export const TOWN = { x0: 78, y0: 176, x1: 124, y1: 210 };

export function build(db) {
  const LEG = { '.': 'dirt', 'o': 'plaza', '=': 'plaza', ',': 'tallgrass', 'g': 'grass', '~': 'water', '-': 'shallow', 'p': 'x1_peat' };
  const k = bigZone(W, H, { legend: LEG, floor: '.', seed: 20261124, db });

  // ---- squares and yards (the floor)
  k.hall(...P.hub, 36, 26, 2);
  k.hall(...P.chimney, 36, 26, 3);
  k.hall(...P.lanes, 42, 28, 4);
  k.hall(...P.square, 50, 36, 5);
  k.hall(...P.watch, 38, 26, 6);
  k.hall(...P.tower, 30, 24, 7);
  k.hall(...P.court, 42, 38, 8);
  k.hall(...P.yard, 30, 20, 9);
  k.hall(...P.garden, 22, 18, 10);
  k.hall(...P.mill, 30, 20, 11);
  // ---- streets (about 9 tiles wide; the alleys 6)
  const streets = [
    [P.hub, [176, 192], [250, 192], P.square],               // Lamp Street
    [P.hub, [126, 160], [150, 124], P.chimney],
    [P.hub, [126, 226], [160, 270], P.lanes],
    [P.chimney, [232, 124], [270, 160], P.square],
    [P.chimney, [236, 76], P.mill],
    [P.mill, [356, 76], P.watch],
    [P.square, [350, 156], P.watch],
    [P.square, [336, 236], [380, 280], P.tower],
    [P.lanes, [250, 316], P.yard, [360, 316], P.tower],
    [P.square, [380, 192], [450, 192], P.court],
    [P.tower, P.garden, [498, 226], P.court],
    [P.watch, [458, 128], [500, 164], P.court],
  ];
  for (const s of streets) k.passage(s, 9);
  // the rooftop alley: a narrow back way from the hub to the square that the watch never walks (WORLD_2's rooftops, drawn
  // here as an alley under the eaves)
  k.passage([[118, 178], [160, 150], [214, 152], [258, 168], [280, 178]], 5);
  // the Fading Road: west out of the hub to the edge of the fog
  k.passage([[P.hub[0] - 30, 192], [2, 191]], 7);
  for (let y = ROAD_END.y; y < ROAD_END.y + ROAD_END.h; y++) for (let x = ROAD_END.x; x < ROAD_END.x + ROAD_END.w; x++) k.open(x, y);

  // ---- ground: mud and moss in the yards, grass by the walls
  k.paint((x, y, ch, fl) => {
    if (!fl) return 'p';
    const n = vnoise(x, y, 14, 3);
    if (n > 0.72) return 'g';
    if (vnoise(x, y, 9, 9) > 0.78) return ',';
    return null;
  });
  // the hub's plaza and the square's cobbles
  const cobble = (x0, y0, x1, y1) => k.paint((x, y, ch, fl) => (fl && x >= x0 && x <= x1 && y >= y0 && y <= y1 ? 'o' : null));
  cobble(TOWN.x0, TOWN.y0, TOWN.x1, TOWN.y1);
  cobble(270, 168, 330, 216);
  cobble(484, 172, 528, 212);
  // the dry fountain in the square, a canal pool in the yard
  const pool = (cx, cy, rx, ry) => { for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (k.isFloor(x, y) && Math.hypot((x - cx) / rx, (y - cy) / ry) < 1) { k.ground[y][x] = Math.hypot((x - cx) / rx, (y - cy) / ry) < 0.6 ? '~' : '-'; k.coll[y][x] = '~'; k.kind[y][x] = 4; } };
  pool(300, 192, 3, 2);
  pool(300, 326, 7, 3);

  // ---- streets (cobbled roads along them)
  const road = (pts) => k.road(pts, { ch: '=', verge: 0 });
  road([[2, 191], [70, 192], [124, 192], [176, 192], [250, 192], [270, 192]]);
  road([[330, 192], [380, 192], [450, 192], [484, 192]]);
  road([[100, 176], [126, 160], [150, 124], [184, 110]]);
  road([[100, 210], [126, 226], [160, 270], [196, 290]]);
  road([[300, 216], [336, 236], [380, 280], [420, 296]]);

  // ---- the Blank Sign quarter (the hub)
  const put = (t, x, y, extra = {}) => { if (!k.put(t, x, y, extra)) throw new Error(`hollow: ${t} at ${x},${y} does not fit`); };
  put('inn', 104, 186);                  // the Blank Sign (inn), door at (108, 186)
  put('item_shop', 84, 186);             // Vessa's back room, door at (87, 186)
  k.put('house_medium', 80, 206); k.put('house_small', 114, 206); k.put('house_small', 94, 206);
  k.put('well', 99, 197);
  k.put('market_stall_cloth', 88, 196);
  for (const [x, y] of [[82, 192], [118, 192], [92, 182], [112, 182], [100, 204]]) k.put('lamp_post', x, y, { state: 1 });
  k.put('signboard', 120, 188); k.put('signboard', 80, 188); k.put('signpost_arrow', 76, 190); k.put('signpost_arrow', 126, 196);
  k.put('crates_barrels', 116, 196); k.put('barrel', 84, 200);
  // the mayor's house by the square, the watch house, the bell tower, the Court of Mirrors
  k.put('house_large', 262, 176); k.put('house_medium', 334, 178); k.put('house_small', 270, 214); k.put('house_small', 326, 216);
  k.put('house_large', 396, 96); k.put('smithy', 414, 122);
  put('chapel_bell_tower', 418, 296);    // the bell tower (the escort's end)
  put('library', 506, 180);              // the Court of Mirrors, door at (511, 180)
  // chimneys (ravens' perches): houses round Chimney Row
  k.put('house_small', 168, 96); k.put('house_medium', 190, 94); k.put('house_small', 172, 116); k.put('house_small', 198, 118);
  // the lanes: little houses of the forgotten
  k.put('house_small', 178, 290); k.put('house_small', 206, 288); k.put('house_small', 186, 312); k.put('house_small', 214, 310);
  // the old mill
  k.put('house_large', 288, 62);
  // the square: lamps at the corners, benches
  for (const [x, y] of [[276, 172], [324, 172], [276, 212], [324, 212]]) k.put('lamp_post', x, y, { state: 1 });
  k.put('bench', 296, 184); k.put('bench', 296, 200);
  // the court: lamps, stones like mirrors
  for (const [x, y] of [[488, 176], [524, 176], [488, 208], [524, 208]]) k.put('lamp_post', x, y, { state: 1 });
  for (const [x, y] of [[494, 196], [518, 196], [506, 206]]) k.put('x1_blank_slab', x, y);
  // the garden of mirrors: standing slabs
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.put('x1_blank_slab', Math.round(470 + Math.cos(a) * 9), Math.round(250 + Math.sin(a) * 7)); }
  // blank signs along the streets (every sign in town is blank)
  for (const [x, y] of [[150, 196], [210, 188], [240, 196], [360, 188], [430, 196], [160, 262], [232, 132], [350, 240]]) k.put('signboard', x, y);
  // scattered barrels and crates in the yards
  for (let y = 4; y < H; y += 5) for (let x = 4; x < W; x += 5) {
    if (x >= TOWN.x0 - 4 && x <= TOWN.x1 + 4 && y >= TOWN.y0 - 4 && y <= TOWN.y1 + 4) continue;
    if (!k.free(x, y, 2)) continue;
    const r = hash01(x, y, 71);
    if (r < 0.03) k.put('barrel', x, y);
    else if (r < 0.05) k.put('crate', x, y);
    else if (r < 0.07) k.put('bush', x, y);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!k.free(x, y, 1)) continue;
    const r = hash01(x, y, 61);
    if (r < 0.006) k.overlay(['pebbles_0', 'pebbles_1', 'pebbles_2'][Math.floor(hash01(x, y, 62) * 3)], x, y);
    else if (r < 0.009) k.overlay('leaves', x, y);
  }

  // ---- the walls: the houses of the town (the 3D view draws the line and the deep cells as roofs, canopy 'roofs')
  k.dress({ line: 'tree_pine', deep: 'tree_pine', step: 2, deepStep: 3, skip: 0.1, lineR: 2 });

  const areas = [
    { id: 'nh_hub', name: 'The Blank Sign', x: TOWN.x0 - 6, y: TOWN.y0 - 6, w: TOWN.x1 - TOWN.x0 + 13, h: TOWN.y1 - TOWN.y0 + 13, levels: [1, 2], safe: true },
    { id: 'nh_fading_road', name: 'The Fading Road', x: 0, y: 180, w: 66, h: 24, levels: [1, 1] },
    { id: 'nh_chimney', name: 'Chimney Row', x: 150, y: 80, w: 70, h: 50, levels: [1, 2] },
    { id: 'nh_lanes', name: 'The Faceless Lanes', x: 156, y: 272, w: 82, h: 54, levels: [2, 3] },
    { id: 'nh_alley', name: 'Under the Eaves', x: 116, y: 144, w: 166, h: 38, levels: [2, 3] },
    { id: 'nh_square', name: 'Curfew Square', x: 252, y: 158, w: 96, h: 68, levels: [3, 4] },
    { id: 'nh_square_west', name: 'The West Arch', x: 270, y: 186, w: 8, h: 12, levels: [3, 3] },
    { id: 'nh_fountain', name: 'The Dry Fountain', x: 304, y: 186, w: 6, h: 12, levels: [3, 3] },
    { id: 'nh_square_east', name: 'The East Arch', x: 326, y: 184, w: 8, h: 14, levels: [3, 3] },
    { id: 'nh_mill', name: 'The Still Mill', x: 262, y: 46, w: 60, h: 40, levels: [3, 4] },
    { id: 'nh_watch', name: 'The Watch House', x: 368, y: 78, w: 76, h: 52, levels: [4, 5] },
    { id: 'nh_yard', name: 'Canal Yard', x: 270, y: 300, w: 60, h: 40, levels: [3, 4] },
    { id: 'nh_tower', name: 'The Bell Tower', x: 390, y: 276, w: 60, h: 48, levels: [4, 5] },
    { id: 'nh_garden', name: 'The Mirror Garden', x: 448, y: 232, w: 44, h: 36, levels: [5, 5] },
    { id: 'nh_court', name: 'The Court of Mirrors', x: 464, y: 154, w: 84, h: 76, levels: [5, 6] },
  ];
  const lanterns = [
    { id: 'nh_blank_sign', name: 'The Blank Sign', x: 100, y: 194, post: [102, 193] },
    { id: 'nh_mill', name: 'The Still Mill', x: 292, y: 70, post: [294, 69] },
    { id: 'nh_tower', name: 'The Bell Tower', x: 412, y: 306, post: [409, 305] },
    { id: 'nh_garden', name: 'The Mirror Garden', x: 462, y: 262, post: [459, 261] },
  ];
  for (const l of lanterns) { k.coll[l.post[1]][l.post[0]] = '#'; }

  // ---- people (src/data/hollow.js has who they are; src/data/realms2.js places the innkeeper and the kitemaster)
  const npcs = [
    { npc: 'nh_corvin', x: 100, y: 188, dir: 'down' },     // before the inn: Corvin of the rooftops, the Inkblade's first teacher
    { npc: 'nh_vessa', x: 87, y: 188, dir: 'down' },       // her back room
    { npc: 'nh_elian', x: 92, y: 198, dir: 'right' },      // the mayor, who cannot remember the town's name
    { npc: 'nh_nim', x: 114, y: 200, dir: 'left' },        // the lamplighter's girl
    { npc: 'nh_ida', x: 414, y: 300, dir: 'down' },        // the bell tower: Ida the bellringer
  ];
  // ---- foes, levels 1 to 6
  const spawns = [];
  const camp = (mob, levels, pts, group, extra = {}) => pts.forEach(([x, y], i) => spawns.push({ mob, level: levels[i % levels.length], x, y, wander: 3, respawn: 60, group, ...extra }));
  // Chimney Row (1 to 2): hollow ravens on the chimneys (they stay put)
  camp('nh_raven', [1, 1, 2], [[166, 92], [180, 88], [196, 90], [210, 98], [214, 112], [200, 124], [178, 124], [160, 110], [188, 104], [204, 106], [170, 100], [192, 116]], null, { wander: 0 });
  // the Faceless Lanes (2 to 3): the forgotten townsfolk
  camp('nh_faceless', [2, 2, 3], [[170, 284], [184, 280], [200, 282], [218, 286], [226, 300], [220, 314], [204, 318], [186, 318], [172, 306], [196, 302], [210, 296], [180, 298]], null);
  // the alley under the eaves (2 to 3): a few ravens and faceless (no watch walks here)
  camp('nh_raven', [2, 3], [[168, 150], [214, 152], [246, 162]], null, { wander: 0 });
  camp('nh_faceless', [3], [[190, 152], [232, 158]], null);
  // Curfew Square (3 to 4): the lantern watch on its rounds
  const round = (id, levels) => { const R = ROUNDS[id]; levels.forEach((level, slot) => spawns.push({ mob: 'nh_watchman', level, x: R.route[0][0], y: R.route[0][1], wander: 0, respawn: 60, group: id, patrol: { id, mode: R.mode, route: R.route.map((p) => [...p]), slot } })); };
  round('nh_round_street', [3]);
  round('nh_round_ns', [3]);
  round('nh_round_ew', [4]);
  round('nh_round_ring', [4]);
  camp('nh_raven', [3, 4], [[278, 176], [322, 210]], null, { wander: 0 });
  // the Still Mill (3 to 4): faceless and ravens
  camp('nh_faceless', [3, 4], [[272, 60], [286, 54], [304, 58], [312, 72], [278, 76], [298, 80]], null);
  camp('nh_raven', [3], [[290, 50], [310, 64]], null, { wander: 0 });
  // Canal Yard (3 to 4): faceless by the water
  camp('nh_faceless', [3, 4], [[284, 314], [300, 312], [318, 318], [288, 334], [314, 336]], null);
  // the Watch House (4 to 5): watchmen, and the captains in pairs (the mirror keys)
  round('nh_round_house', [4]);
  camp('nh_raven', [4], [[396, 90], [426, 100]], null, { wander: 0 });     // spotters on the Watch House roof
  camp('nh_watchman', [4, 5], [[380, 104], [398, 112], [418, 92], [430, 108], [392, 120]], null, { wander: 1 });
  camp('nh_captain', [4, 4], [[404, 104], [408, 100]], 'nh_captains_a');
  camp('nh_captain', [4], [[420, 118]], null);
  camp('nh_captain', [4], [[388, 94]], null);
  camp('nh_captain', [5, 5], [[432, 96], [436, 100]], 'nh_captains_c');
  // the bell tower (4 to 5): a watch round and mirror shades in the yard
  round('nh_round_tower', [5]);
  camp('nh_shade', [4, 5], [[400, 284], [438, 290], [432, 312], [404, 316]], null);
  // the Mirror Garden and the Court approach (5 to 6): mirror shades and the court round
  camp('nh_shade', [5], [[460, 244], [478, 242], [484, 256], [462, 258], [470, 264]], null);
  round('nh_round_court', [5, 5]);
  camp('nh_shade', [5, 6], [[490, 184], [522, 184], [490, 204], [522, 204]], null);
  // the Faceless Steward in the Court of Mirrors (6)
  spawns.push({ mob: 'nh_steward', level: 6, x: 506, y: 194, wander: 1, respawn: 180, group: 'nh_court' });
  const zone = k.zone({
    id: 'hollow', name: 'The Nameless Hollow', music: 'high_moor', under: 'dirt',
    lighting: { tint: 'none', dark: 0.45 },
    // the 3D view: a foggy night outdoors (zone.atmos), the walls drawn as the town's roofs (src/render3d/zone3d.js)
    canopy: 'roofs', style: 'hollow',
    grade: { desat: 0.3, tint: 'rgba(70,76,120,0.16)', mist: 0.42 },     // the 2D view: grey, violet, drifting fog
    atmos: { hemi: '#8a90b8', ground: '#3a3440', hemiK: 1.25, env: 0.12, fog: '#4a4c60', near: 4, far: 46, grade: [0.96, 0.98, 1.06], desat: 0.22, vig: 1.1 },
    levels: [1, 6], arrival: [100, 194],
    regions: [{ id: 'nh_hub', name: 'The Blank Sign', kind: 'town', x: TOWN.x0 - 6, y: TOWN.y0 - 6, w: TOWN.x1 - TOWN.x0 + 13, h: TOWN.y1 - TOWN.y0 + 13, levels: [1, 2], music: 'high_moor', lighting: { tint: 'none', dark: 0.45 }, under: 'dirt' }],
    areas, lanterns, npcs, spawns, nodes: [], signs: [], hooks: [], secrets: [],
    fog: FOG.map((f) => ({ ...f, route: f.route.map((p) => [...p]) })),
    // the Fading Road: a one-way walk out of the fog onto the world (the way back is the Lantern Kite)
    joins: [{ x: ROAD_END.x, y: ROAD_END.y, w: ROAD_END.w, h: ROAD_END.h, to: 'world', tx: WORLD_LANDING[0], ty: WORLD_LANDING[1], dir: 'left', needs: 'nh_faceless_steward', notYet: 'The fog thickens and turns you round. The Fading Road will not open while the Steward keeps the name of the town.', ride: 'The fog thins behind you, and the Fading Road comes out on the road to Willowmere.' }],
  });
  return zone;
}

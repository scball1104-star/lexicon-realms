// Saffron Haven (wave 3 realms2 lane, 2026-11-22; WORLD_2.md 1.4, D:/LQOnline/world3/BRIEF.md): the Wayfinder's start
// realm, levels 1 to 6. An oasis town of saffron domes and white sails in a sea of dunes; a wall of storm on the east
// edge, where Ravi Scorchwind and the Scorch Riders camp. Its own outdoor zone, 576 x 384 tiles (about 2 minutes across
// on foot). The journey out is the sand-ship: its gangway at the end of the west pier is a one-way join onto the world
// (the river landing on Gate Road South, below Willowmere); the way back home is the Lantern Kite or the Lantern Stone.
//
// The signature (src/sim/realms2.js, src/data/realms2.js): sandstorms roll in from the storm wall on a clock. In a storm
// sight shrinks to a few metres, the wind pulls you east toward the wall, and the Scorch Riders see further than you do.
// The chime posts along the Storm Road are shelter: stand near one and the wind lets go. The town is shelter too.
//
// Built with the big-zone kit (bigzone_kit.mjs): wide halls of open sand joined by broad passages, roads along them, the
// rock ridges and deep dunes fill the rest. Pockets (the town, the wells, the flats, the dunes, the lair, the rest, the
// raider camp) are stamped by hand below. Deterministic.
import { bigZone } from './bigzone_kit.mjs';
import { hash01, vnoise } from './kit.mjs';

export const W = 576, H = 384;
// the sand-ship's gangway (the west pier's end) and where the ride lands on the world (Gate Road South, below Willowmere)
export const GANGWAY = { x: 70, y: 190, w: 2, h: 4 };
export const WORLD_LANDING = [170, 163];

// pocket centres (tiles)
export const P = {
  town: [190, 192], docks: [104, 192], wells: [196, 268], flats: [204, 104], sea: [300, 196], dunes: [352, 210],
  t1: [292, 128], t2: [350, 98], t3: [404, 76], lair: [454, 58], rest: [386, 304], ambushA: [318, 290], ambushB: [446, 262],
  camp: [510, 196], dome: [276, 344], south: [120, 300],
};
// the chime posts along the Storm Road (shelter in a storm), tiles
export const CHIMES = [[248, 222], [272, 250], [300, 276], [340, 296], [372, 292], [412, 284], [440, 252], [462, 226], [482, 206]];
// town plaza
export const T = { x0: 166, y0: 176, x1: 214, y1: 210 };

export function build(db) {
  const LEG = { '.': 'sand', ':': 'dirt', '=': 'dirt', 'o': 'plaza', '~': 'water', '-': 'shallow', ',': 'tallgrass', 'g': 'grass' };
  const k = bigZone(W, H, { legend: LEG, floor: '.', seed: 20261123, db });

  // ---- halls (open sand)
  k.hall(...P.town, 44, 32, 2);
  k.hall(...P.docks, 26, 14, 3);
  k.hall(...P.wells, 40, 26, 4);
  k.hall(...P.flats, 52, 34, 5);
  k.hall(...P.sea, 46, 40, 6);
  k.hall(...P.dunes, 46, 36, 7);
  k.hall(...P.t1, 18, 14, 8);
  k.hall(...P.t2, 18, 14, 9);
  k.hall(...P.t3, 18, 14, 10);
  k.hall(...P.lair, 26, 18, 11);
  k.hall(...P.rest, 30, 20, 12);
  k.hall(...P.ambushA, 24, 18, 13);
  k.hall(...P.ambushB, 24, 18, 14);
  k.hall(...P.camp, 44, 48, 15);
  k.hall(...P.dome, 28, 18, 16);
  k.hall(...P.south, 34, 26, 17);
  // ---- broad passages between them (the open desert, about 13 tiles wide)
  const ways = [
    [P.docks, [140, 192], P.town],
    [P.town, [194, 232], P.wells],
    [P.town, [200, 150], P.flats],
    [P.town, [246, 196], P.sea],
    [P.sea, P.dunes],
    [P.flats, [250, 116], P.t1],
    [P.t1, [320, 112], P.t2],
    [P.t2, [378, 86], P.t3],
    [P.t3, [430, 64], P.lair],
    [P.dunes, [326, 156], P.t1],
    [P.town, [248, 222], [272, 250], [300, 276], P.ambushA],
    [P.ambushA, [350, 300], P.rest],
    [P.rest, [412, 284], P.ambushB],
    [P.ambushB, [462, 226], [482, 206], P.camp],
    [P.dunes, [400, 232], P.ambushB],
    [P.wells, [236, 312], P.dome],
    [P.dome, [330, 330], P.rest],
    [P.wells, [150, 290], P.south],
    [P.south, [112, 240], P.docks],
  ];
  for (const w of ways) k.passage(w, 13);
  // the west pier out over the dune sea to the sand-ship's gangway
  k.passage([[P.docks[0] - 20, 192], [GANGWAY.x, 192]], 5);
  for (let y = GANGWAY.y; y < GANGWAY.y + GANGWAY.h; y++) for (let x = GANGWAY.x; x < GANGWAY.x + GANGWAY.w; x++) k.open(x, y, ':');

  // ---- ground: hardpan drifts and ripples on the sand
  k.paint((x, y, ch, fl) => {
    const n = vnoise(x, y, 18, 3);
    if (n > 0.7) return ':';
    return null;
  });
  // the oasis: a pool south of the plaza with grass and reeds round it, a smaller pool by the wells
  const pool = (cx, cy, rx, ry, grassR = 3) => {
    for (let y = cy - ry - grassR; y <= cy + ry + grassR; y++) for (let x = cx - rx - grassR; x <= cx + rx + grassR; x++) {
      if (!k.inb(x, y) || !k.isFloor(x, y)) continue;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d < 0.75) { k.ground[y][x] = '~'; k.coll[y][x] = '~'; k.kind[y][x] = 4; }
      else if (d < 1) { k.ground[y][x] = '-'; k.coll[y][x] = '~'; k.kind[y][x] = 4; }
      else if (d < 1 + grassR / Math.max(rx, ry)) k.ground[y][x] = hash01(x, y, 7) < 0.4 ? ',' : 'g';
    }
  };
  pool(190, 224, 12, 5);
  pool(208, 272, 6, 3, 2);
  pool(182, 262, 4, 3, 2);
  // the town plaza
  k.paint((x, y, ch, fl) => (fl && x >= T.x0 && x <= T.x1 && y >= T.y0 && y <= T.y1 && ch !== '~' && ch !== '-' ? 'o' : null));

  // ---- roads: the caravan road through town, the Storm Road east along the chime posts, the dock road west
  const road = (pts) => k.road(pts, { ch: '=', verge: 1 });
  road([[P.docks[0] - 18, 192], [140, 192], [166, 192], [214, 192], [246, 196], [300, 196], [352, 210]]);
  road([[190, 176], [200, 150], [204, 104]]);
  road([[214, 200], [248, 222], [272, 250], [300, 276], [318, 290], [350, 300], [386, 304], [412, 284], [446, 262], [462, 226], [482, 206], [500, 196]]);
  road([[190, 210], [194, 236], [196, 252]]);

  // ---- Saffron Haven (the town)
  const put = (t, x, y, extra = {}) => { if (!k.put(t, x, y, extra)) throw new Error(`saffron: ${t} at ${x},${y} does not fit`); };
  put('inn', 196, 188);                  // the Blue Sail (inn), door at (200, 188)
  put('item_shop', 176, 188);            // Haddu's stall-house, door at (179, 188)
  put('house_medium', 170, 205); put('house_small', 205, 205); put('house_small', 168, 182); put('house_large', 206, 184);
  put('well', 189, 200);
  put('market_stall_cloth', 180, 198); put('market_stall_fruit', 194, 198); put('market_stall_cloth', 184, 204);
  for (const [x, y] of [[172, 194], [206, 194], [184, 180], [198, 180], [190, 208]]) k.put('lamp_post', x, y, { state: 1 });
  k.put('signpost_arrow', 164, 190); k.put('signpost_arrow', 216, 194); k.put('signpost_arrow', 188, 174); k.put('signpost_arrow', 216, 202);
  k.put('crates_barrels', 172, 200); k.put('x1_sack_stack', 202, 200); k.put('x1_trough', 186, 214);
  // the sail docks: the dock house, sacks and crates for the sand-ship, the pier
  put('x1_turf_hut', 98, 186); k.put('crates_barrels', 108, 198); k.put('x1_sack_stack', 92, 198); k.put('x1_sack_stack', 94, 198); k.put('barrel', 112, 186);
  k.put('signpost_arrow', 86, 189);
  // the oasis wells (the scorpions' haunt): three wells round the little pools
  k.put('well', 196, 260); k.put('well', 214, 282); k.put('well', 176, 276);
  // the Caravan Rest (the outpost on the Storm Road): tents, a fire, water troughs
  put('x1_turf_hut', 378, 296); put('x1_turf_hut', 392, 296); put('x1_hearth', 386, 306); k.put('x1_trough', 394, 310); k.put('crates_barrels', 374, 310);
  // the raider camp: tents and a fire inside the storm wall
  put('x1_turf_hut', 500, 180); put('x1_turf_hut', 516, 178); put('x1_turf_hut', 500, 214); put('x1_hearth', 512, 200); k.put('x1_sack_stack', 520, 212); k.put('crates_barrels', 494, 196);
  // the lion's lair: a ring of standing rocks
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; k.put(i % 2 ? 'x1_menhir_a' : 'x1_menhir_b', Math.round(454 + Math.cos(a) * 12), Math.round(58 + Math.sin(a) * 8)); }
  // the old dome (a ruin in the south dunes): a ring of stones
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; k.put('x1_menhir_a', Math.round(276 + Math.cos(a) * 9), Math.round(344 + Math.sin(a) * 6)); }
  // the chime posts on the Storm Road (beside the road, one each side alternately)
  CHIMES.forEach(([x, y], i) => { const ok = k.put(`x1_chimepost_${i + 1}`, x + 3, y) || k.put(`x1_chimepost_${i + 1}`, x - 3, y) || k.put(`x1_chimepost_${i + 1}`, x, y + 3); if (!ok) throw new Error(`saffron: chime post ${i + 1} does not fit`); });

  // scattered rocks and dry grass on the open sand (not in the town, not on the roads)
  for (let y = 4; y < H; y += 6) for (let x = 4; x < W; x += 6) {
    if (x >= T.x0 - 6 && x <= T.x1 + 6 && y >= T.y0 - 6 && y <= T.y1 + 16) continue;
    if (!k.free(x, y, 3)) continue;
    const r = hash01(x, y, 71);
    if (r < 0.05) k.put('x1_boulder_a', x, y);
    else if (r < 0.065) k.put('x1_gorse_b', x, y);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!k.free(x, y, 1)) continue;
    const r = hash01(x, y, 61);
    if (r < 0.006) k.overlay(['pebbles_0', 'pebbles_1', 'pebbles_2'][Math.floor(hash01(x, y, 62) * 3)], x, y);
    else if (r < 0.009) k.overlay(hash01(x, y, 63) < 0.5 ? 'tuft_0' : 'tuft_1', x, y);
  }

  // ---- the walls: rock outcrops on the line, the deep dunes behind (canopy 'dunes' in the 3D view)
  k.dress({ line: 'x1_boulder_a', lineAlt: 'x1_menhir_b', deep: 'x1_boulder_a', step: 2, deepStep: 4, skip: 0.2, lineR: 2 });

  const areas = [
    { id: 'sh_town', name: 'Saffron Haven', x: T.x0 - 8, y: T.y0 - 8, w: T.x1 - T.x0 + 17, h: T.y1 - T.y0 + 24, levels: [1, 2], safe: true, shelter: true },
    { id: 'sh_docks', name: 'The Sail Docks', x: 66, y: 176, w: 64, h: 32, levels: [1, 1], shelter: true },
    { id: 'sh_wells', name: 'The Oasis Wells', x: 160, y: 246, w: 72, h: 46, levels: [1, 2] },
    { id: 'sh_flats', name: 'The Dust Devil Flats', x: 156, y: 72, w: 98, h: 66, levels: [2, 3] },
    { id: 'sh_sea', name: 'The Open Sand', x: 256, y: 158, w: 70, h: 78, levels: [2, 3] },
    { id: 'sh_dunes', name: 'The Laughing Dunes', x: 310, y: 178, w: 90, h: 66, levels: [3, 4] },
    { id: 'sh_track_1', name: 'Fresh Tracks', x: P.t1[0] - 8, y: P.t1[1] - 6, w: 16, h: 12, levels: [4, 4] },
    { id: 'sh_track_2', name: 'Fresher Tracks', x: P.t2[0] - 8, y: P.t2[1] - 6, w: 16, h: 12, levels: [4, 4] },
    { id: 'sh_track_3', name: 'Warm Tracks', x: P.t3[0] - 8, y: P.t3[1] - 6, w: 16, h: 12, levels: [4, 4] },
    { id: 'sh_lair', name: "The Lion's Lair", x: P.lair[0] - 18, y: P.lair[1] - 13, w: 36, h: 26, levels: [4, 5] },
    { id: 'sh_storm_road', name: 'The Storm Road', x: 230, y: 214, w: 90, h: 76, levels: [4, 5] },
    { id: 'sh_rest', name: 'The Caravan Rest', x: 362, y: 290, w: 48, h: 28, levels: [4, 5], shelter: true },
    { id: 'sh_storm_edge', name: 'The Storm Edge', x: 420, y: 240, w: 56, h: 44, levels: [5, 5] },
    { id: 'sh_camp', name: 'The Scorch Camp', x: 470, y: 152, w: 84, h: 90, levels: [5, 6] },
    { id: 'sh_dome', name: 'The Old Dome', x: 252, y: 330, w: 48, h: 30, levels: [3, 4] },
    { id: 'sh_south', name: 'The Glass Flats', x: 90, y: 278, w: 64, h: 46, levels: [2, 3] },
  ];
  const lanterns = [
    { id: 'sh_oasis', name: 'Saffron Haven', x: 190, y: 194, post: [192, 193] },
    { id: 'sh_rest', name: 'The Caravan Rest', x: 386, y: 300, post: [389, 299] },
    { id: 'sh_lair_rock', name: "The Lion's Rock", x: 432, y: 66, post: [434, 65] },
    { id: 'sh_storm_edge', name: 'The Storm Edge', x: 452, y: 250, post: [455, 249] },
  ];
  for (const l of lanterns) { k.coll[l.post[1]][l.post[0]] = '#'; }

  // ---- people (src/data/saffron.js has who they are; src/data/realms2.js places the innkeeper and the kitemaster)
  const npcs = [
    { npc: 'sh_sava', x: 190, y: 186, dir: 'down' },       // by the well: the Trailmaster, the Wayfinder's first teacher
    { npc: 'sh_haddu', x: 179, y: 190, dir: 'down' },      // his stall-house
    { npc: 'sh_kesi', x: 182, y: 200, dir: 'right' },      // the courier, by the stalls
    { npc: 'sh_juba', x: 212, y: 196, dir: 'left' },       // the old tracker, at the east road
    { npc: 'sh_nico', x: 110, y: 192, dir: 'down' },       // the deckhand at the sail docks
    { npc: 'sh_oma', x: 386, y: 300, dir: 'down' },        // the caravan master at the Caravan Rest
  ];
  // ---- foes: camps in the pockets, levels 1 to 6
  const spawns = [];
  const camp = (mob, levels, pts, group, extra = {}) => pts.forEach(([x, y], i) => spawns.push({ mob, level: levels[i % levels.length], x, y, wander: 3, respawn: 60, group, ...extra }));
  // the Oasis Wells (1 to 2): sand scorpions round the pools
  camp('sh_scorpion', [1, 1, 2], [[172, 256], [184, 252], [200, 250], [214, 256], [222, 268], [222, 284], [204, 288], [188, 286], [170, 284], [164, 270], [198, 276], [178, 268]], null);
  // the Dust Devil Flats (2 to 3): dust devils spin on the hardpan
  camp('sh_dust_devil', [2, 3], [[178, 94], [196, 86], [214, 90], [232, 100], [226, 118], [208, 122], [186, 118], [174, 106], [244, 112], [198, 102]], null);
  camp('sh_scorpion', [2], [[166, 98], [236, 88], [190, 128], [222, 130]], null);
  // the Glass Flats (2 to 3): more scorpions, south-west
  camp('sh_scorpion', [2, 3], [[104, 290], [118, 284], [132, 296], [112, 308], [128, 312], [138, 286]], null);
  // the Open Sand (2 to 3): a few devils on the way east
  camp('sh_dust_devil', [3], [[282, 176], [302, 214], [320, 186], [290, 226]], null);
  // the Laughing Dunes (3 to 4): dune hyenas, alone, then in pairs
  camp('sh_hyena', [3, 4], [[330, 196], [344, 188], [366, 190], [382, 204], [372, 226], [348, 230], [326, 220], [392, 220]], null);
  camp('sh_hyena', [4, 4], [[356, 206], [360, 210]], 'sh_pack_a');
  camp('sh_hyena', [4, 4], [[338, 236], [342, 240]], 'sh_pack_b');
  camp('sh_hyena', [4, 4], [[374, 198], [378, 194]], 'sh_pack_c');
  // the Old Dome (3 to 4): hyenas den in the ruin
  camp('sh_hyena', [3, 4], [[266, 340], [286, 336], [278, 352], [262, 352]], null);
  // the tracks and the lair (4): scorpions and devils on the way
  camp('sh_dust_devil', [4], [[300, 122], [346, 104], [410, 82], [396, 70]], null);
  camp('sh_scorpion', [4], [[284, 134], [358, 92]], null);
  // the Storm Road (4 to 5): Scorch Rider ambush camps, in pairs from here
  camp('sh_rider', [4, 5], [[306, 284], [312, 296], [330, 292]], null);
  camp('sh_rider', [5, 5], [[322, 282], [326, 286]], 'sh_riders_a');
  camp('sh_rider', [5, 5], [[436, 256], [440, 260]], 'sh_riders_b');
  camp('sh_rider', [5], [[454, 270], [430, 272], [458, 250]], null);
  camp('sh_dust_devil', [5], [[452, 236], [470, 214]], null);
  // the Scorch Camp (5 to 6): the riders' own camp, and Ravi Scorchwind with her dune lion
  camp('sh_rider', [5, 6], [[488, 178], [492, 214], [506, 170], [522, 224], [536, 184], [530, 210], [480, 196], [514, 236]], null);
  camp('sh_rider', [6, 6], [[506, 186], [510, 190]], 'sh_riders_c');
  spawns.push({ mob: 'sh_ravi', level: 6, x: 526, y: 198, wander: 1, respawn: 180, group: 'sh_scorchwind' });
  spawns.push({ mob: 'sh_dune_lion', level: 5, x: 530, y: 202, wander: 1, respawn: 180, group: 'sh_scorchwind' });
  // ---- nodes: Kesi's letters, scattered by a dust devil over the flats ("The Lost Satchel"), and raider caches
  const nodes = [[180, 90], [200, 80], [222, 94], [240, 106], [216, 124], [190, 114], [172, 112], [230, 82]]
    .map(([x, y], i) => ({ id: `sh_letter_${i + 1}`, item: 'sh_letter', x, y, respawn: 30, name: "Kesi's Letter", sprite: 'x1_sack_stack' }));
  const zone = k.zone({
    id: 'saffron', name: 'Saffron Haven', music: 'willowmere', under: 'sand',
    lighting: { tint: 'none', dark: 0 },
    // the 3D view: the deep dunes drawn as sand hills, the town's houses as saffron domes (src/render3d/zone3d.js)
    canopy: 'dunes', style: 'saffron',
    levels: [1, 6], arrival: [190, 194],
    regions: [{ id: 'sh_town', name: 'Saffron Haven', kind: 'town', x: T.x0 - 8, y: T.y0 - 8, w: T.x1 - T.x0 + 17, h: T.y1 - T.y0 + 24, levels: [1, 2], music: 'willowmere', lighting: { tint: 'none', dark: 0 }, under: 'sand' }],
    areas, lanterns, npcs, spawns, nodes, signs: [], hooks: [], secrets: [],
    // the signature: the storm's shelter (src/data/realms2.js reads these)
    chimes: CHIMES.map(([x, y]) => [x, y]),
    // the sand-ship: a one-way ride onto the world (the way back is the Lantern Kite); `ride` is the loading card's line
    joins: [{ x: GANGWAY.x, y: GANGWAY.y, w: GANGWAY.w, h: GANGWAY.h, to: 'world', tx: WORLD_LANDING[0], ty: WORLD_LANDING[1], dir: 'down', needs: 'sh_scorchwind', notYet: 'Nico shakes his head: the sand-ship sails when Ravi Scorchwind is beaten.', ride: 'The sand-ship carries you over the sand sea to the river landing below Willowmere.' }],
  });
  return zone;
}

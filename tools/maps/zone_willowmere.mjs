// Willowmere, Realms' own drawing (relayout option B, approved by Scott 2026-11-21: "Approved, build the new Willowmere
// with your picks"). Until then the town was Lexicon Quest's map as is; LQ stays untouched and is no longer its source.
// The proposal and its stills: D:/LQOnline/willowmere_relayout/BRIEF.md.
//
// One rule drives the plan: every building's door is on its south wall, so every building sits on the north side of
// the street it opens onto. Three rows of buildings, three open streets:
//   - Lantern Square (tiles 13 to 33, rows 13 to 20) in the middle: the well, Elder Mael, the lantern. The north row
//     (chapel, inn, large house) opens onto it. Bell Street and Ferry Lane (3 wide) run up to the North Road on the shore.
//   - Gate Walk (6 wide) from the square south to the gate; Gate Road (3 wide) along the inside of the wall, the south
//     row (two houses, the Goods shop, the smithy, the library) opens onto it.
//   - Orchard Lane (3 wide) west to the Downs join, past the hero's home and the bakery; the orchard green north west.
// No one-tile back lanes; every door faces a street. Short garden fences close the gaps between houses side by side.
//
// Kept from the town as it was (copied here as data, so nothing is read from LQ): the lake (rows 0 to 2), the shore row
// with the flower bed and the old fence (row 3), the river and the bridge east of column 42, the wall and the gate
// (rows 30 and 31), the legend, the joins, the lantern, the arrival.
import { Canvas } from './kit.mjs';

export const W = 48, H = 32;

const KEEP_TOP = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '.FFFFFFs......ssss,.ss.,,,............ssssss~~~~',
];
const KEEP_BOTTOM = [
  '.WWWWWWWWWWWWWWWWW..==..WWWWWWWWWWWWWWWWWWWs~~~~',
  '..,,................==........,,,.......,,.s~~~~',
];
// columns 43 to 47 of rows 4 to 29: the sand bank and the river
const KEEP_EAST = ['s~~~~', 's~~~~', 's~~~~', 's~~~~', 's~~~~', 's~~~~', 's--~~', 's-~~~', 's~~~~', 's~~~~', '.~~~~', '.~~~~', '.~~~~',
  's~~~~', 's~~~~', 's-~~~', 's--~~', 's-~~~', 's~~~~', 's~~~~', 's~~~~', 's~~~~', 's~~~~', 's~~~~', 's~~~~', 's~~~~'];

// overlays kept from the old town (the shore flower bed, the bridge, the flowers and tufts on open grass), then new ones
const OVERLAYS = [
  ['hydrangea_blue', 26, 3], ['flowers_yellow', 27, 3], ['hydrangea_violet', 28, 3], ['flowers_pink', 29, 3], ['hydrangea_blue', 30, 3],
  ['flowers_red', 31, 3], ['hydrangea_violet', 32, 3], ['flowers_white', 33, 3], ['hydrangea_blue', 34, 3], ['flowers_violet', 35, 3],
  ['hydrangea_violet', 36, 3], ['flowers_yellow', 37, 3], ['flowers_white', 39, 3],
  ['bridge_wood_h_n_l', 42, 4], ['bridge_wood_h_s_l', 42, 5], ['bridge_wood_h_piles_l', 42, 6],
  ['bridge_wood_h_n_m', 43, 4], ['bridge_wood_h_s_m', 43, 5], ['bridge_wood_h_piles_m', 43, 6],
  ['bridge_wood_h_n_m', 44, 4], ['bridge_wood_h_s_m', 44, 5], ['bridge_wood_h_piles_m', 44, 6],
  ['bridge_wood_h_n_m', 45, 4], ['bridge_wood_h_s_m', 45, 5], ['bridge_wood_h_piles_m', 45, 6],
  ['bridge_wood_h_n_r', 46, 4], ['bridge_wood_h_s_r', 46, 5], ['bridge_wood_h_piles_r', 46, 6],
  ['hydrangea_blue', 11, 19], ['flowers_white', 11, 20], ['hydrangea_violet', 34, 18], ['flowers_pink', 34, 17], ['flowers_white', 1, 20],
  ['flowers_blue', 5, 4], ['flowers_violet', 43, 27], ['pebbles_0', 28, 3], ['leaves', 17, 4], ['tuft_1', 19, 5], ['pebbles_0', 7, 6],
  ['flowers_yellow', 23, 3], ['flowers_white', 32, 31], ['flowers_yellow', 41, 31],
  // new: in front of the orchard homes and on the square's edges
  ['flowers_white', 1, 11], ['flowers_pink', 0, 12], ['hydrangea_blue', 13, 11], ['flowers_yellow', 30, 19], ['flowers_red', 34, 19],
  ['hydrangea_violet', 24, 19],
];

// buildings anchor at their bottom-left cell; every door is on the south wall
const DECOR = [
  // north row: doors on row 12, open onto the square
  { t: 'chapel_bell_tower', x: 14, y: 12 },
  { t: 'inn', x: 25, y: 12 },
  { t: 'house_large', x: 36, y: 12 },
  // west row (as before): doors on row 15, open onto Orchard Lane
  { t: 'hero_home', x: 2, y: 15 },
  { t: 'bakery', x: 8, y: 15 },
  // orchard houses: doors on row 7, open onto the Orchard Walk
  { t: 'house_small', x: 0, y: 7 },
  { t: 'house_medium', x: 8, y: 7 },
  // south row: doors on row 26, open onto Gate Road
  { t: 'house_small', x: 1, y: 26 },
  { t: 'house_medium', x: 6, y: 26 },
  { t: 'item_shop', x: 12, y: 26 },
  { t: 'smithy', x: 24, y: 26 },
  { t: 'library', x: 32, y: 26 },
  { t: 'town_gate', x: 18, y: 30 },
  { t: 'well', x: 22, y: 17 },
  // lamps
  { t: 'lamp_post', x: 21, y: 13, state: 1 },
  { t: 'lamp_post', x: 25, y: 13, state: 1 },
  { t: 'lamp_post', x: 36, y: 13, state: 1 },
  { t: 'lamp_post', x: 19, y: 22, state: 1 },          // the Lantern Square post (lanterns[0].post)
  { t: 'lamp_post', x: 13, y: 20, state: 1 },
  { t: 'lamp_post', x: 16, y: 29, state: 1 },
  { t: 'lamp_post', x: 25, y: 29, state: 1 },
  { t: 'lamp_post', x: 1, y: 19, state: 1 },           // the west gate lamp and sign
  // square furniture
  { t: 'bench', x: 15, y: 16 },
  { t: 'bench', x: 29, y: 16 },
  { t: 'bench', x: 26, y: 21 },
  { t: 'signboard', x: 13, y: 15 },                    // the bakery sign corner
  { t: 'signboard', x: 17, y: 26 },                    // the town sign by the gate
  { t: 'signboard', x: 25, y: 3 },                     // the north road sign, off the road
  { t: 'market_stall_cloth', x: 14, y: 18 },
  { t: 'market_stall_fruit', x: 26, y: 15 },
  { t: 'hedge_flowers', x: 26, y: 6 },
  { t: 'hedge_flowers', x: 37, y: 6 },
  { t: 'crates_barrels', x: 39, y: 29 },
  { t: 'barrel', x: 42, y: 13 },
  { t: 'anvil', x: 29, y: 29 },                         // across Gate Road from the forge, against the wall
  // trees: the edges, never in a street
  { t: 'tree_willow', x: 14, y: 4 },
  { t: 'tree_willow', x: 19, y: 4 },
  { t: 'tree_willow', x: 44, y: 24 },
  { t: 'tree_willow', x: 8, y: 20 },
  { t: 'tree_pine', x: 9, y: 31 }, { t: 'tree_pine', x: 12, y: 31 }, { t: 'tree_pine', x: 28, y: 31 },
  { t: 'tree_pine', x: 33, y: 31 }, { t: 'tree_pine', x: 6, y: 31 }, { t: 'tree_pine', x: 38, y: 31 },
  { t: 'tree_pine', x: 3, y: 31 }, { t: 'tree_pine', x: 15, y: 31 },
  { t: 'tree_pine', x: 6, y: 4 }, { t: 'tree_pine', x: 11, y: 3 }, { t: 'tree_pine', x: 41, y: 18 },
  { t: 'bush', x: 12, y: 10 }, { t: 'bush', x: 35, y: 18 }, { t: 'bush', x: 41, y: 3 },
  { t: 'bush', x: 17, y: 31 }, { t: 'bush', x: 24, y: 31 }, { t: 'bush', x: 31, y: 31 }, { t: 'bush', x: 43, y: 30 },
];

// who stands where: everyone who gives quests, trains, sells or posts bounties is on an open street by their building
export const NPCS = [
  { npc: 'mael', x: 24, y: 18, dir: 'down' },      // at the well
  { npc: 'hob', x: 28, y: 13, dir: 'down' },       // inn door (29,12), on the square
  { npc: 'sloe', x: 32, y: 13, dir: 'left' },      // inn corner
  { npc: 'holt', x: 24, y: 29, dir: 'up' },        // right gate post
  { npc: 'bram', x: 17, y: 29, dir: 'up' },        // left gate post
  { npc: 'tess', x: 18, y: 27, dir: 'down' },      // by the gate
  { npc: 'hazel', x: 4, y: 16, dir: 'down' },      // home door
  { npc: 'oren', x: 11, y: 16, dir: 'down' },      // bakery door
  { npc: 'garrick', x: 27, y: 27, dir: 'down' },   // forge door (28,26), Gate Road
  { npc: 'pell', x: 14, y: 27, dir: 'down' },      // shop door (15,26), Gate Road
  { npc: 'iris', x: 36, y: 27, dir: 'down' },      // library door (37,26), Gate Road
  { npc: 'mira', x: 38, y: 27, dir: 'down' },      // library door (37,26), Gate Road
  { npc: 'nella', x: 42, y: 5, dir: 'right' },     // the bridge
  { npc: 'lark', x: 26, y: 19, dir: 'left' },      // square
  { npc: 'wick', x: 19, y: 18, dir: 'right' },     // square
  { npc: 'pip', x: 17, y: 13, dir: 'down' },       // chapel door (16,12), on the square
  { npc: 'edda', x: 32, y: 5, dir: 'up' },         // North Road by the flower bed
];

// the lq block: reference data from the LQ town (LQ's own npc list and marks), not read by the game; kept so the
// shape stays the same as before. Spots moved where the old ones now stand inside a building.
const LQ_NPCS = [
  { id: 'mael', name: 'Elder Mael', sprite: 'npc_elder', x: 24, y: 18, dir: 'down' },
  { id: 'tess', name: 'Tess', sprite: 'npc_tess', x: 18, y: 27, dir: 'down' },
  { id: 'nella', name: 'Nella', sprite: 'npc_ferry', x: 42, y: 5, dir: 'right' },
  { id: 'edda', name: 'Edda', sprite: 'npc_old_woman', x: 32, y: 5, dir: 'up' },
  { id: 'holt', name: 'Sergeant Holt', sprite: 'npc_guard', x: 24, y: 29, dir: 'up' },
  { id: 'bram', name: 'Bram', sprite: 'bram', x: 17, y: 29, dir: 'up' },
  { id: 'cobb', name: 'Cobb', sprite: 'npc_farmer', x: 38, y: 15, dir: 'down' },
  { id: 'henrietta', name: 'Henrietta', sprite: 'animal_chicken', x: 39, y: 17, dir: 'left' },
  { id: 'bertha', name: 'Bertha', sprite: 'animal_chicken', x: 41, y: 17, dir: 'right' },
  { id: 'wick', name: 'Wick', sprite: 'npc_child_a', x: 19, y: 18, dir: 'right' },
  { id: 'lark', name: 'Lark', sprite: 'npc_child_b', x: 26, y: 19, dir: 'left' },
  { id: 'the_duke', name: 'The Duke', sprite: 'animal_duck', x: 24, y: 4, dir: 'left' },
  { id: 'loaf', name: 'Loaf', sprite: 'animal_cat', x: 5, y: 10, dir: 'down' },
];
const LQ_MARKS = {
  home_door: [4, 16], bakery_sign: [12, 13], bakery_door: [11, 16], yard: [13, 14], well: [22, 17], bell_tower: [22, 6],
  gate_inner: [20, 28], town_sign: [20, 29], return_spot: [22, 19], meet_holt: [22, 21], gather_garrick: [27, 27],
  meet_garrick: [24, 20], gather_iris: [36, 27], meet_iris: [24, 18], gather_oren: [11, 16], meet_oren: [20, 20],
  gather_hazel: [4, 16], meet_hazel: [20, 18], gather_mael: [18, 13], meet_mael: [22, 16],
};
const DOOR_ID = {
  hero_home: ['door_home', 'hero_home'], bakery: ['door_bakery', 'bakery'], chapel_bell_tower: ['door_chapel', 'chapel'],
  inn: ['door_inn', 'inn'], library: ['door_library', 'library'], item_shop: ['door_shop', 'item_shop'], smithy: ['door_smithy', 'smithy'],
};

export function build(db) {
  const c = new Canvas(W, H, '.');
  for (let y = 0; y < 4; y++) for (let x = 0; x < W; x++) c.put(x, y, KEEP_TOP[y][x]);
  for (let y = 30; y < H; y++) for (let x = 0; x < W; x++) c.put(x, y, KEEP_BOTTOM[y - 30][x]);
  for (let y = 4; y < 30; y++) for (let i = 0; i < 5; i++) c.put(43 + i, y, KEEP_EAST[y - 4][i]);

  c.box(22, 4, 42, 5, '=');                 // the North Road along the shore, to the bridge
  c.box(22, 6, 24, 12, '=');                // Bell Street
  c.box(33, 6, 35, 12, '=');                // Ferry Lane
  c.box(13, 13, 33, 20, 'o');               // Lantern Square, soft corners
  for (const [x, y] of [[13, 20], [33, 20], [33, 13]]) c.put(x, y, '.');
  c.box(18, 21, 23, 26, 'o');               // Gate Walk, 6 wide
  c.box(1, 27, 42, 29, '=');                // Gate Road along the inside of the wall
  c.box(19, 27, 22, 29, 'o');               // the gate path through it
  c.box(0, 16, 12, 18, '=');                // Orchard Lane to the west join
  c.box(0, 9, 13, 9, '=');                  // the Orchard Walk in front of the two orchard houses
  c.box(34, 15, 42, 16, '=');               // east green: a path from the square to the river shore
  // fences: the west border (closed but for the join, rows 16 and 17), between the homes, between the south-west houses
  for (let y = 19; y <= 29; y++) c.put(0, y, 'F');
  for (let y = 11; y <= 15; y++) c.put(7, y, 'F');
  for (let y = 11; y <= 12; y++) c.put(13, y, 'F');
  for (let y = 22; y <= 26; y++) { c.put(11, y, 'F'); c.put(5, y, 'F'); }
  c.box(37, 18, 41, 19, ',');               // tallgrass by the east shore

  const doors = [];
  for (const d of DECOR) {
    if (!DOOR_ID[d.t]) continue;
    const o = db.tiles.objects[d.t];
    doors.push({ id: DOOR_ID[d.t][0], x: d.x + o.doorAt[0], y: d.y + o.doorAt[1], to: DOOR_ID[d.t][1] });
  }

  return {
    map: {
      id: 'willowmere', name: 'Willowmere', kind: 'town', w: W, h: H, music: 'willowmere', lighting: { tint: 'none', dark: 0 },
      under: 'grass',
      legend: { '.': 'grass', ',': 'tallgrass', '=': 'dirt', o: 'plaza', s: 'sand', '~': 'water', '-': 'shallow', F: 'fence_wood', W: 'wall_low' },
      ground: c.rows(), overlays: OVERLAYS.map(([t, x, y]) => ({ t, x, y })), decor: DECOR.map((d) => ({ ...d })), overhead: [],
    },
    realm: {
      joins: [
        { x: 20, y: 31, w: 2, h: 1, to: 'valley', tx: 1, ty: 52, dir: 'right' },
        { x: 0, y: 16, w: 1, h: 2, to: 'downs', tx: 142, ty: 42, dir: 'left' },
      ],
      lq: { npcs: LQ_NPCS.map((n) => ({ ...n })), enemies: [], doors, marks: structuredClone(LQ_MARKS), start: { x: 20, y: 24, dir: 'up' } },
      levels: [1, 1],
      areas: [
        { id: 'lantern_square', name: 'Lantern Square', x: 13, y: 13, w: 21, h: 14, safe: true },
        { id: 'south_gate', name: 'The South Gate', x: 14, y: 27, w: 14, h: 5, safe: true },
        { id: 'orchard_lane', name: 'Orchard Lane', x: 0, y: 3, w: 13, h: 19, safe: true },
      ],
      lanterns: [{ id: 'square', name: 'Lantern Square', x: 21, y: 19, post: [19, 22], bound: true }],
      npcs: NPCS.map((n) => ({ ...n })), spawns: [], nodes: [],
      signs: [{ id: 'west_gate', x: 1, y: 19, text: "ORCHARD LANE. WEST TO SHEPHERD'S DOWNS AND THORNFOLD." }],
      hooks: [], arrival: [20, 24],
    },
  };
}

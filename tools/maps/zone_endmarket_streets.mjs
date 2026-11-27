// The Endmarket, wing 2: the Fair Streets (wave 10 draid, wave B; a raid for 4 at level 30). Through the door beside
// the Fair Gate in Drovers' Reach: the Street Gate, the stall street, the Weigh Yard, the Crier's Ring, Bailiff's Lane
// and the shut Tollhall doors. Halls 8 wide, rock elsewhere; dressed with the dungeon kit's dg_* pieces and the fair's
// own dg_fair_* pieces (src/render3d/fair3d.js). The auction block (dg_fair_block) is reserved for wing 3. Generated
// into src/data/maps/endmarket_streets.js. Every name is a DRAFT for Scott.
import { carveDungeon, pack, boss } from './dungeon_kit.mjs';
import { DUNGEONS } from '../../src/data/dungeons.js';

export function build() {
  const D = DUNGEONS.endmarket_streets;
  const W = 80, H = 164;
  const rooms = [
    { id: 'em_tollhall_doors', name: 'The Tollhall Doors', x: 26, y: 4, w: 28, h: 16 },
    { id: 'em_bailiff_lane', name: "Bailiff's Lane", x: 28, y: 24, w: 24, h: 18 },
    { id: 'em_crier_ring', name: "The Crier's Ring", x: 16, y: 46, w: 48, h: 28 },
    { id: 'em_weigh_yard', name: 'The Weigh Yard', x: 16, y: 80, w: 48, h: 28 },
    { id: 'em_fair_streets', name: 'The Fair Streets', x: 24, y: 114, w: 32, h: 30 },
    { id: 'em_street_gate', name: 'The Street Gate', x: 26, y: 148, w: 28, h: 12 },
  ];
  const halls = [
    { pts: [[40, 148], [40, 143]], width: 8 },             // the Street Gate -> the Fair Streets
    { pts: [[40, 114], [40, 107]], width: 8 },             // the Fair Streets -> the Weigh Yard
    { pts: [[40, 80], [40, 73]], width: 8 },               // the Weigh Yard -> the Crier's Ring
    { pts: [[40, 46], [40, 41]], width: 8 },               // the Crier's Ring -> Bailiff's Lane
    { pts: [[40, 24], [40, 19]], width: 8 },               // Bailiff's Lane -> the Tollhall Doors
  ];
  const spawns = [
    ...pack('em_sgate_a', [['fair_drover', 30], ['fair_drover', 30]], 32, 154),
    ...pack('em_street_a', [['fair_lot_buyer', 30], ['fair_drover', 30]], 32, 132),
    ...pack('em_street_b', [['fair_stallholder', 30], ['fair_dog', 30]], 48, 122),
    ...pack('em_weigh_a', [['fair_lot_buyer', 30], ['fair_lot_buyer', 30]], 28, 100),
    boss('em_weighmaster', 30, 40, 96),
    ...pack('em_ring_a', [['fair_stallholder', 30], ['fair_drover', 30]], 28, 62),
    boss('em_crier', 30, 40, 52),
    ...pack('em_lane_a', [['fair_dog', 30], ['fair_dog', 30]], 34, 34),
    boss('em_catchpole', 30, 40, 33),
  ];
  const z = carveDungeon({
    id: 'endmarket_streets', name: D.name, kind: 'dungeon', w: W, h: H, levels: D.levels, music: 'the_downs',
    rooms, halls, entry: { x: 39, y: 160, w: 3 }, exitOut: D.door.out, arrival: [40, 157],
    lantern: { id: 'em_streets_lantern', name: 'The Street Gate', x: 34, y: 155 },
    spawns, floor: 'plaza',
    chests: [{ id: 'em_midway_cache', x: 20, y: 70, name: 'The Midway Cashbox' }],
    signs: [
      { id: 'em_streets_board', x: 46, y: 156, text: 'THE FAIR STREETS. Lots still taken. Names still sold.' },
      { id: 'em_tollhall_board', x: 46, y: 8, text: 'THE TOLLHALL. NAMES CALLED WITHIN.' },
    ],
  });
  z.joins = z.joins.map((j) => ({ ...j, to: D.door.zone }));
  z.dungeon.label = D.raid.label;
  z.dungeon.raid = { ...D.raid };
  z.lighting = { ...z.lighting, dark: 0.4 };
  const dec = [];
  const put = (t, x, y, o = {}) => dec.push({ t, x, y, ...o });
  // the Street Gate
  for (const x of [28, 34, 46, 52]) put('dg_torch', x, 147, { face: 's' });
  put('dg_fair_arch', 40, 148);
  put('dg_fair_lots', 32, 156); put('dg_fair_lots', 48, 156, { r: 0.7 });
  for (const [x, y] of [[27, 149], [52, 149], [27, 158], [52, 158]]) put('dg_brazier', x, y);
  // the Fair Streets (stalls face the walk at x=40; face is applied in fair3d.js)
  put('dg_fair_bunting', 26, 116, { len: 28 });
  for (const y of [118, 126, 134]) {
    put('dg_fair_awning', 31, y, { face: 'e', r: 0.2 });
    put('dg_fair_awning', 49, y, { face: 'w', r: 0.7 });
  }
  put('dg_fair_lots', 33, 122, { r: 0.4 }); put('dg_fair_lots', 47, 130, { r: 0.8 });
  for (const [x, y] of [[25, 115], [54, 115], [25, 142], [54, 142]]) put('dg_brazier', x, y);
  for (const x of [28, 32, 48, 52]) put('dg_torch', x, 113, { face: 's' });
  // the Weigh Yard (the great scales: pans at 34,91 blue and 46,91 gold, matching STREET_RULES.weigh)
  for (const x of [18, 26, 54, 62]) put('dg_torch', x, 79, { face: 's' });
  put('dg_fair_scales', 40, 90); put('dg_fair_weights', 48, 88);
  put('dg_fair_lots', 22, 86, { r: 0.3 });
  put('dg_fair_bunting', 18, 82, { len: 44 });
  for (const [x, y] of [[17, 81], [62, 81], [17, 106], [62, 106]]) put('dg_brazier', x, y);
  put('dg_coins', 36, 100); put('dg_urn', 54, 102);
  // the Crier's Ring (stalls at the Sold! tiles: oxblood 22,50, bone 40,48, teal 58,50)
  for (const x of [18, 28, 52, 62]) put('dg_torch', x, 45, { face: 's' });
  put('dg_fair_benches', 30, 54); put('dg_fair_benches', 50, 54, { r: 0.6 });
  put('dg_fair_awning', 22, 50, { face: 'e', r: 0.15 });
  put('dg_fair_lots', 40, 48, { r: 0.5 });
  put('dg_fair_awning', 58, 50, { face: 'w', r: 0.85 });
  put('dg_fair_bunting', 18, 48, { len: 44 });
  for (const [x, y] of [[17, 47], [62, 47], [17, 72], [62, 72]]) put('dg_brazier', x, y);
  put('dg_banner', 32, 45, { face: 's' }); put('dg_banner', 48, 45, { face: 's' });
  // Bailiff's Lane and the shut Tollhall doors (no auction block: reserved for wing 3)
  for (const x of [30, 32, 48, 50]) put('dg_torch', x, 23, { face: 's' });
  put('dg_chain', 30, 30); put('dg_chain', 48, 30);
  for (const [x, y] of [[29, 25], [50, 25], [29, 40], [50, 40]]) put('dg_brazier', x, y);
  put('dg_bones', 32, 36);
  for (const x of [28, 34, 46, 52]) put('dg_torch', x, 3, { face: 's' });
  put('dg_fair_arch', 40, 10);
  put('dg_banner', 36, 3, { face: 's' }); put('dg_banner', 44, 3, { face: 's' });
  for (const [x, y] of [[27, 5], [52, 5], [27, 18], [52, 18]]) put('dg_brazier', x, y);
  put('dg_skulls', 30, 12); put('dg_rubble', 50, 14);
  z.decor.push(...dec);
  return z;
}

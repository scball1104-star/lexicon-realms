// The Endmarket, wing 1: the Drove Gate (wave 10 draid, wave A; a raid for 4 at level 30). Through the Fair Gate at the
// north end of the Old Drove: the Fair Gate yard (unsold drovers and the fair's dogs), the drove street north to the
// Tollgate Square where the Turnpike stands across the way, west to the Pens, then north up the pen lane to the Drove
// Fold where Old Shep still herds. Halls 6 wide, rock elsewhere; dressed with the dungeon kit's dg_* pieces and the
// fair's own dg_fair_* pieces (src/render3d/fair3d.js). Generated into src/data/maps/endmarket_gate.js by
// tools/maps/build_world.mjs. Every name is a DRAFT for Scott.
import { carveDungeon, pack, boss } from './dungeon_kit.mjs';
import { DUNGEONS } from '../../src/data/dungeons.js';

export function build() {
  const D = DUNGEONS.endmarket_gate;
  const W = 76, H = 104;
  const rooms = [
    { id: 'em_fair_gate', name: 'The Fair Gate', x: 34, y: 80, w: 28, h: 20 },
    { id: 'em_tollgate_square', name: 'The Tollgate Square', x: 32, y: 46, w: 32, h: 20 },
    { id: 'em_pens', name: 'The Pens', x: 4, y: 40, w: 22, h: 26 },
    { id: 'em_drove_fold', name: 'The Drove Fold', x: 10, y: 4, w: 40, h: 24 },
  ];
  const halls = [
    { pts: [[48, 80], [48, 65]], width: 6 },              // the drove street: the yard -> the Tollgate Square
    { pts: [[32, 56], [25, 56]], width: 6 },              // the side gate: the square -> the Pens
    { pts: [[14, 40], [14, 27]], width: 6 },              // the pen lane: the Pens -> the Drove Fold
  ];
  const spawns = [
    // the Fair Gate yard
    ...pack('em_yard_a', [['fair_drover', 30], ['fair_drover', 30]], 40, 88),
    ...pack('em_yard_b', [['fair_dog', 30], ['fair_dog', 30], ['fair_drover', 30]], 55, 86),
    // the drove street and the square
    ...pack('em_street', [['fair_stallholder', 30], ['fair_drover', 30]], 48, 70),
    boss('em_turnpike', 30, 48, 52),
    ...pack('em_square_b', [['fair_dog', 30], ['fair_dog', 30]], 58, 50),
    // the Pens
    ...pack('em_pens_a', [['fair_dog', 30], ['fair_dog', 30], ['fair_drover', 30]], 14, 58),
    ...pack('em_pens_b', [['fair_stallholder', 30], ['fair_drover', 30]], 10, 46),
    // the Drove Fold
    ...pack('em_fold_a', [['fair_dog', 30], ['fair_drover', 30], ['fair_dog', 30]], 18, 22),
    boss('em_old_shep', 30, 30, 12),
  ];
  const z = carveDungeon({
    id: 'endmarket_gate', name: D.name, kind: 'dungeon', w: W, h: H, levels: D.levels, music: 'the_downs',
    rooms, halls, entry: { x: 47, y: 100, w: 3 }, exitOut: D.door.out, arrival: [48, 97],
    lantern: { id: 'em_gate_lantern', name: 'The Fair Gate', x: 42, y: 95 },
    spawns, floor: 'plaza',
    chests: [{ id: 'em_pens_cache', x: 6, y: 63, name: "The Drovers' Cashbox" }],
    signs: [{ id: 'em_gate_board', x: 54, y: 96, text: 'BY ORDER OF THE FAIR: every head counted, every name written, every lot sold.' }],
  });
  // the exit goes back to Drovers' Reach (as the Larch Mine's goes to Larchhill)
  z.joins = z.joins.map((j) => ({ ...j, to: D.door.zone }));
  z.dungeon.label = D.raid.label;
  z.dungeon.raid = { ...D.raid };
  z.lighting = { ...z.lighting, dark: 0.4 };       // the fair is in one long dusk, lantern lit: lighter than a barrow
  const dec = [];
  const put = (t, x, y, o = {}) => dec.push({ t, x, y, ...o });
  // the Fair Gate yard
  for (const x of [36, 42, 54, 60]) put('dg_torch', x, 79, { face: 's' });
  put('dg_fair_arch', 48, 78);
  put('dg_fair_awning', 37, 96); put('dg_fair_awning', 58, 96, { r: 0.8 });
  put('dg_fair_lots', 44, 82); put('dg_fair_lots', 52, 82, { r: 0.7 });
  put('dg_fair_bunting', 36, 81, { len: 24 });
  for (const [x, y] of [[35, 81], [60, 81], [35, 98], [60, 98]]) put('dg_brazier', x, y);
  put('dg_cage', 36, 90); put('dg_chain', 60, 90); put('dg_urn', 61, 93);
  // the Tollgate Square
  for (const x of [34, 40, 56, 62]) put('dg_torch', x, 45, { face: 's' });
  put('dg_banner', 45, 45, { face: 's' }); put('dg_banner', 51, 45, { face: 's' });
  put('dg_fair_awning', 35, 49); put('dg_fair_awning', 60, 62, { r: 0.6 });
  put('dg_fair_lots', 36, 62, { r: 0.3 });
  put('dg_fair_bunting', 34, 47, { len: 28 });
  for (const [x, y] of [[33, 47], [62, 47], [33, 64], [62, 64]]) put('dg_brazier', x, y);
  put('dg_coins', 44, 60); put('dg_rubble', 58, 58);
  // the Pens
  for (const x of [6, 20, 24]) put('dg_torch', x, 39, { face: 's' });
  for (const [x, y] of [[8, 50], [20, 50], [8, 60], [20, 60]]) put('dg_fair_hurdle', x, y);
  put('dg_fair_lots', 22, 43, { r: 0.6 });
  for (const [x, y] of [[5, 41], [24, 41], [5, 64], [24, 64]]) put('dg_brazier', x, y);
  put('dg_bones', 16, 62);
  // the Drove Fold
  for (const x of [12, 18, 24, 36, 42, 48]) put('dg_torch', x, 3, { face: 's' });
  put('dg_banner', 27, 3, { face: 's' }); put('dg_banner', 33, 3, { face: 's' });
  for (const [x, y] of [[13, 8], [13, 16], [46, 8], [46, 16]]) put('dg_fair_hurdle', x, y);
  put('dg_fair_lots', 40, 22, { r: 0.4 });
  put('dg_fair_bunting', 12, 6, { len: 36 });
  for (const [x, y] of [[11, 5], [48, 5], [11, 26], [48, 26]]) put('dg_brazier', x, y);
  put('dg_bones', 38, 18); put('dg_skulls', 22, 10);
  z.decor.push(...dec);
  return z;
}

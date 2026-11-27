// The Weir Works (cave, levels 33 to 35; cap 35 stage 1, 2026-11-27; docs/handoff/briefs/BRIEF_cap35_millrace.md section
// 4.1). Under Ferrick's Mill: the works that drove the great wheel, where the race runs in under the mill and out again.
// One boss, in the Larch Mine pattern. Its door is the mill's undercroft in the Millrace (src/data/dungeons.js
// weir_works.door.zone 'millrace'), so its exit goes back there.
//
//   The Undershot       x 20..35, y 57..66   the arrival, the cave lantern, a pair of weir-rats, the mill's old stores
//   (hall)              x 25..30, y 46..59   north into the gallery
//   The Wet Gallery     x  8..47, y 32..49   a long hall round a deep pool you walk round (x 16..39, y 37..44); five
//                                            packs of weir-rats and drowned drovers; Ferrick, hurt, in the south-east
//                                            corner; a small wheel on the north-west wall
//   (hall)              x 25..30, y 19..34   north into the chamber
//   The Wheel Chamber   x 14..41, y  5..22   the Wheel-Keeper; the race pool on the north wall (x 21..34, y 5..7) under
//                                            the great wheel, turned to face the camera (the cave camera looks north)
//
// The camera looks north, so both wheels are code-built (src/render3d/mill3d.js, zone.millProps) with r 90: their
// axles run north to south and their faces read. A cave is dark (0.45), so the chamber has lamp posts round the boss
// and the wall dressing (torches, braziers) is the live auto-dress (src/render/dungeon_plan.js), written out as authored
// decor with chains added. Generated into src/data/maps/weir_works.js by tools/maps/build_world.mjs. All names are drafts.
import { carveDungeon, pack, boss } from './dungeon_kit.mjs';
import { DUNGEONS } from '../../src/data/dungeons.js';
import { dungeonPlan } from '../../src/render/dungeon_plan.js';

export const W = 56, H = 70;
export const ROOMS = [
  { id: 'ww_undershot', name: 'The Undershot', x: 20, y: 57, w: 16, h: 10 },
  { id: 'ww_gallery', name: 'The Wet Gallery', x: 8, y: 32, w: 40, h: 18 },
  { id: 'ww_chamber', name: 'The Wheel Chamber', x: 14, y: 5, w: 28, h: 18 },
];
export const POOLS = { gallery: [16, 37, 24, 8], smallWheel: [9, 32, 4, 2], race: [21, 5, 14, 3] };
export const ARRIVAL = [27, 64];
export const KEEPER_AT = [28, 11];
export const RATS_FROM = [28, 9];          // the race's edge: the two weir-rats at half health drop in here
/** Ferrick, hurt, in the Wet Gallery (until the hero has handed in The Wheel Still Turns). */
export const FERRICK_AT = [43, 47];

export function build() {
  const D = DUNGEONS.weir_works;
  const halls = [
    { pts: [[28, 57], [28, 49]], width: 6 },
    { pts: [[28, 32], [28, 22]], width: 6 },
  ];
  const spawns = [
    ...pack('ww_undershot_a', [['weir_rat', 33], ['weir_rat', 33]], 32, 59),
    ...pack('ww_gallery_sw', [['weir_rat', 33], ['weir_rat', 33]], 11, 46),
    ...pack('ww_gallery_w', [['drowned_drover', 34], ['weir_rat', 33]], 11, 38),
    ...pack('ww_gallery_n', [['drowned_drover', 34], ['drowned_drover', 34]], 20, 33),
    ...pack('ww_gallery_ne', [['weir_rat', 33], ['weir_rat', 33], ['drowned_drover', 34]], 37, 33),
    ...pack('ww_gallery_e', [['drowned_drover', 34], ['drowned_drover', 34]], 44, 39),
    boss('wheel_keeper', 35, KEEPER_AT[0], KEEPER_AT[1]),
  ];
  const z = carveDungeon({
    id: 'weir_works', name: D.name, kind: 'cave', w: W, h: H, levels: D.levels, music: 'the_downs', floor: 'dirt',
    rooms: ROOMS, halls, pools: [POOLS.gallery, POOLS.smallWheel, POOLS.race],
    entry: { x: 26, y: 67, w: 4 }, exitOut: D.door.out, arrival: ARRIVAL,
    lantern: { id: 'ww_undershot', name: 'The Undershot', x: 23, y: 61 },
    spawns,
    chests: [{ id: 'weir_works_cache', x: 39, y: 7, name: "The Keeper's Tally Box" }],
    signs: [{ id: 'ww_count_board', x: 33, y: 64, text: 'WHAT THE WATER TAKES, COUNT. WHAT YOU COUNT, KEEP.' }],
    script: { wheel: { adds_from: [...RATS_FROM] } },
  });
  // the exit goes back to the Millrace, the zone the door stands in
  z.joins = z.joins.map((j) => ({ ...j, to: D.door.zone, dir: 'down' }));
  // Ferrick, hurt: an npc each copy spawns (src/sim/dungeons.js spawnCopy), gone once the hero has finished #11
  z.dungeon.npcs = [{ npc: 'mr_ferrick_hurt', x: FERRICK_AT[0], y: FERRICK_AT[1], dir: 'left', until: 'mr_wheel_still_turns' }];

  // ---- dressing: the live cave auto-dress (torches on the back walls, braziers in the chamber's corners, roots, rock),
  // written out as authored decor so the chains can join it
  const plan = dungeonPlan(z);
  const decor = z.decor;
  for (const p of plan.props) decor.push({ t: p.t, x: p.x, y: p.y, face: p.face || 's', r: p.r });
  const put = (t, x, y, o = {}) => {
    if (z.collision[y][x] !== '.') throw new Error(`weir_works: ${t} at ${x},${y} is not on the floor`);
    decor.push({ t, x, y, ...o });
  };
  // chains hanging by the race and in the gallery (wall-foot pieces, never in the open floor)
  for (const [x, y] of [[15, 6], [40, 6], [20, 6], [35, 6], [8, 41], [47, 41], [15, 21], [40, 21]]) if (z.collision[y][x] === '.') put('dg_chain', x, y, { r: 0.5 });
  // the Undershot: the mill's old stores, wet crates and sacks
  put('crates_barrels', 34, 58); put('barrel', 21, 65); put('crate', 21, 58); put('x1_sack_stack', 34, 65); put('barrel', 35, 62);
  // the Wet Gallery: crates on the dry walk, a ledger crate by Ferrick
  put('crate', 46, 49); put('barrel', 9, 49); put('crate', 15, 35); put('barrel', 46, 33);
  put('lamp_post', 46, 46, { state: 1 });     // a lamp by Ferrick, so he can be seen
  // the Wheel Chamber: lamp posts round the floor the Keeper walks, crates by the chest, a trough at the race
  for (const [x, y] of [[22, 9], [34, 9], [19, 16], [37, 16]]) put('lamp_post', x, y, { state: 1 });
  put('crates_barrels', 40, 12); put('crate', 37, 6); put('barrel', 16, 7); put('x1_trough', 17, 11);

  // ---- code-built props (src/render3d/mill3d.js): the great wheel in the race on the chamber's north wall and a smaller
  // one on the gallery's north-west wall, both turned 90 degrees to face the camera, each lit from the floor in front (`lamp`)
  z.millProps = [
    { t: 'mr_wheel', x: 27.5, y: 6, r: 90, scale: 1.6, keeper: true, lamp: { k: 2.4, h: 3.2, dz: 3.5 } },
    { t: 'mr_wheel', x: 10.5, y: 32.5, r: 90, scale: 0.75, lamp: { k: 1.2, h: 2.2, dz: 2.5 } },
  ];
  z.flavour = D.flavour;
  return z;
}

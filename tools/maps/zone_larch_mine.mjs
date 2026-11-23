// The Larch Mine (cave, levels 21 to 23; band lane, 2026-11-22; D:/LQOnline/world3/BRIEF.md section 4). Off Shaftmouth
// Camp in Larchhill: an old silver working where the blackdamp took a shift that never came up. The grubs have the upper
// stopes, the drowned shift walks the damp drift, and the Gaffer, the foreman who sent them down, keeps the seam.
// Its door is in Larchhill (not the world): src/data/dungeons.js larch_mine.door.zone, so its exit goes back there.
// Generated into src/data/maps/larch_mine.js by tools/maps/build_world.mjs.
import { carveDungeon, pack, boss } from './dungeon_kit.mjs';
import { DUNGEONS } from '../../src/data/dungeons.js';

export function build() {
  const D = DUNGEONS.larch_mine;
  const rooms = [
    { id: 'lm_adit', name: 'The Adit', x: 26, y: 38, w: 10, h: 6 },
    { id: 'lm_long_level', name: 'The Long Level', x: 6, y: 26, w: 50, h: 8 },
    { id: 'lm_stopes', name: 'The Grub Stopes', x: 4, y: 4, w: 18, h: 16 },
    { id: 'lm_seam', name: "The Gaffer's Seam", x: 26, y: 3, w: 9, h: 13 },
    { id: 'lm_drift', name: 'The Damp Drift', x: 39, y: 4, w: 18, h: 16 },
  ];
  const halls = [
    { pts: [[31, 38], [31, 33]], width: 4 },
    { pts: [[13, 26], [13, 19]], width: 4 },
    { pts: [[48, 26], [48, 19]], width: 4 },
    { pts: [[21, 10], [27, 10]], width: 4 },
    { pts: [[39, 10], [34, 10]], width: 4 },
  ];
  const spawns = [
    ...pack('lm_level_a', [['lh_grub', 21], ['lh_grub', 21]], 14, 29),
    ...pack('lm_level_b', [['lm_damp_miner', 22], ['lh_grub', 21]], 44, 29),
    ...pack('lm_stope_a', [['lh_grub', 22], ['lh_grub', 21], ['lh_grub', 22]], 9, 13),
    ...pack('lm_stope_b', [['lh_grub', 22], ['lh_grub', 22]], 17, 7),
    ...pack('lm_drift_a', [['lm_damp_miner', 22], ['lm_damp_miner', 22]], 44, 13),
    ...pack('lm_drift_b', [['lm_damp_miner', 23], ['lm_damp_miner', 22], ['lm_damp_miner', 23]], 52, 7),
    boss('lm_gaffer', 23, 30, 7),
  ];
  const z = carveDungeon({
    id: 'larch_mine', name: D.name, kind: 'cave', w: 60, h: 46, levels: D.levels, music: 'high_moor', floor: 'x1_peat',
    rooms, halls, pools: [[46, 15, 4, 3]], entry: { x: 30, y: 44, w: 2 }, exitOut: D.door.out, arrival: [30, 42],
    lantern: { id: 'lm_adit', name: 'The Adit', x: 28, y: 40 },
    spawns,
    chests: [{ id: 'larch_mine_cache', x: 33, y: 4, name: "The Gaffer's Pay Box" }],
  });
  // the exit goes back to Larchhill, the zone the door stands in
  z.joins = z.joins.map((j) => ({ ...j, to: D.door.zone, dir: 'left' }));
  return z;
}

// The Watchtower (dungeon, levels 18 to 20; BRIEF section 2). Inside the broken tower on the High Moor: the Tower Foot,
// the Guardroom, the Lamp Gallery (the Wickwright), the Stair Hall (the Captain of the Stair), the upper stair and the
// Lamp Room at the top, where the Sentinel of the Long Watch keeps its lamps (it stood on the open moor before this build).
// Generated into src/data/maps/watchtower.js by tools/maps/build_world.mjs.
import { carveDungeon, pack, boss } from './dungeon_kit.mjs';
import { DUNGEONS } from '../../src/data/dungeons.js';
import { toWorld } from '../../src/data/maps/layout.js';

export function build() {
  const D = DUNGEONS.watchtower;
  const out = D.door.area ? toWorld(D.door.area, D.door.out[0], D.door.out[1]) : D.door.out;
  const W = 64, H = 80;
  const rooms = [
    { id: 'tower_foot', name: 'The Tower Foot', x: 24, y: 66, w: 16, h: 10 },
    { id: 'guardroom', name: 'The Guardroom', x: 18, y: 47, w: 28, h: 11 },
    { id: 'lamp_gallery', name: 'The Lamp Gallery', x: 4, y: 25, w: 18, h: 14 },
    { id: 'stair_hall', name: 'The Stair Hall', x: 40, y: 24, w: 18, h: 16 },
    { id: 'lamp_room', name: 'The Lamp Room', x: 36, y: 2, w: 26, h: 12 },
  ];
  const halls = [
    { pts: [[32, 66], [32, 57]], width: 5 },             // the Tower Foot -> the Guardroom
    { pts: [[19, 52], [10, 52], [10, 38]], width: 5 },   // the Guardroom -> the Lamp Gallery
    { pts: [[21, 31], [40, 31]], width: 5 },             // the Lamp Gallery -> the Stair Hall
    { pts: [[49, 24], [49, 13]], width: 5 },             // the upper stair -> the Lamp Room
  ];
  const spawns = [
    ...pack('guard_a', [['tower_sentinel', 18], ['ink_wraith', 18]], 24, 51),
    ...pack('guard_b', [['page_wraith', 18], ['tower_sentinel', 19], ['page_wraith', 18]], 40, 52),
    boss('watch_wickwright', 19, 12, 29),
    ...pack('gallery_hall', [['ink_wraith', 19], ['page_wraith', 18]], 31, 31),
    ...pack('stair_a', [['tower_sentinel', 19], ['page_wraith', 19], ['ink_wraith', 18]], 45, 36),
    boss('watch_stair_captain', 19, 52, 27),
    ...pack('upper_stair', [['tower_sentinel', 19], ['tower_sentinel', 19]], 49, 14),   // at the Lamp Room door, clear of the Captain
    boss('sentinel_long_watch', 20, 49, 6),
    { mob: 'watch_lamp', level: 18, x: 44, y: 6, wander: 0, group: 'boss_sentinel_long_watch' },
    { mob: 'watch_lamp', level: 18, x: 54, y: 6, wander: 0, group: 'boss_sentinel_long_watch' },
  ];
  return carveDungeon({
    id: 'watchtower', name: D.name, kind: 'dungeon', w: W, h: H, levels: D.levels, music: 'high_moor',
    rooms, halls, entry: { x: 31, y: 76, w: 2 }, exitOut: out, arrival: [31, 74],
    lantern: { id: 'tower_foot', name: 'The Tower Foot', x: 27, y: 68 },
    spawns,
    chests: [{ id: 'watchtower_cache', x: 56, y: 37, name: "The Captain's Chest" }],
    // the Sentinel's fight reads these spots (as the moor's script did): its adds walk in from the stair head
    script: { long_watch: { elite: [49, 6], adds_from: [49, 11], lamps: [[44, 6], [54, 6]], leash: 16 } },
    signs: [{ id: 'tower_order', x: 36, y: 66, text: 'A board by the stair: THE WATCH IS KEPT. Somebody has scratched under it: by whom?' }],
  });
}

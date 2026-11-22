// Tarn Hollow (cave, levels 14 to 16; BRIEF section 2). Under the tarn's south shore on the High Moor: a drowned shrine
// with a pool where its bell fell in, and the mist wolves that den there under Hollowfang. Two rooms and a chest.
// Generated into src/data/maps/tarn_hollow.js by tools/maps/build_world.mjs.
import { carveDungeon, pack, boss } from './dungeon_kit.mjs';
import { DUNGEONS } from '../../src/data/dungeons.js';
import { toWorld } from '../../src/data/maps/layout.js';

export function build() {
  const D = DUNGEONS.tarn_hollow;
  const out = D.door.area ? toWorld(D.door.area, D.door.out[0], D.door.out[1]) : D.door.out;
  const rooms = [
    { id: 'hollow_mouth', name: 'The Hollow Mouth', x: 17, y: 24, w: 10, h: 7 },
    { id: 'drowned_shrine', name: 'The Drowned Shrine', x: 6, y: 3, w: 32, h: 15 },
  ];
  const halls = [{ pts: [[22, 24], [22, 17]], width: 4 }];
  const spawns = [
    ...pack('hollow_a', [['hollow_wolf', 14], ['hollow_wolf', 15]], 11, 13),
    ...pack('hollow_b', [['hollow_wolf', 15], ['hollow_wolf', 14], ['hollow_wolf', 15]], 32, 13),
    boss('hollowfang', 16, 22, 6),
  ];
  return carveDungeon({
    id: 'tarn_hollow', name: D.name, kind: 'cave', w: 44, h: 34, levels: D.levels, music: 'high_moor', floor: 'x1_peat',
    rooms, halls, pools: [[14, 8, 4, 3], [27, 8, 4, 3]], entry: { x: 21, y: 31, w: 2 }, exitOut: out, arrival: [21, 29],
    lantern: { id: 'hollow_mouth', name: 'The Hollow Mouth', x: 19, y: 26 },
    spawns,
    chests: [{ id: 'tarn_cache', x: 35, y: 4, name: "The Shrine's Offering Box" }],
  });
}

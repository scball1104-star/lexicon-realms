// Rootcellar Den (cave, levels 4 to 6; BRIEF section 2). A root cellar dug into the bank at Whisperwood's edge in the
// valley; Old Mother Mudge, a boar sow that went to ground, has made it her den. Two rooms and a chest.
// Generated into src/data/maps/rootcellar.js by tools/maps/build_world.mjs.
import { carveDungeon, pack, boss } from './dungeon_kit.mjs';
import { DUNGEONS } from '../../src/data/dungeons.js';
import { toWorld } from '../../src/data/maps/layout.js';

export function build() {
  const D = DUNGEONS.rootcellar;
  const out = D.door.area ? toWorld(D.door.area, D.door.out[0], D.door.out[1]) : D.door.out;
  const rooms = [
    { id: 'cellar_steps', name: 'The Cellar Steps', x: 15, y: 20, w: 10, h: 7 },
    { id: 'the_den', name: 'The Den', x: 7, y: 3, w: 26, h: 11 },
  ];
  const halls = [{ pts: [[20, 20], [20, 13]], width: 4 }];
  const spawns = [
    ...pack('den_a', [['cellar_piglet', 4], ['cellar_piglet', 5]], 12, 9),
    ...pack('den_b', [['cellar_piglet', 5], ['cellar_piglet', 4], ['cellar_piglet', 5]], 27, 10),
    boss('mother_mudge', 6, 20, 5),
  ];
  return carveDungeon({
    id: 'rootcellar', name: D.name, kind: 'cave', w: 40, h: 30, levels: D.levels, music: 'valley', floor: 'dirt',
    rooms, halls, entry: { x: 19, y: 27, w: 2 }, exitOut: out, arrival: [19, 25],
    lantern: { id: 'cellar_steps', name: 'The Cellar Steps', x: 17, y: 22 },
    spawns,
    chests: [{ id: 'rootcellar_cache', x: 31, y: 4, name: 'A Turnip Crate' }],
  });
}

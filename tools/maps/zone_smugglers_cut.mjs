// Smugglers' Cut (cave, levels 7 to 9; BRIEF section 2). A cleft in the cliff on Gate Road South where smugglers hid
// the lantern oil they stole from Pell. The smugglers are long gone; the oil was not wasted: something drank it.
// A tunnel and one wide room. Generated into src/data/maps/smugglers_cut.js by tools/maps/build_world.mjs.
import { carveDungeon, pack, boss } from './dungeon_kit.mjs';
import { DUNGEONS } from '../../src/data/dungeons.js';

export function build() {
  const D = DUNGEONS.smugglers_cut;
  const out = D.door.out;                        // the door is in the wilds: world tiles already
  const rooms = [
    { id: 'cut_mouth', name: 'The Cut Mouth', x: 4, y: 19, w: 10, h: 8 },
    { id: 'the_hold', name: 'The Hold', x: 24, y: 5, w: 17, h: 21 },
  ];
  const halls = [{ pts: [[13, 22], [24, 22]], width: 4 }];
  const spawns = [
    ...pack('cut_tunnel', [['oil_blot', 7], ['cut_scarab', 7]], 19, 22),
    ...pack('hold_a', [['oil_blot', 8], ['cut_scarab', 8], ['oil_blot', 7]], 29, 19),
    ...pack('hold_b', [['cut_scarab', 8], ['oil_blot', 8]], 37, 21),
    boss('gutterwick', 9, 32, 7),            // at the back of the Hold, well clear of both packs (a pack pull never wakes it)
  ];
  return carveDungeon({
    id: 'smugglers_cut', name: D.name, kind: 'cave', w: 44, h: 30, levels: D.levels, music: 'valley',
    rooms, halls, entry: { x: 8, y: 27, w: 2 }, exitOut: out, arrival: [8, 25],
    lantern: { id: 'cut_mouth', name: 'The Cut Mouth', x: 6, y: 21 },
    spawns,
    chests: [{ id: 'smugglers_cache', x: 39, y: 6, name: "The Smugglers' Stash" }],
  });
}

// The Wethers' Barrow (dungeon, levels 10 to 12; WORLD_2 2.3, D:/LQOnline/dungeons/BRIEF.md). Under the barrow mound
// by the Standing Stones in Shepherd's Downs. The barrow of a reeve who counted the folds and the names: the entry hall
// under the sealed door, the Fold Hall (two packs), the Pinfold where the Bellwether still leads its flock, the Notching
// Room, the Tally Chamber (the Tally-Wife), the Long Barrow (two packs) and the Reeve's Chamber at the end.
// Halls 4 to 5 wide, solid rock elsewhere. Generated into src/data/maps/barrow.js by tools/maps/build_world.mjs.
import { carveDungeon, pack, boss } from './dungeon_kit.mjs';
import { DUNGEONS } from '../../src/data/dungeons.js';
import { toWorld } from '../../src/data/maps/layout.js';

export function build() {
  const D = DUNGEONS.barrow;
  const out = D.door.area ? toWorld(D.door.area, D.door.out[0], D.door.out[1]) : D.door.out;
  const W = 84, H = 60;
  const rooms = [
    { id: 'barrow_entry', name: 'The Sealed Door', x: 36, y: 49, w: 12, h: 8 },
    { id: 'fold_hall', name: 'The Fold Hall', x: 30, y: 31, w: 24, h: 10 },
    { id: 'the_pinfold', name: 'The Pinfold', x: 8, y: 13, w: 16, h: 12 },
    { id: 'notching_room', name: 'The Notching Room', x: 38, y: 10, w: 16, h: 13 },
    { id: 'tally_chamber', name: 'The Tally Chamber', x: 63, y: 8, w: 15, h: 13 },
    { id: 'long_barrow', name: 'The Long Barrow', x: 60, y: 31, w: 20, h: 9 },
    { id: 'reeves_chamber', name: "The Reeve's Chamber", x: 60, y: 44, w: 20, h: 13 },
  ];
  const halls = [
    { pts: [[42, 49], [42, 40]], width: 5 },            // entry -> the Fold Hall
    { pts: [[31, 35], [16, 35], [16, 24]], width: 4 },  // the Fold Hall -> the Pinfold
    { pts: [[23, 18], [38, 18]], width: 4 },            // the Pinfold -> the Notching Room
    { pts: [[53, 15], [63, 15]], width: 4 },            // -> the Tally Chamber
    { pts: [[70, 20], [70, 31]], width: 5 },            // -> the Long Barrow
    { pts: [[70, 39], [70, 44]], width: 5 },            // -> the Reeve's Chamber
  ];
  const spawns = [
    ...pack('fold_a', [['barrow_wether', 10], ['barrow_wether', 10]], 35, 34),
    ...pack('fold_b', [['barrow_shade', 10], ['barrow_wether', 11], ['barrow_wether', 10]], 48, 34),
    ...pack('pin_gate', [['barrow_wether', 11], ['barrow_shade', 10]], 16, 29),
    boss('barrow_bellwether', 11, 15, 17),
    ...pack('notch_a', [['barrow_shade', 11], ['barrow_wether', 11], ['barrow_wether', 11]], 43, 14),
    ...pack('notch_b', [['barrow_shade', 11], ['barrow_shade', 11]], 49, 20),
    boss('barrow_tallywife', 11, 72, 13),
    ...pack('long_a', [['barrow_wether', 12], ['barrow_shade', 11], ['barrow_wether', 11]], 64, 34),
    ...pack('long_b', [['barrow_shade', 12], ['barrow_wether', 12]], 75, 36),
    boss('barrow_reeve', 12, 70, 51),
  ];
  return carveDungeon({
    id: 'barrow', name: D.name, kind: 'dungeon', w: W, h: H, levels: D.levels, music: 'the_downs',
    rooms, halls, entry: { x: 41, y: 57, w: 2 }, exitOut: out, arrival: [41, 55],
    lantern: { id: 'barrow_door', name: 'The Sealed Door', x: 38, y: 51 },
    spawns,
    chests: [{ id: 'barrow_cache', x: 76, y: 10, name: "The Reeve's Strongbox" }],
    signs: [{ id: 'barrow_names', x: 44, y: 49, text: 'Twelve names are cut into the lintel. Under them, a thirteenth line, left blank.' }],
  });
}

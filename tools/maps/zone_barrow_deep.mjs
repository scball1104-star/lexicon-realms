// The Barrow Deep Halls (dungeon, levels 26 to 30; cap 30, BUILDS_2 5.5 "the Barrow grown down"). Under the cairn in the
// heart of the Standing Stones a stair goes down below the Wethers' Barrow and on under the drove roads: the Drove Stair,
// the Long Fold (two packs), the Herd Pen where the Drove-Herd still circles, the Cairn Walk, the Cairn Gallery (the
// Cairn-Counter and its strongbox), the King's Stair and the King's Hall at the bottom, where the Barrow-King keeps the
// oldest count. Halls 5 wide, solid rock elsewhere. Generated into src/data/maps/barrow_deep.js by tools/maps/build_world.mjs.
import { carveDungeon, pack, boss } from './dungeon_kit.mjs';
import { DUNGEONS } from '../../src/data/dungeons.js';
import { toWorld } from '../../src/data/maps/layout.js';

export function build() {
  const D = DUNGEONS.barrow_deep;
  const out = D.door.area ? toWorld(D.door.area, D.door.out[0], D.door.out[1]) : D.door.out;
  const W = 72, H = 84;
  const rooms = [
    { id: 'drove_stair', name: 'The Drove Stair', x: 28, y: 70, w: 16, h: 10 },
    { id: 'long_fold', name: 'The Long Fold', x: 22, y: 50, w: 28, h: 12 },
    { id: 'herd_pen', name: 'The Herd Pen', x: 4, y: 30, w: 20, h: 14 },
    { id: 'cairn_gallery', name: 'The Cairn Gallery', x: 46, y: 28, w: 22, h: 16 },
    { id: 'kings_hall', name: "The King's Hall", x: 22, y: 2, w: 30, h: 14 },
  ];
  const halls = [
    { pts: [[36, 70], [36, 61]], width: 5 },             // the Drove Stair -> the Long Fold
    { pts: [[23, 55], [14, 55], [14, 43]], width: 5 },   // the Long Fold -> the Herd Pen
    { pts: [[23, 37], [46, 37]], width: 5 },             // the Cairn Walk: the Herd Pen -> the Cairn Gallery
    { pts: [[57, 28], [57, 9], [51, 9]], width: 5 },     // the King's Stair: the Gallery -> the King's Hall
  ];
  const spawns = [
    ...pack('fold_a', [['deep_wether', 26], ['drove_shade', 26]], 28, 54),
    ...pack('fold_b', [['cairn_ward', 27], ['deep_wether', 26], ['drove_shade', 27]], 42, 56),
    ...pack('pen_gate', [['deep_wether', 27], ['deep_wether', 27]], 14, 47),
    boss('deep_drove_herd', 27, 12, 35),
    ...pack('cairn_walk', [['drove_shade', 28], ['cairn_ward', 28]], 34, 37),
    ...pack('gallery_a', [['cairn_ward', 28], ['drove_shade', 28]], 51, 40),
    boss('deep_cairn_counter', 28, 61, 33),
    ...pack('kings_stair', [['cairn_ward', 29], ['cairn_ward', 29]], 57, 19),
    ...pack('kings_door', [['drove_shade', 29], ['deep_wether', 29], ['drove_shade', 29]], 54, 8),
    boss('deep_barrow_king', 30, 34, 7),
  ];
  return carveDungeon({
    id: 'barrow_deep', name: D.name, kind: 'dungeon', w: W, h: H, levels: D.levels, music: 'the_downs',
    rooms, halls, entry: { x: 35, y: 80, w: 2 }, exitOut: out, arrival: [35, 78],
    lantern: { id: 'drove_stair', name: 'The Drove Stair', x: 31, y: 72 },
    spawns,
    chests: [{ id: 'deep_halls_cache', x: 65, y: 42, name: "The Drovers' Strongbox" }],
    signs: [{ id: 'drove_stair_marks', x: 40, y: 70, text: 'Sheep marks, hundreds of them, cut into the stair. Every one leads down. None lead up.' }],
  });
}

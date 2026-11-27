// Dungeon and cave doors on the world (dungeons build, 2026-11-22). Pure: the game (src/data/maps/index.js), the map
// build (tools/maps/build_world.mjs, which checks every door) and the tests call the same function.
//
//   withDoors(world, dungeons, places) -> the world zone with each door's join and its `doors` entry added
//   (also any outdoor zone: only the doors whose door.zone is that zone's id; no door.zone means the world)
//
// A door is a join pair: the world join (the door tiles, door.area's own tiles moved by layout.js) moves a hero to the
// place's `arrival`; the place's own exit join (generated, tools/maps/dungeon_kit.mjs) puts them back on `door.out`.
// `doors` is for the renderers: { id, to, name, kind, levels, label: 'Dungeon, levels 10 to 12', x, y, w, h, out, region }.
import { toWorld } from './layout.js';

export function withDoors(world, dungeons, places) {
  const joins = [...world.joins], doors = [...(world.doors || [])];
  for (const d of Object.values(dungeons)) {
    const z = places[d.id];
    if (!z) continue;
    if ((d.door.zone || 'world') !== (world.id || 'world')) continue;     // a door in another outdoor zone (band lane: the Larch Mine in Larchhill)
    const [x, y] = d.door.area ? toWorld(d.door.area, d.door.x, d.door.y) : [d.door.x, d.door.y];
    const out = d.door.area ? toWorld(d.door.area, d.door.out[0], d.door.out[1]) : [...d.door.out];
    const region = d.door.area || null;
    const gate = {
      ...(d.door.minLevel ? { minLevel: d.door.minLevel } : {}),     // cap 30: a door only a hero of this level opens
      ...(d.door.needs ? { needs: d.door.needs } : {}),              // a required quest (the Fair Streets: Pay Going In)
      ...(d.door.notYet ? { notYet: d.door.notYet } : {}),
    };
    joins.push({ x, y, w: d.door.w || 1, h: d.door.h || 1, to: d.id, tx: z.arrival[0], ty: z.arrival[1], dir: d.door.dir || 'up', region, door: d.id, ...gate });
    doors.push({ id: d.id, to: d.id, name: d.name, kind: d.kind, levels: [...d.levels], label: (z.dungeon && z.dungeon.label) || '', x, y, w: d.door.w || 1, h: d.door.h || 1, out, region, ...gate });
  }
  return { ...world, joins, doors };
}

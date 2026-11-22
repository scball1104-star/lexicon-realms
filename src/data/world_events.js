// World events, lite (the open world, 2026-11-22; docs/design/WORLD_2.md 2.3). Plain data.
//
// Night at the Stones: when the sim clock (src/sim/clock.js isNight) turns to night, barrow shades rise inside the ring
// of the Standing Stones on Shepherd's Downs (night spawns: they exist only at night, like every `night` spawn), and
// every shade of the ring's night groups is worth more: bonus kill XP and an extra gear roll. The sim announces the
// start and the end (`world_event` events; src/sim/worldlife.js). Not built: the different music (WORLD_2 2.3).
//
// Spawn spots are WORLD tiles inside the ring (walkable, reachable, 4+ tiles from every other spawn and lantern).
export const WORLD_EVENTS = [
  {
    id: 'night_at_the_stones', name: 'Night at the Stones', region: 'downs', when: 'night',
    at: { x: 28, y: 121, r: 15 },                          // world tiles: the ring
    groups: ['ss_shades_night', 'stones_night'],           // the downs' own two night shades, and the six below
    xpBonus: 0.5,                                          // +50% kill XP
    gear: { chance: 0.2, weights: { magic: 80, rare: 20 } },   // an extra gear roll for the looter's class
    spawns: [[27, 123, 11], [29, 117, 10], [24, 127, 11], [32, 127, 10], [26, 113, 11], [19, 120, 10]].map(([x, y, level]) => ({ mob: 'barrow_shade', level, x, y })),
    text: {
      start: 'Night falls on the Downs. Barrow shades rise inside the Standing Stones.',
      end: 'Dawn on the Downs. The shades at the Standing Stones sink back into the grass.',
    },
  },
];

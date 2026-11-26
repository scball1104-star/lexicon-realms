// The Endmarket raid's places (wave 10 draid, wave A; src/data/raid_endmarket.js has the rest of the raid). Plain data in
// the src/data/dungeons.js shape, merged into DUNGEONS there (as band_dungeons.js is). Wave A is wing 1, the Drove Gate;
// wings 2 and 3 (the Fair Streets, the Tollhall) are waves B and C. Its door stands in Drovers' Reach (`door.zone`), at the
// north end of the Old Drove, and only a hero of level 30 opens it. `raid` marks a raid place for src/sim/raid.js.
export const RAID_PLACES = {
  endmarket_gate: {
    id: 'endmarket_gate', flavour: 'Where the Old Drove ends, the fair never closed. It is still selling.', name: 'The Endmarket: the Drove Gate', kind: 'dungeon', levels: [30, 30],
    raid: { heroes: 4, wing: 1, wings: 3, label: 'Raid for 4, level 30' },
    adds: { hp: 0.6, dmg: 0.6 },
    trash: { hp: 1.0, dmg: 0.55 },               // a party pulls these (src/data/party.js scaling adds the rest)
    door: { zone: 'drovers_reach', x: 302, y: 74, w: 3, h: 1, out: [303, 76], dir: 'up', minLevel: 30 },
    bosses: ['em_turnpike', 'em_old_shep'], last: 'em_old_shep',
    drops: {},
    chest: { gold: [80, 120], rarity: 'rare', ilvl: 30 },
  },
};

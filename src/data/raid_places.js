// The Endmarket raid's places (wave 10 draid; src/data/raid_endmarket.js and raid_endmarket_streets.js have the rest).
// Plain data in the src/data/dungeons.js shape, merged into DUNGEONS there (as band_dungeons.js is). Wave A is wing 1,
// the Drove Gate; wave B is wing 2, the Fair Streets (door beside the Fair Gate, after Pay Going In); wing 3 (the
// Tollhall) is wave C. `raid` marks a raid place for src/sim/raid.js. Every name is a DRAFT for Scott.
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
  // wing 2: the Fair Streets. Door just east of the Fair Gate (306-308,74; 309 is rock, so not 307 or 308,74 w=3).
  // `needs` is Pay Going In; withDoors passes it so checkJoin and the delve enter both wait on that quest.
  endmarket_streets: {
    id: 'endmarket_streets', flavour: 'Past the Fold the stalls still sell names. The fair is one long dusk.', name: 'The Endmarket: the Fair Streets', kind: 'dungeon', levels: [30, 30],
    raid: { heroes: 4, wing: 2, wings: 3, label: 'Raid for 4, level 30' },
    adds: { hp: 0.6, dmg: 0.6 },
    trash: { hp: 1.0, dmg: 0.55 },
    door: { zone: 'drovers_reach', x: 306, y: 74, w: 3, h: 1, out: [307, 76], dir: 'up', minLevel: 30, needs: 'em_pay_going_in',
      notYet: 'The Fair Streets are not open to you yet. Pay Going In first, love.' },
    bosses: ['em_weighmaster', 'em_crier', 'em_catchpole'], last: 'em_catchpole',
    drops: {},
    chest: { gold: [90, 130], rarity: 'rare', ilvl: 30 },
  },
};

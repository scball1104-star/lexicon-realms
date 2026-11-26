// Renown after the level cap (docs/design/PROGRESSION.md, BUILDS_2 5.6). Overflow XP fills Renown levels; each level is
// a choice of +1% to one main stat (cap +10% total), a one-time Lantern Glow, or a gold chest. Plain data: the sim
// reads these through content.progression.renown (src/data/progression.js copies them).
export const RENOWN = Object.freeze({
  // About one late level (xpToNext[29] is 19,040). Flat so every Renown level costs the same.
  xpToNext: 19200,
  goldChest: 200,
  statCap: 10,
  stats: Object.freeze(['sta', 'str', 'agi', 'int', 'spi']),
  statName: Object.freeze({ sta: 'Stamina', str: 'Strength', agi: 'Agility', int: 'Intellect', spi: 'Spirit' }),
});

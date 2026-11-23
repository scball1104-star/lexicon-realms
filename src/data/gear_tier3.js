// The gear tier for levels 20 to 30 (cap 30, Scott 2026-11-22 "Go with all of it"; BUILDS_2 6.8 drop pacing). Plain rows,
// built into ITEMS by src/data/items.js with the same gear() builder as every other piece (weapon dps, armor kit shares and
// value all come from the PROGRESSION formulas at the row's ilvl).
//
//   BAND_DROPS     named world drops by the dropper's level band (DROP_RULES.named, src/sim/loot.js rollKill): any foe of
//                  levels 21 to 25 has a 1% chance to drop one of the band's four pieces (magic, ilvl 23); 26 to 30, the
//                  next four (rare, ilvl 28). Random base gear keeps rolling at the dropper's level as before, with affix
//                  tiers 6 to 8 above ilvl 20 (items.js AFFIX_TIER_TOP).
//   DEEP_GEAR      the Barrow Deep Halls (src/data/dungeons.js barrow_deep, levels 26 to 30): the lesser bosses' magic pool,
//                  the last boss's epic pool and its two legendaries (powers in src/data/legendary_powers.js)
//   DEEP_REWARDS   the Deep Halls quests' choice rewards (src/data/dungeon_quests.js), ilvl 28
// Row: [id, name, slot, type, ilvl, stats, rarity, dungeon?, power?]. 'class' armor rolls to the looter's class; `main` is
// the class's main stat.

export const BAND_DROPS = [
  { from: 21, to: 25, chance: 0.01, rarity: 'magic', rows: [
    ['high_road_leggings', 'High Road Leggings', 'legs', 'class', 23, { main: 4, sta: 5 }],
    ['drystone_gauntlets', 'Drystone Gauntlets', 'hands', 'class', 23, { main: 4, sta: 3 }],
    ['cairn_charm', 'Cairn Charm', 'trinket', null, 23, { main: 3, sta: 4 }],
    ['milestone_helm', 'Milestone Helm', 'head', 'class', 23, { main: 4, sta: 4 }],
  ] },
  { from: 26, to: 30, chance: 0.01, rarity: 'rare', rows: [
    ['long_mile_coat', 'Long-Mile Coat', 'chest', 'class', 28, { main: 6, sta: 7 }],
    ['far_pasture_boots', 'Far Pasture Boots', 'feet', 'class', 28, { main: 4, sta: 5, speed: 2 }],
    ['crook_and_bell_charm', 'Crook-and-Bell Charm', 'trinket', null, 28, { main: 5, sta: 5 }],
    ['ridgeway_gloves', 'Ridgeway Gloves', 'hands', 'class', 28, { main: 5, sta: 4 }],
  ] },
];

export const DEEP_GEAR = [
  // the lesser bosses (the Drove-Herd and the Cairn-Counter): one magic piece the killer's class can use
  ['drove_bell_rod', 'Drove-Bell Rod', 'main', ['rod', 'quill'], 28, { int: 7, spi: 3 }, 'magic', 'barrow_deep'],
  ['barrowking_buckler', "Barrow-King's Buckler", 'off', 'shield', 28, { sta: 7, str: 3 }, 'magic', 'barrow_deep'],
  ['deepway_knives', 'Deepway Knives', 'main', 'dagger', 28, { agi: 6, crit: 2 }, 'magic', 'barrow_deep'],
  ['wether_bone_bow', 'Wether-Bone Bow', 'two', 'bow', 28, { agi: 7, sta: 3 }, 'magic', 'barrow_deep'],
  ['cairnstone_helm', 'Cairnstone Helm', 'head', 'class', 28, { main: 5, sta: 6 }, 'magic', 'barrow_deep'],
  // the last boss (the Barrow-King): an epic, and 1 in 10 a legendary (bad-luck boost +0.5% a miss)
  ['barrow_kings_mantle', "Barrow-King's Mantle", 'chest', 'class', 30, { main: 7, sta: 8 }, 'epic', 'barrow_deep'],
  ['last_drove_token', 'Token of the Last Drove', 'trinket', null, 30, { main: 6, sta: 6, crit: 2 }, 'epic', 'barrow_deep'],
  ['barrow_kings_due', "The Barrow-King's Due", 'trinket', null, 30, { main: 9, sta: 9, crit: 2 }, 'legendary', 'barrow_deep', 'kings_due'],
  ['drovers_horn', "The Drovers' Horn", 'head', 'class', 30, { main: 9, sta: 9 }, 'legendary', 'barrow_deep', 'drovers_horn'],
];

export const DEEP_REWARDS = [
  ['deep_halls_signet', 'Deep Halls Signet', 'trinket', null, 28, { main: 5, sta: 5 }],
  ['stone_counters_gloves', "Stone-Counter's Gloves", 'hands', 'class', 28, { main: 5, sta: 4 }],
  ['drove_road_boots', 'Drove-Road Boots', 'feet', 'class', 28, { sta: 5, main: 4, speed: 3 }],
  ['kings_road_greaves', "King's Road Greaves", 'legs', 'class', 30, { main: 6, sta: 6 }],
  ['barrow_lamp_charm', 'Barrow Lamp Charm', 'trinket', null, 30, { main: 5, spi: 4, sta: 3 }],
  ['ninefold_hood', 'Ninefold Hood', 'head', 'class', 30, { main: 6, sta: 5 }],
];

/** DROP_RULES.named: the band tables as item ids (src/sim/loot.js reads them). */
export const NAMED_BANDS = BAND_DROPS.map((b) => Object.freeze({ from: b.from, to: b.to, chance: b.chance, items: b.rows.map((r) => r[0]) }));

// Legendary item powers (BUILDS_2 6.3, GAP B5). Plain data. A power rides on its item (src/data/items.js `power`); the sim
// reads the worn items' powers (src/sim/stats.js recalcPlayer puts the item ids on `e.powers`):
//   mods    passive stat mods while worn, the same records as a talent's (src/sim/stats.js mod)
//   procs   the same records as a talent's procs (src/sim/combat.js procs): on 'hit' | 'crit' | 'cast' | 'kill' | 'dodge'
//           | 'parry' | 'block' | 'damageTaken' | 'heal', with chance, icd (s), ability, school, when; effects are
//           CONTRACTS 5.2 effect records
//   text    the tooltip line (player-facing: no em dashes)
// Powers here are for every class (the five dungeon legendaries can drop for anyone). Ability ids `lg_*` name the log line.
export const LEGENDARY_POWERS = Object.freeze({
  // the Wethers' Barrow
  reeves_count: {
    id: 'reeves_count', name: "The Reeve's Count",
    text: "Power, The Reeve's Count: your direct hits have a 15% chance to count the foe. It takes 8 shadow damage plus 1.5 a level, and you mend for as much. At most once every 3 s.",
    procs: [{ on: 'hit', direct: true, chance: 0.15, icd: 3, effects: [
      { type: 'damage', to: 'target', amount: { base: 8, perLevel: 1.5 }, school: 'shadow', canCrit: false, ability: 'lg_reeves_count' },
      { type: 'heal', to: 'self', amount: { base: 8, perLevel: 1.5 }, canCrit: false, noThreat: true, ability: 'lg_reeves_count' }] }],
  },
  last_toll: {
    id: 'last_toll', name: 'The Last Toll',
    text: 'Power, The Last Toll: each skill or spell you use has a 10% chance to toll. Foes within 3 tiles take 10 light damage plus 2 a level and are slowed by 30% for 3 s. At most once every 8 s.',
    procs: [{ on: 'cast', chance: 0.1, icd: 8, effects: [
      { type: 'damage', to: 'enemies_near_self', radius: 48, amount: { base: 10, perLevel: 2 }, school: 'light', canCrit: false, ability: 'lg_last_toll' },
      { type: 'aura', to: 'enemies_near_self', radius: 48, aura: { id: 'lg_tolled', name: 'Tolled', icon: 'icon_slow', kind: 'debuff', duration: 3, flags: ['slow'], mods: [{ stat: 'slow', add: 0.3 }] } }] }],
  },
  // the Watchtower
  never_blinks: {
    id: 'never_blinks', name: 'Never Blinks',
    text: 'Power, Never Blinks: +3% dodge. When you are struck, a ward absorbs damage equal to 12% of your health for 6 s. At most once every 20 s.',
    mods: [{ stat: 'dodge', add: 0.03 }],
    procs: [{ on: 'damageTaken', icd: 20, effects: [
      { type: 'aura', to: 'self', aura: { id: 'lg_never_blinks', name: 'Never Blinks', icon: 'mender_warding_word', kind: 'buff', duration: 6, absorb: { pctMaxHp: 0.12 } } }] }],
  },
  last_wick: {
    id: 'last_wick', name: 'The Last Wick',
    text: 'Power, The Last Wick: +2% critical strike. Each foe you defeat gives back 10% of your health and 15% of your Mana, Focus or Resolve.',
    mods: [{ stat: 'crit', add: 0.02 }],
    procs: [{ on: 'kill', effects: [
      { type: 'heal', to: 'self', pctMaxHp: 0.1, canCrit: false, noThreat: true, ability: 'lg_last_wick' },
      { type: 'resource', to: 'self', kind: 'any', pctOfMax: 0.15 }] }],
  },
  // Tarn Hollow
  mistwalk: {
    id: 'mistwalk', name: 'Mistwalk',
    text: 'Power, Mistwalk: +3% dodge. When you dodge or parry, you slip into the mist: 30% faster for 3 s, and your next hit deals 20% more damage. At most once every 6 s.',
    mods: [{ stat: 'dodge', add: 0.03 }],
    procs: ['dodge', 'parry'].map((on) => ({ on, icd: 6, icdKey: 'mistwalk', effects: [
      { type: 'aura', to: 'self', aura: { id: 'lg_mistwalk', name: 'Mistwalk', icon: 'inkblade_fade', kind: 'buff', duration: 3, hitCharges: 1,
        mods: [{ stat: 'speed', add: 0.3 }, { stat: 'damageDone', mul: 1.2 }] } }] })),
  },
  // the Barrow Deep Halls (cap 30, src/data/gear_tier3.js)
  kings_due: {
    id: 'kings_due', name: "The Barrow-King's Due",
    text: "Power, The Barrow-King's Due: your direct hits have a 12% chance to take the king's due. The foe takes 14 shadow damage plus 2.2 a level, and you mend for half as much. At most once every 4 s.",
    procs: [{ on: 'hit', direct: true, chance: 0.12, icd: 4, effects: [
      { type: 'damage', to: 'target', amount: { base: 14, perLevel: 2.2 }, school: 'shadow', canCrit: false, ability: 'lg_kings_due' },
      { type: 'heal', to: 'self', amount: { base: 7, perLevel: 1.1 }, canCrit: false, noThreat: true, ability: 'lg_kings_due' }] }],
  },
  drovers_horn: {
    id: 'drovers_horn', name: "The Drovers' Horn",
    text: "Power, The Drovers' Horn: +4% move speed. Each skill or spell you use has a 10% chance to sound the horn: you and friends within 6 tiles deal 10% more damage for 6 s. At most once every 15 s.",
    mods: [{ stat: 'speed', add: 0.04 }],
    procs: [{ on: 'cast', chance: 0.1, icd: 15, effects: [
      { type: 'aura', to: 'allies_near', radius: 96, aura: { id: 'lg_drovers_horn', name: "Drovers' Horn", icon: 'icon_haste', kind: 'buff', duration: 6, mods: [{ stat: 'damageDone', mul: 1.1 }] } },
      { type: 'aura', to: 'self', aura: { id: 'lg_drovers_horn', name: "Drovers' Horn", icon: 'icon_haste', kind: 'buff', duration: 6, mods: [{ stat: 'damageDone', mul: 1.1 }] } }] }],
  },
});

/** Log and tooltip names of the powers' own ability ids (src/ui/gamedata.js abilityName). */
export const POWER_ABILITY_NAMES = Object.freeze({
  lg_reeves_count: { id: 'lg_reeves_count', name: "The Reeve's Count" },
  lg_last_toll: { id: 'lg_last_toll', name: 'The Last Toll' },
  lg_last_wick: { id: 'lg_last_wick', name: 'The Last Wick' },
  // the rare minor powers and the of Embers affix (polish 2026-11-22)
  mn_searing: { id: 'mn_searing', name: 'Searing' },
  mn_second_wind: { id: 'mn_second_wind', name: 'Second Wind' },
  affix_embers: { id: 'affix_embers', name: 'Embers' },
  lg_kings_due: { id: 'lg_kings_due', name: "The Barrow-King's Due" },
  lg_retold_bell: { id: 'lg_retold_bell', name: 'Bell of the Second Name' },   // wave 10 dloot: the Retold powers' log names
  lg_retold_blot: { id: 'lg_retold_blot', name: 'Spreading Blot' },
});

// ---------------------------------------------------------------- rare minor powers (BUILDS_2 6.1, polish 2026-11-22)
// "From item level 15, 10% of rares roll one minor power (a small legendary-like effect)." Epics roll them too. Same
// records as a power (mods, procs, text); the roll puts the id on the gear instance (`inst.minor`, src/sim/loot.js
// rollGear), the worn ids go on `e.minors` (src/sim/stats.js), and stats.mod / combat.procs read them like powers.
// Kept small on purpose: about a tenth of a legendary power each. For every class.
export const MINOR_POWERS = Object.freeze({
  minor_searing: { id: 'minor_searing', name: 'Searing',
    text: 'Minor power, Searing: your critical hits sear the foe for 3 fire damage plus 0.5 a level. At most once every 4 s.',
    procs: [{ on: 'crit', icd: 4, effects: [{ type: 'damage', to: 'target', amount: { base: 3, perLevel: 0.5 }, school: 'fire', canCrit: false, ability: 'mn_searing' }] }] },
  minor_second_wind: { id: 'minor_second_wind', name: 'Second Wind',
    text: 'Minor power, Second Wind: each foe you defeat gives back 4% of your health.',
    procs: [{ on: 'kill', effects: [{ type: 'heal', to: 'self', pctMaxHp: 0.04, canCrit: false, noThreat: true, ability: 'mn_second_wind' }] }] },
  minor_quickstep: { id: 'minor_quickstep', name: 'Quickstep',
    text: 'Minor power, Quickstep: when you are struck, a 20% chance to move 15% faster for 3 s. At most once every 15 s.',
    procs: [{ on: 'damageTaken', chance: 0.2, icd: 15, effects: [{ type: 'aura', to: 'self', aura: { id: 'mn_quickstep', name: 'Quickstep', icon: 'icon_boots', kind: 'buff', duration: 3, mods: [{ stat: 'speed', add: 0.15 }] } }] }] },
  minor_keen_eye: { id: 'minor_keen_eye', name: 'Keen Eye',
    text: 'Minor power, Keen Eye: +1% critical strike.',
    mods: [{ stat: 'crit', add: 0.01 }] },
  minor_inkwell: { id: 'minor_inkwell', name: 'Inkwell',
    text: 'Minor power, Inkwell: each skill or spell you use has an 8% chance to give back 5% of your Mana, Focus or Resolve. At most once every 10 s.',
    procs: [{ on: 'cast', chance: 0.08, icd: 10, effects: [{ type: 'resource', to: 'self', kind: 'any', pctOfMax: 0.05 }] }] },
  minor_small_ward: { id: 'minor_small_ward', name: 'Small Ward',
    text: 'Minor power, Small Ward: when you are struck, a ward absorbs damage equal to 5% of your health for 6 s. At most once every 30 s.',
    procs: [{ on: 'damageTaken', icd: 30, effects: [{ type: 'aura', to: 'self', aura: { id: 'mn_small_ward', name: 'Small Ward', icon: 'mender_warding_word', kind: 'buff', duration: 6, absorb: { pctMaxHp: 0.05 } } }] }] },
});
/** The roll (src/sim/loot.js rollGear reads content.rarity[r].minor): from this item level, this chance, one of these. */
export const MINOR_RULE = Object.freeze({ fromIlvl: 15, chance: 0.1, powers: MINOR_POWERS });
// ---------------------------------------------------------------- random legendaries (BUILDS_2 6.8, polish 2026-11-22)
// Before this, a legendary came only from a dungeon's last boss (src/data/dungeons.js legend). Now the world's rares and
// the other bosses (a dungeon's lesser bosses, the caves' named foes, the Rootbound's Archivore) have a small chance too.
// Low on purpose (the last bosses stay the place to farm them). src/sim/legend_drops.js reads it as content.legendDrops.
//   fromLevel  the dropper's level from which it can roll (BUILDS_2 6.1: random legendaries from level 10)
//   rare/boss  the chance per kill for the tagger (and each party member who shares the kill: their own roll)
//   ilvlOver   a legendary is in the pool when its item level is at most the dropper's level plus this
// Never from a dungeon's last boss (it has its own roll) and never from a grey foe.
export const LEGEND_DROPS = Object.freeze({ fromLevel: 10, rare: 0.02, boss: 0.025, ilvlOver: 3 });

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
  lg_kings_due: { id: 'lg_kings_due', name: "The Barrow-King's Due" },
});

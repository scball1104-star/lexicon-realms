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
// Skill-changing legendary powers (BUILDS_2 6.3: "legendary item powers that change a skill"). `cls` gates the power to one
// class; `modAbility` is the same patch record as a talent's (src/sim/data.js applies it while the item is worn). Data only
// until an item carries it: the item, its drop source and its visible effect on the hero wait for the brief and stills.
export const SKILL_POWERS = Object.freeze({
  // the Mender (Tidehammer): the Tolling Rod (BUILDS_2_PLAY 1.1). The Wethers' Barrow.
  tolling_rod: { id: 'tolling_rod', name: 'The Tolling Rod', cls: 'mender',
    text: 'Power, The Tolling Rod: Tolling Hammers sends out 5 hammers instead of 3, and they spiral half again as far.',
    modAbility: [
      { id: 'mender_tolling_hammers', path: 'effects.#hammers.object.hammers', set: 5 },
      { id: 'mender_tolling_hammers', path: 'effects.#hammers.object.reach', mul: 1.5 },
    ] },
  // the Warden: Ember Leap twice, and the landing pins them. The Watchtower.
  second_fall: { id: 'second_fall', name: 'Second Fall', cls: 'warden',
    text: 'Power, Second Fall: Ember Leap holds 2 charges, and every foe its landing burns is rooted for 1.5 s.',
    modAbility: [
      { id: 'warden_ember_leap', path: 'charges', set: 2 },
      { id: 'warden_ember_leap', path: 'land', push: { type: 'aura', key: 'pin', to: 'enemies', aura: { id: 'lg_second_fall_root', name: 'Pinned', icon: 'icon_stun', kind: 'debuff', duration: 1.5, flags: ['root'] } } },
    ] },
  // the Scribe: Rewrite reaches elites. The Wethers' Barrow (the Tally-Wife's ledger).
  errata: { id: 'errata', name: 'Errata', cls: 'scribe',
    text: 'Power, Errata: Rewrite works on elites too. An elite stays rewritten for 6 s; any other foe for the full 12 s.',
    modAbility: [
      { id: 'scribe_rewrite', path: 'requires', set: {} },
      { id: 'scribe_rewrite', path: 'effects.#charm.args', set: { duration: 12, eliteDuration: 6 } },
    ] },
  // the Wayfinder: Grapple Line drags anything that is not a boss, and holds it. The Watchtower.
  far_tether: { id: 'far_tether', name: 'The Far Tether', cls: 'wayfinder',
    text: 'Power, The Far Tether: Grapple Line pulls any foe but a boss to you, elites and heavy foes too, and roots it for 1 s when it lands.',
    modAbility: [
      { id: 'wayfinder_grapple_line', path: 'effects.#line.args', set: { anySize: true, root: 1 } },
    ] },
  // the Inkblade: strike from inside the ink. Tarn Hollow.
  unwritten_step: { id: 'unwritten_step', name: 'Unwritten Step', cls: 'inkblade',
    text: 'Power, Unwritten Step: attacking no longer ends Inkwalk. For its 2 s you cut from inside the shadow and nothing can target you.',
    modAbility: [
      { id: 'inkblade_inkwalk', path: 'effects.#walk.aura.breakOn', set: [] },
      { id: 'inkblade_inkwalk', path: 'effects.#walk.aura.duration', set: 2 },
      { id: 'inkblade_inkwalk', path: 'effects.#walk.aura.opener', set: null },
    ] },
});
/** The skill legendaries as items (src/data/items.js): [id, name, slot, type, ilvl, stats, dungeon, power]. Class-only. */
export const SKILL_LEGENDARIES = Object.freeze([
  ['the_tolling_rod', 'The Tolling Rod', 'main', 'rod', 12, { int: 5, spi: 3, crit: 1 }, 'barrow', 'tolling_rod'],
  ['errata_quill', 'The Errata Quill', 'main', 'quill', 12, { int: 5, sta: 3, crit: 1 }, 'barrow', 'errata'],
  ['unwritten_cowl', 'Cowl of the Unwritten Step', 'head', 'class', 16, { main: 6, sta: 6 }, 'tarn_hollow', 'unwritten_step'],
  ['second_fall_sabatons', 'Sabatons of the Second Fall', 'feet', 'class', 20, { main: 7, sta: 7 }, 'watchtower', 'second_fall'],
  ['far_tether_bow', 'The Far Tether', 'two', 'bow', 20, { agi: 8, sta: 4, crit: 1 }, 'watchtower', 'far_tether'],
]);
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

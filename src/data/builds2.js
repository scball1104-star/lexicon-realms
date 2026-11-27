// Builds 2 (docs/design/BUILDS_2.md, approved by Scott 2026-11-19 "yes to all"): six talent tracks per class, a fork at
// tier 3, a keystone at tier 5, a point every level from level 1, skill picks at 1, 3, 6 and 14, signature skills at 10,
// 20 and 35. Plain data plus two tiny pure helpers for the save shape (newBuild, buildFromV1).
//
// PHASE 1 (this file): the Mender, as BUILDS_2 section 9 says, ON since Scott approved the talents screen stills
// (2026-11-19, "Ok. Approved."). PHASE 2 (2026-11-19): the Warden, Scribe, Wayfinder and Inkblade, one file each
// (src/data/builds2_warden.js, _scribe, _wayfinder, _inkblade: six tracks, forks, keystones, the skill picks' new skills and
// the three signatures, with the BUILDS_2_PLAY 1.3 amendments). src/data/progression.js `builds2 = { enabled: true,
// classes: [all five] }`. The window in src/ui/talents2.js reads this file only.
//
// Node shape (the same effect engine as src/data/talents.js; src/sim/data.js reads both):
//   { id, cls, track, tier, maxRanks, fork?: 'a' | 'b', keystone?: true, name, icon, text, byRank: [effect at rank r] }
//   text: '{r*3}' is replaced by r x 3 (the value at the hero's rank; rank 1 when not taken).
// Track shape: { id, name, kind: 'strength' | 'weakness', trait: 'S1'..'W3', purpose, axis: the fork's "X vs Y" (Scott's
//   wording, shown on the fork's card), chip: the same axis short enough for a 98 px column }
// Numbers are the BUILDS_2 section 4.2 design numbers, except Clear Voice and Zealot (tuned 2026-11-19, see the nodes).

const ranks = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));
const pct = (x) => Math.round(x * 1e6) / 1e6;
const lv = (base, perLevel) => ({ base, perLevel });
const mod = (stat, op, extra = {}) => ({ stat, ...op, ...extra });
const abl = (id, path, op) => ({ id, path, ...op });
const R8 = { min: 0, max: 128 };
import { WARDEN, WARDEN_ABILITIES } from './builds2_warden.js';
import { SCRIBE, SCRIBE_ABILITIES } from './builds2_scribe.js';
import { WAYFINDER, WAYFINDER_ABILITIES } from './builds2_wayfinder.js';
import { INKBLADE, INKBLADE_ABILITIES } from './builds2_inkblade.js';
import { CAP30_ABILITIES, joinCap30 } from './builds2_cap30.js';
import { L30_ABILITIES, joinL30 } from './builds2_l30.js';

export const BUILD_VERSION = 1;
export const PICK_LEVELS = [1, 3, 6, 14, 25, 30];   // 25: cap 30 (src/data/builds2_cap30.js); 30: src/data/builds2_l30.js
export const SIGNATURE_LEVELS = [10, 20, 35];

// ------------------------------------------------------------------------------------------------ rules
// Mirrors BUILDS_2 3.1 to 3.4. The sim reads these through content.builds2.rules.
export const RULES = {
  pointsPerLevel: 1,            // from level 1: 1 point at level 1, 15 at 15
  tierStep: 2,                  // tier n opens at (n - 1) x 2 points in that track (today's live rule, kept)
  keystoneLevel: 10,            // keystones need character level 10
  keystoneSlots: [[10, 1], [25, 2], [40, 3]],   // [from level, keystones you may hold]
  undo: 3,                      // the last 3 points spent can be taken back free, out of combat
  freeRespecBelow: 10,          // a full respec is free at any lantern below level 10
  respec: { base: 10, perLevel: 5, cap: 250, firstFree: true },   // from 10: at a trainer, the first one free
  autoSpendUntil: 5,            // auto-spend (on by default) spends each new point on the suggested path to level 5
  buyBack: { 1: 10, 3: 10, 6: 30, 14: 180, 25: 400, 30: 400 },   // 25 and 30: DRAFT price (400 gold). Gold to learn the skill you did not pick, at your trainer ("double gold")
  signatureLevels: SIGNATURE_LEVELS,           // a signature pick (one of the class's three) at each
  lanternReach: 96,             // px: "at a lantern" for the free respec under 10 (2 x the lantern touch distance)
};

// ------------------------------------------------------------------------------------------------ skill picks
// Every class (BUILDS_2 4.x "Skill picks"). `ready: false` = the skill is not built yet (phase 3 of the build order); the
// sim never offers it. Core skills (the two level 1 skills) are known at creation, as today. The Warden's level 6 and 14
// axes are the BUILDS_2_PLAY 1.3 retags ("Others vs Self", "Bank vs Spend").
export const SKILL_PICKS = {
  warden: [
    { level: 1, options: ['warden_sweeping_blow', 'warden_second_wind'], axis: 'Pack vs Self', ready: true },
    { level: 3, options: ['warden_taunt', 'warden_hurl_hammer'], axis: 'Hold vs Reach', ready: true },
    { level: 6, options: ['warden_war_cry', 'warden_iron_hide'], axis: 'Others vs Self', ready: true },
    { level: 14, options: ['warden_oath_of_iron', 'warden_anvil_drop'], axis: 'Bank vs Spend', ready: true },
  ],
  mender: [
    { level: 1, options: ['mender_brand', 'mender_warding_word'], axis: 'Drain vs Shield', ready: true },
    { level: 3, options: ['mender_chorus', 'mender_steady_name'], axis: 'Area vs Single heal over time', ready: true },
    { level: 6, options: ['mender_blessing_stone', 'mender_blessing_flame'], axis: 'Armor boost vs Attack boost', ready: true },
    { level: 14, options: ['mender_purify', 'mender_sunlance'], axis: 'Support vs Burst', ready: true },
  ],
  scribe: [
    { level: 1, options: ['scribe_full_stop', 'scribe_underline'], axis: 'Control vs Over time', ready: true },
    { level: 3, options: ['scribe_scatter_letters', 'scribe_bracket'], axis: 'Area vs Single control', ready: true },
    { level: 6, options: ['scribe_erase', 'scribe_inkwell_pause'], axis: 'Group utility vs Self fuel', ready: true },
    { level: 14, options: ['scribe_exclamation', 'scribe_paragraph'], axis: 'Push away vs Wall off', ready: true },
  ],
  wayfinder: [
    { level: 1, options: ['wayfinder_briar_trap', 'wayfinder_light_foot'], axis: 'Trap vs Escape', ready: true },
    { level: 3, options: ['wayfinder_aimed_shot', 'wayfinder_volley'], axis: 'One target vs Area', ready: true },
    { level: 6, options: ['wayfinder_hunters_mark', 'wayfinder_sand_cloak'], axis: 'Attack boost vs Defense boost', ready: true },
    { level: 14, options: ['wayfinder_hush_arrow', 'wayfinder_scatter_shot'], axis: 'Duel casters vs Push a pack', ready: true },
  ],
  inkblade: [
    { level: 1, options: ['inkblade_fade', 'inkblade_inkstep'], axis: 'Stealth vs Pack', ready: true },
    { level: 3, options: ['inkblade_bleed_line', 'inkblade_ink_in_the_eyes'], axis: 'Over time vs Control', ready: true },
    { level: 6, options: ['inkblade_shadow_mark', 'inkblade_ink_cloak'], axis: 'Attack boost vs Defense boost', ready: true },
    { level: 14, options: ['inkblade_quiet_wire', 'inkblade_throwing_knife'], axis: 'Assassin vs Ranged', ready: true },
  ],
};

// ------------------------------------------------------------------------------------------------ new skills (sim only)
// The Mender's level 6 pick (BUILDS_2 4.2). Merged into the sim's ability table only (src/sim/data.js), so nothing in
// the live game can learn them while the flag is off. Both share one aura id: one Blessing per Mender at a time.
const BLESS = (id, name, icon, mods, text) => ({
  id, name, icon, cls: 'mender', learnLevel: 6, school: 'light',
  cost: { kind: 'mana', amount: lv(12, 2) }, castTime: 0, cooldown: 3, gcd: true, range: null, target: 'none', threatMult: 1,
  area: { shape: 'circle', radius: 128, at: 'self', maxTargets: 5 },
  effects: [{ type: 'aura', key: 'bless', to: 'allies', aura: { id: 'mender_blessing', name, icon, kind: 'buff', dispel: 'magic', duration: 600, unique: 'per_caster', recalc: true, mods } }],
  text,
});
// The Mender's three signatures (BUILDS_2 4.2, the level 10 pick). Play rules in src/sim/scripts_b2.js: the hammers'
// spiral (object script `b2_tolling_hammers`), the flow (`b2_riptide`), and the spirit's recast (refreshes its time).
const MENDER_SIGNATURE_ABILITIES = {
  mender_tolling_hammers: {
    id: 'mender_tolling_hammers', name: 'Tolling Hammers', icon: 'icon_lantern', cls: 'mender', learnLevel: 10, school: 'light',
    cost: { kind: 'mana', amount: lv(20, 3) }, castTime: 0, cooldown: 0, gcd: true, range: null, target: 'none', threatMult: 1,
    // three hammers spiral out from her (they follow her as she walks) from 0.75 to 4.5 tiles over 3 s, a turn a second;
    // each hammer hits each foe it passes once. Every 1% of healing bonus she carries adds 1% (src/sim/scripts_b2.js)
    effects: [{ type: 'summon', key: 'hammers', object: { id: 'mender_tolling_hammers', name: 'Tolling Hammers', sprite: 'zone_peal', at: 'self', armTime: 0, duration: 3, max: 2,
      script: 'b2_tolling_hammers', hammers: 3, from: 12, reach: 72, turn: 1, hitRadius: 16,
      effects: [{ type: 'damage', key: 'hit', amount: lv(1.8, 0.78), coef: { stat: 'sp', k: 0.135 }, school: 'light', canCrit: true }] } }],
    text: 'Three bell-hammers of light spiral out from you over 3 s. Each hits every foe it passes for {dmg}. Every 1% of healing bonus you carry adds 1% to them.',
  },
  mender_riptide_step: {
    id: 'mender_riptide_step', name: 'Riptide Step', icon: 'icon_haste', cls: 'mender', learnLevel: 10, school: 'light',
    cost: { kind: 'mana', amount: lv(8, 1) }, castTime: 0, cooldown: 12, gcd: true, range: null, target: 'none', threatMult: 0.5,
    effects: [{ type: 'script', key: 'flow', name: 'b2_riptide', to: 'self' }],
    // the flow: 7 tiles the way you walk (or face), 0.35 s; everything within 1.5 tiles of the line is passed
    flow: { distance: 112, width: 48, time: 0.35 },
    pass: {
      foes: [{ type: 'aura', key: 'slow', aura: { id: 'mender_riptide_slow', name: 'Riptide', icon: 'icon_haste', kind: 'debuff', duration: 3, flags: ['slow'], mods: [{ stat: 'slow', add: 0.4 }] } }],
      allies: [{ type: 'heal', key: 'heal', amount: lv(10, 4), coef: { stat: 'sp', k: 0.4 }, canCrit: true }],
    },
    text: 'Become water and flow 7 tiles the way you are walking. Foes you pass are slowed 40% for 3 s; friends you pass are healed for {heal}.',
  },
  mender_kindred_light: {
    id: 'mender_kindred_light', name: 'Kindred Light', icon: 'icon_phoenix', cls: 'mender', learnLevel: 10, school: 'light',
    cost: { kind: 'mana', amount: lv(15, 2) }, castTime: 1.5, cooldown: 10, gcd: true, range: null, target: 'none', threatMult: 0,
    effects: [{ type: 'summon', key: 'spirit', object: { id: 'mender_kindred_light', name: 'Kindred Light', sprite: 'ink_double', at: 'self', armTime: 0, duration: 60, max: 1,
      hpPct: 0.4, holdThreat: true,
      pet: { period: 2, range: 24, speed: 96, fly: true, effects: [{ type: 'damage', amount: lv(3, 1.2), coef: { stat: 'sp', k: 0.2 }, school: 'light' }],
        owner: { every: 2, effects: [{ type: 'heal', pctMaxHp: 0.02, canCrit: false, noThreat: true }] } } } }],
    text: 'Call a light spirit for 60 s; calling it again refreshes its time. It has 40% of your health, draws the foes, hits for {dmg} every 2 s and heals you 2% of your max health every 2 s.',
  },
};

// The Mender's level 14 pick (BUILDS_2 4.2): Support vs Burst. Purify strips one harmful effect (hard control first) and
// heals `10 + 4 L + 0.4 SP`; Sunlance is a 3.0 s light lance for `20 + 9 L + 1.2 SP` (design numbers, not tuned yet).
const MENDER_PICK14_ABILITIES = {
  mender_purify: {
    id: 'mender_purify', name: 'Purify', icon: 'icon_light', cls: 'mender', learnLevel: 14, school: 'light',
    cost: { kind: 'mana', amount: lv(8, 1.6) }, castTime: 0, cooldown: 8, gcd: true, range: R8, target: 'ally', threatMult: 1,
    effects: [
      { type: 'dispel', key: 'cleanse', max: 1, kinds: ['magic', 'poison', 'bleed'], flags: ['stun', 'silence', 'root', 'slow'] },
      { type: 'heal', key: 'heal', amount: lv(10, 4), coef: { stat: 'sp', k: 0.4 }, canCrit: true },
    ],
    text: 'Lift one harmful effect from a friend (or yourself), a stun, silence or root first, and heal them for {heal}.',
  },
  mender_sunlance: {
    id: 'mender_sunlance', name: 'Sunlance', icon: 'icon16_light', cls: 'mender', learnLevel: 14, school: 'light',
    cost: { kind: 'mana', amount: lv(14, 2.8) }, castTime: 3.0, cooldown: 6, gcd: true, range: R8, target: 'enemy', threatMult: 1,
    effects: [{ type: 'damage', key: 'hit', amount: lv(20, 9), coef: { stat: 'sp', k: 1.2 }, school: 'light', canCrit: true }],
    text: 'Gather the dawn for 3 s, then drive a lance of light through the foe for {dmg}.',
  },
};

export const B2_ABILITIES = {
  ...MENDER_PICK14_ABILITIES,
  ...MENDER_SIGNATURE_ABILITIES,
  ...WARDEN_ABILITIES, ...SCRIBE_ABILITIES, ...WAYFINDER_ABILITIES, ...INKBLADE_ABILITIES, ...CAP30_ABILITIES, ...L30_ABILITIES,
  mender_blessing_stone: BLESS('mender_blessing_stone', 'Blessing of Stone', 'icon_protect', [{ stat: 'armor', mul: 1.2 }],
    'You and friends within 8 tiles: armor +20% for 10 minutes. One Blessing at a time.'),
  mender_blessing_flame: BLESS('mender_blessing_flame', 'Blessing of Flame', 'icon_fire', [{ stat: 'damageDone', mul: 1.08 }],
    'You and friends within 8 tiles: damage +8% for 10 minutes. One Blessing at a time.'),
};

// ------------------------------------------------------------------------------------------------ Mender tracks
const N = (track, tier, slug, name, maxRanks, icon, text, byRank, extra = {}) =>
  ({ id: `b2_mender_${track}_${slug}`, cls: 'mender', track, tier, maxRanks, name, icon, text, byRank, ...extra });
const healUp = (k, extra = {}) => mod('healingDone', { mul: pct(1 + k) }, extra);
const dmgUp = (k, extra = {}) => mod('damageDone', { mul: pct(1 + k) }, extra);
const MENDER_HEALS = ['mender_mend', 'mender_chorus', 'mender_steady_name'];

const MENDER_TRACKS = [
  { id: 'hearth', name: 'Hearth', kind: 'strength', trait: 'S1', purpose: 'Strength: the best healer', axis: 'Group heal vs Self heal', chip: 'Group vs Self' },
  { id: 'tide', name: 'Tide', kind: 'strength', trait: 'S2', purpose: 'Strength: outlasts anything', axis: 'Direct vs Over time', chip: 'Direct vs Over time' },
  { id: 'dawnbrand', name: 'Dawnbrand', kind: 'strength', trait: 'S3', purpose: 'Strength: light that drains', axis: 'Magic attack vs Physical attack', chip: 'Magic vs Physical' },
  { id: 'bell', name: 'Bell', kind: 'weakness', trait: 'W1', purpose: 'Patches: crowds rattle her', axis: 'Area vs Single target', chip: 'Area vs Single' },
  { id: 'sunfire', name: 'Sunfire', kind: 'weakness', trait: 'W2', purpose: 'Patches: slow to kill', axis: 'Heal vs Damage', chip: 'Heal vs Damage' },
  { id: 'wardlight', name: 'Wardlight', kind: 'weakness', trait: 'W3', purpose: 'Patches: cloth and no escape', axis: 'Magic armor vs Physical armor', chip: 'Spell vs Physical' },
];

const MENDER_NODES = [
  // ---- Hearth (S1: heal)
  N('hearth', 1, 'gentle_hands', 'Gentle Hands', 5, 'mender_hearth_gentle_hands', 'Healing +{r*3}%.', ranks(5, (r) => ({ mods: [healUp(0.03 * r)] }))),
  N('hearth', 2, 'quick_words', 'Quick Words', 5, 'mender_hearth_quick_words', 'Mend casts {r*0.1} s faster.',
    ranks(5, (r) => ({ modAbility: [abl('mender_mend', 'castTime', { add: pct(-0.1 * r) })] }))),
  N('hearth', 3, 'many_names', 'Many Names', 1, 'mender_hearth_many_names',
    'Mend also heals 2 friends near the target for 40% of it. Alone, Chorus heals 25% more.',
    [{ modAbility: [abl('mender_mend', 'effects', { push: { type: 'heal', key: 'many', to: 'allies_near_target', radius: 80, maxTargets: 2, amount: lv(15, 7), coef: { stat: 'sp', k: 1.0 }, mult: 0.4, canCrit: true } })],
      mods: [healUp(0.25, { ability: 'mender_chorus', when: { solo: true } })] }], { fork: 'a' }),
  N('hearth', 3, 'self_kept', 'Self-Kept', 1, 'mender_hearth_kept_close', 'Your heals on yourself +25%; on others -10%.',
    [{ mods: [healUp(0.25, { when: { targetIsSelf: true } }), healUp(-0.10, { when: { targetIsSelf: false } })] }], { fork: 'b' }),
  N('hearth', 4, 'overflow', 'Overflow', 5, 'mender_hearth_spoken_for', '{r*4}% of your overhealing becomes a shield (up to 20% of max health).',
    ranks(5, (r) => ({ mods: [mod('overflowShield', { add: pct(0.04 * r) })] }))),
  N('hearth', 5, 'wellspring', 'Wellspring', 1, 'mender_hearth_hearthfire',
    'Mend is instant on a 6 s cooldown. While it cools, your damage spells heal the lowest friend (you, alone) for 30% of their damage. Mend costs 25% more.',
    [{ modAbility: [abl('mender_mend', 'castTime', { set: 0 }), abl('mender_mend', 'cooldown', { set: 6 }), abl('mender_mend', 'cost.amount', { mul: 1.25 })],
      procs: [{ on: 'hit', ability: ['mender_kindle', 'mender_chorus'], when: { cooling: 'mender_mend' }, effects: [{ type: 'heal', to: 'lowest_ally', pctOfDamage: 0.3, canCrit: false, noThreat: true, ability: 'b2_wellspring' }] }] }],
    { keystone: true }),

  // ---- Tide (S2: outlast)
  N('tide', 1, 'deep_well', 'Deep Well', 5, 'mender_hearth_deep_well', 'Max mana +{r*3}%.', ranks(5, (r) => ({ mods: [mod('manaMax', { mul: pct(1 + 0.03 * r) })] }))),
  N('tide', 2, 'long_vigil', 'Long Vigil', 5, 'mender_hearth_bell_of_rest', 'After 8 s in a fight, mana regen +{r*6}%.',
    ranks(5, (r) => ({ mods: [mod('manaRegen', { mul: pct(1 + 0.06 * r) }, { when: { inCombatFor: 8 } })] }))),
  N('tide', 3, 'flood', 'Flood', 1, 'mender_hearth_quiet_mind', 'Direct spells and heals +12%; over time -10%.',
    [{ mods: [dmgUp(0.12, { direct: true }), healUp(0.12, { direct: true }), dmgUp(-0.10, { periodic: true }), healUp(-0.10, { periodic: true })] }], { fork: 'a' }),
  N('tide', 3, 'undertow', 'Undertow', 1, 'mender_kindling_long_burn', 'Brand and your heals over time last 50% longer and tick 10% harder; direct -5%.',
    [{ modAbility: [abl('mender_brand', 'effects.#brand.aura.duration', { mul: 1.5 }), abl('mender_steady_name', 'effects.#hot.aura.duration', { mul: 1.5 })],
      mods: [dmgUp(0.10, { periodic: true }), healUp(0.10, { periodic: true }), dmgUp(-0.05, { direct: true }), healUp(-0.05, { direct: true })] }], { fork: 'b' }),
  N('tide', 4, 'ebb', 'Ebb', 5, 'mender_hearth_hearthside', 'Each Brand tick returns {r*0.4}% of your max mana.',
    ranks(5, (r) => ({ procs: [{ on: 'periodic', ability: 'mender_brand', effects: [{ type: 'resource', to: 'self', kind: 'mana', pctOfMax: pct(0.004 * r) }] }] }))),
  N('tide', 5, 'neap_tide', 'Neap Tide', 1, 'mender_hearth_name_twice', 'Long Light keeps climbing: +5% every 8 s, to +40%. The first 8 s of a fight deal 15% less.',
    [{ mods: [dmgUp(-0.15, { when: { combatUnder: 8 } }), dmgUp(pct(1.25 / 1.2 - 1), { when: { inCombatFor: 24 } }), dmgUp(pct(1.30 / 1.25 - 1), { when: { inCombatFor: 32 } }),
      dmgUp(pct(1.35 / 1.30 - 1), { when: { inCombatFor: 40 } }), dmgUp(pct(1.40 / 1.35 - 1), { when: { inCombatFor: 48 } })] }], { keystone: true }),

  // ---- Dawnbrand (S3: drain)
  N('dawnbrand', 1, 'searing_name', 'Searing Name', 5, 'mender_kindling_bright_coal', 'Brand damage +{r*3}%.',
    ranks(5, (r) => ({ mods: [dmgUp(0.03 * r, { ability: 'mender_brand' })] }))),
  N('dawnbrand', 2, 'bright_drain', 'Bright Drain', 5, 'mender_kindling_hungry_flame', "Brand's Kindle heal +{r*3}% (from 25%).",
    ranks(5, (r) => ({ modAbility: [abl('mender_brand', 'effects.#brand.aura.procs.0.effects.0.pctOfDamage', { set: pct(0.25 + 0.03 * r) })] }))),
  N('dawnbrand', 3, 'pure_light', 'Pure Light', 1, 'mender_kindling_ash_and_ember', 'All your damage is light, and spell damage +8%.',
    [{ script: 'all_light', mods: [dmgUp(0.08, { school: 'spell' })] }], { fork: 'a' }),
  N('dawnbrand', 3, 'bell_and_rod', 'Bell and Rod', 1, 'mender_auto', "Rod hits +60% and add 30% of spell power; they count as Kindle for Brand's heal.",
    [{ mods: [dmgUp(0.6, { ability: 'auto' }), mod('autoSp', { add: 0.3 })],
      modAbility: [abl('mender_brand', 'effects.#brand.aura.procs.0.ability', { set: ['mender_kindle', 'auto'] })] }], { fork: 'b' }),
  N('dawnbrand', 4, 'lingering_brand', 'Lingering Brand', 5, 'mender_kindling_firebrand', 'When a Branded foe dies, Brand jumps to the nearest foe within 4 tiles with {r*20}% of its time left.',
    ranks(5, (r) => ({ mods: [mod('brandJump', { add: pct(0.2 * r) })] }))),
  N('dawnbrand', 5, 'radiance', 'Radiance', 1, 'mender_kindling_flame_that_mends', '30% of your light damage heals the lowest friend (you, alone). Direct heals cost 20% more.',
    [{ mods: [mod('leechLowest', { add: 0.3 }, { school: 'light' })],
      modAbility: [abl('mender_mend', 'cost.amount', { mul: 1.2 }), abl('mender_chorus', 'cost.amount', { mul: 1.2 })] }], { keystone: true }),

  // ---- Bell (W1: packs)
  // tuned 2026-11-19 (qa/sim/builds2.mjs gate): 20% per rank took a whole Kindle off a solo fight by rank 2
  N('bell', 1, 'clear_voice', 'Clear Voice', 5, 'mender_bell_clear_voice', 'Hits push your casts back {r*10}% less.',
    ranks(5, (r) => ({ mods: [mod('pushback', { mul: pct(Math.max(0, 1 - 0.1 * r)) })] }))),
  N('bell', 2, 'toll', 'Toll', 5, 'mender_bell_toll', 'Chorus cooldown -{r*1} s and damage +{r*3}%.',
    ranks(5, (r) => ({ modAbility: [abl('mender_chorus', 'cooldown', { add: -r })], mods: [dmgUp(0.03 * r, { ability: 'mender_chorus' })] }))),
  N('bell', 3, 'wide_peal', 'Wide Peal', 1, 'mender_bell_alarm_bell', 'Chorus reaches 8 tiles and up to 8 foes; its damage -10%.',
    [{ modAbility: [abl('mender_chorus', 'area.radius', { set: 128 }), abl('mender_chorus', 'area.maxTargets', { set: 8 })], mods: [dmgUp(-0.1, { ability: 'mender_chorus' })] }], { fork: 'a' }),
  N('bell', 3, 'focused_peal', 'Focused Peal', 1, 'mender_bell_bell_hum', 'Chorus hits only your target, for 220%, and heals 30% more.',
    [{ modAbility: [abl('mender_chorus', 'effects.#hit.to', { set: 'my_target' }), abl('mender_chorus', 'effects.#hit.mult', { set: 2.2 })],
      mods: [healUp(0.3, { ability: 'mender_chorus' })] }], { fork: 'b' }),
  N('bell', 4, 'ring_back', 'Ring Back', 5, 'mender_bell_still_air', 'Chorus knocks foes back {r*0.4} tiles.',
    ranks(5, (r) => ({ modAbility: [abl('mender_chorus', 'effects', { push: { type: 'move', key: 'ring', to: 'enemies', kind: 'knockback', distance: pct(6.4 * r), time: 0.2 } })] }))),
  N('bell', 5, 'great_bell', 'Great Bell', 1, 'mender_bell_sanctuary_peal', 'Chorus is instant and leaves a bell for 6 s that rings 30% of a Chorus every 2 s. Chorus cooldown +10 s.',
    [{ modAbility: [abl('mender_chorus', 'castTime', { set: 0 }), abl('mender_chorus', 'cooldown', { add: 10 }),
      abl('mender_chorus', 'effects', { push: { type: 'summon', key: 'bell', object: { id: 'mender_great_bell', sprite: 'zone_peal', at: 'self', armTime: 0, duration: 6, period: 2, max: 1, radius: 96, maxTargets: 6,
        pulse: [{ type: 'damage', amount: lv(8, 3), coef: { stat: 'sp', k: 0.35 }, mult: 0.3, school: 'light', canCrit: true }],
        pulseAllies: [{ type: 'heal', amount: lv(12, 5), coef: { stat: 'sp', k: 0.5 }, mult: 0.3, canCrit: true }] } } })] }], { keystone: true }),

  // ---- Sunfire (W2: damage)
  N('sunfire', 1, 'kindling', 'Kindling', 5, 'mender_kindle', 'Kindle damage +{r*3}%.', ranks(5, (r) => ({ mods: [dmgUp(0.03 * r, { ability: 'mender_kindle' })] }))),
  N('sunfire', 2, 'flare', 'Flare', 5, 'mender_kindling_searing', 'Spell crit +{r*1.5}%.', ranks(5, (r) => ({ mods: [mod('crit', { add: pct(0.015 * r) }, { school: 'spell' })] }))),
  // tuned 2026-11-19 (qa/sim/builds2.mjs gate): +20% / -25% put the Tidehammer under the 9 s floor
  N('sunfire', 3, 'zealot', 'Zealot', 1, 'mender_kindling_pyre_word', 'Damage +10%, healing -20%.', [{ mods: [dmgUp(0.1), healUp(-0.2)] }], { fork: 'a' }),
  N('sunfire', 3, 'balance', 'Balance', 1, 'mender_kindling_daze_of_light', 'Each heal makes your next Kindle +25%; each Kindle, your next heal +25%.',
    [{ procs: [
      { on: 'cast', ability: ['mender_mend', 'mender_chorus', 'mender_steady_name'], effects: [{ type: 'aura', to: 'self', aura: { id: 'b2_balance_kindle', name: 'Balance', icon: 'mender_kindle', kind: 'buff', duration: 15,
        consumeOn: { cast: 'mender_kindle' }, mods: [{ stat: 'damageDone', mul: 1.25, ability: 'mender_kindle' }] } }] },
      { on: 'cast', ability: 'mender_kindle', effects: [{ type: 'aura', to: 'self', aura: { id: 'b2_balance_heal', name: 'Balance', icon: 'mender_mend', kind: 'buff', duration: 15,
        consumeOn: { cast: MENDER_HEALS }, mods: [{ stat: 'healingDone', mul: 1.25, ability: MENDER_HEALS }] } }] }] }], { fork: 'b' }),
  N('sunfire', 4, 'sunburst', 'Sunburst', 5, 'mender_kindling_bellows', 'Kindle crits splash {r*10}% to foes within 2 tiles.',
    ranks(5, (r) => ({ procs: [{ on: 'crit', ability: 'mender_kindle', effects: [{ type: 'damage', to: 'enemies_near_holder', radius: 32, excludeHolder: true, pctOfDamage: pct(0.1 * r), school: 'light', canCrit: false, ability: 'b2_sunburst' }] }] }))),
  N('sunfire', 5, 'dawnfall', 'Dawnfall', 1, 'mender_brand', 'Kindle is held to a 2.5 s cast for +80% and a 1 s stun. It costs 50% more.',
    [{ modAbility: [abl('mender_kindle', 'castTime', { set: 2.5 }), abl('mender_kindle', 'cost.amount', { mul: 1.5 }), abl('mender_kindle', 'effects.#hit.mult', { set: 1.8 }),
      abl('mender_kindle', 'effects', { push: { type: 'aura', key: 'dawnfall', aura: { id: 'b2_dawnfall_stun', name: 'Dawnfall', icon: 'icon_stun', kind: 'debuff', duration: 1, flags: ['stun'] } } })] }],
    { keystone: true }),

  // ---- Wardlight (W3: survive)
  N('wardlight', 1, 'steadfast_ward', 'Steadfast Ward', 5, 'mender_warding_word', 'Warding Word absorbs +{r*4}%.',
    ranks(5, (r) => ({ mods: [mod('absorbDone', { mul: pct(1 + 0.04 * r) }, { ability: 'mender_warding_word' })] }))),
  N('wardlight', 2, 'blessed_cloth', 'Blessed Cloth', 5, 'mender_bell_shelter', 'Armor +{r*6}%.', ranks(5, (r) => ({ mods: [mod('armor', { mul: pct(1 + 0.06 * r) })] }))),
  N('wardlight', 3, 'moonward', 'Moonward', 1, 'mender_bell_ringing_ward', 'Spell damage taken -15%.', [{ mods: [mod('damageTaken', { mul: 0.85 }, { school: 'spell' })] }], { fork: 'a' }),
  N('wardlight', 3, 'tideplate', 'Tideplate', 1, 'mender_bell_ward_keeper', 'Physical damage taken -12%.', [{ mods: [mod('damageTaken', { mul: 0.88 }, { school: 'physical' })] }], { fork: 'b' }),
  N('wardlight', 4, 'last_light', 'Last Light', 5, 'mender_steady_name', 'A hit that leaves you under 30% gives you a shield of {r*4}% of your max health. Once per 45 s.',
    ranks(5, (r) => ({ procs: [{ on: 'damageTaken', icd: 45, when: { selfHpBelow: 0.3 }, effects: [{ type: 'aura', to: 'self', aura: { id: 'b2_last_light', name: 'Last Light', icon: 'mender_warding_word', kind: 'buff', duration: 10, absorb: { pctMaxHp: pct(0.04 * r) } } }] }] }))),
  N('wardlight', 5, 'unbroken', 'Unbroken', 1, 'mender_bell_bellward', 'Warding Word on yourself can be cast again 5 s after it breaks. It costs 40% more.',
    [{ modAbility: [abl('mender_warding_word', 'cost.amount', { mul: 1.4 }), abl('mender_warding_word', 'effects.#ward.aura.onBreak', { push: { type: 'script', name: 'unbroken' } })] }],
    { keystone: true }),
];

// ------------------------------------------------------------------------------------------------ signatures
// The level 10 pick (BUILDS_2 4.2), built 2026-11-19: the skills are MENDER_SIGNATURE_ABILITIES above.
const MENDER_SIGNATURES = [
  { id: 'mender_tolling_hammers', name: 'Tolling Hammers', icon: 'icon_lantern', ready: true,
    text: 'Three bell-hammers of light spiral out from you over 3 s and hit each foe they pass. Every 1% of healing bonus adds 1% to them.' },
  { id: 'mender_riptide_step', name: 'Riptide Step', icon: 'icon_haste', ready: true,
    text: 'Become water and flow 7 tiles. Foes you pass are slowed 40%; friends you pass are healed.' },
  { id: 'mender_kindred_light', name: 'Kindred Light', icon: 'icon_phoenix', ready: true,
    text: 'Summon a light spirit for 60 s. It takes threat, hits, and heals you 2% of max health every 2 s.' },
];

// ------------------------------------------------------------------------------------------------ named builds
// The three leanings (BUILDS_2 4.2 "Named builds"). `path` is the suggested spend order (a node id per point, repeats
// for ranks), 15 points to the phase 1 cap and 5 more to the cap 20 (MENDER_PAST_15 below); `picks` is the suggested skill per pick level. The gold star on the talents
// screen is the first path step not yet taken. Tuned 2026-11-19 to the BUILDS_2 targets (one plain foe in 9 to 14 s from
// level 5, the slowest build within 25% of the fastest): each path spends its first points on the build's defensive or
// healing track, and its damage later. The gate is qa/sim/builds2.mjs (it fails when a build misses its band).
const P = (track, slug) => `b2_mender_${track}_${slug}`;
const rep = (id, n) => Array.from({ length: n }, () => id);
const MENDER_BUILDS = [
  { id: 'tidehammer', name: 'Tidehammer', line: 'Spin hammers through packs; healing power fuels the damage.', tracks: ['sunfire', 'bell', 'hearth'], signature: 'mender_tolling_hammers', signatures: ['mender_tolling_hammers', 'mender_riptide_step', 'mender_kindred_light'],
    picks: { 1: 'mender_brand', 3: 'mender_chorus', 6: 'mender_blessing_stone', 14: 'mender_sunlance' },
    path: [...rep(P('bell', 'clear_voice'), 2), ...rep(P('hearth', 'gentle_hands'), 2), ...rep(P('bell', 'toll'), 2), P('bell', 'wide_peal'),
      ...rep(P('sunfire', 'kindling'), 2), ...rep(P('sunfire', 'flare'), 2), P('sunfire', 'zealot'), P('sunfire', 'kindling'), ...rep(P('sunfire', 'sunburst'), 2)] },
  { id: 'lamplighter', name: 'Lamplighter', line: 'Brand drains the foe while you outlast it; slow and nearly unkillable.', tracks: ['tide', 'dawnbrand', 'wardlight'], signature: 'mender_kindred_light', signatures: ['mender_kindred_light', 'mender_tolling_hammers', 'mender_riptide_step'],
    picks: { 1: 'mender_brand', 3: 'mender_steady_name', 6: 'mender_blessing_stone', 14: 'mender_purify' },
    path: [...rep(P('tide', 'deep_well'), 2), ...rep(P('tide', 'long_vigil'), 2), P('wardlight', 'steadfast_ward'), ...rep(P('dawnbrand', 'searing_name'), 2),
      ...rep(P('dawnbrand', 'bright_drain'), 2), P('tide', 'undertow'), P('dawnbrand', 'pure_light'), P('wardlight', 'steadfast_ward'), P('tide', 'deep_well'), ...rep(P('tide', 'ebb'), 2)] },
  { id: 'battle_mender', name: 'Battle Mender', line: 'A cloth brawler with a rod who heals off her own hits.', tracks: ['dawnbrand', 'wardlight', 'hearth'], signature: 'mender_riptide_step', signatures: ['mender_riptide_step', 'mender_tolling_hammers', 'mender_kindred_light'],
    picks: { 1: 'mender_brand', 3: 'mender_steady_name', 6: 'mender_blessing_stone', 14: 'mender_purify' }, melee: true,
    path: [...rep(P('wardlight', 'steadfast_ward'), 2), ...rep(P('wardlight', 'blessed_cloth'), 2), ...rep(P('dawnbrand', 'searing_name'), 2),
      ...rep(P('dawnbrand', 'bright_drain'), 2), P('wardlight', 'tideplate'), P('dawnbrand', 'bell_and_rod'),
      ...rep(P('hearth', 'gentle_hands'), 2), ...rep(P('hearth', 'quick_words'), 2), P('hearth', 'self_kept')] },
];

// Cap 20 (phase 5, BUILDS_2 5.4): five more points per build for levels 16 to 20, on the build's own tracks (ranks the
// first 15 points left unfilled; no new forks, keystones or skills). qa/sim/builds2.mjs gates every level to 20.
const MENDER_PAST_15 = {
  // cap 30 (src/data/builds2_cap30.js): Clear Voice and Toll, not two Kindling and two Flare, at 16 to 19: with Kindred
  // Light as its second signature at 20 the Tidehammer killed one foe in 8.9 s (under the 9 s floor)
  tidehammer: [...rep(P('bell', 'clear_voice'), 2), ...rep(P('bell', 'toll'), 2), P('sunfire', 'sunburst')],
  lamplighter: [...rep(P('tide', 'deep_well'), 2), ...rep(P('tide', 'long_vigil'), 2), P('wardlight', 'blessed_cloth')],
  battle_mender: [...rep(P('dawnbrand', 'searing_name'), 2), ...rep(P('dawnbrand', 'bright_drain'), 2), P('dawnbrand', 'lingering_brand')],
};
for (const b of MENDER_BUILDS) b.path.push(...MENDER_PAST_15[b.id]);

export const BUILDS2 = {
  warden: WARDEN,
  scribe: SCRIBE,
  wayfinder: WAYFINDER,
  inkblade: INKBLADE,
  mender: {
    tracks: MENDER_TRACKS,
    nodes: Object.fromEntries(MENDER_NODES.map((n) => [n.id, n])),
    signatures: MENDER_SIGNATURES,
    signatureAxis: 'Hammers vs Water vs Spirit',
    builds: MENDER_BUILDS,
    defaultBuild: 'tidehammer',          // "Let my trainer choose"
    // baseline strengths and weaknesses that are new in Builds 2 (BUILDS_2 4.2): S1 healing done +10%
    baseline: { mods: [{ stat: 'healingDone', mul: 1.1 }] },
  },
};
// Cap 30 (src/data/builds2_cap30.js): the level 25 pick for every class and ten more points per named build (21 to 30)
joinCap30(BUILDS2, SKILL_PICKS);
// Level 30 pick (src/data/builds2_l30.js): one more pick per class
joinL30(BUILDS2, SKILL_PICKS);

// ------------------------------------------------------------------------------------------------ save shape helpers
/** A fresh v1 build record (lives in the character save at state.build, save v2). */
export function newBuild() {
  return { v: BUILD_VERSION, ranks: {}, undo: [], picks: {}, bought: [], sigs: [], granted: [], leaning: null, auto: true, respecs: 0,
    freeRespec: false, freeRespecWhy: null, firstKill: false, legacyTalents: null };
}

/**
 * The build for a hero saved before Builds 2 (save v1 to v2). Every old talent point is refunded (the old talents are
 * kept in `legacyTalents` and still drive today's screen while the flag is off); a one-time free respec is flagged so the
 * talents screen can say why. Skill picks the hero already covers are marked taken, so nobody loses a button.
 */
export function buildFromV1({ cls, level = 1, xp = 0, known = [], talents = {}, questsDone = [] } = {}) {
  const b = newBuild();
  for (const p of SKILL_PICKS[cls] || []) {
    const have = p.options.find((id) => known.includes(id));
    if (have) b.picks[p.level] = have;
    const other = p.options.find((id) => id !== have && known.includes(id));
    if (have && other) b.bought.push(other);
  }
  b.auto = level < RULES.autoSpendUntil;
  b.firstKill = level > 1 || xp > 0 || (questsDone || []).length > 0;
  b.freeRespec = true;
  b.freeRespecWhy = 'builds2';
  b.legacyTalents = talents && Object.keys(talents).length ? { ...talents } : null;
  return b;
}

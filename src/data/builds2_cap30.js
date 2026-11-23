// Cap 30 (BUILDS_2 phase 10, the 20 to 30 band; Scott 2026-11-22 "Go with all of it"). Plain data, joined in
// src/data/builds2.js:
//   PICKS_25        the level 25 skill pick for every class (BUILDS_2_PLAY 1.3, written then "locked until cap 30")
//   CAP30_ABILITIES the ten level 25 skills. A pick with `passive` never sits on the bar and is never cast: while it is
//                   known its `passive` = { mods, procs, modAbility } joins the hero's talent effects (src/sim/data.js)
//   PAST_20         ten more points per named build for levels 21 to 30, on the build's own tracks; four builds reach a
//                   second keystone or fork (keystone slots: 1 at 10, 2 at 25, RULES.keystoneSlots)
//   PICK_25_OF      the suggested level 25 pick per named build
// Every number is a first-pass design number, gated by qa/sim/builds2.mjs at every level to 30 (one plain foe in 9 to 14 s,
// the slowest build of a class within 25% of its fastest). Where the effect engine cannot say a design line exactly, the
// text says what the sim does (Hammerfall: 1 Strike in 4 at random, not every 4th).
import { pct, lv, mod, abl, rep, dmgUp, healUp, pathMaker } from './builds2_kit.js';

export const PICK_25_LEVEL = 25;

export const PICKS_25 = {
  warden: { level: 25, options: ['warden_slag_brand', 'warden_hammerfall'], axis: 'Fire vs Steel', ready: true },
  mender: { level: 25, options: ['mender_sanctuary_toll', 'mender_inner_bell'], axis: 'Group vs Self', ready: true },
  scribe: { level: 25, options: ['scribe_run_on_sentence', 'scribe_full_caps'], axis: 'Over time vs Burst', ready: true },
  wayfinder: { level: 25, options: ['wayfinder_tanglewire', 'wayfinder_broadhead'], axis: 'Snare vs Damage', ready: true },
  inkblade: { level: 25, options: ['inkblade_gall_ink', 'inkblade_opened_vein'], axis: 'Poison vs Bleed', ready: true },
};

const PASSIVE = (id, name, icon, cls, school, passive, text) => ({
  id, name, icon, cls, learnLevel: 25, school, cost: null, castTime: 0, cooldown: 0, gcd: false, range: null, target: 'none', threatMult: 0,
  effects: [], passive, text,
});

export const CAP30_ABILITIES = {
  // ---- Warden: Fire vs Steel
  warden_slag_brand: PASSIVE('warden_slag_brand', 'Slag Brand', 'icon_fire', 'warden', 'fire', {
    modAbility: [abl('warden_strike', 'effects', { push: { type: 'aura', key: 'slag', aura: { id: 'warden_slag', name: 'Slag', icon: 'icon_fire', kind: 'debuff', dispel: 'magic',
      duration: 6, period: 1, maxStacks: 2, refresh: 'stack', unique: 'per_caster', tick: [{ type: 'damage', amount: lv(2, 0.6), school: 'fire', canCrit: false }] } } })],
  }, 'Passive. Strike leaves molten slag on the foe: it burns for 2 + 0.6 x your level fire a second for 6 s, and stacks twice.'),
  warden_hammerfall: PASSIVE('warden_hammerfall', 'Hammerfall', 'icon16_sword', 'warden', 'physical', {
    procs: [{ on: 'hit', ability: 'warden_strike', chance: 0.25, effects: [
      { type: 'damage', to: 'target', pctOfDamage: 0.6, school: 'physical', canCrit: false, ability: 'warden_hammerfall' },
      { type: 'aura', to: 'target', aura: { id: 'warden_hammerfall_stagger', name: 'Staggered', icon: 'stun', kind: 'debuff', duration: 0.5, flags: ['stun'] } }] }],
  }, 'Passive. One Strike in four is a steel blow: 60% more damage and a 0.5 s stagger.'),

  // ---- Mender: Group vs Self (adds a pick; changes no Mender number)
  mender_sanctuary_toll: {
    id: 'mender_sanctuary_toll', name: 'Sanctuary Toll', icon: 'icon_protect', cls: 'mender', learnLevel: 25, school: 'light',
    cost: { kind: 'mana', amount: lv(20, 2) }, castTime: 0, cooldown: 45, gcd: true, range: null, target: 'none', threatMult: 0.5,
    area: { shape: 'circle', radius: 80, at: 'self', maxTargets: 5 },
    effects: [{ type: 'aura', key: 'toll', to: 'allies', aura: { id: 'mender_sanctuary_toll', name: 'Sanctuary', icon: 'icon_protect', kind: 'buff', dispel: 'magic', duration: 6,
      mods: [{ stat: 'damageTaken', mul: 0.8 }] } }],
    text: 'Ring a sanctuary bell: you and friends within 5 tiles take 20% less damage for 6 s.',
  },
  mender_inner_bell: {
    id: 'mender_inner_bell', name: 'Inner Bell', icon: 'icon_lantern', cls: 'mender', learnLevel: 25, school: 'light',
    cost: { kind: 'mana', amount: lv(12, 1.5) }, castTime: 0, cooldown: 45, gcd: true, range: null, target: 'self', threatMult: 0.5,
    effects: [{ type: 'aura', key: 'bell', to: 'self', aura: { id: 'mender_inner_bell', name: 'Inner Bell', icon: 'icon_lantern', kind: 'buff', dispel: 'magic', duration: 8, period: 1,
      mods: [{ stat: 'pushback', mul: 0 }], tick: [{ type: 'heal', pctMaxHp: 0.03, canCrit: false, noThreat: true }] } }],
    text: 'A bell rings inside you for 8 s: you heal 3% of your max health a second and hits do not push your casts back.',
  },

  // ---- Scribe: Over time vs Burst
  scribe_run_on_sentence: PASSIVE('scribe_run_on_sentence', 'Run-On Sentence', 'inkbolt', 'scribe', 'ink', {
    mods: [dmgUp(-0.15, { ability: 'scribe_inkbolt', direct: true })],
    // 40% of the hit over 8 s: four ticks of a tenth of Inkbolt's own formula (12 + 5.4 L + 0.8 SP)
    modAbility: [abl('scribe_inkbolt', 'effects', { push: { type: 'aura', key: 'run_on', aura: { id: 'scribe_run_on', name: 'Run-On', icon: 'inkbolt', kind: 'debuff', dispel: 'magic',
      duration: 8, period: 2, unique: 'per_caster', tick: [{ type: 'damage', amount: lv(1.2, 0.54), coef: { stat: 'sp', k: 0.08 }, school: 'ink', canCrit: false }] } } })],
  }, 'Passive. Inkbolt leaves a line of ink on the foe that deals 40% of the hit again over 8 s. Its direct hit deals 15% less.'),
  scribe_full_caps: {
    id: 'scribe_full_caps', name: 'Full Caps', icon: 'icon_magic', cls: 'scribe', learnLevel: 25, school: 'ink',
    cost: { kind: 'mana', amount: lv(6, 0.8) }, castTime: 0, cooldown: 20, gcd: false, range: null, target: 'self', threatMult: 0,
    effects: [{ type: 'aura', key: 'caps', to: 'self', aura: { id: 'scribe_full_caps', name: 'Full Caps', icon: 'icon_magic', kind: 'buff', duration: 10,
      consumeOn: { cast: 'scribe_inkbolt' }, mods: [{ stat: 'damageDone', mul: 2, ability: 'scribe_inkbolt' }] } }],
    text: 'Instant: your next Inkbolt within 10 s deals 100% more. 20 s cooldown.',
  },

  // ---- Wayfinder: Snare vs Damage
  wayfinder_tanglewire: PASSIVE('wayfinder_tanglewire', 'Tanglewire', 'pinning_shot', 'wayfinder', 'physical', {
    modAbility: [abl('wayfinder_pinning_shot', 'effects', { push: { type: 'aura', key: 'tangle', aura: { id: 'wayfinder_tanglewire', name: 'Tangled', icon: 'pinning_shot', kind: 'debuff', duration: 2, flags: ['root'] } } }),
      abl('wayfinder_pinning_shot', 'effects', { push: { type: 'aura', key: 'tangle2', to: 'other_near_target', radius: 48, aura: { id: 'wayfinder_tanglewire', name: 'Tangled', icon: 'pinning_shot', kind: 'debuff', duration: 2, flags: ['root'] } } })],
  }, 'Passive. Pinning Shot also roots its foe for 2 s, and the wire jumps to root the nearest other foe within 3 tiles.'),
  wayfinder_broadhead: PASSIVE('wayfinder_broadhead', 'Broadhead', 'pinning_shot', 'wayfinder', 'physical', {
    modAbility: [abl('wayfinder_pinning_shot', 'effects.#slow.aura.mods', { set: [] }), abl('wayfinder_pinning_shot', 'effects.#slow.aura.flags', { set: [] }),
      abl('wayfinder_pinning_shot', 'effects.#hit.mult', { set: 1.6 }), abl('wayfinder_pinning_shot', 'effects.#slow.aura.tick.0.amount', { mul: 2 })],
  }, 'Passive. Pinning Shot no longer slows; it deals 60% more and its bleed is doubled.'),

  // ---- Inkblade: Poison vs Bleed
  inkblade_gall_ink: PASSIVE('inkblade_gall_ink', 'Gall Ink', 'bleed_line', 'inkblade', 'nature', {
    mods: [dmgUp(-0.1, { ability: 'inkblade_bleed_line', periodic: true })],
    modAbility: [abl('inkblade_bleed_line', 'effects.#dot.aura.dispel', { set: 'poison' }), abl('inkblade_bleed_line', 'effects.#dot.aura.duration', { add: 4 }),
      abl('inkblade_bleed_line', 'effects.#dot.aura.flags', { set: ['slow'] }), abl('inkblade_bleed_line', 'effects.#dot.aura.mods', { set: [{ stat: 'slow', add: 0.1 }] })],
  }, 'Passive. Bleed Line becomes poison: it lasts 4 s longer and slows the foe 10%, and its ticks deal 10% less. A cure for bleeding does not clear it.'),
  inkblade_opened_vein: PASSIVE('inkblade_opened_vein', 'Opened Vein', 'spill', 'inkblade', 'physical', {
    mods: [dmgUp(0.25, { ability: 'inkblade_bleed_line', periodic: true }), mod('crit', { add: 1 }, { ability: 'inkblade_spill', when: { targetAura: 'inkblade_bleed_line', fromSelf: true } })],
  }, 'Passive. Bleed Line deals 25% more, and a Spill on a foe bleeding from your Bleed Line always crits.'),
};

// ------------------------------------------------------------------------------------------------ the suggested pick at 25
export const PICK_25_OF = {
  shieldwheel: 'warden_hammerfall', forge_reaver: 'warden_slag_brand', spellbreaker: 'warden_hammerfall',
  tidehammer: 'mender_sanctuary_toll', lamplighter: 'mender_inner_bell', battle_mender: 'mender_inner_bell',
  ellipsis_duelist: 'scribe_run_on_sentence', author_of_beasts: 'scribe_full_caps', wordstorm: 'scribe_run_on_sentence',
  falconer: 'wayfinder_tanglewire', stormcaller: 'wayfinder_broadhead', grapple_skirmisher: 'wayfinder_broadhead',
  night_letter: 'inkblade_opened_vein', fan_dancer: 'inkblade_opened_vein', venom_knife: 'inkblade_gall_ink',
};

// ------------------------------------------------------------------------------------------------ levels 21 to 30
const W = pathMaker('warden'), M = pathMaker('mender'), S = pathMaker('scribe'), F = pathMaker('wayfinder'), I = pathMaker('inkblade');
export const PAST_20 = {
  // Warden
  shieldwheel: [...rep(W('oathkeeper', 'commanding_voice'), 2), W('oathkeeper', 'hold_the_line'), W('oathkeeper', 'kept_name'), ...rep(W('oathkeeper', 'hold_the_line'), 2),
    W('oathkeeper', 'gatekeeper'), ...rep(W('oathkeeper', 'hold_the_line'), 2), W('oathkeeper', 'retribution')],
  forge_reaver: [W('oathblade', 'momentum'), W('bulwark', 'iron_skin'), ...rep(W('bulwark', 'steady_shield'), 2), ...rep(W('cinder', 'kindled_resolve'), 2), W('cinder', 'ember_sweep'),
    ...rep(W('cinder', 'bellows'), 2), W('oathblade', 'finishing_cut')],
  spellbreaker: [...rep(W('oathblade', 'keen_edge'), 2), ...rep(W('oathblade', 'momentum'), 2), W('stride', 'gate_charge'), ...rep(W('oathblade', 'finishing_cut'), 2),
    W('sigilward', 'bash_breaker'), ...rep(W('sigilward', 'runed_plate'), 2)],
  // Mender
  tidehammer: [M('bell', 'toll'), M('bell', 'clear_voice'), ...rep(M('hearth', 'gentle_hands'), 3), ...rep(M('hearth', 'quick_words'), 3), ...rep(M('sunfire', 'flare'), 2)],
  lamplighter: [M('dawnbrand', 'searing_name'), M('dawnbrand', 'bright_drain'), M('tide', 'long_vigil'), ...rep(M('dawnbrand', 'searing_name'), 2), ...rep(M('dawnbrand', 'bright_drain'), 2), ...rep(M('tide', 'ebb'), 3)],
  battle_mender: [M('dawnbrand', 'searing_name'), M('dawnbrand', 'bright_drain'), ...rep(M('dawnbrand', 'lingering_brand'), 2), ...rep(M('wardlight', 'steadfast_ward'), 3),
    ...rep(M('wardlight', 'blessed_cloth'), 3)],
  // Scribe
  ellipsis_duelist: [...rep(S('margin', 'fine_print'), 3), ...rep(S('margin', 'long_pause'), 3), ...rep(S('margin', 'comma'), 2), ...rep(S('shorthand', 'quick_hand'), 2)],
  author_of_beasts: [...rep(S('bindings', 'vellum_ward'), 2), S('bindings', 'footnote'), ...rep(S('inkwell', 'deep_ink'), 3), ...rep(S('inkwell', 'reclaim'), 3), S('inkwell', 'spill_over')],
  wordstorm: [...rep(S('margin', 'long_pause'), 2), ...rep(S('margin', 'fine_print'), 3), ...rep(S('erasure', 'etch'), 3), ...rep(S('inkwell', 'deep_ink'), 2)],
  // Wayfinder
  falconer: [...rep(F('running', 'loose'), 3), ...rep(F('running', 'snap_shot'), 4), F('snare', 'quick_set'), ...rep(F('trailcraft', 'field_dressing'), 2)],
  stormcaller: [F('longshot', 'far_sight'), F('longshot', 'lethal_distance'), ...rep(F('running', 'loose'), 2), ...rep(F('running', 'snap_shot'), 2), F('running', 'skirmisher'),
    ...rep(F('close', 'point_blank'), 2), F('close', 'storm_arrows')],
  grapple_skirmisher: [...rep(F('windrunner', 'light_step'), 3), ...rep(F('windrunner', 'spring'), 2), F('windrunner', 'dust_kick'), F('windrunner', 'mirage'), ...rep(F('close', 'kick'), 2),
    F('running', 'agile_fingers')],
  // Inkblade
  night_letter: [I('edge', 'sharpened'), I('edge', 'opening_line'), I('shade', 'soft_step'), ...rep(I('shade', 'deep_shadow'), 3), ...rep(I('shade', 'ambusher'), 3), I('edge', 'ruthless')],
  fan_dancer: [...rep(I('edge', 'sharpened'), 3), I('splatter', 'flicker'), I('splatter', 'spreading_ink'), I('inkbody', 'shadowskin'), ...rep(I('inkbody', 'slippery'), 2), ...rep(I('inkbody', 'ink_leech'), 2)],
  venom_knife: [...rep(I('blot', 'deep_wounds'), 2), I('blot', 'sunder'), ...rep(I('spellcutter', 'quick_cut'), 3), I('spellcutter', 'silence'), ...rep(I('inkbody', 'slippery'), 3)],
};

// The second signature (level 20) where the build's order changed for cap 30: the Tidehammer's Riptide Step left it at
// 15 to 17 s a foe from 23 (the Mender's damage does not keep up past 20); Kindred Light, its third, holds it near 9.5 s.
// The Fan Dancer's Inkwalk (an escape) added nothing to a fight: 14.5 s at 24; Mirrorshade, 13.4 s.
export const SIG2_OF = { tidehammer: 'mender_kindred_light', fan_dancer: 'inkblade_mirrorshade' };

// Struggle answers that come with cap 30 (BUILDS_2_PLAY 3.3, read by qa/sim/builds2.mjs --struggle: from that level the build
// must close the gap to its class's struggle foe, at most 1.25x a plain foe): the Stormcaller's Sand Kestrel, its second
// signature at 20, interrupts casters; the Wordstorm's Fine Print (21 to 25) answers fast foes (without it the Wordstorm
// died to them from 25).
export const ANSWERS_OF = { stormcaller: { caster: 20 }, wordstorm: { fast: 25 } };

/** Join the cap 30 data onto the class data (called once by src/data/builds2.js). */
export function joinCap30(BUILDS2, SKILL_PICKS) {
  for (const [cls, p] of Object.entries(PICKS_25)) if (SKILL_PICKS[cls] && !SKILL_PICKS[cls].some((x) => x.level === p.level)) SKILL_PICKS[cls].push(p);
  for (const c of Object.values(BUILDS2)) for (const b of c.builds) {
    if (PAST_20[b.id] && b.path.length === 20) b.path.push(...PAST_20[b.id]);
    if (PICK_25_OF[b.id]) b.picks = { ...b.picks, 25: PICK_25_OF[b.id] };
    if (ANSWERS_OF[b.id]) b.answers = { ...ANSWERS_OF[b.id], ...(b.answers || {}) };
    if (SIG2_OF[b.id] && b.signatures) b.signatures = [b.signatures[0], SIG2_OF[b.id], ...b.signatures.slice(1).filter((x) => x !== SIG2_OF[b.id])];
  }
}
void pct; void healUp;

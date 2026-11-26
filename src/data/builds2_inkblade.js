// Builds 2, the Inkblade (docs/design/BUILDS_2.md 4.5, with the BUILDS_2_PLAY 1.3 amendments: Unwritten and Afterimage
// get their costs, the keystone pair Five Marks and Inkflood carry the "Mark and spend vs Mark and spread" chip; the named
// builds stated in full from BUILDS_2_PLAY 1.4). Plain data. Numbers are the design numbers unless a line says "tuned"
// (qa/sim/builds2.mjs is the gate).
import { ranks, pct, lv, mod, abl, rep, dmgUp, healUp, MELEE, nodeMaker, pathMaker } from './builds2_kit.js';

const N = nodeMaker('inkblade');
const P = pathMaker('inkblade');
const MARKS_CHIP = 'Mark and spend vs Mark and spread';

export const INKBLADE_ABILITIES = {
  // level 6 pick: Attack boost vs Defense boost
  inkblade_shadow_mark: {
    id: 'inkblade_shadow_mark', name: 'Shadow Mark', icon: 'icon_nameless', cls: 'inkblade', learnLevel: 6, school: 'shadow',
    cost: { kind: 'focus', amount: 15 }, castTime: 0, cooldown: 15, gcd: true, range: { min: 0, max: 128 }, target: 'enemy', threatMult: 0, keepsStealth: true,
    effects: [{ type: 'aura', key: 'mark', aura: { id: 'inkblade_shadow_mark', name: 'Shadow Mark', icon: 'icon_nameless', kind: 'debuff', duration: 15, mods: [{ stat: 'damageTaken', mul: 1.1, selfOnly: true }] } }],
    text: 'Mark a foe in shadow: it takes 10% more from you for 15 s. Does not end Fade.',
  },
  inkblade_ink_cloak: {
    id: 'inkblade_ink_cloak', name: 'Ink Cloak', icon: 'icon_mantle', cls: 'inkblade', learnLevel: 6, school: 'shadow',
    cost: { kind: 'focus', amount: 10 }, castTime: 0, cooldown: 30, gcd: false, range: null, target: 'self', threatMult: 0, keepsStealth: true,
    effects: [{ type: 'aura', key: 'cloak', to: 'self', aura: { id: 'inkblade_ink_cloak', name: 'Ink Cloak', icon: 'icon_mantle', kind: 'buff', duration: 6, mods: [{ stat: 'dodge', add: 0.3 }] } }],
    text: 'Pull ink round you like a cloak: dodge +30% for 6 s.',
  },
  // level 14 pick: Assassin vs Ranged
  inkblade_quiet_wire: {
    id: 'inkblade_quiet_wire', name: 'Quiet Wire', icon: 'icon_silence', cls: 'inkblade', learnLevel: 14, school: 'physical',
    cost: { kind: 'focus', amount: 25 }, castTime: 0, cooldown: 20, gcd: true, range: MELEE, target: 'enemy', threatMult: 1, requires: { weapon: 'dagger', stealthed: true },
    effects: [
      { type: 'interrupt', key: 'cut', lockout: 3 },
      { type: 'aura', key: 'hush', aura: { id: 'inkblade_quiet_wire', name: 'Quiet Wire', icon: 'icon_silence', kind: 'debuff', duration: 3, flags: ['silence'] } },
      { type: 'aura', key: 'bleed', aura: { id: 'inkblade_wire_bleed', name: 'Wire Cut', icon: 'icon_combo', kind: 'debuff', dispel: 'bleed', duration: 6, period: 2, unique: 'per_caster',
        tick: [{ type: 'damage', amount: lv(3, 1.2), coef: { stat: 'ap', k: 0.05 }, school: 'physical', canCrit: true, noArmor: true }] } },
    ],
    text: 'From Fade: a wire round the throat. The foe is silenced 3 s and bleeds for {dot}.',
  },
  inkblade_throwing_knife: {
    id: 'inkblade_throwing_knife', name: 'Throwing Knife', icon: 'icon_spear', cls: 'inkblade', learnLevel: 14, school: 'physical',
    cost: { kind: 'focus', amount: 20 }, castTime: 0, cooldown: 6, gcd: true, range: { min: 0, max: 128 }, target: 'enemy', threatMult: 1, requires: { weapon: 'dagger' }, projectile: { speed: 480 },
    effects: [{ type: 'damage', key: 'hit', weapon: 0.6, amount: lv(2, 1), school: 'physical', canCrit: true }, { type: 'combo', key: 'mark', add: 1 }],
    text: 'Throw a knife up to 8 tiles for {dmg}. Adds an Ink Mark.',
  },
  // ---- signatures
  inkblade_inkwalk: {
    id: 'inkblade_inkwalk', name: 'Inkwalk', icon: 'icon_nameless', cls: 'inkblade', learnLevel: 10, school: 'shadow',
    cost: null, castTime: 0, cooldown: 20, gcd: true, range: null, target: 'self', threatMult: 0,
    effects: [
      { type: 'aura', key: 'walk', to: 'self', aura: { id: 'inkblade_inkwalk', name: 'Inkwalk', icon: 'icon_nameless', kind: 'buff', duration: 3, flags: ['stealth', 'untargetable'], breakOn: ['action'],
        mods: [{ stat: 'speed', add: 0.6 }], opener: { bonus: 0.5, combo: 1 },
        onExpire: [{ type: 'aura', to: 'holder', aura: { id: 'inkblade_inkwalk_edge', name: 'Out of the Ink', icon: 'icon_nameless', kind: 'buff', duration: 2, flags: ['stealth'], breakOn: ['action', 'damage'], opener: { bonus: 0.5, combo: 1 } } }] } },
      { type: 'threat', key: 'lose', to: 'self', drop: true },
    ],
    text: 'Become a pool of shadow for 3 s: 60% faster, nothing can target you, and foes lose you. Your first attack after counts as from Fade.',
  },
  inkblade_mirrorshade: {
    id: 'inkblade_mirrorshade', name: 'Mirrorshade', icon: 'icon_reflect', cls: 'inkblade', learnLevel: 10, school: 'shadow',
    cost: null, castTime: 0, cooldown: 45, gcd: true, range: null, target: 'none', threatMult: 0,
    effects: [{ type: 'summon', key: 'double', object: { id: 'inkblade_mirrorshade', name: 'Mirrorshade', sprite: 'ink_double', at: 'self', armTime: 0, duration: 10, max: 1,
      copy: 0.1, hpPct: 0.3, holdThreat: true, pet: { period: 99, range: 24, speed: 96, effects: [] } } }],
    // tuned 2026-11-19 (qa/sim/builds2.mjs spread): the double copies at 10% (BUILDS_2 4.5: 40%)
    text: 'An ink double stands beside you for 10 s. It copies your attacks at 10% and draws the foes\' eyes.',
  },
  inkblade_black_fan: {
    id: 'inkblade_black_fan', name: 'Black Fan', icon: 'icon_combo', cls: 'inkblade', learnLevel: 10, school: 'physical',
    cost: { kind: 'focus', amount: 20 }, castTime: 0, cooldown: 6, gcd: true, range: null, target: 'none', threatMult: 1, requires: { weapon: 'dagger' },
    area: { shape: 'cone', radius: 112, angle: 60, at: 'self', maxTargets: 5 },
    effects: [
      { type: 'damage', key: 'hit', to: 'enemies', weapon: 0.5, amount: lv(2, 1), school: 'physical', canCrit: true },
      { type: 'combo', key: 'mark', to: 'my_target', add: 1 },
      { type: 'script', key: 'marks', to: 'enemies', name: 'b2_spread_marks', args: { n: 1 } },
      // redesign 2026-11-26 (Scott approved): the rule it breaks is position. You ride the farthest knife and land behind
      // that foe (src/sim/scripts_b2.js b2_fan_step), so the fan is how an Inkblade crosses a pack, not only hits it
      { type: 'script', key: 'step', to: 'self', name: 'b2_fan_step', args: { radius: 120, angle: 60 } },
    ],
    text: 'Throw five ink knives in a 60 degree cone, 7 tiles: up to 5 foes take {dmg} and an Ink Mark. You ride the farthest knife and land behind that foe.',
  },
};

export const INKBLADE_TRACKS = [
  { id: 'edge', name: 'Edge', kind: 'strength', trait: 'S1', purpose: 'Strength: opening burst', axis: 'Burst vs Bleed over time', chip: 'Burst vs Bleed' },
  { id: 'shade', name: 'Shade', kind: 'strength', trait: 'S2', purpose: 'Strength: picks the fight', axis: 'Stealth vs Open fight', chip: 'Stealth vs Open' },
  { id: 'spellcutter', name: 'Spellcutter', kind: 'strength', trait: 'S3', purpose: 'Strength: breaks spells', axis: 'Silence vs Steal', chip: 'Silence vs Steal' },
  { id: 'blot', name: 'Blot', kind: 'weakness', trait: 'W1', purpose: 'Patches: armored foes', axis: 'Heavy blade vs Poison (magic)', chip: 'Blade vs Poison' },
  { id: 'inkbody', name: 'Inkbody', kind: 'weakness', trait: 'W2', purpose: 'Patches: thin skin', axis: 'Dodge vs Leech', chip: 'Dodge vs Leech' },
  { id: 'splatter', name: 'Splatter', kind: 'weakness', trait: 'W3', purpose: 'Patches: one at a time', axis: 'One target vs Splash', chip: 'Splash vs One' },
];

const INKBLADE_NODES = [
  // ---- Edge (S1: opening burst)
  N('edge', 1, 'sharpened', 'Sharpened', 5, 'inkblade_edge_fine_edge', 'Nick damage +{r*3}%.', ranks(5, (r) => ({ mods: [dmgUp(0.03 * r, { ability: 'inkblade_nick' })] }))),
  N('edge', 2, 'opening_line', 'Opening Line', 5, 'inkblade_shade_opening_line', 'Your first attack from Fade deals {r*8}% more.', ranks(5, (r) => ({ mods: [mod('openerBonus', { add: pct(0.08 * r) })] }))),
  N('edge', 3, 'spill_over', 'Spill Over', 1, 'inkblade_edge_deep_spill', 'Spill deals 20% more.', [{ mods: [dmgUp(0.2, { ability: 'inkblade_spill' })] }], { fork: 'a' }),
  N('edge', 3, 'long_bleed', 'Long Bleed', 1, 'inkblade_edge_running_ink', 'Bleed Line deals 30% more and lasts 50% longer.',
    [{ mods: [dmgUp(0.3, { ability: 'inkblade_bleed_line' })], modAbility: [abl('inkblade_bleed_line', 'effects.#dot.aura.duration', { mul: 1.5 })] }], { fork: 'b' }),
  N('edge', 4, 'ruthless', 'Ruthless', 5, 'inkblade_edge_relentless', 'A Spill of 3 or more marks leaves 1 mark behind, {r*8}% of the time.', ranks(5, (r) => ({ mods: [mod('ruthless', { add: pct(0.08 * r) })] }))),
  N('edge', 5, 'five_marks', 'Five Marks', 1, 'inkblade_edge_inkstorm', `Marks cap at 5, not 3. Nick costs 5 more Focus. (${MARKS_CHIP}: this is the spend side.)`,
    [{ mods: [mod('comboMax', { add: 2 }), mod('cost', { add: 5 }, { ability: 'inkblade_nick' })] }], { keystone: true }),

  // ---- Shade (S2: picks the fight)
  N('shade', 1, 'soft_step', 'Soft Step', 5, 'inkblade_shade_quiet_feet', 'Fade slows you {r*4}% less (from 20%).',
    ranks(5, (r) => ({ modAbility: [abl('inkblade_fade', 'effects.#stealth.aura.mods.0.add', { add: pct(0.04 * r) })] }))),
  N('shade', 2, 'deep_shadow', 'Deep Shadow', 5, 'inkblade_shade_dim', 'Foes notice you in Fade {r*0.2} tile later.', ranks(5, (r) => ({ mods: [mod('stealthNotice', { add: pct(-3.2 * r) })] }))),
  N('shade', 3, 'vanish', 'Vanish', 1, 'inkblade_shade_unwritten', 'Fade works in a fight once per 30 s: foes lose you until you strike.', [{ script: 'b2_vanish' }], { fork: 'a' }),
  N('shade', 3, 'open_hand', 'Open Hand', 1, 'inkblade_shade_shadow_hands', 'No bonus from Fade, but +10% damage in every fight.',
    [{ mods: [mod('openerBonus', { add: -0.5 }), dmgUp(0.1)] }], { fork: 'b' }),
  N('shade', 4, 'ambusher', 'Ambusher', 5, 'inkblade_shade_ambush', 'Your first attack from Fade stuns {r*0.3} s.',
    ranks(5, (r) => ({ procs: [{ on: 'hit', when: { opener: true }, effects: [{ type: 'aura', to: 'target', aura: { id: 'b2_ambushed', name: 'Ambushed', icon: 'icon_stun', kind: 'debuff', duration: pct(0.3 * r), flags: ['stun'] } }] }] }))),
  N('shade', 5, 'never_seen', 'Never Seen', 1, 'inkblade_shade_between_the_lines', 'Every kill drops you into Fade for 3 s, even in a fight. You take 10% more damage.',
    [{ mods: [mod('damageTaken', { mul: 1.1 })], procs: [{ on: 'kill', effects: [{ type: 'script', to: 'self', name: 'b2_never_seen' }] }] }], { keystone: true }),

  // ---- Spellcutter (S3: breaks spells)
  N('spellcutter', 1, 'quick_cut', 'Quick Cut', 5, 'inkblade_shade_slip', 'Cut the Word is ready {r*0.4} s sooner (from 4 s).', ranks(5, (r) => ({ mods: [mod('cutWordIcd', { add: pct(-0.4 * r) })] }))),
  N('spellcutter', 2, 'throat_cut', 'Throat Cut', 5, 'inkblade_shade_hold_breath', 'Damage +{r*3}% to a foe that is casting.', ranks(5, (r) => ({ mods: [dmgUp(0.03 * r, { when: { targetCasting: true } })] }))),
  N('spellcutter', 3, 'silence', 'Silence', 1, 'inkblade_shade_blinding_spill', 'Your interrupts also silence 2 s.', [{ script: 'b2_silence' }], { fork: 'a' }),
  N('spellcutter', 3, 'spellthief', 'Spellthief', 1, 'inkblade_edge_twinned', 'An interrupt steals 10 Focus and gives you +5% damage for 8 s.', [{ script: 'b2_spellthief' }], { fork: 'b' }),
  N('spellcutter', 4, 'hunter_of_words', 'Hunter of Words', 5, 'inkblade_edge_quick_hands', 'Inkstep cooldown -{r*0.8} s.', ranks(5, (r) => ({ modAbility: [abl('inkblade_inkstep', 'cooldown', { add: pct(-0.8 * r) })] }))),
  // BUILDS_2_PLAY 1.3 amendment: Cut the Word no longer breaks a spell on an ordinary hit (only your interrupts do)
  N('spellcutter', 5, 'unwritten', 'Unwritten', 1, 'inkblade_edge_last_word', 'A spell you interrupt is kept; your next Spill throws it back for 150%, past plating. Cut the Word no longer breaks spells on an ordinary hit.',
    [{ script: 'b2_unwritten' }], { keystone: true }),

  // ---- Blot (W1: armored foes)
  N('blot', 1, 'find_the_seam', 'Find the Seam', 5, 'inkblade_blot_seeping_cut', 'Ignore {r*8}% of plating.', ranks(5, (r) => ({ mods: [mod('platingIgnore', { add: pct(0.08 * r) })] }))),
  N('blot', 2, 'deep_wounds', 'Deep Wounds', 5, 'inkblade_edge_keen_cut', 'Your bleeds deal {r*5}% more.', ranks(5, (r) => ({ mods: [dmgUp(0.05 * r, { ability: ['inkblade_bleed_line', 'inkblade_wire_bleed', 'inkblade_quiet_wire'], periodic: true })] }))),
  N('blot', 3, 'heavy_knife', 'Heavy Knife', 1, 'inkblade_edge_second_cut', 'One heavy blade: no off-hand swings; your swing is half as fast for 2.3x the damage, so plating takes less.',
    [{ mods: [mod('noOffHand', { add: 1 }), mod('autoSpeed', { mul: 0.5 }), mod('autoWeaponMul', { mul: 2.3 })] }], { fork: 'a' }),
  N('blot', 3, 'envenom', 'Envenom', 1, 'inkblade_blot_ink_poison', 'Nick poisons: 1 + 0.5 x your level every 2 s, stacks 3, past armor and plating.',
    [{ modAbility: [abl('inkblade_nick', 'effects', { push: { type: 'aura', key: 'venom', aura: { id: 'inkblade_envenom', name: 'Envenom', icon: 'icon_poison', kind: 'debuff', dispel: 'poison', duration: 8, period: 2, maxStacks: 3, refresh: 'stack', scaleStacks: true, unique: 'per_caster',
      tick: [{ type: 'damage', amount: lv(1, 0.5), school: 'nature', canCrit: false }] } } })] }], { fork: 'b' }),
  N('blot', 4, 'sunder', 'Sunder', 5, 'inkblade_blot_thick_ink', 'Spill cuts the foe\'s armor {r*3}% for 10 s.',
    ranks(5, (r) => ({ modAbility: [abl('inkblade_spill', 'effects', { push: { type: 'aura', key: 'sunder', to: 'target', aura: { id: 'b2_sundered', name: 'Sundered', icon: 'icon_armor', kind: 'debuff', duration: 10, mods: [{ stat: 'armorMul', mul: pct(1 - 0.03 * r) }] } } })] }))),
  N('blot', 5, 'corrode', 'Corrode', 1, 'inkblade_blot_black_tide', 'All your damage ignores plating, and a foe you mark takes 10% more from your friends. Spill heals 50% less.',
    [{ mods: [mod('platingIgnore', { add: 1 }), healUp(-0.5, { ability: 'inkblade_spill' })],
      procs: [{ on: 'hit', ability: 'inkblade_nick', effects: [{ type: 'aura', to: 'target', aura: { id: 'b2_corroded', name: 'Corroded', icon: 'icon_poison', kind: 'debuff', duration: 20, mods: [{ stat: 'damageTaken', mul: 1.1, othersOnly: true }] } }] }] }], { keystone: true }),

  // ---- Inkbody (W2: thin skin)
  N('inkbody', 1, 'slippery', 'Slippery', 5, 'inkblade_shade_slip', 'Dodge +{r*1.5}% (you have none without talents).', ranks(5, (r) => ({ mods: [mod('dodge', { add: pct(0.015 * r) })] }))),
  N('inkbody', 2, 'ink_leech', 'Ink Leech', 5, 'inkblade_edge_ambidexter', 'Heal {r*1.5}% of the damage you deal.', ranks(5, (r) => ({ mods: [mod('leech', { add: pct(0.015 * r) })] }))),
  N('inkbody', 3, 'shadowskin', 'Shadowskin', 1, 'inkblade_shade_dim', 'Dodge +10%.', [{ mods: [mod('dodge', { add: 0.1 })] }], { fork: 'a' }),
  N('inkbody', 3, 'thirst', 'Thirst', 1, 'inkblade_edge_deep_spill', 'Spill heals 5% more of your health per mark (13% a mark).',
    [{ modAbility: [abl('inkblade_spill', 'effects.#drink.pctMaxHp', { add: 0.05 })] }], { fork: 'b' }),
  N('inkbody', 4, 'smear', 'Smear', 5, 'inkblade_shade_opening_line', 'Inkstep\'s Smudge cuts foes\' damage {r*2}% more (from 20%).',
    ranks(5, (r) => ({ modAbility: [abl('inkblade_inkstep', 'effects.#smudge.aura.mods.0.mul', { set: pct(0.8 - 0.02 * r) })] }))),
  // BUILDS_2_PLAY 1.3 amendment: Afterimage costs max health -8%
  N('inkbody', 5, 'afterimage', 'Afterimage', 1, 'inkblade_shade_inkdouble', 'A hit that drops you under 35% blinks you 4 tiles back and leaves a double that takes 2 hits. Once per 40 s. Max health -8%.',
    [{ mods: [mod('maxHp', { mul: 0.92 })],
      procs: [{ on: 'damageTaken', icd: 40, when: { selfHpBelow: 0.35 }, effects: [
        { type: 'summon', to: 'self', object: { id: 'inkblade_afterimage', name: 'Afterimage', sprite: 'ink_double', at: 'self', armTime: 0, duration: 6, max: 1, hits: 2, holdThreat: true } },
        { type: 'move', to: 'self', kind: 'blink', distance: 64 }] }] }], { keystone: true }),

  // ---- Splatter (W3: one at a time)
  N('splatter', 1, 'wide_cut', 'Wide Cut', 5, 'inkblade_edge_quick_hands', 'Inkstep damage +{r*5}%.', ranks(5, (r) => ({ mods: [dmgUp(0.05 * r, { ability: 'inkblade_inkstep' })] }))),
  N('splatter', 2, 'spreading_ink', 'Spreading Ink', 5, 'inkblade_blot_spreading_stain', 'Nick marks a second foe within 2 tiles, {r*6}% of the time.',
    ranks(5, (r) => ({ procs: [{ on: 'hit', ability: 'inkblade_nick', chance: pct(0.06 * r), effects: [{ type: 'script', to: 'other_near_target', radius: 32, name: 'b2_spread_marks', args: { n: 1 } }] }] }))),
  N('splatter', 3, 'ink_burst', 'Ink Burst', 1, 'inkblade_blot_ink_veins', 'Spill splashes 40% of its damage on foes within 3 tiles.',
    [{ procs: [{ on: 'hit', ability: 'inkblade_spill', effects: [{ type: 'damage', to: 'enemies_near_holder', radius: 48, excludeHolder: true, pctOfDamage: 0.4, school: 'physical', canCrit: false, ability: 'b2_ink_burst' }] }] }], { fork: 'a' }),
  N('splatter', 3, 'single_mind', 'Single Mind', 1, 'inkblade_edge_twinned', '+12% damage to a foe with no other foe within 3 tiles of it.', [{ mods: [dmgUp(0.12, { when: { targetAlone: 48 } })] }], { fork: 'b' }),
  N('splatter', 4, 'flicker', 'Flicker', 5, 'inkblade_shade_slip', 'Inkstep cooldown -{r*0.6} s.', ranks(5, (r) => ({ modAbility: [abl('inkblade_inkstep', 'cooldown', { add: pct(-0.6 * r) })] }))),
  N('splatter', 5, 'inkflood', 'Inkflood', 1, 'inkblade_blot_blot_out', `Spill marks every foe within 3 tiles. Spill costs 10 more Focus. (${MARKS_CHIP}: this is the spread side.)`,
    [{ mods: [mod('cost', { add: 10 }, { ability: 'inkblade_spill' })],
      procs: [{ on: 'hit', ability: 'inkblade_spill', effects: [{ type: 'script', to: 'enemies_near_holder', radius: 48, excludeHolder: true, name: 'b2_spread_marks', args: { n: 1 } }] }] }], { keystone: true }),
];

export const INKBLADE_SIGNATURES = [
  { id: 'inkblade_inkwalk', name: 'Inkwalk', icon: 'icon_nameless', ready: true, text: 'A pool of shadow for 3 s: fast, untouchable, lost to every foe. Open from Fade after.' },
  { id: 'inkblade_mirrorshade', name: 'Mirrorshade', icon: 'icon_reflect', ready: true, text: 'An ink double copies your attacks at 40% for 10 s and draws the foes.' },
  { id: 'inkblade_black_fan', name: 'Black Fan', icon: 'icon_combo', ready: true, text: 'Five ink knives in a cone that mark each foe; you ride the farthest one and land behind it.' },
];

export const INKBLADE_BUILDS = [
  { id: 'night_letter', name: 'Night Letter', line: 'The classic assassin: vanish, open, Spill, vanish.', tracks: ['shade', 'edge', 'spellcutter'],
    forks: ['vanish', 'spill_over'], keystone: 'never_seen', signature: 'inkblade_inkwalk', signatures: ['inkblade_inkwalk', 'inkblade_mirrorshade', 'inkblade_black_fan'],
    picks: { 1: 'inkblade_fade', 3: 'inkblade_ink_in_the_eyes', 6: 'inkblade_shadow_mark', 14: 'inkblade_quiet_wire' },
    path: [...rep(P('shade', 'soft_step'), 3), ...rep(P('shade', 'deep_shadow'), 2), P('shade', 'vanish'), ...rep(P('shade', 'ambusher'), 2), ...rep(P('edge', 'sharpened'), 2),
      P('shade', 'never_seen'), ...rep(P('edge', 'opening_line'), 2), P('edge', 'spill_over'), P('spellcutter', 'quick_cut')] },
  { id: 'fan_dancer', name: 'Fan Dancer', line: 'Throw knives into a pack, Spill the marks, dodge the rest.', tracks: ['splatter', 'inkbody', 'edge'],
    forks: ['ink_burst', 'shadowskin'], keystone: 'inkflood', signature: 'inkblade_black_fan', signatures: ['inkblade_black_fan', 'inkblade_inkwalk', 'inkblade_mirrorshade'],
    picks: { 1: 'inkblade_inkstep', 3: 'inkblade_bleed_line', 6: 'inkblade_ink_cloak', 14: 'inkblade_throwing_knife' },
    path: [...rep(P('inkbody', 'slippery'), 2), ...rep(P('splatter', 'wide_cut'), 3), ...rep(P('splatter', 'spreading_ink'), 2), P('splatter', 'ink_burst'), ...rep(P('splatter', 'flicker'), 2),
      ...rep(P('edge', 'sharpened'), 2), ...rep(P('inkbody', 'ink_leech'), 2), P('splatter', 'inkflood')] },
  { id: 'venom_knife', name: 'Venom Knife', line: 'Poison past plating: the patient armor killer.', tracks: ['blot', 'inkbody', 'spellcutter'], answers: { armored: 11 },
    forks: ['envenom', 'thirst', 'silence'], keystone: 'corrode', signature: 'inkblade_mirrorshade', signatures: ['inkblade_mirrorshade', 'inkblade_inkwalk', 'inkblade_black_fan'],
    picks: { 1: 'inkblade_fade', 3: 'inkblade_bleed_line', 6: 'inkblade_shadow_mark', 14: 'inkblade_quiet_wire' },
    path: [...rep(P('inkbody', 'slippery'), 2), ...rep(P('blot', 'find_the_seam'), 3), ...rep(P('blot', 'deep_wounds'), 2), P('blot', 'envenom'), ...rep(P('blot', 'sunder'), 2),
      P('blot', 'corrode'), ...rep(P('inkbody', 'ink_leech'), 2), P('inkbody', 'thirst'), P('spellcutter', 'quick_cut')] },
];

// Cap 20 (phase 5, BUILDS_2 5.4): five more points per build for levels 16 to 20, on the build's own tracks (ranks the
// first 15 points left unfilled; no new forks, keystones or skills). qa/sim/builds2.mjs gates every level to 20.
const PAST_15 = {
  night_letter: [...rep(P('edge', 'sharpened'), 2), ...rep(P('edge', 'opening_line'), 2), P('shade', 'soft_step')],
  fan_dancer: [...rep(P('splatter', 'wide_cut'), 2), ...rep(P('splatter', 'flicker'), 2), P('splatter', 'spreading_ink')],
  venom_knife: [...rep(P('blot', 'find_the_seam'), 2), ...rep(P('blot', 'sunder'), 2), P('blot', 'deep_wounds')],
};
for (const b of INKBLADE_BUILDS) b.path.push(...PAST_15[b.id]);

export const INKBLADE = {
  tracks: INKBLADE_TRACKS,
  nodes: Object.fromEntries(INKBLADE_NODES.map((n) => [n.id, n])),
  signatures: INKBLADE_SIGNATURES,
  signatureAxis: 'Shadow vs Double vs Knives',
  builds: INKBLADE_BUILDS,
  defaultBuild: 'night_letter',
  // tuned 2026-11-19 (qa/sim/builds2.mjs): damage -8%. Builds 2 gives her Fade at 1 (it was 3), and the Night Letter killed one
  // plain foe in 8 s at level 5, under the 9 s floor
  baseline: { mods: [{ stat: 'damageDone', mul: 0.92 }] },
};

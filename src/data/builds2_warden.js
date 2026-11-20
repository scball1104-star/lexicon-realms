// Builds 2, the Warden (docs/design/BUILDS_2.md 4.1, with the BUILDS_2_PLAY 1.3 amendments: the Iron Sweep tweak and the
// "Others vs Self" and "Bank vs Spend" chips; the named builds stated in full from BUILDS_2_PLAY 1.4). Plain data.
// Numbers are the design numbers unless a line says "tuned" (qa/sim/builds2.mjs is the gate).
import { ranks, pct, lv, mod, abl, rep, dmgUp, MELEE, nodeMaker, pathMaker } from './builds2_kit.js';

const N = nodeMaker('warden');
const P = pathMaker('warden');
const R8 = { min: 0, max: 128 };

// ------------------------------------------------------------------------------------------------ new skills
export const WARDEN_ABILITIES = {
  // level 3 pick (vs Taunt): reach
  warden_hurl_hammer: {
    id: 'warden_hurl_hammer', name: 'Hurl Hammer', icon: 'icon_axe', cls: 'warden', learnLevel: 3, school: 'physical',
    cost: null, castTime: 0, cooldown: 8, gcd: true, range: R8, target: 'enemy', threatMult: 1.5, projectile: { speed: 360 },
    effects: [
      { type: 'damage', key: 'hit', weapon: 0.8, amount: lv(3, 1.5), school: 'physical', canCrit: true },
      { type: 'aura', key: 'slow', aura: { id: 'warden_hammer_slow', name: 'Hammered', icon: 'icon_axe', kind: 'debuff', duration: 8, flags: ['slow'], mods: [{ stat: 'slow', add: 0.3 }] } },
      { type: 'resource', key: 'gain', to: 'self', kind: 'resolve', amount: 5 },
    ],
    text: 'Throw a hammer up to 8 tiles for {dmg}. It slows the foe 30% for 8 s and gives 5 Resolve.',
  },
  // level 6 pick: Others vs Self (BUILDS_2_PLAY 1.3 chip)
  warden_war_cry: {
    id: 'warden_war_cry', name: 'War Cry', icon: 'icon_fury', cls: 'warden', learnLevel: 6, school: 'physical',
    cost: { kind: 'resolve', amount: 30 }, castTime: 0, cooldown: 40, gcd: true, range: null, target: 'none', threatMult: 1,
    area: { shape: 'circle', radius: 128, at: 'self', maxTargets: 5 },
    effects: [{ type: 'aura', key: 'cry', to: 'allies', aura: { id: 'warden_war_cry', name: 'War Cry', icon: 'icon_fury', kind: 'buff', duration: 12, mods: [{ stat: 'damageDone', mul: 1.12 }] } }],
    text: 'You and friends within 8 tiles deal 12% more damage for 12 s. Costs 30 Resolve.',
  },
  warden_iron_hide: {
    id: 'warden_iron_hide', name: 'Iron Hide', icon: 'icon_armor', cls: 'warden', learnLevel: 6, school: 'physical',
    cost: { kind: 'resolve', amount: 30 }, castTime: 0, cooldown: 40, gcd: true, range: null, target: 'self', threatMult: 1,
    effects: [{ type: 'aura', key: 'hide', to: 'self', aura: { id: 'warden_iron_hide', name: 'Iron Hide', icon: 'icon_armor', kind: 'buff', duration: 10, recalc: true, mods: [{ stat: 'armor', mul: 1.4 }] } }],
    text: 'Armor +40% for 10 s. Costs 30 Resolve.',
  },
  // level 14 pick: Bank vs Spend (BUILDS_2_PLAY 1.3 chip)
  warden_anvil_drop: {
    id: 'warden_anvil_drop', name: 'Anvil Drop', icon: 'icon16_sword', cls: 'warden', learnLevel: 14, school: 'physical',
    cost: { kind: 'resolve', amount: 40 }, castTime: 0, cooldown: 10, gcd: true, range: MELEE, target: 'enemy', threatMult: 1.5,
    effects: [
      { type: 'damage', key: 'hit', weapon: 1.6, amount: lv(6, 4), school: 'physical', canCrit: true },
      { type: 'aura', key: 'stun', aura: { id: 'warden_anvil_stun', name: 'Anviled', icon: 'icon_stun', kind: 'debuff', duration: 1, flags: ['stun'] } },
    ],
    text: 'Bring the shield down like an anvil for {dmg} and stun 1 s. Costs 40 Resolve.',
  },
  // Stride +skill (tier 2)
  warden_gate_charge: {
    id: 'warden_gate_charge', name: 'Gate Charge', icon: 'icon_haste', cls: 'warden', learnLevel: 1, school: 'physical',
    cost: null, castTime: 0, cooldown: 12, gcd: true, range: { min: 48, max: 128 }, target: 'enemy', threatMult: 1.5,
    effects: [{ type: 'move', key: 'charge', to: 'self', kind: 'charge', distance: 128, time: 0.3 }],
    arrive: [{ type: 'aura', key: 'root', aura: { id: 'warden_gate_root', name: 'Gated', icon: 'icon_stun', kind: 'debuff', duration: 1, flags: ['root'] } }],
    text: 'Rush a foe 3 to 8 tiles away. It is rooted 1 s when you arrive.',
  },
  // ---- signatures (one at level 10)
  warden_gatewheel: {
    id: 'warden_gatewheel', name: 'Gatewheel', icon: 'icon_shield', cls: 'warden', learnLevel: 10, school: 'physical',
    cost: { kind: 'resolve', amount: 20 }, castTime: 0, cooldown: 8, gcd: true, range: R8, target: 'enemy', threatMult: 2,
    projectile: { speed: 300 }, bounce: { count: 5, radius: 96 },
    onCast: [{ type: 'aura', key: 'open', to: 'self', aura: { id: 'warden_gatewheel_out', name: 'Shield Out', icon: 'icon_shield', kind: 'buff', duration: 1.5, mods: [{ stat: 'block', add: -1 }] } }],
    effects: [{ type: 'damage', key: 'hit', weapon: 0.8, amount: lv(4, 2), school: 'physical', canCrit: true }],
    text: 'Throw your shield: it bounces between up to 5 foes within 6 tiles, {dmg} each, double threat. No block for 1.5 s until it comes back. Costs 20 Resolve.',
  },
  warden_ember_leap: {
    id: 'warden_ember_leap', name: 'Ember Leap', icon: 'icon_heat', cls: 'warden', learnLevel: 10, school: 'fire',
    cost: null, castTime: 0, cooldown: 15, gcd: true, range: { min: 64, max: 160 }, target: 'enemy', threatMult: 1.5,
    effects: [{ type: 'move', key: 'leap', to: 'self', kind: 'leap', distance: 160, time: 0.45 }],
    land: [{ type: 'damage', key: 'burn', to: 'enemies', amount: lv(6, 3), school: 'fire', canCrit: true }], landRadius: 40, landResolve: 5,
    text: 'Leap at a foe 4 to 10 tiles away. The landing burns every foe within 2.5 tiles for {dmg} and gives 5 Resolve per foe hit.',
  },
  warden_furnace_form: {
    id: 'warden_furnace_form', name: 'Furnace Form', icon: 'icon_fire', cls: 'warden', learnLevel: 10, school: 'fire',
    cost: { kind: 'resolve', amount: 60 }, castTime: 0, cooldown: 90, gcd: true, range: null, target: 'self', threatMult: 1,
    effects: [{ type: 'aura', key: 'form', to: 'self', aura: { id: 'warden_furnace_form', name: 'Furnace Form', icon: 'icon_fire', kind: 'buff', duration: 15,
      immune: ['slow', 'knockback'], period: 1,
      mods: [{ stat: 'speed', mul: 0.9 }, { stat: 'cleave', add: 2, ability: ['warden_strike', 'auto', 'warden_shield_bash', 'warden_anvil_drop'] }, { stat: 'cleavePct', add: 0.6 }],
      tick: [{ type: 'damage', to: 'enemies_near_self', radius: 32, amount: lv(1, 0.5), school: 'fire', canCrit: false }] } }],
    text: 'For 15 s you are a molten giant: slows and knockbacks cannot touch you, your strikes and swings also hit 2 more foes for 60%, and you burn foes next to you. Move 10% slower. Costs 60 Resolve.',
  },
};

// ------------------------------------------------------------------------------------------------ tracks
// Track names are BUILDS_2 4.1's, shortened where the 98 px column needs it (qa/tests/talents2.test.mjs): Cinder Press -> Cinder
export const WARDEN_TRACKS = [
  { id: 'bulwark', name: 'Bulwark', kind: 'strength', trait: 'S1', purpose: 'Strength: be the wall', axis: 'Stand ground vs Charge in', chip: 'Stand vs Move' },
  { id: 'cinder', name: 'Cinder', kind: 'strength', trait: 'S2', purpose: 'Strength: feeds on crowds', axis: 'Fire over time vs Steel burst', chip: 'Fire vs Steel' },
  { id: 'oathkeeper', name: 'Oathkeeper', kind: 'strength', trait: 'S3', purpose: 'Strength: holds attention', axis: 'Hold a pack vs Protect a friend', chip: 'Pack vs Friend' },
  { id: 'oathblade', name: 'Oathblade', kind: 'weakness', trait: 'W1', purpose: 'Patches: slow to kill one foe', axis: 'Shield vs Two-hander', chip: 'Shield vs Blade' },
  { id: 'stride', name: 'Stride', kind: 'weakness', trait: 'W2', purpose: 'Patches: rooted to the ground', axis: 'Pull them in vs Run them down', chip: 'Pull vs Ram' },
  { id: 'sigilward', name: 'Sigilward', kind: 'weakness', trait: 'W3', purpose: 'Patches: spells get through', axis: 'Magic armor vs Physical armor', chip: 'Spell vs Physical' },
];

const ATTACKS = ['warden_strike', 'auto'];
const WARDEN_NODES = [
  // ---- Bulwark (S1: be the wall)
  N('bulwark', 1, 'iron_skin', 'Iron Skin', 5, 'warden_bulwark_iron_skin', 'Armor +{r*3}%.', ranks(5, (r) => ({ mods: [mod('armor', { mul: pct(1 + 0.03 * r) })] }))),
  N('bulwark', 2, 'steady_shield', 'Steady Shield', 5, 'warden_bulwark_steady_shield', 'Block chance +{r*2}%.', ranks(5, (r) => ({ mods: [mod('block', { add: pct(0.02 * r) })] }))),
  N('bulwark', 3, 'rooted_stance', 'Rooted Stance', 1, 'warden_bulwark_rooted_stance', 'Stand still 2 s: block +10% and each block gives 5 more Resolve.',
    [{ mods: [mod('block', { add: 0.1 }, { when: { still: 2 } }), mod('blockResolve', { add: 5 }, { when: { still: 2 } })] }], { fork: 'a' }),
  N('bulwark', 3, 'moving_wall', 'Moving Wall', 1, 'warden_bulwark_hold_the_line', 'Your shield also blocks hits from the sides and behind, moving or not. Block -3%.',
    [{ script: 'b2_moving_wall', mods: [mod('block', { add: -0.03 })] }], { fork: 'b' }),
  N('bulwark', 4, 'rebuke', 'Rebuke', 5, 'warden_bulwark_rebuke', 'A blocked hit strikes back for {r*2} + {r*0.5} x your level.',
    ranks(5, (r) => ({ procs: [{ on: 'block', effects: [{ type: 'damage', to: 'attacker', amount: lv(2 * r, pct(0.5 * r)), school: 'physical', canCrit: false, ability: 'b2_rebuke' }] }] }))),
  N('bulwark', 5, 'living_wall', 'Living Wall', 1, 'warden_bulwark_unbreakable', 'Each block heals you 2% of your max health, and block +10%. Your damage -10%.',
    [{ mods: [mod('block', { add: 0.1 }), dmgUp(-0.1)],
      procs: [{ on: 'block', effects: [{ type: 'heal', to: 'self', pctMaxHp: 0.02, canCrit: false, noThreat: true, ability: 'b2_living_wall' }] }] }], { keystone: true }),

  // ---- Cinder Press (S2: feeds on crowds)
  N('cinder', 1, 'kindled_resolve', 'Kindled Resolve', 5, 'warden_oathblade_rising_wrath', 'Each hit you take gives {r*0.4} more Resolve.',
    ranks(5, (r) => ({ mods: [mod('hitResolve', { add: pct(0.4 * r) })] }))),
  N('cinder', 2, 'wide_arc', 'Wide Arc', 5, 'warden_oathblade_follow_through', 'Sweeping Blow damage +{r*4}%.', ranks(5, (r) => ({ mods: [dmgUp(0.04 * r, { ability: 'warden_sweeping_blow' })] }))),
  N('cinder', 3, 'ember_sweep', 'Ember Sweep', 1, 'warden_lantern_lamp_in_the_dark', 'Sweeping Blow sets foes burning: 2 + 0.8 x your level fire every 2 s for 6 s.',
    [{ modAbility: [abl('warden_sweeping_blow', 'effects', { push: { type: 'aura', key: 'ember', to: 'enemies', aura: { id: 'warden_ember_sweep', name: 'Embers', icon: 'icon_burn', kind: 'debuff', duration: 6, period: 2, unique: 'per_caster',
      tick: [{ type: 'damage', amount: lv(2, 0.8), school: 'fire', canCrit: false }] } } })] }], { fork: 'a' }),
  // BUILDS_2_PLAY 1.3 amendment: Iron Sweep also gives Sweeping Blow +25% direct damage (fire over time vs steel burst)
  N('cinder', 3, 'iron_sweep', 'Iron Sweep', 1, 'warden_oathblade_momentum', 'Sweeping Blow hits 25% harder, slows foes 30% for 4 s and knocks them 1 tile back.',
    [{ mods: [dmgUp(0.25, { ability: 'warden_sweeping_blow', direct: true })],
      modAbility: [abl('warden_sweeping_blow', 'effects', { push: { type: 'aura', key: 'iron', to: 'enemies', aura: { id: 'warden_iron_sweep', name: 'Staggered', icon: 'icon_stun', kind: 'debuff', duration: 4, flags: ['slow'], mods: [{ stat: 'slow', add: 0.3 }] } } }),
        abl('warden_sweeping_blow', 'effects', { push: { type: 'move', key: 'shove', to: 'enemies', kind: 'knockback', distance: 16, time: 0.2 } })] }], { fork: 'b' }),
  N('cinder', 4, 'bellows', 'Bellows', 5, 'warden_lantern_beacon', 'Damage +{r*1}% for each foe within 3 tiles (up to 4 foes).',
    ranks(5, (r) => ({ mods: [mod('damageDone', { mul: pct(1 + 0.01 * r) }, { perNear: { radius: 48, max: 4 } })] }))),
  N('cinder', 5, 'furnace_heart', 'Furnace Heart', 1, 'warden_lantern_dawnbringer', 'At 60 Resolve or more, Strike and your swings also hit 2 more foes for 50%. In a fight, Resolve drains 2 a second.',
    [{ mods: [mod('cleave', { add: 2 }, { ability: ATTACKS, when: { resAbove: 60 } }), mod('cleavePct', { add: 0.5 }), mod('resDrain', { add: 2 })] }], { keystone: true }),

  // ---- Oathkeeper (S3: holds attention)
  N('oathkeeper', 1, 'commanding_voice', 'Commanding Voice', 5, 'warden_lantern_steady_flame', 'Threat +{r*6}%. A foe you taunted deals {r*2}% less to you.',
    ranks(5, (r) => ({ mods: [mod('threat', { mul: pct(1 + 0.06 * r) }), mod('damageTaken', { mul: pct(1 - 0.02 * r) }, { when: { attackerAura: 'warden_taunted', fromSelf: true } })] }))),
  N('oathkeeper', 2, 'hold_the_line', 'Hold the Line', 5, 'warden_lantern_lantern_glow', 'Taunt cooldown -{r*0.6} s.', ranks(5, (r) => ({ modAbility: [abl('warden_taunt', 'cooldown', { add: pct(-0.6 * r) })] }))),
  N('oathkeeper', 3, 'challenge', 'Challenge', 1, 'warden_lantern_warm_light', 'Taunt becomes a shout: every foe within 4 tiles must attack you.',
    [{ modAbility: [abl('warden_taunt', 'target', { set: 'none' }), abl('warden_taunt', 'area', { set: { shape: 'circle', radius: 64, at: 'self', maxTargets: 8 } }),
      abl('warden_taunt', 'effects.0.to', { set: 'enemies' })] }], { fork: 'a' }),
  N('oathkeeper', 3, 'kept_name', 'Kept Name', 1, 'warden_lantern_kept_name', 'Taunt a friend: for 6 s, 30% of the damage they take comes to you. A foe you taunted takes 15% more from you.',
    [{ script: 'kept_name', modAbility: [abl('warden_taunt', 'target', { set: 'any' })], mods: [dmgUp(0.15, { when: { targetAura: 'warden_taunted', fromSelf: true } })] }], { fork: 'b' }),
  N('oathkeeper', 4, 'retribution', 'Retribution', 5, 'warden_lantern_hearthward', 'A foe you taunted takes {r*1} + {r*0.4} x your level each time it hits you.',
    ranks(5, (r) => ({ procs: [{ on: 'damageTaken', when: { attackerAura: 'warden_taunted', fromSelf: true }, effects: [{ type: 'damage', to: 'attacker', amount: lv(r, pct(0.4 * r)), school: 'physical', canCrit: false, ability: 'b2_retribution' }] }] }))),
  N('oathkeeper', 5, 'gatekeeper', 'Gatekeeper', 1, 'warden_lantern_the_lantern_holds', 'Friends within 6 tiles take 12% less damage; you take 6% more. Alone, foes that hit you deal 12% less.',
    [{ script: 'b2_gatekeeper', mods: [mod('damageTaken', { mul: 0.88 }, { when: { solo: true } }), mod('damageTaken', { mul: 1.06 }, { when: { solo: false } })] }], { keystone: true }),

  // ---- Oathblade (W1: learn to kill)
  N('oathblade', 1, 'keen_edge', 'Keen Edge', 5, 'warden_oathblade_keen_edge', 'Crit chance +{r*1.5}%.', ranks(5, (r) => ({ mods: [mod('crit', { add: pct(0.015 * r) })] }))),
  N('oathblade', 2, 'momentum', 'Momentum', 5, 'warden_oathblade_clear_mind', 'Each Strike within 4 s of the last deals {r*2}% more, up to 5 times.',
    ranks(5, (r) => ({ procs: [{ on: 'cast', ability: 'warden_strike', effects: [{ type: 'aura', to: 'self', aura: { id: 'b2_momentum', name: 'Momentum', icon: 'warden_oathblade_clear_mind', kind: 'buff', duration: 4, maxStacks: 5, refresh: 'stack',
      mods: [{ stat: 'damageDone', mul: pct(1 + 0.02 * r), perStack: true, ability: 'warden_strike' }] } }] }] }))),
  N('oathblade', 3, 'keep_the_shield', 'Keep the Shield', 1, 'warden_bulwark_shieldbearers_vow', 'Shield Bash deals 40% more. You keep your block.',
    [{ mods: [dmgUp(0.4, { ability: 'warden_shield_bash' })] }], { fork: 'a' }),
  N('oathblade', 3, 'greatblade', 'Greatblade', 1, 'warden_oathblade_sword_sworn', 'Wield a two-hand blade: weapon damage +15%, Strike +10%. No block, and armor -15%.',
    // tuned 2026-11-19 (qa/sim/builds2.mjs spread): weapon damage +15%, Strike +10% (BUILDS_2 4.1: +55%, +20%)
    [{ mods: [mod('weaponMul', { mul: 1.15 }), dmgUp(0.1, { ability: 'warden_strike' }), mod('block', { add: -1 }), mod('armor', { mul: 0.85 })] }], { fork: 'b' }),
  N('oathblade', 4, 'finishing_cut', 'Finishing Cut', 5, 'warden_oathblade_finishing_cut', 'Strike deals {r*4}% more to foes under 35% health.',
    ranks(5, (r) => ({ mods: [dmgUp(0.04 * r, { ability: 'warden_strike', when: { targetHpBelow: 0.35 } })] }))),
  N('oathblade', 5, 'oathbreaker', 'Oathbreaker', 1, 'warden_oathblade_oathbreaker', 'Strike costs 40 and spends all your Resolve: +1.5% damage for each point above 20 (+120% at 100).',
    [{ script: 'b2_oathbreaker', modAbility: [abl('warden_strike', 'cost.amount', { set: 40 })] }], { keystone: true }),

  // ---- Stride (W2: reach them)
  N('stride', 1, 'long_stride', 'Long Stride', 5, 'warden_lantern_guiding_step', 'Move speed +{r*1}%.', ranks(5, (r) => ({ mods: [mod('speed', { mul: pct(1 + 0.01 * r) })] }))),
  N('stride', 2, 'gate_charge', 'Gate Charge', 5, 'warden_oathblade_sworn_strike', 'New skill, Gate Charge: rush a foe 3 to 8 tiles away and root it 1 s. Cooldown {r*1} s shorter after the first rank (12 s).',
    ranks(5, (r) => ({ grant: 'warden_gate_charge', modAbility: r > 1 ? [abl('warden_gate_charge', 'cooldown', { add: -(r - 1) })] : [] }))),
  N('stride', 3, 'iron_chain', 'Iron Chain', 1, 'warden_oathblade_weapon_weight', 'Gate Charge pulls the foe to you instead, from up to 10 tiles.',
    [{ modAbility: [abl('warden_gate_charge', 'range.max', { set: 160 }), abl('warden_gate_charge', 'range.min', { set: 0 }), abl('warden_gate_charge', 'arrive', { set: null }),
      abl('warden_gate_charge', 'effects', { set: [{ type: 'move', key: 'charge', to: 'target', kind: 'pull', time: 0.35 },
        { type: 'aura', key: 'root', aura: { id: 'warden_gate_root', name: 'Chained', icon: 'icon_stun', kind: 'debuff', duration: 1, flags: ['root'] } }] })] }], { fork: 'a' }),
  N('stride', 3, 'battering_ram', 'Battering Ram', 1, 'warden_oathblade_bright_steel', 'Gate Charge hits every foe on its path for 4 + your level and knocks them aside.',
    [{ modAbility: [abl('warden_gate_charge', 'area', { set: { shape: 'line', length: 128, width: 24, at: 'self', includeTarget: true } }),
      abl('warden_gate_charge', 'effects', { push: { type: 'damage', key: 'ram', to: 'enemies', amount: lv(4, 1), school: 'physical', canCrit: true } }),
      abl('warden_gate_charge', 'effects', { push: { type: 'move', key: 'aside', to: 'enemies', kind: 'knockback', distance: 24, time: 0.2 } })] }], { fork: 'b' }),
  N('stride', 4, 'unstoppable', 'Unstoppable', 5, 'warden_bulwark_last_stand', 'After a Gate Charge, slows cannot touch you for {r*1} s.',
    ranks(5, (r) => ({ modAbility: [abl('warden_gate_charge', 'effects', { push: { type: 'aura', key: 'unstop', to: 'self', aura: { id: 'b2_unstoppable', name: 'Unstoppable', icon: 'icon_haste', kind: 'buff', duration: r, immune: ['slow'] } } })] }))),
  N('stride', 5, 'iron_comet', 'Iron Comet', 1, 'warden_bulwark_challenge', 'A kill resets Gate Charge, and its reach grows 4 tiles. Armor -10%.',
    [{ modAbility: [abl('warden_gate_charge', 'range.max', { add: 64 })], mods: [mod('armor', { mul: 0.9 })],
      procs: [{ on: 'kill', effects: [{ type: 'cooldown', to: 'self', ability: 'warden_gate_charge', reset: true }] }] }], { keystone: true }),

  // ---- Sigilward (W3: stop spells)
  N('sigilward', 1, 'runed_plate', 'Runed Plate', 5, 'warden_bulwark_stout_heart', 'Your armor also works on spells, at {r*10}% of its strength.', ranks(5, (r) => ({ mods: [mod('spellArmor', { add: pct(0.1 * r) })] }))),
  N('sigilward', 2, 'steady_will', 'Steady Will', 5, 'warden_bulwark_weathered', 'A heavy blow drains {r*3} less Resolve (none at rank 5).', ranks(5, (r) => ({ mods: [mod('drainResist', { add: 3 * r })] }))),
  N('sigilward', 3, 'spellward', 'Spellward', 1, 'warden_lantern_hearthward', 'Spell damage taken -15%; physical +5%.',
    [{ mods: [mod('damageTaken', { mul: 0.85 }, { school: 'spell' }), mod('damageTaken', { mul: 1.05 }, { school: 'physical' })] }], { fork: 'a' }),
  N('sigilward', 3, 'ironward', 'Ironward', 1, 'warden_bulwark_iron_skin', 'Physical damage taken -10%; spells +5%.',
    [{ mods: [mod('damageTaken', { mul: 0.9 }, { school: 'physical' }), mod('damageTaken', { mul: 1.05 }, { school: 'spell' })] }], { fork: 'b' }),
  N('sigilward', 4, 'bash_breaker', 'Bash Breaker', 5, 'warden_oathblade_rising_wrath', 'Shield Bash reaches {r*0.5} tile farther and locks the spell {r*0.6} s longer.',
    ranks(5, (r) => ({ mods: [mod('range', { add: 8 * r }, { ability: 'warden_shield_bash' })], modAbility: [abl('warden_shield_bash', 'effects.1.lockout', { add: pct(0.6 * r) })] }))),
  N('sigilward', 5, 'spellbreaker', 'Spellbreaker', 1, 'warden_lantern_beacon', 'Breaking a spell throws it back at its caster for 100% and gives 20 Resolve. Armor -10%.',
    [{ script: 'b2_spellbreaker', mods: [mod('armor', { mul: 0.9 })] }], { keystone: true }),
];

// ------------------------------------------------------------------------------------------------ signatures
export const WARDEN_SIGNATURES = [
  { id: 'warden_gatewheel', name: 'Gatewheel', icon: 'icon_shield', ready: true, text: 'Throw your shield: it bounces between up to 5 foes within 6 tiles, double threat. No block until it returns.' },
  { id: 'warden_ember_leap', name: 'Ember Leap', icon: 'icon_heat', ready: true, text: 'Leap 4 to 10 tiles; the landing burns every foe near you and gives Resolve for each.' },
  { id: 'warden_furnace_form', name: 'Furnace Form', icon: 'icon_fire', ready: true, text: 'For 15 s a molten giant: no slows, every strike hits 3 foes, you burn what stands near.' },
];

// ------------------------------------------------------------------------------------------------ named builds (BUILDS_2_PLAY 1.4)
// 15 points to the level 15 cap: the main track to 8 by the 9th point, its keystone at level 10, then the second track.
export const WARDEN_BUILDS = [
  { id: 'shieldwheel', name: 'Shieldwheel', line: 'Bounce the shield into a camp and never drop your guard. The safest solo.', tracks: ['bulwark', 'oathkeeper', 'stride'],
    forks: ['rooted_stance', 'kept_name'], keystone: 'living_wall', signature: 'warden_gatewheel', signatures: ['warden_gatewheel', 'warden_ember_leap', 'warden_furnace_form'],
    picks: { 1: 'warden_sweeping_blow', 3: 'warden_taunt', 6: 'warden_iron_hide', 14: 'warden_oath_of_iron' },
    path: [...rep(P('bulwark', 'iron_skin'), 3), ...rep(P('bulwark', 'steady_shield'), 2), P('bulwark', 'rooted_stance'), ...rep(P('bulwark', 'rebuke'), 2), P('oathkeeper', 'commanding_voice'),
      P('bulwark', 'living_wall'), ...rep(P('bulwark', 'rebuke'), 3), ...rep(P('bulwark', 'steady_shield'), 2)] },
  { id: 'forge_reaver', name: 'Forge Reaver', line: 'A two-handed cleaving brawler: the fastest on packs, the least safe.', tracks: ['oathblade', 'cinder', 'bulwark'],
    // Oathbreaker (its keystone at 20) is left out of the 15-point path: spending all Resolve on one Strike lost about a third of the
    // build's damage against one foe in the bot (qa/sim/builds2.mjs, 16 s at level 15), a question for Scott, not a tuning fix
    forks: ['greatblade', 'ember_sweep'], keystone: 'oathbreaker', signature: 'warden_furnace_form', signatures: ['warden_furnace_form', 'warden_ember_leap', 'warden_gatewheel'],
    picks: { 1: 'warden_sweeping_blow', 3: 'warden_hurl_hammer', 6: 'warden_war_cry', 14: 'warden_anvil_drop' },
    path: [...rep(P('bulwark', 'iron_skin'), 2), ...rep(P('oathblade', 'keen_edge'), 3), ...rep(P('oathblade', 'momentum'), 3), ...rep(P('oathblade', 'finishing_cut'), 2),
      ...rep(P('cinder', 'kindled_resolve'), 2), ...rep(P('cinder', 'wide_arc'), 2), P('oathblade', 'greatblade')] },
  { id: 'spellbreaker', name: 'Spellbreaker', line: 'Leap onto casters and throw their bolts back at them.', tracks: ['sigilward', 'stride', 'oathblade'], answers: { caster: 10 },
    forks: ['spellward', 'iron_chain'], keystone: 'spellbreaker', signature: 'warden_ember_leap', signatures: ['warden_ember_leap', 'warden_gatewheel', 'warden_furnace_form'],
    picks: { 1: 'warden_second_wind', 3: 'warden_hurl_hammer', 6: 'warden_iron_hide', 14: 'warden_anvil_drop' },
    path: [...rep(P('sigilward', 'runed_plate'), 3), ...rep(P('sigilward', 'steady_will'), 2), P('sigilward', 'spellward'), ...rep(P('sigilward', 'bash_breaker'), 2), P('stride', 'long_stride'),
      P('sigilward', 'spellbreaker'), P('stride', 'long_stride'), ...rep(P('stride', 'gate_charge'), 2), P('stride', 'iron_chain'), P('oathblade', 'keen_edge')] },
];

// Cap 20 (phase 5, BUILDS_2 5.4): five more points per build for levels 16 to 20, on the build's own tracks (ranks the
// first 15 points left unfilled; no new forks, keystones or skills). qa/sim/builds2.mjs gates every level to 20.
const PAST_15 = {
  shieldwheel: [...rep(P('bulwark', 'iron_skin'), 2), P('bulwark', 'steady_shield'), ...rep(P('oathkeeper', 'commanding_voice'), 2)],
  forge_reaver: [...rep(P('bulwark', 'iron_skin'), 2), ...rep(P('oathblade', 'keen_edge'), 2), P('oathblade', 'momentum')],   // armor first: damage first ran 1.25x the Spellbreaker at 17
  spellbreaker: [...rep(P('oathblade', 'keen_edge'), 2), ...rep(P('sigilward', 'bash_breaker'), 2), P('sigilward', 'steady_will')],
};
for (const b of WARDEN_BUILDS) b.path.push(...PAST_15[b.id]);

export const WARDEN = {
  tracks: WARDEN_TRACKS,
  nodes: Object.fromEntries(WARDEN_NODES.map((n) => [n.id, n])),
  signatures: WARDEN_SIGNATURES,
  signatureAxis: 'Wall vs Leap vs Giant',
  builds: WARDEN_BUILDS,
  defaultBuild: 'shieldwheel',
  // BUILDS_2 4.1 baseline rules new in Builds 2: S2 +2 Resolve a second per foe in melee beyond the first; W2 move -5%;
  // W1 "slow to kill one foe" as a rule (tuned 2026-11-19, qa/sim/builds2.mjs: the bare Warden killed one plain foe in 7 s at
  // level 5, under the 9 s floor): damage -25% to a foe with no other foe within 3 tiles of it
  baseline: { mods: [{ stat: 'crowdResolve', add: 2 }, { stat: 'speed', mul: 0.95 }, { stat: 'damageDone', mul: 0.75, when: { targetAlone: 48 } }] },
};

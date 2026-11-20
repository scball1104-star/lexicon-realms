// Every player ability (docs/design/CLASSES.md sections 1-5) in the CONTRACTS 5.1 / 5.2 shape, plus the mob abilities
// the sim and the mob data use. Plain data. Seconds and px; the sim converts to ticks.
//
// Shapes used here beyond CONTRACTS 5 (documented in CONTRACTS 5.8):
//   amount: { base, perLevel }       flat part at the caster's level (also for cost.amount)
//   weapon: k                        k x W, W = one weapon swing (CLASSES 0.4)
//   coef: { stat: 'ap' | 'sp', k }   k x attack or spell power
//   scaleCombo: true                 the whole number is multiplied by the Ink Marks on the target (Spill, Bleed Line)
//   mobHit: k                        k x the mob's own swing (mob abilities)
//   pctMaxHp: k                      heal / absorb of k x the receiver's max HP
//   to: 'target' | 'self' | 'enemies' | 'allies' | 'caster' | 'attacker' | 'holder'
//   aura tick amounts are PER TICK (the doc's total / its tick count), so a longer duration adds ticks of the same size.
const MELEE = { min: 0, max: 40 };
const R8 = { min: 0, max: 128 };
const R9 = { min: 0, max: 144 };
const lv = (base, perLevel) => ({ base, perLevel });

export const ABILITIES = {
  // ------------------------------------------------------------------ Warden
  warden_strike: {
    id: 'warden_strike', name: 'Strike', icon: 'icon16_sword', cls: 'warden', learnLevel: 1, school: 'physical',
    cost: { kind: 'resolve', amount: 20 }, castTime: 0, cooldown: 0, gcd: true, range: MELEE, target: 'enemy', threatMult: 1.5,
    effects: [{ type: 'damage', key: 'hit', weapon: 1.0, amount: lv(3, 2.6), school: 'physical', canCrit: true }],
    text: 'Strike for {dmg} damage. Costs 20 Resolve.',
  },
  warden_shield_bash: {
    id: 'warden_shield_bash', name: 'Shield Bash', icon: 'shield_bash', cls: 'warden', learnLevel: 1, school: 'physical',
    cost: null, castTime: 0, cooldown: 6, gcd: true, range: MELEE, target: 'enemy', threatMult: 2, requires: { weapon: 'shield' },
    effects: [
      { type: 'damage', key: 'hit', amount: lv(3, 1.5), coef: { stat: 'ap', k: 0.25 }, school: 'physical', canCrit: true },
      { type: 'interrupt', lockout: 3 },
      { type: 'aura', key: 'stun', aura: { id: 'warden_bash_stun', name: 'Dazed', icon: 'stun', kind: 'debuff', duration: 1.0, flags: ['stun'] } },
      { type: 'resource', key: 'gain', to: 'self', kind: 'resolve', amount: 15 },
    ],
    text: 'Bash for {dmg} damage, interrupt and stun 1 s. Gives 15 Resolve.',
  },
  warden_taunt: {
    id: 'warden_taunt', name: 'Taunt', icon: 'taunt', cls: 'warden', learnLevel: 10, school: 'physical',
    cost: null, castTime: 0, cooldown: 8, gcd: false, range: R8, target: 'enemy', threatMult: 1,
    effects: [
      { type: 'threat', taunt: true, duration: 3 },
      { type: 'resource', to: 'self', kind: 'resolve', amount: 10 },
    ],
    text: 'The target must attack you for 3 s and walks to you. Gives 10 Resolve.',
  },
  warden_second_wind: {
    id: 'warden_second_wind', name: 'Second Wind', icon: 'second_wind', cls: 'warden', learnLevel: 6, school: 'physical',
    cost: { kind: 'resolve', amount: 30, freeOutOfCombat: true }, castTime: 0, cooldown: 45, gcd: true, range: null, target: 'self', threatMult: 1,
    effects: [{ type: 'aura', key: 'hot', to: 'self', aura: { id: 'warden_second_wind', name: 'Second Wind', icon: 'second_wind', kind: 'buff',
      duration: 6, period: 2, tick: [{ type: 'heal', to: 'holder', pctMaxHp: 0.25 / 3, canCrit: false }] } }],
    text: 'Heal 25% of your max health over 6 s. Free out of combat.',
  },
  // combat role pass (2026-11-19): learned at 3 (was 10) so the first packs have an answer; each foe hit also bleeds a little
  warden_sweeping_blow: {
    id: 'warden_sweeping_blow', name: 'Sweeping Blow', icon: 'sweep', cls: 'warden', learnLevel: 3, school: 'physical',
    cost: { kind: 'resolve', amount: 25 }, castTime: 0, cooldown: 6, gcd: true, range: null, target: 'none', threatMult: 2,
    area: { shape: 'cone', radius: 32, angle: 120, at: 'self', maxTargets: 4 },
    effects: [{ type: 'damage', key: 'hit', to: 'enemies', weapon: 0.7, amount: lv(2, 1), school: 'physical', canCrit: true },
      { type: 'aura', key: 'cut', to: 'enemies', aura: { id: 'warden_sweep_cut', name: 'Cut', icon: 'sweep', kind: 'debuff', dispel: 'bleed',
        duration: 6, period: 2, unique: 'per_caster', tick: [{ type: 'damage', amount: lv(1, 0.5), school: 'physical', canCrit: false, noArmor: true }] } }],
    text: 'Hit up to 4 foes in front of you for {dmg} each. Each one bleeds for {dot} over 6 s.',
  },
  warden_oath_of_iron: {
    id: 'warden_oath_of_iron', name: 'Oath of Iron', icon: 'oath_of_iron', cls: 'warden', learnLevel: 14, school: 'physical',
    cost: { kind: 'resolve', amount: 30 }, castTime: 0, cooldown: 60, gcd: false, range: null, target: 'self', threatMult: 1,
    effects: [{ type: 'aura', key: 'oath', to: 'self', aura: { id: 'warden_oath_of_iron', name: 'Oath of Iron', icon: 'oath_of_iron', kind: 'buff',
      duration: 8, mods: [{ stat: 'damageTaken', mul: 0.6 }], immune: ['stun', 'knockback'] } }],
    text: 'Take 40% less damage for 8 s and cannot be stunned or knocked back.',
  },

  // ------------------------------------------------------------------ Mender
  mender_kindle: {
    id: 'mender_kindle', name: 'Kindle', icon: 'kindle', cls: 'mender', learnLevel: 1, school: 'light',
    cost: { kind: 'mana', amount: lv(7, 1.4) }, castTime: 1.5, cooldown: 0, gcd: true, range: R8, target: 'enemy', threatMult: 1,
    projectile: { speed: 240 },
    effects: [{ type: 'damage', key: 'hit', amount: lv(8, 4.2), coef: { stat: 'sp', k: 0.7 }, school: 'light', canCrit: true }],
    text: 'Throw a small sun for {dmg} light damage.',
  },
  mender_mend: {
    id: 'mender_mend', name: 'Mend', icon: 'mend', cls: 'mender', learnLevel: 1, school: 'light',
    cost: { kind: 'mana', amount: lv(10, 2.2) }, castTime: 2.0, cooldown: 0, gcd: true, range: R8, target: 'ally', threatMult: 1,
    effects: [{ type: 'heal', key: 'heal', amount: lv(15, 7), coef: { stat: 'sp', k: 1.0 }, canCrit: true }],
    text: 'Heal a friend (or yourself) for {heal}.',
  },
  mender_brand: {
    id: 'mender_brand', name: 'Brand', icon: 'brand', cls: 'mender', learnLevel: 3, school: 'light',
    cost: { kind: 'mana', amount: lv(9, 1.6) }, castTime: 0, cooldown: 0, gcd: true, range: R8, target: 'enemy', threatMult: 1,
    effects: [{ type: 'aura', key: 'brand', aura: { id: 'mender_brand', name: 'Brand', icon: 'brand', kind: 'debuff', dispel: 'magic',
      duration: 12, period: 2, unique: 'per_caster',
      tick: [{ type: 'damage', amount: lv(14 / 6, 5 / 6), coef: { stat: 'sp', k: 0.6 / 6 }, school: 'light', canCrit: true }],
      procs: [{ on: 'hitTaken', ability: 'mender_kindle', fromCaster: true, effects: [{ type: 'heal', to: 'caster', pctOfDamage: 0.25, canCrit: false }] }] } }],
    text: 'Burn the foe for {dot} over 12 s. Your Kindle on it heals you for 25% of the damage.',
  },
  mender_warding_word: {
    id: 'mender_warding_word', name: 'Warding Word', icon: 'warding_word', cls: 'mender', learnLevel: 10, school: 'light',
    cost: { kind: 'mana', amount: lv(12, 2.5) }, castTime: 0, cooldown: 0, gcd: true, range: R8, target: 'ally', threatMult: 1,
    requires: { targetNoAura: 'mender_spoken_for' },
    effects: [
      { type: 'aura', key: 'ward', aura: { id: 'mender_warding_word', name: 'Warding Word', icon: 'warding_word', kind: 'buff', dispel: 'magic',
        duration: 15, absorb: { amount: lv(20, 8), coef: { stat: 'sp', k: 0.8 } }, flags: ['nopushback'] } },
      { type: 'aura', key: 'spoken', aura: { id: 'mender_spoken_for', name: 'Spoken For', icon: 'spoken_for', kind: 'debuff', duration: 15, unique: 'global' } },
    ],
    text: 'Shield a friend from {absorb} damage for 15 s. Casting is not pushed back while it holds.',
  },
  mender_steady_name: {
    id: 'mender_steady_name', name: 'Steady Name', icon: 'steady_name', cls: 'mender', learnLevel: 14, school: 'light',
    cost: { kind: 'mana', amount: lv(10, 2) }, castTime: 0, cooldown: 0, gcd: true, range: R8, target: 'ally', threatMult: 1,
    effects: [{ type: 'aura', key: 'hot', aura: { id: 'mender_steady_name', name: 'Steady Name', icon: 'steady_name', kind: 'buff', dispel: 'magic',
      duration: 12, period: 3, unique: 'per_caster',
      tick: [{ type: 'heal', to: 'holder', amount: lv(20 / 4, 9 / 4), coef: { stat: 'sp', k: 1.0 / 4 }, canCrit: true }] } }],
    text: 'Heal a friend for {hot} over 12 s.',
  },
  mender_chorus: {
    id: 'mender_chorus', name: 'Chorus', icon: 'chorus', cls: 'mender', learnLevel: 6, school: 'light',
    cost: { kind: 'mana', amount: lv(25, 4) }, castTime: 2.5, cooldown: 20, gcd: true, range: null, target: 'none', threatMult: 1,
    area: { shape: 'circle', radius: 96, at: 'self', maxTargets: 6 },
    effects: [
      { type: 'heal', key: 'heal', to: 'allies', amount: lv(12, 5), coef: { stat: 'sp', k: 0.5 }, canCrit: true },
      { type: 'damage', key: 'hit', to: 'enemies', amount: lv(8, 3), coef: { stat: 'sp', k: 0.35 }, school: 'light', canCrit: true },
    ],
    text: 'Heal every friend near you for {heal} and burn up to 6 foes for {dmg}.',
  },

  // ------------------------------------------------------------------ Scribe
  scribe_inkbolt: {
    id: 'scribe_inkbolt', name: 'Inkbolt', icon: 'inkbolt', cls: 'scribe', learnLevel: 1, school: 'ink',
    cost: { kind: 'mana', amount: lv(8, 1.8) }, castTime: 2.0, cooldown: 0, gcd: true, range: R9, target: 'enemy', threatMult: 1,
    projectile: { speed: 240 },
    selfMods: [{ stat: 'castTime', add: -0.5, when: { targetAura: 'scribe_underline', fromSelf: true } }],
    effects: [{ type: 'damage', key: 'hit', amount: lv(12, 5.4), coef: { stat: 'sp', k: 0.8 }, school: 'ink', canCrit: true }],
    text: 'A fat stroke of ink for {dmg} damage. 0.5 s faster at an Underlined target.',
  },
  scribe_scrawl: {
    id: 'scribe_scrawl', name: 'Scrawl', icon: 'scrawl', cls: 'scribe', learnLevel: 1, school: 'ink',
    cost: { kind: 'mana', amount: lv(6, 1.5) }, castTime: 0, cooldown: 6, gcd: true, range: R9, target: 'enemy', threatMult: 1,
    effects: [
      { type: 'damage', key: 'hit', amount: lv(5, 2), coef: { stat: 'sp', k: 0.3 }, school: 'ink', canCrit: true },
      { type: 'aura', key: 'slow', aura: { id: 'scribe_scrawl', name: 'Scrawled', icon: 'scrawl', kind: 'debuff', duration: 4, flags: ['slow'], mods: [{ stat: 'slow', add: 0.3 }] } },
    ],
    text: 'Scribble {dmg} damage onto the foe and slow it 30% for 4 s.',
  },
  scribe_full_stop: {
    id: 'scribe_full_stop', name: 'Full Stop', icon: 'full_stop', cls: 'scribe', learnLevel: 3, school: 'ink',
    cost: { kind: 'mana', amount: lv(10, 2) }, castTime: 0, cooldown: 15, gcd: true, range: null, target: 'none', threatMult: 1,
    area: { shape: 'circle', radius: 48, at: 'self', maxTargets: 0 },
    effects: [
      // combat role pass: the Scribe's first area hit, so it hurts (was 3 + L + 0.15 SP)
      { type: 'damage', key: 'hit', to: 'enemies', amount: lv(6, 2.4), coef: { stat: 'sp', k: 0.4 }, school: 'ink', canCrit: true },
      { type: 'aura', key: 'root', to: 'enemies', aura: { id: 'scribe_full_stop', name: 'Full Stop', icon: 'full_stop', kind: 'debuff', duration: 4, flags: ['root'] } },
    ],
    text: 'Every foe within 3 tiles takes {dmg} and is rooted for 4 s.',
  },
  scribe_underline: {
    id: 'scribe_underline', name: 'Underline', icon: 'underline', cls: 'scribe', learnLevel: 6, school: 'ink',
    cost: { kind: 'mana', amount: lv(10, 2) }, castTime: 0, cooldown: 0, gcd: true, range: R9, target: 'enemy', threatMult: 1,
    effects: [{ type: 'aura', key: 'dot', aura: { id: 'scribe_underline', name: 'Underline', icon: 'underline', kind: 'debuff', dispel: 'magic',
      duration: 12, period: 2, unique: 'per_caster',
      tick: [{ type: 'damage', amount: lv(10 / 6, 4 / 6), coef: { stat: 'sp', k: 0.5 / 6 }, school: 'ink', canCrit: true }] } }],
    text: 'Ink seeps for {dot} over 12 s. Your Inkbolt at an Underlined target casts 0.5 s faster.',
  },
  scribe_scatter_letters: {
    id: 'scribe_scatter_letters', name: 'Scatter Letters', icon: 'scatter_letters', cls: 'scribe', learnLevel: 10, school: 'ink',
    cost: { kind: 'mana', amount: lv(20, 3) }, castTime: 0, cooldown: 12, gcd: true, range: R9, target: 'ground', threatMult: 1,
    effects: [{ type: 'summon', key: 'zone', object: { id: 'scribe_scatter_letters', sprite: 'zone_letters', at: 'ground', armTime: 0, duration: 6, max: 3,
      radius: 40, period: 2, maxTargets: 8,
      pulse: [{ type: 'damage', amount: lv(4, 1.6), coef: { stat: 'sp', k: 0.2 }, school: 'ink', canCrit: true }],
      inside: [{ type: 'aura', aura: { id: 'scribe_scatter_slow', name: 'Scattered', icon: 'scatter_letters', kind: 'debuff', duration: 0.25, flags: ['slow'], mods: [{ stat: 'slow', add: 0.2 }] } }] } }],
    text: 'Letters rain on a spot for 6 s: {dmg} every 2 s to every foe inside, slowed 20%.',
  },
  scribe_bracket: {
    id: 'scribe_bracket', name: 'Bracket', icon: 'bracket', cls: 'scribe', learnLevel: 14, school: 'ink',
    cost: { kind: 'mana', amount: lv(15, 2) }, castTime: 1.5, cooldown: 0, gcd: true, range: R9, target: 'enemy', threatMult: 0,
    effects: [{ type: 'aura', key: 'hold', aura: { id: 'scribe_bracket', name: 'Bracketed', icon: 'bracket', kind: 'debuff', duration: 10,
      flags: ['incap'], breakOn: ['damage'], eliteImmune: true, limitPerCaster: 1, period: 1,
      tick: [{ type: 'heal', to: 'holder', pctMaxHp: 0.05, canCrit: false, noThreat: true }] } }],
    text: 'Hold a foe in two great brackets for 10 s. It heals while held. Breaks on damage. Elites are immune.',
  },

  // ------------------------------------------------------------------ Wayfinder
  wayfinder_quick_shot: {
    id: 'wayfinder_quick_shot', name: 'Quick Shot', icon: 'quick_shot', cls: 'wayfinder', learnLevel: 1, school: 'physical',
    cost: { kind: 'focus', amount: 25 }, castTime: 0, cooldown: 0, gcd: true, range: R9, target: 'enemy', threatMult: 1,
    requires: { weapon: 'bow' }, projectile: { speed: 480 },
    // fix pass 1 (PLAYTEST_BOT bug 15): the Wayfinder survives by distance (CLASSES 6), so her plain shot buys some: a foe
    // it hits is Hobbled, 30% slower for 3 s, and walks in under more arrows
    effects: [{ type: 'damage', key: 'hit', weapon: 0.7, amount: lv(3, 1.5), school: 'physical', canCrit: true },
      { type: 'aura', key: 'hobble', aura: { id: 'wayfinder_hobbled', name: 'Hobbled', icon: 'quick_shot', kind: 'debuff', duration: 3, flags: ['slow'], mods: [{ stat: 'slow', add: 0.3 }] } }],
    text: 'A fast arrow for {dmg} damage. The foe is Hobbled, 30% slower for 3 s.',
  },
  wayfinder_pinning_shot: {
    id: 'wayfinder_pinning_shot', name: 'Pinning Shot', icon: 'pinning_shot', cls: 'wayfinder', learnLevel: 1, school: 'physical',
    cost: { kind: 'focus', amount: 15 }, castTime: 0, cooldown: 8, gcd: true, range: R9, target: 'enemy', threatMult: 1,
    requires: { weapon: 'bow' }, projectile: { speed: 480 },
    effects: [
      { type: 'damage', key: 'hit', weapon: 0.5, amount: lv(2, 1), school: 'physical', canCrit: true },
      // combat role pass: the arrow stays in and bleeds, the Wayfinder's damage over time (3 ticks, 2 s apart)
      { type: 'aura', key: 'slow', aura: { id: 'wayfinder_pinning_shot', name: 'Pinned', icon: 'pinning_shot', kind: 'debuff', duration: 6, flags: ['slow'], mods: [{ stat: 'slow', add: 0.5 }],
        dispel: 'bleed', period: 2, tick: [{ type: 'damage', amount: lv(3, 1.5), school: 'physical', canCrit: false, noArmor: true }] } },
    ],
    text: 'An arrow for {dmg} that slows the foe 50% for 6 s. The arrow stays in and bleeds for {dot}.',
  },
  wayfinder_briar_trap: {
    id: 'wayfinder_briar_trap', name: 'Briar Trap', icon: 'briar_trap', cls: 'wayfinder', learnLevel: 3, school: 'nature',
    cost: { kind: 'focus', amount: 20 }, castTime: 0, cooldown: 15, gcd: true, range: null, target: 'none', threatMult: 1,
    effects: [{ type: 'summon', key: 'trap', object: { id: 'wayfinder_briar_trap', sprite: 'trap_briar', at: 'self', armTime: 1.0, duration: 30, max: 1,
      trigger: { radius: 24, who: 'hostile', once: true },
      // combat role pass: the briar bursts, so every foe within 2 tiles of it (the whole pack at your heels) is caught
      effects: [
        { type: 'damage', key: 'hit', to: 'enemies_near_holder', radius: 32, maxTargets: 4, amount: lv(8, 3), school: 'physical', canCrit: true },
        { type: 'aura', key: 'root', to: 'enemies_near_holder', radius: 32, maxTargets: 4, aura: { id: 'wayfinder_briar_root', name: 'Briar', icon: 'briar_trap', kind: 'debuff', duration: 6, flags: ['root'], noRootBreak: true }, proc: 'trapRoot' },
      ] } }],
    text: 'Lay a briar at your feet. It arms in 1 s. When a foe steps in it bursts: every foe within 2 tiles takes {dmg} and is rooted 6 s.',
  },
  wayfinder_light_foot: {
    id: 'wayfinder_light_foot', name: 'Light Foot', icon: 'light_foot', cls: 'wayfinder', learnLevel: 6, school: 'physical',
    cost: { kind: 'focus', amount: 10 }, castTime: 0, cooldown: 18, gcd: false, range: null, target: 'self', threatMult: 0,
    effects: [
      { type: 'dispel', to: 'self', flags: ['slow', 'root'] },
      { type: 'move', key: 'leap', kind: 'leap', distance: 80, time: 0.3, dir: 'back' },
    ],
    text: 'Leap 5 tiles back and shake off slows and roots.',
  },
  wayfinder_aimed_shot: {
    id: 'wayfinder_aimed_shot', name: 'Aimed Shot', icon: 'aimed_shot', cls: 'wayfinder', learnLevel: 10, school: 'physical',
    cost: { kind: 'focus', amount: 30 }, castTime: 2.0, cooldown: 8, gcd: true, range: { min: 0, max: 160 }, target: 'enemy', threatMult: 1,
    requires: { weapon: 'bow', notMoving: true }, projectile: { speed: 480 },
    effects: [{ type: 'damage', key: 'hit', weapon: 1.4, amount: lv(8, 3.6), school: 'physical', canCrit: true }],
    text: 'Stand still and loose a heavy arrow for {dmg}.',
  },
  wayfinder_volley: {
    id: 'wayfinder_volley', name: 'Volley', icon: 'volley', cls: 'wayfinder', learnLevel: 14, school: 'physical',
    cost: { kind: 'focus', amount: 35 }, castTime: 0, channel: { duration: 3, ticks: 3 }, cooldown: 12, gcd: true, range: R9, target: 'ground', threatMult: 1,
    requires: { weapon: 'bow', notMoving: true },
    area: { shape: 'circle', radius: 40, at: 'ground', maxTargets: 8 },
    effects: [{ type: 'damage', key: 'hit', to: 'enemies', weapon: 0.35, amount: lv(2, 1), school: 'physical', canCrit: true }],
    text: 'Rain 3 waves of arrows on a spot, {dmg} to every foe inside each time.',
  },

  // ------------------------------------------------------------------ Inkblade
  inkblade_nick: {
    id: 'inkblade_nick', name: 'Nick', icon: 'nick', cls: 'inkblade', learnLevel: 1, school: 'physical',
    cost: { kind: 'focus', amount: 30 }, castTime: 0, cooldown: 0, gcd: true, range: MELEE, target: 'enemy', threatMult: 1,
    requires: { weapon: 'dagger' },
    effects: [
      { type: 'damage', key: 'hit', weapon: 0.9, amount: lv(2, 1.2), school: 'physical', canCrit: true },
      { type: 'combo', key: 'mark', add: 1 },
    ],
    text: 'A quick cut for {dmg}. Adds an Ink Mark.',
  },
  inkblade_spill: {
    id: 'inkblade_spill', name: 'Spill', icon: 'spill', cls: 'inkblade', learnLevel: 1, school: 'physical',
    cost: { kind: 'focus', amount: 25 }, castTime: 0, cooldown: 0, gcd: true, range: MELEE, target: 'enemy', threatMult: 1,
    requires: { weapon: 'dagger', combo: 1 },
    effects: [
      { type: 'damage', key: 'hit', amount: lv(4, 1.8), coef: { stat: 'ap', k: 0.1 }, scaleCombo: true, school: 'physical', canCrit: true },
      // fix pass 1 (PLAYTEST_BOT bug 15): the Inkblade's cheap self-heal: each mark spilled gives back 7% of your health
      // (5% in fix pass 1; 7% in the combat role pass; 8% in the class identity pass, the Inkblade still died most in the questbot)
      { type: 'heal', key: 'drink', to: 'self', pctMaxHp: 0.08, scaleCombo: true, canCrit: false, noThreat: true, ability: 'inkblade_spill' },
      { type: 'combo', key: 'consume', consume: true },
    ],
    text: 'Pop every Ink Mark for {dmg} per mark. Each mark spilled heals you for 8% of your health.',
  },
  inkblade_fade: {
    id: 'inkblade_fade', name: 'Fade', icon: 'fade', cls: 'inkblade', learnLevel: 3, school: 'shadow',
    cost: null, castTime: 0, cooldown: 6, cooldownFromCombatEnd: true, gcd: true, range: null, target: 'self', threatMult: 0,
    requires: { outOfCombat: true },
    effects: [{ type: 'aura', key: 'stealth', to: 'self', aura: { id: 'inkblade_fade', name: 'Fade', icon: 'fade', kind: 'buff', duration: null,
      flags: ['stealth'], breakOn: ['action', 'damage'], mods: [{ stat: 'speed', add: -0.2 }],
      opener: { bonus: 0.5, combo: 1 } } }],
    text: 'Fade from sight out of combat. Your first attack from Fade deals 50% more and adds an extra Ink Mark.',
  },
  inkblade_ink_in_the_eyes: {
    id: 'inkblade_ink_in_the_eyes', name: 'Ink in the Eyes', icon: 'ink_in_the_eyes', cls: 'inkblade', learnLevel: 14, school: 'shadow',
    cost: { kind: 'focus', amount: 20 }, castTime: 0, cooldown: 30, gcd: true, range: { min: 0, max: 48 }, target: 'enemy', threatMult: 0,
    keepsStealth: true,
    effects: [{ type: 'aura', key: 'incap', aura: { id: 'inkblade_ink_in_the_eyes', name: 'Ink in the Eyes', icon: 'ink_in_the_eyes', kind: 'debuff',
      duration: 6, eliteDuration: 2, flags: ['incap'], breakOn: ['damage'] } }],
    text: 'Blind a foe for 6 s (elites 2 s). Breaks on damage. Does not end Fade.',
  },
  inkblade_bleed_line: {
    id: 'inkblade_bleed_line', name: 'Bleed Line', icon: 'bleed_line', cls: 'inkblade', learnLevel: 10, school: 'physical',
    cost: { kind: 'focus', amount: 25 }, castTime: 0, cooldown: 0, gcd: true, range: MELEE, target: 'enemy', threatMult: 1,
    requires: { weapon: 'dagger', combo: 1 },
    effects: [
      { type: 'aura', key: 'dot', aura: { id: 'inkblade_bleed_line', name: 'Bleed Line', icon: 'bleed_line', kind: 'debuff', dispel: 'bleed',
        duration: 12, period: 2, unique: 'per_caster', scaleCombo: true,
        tick: [{ type: 'damage', amount: lv(5 / 6, 2.2 / 6), coef: { stat: 'ap', k: 0.12 / 6 }, school: 'physical', canCrit: true, noArmor: true }] } },
      { type: 'combo', key: 'consume', consume: true },
    ],
    text: 'Open a line that bleeds {dot} per mark over 12 s. Consumes every mark.',
  },
  // combat role pass (2026-11-19): the Inkblade's area strike, learned at 6 (was a level 14 gap closer). It still steps
  // behind the foe; on landing it cuts every foe within 2 tiles of it, marks your target, and the ink makes them hit softer
  inkblade_inkstep: {
    id: 'inkblade_inkstep', name: 'Inkstep', icon: 'inkstep', cls: 'inkblade', learnLevel: 6, school: 'shadow',
    cost: { kind: 'focus', amount: 25 }, castTime: 0, cooldown: 8, gcd: true, range: R8, target: 'enemy', threatMult: 1,
    requires: { weapon: 'dagger' },
    area: { shape: 'circle', radius: 32, at: 'target', maxTargets: 4 },
    effects: [
      { type: 'move', key: 'step', kind: 'blink_behind' },
      { type: 'damage', key: 'hit', to: 'enemies', weapon: 0.6, amount: lv(2, 1), school: 'physical', canCrit: true },
      { type: 'interrupt', key: 'cut', to: 'target', lockout: 3 },
      { type: 'aura', key: 'smudge', to: 'enemies', aura: { id: 'inkblade_smudged', name: 'Smudged', icon: 'inkstep', kind: 'debuff', duration: 10,
        mods: [{ stat: 'damageDone', mul: 0.8 }] } },
      { type: 'combo', key: 'mark', to: 'target', add: 1 },
      { type: 'aura', key: 'ready', to: 'self', aura: { id: 'inkblade_inkstep_ready', name: 'Inkstep', icon: 'inkstep', kind: 'buff', duration: 3,
        comboBonus: 1, consumeOn: { cast: 'inkblade_nick' } } },
    ],
    text: 'Step behind the foe, interrupt its cast and cut every foe within 2 tiles for {dmg}. They deal 20% less damage for 10 s. Marks your target; your next Nick within 3 s adds an extra mark.',
  },
};

// Mob abilities (mob data names them in `abilities: [{ id, chance, cooldown }]`). Same schema.
export const MOB_ABILITIES = {
  mob_bolt: {
    id: 'mob_bolt', name: 'Ink Bolt', icon: 'inkbolt', school: 'shadow', mob: true,
    cost: null, castTime: 2.0, cooldown: 0, gcd: true, range: { min: 0, max: 112 }, target: 'enemy', threatMult: 1,
    projectile: { speed: 200 },
    effects: [{ type: 'damage', mobHit: 1.6, school: 'shadow', canCrit: false }],
    text: 'A slow bolt.',
  },
  mob_lunge: {
    id: 'mob_lunge', name: 'Lunge', icon: 'claw', school: 'physical', mob: true,
    cost: null, castTime: 0, cooldown: 8, gcd: true, range: { min: 0, max: 40 }, target: 'enemy', threatMult: 1,
    effects: [{ type: 'damage', mobHit: 1.5, school: 'physical', canCrit: false }],
    text: 'A hard bite.',
  },
  mob_hamstring: {
    id: 'mob_hamstring', name: 'Snap', icon: 'claw', school: 'physical', mob: true,
    cost: null, castTime: 0, cooldown: 12, gcd: true, range: { min: 0, max: 40 }, target: 'enemy', threatMult: 1,
    effects: [
      { type: 'damage', mobHit: 0.6, school: 'physical', canCrit: false },
      { type: 'aura', aura: { id: 'mob_hamstring', name: 'Snapped', icon: 'claw', kind: 'debuff', duration: 4, flags: ['slow'], mods: [{ stat: 'slow', add: 0.4 }] } },
    ],
    text: 'A snap at the legs that slows.',
  },
  mob_mend: {
    id: 'mob_mend', name: 'Lamp Light', icon: 'mend', school: 'light', mob: true,
    cost: null, castTime: 1.5, cooldown: 6, gcd: true, range: { min: 0, max: 160 }, target: 'ally', threatMult: 1,
    effects: [{ type: 'heal', pctMaxHp: 0.04, canCrit: false }],
    text: 'Heals an ally.',
  },
};

// Builds 2, the Scribe (docs/design/BUILDS_2.md 4.3; the signature chip "Words that fight vs Words that strike" and the
// named builds stated in full from BUILDS_2_PLAY 1.3 and 1.4). Plain data. Numbers are the design numbers unless a line
// says "tuned" (qa/sim/builds2.mjs is the gate).
import { ranks, pct, lv, mod, abl, rep, dmgUp, nodeMaker, pathMaker } from './builds2_kit.js';

const N = nodeMaker('scribe');
const P = pathMaker('scribe');
const R9 = { min: 0, max: 144 };
const SPELLS = ['scribe_inkbolt', 'scribe_scrawl', 'scribe_full_stop', 'scribe_underline', 'scribe_scatter_letters', 'scribe_bracket', 'scribe_exclamation', 'scribe_ink_lash'];

export const SCRIBE_ABILITIES = {
  // level 6 pick: Group utility vs Self fuel
  scribe_erase: {
    id: 'scribe_erase', name: 'Erase', icon: 'icon_scroll', cls: 'scribe', learnLevel: 6, school: 'ink',
    cost: { kind: 'mana', amount: lv(10, 2) }, castTime: 0, cooldown: 12, gcd: true, range: R9, target: 'enemy', threatMult: 1,
    effects: [
      { type: 'dispel', key: 'strip', kinds: ['magic'], hostile: true },
      { type: 'aura', key: 'erased', aura: { id: 'scribe_erased', name: 'Erased', icon: 'icon_scroll', kind: 'debuff', duration: 10, mods: [{ stat: 'armorMul', mul: 0.8 }] } },
    ],
    text: 'Rub out a foe\'s magic buffs; its armor is 20% lower for 10 s (for everyone).',
  },
  scribe_inkwell_pause: {
    id: 'scribe_inkwell_pause', name: 'Inkwell Pause', icon: 'icon_ether', cls: 'scribe', learnLevel: 6, school: 'ink',
    cost: null, castTime: 0, channel: { duration: 3, ticks: 3 }, cooldown: 30, gcd: true, range: null, target: 'self', threatMult: 0,
    effects: [{ type: 'resource', key: 'ink', to: 'self', kind: 'mana', pctOfMax: pct(0.25 / 3) }],
    text: 'Dip the quill for 3 s and get back 25% of your mana.',
  },
  // level 14 pick: Push away vs Wall off
  scribe_exclamation: {
    id: 'scribe_exclamation', name: 'Exclamation', icon: 'icon_letter', cls: 'scribe', learnLevel: 14, school: 'ink',
    cost: { kind: 'mana', amount: lv(12, 2) }, castTime: 0.5, cooldown: 20, gcd: true, range: null, target: 'none', threatMult: 1,
    area: { shape: 'cone', radius: 64, angle: 90, at: 'self', maxTargets: 6 },
    effects: [
      // tuned 2026-11-19 (qa/sim/builds2.mjs spread): 8 + 2 x level + 0.35 SP (BUILDS_2 4.3: 8 + 3 L + 0.5 SP)
      { type: 'damage', key: 'hit', to: 'enemies', amount: lv(8, 2), coef: { stat: 'sp', k: 0.35 }, school: 'ink', canCrit: true },
      { type: 'move', key: 'push', to: 'enemies', kind: 'knockback', distance: 48, time: 0.25 },
    ],
    text: 'A shouted mark: every foe in a 4-tile cone takes {dmg} and is knocked 3 tiles back.',
  },
  scribe_paragraph: {
    id: 'scribe_paragraph', name: 'Paragraph', icon: 'icon_book', cls: 'scribe', learnLevel: 14, school: 'ink',
    cost: { kind: 'mana', amount: lv(15, 2) }, castTime: 0, cooldown: 20, gcd: true, range: R9, target: 'ground', threatMult: 0,
    effects: [{ type: 'script', key: 'wall', name: 'b2_paragraph', to: 'self' }],
    text: 'Write a 5-tile ink wall for 6 s. Foes cannot cross it.',
  },
  // Bindings +skill (tier 2) and the Ink Lash fork (Erasure tier 3)
  scribe_vellum_ward: {
    id: 'scribe_vellum_ward', name: 'Vellum Ward', icon: 'icon_protect', cls: 'scribe', learnLevel: 1, school: 'ink',
    cost: { kind: 'mana', amount: lv(10, 2) }, castTime: 0, cooldown: 20, gcd: true, range: null, target: 'self', threatMult: 0,
    effects: [{ type: 'aura', key: 'ward', to: 'self', aura: { id: 'scribe_vellum_ward', name: 'Vellum Ward', icon: 'icon_protect', kind: 'buff', dispel: 'magic', duration: 15,
      absorb: { amount: lv(15, 6), coef: { stat: 'sp', k: 0.6 } } } }],
    text: 'Wrap yourself in vellum: it absorbs {absorb} damage for 15 s.',
  },
  scribe_ink_lash: {
    id: 'scribe_ink_lash', name: 'Ink Lash', icon: 'icon_quill', cls: 'scribe', learnLevel: 1, school: 'ink',
    cost: null, castTime: 0, cooldown: 3, gcd: true, range: { min: 0, max: 80 }, target: 'enemy', threatMult: 1,
    effects: [
      { type: 'damage', key: 'hit', amount: lv(4, 2), coef: { stat: 'sp', k: 0.4 }, school: 'ink', canCrit: true },
      { type: 'resource', key: 'back', to: 'self', kind: 'mana', pctOfMax: 0.04 },
    ],
    text: 'Lash a foe within 5 tiles with the quill for {dmg}. Gives back 4% of your mana.',
  },
  // ---- signatures
  scribe_ellipsis: {
    id: 'scribe_ellipsis', name: 'Ellipsis', icon: 'icon_swap', cls: 'scribe', learnLevel: 10, school: 'ink',
    cost: { kind: 'mana', amount: lv(8, 1) }, castTime: 0, cooldown: 10, charges: 2, gcd: true, range: { min: 0, max: 128 }, target: 'ground', threatMult: 0,
    effects: [
      { type: 'summon', key: 'dots', object: { id: 'scribe_ellipsis_dots', name: 'Ellipsis', sprite: 'trap_snare', at: 'self', armTime: 0.3, duration: 10, max: 2,
        trigger: { radius: 24, who: 'hostile', once: true },
        effects: [{ type: 'aura', key: 'root', aura: { id: 'scribe_ellipsis_root', name: 'Ellipsis', icon: 'icon_stun', kind: 'debuff', duration: 2, flags: ['root'] } }] } },
      { type: 'move', key: 'blink', kind: 'blink_to', distance: 128 },
    ],
    text: 'Vanish and reappear up to 8 tiles away. Three ink dots stay behind; the first foe to cross them is rooted 2 s. 2 charges.',
  },
  scribe_living_words: {
    id: 'scribe_living_words', name: 'Living Words', icon: 'icon_letter', cls: 'scribe', learnLevel: 10, school: 'ink',
    cost: { kind: 'mana', amount: lv(20, 3) }, castTime: 2.5, cooldown: 6, gcd: true, range: null, target: 'none', threatMult: 0,
    effects: [{ type: 'summon', key: 'hound', object: { id: 'scribe_ink_hound', name: 'Ink Hound', sprite: 'ink_double', at: 'self', armTime: 0, duration: 45, max: 2,
      hpPct: 0.35, holdThreat: true, pet: { period: 2, range: 24, speed: 88, effects: [{ type: 'damage', amount: lv(4, 1.8), coef: { stat: 'sp', k: 0.3 }, school: 'ink' }] } } }],
    text: 'Write an Ink Hound into being for 45 s (up to 2). It has 35% of your health, bites for {dmg} every 2 s and holds the foe\'s eye.',
  },
  scribe_rewrite: {
    id: 'scribe_rewrite', name: 'Rewrite', icon: 'icon_charm', cls: 'scribe', learnLevel: 10, school: 'ink',
    cost: { kind: 'mana', amount: lv(20, 3) }, castTime: 1.5, cooldown: 30, gcd: true, range: R9, target: 'enemy', threatMult: 0, requires: { notElite: true },
    effects: [{ type: 'script', key: 'charm', name: 'b2_rewrite', args: { duration: 12 } }],
    text: 'Rewrite a foe (not an elite): it fights for you for 12 s, then takes 20% of its health as ink.',
  },
};

export const SCRIBE_TRACKS = [
  { id: 'quill', name: 'Quill', kind: 'strength', trait: 'S1', purpose: 'Strength: the biggest spell', axis: 'Single target vs Area', chip: 'Single vs Area' },
  { id: 'margin', name: 'Margin', kind: 'strength', trait: 'S2', purpose: 'Strength: control', axis: 'Control vs Damage', chip: 'Damage vs Control' },
  { id: 'erasure', name: 'Erasure', kind: 'strength', trait: 'S3', purpose: 'Strength: ink through armor', axis: 'Physical attack vs Magic attack', chip: 'Lash vs Spell' },
  { id: 'bindings', name: 'Bindings', kind: 'weakness', trait: 'W1', purpose: 'Patches: fragile', axis: 'Magic armor vs Physical armor', chip: 'Spell vs Physical' },
  { id: 'shorthand', name: 'Shorthand', kind: 'weakness', trait: 'W2', purpose: 'Patches: must stand to cast', axis: 'Move and cast vs Stand and cast', chip: 'Move vs Stand' },
  { id: 'inkwell', name: 'Inkwell', kind: 'weakness', trait: 'W3', purpose: 'Patches: mana-hungry', axis: 'Health as fuel vs Mana as fuel', chip: 'Health vs Mana' },
];

const SCRIBE_NODES = [
  // ---- Quill (S1: burst)
  N('quill', 1, 'heavy_nib', 'Heavy Nib', 5, 'scribe_quill_heavy_stroke', 'Inkbolt damage +{r*3}%.', ranks(5, (r) => ({ mods: [dmgUp(0.03 * r, { ability: 'scribe_inkbolt' })] }))),
  N('quill', 2, 'sharp_hand', 'Sharp Hand', 5, 'scribe_quill_sharp_nib', 'Spell crit +{r*1.5}%.', ranks(5, (r) => ({ mods: [mod('crit', { add: pct(0.015 * r) }, { school: 'spell' })] }))),
  N('quill', 3, 'capital_letter', 'Capital Letter', 1, 'scribe_quill_capital_letter', 'Every 4th Inkbolt is a sure crit (+50%).',
    [{ script: 'b2_capital' }], { fork: 'a' }),
  N('quill', 3, 'splatter', 'Splatter', 1, 'scribe_wet_ink_spatter', 'Inkbolt splashes 35% of its damage on foes within 2 tiles.',
    [{ procs: [{ on: 'hit', ability: 'scribe_inkbolt', effects: [{ type: 'damage', to: 'enemies_near_holder', radius: 32, excludeHolder: true, pctOfDamage: 0.35, school: 'ink', canCrit: false, ability: 'b2_splatter' }] }] }], { fork: 'b' }),
  N('quill', 4, 'underscore', 'Underscore', 5, 'scribe_quill_underscore', 'Inkbolt at an Underlined foe casts a further {r*0.1} s faster.',
    ranks(5, (r) => ({ mods: [mod('castTime', { add: pct(-0.1 * r) }, { ability: 'scribe_inkbolt', when: { targetAura: 'scribe_underline', fromSelf: true } })] }))),
  N('quill', 5, 'final_draft', 'Final Draft', 1, 'scribe_quill_final_draft', 'Inkbolt is a 3 s cast for 90% more damage, and no hit pushes it back. It costs 30% more.',
    [{ modAbility: [abl('scribe_inkbolt', 'castTime', { set: 3.0 }), abl('scribe_inkbolt', 'effects.#hit.mult', { set: 1.9 }), abl('scribe_inkbolt', 'cost.amount', { mul: 1.3 })],
      mods: [mod('pushback', { mul: 0 }, { ability: 'scribe_inkbolt' })] }], { keystone: true }),

  // ---- Margin (S2: control)
  N('margin', 1, 'long_pause', 'Long Pause', 5, 'scribe_margin_long_pause', 'Your roots and slows last {r*6}% longer.', ranks(5, (r) => ({ mods: [mod('snareDuration', { mul: pct(1 + 0.06 * r) })] }))),
  N('margin', 2, 'fine_print', 'Fine Print', 5, 'scribe_margin_wide_margin', 'Fast foes keep {r*20}% more of the snare time they would shed, hit you {r*10}% softer and take {r*9}% more from you.',
    ranks(5, (r) => ({ mods: [mod('snareFast', { add: pct(0.2 * r) }), mod('damageTaken', { mul: pct(1 - 0.1 * r) }, { when: { attackerTrait: 'fast' } }), mod('damageDone', { mul: pct(1 + 0.09 * r) }, { when: { targetTrait: 'fast' } })] }))),
  N('margin', 3, 'full_sentence', 'Full Sentence', 1, 'scribe_margin_indent', 'Foes that are rooted, stunned or held take 20% more from you.',
    [{ mods: [dmgUp(0.2, { when: { targetHeld: true } })] }], { fork: 'a' }),
  N('margin', 3, 'long_hold', 'Long Hold', 1, 'scribe_margin_tight_bracket', 'Bracket and Full Stop last 40% longer, and Bracket holds an elite for 3 s.',
    [{ modAbility: [abl('scribe_bracket', 'effects.#hold.aura.duration', { mul: 1.4 }), abl('scribe_full_stop', 'effects.#root.aura.duration', { mul: 1.4 }),
      abl('scribe_bracket', 'effects.#hold.aura.eliteImmune', { set: false }), abl('scribe_bracket', 'effects.#hold.aura.eliteDuration', { set: 3 })] }], { fork: 'b' }),
  N('margin', 4, 'comma', 'Comma', 5, 'scribe_margin_comma', 'Full Stop cooldown -{r*1} s.', ranks(5, (r) => ({ modAbility: [abl('scribe_full_stop', 'cooldown', { add: -r })] }))),
  N('margin', 5, 'parenthesis', 'Parenthesis', 1, 'scribe_margin_parenthetical', 'Bracket holds two foes, and you heal 2% of your max health a second while one is held. Bracket casts 1 s slower.',
    [{ modAbility: [abl('scribe_bracket', 'effects.#hold.aura.limitPerCaster', { set: 2 }), abl('scribe_bracket', 'castTime', { add: 1 }),
      abl('scribe_bracket', 'effects.#hold.aura.tick', { push: { type: 'heal', to: 'caster', pctMaxHp: 0.02, canCrit: false, noThreat: true, ability: 'b2_parenthesis' } })] }], { keystone: true }),

  // ---- Erasure (S3: through armor)
  N('erasure', 1, 'etch', 'Etch', 5, 'scribe_wet_ink_seeping', 'Your spells cut the target\'s armor {r*3}% for 8 s (for everyone).',
    ranks(5, (r) => ({ procs: [{ on: 'hit', school: 'spell', effects: [{ type: 'aura', to: 'target', aura: { id: 'b2_etched', name: 'Etched', icon: 'icon_scroll', kind: 'debuff', duration: 8, mods: [{ stat: 'armorMul', mul: pct(1 - 0.03 * r) }] } }] }] }))),
  N('erasure', 2, 'strike_through', 'Strike Through', 5, 'scribe_wet_ink_ink_to_paper', 'Damage +{r*2}% on armored and on tough foes.',
    ranks(5, (r) => ({ mods: [dmgUp(0.02 * r, { when: { targetTrait: 'armored' } }), dmgUp(0.02 * r, { when: { targetTrait: 'tough' } })] }))),
  N('erasure', 3, 'ink_lash', 'Ink Lash', 1, 'scribe_quill_clean_copy', 'New skill, Ink Lash: an instant quill strike at 5 tiles that gives back 4% of your mana.',
    [{ grant: 'scribe_ink_lash' }], { fork: 'a' }),
  N('erasure', 3, 'pure_ink', 'Pure Ink', 1, 'scribe_wet_ink_wet_signature', 'Spell damage +8%.', [{ mods: [dmgUp(0.08, { school: 'spell' })] }], { fork: 'b' }),
  N('erasure', 4, 'blotted_out', 'Blotted Out', 5, 'scribe_wet_ink_pooling_ink', 'An Underlined foe takes {r*2}% more damage from everyone.',
    ranks(5, (r) => ({ modAbility: [abl('scribe_underline', 'effects.#dot.aura.mods', { push: { stat: 'damageTaken', mul: pct(1 + 0.02 * r) } })] }))),
  N('erasure', 5, 'redacted', 'Redacted', 1, 'scribe_wet_ink_overwrite', 'Your spells strip a foe\'s plating and a tough foe\'s extra damage for 6 s, for everyone. Your spell damage -8%.',
    [{ mods: [dmgUp(-0.08, { school: 'spell' })], procs: [{ on: 'hit', school: 'spell', effects: [{ type: 'aura', to: 'target', aura: { id: 'b2_redacted', name: 'Redacted', icon: 'icon_scroll', kind: 'debuff', duration: 6 } }] }] }], { keystone: true }),

  // ---- Bindings (W1: fragile)
  N('bindings', 1, 'bound_vellum', 'Bound Vellum', 5, 'scribe_margin_blotting_paper', 'Max health +{r*3}%.', ranks(5, (r) => ({ mods: [mod('maxHp', { mul: pct(1 + 0.03 * r) })] }))),
  N('bindings', 2, 'vellum_ward', 'Vellum Ward', 5, 'scribe_margin_blank_margin', 'New skill, Vellum Ward: a self shield (20 s cooldown). It absorbs {r*8}% more after the first rank.',
    ranks(5, (r) => ({ grant: 'scribe_vellum_ward', mods: r > 1 ? [mod('absorbDone', { mul: pct(1 + 0.08 * (r - 1)) }, { ability: 'scribe_vellum_ward' })] : [] }))),
  N('bindings', 3, 'glossed_pages', 'Glossed Pages', 1, 'scribe_margin_steady_line', 'Spell damage taken -15%.', [{ mods: [mod('damageTaken', { mul: 0.85 }, { school: 'spell' })] }], { fork: 'a' }),
  N('bindings', 3, 'leather_binding', 'Leather Binding', 1, 'scribe_margin_reread', 'Armor +60%.', [{ mods: [mod('armor', { mul: 1.6 })] }], { fork: 'b' }),
  N('bindings', 4, 'footnote', 'Footnote', 5, 'scribe_quill_footnote', 'Under 40% health, Full Stop is ready at once. Once per 30 s, {r*3} s less a rank.',
    ranks(5, (r) => ({ procs: [{ on: 'damageTaken', icd: 30 - 3 * r, when: { selfHpBelow: 0.4 }, effects: [{ type: 'cooldown', to: 'self', ability: 'scribe_full_stop', reset: true }] }] }))),
  N('bindings', 5, 'living_manuscript', 'Living Manuscript', 1, 'scribe_margin_semicolon', 'Half of the damage you take comes out of your mana instead (2 mana per health). Mana regen -20%.',
    [{ mods: [mod('manaShield', { add: 0.5 }), mod('manaRegen', { mul: 0.8 })] }], { keystone: true }),

  // ---- Shorthand (W2: must stand to cast)
  N('shorthand', 1, 'quick_hand', 'Quick Hand', 5, 'scribe_quill_fast_hand', 'Cast times -{r*2}%.', ranks(5, (r) => ({ mods: [mod('castTime', { mul: pct(1 - 0.02 * r) })] }))),
  N('shorthand', 2, 'light_feet', 'Light Feet', 5, 'scribe_quill_run_on_sentence', 'Move speed +{r*2}%.', ranks(5, (r) => ({ mods: [mod('speed', { mul: pct(1 + 0.02 * r) })] }))),
  N('shorthand', 3, 'running_hand', 'Running Hand', 1, 'scribe_quill_bold_type', 'Cast while you walk, at half speed. Cast times +15%.',
    [{ mods: [mod('castMove', { add: 0.5 }), mod('castTime', { mul: 1.15 })] }], { fork: 'a' }),
  N('shorthand', 3, 'brevity', 'Brevity', 1, 'scribe_quill_exclamation', 'Inkbolt casts 25% faster. You still stand to cast.',
    [{ mods: [mod('castTime', { mul: 0.75 }, { ability: 'scribe_inkbolt' })] }], { fork: 'b' }),
  N('shorthand', 4, 'hasty_note', 'Hasty Note', 5, 'scribe_wet_ink_drying_slow', 'After 2 s of walking, your next spell is instant. Once per 12 s, {r*1} s less a rank.',
    ranks(5, (r) => ({ mods: [mod('hastyNote', { add: r })] }))),
  N('shorthand', 5, 'shorthand_master', 'Shorthand Master', 1, 'scribe_wet_ink_splash', 'Every spell under 2 s to cast is instant, for 25% less damage.',
    [{ script: 'b2_shorthand_master' }], { keystone: true }),

  // ---- Inkwell (W3: mana-hungry)
  N('inkwell', 1, 'deep_ink', 'Deep Ink', 5, 'scribe_wet_ink_inkwell', 'Max mana +{r*3}%.', ranks(5, (r) => ({ mods: [mod('manaMax', { mul: pct(1 + 0.03 * r) })] }))),
  N('inkwell', 2, 'reclaim', 'Reclaim', 5, 'scribe_wet_ink_smudge', 'A spell crit gives back {r*4}% of its cost.',
    ranks(5, (r) => ({ procs: [{ on: 'crit', school: 'spell', effects: [{ type: 'resource', to: 'self', kind: 'mana', pctOfCost: pct(0.04 * r) }] }] }))),
  N('inkwell', 3, 'blood_ink', 'Blood Ink', 1, 'scribe_margin_wide_margin', 'Out of mana, your spells cost health instead, 1 for 1.', [{ script: 'b2_blood_ink' }], { fork: 'a' }),
  N('inkwell', 3, 'steady_well', 'Steady Well', 1, 'scribe_quill_sharp_nib', 'Mana regen +25%. Spell damage -5%.',
    [{ mods: [mod('manaRegen', { mul: 1.25 }), dmgUp(-0.05, { school: 'spell' })] }], { fork: 'b' }),
  N('inkwell', 4, 'spill_over', 'Spill-over', 5, 'scribe_wet_ink_pooling_ink', 'A kill gives back {r*1}% of your max mana.',
    ranks(5, (r) => ({ procs: [{ on: 'kill', effects: [{ type: 'resource', to: 'self', kind: 'mana', pctOfMax: pct(0.01 * r) }] }] }))),
  N('inkwell', 5, 'bottomless_well', 'Bottomless Well', 1, 'scribe_wet_ink_ink_to_paper', 'You have no mana: spells cost 0.6 health per mana, and every spell heals you for 8% of its damage.',
    [{ script: 'b2_bottomless', mods: [mod('leech', { add: 0.08 }, { school: 'spell' })] }], { keystone: true }),
];

export const SCRIBE_SIGNATURES = [
  { id: 'scribe_ellipsis', name: 'Ellipsis', icon: 'icon_swap', ready: true, text: 'Blink up to 8 tiles; three ink dots root the first foe that follows. 2 charges.' },
  { id: 'scribe_living_words', name: 'Living Words', icon: 'icon_letter', ready: true, text: 'Write Ink Hounds into being (up to 2): they bite and hold the foe\'s eye.' },
  { id: 'scribe_rewrite', name: 'Rewrite', icon: 'icon_charm', ready: true, text: 'A foe fights for you for 12 s, then takes 20% of its health as ink.' },
];

export const SCRIBE_BUILDS = [
  { id: 'ellipsis_duelist', name: 'Ellipsis Duelist', line: 'Blink, burst, blink: a glass cannon who is never where the wolf lands.', tracks: ['quill', 'shorthand', 'margin'], answers: { fast: 3 },
    forks: ['capital_letter', 'brevity'], keystone: 'final_draft', signature: 'scribe_ellipsis', signatures: ['scribe_ellipsis', 'scribe_rewrite', 'scribe_living_words'],
    // tuned 2026-11-19 (qa/sim/builds2.mjs spread): level 1 pick Underline, not Full Stop (BUILDS_2_PLAY 1.4); Quill's own
    // tier 4 (Underscore) needs Underline, and Full Stop stays at the trainer
    picks: { 1: 'scribe_underline', 3: 'scribe_bracket', 6: 'scribe_inkwell_pause', 14: 'scribe_exclamation' },
    path: [...rep(P('margin', 'long_pause'), 2), ...rep(P('margin', 'fine_print'), 2), ...rep(P('quill', 'heavy_nib'), 3), ...rep(P('quill', 'sharp_hand'), 2), P('quill', 'capital_letter'),
      ...rep(P('shorthand', 'quick_hand'), 2), ...rep(P('quill', 'heavy_nib'), 2), P('quill', 'final_draft')] },
  { id: 'author_of_beasts', name: 'Author of Beasts', line: 'Two hounds hold the foes while the Scribe Brackets a third. The safest Scribe.', tracks: ['bindings', 'inkwell', 'margin'],
    forks: ['leather_binding', 'steady_well', 'long_hold'], keystone: 'living_manuscript', signature: 'scribe_living_words', signatures: ['scribe_living_words', 'scribe_ellipsis', 'scribe_rewrite'],
    picks: { 1: 'scribe_underline', 3: 'scribe_bracket', 6: 'scribe_inkwell_pause', 14: 'scribe_paragraph' },
    path: [...rep(P('bindings', 'bound_vellum'), 3), ...rep(P('bindings', 'vellum_ward'), 2), P('bindings', 'leather_binding'), ...rep(P('bindings', 'footnote'), 2), ...rep(P('inkwell', 'deep_ink'), 2),
      ...rep(P('inkwell', 'reclaim'), 2), P('inkwell', 'steady_well'), P('margin', 'long_pause'), P('bindings', 'living_manuscript')] },
  { id: 'wordstorm', name: 'Wordstorm', line: 'Turn one foe on its friends, splash the clump, burn health for more.', tracks: ['quill', 'erasure', 'inkwell'],
    forks: ['splatter', 'pure_ink', 'blood_ink'], keystone: 'final_draft', signature: 'scribe_rewrite', signatures: ['scribe_rewrite', 'scribe_ellipsis', 'scribe_living_words'],
    picks: { 1: 'scribe_underline', 3: 'scribe_scatter_letters', 6: 'scribe_erase', 14: 'scribe_exclamation' },
    path: [...rep(P('erasure', 'etch'), 2), ...rep(P('erasure', 'strike_through'), 2), ...rep(P('quill', 'heavy_nib'), 4), ...rep(P('quill', 'sharp_hand'), 3), P('quill', 'splatter'),
      P('quill', 'final_draft'), P('erasure', 'pure_ink'), P('inkwell', 'deep_ink')] },
];

export const SCRIBE = {
  tracks: SCRIBE_TRACKS,
  nodes: Object.fromEntries(SCRIBE_NODES.map((n) => [n.id, n])),
  signatures: SCRIBE_SIGNATURES,
  // BUILDS_2_PLAY 1.3 retag: the signature pick is the damage vs summons lever
  signatureAxis: 'Words that fight vs Words that strike',
  builds: SCRIBE_BUILDS,
  defaultBuild: 'ellipsis_duelist',
  baseline: null,
};
export { SPELLS as SCRIBE_SPELLS };

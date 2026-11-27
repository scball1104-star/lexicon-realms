// Level 30 skill pick (BUILDS_2 3.2, written now that cap 30 is live). Same shape as the level 14 and 25 picks: two
// ready options on a clear axis, and one side may be a passive. Plain data, joined in src/data/builds2.js:
//   PICKS_30        the level 30 skill pick for every class
//   L30_ABILITIES   the ten level 30 skills
//   PICK_30_OF      the suggested level 30 pick per named build
// Buy-back of the other side is 400 gold (the same DRAFT price as level 25; the cap 30 brief: stay at 400 unless
// playtest says otherwise). Numbers are first-pass design numbers, gated by qa/sim/builds2.mjs.
import { pct, lv, mod, abl, dmgUp } from './builds2_kit.js';

export const PICK_30_LEVEL = 30;

export const PICKS_30 = {
  warden: { level: 30, options: ['warden_gate_oath', 'warden_breaker_iron'], axis: 'Gate vs Breaker', ready: true },
  mender: { level: 30, options: ['mender_biting_word', 'mender_well_of_names'], axis: 'Bite vs Well', ready: true },
  scribe: { level: 30, options: ['scribe_kennel_law', 'scribe_heavy_quill'], axis: 'Hounds vs Hand', ready: true },
  wayfinder: { level: 30, options: ['wayfinder_shared_hunt', 'wayfinder_drawn_cord'], axis: 'Kestrel vs Bow', ready: true },
  inkblade: { level: 30, options: ['inkblade_second_shade', 'inkblade_deep_wound'], axis: 'Shade vs Wound', ready: true },
};

const PASSIVE = (id, name, icon, cls, school, passive, text) => ({
  id, name, icon, cls, learnLevel: 30, school, cost: null, castTime: 0, cooldown: 0, gcd: false, range: null, target: 'none', threatMult: 0,
  effects: [], passive, text,
});

const SHOTS = ['wayfinder_quick_shot', 'wayfinder_aimed_shot', 'wayfinder_pinning_shot', 'wayfinder_hush_arrow', 'wayfinder_scatter_shot'];

export const L30_ABILITIES = {
  // ---- Mender: Bite vs Well
  // Biting Word turns a direct heal into light on her current foe (Mend, Chorus, Purify only, so Brand and the spirit
  // do not also convert). Well of Names is a planted pool she and her friends stand in.
  mender_biting_word: PASSIVE('mender_biting_word', 'Biting Word', 'mend', 'mender', 'light', {
    procs: [{ on: 'heal', ability: ['mender_mend', 'mender_chorus', 'mender_purify'], effects: [
      { type: 'damage', to: 'my_target', radius: 128, pctOfHeal: 0.2, school: 'light', canCrit: false, ability: 'mender_biting_word' },
    ] }],
  }, 'Passive. When you land a direct heal with Mend, Chorus or Purify, 20% of that heal also strikes your current foe as light.'),
  mender_well_of_names: {
    id: 'mender_well_of_names', name: 'Well of Names', icon: 'icon_regen', cls: 'mender', learnLevel: 30, school: 'light',
    cost: { kind: 'mana', amount: lv(16, 2) }, castTime: 0, cooldown: 45, gcd: true, range: null, target: 'none', threatMult: 0.5,
    effects: [{ type: 'summon', key: 'well', object: { id: 'mender_well_of_names', name: 'Well of Names', sprite: 'zone_peal', at: 'self', armTime: 0, duration: 8, period: 2, max: 1, radius: 80, maxTargets: 5,
      pulse: [], pulseAllies: [{ type: 'heal', amount: lv(8, 3), coef: { stat: 'sp', k: 0.3 }, canCrit: true }] } }],
    text: 'Leave a well of light at your feet for 8 s. Every 2 s it heals you and friends within 5 tiles for {heal}.',
  },

  // ---- Warden: Gate vs Breaker
  warden_gate_oath: {
    id: 'warden_gate_oath', name: 'Gate Oath', icon: 'icon_shield', cls: 'warden', learnLevel: 30, school: 'physical',
    cost: { kind: 'resolve', amount: 20 }, castTime: 0, cooldown: 45, gcd: true, range: null, target: 'none', threatMult: 2,
    area: { shape: 'circle', radius: 96, at: 'self', maxTargets: 8 },
    effects: [
      { type: 'aura', key: 'oath', to: 'self', aura: { id: 'warden_gate_oath', name: 'Gate Oath', icon: 'icon_shield', kind: 'buff', duration: 8,
        mods: [{ stat: 'damageTaken', mul: 0.88 }] } },
      { type: 'threat', key: 'hold', to: 'enemies', taunt: true, duration: 3 },
    ],
    text: 'You take 12% less damage for 8 s, and every foe within 6 tiles must attack you for 3 s.',
  },
  warden_breaker_iron: PASSIVE('warden_breaker_iron', 'Breaker Iron', 'icon16_sword', 'warden', 'physical', {
    script: 'b2_breaker_iron',
    mods: [
      // 0.75 baseline lone cut * 1.40 = 1.05, so a lone Strike beats a packed Strike (~188 vs 179)
      dmgUp(0.40, { ability: 'warden_strike', when: { targetAlone: 48 } }),
      // 4/3 cancels the 0.75 lone cut: Anvil Drop hits a lone foe as if packed
      dmgUp(1 / 3, { ability: 'warden_anvil_drop', when: { targetAlone: 48 } }),
    ],
    procs: [
      { on: 'hit', ability: 'warden_strike', when: { targetAlone: 48 }, effects: [
        { type: 'aura', to: 'target', aura: { id: 'warden_breaker_sunder', name: 'Sundered', icon: 'icon_sunder', kind: 'debuff', duration: 8, unique: 'per_caster',
          mods: [{ stat: 'armorMul', add: -0.15 }] } },
      ] },
    ],
  }, 'Passive. Strike deals 40% more to a foe with no other foe within 3 tiles, enough to beat a packed Strike, and Sunders that foe (15% less armor for 8 s). After a lone Strike you heave: you recover 0.3 s slower and your next swings come 0.8 s later. Anvil Drop hits a lone foe as if packed.'),

  // ---- Scribe: Hounds vs Hand
  scribe_kennel_law: PASSIVE('scribe_kennel_law', 'Kennel Law', 'icon_letter', 'scribe', 'ink', {
    mods: [dmgUp(0.05, { ability: 'scribe_inkbolt' })],
    modAbility: [
      abl('scribe_living_words', 'effects.#hound.object.pet.effects.0.amount', { mul: 1.18 }),
      abl('scribe_living_words', 'effects.#hound.object.pet.effects.0.coef.k', { mul: 1.18 }),
      abl('scribe_living_words', 'effects.#hound.object.hpPct', { mul: 1.15 }),
    ],
  }, 'Passive. Your Ink Hounds deal 18% more and have 15% more health. Inkbolt deals 5% more.'),
  scribe_heavy_quill: PASSIVE('scribe_heavy_quill', 'Heavy Quill', 'icon_quill', 'scribe', 'ink', {
    mods: [
      dmgUp(0.08, { ability: ['scribe_inkbolt', 'scribe_scrawl'] }),
      dmgUp(0.15, { ability: 'scribe_inkbolt', when: { targetHeld: true } }),
    ],
  }, 'Passive. Inkbolt and Scrawl deal 8% more. Inkbolt deals 15% more again if the foe is rooted, stunned or held.'),

  // ---- Wayfinder: Kestrel vs Bow
  wayfinder_shared_hunt: PASSIVE('wayfinder_shared_hunt', 'Shared Hunt', 'icon_feather', 'wayfinder', 'physical', {
    script: 'b2_shared_hunt',
    procs: [{ on: 'hit', ability: SHOTS, effects: [{ type: 'script', name: 'b2_shared_hunt' }] }],
  }, 'Passive. While your Sand Kestrel is out, your shots mark the foe. The kestrel flies to your mark, and your next shot on that foe ricochets to another foe within 3 tiles for 50% of the hit.'),
  wayfinder_drawn_cord: PASSIVE('wayfinder_drawn_cord', 'Drawn Cord', 'aimed_shot', 'wayfinder', 'physical', {
    mods: [dmgUp(0.1, { ability: 'wayfinder_aimed_shot' })],
    modAbility: [abl('wayfinder_aimed_shot', 'castTime', { add: -0.2 })],
  }, 'Passive. Aimed Shot deals 10% more and its stand-still is 0.2 s shorter.'),

  // ---- Inkblade: Shade vs Wound
  inkblade_second_shade: PASSIVE('inkblade_second_shade', 'Second Shade', 'fade', 'inkblade', 'shadow', {
    mods: [mod('openerBonus', { add: 0.15 })],
    modAbility: [abl('inkblade_fade', 'cooldown', { add: -4 })],
  }, 'Passive. Your first attack from Fade or stealth deals 15% more. Fade\'s cooldown is 2 s, down from 6 s.'),
  inkblade_deep_wound: PASSIVE('inkblade_deep_wound', 'Deep Wound', 'bleed_line', 'inkblade', 'physical', {
    script: 'b2_deep_wound',
  }, 'Passive. Spill on a foe bleeding from your Bleed Line consumes the line and deals its remaining ticks at once.'),
};

// The suggested level 30 pick per named build (the side that matches the build's play).
export const PICK_30_OF = {
  shieldwheel: 'warden_gate_oath', forge_reaver: 'warden_breaker_iron', spellbreaker: 'warden_breaker_iron',
  tidehammer: 'mender_biting_word', lamplighter: 'mender_well_of_names', battle_mender: 'mender_well_of_names',
  ellipsis_duelist: 'scribe_heavy_quill', author_of_beasts: 'scribe_kennel_law', wordstorm: 'scribe_heavy_quill',
  // Grapple Skirmisher never stands still for Aimed Shot, so Shared Hunt (the kestrel mark and ricochet, which works on the move) is its side
  falconer: 'wayfinder_shared_hunt', stormcaller: 'wayfinder_drawn_cord', grapple_skirmisher: 'wayfinder_shared_hunt',
  night_letter: 'inkblade_second_shade', fan_dancer: 'inkblade_deep_wound', venom_knife: 'inkblade_deep_wound',
};

/** Join the level 30 pick onto the class data (called once by src/data/builds2.js, after joinCap30). */
export function joinL30(BUILDS2, SKILL_PICKS) {
  for (const [cls, p] of Object.entries(PICKS_30)) if (SKILL_PICKS[cls] && !SKILL_PICKS[cls].some((x) => x.level === p.level)) SKILL_PICKS[cls].push(p);
  for (const c of Object.values(BUILDS2)) for (const b of c.builds) {
    if (PICK_30_OF[b.id]) b.picks = { ...b.picks, 30: PICK_30_OF[b.id] };
  }
}
void pct;

// Inscriptions (BUILDS_2 6.4): margins on gear, letter glyphs socketed into them, and spelled words. Plain data; the
// rules are in src/sim/glyphs.js, the window in src/ui/glyph_ui.js. The 26 glyph items themselves are in storage.js
// (they live in the glyph pouch, one stack per letter).
//
// Margins. BUILDS_2 6.4: weapons up to 3, chest and legs up to 2, others up to 1, rarer gear rolls more. Two of the
// doc's own words do not fit those caps (OAK is 3 letters on a chest, GO is 2 on feet) and HUSH names "3 margins + a
// rare 4th", so this build reads "rarer gear rolls more" as: rare (yellow) gear and better may roll ONE margin past its
// slot's cap. A DRAFT reading, listed in the lane report for Scott.
//
// Every number here is a DRAFT for the Builds 2 balance pass (marked `draft: true`).
export const GLYPH_DRAFT = true;

/** Margin caps by item kind and slot, and the extra margin rare+ gear may roll. */
export const MARGINS = {
  cap: { weapon: 3, chest: 2, legs: 2, other: 1 },
  // the chance each margin up to the cap is there, by rarity (independent rolls, from a hash of the item: no rng used)
  chance: { common: 0.2, magic: 0.45, rare: 0.7, epic: 0.85, set: 0.85, legendary: 0.9 },
  // rare and better: the chance of one margin past the cap (only when every capped margin rolled)
  extra: { rare: 0.25, epic: 0.35, set: 0.35, legendary: 0.5 },
};

/** A lone letter's stat by where it sits (draft). Weapons: kind 'weapon' (main, two and off hands). Armor: the rest. */
export const LETTER_STATS = {
  draft: true,
  weapon: { consonant: [{ stat: 'damageDone', mul: 1.01 }, { stat: 'healingDone', mul: 1.01 }], vowel: [{ stat: 'damageDone', mul: 1.005 }, { stat: 'healingDone', mul: 1.005 }] },
  armor: { vowel: [{ stat: 'maxHp', mul: 1.01 }], consonant: [{ stat: 'maxHp', mul: 1.005 }] },
  text: {
    weapon: { consonant: 'damage and healing +1%', vowel: 'damage and healing +0.5%' },
    armor: { vowel: 'health +1%', consonant: 'health +0.5%' },
  },
};

/** Glyph drops: about 1 per 20 kills of a foe that is not grey to you; a vowel is half as likely as a consonant. */
export const GLYPH_DROP = { chance: 0.05, vowelWeight: 0.5, consonantWeight: 1 };

/** Taking a glyph out at a smith: gold = base + perLevel x the item's level (the letter goes back to the pouch). */
export const GLYPH_REMOVE = { base: 2, perLevel: 1, smiths: ['garrick', 'dunstan'] };

// The seven words (BUILDS_2 6.4). `fits(item)` names the gear it works in; `power` is the same record as a legendary
// power (src/data/legendary_powers.js: mods, procs) plus `immune` (aura immunities) and `moveCharges`.
const ASH_BURN = { id: 'word_ash_burn', name: 'Ash Burn', icon: 'icon_fire', kind: 'debuff', duration: 4, period: 1, fromDamage: 0.3,
  tick: [{ type: 'damage', fromData: true, school: 'fire', canCrit: false, noArmor: true, ability: 'word_ash' }] };
export const WORDS = {
  ASH: { word: 'ASH', fits: { kind: 'weapon', slots: ['main', 'two'] }, where: 'a weapon',
    text: 'ASH: 15% of your hits burn the foe for 30% of the hit over 4 s.',
    power: { id: 'word_ash', procs: [{ on: 'hit', direct: true, chance: 0.15, effects: [{ type: 'aura', to: 'target', aura: ASH_BURN }] }] } },
  VOW: { word: 'VOW', fits: { kind: 'weapon', slots: ['off'] }, where: 'a shield or off hand',
    text: 'VOW: each block, and each hit your shields absorb, heals you for 3% of your health.',
    power: { id: 'word_vow', procs: [
      { on: 'block', effects: [{ type: 'heal', to: 'self', pctMaxHp: 0.03, canCrit: false, noThreat: true, ability: 'word_vow' }] },
      { on: 'absorb', icdKey: 'absorb', icd: 0.5, effects: [{ type: 'heal', to: 'self', pctMaxHp: 0.03, canCrit: false, noThreat: true, ability: 'word_vow' }] }] } },
  SUN: { word: 'SUN', fits: { kind: 'weapon', types: ['rod', 'bow'] }, where: 'a rod or bow',
    text: 'SUN: your critical hits blind the foe for 1 s. At most once every 8 s.',
    power: { id: 'word_sun', procs: [{ on: 'crit', icd: 8, effects: [{ type: 'aura', to: 'target', aura: { id: 'word_sun_blind', name: 'Sunblind', icon: 'stun', kind: 'debuff', duration: 1, flags: ['stun'] } }] }] } },
  INK: { word: 'INK', fits: { kind: 'weapon', types: ['dagger', 'quill'] }, where: 'a dagger or quill',
    text: 'INK: one more mark (daggers), or Inkbolt +10% on foes you have Underlined (quills).',
    power: { id: 'word_ink', mods: [{ stat: 'comboMax', add: 1 },
      { stat: 'damageDone', mul: 1.1, ability: 'scribe_inkbolt', when: { targetAura: 'scribe_underline', fromSelf: true } }] } },
  OAK: { word: 'OAK', fits: { kind: 'armor', slots: ['chest'] }, where: 'a chest',
    text: 'OAK: armor +15%, and you cannot be knocked back.',
    power: { id: 'word_oak', mods: [{ stat: 'armor', mul: 1.15 }], immune: ['knockback'] } },
  GO: { word: 'GO', fits: { kind: 'armor', slots: ['feet'] }, where: 'feet',
    text: 'GO: move speed +8%, and your movement skill has one more charge.',
    power: { id: 'word_go', mods: [{ stat: 'speed', add: 0.08 }], moveCharges: 1 } },
  HUSH: { word: 'HUSH', fits: { kind: 'weapon', slots: ['main', 'two'] }, where: 'a weapon (four margins)',
    text: 'HUSH: your interrupts lock the foe out 1 s longer.',
    power: { id: 'word_hush', mods: [{ stat: 'interruptLock', add: 1 }] } },
};

export const GLYPHS = { draft: GLYPH_DRAFT, margins: MARGINS, letters: LETTER_STATS, drop: GLYPH_DROP, remove: GLYPH_REMOVE, words: WORDS, vowels: 'AEIOU' };

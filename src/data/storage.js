// Storage: the Lantern Chest and the glyph pouch (design brief D:\LQOnline\storage_stills\BRIEF.md, approved by Scott
// 2026-11-20 with every open question at its recommended default). Plain data, no imports.
//
// STORAGE: the two chest tabs. `hero` belongs to one hero (saved in that hero's state); `shared` is every hero on this
// device (saved under its own key, lexicon_realms.shared, never inside a hero save). Each tab starts with `start`
// slots and buys rows of `rowSize`, one at a time, at `rowPrices[rowsBought]` gold (the hero who clicks Buy pays, the
// row belongs to the tab), up to `max`. Prices are Inference from PROGRESSION 6 (about 3,300 gold earned by level 15).
//
// LANTERN_CHESTS: where a chest stands (zone, tile). One at each inn: today only Willowmere has an inn (Hob's Lantern
// Inn). Every chest reaches the same storage, so a new one is one line here. A chest is an object entity (`chest`),
// opened like talking to an NPC (Talk, F, a tap or a right-click), out of combat only.
//
// SORT_KINDS: the Sort button's order (by kind, then rarity, then name).

export const STORAGE = Object.freeze({
  hero: Object.freeze({ start: 30, rowSize: 10, rowPrices: Object.freeze([100, 300, 800]), max: 60 }),
  shared: Object.freeze({ start: 30, rowSize: 10, rowPrices: Object.freeze([300, 900, 2000]), max: 60 }),
  sortKinds: Object.freeze(['weapon', 'armor', 'bag', 'consumable', 'junk', 'quest']),
  sortRarity: Object.freeze(['set', 'legendary', 'rare', 'magic', 'common']),
});

export const LANTERN_CHESTS = Object.freeze([
  Object.freeze({ id: 'willowmere_inn', zone: 'willowmere', x: 30, y: 13, name: 'Lantern Chest', place: 'Willowmere Inn' }),
]);

// Glyphs (BUILDS_2 6.4): letter stones. They take no bag slot: they go to the glyph pouch (one stack per letter, A to Z,
// no limit), like quest items go to the quest bag. Margins, socketing, spelled words, the draft stat numbers and the
// drops are in src/data/glyphs.js and src/sim/glyphs.js (Inscriptions).
export const VOWELS = 'AEIOU';
export const GLYPH_WORDS = Object.freeze({ ASH: 'weapon', VOW: 'shield or off hand', SUN: 'rod or bow', INK: 'dagger or quill', OAK: 'chest', GO: 'feet', HUSH: 'weapon' });
/** The item records for the 26 glyphs (items.js adds them to ITEMS). */
export function glyphItems() {
  const out = [];
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const vowel = VOWELS.includes(L);
    const words = Object.keys(GLYPH_WORDS).filter((w) => w.includes(L));
    out.push({
      id: `glyph_${L.toLowerCase()}`, name: `Glyph of ${L}`, letter: L, vowel, rarity: 'common', kind: 'glyph', slot: null, stack: 9999, value: 0,
      level: 1, reqLevel: 1,
      rule: vowel ? ['Vowel: +health in armor', 'In a weapon: a little damage'] : ['Consonant: +damage in a weapon', 'In armor: a little health'],
      words,
      text: `A letter stone. Socket it into a margin on gear. Letters in order spell a word${words.length ? `: ${words.join(', ')}` : ''}.`,
    });
  }
  return out;
}

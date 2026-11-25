// Word doors (wave 8, glyphdoor; PLAN section 6 "Words that open doors"). Plain data; the rules are in
// src/sim/worddoor.js, the panel in src/ui/worddoor_ui.js, the door in 3D in src/render3d/worddoor3d.js and in 2D in
// src/render/worddoor2d.js. Where a door stands (its cells, the slab's face, the found-letter spots and the coffer) is map
// data: zone.dungeon.wordDoors, written by the place's tools/maps/zone_<id>.mjs.
//
// A word door is a sealed slab in a dungeon wall. The party spells its word from letters they carry: letters found in
// the copy (each found letter is carried by the hero who picked it up) or glyphs from their own pouches (LENT: they go
// back to their owners on a wrong word, when the door opens, when taken back, or when the hero leaves the copy).
//
// ------------------------------------------------------------------------------------------------------------------
// SCOTT: EVERY WORD, CLUE AND LINE BELOW IS A DRAFT (glyphdoor lane). Replace them with your own; nothing else needs to
// change. One entry is picked for each dungeon copy (the word changes every copy), from a hash of the copy, never the
// world's random stream. Add or remove entries freely. Format of one entry:
//   { word: 4 to 6 capital letters A to Z,
//     clue: [first line (always shown), second line (shown after the first wrong word)],   each at most 60 characters
//     opened: one line said when the door opens (at most 80 characters),
//     draft: true while the words are not yet Scott's (the panel shows a small "draft" tag; delete the line to drop it) }
// The door's name, its look line and the coffer's name are drafts too. qa/tests/worddoor.test.mjs checks the format.
// ------------------------------------------------------------------------------------------------------------------
export const WORD_DOOR_DRAFT = true;

export const WORD_DOOR_RULES = {
  reachPx: 80,               // a hero must stand this close to the slab to set or take a letter (5 tiles of 16 px)
  wrongCooldownSec: 4,       // after a wrong word the slab is quiet this long (no letters set): no rapid guessing
  showFirstAfter: 2,         // after this many wrong words the slab lights the word's first letter in its cut
  showNextEvery: 2,          // and one more letter in order every 2 wrong words after that (never the whole word)
  // the reward, once per hero per copy like the copy's cache: one piece rolled by the existing rollGear at the place's
  // cache item level and the place's daily rarity, plus the cache's gold range (src/data/dungeons.js). Nothing new.
};

export const WORD_DOORS = {
  barrow_thirteenth: {
    place: 'barrow', name: 'The Thirteenth Line',                                                    // DRAFT
    look: 'A slab of grey stone under the lintel, with a row of empty letter cuts and nothing else.',   // DRAFT
    words: [
      { word: 'NAME', draft: true,
        clue: ['Given to you, used by others,', 'and cut in stone when you are gone.'],
        opened: 'The slab reads the name it was missing and sinks into the floor.' },
      { word: 'TALLY', draft: true,
        clue: ['A notch for every one of them,', 'and the Tally-Wife never stops counting.'],
        opened: 'The count comes out right at last. The slab sinks into the floor.' },
      { word: 'FLOCK', draft: true,
        clue: ['The Bellwether leads it. The Reeve counts it.', 'One of it is always missing.'],
        opened: 'Somewhere below, a bell rings once. The slab sinks into the floor.' },
    ],
  },
};

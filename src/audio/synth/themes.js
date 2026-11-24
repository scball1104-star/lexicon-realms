// Lexicon Realms synth: realm themes as data. A theme is a seed plus a key, modes and a tempo; the notes come from
// motif.js. Only Willowmere is set up in this prototype; the other realms would be one line each.
import { seedFromText } from './rng.js';

export const THEMES = {
  willowmere: {
    name: 'Willowmere',
    seed: seedFromText('Willowmere'),
    tonic: 62,                 // D
    dayMode: 'ionian',
    nightMode: 'dorian',       // the same tune, same notes by degree, a softer minor colour at night
    eighth: 60 / (56 * 3),     // 6/8, a dotted quarter at 56 a minute
    nightTempo: 0.8,           // night plays slower when it starts fresh at night
    beats: 6,
  },
};

/** A theme for any text (a realm name, or the glyphs a party carries): the "music made from your letters" hook. */
export function themeFromText(text, base = THEMES.willowmere) {
  return { ...base, name: String(text), seed: seedFromText(text) };
}

// Lexicon Realms synth: music made from your letters (wave 9 music lane; Scott approved the brief 2026-11-25,
// D:\LQOnline\wave9\music\BRIEF.md). Pure: no WebAudio, no DOM (qa/tests/letters_music.test.mjs).
//
// A realm's theme is the same seeded tune as today (motif.js). The letters the party has found decide how much of it
// plays: every note of the tune is owned by one letter (a seeded deal of A to Z over the notes, so each letter owns one
// or two), and a note sounds only once its letter is found. With all 26 the loop is today's theme, note for note.
// Until then, the letters found so far ring as a soft bell line in the quiet bars: two parties with the same count but
// different letters hear different gaps and a different bell line.
//
//   maskOf(['A', 'S', 'H'])         -> 26-bit mask (bit 0 = A)
//   countOf(mask)                   -> how many letters
//   lettersOf(mask)                 -> ['A', 'H', 'S']
//   (which letters a hero and a party have found is the sim's: src/sim/letters_seen.js, sent in the HUD view)
//   letterGate(theme, mask)         -> { n, full, owns(bar, i), sounds(bar, i), layer(name), line(barIndex, root) }
//   STAGES                          the count at which each layer of the explore band comes in (DRAFT numbers)
import { makeRng, seedFromText } from './rng.js';
import { makeTheme, chordTones } from './motif.js';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const ALL = (1 << 26) - 1;
const VOWELS = 'AEIOU';

// DRAFT: the pad and bass are always there (the realm is never silent); the harp comes in at 8 letters, the drums at 16
export const STAGES = { pad: 0, bass: 0, harp: 8, perc: 16 };

export function maskOf(letters) {
  let m = 0;
  for (const L of letters || []) { const s = String(L == null ? '' : L).toUpperCase(); const i = s.length === 1 ? LETTERS.indexOf(s) : -1; if (i >= 0) m |= 1 << i; }
  return m >>> 0;
}
export function countOf(mask) { let n = 0, m = mask >>> 0; while (m) { n += m & 1; m >>>= 1; } return n; }
export function lettersOf(mask) { const out = []; for (let i = 0; i < 26; i++) if (mask & (1 << i)) out.push(LETTERS[i]); return out; }

/** The seeded deal: which letter owns each note of the tune, bar by bar (same seed, same deal, on every machine). */
export function dealLetters(theme) {
  const th = makeTheme({ seed: theme.seed, beats: theme.beats, mode: theme.dayMode });
  const r = makeRng((theme.seed ^ seedFromText('letters')) >>> 0);
  const order = LETTERS.split('');
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let k = 0;
  return th.melody.map((bar) => bar.map(() => order[k++ % 26]));
}

export function letterGate(theme, mask) {
  const m = (mask >>> 0) & ALL;
  const n = countOf(m);
  const full = n >= 26;
  const deal = dealLetters(theme);
  const found = lettersOf(m);
  const has = (L) => !!(m & (1 << LETTERS.indexOf(L)));
  return {
    n, full, deal, found,
    owns: (bar, i) => (deal[bar] && deal[bar][i]) || null,
    sounds: (bar, i) => full || has((deal[bar] && deal[bar][i]) || 'A'),
    layer: (name) => full || n >= (STAGES[name] || 0),
    /**
     * The bell line for one quiet bar (count < 26 only): two of the found letters, taken in A to Z order, walking on
     * each bar; the letter picks the chord tone, a vowel rings for a dotted quarter, a consonant is short.
     * Returns [{ step, len, deg }] in eighths and scale degrees, or [] when there is nothing to ring.
     */
    line(barIndex, root) {
      if (full || !found.length) return [];
      const ct = chordTones(root);
      const out = [];
      for (const [slot, step] of [[0, 0], [1, 3]]) {
        if (found.length === 1 && slot === 1) break;
        const L = found[(barIndex * 2 + slot) % found.length];
        const li = LETTERS.indexOf(L);
        out.push({ step, len: VOWELS.includes(L) ? 3 : 1.5, deg: ct[li % 3] + 7 * ((li >> 2) % 2), letter: L });
      }
      return out;
    },
  };
}

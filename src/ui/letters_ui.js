// Music made from your letters (wave 9 music lane): a toast when a new glyph letter joins the song, and once per session
// a log line saying what the letters do. Off with Settings, Synth sound Off (no song, so nothing to tell).
// All player-facing words here are DRAFTS for Scott.
//
//   const notes = createLetterNotes();
//   notes.frame(hud, heroId, ui, { synthOn })   once per drawn frame; hud = snap.hud[heroId] (hud.letters: { seen, song })
import { countOf, lettersOf } from '../audio/synth/letters.js';

export const LETTER_WORDS = {
  // DRAFT
  toast: (letters, n) => `A new letter for the song: ${letters}. ${n} of 26.`,
  whole: 'Every letter found. The songs are whole.',
  log: 'Each letter you find adds notes to the music of the Nameless Hollow, the dungeons, the caves and the roads.',
};

export function createLetterNotes() {
  let hero = null, last = null, told = false;
  return {
    frame(hud, heroId, ui, { synthOn = true } = {}) {
      const L = hud && hud.letters;
      if (!L || !Number.isFinite(L.seen) || !ui) return null;
      if (heroId !== hero || last == null) { hero = heroId; last = L.seen >>> 0; return null; }   // a new hero: no toast for what it brought
      const added = (L.seen & ~last) >>> 0;
      last = L.seen >>> 0;
      if (!added || !synthOn) return null;
      const n = countOf(Number.isFinite(L.song) ? L.song : L.seen);
      const text = n >= 26 ? LETTER_WORDS.whole : LETTER_WORDS.toast(lettersOf(added).join(', '), n);
      try {
        ui.state.toast = { text, until: ui.state.now + 3 };
        if (!told) { told = true; ui.say('system', LETTER_WORDS.log); }
      } catch { /* the UI may not be up yet */ }
      return text;
    },
  };
}

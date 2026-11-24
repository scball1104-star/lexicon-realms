// Quest scenes (wave 6, PLAN item 9, approved by Scott 2026-11-24; brief D:\LQOnline\wave6\questpres\BRIEF.md): the voice
// murmur under a talk and the accept and turn-in flourishes, built on the synth (core.js, instruments.js, voices.js chime).
// No samples. Rendered once into the sound bank (render.js) like every other synth sound; the game only plays buffers
// (src/audio/talk_voice.js), so nothing is synthesized while you play.
//
// The murmur is not speech and has no words: a soft hum through a moving mouth shape, pulsing about five syllables a
// second, falling at a full stop and rising at a question, low and muffled like someone a room away.
//
//   MURMUR_LENS                 the phrase lengths in the bank (seconds)
//   murmurName(band, len, mark) -> bank name 'murmur:<band>:<len>:<d|q>'   band 0 low, 1 high voice
//   MURMUR_RECIPES              bank recipes: { name: { variants, slot, play(S, t, i) } }
//   phrase(S, t, { voice, dur, mark, seed })   one phrase of murmur
//   acceptSound(S, t)  turninSound(S, t)       the two flourishes
import { makeRng } from './rng.js';
import { bell, harp } from './instruments.js';
import { chime } from './voices.js';

// formants F1..F3 (Hz) for mouth shapes; not words
const F = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [390, 1990, 2550], o: [570, 840, 2410], u: [440, 1020, 2240], m: [260, 1000, 2200] };
const SHAPES = ['a', 'e', 'i', 'o', 'u', 'm', 'a', 'e', 'o'];
const BW = [80, 100, 150];
const AMP = [1, 0.5, 0.22];
export const MURMUR_LENS = [0.55, 1.1, 1.9];
export const MURMUR_BANDS = [0.25, 0.72];   // the low and the high voice (each npc then gets its own pitch from its id)
const TAIL = 0.22;

export const murmurName = (band, len, mark) => `murmur:${band}:${len}:${mark === '?' ? 'q' : 'd'}`;

/** One phrase: a hummed voice through three formants walking over a few mouth shapes, in syllable pulses. */
export function phrase(S, t0, { voice = 0.5, dur = 1, mark = '.', seed = 1, dest = S.sfx.input, level = 0.5 } = {}) {
  const r = makeRng(seed >>> 0);
  const f0 = 96 + voice * 120, scale = 0.94 + voice * 0.2, breath = 0.12, rate = 5.0;
  const out = S.gain(level, dest);
  const muffle = S.filter('lowpass', 2300, 0.5, out);
  const n = Math.max(2, Math.round(dur * rate));
  const shapes = Array.from({ length: Math.min(10, n) }, () => F[SHAPES[Math.floor(r() * SHAPES.length)]]);
  const a = t0;
  const k0 = 1.04 + r() * 0.04, kEnd = mark === '?' ? 1.22 : 0.86;
  const src = S.gain(1, null);
  const tilt = S.filter('lowpass', 1800 * scale, 0.3, null);
  src.connect(tilt);
  const os = S.osc('sawtooth', f0 * k0, a, dur + 0.1, src);
  os.frequency.setValueAtTime(f0 * k0, a);
  os.frequency.linearRampToValueAtTime(f0 * (k0 + 0.05), a + dur * 0.3);
  os.frequency.linearRampToValueAtTime(f0 * kEnd, a + dur);
  S.osc('sine', 5.2, a, dur + 0.1, S.gain(f0 * 0.01, os.frequency));   // a slight waver
  S.noise(a, dur + 0.1, S.gain(breath, src));                           // breath under the voice
  const amp = S.gain(0, muffle);
  for (let k = 0; k < 3; k++) {
    const g = S.gain(AMP[k], amp);
    const bp = S.filter('bandpass', shapes[0][k] * scale, (shapes[0][k] * scale) / BW[k], g);
    tilt.connect(bp);
    shapes.forEach((sh, i) => { if (i) bp.frequency.linearRampToValueAtTime(sh[k] * scale, a + (dur * i) / Math.max(1, shapes.length - 1)); });
  }
  amp.gain.setValueAtTime(0, a);
  for (let i = 0; i < n; i++) {     // syllable pulses: rise and dip about five times a second, never to silence until the end
    const ts = a + (dur * i) / n, te = a + (dur * (i + 1)) / n;
    amp.gain.linearRampToValueAtTime(0.9 + r() * 0.2, ts + (te - ts) * 0.35);
    amp.gain.linearRampToValueAtTime(i === n - 1 ? 0 : 0.35, te);
  }
  S.track(a, dur, 16);
  return dur;
}

/** Accept: a soft paper stamp, a short whoosh toward the tracker, three rising notes. */
export function acceptSound(S, t, { dest = S.sfx.input } = {}) {
  const g = S.gain(0, dest); const o = S.osc('sine', 150, t, 0.3, g); o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.004); g.gain.setTargetAtTime(0, t + 0.01, 0.05);
  const ng = S.gain(0, dest); S.noise(t, 0.12, S.filter('bandpass', 2600, 0.8, ng));
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.18, t + 0.003); ng.gain.setTargetAtTime(0, t + 0.01, 0.03);
  const wg = S.gain(0, dest); const bp = S.filter('bandpass', 500, 1.2, wg); S.noise(t + 0.45, 0.45, bp);
  bp.frequency.setValueAtTime(500, t + 0.45); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.85);
  wg.gain.setValueAtTime(0, t + 0.45); wg.gain.linearRampToValueAtTime(0.16, t + 0.7); wg.gain.linearRampToValueAtTime(0, t + 0.9);
  S.track(t, 0.9, 12);
  return 0.15 + chime(S, t + 0.15, { notes: [67, 71, 74], dest });
}

/** Turn-in: coin ticks while the numbers count up, a soft flick for each reward, a warm chord at the end. */
export function turninSound(S, t, { items = 2, dest = S.sfx.input } = {}) {
  const g = S.gain(0.5, dest);
  for (let i = 0; i < 7; i++) {
    const tt = t + i * 0.075 + (i % 2) * 0.01;
    bell(S, tt, 93 + (i % 3) * 2, 0.08, 0.35, g, { ratio: 2.76, index: 1.2, decay: 0.25 });
  }
  let tt = t + 0.65;
  for (let i = 0; i < items; i++) {
    const fg = S.gain(0, g); const bp = S.filter('highpass', 2500, 0.7, fg); S.noise(tt, 0.09, bp);
    fg.gain.setValueAtTime(0, tt); fg.gain.linearRampToValueAtTime(0.3, tt + 0.01); fg.gain.linearRampToValueAtTime(0, tt + 0.09);
    harp(S, tt + 0.02, 76 + i * 3, 0.4, 0.5, g);
    tt += 0.3;
    S.track(tt, 0.1, 4);
  }
  for (const [m, d] of [[62, 0], [66, 0.04], [69, 0.08], [74, 0.12]]) { bell(S, tt + 0.1 + d, m + 12, 1, 0.6, g, { ratio: 2, index: 0.7, decay: 1.8 }); harp(S, tt + 0.1 + d, m, 1.2, 0.5, g); }
  return tt + 2 - t;
}

export const MURMUR_RECIPES = {};
MURMUR_BANDS.forEach((v, band) => MURMUR_LENS.forEach((len, li) => ['.', '?'].forEach((mark) => {
  MURMUR_RECIPES[murmurName(band, li, mark)] = { variants: 2, slot: len + TAIL, play: (S, t, i) => phrase(S, t, { voice: v, dur: len, mark, seed: 7001 + band * 101 + li * 17 + i * 3 + (mark === '?' ? 50 : 0) }) };
})));
MURMUR_RECIPES['flourish:accept'] = { variants: 1, slot: 1.6, play: (S, t) => acceptSound(S, t) };
MURMUR_RECIPES['flourish:turnin'] = { variants: 1, slot: 3.6, play: (S, t) => turninSound(S, t, { items: 2 }) };

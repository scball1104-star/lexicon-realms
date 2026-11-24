// Lexicon Realms synth: the seeded motif generator. Pure (no WebAudio), so node tests can check it.
//
// A theme is made from a seed (a realm name, or later the glyphs a party has found):
//   const th = makeTheme({ seed, mode: 'ionian', bars: 8, beats: 6 })
//   th.chords   8 chord roots as scale degrees (0 = tonic)
//   th.melody   8 bars, each a list of { step, len, deg } (step and len in eighth notes, deg a scale degree)
//   degToMidi(deg, tonic, mode)  scale degree to a MIDI note
//
// Rules, chosen so any seed sounds tuneful and none copies an existing tune: strong beats land on chord tones,
// motion is mostly by step, a leap is followed by a step back the other way, phrases are a two-bar motif, its
// sequence on the next chords, the motif again with a changed ending, then a cadence home.
import { makeRng } from './rng.js';

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

export function degToMidi(deg, tonic, mode) {
  const sc = MODES[mode] || MODES.ionian;
  const oct = Math.floor(deg / 7);
  const i = ((deg % 7) + 7) % 7;
  return tonic + oct * 12 + sc[i];
}

/** Chord tones (degrees) of the triad built on a root degree. */
export const chordTones = (root) => [root, root + 2, root + 4];

// 6/8 bar rhythms in eighth notes; the last of each bar pattern list is used for cadences
const RHYTHMS_68 = [[3, 3], [2, 1, 3], [3, 2, 1], [1, 1, 1, 3], [2, 1, 2, 1], [3, 1, 1, 1], [2, 1, 1, 1, 1]];
const RHYTHMS_44 = [[2, 2, 2, 2], [3, 1, 2, 2], [2, 1, 1, 4], [4, 2, 2], [1, 1, 2, 4], [2, 2, 4]];
const PROGRESSIONS = [
  [0, 4, 5, 3, 0, 3, 4, 0],
  [0, 5, 3, 4, 0, 5, 4, 0],
  [0, 3, 5, 4, 3, 0, 4, 0],
  [0, 2, 3, 4, 5, 3, 4, 0],
  [0, 3, 0, 4, 5, 3, 4, 0],
];

function nearestChordTone(deg, root, lo = -99, hi = 99) {
  let best = deg, bd = 99;
  for (const c of chordTones(root)) for (const o of [-14, -7, 0, 7, 14]) {
    if (c + o < lo || c + o > hi) continue;
    const d = Math.abs(c + o - deg);
    if (d < bd) { bd = d; best = c + o; }
  }
  return best;
}

const clampDeg = (d, lo, hi) => (d < lo ? lo + ((lo - d) % 2) : d > hi ? hi - ((d - hi) % 2) : d);

/**
 * Pitch a rhythm over one chord, starting near `from` and heading for `target` (the contour): mostly steps, an
 * occasional leap that is answered by a step back, strong beats snapped to chord tones.
 */
function pitchBar(rng, rhythm, root, from, { lo = 0, hi = 9, endOn = null, strong = 3, target = null } = {}) {
  const notes = [];
  let step = 0, cur = from, lastLeap = 0;
  const goal = target == null ? from : target;
  for (let k = 0; k < rhythm.length; k++) {
    const len = rhythm[k];
    let deg;
    if (k === 0) deg = nearestChordTone(cur, root);
    else {
      let mv;
      const dir = Math.sign(goal - cur) || rng.pick([-1, 1]);
      if (lastLeap) mv = -Math.sign(lastLeap);
      else if (rng.chance(0.25)) mv = dir * rng.pick([2, 3, 4]);
      else mv = rng.chance(0.8) ? dir : -dir;
      deg = cur + mv;
      lastLeap = Math.abs(mv) > 1 ? mv : 0;
      if (step % strong === 0) { const c = nearestChordTone(deg, root); deg = c === cur ? nearestChordTone(deg + dir * 2, root) : c; }
    }
    if (k === rhythm.length - 1 && endOn != null) deg = endOn;
    deg = clampDeg(deg, lo, hi);
    if (step % strong === 0 && !(k === rhythm.length - 1 && endOn != null)) deg = nearestChordTone(deg, root, lo, hi);   // clamping must not undo the chord tone
    notes.push({ step, len, deg });
    cur = deg; step += len;
  }
  return notes;
}

/** Same rhythm and intervals as `bar`, moved to start on a different chord tone of `root` (a sequence). */
function sequenceBar(rng, bar, root) {
  const opts = [];
  for (const c of chordTones(root)) for (const o of [-7, 0, 7]) {
    const sh = c + o - bar[0].deg;
    if (sh !== 0 && Math.abs(sh) <= 3) opts.push(sh);
  }
  const shift = opts.length ? rng.pick(opts) : 1;
  return bar.map((n) => ({ ...n, deg: clampDeg(n.deg + shift, -1, 10) }));
}

export function makeTheme({ seed = 1, beats = 6, mode = 'ionian' } = {}) {
  const rng = makeRng(seed);
  const R = beats === 6 ? RHYTHMS_68 : RHYTHMS_44;
  const strong = beats === 6 ? 3 : 4;
  const chords = rng.pick(PROGRESSIONS).slice();
  const start = rng.pick([0, 2, 4, 4]);
  // the two-bar motif: an arch (up then home) or a fall (from high, down), chosen by the seed
  const arch = rng.chance(0.6);
  const peak = start + rng.pick([3, 4, 5]);
  const r1 = rng.pick(R), r2 = rng.pick(R.filter((r) => r[r.length - 1] >= 2));
  const m1 = pitchBar(rng, r1, chords[0], arch ? start : peak, { strong, target: arch ? peak : start });
  const m2 = pitchBar(rng, r2, chords[1], m1[m1.length - 1].deg, { strong, target: arch ? start + 1 : start - 1 });
  // its sequence, the motif again with a new tail, a cadence
  const s1 = sequenceBar(rng, m1, chords[2]);
  const s2 = sequenceBar(rng, m2, chords[3]);
  const v2 = pitchBar(rng, r2, chords[5], m1[m1.length - 1].deg, { strong, target: peak + 1 });
  const cadR1 = rng.pick(R);
  const c1 = pitchBar(rng, cadR1, chords[6], v2[v2.length - 1].deg, { endOn: rng.pick([1, 4, 6]), strong, target: 4 });
  const c2 = [{ step: 0, len: beats, deg: rng.pick([0, 0, 2, 7]) }];
  const fix = (bar, root) => bar.map((n) => (n.step % strong === 0 ? { ...n, deg: nearestChordTone(n.deg, root) } : n));
  const melody = [m1, m2, fix(s1, chords[2]), fix(s2, chords[3]), fix(m1, chords[4]), v2, c1, c2];
  return { seed, beats, mode, chords, melody };
}

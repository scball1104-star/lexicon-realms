// Lexicon Realms synth: voices, second pass (wave 5b). Creature voices by family and wordless NPC barks, plus the
// small world recipes the game needs (a locked door's rattle, a fizzle, a whiff, chimes, work loops).
//
// What changed from the first pass (sfx.js creatureVoice and bark, kept for comparison):
// - a vocal source with a jittered pitch track (setValueCurveAtTime) instead of a smooth glide, so it sounds alive
// - four formants with real bandwidths instead of three, and per-voice formant scaling (low, mid, high voices)
// - consonant onsets: a breath "h" through the first vowel's mouth shape, or a closed-mouth "m" that opens
// - the boar: a pulse train with a sub-octave for chest weight, breath gated by the same pulses, a nasal notch,
//   grunts that speed up and rise when it charges, a squeal when hurt, a falling groan when it dies
//
//   voiceOf(S, t, { family, mood, size, seed })      family: boar wolf bird insect ooze spirit construct humanoid small
//                                                    mood: aggro hurt death flee
//   npcBark(S, t, { voice: 0..1, shape, seed })      shape: hey hm huh aha oh mmhm
//   locked(S, t), fizzle(S, t), whiff(S, t), chime(S, t, { notes }), mobHeal(S, t), workLoop(S, t, { kind, dur })
import { midiToHz } from './core.js';
import { bell } from './instruments.js';
import { makeRng } from './rng.js';

// formants F1..F4 (Hz) for mouth shapes; not words
const V = {
  a: [730, 1090, 2440, 3400], e: [530, 1840, 2480, 3500], ih: [390, 1990, 2550, 3600], o: [570, 840, 2410, 3400],
  u: [300, 870, 2240, 3300], uh: [640, 1190, 2390, 3400], m: [260, 1000, 2200, 3300],
};
const BW = [90, 110, 160, 220];          // formant bandwidths (Hz); Q = F / BW
const AMP = [1, 0.55, 0.28, 0.12];

/** A pitch track: points [frac, mult] joined linearly, with seeded jitter (in fractions of f0) every 12 ms. */
function pitchTrack(r, f0, pts, dur, jitter) {
  const n = Math.max(4, Math.round(dur / 0.012));
  const c = new Float32Array(n);
  let wob = 0;
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    let k = 1;
    for (let j = 1; j < pts.length; j++) if (x <= pts[j][0]) { const [x0, m0] = pts[j - 1], [x1, m1] = pts[j]; k = m0 + (m1 - m0) * ((x - x0) / Math.max(1e-6, x1 - x0)); break; }
    wob = wob * 0.6 + (r() * 2 - 1) * jitter;
    c[i] = Math.max(20, f0 * k * (1 + wob));
  }
  return c;
}

/**
 * The vocal tract: a buzzy source (saw, tilted by a lowpass) plus breath noise, through four parallel formants that
 * move through a list of mouth shapes. onset 'h' breathes first; 'm' starts closed and opens.
 */
function vocal(S, t, o) {
  const { f0 = 150, pts = [[0, 1], [1, 1]], dur = 0.35, shapes = ['a'], scale = 1, breath = 0.1, jitter = 0.02,
    vib = 0.006, level = 0.5, onset = null, rasp = 0, sub = 0, dest } = o;
  const r = S.rng;
  const out = S.gain(0, dest);
  const tilt = S.filter('lowpass', 2600 * scale, -3, null);
  const src = S.gain(1, tilt);
  const curve = pitchTrack(r, f0, pts, dur, jitter);
  const os = S.osc('sawtooth', f0, t, dur + 0.12, src);
  os.frequency.setValueCurveAtTime(curve, t, dur);
  if (vib) S.osc('sine', 5 + r() * 1.2, t, dur + 0.1, S.gain(f0 * vib, os.frequency));
  if (sub) {   // a sub-octave pulse: weight in the chest
    const so = S.osc('square', f0 / 2, t, dur + 0.12, S.gain(sub, src));
    so.frequency.setValueCurveAtTime(curve.map((v) => v / 2), t, dur);
  }
  if (rasp) {  // a rough, uneven flutter in the voice
    const am = S.gain(rasp, src.gain); src.gain.value = 1 - rasp * 0.4;
    const fl = S.osc('sawtooth', r.range(24, 34), t, dur + 0.1, am);
    fl.frequency.setValueCurveAtTime(pitchTrack(r, 28, [[0, 1], [1, 0.8]], dur, 0.15), t, dur);
  }
  const nb = S.gain(breath, src); S.noise(t, dur + 0.12, nb);
  const fs = shapes.map((s) => V[s] || V.a);
  for (let k = 0; k < 4; k++) {
    const f = fs[0][k] * scale;
    const g = S.gain(AMP[k], out);
    const bp = S.filter('bandpass', f, f / BW[k], g);
    tilt.connect(bp);
    fs.forEach((sh, i) => { if (i) bp.frequency.linearRampToValueAtTime(sh[k] * scale, t + (dur * i) / (fs.length - 1)); });
  }
  let t0 = t;
  if (onset === 'h') {   // breath through the first shape, just before the voice
    const hg = S.gain(0, out);
    for (let k = 0; k < 3; k++) { const f = fs[0][k] * scale; const bp = S.filter('bandpass', f, f / (BW[k] * 1.5), S.gain(AMP[k], hg)); S.noise(t - 0.07, 0.12, bp); }
    hg.gain.setValueAtTime(0, t - 0.07); hg.gain.linearRampToValueAtTime(level * 0.9, t - 0.02); hg.gain.linearRampToValueAtTime(0, t + 0.03);
    t0 = t;
  }
  if (onset === 'm') {   // a closed mouth for the first 70 ms
    const lp = S.filter('lowpass', 380, -3, null);
    out.disconnect(); out.connect(lp); lp.connect(dest);
    lp.frequency.setValueAtTime(380, t); lp.frequency.setValueAtTime(380, t + 0.07); lp.frequency.exponentialRampToValueAtTime(9000, t + 0.12);
  }
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(level, t0 + 0.025);
  out.gain.setValueAtTime(level, t0 + dur * 0.7);
  out.gain.linearRampToValueAtTime(level * 0.6, t0 + dur * 0.85);
  out.gain.linearRampToValueAtTime(0, t0 + dur + 0.06);
  S.track(t, dur + 0.1, 22);
  return dur + 0.06;
}

// ---------------------------------------------------------------- the boar, second pass

function grunt(S, t, { f0 = 72, dur = 0.22, level = 0.9, size = 1, squeal = false, dest }) {
  const r = S.rng;
  const out = S.gain(0, dest);
  const nasal = S.filter('notch', 1500 / Math.sqrt(size), 3, out);
  const lp = S.filter('lowpass', 3200, -3, nasal);
  const src = S.gain(1, null);
  const pts = squeal ? [[0, 1], [0.3, 1.35], [1, 0.9]] : [[0, 1.18], [0.15, 1.25], [1, 0.72]];
  const curve = pitchTrack(r, f0, pts, dur, squeal ? 0.03 : 0.09);
  const o = S.osc('sawtooth', f0, t, dur + 0.1, src);
  o.frequency.setValueCurveAtTime(curve, t, dur);
  if (!squeal) { const so = S.osc('square', f0 / 2, t, dur + 0.1, S.gain(0.3, src)); so.frequency.setValueCurveAtTime(curve.map((v) => v / 2), t, dur); }
  // breath through the snout, pulsed by the same glottal beat
  const nb = S.gain(0.25, src); S.noise(t, dur + 0.1, S.filter('bandpass', 1100, 0.7, nb));
  o.connect(S.gain(0.25, nb.gain));
  const F = squeal ? [[650, 6, 1], [1700, 9, 0.6], [3000, 10, 0.25]] : [[330, 4.5, 1], [960, 7, 0.55], [2300, 9, 0.2]];
  for (const [f, q, a] of F) src.connect(S.filter('bandpass', (f / Math.sqrt(size)) * r.range(0.94, 1.06), q, S.gain(a, lp)));
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(level, t + 0.012);
  out.gain.linearRampToValueAtTime(level * 0.7, t + dur * 0.35);
  out.gain.linearRampToValueAtTime(level * 0.85, t + dur * 0.5);
  out.gain.linearRampToValueAtTime(0, t + dur);
  S.track(t, dur + 0.1, 16);
  return dur;
}

function snort(S, t, { level = 0.5, dest }) {
  const g = S.gain(0, dest); const bp = S.filter('bandpass', 1800, 1.6, g); S.noise(t, 0.32, bp);
  bp.frequency.setValueAtTime(2000, t); bp.frequency.exponentialRampToValueAtTime(650, t + 0.25);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.02); g.gain.linearRampToValueAtTime(level * 0.2, t + 0.07);
  g.gain.linearRampToValueAtTime(level * 0.8, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.28);
  S.track(t, 0.32, 4);
  return 0.3;
}

function boar(S, t, { mood = 'aggro', size = 1, dest }) {
  const r = S.rng;
  const f = 70 / size;
  if (mood === 'aggro') {      // grunts that speed up and rise, then a snort
    let tt = t;
    [[1, 0.24, 0.13], [1.08, 0.2, 0.09], [1.18, 0.26, 0.05]].forEach(([k, d, gap]) => { grunt(S, tt, { f0: f * k * r.range(0.95, 1.05), dur: d, size, dest }); tt += d + gap; });
    return tt + snort(S, tt + 0.03, { dest }) - t;
  }
  if (mood === 'hurt') return grunt(S, t, { f0: f * 3.2, dur: 0.24, size, squeal: true, level: 1.2, dest });
  if (mood === 'flee') return grunt(S, t, { f0: f * 5, dur: 0.42, size, squeal: true, level: 1.1, dest });
  // death: a falling groan and a last breath
  const d = grunt(S, t, { f0: f * 1.3, dur: 0.7, size, level: 0.8, dest });
  snort(S, t + d - 0.05, { level: 0.25, dest });
  return d + 0.3;
}

// ---------------------------------------------------------------- other families

function buzz(S, t, { dur = 0.4, f = 190, level = 0.4, rise = 1.2, dest }) {
  const g = S.gain(0, dest); const bp = S.filter('bandpass', 1400, 1.2, g);
  const o = S.osc('sawtooth', f, t, dur + 0.05, bp); o.frequency.linearRampToValueAtTime(f * rise, t + dur);
  S.osc('square', 32, t, dur, S.gain(level * 0.5, g.gain));
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.04); g.gain.setValueAtTime(level, t + dur - 0.08); g.gain.linearRampToValueAtTime(0, t + dur);
  S.track(t, dur, 6);
  return dur;
}
function clicks(S, t, { n = 8, span = 0.3, f = 4200, level = 0.35, dest }) {
  for (let i = 0; i < n; i++) {
    const tt = t + S.rng.range(0, span);
    const g = S.gain(0, dest); const bp = S.filter('bandpass', f * S.rng.range(0.8, 1.2), 5, g); S.noise(tt, 0.02, bp);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(level, tt + 0.0008); g.gain.linearRampToValueAtTime(0, tt + 0.012);
  }
  S.track(t, span, n * 3);
  return span;
}
function bubbles(S, t, { n = 10, span = 0.5, lo = 250, hi = 700, level = 0.3, dest }) {
  for (let i = 0; i < n; i++) {
    const tt = t + S.rng.range(0, span), f = S.rng.range(lo, hi);
    const g = S.gain(0, dest); const o = S.osc('sine', f, tt, 0.1, g); o.frequency.exponentialRampToValueAtTime(f * S.rng.range(1.5, 2.3), tt + 0.06);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(level, tt + 0.004); g.gain.linearRampToValueAtTime(0, tt + 0.07);
  }
  S.track(t, span, n * 3);
  return span;
}
function rumble(S, t, { dur = 0.8, level = 0.6, dest }) {
  const g = S.gain(0, dest); const lp = S.filter('lowpass', 220, 1, g); S.noise(t, dur, lp, { rate: 0.4 });
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
  S.track(t, dur, 3);
  return dur;
}
function grind(S, t, { dur = 0.6, level = 0.4, dest }) {
  const out = S.gain(0, dest);
  const o = S.osc('sawtooth', 14, t, dur, null);
  o.frequency.setValueCurveAtTime(pitchTrack(S.rng, 14, [[0, 0.8], [1, 1.4]], dur, 0.2), t, dur);
  for (const [f, q, a] of [[180, 6, 1], [420, 8, 0.6], [900, 6, 0.3]]) o.connect(S.filter('bandpass', f, q, S.gain(a, out)));
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(level * 4, t + dur * 0.3); out.gain.linearRampToValueAtTime(0, t + dur);
  S.track(t, dur, 8);
  return dur;
}
function thump(S, t, { f = 70, level = 0.7, dest }) {
  const g = S.gain(0, dest); const o = S.osc('sine', f * 1.6, t, 0.4, g); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.12);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.003); g.gain.setTargetAtTime(0, t + 0.01, 0.07);
  const ng = S.gain(0, dest); S.noise(t, 0.15, S.filter('lowpass', 600, 0.7, ng));
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(level * 0.5, t + 0.002); ng.gain.setTargetAtTime(0, t + 0.01, 0.03);
  S.track(t, 0.4, 6);
  return 0.35;
}

// per-family trim so every family sits near the same loudness (measured on voices_v2.wav, 2026-11-24)
const FAMILY_GAIN = { ooze: 0.42, construct: 0.42, insect: 0.75, bird: 2.2, spirit: 1.5, humanoid: 1.9, wolf: 1.15 };

export function voiceOf(S, t, { family = 'boar', mood = 'aggro', size = 1, dest = S.sfx.input } = {}) {
  const r = S.rng;
  const D = S.gain(1.6 * (FAMILY_GAIN[family] || 1), dest);   // narrow formants lose level; levelled by ear-free measurement (loudest 400 ms)
  switch (family) {
    case 'boar': return boar(S, t, { mood, size, dest: D });
    case 'wolf':
      if (mood === 'aggro') { const a = vocal(S, t, { f0: 120 / size, pts: [[0, 0.9], [0.5, 1.1], [1, 0.95]], dur: 0.55, shapes: ['uh', 'a', 'uh'], scale: 0.8, breath: 0.5, rasp: 0.9, jitter: 0.05, level: 0.7, dest: D }); return a + vocal(S, t + a + 0.05, { f0: 330 / size, pts: [[0, 1], [0.3, 1.2], [1, 0.8]], dur: 0.16, shapes: ['o', 'a'], scale: 0.85, breath: 0.25, level: 0.7, dest: D }) + 0.05; }
      if (mood === 'hurt') return vocal(S, t, { f0: 620 / size, pts: [[0, 1], [0.3, 1.35], [1, 1]], dur: 0.2, shapes: ['ih', 'e'], scale: 0.9, breath: 0.2, level: 0.55, dest: D });
      return vocal(S, t, { f0: 700 / size, pts: [[0, 1], [1, 0.45]], dur: mood === 'flee' ? 0.5 : 0.8, shapes: ['ih', 'u'], scale: 0.9, breath: 0.25, vib: 0.02, level: 0.5, dest: D });
    case 'bird': {
      const caw = (tt, k) => vocal(S, tt, { f0: 520 * k / size, pts: [[0, 1.1], [0.4, 1], [1, 0.8]], dur: 0.17, shapes: ['a', 'a'], scale: 1.25, breath: 0.35, rasp: 0.5, level: 0.5, dest: D });
      if (mood === 'aggro') { caw(t, 1); return caw(t + 0.24, 1.05) + 0.24; }
      if (mood === 'hurt') return vocal(S, t, { f0: 900 / size, pts: [[0, 1], [1, 1.2]], dur: 0.14, shapes: ['ih', 'e'], scale: 1.3, breath: 0.3, level: 0.45, dest: D });
      return caw(t, 0.8);
    }
    case 'insect':
      if (mood === 'aggro') return buzz(S, t, { dur: 0.55, f: 170, rise: 1.4, level: 0.5, dest: D });
      if (mood === 'hurt') return clicks(S, t, { n: 10, span: 0.18, dest: D });
      buzz(S, t, { dur: 0.4, f: 220, rise: 0.5, level: 0.4, dest: D }); return clicks(S, t + 0.3, { n: 6, span: 0.2, level: 0.25, dest: D }) + 0.3;
    case 'ooze':
      if (mood === 'aggro') { rumble(S, t, { dur: 0.5, level: 0.5, dest: D }); return bubbles(S, t + 0.05, { n: 12, span: 0.45, dest: D }) + 0.05; }
      if (mood === 'hurt') return bubbles(S, t, { n: 6, span: 0.15, lo: 400, hi: 900, dest: D });
      rumble(S, t, { dur: 0.7, level: 0.4, dest: D }); return bubbles(S, t, { n: 18, span: 0.7, lo: 180, hi: 500, level: 0.25, dest: D });
    case 'spirit': {
      // a breath with no voice behind it, and a thin moan under it
      const moan = (tt, k, d, sh) => {
        vocal(S, tt, { f0: 210 * k, pts: [[0, 0.9], [0.5, 1.1], [1, 0.85]], dur: d, shapes: sh, scale: 1.05, breath: 1.2, vib: 0.025, jitter: 0.005, level: 0.22, dest: D });
        const g = S.gain(0, D); const o = S.osc('sine', 420 * k, tt, d, g); o.frequency.linearRampToValueAtTime(380 * k, tt + d);
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.06, tt + d * 0.4); g.gain.linearRampToValueAtTime(0, tt + d);
        return d;
      };
      if (mood === 'aggro') return moan(t, 1, 0.8, ['u', 'o', 'a']);
      if (mood === 'hurt') return moan(t, 1.4, 0.25, ['a', 'uh']);
      return moan(t, 0.9, 1.1, ['a', 'o', 'u']);
    }
    case 'construct':
      if (mood === 'aggro') { grind(S, t, { dur: 0.6, dest: D }); return thump(S, t + 0.55, { f: 60, dest: D }) + 0.55; }
      if (mood === 'hurt') return thump(S, t, { f: 140, level: 0.5, dest: D });
      grind(S, t, { dur: 0.5, level: 0.3, dest: D }); clicks(S, t + 0.2, { n: 14, span: 0.5, f: 2500, level: 0.3, dest: D }); return thump(S, t + 0.55, { f: 55, dest: D }) + 0.55;
    case 'humanoid': {
      const low = r.chance(0.6);
      const f0 = low ? r.range(105, 135) : r.range(180, 215), scale = low ? 0.95 : 1.12;
      if (mood === 'aggro') return vocal(S, t, { f0: f0 * 1.25, pts: [[0, 1], [0.25, 1.15], [1, 0.85]], dur: 0.32, shapes: ['a', 'a'], scale, onset: 'h', breath: 0.15, rasp: 0.25, level: 0.6, dest: D });
      if (mood === 'hurt') return vocal(S, t, { f0: f0 * 1.3, pts: [[0, 1.1], [1, 0.9]], dur: 0.16, shapes: ['uh', 'uh'], scale, breath: 0.2, level: 0.5, dest: D });
      return vocal(S, t, { f0, pts: [[0, 1.1], [1, 0.7]], dur: 0.6, shapes: ['uh', 'o', 'u'], scale, breath: 0.25, level: 0.45, dest: D });
    }
    default:
      return vocal(S, t, { f0: 440 / size, pts: [[0, 1], [1, 1.25]], dur: 0.16, shapes: ['ih', 'e'], scale: 1.3, breath: 0.2, level: 0.4, dest: D });
  }
}

// ---------------------------------------------------------------- NPC barks, second pass

const SHAPES = {
  hey: [{ onset: 'h', shapes: ['e', 'ih'], pts: [[0, 1], [0.6, 1.22], [1, 1.12]], dur: 0.3 }],
  hm: [{ onset: 'm', shapes: ['m', 'm'], pts: [[0, 1.04], [1, 0.9]], dur: 0.34, closed: true }],
  huh: [{ onset: 'h', shapes: ['uh', 'uh'], pts: [[0, 0.95], [1, 1.28]], dur: 0.26 }],
  aha: [{ shapes: ['a', 'a'], pts: [[0, 1.05], [1, 1.0]], dur: 0.14 }, { gap: 0.04, onset: 'h', shapes: ['a', 'uh'], pts: [[0, 1.2], [1, 0.92]], dur: 0.26 }],
  oh: [{ shapes: ['o', 'u'], pts: [[0, 0.95], [0.4, 1.22], [1, 1.0]], dur: 0.34 }],
  mmhm: [{ onset: 'm', shapes: ['m', 'm'], pts: [[0, 1], [1, 0.96]], dur: 0.16, closed: true }, { gap: 0.06, onset: 'm', shapes: ['m', 'uh'], pts: [[0, 1.12], [1, 1.18]], dur: 0.2, closed: true }],
};
export const BARK_SHAPES = Object.keys(SHAPES);

/** voice 0 (low) to 1 (high). The same seed gives the same person: an NPC keeps one voice. */
export function npcBark(S, t, { voice = 0.5, shape = 'hey', seed = null, dest = S.sfx.input } = {}) {
  const r = seed != null ? makeRng(seed) : S.rng;
  const f0 = 100 + voice * 150 + r.range(-8, 8);
  const scale = 1 + voice * 0.22;
  const D = S.gain(2.2, dest);
  let tt = t;
  for (const syl of SHAPES[shape] || SHAPES.hey) {
    tt += syl.gap || 0;
    tt += vocal(S, tt, { f0, pts: syl.pts, dur: syl.dur, shapes: syl.shapes, scale, onset: syl.onset || null, breath: 0.07,
      jitter: 0.012, vib: 0.008, level: syl.closed ? 0.42 : 0.55, dest: D });
  }
  return tt - t + 0.05;
}

// ---------------------------------------------------------------- small world recipes

/** A locked door: the latch rattles against the bolt. */
export function locked(S, t, { dest = S.sfx.input } = {}) {
  for (let i = 0; i < 4; i++) {
    const tt = t + i * 0.07 + S.rng.range(0, 0.015);
    const g = S.gain(0, dest); const bp = S.filter('bandpass', S.rng.range(1800, 2600), 6, g); S.noise(tt, 0.05, bp);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.5, tt + 0.001); g.gain.setTargetAtTime(0, tt + 0.003, 0.012);
  }
  thump(S, t + 0.3, { f: 90, level: 0.35, dest });
  S.track(t, 0.45, 12);
  return 0.5;
}
/** A spell let go before it finished: a soft falling fizz. */
export function fizzle(S, t, { dest = S.sfx.input } = {}) {
  const g = S.gain(0, dest); const bp = S.filter('bandpass', 3000, 2, g); S.noise(t, 0.4, bp);
  bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.02); g.gain.linearRampToValueAtTime(0, t + 0.38);
  S.track(t, 0.4, 3);
  return 0.4;
}
/** A blow that missed: air past your ear. */
export function whiff(S, t, { dest = S.sfx.input } = {}) {
  const g = S.gain(0, dest); const bp = S.filter('bandpass', 900, 1.5, g); S.noise(t, 0.25, bp);
  bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.1); bp.frequency.exponentialRampToValueAtTime(800, t + 0.22);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.08); g.gain.linearRampToValueAtTime(0, t + 0.22);
  S.track(t, 0.25, 3);
  return 0.25;
}
/** A few soft harp-bell notes (a new area, a rested hero). notes are MIDI numbers. */
export function chime(S, t, { notes = [74, 78, 81], dest = S.sfx.input } = {}) {
  const g = S.gain(0.7, dest);
  notes.forEach((m, i) => bell(S, t + i * 0.13, m, 0.5, 0.5, g, { ratio: 2, index: 0.8, decay: 1.4 }));
  return 0.13 * notes.length + 1.2;
}
/** A foe healing a friend: a rising shimmer. */
export function mobHeal(S, t, { dest = S.sfx.input } = {}) {
  const g = S.gain(0, dest);
  for (const det of [-6, 6]) { const o = S.osc('triangle', midiToHz(67), t, 0.7, g); o.detune.value = det; o.frequency.exponentialRampToValueAtTime(midiToHz(79), t + 0.6); }
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 0.65);
  S.track(t, 0.7, 4);
  return 0.7;
}

/** A seamless work loop of `dur` seconds: mine (pick on rock), herb (rustle and snip), craft (tap and scratch), fish (lapping, a reel). */
export function workLoop(S, t, { kind = 'craft', dur = 2.4, dest = S.sfx.input } = {}) {
  const hit = (tt, f, lv, q = 8, d = 0.15) => {
    const g = S.gain(0, dest); const bp = S.filter('bandpass', f, q, g); S.noise(tt, d, bp);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(lv, tt + 0.001); g.gain.setTargetAtTime(0, tt + 0.002, d / 4);
  };
  if (kind === 'mine') {
    for (let k = 0; k < 2; k++) { const tt = t + 0.2 + k * (dur / 2); hit(tt, 2600, 0.6, 9, 0.25); hit(tt, 900, 0.4, 3, 0.1); thump(S, tt, { f: 120, level: 0.25, dest }); clicks(S, tt + 0.05, { n: 5, span: 0.25, f: 3000, level: 0.12, dest }); }
  } else if (kind === 'herb') {
    for (let k = 0; k < 3; k++) {
      const tt = t + 0.1 + k * (dur / 3);
      const g = S.gain(0, dest); S.noise(tt, 0.4, S.filter('highpass', 3500, 0.5, g));
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.18, tt + 0.12); g.gain.linearRampToValueAtTime(0, tt + 0.35);
      hit(tt + 0.38, 5200, 0.3, 6, 0.04);
    }
  } else if (kind === 'fish') {
    const g = S.gain(0, dest); const bp = S.filter('bandpass', 700, 0.8, g); S.noise(t, dur, bp);
    g.gain.setValueAtTime(0.12, t); S.osc('sine', 1 / dur * 2, t, dur, S.gain(0.08, g.gain));
    clicks(S, t + dur * 0.6, { n: 9, span: 0.35, f: 3800, level: 0.12, dest });
  } else {
    for (let k = 0; k < 4; k++) hit(t + 0.15 + k * (dur / 4), k % 2 ? 1800 : 2400, 0.45, 7, 0.12);
    const g = S.gain(0, dest); S.noise(t + dur * 0.55, 0.5, S.filter('bandpass', 4200, 2, g));
    g.gain.setValueAtTime(0, t + dur * 0.55); g.gain.linearRampToValueAtTime(0.1, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur * 0.8);
  }
  S.track(t, dur, 20);
  return dur;
}

export const VOICES = { voiceOf, npcBark, locked, fizzle, whiff, chime, mobHeal, workLoop };

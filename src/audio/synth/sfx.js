// Lexicon Realms synth: sound recipes. Each recipe is fn(S, t, opts, dest) and returns its length in seconds.
// Every call varies a little (seeded), so ten footsteps never sound like one sample played ten times.
//
//   footstep(S, t, { surface: 'grass' | 'stone' | 'wood' | 'dirt' | 'snow' | 'water', weight })
//   creatureVoice(S, t, { kind: 'boar' | 'wolf' | 'small', size, mood: 'grunt' | 'pain' | 'aggro' })
//   bark(S, t, { voice: 0..1 (low to high), shape: 'hey' | 'hm' | 'oh' | 'ha' })     non-word NPC vocal
//   door(S, t, { heavy }), chest(S, t), fire(S, t, { dur }), water(S, t, { dur, size })
//   spell(S, t, { school: 'ink' | 'fire' | 'light' }) charge then release; impact(S, t, { power })
import { midiToHz } from './core.js';
import { bell } from './instruments.js';

const SURF = {
  grass: { bp: 2400, q: 0.6, dec: 0.11, body: 0, ring: 0, swish: 0.9, lvl: 0.85 },
  dirt: { bp: 900, q: 0.8, dec: 0.08, body: 0.5, ring: 0, swish: 0.25, lvl: 0.6 },
  stone: { bp: 3200, q: 1.6, dec: 0.035, body: 0.35, ring: 0.25, swish: 0.15, lvl: 1.5 },
  wood: { bp: 1500, q: 1.2, dec: 0.05, body: 0.8, ring: 0.5, swish: 0.1, lvl: 0.6 },
  snow: { bp: 4200, q: 0.8, dec: 0.16, body: 0.2, ring: 0, swish: 0.6, lvl: 0.45, grains: 14 },
  water: { bp: 1100, q: 0.7, dec: 0.2, body: 0.3, ring: 0, swish: 0.8, lvl: 0.45, splash: 1 },
};

export function footstep(S, t, { surface = 'grass', weight = 1, dest = S.sfx.input } = {}) {
  const r = S.rng;
  const p = SURF[surface] || SURF.grass;
  const out = S.gain(p.lvl * weight * r.range(0.8, 1.05), dest);
  const tilt = r.range(0.85, 1.18);
  // heel then toe: two noise hits a few ms apart
  for (const [dt, lv] of [[0, 1], [r.range(0.045, 0.07), 0.6]]) {
    const g = S.gain(0, out); const bp = S.filter('bandpass', p.bp * tilt * (dt ? 1.15 : 1), p.q, g);
    S.noise(t + dt, p.dec + 0.1, bp);
    S.env(g.gain, t + dt, { a: 0.002, d: p.dec, s: 0, r: 0.02, peak: lv });
  }
  if (p.body) {
    const g = S.gain(0, out); const o = S.osc('sine', 110 * tilt, t, 0.12, g);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.06);
    S.env(g.gain, t, { a: 0.002, d: 0.05, s: 0, r: 0.02, peak: 0.6 * p.body });
  }
  if (p.ring) {
    const g = S.gain(0, out); const bp = S.filter('bandpass', (surface === 'wood' ? 420 : 1700) * tilt, 9, g);
    S.noise(t, 0.12, bp);
    S.env(g.gain, t, { a: 0.001, d: 0.07, s: 0, r: 0.03, peak: 1.2 * p.ring });
  }
  if (p.swish) {   // the rustle of grass or a dragged sole
    const g = S.gain(0, out); const hp = S.filter('highpass', 3500 * tilt, 0.5, g);
    S.noise(t, 0.25, hp);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25 * p.swish, t + 0.04);
    g.gain.setTargetAtTime(0, t + 0.06, 0.05);
  }
  if (p.grains) for (let i = 0; i < p.grains; i++) {
    const tt = t + r.range(0, 0.14); const g = S.gain(0, out); const bp = S.filter('bandpass', r.range(2500, 6000), 2, g);
    S.noise(tt, 0.02, bp); S.env(g.gain, tt, { a: 0.001, d: 0.008, s: 0, r: 0.004, peak: r.range(0.3, 0.8) });
  }
  if (p.splash) {
    const g = S.gain(0, out); const lp = S.filter('lowpass', 2500, 1, g); S.noise(t, 0.35, lp);
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    S.env(g.gain, t, { a: 0.01, d: 0.22, s: 0, r: 0.05, peak: 0.6 });
  }
  S.track(t, 0.3, 14);
  return 0.3;
}

// formant sets (F1, F2, F3 in Hz) used for creature and NPC voices; not words, just mouth shapes
const VOWEL = { a: [760, 1150, 2500], e: [500, 1850, 2550], o: [480, 860, 2450], u: [330, 750, 2350], m: [280, 900, 2200], ih: [400, 2000, 2650] };

/** A voice source (saw plus noise) through three parallel formant filters that glide between mouth shapes. */
function voice(S, t, { f0 = 180, f0End = null, dur = 0.4, shapes = ['e', 'a'], scale = 1, breath = 0.15, rasp = 0, vib = 0, peak = 0.5, dest }) {
  const out = S.gain(0, dest);
  const src = S.gain(1, null);
  const o = S.osc('sawtooth', f0, t, dur + 0.1, src);
  o.frequency.setValueAtTime(f0, t);
  if (f0End) o.frequency.linearRampToValueAtTime(f0End, t + dur);
  if (vib) S.osc('sine', 5.5, t, dur + 0.1, S.gain(f0 * vib, o.frequency));
  if (rasp) {   // growl: amplitude flutter at 20 to 40 Hz
    const am = S.gain(rasp, src.gain); src.gain.value = 1 - rasp * 0.5;
    S.osc('sine', S.rng.range(22, 36), t, dur + 0.1, am);
  }
  const nb = S.gain(breath, src); S.noise(t, dur + 0.1, nb);
  const fs = shapes.map((s) => VOWEL[s] || VOWEL.a);
  [1, 0.55, 0.3].forEach((lv, k) => {
    const g = S.gain(lv, out); const bp = S.filter('bandpass', fs[0][k] * scale, 6 + k * 3, g);
    src.connect(bp);
    fs.forEach((f, i) => { if (i) bp.frequency.linearRampToValueAtTime(f[k] * scale, t + (dur * i) / (fs.length - 1 || 1)); });
  });
  S.env(out.gain, t, { a: 0.03, d: dur * 0.5, s: 0.7, r: dur * 0.3, peak, hold: dur * 0.75 });
  S.track(t, dur, 14);
  return dur;
}

export function creatureVoice(S, t, { kind = 'boar', size = 1, mood = 'grunt', dest: out = S.sfx.input } = {}) {
  const r = S.rng;
  const dest = S.gain(2.4, out);   // formant filters are narrow; this brings voices up to the other sounds
  if (kind === 'boar') {
    // two snout grunts and a wet snort: low, raspy, closed-mouth shapes
    const f = 78 / size;
    let tt = t;
    const n = mood === 'aggro' ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const d = r.range(0.2, 0.3) * (i === n - 1 ? 1.3 : 1);
      voice(S, tt, { f0: f * r.range(0.95, 1.15), f0End: f * 0.75, dur: d, shapes: ['u', 'o', 'u'], scale: 0.85 / Math.sqrt(size), breath: 0.35, rasp: 0.9, peak: 0.85, dest });
      tt += d + r.range(0.06, 0.12);
    }
    // snort: nasal noise burst
    const g = S.gain(0, dest); const bp = S.filter('bandpass', 1400, 1.5, g); S.noise(tt, 0.3, bp);
    bp.frequency.setValueAtTime(1800, tt); bp.frequency.exponentialRampToValueAtTime(700, tt + 0.22);
    S.env(g.gain, tt, { a: 0.01, d: 0.18, s: 0, r: 0.05, peak: 0.55 });
    if (mood === 'pain') voice(S, tt + 0.2, { f0: 300, f0End: 180, dur: 0.35, shapes: ['ih', 'e'], scale: 1, breath: 0.2, rasp: 0.5, peak: 0.5, dest });
    return tt + 0.3 - t;
  }
  if (kind === 'wolf') return voice(S, t, { f0: 160 / size, f0End: 120 / size, dur: 0.5, shapes: ['a', 'o'], breath: 0.4, rasp: 0.7, peak: 0.6, dest });
  return voice(S, t, { f0: 420 / size, f0End: 520 / size, dur: 0.18, shapes: ['ih', 'e'], breath: 0.2, rasp: 0.2, peak: 0.4, dest });
}

/** Non-word NPC vocal bark: a short pitched exclamation shaped by mouth formants, like a hum or a call. */
export function bark(S, t, { voice: v = 0.5, shape = 'hey', dest: out = S.sfx.input } = {}) {
  const dest = S.gain(3, out);
  const f0 = 120 + v * 120;
  const scale = 1 + v * 0.12;
  const shapes = { hey: ['e', 'ih'], hm: ['m', 'm'], oh: ['o', 'a', 'o'], ha: ['a', 'a'] }[shape] || ['e', 'a'];
  const contour = { hey: [1, 1.18], hm: [1.05, 0.92], oh: [0.95, 1.25], ha: [1.2, 0.9] }[shape] || [1, 1];
  // breathy onset
  const g = S.gain(0, dest); const bp = S.filter('bandpass', 1800 * scale, 1, g); S.noise(t, 0.08, bp);
  S.env(g.gain, t, { a: 0.01, d: 0.05, s: 0, r: 0.02, peak: shape === 'hm' ? 0.05 : 0.22 });
  const dur = shape === 'hm' ? 0.34 : 0.3;
  return voice(S, t + 0.04, { f0: f0 * contour[0], f0End: f0 * contour[1], dur, shapes, scale, breath: 0.08, vib: 0.01, peak: shape === 'hm' ? 0.35 : 0.5, dest }) + 0.04;
}

/** A random-walk pitch curve for friction sounds (creaks). */
function walk(S, n, lo, hi) {
  const c = new Float32Array(n); let v = (lo + hi) / 2;
  for (let i = 0; i < n; i++) { v += S.rng.range(-1, 1) * (hi - lo) * 0.18; v = Math.min(hi, Math.max(lo, v)); c[i] = v; }
  return c;
}

/** Wood hinge creak: a stick-slip pulse train whose rate wanders, ringing through narrow wood resonances. */
function creak(S, t, dur, { lo = 18, hi = 55, level = 0.5, dest }) {
  const out = S.gain(0, dest);
  const o = S.osc('sawtooth', (lo + hi) / 2, t, dur, null);
  o.frequency.setValueCurveAtTime(walk(S, 24, lo, hi), t, dur);
  for (const [f, q, lv] of [[640, 12, 1], [1350, 14, 0.6], [2300, 10, 0.3]]) {
    const g = S.gain(lv, out); const bp = S.filter('bandpass', f * S.rng.range(0.92, 1.08), q, g); o.connect(bp);
  }
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(level, t + dur * 0.2);
  out.gain.setValueAtTime(level, t + dur * 0.7); out.gain.linearRampToValueAtTime(0, t + dur);
  S.track(t, dur, 8);
}

function thud(S, t, { f = 80, level = 0.8, dest }) {
  const g = S.gain(0, dest); const o = S.osc('sine', f * 1.6, t, 0.4, g);
  o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.12);
  S.env(g.gain, t, { a: 0.002, d: 0.22, s: 0, r: 0.05, peak: level });
  const ng = S.gain(0, dest); const lp = S.filter('lowpass', 600, 0.7, ng); S.noise(t, 0.2, lp);
  S.env(ng.gain, t, { a: 0.002, d: 0.08, s: 0, r: 0.03, peak: level * 0.5 });
  S.track(t, 0.4, 6);
}

function click(S, t, { f = 3500, level = 0.4, dest }) {
  const g = S.gain(0, dest); const bp = S.filter('bandpass', f, 4, g); S.noise(t, 0.04, bp);
  S.env(g.gain, t, { a: 0.0005, d: 0.012, s: 0, r: 0.005, peak: level });
  S.track(t, 0.04, 3);
}

export function door(S, t, { heavy = 1, dest = S.sfx.input } = {}) {
  click(S, t, { f: 2600, level: 0.5, dest });
  click(S, t + 0.05, { f: 1900, level: 0.35, dest });
  creak(S, t + 0.12, 1.1, { lo: 16 / heavy, hi: 48 / heavy, level: 0.3, dest });
  thud(S, t + 1.55, { f: 70 / heavy, level: 0.5, dest });
  click(S, t + 1.58, { f: 2200, level: 0.3, dest });
  return 1.9;
}

export function chest(S, t, { dest = S.sfx.input } = {}) {
  click(S, t, { f: 4200, level: 0.45, dest });
  click(S, t + 0.09, { f: 3600, level: 0.4, dest });
  creak(S, t + 0.18, 0.55, { lo: 35, hi: 80, level: 0.3, dest });
  thud(S, t + 0.78, { f: 110, level: 0.45, dest });
  // a small rising sparkle: a reward, not a fanfare
  const g = S.gain(0.9, dest);
  [79, 83, 86, 91].forEach((m, i) => bell(S, t + 0.85 + i * 0.07, m, 0.4, 0.55, g, { ratio: 4, index: 1.4, decay: 1.1 }));
  return 2.0;
}

export function fire(S, t, { dur = 4, dest = S.sfx.input } = {}) {
  const r = S.rng;
  const out = S.gain(0, dest);
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(1.6, t + 0.8);
  out.gain.setValueAtTime(1.6, t + dur - 0.9); out.gain.linearRampToValueAtTime(0, t + dur);
  // roar: low noise that breathes
  const rg = S.gain(0.32, out); const lp = S.filter('lowpass', 380, 0.5, rg); S.noise(t, dur, lp, { rate: 0.5 });
  const breathe = S.osc('sine', 0.35, t, dur, S.gain(0.12, rg.gain)); void breathe;
  // hiss
  const hg = S.gain(0.035, out); const hp = S.filter('highpass', 4500, 0.5, hg); S.noise(t, dur, hp);
  // crackles and pops
  let tt = t + 0.1;
  while (tt < t + dur - 0.1) {
    const pop = r.chance(0.12);
    const g = S.gain(0, out); const bp = S.filter('bandpass', r.range(1200, 5200), r.range(0.8, 3), g);
    S.noise(tt, 0.05, bp);
    S.env(g.gain, tt, { a: 0.0005, d: pop ? 0.03 : r.range(0.004, 0.014), s: 0, r: 0.005, peak: pop ? 1.1 : r.range(0.2, 0.7) });
    S.track(tt, 0.05, 3);
    tt += -Math.log(1 - r()) / 14;   // about 14 a second, at random
  }
  S.track(t, dur, 10);
  return dur;
}

export function water(S, t, { dur = 3, size = 1, dest = S.sfx.input } = {}) {
  const r = S.rng;
  const out = S.gain(0, dest);
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.5 * size, t + 0.6);
  out.gain.setValueAtTime(0.5 * size, t + dur - 0.6); out.gain.linearRampToValueAtTime(0, t + dur);
  // flow: noise through a bandpass whose centre wanders
  const bp = S.filter('bandpass', 900, 0.8, out); S.noise(t, dur, bp);
  bp.frequency.setValueCurveAtTime(walk(S, 16, 500, 1600), t, dur);
  // bubbles: short sine chirps that rise
  let tt = t + 0.1;
  while (tt < t + dur - 0.2) {
    const f = r.range(500, 1400) / size;
    const g = S.gain(0, out); const o = S.osc('sine', f, tt, 0.08, g);
    o.frequency.exponentialRampToValueAtTime(f * r.range(1.6, 2.4), tt + 0.05);
    S.env(g.gain, tt, { a: 0.002, d: 0.03, s: 0, r: 0.01, peak: r.range(0.1, 0.3) });
    S.track(tt, 0.08, 3);
    tt += -Math.log(1 - r()) / 10;
  }
  return dur;
}

const SCHOOL = { ink: { base: 55, color: 0.6 }, fire: { base: 50, color: 1 }, light: { base: 67, color: 0.3 } };

/** Spell: a charge that rises and shimmers, then the release. Returns the release time (where impact belongs). */
export function spell(S, t, { school = 'ink', charge = 1.1, dest = S.sfx.input } = {}) {
  const sc = SCHOOL[school] || SCHOOL.ink;
  const out = S.gain(0, dest);
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.15, t + charge);
  out.gain.setTargetAtTime(0, t + charge, 0.05);
  const f0 = midiToHz(sc.base), f1 = midiToHz(sc.base + 19);
  for (const det of [-9, 9]) {
    const o = S.osc('triangle', f0, t, charge + 0.2, out); o.detune.value = det;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + charge);
    const trem = S.osc('sine', 6, t, charge, S.gain(0.06, out.gain)); trem.frequency.linearRampToValueAtTime(18, t + charge);
  }
  // breathy rising sweep
  const ng = S.gain(0, dest); const bp = S.filter('bandpass', 600, 3, ng); S.noise(t, charge + 0.6, bp);
  bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(4000, t + charge);
  bp.frequency.exponentialRampToValueAtTime(700, t + charge + 0.45);
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.08 * sc.color + 0.03, t + charge);
  ng.gain.linearRampToValueAtTime(0.22, t + charge + 0.05); ng.gain.setTargetAtTime(0, t + charge + 0.08, 0.12);
  // release: a quick downward zip
  const zg = S.gain(0, dest); const z = S.osc('sawtooth', f1 * 2, t + charge, 0.3, S.filter('lowpass', 3000, 1, zg));
  z.frequency.setValueAtTime(f1 * 2, t + charge); z.frequency.exponentialRampToValueAtTime(f0, t + charge + 0.22);
  S.env(zg.gain, t + charge, { a: 0.003, d: 0.18, s: 0, r: 0.04, peak: 0.08 });
  S.track(t, charge + 0.6, 22);
  return charge;
}

export function impact(S, t, { power: p0 = 1, dest = S.sfx.input } = {}) {
  const power = p0 * 0.7;
  thud(S, t, { f: 60, level: 0.95 * power, dest });
  const ng = S.gain(0, dest); const lp = S.filter('lowpass', 5000, 0.7, ng); S.noise(t, 0.5, lp);
  lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(400, t + 0.35);
  S.env(ng.gain, t, { a: 0.001, d: 0.2, s: 0, r: 0.08, peak: 0.6 * power });
  // a short glassy ring (inharmonic partials) so magic reads as magic
  for (const [f, lv] of [[523, 0.12], [1187, 0.08], [1871, 0.05]]) {
    const g = S.gain(0, dest); S.osc('sine', f, t, 0.8, g);
    S.env(g.gain, t, { a: 0.001, d: 0.6, s: 0, r: 0.1, peak: lv * power });
  }
  S.track(t, 0.8, 14);
  return 0.8;
}

export const SFX = { footstep, creatureVoice, bark, door, chest, fire, water, spell, impact };

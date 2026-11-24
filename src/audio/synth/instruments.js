// Lexicon Realms synth: instruments. Each is play(S, t, midi, dur, vel, dest) and schedules one note on the core S
// (core.js). Original timbres built from oscillators, noise and filters; none imitates a sampled instrument library
// or another game's sound. The node count per note is the CPU cost (S.track records it).
import { midiToHz } from './core.js';

/** Plucked harp-like string: triangle plus a soft octave, a lowpass that closes as it decays. 5 nodes. */
export function harp(S, t, m, dur, vel, dest) {
  const f = midiToHz(m);
  const g = S.gain(0, dest);
  const lp = S.filter('lowpass', 4200, 0.5, g);
  S.osc('triangle', f, t, dur + 1.4, lp);
  const o2g = S.gain(0.22, lp); S.osc('sine', f * 2, t, dur + 1.4, o2g);
  lp.frequency.setValueAtTime(5200, t); lp.frequency.setTargetAtTime(900, t, 0.35);
  const end = S.env(g.gain, t, { a: 0.004, d: 1.3, s: 0, r: 0.3, peak: 0.32 * vel });
  S.track(t, end - t, 5);
}

/** Soft breathy lead (a wooden flute of our own): sine and triangle, delayed vibrato, a little breath noise. 9 nodes. */
export function flute(S, t, m, dur, vel, dest) {
  const f = midiToHz(m);
  const g = S.gain(0, dest);
  const o1 = S.osc('sine', f, t, dur + 0.4, g);
  const o2g = S.gain(0.28, g); const o2 = S.osc('triangle', f, t, dur + 0.4, o2g);
  const lfo = S.ctx.createOscillator(); lfo.frequency.value = 4.8 + S.rng() * 0.6;
  const depth = S.gain(0, null); lfo.connect(depth); depth.connect(o1.frequency); depth.connect(o2.frequency);
  depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.6, dur));
  lfo.start(t); lfo.stop(t + dur + 0.4);
  const bg = S.gain(0, g); const bp = S.filter('bandpass', f * 2.2, 1.4, bg); S.noise(t, dur + 0.3, bp);
  S.env(bg.gain, t, { a: 0.03, d: 0.15, s: 0.25, r: 0.1, peak: 0.5, hold: dur });
  const end = S.env(g.gain, t, { a: 0.06, d: 0.2, s: 0.8, r: 0.22, peak: 0.26 * vel, hold: dur });
  S.track(t, end - t, 9);
}

/** Warm pad: three detuned saws through a slow lowpass. bright 0..1 opens the filter (day) or keeps it dark (night). 7 nodes. */
export function pad(S, t, m, dur, vel, dest, { bright = 0.5 } = {}) {
  const f = midiToHz(m);
  const g = S.gain(0, dest);
  const lp = S.filter('lowpass', 500 + 1100 * bright, 0.3, g);
  for (const c of [-7, 0, 6]) { const o = S.osc('sawtooth', f, t, dur + 2.2, lp); o.detune.value = c; }
  const end = S.env(g.gain, t, { a: Math.min(1.4, dur * 0.4), d: 0.6, s: 0.85, r: 1.8, peak: 0.055 * vel, hold: dur });
  S.track(t, end - t, 7);
}

/** Round bass: triangle with a quick filter thump. 4 nodes. */
export function bass(S, t, m, dur, vel, dest) {
  const f = midiToHz(m);
  const g = S.gain(0, dest);
  const lp = S.filter('lowpass', 700, 0.4, g);
  S.osc('triangle', f, t, dur + 0.5, lp);
  lp.frequency.setValueAtTime(1100, t); lp.frequency.setTargetAtTime(380, t, 0.12);
  const end = S.env(g.gain, t, { a: 0.008, d: 0.5, s: 0.55, r: 0.25, peak: 0.42 * vel, hold: dur });
  S.track(t, end - t, 4);
}

/** Glass bell (two-operator FM): night melody and the chest sparkle. 5 nodes. */
export function bell(S, t, m, dur, vel, dest, { ratio = 3.5, index = 2.2, decay = 2.4 } = {}) {
  const f = midiToHz(m);
  const g = S.gain(0, dest);
  const car = S.osc('sine', f, t, decay + 0.5, g);
  const mg = S.gain(0, null); mg.connect(car.frequency);
  S.osc('sine', f * ratio, t, decay + 0.5, mg);
  mg.gain.setValueAtTime(f * index, t); mg.gain.setTargetAtTime(f * 0.15, t, decay * 0.18);
  const end = S.env(g.gain, t, { a: 0.003, d: decay, s: 0, r: 0.3, peak: 0.2 * vel });
  S.track(t, end - t, 5);
}

/** Horn-like brass for the combat layer: two saws, the filter swells open with the note. 6 nodes. */
export function brass(S, t, m, dur, vel, dest) {
  const f = midiToHz(m);
  const g = S.gain(0, dest);
  const lp = S.filter('lowpass', 400, 1.5, g);
  const a = S.osc('sawtooth', f, t, dur + 0.4, lp); a.detune.value = -5;
  const b = S.osc('sawtooth', f, t, dur + 0.4, lp); b.detune.value = 5;
  lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(1500 + 700 * vel, t + 0.12);
  lp.frequency.setTargetAtTime(900, t + 0.12, 0.25);
  const end = S.env(g.gain, t, { a: 0.05, d: 0.3, s: 0.7, r: 0.18, peak: 0.12 * vel, hold: dur });
  S.track(t, end - t, 6);
}

/** Bowed ostinato for combat: a short saw stab through a bandpass. 4 nodes. */
export function ostinato(S, t, m, dur, vel, dest) {
  const f = midiToHz(m);
  const g = S.gain(0, dest);
  const lp = S.filter('lowpass', 1400, 1, g);
  S.osc('sawtooth', f, t, dur + 0.2, lp);
  const end = S.env(g.gain, t, { a: 0.012, d: 0.12, s: 0.4, r: 0.08, peak: 0.11 * vel, hold: dur * 0.8 });
  S.track(t, end - t, 4);
}

/** Frame drum: a pitched sine thump plus a skin slap. 6 nodes. */
export function frameDrum(S, t, vel, dest, { pitch = 1 } = {}) {
  const g = S.gain(0, dest);
  const o = S.osc('sine', 150 * pitch, t, 0.5, g);
  o.frequency.setValueAtTime(150 * pitch, t); o.frequency.exponentialRampToValueAtTime(62 * pitch, t + 0.09);
  S.env(g.gain, t, { a: 0.002, d: 0.32, s: 0, r: 0.1, peak: 0.5 * vel });
  const ng = S.gain(0, dest); const bp = S.filter('bandpass', 1300, 1.2, ng); S.noise(t, 0.08, bp);
  S.env(ng.gain, t, { a: 0.001, d: 0.035, s: 0, r: 0.02, peak: 0.16 * vel });
  S.track(t, 0.4, 6);
}

/** Low war drum for combat: deep sine drop and a lowpassed noise body. 6 nodes. */
export function warDrum(S, t, vel, dest) {
  const g = S.gain(0, dest);
  const o = S.osc('sine', 96, t, 0.9, g);
  o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  S.env(g.gain, t, { a: 0.002, d: 0.6, s: 0, r: 0.15, peak: 0.75 * vel });
  const ng = S.gain(0, dest); const lp = S.filter('lowpass', 420, 0.7, ng); S.noise(t, 0.25, lp);
  S.env(ng.gain, t, { a: 0.002, d: 0.12, s: 0, r: 0.05, peak: 0.35 * vel });
  S.track(t, 0.8, 6);
}

/** Rim and skin snap for combat backbeats. 5 nodes. */
export function snap(S, t, vel, dest) {
  const ng = S.gain(0, dest); const bp = S.filter('bandpass', 1900, 0.9, ng); S.noise(t, 0.2, bp);
  S.env(ng.gain, t, { a: 0.001, d: 0.11, s: 0, r: 0.05, peak: 0.3 * vel });
  const g = S.gain(0, dest); S.osc('triangle', 210, t, 0.12, g);
  S.env(g.gain, t, { a: 0.001, d: 0.05, s: 0, r: 0.02, peak: 0.18 * vel });
  S.track(t, 0.2, 5);
}

/** Seed shaker: a short burst of bright noise. 3 nodes. */
export function shaker(S, t, vel, dest) {
  const ng = S.gain(0, dest); const hp = S.filter('highpass', 6500, 0.7, ng); S.noise(t, 0.09, hp);
  S.env(ng.gain, t, { a: 0.012, d: 0.045, s: 0, r: 0.03, peak: 0.07 * vel });
  S.track(t, 0.09, 3);
}

/** A night cricket: a fast-chirping high sine. Ambience inside the night layer. 4 nodes. */
export function cricket(S, t, vel, dest, { pitch = 4300, chirps = 3 } = {}) {
  const g = S.gain(0, dest);
  const o = S.osc('sine', pitch, t, chirps * 0.07 + 0.1, g);
  const am = S.gain(0, null); am.connect(g.gain);
  const lfo = S.osc('square', 1 / 0.07, t, chirps * 0.07, am);
  am.gain.value = 0.012 * vel;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012 * vel, t + 0.01);
  g.gain.setValueAtTime(0.012 * vel, t + chirps * 0.07); g.gain.linearRampToValueAtTime(0, t + chirps * 0.07 + 0.03);
  void o; void lfo;
  S.track(t, chirps * 0.07 + 0.05, 4);
}

export const INSTRUMENTS = { harp, flute, pad, bass, bell, brass, ostinato, frameDrum, warDrum, snap, shaker, cricket };

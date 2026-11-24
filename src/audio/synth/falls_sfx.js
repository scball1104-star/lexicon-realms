// Water kit sound (wave 7): a waterfall, built from the synth core like sfx.js water(). No samples.
//   falls(S, t, { dur, size, loop, dest })   a low roar (lowpassed noise), the body of falling water (a bandpass whose
//   centre wanders), a bright hiss of spray, and bubbles from the pool. Rendered as a seamless loop ('loop:falls') like
//   'loop:water'; synth_game.js plays it by distance to each falls foot (water_sound.js, 14 tiles), and the existing brook
//   loop (6 tiles) keeps running for rivers and tarns.
import { SFX } from './sfx.js';

function walk(S, n, lo, hi) {
  const c = new Float32Array(n); let v = (lo + hi) / 2;
  for (let i = 0; i < n; i++) { v += S.rng.range(-1, 1) * (hi - lo) * 0.18; v = Math.min(hi, Math.max(lo, v)); c[i] = v; }
  return c;
}

export function falls(S, t, { dur = 8, size = 1.6, loop = true, dest = S.sfx.input } = {}) {
  const out = S.gain(loop ? 0.6 : 0, dest);
  if (!loop) { out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.6, t + 0.8); out.gain.setValueAtTime(0.6, t + dur - 0.8); out.gain.linearRampToValueAtTime(0, t + dur); }
  // roar: deep, slow-breathing rumble
  const lp = S.filter('lowpass', 260, 0.6, S.gain(0.9, out)); S.noise(t, dur, lp);
  lp.frequency.setValueCurveAtTime(walk(S, 10, 180, 340), t, dur);
  // body: the curtain itself
  const bp = S.filter('bandpass', 800, 0.55, S.gain(0.55, out)); S.noise(t, dur, bp);
  bp.frequency.setValueCurveAtTime(walk(S, 24, 550, 1300), t, dur);
  // hiss: spray
  const hp = S.filter('highpass', 3200, 0.5, S.gain(0.12, out)); S.noise(t, dur, hp);
  // the pool: the brook recipe, lower and fuller
  SFX.water(S, t, { dur, size, loop: true, dest: S.gain(0.5, out) });
  S.track(t, dur, 12);
  return dur;
}

// Lexicon Realms synth: the building blocks. No samples, no impulse files: everything here is oscillators, generated
// noise, filters, gains and delays. Works the same on an AudioContext (live) and an OfflineAudioContext (renders).
//
//   const S = createCore(ctx, { seed })
//   S.master            final bus (headroom, then a soft clipper, then ctx.destination)
//   S.music / S.sfx     sub buses into the master, each with a send to the shared reverb
//   S.reverb            { input, setDecay(sec) } a feedback delay network (no convolution)
//   S.noise(t, dur, dest, opts)   plays a slice of seeded white noise, returns the source
//   S.osc(type, freq, t, dur, dest)  plays an oscillator, returns it
//   S.env(param, t, { a, d, s, r, peak, hold })  ADSR on any AudioParam
//   S.stats             { voices, peakVoices, nodes } counted as notes are scheduled (CPU budget, QA)
import { makeRng } from './rng.js';

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (db) => Math.pow(10, db / 20);

/**
 * Reverb without convolution: a feedback delay network with six delay lines, each with a damping lowpass in its
 * loop (a diagonal feedback matrix), fed through two allpass diffusers, mixed to stereo by fixed +-1 taps.
 * About 40 nodes, made once per context.
 *
 * Why diagonal: in Chromium (tested 2026-11-24) delay loops that feed each other (a Hadamard or 2x2 rotation
 * matrix) grew without bound even with loop gains under 1, while single loops decay exactly as the maths says.
 * Every loop here is a single loop, so it is stable by construction.
 */
export function createFdnReverb(ctx, { decay = 2.4, damp = 5200, size = 1, preDelay = 0.022, wet = 1 } = {}) {
  const input = ctx.createGain();
  const lowcut = ctx.createBiquadFilter();
  lowcut.type = 'highpass'; lowcut.frequency.value = 220; lowcut.Q.value = -3;
  const pre = ctx.createDelay(0.2); pre.delayTime.value = preDelay;
  input.connect(lowcut); lowcut.connect(pre);
  // two allpass diffusers in series: v = x + g*v(n-D), y = -g*v + v(n-D)
  let node = pre;
  for (const [d, g] of [[0.0051, 0.6], [0.0127, 0.55]]) {
    const sum = ctx.createGain(); const dl = ctx.createDelay(0.1); dl.delayTime.value = d;
    const fbk = ctx.createGain(); fbk.gain.value = g;
    const ff = ctx.createGain(); ff.gain.value = -g;
    const out = ctx.createGain();
    node.connect(sum); sum.connect(dl); dl.connect(fbk); fbk.connect(sum);
    sum.connect(ff); ff.connect(out); dl.connect(out);
    node = out;
  }
  const out = ctx.createGain(); out.gain.value = wet;
  const merger = ctx.createChannelMerger(2);
  merger.connect(out);
  const base = [0.0353, 0.0411, 0.0467, 0.0523, 0.0571, 0.0617].map((d) => d * size);
  const SIGN_L = [1, -1, 1, 1, -1, 1], SIGN_R = [1, 1, -1, 1, 1, -1];
  const loops = [];
  for (let i = 0; i < base.length; i++) {
    const sum = ctx.createGain();
    const d = ctx.createDelay(1); d.delayTime.value = base[i];
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = damp; lp.Q.value = -3;
    const g = ctx.createGain();
    node.connect(sum); sum.connect(d); d.connect(lp); lp.connect(g); g.connect(sum);
    const tl = ctx.createGain(); tl.gain.value = 0.3 * SIGN_L[i]; lp.connect(tl); tl.connect(merger, 0, 0);
    const tr = ctx.createGain(); tr.gain.value = 0.3 * SIGN_R[i]; lp.connect(tr); tr.connect(merger, 0, 1);
    loops.push(g);
  }
  const setDecay = (sec) => {
    const t60 = Math.max(0.2, sec);
    loops.forEach((g, i) => { g.gain.value = Math.pow(10, (-3 * base[i]) / t60); });
  };
  setDecay(decay);
  return { input, output: out, setDecay };
}

export function createCore(ctx, { seed = 1, reverbDecay = 2.4 } = {}) {
  const rng = makeRng(seed);
  const stats = { voices: 0, peakVoices: 0, notes: 0, nodes: 0, ends: [] };

  // master: headroom, then a soft clipper (tanh) as a safety net. No DynamicsCompressor: its automatic makeup gain
  // makes levels unpredictable from browser to browser. Mix levels are set so normal play never reaches the clipper.
  const master = ctx.createGain(); master.gain.value = 0.6;
  const clip = ctx.createWaveShaper();
  // linear up to 0.6 of full scale, then a smooth knee that never passes 1.0; the curve spans -2..2 at its input
  { const n = 4096, c = new Float32Array(n); for (let i = 0; i < n; i++) { const v = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(v); c[i] = Math.sign(v) * (a < 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4)); } clip.curve = c; clip.oversample = '2x'; }
  const pre = ctx.createGain(); pre.gain.value = 0.5;
  const post = ctx.createGain(); post.gain.value = 1;
  master.connect(pre); pre.connect(clip); clip.connect(post); post.connect(ctx.destination);

  const reverb = createFdnReverb(ctx, { decay: reverbDecay });
  reverb.output.connect(master);

  const bus = (sendLevel) => {
    const g = ctx.createGain(); g.connect(master);
    const send = ctx.createGain(); send.gain.value = sendLevel; g.connect(send); send.connect(reverb.input);
    return { input: g, gain: g.gain, send: send.gain };
  };
  const music = bus(0.32);
  const sfx = bus(0.14);

  // 3 s of seeded white noise, made once; every noisy sound plays a random slice of it
  const NOISE_SEC = 3;
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SEC), ctx.sampleRate);
  { const d = noiseBuf.getChannelData(0); const nr = makeRng(seed ^ 0x9e3779b9); for (let i = 0; i < d.length; i++) d[i] = nr() * 2 - 1; }

  const track = (t, dur, nodes) => {
    stats.notes++; stats.nodes += nodes;
    // count overlapping voices: drop ended ones, add this one
    const end = t + dur;
    stats.ends = stats.ends.filter((e) => e > t);
    stats.ends.push(end);
    if (stats.ends.length > stats.peakVoices) stats.peakVoices = stats.ends.length;
  };

  const osc = (type, freq, t, dur, dest) => {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (dest) o.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    o.onended = () => o.disconnect();   // lets the browser drop the note's filters and gains once it ends
    return o;
  };

  const noise = (t, dur, dest, { rate = 1 } = {}) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = rate;
    if (dest) s.connect(dest);
    s.start(t, rng() * (NOISE_SEC - 0.5)); s.stop(t + dur + 0.05);
    s.onended = () => s.disconnect();
    return s;
  };

  /** ADSR. a, d, r in seconds; s is the sustain level as a fraction of peak; hold is the time from t to release. */
  const env = (param, t, { a = 0.005, d = 0.1, s = 0, r = 0.1, peak = 1, hold = null, from = 0 } = {}) => {
    const sus = Math.max(peak * s, 0.0001);
    param.cancelScheduledValues(t);
    param.setValueAtTime(from, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(sus, t + a, Math.max(d, 0.001) / 3);
    const relAt = hold == null ? t + a + d : t + Math.max(hold, a);
    param.setTargetAtTime(0, relAt, Math.max(r, 0.001) / 4);
    return relAt + r;
  };

  const gain = (v, dest) => { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
  const filter = (type, freq, q, dest) => {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q == null ? 0.7 : q;
    if (dest) f.connect(dest); return f;
  };
  const pan = (v, dest) => {
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = v; if (dest) p.connect(dest); return p;
  };

  return { ctx, rng, master, music, sfx, reverb, noise, osc, env, gain, filter, pan, track, stats, midiToHz };
}

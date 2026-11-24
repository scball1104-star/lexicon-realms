// Lexicon Realms synth: the music sequencer. One theme, three layers that share a clock so they can crossfade at
// any moment: explore (harp, flute, bass, pad, light drums), combat (war drums, ostinato, brass doubling the tune)
// and night (bell tune, dark pad, sparse harp, crickets).
//
//   const seq = createSequencer(S, theme, { night: false })
//   seq.setMix({ explore: 1, combat: 0, night: 0 }, atTime, rampSec)
//   seq.scheduleBar(plan, t)        plan = { h, mel, perc, final }; returns the bar length in seconds
//   seq.render(arrangement, t0, mixes)   offline: a whole list of bar plans, each scheduled just ahead; returns end time
//   seq.play(arrangement, { loop })      live: a 0.4 s lookahead scheduler on a timer; seq.stop(fade)
//
// A layer whose gain is 0 and is not fading in is not scheduled at all, so combat costs nothing while exploring.
import { makeTheme, degToMidi, chordTones } from './motif.js';
import * as I from './instruments.js';

export function createSequencer(S, theme, { night = false, crickets = true, seedSalt = 'seq' } = {}) {
  const ctx = S.ctx;
  const rng = S.rng;
  const th = makeTheme({ seed: theme.seed, beats: theme.beats, mode: theme.dayMode });
  const eighth = theme.eighth / (night ? theme.nightTempo : 1);
  const barLen = eighth * theme.beats;
  const T = theme.tonic;
  const dayMode = theme.dayMode, nightMode = theme.nightMode;
  void seedSalt;

  const layers = {};
  const mixNow = { explore: 1, combat: 0, night: 0 };
  for (const k of ['explore', 'combat', 'night']) {
    const g = ctx.createGain(); g.gain.value = mixNow[k]; g.connect(S.music.input);
    layers[k] = g;
  }
  // per part bus: level and pan, into its layer
  const partBus = (layer, db, panV) => {
    const g = S.gain(Math.pow(10, db / 20), null);
    const p = S.pan(panV, layers[layer]); g.connect(p);
    return g;
  };
  const P = {
    harp: partBus('explore', 0, -0.25),
    flute: partBus('explore', 0, 0.12),
    bass: partBus('explore', -1, 0),
    pad: partBus('explore', 0, 0),
    drum: partBus('explore', -3, 0.05),
    shaker: partBus('explore', -2, 0.35),
    war: partBus('combat', 4, 0),
    snap: partBus('combat', 1, -0.15),
    ost: partBus('combat', 3, -0.3),
    brass: partBus('combat', 2, 0.25),
    bell: partBus('night', 0, 0.15),
    npad: partBus('night', 0, 0),
    nharp: partBus('night', -2, -0.3),
    nbass: partBus('night', -2, 0),
    cricket: partBus('night', 0, 0.5),
  };

  const mixTarget = { ...mixNow };
  const setMix = (mix, t = ctx.currentTime, ramp = 1.5) => {
    for (const k of Object.keys(mix)) {
      if (!layers[k]) continue;
      const g = layers[k].gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(mixTarget[k], t);
      g.linearRampToValueAtTime(mix[k], t + Math.max(0.01, ramp));
      mixTarget[k] = mix[k];
    }
  };
  // a layer is live in a bar if it is audible at either end of it
  const liveAt = (k, mixA, mixB) => (mixA[k] || 0) > 0.001 || (mixB[k] || 0) > 0.001;

  const hum = () => rng.range(-0.006, 0.006);
  const vel = (v) => v * rng.range(0.88, 1.04);
  const fold = (m, lo, hi) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };

  function scheduleBar(plan, t, mixA = mixTarget, mixB = mixTarget) {
    const root = th.chords[plan.h];
    const mode = plan.mode || (night ? nightMode : dayMode);
    const mel = plan.mel ? th.melody[plan.h] : null;
    const hint = !mel && plan.hint ? th.melody[plan.h] : null;   // the tune, half-heard, inside a texture section
    const at = (step) => t + step * eighth;
    const ct = chordTones(root);
    const midi = (deg, base) => degToMidi(deg, base, mode);
    const holdBars = plan.final ? 2.2 : 1;

    if (liveAt('explore', mixA, mixB)) {
      // pad: close voicing between G3 and G4
      for (const d of ct) I.pad(S, t, fold(midi(d, T - 12), 55, 67), barLen * holdBars, 1, P.pad, { bright: 0.55 });
      // bass
      I.bass(S, at(0), midi(root, T - 24), eighth * (plan.final ? 6 : 2.6), vel(0.9), P.bass);
      if (!plan.final) I.bass(S, at(3), midi(rng.chance(0.5) ? root + 4 : root, T - 24), eighth * 2.6, vel(0.7), P.bass);
      // harp arpeggio, or a rolled chord at the end
      if (plan.final) {
        [root, root + 2, root + 4, root + 7, root + 9].forEach((d, i) => I.harp(S, t + i * 0.07, midi(d, T - 12), barLen, 0.9, P.harp));
      } else {
        const pat = plan.h % 2 ? [root, root + 4, root + 7, root + 9, root + 11, root + 7] : [root, root + 4, root + 9, root + 7, root + 4, root + 2];
        pat.forEach((d, s) => I.harp(S, at(s) + hum(), midi(d, T - 12), eighth, vel(s === 0 ? 0.95 : 0.7), P.harp));
      }
      if (mel) for (const n of mel) I.flute(S, at(n.step) + hum(), midi(n.deg, T + 12), n.len * eighth * 0.94, vel(0.95), P.flute);
      if (hint) for (const n of hint) if (n.step % 3 === 0) I.bell(S, at(n.step) + hum(), midi(n.deg, T + 12), n.len * eighth, vel(0.45), P.flute, { decay: 1.6, index: 1.2 });
      if (plan.perc) {
        I.frameDrum(S, at(0), vel(0.8), P.drum);
        if (!plan.final) {
          I.frameDrum(S, at(3), vel(0.5), P.drum, { pitch: 1.1 });
          I.frameDrum(S, at(5), vel(0.28), P.drum, { pitch: 1.25 });
          for (const s of [1, 2, 4, 5]) I.shaker(S, at(s) + hum(), vel(s === 4 ? 0.9 : 0.6), P.shaker);
        }
      }
    }
    if (liveAt('combat', mixA, mixB)) {
      I.warDrum(S, at(0), vel(1), P.war);
      if (!plan.final) {
        I.warDrum(S, at(3), vel(0.75), P.war);
        I.warDrum(S, at(5), vel(0.45), P.war);
        if (plan.h % 2) I.warDrum(S, at(2), vel(0.4), P.war);
        I.snap(S, at(3), vel(0.9), P.snap);
        if (plan.h % 2) I.snap(S, at(5) + eighth * 0.5, vel(0.4), P.snap);
        [root, root, root + 4, root, root + 7, root + 4].forEach((d, s) => I.ostinato(S, at(s), midi(d, T - 12), eighth, vel(s % 3 === 0 ? 1 : 0.7), P.ost));
      }
      if (mel) for (const n of mel) I.brass(S, at(n.step), midi(n.deg, T), n.len * eighth * 0.9, vel(0.9), P.brass);
      else for (const d of [root, root + 2]) I.brass(S, at(0), midi(d, T - 12), barLen * 0.5, 0.8, P.brass);
    }
    if (liveAt('night', mixA, mixB)) {
      for (const d of ct) I.pad(S, t, fold(midi(d, T - 12), 52, 64), barLen * holdBars, 0.9, P.npad, { bright: 0.12 });
      I.bass(S, at(0), midi(root, T - 24), barLen * (plan.final ? 2 : 0.95), vel(0.6), P.nbass);
      if (mel) for (const n of mel) I.bell(S, at(n.step) + hum(), midi(n.deg, T + 12), n.len * eighth, vel(n.step % 3 === 0 ? 0.85 : 0.55), P.bell, { decay: 2.2 });
      if (hint) for (const n of hint) if (n.step % 3 === 0) I.bell(S, at(n.step) + hum(), midi(n.deg, T + 12), n.len * eighth, vel(0.4), P.bell, { decay: 2 });
      if (!plan.final) for (const s of [0, 3]) I.harp(S, at(s) + 0.03, midi(s ? root + 4 : root + 7, T - 12), eighth, vel(0.45), P.nharp);
      else [root, root + 4, root + 7, root + 9].forEach((d, i) => I.harp(S, t + i * 0.12, midi(d, T - 12), barLen, 0.6, P.nharp));
      const n = crickets ? rng.int(0, 2) : 0;
      for (let i = 0; i < n; i++) I.cricket(S, t + rng.range(0, barLen - 0.3), vel(0.8), P.cricket, { pitch: rng.range(4000, 4700), chirps: rng.int(2, 4) });
    }
    return barLen;
  }

  /**
   * Offline: arrangement is a list of bar plans; mixes is a list of { bar, mix, ramp } in bars.
   * Schedules everything and returns the time the last bar ends.
   */
  function render(arrangement, t0 = 0, mixes = []) {
    const mixAtBar = [];
    let cur = { ...mixTarget };
    const evAt = new Map(mixes.map((m) => [m.bar, m]));
    // the mix target at the start and end of each bar (fades span whole bars)
    let fade = null;
    for (let b = 0; b <= arrangement.length; b++) {
      const e = evAt.get(b);
      if (e) fade = { from: { ...cur }, to: { ...cur, ...e.mix }, start: b, len: e.ramp || 1 };
      if (fade) {
        const k = Math.min(1, (b - fade.start) / fade.len);
        const m = {};
        for (const key of Object.keys(fade.to)) m[key] = fade.from[key] + (fade.to[key] - fade.from[key]) * k;
        cur = m;
        if (k >= 1) fade = null;
      }
      mixAtBar.push({ ...cur });
    }
    // automation on the layer gains
    for (const k of Object.keys(layers)) {
      const g = layers[k].gain; g.cancelScheduledValues(0); g.setValueAtTime(mixAtBar[0][k] || 0, t0);
      for (let b = 1; b < mixAtBar.length; b++) g.linearRampToValueAtTime(mixAtBar[b][k] || 0, t0 + b * barLen);
    }
    // On an OfflineAudioContext, schedule each bar just before it plays (suspend, schedule, resume), the way the
    // live scheduler does. Scheduling the whole piece up front keeps every note's nodes alive from time 0 and makes
    // the render cost grow with the square of the length, which would misstate the live CPU cost.
    const lazy = typeof ctx.suspend === 'function' && typeof ctx.startRendering === 'function';
    let t = t0;
    arrangement.forEach((plan, b) => {
      const at = t;
      const go = () => scheduleBar(plan, at, mixAtBar[b], mixAtBar[b + 1]);
      const when = Math.floor(((at - 0.25) * ctx.sampleRate) / 128) * 128 / ctx.sampleRate;
      if (lazy && when > 0) ctx.suspend(when).then(() => { go(); ctx.resume(); });
      else go();
      t += barLen;
    });
    return t;
  }

  // live play: schedule bars just ahead of the clock
  let timer = null;
  function play(arrangement, { loop = true } = {}) {
    stop(0);
    let b = 0, next = ctx.currentTime + 0.1;
    const tick = () => {
      while (next < ctx.currentTime + 0.4) {
        if (b >= arrangement.length) { if (!loop) { clearInterval(timer); timer = null; return; } b = 0; }
        next += scheduleBar(arrangement[b++], next);
      }
    };
    tick();
    timer = setInterval(tick, 100);
  }
  function stop(fade = 1) {
    if (timer) { clearInterval(timer); timer = null; }
    if (fade > 0) setMix({ explore: 0, combat: 0, night: 0 }, ctx.currentTime, fade);
  }

  return { theme: th, barLen, eighth, layers, setMix, scheduleBar, render, play, stop };
}

/**
 * The in-game arrangement (Scott's default 2026-11-24: mostly texture, the tune returning now and then): eight bars of
 * texture with the opening of the tune half-heard on a bell, eight bars of the tune, eight bars of texture. Loops.
 */
export function textureArrangement({ perc = true } = {}) {
  const bars = (mel, hintAt) => [0, 1, 2, 3, 4, 5, 6, 7].map((h) => ({ h, mel, perc: perc && (mel || h % 2 === 1), hint: hintAt.includes(h) }));
  return [...bars(false, [0, 1]), ...bars(true, []), ...bars(false, [4, 5])];
}
/** Combat: the tune twice over the drums. */
export function combatArrangement() {
  return [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7].map((h) => ({ h, mel: true, perc: true }));
}

/** The standard arrangement: an intro, the phrase, the phrase again (where combat can rise), a return, an ending. */
export function standardArrangement() {
  const ph = (perc, idx = [0, 1, 2, 3, 4, 5, 6, 7]) => idx.map((h) => ({ h, mel: true, perc }));
  return [
    { h: 0, mel: false, perc: false }, { h: 1, mel: false, perc: false },
    ...ph(true),
    ...ph(true),
    ...ph(true, [0, 1, 2, 3, 6]),
    { h: 7, mel: true, perc: true, final: true },
  ];
}

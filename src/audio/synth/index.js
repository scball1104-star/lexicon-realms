// Lexicon Realms synth (PROTOTYPE, NOT WIRED INTO THE GAME). Procedural music and sound with WebAudio, no samples.
// Scott approved the direction on 2026-11-24 with an "audio brief plus 3 clips" gate: nothing here is called by
// src/main.js or src/audio/audio.js until he approves the clips. Brief: D:\LQOnline\wave5\synth\AUDIO_BRIEF.md.
//
//   import { createSynth } from './audio/synth/index.js';
//   const syn = createSynth(audioContext, { seed: 1 });
//   const m = syn.theme('willowmere', { night: false });     // a sequencer for that realm
//   m.play(m.arrangement);  m.setMix({ combat: 1 }, ctx.currentTime, 2);  m.stop(1.5);
//   syn.sfx('footstep', { surface: 'stone' });                // any recipe in sfx.js, now or at { at: time }
//
// Files: rng.js (seeds), core.js (buses, noise, envelopes, FDN reverb), instruments.js, motif.js (pure generator),
// sequencer.js (layers explore / combat / night), sfx.js (recipes), themes.js (realm data), clips.js (the 3 clips).
import { createCore } from './core.js';
import { createSequencer, standardArrangement } from './sequencer.js';
import { THEMES } from './themes.js';
import { SFX } from './sfx.js';

export function createSynth(ctx, { seed = 1, reverbDecay = 2.4 } = {}) {
  const S = createCore(ctx, { seed, reverbDecay });
  return {
    core: S,
    stats: S.stats,
    theme(id, opts = {}) {
      const th = THEMES[id] || THEMES.willowmere;
      const seq = createSequencer(S, th, opts);
      seq.arrangement = standardArrangement();
      return seq;
    },
    sfx(name, opts = {}) {
      const fn = SFX[name];
      if (!fn) return 0;
      return fn(S, opts.at != null ? opts.at : ctx.currentTime + 0.01, opts);
    },
    setVolumes({ music, sfx, master } = {}) {
      if (music != null) S.music.gain.value = music;
      if (sfx != null) S.sfx.gain.value = sfx;
      if (master != null) S.master.gain.value = master * 0.6;
    },
  };
}

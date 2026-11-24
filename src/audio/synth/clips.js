// Lexicon Realms synth: the three approval clips for Scott (audio brief plus 3 clips). Each builds a whole clip on
// an OfflineAudioContext. demo.html calls these; D:\LQOnline\wave5\synth\render_clips.py drives demo.html headless.
import { createCore } from './core.js';
import { createSequencer, standardArrangement } from './sequencer.js';
import { THEMES } from './themes.js';
import { SFX } from './sfx.js';

const W = THEMES.willowmere;
const TAIL = 4;
const dayBars = () => standardArrangement();
const nightBars = () => [
  { h: 0, mel: false }, { h: 1, mel: false },
  ...[0, 1, 2, 3, 4, 5, 6].map((h) => ({ h, mel: true })),
  { h: 7, mel: true, final: true },
];

export const CLIPS = {
  // (a) Willowmere by day: explore, the combat layer rises on the second pass of the tune, then settles back
  willowmere_day: {
    seconds: () => dayBars().length * W.eighth * W.beats + TAIL,
    build(ctx) {
      const S = createCore(ctx, { seed: W.seed, reverbDecay: 2.6 });
      const seq = createSequencer(S, W, { night: false });
      seq.render(dayBars(), 0.05, [
        { bar: 0, mix: { explore: 1, combat: 0, night: 0 } },
        { bar: 10, mix: { combat: 1 }, ramp: 1 },
        { bar: 18, mix: { combat: 0 }, ramp: 2 },
      ]);
      return S;
    },
  },
  // (b) the same tune at night: slower, softer mode, bell lead, crickets
  willowmere_night: {
    seconds: () => nightBars().length * (W.eighth / W.nightTempo) * W.beats + TAIL,
    build(ctx) {
      const S = createCore(ctx, { seed: W.seed ^ 0x51, reverbDecay: 3.4 });
      const seq = createSequencer(S, W, { night: true });
      seq.render(nightBars(), 0.05, [{ bar: 0, mix: { explore: 0, combat: 0, night: 1 } }]);
      return S;
    },
  },
  // (c) a montage of sound effects
  sfx_montage: {
    seconds: () => 27,
    build(ctx) {
      const S = createCore(ctx, { seed: 2411, reverbDecay: 1.3 });
      S.music.gain.value = 0;
      const marks = [];
      const mark = (name) => marks.push([name, Math.round(t * 10) / 10]);
      let t = 0.3;
      mark('footsteps on grass');
      for (let i = 0; i < 6; i++) { SFX.footstep(S, t, { surface: 'grass', weight: i % 2 ? 0.85 : 1 }); t += 0.48; }
      t += 0.5; mark('footsteps on stone');
      for (let i = 0; i < 6; i++) { SFX.footstep(S, t, { surface: 'stone', weight: i % 2 ? 0.85 : 1 }); t += 0.48; }
      t += 0.7; mark('boar grunts');
      t += SFX.creatureVoice(S, t, { kind: 'boar', mood: 'aggro' }) + 1.0;
      mark('NPC bark, lower voice'); t += SFX.bark(S, t, { voice: 0.35, shape: 'hey' }) + 0.7;
      mark('NPC bark, higher voice'); t += SFX.bark(S, t, { voice: 0.75, shape: 'oh' }) + 1.0;
      mark('door'); t += SFX.door(S, t) + 0.7;
      mark('chest'); t += SFX.chest(S, t) + 0.5;
      mark('campfire'); t += SFX.fire(S, t, { dur: 5 }) + 0.5;
      mark('spell charge');
      const rel = SFX.spell(S, t, { school: 'ink', charge: 1.1 });
      t += rel + 0.32; mark('impact');
      SFX.impact(S, t, { power: 1 });
      S.marks = marks;
      return S;
    },
  },
};


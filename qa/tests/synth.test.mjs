// Synth prototype (wave 5, NOT wired): the seeded motif generator is deterministic and tuneful by its own rules,
// and nothing in the game imports the synth until Scott approves the audio brief and clips.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq } from './_helpers.mjs';
import { makeTheme, chordTones, degToMidi } from '../../src/audio/synth/motif.js';
import { seedFromText, makeRng } from '../../src/audio/synth/rng.js';
import { THEMES, themeFromText } from '../../src/audio/synth/themes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const tests = [
  {
    name: 'synth: seeds and themes are deterministic',
    fn() {
      eq(seedFromText('Willowmere'), seedFromText('Willowmere'), 'same text, same seed');
      assert(seedFromText('Willowmere') !== seedFromText('Larchhill'), 'different realms, different seeds');
      const a = makeRng(7), b = makeRng(7);
      for (let i = 0; i < 5; i++) eq(a(), b(), 'rng repeats');
      const w = THEMES.willowmere;
      eq(JSON.stringify(makeTheme({ seed: w.seed })), JSON.stringify(makeTheme({ seed: w.seed })), 'theme repeats');
      assert(themeFromText('ink lantern').seed !== w.seed, 'letters make a new seed');
    },
  },
  {
    name: 'synth: melodies fill their bars, stay in range, land strong beats on chord tones, end home',
    fn() {
      for (const text of ['Willowmere', 'Larchhill', 'Emberpeak', 'Valewyn', 'Saffron', 'Drovers Reach', 'abc', 'zz']) {
        const th = makeTheme({ seed: seedFromText(text), beats: 6 });
        eq(th.melody.length, 8, `${text}: 8 bars`);
        th.melody.forEach((bar, i) => {
          eq(bar.reduce((s, n) => s + n.len, 0), 6, `${text} bar ${i} fills 6/8`);
          for (const n of bar) assert(n.deg >= -1 && n.deg <= 10, `${text} bar ${i} degree ${n.deg} in range`);
          const tones = chordTones(th.chords[i]).map((d) => ((d % 7) + 7) % 7);
          for (const n of bar) if (n.step === 0) assert(tones.includes(((n.deg % 7) + 7) % 7), `${text} bar ${i} downbeat on a chord tone`);
        });
        eq(th.chords[7], 0, `${text} ends on the home chord`);
        const last = th.melody[7][0].deg;
        assert([0, 2, 7].includes(last), `${text} last note is home (${last})`);
      }
      eq(degToMidi(0, 62, 'ionian'), 62, 'D');
      eq(degToMidi(2, 62, 'dorian'), 65, 'dorian third is minor');
    },
  },
  {
    name: 'synth: prototype is not wired into the game yet',
    fn() {
      for (const f of ['src/main.js', 'src/audio/audio.js']) {
        const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
        assert(!s.includes('synth/'), `${f} must not import the synth before Scott approves the clips`);
      }
    },
  },
];

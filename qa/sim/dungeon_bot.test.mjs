// The dungeon clear gate in the suite (qa/sim/dungeon_bot.mjs): every class's first named build clears the Wethers' Barrow
// at 11 and the Watchtower at 19 solo with at most 2 deaths, and every cave at its middle level (one seed each here; the
// script runs 3 seeds and every build).
import { clearRun } from './dungeon_bot.mjs';

const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
const cell = (place, level) => ({
  name: `dungeon bot: every class clears ${place} at ${level} solo, deaths <= 2`,
  fn() {
    for (const cls of CLASSES) {
      const r = clearRun(place, cls, level, { seed: 1 });
      if (!r.cleared || r.deaths > 2) throw new Error(`${cls} ${r.build}: cleared ${r.cleared}, deaths ${r.deaths}, ${r.minutes} min`);
    }
  },
});
export const tests = [cell('barrow', 11), cell('watchtower', 19), cell('rootcellar', 5), cell('smugglers_cut', 8), cell('tarn_hollow', 15),
  cell('barrow_deep', 28)];      // cap 30: the Barrow Deep Halls (the script also runs it at 30)

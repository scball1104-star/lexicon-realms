// The XP trim (Scott 2026-11-23, "Trim the XP"): PROGRESSION.xpRate scales every grant a hero of level 1 to 19 earns,
// and the quest dialog's reward view shows the same trimmed number. The two Moor boars nearest Sorrel ship at 15.
import { assert, eq } from './_helpers.mjs';
import { buildContent } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/world.js';
import { xpRate } from '../../src/sim/progression.js';

export const tests = [
  {
    name: 'xp rate: levels 1 to 3 earn full XP, 4 to 19 earn the trimmed share, 20 and up earn full XP, and a grant is never rounded to 0',
    fn() {
      const C = buildContent();
      eq(xpRate(C.progression, 1), 1, 'full at 1 (Scott 2026-11-24)');
      eq(xpRate(C.progression, 3), 1, 'full at 3');
      const r = xpRate(C.progression, 4);
      assert(r > 0 && r < 1, 'a trim from level 4 to 19');
      eq(xpRate(C.progression, 19), r, 'same at 19');
      eq(xpRate(C.progression, 20), 1, 'full at 20');
      const w = createWorld({ seed: 7, content: C });
      const id = w.addPlayer({ name: 'Trim', cls: 'scribe', level: 4 });
      const e = w.state.ents.find((x) => x.id === id);
      const before = e.xp;
      eq(w.grantXp(id, 400, 'quest'), Math.round(400 * r), 'grant returns the trimmed amount');
      eq(e.xp - before, Math.round(400 * r), 'the hero gets the trimmed amount');
      assert(w.grantXp(id, 1, 'gather') >= 1, 'a tiny grant still gives 1');
    },
  },
  {
    name: 'xp rate: the two Gorse Boars nearest Sorrel are level 15, the heath keeps its 14s and 16s',
    fn() {
      const W = buildContent().zones.world;
      const boars = W.spawns.filter((s) => s.mob === 'gorse_boar' && s.region !== 'x');
      const at = (x, y) => boars.find((s) => s.x === x && s.y === y);
      eq(at(106, 64).level, 15, 'boar at 106,64');
      eq(at(116, 72).level, 15, 'boar at 116,72');
      eq(at(120, 62).level, 16, 'boar at 120,62 stays 16');
      eq(at(138, 66).level, 16, 'boar at 138,66 stays 16');
    },
  },
];

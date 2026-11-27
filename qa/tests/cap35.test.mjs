// Cap 35 (stage 1, the Millrace; docs/handoff/briefs/BRIEF_cap35_millrace.md, Scott approved 2026-11-27): the XP curve
// to 35, a hero levelling 30 to 35 and then filling Renown again, the third signature at 35 (trainer-free, no ninth bar
// button), five more build points per named build, and affix tier 9 (ilvl 31 to 35). The fight gate is
// qa/sim/builds2.mjs (every build at every level to 35).
import { assert, eq } from './_helpers.mjs';
import { duelWorld } from '../sim/_fixtures.mjs';
import { PROGRESSION } from '../../src/data/progression.js';
import { RENOWN } from '../../src/data/renown.js';
import { BUILDS2, SIGNATURE_LEVELS } from '../../src/data/builds2.js';
import { PAST_30 } from '../../src/data/builds2_cap35.js';
import { AFFIXES, AFFIX_TIER_TOP, DROP_RULES, affixTier } from '../../src/data/items.js';
import { rollAffixes } from '../../src/sim/loot.js';
import { createRng } from '../../src/sim/rng.js';
import { BAR_SLOTS } from '../../src/sim/constants.js';
import { makeHero } from '../sim/builds2.mjs';

const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
// BRIEF section 5: 4 x kill XP x target minutes, rounded to tens; minutes 20 + (L - 14) to 30, then 36 + 0.8 x (L - 30)
const minutes = (L) => (L <= 30 ? 20 + (L - 14) : 36 + 0.8 * (L - 30));
const formula = (L) => Math.round((4 * (20 + 4 * L) * minutes(L)) / 10) * 10;

export const tests = [
  {
    name: 'cap 35: maxLevel 35; XP to next for 30 to 34 is 20,160 / 21,200 / 22,260 / 23,350 / 24,460 and matches the formula',
    fn() {
      eq(PROGRESSION.maxLevel, 35, 'cap 35');
      eq([30, 31, 32, 33, 34].map((L) => PROGRESSION.xpToNext[L]).join(), '20160,21200,22260,23350,24460');
      for (let L = 15; L < 35; L++) eq(PROGRESSION.xpToNext[L], formula(L), `xp to next at ${L}`);
      eq(PROGRESSION.xpToNext.length, 35, 'no entry past 34 (35 is the cap)');
      eq(PROGRESSION.renown.xpToNext, 19200, 'Renown rank size stays 19,200');
      eq(RENOWN.xpToNext, 19200);
    },
  },
  {
    name: 'cap 35: xpAtLevel is the running total, rises every level, 226,920 at 30 and 338,350 at 35',
    fn() {
      const A = PROGRESSION.xpAtLevel;
      eq(A.length, 36, 'index 0 to 35');
      let sum = 0;
      for (let L = 1; L <= 35; L++) {
        eq(A[L], sum, `cumulative at ${L}`);
        if (L > 1) assert(A[L] > A[L - 1], `rises at ${L}`);
        sum += PROGRESSION.xpToNext[L] || 0;
      }
      eq(A[30], 226920, '30 unchanged'); eq(A[20], 81640, '20 unchanged');
      eq([31, 32, 33, 34, 35].map((L) => A[L]).join(), '247080,268280,290540,313890,338350');
      eq(A[35] - A[30], 111430, 'the stage holds 111,430 XP');
    },
  },
  {
    name: 'cap 35: a hero levels 30 to 35 on character XP (not Renown), then overflow at 35 fills Renown',
    fn() {
      const { world: w, pid, p } = duelWorld({ cls: 'warden', level: 30 });
      p.gold = 75;
      const levels = [];
      let total = 0;
      while (p.level < 35) {
        const before = p.level;
        w.grantXp(pid, 1000);
        total += 1000;
        if (p.level < 35) assert(!p.renown || (p.renown.level === 0 && p.renown.xp === 0), `no Renown below the cap (level ${p.level})`);
        if (p.level > before) levels.push([p.level, total]);
      }
      eq(levels.map(([L]) => L).join(), '31,32,33,34,35', 'one level at a time');
      for (const [L, t] of levels) assert(t >= PROGRESSION.xpAtLevel[L] - PROGRESSION.xpAtLevel[30] && t - 1000 < PROGRESSION.xpAtLevel[L] - PROGRESSION.xpAtLevel[30], `reached ${L} at its cumulative XP`);
      const over = total - (PROGRESSION.xpAtLevel[35] - PROGRESSION.xpAtLevel[30]);
      eq(p.xp, 0, 'no XP bar at the cap');
      eq(p.renown.xp, over, 'the grant that crossed 35 sends its rest to Renown');
      w.grantXp(pid, RENOWN.xpToNext);
      eq(p.level, 35);
      eq(p.renown.level, 1, 'a Renown rank at 35');
      eq(p.gold, 75, 'overflow is not sold for gold');
    },
  },
  {
    name: 'cap 35: the third signature opens at 35 (not 34), is the one not yet taken, is learned with no trainer, and the 8-slot bar gets no ninth button',
    fn() {
      eq(SIGNATURE_LEVELS.join(), '10,20,35');
      for (const cls of CLASSES) {
        const b = BUILDS2[cls].builds[0];
        const order = b.signatures;
        eq(order.length, 3, `${b.id}: three signatures`);
        const lo = makeHero({ ...b, cls }, 34);
        assert(!lo.C.b2.picksOpen(lo.p).some((x) => x.signature), `${b.id}: no third signature at 34`);
        assert(!lo.C.b2.pick(lo.p, { level: 35, ability: order[2] }), `${b.id}: refused at 34`);
        const { world, p, C } = lo;
        eq(p.build.sigs.join(), order.slice(0, 2).join(), `${b.id}: two signatures at 34`);
        eq(p.bar.length, BAR_SLOTS, `${b.id}: a full 8-slot bar at 34`);
        assert(p.bar.every(Boolean), `${b.id}: every slot holds a skill`);
        world.grantXp(p.id, PROGRESSION.xpToNext[34]);
        eq(p.level, 35, `${b.id}: 35`);
        const sg = C.b2.picksOpen(p).find((x) => x.signature);
        assert(sg && sg.level === 35, `${b.id}: the third signature is open at 35`);
        eq(sg.options.join(), order[2], `${b.id}: the one not yet taken`);
        const gold = p.gold || 0;
        world.enqueue(p.id, { t: 'b2_pick', level: 35, ability: order[2] });
        world.step();
        assert(p.known.includes(order[2]), `${b.id}: known with no trainer`);
        eq(p.gold || 0, gold, `${b.id}: free`);
        eq(p.build.sigs.join(), order.join(), `${b.id}: all three, in the build's order`);
        eq(p.bar.length, BAR_SLOTS, `${b.id}: no ninth slot`);
        assert(!p.bar.includes(order[2]), `${b.id}: a full bar does not take it by itself`);
        assert(!C.b2.picksOpen(p).some((x) => x.signature), `${b.id}: nothing left to pick`);
        // the player swaps it onto the bar in place of another skill
        world.enqueue(p.id, { t: 'bar_set', slot: BAR_SLOTS, entry: order[2] });
        world.step();
        eq(p.bar[BAR_SLOTS - 1], order[2], `${b.id}: on the last slot`);
        eq(p.bar.length, BAR_SLOTS, `${b.id}: still eight slots`);
      }
    },
  },
  {
    name: 'cap 35: every named build spends 35 points (five more for 31 to 35 on its own tracks), all legal',
    fn() {
      for (const cls of CLASSES) for (const b of BUILDS2[cls].builds) {
        eq(b.path.length, 35, `${b.id} 35 points`);
        eq(PAST_30[b.id].length, 5, `${b.id}: five cap 35 points`);
        for (const id of PAST_30[b.id]) assert(b.tracks.some((t) => id.startsWith(`b2_${cls}_${t}_`)), `${b.id}: ${id} on its own tracks`);
        const { p, C } = duelWorld({ cls, level: 35, learnAll: false, builds2: true });
        for (const id of b.path) assert(C.b2.learn(p, { node: id }), `${b.id}: ${id} (${C.b2.whyNot(p, id)})`);
        eq(C.b2.points(p).free, 0, `${b.id}: no point left at 35`);
      }
    },
  },
  {
    name: 'cap 35: affix tier 9 covers ilvl 31 to 35; every affix has a T9 value that grows slowly from T8; drops at ilvl 33 roll T9',
    fn() {
      eq(AFFIX_TIER_TOP.join(), '3,6,9,12,20,23,26,30,35');
      eq(DROP_RULES.affixTierTop.join(), AFFIX_TIER_TOP.join(), 'the drop rules read the same tops');
      eq(affixTier(30), 8); eq(affixTier(31), 9); eq(affixTier(35), 9);
      for (const [id, a] of Object.entries(AFFIXES)) {
        eq(a.values.length, 9, `${id}: nine tiers`);
        const [t6, t7, t8, t9] = a.values.slice(5, 9);
        assert(t9[0] >= t8[0] && t9[1] >= t8[1] && t9[0] <= t9[1], `${id}: T9 at or above T8`);
        assert(t9[1] - t8[1] <= t8[1] - t6[1] + 1e-9 && t9[1] - t8[1] <= Math.max(t8[1] - t7[1], t7[1] - t6[1]) + 1e-9, `${id}: a slow step, no bigger than one of the last two`);
      }
      const content = { affixes: AFFIXES, rarity: { magic: { affixes: [2, 2], prefixMax: 1, suffixMax: 1 } }, dropRules: DROP_RULES };
      const rng = createRng(35);
      for (let i = 0; i < 40; i++) {
        for (const r of rollAffixes({ content, rng }, 'chest', 33, 'magic')) {
          const v = AFFIXES[r.id].values;
          const [lo, hi] = v[Math.min(9, v.length) - 1];
          assert(r.value >= lo && r.value <= hi, `${r.id} ${r.value} in T9`);
        }
      }
    },
  },
];

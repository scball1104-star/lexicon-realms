// wave 10 dtiers (src/sim/depths.js, src/data/depths.js, src/net/depth_board.js, src/ui/depth_ui.js): Depths.
// The paired proof (the same seed and the same steps, one copy today and one at a depth: no foe softer than today, every
// foe with more health), the weekly modifiers (the same for a week, each round once in 4 weeks, never twice running), the
// candle, the clear and what it opens, the rewards through dloot, Errata and blots, the coffer at the week's turn, the
// save, the board link, and the words.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { weekMods, modsAt, mulsAt, rewardAt, chestSlots, unlockAfter, easternWeekOfDay } from '../../src/sim/depths.js';
import { DEPTH_RULES, DEPTH_MODS, DEPTH_WORDS, depthReward } from '../../src/data/depths.js';
import { encodeBoard, decodeBoard, mergeBoard, boardRows } from '../../src/net/depth_board.js';
import { foesAt, modsFor, mondayText } from '../../src/ui/depth_ui.js';
import { easternDay, easternWeek } from '../../src/core/eastern_week.js';

const C = { ...buildContent(), spawns: [], nightSpawns: [] };
const R = DEPTH_RULES;
const DAY = 20782;                                 // Wednesday 2026-11-25 (Eastern)
const WEEK = easternWeekOfDay(DAY);

/** A world with one hero at the band's top, in a copy of `place` (a depth pick or none). */
const killer = () => ({ q: [], tick(w) { for (const [m, p] of this.q.splice(0)) if (!m.dead) w.internals.combat.kill(m, p); } });
function copyOf(place, depth, { seed = 4242, day = DAY, level = null } = {}) {
  const K = killer();
  const w = createWorld({ seed, content: C, day, systems: [K] });
  const lv = level || C.dungeons[place].levels[1];
  const id = w.addPlayer({ name: 'Ash', cls: 'warden', level: lv });
  const p = w.get(id);
  if (depth) { p.depths = { open: { [place]: depth }, runs: [], best: {}, coffer: null }; w.enqueue(id, { t: 'depth_pick', place, depth, candle: false }); w.step(); }
  else w.step();
  const zid = w.internals.dungeons.enter(p, place);
  p.zone = zid;
  const foes = w.state.ents.filter((e) => e.kind === 'mob' && e.zone === zid && e.faction === 'hostile' && !(e.spawn && e.spawn.extra));
  return { w, p, zid, foes, K };
}
function numbers(e) { return { hp: e.hpMax, lo: e.mob.damage[0], hi: e.mob.damage[1], level: e.level, swing: e.mob.attackSpeed, t: e.template }; }

/** Paired: today against each depth and each of 4 weeks (every modifier comes round). */
function paired(place) {
  const today = copyOf(place, 0).foes.map(numbers);
  let n = 0;
  for (const depth of [1, 2, 4, 8, 12, 20]) {
    for (let k = 0; k < 4; k++) {
      const day = DAY + 7 * k;
      const base = k ? copyOf(place, 0, { day }).foes.map(numbers) : today;
      const deep = copyOf(place, depth, { day }).foes.map(numbers);
      eq(deep.length, base.length, `${place} d${depth}: the same foes`);
      deep.forEach((a, i) => {
        const b = base[i];
        eq(a.t, b.t, `${place} d${depth}: paired foe ${i}`);
        assert(a.hp > b.hp, `${place} d${depth} wk+${k} ${a.t}: health ${a.hp} not above today's ${b.hp}`);
        assert(a.lo >= b.lo && a.hi >= b.hi, `${place} d${depth} ${a.t}: hits ${a.lo}-${a.hi} below today's ${b.lo}-${b.hi}`);
        assert(a.level >= b.level, `${place} d${depth} ${a.t}: level`);
        assert(a.swing <= b.swing, `${place} d${depth} ${a.t}: slower swing`);
        n++;
      });
    }
  }
  return n;
}

const killLast = ({ w, p, zid, K }, place) => {
  const boss = w.state.ents.find((e) => e.kind === 'mob' && e.zone === zid && e.template === C.dungeons[place].last && !e.dead);
  boss.tagger = p.id; boss.threat = { [p.id]: 1 };
  const evs = [];
  K.q.push([boss, p]);
  for (let i = 0; i < 3; i++) evs.push(...w.step());
  return evs;
};

export const tests = [
  ...['barrow', 'watchtower', 'barrow_deep', 'rootcellar', 'smugglers_cut', 'tarn_hollow', 'larch_mine'].map((place) => ({
    name: `dtiers: ${place}, paired with today at Depths 1 to 20 over 4 weeks: no foe softer, every foe with more health`,
    fn() { const n = paired(place); assert(n > 20, `compared ${n}`); },
  })),
  {
    name: 'dtiers: the weekly modifiers are the same all week, come round once in 4 weeks, never repeat two weeks running',
    fn() {
      eq(WEEK, easternWeek(DAY), 'the sim week is the shared Eastern week');
      eq(easternWeek(easternDay(Date.UTC(2026, 10, 23, 5, 0))), WEEK, 'Monday 12:00 am Eastern starts it');
      eq(easternWeek(easternDay(Date.UTC(2026, 10, 23, 4, 59))), WEEK - 1, 'Sunday 11:59 pm is last week');
      for (let w = 2000; w < 3000; w++) for (const g of ['margin', 'bold', 'page']) assert(weekMods(w, DEPTH_MODS)[g].id !== weekMods(w - 1, DEPTH_MODS)[g].id, `${g} repeats at ${w}`);
      for (let b = 500; b < 700; b++) for (const g of ['margin', 'bold', 'page']) { const s = new Set(); for (let i = 0; i < 4; i++) s.add(weekMods(b * 4 + i, DEPTH_MODS)[g].id); eq(s.size, 4, `${g} block ${b}`); }
      eq(modsAt(WEEK, 3, DEPTH_MODS, R).length, 1); eq(modsAt(WEEK, 4, DEPTH_MODS, R).length, 2); eq(modsAt(WEEK, 8, DEPTH_MODS, R).length, 3);
      const m1 = mulsAt(1, R); assert(m1.hp > 1 && m1.dmg > 1, 'Depth 1 is tougher');
      for (let d = 0; d < 40; d++) eq(JSON.stringify(rewardAt(d)), JSON.stringify(depthReward(d)), `reward table ${d}`);
      const ui = foesAt(5, { margin: 'thick_ink' }); assert(Math.abs(ui.hp - 1.1 ** 5 * 1.2) < 1e-9, 'the UI shows the sim numbers');
      eq(modsFor({ margin: 'blotted', bold: 'footnoted', page: 'errata' }, 5).filter((m) => m.on).length, 2);
      eq(mondayText(WEEK), '23 Nov');
    },
  },
  {
    name: 'dtiers: a pick needs the depth open (the party carries); a first clear opens Depth 1; Depth 0 is today',
    fn() {
      const w = createWorld({ seed: 3, content: C, day: DAY });
      const id = w.addPlayer({ name: 'Ash', cls: 'warden', level: 30 });
      const p = w.get(id);
      const D = w.internals.dungeons.depths;
      eq(D.openOf(p, 'barrow_deep'), 0, 'not cleared: no depths');
      w.enqueue(id, { t: 'depth_pick', place: 'barrow_deep', depth: 1 });
      assert(w.step().some((e) => e.type === 'depth_fail' && e.reason === 'not_open'), 'refused');
      p.dungeons = { day: DAY, done: [], miss: 0, clears: { deep_barrow_king: 1 } };
      eq(D.openOf(p, 'barrow_deep'), 1, 'a clear opens Depth 1');
      const id2 = w.addPlayer({ name: 'Bryn', cls: 'mender', level: 30 });
      w.setParty(id, 4); w.setParty(id2, 4);
      w.get(id2).depths = { open: { barrow_deep: 6 }, runs: [], best: {}, coffer: null };
      w.enqueue(id, { t: 'depth_pick', place: 'barrow_deep', depth: 6, candle: true });
      assert(w.step().some((e) => e.type === 'depth_pick' && e.depth === 6), 'a friend carries the party to Depth 6');
      const zid = w.internals.dungeons.enter(p, 'barrow_deep');
      eq(w.state.copies[zid].depth.depth, 6);
      // a different pick makes an empty copy fresh; Depth 0 is today's copy
      p.zone = 'world';
      w.enqueue(id, { t: 'depth_pick', place: 'barrow_deep', depth: 0 }); w.step();
      const z2 = w.internals.dungeons.enter(p, 'barrow_deep');
      eq(z2, zid); assert(!w.state.copies[z2].depth, 'today again');
    },
  },
  {
    name: 'dtiers: the clear opens the next depth (two with the candle lit), records the run, pays through dloot, and leaves the Candle Cache',
    fn() {
      const A = copyOf('barrow_deep', 8, { level: 30 });
      const { w, p, zid } = A;
      p.depthPick.candle = true; w.state.copies[zid].depth.candle = true;
      const evs = killLast(A, 'barrow_deep');
      const cl = evs.find((e) => e.type === 'depth' && e.kind === 'clear');
      assert(cl, 'depth clear');
      eq(cl.lit, true); eq(cl.next, 10, 'lit: two depths open');
      eq(p.depths.open.barrow_deep, 10);
      eq(p.depths.runs.length, 1); eq(p.depths.runs[0].depth, 8);
      eq(p.depths.best.barrow_deep.depth, 8);
      assert(evs.some((e) => e.type === 'spawn' && /_candle$/.test(e.template)), 'Candle Cache');
      eq(cl.items.filter((x) => /^glyph_/.test(x)).length, 2, 'Depth 8: two glyphs');
      // unlit: one depth
      const b = copyOf('barrow', 3, { level: 12 });
      const e2 = killLast(b, 'barrow').find((e) => e.type === 'depth' && e.kind === 'clear');
      eq(e2.next, 4); eq(e2.lit, false);
    },
  },
  {
    name: 'dtiers: Errata mends a foe once at half health; a Blotted foe leaves a blot that bursts on a hero standing in it',
    fn() {
      // a week with Errata (page) at Depth 8, and one with Blotted (margin)
      let wk = WEEK; while (weekMods(wk, DEPTH_MODS).page.id !== 'errata') wk++;
      const day = wk * 7 - 3;
      const a = copyOf('barrow', 8, { day, level: 12 });
      const m = a.foes.find((e) => !(e.spawn && e.spawn.boss));
      m.hp = Math.floor(m.hpMax * 0.4);
      const before = m.hp;
      const ev = a.w.step();
      assert(m.hp > before && ev.some((e) => e.type === 'heal' && e.ability === 'depth_errata'), 'mended');
      m.hp = Math.floor(m.hpMax * 0.3); a.w.step(); eq(m.hp, Math.floor(m.hpMax * 0.3), 'only once');
      let wb = WEEK; while (weekMods(wb, DEPTH_MODS).margin.id !== 'blotted') wb++;
      const b = copyOf('barrow', 2, { day: wb * 7 - 3, level: 12 });
      const f = b.foes.find((e) => !(e.spawn && e.spawn.boss));
      b.p.x = f.x; b.p.y = f.y;
      f.tagger = b.p.id; b.K.q.push([f, b.p]);
      const hp0 = b.p.hp;
      let evs = [];
      for (let i = 0; i < 3; i++) evs.push(...b.w.step());
      assert(b.w.internals.dungeons.bossMarks().some((x) => x.ability === 'depth_blot'), 'the blot shows as a red mark');
      for (let i = 0; i < 50; i++) evs.push(...b.w.step());
      assert(evs.some((e) => e.type === 'depth' && e.kind === 'blot'), 'burst');
      assert(b.p.hp < hp0, 'the hero standing in it is hurt');
    },
  },
  {
    name: 'dtiers: the week turns: last week\'s runs fill the Sevennight Coffer; taking it gives one piece at the slot\'s rarity; the save keeps it all',
    fn() {
      eq(JSON.stringify(chestSlots([{ depth: 9 }, { depth: 7 }, { depth: 7 }, { depth: 5 }, { depth: 3 }], R.chest.slots).map((s) => s.depth)), '[9,5,null]');
      eq(unlockAfter(4, false), 5); eq(unlockAfter(4, true), 6);
      const w = createWorld({ seed: 9, content: C, day: DAY });
      const id = w.addPlayer({ name: 'Ash', cls: 'warden', level: 30 });
      const p = w.get(id);
      p.depths = { open: { barrow_deep: 9 }, week: WEEK, runs: [5, 9, 4, 8].map((d) => ({ place: 'barrow_deep', depth: d, secs: 900, lit: false, with: [] })), best: {}, coffer: null };
      w.setDay(DAY + 4); w.step();          // Sunday 29 Nov
      eq(w.internals.dungeons.depths.hudOf(p).coffer, null, 'still this week');
      w.setDay(DAY + 5); for (let i = 0; i < 20; i++) w.step();          // Monday 30 Nov (the week turns within a second)
      const h = w.internals.dungeons.depths.hudOf(p);
      assert(h.coffer && h.coffer.slots[0].depth === 9 && h.coffer.slots[1].depth === 4 && !h.coffer.slots[2].open, 'coffer slots');
      eq(h.runs.length, 0, 'a new week starts empty');
      const saved = JSON.parse(JSON.stringify(w.saveFields(id)));
      assert(saved.depths && saved.depths.coffer, 'saved');
      const n0 = p.bag.filter(Boolean).length;
      w.enqueue(id, { t: 'coffer_take', slot: 0 });
      const evs = w.step();
      const t = evs.find((e) => e.type === 'coffer' && e.kind === 'take');
      assert(t && t.rarity === 'epic', `epic from Depth 9 (${t && t.rarity})`);
      eq(p.depths.coffer, null); assert(p.bag.filter(Boolean).length > n0, 'in the bag');
      const w2 = createWorld({ seed: 9, content: C, day: DAY + 5 });
      const id2 = w2.addPlayer({ name: 'Ash', cls: 'warden', level: 30, ...saved });
      eq(w2.get(id2).depths.coffer.week, WEEK, 'loaded');
    },
  },
  {
    name: 'dtiers: the board link round trips, refuses a forged or odd one, and the board keeps the deeper run',
    fn() {
      const rec = { name: 'Ash', cls: 'warden', week: WEEK, runs: [{ place: 'barrow_deep', depth: 9, secs: 1642, lit: true, with: ['Bryn', 'Cass'] }] };
      const link = encodeBoard(rec);
      assert(link.length < 140, `short (${link.length})`);
      eq(JSON.stringify(decodeBoard(`#${link}`)), JSON.stringify(rec));
      eq(decodeBoard(`#${link.replace(/\.[0-9a-z]+$/, '.zz')}`), null, 'broken check');
      eq(decodeBoard(`#${encodeBoard({ ...rec, name: 'http' + ':x' })}`), null, 'bad name');
      eq(decodeBoard(`#${encodeBoard({ ...rec, runs: [{ place: 'barrow', depth: 3, secs: 5, lit: false, with: [] }] })}`), null, 'too fast');
      let B = mergeBoard({}, rec);
      B = mergeBoard(B, { ...rec, runs: [{ place: 'barrow_deep', depth: 8, secs: 600, lit: false, with: [] }] });
      const rows = boardRows(B, WEEK, 'week', 'Ash');
      eq(rows.length, 1); eq(rows[0].depth, 9); assert(rows[0].me, 'mine');
    },
  },
  {
    name: 'dtiers: Small Print adds a foe per pack; Footnoted, Heavy Hand, Running Ink and Run-on reach the foes',
    fn() {
      const weekWith = (g, id) => { let w = WEEK; while (weekMods(w, DEPTH_MODS)[g].id !== id) w++; return w * 7 - 3; };
      const a = copyOf('barrow_deep', 8, { day: weekWith('page', 'small_print'), level: 30 });
      const extra = a.w.state.ents.filter((e) => e.kind === 'mob' && e.zone === a.zid && e.spawn && e.spawn.extra === 'small_print');
      const packs = new Set(a.foes.filter((e) => e.spawn.pack).map((e) => e.spawn.group));
      eq(extra.length, packs.size, 'one more per pack');
      assert(extra.every((e) => e.spawn.depth === 8), 'the extra foes carry the depth');
      const b = copyOf('barrow_deep', 4, { day: weekWith('bold', 'footnoted'), level: 30 });
      const boss = b.foes.find((e) => e.spawn.boss);
      eq(b.w.internals.dungeons.depths.phaseSummon(boss, { mob: 'x', count: 2 }).count, 3, 'Footnoted');
      const c = copyOf('barrow_deep', 4, { day: weekWith('bold', 'heavy_hand'), level: 30 });
      eq(c.w.internals.dungeons.depths.frenzySooner(c.foes.find((e) => e.spawn.boss)), R.mod.heavyHand.soonerSec, 'Heavy Hand');
      const d = copyOf('barrow', 1, { day: weekWith('margin', 'running_ink'), level: 12 });
      assert(d.foes.every((e) => e.spawn.speedMul === R.mod.runSpeed && e.spawn.aggroMul === R.mod.runAggro), 'Running Ink');
      const e = copyOf('barrow', 8, { day: weekWith('page', 'run_on'), level: 12 });
      assert(e.foes.every((f) => f.spawn.leashMul === R.mod.runOnLeash), 'Run-on');
    },
  },
  {
    name: 'dtiers: every word is a draft with no em dash',
    fn() {
      const all = [JSON.stringify(DEPTH_MODS), ...Object.values(DEPTH_WORDS).map((v) => (typeof v === 'function' ? String(v(2, 3, 'x')) : JSON.stringify(v)))];
      for (const s of all) assert(!s.includes(String.fromCharCode(0x2014)), `em dash in ${s.slice(0, 40)}`);
    },
  },
];

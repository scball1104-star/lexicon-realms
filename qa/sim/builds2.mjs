// Builds 2 bot check (docs/design/BUILDS_2.md section 7, phase 1): the Mender's three named builds (Tidehammer,
// Lamplighter, Battle Mender) solo at every level from 1 to 10. Each run makes a Builds 2 Mender at that level, spends
// the build's points through the real rules (src/sim/builds2.js: tiers, forks, keystones), takes its skill picks, casts its
// Blessing, and fights one same-level foe with a played-well bot (design gear, the real sim).
//
//   node qa/sim/builds2.mjs                 20 runs per cell, prints the table
//   node qa/sim/builds2.mjs --runs 6 --pack also fights a 3-pack from level 3
//   import { runBuild, NAMED, B2_LEVELS, bandOk } from './builds2.mjs'   (qa/sim/builds2.test.mjs)
// Prints BUILDS2_DONE: cells=<n> runs=<n> solo_ok=<n> deaths=<n> target_ok=<n> spread_ok=<n> (machine-read sentinel).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { duelWorld, addMob } from './_fixtures.mjs';
import { BUILDS2 } from '../../src/data/builds2.js';

const SUB = 16, TILE = 256;
const MAX_TICKS = 20 * 120;
export const NAMED = BUILDS2.mender.builds;
export const B2_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// The pass band (what phase 1 must show: every named build solos): it wins every fight, never dies, and one foe takes 5 to
// 14 s at levels 1 to 4 (the lighter low-level foes, today's band) and 6 to 15 s from 5 (BUILDS_2 5.3: "never under 6 s
// for the strongest"). BUILDS_2's tighter targets (9 to 14 s for the suggested builds; the weakest build within 25% of the
// strongest) are PRINTED, not enforced: tuning them is phase 2's build matrix (BUILDS_2 9), and the numbers here are
// the approved first-pass design numbers, untuned.
export const bandOk = (r) => r.deaths === 0 && r.wins === r.runs && (r.level <= 4 ? r.ttk >= 5 && r.ttk <= 14 : r.ttk >= 6 && r.ttk <= 15);
export const targetOk = (r) => r.level <= 4 ? r.ttk >= 5 && r.ttk <= 12 : r.ttk >= 9 && r.ttk <= 14;

const dpx = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / SUB;
const auraOn = (t, id, src) => t.auras.some((a) => a.id === id && (src == null || a.src === src));

/** A Builds 2 Mender at `level` with `build` spent through the real rules. Returns the duel world. */
export function makeHero(build, level, seed = 1) {
  const d = duelWorld({ seed, cls: 'mender', level, x: 40, y: 15, learnAll: false, builds2: true });
  const { world, p, C } = d;
  p.build.firstKill = true;
  p.build.leaning = build.id;
  for (const lv of [1, 3, 6]) if (level >= lv && build.picks[lv]) C.b2.pick(p, { level: lv, ability: build.picks[lv] });
  for (const id of build.path.slice(0, level)) if (!C.b2.learn(p, { node: id })) throw new Error(`${build.id} L${level}: cannot learn ${id} (${C.b2.whyNot(p, id)})`);
  C.stats.recalc(p); p.hp = p.hpMax; p.res.cur = p.res.max;
  return d;
}

function bot(world, p, t, foes, build) {
  const knows = (id) => p.known.includes(id);
  const ab = (id) => world.internals.data.ability(p, id);
  const cost = (id) => { const c = ab(id).cost; if (!c) return 0; return typeof c.amount === 'number' ? c.amount : c.amount.base + c.amount.perLevel * p.level; };
  const can = (id, m = null) => knows(id) && (p.cd[id] || 0) <= world.tick && p.res.cur >= cost(id) && (!m || !ab(id).range || dpx(m, p) <= ab(id).range.max - 2);
  const hp = p.hp / p.hpMax;
  const alive = foes.filter((m) => !m.dead);
  if (knows('mender_warding_word') && !auraOn(p, 'mender_spoken_for') && hp < 0.9 && can('mender_warding_word', p)) return { ab: 'mender_warding_word', target: p };
  if (hp < 0.4 && can('mender_mend', p)) return { ab: 'mender_mend', target: p };
  if (hp < 0.75 && knows('mender_steady_name') && !auraOn(p, 'mender_steady_name', p.id) && can('mender_steady_name', p)) return { ab: 'mender_steady_name', target: p };
  if (alive.filter((m) => dpx(m, p) <= 96).length >= 2 && can('mender_chorus')) return { ab: 'mender_chorus' };
  if (knows('mender_brand')) {
    const bare = alive.find((m) => !auraOn(m, 'mender_brand', p.id) && dpx(m, p) <= 128);
    if (bare && can('mender_brand', bare)) return { ab: 'mender_brand', target: bare };
  }
  // the Battle Mender swings her rod and keeps her mana for Brand and heals; she Kindles only when the foe is low
  if (build.melee && t.hp > t.hpMax * 0.25 && p.res.cur < p.res.max * 0.8) return null;
  if (can('mender_kindle', t)) return { ab: 'mender_kindle', target: t };
  return null;
}

/** One fight: { ttk, pct (health lost %), died, won }. */
export function fight(build, level, seed, { pack = 1 } = {}) {
  const { world, pid, p } = makeHero(build, level, seed);
  const melee = !!build.melee;
  if (p.known.some((k) => k.startsWith('mender_blessing'))) { const bl = p.known.find((k) => k.startsWith('mender_blessing')); world.enqueue(pid, { t: 'cast', ability: bl }); world.step(); world.step(); }
  for (let i = 0; i < 25; i++) world.step();
  const foes = [];
  const spots = [[0, 0], [0, 1], [1, 0]];
  for (let i = 0; i < pack; i++) {
    const [ox, oy] = spots[i];
    const m = addMob(world, `brute_${level}`, 40 + (melee ? 2 : 8) + ox, 15 + oy, pack > 1 ? { pack, group: 'test_pack' } : {});
    if (melee) { m.x = p.x + (20 + 12 * ox) * SUB; m.y = p.y + 12 * oy * SUB; }
    foes.push(m);
  }
  if (pack > 1) for (const m of foes) { world.internals.stats.recalc(m); m.hp = m.hpMax; }
  p.hp = p.hpMax; p.res.cur = p.res.max;
  const hp0 = p.hpMax;
  let tgt = foes[0], start = null, low = p.hp;
  world.enqueue(pid, { t: 'target', id: tgt.id });
  if (melee) world.enqueue(pid, { t: 'attack', id: tgt.id });
  for (let i = 0; i < MAX_TICKS && !p.dead && foes.some((m) => !m.dead); i++) {
    if (tgt.dead) {
      tgt = foes.filter((m) => !m.dead).sort((a, b) => dpx(a, p) - dpx(b, p) || a.id - b.id)[0];
      world.enqueue(pid, { t: 'target', id: tgt.id });
      if (melee) world.enqueue(pid, { t: 'attack', id: tgt.id });
    }
    if (!p.cast) {
      const gap = dpx(tgt, p);
      const want = melee ? 34 : 120;
      if (gap > want) world.enqueue(pid, { t: 'move', dx: Math.sign(tgt.x - p.x), dy: Math.abs(tgt.y - p.y) > 24 * SUB ? Math.sign(tgt.y - p.y) : 0 });
      else if (p.mx || p.my) world.enqueue(pid, { t: 'move', dx: 0, dy: 0 });
    }
    if (!p.cast && world.tick >= p.gcdUntil && !(p.mx || p.my)) {
      const pick = bot(world, p, tgt, foes, build);
      if (pick) world.enqueue(pid, { t: 'cast', ability: pick.ab, ...(pick.target ? { target: pick.target.id } : {}) });
    }
    const ev = world.step();
    if (start == null && ev.some((e) => e.type === 'damage' && e.src === pid && e.amount > 0)) start = world.tick;
    low = Math.min(low, p.hp);
  }
  const won = foes.every((m) => m.dead);
  return { ttk: ((won || p.dead ? world.tick : MAX_TICKS) - (start ?? 0)) / 20, pct: (100 * (hp0 - p.hp)) / hp0, low: (100 * (hp0 - low)) / hp0, died: p.dead, won };
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
export function runBuild(build, level, runs = 20, opts = {}) {
  const rs = [];
  for (let s = 1; s <= runs; s++) rs.push(fight(build, level, 3000 + s * 7919 + level * 31 + (opts.pack || 1) * 101, opts));
  return { build: build.id, level, pack: opts.pack || 1, runs, ttk: mean(rs.map((r) => r.ttk)), pct: mean(rs.map((r) => r.pct)), low: mean(rs.map((r) => r.low)),
    deaths: rs.filter((r) => r.died).length, wins: rs.filter((r) => r.won).length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const runs = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) || 20 : 20;
  const withPack = args.includes('--pack');
  const t0 = Date.now();
  const rows = [];
  for (const L of B2_LEVELS) for (const b of NAMED) rows.push(runBuild(b, L, runs));
  const f1 = (n) => Number(n).toFixed(1), f0 = (n) => Number(n).toFixed(0);
  console.log('| level | build | one foe: TTK (s) | hp lost (worst point) | deaths | solo band | BUILDS_2 target |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.level} | ${r.build} | ${f1(r.ttk)} | ${f0(r.low)}% | ${r.deaths} | ${bandOk(r) ? 'yes' : 'NO'} | ${targetOk(r) ? 'yes' : 'no'} |`);
  let spreadOk = 0;
  for (const L of B2_LEVELS) {
    const t = rows.filter((r) => r.level === L).map((r) => r.ttk);
    const ok = Math.max(...t) <= 1.25 * Math.min(...t);
    if (ok) spreadOk++;
    console.log(`level ${L}: slowest / fastest ${(Math.max(...t) / Math.min(...t)).toFixed(2)}x ${ok ? 'within 25%' : 'over 25% (BUILDS_2 7.3 target; reported, tuned in phase 2)'}`);
  }
  if (withPack) {
    console.log('\n| level | build | 3-pack: clear (s) | hp lost (worst point) | deaths |');
    console.log('|---|---|---|---|---|');
    for (const L of B2_LEVELS.filter((x) => x >= 3)) for (const b of NAMED) { const r = runBuild(b, L, runs, { pack: 3 }); console.log(`| ${L} | ${b.id} | ${f1(r.ttk)} | ${f0(r.pct)}% (${f0(r.low)}%) | ${r.deaths} |`); }
  }
  const ok = rows.filter(bandOk).length, tgt = rows.filter(targetOk).length, deaths = rows.reduce((s, r) => s + r.deaths, 0);
  console.log(`\n${rows.length} cells, ${runs} runs each, ${Date.now() - t0} ms.`);
  console.log(`BUILDS2_DONE: cells=${rows.length} runs=${runs} solo_ok=${ok} deaths=${deaths} target_ok=${tgt} spread_ok=${spreadOk}`);
}

// Headless balance harness (PROGRESSION 9): each class at levels 1, 8 and 15, design gear, against a same-level normal
// mob, played by a simple rotation bot (the PROGRESSION 9.1 rotations), N seeded runs per cell. Reports time to kill and
// health lost, side by side with the expected-value reference (qa/design/ttk_check.py) and the 8 to 14 s target.
//
//   node qa/sim/duel.mjs                 200 runs per cell, prints the table, writes docs/design/BALANCE.md
//   node qa/sim/duel.mjs --runs 20 --no-write
//   import { duel, runCell } from './duel.mjs'   (tests)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { duelWorld, addMob } from './_fixtures.mjs';
// The band (fix pass 1, critique 7): from the first hit, 8 to 14 s; at levels 1 to 4 the foes are 30% lighter
// (PROGRESSION mobCurve.lowLevelHp) and the target is 10 to 14 s FROM THE PULL, which the questbot measures in the field
// (docs/PLAYTEST_BOT.md "After fix pass 1"); from the first hit that is 5 to 12 s here.
const inBand = (c) => (c.level <= 4 ? c.ttk >= 5 && c.ttk <= 12 : c.ttk >= 8 && c.ttk <= 14);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
export const LEVELS = [1, 8, 15];
const RANGED = { mender: 8, scribe: 8, wayfinder: 8 };     // tiles between player and mob at the pull
const MAX_TICKS = 20 * 90;

// ------------------------------------------------------------------------------------------------ rotation bots
function ready(world, p, id) { return (p.cd[id] || 0) <= world.tick && p.known.includes(id); }
function auraFrom(t, id, src) { return t.auras.find((a) => a.id === id && a.src === src); }

const BOTS = {
  warden(world, p, m) {
    if (ready(world, p, 'warden_shield_bash')) return 'warden_shield_bash';
    if (p.level >= 10 && p.res.cur >= 60 && ready(world, p, 'warden_sweeping_blow')) return 'warden_sweeping_blow';
    if (p.res.cur >= 20) return 'warden_strike';
    return null;
  },
  mender(world, p, m) {
    if (p.hp / p.hpMax < 0.3 && p.res.cur >= 30) return 'mender_mend';
    if (p.level >= 3 && !auraFrom(m, 'mender_brand', p.id) && ready(world, p, 'mender_brand')) return 'mender_brand';
    return 'mender_kindle';
  },
  scribe(world, p, m) {
    if (ready(world, p, 'scribe_scrawl')) return 'scribe_scrawl';
    if (p.level >= 6 && !auraFrom(m, 'scribe_underline', p.id)) return 'scribe_underline';
    return 'scribe_inkbolt';
  },
  wayfinder(world, p, m) {
    if (p.level >= 10 && ready(world, p, 'wayfinder_aimed_shot') && p.res.cur >= 30) return 'wayfinder_aimed_shot';
    if (ready(world, p, 'wayfinder_pinning_shot') && p.res.cur >= 15) return 'wayfinder_pinning_shot';
    if (p.res.cur >= 25) return 'wayfinder_quick_shot';
    return null;
  },
  inkblade(world, p, m) {
    const n = p.combo && p.combo.target === m.id ? p.combo.n : 0;
    if (p.level >= 10 && n >= 3 && !auraFrom(m, 'inkblade_bleed_line', p.id) && p.res.cur >= 25) return 'inkblade_bleed_line';
    if (n >= 3 && p.res.cur >= 25) return 'inkblade_spill';
    if (p.res.cur >= 30) return 'inkblade_nick';
    return null;
  },
};

/** One fight. Returns { ttk (s), lost (hp), hpMax, pct, died, manaUsed, events }. */
export function duel(cls, level, seed, { talents = null, keepEvents = false, mob = null } = {}) {
  const ranged = RANGED[cls] || 0;
  const px = 10, py = 15;
  const { world, pid, p } = duelWorld({ seed, cls, level, x: px, y: py, talents });
  const m = addMob(world, mob || `brute_${level}`, px + (ranged || 1), py);
  if (!ranged) { m.x = p.x + 20 * 16; }                    // melee: start in reach, as PROGRESSION 9.1 assumes
  world.enqueue(pid, { t: 'target', id: m.id });
  if (cls === 'wayfinder' && level >= 3) world.enqueue(pid, { t: 'cast', ability: 'wayfinder_briar_trap' });
  else if (!['mender', 'scribe'].includes(cls)) world.enqueue(pid, { t: 'attack', id: m.id });
  const hp0 = p.hpMax;
  const mana0 = p.res && p.res.kind === 'mana' ? p.res.cur : 0;
  let manaUsed = 0, lastMana = mana0;
  let start = null;
  const events = [];
  for (let i = 0; i < MAX_TICKS && !m.dead && !p.dead; i++) {
    if (!p.cast && world.tick >= p.gcdUntil) {
      const ab = BOTS[cls](world, p, m);
      if (ab) world.enqueue(pid, { t: 'cast', ability: ab, target: m.id });
    }
    if (cls === 'wayfinder' && level >= 3 && i === 22) world.enqueue(pid, { t: 'attack', id: m.id });
    const ev = world.step();
    if (start == null && ev.some((e) => e.type === 'damage' && e.src === pid)) start = world.tick;
    if (p.res && p.res.kind === 'mana') { if (p.res.cur < lastMana) manaUsed += lastMana - p.res.cur; lastMana = p.res.cur; }
    if (keepEvents) events.push(...ev);
  }
  const ttk = ((m.dead ? world.tick : MAX_TICKS) - (start ?? 0)) / 20;
  const lost = hp0 - p.hp;
  return { ttk, lost, hpMax: hp0, pct: (100 * lost) / hp0, died: p.dead, won: m.dead, manaUsed: Math.round(manaUsed), manaMax: p.res && p.res.kind === 'mana' ? p.res.max : 0,
    mobHp: m.hpMax, hash: world.hash(), events: keepEvents ? events : null };
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const pctl = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export function runCell(cls, level, runs = 200, opts = {}) {
  const rs = [];
  for (let s = 1; s <= runs; s++) rs.push(duel(cls, level, 1000 + s * 7919 + level * 31, opts));
  const ttks = rs.map((r) => r.ttk), pcts = rs.map((r) => r.pct);
  return {
    cls, level, runs, mobHp: rs[0].mobHp, hpMax: rs[0].hpMax,
    ttk: mean(ttks), ttkP10: pctl(ttks, 0.1), ttkP90: pctl(ttks, 0.9),
    lost: mean(rs.map((r) => r.lost)), pct: mean(pcts), pctP90: pctl(pcts, 0.9),
    deaths: rs.filter((r) => r.died).length, wins: rs.filter((r) => r.won).length,
    mana: mean(rs.map((r) => r.manaUsed)), manaMax: rs[0].manaMax,
  };
}

/** PROGRESSION 9.2 reference (expected value). Read live from ttk_check.py when Python is there, else this copy. */
const REF_COPY = {
  'warden 1': [9.9, 8], 'warden 8': [12.1, 24], 'warden 15': [12.3, 28],
  'mender 1': [12.4, 15], 'mender 8': [11.9, 28], 'mender 15': [13.5, 42],
  'scribe 1': [12.4, 16], 'scribe 8': [13.4, 38], 'scribe 15': [13.4, 46],
  'wayfinder 1': [10.7, 10], 'wayfinder 8': [13.3, 28], 'wayfinder 15': [13.3, 33],
  'inkblade 1': [9.7, 13], 'inkblade 8': [11.3, 37], 'inkblade 15': [13.0, 44],
};
export function reference() {
  try {
    const out = execFileSync('python', [path.join(ROOT, 'qa', 'design', 'ttk_check.py')], { timeout: 20000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const ref = {};
    for (const line of out.split('\n')) {
      const m = line.trim().split(/\s+/);
      if (m.length >= 7 && CLASSES.includes(m[0])) ref[`${m[0]} ${m[1]}`] = [Number(m[3]), Number(m[6])];
    }
    if (Object.keys(ref).length === 15) return { ref, source: 'qa/design/ttk_check.py (run live)' };
  } catch { /* fall through */ }
  return { ref: REF_COPY, source: 'PROGRESSION.md 9.2 (copy; Python not available)' };
}

function fmt(n, d = 1) { return Number(n).toFixed(d); }

export function table(cells, ref) {
  const rows = ['| class | level | mob hp | your hp | TTK mean (s) | TTK p10 to p90 | design TTK | HP lost mean | HP lost p90 | design HP lost | mana used / max | deaths | in band |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const c of cells) {
    const r = ref[`${c.cls} ${c.level}`] || ['', ''];
    const ok = inBand(c) && c.deaths === 0;
    rows.push(`| ${c.cls} | ${c.level} | ${c.mobHp} | ${c.hpMax} | ${fmt(c.ttk)} | ${fmt(c.ttkP10)} to ${fmt(c.ttkP90)} | ${r[0]} | ${fmt(c.pct, 0)}% | ${fmt(c.pctP90, 0)}% | ${r[1]}% | ${c.manaMax ? `${fmt(c.mana, 0)} / ${c.manaMax}` : ''} | ${c.deaths} | ${ok ? 'yes' : 'NO'} |`);
  }
  return rows.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const runs = Number((args[args.indexOf('--runs') + 1]) || 200) || 200;
  const write = !args.includes('--no-write');
  const t0 = Date.now();
  const cells = [];
  for (const c of CLASSES) for (const L of LEVELS) cells.push(runCell(c, L, args.includes('--runs') ? runs : 200));
  const { ref, source } = reference();
  const tbl = table(cells, ref);
  console.log(tbl);
  const allOk = cells.every((c) => inBand(c) && c.deaths === 0);
  console.log(`\n${cells.length} cells, ${cells[0].runs} runs each, ${Date.now() - t0} ms. All in band (8 to 14 s; 5 to 12 s at levels 1 to 4) with no deaths: ${allOk}`);
  console.log(`DUEL_DONE: cells=${cells.length} runs=${cells[0].runs} in_band=${cells.filter((c) => inBand(c) && c.deaths === 0).length}`);
  if (write) {
    const md = fs.readFileSync(path.join(ROOT, 'qa', 'sim', 'balance_template.md'), 'utf8')
      .replace('{{TABLE}}', tbl).replace('{{RUNS}}', String(cells[0].runs)).replace('{{REF}}', source)
      .replace('{{VERDICT}}', allOk ? 'Every cell is inside its band (8 to 14 s; 5 to 12 s from the first hit at levels 1 to 4) and no bot died.' : 'Some cells are outside the band; see the table.');
    fs.writeFileSync(path.join(ROOT, 'docs', 'design', 'BALANCE.md'), md);
    console.log('wrote docs/design/BALANCE.md');
  }
}

// Matchup harness (class identity pass, Scott 2026-11-19: "Each class should have its own unique strength(s) and
// weakness(es)"). Each class at levels 6, 10 and 15 (design gear, no talents, the played-well bots of pack.mjs) against one
// same-level foe of each trait (PROGRESSION mobTraits; the fixtures in _fixtures.mjs are the plain test foe plus that one
// trait) and against a 3-pack. Every number is against the class's own plain one-foe fight:
//   trait rows: time to kill and health lost, divided by the same against one plain foe
//   pack row:   the 3-pack (2 foes of health) against two plain foes in a row (twice the time, twice the health lost)
// So 1.30x health on a row means that foe costs the class 30% more health than a plain foe; 0.75x is a strength.
//
//   node qa/sim/matchup.mjs                 30 runs per cell, prints, writes the MATCHUP block of BALANCE.md
//   node qa/sim/matchup.mjs --runs 10 --no-write
// Prints MATCHUP_DONE: cells=<n> runs=<n> (machine-read sentinel).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCell, CLASSES } from './pack.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TRAITS = ['armored', 'caster', 'fast', 'heavy', 'tough'];
export const M_LEVELS = [6, 10, 15];
// the headline of each class (docs/design/CLASSES.md, strengths and weaknesses): strong against, weak against
export const IDENTITY = {
  warden: { strong: 'pack', weak: 'heavy' },
  mender: { strong: 'tough', weak: 'pack' },
  scribe: { strong: 'armored', weak: 'fast' },
  wayfinder: { strong: 'fast', weak: 'caster' },
  inkblade: { strong: 'caster', weak: 'armored' },
};

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
// health lost floors at 10% of max, so a class that loses almost nothing on a plain foe (the Mender) still reads sensibly
const H = (x) => Math.max(10, x);

/** Everything for one class: { cls, rows: { trait: { ttk, hp, absTtk, absHp, deaths } } } averaged over M_LEVELS. */
export function classMatchups(cls, runs = 30) {
  const acc = {};
  const push = (k, v) => (acc[k] = acc[k] || []).push(v);
  for (const L of M_LEVELS) {
    const base = runCell(cls, L, runs, { pack: 1 });
    for (const tr of TRAITS) {
      const c = runCell(cls, L, runs, { pack: 1, foe: tr });
      push(tr, { ttk: c.ttk / base.ttk, hp: H(c.pct) / H(base.pct), absTtk: c.ttk, absHp: c.pct, deaths: c.deaths });
    }
    const k = runCell(cls, L, runs, { pack: 3 });
    push('pack', { ttk: k.ttk / (2 * base.ttk), hp: H(k.low) / H(2 * base.pct), absTtk: k.ttk, absHp: k.low, deaths: k.deaths });
    push('plain', { ttk: 1, hp: 1, absTtk: base.ttk, absHp: base.pct, deaths: base.deaths });
  }
  const rows = {};
  for (const [k, v] of Object.entries(acc)) {
    rows[k] = { ttk: mean(v.map((x) => x.ttk)), hp: mean(v.map((x) => x.hp)), absTtk: mean(v.map((x) => x.absTtk)), absHp: mean(v.map((x) => x.absHp)),
      deaths: v.reduce((s, x) => s + x.deaths, 0) };
  }
  return { cls, rows };
}

const f2 = (n) => Number(n).toFixed(2), f0 = (n) => Number(n).toFixed(0), f1 = (n) => Number(n).toFixed(1);
/** One number per cell: the mean of the time and health ratios (1.00 = this foe costs the class what a plain foe does). */
export const combined = (r) => (r.ttk + r.hp) / 2;
/** Against the field: the class's combined cost on a row divided by the mean of all five classes on that row. Some foes cost
 * everyone more (a tough foe takes everyone 1.7x as long); a strength is costing clearly LESS than the field, a weakness MORE. */
export function vsField(all, cls, col) {
  const me = combined(all.find((m) => m.cls === cls).rows[col]);
  const field = all.reduce((s, m) => s + combined(m.rows[col]), 0) / all.length;
  return me / field;
}

export function matchupTable(all) {
  const cols = ['pack', ...TRAITS];
  const out = [`| class | ${cols.map((c) => `${c}: time / health`).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
  for (const m of all) {
    const id = IDENTITY[m.cls];
    const cell = (c) => {
      const r = m.rows[c];
      const tag = c === id.strong ? ' **S**' : c === id.weak ? ' **W**' : '';
      return `${f2(r.ttk)}x / ${f2(r.hp)}x${tag}${r.deaths ? ` (${r.deaths} died)` : ''}`;
    };
    out.push(`| ${m.cls} | ${cols.map(cell).join(' | ')} |`);
  }
  return out.join('\n');
}

export function fieldTable(all) {
  const cols = ['pack', ...TRAITS];
  const out = [`| class | ${cols.join(' | ')} | strong: vs field | weak: vs field |`, `|---|${cols.map(() => '---').join('|')}|---|---|`];
  for (const m of all) {
    const id = IDENTITY[m.cls];
    const pc = (x) => `${x >= 1 ? '+' : ''}${f0(100 * (x - 1))}%`;
    const cell = (c) => `${pc(vsField(all, m.cls, c))}${c === id.strong ? ' **S**' : c === id.weak ? ' **W**' : ''}`;
    out.push(`| ${m.cls} | ${cols.map(cell).join(' | ')} | ${id.strong} ${pc(vsField(all, m.cls, id.strong))} | ${id.weak} ${pc(vsField(all, m.cls, id.weak))} |`);
  }
  return out.join('\n');
}

export function absTable(all) {
  const cols = ['plain', 'pack', ...TRAITS];
  const out = [`| class | ${cols.map((c) => `${c}: s / hp lost`).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
  for (const m of all) out.push(`| ${m.cls} | ${cols.map((c) => `${f1(m.rows[c].absTtk)} / ${f0(m.rows[c].absHp)}%`).join(' | ')} |`);
  return out.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const runs = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) || 30 : 30;
  const only = args.includes('--cls') ? args[args.indexOf('--cls') + 1].split(',') : CLASSES;
  const write = !args.includes('--no-write') && only.length === CLASSES.length;
  const t0 = Date.now();
  const all = only.map((c) => classMatchups(c, runs));
  const t1 = matchupTable(all), t2 = absTable(all), t3 = all.length === CLASSES.length ? fieldTable(all) : '';
  console.log(t1 + '\n\n' + t3 + '\n\n' + t2);
  console.log(`\n${all.length} classes, levels ${M_LEVELS.join(', ')}, ${runs} runs per cell, ${Date.now() - t0} ms.`);
  console.log(`MATCHUP_DONE: cells=${all.length * M_LEVELS.length * (TRAITS.length + 2)} runs=${runs}`);
  if (write) {
    const block = `<!-- MATCHUP:START (written by node qa/sim/matchup.mjs; do not hand-edit) -->\nEach class against each foe, as a multiple of its own plain one-foe fight (time / health lost; health floors at 10% of max; pack: against two plain foes in a row):\n\n${t1}\n\nThe same against the field (the class's mean of time and health, divided by the five classes' mean on that row; + means that foe costs this class more than it costs the field):\n\n${t3}\n\nThe same fights in seconds and health lost (pack: worst point), mean of levels ${M_LEVELS.join(', ')}:\n\n${t2}\n\n${runs} seeded runs per cell, levels ${M_LEVELS.join(', ')}.\n<!-- MATCHUP:END -->`;
    const f = path.join(ROOT, 'docs', 'design', 'BALANCE.md');
    const md = fs.readFileSync(f, 'utf8');
    if (/<!-- MATCHUP:START/.test(md)) { fs.writeFileSync(f, md.replace(/<!-- MATCHUP:START[\s\S]*?<!-- MATCHUP:END -->/, block)); console.log('wrote the MATCHUP block of docs/design/BALANCE.md'); }
    else console.log('no MATCHUP block in BALANCE.md; not written');
  }
}

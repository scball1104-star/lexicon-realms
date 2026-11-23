// Sim-level questing bot (docs/PLAYTEST_BOT.md). For each class, a new character plays the real content from level 1
// with NO dev hooks: only world.enqueue(commands) a player could send. Stops at level 10 or the time cap.
//
//   node qa/bot/questbot.mjs                       5 classes x 3 seeds, parallel child runs, summary
//   node qa/bot/questbot.mjs --cls warden --seed 1 --cap 240     one run (sim minutes cap), JSON to qa/out/bot/runs/
//   options: --seeds 1,2,3  --jobs 5  --stop 10  --timeout 600 (wall seconds per run)
//   to 20 (cap 30 lane): --stop 20 --cap 900 --timeout 3600 (about 12 to 15 wall minutes a run)
// Prints QUESTBOT_DONE: runs=<n> reached10=<n> errors=<n> violations=<n> (machine-read sentinel).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContent } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/index.js';
import { createBot } from './lib/bot.mjs';
import { RB_QUEST_ORDER } from '../../src/data/rootbound.js';
import { SH_QUEST_ORDER } from '../../src/data/saffron.js';
import { NH_QUEST_ORDER } from '../../src/data/hollow.js';
import { REALMS2_ORDER } from '../../src/data/start_realms2.js';
const REALM_ORDER = { rootbound: RB_QUEST_ORDER, saffron: SH_QUEST_ORDER, hollow: NH_QUEST_ORDER, ...REALMS2_ORDER };

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'out', 'bot', 'runs');
mkdirSync(OUT, { recursive: true });
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];

export function runOne(cls, seed, capMin = 240, stopLevel = 10) {
  const base = buildContent();
  // The real path (audit 2026-11-23): a new hero starts in its class's start realm (src/main.js) and never sees the other
  // four realms' quests, so they leave the bot's list (before, the bot chased them and stood at level 1 for 30 minutes).
  // --legacy keeps the old Willowmere start with every quest.
  const legacy = process.argv.includes('--legacy');
  const R = base.startRealms[cls];
  const others = new Set(Object.values(base.startRealms).map((r) => r.zone).filter((z) => !R || z !== R.zone));
  // the realm's own chain first (its last hand-in leads up to Willowmere), then the main chain
  const realmOrder = R ? REALM_ORDER[R.zone] || [] : [];
  const content = legacy || !R ? base : { ...base, questOrder: [...realmOrder, ...base.questOrder.filter((id) => !realmOrder.includes(id))],
    sideQuests: base.sideQuests.filter((id) => !others.has((base.quests[id] || {}).zone) && !realmOrder.includes(id)) };
  const world = createWorld({ seed: 1000 + seed, content });
  const name = 'Bot' + cls[0].toUpperCase() + cls.slice(1, 6);
  const spec = legacy || !R ? null : { name, cls, look: seed % 3, zone: R.zone, x: R.x, y: R.y, lantern: { ...R.lantern }, home: { inn: R.home }, lanternStone: true, newHero: true };
  const bot = createBot({ world, content, cls, seed, name, spec, opts: { stopLevel } });
  const cap = capMin * 1200;
  let events = [];
  const t0 = Date.now();
  while (!bot.done && world.tick < cap) {
    bot.tick(events);
    try { events = world.step(); } catch (err) {
      bot.R.errors.push({ min: +(world.tick / 1200).toFixed(2), error: 'world.step threw: ' + (err.stack || err) });
      bot.R.reason = 'exception';
      break;
    }
  }
  const rep = bot.report();
  if (!rep.reason) rep.reason = 'time_cap';
  rep.wallSec = (Date.now() - t0) / 1000;
  rep.ticks = world.tick;
  return rep;
}

function summarize(reps) {
  const rows = [];
  for (const r of reps) {
    const lm = r.levelMin || {};
    const deaths = r.deaths.length;
    const tr = (r.trainer || []).map((t) => `${t.ability.split('_').slice(1).join('_')}@L${t.level} ${t.cost}g: gold@reach ${t.goldAtReach ?? '-'}, trained ${t.trainedMin != null ? (t.trainedMin - (t.reachedMin ?? t.trainedMin)).toFixed(1) + 'm after' : 'NEVER'}`);
    rows.push({ cls: r.cls, seed: r.seed, to5: lm[5] ?? null, to10: lm[10] ?? null, endLevel: r.final && r.final.level, endMin: r.endMin, reason: r.reason, deaths,
      gold: r.final && r.final.gold, stuck: r.stuck.length, navStuck: r.counters.navStuck, errors: r.errors.length, violations: r.violations.length,
      questsDone: r.final && r.final.questsDone, trainer: tr, wallSec: r.wallSec });
  }
  return rows;
}

async function main() {
  const one = arg('cls');
  const cap = Number(arg('cap', 240));
  const stop = Number(arg('stop', 10));
  if (one) {
    const seed = Number(arg('seed', 1));
    const rep = runOne(one, seed, cap, stop);
    writeFileSync(join(OUT, `${one}_${seed}.json`), JSON.stringify(rep, null, 1));
    const lm = rep.levelMin;
    console.log(`RUN ${one} seed ${seed}: L${rep.final.level} at ${rep.endMin} min (${rep.reason}), to5 ${lm[5]}, to10 ${lm[10]}, deaths ${rep.deaths.length}, gold ${rep.final.gold}, stuck ${rep.stuck.length}, errors ${rep.errors.length}, violations ${rep.violations.length}, wall ${rep.wallSec}s`);
    return;
  }
  const seeds = String(arg('seeds', '1,2,3')).split(',').map(Number);
  const jobs = Number(arg('jobs', 5));
  const timeout = Number(arg('timeout', 900)) * 1000;
  const queue = [];
  for (const cls of CLASSES) for (const seed of seeds) queue.push([cls, seed]);
  const results = [];
  let running = 0;
  await new Promise((resolve) => {
    const next = () => {
      if (!queue.length && !running) return resolve();
      while (running < jobs && queue.length) {
        const [cls, seed] = queue.shift();
        running++;
        const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), '--cls', cls, '--seed', String(seed), '--cap', String(cap), '--stop', String(stop)], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        ch.stdout.on('data', (d) => { out += d; });
        ch.stderr.on('data', (d) => { err += d; });
        const timer = setTimeout(() => { ch.kill(); err += '\nTIMEOUT'; }, timeout);
        ch.on('close', (code) => {
          clearTimeout(timer);
          running--;
          process.stdout.write(out.trim() ? out : `RUN ${cls} ${seed} FAILED code ${code}\n${err.slice(-2000)}\n`);
          const f = join(OUT, `${cls}_${seed}.json`);
          if (code === 0 && existsSync(f)) results.push(JSON.parse(readFileSync(f, 'utf8')));
          else results.push({ cls, seed, crashed: true, err: err.slice(-3000) });
          next();
        });
      }
    };
    next();
  });
  const ok = results.filter((r) => !r.crashed);
  const rows = summarize(ok);
  writeFileSync(join(HERE, '..', 'out', 'bot', 'summary.json'), JSON.stringify({ rows, crashed: results.filter((r) => r.crashed) }, null, 1));
  console.table(rows.map(({ trainer, ...r }) => r));
  const reached = rows.filter((r) => r.to10 != null).length;
  console.log(`QUESTBOT_DONE: runs=${results.length} reached10=${reached} reached_stop=${rows.filter((r) => r.endLevel >= stop).length} stop=${stop} crashed=${results.length - ok.length} errors=${rows.reduce((s, r) => s + r.errors, 0)} violations=${rows.reduce((s, r) => s + r.violations, 0)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

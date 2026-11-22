// The questing bot (qa/bot/lib/bot.mjs, only commands a player could send) starting in a start realm (big world piece 1,
// 2026-11-22): a new hero of the class, made the way src/main.js makes one that keeps its class's realm, plays that
// realm's quests (src/data/rootbound.js RB_QUEST_ORDER), until level 6 and the realm's chain are done, or the time cap.
//
//   node qa/bot/realmbot.mjs                        scribe and warden, seeds 1 and 2 (any class may start in a realm)
//   node qa/bot/realmbot.mjs --cls scribe --seed 1 --cap 150 --stop 6
// Prints REALMBOT_DONE: runs=<n> reached=<n> realmDone=<n> errors=<n> violations=<n> (machine-read sentinel), and the
// realm's quests each run finished. JSON per run in qa/out/bot/realm/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContent } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/index.js';
import { RB_QUEST_ORDER } from '../../src/data/rootbound.js';
import { createBot } from './lib/bot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'out', 'bot', 'realm');
mkdirSync(OUT, { recursive: true });
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };

export function runRealm(cls, seed, capMin = 150, stopLevel = 6) {
  const base = buildContent();
  // the bot walks the quest order it is given: the realm's quests, then the old chain
  const content = { ...base, questOrder: [...RB_QUEST_ORDER], sideQuests: [] };   // the realm only (its last hand-in is up in Willowmere)
  const world = createWorld({ seed: 2000 + seed, content });
  const R = content.startRealms.scribe;
  const spec = { name: 'Bot' + cls[0].toUpperCase() + cls.slice(1, 6), cls, look: seed % 3, zone: R.zone, x: R.x, y: R.y, lantern: { ...R.lantern }, home: { inn: R.home },
    lanternStone: true, newHero: true };
  const bot = createBot({ world, content, cls, seed, spec, opts: { stopLevel } });
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
  const p = world.get(bot.id ?? world.state.ents.find((e) => e.kind === 'player').id);
  rep.realmDone = RB_QUEST_ORDER.filter((q) => (p.questsDone || []).includes(q));
  rep.realmActive = RB_QUEST_ORDER.filter((q) => (p.quests || {})[q]);
  rep.zoneNow = p.zone;
  return rep;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const one = arg('cls');
  const runs = one ? [[one, Number(arg('seed', 1))]] : [['scribe', 1], ['scribe', 2], ['warden', 1]];
  let reached = 0, realmDone = 0, errors = 0, violations = 0;
  for (const [cls, seed] of runs) {
    const rep = runRealm(cls, seed, Number(arg('cap', 150)), Number(arg('stop', 6)));
    writeFileSync(join(OUT, `${cls}_${seed}.json`), JSON.stringify(rep, null, 1));
    const L = rep.final ? rep.final.level : 0;
    if (L >= Number(arg('stop', 6))) reached++;
    if (rep.realmDone.length >= RB_QUEST_ORDER.length - 1) realmDone++;
    errors += rep.errors.length; violations += rep.violations.length;
    const vk = {};
    for (const v of rep.violations) vk[v.kind || v.type || 'v'] = (vk[v.kind || v.type || 'v'] || 0) + 1;
    console.log(`RUN ${cls} seed ${seed}: L${L} at ${rep.endMin} min (${rep.reason}), deaths ${rep.deaths.length}, realm quests ${rep.realmDone.length}/${RB_QUEST_ORDER.length} (open: ${rep.realmActive.join(' ') || '-'}), in ${rep.zoneNow}, errors ${rep.errors.length}, violations ${rep.violations.length} ${JSON.stringify(vk)}, wall ${rep.wallSec}s`);
    if (rep.errors.length) console.log('  first error:', String(rep.errors[0].error).split('\n').slice(0, 3).join(' | '));
  }
  console.log(`REALMBOT_DONE: runs=${runs.length} reached=${reached} realmDone=${realmDone} errors=${errors} violations=${violations}`);
}

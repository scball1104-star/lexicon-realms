// The realm bot for the wave 3 start realms (lane realms1, 2026-11-22): qa/bot/realmbot.mjs's run, for Emberpeak and
// Valewyn. A new hero made the way src/main.js makes one that keeps a start realm plays that realm's quests
// (src/data/start_realms2.js REALMS2_ORDER) until level 6 and the chain are done, or the time cap.
//
//   node qa/bot/realmbot2.mjs                       warden in Emberpeak, mender in Valewyn, plus a scribe in each (seed 1)
//   node qa/bot/realmbot2.mjs --realm emberpeak --cls warden --seed 2 --cap 150 --stop 6
// Prints REALMBOT2_DONE: runs=<n> reached=<n> realmDone=<n> errors=<n> violations=<n> (machine-read sentinel), and the
// realm's quests each run finished. JSON per run in qa/out/bot/realm2/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContent } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/index.js';
import { REALMS2_ORDER } from '../../src/data/start_realms2.js';
import { START_REALMS } from '../../src/data/rootbound.js';
import { createBot } from './lib/bot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'out', 'bot', 'realm2');
mkdirSync(OUT, { recursive: true });
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };

const REALM_CLS = { emberpeak: 'warden', valewyn: 'mender' };
export function runRealm(realm, cls, seed, capMin = 150, stopLevel = 6) {
  const ORDER = REALMS2_ORDER[realm];
  const base = buildContent();
  // the bot walks the quest order it is given: the realm's quests, then the old chain
  const content = { ...base, questOrder: [...ORDER], sideQuests: [] };   // the realm only (its last hand-in is up in Willowmere)
  const world = createWorld({ seed: 2000 + seed, content });
  const R = START_REALMS[REALM_CLS[realm]];
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
  rep.realmDone = ORDER.filter((q) => (p.questsDone || []).includes(q));
  rep.realmActive = ORDER.filter((q) => (p.quests || {})[q]);
  rep.zoneNow = p.zone;
  return rep;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const one = arg('cls');
  const realm1 = arg('realm');
  const runs = one || realm1 ? [[realm1 || 'emberpeak', one || REALM_CLS[realm1 || 'emberpeak'], Number(arg('seed', 1))]]
    : [['emberpeak', 'warden', 1], ['valewyn', 'mender', 1], ['emberpeak', 'scribe', 2], ['valewyn', 'wayfinder', 2]];
  let reached = 0, realmDone = 0, errors = 0, violations = 0;
  for (const [realm, cls, seed] of runs) {
    const ORDER = REALMS2_ORDER[realm];
    const rep = runRealm(realm, cls, seed, Number(arg('cap', 150)), Number(arg('stop', 6)));
    writeFileSync(join(OUT, `${realm}_${cls}_${seed}.json`), JSON.stringify(rep, null, 1));
    const L = rep.final ? rep.final.level : 0;
    if (L >= Number(arg('stop', 6))) reached++;
    if (rep.realmDone.length >= ORDER.length - 1) realmDone++;
    errors += rep.errors.length; violations += rep.violations.length;
    const vk = {};
    for (const v of rep.violations) vk[v.kind || v.type || 'v'] = (vk[v.kind || v.type || 'v'] || 0) + 1;
    console.log(`RUN ${realm} ${cls} seed ${seed}: L${L} at ${rep.endMin} min (${rep.reason}), deaths ${rep.deaths.length}, realm quests ${rep.realmDone.length}/${ORDER.length} (open: ${rep.realmActive.join(' ') || '-'}), in ${rep.zoneNow}, errors ${rep.errors.length}, violations ${rep.violations.length} ${JSON.stringify(vk)}, wall ${rep.wallSec}s`);
    if (rep.errors.length) console.log('  first error:', String(rep.errors[0].error).split('\n').slice(0, 3).join(' | '));
  }
  console.log(`REALMBOT2_DONE: runs=${runs.length} reached=${reached} realmDone=${realmDone} errors=${errors} violations=${violations}`);
}

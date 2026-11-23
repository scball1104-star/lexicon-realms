// The questing bot (qa/bot/lib/bot.mjs, only commands a player could send) in the wave 3 realms2 start realms (Saffron
// Haven, the Nameless Hollow; src/data/realms2.js), the same way qa/bot/realmbot.mjs plays the Rootbound: a new hero
// starting at the realm's hub plays that realm's quests until level 6 and the realm's chain are done, or the time cap.
//
//   node qa/bot/realmbot2.mjs                       wayfinder in Saffron, inkblade in the Hollow, a warden in each, seed 1
//   node qa/bot/realmbot2.mjs --realm saffron --cls warden --seed 2 --cap 150 --stop 6
// Prints REALMBOT2_DONE: runs=<n> reached=<n> realmDone=<n> errors=<n> violations=<n> (machine-read sentinel). JSON per
// run in qa/out/bot/realm2/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContent } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/index.js';
import { SH_QUEST_ORDER } from '../../src/data/saffron.js';
import { NH_QUEST_ORDER } from '../../src/data/hollow.js';
import { createBot } from './lib/bot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'out', 'bot', 'realm2');
const REALM = { saffron: { order: SH_QUEST_ORDER, cls: 'wayfinder' }, hollow: { order: NH_QUEST_ORDER, cls: 'inkblade' } };
mkdirSync(OUT, { recursive: true });
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };

export function runRealm2(realm, cls, seed, capMin = 150, stopLevel = 6) {
  const RB_QUEST_ORDER = REALM[realm].order;
  const base = buildContent();
  // the bot walks the quest order it is given: the realm's quests, then the old chain
  const content = { ...base, questOrder: [...RB_QUEST_ORDER], sideQuests: [] };   // the realm only (its last hand-in is up in Willowmere)
  const world = createWorld({ seed: 2000 + seed, content });
  const R = content.startRealms[REALM[realm].cls];
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
  const one = arg('realm');
  const runs = one ? [[one, arg('cls', REALM[one].cls), Number(arg('seed', 1))]] : [['saffron', 'wayfinder', 1], ['hollow', 'inkblade', 1], ['saffron', 'warden', 1], ['hollow', 'warden', 1]];
  let reached = 0, realmDone = 0, errors = 0, violations = 0;
  for (const [realm, cls, seed] of runs) {
    const RB_QUEST_ORDER = REALM[realm].order;
    const rep = runRealm2(realm, cls, seed, Number(arg('cap', 150)), Number(arg('stop', 6)));
    writeFileSync(join(OUT, `${realm}_${cls}_${seed}.json`), JSON.stringify(rep, null, 1));
    const L = rep.final ? rep.final.level : 0;
    if (L >= Number(arg('stop', 6))) reached++;
    if (rep.realmDone.length >= RB_QUEST_ORDER.length - 1) realmDone++;
    errors += rep.errors.length; violations += rep.violations.length;
    const vk = {};
    for (const v of rep.violations) vk[v.kind || v.type || 'v'] = (vk[v.kind || v.type || 'v'] || 0) + 1;
    console.log(`RUN ${realm} ${cls} seed ${seed}: L${L} at ${rep.endMin} min (${rep.reason}), deaths ${rep.deaths.length}, realm quests ${rep.realmDone.length}/${RB_QUEST_ORDER.length} (open: ${rep.realmActive.join(' ') || '-'}), in ${rep.zoneNow}, errors ${rep.errors.length}, violations ${rep.violations.length} ${JSON.stringify(vk)}, wall ${rep.wallSec}s`);
    if (rep.errors.length) console.log('  first error:', String(rep.errors[0].error).split('\n').slice(0, 3).join(' | '));
  }
  console.log(`REALMBOT2_DONE: runs=${runs.length} reached=${reached} realmDone=${realmDone} errors=${errors} violations=${violations}`);
}

// Mining pace while questing (professions build step 1): minutes of play for a hero to take Mining from 1 to 75.
//
// The questing bot (qa/bot/questbot.mjs) cannot carry a hero past level 2 on main today (its `grind` goal still reads
// the old per-area zones, C.zones.valley, which one world removed; same result run read-only against D:\LexiconRealms),
// so this is a ROUTE MODEL instead of a full questing run:
//   - the hero levels on PROGRESSION's target timeline (docs/design/PROGRESSION.md section 1: 5, 7, 8 ... minutes a
//     level), and while it "quests" it walks the real map from one point to the next inside its level band's area
//     (valley below 6, the Downs 6 to 12, the Moor from 13), at real walking speed, on the bots' A* paths;
//   - a miner's habit on top: learn Mining at Garrick, train the next rank at Garrick or Dunstan when its level allows
//     and the cap is near, and mine any seam it can use within 12 tiles of where it stands (walk there, 2 s cast);
//   - the time spent mining (detour plus cast) does NOT advance the levelling clock: it is the cost of mining.
// Simplifications (say so when quoting the numbers): hostile foes are removed (no fights, so no cast is ever stopped by
// a hit; their time is inside the timeline), levels come from world.setLevel on the timeline, ore past the bag is
// dropped (a player would sell or bank it), the hero starts with 80 gold for the trainers (quests pay more than that).
//
//   node qa/prof/mining_pace.mjs                 seeds 1, 2, 3 (warden), JSON to qa/out/prof/mining_pace.json
//   node qa/prof/mining_pace.mjs --seeds 4,5 --cap 400
// Prints MINING_PACE: runs=<n> reached75=<n> medianMin75=<m> medianLevel75=<L> (machine-read sentinel).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContent } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/index.js';
import { createRng } from '../../src/sim/rng.js';
import { bagRemove, bagFree } from '../../src/sim/loot.js';
import { createBot } from '../bot/lib/bot.mjs';
import { reach } from '../../tools/maps/kit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'out', 'prof');
mkdirSync(OUT, { recursive: true });
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const MIN = 1200, SUB = 16;
const REACH_TILES = 12;
// PROGRESSION 1: target minutes in each level 1..19
const LEVEL_MIN = [5, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const levelAt = (min) => { let t = 0; for (let L = 1; L <= 19; L++) { t += LEVEL_MIN[L - 1]; if (min < t) return L; } return 20; };

export function runOne(seed, capMin = 400) {
  const C = buildContent();
  const P = C.professions;
  const Z = C.zones.world;
  const world = createWorld({ seed: 2000 + seed, content: C });
  for (const m of world.state.ents) if (m.kind === 'mob') { m.dead = true; m.respawnAt = 1e12; m.night = false; if (m.ai) m.ai.mode = 'dead'; if (m.spawn) m.spawn.temporary = false; }
  const bot = createBot({ world, content: C, cls: 'warden', seed, name: 'Miner', opts: { stopLevel: 21, noDanger: true } });
  const id = bot.id, me = () => world.get(id);
  me().gold = 80;
  const rng = createRng(seed * 31 + 7);
  const seen = reach(Z, Z.arrival[0], Z.arrival[1]);
  const bands = { valley: (L) => L < 6, downs: (L) => L >= 6 && L <= 12, moor: (L) => L >= 13 };
  const areasOf = (L) => Z.areas.filter((a) => a.region && bands[a.region] && bands[a.region](L) && !a.safe && a.w > 6 && a.h > 6);
  function waypoint(L) {
    const list = areasOf(L);
    for (let k = 0; k < 200; k++) {
      const a = list[Math.floor(rng.next() * list.length)];
      const x = a.x + Math.floor(rng.next() * a.w), y = a.y + Math.floor(rng.next() * a.h);
      if (Z.collision[y] && Z.collision[y][x] === '.' && seen[y * Z.w + x]) return [x, y];
    }
    return null;
  }
  const rep = { seed, skillMin: {}, skillLevel: {}, nodes: 0, discarded: 0, trains: [], mineMin: 0, questMin: 0, fails: {} };
  let questTicks = 0, job = null, wp = null, wpSince = 0;
  const black = new Map();
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / SUB;
  const skill = () => (me().prof && me().prof.skills && me().prof.skills.mining) || null;
  function trainerJob() {
    const p = me(), s = skill(), rank = s ? s.rank : 0, R = P.ranks[rank];
    if (!R || p.level < R.level || (p.gold || 0) < R.gold) return null;
    if (s && s.v < P.ranks[rank - 1].cap - 5) return null;
    const ts = world.state.ents.filter((e) => e.kind === 'npc' && (e.template === 'garrick' || e.template === 'dunstan')).sort((a, b) => dist(a, p) - dist(b, p));
    return ts[0] ? { kind: 'train', ent: ts[0], since: world.tick } : null;
  }
  function nodeJob() {
    const p = me(), s = skill();
    if (!s) return null;
    let best = null, bd = REACH_TILES * 16;
    for (const e of world.state.ents) {
      if (e.kind !== 'object' || !e.node || !e.node.gather || e.node.gather.prof !== 'mining') continue;
      if (e.node.gather.skill > s.v || s.v - e.node.gather.skill >= 75 || (black.get(e.id) || 0) > world.tick) continue;
      const d = dist(e, p);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { kind: 'node', ent: best, since: world.tick } : null;
  }
  while (world.tick < capMin * MIN) {
    const p = me();
    const L = levelAt(questTicks / MIN);
    if (L > p.level) { world.setLevel(id, L); p.gold += 20 * (L - 1); }
    if (!job && world.tick % 20 === 0) job = trainerJob() || nodeJob();
    if (job) {
      const e = world.get(job.ent.id);
      if (!e || (job.kind === 'node' && !p.work && world.tick - job.since > 60 * 20)) { if (e) black.set(e.id, world.tick + 300 * 20); job = null; }
      else if (job.kind === 'train') {
        if (dist(e, p) <= 34) { bot.hold(0, 0); world.enqueue(id, { t: 'prof_train', npc: e.id, prof: 'mining' }); rep.trains.push({ min: +(world.tick / MIN).toFixed(1), level: p.level, rank: (skill() ? skill().rank : 0) + 1 }); job = null; }
        else if (bot.walkToEnt('trainer' + e.id, e, 30) === 'fail') job = null;
      } else if (p.work) bot.hold(0, 0);
      else if (dist(e, p) <= 30) {
        bot.hold(0, 0);
        if (bagFree(p, C) < 2) for (const it of ['tin_ore', 'rubble_stone', 'glass_sand', 'iron_ore', 'field_stone', 'inkstone', 'ink_slate', 'lantern_opal']) rep.discarded += bagRemove(p, it, 999);
        if (world.tick % 10 === 0) world.enqueue(id, { t: 'interact', id: e.id });
      } else if (bot.walkToEnt('node' + e.id, e, 24) === 'fail') { black.set(e.id, world.tick + 600 * 20); job = null; }
      rep.mineMin += 1 / MIN;
    } else {
      // questing: walk the band's area from point to point; this time is the levelling timeline
      if (!wp || world.tick - wpSince > 4 * MIN) { wp = waypoint(p.level); wpSince = world.tick; }
      const r = wp ? bot.walkTo('wp' + wp.join(','), 'world', (x, y) => Math.abs(x - wp[0]) + Math.abs(y - wp[1]) <= 2, wp) : 'fail';
      if (r !== 'walking') wp = null;
      questTicks++;
    }
    const events = world.step();
    for (const ev of events) {
      if (ev.id !== id) continue;
      if (ev.type === 'prof_skill') for (const m of [25, 50, 75]) if (ev.v >= m && rep.skillMin[m] == null) { rep.skillMin[m] = +(world.tick / MIN).toFixed(1); rep.skillLevel[m] = me().level; }
      if (ev.type === 'prof_work' && ev.phase === 'done' && ev.kind === 'gather') { rep.nodes++; job = null; }
      if (ev.type === 'prof_fail') rep.fails[ev.reason] = (rep.fails[ev.reason] || 0) + 1;
    }
    if (rep.skillMin[75] != null) break;
  }
  rep.endMin = +(world.tick / MIN).toFixed(1);
  rep.questMin = +(questTicks / MIN).toFixed(1);
  rep.mineMin = +rep.mineMin.toFixed(1);
  rep.final = { level: me().level, mining: skill() };
  return rep;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const seeds = String(arg('seeds', '1,2,3')).split(',').map(Number);
  const cap = Number(arg('cap', 400));
  const out = [];
  for (const s of seeds) { const t0 = Date.now(); const r = runOne(s, cap); r.wallSec = (Date.now() - t0) / 1000; out.push(r); console.log(JSON.stringify(r)); }
  writeFileSync(join(OUT, 'mining_pace.json'), JSON.stringify(out, null, 1));
  const ok = out.filter((r) => r.skillMin[75] != null);
  const med = (xs) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  console.log(`MINING_PACE: runs=${out.length} reached75=${ok.length} medianMin75=${med(ok.map((r) => r.skillMin[75]))} medianLevel75=${med(ok.map((r) => r.skillLevel[75]))}`);
}

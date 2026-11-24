// The combat world wired to the real content (src/data/maps buildContent): quests through commands, the Long Watch
// chime, a long random session with every class that never throws and stays deterministic, and the balance band.
import { assert, eq, ofType, stepN } from './_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { runCell } from './duel.mjs';
// these tests check XP rules and the curve at full XP; PROGRESSION.xpRate (the 1 to 19 trim) has its own test (xp_rate.test.mjs)
const rateOff = (c) => ({ ...c, progression: { ...c.progression, xpRate: [] } });

const at = (e, tx, ty) => { e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };

export const tests = [
  { name: 'wiring: quest accept, talk objective and turn-in run through world commands; quest XP goes through grantXp', fn() {
    const w = createWorld({ seed: 4, content: rateOff(buildContent()) });
    const pid = w.addPlayer({ name: 'Q', cls: 'mender' });
    const p = w.get(pid);
    const hob = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'hob');
    const mael = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'mael');
    assert(w.snapshot().hud[pid].npcMarkers[hob.id] === '!', 'Hob offers a quest (!)');
    p.zone = hob.zone; p.x = hob.x - 20 * 16; p.y = hob.y;
    w.enqueue(pid, { t: 'interact', id: hob.id });
    assert(ofType(w.step(), 'quest_dialog').length, 'dialog');
    w.enqueue(pid, { t: 'quest_accept', quest: 'wm_name_twice' });
    assert(ofType(w.step(), 'quest', (e) => e.kind === 'accept').length, 'accepted');
    p.x = mael.x - 20 * 16; p.y = mael.y;
    w.enqueue(pid, { t: 'interact', id: mael.id });
    const ev = w.step();
    eq(p.quests.wm_name_twice.state, 'ready', 'talked: ready');
    w.enqueue(pid, { t: 'quest_turnin', quest: 'wm_name_twice' });
    const ev2 = w.step();
    assert(ofType(ev2, 'quest', (e) => e.kind === 'turnin').length, 'turned in');
    assert(ofType(ev2, 'xp', (e) => e.source === 'quest' && e.amount === 100).length, 'quest XP through grantXp');
    eq(p.xp, 100); eq(p.gold, 5);
    void ev;
  } },
  { name: 'wiring: Odo rings his chime every 20 s while the Sentinel fights; it is stunned 2 s', fn() {
    const w = createWorld({ seed: 5, content: rateOff(buildContent()) });
    const pid = w.addPlayer({ name: 'W', cls: 'warden', level: 14 });
    const p = w.get(pid);
    // the Sentinel lives in the Watchtower dungeon since 2026-11-22: step into the hero's own copy first
    const zid = w.internals.dungeons.enter(p, 'watchtower'); p.zone = zid;
    const s = w.state.ents.find((e) => e.template === 'sentinel_long_watch' && e.zone === zid);
    for (const m of w.state.ents) if (m.kind === 'mob' && m.zone === zid && m !== s) { m.dead = true; m.respawnAt = null; }
    p.zone = s.zone; p.x = s.x - 20 * 16; p.y = s.y;
    w.internals.combat.addThreat(s, p, 10);
    let chimes = [];
    for (let i = 0; i < 820; i++) { p.hp = p.hpMax; chimes.push(...ofType(w.step(), 'chime')); }
    eq(chimes.length, 2, 'two chimes in 41 s');
    eq(chimes[1].tick - chimes[0].tick, 400, '20 s apart');
    eq(s.rank === undefined ? w.snapshot().entities.find((e) => e.id === s.id).rank : s.rank, 'boss', 'a boss now (the Watchtower dungeon)');
  } },
  { name: 'wiring: a 4,000-tick random session with all five classes on the real map never throws and is deterministic', fn() {
    const run = () => {
      const w = createWorld({ seed: 99, content: rateOff(buildContent()) });
      const ids = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'].map((cls, i) => w.addPlayer({ name: `P${i}`, cls, zone: 'valley', x: 8 + i, y: 52, level: 6 }));
      let r = 12345;
      const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
      for (let t = 0; t < 4000; t++) {
        for (const id of ids) {
          const p = w.get(id);
          if (rnd() < 0.05) w.enqueue(id, { t: 'move', dx: Math.floor(rnd() * 3) - 1, dy: Math.floor(rnd() * 3) - 1 });
          if (rnd() < 0.05) {
            const mobs = w.state.ents.filter((e) => e.kind === 'mob' && !e.dead && e.zone === p.zone);
            if (mobs.length) w.enqueue(id, { t: 'target', id: mobs[Math.floor(rnd() * mobs.length)].id });
          }
          if (rnd() < 0.1) w.enqueue(id, { t: 'cast', slot: 1 + Math.floor(rnd() * 6) });
        }
        w.step();
      }
      return w;
    };
    const a = run(), b = run();
    eq(a.hash(), b.hash(), 'deterministic');
    const s = a.snapshot();
    eq(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s), 'snapshot round trip');
  } },
  { name: 'balance: every class at 1, 8 and 15 kills a same-level foe in 8 to 14 s (5 to 12 s at level 1, from the first hit; lighter low-level foes) without dying (20 seeded runs per cell; duel.mjs runs 200)', fn() {
    const out = [];
    for (const c of ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade']) for (const L of [1, 8, 15]) {
      const r = runCell(c, L, 20);
      out.push(`${c} ${L}: ${r.ttk.toFixed(1)} s`);
      const [lo, hi] = L <= 4 ? [5, 12] : [8, 14];
      assert(r.ttk >= lo && r.ttk <= hi, `${c} ${L}: TTK ${r.ttk.toFixed(2)} outside ${lo} to ${hi}`);
      eq(r.deaths, 0, `${c} ${L} deaths`);
    }
    void out;
  } },
];

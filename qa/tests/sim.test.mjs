import { createWorld, restoreWorld, TILE } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { assert, eq, newWorld, scriptedLog, run, boxClear } from './_helpers.mjs';

const TICKS = 2000;

function playthrough(seed, cmdSeed) {
  const { world } = newWorld(seed);
  const pid = world.addPlayer({ name: 'Tester', cls: 'scribe' });
  const ids = world.snapshot().entities.map((e) => e.id);
  run(world, pid, scriptedLog(cmdSeed, TICKS, ids), TICKS);
  return world;
}

export const tests = [
  {
    name: 'determinism: same seed + command log -> same hash after 2,000 ticks',
    fn() {
      const a = playthrough(42, 7), b = playthrough(42, 7);
      eq(a.tick, TICKS, 'tick count');
      eq(a.hash(), b.hash(), 'state hash');
      eq(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()), 'snapshot');
      const c = playthrough(43, 7);
      assert(c.hash() !== a.hash(), 'a different world seed must give a different state');
      const d = playthrough(42, 8);
      assert(d.hash() !== a.hash(), 'a different command log must give a different state');
    },
  },
  {
    name: 'determinism: serialize mid-run, restore, continue -> same hash as the uninterrupted run',
    fn() {
      const content = buildContent();
      const a = createWorld({ seed: 9, content });
      const pid = a.addPlayer({ name: 'A' });
      const log = scriptedLog(3, TICKS, a.snapshot().entities.map((e) => e.id));
      run(a, pid, log, 1000);
      const b = restoreWorld(a.serialize(), content);
      eq(b.hash(), a.hash(), 'restored hash');
      run(a, pid, log, TICKS);
      run(b, pid, log, TICKS);
      eq(b.hash(), a.hash(), 'hash after continuing both');
    },
  },
  {
    name: 'collision: nobody ever stands in a wall or water over a 2,000-tick random run; mobs stay in their zone',
    fn() {
      const { world, content } = newWorld(5);
      const pid = world.addPlayer({ name: 'C' });
      const log = scriptedLog(11, TICKS, []);
      let checked = 0;
      run(world, pid, log, TICKS, (w) => {
        for (const e of w.state.ents) {
          const zone = content.zones[e.zone];
          assert(boxClear(zone, e), `entity ${e.id} (${e.kind}) inside a wall at ${e.zone} ${e.x / 16},${e.y / 16} tick ${w.tick}`);
          if (e.kind === 'mob') eq(e.zone, e.spawn.zone, `mob ${e.id} left its zone`);
          checked++;
        }
      });
      assert(checked > TICKS * 10, 'checked every entity every tick');
    },
  },
  {
    name: 'collision: walking into a wall stops at the wall and stays stopped',
    fn() {
      const { world, content } = newWorld(1);
      const pid = world.addPlayer({ name: 'W' });       // Willowmere start, main road below Lantern Square
      const p = world.get(pid);
      world.enqueue(pid, { t: 'move', dx: 0, dy: -1 });
      let lastY = p.y, stuckFor = 0;
      for (let i = 0; i < 200; i++) { world.step(); if (p.y === lastY) stuckFor++; else stuckFor = 0; lastY = p.y; }
      assert(stuckFor > 50, `player should be stopped by a wall (stuck ${stuckFor} ticks)`);
      const zone = content.zones.willowmere;
      const tx = Math.floor(p.x / TILE), ty = Math.floor((p.y - 6 * 16 - 1) / TILE);
      assert(zone.collision[ty][tx] !== '.', `the cell north of the stopped player is a wall (got "${zone.collision[ty][tx]}" at ${tx},${ty})`);
      assert(boxClear(zone, p), 'player box is clear');
    },
  },
  {
    name: 'zone transition: walk south out of Willowmere into the valley and back',
    fn() {
      const { world } = newWorld(1);
      const pid = world.addPlayer({ name: 'Z' });
      const p = world.get(pid);
      world.enqueue(pid, { t: 'move', dx: 0, dy: 1 });
      let zev = null;
      for (let i = 0; i < 200 && !zev; i++) zev = world.step().find((e) => e.type === 'zone');
      assert(zev, 'a zone event');
      eq(zev.from, 'willowmere'); eq(zev.to, 'valley'); eq(p.zone, 'valley');
      eq(Math.floor(p.x / TILE), 1, 'arrival column'); eq(Math.floor((p.y - 1) / TILE), 33, 'arrival row');
      world.enqueue(pid, { t: 'move', dx: -1, dy: 0 });
      let back = null;
      for (let i = 0; i < 100 && !back; i++) back = world.step().find((e) => e.type === 'zone');
      assert(back && back.to === 'willowmere', 'walked back into Willowmere');
      eq(p.zone, 'willowmere');
      eq(p.target, null, 'target dropped on zone change');
    },
  },
  {
    name: 'snapshot: JSON round trip is lossless and the snapshot is plain data',
    fn() {
      const w = playthrough(77, 2);
      const s = w.snapshot();
      const back = JSON.parse(JSON.stringify(s));
      eq(JSON.stringify(back), JSON.stringify(s), 'round trip');
      const plain = (v) => v === null || ['number', 'string', 'boolean'].includes(typeof v)
        || (Array.isArray(v) && v.every(plain)) || (Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(plain));
      assert(plain(s), 'only plain objects, arrays and primitives');
      for (const e of s.entities) for (const k of ['id', 'kind', 'zone', 'x', 'y', 'dir', 'hp', 'hpMax', 'faction', 'target', 'auras', 'cd']) assert(k in e, `entity field ${k}`);
      assert(!('ai' in s.entities.find((e) => e.kind === 'mob')), 'internal ai state stays out of the snapshot');
    },
  },
  {
    name: 'commands: target / interact / cast stub / bad commands emit the contract events',
    fn() {
      const { world, content } = newWorld(1);
      const pid = world.addPlayer({ name: 'K' });
      const mael = world.state.ents.find((e) => e.kind === 'npc');
      const wolf = world.state.ents.find((e) => e.kind === 'mob');
      world.enqueue(pid, { t: 'target', id: wolf.id });          // other zone: rejected
      world.enqueue(pid, { t: 'interact', id: mael.id });        // too far
      world.enqueue(pid, { t: 'cast', slot: 1 });
      world.enqueue(pid, { t: 'cast', slot: 2 });                // GCD
      world.enqueue(pid, { t: 'dance' });
      const ev = world.step();
      const types = ev.map((e) => e.type + (e.reason ? ':' + e.reason : ''));
      eq(JSON.stringify(types), JSON.stringify(['cmd_reject:bad_target', 'interact_fail:range', 'cast_start', 'cast_stop:stub', 'cast_fail:gcd', 'cmd_reject:unknown_command']));
      // walk next to Mael and talk
      const p = world.get(pid);
      p.x = mael.x - 20 * 16; p.y = mael.y;
      world.enqueue(pid, { t: 'interact', id: mael.id });
      world.enqueue(pid, { t: 'target', id: mael.id });
      const ev2 = world.step();
      assert(ev2.some((e) => e.type === 'interact' && e.npc === 'mael'), 'interact event');
      eq(p.target, mael.id);
      assert(content.zones.willowmere, 'content');
    },
  },
];

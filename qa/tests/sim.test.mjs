import { createWorld, restoreWorld, TILE } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { assert, eq, newWorld, scriptedLog, run, boxClear, walkPath, tilePath, areaOfSub } from './_helpers.mjs';
import { regionAt } from '../../src/data/maps/compose.js';
import { toWorld } from '../../src/data/maps/layout.js';

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
      eq(areaOfSub(p), 'willowmere', 'still in town');
      const zone = content.zones.world;
      const tx = Math.floor(p.x / TILE), ty = Math.floor((p.y - 6 * 16 - 1) / TILE);
      assert(zone.collision[ty][tx] !== '.', `the cell north of the stopped player is a wall (got "${zone.collision[ty][tx]}" at ${tx},${ty})`);
      assert(boxClear(zone, p), 'player box is clear');
    },
  },
  {
    // One world (Scott 2026-11-21): the town gate opens on Gate Road South, which runs into the valley's west edge. No
    // join fires, no zone event, the zone stays 'world'; only the area banner changes. Then the same road walks back.
    name: 'one world: walk out of the Willowmere gate down Gate Road South into the valley and back, no zone change',
    fn() {
      const { world, content } = newWorld(1);
      const Z = content.zones.world;
      const pid = world.addPlayer({ name: 'Z' });
      const p = world.get(pid);
      eq(areaOfSub(p), 'willowmere', 'starts in town');
      const gate = toWorld('willowmere', 20, 31), road = toWorld('valley', 0, 52);
      const tile = () => [Math.floor(p.x / TILE), Math.floor((p.y - 1) / TILE)];
      const out = tilePath(Z, tile(), (x, y) => regionAt(Z, x, y) === 'valley' && x >= road[0] + 3);
      assert(out, 'a walkable way from the arrival into the valley');
      assert(out.some(([x, y]) => Math.abs(x - gate[0]) <= 3 && Math.abs(y - gate[1]) <= 1), 'the way runs through the town gate');
      assert(out.some(([x, y]) => regionAt(Z, x, y) === null), 'and over the wilds (Gate Road South)');
      const go = walkPath(world, pid, out);
      assert(go.done, `walked to the valley (stopped at ${tile()})`);
      assert(!go.events.some((e) => e.type === 'zone'), 'no zone event on the way');
      eq(p.zone, 'world'); eq(areaOfSub(p), 'valley', 'stands in the valley');
      assert(go.events.some((e) => e.type === 'area' && e.id === pid && e.area === 'region_valley'), 'the valley banner showed');
      const home = tilePath(Z, tile(), (x, y) => x === content.start.x && y === content.start.y);
      assert(home, 'a way back');
      const back = walkPath(world, pid, home);
      assert(back.done, `walked back to the arrival (stopped at ${tile()})`);
      assert(!back.events.some((e) => e.type === 'zone'), 'no zone event on the way back');
      eq(p.zone, 'world'); eq(areaOfSub(p), 'willowmere', 'back in town');
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
    name: 'commands: target / interact / cast / bad commands emit the contract events (combat content loaded)',
    fn() {
      const { world, content } = newWorld(1);
      const pid = world.addPlayer({ name: 'K' });
      const mael = world.state.ents.find((e) => e.kind === 'npc' && e.template === 'mael');
      const me = world.get(pid);
      const far = world.state.ents.find((e) => e.kind === 'mob' && Math.hypot(e.x - me.x, e.y - me.y) / 16 > 700);
      world.enqueue(pid, { t: 'target', id: far.id });           // one world: too far to keep (TARGET_RANGE_PX), rejected
      world.enqueue(pid, { t: 'interact', id: mael.id });        // too far
      world.enqueue(pid, { t: 'cast', slot: 1 });                // Strike: no hostile target
      world.enqueue(pid, { t: 'cast', slot: 9 });                // empty slot
      world.enqueue(pid, { t: 'dance' });
      const ev = world.step();
      const types = ev.map((e) => e.type + (e.reason ? ':' + e.reason : ''));
      eq(JSON.stringify(types), JSON.stringify(['cmd_reject:bad_target', 'interact_fail:range', 'cast_fail:target', 'cast_fail:unknown', 'cmd_reject:unknown_command']));
      // walk next to Mael and talk
      const p = world.get(pid);
      p.x = mael.x - 20 * 16; p.y = mael.y;
      world.enqueue(pid, { t: 'interact', id: mael.id });
      world.enqueue(pid, { t: 'target', id: mael.id });
      const ev2 = world.step();
      assert(ev2.some((e) => e.type === 'interact' && e.npc === 'mael'), 'interact event');
      eq(p.target, mael.id);
      assert(content.zones.world, 'content');
    },
  },
  {
    name: 'commands: without combat content the cast stub still checks the GCD (cast_start, cast_stop stub, cast_fail gcd)',
    fn() {
      const full = buildContent();
      const content = { zones: full.zones, zoneNames: full.zoneNames, mobs: full.mobs, npcs: full.npcs, spawns: [], start: full.start };
      const world = createWorld({ seed: 1, content });
      const pid = world.addPlayer({ name: 'S' });
      world.enqueue(pid, { t: 'cast', slot: 1 });
      world.enqueue(pid, { t: 'cast', slot: 2 });
      const types = world.step().map((e) => e.type + (e.reason ? ':' + e.reason : ''));
      eq(JSON.stringify(types), JSON.stringify(['cast_start', 'cast_stop:stub', 'cast_fail:gcd']));
    },
  },
];

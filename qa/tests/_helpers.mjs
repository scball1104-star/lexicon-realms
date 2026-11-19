// Shared helpers for the sim tests. Not a test file (no .test.mjs suffix).
import { createWorld, createRng, TILE } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { boxTiles } from '../../src/sim/collision.js';

export function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
export function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }

export function newWorld(seed = 1234) {
  const content = buildContent();
  const world = createWorld({ seed, content });
  return { world, content };
}

/** A pseudo-player command script from its own seed: [tick, cmd] pairs, covering every command kind. */
export function scriptedLog(seed, ticks, ids = []) {
  const r = createRng(seed);
  const log = [];
  for (let t = 1; t <= ticks; t++) {
    if (r.chance(0.08)) log.push([t, { t: 'move', dx: r.int(-1, 1), dy: r.int(-1, 1) }]);
    if (r.chance(0.01)) log.push([t, { t: 'stop' }]);
    if (r.chance(0.02) && ids.length) log.push([t, { t: 'target', id: r.pick(ids) }]);
    if (r.chance(0.01)) log.push([t, { t: 'target', id: null }]);
    if (r.chance(0.02)) log.push([t, { t: 'cast', slot: r.int(1, 6) }]);
    if (r.chance(0.005) && ids.length) log.push([t, { t: 'interact', id: r.pick(ids) }]);
  }
  return log;
}

/** Run a world with a player for `ticks`, feeding `log`; calls each(world, events, pid) after every tick. */
export function run(world, pid, log, ticks, each) {
  let i = 0;
  for (let t = world.tick + 1; t <= ticks; t++) {
    while (i < log.length && log[i][0] === t) world.enqueue(pid, log[i++][1]);
    while (i < log.length && log[i][0] < t) i++;
    const ev = world.step();
    if (each) each(world, ev, pid);
  }
}

/** Every tile under an entity's feet box is walkable or a ledge (never wall or water). */
export function boxClear(zone, e) {
  const [a0, b0, a1, b1] = boxTiles(e.x, e.y);
  for (let y = b0; y <= b1; y++) for (let x = a0; x <= a1; x++) {
    if (x < 0 || y < 0 || x >= zone.w || y >= zone.h) return false;
    const c = zone.collision[y][x];
    if (c === '#' || c === '~') return false;
  }
  return true;
}

export { TILE };

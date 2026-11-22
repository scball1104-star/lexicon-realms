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

// One world (src/data/maps/layout.js): every entity is in zone 'world'; which area it stands in comes from its tile.
// sub: a sim entity (world.state.ents, SUB units); px: a snapshot entity (pixels).
import { regionAt } from '../../src/data/maps/compose.js';
import { WORLD } from '../../src/data/maps/index.js';
export const areaOfSub = (e) => regionAt(WORLD, Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE));
export const areaOfPx = (e) => regionAt(WORLD, Math.floor(e.x / 16), Math.floor((e.y - 1) / 16));

/** Steer a player along a tile path ([[x, y], ...], start included) with held move commands, the way a player would:
 *  head for each cell's centre, next cell when within 2.5 px. Returns every event of the walk. Stops at maxTicks. */
export function walkPath(world, pid, path, maxTicks = 4000) {
  const p = world.get(pid);
  const events = [];
  let i = 1, held = '';
  for (let t = 0; t < maxTicks && i < path.length; t++) {
    const fx = p.x / 16, fy = p.y / 16;
    while (i < path.length && Math.abs(fx - (path[i][0] * 16 + 8)) <= 2.5 && Math.abs(fy - (path[i][1] * 16 + 12)) <= 2.5) i++;
    if (i >= path.length) break;
    const cx = path[i][0] * 16 + 8, cy = path[i][1] * 16 + 12;
    const dx = fx < cx - 2 ? 1 : fx > cx + 2 ? -1 : 0, dy = fy < cy - 2 ? 1 : fy > cy + 2 ? -1 : 0;
    if (`${dx},${dy}` !== held) { held = `${dx},${dy}`; world.enqueue(pid, dx || dy ? { t: 'move', dx, dy } : { t: 'stop' }); }
    events.push(...world.step());
  }
  world.enqueue(pid, { t: 'stop' });
  events.push(...world.step());
  return { events, done: i >= path.length };
}

import { canStep } from '../../tools/maps/kit.mjs';
/** Shortest tile path (4-way, ledges one way) from `from` to the first cell where goal(x, y) holds; null if none. */
export function tilePath(zone, from, goal) {
  const W = zone.w, prev = new Int32Array(W * zone.h).fill(-1);
  const s = from[1] * W + from[0];
  prev[s] = s;
  const q = [s];
  let hit = -1;
  for (let i = 0; i < q.length; i++) {
    const k = q[i], x = k % W, y = (k / W) | 0;
    if (goal(x, y)) { hit = k; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!canStep(zone, x, y, dx, dy)) continue;
      const n = (y + dy) * W + x + dx;
      if (prev[n] < 0) { prev[n] = k; q.push(n); }
    }
  }
  if (hit < 0) return null;
  const out = [];
  for (let k = hit; ; k = prev[k]) { out.push([k % W, (k / W) | 0]); if (k === s) break; }
  return out.reverse();
}

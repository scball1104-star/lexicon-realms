// Tile collision against a zone's baked collision grid. Pure.
//
//   cellAt(zone, tx, ty)              collision char ('#' off the map)
//   boxBlocked(zone, x, y, mdx, mdy, opts)   would a feet box at (x, y) [SUB] be blocked while moving (mdx, mdy)?
//   moveAxis(zone, ent, amount, axis, opts)  step one axis pixel by pixel, stop at the first blocked step
//
// Ledges (v > <) are one-way: a ledge cell is enterable only while moving in its direction, or when the box already
// overlaps it (so an actor standing on one is never stuck). Join cells (zone exits) are walkable for players and
// solid for mobs (opts.noJoins), so wandering mobs never leave their zone.
import { SUB, TILE, BODY_HALF_W, BODY_DEPTH, WALK, LEDGE_DIR } from './constants.js';

export function cellAt(zone, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= zone.w || ty >= zone.h) return '#';
  return zone.collision[ty][tx];
}

export function inJoin(zone, tx, ty) {
  for (const j of zone.joins || []) if (tx >= j.x && ty >= j.y && tx < j.x + j.w && ty < j.y + j.h) return j;
  return null;
}

/** Tile range covered by a feet box at (x, y) in SUB. */
export function boxTiles(x, y) {
  const x0 = x - BODY_HALF_W * SUB, x1 = x + BODY_HALF_W * SUB - 1;
  const y0 = y - BODY_DEPTH * SUB, y1 = y - 1;
  return [Math.floor(x0 / TILE), Math.floor(y0 / TILE), Math.floor(x1 / TILE), Math.floor(y1 / TILE)];
}

function cellBlocks(zone, tx, ty, mdx, mdy, wasIn, opts) {
  const c = cellAt(zone, tx, ty);
  if (opts && opts.noJoins && inJoin(zone, tx, ty)) return true;
  if (opts && opts.shut && opts.shut.has(tx + ty * 4096)) return true;   // a shut word door (src/sim/worddoor.js)
  if (c === WALK) return false;
  const ld = LEDGE_DIR[c];
  if (ld) {
    if (wasIn) return false;
    return !((ld[0] !== 0 && Math.sign(mdx) === ld[0]) || (ld[1] !== 0 && Math.sign(mdy) === ld[1]));
  }
  return true;
}

export function boxBlocked(zone, x, y, mdx, mdy, prevX, prevY, opts) {
  const [a0, b0, a1, b1] = boxTiles(x, y);
  const [p0, q0, p1, q1] = boxTiles(prevX, prevY);
  for (let ty = b0; ty <= b1; ty++) {
    for (let tx = a0; tx <= a1; tx++) {
      const wasIn = tx >= p0 && tx <= p1 && ty >= q0 && ty <= q1;
      if (cellBlocks(zone, tx, ty, mdx, mdy, wasIn, opts)) return true;
    }
  }
  return false;
}

/** Move `ent` along one axis by `amount` SUB, in steps of at most 1 px. Returns the distance actually moved. */
export function moveAxis(zone, ent, amount, axis, opts) {
  let moved = 0;
  const s = Math.sign(amount);
  let left = Math.abs(amount);
  let size = SUB;                       // try whole pixels; on a block, halve down to 1 sub so the box ends flush
  while (left > 0 && size >= 1) {
    const step = Math.min(size, left) * s;
    const nx = axis === 'x' ? ent.x + step : ent.x;
    const ny = axis === 'y' ? ent.y + step : ent.y;
    if (boxBlocked(zone, nx, ny, axis === 'x' ? s : 0, axis === 'y' ? s : 0, ent.x, ent.y, opts)) { size >>= 1; continue; }
    ent.x = nx; ent.y = ny;
    moved += step;
    left -= Math.abs(step);
  }
  return moved;
}

/** Feet tile of an entity. */
export function feetTile(ent) {
  return [Math.floor(ent.x / TILE), Math.floor((ent.y - 1) / TILE)];
}

/** Is the feet box free at a tile's standing point (bottom centre)? Used to validate spawn and arrival spots. */
export function spotFree(zone, tx, ty) {
  const x = tx * TILE + TILE / 2, y = (ty + 1) * TILE - SUB;
  return !boxBlocked(zone, x, y, 0, 0, -99999, -99999, null);
}

// zone -> Uint8Array of the cells reachable on foot from the zone's arrival (1 = reachable); built once per zone
const reachCache = new WeakMap();
function reachFromArrival(zone) {
  if (reachCache.has(zone)) return reachCache.get(zone);
  let seen = null;
  if (zone.arrival && zone.collision) {
    const [ax, ay] = zone.arrival;
    seen = new Uint8Array(zone.w * zone.h);
    const q = [[ax, ay]];
    if (ax >= 0 && ay >= 0 && ax < zone.w && ay < zone.h) seen[ay * zone.w + ax] = 1; else q.pop();
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= zone.w || ny >= zone.h || seen[ny * zone.w + nx]) continue;
        const c = zone.collision[ny][nx], ld = LEDGE_DIR[c];
        if (c !== WALK && !(ld && ld[0] === dx && ld[1] === dy)) continue;
        seen[ny * zone.w + nx] = 1;
        q.push([nx, ny]);
      }
    }
  }
  reachCache.set(zone, seen);
  return seen;
}

/**
 * Where a restored hero stands (a save holds the tile they logged out on). The saved tile when the feet box is free
 * there; otherwise (the map changed under the save: the tile is now inside a building, a fence, water) the nearest tile,
 * ring by ring, that is free and reachable on foot from the zone's arrival; failing that the arrival. Returns [tx, ty].
 */
export function standTile(zone, tx, ty) {
  if (!zone || !zone.collision) return [tx, ty];
  if (spotFree(zone, tx, ty)) return [tx, ty];
  const seen = reachFromArrival(zone);
  const ok = (x, y) => x >= 0 && y >= 0 && x < zone.w && y < zone.h && (!seen || seen[y * zone.w + x] === 1) && spotFree(zone, x, y);
  const R = Math.max(zone.w, zone.h);
  for (let d = 1; d <= R; d++) {
    let best = null, bestD = Infinity;
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d || !ok(tx + dx, ty + dy)) continue;
      const e = dx * dx + dy * dy;
      if (e < bestD) { bestD = e; best = [tx + dx, ty + dy]; }
    }
    if (best) return best;
  }
  return zone.arrival ? [zone.arrival[0], zone.arrival[1]] : [tx, ty];
}

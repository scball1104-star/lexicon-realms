// Mob pathing over a zone's collision grid. Pure, deterministic, cheap.
//
//   walkClear(zone, ax, ay, bx, by)          can a mob's feet box slide straight from a to b [SUB]? (walls, water, joins)
//   findPath(zone, sx, sy, gx, gy, max)      A* tile path (8-way, no corner cutting) -> [[tx, ty], ...] without the start, or null
//   tileGoal(tx, ty)                         the SUB point a mob steers to on a path tile (bottom-centre, where feet stand)
//
// Mobs walk on '.' cells that are not zone joins (CONTRACTS 6: joins are solid for mobs). Ledges (v > <) can be dropped
// in their own direction only. A search is bounded by `max` expanded nodes, so a foe across a river or on a cliff costs
// at most that much and comes back null ("cannot reach": the AI evades). Ties break by node index, so two runs agree.
import { SUB, TILE, BODY_HALF_W, BODY_DEPTH, WALK, LEDGE_DIR } from './constants.js';
import { inJoin } from './collision.js';

const grids = new WeakMap();      // zone -> Uint8Array: 1 walkable, 2..4 ledge (v > <), 0 solid
const LEDGE_CODE = { v: 2, '>': 3, '<': 4 };
const CODE_DIR = { 2: LEDGE_DIR.v, 3: LEDGE_DIR['>'], 4: LEDGE_DIR['<'] };

function grid(zone) {
  let g = grids.get(zone);
  if (g) return g;
  const W = zone.w, H = zone.h;
  g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = zone.collision[y];
    for (let x = 0; x < W; x++) {
      const c = row[x];
      if (inJoin(zone, x, y)) continue;
      if (c === WALK) g[y * W + x] = 1;
      else if (LEDGE_CODE[c]) g[y * W + x] = LEDGE_CODE[c];
    }
  }
  grids.set(zone, g);
  return g;
}

function cell(zone, g, x, y) {
  if (x < 0 || y < 0 || x >= zone.w || y >= zone.h) return 0;
  return g[y * zone.w + x];
}

/** Straight slide test: the feet box (1 px margin each side) over plain walkable cells only, sampled every 4 px. */
export function walkClear(zone, ax, ay, bx, by) {
  if (!zone) return true;
  const g = grid(zone);
  const dx = bx - ax, dy = by - ay;
  const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / (4 * SUB)));
  const hw = (BODY_HALF_W + 1) * SUB, dep = (BODY_DEPTH + 1) * SUB;
  for (let i = 0; i <= n; i++) {
    const x = ax + (dx * i) / n, y = ay + (dy * i) / n;
    const x0 = Math.floor((x - hw) / TILE), x1 = Math.floor((x + hw - 1) / TILE);
    const y0 = Math.floor((y - dep) / TILE), y1 = Math.floor((y + SUB - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (cell(zone, g, tx, ty) !== 1) return false;
  }
  return true;
}

export function tileGoal(tx, ty) { return [tx * TILE + TILE / 2, ty * TILE + 12 * SUB]; }

function canStep(zone, g, x, y, dx, dy) {
  const c = cell(zone, g, x + dx, y + dy);
  if (!c) return false;
  if (c > 1) { const d = CODE_DIR[c]; if (!((d[0] && Math.sign(dx) === d[0]) || (d[1] && Math.sign(dy) === d[1]))) return false; }
  if (dx && dy) return cell(zone, g, x + dx, y) === 1 && cell(zone, g, x, y + dy) === 1;   // no corner cutting
  return true;
}

const NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [-1, 1, 14], [1, -1, 14], [-1, -1, 14]];

/** A* from (sx, sy) to (gx, gy) in tiles; a goal cell that is not walkable is reached by standing next to it. */
export function findPath(zone, sx, sy, gx, gy, max = 1200) {
  const g = grid(zone);
  const W = zone.w, H = zone.h;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
  const goalOpen = cell(zone, g, gx, gy) > 0;
  const isGoal = goalOpen ? (x, y) => x === gx && y === gy : (x, y) => Math.max(Math.abs(x - gx), Math.abs(y - gy)) <= 1;
  const hOf = (x, y) => { const ax = Math.abs(x - gx), ay = Math.abs(y - gy); return 10 * Math.max(ax, ay) + 4 * Math.min(ax, ay); };
  const gs = new Map(), prev = new Map(), closed = new Set();
  const heap = [];   // [f, h, idx]
  const less = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const push = (n) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (less(heap[i], heap[p]) >= 0) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m]) < 0) m = l; if (r < heap.length && less(heap[r], heap[m]) < 0) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  const s = sy * W + sx;
  gs.set(s, 0); push([hOf(sx, sy), hOf(sx, sy), s]);
  let found = -1, n = 0;
  while (heap.length && n < max) {
    const [, , c] = pop();
    if (closed.has(c)) continue;
    closed.add(c); n++;
    const x = c % W, y = (c / W) | 0;
    if (isGoal(x, y)) { found = c; break; }
    const gc = gs.get(c);
    for (const [dx, dy, cost] of NB) {
      if (!canStep(zone, g, x, y, dx, dy)) continue;
      const k = (y + dy) * W + x + dx;
      if (closed.has(k)) continue;
      const ng = gc + cost;
      if (gs.has(k) && gs.get(k) <= ng) continue;
      gs.set(k, ng); prev.set(k, c);
      const h = hOf(x + dx, y + dy);
      push([ng + h, h, k]);
    }
  }
  if (found < 0) return null;
  const out = [];
  for (let c = found; c !== s; c = prev.get(c)) out.push([c % W, (c / W) | 0]);
  return out.reverse();
}

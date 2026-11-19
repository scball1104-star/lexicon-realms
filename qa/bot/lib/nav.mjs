// Navigation for the playtest bots: A* over a zone's collision grid (the same chars the sim walks on), a zone graph
// from the joins, and a steering helper that turns a tile path into the held direction a player would press.
// Reads zone data only. Never touches world state.
//
//   const nav = createNav(content)
//   nav.path(zoneId, sx, sy, goal(x, y) -> bool, hint: [gx, gy]) -> [[x, y], ...] | null      tiles, start included
//   nav.zoneRoute(from, to) -> [zoneId, ...]                                                     loaded zones only
//   nav.joinTo(fromZone, toZone) -> join rect                                                    the first join between them
//   nav.passable(zone, x, y)                                                                     '.' (ledges are directional)

const LEDGE = { v: [0, 1], '>': [1, 0], '<': [-1, 0] };
export const T = 16;

export function createNav(content) {
  const zones = content.zones;
  const graph = {};
  for (const z of Object.values(zones)) {
    graph[z.id] = [];
    for (const j of z.joins || []) if (zones[j.to]) graph[z.id].push({ to: j.to, j });
  }

  function cell(z, x, y) { if (x < 0 || y < 0 || x >= z.w || y >= z.h) return '#'; return z.collision[y][x]; }
  function passable(z, x, y) { return cell(z, x, y) === '.'; }
  /** can you step from (x, y) to (x + dx, y + dy)? */
  function canStep(z, x, y, dx, dy) {
    const c = cell(z, x + dx, y + dy);
    if (c === '.') return true;
    const ld = LEDGE[c];
    if (ld) return ld[0] === dx && ld[1] === dy;
    return false;
  }

  // binary heap A*
  function path(zoneId, sx, sy, goal, hint, maxNodes = 200000, extra = null) {
    const z = zones[zoneId];
    if (!z) return null;
    const W = z.w, H = z.h, N = W * H;
    const g = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];   // [f, idx]
    const h = hint ? (x, y) => Math.abs(x - hint[0]) + Math.abs(y - hint[1]) : () => 0;
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1; let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
        }
      }
      return top;
    };
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
    const s = sy * W + sx;
    g[s] = 0; prev[s] = s; push(h(sx, sy), s);
    let found = -1, n = 0;
    while (heap.length) {
      const [, c] = pop();
      if (closed[c]) continue;
      closed[c] = 1;
      const x = c % W, y = (c / W) | 0;
      if (goal(x, y)) { found = c; break; }
      if (++n > maxNodes) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (!canStep(z, x, y, dx, dy)) continue;
        const k = ny * W + nx;
        const ng = g[c] + 1 + (extra ? extra[k] : 0);
        if (ng < g[k]) { g[k] = ng; prev[k] = c; push(ng + h(nx, ny), k); }
      }
    }
    if (found < 0) return null;
    const out = [];
    for (let c = found; ; c = prev[c]) { out.push([c % W, (c / W) | 0]); if (prev[c] === c) break; }
    return out.reverse();
  }

  function zoneRoute(from, to) {
    if (from === to) return [from];
    const prev = { [from]: null }, q = [from];
    for (let i = 0; i < q.length; i++) {
      for (const { to: n } of graph[q[i]] || []) if (!(n in prev)) { prev[n] = q[i]; q.push(n); }
    }
    if (!(to in prev)) return null;
    const r = [];
    for (let z = to; z != null; z = prev[z]) r.push(z);
    return r.reverse();
  }

  /** The join to take from `from` toward `to`; when there are two (Willowmere and the valley both join the Downs), the nearest to (sx, sy). */
  function joinTo(from, to, sx, sy) {
    const js = (graph[from] || []).filter((e) => e.to === to).map((e) => e.j);
    if (!js.length) return null;
    if (sx == null) return js[0];
    return js.sort((a, b) => (Math.abs(a.x - sx) + Math.abs(a.y - sy)) - (Math.abs(b.x - sx) + Math.abs(b.y - sy)))[0];
  }

  return { path, zoneRoute, joinTo, passable: (zid, x, y) => passable(zones[zid], x, y), cell: (zid, x, y) => cell(zones[zid], x, y), graph };
}

/** Feet tile of an entity whose x / y are in SUB (1/16 px), as the sim stores them. */
export const tileOfSub = (e) => [Math.floor(e.x / 256), Math.floor((e.y - 1) / 256)];
/** px helpers (SUB -> px) */
export const px = (e) => [e.x / 16, e.y / 16];

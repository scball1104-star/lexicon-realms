// Patrol routes on a clock (src/data/patrols.js). Pure, deterministic.
//
//   compileRoute(zone, patrol)             waypoints -> a walkable tile path (path.js findPath per leg), cached per zone
//   routePoint(R, tick, speed, offset)     where on the route a patrol should stand at this tick [SUB]
//   nearestParam(R, x, y)                  how far along the route [SUB] the point nearest (x, y) [SUB] lies
//
// A patrol's place is a pure function of the tick, so every member of a pair agrees, a patrol that was pulled off walks
// back to where it should be now, and two runs of the same seed match.
import { findPath, tileGoal } from './path.js';

const cache = new WeakMap();      // zone -> Map(key -> compiled route | null)

/** Waypoints [[tx, ty], ...] -> { xy: [[x, y] SUB], cum: [SUB], len, mode }, or null when a leg has no path. */
export function compileRoute(zone, patrol) {
  if (!zone || !patrol || !Array.isArray(patrol.route) || patrol.route.length < 2) return null;
  let byZone = cache.get(zone);
  if (!byZone) { byZone = new Map(); cache.set(zone, byZone); }
  const key = `${patrol.id || ''}|${patrol.mode || 'pingpong'}|${patrol.route.map((p) => p.join(',')).join(';')}`;
  if (byZone.has(key)) return byZone.get(key);
  const pts = patrol.mode === 'loop' ? [...patrol.route, patrol.route[0]] : patrol.route;
  const tiles = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = tiles[tiles.length - 1], [bx, by] = pts[i + 1];
    if (ax === bx && ay === by) continue;
    const leg = findPath(zone, ax, ay, bx, by, 8000);
    if (!leg) { byZone.set(key, null); return null; }
    tiles.push(...leg);
  }
  const xy = tiles.map(([tx, ty]) => tileGoal(tx, ty));
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  const R = { xy, cum, len: cum[cum.length - 1], mode: patrol.mode === 'loop' ? 'loop' : 'pingpong', tiles };
  byZone.set(key, R);
  return R;
}

function at(R, s) {
  const { xy, cum } = R;
  if (s <= 0) return xy[0];
  if (s >= R.len) return xy[xy.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const f = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
  return [Math.round(xy[lo][0] + (xy[hi][0] - xy[lo][0]) * f), Math.round(xy[lo][1] + (xy[hi][1] - xy[lo][1]) * f)];
}

/** The SUB point a patrol should stand on at `tick` (speed in SUB per tick, offset in SUB along the route). */
export function routePoint(R, tick, speed, offset = 0) {
  if (!R || R.len <= 0) return R ? R.xy[0] : null;
  const mod = (a, n) => ((a % n) + n) % n;
  let s = tick * speed + offset;
  if (R.mode === 'loop') s = mod(s, R.len);
  else { s = mod(s, 2 * R.len); if (s > R.len) s = 2 * R.len - s; }
  return at(R, s);
}

/** The route distance [SUB] of the route node nearest (x, y) [SUB] (ties: the first). */
export function nearestParam(R, x, y) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < R.xy.length; i++) {
    const d = (R.xy[i][0] - x) ** 2 + (R.xy[i][1] - y) ** 2;
    if (d < bd) { bd = d; best = R.cum[i]; }
  }
  return best;
}

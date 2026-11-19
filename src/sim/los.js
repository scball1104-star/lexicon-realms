// Line of sight against a zone's solid tiles. Pure.
// Samples the segment between two eye points (feet point lifted 4 px) every 4 px; any '#' cell on the way blocks.
// Water ('~') and ledges do not block sight.
import { SUB, TILE } from './constants.js';
import { cellAt } from './collision.js';

const EYE = 4 * SUB;
const STEP = 4 * SUB;

export function losBetween(zone, ax, ay, bx, by) {
  const x0 = ax, y0 = ay - EYE, x1 = bx, y1 = by - EYE;
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / STEP));
  let lastTx = -9999, lastTy = -9999;
  for (let i = 1; i < n; i++) {
    const tx = Math.floor((x0 + (dx * i) / n) / TILE), ty = Math.floor((y0 + (dy * i) / n) / TILE);
    if (tx === lastTx && ty === lastTy) continue;
    lastTx = tx; lastTy = ty;
    if (cellAt(zone, tx, ty) === '#') return false;
  }
  return true;
}

export function hasLos(zone, a, b) {
  if (!zone) return true;
  return losBetween(zone, a.x, a.y, b.x, b.y);
}

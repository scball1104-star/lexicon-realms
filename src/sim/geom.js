// Geometry helpers on SUB positions. Pure.
import { SUB } from './constants.js';

export function distPx(a, b) {
  const dx = (a.x - b.x) / SUB, dy = (a.y - b.y) / SUB;
  return Math.sqrt(dx * dx + dy * dy);
}
export function distPxXY(ax, ay, bx, by) {
  const dx = (ax - bx) / SUB, dy = (ay - by) / SUB;
  return Math.sqrt(dx * dx + dy * dy);
}
export const DIR_VEC = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

/** Unit vector a -> b (falls back to `dir` when they overlap). */
export function unitTo(a, b, dir = 'down') {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1) return DIR_VEC[dir] || [0, 1];
  return [dx / d, dy / d];
}
export function dirFromVec(vx, vy, prev) {
  if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) return prev;
  if (Math.abs(vx) > Math.abs(vy)) return vx < 0 ? 'left' : 'right';
  return vy < 0 ? 'up' : 'down';
}

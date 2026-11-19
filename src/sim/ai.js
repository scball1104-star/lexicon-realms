// Mob AI. Pure. Phase-1 foundation: wander inside a leash round the spawn point.
// Combat AI (aggro radius, chase, leash reset, flee) is the next wave; it plugs in here as more `mode`s.
import { MOB_WALK_SPEED } from './constants.js';

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export function mobThink(e, tick, rng, zone) {
  const ai = e.ai;
  ai.speed = MOB_WALK_SPEED;
  const offX = e.x - e.spawn.x, offY = e.y - e.spawn.y;
  const far = Math.abs(offX) > ai.leash || Math.abs(offY) > ai.leash;
  if (far && ai.mode !== 'home') {
    ai.mode = 'home'; ai.until = tick + 60;
    ai.dx = offX > ai.leash / 2 ? -1 : offX < -ai.leash / 2 ? 1 : 0;
    ai.dy = offY > ai.leash / 2 ? -1 : offY < -ai.leash / 2 ? 1 : 0;
    return;
  }
  if (ai.mode === 'walk' && (ai.blocked || 0) > 2) { ai.until = tick; }
  if (tick < ai.until) return;
  ai.blocked = 0;
  if (ai.mode !== 'idle') {
    ai.mode = 'idle'; ai.dx = 0; ai.dy = 0;
    ai.until = tick + rng.int(20, 70);
  } else {
    ai.mode = 'walk';
    const [dx, dy] = STEPS[rng.int(0, STEPS.length - 1)];
    ai.dx = dx; ai.dy = dy;
    ai.until = tick + rng.int(8, 30);
  }
}

// Public surface of the sim. Pure: imports only from src/sim/ (and callers pass data in).
export { createWorld, restoreWorld, distPx, STATE_VERSION } from './world.js';
export { TICK_HZ, TICK_MS, SUB, TILE, TILE_PX, GCD_TICKS } from './constants.js';
export { cellAt, inJoin, spotFree } from './collision.js';
export { hashString } from './hash.js';
export { createRng } from './rng.js';

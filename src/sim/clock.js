// The world clock. Pure. The renderer draws day and night from snapshot.dayTime (src/render/daycycle.js reads it before
// deriving its own), so the sim's night spawns and the sky always agree.
import { DAY_TICKS, DAY_START, NIGHT_FROM, NIGHT_TO } from './constants.js';

/** 0..1 (0 = midnight, 0.5 = noon) at a tick. */
export function dayFraction(tick) {
  const f = DAY_START + tick / DAY_TICKS;
  return f - Math.floor(f);
}
export function isNight(tick) {
  const f = dayFraction(tick);
  return f >= NIGHT_FROM || f < NIGHT_TO;
}

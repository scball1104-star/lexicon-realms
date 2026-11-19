// Day/night cycle math (pure; node-tested in qa/render/). No DOM.
//
//   dayFraction(snap, view)  -> 0..1 (0 = midnight, 0.5 = noon). Order of authority:
//                               view.tod (dev/QA override) > snap.dayTime (sim, if it ever carries one) >
//                               derived from snap.tick (one day = DAY_TICKS ticks, starting at DAY_START)
//   skyAt(f)                 -> { amb: [r,g,b] 0..1 multiplier, desat, lamps 0..1, sun: { lean, alpha } , phase }
//   clockLabel(f)            -> 'HH:MM' (dev overlay, tests)
//
// A day is 40 real minutes (DESIGN brief). Derived from the sim tick, so every client of one host shares the clock.

export const TICK_HZ = 20;
export const DAY_SECONDS = 40 * 60;
export const DAY_TICKS = DAY_SECONDS * TICK_HZ;     // 48000
export const DAY_START = 0.32;                      // a new world starts at about 7:40 in the morning

// Ambient keyframes: [dayFraction, [r, g, b] multiplier, desaturation]. Night is a cool, drained blue; dawn warm rose;
// noon a hair warm; dusk a violet rose; a blue hour on each side of the night.
export const KEYS = [
  [0.000, [0.30, 0.33, 0.56], 0.40],
  [0.180, [0.30, 0.33, 0.56], 0.40],
  [0.215, [0.46, 0.44, 0.66], 0.28],   // blue hour before dawn
  [0.255, [1.00, 0.80, 0.68], 0.06],   // dawn
  [0.310, [1.00, 0.97, 0.92], 0.00],
  [0.500, [1.00, 1.00, 0.97], 0.00],   // noon
  [0.690, [1.00, 0.95, 0.86], 0.00],   // late afternoon gold
  [0.760, [0.94, 0.66, 0.66], 0.08],   // dusk
  [0.805, [0.56, 0.48, 0.74], 0.20],   // blue hour
  [0.850, [0.30, 0.33, 0.56], 0.40],   // night
  [1.000, [0.30, 0.33, 0.56], 0.40],
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (k) => k * k * (3 - 2 * k);
const wrap = (f) => (f >= 0 && f < 1 ? f : ((f % 1) + 1) % 1);

export function dayFraction(snap, view = {}) {
  if (view && typeof view.tod === 'number') return wrap(view.tod);
  if (snap && typeof snap.dayTime === 'number') return wrap(snap.dayTime);
  const tick = snap && snap.tick ? snap.tick : 0;
  return wrap(DAY_START + tick / DAY_TICKS);
}

/** Ambient multiplier and desaturation at day fraction f (smoothstep between keyframes). */
export function ambientAt(f) {
  f = wrap(f);
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [f0, c0, d0] = KEYS[i], [f1, c1, d1] = KEYS[i + 1];
    if (f >= f0 && f <= f1) {
      const k = f1 > f0 ? smooth((f - f0) / (f1 - f0)) : 0;
      return { amb: [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k], desat: d0 + (d1 - d0) * k };
    }
  }
  return { amb: KEYS[0][1].slice(), desat: KEYS[0][2] };
}

export const luminance = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/**
 * Everything the renderer needs from the clock.
 *   lamps: how lit the lamps, windows and the player's own light are (0 by day, 1 at night)
 *   sun.lean: shadow x offset in px (-3 morning: shadows point west .. +3 evening), 0 at night
 *   sun.alpha: drop-shadow strength (0.45 by day, 0.22 at night: moonlight)
 *   clouds: cloud-shadow strength (0 at night)
 *   phase: 'night' | 'dawn' | 'day' | 'dusk' (labels for tests and the dev overlay)
 */
export function skyAt(f) {
  f = wrap(f);
  const { amb, desat } = ambientAt(f);
  const lum = luminance(amb);
  const lamps = clamp01((0.93 - lum) / 0.45);
  const dayK = clamp01((lum - 0.45) / 0.45);
  let lean = 0;
  if (f > 0.22 && f < 0.82) lean = Math.round(Math.max(-3, Math.min(3, ((f - 0.52) / 0.27) * 3)));
  const phase = f < 0.215 || f >= 0.83 ? 'night' : f < 0.31 ? 'dawn' : f < 0.72 ? 'day' : 'dusk';
  return { amb, desat, lamps, lum, sun: { lean: dayK > 0.3 ? lean : 0, alpha: 0.22 + 0.23 * dayK }, clouds: dayK, phase };
}

/** Ambient quantized to steps of 4/255 per channel (light stamps are cached per ambient). */
export function quantizeAmb(amb) {
  return amb.map((v) => Math.max(0, Math.min(255, Math.round((v * 255) / 4) * 4)));
}

export function clockLabel(f) {
  const m = Math.floor(wrap(f) * 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

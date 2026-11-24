// Combat feel pass (wave 6, approved by Scott 2026-11-24): the weight layer played under the player's own hits, and
// the pure rules behind it (how heavy a hit is, how long its hit stop lasts, which spark size it gets). Render only:
// nothing here is read by the sim, and the 20 Hz sim never waits for a hit stop.
//
//   FEEL                         recipes for the FX kit: feel_s / feel_m / feel_l, each with a dimmed (_d) and a tinted
//                                (_p) body flash for pale bodies (a white flash washed a pale foe out to plain white)
//   createHitWeigher()           .weigh(amount, crit) -> 0.6 to 2.2 (x1.5 on a crit), against the player's own last 12
//                                non-crit hits
//   tierOf(w, crit, lite)        's' | 'm' | 'l' (lite: Low quality and phones always 's')
//   hitStopFor(w, { crit, auto }) seconds of body slow-down (30 to 75 ms by weight, 90 ms crit; autos lower)
//   flashOf(lum, size)           '' | '_d' | '_p' from a body's light (linear 0 to 1, bodyLight in fx3d.js) and size
//                                (height / 1.7 m, 1 to 1.7): a big body fills the view, so its flash is dimmed, and a
//                                pale or very big one gets a faint school-coloured flash instead of white
//   feelName(tier, flash)        the recipe name
// Same layer language as fx_recipes.js. The white body flash plays first, so it wins over the ability's own tint.

const bodyFlash = (color, mul, dur) => ({ type: 'hitflash', color, mul, dur });
const core = (size, life, mul) => ({ type: 'flash', where: 'to', tile: 'core', size, grow: 2.4, life, color: '#ffffff', mul });
const sparks = (n, speed, size, extra = {}) => ({ type: 'burst', where: 'to', n, tile: 'spark', cone: 'dir', spread: 1.25, speed, up: 1.0, grav: -11,
  drag: 2.2, life: [0.18, 0.4], size, stretch: 0.07, color: 'core', mul: 2.0, bounce: true, ...extra });
const shock = (size, grow, life, mul) => ({ type: 'ring', where: 'to', tile: 'shock', flat: false, size, grow, life, color: '#ffffff', mul, alpha: 'fade2' });

// [flash mul, flash dur, the rest of the layers]. The body flash is emissive: at 1.0 a body turns plain white (the
// prototype's Old Greybark washout), so it stays at 0.7 or under; the shock shell and core stay faint for the same reason
const TIERS = {
  s: [0.45, 0.07, () => [core(0.2, 0.07, 1.4), sparks(8, [3, 6], [0.03, 0.05])]],
  m: [0.6, 0.09, () => [core(0.3, 0.08, 1.7), sparks(16, [4, 8], [0.035, 0.06]), shock(0.35, 3.2, 0.16, 0.3)]],
  l: [0.7, 0.11, () => [core(0.26, 0.09, 1.2), sparks(28, [5, 11], [0.04, 0.07]), sparks(10, [7, 13], [0.05, 0.08], { cone: 'sphere', grav: -14 }),
    shock(0.4, 3.4, 0.18, 0.32), { type: 'light', where: 'to', dur: 0.12, k: 0.8, color: '#ffffff' }]],
};
// the body flash on a mid-light body: white, a little over half as strong; on a pale body: the school's main colour, faint
const FLASH = { '': (mul) => ['#ffffff', mul], _d: (mul) => ['#ffffff', mul * 0.55], _p: (mul) => ['main', mul * 0.35] };

export const FEEL = {};
for (const [t, [mul, dur, rest]] of Object.entries(TIERS)) {
  for (const [f, pick] of Object.entries(FLASH)) {
    const [color, m] = pick(mul);
    FEEL[`feel_${t}${f}`] = { layers: [bodyFlash(color, +m.toFixed(3), dur), ...rest()] };
  }
}

export const feelName = (tier, flash = '') => `feel_${tier}${flash}`;

/** Light of a body in linear units: under 0.28 takes the full white flash, up to 0.45 a dimmed one, above that tinted.
 *  Size: from 1.15 (a bear, a big rare) the flash is dimmed, from 1.45 tinted (the Old Greybark washout, wave 6 still 2). */
export const PALE = 0.45, MID = 0.28, BIG = 1.15, HUGE = 1.45;
export function flashOf(lum, size = 1) {
  const l = lum >= 0 ? lum : 0;
  if (l >= PALE || size >= HUGE) return '_p';
  if (l >= MID || size >= BIG) return '_d';
  return '';
}

export function createHitWeigher(n = 12) {
  let avg = 0, k = 0;
  return {
    weigh(amount, crit) {
      const amt = amount > 0 ? amount : 0;
      const w = avg > 0 ? amt / avg : 1;
      if (!crit && amt > 0) { k = Math.min(k + 1, n); avg += (amt - avg) / k; }
      return Math.max(0.6, Math.min(2.2, w)) * (crit ? 1.5 : 1);
    },
    get avg() { return avg; },
  };
}

export function tierOf(w, crit, lite = false) {
  if (lite) return 's';
  return crit || w >= 1.4 ? 'l' : w >= 0.9 ? 'm' : 's';
}

/** Seconds of hit stop: every hit you land, kept short. Autos (fast and many) get a lower cap. */
export const STOP = { min: 0.03, max: 0.075, crit: 0.09, autoMax: 0.045, autoCrit: 0.06 };
export function hitStopFor(w, { crit = false, auto = false } = {}) {
  if (crit) return auto ? STOP.autoCrit : STOP.crit;
  const k = Math.max(0, Math.min(1, ((w || 0) - 0.6) / 1.6));      // weight 0.6 to 2.2 -> 30 to 75 ms
  const s = STOP.min + (STOP.max - STOP.min) * k;
  return auto ? Math.min(STOP.autoMax, s) : s;
}

/** The body animation rate while a hit stop runs (today's crit-only stop slowed it to 25%). */
export const STOP_RATE = 0.04;

// The start realms' cycles (wave 3, lane realms1, 2026-11-22): pure rules on a tick and a zone's own data, shared by the
// sim (src/sim/realm_mech.js) and the renderers (src/render/realm2d.js, src/render3d/realm3d.js), like travel.js's
// flightRoute. No imports, no clock. The sim keeps the same rules in src/sim/realm_mech.js (it imports only its siblings);
// qa/world/realms2.test.mjs checks the two copies agree.
//
//   lavaAt(zone, tick) -> { hot, left, k }               Emberpeak: zone.lava { cycle, hot } (seconds)
//   tideAt(zone, tick) -> { level, high, rising, left }  Valewyn: zone.tide { period } (seconds)

const TPS = 20;

/** The lava cycle at a tick: hot (glowing), seconds left in this phase, k (0 black .. 1 full glow, eased at the turns). */
export function lavaAt(zone, tick) {
  const L = zone && zone.lava;
  if (!L) return null;
  const cyc = L.cycle * TPS, hot = L.hot * TPS, t = ((tick % cyc) + cyc) % cyc;
  const isHot = t < hot;
  const left = (isHot ? hot - t : cyc - t) / TPS;
  const ramp = 1.5 * TPS;      // the glow fades in and out over 1.5 s (drawn only: the rule is the hot window)
  const k = isHot ? Math.min(1, t / ramp, (hot - t) / ramp + 0.25) : Math.max(0, 1 - (t - hot) / ramp) * 0.25;
  return { hot: isHot, left, k: Math.max(0, Math.min(1, k)) };
}

/** The tide at a tick: level 0..1 (0 low water, 1 high), high (the flats are under), rising, seconds to the next turn. */
export function tideAt(zone, tick) {
  const T = zone && zone.tide;
  if (!T) return null;
  const per = T.period * TPS, t = ((tick % per) + per) % per;
  const level = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / per);
  const rising = t < per / 2;
  // the flats flood at level 0.5: a quarter of the way into the loop, and drain three quarters of the way
  const turn = t < per / 4 ? per / 4 : t < (3 * per) / 4 ? (3 * per) / 4 : per + per / 4;
  return { level, high: level >= 0.5, rising, left: (turn - t) / TPS };
}

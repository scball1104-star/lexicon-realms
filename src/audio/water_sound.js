// Water kit sound (wave 7): where the waterfalls are and how loud each one is from where you stand. Pure, no WebAudio,
// so it is tested in node (qa/tests/water.test.mjs). synth_game.js nearby() feeds the result to its 'loop:falls'.
//
//   fallsFeet(zone)                 -> [{ x, y }] the foot of each waterfall secret in the zone, in world pixels
//   fallsMix(me, feet)              -> { level 0..0.6, pan -0.6..0.6 } for the nearest foot within FALLS_REACH tiles
const TILE = 16;
export const FALLS_REACH = 14;   // tiles: the roar carries further than the brook's 6

export function fallsFeet(zone) {
  const out = [];
  for (const s of (zone && zone.secrets) || []) {
    if (s.kind !== 'waterfall' || !s.passage || !s.passage.length) continue;
    const xs = s.passage.map((p) => p[0]), ys = s.passage.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, foot = Math.max(...ys) + 1.35;
    out.push({ x: cx * TILE, y: foot * TILE });
  }
  return out;
}

export function fallsMix(me, feet) {
  let best = null, bd = 1e9;
  for (const f of feet || []) { const d = Math.hypot(f.x - me.x, f.y - me.y); if (d < bd) { bd = d; best = f; } }
  const reach = FALLS_REACH * TILE;
  if (!best || bd >= reach) return { level: 0, pan: 0 };
  const k = 1 - bd / reach;
  return { level: 0.6 * Math.pow(k, 1.6), pan: Math.max(-0.6, Math.min(0.6, (best.x - me.x) / (8 * TILE))) };
}

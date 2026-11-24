// Sky rig: the pure numbers behind the sky kit (wave 5 Track A, 2026-11-24). No three.js and no DOM, so node can test it.
//
//   skyTier({ q3d, sky, touchLow })  -> 'full' | 'lite' | 'off'
//        'off'  : ?q3d=low or ?sky=off. The renderer then never builds a sky object: today's look exactly.
//        'lite' : touch devices on the automatic low tier (phones): the dome, its clouds and the light rig, no rain
//                 streaks and no far hills ring.
//        'full' : desktop: dome, clouds, light rig, rain streaks, lightning, far hills ring.
//        ?sky=full|lite|off overrides (drivers and look-dev). At run time view.fx 'low' (Options: Effects low) also
//        switches the kit off for that frame (sky_kit.js frame()).
//   lightRig(f)          -> { phase, zenith, horizon, sun, hemiSky, hemiGround, sunK, golden, night, stars, day }
//        colours are [r, g, b] 0..1 (sRGB hex values as numbers), f is the day fraction (daycycle.js: 0 midnight, 0.5 noon)
//   sunDir(f), moonDir() -> unit [x, y, z] for the dome (x east, y up, z south: the camera looks north)
//   weatherState(w, zone, area) -> { kind, rain, storm, mist, cover, dark, sunK, hemiK, fogK }
//        w is view.weather (string or object), else area.weather, else zone.weather
//   flashAt(t, storm)    -> 0..1 lightning flash at render time t (s); deterministic, so a pinned clock gives a still
//
// The rig keys come from the approved prototype (D:\lr_lookdev\proto\sky_kit.js) moved onto the game's own clock:
// dawn at 0.255, noon 0.5, golden hour about 0.69 to 0.75, dusk 0.76, night from 0.85.

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// [f, zenith, horizon, sun colour, sun strength (x today's), hemi sky tint, hemi ground tint, golden 0..1]
export const RIG_KEYS = [
  [0.000, '#060a18', '#18203a', '#8fa2ff', 1.0, '#8a96d0', '#2a2420', 0],
  [0.200, '#080c1e', '#1c2440', '#8fa2ff', 1.0, '#8a96d0', '#2a2420', 0],
  [0.245, '#1a2246', '#7a5a6a', '#ff9a6a', 1.0, '#a8a0c8', '#3a2c22', 0.6],
  [0.290, '#4a78b8', '#f0c4a0', '#ffc890', 1.0, '#c8c8e8', '#4a3a28', 0.7],
  [0.380, '#3a78d0', '#bcd6ee', '#fff4e0', 1.0, '#d8e2ff', '#5a4a34', 0],
  [0.620, '#3a78d0', '#bcd6ee', '#fff4e0', 1.0, '#d8e2ff', '#5a4a34', 0],
  [0.700, '#4a6aa8', '#f4b07a', '#ffb070', 1.08, '#e0c8c0', '#5a4028', 1],
  [0.760, '#2a2a58', '#d0705a', '#ff7a4a', 1.0, '#a888b0', '#3a2a20', 0.8],
  [0.820, '#0e1230', '#3a2a48', '#8fa2ff', 1.0, '#8a90c8', '#2a2420', 0],
  [1.000, '#060a18', '#18203a', '#8fa2ff', 1.0, '#8a96d0', '#2a2420', 0],
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const wrap = (f) => (f >= 0 && f < 1 ? f : ((f % 1) + 1) % 1);
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

export function rigPhase(f) {
  f = wrap(f);
  if (f < 0.215 || f >= 0.83) return 'night';
  if (f < 0.34) return 'morning';
  if (f < 0.66) return 'noon';
  return 'golden';
}

export function lightRig(f) {
  f = wrap(f);
  let i = 0;
  while (i < RIG_KEYS.length - 2 && RIG_KEYS[i + 1][0] <= f) i++;
  const a = RIG_KEYS[i], b = RIG_KEYS[i + 1];
  const t = (f - a[0]) / Math.max(1e-6, b[0] - a[0]), k = t * t * (3 - 2 * t);
  const day = f > 0.235 && f < 0.8 ? clamp01(Math.sin(((f - 0.235) / 0.565) * Math.PI) * 4) : 0;
  const night = clamp01(1 - day * 1.5);
  return {
    phase: rigPhase(f),
    zenith: lerp3(hex(a[1]), hex(b[1]), k), horizon: lerp3(hex(a[2]), hex(b[2]), k), sun: lerp3(hex(a[3]), hex(b[3]), k),
    sunK: lerp(a[4], b[4], k), hemiSky: lerp3(hex(a[5]), hex(b[5]), k), hemiGround: lerp3(hex(a[6]), hex(b[6]), k),
    golden: lerp(a[7], b[7], k), day, night, stars: clamp01((night - 0.3) / 0.7),
  };
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** The sun on the dome: rises in the east (+x), crosses the south (+z, behind today's camera), sets in the west. */
export function sunDir(f) {
  const a = ((wrap(f) - 0.25) / 0.5) * Math.PI;      // 0 at sunrise, PI at sunset
  return norm([Math.cos(a), Math.sin(a) * 0.85, 0.42]);
}
/** The moon: high in the south-west, where today's renderer puts the night light. */
export const moonDir = () => norm([-10, 23.2, 10]);

// weather kinds: what each looks like in 3D
const WX = {
  clear: { rain: 0, storm: 0, mist: 0, cover: 0.42, dark: 0 },
  cloudy: { rain: 0, storm: 0, mist: 0.1, cover: 0.62, dark: 0.15 },
  rain: { rain: 1, storm: 0, mist: 0.3, cover: 0.8, dark: 0.45 },
  storm: { rain: 1, storm: 1, mist: 0.35, cover: 0.92, dark: 0.75 },
  mist: { rain: 0, storm: 0, mist: 1, cover: 0.6, dark: 0.2 },
};
WX.fog = WX.mist;
// areas with their own sky when the weather is clear (the moor's grey mood keeps a heavier cloud cover)
const AREA_SKY = { moor: 'cloudy' };

export function weatherState(w, zone, area) {
  if (w == null) w = (area && area.weather) || (zone && zone.weather) || null;
  let kind = 'clear', base;
  if (w && typeof w === 'object') {
    const rain = clamp01(+w.rain || 0), storm = clamp01(+w.storm || 0), mist = clamp01(+w.mist || 0);
    kind = storm > 0 ? 'storm' : rain > 0 ? 'rain' : mist > 0 ? 'mist' : 'clear';
    base = { rain: Math.max(rain, storm), storm, mist: Math.max(mist, rain * 0.3), cover: lerp(0.42, 0.92, Math.max(rain * 0.8, storm, mist * 0.6)),
      dark: Math.max(rain * 0.45, storm * 0.75, mist * 0.2) };
  } else {
    kind = WX[w] ? (w === 'fog' ? 'mist' : w) : 'clear';     // leaves and pollen are 2D particles: a clear sky here
    if (kind === 'clear' && area && AREA_SKY[area.id]) kind = AREA_SKY[area.id];
    else if (kind === 'clear' && zone && AREA_SKY[zone.id]) kind = AREA_SKY[zone.id];
    base = WX[kind];
  }
  return {
    kind, ...base,
    sunK: 1 - 0.7 * base.dark,                 // the sun through the cloud
    hemiK: 1 - 0.3 * base.dark,                // the sky fill
    fogK: 1 - 0.4 * base.mist - 0.1 * base.rain,   // fog far end, as a share of today's
  };
}

const h1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** Lightning: in a storm about one strike every 6 to 10 s, each a bright double flicker that fades in 0.6 s. */
export function flashAt(t, storm) {
  if (!storm) return 0;
  const P = 2.0, slot = Math.floor(t / P), u = t - slot * P;
  if (h1(slot) < 0.75) return 0;             // a quarter of the 2 s slots strike
  const at = h1(slot + 0.5) * 1.2;           // when in the slot
  const d = u - at;
  if (d < 0 || d > 0.6) return 0;
  const flick = d < 0.08 ? 1 : d < 0.14 ? 0.3 : d < 0.22 ? 0.85 : 0;
  return Math.max(flick, Math.exp(-d * 6) * 0.6) * storm;
}

export function skyTier({ q3d = null, sky = null, touchLow = false } = {}) {
  if (sky === 'off' || sky === '0') return 'off';
  if (sky === 'full' || sky === 'lite') return sky;
  if (q3d === 'low') return 'off';
  return touchLow ? 'lite' : 'full';
}

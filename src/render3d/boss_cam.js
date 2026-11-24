// Boss intro push-in (wave 6 BUILD, bosscard lane; brief D:\LQOnline\wave6\questpres\BRIEF.md still 3b, approved by Scott
// 2026-11-24). Pure: no THREE, no DOM, no sim. renderer3d.js calls bossFrame once a frame while view.bossCam is set
// (src/ui/boss_card.js makes it); with view.bossCam null nothing here runs and the camera is today's.
//
//   bossFrame(bc, base) -> { tx, ty, tz, pitch, dist }   the camera this frame: today's (base) eased towards the push-in
//       bc:   { k: 0..1 (eased in and out by the card), hero: { x, y }, boss: { x, y, h } (world px, 16 = 1 m; h: the
//               boss's height), band: { lo, hi } (NDC: the screen rows the two must stay between, clear of the card) }
//       base: { tx, ty, tz, pitch (rad), dist (m), bx, bz (the camera's ground direction back from the target), fov (deg,
//               vertical), aspect, gy (x, z) -> ground height or null }
//   pushPose(bc, base) -> the full push-in (k = 1): the target between the hero and the boss, the tilt a little lower,
//       and the CLOSEST distance (binary search) at which the hero's feet and head and the boss's feet and head all stand
//       inside the band and inside 80% of the frame's width. A vertical shift of the target along the camera's up keeps
//       them in the band's middle. Never further than PULL_MAX x today's distance.
//   project(p, cam) -> { x, y, depth } a world point (m) in the camera's frame (NDC x, y; depth m), for tests.
//
// It keeps today's facing: the fixed camera stays north-up and the horizon camera keeps the player's own turn, which
// this never writes (view.cam is not touched). Indoors and below ground (no horizon camera) it is the same push-in.

const PX = 16;
const D2R = Math.PI / 180;
export const PITCH_DROP = 8 * D2R;      // the push-in looks a little lower than today's view
export const PITCH_FLOOR = 14 * D2R;    // never below this (unless today's own view is lower)
export const PUSH = 0.62;               // the push-in aims for 62% of today's distance, closer if the two fit
export const MIN_DIST = 4;              // m
export const X_MARGIN = 0.8;            // of the half width
export const PULL_MAX = 1.5;            // a hero far from the boss (a caster at range): out to 1.5x today's distance at most

const lerp = (a, b, k) => a + (b - a) * k;

function basis(pitch, bx, bz) {
  // back: from the target to the camera (unit); forward = -back; right = forward x up; up' = right x forward
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const b = [bx * cp, sp, bz * cp];
  const f = [-b[0], -b[1], -b[2]];
  let r = [-f[2], 0, f[0]];
  const rl = Math.hypot(r[0], r[2]) || 1;
  r = [r[0] / rl, 0, r[2] / rl];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { b, r, u };
}
const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];

/** A world point (m) in a camera { tx, ty, tz, pitch, dist, bx, bz, fov, aspect }: NDC x and y, depth in m. */
export function project(p, cam) {
  const { b, r, u } = basis(cam.pitch, cam.bx, cam.bz);
  const rel = [p[0] - cam.tx, p[1] - cam.ty, p[2] - cam.tz];
  const depth = cam.dist - dot(rel, b);
  const tv = Math.tan((cam.fov * D2R) / 2), th = tv * cam.aspect;
  return { x: dot(rel, r) / (depth * th), y: dot(rel, u) / (depth * tv), depth };
}

function points(bc, gy) {
  const hx = bc.hero.x / PX, hz = bc.hero.y / PX, sx = bc.boss.x / PX, sz = bc.boss.y / PX;
  const g = (x, z) => { const v = gy ? gy(x, z) : 0; return Number.isFinite(v) ? v : 0; };
  const gh = g(hx, hz), gs = g(sx, sz), bh = (bc.boss.h || 40) / PX;
  return { hx, hz, sx, sz, gh, gs, list: [[hx, gh, hz], [hx, gh + 1.9, hz], [sx, gs, sz], [sx, gs + bh, sz]] };
}

export function pushPose(bc, base) {
  const P = points(bc, base.gy);
  const pitch = Math.max(Math.min(base.pitch, PITCH_FLOOR), base.pitch - PITCH_DROP);
  const { b, r, u } = basis(pitch, base.bx, base.bz);
  const t0 = [lerp(P.hx, P.sx, 0.55), lerp(P.gh, P.gs, 0.55) + 1.0, lerp(P.hz, P.sz, 0.55)];
  const tv = Math.tan((base.fov * D2R) / 2), th = tv * (base.aspect || 16 / 9);
  const band = bc.band || { lo: -0.3, hi: 0.7 };
  const rel = P.list.map((p) => [p[0] - t0[0], p[1] - t0[1], p[2] - t0[2]]);
  const rb = rel.map((q) => dot(q, b)), rx = rel.map((q) => dot(q, r)), ry = rel.map((q) => dot(q, u));
  // at distance d: x fits, and the vertical shift s (target moved by s along up) has a non-empty range
  const fit = (d) => {
    let sLo = -Infinity, sHi = Infinity;
    for (let i = 0; i < rel.length; i++) {
      const D = d - rb[i];
      if (D < 0.6) return null;
      if (Math.abs(rx[i]) > X_MARGIN * D * th) return null;
      // NDC y of point i after the shift: (ry - s) / (D tv), inside [lo, hi]
      sLo = Math.max(sLo, ry[i] - band.hi * D * tv);
      sHi = Math.min(sHi, ry[i] - band.lo * D * tv);
    }
    return sLo <= sHi ? (sLo + sHi) / 2 : null;
  };
  const dMax = Math.max(MIN_DIST + 0.5, base.dist * PULL_MAX);
  let lo = Math.max(MIN_DIST, Math.min(base.dist * PUSH, dMax)), hi = dMax, s = fit(lo);
  if (s == null) {
    if (fit(hi) == null) { hi = dMax; lo = hi; s = 0; }    // cannot fit (far apart): today's reach, centred
    else { for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (fit(m) == null) lo = m; else hi = m; } lo = hi; s = fit(hi); }
  }
  const dist = lo;
  return { tx: t0[0] + u[0] * s, ty: t0[1] + u[1] * s, tz: t0[2] + u[2] * s, pitch, dist };
}

/** Today's camera (base) eased towards the push-in by bc.k (0: today's exactly). */
export function bossFrame(bc, base) {
  const k = Math.max(0, Math.min(1, bc && bc.k != null ? bc.k : 0));
  if (!bc || k <= 0) return { tx: base.tx, ty: base.ty, tz: base.tz, pitch: base.pitch, dist: base.dist };
  const p = pushPose(bc, base);
  return { tx: lerp(base.tx, p.tx, k), ty: lerp(base.ty, p.ty, k), tz: lerp(base.tz, p.tz, k), pitch: lerp(base.pitch, p.pitch, k), dist: lerp(base.dist, p.dist, k) };
}

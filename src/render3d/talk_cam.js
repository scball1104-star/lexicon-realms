// Quest scenes (wave 6, PLAN item 9, approved by Scott 2026-11-24; brief D:\LQOnline\wave6\questpres\BRIEF.md): the talk
// camera. (A boss intro camera is the bosscard lane: src/render3d/boss_cam.js.) Pure: no THREE, no DOM, no sim (tests run it in Node).
//
//   view.talk (set by main.js from ui.talkView each frame, null when nothing is on):
//     { kind: 'talk', hero: { x, y }, speaker: { x, y }, flip, aside, hideLabels }   world px (16 = 1 m)
//   talkPose(hero, speaker, { lite, flip, aside })  -> { yaw, pitch, dist, focus }   degrees, m, world px: behind the
//       hero's shoulder looking at the speaker. aside > 0 moves the look point to the camera's left so the speaker
//       stands right of the middle (phones: the talk panel is on the left).
//   pickShoulder(hero, speaker, solid, opts) -> flip   the shoulder with open ground between the lens and the speaker
//       (solid(tx, ty): a blocked map cell). Ties keep the right shoulder.
//   createTalkCam() -> { frame(spec, dt, base, { place, lite, groundY }), get k }
//       base: today's camera this frame { yaw, pitch (radians), dist, target { x, y, z } (m), fov }. Returns null when
//       the talk camera is fully off (today's camera untouched), else the camera to use:
//       { yaw, pitch (radians), dist, target, fov, hpose? }. It eases 0.6 s in and 0.35 s out and only ever reads the
//       player's own camera, so the horizon camera goes back to exactly the player's turn, tilt and distance, and the
//       fixed camera back to exactly today's north-up view.
//   Indoors and below ground (where the horizon camera stands down) it is only a gentle push-in at today's angle, onto
//   the point between the hero and the speaker, so the hero stays in frame.

const R2D = 180 / Math.PI, D2R = Math.PI / 180;
const PX = 16;
export const TALK_EASE_IN = 0.6;
export const TALK_EASE_OUT = 0.35;
export const PUSH = 0.72;   // indoors and below ground: this share of today's distance

/** Over the hero's shoulder onto the speaker. */
export function talkPose(hero, speaker, { lite = false, flip = false, aside = 0 } = {}) {
  const dx = (hero.x - speaker.x) / PX, dz = (hero.y - speaker.y) / PX;
  const d = Math.max(0.8, Math.hypot(dx, dz));
  const yaw = Math.atan2(-dx, dz) * R2D + (flip ? -38 : 38);   // on the line speaker -> hero, turned off it
  const dist = Math.min(10, d + 2.8);
  const yr = yaw * D2R, s = aside * dist * PX;                 // the camera's right is (cos yaw, sin yaw) on the map
  return {
    focus: { x: speaker.x - Math.cos(yr) * s, y: speaker.y - Math.sin(yr) * s },
    yaw: ((yaw % 360) + 360) % 360,
    pitch: lite ? 12 : 7,                // the horizon camera's tilt stop on phones and Low quality is 10 degrees
    dist,                                // the hero a step in front of the lens, the speaker a body-length beyond
  };
}

/** Where the lens stands for a pose, in world px (yaw 0 sits south of the look point). */
export function lensAt(pose) {
  const yr = pose.yaw * D2R, hz = pose.dist * Math.cos(pose.pitch * D2R) * PX;
  return { x: pose.focus.x - Math.sin(yr) * hz, y: pose.focus.y + Math.cos(yr) * hz };
}

/** Blocked cells on the line lens -> speaker (every half metre), the lens's own cell counting triple. */
export function shoulderCost(hero, speaker, solid, opts = {}) {
  const p = talkPose(hero, speaker, opts);
  const a = lensAt(p);
  const n = Math.max(2, Math.ceil(Math.hypot(speaker.x - a.x, speaker.y - a.y) / (PX / 2)));
  let cost = 0;
  for (let i = 0; i < n; i++) {
    const x = a.x + ((speaker.x - a.x) * i) / n, y = a.y + ((speaker.y - a.y) * i) / n;
    if (solid(Math.floor(x / PX), Math.floor((y - 1) / PX))) cost += i === 0 ? 3 : 1;
  }
  return cost;
}

export function pickShoulder(hero, speaker, solid, opts = {}) {
  if (!solid) return false;
  return shoulderCost(hero, speaker, solid, { ...opts, flip: true }) < shoulderCost(hero, speaker, solid, { ...opts, flip: false });
}

const smooth = (k) => { const t = Math.max(0, Math.min(1, k)); return t * t * (3 - 2 * t); };
const lerp = (a, b, s) => a + (b - a) * s;
/** The short way round between two angles in radians. */
const lerpAng = (a, b, s) => { const d = ((((b - a) * R2D + 540) % 360) - 180) * D2R; return a + d * s; };

export function createTalkCam() {
  let k = 0, last = null;
  return {
    get k() { return k; },
    /** horizonPose: src/render3d/horizon_cam.js horizonPose (passed in so this file stays pure and THREE-free). */
    frame(spec, dt, base, { place = false, lite = false, groundY = null, horizonPose = null } = {}) {
      if (spec && spec.hero && spec.speaker) last = spec;
      const want = spec && spec.hero && spec.speaker ? 1 : 0;
      const step = Math.max(0, Math.min(0.1, dt || 0));
      k = want ? Math.min(1, k + step / TALK_EASE_IN) : Math.max(0, k - step / TALK_EASE_OUT);
      if (k <= 0 || !last) { if (!want) last = null; return null; }
      const s = smooth(k);
      const gy = (x, z) => (groundY ? groundY(x, z) || 0 : 0);
      const mid = { x: (last.hero.x + last.speaker.x) / 2 / PX, z: (last.hero.y + last.speaker.y) / 2 / PX };
      if (place) {
        // a gentle push-in at today's angle onto the point between the two (the hero stays in frame)
        const tz = { x: mid.x, y: base.target.y + gy(mid.x, mid.z) - gy(base.target.x, base.target.z), z: mid.z };
        return {
          yaw: base.yaw, pitch: base.pitch, dist: base.dist * lerp(1, PUSH, s), fov: base.fov,
          target: { x: lerp(base.target.x, tz.x, s), y: lerp(base.target.y, tz.y, s), z: lerp(base.target.z, tz.z, s) },
        };
      }
      const p = talkPose(last.hero, last.speaker, { lite, flip: !!last.flip, aside: last.aside || 0 });
      const fx = p.focus.x / PX, fz = p.focus.y / PX;
      const hp = horizonPose ? horizonPose({ yaw: p.yaw, pitch: p.pitch, dist: p.dist, lite }, { lite }) : null;
      const tt = { x: fx, y: gy(fx, fz) + 1.15, z: fz };   // a little under the faces: they sit in the upper middle
      const yaw = lerpAng(base.yaw, p.yaw * D2R, s), pitch = lerp(base.pitch, p.pitch * D2R, s), dist = lerp(base.dist, p.dist, s);
      const fov = lerp(base.fov, hp ? hp.fov : 50, s);
      const out = { yaw, pitch, dist, fov, target: { x: lerp(base.target.x, tt.x, s), y: lerp(base.target.y, tt.y, s), z: lerp(base.target.z, tt.z, s) } };
      // the horizon camera's view settings at the blended tilt (fog, far cells and grass reach the low view needs)
      if (horizonPose) out.hpose = { ...horizonPose({ yaw: yaw * R2D, pitch: pitch * R2D, dist, lite }, { lite }), yaw, pitch, dist, fov };
      return out;
    },
  };
}

// Horizon camera (wave 5b, PLAN.md item 4, approved by Scott 2026-11-24; brief and stills: D:\LQOnline\wave5\camera\BRIEF.md). An OPTION:
// today's fixed north-up camera stays the default and is untouched when this is off.
//
//   const cam = createHorizonCam({ touch })    plain state { mode: 'horizon', yaw, pitch, dist } that main.js puts on view.cam
//   cam.orbit(dxPx, dyPx)   cam.zoomBy(steps)  cam.reset()
//   horizonPose(cam, { lite })  -> { yaw, pitch, dist, lift, side, fov, fogFar, farR, cullR, grassR, grassAhead, nearR, k, low }
//                                  (renderer3d.js reads it each frame; lite: a phone or Low quality, the shorter view)
//
// The camera orbits the hero: yaw 0 sits south of the hero looking north (today's view); a larger yaw turns the view
// clockwise on the map (yaw 90 looks east, from the hero's west side). Pitch is the angle down to the hero. A drag to
// the right turns the view right, a drag down lifts the camera to look down more.
// Distance runs from today's far view (22 m) down to over the shoulder (3.2 m); as it closes in, the look point rises
// from the waist to the head, steps a little to the right of the hero, and the lens widens, so the close view looks past
// the hero's shoulder at what is ahead. A low pitch shows the horizon, so the fog and the far plane are pushed back
// and far cells show their cheap far version (zone3d.js farR). Two tiers, from the brief (120/240/220 and 80/160/140)
// tuned by measurement on 2026-11-24 (D:\LQOnline\wave5\camera\BRIEF.md, "Frame budget"): the full-detail reach and
// the body reach cost frame time, the fog end hardly does, so
//   desktop High: full detail to 100 m, far version to 240 m, fog ends at 220 m at the lowest tilt, bodies to 50 m
//   phones and Low quality (lite): full detail to 56 m, far version to 100 m, fog ends at 100 m, bodies to 30 m, and
//   the tilt stops 10 degrees above level, so the view never asks for the whole horizon
// The sim moves in 8 directions, so W walks along the nearest of them to the camera's facing: up to 22.5 degrees off
// (a sim change, any direction, is Scott's call; horizon_input.js camRelMove).
// Nothing here touches the sim: movement keys are turned into world directions in the input layer (horizon_input.js).

const D2R = Math.PI / 180;
export const H_DIST = [3.2, 22];       // m: over the shoulder .. today's far view
export const H_PITCH = [3, 68];        // degrees down to the hero (desktop High)
export const H_PITCH_LITE = 10;        // phones and Low quality: the lowest tilt
export const H_TIER = {                // m: full detail (cullR), far version (farR), fog end (fogFar) at the lowest tilt
  high: { cullR: 100, farR: 240, fogFar: 220, actorR: 50 },
  lite: { cullR: 56, farR: 100, fogFar: 100, actorR: 30 },
};
export const H_START = { yaw: 0, pitch: 34, dist: 14 };

export function createHorizonCam({ touch = false, lite = touch } = {}) {
  const cam = {
    mode: 'horizon', touch, lite, minPitch: lite ? H_PITCH_LITE : H_PITCH[0], ...H_START,
    /** a drag of (dx, dy) device-independent px: 1 px = 0.35 degrees (desktop), 0.5 (phone, a thumb moves less) */
    orbit(dx, dy) {
      const k = touch ? 0.5 : 0.35;
      cam.yaw = (((cam.yaw + dx * k) % 360) + 360) % 360;
      cam.pitch = clamp(cam.pitch + dy * k, cam.minPitch, H_PITCH[1]);
    },
    /** steps > 0 zooms in: each step is 12% of the distance */
    zoomBy(steps) { cam.dist = clamp(cam.dist * Math.pow(0.88, steps), H_DIST[0], H_DIST[1]); },
    reset() { Object.assign(cam, H_START); },
  };
  return cam;
}

/** Everything the renderer needs this frame. k: 0 at today's far view, 1 over the shoulder. low: 0..1 how far below
 *  today's 40 degrees the pitch is (drives the fog and draw distance). */
export function horizonPose(cam, { lite = !!cam.lite } = {}) {
  const dist = clamp(cam.dist, H_DIST[0], H_DIST[1]);
  const k = 1 - (dist - H_DIST[0]) / (H_DIST[1] - H_DIST[0]);
  const ks = k * k * (3 - 2 * k);
  const p0 = lite ? H_PITCH_LITE : H_PITCH[0];
  const pitchDeg = clamp(cam.pitch, p0, H_PITCH[1]);
  const low = clamp((42 - pitchDeg) / (42 - p0), 0, 1);
  const T = lite ? H_TIER.lite : H_TIER.high;
  return {
    k: +k.toFixed(3), low: +low.toFixed(3),
    yaw: cam.yaw * D2R,
    pitch: pitchDeg * D2R,
    dist,
    lift: 0.75 * ks,                    // look point: waist (0.9 m) at the far view, head height (1.65 m) at the shoulder
    side: 0.8 * ks,                     // m to the camera's right at the shoulder (the hero sits a little left of centre)
    fov: 30 + 22 * ks,                  // today's 30 degree lens at the far view, 52 at the shoulder
    fogFar: low > 0 ? 70 + (T.fogFar - 70) * low : 0,
    farR: low > 0.2 ? T.farR : 0,
    cullR: 80 + (T.cullR - 80) * low,
    // the ground kit's grass: a wider ring, centred ahead of the hero the way the camera looks, so the near-mid ground
    // the low view now shows is not bare (two instanced draw calls either way; ground_kit.js kit.view)
    actorR: 32 + (T.actorR - 32) * low,  // m: bodies (heroes, NPCs, foes) built and animated round the focus (today ~32)
    grassR: 36 + (lite ? 0 : 12) * low,
    grassAhead: 14 * low,
    nearR: clamp(0.6 * dist, 2.2, 6.5),  // m: scenery this close to the lens fades out (zone3d.js SEE.uNearR); the hero is never patched
    lite,
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Horizon camera (wave 5b PROTOTYPE, PLAN.md item 4; brief and stills: D:\LQOnline\wave5\camera\BRIEF.md). An OPTION:
// today's fixed north-up camera stays the default and is untouched when this is off.
//
//   const cam = createHorizonCam({ touch })    plain state { mode: 'horizon', yaw, pitch, dist } that main.js puts on view.cam
//   cam.orbit(dxPx, dyPx)   cam.zoomBy(steps)  cam.reset()
//   horizonPose(cam)  -> { yaw, pitch, dist, lift, side, fov, fogFar, farR, cullR, k }   (renderer3d.js reads it each frame)
//
// The camera orbits the hero: yaw 0 sits south of the hero looking north (today's view); a larger yaw turns the view
// clockwise on the map (yaw 90 looks east, from the hero's west side). Pitch is the angle down to the hero. A drag to
// the right turns the view right, a drag down lifts the camera to look down more.
// Distance runs from today's far view (22 m) down to over the shoulder (3.2 m); as it closes in, the look point rises
// from the waist to the head, steps a little to the right of the hero, and the lens widens, so the close view looks past
// the hero's shoulder at what is ahead. A low pitch shows the horizon, so the fog and the far plane are pushed back
// (the same numbers the flight camera uses) and far cells show their cheap far version (zone3d.js farR).
// Nothing here touches the sim: movement keys are turned into world directions in the input layer (horizon_input.js).

const D2R = Math.PI / 180;
export const H_DIST = [3.2, 22];       // m: over the shoulder .. today's far view
export const H_PITCH = [3, 68];        // degrees down to the hero
export const H_START = { yaw: 0, pitch: 34, dist: 14 };

export function createHorizonCam({ touch = false } = {}) {
  const cam = {
    mode: 'horizon', touch, ...H_START,
    /** a drag of (dx, dy) device-independent px: 1 px = 0.35 degrees (desktop), 0.5 (phone, a thumb moves less) */
    orbit(dx, dy) {
      const k = touch ? 0.5 : 0.35;
      cam.yaw = (((cam.yaw + dx * k) % 360) + 360) % 360;
      cam.pitch = clamp(cam.pitch + dy * k, H_PITCH[0], H_PITCH[1]);
    },
    /** steps > 0 zooms in: each step is 12% of the distance */
    zoomBy(steps) { cam.dist = clamp(cam.dist * Math.pow(0.88, steps), H_DIST[0], H_DIST[1]); },
    reset() { Object.assign(cam, H_START); },
  };
  return cam;
}

/** Everything the renderer needs this frame. k: 0 at today's far view, 1 over the shoulder. low: 0..1 how far below
 *  today's 40 degrees the pitch is (drives the fog and draw distance). */
export function horizonPose(cam) {
  const dist = clamp(cam.dist, H_DIST[0], H_DIST[1]);
  const k = 1 - (dist - H_DIST[0]) / (H_DIST[1] - H_DIST[0]);
  const ks = k * k * (3 - 2 * k);
  const pitchDeg = clamp(cam.pitch, H_PITCH[0], H_PITCH[1]);
  const low = clamp((42 - pitchDeg) / 34, 0, 1);
  return {
    k: +k.toFixed(3), low: +low.toFixed(3),
    yaw: cam.yaw * D2R,
    pitch: pitchDeg * D2R,
    dist,
    lift: 0.75 * ks,                    // look point: waist (0.9 m) at the far view, head height (1.65 m) at the shoulder
    side: 0.8 * ks,                     // m to the camera's right at the shoulder (the hero sits a little left of centre)
    fov: 30 + 22 * ks,                  // today's 30 degree lens at the far view, 52 at the shoulder
    fogFar: low > 0 ? 70 + 150 * low : 0,
    farR: low > 0.2 ? 240 : 0,
    cullR: 80 + 40 * low,
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

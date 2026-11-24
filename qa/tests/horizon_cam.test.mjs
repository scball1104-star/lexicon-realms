// Horizon camera (wave 5b): camera-relative keys, the pose curve, and that it stays off by default.
import { assert, eq } from './_helpers.mjs';
import { camRelMove } from '../../src/input/horizon_input.js';
import { createHorizonCam, horizonPose, H_DIST, H_PITCH, H_PITCH_LITE, H_TIER } from '../../src/render3d/horizon_cam.js';
import { createInput } from '../../src/input/input.js';
import { DEFAULT_OPTIONS } from '../../src/ui/save.js';

const fakeTarget = () => ({ addEventListener() {} });

export const tests = [
  {
    name: 'horizon camera: W walks the way the camera looks, snapped to the sim\'s 8 directions',
    fn() {
      eq(camRelMove(0, -1, 0).join(), '0,-1', 'yaw 0 is today: W is north');
      eq(camRelMove(0, -1, 90).join(), '1,0', 'yaw 90 looks east: W is east');
      eq(camRelMove(0, -1, 180).join(), '0,1', 'yaw 180: W is south');
      eq(camRelMove(1, 0, 90).join(), '0,1', 'yaw 90: D (right) is south');
      eq(camRelMove(0, -1, 45).join(), '1,-1', 'yaw 45: W is north-east');
      eq(camRelMove(0, -1, 30).join(), '1,-1', 'yaw 30 snaps to north-east');
      eq(camRelMove(0, -1, 20).join(), '0,-1', 'yaw 20 snaps to north');
      eq(camRelMove(0, 0, 77).join(), '0,0');
      for (let y = 0; y < 360; y += 7) for (const [dx, dy] of [[0, -1], [1, 1], [-1, 0]]) {
        const [a, b] = camRelMove(dx, dy, y);
        assert([a, b].every((v) => v === -1 || v === 0 || v === 1) && (a || b), `yaw ${y}: ${a},${b}`);
      }
    },
  },
  {
    name: 'horizon camera: input turns held keys only while a transform is set (default path unchanged)',
    fn() {
      const inp = createInput(fakeTarget(), fakeTarget());
      const snap = { tick: 1, entities: [{ id: 1, x: 100, y: 100, dir: 'down', zone: 'z' }] };
      inp.press('KeyW');
      eq(JSON.stringify(inp.poll({ snap, playerId: 1 })), '[{"t":"move","dx":0,"dy":-1}]', 'no transform: today');
      inp.release('KeyW'); inp.poll({ snap, playerId: 1 });
      inp.setMoveTransform((dx, dy) => camRelMove(dx, dy, 90));
      inp.press('KeyW');
      eq(JSON.stringify(inp.poll({ snap, playerId: 1 })), '[{"t":"move","dx":1,"dy":0}]', 'yaw 90');
      inp.release('KeyW'); inp.poll({ snap, playerId: 1 });
      inp.setMoveTransform(null);
      inp.press('KeyW');
      eq(JSON.stringify(inp.poll({ snap, playerId: 1 })), '[{"t":"move","dx":0,"dy":-1}]', 'cleared');
    },
  },
  {
    name: 'horizon camera: zoom runs from today\'s far view to the shoulder, pitch is clamped, fog pushed back only when low',
    fn() {
      const c = createHorizonCam();
      for (let i = 0; i < 60; i++) c.zoomBy(1);
      eq(c.dist, H_DIST[0], 'closest');
      for (let i = 0; i < 60; i++) c.zoomBy(-1);
      eq(c.dist, H_DIST[1], 'furthest');
      c.orbit(0, 9999); eq(c.pitch, H_PITCH[1]); c.orbit(0, -9999); eq(c.pitch, H_PITCH[0]);
      c.orbit(-100, 0); assert(c.yaw >= 0 && c.yaw < 360, 'yaw wraps');
      const far = horizonPose({ yaw: 0, pitch: 45, dist: 22 });
      eq(far.k, 0); eq(far.fov, 30, 'today\'s lens at the far view'); eq(far.fogFar, 0, 'no long view at a steep pitch');
      const sh = horizonPose({ yaw: 0, pitch: 6, dist: 3.2 });
      eq(sh.k, 1); assert(sh.fogFar >= 200 && sh.farR > 0, 'long view at a low pitch');
    },
  },
  {
    name: 'horizon camera: draw distance tiers (desktop 100/240/220 m, phone and Low 56/100/100 m, phone tilt stops at 10 degrees)',
    fn() {
      const hi = horizonPose({ yaw: 0, pitch: 0, dist: 8 });
      eq(hi.cullR, H_TIER.high.cullR); eq(hi.farR, H_TIER.high.farR); eq(hi.fogFar, H_TIER.high.fogFar);
      eq([hi.cullR, hi.farR, hi.fogFar, hi.actorR].join(), '100,240,220,50');
      const lo = horizonPose({ yaw: 0, pitch: 0, dist: 8 }, { lite: true });
      eq([lo.cullR, lo.farR, lo.fogFar, lo.actorR].join(), '56,100,100,30');
      eq(Math.round(lo.pitch * 180 / Math.PI), H_PITCH_LITE, 'the pose never goes below the phone stop');
      const ph = createHorizonCam({ touch: true });
      ph.orbit(0, -9999); eq(ph.pitch, H_PITCH_LITE, 'a phone drag stops at 10 degrees');
      const steep = horizonPose({ yaw: 0, pitch: 45, dist: 8 }, { lite: true });
      eq(steep.cullR, 80); eq(steep.farR, 0, 'a steep view keeps the short reach');
      assert(hi.grassR > 36 && hi.grassAhead > 0, 'desktop low view: a wider grass ring ahead');
      eq(steep.grassR, 36);
    },
  },
  {
    name: 'horizon camera: off by default (Options keep today\'s fixed camera)',
    fn() { eq(DEFAULT_OPTIONS.cam, 'fixed'); },
  },
];

// Wave 5 Track A (sky, light, weather): the light rig per time of day, the weather mapping, the quality tiers, and that
// the 'off' tier (?q3d=low, ?sky=off) builds no sky object at all, so Low quality keeps today's look exactly.
import { assert, eq } from './_helpers.mjs';
import * as THREE from '../../src/vendor/three/three.module.min.js';
import { lightRig, rigPhase, sunDir, moonDir, weatherState, flashAt, skyTier } from '../../src/render3d/sky_rig.js';
import { createSkyKit } from '../../src/render3d/sky_kit.js';

const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const warmth = (c) => c[0] - c[2];

function fakeFrame(kit, scene, o = {}) {
  const hemi = new THREE.HemisphereLight('#c8d0ff', '#3a2e22', 1.0), sun = new THREE.DirectionalLight('#fff2dc', 2.0);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 74); camera.position.set(10, 13, 25);
  const st = kit.frame({ f: 0.5, sky: { lamps: 0, lum: 1 }, view: {}, zone: { id: 'world' }, area: null, now: 12, camera, focus: new THREE.Vector3(10, 0, 10), hemi, sun, dev: {}, ...o });
  return { st, hemi, sun };
}

export const tests = [
  {
    name: 'sky rig: morning, noon, golden hour and night each have their own light',
    fn() {
      eq(rigPhase(0.29), 'morning'); eq(rigPhase(0.5), 'noon'); eq(rigPhase(0.71), 'golden'); eq(rigPhase(0.92), 'night'); eq(rigPhase(0.05), 'night');
      const m = lightRig(0.29), n = lightRig(0.5), g = lightRig(0.71), z = lightRig(0.92);
      assert(n.day > 0.99 && z.day === 0, 'full day at noon, none at night');
      assert(lum(n.zenith) > lum(z.zenith) * 3, 'the noon sky is far brighter than the night sky');
      assert(warmth(g.sun) > warmth(n.sun) + 0.1, 'the golden hour sun is warmer than noon');
      assert(warmth(g.horizon) > warmth(n.horizon), 'and so is its horizon');
      assert(warmth(m.horizon) > warmth(n.horizon), 'the morning horizon is warm too');
      assert(g.golden > 0.9 && n.golden === 0, 'golden weight peaks at golden hour');
      assert(z.stars > 0.9 && n.stars === 0, 'stars only at night');
      assert(warmth(z.sun) < 0, 'night light is the cool moon');
      for (let f = 0; f < 1; f += 0.01) { const r = lightRig(f); for (const c of [r.zenith, r.horizon, r.sun]) for (const v of c) assert(v >= 0 && v <= 1, `colour in range at ${f}`); }
    },
  },
  {
    name: 'sky rig: the sun rises in the east, is high at noon, sets in the west; the moon sits high',
    fn() {
      const r = sunDir(0.27), n = sunDir(0.5), s = sunDir(0.73);
      assert(r[0] > 0.8 && r[1] < 0.2, 'east and low after dawn');
      assert(n[1] > 0.85, 'high at noon');
      assert(s[0] < -0.8 && s[1] < 0.2, 'west and low before dusk');
      for (const v of [r, n, s, moonDir()]) assert(Math.abs(Math.hypot(...v) - 1) < 1e-9, 'unit vectors');
      assert(moonDir()[1] > 0.8, 'moon high');
    },
  },
  {
    name: 'weather: view.weather maps to rain, storm, mist and a clear sky; the moor keeps a heavier cover',
    fn() {
      const c = weatherState(null, { id: 'world' }, null);
      eq(c.kind, 'clear'); eq(c.rain, 0); eq(c.sunK, 1);
      const r = weatherState('rain', null, null);
      eq(r.kind, 'rain'); eq(r.rain, 1); eq(r.storm, 0); assert(r.sunK < 0.8 && r.fogK < 1 && r.cover > c.cover, 'rain dims the sun and pulls the fog in');
      const s = weatherState('storm', null, null);
      eq(s.storm, 1); eq(s.rain, 1); assert(s.sunK < r.sunK && s.cover > r.cover, 'a storm is darker than rain');
      const m = weatherState('mist', null, null);
      eq(m.rain, 0); assert(m.fogK < r.fogK, 'mist pulls the fog in furthest');
      eq(weatherState('fog', null, null).kind, 'mist');
      eq(weatherState('leaves', null, null).kind, 'clear', 'leaves and pollen are 2D particles');
      eq(weatherState(null, null, { id: 'moor' }).kind, 'cloudy', 'the moor area is cloudy when clear');
      eq(weatherState('rain', null, { id: 'moor' }).kind, 'rain', 'view.weather wins over the area');
      eq(weatherState(null, { id: 'x', weather: 'rain' }, null).kind, 'rain', 'zone.weather when no view weather');
      const o = weatherState({ rain: 0.5 }, null, null);
      eq(o.kind, 'rain'); eq(o.rain, 0.5);
    },
  },
  {
    name: 'weather: lightning only in a storm, deterministic per time, a few strikes a minute',
    fn() {
      let strikes = 0, last = 0;
      for (let t = 0; t < 120; t += 0.02) { const v = flashAt(t, 1); assert(v >= 0 && v <= 1, 'in range'); if (v > 0.5 && last <= 0.5) strikes++; last = v; eq(flashAt(t, 0), 0, 'no storm, no flash'); }
      assert(strikes >= 6 && strikes <= 60, `strikes in two minutes: ${strikes}`);
      eq(flashAt(37.31, 1), flashAt(37.31, 1), 'same time, same flash (pinned clock stills repeat)');
    },
  },
  {
    name: 'quality: ?q3d=low and ?sky=off are off, phones lite, desktop full, ?sky overrides',
    fn() {
      eq(skyTier({ q3d: 'low' }), 'off');
      eq(skyTier({ q3d: 'low', touchLow: true }), 'off');
      eq(skyTier({ sky: 'off' }), 'off');
      eq(skyTier({ touchLow: true }), 'lite');
      eq(skyTier({}), 'full');
      eq(skyTier({ q3d: 'high' }), 'full');
      eq(skyTier({ q3d: 'low', sky: 'full' }), 'full', 'drivers may force the sky on');
    },
  },
  {
    name: 'quality off: no sky objects in the scene; lite has a dome but no rain or hills; full has all three',
    fn() {
      const s0 = new THREE.Scene(); const n0 = s0.children.length;
      eq(createSkyKit(THREE, s0, { tier: 'off' }), null);
      eq(s0.children.length, n0, 'nothing added');
      const sl = new THREE.Scene(); sl.fog = new THREE.Fog('#9fb4cc', 30, 70); sl.background = new THREE.Color('#9fb4cc');
      const kl = createSkyKit(THREE, sl, { tier: 'lite' });
      eq(sl.children.map((o) => o.name).sort().join(','), 'sky:dome');
      const lf = fakeFrame(kl, sl, { view: { weather: 'rain' } });
      eq(lf.st.tier, 'lite'); eq(lf.st.rain, 1, 'the weather still darkens the light on phones');
      const sf = new THREE.Scene(); sf.fog = new THREE.Fog('#9fb4cc', 30, 70); sf.background = new THREE.Color('#9fb4cc');
      const kf = createSkyKit(THREE, sf, { tier: 'full', rainCount: 50 });
      eq(sf.children.map((o) => o.name).sort().join(','), 'sky:dome,sky:hills,sky:rain');
      for (const o of sf.children) eq(o.castShadow, false, 'sky objects cast no shadow');
    },
  },
  {
    name: 'sky kit frame: hidden underground and at Effects low; rain shows only in rain; the fog colour is the horizon',
    fn() {
      const sc = new THREE.Scene(); sc.fog = new THREE.Fog('#9fb4cc', 30, 70); sc.background = new THREE.Color('#9fb4cc');
      const k = createSkyKit(THREE, sc, { tier: 'full', rainCount: 50 });
      const byName = (n) => sc.children.find((o) => o.name === n);
      fakeFrame(k, sc);
      assert(byName('sky:dome').visible && byName('sky:hills').visible, 'outdoors: dome and hills');
      eq(byName('sky:rain').visible, false, 'no rain on a clear day');
      fakeFrame(k, sc, { view: { weather: 'rain' } });
      eq(byName('sky:rain').visible, true, 'rain');
      assert(sc.fog.color.equals(sc.background), 'fog and background share the horizon colour');
      const fogC = sc.fog.color.clone(); sc.fog.color.set('#050406'); sc.background.set('#050406');
      eq(fakeFrame(k, sc, { under: true }).st, null);
      assert(sc.children.every((o) => !o.visible), 'underground: nothing shows');
      eq(sc.fog.color.getHexString(), '050406', 'underground fog untouched');
      fakeFrame(k, sc, { view: { fx: 'low' } });
      assert(sc.children.every((o) => !o.visible), 'Effects low: nothing shows');
      assert(!fogC.equals(sc.fog.color), 'and the fog is left as applySky set it');
      const st = fakeFrame(k, sc, { view: { weather: 'storm' }, dev: { skyFlash: 1 } });
      eq(st.st.flash, 1); assert(st.hemi.intensity > 1.5, 'a flash lights the scene');
    },
  },
];

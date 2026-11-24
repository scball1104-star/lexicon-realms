// 3D renderer (three.js r170, vendored in src/vendor/three/). Same contract as the 2D renderer (src/render/renderer.js,
// docs/CONTRACTS.md section 9), so src/main.js picks one by the URL flag ?r=3d.
//
//   const r = createRenderer3D(canvas, assets, { zones, abilities, items })   throws when WebGL is not available
//   r.draw(prevSnap, snap, alpha, view)   r.feed(events)   r.drawHud(fn)   r.pick(devX, devY)   r.devToWorld(dx, dy)
//   r.worldToHud(wx, wy)   r.anchorOf(id)   r.layout   r.setPlayer(id)   r.loading   r.dev
//
// How it sits on the page: a WebGL canvas is inserted under the game canvas (#game). The game canvas keeps its 2D
// context and now holds only the floating combat numbers, nameplates and the HUD (drawn by src/ui exactly as with the
// 2D renderer, through the same layout), so input, the HUD and every driver keep working unchanged.
//
// Camera: the approved action-RPG angle (mockups3d_hero still 3): 40 degrees down, following from the south, at three
// zoom distances (view.zoom 1, 1.5, 2: 20, 13.3, 10 m; phones 10% further). In a town (zone kind 'town', or in the one
// world the area under the focus with regions[].kind 'town') it looks down steeper (57 degrees) from 1.3 times as
// far, so the narrow lanes between houses stay in sight; crossing a zone join or the town's edge eases between the two
// over about half a second (real time). It stays north-up, so screen up is world
// north (W walks up the screen as in 2D and on the minimap) and a point h px "above" a 2D anchor maps to the same screen
// spot as a point h px north on the ground: anchorOf() returns that h, measured each frame by projection. Picking,
// devToWorld and worldToHud all go through the live camera, so they follow any angle.
//
// Horizon camera (wave 5b, approved 2026-11-24, an option; view.cam, horizon_cam.js): free orbit and zoom to the shoulder, with
// the fog, far plane and draw distance pushed back at a low pitch. Off (view.cam null) everything above is unchanged.
//
// Cutaway: static scenery between the camera and the hero, and between the camera and the hero's target, fades to
// about 25% (zone3d.js SEE). On top of that a building whose roof or upper walls cover the hero, the target or an NPC
// with a quest mark on screen fades its whole roof and upper walls out (smoothly, the same dither), while its lower
// walls stay to show what blocks the way. Bodies outside the view frustum are hidden and not animated (draw calls, CPU).
// Zones next to the shown one are built in the background in small time slices and their shaders compiled before
// they are needed, so walking into a zone does not stall.
//
// Quality: touch devices (or ?q3d=low, or view.fx 'low' for the post effects) drop shadows, bloom and the grade pass,
// cap point lights at 2 (desktop 6), skip grass and flowers, and render at most 1.5 device px per css px.
// Sky (wave 5, sky_kit.js / sky_rig.js): desktop gets the sky dome, light rig, 3D rain, storms and far hills; phones the
// dome and light rig only; ?q3d=low, ?sky=off or view.fx 'low' keep today's flat sky exactly. Underground has no sky.
// Assets load in the background with a progress line on the HUD layer; a load failure or a lost GL context falls back
// to the 2D renderer with a console warning.
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';
import { layoutFor } from '../render/camera.js';
import { dayFraction, skyAt } from '../render/daycycle.js';
import { createFx } from '../render/fx.js';
import { numCeil } from '../render/feel_numbers.js';   // wave 6 combat feel: numbers stop under the toast line
import { isTouchDevice } from '../input/touch.js';
import { BitmapFont } from '../core/font.js';
import { createLoader, WINDOW_LIT } from './loader.js';
import { buildZone, BLD_CUT, flushBuildingFade, LAMP_GLASS, SEE, setBuildingFade, tickWater } from './zone3d.js';
import { tickRealm3d, makeVehicle } from './realm3d.js';   // wave 3: lava glow, tide water, ride vehicles
import { createActors } from './actors.js';
import { createCreature } from './creatures.js';
import { createFx3d } from './fx3d.js';
import { regionInfo } from '../data/maps/compose.js';
import { zoneBase } from '../data/maps/copies.js';
import { CUT } from './dungeon3d.js';
import { makeBird, tickBird } from './bird.js';   // big world: the Lantern Kite
import { createRealms2Fx3 } from './realms2_3d.js';   // wave 3 realms2: lantern cones, fog banks, the sandstorm
import { isPlaceZone, doorMouths } from '../render/dungeon_plan.js';
import { createSkyKit } from './sky_kit.js';     // wave 5 Track A: sky dome, light rig, 3D weather, far hills
import { skyTier } from './sky_rig.js';
import { horizonPose, H_PITCH, H_PITCH_LITE } from './horizon_cam.js';   // wave 5b: the optional horizon camera (view.cam)
import { createTurntable } from './turntable.js';   // wave 6: the creation screen's 3D hero (view.stage)   // wave 5b: the optional horizon camera (view.cam)
import { createTalkCam } from './talk_cam.js';   // wave 6 quest scenes: the talk camera (view.talk)
import { bossFrame } from './boss_cam.js';   // wave 6: the boss intro push-in (view.bossCam, src/ui/boss_card.js)
import { tickGround } from './ground_kit.js';   // wave 5 ground kit: the grass wind clock
import { groundY, setGroundY } from './ground_plan.js';   // the shown zone's visible ground height (gentle hills)

const PX = 16;
const PITCH = THREE.MathUtils.degToRad(40);
const FOV = 30;
const DIST = 20;              // camera distance at zoom 1 (m); zoom 1.5 -> 13.3, zoom 2 -> 10
const PHONE_DIST = 1.1;       // phones sit a little further out (the screen is short)
const TOWN_PITCH = THREE.MathUtils.degToRad(57);   // towns: steeper and further out (narrow lanes, roofs)
const TOWN_DIST = 1.3;
const CAM_EASE = 5;           // 1/s: the field <-> town camera blend across a zone join
const BLD_EASE = 9;           // 1/s: a building's roof fading out or back in

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vig: { value: 1.0 }, desat: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig; uniform float desat; uniform vec3 tint; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.299,0.587,0.114));
      c = mix(c, c * vec3(0.88,0.9,1.12) + vec3(0.006,0.008,0.02), 1.0 - smoothstep(0.0, 0.42, l));
      c = mix(c, c * vec3(1.07,1.0,0.88), smoothstep(0.42, 1.0, l));
      c = mix(c, vec3(l), desat) * tint;
      c = (c - 0.5) * 1.05 + 0.5;
      vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * vig;
      gl_FragColor = vec4(max(c, 0.0), 1.0); }`,
};
const ZONE_MOOD = { moor: { desat: 0.25, tint: [0.92, 0.96, 1.06], fog: 0.75 } };
const NO_MOOD = { desat: 0, tint: [1, 1, 1], fog: 1 };
const MOOD_EASE = 1.2;        // 1/s: the moor's grey mood fades in and out over a couple of seconds as you cross its edge
// Dungeons and caves (zone kind 'dungeon' | 'cave', 2026-11-22). A party's copy is the zone id 'barrow#12': scenes are
// built and kept per place ('barrow'), so the copy reuses the one built while the hero walked up to the door.
const PREBUILD_R = 45;        // m: a place behind a door on the world is built in the background once the hero is this near
// Underground: no sky, near-black fog close round the hero, a faint cool fill, the fires make the light (applySky)
const UNDER = {
  dungeon: { hemi: '#6a7896', ground: '#2a1e14', hemiK: 0.62, fog: '#050406', near: 1, far: 19, grade: [1.04, 0.98, 0.92], desat: 0.08, vig: 1.35 },
  cave: { hemi: '#8a9a96', ground: '#3a2a1a', hemiK: 1.0, fog: '#040506', near: 1, far: 18, grade: [1.0, 1.0, 0.95], desat: 0.12, vig: 1.4 },
};
const WARM_BUDGET = 90;       // ms: a warm-up frame behind the loading card aims at about this (never near the 250 ms gate)
// Big world (piece 1, 2026-11-22): an outdoor zone of its own behind a pass (the Rootbound) is built in the background
// once the hero is this near the pass, from the spot the pass lands on (zone3d.js builds a big zone near that spot first)
const PASS_PREBUILD_R = 60;
// a cavern (zone.cavern: the Rootbound under the Great Willow): no sun or sky, a cool dark fog with a long reach, the
// lamps always lit (applySky)
const CAVERN = { hemi: '#a8b8e0', ground: '#4a3c2c', hemiK: 1.7, env: 0.14, fog: '#121826', near: 6, far: 56, grade: [0.98, 1.0, 1.06], desat: 0.05, vig: 1.0 };

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export function createRenderer3D(canvas, assets, opts = {}) {
  if (!webglAvailable()) throw new Error('WebGL is not available');
  const { zones, abilities = null, items = null } = opts;
  const q = new URLSearchParams(location.search);
  const touchDev = isTouchDevice(window, q);
  const low = q.get('q3d') === 'low' || (q.get('q3d') !== 'high' && touchDev);
  const quality = { low, shadows: !low, bloom: !low, maxLights: low ? 2 : 6, grass: !low, maxScale: low ? 1.5 : 2, ground: !low && q.get('ground') !== 'off' };   // ground: the wave 5 ground kit (ground_kit.js)

  // ---- canvases: WebGL under, the game canvas (2D: numbers, nameplates, HUD) over it
  const gl = document.createElement('canvas');
  gl.id = 'game3d';
  gl.style.cssText = 'position:fixed;left:0;top:0;display:block;pointer-events:none;';
  canvas.parentNode.insertBefore(gl, canvas);
  const ctx = canvas.getContext('2d');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: !low, powerPreference: 'high-performance' });
  } catch (e) { gl.remove(); throw e; }
  renderer.setPixelRatio(1);
  renderer.info.autoReset = false;   // one count per frame across the post passes
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  { const g = renderer.getContext(); const ext = g.getExtension('WEBGL_debug_renderer_info'); renderer.userData = { gpu: ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown' }; }

  const scene = new THREE.Scene();
  const r2fx = createRealms2Fx3(scene);
  scene.background = new THREE.Color('#141a2e');
  scene.fog = new THREE.Fog('#141a2e', 30, 70);
  {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.25;
    pm.dispose();
  }
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 140);
  const hemi = new THREE.HemisphereLight('#c8d0ff', '#3a2e22', 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2dc', 2.0);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  { const c = sun.shadow.camera; c.left = c.bottom = -18; c.right = c.top = 18; c.near = 1; c.far = 80; }
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);
  const skyKit = createSkyKit(THREE, scene, { tier: skyTier({ q3d: q.get('q3d'), sky: q.get('sky'), touchLow: touchDev && q.get('q3d') !== 'high' }) });
  // the target ring: a pulsing ring at the target's feet, coloured by faction (as in 2D)
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ff5a3c', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40).rotateX(-Math.PI / 2), ringMat);
  targetRing.renderOrder = 2; targetRing.visible = false; scene.add(targetRing);
  const RING_COL = { hostile: '#ff5a3c', friendly: '#ffd75a', player: '#8fe07a', neutral: '#ffd75a' };
  const pool = [];
  for (let i = 0; i < quality.maxLights; i++) { const l = new THREE.PointLight('#ffb35c', 0, 10, 1.6); scene.add(l); pool.push(l); }

  // ---- post
  let composer = null, bloom = null, grade = null;
  function setupPost(w, h) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(1); composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.45, 0.45, 0.85);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
  }

  // ---- content
  const L = createLoader('assets3d/');
  // Shader precompile. A program depends on where it draws: with the bloom composer the scene draws into a render target
  // (linear output, no tone mapping), on screen it does not. Compiling with no target set made the screen variant, so
  // the first real draw of every new material still linked its program (the prototype's 0.8 to 2 s first dungeon frame
  // was mostly this): compile against the composer's target when the composer is in use.
  function precompile(o) {
    if (!renderer.compileAsync) return Promise.resolve();
    const rt = renderer.getRenderTarget();
    if (quality.bloom && composer) renderer.setRenderTarget(composer.readBuffer);
    let p;
    try { p = renderer.compileAsync(o, camera, scene); } finally { renderer.setRenderTarget(rt); }
    return p;
  }
  const actors = createActors(scene, L, { items, quality, compile: (o) => precompile(o) });
  // effects: the FX kit (fx3d.js); who/mats let it pick a hero's blow and tint a struck body (body.mats)
  const feelOn = q.get('feel') !== '0';   // combat feel pass (wave 6): ?feel=0 keeps the look from before it
  const fx3 = createFx3d(scene, { abilities, low, feel: feelOn, who: (id) => { const a = actors.get(id); return a && a.e ? { kind: a.kind, cls: a.e.cls, height: a.height } : null; }, mats: (id) => { const a = actors.get(id); return a ? a.mats : null; } });
  const font = assets.has && assets.has('font') ? new BitmapFont(assets.json('font'), assets.img('font'), { id: 'r3d' }) : null;
  const fontFrom = (j, im) => (j && im ? new BitmapFont(j, im, { id: 'num' }) : null);
  let numFont = null;
  const fx2 = createFx({
    abilities,
    sheet: () => null,
    numFont: () => numFont || (numFont = assets.has('font_num') ? fontFrom(assets.json('font_num'), assets.img('font_num')) : null),
    bigFont: () => null,
    // combat feel: a number waits for its 3D bolt, own and hits-on-you numbers larger, phones smaller (feel_numbers.js)
    feel: feelOn, hold: (s) => fx3.pending(s.dst, s.src), phone: () => !!(layout && layout.touch), ceil: () => (layout ? numCeil(layout) : 0),
  });

  const state = { preload: null, ready: false, failed: null, zones: new Map(), building: new Map(), buildK: new Map(), zoneId: null, playerId: null };
  const keyOf = (id) => (id == null ? id : zoneBase(id));
  const isPlace = (id) => id != null && isPlaceZone(zones[id]);
  // a build slice waits for the next frame (the game keeps drawing between slices)
  const idle = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
  // everything in assets3d/manifest.json is used: load it all in the background (one progress number)
  state.preload = fetch('assets3d/manifest.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`manifest ${r.status}`))))
    .then((man) => Promise.all([L.clips(), ...man.files.filter((f) => /\.(gltf|glb)$/.test(f) && !/^ual\//.test(f)).map((f) => L.gltf(f))]))
    .then(() => { state.ready = true; })
    .catch((e) => { state.failed = e; });

  function zoneFor(zid, near = null) {
    const id = keyOf(zid);
    if (state.zones.has(id)) return state.zones.get(id);
    if (!state.building.has(id) && zones[id] && state.ready) {
      state.buildK.set(id, 0);
      const t0 = performance.now();
      // near: where the hero lands (a big zone builds out from there and is shown once that part is done; the rest
      // follows in the background, z.more)
      const p = buildZone(L, zones[id], { tilesDb: assets.json('tiles'), quality, yieldFn: idle, near, progress: (k) => state.buildK.set(id, k) })
        // compile its shaders before it is shown (parallel compile where the browser has it), so the first frame in
        // the new zone does not stall on program links
        .then((z) => precompile(z.group).catch(() => null).then(() => z))
        .then((z) => {
          state.zones.set(id, z); state.building.delete(id); state.buildK.delete(id);
          (dev.builds || (dev.builds = [])).push({ id, nearMs: +(performance.now() - t0).toFixed(0), parts: z.stats ? z.stats.partMs.slice() : null });
          // the rest of a big zone: compile any new shaders once it is in, so a far corner does not stall on first sight
          if (z.more) z.more.then(() => { const b = (dev.builds || []).find((o) => o.id === id && o.allMs == null); if (b) { b.allMs = +(performance.now() - t0).toFixed(0); b.parts = z.stats.partMs.slice(); } return precompile(z.group); }).catch(() => null);
          // keep the shown zone and its neighbours (the next walk), drop the rest
          const cur = keyOf(state.zoneId);
          const keep = new Set([cur, id, ...((zones[cur] || {}).joins || []).map((j) => j.to)]);
          for (const [k, v] of state.zones) if (!keep.has(k)) { v.dispose(); state.zones.delete(k); }
        })
        .catch((e) => { state.building.delete(id); state.buildK.delete(id); state.failed = e; });
      state.building.set(id, p);
    }
    return null;
  }
  let shown = null;
  let turntable = null;          // wave 6: made the first time a stage is asked for (turntable.js)
  let flightView = null;          // big world: the flight camera's reach while the hero rides the Lantern Kite (M3)

  // ---- 2D layers
  const canvas2d = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
  let [hud, hctx] = canvas2d(640, 360);
  let [over, octx] = canvas2d(640, 360);
  let layout = layoutFor(canvas.width, canvas.height, 1, { fill: true });
  const dev = { clock: null, stats: { ms: 0, avg: 0, n: 0 }, sky: null, quality, info: null, camDist: null };   // camDist: drivers' close-up
  let lastNow = null;
  let camK = null, camT = 0;     // camera blend: 0 field, 1 town (eased in real time)
  const talkCam = createTalkCam();
  let talkHide = false;          // quest scenes: no door labels over a talk
  let bossLabelsOff = false;     // wave 6: the door labels hide while the boss intro card is up
  const focus = new THREE.Vector3();
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sph = new THREE.Sphere();
  /** Is a body (feet at p, h m tall) in or near the view? A margin keeps edge bodies and their shadows in. */
  const inView = (p, h) => { sph.center.set(p.x, p.y + h * 0.5, p.z); sph.radius = Math.max(1.0, h * 0.7) + 1.5; return frustum.intersectsSphere(sph); };
  const anchors = new Map();     // id -> { x, y, h (2D-equivalent px), dev: { fx, fy, hx, hy, hw } }
  let fallback = null;
  Object.defineProperty(dev, 'scene', { value: scene, enumerable: false });   // drivers and debugging only
  Object.defineProperty(dev, 'see', { value: SEE, enumerable: false });
  Object.defineProperty(dev, 'camera', { value: camera, enumerable: false });   // drivers: what the view frustum holds
  Object.defineProperty(dev, 'programs', { get: () => (renderer.info.programs || []).map((pr) => pr.name), enumerable: false });   // drivers: shaders linked so far
  Object.defineProperty(dev, 'zonesBuilt', { get: () => [...state.zones.keys()], enumerable: false });
  Object.defineProperty(dev, 'building', { get: () => state.building.size, enumerable: false });
  /** Drivers: each building of the shown zone, its footprint (m), its fade now and the box its drawn pieces really fill
   *  (from the merged geometry), so a check can see that no roof or wall reaches past the footprint. */
  dev.buildingBoxes = () => {
    if (!shown || !shown.buildings) return [];
    const box = new Map(shown.buildings.map((bb) => [bb.id, { id: bb.id, foot: [bb.x0, bb.z0, bb.x0 + bb.w, bb.z0 + bb.d], top: +bb.top.toFixed(2), k: +(bb.k || 0).toFixed(2), min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }]));
    shown.group.traverse((m) => {
      const g = m.isMesh && !m.isInstancedMesh && m.geometry, a = g && g.attributes.lrBld;
      if (!a) return;
      const ps = g.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const o = box.get(Math.round(a.getX(i)));
        if (!o) continue;
        const v = [ps.getX(i), ps.getY(i), ps.getZ(i)];
        for (let j = 0; j < 3; j++) { o.min[j] = Math.min(o.min[j], v[j]); o.max[j] = Math.max(o.max[j], v[j]); }
      }
    });
    return [...box.values()].map((o) => ({ ...o, min: o.min.map((v) => +v.toFixed(2)), max: o.max.map((v) => +v.toFixed(2)) }));
  };
  /** Drivers: what a body looks like now ({ kind, built, sig, spec }) or null. */
  dev.actor = (id) => { const a = actors.get(id); if (!a) return null; const b = a.body; return { kind: a.kind, built: !!b, sig: a.sig, building: a.building, type: b && b.type, spec: b && b.spec ? { parts: b.spec.parts, helm: b.spec.helm, cape: b.spec.cape, main: b.spec.main, off: b.spec.off } : null, anim: b && b.anim ? b.anim.name : null, mount: a.mount ? { kind: a.mount.kind, on: !!a.mountOn, gait: a.mount.gait, seatY: +a.mount.seatY.toFixed(2), bodyY: b && b.ch ? +b.ch.o.position.y.toFixed(2) : null } : null }; };   // mount: mount3d.js

  /** Drivers only: a row of foe bodies in front of the hero, for a look at every family at game zoom.
   *  list: [{ template, sprite, elite, rank }]; pose: 'idle' | 'walk' | 'attack' (the attack replays every 1.6 s). */
  let lineup = null;
  dev.lineup = async (list, { pose = 'idle', gap = 2.0, dz = -2.2 } = {}) => {
    dev.lineupClear();
    const g = new THREE.Group(); g.name = 'lineup'; scene.add(g);
    const bodies = await Promise.all(list.map((m) => createCreature(L, m.template, m.sprite || m.template, { elite: m.elite, rank: m.rank })));
    bodies.forEach((b, i) => { b.o.position.set(focus.x + (i - (bodies.length - 1) / 2) * gap, 0, focus.z + dz); g.add(b.o); });
    lineup = { g, bodies, pose };
    return bodies.map((b) => b.family);
  };
  dev.lineupClear = () => { if (lineup) { scene.remove(lineup.g); lineup = null; } };
  function animateLineup(now, dt) {
    if (!lineup) return;
    for (const b of lineup.bodies) {
      const st = { t: now, moving: lineup.pose === 'walk', speed: 2, cast: false, attackT: lineup.pose === 'attack' ? Math.floor(now / 1.6) * 1.6 : null, hurtT: null, deadT: null };
      b.update(dt, st);
    }
  }

  function useFallback(why) {
    if (fallback) return;
    console.warn('Lexicon Realms: the 3D renderer stopped, using the 2D renderer.', why);
    gl.style.display = 'none';
    import('../render/renderer.js').then((m) => {
      fallback = m.createRenderer(canvas, assets, opts);
      if (state.playerId != null) fallback.setPlayer(state.playerId);
    });
  }
  gl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); useFallback('WebGL context lost'); });

  // ---- projection helpers
  const v3 = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function toDev(p) { v3.copy(p).project(camera); return [(v3.x * 0.5 + 0.5) * canvas.width, (1 - (v3.y * 0.5 + 0.5)) * canvas.height, v3.z]; }
  function devToGround(dx, dy) {
    ndc.set((dx / canvas.width) * 2 - 1, -((dy / canvas.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(ground, hit)) return null;
    // horizon camera: the visible ground (the ground kit's gentle hills, groundY) instead of the flat y = 0 plane. The
    // hills are smooth and low, so a few steps of "meet the plane at the height found last time" settle in a few cm
    if (hpose) for (let i = 0; i < 4; i++) { ground.constant = -groundY(hit.x, hit.z); const ok = ray.ray.intersectPlane(ground, hit); ground.constant = 0; if (!ok) return null; }
    return hit;
  }
  function devToWorld(dx, dy) {
    const h = devToGround(dx, dy);
    if (hpose) return h && Math.hypot(h.x - focus.x, h.z - focus.z) < H_REACH ? [h.x * PX, h.z * PX] : null;   // sky or far: no walk
    return h ? [h.x * PX, h.z * PX] : [0, 0];
  }
  // horizon camera: "h px above a body" (worldToHud(x, y - h), the 2D convention every HUD caller uses) is
  // not "h px north" once the camera turns, so a point straight above a body's anchor goes up the body in 3D instead;
  // a point behind the camera goes off screen
  let hpose = null;
  /** drivers: the ground point under a device px (x, y, z m) and the visible ground height there */
  dev.groundPoint = (dx, dy) => { const h = devToGround(dx, dy); return h ? [h.x, h.y, h.z, groundY(h.x, h.z)] : null; };
  const H_REACH = 60;
  function horizonToHud(wx, wy) {
    let p = null;
    for (const an of anchors.values()) {
      if (an.x !== wx || wy > an.y || an.y - wy > 4 * an.h + 40) continue;
      p = new THREE.Vector3(an.x / PX, (an.a.root.position.y || 0) + ((an.y - wy) / Math.max(4, an.h)) * an.a.height, an.y / PX); break;
    }
    const [dx, dy, dz] = toDev(p || new THREE.Vector3(wx / PX, 0, wy / PX));
    if (dz > 1) return [-9999, -9999];
    return [Math.round((dx - layout.ox) / layout.base), Math.round((dy - layout.oy) / layout.base)];
  }
  function worldToHud(wx, wy) {
    if (hpose) { const h = horizonToHud(wx, wy); if (h) return h; }
    const [dx, dy] = toDev(new THREE.Vector3(wx / PX, 0, wy / PX));
    return [Math.round((dx - layout.ox) / layout.base), Math.round((dy - layout.oy) / layout.base)];
  }

  // ---- sky and lights
  const C = (h) => new THREE.Color(h);
  const SKY_DAY = C('#9fb4cc'), SKY_NIGHT = C('#0e1424'), SUN_DAY = C('#fff1dc'), SUN_LOW = C('#ff9a5a'), MOON = C('#8fa2ff');
  // One world (2026-11-21): lighting and mood come from the area the camera looks at (zone.regions), or the zone itself
  // for a single zone. The mood is eased (moodK) so walking onto the moor greys the scene over a couple of seconds.
  let moodK = null;
  function applySky(snap, view, zone, target, area, rdt) {
    const sky = skyAt(dayFraction(snap, view));
    const lit = (area && area.lighting) || (zone && zone.lighting);
    if (lit && lit.dark) { const d = lit.dark; sky.amb = sky.amb.map((v) => v * (1 - d)); sky.lum *= 1 - d; sky.lamps = Math.max(sky.lamps, d); }
    dev.sky = sky;
    const f = dayFraction(snap, view);
    const dayK = Math.max(0, Math.min(1, (sky.lum - 0.45) / 0.45));
    const amb = new THREE.Color(sky.amb[0], sky.amb[1], sky.amb[2]);
    hemi.color.copy(C('#d0d8ff')).multiply(amb);
    hemi.groundColor.copy(C('#4a3a2a')).multiply(amb);
    hemi.intensity = 0.2 + 1.1 * sky.lum * sky.lum;
    scene.environmentIntensity = 0.05 + 0.22 * sky.lum;
    // the sun crosses from east (morning) to west (evening); at night a cool moon from high in the south-west
    const day = f > 0.22 && f < 0.82;
    const a = ((f - 0.25) / 0.5) * Math.PI;              // 0 at sunrise, PI at sunset
    const elev = day ? Math.max(0.25, Math.sin(Math.max(0.05, Math.min(Math.PI - 0.05, a)))) : 0.8;
    const az = day ? Math.cos(a) : -0.5;
    sun.position.set(target.x + az * 20, target.y + elev * 24 + 4, target.z + 10);
    sun.target.position.copy(target);
    if (day) { sun.color.copy(SUN_LOW).lerp(SUN_DAY, Math.min(1, elev * 1.6)).multiply(new THREE.Color(1, 0.95 + 0.05 * dayK, 0.9 + 0.1 * dayK)); sun.intensity = 0.25 + 2.3 * dayK; }
    else { sun.color.copy(MOON); sun.intensity = 0.28; }
    // shadow camera follows the focus, snapped to its texels (no shimmer)
    if (quality.shadows) {
      const s = 36 / 2048;
      sun.target.position.set(Math.round(target.x / s) * s, 0, Math.round(target.z / s) * s);
      sun.position.x = sun.target.position.x + az * 20; sun.position.z = sun.target.position.z + 10;
    }
    const want = ZONE_MOOD[(area && area.id) || (zone && zone.id)] ? 1 : 0;
    moodK = moodK == null ? want : moodK + (want - moodK) * (1 - Math.exp(-rdt * MOOD_EASE));
    if (Math.abs(want - moodK) < 0.002) moodK = want;
    const M = ZONE_MOOD.moor, mk = moodK;
    const mood = mk > 0 ? { desat: M.desat * mk, tint: M.tint.map((v, i) => NO_MOOD.tint[i] + (v - NO_MOOD.tint[i]) * mk), fog: 1 + (M.fog - 1) * mk } : null;
    const sk = SKY_NIGHT.clone().lerp(SKY_DAY, Math.min(1, sky.lum * 1.1)).multiply(new THREE.Color(1, 0.97 + 0.03 * dayK, 1));
    if (mood) sk.lerp(C('#8090a8'), 0.25 * sky.lum * mk);
    scene.background.copy(sk); scene.fog.color.copy(sk);
    const dist = camera.position.distanceTo(target);
    scene.fog.near = dist + 8 - 6 * mk; scene.fog.far = dist + (48 - 18 * mk) * (mood ? mood.fog : 1);
    // nothing past the fog's far end can show (it is fog colour, the same as the sky behind it), so the far plane stops
    // there: frustum culling then drops the world's far chunks instead of drawing them into fog
    const far = scene.fog.far + 4;
    if (Math.abs(camera.far - far) > 0.5) { camera.far = far; camera.updateProjectionMatrix(); }
    WINDOW_LIT.emissiveIntensity = 0.15 + 1.5 * sky.lamps;
    LAMP_GLASS.emissiveIntensity = 0.3 + 2.4 * sky.lamps;
    if (shown && shown.halo) shown.halo.opacity = 0.9 * sky.lamps;
    if (grade) {
      grade.uniforms.desat.value = (mood ? mood.desat : 0) + sky.desat * 0.6;
      const t = mood ? mood.tint : [1, 1, 1];
      grade.uniforms.tint.value.set(t[0], t[1], t[2]);
      grade.uniforms.vig.value = 0.75 + 0.45 * sky.lamps;
    }
    // underground (a dungeon or cave): no sky and no sun to speak of. Near-black fog close round the hero, a faint
    // cool fill, the fires always lit (zone lamps) and a stronger light on the hero; the far plane comes in with the fog
    const U = zone && isPlaceZone(zone) ? UNDER[zone.kind] : zone && zone.cavern ? CAVERN : zone && zone.atmos ? zone.atmos : null;   // atmos: the Hollow's foggy night
    if (U) {
      sky.lamps = 1; sky.lum = 0;
      hemi.color.set(U.hemi); hemi.groundColor.set(U.ground); hemi.intensity = U.hemiK;
      scene.environmentIntensity = U.env || 0.04;
      sun.color.set('#8090b0'); sun.intensity = 0;
      scene.background.set(U.fog); scene.fog.color.set(U.fog);
      scene.fog.near = dist + U.near; scene.fog.far = dist + U.far;
      const df = scene.fog.far + 4;
      if (Math.abs(camera.far - df) > 0.5) { camera.far = df; camera.updateProjectionMatrix(); }
      WINDOW_LIT.emissiveIntensity = 1.6; LAMP_GLASS.emissiveIntensity = 2.6;
      if (shown && shown.halo) shown.halo.opacity = 0.9;
      if (grade) { grade.uniforms.desat.value = U.desat; grade.uniforms.tint.value.set(...U.grade); grade.uniforms.vig.value = U.vig; }
    }
    // a long view (flight, drivers' dev.fogFar): the fog and the far plane pushed back
    const ff = dev.fogFar || (flightView && flightView.fogFar) || (hpose && !U && hpose.fogFar);
    if (ff) {
      scene.fog.near = Math.max(scene.fog.near, ff * 0.4); scene.fog.far = ff;
      if (Math.abs(camera.far - (ff + 4)) > 0.5) { camera.far = ff + 4; camera.updateProjectionMatrix(); }
    }
    return sky;
  }
  function assignLights(sky, target, playerPos) {
    const cand = [];
    if (shown) for (const l of shown.lamps) cand.push({ pos: l.pos, color: l.color, k: l.k * sky.lamps * (l.fire ? 1.2 + Math.sin(performance.now() / 90) * 0.1 : 1) });
    for (const l of actors.lights()) cand.push({ pos: l.pos, color: l.color, k: l.k * (l.lantern ? 0.35 + 0.65 * sky.lamps : 0.6 + 0.4 * sky.lamps) });
    for (const l of fx3.lights) cand.push(l);
    const under = isPlace(state.zoneId) || !!(zones[state.zoneId] && zones[state.zoneId].cavern);      // below ground the hero carries more light
    if (playerPos && sky.lamps > 0.05) cand.push({ pos: playerPos.clone().setY(2.6), color: under ? '#ffd2a0' : '#ffe2c0', k: (under ? 0.95 : 0.55) * sky.lamps });
    for (const c of cand) { const d2 = c.pos.distanceToSquared(target); c.score = c.k / (1 + d2 / 60); }
    cand.sort((a, b) => b.score - a.score);
    for (let i = 0; i < pool.length; i++) {
      const l = pool[i], c = cand[i];
      if (!c || c.k < 0.03) { l.intensity = 0; continue; }
      l.position.copy(c.pos); l.color.set(c.color); l.intensity = 7 * c.k; l.distance = 9 + 3 * Math.min(1, c.k);
    }
  }

  function sizeGl() {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.min(1, quality.maxScale / dpr);
    const w = Math.max(2, Math.round(canvas.width * k)), h = Math.max(2, Math.round(canvas.height * k));
    gl.style.width = canvas.style.width || '100vw'; gl.style.height = canvas.style.height || '100vh';
    if (gl.width !== w || gl.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (quality.bloom) { if (!composer) setupPost(w, h); else { composer.setSize(w, h); bloom.setSize(w / 2, h / 2); } }
      fx3.setScale(h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))));
    }
  }

  // ---- big world: the Lantern Kite under every flying hero, and the flight camera for the one this view follows
  // The sim moves a flying hero along the route (src/sim/travel.js); actors.js lifts the body FLY_H m and seats it; here
  // the bird is hung under it, faces the way it flies and beats its wings. The camera then sits behind and above the
  // bird looking the way it flies (flightView: lower pitch, further out, the fog pushed back and the far-detail pass on).
  const kites = new Map();          // entity id -> bird group
  function rideKites(snap, view, now, rdt) {
    const flying = new Set();
    for (const e of snap.entities) {
      if (e.kind !== 'player' || !e.flight || e.zone !== view.zone) continue;
      const a = actors.get(e.id);
      if (!a) continue;
      flying.add(e.id);
      let b = kites.get(e.id);
      // a ride (wave 3): the ore cart or the ferry on the ground under the hero, no bird
      if (e.flight.ride) {
        if (b && b.userData.vehicle !== e.flight.ride) { if (b.parent) b.parent.remove(b); b = null; }
        if (!b) { b = makeVehicle(e.flight.ride); kites.set(e.id, b); }
        if (b.parent !== a.root) a.root.add(b);
        b.position.set(0, e.flight.ride === 'ferry' ? -0.25 : -0.3, 0); b.visible = a.root.visible;
        continue;
      }
      if (b && b.userData.vehicle) { if (b.parent) b.parent.remove(b); b = null; kites.delete(e.id); }
      if (!b) { b = makeBird(); kites.set(e.id, b); precompile(b).catch(() => null); }
      if (b.parent !== a.root) a.root.add(b);
      const k = Math.max(0, Math.min(1, e.flight.up));
      tickBird(b, now, k);
      b.position.set(0, -2.05 + (b.userData.bob || 0), 0.05);    // the saddle (about 2.1 m up the bird) under the seated hero
      b.visible = a.root.visible;
    }
    for (const [id, b] of kites) if (!flying.has(id)) { if (b.parent) b.parent.remove(b); kites.delete(id); }
    // the flight camera for the followed hero
    const me = snap.entities.find((e) => e.id === view.followId);
    if (me && me.flight && me.zone === view.zone) {
      const a = actors.get(me.id);
      const yaw = a ? a.yaw : 0;
      const want = [-Math.sin(yaw), -Math.cos(yaw)];               // behind the bird (actors face +z at yaw 0)
      const up = Math.max(0, Math.min(1, me.flight.up)), k = up * up * (3 - 2 * up);
      if (!flightView) flightView = { back: [0, 1], k: 0 };
      const ease = 1 - Math.exp(-rdt * 1.6);
      flightView.back = [flightView.back[0] + (want[0] - flightView.back[0]) * ease, flightView.back[1] + (want[1] - flightView.back[1]) * ease];
      const L = Math.hypot(...flightView.back) || 1; flightView.back = [flightView.back[0] / L, flightView.back[1] / L];
      Object.assign(flightView, { k, pitch: THREE.MathUtils.degToRad(40 - 14 * k), dist: 20 + 16 * k, fov: FOV + 12 * k, lift: 14 * k,
        fogFar: 70 + 150 * k, cullR: 80 + 10 * k, farR: k > 0.2 ? 240 : 0 });
    } else flightView = null;
    dev.flight = flightView ? { k: +flightView.k.toFixed(2), kites: kites.size } : (kites.size ? { k: 0, kites: kites.size } : null);
  }

  // ---- dungeons and caves: the swap behind the loading card, ground telegraphs, the labels over the doors
  // A zone change into or out of a place (the local hero's 'zone' event: src/ui/loading.js shows the card on that same
  // tick, before this draw) is not drawn until the new scene is built and warmed up: the first draw of a fresh scene
  // uploads its buffers and textures, which froze the prototype for 0.8 to 2 s on this PC's GPU. While the card covers
  // the screen, the new scene is drawn with a few more of its meshes switched on each frame (frustum culling off, so
  // each is uploaded once), each frame synced and timed, the batch grown or shrunk to stay near WARM_BUDGET ms. Leaving
  // back to a scene that has been drawn before is instant (no card, no warm-up).
  let trans = null;
  const q2 = new URLSearchParams(location.search);
  function warmStart(z) {
    const list = [];
    // a big zone (z.more: built near the hero first): only the cells the play camera can reach from the landing spot;
    // the rest uploads as it comes into view, a few at a time
    const near = (o) => {
      if (!z.more) return true;
      const p = o.parent && o.parent.name && o.parent.name.startsWith('cell:') ? o.parent.name.slice(5).split(',').map(Number) : null;
      return !p || Math.hypot((p[0] + 0.5) * 48 - focus.x, (p[1] + 0.5) * 48 - focus.z) < 100;
    };
    z.group.traverse((o) => { if ((o.isMesh || o.isPoints) && !(o.name && o.name.startsWith('far:')) && near(o)) list.push(o); });
    for (const o of list) { o.userData.lrFC = o.frustumCulled; o.frustumCulled = false; o.visible = false; }
    trans.warm = { list, i: 0, batch: 4, final: false, finalFrame: false, z };
  }
  function warmBefore() {
    const w = trans.warm;
    const n = Math.min(w.list.length, w.i + w.batch);
    w.from = w.i;
    for (; w.i < n; w.i++) w.list[w.i].visible = true;
    if (w.i >= w.list.length && !w.final) { for (const o of w.list) o.frustumCulled = o.userData.lrFC !== false; w.final = true; w.finalFrame = true; }
    trans.k = 0.6 + 0.4 * (w.i / Math.max(1, w.list.length));
  }
  const px1 = new Uint8Array(4);
  function warmAfter(t0) {
    const g = renderer.getContext();
    g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px1);     // wait for the GPU: the time below is the real cost
    const ms = performance.now() - t0, w = trans.warm;
    trans.frames++; trans.maxMs = Math.max(trans.maxMs, ms);
    (dev.warmLog || (dev.warmLog = [])).push({ ms: +ms.toFixed(1), n: w.i - w.from, final: w.final, what: w.list.slice(w.from, w.i).map((o) => `${o.type}:${(o.material && o.material.name) || ''}:${o.geometry && o.geometry.attributes.position ? o.geometry.attributes.position.count : 0}`).slice(0, 6) });
    if (dev.warmLog.length > 60) dev.warmLog.shift();
    if (ms < WARM_BUDGET * 0.5) w.batch = Math.min(256, w.batch * 2); else if (ms > WARM_BUDGET * 1.4) w.batch = Math.max(1, Math.floor(w.batch / 2));
    // done once a whole normal frame (everything on, culling back) came in under budget
    if (w.final && !w.finalFrame && ms < WARM_BUDGET * 1.6) {
      w.z.warmed = true;
      dev.zoneChange = { ...dev.zoneChange, warmMs: +(performance.now() - trans.t0).toFixed(1), warmFrames: trans.frames, warmMaxMs: +trans.maxMs.toFixed(1), meshes: w.list.length, lastWarmMs: +ms.toFixed(1), doneAt: performance.now() };
      trans = null;
    } else w.finalFrame = false;
  }
  const tgMat = new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.2, depthWrite: false });
  const tgFill = new THREE.MeshBasicMaterial({ color: '#ff3a20', transparent: true, opacity: 0.34, depthWrite: false });
  const tgEdge = new THREE.MeshBasicMaterial({ color: '#ff5030', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  const tgLine = new THREE.LineBasicMaterial({ color: '#ff5030', transparent: true, opacity: 0.95, depthWrite: false });
  const tgGeo = {
    circle: [new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.RingGeometry(0.94, 1.0, 64).rotateX(-Math.PI / 2)],
    line: [new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5))],
  };
  const coneGeo = new Map();
  const coneOf = (deg) => {
    const k = Math.round(deg);
    if (!coneGeo.has(k)) {
      // a wedge around local +z (the facing), as a circle sector laid flat
      const a = THREE.MathUtils.degToRad(k);
      const flat = (g) => g.rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
      coneGeo.set(k, [flat(new THREE.CircleGeometry(1, 32, -a / 2, a)), flat(new THREE.RingGeometry(0.94, 1, 40, 1, -a / 2, a))]);
    }
    return coneGeo.get(k);
  };
  const tgPool = [];
  function telegraphMesh(i) {
    if (!tgPool[i]) {
      const g = new THREE.Group();
      const d = new THREE.Mesh(tgGeo.circle[0], tgMat); g.add(d);
      const f = new THREE.Mesh(tgGeo.circle[0], tgFill); f.position.y = 0.005; g.add(f);
      const e = new THREE.Mesh(tgGeo.circle[1], tgEdge); e.position.y = 0.01; g.add(e);
      const l = new THREE.LineSegments(tgGeo.line[1], tgLine); l.position.y = 0.01; g.add(l);
      g.children.forEach((m) => { m.renderOrder = 2; }); g.userData = { d, f, e, l }; scene.add(g); tgPool[i] = g;
    }
    return tgPool[i];
  }
  /** Ground warnings for casts with a telegraph (the sim's cast + the ability's area): a red circle, cone or line that
   *  fills as the cast runs. 'ground' circles sit where the cast aimed (cast.at), 'self' on the caster, 'target' on the
   *  target; a cone or a line points from the caster toward its target. */
  function drawTelegraphs(snap) {
    let n = 0;
    const abl = abilities || {};
    for (const e of snap.entities) {
      if (!e.cast || e.dead || e.zone !== state.zoneId) continue;
      const ab = abl[e.cast.ability];
      if (!ab || !ab.telegraph || !ab.area) continue;
      const self = actors.at(e.id, 'feet');
      if (!self) continue;
      const tgt = e.cast.target != null ? actors.at(e.cast.target, 'feet') : null;
      let p = self;
      if (ab.area.at === 'target' && tgt) p = tgt;
      else if (ab.area.at === 'ground') p = e.cast.at ? new THREE.Vector3(e.cast.at.x / PX, 0, e.cast.at.y / PX) : (tgt || self);
      const k = Math.max(0, Math.min(1, (snap.tick - e.cast.startTick) / Math.max(1, e.cast.endTick - e.cast.startTick)));
      const g = telegraphMesh(n++); g.visible = true;
      const { d, f, e: edge, l } = g.userData;
      const R = (ab.area.radius || 32) / PX;
      const shape = ab.telegraph === 'cone' || ab.area.shape === 'cone' ? 'cone' : ab.telegraph === 'line' || ab.area.shape === 'line' ? 'line' : 'circle';
      const yaw = tgt && shape !== 'circle' ? Math.atan2(tgt.x - self.x, tgt.z - self.z) : 0;
      g.position.set(p.x, groundY(p.x, p.z) + 0.04, p.z); g.rotation.y = shape === 'circle' ? 0 : yaw;
      if (shape === 'line') {
        const wd = (ab.area.width || 16) / PX;
        d.geometry = tgGeo.line[0]; f.geometry = tgGeo.line[0];
        d.scale.set(wd, 1, R); f.scale.set(wd, 1, Math.max(0.02, k) * R); edge.visible = false; l.visible = true; l.scale.set(wd, 1, R);
      } else {
        const [fillG, ringG] = shape === 'cone' ? coneOf(ab.area.angle || 90) : tgGeo.circle;
        d.geometry = fillG; f.geometry = fillG; edge.geometry = ringG; edge.visible = true; l.visible = false;
        d.scale.setScalar(R); edge.scale.setScalar(R); f.scale.setScalar(Math.max(0.02, k) * R);
      }
    }
    for (let i = n; i < tgPool.length; i++) tgPool[i].visible = false;
    dev.telegraphs = n;
  }
  const labelCache = new Map();
  function labelText(text, color) {
    const k = text + color;
    if (!labelCache.has(k)) {
      const w = Math.max(8, font.measure(text) + 4), h = font.lineHeight + 4;
      const [c, g] = canvas2d(w, h);
      font.draw(g, text, 2, 2, { color, outline: '#0a0810' });
      labelCache.set(k, { c, w, h });
    }
    return labelCache.get(k);
  }
  /** "<name>" over "Dungeon, levels 10 to 12" above each door on the world within reach (HUD layer, under the HUD). */
  function drawDoorLabels() {
    const zone = zones[state.zoneId];
    if (!font || !zone || !zone.doors || !shown) return;
    for (const d of doorMouths(zone)) {
      const x = d.x + (d.w || 1) / 2, z = d.y + (d.face === 'n' ? (d.h || 1) : 0);
      if (Math.hypot(x - focus.x, z - focus.z) > 28) continue;
      const [dx, dy, dz] = toDev(v3.set(x, 3.1, z));
      if (dz > 1) continue;
      const hx = Math.round((dx - layout.ox) / layout.base), hy = Math.round((dy - layout.oy) / layout.base);
      if (hx < -80 || hy < -30 || hx > layout.hudW + 80 || hy > layout.hudH + 30) continue;
      const line2 = d.label || `${d.kind === 'cave' ? 'Cave' : 'Dungeon'}, levels ${d.levels[0]} to ${d.levels[1]}`;
      const t1 = labelText(d.name, 'gold'), t2 = labelText(line2, '#c8c0d8');
      const bw = Math.max(t1.w, t2.w) + 10, bh = t1.h + t2.h;
      const bx = Math.round(hx - bw / 2), by = Math.max(2, hy - bh);      // a door near the top edge keeps its label on screen
      hctx.fillStyle = 'rgba(14,10,22,0.72)'; hctx.fillRect(bx, by, bw, bh);
      hctx.fillStyle = '#c9a24c'; hctx.fillRect(bx, by, bw, 1); hctx.fillRect(bx, by + bh - 1, bw, 1);
      hctx.drawImage(t1.c, Math.round(hx - t1.w / 2), by + 1);
      hctx.drawImage(t2.c, Math.round(hx - t2.w / 2), by + t1.h - 1);
    }
  }

  function draw(prevSnap, snap, alpha, view) {
    if (fallback) return fallback.draw(prevSnap, snap, alpha, view);
    if (state.failed) { useFallback(state.failed); return; }
    const t0 = performance.now();
    layout = layoutFor(canvas.width, canvas.height, view.zoom || 1, { touch: !!view.touch, hud: view.hud || 'big', dpr: view.dpr || 1, inset: view.inset, fill: true });
    layout.worldOx = layout.wox; layout.worldOy = layout.woy;
    if (hud.width !== layout.hudW || hud.height !== layout.hudH) { [hud, hctx] = canvas2d(layout.hudW, layout.hudH); [over, octx] = canvas2d(layout.hudW, layout.hudH); }
    sizeGl();
    const now = dev.clock != null ? dev.clock : view.time || 0;
    const dt = lastNow == null ? 0 : Math.max(0, Math.min(0.1, now - lastNow));
    lastNow = now;
    if (view.followId != null) { state.playerId = view.followId; fx2.setPlayer(view.followId); }
    const zone = zones[view.zone];
    // into or out of a dungeon or cave: hold the swap behind the loading card until the new scene is built and warm
    // (big world, 2026-11-22: any zone change now, so a pass between two outdoor zones holds behind the card too)
    if (state.zoneId != null && keyOf(view.zone) !== keyOf(state.zoneId)) {
      const zt = state.zones.get(keyOf(view.zone));
      if (trans && trans.warm) for (const o of trans.warm.list) { o.visible = true; o.frustumCulled = o.userData.lrFC !== false; }
      trans = zt && zt.warmed ? null : { key: keyOf(view.zone), t0: performance.now(), k: 0, warm: null, frames: 0, maxMs: 0 };
      dev.zoneChange = { to: view.zone, from: state.zoneId, into: isPlace(view.zone), prebuilt: !!zt, warmedBefore: !!(zt && zt.warmed), t0: performance.now() };
    }
    if (trans && trans.key !== keyOf(view.zone)) {                  // went somewhere else meanwhile: undo a half warm-up
      if (trans.warm) for (const o of trans.warm.list) { o.visible = true; o.frustumCulled = o.userData.lrFC !== false; }
      trans = null;
    }
    const meE0 = view.followId != null ? snap.entities.find((e) => e.id === view.followId) : null;
    const z = zoneFor(view.zone, meE0 && meE0.zone === view.zone ? { x: Math.floor(meE0.x / PX), y: Math.floor(meE0.y / PX) } : null);
    if (trans && !z) {
      // still building (in time slices): the old frame stays on the WebGL canvas under the card; nothing new is drawn
      trans.k = 0.6 * (state.buildK.get(trans.key) || 0);
      state.zoneId = view.zone;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (trans && z && !trans.warm && dev.zoneChange && dev.zoneChange.buildMs == null) dev.zoneChange.buildMs = +(performance.now() - trans.t0).toFixed(1);
    if (z !== shown) {
      if (shown) { scene.remove(shown.group); for (const bb of shown.buildings || []) { bb.k = 0; setBuildingFade(bb.id, 0); } }
      shown = z;
      if (shown) scene.add(shown.group);
      setGroundY(shown && shown.groundY);   // bodies and ground marks stand on the ground kit's hills (flat when off)
      actors.clear(view.followId);     // the hero keeps its body across zones (no rebuild on the step through)
    }
    state.zoneId = view.zone;
    if (trans && shown && !trans.warm) warmStart(shown);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // wave 6: the creation screen or the mirror asks for its turntable (view.stage); the screen covers the world, so only it draws
    if (view.stage && view.stage.rect) { (turntable || (turntable = createTurntable(L, { items, quality, environment: scene.environment }))).render(renderer, view.stage, layout, gl, canvas, now); dev.turntable = turntable.dev; return; }
    if (!shown) {
      renderer.setClearColor('#0b0a12'); renderer.clear();
      return;
    }
    // camera: follow the player (or the zone's arrival point before a hero exists)
    const meE = view.followId != null ? snap.entities.find((e) => e.id === view.followId) : null;
    if (meE && meE.zone === view.zone) {
      const pe = prevSnap && prevSnap.entities.find((e) => e.id === view.followId);
      const k = pe && pe.zone === meE.zone ? alpha : 1;
      focus.set(((pe ? pe.x : meE.x) + (meE.x - (pe ? pe.x : meE.x)) * k) / PX, 0, ((pe ? pe.y : meE.y) + (meE.y - (pe ? pe.y : meE.y)) * k) / PX);
    } else if (zone) { const ar = zone.arrival || [zone.w / 2, zone.h / 2]; focus.set(ar[0] + 0.5, 0, ar[1] + 0.5); }
    const target = focus.clone().setY(0.9);
    const tnow = performance.now(), rdt = Math.min(0.1, Math.max(0, (tnow - camT) / 1000));
    camT = tnow;
    // the area under the camera's focus (one world: zone.regions; null in the wilds or in a single zone)
    const area = zone ? regionInfo(zone, Math.floor(focus.x), Math.floor(focus.z)) : null;
    dev.area = area ? area.id : null;
    const townWant = zone && (zone.kind === 'town' || (area && area.kind === 'town')) ? 1 : 0;
    if (camK == null) camK = townWant;
    else { camK += (townWant - camK) * (1 - Math.exp(-rdt * CAM_EASE)); if (Math.abs(townWant - camK) < 0.002) camK = townWant; }
    const ck = camK * camK * (3 - 2 * camK);
    const pitch = PITCH + (TOWN_PITCH - PITCH) * ck, distK = 1 + (TOWN_DIST - 1) * ck;
    dev.cam = { pitch: +THREE.MathUtils.radToDeg(pitch).toFixed(1), distK: +distK.toFixed(3) };
    let dist = dev.camDist || (DIST * distK * (layout.touch ? PHONE_DIST : 1)) / (view.zoom || 1);
    // big world: the flight camera (behind the bird, lower and further out, facing the way it flies) and the drivers'
    // long view (dev.camPitch / camDist / fov / camLift). Otherwise the approved north-up play camera, unchanged.
    let pitchC = pitch, bx = 0, bz = 1;
    const fv = flightView;
    if (fv) { pitchC = fv.pitch; dist = dev.camDist || fv.dist; bx = fv.back[0]; bz = fv.back[1]; target.y += fv.lift; }
    // wave 5b: the horizon camera (horizon_cam.js), an option (view.cam); never in flight or below ground
    // phones and Low quality (lite) get the shorter view and the tilt stop (horizon_cam.js H_TIER); the stop is written
    // back to the camera state so a drag cannot pull below it
    const hLite = quality.low || view.fx === 'low';
    if (view.cam && view.cam.mode === 'horizon' && view.cam.lite !== hLite) { view.cam.lite = hLite; view.cam.minPitch = hLite ? H_PITCH_LITE : H_PITCH[0]; view.cam.pitch = Math.max(view.cam.pitch, view.cam.minPitch); }
    hpose = view.cam && view.cam.mode === 'horizon' && !fv && !isPlace(view.zone) ? horizonPose(view.cam, { lite: hLite }) : null;
    dev.horizon = hpose ? { yaw: view.cam.yaw, pitch: view.cam.pitch, dist: +hpose.dist.toFixed(2), k: hpose.k, low: hpose.low, lite: hpose.lite, fogFar: +hpose.fogFar.toFixed(1), farR: hpose.farR, cullR: +hpose.cullR.toFixed(1), grassR: +hpose.grassR.toFixed(1), grass: shown && shown.kit ? shown.kit.stats || null : null } : null;
    if (hpose) {
      pitchC = hpose.pitch; dist = dev.camDist || hpose.dist; bx = -Math.sin(hpose.yaw); bz = Math.cos(hpose.yaw);
      target.y += hpose.lift + groundY(focus.x, focus.z); target.x += Math.cos(hpose.yaw) * hpose.side; target.z += Math.sin(hpose.yaw) * hpose.side;
    }
    // wave 6 quest scenes (talk_cam.js): view.talk eases the camera to the talk pose and back; never in flight
    const tcm = talkCam.frame(fv ? null : view.talk, rdt, { yaw: Math.atan2(-bx, bz), pitch: pitchC, dist, target, fov: hpose ? hpose.fov : FOV }, { place: isPlace(view.zone), lite: hLite || !!view.touch, groundY, horizonPose });
    if (tcm) { pitchC = tcm.pitch; dist = tcm.dist; bx = -Math.sin(tcm.yaw); bz = Math.cos(tcm.yaw); target.set(tcm.target.x, tcm.target.y, tcm.target.z); if (tcm.hpose) hpose = tcm.hpose; }
    talkHide = !!(view.talk && view.talk.hideLabels);
    if (dev.camPitch != null) pitchC = THREE.MathUtils.degToRad(dev.camPitch);
    if (dev.camLift != null) target.y += dev.camLift;
    const fov = dev.fov || (fv ? fv.fov : tcm ? tcm.fov : hpose ? hpose.fov : FOV);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // wave 6: the boss intro card's push-in (boss_cam.js); view.bossCam null: today's camera, and the door labels show
    bossLabelsOff = !!(view.bossCam && view.bossCam.k > 0);
    if (view.bossCam && !fv) { const bf = bossFrame(view.bossCam, { tx: target.x, ty: target.y, tz: target.z, pitch: pitchC, dist, bx, bz, fov, aspect: camera.aspect, gy: groundY }); target.set(bf.tx, bf.ty, bf.tz); pitchC = bf.pitch; dist = bf.dist; }
    const hz = dist * Math.cos(pitchC);
    camera.position.set(target.x + bx * hz, target.y + dist * Math.sin(pitchC), target.z + bz * hz);
    if (hpose) camera.position.y = Math.max(camera.position.y, groundY(camera.position.x, camera.position.z) + 0.35);   // never under a hill
    camera.lookAt(target);
    // the FX kit's gentle kick on the player's own big hits and crits (Options: Screen shake off turns it off)
    { const sh = view.shake === false ? 0 : fx3.screen.shake; if (sh > 0.01) { camera.position.x += Math.sin(now * 83) * sh * 0.25; camera.position.y += Math.cos(now * 71) * sh * 0.2; } }
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    // distance culling (the one world is far bigger than any view): only the 48 m cells within reach of the focus stay
    // in the scene walk. The camera far plane ends at the fog's far end, about 70 m from the camera and less from the
    // focus; 80 m keeps every cell that can show or throw a shadow into the view
    // big world: past that reach a cell may show its cheap far version instead (zone3d.js), out to farR when the view
    // reaches that far (dev.farR: drivers' long views; flight sets its own, below)
    const farR = dev.farR != null ? dev.farR : (flightView ? flightView.farR : hpose ? hpose.farR : 0);
    // (a warm-up behind the card draws everything it uploads: the whole small place, or a big zone's first part)
    const warmR = shown.more ? 170 : 1e6;
    if (shown.kit) shown.kit.view = hpose ? { r: hpose.grassR, dx: Math.sin(hpose.yaw) * hpose.grassAhead, dz: -Math.cos(hpose.yaw) * hpose.grassAhead } : null;   // grass ahead of the hero
    if (shown.cull) dev.cells = shown.cull(focus.x, focus.z, trans && trans.warm ? warmR : (dev.cullR || (flightView ? flightView.cullR : hpose ? hpose.cullR : 80)), farR);
    dev.far = shown.lastCull ? shown.lastCull.far : 0;
    fx3.lite = hLite;   // combat feel: Low quality and phones play the small spark size only
    // hit stop slows the drawn bodies only, never the sim (Options: "Screen shake and hit stop" Off turns it off)
    actors.sync(prevSnap, snap, alpha, view.zone, now, fx3.screen.hitstop > 0 && view.shake !== false ? dt * fx3.stopRate : dt, fx3, focus, hpose ? dev.actorR || hpose.actorR : (14 + 18 / (view.zoom || 1)) * distK, inView);
    const me = view.followId != null ? actors.get(view.followId) : null;
    rideKites(snap, view, now, rdt);
    // the zones next door are built in the background (one at a time) once the shown one is up, so a step through
    // a zone edge finds its neighbour ready. A dungeon or cave behind a door on the world only once the hero is near
    // that door (five small places nobody needs on the road); ?nopre=1 turns this off (drivers: the cold path)
    if (zone && !state.building.size && !trans && q2.get('nopre') !== '1') {
      for (const j of zone.joins || []) {
        if (!zones[j.to] || state.zones.has(keyOf(j.to))) continue;
        const dj = Math.hypot(j.x + (j.w || 1) / 2 - focus.x, j.y + (j.h || 1) / 2 - focus.z);
        if (isPlace(j.to) && !isPlace(view.zone) && dj > PREBUILD_R) continue;
        // an outdoor zone of its own behind a pass: only once the hero is near the pass, built out from where it lands
        if (!isPlace(j.to) && !isPlace(view.zone) && dj > PASS_PREBUILD_R) continue;
        zoneFor(j.to, { x: j.tx, y: j.ty }); break;
      }
    }
    // the wall cut (dungeon3d.js): walls south of the hero drop to a lip; shadows are not redrawn underground (no sun)
    const under = isPlace(view.zone);
    CUT.uCutOn.value = under ? 1 : 0;
    CUT.uCutZ.value = (me ? me.root.position.z : focus.z) + 0.35;
    renderer.shadowMap.autoUpdate = !under && !(zone && zone.cavern);
    const tgA = view.targetId != null && view.targetId !== view.followId ? actors.get(view.targetId) : null;
    SEE.uCam.value.copy(camera.position);
    SEE.uNearR.value = hpose ? hpose.nearR : 0;   // horizon camera: lamp posts, trunks and roof corners at the lens fade out
    SEE.uFocus.value.copy(me ? me.root.position : focus).setY(1.0); SEE.uSeeR.value = me ? 3.2 : 0;
    if (tgA && tgA.e && !tgA.e.dead && tgA.kind !== 'object') { SEE.uFocus2.value.copy(tgA.root.position).setY(Math.min(1.2, tgA.height * 0.55)); SEE.uSeeR2.value = 1.9; } else SEE.uSeeR2.value = 0;
    cutBuildings(snap, view, me, tgA, rdt);
    tickWater(now); tickGround(now);
    if (shown) tickRealm3d(shown.group, snap.tick, now);
    animateLineup(now, dt);
    renderer.info.reset();
    const sky = applySky(snap, view, zone, target, area, rdt);
    if (skyKit) dev.skyKit = skyKit.frame({ f: dayFraction(snap, view), sky, view, zone, area, now, camera, focus, hemi, sun, under: !!(zone && (isPlaceZone(zone) || zone.cavern || zone.atmos)), dev });
    dev.realms2 = r2fx.update(snap, view.zone, actors, camera, now, focus);
    const tg = view.targetId != null && view.targetId !== view.followId ? actors.get(view.targetId) : null;
    if (tg && tg.e && !tg.e.dead && tg.kind !== 'object') {
      targetRing.visible = true;
      targetRing.position.copy(tg.root.position).setY(groundY(tg.root.position.x, tg.root.position.z) + 0.04);
      const r = Math.max(0.8, Math.min(2.2, tg.height * 0.55));
      targetRing.scale.setScalar(r * (1 + 0.06 * Math.sin(now * 6)));
      ringMat.color.set(RING_COL[tg.e.faction] || RING_COL.neutral);
      ringMat.opacity = 0.75 + 0.25 * Math.sin(now * 6);
    } else targetRing.visible = false;
    const at = (id, w) => actors.at(id, w);
    fx3.update(dt, now, at, camera);
    assignLights(sky, target, me ? me.root.position : null);
    drawTelegraphs(snap);
    if (trans && trans.warm) warmBefore();
    const tr0 = performance.now();
    if (quality.bloom && composer && view.fx !== 'low') composer.render();
    else renderer.render(scene, camera);
    if (trans && trans.warm) warmAfter(tr0);
    else if (!shown.warmed) shown.warmed = true;          // a scene drawn whole once is warm (leaving back to it is instant)
    if (!trans && dev.zoneChange && dev.zoneChange.firstFrameAt == null) { dev.zoneChange.firstFrameAt = performance.now(); dev.zoneChange.firstFrameMs = +(performance.now() - dev.zoneChange.t0).toFixed(1); dev.zoneChange.firstDrawMs = +(performance.now() - t0).toFixed(1); }

    // anchors (2D-equivalent): feet px and the north-on-the-ground height that lands on the head
    anchors.clear();
    for (const a of actors.list()) {
      const p = a.root.position;
      const [fx, fy, fz] = toDev(p);
      const head = new THREE.Vector3(p.x, p.y + a.height, p.z);
      const [hx, hy] = toDev(head);
      const g = devToGround(hx, hy);
      // (horizon camera: the ground under the head says nothing once the camera turns or looks level; a fixed 1 m = 16 px)
      const h2 = hpose ? a.height * PX : g ? Math.max(4, (p.z - g.z) * PX) : 24;
      const [rx] = toDev(v3.set(p.x + 0.45, p.y, p.z));
      anchors.set(a.id, { x: Math.round(p.x * PX), y: Math.round(p.z * PX), h: Math.round(h2), dev: { fx, fy, hx, hy, hw: Math.max(10, Math.abs(rx - fx)), z: fz }, a });
    }
    fx2.update(now, (id) => { const an = anchors.get(id); return an ? { x: an.x, y: an.y, h: an.h + 12, hand: null } : null; });   // numbers start above the nameplate

    // overlay: nameplates for the target and foes on you, then the floating numbers (HUD px, crisp at every zoom)
    octx.clearRect(0, 0, layout.hudW, layout.hudH);
    drawPlates(snap, view);
    fx2.drawNumbers(octx, worldToHud, now);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(over, 0, 0, layout.hudW, layout.hudH, layout.ox, layout.oy, layout.hudW * layout.base, layout.hudH * layout.base);
    const ms = performance.now() - t0;
    const s = dev.stats; s.ms = ms; s.n++; s.avg += (ms - s.avg) / Math.min(s.n, 120);
    dev.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, actors: actors.list().length, programs: renderer.info.programs ? renderer.info.programs.length : null, geometries: renderer.info.memory.geometries, gpu: renderer.userData.gpu };
  }

  // ---- building cutaway: which buildings cover someone who must stay visible. A ray from the camera to a few points
  // on each kept body (feet, middle, head, and a little to each side, so standing beside a wall counts) is tested
  // against each building's box above the cut line.
  const cutRay = new THREE.Ray(), cutBox = new THREE.Box3(), cutHit = new THREE.Vector3(), cutP = new THREE.Vector3();
  /** Bodies that must never hide behind a roof: the hero, the target, NPCs with a quest mark. [{ p, h, pad }] */
  function keepVisible(snap, view, me, tgA) {
    const out = [];
    if (me && me.root) out.push({ p: me.root.position, h: me.height || 1.8, pad: 0.6 });
    if (tgA && tgA.root && tgA.e && !tgA.e.dead) out.push({ p: tgA.root.position, h: tgA.height || 1.7, pad: 0.4 });
    const h = snap.hud && view.followId != null ? snap.hud[view.followId] : null;
    if (h && h.npcMarkers) {
      for (const id of Object.keys(h.npcMarkers)) {
        const a = actors.get(Number(id));
        if (!a || !a.root || !a.root.visible) continue;
        v3.copy(a.root.position).project(camera);
        if (Math.abs(v3.x) > 1.05 || v3.y < -1.05 || v3.y > 1.3) continue;      // on screen only (a head may peek in at the top)
        out.push({ p: a.root.position, h: a.height || 1.7, pad: 0.3 });
      }
    }
    return out;
  }
  function covers(bb, k) {
    cutBox.min.set(bb.x0, BLD_CUT.lo, bb.z0); cutBox.max.set(bb.x0 + bb.w, bb.top, bb.z0 + bb.d);
    for (const dx of [0, -k.pad, k.pad]) {
      for (const y of [0.25, k.h * 0.55, k.h + 0.25]) {
        cutP.set(k.p.x + dx, y, k.p.z);
        cutRay.origin.copy(camera.position); cutRay.direction.copy(cutP).sub(camera.position);
        const L = cutRay.direction.length(); cutRay.direction.divideScalar(L);
        if (cutRay.intersectBox(cutBox, cutHit) && cutHit.distanceTo(camera.position) < L - 0.05) return true;
      }
    }
    return false;
  }
  function cutBuildings(snap, view, me, tgA, rdt) {
    const list = shown && shown.buildings;
    if (!list || !list.length) { flushBuildingFade(); return; }
    const keep = keepVisible(snap, view, me, tgA);
    const ease = 1 - Math.exp(-rdt * BLD_EASE);
    let n = 0;
    for (const bb of list) {
      let want = 0;
      for (const k of keep) {
        if (Math.abs(k.p.x - (bb.x0 + bb.w / 2)) > bb.w / 2 + 12 || Math.abs(k.p.z - (bb.z0 + bb.d / 2)) > bb.d / 2 + 12) continue;
        if (covers(bb, k)) { want = 1; break; }
      }
      bb.k = bb.k == null ? want : bb.k + (want - bb.k) * ease;
      if (Math.abs(want - bb.k) < 0.01) bb.k = want;
      setBuildingFade(bb.id, bb.k);
      if (bb.k > 0.5) n++;
    }
    dev.cut = n;
    flushBuildingFade();
  }

  function drawPlates(snap, view) {
    if (!font) return;
    const me = view.followId;
    for (const [id, an] of anchors) {
      const e = an.a.e;
      if (!e || e.dead || e.kind === 'object' || id === me) continue;
      const isTarget = id === view.targetId;
      const onMe = e.kind === 'mob' && (e.aggro === me || e.target === me);
      if (!isTarget && !onMe && e.kind !== 'player') continue;
      const [x, y] = worldToHud(an.x, an.y - an.h - 6);
      if (x < -40 || y < -20 || x > layout.hudW + 40 || y > layout.hudH + 20) continue;
      const col = e.faction === 'hostile' ? '#ff8a6a' : e.kind === 'player' ? '#8fe07a' : '#ffd75a';
      if (isTarget || e.kind === 'player') font.draw(octx, e.name || '', x, y - 9, { align: 'center', color: col, outline: '#14101e' });
      if (isTarget && e.rare) font.draw(octx, 'Rare', x, y - 18, { align: 'center', color: '#d4dce8', outline: '#14101e' });   // a rare named foe (src/data/rares.js)
      if (e.hpMax > 0 && (e.kind === 'mob' || e.kind === 'player')) {
        const w = 26, k = Math.max(0, Math.min(1, e.hp / e.hpMax));
        octx.fillStyle = '#14101e'; octx.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
        octx.fillStyle = e.faction === 'hostile' ? '#e06b39' : '#8fe07a'; octx.fillRect(x - w / 2, y, Math.round(w * k), 2);
      }
    }
  }

  function drawHud(fn) {
    if (fallback) return fallback.drawHud(fn);
    hctx.clearRect(0, 0, layout.hudW, layout.hudH);
    if (!trans && !talkHide && !bossLabelsOff) drawDoorLabels();   // hidden over a talk and under the boss intro card (wave 6)
    fn(hctx, layout);
    // loading line (over the title too, so the title never looks frozen while the 3D world loads)
    if (!state.ready || !shown) {
      const p = L.progress, k = p.total ? p.done / p.total : 0;
      const w = Math.min(220, layout.hudW - 40), x = Math.floor((layout.hudW - w) / 2), y = layout.hudH - 14;
      hctx.fillStyle = 'rgba(20,16,30,0.8)'; hctx.fillRect(x - 2, y - 11, w + 4, 16);
      hctx.fillStyle = '#4a4560'; hctx.fillRect(x, y + 1, w, 2);
      hctx.fillStyle = '#f9d77a'; hctx.fillRect(x, y + 1, Math.round(w * (state.ready ? 1 : k)), 2);
      if (font) font.draw(hctx, state.ready ? 'Building the 3D world...' : `Loading the 3D world ${Math.round(k * 100)}%`, x + w / 2, y - 9, { align: 'center', color: 'gray' });
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(hud, 0, 0, layout.hudW, layout.hudH, layout.ox, layout.oy, layout.hudW * layout.base, layout.hudH * layout.base);
  }

  function pick(devX, devY) {
    if (fallback) return fallback.pick(devX, devY);
    const pad = layout.touch ? 8 * (window.devicePixelRatio || 1) : 0;
    let best = null;
    for (const [id, an] of anchors) {
      const e = an.a.e;
      if (!e || (e.dead && e.kind === 'mob') || (an.a.body && an.a.body.type === 'object' && an.a.body.o.userData.ground)) continue;
      const d = an.dev;
      const top = Math.min(d.hy, d.fy) - pad, bot = d.fy + Math.max(6, d.hw * 0.3) + pad;
      if (devX < d.fx - d.hw - pad || devX > d.fx + d.hw + pad || devY < top || devY > bot) continue;
      if (!best || d.z < best.z) best = { id, z: d.z };
    }
    return best ? best.id : null;
  }

  const api = {
    draw, drawHud,
    feed(events) {
      if (fallback) return fallback.feed(events);
      const now = dev.clock != null ? dev.clock : lastNow || 0;
      fx2.feed(events, now);
      fx3.feed(events, now, state.playerId, (id, w) => actors.at(id, w));
    },
    setPlayer(id) { state.playerId = id; fx2.setPlayer(id); if (fallback) fallback.setPlayer(id); },
    get layout() { return fallback ? fallback.layout : layout; },
    get camera() { return fallback ? fallback.camera : { x: camera.position.x * PX, y: camera.position.z * PX }; },
    pick,
    devToWorld(dx, dy) { return fallback ? fallback.devToWorld(dx, dy) : devToWorld(dx, dy); },
    worldToHud(wx, wy) { return fallback ? fallback.worldToHud(wx, wy) : worldToHud(wx, wy); },
    anchorOf(id) { if (fallback) return fallback.anchorOf(id); const a = anchors.get(id); return a ? { x: a.x, y: a.y, h: a.h } : null; },
    /** 3D only (drivers): device px of an entity's body centre, or null. */
    entDev(id) { const a = anchors.get(id); return a ? [a.dev.fx, (a.dev.fy + a.dev.hy) / 2] : null; },
    dev,
    is3d: true,
    get stageOk() { return !fallback; },     // wave 6: the creation screen can show the 3D hero (not after a fall back to 2D)
    get ready() { return !fallback && state.ready && !trans && !!shown && shown === state.zones.get(keyOf(state.zoneId)); },
    get loading() { return fallback ? fallback.loading : (state.ready && shown ? 0 : 1); },
    /** The zone swap behind the loading card (src/ui/loading.js): { to, k: 0..1, ready }. */
    get zoneLoad() {
      if (fallback) return fallback.zoneLoad;
      if (trans) return { to: trans.key, k: trans.k, ready: false };
      const k = keyOf(state.zoneId);
      return { to: k, k: 1, ready: !!shown && shown === state.zones.get(k) };
    },
    /** Is this zone's scene built and drawn before (a step into it needs no card)? */
    zoneReady(id) { if (fallback) return true; const z = state.zones.get(keyOf(id)); return !!(z && z.warmed); },
    get progress() { return { ...L.progress, ready: state.ready, zone: !!shown, failed: state.failed ? String(state.failed) : null }; },
    get fxCounts() { return fx3.counts; },
    get gpu() { return renderer.userData.gpu; },
    /** Frame timing probe like the mockups' render.py: renders n frames back to back and reads a pixel each. */
    measure(n = 30) {
      const g = renderer.getContext(), px = new Uint8Array(4), t = performance.now();
      for (let i = 0; i < n; i++) { if (quality.bloom && composer) composer.render(); else renderer.render(scene, camera); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); }
      const per = (performance.now() - t) / n;
      return { uncappedMs: +per.toFixed(2), uncappedFps: +(1000 / per).toFixed(1), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, size: [gl.width, gl.height], quality };
    },
    invalidate(zoneId) { const z = state.zones.get(keyOf(zoneId)); if (z) { z.dispose(); state.zones.delete(keyOf(zoneId)); } },
  };
  return api;
}

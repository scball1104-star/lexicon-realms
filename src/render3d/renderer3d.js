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
// Camera: Diablo-style follow from the south, 56 degrees down, at three zoom distances (view.zoom 1, 1.5, 2). The camera
// looks north, so screen up is world north (W walks up the screen as in 2D) and a point h px "above" a 2D anchor maps to
// the same screen spot as a point h px north on the ground: anchorOf() returns that h, measured each frame by projection.
//
// Quality: touch devices (or ?q3d=low, or view.fx 'low' for the post effects) drop shadows, bloom and the grade pass,
// cap point lights at 2 (desktop 6), skip grass and flowers, and render at most 1.5 device px per css px.
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
import { isTouchDevice } from '../input/touch.js';
import { BitmapFont } from '../core/font.js';
import { createLoader, WINDOW_LIT } from './loader.js';
import { buildZone, LAMP_GLASS, SEE } from './zone3d.js';
import { createActors } from './actors.js';
import { createFx3d } from './fx3d.js';

const PX = 16;
const PITCH = THREE.MathUtils.degToRad(56);
const FOV = 30;
const DIST = 30;              // camera distance at zoom 1 (m); zoom 1.5 -> 20, zoom 2 -> 15

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

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export function createRenderer3D(canvas, assets, opts = {}) {
  if (!webglAvailable()) throw new Error('WebGL is not available');
  const { zones, abilities = null, items = null } = opts;
  const q = new URLSearchParams(location.search);
  const touchDev = isTouchDevice(window, q);
  const low = q.get('q3d') === 'low' || (q.get('q3d') !== 'high' && touchDev);
  const quality = { low, shadows: !low, bloom: !low, maxLights: low ? 2 : 6, grass: !low, maxScale: low ? 1.5 : 2 };

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
  const actors = createActors(scene, L, { items, quality });
  const fx3 = createFx3d(scene, { abilities, maxParticles: low ? 300 : 700 });
  const font = assets.has && assets.has('font') ? new BitmapFont(assets.json('font'), assets.img('font'), { id: 'r3d' }) : null;
  const fontFrom = (j, im) => (j && im ? new BitmapFont(j, im, { id: 'num' }) : null);
  let numFont = null;
  const fx2 = createFx({
    abilities,
    sheet: () => null,
    numFont: () => numFont || (numFont = assets.has('font_num') ? fontFrom(assets.json('font_num'), assets.img('font_num')) : null),
    bigFont: () => null,
  });

  const state = { preload: null, ready: false, failed: null, zones: new Map(), building: new Map(), zoneId: null, playerId: null };
  const idle = () => new Promise((r) => setTimeout(r, 0));
  // everything in assets3d/manifest.json is used: load it all in the background (one progress number)
  state.preload = fetch('assets3d/manifest.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`manifest ${r.status}`))))
    .then((man) => Promise.all([L.clips(), ...man.files.filter((f) => /\.(gltf|glb)$/.test(f) && !/^ual\//.test(f)).map((f) => L.gltf(f))]))
    .then(() => { state.ready = true; })
    .catch((e) => { state.failed = e; });

  function zoneFor(id) {
    if (state.zones.has(id)) return state.zones.get(id);
    if (!state.building.has(id) && zones[id] && state.ready) {
      const p = buildZone(L, zones[id], { tilesDb: assets.json('tiles'), quality, yieldFn: idle })
        .then((z) => {
          state.zones.set(id, z); state.building.delete(id);
          // keep two zones built: the shown one and the last
          for (const [k, v] of state.zones) if (k !== id && k !== state.zoneId && state.zones.size > 3) { v.dispose(); state.zones.delete(k); }
        })
        .catch((e) => { state.building.delete(id); state.failed = e; });
      state.building.set(id, p);
    }
    return null;
  }
  let shown = null;

  // ---- 2D layers
  const canvas2d = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
  let [hud, hctx] = canvas2d(640, 360);
  let [over, octx] = canvas2d(640, 360);
  let layout = layoutFor(canvas.width, canvas.height, 1);
  const dev = { clock: null, stats: { ms: 0, avg: 0, n: 0 }, sky: null, quality, info: null, camDist: null };   // camDist: drivers' close-up
  let lastNow = null;
  const focus = new THREE.Vector3();
  const anchors = new Map();     // id -> { x, y, h (2D-equivalent px), dev: { fx, fy, hx, hy, hw } }
  let fallback = null;
  Object.defineProperty(dev, 'scene', { value: scene, enumerable: false });   // drivers and debugging only
  /** Drivers: what a body looks like now ({ kind, built, sig, spec }) or null. */
  dev.actor = (id) => { const a = actors.get(id); if (!a) return null; const b = a.body; return { kind: a.kind, built: !!b, sig: a.sig, building: a.building, type: b && b.type, spec: b && b.spec ? { parts: b.spec.parts, helm: b.spec.helm, cape: b.spec.cape, main: b.spec.main, off: b.spec.off } : null, anim: b && b.anim ? b.anim.name : null }; };

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
    return ray.ray.intersectPlane(ground, hit) ? hit : null;
  }
  function devToWorld(dx, dy) { const h = devToGround(dx, dy); return h ? [h.x * PX, h.z * PX] : [0, 0]; }
  function worldToHud(wx, wy) {
    const [dx, dy] = toDev(new THREE.Vector3(wx / PX, 0, wy / PX));
    return [Math.round((dx - layout.ox) / layout.base), Math.round((dy - layout.oy) / layout.base)];
  }

  // ---- sky and lights
  const C = (h) => new THREE.Color(h);
  const SKY_DAY = C('#9fb4cc'), SKY_NIGHT = C('#0e1424'), SUN_DAY = C('#fff1dc'), SUN_LOW = C('#ff9a5a'), MOON = C('#8fa2ff');
  function applySky(snap, view, zone, target) {
    const sky = skyAt(dayFraction(snap, view));
    if (zone && zone.lighting && zone.lighting.dark) { const d = zone.lighting.dark; sky.amb = sky.amb.map((v) => v * (1 - d)); sky.lum *= 1 - d; sky.lamps = Math.max(sky.lamps, d); }
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
    const mood = ZONE_MOOD[zone && zone.id] || null;
    const sk = SKY_NIGHT.clone().lerp(SKY_DAY, Math.min(1, sky.lum * 1.1)).multiply(new THREE.Color(1, 0.97 + 0.03 * dayK, 1));
    if (mood) sk.lerp(C('#8090a8'), 0.25 * sky.lum);
    scene.background.copy(sk); scene.fog.color.copy(sk);
    const dist = camera.position.distanceTo(target);
    scene.fog.near = dist + (mood ? 2 : 8); scene.fog.far = dist + (mood ? 30 : 48) * (mood ? mood.fog : 1);
    WINDOW_LIT.emissiveIntensity = 0.15 + 1.5 * sky.lamps;
    LAMP_GLASS.emissiveIntensity = 0.3 + 2.4 * sky.lamps;
    if (shown && shown.halo) shown.halo.opacity = 0.9 * sky.lamps;
    if (grade) {
      grade.uniforms.desat.value = (mood ? mood.desat : 0) + sky.desat * 0.6;
      const t = mood ? mood.tint : [1, 1, 1];
      grade.uniforms.tint.value.set(t[0], t[1], t[2]);
      grade.uniforms.vig.value = 0.75 + 0.45 * sky.lamps;
    }
    return sky;
  }
  function assignLights(sky, target, playerPos) {
    const cand = [];
    if (shown) for (const l of shown.lamps) cand.push({ pos: l.pos, color: l.color, k: l.k * sky.lamps * (l.fire ? 1.2 + Math.sin(performance.now() / 90) * 0.1 : 1) });
    for (const l of actors.lights()) cand.push({ pos: l.pos, color: l.color, k: l.k * (l.lantern ? 0.35 + 0.65 * sky.lamps : 0.6 + 0.4 * sky.lamps) });
    for (const l of fx3.lights) cand.push(l);
    if (playerPos && sky.lamps > 0.05) cand.push({ pos: playerPos.clone().setY(2.6), color: '#ffe2c0', k: 0.55 * sky.lamps });
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

  function draw(prevSnap, snap, alpha, view) {
    if (fallback) return fallback.draw(prevSnap, snap, alpha, view);
    if (state.failed) { useFallback(state.failed); return; }
    const t0 = performance.now();
    layout = layoutFor(canvas.width, canvas.height, view.zoom || 1, { touch: !!view.touch, hud: view.hud || 'big', dpr: view.dpr || 1, inset: view.inset });
    layout.worldOx = layout.wox; layout.worldOy = layout.woy;
    if (hud.width !== layout.hudW || hud.height !== layout.hudH) { [hud, hctx] = canvas2d(layout.hudW, layout.hudH); [over, octx] = canvas2d(layout.hudW, layout.hudH); }
    sizeGl();
    const now = dev.clock != null ? dev.clock : view.time || 0;
    const dt = lastNow == null ? 0 : Math.max(0, Math.min(0.1, now - lastNow));
    lastNow = now;
    if (view.followId != null) { state.playerId = view.followId; fx2.setPlayer(view.followId); }
    const zone = zones[view.zone];
    const z = zoneFor(view.zone);
    if (z !== shown) {
      if (shown) scene.remove(shown.group);
      shown = z;
      if (shown) scene.add(shown.group);
      actors.clear();
    }
    state.zoneId = view.zone;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    actors.sync(prevSnap, snap, alpha, view.zone, now, dt, fx3, focus, 18 + 26 / (view.zoom || 1));
    const me = view.followId != null ? actors.get(view.followId) : null;
    // near a zone edge, build the next zone in the background so walking through is quick
    if (meE && zone && !state.building.size) {
      for (const j of zone.joins || []) {
        if (!zones[j.to] || state.zones.has(j.to)) continue;
        const dx = Math.max(j.x - focus.x, 0, focus.x - (j.x + j.w)), dz = Math.max(j.y - focus.z, 0, focus.z - (j.y + j.h));
        if (Math.hypot(dx, dz) < 14) { zoneFor(j.to); break; }
      }
    }
    const target = focus.clone().setY(1.0);
    const dist = dev.camDist || (DIST * (layout.touch ? 0.8 : 1)) / (view.zoom || 1);   // phones sit a little closer
    camera.position.set(target.x, target.y + dist * Math.sin(PITCH), target.z + dist * Math.cos(PITCH));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    SEE.uCam.value.copy(camera.position); SEE.uFocus.value.copy(focus).setY(1.0); SEE.uSeeR.value = me ? 3.0 : 0;
    renderer.info.reset();
    const sky = applySky(snap, view, zone, target);
    const tg = view.targetId != null && view.targetId !== view.followId ? actors.get(view.targetId) : null;
    if (tg && tg.e && !tg.e.dead && tg.kind !== 'object') {
      targetRing.visible = true;
      targetRing.position.copy(tg.root.position).setY(0.04);
      const r = Math.max(0.8, Math.min(2.2, tg.height * 0.55));
      targetRing.scale.setScalar(r * (1 + 0.06 * Math.sin(now * 6)));
      ringMat.color.set(RING_COL[tg.e.faction] || RING_COL.neutral);
      ringMat.opacity = 0.75 + 0.25 * Math.sin(now * 6);
    } else targetRing.visible = false;
    const at = (id, w) => actors.at(id, w);
    fx3.update(dt, now, at);
    assignLights(sky, target, me ? me.root.position : null);
    if (quality.bloom && composer && view.fx !== 'low') composer.render();
    else renderer.render(scene, camera);

    // anchors (2D-equivalent): feet px and the north-on-the-ground height that lands on the head
    anchors.clear();
    for (const a of actors.list()) {
      const p = a.root.position;
      const [fx, fy, fz] = toDev(p);
      const head = new THREE.Vector3(p.x, p.y + a.height, p.z);
      const [hx, hy] = toDev(head);
      const g = devToGround(hx, hy);
      const h2 = g ? Math.max(4, (p.z - g.z) * PX) : 24;
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
    dev.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, actors: actors.list().length, gpu: renderer.userData.gpu };
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
    get ready() { return !fallback && state.ready && !!shown && shown === state.zones.get(state.zoneId); },
    get loading() { return fallback ? fallback.loading : (state.ready && shown ? 0 : 1); },
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
    invalidate(zoneId) { const z = state.zones.get(zoneId); if (z) { z.dispose(); state.zones.delete(zoneId); } },
  };
  return api;
}

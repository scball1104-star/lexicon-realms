// The creation screen's turntable (wave 6 item 8): the real 3D hero on a code-built plinth, drawn by the game's own
// WebGL renderer into the stage rect the UI leaves open (src/ui/create_screen.js). While a stage is asked for
// (view.stage), renderer3d.js draws only this, not the world: the screen covers the world anyway.
//
//   const T = createTurntable(L, { items, quality, environment })
//   T.render(renderer, stage, layout, glCanvas, hudCanvas, now)
//     stage: { rect: { x, y, w, h } (HUD layer px), cls, look, app, equip, yaw, bg (layer-sized canvas: the screen's
//              backdrop, drawn behind the hero so the rect matches the screen around it), phone }
//   T.dev -> { sig, building, built } for drivers
//
// Quality: the plinth's glowing rune band and the shadows follow the game's settings (quality.low: no band glow, no shadow).
import * as THREE from '../vendor/three/three.module.min.js';
import { assemble } from './hero.js';
import { heroSpec, dress } from './gear.js';
import { finishApp } from './custom_kit.js';

const PLAIN = new THREE.Color('#14101e');
const IDLE = { warden: 'Sword_Idle', mender: 'Idle_Torch_Loop', scribe: 'Idle_Loop', wayfinder: 'Idle_Loop', inkblade: 'Idle_Loop' };

/** A low stone drum with a gold rim and a ring of made-up glowing runes (strokes, no real alphabet). */
function plinth(low) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#46424f', roughness: 0.85 });
  const d = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.84, 0.14, 48), stone); d.position.y = -0.07; d.receiveShadow = true; g.add(d);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.025, 8, 64), new THREE.MeshStandardMaterial({ color: '#c9a24c', metalness: 0.8, roughness: 0.35 }));
  rim.rotation.x = Math.PI / 2; g.add(rim);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const x = c.getContext('2d');
    x.strokeStyle = '#9fe0ff'; x.fillStyle = '#9fe0ff'; x.lineWidth = 3; x.lineCap = 'round';
    let sd = 11; const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const cx = i * (1024 / 26) + 20, top = 16, bot = 48;
      x.beginPath(); x.moveTo(cx, top); x.lineTo(cx, bot); x.stroke();
      for (let k = 0; k < 2 + (rr() < 0.5 ? 1 : 0); k++) {
        const yy = top + 4 + rr() * 26, sgn = rr() < 0.5 ? -1 : 1, kind = rr();
        x.beginPath();
        if (kind < 0.45) { x.moveTo(cx, yy); x.lineTo(cx + sgn * 10, yy + (rr() - 0.5) * 14); x.stroke(); }
        else if (kind < 0.8) { x.arc(cx + sgn * 5, yy, 5, 0, Math.PI * 2 * (0.5 + rr() * 0.4)); x.stroke(); }
        else { x.arc(cx + sgn * 8, yy, 2.2, 0, 6.3); x.fill(); }
      }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.845, 0.845, 0.1, 64, 1, true),
      low ? new THREE.MeshStandardMaterial({ map: t, color: '#6a8aa0', roughness: 0.8, transparent: true })
        : new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#5a90b0' }));
    band.position.y = -0.07; g.add(band);
  }
  return g;
}

export function createTurntable(L, { items = null, quality = {}, environment = null } = {}) {
  const low = !!quality.low;
  const scene = new THREE.Scene();
  scene.environment = environment; scene.environmentIntensity = 0.25;
  scene.add(new THREE.HemisphereLight('#c8d0ff', '#3a2e22', 1.0));
  const sun = new THREE.DirectionalLight('#fff2dc', 2.3); sun.position.set(3, 7, 6);
  sun.castShadow = !!quality.shadows; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  { const c = sun.shadow.camera; c.left = c.bottom = -2.2; c.right = c.top = 2.2; c.near = 1; c.far = 20; }
  scene.add(sun, sun.target);
  const spot = new THREE.SpotLight('#ffe2b0', 18, 9, 0.5, 0.6, 1.6); spot.position.set(1.2, 4.2, 2.8); spot.target.position.set(0, 0.8, 0);
  scene.add(spot, spot.target);
  const rimL = new THREE.DirectionalLight('#9fb4ff', 1.1); rimL.position.set(-4, 4, -5); scene.add(rimL);
  const lamp = new THREE.PointLight('#ffc46b', 0, 3, 2); scene.add(lamp);      // a mender's lantern, a glowing blade
  const pl = plinth(low); scene.add(pl);
  const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.76, 48), new THREE.ShadowMaterial({ opacity: 0.45 }));
  shadowDisc.rotation.x = -Math.PI / 2; shadowDisc.position.y = 0.002; shadowDisc.receiveShadow = true; scene.add(shadowDisc);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  const holder = new THREE.Group(); scene.add(holder);
  let body = null, want = null, building = null, lastNow = null;
  const bgTex = new WeakMap();
  const dev = { sig: null, building: false, built: 0 };

  function free(b) {
    if (!b) return;
    holder.remove(b.ch.o); if (b.local.parent) b.local.parent.remove(b.local);
    b.ch.mixer.stopAllAction();
    for (const m of b.ch.mats) m.dispose();
    b.local.traverse((m) => { if (m.isMesh || m.isPoints) { m.geometry.dispose(); m.material.dispose(); } });
  }
  async function build(stage, sig) {
    const spec = heroSpec(stage.cls, stage.look, stage.equip || {}, items, stage.app || null);
    const ch = await assemble(L, spec);
    const local = new THREE.Group();
    const dressed = await dress(L, ch, spec, local);
    await finishApp(L, ch, spec);
    ch.o.scale.multiplyScalar(spec.scale || 1);
    const clip = ch.clip(IDLE[spec.cls] || 'Idle_Loop') || ch.clip('Idle_Loop');
    if (clip) ch.mixer.clipAction(clip).play();
    ch.o.traverse((m) => { if (m.isMesh) { m.castShadow = !!quality.shadows; m.receiveShadow = true; } });
    return { ch, local, spec, sig, lights: dressed.lights || [] };
  }
  function ask(stage) {
    const sig = heroSpec(stage.cls, stage.look, stage.equip || {}, items, stage.app || null).sig;
    want = sig;
    if (building || (body && body.sig === sig)) return;
    dev.building = true;
    building = build(stage, sig).then((b) => {
      building = null; dev.building = false;
      if (b.sig !== want) { free(b); return; }           // the player moved on while it built: the next frame asks again
      free(body); body = b; dev.sig = b.sig; dev.built++;
      holder.add(b.ch.o); scene.add(b.local);
    }).catch((err) => { building = null; dev.building = false; want = null; console.warn('Lexicon Realms 3D: turntable hero', err); });
  }

  function render(renderer, stage, layout, gl, canvas, now) {
    ask(stage);
    const dt = lastNow == null ? 0 : Math.max(0, Math.min(0.1, now - lastNow)); lastNow = now;
    const yaw = Number(stage.yaw) || 0;
    pl.rotation.y = yaw;
    if (body) {
      body.ch.o.rotation.y = yaw;
      body.ch.mixer.update(dt);
      body.ch.applyPost();
      for (const f of body.ch.fx) { try { f(dt, body.ch, now); } catch { /* an effect that needs the world */ } }
      const l = body.lights[0];
      if (l && l.obj) { l.obj.updateMatrixWorld(true); l.obj.getWorldPosition(lamp.position); lamp.color.set(l.color); lamp.intensity = l.k * 0.6; } else lamp.intensity = 0;
    }
    // the stage rect: HUD layer px -> device px -> GL px (the GL canvas may be smaller than the game canvas on phones)
    const k = gl.width / Math.max(1, canvas.width), r = stage.rect;
    const x = Math.round((layout.ox + r.x * layout.base) * k), w = Math.max(2, Math.round(r.w * layout.base * k));
    const yTop = Math.round((layout.oy + r.y * layout.base) * k), h = Math.max(2, Math.round(r.h * layout.base * k));
    const y = gl.height - yTop - h;
    // the screen's backdrop behind the hero, cut to the rect, so the stage meets the screen around it without a seam
    if (stage.bg) {
      let t = bgTex.get(stage.bg);
      if (!t) { t = new THREE.CanvasTexture(stage.bg); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = k < 1 ? THREE.LinearFilter : THREE.NearestFilter; t.generateMipmaps = false; bgTex.set(stage.bg, t); }
      const LW = stage.bg.width, LH = stage.bg.height;
      t.repeat.set(r.w / LW, r.h / LH); t.offset.set(r.x / LW, 1 - (r.y + r.h) / LH);
      scene.background = t;
    } else scene.background = PLAIN;
    camera.aspect = w / h;
    camera.fov = stage.phone ? 26 : 24;
    camera.position.set(0, 1.5, stage.phone ? 5.9 : 5.8); camera.lookAt(0, 0.8, 0);
    camera.updateProjectionMatrix();
    // inset (the Character window's doll): the world is already drawn, so clear only inside the rect
    if (!stage.inset) { renderer.setClearColor('#0b0a12'); renderer.clear(); }
    renderer.shadowMap.needsUpdate = true;      // underground the world stops shadow updates; the stage always has them
    renderer.setScissorTest(true);
    renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
    if (stage.inset) { renderer.setClearColor('#0b0a12'); renderer.clear(); }
    try { renderer.render(scene, camera); } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, gl.width, gl.height);
    }
  }
  return { render, dev, scene };
}

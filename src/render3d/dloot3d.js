// Delve loot in 3D (wave 10 dloot, Scott 2026-11-25; D:/LQOnline/wave10/dloot/BRIEF.md): a light column at each drop the
// HUD lists (src/ui/dloot_ui.js S.drops, through main.js view.dlootDrops). Additive, no depth write, toneMapped off, so
// the bloom pass lifts it and it never hides the floor. Two open cylinders and a ring each (an Illuminated piece adds a
// gold sheath), shared geometry and textures; at most 24 columns. Render only: nothing here reads or writes the sim.
//
//   const B = createDloot3d(scene)
//   B.sync(drops, zone, now, groundY)   drops: [{ wx, wy, zone, rarity, mine, illum, t0 }] (world px / 16 = metres)
//   B.count                              columns standing (drivers, tests)
import * as THREE from '../vendor/three/three.module.min.js';
import { DROP_LOOK } from '../data/dloot.js';

export function createDloot3d(scene) {
  const group = new THREE.Group();
  group.name = 'dloot_columns';
  scene.add(group);
  let fade = null, ringTex = null;
  const geo = new Map(), mats = new Map(), live = new Map();
  function textures() {
    if (fade || typeof document === 'undefined') return;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const c = cv.getContext('2d');
    for (let x = 0; x < 64; x++) {
      const across = 1 - Math.abs(x - 31.5) / 32;
      const gr = c.createLinearGradient(0, 256, 0, 0);
      gr.addColorStop(0, `rgba(255,255,255,${0.95 * across})`); gr.addColorStop(0.5, `rgba(255,255,255,${0.45 * across})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(x, 0, 1, 256);
    }
    fade = new THREE.CanvasTexture(cv);
    const rc = document.createElement('canvas'); rc.width = rc.height = 128;
    const r2 = rc.getContext('2d');
    const rg = r2.createRadialGradient(64, 64, 10, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.35)'); rg.addColorStop(0.8, 'rgba(255,255,255,0.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    r2.fillStyle = rg; r2.fillRect(0, 0, 128, 128);
    ringTex = new THREE.CanvasTexture(rc);
  }
  const cyl = (r, h) => { const k = `c${r.toFixed(3)}:${h.toFixed(2)}`; if (!geo.has(k)) geo.set(k, new THREE.CylinderGeometry(r, r * 1.15, h, 18, 1, true)); return geo.get(k); };
  const plane = (s) => { const k = `p${s.toFixed(2)}`; if (!geo.has(k)) geo.set(k, new THREE.PlaneGeometry(s, s)); return geo.get(k); };
  function mat(color, k, map) {
    const key = `${color}:${k.toFixed(2)}:${map === fade ? 'f' : 'r'}`;
    if (!mats.has(key)) mats.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    return mats.get(key);
  }
  function build(d) {
    textures();
    const g = new THREE.Group();
    const color = DROP_LOOK.colors[d.rarity] || '#ffffff', R = DROP_LOOK.r3d[d.rarity] || 0.5;
    const k = d.mine ? 1 : DROP_LOOK.friend, h = (DROP_LOOK.h3d[d.rarity] || 0) * (d.mine ? 1 : 0.7);
    if (h > 0) {
      for (const [rad, kk] of [[0.32 * R * (d.mine ? 1 : 0.5), 1.6], [0.1 * R, 3.0]]) {
        const m = new THREE.Mesh(cyl(rad, h), mat(color, kk * k, fade));
        m.position.y = h / 2; m.renderOrder = 5;
        g.add(m);
      }
      if (d.illum) { const m = new THREE.Mesh(cyl(0.5 * R, h * 0.55), mat(DROP_LOOK.colors.gilt, 0.9, fade)); m.position.y = h * 0.275; g.add(m); }
    }
    const ring = new THREE.Mesh(plane(R * 1.3), mat(color, 1.4 * k, ringTex));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    g.add(ring);
    g.userData.h = h;
    return g;
  }
  return {
    group,
    get count() { return live.size; },
    /** Keep one column per listed drop in this zone; grow it in over 0.25 s; drop the ones the HUD has let go. */
    sync(drops, zone, now, groundY = () => 0) {
      const want = new Set();
      for (const d of drops || []) {
        if (d.zone !== zone) continue;
        want.add(d);
        let g = live.get(d);
        if (!g) { g = build(d); g.position.set(d.wx / 16, groundY(d.wx / 16, d.wy / 16), d.wy / 16); group.add(g); live.set(d, g); }
        const age = d.t0 != null ? Math.max(0, now - d.t0) : 1;
        g.scale.y = Math.min(1, 0.05 + age * 4);
      }
      for (const [d, g] of live) if (!want.has(d)) { group.remove(g); live.delete(d); }
    },
  };
}

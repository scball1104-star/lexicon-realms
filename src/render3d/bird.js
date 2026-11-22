// The Lantern Kite (big world piece 1, 2026-11-22; D:/LQOnline/world3 still 3, approved with the brief): the flight
// bird, an original code-built creature. A great pale-gold hawk with ink-blue wing tips and a lantern hung from its
// breast harness. No model on disk is a rideable flyer, so it is boxes, spheres and extruded wing shapes. Faces +z, the
// saddle on its back at about y 2.0 (after the 1.25 scale). The renderer (renderer3d.js) seats a flying hero on it.
//
//   const g = makeBird()   tickBird(g, now, k)  (a slow wing beat and glide; k 0..1 how far into the air: wings spread)
import * as THREE from '../vendor/three/three.module.min.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true, ...o });
const GOLD = M('#b98d48'), CREAM = M('#cdb98e'), INK = M('#1f2c55'), DARK = M('#3b2a1c'), BEAK = M('#e0a030'), EYE = M('#111111');
const LEATHER = M('#5a3a22'), BRASS = M('#c89a40', { metalness: 0.5, roughness: 0.4 });
const GLOW = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffae4a', emissiveIntensity: 1.6 });

function wing(side) {
  // a feathered wing: a broad inner panel and a long outer hand, each an extruded outline, with ink tips
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.35); shape.lineTo(1.6, 0.55); shape.lineTo(3.3, 0.25); shape.lineTo(3.7, -0.15);
  for (let i = 0; i < 7; i++) { const x = 3.6 - i * 0.5; shape.lineTo(x - 0.1, -0.75 - (i < 4 ? 0.25 : 0) + (i % 2) * 0.12); shape.lineTo(x - 0.35, -0.45); }
  shape.lineTo(0, -0.55); shape.lineTo(0, 0.35);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  const panel = new THREE.Mesh(geo, GOLD); g.add(panel);
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.2), INK);
    f.position.set(2.9 + i * 0.16, 0.06, -0.55 - i * 0.05); f.rotation.y = -0.25 - i * 0.12; g.add(f);
  }
  const cov = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.5), CREAM); cov.position.set(0.9, 0.06, 0.1); g.add(cov);
  g.scale.x = side; g.userData.side = side;
  return g;
}

export function makeBird() {
  const root = new THREE.Group(); root.name = 'lantern_kite';
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 9), GOLD); body.scale.set(1.0, 0.85, 1.9); body.position.set(0, 1.0, 0); root.add(body);
  const breast = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 9), CREAM); breast.scale.set(1.0, 0.9, 1.2); breast.position.set(0, 0.85, 0.75); root.add(breast);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 0.8, 10), CREAM); neck.position.set(0, 1.35, 1.35); neck.rotation.x = 0.7; root.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 9), GOLD); head.scale.set(0.9, 0.9, 1.15); head.position.set(0, 1.72, 1.75); root.add(head);
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), INK); crest.position.set(0, 2.0, 1.5); crest.rotation.x = -1.0; root.add(crest);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 6), BEAK); beak.position.set(0, 1.62, 2.22); beak.rotation.x = Math.PI / 2 + 0.35; root.add(beak);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), EYE); e.position.set(0.26 * s, 1.8, 1.98); root.add(e); }
  // tail fan
  for (let i = -3; i <= 3; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 1.3), i % 2 ? GOLD : INK);
    f.position.set(i * 0.12, 0.95, -1.8); f.rotation.y = i * 0.13; f.rotation.x = -0.08; root.add(f);
  }
  // wings, hinged at the shoulders
  const wl = wing(-1), wr = wing(1);
  wl.position.set(-0.55, 1.25, 0.25); wr.position.set(0.55, 1.25, 0.25);
  root.add(wl, wr); root.userData.wings = [wl, wr];
  // tucked legs and talons
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), BEAK); l.position.set(0.3 * s, 0.35, -0.3); l.rotation.x = -0.9; root.add(l); }
  // saddle, harness and the breast lantern
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 1.0), LEATHER); saddle.position.set(0, 1.62, -0.05); root.add(saddle);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.05, 6, 18), LEATHER); strap.position.set(0, 1.0, 0.35); strap.scale.set(1.0, 0.95, 1); root.add(strap);
  const lant = new THREE.Group(); lant.position.set(0, 0.15, 1.05); root.add(lant);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.36, 6, 1, true), BRASS); lant.add(cage);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), GLOW); lant.add(glow);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 6), BRASS); cap.position.y = 0.26; lant.add(cap);
  root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  root.scale.setScalar(1.25);
  return root;
}

export function tickBird(g, now, k = 1) {
  const [wl, wr] = g.userData.wings || [];
  if (!wl) return;
  // on the ground the wings fold up over the back; in the air a slow beat, mostly glide (faster while climbing)
  const fast = k < 0.95 ? 2.2 : 1;
  const beat = (Math.sin(now * 2.2 * fast) * 0.28 + 0.12) * k + (1 - k) * -1.1;
  wl.rotation.z = -beat; wr.rotation.z = beat;
  g.userData.bob = Math.sin(now * 2.2 + 1.2) * 0.12 * k;
}

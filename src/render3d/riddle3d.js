// Riddle stones in 3D (wave 9 riddles; sim in src/sim/riddles.js). Code-built, no files.
//
//   riddleStoneLook(e)   a grey waystone with a rounded head, a reading slab leaned back on its front (so the lit violet
//                        "?" reads from the game's high camera), a violet ribbon tied round it (a friend's mark) and a
//                        small violet glow. actors.js objectLook calls it for snapshot entities with `rstone` (one line).
import * as THREE from '../vendor/three/three.module.min.js';

let faceTex = null, glowTex = null;
function tex(glow) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = glow ? '#000000' : '#5d6470'; x.fillRect(0, 0, 128, 128);
  if (!glow) for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${0.05 + (i * 37 % 10) / 110})`; x.fillRect((i * 97) % 128, (i * 61) % 128, 2 + (i % 3), 2); }
  x.font = 'bold 96px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = '#c9a4ff'; x.shadowBlur = 20; x.fillStyle = '#c9a4ff'; x.fillText('?', 64, 70);
  x.shadowBlur = 0; x.globalAlpha = 0.6; x.fillStyle = '#fff8f0'; x.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function riddleStoneLook() {
  if (!faceTex) { faceTex = tex(false); glowTex = tex(true); }
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: '#5d6470', roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.3), rock); body.position.y = 0.475; g.add(body);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.3, 16, 1, false, Math.PI / 2, Math.PI), rock); head.rotation.set(Math.PI / 2, 0, 0); head.position.y = 0.95; g.add(head);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.46), new THREE.MeshStandardMaterial({ color: '#4a4f58', roughness: 0.95 })); base.position.y = 0.06; g.add(base);
  const face = new THREE.MeshStandardMaterial({ map: faceTex, emissive: '#ffffff', emissiveMap: glowTex, emissiveIntensity: 1.5, roughness: 0.8 });
  const lean = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.46), rock); lean.position.set(0, 0.78, 0.2); lean.rotation.x = 0.75; g.add(lean);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.38), face); p.position.set(0, 0.805, 0.225); p.rotation.x = -Math.PI / 2 + 0.75; g.add(p);
  const rib = new THREE.MeshStandardMaterial({ color: '#7a3fb8', roughness: 0.7 });
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.07, 0.32), rib); band.position.y = 0.3; g.add(band);
  for (const [dx, rz] of [[0.2, -0.5], [0.27, -0.25]]) { const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.02), rib); tail.position.set(dx, 0.17, 0.17); tail.rotation.z = rz; g.add(tail); }
  const pt = new THREE.Object3D(); pt.position.set(0, 1.35, -0.25); g.add(pt);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.35);
  g.userData.h = 1.7; g.userData.lights = [{ obj: pt, color: '#b98cff', k: 0.6, lantern: true }];
  return g;
}

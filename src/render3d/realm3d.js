// The start realms in 3D (wave 3, lane realms1, 2026-11-22): code-built props for Emberpeak and Valewyn (zone.realmProps:
// forge chimneys, anvils, the Ember Gate's towers, furnaces, the ore cart; the sunken keep, drowned bells, nets, the
// ferry), the lava crossings that crust and glow, the tide water over Valewyn's flats, and the vehicle under a hero on a
// ride. No models from disk: boxes, cylinders and cones with shared materials. The rules are src/sim/realm_mech.js.
//
//   buildRealm3d(zone, group)            once per zone build (zone3d.js); returns a handle kept on group.userData.realm
//   tickRealm3d(group, tick, now)        every frame for the shown zone (renderer3d.js): the glow and the water level
//   makeVehicle(kind)                    'cart' | 'ferry': a small group to hang under a riding hero (renderer3d.js)
import * as THREE from '../vendor/three/three.module.min.js';
import { lavaAt, tideAt } from '../data/realm_cycles.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const M = {
  basalt: std('#2a2624', { flatShading: true }), iron: std('#2e2a28', { roughness: 0.5, metalness: 0.6 }), brass: std('#9a7a3a', { roughness: 0.4, metalness: 0.5 }),
  ember: std('#ff6a1a', { emissive: '#ff4a0a', emissiveIntensity: 1.4 }), wood: std('#6a4a2c'), darkWood: std('#3e2a1a'), stone: std('#8a8e88', { flatShading: true }),
  wetStone: std('#5a6a68', { flatShading: true, roughness: 0.6 }), rope: std('#b8a070'), sail: std('#ece6d6', { side: THREE.DoubleSide }), bell: std('#7a8a70', { roughness: 0.35, metalness: 0.7 }),
  net: std('#c8c0a0', { transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
};
const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };
const cyl = (r0, r1, h, m, x, y, z, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.castShadow = true; return o; };

// one prop at tile (x, y): the group's origin is the tile's centre on the ground (x + 0.5, y + 0.5 in metres)
function propOf(p) {
  const g = new THREE.Group();
  switch (p.t) {
    case 'ep_chimney': g.add(cyl(0.7, 0.9, 6, M.basalt, 0.5, 3, 0), cyl(0.75, 0.75, 0.3, M.ember, 0.5, 6.1, 0)); break;
    case 'ep_anvil': g.add(box(0.5, 0.5, 0.4, M.basalt, 0, 0.25, 0), box(0.9, 0.25, 0.4, M.iron, 0, 0.62, 0)); break;
    case 'ep_furnace': g.add(box(1.8, 2.4, 1.6, M.basalt, 0.5, 1.2, 0), box(0.9, 0.7, 0.1, M.ember, 0.5, 0.6, 0.81), cyl(0.3, 0.4, 2, M.iron, 0.9, 3.2, -0.3)); break;
    case 'ep_gate': {
      // an iron tower at the gap's edge and a run of iron wall toward the cliff (p.y0 / p.y1: where the wall ends)
      g.add(box(3.2, 7, 3.2, M.iron, 0, 3.5, 0), box(3.6, 0.4, 3.6, M.brass, 0, 7.1, 0), box(0.5, 0.5, 0.5, M.ember, 0, 6.2, 1.7));
      const end = p.side === 'n' ? p.y0 - p.y : p.y1 - p.y;
      const len = Math.abs(end) + 1, mid = end / 2;
      g.add(box(2.6, 5, len, M.iron, 0, 2.5, mid));
      for (let i = 0; i < Math.floor(len / 2); i++) g.add(box(2.8, 0.25, 0.25, M.brass, 0, 4.2, mid - len / 2 + 1 + i * 2));
      break;
    }
    case 'ep_ore_cart': {
      g.add(box(1.4, 0.8, 1.0, M.iron, 0, 0.75, 0));
      for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) { const w = cyl(0.25, 0.25, 0.1, M.basalt, dx, 0.25, dz); w.rotation.x = Math.PI / 2; g.add(w); }
      g.add(box(1.2, 0.3, 0.8, M.ember, 0, 1.15, 0));
      break;
    }
    case 'vw_keep': {
      g.add(cyl(3.2, 3.8, 5, M.wetStone, 0, 2.5, 0, 10), cyl(3.6, 3.6, 0.5, M.stone, 0, 5.2, 0, 10));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(box(0.8, 0.9, 0.8, M.stone, Math.cos(a) * 3.3, 5.9, Math.sin(a) * 3.3)); }
      g.add(box(1.4, 2.4, 0.3, M.darkWood, 0, 1.2, 3.6));
      break;
    }
    case 'vw_bell': {
      g.add(box(0.15, 2.4, 0.15, M.darkWood, -0.8, 1.2, 0), box(0.15, 2.4, 0.15, M.darkWood, 0.8, 1.2, 0), box(1.9, 0.15, 0.2, M.darkWood, 0, 2.4, 0));
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 10, 1, true), M.bell); b.position.set(0, 1.9, 0); b.castShadow = true; g.add(b);
      break;
    }
    case 'vw_nets': {
      g.add(box(0.12, 1.8, 0.12, M.darkWood, -1, 0.9, 0), box(0.12, 1.8, 0.12, M.darkWood, 1, 0.9, 0));
      const n = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.4), M.net); n.position.set(0, 1.0, 0); g.add(n);
      break;
    }
    case 'vw_ferry': g.add(makeVehicle('ferry')); break;
    default: return null;
  }
  g.position.set(p.x + 0.5, 0, p.y + 0.5);
  return g;
}

/** A cart or a boat, origin on the ground under the rider (the rider stands in it). */
export function makeVehicle(kind) {
  const g = new THREE.Group();
  if (kind === 'ferry') {
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 3.6, 8, 1, false, 0, Math.PI), M.wood);
    hull.rotation.z = Math.PI / 2; hull.rotation.y = Math.PI / 2; hull.position.set(0, 0.35, 0); hull.castShadow = true; g.add(hull);
    g.add(box(1.6, 0.08, 3.2, M.darkWood, 0, 0.36, 0), cyl(0.05, 0.05, 2.6, M.darkWood, 0, 1.6, -0.4));
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), M.sail); sail.position.set(0, 1.9, -0.4); sail.rotation.y = Math.PI / 2; g.add(sail);
  } else {
    g.add(box(1.3, 0.7, 1.6, M.iron, 0, 0.55, 0), box(1.36, 0.08, 1.66, M.brass, 0, 0.92, 0));
    for (const [dx, dz] of [[-0.6, -0.55], [0.6, -0.55], [-0.6, 0.55], [0.6, 0.55]]) { const w = cyl(0.22, 0.22, 0.1, M.basalt, dx, 0.22, dz); w.rotation.z = Math.PI / 2; g.add(w); }
  }
  g.userData.vehicle = kind;
  return g;
}

export function buildRealm3d(zone, group) {
  if (!zone || !(zone.realmProps || zone.lava || zone.tide)) return null;
  const root = new THREE.Group(); root.name = 'realm';
  for (const p of zone.realmProps || []) { const o = propOf(p); if (o) root.add(o); }
  const h = { zone, root, crust: null, crustMat: null, tide: null, tideMat: null };
  // the crossings: one instanced thin slab per cell, its material glowing with the cycle
  if (zone.lava) {
    const cells = [];
    for (let y = 0; y < zone.h; y++) { const r = zone.ground[y]; for (let x = 0; x < zone.w; x++) if (r[x] === zone.lava.ch) cells.push([x, y]); }
    if (cells.length) {
      h.crustMat = new THREE.MeshStandardMaterial({ color: '#1c1918', emissive: '#ff4a0a', emissiveIntensity: 0, roughness: 0.9, flatShading: true, name: 'realm_crust' });
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.08, 1.02), h.crustMat, cells.length);
      const m4 = new THREE.Matrix4();
      cells.forEach(([x, y], i) => { m4.makeTranslation(x + 0.5, 0.05, y + 0.5); mesh.setMatrixAt(i, m4); });
      mesh.receiveShadow = true; h.crust = mesh; root.add(mesh);
    }
  }
  // the tide: one water plane masked to the flats, raised and faded with the level
  if (zone.tide) {
    const c = document.createElement('canvas'); c.width = zone.w; c.height = zone.h;
    const cg = c.getContext('2d'), im = cg.createImageData(zone.w, zone.h);
    for (let y = 0; y < zone.h; y++) { const r = zone.ground[y]; for (let x = 0; x < zone.w; x++) { const i = (y * zone.w + x) * 4; const v = r[x] === zone.tide.ch ? 255 : 0; im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v; im.data[i + 3] = 255; } }
    cg.putImageData(im, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.LinearFilter;
    h.tideMat = new THREE.MeshStandardMaterial({ color: '#3d8c98', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0, alphaMap: tex, depthWrite: false, name: 'realm_tide' });
    const geo = new THREE.PlaneGeometry(zone.w, zone.h); geo.rotateX(-Math.PI / 2); geo.translate(zone.w / 2, 0, zone.h / 2);
    h.tide = new THREE.Mesh(geo, h.tideMat); h.tide.renderOrder = 2; root.add(h.tide);
  }
  group.add(root);
  group.userData.realm = h;
  return h;
}

export function tickRealm3d(group, tick, now) {
  const h = group && group.userData && group.userData.realm;
  if (!h) return;
  if (h.crustMat) {
    const st = lavaAt(h.zone, tick);
    h.crustMat.emissiveIntensity = st.k * (0.6 + 0.12 * Math.sin(now * 3.1));
    h.crustMat.color.set(st.k > 0.3 ? '#5a2410' : '#1c1918');
  }
  if (h.tideMat) {
    const st = tideAt(h.zone, tick);
    const a = Math.max(0, Math.min(1, (st.level - 0.3) / 0.35));
    h.tideMat.opacity = 0.72 * a;
    h.tide.visible = a > 0.01;
    h.tide.position.y = 0.02 + 0.22 * st.level;
  }
}

// The Millrace in 3D (cap 35, stage 1, 2026-11-27; docs/handoff/briefs/BRIEF_cap35_millrace.md section 11): its
// code-built props, the same way fair3d.js builds the Endmarket's and realm3d.js the start realms'. No models from
// disk and no new art: boxes, cylinders and tori with shared materials. The zone lists them as zone.millProps
// (tools/maps/zone_millrace.mjs), each { t, x, y } in tiles; a prop's origin is its tile's centre on the ground.
//
//   buildMill3d(zone, group)      once per zone build (zone3d.js); a handle kept on group.userData.mill (null: none)
//   tickMill3d(group, now)        every frame for the shown zone (renderer3d.js): the wheels turn
//   millProp(p)                   one prop's group (tests and the cave lane's second wheel use it)
//
// Props: mr_wheel { r (degrees about the vertical), scale } the undershot wheel, its axle east to west by default so it
// stands in a north to south race; mr_undercroft { h } a dark stone-framed door low in the mill's wall (the Weir Works
// door spot); mr_board the bounty board; mr_chain_down { w } Ferrick's chain lying slack across a road between two
// posts w tiles apart; mr_ledger a washed ledger and its loose pages.
import * as THREE from '../vendor/three/three.module.min.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
const M = {
  wetWood: std('#3a2a1e'), wood: std('#5a4030'), plank: std('#6a5038'), iron: std('#2e2c2a', { roughness: 0.55, metalness: 0.55 }),
  stone: std('#7a766c', { flatShading: true }), wetStone: std('#55574e', { flatShading: true, roughness: 0.7 }), dark: std('#0c0a08', { roughness: 1 }),
  paper: std('#d8cca8', { side: THREE.DoubleSide }), wetPaper: std('#a89c7c', { side: THREE.DoubleSide }), ink: std('#2a2a30'),
  foam: std('#d8e4e0', { transparent: true, opacity: 0.55, roughness: 0.4 }),
};
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

/** The undershot wheel: two posts and a cross beam, an iron axle, two rims, 12 spokes and paddles, foam where it dips. */
function wheel(p) {
  const g = new THREE.Group();
  for (const px of [-1.05, 1.05]) { g.add(box(0.3, 3.4, 0.3, M.wetWood, px, 1.7, 0)); g.add(box(0.5, 0.25, 0.5, M.wetStone, px, 0.12, 0)); }
  g.add(box(2.4, 0.22, 0.22, M.wetWood, 0, 3.15, 0));
  const axle = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8), M.iron, 0, 2.05, 0); axle.rotation.z = Math.PI / 2; g.add(axle);
  const spin = new THREE.Group(); spin.position.y = 2.05; spin.name = 'mr_wheel_spin'; g.add(spin);
  const hub = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 10), M.iron); hub.rotation.z = Math.PI / 2; spin.add(hub);
  const R = 2.15;
  for (const ox of [-0.22, 0.22]) { const rim = mesh(new THREE.TorusGeometry(R, 0.09, 6, 18), M.wetWood, ox, 0, 0); rim.rotation.y = Math.PI / 2; spin.add(rim); }
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const sp = mesh(new THREE.BoxGeometry(0.08, R * 2 - 0.15, 0.08), M.wood); sp.rotation.x = a; spin.add(sp);
    const pad = mesh(new THREE.BoxGeometry(0.62, 0.48, 0.07), M.wetWood, 0, Math.cos(a) * R, Math.sin(a) * R); pad.rotation.x = a; spin.add(pad);
  }
  const foam = mesh(new THREE.CircleGeometry(0.9, 12), M.foam, 0, 0.05, 0); foam.rotation.x = -Math.PI / 2; foam.castShadow = false; g.add(foam);
  g.scale.setScalar(p.scale || 1);
  g.rotation.y = ((p.r || 0) * Math.PI) / 180;
  return { g, spin };
}

/** A low door in a wall facing west (the mill's race side): a stone frame and a dark opening, `h` tiles tall. */
function undercroft(p) {
  const g = new THREE.Group();
  const len = p.h || 2;
  // the wall face is the tile's west edge (x - 0.5); the opening runs north to south along it
  g.add(box(0.12, 1.9, len - 0.2, M.dark, -0.52, 0.95, (len - 1) / 2));
  for (const dz of [-0.45, len - 0.55]) g.add(box(0.3, 2.1, 0.3, M.wetStone, -0.55, 1.05, dz));
  g.add(box(0.34, 0.32, len + 0.1, M.wetStone, -0.55, 2.1, (len - 1) / 2));
  g.add(box(0.5, 0.12, len, M.wetStone, -0.7, 0.06, (len - 1) / 2));   // a worn step
  return g;
}

/** The bounty board: two posts, a pent roof, three pinned notices. */
function board() {
  const g = new THREE.Group();
  for (const px of [-0.6, 0.6]) g.add(box(0.12, 2.0, 0.12, M.wetWood, px, 1.0, 0));
  g.add(box(1.4, 0.9, 0.08, M.plank, 0, 1.3, 0.04));
  const roof = box(1.6, 0.08, 0.5, M.wetWood, 0, 2.02, 0.08); roof.rotation.x = 0.35; g.add(roof);
  for (const [x, y, w, h] of [[-0.38, 1.42, 0.34, 0.44], [0.05, 1.28, 0.3, 0.36], [0.4, 1.45, 0.28, 0.32]]) g.add(box(w, h, 0.01, M.paper, x, y, 0.09));
  return g;
}

/** Ferrick's chain, down: two posts either side of the road and the chain lying slack on the ground between them. */
function chainDown(p) {
  const g = new THREE.Group();
  const w = p.w || 7;
  for (const px of [0, w]) g.add(box(0.22, 1.2, 0.22, M.wetWood, px, 0.6, 0));
  // the chain: a sagging line of small links from the top of one post down to the ground and up the other
  const links = Math.round(w * 6);
  for (let i = 0; i <= links; i++) {
    const k = i / links, x = k * w;
    const y = Math.max(0.04, 0.85 * Math.pow(Math.abs(2 * k - 1), 6));
    const l = mesh(new THREE.TorusGeometry(0.06, 0.018, 4, 6), M.iron, x, y, 0.05 * Math.sin(i * 1.7));
    l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    g.add(l);
  }
  return g;
}

/** A washed ledger: a sodden book lying open and a few loose pages near it. */
function ledger(p) {
  const g = new THREE.Group();
  const s = ((p.x * 7 + p.y * 13) % 10) / 10;
  const book = new THREE.Group(); book.rotation.y = s * 6.28; g.add(book);
  for (const sx of [-1, 1]) { const leaf = box(0.28, 0.04, 0.38, M.wetPaper, sx * 0.15, 0.04, 0); leaf.rotation.z = sx * 0.12; book.add(leaf); }
  book.add(box(0.03, 0.06, 0.4, M.wetWood, 0, 0.03, 0));
  for (let i = 0; i < 3; i++) {
    const a = s * 6.28 + i * 2.1, r = 0.35 + i * 0.12;
    const page = box(0.2, 0.01, 0.26, i % 2 ? M.paper : M.wetPaper, Math.cos(a) * r, 0.02, Math.sin(a) * r); page.rotation.y = a; g.add(page);
    g.add(box(0.12, 0.005, 0.02, M.ink, Math.cos(a) * r, 0.03, Math.sin(a) * r));
  }
  return g;
}

/** One code-built prop's group, placed at its tile's centre (null for an id this kit does not know). */
export function millProp(p) {
  let g = null, spin = null;
  switch (p.t) {
    case 'mr_wheel': ({ g, spin } = wheel(p)); break;
    case 'mr_undercroft': g = undercroft(p); break;
    case 'mr_board': g = board(p); break;
    case 'mr_chain_down': g = chainDown(p); break;
    case 'mr_ledger': g = ledger(p); break;
    default: return null;
  }
  const root = new THREE.Group();
  root.position.set(p.x + 0.5, 0, p.y + 0.5);
  root.add(g);
  root.userData.spin = spin;
  return root;
}
export const MILL_IDS = Object.freeze(['mr_wheel', 'mr_undercroft', 'mr_board', 'mr_chain_down', 'mr_ledger']);

export function buildMill3d(zone, group) {
  if (!zone || !Array.isArray(zone.millProps) || !zone.millProps.length) return null;
  const root = new THREE.Group(); root.name = 'mill';
  const spins = [];
  for (const p of zone.millProps) { const o = millProp(p); if (!o) continue; root.add(o); if (o.userData.spin) spins.push(o.userData.spin); }
  group.add(root);
  const h = { root, spins };
  group.userData.mill = h;
  return h;
}

/** The wheels turn slowly with the race (about one turn in 14 s); `now` is the frame clock in ms. */
export function tickMill3d(group, now) {
  const h = group && group.userData && group.userData.mill;
  if (!h) return;
  const a = -((now || 0) / 1000) * 0.45;
  for (const s of h.spins) s.rotation.x = a;
}

// The Endmarket's fair props (wave 10 draid, wave A; Scott approved the look 2026-11-25 from the brief's stills), code-built
// (no files from any kit). Called from proto/src/render3d/dungeon3d.js: dressPlace (authored dg_fair_* ids) and buildDoorMouths (the
// Fair Gate on Drovers' Reach). Each returns { g, lights: [{ pos, color, k }] } in world metres (1 tile = 1 m), merged
// by the batcher like every other dungeon prop. Look: sun-faded oxblood and bone stripes, old timber, tarnished brass,
// paper lot tags; a ghost fair in one long dusk, lit by lanterns. Original design.
import * as THREE from '../vendor/three/three.module.min.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
const FM = {
  timber: std({ color: '#5a3c24', name: 'fair_timber' }),
  darkTimber: std({ color: '#3a2618', name: 'fair_dark_timber' }),
  oxblood: std({ color: '#7a2622', roughness: 0.95, side: THREE.DoubleSide, name: 'fair_oxblood' }),
  bone: std({ color: '#d6c8a2', roughness: 0.95, side: THREE.DoubleSide, name: 'fair_bone' }),
  teal: std({ color: '#2e5a58', roughness: 0.95, side: THREE.DoubleSide, name: 'fair_teal' }),
  brass: std({ color: '#b08a3c', roughness: 0.35, metalness: 0.8, name: 'fair_brass' }),
  iron: std({ color: '#2a2622', roughness: 0.5, metalness: 0.7, name: 'fair_iron' }),
  paper: std({ color: '#efe4c4', roughness: 1, side: THREE.DoubleSide, emissive: '#3a3020', emissiveIntensity: 0.5, name: 'fair_paper' }),
  ink: std({ color: '#1a1424', roughness: 1, side: THREE.DoubleSide, name: 'fair_ink' }),
  glow: new THREE.MeshBasicMaterial({ color: '#ffc46a', name: 'fair_glow' }),
  ring: new THREE.MeshBasicMaterial({ color: '#ffd88a', transparent: true, opacity: 0.55, side: THREE.DoubleSide, name: 'fair_ring' }),
  ringCold: new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.5, side: THREE.DoubleSide, name: 'fair_ring_cold' }),
  hay: std({ color: '#b89a52', roughness: 1, name: 'fair_hay' }),
  wicker: std({ color: '#7a5a34', roughness: 1, name: 'fair_wicker' }),
};
const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const mesh = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n);

/** A hanging lantern at (x, y, z) in g's frame; returns the light offset. */
function lantern(g, x, y, z) {
  g.add(mesh(bx(0.22, 0.3, 0.22), FM.iron, x, y, z));
  g.add(mesh(bx(0.16, 0.22, 0.16), FM.glow, x, y, z));
  g.add(mesh(cyl(0.005, 0.005, 0.4, 3), FM.iron, x, y + 0.34, z));
  return new THREE.Vector3(x, y, z);
}
/** Striped canvas: n slats across w, tilted, at height y. */
function stripes(g, w, d, y, tilt, mats, z0 = 0) {
  const n = Math.max(4, Math.round(w / 0.5)), sw = w / n;
  for (let i = 0; i < n; i++) g.add(mesh(bx(sw, 0.03, d), mats[i % mats.length], -w / 2 + sw * (i + 0.5), y, z0, tilt));
  // the scalloped front edge
  for (let i = 0; i < n; i++) { const t = mesh(new THREE.ConeGeometry(sw * 0.5, 0.28, 3), mats[i % mats.length], -w / 2 + sw * (i + 0.5), y - Math.sin(tilt) * d / 2 - 0.16, z0 + Math.cos(tilt) * d / 2, Math.PI, 0, 0); t.scale.z = 0.08; g.add(t); }
}
function tags(g, x, y, z, n, r) {
  for (let i = 0; i < n; i++) {
    const tx = x + (i - (n - 1) / 2) * 0.32, len = 0.18 + hash(r * 9 + i) * 0.25;
    g.add(mesh(cyl(0.006, 0.006, len, 3), FM.iron, tx, y - len / 2, z));
    const t = mesh(bx(0.2, 0.28, 0.01), FM.paper, tx, y - len - 0.14, z, 0, (hash(i, r) - 0.5) * 0.8, (hash(r, i) - 0.5) * 0.3); g.add(t);
    g.add(mesh(bx(0.12, 0.02, 0.012), FM.ink, tx, y - len - 0.1, z + 0.002, 0, t.rotation.y, t.rotation.z));
    g.add(mesh(bx(0.09, 0.02, 0.012), FM.ink, tx, y - len - 0.16, z + 0.002, 0, t.rotation.y, t.rotation.z));
  }
}

const PROPS = {
  // a fair stall: four posts, a counter with goods, a striped awning, a lantern
  dg_fair_awning(p) {
    const g = new THREE.Group(), r = p.r || 0, L = [];
    const W = 3.0, D = 1.6, mats = r > 0.5 ? [FM.teal, FM.bone] : [FM.oxblood, FM.bone];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(bx(0.1, sz < 0 ? 2.6 : 2.1, 0.1), FM.timber, sx * W / 2, sz < 0 ? 1.3 : 1.05, sz * D / 2));
    g.add(mesh(bx(W, 0.9, 0.7), FM.darkTimber, 0, 0.45, D / 2 - 0.35));
    g.add(mesh(bx(W + 0.1, 0.06, 0.8), FM.timber, 0, 0.93, D / 2 - 0.35));
    for (let i = 0; i < 5; i++) { const k = hash(r * 7 + i); g.add(mesh(k < 0.5 ? bx(0.3, 0.22, 0.3) : cyl(0.14, 0.16, 0.3, 8), k < 0.3 ? FM.hay : k < 0.6 ? FM.wicker : FM.brass, -W / 2 + 0.4 + i * 0.55, 1.08, D / 2 - 0.35)); }
    stripes(g, W + 0.3, D + 0.5, 2.4, 0.32, mats);
    L.push({ pos: lantern(g, W / 2 - 0.2, 1.85, D / 2 + 0.05), color: '#ffb35c', k: 0.9 });
    g.position.set(p.x + 0.5, 0, p.y + 0.5);
    return { g, lights: L.map((l) => ({ ...l, pos: l.pos.clone().add(g.position) })) };
  },
  // a wattle hurdle pen side, along z (5 m)
  dg_fair_hurdle(p) {
    const g = new THREE.Group(), len = 5;
    for (let i = 0; i <= 5; i++) g.add(mesh(bx(0.09, 1.15, 0.09), FM.darkTimber, 0, 0.57, -len / 2 + i * len / 5));
    for (const y of [0.3, 0.6, 0.9]) g.add(mesh(bx(0.05, 0.07, len), FM.wicker, 0, y, 0));
    for (let i = 0; i < 24; i++) g.add(mesh(bx(0.03, 1.0, 0.03), FM.wicker, (i % 2 ? 0.03 : -0.03), 0.5, -len / 2 + 0.1 + i * (len - 0.2) / 23));
    g.position.set(p.x + 0.5, 0, p.y + 0.5);
    return { g, lights: [] };
  },
  // a lot post: a crossbar of paper lot tags, each a name for sale
  dg_fair_lots(p) {
    const g = new THREE.Group(), r = p.r || 0.4;
    g.add(mesh(bx(0.14, 2.6, 0.14), FM.darkTimber, 0, 1.3, 0));
    g.add(mesh(bx(1.8, 0.1, 0.1), FM.timber, 0, 2.35, 0));
    tags(g, 0, 2.3, 0.06, 5, r);
    g.position.set(p.x + 0.5, 0, p.y + 0.5);
    return { g, lights: [] };
  },
  // bunting: pennants on a line from (x, y) east for p.len tiles, 3.6 m up, posts at both ends
  dg_fair_bunting(p) {
    const g = new THREE.Group(), len = p.len || 12, mats = [FM.oxblood, FM.bone, FM.teal];
    for (const x of [0, len]) g.add(mesh(bx(0.12, 3.9, 0.12), FM.darkTimber, x, 1.95, 0));
    g.add(mesh(bx(len, 0.02, 0.02), FM.iron, len / 2, 3.65, 0));
    const n = Math.round(len / 0.55);
    for (let i = 0; i < n; i++) { const x = (i + 0.5) * len / n, sag = Math.sin(Math.PI * x / len) * 0.35; const t = mesh(new THREE.ConeGeometry(0.2, 0.42, 3), mats[i % 3], x, 3.4 - sag, 0, Math.PI, 0, 0); t.scale.z = 0.06; g.add(t); }
    g.position.set(p.x + 0.5, 0, p.y + 0.5);
    return { g, lights: [] };
  },
  // the Weighmaster's great scales: a post behind the boss, a beam 12 m long, two pans on the floor with lit rims
  dg_fair_scales(p) {
    const g = new THREE.Group(), L = [];
    const tilt = 0.07, span = 6.2, top = 5.6, pz = -4.2;
    g.add(mesh(bx(0.7, 0.5, 0.7), FM.darkTimber, 0, 0.25, pz));
    g.add(mesh(bx(0.36, top, 0.36), FM.timber, 0, top / 2, pz));
    g.add(mesh(cyl(0.3, 0.3, 0.5, 10), FM.brass, 0, top, pz, Math.PI / 2, 0, 0));
    const beam = mesh(bx(span * 2 + 0.6, 0.32, 0.3), FM.brass, 0, top, pz, 0, 0, tilt); g.add(beam);
    g.add(mesh(new THREE.ConeGeometry(0.16, 0.9, 6), FM.brass, 0, top + 0.6, pz));
    for (const sx of [-1, 1]) {
      const ex = sx * span, ey = top - sx * Math.sin(tilt) * span;
      const panY = sx < 0 ? 0.55 : 0.08, pzz = 0.8;                 // the west pan rides high: too light
      const rim = mesh(new THREE.TorusGeometry(2.3, 0.1, 6, 28), FM.brass, ex, panY + 0.1, pzz, Math.PI / 2, 0, 0); g.add(rim);
      g.add(mesh(cyl(2.3, 2.1, 0.12, 28), FM.brass, ex, panY, pzz));
      const ringR = mesh(new THREE.RingGeometry(2.45, 2.75, 40), sx < 0 ? FM.ringCold : FM.ring, ex, 0.04, pzz, -Math.PI / 2, 0, 0); g.add(ringR);
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * Math.PI * 2 + 0.5, cx = ex + Math.cos(a) * 2.1, cz = pzz + Math.sin(a) * 2.1;
        const v0 = new THREE.Vector3(cx, panY + 0.15, cz), v1 = new THREE.Vector3(ex, ey - 0.2, pz), mid = v0.clone().add(v1).multiplyScalar(0.5), len = v0.distanceTo(v1);
        const c = new THREE.Mesh(cyl(0.025, 0.025, len, 4), FM.iron); c.position.copy(mid); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v1.clone().sub(v0).normalize()); g.add(c);
      }
      L.push({ pos: new THREE.Vector3(ex, 1.2, pzz), color: sx < 0 ? '#9fd8ff' : '#ffc870', k: 1.3 });
    }
    g.position.set(p.x + 0.5, 0, p.y + 0.5);
    return { g, lights: L.map((l) => ({ ...l, pos: l.pos.clone().add(g.position) })) };
  },
  // iron weights stacked by a small brass hand scale on a trestle
  dg_fair_weights(p) {
    const g = new THREE.Group(), r = p.r || 0.2;
    g.add(mesh(bx(1.6, 0.08, 0.7), FM.timber, 0, 0.85, 0));
    for (const sx of [-0.7, 0.7]) g.add(mesh(bx(0.08, 0.85, 0.6), FM.darkTimber, sx, 0.42, 0));
    for (let i = 0; i < 4; i++) g.add(mesh(cyl(0.22 - i * 0.04, 0.24 - i * 0.04, 0.16, 10), FM.iron, -0.4, 0.97 + i * 0.16, 0));
    g.add(mesh(bx(0.04, 0.6, 0.04), FM.brass, 0.4, 1.19, 0));
    g.add(mesh(bx(0.7, 0.03, 0.03), FM.brass, 0.4, 1.48, 0, 0, 0, (r - 0.5) * 0.4));
    for (const sx of [-0.33, 0.33]) g.add(mesh(cyl(0.13, 0.1, 0.03, 10), FM.brass, 0.4 + sx, 1.22, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(cyl(0.18, 0.2, 0.22, 8), FM.iron, -0.9 + i * 0.25, 0.11, 0.55));
    g.position.set(p.x + 0.5, 0, p.y + 0.5);
    return { g, lights: [] };
  },
  // the auction block: a dais behind the Lot-Caller, a lectern with the Book of Lots, the bidding bell, lots on hooks
  dg_fair_block(p) {
    const g = new THREE.Group(), L = [];
    const W = 8, D = 3.2, Hh = 0.9, z0 = -2.6;
    g.add(mesh(bx(W, Hh, D), FM.darkTimber, 0, Hh / 2, z0));
    g.add(mesh(bx(W + 0.2, 0.1, D + 0.2), FM.timber, 0, Hh + 0.05, z0));
    for (let i = 0; i < 3; i++) g.add(mesh(bx(3, 0.3 * (i + 1), 0.45), FM.timber, 0, 0.15 * (i + 1), z0 + D / 2 + 0.22 + (2 - i) * 0.45));
    stripes(g, W, 0.9, Hh - 0.2, 1.45, [FM.oxblood, FM.bone], z0 + D / 2 + 0.02);        // a striped skirt on the front
    // the lectern and the open Book of Lots
    g.add(mesh(bx(0.5, 1.3, 0.5), FM.timber, 0, Hh + 0.65, z0 - 0.6));
    g.add(mesh(bx(1.1, 0.08, 0.8), FM.timber, 0, Hh + 1.35, z0 - 0.55, -0.35));
    for (const sx of [-1, 1]) g.add(mesh(bx(0.5, 0.05, 0.66), FM.paper, sx * 0.27, Hh + 1.42, z0 - 0.53, -0.35, 0, sx * 0.08));
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) g.add(mesh(bx(0.36, 0.012, 0.02), FM.ink, sx * 0.27, Hh + 1.455 - i * 0.03, z0 - 0.7 + i * 0.085, -0.35));
    L.push({ pos: new THREE.Vector3(0, Hh + 2.0, z0 - 0.3), color: '#ffd08a', k: 1.0 });
    // the bidding bell on its frame
    const bxp = 3.0;
    for (const sx of [-0.7, 0.7]) g.add(mesh(bx(0.16, 3.2, 0.16), FM.darkTimber, bxp + sx, Hh + 1.6, z0 - 0.4));
    g.add(mesh(bx(1.7, 0.18, 0.2), FM.timber, bxp, Hh + 3.2, z0 - 0.4));
    g.add(mesh(cyl(0.22, 0.48, 0.7, 14), FM.brass, bxp, Hh + 2.7, z0 - 0.4));
    g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), FM.iron, bxp, Hh + 2.3, z0 - 0.4));
    // lots on hooks along the back rail, and two lanterns on poles
    g.add(mesh(bx(W - 1, 0.1, 0.1), FM.timber, 0, Hh + 2.4, z0 - D / 2 + 0.1));
    for (const sx of [-1, 1]) g.add(mesh(bx(0.12, 2.6, 0.12), FM.darkTimber, sx * (W / 2 - 0.5), Hh + 1.3, z0 - D / 2 + 0.1));
    tags(g, -1.9, Hh + 2.35, z0 - D / 2 + 0.16, 6, 0.3); tags(g, 1.4, Hh + 2.35, z0 - D / 2 + 0.16, 4, 0.8);
    for (const sx of [-1, 1]) L.push({ pos: lantern(g, sx * (W / 2 + 0.2), 2.4, z0 + D / 2), color: '#ffb35c', k: 1.1 });
    for (const sx of [-1, 1]) g.add(mesh(bx(0.1, 2.9, 0.1), FM.iron, sx * (W / 2 + 0.2), 1.3, z0 + D / 2 - 0.15));
    g.position.set(p.x + 0.5, 0, p.y + 0.5);
    return { g, lights: L.map((l) => ({ ...l, pos: l.pos.clone().add(g.position) })) };
  },
  // rows of plank benches for the bidders
  dg_fair_benches(p) {
    const g = new THREE.Group();
    for (let row = 0; row < 3; row++) {
      const z = row * 1.6;
      g.add(mesh(bx(6, 0.08, 0.4), FM.timber, 0, 0.48, z));
      for (const sx of [-2.6, 0, 2.6]) g.add(mesh(bx(0.08, 0.48, 0.34), FM.darkTimber, sx, 0.24, z));
    }
    g.position.set(p.x + 0.5, 0, p.y + 0.5);
    return { g, lights: [] };
  },
  // the Drove Gate inside wing 1: two great posts, a carved board, the striped pike bar down across the way
  dg_fair_arch(p) {
    const g = new THREE.Group(), L = [], W = 7.0;
    for (const sx of [-1, 1]) { g.add(mesh(bx(0.6, 5.0, 0.6), FM.darkTimber, sx * W / 2, 2.5, 0)); g.add(mesh(new THREE.ConeGeometry(0.42, 0.6, 4), FM.darkTimber, sx * W / 2, 5.3, 0, 0, Math.PI / 4, 0)); }
    g.add(mesh(bx(W + 1.2, 0.5, 0.5), FM.timber, 0, 4.5, 0));
    g.add(mesh(bx(4.2, 0.8, 0.12), FM.bone, 0, 3.85, 0.28));
    for (let i = 0; i < 3; i++) g.add(mesh(bx(3.2 - i * 0.6, 0.06, 0.02), FM.ink, 0, 4.05 - i * 0.18, 0.35));
    const n = 12;
    for (let i = 0; i < n; i++) g.add(mesh(bx(W / n, 0.22, 0.22), i % 2 ? FM.oxblood : FM.bone, -W / 2 + (i + 0.5) * W / n, 1.15, 0.45));
    for (const sx of [-1, 1]) L.push({ pos: lantern(g, sx * (W / 2 - 0.6), 3.6, 0.5), color: '#ffb35c', k: 1.2 });
    tags(g, 0, 4.25, 0.3, 7, 0.5);
    g.position.set(p.x + 0.5, 0, p.y + 1.0);
    return { g, lights: L.map((l) => ({ ...l, pos: l.pos.clone().add(g.position) })) };
  },
};

export const FAIR_IDS = Object.freeze(Object.keys(PROPS));
/** A dg_fair_* prop, or null for an id this module does not know. */
export function fairProp(p) { const f = PROPS[p.id || p.t]; return f ? f(p) : null; }

/** The Fair Gate on the world (local frame like dungeon3d stoneDoor: the opening along x, facing +z). */
export function fairGate(w) {
  const g = new THREE.Group(), L = [], W = Math.max(3, w) + 1.6;
  const hole = new THREE.Mesh(bx(W - 0.6, 3.3, 1.2), new THREE.MeshBasicMaterial({ color: '#06040a', name: 'fair_hole' })); hole.position.set(0, 1.65, -0.7); g.add(hole);
  for (const sx of [-1, 1]) {
    g.add(mesh(bx(0.7, 5.6, 0.7), FM.darkTimber, sx * W / 2, 2.8, 0));
    g.add(mesh(new THREE.ConeGeometry(0.5, 0.8, 4), FM.darkTimber, sx * W / 2, 6.0, 0, 0, Math.PI / 4, 0));
    g.add(mesh(bx(0.9, 0.5, 0.9), FM.timber, sx * W / 2, 0.25, 0));
    L.push({ pos: lantern(g, sx * (W / 2 + 0.55), 3.4, 0.35), color: '#ffb35c', k: 1.6 });
    g.add(mesh(bx(0.6, 0.06, 0.06), FM.iron, sx * (W / 2 + 0.3), 3.75, 0.35));
  }
  g.add(mesh(bx(W + 1.6, 0.6, 0.6), FM.timber, 0, 5.0, 0));
  g.add(mesh(bx(W - 0.6, 1.0, 0.14), FM.bone, 0, 4.15, 0.34));
  for (let i = 0; i < 3; i++) g.add(mesh(bx(W - 1.6 - i * 0.7, 0.08, 0.02), FM.ink, 0, 4.4 - i * 0.24, 0.42));
  // the bar, raised: it has not come down in a hundred years
  const n = 12, bar = new THREE.Group();
  for (let i = 0; i < n; i++) bar.add(mesh(bx(W / n, 0.24, 0.24), i % 2 ? FM.oxblood : FM.bone, (i + 0.5) * W / n, 0, 0));
  bar.position.set(-W / 2, 1.3, 0.6); bar.rotation.z = 1.25; g.add(bar);
  // drover bells and lot tags along the lintel
  for (let i = 0; i < 5; i++) { const x = -W / 2 + 0.6 + i * (W - 1.2) / 4; g.add(mesh(cyl(0.005, 0.005, 0.4, 3), FM.iron, x, 4.5, 0.38)); g.add(mesh(cyl(0.07, 0.16, 0.22, 8), FM.brass, x, 4.2, 0.38)); }
  tags(g, 0, 4.68, 0.4, 9, 0.6);
  // a stretch of the old striped awning still hanging off the north post
  stripes(g, 2.4, 1.2, 3.2, 0.5, [FM.oxblood, FM.bone], 1.0);
  return { g, lights: L };
}

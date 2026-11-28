// Caves, second look (polish lane 2026-11-22): the floor and the small things of a cave, all built in code, cheap enough
// for a phone. Called once per cave from dungeon3d.js dressPlace; the walls' own colouring lives there (caveTint).
//
//   dressCave(B, zone, plan) -> a THREE.Group holding the additive glows (fungus light pools); counts on userData
//
// What it adds, every piece placed by hashXY of its cell (the same cave always looks the same, no rng):
//   floor patches   soft darker and lighter blotches, damp stains and a little moss on the open floor (one lit,
//                   transparent mesh)
//   gravel          a few pebbles here and there (merged, one draw call)
//   stalagmites     short rock spikes in clusters of 1 to 3 against the back and side walls (never against a south wall,
//                   where they would stand between the camera and the hero)
//   glow fungus     small caps that glow teal at the foot of walls, with a soft pool of their light on the floor (an
//                   additive quad, no real light: phones get 2 lights)
//   puddles         dark, glossy pools in the middle of rooms
//                   (a zone's own `puddle: { color, opacity }` makes them a lit, matte pool of that colour instead:
//                   the Weir Works' silt water, cap 35; with no sky to mirror, the glossy black read as holes)
// Nothing lands on the doors, the lantern, the arrival, the chests or a cell the plan already dressed.
import * as THREE from '../vendor/three/three.module.min.js';
import { radial, softDot } from './textures.js';
import { cells, hashXY } from '../render/dungeon_plan.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    // lit (a patch in the dark stays dark), soft edged by the dot's alpha
    patch: std({ map: softDot(), vertexColors: true, transparent: true, depthWrite: false, opacity: 0.55, roughness: 1, name: 'cv_patch' }),
    rock: std({ color: '#6a5c4c', roughness: 1, flatShading: true, vertexColors: true, name: 'cv_rock' }),
    pebble: std({ color: '#5a5048', roughness: 1, flatShading: true, name: 'cv_pebble' }),
    stem: std({ color: '#b8c8b0', roughness: 0.8, name: 'cv_stem' }),
    cap: new THREE.MeshBasicMaterial({ color: '#5ff0d0', name: 'cv_glowcap' }),
    puddle: std({ color: '#0c1418', roughness: 0.04, metalness: 0.65, transparent: true, opacity: 0.88, depthWrite: false, name: 'cv_puddle' }),
    glow: new THREE.MeshBasicMaterial({ map: radial('rgba(120,255,220,1)', 'rgba(60,200,180,0.3)'), color: '#40e0c0', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, name: 'cv_glow' }),
  };
  return MATS;
}
const M4 = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

/** A short rock spike with its base a little darker (vertex colours: lit tips, dark roots). */
function spike(seed, h, r) {
  const g = new THREE.ConeGeometry(r, h, 6, 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < h / 2 - 0.01) { const k = 0.85 + hashXY(i, seed, 3) * 0.3; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * (0.85 + hashXY(seed, i, 4) * 0.3)); }
    const v = 0.55 + 0.45 * ((y + h / 2) / h);
    col.set([v, v * 0.95, v * 0.88], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function dressCave(B, zone, plan) {
  if (!zone || zone.kind !== 'cave') return null;
  const M = mats();
  const puddleMat = zone.puddle ? std({ color: zone.puddle.color || '#3e5450', roughness: 0.25, metalness: 0, transparent: true, opacity: zone.puddle.opacity || 0.6, depthWrite: false, map: softDot(), name: 'cv_puddle_silt' }) : M.puddle;
  const { W, H, solid, floor } = cells(zone);
  const key = (x, y) => `${x},${y}`;
  const keep = new Set();
  const near = (x, y, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) keep.add(key(x + i, y + j)); };
  for (const j of zone.joins || []) for (let i = 0; i < (j.w || 1); i++) for (let k = 0; k < (j.h || 1); k++) near(j.x + i, j.y + k, 2);
  for (const l of zone.lanterns || []) { near(l.x, l.y, 1); if (l.post) near(l.post[0], l.post[1], 1); }
  if (zone.arrival) near(zone.arrival[0], zone.arrival[1], 1);
  for (const c of (zone.dungeon && zone.dungeon.chests) || []) near(c.x, c.y, 1);
  for (const p of plan.props || []) keep.add(key(p.x, p.y + (p.face === 's' ? 1 : 0)));
  const free = (x, y) => floor(x, y) && !keep.has(key(x, y));
  const patchPos = [], patchUv = [], patchCol = [], glowPos = [], glowUv = [];
  const quad = (pos, uv, x, z, rx, rz, y, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = [[-rx, -rz], [rx, -rz], [rx, rz], [-rx, rz]].map(([a, b]) => [x + a * c - b * s, y, z + a * s + b * c]);
    for (const vi of [0, 3, 2, 0, 2, 1]) pos.push(...P[vi]);
    uv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
  };
  let spikes = 0, fungus = 0, puddles = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!floor(x, y)) continue;
    const cx = x + 0.5, cz = y + 0.5;
    // ---- floor patches: dark damp, pale dust, a little moss
    const h0 = hashXY(x, y, 101);
    if (h0 < 0.42) {
      const kind = hashXY(x, y, 102);
      const col = kind < 0.55 ? [0.2, 0.15, 0.11] : kind < 0.85 ? [0.5, 0.42, 0.33] : [0.26, 0.33, 0.17];
      const r = 0.55 + hashXY(x, y, 103) * 0.9;
      quad(patchPos, patchUv, cx + (hashXY(x, y, 104) - 0.5) * 0.6, cz + (hashXY(x, y, 105) - 0.5) * 0.6, r, r * (0.55 + hashXY(x, y, 106) * 0.45), 0.012 + h0 * 0.004, hashXY(x, y, 107) * 3.14);
      for (let i = 0; i < 6; i++) patchCol.push(...col);
    }
    if (!free(x, y)) continue;
    // ---- gravel
    if (hashXY(x, y, 111) < 0.14) {
      const n = 2 + Math.floor(hashXY(x, y, 112) * 4);
      for (let i = 0; i < n; i++) {
        const g = new THREE.DodecahedronGeometry(0.05 + hashXY(i, x, y) * 0.07, 0);
        B.mergeGeo(g, M.pebble, M4(x + 0.15 + hashXY(i, y, 113) * 0.7, 0.03, y + 0.15 + hashXY(x, i, 114) * 0.7, hashXY(i, 1, x) * 6.28, 1, 0.6, 1), false);
      }
    }
    // walls round this cell: n (back), e, w; never place tall things against a south wall
    const wn = solid(x, y - 1), we = solid(x + 1, y), ww = solid(x - 1, y), ws = solid(x, y + 1);
    const byWall = wn || we || ww;
    // ---- stalagmites against a back or side wall
    if (byWall && !ws && hashXY(x, y, 121) < 0.2) {
      const n = 1 + Math.floor(hashXY(x, y, 122) * 3);
      const ox = we ? 0.3 : ww ? -0.3 : 0, oz = wn ? -0.32 : 0;
      for (let i = 0; i < n; i++) {
        const h = 0.45 + hashXY(i, x, 123 + y) * (i ? 0.5 : 0.75), r = 0.12 + h * 0.16;
        const g = spike(x * 7 + y * 13 + i, h, r);
        B.mergeGeo(g, M.rock, M4(cx + ox + (hashXY(i, x, 124) - 0.5) * 0.45, h / 2, cz + oz + (hashXY(y, i, 125) - 0.5) * 0.35, hashXY(i, y, 126) * 6.28), false);
      }
      spikes++;
      continue;
    }
    // ---- glow fungus at the foot of a wall (and its light pool)
    if ((byWall || ws) && hashXY(x, y, 131) < 0.11) {
      const n = 3 + Math.floor(hashXY(x, y, 132) * 4);
      const ox = we ? 0.32 : ww ? -0.32 : 0, oz = wn ? -0.34 : ws ? 0.34 : 0;
      for (let i = 0; i < n; i++) {
        const px = cx + ox + (hashXY(i, x, 133) - 0.5) * 0.4, pz = cz + oz + (hashXY(y, i, 134) - 0.5) * 0.4;
        const sh = 0.06 + hashXY(i, y, 135) * 0.14, cr = 0.05 + hashXY(x, i, 136) * 0.06;
        B.mergeGeo(new THREE.CylinderGeometry(0.012, 0.018, sh, 4), M.stem, M4(px, sh / 2, pz), false);
        B.mergeGeo(new THREE.SphereGeometry(cr, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), M.cap, M4(px, sh, pz, 0, 1, 0.6, 1), false);
      }
      quad(glowPos, glowUv, cx + ox * 0.6, cz + oz * 0.6, 1.25, 1.25, 0.02, 0);
      fungus++;
      continue;
    }
    // ---- a puddle in the middle of a room (every neighbour open)
    let open = true;
    for (let j = -1; j <= 1 && open; j++) for (let i = -1; i <= 1; i++) if (!floor(x + i, y + j) || keep.has(key(x + i, y + j))) { open = false; break; }
    if (open && hashXY(x, y, 141) < 0.025) {
      const g = new THREE.CircleGeometry(0.5, 14);
      const p = g.attributes.position;
      for (let i = 1; i < p.count; i++) { const k = 0.75 + hashXY(i, x, y) * 0.4; p.setX(i, p.getX(i) * k); p.setY(i, p.getY(i) * k); }
      g.rotateX(-Math.PI / 2);
      B.mergeGeo(g, puddleMat, M4(cx, 0.016, cz, hashXY(x, y, 142) * 6.28, 1 + hashXY(x, y, 143) * 0.8, 1, 0.7 + hashXY(x, y, 144) * 0.4), false);
      puddles++;
    }
  }
  if (patchPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(patchPos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(patchUv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(patchCol, 3));
    B.mergeGeo(g, M.patch, new THREE.Matrix4(), false);
  }
  const out = new THREE.Group(); out.name = 'cv_glows';
  out.userData = { spikes, fungus, puddles };
  if (glowPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(glowUv, 2));
    const m = new THREE.Mesh(g, M.glow); m.renderOrder = 1; m.name = 'cv_glow';
    out.add(m);
  }
  return out;
}

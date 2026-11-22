// Dungeons and caves in 3D (render lane, dungeons build 2026-11-22): the wall kit, the camera-side wall cut, the dungeon
// and cave props, and the doors on the world. Called from zone3d.js buildZone; the renderer drives the cut (CUT).
//
//   await buildPlaceWalls(L, zone, B, plan)        walls with height where rock meets floor, corner and inner-corner
//                                                  pieces, wall ribs, dark rock tops, columns from the collision
//   await dressPlace(L, P, B, zone, plan, lamps)   the props of dungeon_plan.js (src/render), their torch lights; returns
//                                                  a mesh of warm floor glows under the fires (one draw call)
//   await buildDoorMouths(P, B, zone, lamps)       the world's dungeon and cave doors: a stone doorway in a mound, a rock
//                                                  arch, or a hole in the ground, with braziers where rock flanks it
//   CUT                                            uniforms: uCutOn (0 outside places), uCutZ (the hero's z), uLip
//
// The wall kit is built in code from the collision (no wall pieces on disk fit a 1 m grid and a 3 m storey): a straight
// panel (base plinth, textured face, cornice), an outer-corner pilaster, an inner-corner fillet and a rib every 4 m
// along long walls. Dungeons are dressed stone (the Village kit's uneven brick), caves rough rock (rock trim on a
// jittered surface, boulders at corners, a ragged top).
//
// The wall cut (the fix for the prototype's south walls hiding the room): the camera looks north from the south, so a
// wall south of the hero stands between them. Every wall, rock top and column south of the hero's feet is squashed down
// in the vertex shader to a low lip (uLip, 0.55 m) over about 1.6 m, so the rooms in front read as a floor plan with low
// walls (no stepped black blocks), and the hero's own room keeps its back wall at full height. Wall props (torches,
// niches, banners, roots) on a cut wall sink below the floor with it. The renderer moves uCutZ with the hero every frame,
// so walls rise and fall smoothly as you walk. The existing see-through dither (zone3d.js SEE) still thins anything
// left between the camera and the hero.
import * as THREE from '../vendor/three/three.module.min.js';
import { radial } from './textures.js';
import { cells, doorMouths, hashXY, DG_WALL } from '../render/dungeon_plan.js';

export const LIP = 0.55;
export const CUT = { uCutZ: { value: 0 }, uCutOn: { value: 0 }, uLip: { value: LIP } };
const CUT_BAND = 1.6;     // m over which a wall south of the hero goes from full height to the lip

const patched = new WeakSet();
/** mode 'squash': a wall (merged, world-space geometry) drops to the lip south of the hero; 'hide': a wall piece sinks. */
export function cutMat(mat, mode) {
  if (patched.has(mat)) return mat;
  patched.add(mat);
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, CUT);
    if (sh.vertexShader.includes('lrCutK')) return;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uCutZ; uniform float uCutOn; uniform float uLip;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec4 lrCw = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        lrCw = instanceMatrix * lrCw;
      #endif
        lrCw = modelMatrix * lrCw;
        float lrCutK = uCutOn * smoothstep(uCutZ, uCutZ + ${CUT_BAND.toFixed(2)}, lrCw.z);
        ${mode === 'squash' ? 'transformed.y = mix(transformed.y, min(transformed.y, uLip), lrCutK);' : 'transformed.y -= lrCutK * 8.0;'} }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + `|lr_cut_${mode}`;
  mat.needsUpdate = true;
  return mat;
}

const std = (o) => new THREE.MeshStandardMaterial(o);
// floor props (never cut) and world door pieces
const DM = {
  iron: std({ color: '#2a2420', roughness: 0.5, metalness: 0.7, name: 'dg_iron' }),
  stone: std({ color: '#7a7268', roughness: 0.95, flatShading: true, name: 'dg_stone' }),
  darkStone: std({ color: '#3a3530', roughness: 0.95, flatShading: true, name: 'dg_darkstone' }),
  bone: std({ color: '#d8cfb8', roughness: 0.8, name: 'dg_bone' }),
  wood: std({ color: '#4a3220', roughness: 0.85, name: 'dg_wood' }),
  coal: std({ color: '#2a1008', emissive: '#ff5a10', emissiveIntensity: 1.6, roughness: 1, name: 'dg_coal' }),
  flame: new THREE.MeshBasicMaterial({ color: '#ffc060', name: 'dg_flame' }),
  hole: new THREE.MeshBasicMaterial({ color: '#030204', name: 'dg_hole' }),
  turf: std({ color: '#3a4a26', roughness: 1, flatShading: true, name: 'dg_turf' }),
  rock: std({ color: '#5e564c', roughness: 1, flatShading: true, name: 'dg_rock' }),
  eye: new THREE.MeshBasicMaterial({ color: '#0a0806', name: 'dg_eye' }),
  cloth: std({ color: '#5a1c18', roughness: 0.9, side: THREE.DoubleSide, name: 'dg_cloth' }),
};
// wall-mounted pieces: they sink with a cut wall
const WM = {
  iron: cutMat(DM.iron.clone(), 'hide'), flame: cutMat(DM.flame.clone(), 'hide'), coal: cutMat(DM.coal.clone(), 'hide'),
  wood: cutMat(DM.wood.clone(), 'hide'), stone: cutMat(DM.stone.clone(), 'hide'), hole: cutMat(DM.hole.clone(), 'hide'),
  cloth: cutMat(DM.cloth.clone(), 'hide'), bone: cutMat(DM.bone.clone(), 'hide'),
  root: cutMat(std({ color: '#3a2a1c', roughness: 1, name: 'dg_root' }), 'hide'),
};
const M4 = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

// ---------------------------------------------------------------- the wall kit
let kitP = null;
function kitMats(L) {
  if (kitP) return kitP;
  const rep = (t) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true; return c; };
  kitP = Promise.all([L.tex('tex/T_UnevenBrick_BaseColor.jpg'), L.tex('tex/T_UnevenBrick_Normal.jpg', false), L.tex('tex/Rocks_Diffuse.jpg')])
    .then(([bc, bn, rc]) => ({
      brick: cutMat(std({ map: rep(bc), normalMap: rep(bn), color: '#9a9088', roughness: 0.92, vertexColors: true, name: 'dg_brick' }), 'squash'),
      trim: cutMat(std({ map: rep(bc), normalMap: rep(bn), color: '#5e5650', roughness: 0.95, name: 'dg_trim' }), 'squash'),
      rock: cutMat(std({ map: rep(rc), color: '#a08c74', roughness: 1, vertexColors: true, flatShading: true, name: 'dg_cave' }), 'squash'),
      cap: cutMat(std({ color: '#0e0c0b', roughness: 1, name: 'dg_cap' }), 'squash'),
      column: cutMat(std({ color: '#7a7268', roughness: 0.95, flatShading: true, name: 'dg_column' }), 'squash'),
    }));
  return kitP;
}

/** Quads collected per material, merged into the batcher as world-space geometry (one draw call per material per chunk). */
function quadSink() {
  const acc = new Map();
  return {
    quad(mat, P, n, U, C) { if (!acc.has(mat)) acc.set(mat, []); acc.get(mat).push({ P, n, U, C }); },
    flush(B) {
      const ident = new THREE.Matrix4();
      for (const [mat, qs] of acc) {
        const n = qs.length, pos = new Float32Array(n * 18), nor = new Float32Array(n * 18), uv = new Float32Array(n * 12), col = new Float32Array(n * 18);
        qs.forEach((q, i) => {
          [0, 1, 2, 0, 2, 3].forEach((vi, j) => {
            pos.set(q.P[vi], i * 18 + j * 3); nor.set(q.n, i * 18 + j * 3); uv.set(q.U[vi], i * 12 + j * 2);
            col.set(q.C ? q.C[vi] : [1, 1, 1], i * 18 + j * 3);
          });
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        if (mat.flatShading) g.computeVertexNormals();
        B.mergeGeo(g, mat, ident, false);
      }
    },
  };
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function putBox(B, mat, x, y, z, w, h, d, ry = 0) { const g = box(w, h, d); B.mergeGeo(g, mat, M4(x, y, z, ry), false); }

/** A jittered rock lump (code-built, deterministic): caves' corner boulders, stalagmites, the cave mouths. */
function lump(seed, r = 0.6, squash = 0.8) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hashXY(Math.round(x * 40), Math.round(y * 40) + Math.round(z * 40) * 7, seed) - 0.5) * 0.45;
    p.setXYZ(i, x * k, Math.max(-r * 0.2, y * k * squash), z * k);
  }
  g.computeVertexNormals();
  return g;
}

export async function buildPlaceWalls(L, zone, B, plan) {
  const M = await kitMats(L);
  const cave = zone.kind === 'cave';
  const FULL = cave ? 3.2 : 3.0;
  const { W, H, solid: rock } = cells(zone);
  const solid = (x, y) => rock(x, y) && !plan.skip.has(`${x},${y}`);
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const Q = quadSink();
  // rock top height at a grid point (caves: ragged; dungeons: level)
  const hTop = (i, j) => (cave ? FULL + (hashXY(i, j, 77) - 0.5) * 0.9 : FULL);
  // caves: every wall vertex moves by a function of its own position only, so faces meeting at a corner never crack
  const jit = (x, y, z) => {
    if (!cave || y <= 0.01) return [x, y, z];
    const kx = Math.round(x * 8), ky = Math.round(y * 8), kz = Math.round(z * 8);
    return [x + (hashXY(kx, kz, ky + 3) - 0.5) * 0.5, y, z + (hashXY(kz, kx, ky + 9) - 0.5) * 0.5];
  };
  const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  // ---- faces
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!solid(x, y)) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny) || solid(nx, ny)) continue;
      // the edge between this rock cell and the open cell, a -> b with the open side on the right of a -> b seen from above
      let a, b, n;
      if (dy === 1) { a = [x, y + 1]; b = [x + 1, y + 1]; n = [0, 0, 1]; }
      else if (dy === -1) { a = [x + 1, y]; b = [x, y]; n = [0, 0, -1]; }
      else if (dx === 1) { a = [x + 1, y + 1]; b = [x + 1, y]; n = [1, 0, 0]; }
      else { a = [x, y]; b = [x, y + 1]; n = [-1, 0, 0]; }
      const along = (p) => (dy !== 0 ? p[0] : p[1]) * 0.5;
      const ta = hTop(a[0], a[1]), tb = hTop(b[0], b[1]);
      if (!cave) {
        // two bands (floor to lip, lip to top) so a cut wall keeps its true texture on the lip
        for (const [y0, y1] of [[0, LIP], [LIP, FULL]]) {
          const c0 = y0 <= 0.01 ? 0.5 : 0.95, c1 = y1 >= FULL - 0.01 ? 0.78 : 0.95;
          Q.quad(M.brick, [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], n,
            [[along(a), y0 * 0.5], [along(b), y0 * 0.5], [along(b), y1 * 0.5], [along(a), y1 * 0.5]], [c0, c0, c1, c1].map((v) => [v, v * 0.97, v * 0.93]));
        }
        // base plinth and cornice, a little proud of the face
        const mx = (a[0] + b[0]) / 2 + n[0] * 0.04, mz = (a[1] + b[1]) / 2 + n[2] * 0.04, ry = dy !== 0 ? 0 : Math.PI / 2;
        putBox(B, M.trim, mx, 0.11, mz, 1.0, 0.22, 0.1, ry);
        putBox(B, M.trim, (a[0] + b[0]) / 2 + n[0] * 0.05, FULL - 0.08, (a[1] + b[1]) / 2 + n[2] * 0.05, 1.0, 0.16, 0.14, ry);
      } else {
        // a ragged rock face: 2 x 3 quads, every vertex jittered by its own position
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], tm = (ta + tb) / 2 + (hashXY(m[0] * 2, m[1] * 2, 5) - 0.5) * 0.5;
        const cols = [[a, ta], [m, tm], [b, tb]];
        for (let i = 0; i < 2; i++) {
          const [p0, t0] = cols[i], [p1, t1] = cols[i + 1];
          const rows0 = [0, LIP, LIP + (t0 - LIP) * 0.55, t0], rows1 = [0, LIP, LIP + (t1 - LIP) * 0.55, t1];
          for (let k = 0; k < 3; k++) {
            const P = [jit(p0[0], rows0[k], p0[1]), jit(p1[0], rows1[k], p1[1]), jit(p1[0], rows1[k + 1], p1[1]), jit(p0[0], rows0[k + 1], p0[1])];
            const sh = (v) => (v <= 0.01 ? 0.45 : 0.75 + 0.25 * Math.min(1, v / 2));
            Q.quad(M.rock, P, n, [[along(p0), rows0[k] * 0.5], [along(p1), rows1[k] * 0.5], [along(p1), rows1[k + 1] * 0.5], [along(p0), rows0[k + 1] * 0.5]],
              [sh(rows0[k]), sh(rows1[k]), sh(rows1[k + 1]), sh(rows0[k + 1])].map((v) => [v, v * 0.95, v * 0.88]));
          }
        }
      }
    }
  }
  // ---- corners and ribs at the grid points (i, j): the four cells round a point say what stands there
  for (let j = 1; j < H; j++) for (let i = 1; i < W; i++) {
    const s = [solid(i - 1, j - 1), solid(i, j - 1), solid(i - 1, j), solid(i, j)];
    const n = s.filter(Boolean).length;
    if (n === 0 || n === 4) continue;
    const diag = n === 2 && s[0] === s[3];
    const top = hTop(i, j);
    if (n === 1 || diag) {
      // an outer corner (rock juts into the room): a pilaster, or a boulder in a cave
      if (!cave) { putBox(B, M.trim, i, FULL / 2, j, 0.4, FULL + 0.04, 0.4); putBox(B, M.trim, i, 0.14, j, 0.5, 0.28, 0.5); }
      else { const g = lump(i * 31 + j, 0.55 + hashXY(i, j, 3) * 0.35, 1.6); B.mergeGeo(g, M.rock, M4(i, 0.35 + hashXY(i, j, 4) * 0.4, j, hashXY(i, j, 5) * 6.28), false); }
    } else if (n === 3) {
      // an inner corner: a fillet column half in the walls
      if (!cave) putBox(B, M.trim, i, FULL / 2, j, 0.3, FULL, 0.3, Math.PI / 4);
    } else if (!cave && n === 2) {
      // a straight wall point: a rib every 4 m along a long run (both neighbours along the wall are wall too)
      const vertical = s[0] === s[2];      // the rock is on one side of a north-south line
      const k = vertical ? j : i;
      if (k % 4 !== 0) continue;
      const ok = vertical ? (solid(i - 1, j - 2) === s[0] && solid(i - 1, j + 1) === s[2] && solid(i, j - 2) === s[1] && solid(i, j + 1) === s[3])
        : (solid(i - 2, j - 1) === s[0] && solid(i + 1, j - 1) === s[1] && solid(i - 2, j) === s[2] && solid(i + 1, j) === s[3]);
      if (!ok) continue;
      // the rib stands on the open side of the wall
      const ox = vertical ? (s[0] ? 0.08 : -0.08) : 0, oz = vertical ? 0 : (s[0] ? 0.08 : -0.08);
      putBox(B, M.trim, i + ox, top / 2, j + oz, vertical ? 0.16 : 0.32, top, vertical ? 0.32 : 0.16);
    }
  }
  // ---- rock tops (dark: underground there is no sky), only near open cells (the rest is the black background)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!solid(x, y)) continue;
    let near = false;
    for (let j = -2; j <= 2 && !near; j++) for (let i = -2; i <= 2; i++) if (inb(x + i, y + j) && !rock(x + i, y + j)) { near = true; break; }
    if (!near) continue;
    const P = [jit(x, hTop(x, y + 1), y + 1), jit(x + 1, hTop(x + 1, y + 1), y + 1), jit(x + 1, hTop(x + 1, y), y), jit(x, hTop(x, y), y)];
    Q.quad(M.cap, P, [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], null);
  }
  Q.flush(B);
  // ---- columns: a lone rock cell (dressed column, or a stalagmite in a cave)
  for (const [x, y] of plan.columns) column(B, M, x + 0.5, y + 0.5, cave, hashXY(x, y, 9));
  for (const p of plan.props) if (p.t === 'dg_column' || p.t === 'dg_stalagmite') column(B, M, p.x + 0.5, p.y + 0.5, cave || p.t === 'dg_stalagmite', p.r);
}

function column(B, M, x, z, cave, r) {
  if (cave) { const g = new THREE.ConeGeometry(0.5, 2.6 + r, 7, 3); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (0.85 + hashXY(i, 3, r * 100) * 0.3)); g.computeVertexNormals(); B.mergeGeo(g, M.rock, M4(x, 1.3 + r / 2, z, r * 6), false); return; }
  B.mergeGeo(box(0.95, 0.35, 0.95), M.trim, M4(x, 0.17, z), false);
  B.mergeGeo(new THREE.CylinderGeometry(0.33, 0.38, 2.3, 12), M.column, M4(x, 1.5, z), false);
  B.mergeGeo(box(0.9, 0.3, 0.9), M.trim, M4(x, 2.8, z), false);
}

// ---------------------------------------------------------------- props
const flame = (g, mats, x, y, z, s = 1) => {
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.28 * s, 6), mats.flame); f.position.set(x, y, z); g.add(f);
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 6, 4), mats.coal); c.position.set(x, y - 0.1 * s, z); g.add(c);
};
export function brazier(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.9, 5), DM.iron); l.position.set(Math.cos(a) * 0.22, 0.42, Math.sin(a) * 0.22); l.rotation.z = Math.cos(a) * 0.18; l.rotation.x = -Math.sin(a) * 0.18; g.add(l); }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.3, 10, 1, true), DM.iron); bowl.position.y = 0.95; g.add(bowl);
  const bot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), DM.iron); bot.rotation.x = -Math.PI / 2; bot.position.y = 0.81; g.add(bot);
  const coals = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), DM.coal); coals.scale.y = 0.35; coals.position.y = 1.0; g.add(coals);
  for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.1 + (i % 2) * 0.04, 0.45 + (i % 3) * 0.15, 6), DM.flame); const a = i * 1.3; f.position.set(Math.cos(a) * 0.12 * (i ? 1 : 0), 1.25 + (i % 3) * 0.05, Math.sin(a) * 0.12 * (i ? 1 : 0)); g.add(f); }
  return { g, light: new THREE.Vector3(x, 1.45 * s, z) };
}
function campfire(x, z, r) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), DM.darkStone); s.position.set(Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.45); g.add(s); }
  for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5), DM.wood); l.rotation.set(Math.PI / 2, i * 1.05 + r, 0.3); l.position.y = 0.12; g.add(l); }
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), DM.coal); c.scale.y = 0.4; g.add(c);
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5 + i * 0.12, 6), DM.flame); f.position.set((i - 1) * 0.08, 0.32 + i * 0.05, (i % 2) * 0.06); g.add(f); }
  return { g, light: new THREE.Vector3(x, 0.9, z) };
}
function skull(mats, x, z, y, r) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = r * 4;
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mats.bone); c.scale.set(1, 0.9, 1.15); c.position.y = 0.09; g.add(c);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.1), mats.bone); jaw.position.set(0, 0.02, 0.06); g.add(jaw);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), DM.eye); e.position.set(sx * 0.045, 0.1, 0.11); g.add(e); }
  return g;
}
function bones(x, z, r) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r * 6.28;
  const n = 3 + Math.floor(r * 4);
  for (let i = 0; i < n; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32 + hashXY(i, n) * 0.2, 5), DM.bone); b.rotation.z = Math.PI / 2; b.rotation.y = hashXY(i, 3) * 6.28; b.position.set((hashXY(i, 5) - 0.5) * 0.6, 0.03, (hashXY(i, 7) - 0.5) * 0.6); g.add(b); }
  if (r > 0.35) g.add(skull(DM, 0.1, 0.08, 0.0, r));
  return g;
}
function skullPile(x, z, r) { const g = new THREE.Group(); g.position.set(x, 0, z); for (let i = 0; i < 5; i++) g.add(skull(DM, (hashXY(i, 1) - 0.5) * 0.4, (hashXY(i, 2) - 0.5) * 0.3, i < 3 ? 0 : 0.14, r + i)); return g; }
function rubble(x, z, r) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  for (let i = 0; i < 3 + Math.floor(r * 3); i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08 + hashXY(i, 4, r * 50) * 0.12, 0), i % 2 ? DM.stone : DM.darkStone); s.position.set((hashXY(i, 1, r * 50) - 0.5) * 0.7, 0.06, (hashXY(i, 2, r * 50) - 0.5) * 0.7); s.rotation.set(i, i * 2, 0); g.add(s); }
  return g;
}
/** A wall piece's frame: on the face of wall cell (x, y) toward the floor; local +z points into the room. */
function wallFrame(p) {
  const face = p.face || 's';
  if (face === 'e') return { x: p.x + 1, z: p.y + 0.5, ry: Math.PI / 2 };
  if (face === 'w') return { x: p.x, z: p.y + 0.5, ry: -Math.PI / 2 };
  if (face === 'n') return { x: p.x + 0.5, z: p.y, ry: Math.PI };
  return { x: p.x + 0.5, z: p.y + 1, ry: 0 };
}
function wallGroup(p) { const f = wallFrame(p); const g = new THREE.Group(); g.position.set(f.x, 0, f.z); g.rotation.y = f.ry; return { g, f }; }
const toWorld = (f, lx, ly, lz) => new THREE.Vector3(f.x + Math.sin(f.ry) * lz + Math.cos(f.ry) * lx, ly, f.z + Math.cos(f.ry) * lz - Math.sin(f.ry) * lx);

export async function dressPlace(L, P, B, zone, plan, lamps) {
  const cave = zone.kind === 'cave';
  const fires = [];
  const place = async (url, x, z, { h = null, ry = 0, tint = null, y = 0 } = {}) => {
    const pr = await P(url);
    const bh = Math.max(0.05, pr.box.max.y - pr.box.min.y), k = h ? h / bh : 1;
    B.instance(pr, M4(x, y - pr.box.min.y * k, z, ry, k), { tint });
  };
  const jobs = [];
  for (const p of plan.props) {
    const r = p.r, cx = p.x + 0.5, cz = p.y + 0.5;
    if (p.t === 'dg_torch') {
      const { g, f } = wallGroup(p);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 0.05), WM.iron); plate.position.set(0, 1.85, 0.03); g.add(plate);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.26), WM.iron); arm.position.set(0, 1.8, 0.15); g.add(arm);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.14, 7), WM.iron); cup.position.set(0, 1.95, 0.28); g.add(cup);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.45, 5), WM.wood); stick.position.set(0, 1.85, 0.28); stick.rotation.x = 0.25; g.add(stick);
      flame(g, WM, 0, 2.15, 0.3, 1.4);
      B.mergeGroup(g);
      const lp = toWorld(f, 0, 2.2, 0.6);
      lamps.push({ pos: lp, color: '#ff9a48', k: cave ? 1.5 : 1.7, fire: true, wall: true }); fires.push(toWorld(f, 0, 0, 1.2));
    } else if (p.t === 'dg_brazier') {
      const b = cave ? campfire(cx, cz, r) : brazier(cx, cz, 1); B.mergeGroup(b.g);
      lamps.push({ pos: b.light, color: '#ffa050', k: 1.7, fire: true }); fires.push(new THREE.Vector3(cx, 0, cz));
    } else if (p.t === 'dg_niche') {
      const { g } = wallGroup(p);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.04), WM.hole); back.position.set(0, 0.95, 0.03); g.add(back);
      for (const sx of [-1, 1]) { const q = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.55, 0.18), WM.stone); q.position.set(sx * 0.48, 0.78, 0.08); g.add(q); }
      const lin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.24), WM.stone); lin.position.set(0, 1.64, 0.1); g.add(lin);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.3), WM.stone); sill.position.set(0, 0.32, 0.12); g.add(sill);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.85, 0.12), WM.wood); lid.position.set(0, 0.88, 0.1); lid.rotation.z = (r - 0.5) * 0.15; g.add(lid);
      if (r > 0.5) { const s = skull(WM, 0.22, 0.24, 0.42, r); s.scale.setScalar(0.8); g.add(s); }
      B.mergeGroup(g);
    } else if (p.t === 'dg_banner') {
      const { g } = wallGroup(p);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5), WM.iron); rod.rotation.z = Math.PI / 2; rod.position.set(0, 2.55, 0.08); g.add(rod);
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.7, 1, 3), WM.cloth); cl.position.set(0, 1.68, 0.09); g.add(cl);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 3), WM.cloth); tip.rotation.z = Math.PI; tip.scale.z = 0.05; tip.position.set(0, 0.7, 0.09); g.add(tip);
      B.mergeGroup(g);
    } else if (p.t === 'dg_roots') {
      const { g } = wallGroup(p);
      const n = 2 + Math.floor(r * 3);
      for (let i = 0; i < n; i++) {
        const ox = (hashXY(i, 9, r * 100) - 0.5) * 0.9, len = 0.9 + hashXY(i, 11, r * 100) * 1.3, bend = (hashXY(i, 13) - 0.5) * 0.5;
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(ox, 3.1, 0.0), new THREE.Vector3(ox + bend * 0.5, 3.1 - len * 0.4, 0.15), new THREE.Vector3(ox + bend, 3.1 - len, 0.25)]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 6, 0.035 + hashXY(i, 15) * 0.03, 5), WM.root));
      }
      B.mergeGroup(g);
    } else if (p.t === 'dg_bier') {
      const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = r > 0.5 ? Math.PI / 2 : 0;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 1.7), DM.stone); b.position.y = 0.3; g.add(b);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 1.8), DM.darkStone); top.position.y = 0.65; g.add(top);
      const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 4, 8), DM.darkStone); fig.rotation.x = Math.PI / 2; fig.position.y = 0.82; fig.scale.set(1.1, 1, 0.6); g.add(fig);
      B.mergeGroup(g);
    } else if (p.t === 'dg_bones') B.mergeGroup(bones(cx + (r - 0.5) * 0.4, cz + (hashXY(p.x, p.y, 4) - 0.5) * 0.4, r));
    else if (p.t === 'dg_skulls') B.mergeGroup(skullPile(cx, cz, r));
    else if (p.t === 'dg_rubble') B.mergeGroup(rubble(cx, cz, r));
    else if (p.t === 'dg_urn') { const u = ['dungeon/Vase_2.gltf', 'dungeon/Vase_4.gltf', 'dungeon/Vase_2.gltf', 'dungeon/Vase_Rubble_Medium.gltf'][Math.floor(r * 4) % 4]; jobs.push(place(u, cx + (r - 0.5) * 0.3, cz, { h: /Rubble/.test(u) ? 0.3 : 0.55 + r * 0.3, ry: r * 6.28, tint: '#8a8078' })); }
    else if (p.t === 'dg_candles') { jobs.push(place(r < 0.5 ? 'dungeon/CandleStick_Triple.gltf' : 'dungeon/CandleStick_Stand.gltf', cx, cz, { h: r < 0.5 ? 0.5 : 1.3, ry: r * 6 })); lamps.push({ pos: new THREE.Vector3(cx, r < 0.5 ? 0.6 : 1.4, cz), color: '#ffc070', k: 0.5 }); }
    else if (p.t === 'dg_coins') jobs.push(place(r < 0.5 ? 'dungeon/Coin_Pile.gltf' : 'dungeon/Coin_Pile_2.gltf', cx, cz, { h: 0.3, ry: r * 6 }));
    else if (p.t === 'dg_chain') jobs.push(place('dungeon/Chain_Coil.gltf', cx, cz, { h: 0.2, ry: r * 6 }));
    else if (p.t === 'dg_cage') jobs.push(place('dungeon/Cage_Small.gltf', cx, cz, { h: 1.2, ry: 0.4 }));
    else if (p.t === 'dg_mushrooms') {
      for (let i = 0; i < 2 + Math.floor(r * 3); i++) jobs.push(place(i % 3 === 2 ? 'cave/Mushroom_Laetiporus.gltf' : 'cave/Mushroom_Common.gltf', cx + (hashXY(i, 1, p.x) - 0.5) * 0.7, cz + (hashXY(i, 2, p.y) - 0.5) * 0.7, { h: 0.18 + hashXY(i, 3, p.x) * 0.25, ry: hashXY(i, 4) * 6 }));
    } else if (p.t === 'dg_column' || p.t === 'dg_stalagmite') { /* built with the walls */ }
    else B.mergeGroup(rubble(cx, cz, r));     // an id this renderer does not know yet: a little rubble, never a crash
  }
  await Promise.all(jobs);
  // warm pools of light on the floor under every fire: one additive mesh (also the light on phones, which get 2 lights)
  if (!fires.length) return null;
  const R = 2.6, pos = [], uv = [];
  for (const f of fires) {
    const x0 = f.x - R, x1 = f.x + R, z0 = f.z - R, z1 = f.z + R, y = 0.03;
    pos.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = new THREE.MeshBasicMaterial({ map: radial('rgba(255,190,120,1)', 'rgba(255,140,60,0.3)'), color: '#ff9a50', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 1; m.name = 'dg_glow';
  return m;
}

// ---------------------------------------------------------------- the doors on the world
function stoneDoor(w) {
  const g = new THREE.Group();
  const R = w / 2 + 1.0;
  const mound = new THREE.Mesh(new THREE.SphereGeometry(R, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), DM.turf); mound.scale.set(1, 0.7, 0.75); mound.position.z = -R * 0.75 + 0.2; g.add(mound);
  // the way in: a black recess going back under the mound (reads as a dark doorway from the camera's angle too)
  const hole = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 2.05, 1.6), DM.hole); hole.position.set(0, 1.02, -0.72); g.add(hole);
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.6), DM.stone); p.position.set(sx * (w / 2 + 0.05), 1.1, 0.02); p.rotation.y = sx * 0.04; g.add(p); }
  const lin = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, 0.5, 0.75), DM.stone); lin.position.set(0, 2.42, 0.04); lin.rotation.z = 0.02; g.add(lin);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.25, 0.6), DM.darkStone); cap.position.set(0, 2.78, -0.05); g.add(cap);
  const step = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.6), DM.darkStone); step.position.set(0, 0.06, 0.32); g.add(step);
  return g;
}
function caveArch(w, seed) {
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(w / 2 + 0.2, 12, 0, Math.PI), DM.hole); hole.position.set(0, 0, 0.05); hole.scale.y = 1.5; g.add(hole);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (i / (n - 1));
    const r = w / 2 + 0.55;
    const m = new THREE.Mesh(lump(seed + i, 0.55 + hashXY(i, seed) * 0.3, 1.0), DM.rock);
    m.position.set(Math.cos(a) * r, Math.sin(a) * r * 1.4 + 0.15, -0.05); g.add(m);
  }
  const back = new THREE.Mesh(lump(seed + 20, w / 2 + 1.2, 0.7), DM.rock); back.position.set(0, 0.4, -1.2); g.add(back);
  return g;
}
function caveHole(w, seed) {
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(w / 2 + 0.35, 14).rotateX(-Math.PI / 2), DM.hole); hole.position.set(0, 0.03, -0.5); hole.scale.z = 0.8; g.add(hole);
  for (let i = 0; i < 6; i++) { const a = Math.PI * (0.1 + 0.8 * (i / 5)) + Math.PI; const m = new THREE.Mesh(lump(seed + i, 0.45 + hashXY(i, seed) * 0.25, 0.8), DM.rock); m.position.set(Math.cos(a) * (w / 2 + 0.6), 0.15, -0.5 - Math.sin(a) * (w / 2 + 0.4) * 0.8); g.add(m); }
  return g;
}

export async function buildDoorMouths(P, B, zone, lamps) {
  const { solid } = cells(zone);
  for (const d of doorMouths(zone)) {
    const along = d.face === 's' || d.face === 'n' ? d.w : d.h;
    let f;
    if (d.face === 'w') f = { x: d.x + d.w, z: d.y + d.h / 2, ry: -Math.PI / 2 };
    else if (d.face === 'e') f = { x: d.x, z: d.y + d.h / 2, ry: Math.PI / 2 };
    else if (d.face === 'n') f = { x: d.x + d.w / 2, z: d.y + d.h, ry: Math.PI };
    else f = { x: d.x + d.w / 2, z: d.y, ry: 0 };
    const seed = d.x * 7 + d.y;
    const g = d.kind === 'cave' ? (d.face === 'n' ? caveHole(along, seed) : caveArch(along, seed)) : stoneDoor(along);
    g.position.set(f.x, 0, f.z); g.rotation.y = f.ry;
    B.mergeGroup(g);
    // braziers either side of a dungeon door, where rock flanks it (never on the path)
    if (d.kind !== 'cave') {
      for (const sx of [-1, 1]) {
        const p = toWorld(f, sx * (along / 2 + 0.75), 0, 0.55);
        if (!solid(Math.floor(p.x), Math.floor(p.z)) && !solid(Math.floor(p.x), Math.floor(p.z) - 1)) continue;
        const b = brazier(p.x, p.z, 0.85); B.mergeGroup(b.g);
        lamps.push({ pos: b.light, color: '#ffa050', k: 1.4, fire: true });
      }
    }
  }
}

/** Does a world door cover this tile (the closed barrow decor is replaced by the open door there)? */
export function doorAt(zone, x0, y0, w = 1, h = 1) {
  return ((zone && zone.doors) || []).some((d) => x0 < d.x + (d.w || 1) + 1 && x0 + w > d.x - 1 && y0 < d.y + (d.h || 1) + 1 && y0 + h > d.y - 1);
}

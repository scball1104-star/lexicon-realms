// Town life (wave 7, plan item 12 "World life pass", 2026-11-24): townsfolk with day and night routines, crowds round
// the squares, critters, and showers that send people indoors. The three.js half; the plans are pure in townlife_plan.js.
//
//   const life = createTownLife(THREE, scene, { quality, tilesDb, q })     null when ?life=off
//   life.frame({ zone, kit, snap, f, rain, now, dt, focus, lamps })        once a frame after actors.sync; returns dev stats
//   life.mesh / life.critterMesh                                           the two instanced meshes (one draw call each,
//                                                                          plus one in the shadow pass for the folk on desktop)
//
// Cosmetic only, like the grass: townsfolk and critters are not sim entities. No collision, no clicks, no network, no
// save, and the sim and co-op are untouched. Each person's walk is a pure function of the render clock (loopPose), so a
// still with a pinned clock is the same every run. What is kept between frames is only the going in and coming out of
// doors when the day turns to night or a shower starts (and back), and the pigeons taking off when someone walks into
// their flock. The first frame in a town (or after a jump in the time of day) puts everyone straight where they belong.
//
// Bodies are code-built (about 600 triangles a person, 150 a critter). Every person is one instance of one mesh: the
// arm and leg swing, the bob, the clothes, hats, hoods, cloaks, baskets and lanterns are chosen per instance in the
// vertex shader (an option bit per part; a part not worn collapses to a point). Colours come per instance too.
// Low quality and phones: 12 people and 6 critters a town, no shadow pass (townlife_plan.js lifeCaps).
import { groundY } from './ground_plan.js';
import { critterOut, CRIT, lifeCaps, lifeTowns, loopPose, OPT, planTown, pointAt, STRIDE, wantOut } from './townlife_plan.js';

const REACH = 70;          // m: a town's life is planned and shown once the view's focus is this near its area
const GO_SPEED = 1.5;      // m/s walking home (x1.4 in rain: they hurry)
const MAKE_WAY = 0.9;      // m: townsfolk step aside from heroes and NPCs this near
const JUMP_F = 0.03;       // a day-fraction jump larger than this (a pinned ?tod, a long pause) snaps everyone in place

// ---------------------------------------------------------------- geometry
function merge(THREE, parts, extra) {
  // indexed primitive geometries (already transformed) into one BufferGeometry with constant per-part attributes
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.g.attributes.position.count; ni += p.g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  const ex = Object.fromEntries(extra.map((k) => [k, new Float32Array(nv)]));
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.g, n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    for (const k of extra) ex[k].fill(p[k] || 0, vo, vo + n);
    vo += n; io += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  for (const k of extra) out.setAttribute(k, new THREE.BufferAttribute(ex[k], 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
const put = (g, [x, y, z], [rx, ry, rz] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) => { g.scale(sx, sy, sz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };

// colour slots: 0 skin, 1 cloth, 2 cloth2 (trousers, hat), 3 hair, 4 leather, 5 linen, 6 wicker, 7 lantern glow
function folkGeometry(THREE) {
  const T = THREE, P = [];
  const add = (g, part, o = {}) => P.push({ g, aPart: part, aLimb: o.limb || 0, aOpt: o.opt || 0, aNot: o.not || 0 });
  for (const s of [-1, 1]) {
    const limb = s < 0 ? 1 : 2;
    add(put(new T.BoxGeometry(0.12, 0.09, 0.21), [0.095 * s, 0.045, 0.03]), 4, { limb });                       // boot
    add(put(new T.CylinderGeometry(0.078, 0.062, 0.84, 6, 1, true), [0.095 * s, 0.5, 0]), 2, { limb });                  // leg
    add(put(new T.CylinderGeometry(0.056, 0.046, 0.56, 5, 1, true), [0.238 * s, 1.15, 0], [0, 0, -0.06 * s]), 1, { limb: s < 0 ? 3 : 4 });   // sleeve
    add(put(new T.SphereGeometry(0.048, 5, 3), [0.252 * s, 0.85, 0.01]), 0, { limb: s < 0 ? 3 : 4 });           // hand
  }
  add(put(new T.CylinderGeometry(0.17, 0.22, 0.34, 8, 1, true), [0, 0.8, 0], [0, 0, 0], [1, 1, 0.8]), 1);               // tunic hem
  add(put(new T.CylinderGeometry(0.19, 0.27, 0.7, 8, 1, true), [0, 0.45, 0], [0, 0, 0], [1, 1, 0.85]), 1, { opt: OPT.SKIRT });   // long skirt / robe
  add(put(new T.CylinderGeometry(0.205, 0.17, 0.5, 8, 1, true), [0, 1.2, 0], [0, 0, 0], [1, 1, 0.72]), 1);              // body
  add(put(new T.SphereGeometry(0.205, 8, 3), [0, 1.43, 0], [0, 0, 0], [1, 0.42, 0.72]), 1);                   // shoulders
  add(put(new T.CylinderGeometry(0.178, 0.178, 0.06, 8, 1, true), [0, 0.97, 0], [0, 0, 0], [1, 1, 0.8]), 4);            // belt
  add(put(new T.BoxGeometry(0.27, 0.56, 0.02), [0, 0.8, 0.165], [-0.06, 0, 0]), 5, { opt: OPT.APRON });        // apron
  add(put(new T.CylinderGeometry(0.05, 0.056, 0.1, 6, 1, true), [0, 1.5, 0]), 0);                                        // neck
  add(put(new T.SphereGeometry(0.115, 8, 6), [0, 1.62, 0], [0, 0, 0], [0.95, 1.08, 1]), 0);                   // head
  add(put(new T.BoxGeometry(0.03, 0.045, 0.04), [0, 1.6, 0.115]), 0);                                           // nose
  add(put(new T.SphereGeometry(0.124, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.56), [0, 1.635, -0.014]), 3, { not: OPT.HOOD });   // hair
  add(put(new T.BoxGeometry(0.2, 0.3, 0.07), [0, 1.5, -0.095]), 3, { opt: OPT.LONGHAIR, not: OPT.HOOD });       // long hair
  add(put(new T.CylinderGeometry(0.21, 0.21, 0.02, 10), [0, 1.725, 0]), 2, { opt: OPT.HAT, not: OPT.HOOD });    // hat brim
  add(put(new T.CylinderGeometry(0.1, 0.12, 0.13, 8), [0, 1.795, 0]), 2, { opt: OPT.HAT, not: OPT.HOOD });     // hat crown
  // a hood with the face left open (no sphere wedge over +z) and a drape over the shoulders
  add(put(new T.SphereGeometry(0.152, 8, 5, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9), [0, 1.645, -0.025], [0, 0, 0], [1, 1.06, 1.08]), 1, { opt: OPT.HOOD });
  add(put(new T.CylinderGeometry(0.14, 0.235, 0.16, 8, 1, true), [0, 1.47, -0.01], [0, 0, 0], [1, 1, 0.8]), 1, { opt: OPT.HOOD });
  add(put(new T.CylinderGeometry(0.22, 0.33, 0.98, 8, 1, true, Math.PI / 2, Math.PI), [0, 0.97, -0.01], [0, 0, 0], [1, 1, 0.75]), 2, { opt: OPT.CLOAK });   // cloak (back half)
  add(put(new T.BoxGeometry(0.2, 0.13, 0.15), [0.275, 0.78, 0.05]), 6, { limb: 4, opt: OPT.BASKET });          // basket
  add(put(new T.SphereGeometry(0.06, 5, 3), [0.275, 0.86, 0.05], [0, 0, 0], [1.3, 0.6, 1]), 5, { limb: 4, opt: OPT.BASKET });   // bread in it
  add(put(new T.CylinderGeometry(0.062, 0.062, 0.025, 6), [-0.255, 0.665, 0.02]), 4, { limb: 3, opt: OPT.LANTERN });   // lantern base
  add(put(new T.ConeGeometry(0.068, 0.07, 6), [-0.255, 0.835, 0.02]), 4, { limb: 3, opt: OPT.LANTERN });                 // its cap
  add(put(new T.SphereGeometry(0.055, 6, 4), [-0.255, 0.745, 0.02], [0, 0, 0], [1, 1.25, 1]), 7, { limb: 3, opt: OPT.LANTERN });   // its flame (the glass)
  return merge(THREE, P, ['aPart', 'aLimb', 'aOpt', 'aNot']);
}

// critter parts: 0 main, 1 second colour, 2 beak and legs, 3 eyes; limbs: 1 head (pecks), 2 tail, 3 / 4 wings
function critterGeometry(THREE) {
  const T = THREE, P = [];
  const add = (g, kind, part, limb = 0) => P.push({ g, aKind: kind, aPart: part, aLimb: limb });
  // pigeon (about 0.3 m)
  { const k = CRIT.PIGEON;
    add(put(new T.SphereGeometry(0.085, 6, 4), [0, 0.13, 0], [0, 0, 0], [0.85, 0.8, 1.45]), k, 0);
    add(put(new T.SphereGeometry(0.06, 5, 3), [0, 0.17, 0.08]), k, 1, 1);
    add(put(new T.SphereGeometry(0.048, 5, 3), [0, 0.215, 0.11]), k, 0, 1);
    add(put(new T.ConeGeometry(0.014, 0.04, 5), [0, 0.21, 0.17], [Math.PI / 2, 0, 0]), k, 2, 1);
    add(put(new T.BoxGeometry(0.075, 0.015, 0.12), [0, 0.13, -0.16], [-0.15, 0, 0]), k, 1, 2);
    for (const s of [-1, 1]) {
      add(put(new T.BoxGeometry(0.02, 0.06, 0.17), [0.075 * s, 0.14, -0.01]), k, 1, s < 0 ? 3 : 4);
      add(put(new T.BoxGeometry(0.012, 0.07, 0.012), [0.03 * s, 0.035, 0.01]), k, 2);
      add(put(new T.SphereGeometry(0.01, 4, 3), [0.03 * s, 0.225, 0.14]), k, 3, 1);
    } }
  // hen (about 0.45 m)
  { const k = CRIT.HEN;
    add(put(new T.SphereGeometry(0.15, 7, 5), [0, 0.24, 0], [0, 0, 0], [0.9, 0.85, 1.2]), k, 0);
    add(put(new T.SphereGeometry(0.07, 6, 4), [0, 0.4, 0.14]), k, 0, 1);
    add(put(new T.BoxGeometry(0.02, 0.05, 0.07), [0, 0.48, 0.14]), k, 1, 1);
    add(put(new T.BoxGeometry(0.02, 0.04, 0.025), [0, 0.35, 0.2]), k, 1, 1);
    add(put(new T.ConeGeometry(0.02, 0.05, 5), [0, 0.39, 0.215], [Math.PI / 2, 0, 0]), k, 2, 1);
    add(put(new T.ConeGeometry(0.08, 0.2, 7), [0, 0.35, -0.15], [-0.6, 0, 0]), k, 0, 2);
    for (const s of [-1, 1]) {
      add(put(new T.SphereGeometry(0.08, 5, 3), [0.1 * s, 0.25, -0.01], [0, 0, 0], [0.35, 0.8, 1.3]), k, 0, s < 0 ? 3 : 4);
      add(put(new T.CylinderGeometry(0.012, 0.012, 0.12, 4), [0.05 * s, 0.06, 0]), k, 2);
      add(put(new T.SphereGeometry(0.012, 4, 3), [0.045 * s, 0.415, 0.19]), k, 3, 1);
    } }
  // cat (about 0.5 m)
  { const k = CRIT.CAT;
    add(put(new T.SphereGeometry(0.12, 7, 5), [0, 0.2, 0], [0, 0, 0], [0.8, 0.75, 1.9]), k, 0);
    add(put(new T.SphereGeometry(0.09, 7, 5), [0, 0.3, 0.25]), k, 0, 1);
    add(put(new T.SphereGeometry(0.045, 5, 3), [0, 0.275, 0.32], [0, 0, 0], [1.1, 0.8, 1]), k, 1, 1);
    for (const s of [-1, 1]) {
      add(put(new T.ConeGeometry(0.032, 0.07, 4), [0.05 * s, 0.39, 0.24]), k, 0, 1);
      add(put(new T.SphereGeometry(0.014, 4, 3), [0.035 * s, 0.32, 0.325]), k, 3, 1);
      for (const e of [-1, 1]) add(put(new T.CylinderGeometry(0.026, 0.022, 0.16, 4), [0.06 * s, 0.08, 0.14 * e]), k, e > 0 ? 0 : 1);
    }
    add(put(new T.CylinderGeometry(0.022, 0.014, 0.34, 5), [0, 0.36, -0.3], [-0.55, 0, 0]), k, 0, 2); }
  return merge(THREE, P, ['aKind', 'aPart', 'aLimb']);
}

// ---------------------------------------------------------------- shaders (patched onto MeshStandardMaterial)
const lin = (THREE, hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
function folkChunks(THREE) {
  const decl = `attribute float aPart; attribute float aLimb; attribute float aOpt; attribute float aNot;
attribute vec3 iSkin; attribute vec3 iCloth; attribute vec3 iCloth2; attribute vec3 iHair; attribute vec4 iAnim;
varying vec3 vLife; varying float vGlow;
float lfAng() {
  float s = sin(iAnim.x), sw = iAnim.y; int o = int(iAnim.z + 0.5);
  if (aLimb < 0.5) return 0.0;
  if (aLimb < 1.5) return s * 0.52 * sw;
  if (aLimb < 2.5) return -s * 0.52 * sw;
  if (aLimb < 3.5) return (o & ${OPT.LANTERN}) != 0 ? 0.5 : -s * 0.42 * sw;
  return ((o & ${OPT.BASKET}) != 0 ? 0.15 - s * 0.08 * sw : s * 0.42 * sw) + iAnim.w;
}
bool lfHide() { int o = int(iAnim.z + 0.5); int a = int(aOpt + 0.5); int n = int(aNot + 0.5); return (a != 0 && (a & o) == 0) || (n & o) != 0; }
`;
  const body = (colour) => `vec3 transformed = vec3(position);
{ float a = lfAng();
  if (a != 0.0) { float py = aLimb < 2.5 ? 0.91 : 1.42; float ry = transformed.y - py, c = cos(a), s = sin(a);
    transformed.y = py + ry * c + transformed.z * s; transformed.z = -ry * s + transformed.z * c; }
  transformed.y += iAnim.y * 0.035 * abs(cos(iAnim.x));
  if (lfHide()) transformed = vec3(0.0); }
${colour ? `{ int pt = int(aPart + 0.5);
  vLife = pt == 0 ? iSkin : pt == 1 ? iCloth : pt == 2 ? iCloth2 : pt == 3 ? iHair : pt == 4 ? ${lin(THREE, '#3a2a1e')} : pt == 5 ? ${lin(THREE, '#d8cfb8')} : pt == 6 ? ${lin(THREE, '#8a6a3a')} : ${lin(THREE, '#ffc070')};
  vGlow = pt == 7 ? 1.0 : 0.0; }` : ''}`;
  const normal = `vec3 objectNormal = vec3(normal);
{ float a = lfAng(); if (a != 0.0) { float c = cos(a), s = sin(a); float ny = objectNormal.y * c + objectNormal.z * s; objectNormal.z = -objectNormal.y * s + objectNormal.z * c; objectNormal.y = ny; } }
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif`;
  return { decl, body, normal };
}
function critterChunks(THREE) {
  const decl = `attribute float aKind; attribute float aPart; attribute float aLimb;
attribute vec3 iCol; attribute vec3 iCol2; attribute vec4 iAnim;
varying vec3 vLife; varying float vGlow;
`;
  const body = (colour) => `vec3 transformed = vec3(position);
{ float k = iAnim.w;
  if (abs(aKind - k) > 0.5) transformed = vec3(0.0);
  else if (aLimb > 0.5) {
    if (aLimb < 1.5) { float py = k < 0.5 ? 0.17 : k < 1.5 ? 0.33 : 0.27, pz = k < 0.5 ? 0.06 : k < 1.5 ? 0.1 : 0.17;
      float a = iAnim.x, ry = transformed.y - py, rz = transformed.z - pz, c = cos(a), s = sin(a);
      transformed.y = py + ry * c - rz * s; transformed.z = pz + ry * s + rz * c; }
    else if (aLimb < 2.5) { float pz = k > 1.5 ? -0.2 : -0.1, a = iAnim.y, rz = transformed.z - pz, c = cos(a), s = sin(a);
      transformed.x = transformed.x * c + rz * s; transformed.z = pz - transformed.x * s + rz * c; }
    else { float sd = aLimb < 3.5 ? -1.0 : 1.0, px = 0.06 * sd, py = k < 0.5 ? 0.17 : 0.3, a = iAnim.z * sd;
      float rx = transformed.x - px, ry = transformed.y - py, c = cos(a), s = sin(a);
      transformed.x = px + rx * c - ry * s; transformed.y = py + rx * s + ry * c; } } }
${colour ? `{ int pt = int(aPart + 0.5);
  vLife = pt == 0 ? iCol : pt == 1 ? iCol2 : pt == 2 ? ${lin(THREE, '#d89a40')} : ${lin(THREE, '#101010')};
  vGlow = pt == 3 && fract(iAnim.w) > 0.1 ? 0.6 : 0.0; }` : ''}`;
  return { decl, body, normal: null };
}
function patch(mat, chunks, key, { colour = true, glow = null } = {}) {
  mat.onBeforeCompile = (sh) => {
    if (glow) sh.uniforms.uLifeGlow = glow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${chunks.decl}`)
      .replace('#include <begin_vertex>', chunks.body(colour));
    if (chunks.normal) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', chunks.normal);
    if (colour) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLife; varying float vGlow; uniform float uLifeGlow;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vLife;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vLife * vGlow * uLifeGlow;');
    }
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// ---------------------------------------------------------------- the kit
export function createTownLife(THREE, scene, { quality = {}, tilesDb = null, q = null } = {}) {
  const caps = lifeCaps(quality, q);
  if (!caps) return null;
  const MAXF = caps.folk * 2, MAXC = caps.critters * 2;     // two towns can share the view at an edge
  const glow = { value: 1 };
  const fGeo = folkGeometry(THREE);
  const iSkin = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3), iCloth = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3);
  const iCloth2 = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3), iHair = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3);
  const iAnim = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 4), 4);
  for (const [k, a] of Object.entries({ iSkin, iCloth, iCloth2, iHair, iAnim })) { a.setUsage(THREE.DynamicDrawUsage); fGeo.setAttribute(k, a); }
  const fc = folkChunks(THREE);
  const fMat = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, metalness: 0, emissive: '#000000' }), fc, 'lr_townfolk1', { glow });
  const mesh = new THREE.InstancedMesh(fGeo, fMat, MAXF);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0; mesh.frustumCulled = false; mesh.name = 'lr_townfolk';
  mesh.castShadow = caps.shadows; mesh.receiveShadow = true;
  if (caps.shadows) mesh.customDepthMaterial = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), fc, 'lr_townfolk1_depth', { colour: false });
  scene.add(mesh);
  const cGeo = critterGeometry(THREE);
  const cCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 3), 3), cCol2 = new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 3), 3);
  const cAnim = new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 4), 4);
  for (const [k, a] of Object.entries({ iCol: cCol, iCol2: cCol2, iAnim: cAnim })) { a.setUsage(THREE.DynamicDrawUsage); cGeo.setAttribute(k, a); }
  const cMat = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0, emissive: '#000000' }), critterChunks(THREE), 'lr_critters1', { glow });
  const critterMesh = new THREE.InstancedMesh(cGeo, cMat, MAXC);
  critterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  critterMesh.count = 0; critterMesh.frustumCulled = false; critterMesh.name = 'lr_critters';
  critterMesh.castShadow = false; critterMesh.receiveShadow = true;
  scene.add(critterMesh);

  const plans = new Map();     // zone id -> [{ plan, st }] (st: the per-person door states)
  const col = new THREE.Color(), m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  const setCol = (a, i, hex) => { col.set(hex); a.setXYZ(i, col.r, col.g, col.b); };
  let lastF = null, lastZone = null, lastNow = null;
  const dev = { towns: [], folk: 0, out: 0, inside: 0, doors: 0, critters: 0, ms: 0 };   // doors: walking home or out

  function townsOf(zone, kit) {
    if (plans.has(zone.id)) return plans.get(zone.id);
    const list = [];
    for (const reg of lifeTowns(zone)) {
      const p = planTown(zone, reg, tilesDb, { folk: caps.folk, critters: caps.critters, dress: kit ? (kit.plan || true) : false });
      if (p) list.push({ plan: p, st: p.folk.map(() => ({ mode: null, path: null, len: 0, t0: 0, shift: 0 })), flock: { from: null, t0: -99, spot: 0 } });
    }
    plans.set(zone.id, list);
    return list;
  }

  /** A walk from (x, z) m to door d's threshold and one step in (going home), as a polyline in m, or null. */
  function homeWalk(P, F, x, z) {
    const D = P.doors[F.home];
    const tiles = P.toDoor(F.home, Math.floor(x), Math.floor(z));
    if (!tiles) return null;
    const pts = [[x, z], ...tiles.slice(1).map(([tx, ty]) => [tx + 0.5, ty + 0.5])];
    if (D.in) pts.push([D.in[0] + 0.5, D.in[1] + 0.2]);
    return pts;
  }
  const lenOf = (pts) => { let L = 0; for (let j = 1; j < pts.length; j++) L += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); return L; };

  function frame({ zone, kit = null, snap = null, f = 0.5, rain = 0, now = 0, focus, inView = null }) {
    const t0 = performance.now();
    let n = 0, nc = 0;
    dev.towns = []; dev.out = 0; dev.inside = 0; dev.doors = 0;
    if (!zone || zone !== lastZone) { lastF = null; lastZone = zone; }
    const dtR = lastNow == null ? 0 : Math.max(0, Math.min(0.2, now - lastNow));
    lastNow = now;
    const snapAll = lastF == null || Math.abs(f - lastF) > JUMP_F && Math.abs(f - lastF) < 1 - JUMP_F;
    lastF = f;
    const towns = zone ? townsOf(zone, kit) : [];
    // heroes and NPCs in the zone: townsfolk step aside; a hero near the pigeons sends them up
    const bodies = [];
    if (snap) for (const e of snap.entities) if ((e.kind === 'player' || e.kind === 'npc') && !e.dead && e.zone != null) bodies.push([e.x / 16, e.y / 16, e.kind === 'player']);
    glow.value = 0.6 + 2.2 * Math.max(0, Math.min(1, (Math.abs(f - 0.5) - 0.24) / 0.08));
    for (const T of towns) {
      const P = T.plan, R = P.region;
      const dx = Math.max(R.x - focus.x, 0, focus.x - (R.x + R.w)), dz = Math.max(R.y - focus.z, 0, focus.z - (R.y + R.h));
      if (Math.hypot(dx, dz) > REACH) { for (const s of T.st) s.mode = null; continue; }
      dev.towns.push(P.id);
      const hurry = rain > 0.3 ? 1.4 : 1;
      for (let i = 0; i < P.folk.length && n < MAXF; i++) {
        const F = P.folk[i], S = T.st[i];
        const want = wantOut(F, f, rain);
        const lt = now + F.off + (S.shift || 0);
        if (snapAll || S.mode == null) { S.mode = want ? 'out' : 'in'; S.path = null; }
        else if (S.mode === 'out' && !want) {
          const p = loopPose(F, lt), w = p && homeWalk(P, F, p.x, p.z);
          if (w) { S.mode = 'going'; S.path = w; S.len = lenOf(w); S.t0 = now; S.left = lt; S.resume = null; } else S.mode = 'in';
        } else if (S.mode === 'in' && want) {
          // out of the door: a walker's loop starts at its home door, so it steps out and starts the loop there; one who
          // stands (a group, the inn door) walks to its spot
          const D = P.doors[F.home];
          const w = F.loop < 1e8 ? (D.in ? [[D.in[0] + 0.5, D.in[1] + 0.2], [D.x + 0.5, D.y + 0.5]] : null) : homeWalk(P, F, F.legs[0].x, F.legs[0].z);
          if (w) { S.mode = 'coming'; S.path = F.loop < 1e8 ? w : w.reverse(); S.len = lenOf(S.path); S.t0 = now; S.resume = null; S.left = null; } else S.mode = 'out';
        } else if ((S.mode === 'going' && want) || (S.mode === 'coming' && !want)) {
          // changed its mind half way (a short shower): turn round on the same path
          const s = Math.min(S.len, (now - S.t0) * GO_SPEED * hurry);
          S.path = S.path.slice().reverse(); S.t0 = now - (S.len - s) / (GO_SPEED * hurry); S.mode = want ? 'coming' : 'going';
          // back out on the way it came: the loop picks up where it was left (a walker sent home and called back)
          S.resume = want && S.left != null ? S.left : null;
        }
        let x, z, yaw, walking = false, phase = 0, talk = false;
        if (S.mode === 'in') { dev.inside++; continue; }
        if (S.mode === 'going' || S.mode === 'coming') {
          const s = (now - S.t0) * GO_SPEED * hurry;
          if (s >= S.len) {
            if (S.mode === 'coming' && F.loop < 1e8) S.shift = (S.resume != null ? S.resume : 0) - (now + F.off);   // the loop's start (the home door) or where it was left
            S.mode = S.mode === 'going' ? 'in' : 'out'; S.path = null;
            if (S.mode === 'in') { dev.inside++; continue; }
          }
          else { [x, z, yaw] = pointAt(S.path, s); walking = true; phase = (s / STRIDE) * Math.PI * 2; dev.doors++; }
        }
        if (S.mode === 'out') {
          const p = loopPose(F, lt);
          if (!p) continue;
          ({ x, z, yaw, walking, phase, talk } = p);
          dev.out++;
        }
        // step aside from heroes and NPCs (never through them)
        for (const [bx, bz] of bodies) {
          const ddx = x - bx, ddz = z - bz, d = Math.hypot(ddx, ddz);
          if (d < MAKE_WAY && d > 1e-3) { const k = (MAKE_WAY - d) / d; x += ddx * k; z += ddz * k; }
        }
        // idle life: a slow look round when standing, a talker's hand now and then
        let gesture = 0;
        if (!walking) {
          yaw += Math.sin(now * 0.35 + F.id * 1.7) * 0.25;
          if (talk) { const g = Math.sin(now * 0.9 + F.id * 2.3); gesture = g > 0.55 ? (g - 0.55) * 2.2 : 0; }
        }
        pv.set(x, groundY(x, z), z);
        if (inView && !inView(pv, 1.8)) continue;          // off screen: not drawn (the routine above still runs)
        let opts = F.opts;
        if (rain > 0.3 && !(opts & OPT.HAT)) opts |= OPT.HOOD;
        qt.setFromAxisAngle(yAxis, yaw);
        sv.setScalar(F.scale);
        mesh.setMatrixAt(n, m4.compose(pv, qt, sv));
        setCol(iSkin, n, F.skin); setCol(iCloth, n, F.cloth); setCol(iCloth2, n, F.cloth2); setCol(iHair, n, F.hair);
        iAnim.setXYZW(n, walking ? phase : 0, walking ? 1 : 0, opts, gesture);
        n++;
      }
      // critters
      // the pigeons: one flock at one of a few spots; a hero walking into it sends it up to the next spot
      const Fl = T.flock, FS = P.flockSpots;
      const near = (x, z, r) => bodies.some(([bx, bz, pl]) => pl && Math.hypot(bx - x, bz - z) < r);
      if (FS.length > 1 && now - Fl.t0 > 2.4 && !snapAll && near(FS[Fl.spot][0], FS[Fl.spot][1], 2.6)) {
        Fl.from = FS[Fl.spot]; Fl.spot = (Fl.spot + 1) % FS.length; Fl.t0 = now;
      }
      for (const C of P.critters) {
        if (nc >= MAXC) break;
        // a critter that shelters (night, rain) shrinks away over a second rather than popping out
        const ck = T.ck || (T.ck = new Map()), want = critterOut(C, f, rain) ? 1 : 0;
        let kv = ck.has(C.id) && !snapAll ? ck.get(C.id) : want;
        kv = want > kv ? Math.min(1, kv + dtR) : Math.max(0, kv - dtR);
        ck.set(C.id, kv);
        if (kv <= 0) continue;
        let x = C.x, z = C.z, yaw = C.yaw || 0, peck = 0, tail = 0, wing = 0, y = 0;
        const t = now + C.ph;
        if (C.kind === CRIT.PIGEON) {
          if (!FS.length) continue;
          const ox = C.x - FS[0][0], oz = C.z - FS[0][1], to = FS[Fl.spot];
          const k = Math.min(1, (now - Fl.t0) / 2.4);
          if (k < 1 && Fl.from) {
            const a = [Fl.from[0] + ox, Fl.from[1] + oz], b = [to[0] + ox, to[1] + oz];
            const e = k * k * (3 - 2 * k);
            x = a[0] + (b[0] - a[0]) * e; z = a[1] + (b[1] - a[1]) * e; y = Math.sin(Math.PI * k) * (2.2 + (C.ph % 1));
            yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); wing = 0.9 * Math.sin(now * 30 + C.ph);
          } else {
            // a few hops about the flock's spot, pecking between them
            const seg = Math.floor(t / 1.9), u = t / 1.9 - seg;
            const h = (s2, k2) => { const v = Math.sin(s2 * 91.7 + C.id * 13.1 + k2 * 7.3) * 43758.5; return v - Math.floor(v); };
            const p0 = [(h(seg - 1, 1) - 0.5) * 0.5, (h(seg - 1, 2) - 0.5) * 0.5], p1 = [(h(seg, 1) - 0.5) * 0.5, (h(seg, 2) - 0.5) * 0.5];
            const e = Math.min(1, u / 0.25);
            x = to[0] + ox + p0[0] + (p1[0] - p0[0]) * e; z = to[1] + oz + p0[1] + (p1[1] - p0[1]) * e;
            y = u < 0.25 ? Math.sin(Math.PI * u / 0.25) * 0.05 : 0;
            yaw = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]) + h(seg, 3) * 0.8;
            peck = u > 0.4 && Math.sin(t * 9) > 0.2 ? 0.9 : 0;
          }
        } else {
          // hens and the walking cat potter about home; the sitting cat stays and swishes its tail
          const P2 = C.kind === CRIT.HEN ? 3.2 : 7, seg = Math.floor(t / P2), u = t / P2 - seg;
          const h = (s, k2) => { const v = Math.sin(s * 57.3 + C.id * 3.7 + k2 * 11.9) * 43758.5; return v - Math.floor(v); };
          if (C.r > 0) {
            const tgt = (s) => { const a = [C.x + (h(s, 1) - 0.5) * 2 * C.r, C.z + (h(s, 2) - 0.5) * 2 * C.r]; return P.walk(Math.floor(a[0]), Math.floor(a[1])) ? a : [C.x, C.z]; };
            const a = tgt(seg - 1), b = tgt(seg), mv = C.kind === CRIT.HEN ? 0.3 : 0.45, e = Math.min(1, u / mv);
            x = a[0] + (b[0] - a[0]) * e; z = a[1] + (b[1] - a[1]) * e;
            if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.05) yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
            if (C.kind === CRIT.HEN) { peck = u > mv && Math.sin(t * 7) > 0 ? 0.8 : 0; y = u < mv ? Math.abs(Math.sin(u * 40)) * 0.02 : 0; }
          }
          tail = Math.sin(t * (C.kind === CRIT.CAT ? 1.3 : 3)) * (C.kind === CRIT.CAT ? 0.45 : 0.12);
          if (C.kind === CRIT.CAT && C.r === 0) peck = -0.15 + Math.sin(t * 0.4) * 0.15;
        }
        for (const [bx, bz] of bodies) { const ddx = x - bx, ddz = z - bz, d = Math.hypot(ddx, ddz); if (d < 0.6 && d > 1e-3 && y < 0.3) { const k = (0.6 - d) / d; x += ddx * k; z += ddz * k; } }
        pv.set(x, groundY(x, z) + y, z);
        if (inView && !inView(pv, 0.5)) continue;
        qt.setFromAxisAngle(yAxis, yaw);
        sv.setScalar(C.scale * kv);
        critterMesh.setMatrixAt(nc, m4.compose(pv, qt, sv));
        setCol(cCol, nc, C.col); setCol(cCol2, nc, C.col2);
        cAnim.setXYZW(nc, peck, tail, wing, C.kind + (C.kind === CRIT.CAT && glow.value > 1.5 ? 0.25 : 0));   // a cat's eyes catch the lamps at night
        nc++;
      }
    }
    mesh.count = n; critterMesh.count = nc;
    for (const a of [mesh.instanceMatrix, iSkin, iCloth, iCloth2, iHair, iAnim]) if (n) a.needsUpdate = true;
    for (const a of [critterMesh.instanceMatrix, cCol, cCol2, cAnim]) if (nc) a.needsUpdate = true;
    mesh.visible = n > 0; critterMesh.visible = nc > 0;
    dev.folk = n; dev.critters = nc;   // drawn (on screen) dev.ms = +(performance.now() - t0).toFixed(2);
    return dev;
  }
  return { frame, mesh, critterMesh, caps, dev, plans };
}

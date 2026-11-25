// Level of detail for the horizon camera (wave 8, lod lane; the camera brief's owed item: D:\LQOnline\wave5\camera\BRIEF.md,
// "the cure is a level-of-detail pass"). It only ever runs while the horizon camera is on: today's fixed camera passes no
// plan, so zone3d.js cull() takes its old path and every default view draws exactly as before.
//
//   const plan = horizonLod(hpose, camera.position)     null when hpose is null (today's camera)
//   lodCell(cell, plan)       inside zone3d.js cull(), for each cell in reach: small props and far trees by camera distance
//   unLodCell(cell)           back to full detail (the default camera's path calls it on any cell a plan touched)
//   loGeometry(srcProto, i)   the far version of one kit model part (cached; shares the full part's vertex buffers)
//
// What the low view used to draw (probe at Willowmere, yaw 0, pitch 12, dist 10, 2026-11-24, D:\LQOnline\wave8\lod):
// 1,425 draw calls and 3.6 million triangles, against 692 and 1.8 million for today's camera at the same spot. Most of
// the extra was ground dressing (grass clumps, flowers, pebbles, ferns: 1.1 million triangles in about 330 calls) out at
// 40 to 140 m, a few pixels each, and kit trees seen whole, whose bark (trunk and every branch, about 70% of a tree's
// triangles) mostly sits inside the leaves. So, keyed to the camera (not the hero) and only in the horizon camera:
//   - small props (the instanced dressing marked small) draw only within smallR m of the camera (today: whole 48 m
//     cells within 70 m of the hero; the default camera never sees past about 40 m of them anyway)
//   - kit trees past treeR m of the camera keep their leaves and lose the bark above the crown's base (the trunk below
//     it stays, with its own texture), one geometry swap per instanced chunk: no new draw calls, no new materials
// Phones and Low quality (hpose.lite) get the shorter reaches. Those two cut the calls and triangles but on their own
// hardly moved the frame time (GPU timer queries: 72 to 69 ms in that view).
//
// The big one is overdraw. Every scenery shader has a discard (the see-through dither of roofs, canopies and the
// near-lens fade, zone3d.js seeThrough), and a shader that can discard while writing depth turns off the GPU's early
// depth test, so every hidden fragment is still fully lit. Seen from above (today) little hides behind anything; along a
// street at a low tilt houses and trees stand in rows behind each other. Measured with GPU timer queries in one page
// (Willowmere, yaw 0, pitch 12, dist 10): today 50 ms of GPU a frame, the horizon camera 72 ms, and with the discard
// taken out (a test build only) 45 ms. So in the horizon camera on desktop High, a depth prepass (createPrepass, below):
// the opaque scenery within preR m draws first into depth only, carrying the SAME see-through discard (so a faded roof
// never hides the hero), then the real pass draws those pieces with twins that have no discard and test EQUAL, so the
// GPU tests depth early and lights only the front surface. Willowmere's low view went from 65 to 50 ms of GPU (today
// 45), the Moor's from 36 to 28 (today 28). Not on phones and Low: more draw calls on a weaker CPU, and their short
// view has little overdraw.

import * as THREE from '../vendor/three/three.module.min.js';

export const LOD_TIER = {
  high: { smallR: 42, treeR: 38, prepass: true, preR: 60 },
  lite: { smallR: 26, treeR: 26, prepass: false, preR: 0 },
};
// Leaves (alpha cut) could draw into the prepass with their alpha test, but measured worse (Willowmere low view: 58 ms of
// GPU with them, 51 without), and so do the small props (many calls, little overdraw): both draw as today.
const PRE_ALPHA = false;
export const PRE_LAYER = 7;   // three.js layer: the opaque scenery the depth prepass draws (today's camera only sees layer 0)

/** The plan for this frame, or null (today's camera: nothing changes). cam: the camera position (m). */
export function horizonLod(hpose, cam) {
  if (!hpose) return null;
  const T = hpose.lite ? LOD_TIER.lite : LOD_TIER.high;
  return { x: cam.x, z: cam.z, smallR: T.smallR, treeR: T.treeR, prepass: T.prepass, preR: T.preR };
}

// the nearest point of a mesh's bounds to the camera, on the ground plane (instanced meshes carry world bounds)
function nearXZ(m, plan) {
  const s = m.userData.lodS || (m.userData.lodS = sphereOf(m));
  return Math.hypot(s[0] - plan.x, s[1] - plan.z) - s[2];
}
function sphereOf(m) {
  const b = m.isInstancedMesh ? m.boundingSphere : (m.geometry.boundingSphere || (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere));
  return [b.center.x, b.center.z, b.radius];
}

/** One cell in reach this frame, horizon camera on. */
export function lodCell(c, plan) {
  c.lodOn = true;
  if (!c.preMarked) markCell(c);
  c.smallOn = null;            // the default path re-shows its small props by its own rule when the camera goes back
  for (const m of c.small) m.visible = nearXZ(m, plan) < plan.smallR;
  if (c.lo) for (const m of c.lo) {
    const lo = nearXZ(m, plan) > plan.treeR;
    const g = lo ? m.userData.loGeo || (m.userData.loGeo = loGeometry(m.userData.loSrc.proto, m.userData.loSrc.part) || m.userData.hiGeo) : m.userData.hiGeo;
    if (m.geometry !== g) m.geometry = g;
  }
}

/** Full detail again (the cell's small props are put back by the default path: smallOn is null). */
export function unLodCell(c) {
  c.lodOn = false;
  for (const m of c.small) m.visible = true;
  if (c.lo) for (const m of c.lo) if (m.geometry !== m.userData.hiGeo) m.geometry = m.userData.hiGeo;
}

/** Is this kit model a tree whose bark part can be trimmed far off? -> the bark part's index, or -1. */
export function barkPart(proto) {
  if (!proto || !proto.parts || proto.parts.length < 2) return -1;
  const leaves = proto.parts.some((p) => /^Leaves/i.test(p.material && p.material.name));
  const i = proto.parts.findIndex((p) => /^Bark/i.test(p.material && p.material.name));
  return leaves ? i : -1;
}

const cache = new Map();   // `${proto.url}#${part}` -> geometry (or null: not worth it)
/** The far version of a tree's bark part: only the triangles below the crown's base (the visible trunk), plus a
 *  margin, so the trunk still meets the leaves. Shares the full geometry's attributes (no new vertex buffers). */
export function loGeometry(proto, part) {
  const key = `${proto.url}#${part}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  const bark = proto.parts[part];
  const g = bark && bark.geometry;
  if (g && g.index && g.attributes.position) {
    // the crown's base in the model's space: the lowest leaf vertex (a little below the leaves' box: a few low twigs)
    let base = Infinity;
    for (const p of proto.parts) {
      if (!/^Leaves/i.test(p.material && p.material.name)) continue;
      const ps = p.geometry.attributes.position, e = p.matrix.elements;
      for (let k = 0; k < ps.count; k++) {
        const x = ps.getX(k), y = ps.getY(k), z = ps.getZ(k);
        base = Math.min(base, e[1] * x + e[5] * y + e[9] * z + e[13]);
      }
    }
    if (Number.isFinite(base)) {
      const ps = g.attributes.position, e = bark.matrix.elements, idx = g.index.array;
      const yOf = (k) => e[1] * ps.getX(k) + e[5] * ps.getY(k) + e[9] * ps.getZ(k) + e[13];
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < ps.count; k++) { const y = yOf(k); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      const cut = base + 0.12 * (hi - lo);                      // the trunk runs a little into the crown
      const keep = [];
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        if (Math.min(yOf(a), yOf(b), yOf(c)) < cut) keep.push(a, b, c);
      }
      // only worth a swap when it saves a good part of the bark
      if (keep.length > 0 && keep.length < idx.length * 0.75) {
        out = new g.constructor();
        for (const n of Object.keys(g.attributes)) out.setAttribute(n, g.attributes[n]);
        const IA = idx.constructor;
        out.setIndex(new g.index.constructor(new IA(keep), 1));
        out.boundingBox = g.boundingBox; out.boundingSphere = g.boundingSphere;
        out.name = `${g.name || 'bark'}:lo`;
        out.userData.loTris = [idx.length / 3, keep.length / 3];
      }
    }
  }
  cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- depth prepass
/** Can this mesh draw into the prepass? Opaque, patched with the see-through dither (zone3d.js marks the material
 *  userData.lrSee), no alpha cut-outs (leaves: their cards would fill whole quads), no shader that moves vertices. */
export function preEligible(m) {
  const mat = m.material;
  return !!(m.isMesh && mat && !Array.isArray(mat) && mat.userData && mat.userData.lrSee && !mat.transparent && (PRE_ALPHA || !(mat.alphaTest > 0)) && !mat.alphaMap
    && mat.depthWrite !== false && mat.colorWrite !== false && !m.isSkinnedMesh && !m.morphTargetInfluences && !m.userData.small);
}
function markCell(c) {
  c.preMarked = true;
  c.pre = [];
  c.g.traverse((m) => { if (preEligible(m)) { m.layers.enable(PRE_LAYER); c.pre.push(m); m.material.userData.lrPre = true; } });
}

// the seeThrough discard line (zone3d.js), taken out of a twin; the prepass keeps it
const SEE_DISCARD = 'if (lrC < 0.999 && lrC <= lrBayer(gl_FragCoord.xy) + 0.001) discard;';
const INVARIANT = (sh) => { sh.vertexShader = 'invariant gl_Position;\n' + sh.vertexShader; };

/** Wrap renderer.render once: while pre.active, a render of (scene, camera) draws the marked scenery into depth first
 *  (with the see-through discard and, for leaves, the alpha cut), then the real pass draws each marked piece with its
 *  twin: the same material without the see-through discard, testing EQUAL against that depth and writing none. A
 *  fragment the prepass threw away (a faded roof) left no depth of its own there, so its twin fails the test and what
 *  is behind shows, exactly as today. With no discard left in the real pass the GPU tests depth before lighting a
 *  fragment, and lights only the front surface. Prepass and twin are clones of the same material (same vertex shader),
 *  both with gl_Position invariant, so the two depths match exactly. */
export function createPrepass(renderer, scene, camera, { precompile = null } = {}) {
  const clone = (mat, suffix, patch) => {
    const t = mat.clone();
    const base = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
    t.onBeforeCompile = (sh, r) => { patch(sh, () => base.call(mat, sh, r)); INVARIANT(sh); };
    t.customProgramCacheKey = () => key() + suffix;
    t.name = `${mat.name || ''}:${suffix}`;
    return t;
  };
  // the depth-only twin: no colour, and the fragment shader stops right after the see-through discard (an alpha cut
  // material after its alpha test), so no lighting is done
  const pres = new WeakMap(), twins = new WeakMap();
  const preOf = (mat) => {
    let t = pres.get(mat);
    if (!t) {
      const at = mat.alphaTest > 0;
      t = clone(mat, at ? '|lr_pre2a' : '|lr_pre2', (sh, base) => {
        const at0 = at ? '#include <alphatest_fragment>' : '#include <clipping_planes_fragment>';
        sh.fragmentShader = sh.fragmentShader.replace(at0, `${at0}\nLR_PRE_TAIL`);
        base();
        sh.fragmentShader = sh.fragmentShader.replace('LR_PRE_TAIL', 'gl_FragColor = vec4(0.0); return;');
      });
      t.colorWrite = false;
      pres.set(mat, t);
    }
    return t;
  };
  const twinOf = (mat) => {
    let t = twins.get(mat);
    if (!t) {
      t = clone(mat, '|lr_twin1', (sh, base) => { base(); sh.fragmentShader = sh.fragmentShader.replace(SEE_DISCARD, ''); });
      t.depthFunc = THREE.EqualDepth; t.depthWrite = false;
      twins.set(mat, t);
    }
    return t;
  };
  const swapped = [], skipped = [], list = [];
  const orig = renderer.render.bind(renderer);
  let inside = false;
  // the prepass and twin programs are compiled in the background (precompile: renderer3d.js, three.js compileAsync)
  // before the prepass is used, so turning the horizon camera on never stalls a frame on shader linking; until they
  // are in, the frame draws as without the prepass
  const warm = new Set(), warming = new Set();
  const keyOf = (m) => `${m.material.uuid}|${m.isInstancedMesh ? (m.instanceColor ? 2 : 1) : 0}|${m.receiveShadow ? 1 : 0}`;
  function warmUp(cold) {
    const g = new THREE.Group();
    for (const [k, m] of cold) {
      warming.add(k);
      for (const mat of [preOf(m.material), twinOf(m.material)]) { const d = m.clone(); d.material = mat; d.layers.enableAll(); g.add(d); }
    }
    const done = () => { for (const k of cold.keys()) { warming.delete(k); warm.add(k); } g.traverse((d) => { if (d.isInstancedMesh) d.dispose(); }); };
    Promise.resolve(precompile ? precompile(g) : null).then(done, done);
  }
  const pre = {
    active: false,
    plan: null,          // this frame's lod plan (camera position)
    reach: 0,            // m: only pieces this near the camera go through the prepass (0: all)
    info: { calls: 0, objects: 0, warming: 0 },
    /** the marked scenery, depth only; afterwards each marked piece wears its twin for the real pass. false: not
     *  ready yet (programs still compiling), nothing was drawn */
    depth(s, c) {
      swapped.length = 0; skipped.length = 0; list.length = 0;
      let cold = null;
      s.traverseVisible((m) => {
        if (!m.isMesh || !m.layers.isEnabled(PRE_LAYER) || !m.material.userData.lrPre) return;
        if (pre.reach && pre.plan && nearXZ(m, pre.plan) > pre.reach) { skipped.push(m); return; }   // far pieces: drawn as today
        list.push(m);
        const k = keyOf(m);
        if (!warm.has(k) && !warming.has(k)) (cold || (cold = new Map())).set(k, m);
        else if (!warm.has(k) && !cold) cold = new Map();
      });
      pre.info.warming = warming.size;
      if (cold) { if (cold.size) warmUp(cold); return false; }
      for (const m of list) { swapped.push(m, m.material); m.material = preOf(m.material); }
      const mask = c.layers.mask, bg = s.background, sh = renderer.shadowMap.autoUpdate, need = renderer.shadowMap.needsUpdate;
      c.layers.set(PRE_LAYER); s.background = null; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
      const c0 = renderer.info.render.calls;
      for (const m of skipped) m.visible = false;
      orig(s, c);
      for (const m of skipped) m.visible = true;
      pre.info.calls = renderer.info.render.calls - c0; pre.info.objects = swapped.length / 2;
      c.layers.mask = mask; s.background = bg; renderer.shadowMap.autoUpdate = sh; renderer.shadowMap.needsUpdate = need;
      for (let i = 0; i < swapped.length; i += 2) swapped[i].material = twinOf(swapped[i + 1]);
      return true;
    },
  };
  renderer.render = (s, c) => {
    if (!pre.active || inside || s !== scene || c !== camera) return orig(s, c);
    inside = true;
    const ac = renderer.autoClear, acd = renderer.autoClearDepth;
    try {
      if (ac) renderer.clear();
      renderer.autoClear = false;
      if (!pre.depth(s, c)) { renderer.autoClear = ac; return orig(s, c); }
      // a colour background clears the target at the start of every render (three.js forces it): keep the depth
      renderer.autoClearDepth = false;
      orig(s, c);
    } finally {
      for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
      renderer.autoClear = ac; renderer.autoClearDepth = acd;
      inside = false;
    }
  };
  return pre;
}

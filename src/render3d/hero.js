// Character assembler, ported from the approved hero mockup (D:\LQOnline\mockups3d_hero\js\hero.js).
// One skeleton (Quaternius Universal Base, 65 joints) drives the base body (head kept, covered parts cut away), hair,
// every outfit part (rebound by bone name) and every Universal Animation Library clip (same bone names; only the pelvis
// and root positions move, scaled to the wearer's hip height, so proportions stay the wearer's own).
//
//   const ch = await assemble(L, spec)   spec: { base: 'male'|'female', hair, beard, hairColor, skinTint,
//                                                parts: { head, body, arms, legs, feet, shoulders }, dye: { slot: opts },
//                                                map: { slot: 'tex/...jpg' } }
//   ch.o (root object), ch.bones, ch.mixer, ch.clip(name) -> AnimationClip for this body, ch.socket(bone, opts)
//   ch.post: [fn(ch)] after-animation fixes (cape re-shape, upright staff), ch.fx: [fn(dt, ch)] per-frame effects
import * as THREE from '../vendor/three/three.module.min.js';
import * as SkeletonUtils from '../vendor/three/addons/utils/SkeletonUtils.js';

export const BASES = {
  male: { url: 'ubc/Superhero_Male_FullBody.gltf', body: 'SuperHero_Male' },
  female: { url: 'ubc/Superhero_Female_FullBody.gltf', body: 'Superhero_Female' },
};
// which body region a slot covers (base-body triangles whose main bone is in a covered region are cut away)
const COVER = { body: 'torso', arms: 'arms', legs: 'legs', feet: 'feet' };
function regionOf(j) {
  if (/^(neck_01|Head)$/.test(j)) return 'head';
  if (/^(pelvis|spine_0\d|clavicle_[lr]|root)$/.test(j)) return 'torso';
  if (/^(upperarm|lowerarm|hand|index|middle|pinky|ring|thumb)/.test(j)) return 'arms';
  if (/^(thigh|calf)/.test(j)) return 'legs';
  return 'feet';
}
const maskCache = new Map();   // base|covered -> masked geometry (shared by every body with the same cover)
function maskBody(sm, covered, key) {
  if (maskCache.has(key)) { sm.geometry = maskCache.get(key); return; }
  const g = sm.geometry.clone();
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const names = sm.skeleton.bones.map((b) => b.name);
  const reg = new Array(si.count);
  for (let v = 0; v < si.count; v++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; best = si.getComponent(v, k); } }
    reg[v] = regionOf(names[best]);
  }
  const idx = g.index.array, out = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (covered.has(reg[a]) && covered.has(reg[b]) && covered.has(reg[c])) continue;
    out.push(a, b, c);
  }
  g.setIndex(out);
  maskCache.set(key, g);
  sm.geometry = g;
}
function rebind(piece, bones) {
  piece.traverse((sm) => {
    if (!sm.isSkinnedMesh) return;
    const sk = new THREE.Skeleton(sm.skeleton.bones.map((b) => bones[b.name]), sm.skeleton.boneInverses.map((m) => m.clone()));
    sm.bind(sk, sm.bindMatrix.clone());
  });
}

// ---------- dye and glow: one shader hook on the pack's own PBR material ----------
export function dyeMaterial(mat, { hue = 0, sat = 1, val = 1, tint = null, metalGlow = null, rim = null } = {}) {
  const U = {
    uHue: { value: hue }, uSat: { value: sat }, uVal: { value: val },
    uGlow: { value: new THREE.Color(metalGlow ? metalGlow[0] : '#000').multiplyScalar(metalGlow ? metalGlow[1] : 0) },
    uRim: { value: new THREE.Color(rim ? rim[0] : '#000').multiplyScalar(rim ? rim[1] : 0) }, uRimPow: { value: rim ? (rim[2] || 2.5) : 2.5 },
  };
  if (tint) mat.color.multiply(new THREE.Color(tint));
  mat.userData.dye = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uHue, uSat, uVal; uniform vec3 uGlow, uRim; uniform float uRimPow;
      vec3 lr_rgb2hsv(vec3 c){ vec4 K = vec4(0.0,-1.0/3.0,2.0/3.0,-1.0); vec4 p = mix(vec4(c.bg,K.wz), vec4(c.gb,K.xy), step(c.b,c.g)); vec4 q = mix(vec4(p.xyw,c.r), vec4(c.r,p.yzx), step(p.x,c.r)); float d = q.x - min(q.w,q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y)/(6.0*d+e)), d/(q.x+e), q.x); }
      vec3 lr_hsv2rgb(vec3 c){ vec4 K = vec4(1.0,2.0/3.0,1.0/3.0,3.0); vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 h = lr_rgb2hsv(max(diffuseColor.rgb, 0.0)); h.x = fract(h.x + uHue); h.y = clamp(h.y * uSat, 0.0, 1.0); h.z *= uVal; diffuseColor.rgb = lr_hsv2rgb(h); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += uGlow * smoothstep(0.35, 0.8, metalnessFactor);
      { float fr = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), uRimPow); totalEmissiveRadiance += uRim * fr; }`);
  };
  mat.customProgramCacheKey = () => 'lr_dye';
  mat.needsUpdate = true;
  return mat;
}

// ---------- clips: the library's clips for one body (pelvis height scaled) ----------
const clipCache = new Map();
export function clipFor(lib, name, pelvisLen) {
  const ck = name + '|' + pelvisLen.toFixed(4);
  if (clipCache.has(ck)) return clipCache.get(ck);
  const src = lib.get(name);
  if (!src) return null;
  const k = pelvisLen / lib.pelvisLen;
  const tracks = [];
  for (const t of src.tracks) {
    const [node, prop] = t.name.split('.');
    if (prop === 'scale') continue;
    if (prop === 'position') {
      if (node !== 'pelvis' && node !== 'root') continue;
      const c = t.clone();
      for (let i = 0; i < c.values.length; i++) c.values[i] *= k;
      tracks.push(c);
      continue;
    }
    tracks.push(t);
  }
  const clip = new THREE.AnimationClip(name, src.duration, tracks);
  clipCache.set(ck, clip);
  return clip;
}

// ---------- assemble ----------
export async function assemble(L, spec = {}) {
  const B = BASES[spec.base || 'male'];
  const [g, lib] = await Promise.all([L.gltf(B.url), L.clips()]);
  const parts = spec.parts || {};
  const urls = [];
  if (spec.hair) urls.push(['hair', `hair/${spec.hair}.gltf`]);
  if (spec.beard) urls.push(['beard', `hair/${spec.beard}.gltf`]);
  for (const [slot, file] of Object.entries(parts)) if (file) urls.push([slot, `mco/${file}.gltf`]);
  const loaded = await Promise.all(urls.map(([, u]) => L.gltf(u)));
  const maps = {};
  await Promise.all(Object.entries(spec.map || {}).map(async ([slot, u]) => { maps[slot] = await L.tex(u); }));

  const o = SkeletonUtils.clone(g.scene);
  const bones = {};
  o.traverse((b) => { if (b.isBone) bones[b.name] = b; });
  const arm = o.getObjectByName('Armature') || o;
  const covered = new Set(Object.entries(parts).filter(([k, v]) => v && COVER[k]).map(([k]) => COVER[k]));
  const own = [];
  o.traverse((m) => { if (m.isSkinnedMesh) own.push(m); });
  for (const m of own) if (m.name === B.body || (m.parent && m.parent.name === B.body)) maskBody(m, covered, `${spec.base}|${[...covered].sort().join(',')}`);
  const meshes = { base: own };
  urls.forEach(([slot], i) => {
    const src = loaded[i].scene.getObjectByName('Armature') || loaded[i].scene;
    const list = [];
    for (const c of src.children) {
      if (c.isBone || c.type === 'Bone' || c.name === 'root') continue;
      const piece = c.clone(true);
      rebind(piece, bones);
      arm.add(piece);
      list.push(piece);
    }
    meshes[slot] = list;
  });
  const mats = [];
  for (const [slot, list] of Object.entries(meshes)) {
    for (const p of list) p.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.material = m.material.clone();
      mats.push(m.material);
      const isSkin = /Regular|Superhero|SuperHero/.test(m.material.name);
      if (isSkin && spec.skinTint) m.material.color.multiply(new THREE.Color(spec.skinTint));
      if ((slot === 'hair' || slot === 'beard' || /Hair/.test(m.material.name)) && spec.hairColor && !/Eyes/.test(m.material.name)) m.material.color.set(spec.hairColor);
      if (!isSkin && maps[slot] && /Peasant|Ranger/.test(m.material.name)) m.material.map = maps[slot];
      if (!isSkin && spec.dye && spec.dye[slot]) dyeMaterial(m.material, spec.dye[slot]);
    });
  }
  const mixer = new THREE.AnimationMixer(o);
  const ch = { o, bones, mixer, meshes, mats, post: [], fx: [], spec, lib };
  ch.pelvisLen = bones.pelvis.position.length();
  ch.clip = (name) => clipFor(lib, name, ch.pelvisLen);
  ch.applyPost = () => { if (!ch.post.length) return; o.updateMatrixWorld(true); for (const f of ch.post) f(ch); };
  ch.socket = (boneName, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) => {
    const h = new THREE.Group(); h.position.set(...pos); h.rotation.set(...rot); h.scale.setScalar(scale);
    bones[boneName].add(h);
    return h;
  };
  return ch;
}

// ---------- cape: built in code, re-shaped every frame from the live skeleton and pushed out of the body ----------
// Not a cloth simulation: it hangs from the shoulders, flares back by a drag amount (more when running), and every
// vertex is pushed out of capsules round the torso and legs. The mesh lives in world space (parent: `layer`).
export function addCape(ch, layer, { map = null, color = '#ffffff', len = 1.08, top = 0.36, bottom = 0.62, flare = 0.15, cols = 8, rows = 12, emissive = null } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1, cols, rows);
  const mat = new THREE.MeshStandardMaterial({ color, map, roughness: 0.92, side: THREE.DoubleSide });
  if (emissive) { mat.emissive = new THREE.Color(emissive); mat.emissiveMap = map; mat.emissiveIntensity = 0.14; }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
  layer.add(mesh);
  const B = ch.bones;
  const P = geo.attributes.position, W = cols + 1;
  const tmp = new THREE.Vector3(), ab = new THREE.Vector3(), ap = new THREE.Vector3(), c = new THREE.Vector3();
  const pts = Array.from({ length: (rows + 1) * W }, () => new THREE.Vector3());
  const wp = {}; const names = ['upperarm_l', 'upperarm_r', 'neck_01', 'spine_01', 'spine_03', 'pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
  for (const n of names) wp[n] = new THREE.Vector3();
  const caps = [['spine_01', 'spine_03', 0.16], ['pelvis', 'spine_01', 0.17], ['thigh_l', 'calf_l', 0.105], ['thigh_r', 'calf_r', 0.105], ['calf_l', 'foot_l', 0.08], ['calf_r', 'foot_r', 0.08]];
  const state = { flare, sway: 0 };
  const right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), mid = new THREE.Vector3();
  const reshape = () => {
    for (const n of names) B[n].getWorldPosition(wp[n]);
    right.copy(wp.upperarm_r).sub(wp.upperarm_l); const shoulderW = right.length() * 0.75; right.normalize();
    up.copy(wp.neck_01).sub(wp.spine_01).normalize();
    back.crossVectors(right, up).normalize();
    mid.copy(wp.upperarm_l).add(wp.upperarm_r).multiplyScalar(0.5); mid.y = wp.neck_01.y - 0.02;
    tmp.copy(wp.spine_03).sub(mid); mid.addScaledVector(back, Math.max(0.1, tmp.dot(back) + 0.13));
    const segLen = len / rows;
    for (let j = 0; j < W; j++) {
      const u = j / cols - 0.5;
      pts[j].copy(mid).addScaledVector(right, u * Math.max(top, shoulderW * 0.9)).addScaledVector(back, -Math.cos(u * Math.PI) * 0.04 + 0.04);
    }
    for (let i = 1; i <= rows; i++) {
      const t = i / rows, w = top + (bottom - top) * Math.min(1, t * 1.4);
      for (let j = 0; j < W; j++) {
        const u = j / cols - 0.5, prev = pts[(i - 1) * W + j];
        const fold = Math.sin(u * Math.PI * 4 + 0.6) * 0.035 * t;
        const p = pts[i * W + j];
        p.copy(pts[j]).addScaledVector(right, u * (w - top)).addScaledVector(down, t * len * 0.98)
          .addScaledVector(back, state.flare * t * t * len + fold + 0.02 * t).addScaledVector(right, state.sway * t * t);
        tmp.copy(p).sub(prev); const d = tmp.length(); if (d > segLen * 1.06) p.copy(prev).addScaledVector(tmp, segLen * 1.06 / d);
        for (const [a, b, r] of caps) {
          const A = wp[a], Bp = wp[b];
          ab.copy(Bp).sub(A); ap.copy(p).sub(A);
          const h = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
          c.copy(A).addScaledVector(ab, h); tmp.copy(p).sub(c);
          const dd = tmp.length(), rr = r + 0.03;
          if (dd < rr) { if (dd < 1e-4) tmp.copy(back); else tmp.multiplyScalar(1 / dd); p.copy(c).addScaledVector(tmp, rr); }
        }
      }
    }
    for (let k = 0; k < pts.length; k++) P.setXYZ(k, pts[k].x, pts[k].y, pts[k].z);
    P.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
  };
  ch.post.push(reshape);
  ch.cape = { mesh, state, reshape };
  return mesh;
}

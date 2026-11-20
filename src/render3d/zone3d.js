// Zone builder: turns a zone's tile and map data (docs/CONTRACTS.md section 6) into a 3D scene. A rough first pass at
// the zone shape: the ground is painted per tile, water and cobbles are meshes, fences follow the fence tiles, cliffs
// become rock walls, buildings are assembled from Medieval Village MegaKit wall and roof pieces sized to their map
// footprint, and trees, bushes, rocks and props come from the Stylized Nature and Fantasy Props kits.
//
//   const z = await buildZone(L, zone, { tilesDb, quality, yieldFn })   tilesDb: assets/tiles/tiles.json
//   z.group (add to the scene), z.lamps ([{ pos: Vector3, color, k }] light spots), z.halo (lamp halos: .opacity), z.dispose()
//   z.buildings ([{ id, x0, z0, w, d, top }]: footprint in m and roof top, id = its fade slot for setBuildingFade), z.town
//
// One world unit is one metre and one tile (16 px). Repeated models are instanced per 48 m chunk and one-off groups
// are merged per material per chunk, so the town is a few dozen draw calls and off-screen chunks are culled.
// The ground is one plane with a splat shader: per-tile colour and class weights (grass, dirt, stone, sand) from the
// tile data, tileable detail textures per class, noise-broken edges and large-scale colour patches. The build yields
// to the frame loop every few milliseconds (yieldFn) so a zone can be built while the player walks.
import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { WINDOW_LIT } from './loader.js';
import { dyeMaterial } from './hero.js';
import { canvasTex, groundDetail, radial, waterNormal, woodTex } from './textures.js';

const CH = 48;   // chunk size (m): the town is one chunk, the big fields a few
const FLOOR_H = 3.12;

// ground colours per terrain id (linear-ish sRGB hex); unknown ids fall back to the zone's `under`
const GROUND = {
  grass: '#4d6a33', tallgrass: '#44602c', dirt: '#7a603f', plaza: '#6e675d', sand: '#b19c70', water: '#1d3242', shallow: '#3a5a62',
  ink: '#241a3a', moss: '#3d5a2a', x1_moor_turf: '#59603a', x1_heath: '#5e4a52', x1_bracken: '#76592c', x1_peat: '#3b2b1f',
  x1_tarn: '#1f2f3a', x1_drystone: '#6a6660', cliff_top: '#4d6a33', cliff_face: '#5a5048', x1_crag_top: '#66604f', x1_crag_face: '#4a4440',
  cliff_stairs_top: '#7a603f', cliff_stairs_mid: '#7a603f', cliff_stairs_bot: '#7a603f', ledge_s_a: '#4d6a33', ledge_s_m: '#4d6a33', ledge_s_b: '#4d6a33',
};
const WATER = new Set(['water', 'shallow', 'x1_tarn']);

// shared materials for code-built props (shared so the merger can batch them)
const MAT = {
  iron: new THREE.MeshStandardMaterial({ color: '#25211f', roughness: 0.55, metalness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffae4a', emissiveIntensity: 1.0, roughness: 0.3, name: 'lr_lampglass' }),
  wood: new THREE.MeshStandardMaterial({ color: '#ffffff', map: woodTex('#6a4a2c'), roughness: 0.85 }),
  darkWood: new THREE.MeshStandardMaterial({ color: '#ffffff', map: woodTex('#3e2a1a'), roughness: 0.85 }),
  stone: new THREE.MeshStandardMaterial({ color: '#6a655e', roughness: 0.95, flatShading: true }),
  darkStone: new THREE.MeshStandardMaterial({ color: '#46423e', roughness: 0.95, flatShading: true }),
  hay: new THREE.MeshStandardMaterial({ color: '#c8a050', roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: '#3d6f8c', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.8, normalMap: waterNormal(), normalScale: new THREE.Vector2(0.55, 0.55) }),
  shallow: new THREE.MeshStandardMaterial({ color: '#6aa0b0', roughness: 0.14, metalness: 0.05, transparent: true, opacity: 0.55, normalMap: waterNormal(), normalScale: new THREE.Vector2(0.35, 0.35) }),
  ink: new THREE.MeshStandardMaterial({ color: '#2a1a50', roughness: 0.08, metalness: 0.2, emissive: '#3a1a7a', emissiveIntensity: 0.25, transparent: true, opacity: 0.88, normalMap: waterNormal(), normalScale: new THREE.Vector2(0.4, 0.4) }),
  cloth: new THREE.MeshStandardMaterial({ color: '#8a3a2a', roughness: 0.9 }),
  fire: new THREE.MeshBasicMaterial({ color: '#ffb050' }),
};
export const LAMP_GLASS = MAT.glass;
// water ripples: one shared normal map scrolled every frame (the renderer calls tickWater with the fx clock)
const RIPPLE = waterNormal();
RIPPLE.repeat.set(0.25, 0.25);
/** Scroll the water ripples (t: seconds). */
export function tickWater(t) { RIPPLE.offset.set(t * 0.011, t * 0.017); }


// See-through, the action-RPG cutaway: static scenery between the camera and the hero (and the hero's target) is
// faded to about 25% coverage inside a soft cone that widens toward them, so canopies, roofs and walls never hide the
// fight. Ordered (Bayer 4x4) dithering stands in for alpha so merged and instanced meshes need no sorting. The ground
// layer (below 0.3 m) never fades. Shadows are untouched (the depth pass is not patched).
//
// Building cutaway (every zone with houses): each merged building piece carries its building's slot (vertex
// attribute lrBld, 0 for everything else). The renderer sets a fade per building (setBuildingFade, 0..1) when the
// hero, the target or a quest NPC stands behind or beside it; the same dither then thins that building's roof and upper walls (above about 1.3 m)
// as a whole, so its lower walls still show what blocks the way.
const BLD_N = 32;                       // fade slots: a 32x32 texture, slot 0 unused (ids cycle 1..1023 across zones)
const bldData = new Uint8Array(BLD_N * BLD_N * 4);
const BLD_TEX = new THREE.DataTexture(bldData, BLD_N, BLD_N, THREE.RGBAFormat, THREE.UnsignedByteType);
BLD_TEX.magFilter = BLD_TEX.minFilter = THREE.NearestFilter; BLD_TEX.generateMipmaps = false; BLD_TEX.needsUpdate = true;
let bldNext = 1, bldDirty = false;
const bldSlot = () => { const id = bldNext; bldNext = bldNext >= BLD_N * BLD_N - 1 ? 1 : bldNext + 1; bldData[id * 4] = 0; bldDirty = true; return id; };
/** Fade one building's roof and upper walls: k 0 (solid) .. 1 (cut away). */
export function setBuildingFade(id, k) {
  const v = Math.max(0, Math.min(255, Math.round(k * 255)));
  if (id > 0 && bldData[id * 4] !== v) { bldData[id * 4] = v; bldDirty = true; }
}
/** Upload the building fades changed this frame (once per frame, before rendering). */
export function flushBuildingFade() { if (bldDirty) { BLD_TEX.needsUpdate = true; bldDirty = false; } }
export const BLD_CUT = { lo: 1.3, hi: 1.8, floor: 0.12 };   // the cut starts at lo..hi m; a fully faded roof keeps 12% coverage
export const SEE = {
  uCam: { value: new THREE.Vector3() }, uFocus: { value: new THREE.Vector3() }, uSeeR: { value: 2.8 },
  uFocus2: { value: new THREE.Vector3() }, uSeeR2: { value: 0 }, uBld: { value: BLD_TEX },
};
const patched = new WeakSet();
function seeThrough(mat) {
  if (patched.has(mat)) return;
  patched.add(mat);
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, SEE);
    if (sh.vertexShader.includes('vLrW')) return;   // a clone that copied an already patched hook (tinted kit pieces)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vLrW; varying float vLrBld;
#ifndef USE_INSTANCING
attribute float lrBld;
#endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 lrW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        lrW = instanceMatrix * lrW; vLrBld = 0.0;
      #else
        vLrBld = lrBld;
      #endif
        vLrW = (modelMatrix * lrW).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLrW; varying float vLrBld; uniform sampler2D uBld;
uniform vec3 uCam; uniform vec3 uFocus; uniform float uSeeR; uniform vec3 uFocus2; uniform float uSeeR2;
float lrB2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float lrBayer(vec2 a) { return lrB2(0.5 * a) * 0.25 + lrB2(a); }
float lrCover(vec3 P, vec3 F, float R) {
  if (R <= 0.0) return 1.0;
  vec3 d = F - uCam; float L = length(d); vec3 n = d / L; float t = dot(P - uCam, n);
  if (t <= 0.0 || t > L - 0.45) return 1.0;
  float Rt = R * smoothstep(0.2, 0.75, t / L);
  return mix(0.25, 1.0, smoothstep(Rt * 0.55, Rt, length(P - (uCam + n * t))));
}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if (vLrW.y > 0.3) {
        float lrC = min(lrCover(vLrW, uFocus, uSeeR), lrCover(vLrW, uFocus2, uSeeR2));
        if (vLrBld > 0.5) {
          float lrI = floor(vLrBld + 0.5);
          float lrF = texture2D(uBld, (vec2(mod(lrI, ${BLD_N}.0), floor(lrI / ${BLD_N}.0)) + 0.5) / ${BLD_N}.0).r;
          lrC = min(lrC, 1.0 - lrF * (1.0 - ${BLD_CUT.floor.toFixed(3)}) * smoothstep(${BLD_CUT.lo.toFixed(2)}, ${BLD_CUT.hi.toFixed(2)}, vLrW.y));
        }
        if (lrC < 0.999 && lrC <= lrBayer(gl_FragCoord.xy) + 0.001) discard;
      }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|lr_see3';
  mat.needsUpdate = true;
}

const hashXY = (x, y, s = 0) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1103515245)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Geometry + material pieces of a loaded model (cached), with its bounding box. */
function makeProtoCache(L) {
  const protos = new Map();
  return async (url) => {
    if (!protos.has(url)) {
      protos.set(url, L.gltf(url).then((g) => {
        const root = g.scene; root.updateMatrixWorld(true);
        const parts = [];
        // the nature kit keeps wind data in its vertex colours: never draw them as colour
        const wind = /^nature\//.test(url);
        root.traverse((m) => {
          if (!m.isMesh || m.isSkinnedMesh) return;
          let geometry = m.geometry;
          if (wind && geometry.attributes.color) { geometry = geometry.clone(); geometry.deleteAttribute('color'); m.material.vertexColors = false; }
          // the twisted tree's leaves are autumn red: one hue turn makes them the willow and hedge green of the valley
          if (m.material.name === 'Leaves_TwistedTree' && !m.material.userData.dye) dyeMaterial(m.material, { hue: 0.26, sat: 0.75, val: 0.8 });
          parts.push({ geometry, material: m.material, matrix: m.matrixWorld.clone() });
        });
        const box = new THREE.Box3().setFromObject(root);
        return { parts, box, url };
      }));
    }
    return protos.get(url);
  };
}

/** Collects instances per (model part, tint, chunk) and one-off meshes per (material, chunk); builds them at the end. */
function makeBatcher(group, { shadows }) {
  const inst = new Map(), merge = new Map(), tinted = new Map();
  const chunk = (x, z) => `${Math.floor(x / CH)},${Math.floor(z / CH)}`;
  const tintMat = (mat, tint) => {
    if (!tint) return mat;
    const k = mat.uuid + tint;
    if (!tinted.has(k)) { const m = mat.clone(); m.color.multiply(new THREE.Color(tint)); if (mat.userData.dye) { m.onBeforeCompile = mat.onBeforeCompile; m.customProgramCacheKey = mat.customProgramCacheKey; } tinted.set(k, m); }
    return tinted.get(k);
  };
  const tmp = new THREE.Matrix4(), pos = new THREE.Vector3();
  return {
    /** an instance of a model: world matrix of its root */
    instance(proto, m4, { tint = null, cast = true, tintMatch = null } = {}) {
      pos.setFromMatrixPosition(m4);
      const c = chunk(pos.x, pos.z);
      proto.parts.forEach((p, i) => {
        const tm = !tint || !tintMatch || tintMatch.test(p.material.name) ? tint : null;
        const k = `${proto.url}#${i}|${tm}|${c}|${cast}`;
        if (!inst.has(k)) inst.set(k, { geometry: p.geometry, material: tintMat(p.material, tm), list: [], cast });
        inst.get(k).list.push(tmp.multiplyMatrices(m4, p.matrix).clone());
      });
    },
    /** merge a one-off model or a code-built group (world matrix applied) */
    mergeModel(proto, m4, { tint = null, bld = 0 } = {}) {
      for (const p of proto.parts) this.mergeGeo(p.geometry, tintMat(p.material, tint), tmp.multiplyMatrices(m4, p.matrix), true, bld);
    },
    mergeGroup(g) {
      g.updateMatrixWorld(true);
      g.traverse((m) => { if (m.isMesh) this.mergeGeo(m.geometry, m.material, m.matrixWorld); });
    },
    mergeGeo(geo, mat, m4, cast = true, bld = 0) {
      pos.setFromMatrixPosition(m4);
      const k = `${mat.uuid}|${chunk(pos.x, pos.z)}|${cast}`;
      if (!merge.has(k)) merge.set(k, { material: mat, geos: [], cast });
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.setAttribute('lrBld', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(bld), 1));   // building slot (cutaway)
      g.applyMatrix4(m4);
      merge.get(k).geos.push(g);
    },
    async finish(step = null) {
      let calls = 0;
      for (const v of inst.values()) seeThrough(v.material);
      for (const v of merge.values()) seeThrough(v.material);
      for (const v of inst.values()) {
        const im = new THREE.InstancedMesh(v.geometry, v.material, v.list.length);
        v.list.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere(); im.computeBoundingBox();
        im.castShadow = shadows && v.cast; im.receiveShadow = true;
        group.add(im); calls++;
        if (step) await step();
      }
      for (const v of merge.values()) {
        // geometries must share attribute sets: add a white colour to those without one when any has it
        const hasColor = v.geos.some((g) => g.attributes.color);
        for (const g of v.geos) {
          if (hasColor && !g.attributes.color) { const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
          if (!hasColor && g.attributes.color) g.deleteAttribute('color');
          if (g.attributes.color && g.attributes.color.itemSize !== 3) {
            const a = g.attributes.color, c = new Float32Array(a.count * 3);
            for (let i = 0; i < a.count; i++) { c[i * 3] = a.getX(i); c[i * 3 + 1] = a.getY(i); c[i * 3 + 2] = a.getZ(i); }
            g.setAttribute('color', new THREE.BufferAttribute(c, 3));
          }
        }
        let geo = null;
        try { geo = mergeGeometries(v.geos, false); } catch { geo = null; }
        if (!geo) { for (const g of v.geos) { const m = new THREE.Mesh(g, v.material); m.castShadow = shadows && v.cast; m.receiveShadow = true; group.add(m); calls++; } continue; }
        const m = new THREE.Mesh(geo, v.material);
        m.castShadow = shadows && v.cast; m.receiveShadow = true;
        group.add(m); calls++;
        if (step) await step();
      }
      return calls;
    },
  };
}

const M4 = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

// ---------- the ground ----------
// ground class per terrain id: 0 grass (the default), 1 dirt, 2 stone, 3 sand
const CLASS = {
  dirt: 1, x1_peat: 1, x1_bracken: 1, cliff_stairs_top: 1, cliff_stairs_mid: 1, cliff_stairs_bot: 1,
  plaza: 2, x1_drystone: 2, cliff_face: 2, x1_crag_face: 2, x1_crag_top: 2,
  sand: 3, water: 3, shallow: 3, x1_tarn: 3, ink: 3,
};
const WORN = new THREE.Color('#3e3426');
/** Per-tile colour and per-tile class weights, one pixel per tile (the shader smooths and breaks the edges). */
function paintGround(zone, terrainAt, wear = null) {
  const W = zone.w, H = zone.h;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const col = mk(), wts = mk();
  const cg = col.getContext('2d'), wg = wts.getContext('2d');
  const ci = cg.createImageData(W, H), wi = wg.createImageData(W, H);
  const c = new THREE.Color(), srgb = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = terrainAt(x, y), i = (y * W + x) * 4;
    c.set(GROUND[id] || GROUND[zone.under] || GROUND.grass);
    c.offsetHSL((hashXY(x, y, 3) - 0.5) * 0.02, (hashXY(x, y, 5) - 0.5) * 0.06, (hashXY(x, y, 7) - 0.5) * 0.07);
    if (wear && wear[y * W + x] > 0) c.lerp(WORN, wear[y * W + x] * 0.45);
    c.getRGB(srgb, THREE.SRGBColorSpace);
    ci.data[i] = srgb.r * 255; ci.data[i + 1] = srgb.g * 255; ci.data[i + 2] = srgb.b * 255; ci.data[i + 3] = 255;
    const k = CLASS[id] || 0;
    wi.data[i] = k === 1 ? 255 : 0; wi.data[i + 1] = k === 2 ? 255 : 0; wi.data[i + 2] = k === 3 ? 255 : 0; wi.data[i + 3] = 255;
  }
  cg.putImageData(ci, 0, 0); wg.putImageData(wi, 0, 0);
  const tc = new THREE.CanvasTexture(col); tc.colorSpace = THREE.SRGBColorSpace;
  const tw = new THREE.CanvasTexture(wts);
  for (const t of [tc, tw]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; }
  return { color: tc, weights: tw };
}
function groundMaterial({ color, weights }, W, H) {
  const D = groundDetail();
  const mat = new THREE.MeshStandardMaterial({ map: color, roughness: 0.96, metalness: 0 });
  const U = { tW: { value: weights }, tGrass: { value: D.grass }, tDirt: { value: D.dirt }, tStone: { value: D.stone }, tSand: { value: D.sand }, tMacro: { value: D.macro }, uSize: { value: new THREE.Vector2(W, H) } };
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tW, tGrass, tDirt, tStone, tSand, tMacro; uniform vec2 uSize;')
      .replace('#include <map_fragment>', `
      {
        vec2 tc = vMapUv * uSize;                                   // tile coordinates (1 unit = 1 m)
        vec4 mac = texture2D(tMacro, tc * 0.035);
        vec4 jn = texture2D(tMacro, tc * 0.19 + vec2(0.31, 0.77));
        vec2 uv = vMapUv + (jn.rg - 0.5) * 1.15 / uSize;            // noise-broken class edges
        vec3 base = texture2D(map, uv).rgb;
        vec3 w = smoothstep(0.28, 0.72, texture2D(tW, uv).rgb);
        float wg = clamp(1.0 - w.r - w.g - w.b, 0.0, 1.0);
        vec2 q = tc * 0.5;
        vec3 det = texture2D(tGrass, q).rgb * wg + texture2D(tDirt, q * 0.85).rgb * w.r + texture2D(tStone, q * 0.6).rgb * w.g + texture2D(tSand, q).rgb * w.b;
        det /= max(0.001, wg + w.r + w.g + w.b);
        vec3 col = base * det * 2.0 * (0.8 + mac.r * 0.4);
        col *= mix(vec3(1.0), vec3(1.14, 1.05, 0.7), smoothstep(0.5, 0.78, mac.g) * wg * 0.7);   // dry grass patches
        col *= mix(vec3(1.0), vec3(0.78, 0.86, 0.74), smoothstep(0.55, 0.85, 1.0 - mac.g) * wg * 0.6); // lush dark patches
        col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))) * vec3(1.02, 1.0, 0.92), 0.2 * wg) * mix(1.0, 0.9, wg);       // less candy green
        diffuseColor.rgb *= col;
      }`);
  };
  mat.customProgramCacheKey = () => 'lr_ground2';
  return mat;
}

/** The zone's water surface: colour per kind from the mask, alpha fading at the shore, a foam line, scrolling ripples. */
function waterMaterial(mask, W, H) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, metalness: 0.1, transparent: true, depthWrite: false, normalMap: RIPPLE, normalScale: new THREE.Vector2(0.5, 0.5) });
  const U = { tWM: { value: mask }, tJit: { value: groundDetail().macro }, uSize: { value: new THREE.Vector2(W, H) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 lrWorld; varying vec2 vWM; varying vec2 vWW;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWM = uv; vWW = lrWorld;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tWM, tJit; uniform vec2 uSize; varying vec2 vWM; varying vec2 vWW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec4 j = texture2D(tJit, vWW * 0.17 + vec2(0.13, 0.61));
        vec3 m = texture2D(tWM, vWM + (j.rg - 0.5) * 1.1 / uSize).rgb;
        float a = max(m.r, max(m.g, m.b));
        float edge = smoothstep(0.32, 0.6, a);
        vec3 c = (vec3(0.11, 0.24, 0.31) * m.r + vec3(0.25, 0.42, 0.45) * m.g + vec3(0.13, 0.07, 0.24) * m.b) / max(0.001, m.r + m.g + m.b);
        c *= mix(1.0, 0.7, smoothstep(0.75, 1.0, m.r));                    // deeper toward the middle
        float foam = (1.0 - smoothstep(0.0, 0.16, abs(a - 0.47))) * (0.55 + 0.45 * j.b);
        diffuseColor.rgb = mix(c, vec3(0.78, 0.84, 0.82), foam * 0.6);
        diffuseColor.a = edge * mix(0.84, 0.6, m.g / max(0.001, a));
        if (diffuseColor.a < 0.01) discard;
      }`);
  };
  mat.customProgramCacheKey = () => 'lr_water2';
  return mat;
}

// ---------- buildings from the kit ----------
const STYLE = {
  brick: { ground: { win: 'Wall_UnevenBrick_Window_Wide_Round', door: 'Wall_UnevenBrick_Door_Round', wall: 'Wall_UnevenBrick_Straight', glass: 'Window_Wide_Round1' }, corner: 'Corner_Exterior_Brick' },
  plaster: { ground: { win: 'Wall_Plaster_Window_Wide_Round', door: 'Wall_Plaster_Door_Round', wall: 'Wall_Plaster_Straight', glass: 'Window_Wide_Round1' }, corner: 'Corner_Exterior_Wood' },
};
const UPPER = { win: 'Wall_Plaster_Window_Wide_Flat', grid: 'Wall_Plaster_WoodGrid', wall: 'Wall_Plaster_Straight', glass: 'Window_Wide_Flat1' };
const ROOFS = ['Roof_RoundTiles_4x4', 'Roof_RoundTiles_4x6', 'Roof_RoundTiles_4x8', 'Roof_RoundTiles_6x6', 'Roof_RoundTiles_6x8', 'Roof_RoundTiles_6x10', 'Roof_RoundTiles_8x8', 'Roof_RoundTiles_8x10', 'Roof_RoundTiles_8x12'];
const BUILDING = {
  house_small: { style: 'brick', floors: 1 }, house_medium: { style: 'brick', floors: 1 }, house_large: { style: 'brick', floors: 2 },
  hero_home: { style: 'plaster', floors: 1 }, bakery: { style: 'plaster', floors: 1, chimney: true }, item_shop: { style: 'brick', floors: 1 },
  smithy: { style: 'brick', floors: 1, chimney: true }, inn: { style: 'brick', floors: 2, chimney: true }, library: { style: 'brick', floors: 2 },
  chapel_bell_tower: { style: 'plaster', floors: 1, tower: true }, x1_cottage_a: { style: 'plaster', floors: 1 }, x1_cottage_b: { style: 'plaster', floors: 1, chimney: true },
  x1_loomhouse: { style: 'plaster', floors: 2 }, x1_turf_hut: { style: 'plaster', floors: 1, low: true }, x1_watchtower: { style: 'brick', floors: 3, tower: true, solidTower: true },
};

// Towns are drawn lower than the kit's 3.12 m storeys so the lanes stay readable from above: the ground floor keeps
// most of its height (the doors stay taller than the hero), the upper floors and the roof give up more. About 0.78 of
// the full height overall. The footprint never changes, so the walls still stand where the collision map blocks.
const TOWN_H = { ground: 0.85, upper: 0.72, roof: 0.75 };
const EAVE = 0.12;   // roof overhang past the footprint (m per side): a sliver over the lane, no more

/** One house from kit pieces on the footprint (x0, z0, w, d). Returns its bounds for the cutaway. */
async function buildHouse(P, B, def, x0, z0, w, d, doorCol, seed, { town = false, bld = 0 } = {}) {
  const st = STYLE[def.style];
  const nx = Math.max(1, Math.round(w / 2)), nz = Math.max(1, Math.round(d / 2));
  const sx = w / (nx * 2), sz = d / (nz * 2);
  const low = def.low ? 0.8 : 1;
  // storey heights (world m) and the y scale each storey's pieces get
  const fy = [];
  let top = 0;
  for (let f = 0; f < def.floors; f++) { const k = low * (town ? (f === 0 ? TOWN_H.ground : TOWN_H.upper) : 1); fy.push({ y: top, k }); top += FLOOR_H * k; }
  const roofK = low * (town ? TOWN_H.roof : 1);
  const cx = x0 + w / 2, cz = z0 + d / 2;
  const floorRoot = (f) => new THREE.Matrix4().compose(new THREE.Vector3(cx, fy[f].y, cz), new THREE.Quaternion(), new THREE.Vector3(sx, fy[f].k, sz));
  const put = async (f, name, lx, ly, lz, ry) => { const pr = await P(`village/${name}.gltf`); B.mergeModel(pr, floorRoot(f).multiply(M4(lx, ly, lz, ry)), { bld }); };
  const W2 = nx, D2 = nz;
  const door = Math.max(0, Math.min(nx - 1, Math.floor(doorCol / 2)));
  const jobs = [];
  for (let f = 0; f < def.floors; f++) {
    for (let i = 0; i < nx; i++) {
      const lx = -W2 + 1 + i * 2;
      let nm, glass = null;
      if (f === 0) { nm = i === door ? st.ground.door : (hashXY(i, seed) < 0.75 ? st.ground.win : st.ground.wall); if (nm === st.ground.win) glass = st.ground.glass; }
      else { nm = (i + f) % 2 ? UPPER.grid : UPPER.win; if (nm === UPPER.win) glass = UPPER.glass; }
      jobs.push(put(f, nm, lx, 0, D2, 0));
      // window frames sit back so they stand out of the wall face by a sliver, not over the lane
      if (glass) jobs.push(P(`village/${glass}.gltf`).then((pr) => put(f, glass, lx, 0, D2 - Math.max(0, pr.box.max.z - 0.12) / sz, 0)));
      if (f === 0 && i === door) jobs.push(put(f, 'Door_1_Round', lx - 0.53, 0, D2, 0));
      jobs.push(put(f, f === 0 ? st.ground.wall : UPPER.wall, lx, 0, -D2, Math.PI));
    }
    for (let j = 0; j < nz; j++) {
      const lz = -D2 + 1 + j * 2;
      jobs.push(put(f, f === 0 ? st.ground.wall : UPPER.wall, W2, 0, lz, Math.PI / 2));
      jobs.push(put(f, f === 0 ? st.ground.wall : UPPER.wall, -W2, 0, lz, -Math.PI / 2));
    }
    // corner posts turned to wrap each corner (the brick post is built for the south-west one) and, for the chunky
    // brick post, set in a little so it stands flush with the walls instead of jutting into the lane
    const ins = st.corner === 'Corner_Exterior_Brick' ? 0.24 : 0;
    for (const [ccx, ccz, ry] of [[-W2, D2, 0], [W2, D2, Math.PI / 2], [W2, -D2, Math.PI], [-W2, -D2, -Math.PI / 2]]) jobs.push(put(f, st.corner, ccx - Math.sign(ccx) * ins, 0, ccz - Math.sign(ccz) * ins, ry));
  }
  await Promise.all(jobs);
  // roof: the kit roof whose plan best fits the house, scaled to the footprint plus a small eave, sitting on the walls
  let roofTop = top;
  if (def.tower) {
    const pr = await P('village/Roof_Tower_RoundTiles.gltf');
    const b = pr.box, bw = b.max.x - b.min.x, bd = b.max.z - b.min.z;
    const kx = (w + EAVE * 2) / bw, kz = (d + EAVE * 2) / bd, ky = Math.min(kx, kz) * roofK;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx - (b.min.x + b.max.x) / 2 * kx, top - b.min.y * ky, cz - (b.min.z + b.max.z) / 2 * kz), new THREE.Quaternion(), new THREE.Vector3(kx, ky, kz));
    B.mergeModel(pr, m, { bld });
    roofTop = top + (b.max.y - b.min.y) * ky;
  } else {
    const want = [w + EAVE * 2, d + EAVE * 2];
    let best = null;
    for (const name of ROOFS) {
      const pr = await P(`village/${name}.gltf`);
      const b = pr.box, bw = b.max.x - b.min.x, bd = b.max.z - b.min.z;
      for (const rot of [0, 1]) {
        const [rw, rd] = rot ? [bd, bw] : [bw, bd];
        const err = Math.abs(Math.log((rw / rd) / (want[0] / want[1]))) + Math.abs(Math.log(rw / want[0])) * 0.3;
        if (!best || err < best.err) best = { pr, rot, err, rw, rd };
      }
    }
    const b = best.pr.box;
    const kx = want[0] / best.rw, kz = want[1] / best.rd, ky = Math.min(kx, kz) * roofK;
    const bcx = (b.min.x + b.max.x) / 2, bcz = (b.min.z + b.max.z) / 2;
    const rot = new THREE.Matrix4().makeRotationY(best.rot ? Math.PI / 2 : 0);
    const scl = new THREE.Matrix4().makeScale(best.rot ? kz : kx, ky, best.rot ? kx : kz);
    const cen = new THREE.Matrix4().makeTranslation(-bcx, -b.min.y, -bcz);
    const at = new THREE.Matrix4().makeTranslation(cx, top, cz);
    B.mergeModel(best.pr, at.multiply(rot).multiply(scl).multiply(cen), { bld });
    roofTop = top + (b.max.y - b.min.y) * ky;
  }
  if (def.chimney) {
    const pr = await P('village/Prop_Chimney.gltf');
    const k = roofK, m = new THREE.Matrix4().compose(new THREE.Vector3(cx + (W2 - 0.8) * sx, top + 0.6 * k, cz + (-D2 + 0.8) * sz), new THREE.Quaternion(), new THREE.Vector3(1, k, 1));
    B.mergeModel(pr, m, { bld });
  }
  return { id: bld, x0, z0, w, d, top: roofTop };
}

// ---------- code-built props ----------
function lampPost(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.35, 8), MAT.iron); base.position.y = 0.17; g.add(base);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 3.0, 8), MAT.iron); post.position.y = 1.6; g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.62), MAT.iron); arm.position.set(0, 2.95, 0.3); g.add(arm);
  const lb = new THREE.Group(); lb.position.set(0, 2.62, 0.56); g.add(lb);
  lb.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), MAT.glass));
  for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.03), MAT.iron); b.position.set(bx * 0.1, 0, bz * 0.1); lb.add(b); }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.16, 4), MAT.iron); cap.rotation.y = Math.PI / 4; cap.position.y = 0.22; lb.add(cap);
  return { g, light: new THREE.Vector3(x, 2.62, z + 0.56) };
}
function well(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.8, 12, 1, true), MAT.stone); ring.position.y = 0.4; g.add(ring);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.1, 6, 12), MAT.stone); rim.rotation.x = Math.PI / 2; rim.position.y = 0.8; g.add(rim);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), MAT.water); water.rotation.x = -Math.PI / 2; water.position.y = 0.5; g.add(water);
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), MAT.darkWood); p.position.set(sx * 0.7, 1.0, 0); g.add(p); }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.7, 4), MAT.darkWood); roof.rotation.y = Math.PI / 4; roof.position.y = 2.2; g.add(roof);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), MAT.wood); beam.rotation.z = Math.PI / 2; beam.position.y = 1.55; g.add(beam);
  return g;
}
function post(x, z, h = 1.6, board = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), MAT.darkWood); p.position.y = h / 2; g.add(p);
  if (board) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.06), MAT.wood); b.position.set(0, h - 0.3, 0.07); g.add(b); }
  return g;
}
function hay(x, z, kind) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  if (kind === 'bale') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 12), MAT.hay); b.rotation.z = Math.PI / 2; b.position.y = 0.45; g.add(b); }
  else { const b = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.hay); b.scale.set(1, 1.5, 1); g.add(b); }
  return g;
}
function trough(x, z, wet) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.6), MAT.darkWood); b.position.y = 0.25; g.add(b);
  if (wet) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.45), MAT.water); w.rotation.x = -Math.PI / 2; w.position.y = 0.46; g.add(w); }
  return g;
}
function hearth(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), MAT.darkStone); s.position.set(Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7); g.add(s); }
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5), MAT.darkWood); l.rotation.set(Math.PI / 2, i * Math.PI / 4, 0.3); l.position.y = 0.15; g.add(l); }
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 6), MAT.fire); f.position.y = 0.45; g.add(f);
  return g;
}
function chimePost(x, z) {
  const g = post(x, z, 2.2, false);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), MAT.darkWood); arm.position.set(0.2, 2.1, 0); g.add(arm);
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3 + i * 0.08, 5), MAT.iron); c.position.set(0.05 + i * 0.15, 1.85 - i * 0.04, 0); g.add(c); }
  return g;
}
function chainGate(x, z, w) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  for (const px of [-w / 2 + 0.2, w / 2 - 0.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), MAT.darkWood); p.position.set(px, 0.6, 0); g.add(p); }
  const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, w - 0.4, 5), MAT.iron); ch.rotation.z = Math.PI / 2; ch.position.y = 0.85; g.add(ch);
  return g;
}
function scarecrow(x, z) {
  const g = post(x, z, 2.0, false);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.07, 0.07), MAT.darkWood); arm.position.y = 1.5; g.add(arm);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), MAT.hay); head.position.y = 2.05; g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 8), MAT.darkWood); hat.position.y = 2.3; g.add(hat);
  const coat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), MAT.cloth); coat.position.y = 1.2; g.add(coat);
  return g;
}
function townGate(x0, z, w) {
  const g = new THREE.Group(); g.position.set(x0, 0, z);
  for (const px of [1, w - 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.6, 1.0), MAT.stone); p.position.set(px, 1.8, 0); g.add(p); const c = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.8, 4), MAT.darkWood); c.rotation.y = Math.PI / 4; c.position.set(px, 4.0, 0); g.add(c); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w - 1, 0.4, 0.5), MAT.darkWood); beam.position.set(w / 2, 3.3, 0); g.add(beam);
  return g;
}
function barrowMound(x, z, w) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const m = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4d5a34', roughness: 1 })); m.scale.set(1, 0.6, 0.8); g.add(m);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.3), MAT.darkStone); door.position.set(0, 0.8, w * 0.38); g.add(door);
  return g;
}

/** Ground dressing from the tile data: grass clumps on open grass, pebbles, ferns and small stones along road edges.
 *  All of it is small and low (never reads as a blocker) and keeps off decor footprints, water, cliffs and fences. */
async function dressGround({ zone, terr, legendAt, W, H, P, B, quality, step, isTerrain }) {
  const busy = new Uint8Array(W * H);
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) busy[y * W + x] = 1; };
  for (const d of zone.decor || []) for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 3; dx++) mark(d.x + dx, d.y + dy);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const id = legendAt[y][x]; if (id && !isTerrain(id)) mark(x, y); }   // fences, walls
  for (const o of zone.overlays || []) if (!isTerrain(o.t) && !/^(tuft|pebbles|flowers)/.test(o.t)) mark(o.x, o.y);
  const isGrass = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !CLASS[terr[y][x]] && !WATER.has(terr[y][x]) && !/cliff|ledge/.test(terr[y][x]);
  const isRoad = (x, y) => x >= 0 && y >= 0 && x < W && y < H && CLASS[terr[y][x]] === 1;
  const [grass, wisp, peb1, peb3, fern, rock] = await Promise.all(['nature/Grass_Common_Short.gltf', 'nature/Grass_Wispy_Tall.gltf', 'nature/Pebble_Round_1.gltf', 'nature/Pebble_Round_3.gltf', 'nature/Fern_1.gltf', 'nature/Rock_Medium_2.gltf'].map((u) => P(u)));
  const hOf = (pr) => Math.max(0.05, pr.box.max.y - pr.box.min.y);
  const put = (pr, x, z, h, ry, tint = null) => { const k = h / hOf(pr); B.instance(pr, M4(x, -pr.box.min.y * k, z, ry, k), { tint, cast: false }); };
  const dense = quality.grass ? 1 : 0.35;     // phones: a third of the dressing
  const moor = /moor/.test(zone.id) || zone.under === 'x1_moor_turf';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (busy[y * W + x]) continue;
      const r = (s) => hashXY(x, y, 40 + s);
      if (isGrass(x, y)) {
        const edge = isRoad(x - 1, y) || isRoad(x + 1, y) || isRoad(x, y - 1) || isRoad(x, y + 1);
        if (edge && r(1) < 0.3 * dense) {           // the verge: pebbles, a fern, now and then a stone
          const k = r(2);
          if (k < 0.45) put(r(3) < 0.5 ? peb1 : peb3, x + r(4), y + r(5), 0.1 + r(6) * 0.1, r(7) * 6.28, '#b8b0a0');
          else if (k < 0.8) put(fern, x + r(4), y + r(5), 0.35 + r(6) * 0.25, r(7) * 6.28, moor ? '#b8b090' : null);
          else put(rock, x + r(4), y + r(5), 0.25 + r(6) * 0.2, r(7) * 6.28, '#9a9488');
        } else if (r(8) < 0.16 * dense) {           // clumps on open grass
          const n = 1 + Math.floor(r(9) * 3);
          for (let i = 0; i < n; i++) put(r(10 + i) < 0.75 ? grass : wisp, x + r(13 + i), y + r(16 + i), (r(10 + i) < 0.75 ? 0.28 : 0.42) + r(19 + i) * 0.14, r(22 + i) * 6.28, moor ? '#c8c090' : null);
        }
      } else if (isRoad(x, y) && r(30) < 0.07 * dense) put(r(31) < 0.5 ? peb1 : peb3, x + r(32), y + r(33), 0.07 + r(34) * 0.06, r(35) * 6.28, '#c0b6a4');
    }
    await step();
  }
}

/** Build one zone. */
export async function buildZone(L, zone, { tilesDb = null, quality = {}, yieldFn = null } = {}) {
  const group = new THREE.Group(); group.name = `zone:${zone.id}`;
  const P = makeProtoCache(L);
  const B = makeBatcher(group, { shadows: !!quality.shadows });
  const lamps = [];
  const buildings = [];            // [{ id, x0, z0, w, d, top }] for the building cutaway
  const town = zone.kind === 'town';
  const W = zone.w, H = zone.h;
  let waterTex = null;
  // yield to the frame loop whenever this build has held the thread for a few milliseconds (no hitch while walking)
  let slice = performance.now();
  const step = async () => { if (yieldFn && performance.now() - slice > 5) { await yieldFn(); slice = performance.now(); } };

  // terrain per tile (legend + terrain overlays)
  const terr = [], legendAt = [];
  const isTerrain = (id) => !!((tilesDb && tilesDb.terrains && tilesDb.terrains[id]) || GROUND[id]);
  for (let y = 0; y < H; y++) {
    const row = [], lr = [];
    for (let x = 0; x < W; x++) {
      const id = zone.legend[zone.ground[y][x]];
      lr.push(id || null);
      row.push(id && (isTerrain(id) || GROUND[id]) ? id : zone.under);
    }
    terr.push(row); legendAt.push(lr);
  }
  for (const o of zone.overlays || []) if (o.y >= 0 && o.y < H && o.x >= 0 && o.x < W && (isTerrain(o.t) || GROUND[o.t])) terr[o.y][o.x] = o.t;
  const terrainAt = (x, y) => terr[y][x];

  // ground plane (map) + a wide apron so the map edge fades into fog
  // wear: trodden, darker ground hugging the buildings (and a little round every other decor piece)
  const wear = new Float32Array(W * H);
  {
    const objs = (tilesDb && tilesDb.objects) || {};
    for (const d of zone.decor || []) {
      const meta = objs[d.t];
      let x0 = d.x, y0 = d.y, x1 = d.x, y1 = d.y;
      if (meta && Array.isArray(meta.footprint) && Array.isArray(meta.footprint[0])) { const xs = meta.footprint.map((p) => p[0]), ys = meta.footprint.map((p) => p[1]); x0 = d.x + Math.min(...xs); x1 = d.x + Math.max(...xs); y0 = d.y + Math.min(...ys); y1 = d.y + Math.max(...ys); }
      const k = BUILDING[d.t] ? 0.55 : 0.25;
      for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) wear[y * W + x] = Math.max(wear[y * W + x], (x < x0 || x > x1 || y < y0 || y > y1) ? k : k * 1.2);
    }
  }
  const gtex = paintGround(zone, terrainAt, wear);
  const gmat = groundMaterial(gtex, W, H);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), gmat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2); ground.receiveShadow = true;
  group.add(ground);
  const apronMap = groundDetail().grass.clone(); apronMap.repeat.set((W + 160) / 2, (H + 160) / 2); apronMap.needsUpdate = true;
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 160, H + 160), new THREE.MeshStandardMaterial({ map: apronMap, color: new THREE.Color(GROUND[zone.under] || GROUND.grass).multiplyScalar(1.25), roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.set(W / 2, -0.03, H / 2); apron.receiveShadow = true;
  group.add(apron);
  await step();

  // water: one plane over the zone; a per-tile mask (R deep water, G shallows, B ink) with noise-broken edges gives a
  // soft shoreline and a pale foam line, and the shared ripple normal map scrolls (tickWater)
  const wm = document.createElement('canvas'); wm.width = W; wm.height = H;
  const wmg = wm.getContext('2d'), wmi = wmg.createImageData(W, H);
  let wet = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = terr[y][x], i = (y * W + x) * 4;
    const k = t === 'shallow' ? 1 : t === 'ink' ? 2 : WATER.has(t) ? 0 : -1;
    if (k >= 0) { wmi.data[i + k] = 255; wet++; }
    wmi.data[i + 3] = 255;
  }
  if (wet) {
    wmg.putImageData(wmi, 0, 0);
    const mt = new THREE.CanvasTexture(wm); mt.wrapS = mt.wrapT = THREE.ClampToEdgeWrapping;
    const wmat = waterMaterial(mt, W, H);
    const wgeo = new THREE.PlaneGeometry(W, H); wgeo.rotateX(-Math.PI / 2); wgeo.translate(W / 2, 0.035, H / 2);
    const uv2 = wgeo.attributes.uv, ps2 = wgeo.attributes.position;
    // uv: the mask lookup; lrWorld (world metres) breaks the shore edge
    const uw = new Float32Array(uv2.count * 2); for (let i = 0; i < uv2.count; i++) { uw[i * 2] = ps2.getX(i); uw[i * 2 + 1] = ps2.getZ(i); }
    wgeo.setAttribute('lrWorld', new THREE.BufferAttribute(uw, 2));
    const wmesh = new THREE.Mesh(wgeo, wmat); wmesh.receiveShadow = true; wmesh.renderOrder = 1; group.add(wmesh);
    waterTex = mt;
  }
  await step();

  // cobbles on the plaza, planks on bridges
  const cob = await P('village/Floor_UnevenBrick.gltf');
  const cobK = 1 / Math.max(0.01, cob.box.max.x - cob.box.min.x);
  const plank = await P('village/Floor_WoodDark.gltf');
  const plankK = 1 / Math.max(0.01, plank.box.max.x - plank.box.min.x);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (terr[y][x] === 'plaza') B.instance(cob, M4(x + 0.5, 0.0, y + 0.5, Math.floor(hashXY(x, y) * 4) * Math.PI / 2, cobK, 1, cobK), { cast: false });
  for (const o of zone.overlays || []) {
    if (/^bridge_/.test(o.t) && !/piles|arch/.test(o.t)) B.instance(plank, M4(o.x + 0.5, 0.12, o.y + 0.5, 0, plankK, 1, plankK), { cast: false });
  }
  await step();

  // fences and low walls from the ground layer, cliffs and ledges as rock
  const fence = await P('village/Prop_WoodenFence_Single.gltf');
  const fb = fence.box, fLen = Math.max(fb.max.x - fb.min.x, fb.max.z - fb.min.z), fAlongX = (fb.max.x - fb.min.x) >= (fb.max.z - fb.min.z);
  const rocks = await Promise.all([1, 2, 3].map((i) => P(`nature/Rock_Medium_${i}.gltf`)));
  const rockH = rocks.map((r) => Math.max(0.1, r.box.max.y - r.box.min.y));
  const isF = (x, y) => x >= 0 && y >= 0 && x < W && y < H && legendAt[y][x] === 'fence_wood';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = legendAt[y][x];
    if (id === 'fence_wood') {
      const horiz = isF(x - 1, y) || isF(x + 1, y) || !(isF(x, y - 1) || isF(x, y + 1));
      const ry = (horiz ? 0 : Math.PI / 2) + (fAlongX ? 0 : Math.PI / 2);
      B.instance(fence, M4(x + 0.5, 0, y + 0.5, ry, 1 / fLen, 1, 1 / fLen));
    } else if (id === 'wall_low') {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.5), MAT.stone); s.position.set(x + 0.5, 0.3, y + 0.5); s.updateMatrixWorld(); B.mergeGeo(s.geometry, MAT.stone, s.matrixWorld);
    } else if (id && /_face$/.test(id)) {
      const i = Math.floor(hashXY(x, y, 3) * 3);
      const h = 1.8 + hashXY(x, y, 5) * 0.8;
      B.instance(rocks[i], M4(x + 0.5, -0.2, y + 0.5, hashXY(x, y, 9) * 6.28, 1.5, h / rockH[i], 1.5), { tint: '#9a9286' });
    } else if (id && /^ledge_/.test(id)) {
      const i = Math.floor(hashXY(x, y, 3) * 3);
      B.instance(rocks[i], M4(x + 0.5, -0.1, y + 0.7, hashXY(x, y, 9) * 6.28, 1.1, 0.5 / rockH[i], 0.7), { tint: '#9a9286' });
    }
  }
  await step();

  // decor
  const tiles = (tilesDb && tilesDb.objects) || {};
  const tree = { pine: [1, 2, 3, 4, 5].map((i) => `nature/Pine_${i}.gltf`), common: [1, 2, 3, 4, 5].map((i) => `nature/CommonTree_${i}.gltf`) };
  const placeModel = async (url, x, z, { h = null, s = 1, ry = 0, tint = null, tintMatch = null, merge = false, cast = true, y = 0, sy = null } = {}) => {
    const pr = await P(url);
    const bh = Math.max(0.05, pr.box.max.y - pr.box.min.y);
    const k = h ? h / bh : s;
    const m = M4(x, y - pr.box.min.y * k, z, ry, k, sy != null ? sy * k : k, k);
    if (merge) B.mergeModel(pr, m, { tint }); else B.instance(pr, m, { tint, tintMatch, cast });
  };
  const jobs = [];
  let n = 0;
  for (const d of zone.decor || []) {
    const t = d.t;
    const meta = tiles[t] || null;
    const r = (s) => hashXY(d.x, d.y, s);
    // footprint box in tiles
    let fx0 = d.x, fz0 = d.y, fw = 1, fd = 1;
    if (meta && Array.isArray(meta.footprint) && Array.isArray(meta.footprint[0])) {
      const xs = meta.footprint.map((p) => p[0]), ys = meta.footprint.map((p) => p[1]);
      fx0 = d.x + Math.min(...xs); fz0 = d.y + Math.min(...ys); fw = Math.max(...xs) - Math.min(...xs) + 1; fd = Math.max(...ys) - Math.min(...ys) + 1;
    } else if (/bench|anvil|tree_willow/.test(t)) fw = 2; else if (/crates_barrels|hedge_flowers/.test(t)) fw = 3;
    const cx = fx0 + fw / 2, cz = fz0 + fd / 2;
    if (BUILDING[t]) {
      const def = BUILDING[t];
      const door = meta && meta.doorAt ? meta.doorAt[0] : Math.floor(fw / 2);
      const o = { town, bld: bldSlot() };
      const fd2 = def.solidTower ? Math.max(fd, 3) : fd;
      jobs.push(buildHouse(P, B, def, fx0, def.solidTower ? fz0 + fd - fd2 : fz0, fw, fd2, door, d.x * 7 + d.y, o).then((bb) => { buildings.push(bb); }));
    } else if (t === 'town_gate') B.mergeGroup(townGate(fx0, d.y + 0.5, fw));
    else if (t === 'x1_barrow_door_closed') B.mergeGroup(barrowMound(cx, cz, fw));
    else if (t === 'well') B.mergeGroup(well(cx, cz));
    else if (t === 'lamp_post') { const lp = lampPost(d.x + 0.5, d.y + 0.5); B.mergeGroup(lp.g); lamps.push({ pos: lp.light, color: '#ffb35c', k: 1 }); }
    else if (t === 'tree_pine') jobs.push(placeModel(tree.pine[Math.floor(r(1) * 5)], d.x + 0.5, d.y + 0.6, { h: 4.8 + r(2) * 2.2, ry: r(3) * 6.28 }));
    else if (t === 'tree_willow') jobs.push(placeModel('nature/TwistedTree_1.gltf', cx, d.y + 0.5, { h: 6.5 + r(2), ry: r(3) * 6.28, tint: '#d8f0b0', tintMatch: /Leaves/ }));
    else if (t === 'root_column') jobs.push(placeModel('nature/TwistedTree_3.gltf', cx, d.y + 0.5, { h: 5, ry: r(3) * 6.28 }));
    else if (t === 'bush') jobs.push(placeModel(r(1) < 0.25 ? 'nature/Bush_Common_Flowers.gltf' : 'nature/Bush_Common.gltf', d.x + 0.5, d.y + 0.5, { h: 0.9 + r(2) * 0.5, ry: r(3) * 6.28 }));
    else if (/^x1_gorse/.test(t)) jobs.push(placeModel('nature/Bush_Common_Flowers.gltf', cx, d.y + 0.5, { h: 0.8 + r(2) * 0.4, ry: r(3) * 6.28, tint: '#c8b060' }));
    else if (t === 'hedge_flowers') for (let i = 0; i < 3; i++) jobs.push(placeModel('nature/Bush_Common_Flowers.gltf', d.x + 0.5 + i, d.y + 0.5, { h: 0.9, ry: r(i) * 6.28 }));
    else if (t === 'x1_boulder_a') { const i = Math.floor(r(1) * 3); jobs.push(placeModel(`nature/Rock_Medium_${i + 1}.gltf`, d.x + 0.5, d.y + 0.5, { h: 0.6 + r(2) * 0.6, ry: r(3) * 6.28, tint: '#7a746a' })); }
    else if (/^x1_menhir|x1_blank_slab|prop_milestone/.test(t)) { const i = Math.floor(r(1) * 3); jobs.push(placeModel(`nature/Rock_Medium_${i + 1}.gltf`, d.x + 0.5, d.y + 0.5, { h: t === 'prop_milestone' ? 0.8 : 2.3, s: 1, ry: r(3) * 6.28, tint: '#7a766e' })); }
    else if (t === 'x1_cairn_moor') { for (let i = 0; i < 3; i++) jobs.push(placeModel(`nature/Pebble_Round_${i % 2 ? 3 : 1}.gltf`, d.x + 0.5, d.y + 0.5, { h: 0.4 - i * 0.08, y: i * 0.32, ry: i * 2, tint: '#8a8680' })); }
    else if (t === 'x1_fallen_oak') {
      const pr = await P('nature/DeadTree_1.gltf');
      const bh = pr.box.max.y - pr.box.min.y, k = (fw + 0.5) / bh;
      B.instance(pr, new THREE.Matrix4().compose(new THREE.Vector3(fx0 + 0.2, 0.3, d.y + 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)), new THREE.Vector3(k, k, k)));
    }
    else if (t === 'bench') jobs.push(placeModel('props/Bench.gltf', cx, d.y + 0.5, { s: 1, ry: 0, merge: true }));
    else if (t === 'anvil') jobs.push(placeModel('props/Anvil.gltf', cx, d.y + 0.5, { h: 0.8, merge: true }));
    else if (t === 'barrel') jobs.push(placeModel('props/Barrel.gltf', d.x + 0.5, d.y + 0.5, { h: 1.0, ry: r(3) * 6, merge: true }));
    else if (t === 'crate') jobs.push(placeModel('props/Crate_Wooden.gltf', d.x + 0.5, d.y + 0.5, { h: 0.8, ry: r(3), merge: true }));
    else if (t === 'crates_barrels') { jobs.push(placeModel('props/Barrel.gltf', d.x + 0.5, d.y + 0.5, { h: 1.0, merge: true })); jobs.push(placeModel('props/Crate_Wooden.gltf', d.x + 1.5, d.y + 0.5, { h: 0.8, ry: 0.4, merge: true })); jobs.push(placeModel('props/Barrel_Apples.gltf', d.x + 2.5, d.y + 0.5, { h: 1.0, merge: true })); }
    else if (t === 'x1_sack_stack') jobs.push(placeModel('props/Bag.gltf', d.x + 0.5, d.y + 0.5, { h: 0.7, ry: r(2) * 6, merge: true }));
    else if (/^market_stall/.test(t)) jobs.push(placeModel(t === 'market_stall_fruit' ? 'props/Stall_Cart_Empty.gltf' : 'props/Stall_Empty.gltf', cx, d.y + 0.5, { h: 2.4, merge: true }));
    else if (/^signboard|^signpost/.test(t)) B.mergeGroup(post(d.x + 0.5, d.y + 0.5, 1.6, true));
    else if (t === 'x1_haybale') B.mergeGroup(hay(d.x + 0.5, d.y + 0.5, 'bale'));
    else if (/^x1_haystack/.test(t)) B.mergeGroup(hay(cx, d.y + 0.5, 'stack'));
    else if (/^x1_trough/.test(t)) B.mergeGroup(trough(cx, d.y + 0.5, t === 'x1_trough'));
    else if (t === 'x1_hearth') { B.mergeGroup(hearth(cx, d.y + 0.5)); lamps.push({ pos: new THREE.Vector3(cx, 0.8, d.y + 0.5), color: '#ff9a40', k: 1.3, fire: true }); }
    else if (/^x1_chimepost/.test(t)) B.mergeGroup(chimePost(d.x + 0.5, d.y + 0.5));
    else if (/chain/.test(t)) B.mergeGroup(chainGate(cx, d.y + 0.5, fw));
    else if (t === 'x1_scarecrow') B.mergeGroup(scarecrow(d.x + 0.5, d.y + 0.5));
    else if (t === 'x1_roots_stile') jobs.push(placeModel('nature/TwistedTree_3.gltf', cx, d.y + 0.5, { h: 2.5, ry: 1 }));
    if (++n % 20 === 0) { await Promise.all(jobs.splice(0)); await step(); }
  }
  await Promise.all(jobs.splice(0));
  // lantern posts (the respawn lanterns) are lamp posts too
  for (const ln of zone.lanterns || []) {
    if (!ln.post) continue;
    const lp = lampPost(ln.post[0] + 0.5, ln.post[1] + 0.5); B.mergeGroup(lp.g); lamps.push({ pos: lp.light, color: '#ffc46b', k: 1.2 });
  }
  // small ground dressing: flowers, tufts, tall grass (desktop quality only)
  if (quality.grass) {
    for (const o of zone.overlays || []) {
      if (/^(flowers|hydrangea)/.test(o.t)) jobs.push(placeModel(hashXY(o.x, o.y) < 0.5 ? 'nature/Flower_3_Group.gltf' : 'nature/Flower_4_Group.gltf', o.x + 0.5, o.y + 0.5, { h: 0.35, ry: hashXY(o.x, o.y, 2) * 6, cast: false }));
      else if (/^tuft|^pebbles/.test(o.t)) jobs.push(placeModel(/^tuft/.test(o.t) ? 'nature/Grass_Common_Short.gltf' : 'nature/Pebble_Round_3.gltf', o.x + 0.5, o.y + 0.5, { h: /^tuft/.test(o.t) ? 0.35 : 0.12, ry: hashXY(o.x, o.y, 2) * 6, cast: false }));
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = terr[y][x];
      if (!(t === 'tallgrass' || t === 'x1_heath' || t === 'x1_bracken') || hashXY(x, y, 11) < 0.35) continue;
      const tint = t === 'x1_heath' ? '#b090a0' : t === 'x1_bracken' ? '#c09050' : null;
      jobs.push(placeModel('nature/Grass_Wispy_Tall.gltf', x + hashXY(x, y, 12), y + hashXY(x, y, 13), { h: 0.5 + hashXY(x, y, 14) * 0.3, ry: hashXY(x, y, 15) * 6, tint, cast: false }));
    }
    await Promise.all(jobs.splice(0));
  }
  await step();
  await dressGround({ zone, terr, legendAt, W, H, P, B, quality, step, isTerrain });
  await step();
  const calls = await B.finish(step);

  // lamp halos: additive points (one draw call for every lamp, one for every fire), brightened at night by the renderer
  const haloMats = [];
  for (const fire of [false, true]) {
    const ls = lamps.filter((l) => !!l.fire === fire);
    if (!ls.length) continue;
    const m = new THREE.PointsMaterial({ map: radial('rgba(255,225,170,1)', 'rgba(255,170,70,0.35)'), color: '#ffb35c', size: fire ? 2.0 : 1.3, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const geo = new THREE.BufferGeometry().setFromPoints(ls.map((l) => l.pos));
    const pts = new THREE.Points(geo, m); pts.renderOrder = 3; group.add(pts); haloMats.push(m);
  }
  const halo = { set opacity(v) { for (const m of haloMats) m.opacity = v; } };
  return {
    group, lamps, halo, calls, buildings, town,
    dispose() {
      for (const bb of buildings) setBuildingFade(bb.id, 0);
      group.traverse((m) => { if (((m.isMesh && !m.isInstancedMesh) || m.isPoints) && m.geometry) m.geometry.dispose(); });
      gtex.color.dispose(); gtex.weights.dispose(); apronMap.dispose(); if (waterTex) waterTex.dispose();
    },
  };
}

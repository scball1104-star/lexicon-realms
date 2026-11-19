// Zone builder: turns a zone's tile and map data (docs/CONTRACTS.md section 6) into a 3D scene. A rough first pass at
// the zone shape: the ground is painted per tile, water and cobbles are meshes, fences follow the fence tiles, cliffs
// become rock walls, buildings are assembled from Medieval Village MegaKit wall and roof pieces sized to their map
// footprint, and trees, bushes, rocks and props come from the Stylized Nature and Fantasy Props kits.
//
//   const z = await buildZone(L, zone, { tilesDb, quality, yieldFn })   tilesDb: assets/tiles/tiles.json
//   z.group (add to the scene), z.lamps ([{ pos: Vector3, color, k }] light spots), z.glows (lamp halos), z.dispose()
//
// One world unit is one metre and one tile (16 px). Repeated models are instanced per 16 m chunk and one-off groups
// are merged per material per chunk, so the town is a few dozen draw calls and off-screen chunks are culled.
import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { WINDOW_LIT } from './loader.js';
import { dyeMaterial } from './hero.js';
import { canvasTex, radial, seeded, woodTex } from './textures.js';

const CH = 16;   // chunk size (m)
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
  water: new THREE.MeshStandardMaterial({ color: '#3d6f8c', roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.78 }),
  shallow: new THREE.MeshStandardMaterial({ color: '#6aa0b0', roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.5 }),
  ink: new THREE.MeshStandardMaterial({ color: '#2a1a50', roughness: 0.05, metalness: 0.2, emissive: '#3a1a7a', emissiveIntensity: 0.25, transparent: true, opacity: 0.85 }),
  cloth: new THREE.MeshStandardMaterial({ color: '#8a3a2a', roughness: 0.9 }),
  fire: new THREE.MeshBasicMaterial({ color: '#ffb050' }),
};
export const LAMP_GLASS = MAT.glass;


// See-through: static scenery between the camera and the player is dithered away in a soft cylinder, so trees, roofs
// and walls never hide the hero (the 3D take on the 2D canopy fade). Shadows are untouched (depth pass unpatched).
export const SEE = { uCam: { value: new THREE.Vector3() }, uFocus: { value: new THREE.Vector3() }, uSeeR: { value: 2.6 } };
const patched = new WeakSet();
function seeThrough(mat) {
  if (patched.has(mat)) return;
  patched.add(mat);
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, SEE);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vLrW;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 lrW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        lrW = instanceMatrix * lrW;
      #endif
        vLrW = (modelMatrix * lrW).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLrW; uniform vec3 uCam; uniform vec3 uFocus; uniform float uSeeR;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      { vec3 d = uFocus - uCam; float L = length(d); vec3 n = d / L; float t = dot(vLrW - uCam, n);
        if (t > 0.0 && t < L - 0.6 && vLrW.y > 0.35) {
          float r = length(vLrW - (uCam + n * t));
          float R = uSeeR * smoothstep(0.35, 0.85, t / L);
          if (r < R) { vec2 q = mod(floor(gl_FragCoord.xy), 2.0); if (q.x == q.y || r < R * 0.7) discard; }
        } }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|lr_see';
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
    mergeModel(proto, m4, { tint = null } = {}) {
      for (const p of proto.parts) this.mergeGeo(p.geometry, tintMat(p.material, tint), tmp.multiplyMatrices(m4, p.matrix));
    },
    mergeGroup(g) {
      g.updateMatrixWorld(true);
      g.traverse((m) => { if (m.isMesh) this.mergeGeo(m.geometry, m.material, m.matrixWorld); });
    },
    mergeGeo(geo, mat, m4, cast = true) {
      pos.setFromMatrixPosition(m4);
      const k = `${mat.uuid}|${chunk(pos.x, pos.z)}|${cast}`;
      if (!merge.has(k)) merge.set(k, { material: mat, geos: [], cast });
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(m4);
      merge.get(k).geos.push(g);
    },
    finish() {
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
      }
      return calls;
    },
  };
}

const M4 = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

// ---------- the ground ----------
function paintGround(zone, terrainAt) {
  const W = zone.w, H = zone.h;
  const P = Math.max(4, Math.min(8, Math.floor(2048 / Math.max(W, H))));
  const small = document.createElement('canvas'); small.width = W; small.height = H;
  const sg = small.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = terrainAt(x, y);
    const c = new THREE.Color(GROUND[id] || GROUND[zone.under] || GROUND.grass);
    const j = (hashXY(x, y, 7) - 0.5) * 0.08;
    c.offsetHSL(0, 0, j);
    sg.fillStyle = '#' + c.getHexString(); sg.fillRect(x, y, 1, 1);
  }
  return canvasTex(W * P, H * P, (g, w, h) => {
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, w, h);
    const { R } = seeded(W * 131 + H);
    const n = Math.min(160000, W * H * 10);
    for (let i = 0; i < n; i++) {
      const l = R(-1, 1);
      g.fillStyle = l > 0 ? `rgba(200,210,150,${0.03 + l * 0.05})` : `rgba(10,14,8,${0.04 - l * 0.07})`;
      g.fillRect(R(0, w), R(0, h), R(1, 2.5), R(1, 3));
    }
  });
}
let detailTex = null;
function groundMaterial(map) {
  if (!detailTex) {
    detailTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      const { R } = seeded(99);
      for (let i = 0; i < 2600; i++) { const v = Math.floor(R(70, 190)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(R(0, w), R(0, h), R(1, 2), R(1, 4)); }
    }, { srgb: false, repeat: [1, 1] });
  }
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.97, metalness: 0 });
  const U = { tDetail: { value: detailTex }, uRep: { value: new THREE.Vector2(1, 1) } };
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tDetail; uniform vec2 uRep;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ float d = texture2D(tDetail, vMapUv * uRep).r; diffuseColor.rgb *= 0.72 + d * 0.56; }');
  };
  mat.customProgramCacheKey = () => 'lr_ground';
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

async function buildHouse(P, B, def, x0, z0, w, d, doorCol, seed) {
  const st = STYLE[def.style];
  const nx = Math.max(1, Math.round(w / 2)), nz = Math.max(1, Math.round(d / 2));
  const sx = w / (nx * 2), sz = d / (nz * 2);
  const root = new THREE.Matrix4().compose(new THREE.Vector3(x0 + w / 2, 0, z0 + d / 2), new THREE.Quaternion(), new THREE.Vector3(sx, def.low ? 0.8 : 1, sz));
  const put = async (name, lx, ly, lz, ry) => { const pr = await P(`village/${name}.gltf`); B.mergeModel(pr, root.clone().multiply(M4(lx, ly, lz, ry))); };
  const W2 = nx, D2 = nz;
  const door = Math.max(0, Math.min(nx - 1, Math.floor(doorCol / 2)));
  const jobs = [];
  for (let f = 0; f < def.floors; f++) {
    const y = f * FLOOR_H;
    for (let i = 0; i < nx; i++) {
      const lx = -W2 + 1 + i * 2;
      let nm, glass = null;
      if (f === 0) { nm = i === door ? st.ground.door : (hashXY(i, seed) < 0.75 ? st.ground.win : st.ground.wall); if (nm === st.ground.win) glass = st.ground.glass; }
      else { nm = (i + f) % 2 ? UPPER.grid : UPPER.win; if (nm === UPPER.win) glass = UPPER.glass; }
      jobs.push(put(nm, lx, y, D2, 0));
      if (glass) jobs.push(put(glass, lx, y, D2, 0));
      if (f === 0 && i === door) jobs.push(put('Door_1_Round', lx - 0.53, y, D2, 0));
      jobs.push(put(f === 0 ? st.ground.wall : UPPER.wall, lx, y, -D2, Math.PI));
    }
    for (let j = 0; j < nz; j++) {
      const lz = -D2 + 1 + j * 2;
      jobs.push(put(f === 0 ? st.ground.wall : UPPER.wall, W2, y, lz, Math.PI / 2));
      jobs.push(put(f === 0 ? st.ground.wall : UPPER.wall, -W2, y, lz, -Math.PI / 2));
    }
    for (const [cx, cz] of [[W2, D2], [-W2, D2], [W2, -D2], [-W2, -D2]]) jobs.push(put(st.corner, cx, y, cz, 0));
  }
  await Promise.all(jobs);
  // roof: the kit roof whose plan best fits the house, scaled to the footprint plus an overhang
  const top = def.floors * FLOOR_H;
  if (def.tower) {
    const pr = await P('village/Roof_Tower_RoundTiles.gltf');
    const b = pr.box, bw = b.max.x - b.min.x, bd = b.max.z - b.min.z;
    const k = Math.min((nx * 2 + 0.4) / bw, (nz * 2 + 0.4) / bd);
    B.mergeModel(pr, root.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(-(b.min.x + b.max.x) / 2 * k, top - b.min.y * k, -(b.min.z + b.max.z) / 2 * k), new THREE.Quaternion(), new THREE.Vector3(k, k, k))));
  } else {
    const want = [nx * 2 + 0.6, nz * 2 + 0.6];
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
    const kx = want[0] / best.rw, kz = want[1] / best.rd, ky = Math.min(kx, kz) * (def.low ? 0.8 : 1);
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const rot = new THREE.Matrix4().makeRotationY(best.rot ? Math.PI / 2 : 0);
    const scl = new THREE.Matrix4().makeScale(best.rot ? kz : kx, ky, best.rot ? kx : kz);
    const cen = new THREE.Matrix4().makeTranslation(-cx, -b.min.y, -cz);
    const lift = new THREE.Matrix4().makeTranslation(0, top, 0);
    // undo the house's own x/z stretch for the roof: it is sized to metres already
    const unstretch = new THREE.Matrix4().makeScale(1 / sx, 1 / (def.low ? 0.8 : 1), 1 / sz);
    B.mergeModel(best.pr, root.clone().multiply(unstretch).multiply(lift).multiply(rot).multiply(scl).multiply(cen));
  }
  if (def.chimney) await put('Prop_Chimney', W2 - 0.8, top + 0.6, -D2 + 0.8, 0);
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

/** Build one zone. */
export async function buildZone(L, zone, { tilesDb = null, quality = {}, yieldFn = null } = {}) {
  const group = new THREE.Group(); group.name = `zone:${zone.id}`;
  const P = makeProtoCache(L);
  const B = makeBatcher(group, { shadows: !!quality.shadows });
  const lamps = [];
  const W = zone.w, H = zone.h;
  const step = async () => { if (yieldFn) await yieldFn(); };

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
  const gtex = paintGround(zone, terrainAt);
  const gmat = groundMaterial(gtex);
  gmat.userData.U.uRep.value.set(W / 2, H / 2);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), gmat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2); ground.receiveShadow = true;
  group.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 160, H + 160), new THREE.MeshStandardMaterial({ color: new THREE.Color(GROUND[zone.under] || GROUND.grass).multiplyScalar(0.6), roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.set(W / 2, -0.03, H / 2); apron.receiveShadow = true;
  group.add(apron);
  await step();

  // water: one merged surface per kind
  const waterGeo = { water: [], shallow: [], ink: [] };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = terr[y][x];
    const k = t === 'shallow' ? 'shallow' : t === 'ink' ? 'ink' : WATER.has(t) ? 'water' : null;
    if (!k) continue;
    const q = new THREE.PlaneGeometry(1, 1); q.rotateX(-Math.PI / 2); q.translate(x + 0.5, k === 'shallow' ? 0.02 : 0.03, y + 0.5);
    waterGeo[k].push(q);
  }
  for (const [k, list] of Object.entries(waterGeo)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), MAT[k]); m.receiveShadow = true; m.renderOrder = 1; group.add(m);
  }

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
      if (def.solidTower) jobs.push(buildHouse(P, B, def, fx0, fz0, fw, Math.max(fd, 3), door, d.x * 7 + d.y));
      else jobs.push(buildHouse(P, B, def, fx0, fz0, fw, fd, door, d.x * 7 + d.y));
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
    if (++n % 60 === 0) { await Promise.all(jobs.splice(0)); await step(); }
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
  const calls = B.finish();

  // lamp halos (additive sprites, brightened at night by the renderer)
  const halo = new THREE.SpriteMaterial({ map: radial('rgba(255,225,170,1)', 'rgba(255,170,70,0.35)'), color: '#ffb35c', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  for (const l of lamps) { const s = new THREE.Sprite(halo); s.position.copy(l.pos); s.scale.setScalar(l.fire ? 2.0 : 1.3); group.add(s); }
  return {
    group, lamps, halo, calls,
    dispose() {
      group.traverse((m) => { if (m.isMesh && !m.isInstancedMesh && m.geometry) m.geometry.dispose(); });
      gtex.dispose();
    },
  };
}

// Ground kit (wave 5 Track B, approved by Scott 2026-11-24 from the stills in D:\LQOnline\wave5\lookdev\ground_stills.png;
// grown from the look-dev prototype D:\lr_lookdev\proto\ground_kit.js). The three.js half; the plans are pure in
// ground_plan.js. zone3d.js calls it through a few hook lines, and only when the kit is on (kitOn: desktop quality):
// Low quality, phones and ?ground=off keep today's ground exactly.
//
//   const kit = createGroundKit(zone, { terr, quality, place, tilesDb })        null when off (or a dungeon or cave)
//   kit.geometry()        the ground plane with gentle visual-only hills (flat on roads, squares, water and near props)
//   kit.material(mat)     adds per-pixel cobbles with colour variety on plaza tiles and a worn road rim to today's shader
//   kit.cobbles           true: the plaza is drawn by the shader (zone3d skips its cobble tiles there)
//   kit.h(x, z)           the visible ground height (m); bodies, grass, props and ground marks stand on it
//   kit.tree(t, x, y, edge, under)  a model url for a little tree variety (kit oaks among the pines), or null
//   kit.dress(B, lamp)    a start-realm square's dressing (ground_plan.js planSquare): stalls, carts, barrels, lamps
//   kit.attach(group)     the swaying grass and the flower patches: two instanced meshes (two draw calls) for the
//                         chunks near the hero, refilled when the hero crosses into a new chunk (kit.cull)
//   kit.cull(x, z)        keep the grass round (x, z) m        kit.dispose()
//   kit.view              null (today) or { r, dx, dz }: the horizon camera's wider grass ring, centred ahead (wave 5b)
//   tickGround(t)         the wind clock (the renderer calls it with the fx clock, so a pinned clock pins the grass)
import * as THREE from '../vendor/three/three.module.min.js';
import { groundMasks, grassChunk, hash2, heightField, kitOn, planSquare } from './ground_plan.js';

const U_TIME = { value: 0 };
/** The wind clock (s). */
export function tickGround(t) { U_TIME.value = t; }

const GCH = 16;          // grass chunk (m)
const GRASS_R = 36;      // grass is kept for chunks within this reach of the hero (m); the fog closes in about here

// ---------- grass and flowers ----------
function clumpGeo() {
  // one clump: five tapered blades, base dark to tip light (vertex colour is a multiplier on the ground's own colour)
  const pos = [], col = [], idx = [];
  for (let b = 0; b < 5; b++) {
    const a = b * 1.26 + 0.3, ox = Math.cos(a * 2.1) * 0.09, oz = Math.sin(a * 1.7) * 0.09, h = 0.3 + 0.16 * ((b * 37) % 5) / 5;
    const cx = Math.cos(a) * 0.055, cz = Math.sin(a) * 0.055, lean = 0.08;
    const base = pos.length / 3, la = a + 1.6;
    pos.push(ox - cx, 0, oz - cz, ox + cx, 0, oz + cz,
      ox + cx * 0.4 + Math.cos(la) * lean, h * 0.6, oz + cz * 0.4 + Math.sin(la) * lean,
      ox - cx * 0.4 + Math.cos(la) * lean, h * 0.6, oz - cz * 0.4 + Math.sin(la) * lean,
      ox + Math.cos(la) * lean * 2.2, h, oz + Math.sin(la) * lean * 2.2);
    col.push(0.5, 0.5, 0.46, 0.5, 0.5, 0.46, 0.85, 0.9, 0.8, 0.85, 0.9, 0.8, 1.12, 1.16, 0.95);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base + 3, base + 2, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function flowerGeo() {
  const stem = new THREE.CylinderGeometry(0.012, 0.014, 0.32, 4, 1, true); stem.translate(0, 0.16, 0);
  const head = new THREE.IcosahedronGeometry(0.09, 0); head.scale(1, 0.6, 1); head.translate(0, 0.33, 0);
  const parts = [stem.toNonIndexed(), head.toNonIndexed()];
  const pos = [], hd = [];
  parts.forEach((p, k) => { for (let i = 0; i < p.attributes.position.count; i++) { pos.push(p.attributes.position.getX(i), p.attributes.position.getY(i), p.attributes.position.getZ(i)); hd.push(k); } });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aHead', new THREE.Float32BufferAttribute(hd, 1));
  g.computeVertexNormals();
  return g;
}
const FLOWER_COLS = ['#f2e3a0', '#e88aa8', '#a8b8f0', '#d8c8e8', '#f0a050'].map((c) => new THREE.Color(c).multiplyScalar(0.75));   // a touch under white: no bloom halo

function swayMat({ groundTex, W, H, flower = false }) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: !flower, color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide });
  const U = { uTime: U_TIME, tGround: { value: groundTex }, uGSize: { value: new THREE.Vector2(W, H) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uTime; uniform sampler2D tGround; uniform vec2 uGSize;${flower ? ' attribute float aHead;' : ''}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
      {
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        ${flower
    ? 'vColor = vec3(mix(vec3(0.13, 0.24, 0.07), instanceColor.rgb, aHead));'
    : `vec3 gc = texture2D(tGround, vec2(ip.x / uGSize.x, 1.0 - ip.z / uGSize.y)).rgb;   // the ground's own colour here
        vColor.rgb *= gc * 1.7 * instanceColor.rgb;`}
      }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float gust = sin(ip.x * 0.15 + uTime * 1.3) * 0.5 + sin(ip.z * 0.23 + ip.x * 0.07 + uTime * 2.1) * 0.35;
        float k = position.y * position.y * 1.8;
        transformed.x += (0.10 + 0.12 * gust) * k; transformed.z += 0.05 * gust * k;
      }`)
      // blades light like the ground under them (normal up), never flipped on the back face (no black blades)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
  };
  m.customProgramCacheKey = () => (flower ? 'lr_kit_flower1' : 'lr_kit_grass1');
  return m;
}

// ---------- square props (code-built, shared materials so the zone batcher merges them per material) ----------
const PM = (c, r = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...extra });
const PMAT = {
  wood: PM('#7a5434'), woodD: PM('#4e3420'), iron: PM('#3a3a40', 0.5, { metalness: 0.6 }), hay: PM('#d8b860', 1, { flatShading: true }),
  sack: PM('#b8a070', 1), glass: PM('#ffd890', 0.3, { emissive: '#ffb050', emissiveIntensity: 1.2, name: 'lr_kit_lampglass' }),
  cloth: ['#b8402e', '#2e6ab8', '#d8b040', '#3e8a4a', '#8a3a8a'].map((c) => PM(c, 0.9, { side: THREE.DoubleSide })),
  fruit: ['#d84a2a', '#e8c040', '#7ab040', '#a83a6a'].map((c) => PM(c, 0.6)),
  bloom: ['#e84a6a', '#f0d040', '#ffffff', '#a060e0'].map((c) => PM(c, 0.6)),
};
const GEO = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 10), cyl12: new THREE.CylinderGeometry(1, 1, 1, 12), ball: new THREE.SphereGeometry(1, 8, 6), ico: new THREE.IcosahedronGeometry(1, 1) };
function piece(g, geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
const MAKE = {
  barrel(g, R) { const k = 0.9 + R(1) * 0.2; piece(g, GEO.cyl12, PMAT.wood, 0, 0.4 * k, 0, 0.32 * k, 0.8 * k, 0.32 * k); for (const y of [0.15, 0.65]) piece(g, GEO.cyl12, PMAT.iron, 0, y * k, 0, 0.335 * k, 0.05, 0.335 * k); },
  crate(g, R) { const s = 0.5 + R(2) * 0.25; piece(g, GEO.box, R(3) < 0.5 ? PMAT.wood : PMAT.woodD, 0, s / 2, 0, s, s, s); piece(g, GEO.box, PMAT.woodD, 0, s / 2, s / 2, s * 1.02, 0.06, 0.06, 0, 0, 0.78); },
  sack(g, R) { piece(g, GEO.ball, PMAT.sack, 0, 0.36, 0, 0.3, 0.39, 0.27); if (R(4) < 0.6) piece(g, GEO.ball, PMAT.sack, 0.35, 0.3, 0.1, 0.26, 0.33, 0.24); },
  stall(g, R) {
    const c = PMAT.cloth[Math.floor(R(5) * PMAT.cloth.length)];
    piece(g, GEO.box, PMAT.wood, 0, 0.9, 0, 2.2, 0.08, 1.1);
    for (const [x, z] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]]) piece(g, GEO.box, PMAT.woodD, x, z < 0 ? 1.15 : 0.95, z, 0.08, z < 0 ? 2.3 : 1.9, 0.08);
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), c); aw.position.set(0, 2.1, 0); aw.rotation.x = -Math.PI / 2 + 0.35; g.add(aw);
    for (let i = 0; i < 6; i++) piece(g, GEO.ball, PMAT.fruit[i % 4], -0.8 + i * 0.32, 1.0, (R(10 + i) - 0.5) * 0.5, 0.09, 0.09, 0.09);
  },
  cart(g) {
    piece(g, GEO.box, PMAT.wood, 0, 0.7, 0, 1.6, 0.12, 1.0);
    for (const z of [-0.5, 0.5]) piece(g, GEO.box, PMAT.woodD, 0, 0.9, z, 1.6, 0.35, 0.06);
    for (const z of [-0.58, 0.58]) piece(g, GEO.cyl, PMAT.woodD, -0.2, 0.45, z, 0.45, 0.08, 0.45, Math.PI / 2);
    piece(g, GEO.box, PMAT.woodD, 1.4, 0.55, 0, 1.4, 0.06, 0.06, 0, 0, 0.25);
    piece(g, GEO.ico, PMAT.hay, 0, 1.0, 0, 0.7, 0.28, 0.44);
  },
  banner(g, R) {
    piece(g, GEO.cyl, PMAT.woodD, 0, 1.8, 0, 0.055, 3.6, 0.055);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.5), PMAT.cloth[Math.floor(R(6) * PMAT.cloth.length)]); f.position.set(0.38, 2.7, 0); g.add(f);
    piece(g, GEO.box, PMAT.woodD, 0.38, 3.45, 0, 0.9, 0.05, 0.05);
  },
  lamp(g) {
    piece(g, GEO.cyl, PMAT.iron, 0, 1.4, 0, 0.075, 2.8, 0.075);
    piece(g, GEO.box, PMAT.iron, 0.22, 2.75, 0, 0.5, 0.05, 0.05);
    piece(g, GEO.box, PMAT.glass, 0.45, 2.55, 0, 0.22, 0.3, 0.22);
  },
  flowerbox(g, R) {
    piece(g, GEO.box, PMAT.woodD, 0, 0.2, 0, 1.2, 0.4, 0.4);
    for (let i = 0; i < 7; i++) piece(g, GEO.ico, PMAT.bloom[i % 4], -0.5 + i * 0.17, 0.48 + R(20 + i) * 0.08, (R(30 + i) - 0.5) * 0.2, 0.11, 0.11, 0.11);
  },
  bench(g) { piece(g, GEO.box, PMAT.wood, 0, 0.45, 0, 1.5, 0.08, 0.45); for (const x of [-0.6, 0.6]) piece(g, GEO.box, PMAT.woodD, x, 0.22, 0, 0.08, 0.44, 0.4); piece(g, GEO.box, PMAT.wood, 0, 0.75, -0.2, 1.5, 0.3, 0.05); },
  hay(g) { piece(g, GEO.cyl, PMAT.hay, 0, 0.35, 0, 0.4, 0.7, 0.4, 0, 0, Math.PI / 2); },
  well(g) { piece(g, GEO.cyl, PM('#8a8478', 0.95), 0, 0.4, 0, 1.0, 0.8, 1.0); },
};
/** A square prop as a group at (x, z), turned ry (code-built, deterministic by position). */
export function squareProp(kind, x, z, ry = 0, y = 0) {
  const g = new THREE.Group();
  const R = (s) => hash2(Math.round(x * 8), Math.round(z * 8), 300 + s);
  (MAKE[kind] || MAKE.crate)(g, R);
  g.position.set(x, y, z); g.rotation.y = ry;
  return g;
}

// ---------- the ground material: cobbles with colour variety, a worn road rim ----------
function kitMask(masks) {
  const { W, H, plaza } = masks;
  const d = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { d[i * 4] = plaza[i] ? 255 : 0; d[i * 4 + 3] = 255; }
  // DataTexture rows run bottom-up against the ground's canvas textures (flipY): store row y at H - 1 - y
  const f = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) f.set(d.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4);
  const t = new THREE.DataTexture(f, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}
const COBBLE_GLSL = `
      {
        // cobbles (ground kit): a stone per Voronoi cell, each its own shade (warm, cool, dark, pale), dark mortar with a
        // little moss in it, a bevel at the stone's rim; the mask's edge is broken by the same jitter as the classes
        float pm = smoothstep(0.32, 0.68, texture2D(tKit, uv).r);
        if (pm > 0.002) {
          vec2 cp = tc * 1.9;
          vec2 ci = floor(cp), cf = fract(cp);
          float d1 = 8.0, d2 = 8.0; vec2 id = ci;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = vec2(lrH(ci + g), lrH(ci + g + 7.7)) * 0.8 + 0.1;
            float d = length(g + o - cf);
            if (d < d1) { d2 = d1; d1 = d; id = ci + g; } else if (d < d2) d2 = d;
          }
          float e = d2 - d1, h1 = lrH(id + 3.1), h2 = lrH(id + 9.4), h3 = lrH(id + 1.7);
          vec3 stone = col * vec3(1.16, 1.06, 0.9) * (0.78 + 0.46 * h1);                                    // today's plaza colour, stone by stone
          stone *= mix(vec3(1.0), vec3(1.12, 1.0, 0.82), step(0.62, h2));        // warm sandstone
          stone *= mix(vec3(1.0), vec3(0.93, 0.97, 1.02), step(h2, 0.18));       // cool slate
          stone *= mix(1.0, 0.72, step(0.88, h3));                                 // the odd dark stone
          stone *= mix(1.0, 0.9, smoothstep(0.55, 0.85, mac.g));                  // big soft patches: wear and damp
          vec3 mort = mix(col * 0.5, vec3(0.16, 0.2, 0.1), 0.3 * smoothstep(0.4, 0.8, jn.b));
          vec3 cob = mix(mort, stone * (0.8 + 0.2 * smoothstep(0.05, 0.3, e)), smoothstep(0.02, 0.06, e));
          col = mix(col, cob, pm);
        }
        // a worn rim where a road meets the grass: a little darker, as if trodden
        float wr = texture2D(tW, uv).r;
        col *= 1.0 - 0.16 * smoothstep(0.12, 0.4, wr) * (1.0 - smoothstep(0.5, 0.8, wr));
      }
        diffuseColor.rgb *= col;`;

/** The ground kit for one zone, or null (kit off: Low quality, ?ground=off, or a dungeon or cave). */
export function createGroundKit(zone, { terr, quality, place = false, tilesDb = null } = {}) {
  if (!kitOn(quality) || place) return null;
  const W = zone.w, H = zone.h;
  const masks = groundMasks(zone, terr, { tilesDb });
  const hf = heightField(zone, masks);
  const h = hf ? hf.at : () => 0;
  let hasPlaza = false;
  for (let i = 0; i < W * H; i++) if (masks.plaza[i]) { hasPlaza = true; break; }
  const mask = hasPlaza ? kitMask(masks) : null;
  let grassMesh = null, flowerMesh = null, groundTex = null, live = '';
  const chunks = new Map();   // 'i,j' -> { grass: Float32Array, flowers: Float32Array, used }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const kit = {
    masks, hf, cobbles: hasPlaza, h,
    geometry() {
      if (!hf) return new THREE.PlaneGeometry(W, H);
      const g = new THREE.PlaneGeometry(W, H, hf.nx, hf.ny);
      const p = g.attributes.position;
      for (let j = 0; j <= hf.ny; j++) for (let i = 0; i <= hf.nx; i++) p.setZ(j * (hf.nx + 1) + i, hf.h[j * (hf.nx + 1) + i]);
      g.computeVertexNormals();
      return g;
    },
    material(mat) {
      groundTex = mat.map;
      if (!mask) return mat;
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => {
        prev(sh, r);
        sh.uniforms.tKit = { value: mask };
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D tKit;\nfloat lrH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
          .replace('        diffuseColor.rgb *= col;', COBBLE_GLSL);
      };
      mat.customProgramCacheKey = () => 'lr_ground2_kit1';
      return mat;
    },
    /** A little tree variety: some inland pines on open grass become kit oaks (CommonTree), a few on the moor dead. */
    tree(t, x, y, edge, under) {
      if (t !== 'tree_pine' || edge || zone.canopy || zone.style) return null;
      const r = hash2(x, y, 61);
      if (/moor|heath/.test(under || '')) return r < 0.12 ? 'nature/DeadTree_3.gltf' : null;
      return r < 0.34 ? `nature/CommonTree_${1 + Math.floor(hash2(x, y, 62) * 5)}.gltf` : null;
    },
    /** The start-realm square's dressing, merged by the zone batcher; lamp posts also give a light spot. */
    dress(B, lamp) {
      const plan = planSquare(zone, terr, tilesDb);
      if (!plan) return 0;
      for (const it of plan.items) {
        const g = squareProp(it.kind, it.x, it.z, it.ry, h(it.x, it.z));
        B.mergeGroup(g);
        if (it.kind === 'lamp' && lamp) lamp({ pos: new THREE.Vector3(it.x + 0.45 * Math.cos(it.ry), 2.5, it.z - 0.45 * Math.sin(it.ry)), color: '#ffb35c', k: 0.9 });
      }
      kit.plan = plan;
      return plan.items.length;
    },
    attach(group) {
      if (!quality.grass || !groundTex) return;
      grassMesh = new THREE.InstancedMesh(clumpGeo(), swayMat({ groundTex, W, H }), 1);
      flowerMesh = new THREE.InstancedMesh(flowerGeo(), swayMat({ groundTex, W, H, flower: true }), 1);
      for (const m of [grassMesh, flowerMesh]) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.name = 'lr_kit_grass'; group.add(m); }
    },
    view: null,
    cull(x, z) {
      if (!grassMesh) return;
      const keys = [], v = kit.view, GR = v ? v.r : GRASS_R;
      if (v) { x += v.dx; z += v.dz; }
      const i0 = Math.floor((x - GR) / GCH), i1 = Math.floor((x + GR) / GCH), j0 = Math.floor((z - GR) / GCH), j1 = Math.floor((z + GR) / GCH);
      for (let j = Math.max(0, j0); j <= Math.min(Math.ceil(H / GCH) - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(Math.ceil(W / GCH) - 1, i1); i++) {
        const cx = (i + 0.5) * GCH, cz = (j + 0.5) * GCH;
        if (Math.hypot(cx - x, cz - z) - GCH * 0.71 < GR) keys.push(`${i},${j}`);
      }
      const key = keys.join(';');
      if (key === live) return;
      live = key;
      let ng = 0, nf = 0;
      const got = keys.map((k) => {
        let ch = chunks.get(k);
        if (!ch) { const [i, j] = k.split(',').map(Number); ch = grassChunk(masks, hf, i, j, GCH); chunks.set(k, ch); }
        ch.used = performance.now();
        ng += ch.grass.length / 6; nf += ch.flowers.length / 5;
        return ch;
      });
      // forget far chunks past a cap (they rebuild in well under a millisecond when the hero comes back)
      if (chunks.size > 160) [...chunks.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, chunks.size - 120).forEach(([k]) => chunks.delete(k));
      const grow = (mesh, n) => {
        if (n <= mesh.instanceMatrix.count) return mesh;
        const cap = Math.ceil(n * 1.25);
        const nm = new THREE.InstancedMesh(mesh.geometry, mesh.material, cap);
        nm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        nm.frustumCulled = false; nm.castShadow = false; nm.receiveShadow = true; nm.name = mesh.name;
        mesh.parent.add(nm); mesh.parent.remove(mesh); mesh.dispose();
        return nm;
      };
      grassMesh = grow(grassMesh, ng); flowerMesh = grow(flowerMesh, nf);
      let a = 0, b = 0;
      for (const ch of got) {
        const G = ch.grass, F = ch.flowers;
        for (let k = 0; k < G.length; k += 6) {
          q.setFromAxisAngle(up, G[k + 3]); const s = G[k + 4];
          grassMesh.setMatrixAt(a, m4.compose(pv.set(G[k], G[k + 1], G[k + 2]), q, sv.set(s, s * (0.8 + 0.3 * ((k / 6) % 3) / 2), s)));
          grassMesh.setColorAt(a, c.setRGB(G[k + 5], G[k + 5], G[k + 5] * 0.96)); a++;
        }
        for (let k = 0; k < F.length; k += 5) {
          q.setFromAxisAngle(up, k * 0.7); const s = F[k + 4];
          flowerMesh.setMatrixAt(b, m4.compose(pv.set(F[k], F[k + 1], F[k + 2]), q, sv.set(s, s, s)));
          flowerMesh.setColorAt(b, FLOWER_COLS[F[k + 3] | 0]); b++;
        }
      }
      grassMesh.count = a; flowerMesh.count = b;
      for (const m of [grassMesh, flowerMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      kit.stats = { chunks: keys.length, grass: a, flowers: b };
    },
    dispose() {
      if (mask) mask.dispose();
      for (const m of [grassMesh, flowerMesh]) if (m) { m.geometry.dispose(); m.material.dispose(); m.dispose(); }
      chunks.clear();
    },
  };
  return kit;
}

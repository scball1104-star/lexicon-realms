// Water kit (wave 7, plan item 10; Scott approved the brief 2026-11-24). Flowing rivers, shore
// foam, depth colour, the sky in the water, and waterfalls with a pool, spray, mist and rocks. All code, no textures
// beyond the game's own ripple normal map and noise.
//
//   waterTier({ q3d, water, touchLow })   -> 'full' | 'lite' | 'off'
//        'off'  : ?q3d=low or ?water=off. zone3d builds today's water exactly (this file is never called).
//        'lite' : phones (touch on the automatic low tier): the new surface shader and the falls curtain, a small spray,
//                 no mist sheets. Same draw calls as today plus one for each falls.
//        'full' : desktop: the surface, the curtain, spray and mist, pool rocks.
//   poolCells(terr, W, H, zone)           -> the falls pools' map tiles (a Set of y * W + x), for waterPlan
//   waterPlan(terr, W, H, zone, pool)     -> { tex, falls, stats }: a per-tile RGBA texture (RG flow direction, B speed,
//        A depth) worked out from the tile map once per zone build, and the falls found in the zone's secrets
//   surfaceUniforms(plan)                 -> the extra uniforms for one zone's water material
//   patchSurface(sh, tier)             -> adds the kit to waterMaterial's onBeforeCompile (zone3d.js)
//   buildFalls(group, falls, tier, rnd)   -> the curtain, spray, mist and rocks for each falls
//   setSprayScale(px)                     -> the spray's point size follows the viewport height (renderer3d resize)
//   tickWaterKit(t)                       -> every frame (zone3d tickWater)
//   waterSky(domeU, fog, sun, hemi)       -> every frame after the sky kit (renderer3d): the colours the water reflects
//
// Render only: nothing here touches the sim or the collision map.
import * as THREE from '../vendor/three/three.module.min.js';
import { waterNormal, groundDetail } from './textures.js';

export function waterTier({ q3d = null, water = null, touchLow = false } = {}) {
  if (water === 'off' || water === 'full' || water === 'lite') return water;
  if (q3d === 'low') return 'off';
  return touchLow ? 'lite' : 'full';
}

// the shared uniforms: the clock and the sky the water reflects (waterSky sets them every frame)
export const WK = {
  uT: { value: 0 }, uZen: { value: new THREE.Color('#3a78d0') }, uHor: { value: new THREE.Color('#bcd6ee') },
  uSunCol: { value: new THREE.Color('#fff4e0') }, uSun: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
  uCover: { value: 0.42 }, uDay: { value: 1 }, uLight: { value: new THREE.Color('#ffffff') },
};
export function tickWaterKit(t) { WK.uT.value = t; }
if (typeof window !== 'undefined') window.__waterKit = WK;   // dev probes (look-dev, stills)

const tmpC = new THREE.Color();
export function waterSky(domeU, fog, sun, hemi) {
  if (domeU) {
    WK.uZen.value.copy(domeU.uZen.value); WK.uHor.value.copy(domeU.uHor.value); WK.uSunCol.value.copy(domeU.uSunCol.value);
    WK.uSun.value.copy(domeU.uSun.value); WK.uCover.value = domeU.uCover.value; WK.uDay.value = domeU.uDay.value;
  } else if (fog) {
    // no sky kit (Effects low, ?sky=off): reflect the flat sky colour, a little darker overhead
    WK.uHor.value.copy(fog.color); WK.uZen.value.copy(fog.color).multiplyScalar(0.8);
    if (sun) { WK.uSunCol.value.copy(sun.color); WK.uSun.value.copy(sun.position).sub(sun.target.position).normalize(); }
    WK.uDay.value = sun ? Math.min(1, sun.intensity / 2) : 1;
  }
  // the light on spray and mist: the sun plus the sky fill
  if (sun && hemi) WK.uLight.value.copy(sun.color).multiplyScalar(Math.min(1.2, sun.intensity * 0.28)).add(tmpC.copy(hemi.color).multiplyScalar(hemi.intensity * 0.5));
}

const WET = new Set(['water', 'shallow', 'x1_tarn']);

/** The pool at a falls foot: the shallow map tiles in an oval below each falls (the map carries them as real wading
 *  water, tools/maps/zone_valley.mjs). They draw deep at the foot, not as a pale shelf. Read only: terr is unchanged. */
export function poolCells(terr, W, H, zone) {
  const cells = new Set();
  for (const s of zone.secrets || []) {
    if (s.kind !== 'waterfall') continue;
    const xs = s.passage.map((p) => p[0]), ys = s.passage.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, y1 = Math.max(...ys) + 1, cz = y1 + 0.9;
    for (let y = y1; y < Math.min(H, y1 + 4); y++) for (let x = Math.max(0, Math.floor(cx - 4)); x < Math.min(W, Math.ceil(cx + 4)); x++) {
      const dx = (x + 0.5 - cx) / 2.9, dz = (y + 0.5 - cz) / 1.9;
      if (dx * dx + dz * dz <= 1 && terr[y][x] === 'shallow') cells.add(y * W + x);
    }
  }
  return cells;
}
const CLIFF = /cliff|ledge|crag/;

/** The per-tile plan: depth from the shore, the flow from where the water comes in, the falls. */
export function waterPlan(terr, W, H, zone, pool = new Set()) {
  const N = W * H, wet = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (WET.has(terr[y][x])) wet[y * W + x] = 1;
  // depth: chamfer distance to the nearest dry tile (tiles), two passes
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = wet[i] ? 99 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 99 : dist[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (wet[i]) dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.41, at(x + 1, y - 1) + 1.41); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (wet[i]) dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.41, at(x - 1, y + 1) + 1.41); }
  // falls: the zone's waterfall secrets (a curtain over a passage, the pool at its foot)
  const falls = [];
  for (const s of zone.secrets || []) {
    if (s.kind !== 'waterfall') continue;
    const xs = s.passage.map((p) => p[0]), ys = s.passage.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    falls.push({ id: s.id, x0, x1, y0, y1, cx: (x0 + x1) / 2, foot: y1 + 0.35, w: x1 - x0 - 0.1, h: 2.7 });
  }
  // flow: a breadth-first walk downstream from where the water comes in (the zone edge, under a cliff to the north,
  // the foot of a falls); the direction is the walk's gradient, the speed is higher where the water is narrow
  const down = new Float32Array(N).fill(-1), q = [];
  const src = (i) => { if (down[i] < 0) { down[i] = 0; q.push(i); } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!wet[i]) continue;
    if (y === 0 || (y > 0 && CLIFF.test(terr[y - 1][x]))) src(i);
  }
  for (const f of falls) for (let x = f.x0; x < f.x1; x++) { const y = Math.min(H - 1, f.y1); if (wet[y * W + x]) src(y * W + x); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy, c] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (!wet[j] || down[j] >= 0) continue;
      down[j] = down[i] + c; q.push(j);
    }
  }
  const fx = new Float32Array(N), fz = new Float32Array(N), sp = new Float32Array(N);
  const run = (x, y, dx, dy) => { let n = 0; for (let k = 1; k < 40; k++) { const a = x + dx * k, b = y + dy * k; if (a < 0 || b < 0 || a >= W || b >= H || !wet[b * W + a]) break; n++; } return n; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!wet[i] || down[i] < 0) continue;
    const g = (a, b) => (a < 0 || b < 0 || a >= W || b >= H || down[b * W + a] < 0 ? down[i] : down[b * W + a]);
    let gx = g(x + 1, y) - g(x - 1, y), gz = g(x, y + 1) - g(x, y - 1);
    const l = Math.hypot(gx, gz);
    if (l < 1e-3) continue;
    gx /= l; gz /= l;
    const width = Math.min(1 + run(x, y, 1, 0) + run(x, y, -1, 0), 1 + run(x, y, 0, 1) + run(x, y, 0, -1));
    fx[i] = gx; fz[i] = gz; sp[i] = Math.max(0.15, Math.min(1, 2.6 / width));
  }
  // round each falls foot: the water spreads out from it and churns
  for (const f of falls) {
    for (let y = Math.max(0, f.y1 - 1); y < Math.min(H, f.y1 + 4); y++) for (let x = Math.max(0, f.x0 - 3); x < Math.min(W, f.x1 + 3); x++) {
      const i = y * W + x; if (!wet[i]) continue;
      const dx = x + 0.5 - f.cx, dz = y + 0.5 - f.foot, d = Math.hypot(dx, dz);
      if (d > 3) continue;
      const k = 1 - d / 3;
      const ox = d > 0.01 ? dx / d : 0, oz = d > 0.01 ? dz / d : 1;
      fx[i] = fx[i] * (1 - k) + ox * k; fz[i] = fz[i] * (1 - k) + oz * k; sp[i] = Math.max(sp[i], 0.4 + 0.6 * k);
      dist[i] = Math.max(dist[i], 3.5 * k);                                   // a real pool: deep at the foot
    }
  }
  // soften the flow field (two 3x3 passes over the water)
  for (let pass = 0; pass < 2; pass++) {
    const ax = new Float32Array(fx), az = new Float32Array(fz), as = new Float32Array(sp);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!wet[i]) continue;
      let sx = 0, sz = 0, ss = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= W || b >= H || !wet[b * W + a]) continue;
        const j = b * W + a; sx += ax[j]; sz += az[j]; ss += as[j]; n++;
      }
      fx[i] = sx / n; fz[i] = sz / n; sp[i] = ss / n;
    }
  }
  const data = new Uint8Array(N * 4);
  let flowing = 0, wetN = 0;
  for (let i = 0; i < N; i++) {
    if (!wet[i]) { data[i * 4] = 128; data[i * 4 + 1] = 128; continue; }
    wetN++;
    const l = Math.hypot(fx[i], fz[i]) || 1;
    if (sp[i] > 0.01) flowing++;
    data[i * 4] = Math.round((fx[i] / l * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((fz[i] / l * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round(Math.min(1, sp[i] * Math.min(1, l * 1.5)) * 255);
    const t = terr[(i / W) | 0][i % W];
    data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (dist[i] - 0.5) / 3.2)) * (t === 'shallow' && !pool.has(i) ? 0.35 : 1) * 255);
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  return { tex, falls, stats: { wet: wetN, flowing, falls: falls.length, texels: N } };
}

const MAXF = 4;
/** Extra uniforms for one zone's water material (zone3d waterMaterial passes U). */
export function surfaceUniforms(plan) {
  const feet = [];
  for (let i = 0; i < MAXF; i++) { const f = plan.falls[i]; feet.push(f ? new THREE.Vector4(f.cx, f.foot, f.w, 1) : new THREE.Vector4(0, 0, 0, 0)); }
  return { tFlow: { value: plan.tex }, uFeet: { value: feet }, ...WK };
}

/** Add the kit to the water surface shader (called inside waterMaterial's onBeforeCompile, after its own replacements). */
export function patchSurface(sh, tier) {
  const lite = tier === 'lite' ? 1 : 0;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
uniform sampler2D tFlow; uniform vec4 uFeet[${MAXF}]; uniform float uT, uCover, uDay; uniform vec3 uZen, uHor, uSunCol, uSun, uLight;
float lrD = 0.0, lrSp = 0.0, lrFoam = 0.0, lrK = 0.0, n2b = 0.5; vec2 lrFl = vec2(0.0); float lrChurn = 0.0;`)
    // depth colour, shore foam that laps, foam carried by the current, the churn round a falls foot
    .replace('lrInk = m.b * edge', `{
        vec4 fp = texture2D(tFlow, vWW / uSize);
        lrFl = fp.rg * 2.0 - 1.0; lrSp = fp.b; lrD = fp.a;
        lrK = 1.0 - m.b;                                                    // not on ink or lava
        float d = clamp(lrD + (j.r - 0.5) * 0.18, 0.0, 1.0);
        vec3 shallowC = vec3(0.30, 0.47, 0.42), midC = vec3(0.10, 0.27, 0.32), deepC = vec3(0.025, 0.10, 0.15);
        vec3 wc = mix(shallowC, midC, smoothstep(0.0, 0.35, d));
        wc = mix(wc, deepC, smoothstep(0.3, 1.0, d));
        // foam: the shore line laps in and out; streaks ride the current where it runs fast
        float lap = 0.5 + 0.5 * sin(uT * 1.4 - d * 26.0 + j.g * 6.0);
        float shore = (1.0 - smoothstep(0.01, 0.07 + 0.05 * lap, d)) * (0.35 + 0.45 * j.b);
        vec2 fw = vWW - lrFl * lrSp * uT * 1.1;
        float streak = texture2D(tJit, fw * vec2(0.55, 0.55) + vec2(0.37, 0.11)).g;
        float carried = smoothstep(0.62, 0.8, streak) * smoothstep(0.35, 0.8, lrSp) * 0.55;
        for (int i = 0; i < ${MAXF}; i++) {
          if (uFeet[i].w < 0.5) continue;
          vec2 q = vWW - uFeet[i].xy; q.x /= max(0.6, uFeet[i].z * 0.7);
          float r = length(q);
          float rings = 0.5 + 0.5 * sin(r * 9.0 - uT * 5.0 + j.r * 4.0);
          lrChurn = max(lrChurn, (1.0 - smoothstep(0.0, 0.95, r)) * 0.9 + (1.0 - smoothstep(0.5, 2.4, r)) * smoothstep(0.75, 1.0, rings) * 0.35);
          wc = mix(wc, mix(midC, deepC, 0.75), (1.0 - smoothstep(1.2, 3.2, r)) * 0.9);
        }
        lrFoam = clamp(max(shore, max(carried, lrChurn * (0.6 + 0.4 * streak))), 0.0, 1.0) * lrK;
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(wc, vec3(0.86, 0.9, 0.9), lrFoam), lrK);
        diffuseColor.a = mix(diffuseColor.a, edge * mix(0.5, 0.94, smoothstep(0.0, 0.6, d)) + lrFoam * 0.3, lrK);
      }
      lrInk = m.b * edge`)
    // ripples that run with the current (two phases so they never stretch), plus a fine still layer
    .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
      'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      `vec2 lrB = vWW * 0.21;
      float ph0 = fract(uT * 0.32), ph1 = fract(uT * 0.32 + 0.5);
      vec2 lrV = lrFl * (0.15 + lrSp * 1.6);
      vec3 n0 = texture2D(normalMap, lrB - lrV * ph0 * 0.9).xyz * 2.0 - 1.0;
      vec3 n1 = texture2D(normalMap, lrB - lrV * ph1 * 0.9 + 0.5).xyz * 2.0 - 1.0;
      vec3 n2 = texture2D(normalMap, vWW * 0.53 + uT * vec2(0.011, 0.017)).xyz * 2.0 - 1.0;
      vec3 mapN = normalize(mix(n0, n1, abs(0.5 - ph0) * 2.0) + n2 * 0.6); n2b = n2.x * 0.5 + 0.5;
      mapN.xy *= 1.0 + lrSp * 0.8 + lrChurn * 1.5;`))
    // the sky in the water: the dome's colours by the reflected ray's height, a hint of cloud, the sun's glint
    .replace('#include <opaque_fragment>', `{
        vec3 vd = normalize(-vViewPosition);                                 // camera to surface (view space)
        vec3 rv = reflect(vd, normal);
        vec3 rw = normalize((vec4(rv, 0.0) * viewMatrix).xyz);
        vec3 gn = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float el = clamp(rw.y, 0.0, 1.0);
        vec3 skyc = mix(uHor, uZen, smoothstep(0.02, 0.6, el));
        vec3 bank = uLight * vec3(0.075, 0.09, 0.06) + uHor * 0.08;          // low rays meet the far bank's trees, not the sky
        vec2 cp = rw.xz / (rw.y + 0.12) * 0.06 + vec2(uT * 0.002, uT * 0.0013);
        float cl = texture2D(tJit, cp).r * 0.6 + texture2D(tJit, cp * 2.3 + 0.3).g * 0.4;
        skyc = mix(skyc, mix(uHor, vec3(1.0), 0.35), smoothstep(0.48, 0.72, cl) * (0.3 + uCover) * 0.6);
        float cosT = clamp(dot(-vd, gn), 0.0, 1.0);
        skyc = mix(bank, skyc, smoothstep(0.12, 0.42, el + (n2b - 0.5) * 0.25));
        float F = mix(0.1, 0.62, pow(1.0 - cosT, 2.0));
        float sd = max(dot(rw, normalize(uSun)), 0.0);
        vec3 glint = uSunCol * (pow(sd, 600.0) * 9.0 + pow(sd, 60.0) * 0.6) * uDay * smoothstep(-0.05, 0.1, uSun.y);
        float k = lrK * (1.0 - lrFoam);
        outgoingLight = mix(outgoingLight, skyc, F * k) + glint * k;
        diffuseColor.a = mix(diffuseColor.a, max(diffuseColor.a, F * smoothstep(0.32, 0.6, max(diffuseColor.a, 0.0)) ), lrK);
      }
      #include <opaque_fragment>`);
}

// ---------- falls: curtain, spray, mist, rocks ----------
const NOISE = `
float lrh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lrn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(lrh(i), lrh(i+vec2(1,0)), u.x), mix(lrh(i+vec2(0,1)), lrh(i+vec2(1,1)), u.x), u.y); }`;

function curtainMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uW: { value: 1 } }]),
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: `varying vec2 vUv; varying float vW;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uT, uW; uniform vec3 uLight; varying vec2 vUv; ${NOISE}
      #include <fog_pars_fragment>
      void main(){
        float y = vUv.y;                         // 1 at the lip, 0 at the pool
        float fall = 1.0 - y;
        float x = vUv.x * uW * 3.2;
        // streaks: noise stretched down the face, scrolling faster as the water falls
        float s = uT * (1.3 + fall * 2.2);
        float n = lrn(vec2(x * 9.0, y * 1.4 + s)) * 0.6 + lrn(vec2(x * 23.0, y * 2.6 + s * 1.5)) * 0.4;
        float streak = smoothstep(0.38, 0.8, n);
        float gap = smoothstep(0.25, 0.45, lrn(vec2(x * 5.0, y * 0.7 + s * 0.6)));
        vec3 deep = vec3(0.16, 0.32, 0.38), white = vec3(0.9, 0.95, 0.97);
        vec3 c = mix(deep, white, clamp(streak * 0.8 + fall * fall * fall * 0.6 + smoothstep(0.9, 1.0, y) * 0.7, 0.0, 1.0));
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float a = (0.35 + 0.5 * streak * gap + 0.25 * fall * fall) * edge;
        a *= 1.0 - smoothstep(0.0, 0.06, -y + 0.04);
        gl_FragColor = vec4(c * uLight, clamp(a, 0.0, 0.97));
        #include <fog_fragment>
      }`,
  });
}

function sprayMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 } }]),
    transparent: true, depthWrite: false, fog: true,
    vertexShader: `attribute vec4 seed; attribute float kind; uniform float uT, uScale; varying float vA; varying float vK;
      #include <fog_pars_vertex>
      void main(){
        vec3 p = position;
        float life, sz;
        if (kind < 0.5) {                              // spray: thrown up and out from the foot, falls back
          life = fract(uT * (0.55 + seed.w * 0.5) + seed.x);
          float ang = seed.y * 6.2832, out_ = 0.25 + seed.z * 1.1;
          p += vec3(cos(ang) * out_ * life * 1.4, (2.2 + seed.w * 1.6) * life - 3.2 * life * life, sin(ang) * 0.55 * out_ * life + life * 0.5);
          sz = 0.05 + 0.13 * life; vA = (1.0 - life) * smoothstep(0.0, 0.08, life) * 0.5;
        } else {                                       // mist: big soft sheets that drift and breathe
          life = fract(uT * 0.05 + seed.x);
          p += vec3((seed.y - 0.5) * 3.0 + sin(uT * 0.21 + seed.z * 6.0) * 0.6, 0.6 + life * 1.8, 0.4 + life * 1.6);
          sz = 2.2 + 2.4 * life; vA = sin(life * 3.1416) * 0.07;
        }
        vK = kind;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        // close up a point covers a lot of screen (the frame cost at the falls): thin it out and cap its size
        float px = sz * uScale / max(0.1, -mvPosition.z), cap = kind < 0.5 ? uScale * 0.025 : uScale * 0.18;
        vA *= 1.0 - smoothstep(cap * 0.5, cap, px) * 0.85;
        if (kind < 0.5 && seed.x > 1.0 - smoothstep(cap * 0.5, cap, px) * 0.6) vA = 0.0;   // drop up to 60% of the drops
        gl_PointSize = vA < 0.004 ? 0.0 : min(px, cap);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uLight; varying float vA; varying float vK;
      #include <fog_pars_fragment>
      void main(){
        vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0;
        float a = vA * (vK < 0.5 ? smoothstep(1.0, 0.2, r) : smoothstep(1.0, 0.0, r) * smoothstep(1.0, 0.0, r));
        if (a < 0.004) discard;
        gl_FragColor = vec4(vec3(0.9, 0.94, 0.96) * uLight, a);
        #include <fog_fragment>
      }`,
  });
}

let CURTAIN = null, SPRAY = null;
const ROCK = new THREE.MeshStandardMaterial({ color: '#5c5a55', roughness: 0.75, metalness: 0.0, flatShading: true });

/** The falls for one zone: returns the meshes added (so a dispose can find them). */
export function buildFalls(group, falls, tier, rnd) {
  if (!falls.length) return [];
  if (!CURTAIN) { CURTAIN = curtainMaterial(); SPRAY = sprayMaterial(); for (const m of [CURTAIN, SPRAY]) Object.assign(m.uniforms, { uT: WK.uT, uLight: WK.uLight }); SPRAY.uniforms.uScale.value = sprayScale; }
  const made = [];
  const sprayN = tier === 'full' ? 320 : 80, mistN = tier === 'full' ? 9 : 0;
  const pos = [], seed = [], kind = [];
  const rockGeos = [];
  for (const f of falls) {
    // the curtain: bowed out from the cliff, wider at the foot, from the lip down into the pool
    const geo = new THREE.PlaneGeometry(1, 1, 6, 10), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;      // v 1 at the top
      const w = f.w * (1 + 0.25 * (1 - v));
      p.setXYZ(i, f.cx + (u - 0.5) * w, v * f.h - 0.08, f.y1 - 0.25 + 0.55 * Math.pow(1 - v, 1.6) + Math.sin(u * 9 + v * 4) * 0.03);
    }
    geo.computeVertexNormals();
    const cm = CURTAIN.clone(); cm.uniforms.uT = WK.uT; cm.uniforms.uLight = WK.uLight; cm.uniforms.uW.value = f.w;
    const m = new THREE.Mesh(geo, cm); m.renderOrder = 2; group.add(m); made.push(m);
    for (let i = 0; i < sprayN; i++) { pos.push(f.cx + (rnd() - 0.5) * f.w * 0.9, 0.05, f.foot - 0.1 + rnd() * 0.3); seed.push(rnd(), rnd(), rnd(), rnd()); kind.push(0); }
    for (let i = 0; i < mistN; i++) { pos.push(f.cx, 0.1, f.foot); seed.push(i / mistN, rnd(), rnd(), rnd()); kind.push(1); }
    // a few wet boulders round the pool's rim
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.1 + 0.8 * (i / 6)) + (rnd() - 0.5) * 0.3, r = 1.7 + rnd() * 0.9;
      const g = new THREE.IcosahedronGeometry(0.22 + rnd() * 0.3, 0);
      g.scale(1.2, 0.6 + rnd() * 0.3, 1); g.rotateY(rnd() * 6);
      // the pool is real wading water and the way through the falls runs straight up its middle: keep the rocks to the sides
      let rx = Math.cos(a) * r * 1.25 * (i % 2 ? 1 : -1);
      const lane = f.w / 2 + 0.55;
      if (Math.abs(rx) < lane) rx = (rx < 0 || (rx === 0 && i % 2) ? -1 : 1) * (lane + rnd() * 0.5);
      g.translate(f.cx + rx, 0.05, f.foot + Math.sin(a) * r * 0.8);
      rockGeos.push(g);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 4));
  sg.setAttribute('kind', new THREE.Float32BufferAttribute(kind, 1));
  sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(falls[0].cx, 1, falls[0].foot), 12);
  const pts = new THREE.Points(sg, SPRAY); pts.renderOrder = 4; pts.frustumCulled = falls.length === 1; group.add(pts); made.push(pts);
  if (tier === 'full' && rockGeos.length) {
    const merged = mergeGeos(rockGeos);
    const rm = new THREE.Mesh(merged, ROCK); rm.castShadow = true; rm.receiveShadow = true; group.add(rm); made.push(rm);
  }
  return made;
}

function mergeGeos(geos) {
  const flat = (g) => (g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of geos) n += flat(g).attributes.position.count;
  const P = new Float32Array(n * 3); let o = 0;
  for (const g0 of geos) { const g = flat(g0); P.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.computeVertexNormals();
  return out;
}

/** Spray point size follows the viewport height (the renderer calls it on resize). */
let sprayScale = 400;
export function setSprayScale(px) { sprayScale = px; if (SPRAY) SPRAY.uniforms.uScale.value = px; }

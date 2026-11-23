// FX kit: data-driven combat and spell effects for three.js (approved 2026-11-23; in the game through fx3d.js).
//
//   import { createFxKit } from './fx_kit.js';
//   const K = createFxKit(THREE, scene, { maxAdd: 2048, maxInk: 1024, seed: 7 });
//   K.play('scribe_inkbolt', { from: () => handPos, to: () => foeChest, ground: 0, school: 'ink', dir: yaw, mats: foeMats });
//   K.update(dt, now)   once a frame (no allocation inside)
//   K.lights            [{ pos, color, k }] light requests (the same shape the game's fx3d gives its capped light pool)
//   K.screen            { shake, flash, flashColor, hitstop } for the camera and a screen flash (the page decides)
//   K.stats             { add, ink, ribbons, shields, effects } live counts
//
// What draws: two instanced quad systems (additive glow and normal-blend "ink"), each ONE draw call however many sparks,
// flashes, motes, droplets, ground rings and decals are live; two ribbon meshes (trails, sword arcs, beams), ONE draw
// call each; a small pool of shield bubbles and arrow meshes. All textures are painted once on canvas (one 4x4 atlas,
// one ribbon strip). Particles live in preallocated typed arrays; effect instances, anchors and lights are pooled.
// A recipe (fx_recipes.js) is a list of timed layers; see the layer reference at the bottom of fx_recipes.js.

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

// ---------- timing curves ----------
export const EASE = {
  linear: (k) => k,
  inQuad: (k) => k * k,
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  outCubic: (k) => 1 - (1 - k) ** 3,
  outExpo: (k) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k)),
  inOutQuad: (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  outBack: (k) => { const c = 1.9; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; },
};
const EASE_ID = Object.keys(EASE);
const EASE_FN = EASE_ID.map((k) => EASE[k]);
// alpha over a particle's life
const ALPHA = {
  fade: (k) => 1 - k,
  fade2: (k) => 1 - k * k,
  pop: (k) => (k < 0.08 ? k / 0.08 : (1 - (k - 0.08) / 0.92) ** 1.6),
  bump: (k) => Math.sin(k * Math.PI),
  hold: (k) => (k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35),
  inout: (k) => (k < 0.2 ? k / 0.2 : k > 0.7 ? (1 - k) / 0.3 : 1),
  flicker: (k) => (1 - k) * (0.65 + 0.35 * Math.sin(k * 61)),
};
const ALPHA_ID = Object.keys(ALPHA);
const ALPHA_FN = ALPHA_ID.map((k) => ALPHA[k]);

// ---------- colours by school (sRGB hex; core is the hot centre, dark is the ink/normal-blend colour) ----------
export const SCHOOL_COLORS = {
  physical: { core: '#fffaf0', main: '#ffe2b0', edge: '#ff9a3c', dark: '#3a2a20' },
  ink: { core: '#f0e6ff', main: '#a77bff', edge: '#6a3cff', dark: '#160a2e' },
  light: { core: '#fffbe8', main: '#ffd66a', edge: '#ff9a2a', dark: '#4a3010' },
  heal: { core: '#f4ffe8', main: '#9fec7a', edge: '#f8d870', dark: '#1e3a14' },
  nature: { core: '#f0ffe0', main: '#a8e07a', edge: '#5aa030', dark: '#3a2a14' },
  shadow: { core: '#e0d6ff', main: '#8a5cf0', edge: '#3a1890', dark: '#0c0618' },
  fire: { core: '#fff6d8', main: '#ffb060', edge: '#ff5a1a', dark: '#2a1208' },
  frost: { core: '#f4fcff', main: '#bfe8ff', edge: '#5aa8ff', dark: '#102030' },
};

// ---------- the atlas: 4x4 tiles of 128 px, painted once ----------
export const TILE = { glow: 0, core: 1, star: 2, spark: 3, drop: 4, smoke: 5, shock: 6, rune: 7, splat: 8, crack: 9, slash: 10,
  letterA: 11, letterR: 12, letterS: 13, letterE: 14, mote: 15 };
function rng(seed) { let s = (Math.floor(seed) % 2147483647) || 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function paintAtlas(THREE) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S * 4;
  const g = c.getContext('2d');
  const r = rng(4242);
  const at = (i, fn) => { g.save(); g.translate((i % 4) * S, Math.floor(i / 4) * S); g.beginPath(); g.rect(0, 0, S, S); g.clip(); fn(); g.restore(); };
  const radial = (stops, x = 64, y = 64, rr = 64) => { const gr = g.createRadialGradient(x, y, 0, x, y, rr); for (const [k, a] of stops) gr.addColorStop(k, `rgba(255,255,255,${a})`); g.fillStyle = gr; g.fillRect(0, 0, S, S); };
  at(TILE.glow, () => radial([[0, 1], [0.25, 0.55], [0.6, 0.15], [1, 0]]));
  at(TILE.core, () => radial([[0, 1], [0.18, 1], [0.35, 0.45], [0.7, 0.06], [1, 0]]));
  at(TILE.star, () => {
    radial([[0, 1], [0.12, 0.6], [0.35, 0.05], [1, 0]]);
    g.translate(64, 64);
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 4 * (i ? 2 : 0) + (i === 2 ? Math.PI / 4 : 0));
      const w = i < 2 ? 1 : 0.55, gr = g.createLinearGradient(0, 0, 64 * w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr;
      for (const sx of [1, -1]) { g.beginPath(); g.moveTo(0, -3.5 * w); g.lineTo(sx * 64 * w, 0); g.lineTo(0, 3.5 * w); g.fill(); }
    }
  });
  at(TILE.spark, () => {
    // a streak along x: hot middle line, soft ends (stretched along velocity in the shader)
    const gy = g.createLinearGradient(0, 40, 0, 88); gy.addColorStop(0, 'rgba(255,255,255,0)'); gy.addColorStop(0.5, 'rgba(255,255,255,1)'); gy.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gy; g.fillRect(8, 40, 112, 48);
    g.globalCompositeOperation = 'destination-in';
    const gx = g.createLinearGradient(0, 0, S, 0); gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.3, 'rgba(0,0,0,0.6)'); gx.addColorStop(0.75, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gx; g.fillRect(0, 0, S, S);
  });
  at(TILE.drop, () => {
    // an ink droplet: a dense blob with a soft rim and a few satellites
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath(); g.ellipse(64, 66, 34, 30, 0.3, 0, TAU); g.fill();
    for (let i = 0; i < 5; i++) { const a = r() * TAU, d = 30 + r() * 12, rr = 5 + r() * 8; g.beginPath(); g.arc(64 + Math.cos(a) * d, 66 + Math.sin(a) * d, rr, 0, TAU); g.fill(); }
    g.globalCompositeOperation = 'destination-in'; radial([[0, 1], [0.6, 1], [0.8, 0.7], [1, 0]]);
  });
  at(TILE.smoke, () => {
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = r() * 26, rr = 14 + r() * 20; const gr = g.createRadialGradient(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 0, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rr); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }
    g.globalCompositeOperation = 'destination-in'; radial([[0, 1], [0.55, 0.9], [1, 0]]);
  });
  at(TILE.shock, () => {
    const gr = g.createRadialGradient(64, 64, 34, 64, 64, 63);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.86, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  });
  at(TILE.rune, () => {
    // a rune circle: two rings, tick marks and small glyph strokes between them
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineCap = 'round';
    g.lineWidth = 3.2; g.beginPath(); g.arc(64, 64, 58, 0, TAU); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(64, 64, 44, 0, TAU); g.stroke();
    g.lineWidth = 1.4; g.beginPath(); g.arc(64, 64, 24, 0, TAU); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, ca = Math.cos(a), sa = Math.sin(a);
      g.lineWidth = 2.2; g.beginPath();
      if (i % 3 === 0) { g.moveTo(64 + ca * 46, 64 + sa * 46); g.lineTo(64 + ca * 56, 64 + sa * 56); }
      else { const b = a + 0.12, cb = Math.cos(b), sb = Math.sin(b); g.moveTo(64 + ca * 47, 64 + sa * 47); g.lineTo(64 + cb * 54, 64 + sb * 54); g.lineTo(64 + Math.cos(b + 0.1) * 48, 64 + Math.sin(b + 0.1) * 48); }
      g.stroke();
    }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; g.beginPath(); g.moveTo(64 + Math.cos(a) * 24, 64 + Math.sin(a) * 24); g.lineTo(64 + Math.cos(a + 2.1) * 24, 64 + Math.sin(a + 2.1) * 24); g.stroke(); }
  });
  at(TILE.splat, () => {
    // an ink splat decal: a ragged blob with spikes and droplets
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, d = 30 + Math.sin(a * 5 + 1) * 5 + Math.sin(a * 11) * 3 + (i % 7 === 0 ? 14 : 0); const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.fill();
    for (let i = 0; i < 14; i++) { const a = r() * TAU, d = 40 + r() * 20, rr = 2 + r() * 5; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rr, 0, TAU); g.fill(); }
  });
  at(TILE.crack, () => {
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = 64, y = 64, a = i / 9 * TAU + r() * 0.4; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { a += (r() - 0.5) * 0.9; const d = 8 + r() * 6; x += Math.cos(a) * d; y += Math.sin(a) * d; g.lineTo(x, y); g.lineWidth = 4 - k * 0.7; }
      g.stroke();
    }
    g.globalCompositeOperation = 'destination-in'; radial([[0, 1], [0.7, 0.8], [1, 0]]);
  });
  at(TILE.slash, () => {
    // a crescent cut, thick in the middle, pointed ends
    g.translate(64, 64); g.rotate(-0.35);
    const gr = g.createLinearGradient(-60, 0, 60, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.62, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 40, 62, Math.PI * 1.17, Math.PI * 1.83); g.arc(0, 56, 52, Math.PI * 1.8, Math.PI * 1.2, true); g.closePath(); g.fill();
  });
  const letters = { [TILE.letterA]: 'a', [TILE.letterR]: 'R', [TILE.letterS]: 's', [TILE.letterE]: 'e' };
  for (const [i, ch] of Object.entries(letters)) at(+i, () => {
    g.fillStyle = 'rgba(255,255,255,1)'; g.font = 'italic bold 92px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(255,255,255,0.7)'; g.shadowBlur = 10; g.fillText(ch, 64, 70);
  });
  at(TILE.mote, () => {
    radial([[0, 1], [0.15, 0.7], [0.4, 0.08], [1, 0]]);
    g.translate(64, 64); g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const rot of [0, Math.PI / 2]) { g.save(); g.rotate(rot); g.beginPath(); g.moveTo(-34, 0); g.lineTo(0, -4); g.lineTo(34, 0); g.lineTo(0, 4); g.fill(); g.restore(); }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}
// the ribbon strip: four bands across v (0 soft glow, 1 wispy streaks, 2 hot line, 3 ink brush), repeating along u
export const BAND = { glow: 0, wisp: 1, line: 2, brush: 3 };
function paintRibbon(THREE) {
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); const r = rng(99);
  const band = (i, fn) => { g.save(); g.translate(0, i * 64); g.beginPath(); g.rect(0, 0, W, 64); g.clip(); fn(); g.restore(); };
  const across = (stops) => { const gr = g.createLinearGradient(0, 2, 0, 62); for (const [k, a] of stops) gr.addColorStop(k, `rgba(255,255,255,${a})`); g.fillStyle = gr; g.fillRect(0, 0, W, 64); };
  band(0, () => across([[0, 0], [0.3, 0.35], [0.5, 1], [0.7, 0.35], [1, 0]]));
  band(1, () => {
    across([[0, 0], [0.4, 0.25], [0.5, 0.6], [0.6, 0.25], [1, 0]]);
    for (let i = 0; i < 40; i++) { const y = 10 + r() * 44, x = r() * W, l = 30 + r() * 90; g.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.5})`; g.lineWidth = 1 + r() * 2.5; for (const ox of [0, -W]) { g.beginPath(); g.moveTo(x + ox, y); g.lineTo(x + ox + l, y + (r() - 0.5) * 4); g.stroke(); } }
  });
  band(2, () => across([[0, 0], [0.38, 0.1], [0.47, 0.9], [0.5, 1], [0.53, 0.9], [0.62, 0.1], [1, 0]]));
  band(3, () => {
    for (let i = 0; i < 60; i++) { const y = 6 + r() * 52, x = r() * W, l = 20 + r() * 120; const d = Math.abs(y - 32) / 26; g.strokeStyle = `rgba(255,255,255,${(1 - d) * (0.5 + r() * 0.5)})`; g.lineWidth = 2 + r() * 5 * (1 - d); for (const ox of [0, -W]) { g.beginPath(); g.moveTo(x + ox, y); g.lineTo(x + ox + l, y + (r() - 0.5) * 3); g.stroke(); } }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------- shaders ----------
const QUAD_VS = `
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec4 iSz; attribute vec2 iTile;
varying vec2 vUv; varying vec4 vCol;
void main(){
  vec2 cr = position.xy;            // quad corner, -0.5..0.5
  float size = iSz.x, stretch = iSz.y, rot = iSz.z, onGround = iSz.w;
  float cs = cos(rot), sn = sin(rot);
  vec2 q = vec2(cr.x * cs - cr.y * sn, cr.x * sn + cr.y * cs) * size;
  vec4 mv;
  if (onGround > 0.5) {
    mv = viewMatrix * vec4(iPos + vec3(q.x, 0.0, q.y), 1.0);
  } else {
    mv = viewMatrix * vec4(iPos, 1.0);
    if (stretch > 0.0) {
      vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
      vec2 d = vv.xy; float l = length(d);
      if (l > 1e-4) { d /= l; vec2 n = vec2(-d.y, d.x); q = d * cr.x * (size + stretch * l) + n * cr.y * size * 0.5; }
    }
    mv.xy += q;
    mv.z += iTile.y;   // pulled toward the camera so a body it sits in does not cut it
  }
  gl_Position = projectionMatrix * mv;
  vec2 tile = vec2(mod(iTile.x, 4.0), 3.0 - floor(iTile.x / 4.0));
  vUv = (tile + 0.03 + uv * 0.94) * 0.25;
  vCol = iCol;
}`;
const QUAD_FS = `
uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * t.rgb, a); }`;
const RIB_VS = `
attribute vec4 color; varying vec2 vUv; varying vec4 vCol;
void main(){ vUv = uv; vCol = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIB_FS = `
uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * t.rgb, a); }`;
const SHIELD_VS = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`;
const SHIELD_FS = `
uniform vec3 uCol; uniform vec3 uCore; uniform float uA; uniform float uT; uniform float uHit; uniform float uPat;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float hexEdge(vec2 p){ p *= 6.0; vec2 r = vec2(1.0, 1.732); vec2 h = r * 0.5; vec2 a = mod(p, r) - h; vec2 b = mod(p - h, r) - h; vec2 g = dot(a,a) < dot(b,b) ? a : b; vec2 q = abs(g); float d = max(q.x * 0.866 + q.y * 0.5, q.y); return smoothstep(0.40, 0.47, d); }
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  vec2 sp = vec2(atan(vP.z, vP.x) / 6.2832 * 2.0, vP.y * 0.5 + 0.5);
  float pat = uPat > 0.5 ? hexEdge(sp + vec2(0.0, uT * 0.05)) : 0.5 + 0.5 * sin(sp.y * 40.0 - uT * 6.0);
  float band = smoothstep(0.0, 0.15, fract(sp.y * 1.0 - uT * 0.4)) * 0.25;
  float a = (f * 0.85 + pat * (0.05 + f * 0.3) + band * f + uHit * 0.5) * uA;
  vec3 c = mix(uCol, uCore, clamp(f * 0.6 + uHit, 0.0, 1.0));
  gl_FragColor = vec4(c * (1.0 + uHit * 1.5), a);
}`;

// ---------- the kit ----------
export function createFxKit(THREE, scene, { maxAdd = 2048, maxInk = 1024, ribbons = 24, ribbonPts = 28, shields = 6, arrows = 6, seed = 7, recipes = {}, scale = 1, screenLayers = true, density = 1 } = {}) {
  const R = rng(seed);
  const RR = (a, b) => a + (b - a) * R();
  const pick = (v, dflt) => (v == null ? dflt : Array.isArray(v) ? RR(v[0], v[1]) : v);
  const layer = new THREE.Group(); layer.name = 'fx_kit'; scene.add(layer);
  const atlas = paintAtlas(THREE), ribbonTex = paintRibbon(THREE);
  const colCache = new Map();
  /** a palette key ('core'|'main'|'edge'|'dark') or a hex, in linear RGB (cached, so no allocation while playing) */
  function colorOf(c, school) {
    const hex = SCHOOL_COLORS[school] && SCHOOL_COLORS[school][c] ? SCHOOL_COLORS[school][c] : c || '#ffffff';
    if (!colCache.has(hex)) colCache.set(hex, new THREE.Color(hex));
    return colCache.get(hex);
  }

  // ----- quad particle systems -----
  function quadSystem(N, blending, order) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
    const A = {
      iPos: new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3), iVel: new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3),
      iCol: new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4), iSz: new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4),
      iTile: new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2),
    };
    for (const [k, a] of Object.entries(A)) { a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); }
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: atlas } }, vertexShader: QUAD_VS, fragmentShader: QUAD_FS,
      blending, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = order; layer.add(mesh);
    // CPU state (structure of arrays)
    const S = {
      N, geo, A, mesh, live: 0,
      p: new Float32Array(N * 3), v: new Float32Array(N * 3), c: new Float32Array(N * 4),
      age: new Float32Array(N), life: new Float32Array(N), s0: new Float32Array(N), s1: new Float32Array(N), se: new Uint8Array(N), ae: new Uint8Array(N),
      grav: new Float32Array(N), drag: new Float32Array(N), stretch: new Float32Array(N), rot: new Float32Array(N), spin: new Float32Array(N),
      flat: new Uint8Array(N), tile: new Uint8Array(N), anchor: new Int16Array(N), swirl: new Float32Array(N), cx: new Float32Array(N), cz: new Float32Array(N), bias: new Float32Array(N),
      floor: new Float32Array(N),
    };
    return S;
  }
  const ADD = quadSystem(maxAdd, THREE.AdditiveBlending, 12);
  const INK = quadSystem(maxInk, THREE.NormalBlending, 10);

  // anchors: points that follow something (a hand, a projectile head); particles spawned "anchored" ride them
  const ANCH = 96;
  const anchors = Array.from({ length: ANCH }, () => ({ used: false, p: new THREE.Vector3() }));
  function anchorGet() { for (let i = 0; i < ANCH; i++) if (!anchors[i].used) { anchors[i].used = true; return i; } return -1; }
  /** free an anchor; particles still riding it end now (so a reused anchor never drags old sparks along) */
  function anchorFree(an) {
    anchors[an].used = false;
    for (const S of [ADD, INK]) for (let k = 0; k < S.live; k++) if (S.anchor[k] === an) S.age[k] = S.life[k];
  }

  /** Spawn one particle (returns its slot or -1). Swap-remove keeps live ones packed at the front. */
  function spawn(S, x, y, z, o) {
    if (S.live >= S.N) return -1;
    const k = S.live++;
    const k3 = k * 3, k4 = k * 4;
    S.p[k3] = x; S.p[k3 + 1] = y; S.p[k3 + 2] = z;
    S.v[k3] = o.vx; S.v[k3 + 1] = o.vy; S.v[k3 + 2] = o.vz;
    S.c[k4] = o.r; S.c[k4 + 1] = o.g; S.c[k4 + 2] = o.b; S.c[k4 + 3] = o.a;
    S.age[k] = 0; S.life[k] = o.life; S.s0[k] = o.s0; S.s1[k] = o.s1; S.se[k] = o.se; S.ae[k] = o.ae;
    S.grav[k] = o.grav; S.drag[k] = o.drag; S.stretch[k] = o.stretch; S.rot[k] = o.rot; S.spin[k] = o.spin;
    S.flat[k] = o.flat; S.tile[k] = o.tile; S.anchor[k] = o.anchor; S.swirl[k] = o.swirl; S.cx[k] = o.cx; S.cz[k] = o.cz; S.floor[k] = o.floor; S.bias[k] = o.bias;
    return k;
  }
  function kill(S, k) {
    const j = --S.live;
    if (k === j) return;
    const k3 = k * 3, j3 = j * 3, k4 = k * 4, j4 = j * 4;
    for (let i = 0; i < 3; i++) { S.p[k3 + i] = S.p[j3 + i]; S.v[k3 + i] = S.v[j3 + i]; }
    for (let i = 0; i < 4; i++) S.c[k4 + i] = S.c[j4 + i];
    S.age[k] = S.age[j]; S.life[k] = S.life[j]; S.s0[k] = S.s0[j]; S.s1[k] = S.s1[j]; S.se[k] = S.se[j]; S.ae[k] = S.ae[j];
    S.grav[k] = S.grav[j]; S.drag[k] = S.drag[j]; S.stretch[k] = S.stretch[j]; S.rot[k] = S.rot[j]; S.spin[k] = S.spin[j];
    S.flat[k] = S.flat[j]; S.tile[k] = S.tile[j]; S.anchor[k] = S.anchor[j]; S.swirl[k] = S.swirl[j]; S.cx[k] = S.cx[j]; S.cz[k] = S.cz[j]; S.floor[k] = S.floor[j]; S.bias[k] = S.bias[j];
  }
  function stepQuads(S, dt) {
    const P = S.A.iPos.array, V = S.A.iVel.array, C = S.A.iCol.array, Z = S.A.iSz.array, T = S.A.iTile.array;
    for (let k = S.live - 1; k >= 0; k--) {
      S.age[k] += dt;
      if (S.age[k] >= S.life[k]) { kill(S, k); continue; }
    }
    for (let k = 0; k < S.live; k++) {
      const k3 = k * 3, k4 = k * 4;
      const dg = Math.exp(-S.drag[k] * dt);
      S.v[k3] *= dg; S.v[k3 + 1] = S.v[k3 + 1] * dg + S.grav[k] * dt; S.v[k3 + 2] *= dg;
      S.p[k3] += S.v[k3] * dt; S.p[k3 + 1] += S.v[k3 + 1] * dt; S.p[k3 + 2] += S.v[k3 + 2] * dt;
      if (S.swirl[k] !== 0) {
        // orbit round the vertical axis through (cx, cz)
        const a = S.swirl[k] * dt, ca = Math.cos(a), sa = Math.sin(a);
        const dx = S.p[k3] - S.cx[k], dz = S.p[k3 + 2] - S.cz[k];
        S.p[k3] = S.cx[k] + dx * ca - dz * sa; S.p[k3 + 2] = S.cz[k] + dx * sa + dz * ca;
      }
      if (S.p[k3 + 1] < S.floor[k]) { S.p[k3 + 1] = S.floor[k]; S.v[k3 + 1] *= -0.25; S.v[k3] *= 0.5; S.v[k3 + 2] *= 0.5; }
      S.rot[k] += S.spin[k] * dt;
      const f = S.age[k] / S.life[k];
      let x = S.p[k3], y = S.p[k3 + 1], z = S.p[k3 + 2];
      const an = S.anchor[k];
      if (an >= 0) { const q = anchors[an].p; x += q.x; y += q.y; z += q.z; }
      P[k3] = x; P[k3 + 1] = y; P[k3 + 2] = z;
      V[k3] = S.v[k3]; V[k3 + 1] = S.v[k3 + 1]; V[k3 + 2] = S.v[k3 + 2];
      const a = ALPHA_FN[S.ae[k]](f);
      C[k4] = S.c[k4]; C[k4 + 1] = S.c[k4 + 1]; C[k4 + 2] = S.c[k4 + 2]; C[k4 + 3] = S.c[k4 + 3] * a;
      Z[k4] = S.s0[k] + (S.s1[k] - S.s0[k]) * EASE_FN[S.se[k]](f); Z[k4 + 1] = S.stretch[k]; Z[k4 + 2] = S.rot[k]; Z[k4 + 3] = S.flat[k];
      T[k * 2] = S.tile[k]; T[k * 2 + 1] = S.bias[k];
    }
    S.geo.instanceCount = S.live;
    const n = S.live;
    for (const [key, w] of [['iPos', 3], ['iVel', 3], ['iCol', 4], ['iSz', 4], ['iTile', 2]]) {
      const at = S.A[key]; at.clearUpdateRanges(); if (n) { at.addUpdateRange(0, n * w); at.needsUpdate = true; }
    }
  }

  // ----- ribbons: trails, sword arcs, beams -----
  function ribbonSystem(blending, order) {
    const M = ribbons, Np = ribbonPts, V = M * Np * 2;
    const pos = new Float32Array(V * 3), uv = new Float32Array(V * 2), col = new Float32Array(V * 4), idx = [];
    for (let m = 0; m < M; m++) for (let i = 0; i < Np - 1; i++) { const a = (m * Np + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: ribbonTex } }, vertexShader: RIB_VS, fragmentShader: RIB_FS, blending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = order; layer.add(mesh);
    const slots = Array.from({ length: M }, () => ({ used: false, n: 0, pts: new Float32Array(Np * 3), side: new Float32Array(Np * 3), w: new Float32Array(Np), a: new Float32Array(Np), u: new Float32Array(Np), ts: new Float32Array(Np), r: 1, g: 1, b: 1, band: 0, mode: 'trail' }));
    return { geo, pos, uv, col, slots, Np, mesh };
  }
  const RIB = { add: ribbonSystem(THREE.AdditiveBlending, 13), ink: ribbonSystem(THREE.NormalBlending, 11) };
  function ribbonGet(blend) { const sys = RIB[blend] || RIB.add; for (const s of sys.slots) if (!s.used) { s.used = true; s.n = 0; return s; } return null; }
  const camPos = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tD = new THREE.Vector3();
  /** Write every ribbon's vertices. A camera-facing ribbon finds its side from the view; an arc ribbon uses its own side. */
  function buildRibbons(sys) {
    const { pos, uv, col, Np } = sys;
    let any = false;
    sys.slots.forEach((s, m) => {
      const base = m * Np * 2;
      if (!s.used || s.n < 2) { for (let i = 0; i < Np * 2; i++) col[(base + i) * 4 + 3] = 0; if (!s.used) s.n = 0; return; }
      any = true;
      for (let i = 0; i < Np; i++) {
        const j = Math.min(i, s.n - 1), v0 = (base + i * 2) * 3, v1 = v0 + 3;
        const px = s.pts[j * 3], py = s.pts[j * 3 + 1], pz = s.pts[j * 3 + 2];
        let sx, sy, sz;
        if (s.mode === 'arc') { sx = s.side[j * 3]; sy = s.side[j * 3 + 1]; sz = s.side[j * 3 + 2]; }
        else {
          const a = Math.max(0, j - 1), b = Math.min(s.n - 1, j + 1);
          tA.set(s.pts[b * 3] - s.pts[a * 3], s.pts[b * 3 + 1] - s.pts[a * 3 + 1], s.pts[b * 3 + 2] - s.pts[a * 3 + 2]);
          tB.set(camPos.x - px, camPos.y - py, camPos.z - pz);
          tC.crossVectors(tA, tB); const l = tC.length() || 1; sx = tC.x / l; sy = tC.y / l; sz = tC.z / l;
        }
        const w = i < s.n ? s.w[j] * 0.5 : 0;
        pos[v0] = px - sx * w; pos[v0 + 1] = py - sy * w; pos[v0 + 2] = pz - sz * w;
        pos[v1] = px + sx * w; pos[v1 + 1] = py + sy * w; pos[v1 + 2] = pz + sz * w;
        const vb = s.band * 0.25, u = s.u[j];
        const uv0 = (base + i * 2) * 2; uv[uv0] = u; uv[uv0 + 1] = 1 - (vb + 0.01); uv[uv0 + 2] = u; uv[uv0 + 3] = 1 - (vb + 0.24);
        const c0 = (base + i * 2) * 4, al = i < s.n ? s.a[j] : 0;
        col[c0] = col[c0 + 4] = s.r; col[c0 + 1] = col[c0 + 5] = s.g; col[c0 + 2] = col[c0 + 6] = s.b; col[c0 + 3] = col[c0 + 7] = al;
      }
    });
    sys.geo.attributes.position.needsUpdate = true; sys.geo.attributes.uv.needsUpdate = true; sys.geo.attributes.color.needsUpdate = true;
    sys.mesh.visible = any;
  }

  // ----- shields -----
  const shieldGeo = new THREE.SphereGeometry(1, 40, 24);
  const shieldPool = Array.from({ length: shields }, () => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color() }, uCore: { value: new THREE.Color() }, uA: { value: 0 }, uT: { value: 0 }, uHit: { value: 0 }, uPat: { value: 1 } },
      vertexShader: SHIELD_VS, fragmentShader: SHIELD_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.FrontSide,
    });
    const m = new THREE.Mesh(shieldGeo, mat); m.visible = false; m.renderOrder = 9; layer.add(m);
    return { used: false, m };
  });
  // ----- arrows (a projectile head mesh) -----
  const arrowGeo = (() => {
    const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5); shaft.rotateX(Math.PI / 2);
    const head = new THREE.ConeGeometry(0.035, 0.11, 6); head.rotateX(Math.PI / 2); head.translate(0, 0, 0.36);
    const fl = new THREE.BoxGeometry(0.004, 0.05, 0.12); fl.translate(0, 0, -0.27);
    const fl2 = fl.clone(); fl2.rotateZ(Math.PI / 2);
    return [shaft, head, fl, fl2];
  })();
  const arrowMats = [new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: '#c8ccd4', metalness: 0.8, roughness: 0.3, emissive: '#fff2c0', emissiveIntensity: 0.4 }), new THREE.MeshStandardMaterial({ color: '#e8e0d0', roughness: 0.9 })];
  const arrowPool = Array.from({ length: arrows }, () => {
    const g = new THREE.Group();
    arrowGeo.forEach((geo, i) => g.add(new THREE.Mesh(geo, arrowMats[Math.min(i, 2)])));
    g.visible = false; layer.add(g); return { used: false, o: g };
  });

  // ----- lights and screen -----
  const LMAX = 8;
  const lightPool = Array.from({ length: LMAX }, () => ({ pos: new THREE.Vector3(), color: new THREE.Color(), k: 0 }));
  const lights = [];
  const screen = { shake: 0, flash: 0, flashColor: new THREE.Color('#ffffff'), hitstop: 0 };

  // ----- effect instances -----
  const IMAX = 64;
  const pool = Array.from({ length: IMAX }, () => ({
    used: false, recipe: null, t0: 0, age: 0, school: 'physical', scale: 1, dir: 0, ground: 0, from: null, to: null, at: null, mats: null,
    pFrom: new THREE.Vector3(), pTo: new THREE.Vector3(), pAt: new THREE.Vector3(), fired: new Uint8Array(32), emitAcc: new Float32Array(32),
    anchorsHeld: [], ribs: new Array(32).fill(null), shields: new Array(32).fill(null), proj: null, end: 0, parentHit: null,
  }));
  const projPool = Array.from({ length: 24 }, () => ({ used: false, p: new THREE.Vector3(), prev: new THREE.Vector3(), start: new THREE.Vector3(), anchor: -1, rib: null, rib2: null, arrow: null, t: 0, dur: 0, done: false, spec: null, inst: null, acc: 0 }));
  const hitMats = [];   // [{ mat, t0, dur, color, base }]

  const read = (src, out, fallback) => { if (typeof src === 'function') { const v = src(); if (v) return out.copy(v); } else if (src && src.isVector3) return out.copy(src); return fallback ? out.copy(fallback) : out; };
  function resolve(I) {
    read(I.from, I.pFrom, null); read(I.to, I.pTo, I.pFrom); read(I.at, I.pAt, I.pTo);
  }
  /** layer point: where ('at'|'from'|'to'|'atFeet'|'toFeet'|'fromFeet'|'mid') plus an offset in the effect frame */
  const facing = new THREE.Vector3(), rightV = new THREE.Vector3();
  function frame(I) {
    // forward = from -> to on the ground plane if both are known, else the instance yaw
    facing.set(I.pTo.x - I.pFrom.x, 0, I.pTo.z - I.pFrom.z);
    if (facing.lengthSq() < 1e-6) facing.set(Math.sin(I.dir), 0, Math.cos(I.dir));
    facing.normalize(); rightV.set(-facing.z, 0, facing.x);
  }
  function pointOf(I, L, out) {
    const w = L.where || 'at';
    const src = w.startsWith('from') ? I.pFrom : w.startsWith('to') ? I.pTo : I.pAt;
    out.copy(src);
    if (w === 'mid') out.copy(I.pFrom).lerp(I.pTo, 0.5);
    if (/Feet$/.test(w)) out.y = I.ground;
    else if (w === 'to' && I.surf) out.addScaledVector(facing, -I.surf * I.scale);   // the target's near surface, not its middle
    if (L.off) { const s = I.scale; out.addScaledVector(rightV, L.off[0] * s); out.y += L.off[1] * s; out.addScaledVector(facing, L.off[2] * s); }
    return out;
  }
  const spawnArgs = { vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, a: 1, life: 1, s0: 1, s1: 1, se: 0, ae: 0, grav: 0, drag: 0, stretch: 0, rot: 0, spin: 0, flat: 0, tile: 0, anchor: -1, swirl: 0, cx: 0, cz: 0, floor: -100, bias: 0 };
  const dirV = new THREE.Vector3();
  /** Emit n particles of a burst/stream/flash layer at p. */
  function emitLayer(I, L, p, n, anchor = -1) {
    const S = L.blend === 'ink' ? INK : ADD;
    const c = colorOf(L.color || 'main', I.school), mul = L.mul == null ? 1 : L.mul;
    const sc = I.scale;
    const tiles = Array.isArray(L.tile) ? L.tile : [L.tile || 'glow'];
    for (let i = 0; i < n; i++) {
      const o = spawnArgs;
      const spd = pick(L.speed, 0) * sc;
      // direction
      const cone = L.cone || 'sphere';
      if (cone === 'up') dirV.set(RR(-0.25, 0.25), 1, RR(-0.25, 0.25));
      else if (cone === 'ring') { const a = R() * TAU; dirV.set(Math.cos(a), RR(-0.05, 0.05), Math.sin(a)); }
      else if (cone === 'hemi') { const a = R() * TAU, z = R(); const r = Math.sqrt(1 - z * z); dirV.set(Math.cos(a) * r, z, Math.sin(a) * r); }
      else if (cone === 'dir' || cone === 'back') {
        // a cone round the effect's forward (away from the caster), opening by `spread` radians
        const sp = L.spread == null ? 0.8 : L.spread, a = R() * TAU, t = R() * sp;
        const f = cone === 'back' ? -1 : 1;
        dirV.copy(facing).multiplyScalar(Math.cos(t) * f).addScaledVector(rightV, Math.sin(t) * Math.cos(a)); dirV.y += Math.sin(t) * Math.sin(a);
      } else { const z = RR(-1, 1), a = R() * TAU, r = Math.sqrt(1 - z * z); dirV.set(Math.cos(a) * r, z, Math.sin(a) * r); }
      dirV.normalize();
      let x = p.x, y = p.y, z = p.z;
      const rad = (L.radius || 0) * sc;
      if (L.implode) {
        // start on a sphere and fly inward so they meet the centre as they die
        const rr = L.implode * sc;
        x += dirV.x * rr; y += dirV.y * rr; z += dirV.z * rr;
        o.life = pick(L.life, 0.5) / (I.rate || 1);
        o.vx = -dirV.x * rr / o.life; o.vy = -dirV.y * rr / o.life; o.vz = -dirV.z * rr / o.life;
      } else {
        if (rad) { const a = R() * TAU, d = Math.sqrt(R()) * rad; x += Math.cos(a) * d; z += Math.sin(a) * d; if (!L.flat) y += RR(-0.3, 0.3) * rad; }
        o.life = pick(L.life, 0.5) / (I.rate || 1);
        o.vx = dirV.x * spd; o.vy = dirV.y * spd + pick(L.up, 0) * sc; o.vz = dirV.z * spd;
      }
      if (anchor >= 0) { x -= anchors[anchor].p.x; y -= anchors[anchor].p.y; z -= anchors[anchor].p.z; }
      const tint = L.vary ? RR(1 - L.vary, 1) : 1;
      o.r = c.r * mul * tint; o.g = c.g * mul * tint; o.b = c.b * mul * tint; o.a = L.alpha0 == null ? 1 : L.alpha0;
      const s = pick(L.size, 0.2) * sc;
      o.s0 = s; o.s1 = s * (L.grow == null ? 1 : L.grow);
      o.se = EASE_ID.indexOf(L.sizeEase || 'outQuad'); o.ae = ALPHA_ID.indexOf(L.alpha || 'fade');
      o.grav = (L.grav || 0) * sc; o.drag = L.drag || 0; o.stretch = L.stretch || 0;
      o.rot = L.rot != null ? L.rot + (L.faceDir ? Math.atan2(facing.x, facing.z) : 0) : R() * TAU; o.spin = pick(L.spin, 0);
      o.flat = L.flat ? 1 : 0; o.tile = TILE[tiles[(R() * tiles.length) | 0]] ?? 0; o.anchor = anchor;
      o.swirl = pick(L.swirl, 0); o.cx = p.x; o.cz = p.z;
      o.floor = L.bounce ? I.ground + 0.02 : -100;
      // a camera-ward pull: impact flashes on a target default to 0.5 m, its sparks to 0.25 m, ground pieces to none
      o.bias = L.flat ? 0 : L.bias != null ? L.bias : L.where === 'to' ? (n === 1 && !spd ? 0.5 : 0.25) : 0;
      if (L.flat) y = Math.max(y, I.ground + 0.025 + (L.lift || 0));
      spawn(S, x, y, z, o);
    }
  }

  let gens = 0;
  function play(name, opts = {}) {
    const recipe = typeof name === 'string' ? recipes[name] : name;
    if (!recipe) return null;
    const I = pool.find((x) => !x.used);
    if (!I) return null;
    I.used = true; I.recipe = recipe; I.age = 0; I.school = opts.school || recipe.school || 'physical'; I.scale = (opts.scale || 1) * scale; I.dir = opts.dir || 0; I.onHit = opts.onHit || null; I.noHit = !!opts.noHit; I.speed = opts.speed || 0;
    I.ground = opts.ground || 0; I.from = opts.from || null; I.to = opts.to || null; I.at = opts.at || opts.to || null; I.mats = opts.mats || null;
    I.surf = opts.surface ?? recipe.surface ?? 0.35;
    I.fired.fill(0); I.emitAcc.fill(0); I.anchorsHeld.length = 0; I.ribs.fill(null); I.shields.fill(null); I.proj = null;
    const lifeOf = (L) => (L.anchor ? (Array.isArray(L.life) ? L.life[1] : L.life || 0.5) : 0);
    I.end = recipe.layers.reduce((m, L) => Math.max(m, (L.t || 0) + (L.dur || 0) + lifeOf(L)), 0);
    // fit: stretch or squeeze the whole recipe to last this long (a charge that matches the sim's cast bar)
    I.rate = opts.fit ? Math.max(0.2, Math.min(5, I.end / opts.fit)) : 1;
    I.gen = ++gens;
    resolve(I); frame(I);
    return I;
  }

  // sweep arc: points along a circle round `at`, head moves from a0 to a1 with ease, tail lags
  function writeArc(I, L, rib, k) {
    const sc = I.scale, rad = (L.radius || 1.1) * sc, width = (L.width || 0.5) * sc;
    const a0 = (L.a0 ?? -80) * Math.PI / 180, a1 = (L.a1 ?? 80) * Math.PI / 180;
    const e = EASE[L.ease || 'outCubic'](clamp(k / (L.sweep || 0.6)));
    const head = a0 + (a1 - a0) * e;
    const tailLen = (a1 - a0) * (L.tail || 0.55);
    const tail = Math.max(a0, head - tailLen) + (a1 - a0) * Math.max(0, (k - (L.sweep || 0.6)) / (1 - (L.sweep || 0.6)));
    const fade = 1 - clamp((k - 0.55) / 0.45);
    const n = rib.pts.length / 3;
    const tilt = (L.tilt || 0) * Math.PI / 180, ct = Math.cos(tilt), st = Math.sin(tilt);
    const c = pointOf(I, L, tD);
    rib.n = n; rib.mode = 'arc';
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = tail + (head - tail) * u;
      // in the effect frame: forward = facing, right = rightV; the arc plane tilts round the forward axis
      const fx = Math.cos(a), rx = Math.sin(a);
      const ox = rx * ct, oy = rx * st;   // tilt lifts the right side
      const dx = rightV.x * ox + facing.x * fx, dz = rightV.z * ox + facing.z * fx, dy = oy;
      rib.pts[i * 3] = c.x + dx * rad; rib.pts[i * 3 + 1] = c.y + dy * rad; rib.pts[i * 3 + 2] = c.z + dz * rad;
      rib.side[i * 3] = dx; rib.side[i * 3 + 1] = dy; rib.side[i * 3 + 2] = dz;
      rib.w[i] = width * (0.15 + 0.85 * u ** 0.7);
      rib.a[i] = (u ** 1.5) * fade * (L.alpha0 ?? 1);
      rib.u[i] = u * 0.9 + k * 0.3;
    }
  }
  // beam: from -> to, a slight wobble, scrolling texture, width pulses
  function writeBeam(I, L, rib, k, now) {
    const a = pointOf(I, { where: L.src || 'from', off: L.offFrom }, tA), b = pointOf(I, { where: L.dst || 'to', off: L.offTo }, tB);
    const n = rib.pts.length / 3, w = (L.width || 0.3) * I.scale;
    const env = ALPHA[L.alpha || 'inout'](k);
    rib.n = n; rib.mode = 'trail';
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), wob = Math.sin(u * Math.PI) * (L.wobble || 0.06) * I.scale;
      rib.pts[i * 3] = a.x + (b.x - a.x) * u + Math.sin(now * 23 + u * 9) * wob;
      rib.pts[i * 3 + 1] = a.y + (b.y - a.y) * u + Math.sin(now * 17 + u * 13) * wob;
      rib.pts[i * 3 + 2] = a.z + (b.z - a.z) * u + Math.cos(now * 19 + u * 11) * wob;
      rib.w[i] = w * (0.7 + 0.3 * Math.sin(now * 30 + u * 20)) * (u < 0.08 ? u / 0.08 : 1);
      rib.a[i] = env;
      rib.u[i] = u * (L.repeat || 3) - now * (L.scroll || 2);
    }
  }
  /** a projectile layer: a head that flies from -> to (tracking `to`), a ribbon trail, things shed while flying, then `hit` */
  function launch(I, L) {
    const P = projPool.find((x) => !x.used);
    if (!P) return;
    P.used = true; P.spec = L; P.inst = I; P.t = 0; P.done = false; P.acc = 0; P.stickUntil = 0;
    pointOf(I, { where: L.src || 'from', off: L.off }, P.start); P.p.copy(P.start); P.prev.copy(P.start);
    const d = P.start.distanceTo(I.pTo);
    P.dur = L.dur || d / (I.speed || L.speed || 15);
    P.anchor = anchorGet(); if (P.anchor >= 0) anchors[P.anchor].p.copy(P.p);
    P.rib = L.trail ? ribbonGet(L.trail.blend || 'add') : null;
    P.rib2 = L.trail2 ? ribbonGet(L.trail2.blend || 'add') : null;
    for (const [rib, T] of [[P.rib, L.trail], [P.rib2, L.trail2]]) if (rib) { const c = colorOf(T.color || 'main', I.school), m = T.mul ?? 1; rib.r = c.r * m; rib.g = c.g * m; rib.b = c.b * m; rib.band = BAND[T.band || 'glow']; rib.mode = 'trail'; rib.n = 0; }
    if (L.mesh === 'arrow') { P.arrow = arrowPool.find((x) => !x.used) || null; if (P.arrow) { P.arrow.used = true; P.arrow.o.visible = true; P.arrow.o.scale.setScalar(I.scale); } }
    // anchored head layers start now (they ride the projectile's anchor)
    for (const H of L.head || []) emitLayer(I, H, P.p, H.n || 1, P.anchor);
    I.proj = P;
  }
  const look = new THREE.Vector3();
  function stepProj(P, dt) {
    const I = P.inst, L = P.spec;
    P.t += dt;
    const k = clamp(P.t / P.dur);
    P.prev.copy(P.p);
    P.p.lerpVectors(P.start, I.pTo, EASE[L.ease || 'linear'](k));
    if (L.arc) P.p.y += Math.sin(k * Math.PI) * L.arc * I.scale;
    if (P.anchor >= 0) anchors[P.anchor].p.copy(P.p);
    if (P.arrow) { P.arrow.o.position.copy(P.p); look.copy(P.p).sub(P.prev); if (look.lengthSq() > 1e-8) { look.add(P.p); P.arrow.o.lookAt(look); } }
    // shed particles along the path (spread over the segment so a fast bolt leaves an even line)
    for (const S of L.shed || []) {
      P.acc += (S.rate || 60) * dt;
      while (P.acc >= 1) { P.acc -= 1; tC.lerpVectors(P.prev, P.p, R()); emitLayer(I, S, tC, 1); }
    }
    // ribbons: push the head point, age the rest
    for (const [rib, T] of [[P.rib, L.trail], [P.rib2, L.trail2]]) {
      if (!rib) continue;
      const n = rib.pts.length / 3;
      if (!P.done) {
        if (rib.n < n) rib.n++;
        for (let i = rib.n - 1; i > 0; i--) { rib.pts[i * 3] = rib.pts[(i - 1) * 3]; rib.pts[i * 3 + 1] = rib.pts[(i - 1) * 3 + 1]; rib.pts[i * 3 + 2] = rib.pts[(i - 1) * 3 + 2]; rib.u[i] = rib.u[i - 1]; rib.ts[i] = rib.ts[i - 1]; }
        rib.pts[0] = P.p.x; rib.pts[1] = P.p.y; rib.pts[2] = P.p.z; rib.u[0] = P.t * (T.scroll || 4); rib.ts[0] = P.t;
      }
      // a trail is `len` seconds of the head's path: each point fades and thins with its own age
      const len = T.len || 0.12;
      for (let i = 0; i < rib.n; i++) { const f = clamp((P.t - rib.ts[i]) / len); rib.w[i] = (T.width || 0.2) * I.scale * (1 - f) ** (T.taper || 0.8); rib.a[i] = (1 - f) ** (T.falloff || 1.2); }
    }
    if (!P.done && k >= 1) {
      P.done = true;
      if (P.anchor >= 0) { anchorFree(P.anchor); P.anchor = -1; }
      if (P.arrow && !L.stick) { P.arrow.o.visible = false; P.arrow.used = false; P.arrow = null; }
      if (P.arrow && L.stick) { look.copy(P.p).sub(P.prev).normalize(); P.arrow.o.position.addScaledVector(look, 0.22 * I.scale); P.stickUntil = P.t + L.stick; }
      if (I.onHit) { const f = I.onHit; I.onHit = null; f(); }
      if (L.hit && !I.noHit) {
        const sub = play(L.hit, { from: I.from || I.pFrom.clone(), to: I.to, at: I.to, school: I.school, scale: I.scale, dir: I.dir, ground: I.ground, mats: I.mats });
        if (sub) { sub.pFrom.copy(I.pFrom); frame(sub); }
      }
    }
    if (P.done && P.arrow && P.t > P.stickUntil) { P.arrow.o.visible = false; P.arrow.used = false; P.arrow = null; }
    if (P.done && !P.arrow && P.t > P.dur + Math.max(L.trail ? L.trail.len || 0.12 : 0, L.trail2 ? L.trail2.len || 0.12 : 0)) {
      if (P.rib) { P.rib.used = false; P.rib = null; } if (P.rib2) { P.rib2.used = false; P.rib2 = null; }
      P.used = false; if (I.proj === P) I.proj = null;
    }
  }

  function stepInstance(I, dt0, now) {
    const dt = dt0 * I.rate;
    I.age += dt;
    resolve(I); frame(I);
    const Ls = I.recipe.layers;
    let busy = !!I.proj;
    for (let li = 0; li < Ls.length; li++) {
      const L = Ls[li], t = L.t || 0;
      if (I.age < t) { busy = true; continue; }
      const k = L.dur ? (I.age - t) / L.dur : 1;
      switch (L.type) {
        case 'burst': case 'flash': case 'ring': case 'decal':
          if (!I.fired[li]) {
            I.fired[li] = 1;
            const LL = L.type === 'burst' ? L : expand(L);
            let an = -1;
            if (L.anchor) { an = anchorGet(); if (an >= 0) { I.anchorsHeld.push([an, L]); pointOf(I, L, anchors[an].p); } }
            emitLayer(I, LL, pointOf(I, L, tA), L.type === 'burst' ? Math.max(1, Math.round((L.n || 8) * density)) : (L.n || 1), an);
          }
          break;
        case 'stream':
          if (k < 1) {
            busy = true;
            I.emitAcc[li] += (L.rate || 30) * dt * density;
            const p = pointOf(I, L, tA);
            while (I.emitAcc[li] >= 1) { I.emitAcc[li] -= 1; emitLayer(I, L, p, 1); }
          }
          break;
        case 'arc': case 'beam': {
          if (k < 1) {
            busy = true;
            if (!I.ribs[li]) { const rib = ribbonGet(L.blend || 'add'); if (rib) { const c = colorOf(L.color || 'main', I.school), m = L.mul ?? 1; rib.r = c.r * m; rib.g = c.g * m; rib.b = c.b * m; rib.band = BAND[L.band || 'glow']; I.ribs[li] = rib; } }
            const rib = I.ribs[li];
            if (rib) { if (L.type === 'arc') writeArc(I, L, rib, k); else writeBeam(I, L, rib, k, now); }
            if (rib && L.type === 'arc' && L.shed && k < (L.sweep || 0.6)) {
              const h = (rib.pts.length / 3 - 1) * 3; tC.set(rib.pts[h], rib.pts[h + 1], rib.pts[h + 2]);
              I.emitAcc[li] += (L.shed.rate || 80) * dt;
              while (I.emitAcc[li] >= 1) { I.emitAcc[li] -= 1; emitLayer(I, L.shed, tC, 1); }
            }
          } else if (I.ribs[li]) { I.ribs[li].used = false; I.ribs[li] = null; }
          break;
        }
        case 'shield': {
          if (k < 1) {
            busy = true;
            if (!I.shields[li]) { const s = shieldPool.find((x) => !x.used); if (s) { s.used = true; s.m.visible = true; I.shields[li] = s; const u = s.m.material.uniforms; u.uCol.value.copy(colorOf(L.color || 'main', I.school)); u.uCore.value.copy(colorOf(L.core || 'core', I.school)); u.uPat.value = L.pattern === 'lines' ? 0 : 1; } }
            const s = I.shields[li];
            if (s) {
              const p = pointOf(I, L, tA), r = (L.radius || 1) * I.scale;
              const grow = EASE.outBack(clamp(k * (L.dur || 1) / 0.25));
              s.m.position.copy(p); s.m.scale.set(r * grow, r * grow * (L.squash || 1), r * grow);
              const u = s.m.material.uniforms; u.uT.value = now; u.uA.value = ALPHA[L.alpha || 'inout'](k) * (L.mul ?? 1);
              u.uHit.value = L.hitAt != null ? Math.max(0, 1 - Math.abs(k * L.dur - L.hitAt) / 0.12) : 0;
            }
          } else if (I.shields[li]) { I.shields[li].used = false; I.shields[li].m.visible = false; I.shields[li] = null; }
          break;
        }
        case 'projectile':
          if (!I.fired[li]) { I.fired[li] = 1; launch(I, L); busy = true; }
          break;
        case 'spawn':
          if (!I.fired[li]) { I.fired[li] = 1; play(L.recipe, { from: I.from, to: I.to, at: I.at, school: I.school, scale: I.scale, dir: I.dir, ground: I.ground, mats: I.mats }); }
          break;
        case 'light':
          if (k < 1) {
            busy = true;
            if (lights.length < LMAX) { const Lq = lightPool[lights.length]; pointOf(I, L, Lq.pos); Lq.color.copy(colorOf(L.color || 'main', I.school)); Lq.k = (L.k || 3) * ALPHA[L.alpha || 'pop'](k); lights.push(Lq); }
          }
          break;
        case 'screen':
          if (!I.fired[li] && screenLayers) { I.fired[li] = 1; screen.shake = Math.max(screen.shake, L.shake || 0); screen.hitstop = Math.max(screen.hitstop, L.hitstop || 0); if (L.flash) { screen.flash = Math.max(screen.flash, L.flash); screen.flashColor.copy(colorOf(L.color || 'core', I.school)); } }
          break;
        case 'hitflash':
          if (!I.fired[li] && I.mats) { I.fired[li] = 1; for (const m of I.mats) if (m.emissive && !hitMats.some((h) => h.mat === m)) hitMats.push({ mat: m, t0: now, dur: L.dur || 0.18, color: colorOf(L.color || 'core', I.school), mul: L.mul ?? 0.6, base: m.emissive.clone(), baseI: m.emissiveIntensity }); }
          break;
        default: break;
      }
    }
    // anchored layers follow their point
    for (const [an, L] of I.anchorsHeld) pointOf(I, L, anchors[an].p);
    if (!busy && I.age > I.end + 0.05) {
      for (const [an] of I.anchorsHeld) anchorFree(an);
      I.used = false;
    }
  }
  // flash/ring/decal are bursts with fixed defaults
  const expanded = new Map();
  function expand(L) {
    if (expanded.has(L)) return expanded.get(L);
    let E;
    if (L.type === 'flash') E = { tile: 'glow', speed: 0, alpha: 'pop', sizeEase: 'outExpo', ...L };
    else if (L.type === 'ring') E = { tile: 'shock', flat: true, speed: 0, alpha: 'fade', sizeEase: 'outExpo', grow: 3, ...L };
    else E = { tile: 'splat', flat: true, speed: 0, alpha: 'hold', sizeEase: 'outExpo', grow: 1.2, blend: 'ink', color: 'dark', ...L };
    expanded.set(L, E); return E;
  }

  /** end an effect early (a cast that finished or was cut): streams stop, anchored glows go out, nothing new fires */
  function stop(I, gen = null) {
    if (!I || !I.used || (gen != null && I.gen !== gen)) return;
    I.onHit = null;
    I.fired.fill(1); I.age = I.end + 1;
    for (const [an] of I.anchorsHeld) anchorFree(an);
    I.anchorsHeld.length = 0;
  }

  return {
    layer, play, stop, lights, screen, atlas,
    /** a camera kick from outside a recipe (the game decides when: the player's own big hits and crits) */
    kick(shake = 0, hitstop = 0) { screen.shake = Math.max(screen.shake, shake); screen.hitstop = Math.max(screen.hitstop, hitstop); },
    get stats() { return { add: ADD.live, ink: INK.live, ribbons: [...RIB.add.slots, ...RIB.ink.slots].filter((s) => s.used).length, shields: shieldPool.filter((s) => s.used).length, effects: pool.filter((p) => p.used).length }; },
    /** advance and upload; camera is used for ribbon facing */
    update(dt, now, camera) {
      if (camera) camera.getWorldPosition(camPos);
      lights.length = 0;
      for (const I of pool) if (I.used) stepInstance(I, dt, now);
      for (const P of projPool) if (P.used) stepProj(P, dt);
      stepQuads(ADD, dt); stepQuads(INK, dt);
      buildRibbons(RIB.add); buildRibbons(RIB.ink);
      for (let i = hitMats.length - 1; i >= 0; i--) {
        const h = hitMats[i], k = (now - h.t0) / h.dur;
        if (k >= 1 || k < 0) { h.mat.emissive.copy(h.base); h.mat.emissiveIntensity = h.baseI; hitMats.splice(i, 1); continue; }
        // a short tint, not a white-out: the foe must stay readable under the hit
        const a = (1 - k) ** 2 * h.mul * 0.3;
        h.mat.emissive.copy(h.base).multiplyScalar(h.baseI); h.mat.emissive.r += h.color.r * a; h.mat.emissive.g += h.color.g * a; h.mat.emissive.b += h.color.b * a;
        h.mat.emissiveIntensity = 1;
      }
      screen.shake *= Math.exp(-dt * 9); screen.flash *= Math.exp(-dt * 14); screen.hitstop = Math.max(0, screen.hitstop - dt);
    },
  };
}

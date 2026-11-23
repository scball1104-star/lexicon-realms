// Creature kit (prototype, not wired into the game). One call builds a whole foe from a short recipe:
//
//   import { buildCreature } from './creature_kit.js';
//   const c = buildCreature(THREE, recipe);   // c.o (root, faces +z), c.height (m), c.update(dt, st)
//   st: { t, moving, speed, attackT, hurtT, deadT }   (the same state the game's creatures.js bodies take)
//
// A recipe is plain data: { body, size, proportions, head, parts, palette, pattern, seed }. Bodies: quadruped, biped,
// serpent, insect, blob, flyer. Every shape is a loft (an elliptical tube along a smooth spine, rounded ends) or a
// lumpy rock; skins are painted on canvas (back to belly gradient, brush strokes, a pattern, glow in an emissive map);
// a rim light and a hurt flash are patched into the standard material. The rig is nested Object3D pivots, no bones.

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const hash = (a, b = 0, c = 0) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
function rng(seed) { let s = (Math.floor(seed) % 2147483647) || 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
/** 0..1..0 bump over d seconds from t0, with a fast rise (a strike, not a sway). */
const strike = (t, t0, d, rise = 0.35) => { if (t0 == null) return 0; const k = (t - t0) / d; if (k < 0 || k > 1) return 0; return k < rise ? ease(k / rise) : 1 - ease((k - rise) / (1 - rise)); };
const pulse = (t, t0, d) => { if (t0 == null) return 0; const k = (t - t0) / d; return k < 0 || k > 1 ? 0 : Math.sin(k * Math.PI); };

// ---------- colour helpers ----------
function hex2rgb(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgb2hex([r, g, b]) { return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join(''); }
const mix = (a, b, k) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => lerp(v, y[i], k))); };
const shade = (a, k) => (k >= 0 ? mix(a, '#ffffff', k) : mix(a, '#000000', -k));
const rgba = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };

export function buildCreature(THREE, recipe) {
  const R = { size: 1, proportions: {}, head: {}, parts: [], pattern: 'none', seed: 1, ...recipe };
  R.palette = { base: '#7a6a58', belly: '#c8b89a', accent: '#e8dcc0', eyes: '#ffb347', glow: null, dark: '#1a1412', ...(recipe.palette || {}) };
  const pal = R.palette;
  const has = (p) => R.parts.some((x) => x === p || x.startsWith(p + ':'));
  const kind = (p) => { const x = R.parts.find((y) => y === p || y.startsWith(p + ':')); return x && x.includes(':') ? x.split(':')[1] : x ? 'default' : null; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------- canvas textures ----------
  const texCache = new Map();
  function canvasTex(key, w, h, paint, wrap = true) {
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(key, t); return t;
  }
  const radialTex = () => canvasTex('radial', 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }, false);
  /** Draw fn at x and x +/- w so marks wrap around the seam. */
  // square skins tile both ways: draw each mark at all nine offsets so neither seam shows
  let G = null;
  const wrapDraw = (w, fn) => { for (const ox of [-w, 0, w]) for (const oy of [-w, 0, w]) { G.save(); G.translate(ox, oy); fn(0); G.restore(); } };

  // A skin: x runs around the body (0 = spine top, 0.5 = belly), y runs along it. Returns { map, glow }.
  function skin(name, { base = pal.base, belly = pal.belly, pattern = 'none', fur = false, glowPat = null, seed = R.seed, patternColor = null } = {}) {
    const key = [name, base, belly, pattern, fur, glowPat, seed, patternColor].join('|');
    const W = 256, H = 256;
    const r = rng(seed * 31 + name.length * 7);
    const pc = patternColor || shade(base, -0.45);
    const marks = [];   // crack paths / spot centres reused for the glow map
    const map = canvasTex(key, W, H, (g) => {
      G = g;
      const back = shade(base, -0.18);
      const gr = g.createLinearGradient(0, 0, W, 0);
      [[0, back], [0.2, base], [0.36, mix(base, belly, 0.45)], [0.5, belly], [0.64, mix(base, belly, 0.45)], [0.8, base], [1, back]].forEach(([k, c]) => gr.addColorStop(k, c));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const backMask = (x) => { const u = ((x / W) % 1 + 1) % 1; const d = Math.min(u, 1 - u); return clamp(1 - d / 0.3); };
      // the pattern, mostly on the back
      if (pattern === 'stripes' || pattern === 'tiger') {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const y0 = (i + 0.5) * H / n + (r() - 0.5) * 8, th = H / n * (pattern === 'tiger' ? 0.32 : 0.42);
          g.fillStyle = pc;
          wrapDraw(W, (ox) => {
            g.beginPath();
            g.moveTo(ox - W * 0.3, y0);
            g.quadraticCurveTo(ox - W * 0.12, y0 - th * 0.9, ox, y0 - th * 0.55);
            g.quadraticCurveTo(ox + W * 0.12, y0 - th * 0.9, ox + W * 0.3, y0);
            g.quadraticCurveTo(ox + W * 0.1, y0 + th * 0.2, ox, y0 + th * 0.5);
            g.quadraticCurveTo(ox - W * 0.1, y0 + th * 0.2, ox - W * 0.3, y0);
            g.fill();
          });
        }
      } else if (pattern === 'spots') {
        for (let i = 0; i < 46; i++) {
          const x = (r() - 0.5) * W * 0.62, y = r() * H, rr = 4 + r() * 9;
          marks.push([x, y, rr]);
          g.fillStyle = rgba(pc, 0.85);
          wrapDraw(W, (ox) => { g.beginPath(); g.ellipse(ox + x, y, rr, rr * 0.8, r() * 3, 0, TAU); g.fill(); });
          wrapDraw(W, (ox) => { g.beginPath(); g.ellipse(ox + x, y, rr + 3, rr * 0.8 + 3, 0, 0, TAU); g.strokeStyle = rgba(shade(base, 0.2), 0.35); g.lineWidth = 2; g.stroke(); });
        }
      } else if (pattern === 'plates' || pattern === 'scales') {
        const cols = pattern === 'plates' ? 6 : 16, rows = pattern === 'plates' ? 4 : 12;
        const cw = W / cols, rh = H / rows;
        for (let j = -1; j <= rows; j++) for (let i = -1; i <= cols; i++) {
          const cx = (i + (j % 2 ? 0.5 : 0)) * cw, cy = (j + 0.5) * rh;
          const lit = 0.12 + r() * 0.12;
          const grd = g.createRadialGradient(cx, cy - rh * 0.15, 1, cx, cy, Math.max(cw, rh) * 0.62);
          const mid = backMask(cx) > 0.2 ? base : mix(base, belly, 0.6);
          grd.addColorStop(0, shade(mid, lit)); grd.addColorStop(0.8, mid); grd.addColorStop(1, shade(mid, -0.25));
          g.fillStyle = grd;
          g.beginPath();
          for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + Math.PI / 6; g.lineTo(cx + Math.cos(a) * cw * 0.56, cy + Math.sin(a) * rh * 0.66); }
          g.closePath(); g.fill();
          g.strokeStyle = rgba(pc, 0.9); g.lineWidth = pattern === 'plates' ? 3.5 : 1.6; g.stroke();
        }
      } else if (pattern === 'rings' || pattern === 'bands') {
        const n = pattern === 'rings' ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const y = i * H / n;
          const grd = g.createLinearGradient(0, y, 0, y + H / n);
          grd.addColorStop(0, rgba(pc, 0.75)); grd.addColorStop(0.18, rgba(base, 0)); grd.addColorStop(0.7, rgba('#ffffff', pattern === 'rings' ? 0.08 : 0.12)); grd.addColorStop(1, rgba(pc, 0.4));
          g.fillStyle = grd; g.fillRect(0, y, W, H / n);
        }
      } else if (pattern === 'cracks') {
        for (let i = 0; i < 20; i++) {
          let x = (r() - 0.5) * W * 0.9, y = r() * H; const pts = [[x, y]];
          for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 34; y += (r() - 0.5) * 34; pts.push([x, y]); }
          marks.push(pts);
        }
        g.strokeStyle = rgba(shade(base, -0.6), 0.95); g.lineWidth = 3.2; g.lineJoin = 'round';
        for (const pts of marks) wrapDraw(W, (ox) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(ox + x, y) : g.moveTo(ox + x, y))); g.stroke(); });
      } else if (pattern === 'mottle') {
        for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H, rr = 6 + r() * 16; g.fillStyle = rgba(r() < 0.5 ? pc : shade(base, 0.18), 0.22); wrapDraw(W, (ox) => { g.beginPath(); g.arc(ox + x, y, rr, 0, TAU); g.fill(); }); }
      }
      // hand-painted brush strokes over everything (fur: long strokes along the body)
      const nStroke = fur ? 2600 : 1100;
      for (let i = 0; i < nStroke; i++) {
        const x = r() * W, y = r() * H, len = fur ? 5 + r() * 9 : 2 + r() * 5;
        const light = r() < 0.5;
        g.strokeStyle = light ? `rgba(255,248,230,${fur ? 0.07 : 0.06})` : `rgba(10,6,4,${fur ? 0.09 : 0.07})`;
        g.lineWidth = fur ? 1.4 : 2.2;
        wrapDraw(W, (ox) => { g.beginPath(); g.moveTo(ox + x, y); g.lineTo(ox + x + (fur ? (r() - 0.5) * 2 : len), y + (fur ? len : (r() - 0.5) * 2)); g.stroke(); });
      }
    });
    let glow = null;
    if (glowPat) {
      glow = canvasTex(key + '|glow', W, H, (g) => {
        G = g;
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        g.shadowColor = '#fff'; g.shadowBlur = 8;
        if (glowPat === 'cracks') {
          g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineJoin = 'round';
          for (const pts of marks) wrapDraw(W, (ox) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(ox + x, y) : g.moveTo(ox + x, y))); g.stroke(); });
        } else if (glowPat === 'spots') {
          const r2 = rng(seed * 7 + 3);
          for (let i = 0; i < 26; i++) {
            // two rows of lights down the flanks
            const side = i % 2 ? 0.27 : 0.73, x = (side + (r2() - 0.5) * 0.05) * W, y = (i / 26) * H + r2() * 4, rr = 2.5 + r2() * 2.5;
            g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
          }
        }
      });
    }
    return { map, glow };
  }

  // ---------- materials: standard + rim light + hurt flash ----------
  const flash = { value: 0 };
  const mats = [];
  function mat({ color = '#ffffff', map = null, rough = 0.82, metal = 0, glow = null, glowMap = null, glowK = 1.6, flat = false, rim = null, rimK = 0.5, side = THREE.FrontSide, alphaMap = null, alphaTest = 0, emissive = null } = {}) {
    const m = new THREE.MeshStandardMaterial({ color, map, roughness: rough, metalness: metal, flatShading: flat, side, alphaTest });
    if (alphaMap) { m.alphaMap = alphaMap; m.transparent = false; }
    if (glow) { m.emissive = new THREE.Color(glow); m.emissiveMap = glowMap; m.emissiveIntensity = glowK; }
    else if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 1; }
    const rimC = new THREE.Color(rim || shade(pal.base, 0.55)).multiplyScalar(rimK);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = { value: rimC }; sh.uniforms.uFlash = flash;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uFlash;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { float fr = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
            totalEmissiveRadiance += uRim * pow(fr, 2.6) + vec3(1.0, 0.28, 0.18) * uFlash * (0.08 + 0.92 * fr * fr); }`);
    };
    m.customProgramCacheKey = () => 'ck_rim';
    mats.push(m);
    return m;
  }
  const basic = (color, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });

  // ---------- geometry: lofts ----------
  // Ring frame: up = refUp made perpendicular to the tangent; around-angle 0 is "up", PI is "down".
  const _t = V(0, 0, 0), _n = V(0, 0, 0), _s = V(0, 0, 0), _p = V(0, 0, 0);
  function writeRings(pos, uv, centers, rx, ry, seg, o) {
    const n = centers.length;
    const ref = o.up || V(0, 1, 0), alt = o.alt || V(0, 0, 1);
    for (let i = 0; i < n; i++) {
      const a = centers[Math.max(0, i - 1)], b = centers[Math.min(n - 1, i + 1)];
      _t.subVectors(b, a); if (_t.lengthSq() < 1e-12) _t.set(0, 0, 1); _t.normalize();
      _n.copy(ref).addScaledVector(_t, -ref.dot(_t));
      if (_n.lengthSq() < 1e-4) _n.copy(alt).addScaledVector(_t, -alt.dot(_t));
      _n.normalize(); _s.crossVectors(_n, _t).normalize();
      for (let j = 0; j <= seg; j++) {
        const ang = (j / seg) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
        let ryy = ry[i], rxx = rx[i];
        if (ca < 0) ryy *= o.flatBottom ?? 1; else ryy *= o.flatTop ?? 1;
        if (o.jitter) { const k = 1 + o.jitter * (hash(i, j % seg, o.seed || 1) - 0.5) * 2; ryy *= k; rxx *= k; }
        _p.copy(centers[i]).addScaledVector(_n, ca * ryy).addScaledVector(_s, sa * rxx);
        const q = (i * (seg + 1) + j) * 3; pos[q] = _p.x; pos[q + 1] = _p.y; pos[q + 2] = _p.z;
        if (uv) { const w = (i * (seg + 1) + j) * 2; uv[w] = j / seg; uv[w + 1] = o.vs[i]; }
      }
    }
  }
  /** A loft through ring centres. rx/ry per ring. Returns a mesh with mesh.userData.reloft(centers, rx, ry) for live bodies. */
  function loftMesh(centers, rx, ry, material, o = {}) {
    const n = centers.length, seg = o.seg || 16;
    const pos = new Float32Array(n * (seg + 1) * 3), uv = new Float32Array(n * (seg + 1) * 2);
    let L = 0; const vs = [0];
    for (let i = 1; i < n; i++) { L += centers[i].distanceTo(centers[i - 1]); vs.push(L); }
    const maxR = Math.max(0.01, ...rx, ...ry);
    const vk = (o.vScale ?? 1) / (TAU * maxR * 0.8);
    o.vs = o.vNorm ? vs.map((v) => v / Math.max(1e-6, L)) : vs.map((v) => v * vk + (o.vOff || 0));
    writeRings(pos, uv, centers, rx, ry, seg, o);
    const idx = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = (i + 1) * (seg + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    // wind outward: test a vertex on the middle ring
    const mi = Math.floor(n / 2), q = (mi * (seg + 1) + Math.floor(seg / 4));
    const nm = V().fromBufferAttribute(g.attributes.normal, q), pv = V().fromBufferAttribute(g.attributes.position, q).sub(centers[mi]);
    if (nm.dot(pv) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    const m = new THREE.Mesh(g, material);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.reloft = (c2, rx2 = rx, ry2 = ry) => { writeRings(pos, null, c2, rx2, ry2, seg, o); g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); };
    return m;
  }
  /** Radius keys [[t, r]] or [[t, rx, ry]] -> smooth function of t (cubic Hermite, Catmull tangents). */
  function keysFn(keys) {
    const K = keys.map((k) => [k[0], k[1], k[2] ?? k[1]]);
    return (t, c) => {
      if (t <= K[0][0]) return K[0][c]; if (t >= K[K.length - 1][0]) return K[K.length - 1][c];
      let i = 0; while (t > K[i + 1][0]) i++;
      const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
      const h = p2[0] - p1[0], s = (t - p1[0]) / h;
      const m1 = ((p2[c] - p0[c]) / Math.max(1e-6, p2[0] - p0[0])) * h, m2 = ((p3[c] - p1[c]) / Math.max(1e-6, p3[0] - p1[0])) * h;
      const s2 = s * s, s3 = s2 * s;
      return Math.max(0, (2 * s3 - 3 * s2 + 1) * p1[c] + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2[c] + (s3 - s2) * m2);
    };
  }
  /** A tube along a smooth spine through pts, radius keys, rounded ends (cap: [start, end] in metres, 0 = blunt). */
  function tube(pts, keys, material, o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(...p))), false, 'centripetal');
    const len = curve.getLength(), f = keysFn(keys), n = o.rings || 26;
    const r0 = f(0, 1), r1 = f(1, 1);
    const c0 = (o.cap ? o.cap[0] : r0 * 0.95) / len, c1 = (o.cap ? o.cap[1] : r1 * 0.95) / len;
    const centers = [], rx = [], ry = [];
    for (let i = 0; i < n; i++) {
      const lin = i / (n - 1), t = lerp(lin, 0.5 - 0.5 * Math.cos(Math.PI * lin), 0.55);
      let k = 1;
      if (c0 > 0 && t < c0) k = Math.sqrt(Math.max(0, 1 - ((c0 - t) / c0) ** 2));
      if (c1 > 0 && t > 1 - c1) k = Math.min(k, Math.sqrt(Math.max(0, 1 - ((t - (1 - c1)) / c1) ** 2)));
      k = Math.max(k, 0.02);
      centers.push(curve.getPointAt(t)); rx.push(f(t, 1) * k * (o.sx || 1)); ry.push(f(t, 2) * k * (o.sy || 1));
    }
    const m = loftMesh(centers, rx, ry, material, o);
    m.userData.curve = curve; m.userData.f = f; m.userData.up = o.up || V(0, 1, 0);
    return m;
  }
  /** Point on the surface of a tube at t, at around-angle a (0 = top). */
  function onTube(m, t, a = 0, out = 1) {
    const c = m.userData.curve, f = m.userData.f;
    const p = c.getPointAt(clamp(t)), T = c.getTangentAt(clamp(t));
    const up = m.userData.up; const N = up.clone().addScaledVector(T, -up.dot(T)).normalize(); const S = V().crossVectors(N, T).normalize();
    return { p: p.clone().addScaledVector(N, Math.cos(a) * f(t, 2) * out).addScaledVector(S, Math.sin(a) * f(t, 1) * out), n: N.clone().multiplyScalar(Math.cos(a)).addScaledVector(S, Math.sin(a)).normalize(), T };
  }
  /** A lumpy rock (flat shaded icosphere, shared vertices moved together). */
  function rock(r, material, seed = 1, lump = 0.22, detail = 1) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const p = g.attributes.position, v = V();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + lump * (hash(Math.round(v.x * 1000), Math.round(v.y * 1000), Math.round(v.z * 1000) + seed) - 0.5) * 2;
      p.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function ell(rx, ry, rz, material, seg = 16) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.max(8, seg * 0.7 | 0)), material); m.scale.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; return m; }
  /** A curved, tapering horn/claw/tusk along pts. */
  const spike = (pts, r0, material, o = {}) => tube(pts, [[0, r0], [0.6, r0 * 0.55], [1, r0 * 0.08]], material, { rings: o.rings || 12, seg: o.seg || 8, cap: [r0 * 0.6, 0.0001], vNorm: true, ...o });
  const glowSprite = (color, s, op = 0.7) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); sp.scale.setScalar(s); return sp; };
  function glowEye(r, color, { socket = true, slit = false } = {}) {
    const g = new THREE.Group();
    if (socket) { const s = ell(r * 1.35, r * 1.15, r * 0.8, M.dark); s.position.z = -r * 0.25; g.add(s); }
    const e = ell(slit ? r * 1.1 : r, slit ? r * 0.45 : r * 0.9, r * 0.7, basic(color, 1.6)); e.castShadow = false; g.add(e);
    const hl = ell(r * 0.22, r * 0.22, r * 0.2, basic('#ffffff', 1.2)); hl.position.set(r * 0.3, r * 0.3, r * 0.5); hl.castShadow = false; g.add(hl);
    const sp = glowSprite(color, r * 7, 0.55); sp.position.z = r * 0.4; g.add(sp);
    return g;
  }

  // ---------- the creature's materials ----------
  const pat = R.pattern;
  const glowPat = pal.glow && (pat === 'cracks' ? 'cracks' : R.glowSpots ? 'spots' : null);
  const S1 = skin('body', { pattern: pat, fur: !!R.fur, glowPat, patternColor: pal.pattern });
  const S2 = skin('limb', { pattern: pat === 'cracks' ? 'cracks' : pat === 'rings' || pat === 'bands' ? pat : 'none', fur: !!R.fur, glowPat: pat === 'cracks' && pal.glow ? 'cracks' : null });
  const hornTex = canvasTex('horn' + pal.accent, 32, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, shade(pal.accent, -0.35)); gr.addColorStop(0.5, pal.accent); gr.addColorStop(1, shade(pal.accent, 0.35));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h * 0.7; y += 7) { g.fillStyle = 'rgba(40,28,16,0.25)'; g.fillRect(0, y, w, 2); }
  });
  const tipTex = canvasTex('tipglow', 8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#a0a0a0'); gr.addColorStop(0.7, '#000000'); gr.addColorStop(1, '#000000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
  const rough = R.rough ?? (R.fur ? 0.92 : 0.7);
  const flat = !!R.flat;
  const M = {
    skin: mat({ map: S1.map, rough, glow: S1.glow ? pal.glow : null, glowMap: S1.glow, glowK: 2.2, flat, metal: R.metal || 0 }),
    limb: mat({ map: S2.map, rough, glow: S2.glow ? pal.glow : null, glowMap: S2.glow, glowK: 2.2, flat, metal: R.metal || 0 }),
    horn: mat({ map: hornTex, rough: 0.45, rim: pal.accent, rimK: 0.3 }),
    dark: mat({ color: pal.dark, rough: 0.6, rimK: 0.1 }),
    mouth: mat({ color: mix(pal.dark, '#8a2a2a', 0.6), rough: 0.5, rimK: 0 }),
    accent: mat({ color: pal.accent, rough: 0.6, rimK: 0.25 }),
    tooth: mat({ color: '#f2ead6', rough: 0.35, rimK: 0.2 }),
  };
  if (pal.glow) M.glow = basic(pal.glow, 1.4);

  const o = new THREE.Group(); o.name = R.name || 'creature';
  const inner = new THREE.Group(); o.add(inner);
  const P = R.proportions;
  const H = R.head;
  const anim = [];          // per-frame callbacks (dt, st, k) from parts
  const lights = [];

  // ---------- heads ----------
  // Built along +z from the neck joint. Returns { g, jaw, top, eyeY, len, w, h }.
  function makeHead(cfg) {
    const len = cfg.len || 0.4, w = cfg.w || 0.15, h = cfg.h || 0.15, sn = cfg.snout ?? 0.5, snW = cfg.snoutW ?? 0.6;
    const g = new THREE.Group();
    const beak = cfg.beak;
    const skullLen = beak ? len * 0.68 : len;
    const upper = tube([[0, 0, 0], [0, h * 0.12, skullLen * 0.35], [0, -h * 0.05 * sn, skullLen]],
      [[0, w * 0.8, h * 0.8], [0.3, w, h], [0.55, lerp(w, w * snW, sn), lerp(h, h * snW * 0.8, sn)], [1, w * snW * 0.75, h * snW * 0.55]],
      M.skin, { flatBottom: cfg.jaw === false ? 0.85 : 0.45, flatTop: cfg.flatTop ?? 1, rings: 22, seg: 18, vScale: 0.5, vOff: 0.3, cap: [w * 0.8, w * snW * 0.6] });
    g.add(upper);
    let jaw = null;
    if (cfg.jaw !== false && !beak) {
      jaw = new THREE.Group(); jaw.position.set(0, -h * 0.32, skullLen * 0.18); g.add(jaw);
      const jl = skullLen * 0.8;
      const jm = tube([[0, 0, 0], [0, -h * 0.08, jl * 0.5], [0, -h * 0.02, jl]], [[0, w * 0.7, h * 0.35], [0.5, w * snW * 0.85, h * 0.3], [1, w * snW * 0.6, h * 0.2]], M.limb, { flatTop: 0.35, rings: 16, seg: 14, vScale: 0.4 });
      jaw.add(jm);
      const mouth = tube([[0, h * 0.02, jl * 0.05], [0, h * 0.04, jl * 0.9]], [[0, w * 0.55, 0.02], [1, w * snW * 0.45, 0.015]], M.mouth, { rings: 8, seg: 10 });
      jaw.add(mouth);
      if (cfg.teeth) {
        const tg = new THREE.ConeGeometry(1, 1, 5);
        for (const sx of [-1, 1]) for (let i = 0; i < (cfg.teeth === 'fangs' ? 2 : 4); i++) {
          const z = jl * (0.88 - i * 0.18), x = sx * w * snW * (0.42 + i * 0.07);
          const big = i === 0 && cfg.teeth === 'fangs';
          const t1 = new THREE.Mesh(tg, M.tooth); t1.scale.set(0.016, big ? 0.07 : 0.035, 0.016); t1.position.set(x, h * 0.06 + (big ? 0.03 : 0.012), z); jaw.add(t1);
          const t2 = new THREE.Mesh(tg, M.tooth); t2.scale.set(0.016, big ? 0.075 : 0.035, 0.016); t2.rotation.x = Math.PI; t2.position.set(x * 1.05, -h * 0.28 - (big ? 0.025 : 0.0), skullLen * 0.18 + z - 0.02); g.add(t2);
        }
      }
    }
    if (beak) {
      const bl = len * (cfg.beakLen ?? 0.6);
      const top = tube([[0, h * 0.25, skullLen * 0.75], [0, h * 0.1, skullLen + bl * 0.5], [0, -h * 0.5, skullLen + bl * 0.9]], [[0, w * 0.6, h * 0.6], [0.5, w * 0.32, h * 0.32], [1, 0.012]], M.horn, { rings: 18, seg: 12, flatBottom: 0.5, cap: [w * 0.3, 0.004], vScale: 0.3 });
      g.add(top);
      jaw = new THREE.Group(); jaw.position.set(0, -h * 0.2, skullLen * 0.8); g.add(jaw);
      const bot = tube([[0, 0, 0], [0, -h * 0.05, bl * 0.75]], [[0, w * 0.42, h * 0.25], [1, 0.012]], M.horn, { rings: 12, seg: 10, flatTop: 0.4, cap: [w * 0.2, 0.004] });
      jaw.add(bot);
    }
    // eyes: on the sides, a little forward, under a brow
    const er = cfg.eye || w * 0.22;
    const ez = skullLen * (cfg.eyeZ ?? 0.42), ey = h * (cfg.eyeY ?? 0.32);
    const front = cfg.eyesFront ?? 0.55;   // 0 = on the sides, 1 = forward
    for (const sx of [-1, 1]) {
      const e = glowEye(er, pal.eyes, { slit: cfg.slit });
      const ox = sx * w * (0.78 - front * 0.18);
      e.position.set(ox, ey, ez); e.rotation.y = sx * (1 - front) * 1.1; g.add(e);
      if (cfg.brow !== false) {
        const b = ell(er * 1.9, er * 0.7, er * 1.4, M.skin); b.position.set(ox * 0.92, ey + er * 0.85, ez - er * 0.15); b.rotation.set(-0.2, sx * (1 - front) * 1.1, sx * -0.42 * (cfg.angry ?? 1)); g.add(b);
      }
    }
    return { g, jaw, len, w, h, skullLen, upper };
  }

  // ---------- head parts ----------
  function headParts(hd) {
    const { g, w, h, skullLen } = hd;
    const ek = kind('ears');
    if (ek) for (const sx of [-1, 1]) {
      const ep = new THREE.Group(); ep.position.set(sx * w * 0.5, h * 0.72, skullLen * 0.2); g.add(ep);
      const el = (ek === 'long' ? 0.26 : ek === 'round' ? 0.09 : 0.17) * (H.earSize ?? 1);
      const ear = tube([[0, -0.02, 0], [sx * 0.015, el * 0.55, -el * 0.12], [sx * 0.03, el, -el * 0.35]], [[0, w * 0.4, w * 0.12], [0.35, w * 0.38, w * 0.1], [1, 0.006]], M.limb, { rings: 12, seg: 10, cap: [w * 0.1, 0.004], up: V(0, 0, 1) });
      ep.add(ear);
      const inn = tube([[0, 0.0, w * 0.05], [sx * 0.012, el * 0.5, -el * 0.08], [sx * 0.024, el * 0.85, -el * 0.27]], [[0, w * 0.26, w * 0.05], [1, 0.004]], M.mouth, { rings: 10, seg: 8, cap: [w * 0.05, 0.003], up: V(0, 0, 1) });
      ep.add(inn);
      const rx0 = ek === 'swept' ? -0.45 : -0.15;
      ep.rotation.z = sx * -0.35; ep.rotation.x = rx0;
      anim.push((dt, st) => { ep.rotation.x = rx0 + Math.sin(st.t * 1.7 + sx) * 0.05 - (st._att || 0) * 0.5; });
    }
    const hk = kind('horns');
    if (hk) for (const sx of [-1, 1]) {
      let pts, r0 = w * 0.2;
      if (hk === 'curl') { pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * Math.PI * 1.5; pts.push([sx * (t * 0.06 + 0.02), Math.sin(a) * 0.13 * (1 - t * 0.3), -Math.cos(a) * 0.13 * (1 - t * 0.3) + 0.1]); } r0 = w * 0.25; }
      else if (hk === 'rhino') { if (sx > 0) continue; pts = [[0, 0, 0], [0, 0.12, 0.06], [0, 0.26, -0.02]]; r0 = w * 0.32; }
      else if (hk === 'forward') pts = [[0, 0, 0], [sx * 0.08, 0.08, 0.06], [sx * 0.1, 0.1, 0.2]];
      else pts = [[0, 0, 0], [sx * 0.06, 0.1, -0.06], [sx * 0.08, 0.2, -0.18]];
      const hm = spike(pts, r0, M.horn, { rings: 18 });
      if (hk === 'rhino') hm.position.set(0, h * 0.35, skullLen * 0.78);
      else hm.position.set(sx * w * 0.55, h * 0.6, skullLen * 0.3);
      g.add(hm);
    }
    if (kind('nose') === 'disc') {
      const sn = H.snout ?? 0.5, snW = H.snoutW ?? 0.6;
      const nr = w * snW * 0.62;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(nr, nr * 1.08, nr * 0.5, 20), mat({ color: mix(pal.belly, '#c87a6a', 0.45), rough: 0.6 }));
      disc.rotation.x = Math.PI / 2 + 0.25; disc.position.set(0, -h * 0.05 * sn + h * 0.02, skullLen + nr * 0.05); disc.castShadow = true; g.add(disc);
      for (const sx of [-1, 1]) { const n = ell(nr * 0.2, nr * 0.32, nr * 0.1, M.dark, 10); n.position.set(sx * nr * 0.38, -h * 0.05 * sn + h * 0.02 - nr * 0.06, skullLen + nr * 0.32); n.rotation.x = 0.25; g.add(n); }
    }
    if (has('tusks') && hd.jaw) for (const sx of [-1, 1]) {
      const tk = spike([[0, 0, 0], [sx * 0.03, 0.05, 0.03], [sx * 0.05, 0.13, -0.02]], 0.026, M.tooth, { rings: 12 });
      tk.position.set(sx * w * 0.42, h * 0.02, skullLen * 0.62); hd.jaw.add(tk);
    }
    if (has('mandibles')) for (const sx of [-1, 1]) {
      const mp = new THREE.Group(); mp.position.set(sx * w * 0.45, -h * 0.25, skullLen * 0.85); g.add(mp);
      mp.add(spike([[0, 0, 0], [sx * 0.03, -0.01, 0.06], [-sx * 0.03, -0.015, 0.11]], w * 0.18, M.dark, { rings: 10 }));
      anim.push((dt, st) => { mp.rotation.y = sx * (0.25 + Math.sin(st.t * 6) * 0.08 + (st._att || 0) * 0.6); });
    }
    if (has('antennae')) for (const sx of [-1, 1]) {
      const a = tube([[0, 0, 0], [sx * 0.05, 0.12, 0.06], [sx * 0.12, 0.2, 0.0]], [[0, 0.008], [1, 0.005]], M.dark, { rings: 10, seg: 6 });
      a.position.set(sx * w * 0.3, h * 0.5, skullLen * 0.7); g.add(a);
      const tip = ell(0.018, 0.018, 0.018, M.dark); tip.position.set(sx * w * 0.3 + sx * 0.12, h * 0.5 + 0.2, skullLen * 0.7); g.add(tip);
    }
    if (has('barbels')) for (const sx of [-1, 1]) {
      const b = tube([[0, 0, 0], [sx * 0.06, -0.06, 0.0], [sx * 0.1, -0.14, -0.06]], [[0, 0.012], [1, 0.004]], M.limb, { rings: 10, seg: 6 });
      b.position.set(sx * w * 0.5, -h * 0.1, skullLen * 0.85); g.add(b);
    }
  }

  // ---------- body parts on a torso tube ----------
  function backRow(torso, { from = 0.2, to = 0.95, n = 9, len = 0.14, r0 = 0.03, lean = -0.6, material = M.horn, spread = 0, tipGlow = null, flowers = null } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = lerp(from, to, n === 1 ? 0.5 : i / (n - 1));
      for (const a of spread ? [-spread, spread] : [0]) {
        const s = onTube(torso, t, a, 0.92);
        const l = len * (0.7 + 0.6 * Math.sin(Math.PI * (i + 0.5) / n)) * (0.85 + hash(i, a) * 0.3);
        const dir = s.n.clone().addScaledVector(s.T, lean).normalize();
        const mid = s.p.clone().addScaledVector(dir, l * 0.5).addScaledVector(s.T, -l * 0.15), tip = s.p.clone().addScaledVector(dir, l).addScaledVector(s.T, -l * 0.35);
        const sp = spike([s.p, mid, tip], r0, material, { rings: 9, seg: 6 });
        torso.parent.add(sp); out.push(sp);
        if (tipGlow) { const gl = glowSprite(tipGlow, l * 1.2, 0.8); gl.position.copy(tip); torso.parent.add(gl); out.push(gl); }
        if (flowers && hash(i, a, 9) < 0.6) { const f = ell(0.022, 0.018, 0.022, flowers); f.position.copy(s.p.clone().lerp(tip, 0.55)).addScaledVector(dir, 0.01); torso.parent.add(f); }
      }
    }
    return out;
  }
  function mossTufts(parent, surf, n, scale, seed = 3) {
    const r = rng(seed * 13 + 5);
    const moss = mat({ color: pal.moss || '#5a8a3a', rough: 0.95, flat: true, rim: '#bfe08a', rimK: 0.35 });
    const moss2 = mat({ color: shade(pal.moss || '#5a8a3a', 0.2), rough: 0.95, flat: true, rim: '#d0f0a0', rimK: 0.35 });
    for (let i = 0; i < n; i++) {
      const s = surf(r(), r());
      const c = new THREE.Group(); c.position.copy(s.p);
      for (let k = 0; k < 3; k++) { const m = rock(scale * (0.6 + r() * 0.6), r() < 0.5 ? moss : moss2, i * 3 + k, 0.35, 0); m.position.set((r() - 0.5) * scale * 1.5, (r() - 0.3) * scale * 0.6, (r() - 0.5) * scale * 1.5); m.scale.y = 0.65; c.add(m); }
      parent.add(c);
    }
  }
  function embers(parent, { n = 8, w = 0.5, h = 0.8, y0 = 0.3, color = pal.glow, zc = 0 } = {}) {
    const sps = [];
    for (let i = 0; i < n; i++) { const s = glowSprite(color, 0.05 + hash(i, 4) * 0.05, 0.9); parent.add(s); sps.push({ s, ph: hash(i, 1), x: (hash(i, 2) - 0.5) * w, z: (hash(i, 3) - 0.5) * w + zc }); }
    anim.push((dt, st) => { for (const e of sps) { const k = (st.t * 0.35 + e.ph) % 1; e.s.position.set(e.x + Math.sin(st.t * 2 + e.ph * 9) * 0.05, y0 + k * h, e.z); e.s.material.opacity = Math.sin(k * Math.PI) * 0.9; } });
  }

  // ---------- tails: a chain of pivots ----------
  function makeTail(parent, base, { len = 0.5, r0 = 0.06, segs = 4, lift = 0.5, droop = -0.15, kind: tk = 'plain', material = M.skin } = {}) {
    const piv = []; let cur = parent;
    const sl = len / segs;
    for (let i = 0; i < segs; i++) {
      const p = new THREE.Group();
      if (i === 0) p.position.copy(base); else p.position.set(0, 0, -sl);
      p.rotation.x = i === 0 ? lift : droop;
      cur.add(p); piv.push(p);
      const ra = r0 * (1 - i / segs * 0.8), rb = r0 * (1 - (i + 1) / segs * 0.8);
      p.add(tube([[0, 0, sl * 0.15], [0, 0, -sl * 1.08]], [[0, ra], [1, Math.max(0.008, rb)]], material, { rings: 10, seg: 12, vScale: 0.5 }));
      cur = p;
    }
    const end = new THREE.Group(); end.position.set(0, 0, -sl); cur.add(end);
    const re = r0 * 0.2;
    if (tk === 'spiked') {
      // a crest of short spikes down the top of the tail
      piv.forEach((p, i) => { const r = r0 * (1 - (i + 0.5) / segs * 0.8); p.add(spike([[0, r * 0.7, -sl * 0.35], [0, r * 1.5, -sl * 0.6]], r * 0.45, M.horn, { rings: 6, seg: 6 })); });
    } else if (tk === 'club') {
      end.add(rock(r0 * 1.3, M.horn, 7, 0.25, 1));
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; const sp = spike([[0, 0, 0], [Math.cos(a) * r0, Math.sin(a) * r0, -r0 * 0.4], [Math.cos(a) * r0 * 2.2, Math.sin(a) * r0 * 2.2, -r0 * 1.2]], r0 * 0.32, M.horn, { rings: 8, seg: 6 }); end.add(sp); }
    } else if (tk === 'ember') {
      const gl = glowSprite(pal.glow, 0.3, 0.9); end.add(gl); const c = ell(re * 2.2, re * 2.2, re * 3.2, M.glow); end.add(c);
    } else if (tk === 'tuft') {
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; end.add(spike([[0, 0, 0.02], [Math.cos(a) * 0.03, Math.sin(a) * 0.03, -0.06], [Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.14]], 0.022, M.accent, { rings: 8, seg: 6 })); }
    }
    return { piv, end };
  }

  // ===================================================================================== bodies
  let update = () => {};
  let height = 1;

  if (R.body === 'quadruped') {
    const L = P.torso ?? 1.0, gr = P.girth ?? 0.28, legLen = P.legLen ?? 0.5, lt = P.legThick ?? 0.08;
    const chest = P.chest ?? 1.15, hips = P.hips ?? 0.9, arch = P.arch ?? 0.04, neckL = P.neck ?? 0.26, rise = P.neckRise ?? 0.55;
    const ty = legLen + gr * 0.35;
    // torso and neck are one loft (rump, waist, chest, neck base, head joint): no seam, no flat chest face
    const sh0 = P.shoulder ?? 0.04, hw = H.w || 0.15;
    const ns = V(0, ty + sh0 + gr * 0.3, L * 0.5), ne = ns.clone().add(V(0, Math.sin(rise) * neckL, Math.cos(rise) * neckL));
    const tpts = [V(0, ty - (P.rump ?? 0.02), -L / 2), V(0, ty + arch, -L * 0.05), V(0, ty + sh0, L * 0.3), ns, ne];
    const cum = [0]; for (let i = 1; i < tpts.length; i++) cum.push(cum[i - 1] + tpts[i].distanceTo(tpts[i - 1]));
    const fr = cum.map((c) => c / cum[cum.length - 1]);
    const wst = gr * (P.waist ?? 0.92);
    const torso = tube(tpts,
      [[0, gr * hips * 0.75, gr * hips * 0.8], [fr[1] * 0.45, gr * hips, gr * hips * 1.05], [fr[1], wst, wst * 1.05], [fr[2], gr * chest * 0.95, gr * chest * 1.1],
        [fr[3], Math.max(hw * 1.2, gr * chest * 0.62), Math.max(hw * 1.3, gr * chest * 0.78)], [1, hw * 0.95, hw * 1.0]],
      M.skin, { flatBottom: P.belly ?? 0.9, rings: 44, seg: 22, vScale: R.patternScale ?? 1, cap: [gr * hips * 0.7, hw * 0.6] });
    inner.add(torso);
    const headPiv = new THREE.Group(); headPiv.position.copy(ne); inner.add(headPiv);
    const hd = makeHead({ len: 0.38, w: 0.15, h: 0.15, ...H });
    hd.g.position.set(0, 0, -0.04); hd.g.rotation.x = H.pitch ?? 0.15; headPiv.add(hd.g);
    headParts(hd);
    // legs
    const legs = [];
    const drop = ty - 0.02;
    for (const [fz, front] of [[L * (P.legFront ?? 0.34), true], [-L * (P.legRear ?? 0.33), false]]) for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * gr * (P.stance ?? 0.52), ty, fz); inner.add(hip);
      const l1 = drop * 0.5, l2 = drop * 0.5 - lt * 0.6, dz = front ? -0.02 : 0.07;
      const top = Math.max(lt * 1.5, front ? gr * 0.5 : gr * 0.62);
      hip.add(tube([[0, gr * 0.25, -dz * 0.3], [0, -l1 * 0.35, dz * 0.4], [0, -l1, dz]], [[0, top * 0.55, top * 0.85], [0.3, top * 0.62, top * 0.9], [0.75, lt * 1.3, lt * 1.45], [1, lt * 1.12, lt * 1.2]], M.limb, { rings: 16, seg: 16, up: V(0, 0, 1), vScale: 0.5, cap: [top * 0.5, lt * 1.1] }));
      const knee = new THREE.Group(); knee.position.set(0, -l1, dz); hip.add(knee);
      knee.add(tube([[0, lt * 0.5, 0], [0, -l2 * 0.5, -dz * 0.6], [0, -l2 + lt * 0.2, -dz * 0.9]], [[0, lt * 1.1, lt * 1.15], [0.55, lt * 0.8, lt * 0.88], [1, lt * 0.82, lt * 0.9]], M.limb, { rings: 12, seg: 14, up: V(0, 0, 1), vScale: 0.5 }));
      const foot = new THREE.Group(); foot.position.set(0, -l2, -dz * 0.9); knee.add(foot);
      const paw = ell(lt * 1.0, lt * 0.62, lt * 1.3, M.limb); paw.position.set(0, lt * 0.1, lt * 0.3); foot.add(paw);
      if (P.claws !== false) for (let k = -1; k <= 1; k++) { const c = spike([[0, 0, 0], [0, -0.008, 0.025], [0, -0.028, 0.04]], lt * 0.22, M.dark, { rings: 6, seg: 6 }); c.position.set(k * lt * 0.5, -lt * 0.05, lt * 1.3); foot.add(c); }
      legs.push({ hip, knee, front, sx, ph: (front ? 0 : Math.PI) + (sx > 0 ? Math.PI : 0) });
    }
    // tail
    let tail = null;
    if (P.tail !== 0) tail = makeTail(inner, V(0, ty + gr * 0.45, -L / 2 + 0.04), { len: P.tail ?? 0.45, r0: P.tailThick ?? gr * 0.28, segs: 5, lift: P.tailLift ?? 0.5, droop: P.tailDroop ?? -0.18, kind: kind('tail') || 'plain' });
    // body parts
    const rowKind = kind('spines') || kind('bristles');
    if (rowKind === 'gorse') {
      // a ridge of dark bristle with gorse sprigs growing through it: short spiny tufts tipped with yellow flowers
      const gm = mat({ color: pal.accent, rough: 0.85, rim: '#d8f0a0', rimK: 0.3 }), fm = mat({ color: '#ffcf2a', rough: 0.6, emissive: '#6a4a00' });
      backRow(torso, { from: 0.12, to: 0.97, n: P.spineN ?? 12, len: P.spineLen ?? 0.12, r0: 0.03, lean: -0.9, material: mat({ color: shade(pal.base, -0.5), rough: 0.95 }) });
      for (let i = 0; i < 16; i++) {
        const t = 0.15 + i / 15 * 0.8, a = (hash(i, 11) - 0.5) * 1.3;
        const s = onTube(torso, t, a, 0.95), c = new THREE.Group(); c.position.copy(s.p); torso.parent.add(c);
        for (let k = 0; k < 5; k++) {
          const d = s.n.clone().add(V((hash(i, k) - 0.5) * 1.2, 0.2, (hash(k, i) - 0.5) * 1.2 - 0.3)).normalize(), l = 0.07 + hash(i, k, 4) * 0.06;
          c.add(spike([[0, 0, 0], d.clone().multiplyScalar(l * 0.5).toArray(), d.clone().multiplyScalar(l).toArray()], 0.011, gm, { rings: 5, seg: 5 }));
          if (hash(i, k, 6) < 0.55) { const f = ell(0.02, 0.016, 0.02, fm, 8); f.position.copy(d.clone().multiplyScalar(l * 0.8)); c.add(f); }
        }
      }
    } else if (rowKind) backRow(torso, { from: 0.15, to: 0.98, n: P.spineN ?? 11, len: P.spineLen ?? 0.16, r0: P.spineR ?? 0.025, lean: -0.7, material: M.horn });
    if (has('mane')) {
      const mk = kind('mane'), mm = mk === 'ember' ? mat({ color: shade(pal.base, -0.45), rough: 0.95, glow: pal.glow, glowMap: tipTex, glowK: 2.4 }) : mat({ color: pal.accent, rough: 0.95 });
      // shaggy tufts over the shoulders and up the back of the neck, swept back
      const tufts = [];
      for (let i = 0; i < 26; i++) { const a = (hash(i, 7) - 0.5) * 2.4, t = 0.7 + hash(i, 8) * 0.3; tufts.push([onTube(torso, Math.min(0.99, t), a, 0.9), 0.1 + hash(i, 2) * 0.08]); }
      for (let i = 0; i < 9; i++) { const k = i / 8, p = ns.clone().lerp(ne, k * 0.9); const a = (hash(i, 5) - 0.5) * 1.6; const w = (H.w || 0.15); tufts.push([{ p: p.clone().add(V(Math.sin(a) * w * 0.8, Math.cos(a) * w * 0.85, 0)), n: V(Math.sin(a), Math.cos(a), 0) }, 0.11 + hash(i, 3) * 0.06]); }
      for (const [s, l] of tufts) {
        const dir = s.n.clone().multiplyScalar(0.55).add(V(0, 0.45, -0.85)).normalize();
        const tip = s.p.clone().addScaledVector(dir, l);
        torso.parent.add(spike([s.p.clone().addScaledVector(dir, -0.03), s.p.clone().lerp(tip, 0.5).add(V(0, 0.02, 0)), tip], 0.032, mm, { rings: 8, seg: 6 }));
      }
      if (mk === 'ember') for (let i = 0; i < 5; i++) { const gl = glowSprite(pal.glow, 0.22, 0.55); gl.position.copy(tufts[i * 5][0].p).add(V(0, 0.1, -0.08)); torso.parent.add(gl); }
    }
    let shellG = null;
    if (has('shell')) {
      shellG = new THREE.Group(); inner.add(shellG);
      const sh = skin('shell', { base: pal.shell || shade(pal.base, -0.1), belly: pal.shell || pal.base, pattern: 'plates', seed: R.seed + 4, patternColor: shade(pal.shell || pal.base, -0.55) });
      const sm = mat({ map: sh.map, rough: 0.55, rim: shade(pal.shell || pal.base, 0.6), rimK: 0.45 });
      const sr = gr * (P.shellR ?? 1.35);
      const dome = tube([[0, ty - gr * 0.25, -L * 0.62], [0, ty + 0.02, 0], [0, ty - gr * 0.25, L * 0.6]], [[0, sr * 0.55, sr * 0.3], [0.2, sr * 0.92, sr * 0.75], [0.5, sr * 1.02, sr * 0.95], [0.8, sr * 0.92, sr * 0.75], [1, sr * 0.55, sr * 0.3]], sm, { flatBottom: 0.18, rings: 30, seg: 26, vScale: 0.9 });
      shellG.add(dome);
      const rim = tube([[0, ty - gr * 0.3, -L * 0.6], [0, ty - gr * 0.2, 0], [0, ty - gr * 0.3, L * 0.58]], [[0, sr * 0.6, 0.05], [0.5, sr * 1.08, 0.06], [1, sr * 0.6, 0.05]], M.dark, { rings: 24, seg: 22, cap: [0.04, 0.04] });
      shellG.add(rim);
      if (has('moss')) mossTufts(shellG, (a, b) => onTube(dome, 0.15 + a * 0.6, (b - 0.5) * 1.6, 1.0), P.mossN ?? 9, 0.06, R.seed);
      // ridge knobs
      for (let i = 0; i < 5; i++) { const s = onTube(dome, 0.18 + i * 0.16, 0, 0.98); const k = rock(0.05, sm, i, 0.2, 0); k.position.copy(s.p); k.scale.set(0.9, 0.6, 1.2); shellG.add(k); }
    }
    if (has('embers')) embers(inner, { n: 10, w: L * 0.8, y0: ty + gr, h: 0.7 });
    const box = new THREE.Box3().setFromObject(inner); height = box.max.y;
    // idle head look, gait, strike, flinch
    let ph = 0;
    update = (dt, st) => {
      const mv = st.moving && st.deadT == null;
      const f = mv ? clamp(1.6 + (st.speed || 2) * 1.6, 2, 12) : 0;
      ph += dt * f;
      const A = mv ? clamp(0.35 + (st.speed || 2) * 0.08, 0.35, 0.7) : 0;
      const att = strike(st.t, st.attackT, 0.5, 0.4), hurt = pulse(st.t, st.hurtT, 0.32);
      st._att = att;
      for (const l of legs) {
        const p = ph + l.ph, s = Math.sin(p), swing = Math.max(0, -Math.cos(p));
        l.hip.rotation.x = s * A + (l.front ? -att * 0.75 : att * 0.45) + (l.front ? 0 : hurt * 0.2);
        l.knee.rotation.x = (l.front ? swing * 1.1 : -swing * 0.7) * (A > 0 ? 1 : 0) + (l.front ? att * 0.2 : -att * 0.3);
      }
      const bob = mv ? Math.abs(Math.sin(ph)) * 0.035 : Math.sin(st.t * 2.1) * 0.006;
      inner.position.set(Math.sin(st.t * 55) * hurt * 0.025, bob + att * 0.04, att * (P.lunge ?? 0.38) - hurt * 0.14);
      inner.rotation.x = att * 0.12 - hurt * 0.16 + (mv ? Math.sin(ph * 2) * 0.02 : 0);
      inner.rotation.z = mv ? Math.sin(ph) * 0.03 : 0;
      torso.scale.set(1 + Math.sin(st.t * 2.1) * 0.012, 1 + Math.sin(st.t * 2.1) * 0.015, 1);
      headPiv.rotation.y = mv ? 0 : Math.sin(st.t * 0.6) * 0.25 * (1 - att);
      headPiv.rotation.x = (mv ? Math.sin(ph * 2) * 0.05 : Math.sin(st.t * 1.3) * 0.04) + att * 0.18 - hurt * 0.4;
      if (hd.jaw) hd.jaw.rotation.x = att * 0.5 + hurt * 0.25 + (mv ? 0.05 : 0);
      if (tail) tail.piv.forEach((p, i) => { p.rotation.y = Math.sin(st.t * (mv ? 7 : 2.2) - i * 0.7) * (mv ? 0.18 : 0.12); if (i === 0) p.rotation.x = (P.tailLift ?? 0.5) + att * 0.3 - hurt * 0.4; });
      if (shellG) shellG.position.y = -hurt * 0.05;
      for (const a of anim) a(dt, st);
      death(st, 0.15);
    };
  }

  else if (R.body === 'insect') {
    const L = P.abdomen ?? 0.45, gr = P.girth ?? 0.2, y = P.bodyY ?? 0.2, legLen = P.legLen ?? 0.34, lt = P.legThick ?? 0.025, pairs = P.legPairs ?? 3;
    const thR = gr * (P.thorax ?? 0.7);
    const thorax = tube([[0, y, -0.02], [0, y + 0.01, thR * 1.6]], [[0, thR * 0.9, thR * 0.7], [0.5, thR, thR * 0.8], [1, thR * 0.8, thR * 0.65]], M.limb, { rings: 14, seg: 16, vScale: 0.6 });
    inner.add(thorax);
    const abd = tube([[0, y + 0.01, -0.02], [0, y + gr * 0.15, -L * 0.5], [0, y + (P.abdLift ?? 0.0), -L]], [[0, gr * 0.75, gr * 0.6 * (P.abdH ?? 1)], [0.4, gr * (P.abdW ?? 1.05), gr * 0.82 * (P.abdH ?? 1)], [1, gr * 0.5, gr * 0.4 * (P.abdH ?? 1)]], M.skin, { rings: 22, seg: 20, flatBottom: 0.7, vScale: R.patternScale ?? 1 });
    inner.add(abd);
    const headPiv = new THREE.Group(); headPiv.position.set(0, y + 0.01, thR * 1.55); inner.add(headPiv);
    const hd = makeHead({ len: 0.16, w: gr * 0.55, h: gr * 0.48, snout: 0.2, snoutW: 0.85, jaw: false, brow: false, eyesFront: 0.6, eye: gr * 0.12, eyeY: 0.3, eyeZ: 0.55, ...H });
    headPiv.add(hd.g); headParts(hd);
    // legs: coxa pivot (yaw swing), femur up and out, knee, tibia down to the ground
    const legs = [];
    for (let i = 0; i < pairs; i++) for (const sx of [-1, 1]) {
      const z = lerp(thR * 1.2, -0.03 - (pairs > 3 ? L * 0.25 : 0), pairs === 1 ? 0.5 : i / (pairs - 1));
      const piv = new THREE.Group(); piv.position.set(sx * thR * 0.75, y - 0.01, z); inner.add(piv);
      piv.rotation.y = sx * lerp(-0.8, 0.75, pairs === 1 ? 0.5 : i / (pairs - 1));   // front pair reaches forward
      const fl = legLen * 0.5, kx = sx * fl * 0.92, ky = fl * 0.38;
      const legM = P.legColor ? (M.leg || (M.leg = mat({ color: P.legColor, rough: 0.45, metal: 0.2, rimK: 0.3 }))) : M.dark;
      piv.add(tube([[0, 0, 0], [kx * 0.5, ky * 0.75, 0], [kx, ky, 0]], [[0, lt * 1.3], [0.5, lt * 1.7], [1, lt * 1.15]], legM, { rings: 10, seg: 8, cap: [lt, lt] }));
      const knee = new THREE.Group(); knee.position.set(kx, ky, 0); piv.add(knee);
      const footY = -(y - 0.01 + ky) + 0.005;
      knee.add(tube([[0, 0, 0], [sx * legLen * 0.16, footY * 0.5, 0], [sx * legLen * 0.2, footY, 0]], [[0, lt * 1.15], [0.4, lt * 1.0], [1, lt * 0.45]], legM, { rings: 10, seg: 8, cap: [lt, 0.003] }));
      for (let k = 0; k < 2; k++) knee.add(spike([[sx * legLen * (0.06 + k * 0.06), footY * (0.25 + k * 0.25), 0], [sx * legLen * (0.1 + k * 0.06), footY * (0.2 + k * 0.25), 0]], lt * 0.5, legM, { rings: 4, seg: 5 }));
      const k0 = new THREE.Group(); legs.push({ piv, knee, sx, ph: (i % 2 === (sx > 0 ? 0 : 1)) ? 0 : Math.PI, yaw: piv.rotation.y }); void k0;
    }
    let shellG = null;
    if (has('carapace')) {
      shellG = new THREE.Group(); inner.add(shellG);
      const sh = skin('shell', { base: pal.shell || pal.base, belly: shade(pal.shell || pal.base, -0.3), pattern: pat === 'none' ? 'mottle' : pat, seed: R.seed + 9 });
      const shc = pal.shell || pal.base;
      const sm = mat({ map: sh.map, rough: 0.38, metal: 0.25, rim: shade(shc, 0.6), rimK: 0.55 });
      const cr = gr * 1.12;
      // the wing cases: one domed shell over the abdomen, split by a dark seam
      const dome = tube([[0, y + 0.0, thR * 0.15], [0, y + gr * 0.22, -L * 0.42], [0, y + 0.0, -L * 1.04]], [[0, cr * 0.82, cr * 0.5], [0.3, cr * 1.0, cr * 0.85], [0.72, cr * 0.94, cr * 0.75], [1, cr * 0.4, cr * 0.25]], sm, { flatBottom: 0.15, rings: 28, seg: 26, vScale: 0.8 });
      shellG.add(dome);
      const seamPts = []; for (let i = 0; i <= 10; i++) seamPts.push(onTube(dome, 0.05 + i * 0.088, 0, 0.985).p);
      shellG.add(tube(seamPts, [[0, 0.008], [1, 0.006]], M.dark, { rings: 20, seg: 6 }));
      const pron = tube([[0, y + 0.0, -0.02], [0, y + 0.03, thR * 1.45]], [[0, thR * 1.25, thR * 1.0], [0.6, thR * 1.15, thR * 0.9], [1, thR * 0.85, thR * 0.6]], sm, { flatBottom: 0.25, rings: 14, seg: 18 });
      shellG.add(pron);
      if (has('moss')) {
        const top = (a, b) => ({ p: V((b - 0.5) * cr * 1.2, y + gr * 0.95 - Math.abs(b - 0.5) * gr * 0.6, -L * (0.1 + a * 0.7)) });
        mossTufts(shellG, top, P.mossN ?? 7, gr * 0.3, R.seed);
      }
    }
    // pincers
    const claws = [];
    if (has('pincers')) for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * thR * 0.8, y + 0.01, thR * 1.3); inner.add(sh);
      sh.rotation.y = sx * 0.55;
      const a1 = gr * 0.9 * (P.claw ?? 1), cs = P.claw ?? 1;
      sh.add(tube([[0, 0, 0], [sx * a1 * 0.5, 0.04, a1 * 0.3], [sx * a1 * 0.7, 0.05, a1 * 0.7]], [[0, lt * 2], [1, lt * 1.7]], M.limb, { rings: 10, seg: 10 }));
      const el = new THREE.Group(); el.position.set(sx * a1 * 0.7, 0.05, a1 * 0.7); el.rotation.y = -sx * 0.9; sh.add(el);
      el.add(tube([[0, 0, 0], [0, 0, a1 * 0.5]], [[0, lt * 1.7], [1, lt * 2.2]], M.limb, { rings: 8, seg: 10 }));
      const palm = tube([[0, 0, a1 * 0.45], [0, 0.005, a1 * 0.95]], [[0, gr * 0.22 * cs, gr * 0.17 * cs], [0.5, gr * 0.3 * cs, gr * 0.2 * cs], [1, gr * 0.15 * cs, gr * 0.12 * cs]], M.skin, { rings: 14, seg: 14 });
      el.add(palm);
      el.add(spike([[sx * gr * 0.06, 0, a1 * 0.9], [sx * gr * 0.09, 0, a1 * 1.2], [sx * gr * 0.02, 0, a1 * 1.45]], gr * 0.09, M.limb, { rings: 10 }));
      const mv = new THREE.Group(); mv.position.set(-sx * gr * 0.08, 0, a1 * 0.9); el.add(mv);
      mv.add(spike([[0, 0, 0], [-sx * gr * 0.04, 0, a1 * 0.3], [sx * gr * 0.04, 0, a1 * 0.52]], gr * 0.08, M.limb, { rings: 10 }));
      claws.push({ sh, el, mv, sx });
    }
    // stinger tail: a chain of beads curling up and over
    let sting = null;
    if (kind('tail') === 'stinger') {
      sting = []; let cur = inner; const n = 6, sl = (P.tail ?? 0.55) / n;
      for (let i = 0; i < n; i++) {
        const p = new THREE.Group(); if (i === 0) p.position.set(0, y + 0.02, -L * 0.98); else p.position.set(0, 0, -sl);
        cur.add(p); sting.push(p); cur = p;
        const r0 = gr * (P.tailR ?? 0.42) * (1 - i * 0.07);
        p.add(tube([[0, 0, sl * 0.2], [0, 0, -sl * 1.15]], [[0, r0 * 0.8, r0 * 0.7], [0.55, r0 * 1.05, r0 * 0.85], [1, r0 * 0.8, r0 * 0.7]], M.skin, { rings: 12, seg: 12, vScale: 0.3, cap: [r0 * 0.4, r0 * 0.4] }));
        const ridge = spike([[0, r0 * 0.6, -sl * 0.2], [0, r0 * 0.95, -sl * 0.55]], r0 * 0.3, M.limb, { rings: 5, seg: 5 }); p.add(ridge);
      }
      const bulbG = new THREE.Group(); bulbG.position.set(0, 0, -sl); cur.add(bulbG);
      const bulb = tube([[0, 0, 0.02], [0, -0.005, -gr * 0.45]], [[0, gr * 0.22], [0.5, gr * 0.28], [1, gr * 0.12]], mat({ color: pal.accent, rough: 0.35, glow: pal.glow, glowK: 0.35 }), { rings: 12, seg: 12 });
      bulbG.add(bulb);
      bulbG.add(spike([[0, -0.005, -gr * 0.4], [0, -gr * 0.1, -gr * 0.65], [0, -gr * 0.32, -gr * 0.7]], gr * 0.08, M.dark, { rings: 10 }));
      if (pal.glow) { const gl = glowSprite(pal.glow, gr * 1.6, 0.6); gl.position.set(0, 0, -gr * 0.2); bulbG.add(gl); }
    }
    const box = new THREE.Box3().setFromObject(inner); height = box.max.y;
    let ph = 0;
    update = (dt, st) => {
      const mv = st.moving && st.deadT == null;
      ph += dt * (mv ? clamp(6 + (st.speed || 2) * 3, 6, 18) : 0);
      const att = strike(st.t, st.attackT, 0.45, 0.4), hurt = pulse(st.t, st.hurtT, 0.3);
      st._att = att;
      for (const l of legs) {
        const p = ph + l.ph;
        l.piv.rotation.y = l.yaw + (mv ? Math.sin(p) * 0.3 * l.sx : 0);
        l.piv.rotation.z = mv ? l.sx * Math.max(0, Math.cos(p)) * 0.3 : Math.sin(st.t * 1.5 + l.ph) * 0.02;
      }
      inner.position.set(Math.sin(st.t * 55) * hurt * 0.02, (mv ? Math.abs(Math.sin(ph)) * 0.012 : Math.sin(st.t * 2) * 0.004), att * (P.lunge ?? 0.22) - hurt * 0.1);
      inner.rotation.x = -att * 0.08 - hurt * 0.12;
      headPiv.rotation.x = att * 0.2 - hurt * 0.2; headPiv.rotation.y = mv ? 0 : Math.sin(st.t * 0.8) * 0.15;
      if (sting) sting.forEach((p, i) => { p.rotation.x = (i === 0 ? 0.9 : 0.42) + Math.sin(st.t * 1.6 - i * 0.5) * 0.04 + att * (i < 2 ? -0.1 : 0.22) - hurt * 0.08; p.rotation.y = Math.sin(st.t * 1.1 - i * 0.4) * 0.04; });
      for (const c of claws) { c.sh.rotation.x = -att * 0.4 + Math.sin(st.t * 1.4 + c.sx) * 0.05; c.mv.rotation.y = -c.sx * (0.35 * (0.5 + 0.5 * Math.sin(st.t * 2.5 + c.sx)) + att * 0.6) * 0.8; c.sh.rotation.y = c.sx * (0.55 - att * 0.35); }
      if (shellG) { shellG.position.y = hurt * 0.03; shellG.rotation.x = -hurt * 0.08; }
      for (const a of anim) a(dt, st);
      death(st, 0.05);
    };
  }

  else if (R.body === 'biped') {
    const legLen = P.legLen ?? 0.5, tl = P.torso ?? 0.85, gr = P.girth ?? 0.42, sw = P.shoulders ?? 0.55, al = P.armLen ?? 1.0, at = P.armThick ?? 0.15, hunch = P.hunch ?? 0.4;
    const rockS = R.flat;
    const py = legLen + 0.06;
    const jit = rockS ? 0.07 : 0;
    const torso = tube([[0, py - 0.08, -0.02], [0, py + tl * 0.45, tl * hunch * 0.15], [0, py + tl * 0.92, tl * hunch * 0.45]],
      [[0, gr * 0.78, gr * 0.62], [0.4, gr * 0.9, gr * 0.7], [0.78, gr * 1.25, gr * 0.9], [1, gr * 1.0, gr * 0.75]],
      M.skin, { up: V(0, 0, 1), rings: rockS ? 14 : 22, seg: rockS ? 10 : 18, jitter: jit, seed: R.seed, vScale: R.patternScale ?? 1, cap: [gr * 0.4, gr * 0.5] });
    inner.add(torso);
    const chestY = py + tl * 0.8, chestZ = tl * hunch * 0.36;
    const headPiv = new THREE.Group(); headPiv.position.set(0, chestY + gr * 0.3, chestZ + gr * 0.5); inner.add(headPiv);
    let headMesh;
    const hs = P.head ?? 0.2;
    if (rockS) { headMesh = rock(hs, M.skin, R.seed + 2, 0.25, 1); headMesh.scale.set(1.1, 0.85, 1); headPiv.add(headMesh); }
    else { const hd = makeHead({ len: hs * 1.6, w: hs, h: hs, snout: 0.2, ...H }); headPiv.add(hd.g); headParts(hd); }
    if (rockS) {
      const brow = rock(hs * 0.75, M.skin, R.seed + 5, 0.2, 0); brow.scale.set(1.5, 0.45, 0.8); brow.position.set(0, hs * 0.32, hs * 0.45); headPiv.add(brow);
      for (const sx of [-1, 1]) { const e = glowEye(hs * 0.16, pal.eyes, { slit: true, socket: true }); e.position.set(sx * hs * 0.38, hs * 0.1, hs * 0.82); e.rotation.z = sx * 0.25; headPiv.add(e); }
      if (pal.glow) { const m = new THREE.Mesh(new THREE.BoxGeometry(hs * 0.7, hs * 0.07, hs * 0.1), M.glow); m.position.set(0, -hs * 0.35, hs * 0.85); headPiv.add(m); }
    }
    // shoulders, arms, fists
    const arms = [];
    for (const sx of [-1, 1]) {
      const sp = new THREE.Group(); sp.position.set(sx * sw, chestY, chestZ); inner.add(sp);
      const pad = rockS ? rock(gr * 0.5, M.skin, R.seed + 10 + sx, 0.16, 1) : ell(gr * 0.5, gr * 0.42, gr * 0.5, M.skin);
      pad.position.set(-sx * 0.02, 0.04, 0); pad.scale.set(1.05, 0.8, 1); sp.add(pad);
      const ua = al * 0.45, fa = al * 0.42;
      sp.add(tube([[0, 0.05, 0], [sx * 0.05, -ua * 0.5, 0.0], [sx * 0.07, -ua, 0.03]], [[0, at * 1.35], [0.5, at * 1.15], [1, at * 1.0]], M.limb, { up: V(0, 0, 1), rings: rockS ? 11 : 14, seg: rockS ? 9 : 14, jitter: jit, seed: R.seed + 20 + sx }));
      const el = new THREE.Group(); el.position.set(sx * 0.07, -ua, 0.03); sp.add(el);
      el.add(tube([[0, at * 0.6, 0], [0, -fa * 0.5, 0.04], [0, -fa, 0.06]], [[0, at * 1.05], [0.6, at * 1.3], [1, at * 1.35]], M.limb, { up: V(0, 0, 1), rings: rockS ? 11 : 14, seg: rockS ? 9 : 14, jitter: jit, seed: R.seed + 30 + sx }));
      const fist = rockS ? rock(P.fist ?? 0.22, M.limb, R.seed + 40 + sx, 0.28, 1) : ell(P.fist ?? 0.18, P.fist ?? 0.18, P.fist ?? 0.18, M.limb);
      fist.position.set(0, -fa - (P.fist ?? 0.22) * 0.6, 0.08); fist.scale.set(1, 0.9, 1.1); el.add(fist);
      arms.push({ sp, el, sx });
    }
    const legs = [];
    for (const sx of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(sx * gr * 0.5, py, 0); inner.add(hp);
      hp.add(tube([[0, 0.12, 0], [0, -legLen * 0.5, 0.02], [0, -legLen + 0.08, 0.02]], [[0, gr * 0.46], [1, gr * 0.36]], M.limb, { up: V(0, 0, 1), rings: rockS ? 10 : 12, seg: rockS ? 9 : 14, jitter: jit, seed: R.seed + 50 + sx }));
      const foot = rockS ? rock(gr * 0.4, M.limb, R.seed + 60 + sx, 0.2, 1) : ell(gr * 0.35, gr * 0.2, gr * 0.45, M.limb);
      foot.position.set(0, -legLen + 0.1, 0.08); foot.scale.set(1.05, 0.55, 1.3); hp.add(foot);
      legs.push({ hp, sx });
    }
    if (has('core') && pal.glow) {
      // a molten heart showing through a split in the chest
      const cs = onTube(torso, 0.62, 0, 0.93);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(gr * 0.17, 0), M.glow); core.position.copy(cs.p); core.scale.set(1, 1.3, 0.6); inner.add(core);
      for (const sx of [-1, 1]) { const lip = rock(gr * 0.16, M.skin, R.seed + 80 + sx, 0.2, 0); lip.position.copy(cs.p).add(V(sx * gr * 0.17, 0, 0.0)); lip.scale.set(0.7, 1.5, 0.7); inner.add(lip); }
      const gl = glowSprite(pal.glow, gr * 1.6, 0.6); gl.position.copy(core.position).add(V(0, 0, 0.05)); inner.add(gl); lights.push({ obj: gl, color: pal.glow, k: 1.5 });
      anim.push((dt, st) => { core.rotation.y = st.t * 1.5; gl.material.opacity = 0.6 + Math.sin(st.t * 3) * 0.15 + (st._att || 0) * 0.3; });
    }
    if (has('crystals')) {
      // glassy slag spikes: black glass, a glowing root, a hot rim
      const cm = mat({ color: pal.crystal || '#1a1418', rough: 0.12, metal: 0.5, glow: pal.glow, glowMap: (() => { const t = tipTex.clone(); t.flipY = false; t.needsUpdate = true; return t; })(), glowK: 1.6, rim: pal.glow || '#ffffff', rimK: 0.55, flat: true });
      const spots = [[sw * 0.95, chestY + gr * 0.3, chestZ - 0.02], [-sw * 0.95, chestY + gr * 0.3, chestZ - 0.02], [0.16, chestY + gr * 0.2, chestZ - gr * 0.55], [-0.14, chestY - gr * 0.15, chestZ - gr * 0.62], [0, chestY + gr * 0.45, chestZ - gr * 0.25]];
      spots.forEach(([x, yy, z], i) => {
        const c = new THREE.Group(); c.position.set(x, yy, z); inner.add(c);
        for (let k = 0; k < 4; k++) { const h = 0.14 + hash(i, k) * 0.22; const g = new THREE.CylinderGeometry(0.004, 0.045 + hash(k, i) * 0.03, h, 5, 1); g.translate(0, h / 2, 0); const m = new THREE.Mesh(g, cm); m.rotation.set((hash(i, k, 2) - 0.5) * 1.3 - (z < chestZ ? 0.6 : 0), hash(i, k, 5) * 3, (hash(i, k, 3) - 0.5) * 1.3 - Math.sign(x) * 0.5); m.castShadow = true; c.add(m); }
      });
    }
    if (has('embers')) embers(inner, { n: 12, w: sw * 2, y0: chestY, h: 1.0, zc: chestZ });
    const box = new THREE.Box3().setFromObject(inner); height = box.max.y;
    let ph = 0;
    update = (dt, st) => {
      const mv = st.moving && st.deadT == null;
      ph += dt * (mv ? clamp(2.5 + (st.speed || 1.5) * 1.2, 2.5, 7) : 0);
      const att = strike(st.t, st.attackT, 0.7, 0.55), hurt = pulse(st.t, st.hurtT, 0.35);
      st._att = att;
      // slam: both arms up over the head, then down
      const k = st.attackT == null ? 1 : (st.t - st.attackT) / 0.7;
      const raise = k >= 0 && k < 0.55 ? ease(k / 0.55) : 0, slam = k >= 0.55 && k < 1 ? 1 - ease((k - 0.55) / 0.45) : 0;
      for (const l of legs) l.hp.rotation.x = mv ? Math.sin(ph + (l.sx > 0 ? Math.PI : 0)) * 0.38 : 0;
      for (const a of arms) {
        a.sp.rotation.x = (mv ? Math.sin(ph + (a.sx > 0 ? 0 : Math.PI)) * 0.28 : Math.sin(st.t * 1.2 + a.sx) * 0.04) - raise * 2.7 - slam * 1.0 + hurt * 0.3;
        a.sp.rotation.z = a.sx * (0.12 + hurt * 0.25) - a.sx * raise * 0.2;
        a.el.rotation.x = -0.25 - raise * 0.4 - slam * 0.1;
      }
      inner.rotation.x = -raise * 0.12 + slam * 0.3 - hurt * 0.12;
      inner.rotation.z = mv ? Math.sin(ph) * 0.06 : 0;
      inner.position.set(Math.sin(st.t * 50) * hurt * 0.03, (mv ? Math.abs(Math.cos(ph)) * 0.04 : Math.sin(st.t * 1.5) * 0.008) - slam * 0.06, slam * 0.15 - hurt * 0.1);
      headPiv.rotation.y = mv ? 0 : Math.sin(st.t * 0.5) * 0.3;
      for (const a of anim) a(dt, st);
      death(st, 0.4);
    };
  }

  else if (R.body === 'serpent') {
    const len = P.length ?? 2.0, gr = P.girth ?? 0.13, n = 46, riseH = P.rise ?? 0.5, wave = P.wave ?? 'side', amp = P.amp ?? 0.16, waves = P.waves ?? 1.4;
    const prof = keysFn(P.profile || [[0, 0.12], [0.15, 0.55], [0.55, 1], [0.85, 0.92], [1, 0.82]]);
    const cs = [], rx = [], ry = [];
    for (let i = 0; i < n; i++) { cs.push(V()); const s = i / (n - 1); let k = prof(s, 1); if (s > 0.97) k *= Math.sqrt(Math.max(0.05, 1 - ((s - 0.97) / 0.03) ** 2)); rx.push(gr * k * (P.flatW ?? 1)); ry.push(gr * k); }
    let att = 0, hurt = 0, tt = 0, mvK = 0;
    const spineAt = (s, out) => {
      const rs = ease((s - (P.riseFrom ?? 0.55)) / (1 - (P.riseFrom ?? 0.55)));
      let z = (s - 0.65) * len, y = gr * 0.95 + rs * riseH, x = 0;
      const env = Math.sin(Math.PI * clamp(s * 1.05)) ** 0.6 * (1 - 0.75 * rs);
      const w = Math.sin(TAU * waves * s - tt * (mvK ? 5.5 : 1.6));
      if (wave === 'side') x = amp * (0.4 + 0.6 * mvK) * env * w;
      else { const hump = Math.max(0, Math.sin(TAU * waves * s - tt * (mvK ? 4 : 1.2))); y += amp * (0.25 + 0.75 * mvK) * env * hump * hump; z -= amp * 0.3 * env * hump; }
      // strike: the front throws forward and down; flinch: it coils back
      z += (att * (P.lunge ?? 0.45) - hurt * 0.18) * rs;
      y += (-att * riseH * 0.4 + hurt * 0.08) * rs;
      return out.set(x, y, z);
    };
    const body = loftMesh(cs.map((c, i) => spineAt(i / (n - 1), c.clone())), rx, ry, M.skin, { seg: 18, flatBottom: P.belly ?? 0.75, vScale: R.patternScale ?? 1 });
    inner.add(body);
    const head = new THREE.Group(); inner.add(head);
    let hd = null;
    if (H.sucker) {
      // a round mouth ringed with teeth, eyes on top
      const lip = new THREE.Mesh(new THREE.TorusGeometry(gr * 0.62, gr * 0.2, 10, 22), M.limb); lip.castShadow = true; head.add(lip);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(gr * 0.62, 22), M.mouth); hole.position.z = -0.005; head.add(hole);
      const tg = new THREE.ConeGeometry(1, 1, 4);
      for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; const t = new THREE.Mesh(tg, M.tooth); t.scale.set(0.012, 0.045, 0.012); t.position.set(Math.cos(a) * gr * 0.5, Math.sin(a) * gr * 0.5, 0.005); t.rotation.z = a + Math.PI / 2; head.add(t); }
      for (const sx of [-1, 1]) { const e = glowEye(gr * 0.13, pal.eyes, { socket: true }); e.position.set(sx * gr * 0.4, gr * 0.82, -gr * 0.35); e.rotation.x = -0.5; head.add(e); }
      head.userData.back = 0.0;
    } else {
      hd = makeHead({ len: 0.36, w: gr * 1.05, h: gr * 0.95, snout: 0.6, snoutW: 0.75, eyesFront: 0.35, ...H });
      hd.g.position.z = -gr * 0.6; head.add(hd.g); headParts(hd);
    }
    // dorsal fin: a ribbon over the spine, rebuilt with the body
    let fin = null, finPos = null;
    const finFrom = 0.08, finTo = P.finTo ?? 0.86, fn = 30;
    if (has('fins')) {
      finPos = new Float32Array(fn * 2 * 3);
      const uvs = new Float32Array(fn * 2 * 2), idx = [];
      for (let i = 0; i < fn; i++) { uvs.set([i / (fn - 1), 0, i / (fn - 1), 1], i * 4); if (i < fn - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(finPos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx);
      const ft = canvasTex('fin' + pal.accent, 128, 64, (c, w, h) => {
        const gr2 = c.createLinearGradient(0, 0, 0, h); gr2.addColorStop(0, rgba(shade(pal.base, -0.2), 1)); gr2.addColorStop(0.6, rgba(pal.accent, 0.9)); gr2.addColorStop(1, rgba(shade(pal.accent, 0.3), 0.5));
        c.fillStyle = gr2; c.fillRect(0, 0, w, h);
        c.strokeStyle = rgba(shade(pal.base, -0.4), 0.8); c.lineWidth = 1.5; for (let x = 2; x < w; x += 6) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 3, h); c.stroke(); }
        c.globalCompositeOperation = 'destination-out'; for (let x = 0; x < w; x += 6) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 3, h - 6 - (x % 12)); c.lineTo(x + 6, h); c.fill(); }
      }, false);
      fin = new THREE.Mesh(g, mat({ map: ft, side: THREE.DoubleSide, rough: 0.5, alphaTest: 0.3, rim: pal.accent, rimK: 0.4, glow: R.glowSpots ? pal.glow : null, glowK: 0.15 }));
      fin.castShadow = true; inner.add(fin);
    }
    const fins2 = [];
    if (has('fins')) for (const sx of [-1, 1]) {
      const pf = new THREE.Group(); head.add(pf);
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(sx * 0.12, -0.02, sx * 0.16, -0.12); sh.quadraticCurveTo(sx * 0.06, -0.06, 0, -0.08);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 6).rotateX(-Math.PI / 2), fin.material); pf.add(m);
      pf.position.set(sx * gr * 0.85, -gr * 0.3, -gr * 1.3); fins2.push({ pf, sx });
    }
    const T = V(), tmp = V(), tmp2 = V();
    const lay = (st) => {
      tt = st.t; mvK = st.moving && st.deadT == null ? 1 : 0;
      for (let i = 0; i < n; i++) spineAt(i / (n - 1), cs[i]);
      body.userData.reloft(cs);
      // head on the last ring, facing along the spine
      T.subVectors(cs[n - 1], cs[n - 3]).normalize();
      head.position.copy(cs[n - 1]).addScaledVector(T, H.sucker ? gr * 0.05 : gr * 0.25);
      head.rotation.set(-Math.asin(clamp(T.y, -1, 1)) + (H.sucker ? 0 : (H.pitch ?? 0.1)), Math.atan2(T.x, T.z), 0, 'YXZ');
      if (fin) {
        for (let i = 0; i < fn; i++) {
          const s = lerp(finFrom, finTo, i / (fn - 1)), fi = s * (n - 1), i0 = Math.floor(fi), k = fi - i0;
          tmp.copy(cs[i0]).lerp(cs[Math.min(n - 1, i0 + 1)], k);
          const r = lerp(ry[i0], ry[Math.min(n - 1, i0 + 1)], k);
          const fh = (P.finH ?? 0.12) * Math.sin(Math.PI * (i / (fn - 1))) ** 0.7;
          tmp2.set(0, 1, 0);
          finPos.set([tmp.x, tmp.y + r * 0.8, tmp.z, tmp.x, tmp.y + r * 0.8 + fh, tmp.z - fh * 0.3], i * 6);
        }
        fin.geometry.attributes.position.needsUpdate = true; fin.geometry.computeVertexNormals(); fin.geometry.computeBoundingSphere();
      }
      for (const f of fins2) f.pf.rotation.z = f.sx * Math.sin(st.t * 6) * 0.25;
    };
    lay({ t: 0 });
    const box = new THREE.Box3().setFromObject(inner); height = box.max.y;
    update = (dt, st) => {
      att = strike(st.t, st.attackT, 0.5, 0.35); hurt = pulse(st.t, st.hurtT, 0.32);
      st._att = att;
      lay(st);
      if (hd && hd.jaw) hd.jaw.rotation.x = att * 0.9 + hurt * 0.3 + Math.max(0, Math.sin(st.t * 0.9)) * 0.08;
      if (H.sucker) head.scale.setScalar(1 + att * 0.25 + Math.sin(st.t * 4) * 0.03);
      inner.position.x = Math.sin(st.t * 55) * hurt * 0.02;
      for (const a of anim) a(dt, st);
      death(st, 0.05);
    };
  }

  else if (R.body === 'flyer') {
    const bl = P.body ?? 0.36, gr = P.girth ?? 0.12, span = P.span ?? 0.75, hover = P.hover ?? 1.1;
    const fly = new THREE.Group(); inner.add(fly);
    const body = tube([[0, -0.02, -bl * 0.5], [0, 0, 0], [0, 0.05, bl * 0.45]], [[0, gr * 0.45, gr * 0.4], [0.4, gr * 0.95, gr * 1.0], [0.75, gr * 1.0, gr * 1.05], [1, gr * 0.7, gr * 0.75]], M.skin, { flatBottom: 0.95, rings: 22, seg: 18, vScale: 0.6 });
    fly.add(body);
    const headPiv = new THREE.Group(); headPiv.position.set(0, gr * 0.75, bl * 0.45); fly.add(headPiv);
    const hd = makeHead({ len: 0.2, w: gr * 0.75, h: gr * 0.72, beak: true, snout: 0.1, snoutW: 0.9, eyesFront: 0.4, eye: gr * 0.17, eyeY: 0.3, eyeZ: 0.5, ...H });
    hd.g.position.z = -gr * 0.2; headPiv.add(hd.g); headParts(hd);
    // feathers: a tapered leaf, length along -z, with a painted shaft and ragged tip (alpha tested)
    const ftex = canvasTex('feather' + pal.base + pal.accent, 64, 256, (g, w, h) => {
      const gr2 = g.createLinearGradient(0, 0, 0, h); gr2.addColorStop(0, shade(pal.base, -0.1)); gr2.addColorStop(0.7, pal.base); gr2.addColorStop(1, mix(pal.base, pal.accent, 0.55));
      g.fillStyle = gr2; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) { g.strokeStyle = `rgba(255,255,255,${0.04 + hash(y) * 0.06})`; g.beginPath(); g.moveTo(w / 2, y); g.lineTo(0, y + 12); g.moveTo(w / 2, y); g.lineTo(w, y + 12); g.stroke(); }
      g.fillStyle = rgba(shade(pal.base, 0.35), 0.8); g.fillRect(w / 2 - 1.5, 0, 3, h);
      g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 5; k++) { const y = h * (0.55 + hash(k, 3) * 0.4), sx = hash(k) < 0.5 ? 0 : w; g.beginPath(); g.moveTo(sx, y); g.lineTo(w / 2 + (sx ? 8 : -8), y + 10); g.lineTo(sx, y + 16); g.fill(); }
    }, false);
    const fm = mat({ map: ftex, side: THREE.DoubleSide, rough: 0.7, alphaTest: 0.5, rim: pal.accent, rimK: 0.25 });
    const featherGeo = (L, W) => {
      const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(W * 0.6, L * 0.2, W * 0.5, L * 0.75); s.quadraticCurveTo(W * 0.3, L * 1.0, 0, L); s.quadraticCurveTo(-W * 0.3, L * 1.0, -W * 0.5, L * 0.75); s.quadraticCurveTo(-W * 0.6, L * 0.2, 0, 0);
      const g = new THREE.ShapeGeometry(s, 8); const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W + 0.5, p.getY(i) / L);
      // a slight curl
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i); p.setZ(i, (y / L) ** 2 * L * 0.12 - Math.abs(x) * 0.15); }
      g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g;
    };
    const wings = [];
    const wk = kind('wings') || 'feather';
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * gr * 0.7, gr * 0.45, bl * 0.12); fly.add(sh);
      const a1 = span * 0.45, a2 = span * 0.55;
      sh.add(tube([[0, 0, 0], [sx * a1 * 0.5, 0.02, 0.02], [sx * a1, 0, 0]], [[0, gr * 0.42, gr * 0.3], [1, gr * 0.2, gr * 0.14]], M.skin, { rings: 12, seg: 10, vScale: 0.3 }));
      const el = new THREE.Group(); el.position.set(sx * a1, 0, 0); sh.add(el);
      el.add(tube([[0, 0, 0], [sx * a2 * 0.6, 0, -0.02], [sx * a2 * 0.85, 0, -0.05]], [[0, gr * 0.2, gr * 0.14], [1, gr * 0.07]], M.skin, { rings: 10, seg: 8, vScale: 0.3 }));
      if (wk === 'feather' || wk === 'ragged') {
        for (let i = 0; i < 6; i++) { const L = 0.2 + i * 0.012, f = new THREE.Mesh(featherGeo(L, 0.1), fm); f.position.set(sx * (0.03 + i * a1 / 6.5), -0.004, 0.02); f.rotation.y = sx * (0.06 + i * 0.03); sh.add(f); f.castShadow = true; }
        for (let i = 0; i < 7; i++) { const L = (0.28 + i * 0.03) * (wk === 'ragged' && i % 2 ? 0.85 : 1), f = new THREE.Mesh(featherGeo(L, 0.095), fm); f.position.set(sx * (0.01 + i * a2 * 0.13), -0.004 - i * 0.002, -0.01); f.rotation.y = sx * (0.25 + i * 0.2); el.add(f); f.castShadow = true; }
        // coverts over the roots
        for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(featherGeo(0.11, 0.07), fm); f.position.set(sx * (0.03 + i * a1 / 5), 0.012, 0.03); f.rotation.y = sx * 0.12; sh.add(f); }
      } else {
        const s = new THREE.Shape(); s.moveTo(0, 0.02); s.lineTo(sx * (a1 + a2 * 0.85), 0.05);
        for (let k = 3; k >= 0; k--) { const x = sx * (k / 3) * (a1 + a2 * 0.8); s.quadraticCurveTo(x + sx * 0.06, -0.18, x, -0.26 + (k % 2) * 0.05); }
        const g = new THREE.ShapeGeometry(s, 6).rotateX(Math.PI / 2); const mem = new THREE.Mesh(g, mat({ color: pal.accent, side: THREE.DoubleSide, rough: 0.8 })); mem.castShadow = true; sh.add(mem);
      }
      wings.push({ sh, el, sx });
    }
    // tail fan
    const tailG = new THREE.Group(); tailG.position.set(0, 0.0, -bl * 0.45); fly.add(tailG);
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(featherGeo(0.24 + (i === 2 ? 0.06 : 0), 0.07), fm); f.rotation.y = (i - 2) * 0.2; f.position.x = (i - 2) * 0.015; tailG.add(f); f.castShadow = true; }
    tailG.rotation.x = 0.15;
    // legs and talons
    const talons = [];
    for (const sx of [-1, 1]) {
      const lg = new THREE.Group(); lg.position.set(sx * gr * 0.35, -gr * 0.7, 0.0); fly.add(lg);
      lg.add(tube([[0, 0, 0], [0, -0.06, -0.02], [0, -0.11, 0.0]], [[0, 0.014], [1, 0.011]], M.horn, { rings: 8, seg: 6 }));
      for (let k = -1; k <= 1; k++) lg.add(spike([[0, -0.11, 0], [k * 0.02, -0.12, 0.03], [k * 0.03, -0.14, 0.04]], 0.008, M.dark, { rings: 6, seg: 5 }));
      talons.push(lg);
    }
    const ruff = has('ruff');
    if (ruff) for (let i = 0; i < 8; i++) { const f = new THREE.Mesh(featherGeo(0.1, 0.06), fm); f.position.set(Math.sin((i / 7 - 0.5) * 2.6) * gr * 0.85, gr * 0.55 + Math.cos((i / 7 - 0.5) * 2.6) * gr * 0.3, bl * 0.36); f.rotation.set(-0.5, (i / 7 - 0.5) * 2.6, 0); fly.add(f); }
    fly.position.y = hover; fly.rotation.x = -0.12;
    const box = new THREE.Box3().setFromObject(inner); height = box.max.y;
    let ph = 0;
    update = (dt, st) => {
      const alive = st.deadT == null;
      ph += dt * (st.moving ? 13 : 8);
      const att = strike(st.t, st.attackT, 0.5, 0.45), hurt = pulse(st.t, st.hurtT, 0.3);
      st._att = att;
      const flap = Math.sin(ph);
      for (const w of wings) {
        w.sh.rotation.z = w.sx * (alive ? flap * 0.75 + 0.1 : -0.3) * (1 - att * 0.6) + w.sx * att * 0.6;
        w.sh.rotation.y = w.sx * (-att * 0.6 + hurt * 0.3);
        w.el.rotation.z = w.sx * (alive ? Math.sin(ph - 0.9) * 0.4 - 0.05 : -0.4);
      }
      fly.position.set(Math.sin(st.t * 50) * hurt * 0.03, alive ? hover + Math.sin(ph) * -0.04 + Math.sin(st.t * 1.3) * 0.05 - att * 0.35 : Math.max(0.1, hover - (st.t - st.deadT) * 3), att * 0.45 - hurt * 0.15);
      fly.rotation.x = -0.12 + att * 0.55 - hurt * 0.3 + (st.moving ? 0.15 : 0);
      for (const t of talons) t.rotation.x = -att * 1.2 - 0.2;
      headPiv.rotation.x = att * 0.3 - hurt * 0.3 + Math.sin(st.t * 1.7) * 0.06;
      headPiv.rotation.y = Math.sin(st.t * 0.7) * 0.3 * (1 - att);
      if (hd.jaw) hd.jaw.rotation.x = att * 0.6 + hurt * 0.4;
      tailG.rotation.x = 0.15 + Math.sin(ph * 0.5) * 0.08 - att * 0.3;
      for (const a of anim) a(dt, st);
      if (!alive) o.rotation.z = Math.min(1.5, (st.t - st.deadT) * 3); else o.rotation.z = 0;
    };
  }

  else {   // blob
    const s = P.radius ?? 0.5;
    const prof = [[0, 0], [0.92, 0.02], [1, 0.12], [0.98, 0.35], [0.85, 0.6], [0.6, 0.82], [0.3, 0.96], [0.05, 1.02], [0, 1.03]];
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * s, y * s * (P.tall ?? 1.2))), 28); g.computeVertexNormals();
    const bm = mat({ map: S1.map, rough: 0.25, glow: S1.glow ? pal.glow : null, glowMap: S1.glow, glowK: 2 });
    const body = new THREE.Mesh(g, bm); body.castShadow = true; inner.add(body);
    for (const sx of [-1, 1]) { const e = glowEye(s * 0.12, pal.eyes); e.position.set(sx * s * 0.3, s * 0.7, s * 0.72); inner.add(e); }
    const box = new THREE.Box3().setFromObject(inner); height = box.max.y;
    update = (dt, st) => {
      const att = strike(st.t, st.attackT, 0.45), hurt = pulse(st.t, st.hurtT, 0.3);
      const sq = 1 + Math.sin(st.t * (st.moving ? 9 : 3)) * 0.06 + att * 0.2 - hurt * 0.2;
      inner.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); inner.position.z = att * 0.3 - hurt * 0.1;
      death(st, 0);
    };
  }

  function death(st, sink) {
    if (st.deadT == null) { o.rotation.z = 0; o.position.y = 0; return; }
    const k = ease((st.t - st.deadT) / 0.6); o.rotation.z = k * 1.35; o.position.y = -k * sink;
  }

  const size = R.size || 1;
  o.scale.setScalar(size);
  o.traverse((m) => { if (m.isSprite) m.castShadow = false; });
  return {
    o, height: height * size, mats, lights, recipe: R,
    update(dt, st) { const s = { ...st }; update(dt, s); flash.value = pulse(st.t, st.hurtT, 0.3) * 0.6; },
  };
}

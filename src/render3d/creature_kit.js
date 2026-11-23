// Creature kit: one call builds a whole foe from a short recipe (src/render3d/creature_recipes.js holds one per foe).
// Scott approved the look 2026-11-23 from three stills (tools/art/creature_kit, qa/out/creature_kit).
//
//   import { buildCreature } from './creature_kit.js';
//   const c = buildCreature(THREE, recipe);   // c.o (root, faces +z), c.height (m), c.update(dt, st), c.mats, c.lights
//   st: { t, moving, speed, attackT, hurtT, deadT, cast }   (the same state src/render3d/creatures.js bodies take)
//
// A recipe is plain data: { id, body, size, proportions, head, parts, palette, pattern, seed, ghost }. Bodies:
// quadruped, insect, biped (rock golems), humanoid (people and ghosts), serpent, flyer (birds, and insects with
// P.insect), blob, lantern, book, vortex. Every shape is a loft (an elliptical tube along a smooth spine) or a lumpy
// rock; skins are painted on canvas; a rim light and a hurt rim flash are patched into the standard material.
//
// Cheap at run time: the build makes a tree of pivots (Object3D) for the animation, then rig() finds which pivots
// move, and merges every mesh into ONE rigidly skinned mesh per material whose bones are those pivots. A foe costs
// about one draw call per material (8 to 14) plus its glow sprites, however many horns, feathers and teeth it has. The
// merged geometry and every canvas texture are cached by recipe id and shared by every foe of that recipe. A serpent
// bends by moving one bone per ring of its body (no per-frame mesh rebuild).

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

// ---------- shared caches (every foe of a recipe shares these) ----------
const TEX = new Map();      // canvas textures by key
const GEO = new Map();      // recipe id -> { geos (merged skinned geometries, in material order), refs, used }
const GEO_KEEP = 40;       // recipes kept when no foe of them is out (the least recently used beyond this are freed)
let geoClock = 0;
const RIG_SAMPLES = [
  { t: 0.37 }, { t: 0.93, moving: true, speed: 2.5 }, { t: 1.27, moving: true, speed: 4.2 }, { t: 1.61, moving: true, speed: 1.2 },
  { t: 2.05, attackT: 1.8 }, { t: 2.31, attackT: 1.8 }, { t: 2.52, attackT: 1.8 }, { t: 2.0, hurtT: 1.9 }, { t: 2.7, cast: true },
  { t: 3.33, deadT: 2.9 }, { t: 4.13, moving: true, speed: 1.6, attackT: 3.9, hurtT: 4.0 }, { t: 5.71 },
];
/** How many recipes have built geometry so far (dev counters). */
export const kitStats = () => ({ textures: TEX.size, recipes: GEO.size });

export function buildCreature(THREE, recipe) {
  const R = { size: 1, proportions: {}, head: {}, parts: [], pattern: 'none', seed: 1, ...recipe };
  R.palette = { base: '#7a6a58', belly: '#c8b89a', accent: '#e8dcc0', eyes: '#ffb347', glow: null, dark: '#1a1412', ...(recipe.palette || {}) };
  const pal = R.palette;
  const has = (p) => R.parts.some((x) => x === p || x.startsWith(p + ':'));
  const kind = (p) => { const x = R.parts.find((y) => y === p || y.startsWith(p + ':')); return x && x.includes(':') ? x.split(':')[1] : x ? 'default' : null; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------- canvas textures (module cache) ----------
  function canvasTex(key, w, h, paint, wrap = true) {
    const k = key + '@' + w + 'x' + h + (wrap ? 'w' : '');
    if (TEX.has(k)) return TEX.get(k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    TEX.set(k, t); return t;
  }
  const radialTex = () => canvasTex('radial', 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }, false);
  // square skins tile both ways: draw each mark at all nine offsets so neither seam shows
  let G = null;
  const wrapDraw = (w, fn) => { for (const ox of [-w, 0, w]) for (const oy of [-w, 0, w]) { G.save(); G.translate(ox, oy); fn(0); G.restore(); } };

  // A skin: x runs around the body (0 = spine top, 0.5 = belly), y runs along it. Returns { map, glow }.
  function skin(name, { base = pal.base, belly = pal.belly, pattern = 'none', fur = false, glowPat = null, seed = R.seed, patternColor = null, res = 256 } = {}) {
    const key = ['skin', name, base, belly, pattern, fur, glowPat, seed, patternColor].join('|');
    const W = 256, H = 256, k2 = res / 256;   // paint in 256 units, store at res
    const r = rng(seed * 31 + name.length * 7);
    const pc = patternColor || shade(base, -0.45);
    const marks = [];   // crack paths reused for the glow map
    const map = canvasTex(key, res, res, (g) => {
      G = g; g.scale(k2, k2);
      const back = shade(base, -0.18);
      const gr = g.createLinearGradient(0, 0, W, 0);
      [[0, back], [0.2, base], [0.36, mix(base, belly, 0.45)], [0.5, belly], [0.64, mix(base, belly, 0.45)], [0.8, base], [1, back]].forEach(([k, c]) => gr.addColorStop(k, c));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const backMask = (x) => { const u = ((x / W) % 1 + 1) % 1; const d = Math.min(u, 1 - u); return clamp(1 - d / 0.3); };
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
          g.fillStyle = rgba(pc, 0.85);
          wrapDraw(W, (ox) => { g.beginPath(); g.ellipse(ox + x, y, rr, rr * 0.8, r() * 3, 0, TAU); g.fill(); });
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
      } else if (pattern === 'script') {
        // lines of handwriting (paper and ink foes)
        g.strokeStyle = rgba(pc, 0.7); g.lineWidth = 1.4;
        for (let y = 8; y < H; y += 11) { let x = r() * 10; g.beginPath(); while (x < W) { const n = 6 + r() * 16; g.moveTo(x, y); for (let i = 0; i < n; i += 2) g.lineTo(x + i, y + Math.sin(i * 1.7 + x) * 2.2); x += n + 4 + r() * 6; } g.stroke(); }
      } else if (pattern === 'wool') {
        for (let i = 0; i < 420; i++) { const x = r() * W, y = r() * H, rr = 3 + r() * 5; g.strokeStyle = rgba(r() < 0.5 ? shade(base, 0.25) : shade(base, -0.25), 0.45); g.lineWidth = 1.6; wrapDraw(W, (ox) => { g.beginPath(); g.arc(ox + x, y, rr, r() * 3, r() * 3 + 4); g.stroke(); }); }
      }
      // hand-painted brush strokes over everything (fur: long strokes along the body)
      const nStroke = fur ? 1600 : 700;
      for (let i = 0; i < nStroke; i++) {
        const x = r() * W, y = r() * H, len = fur ? 5 + r() * 9 : 2 + r() * 5;
        const light = r() < 0.5;
        g.strokeStyle = light ? `rgba(255,248,230,${fur ? 0.07 : 0.06})` : `rgba(10,6,4,${fur ? 0.09 : 0.07})`;
        g.lineWidth = fur ? 1.4 : 2.2;
        const dx = fur ? (r() - 0.5) * 2 : len, dy = fur ? len : (r() - 0.5) * 2;
        if (x > 12 && x < W - 12 && y > 12 && y < H - 12) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke(); }
        else wrapDraw(W, () => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke(); });
      }
    });
    let glow = null;
    if (glowPat) {
      glow = canvasTex(key + '|glow', res, res, (g) => {
        G = g; g.scale(k2, k2);
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        g.shadowColor = '#fff'; g.shadowBlur = 8;
        if (glowPat === 'cracks') {
          g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineJoin = 'round';
          for (const pts of marks) wrapDraw(W, (ox) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(ox + x, y) : g.moveTo(ox + x, y))); g.stroke(); });
        } else if (glowPat === 'spots') {
          const r2 = rng(seed * 7 + 3);
          for (let i = 0; i < 26; i++) {
            const side = i % 2 ? 0.27 : 0.73, x = (side + (r2() - 0.5) * 0.05) * W, y = (i / 26) * H + r2() * 4, rr = 2.5 + r2() * 2.5;
            g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
          }
        } else if (glowPat === 'script') {
          const r2 = rng(seed * 5 + 1); g.strokeStyle = '#fff'; g.lineWidth = 1.3;
          for (let y = 8; y < H; y += 22) { let x = r2() * 30; g.beginPath(); while (x < W) { const n = 6 + r2() * 14; g.moveTo(x, y); for (let i = 0; i < n; i += 2) g.lineTo(x + i, y + Math.sin(i * 1.7 + x) * 2.2); x += n + 10 + r2() * 20; } g.stroke(); }
        }
      });
    }
    return { map, glow };
  }
  /** Cloth for coats, robes and cloaks: a weave, wear at the hem, a torn edge (alpha tested) when ragged. */
  function clothTex(color, ragged = 0, trim = null) {
    return canvasTex(['cloth', color, ragged, trim].join('|'), 128, 256, (g, w, h) => {
      const r = rng(hash(ragged * 7, w) * 9999 + 3);
      // the canvas top is the hem (v = 1 down a robe, a cloak, a tunic): worn darker there, the trim and the tears
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, shade(color, -0.25)); gr.addColorStop(0.25, color); gr.addColorStop(1, shade(color, 0.06));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`; g.fillRect(0, y, w, 1); }
      for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`; g.fillRect(x, 0, 1, h); }
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,240,220'},0.06)`; g.fillRect(r() * w, r() * h, 2 + r() * 6, 8 + r() * 30); }
      // folds: long soft vertical shading
      for (let i = 0; i < 7; i++) { const x = (i + 0.5) * w / 7 + (r() - 0.5) * 6; const fg = g.createLinearGradient(x - 8, 0, x + 8, 0); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, 'rgba(0,0,0,0.14)'); fg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fg; g.fillRect(x - 8, 0, 16, h); }
      if (trim) { g.fillStyle = trim; g.fillRect(0, 7, w, 7); g.fillStyle = rgba(trim, 0.5); g.fillRect(0, 18, w, 2); }
      if (ragged) {
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
        for (let x = 0; x < w; x += 4) { const d = 4 + r() * ragged * 60; g.fillRect(x, 0, 4, d); }
        g.globalCompositeOperation = 'source-over';
      }
    });
  }
  /** A written page (wraiths, tomes, the Archivore): torn outline, foxing, lines of hand. */
  function pageTex(paper, ink) {
    return canvasTex(['page', paper, ink].join('|'), 96, 160, (g, w, h) => {
      const r = rng(37);
      g.beginPath(); g.moveTo(4, 4);
      for (let x = 8; x < w; x += 8) g.lineTo(x, r() * 6);
      for (let y = 8; y < h - 8; y += 10) g.lineTo(w - r() * 7, y);
      for (let x = w - 6; x > 0; x -= 7) g.lineTo(x, h - r() * 26 * (r() < 0.6 ? 1 : 0.3));
      for (let y = h - 10; y > 6; y -= 10) g.lineTo(r() * 7, y);
      g.closePath(); g.fillStyle = paper; g.fill();
      g.save(); g.clip();
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,70,40,${0.03 + r() * 0.06})`; g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 11, 0, TAU); g.fill(); }
      g.strokeStyle = ink; g.lineWidth = 1.3; g.globalAlpha = 0.75;
      for (let y = 16; y < h - 12; y += 9) { let x = 8 + r() * 6; g.beginPath(); g.moveTo(x, y); while (x < w - 12) { const n = 4 + r() * 9; for (let i = 0; i < n; i += 2) g.lineTo(x + i, y + Math.sin(i * 1.7 + x) * 2.2); x += n + 3 + r() * 3; g.moveTo(x, y); } g.stroke(); }
      g.globalAlpha = 1; g.restore();
    }, false);
  }

  // ---------- materials: standard + rim light + hurt rim flash ----------
  const flash = { value: 0 };
  const mats = [];
  const ghost = R.ghost || 0;
  function mat({ color = '#ffffff', map = null, rough = 0.82, metal = 0, glow = null, glowMap = null, glowK = 1.6, flat = false, rim = null, rimK = 0.5, side = THREE.FrontSide, alphaMap = null, alphaTest = 0, emissive = null, emissiveK = 1 } = {}) {
    const m = new THREE.MeshStandardMaterial({ color, map, roughness: rough, metalness: metal, flatShading: flat, side, alphaTest });
    if (alphaMap) { m.alphaMap = alphaMap; m.transparent = false; }
    if (glow) { m.emissive = new THREE.Color(glow); m.emissiveMap = glowMap; m.emissiveIntensity = glowK; }
    else if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveK; }
    else if (ghost && pal.glow) { m.emissive = new THREE.Color(pal.glow); m.emissiveIntensity = 0.12; }
    const rimC = new THREE.Color(ghost && pal.glow ? pal.glow : rim || shade(pal.base, 0.55)).multiplyScalar(ghost ? Math.max(rimK, 0.9) : rimK);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = { value: rimC }; sh.uniforms.uFlash = flash;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uFlash;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { float fr = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
            totalEmissiveRadiance += uRim * pow(fr, 2.6) + vec3(1.0, 0.55, 0.35) * uFlash * 1.5 * pow(fr, 3.5); }`);
    };
    m.customProgramCacheKey = () => 'ck_rim';
    if (ghost) { m.transparent = true; m.opacity = ghost; m.userData.baseOpacity = ghost; }
    mats.push(m);
    return m;
  }
  const basicCache = new Map();
  const basic = (color, k = 1) => {
    const key = color + k;
    if (basicCache.has(key)) return basicCache.get(key);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
    mats.push(m); basicCache.set(key, m); return m;
  };

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
  /** A loft through ring centres. rx/ry per ring. */
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
    m.userData.seg = seg;
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
  /** A tube along a smooth spine through pts, radius keys, rounded ends (cap: [start, end] in metres, 0 = open). */
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
  /** A soft lump (smooth shaded sphere pushed about): wool, manes, fleece. */
  function softLump(r, material, seed = 1, lump = 0.2) {
    const g = new THREE.SphereGeometry(r, 10, 7);
    const p = g.attributes.position, v = V();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + lump * (hash(Math.round(v.x * 997), Math.round(v.y * 997), Math.round(v.z * 997) + seed) - 0.5) * 2; p.setXYZ(i, v.x * k, v.y * k, v.z * k); }
    g.computeVertexNormals();
    return mesh(g, material);
  }
  function ell(rx, ry, rz, material, seg = 16) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.max(8, seg * 0.7 | 0)), material); m.scale.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; return m; }
  /** Bounds of the meshes under root (sprites and glows left out, so a halo does not raise the nameplate). */
  function meshBox(root) {
    root.updateMatrixWorld(true);
    const bb = new THREE.Box3(), tmp = new THREE.Box3();
    root.traverse((m) => { if (!m.isMesh || m.visible === false || m.userData.keep) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); bb.union(tmp); });
    return bb;
  }
  const mesh = (geo, material) => { const m = new THREE.Mesh(geo, material); m.castShadow = true; m.receiveShadow = true; return m; };
  const cyl = (r0, r1, h, material, seg = 10) => mesh(new THREE.CylinderGeometry(r0, r1, h, seg), material);
  const box = (x, y, z, material) => mesh(new THREE.BoxGeometry(x, y, z), material);
  /** A curved, tapering horn/claw/tusk along pts. */
  const spike = (pts, r0, material, o = {}) => tube(pts, [[0, r0], [0.6, r0 * 0.55], [1, r0 * 0.08]], material, { rings: o.rings || 12, seg: o.seg || 8, cap: [r0 * 0.6, 0.0001], vNorm: true, ...o });
  const glowSprite = (color, s, op = 0.7) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); sp.scale.setScalar(s); sp.userData.op = op; return sp; };
  function glowEye(r, color, { socket = true, slit = false, halo = true } = {}) {
    const g = new THREE.Group();
    if (socket) { const s = ell(r * 1.35, r * 1.15, r * 0.8, M.dark, 10); s.position.z = -r * 0.25; g.add(s); }
    const e = ell(slit ? r * 1.1 : r, slit ? r * 0.45 : r * 0.9, r * 0.7, basic(color, 1.6), 10); e.castShadow = false; g.add(e);
    const hl = ell(r * 0.22, r * 0.22, r * 0.2, basic('#ffffff', 1.2), 6); hl.position.set(r * 0.3, r * 0.3, r * 0.5); hl.castShadow = false; g.add(hl);
    if (halo) { const sp = glowSprite(color, r * 7, 0.55); sp.position.z = r * 0.4; g.add(sp); }
    return g;
  }

  // ---------- the creature's materials ----------
  const pat = R.pattern;
  const glowPat = pal.glow && (pat === 'cracks' ? 'cracks' : R.glowSpots ? 'spots' : R.glowScript ? 'script' : null);
  const S1 = skin('body', { pattern: pat, fur: !!R.fur, glowPat, patternColor: pal.pattern });
  const limbPat = pat === 'cracks' ? 'cracks' : pat === 'rings' || pat === 'bands' || pat === 'script' || pat === 'wool' ? pat : 'none';
  const S2 = skin('limb', { res: 128, base: pal.limb || pal.base, belly: pal.limbBelly || pal.belly, pattern: limbPat, fur: !!R.fur, glowPat: (pat === 'cracks' || pat === 'script') && pal.glow ? glowPat : null, patternColor: pal.pattern });
  const hornTex = canvasTex('horn' + pal.accent, 32, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, shade(pal.accent, -0.35)); gr.addColorStop(0.5, pal.accent); gr.addColorStop(1, shade(pal.accent, 0.35));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h * 0.7; y += 7) { g.fillStyle = 'rgba(40,28,16,0.25)'; g.fillRect(0, y, w, 2); }
  });
  const tipTex = canvasTex('tipglow', 8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#a0a0a0'); gr.addColorStop(0.7, '#000000'); gr.addColorStop(1, '#000000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
  const rootTex = canvasTex('rootglow', 8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#000000'); gr.addColorStop(0.3, '#000000'); gr.addColorStop(0.65, '#a0a0a0'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
  const rough = R.rough ?? (R.fur ? 0.92 : 0.7);
  const flat = !!R.flat;
  const M = {
    skin: mat({ map: S1.map, rough, glow: S1.glow ? pal.glow : null, glowMap: S1.glow, glowK: R.glowK ?? 2.2, flat, metal: R.metal || 0 }),
    limb: mat({ map: S2.map, rough, glow: S2.glow ? pal.glow : null, glowMap: S2.glow, glowK: R.glowK ?? 2.2, flat, metal: R.metal || 0 }),
    horn: mat({ map: hornTex, rough: 0.45, rim: pal.accent, rimK: 0.3 }),
    dark: mat({ color: pal.dark, rough: 0.6, rimK: 0.1 }),
    mouth: mat({ color: mix(pal.dark, '#8a2a2a', 0.6), rough: 0.5, rimK: 0 }),
    accent: mat({ color: pal.accent, rough: 0.6, rimK: 0.25 }),
    tooth: mat({ color: '#f2ead6', rough: 0.35, rimK: 0.2 }),
  };
  if (pal.glow) M.glow = basic(pal.glow, 1.4);
  const lazy = (k, make) => M[k] || (M[k] = make());
  const metalM = () => lazy('metal', () => mat({ color: pal.metal || '#7a7c84', rough: 0.42, metal: 0.45, rim: shade(pal.metal || '#7a7c84', 0.5), rimK: 0.5 }));
  const leatherM = () => lazy('leather', () => mat({ color: pal.leather || '#4a3424', rough: 0.75, rimK: 0.25 }));
  const woodM = () => lazy('wood', () => mat({ color: pal.wood || '#5a3e26', rough: 0.85, rimK: 0.2 }));
  const fleshM = () => lazy('flesh', () => mat({ color: pal.skin || '#c8a080', rough: 0.65, rimK: 0.35 }));

  const o = new THREE.Group(); o.name = R.name || R.id || 'creature';
  const inner = new THREE.Group(); o.add(inner);
  const P = R.proportions;
  const H = R.head;
  const anim = [];          // per-frame callbacks (dt, st) from parts
  const lights = [];

  // ---------- heads (animals) ----------
  // Built along +z from the neck joint. Returns { g, jaw, len, w, h, skullLen }.
  function makeHead(cfg) {
    const len = cfg.len || 0.4, w = cfg.w || 0.15, h = cfg.h || 0.15, sn = cfg.snout ?? 0.5, snW = cfg.snoutW ?? 0.6;
    const g = new THREE.Group();
    const beak = cfg.beak;
    const skullLen = beak ? len * 0.68 : len;
    const stop = cfg.stop ?? 0;   // a forehead step (dogs): the snout sits lower than the brow
    const upper = tube([[0, 0, 0], [0, h * (0.12 + stop * 0.25), skullLen * 0.35], [0, -h * (0.05 * sn + stop * 0.12), skullLen]],
      [[0, w * 0.8, h * 0.8], [0.3, w, h], [0.55, lerp(w, w * snW, sn), lerp(h, h * snW * 0.8, sn) * (1 - stop * 0.2)], [1, w * snW * 0.75, h * snW * 0.55]],
      M.skin, { flatBottom: cfg.jaw === false ? 0.85 : 0.45, flatTop: cfg.flatTop ?? 1, rings: 20, seg: 16, vScale: 0.5, vOff: 0.3, cap: [w * 0.8, w * snW * 0.6] });
    g.add(upper);
    let jaw = null;
    if (cfg.jaw !== false && !beak) {
      jaw = new THREE.Group(); jaw.position.set(0, -h * (cfg.jawY ?? 0.32), skullLen * 0.18); g.add(jaw);
      const jl = skullLen * 0.8;
      const jm = tube([[0, 0, 0], [0, -h * 0.08, jl * 0.5], [0, -h * 0.02, jl]], [[0, w * 0.7, h * 0.35], [0.5, w * snW * 0.85, h * 0.3], [1, w * snW * 0.6, h * 0.2]], M.limb, { flatTop: 0.35, rings: 14, seg: 12, vScale: 0.4 });
      jaw.add(jm);
      const mouth = tube([[0, h * 0.02, jl * 0.05], [0, h * 0.04, jl * 0.9]], [[0, w * 0.55, 0.02], [1, w * snW * 0.45, 0.015]], M.mouth, { rings: 6, seg: 8 });
      jaw.add(mouth);
      if (cfg.teeth) {
        const tg = new THREE.ConeGeometry(1, 1, 5);
        for (const sx of [-1, 1]) for (let i = 0; i < (cfg.teeth === 'fangs' ? 2 : 4); i++) {
          const z = jl * (0.88 - i * 0.18), x = sx * w * snW * (0.42 + i * 0.07);
          const big = i === 0 && cfg.teeth === 'fangs';
          const t1 = mesh(tg, M.tooth); t1.scale.set(0.016, big ? 0.07 : 0.035, 0.016); t1.position.set(x, h * 0.06 + (big ? 0.03 : 0.012), z); jaw.add(t1);
          const t2 = mesh(tg, M.tooth); t2.scale.set(0.014, big ? 0.05 : 0.03, 0.014); t2.rotation.x = Math.PI; t2.position.set(x * (big ? 1.3 : 1.05), -h * ((cfg.jawY ?? 0.32) - 0.06) - (big ? 0.015 : 0.0), skullLen * 0.18 + z - 0.03); g.add(t2);
        }
      }
    }
    if (beak) {
      const bl = len * (cfg.beakLen ?? 0.6);
      const bm = pal.beak ? lazy('beak', () => mat({ color: pal.beak, rough: 0.4, rim: shade(pal.beak, 0.5), rimK: 0.5 })) : M.horn;
      const hook = cfg.hook ?? 0.5;
      const top = tube([[0, h * 0.25, skullLen * 0.75], [0, h * 0.12, skullLen + bl * 0.5], [0, -h * hook, skullLen + bl * 0.92]], [[0, w * 0.62, h * 0.62], [0.5, w * 0.34, h * 0.36], [1, 0.012]], bm, { rings: 16, seg: 10, flatBottom: 0.5, cap: [w * 0.3, 0.004], vScale: 0.3 });
      g.add(top);
      jaw = new THREE.Group(); jaw.position.set(0, -h * 0.2, skullLen * 0.8); g.add(jaw);
      const bot = tube([[0, 0, 0], [0, -h * 0.05, bl * 0.75]], [[0, w * 0.42, h * 0.25], [1, 0.012]], bm, { rings: 10, seg: 8, flatTop: 0.4, cap: [w * 0.2, 0.004] });
      jaw.add(bot);
    }
    // eyes: on the sides, a little forward, under a brow
    const er = cfg.eye || w * 0.22;
    const ez = skullLen * (cfg.eyeZ ?? 0.42), ey = h * (cfg.eyeY ?? 0.32);
    const front = cfg.eyesFront ?? 0.55;   // 0 = on the sides, 1 = forward
    const eyeN = cfg.eyes ?? 2;
    for (let k = 0; k < eyeN / 2; k++) for (const sx of [-1, 1]) {
      const e = glowEye(er * (k ? 0.7 : 1), pal.eyes, { slit: cfg.slit, halo: k === 0 && cfg.halo !== false });
      const ox = sx * w * (0.78 - front * 0.18) * (k ? 0.8 : 1);
      e.position.set(ox, ey + k * er * 2.2, ez - k * er * 1.5); e.rotation.y = sx * (1 - front) * 1.1; g.add(e);
      if (cfg.brow !== false && k === 0) {
        const b = ell(er * 1.9, er * 0.7, er * 1.4, M.skin, 10); b.position.set(ox * 0.92, ey + er * 0.85, ez - er * 0.15); b.rotation.set(-0.2, sx * (1 - front) * 1.1, sx * -0.42 * (cfg.angry ?? 1)); g.add(b);
      }
    }
    return { g, jaw, len, w, h, skullLen, upper };
  }

  // ---------- head parts (animals) ----------
  function headParts(hd) {
    const { g, w, h, skullLen } = hd;
    const ek = kind('ears');
    if (ek) for (const sx of [-1, 1]) {
      const ep = new THREE.Group(); ep.position.set(sx * w * (ek === 'floppy' ? 0.7 : 0.5), h * (ek === 'floppy' ? 0.55 : 0.72), skullLen * 0.2); g.add(ep);
      const el = (ek === 'long' ? 0.26 : ek === 'round' ? 0.09 : ek === 'floppy' ? 0.16 : 0.17) * (H.earSize ?? 1);
      const ew = ek === 'round' ? w * 0.48 : ek === 'floppy' ? w * 0.5 : w * 0.4;
      const ear = tube([[0, -0.02, 0], [sx * 0.015, el * 0.55, -el * 0.12], [sx * 0.03, el, -el * 0.35]], [[0, ew, w * 0.12], [0.35, ew * 0.95, w * 0.1], [1, ek === 'round' ? ew * 0.5 : 0.006]], M.limb, { rings: 10, seg: 8, cap: [w * 0.1, ek === 'round' ? ew * 0.4 : 0.004], up: V(0, 0, 1) });
      ep.add(ear);
      const inn = tube([[0, 0.0, w * 0.05], [sx * 0.012, el * 0.5, -el * 0.08], [sx * 0.024, el * 0.85, -el * 0.27]], [[0, ew * 0.62, w * 0.05], [1, 0.004]], M.mouth, { rings: 8, seg: 6, cap: [w * 0.05, 0.003], up: V(0, 0, 1) });
      ep.add(inn);
      if (ek === 'tufted') ep.add(spike([[sx * 0.03, el * 0.95, -el * 0.33], [sx * 0.04, el * 1.25, -el * 0.4], [sx * 0.05, el * 1.5, -el * 0.42]], 0.012, M.dark, { rings: 6, seg: 5 }));
      const rx0 = ek === 'swept' ? -0.45 : ek === 'floppy' ? 0.3 : -0.15;
      ep.rotation.z = sx * (ek === 'floppy' ? -1.7 : -0.35); ep.rotation.x = rx0;
      anim.push((dt, st) => { ep.rotation.x = rx0 + Math.sin(st.t * 1.7 + sx) * 0.05 - (st._att || 0) * 0.5; });
    }
    const hk = kind('horns');
    if (hk) for (const sx of [-1, 1]) {
      let pts, r0 = w * 0.2 * (H.hornK ?? 1);
      const hs = H.hornSize ?? 1;
      if (hk === 'curl') { pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * Math.PI * 1.5 * (H.curlTurns ?? 1); pts.push([sx * (t * 0.06 + 0.02) * hs, Math.sin(a) * 0.13 * (1 - t * 0.3) * hs, (-Math.cos(a) * 0.13 * (1 - t * 0.3) + 0.1) * hs]); } r0 = w * 0.25 * (H.hornK ?? 1); }
      else if (hk === 'rhino') { if (sx > 0) continue; pts = [[0, 0, 0], [0, 0.12 * hs, 0.06 * hs], [0, 0.26 * hs, -0.02 * hs]]; r0 = w * 0.32; }
      else if (hk === 'forward') pts = [[0, 0, 0], [sx * 0.08 * hs, 0.08 * hs, 0.06 * hs], [sx * 0.1 * hs, 0.1 * hs, 0.2 * hs]];
      else if (hk === 'ox') pts = [[0, 0, 0], [sx * 0.16 * hs, 0.02 * hs, 0.0], [sx * 0.24 * hs, 0.12 * hs, 0.06 * hs], [sx * 0.22 * hs, 0.22 * hs, 0.1 * hs]];
      else if (hk === 'antler') { pts = [[0, 0, 0], [sx * 0.05 * hs, 0.12 * hs, -0.04 * hs], [sx * 0.12 * hs, 0.26 * hs, -0.06 * hs]]; }
      else pts = [[0, 0, 0], [sx * 0.06 * hs, 0.1 * hs, -0.06 * hs], [sx * 0.08 * hs, 0.2 * hs, -0.18 * hs]];
      const hm = spike(pts, r0, M.horn, { rings: 14 });
      if (hk === 'rhino') hm.position.set(0, h * 0.35, skullLen * 0.78);
      else if (hk === 'ox') hm.position.set(sx * w * 0.6, h * 0.55, skullLen * 0.22);
      else hm.position.set(sx * w * 0.55, h * 0.6, skullLen * 0.3);
      g.add(hm);
      if (hk === 'antler') for (let k = 0; k < 2; k++) { const b = spike([[sx * 0.05 * hs, (0.1 + k * 0.08) * hs, -0.04 * hs], [sx * 0.1 * hs, (0.16 + k * 0.08) * hs, 0.04 * hs]], r0 * 0.5, M.horn, { rings: 6 }); b.position.copy(hm.position); g.add(b); }
      if (H.hornCap) { const cap = ell(r0 * 1.4, r0 * 1.0, r0 * 1.4, metalM(), 8); cap.position.copy(hm.position).add(V(...pts[pts.length - 1]).multiplyScalar(0.8)); g.add(cap); }
    }
    const nk = kind('nose');
    if (nk === 'disc') {
      const sn = H.snout ?? 0.5, snW = H.snoutW ?? 0.6;
      const nr = w * snW * 0.62;
      const disc = mesh(new THREE.CylinderGeometry(nr, nr * 1.08, nr * 0.5, 16), lazy('nosePink', () => mat({ color: mix(pal.belly, '#c87a6a', 0.45), rough: 0.6 })));
      disc.rotation.x = Math.PI / 2 + 0.25; disc.position.set(0, -h * 0.05 * sn + h * 0.02, skullLen + nr * 0.05); g.add(disc);
      for (const sx of [-1, 1]) { const n = ell(nr * 0.2, nr * 0.32, nr * 0.1, M.dark, 8); n.position.set(sx * nr * 0.38, -h * 0.05 * sn + h * 0.02 - nr * 0.06, skullLen + nr * 0.32); n.rotation.x = 0.25; g.add(n); }
    } else if (nk === 'dog' || nk === 'cat') {
      // a leather nose pad on the end of the muzzle
      const sn = H.snout ?? 0.5, snW = H.snoutW ?? 0.6, stop = H.stop ?? 0;
      const nr = w * snW * (nk === 'cat' ? 0.26 : 0.3);
      const n = ell(nr * 1.05, nr * 0.72, nr * 0.7, lazy('nosePad', () => mat({ color: pal.nose || '#1a1412', rough: 0.3, rimK: 0.4 })), 10);
      n.position.set(0, -h * (0.05 * sn + stop * 0.12) + h * snW * 0.32, skullLen + nr * 0.15); g.add(n);
    }
    if (has('tusks') && hd.jaw) for (const sx of [-1, 1]) {
      const tk = (H.tuskSize ?? 1);
      const tsk = spike([[0, 0, 0], [sx * 0.03 * tk, 0.05 * tk, 0.03 * tk], [sx * 0.05 * tk, 0.13 * tk, -0.02 * tk]], 0.026 * Math.sqrt(tk), M.tooth, { rings: 10 });
      tsk.position.set(sx * w * 0.42, h * 0.02, skullLen * 0.62); hd.jaw.add(tsk);
    }
    if (has('mandibles')) for (const sx of [-1, 1]) {
      const mp = new THREE.Group(); mp.position.set(sx * w * 0.45, -h * 0.25, skullLen * 0.85); g.add(mp);
      const ms = H.mandible ?? 1;
      mp.add(spike([[0, 0, 0], [sx * 0.03 * ms, -0.01, 0.06 * ms], [-sx * 0.03 * ms, -0.015, 0.11 * ms]], w * 0.18, M.dark, { rings: 8 }));
      anim.push((dt, st) => { mp.rotation.y = sx * (0.25 + Math.sin(st.t * 6) * 0.08 + (st._att || 0) * 0.6); });
    }
    if (has('antennae')) for (const sx of [-1, 1]) {
      const al = H.antenna ?? 1;
      const a = tube([[0, 0, 0], [sx * 0.05 * al, 0.12 * al, 0.06 * al], [sx * 0.12 * al, 0.2 * al, 0.0]], [[0, 0.008], [1, 0.005]], M.dark, { rings: 8, seg: 5 });
      a.position.set(sx * w * 0.3, h * 0.5, skullLen * 0.7); g.add(a);
      const tip = ell(0.018, 0.018, 0.018, M.dark, 8); tip.position.set(sx * w * 0.3 + sx * 0.12 * al, h * 0.5 + 0.2 * al, skullLen * 0.7); g.add(tip);
    }
    if (has('barbels')) for (const sx of [-1, 1]) {
      const b = tube([[0, 0, 0], [sx * 0.06, -0.06, 0.0], [sx * 0.1, -0.14, -0.06]], [[0, 0.012], [1, 0.004]], M.limb, { rings: 8, seg: 5 });
      b.position.set(sx * w * 0.5, -h * 0.1, skullLen * 0.85); g.add(b);
    }
    if (has('cheeks')) for (const sx of [-1, 1]) {
      // a ruff of fur along the jaw line (dogs, cats)
      for (let k = 0; k < 3; k++) { const t = spike([[0, 0, 0], [sx * 0.05, -0.03, -0.04], [sx * 0.09, -0.06, -0.09]], w * 0.16, M.skin, { rings: 6, seg: 6 }); t.position.set(sx * w * 0.7, -h * (0.1 + k * 0.22), skullLen * (0.15 - k * 0.05)); g.add(t); }
    }
    if (has('tongue') && hd.jaw) {
      const tg = tube([[0, h * 0.05, skullLen * 0.2], [0, h * 0.02, skullLen * 0.9], [0, -h * 0.25, skullLen * 1.25], [0, -h * 0.6, skullLen * 1.35]], [[0, w * 0.25, w * 0.08], [1, w * 0.12, w * 0.05]], lazy('tongue', () => mat({ color: pal.tongue || '#a0384a', rough: 0.35, glow: pal.glow && R.glowTongue ? pal.glow : null, glowK: 0.4 })), { rings: 14, seg: 8 });
      hd.jaw.add(tg);
    }
    if (has('crown')) crown(g, w * 0.9, h * 0.95, skullLen * 0.3);
  }
  function crown(parent, r, y, z = 0) {
    const gold = lazy('gold', () => mat({ color: pal.gold || '#d8a838', rough: 0.3, metal: 0.85, rim: '#fff0b0', rimK: 0.6 }));
    const band = mesh(new THREE.TorusGeometry(r, r * 0.12, 6, 18), gold); band.rotation.x = Math.PI / 2; band.position.set(0, y, z); parent.add(band);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; const sp = spike([[0, 0, 0], [0, r * 0.35, 0], [0, r * 0.7, 0]], r * 0.13, gold, { rings: 5, seg: 5 }); sp.position.set(Math.sin(a) * r, y, z + Math.cos(a) * r); parent.add(sp); }
    if (pal.glow) { const gm = ell(r * 0.15, r * 0.2, r * 0.1, M.glow, 8); gm.position.set(0, y + r * 0.12, z + r * 1.05); parent.add(gm); }
  }

  // ---------- body parts on a torso tube ----------
  function backRow(torso, { from = 0.2, to = 0.95, n = 9, len = 0.14, r0 = 0.03, lean = -0.6, material = M.horn, spread = 0, tipGlow = null, flowers = null, bend = 0.15 } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = lerp(from, to, n === 1 ? 0.5 : i / (n - 1));
      for (const a of spread ? [-spread, spread] : [0]) {
        const s = onTube(torso, t, a, 0.92);
        const l = len * (0.7 + 0.6 * Math.sin(Math.PI * (i + 0.5) / n)) * (0.85 + hash(i, a) * 0.3);
        const dir = s.n.clone().addScaledVector(s.T, lean).normalize();
        const mid = s.p.clone().addScaledVector(dir, l * 0.5).addScaledVector(s.T, -l * bend), tip = s.p.clone().addScaledVector(dir, l).addScaledVector(s.T, -l * bend * 2.3);
        const sp = spike([s.p, mid, tip], r0, material, { rings: 7, seg: 6 });
        torso.parent.add(sp); out.push(sp);
        if (tipGlow) { const gl = glowSprite(tipGlow, l * 1.2, 0.8); gl.position.copy(tip); torso.parent.add(gl); out.push(gl); }
        if (flowers && hash(i, a, 9) < 0.6) { const f = ell(0.022, 0.018, 0.022, flowers, 8); f.position.copy(s.p.clone().lerp(tip, 0.55)).addScaledVector(dir, 0.01); torso.parent.add(f); }
      }
    }
    return out;
  }
  function mossTufts(parent, surf, n, scale, seed = 3, color = null) {
    const r = rng(seed * 13 + 5);
    const c = color || pal.moss || '#5a8a3a';
    const moss = lazy('moss' + c, () => mat({ color: c, rough: 0.95, flat: true, rim: '#bfe08a', rimK: 0.35 }));
    const moss2 = lazy('moss2' + c, () => mat({ color: shade(c, 0.2), rough: 0.95, flat: true, rim: '#d0f0a0', rimK: 0.35 }));
    for (let i = 0; i < n; i++) {
      const s = surf(r(), r());
      const cg = new THREE.Group(); cg.position.copy(s.p);
      for (let k = 0; k < 3; k++) { const m = rock(scale * (0.6 + r() * 0.6), r() < 0.5 ? moss : moss2, i * 3 + k, 0.35, 0); m.position.set((r() - 0.5) * scale * 1.5, (r() - 0.3) * scale * 0.6, (r() - 0.5) * scale * 1.5); m.scale.y = 0.65; cg.add(m); }
      parent.add(cg);
    }
  }
  function embers(parent, { n = 8, w = 0.5, h = 0.8, y0 = 0.3, color = pal.glow, zc = 0, size = 1 } = {}) {
    const sps = [];
    for (let i = 0; i < n; i++) { const s = glowSprite(color, (0.05 + hash(i, 4) * 0.05) * size, 0.9); parent.add(s); sps.push({ s, ph: hash(i, 1), x: (hash(i, 2) - 0.5) * w, z: (hash(i, 3) - 0.5) * w + zc }); }
    anim.push((dt, st) => { for (const e of sps) { const k = (st.t * 0.35 + e.ph) % 1; e.s.position.set(e.x + Math.sin(st.t * 2 + e.ph * 9) * 0.05, y0 + k * h, e.z); e.s.material.opacity = Math.sin(k * Math.PI) * 0.9; } });
  }
  /** Flat pages stuck to a surface (the Archivore, paper mites). */
  function pagesOn(parent, surf, n, sz, seed = 5) {
    const pm = lazy('pageStuck', () => mat({ map: pageTex('#efe4c6', '#3a2a1a'), rough: 0.85, side: THREE.DoubleSide, alphaTest: 0.3, rimK: 0.3 }));
    const r = rng(seed * 17 + 1);
    for (let i = 0; i < n; i++) {
      const s = surf(r(), r());
      const p = mesh(new THREE.PlaneGeometry(sz * 0.7, sz), pm);
      p.position.copy(s.p).addScaledVector(s.n, 0.004);
      p.lookAt(p.position.clone().add(s.n)); p.rotateZ((r() - 0.5) * 2);
      parent.add(p);
    }
  }
  /** A glowing letter that circles (ink foes). */
  function glyphRing(parent, n, r, y, color) {
    const chars = ['a', '&', 'g', 'e', 'R', 'q'];
    const gl = [];
    for (let i = 0; i < n; i++) {
      const ch = chars[i % chars.length];
      const t = canvasTex('glyph' + ch, 64, 64, (g) => { g.font = 'bold 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#fff'; g.shadowBlur = 8; g.fillStyle = '#ffffff'; g.fillText(ch, 32, 34); }, false);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.setScalar(r * 0.45); parent.add(sp); gl.push(sp);
    }
    anim.push((dt, st) => gl.forEach((g, i) => { const a = st.t * 1.2 + i * TAU / n; g.position.set(Math.cos(a) * r, y + Math.sin(a * 2 + i) * r * 0.15, Math.sin(a) * r); }));
  }
  /** Chain links along a path of points (gangers, chain hounds). */
  function chain(parent, pts, lr = 0.025, material = null) {
    const m = material || metalM();
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(...p))));
    const n = Math.max(2, Math.round(curve.getLength() / (lr * 2.6)));
    const lg = new THREE.TorusGeometry(lr, lr * 0.32, 4, 8);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), p = curve.getPointAt(t), T = curve.getTangentAt(t);
      const l = mesh(lg, m); l.position.copy(p); l.lookAt(p.clone().add(T)); l.rotateY(Math.PI / 2); if (i % 2) l.rotateX(Math.PI / 2); parent.add(l);
    }
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
      p.add(tube([[0, 0, sl * 0.15], [0, 0, -sl * 1.08]], [[0, ra], [1, Math.max(0.008, rb)]], material, { rings: 8, seg: 10, vScale: 0.5 }));
      cur = p;
    }
    const end = new THREE.Group(); end.position.set(0, 0, -sl); cur.add(end);
    const re = r0 * 0.2;
    if (tk === 'spiked') {
      piv.forEach((p, i) => { const r = r0 * (1 - (i + 0.5) / segs * 0.8); p.add(spike([[0, r * 0.7, -sl * 0.35], [0, r * 1.5, -sl * 0.6]], r * 0.45, M.horn, { rings: 5, seg: 5 })); });
    } else if (tk === 'club') {
      end.add(rock(r0 * 1.3, M.horn, 7, 0.25, 1));
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; end.add(spike([[0, 0, 0], [Math.cos(a) * r0, Math.sin(a) * r0, -r0 * 0.4], [Math.cos(a) * r0 * 2.2, Math.sin(a) * r0 * 2.2, -r0 * 1.2]], r0 * 0.32, M.horn, { rings: 6, seg: 5 })); }
    } else if (tk === 'ember') {
      const gl = glowSprite(pal.glow, 0.3, 0.9); end.add(gl); end.add(ell(re * 2.2, re * 2.2, re * 3.2, M.glow, 8));
    } else if (tk === 'tuft') {
      const tm = pal.tuft ? lazy('tuft', () => mat({ color: pal.tuft, rough: 0.95 })) : M.accent;
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; end.add(spike([[0, 0, 0.02], [Math.cos(a) * 0.03, Math.sin(a) * 0.03, -0.06], [Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.14]], 0.022, tm, { rings: 6, seg: 5 })); }
    } else if (tk === 'bushy') {
      piv.forEach((p, i) => { if (i < 1) return; for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + i; p.add(spike([[0, 0, -sl * 0.2], [Math.cos(a) * r0 * 0.9, Math.sin(a) * r0 * 0.9, -sl * 0.6], [Math.cos(a) * r0 * 1.3, Math.sin(a) * r0 * 1.3, -sl * 1.1]], r0 * 0.7, material, { rings: 6, seg: 6 })); } });
    } else if (tk === 'thorn') {
      piv.forEach((p, i) => { const r = r0 * (1 - (i + 0.5) / segs * 0.8); for (const a of [-0.9, 0.9, 0]) p.add(spike([[Math.sin(a) * r * 0.8, Math.cos(a) * r * 0.8, -sl * 0.3], [Math.sin(a) * r * 2.2, Math.cos(a) * r * 2.2, -sl * 0.55]], r * 0.35, M.horn, { rings: 5, seg: 5 })); });
    }
    return { piv, end };
  }

  // ===================================================================================== bodies
  let update = () => {};
  let height = 1;

  if (R.body === 'quadruped') {
    const L = P.torso ?? 1.0, gr = P.girth ?? 0.28, legLen = P.legLen ?? 0.5, lt = P.legThick ?? 0.08;
    const chest = P.chest ?? 1.15, hips = P.hips ?? 0.9, arch = P.arch ?? 0.04, neckL = P.neck ?? 0.26, rise = P.neckRise ?? 0.55;
    const slope = P.slope ?? 0;   // hyenas: the rump sits lower than the shoulders
    const ty = legLen + gr * 0.35;
    const sh0 = P.shoulder ?? 0.04, hw = H.w || 0.15;
    const ns = V(0, ty + sh0 + gr * 0.3, L * 0.5), ne = ns.clone().add(V(0, Math.sin(rise) * neckL, Math.cos(rise) * neckL));
    const tpts = [V(0, ty - (P.rump ?? 0.02) - slope, -L / 2), V(0, ty + arch - slope * 0.6, -L * 0.05), V(0, ty + sh0 + (P.hump ?? 0), L * 0.3), ns, ne];
    const cum = [0]; for (let i = 1; i < tpts.length; i++) cum.push(cum[i - 1] + tpts[i].distanceTo(tpts[i - 1]));
    const fr = cum.map((c) => c / cum[cum.length - 1]);
    const wst = gr * (P.waist ?? 0.92);
    const torso = tube(tpts,
      [[0, gr * hips * 0.75, gr * hips * 0.8], [fr[1] * 0.45, gr * hips, gr * hips * 1.05], [fr[1], wst, wst * 1.05], [fr[2], gr * chest * 0.95, gr * chest * 1.1 * (1 + (P.hump ?? 0) * 1.5)],
        [fr[3], Math.max(hw * 1.2, gr * chest * 0.62), Math.max(hw * 1.3, gr * chest * 0.78)], [1, hw * 0.95, hw * 1.0]],
      M.skin, { flatBottom: P.belly ?? 0.9, rings: 36, seg: 20, vScale: R.patternScale ?? 1, cap: [gr * hips * 0.7, hw * 0.6] });
    inner.add(torso);
    const headPiv = new THREE.Group(); headPiv.position.copy(ne); inner.add(headPiv);
    const hd = makeHead({ len: 0.38, w: 0.15, h: 0.15, ...H });
    hd.g.position.set(0, 0, -0.04); hd.g.rotation.x = H.pitch ?? 0.15; headPiv.add(hd.g);
    headParts(hd);
    // legs
    const legs = [];
    for (const [fz, front] of [[L * (P.legFront ?? 0.34), true], [-L * (P.legRear ?? 0.33), false]]) for (const sx of [-1, 1]) {
      const hy = front ? ty : ty - slope;
      const hip = new THREE.Group(); hip.position.set(sx * gr * (P.stance ?? 0.52), hy, fz); inner.add(hip);
      const drop = hy - 0.02;
      const l1 = drop * 0.5, l2 = drop * 0.5 - lt * 0.6, dz = front ? -0.02 : 0.07;
      const top = Math.max(lt * 1.5, front ? gr * 0.5 : gr * 0.62);
      hip.add(tube([[0, gr * 0.25, -dz * 0.3], [0, -l1 * 0.35, dz * 0.4], [0, -l1, dz]], [[0, top * 0.55, top * 0.85], [0.3, top * 0.62, top * 0.9], [0.75, lt * 1.3, lt * 1.45], [1, lt * 1.12, lt * 1.2]], M.limb, { rings: 12, seg: 12, up: V(0, 0, 1), vScale: 0.5, cap: [top * 0.5, lt * 1.1] }));
      const knee = new THREE.Group(); knee.position.set(0, -l1, dz); hip.add(knee);
      knee.add(tube([[0, lt * 0.5, 0], [0, -l2 * 0.5, -dz * 0.6], [0, -l2 + lt * 0.2, -dz * 0.9]], [[0, lt * 1.1, lt * 1.15], [0.55, lt * 0.8, lt * 0.88], [1, lt * 0.82, lt * 0.9]], M.limb, { rings: 10, seg: 12, up: V(0, 0, 1), vScale: 0.5 }));
      const foot = new THREE.Group(); foot.position.set(0, -l2, -dz * 0.9); knee.add(foot);
      if (P.hooves) {
        const hm = lazy('hoof', () => mat({ color: pal.hoof || '#2a2018', rough: 0.4, rimK: 0.3 }));
        const hf = cyl(lt * 0.95, lt * 1.15, lt * 1.1, hm, 10); hf.position.set(0, lt * 0.35, lt * 0.15); foot.add(hf);
      } else {
        const paw = ell(lt * 1.0, lt * 0.62, lt * 1.3, M.limb, 12); paw.position.set(0, lt * 0.1, lt * 0.3); foot.add(paw);
        if (P.claws !== false) for (let k = -1; k <= 1; k++) { const c = spike([[0, 0, 0], [0, -0.008, 0.025], [0, -0.028, 0.04]], lt * 0.22, M.dark, { rings: 5, seg: 5 }); c.position.set(k * lt * 0.5, -lt * 0.05, lt * 1.3); foot.add(c); }
      }
      if (has('vines') && hash(sx, front ? 1 : 2) < 0.75) { for (let k = 0; k < 3; k++) { const a = k * 2.1; knee.add(spike([[Math.cos(a) * lt, -l2 * (0.2 + k * 0.25), Math.sin(a) * lt], [Math.cos(a + 1) * lt * 1.8, -l2 * (0.25 + k * 0.25), Math.sin(a + 1) * lt * 1.8]], lt * 0.25, M.horn, { rings: 5, seg: 5 })); } }
      legs.push({ hip, knee, front, sx, ph: (front ? 0 : Math.PI) + (sx > 0 ? Math.PI : 0) });
    }
    // tail
    let tail = null;
    if (P.tail !== 0) tail = makeTail(inner, V(0, ty + gr * 0.45 - slope, -L / 2 + 0.04), { len: P.tail ?? 0.45, r0: P.tailThick ?? gr * 0.28, segs: P.tailSegs ?? 4, lift: P.tailLift ?? 0.5, droop: P.tailDroop ?? -0.18, kind: kind('tail') || 'plain' });
    // body parts
    const rowKind = kind('spines') || kind('bristles');
    if (rowKind === 'gorse') {
      // a ridge of dark bristle with gorse sprigs growing through it: short spiny tufts tipped with yellow flowers
      const gm = mat({ color: pal.accent, rough: 0.85, rim: '#d8f0a0', rimK: 0.3 }), fm = mat({ color: pal.flower || '#ffcf2a', rough: 0.6, emissive: '#6a4a00' });
      backRow(torso, { from: 0.12, to: 0.97, n: P.spineN ?? 12, len: P.spineLen ?? 0.12, r0: 0.03, lean: -0.9, material: mat({ color: shade(pal.base, -0.5), rough: 0.95 }) });
      for (let i = 0; i < (P.gorseN ?? 16); i++) {
        const t = 0.15 + i / ((P.gorseN ?? 16) - 1) * 0.8, a = (hash(i, 11) - 0.5) * 1.3;
        const s = onTube(torso, t, a, 0.95), c = new THREE.Group(); c.position.copy(s.p); torso.parent.add(c);
        for (let k = 0; k < 4; k++) {
          const d = s.n.clone().add(V((hash(i, k) - 0.5) * 1.2, 0.2, (hash(k, i) - 0.5) * 1.2 - 0.3)).normalize(), l = 0.07 + hash(i, k, 4) * 0.06;
          c.add(spike([[0, 0, 0], d.clone().multiplyScalar(l * 0.5).toArray(), d.clone().multiplyScalar(l).toArray()], 0.011, gm, { rings: 4, seg: 4 }));
          if (hash(i, k, 6) < 0.55) { const f = ell(0.02, 0.016, 0.02, fm, 8); f.position.copy(d.clone().multiplyScalar(l * 0.8)); c.add(f); }
        }
      }
    } else if (rowKind === 'soft') backRow(torso, { from: 0.25, to: 1.0, n: P.spineN ?? 14, len: P.spineLen ?? 0.1, r0: P.spineR ?? 0.03, lean: -1.1, material: M.dark, bend: 0.25 });
    else if (rowKind === 'thorn') {
      // brambles: dark thorny canes along the back, a few leaves
      const cane = lazy('cane', () => mat({ color: pal.cane || '#3a2a1a', rough: 0.8, rimK: 0.25 }));
      backRow(torso, { from: 0.1, to: 0.95, n: P.spineN ?? 10, len: P.spineLen ?? 0.2, r0: P.spineR ?? 0.026, lean: -0.5, material: M.horn, spread: 0.55 });
      const leaf = lazy('leaf', () => mat({ color: pal.leaf || '#4a6a2a', rough: 0.8, flat: true, side: THREE.DoubleSide, rim: '#a8d070', rimK: 0.3 }));
      for (let i = 0; i < 9; i++) { const s = onTube(torso, 0.1 + i * 0.1, (hash(i, 3) - 0.5) * 1.6, 0.95); const lf = ell(0.035, 0.008, 0.06, leaf, 6); lf.position.copy(s.p).addScaledVector(s.n, 0.03); lf.rotation.set(hash(i) * 2, hash(i, 1) * 6, 0); torso.parent.add(lf); }
      for (const a of [-0.35, 0.35]) { const pts = []; for (let i = 0; i <= 8; i++) pts.push(onTube(torso, 0.08 + i * 0.11, a + Math.sin(i * 1.7) * 0.25, 1.03).p); torso.parent.add(tube(pts, [[0, 0.016], [1, 0.012]], cane, { rings: 30, seg: 6 })); }
    } else if (rowKind) backRow(torso, { from: 0.15, to: 0.98, n: P.spineN ?? 11, len: P.spineLen ?? 0.16, r0: P.spineR ?? 0.025, lean: -0.7, material: M.horn });
    if (has('mane')) {
      const mk = kind('mane');
      const mm = mk === 'ember' ? mat({ color: shade(pal.base, -0.45), rough: 0.95, glow: pal.glow, glowMap: tipTex, glowK: 2.4 })
        : mk === 'mist' ? mat({ color: pal.accent, rough: 0.95, emissive: pal.glow || pal.accent, emissiveK: 0.35 })
          : lazy('mane', () => mat({ color: pal.mane || pal.accent, rough: 0.95, rim: shade(pal.mane || pal.accent, 0.5), rimK: 0.35 }));
      const big = mk === 'lion' ? 1.3 : mk === 'alpha' ? 1.4 : 1;
      const tufts = [];
      const nT = mk === 'lion' ? 34 : 22;
      for (let i = 0; i < nT; i++) { const a = (hash(i, 7) - 0.5) * (mk === 'lion' ? 4.2 : 2.4), t = (mk === 'lion' ? 0.78 : 0.7) + hash(i, 8) * (mk === 'lion' ? 0.22 : 0.3); tufts.push([onTube(torso, Math.min(0.99, t), a, 0.9), (0.1 + hash(i, 2) * 0.08) * big]); }
      for (let i = 0; i < 9; i++) { const k = i / 8, p = ns.clone().lerp(ne, k * 0.9); const a = (hash(i, 5) - 0.5) * (mk === 'lion' ? 4 : 1.6); const w = (H.w || 0.15); tufts.push([{ p: p.clone().add(V(Math.sin(a) * w * 0.8, Math.cos(a) * w * 0.85, 0)), n: V(Math.sin(a), Math.cos(a), 0) }, (0.11 + hash(i, 3) * 0.06) * big]); }
      for (const [s, l] of tufts) {
        const dir = s.n.clone().multiplyScalar(0.55).add(V(0, 0.45, -0.85)).normalize();
        const tip = s.p.clone().addScaledVector(dir, l);
        torso.parent.add(spike([s.p.clone().addScaledVector(dir, -0.03), s.p.clone().lerp(tip, 0.5).add(V(0, 0.02, 0)), tip], 0.032 * Math.sqrt(big), mm, { rings: 6, seg: 6 }));
      }
      if (mk === 'lion') {
        // a lion's mane: a thick ruff of soft lumps round the head and down the neck, the tufts over it
        const r = rng(R.seed + 17);
        for (let i = 0; i < 26; i++) { const k = r(), a = r() * TAU; const p = ns.clone().lerp(ne, 0.25 + k * 0.8); const rr = hw * (1.25 + (1 - k) * 0.6); const lump = softLump(hw * (0.55 + r() * 0.3), mm, i + 7, 0.22); lump.position.copy(p).add(V(Math.sin(a) * rr, Math.cos(a) * rr * 0.95 + hw * 0.1, -0.04)); torso.parent.add(lump); }
      }
      if (mk === 'ember') for (let i = 0; i < 3; i++) { const gl = glowSprite(pal.glow, 0.22, 0.55); gl.position.copy(tufts[i * 7][0].p).add(V(0, 0.1, -0.08)); torso.parent.add(gl); }
    }
    if (has('wool')) {
      // a fleece: soft overlapping lumps over the back and flanks
      const wm = lazy('wool', () => mat({ map: skin('wool', { base: pal.wool || pal.belly, belly: shade(pal.wool || pal.belly, -0.12), pattern: 'wool', seed: R.seed + 2 }).map, rough: 0.97, rim: shade(pal.wool || pal.belly, 0.4), rimK: 0.4 }));
      const wk = P.woolK ?? 1;
      const r = rng(R.seed * 3 + 1);
      for (let i = 0; i < (P.woolN ?? 26); i++) { const t = 0.05 + r() * 0.72, a = (r() - 0.5) * 3.4; const s = onTube(torso, t, a, 0.85); const lump = softLump(gr * (0.42 + r() * 0.2) * wk, wm, i, 0.16); lump.position.copy(s.p); torso.parent.add(lump); }
    }
    if (has('bark')) {
      // bark plates (Barkhide bears): flat slabs over the back
      const bm = lazy('bark', () => mat({ color: pal.bark || '#4a3a2a', rough: 0.95, flat: true, rim: '#a89070', rimK: 0.25 }));
      const r = rng(R.seed + 11);
      for (let i = 0; i < 16; i++) { const t = 0.1 + r() * 0.75, a = (r() - 0.5) * 2.2; const s = onTube(torso, t, a, 0.98); const pl = rock(gr * 0.28, bm, i + 40, 0.3, 0); pl.position.copy(s.p); pl.lookAt(s.p.clone().add(s.n)); pl.scale.set(1.2, 0.8, 0.35); torso.parent.add(pl); }
    }
    if (has('papers')) pagesOn(torso.parent, (a, b) => { const s = onTube(torso, 0.1 + a * 0.8, (b - 0.5) * 3.4, 1.0); return s; }, P.paperN ?? 14, gr * 0.55, R.seed);
    if (has('collar')) {
      const cz = ns.clone().lerp(ne, 0.3);
      const cr = Math.max(hw * 1.25, gr * chest * 0.7);
      const col = mesh(new THREE.TorusGeometry(cr, cr * 0.12, 6, 16), metalM()); col.position.copy(cz); col.lookAt(cz.clone().add(ne.clone().sub(ns))); inner.add(col);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const sp = spike([[0, 0, 0], [0, cr * 0.3, 0]], cr * 0.1, metalM(), { rings: 4, seg: 5 }); sp.position.copy(cz).add(V(Math.sin(a) * cr, Math.cos(a) * cr, 0)); sp.lookAt(cz); sp.rotateX(-Math.PI / 2); inner.add(sp); }
      if (kind('collar') === 'chain') chain(inner, [cz.clone().add(V(0, -cr, 0)), cz.clone().add(V(0.05, -cr - 0.12, -0.08)), cz.clone().add(V(0.02, -cr - 0.18, -0.25))], 0.022);
    }
    if (has('bell')) {
      const cz = ns.clone().lerp(ne, 0.35);
      const bm = lazy('bellM', () => mat({ color: pal.bellC || '#a8884a', rough: 0.35, metal: 0.8, rim: '#ffe0a0', rimK: 0.5 }));
      const bell = mesh(new THREE.LatheGeometry([[0, 0], [0.05, 0.005], [0.06, 0.03], [0.045, 0.08], [0.02, 0.1], [0, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 12), bm);
      const bp = new THREE.Group(); bp.position.copy(cz).add(V(0, -gr * 0.75, 0.05)); inner.add(bp); bell.position.y = -0.1; bp.add(bell);
      anim.push((dt, st) => { bp.rotation.x = Math.sin(st.t * (st.moving ? 9 : 2)) * (st.moving ? 0.4 : 0.1); });
    }
    let shellG = null;
    if (has('shell')) {
      shellG = new THREE.Group(); inner.add(shellG);
      const sh = skin('shell', { base: pal.shell || shade(pal.base, -0.1), belly: pal.shell || pal.base, pattern: 'plates', seed: R.seed + 4, patternColor: shade(pal.shell || pal.base, -0.55) });
      const sm = mat({ map: sh.map, rough: 0.55, rim: shade(pal.shell || pal.base, 0.6), rimK: 0.45 });
      const sr = gr * (P.shellR ?? 1.35);
      const dome = tube([[0, ty - gr * 0.25, -L * 0.62], [0, ty + 0.02 + (P.shellH ?? 0), 0], [0, ty - gr * 0.25, L * 0.6]], [[0, sr * 0.55, sr * 0.3], [0.2, sr * 0.92, sr * 0.75], [0.5, sr * 1.02, sr * 0.95], [0.8, sr * 0.92, sr * 0.75], [1, sr * 0.55, sr * 0.3]], sm, { flatBottom: 0.18, rings: 24, seg: 22, vScale: 0.9 });
      shellG.add(dome);
      const rim = tube([[0, ty - gr * 0.3, -L * 0.6], [0, ty - gr * 0.2, 0], [0, ty - gr * 0.3, L * 0.58]], [[0, sr * 0.6, 0.05], [0.5, sr * 1.08, 0.06], [1, sr * 0.6, 0.05]], M.dark, { rings: 18, seg: 18, cap: [0.04, 0.04] });
      shellG.add(rim);
      if (has('moss')) mossTufts(shellG, (a, b) => onTube(dome, 0.15 + a * 0.6, (b - 0.5) * 1.6, 1.0), P.mossN ?? 9, 0.06, R.seed);
      for (let i = 0; i < 5; i++) { const s = onTube(dome, 0.18 + i * 0.16, 0, 0.98); const k = rock(0.05 * (P.knobK ?? 1), sm, i, 0.2, 0); k.position.copy(s.p); k.scale.set(0.9, 0.6, 1.2); shellG.add(k); }
    } else if (has('moss')) mossTufts(inner, (a, b) => onTube(torso, 0.15 + a * 0.7, (b - 0.5) * 1.8, 0.95), P.mossN ?? 8, gr * 0.22, R.seed);
    if (has('mud')) mossTufts(inner, (a, b) => onTube(torso, 0.05 + a * 0.9, Math.PI * (0.55 + b * 0.9), 0.93), 10, gr * 0.2, R.seed + 3, pal.mud || '#4a3a28');
    if (has('glyphs')) glyphRing(inner, 4, gr * 2.6, ty + gr * 1.5, pal.glow || '#a77bff');
    if (has('embers')) embers(inner, { n: 7, w: L * 0.8, y0: ty + gr, h: 0.7 });
    if (has('wisps')) embers(inner, { n: 6, w: L * 0.9, y0: ty * 0.6, h: 0.8, size: 2.2, color: pal.glow || '#9fe0ff' });
    if (R.aura) { const au = glowSprite(pal.glow || pal.eyes, L * 2.6, 0.22); au.position.y = ty; inner.add(au); lights.push({ obj: au, color: pal.glow || pal.eyes, k: R.aura }); }
    const box3 = meshBox(inner); height = box3.max.y;
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
    const thorax = tube([[0, y, -0.02], [0, y + 0.01, thR * 1.6]], [[0, thR * 0.9, thR * 0.7], [0.5, thR, thR * 0.8], [1, thR * 0.8, thR * 0.65]], M.limb, { rings: 10, seg: 14, vScale: 0.6 });
    inner.add(thorax);
    const abd = tube([[0, y + 0.01, -0.02], [0, y + gr * 0.15, -L * 0.5], [0, y + (P.abdLift ?? 0.0), -L]], [[0, gr * 0.75, gr * 0.6 * (P.abdH ?? 1)], [0.4, gr * (P.abdW ?? 1.05), gr * 0.82 * (P.abdH ?? 1)], [1, gr * 0.5, gr * 0.4 * (P.abdH ?? 1)]], M.skin, { rings: 18, seg: 18, flatBottom: 0.7, vScale: R.patternScale ?? 1 });
    inner.add(abd);
    const headPiv = new THREE.Group(); headPiv.position.set(0, y + 0.01, thR * 1.55); inner.add(headPiv);
    const hd = makeHead({ len: 0.16, w: gr * 0.55, h: gr * 0.48, snout: 0.2, snoutW: 0.85, jaw: false, brow: false, eyesFront: 0.6, eye: gr * 0.12, eyeY: 0.3, eyeZ: 0.55, ...H });
    headPiv.add(hd.g); headParts(hd);
    // legs: coxa pivot (yaw swing), femur up and out, knee, tibia down to the ground
    const legs = [];
    const legM = P.legColor ? lazy('leg', () => mat({ color: P.legColor, rough: 0.45, metal: 0.2, rimK: 0.3 })) : M.dark;
    for (let i = 0; i < pairs; i++) for (const sx of [-1, 1]) {
      const z = lerp(thR * 1.2, -0.03 - (pairs > 3 ? L * 0.25 : 0), pairs === 1 ? 0.5 : i / (pairs - 1));
      const piv = new THREE.Group(); piv.position.set(sx * thR * 0.75, y - 0.01, z); inner.add(piv);
      piv.rotation.y = sx * lerp(-0.8, 0.75, pairs === 1 ? 0.5 : i / (pairs - 1));   // front pair reaches forward
      const fl = legLen * 0.5, kx = sx * fl * 0.92, ky = fl * 0.38;
      piv.add(tube([[0, 0, 0], [kx * 0.5, ky * 0.75, 0], [kx, ky, 0]], [[0, lt * 1.3], [0.5, lt * 1.7], [1, lt * 1.15]], legM, { rings: 8, seg: 6, cap: [lt, lt] }));
      const knee = new THREE.Group(); knee.position.set(kx, ky, 0); piv.add(knee);
      const footY = -(y - 0.01 + ky) + 0.005;
      knee.add(tube([[0, 0, 0], [sx * legLen * 0.16, footY * 0.5, 0], [sx * legLen * 0.2, footY, 0]], [[0, lt * 1.15], [0.4, lt * 1.0], [1, lt * 0.45]], legM, { rings: 8, seg: 6, cap: [lt, 0.003] }));
      legs.push({ piv, knee, sx, ph: (i % 2 === (sx > 0 ? 0 : 1)) ? 0 : Math.PI, yaw: piv.rotation.y });
    }
    let shellG = null;
    if (has('carapace')) {
      shellG = new THREE.Group(); inner.add(shellG);
      const shc = pal.shell || pal.base;
      const sh = skin('shell', { base: shc, belly: shade(shc, -0.3), pattern: R.shellPattern || (pat === 'none' ? 'mottle' : pat), seed: R.seed + 9, patternColor: pal.pattern });
      const sm = mat({ map: sh.map, rough: R.shellRough ?? 0.38, metal: R.shellMetal ?? 0.25, rim: shade(shc, 0.6), rimK: 0.55, glow: R.glowScript ? pal.glow : null, glowMap: sh.glow, glowK: 1.2 });
      const cr = gr * 1.12 * (P.shellK ?? 1);
      const dome = tube([[0, y + 0.0, thR * 0.15], [0, y + gr * 0.22 * (P.domeK ?? 1), -L * 0.42], [0, y + 0.0, -L * 1.04]], [[0, cr * 0.82, cr * 0.5], [0.3, cr * 1.0, cr * 0.85 * (P.domeK ?? 1)], [0.72, cr * 0.94, cr * 0.75 * (P.domeK ?? 1)], [1, cr * 0.4, cr * 0.25]], sm, { flatBottom: 0.15, rings: 22, seg: 22, vScale: 0.8 });
      shellG.add(dome);
      const seamPts = []; for (let i = 0; i <= 10; i++) seamPts.push(onTube(dome, 0.05 + i * 0.088, 0, 0.985).p);
      shellG.add(tube(seamPts, [[0, 0.008], [1, 0.006]], M.dark, { rings: 16, seg: 5 }));
      const pron = tube([[0, y + 0.0, -0.02], [0, y + 0.03, thR * 1.45]], [[0, thR * 1.25, thR * 1.0], [0.6, thR * 1.15, thR * 0.9], [1, thR * 0.85, thR * 0.6]], sm, { flatBottom: 0.25, rings: 12, seg: 16 });
      shellG.add(pron);
      if (has('moss')) {
        const top = (a, b) => ({ p: V((b - 0.5) * cr * 1.2, y + gr * 0.95 * (P.domeK ?? 1) - Math.abs(b - 0.5) * gr * 0.6, -L * (0.1 + a * 0.7)) });
        mossTufts(shellG, top, P.mossN ?? 7, gr * 0.3 * (P.mossK ?? 1), R.seed);
      }
      if (has('folds')) {
        // a folded paper corner standing up off the shell (Dog-Ear)
        const pm = lazy('pageStuck', () => mat({ map: pageTex('#efe4c6', '#3a2a1a'), rough: 0.85, side: THREE.DoubleSide, alphaTest: 0.3, rimK: 0.3 }));
        for (let i = 0; i < 4; i++) { const s = onTube(dome, 0.2 + i * 0.18, (i % 2 ? 1 : -1) * 0.5, 1.0); const p = mesh(new THREE.PlaneGeometry(gr * 0.8, gr * 0.6), pm); p.position.copy(s.p); p.lookAt(s.p.clone().add(s.n).add(V(0, 0.5, -0.4))); p.rotateX(-0.7); shellG.add(p); }
      }
    }
    // pincers
    const claws = [];
    if (has('pincers')) for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * thR * 0.8, y + 0.01, thR * 1.3); inner.add(sh);
      sh.rotation.y = sx * 0.55;
      const cs = (P.claw ?? 1) * (sx > 0 ? 1 : (P.clawL ?? 1)), a1 = gr * 0.9 * cs;
      sh.add(tube([[0, 0, 0], [sx * a1 * 0.5, 0.04, a1 * 0.3], [sx * a1 * 0.7, 0.05, a1 * 0.7]], [[0, lt * 2 * Math.sqrt(cs)], [1, lt * 1.7 * Math.sqrt(cs)]], M.limb, { rings: 8, seg: 8 }));
      const el = new THREE.Group(); el.position.set(sx * a1 * 0.7, 0.05, a1 * 0.7); el.rotation.y = -sx * 0.9; sh.add(el);
      el.add(tube([[0, 0, 0], [0, 0, a1 * 0.5]], [[0, lt * 1.7 * Math.sqrt(cs)], [1, lt * 2.2 * Math.sqrt(cs)]], M.limb, { rings: 6, seg: 8 }));
      const palm = tube([[0, 0, a1 * 0.45], [0, 0.005, a1 * 0.95]], [[0, gr * 0.22 * cs, gr * 0.17 * cs], [0.5, gr * 0.3 * cs, gr * 0.2 * cs], [1, gr * 0.15 * cs, gr * 0.12 * cs]], M.skin, { rings: 10, seg: 12 });
      el.add(palm);
      el.add(spike([[sx * gr * 0.06, 0, a1 * 0.9], [sx * gr * 0.09, 0, a1 * 1.2], [sx * gr * 0.02, 0, a1 * 1.45]], gr * 0.09 * cs, M.limb, { rings: 8 }));
      const mv = new THREE.Group(); mv.position.set(-sx * gr * 0.08, 0, a1 * 0.9); el.add(mv);
      mv.add(spike([[0, 0, 0], [-sx * gr * 0.04, 0, a1 * 0.3], [sx * gr * 0.04, 0, a1 * 0.52]], gr * 0.08 * cs, M.limb, { rings: 8 }));
      claws.push({ sh, el, mv, sx });
    }
    // stinger tail: a chain of beads curling up and over
    let sting = null;
    if (kind('tail') === 'stinger') {
      sting = []; let cur = inner; const n = 6, sl = (P.tail ?? 0.55) / n;
      const tm = R.glassTail ? lazy('glass', () => mat({ color: pal.glass || '#bfe8e0', rough: 0.08, metal: 0.3, emissive: pal.glow, emissiveK: 0.35, rim: '#ffffff', rimK: 0.9 })) : M.skin;
      for (let i = 0; i < n; i++) {
        const p = new THREE.Group(); if (i === 0) p.position.set(0, y + 0.02, -L * 0.98); else p.position.set(0, 0, -sl);
        cur.add(p); sting.push(p); cur = p;
        const r0 = gr * (P.tailR ?? 0.42) * (1 - i * 0.07);
        p.add(tube([[0, 0, sl * 0.2], [0, 0, -sl * 1.15]], [[0, r0 * 0.8, r0 * 0.7], [0.55, r0 * 1.05, r0 * 0.85], [1, r0 * 0.8, r0 * 0.7]], tm, { rings: 9, seg: 10, vScale: 0.3, cap: [r0 * 0.4, r0 * 0.4], flat: R.glassTail }));
        p.add(spike([[0, r0 * 0.6, -sl * 0.2], [0, r0 * 0.95, -sl * 0.55]], r0 * 0.3, M.limb, { rings: 4, seg: 5 }));
      }
      const bulbG = new THREE.Group(); bulbG.position.set(0, 0, -sl); cur.add(bulbG);
      bulbG.add(tube([[0, 0, 0.02], [0, -0.005, -gr * 0.45]], [[0, gr * 0.22], [0.5, gr * 0.28], [1, gr * 0.12]], lazy('bulb', () => mat({ color: pal.accent, rough: 0.35, glow: pal.glow, glowK: 0.35 })), { rings: 10, seg: 10 }));
      bulbG.add(spike([[0, -0.005, -gr * 0.4], [0, -gr * 0.1, -gr * 0.65], [0, -gr * 0.32, -gr * 0.7]], gr * 0.08, M.dark, { rings: 8 }));
      if (pal.glow) { const gl = glowSprite(pal.glow, gr * 1.6, 0.6); gl.position.set(0, 0, -gr * 0.2); bulbG.add(gl); }
    }
    if (R.aura) { const au = glowSprite(pal.glow || pal.eyes, L * 3, 0.22); au.position.y = y; inner.add(au); lights.push({ obj: au, color: pal.glow || pal.eyes, k: R.aura }); }
    const box3 = meshBox(inner); height = box3.max.y;
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
    // rock golems and stone constructs: solid limbs (one tapered loft per bone, a rock at the elbow), big fists
    const legLen = P.legLen ?? 0.5, tl = P.torso ?? 0.85, gr = P.girth ?? 0.42, sw = P.shoulders ?? 0.55, al = P.armLen ?? 1.0, at = P.armThick ?? 0.15, hunch = P.hunch ?? 0.4;
    const rockS = R.flat;
    const py = legLen + 0.06;
    const jit = rockS ? 0.045 : 0;
    const boxy = !!P.boxy;
    let torso;
    if (boxy) {
      // a walking bookcase: a frame of boards with rows of books
      const wd = woodM();
      const fw = gr * 2.1, fh = tl * 1.15, fd = gr * 1.1;
      torso = new THREE.Group(); torso.position.set(0, py, 0); inner.add(torso);
      const cy = fh / 2;
      for (const sx of [-1, 1]) { const s = box(0.05, fh, fd, wd); s.position.set(sx * fw / 2, cy, 0); torso.add(s); }
      for (let i = 0; i <= 3; i++) { const s = box(fw, 0.045, fd, wd); s.position.set(0, i * fh / 3, 0); torso.add(s); }
      const back = box(fw, fh, 0.03, wd); back.position.set(0, cy, -fd / 2); torso.add(back);
      const r = rng(R.seed + 4); const bookCols = pal.books || ['#7a2a24', '#2a4a6a', '#3a5a2a', '#8a6a2a', '#4a2a5a'];
      for (let row = 0; row < 3; row++) { let x = -fw / 2 + 0.04; while (x < fw / 2 - 0.06) { const bw = 0.035 + r() * 0.035, bh = fh / 3 * (0.6 + r() * 0.3); const bk = box(bw, bh, fd * 0.8, lazy('book' + (row * 7 + Math.floor(x * 50)) % 5, () => mat({ color: bookCols[Math.floor(r() * bookCols.length)], rough: 0.7, rimK: 0.25 }))); bk.position.set(x + bw / 2, row * fh / 3 + 0.025 + bh / 2, 0.02); bk.rotation.z = (r() - 0.5) * 0.15; torso.add(bk); x += bw + 0.005; } }
      torso.userData.boxTop = py + fh;
    } else {
      torso = tube([[0, py - 0.08, -0.02], [0, py + tl * 0.45, tl * hunch * 0.15], [0, py + tl * 0.92, tl * hunch * 0.45]],
        [[0, gr * 0.78, gr * 0.62], [0.4, gr * 0.9, gr * 0.7], [0.78, gr * 1.25, gr * 0.9], [1, gr * 1.0, gr * 0.75]],
        M.skin, { up: V(0, 0, 1), rings: rockS ? 12 : 18, seg: rockS ? 10 : 16, jitter: jit * 1.5, seed: R.seed, vScale: R.patternScale ?? 1, cap: [gr * 0.4, gr * 0.5] });
      inner.add(torso);
    }
    const chestY = boxy ? py + tl * 1.0 : py + tl * 0.8, chestZ = boxy ? 0 : tl * hunch * 0.36;
    const headPiv = new THREE.Group(); headPiv.position.set(0, chestY + gr * (boxy ? 0.45 : 0.3), chestZ + gr * (boxy ? 0 : 0.5)); inner.add(headPiv);
    const hs = P.head ?? 0.2;
    if (H.kind === 'lamp') {
      // a lantern for a head (the Wickwright)
      const iron = metalM();
      const gl = mesh(new THREE.CylinderGeometry(hs * 0.7, hs * 0.7, hs * 1.3, 8), lazy('lampGlass', () => mat({ color: '#ffe2a8', emissive: pal.glow || '#ffc46b', emissiveK: 2.2, rough: 0.25 }))); headPiv.add(gl);
      for (let i = 0; i < 6; i++) { const b = box(0.02, hs * 1.4, 0.02, iron); const a = i / 6 * TAU; b.position.set(Math.cos(a) * hs * 0.72, 0, Math.sin(a) * hs * 0.72); headPiv.add(b); }
      const cap = mesh(new THREE.ConeGeometry(hs * 0.95, hs * 0.6, 8), iron); cap.position.y = hs * 0.95; headPiv.add(cap);
      const sp = glowSprite(pal.glow || '#ffc46b', hs * 6, 0.8); headPiv.add(sp); lights.push({ obj: sp, color: pal.glow || '#ffc46b', k: 2.2 });
    } else {
      const headMesh = rockS ? rock(hs, M.skin, R.seed + 2, 0.25, 1) : boxy ? box(hs * 1.6, hs * 1.1, hs * 1.3, woodM()) : ell(hs, hs, hs, M.skin, 14);
      headMesh.scale.multiply(V(1.1, 0.85, 1)); headPiv.add(headMesh);
      const brow = rockS ? rock(hs * 0.75, M.skin, R.seed + 5, 0.2, 0) : box(hs * 1.4, hs * 0.3, hs * 0.6, boxy ? woodM() : M.skin); brow.scale.multiply(rockS ? V(1.5, 0.45, 0.8) : V(1, 1, 1)); brow.position.set(0, hs * 0.32, hs * 0.45); headPiv.add(brow);
      for (const sx of [-1, 1]) { const e = glowEye(hs * 0.16, pal.eyes, { slit: true, socket: true }); e.position.set(sx * hs * 0.38, hs * 0.1, hs * (boxy ? 0.68 : 0.82)); e.rotation.z = sx * 0.25; headPiv.add(e); }
      if (pal.glow && !H.noMouth) { const m = box(hs * 0.7, hs * 0.07, hs * 0.1, M.glow); m.position.set(0, -hs * 0.35, hs * 0.85); headPiv.add(m); }
    }
    if (has('crown')) crown(headPiv, hs * 0.85, hs * 0.55, 0);
    if (has('helm')) {
      const hm = metalM();
      const dome = mesh(new THREE.SphereGeometry(hs * 1.18, 14, 10, 0, TAU, 0, Math.PI * 0.55), hm); dome.position.y = hs * 0.05; headPiv.add(dome);
      const crest = box(hs * 0.15, hs * 0.6, hs * 1.9, kind('helm') === 'plume' ? lazy('plume', () => mat({ color: pal.plume || '#a82a24', rough: 0.9 })) : hm); crest.position.y = hs * 1.15; headPiv.add(crest);
    }
    // shoulders, arms, fists: one solid tapered limb per bone, an elbow rock that bridges the joint
    const arms = [];
    const ua = al * 0.45, fa = al * 0.42, fistR = P.fist ?? (rockS ? 0.22 : 0.18);
    for (const sx of [-1, 1]) {
      const sp = new THREE.Group(); sp.position.set(sx * sw, chestY, chestZ); inner.add(sp);
      const pad = rockS ? rock(gr * 0.52, M.skin, R.seed + 10 + sx, 0.14, 1) : boxy ? box(gr * 0.8, gr * 0.5, gr * 0.8, woodM()) : ell(gr * 0.5, gr * 0.42, gr * 0.5, M.skin, 12);
      pad.position.set(-sx * 0.02, 0.06, 0); pad.scale.multiply(V(1.05, 0.8, 1)); sp.add(pad);
      const limbOpts = (seed) => ({ up: V(0, 0, 1), rings: rockS ? 9 : 12, seg: rockS ? 9 : 12, jitter: jit, seed: R.seed + seed, cap: [at * 0.9, at * 0.9] });
      sp.add(tube([[0, 0.08, 0], [sx * 0.04, -ua * 0.5, 0.0], [sx * 0.06, -ua - at * 0.3, 0.03]], [[0, at * 1.45], [0.5, at * 1.2], [1, at * 1.05]], M.limb, limbOpts(20 + sx)));
      const el = new THREE.Group(); el.position.set(sx * 0.06, -ua, 0.03); sp.add(el);
      el.add(rockS ? rock(at * 1.22, M.limb, R.seed + 33 + sx, 0.12, 1) : ell(at * 1.15, at * 1.15, at * 1.15, M.limb, 12));
      el.add(tube([[0, at * 0.3, 0], [0, -fa * 0.5, 0.04], [0, -fa, 0.06]], [[0, at * 1.1], [0.6, at * 1.35], [1, at * 1.5]], M.limb, limbOpts(30 + sx)));
      const fist = rockS ? rock(fistR, M.limb, R.seed + 40 + sx, 0.18, 1) : boxy ? box(fistR * 1.6, fistR * 1.6, fistR * 1.6, woodM()) : ell(fistR, fistR, fistR, M.limb, 12);
      fist.position.set(0, -fa - fistR * 0.45, 0.08); fist.scale.multiply(V(1, 0.9, 1.1)); el.add(fist);
      const hand = new THREE.Group(); hand.position.set(0, -fa - fistR * 0.45, 0.08); el.add(hand);
      arms.push({ sp, el, sx, hand });
    }
    const legs = [];
    for (const sx of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(sx * gr * 0.5, py, 0); inner.add(hp);
      hp.add(tube([[0, 0.12, 0], [0, -legLen * 0.5, 0.02], [0, -legLen + 0.08, 0.02]], [[0, gr * 0.48], [0.5, gr * 0.42], [1, gr * 0.38]], M.limb, { up: V(0, 0, 1), rings: rockS ? 9 : 10, seg: rockS ? 9 : 12, jitter: jit, seed: R.seed + 50 + sx, cap: [gr * 0.3, gr * 0.3] }));
      const foot = rockS ? rock(gr * 0.42, M.limb, R.seed + 60 + sx, 0.16, 1) : boxy ? box(gr * 0.7, gr * 0.3, gr * 0.9, woodM()) : ell(gr * 0.35, gr * 0.2, gr * 0.45, M.limb, 12);
      foot.position.set(0, -legLen + 0.1, 0.08); foot.scale.multiply(rockS ? V(1.05, 0.55, 1.3) : V(1, 1, 1)); hp.add(foot);
      legs.push({ hp, sx });
    }
    if (has('core') && pal.glow) {
      // a molten heart showing through a split in the chest
      const cpos = boxy ? V(0, chestY - tl * 0.3, gr * 0.6) : onTube(torso, 0.62, 0, 0.93).p;
      const core = mesh(new THREE.OctahedronGeometry(gr * 0.17, 0), M.glow); core.position.copy(cpos); core.scale.set(1, 1.3, 0.6); inner.add(core);
      if (!boxy) for (const sx of [-1, 1]) { const lip = rock(gr * 0.16, M.skin, R.seed + 80 + sx, 0.2, 0); lip.position.copy(cpos).add(V(sx * gr * 0.17, 0, 0.0)); lip.scale.set(0.7, 1.5, 0.7); inner.add(lip); }
      const gl = glowSprite(pal.glow, gr * 1.6, 0.6); gl.position.copy(cpos).add(V(0, 0, 0.05)); inner.add(gl); lights.push({ obj: gl, color: pal.glow, k: P.coreK ?? 1.5 });
      anim.push((dt, st) => { core.rotation.y = st.t * 1.5; gl.material.opacity = 0.6 + Math.sin(st.t * 3) * 0.15 + (st._att || 0) * 0.3; });
    }
    if (has('furnace') && pal.glow) {
      // a furnace door in the belly: an iron frame and a grate of fire
      const fc = V(0, py + tl * 0.42, onTube(torso, 0.42, 0, 1).p.z + 0.02);
      const fireM = lazy('fire', () => mat({ color: '#2a0e04', emissive: pal.glow, emissiveK: 2.6, rough: 0.6 }));
      const fire = box(gr * 0.75, gr * 0.6, 0.04, fireM); fire.position.copy(fc); inner.add(fire);
      for (let i = -1; i <= 1; i++) { const bar = box(0.025, gr * 0.62, 0.03, metalM()); bar.position.copy(fc).add(V(i * gr * 0.22, 0, 0.03)); inner.add(bar); }
      const fr2 = mesh(new THREE.TorusGeometry(gr * 0.45, 0.03, 4, 4), metalM()); fr2.rotation.z = Math.PI / 4; fr2.scale.set(1.15, 0.95, 1); fr2.position.copy(fc).add(V(0, 0, 0.02)); inner.add(fr2);
      const gl = glowSprite(pal.glow, gr * 2.4, 0.6); gl.position.copy(fc).add(V(0, 0, 0.15)); inner.add(gl); lights.push({ obj: gl, color: pal.glow, k: 2.2 });
      for (const sx of [-1, 1]) { const ch = cyl(0.06, 0.08, 0.4, metalM(), 8); ch.position.set(sx * gr * 0.5, chestY + gr * 0.5, chestZ - gr * 0.4); inner.add(ch); }
      embers(inner, { n: 8, w: gr, y0: chestY + gr * 0.6, h: 0.9, zc: chestZ - gr * 0.4 });
    }
    if (has('crystals')) {
      // glassy slag spikes: black glass, a glowing root, a hot rim
      const cm = mat({ color: pal.crystal || '#1a1418', rough: 0.12, metal: 0.5, glow: pal.glow, glowMap: rootTex, glowK: 1.6, rim: pal.glow || '#ffffff', rimK: 0.55, flat: true });
      const spots = [[sw * 0.95, chestY + gr * 0.3, chestZ - 0.02], [-sw * 0.95, chestY + gr * 0.3, chestZ - 0.02], [0.16, chestY + gr * 0.2, chestZ - gr * 0.55], [-0.14, chestY - gr * 0.15, chestZ - gr * 0.62], [0, chestY + gr * 0.45, chestZ - gr * 0.25]];
      spots.forEach(([x, yy, z], i) => {
        const c = new THREE.Group(); c.position.set(x, yy, z); inner.add(c);
        for (let k = 0; k < 4; k++) { const h = 0.14 + hash(i, k) * 0.22; const g = new THREE.CylinderGeometry(0.004, 0.045 + hash(k, i) * 0.03, h, 5, 1); g.translate(0, h / 2, 0); const m = mesh(g, cm); m.rotation.set((hash(i, k, 2) - 0.5) * 1.3 - (z < chestZ ? 0.6 : 0), hash(i, k, 5) * 3, (hash(i, k, 3) - 0.5) * 1.3 - Math.sign(x) * 0.5); c.add(m); }
      });
    }
    if (has('candles')) {
      const wax = lazy('wax', () => mat({ color: '#e8dcc0', rough: 0.6, rimK: 0.3 }));
      const spots = [[sw * 0.95, chestY + gr * 0.42, chestZ], [-sw * 0.95, chestY + gr * 0.42, chestZ], [sw * 0.6, chestY + gr * 0.55, chestZ - 0.1], [-sw * 0.5, chestY + gr * 0.5, chestZ - 0.12]];
      spots.forEach(([x, yy, z], i) => { const h = 0.12 + hash(i) * 0.1; const c = cyl(0.03, 0.035, h, wax, 8); c.position.set(x, yy + h / 2, z); inner.add(c); const f = glowSprite('#ffc46b', 0.18, 0.9); f.position.set(x, yy + h + 0.04, z); inner.add(f); });
    }
    if (has('runes') && pal.glow) {
      const rm = M.glow;
      for (let i = 0; i < 5; i++) { const s = boxy ? null : onTube(torso, 0.25 + i * 0.13, (i % 2 ? 1 : -1) * 0.5, 1.0); if (!s) break; const r2 = box(0.06, 0.012, 0.012, rm); r2.position.copy(s.p); r2.lookAt(s.p.clone().add(s.n)); r2.rotateZ(i); inner.add(r2); }
    }
    if (has('rings') && pal.glow) {
      // echo rings: glowing hoops that pulse out from the body
      const rings = [];
      for (let i = 0; i < 3; i++) { const rg = new THREE.Mesh(new THREE.TorusGeometry(gr * 1.4, 0.012, 4, 32), new THREE.MeshBasicMaterial({ color: pal.glow, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); rg.rotation.x = Math.PI / 2; rg.position.y = chestY; rg.userData.keep = true; inner.add(rg); rings.push(rg); }
      anim.push((dt, st) => rings.forEach((rg, i) => { const k = (st.t * 0.5 + i / 3) % 1; rg.scale.setScalar(0.7 + k * 1.2); rg.material.opacity = 0.5 * (1 - k); }));
    }
    if (has('stones')) {
      // cairn stones stacked up the back and shoulders
      const r = rng(R.seed + 21);
      for (let i = 0; i < 8; i++) { const s = rock(gr * (0.16 + r() * 0.12), M.limb, i + 90, 0.25, 0); s.position.set((r() - 0.5) * sw * 1.6, chestY + gr * (0.2 + r() * 0.5), chestZ - gr * (0.4 + r() * 0.3)); inner.add(s); }
    }
    for (const a of arms) if (a.sx < 0 && R.weapon) weapon(a.hand, R.weapon);
    if (has('shield')) { const a = arms.find((x) => x.sx > 0); shield(a.el, kind('shield'), a.sx, -fa * 0.55, at * 1.4); }
    if (has('embers')) embers(inner, { n: 8, w: sw * 2, y0: chestY, h: 1.0, zc: chestZ });
    if (R.aura) { const au = glowSprite(pal.glow || pal.eyes, (P.auraS ?? 3) * gr, 0.22); au.position.y = chestY; inner.add(au); lights.push({ obj: au, color: pal.glow || pal.eyes, k: R.aura }); }
    const box3 = meshBox(inner); height = box3.max.y;
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

  else if (R.body === 'humanoid') {
    // people and ghosts: legs with knees (or a ghost's trailing hem), a torso, a head under a hood, helm or hat, arms
    // with elbows and a weapon in the right hand; cloaks, robes, armour and kit are parts
    const Hh = P.height ?? 1.75, b = P.bulk ?? 1, ghostly = has('ghost');
    const hipY = Hh * (P.legs ?? 0.5);
    const torL = Hh * 0.3 * (P.torsoK ?? 1);
    const shY = hipY + torL, lean = P.hunch ?? 0.03;
    const hs = (P.head ?? 1) * 1.18 * Hh / 1.75;
    const sw = 0.195 * b * (P.shoulders ?? 1);
    const clothBase = pal.base;
    const cloth = lazy('cloth', () => mat({ map: clothTex(clothBase, 0, pal.trim || null), rough: 0.88, rim: shade(clothBase, 0.5), rimK: 0.4 }));
    const cloth2 = lazy('cloth2', () => mat({ map: clothTex(pal.cloth2 || shade(clothBase, -0.25)), rough: 0.9, rim: shade(pal.cloth2 || clothBase, 0.5), rimK: 0.35 }));
    const flesh = fleshM();
    const legs = [];
    // piecesOnly (src/render3d/foe_human.js): only the kit's dress and kit; the rigged human body is the game's own
    const PO = !!R.piecesOnly;
    if (!ghostly && !PO) {
      const legL = hipY - 0.03, thighL = legL * 0.5, shinL = legL * 0.5;
      const legM = pal.legs ? lazy('legsM', () => mat({ map: clothTex(pal.legs), rough: 0.9, rimK: 0.3 })) : cloth2;
      const bootM = pal.boots ? lazy('boots', () => mat({ color: pal.boots, rough: 0.6, rimK: 0.3 })) : leatherM();
      for (const sx of [-1, 1]) {
        const hip = new THREE.Group(); hip.position.set(sx * 0.1 * b, hipY, 0); inner.add(hip);
        hip.add(tube([[0, 0.06, 0], [0, -thighL * 0.5, 0.012], [0, -thighL, 0]], [[0, 0.104 * b], [0.5, 0.09 * b], [1, 0.074 * b]], legM, { up: V(0, 0, 1), rings: 9, seg: 12, cap: [0.06, 0.04] }));
        const knee = new THREE.Group(); knee.position.set(0, -thighL, 0); hip.add(knee);
        knee.add(ell(0.076 * b, 0.08 * b, 0.078 * b, legM, 10));
        knee.add(tube([[0, 0.0, 0], [0, -shinL * 0.45, -0.012], [0, -shinL + 0.07, 0]], [[0, 0.07 * b], [0.35, 0.078 * b], [1, 0.066 * b]], bootM, { up: V(0, 0, 1), rings: 8, seg: 12, cap: [0.03, 0.03] }));
        const boot = tube([[0, -shinL + 0.06, -0.05], [0, -shinL + 0.045, 0.05], [0, -shinL + 0.04, 0.13 * b]], [[0, 0.072 * b, 0.06], [0.6, 0.066 * b, 0.05], [1, 0.054 * b, 0.036]], bootM, { rings: 8, seg: 12, flatBottom: 0.45 });
        knee.add(boot);
        if (has('greaves')) { const gv = tube([[0, -0.02, 0.01], [0, -shinL * 0.7, 0.015]], [[0, 0.064 * b, 0.07 * b], [1, 0.055 * b, 0.06 * b]], metalM(), { up: V(0, 0, 1), rings: 5, seg: 10, flatBottom: 0.3, cap: [0.01, 0.01] }); knee.add(gv); }
        legs.push({ hip, knee, sx });
      }
    }
    // torso
    const tw = 0.175 * b, td = 0.118 * b * (P.chestDepth ?? 1);
    if (!ghostly && !PO) { const pelvis = ell(tw * 1.0, 0.11, td * 1.05, cloth2, 14); pelvis.position.set(0, hipY + 0.01, 0); inner.add(pelvis); }
    const torso = tube([[0, hipY - 0.07, 0], [0, hipY + torL * 0.45, lean * 0.4], [0, shY, lean]],
      [[0, tw * 0.98, td * 0.98], [0.35, tw * (P.waist ?? 0.9), td * (0.95 + (P.belly ?? 0))], [0.75, tw * 1.16, td * 1.08], [0.95, tw * 1.12, td * 0.95], [1, tw * 0.95, td * 0.85]],
      cloth, { up: V(0, 0, 1), rings: 12, seg: 16, vNorm: true, cap: [0.03, 0.045] });
    if (!PO) inner.add(torso);
    const neck = tube([[0, shY - 0.03, lean], [0, shY + 0.08, lean + 0.01]], [[0, 0.066 * b], [1, 0.058 * b]], ghostly ? cloth : flesh, { rings: 5, seg: 8 });
    if (!PO) inner.add(neck);
    // the head
    const headPiv = new THREE.Group(); headPiv.position.set(0, shY + 0.1 * hs / (Hh / 1.75) * (Hh / 1.75), lean + 0.015); inner.add(headPiv);
    const hk = H.kind || 'bare';
    const hr = PO ? 0.1 * Hh / 1.75 : 0.105 * hs;   // on the rigged human the dress fits its own (smaller) head
    const faceM = hk === 'skull' ? lazy('bone', () => mat({ color: pal.bone || '#d8d0bc', rough: 0.6, rimK: 0.4 })) : ghostly && hk !== 'faceless' ? cloth : flesh;
    const skull = ell(hr * 0.9, hr * 1.08, hr, faceM, 16); skull.position.y = hr * 0.9; if (!PO || hk === 'skull') headPiv.add(skull);
    // a face that reads at game zoom: a jaw, a nose, ears (hidden under hoods, masks and great helms)
    const faceParts = [];
    if (!ghostly && !PO && hk !== 'faceless' && hk !== 'skull') {
      const jaw = ell(hr * 0.72, hr * 0.5, hr * 0.78, faceM, 12); jaw.position.set(0, hr * 0.42, hr * 0.14); faceParts.push(jaw);
      const nose = ell(hr * 0.13, hr * 0.2, hr * 0.17, faceM, 8); nose.position.set(0, hr * 0.78, hr * 0.98); faceParts.push(nose);
      for (const sx of [-1, 1]) { const ear = ell(hr * 0.1, hr * 0.2, hr * 0.13, faceM, 8); ear.position.set(sx * hr * 0.9, hr * 0.88, -hr * 0.02); faceParts.push(ear); }
      faceParts.forEach((m) => headPiv.add(m));
    }
    const eyeY = hr * 0.98, eyeZ = hr * 0.86;
    const eyesGlow = H.eyes !== 'plain';
    const putEyes = (z = eyeZ, sep = 0.36, r = 0.17, y = eyeY) => {
      if (hk === 'faceless') return;
      if (PO && !R.ghost && !/^(hood|cowl|veil|mask|wrap|skull|greathelm)$/.test(hk)) return;   // the human face shows
      for (const sx of [-1, 1]) {
        if (eyesGlow) { const e = glowEye(hr * r, pal.eyes, { socket: false, slit: !!H.slit }); e.position.set(sx * hr * sep, y, z); headPiv.add(e); }
        else { const e = ell(hr * 0.1, hr * 0.12, hr * 0.06, M.dark, 8); e.position.set(sx * hr * sep, y, z); headPiv.add(e); }
      }
    };
    if (hk === 'hood' || hk === 'cowl' || hk === 'veil') {
      // a deep hood, open at the front, with a dark face inside and two lights for eyes (a veil: sheer, the pale face shows)
      const veil = hk === 'veil';
      const hm = veil ? lazy('veilM', () => { const m2 = mat({ color: pal.veil || '#d8e8f0', rough: 0.8, side: THREE.DoubleSide, emissive: pal.glow, emissiveK: 0.25, rim: '#ffffff', rimK: 0.7 }); m2.transparent = true; m2.opacity = Math.min(m2.opacity, 0.6); m2.depthWrite = false; m2.userData.baseOpacity = m2.opacity; return m2; }) : pal.hood ? lazy('hoodM', () => mat({ map: clothTex(pal.hood), rough: 0.9, side: THREE.DoubleSide, rim: shade(pal.hood, 0.5), rimK: 0.45 })) : lazy('clothD', () => mat({ map: clothTex(clothBase, 0, pal.trim || null), rough: 0.88, side: THREE.DoubleSide, rim: shade(clothBase, 0.5), rimK: 0.45 }));
      const gap = veil ? 1.4 : 1.2;
      const prof = [[2.0, -1.25], [1.75, -0.85], [1.38, -0.2], [1.3, 0.6], [1.22, 1.3], [0.95, 1.85], [0.55, 2.25], [0.2, 2.55], [0.02, 2.7]].map(([r, y]) => new THREE.Vector2(r * hr, y * hr));
      const hg = new THREE.LatheGeometry(prof, 20, gap / 2, TAU - gap);
      { const pp = hg.attributes.position; for (let i = 0; i < pp.count; i++) { const y = pp.getY(i) / hr; if (y > 1.1) pp.setZ(i, pp.getZ(i) - (y - 1.1) * (y - 1.1) * hr * 0.35); } hg.computeVertexNormals(); }
      const hood = mesh(hg, hm); hood.position.set(0, hr * 0.55, -hr * 0.1); headPiv.add(hood);
      if (veil) {
        putEyes(eyeZ, 0.34, 0.13);
        const drape = tube([[0, hr * 1.3, -hr * 0.6], [0, -hr * 0.6, -hr * 1.1], [0, -hr * 3.2, -hr * 1.5]], [[0, hr * 1.2, hr * 0.5], [1, hr * 2.0, hr * 0.6]], hm, { rings: 10, seg: 12, cap: [0.001, 0.001] }); headPiv.add(drape);
      } else {
        faceParts.forEach((m) => { m.visible = false; });
        const face = ell(hr * 0.85, hr * 0.95, hr * 0.5, lazy('void', () => mat({ color: '#050408', rough: 1, rimK: 0 })), 12); face.position.set(0, hr * 0.85, hr * 0.42); headPiv.add(face);
        if (PO) { face.position.z = hr * 0.98; face.scale.z = hr * 0.25; }   // in front of the human face: only dark and two lights
        skull.visible = false;
        putEyes(hr * (PO ? 1.12 : 0.88), 0.34, 0.16, hr * 0.92);
      }
      if (hk === 'cowl') { const sc = tube([[-hr * 1.1, hr * 0.15, hr * 0.3], [0, -hr * 0.1, hr * 0.9], [hr * 1.1, hr * 0.15, hr * 0.3]], [[0, hr * 0.35], [1, hr * 0.35]], hm, { rings: 10, seg: 8 }); headPiv.add(sc); }
    } else if (hk === 'helm' || hk === 'greathelm' || hk === 'kettle') {
      const hm = metalM();
      putEyes(eyeZ, 0.34, 0.15);
      if (hk === 'greathelm') {
        const gh = tube([[0, -hr * 0.15, 0], [0, hr * 1.9, 0]], [[0, hr * 1.12, hr * 1.18], [0.85, hr * 1.12, hr * 1.18], [1, hr * 0.7, hr * 0.75]], hm, { rings: 10, seg: 16, up: V(0, 0, 1), cap: [0.001, hr * 0.5] }); headPiv.add(gh);
        const slit = box(hr * 1.3, hr * 0.12, 0.02, pal.glow ? M.glow : M.dark); slit.position.set(0, hr * 1.05, hr * 1.17); headPiv.add(slit);
        skull.visible = false; faceParts.forEach((m) => { m.visible = false; });
      } else {
        const dome = mesh(new THREE.SphereGeometry(hr * 1.14, 14, 10, 0, TAU, 0, Math.PI * 0.52), hm); dome.position.y = hr * 0.98; headPiv.add(dome);
        if (hk === 'kettle') { const brim = cyl(hr * 1.75, hr * 1.85, hr * 0.08, hm, 18); brim.position.y = hr * 1.0; headPiv.add(brim); }
        else { const nose = box(hr * 0.14, hr * 0.75, hr * 0.12, hm); nose.position.set(0, hr * 0.78, hr * 1.08); headPiv.add(nose); for (const sx of [-1, 1]) { const ch = box(hr * 0.1, hr * 0.8, hr * 0.7, hm); ch.position.set(sx * hr * 0.95, hr * 0.55, hr * 0.2); headPiv.add(ch); } }
      }
    } else if (hk === 'hat' || hk === 'tricorn' || hk === 'tall' || hk === 'cap' || hk === 'wide') {
      putEyes(eyeZ, 0.36, 0.14);
      const hm = pal.hat ? lazy('hatM', () => mat({ color: pal.hat, rough: 0.85, rim: shade(pal.hat, 0.5), rimK: 0.4 })) : lazy('hatM', () => mat({ color: shade(clothBase, -0.35), rough: 0.85, rimK: 0.35 }));
      const bw = hk === 'wide' ? 2.6 : hk === 'cap' ? 1.15 : hk === 'tall' ? 1.6 : 1.9;
      const brim = cyl(hr * bw, hr * bw, hr * 0.07, hm, hk === 'tricorn' ? 3 : 20); brim.position.y = hr * 1.62; if (hk === 'tricorn') brim.rotation.y = Math.PI; if (hk === 'cap') { brim.position.z = hr * 0.5; brim.scale.z = 0.8; } headPiv.add(brim);
      const ch = hk === 'tall' ? hr * 1.5 : hk === 'cap' ? hr * 0.35 : hr * 0.75;
      const crownM = cyl(hr * (hk === 'cap' ? 1.0 : 0.95), hr * 1.0, ch, hm, 16); crownM.position.y = hr * 1.62 + ch / 2; headPiv.add(crownM);
      if (pal.hatband) { const band = cyl(hr * 1.02, hr * 1.02, hr * 0.18, lazy('band', () => mat({ color: pal.hatband, rough: 0.6 })), 16); band.position.y = hr * 1.75; headPiv.add(band); }
    } else if (hk === 'wrap') {
      // a desert head wrap and a face cloth: only the eyes show
      const wm = lazy('wrapM', () => mat({ map: clothTex(pal.wrap || pal.trim || '#c8a878'), rough: 0.9, rim: '#fff0d0', rimK: 0.4 }));
      const wrap = ell(hr * 1.12, hr * 0.85, hr * 1.12, wm, 14); wrap.position.y = hr * 1.45; headPiv.add(wrap);
      const veil = tube([[-hr * 0.95, hr * 0.6, 0], [0, hr * 0.55, hr * 1.02], [hr * 0.95, hr * 0.6, 0]], [[0, hr * 0.42], [1, hr * 0.42]], wm, { rings: 10, seg: 10 }); headPiv.add(veil);
      const tail = spike([[0, 0, 0], [0.02, -0.1, -0.08], [0.05, -0.3, -0.12]], hr * 0.35, wm, { rings: 8 }); tail.position.set(0, hr * 1.3, -hr * 0.9); headPiv.add(tail);
      putEyes(eyeZ + 0.005, 0.34, 0.15);
    } else if (hk === 'minerhelm') {
      putEyes(eyeZ, 0.36, 0.14);
      const hm = lazy('mhelm', () => mat({ color: pal.helmC || '#6a5a3a', rough: 0.55, metal: 0.4, rim: '#e8d8a0', rimK: 0.4 }));
      const dome = mesh(new THREE.SphereGeometry(hr * 1.15, 14, 10, 0, TAU, 0, Math.PI * 0.5), hm); dome.position.y = hr * 1.0; headPiv.add(dome);
      const brim = cyl(hr * 1.35, hr * 1.4, hr * 0.06, hm, 16); brim.position.y = hr * 1.0; headPiv.add(brim);
      const lamp = cyl(hr * 0.28, hr * 0.32, hr * 0.3, metalM(), 10); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, hr * 1.55, hr * 1.0); headPiv.add(lamp);
      const lg = glowSprite(pal.lamp || '#ffd27a', hr * 6, 0.9); lg.position.set(0, hr * 1.55, hr * 1.25); headPiv.add(lg); lights.push({ obj: lg, color: pal.lamp || '#ffd27a', k: 1.8 });
    } else if (hk === 'mask') {
      // an iron mask over the face (the Ashen Crew): eye holes glow
      const mm = metalM();
      const mk = mesh(new THREE.SphereGeometry(hr * 1.06, 14, 10, Math.PI / 2 - 1.25, 2.5, Math.PI * 0.18, Math.PI * 0.66), lazy('maskM', () => mat({ color: pal.maskC || pal.metal || '#5a5654', rough: 0.45, metal: 0.4, side: THREE.DoubleSide, rim: '#ffb070', rimK: 0.45 })));
      mk.position.y = hr * 0.9; mk.scale.set(0.95, 1.1, 1.1); headPiv.add(mk); if (faceParts[1]) faceParts[1].visible = false;
      const brow = box(hr * 1.5, hr * 0.14, hr * 0.2, mm); brow.position.set(0, hr * 1.22, hr * 0.92); headPiv.add(brow);
      putEyes(hr * 1.1, 0.34, 0.16);
      const hair = ell(hr * 0.95, hr * 0.6, hr * 0.95, lazy('hood2', () => mat({ map: clothTex(pal.hood || shade(clothBase, -0.3)), rough: 0.9 })), 12); hair.position.y = hr * 1.45; headPiv.add(hair);
    } else if (hk === 'skull') {
      putEyes(eyeZ - 0.01, 0.36, 0.2);
      const jaw = ell(hr * 0.6, hr * 0.3, hr * 0.55, faceM, 10); jaw.position.set(0, hr * 0.25, hr * 0.35); headPiv.add(jaw);
      for (const sx of [-1, 1]) { const so = ell(hr * 0.26, hr * 0.24, hr * 0.12, M.dark, 8); so.position.set(sx * hr * 0.36, eyeY, eyeZ - 0.02); headPiv.add(so); }
    } else if (hk === 'faceless') {
      // a smooth blank face: no eyes, no mouth (the Hollow's lost townsfolk)
      const sheen = ell(hr * 0.6, hr * 0.75, hr * 0.2, lazy('blank', () => mat({ color: shade(pal.skin || '#d8d0c8', 0.15), rough: 0.25, rim: '#ffffff', rimK: 0.5 })), 12); sheen.position.set(0, hr * 0.92, hr * 0.82); if (PO) { sheen.scale.set(hr * 0.85, hr * 1.05, hr * 0.3); sheen.position.set(0, hr * 0.78, hr * 0.92); } headPiv.add(sheen);
    } else {
      putEyes();
      if (pal.hair !== null && !ghostly) { pal.hair = pal.hair || '#3a2a1e'; } if (pal.hair && !PO) { const hairM = lazy('hair', () => mat({ color: pal.hair, rough: 0.9, rim: shade(pal.hair, 0.5), rimK: 0.4 })); const hair = ell(hr * 0.98, hr * 0.8, hr * 1.02, hairM, 12); hair.position.set(0, hr * 1.25, -hr * 0.12); headPiv.add(hair); }
    }
    if (has('hair')) {
      // long hair down the back (the keener)
      const hairM = lazy('hair', () => mat({ color: pal.hair || '#c8d0d8', rough: 0.9, side: THREE.DoubleSide, rim: '#ffffff', rimK: 0.5 }));
      for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2.6; const sp = spike([[Math.sin(a) * hr * 0.9, hr * 1.5, -Math.cos(a) * hr * 0.6], [Math.sin(a) * hr * 1.3, hr * 0.2, -Math.cos(a) * hr * 1.0 - 0.03], [Math.sin(a) * hr * 1.5, -hr * 2.6, -Math.cos(a) * hr * 1.2 - 0.06]], hr * 0.28, hairM, { rings: 7, seg: 5 }); headPiv.add(sp); }
    }
    if (has('crown')) crown(headPiv, hr * 1.05, hr * (hk === 'hood' ? 2.05 : 1.75), -hr * 0.05);
    if (has('horns')) for (const sx of [-1, 1]) { const hn = spike([[0, 0, 0], [sx * hr * 0.6, hr * 0.5, -hr * 0.2], [sx * hr * 0.9, hr * 1.3, -hr * 0.1]], hr * 0.22, M.horn, { rings: 8 }); hn.position.set(sx * hr * 0.75, hr * 1.5, 0); headPiv.add(hn); }
    if (has('plume')) { const pm = lazy('plume', () => mat({ color: pal.plume || '#a82a24', rough: 0.9, rim: shade(pal.plume || '#a82a24', 0.5), rimK: 0.4 })); for (let i = 0; i < 4; i++) headPiv.add(spike([[0, hr * 2.0, -hr * 0.1 * i], [0, hr * 2.6, -hr * (0.4 + 0.3 * i)], [0, hr * 2.2, -hr * (1.0 + 0.5 * i)]], hr * 0.22, pm, { rings: 7, seg: 6 })); }
    if (has('candlehat')) {
      const wax = lazy('wax', () => mat({ color: '#e8dcc0', rough: 0.6, rimK: 0.3 }));
      for (let i = 0; i < 3; i++) { const h = 0.08 + i * 0.03; const c = cyl(0.018, 0.02, h, wax, 6); const a = (i - 1) * 0.7; c.position.set(Math.sin(a) * hr * 0.7, hr * 2.0 + h / 2, Math.cos(a) * hr * 0.3 - 0.02); headPiv.add(c); const f = glowSprite('#ffc46b', 0.12, 0.95); f.position.set(c.position.x, hr * 2.0 + h + 0.03, c.position.z); headPiv.add(f); }
      const lf = glowSprite('#ffc46b', 0.6, 0.35); lf.position.y = hr * 2.3; headPiv.add(lf); lights.push({ obj: lf, color: '#ffc46b', k: 1.4 });
    }
    // arms
    const arms = [];
    const ua = Hh * 0.17 * (P.armK ?? 1), fa = Hh * 0.16 * (P.armK ?? 1);
    const at = 0.06 * b * (P.armThick ?? 1);
    const sleeveM = pal.sleeves ? lazy('sleeve', () => mat({ map: clothTex(pal.sleeves), rough: 0.9, rimK: 0.35 })) : cloth;
    const handM = pal.gloves ? lazy('gloves', () => mat({ color: pal.gloves, rough: 0.6, rimK: 0.3 })) : ghostly && !pal.skin ? cloth : flesh;
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * sw, shY - 0.04, lean); inner.add(sh);
      if (!PO) sh.add(ell(at * 1.35, at * 1.2, at * 1.3, sleeveM, 10));
      if (!PO) sh.add(tube([[0, 0.02, 0], [sx * 0.01, -ua * 0.5, 0], [sx * 0.015, -ua, 0.005]], [[0, at * 1.15], [0.5, at * 1.0], [1, at * 0.88]], sleeveM, { up: V(0, 0, 1), rings: 7, seg: 9, cap: [at * 0.8, at * 0.6] }));
      const el = new THREE.Group(); el.position.set(sx * 0.015, -ua, 0.005); sh.add(el);
      if (!PO) el.add(ell(at * 0.92, at * 0.95, at * 0.92, sleeveM, 8));
      if (!PO) el.add(tube([[0, 0.02, 0], [0, -fa * 0.5, 0], [0, -fa, 0]], [[0, at * 0.92], [0.5, at * 0.85], [1, at * 0.72]], has('bracers') ? leatherM() : sleeveM, { up: V(0, 0, 1), rings: 7, seg: 9, cap: [at * 0.6, at * 0.4] }));
      if (has('cuffs') && !PO) { const cf = tube([[0, -fa * 0.7, 0], [0, -fa * 1.0, 0]], [[0, at * 1.15], [1, at * 1.3]], lazy('cuffM', () => mat({ color: pal.trim || shade(clothBase, 0.3), rough: 0.8 })), { up: V(0, 0, 1), rings: 4, seg: 10, cap: [0.001, 0.001] }); el.add(cf); }
      const hand = new THREE.Group(); hand.position.set(0, -fa - at * 0.6, 0.01); el.add(hand);
      if (!PO) hand.add(ell(at * 1.0, at * 1.2, at * 0.9, handM, 10));
      if (has('claws')) for (let k = -1; k <= 1; k++) { const c = spike([[k * at * 0.5, -at, 0], [k * at * 0.6, -at * 2.2, at * 0.5], [k * at * 0.5, -at * 3.2, at * 1.4]], at * 0.22, M.dark, { rings: 5, seg: 5 }); hand.add(c); }
      if (has('pauldrons')) { const pd = mesh(new THREE.SphereGeometry(at * 1.85, 12, 8, 0, TAU, 0, Math.PI * 0.45), metalM()); pd.position.set(sx * at * 0.25, at * 0.25, 0); pd.rotation.z = -sx * 0.45; pd.scale.set(1, 0.7, 1.0); sh.add(pd); if (kind('pauldrons') === 'spiked') sh.add(spike([[sx * at, at * 1.6, 0], [sx * at * 2, at * 3.4, -at * 0.3]], at * 0.45, metalM(), { rings: 5 })); }
      if (has('weeds')) for (let k = 0; k < 3; k++) { const wm = lazy('weed', () => mat({ color: pal.weed || '#3a6a4a', rough: 0.7, side: THREE.DoubleSide, rim: '#8ae0b0', rimK: 0.4 })); el.add(spike([[sx * at * 0.6, -fa * (0.1 + k * 0.25), (k - 1) * at * 0.5], [sx * at * 1.0, -fa * (0.4 + k * 0.25), (k - 1) * at * 0.6], [sx * at * 0.7, -fa * (0.8 + k * 0.3), (k - 1) * at * 0.4]], at * 0.3, wm, { rings: 6, seg: 4 })); }
      arms.push({ sh, el, hand, sx });
    }
    const right = arms.find((a) => a.sx < 0), left = arms.find((a) => a.sx > 0);
    if (R.weapon) weapon(right.hand, R.weapon);
    if (R.offhand) weapon(left.hand, R.offhand, true);
    if (has('shield')) shield(left.el, kind('shield'), 1, -fa * 0.55, at * 1.25);
    // armour and dress
    if (has('breastplate')) {
      const bp = tube([[0, hipY + torL * 0.2, lean * 0.2], [0, hipY + torL * 0.6, lean * 0.55], [0, shY - 0.01, lean]], [[0, tw * 1.0, td * 1.1], [0.5, tw * 1.12, td * 1.2], [1, tw * 1.0, td * 1.02]], metalM(), { up: V(0, 0, 1), rings: 8, seg: 16, cap: [0.02, 0.04], flatTop: 1.04 });
      inner.add(bp);
    }
    if (has('belt')) { const bt = mesh(new THREE.TorusGeometry(tw * 0.92, 0.018, 5, 20), leatherM()); bt.rotation.x = Math.PI / 2; bt.scale.set(1, td / tw * 1.05, 1); bt.position.set(0, hipY + 0.02, 0); inner.add(bt); const bk = box(0.05, 0.045, 0.02, lazy('gold', () => mat({ color: pal.gold || '#c8a040', rough: 0.3, metal: 0.85, rim: '#fff0b0', rimK: 0.5 }))); bk.position.set(0, hipY + 0.02, td * 1.0); inner.add(bk); }
    if (has('apron')) { const ap = tube([[0, hipY + torL * 0.65, td * 0.9 + lean * 0.6], [0, hipY - 0.1, td * 1.1], [0, hipY - Hh * 0.22, td * 1.25]], [[0, tw * 0.75, 0.012], [1, tw * 0.95, 0.012]], lazy('apronM', () => mat({ color: pal.apron || '#5a4030', rough: 0.85, side: THREE.DoubleSide, rimK: 0.3 })), { rings: 8, seg: 6, cap: [0.001, 0.001] }); inner.add(ap); }
    if (has('satchel')) { const sb = box(0.16, 0.13, 0.06, leatherM()); sb.position.set(sw * 0.7, hipY - 0.02, td * 0.3); sb.rotation.y = 0.3; inner.add(sb); const strap = tube([[-sw * 0.7, shY, td * 0.6 + lean], [0, hipY + torL * 0.5, td * 1.15], [sw * 0.75, hipY + 0.05, td * 0.6]], [[0, 0.014], [1, 0.014]], leatherM(), { rings: 10, seg: 5 }); strap.scale.z = 1.02; inner.add(strap); const seal = ell(0.025, 0.025, 0.008, lazy('wax2', () => mat({ color: pal.seal || '#8a1a1a', rough: 0.4, emissive: pal.seal || '#8a1a1a', emissiveK: 0.3 })), 8); seal.position.set(sw * 0.7 + 0.03, hipY - 0.01, td * 0.3 + 0.04); inner.add(seal); }
    if (has('scarf')) { const sm = lazy('scarfM', () => mat({ color: pal.scarf || pal.trim || '#a83a2a', rough: 0.85, side: THREE.DoubleSide, rim: '#ffd0a0', rimK: 0.4 })); const sc = mesh(new THREE.TorusGeometry(0.07 * b, 0.028, 6, 14), sm); sc.rotation.x = Math.PI / 2; sc.position.set(0, shY + 0.02, lean); inner.add(sc); const tailP = new THREE.Group(); tailP.position.set(0.04, shY, lean - 0.07); inner.add(tailP); tailP.add(spike([[0, 0, 0], [0.04, -0.06, -0.12], [0.05, -0.1, -0.3]], 0.03, sm, { rings: 8, seg: 5 })); anim.push((dt, st) => { tailP.rotation.x = -0.3 - (st.moving ? 0.7 : 0) + Math.sin(st.t * 7) * (st.moving ? 0.15 : 0.04); }); }
    if (has('chains')) {
      chain(inner, [V(-sw, shY, td * 0.6 + lean), V(0, hipY + torL * 0.5, td * 1.25), V(sw * 0.9, hipY + 0.05, td * 0.8)], 0.022);
      chain(inner, [V(sw, shY, -td * 0.6 + lean), V(0, hipY + torL * 0.5, -td * 1.25), V(-sw * 0.9, hipY + 0.05, -td * 0.8)], 0.022);
      for (const a of arms) chain(a.el, [V(0, -fa * 0.85, 0), V(a.sx * 0.03, -fa - 0.1, 0.02), V(a.sx * 0.02, -fa - 0.26, -0.02)], 0.018);
    }
    if (has('collar')) { const col = mesh(new THREE.TorusGeometry(0.075 * b, 0.022, 6, 14), metalM()); col.rotation.x = Math.PI / 2; col.position.set(0, shY + 0.02, lean); inner.add(col); }
    if (has('tank')) {
      // the Fire-Thrower's tank on its back, a hose to the nozzle in its hands
      const tm = lazy('tankM', () => mat({ color: pal.tank || '#6a4a2a', rough: 0.45, metal: 0.6, rim: '#ffb070', rimK: 0.5 }));
      for (const sx of [-1, 1]) { const tk = cyl(0.07, 0.07, torL * 0.95, tm, 12); tk.position.set(sx * 0.075, hipY + torL * 0.5, -td * 1.0 - 0.05); inner.add(tk); const cp = ell(0.07, 0.04, 0.07, tm, 10); cp.position.set(sx * 0.075, hipY + torL * 0.98, -td * 1.0 - 0.05); inner.add(cp); }
    }
    if (has('bellows')) {
      // Brask's great bellows on his back and the furnace light in his chest
      const wd = woodM(), lt = leatherM();
      const bw = box(0.38 * b, 0.07, 0.3, wd); bw.position.set(0, shY - 0.02, -td - 0.2); bw.rotation.x = -0.25; inner.add(bw);
      for (let i = 0; i < 4; i++) { const pl = box(0.36 * b - i * 0.03, 0.03, 0.28 - i * 0.02, lt); pl.position.set(0, shY - 0.08 - i * 0.07, -td - 0.2 + i * 0.01); pl.rotation.x = -0.25; inner.add(pl); }
      const bw2 = box(0.3 * b, 0.07, 0.26, wd); bw2.position.set(0, shY - 0.4, -td - 0.17); bw2.rotation.x = -0.25; inner.add(bw2);
      for (const sx of [-1, 1]) { const pipe = tube([[sx * 0.1, shY - 0.02, -td - 0.1], [sx * 0.16, shY + 0.25, -td - 0.05], [sx * 0.18, shY + 0.42, -td + 0.02]], [[0, 0.03], [1, 0.04]], metalM(), { rings: 10, seg: 8 }); inner.add(pipe); }
    }
    if (has('furnace') && pal.glow) {
      const fc = V(0, hipY + torL * 0.62, td * 1.15 + lean * 0.6);
      const fire = box(tw * 0.8, torL * 0.35, 0.03, lazy('fire', () => mat({ color: '#2a0e04', emissive: pal.glow, emissiveK: 2.6, rough: 0.6 }))); fire.position.copy(fc); inner.add(fire);
      for (let i = -1; i <= 1; i++) { const bar = box(0.02, torL * 0.36, 0.02, metalM()); bar.position.copy(fc).add(V(i * tw * 0.25, 0, 0.02)); inner.add(bar); }
      const gl = glowSprite(pal.glow, 0.9, 0.55); gl.position.copy(fc).add(V(0, 0, 0.12)); inner.add(gl); lights.push({ obj: gl, color: pal.glow, k: 2.4 });
      embers(inner, { n: 7, w: 0.4, y0: shY + 0.3, h: 0.8, zc: -td - 0.05 });
    }
    // robe / coat / ghost hem: a skirt from the waist down (people with neither wear a short tunic over the hips)
    // on the rigged human only long robes stay (its own outfit is the coat and tunic)
    const robeK0 = kind('robe'), robeK = PO ? (robeK0 === 'default' ? 'default' : null) : robeK0 || (!ghostly && !has('notunic') ? 'tunic' : null);
    let robe = null;
    if (robeK || ghostly) {
      const hemY = ghostly ? 0.05 : robeK === 'tunic' ? hipY - Hh * 0.12 : robeK === 'short' ? hipY - Hh * 0.2 : robeK === 'coat' ? Hh * 0.12 : 0.04;
      const hemR = ghostly ? 0.33 * b * (P.hem ?? 1) : (robeK === 'tunic' ? 0.21 : robeK === 'coat' ? 0.2 : 0.24) * b * (P.hem ?? 1) * (PO ? 1.35 : 1);
      const rm = lazy('robeM', () => mat({ map: clothTex(robeK === 'tunic' ? clothBase : pal.robe || clothBase, P.ragged ?? (ghostly ? 0.9 : 0.2), pal.trim || null), rough: 0.9, side: THREE.DoubleSide, alphaTest: 0.5, rim: ghostly && pal.glow ? pal.glow : shade(pal.robe || clothBase, 0.5), rimK: 0.45 }));
      robe = new THREE.Group(); robe.position.set(0, hipY + 0.08, 0); inner.add(robe);
      const rl = hipY + 0.08 - hemY;
      const keys = ghostly ? [[0, tw * 1.02, td * 1.12], [0.4, tw * 1.2, td * 1.3], [1, hemR, hemR * 0.9]] : [[0, tw * 1.02, td * 1.15], [0.35, tw * 1.25, td * 1.4], [1, hemR, hemR * 0.85]];
      const rpts = ghostly ? [[0, 0, lean * 0.2], [0, -rl * 0.5, -0.05], [0, -rl, -0.2]] : [[0, 0, lean * 0.2], [0, -rl * 0.5, 0], [0, -rl, -0.02]];
      robe.add(tube(rpts, keys, rm, { up: V(0, 0, 1), rings: 12, seg: 18, vNorm: true, cap: [0.001, 0.0001] }));
      anim.push((dt, st) => { robe.rotation.x = (st.moving ? 0.12 : 0) + Math.sin(st.t * 1.7) * 0.03; robe.rotation.z = Math.sin(st.t * 1.3) * 0.02; });
    }
    if (has('pages')) {
      // a skirt of torn, written-on pages that flutter (the page wraiths)
      const ink = kind('pages') === 'ink';
      const pm = lazy('pagesM', () => mat({ map: ink ? pageTex('#3a2f4a', '#120a22') : pageTex(pal.paper || '#efe4c6', '#3a2a1a'), color: ink ? '#b8a8d8' : '#ffffff', rough: 0.85, side: THREE.DoubleSide, alphaTest: 0.3, emissive: pal.glow, emissiveK: ink ? 0.25 : 0.12, rim: pal.glow || '#ffffff', rimK: 0.5 }));
      const pages = [];
      const N = P.pageN ?? 10;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + (i % 2) * 0.12;
        const piv = new THREE.Group(); piv.position.set(Math.sin(a) * tw * 1.05, hipY + 0.1 - (i % 3) * 0.04, Math.cos(a) * td * 1.2); piv.rotation.y = a; inner.add(piv);
        const len = (hipY - 0.05) * (0.85 + ((i * 37) % 5) * 0.05);
        const g = new THREE.PlaneGeometry(0.2, len, 1, 3); g.translate(0, -len / 2, 0);
        const pp = g.attributes.position; for (let k = 0; k < pp.count; k++) { const x = pp.getX(k); pp.setZ(k, -0.05 * (x / 0.1) ** 2); }
        g.computeVertexNormals();
        const m = mesh(g, pm); m.rotation.x = -0.22; piv.add(m);
        pages.push({ piv, ph: i * 1.7 });
      }
      anim.push((dt, st) => { for (const p of pages) { p.piv.rotation.x = Math.sin(st.t * (st.moving ? 7 : 3.2) + p.ph) * 0.12 - (st.moving ? 0.2 : 0); p.piv.rotation.z = Math.sin(st.t * 2.3 + p.ph * 1.3) * 0.06; } });
    }
    if (has('loose')) {
      const pm = lazy('pagesM2', () => mat({ map: pageTex(pal.paper || '#efe4c6', '#3a2a1a'), rough: 0.85, side: THREE.DoubleSide, alphaTest: 0.3, emissive: pal.glow, emissiveK: 0.15 }));
      const loose = [];
      for (let i = 0; i < 3; i++) { const lp = new THREE.Group(); inner.add(lp); lp.add(mesh(new THREE.PlaneGeometry(0.16, 0.22), pm)); loose.push(lp); }
      anim.push((dt, st) => loose.forEach((m, i) => { const a = st.t * 0.9 + i * 2.1; m.position.set(Math.cos(a) * 0.6, hipY * 0.6 + i * 0.3 + Math.sin(st.t * 2 + i) * 0.08, Math.sin(a) * 0.6); m.rotation.set(Math.sin(st.t + i) * 0.6, -a, Math.cos(st.t * 1.3 + i) * 0.5); }));
    }
    if (has('shards')) {
      // mirror shards circling (the Mirror Shade)
      const gm = lazy('mirror', () => mat({ color: '#e8eef8', rough: 0.12, metal: 0.4, rim: pal.glow || '#ffffff', rimK: 0.9, flat: true, side: THREE.DoubleSide, emissive: pal.glow || '#c8d8ff', emissiveK: 0.35 }));
      const sh = [];
      for (let i = 0; i < 5; i++) { const s = new THREE.Group(); inner.add(s); s.add(mesh(new THREE.OctahedronGeometry(0.07 + hash(i) * 0.05, 0), gm)); s.children[0].scale.set(1, 1.6, 0.15); sh.push(s); }
      anim.push((dt, st) => sh.forEach((s, i) => { const a = st.t * 0.7 + i * TAU / 5; s.position.set(Math.cos(a) * 0.55, hipY + 0.2 + Math.sin(st.t * 1.3 + i) * 0.2 + i * 0.12, Math.sin(a) * 0.55); s.rotation.y = -a + st.t; }));
    }
    let cloak = null;
    if (has('cloak')) {
      // a cloak from the shoulders down the back, swinging out behind when it moves
      const ck = kind('cloak');
      const cm = lazy('cloakM', () => mat({ map: clothTex(pal.cloak || shade(clothBase, -0.2), ck === 'ragged' ? 0.7 : 0.12, pal.cloakTrim || null), rough: 0.9, side: THREE.DoubleSide, alphaTest: 0.5, rim: shade(pal.cloak || clothBase, 0.5), rimK: 0.4 }));
      const hemY = ck === 'short' ? hipY : 0.1;
      const cl = shY + 0.02 - hemY, A = 1.35, cols = 10, rows = 8;
      const pos = [], uv = [], idx = [];
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const v = j / rows, u = i / cols, a = (u - 0.5) * 2 * A;
        const r = lerp(0.14 * b, 0.3 * b * (P.cloakFlare ?? 1), v);
        pos.push(Math.sin(a) * r, -v * cl, -Math.cos(a) * r * 0.9 - 0.02 - v * 0.04); uv.push(u, v);
        if (i < cols && j < rows) { const q = j * (cols + 1) + i; idx.push(q, q + cols + 1, q + 1, q + 1, q + cols + 1, q + cols + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      cloak = new THREE.Group(); cloak.position.set(0, shY + 0.02, lean - td * 0.4); inner.add(cloak);
      cloak.add(mesh(g, cm));
      const clasp = ell(0.03, 0.03, 0.015, lazy('gold', () => mat({ color: pal.gold || '#c8a040', rough: 0.3, metal: 0.85, rim: '#fff0b0', rimK: 0.5 })), 8); clasp.position.set(0, shY - 0.02, lean + td * 0.9); inner.add(clasp);
    }
    if (has('weeds')) {
      // the drowned: lake weed hanging off the shoulders and head
      const wm = lazy('weed', () => mat({ color: pal.weed || '#3a6a4a', rough: 0.7, side: THREE.DoubleSide, rim: '#8ae0b0', rimK: 0.4 }));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; inner.add(spike([[Math.sin(a) * tw * 1.1, shY, Math.cos(a) * td * 1.1 + lean], [Math.sin(a) * tw * 1.3, shY - 0.2, Math.cos(a) * td * 1.3 + lean], [Math.sin(a) * tw * 1.2, shY - 0.45 - hash(i) * 0.2, Math.cos(a) * td * 1.2]], 0.02, wm, { rings: 7, seg: 4 })); }
      for (let i = 0; i < 4; i++) { const a = (i / 4 - 0.4) * 3; headPiv.add(spike([[Math.sin(a) * hr * 0.9, hr * 1.6, Math.cos(a) * hr * 0.5 - 0.02], [Math.sin(a) * hr * 1.2, hr * 0.8, Math.cos(a) * hr * 0.7], [Math.sin(a) * hr * 1.1, hr * 0.1, Math.cos(a) * hr * 0.6]], hr * 0.18, wm, { rings: 6, seg: 4 })); }
    }
    if (has('wisps') || ghostly) embers(inner, { n: has('wisps') ? 6 : 4, w: 0.5, y0: 0.1, h: Hh * 0.8, size: 2.2, color: pal.glow || '#9fe0ff' });
    if (has('embers')) embers(inner, { n: 8, w: 0.6, y0: hipY, h: 1.1 });
    if (R.aura) { const au = glowSprite(pal.glow || pal.eyes, Hh * 1.2, 0.22); au.position.y = hipY + torL * 0.5; inner.add(au); lights.push({ obj: au, color: pal.glow || pal.eyes, k: R.aura }); }
    const box3 = meshBox(inner); height = Math.max(box3.max.y, Hh);
    const float = ghostly ? (P.float ?? 0.18) : 0;
    const armRest = P.armsForward ?? 0, two = R.twoHanded;
    let ph = 0;
    update = (dt, st) => {
      const mv = st.moving && st.deadT == null;
      ph += dt * (mv ? clamp(3.2 + (st.speed || 1.5) * 1.6, 3.5, 10) : 0);
      const A = mv ? clamp(0.32 + (st.speed || 1.5) * 0.08, 0.32, 0.65) : 0;
      const k = st.attackT == null ? 2 : (st.t - st.attackT) / 0.6;
      // a strike: wind up over the shoulder, swing down and across
      const wind = k >= 0 && k < 0.4 ? ease(k / 0.4) : k >= 0.4 && k < 0.55 ? 1 - ease((k - 0.4) / 0.15) * 1.6 : k >= 0.55 && k < 1 ? -0.6 * (1 - ease((k - 0.55) / 0.45)) : 0;
      const att = strike(st.t, st.attackT, 0.6, 0.45), hurt = pulse(st.t, st.hurtT, 0.32), cast = st.cast && st.deadT == null ? 1 : 0;
      st._att = att;
      for (const l of legs) {
        const p = ph + (l.sx > 0 ? Math.PI : 0), s = Math.sin(p);
        l.hip.rotation.x = -s * A - hurt * 0.15;
        l.knee.rotation.x = mv ? Math.max(0, Math.cos(p)) * A * 1.6 : 0.05;
      }
      for (const a of arms) {
        const p = ph + (a.sx > 0 ? 0 : Math.PI);
        const swing = mv ? Math.sin(p) * A * 0.75 : Math.sin(st.t * 1.3 + a.sx) * 0.03;
        let rx = swing - armRest, rz = a.sx * (0.1 + hurt * 0.35), erx = -0.25 - armRest * 0.2;
        const isW = a.sx < 0 || two;
        if (isW) { rx += -wind * 2.4 - (wind < 0 ? -wind * 0.4 : 0); erx += -Math.max(0, wind) * 0.6; rz += a.sx * Math.max(0, wind) * 0.25; }
        if (cast) { rx = -1.25 + Math.sin(st.t * 6 + a.sx) * 0.06; erx = -0.3; rz = a.sx * 0.15; }
        a.sh.rotation.set(rx, 0, rz); a.el.rotation.x = erx;
      }
      const bob = mv ? Math.abs(Math.cos(ph)) * 0.03 : Math.sin(st.t * 1.6) * 0.005;
      inner.position.set(Math.sin(st.t * 50) * hurt * 0.02, bob + float + (float ? Math.sin(st.t * 1.8) * 0.05 : 0), att * (P.lunge ?? 0.12) - hurt * 0.1);
      inner.rotation.set((mv ? 0.06 : 0) + Math.max(0, -wind) * 0.12 - hurt * 0.12, -wind * 0.25, mv ? Math.sin(ph) * 0.03 : 0);
      headPiv.rotation.set(-hurt * 0.3 + (mv ? 0 : Math.sin(st.t * 0.7) * 0.05), mv ? 0 : Math.sin(st.t * 0.5) * 0.35 * (1 - att), 0);
      if (cloak) cloak.rotation.x = -(mv ? 0.25 + Math.sin(ph * 2) * 0.05 : 0.02 + Math.sin(st.t * 1.4) * 0.02) - hurt * 0.1;
      for (const a of anim) a(dt, st);
      death(st, ghostly ? 0.3 : 0.1);
    };
    if (PO) {
      // hand the dress over in pieces, each in its own frame, for src/render3d/foe_human.js to hang on a bone:
      // hands and forearms, upper arms, the head, then the rest by height (pelvis or chest)
      inner.updateMatrixWorld(true);
      const out = [];
      const take = (anchor, bone, mode) => {
        const M4 = anchor.matrixWorld.clone(), root = new THREE.Group();
        for (const c of [...anchor.children]) root.add(c);
        out.push({ root, bone, mode, M: M4 });
      };
      for (const a of arms) take(a.hand, a.sx < 0 ? 'hand_r' : 'hand_l', 'hand');
      for (const a of arms) take(a.el, a.sx < 0 ? 'lowerarm_r' : 'lowerarm_l', 'bone');
      for (const a of arms) take(a.sh, a.sx < 0 ? 'upperarm_r' : 'upperarm_l', 'bone');
      take(headPiv, 'Head', 'head');
      const low = new THREE.Group(), high = new THREE.Group();
      for (const c of [...inner.children]) {
        if (c === headPiv || arms.some((a) => a.sh === c)) continue;
        const bb = new THREE.Box3().setFromObject(c), cy = bb.isEmpty() ? c.position.y : (bb.min.y + bb.max.y) / 2;
        (cy < hipY + torL * 0.45 ? low : high).add(c);
      }
      out.push({ root: low, bone: 'pelvis', mode: 'bone', M: new THREE.Matrix4() }, { root: high, bone: 'spine_03', mode: 'bone', M: new THREE.Matrix4() });
      const sprites = [];
      for (const p of out) p.root.traverse((m) => { if (m.isSprite) sprites.push(m); });
      const stepPO = (dt, st) => {
        const s = { ...st }; s._att = strike(st.t, st.attackT, 0.6, 0.45);
        for (const a of anim) a(dt, s);
        if (cloak) cloak.rotation.x = -(st.moving ? 0.3 : 0.03);
        flash.value = pulse(st.t, st.hurtT, 0.2);
        const dk = st.deadT == null ? 1 : 1 - ease((st.t - st.deadT) / 0.5);
        for (const sp of sprites) sp.visible = dk > 0.02;
      };
      // one skinned mesh per material for all the pieces: each piece's root is a bone (it rides its socket)
      const container = new THREE.Group();
      for (const p of out) { p.root.userData.live = true; container.add(p.root); }
      const keys = [];
      const k = R.id ? R.id + ':po' : null;
      rig(THREE, container, stepPO, k);
      if (k && GEO.get(k)) { GEO.get(k).refs++; keys.push(k); }
      let released = false;
      const release = () => { if (released) return; released = true; for (const k of keys) { const e = GEO.get(k); if (e) { e.refs--; e.used = ++geoClock; } } };
      return { pieces: out, container, mats, lights, update: stepPO, height: Math.max(meshBox(inner).max.y, Hh), recipe: R, release, flash, float: ghostly ? (P.float ?? 0.18) : 0, hipY, shY, Hh };
    }
  }

  else if (R.body === 'serpent') {
    // the body is a straight loft rigidly skinned to one bone per ring; each frame only the ring bones move
    const len = P.length ?? 2.0, gr = P.girth ?? 0.13, n = 34, riseH = P.rise ?? 0.5, wave = P.wave ?? 'side', amp = P.amp ?? 0.16, waves = P.waves ?? 1.4;
    const prof = keysFn(P.profile || [[0, 0.12], [0.15, 0.55], [0.55, 1], [0.85, 0.92], [1, 0.82]]);
    const rest = [], rx = [], ry = [];
    const seg = 16;
    for (let i = 0; i < n; i++) { const s = i / (n - 1); rest.push(V(0, gr, (s - 0.65) * len)); let k = prof(s, 1); if (s > 0.97) k *= Math.sqrt(Math.max(0.05, 1 - ((s - 0.97) / 0.03) ** 2)); rx.push(gr * k * (P.flatW ?? 1)); ry.push(gr * k); }
    let att = 0, hurt = 0, tt = 0, mvK = 0;
    const spineAt = (s, out) => {
      const rs = ease((s - (P.riseFrom ?? 0.55)) / (1 - (P.riseFrom ?? 0.55)));
      let z = (s - 0.65) * len, y = gr * 0.95 + rs * riseH, x = 0;
      const env = Math.sin(Math.PI * clamp(s * 1.05)) ** 0.6 * (1 - 0.75 * rs);
      const w = Math.sin(TAU * waves * s - tt * (mvK ? 5.5 : 1.6));
      if (wave === 'side') x = amp * (0.4 + 0.6 * mvK) * env * w;
      else { const hump = Math.max(0, Math.sin(TAU * waves * s - tt * (mvK ? 4 : 1.2))); y += amp * (0.25 + 0.75 * mvK) * env * hump * hump; z -= amp * 0.3 * env * hump; }
      z += (att * (P.lunge ?? 0.45) - hurt * 0.18) * rs;
      y += (-att * riseH * 0.4 + hurt * 0.08) * rs;
      return out.set(x, y, z);
    };
    const body = loftMesh(rest, rx, ry, M.skin, { seg, flatBottom: P.belly ?? 0.75, vScale: R.patternScale ?? 1 });
    inner.add(body);
    const ringB = rest.map((c) => { const g = new THREE.Group(); g.position.copy(c); g.userData.live = true; inner.add(g); return g; });
    body.userData.vertexBone = (vi) => ringB[Math.floor(vi / (seg + 1))];
    const head = new THREE.Group(); head.position.set(0, 0, gr * 0.15); ringB[n - 1].add(head); head.userData.live = true;
    let hd = null;
    if (H.sucker) {
      // a round mouth ringed with teeth, eyes on top
      const lip = mesh(new THREE.TorusGeometry(gr * 0.62, gr * 0.2, 8, 18), M.limb); head.add(lip);
      const hole = mesh(new THREE.CircleGeometry(gr * 0.62, 18), M.mouth); hole.position.z = -0.005; head.add(hole);
      const tg = new THREE.ConeGeometry(1, 1, 4);
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; const t = mesh(tg, M.tooth); t.scale.set(0.012, 0.045, 0.012); t.position.set(Math.cos(a) * gr * 0.5, Math.sin(a) * gr * 0.5, 0.005); t.rotation.z = a + Math.PI / 2; head.add(t); }
      for (const sx of [-1, 1]) { const e = glowEye(gr * 0.13, pal.eyes, { socket: true }); e.position.set(sx * gr * 0.4, gr * 0.82, -gr * 0.35); e.rotation.x = -0.5; head.add(e); }
    } else {
      hd = makeHead({ len: 0.36, w: gr * 1.05, h: gr * 0.95, snout: 0.6, snoutW: 0.75, eyesFront: 0.35, ...H });
      hd.g.position.z = -gr * 0.6; hd.g.rotation.x = H.pitch ?? 0.1; head.add(hd.g); headParts(hd);
    }
    // dorsal fin: a ribbon over the spine, skinned to the nearest ring bone
    if (has('fins')) {
      const fn = 26, finFrom = 0.08, finTo = P.finTo ?? 0.86;
      const pos = new Float32Array(fn * 2 * 3), uvs = new Float32Array(fn * 2 * 2), idx = [], bones = [];
      for (let i = 0; i < fn; i++) {
        const s = lerp(finFrom, finTo, i / (fn - 1)), ri = Math.round(s * (n - 1));
        const r = ry[ri], fh = (P.finH ?? 0.12) * Math.sin(Math.PI * (i / (fn - 1))) ** 0.7, z = (s - 0.65) * len;
        pos.set([0, gr + r * 0.8, z, 0, gr + r * 0.8 + fh, z - fh * 0.3], i * 6);
        uvs.set([i / (fn - 1), 0, i / (fn - 1), 1], i * 4); bones.push(ringB[ri], ringB[ri]);
        if (i < fn - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
      const ft = canvasTex('fin' + pal.accent + pal.base, 128, 64, (c, w, h) => {
        const gr2 = c.createLinearGradient(0, 0, 0, h); gr2.addColorStop(0, rgba(shade(pal.base, -0.2), 1)); gr2.addColorStop(0.6, rgba(pal.accent, 0.9)); gr2.addColorStop(1, rgba(shade(pal.accent, 0.3), 0.5));
        c.fillStyle = gr2; c.fillRect(0, 0, w, h);
        c.strokeStyle = rgba(shade(pal.base, -0.4), 0.8); c.lineWidth = 1.5; for (let x = 2; x < w; x += 6) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 3, h); c.stroke(); }
        c.globalCompositeOperation = 'destination-out'; for (let x = 0; x < w; x += 6) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 3, h - 6 - (x % 12)); c.lineTo(x + 6, h); c.fill(); }
      }, false);
      const finM = mat({ map: ft, side: THREE.DoubleSide, rough: 0.5, alphaTest: 0.3, rim: pal.accent, rimK: 0.4, glow: R.glowSpots ? pal.glow : null, glowK: 0.15 });
      const fin = mesh(g, finM); inner.add(fin);
      fin.userData.vertexBone = (vi) => bones[vi];
      for (const sx of [-1, 1]) {
        const pf = new THREE.Group(); head.add(pf);
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(sx * 0.12, -0.02, sx * 0.16, -0.12); sh.quadraticCurveTo(sx * 0.06, -0.06, 0, -0.08);
        pf.add(mesh(new THREE.ShapeGeometry(sh, 4).rotateX(-Math.PI / 2), finM));
        pf.position.set(sx * gr * 0.85, -gr * 0.3, -gr * 1.3);
        anim.push((dt, st) => { pf.rotation.z = sx * Math.sin(st.t * 6) * 0.25; });
      }
    }
    if (has('mandibles') && H.sucker) for (const sx of [-1, 1]) { const mp = new THREE.Group(); mp.position.set(sx * gr * 0.5, 0, 0.02); head.add(mp); mp.add(spike([[0, 0, 0], [sx * 0.05, 0, 0.05], [-sx * 0.02, 0, 0.1]], gr * 0.18, M.dark, { rings: 8 })); anim.push((dt, st) => { mp.rotation.y = sx * (0.3 + Math.sin(st.t * 5) * 0.15 + (st._att || 0) * 0.6); }); }
    const T = V(), N = V(), S = V(), Mx = new THREE.Matrix4(), UP = V(0, 1, 0), ALT = V(0, 0, 1);
    const lay = (st) => {
      tt = st.t; mvK = st.moving && st.deadT == null ? 1 : 0;
      for (let i = 0; i < n; i++) spineAt(i / (n - 1), ringB[i].position);
      for (let i = 0; i < n; i++) {
        T.subVectors(ringB[Math.min(n - 1, i + 1)].position, ringB[Math.max(0, i - 1)].position).normalize();
        N.copy(UP).addScaledVector(T, -UP.dot(T)); if (N.lengthSq() < 1e-4) N.copy(ALT).addScaledVector(T, -ALT.dot(T)); N.normalize();
        S.crossVectors(N, T).normalize();
        Mx.makeBasis(S, N, T); ringB[i].quaternion.setFromRotationMatrix(Mx);
      }
    };
    const box3 = meshBox(inner); height = Math.max(box3.max.y, gr * 2 + riseH);
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
    const bl = P.body ?? 0.4, gr = P.girth ?? 0.12, span = P.span ?? 0.95, hover = P.hover ?? 1.1, insect = !!P.insect;
    const fly = new THREE.Group(); inner.add(fly);
    let hd, headPiv;
    const talons = [], wings = [];
    let tailG = null;
    if (!insect) {
      const body = tube([[0, -0.02, -bl * 0.5], [0, 0, 0], [0, 0.05, bl * 0.45]], [[0, gr * 0.45, gr * 0.4], [0.4, gr * 0.95, gr * 1.0], [0.75, gr * 1.0, gr * 1.05], [1, gr * 0.75, gr * 0.8]], M.skin, { flatBottom: 0.95, rings: 16, seg: 14, vScale: 0.6 });
      fly.add(body);
      headPiv = new THREE.Group(); headPiv.position.set(0, gr * 0.8, bl * 0.47); fly.add(headPiv);
      hd = makeHead({ len: 0.22, w: gr * 0.85, h: gr * 0.82, beak: true, snout: 0.1, snoutW: 0.9, eyesFront: 0.4, eye: gr * 0.17, eyeY: 0.32, eyeZ: 0.5, ...H });
      hd.g.position.z = -gr * 0.2; headPiv.add(hd.g); headParts(hd);
    } else {
      // an insect: a thorax, a long striped abdomen with a sting, two pairs of gauze wings
      const thorax = ell(gr * 0.9, gr * 0.85, gr * 1.05, M.limb, 14); fly.add(thorax);
      const abd = tube([[0, 0, -gr * 0.6], [0, -gr * 0.25, -gr * 0.6 - bl * 0.5], [0, -gr * 0.65, -gr * 0.6 - bl]], [[0, gr * 0.45], [0.15, gr * 0.85], [0.55, gr * 0.95], [1, gr * 0.2]], M.skin, { rings: 16, seg: 14, vScale: R.patternScale ?? 1, vNorm: false });
      fly.add(abd);
      fly.add(spike([[0, -gr * 0.62, -gr * 0.55 - bl], [0, -gr * 0.8, -gr * 0.7 - bl * 1.08], [0, -gr * 1.05, -gr * 0.65 - bl * 1.12]], gr * 0.16, M.dark, { rings: 8 }));
      headPiv = new THREE.Group(); headPiv.position.set(0, gr * 0.05, gr * 0.85); fly.add(headPiv);
      hd = makeHead({ len: 0.16, w: gr * 0.75, h: gr * 0.7, snout: 0.1, snoutW: 0.9, jaw: false, brow: false, eyesFront: 0.3, eye: gr * 0.32, eyeY: 0.25, eyeZ: 0.45, ...H });
      headPiv.add(hd.g); headParts(hd);
      for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { const lg = new THREE.Group(); lg.position.set(sx * gr * 0.5, -gr * 0.6, gr * (0.4 - i * 0.35)); fly.add(lg); lg.add(tube([[0, 0, 0], [sx * 0.06, -0.06, 0.02], [sx * 0.07, -0.16, -0.02]], [[0, 0.012], [1, 0.007]], M.dark, { rings: 6, seg: 5 })); talons.push(lg); }
    }
    // feathers: a tapered leaf, length along -z, with a painted shaft, a light edge and ragged tip (alpha tested)
    const ftex = canvasTex('feather' + pal.base + pal.accent, 64, 256, (g, w, h) => {
      const gr2 = g.createLinearGradient(0, 0, 0, h); gr2.addColorStop(0, shade(pal.base, -0.1)); gr2.addColorStop(0.62, pal.base); gr2.addColorStop(0.92, mix(pal.base, pal.accent, 0.7)); gr2.addColorStop(1, pal.accent);
      g.fillStyle = gr2; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) { g.strokeStyle = `rgba(255,255,255,${0.04 + hash(y) * 0.06})`; g.beginPath(); g.moveTo(w / 2, y); g.lineTo(0, y + 12); g.moveTo(w / 2, y); g.lineTo(w, y + 12); g.stroke(); }
      const eg = g.createLinearGradient(0, 0, w, 0); eg.addColorStop(0, rgba(pal.accent, 0.55)); eg.addColorStop(0.2, rgba(pal.accent, 0)); eg.addColorStop(0.8, rgba(pal.accent, 0)); eg.addColorStop(1, rgba(pal.accent, 0.55)); g.fillStyle = eg; g.fillRect(0, 0, w, h);
      g.fillStyle = rgba(shade(pal.base, 0.45), 0.85); g.fillRect(w / 2 - 1.5, 0, 3, h);
      g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 5; k++) { const y = h * (0.55 + hash(k, 3) * 0.4), sx = hash(k) < 0.5 ? 0 : w; g.beginPath(); g.moveTo(sx, y); g.lineTo(w / 2 + (sx ? 8 : -8), y + 10); g.lineTo(sx, y + 16); g.fill(); }
    }, false);
    const fm = mat({ map: ftex, side: THREE.DoubleSide, rough: 0.6, alphaTest: 0.5, rim: pal.sheen || pal.accent, rimK: 0.55 });
    const featherGeo = (L, W) => {
      const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(W * 0.6, L * 0.2, W * 0.5, L * 0.75); s.quadraticCurveTo(W * 0.3, L * 1.0, 0, L); s.quadraticCurveTo(-W * 0.3, L * 1.0, -W * 0.5, L * 0.75); s.quadraticCurveTo(-W * 0.6, L * 0.2, 0, 0);
      const g = new THREE.ShapeGeometry(s, 5); const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W + 0.5, p.getY(i) / L);
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i); p.setZ(i, (y / L) ** 2 * L * 0.12 - Math.abs(x) * 0.15); }
      g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g;
    };
    const wk = kind('wings') || (insect ? 'gauze' : 'feather');
    const fk = span / 0.85;   // feather length follows the span
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * gr * 0.7, gr * (insect ? 0.7 : 0.45), insect ? gr * 0.2 : bl * 0.12); fly.add(sh);
      const a1 = span * 0.45, a2 = span * 0.55;
      const el = new THREE.Group(); el.position.set(sx * a1, 0, 0); sh.add(el);
      if (wk === 'gauze') {
        const gm = lazy('gauze', () => { const m2 = mat({ color: pal.wing || '#e8f0ff', rough: 0.2, side: THREE.DoubleSide, rim: '#ffffff', rimK: 0.6, emissive: pal.wing || '#e8f0ff', emissiveK: 0.1 }); m2.transparent = true; m2.opacity = 0.45; m2.depthWrite = false; m2.userData.baseOpacity = 0.45; return m2; });
        for (const [k, L, rz] of [[0, span * 0.62, 0.0], [1, span * 0.45, 0.35]]) {
          const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(sx * L * 0.5, L * 0.28, sx * L, L * 0.1); s.quadraticCurveTo(sx * L * 0.9, -L * 0.18, sx * L * 0.4, -L * 0.16); s.quadraticCurveTo(sx * L * 0.15, -L * 0.1, 0, 0);
          const wm = mesh(new THREE.ShapeGeometry(s, 6).rotateX(-Math.PI / 2), gm); wm.rotation.y = sx * rz; wm.position.z = -k * gr * 0.5; wm.castShadow = false; sh.add(wm);
          const vein = tube([[0, 0.002, 0], [sx * L * 0.55, 0.004, -L * 0.08], [sx * L * 0.95, 0.002, -L * 0.1]], [[0, 0.004], [1, 0.002]], M.dark, { rings: 6, seg: 4 }); vein.rotation.y = sx * rz; vein.position.z = -k * gr * 0.5; sh.add(vein);
        }
      } else {
        sh.add(tube([[0, 0, 0], [sx * a1 * 0.5, 0.02, 0.02], [sx * a1, 0, 0]], [[0, gr * 0.42, gr * 0.3], [1, gr * 0.2, gr * 0.14]], M.skin, { rings: 8, seg: 8, vScale: 0.3 }));
        el.add(tube([[0, 0, 0], [sx * a2 * 0.6, 0, -0.02], [sx * a2 * 0.85, 0, -0.05]], [[0, gr * 0.2, gr * 0.14], [1, gr * 0.07]], M.skin, { rings: 8, seg: 6, vScale: 0.3 }));
      }
      if (wk === 'feather' || wk === 'ragged') {
        for (let i = 0; i < 6; i++) { const L = (0.2 + i * 0.012) * fk, f = mesh(featherGeo(L, 0.1 * Math.sqrt(fk)), fm); f.position.set(sx * (0.03 + i * a1 / 6.5), -0.004, 0.02); f.rotation.y = sx * (0.06 + i * 0.03); sh.add(f); }
        for (let i = 0; i < 7; i++) { const L = (0.28 + i * 0.03) * fk * (wk === 'ragged' && i % 2 ? 0.85 : 1), f = mesh(featherGeo(L, 0.095 * Math.sqrt(fk)), fm); f.position.set(sx * (0.01 + i * a2 * 0.13), -0.004 - i * 0.002, -0.01); f.rotation.y = sx * (0.25 + i * 0.2); el.add(f); }
        for (let i = 0; i < 5; i++) { const f = mesh(featherGeo(0.11 * fk, 0.07), fm); f.position.set(sx * (0.03 + i * a1 / 5), 0.012, 0.03); f.rotation.y = sx * 0.12; f.castShadow = false; sh.add(f); }
      } else if (wk === 'membrane') {
        const s = new THREE.Shape(); s.moveTo(0, 0.02); s.lineTo(sx * (a1 + a2 * 0.85), 0.05);
        for (let k = 3; k >= 0; k--) { const x = sx * (k / 3) * (a1 + a2 * 0.8); s.quadraticCurveTo(x + sx * 0.06, -0.18, x, -0.26 + (k % 2) * 0.05); }
        const g = new THREE.ShapeGeometry(s, 4).rotateX(Math.PI / 2); sh.add(mesh(g, lazy('membrane', () => mat({ color: pal.accent, side: THREE.DoubleSide, rough: 0.8 }))));
      }
      wings.push({ sh, el, sx });
    }
    if (!insect) {
      tailG = new THREE.Group(); tailG.position.set(0, 0.0, -bl * 0.45); fly.add(tailG);
      const tk = kind('tail') || 'fan';
      const nT = tk === 'fork' ? 6 : 5;
      for (let i = 0; i < nT; i++) {
        const c = (i - (nT - 1) / 2);
        const L = (0.26 + (tk === 'fork' ? Math.abs(c) * 0.05 : c === 0 ? 0.06 : 0)) * (P.tailK ?? 1);
        const f = mesh(featherGeo(L, 0.075), fm); f.rotation.y = c * (tk === 'wedge' ? 0.12 : 0.2); f.position.x = c * 0.015; tailG.add(f);
      }
      tailG.rotation.x = 0.15;
      for (const sx of [-1, 1]) {
        const lg = new THREE.Group(); lg.position.set(sx * gr * 0.35, -gr * 0.7, 0.0); fly.add(lg);
        lg.add(tube([[0, 0, 0], [0, -0.06, -0.02], [0, -0.11, 0.0]], [[0, 0.014], [1, 0.011]], M.horn, { rings: 6, seg: 6 }));
        for (let k = -1; k <= 1; k++) lg.add(spike([[0, -0.11, 0], [k * 0.02, -0.12, 0.03], [k * 0.03, -0.14, 0.04]], 0.008, M.dark, { rings: 5, seg: 4 }));
        talons.push(lg);
      }
      if (has('ruff')) for (let i = 0; i < 8; i++) { const f = mesh(featherGeo(0.11 * fk, 0.065), fm); f.position.set(Math.sin((i / 7 - 0.5) * 2.6) * gr * 0.85, gr * 0.55 + Math.cos((i / 7 - 0.5) * 2.6) * gr * 0.3, bl * 0.38); f.rotation.set(-0.5, (i / 7 - 0.5) * 2.6, 0); fly.add(f); }
      if (has('crest')) for (let i = 0; i < 4; i++) { const f = mesh(featherGeo(0.12 * fk, 0.05), lazy('crestM', () => mat({ map: ftex, color: pal.crest || '#ffffff', side: THREE.DoubleSide, rough: 0.6, alphaTest: 0.5, rimK: 0.5 }))); f.position.set(0, gr * 0.6 + 0.01 * i, -0.02 * i); f.rotation.set(-2.2 + i * 0.15, 0, 0); headPiv.add(f); }
      if (has('coats')) {
        // Corvina Ninecoats: patches of coloured feathers over the black (she wears every coat she stole)
        const cols = ['#a83a2a', '#d8a838', '#3a7a5a', '#3a5aa8', '#a85aa0'];
        cols.forEach((c, i) => { const cm = mat({ map: ftex, color: c, side: THREE.DoubleSide, rough: 0.6, alphaTest: 0.5, rimK: 0.5 }); for (let k = 0; k < 3; k++) { const f = mesh(featherGeo(0.14 * fk, 0.08), cm); f.position.set((hash(i, k) - 0.5) * gr * 1.4, gr * 0.7, bl * (0.25 - i * 0.12 - k * 0.03)); f.rotation.set(-0.3, (hash(k, i) - 0.5) * 1.5 + Math.PI, 0); fly.add(f); } });
      }
    }
    if (has('glowtip') && pal.glow) { const gl = glowSprite(pal.glow, gr * 3, 0.6); gl.position.set(0, -gr * 0.7, -gr * 0.6 - bl * 1.1); fly.add(gl); }
    if (R.aura) { const au = glowSprite(pal.glow || pal.eyes, span * 2, 0.2); fly.add(au); lights.push({ obj: au, color: pal.glow || pal.eyes, k: R.aura }); }
    fly.position.y = hover; fly.rotation.x = insect ? -0.05 : -0.12;
    const box3 = meshBox(inner); height = box3.max.y;
    let ph = 0;
    update = (dt, st) => {
      const alive = st.deadT == null;
      ph += dt * (insect ? 38 : st.moving ? 11 : 7);
      const att = strike(st.t, st.attackT, 0.5, 0.45), hurt = pulse(st.t, st.hurtT, 0.3);
      st._att = att;
      const flap = Math.sin(ph);
      for (const w of wings) {
        if (insect) { w.sh.rotation.z = w.sx * (alive ? flap * 0.55 + 0.15 : -0.2); w.sh.rotation.y = 0; continue; }
        // a hovering bird: a strong downstroke, the wing held wide (it reads from above), the hand trailing behind
        w.sh.rotation.z = w.sx * (alive ? flap * 0.6 + 0.12 : -0.3) * (1 - att * 0.6) + w.sx * att * 0.6;
        w.sh.rotation.y = w.sx * (-att * 0.6 + hurt * 0.3);
        w.el.rotation.z = w.sx * (alive ? Math.sin(ph - 0.9) * 0.35 - 0.02 : -0.4);
      }
      fly.position.set(Math.sin(st.t * 50) * hurt * 0.03, alive ? hover + flap * -0.04 + Math.sin(st.t * 1.3) * 0.05 - att * 0.35 : Math.max(0.1, hover - (st.t - st.deadT) * 3), att * 0.45 - hurt * 0.15);
      fly.rotation.x = (insect ? -0.05 : -0.12) + att * 0.55 - hurt * 0.3 + (st.moving ? 0.15 : 0);
      for (const t of talons) t.rotation.x = -att * 1.2 - 0.2;
      headPiv.rotation.x = att * 0.3 - hurt * 0.3 + Math.sin(st.t * 1.7) * 0.06;
      headPiv.rotation.y = Math.sin(st.t * 0.7) * 0.3 * (1 - att);
      if (hd.jaw) hd.jaw.rotation.x = att * 0.6 + hurt * 0.4;
      if (tailG) tailG.rotation.x = 0.15 + Math.sin(ph * 0.5) * 0.08 - att * 0.3;
      for (const a of anim) a(dt, st);
      if (!alive) o.rotation.z = Math.min(1.5, (st.t - st.deadT) * 3); else o.rotation.z = 0;
    };
  }

  else if (R.body === 'lantern') {
    // the watch lamp: a floating iron lantern with a lit glass, a visor with eye slits, a hanging ring
    const s = P.size ?? 1;
    const iron = metalM();
    const lampG = new THREE.Group(); inner.add(lampG);
    const glass = mesh(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 0.45 * s, 8), lazy('lampGlass', () => mat({ color: '#ffe2a8', emissive: pal.glow || '#ffc46b', emissiveK: 2.6, rough: 0.25 }))); glass.castShadow = false; lampG.add(glass);
    for (let i = 0; i < 8; i++) { const bb = box(0.03 * s, 0.5 * s, 0.03 * s, iron); const a = i / 8 * TAU; bb.position.set(Math.cos(a) * 0.23 * s, 0, Math.sin(a) * 0.23 * s); lampG.add(bb); }
    const cap = mesh(new THREE.ConeGeometry(0.32 * s, 0.26 * s, 8), iron); cap.position.y = 0.36 * s; lampG.add(cap);
    const ring = mesh(new THREE.TorusGeometry(0.08 * s, 0.015 * s, 6, 14), iron); ring.position.y = 0.55 * s; lampG.add(ring);
    const base = cyl(0.27 * s, 0.18 * s, 0.08 * s, iron, 8); base.position.y = -0.27 * s; lampG.add(base);
    const visor = mesh(new THREE.CylinderGeometry(0.235 * s, 0.235 * s, 0.13 * s, 12, 1, true, -1.2, 2.4), iron); visor.position.y = 0.06 * s; lampG.add(visor);
    for (const sx of [-1, 1]) { const e = box(0.06 * s, 0.02 * s, 0.02 * s, basic(pal.eyes || '#fff4c0', 1.6)); e.position.set(sx * 0.07 * s, 0.06 * s, 0.24 * s); lampG.add(e); }
    if (has('chain')) chain(lampG, [V(0, 0.6 * s, 0), V(0.02, 0.85 * s, 0), V(0, 1.1 * s, 0)], 0.02 * s, iron);
    if (has('spikes')) for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; const sp = spike([[0, 0, 0], [0.12 * s, 0, 0], [0.24 * s, -0.05 * s, 0]], 0.025 * s, iron, { rings: 5 }); sp.position.set(Math.cos(a) * 0.25 * s, -0.25 * s, Math.sin(a) * 0.25 * s); sp.rotation.y = -a; lampG.add(sp); }
    const glow = glowSprite(pal.glow || '#ffc46b', 1.8 * s, 0.7); lampG.add(glow); lights.push({ obj: glow, color: pal.glow || '#ffc46b', k: 2.5 });
    if (has('embers')) embers(inner, { n: 5, w: 0.4, y0: 1.2, h: 0.9 });
    const hov = P.hover ?? 1.4;
    lampG.position.y = hov;
    height = hov + 0.7 * s;
    update = (dt, st) => {
      const att = strike(st.t, st.attackT, 0.45), hurt = pulse(st.t, st.hurtT, 0.3);
      lampG.position.set(Math.sin(st.t * 50) * hurt * 0.03, hov + Math.sin(st.t * 1.7) * 0.15 - att * 0.2, att * 0.35 - hurt * 0.1);
      lampG.rotation.set(att * 0.5 - hurt * 0.3, st.t * 0.6, Math.sin(st.t * 1.1) * 0.08);
      glass.material.emissiveIntensity = 2.6 + att * 3 + (st.cast ? 1.5 : 0);
      if (st.deadT != null) { const k = ease((st.t - st.deadT) / 0.7); lampG.position.y = hov * (1 - k) + 0.25; glass.material.emissiveIntensity = 2.6 * (1 - k); }
      for (const a of anim) a(dt, st);
    };
  }

  else if (R.body === 'book') {
    // an animated tome: two covers on a spine, a block of pages, eyes on the cover, page-teeth when it bites
    const s = P.size ?? 1, W = 0.36 * s, Hb = 0.5 * s, T = 0.05 * s;
    const cov = lazy('cover', () => mat({ color: pal.base, rough: 0.6, rim: shade(pal.base, 0.5), rimK: 0.45 }));
    const pagesM = lazy('pageBlock', () => mat({ map: canvasTex('pageblock', 64, 64, (g) => { g.fillStyle = '#ece0c0'; g.fillRect(0, 0, 64, 64); for (let y = 0; y < 64; y += 2) { g.fillStyle = 'rgba(80,60,30,0.18)'; g.fillRect(0, y, 64, 1); } }), rough: 0.9, rimK: 0.2 }));
    const bookG = new THREE.Group(); inner.add(bookG);
    const spine = cyl(T * 0.9, T * 0.9, Hb, cov, 10); bookG.add(spine);
    const block = box(W * 0.95, Hb * 0.94, T * 1.4, pagesM); block.position.set(0, 0, 0); bookG.add(block);
    const covers = [];
    for (const sx of [-1, 1]) {
      const cp = new THREE.Group(); bookG.add(cp);
      const c = box(W, Hb, 0.025 * s, cov); c.position.set(0, 0, 0); cp.add(c);
      const pg = box(W * 0.93, Hb * 0.92, T * 0.6, pagesM); pg.position.set(0, 0, -sx * T * 0.35); cp.add(pg);
      for (const yy of [-1, 1]) { const cn = box(0.06 * s, 0.06 * s, 0.03 * s, lazy('gold', () => mat({ color: pal.gold || '#c8a040', rough: 0.3, metal: 0.85, rim: '#fff0b0', rimK: 0.5 }))); cn.position.set(W * 0.45, yy * Hb * 0.45, sx * 0.005); cp.add(cn); }
      covers.push({ cp, sx });
    }
    // the pages open on the right: the covers hinge on the spine (x = 0), the book faces +z with its edge
    bookG.rotation.y = Math.PI / 2;
    for (const c of covers) c.cp.children.forEach((m) => { m.position.x += W / 2; });
    block.position.x = W / 2;
    const face = new THREE.Group(); face.position.set(W * 0.55, Hb * 0.12, 0); bookG.add(face);
    for (const sx of [-1, 1]) { const e = glowEye(0.035 * s, pal.eyes, { socket: false }); e.position.set(W * 0.5, 0, sx * 0.07 * s); e.rotation.y = Math.PI / 2; face.add(e); }
    if (has('teeth')) { const tg = new THREE.ConeGeometry(1, 1, 4); for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) { const tm = mesh(tg, pagesM); tm.scale.set(0.015, 0.05, 0.015); tm.position.set(W * 0.96, (i / 5 - 0.5) * Hb * 0.8, sx * T * 0.5); tm.rotation.z = -Math.PI / 2 + sx * 0.3; bookG.add(tm); } }
    if (has('loose')) {
      const pm = lazy('pagesL', () => mat({ map: pageTex('#efe4c6', '#3a2a1a'), rough: 0.85, side: THREE.DoubleSide, alphaTest: 0.3, emissive: pal.glow, emissiveK: 0.15 }));
      const loose = []; for (let i = 0; i < 3; i++) { const lp = new THREE.Group(); inner.add(lp); lp.add(mesh(new THREE.PlaneGeometry(0.14, 0.2), pm)); loose.push(lp); }
      anim.push((dt, st) => loose.forEach((m, i) => { const a = st.t * 1.1 + i * 2.1; m.position.set(Math.cos(a) * 0.5, 0.9 + Math.sin(st.t * 2 + i) * 0.15, Math.sin(a) * 0.5); m.rotation.set(Math.sin(st.t + i) * 0.6, -a, 0.3); }));
    }
    if (pal.glow) { const gl = glowSprite(pal.glow, 1.0 * s, 0.35); gl.position.y = 0; bookG.add(gl); lights.push({ obj: gl, color: pal.glow, k: 0.8 }); }
    const hov = P.hover ?? 1.0;
    bookG.position.y = hov;
    height = hov + Hb * 0.6;
    update = (dt, st) => {
      const alive = st.deadT == null;
      const att = strike(st.t, st.attackT, 0.45, 0.4), hurt = pulse(st.t, st.hurtT, 0.3);
      const open = alive ? 0.35 + Math.sin(st.t * (st.moving ? 9 : 3.5)) * (st.moving ? 0.3 : 0.15) + att * 0.7 : 1.4;
      for (const c of covers) c.cp.rotation.y = c.sx * open;
      bookG.position.set(Math.sin(st.t * 50) * hurt * 0.03, alive ? hov + Math.sin(st.t * 2) * 0.08 - att * 0.15 : Math.max(0.05, hov - (st.t - st.deadT) * 2.5), att * 0.35 - hurt * 0.12);
      bookG.rotation.set(-hurt * 0.3 + (alive ? 0 : 1.4), Math.PI / 2, (st.moving ? 0.15 : 0) + att * 0.2);
      for (const a of anim) a(dt, st);
    };
  }

  else if (R.body === 'vortex') {
    // a dust devil: nested funnels of sand spinning at different speeds, stones in the wind, two eyes in the dust
    const Hv = P.height ?? 1.8, rTop = P.top ?? 0.6;
    const sand = canvasTex('sandstreak' + pal.base, 128, 128, (g, w, h) => {
      const r = rng(9); g.fillStyle = rgba(pal.base, 0.0); g.clearRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const y = r() * h, x = r() * w, l = 10 + r() * 40; g.strokeStyle = rgba(r() < 0.5 ? pal.base : pal.belly, 0.25 + r() * 0.5); g.lineWidth = 1 + r() * 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y - l * 0.15); g.stroke(); g.beginPath(); g.moveTo(x - w, y); g.lineTo(x - w + l, y - l * 0.15); g.stroke(); }
    });
    const shells = [];
    for (let i = 0; i < 3; i++) {
      const k = 1 - i * 0.22;
      const prof = []; for (let j = 0; j <= 10; j++) { const t = j / 10; prof.push(new THREE.Vector2((0.06 + Math.pow(t, 1.6) * rTop) * k, t * Hv * (0.95 + i * 0.03))); }
      const m = mat({ map: sand, color: '#ffffff', rough: 1, side: THREE.DoubleSide, emissive: pal.glow, emissiveK: 0.08 });
      m.transparent = true; m.opacity = 0.55 + i * 0.12; m.depthWrite = false; m.userData.baseOpacity = m.opacity; m.alphaTest = 0.02;
      const sg = new THREE.Group(); inner.add(sg); const lm = mesh(new THREE.LatheGeometry(prof, 18), m); lm.castShadow = i === 2; sg.add(lm); shells.push(sg);
    }
    const stones = [];
    for (let i = 0; i < 6; i++) { const sp = new THREE.Group(); inner.add(sp); const st0 = rock(0.04 + hash(i) * 0.04, M.limb, i, 0.3, 0); st0.position.set((0.2 + hash(i, 2) * 0.35), Hv * (0.2 + hash(i, 3) * 0.6), 0); sp.add(st0); stones.push(sp); }
    const face = new THREE.Group(); face.position.set(0, Hv * 0.72, 0); inner.add(face);
    for (const sx of [-1, 1]) { const e = glowEye(0.05, pal.eyes, { socket: false }); e.position.set(sx * 0.1, 0, rTop * 0.45); face.add(e); }
    const gl = glowSprite(pal.glow || pal.eyes, Hv * 0.9, 0.25); gl.position.y = Hv * 0.6; inner.add(gl); lights.push({ obj: gl, color: pal.glow || pal.eyes, k: 0.8 });
    height = Hv;
    update = (dt, st) => {
      const att = strike(st.t, st.attackT, 0.5), hurt = pulse(st.t, st.hurtT, 0.3);
      shells.forEach((s, i) => { s.rotation.y = st.t * (5 + i * 2.5) * (i % 2 ? -1 : 1); s.rotation.z = Math.sin(st.t * 1.3 + i) * 0.06 + (st.moving ? 0.12 : 0); s.scale.set(1 + att * 0.3, 1 - hurt * 0.1, 1 + att * 0.3); });
      stones.forEach((s, i) => { s.rotation.y = st.t * (3 + i * 0.7); });
      face.rotation.y = 0; face.position.z = att * 0.2;
      inner.position.z = att * 0.3 - hurt * 0.1;
      if (st.deadT != null) { const k = ease((st.t - st.deadT) / 0.8); inner.scale.set(1 + k, Math.max(0.05, 1 - k), 1 + k); } else inner.scale.setScalar(1);
      for (const a of anim) a(dt, st);
    };
  }

  else {   // blob: a glossy wobbling drop with a face
    const s = P.radius ?? 0.5, drop = P.shape === 'drop';
    // a dome (blots) or a drop with a soft point on top (ink slimes)
    const prof = drop ? [[0, 0], [0.8, 0], [0.97, 0.06], [1, 0.16], [0.92, 0.32], [0.76, 0.5], [0.53, 0.66], [0.31, 0.8], [0.13, 0.93], [0.03, 1.0], [0, 1.02]]
      : [[0, 0], [0.92, 0.02], [1, 0.12], [0.98, 0.35], [0.85, 0.6], [0.6, 0.82], [0.3, 0.96], [0.05, 1.02], [0, 1.03]];
    const bh = s * (P.tall ?? 1.2) * (drop ? 1.6 : 1);
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * s, y * bh)), 24); g.computeVertexNormals();
    const bm = mat({ map: S1.map, rough: R.rough ?? 0.18, metal: R.metal ?? 0.1, glow: S1.glow ? pal.glow : null, glowMap: S1.glow, glowK: 1.6, rim: pal.sheen || pal.glow || shade(pal.base, 0.6), rimK: 0.7, emissive: pal.glow, emissiveK: 0.08 });
    const bodyG = new THREE.Group(); inner.add(bodyG);
    const body = mesh(g, bm); bodyG.add(body);
    const pud = mesh(new THREE.CircleGeometry(s * 1.15, 20).rotateX(-Math.PI / 2), lazy('puddle', () => mat({ color: shade(pal.base, -0.2), rough: 0.1, metal: 0.2, rimK: 0 }))); pud.position.y = 0.012; pud.castShadow = false; inner.add(pud);
    // big cartoon eyes: white, pupil, a highlight (or glowing eyes for the fire and oil blobs)
    const face = new THREE.Group(); face.position.set(0, drop ? bh * 0.42 : s * 0.72 * (P.tall ?? 1.2) / 1.2, drop ? s * 0.86 : s * 0.78); bodyG.add(face);
    const eyes = [];
    for (const sx of [-1, 1]) {
      const ep = new THREE.Group(); ep.position.set(sx * s * 0.27, 0, 0); ep.rotation.y = sx * 0.3; face.add(ep);
      const er = s * (H.eye ?? 0.22);
      if (H.glowEyes) { ep.add(glowEye(er * 0.6, pal.eyes, { socket: false })); }
      else {
        ep.add(ell(er, er * 1.15, er * 0.7, lazy('eyeW', () => mat({ color: '#e8e2d0', rough: 0.3, rimK: 0 })), 12));
        const pu = ell(er * 0.52, er * 0.62, er * 0.4, basic('#0a0710'), 10); pu.position.set(0, -er * 0.1, er * 0.42); ep.add(pu);
        const sh = ell(er * 0.17, er * 0.17, er * 0.17, basic('#ffffff'), 6); sh.position.set(er * 0.2, er * 0.18, er * 0.66); ep.add(sh);
      }
      eyes.push(ep);
    }
    if (!H.noMouth) { const mo = mesh(new THREE.TorusGeometry(s * 0.12, s * 0.025, 5, 10, Math.PI), basic('#0a0710')); mo.rotation.z = Math.PI; mo.position.set(0, -s * 0.22, s * 0.04); face.add(mo); }
    if (has('helm')) {
      // Sir Splotch: a tin pot helm with a plume
      const hm = metalM();
      const top = bh * 1.02;
      const dm = mesh(new THREE.SphereGeometry(s * 0.42, 14, 8, 0, TAU, 0, Math.PI * 0.5), hm); dm.position.y = top - s * 0.12; bodyG.add(dm);
      const br = cyl(s * 0.48, s * 0.5, s * 0.05, hm, 14); br.position.y = top - s * 0.12; bodyG.add(br);
      const pm = lazy('plume', () => mat({ color: pal.plume || '#c83a2a', rough: 0.9, rim: '#ffb0a0', rimK: 0.4 }));
      for (let i = 0; i < 4; i++) bodyG.add(spike([[0, top + s * 0.25, -s * 0.05 * i], [0, top + s * 0.55, -s * (0.15 + 0.12 * i)], [0, top + s * 0.4, -s * (0.45 + 0.15 * i)]], s * 0.07, pm, { rings: 6, seg: 5 }));
    }
    if (has('pot')) {
      // the Inkpot: an old ink bottle the slime has grown out of
      const gm2 = lazy('potM', () => mat({ color: pal.pot || '#2a3a4a', rough: 0.2, metal: 0.1, rim: '#a0c0ff', rimK: 0.6 }));
      const pot = mesh(new THREE.LatheGeometry([[0, 0], [s * 1.0, 0], [s * 1.1, s * 0.15], [s * 1.12, s * 0.5], [s * 0.95, s * 0.7], [s * 0.75, s * 0.78], [s * 0.72, s * 0.9], [s * 0.8, s * 0.95]].map(([x, y]) => new THREE.Vector2(x, y)), 20), gm2);
      inner.add(pot); bodyG.position.y = s * 0.82;
      const lbl = mesh(new THREE.CylinderGeometry(s * 1.125, s * 1.125, s * 0.3, 20, 1, true, -0.8, 1.6), lazy('label', () => mat({ map: pageTex('#efe4c6', '#3a2a1a'), rough: 0.9 }))); lbl.position.y = s * 0.32; inner.add(lbl);
    }
    if (has('wick')) {
      // Gutterwick: a burning wick in its crown
      const top = bh * 1.02;
      const wk = tube([[0, top - 0.02, 0], [0.02, top + s * 0.25, 0], [0.05, top + s * 0.4, 0]], [[0, 0.03], [1, 0.02]], M.dark, { rings: 6, seg: 6 }); bodyG.add(wk);
      const fl = glowSprite(pal.glow || '#ffb040', s * 1.2, 0.95); fl.position.set(0.05, top + s * 0.55, 0); bodyG.add(fl); lights.push({ obj: fl, color: pal.glow || '#ffb040', k: 2 });
      embers(bodyG, { n: 5, w: 0.15, y0: top + s * 0.4, h: 0.6 });
    }
    if (has('flame')) {
      // a cinderling: a ball of coal with a fire for hair
      const top = bh * 1.02;
      for (let i = 0; i < 5; i++) { const fl = glowSprite(i % 2 ? '#ffd27a' : pal.glow || '#ff7a2a', s * (0.9 + hash(i) * 0.5), 0.85); fl.position.set((hash(i, 1) - 0.5) * s * 0.6, top + s * (0.1 + hash(i, 2) * 0.3), (hash(i, 3) - 0.5) * s * 0.5); bodyG.add(fl); }
      const big = glowSprite(pal.glow || '#ff7a2a', s * 3.5, 0.4); big.position.y = top * 0.6; bodyG.add(big); lights.push({ obj: big, color: pal.glow || '#ff7a2a', k: 1.6 });
      embers(inner, { n: 6, w: s, y0: top, h: 0.8 });
    }
    if (has('tendrils')) for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; const tp = new THREE.Group(); tp.position.set(Math.sin(a) * s * 0.85, s * 0.35, Math.cos(a) * s * 0.85); tp.rotation.y = a; bodyG.add(tp); tp.add(tube([[0, 0, 0], [0, s * 0.3, s * 0.25], [0, s * 0.45, s * 0.55]], [[0, s * 0.14], [1, s * 0.04]], bm, { rings: 8, seg: 8 })); anim.push((dt, st) => { tp.rotation.x = Math.sin(st.t * 2.2 + i * 1.7) * 0.4 - (st._att || 0) * 0.8; }); }
    if (has('tongue')) { const tg = tube([[0, -s * 0.2, s * 0.05], [0, -s * 0.35, s * 0.35], [0, -s * 0.55, s * 0.5]], [[0, s * 0.1, s * 0.04], [1, s * 0.06, s * 0.03]], lazy('tongue', () => mat({ color: pal.tongue || '#a0384a', rough: 0.3 })), { rings: 8, seg: 8 }); face.add(tg); }
    if (has('glyphs')) glyphRing(inner, 4, s * 1.4, s * 1.5, pal.glow || '#a77bff');
    if (has('bubbles')) { const bb = []; for (let i = 0; i < 4; i++) { const b = ell(s * 0.08, s * 0.08, s * 0.08, bm, 8); const bp = new THREE.Group(); bp.add(b); inner.add(bp); bb.push(bp); } anim.push((dt, st) => bb.forEach((b, i) => { const k = (st.t * 0.4 + i / 4) % 1; b.position.set(Math.sin(i * 2.3) * s * 0.5, s * (0.5 + k * 1.2), Math.cos(i * 2.3) * s * 0.5); b.scale.setScalar(Math.sin(k * Math.PI)); })); }
    if (pal.glow && !has('flame')) { const gl = glowSprite(pal.glow, s * 2.4, 0.18); gl.position.y = s * 0.5; inner.add(gl); }
    if (R.aura) { const au = glowSprite(pal.glow || pal.eyes, s * 4, 0.22); au.position.y = s * 0.6; inner.add(au); lights.push({ obj: au, color: pal.glow || pal.eyes, k: R.aura }); }
    const box3 = meshBox(inner); height = box3.max.y;
    let blinkAt = 1 + hash(R.seed) * 3;
    update = (dt, st) => {
      const att = strike(st.t, st.attackT, 0.45), hurt = pulse(st.t, st.hurtT, 0.3);
      st._att = att;
      const sq = 1 + Math.sin(st.t * (st.moving ? 9 : 3)) * 0.06 + att * 0.2 - hurt * 0.2;
      bodyG.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); bodyG.position.z = att * 0.3 - hurt * 0.1;
      bodyG.rotation.x = (st.moving ? 0.1 : 0) + att * 0.25;
      const bl = st.t > blinkAt && st.t < blinkAt + 0.12 ? 0.1 : 1;
      if (st.t > blinkAt + 0.12) blinkAt = st.t + 2 + ((st.t * 7.3) % 3);
      for (const e of eyes) e.scale.y = Math.max(0.1, bl * (1 - hurt * 0.8));
      if (st.deadT != null) { const k = ease((st.t - st.deadT) / 0.6); bodyG.scale.set(1 + k * 0.7, Math.max(0.06, 1 - k), 1 + k * 0.7); pud.scale.setScalar(1 + k * 0.6); }
      else pud.scale.setScalar(1 + att * 0.15);
      for (const a of anim) a(dt, st);
    };
  }

  // ---------- weapons and shields (in hand space: grip at the origin, the weapon along +z) ----------
  function weapon(hand, w, off = false) {
    const g = new THREE.Group(); hand.add(g);
    const wl = P.weaponLen ?? 1;
    const mt = metalM(), wd = woodM();
    if (w === 'sword' || w === 'longsword') {
      const L = (w === 'longsword' ? 0.95 : 0.7) * wl;
      const bl = box(0.05, 0.012, L, mt); bl.position.z = L / 2 + 0.06; g.add(bl);
      const tip = mesh(new THREE.ConeGeometry(0.035, 0.08, 4), mt); tip.rotation.x = Math.PI / 2; tip.position.z = L + 0.1; tip.scale.y = 0.4; g.add(tip);
      const gd = box(0.18, 0.03, 0.03, lazy('gold', () => mat({ color: pal.gold || '#c8a040', rough: 0.3, metal: 0.85, rim: '#fff0b0', rimK: 0.5 }))); gd.position.z = 0.05; g.add(gd);
      g.add(cyl(0.018, 0.018, 0.12, leatherM(), 6).rotateX(Math.PI / 2));
    } else if (w === 'scimitar') {
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0, Math.sin(t * 1.2) * 0.12 * t, 0.06 + t * 0.6 * wl]); }
      g.add(tube(pts, [[0, 0.03, 0.008], [0.8, 0.045, 0.008], [1, 0.004, 0.004]], mt, { rings: 12, seg: 6, up: V(1, 0, 0) }));
      const gd = box(0.12, 0.025, 0.025, lazy('gold', () => mat({ color: pal.gold || '#c8a040', rough: 0.3, metal: 0.85 }))); gd.position.z = 0.05; g.add(gd);
    } else if (w === 'club' || w === 'cudgel') {
      g.add(tube([[0, 0, -0.08], [0, 0.02, 0.3 * wl], [0, 0.03, 0.6 * wl]], [[0, 0.025], [0.6, 0.045], [1, 0.07]], wd, { rings: 10, seg: 8, cap: [0.02, 0.06] }));
      if (w === 'cudgel') for (let i = 0; i < 6; i++) { const a = i * 2.1; const n = spike([[0, 0, 0], [0, 0.05, 0]], 0.01, mt, { rings: 3, seg: 4 }); n.position.set(Math.cos(a) * 0.06, 0.03 + Math.sin(a) * 0.06, (0.45 + i * 0.03) * wl); n.lookAt(V(Math.cos(a), 0.03 + Math.sin(a), (0.45 + i * 0.03) * wl)); n.rotateX(Math.PI / 2); g.add(n); }
    } else if (w === 'hammer') {
      g.add(tube([[0, 0, -0.1], [0, 0, 0.6 * wl]], [[0, 0.022], [1, 0.022]], wd, { rings: 4, seg: 8 }));
      const hd = box(0.22, 0.11, 0.11, mt); hd.position.z = 0.6 * wl; g.add(hd);
    } else if (w === 'axe') {
      g.add(tube([[0, 0, -0.1], [0, 0, 0.65 * wl]], [[0, 0.022], [1, 0.022]], wd, { rings: 4, seg: 8 }));
      const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.12, 0.02, 0.2, 0.12); s.quadraticCurveTo(0.24, 0, 0.2, -0.12); s.quadraticCurveTo(0.12, -0.02, 0, -0.04);
      const ax = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: false }), mt); ax.rotation.set(0, -Math.PI / 2, Math.PI / 2); ax.position.set(-0.0075, 0, 0.56 * wl); g.add(ax);
    } else if (w === 'spear' || w === 'halberd') {
      const L = 1.7 * wl;
      g.add(tube([[0, 0, -L * 0.35], [0, 0, L * 0.65]], [[0, 0.02], [1, 0.02]], wd, { rings: 4, seg: 8 }));
      const hd = mesh(new THREE.ConeGeometry(0.04, 0.22, 4), mt); hd.rotation.x = Math.PI / 2; hd.position.z = L * 0.65 + 0.11; hd.scale.set(1, 1, 0.4); g.add(hd);
      if (w === 'halberd') { const s = new THREE.Shape(); s.moveTo(0, 0.08); s.quadraticCurveTo(0.18, 0.08, 0.2, -0.04); s.lineTo(0, -0.08); const ax = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }), mt); ax.rotation.set(0, -Math.PI / 2, Math.PI / 2); ax.position.set(-0.006, 0, L * 0.55); g.add(ax); }
      g.rotation.x = -0.15;
    } else if (w === 'staff' || w === 'crook') {
      const L = 1.6 * wl;
      g.add(tube([[0, 0, -L * 0.35], [0, 0.01, L * 0.3], [0, 0, L * 0.62]], [[0, 0.022], [1, 0.026]], wd, { rings: 6, seg: 8 }));
      if (w === 'crook') g.add(tube([[0, 0, L * 0.6], [0, 0.0, L * 0.7], [0, -0.08, L * 0.75], [0, -0.14, L * 0.68]], [[0, 0.022], [1, 0.02]], wd, { rings: 10, seg: 8 }));
      else if (pal.glow) { const orb = ell(0.06, 0.06, 0.06, M.glow, 10); orb.position.z = L * 0.66; g.add(orb); const gl = glowSprite(pal.glow, 0.4, 0.8); gl.position.z = L * 0.66; g.add(gl); lights.push({ obj: gl, color: pal.glow, k: 1.2 }); }
      g.rotation.x = -0.25;
    } else if (w === 'lantern') {
      // carried hanging from the hand
      const lp = new THREE.Group(); lp.position.set(0, -0.06, 0.04); g.add(lp);
      lp.add(mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 10), mt));
      const gls = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.13, 6), lazy('lampGlass', () => mat({ color: '#ffe2a8', emissive: pal.lamp || '#ffc46b', emissiveK: 2.6, rough: 0.25 }))); gls.position.y = -0.12; gls.castShadow = false; lp.add(gls);
      const cp = mesh(new THREE.ConeGeometry(0.08, 0.06, 6), mt); cp.position.y = -0.03; lp.add(cp);
      const gl = glowSprite(pal.lamp || '#ffc46b', 0.7, 0.75); gl.position.y = -0.12; lp.add(gl); lights.push({ obj: gl, color: pal.lamp || '#ffc46b', k: 1.8, lantern: true });
      anim.push((dt, st) => { lp.rotation.x = Math.sin(st.t * (st.moving ? 7 : 1.5)) * (st.moving ? 0.25 : 0.06); });
      g.rotation.x = 0.3;
    } else if (w === 'pick') {
      g.add(tube([[0, 0, -0.08], [0, 0, 0.6 * wl]], [[0, 0.02], [1, 0.022]], wd, { rings: 4, seg: 8 }));
      g.add(tube([[0, -0.22, 0.52 * wl], [0, 0, 0.6 * wl], [0, 0.22, 0.52 * wl]], [[0, 0.008], [0.5, 0.03], [1, 0.008]], mt, { rings: 10, seg: 6 }));
    } else if (w === 'quill') {
      const fmq = lazy('quillM', () => mat({ color: pal.quill || '#e8e0d0', rough: 0.7, side: THREE.DoubleSide, emissive: pal.glow, emissiveK: 0.2 }));
      g.add(tube([[0, 0, -0.05], [0, 0.02, 0.4]], [[0, 0.008], [1, 0.006]], fmq, { rings: 4, seg: 5 }));
      for (let i = 0; i < 6; i++) g.add(spike([[0, 0.01, 0.12 + i * 0.045], [0.04, 0.02, 0.18 + i * 0.045], [0.06, 0.02, 0.25 + i * 0.045]], 0.012, fmq, { rings: 4, seg: 4 }));
      const nib = mesh(new THREE.ConeGeometry(0.01, 0.06, 4), M.dark); nib.rotation.x = -Math.PI / 2; nib.position.z = -0.08; g.add(nib);
    } else if (w === 'ledger' || w === 'book') {
      const bk = box(0.2, 0.26, 0.05, lazy('ledgerM', () => mat({ color: pal.ledger || '#5a2a1a', rough: 0.6, rimK: 0.3 }))); bk.position.set(0, -0.08, 0.06); bk.rotation.set(0, Math.PI / 2, 0); g.add(bk);
      const pg = box(0.19, 0.24, 0.045, lazy('pageBlock2', () => mat({ color: '#ece0c0', rough: 0.9 }))); pg.position.set(0.004, -0.08, 0.06); pg.rotation.y = Math.PI / 2; g.add(pg);
    } else if (w === 'chain' || w === 'flail') {
      const pts = [V(0, 0, 0.05), V(0, -0.1, 0.15), V(0, -0.25, 0.2), V(0, -0.38, 0.22)];
      chain(g, pts, 0.022, mt);
      const ball = rock(0.08, mt, 3, 0.1, 1); ball.position.set(0, -0.44, 0.22); g.add(ball);
      if (w === 'flail') for (let i = 0; i < 6; i++) { const a = i * 1.05; const sp = spike([[0, 0, 0], [0, 0.06, 0]], 0.015, mt, { rings: 3, seg: 4 }); sp.position.set(Math.cos(a) * 0.07, -0.44 + Math.sin(a) * 0.07, 0.22); sp.lookAt(V(Math.cos(a) * 2, -0.44 + Math.sin(a) * 2, 0.22)); sp.rotateX(Math.PI / 2); g.add(sp); }
    } else if (w === 'nozzle') {
      g.add(tube([[0, 0, -0.1], [0, 0.0, 0.45]], [[0, 0.03], [0.8, 0.028], [1, 0.045]], metalM(), { rings: 6, seg: 8 }));
      const fl = glowSprite(pal.glow || '#ff8a2a', 0.35, 0.9); fl.position.z = 0.55; g.add(fl);
      const jet = glowSprite('#ffd27a', 0.8, 0); jet.position.z = 0.95; g.add(jet);
      lights.push({ obj: fl, color: pal.glow || '#ff8a2a', k: 1.2 });
      anim.push((dt, st) => { const k = (st._att || 0) + (st.cast ? 1 : 0); jet.material.opacity = Math.min(0.95, k * 0.95); jet.scale.setScalar(0.5 + k * 0.9 + Math.sin(st.t * 30) * 0.05); fl.scale.setScalar(0.3 + Math.sin(st.t * 17) * 0.05); });
      g.rotation.x = -0.4;
    } else if (w === 'tongs') {
      for (const sx of [-1, 1]) g.add(tube([[0, 0, -0.05], [sx * 0.03, 0, 0.3 * wl], [sx * 0.01, 0, 0.55 * wl]], [[0, 0.012], [1, 0.012]], mt, { rings: 6, seg: 5 }));
      const coal = rock(0.05, lazy('coal', () => mat({ color: '#2a0e04', emissive: pal.glow || '#ff6a14', emissiveK: 2, rough: 0.7, flat: true })), 2, 0.3, 0); coal.position.z = 0.57 * wl; g.add(coal);
    } else if (w === 'torch') {
      g.add(tube([[0, 0, -0.1], [0, 0, 0.35]], [[0, 0.02], [1, 0.03]], wd, { rings: 4, seg: 6 }));
      const fl = glowSprite('#ffb040', 0.45, 0.95); fl.position.z = 0.42; g.add(fl); lights.push({ obj: fl, color: '#ffb040', k: 1.4 });
      g.rotation.x = -0.6;
    } else if (w === 'stone') {
      g.add(rock(0.11, M.limb, 5, 0.25, 1));
    } else if (w === 'mirror') {
      const fr = mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 20), lazy('gold', () => mat({ color: pal.gold || '#c8a040', rough: 0.3, metal: 0.85 }))); fr.position.z = 0.16; g.add(fr);
      const gl = mesh(new THREE.CircleGeometry(0.11, 20), lazy('mirror', () => mat({ color: '#e8eef8', rough: 0.12, metal: 0.4, rim: pal.glow || '#ffffff', rimK: 0.9, flat: true, side: THREE.DoubleSide, emissive: pal.glow || '#c8d8ff', emissiveK: 0.35 }))); gl.position.z = 0.16; g.add(gl);
    } else if (w === 'whip') {
      chain(g, [V(0, 0, 0.05), V(0, -0.15, 0.25), V(0.05, -0.4, 0.3), V(0.08, -0.65, 0.2)], 0.02, mt);
    }
    // carried low and forward at rest; a strike swings it up and over (lanterns, staves, spears and nozzles set their own)
    if (!/^(lantern|nozzle|staff|crook|spear|halberd|torch|ledger|book|chain|flail|whip|stone|mirror)$/.test(w)) g.rotation.x = 0.75;
    if (off) g.scale.x = -1;
    return g;
  }
  function shield(parent, kindS, sx, y, at) {
    const sm = kindS === 'tower' ? metalM() : lazy('shieldM', () => mat({ color: pal.shield || pal.trim || '#6a4a2a', rough: 0.6, rim: '#ffe0b0', rimK: 0.4 }));
    let s;
    if (kindS === 'round' || kindS === 'default') { s = cyl(0.26, 0.26, 0.04, sm, 18); s.rotation.z = Math.PI / 2; const boss = ell(0.06, 0.06, 0.06, metalM(), 10); boss.position.x = 0.03; s.add(boss); }
    else { const sh = new THREE.Shape(); sh.moveTo(-0.18, 0.28); sh.lineTo(0.18, 0.28); sh.lineTo(0.18, -0.05); sh.quadraticCurveTo(0.1, -0.3, 0, -0.38); sh.quadraticCurveTo(-0.1, -0.3, -0.18, -0.05); sh.closePath(); s = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }), sm); s.rotation.y = Math.PI / 2; s.scale.setScalar(kindS === 'tower' ? 1.4 : 1.05); }
    s.position.set(sx * at * 1.4, y, 0.05); parent.add(s);
  }

  function death(st, sink) {
    if (st.deadT == null) { o.rotation.z = 0; o.position.y = 0; return; }
    const k = ease((st.t - st.deadT) / 0.6); o.rotation.z = k * 1.35; o.position.y = -k * sink;
  }

  const size = R.size || 1;
  o.scale.setScalar(size);
  const sprites = [];
  o.traverse((m) => { if (m.isSprite) { m.castShadow = false; sprites.push(m); } });
  const step = (dt, st) => {
    const s = { ...st };
    update(dt, s);
    flash.value = pulse(st.t, st.hurtT, 0.2);   // a hit: a brief warm rim, not a tint of the whole body
    // a dead foe's glows go out
    const dk = st.deadT == null ? 1 : 1 - ease((st.t - st.deadT) / 0.5);
    if (dk < 1 || sprites.dead) { for (const sp of sprites) sp.visible = dk > 0.02; sprites.dead = dk < 1; }
  };
  rig(THREE, o, step, R.id || null);
  const entry = R.id ? GEO.get(R.id) : null;
  if (entry) entry.refs++;
  let released = false;
  /** Call when the body is thrown away (src/render3d/actors.js detach): the recipe's geometry may then be freed. */
  const release = () => { if (released || !entry) return; released = true; entry.refs--; entry.used = ++geoClock; };
  return { o, height: height * size, mats, lights, recipe: R, update: step, release };
}

// ---------- rig: merge every mesh into one rigidly skinned mesh per material ----------
const EMPTY = new Map();
function rig(THREE, o, step, cacheKey) {
  o.updateMatrixWorld(true);
  const all = []; o.traverse((n) => all.push(n));
  const snap = all.map((n) => [n.position.clone(), n.quaternion.clone(), n.scale.clone()]);
  const live = new Set([o]);
  for (const n of all) if (n.userData.live) live.add(n);
  // a pivot is a bone if the animation ever moves it: run the update through a spread of states and see
  for (const s of RIG_SAMPLES) {
    step(1 / 30, { moving: false, speed: 0, attackT: null, hurtT: null, deadT: null, cast: false, ...s });
    all.forEach((n, i) => {
      if (live.has(n) || n.isSprite) return;
      const [p, q, sc] = snap[i];
      if (n.position.distanceToSquared(p) > 1e-12 || Math.abs(n.quaternion.dot(q)) < 1 - 1e-9 || n.scale.distanceToSquared(sc) > 1e-12) live.add(n);
    });
  }
  all.forEach((n, i) => { n.position.copy(snap[i][0]); n.quaternion.copy(snap[i][1]); n.scale.copy(snap[i][2]); });
  for (const n of all) if (n.isSprite) n.visible = true;
  o.updateMatrixWorld(true);
  const boneOf = (m) => { let n = m; while (n && !live.has(n)) n = n.parent; return n || o; };
  const meshes = all.filter((n) => n.isMesh && !n.isSkinnedMesh && !n.userData.keep && n.visible !== false && n.geometry && n.geometry.attributes.position);
  // groups by material (and shadow casting), in tree order
  const groups = new Map();
  for (const m of meshes) {
    const key = m.material.uuid + (m.castShadow ? 's' : 'n');
    if (!groups.has(key)) groups.set(key, { material: m.material, cast: m.castShadow, list: [] });
    groups.get(key).list.push(m);
  }
  const bones = [], boneIx = new Map();
  const ix = (b) => { if (!boneIx.has(b)) { boneIx.set(b, bones.length); bones.push(b); } return boneIx.get(b); };
  for (const n of all) if (live.has(n)) ix(n);
  const hit = cacheKey ? GEO.get(cacheKey) : null;
  const cached = hit ? hit.geos : null;
  const useCache = cached && cached.length === groups.size;
  const out = [];
  let gi = 0;
  const v = new THREE.Vector3(), nrm = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const grp of groups.values()) {
    let geo;
    if (useCache) geo = cached[gi];
    else {
      let nv = 0, ni = 0;
      for (const m of grp.list) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
      const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let vo = 0, io = 0;
      for (const m of grp.list) {
        const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        const mw = m.matrixWorld; nm.getNormalMatrix(mw);
        const flip = mw.determinant() < 0;
        const vb = m.userData.vertexBone, b0 = ix(boneOf(m));
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(mw); pos.set([v.x, v.y, v.z], (vo + i) * 3);
          if (N) { nrm.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([nrm.x, nrm.y, nrm.z], (vo + i) * 3); }
          if (U) uv.set([U.getX(i), U.getY(i)], (vo + i) * 2);
          si[(vo + i) * 4] = vb ? ix(vb(i)) : b0; sw[(vo + i) * 4] = 1;
        }
        if (g.index) { const a = g.index.array; for (let k = 0; k < a.length; k += 3) { index[io++] = a[k] + vo; index[io++] = a[flip ? k + 2 : k + 1] + vo; index[io++] = a[flip ? k + 1 : k + 2] + vo; } }
        else for (let k = 0; k < P.count; k += 3) { index[io++] = vo + k; index[io++] = vo + (flip ? k + 2 : k + 1); index[io++] = vo + (flip ? k + 1 : k + 2); }
        vo += P.count;
      }
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      geo.userData.shared = !!cacheKey;   // src/render3d/actors.js detach() keeps shared geometry
    }
    out.push(geo);
    const sm = new THREE.SkinnedMesh(geo, grp.material);
    sm.castShadow = grp.cast; sm.receiveShadow = true; sm.frustumCulled = false;
    grp.sm = sm; gi++;
  }
  if (cacheKey && !useCache) {
    if (hit) for (const g of hit.geos) g.dispose();
    GEO.set(cacheKey, { geos: out, refs: hit ? hit.refs : 0, used: ++geoClock });
    if (GEO.size > GEO_KEEP) {
      const idle = [...GEO.entries()].filter(([k, e]) => e.refs <= 0 && k !== cacheKey).sort((x, y) => x[1].used - y[1].used);
      for (const [k, e] of idle.slice(0, GEO.size - GEO_KEEP)) { for (const g of e.geos) g.dispose(); GEO.delete(k); }
    }
  }
  // take the source meshes out (a mesh that is itself a bone stays in the tree, drawing nothing)
  for (const m of meshes) {
    if (live.has(m)) {
      if (!EMPTY.has(THREE)) { const e = new THREE.BufferGeometry(); e.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3)); e.userData.shared = true; EMPTY.set(THREE, e); }
      m.geometry = EMPTY.get(THREE); m.frustumCulled = false; m.castShadow = false; m.visible = m.children.length > 0;
    } else if (m.parent) m.parent.remove(m);
  }
  const skel = new THREE.Skeleton(bones);
  const bind = new THREE.Matrix4();
  for (const grp of groups.values()) { o.add(grp.sm); grp.sm.bind(skel, bind); }
}

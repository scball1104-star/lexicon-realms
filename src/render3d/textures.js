// Small canvas-made textures (glows, wool for capes, wood and leather for code-built gear). Ported from the approved
// hero mockup (D:\LQOnline\mockups3d_hero\js\gear.js). Deterministic: a seeded generator, never Math.random.
import * as THREE from '../vendor/three/three.module.min.js';

export function seeded(seed = 98765) {
  let s = seed % 2147483647 || 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return { r, R: (a, b) => a + (b - a) * r() };
}
const { R, r: rand } = seeded(98765);

export function canvasTex(w, h, paint, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 4;
  return t;
}

const radials = new Map();
export function radial(inner = 'rgba(255,220,150,1)', mid = 'rgba(255,160,60,0.35)') {
  const k = inner + mid;
  if (!radials.has(k)) {
    radials.set(k, canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, inner); gr.addColorStop(0.35, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }));
  }
  return radials.get(k);
}
/** A white soft dot (tinted by the material or vertex colour). */
export const softDot = () => radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.35)');

const woods = new Map();
export function woodTex(base = '#6a4a2c') {
  if (!woods.has(base)) {
    woods.set(base, canvasTex(32, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 50; i++) {
        g.strokeStyle = `rgba(${R(20, 50)},${R(12, 30)},${R(5, 15)},${R(0.15, 0.4)})`; g.lineWidth = R(0.5, 2);
        g.beginPath(); const x = R(0, w); g.moveTo(x, 0); g.bezierCurveTo(x + R(-4, 4), h / 3, x + R(-4, 4), h * 2 / 3, x + R(-3, 3), h); g.stroke();
      }
    }));
  }
  return woods.get(base);
}
const leathers = new Map();
export function leatherTex(base = '#4a3324') {
  if (!leathers.has(base)) {
    leathers.set(base, canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '255,230,200' : '0,0,0'},${R(0.03, 0.08)})`; g.fillRect(R(0, w), R(0, h), R(1, 2), R(1, 2)); }
      g.strokeStyle = 'rgba(0,0,0,0.35)'; for (let y = 4; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 3); g.stroke(); }
    }, { repeat: [1, 3] }));
  }
  return leathers.get(base);
}
const wools = new Map();
export function woolTex(base, trim = null, emblem = null) {
  const k = `${base}|${trim}|${emblem}`;
  if (!wools.has(k)) {
    wools.set(k, canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${R(0.02, 0.08)})`; g.fillRect(0, y, w, 1); }
      for (let i = 0; i < 14; i++) {
        const x = R(0, w); const gr = g.createLinearGradient(x - 8, 0, x + 8, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(0,0,0,${R(0.06, 0.16)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - 8, h * 0.2, 16, h * 0.8);
      }
      if (trim) { g.fillStyle = trim; g.fillRect(0, h - 14, w, 7); g.fillRect(0, h - 4, w, 2); }
      if (emblem) {
        g.save(); g.translate(w / 2, h * 0.36); g.fillStyle = emblem; g.globalAlpha = 0.85; g.beginPath();
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); g.lineTo(Math.cos(a + 0.63) * 6, Math.sin(a + 0.63) * 6); }
        g.fill(); g.restore();
      }
      const gr = g.createLinearGradient(0, h * 0.75, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = gr; g.fillRect(0, h * 0.75, w, h * 0.25);
    }));
  }
  return wools.get(k);
}

// ---------- tileable ground detail (linear data, mean about 0.5: the ground shader multiplies tile colour by 2x it) ----------
/** Tileable value noise in 0..1 (size x size, `cells` lattice cells per side, octaves halve in weight). */
export function tileNoise(size, cells, seed = 7, octaves = 3) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o, { r } = seeded(seed * 977 + o * 131);
    const lat = new Float32Array(n * n); for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * n, fy = (y / size) * n, x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = lat[(y0 % n) * n + (x0 % n)], b = lat[(y0 % n) * n + ((x0 + 1) % n)];
      const c = lat[((y0 + 1) % n) * n + (x0 % n)], d = lat[((y0 + 1) % n) * n + ((x0 + 1) % n)];
      out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
const dataTex = (size, paint) => canvasTex(size, size, paint, { srgb: false, repeat: [1, 1] });
/** Paint a noise field into the canvas as grey around `mid` with +-`amp`. */
function noiseFill(g, size, cells, seed, mid, amp, tint = [1, 1, 1]) {
  const n = tileNoise(size, cells, seed), im = g.createImageData(size, size);
  for (let i = 0; i < n.length; i++) { const v = mid + (n[i] - 0.5) * 2 * amp; im.data[i * 4] = v * tint[0]; im.data[i * 4 + 1] = v * tint[1]; im.data[i * 4 + 2] = v * tint[2]; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
}
/** Draw with wrap-around so strokes that cross an edge tile cleanly. */
function wrapDraw(g, size, x, y, fn) { for (const ox of [0, -size, size]) for (const oy of [0, -size, size]) { const px = x + ox, py = y + oy; if (px > -24 && py > -24 && px < size + 24 && py < size + 24) fn(px, py); } }
let groundSet = null;
export function groundDetail() {
  if (groundSet) return groundSet;
  const S = 256;
  const grass = dataTex(S, (g) => {
    noiseFill(g, S, 6, 11, 122, 26, [0.98, 1.02, 0.96]);
    const { R, r } = seeded(4242);
    for (let i = 0; i < 5200; i++) {
      const x = R(0, S), y = R(0, S), len = R(3, 9), a = -Math.PI / 2 + R(-0.6, 0.6), lit = r() < 0.55;
      const v = lit ? R(150, 205) : R(55, 95);
      g.strokeStyle = lit ? `rgba(${v + 10},${v + 14},${v * 0.72},${R(0.35, 0.8)})` : `rgba(${v * 0.8},${v},${v * 0.7},${R(0.35, 0.7)})`;
      g.lineWidth = R(0.8, 1.6);
      wrapDraw(g, S, x, y, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); g.stroke(); });
    }
  });
  const dirt = dataTex(S, (g) => {
    noiseFill(g, S, 5, 23, 124, 30, [1.03, 0.99, 0.94]);
    const { R } = seeded(777);
    for (let i = 0; i < 26; i++) {   // ruts and cracks
      const x = R(0, S), y = R(0, S), a = R(0, 6.28), l = R(14, 40);
      g.strokeStyle = `rgba(40,30,22,${R(0.18, 0.4)})`; g.lineWidth = R(0.8, 1.6);
      wrapDraw(g, S, x, y, (px, py) => { g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(a + 0.6) * l / 2, py + Math.sin(a + 0.6) * l / 2, px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
    }
    for (let i = 0; i < 520; i++) {   // pebbles: a dark under-shadow, a lit top
      const x = R(0, S), y = R(0, S), rx = R(1.2, 4.2), ry = rx * R(0.6, 0.95), v = R(150, 215);
      wrapDraw(g, S, x, y, (px, py) => {
        g.fillStyle = 'rgba(30,24,18,0.45)'; g.beginPath(); g.ellipse(px + 0.8, py + 1.1, rx, ry, 0, 0, 6.28); g.fill();
        g.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`; g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, 6.28); g.fill();
      });
    }
  });
  const stone = dataTex(S, (g) => {
    g.fillStyle = 'rgb(70,66,62)'; g.fillRect(0, 0, S, S);
    const { R } = seeded(31337);
    for (let y = 0; y < S; y += 32) for (let x = (y / 32) % 2 ? 0 : 20; x < S + 40; x += 40) {
      const v = R(110, 165), w = R(32, 38), h = R(26, 30);
      wrapDraw(g, S, x + R(0, 3), y + R(0, 3), (px, py) => { g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.92})`; g.beginPath(); g.roundRect(px, py, w, h, 6); g.fill(); });
    }
    const n = tileNoise(S, 8, 5), im = g.getImageData(0, 0, S, S);
    for (let i = 0; i < n.length; i++) { const k = 0.8 + n[i] * 0.4; for (let c = 0; c < 3; c++) im.data[i * 4 + c] *= k; }
    g.putImageData(im, 0, 0);
  });
  const sand = dataTex(S, (g) => {
    noiseFill(g, S, 4, 41, 128, 14, [1.02, 1.0, 0.95]);
    const { R } = seeded(5150);
    for (let i = 0; i < 4000; i++) { const v = R(90, 180); g.fillStyle = `rgba(${v},${v},${v * 0.92},0.5)`; g.fillRect(R(0, S), R(0, S), 1, 1); }
    for (let i = 0; i < 18; i++) { const y = R(0, S); g.strokeStyle = 'rgba(80,70,50,0.18)'; g.lineWidth = 2; wrapDraw(g, S, 0, y, (px, py) => { g.beginPath(); g.moveTo(px, py); for (let x = 0; x <= S; x += 16) g.lineTo(px + x, py + Math.sin(x * 0.05 + i) * 4); g.stroke(); }); }
  });
  // macro variation: R and G are two independent tileable noise fields
  const macro = dataTex(128, (g) => {
    const a = tileNoise(128, 4, 91, 4), b = tileNoise(128, 6, 92, 3), im = g.createImageData(128, 128);
    for (let i = 0; i < a.length; i++) { im.data[i * 4] = a[i] * 255; im.data[i * 4 + 1] = b[i] * 255; im.data[i * 4 + 2] = 128; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
  });
  groundSet = { grass, dirt, stone, sand, macro };
  return groundSet;
}
let waterN = null;
/** A tileable normal map of soft ripples (for the scrolling water surfaces). */
export function waterNormal() {
  if (waterN) return waterN;
  const S = 256, h = tileNoise(S, 8, 61, 3);
  waterN = dataTex(S, (g) => {
    const im = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)], dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
      const nx = -dx * 6, ny = -dy * 6, l = Math.hypot(nx, ny, 1), i = (y * S + x) * 4;
      im.data[i] = (nx / l * 0.5 + 0.5) * 255; im.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; im.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
  return waterN;
}

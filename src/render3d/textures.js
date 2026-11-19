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

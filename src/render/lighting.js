// Light layer: ambient colour by time of day, point lights with pixel-stepped dithered falloff, additive glow halos,
// lit windows at night. Ported from Lexicon Quest next/src/world/lighting.js (stamps, bands, Bayer edges, lighten
// light map) and world/townlife.js (window pane detection), adapted to a continuous day/night cycle.
//
//   const L = createLighting()
//   L.apply(g, W, H, cam, sky, lights, t, fxLevel)
//       g: world buffer context (W x H, world pixels). sky: daycycle.skyAt(). lights: [{ x, y, r, rgb, k, flicker, glow,
//       lamp }] world px; k = intensity 0..1; lamp: true -> scaled by sky.lamps (lamps, windows, the player's light).
//   L.windows(baked, img) -> [{ x, y, w, h, panes }]     window panes of every building in a baked zone (cached)
//   L.drawWindows(g, cam, wins, k)                         paint panes bright + halo (after the light pass)
//
// Pure helpers (node-tested): bandBrightness, BANDS, BAYER4, stampPixel.

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const BANDS = [[0.30, 1.0], [0.56, 0.72], [0.80, 0.44], [1.0, 0.20]];
const EDGE = 0.07;
const LIFT = '#1a1430';

export const LIGHT_RGB = {
  lamp: [255, 214, 150],
  window: [255, 200, 130],
  player: [210, 220, 255],
  well: [200, 230, 255],
  glow: [255, 176, 90],
};

/** Band brightness at normalized distance d for pixel (x, y), Bayer-dithered at band edges. */
export function bandBrightness(d, x, y) {
  const th = (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
  for (let i = 0; i < BANDS.length; i++) {
    const [edge, inner] = BANDS[i];
    const outer = i + 1 < BANDS.length ? BANDS[i + 1][1] : 0;
    if (d < edge - EDGE) return inner;
    if (d < edge + EDGE) { const f = (d - (edge - EDGE)) / (2 * EDGE); return th < f ? outer : inner; }
  }
  return 0;
}

/** One light-map pixel: ambient lerped toward the light colour by band brightness x intensity. */
export function stampPixel(amb, rgb, b, k) {
  return [0, 1, 2].map((i) => Math.round(Math.max(amb[i], amb[i] + (rgb[i] - amb[i]) * b * k)));
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function createLighting() {
  const stamps = new Map();
  let layer = null, lg = null;
  const winCache = new Map();

  function stamp(rad, rgb, k, amb) {
    rad = Math.max(2, rad | 0);
    const kq = Math.round(k * 8) / 8;
    const key = `${rad}|${rgb}|${kq}|${amb || 'glow'}`;
    let s = stamps.get(key);
    if (s) return s;
    const R = Math.ceil(rad * (1 + EDGE)) + 1, size = R * 2 + 1;
    const [c, g] = makeCanvas(size, size);
    const img = g.createImageData(size, size), px = img.data;
    const bg = amb || [0, 0, 0];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x - R, dy = (y - R) * 1.15;          // a touch flattened: light pools on the ground in 3/4 view
      const d = Math.sqrt(dx * dx + dy * dy) / (rad + 0.5);
      const b = d >= 1 + EDGE ? 0 : bandBrightness(d, x, y);
      const i = (y * size + x) * 4;
      if (amb) {
        const p = stampPixel(bg, rgb, b, kq);
        px[i] = p[0]; px[i + 1] = p[1]; px[i + 2] = p[2]; px[i + 3] = 255;
      } else {
        px[i] = Math.round(rgb[0] * b); px[i + 1] = Math.round(rgb[1] * b); px[i + 2] = Math.round(rgb[2] * b); px[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    if (stamps.size > 160) stamps.clear();
    s = { canvas: c, R };
    stamps.set(key, s);
    return s;
  }

  function apply(g, W, H, cam, sky, lights, t, fxLevel = 'high') {
    const amb = sky.amb.map((v) => Math.max(0, Math.min(255, Math.round((v * 255) / 4) * 4)));
    const dark = amb[0] < 250 || amb[1] < 250 || amb[2] < 245;
    const flick = Math.floor(t * 8);
    // 1. desaturate (dusk, night)
    if (sky.desat > 0.01) {
      g.save(); g.globalCompositeOperation = 'saturation'; g.globalAlpha = sky.desat; g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); g.restore();
    }
    // 2. light map: ambient + lighten of every stamp, multiplied onto the frame
    if (dark) {
      if (!layer || layer.width !== W || layer.height !== H) [layer, lg] = makeCanvas(W, H);
      lg.globalCompositeOperation = 'source-over';
      lg.fillStyle = `rgb(${amb[0]},${amb[1]},${amb[2]})`;
      lg.fillRect(0, 0, W, H);
      lg.globalCompositeOperation = 'lighten';
      for (const l of lights) {
        const k = (l.k == null ? 1 : l.k) * (l.lamp ? sky.lamps : 1);
        if (k < 0.06) continue;
        let rad = l.r || 48;
        if (l.flicker) rad += ((flick + (l.x | 0)) % 3) - 1;
        const sx = Math.round(l.x - cam.x), sy = Math.round(l.y - cam.y);
        if (sx + rad < 0 || sy + rad < 0 || sx - rad > W || sy - rad > H) continue;
        const st = stamp(rad, l.rgb || LIGHT_RGB.lamp, k, amb);
        lg.drawImage(st.canvas, sx - st.R, sy - st.R);
      }
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.drawImage(layer, 0, 0);
      // never pure black: a faint indigo lift
      const lift = Math.max(0, 0.85 - sky.lum) * 0.5;
      if (lift > 0.01) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = lift; g.fillStyle = LIFT; g.fillRect(0, 0, W, H); }
      g.restore();
    }
    // 3. additive halos (lamps at night, spell glows any time)
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.glow === 0) continue;
      const k = (l.k == null ? 1 : l.k) * (l.lamp ? sky.lamps : 1);
      const a = (l.glow == null ? 0.22 : l.glow) * k * (fxLevel === 'low' ? 0.8 : 1);
      if (a < 0.02) continue;
      const sx = Math.round(l.x - cam.x), sy = Math.round(l.y - cam.y);
      const rad = Math.max(6, Math.round((l.r || 48) * 0.42)) + (l.flicker ? ((flick >> 1) % 2) : 0);
      if (sx + rad < 0 || sy + rad < 0 || sx - rad > W || sy - rad > H) continue;
      const st = stamp(rad, l.glowRgb || (l.lamp ? LIGHT_RGB.glow : l.rgb), 1, null);
      g.globalAlpha = Math.min(1, a);
      g.drawImage(st.canvas, sx - st.R, sy - st.R);
    }
    g.restore();
  }

  // ---------------------------------------------------------------- windows (ported from LQ townlife.js)
  const PANES = new Set(['249,215,122', '235,161,77', '255,247,214']);
  function detectPanes(meta, img) {
    const [rx, ry, rw, rh] = meta.rect;
    const [c, g] = makeCanvas(rw, rh);
    g.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);
    const A = g.getImageData(0, 0, rw, rh).data;
    const mask = new Uint8Array(rw * rh), seen = new Uint8Array(rw * rh);
    for (let i = 0, p = 0; i < A.length; i += 4, p++) if (A[i + 3] > 200 && PANES.has(`${A[i]},${A[i + 1]},${A[i + 2]}`)) mask[p] = 1;
    const boxes = [], stack = [];
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      let x0 = rw, y0 = rh, x1 = -1, y1 = -1, n = 0;
      stack.length = 0; stack.push(s); seen[s] = 1;
      while (stack.length) {
        const p = stack.pop(); const x = p % rw, y = (p / rw) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
          const q = ny * rw + nx;
          if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      // windows only: below the roof (overhead rows) and at least 5 x 5
      if (w >= 5 && h >= 5 && n >= 12 && y0 >= (meta.overheadRows || 0) * 16 - 4) boxes.push({ dx: x0, dy: y0, w, h });
    }
    const [pc, pg] = makeCanvas(rw, rh);
    const out = pg.createImageData(rw, rh);
    for (const b of boxes) for (let y = b.dy; y < b.dy + b.h; y++) for (let x = b.dx; x < b.dx + b.w; x++) {
      const p = y * rw + x;
      if (!mask[p]) continue;
      out.data[p * 4] = Math.min(255, A[p * 4] + 10); out.data[p * 4 + 1] = Math.min(255, A[p * 4 + 1] + 14); out.data[p * 4 + 2] = Math.min(255, A[p * 4 + 2] + 20); out.data[p * 4 + 3] = 255;
    }
    pg.putImageData(out, 0, 0);
    void c;
    return { boxes, panes: pc };
  }

  function windows(baked, sheet) {
    if (!baked.statics) return [];
    if (baked._windows) return baked._windows;
    const out = [];
    for (const s of baked.statics) {
      const m = s.meta;
      if (!m || m.kind !== 'building' || !m.rect) continue;
      let rec = winCache.get(s.t);
      if (!rec) { try { rec = detectPanes(m, sheet(m.sheet)); } catch { rec = { boxes: [], panes: null }; } winCache.set(s.t, rec); }
      const ox = (s.x - m.anchor[0]) * 16, oy = (s.y - m.anchor[1]) * 16;
      for (const b of rec.boxes) out.push({ x: ox + b.dx, y: oy + b.dy, w: b.w, h: b.h, dx: b.dx, dy: b.dy, panes: rec.panes });
    }
    baked._windows = out;
    return out;
  }

  function drawWindows(g, cam, W, H, wins, k) {
    if (k < 0.05) return;
    g.save();
    g.globalAlpha = Math.min(1, 0.35 + 0.65 * k);
    for (const f of wins) {
      const x = f.x - cam.x, y = f.y - cam.y;
      if (x + f.w < 0 || y + f.h < 0 || x > W || y > H) continue;
      g.drawImage(f.panes, f.dx, f.dy, f.w, f.h, x, y, f.w, f.h);
    }
    g.restore();
  }

  /** Window lights for the light map (one soft pool in front of each window). */
  function windowLights(wins) {
    return wins.map((f) => ({ x: f.x + f.w / 2, y: f.y + f.h + 6, r: 22 + Math.min(10, f.w), rgb: LIGHT_RGB.window, k: 0.85, lamp: true, glow: 0.16 }));
  }

  return { apply, windows, drawWindows, windowLights, stamp };
}

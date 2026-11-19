// Seeing through the scenery (fix wave 2026-11-19, CRITIQUE_1 items 1, 4, 12, 23):
//   - alpha masks of sprite sheets and of a zone's baked overhead layer (read once, cached), so the renderer can ask
//     "is this pixel opaque" without a per-frame readback
//   - opaqueTop(): the first opaque row of a sprite frame (quest marks sit on the head, not on the frame box)
//   - bodyPoints(): a sparse sample of a frame's opaque pixels (occlusion tests)
//   - outline(): a cached 1-px outline of a frame in one colour (silhouettes through canopy, night rim, target)
//   - circle(): a pixel-hard disc mask (the canopy fade hole)
// All caches are keyed by the image object and the frame rect; nothing here reads pixels more than once.

export function createOcclusion() {
  const alphaCache = new Map();       // img -> { w, h, a: Uint8Array } | null (tainted / not ready)
  const topCache = new Map();         // img -> Map(rectKey -> top row)
  const pointCache = new Map();       // img -> Map(rectKey -> [[x, y], ...])
  const outlineCache = new Map();     // img -> Map(key -> canvas)
  const circles = new Map();

  function alphaOf(img) {
    if (!img) return null;
    if (alphaCache.has(img)) return alphaCache.get(img);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    let rec = null;
    try {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, h).data;
      const a = new Uint8Array(w * h);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 24 ? 1 : 0;
      rec = { w, h, a };
    } catch { rec = null; }
    alphaCache.set(img, rec);
    return rec;
  }

  const keyOf = (sx, sy, w, h) => `${sx},${sy},${w},${h}`;

  /** First opaque row of a frame (0 = the frame's top). Falls back to 0. */
  function opaqueTop(img, sx, sy, w, h) {
    let m = topCache.get(img);
    if (!m) { m = new Map(); topCache.set(img, m); }
    const k = keyOf(sx, sy, w, h);
    if (m.has(k)) return m.get(k);
    const A = alphaOf(img);
    if (!A) return 0;
    let top = 0;
    outer: for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (A.a[(sy + y) * A.w + sx + x]) { top = y; break outer; }
    m.set(k, top);
    return top;
  }

  /** Sparse opaque points of a frame (every `step` px), frame-local, unflipped. */
  function bodyPoints(img, sx, sy, w, h, step = 3) {
    let m = pointCache.get(img);
    if (!m) { m = new Map(); pointCache.set(img, m); }
    const k = keyOf(sx, sy, w, h);
    if (m.has(k)) return m.get(k);
    const A = alphaOf(img);
    const pts = [];
    if (A) for (let y = 1; y < h; y += step) for (let x = 1; x < w; x += step) if (A.a[(sy + y) * A.w + sx + x]) pts.push([x, y]);
    if (A) m.set(k, pts);
    return pts;
  }

  /** A 1-px outline of a frame (w + 2) x (h + 2), drawn at (dx - 1, dy - 1). */
  function outline(img, sx, sy, w, h, color) {
    let m = outlineCache.get(img);
    if (!m) { m = new Map(); outlineCache.set(img, m); }
    const k = `${keyOf(sx, sy, w, h)},${color}`;
    let c = m.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = w + 2; c.height = h + 2;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (const [ox, oy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) g.drawImage(img, sx, sy, w, h, ox, oy, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color; g.fillRect(0, 0, w + 2, h + 2);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(img, sx, sy, w, h, 1, 1, w, h);
    m.set(k, c);
    return c;
  }

  /** A pixel-hard disc of radius r on a (2r+1) square canvas (white). */
  function circle(r) {
    if (circles.has(r)) return circles.get(r);
    const c = document.createElement('canvas');
    c.width = c.height = r * 2 + 1;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    for (let y = -r; y <= r; y++) { const half = Math.floor(Math.sqrt(r * r - y * y)); g.fillRect(r - half, r + y, half * 2 + 1, 1); }
    circles.set(r, c);
    return c;
  }

  /** Alpha mask of a baked overhead canvas at half resolution (one byte per 2 x 2 px). */
  function overheadMask(canvas) {
    if (!canvas) return null;
    if (alphaCache.has(canvas)) return alphaCache.get(canvas);
    let rec = null;
    try {
      const W = canvas.width, H = canvas.height, w = W >> 1, h = H >> 1;
      const a = new Uint8Array(w * h);
      // one readback through a scratch canvas made for it (the baked layer keeps its fast GPU context)
      const band = 256;
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = band;
      const g = tmp.getContext('2d', { willReadFrequently: true });
      for (let y0 = 0; y0 < H; y0 += band) {
        const bh = Math.min(band, H - y0);
        g.clearRect(0, 0, W, band);
        g.drawImage(canvas, 0, y0, W, bh, 0, 0, W, bh);
        const d = g.getImageData(0, 0, W, bh).data;
        for (let y = 0; y < bh; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 24) a[((y0 + y) >> 1) * w + (x >> 1)] = 1;
      }
      rec = { w, h, a, half: true };
    } catch { rec = null; }
    alphaCache.set(canvas, rec);
    return rec;
  }

  /** Is world pixel (x, y) covered by the overhead mask? */
  function overheadAt(mask, x, y) {
    if (!mask) return false;
    const mx = x >> 1, my = y >> 1;
    if (mx < 0 || my < 0 || mx >= mask.w || my >= mask.h) return false;
    return mask.a[my * mask.w + mx] === 1;
  }

  /** Is pixel (px, py) of an image opaque? */
  function opaqueAt(img, px, py) {
    const A = alphaOf(img);
    if (!A || px < 0 || py < 0 || px >= A.w || py >= A.h) return false;
    return A.a[py * A.w + px] === 1;
  }

  return { alphaOf, opaqueTop, bodyPoints, outline, circle, overheadMask, overheadAt, opaqueAt };
}

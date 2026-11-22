// Pixel drawing primitives for the HUD and menus, over Lexicon Quest's own UI art (assets/ui/: window.png nine-slice
// frames + scheme gradients, ui.png gauges and icons, font / font_large / font_num). A port of the approved mockups'
// lqui.py (D:\LQOnline\mockups\lqui.py) so the game matches the stills pixel for pixel. Everything lands on whole HUD
// pixels of the 640x360 layer (CONTRACTS section 10).
//
//   const g = createGfx(art)        art: from loadUiArt() (uiassets.js)
//   g.window(ctx, x, y, w, h, frame, scheme, alpha)   g.gauge(ctx, x, y, w, frac, kind, thin, lag)
//   g.icon(ctx, name, x, y, alpha)   g.text(ctx, s, x, y, color, opts)   g.num(...)   g.sweep(...)   g.scrim(...)

export const INK = '#14101e';

export function hexA(hex, a) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

function lerpHex(a, b, u) {
  const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * u));
}

export function createGfx(art) {
  const { ui, uiImg, win, winImg, font, large, num: fnum, numBig, numImg } = art;
  const makeCanvas = art.makeCanvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const fills = new Map();
  const sweeps = new Map();
  // the Realms icon atlases (assets/icons/: abilities24/16 by ability id, talents16 by talent id, items16 by icon id)
  const atlases = art.icons || {};
  const atlasOrder = (small) => (small ? ['abilities16', 'talents16', 'items16', 'abilities24', 'prof16'] : ['abilities24', 'talents16', 'items16', 'abilities16', 'prof16']);
  function findIcon(name, small = false) {
    const f = ui.frames[name];
    if (f) return { img: uiImg, f, o: (ui.origins && ui.origins[name]) || [0, 0] };
    for (const k of atlasOrder(small)) { const a = atlases[k]; const r = a && a.json.frames[name]; if (r) return { img: a.img, f: r, o: [0, 0] }; }
    return null;
  }

  function fillFor(w, h, scheme, alpha) {
    const key = `${w}x${h}:${scheme}:${alpha}`;
    let c = fills.get(key);
    if (c) return c;
    const col = win.colors[scheme] || win.colors.blue;
    c = makeCanvas(Math.max(1, w), Math.max(1, h));
    const g = c.getContext('2d');
    for (let r = 0; r < h; r++) {
      const t = r / Math.max(1, h - 1);
      const rgb = t <= 0.45 ? lerpHex(col.top, col.mid, t / 0.45) : lerpHex(col.mid, col.bottom, (t - 0.45) / 0.55);
      g.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      g.fillRect(0, r, w, 1);
    }
    if (fills.size > 300) fills.clear();
    fills.set(key, c);
    return c;
  }

  const api = {
    art,
    /** LQ window: gradient fill + nine-slice frame. frame: 'std' | 'thin' | 'field'; scheme: blue crimson ember slate violet forest. */
    window(ctx, x, y, w, h, frame = 'std', scheme = 'blue', alpha = 0.92) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const fr = win.frames[frame];
      const i = fr.fillInset;
      ctx.drawImage(fillFor(w - 2 * i, h - 2 * i, scheme, alpha), x + i, y + i);
      const [rx, ry, rw, rh] = fr.rect, [bl, bt, br, bb] = fr.border;
      const cw = rw - bl - br, ch = rh - bt - bb;
      const piece = (sx, sy, sw, sh, dx, dy, dw, dh) => { if (dw > 0 && dh > 0) ctx.drawImage(winImg, sx, sy, sw, sh, dx, dy, dw, dh); };
      piece(rx, ry, bl, bt, x, y, bl, bt);
      piece(rx + rw - br, ry, br, bt, x + w - br, y, br, bt);
      piece(rx, ry + rh - bb, bl, bb, x, y + h - bb, bl, bb);
      piece(rx + rw - br, ry + rh - bb, br, bb, x + w - br, y + h - bb, br, bb);
      piece(rx + bl, ry, cw, bt, x + bl, y, w - bl - br, bt);
      piece(rx + bl, ry + rh - bb, cw, bb, x + bl, y + h - bb, w - bl - br, bb);
      piece(rx, ry + bt, bl, ch, x, y + bt, bl, h - bt - bb);
      piece(rx + rw - br, ry + bt, br, ch, x + w - br, y + bt, br, h - bt - bb);
    },
    /** Plain dark backing for HUD text over the map (a: 0..255 as in the mockups). */
    scrim(ctx, x, y, w, h, a = 150) {
      ctx.fillStyle = hexA(INK, (a / 255).toFixed(3));
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    },
    rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
    /** 1 px outline rectangle (inclusive like PIL's rectangle(outline)). */
    outline(ctx, x0, y0, x1, y1, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, x1 - x0 + 1, 1); ctx.fillRect(x0, y1, x1 - x0 + 1, 1);
      ctx.fillRect(x0, y0, 1, y1 - y0 + 1); ctx.fillRect(x1, y0, 1, y1 - y0 + 1);
    },
    /** Pixel-hard line (Bresenham), width 1 or 3 (3 = a plus-shaped brush, like the mockup's shadowed connectors). */
    line(ctx, x0, y0, x1, y1, color, width = 1) {
      ctx.fillStyle = color;
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        if (width >= 3) ctx.fillRect(x0 - 1, y0 - 1, 3, 3); else ctx.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
    frame(name) { const r = findIcon(name); return r ? r.f : null; },
    iconSize(name) { const r = findIcon(name); return r ? [r.f[2], r.f[3]] : [0, 0]; },
    /** A ui.png frame at (x, y) minus its origin. */
    icon(ctx, name, x, y, alpha = 1) {
      const r = findIcon(name, true);
      if (!r) return;
      const { f, o } = r;
      const pa = ctx.globalAlpha;
      if (alpha !== 1) ctx.globalAlpha = pa * alpha;
      ctx.drawImage(r.img, f[0], f[1], f[2], f[3], Math.round(x - o[0]), Math.round(y - o[1]), f[2], f[3]);
      ctx.globalAlpha = pa;
    },
    /** Icon centred in a box (ignores the frame origin). */
    iconIn(ctx, name, x, y, w, h, alpha = 1) {
      const r = findIcon(name, Math.min(w, h) < 24);
      if (!r) return;
      const f = r.f;
      const pa = ctx.globalAlpha;
      if (alpha !== 1) ctx.globalAlpha = pa * alpha;
      ctx.drawImage(r.img, f[0], f[1], f[2], f[3], Math.round(x + (w - f[2]) / 2), Math.round(y + (h - f[3]) / 2), f[2], f[3]);
      ctx.globalAlpha = pa;
    },
    /** LQ gauge: 3-slice frame + stretched fill. kind: hp (auto mid/low colours) | mp | exp | atb | fury. */
    gauge(ctx, x, y, w, frac, kind = 'hp', thin = false, lag = null) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w);
      const suf = thin ? '_thin' : '';
      const fname = 'gauge_frame' + suf;
      const [fx, fy, fw, fh] = ui.frames[fname];
      const sl = ui.slices[fname];
      const l = sl.border[0], r = sl.border[2];
      ctx.drawImage(uiImg, fx, fy, l, fh, x, y, l, fh);
      ctx.drawImage(uiImg, fx + l, fy, fw - l - r, fh, x + l, y, w - l - r, fh);
      ctx.drawImage(uiImg, fx + fw - r, fy, r, fh, x + w - r, y, r, fh);
      const [ix, iy] = sl.fillInset, fillH = sl.fillHeight;
      if (kind === 'hp') kind = frac > 0.5 ? 'hp' : frac > 0.25 ? 'hp_mid' : 'hp_low';
      const inner = w - 2 * ix;
      const seg = (name, f) => {
        const s = ui.frames[name + suf] || ui.frames[name];
        const fw2 = Math.round(inner * Math.max(0, Math.min(1, f)));
        if (fw2 > 0 && s) ctx.drawImage(uiImg, s[0], s[1], s[2], fillH, x + ix, y + iy, fw2, fillH);
      };
      if (lag != null) seg('gauge_lag', lag);
      seg('gauge_' + kind, frac);
      return fh;
    },
    gaugeHeight(thin) { return ui.frames[thin ? 'gauge_frame_thin' : 'gauge_frame'][3]; },

    // ---------------------------------------------------------------- text
    font, large,
    textW(s, isLarge = false) { return (isLarge ? large : font).measure(s); },
    /** y = line top. Returns the width. opts: { large, align, shadow, alpha }. */
    text(ctx, s, x, y, color = 'white', opts = {}) {
      const f = opts.large ? large : font;
      return f.draw(ctx, s, x, y, { color, align: opts.align || 'left', shadow: opts.shadow, alpha: opts.alpha }).width;
    },
    wrap(s, width, isLarge = false) { return (isLarge ? large : font).wrap(s, width); },
    /** Fit a string into `width` px, ending with '..' when cut. */
    clip(s, width, isLarge = false) {
      const f = isLarge ? large : font;
      if (f.measure(s) <= width) return s;
      let t = s;
      while (t.length > 1 && f.measure(t + '..') > width) t = t.slice(0, -1);
      return t.trimEnd() + '..';
    },
    /** Battle-number font (pre-coloured variants: white crit heal mp poison red gray). */
    num(ctx, s, x, y, variant = 'white', big = false, align = 'center') {
      const f = big ? numBig : fnum;
      const off = f.variants[variant] ?? 0;
      let w = 1;
      for (const ch of s) { const g = f.glyphs[ch]; if (g) w += g[6]; }
      if (align === 'center') x -= Math.floor(w / 2); else if (align === 'right') x -= w;
      let cx = Math.round(x);
      for (const ch of s) {
        const g = f.glyphs[ch];
        if (!g) { cx += f.spaceAdvance || 4; continue; }
        ctx.drawImage(numImg, g[0], g[1] + off, g[2], g[3], cx + g[4], Math.round(y) + g[5], g[2], g[3]);
        cx += g[6];
      }
      return w;
    },

    /** Dark clock wipe over a w x h slot: `frac` of the circle still cooling, from 12 o'clock clockwise. Pixel-hard. */
    sweep(ctx, x, y, w, h, frac, alpha = 215) {
      const q = Math.max(0, Math.min(60, Math.round(frac * 60)));
      if (q <= 0) return;
      const key = `${w}x${h}:${q}:${alpha}`;
      let c = sweeps.get(key);
      if (!c) {
        c = makeCanvas(w, h);
        const g = c.getContext('2d');
        g.fillStyle = `rgba(12,10,20,${(alpha / 255).toFixed(3)})`;
        const cx = (w - 1) / 2, cy = (h - 1) / 2, f = q / 60;
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
          // angle from 12 o'clock, clockwise, 0..1; the still-cooling part is the LAST `f` of the turn
          let a = Math.atan2(px - cx, -(py - cy)) / (2 * Math.PI);
          if (a < 0) a += 1;
          if (a >= 1 - f) g.fillRect(px, py, 1, 1);
        }
        if (sweeps.size > 400) sweeps.clear();
        sweeps.set(key, c);
      }
      ctx.drawImage(c, Math.round(x), Math.round(y));
    },

    // ---------------------------------------------------------------- heads and portraits
    /** A 12 px head: the npc atlas by npc id first (assets/portraits/npc_heads.json), then LQ's heads by sprite key. */
    head(ctx, who, x, y) {
      const nh = art.npcArt && art.npcArt.heads;
      const nk = nh && who && ((nh.json.npcs || {})[who] || (nh.json.frames[`head_${who}`] ? `head_${who}` : null));
      if (nk && nh.json.frames[nk]) { const r = nh.json.frames[nk]; ctx.drawImage(nh.img, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]); return true; }
      const f = art.heads.frames[`head_${who}`];
      if (!f) return false;
      ctx.drawImage(art.headsImg, f[0], f[1], f[2], f[3], Math.round(x), Math.round(y), f[2], f[3]);
      return true;
    },
    /** A portrait: the npc atlas by npc id first (assets/portraits/npc_portraits.json, 32 px), then LQ's portraits. */
    portrait(ctx, who, x, y, size = 32) {
      const np = art.npcArt && art.npcArt.portraits;
      const nk = np && who && size === 32 && ((np.json.npcs || {})[who] || (np.json.frames[`${who}_32`] ? `${who}_32` : null));
      if (nk && np.json.frames[nk]) { const r = np.json.frames[nk]; ctx.drawImage(np.img, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]); return true; }
      const f = art.portraits.frames[`${who}_${size}`];
      if (!f) return false;
      ctx.drawImage(art.portraitsImg, f[0], f[1], f[2], f[3], Math.round(x), Math.round(y), f[2], f[3]);
      return true;
    },
  };
  return api;
}

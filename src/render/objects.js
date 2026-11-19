// Placed objects (CONTRACTS 3 `kind: 'object'`): traps, ground zones, hedges, ink trails and doubles, quest nodes.
// Drawn by the snapshot's `sprite` and `radius`; every key has a procedural pixel look (cached canvases, whole
// pixels), unknown keys get a neutral one. Ground zones go under the actors; the rest is y-sorted with them.
//
//   const O = createObjectArt({ tiles, propsDb, img, book, silhouette })
//   O.isGround(e)                            true for a ground zone (drawn before the y-sorted pass)
//   O.drawGround(g, e, x, y, cam, now)       a zone disc of e.radius px (a true circle: the sim measures plain px)
//   O.items(e, x, y, now, owner)             y-sorted draw items [{ sortY, draw(g, cam), pick? }]
//   objectLook(sprite)                       which look a key gets (pure, tested)
import { BAYER4 } from './lighting.js';

export const GROUND_LOOKS = {
  zone_letters: { color: '#a77bff', fill: '#3a2878', density: 0.22, deco: 'letters' },      // Scribe Scatter Letters (ink)
  zone_semicolon: { color: '#8fc8ff', fill: '#203a78', density: 0.2, deco: 'semicolon' },    // Scribe Semicolon (pause)
  zone_peal: { color: '#fff1a8', fill: '#c89a3a', density: 0.14, deco: 'peal' },             // Mender Sanctuary Peal (light)
  zone_bramble: { color: '#8fd060', fill: '#2f5a24', density: 0.3, deco: 'thorns' },         // Wayfinder Bramble Patch (nature)
  zone_ink: { color: '#4a3490', fill: '#140c2a', density: 0.55, deco: null },                // Inkblade ink trail
};
const SPRITE_LOOKS = { trap_briar: 'trap', trap_snare: 'trap', hedge: 'hedge', ink_double: 'double', node: 'node' };

/** 'ground' | 'trap' | 'hedge' | 'double' | 'node' | 'unknown' for a sprite key (pure). */
export function objectLook(sprite, radius = 0) {
  if (GROUND_LOOKS[sprite]) return 'ground';
  if (SPRITE_LOOKS[sprite]) return SPRITE_LOOKS[sprite];
  if (/^zone_/.test(sprite || '')) return 'ground';
  return radius > 0 ? 'ground' : 'unknown';
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}
const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };

export function createObjectArt({ tiles, propsDb, img, book, silhouette }) {
  const cache = new Map();
  const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

  // a dithered disc with a 1 px rim, radius r (true circle), two dither phases for a slow shimmer
  function disc(look, r, phase) {
    return once(`disc|${look.color}|${look.fill}|${r}|${phase}`, () => {
      const d = 2 * r + 1;
      const [c, g] = canvas(d, d);
      for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
        const dist = Math.hypot(x - r, y - r);
        if (dist > r + 0.5) continue;
        if (dist > r - 0.5) { px(g, x, y, look.color); continue; }
        const th = (BAYER4[(((y + phase) & 3) << 2) | ((x + phase * 2) & 3)] + 0.5) / 16;
        const k = look.density * (0.55 + 0.45 * (dist / r));
        if (th < k) px(g, x, y, look.fill);
        if (look.deco === 'thorns' && ((x * 7 + y * 13) % 23 === 0) && dist < r - 2) { px(g, x, y, look.color); if (y > 0) px(g, x, y - 1, '#d8f0a0'); }
      }
      return c;
    });
  }
  function ringPixels(g, cx, cy, r, color, alpha) {
    g.globalAlpha = alpha; g.fillStyle = color;
    const n = Math.max(16, Math.round(r * 6));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1); }
    g.globalAlpha = 1;
  }
  const GLYPHS = ['010111010', '111101111', '110010011', '101010101', '011100011'];
  function glyph(g, x, y, bits, color) { g.fillStyle = color; for (let i = 0; i < 9; i++) if (bits[i] === '1') g.fillRect(x + (i % 3), y + ((i / 3) | 0), 1, 1); }

  function drawGround(g, e, x, y, cam, now) {
    const look = GROUND_LOOKS[e.sprite] || { color: '#d8d0c0', fill: '#6a6458', density: 0.12, deco: null };
    const r = Math.max(4, Math.min(160, Math.round(e.radius || 12)));
    const phase = Math.floor(now * 2 + (e.id % 4)) % 2;
    const sx = Math.round(x - cam.x), sy = Math.round(y - cam.y);
    g.globalAlpha = 0.75;
    g.drawImage(disc(look, r, phase), sx - r, sy - r);
    g.globalAlpha = 1;
    if (look.deco === 'letters') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + (e.id % 5) + now * 0.4;
        const rr = r * (0.3 + 0.12 * (i % 4));
        const bob = Math.round(Math.sin(now * 3 + i) * 2);
        glyph(g, Math.round(sx + Math.cos(a) * rr) - 1, Math.round(sy + Math.sin(a) * rr) - 6 + bob, GLYPHS[i % GLYPHS.length], i % 2 ? '#e0d0ff' : look.color);
      }
    } else if (look.deco === 'semicolon') {
      const p = Math.floor(now * 3) % 2;
      g.fillStyle = look.color; g.fillRect(sx - 1, sy - 9 - p, 2, 2); g.fillRect(sx - 1, sy - 5 - p, 2, 2); g.fillRect(sx - 2, sy - 3 - p, 1, 2);
    } else if (look.deco === 'peal') {
      const k = (now * 0.8 + (e.id % 3) * 0.33) % 1;
      ringPixels(g, sx, sy, Math.max(2, Math.round(r * k)), '#fff7d6', 0.8 * (1 - k));
    }
  }

  // ---- small y-sorted sprites (procedural, cached)
  const trapArt = (armed) => once(`trap|${armed}`, () => {
    const [c, g] = canvas(15, 9);
    const rim = armed ? '#7a5a2a' : '#5a4a30', thorn = armed ? '#a8d070' : '#6a7a50', dark = '#2a1c10';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const x = Math.round(7 + Math.cos(a) * 6), y = Math.round(5 + Math.sin(a) * 3);
      px(g, x, y + 1, dark); px(g, x, y, rim);
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; px(g, Math.round(7 + Math.cos(a) * 7), Math.round(4 + Math.sin(a) * 4), thorn); }
    px(g, 7, 5, armed ? '#e8c070' : '#6a5a40');
    return c;
  });
  const bushArt = (v) => once(`bush|${v}`, () => {
    const [c, g] = canvas(11, 10);
    const dark = '#1e3a1a', mid = v ? '#3f6e2a' : '#356024', hi = '#7ab048', out = '#0e1a0c';
    for (let y = 0; y < 10; y++) for (let x = 0; x < 11; x++) {
      const d = Math.hypot((x - 5) / 5.2, (y - 5.5) / 4.6);
      if (d > 1) continue;
      px(g, x, y, d > 0.82 ? out : d > 0.6 ? dark : mid);
      if (d < 0.5 && (x + y * 2 + v) % 5 === 0) px(g, x, y - 1 < 0 ? 0 : y - 1, hi);
    }
    px(g, 3 + v, 2, '#d8f0a0');
    return c;
  });
  const nodeArt = () => once('node', () => {
    const [c, g] = canvas(10, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) {
      const d = Math.hypot((x - 4.5) / 4.8, (y - 4.5) / 3.6);
      if (d > 1) continue;
      px(g, x, y, d > 0.8 ? '#3a2a1e' : y < 3 ? '#e8d4a0' : '#c8a870');
    }
    px(g, 4, 1, '#3a2a1e'); px(g, 5, 1, '#3a2a1e');
    return c;
  });
  const glint = (g, x, y, now, seed) => {
    const k = (now * 0.7 + (seed % 7) * 0.13) % 1;
    if (k > 0.35) { px(g, x, y, '#f9d77a'); return; }
    const s = k < 0.12 || k > 0.24 ? 1 : 2;
    g.fillStyle = '#fff1a8'; g.fillRect(x, y - s, 1, s * 2 + 1); g.fillRect(x - s, y, s * 2 + 1, 1);
    px(g, x, y, '#ffffff');
  };

  function propFrame(key) {
    const p = propsDb[key];
    if (p && p.frame) return { im: img('props'), r: p.frame, a: p.anchor || [p.frame[2] >> 1, p.frame[3] - 2] };
    const o = tiles && tiles.objects && tiles.objects[key];
    if (o && o.rect && o.sheet) {
      let im = null;
      try { im = img(String(o.sheet).replace(/\.[^.]+$/, '')); } catch { im = null; }
      if (im) return { im, r: o.rect, a: [o.rect[2] >> 1, o.rect[3] - 2] };
    }
    return null;
  }

  function items(e, x, y, now, t, owner) {
    const out = [];
    const ix = Math.round(x), iy = Math.round(y);
    const look = objectLook(e.sprite, e.radius);
    if (e.node) {
      // quest node: its own sprite (an animal, a prop) or a bundle, plus a gold glint so it reads as usable
      const f = book.frameFor({ ...e, moving: false }, t);
      const pf = f ? null : propFrame(e.sprite);
      let w = 10, h = 8, top = iy - 10;
      out.push({ sortY: iy, draw(g, cam) {
        if (f) { blitF(g, f, ix - f.ox - cam.x, iy - f.oy - cam.y); }
        else if (pf) g.drawImage(pf.im, pf.r[0], pf.r[1], pf.r[2], pf.r[3], ix - pf.a[0] - cam.x, iy - pf.a[1] - cam.y, pf.r[2], pf.r[3]);
        else g.drawImage(nodeArt(), ix - 5 - cam.x, iy - 8 - cam.y);
        glint(g, ix + 4 - cam.x, top - cam.y, now, e.id);
      } });
      if (f) { w = f.w; h = f.h; top = iy - f.oy + 4; out[0].pick = { x: ix - f.ox, y: iy - f.oy, w, h }; }
      else if (pf) { w = pf.r[2]; h = pf.r[3]; top = iy - pf.a[1] - 2; out[0].pick = { x: ix - pf.a[0], y: iy - pf.a[1], w, h }; }
      else out[0].pick = { x: ix - 8, y: iy - 14, w: 16, h: 16 };
      return out;
    }
    if (look === 'trap') {
      const armed = !!e.armed;
      out.push({ sortY: iy - 4, draw(g, cam) {
        if (armed && e.radius) ringPixels(g, ix - cam.x, iy - cam.y, e.radius, '#a8d070', 0.25);
        g.globalAlpha = armed ? 1 : 0.55;
        g.drawImage(trapArt(armed), ix - 7 - cam.x, iy - 5 - cam.y);
        g.globalAlpha = 1;
        if (armed && Math.floor(now * 2 + e.id) % 4 === 0) px(g, ix + 3 - cam.x, iy - 3 - cam.y, '#fff7d6');
      } });
      return out;
    }
    if (look === 'hedge') {
      const r = Math.max(8, Math.round(e.radius || 24));
      const n = Math.max(8, Math.round((2 * Math.PI * r) / 8));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const bx = Math.round(ix + Math.cos(a) * r), by = Math.round(iy + Math.sin(a) * r);
        const art = bushArt(i % 2);
        out.push({ sortY: by, draw(g, cam) { g.drawImage(art, bx - 5 - cam.x, by - 9 - cam.y); } });
      }
      return out;
    }
    if (look === 'double') {
      // the Inkblade's ink double: the owner's pose as an ink silhouette, flickering
      const f = owner ? book.frameFor({ ...owner, moving: false, cast: null, dead: false }, t) : null;
      out.push({ sortY: iy, draw(g, cam) {
        if (!f) { g.drawImage(disc(GROUND_LOOKS.zone_ink, 5, 0), ix - 5 - cam.x, iy - 5 - cam.y); return; }
        const sil = silhouette(f.img, f.sx, f.sy, f.w, f.h, '#2a1c58');
        g.globalAlpha = Math.floor(now * 10) % 3 === 0 ? 0.5 : 0.7;
        blitF(g, { ...f, img: sil, sx: 0, sy: 0 }, ix - f.ox - cam.x, iy - f.oy - cam.y);
        g.globalAlpha = 1;
      } });
      return out;
    }
    // unknown, no radius: a small neutral marker
    out.push({ sortY: iy, draw(g, cam) { const sx = ix - cam.x, sy = iy - cam.y; g.fillStyle = '#d8d0c0'; g.fillRect(sx - 1, sy - 3, 3, 1); g.fillRect(sx, sy - 4, 1, 3); px(g, sx, sy - 3, '#ffffff'); } });
    return out;
  }

  function blitF(g, f, dx, dy) {
    if (f.flip) { g.save(); g.scale(-1, 1); g.drawImage(f.img, f.sx, f.sy, f.w, f.h, -(dx + f.w), dy, f.w, f.h); g.restore(); }
    else g.drawImage(f.img, f.sx, f.sy, f.w, f.h, dx, dy, f.w, f.h);
  }

  return {
    isGround: (e) => e.kind === 'object' && !e.node && objectLook(e.sprite, e.radius) === 'ground',
    drawGround, items,
  };
}

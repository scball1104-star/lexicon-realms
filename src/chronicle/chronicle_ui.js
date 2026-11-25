// Party chronicle on screen (wave 9 chronicle lane): the night's page, the "Kept" toast, the list of past nights and the
// picture friends get. Drawn with the game's g.* calls on the HUD layer (the skin and Text size apply); the stills are
// drawn by a second pass at device resolution (`hires`) into the boxes the HUD pass laid out, so a photo is never blown
// up from the 640x360 HUD layer.
//
//   const U = createChronicleUI({ g, act })      act: { save, copy, close, watch(ch), prev, next, stills, earlier, open(i), back }
//   U.page = { story, sel, reader, stillsOff, last }      the night's page (reader: a friend's link; last: "Last time")
//   U.list = { rows, sel }                                  the past nights (Options: Chronicle)
//   U.toast = { still, t0 }                                 "Kept for the chronicle" with the still, 2.6 s
//   U.draw(ctx, L, ui, tSec) -> drawn?   U.regions (buttons, HUD px)   U.hires(ctx2d, layout)   U.compose(story) -> canvas
import { WORDS, dateText } from './journal.js';

const imgCache = new Map();
function imgOf(src) {
  if (!src) return null;
  if (typeof src !== 'string') return src;        // a canvas already
  let im = imgCache.get(src);
  if (!im) {
    if (typeof Image === 'undefined') return null;
    if (imgCache.size > 40) imgCache.clear();
    im = new Image(); im.src = src; imgCache.set(src, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
/** Wait until the stills have decoded (the picture is made from them). */
export async function preload(list) {
  await Promise.all(list.filter((s) => typeof s === 'string').map((s) => new Promise((res) => {
    imgOf(s); const im = imgCache.get(s);
    if (!im || (im.complete && im.naturalWidth)) return res();
    im.onload = im.onerror = () => res();
  })));
}

export function createChronicleUI({ g, act = {} }) {
  const U = { page: null, list: null, toast: null, pics: [], regions: [] };
  const call = (k, ...a) => () => { if (act[k]) act[k](...a); };
  const lines = (s, w) => { const r = g.wrap(s, w); return Array.isArray(r) ? r : String(r).split('\n'); };

  function button(ctx, x, y, w, h, label, on, scheme = 'slate') {
    g.window(ctx, x, y, w, h, 'thin', scheme, 0.95);
    g.text(ctx, label, Math.round(x + w / 2), Math.round(y + (h - g.lh) / 2 + 2), 'cream', { align: 'center' });
    U.regions.push({ rect: { x, y, w, h }, on, label });
  }

  function drawPage(ctx, L, touch, minHit) {
    const P = U.page, S = P.story;
    const W = L.hudW, H = L.hudH;
    const m = touch ? 6 : 14, w0 = W - 2 * m, x0 = m;
    const lh = g.lh, capMaxLines = touch ? 3 : 4;
    // the chapters: as many cards across as fit (4 on a desktop, 2 on a phone), arrows past that
    const per = touch ? 2 : Math.max(2, Math.min(S.chapters.length, Math.floor((w0 - 16) / 146), 4));   // a short night: bigger cards
    const gap = 8, cw = Math.floor((w0 - 16 - gap * (per - 1)) / per);
    const pages = Math.max(1, Math.ceil(S.chapters.length / per));
    P.sel = Math.max(0, Math.min(pages - 1, P.sel || 0));
    const first = P.sel * per;
    const shown = S.chapters.slice(first, first + per);
    const caps = shown.map((c) => { const ls = lines(c.text, cw); return ls.length > capMaxLines ? [...ls.slice(0, capMaxLines - 1), `${ls[capMaxLines - 1]}...`] : ls; });
    const hasWatch = shown.some((c) => c.replay && !P.reader);
    const capH = Math.max(1, ...caps.map((c) => c.length)) * lh + (hasWatch ? 20 : 0);
    const openL = touch ? [g.clip(S.open, w0 - 20)] : lines(S.open, w0 - 30);
    const alsoL = (touch ? S.also.slice(0, 1) : S.also.slice(0, 4)).flatMap((a) => lines(a, w0 - 24));
    const lastPage = P.sel === pages - 1;
    const closeL = touch && !lastPage ? [] : [S.close];
    const bh = touch ? Math.max(18, Math.min(24, minHit)) : g.ls(16);
    const head = 7 + 15 + lh + 2 + openL.length * lh + 3;
    const tail = (alsoL.length && (!touch || lastPage) ? (alsoL.length + 1) * lh : 0) + closeL.length * lh + 6 + bh + 6;
    const ph = shown.length ? Math.max(40, Math.min(Math.round(cw * 9 / 16), H - 2 * m - head - capH - 4 - tail)) : 0;
    const h0 = Math.min(H - 2 * m, head + ph + 4 + capH + tail);
    const y0 = Math.round((H - h0) / 2);
    g.rect(ctx, 0, 0, W, H, 'rgba(10,8,18,0.5)');
    g.window(ctx, x0, y0, w0, h0, 'std', 'ember', 0.97);
    let y = y0 + 7;
    g.text(ctx, S.title, Math.round(W / 2), y, 'gold', { align: 'center', large: true });
    if (P.last) g.text(ctx, WORDS.lastTime, x0 + 10, y0 + 8, 'gray');
    y += 15;
    g.text(ctx, g.clip(P.reader ? S.reader : S.sub, w0 - 20), Math.round(W / 2), y, 'gray', { align: 'center' });
    y += lh + 2;
    for (const ln of openL) { g.text(ctx, ln, Math.round(W / 2), y, 'cream', { align: 'center' }); y += lh; }
    y += 3;
    U.pics = [];
    const lead = Math.floor((w0 - 16 - (shown.length * (cw + gap) - gap)) / 2);   // fewer cards than fit: centred
    shown.forEach((c, i) => {
      const cx = x0 + 8 + lead + i * (cw + gap);
      g.rect(ctx, cx - 1, y - 1, cw + 2, ph + 2, '#14101e');
      g.rect(ctx, cx, y, cw, ph, '#2a2238');
      if (c.shot) U.pics.push({ x: cx, y, w: cw, h: ph, src: c.shot });
      else {
        g.text(ctx, g.clip(c.place || '', cw - 8), Math.round(cx + cw / 2), Math.round(y + ph / 2 - lh / 2 - 4), 'gold', { align: 'center' });
        if (!P.reader) lines(WORDS.noStill, cw - 12).slice(0, 2).forEach((ln, k) => g.text(ctx, ln, Math.round(cx + cw / 2), Math.round(y + ph / 2 + 4 + k * lh), 'gray', { align: 'center' }));
      }
      let cy = y + ph + 4;
      for (const ln of caps[i]) { g.text(ctx, ln, cx, cy, 'cream'); cy += lh; }
      if (c.replay && !P.reader) button(ctx, cx, cy + 3, Math.min(cw, g.textW(WORDS.watch) + 16), Math.max(15, touch ? Math.min(22, minHit) : 15), WORDS.watch, call('watch', c), 'violet');
    });
    if (pages > 1) {   // paging arrows, top right
      const aw = touch ? Math.max(22, minHit) : 18, ah = touch ? Math.max(16, Math.min(22, minHit)) : 14;
      g.text(ctx, `${P.sel + 1} / ${pages}`, x0 + w0 - 2 * aw - 14, y0 + 8, 'gray', { align: 'right' });
      if (P.sel > 0) button(ctx, x0 + w0 - 2 * aw - 10, y0 + 5, aw, ah, '<', call('prev'));
      if (!lastPage) button(ctx, x0 + w0 - aw - 6, y0 + 5, aw, ah, '>', call('next'));
    }
    y += ph + 4 + capH + 3;
    if (alsoL.length && (!touch || lastPage)) {
      g.text(ctx, `${WORDS.also}:`, x0 + 10, y, 'gold'); y += lh;
      for (const ln of alsoL) { g.text(ctx, ln, x0 + 14, y, 'cream'); y += lh; }
    }
    for (const ln of closeL) { g.text(ctx, g.clip(ln, w0 - 20), x0 + 10, y + 1, 'gray'); y += lh; }
    // the buttons, along the bottom
    const by = y0 + h0 - bh - 6;
    const labels = P.reader ? [[WORDS.close, 'close']]
      : [[touch ? WORDS.share : WORDS.savePicture, 'save'], [WORDS.copyLink, 'copy'], [WORDS.earlier, 'earlier'], [WORDS.close, 'close']];
    let bx = x0 + w0 - 8;
    for (const [lab, k] of labels.slice().reverse()) {
      const bw = g.textW(lab) + (touch ? 16 : 18);
      bx -= bw;
      button(ctx, bx, by, bw, bh, lab, call(k), k === 'close' || k === 'earlier' ? 'slate' : 'forest');
      bx -= touch ? 4 : 6;
    }
    if (!P.reader) {
      const lab = P.stillsOff ? WORDS.stillsOff : WORDS.stillsOn, sw = g.textW(lab) + 12;
      if (x0 + 8 + sw < bx) button(ctx, x0 + 8, by, sw, bh, lab, call('stills'), P.stillsOff ? 'crimson' : 'slate');
    }
    return true;
  }

  function drawList(ctx, L, touch, minHit) {
    const V = U.list, W = L.hudW, H = L.hudH;
    const ww = Math.min(W - 12, touch ? W - 12 : 420), wh = Math.min(H - 12, touch ? H - 12 : 260);
    const x = Math.floor((W - ww) / 2), y = Math.floor((H - wh) / 2);
    const bh = touch ? Math.max(18, Math.min(24, minHit)) : g.ls(15);
    g.rect(ctx, 0, 0, W, H, 'rgba(10,8,18,0.45)');
    g.window(ctx, x, y, ww, wh, 'std', 'ember', 0.97);
    g.text(ctx, WORDS.listTitle, x + 12, y + 7, 'gold', { large: true });
    button(ctx, x + ww - 10 - (g.textW(WORDS.close) + 16), y + 5, g.textW(WORDS.close) + 16, bh, WORDS.close, call('close'));
    const rowH = touch ? Math.max(18, Math.min(24, minHit)) : g.ls(15);
    const top = y + 12 + bh, bottom = y + wh - g.ls(16) - 4;
    const fit = Math.max(1, Math.floor((bottom - top) / rowH));
    if (!V.rows.length) for (const [i, ln] of lines(WORDS.listNone, ww - 24).entries()) g.text(ctx, ln, x + 12, top + 4 + i * g.lh, 'gray');
    V.rows.slice(0, fit).forEach((r, i) => {
      const ry = top + i * rowH;
      const names = Object.values(r.heroes || {}).map((h) => h.name).join(', ');
      g.rect(ctx, x + 6, ry, ww - 12, rowH - 2, 'rgba(20,16,30,0.35)');
      g.text(ctx, dateText(r.startMs), x + 12, ry + Math.round((rowH - g.lh) / 2) + 1, 'gold');
      const cx = x + 12 + g.textW('30 September 2026') + 10;
      g.text(ctx, g.clip(names, Math.max(20, ww - (cx - x) - 96)), cx, ry + Math.round((rowH - g.lh) / 2) + 1, 'cream');
      g.text(ctx, WORDS.chapters(r.chapters), x + ww - 12, ry + Math.round((rowH - g.lh) / 2) + 1, 'gray', { align: 'right' });
      U.regions.push({ rect: { x: x + 6, y: ry, w: ww - 12, h: rowH - 2 }, on: call('open', i), label: `night${i}` });
    });
    g.text(ctx, g.clip(WORDS.listFoot, ww - 24), x + 12, y + wh - g.ls(14), 'dim');
    return true;
  }

  function drawToast(ctx, L, t, touch) {
    const T = U.toast;
    const age = t - T.t0;
    if (age > 2.6 || age < 0) { U.toast = null; return false; }
    const a = Math.min(1, age / 0.25, (2.6 - age) / 0.4);
    return g.smallScope(() => {
      const pw = touch ? 96 : 104, ph = Math.round(pw * 9 / 16);
      const w = pw + 8, h = ph + 8 + g.lh + 2;
      const x = L.hudW - w - (touch ? 6 : 8), y = Math.round(L.hudH * (touch ? 0.40 : 0.36));
      g.window(ctx, x, y, w, h, 'thin', 'ember', 0.95 * a);
      g.rect(ctx, x + 4, y + 4, pw, ph, '#14101e');
      U.pics = [{ x: x + 4, y: y + 4, w: pw, h: ph, src: T.still, alpha: a }];
      g.text(ctx, WORDS.kept, Math.round(x + w / 2), y + ph + 6, 'gold', { align: 'center', alpha: a });
      return true;
    });
  }

  /** L: the renderer's layout (hudW, hudH); lay: ui.layout() (touch, minHit). */
  function draw(ctx, L, lay, t) {
    U.pics = []; U.regions = [];
    const touch = !!(lay && lay.touch), minHit = (lay && lay.minHit) || 15;
    if (U.page) return g.textScope(() => drawPage(ctx, L, touch, minHit));
    if (U.list) return g.textScope(() => drawList(ctx, L, touch, minHit));
    if (U.toast) return drawToast(ctx, L, t, touch);
    return false;
  }

  function hires(c, layout) {
    for (const p of U.pics) {
      const im = imgOf(p.src);
      if (!im) continue;
      const b = layout.base, x = layout.ox + p.x * b, y = layout.oy + p.y * b, w = p.w * b, h = p.h * b;
      c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      if (p.alpha != null) c.globalAlpha = p.alpha;
      const r = Math.max(w / im.width, h / im.height), sw = w / r, sh = h / r;   // cover: crop the still to the box's shape
      c.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
      c.restore();
    }
  }

  // ---- the picture friends get (one JPEG): drawn small with the game's frames and font and scaled by whole numbers, the
  // stills at full size between. 1080 px wide; the height grows with the chapters.
  function compose(S) {
    return g.smallScope(() => {
      const W = 1080, s = 3, pad = 36, iw = W - 2 * pad, ink = '#2a2030';
      const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
      const block = (ls, large, width, align = 'left') => {
        const lh = large ? 16 : 11, [c, x] = mk(width, ls.length * lh + 4);
        ls.forEach((ln, i) => g.text(x, ln, align === 'center' ? Math.round(width / 2) : 0, 2 + i * lh, ink, { large, align, shadow: false }));
        return c;
      };
      const wrapW = Math.floor(iw / s);
      const parts = [];
      const hw = Math.max(g.textW(S.title, true), g.textW(S.sub)) + 24, hh = 36;
      const [hc, hx] = mk(hw, hh);
      g.window(hx, 0, 0, hw, hh, 'std', 'ember', 0.97);
      g.text(hx, S.title, Math.round(hw / 2), 5, 'gold', { align: 'center', large: true });
      g.text(hx, S.sub, Math.round(hw / 2), 22, 'cream', { align: 'center' });
      parts.push({ k: 'plaque', c: hc, w: hw * s, h: hh * s });
      parts.push({ k: 'text', c: block(lines(S.open, wrapW), false, wrapW, 'center'), gap: 18 });
      for (const ch of S.chapters) {
        if (ch.shot) parts.push({ k: 'photo', src: ch.shot, w: iw, h: Math.round(iw * 9 / 16), gap: 22 });
        parts.push({ k: 'text', c: block(lines(ch.text, wrapW), false, wrapW), gap: 10 });
      }
      if (S.also.length) {
        parts.push({ k: 'text', c: block([`${WORDS.also}:`], true, wrapW), gap: 26 });
        parts.push({ k: 'text', c: block(S.also.flatMap((a) => lines(a, wrapW)), false, wrapW), gap: 4 });
      }
      parts.push({ k: 'text', c: block(lines(S.close, wrapW), false, wrapW, 'center'), gap: 22 });
      let H = pad;
      for (const p of parts) { if (p.k === 'text') { p.w = p.c.width * s; p.h = p.c.height * s; } H += (p.gap || 0) + p.h; }
      H += pad + 40;
      const [out, o] = mk(W, H);
      o.fillStyle = '#efe4c8'; o.fillRect(0, 0, W, H);
      o.fillStyle = '#14101e'; o.fillRect(10, 10, W - 20, 3); o.fillRect(10, H - 13, W - 20, 3); o.fillRect(10, 10, 3, H - 20); o.fillRect(W - 13, 10, 3, H - 20);
      let y = pad;
      for (const p of parts) {
        y += p.gap || 0;
        const x = p.k === 'plaque' ? Math.round((W - p.w) / 2) : pad;
        if (p.k === 'photo') {
          const im = imgOf(p.src);
          o.fillStyle = '#14101e'; o.fillRect(x - 3, y - 3, p.w + 6, p.h + 6);
          if (im) { o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high'; o.drawImage(im, x, y, p.w, p.h); o.imageSmoothingEnabled = false; }
        } else o.drawImage(p.c, 0, 0, p.c.width, p.c.height, x, y, p.w, p.h);
        y += p.h;
      }
      const st = 'Lexicon Realms', sw = g.textW(st) + 12, sh = 16;
      const [sc, sx] = mk(sw, sh);
      g.window(sx, 0, 0, sw, sh, 'thin', 'crimson', 0.94);
      g.text(sx, st, Math.round(sw / 2), 3, 'cream', { align: 'center' });
      o.drawImage(sc, 0, 0, sw, sh, W - pad - sw * 2, H - pad - sh * 2 + 8, sw * 2, sh * 2);
      return out;
    });
  }

  return Object.assign(U, { draw, hires, compose });
}

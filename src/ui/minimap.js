// Minimap and world-map imagery, drawn from zone data (static content, not the sim): one colour per tile from the
// ground legend, solid tiles darkened, trees from the decor list. 3 px per tile on the minimap (about the mockup's
// 1/6 scale of the real map), larger on the world map. Cached per zone and scale. image() is today's look: the Classic
// skin's maps, and the instant stand-in under the Lantern skin's vellum map art (below) until its pieces arrive.
import { zoneFields } from './mapart.js';

const TERRAIN = {
  grass: '#4f8f3a', tallgrass: '#3f7d33', dirt: '#9a7148', plaza: '#a49c8e', sand: '#d6c08a', water: '#3a6fc4',
  shallow: '#5b94d4', ink: '#2a2440', fence_wood: '#7a5532', wall_low: '#8a8478', cliff_top: '#5f8540', cliff_face: '#6b5646',
  cliff_stairs_top: '#9a8a70', cliff_stairs_mid: '#9a8a70', cliff_stairs_bot: '#9a8a70', ledge_s_a: '#4a7a32', ledge_s_m: '#4a7a32', ledge_s_b: '#4a7a32',
};
const SOLID = '#4a3a34', TREE = '#24502a', TREE_HI = '#3a6e34', BRIDGE = '#b0a38a';

/** zones by id. opts.art: false (no vellum), or { worker, bake } for createMapArt (default: the Web Worker). */
export function createMinimapBook(zones, makeCanvas, opts = {}) {
  const cache = new Map();
  const mk = makeCanvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const artOpts = opts.art === false ? null : opts.art || (typeof Worker !== 'undefined' ? { worker: () => new Worker(new URL('./mapart_worker.js', import.meta.url), { type: 'module' }) } : null);
  const art = artOpts ? createMapArt({ zones, makeCanvas: mk, fields: zoneFields, ...artOpts }) : null;
  function image(zoneId, ppt = 3) {
    const key = `${zoneId}:${ppt}`;
    if (cache.has(key)) return cache.get(key);
    const z = zones[zoneId];
    if (!z) return null;
    const c = mk(z.w * ppt, z.h * ppt);
    const g = c.getContext('2d');
    for (let y = 0; y < z.h; y++) {
      const row = z.ground[y] || '', col = z.collision[y] || '';
      for (let x = 0; x < z.w; x++) {
        const t = z.legend[row[x]] || z.under || 'grass';
        let colr = TERRAIN[t] || TERRAIN.grass;
        if (col[x] === '#' && !/cliff|water|fence|wall/.test(t)) colr = SOLID;
        g.fillStyle = colr; g.fillRect(x * ppt, y * ppt, ppt, ppt);
      }
    }
    for (const o of z.overlays || []) if (/bridge/.test(o.t)) { g.fillStyle = BRIDGE; g.fillRect(o.x * ppt, o.y * ppt, ppt, ppt); }
    for (const d of z.decor || []) {
      if (!/tree|willow|pine|oak|bush/.test(d.t)) continue;
      const big = /tree|willow/.test(d.t);
      g.fillStyle = TREE; g.fillRect(d.x * ppt - (big ? ppt : 0), d.y * ppt - (big ? ppt : 0), ppt * (big ? 3 : 1), ppt * (big ? 3 : 1));
      g.fillStyle = TREE_HI; g.fillRect(d.x * ppt, d.y * ppt - (big ? ppt : 0), ppt, ppt);
    }
    cache.set(key, c);
    return c;
  }
  return { image, zone: (id) => zones[id] || null, art };
}

/**
 * Draw markers of a minimap model into a viewport. view: { x, y, w, h } on screen; ppt px per tile; (sx, sy) the
 * source origin in map px (scaled). Returns nothing; clips to the viewport.
 */
export function drawMarkers(g, ctx, markers, view, ppt, sx, sy, t = 0) {
  const toScreen = (m) => [Math.round(view.x + (m.x / 16) * ppt - sx), Math.round(view.y + (m.y / 16) * ppt - sy)];
  const inside = (x, y, pad) => x >= view.x + pad && y >= view.y + pad && x < view.x + view.w - pad && y < view.y + view.h - pad;
  const order = { npc: 0, foe: 1, party: 2, quest: 3, turnin: 3, me: 4 };
  for (const m of [...markers].sort((a, b) => order[a.kind] - order[b.kind])) {
    const [x, y] = toScreen(m);
    if (!inside(x, y, 2)) continue;
    if (m.kind === 'me') {
      // white arrow with an ink rim, pointing the way the player faces
      const d = m.dir || 'up';
      const pts = { up: [[0, -3], [3, 2], [-3, 2]], down: [[0, 3], [3, -2], [-3, -2]], left: [[-3, 0], [2, -3], [2, 3]], right: [[3, 0], [-2, -3], [-2, 3]] }[d];
      tri(ctx, x, y, pts, '#14101e', 1); tri(ctx, x, y, pts, '#f6f4ee', 0);
    } else if (m.kind === 'quest' || m.kind === 'turnin') {
      ctx.fillStyle = '#14101e'; ctx.fillRect(x - 2, y - 4, 5, 8);
      ctx.fillStyle = '#f9d77a';
      if (m.kind === 'quest') { ctx.fillRect(x - 1, y - 3, 3, 4); ctx.fillRect(x - 1, y + 2, 3, 1); }
      else { ctx.fillRect(x - 1, y - 3, 3, 1); ctx.fillRect(x + 1, y - 2, 1, 2); ctx.fillRect(x, y - 0, 1, 1); ctx.fillRect(x, y + 2, 1, 1); }
    } else {
      const col = { party: '#6ab3e4', foe: '#e06b39', npc: '#fff7d6' }[m.kind];
      const r = m.kind === 'npc' ? 1 : 2;
      ctx.fillStyle = '#14101e'; ctx.fillRect(x - r, y - r, r * 2 + 1, r * 2 + 1);
      ctx.fillStyle = col; ctx.fillRect(x - r + 1, y - r + 1, r * 2 - 1, r * 2 - 1);
    }
  }
}

function tri(ctx, x, y, pts, color, grow) {
  // scanline fill of a small triangle, pixel-hard
  const P = pts.map(([px, py]) => [px * (1 + grow * 0.34), py * (1 + grow * 0.34)]);
  const ys = P.map((p) => p[1]);
  ctx.fillStyle = color;
  for (let yy = Math.floor(Math.min(...ys)); yy <= Math.ceil(Math.max(...ys)); yy++) {
    const xs = [];
    for (let i = 0; i < 3; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % 3];
      if ((yy >= Math.min(y0, y1)) && (yy <= Math.max(y0, y1)) && y0 !== y1) xs.push(x0 + ((yy - y0) * (x1 - x0)) / (y1 - y0));
    }
    if (xs.length < 2) continue;
    const a = Math.round(Math.min(...xs)), b = Math.round(Math.max(...xs));
    ctx.fillRect(x + a, y + yy, b - a + 1, 1);
  }
}

// ================================================================== map art (BRIEF.md look A, "illuminated vellum")
// The Lantern skin draws the minimap and the world map at the SCREEN's resolution instead of the 640x360 HUD layer:
// the HUD leaves the map box clear (transparent) and registers it with the map pass; main.js runs the pass on the
// game canvas at device pixels just before the HUD layer is laid over it. So whatever the HUD draws over the map
// afterwards (a tooltip, a window, a card, a dialog) stays on top by construction, and the map never covers them.
// The vellum pieces bake in a Web Worker (mapart_worker.js): 32x32-tile chunks for the minimap (at most 9 kept), one
// image per world map view (at most 2). Until a piece arrives, today's flat image shows in its place. The Classic
// skin, a device with no Worker, or ?mapart=0 keep today's HUD-layer maps exactly.

export const CHUNK = 32;
const INK_C = '#342418', GILT = '#f9d77a', GILT_HI = '#fff1b8', VELLUM_C = '#f4ead0';
const ME_DIR = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
const NODASH = [];

/** The vellum piece cache: chunks for the minimap (LRU, maxChunks), views for the world map (LRU, maxViews). Pieces
 *  bake in a worker (or, in tests, with a synchronous `bake(zi, ppt, tx0, ty0, tw, th)` run inside pump()). */
export function createMapArt({ zones, makeCanvas, worker = null, bake = null, fields = null, maxChunks = 9, maxViews = 2 } = {}) {
  const zoneIdx = new Map(), sent = new Set(), chunks = new Map(), views = [], queue = [], pool = [];
  let frameN = 0, busy = null, nextId = 1, w0 = null;
  const stats = { baked: 0, lastMs: 0, maxMs: 0, sumMs: 0, failed: 0, evicted: 0 };
  const zi = (id) => { let i = zoneIdx.get(id); if (i == null) { i = zoneIdx.size; zoneIdx.set(id, i); } return i; };
  if (worker && !bake) {
    try { w0 = typeof worker === 'function' ? worker() : worker; } catch { w0 = null; }
    if (w0) { w0.onmessage = (ev) => arrive(ev.data); w0.onerror = () => { w0 = null; busy = null; }; }
  }
  const live = () => !!bake || !!w0;
  function sendZone(id) {
    const i = zi(id);
    if (sent.has(i) || !w0) return;
    sent.add(i);
    w0.postMessage({ t: 'zone', zi: i, fields: (fields || ((zz) => zz))(zones[id]) });
  }
  function arrive(msg) {
    const e = busy && busy.id === msg.id ? busy : null;
    busy = null;
    if (!e) { pump(); return; }
    if (msg.t !== 'done') { stats.failed++; e.state = 'failed'; pump(); return; }
    stats.baked++; stats.lastMs = msg.ms || 0; stats.maxMs = Math.max(stats.maxMs, stats.lastMs); stats.sumMs += stats.lastMs;
    let c = null;
    for (let i = 0; i < pool.length; i++) if (pool[i].width === msg.w && pool[i].height === msg.h) { c = pool.splice(i, 1)[0]; break; }
    if (!c && pool.length > 2) c = pool.shift();
    if (!c) c = makeCanvas(msg.w, msg.h);
    if (c.width !== msg.w) c.width = msg.w;
    if (c.height !== msg.h) c.height = msg.h;
    const arr = msg.data || new Uint8ClampedArray(msg.buf);
    const im = typeof ImageData !== 'undefined' ? new ImageData(arr, msg.w, msg.h) : { width: msg.w, height: msg.h, data: arr };
    c.getContext('2d').putImageData(im, 0, 0);
    e.canvas = c; e.state = 'ready';
    evict();
    pump();
  }
  function evict() {
    let ready = 0;
    for (const e of chunks.values()) if (e.state === 'ready') ready++;
    while (ready > maxChunks) {
      let old = null;
      for (const e of chunks.values()) if (e.state === 'ready' && (!old || e.used < old.used)) old = e;
      chunks.delete(old.key); pool.push(old.canvas); old.canvas = null; old.state = 'evicted'; ready--; stats.evicted++;
    }
    let rv = views.reduce((n, v) => n + (v.state === 'ready' ? 1 : 0), 0);
    while (rv > maxViews) {
      let old = null;
      for (const v of views) if (v.state === 'ready' && (!old || v.used < old.used)) old = v;
      views.splice(views.indexOf(old), 1); pool.push(old.canvas); old.canvas = null; old.state = 'evicted'; rv--; stats.evicted++;
    }
    while (pool.length > 4) pool.shift();
  }
  /** Start the next bake: what is on screen first, then the ring around it; requests nobody asked for in 90 frames
   *  are dropped. One bake at a time. */
  function pump() {
    if (busy || !live()) return;
    for (let i = queue.length - 1; i >= 0; i--) {
      const e = queue[i];
      if (frameN - e.want > 90) {
        queue.splice(i, 1); e.state = 'dropped';
        if (e.kind === 'chunk') chunks.delete(e.key); else views.splice(views.indexOf(e), 1);
      }
    }
    if (!queue.length) return;
    let bi = 0;
    for (let i = 1; i < queue.length; i++) {
      const a = queue[i], q = queue[bi];
      if (a.pri > q.pri || (a.pri === q.pri && a.want > q.want)) bi = i;
    }
    const e = queue.splice(bi, 1)[0];
    e.state = 'busy'; e.id = nextId++; busy = e;
    if (bake) {
      const img = bake(e.zi, e.ppt, e.tx0, e.ty0, e.tw, e.th);
      arrive({ t: 'done', id: e.id, w: img.w, h: img.h, data: img.data, ms: 0 });
    } else w0.postMessage({ t: 'bake', id: e.id, zi: e.zi, ppt: e.ppt, tx0: e.tx0, ty0: e.ty0, tw: e.tw, th: e.th });
  }
  const touch = (e, pri) => {
    e.want = frameN;
    if (e.state === 'queued') { if (pri > e.pri) e.pri = pri; }
    else if (e.state === 'ready') e.used = frameN;
    return e.state === 'ready' ? e.canvas : null;
  };
  return {
    get available() { return live(); },
    get frame() { return frameN; },
    /** Once a frame (the pass): ages the requests and starts the next bake. */
    tick() { frameN++; pump(); },
    /** The ready canvas of minimap chunk (cx, cy) at ppt device px a tile, or null (then it is asked for; pri 1 = on
     *  screen, 0 = the ring around it). */
    chunk(zoneId, ppt, cx, cy, pri = 1) {
      const z = zones[zoneId];
      if (!z || !live()) return null;
      const i = zi(zoneId), key = ((i * 128 + ppt) * 1024 + cx) * 1024 + cy;
      let e = chunks.get(key);
      if (!e) {
        const tx0 = cx * CHUNK, ty0 = cy * CHUNK, tw = Math.min(CHUNK, z.w - tx0), th = Math.min(CHUNK, z.h - ty0);
        if (tw <= 0 || th <= 0) return null;
        sendZone(zoneId);
        e = { kind: 'chunk', key, zi: i, ppt, tx0, ty0, tw, th, state: 'queued', canvas: null, want: frameN, used: frameN, pri, id: 0 };
        chunks.set(key, e); queue.push(e);
      }
      return e.state === 'failed' ? null : touch(e, pri);
    },
    /** The ready canvas of one world map view (tiles [tx0, tx0+tw) x [ty0, ty0+th) at ppt device px), or null. */
    view(zoneId, ppt, tx0, ty0, tw, th) {
      const z = zones[zoneId];
      if (!z || !live()) return null;
      const i = zi(zoneId);
      let e = null;
      for (const v of views) if (v.zi === i && v.ppt === ppt && v.tx0 === tx0 && v.ty0 === ty0 && v.tw === tw && v.th === th) { e = v; break; }
      if (!e) {
        sendZone(zoneId);
        e = { kind: 'view', zi: i, ppt, tx0, ty0, tw, th, state: 'queued', canvas: null, want: frameN, used: frameN, pri: 2, id: 0 };
        views.push(e); queue.push(e);
      }
      return e.state === 'failed' ? null : touch(e, 2);
    },
    pump,
    stats() {
      let ready = 0;
      for (const e of chunks.values()) if (e.state === 'ready') ready++;
      return { chunks: ready, views: views.filter((v) => v.state === 'ready').length, queued: queue.length, busy: !!busy, ...stats, avgMs: stats.baked ? stats.sumMs / stats.baked : 0 };
    },
  };
}

// ------------------------------------------------------------------ the serif lettering (world map place names only)
// "LR Map Serif": a renamed Latin subset of STIX General (SIL OFL 1.1), vendored in assets/fonts (docs/ASSETS.md).
export const SERIF = '"LR Map Serif", Georgia, "Times New Roman", serif';
let fontState = 0;              // 0 not asked, 1 loading, 2 done (or failed: the fallback serif)
let fontVersion = 0;
function ensureFont() {
  if (fontState) return;
  fontState = 1;
  try {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) { fontState = 2; return; }
    const at = (f) => new URL(`../../assets/fonts/${f}`, import.meta.url).href;
    const faces = [new FontFace('LR Map Serif', `url(${at('lr_map_serif.woff')})`, { style: 'normal' }),
      new FontFace('LR Map Serif', `url(${at('lr_map_serif_italic.woff')})`, { style: 'italic' })];
    Promise.all(faces.map((f) => f.load().then((ff) => document.fonts.add(ff)))).catch(() => {}).then(() => { fontState = 2; fontVersion++; widthCache.clear(); });
  } catch { fontState = 2; }
}

const widthCache = new Map();
let measureCtx = null;
/** Width in HUD px of a label at `size` HUD px ('italic' places, 'caps' spaced capitals), from a 100 px measure. */
export function serifWidth(text, size, style = 'italic', makeCanvas = null) {
  ensureFont();
  const k = style + '|' + text;
  let w100 = widthCache.get(k);
  if (w100 == null) {
    if (!measureCtx && makeCanvas) { try { measureCtx = makeCanvas(1, 1).getContext('2d'); } catch { measureCtx = null; } }
    if (measureCtx && measureCtx.measureText) {
      measureCtx.font = fontFor(style, 100);
      if (style === 'caps') { w100 = -34; for (const ch of text) w100 += measureCtx.measureText(ch).width + 34; }
      else w100 = measureCtx.measureText(text).width;
    } else w100 = text.length * (style === 'caps' ? 82 : 46);
    if (widthCache.size > 600) widthCache.clear();
    widthCache.set(k, w100);
  }
  return (w100 * size) / 100;
}
const fontCache = new Map();
function fontFor(style, px) {
  const k = style + px;
  let f = fontCache.get(k);
  if (!f) { f = `${style === 'caps' ? '600' : 'italic 500'} ${px}px ${SERIF}`; fontCache.set(k, f); }
  return f;
}

// ------------------------------------------------------------------ the pass
/**
 * The screen-resolution map pass. ui.js calls begin() at the top of its frame; hud.js minimap() and menus.js drawMap()
 * register their boxes (HUD px, the HUD layer left clear there); main.js calls draw(ctx, layout) with the game canvas
 * inside renderer.drawHud, before the HUD layer is composited over it. The request slots are reused every frame.
 */
export function createMapPass(book, makeCanvas) {
  const art = book.art;
  const mini = { on: false }, world = { on: false, spec: null };
  let shade = null, shadeKey = '';
  const comp = { canvas: null, key: '' };
  const cost = { last: 0, n: 0, sum: 0, max: 0 };
  function drawMini(ctx, L, r) {
    const b = L.base, D = 3 * b;
    const bx = L.ox + r.x * b, by = L.oy + r.y * b, bw = r.w * b, bh = r.h * b;
    const z = book.zone(r.zone);
    if (!z) return;
    const zw = z.w * D, zh = z.h * D;
    const sx = Math.max(0, Math.min(zw - bw, Math.round((r.px / 16) * D - bw / 2)));
    const sy = Math.max(0, Math.min(zh - bh, Math.round((r.py / 16) * D - bh / 2)));
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    ctx.fillStyle = '#14101e'; ctx.fillRect(bx, by, bw, bh);
    const cx0 = Math.floor(sx / D / CHUNK), cx1 = Math.floor((Math.min(zw, sx + bw) - 1) / D / CHUNK);
    const cy0 = Math.floor(sy / D / CHUNK), cy1 = Math.floor((Math.min(zh, sy + bh) - 1) / D / CHUNK);
    let missing = false;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (!art.chunk(r.zone, D, cx, cy, 1)) missing = true;
    if (missing) {
      // today's flat image where a chunk has not arrived yet (scaled up by whole pixels, as the HUD layer did)
      const img = book.image(r.zone, 3);
      if (img) {
        ctx.imageSmoothingEnabled = false;
        const w = Math.min(bw, zw - sx), h = Math.min(bh, zh - sy);
        ctx.drawImage(img, sx / b, sy / b, w / b, h / b, bx, by, w, h);
      }
    }
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = art.chunk(r.zone, D, cx, cy, 1);
      if (c) ctx.drawImage(c, bx + cx * CHUNK * D - sx, by + cy * CHUNK * D - sy);
    }
    // the ring around the view, baked ahead as you walk (6 tiles out)
    const m = 6 * D;
    const rx0 = Math.max(0, Math.floor((sx - m) / D / CHUNK)), rx1 = Math.floor((Math.min(zw, sx + bw + m) - 1) / D / CHUNK);
    const ry0 = Math.max(0, Math.floor((sy - m) / D / CHUNK)), ry1 = Math.floor((Math.min(zh, sy + bh + m) - 1) / D / CHUNK);
    for (let cy = ry0; cy <= ry1; cy++) for (let cx = rx0; cx <= rx1; cx++) if (cx < cx0 || cx > cx1 || cy < cy0 || cy > cy1) art.chunk(r.zone, D, cx, cy, 0);
    const ox = bx - sx, oy = by - sy;
    areasAt(ctx, r.areas, r.zone, ox, oy, D, b, 1, null, bx, by, bw, bh);
    markersAt(ctx, r.markers, ox, oy, D, b, bx, by, bw, bh, false);
    edgeArrowAt(ctx, r.goal, r.zone, ox, oy, D, b, bx, by, bw, bh);
    ctx.restore();
    // the inner shadow and the gilt hairline (cached per box size)
    const sk = bw * 100000 + bh * 10 + b;
    if (sk !== shadeKey) { shade = makeShade(bw, bh, b); shadeKey = sk; }
    if (shade) ctx.drawImage(shade, bx, by);
  }

  function makeShade(w, h, b) {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    if (!g || !g.createLinearGradient) return c;
    const d = Math.max(3, Math.round(b * 2.4));
    const side = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(20,12,6,0.5)'); gr.addColorStop(1, 'rgba(20,12,6,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
    side(0, 0, 0, d, 0, 0, w, d); side(0, h, 0, h - d, 0, h - d, w, d); side(0, 0, d, 0, 0, 0, d, h); side(w, 0, w - d, 0, w - d, 0, d, h);
    const lw = Math.max(1, Math.round(b * 0.4));
    g.strokeStyle = 'rgba(249,215,122,0.85)'; g.lineWidth = lw; g.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
    return c;
  }

  function drawWorld(ctx, L, s) {
    const b = L.base, D = Math.round(s.ppt * b * 100) / 100;
    const bx = L.ox + s.x * b, by = L.oy + s.y * b, bw = Math.round(s.w * b), bh = Math.round(s.h * b);
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    ctx.fillStyle = '#14101e'; ctx.fillRect(bx, by, bw, bh);
    // the composed layer: the baked view, then the flight points, doors and lettering (redrawn only when they change)
    const base = art.view(s.zone, D, s.tx0, s.ty0, s.tw, s.th);
    const key = `${s.key}|${b}|${fontVersion}|${base ? 1 : 0}`;
    const w = Math.round(s.tw * D), h = Math.round(s.th * D);
    if (key !== comp.key) {
      if (!comp.canvas) comp.canvas = makeCanvas(w, h);
      if (comp.canvas.width !== w) comp.canvas.width = w;
      if (comp.canvas.height !== h) comp.canvas.height = h;
      const g = comp.canvas.getContext('2d');
      if (base) g.drawImage(base, 0, 0);
      else {
        const img = book.image(s.zone, 3);
        g.fillStyle = '#14101e'; g.fillRect(0, 0, w, h);
        if (img) { g.imageSmoothingEnabled = D < 3; g.drawImage(img, s.tx0 * 3, s.ty0 * 3, s.tw * 3, s.th * 3, 0, 0, w, h); g.imageSmoothingEnabled = true; }
      }
      if (g.fillText) letter(g, s, D, b);
      comp.key = key;
    }
    // map tile (tx, ty) sits at HUD px (tx * ppt - sx, ty * ppt - sy) from the box corner
    const ox = bx - s.sx * b, oy = by - s.sy * b;
    ctx.drawImage(comp.canvas, ox + s.tx0 * D, oy + s.ty0 * D);
    areasAt(ctx, s.areas, s.zone, ox, oy, D, b, 2, s.look, bx, by, bw, bh);
    if (s.exit) chevron(ctx, bx + s.exit.x * b, by + s.exit.y * b, s.exit.ang, b * 1.2);
    markersAt(ctx, s.markers, ox, oy, D, b, bx, by, bw, bh, true);
    ctx.restore();
    ctx.strokeStyle = 'rgba(249,215,122,0.8)'; ctx.lineWidth = Math.max(1, Math.round(b * 0.4));
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  }

  /** Lettering into the composed layer (view image px). Label positions are HUD px from the map box's corner. */
  function letter(g, s, D, b) {
    const ox = -s.tx0 * D, oy = -s.ty0 * D;
    const hx = (x) => (x + s.sx) * b - s.tx0 * D, hy = (y) => (y + s.sy) * b - s.ty0 * D;
    for (const p of s.doors || []) roundel(g, ox + p.x * D, oy + p.y * D, 5.5 * b, 'door', true);
    for (const p of s.flights || []) roundel(g, ox + p.x * D, oy + p.y * D, 6.5 * b, 'kite', p.known);
    g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
    for (const lb of s.labels || []) {
      const px = Math.max(8, Math.round(lb.size * b));
      g.font = fontFor(lb.style, px);
      const x = hx(lb.x), y = hy(lb.y) + px * 0.78;
      g.strokeStyle = lb.style === 'caps' ? 'rgba(244,234,208,0.72)' : 'rgba(244,234,208,0.9)';
      g.lineWidth = Math.max(2, px * 0.3);
      g.fillStyle = lb.color;
      if (lb.style === 'caps') {
        let xx = x;
        const track = px * 0.34;
        for (const ch of lb.text) { g.strokeText(ch, xx, y); g.fillText(ch, xx, y); xx += g.measureText(ch).width + track; }
      } else { g.strokeText(lb.text, x, y); g.fillText(lb.text, x, y); }
      if (lb.arrow != null) {
        // an exit: a small ink arrow at the map edge, pointing out
        g.save(); g.translate(hx(lb.ax), hy(lb.ay)); g.rotate(lb.arrow);
        g.beginPath(); g.moveTo(4 * b, 0); g.lineTo(-2.5 * b, -3 * b); g.lineTo(-1 * b, 0); g.lineTo(-2.5 * b, 3 * b); g.closePath();
        g.strokeStyle = 'rgba(244,234,208,0.9)'; g.lineWidth = Math.max(1.5, b * 0.8); g.stroke();
        g.fillStyle = INK_C; g.fill();
        g.restore();
      }
    }
  }

  return {
    art,
    get enabled() { return !!(art && art.available); },
    begin() { mini.on = false; world.on = false; },
    /** The minimap: inner box (HUD px) and its model { zone, x, y (px), markers, areas, goal }. */
    mini(box, m) {
      mini.on = true; mini.x = box.x; mini.y = box.y; mini.w = box.w; mini.h = box.h;
      mini.zone = m.zone; mini.px = m.x; mini.py = m.y; mini.markers = m.markers; mini.areas = m.areas; mini.goal = m.goal;
    },
    /** The world map: { key, x, y, w, h (the map box, HUD px), zone, ppt, sx, sy, tx0, ty0, tw, th, labels, flights,
     *  doors, markers, areas, look, exit }. */
    world(spec) { world.on = true; world.spec = spec; },
    get pending() { return mini.on || world.on; },
    get cost() { return { lastMs: cost.last, avgMs: cost.n ? cost.sum / cost.n : 0, maxMs: cost.max, frames: cost.n }; },
    draw(ctx, L) {
      if (!art || !L) return;
      art.tick();
      if (!mini.on && !world.on) return;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (mini.on) drawMini(ctx, L, mini);
      if (world.on && world.spec) drawWorld(ctx, L, world.spec);
      ctx.restore();
      if (t0) { const dt = performance.now() - t0; cost.last = dt; cost.n++; cost.sum += dt; if (cost.n > 30) cost.max = Math.max(cost.max, dt); }
    },
  };
}

function roundel(g, x, y, r, kind, lit) {
  g.save();
  g.globalAlpha = lit ? 1 : 0.6;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = kind === 'door' ? '#2a1c14' : VELLUM_C; g.fill();
  g.lineWidth = Math.max(1, r * 0.16); g.strokeStyle = kind === 'door' ? GILT : INK_C; g.stroke();
  const u = r / 6.5;
  if (kind === 'door') {
    // a gilt arch
    g.beginPath(); g.moveTo(x - 3 * u, y + 3.2 * u); g.lineTo(x - 3 * u, y); g.arc(x, y, 3 * u, Math.PI, 0); g.lineTo(x + 3 * u, y + 3.2 * u); g.closePath();
    g.fillStyle = GILT; g.fill();
    g.fillStyle = '#2a1c14'; g.fillRect(x - 1.4 * u, y + 0.2 * u, 2.8 * u, 3 * u);
  } else {
    // a kite: a lozenge and its tail
    g.beginPath(); g.moveTo(x, y - 4 * u); g.lineTo(x + 2.6 * u, y - 0.6 * u); g.lineTo(x, y + 2.4 * u); g.lineTo(x - 2.6 * u, y - 0.6 * u); g.closePath();
    g.fillStyle = lit ? GILT : '#c8bca0'; g.fill(); g.lineWidth = Math.max(1, u * 0.7); g.strokeStyle = INK_C; g.stroke();
    g.beginPath(); g.moveTo(x, y + 2.4 * u); g.quadraticCurveTo(x + 1.6 * u, y + 3.6 * u, x - 0.6 * u, y + 4.8 * u); g.stroke();
  }
  g.restore();
}

const dashCache = new Map();
function scaledDash(u) { let d = dashCache.get(u); if (!d) { d = [u * 2.2, u * 1.6]; dashCache.set(u, d); } return d; }

/** Quest areas: a hatched gilt wash with a dashed gilt and ink ring; the selected quest brighter, with a pulse ring. */
function areasAt(ctx, areas, zone, ox, oy, D, u, minR, look, bx, by, bw, bh) {
  if (!areas || !areas.length) return;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < areas.length; i++) {
    const a = areas[i];
    if (a.zone && zone && a.zone !== zone) continue;
    const sel = !!(look && look.sel && a.quest === look.sel), dim = !!(look && look.sel && !sel);
    if ((pass === 1) !== sel) continue;
    const cx = ox + a.x * D, cy = oy + a.y * D, r = Math.max(minR * D, (a.r || 2) * D);
    if (cx + r < bx || cy + r < by || cx - r > bx + bw || cy - r > by + bh) continue;
    const al = dim ? 0.45 : 1;
    // each draw clips to the map box itself (not only the caller's clip): an iPhone drew these rings across the HUD
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = sel ? 'rgba(255,220,90,0.3)' : dim ? 'rgba(249,215,122,0.1)' : 'rgba(249,215,122,0.22)';
    ctx.fill();
    ctx.clip();
    ctx.globalAlpha = al;
    ctx.strokeStyle = sel ? 'rgba(255,236,150,0.8)' : 'rgba(236,190,80,0.6)';
    ctx.lineWidth = Math.max(1, u * 0.45);
    const step = Math.max(3, u * 2.6);
    ctx.beginPath();
    for (let k = -r; k <= r * 3; k += step) { ctx.moveTo(cx - r + k - 2 * r, cy + r); ctx.lineTo(cx - r + k, cy - r); }
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    ctx.globalAlpha = al;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.5, u * 1.1); ctx.strokeStyle = 'rgba(52,36,24,0.7)'; ctx.stroke();
    ctx.setLineDash(scaledDash(u)); ctx.lineWidth = Math.max(1, u * 0.7); ctx.strokeStyle = sel ? GILT_HI : GILT; ctx.stroke();
    ctx.setLineDash(NODASH);
    if (sel) {
      const p = look.pulse || 0;
      ctx.globalAlpha = 0.85 * (1 - p);
      ctx.beginPath(); ctx.arc(cx, cy, r + u * (1 + p * 4), 0, Math.PI * 2); ctx.lineWidth = Math.max(1, u * 0.8); ctx.strokeStyle = GILT_HI; ctx.stroke();
    }
    ctx.restore();
  }
}

const ORDER = ['npc', 'foe', 'party', 'quest', 'me'];
/** Markers at device px: each kind differs by shape as well as colour. u = device px per HUD px. */
function markersAt(ctx, markers, ox, oy, D, u, bx, by, bw, bh, noFoes) {
  if (!markers) return;
  ctx.lineJoin = 'round';
  for (let k = 0; k < ORDER.length; k++) {
    const kind = ORDER[k];
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const mk = m.kind === 'turnin' ? 'quest' : m.kind;
      if (mk !== kind || (noFoes && mk === 'foe')) continue;
      const x = ox + (m.x / 16) * D, y = oy + (m.y / 16) * D;
      const pad = 2 * u;
      if (x < bx + pad || y < by + pad || x > bx + bw - pad || y > by + bh - pad) continue;
      if (mk === 'me') {
        // lantern white arrow, a gilt lit side, an ink rim, pointing the way you face
        ctx.save(); ctx.translate(x, y); ctx.rotate((ME_DIR[m.dir] != null ? ME_DIR[m.dir] : -Math.PI / 2) + Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -4.2 * u); ctx.lineTo(3.4 * u, 3.4 * u); ctx.lineTo(0, 1.6 * u); ctx.lineTo(-3.4 * u, 3.4 * u); ctx.closePath();
        ctx.lineWidth = Math.max(1.5, u * 1.1); ctx.strokeStyle = '#1a1208'; ctx.stroke();
        ctx.fillStyle = '#fbf6e6'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -4.2 * u); ctx.lineTo(3.4 * u, 3.4 * u); ctx.lineTo(0, 1.6 * u); ctx.closePath();
        ctx.fillStyle = GILT; ctx.fill();
        ctx.restore();
      } else if (mk === 'quest') {
        // a gilt coin with an ink ! (take) or ? (hand in)
        const r = 3.3 * u;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#e8b84a'; ctx.fill();
        ctx.lineWidth = Math.max(1.2, u * 0.8); ctx.strokeStyle = '#1a1208'; ctx.stroke();
        ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,241,184,0.55)'; ctx.fill();
        ctx.fillStyle = '#1a1208'; ctx.strokeStyle = '#1a1208';
        if (m.kind === 'quest') {
          ctx.fillRect(x - 0.6 * u, y - 2.2 * u, 1.2 * u, 2.6 * u);
          ctx.fillRect(x - 0.6 * u, y + 1.0 * u, 1.2 * u, 1.1 * u);
        } else {
          ctx.lineWidth = 1.1 * u; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(x, y - 0.9 * u, 1.15 * u, Math.PI * 1.1, Math.PI * 0.45); ctx.lineTo(x, y + 0.5 * u); ctx.stroke();
          ctx.lineCap = 'butt';
          ctx.fillRect(x - 0.55 * u, y + 1.15 * u, 1.1 * u, 1.0 * u);
        }
      } else if (mk === 'foe') {
        const r = 2.4 * u;
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
        ctx.fillStyle = '#d4512c'; ctx.fill(); ctx.lineWidth = Math.max(1, u * 0.7); ctx.strokeStyle = '#2a0e08'; ctx.stroke();
      } else if (mk === 'party') {
        ctx.beginPath(); ctx.arc(x, y, 2.3 * u, 0, Math.PI * 2); ctx.fillStyle = '#fbf6e6'; ctx.fill();
        ctx.lineWidth = Math.max(1, u * 0.5); ctx.strokeStyle = '#1a1208'; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 1.5 * u, 0, Math.PI * 2); ctx.fillStyle = '#4f9ad8'; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(x, y, 1.25 * u, 0, Math.PI * 2); ctx.fillStyle = VELLUM_C; ctx.fill();
        ctx.lineWidth = Math.max(1, u * 0.5); ctx.strokeStyle = '#3a2a1a'; ctx.stroke();
      }
    }
  }
}

/** A gilt chevron (the goal or the exit), pointing along `ang`, s device px per HUD px. */
function chevron(ctx, x, y, ang, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(5 * s, 0); ctx.lineTo(-3.5 * s, -4.2 * s); ctx.lineTo(-1.2 * s, 0); ctx.lineTo(-3.5 * s, 4.2 * s); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.5, s * 1.2); ctx.strokeStyle = '#1a1208'; ctx.stroke();
  ctx.fillStyle = GILT; ctx.fill();
  ctx.beginPath(); ctx.moveTo(5 * s, 0); ctx.lineTo(-3.5 * s, -4.2 * s); ctx.lineTo(-1.2 * s, 0); ctx.closePath(); ctx.fillStyle = GILT_HI; ctx.fill();
  ctx.restore();
}

/** The tracked quest's nearest area, off the minimap: a gilt chevron on the edge toward it. */
function edgeArrowAt(ctx, goal, zone, ox, oy, D, u, bx, by, bw, bh) {
  if (!goal || goal.zone !== zone) return;
  const gx = ox + goal.x * D, gy = oy + goal.y * D, r = (goal.r || 1) * D;
  if (gx + r >= bx && gy + r >= by && gx - r < bx + bw && gy - r < by + bh) return;   // visible already
  const cx = bx + bw / 2, cy = by + bh / 2, dx = gx - cx, dy = gy - cy;
  const k = Math.min((bw / 2 - 5 * u) / Math.max(1e-6, Math.abs(dx)), (bh / 2 - 5 * u) / Math.max(1e-6, Math.abs(dy)));
  chevron(ctx, cx + dx * k, cy + dy * k, Math.atan2(dy, dx), u * 0.85);
}

/**
 * The world map's view (pure, tested): the whole zone fitted to the map area, or zoomed on your area at the minimap's
 * 3 HUD px a tile with a "Whole world" button (Scott 2026-11-25, question 2). area: { w, h } HUD px; center in tiles.
 * Returns { ppt, canZoom, whole, sx, sy, w, h, tx0, ty0, tw, th }: tile (tx, ty) sits at HUD px (tx * ppt - sx,
 * ty * ppt - sy) from the area's corner; w x h is the drawn part; the baked view covers [tx0, tx0+tw) x [ty0, ty0+th).
 */
export function worldView(zone, area, whole, center) {
  const fit = Math.min(area.w / zone.w, area.h / zone.h);
  const NEAR = 3;
  const canZoom = fit < NEAR * 0.75;
  if (!canZoom || whole) {
    const w = Math.floor(zone.w * fit), h = Math.floor(zone.h * fit);
    return { ppt: fit, canZoom, whole: true, sx: -Math.floor((area.w - w) / 2), sy: -Math.floor((area.h - h) / 2), w, h, tx0: 0, ty0: 0, tw: zone.w, th: zone.h };
  }
  const ppt = NEAR, vw = area.w / ppt, vh = area.h / ppt;
  const c = center || { x: zone.w / 2, y: zone.h / 2 };
  const tx = Math.max(0, Math.min(zone.w - vw, c.x - vw / 2)), ty = Math.max(0, Math.min(zone.h - vh, c.y - vh / 2));
  const sx = Math.round(tx * ppt), sy = Math.round(ty * ppt);
  const tx0 = Math.floor(sx / ppt), ty0 = Math.floor(sy / ppt);
  const tw = Math.min(zone.w - tx0, Math.ceil((sx + area.w) / ppt) - tx0 + 1), th = Math.min(zone.h - ty0, Math.ceil((sy + area.h) / ppt) - ty0 + 1);
  return { ppt, canZoom, whole: false, sx, sy, w: area.w, h: area.h, tx0, ty0, tw, th };
}

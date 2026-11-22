// Bake a zone's tile layers. Adapted from Lexicon Quest next/src/world/tilemap.js (the painting half: terrain A2
// autotiles with layering and fill variants, wall systems, line16 fences, plain tiles, building bases and roofs).
// Collision is NOT here: the sim reads the grid baked into the zone module by tools/dev/import_lq_maps.mjs.
//
//   const baked = bakeZone(zone, { tiles, propsDb, img })
//   baked.prepare(cam, W, H, t)          paint the chunks this view needs (and some of the margin); once a frame
//   baked.drawGround(g, cam, W, H, t)    terrain, walls, tiles and building bases at the current water phase
//   baked.drawOverhead(g, cam, W, H)     the layer drawn above actors (building tops, far backdrop props)
//   baked.overheadOps                    what the overhead layer is made of: [{ im, sx, sy, w, h, dx, dy }] world px
//   baked.drawAll(g, 'ground' | 'overhead', phase)   a whole layer onto one big canvas (tools/maps/render.html)
//   baked.props       y-sorted drawables: { sortY, img, sx, sy, w, h, dx, dy, anim, light }
//   baked.statics     building and big-prop placements { t, x, y, meta } (lighting finds window panes in them)
//   baked.release()   free every chunk canvas (zone change, hot reload)      baked.stats() -> cache counters
//
// Chunks (the one world, 2026-11-21): the world is 296 x 196 tiles, and one canvas of that per layer is about 57 MB,
// past a phone's canvas budget (Safari also refuses a canvas over about 16.7 M px). So the layers are painted in
// CHUNK x CHUNK tile squares, on demand, into a small LRU cache. The parse stays global (it is cheap) and a chunk
// paints from the whole grid, so an autotile at a chunk edge still sees its neighbours; the chunk only clips. Painting
// a cell range in the same pass order as the one big canvas did gives the same pixels, chunked or not.
import { a2Quarters, faceQuarters, line16Index, pickVariant, terrainLayers, neighbours, allConnected, QUARTERS, QUARTER_OFFSET } from './autotile.js';
import { paintPlaceCells } from './dungeon2d.js';
import { isPlaceZone } from './dungeon_plan.js';
import { underAt } from '../data/maps/compose.js';

const TILE = 16;
// 16 tiles = 256 px a side, 256 KB a canvas. A big phone's view (about 844 x 390 world px) needs about 5 x 3 of them,
// and the 1-chunk margin ring around it stays small (32-tile chunks would hold about twice the pixels for one view).
export const CHUNK = 16;
// Cache budget in chunk canvases: 96 x 256 KB = 24 MB at most. A view is about 5 x 3 chunks (three canvases each
// where there is water, one per phase), its margin ring about 20 more (the phase it shows now only), plus the few
// overhead chunks that hold anything: about 65 at the wettest, so the rest of the budget keeps recently left chunks.
// Chunks the current frame draws are never evicted, so a view bigger than the budget still draws (just over it).
export const CHUNK_BUDGET = 96;
// Margin chunks are painted ahead of the camera within this much time a frame (ms), so walking does not stall on a
// whole row of fresh chunks at once.
const PREFETCH_MS = 2;

export function bakeZone(zone, { tiles: db, propsDb, img }) {
  const place = isPlaceZone(zone);       // a dungeon or cave: walls and props from dungeon2d.js on top of the ground
  const W = zone.w, H = zone.h;
  const T = db.terrains, WALLS = db.walls || {}, TILES = db.tiles || {}, OBJS = db.objects || {};
  const sheet = (name) => img(String(name).replace(/\.[^.]+$/, ''));
  const orderOf = (id) => db.terrainOrder.indexOf(id);
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // ------------------------------------------------------------ parse
  const terrain = [], ids = [], walls = [], tilesAt = [], decorTiles = [], overlays = [];
  const statics = [], props = [];
  let anim = null;
  for (let y = 0; y < H; y++) {
    const tr = [], ir = [], wr = [], tl = [], dr = [], ov = [];
    for (let x = 0; x < W; x++) {
      const ch = zone.ground[y][x];
      const id = zone.legend[ch];
      let t = underAt(zone, x, y), wall = null, tile = null;   // the moor's base is turf, the rest grass
      if (id != null && T[id]) t = id;
      else if (id != null && /_top$|_face$/.test(id) && WALLS[id.replace(/_(top|face)$/, '')]) wall = { sys: id.replace(/_(top|face)$/, ''), part: id.endsWith('_top') ? 'top' : 'face' };
      else if (id != null && TILES[id]) tile = id;
      if (T[t] && T[t].anim && !anim) anim = T[t].anim;
      tr.push(T[t] ? t : null); ir.push(id ?? null); wr.push(wall); tl.push(tile); dr.push(null); ov.push(null);
    }
    terrain.push(tr); ids.push(ir); walls.push(wr); tilesAt.push(tl); decorTiles.push(dr); overlays.push(ov);
  }
  for (const o of zone.overlays || []) {
    if (!inb(o.x, o.y)) continue;
    if (T[o.t]) { terrain[o.y][o.x] = o.t; continue; }
    if (TILES[o.t]) (overlays[o.y][o.x] || (overlays[o.y][o.x] = [])).push(o.t);
  }
  for (const d of zone.decor || []) {
    if (OBJS[d.t]) {
      const m = OBJS[d.t];
      if (m.kind === 'building' || m.kind === 'piece') statics.push({ ...d, meta: m });
      else props.push(objectProp(d, m));
    } else if (propsDb[d.t]) props.push(propsProp(d, propsDb[d.t]));
    else if (TILES[d.t]) {
      for (let j = 0; j < (d.h || 1); j++) for (let k = 0; k < (d.w || 1); k++) {
        if (inb(d.x + k, d.y + j)) (decorTiles[d.y + j][d.x + k] || (decorTiles[d.y + j][d.x + k] = [])).push(d.t);
      }
    }
  }

  function objectProp(d, m) {
    const [ax, ay] = m.anchor;
    const [rx, ry, rw, rh] = (m.frames && m.frames[d.state || 0]) || m.rect;
    return { t: d.t, img: sheet(m.sheet), sx: rx, sy: ry, w: rw, h: rh, dx: (d.x - ax) * TILE, dy: (d.y - ay) * TILE, anim: m.anim || null, sortY: (d.y + 1) * TILE - 1 };
  }
  function propsProp(d, pm) {
    let [fx, fy, fw, fh] = pm.frame;
    if (pm.frames && pm.frames[d.state || 0]) [fx, fy, fw, fh] = pm.frames[d.state || 0];
    const [ax, ay] = pm.anchor;
    const [fpw] = pm.footprint;
    return { t: d.t, img: img('props'), sx: fx, sy: fy, w: fw, h: fh, dx: d.x * TILE + fpw * 8 - ax, dy: d.y * TILE + 15 - ay, anim: null,
      blend: pm.blend || null, sortY: d.y * TILE + 15,
      light: d.t === 'lamp_post' && d.state === 1 ? { x: d.x * TILE + 8, y: d.y * TILE - 18, r: 56 } : null };
  }

  // ------------------------------------------------------------ paint
  function paintTerrainCell(g, x, y, phase) {
    const layers = terrainLayers(terrain, x, y, orderOf);
    const px = x * TILE, py = y * TILE;
    for (const L of layers) {
      const m = T[L.id];
      const im = sheet(m.sheet);
      let sx = m.x;
      if (m.anim) sx += phase * m.anim.frameDx;
      if (L.full && m.variants && m.variants.length) {
        const k = pickVariant(x, y, m.variantWeights || [4, ...m.variants.slice(1).map(() => 2)]);
        const [vx, vy] = m.variants[k];
        g.drawImage(im, vx, vy, TILE, TILE, px, py, TILE, TILE);
      } else {
        const qs = a2Quarters(L.nb);
        for (let i = 0; i < 4; i++) {
          const [qx, qy] = qs[i];
          const [ox, oy] = QUARTER_OFFSET[QUARTERS[i]];
          g.drawImage(im, sx + qx * 8, m.y + qy * 8, 8, 8, px + ox, py + oy, 8, 8);
        }
      }
    }
  }

  function paintWallCell(g, x, y) {
    const w = walls[y][x];
    if (!w) return;
    const meta = WALLS[w.sys];
    const im = sheet(meta.sheet);
    const px = x * TILE, py = y * TILE;
    if (w.part === 'top') {
      const topId = w.sys + '_top';
      const nb = neighbours(ids, x, y, (o) => o === topId, true);
      if (allConnected(nb) && meta.topVariants && meta.topVariants.length) {
        const [vx, vy] = meta.topVariants[pickVariant(x, y, meta.topVariantWeights || meta.topVariants.map(() => 1))];
        g.drawImage(im, vx, vy, TILE, TILE, px, py, TILE, TILE);
        return;
      }
      const qs = a2Quarters(nb);
      for (let i = 0; i < 4; i++) {
        const [qx, qy] = qs[i];
        const [ox, oy] = QUARTER_OFFSET[QUARTERS[i]];
        g.drawImage(im, meta.top[0] + qx * 8, meta.top[1] + qy * 8, 8, 8, px + ox, py + oy, 8, 8);
      }
    } else {
      const faceId = w.sys + '_face';
      const same = (xx, yy) => !inb(xx, yy) || ids[yy][xx] === faceId;
      const qs = faceQuarters(same(x - 1, y), same(x, y - 1), same(x + 1, y), same(x, y + 1));
      const [fx, fy] = meta.face;
      for (let i = 0; i < 4; i++) {
        const [qx, qy] = qs[i];
        const [ox, oy] = QUARTER_OFFSET[QUARTERS[i]];
        g.drawImage(im, fx + qx * 8, fy + qy * 8, 8, 8, px + ox, py + oy, 8, 8);
      }
    }
  }

  function paintTile(g, id, x, y, phase, dx = 0, dy = 0) {
    const m = TILES[id];
    if (!m) return;
    const im = sheet(m.sheet);
    const px = x * TILE + dx, py = y * TILE + dy;
    if (m.autotile === 'line16') {
      const sameAt = (xx, yy) => inb(xx, yy) && (ids[yy][xx] === id || (decorTiles[yy][xx] || []).includes(id) || (overlays[yy][xx] || []).includes(id));
      const i = line16Index(sameAt(x, y - 1), sameAt(x + 1, y), sameAt(x, y + 1), sameAt(x - 1, y));
      g.drawImage(im, m.x + (i % 8) * 16, m.y + Math.floor(i / 8) * 16, 16, 16, px, py, 16, 16);
      return;
    }
    let sx = m.x;
    if (m.anim) sx += m.anim.frames[phase % m.anim.frames.length] * m.anim.frameDx;
    g.drawImage(im, sx, m.y, m.w || 16, m.h || 16, px, py, m.w || 16, m.h || 16);
  }

  function paintStatic(g, s, part) {
    const m = s.meta;
    const [rx, ry, rw, rh] = m.rect;
    const im = sheet(m.sheet);
    const ox = (s.x - m.anchor[0]) * TILE, oy = (s.y - m.anchor[1]) * TILE;
    const oh = (m.overheadRows || 0) * TILE;
    if (part === 'base') { if (rh - oh > 0) g.drawImage(im, rx, ry + oh, rw, rh - oh, ox, oy + oh, rw, rh - oh); }
    else if (oh > 0) g.drawImage(im, rx, ry, rw, oh, ox, oy, rw, oh);
  }

  // ------------------------------------------------------------ animation
  // A zone animates its water with one phase sequence (frames 0,1,2,1). The one world holds the valley's water (220 ms)
  // and the moor's tarn (520 ms), so each chunk keeps the timing of the animated terrain it holds most of; a chunk with
  // only an animated tile (the far windmill) keeps the zone's first animation, as the single-canvas bake did.
  const phases = anim ? [...new Set(anim.frames)].sort((a, b) => a - b) : [0];
  const phaseOf = (a, t) => {
    if (phases.length === 1 || !a) return 0;
    const v = a.frames[Math.floor((t * 1000) / (a.ms || 220)) % a.frames.length];
    const i = phases.indexOf(v);
    return i < 0 ? 0 : i;
  };
  // How far a tile may draw past its own cell (right and down): a wide tile west of a chunk can still reach into it.
  let ext = 0;
  for (const m of Object.values(TILES)) ext = Math.max(ext, Math.ceil(((m.w || 16) - 16) / TILE), Math.ceil(((m.h || 16) - 16) / TILE));
  const tileAnim = (id) => !!(id && TILES[id] && TILES[id].anim);

  // ------------------------------------------------------------ overhead ops (painted per chunk, read by occlusion)
  // The same draws, in the same order, as the old overhead canvas: building tops, then the zone's overhead tiles.
  const overheadOps = [];
  for (const s of statics) {
    const m = s.meta;
    const [rx, ry, rw] = m.rect;
    const oh = (m.overheadRows || 0) * TILE;
    if (oh > 0) overheadOps.push({ im: sheet(m.sheet), sx: rx, sy: ry, w: rw, h: oh, dx: (s.x - m.anchor[0]) * TILE, dy: (s.y - m.anchor[1]) * TILE });
  }
  for (const o of zone.overhead || []) {
    const m = TILES[o.t];
    if (!m) continue;
    const px = o.x * TILE + (o.dx || 0), py = o.y * TILE + (o.dy || 0);
    if (m.autotile === 'line16') {
      const sameAt = (xx, yy) => inb(xx, yy) && (ids[yy][xx] === o.t || (decorTiles[yy][xx] || []).includes(o.t) || (overlays[yy][xx] || []).includes(o.t));
      const i = line16Index(sameAt(o.x, o.y - 1), sameAt(o.x + 1, o.y), sameAt(o.x, o.y + 1), sameAt(o.x - 1, o.y));
      overheadOps.push({ im: sheet(m.sheet), sx: m.x + (i % 8) * 16, sy: m.y + Math.floor(i / 8) * 16, w: 16, h: 16, dx: px, dy: py });
    } else {
      const sx = m.x + (m.anim ? m.anim.frames[0] * m.anim.frameDx : 0);
      overheadOps.push({ im: sheet(m.sheet), sx, sy: m.y, w: m.w || 16, h: m.h || 16, dx: px, dy: py });
    }
  }

  // ------------------------------------------------------------ chunks
  const CPX = CHUNK * TILE;
  const CW = Math.ceil(W / CHUNK), CH = Math.ceil(H / CHUNK);
  const PW = W * TILE, PH = H * TILE;
  // per chunk: the animation it runs on (null: still, one canvas serves every phase) and whether it has overhead pixels
  const chunkAnim = new Array(CW * CH).fill(null);
  const chunkOver = new Uint8Array(CW * CH);
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(W, x0 + CHUNK), y1 = Math.min(H, y0 + CHUNK);
    const count = new Map();
    let tiled = false;
    // terrain one cell out: a cell's autotile layers come from its neighbours
    for (let y = Math.max(0, y0 - 1); y < Math.min(H, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x < Math.min(W, x1 + 1); x++) {
      const t = terrain[y][x];
      if (t && T[t].anim) count.set(T[t].anim, (count.get(T[t].anim) || 0) + 1);
    }
    for (let y = Math.max(0, y0 - ext); y < y1; y++) for (let x = Math.max(0, x0 - ext); x < x1; x++) {
      if (tileAnim(tilesAt[y][x]) || (decorTiles[y][x] || []).some(tileAnim) || (overlays[y][x] || []).some(tileAnim)) tiled = true;
    }
    let best = null, bestN = 0;
    for (const [a, n] of count) if (n > bestN) { best = a; bestN = n; }
    chunkAnim[cy * CW + cx] = best || (tiled ? anim : null);
  }
  for (const op of overheadOps) {
    const cx0 = Math.max(0, Math.floor(op.dx / CPX)), cy0 = Math.max(0, Math.floor(op.dy / CPX));
    const cx1 = Math.min(CW - 1, Math.floor((op.dx + op.w - 1) / CPX)), cy1 = Math.min(CH - 1, Math.floor((op.dy + op.h - 1) / CPX));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) chunkOver[cy * CW + cx] = 1;
  }

  /** One ground chunk at one phase: every pass of the old whole-zone bake, over the cells that can reach the chunk. */
  function paintGround(g, cx, cy, phase) {
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(W, x0 + CHUNK), y1 = Math.min(H, y0 + CHUNK);
    const ex0 = Math.max(0, x0 - ext), ey0 = Math.max(0, y0 - ext);
    g.save();
    g.translate(-x0 * TILE, -y0 * TILE);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) paintTerrainCell(g, x, y, phase);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) paintWallCell(g, x, y);
    for (let y = ey0; y < y1; y++) for (let x = ex0; x < x1; x++) if (tilesAt[y][x]) paintTile(g, tilesAt[y][x], x, y, phase);
    for (let y = ey0; y < y1; y++) for (let x = ex0; x < x1; x++) for (const id of decorTiles[y][x] || []) paintTile(g, id, x, y, phase);
    for (let y = ey0; y < y1; y++) for (let x = ex0; x < x1; x++) for (const id of overlays[y][x] || []) paintTile(g, id, x, y, phase);
    const bx0 = x0 * TILE, by0 = y0 * TILE, bx1 = x1 * TILE, by1 = y1 * TILE;
    for (const s of statics) {
      const m = s.meta, ox = (s.x - m.anchor[0]) * TILE, oy = (s.y - m.anchor[1]) * TILE;
      if (ox >= bx1 || oy >= by1 || ox + m.rect[2] <= bx0 || oy + m.rect[3] <= by0) continue;
      paintStatic(g, s, 'base');
    }
    if (place) paintPlaceCells(g, zone, x0, y0, x1, y1);
    g.restore();
  }
  function paintOverhead(g, cx, cy) {
    const bx0 = cx * CPX, by0 = cy * CPX;
    g.save();
    g.translate(-bx0, -by0);
    for (const op of overheadOps) {
      if (op.dx >= bx0 + CPX || op.dy >= by0 + CPX || op.dx + op.w <= bx0 || op.dy + op.h <= by0) continue;
      g.drawImage(op.im, op.sx, op.sy, op.w, op.h, op.dx, op.dy, op.w, op.h);
    }
    g.restore();
  }

  // LRU: key -> { c, used (frame number) }. A Map keeps insertion order, so a hit re-inserts its key at the end and
  // the first entry is always the least recently used.
  const cache = new Map();
  let frameNo = 0, painted = 0, evicted = 0, paintMs = 0;
  const keyOf = (kind, phase, cx, cy) => `${kind}${phase}:${cx},${cy}`;
  function canvasFor(cx, cy) {
    const w = Math.min(CPX, PW - cx * CPX), h = Math.min(CPX, PH - cy * CPX);
    let c = null;
    if (cache.size >= CHUNK_BUDGET) {
      // reuse the least recently used canvas this frame does not draw (no allocation churn on a phone)
      for (const [k, rec] of cache) {
        if (rec.used === frameNo) continue;
        cache.delete(k); evicted++;
        c = rec.c;
        break;
      }
    }
    if (!c) c = document.createElement('canvas');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else c.getContext('2d').clearRect(0, 0, w, h);
    c.getContext('2d').imageSmoothingEnabled = false;   // a resize resets the context state
    return c;
  }
  /** The canvas of one chunk of one layer, painted now if it is not cached; null for an empty overhead chunk. */
  function chunk(kind, phase, cx, cy) {
    const i = cy * CW + cx;
    if (kind === 'overhead') { if (!chunkOver[i]) return null; phase = 0; } else if (!chunkAnim[i]) phase = 0;
    const k = keyOf(kind, phase, cx, cy);
    let rec = cache.get(k);
    if (rec) { cache.delete(k); cache.set(k, rec); rec.used = frameNo; return rec.c; }
    const t0 = performance.now();
    const c = canvasFor(cx, cy);
    const g = c.getContext('2d');
    if (kind === 'overhead') paintOverhead(g, cx, cy); else paintGround(g, cx, cy, phase);
    painted++; paintMs += performance.now() - t0;
    rec = { c, used: frameNo };
    cache.set(k, rec);
    return c;
  }
  // chunk index range [cx0, cy0, cx1, cy1] covering a view (world px), grown by `pad` chunks, clamped to the zone
  function range(cam, vw, vh, pad) {
    return [Math.max(0, Math.floor(cam.x / CPX) - pad), Math.max(0, Math.floor(cam.y / CPX) - pad),
      Math.min(CW - 1, Math.floor((cam.x + vw - 1) / CPX) + pad), Math.min(CH - 1, Math.floor((cam.y + vh - 1) / CPX) + pad)];
  }
  function prepare(cam, vw, vh, t) {
    frameNo++;
    const [cx0, cy0, cx1, cy1] = range(cam, vw, vh, 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      chunk('ground', phaseOf(chunkAnim[cy * CW + cx], t), cx, cy);
      chunk('overhead', 0, cx, cy);
    }
    // Ahead of need, within PREFETCH_MS: the view's other water phases first, then the margin ring (the phase it would
    // show now), and only while the cache has room, so a prefetch never pushes out a chunk drawn a moment ago.
    const t0 = performance.now();
    const [mx0, my0, mx1, my1] = range(cam, vw, vh, 1);
    for (const ring of [false, true]) for (let cy = my0; cy <= my1; cy++) for (let cx = mx0; cx <= mx1; cx++) {
      const inView = cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1;
      if (inView === ring) continue;
      const i = cy * CW + cx;
      const want = [];
      if (!ring) { for (let p = 0; p < (chunkAnim[i] ? phases.length : 1); p++) want.push(['ground', p]); }
      else { want.push(['ground', phaseOf(chunkAnim[i], t)]); if (chunkOver[i]) want.push(['overhead', 0]); }
      for (const [kind, p] of want) {
        const k = keyOf(kind, p, cx, cy);
        if (cache.has(k)) { cache.get(k).used = frameNo; continue; }
        if (cache.size >= CHUNK_BUDGET || performance.now() - t0 > PREFETCH_MS) return;
        chunk(kind, p, cx, cy);
      }
    }
  }
  // whole chunk canvases at integer offsets: the same pixels as one sub-rect blit of a whole-zone canvas
  function drawLayer(g, kind, cam, vw, vh, t) {
    const [cx0, cy0, cx1, cy1] = range(cam, vw, vh, 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = chunk(kind, kind === 'ground' ? phaseOf(chunkAnim[cy * CW + cx], t) : 0, cx, cy);
      if (c) g.drawImage(c, cx * CPX - cam.x, cy * CPX - cam.y);
    }
  }
  function release() {
    for (const rec of cache.values()) { rec.c.width = 0; rec.c.height = 0; }   // Safari frees a canvas promptly only at 0 x 0
    cache.clear();
  }

  props.sort((a, b) => a.sortY - b.sortY);
  const seq = anim ? anim.frames : [0];
  return {
    id: zone.id, w: W, h: H, pixelW: PW, pixelH: PH, props, statics, overheadOps, phases: phases.length,
    prepare,
    drawGround(g, cam, vw, vh, t) { drawLayer(g, 'ground', cam, vw, vh, t); },
    drawOverhead(g, cam, vw, vh) { drawLayer(g, 'overhead', cam, vw, vh, 0); },
    /** Every chunk of a layer onto `g` at zone px (map stills; the caller may scale `g`). */
    drawAll(g, kind = 'ground', phase = 0) {
      for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
        frameNo++;
        const c = chunk(kind, phase, cx, cy);
        if (c) g.drawImage(c, cx * CPX, cy * CPX);
      }
    },
    /** The zone's own phase index at t seconds (its first animation, as the single-canvas bake had). */
    phaseAt(t) { return phases.length === 1 ? 0 : phaseOf({ frames: seq, ms: anim.ms || 220 }, t); },
    release,
    stats() {
      let px = 0;
      for (const rec of cache.values()) px += rec.c.width * rec.c.height;
      return { chunk: CHUNK, budget: CHUNK_BUDGET, cached: cache.size, mb: +((px * 4) / 1048576).toFixed(1), painted, evicted, paint_ms_avg: painted ? +(paintMs / painted).toFixed(2) : 0, grid: [CW, CH] };
    },
  };
}

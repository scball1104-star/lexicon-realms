// Bake a zone's tile layers into canvases. Adapted from Lexicon Quest next/src/world/tilemap.js (the painting half:
// terrain A2 autotiles with layering and fill variants, wall systems, line16 fences, plain tiles, building bases and
// roofs). Collision is NOT here: the sim reads the grid baked into the zone module by tools/dev/import_lq_maps.mjs.
//
//   const baked = bakeZone(zone, { tiles, propsDb, img })
//   baked.ground[i]   canvas per water animation phase      baked.phaseAt(tSeconds) -> index
//   baked.overhead    canvas drawn above actors (building tops)
//   baked.props       y-sorted drawables: { sortY, img, sx, sy, w, h, dx, dy, anim }
import { a2Quarters, faceQuarters, line16Index, pickVariant, terrainLayers, neighbours, allConnected, QUARTERS, QUARTER_OFFSET } from './autotile.js';

const TILE = 16;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
}

export function bakeZone(zone, { tiles: db, propsDb, img }) {
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
      let t = zone.under, wall = null, tile = null;
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

  const phases = anim ? [...new Set(anim.frames)].sort((a, b) => a - b) : [0];
  const ground = phases.map((phase) => {
    const c = makeCanvas(W * TILE, H * TILE);
    const g = c.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintTerrainCell(g, x, y, phase);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintWallCell(g, x, y);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tilesAt[y][x]) paintTile(g, tilesAt[y][x], x, y, phase);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const id of decorTiles[y][x] || []) paintTile(g, id, x, y, phase);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const id of overlays[y][x] || []) paintTile(g, id, x, y, phase);
    for (const s of statics) paintStatic(g, s, 'base');
    return c;
  });
  const overhead = makeCanvas(W * TILE, H * TILE);
  {
    const g = overhead.getContext('2d');
    for (const s of statics) paintStatic(g, s, 'overhead');
    for (const o of zone.overhead || []) if (TILES[o.t]) paintTile(g, o.t, o.x, o.y, 0, o.dx || 0, o.dy || 0);
  }
  props.sort((a, b) => a.sortY - b.sortY);

  const seq = anim ? anim.frames : [0];
  const ms = anim ? anim.ms || 220 : 220;
  return {
    id: zone.id, w: W, h: H, pixelW: W * TILE, pixelH: H * TILE, ground, overhead, props,
    phaseAt(t) {
      if (ground.length === 1) return 0;
      const v = seq[Math.floor((t * 1000) / ms) % seq.length];
      const i = phases.indexOf(v);
      return i < 0 ? 0 : i;
    },
  };
}

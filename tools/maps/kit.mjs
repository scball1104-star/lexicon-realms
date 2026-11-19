// Map-building kit for Lexicon Realms zone generators (dev only, never imported at runtime).
//
// Shapes are copied from Lexicon Quest's own map kit (next/src/data/maps/_kit.js and the ribbon / blob / value-noise
// helpers inside x1_downs.js and x1_highmoor.js), so a grown zone is painted the way LQ paints its maps: bent ribbons
// with ragged edges for roads, wobbly blobs for rises and pastures, two-octave value noise for grass drifts, hand-placed
// landmarks on top. Everything is deterministic (hash01), so `node tools/maps/build_world.mjs` always writes the same
// files.
//
//   const z = new Canvas(W, H, '.')     z.put(x, y, ch)  z.box(x0, y0, x1, y1, ch)  z.ribbon(pts, w, ch, salt, only)
//                                        z.blob(cx, cy, rx, ry, ch, seed, only)  z.wallRun(...)  z.at(x, y)
//   hash01(x, y, salt), vnoise(x, y, cell, salt), scatter(rows, chars, ids, density, salt, bounds)
//   loadLqDb()                          LQ tiles.json + x1_tiles.json merged (READ ONLY source), plus props.json
//   bakeCollision(map, db)              collision rows (CONTRACTS 6 chars) from ground + overlays + decor + solids
import fs from 'node:fs';
import path from 'node:path';

export const LQ = 'D:/LexiconQuest/next';

export function hash01(x, y, salt = 0) {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1): bilinear blend of hash01 at a lattice of `cell` tiles. */
export function vnoise(x, y, cell, salt) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const fx = x / cell - gx, fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash01(gx, gy, salt), b = hash01(gx + 1, gy, salt), c = hash01(gx, gy + 1, salt), d = hash01(gx + 1, gy + 1, salt);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

export class Canvas {
  constructor(w, h, ch) { this.W = w; this.H = h; this.g = Array.from({ length: h }, () => ch.repeat(w)); }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  at(x, y, off = '#') { return this.inb(x, y) ? this.g[y][x] : off; }
  put(x, y, s) {
    if (y < 0 || y >= this.H) return;
    for (let i = 0; i < s.length; i++) {
      const xx = x + i;
      if (xx < 0 || xx >= this.W) continue;
      this.g[y] = this.g[y].slice(0, xx) + s[i] + this.g[y].slice(xx + 1);
    }
  }
  box(x0, y0, x1, y1, ch, only = null) {
    for (let y = Math.max(0, y0); y <= Math.min(this.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.W - 1, x1); x++) {
      if (!only || only.includes(this.g[y][x])) this.put(x, y, ch);
    }
  }
  /** A ribbon of `ch` along a polyline in tile-corner coordinates, `w` tiles wide, ragged; `only` = chars it may overwrite. */
  ribbon(pts, w, ch, salt = 5, only = null, jig = 0.3) {
    const r = w / 2;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const x0 = Math.floor(Math.min(ax, bx) - r - 1), x1 = Math.ceil(Math.max(ax, bx) + r + 1);
      const y0 = Math.floor(Math.min(ay, by) - r - 1), y1 = Math.ceil(Math.max(ay, by) + r + 1);
      for (let y = Math.max(0, y0); y <= Math.min(this.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.W - 1, x1); x++) {
        const px = x + 0.5, py = y + 0.5;
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
        const j = (hash01(x, y, salt) - 0.5) * jig;
        if (d <= r + j - 0.02 && (!only || only.includes(this.g[y][x]))) this.put(x, y, ch);
      }
    }
  }
  /** A wobbly ellipse of `ch`. */
  blob(cx, cy, rx, ry, ch, seed = 1, only = null) {
    for (let y = Math.floor(cy - ry) - 2; y <= Math.ceil(cy + ry) + 2; y++) for (let x = Math.floor(cx - rx) - 2; x <= Math.ceil(cx + rx) + 2; x++) {
      if (!this.inb(x, y)) continue;
      const a = Math.atan2(y - cy, x - cx);
      const wob = 1 + 0.2 * Math.sin(a * 3 + seed) + 0.1 * Math.sin(a * 5 + seed * 2.3);
      if (Math.hypot((x - cx) / rx, (y - cy) / ry) <= wob && (!only || only.includes(this.g[y][x]))) this.put(x, y, ch);
    }
  }
  /** A straight run of `ch` with ragged gaps (drystone walls, fences). */
  wallRun(x0, y0, x1, y1, ch, salt, gap = 0.2, only = '.,') {
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    let x = x0, y = y0;
    for (;;) {
      if (hash01(x, y, salt) > gap && only.includes(this.at(x, y))) this.put(x, y, ch);
      if (x === x1 && y === y1) break;
      x += dx; y += dy;
    }
  }
  /** Value-noise drift of `ch` over cells that are one of `on`. */
  drift(ch, on, threshold, salt, cells = [6, 3], bounds = null) {
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (!on.includes(this.g[y][x])) continue;
      if (bounds && (x < bounds[0] || y < bounds[1] || x > bounds[2] || y > bounds[3])) continue;
      const n = 0.55 * vnoise(x, y, cells[0], salt) + 0.3 * vnoise(x, y, cells[1], salt + 2) + 0.15 * hash01(x, y, salt + 1);
      if (n > threshold) this.put(x, y, ch);
    }
  }
  near(x, y, chars, r = 1) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (chars.includes(this.at(x + dx, y + dy, ' '))) return true;
    return false;
  }
  rows() { return this.g.slice(); }
}

export function scatter(rows, chars, ids, density, salt = 1, bounds = null) {
  const out = [];
  const set = new Set(chars);
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    if (!set.has(rows[y][x])) continue;
    if (bounds && (x < bounds[0] || y < bounds[1] || x > bounds[2] || y > bounds[3])) continue;
    if (hash01(x, y, salt) < density) out.push({ t: ids[Math.floor(hash01(x, y, salt + 7) * ids.length)], x, y });
  }
  return out;
}

export function bridgeH(x0, x1, y, kind = 'stone', under = true) {
  const out = [];
  const end = (x) => (x === x0 ? 'l' : x === x1 ? 'r' : 'm');
  for (let x = x0; x <= x1; x++) {
    out.push({ t: `bridge_${kind}_h_n_${end(x)}`, x, y });
    out.push({ t: `bridge_${kind}_h_s_${end(x)}`, x, y: y + 1 });
    if (under) out.push({ t: `bridge_${kind}_h_${kind === 'stone' ? 'arch' : 'piles'}_${end(x)}`, x, y: y + 2 });
  }
  return out;
}
export function bridgeV(x, y0, y1, kind = 'wood') {
  const out = [];
  const cols = kind === 'stone' ? ['w', 'm', 'e'] : ['w', 'e'];
  for (let y = y0; y <= y1; y++) {
    const r = y === y0 ? 'n' : y === y1 ? 's' : 'm';
    cols.forEach((c, i) => out.push({ t: `bridge_${kind}_v_${r}_${c}`, x: x + i, y }));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ tile database
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** LQ's tile database with the x1 fragment merged the way LQ's pack loader merges it (packs.js mergeTileFragment). */
export function loadLqDb() {
  const tiles = readJson(path.join(LQ, 'assets/tiles/tiles.json'));
  const frag = readJson(path.join(LQ, 'assets/tiles/x1_tiles.json'));
  for (const k of ['terrains', 'walls', 'tiles', 'objects']) {
    tiles[k] = tiles[k] || {};
    for (const [id, v] of Object.entries(frag[k] || {})) if (!(id in tiles[k])) tiles[k][id] = { sheet: 'x1.png', ...v };
  }
  for (const id of frag.terrainOrder || []) if (!tiles.terrainOrder.includes(id)) tiles.terrainOrder.push(id);
  for (const [id, before] of Object.entries(frag.terrainInsertBefore || {})) {
    const ii = tiles.terrainOrder.indexOf(id);
    if (ii < 0 || tiles.terrainOrder.indexOf(before) < 0) continue;
    tiles.terrainOrder.splice(ii, 1);
    tiles.terrainOrder.splice(tiles.terrainOrder.indexOf(before), 0, id);
  }
  const props = readJson(path.join(LQ, 'assets/sprites/props.json'));
  return { tiles, props: props.objects };
}

export function tileCode(db, id) {
  const T = db.tiles;
  if (T.terrains[id]) return T.terrains[id].collision;
  const w = String(id).replace(/_(top|face)$/, '');
  if (w !== id && T.walls[w]) return 'solid';
  if (T.tiles[id]) return T.tiles[id].collision;
  return null;
}

/** Cells a placed object or prop covers: solid ones and the open (door / passable) ones. Same rule as LQ mapcheck. */
export function objectCells(db, t, x, y) {
  const solid = [], open = [];
  const o = db.tiles.objects[t];
  if (o) {
    for (const [dx, dy] of o.footprint || []) solid.push([x + dx, y + dy]);
    if (o.doorAt) open.push([x + o.doorAt[0], y + o.doorAt[1]]);
    return { solid, open, collision: o.collision || 'solid' };
  }
  const p = db.props[t];
  if (p) {
    const [w, h] = p.footprint || [1, 1];
    const pass = new Set((p.passable || []).map(([dx, dy]) => `${x + dx},${y + dy}`));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = [x + i, y - j];
      (pass.has(`${c[0]},${c[1]}`) || p.solid === false ? open : solid).push(c);
    }
    return { solid, open, collision: 'solid' };
  }
  return null;
}

const CODE_CHAR = { none: '.', solid: '#', water: '~', ledge_s: 'v', ledge_e: '>', ledge_w: '<', pit: '#', counter: '#', void: '#' };

/** Collision rows for a map { ground, legend, overlays, decor, solids: [[x, y], ...], open: [[x, y], ...] }. */
export function bakeCollision(map, db) {
  const H = map.ground.length, W = map.ground[0].length;
  const code = Array.from({ length: H }, () => new Array(W).fill('solid'));
  const errors = [];
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x, y, c) => { if (inb(x, y)) code[y][x] = c; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = map.legend[map.ground[y][x]];
    const c = id ? tileCode(db, id) : null;
    if (c == null) { errors.push(`${map.id}: no tile for '${map.ground[y][x]}' at ${x},${y}`); continue; }
    set(x, y, c);
  }
  for (const o of map.overlays || []) {
    const c = tileCode(db, o.t);
    if (c == null) { errors.push(`${map.id}: overlay ${o.t} is not a tile`); continue; }
    const t = db.tiles.tiles[o.t];
    const th = t ? Math.max(1, (t.h || 16) / 16) : 1;
    for (let j = 0; j < th; j++) set(o.x, o.y + j, c);
  }
  for (const d of map.decor || []) {
    const cells = objectCells(db, d.t, d.x, d.y);
    if (cells) {
      for (const [x, y] of cells.solid) set(x, y, cells.collision);
      for (const [x, y] of cells.open) set(x, y, 'none');
    } else if (tileCode(db, d.t) != null) {
      for (let j = 0; j < (d.h || 1); j++) for (let i = 0; i < (d.w || 1); i++) set(d.x + i, d.y + j, tileCode(db, d.t));
    } else errors.push(`${map.id}: decor ${d.t} at ${d.x},${d.y} is neither an object nor a tile`);
  }
  for (const [x, y] of map.solids || []) set(x, y, 'solid');
  for (const [x, y] of map.open || []) set(x, y, 'none');
  if (errors.length) throw new Error(errors.slice(0, 12).join('\n'));
  return code.map((row) => row.map((c) => CODE_CHAR[c] ?? '#').join(''));
}

/** Ids a map uses, for trimming tiles.json. */
export function usedIds(map, into) {
  for (const v of Object.values(map.legend)) into.add(v);
  into.add(map.under);
  for (const k of ['overlays', 'decor', 'overhead']) for (const o of map[k] || []) into.add(o.t);
  return into;
}

// ------------------------------------------------------------------------------------------------ reach (BFS)
const STEP = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const LEDGE = { v: [0, 1], '>': [1, 0], '<': [-1, 0] };

/** Can a walker step from cell a into cell b (4-way, tile level)? Ledges are one-way. */
export function canStep(zone, x, y, dx, dy) {
  const nx = x + dx, ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= zone.w || ny >= zone.h) return false;
  const c = zone.collision[ny][nx];
  if (c === '.') return true;
  const l = LEDGE[c];
  if (l) return l[0] === dx && l[1] === dy;
  return false;
}

/** BFS from (x, y). Returns a Uint8Array (1 = reachable) of w * h. Standing on a ledge cell lets you move on. */
export function reach(zone, sx, sy) {
  const seen = new Uint8Array(zone.w * zone.h);
  const q = [[sx, sy]];
  seen[sy * zone.w + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of STEP) {
      if (!canStep(zone, x, y, dx, dy)) continue;
      const k = (y + dy) * zone.w + (x + dx);
      if (seen[k]) continue;
      seen[k] = 1;
      q.push([x + dx, y + dy]);
    }
  }
  return seen;
}

/** Nearest walkable cell to (x, y) (spiral search), or null. */
export function nearestWalk(zone, x, y, r = 6) {
  for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < zone.w && yy < zone.h && zone.collision[yy][xx] === '.') return [xx, yy];
  }
  return null;
}

export function writeModule(file, header, obj) {
  fs.writeFileSync(file, `${header}\nexport default ${JSON.stringify(obj)};\n`);
}

// ------------------------------------------------------------------------------------------------ decor placement
/**
 * Keeps decor off roads, buildings and each other. `free(x, y)` is true when a 1-cell prop may stand at (x, y):
 * the ground char is one of `soft`, no reserved cell, nothing placed there, and not next to a road char.
 */
export function dresser(c, db, { soft = '.,m', road = '=', roadGap = 1 } = {}) {
  const decor = [], occ = new Set(), reserved = new Set();
  const key = (x, y) => `${x},${y}`;
  const api = {
    decor, occ, reserved,
    reserve(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) reserved.add(key(x, y)); },
    isFree(x, y, gap = roadGap) {
      if (!c.inb(x, y) || reserved.has(key(x, y)) || occ.has(key(x, y))) return false;
      if (!soft.includes(c.at(x, y))) return false;
      if (gap > 0 && c.near(x, y, road, gap)) return false;
      return true;
    },
    /** Place `t` at (x, y), marking every cell it covers. force: skip the free check. */
    add(t, x, y, extra = {}, force = true) {
      const cells = objectCells(db, t, x, y);
      const cover = cells ? [...cells.solid, ...cells.open] : [[x, y]];
      if (!force && !cover.every(([cx, cy]) => api.isFree(cx, cy))) return false;
      for (const [cx, cy] of cover) occ.add(key(cx, cy));
      decor.push({ t, x, y, ...extra });
      return true;
    },
    try(t, x, y, extra = {}) { return api.add(t, x, y, extra, false); },
  };
  return api;
}

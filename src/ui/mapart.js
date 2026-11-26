// Map art "illuminated vellum" (D:\LQOnline\mapart\BRIEF.md, look A, approved by Scott 2026-11-25): the minimap and the
// world map baked from the zone data as a hand-inked vellum map. Pure functions on typed arrays, no DOM: the Web Worker
// (mapart_worker.js) runs them, and the tests run them in Node. Everything is in WORLD tile coordinates, so any chunk
// bakes seam-free on its own and the same chunk always bakes to the same bytes.
//
//   zoneFields(zone)                          the zone's tiles as plain data (terrain names, collision, decor, bridges)
//   prepare(fields)                           tile-level fields, once per zone (blended colours, water depth, roofs...)
//   bakeVellum(P, ppt, tx0, ty0, tw, th)      tiles [tx0, tx0+tw) x [ty0, ty0+th) at ppt px per tile: { w, h, data }
//
// Ported from the brief's prototype baker (D:\LQOnline\mapart\bake.mjs). The look: blended terrain with wandering edges,
// hillshade lit from the north west, ink coastlines and cliff hachures, ripple marks, ink-edged roads, roofed buildings
// with a ridge and a cast shadow, tree canopy stamps, fences and walls as ink lines, a paper mottle and grain.

const PAL = {
  grass: '#8fa85d', tallgrass: '#7a964f', moss: '#7b9a58', x1_moor_turf: '#b0aa77', x1_heath: '#a8977f', x1_bracken: '#bb9c63',
  x1_peat: '#8d7559', dirt: '#e1cb98', plaza: '#d6caa9', sand: '#ddcd9c', cliff_stairs_top: '#cdb88e', cliff_stairs_mid: '#c4ae84',
  cliff_stairs_bot: '#cdb88e', water: '#6f9db3', shallow: '#93bac4', x1_tarn: '#628fab', cliff_top: '#9db06a', cliff_face: '#a08866',
  x1_crag_top: '#bcb592', x1_crag_face: '#9c8b70', ink: '#3b2f55',
  // linear features: the land under them; the line is drawn on top
  fence_wood: '#8fa85d', wall_low: '#8fa85d', x1_drystone: '#b0aa77', ledge_s_a: '#8fa85d', ledge_s_m: '#8fa85d', ledge_s_b: '#8fa85d',
};
const INK = [52, 36, 24], SEPIA = [122, 86, 52], VELLUM = [234, 219, 182];
const ROOFS = [[166, 86, 64], [150, 74, 58], [118, 112, 128], [196, 156, 92], [136, 92, 70]];
const BUILDING = /inn|house|home|bakery|smithy|library|shop|chapel|loomhouse|hut|cottage|watchtower|town_gate|stall/;
const TREE = /tree|willow|pine|oak|bush|gorse/;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const PALRGB = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, hex(v)]));

// deterministic hash noise
const hash2 = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** A game zone ({ w, h, legend, ground, collision, under, regions, decor, overlays }) as plain transferable data. */
export function zoneFields(z) {
  const W = z.w, H = z.h, names = [], idx = new Map(), terr = new Uint16Array(W * H), coll = new Uint8Array(W * H);
  const regs = z.regions || [];
  for (let y = 0; y < H; y++) {
    const row = z.ground[y] || '', col = z.collision[y] || '';
    for (let x = 0; x < W; x++) {
      let t = z.legend[row[x]];
      if (!t) { for (const r of regs) if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && r.under) { t = r.under; break; } }
      t = t || z.under || 'grass';
      let i = idx.get(t);
      if (i == null) { i = names.length; names.push(t); idx.set(t, i); }
      terr[y * W + x] = i;
      coll[y * W + x] = col[x] === '#' ? 1 : 0;
    }
  }
  return {
    w: W, h: H, names, terr, coll,
    decor: (z.decor || []).map((d) => ({ t: d.t, x: d.x, y: d.y, deep: d.deep || 0 })),
    bridges: (z.overlays || []).filter((o) => /bridge/.test(o.t)).map((o) => ({ x: o.x, y: o.y })),
  };
}

function boxBlur(f, W, H, r) {
  const t = new Float32Array(W * H), o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += f[y * W + xx]; n++; } } t[y * W + x] = s / n; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += t[yy * W + x]; n++; } } o[y * W + x] = s / n; }
  return o;
}
function blur3(f, W, H) {
  const t = new Float32Array(W * H), o = new Float32Array(W * H);
  const at = (a, x, y) => a[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t[y * W + x] = (at(f, x - 1, y) + 4 * f[y * W + x] + at(f, x + 1, y)) / 6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = (at(t, x, y - 1) + 4 * t[y * W + x] + at(t, x, y + 1)) / 6;
  return o;
}
// fill the colour of tiles outside `keep` from the nearest tile inside it (so a blend never pulls in a foreign colour)
function spread(R, G, B, keep, W, H) {
  const N = W * H, seen = new Uint8Array(N), q = new Int32Array(N);
  let qn = 0;
  for (let i = 0; i < N; i++) if (keep[i]) { seen[i] = 1; q[qn++] = i; }
  for (let h = 0; h < qn; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx; if (seen[j]) continue; seen[j] = 1; R[j] = R[i]; G[j] = G[i]; B[j] = B[i]; q[qn++] = j;
    }
  }
}

/** Tile-level fields, once per zone (O(tiles)). */
export function prepare(F) {
  const { w: W, h: H } = F, N = W * H;
  const nm = F.names.map((t) => ({
    t, c: PALRGB[t] || PALRGB.grass, water: /water|shallow|tarn/.test(t), road: /dirt|plaza|stairs/.test(t),
    top: /cliff_top|crag_top|stairs_top/.test(t), face: /face|stairs_mid/.test(t), ink: t === 'ink',
    hardSolid: /cliff|crag|water|shallow|tarn|fence|wall|drystone|ink/.test(t),
    fence: /fence|wall_low|drystone/.test(t), ledge: /ledge_s/.test(t),
    grassy: /tallgrass|bracken|heath|peat/.test(t),
    tuft: /heath/.test(t) ? [128, 98, 116] : /bracken/.test(t) ? [140, 102, 52] : /peat/.test(t) ? [98, 78, 58] : [96, 120, 62],
  }));
  const at = (i) => nm[F.terr[i]];
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  const water = new Float32Array(N), road = new Float32Array(N), top = new Float32Array(N), face = new Float32Array(N), inkF = new Float32Array(N), height = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const n = at(i);
    R[i] = n.c[0]; G[i] = n.c[1]; B[i] = n.c[2];
    water[i] = n.water ? 1 : 0; road[i] = n.road ? 1 : 0; top[i] = n.top ? 1 : 0; face[i] = n.face ? 1 : 0; inkF[i] = n.ink ? 1 : 0;
    height[i] = top[i] ? 1 : face[i] ? 0.5 : water[i] ? -0.3 : 0;
  }
  const hgt = boxBlur(boxBlur(height, W, H, 1), W, H, 1);
  const LR = R.slice(), LG = G.slice(), LB = B.slice(), RR = R.slice(), RG = G.slice(), RB = B.slice(), WR = R.slice(), WG = G.slice(), WB = B.slice();
  const isLand = new Uint8Array(N); for (let i = 0; i < N; i++) isLand[i] = !water[i] && !road[i] ? 1 : 0;
  spread(LR, LG, LB, isLand, W, H); spread(RR, RG, RB, road, W, H); spread(WR, WG, WB, water, W, H);
  const waterS = blur3(water, W, H), roadS = blur3(road, W, H), topS = blur3(top, W, H), faceS = blur3(face, W, H), inkS = blur3(inkF, W, H);
  // distance into water (tiles): the depth tint, the inner waterline and where ripples may go
  const wdist = new Float32Array(N).fill(99), q = new Int32Array(N * 4);
  let qn = 0;
  for (let i = 0; i < N; i++) if (!water[i]) { wdist[i] = 0; q[qn++] = i; }
  for (let h = 0; h < qn; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx; if (wdist[j] > wdist[i] + 1) { wdist[j] = wdist[i] + 1; if (qn < q.length) q[qn++] = j; }
    }
  }
  // buildings: solid components of walkable-looking ground that hold a building's anchor
  const solid = (x, y) => F.coll[y * W + x] === 1 && !at(y * W + x).hardSolid;
  const comp = new Int32Array(N).fill(-1); const comps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (comp[y * W + x] >= 0 || !solid(x, y)) continue;
    const id = comps.length, cells = [], st = [[x, y]]; comp[y * W + x] = id;
    while (st.length) {
      const [cx, cy] = st.pop(); cells.push([cx, cy]);
      for (const [dx, dy] of N4) {
        const xx = cx + dx, yy = cy + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (comp[yy * W + xx] < 0 && solid(xx, yy)) { comp[yy * W + xx] = id; st.push([xx, yy]); }
      }
    }
    comps.push({ cells, house: false });
  }
  for (const d of F.decor) {
    if (!BUILDING.test(d.t)) continue;
    for (const [dx, dy] of [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]]) {
      const x = d.x + dx, y = d.y + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = comp[y * W + x]; if (c >= 0) { comps[c].house = true; break; }
    }
  }
  const roof = new Float32Array(N), roofId = new Int32Array(N).fill(-1);
  const houses = [];
  for (const c of comps) {
    if (!c.house || c.cells.length > 400) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const [x, y] of c.cells) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { roof[y * W + x] = 1; roofId[y * W + x] = houses.length; }
    houses.push({ x0, y0, x1: x1 + 1, y1: y1 + 1, col: ROOFS[(hash2(x0, y0, 7) * ROOFS.length) | 0] });
  }
  // linear features
  const fences = [], ledges = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ti = F.terr[y * W + x], n = nm[ti];
    if (n.fence) {
      if (x + 1 < W && F.terr[y * W + x + 1] === ti) fences.push([x + 0.5, y + 0.5, x + 1.5, y + 0.5, n.t]);
      if (y + 1 < H && F.terr[(y + 1) * W + x] === ti) fences.push([x + 0.5, y + 0.5, x + 0.5, y + 1.5, n.t]);
      fences.push([x + 0.5, y + 0.5, x + 0.5, y + 0.5, n.t]);
    }
    if (n.ledge) ledges.push([x, y + 0.85, x + 1, y + 0.85]);
  }
  const trees = F.decor.filter((d) => TREE.test(d.t)).sort((a, b) => a.y - b.y || a.x - b.x);
  return { W, H, nm, terr: F.terr, LR, LG, LB, RR, RG, RB, WR, WG, WB, water: waterS, road: roadS, top: topS, face: faceS, inkF: inkS, hgt, wdist, roof, roofId, houses, fences, ledges, trees, bridges: F.bridges };
}

// bilinear sample of a tile field at continuous tile coords (tile centres at x + 0.5)
function bil(f, W, H, x, y) {
  x -= 0.5; y -= 0.5;
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = xi < 0 ? 0 : xi >= W ? W - 1 : xi, x1 = xi + 1 < 0 ? 0 : xi + 1 >= W ? W - 1 : xi + 1;
  const y0 = yi < 0 ? 0 : yi >= H ? H - 1 : yi, y1 = yi + 1 < 0 ? 0 : yi + 1 >= H ? H - 1 : yi + 1;
  const a = f[y0 * W + x0], b = f[y0 * W + x1], c = f[y1 * W + x0], d = f[y1 * W + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** Bake tiles [tx0, tx0+tw) x [ty0, ty0+th) at ppt px per tile. Returns { w, h, data } (RGBA, opaque). */
export function bakeVellum(P, ppt, tx0, ty0, tw, th) {
  const { W, H } = P;
  const w = Math.max(1, Math.round(tw * ppt)), h = Math.max(1, Math.round(th * ppt)), n = w * h;
  const r = new Float32Array(n), gg = new Float32Array(n), b = new Float32Array(n);
  const fw = new Float32Array(n), fr = new Float32Array(n), ft = new Float32Array(n), ff = new Float32Array(n), fi = new Float32Array(n), fro = new Float32Array(n), fd = new Float32Array(n);
  const lw = Math.max(0.8, ppt / 11);                   // ink line width in px
  // pass 1: fields and base colour
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const wx = tx0 + (px + 0.5) / ppt, wy = ty0 + (py + 0.5) / ppt, i = py * w + px;
    const ox = (vnoise(wx / 2.6, wy / 2.6, 1) - 0.5) * 0.62 + (vnoise(wx * 1.1, wy * 1.1, 3) - 0.5) * 0.2;
    const oy = (vnoise(wx / 2.6, wy / 2.6, 2) - 0.5) * 0.62 + (vnoise(wx * 1.1, wy * 1.1, 4) - 0.5) * 0.2;
    const ux = wx + ox, uy = wy + oy;
    const wv = bil(P.water, W, H, ux, uy), rv = bil(P.road, W, H, ux, uy);
    let cr = bil(P.LR, W, H, ux, uy), cg = bil(P.LG, W, H, ux, uy), cb = bil(P.LB, W, H, ux, uy);
    const kr = sstep(0.34, 0.46, rv);
    if (kr > 0) { cr += (bil(P.RR, W, H, ux, uy) - cr) * kr; cg += (bil(P.RG, W, H, ux, uy) - cg) * kr; cb += (bil(P.RB, W, H, ux, uy) - cb) * kr; }
    const kw = sstep(0.34, 0.46, wv);
    if (kw > 0) { cr += (bil(P.WR, W, H, ux, uy) - cr) * kw; cg += (bil(P.WG, W, H, ux, uy) - cg) * kw; cb += (bil(P.WB, W, H, ux, uy) - cb) * kw; }
    const ro = bil(P.roof, W, H, wx, wy);               // roofs are built: no warp
    fw[i] = wv; fr[i] = rv; ft[i] = bil(P.top, W, H, ux, uy); ff[i] = bil(P.face, W, H, ux, uy); fi[i] = bil(P.inkF, W, H, ux, uy); fro[i] = ro;
    // hillshade from the blurred height, light from the north west
    const e = 0.35;
    const hx = bil(P.hgt, W, H, wx + e, wy) - bil(P.hgt, W, H, wx - e, wy);
    const hy = bil(P.hgt, W, H, wx, wy + e) - bil(P.hgt, W, H, wx, wy - e);
    let sh = 1 + Math.max(-0.28, Math.min(0.22, -(hx + hy) * 0.55));
    // water: deeper is darker and cooler, a pale inner band along the shore
    if (kw > 0.5) {
      const d = bil(P.wdist, W, H, ux, uy);
      const deep = Math.min(1, Math.max(0, (d - 0.6) / 3));
      cr -= 16 * deep; cg -= 10 * deep; cb -= 2 * deep;
      sh = 1;
      fd[i] = d;
    }
    // building shadow to the south east
    if (ro < 0.5 && bil(P.roof, W, H, wx - 0.28, wy - 0.34) > 0.5) sh *= 0.8;
    r[i] = cr * sh; gg[i] = cg * sh; b[i] = cb * sh;
    // roofs: two pitches, the half toward the light is lighter
    if (ro > 0.02) {
      const tx = Math.floor(wx), ty = Math.floor(wy);
      const id = tx >= 0 && ty >= 0 && tx < W && ty < H ? P.roofId[ty * W + tx] : -1;
      const hs = id >= 0 ? P.houses[id] : null;
      if (hs) {
        const k = sstep(0.4, 0.6, ro);
        const long = hs.x1 - hs.x0 >= hs.y1 - hs.y0;
        const lit = long ? wy < (hs.y0 + hs.y1) / 2 : wx < (hs.x0 + hs.x1) / 2;
        const m = lit ? 1.08 : 0.86;
        r[i] = r[i] * (1 - k) + hs.col[0] * m * k; gg[i] = gg[i] * (1 - k) + hs.col[1] * m * k; b[i] = b[i] * (1 - k) + hs.col[2] * m * k;
      }
    }
  }
  // pass 2: ink lines on isolines (coastline, road edges, cliff tops, ink pools, roof outlines)
  const line = (f, i, px, py, level, width, col, alpha) => {
    const xm = px > 0 ? f[i - 1] : f[i], xp = px < w - 1 ? f[i + 1] : f[i], ym = py > 0 ? f[i - w] : f[i], yp = py < h - 1 ? f[i + w] : f[i];
    const gx = (xp - xm) / 2, gy = (yp - ym) / 2, gm = Math.hypot(gx, gy);
    if (gm < 1e-4) return;
    const d = Math.abs(f[i] - level) / gm;
    const a = Math.min(1, Math.max(0, width / 2 + 0.5 - d)) * alpha;
    if (a <= 0) return;
    r[i] += (col[0] - r[i]) * a; gg[i] += (col[1] - gg[i]) * a; b[i] += (col[2] - b[i]) * a;
  };
  const SHORE = [214, 230, 230], INKPOOL = [249, 215, 122];
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const i = py * w + px;
    // cliff faces: ink hachures running down the slope
    if (ff[i] > 0.4) {
      const wx = tx0 + (px + 0.5) / ppt, wy = ty0 + (py + 0.5) / ppt;
      const col = Math.floor(wx * 3.2);
      const xin = wx * 3.2 - col;
      if (Math.abs(xin - 0.5) < 0.5 * Math.min(1, lw / (ppt / 3.2)) && hash2(col, Math.floor(wy), 11) > 0.15) {
        const a = 0.55 * sstep(0.4, 0.6, ff[i]);
        r[i] += (INK[0] - r[i]) * a; gg[i] += (INK[1] - gg[i]) * a; b[i] += (INK[2] - b[i]) * a;
      }
    }
    line(fr, i, px, py, 0.4, lw * 0.9, SEPIA, 0.55);
    line(ft, i, px, py, 0.4, lw * 1.3, INK, 0.85);
    line(fw, i, px, py, 0.4, lw * 1.3, INK, 0.9);
    if (fw[i] > 0.4) line(fd, i, px, py, 1.5, lw * 0.8, SHORE, 0.5);
    line(fi, i, px, py, 0.4, lw * 1.2, INKPOOL, 0.7);
    line(fro, i, px, py, 0.5, lw * 1.2, INK, 0.95);
  }
  // pass 3: stamps (ripples, bridges, fences, ledges, ridges, tufts, trees), anti-aliased shapes
  const S = { w, h, r, g: gg, b, ppt, tx0, ty0 };
  const inView = (x, y, m) => x >= tx0 - m && y >= ty0 - m && x < tx0 + tw + m && y < ty0 + th + m;
  const RIP = [226, 236, 232];
  for (let ty = Math.max(0, ty0 - 1); ty < Math.min(H, ty0 + th + 1); ty++) for (let tx = Math.max(0, tx0 - 1); tx < Math.min(W, tx0 + tw + 1); tx++) {
    const wd = P.wdist[ty * W + tx];
    if (wd < 2 || wd > 90 || hash2(tx, ty, 21) > 0.3) continue;
    const cx = tx + 0.2 + hash2(tx, ty, 22) * 0.6, cy = ty + 0.3 + hash2(tx, ty, 23) * 0.5, s = 0.28;
    seg(S, cx - s, cy, cx - s / 2, cy - s * 0.35, lw * 0.9, RIP, 0.75);
    seg(S, cx - s / 2, cy - s * 0.35, cx, cy, lw * 0.9, RIP, 0.75);
    seg(S, cx, cy, cx + s / 2, cy - s * 0.35, lw * 0.9, RIP, 0.75);
    seg(S, cx + s / 2, cy - s * 0.35, cx + s, cy, lw * 0.9, RIP, 0.75);
  }
  for (const o of P.bridges) {
    if (!inView(o.x, o.y, 2)) continue;
    rect(S, o.x - 0.02, o.y + 0.12, 1.04, 0.76, [196, 168, 122], 1);
    seg(S, o.x, o.y + 0.12, o.x + 1, o.y + 0.12, lw, INK, 0.9); seg(S, o.x, o.y + 0.88, o.x + 1, o.y + 0.88, lw, INK, 0.9);
    for (let k = 0.25; k < 1; k += 0.25) seg(S, o.x + k, o.y + 0.16, o.x + k, o.y + 0.84, lw * 0.6, SEPIA, 0.6);
  }
  const STONE = [150, 138, 116], WALL = [104, 96, 86], FENCE = [92, 60, 34];
  for (const [x0, y0, x1, y1, t] of P.fences) {
    if (!inView(x0, y0, 2)) continue;
    if (/drystone/.test(t)) { disc(S, x0, y0, 0.16, STONE, 1, lw * 0.8); continue; }
    const wall = /wall/.test(t);
    seg(S, x0, y0, x1, y1, lw * (wall ? 1.9 : 1.5), wall ? WALL : FENCE, 1);
  }
  for (const [x0, y0, x1, y1] of P.ledges) if (inView(x0, y0, 2)) seg(S, x0 + 0.1, y0, x1 - 0.1, y1, lw * 1.1, INK, 0.7);
  for (const hs of P.houses) {
    if (!inView(hs.x0, hs.y0, 12)) continue;
    if (hs.x1 - hs.x0 >= hs.y1 - hs.y0) { const yy = (hs.y0 + hs.y1) / 2; seg(S, hs.x0 + 0.35, yy, hs.x1 - 0.35, yy, lw * 1.1, INK, 0.75); }
    else { const xx = (hs.x0 + hs.x1) / 2; seg(S, xx, hs.y0 + 0.35, xx, hs.y1 - 0.35, lw * 1.1, INK, 0.75); }
  }
  for (let ty = Math.max(0, ty0 - 1); ty < Math.min(H, ty0 + th + 1); ty++) for (let tx = Math.max(0, tx0 - 1); tx < Math.min(W, tx0 + tw + 1); tx++) {
    const nmt = P.nm[P.terr[ty * W + tx]];
    if (!nmt.grassy) continue;
    for (let k = 0; k < 2; k++) {
      if (hash2(tx, ty, 50 + k) > 0.7) continue;
      const cx = tx + 0.15 + hash2(tx, ty, 52 + k) * 0.7, cy = ty + 0.25 + hash2(tx, ty, 54 + k) * 0.6, s = 0.14;
      seg(S, cx - s, cy - s, cx, cy, lw * 0.8, nmt.tuft, 0.7); seg(S, cx, cy, cx + s, cy - s * 1.3, lw * 0.8, nmt.tuft, 0.7);
    }
  }
  const SHADE = [40, 52, 30];
  for (const d of P.trees) {
    if (!inView(d.x, d.y, 3)) continue;
    const big = /willow/.test(d.t) ? 1.45 : /oak|fallen/.test(d.t) ? 1.15 : /pine/.test(d.t) ? (d.deep ? 1.05 + hash2(d.x, d.y, 33) * 0.3 : 0.78) : 0.45;
    const jit = d.deep ? 0.9 : 0.3;
    const cx = d.x + 0.5 + (hash2(d.x, d.y, 31) - 0.5) * jit, cy = d.y + 0.35 + (hash2(d.x, d.y, 32) - 0.5) * jit;
    const base = /gorse/.test(d.t) ? [176, 160, 70] : /willow/.test(d.t) ? [120, 146, 84] : /pine/.test(d.t) ? (d.deep ? [84, 112, 72] : [96, 126, 78]) : /bush/.test(d.t) ? [112, 140, 82] : [104, 134, 80];
    disc(S, cx + big * 0.22, cy + big * 0.28, big, SHADE, 0.28, 0);
    disc(S, cx, cy, big, base, 1, lw * 1.05);
    disc(S, cx - big * 0.28, cy - big * 0.3, big * 0.5, [Math.min(255, base[0] + 34), Math.min(255, base[1] + 34), Math.min(255, base[2] + 34)], 0.85, 0);
  }
  // pass 4: paper (a slow mottle and a fine grain, a touch of vellum over all)
  const data = new Uint8ClampedArray(n * 4);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const i = py * w + px, wx = tx0 + (px + 0.5) / ppt, wy = ty0 + (py + 0.5) / ppt;
    const mott = 1 + (vnoise(wx / 7, wy / 7, 41) - 0.5) * 0.09;
    const gr = (hash2(Math.round(wx * ppt), Math.round(wy * ppt), 43) - 0.5) * 7;
    const o = i * 4;
    data[o] = r[i] * mott * 0.94 + VELLUM[0] * 0.06 + gr;
    data[o + 1] = gg[i] * mott * 0.94 + VELLUM[1] * 0.06 + gr;
    data[o + 2] = b[i] * mott * 0.94 + VELLUM[2] * 0.06 + gr;
    data[o + 3] = 255;
  }
  return { w, h, data };
}

// anti-aliased shapes on the float buffers, in world tile coordinates
function blend(S, x, y, col, a) {
  if (x < 0 || y < 0 || x >= S.w || y >= S.h || a <= 0) return;
  const i = y * S.w + x;
  S.r[i] += (col[0] - S.r[i]) * a; S.g[i] += (col[1] - S.g[i]) * a; S.b[i] += (col[2] - S.b[i]) * a;
}
function disc(S, cx, cy, rad, col, alpha, outline) {
  const X = (cx - S.tx0) * S.ppt, Y = (cy - S.ty0) * S.ppt, R = rad * S.ppt;
  for (let y = Math.max(0, Math.floor(Y - R - 2)); y <= Math.min(S.h - 1, Math.ceil(Y + R + 2)); y++) for (let x = Math.max(0, Math.floor(X - R - 2)); x <= Math.min(S.w - 1, Math.ceil(X + R + 2)); x++) {
    const d = Math.hypot(x + 0.5 - X, y + 0.5 - Y);
    const cov = Math.min(1, Math.max(0, R + 0.5 - d));
    if (cov <= 0) continue;
    blend(S, x, y, col, cov * alpha);
    if (outline > 0) { const oa = Math.min(1, Math.max(0, outline / 2 + 0.5 - Math.abs(d - (R - outline / 2)))); blend(S, x, y, INK, oa * 0.9); }
  }
}
function rect(S, x0, y0, ww, hh, col, alpha) {
  const X0 = (x0 - S.tx0) * S.ppt, Y0 = (y0 - S.ty0) * S.ppt, X1 = X0 + ww * S.ppt, Y1 = Y0 + hh * S.ppt;
  for (let y = Math.max(0, Math.floor(Y0)); y < Math.min(S.h, Math.ceil(Y1)); y++) for (let x = Math.max(0, Math.floor(X0)); x < Math.min(S.w, Math.ceil(X1)); x++) {
    const cx = Math.min(1, Math.max(0, Math.min(x + 1, X1) - Math.max(x, X0))), cy = Math.min(1, Math.max(0, Math.min(y + 1, Y1) - Math.max(y, Y0)));
    blend(S, x, y, col, cx * cy * alpha);
  }
}
function seg(S, x0, y0, x1, y1, width, col, alpha) {
  const ax = (x0 - S.tx0) * S.ppt, ay = (y0 - S.ty0) * S.ppt, bx = (x1 - S.tx0) * S.ppt, by = (y1 - S.ty0) * S.ppt;
  const m = width + 2;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
  const ya = Math.max(0, Math.floor(Math.min(ay, by) - m)), yb = Math.min(S.h - 1, Math.ceil(Math.max(ay, by) + m));
  const xa = Math.max(0, Math.floor(Math.min(ax, bx) - m)), xb = Math.min(S.w - 1, Math.ceil(Math.max(ax, bx) + m));
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const px = x + 0.5, py = y + 0.5;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    blend(S, x, y, col, Math.min(1, Math.max(0, width / 2 + 0.5 - d)) * alpha);
  }
}

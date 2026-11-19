// Minimap and world-map imagery, drawn from zone data (static content, not the sim): one colour per tile from the
// ground legend, solid tiles darkened, trees from the decor list. 3 px per tile on the minimap (about the mockup's
// 1/6 scale of the real map), larger on the world map. Cached per zone and scale.

const TERRAIN = {
  grass: '#4f8f3a', tallgrass: '#3f7d33', dirt: '#9a7148', plaza: '#a49c8e', sand: '#d6c08a', water: '#3a6fc4',
  shallow: '#5b94d4', ink: '#2a2440', fence_wood: '#7a5532', wall_low: '#8a8478', cliff_top: '#5f8540', cliff_face: '#6b5646',
  cliff_stairs_top: '#9a8a70', cliff_stairs_mid: '#9a8a70', cliff_stairs_bot: '#9a8a70', ledge_s_a: '#4a7a32', ledge_s_m: '#4a7a32', ledge_s_b: '#4a7a32',
};
const SOLID = '#4a3a34', TREE = '#24502a', TREE_HI = '#3a6e34', BRIDGE = '#b0a38a';

export function createMinimapBook(zones, makeCanvas) {
  const cache = new Map();
  const mk = makeCanvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
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
  return { image, zone: (id) => zones[id] || null };
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

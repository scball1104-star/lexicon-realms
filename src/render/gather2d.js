// Gathering nodes in 2D (professions build step 1, D:\LQOnline\professions\BRIEF.md section 5): an ore seam is a small
// grey rock with metal flecks in the ore's colour, a herb is a tuft in its flower's colour; both carry the white
// sparkle pixel that says "you can use this". Code-drawn pixels, cached per look (PLACEHOLDER art).
//
//   gatherItems(e, x, y, now)   y-sorted draw items [{ sortY, draw(g, cam), pick }] for a node (render/objects.js)
const ORE = { gather_tin: ['#b8c4cc', '#ffffff'], gather_iron: ['#c97a4a', '#ffd8a8'], gather_ink: ['#8a5cff', '#d8c0ff'],
  gather_lampsilver: ['#e8ecd0', '#ffffff'], gather_ember: ['#ff7040', '#ffd0a0'] };
const HERB = { gather_wayleaf: ['#5aa040', '#b8f080'], gather_mallow: ['#c86ab8', '#ffc8f0'], gather_gloamcap: ['#4a7ad0', '#b0e0ff'],
  gather_inkthorn: ['#3a3050', '#a890ff'], gather_moorstar: ['#d8b030', '#fff0a0'] };

const cache = new Map();
function art(key, w, h, paint) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  paint(px);
  cache.set(key, c);
  return c;
}
function oreArt(sprite) {
  const [m, l] = ORE[sprite] || ORE.gather_iron;
  return art(`ore|${sprite}`, 14, 11, (px) => {
    for (let y = 0; y < 11; y++) for (let x = 0; x < 14; x++) {
      const d = Math.hypot((x - 6.5) / 6.6, (y - 6) / 5);
      if (d > 1) continue;
      px(x, y, d > 0.84 ? '#1e1a24' : y < 4 ? '#9a958c' : y < 7 ? '#7d7870' : '#615c56');
    }
    // metal flecks and crystals in the ore's colour
    for (const [x, y] of [[4, 4], [5, 3], [8, 5], [9, 4], [6, 7], [10, 7], [3, 7]]) px(x, y, m);
    for (const [x, y] of [[5, 2], [9, 3], [3, 6]]) px(x, y, l);
  });
}
function herbArt(sprite) {
  const [m, l] = HERB[sprite] || HERB.gather_wayleaf;
  const leaf = '#3e7a2e', dark = '#24481c';
  return art(`herb|${sprite}`, 13, 12, (px) => {
    for (const [x, y] of [[6, 11], [6, 10], [6, 9], [5, 8], [7, 8], [4, 7], [8, 7], [3, 6], [9, 6], [6, 8], [6, 7]]) px(x, y, leaf);
    for (const [x, y] of [[2, 7], [10, 7], [4, 9], [8, 9], [5, 11], [7, 11]]) px(x, y, dark);
    for (const [x, y] of [[6, 3], [5, 4], [7, 4], [6, 5], [3, 4], [2, 5], [4, 5], [9, 4], [10, 5], [8, 5]]) px(x, y, m);
    for (const [x, y] of [[6, 4], [3, 5], [9, 5]]) px(x, y, l);
  });
}

/** Draw items for a gathering node (render/objects.js hands nodes with node.gather here). */
export function gatherItems(e, x, y, now) {
  const ix = Math.round(x), iy = Math.round(y);
  const herb = e.node.gather.kind === 'herb';
  const a = herb ? herbArt(e.sprite) : oreArt(e.sprite);
  const ox = Math.floor(a.width / 2), oy = a.height - 1;
  const seed = e.id % 7;
  return [{
    sortY: iy,
    draw(g, cam) {
      g.drawImage(a, ix - ox - cam.x, iy - oy - cam.y);
      // the sparkle: a white pixel that flares into a small cross every couple of seconds
      const k = (now * 0.55 + seed * 0.17) % 1;
      const sx = ix - ox + (herb ? 9 : 10) - cam.x, sy = iy - oy + (herb ? 2 : 1) - cam.y;
      g.fillStyle = '#ffffff';
      if (k < 0.14) { const s = k < 0.05 || k > 0.1 ? 1 : 2; g.fillRect(sx, sy - s, 1, s * 2 + 1); g.fillRect(sx - s, sy, s * 2 + 1, 1); }
      else g.fillRect(sx, sy, 1, 1);
    },
    pick: { x: ix - ox - 2, y: iy - oy - 4, w: a.width + 4, h: a.height + 6 },
  }];
}

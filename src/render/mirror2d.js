// The free mirror in 2D (wave 6 customization kit): a small standing oval mirror in a wooden frame, whole pixels, with a
// slow glint across the glass so it reads as something to use. y-sorted with the actors like the Lantern Chest.
//
//   mirrorItems(e, x, y, now) -> [{ sortY, draw(g, cam), pick }]

let art = null;
function mirrorArt() {
  if (art) return art;
  const c = document.createElement('canvas'); c.width = 14; c.height = 24;
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  // the oval (rows 1 to 15): frame, then glass
  for (let y = 0; y < 16; y++) for (let x = 0; x < 14; x++) {
    const dx = (x - 6.5) / 5.6, dy = (y - 7.5) / 7.6, r = dx * dx + dy * dy;
    if (r > 1.05) continue;
    if (r > 0.62) px(x, y, r > 0.86 ? '#3a2414' : '#7a4e2a');
    else px(x, y, y < 7 ? '#b8d0dc' : '#8eaabb');
  }
  px(6, 0, '#e0b040'); px(7, 0, '#e0b040');                       // the gilt crown
  // the stand: two legs and a cross foot
  g.fillStyle = '#5a3a20'; g.fillRect(2, 9, 1, 14); g.fillRect(11, 9, 1, 14); g.fillRect(1, 22, 12, 1);
  g.fillStyle = '#3a2414'; g.fillRect(1, 23, 12, 1);
  art = c;
  return art;
}

export function mirrorItems(e, x, y, now) {
  const ix = Math.round(x), iy = Math.round(y);
  const it = {
    sortY: iy,
    draw(g, cam) {
      const sx = ix - cam.x, sy = iy - cam.y;
      g.drawImage(mirrorArt(), sx - 7, sy - 23);
      // a glint sweeps the glass every few seconds
      const k = ((now * 0.35 + e.id * 0.13) % 1) * 3;
      if (k < 1) { const gx = Math.round(sx - 4 + k * 8); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(gx, sy - 20, 1, 4); g.fillRect(gx + 1, sy - 17, 1, 3); }
    },
    pick: { x: ix - 7, y: iy - 23, w: 14, h: 24 },
  };
  return [it];
}

// Riddle stones in 2D (wave 9 riddles; sim in src/sim/riddles.js, 3D look in src/render3d/riddle3d.js). Whole pixels,
// y-sorted with the actors like a word door's found letter.
//
//   riddleItems(e, x, y, now) -> [{ sortY, draw(g, cam), pick }]   a small grey waystone, a violet "?", a ribbon
export function riddleItems(e, x, y, now) {
  const ix = Math.round(x), iy = Math.round(y);
  return [{
    sortY: iy,
    draw(g, cam) {
      const sx = ix - cam.x, sy = iy - cam.y;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(sx - 6, sy - 1, 13, 2);
      g.fillStyle = '#5d6470'; g.fillRect(sx - 5, sy - 15, 10, 15); g.fillRect(sx - 4, sy - 17, 8, 2); g.fillRect(sx - 2, sy - 18, 4, 1);
      g.fillStyle = '#737b88'; g.fillRect(sx - 5, sy - 15, 1, 15);
      g.fillStyle = '#7a3fb8'; g.fillRect(sx - 5, sy - 5, 10, 2); g.fillRect(sx + 3, sy - 3, 1, 3);
      g.font = 'bold 8px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#c9a4ff'; g.fillText('?', sx, sy - 10.5);
      if (Math.floor(now * 2 + e.id) % 3 === 0) { g.fillStyle = '#e8d8ff'; g.fillRect(sx + 4, sy - 17, 1, 1); }
    },
    pick: { x: ix - 7, y: iy - 19, w: 14, h: 20 },
  }];
}

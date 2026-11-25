// Word doors in 2D (wave 8 glyphdoor; sim in src/sim/worddoor.js, 3D look in src/render3d/worddoor3d.js). Whole pixels,
// y-sorted with the actors like the mirror.
//
//   wordDoorItems(e, x, y, now) -> [{ sortY, draw(g, cam), pick }]
//     e.wdoor: the slab. The entity stands on the Fold Hall tile under the door (the sim needs it there for reach); the
//              slab fills the 2-wide passage above it (3 tiles), a row of letter cuts across it, gold where a letter is
//              set, pale blue where the slab lights a hint. Open: the slab is gone, a worn threshold is left.
//     e.wstone: a found letter lying in the copy: a chip of grey lintel stone with its letter and a soft glint.
const T = 16;

function letter(g, L, cx, cy, col) {
  g.font = 'bold 7px Georgia, "Times New Roman", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = col; g.fillText(L, cx, cy + 0.5);
}

function slabItems(e, x, y, now) {
  const W = e.wdoor || {};
  const ix = Math.round(x), iy = Math.round(y);
  const n = W.len || 5, w = 2 * T, h = 3 * T;
  const left = ix - T, top = iy - T - h + 1;       // the passage: the 3 rows above the tile the entity stands on
  const it = {
    sortY: iy - T,
    draw(g, cam) {
      const sx = left - cam.x, sy = top - cam.y;
      if (W.open) {
        // the slab has sunk: a dark worn sill across the doorway, the lintel line lit
        g.fillStyle = 'rgba(20,16,14,0.55)'; g.fillRect(sx, sy + h - 3, w, 3);
        g.fillStyle = '#ffcf5a'; g.fillRect(sx + 6, sy + 1, w - 12, 1);
        return;
      }
      g.fillStyle = '#3a3835'; g.fillRect(sx - 1, sy, w + 2, h);            // the jambs' shadow
      g.fillStyle = '#55524d'; g.fillRect(sx, sy + 1, w, h - 1);           // the slab
      g.fillStyle = '#6a665f'; g.fillRect(sx, sy + 1, w, 1);
      g.fillStyle = '#3a3631'; g.fillRect(sx + 6, sy + 4, w - 12, 1);      // the thirteenth line, blank
      // the cuts
      const cw = Math.max(4, Math.floor((w - 4) / n) - 1);
      const x0 = sx + Math.floor((w - (n * cw + (n - 1))) / 2), cy = sy + Math.floor(h * 0.45);
      const lit = String(W.lit || '');
      for (let i = 0; i < n; i++) {
        const cx = x0 + i * (cw + 1);
        const s = (W.slots || [])[i];
        g.fillStyle = '#1d1b1a'; g.fillRect(cx, cy, cw, 9);
        if (s) { g.fillStyle = 'rgba(255,207,90,0.25)'; g.fillRect(cx, cy, cw, 9); letter(g, s.letter, cx + cw / 2, cy + 4.5, '#ffcf5a'); }
        else if (lit[i]) letter(g, lit[i], cx + cw / 2, cy + 4.5, '#cfd8ff');
      }
      // a slow shimmer over the cuts so it reads as something to touch
      const k = ((now * 0.3 + e.id * 0.17) % 1) * 3;
      if (k < 1) { g.fillStyle = 'rgba(255,240,200,0.5)'; g.fillRect(Math.round(x0 + k * (w - 8)), cy - 2, 1, 13); }
    },
    pick: { x: left, y: top, w, h },
  };
  return [it];
}

function stoneItems(e, x, y, now) {
  const L = (e.wstone && e.wstone.letter) || '?';
  const ix = Math.round(x), iy = Math.round(y);
  const it = {
    sortY: iy,
    draw(g, cam) {
      const sx = ix - cam.x, sy = iy - cam.y;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(sx - 5, sy - 1, 11, 2);
      g.fillStyle = '#55524d'; g.fillRect(sx - 5, sy - 8, 10, 8);
      g.fillStyle = '#6a665f'; g.fillRect(sx - 5, sy - 8, 10, 1);
      letter(g, L, sx, sy - 4, '#ffcf5a');
      if (Math.floor(now * 2 + e.id) % 4 === 0) { g.fillStyle = '#fff7d6'; g.fillRect(sx + 3, sy - 10, 1, 1); }
    },
    pick: { x: ix - 7, y: iy - 12, w: 14, h: 13 },
  };
  return [it];
}

export function wordDoorItems(e, x, y, now) {
  return e.wdoor ? slabItems(e, x, y, now) : stoneItems(e, x, y, now);
}

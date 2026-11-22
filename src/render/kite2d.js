// The Lantern Kite in 2D (big world piece 1, 2026-11-22): a small pixel bird under a flying hero, wings beating, and the
// hero lifted off the ground above their shadow (src/render/renderer.js draws it; the rules are src/sim/travel.js).
//
//   flyLift(e) -> px the sprite is lifted (0 on the ground)      drawKite2d(g, x, y, now, k)  x, y: the hero's feet on screen

export const KITE_LIFT_PX = 26;
export function flyLift(e) {
  if (!e || !e.flight) return 0;
  const t = Math.max(0, Math.min(1, e.flight.up || 0));
  return Math.round(KITE_LIFT_PX * t * t * (3 - 2 * t));
}
export function drawKite2d(g, x, y, now, k = 1) {
  const X = Math.round(x), Y = Math.round(y);
  const flap = Math.round((Math.sin(now * 7) * 3 + 1) * k);          // wing tips up and down
  const body = '#b98d48', cream = '#cdb98e', ink = '#1f2c55', dark = '#3b2a1c';
  // wings: a stepped span either side, ink-blue tips
  for (let i = 0; i < 9; i++) {
    const dy = Math.round((i / 8) * flap) - Math.floor(i / 4);
    g.fillStyle = i > 6 ? ink : body;
    g.fillRect(X - 5 - i * 2, Y - 2 + dy, 2, 3);
    g.fillRect(X + 4 + i * 2, Y - 2 + dy, 2, 3);
  }
  // body, breast, head, tail
  g.fillStyle = body; g.fillRect(X - 5, Y - 4, 10, 6);
  g.fillStyle = cream; g.fillRect(X - 3, Y - 2, 6, 4);
  g.fillStyle = body; g.fillRect(X - 2, Y - 8, 4, 4);
  g.fillStyle = '#e0a030'; g.fillRect(X - 1, Y - 10, 2, 2);
  g.fillStyle = ink; g.fillRect(X - 3, Y + 2, 2, 3); g.fillRect(X + 1, Y + 2, 2, 3);
  g.fillStyle = dark; g.fillRect(X - 3, Y - 5, 6, 2);                   // the saddle
  // the breast lantern
  g.fillStyle = '#ffd9a0'; g.fillRect(X - 1, Y + 1, 2, 2);
}

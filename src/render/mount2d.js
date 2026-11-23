// Mounts in 2D (2026-11-22, src/data/mounts.js): a small pixel horse or stag under a riding hero, legs trotting while it
// moves, and the hero lifted into the saddle (src/render/renderer.js draws it; the rules are src/sim/mounts.js).
// The same drawing stands Wynn's yard animals (STABLE.animals) in town.
//
//   mountLift(e) -> px the hero sprite is lifted (0 when not riding)
//   drawMount2d(g, x, y, kind, dir, now, moving, part)     x, y: the feet on screen (whole pixels); part 'under' (before the
//     hero: all of it, except the head of a mount facing the viewer) or 'over' (after the hero: that head)

export const MOUNT_LIFT_PX = 14;
const S = 2;                                    // the art below is drawn at 2 screen px per unit (a hero sprite's scale)
export const LOOK2D = {
  bay_horse: { coat: '#8a5530', dark: '#5e3820', mane: '#2a1a10', blanket: '#2f5a8a', trim: '#e0c060' },
  grey_charger: { coat: '#b2b0aa', dark: '#7a7872', mane: '#eceae4', blanket: '#7a1f24', trim: '#e8c860', steel: '#c8ccd4' },
  moor_stag: { coat: '#8a6a48', dark: '#5e4630', mane: '#c8b090', blanket: '#4a3a6a', trim: '#c8b070', antlers: '#efe6cc' },
};
export function mountLift(e) { return e && e.mount && !e.flight ? MOUNT_LIFT_PX : 0; }

/** Draw a mount at the feet point (x, y) facing `dir` ('left' | 'right' | 'up' | 'down'). */
export function drawMount2d(g, x, y, kind, dir, now, moving = false, part = 'under') {
  const L = LOOK2D[kind] || LOOK2D.bay_horse;
  const X = Math.round(x), Y = Math.round(y);
  const ink = '#1c1622';
  const step = moving ? Math.floor(now * 10) % 4 : 0;            // the legs' trot: four frames
  const bob = moving && step % 2 ? 1 : 0;
  // a rect in art units relative to the feet point (X, Y), drawn S times bigger
  const px = (c, ax, ay, w, h) => { g.fillStyle = c; g.fillRect(X + (ax - X) * S, Y + (ay - Y) * S, w * S, h * S); };
  if (dir === 'left' || dir === 'right') {
    if (part === 'over') return;
    const s = dir === 'left' ? -1 : 1;                            // the head end
    const R = (ox, oy, w, h, c) => px(c, s > 0 ? X + ox : X - ox - w + 1, Y + oy - bob, w, h);
    // legs (front pair, back pair), alternating as it trots
    const lf = [0, 1, 0, -1][step], lb = -lf;
    R(6 + lf, -5, 2, 5 + bob, L.dark); R(3 - lf, -5, 2, 5 + bob, L.coat);
    R(-7 + lb, -5, 2, 5 + bob, L.dark); R(-4 - lb, -5, 2, 5 + bob, L.coat);
    R(6 + lf, -1 + bob, 2, 1, ink); R(3 - lf, -1 + bob, 2, 1, ink); R(-7 + lb, -1 + bob, 2, 1, ink); R(-4 - lb, -1 + bob, 2, 1, ink);
    // body, belly shade, tail
    R(-8, -11, 17, 6, L.coat); R(-7, -6, 15, 1, L.dark); R(-10, -10, 2, 5, L.mane);
    // neck and head
    R(7, -15, 3, 6, L.coat); R(9, -17, 4, 3, L.coat); R(12, -16, 2, 2, L.dark); R(7, -16, 2, 4, L.mane);
    R(11, -17, 1, 1, ink);
    if (L.antlers) { R(8, -21, 1, 4, L.antlers); R(10, -22, 1, 5, L.antlers); R(7, -21, 2, 1, L.antlers); R(10, -22, 2, 1, L.antlers); }
    if (L.steel) { R(9, -17, 3, 1, L.steel); R(6, -12, 3, 4, L.steel); }
    // the blanket and saddle (the hero sits on it)
    R(-3, -12, 7, 5, L.blanket); R(-3, -8, 7, 1, L.trim); R(-1, -13, 4, 2, '#5a3820');
    return;
  }
  // facing the viewer (down) or away (up): a narrower body, the head at one end
  const away = dir === 'up';
  const lf = [0, 1, 0, -1][step];
  if (part === 'over') {
    if (away) return;
    // the head in front of the rider's lap (never over the rider's face); antlers spread wide either side
    px(L.coat, X - 2, Y - 14 - bob, 4, 6); px(L.dark, X - 1, Y - 9 - bob, 2, 1); px(L.mane, X - 1, Y - 15 - bob, 2, 2);
    px(ink, X - 2, Y - 12 - bob, 1, 1); px(ink, X + 1, Y - 12 - bob, 1, 1);
    if (L.antlers) { px(L.antlers, X - 7, Y - 19 - bob, 1, 4); px(L.antlers, X + 6, Y - 19 - bob, 1, 4); px(L.antlers, X - 7, Y - 16 - bob, 5, 1); px(L.antlers, X + 2, Y - 16 - bob, 5, 1); }
    if (L.steel) px(L.steel, X - 2, Y - 14 - bob, 4, 2);
    return;
  }
  px(L.dark, X - 4, Y - 6 - bob + lf, 2, 6); px(L.dark, X + 2, Y - 6 - bob - lf, 2, 6);
  px(ink, X - 4, Y - 1, 2, 1); px(ink, X + 2, Y - 1, 2, 1);
  px(L.coat, X - 5, Y - 12 - bob, 10, 7);
  px(L.blanket, X - 6, Y - 12 - bob, 12, 4); px(L.trim, X - 6, Y - 9 - bob, 12, 1);
  if (away) { px(L.mane, X - 1, Y - 7 - bob, 2, 5); px(L.coat, X - 2, Y - 18 - bob, 4, 6); px(L.mane, X - 1, Y - 19 - bob, 2, 6); }   // the tail, the head beyond
}

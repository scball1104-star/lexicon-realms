// Combat feel pass (wave 6, approved by Scott 2026-11-24): floating combat numbers you can read in a crowd.
// Used by fx.js when createFx gets { feel: true } (the 3D renderer); the 2D renderer and ?feel=0 keep the old numbers.
//
//   numberScale(style, t, { own, onMe, phone })  whole multiples of the pixel number font (crisp): your own hits 2x,
//                                                crits 3x then 2x, hits on you 2x, a friend's hits 1x and grey.
//                                                Phones: your own hits 1x (the phone HUD is already scaled up),
//                                                crits and hits on you 2x.
//   pickSlot(rect, placed)                        the first free spot (as drawn, then a width aside, then a line up)
//                                                so two numbers never draw on top of each other; a number keeps
//                                                its spot for its whole life (no jumping)
//   releaseHeld(floats, now, hold)                a number waits for its 3D bolt to land (at most HOLD_MAX s)
//   numCeil(layout)                               HUD y the numbers stop rising at (below the toast line)
//   drawFeelNumbers(g, floats, ctx)               the draw pass
// Pure apart from drawFeelNumbers (node tests import the rest).
import { floaterMotion } from './fxplan.js';

export const HOLD_MAX = 0.8;
const isCrit = (style) => style === 'crit' || style === 'healcrit';

export function numberScale(style, t, { own = false, onMe = false, phone = false } = {}) {
  if (isCrit(style)) return !phone && t < 0.16 ? 3 : 2;
  if (onMe) return 2;
  if (own) return phone ? 1 : 2;
  return 1;
}

export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// spots tried in order: as drawn, a width right, a width left, a line up (and aside), two lines up
export const SLOTS = [[0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1], [0, -2]];
export function slotOffset(i, w, h) { const [sx, sy] = SLOTS[i] || SLOTS[0]; return [sx * (w + 2), sy * (h + 1)]; }
export function pickSlot(r, placed) {
  for (let i = 0; i < SLOTS.length; i++) {
    const [ox, oy] = slotOffset(i, r.w, r.h);
    const q = { x: r.x + ox, y: r.y + oy, w: r.w, h: r.h };
    if (!placed.some((p) => overlaps(p, q))) return i;
  }
  return 0;
}

export function releaseHeld(floats, now, hold) {
  for (const f of floats) if (f.held && (!hold || !hold(f) || now - f.born > HOLD_MAX)) { f.held = false; f.t0 = now; }
}

/** Desktop: just under the toast line (ui.js draws toasts 44 to 62 px below the design origin). Phones: no ceiling. */
export function numCeil(layout) {
  if (!layout || layout.touch) return 0;
  return Math.max(0, Math.floor(((layout.hudH || 360) - 360) / 2)) + 64;
}

let scratch = null;
function scratchCtx(w, h) {
  if (typeof document === 'undefined') return null;
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
  const c = scratch.getContext('2d');
  c.clearRect(0, 0, scratch.width, scratch.height);
  c.imageSmoothingEnabled = false;
  return c;
}

/**
 * ctx: { toHud(x, y) -> [hx, hy], now, nf (the number font or null), playerId, lastPos (Map id -> anchor), phone,
 *        ceil (HUD y), fallbackText(g, text, x, y, color, alpha) }
 */
export function drawFeelNumbers(g, floats, { toHud, now, nf, playerId, lastPos, phone = false, ceil = 0, fallbackText }) {
  const placed = [];
  // oldest first: a number already on screen keeps its spot, a new one finds a free one around it
  for (const n of floats) {
    if (n.held) continue;
    const t = now - n.t0;
    const m = floaterMotion(n.style, t, n.seed);
    if (!m) continue;
    const a = lastPos.get(n.dst);
    if (!a) continue;
    const own = n.src != null && n.src === playerId, onMe = n.dst === playerId;
    const k = numberScale(n.style, t, { own, onMe, phone });
    const crit = isCrit(n.style);
    const text = n.style === 'word' ? '' : crit ? `${n.text}!` : n.text;
    const wr = n.style === 'word' && nf ? nf.words[n.word] : null;
    if (n.style === 'word' && nf && !wr) continue;
    const w0 = nf ? (wr ? wr[2] : nf.measure(text)) + 2 : text.length * 4;
    const h0 = nf ? (wr ? wr[3] : nf.lineHeight) + 2 : 6;
    const W = w0 * k, H = h0 * k;
    const [hx, hy] = toHud(a.x, a.y - (a.h || 24) - 2);
    let x = Math.round(hx + m.dx - W / 2), y = Math.round(hy + Math.round(m.dy * 1.3) - H);
    if (n.slot == null) n.slot = pickSlot({ x, y, w: W, h: H }, placed);
    const [ox, oy] = slotOffset(n.slot, W, H);
    x += ox; y += oy;
    if (y < ceil) y = ceil;                        // stop rising at the toast line
    placed.push({ x, y, w: W, h: H });
    const alpha = m.alpha * (own || onMe || crit ? 1 : 0.85);
    if (!nf) { if (fallbackText) fallbackText(g, text || n.word || '', x + W / 2, y, own ? '#f6f4ee' : '#b3b6c4', alpha); continue; }
    const c = scratchCtx(w0 + 2, h0 + 2);
    if (!c) continue;
    if (wr) nf.drawWord(c, n.word, 1, 1);
    else nf.draw(c, text, 1, 1, { color: { dmg: own ? 'white' : 'gray', crit: 'crit', heal: 'heal', healcrit: 'heal', taken: 'red' }[n.style] || 'white' });
    const a0 = g.globalAlpha, s0 = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false; g.globalAlpha = a0 * alpha;
    g.drawImage(scratch, 0, 0, w0, h0, x, y, W, H);
    g.globalAlpha = a0; g.imageSmoothingEnabled = s0;
  }
}

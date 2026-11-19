// Camera: locked follow, clamped to the map; a map smaller than the view is centred. Adapted from Lexicon Quest
// next/src/world/camera.js (the follow and clamp math; cutscene pans can come back when quests need them).
//
//   cameraFor(focusX, focusY, mapW, mapH, viewW, viewH) -> { x, y }   top-left of the view in world px (integers)

export function cameraFor(fx, fy, mapW, mapH, viewW, viewH) {
  const minX = mapW <= viewW ? (mapW - viewW) / 2 : 0;
  const maxX = mapW <= viewW ? minX : mapW - viewW;
  const minY = mapH <= viewH ? (mapH - viewH) / 2 : 0;
  const maxY = mapH <= viewH ? minY : mapH - viewH;
  const x = Math.max(minX, Math.min(maxX, fx - viewW / 2));
  const y = Math.max(minY, Math.min(maxY, fy - viewH / 2));
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Screen layout for a canvas of devW x devH device pixels.
 *
 * Desktop (default): the game view is 640x360 at the largest integer scale `base` that fits (letterboxed). The world is
 * drawn at integer scale `ws` = round(base * zoom), so zoom 1.5 at 1080p (base 3) draws world pixels 5x and zoom 2
 * draws them 6x: always whole device pixels per world pixel. The HUD layer is 640x360 at `base`.
 *
 * Touch (opts.touch, fix wave 2026-11-19, CRITIQUE_1 item 8): no black bars. The world fills the whole canvas at the
 * integer scale `ws` (the view width follows the screen aspect), and the HUD layer is `hudW x hudH` HUD px at its own
 * integer scale: in play (`opts.hud: 'big'`) about 1.75 css px per HUD px so phone text is legible (never smaller than
 * the desktop scale), and with a menu window open (`'win'`) the largest scale that still holds 640x360.
 *
 * Fields: base (HUD px -> device px), ox, oy (HUD layer origin), hudW, hudH (HUD layer size), ws, viewW, viewH
 * (world buffer), dispW, dispH (world display rect), wox, woy (world display origin before centring), VW, VH.
 */
export function layoutFor(devW, devH, zoom = 1, VW = 640, VH = 360, opts = {}) {
  if (typeof VW === 'object') { opts = VW; VW = 640; VH = 360; }
  const fit = Math.max(1, Math.floor(Math.min(devW / VW, devH / VH)));
  if (!opts.touch) {
    const base = fit;
    const ws = Math.max(base, Math.round(base * zoom));
    const dispW = VW * base, dispH = VH * base;
    const ox = Math.floor((devW - dispW) / 2), oy = Math.floor((devH - dispH) / 2);
    const viewW = Math.ceil(dispW / ws), viewH = Math.ceil(dispH / ws);
    return { base, ws, dispW, dispH, ox, oy, wox: ox, woy: oy, viewW, viewH, VW, VH, hudW: VW, hudH: VH, touch: false };
  }
  // touch: the world fills the screen
  const ws = Math.max(1, Math.round(fit * zoom));
  const dispW = devW, dispH = devH;
  const viewW = Math.ceil(dispW / ws), viewH = Math.ceil(dispH / ws);
  const dpr = opts.dpr || 1;
  // the HUD stays inside the safe area (notch, rounded corners, home bar); the world still fills the whole screen
  const ins = opts.inset || {};
  const il = ins.l || 0, it = ins.t || 0, ir = ins.r || 0, ib = ins.b || 0;
  const sW = Math.max(VW, devW - il - ir), sH = Math.max(Math.min(devH, 200), devH - it - ib);
  const sfit = Math.max(1, Math.floor(Math.min(sW / VW, sH / VH)));
  let base;
  if (opts.hud === 'win') base = sfit;
  else {
    base = Math.max(sfit, Math.round(dpr * 1.75));
    while (base > sfit && Math.floor(sH / base) < 200) base--;     // keep room for the HUD (at least 200 HUD px tall)
  }
  const hudW = Math.floor(sW / base), hudH = Math.floor(sH / base);
  const ox = Math.min(devW - hudW * base, il) + Math.floor((sW - hudW * base) / 2), oy = Math.min(devH - hudH * base, it) + Math.floor((sH - hudH * base) / 2);
  return { base, ws, dispW, dispH, ox, oy, wox: 0, woy: 0, viewW, viewH, VW, VH, hudW, hudH, touch: true, hud: opts.hud || 'big' };
}

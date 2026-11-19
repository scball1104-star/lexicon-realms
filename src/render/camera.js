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
 * Screen layout for a canvas of devW x devH device pixels. The game view is 640x360 at the largest integer scale
 * `base` that fits (letterboxed). The world is drawn at integer scale `ws` = round(base * zoom), so zoom 1.5 at
 * 1080p (base 3) draws world pixels 5x and zoom 2 draws them 6x: always whole device pixels per world pixel.
 */
export function layoutFor(devW, devH, zoom = 1, VW = 640, VH = 360) {
  const base = Math.max(1, Math.floor(Math.min(devW / VW, devH / VH)));
  const ws = Math.max(base, Math.round(base * zoom));
  const dispW = VW * base, dispH = VH * base;
  const ox = Math.floor((devW - dispW) / 2), oy = Math.floor((devH - dispH) / 2);
  const viewW = Math.ceil(dispW / ws), viewH = Math.ceil(dispH / ws);
  return { base, ws, dispW, dispH, ox, oy, viewW, viewH, VW, VH };
}

// Horizon camera controls (wave 5b, approved 2026-11-24; the camera itself: src/render3d/horizon_cam.js). Only attached when the
// horizon camera is on (?cam=horizon or Options: Camera Horizon), so today's controls are untouched otherwise.
//
//   const h = attachHorizonInput({ canvas, cam, input, ui, touchCtl })   h.setOn(bool): off = every listener steps aside
//   camRelMove(dx, dy, yawDeg) -> [dx, dy]    pure: a held key direction turned to the camera, snapped to 8 ways
//
// Desktop: right-drag orbits (a right click that does not move still targets / attacks / talks, sent on release);
//   the wheel and the +/- keys zoom from today's far view down to over the shoulder.
// Phone: two fingers on the world drag to orbit and pinch to zoom; one finger keeps today's joystick and taps.
// Movement: W walks the way the camera looks (the sim still gets one of its 8 directions; input.setMoveTransform).

const SLOP = 4;                 // device-independent px a right press may move and still be a click

/** A held key direction (dx, dy in -1..1, screen up = -y) turned by the camera yaw, snapped to the nearest of 8. */
export function camRelMove(dx, dy, yawDeg) {
  if (!dx && !dy) return [0, 0];
  const y = (yawDeg * Math.PI) / 180, c = Math.cos(y), s = Math.sin(y);
  const wx = dx * c - dy * s, wy = dx * s + dy * c;
  const oct = Math.round(Math.atan2(wy, wx) / (Math.PI / 4));
  const a = oct * (Math.PI / 4);
  const r = (v) => (Math.abs(v) < 1e-6 ? 0 : Math.sign(v));
  return [r(Math.cos(a)), r(Math.sin(a))];
}

export function attachHorizonInput({ canvas, cam, input, ui, touchCtl = null, win = window }) {
  let on = false;
  const setOn = (v) => { on = !!v; input.setMoveTransform(on ? (dx, dy) => camRelMove(dx, dy, cam.yaw) : null); if (!on) { rd = null; two = null; } };
  const onHud = (cx, cy) => { if (!ui || !ui.hudPoint || !ui.owns) return false; const p = ui.hudPoint(cx, cy); return ui.owns(p.x, p.y); };
  const devPoint = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) * (canvas.width / r.width), (ev.clientY - r.top) * (canvas.height / r.height)];
  };

  // ---- desktop: right-drag orbit, wheel zoom
  let rd = null;                // { x0, y0, x, y, dev, moved }
  win.addEventListener('mousedown', (ev) => {
    if (!on || ev.button !== 2 || ev.target !== canvas || onHud(ev.clientX, ev.clientY)) return;
    rd = { x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, dev: devPoint(ev), moved: false };
    ev.stopPropagation();       // input.js would send the right click now; it goes on release, if it was not a drag
  }, true);
  win.addEventListener('mousemove', (ev) => {
    if (!rd) return;
    if (!(ev.buttons & 2)) { rd = null; return; }
    if (!rd.moved && Math.hypot(ev.clientX - rd.x0, ev.clientY - rd.y0) > SLOP) rd.moved = true;
    if (rd.moved) cam.orbit(ev.clientX - rd.x, ev.clientY - rd.y);
    rd.x = ev.clientX; rd.y = ev.clientY;
  }, true);
  win.addEventListener('mouseup', (ev) => {
    if (!rd || ev.button !== 2) return;
    if (!rd.moved) input.inject({ k: 'rclick', x: rd.dev[0], y: rd.dev[1] });
    rd = null;
  }, true);
  canvas.addEventListener('wheel', (ev) => {
    if (!on || onHud(ev.clientX, ev.clientY)) return;
    cam.zoomBy(ev.deltaY < 0 ? 1 : -1);
    ev.preventDefault();
  }, { passive: false });
  win.addEventListener('keydown', (ev) => {
    if (!on || (ui && ui.mode !== 'game')) return;
    if (ev.code === 'Equal' || ev.code === 'NumpadAdd') cam.zoomBy(2);
    if (ev.code === 'Minus' || ev.code === 'NumpadSubtract') cam.zoomBy(-2);
  });

  // ---- phone: two fingers on the world orbit (drag) and zoom (pinch). touch.js keeps every one-finger gesture.
  let two = null;               // { cx, cy, d } the last centre and spread, css px
  const centre = (ts) => {
    const a = ts[0], b = ts[1];
    return { cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  };
  win.addEventListener('touchstart', (ev) => {
    if (two) { ev.stopPropagation(); ev.preventDefault(); return; }
    if (!on || ev.touches.length !== 2 || ev.target !== canvas) return;
    if ([...ev.touches].some((t) => onHud(t.clientX, t.clientY))) return;
    two = centre(ev.touches);
    if (touchCtl) touchCtl.release();    // the first finger may have started the joystick: let go of it
    ev.stopPropagation(); ev.preventDefault();
  }, { capture: true, passive: false });
  win.addEventListener('touchmove', (ev) => {
    if (!two) return;
    ev.stopPropagation(); ev.preventDefault();
    if (ev.touches.length < 2) return;
    const c = centre(ev.touches);
    cam.orbit(c.cx - two.cx, c.cy - two.cy);
    if (two.d > 20 && c.d > 20) cam.zoomBy(Math.log(c.d / two.d) / -Math.log(0.88));
    two = c;
  }, { capture: true, passive: false });
  const end = (ev) => {
    if (!two) return;
    ev.stopPropagation(); ev.preventDefault();
    if (ev.touches.length === 0) two = null;
  };
  win.addEventListener('touchend', end, { capture: true, passive: false });
  win.addEventListener('touchcancel', end, { capture: true, passive: false });
  return { setOn, get on() { return on; }, get dragging() { return !!(rd && rd.moved) || !!two; } };
}

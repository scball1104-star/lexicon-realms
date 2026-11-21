// Phone controls (DESIGN section 1, "Phone"; added by the HUD agent 2026-11-19). Touch events -> the same paths the
// keyboard and mouse use, so the sim sees ordinary commands:
//   - left thumb anywhere on the left half (not on a HUD element): a floating joystick appears under it and holds
//     WASD through input.press / input.release (8 directions, small dead zone)
//   - tap a foe to target it, tap an NPC to talk (input intent 'tap' = target, plus interact for NPCs); tap empty ground
//     to walk there (fix wave 2026-11-19, CRITIQUE_1 item 8: input walks you there with ordinary move commands)
//   - HUD elements (ability cluster, menu bar, windows) belong to the UI: ui.press() on touch start for the ability
//     cluster (instant), on tap for everything else; long press (0.45 s) shows the tooltip instead of tapping
// The joystick and pressed states are drawn by the HUD (src/ui/hud.js) from ui.setJoystick / ui.setPressed.
//
//   const touch = createTouch({ canvas, input, ui })     ui: the src/ui/ui.js object (hudPoint, owns, press ...)

export const JOY_RADIUS = 26;          // HUD px for full deflection
export const JOY_DEAD = 6;             // HUD px dead zone
export const TAP_SLOP = 10;            // HUD px a tap may drift
export const LONG_PRESS_MS = 450;
export const TAP_MS = 300;             // a left-half touch shorter than this that did not move is a tap, not a walk
const INSTANT = new Set(['slot', 'interact', 'next_target']);
const KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };

/** Joystick vector -> held keys (8-way). Pure. */
export function joyKeys(dx, dy) {
  const d = Math.hypot(dx, dy);
  if (d < JOY_DEAD) return [];
  const a = Math.atan2(dy, dx);                       // 0 = right, +pi/2 = down
  const oct = Math.round(a / (Math.PI / 4));          // -4..4
  const map = { 0: ['right'], 1: ['right', 'down'], 2: ['down'], 3: ['left', 'down'], 4: ['left'], '-4': ['left'], '-3': ['left', 'up'], '-2': ['up'], '-1': ['right', 'up'] };
  return (map[oct] || []).map((k) => KEYS[k]);
}

export function createTouch({ canvas, input, ui, now = () => performance.now() }) {
  const touches = new Map();           // identifier -> { kind: 'joy'|'ui'|'world', x0, y0, x, y, t0, timer, long, region }
  let joyHeld = [];

  const setJoyKeys = (keys) => {
    for (const k of joyHeld) if (!keys.includes(k)) input.release(k);
    for (const k of keys) if (!joyHeld.includes(k)) input.press(k);
    joyHeld = keys;
  };
  const devPoint = (t) => {
    const r = canvas.getBoundingClientRect();
    return [(t.clientX - r.left) * (canvas.width / r.width), (t.clientY - r.top) * (canvas.height / r.height)];
  };

  function start(ev) {
    ev.preventDefault();               // no synthetic mouse events, no page scroll or zoom
    for (const t of ev.changedTouches) {
      const p = ui.hudPoint(t.clientX, t.clientY);
      const rec = { x0: p.x, y0: p.y, x: p.x, y: p.y, t0: now(), long: false };
      if (ui.owns(p.x, p.y)) {
        rec.kind = 'ui';
        rec.region = ui.topRegion(p.x, p.y);
        if (rec.region && INSTANT.has(rec.region.kind) && !rec.region.tapOnly) { ui.press(p.x, p.y, 0); rec.fired = true; }
        if (rec.region && rec.region.drag) { rec.region.drag(p.x); rec.fired = true; }
        rec.timer = setTimeout(() => { rec.long = true; ui.setLongTip({ x: rec.x, y: rec.y }); }, LONG_PRESS_MS);
      } else if (p.x < ((ui.layout && ui.layout().W) || 640) / 2 && ![...touches.values()].some((o) => o.kind === 'joy')) {
        rec.kind = 'joy';
        rec.dev = devPoint(t);
        ui.setJoystick({ x: p.x, y: p.y, dx: 0, dy: 0 });
      } else {
        rec.kind = 'world';
        rec.dev = devPoint(t);
      }
      touches.set(t.identifier, rec);
    }
  }

  function move(ev) {
    ev.preventDefault();
    for (const t of ev.changedTouches) {
      const rec = touches.get(t.identifier);
      if (!rec) continue;
      const p = ui.hudPoint(t.clientX, t.clientY);
      rec.x = p.x; rec.y = p.y;
      if (rec.kind === 'joy') {
        let dx = p.x - rec.x0, dy = p.y - rec.y0;
        const d = Math.hypot(dx, dy);
        if (d > JOY_RADIUS) { dx *= JOY_RADIUS / d; dy *= JOY_RADIUS / d; }
        ui.setJoystick({ x: rec.x0, y: rec.y0, dx: dx / JOY_RADIUS, dy: dy / JOY_RADIUS });
        setJoyKeys(joyKeys(dx, dy));
      } else if (rec.kind === 'ui' && rec.region && rec.region.drag) rec.region.drag(p.x);
      else if (rec.kind === 'ui' && rec.region && rec.region.scrollDrag) {
        // a list that scrolls under the finger (the Lantern Chest grid, the glyph strips): past the tap slop it is a drag,
        // so the item under the finger is not tapped and no long-press card opens
        if (Math.hypot(p.x - rec.x0, p.y - rec.y0) > TAP_SLOP && rec.timer) { clearTimeout(rec.timer); rec.timer = null; }
        rec.region.scrollDrag(p.x - rec.x0, p.y - rec.y0, rec);
      }
      else if (Math.hypot(p.x - rec.x0, p.y - rec.y0) > TAP_SLOP && rec.timer) { clearTimeout(rec.timer); rec.timer = null; }
    }
  }

  function end(ev) {
    ev.preventDefault();
    for (const t of ev.changedTouches) {
      const rec = touches.get(t.identifier);
      if (!rec) continue;
      touches.delete(t.identifier);
      if (rec.timer) clearTimeout(rec.timer);
      const tap = Math.hypot(rec.x - rec.x0, rec.y - rec.y0) <= TAP_SLOP && ev.type === 'touchend';
      if (rec.kind === 'joy') {
        setJoyKeys([]); ui.setJoystick(null);
        // a quick tap on the left half is still a tap: target a foe / talk to an NPC under the finger
        if (tap && now() - rec.t0 < TAP_MS) input.inject({ k: 'tap', x: rec.dev[0], y: rec.dev[1] });
      }
      else if (rec.kind === 'ui') {
        if (rec.long) ui.setLongTip(null);
        else if (tap && !rec.fired) ui.press(rec.x0, rec.y0, 0);
        ui.setPressed(null);
      } else if (rec.kind === 'world' && tap) {
        input.inject({ k: 'tap', x: rec.dev[0], y: rec.dev[1] });
      }
    }
  }

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end, { passive: false });
  canvas.addEventListener('touchcancel', end, { passive: false });
  return {
    get active() { return touches.size; },
    release() { setJoyKeys([]); ui.setJoystick(null); touches.clear(); },
  };
}

/** Is this a touch-first device? (?touch=1 / ?touch=0 override for tests.) */
export function isTouchDevice(win, query) {
  const q = query && query.get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches) || (win.navigator && win.navigator.maxTouchPoints > 0 && !(win.matchMedia && win.matchMedia('(pointer: fine)').matches));
}

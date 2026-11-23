// The start realms' signatures in 2D (wave 3, lane realms1, 2026-11-22): Emberpeak's lava glowing in its rivers and on
// its crossings, Valewyn's tide water over the flats, and the ore cart or the ferry under a hero on a ride. The rules
// are src/sim/realm_mech.js (lavaAt, tideAt from src/data/realm_cycles.js read the same tick the sim does); this only paints, over the baked ground and
// under every sprite (src/render/renderer.js calls it once a frame).
//
//   drawRealm2d(g, zone, snap, cam, W, H, now, posOf)   posOf(id) -> [x, y] px (the lerped entity position) or null
import { lavaAt, tideAt } from '../data/realm_cycles.js';

const TS = 16;
const charsOf = (zone, terrain) => new Set(Object.entries(zone.legend || {}).filter(([, t]) => t === terrain).map(([c]) => c));
const cache = new WeakMap();
function info(zone) {
  let c = cache.get(zone);
  if (!c) { c = { lava: zone.lava ? charsOf(zone, 'ink') : null }; cache.set(zone, c); }
  return c;
}

export function drawRealm2d(g, zone, snap, cam, W, H, now, posOf) {
  if (!zone || !snap) return;
  const any = zone.lava || zone.tide || snap.entities.some((e) => e.flight && e.flight.ride);
  if (!any) return;
  const x0 = Math.max(0, Math.floor(cam.x / TS)), y0 = Math.max(0, Math.floor(cam.y / TS));
  const x1 = Math.min(zone.w - 1, Math.ceil((cam.x + W) / TS)), y1 = Math.min(zone.h - 1, Math.ceil((cam.y + H) / TS));
  const I = info(zone);
  g.save();
  if (zone.lava) {
    const st = lavaAt(zone, snap.tick);
    const flick = 0.85 + 0.15 * Math.sin(now * 3.1);
    for (let y = y0; y <= y1; y++) {
      const row = zone.ground[y];
      for (let x = x0; x <= x1; x++) {
        const ch = row[x];
        const sx = x * TS - cam.x, sy = y * TS - cam.y;
        if (I.lava.has(ch)) {
          // the river: molten, a brighter vein that drifts along it
          g.globalAlpha = 0.9 * flick;
          g.fillStyle = (x * 7 + y * 13 + Math.floor(now * 2)) % 9 === 0 ? '#ffb040' : '#e8480e';
          g.fillRect(sx, sy, TS, TS);
        } else if (ch === zone.lava.ch) {
          // a crossing: black crust, glowing through when hot
          g.globalAlpha = 0.95;
          g.fillStyle = '#1c1918'; g.fillRect(sx, sy, TS, TS);
          if (st.k > 0) {
            g.globalAlpha = st.k * flick;
            g.fillStyle = '#ff5a14'; g.fillRect(sx + 1, sy + 1, TS - 2, TS - 2);
            g.fillStyle = '#ffd070'; g.fillRect(sx + 4 + ((x + y) % 3) * 2, sy + 5, 4, 2);
          } else {
            g.globalAlpha = 0.5; g.fillStyle = '#3a3230';
            g.fillRect(sx + ((x * 5) % 7), sy + ((y * 3) % 9), 5, 2);
          }
        }
      }
    }
  }
  if (zone.tide) {
    const st = tideAt(zone, snap.tick);
    const a = Math.max(0, Math.min(1, (st.level - 0.3) / 0.35));
    if (a > 0) {
      const wave = Math.sin(now * 1.7);
      for (let y = y0; y <= y1; y++) {
        const row = zone.ground[y];
        for (let x = x0; x <= x1; x++) {
          if (row[x] !== zone.tide.ch) continue;
          const sx = x * TS - cam.x, sy = y * TS - cam.y;
          g.globalAlpha = 0.62 * a; g.fillStyle = '#3d8c98'; g.fillRect(sx, sy, TS, TS);
          if ((x + y * 3) % 5 === 0) { g.globalAlpha = 0.35 * a; g.fillStyle = '#cfeef0'; g.fillRect(sx + 3 + Math.round(wave * 2), sy + 7, 6, 1); }
        }
      }
    }
  }
  // a hero on a ride: the cart or the boat under them
  for (const e of snap.entities) {
    if (e.kind !== 'player' || !e.flight || !e.flight.ride || e.zone !== zone.id) continue;
    const p = posOf(e.id);
    if (!p) continue;
    const X = Math.round(p[0] - cam.x), Y = Math.round(p[1] - cam.y);
    g.globalAlpha = 1;
    if (e.flight.ride === 'ferry') {
      g.fillStyle = '#5a3c22'; g.fillRect(X - 12, Y - 4, 24, 6);
      g.fillStyle = '#7a5434'; g.fillRect(X - 10, Y - 6, 20, 3);
      g.fillStyle = '#e8e4d8'; g.fillRect(X + 2, Y - 22, 1, 16); g.fillRect(X + 3, Y - 20, 6, 9);
      g.globalAlpha = 0.5; g.fillStyle = '#cfeef0'; g.fillRect(X - 14, Y + 2, 28, 1);
    } else {
      g.fillStyle = '#3a3634'; g.fillRect(X - 9, Y - 8, 18, 9);
      g.fillStyle = '#5e5650'; g.fillRect(X - 9, Y - 8, 18, 2);
      g.fillStyle = '#1a1818'; g.fillRect(X - 7, Y, 4, 3); g.fillRect(X + 3, Y, 4, 3);
      g.fillStyle = '#ff8a3a'; g.fillRect(X - 5, Y - 10, 3, 2);
    }
  }
  g.restore();
}

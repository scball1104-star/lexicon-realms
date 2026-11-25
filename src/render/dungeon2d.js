// Dungeons and caves in 2D (render lane, dungeons build 2026-11-22). Pixel art drawn in code (no sheet has dungeon
// tiles yet), from the same dressing plan as 3D (dungeon_plan.js), so a hall looks the same in both.
//
//   paintPlaceCells(g, zone, x0, y0, x1, y1)        baked into the ground chunks (tilemap.js): dark rock, wall faces where
//                                                   rock meets floor below it (dressed stone or rough rock), contact
//                                                   shadows, flagstones, columns, and every prop that never moves
//   placeLive(zone)                                 per frame (renderer.js): { fires: [{ x, y, wall }], braziers: [...] }
//   drawBrazier(g, b, cam, now) / drawFlames(g, live, cam, now)
//   drawDoorMouth(g, door, cam)                     a world door: a stone doorway, a rock arch or a hole, dark inside
//   drawTelegraphs2d(g, snap, abilities, posOf, cam, zoneId)   red ground warnings (circle, cone, line) filling with the cast
//   drawDoorLabels2d(ctx, zone, font, worldToHud, hud)          "<name>" over "Dungeon, levels 10 to 12"
// Unknown dg_* pieces draw as a little rubble. Every function is safe on any zone (a field draws nothing).
import { cells, doorMouths, dungeonPlan, hashXY, isPlaceZone } from './dungeon_plan.js';

const T = 16;
const DUN = { cap: '#100d12', rim: '#2e2824', brick: ['#574d44', '#4f463e', '#5c5247', '#4a4139'], mortar: '#272220', hi: '#73665a', foot: '#2a2420' };
const CAV = { cap: '#0d0b0c', rim: '#2a241e', rock: ['#4a4036', '#433a31', '#3c342c'], hi: '#5e5246', foot: '#221c17' };

function px(g, c, x, y, w = 1, h = 1) { g.fillStyle = c; g.fillRect(x, y, w, h); }

/** The dungeon pass of one ground chunk (cells x0..x1-1, y0..y1-1; `g` is translated to zone px). */
export function paintPlaceCells(g, zone, x0, y0, x1, y1) {
  if (!isPlaceZone(zone)) return;
  const plan = dungeonPlan(zone);
  const { solid: rock, floor } = cells(zone);
  const solid = (x, y) => rock(x, y) && !plan.skip.has(`${x},${y}`);
  const cave = zone.kind === 'cave';
  const P = cave ? CAV : DUN;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const X = x * T, Y = y * T;
    if (solid(x, y)) {
      px(g, P.cap, X, Y, T, T);
      for (let i = 0; i < 3; i++) { const h = hashXY(x, y, 50 + i); px(g, '#16121a', X + Math.floor(h * 15), Y + Math.floor(hashXY(x, y, 60 + i) * 15), 2, 1); }
      // a back wall (floor below) is two cells tall: this cell is all face, the rock cell above it carries the upper face
      if (!solid(x, y + 1) && floor(x, y + 1)) wallFace(g, x, y, cave, P, solid(x, y - 1) ? 0 : 3, true);
      else if (solid(x, y + 1) && floor(x, y + 2) && !plan.skip.has(`${x},${y + 1}`)) wallFace(g, x, y, cave, P, 6, false);
      // a faint rim where the rock top meets open floor on the other sides (the outline reads at a glance)
      if (!solid(x - 1, y)) px(g, P.rim, X, Y, 1, T);
      if (!solid(x + 1, y)) px(g, P.rim, X + T - 1, Y, 1, T);
      if (!solid(x, y - 1)) px(g, P.rim, X, Y, T, 1);
      continue;
    }
    if (!floor(x, y)) continue;
    // dressed floor: a grey wash and flagstone joints (dungeons), darker earth (caves)
    g.fillStyle = cave ? 'rgba(30,22,16,0.35)' : 'rgba(84,78,74,0.4)'; g.fillRect(X, Y, T, T);
    if (!cave) {
      g.fillStyle = 'rgba(20,16,20,0.45)';
      if ((x + (y % 2)) % 2 === 0) g.fillRect(X, Y, 1, T);
      if (y % 2 === 0) g.fillRect(X, Y, T, 1);
      if (hashXY(x, y, 7) < 0.25) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(X + 1, Y + 1, T - 1, T - 1); }
    } else if (hashXY(x, y, 8) < 0.3) { px(g, 'rgba(90,78,64,0.5)', X + Math.floor(hashXY(x, y, 9) * 13), Y + Math.floor(hashXY(x, y, 10) * 13), 2, 2); }
    // contact shadows under the wall faces and along the side walls
    if (solid(x, y - 1)) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(X, Y, T, 2); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X, Y + 2, T, 2); }
    if (solid(x - 1, y)) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X, Y, 2, T); }
    if (solid(x + 1, y)) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X + T - 2, Y, 2, T); }
  }
  for (const [x, y] of plan.columns) if (x >= x0 && x < x1 && y >= y0 - 1 && y < y1 + 1) column(g, x, y, cave);
  for (const p of plan.props) {
    if (p.x < x0 - 1 || p.x > x1 || p.y < y0 - 1 || p.y > y1) continue;
    staticProp(g, p, cave);
  }
}

function wallFace(g, x, y, cave, P, top, foot) {
  const X = x * T, Y = y * T;                     // top: rows of rock top above the face in this cell
  if (!cave) {
    for (let r = 0; r * 4 + top < T; r++) {
      const yy = Y + top + r * 4, off = (r + y) % 2 ? 4 : 0;
      for (let bx = -off; bx < T; bx += 8) {
        const c = P.brick[Math.floor(hashXY(x * 4 + bx, y * 4 + r, 3) * 4)];
        const x0 = Math.max(X, X + bx), x1 = Math.min(X + T, X + bx + 8);
        px(g, c, x0, yy, x1 - x0, 4);
        px(g, P.mortar, x0, yy + 3, x1 - x0, 1);
        if (bx >= 0) px(g, P.mortar, X + bx, yy, 1, 3);
      }
    }
    if (top) px(g, P.hi, X, Y + top, T, 1);
    if (foot) px(g, P.foot, X, Y + T - 1, T, 1);
  } else {
    const jag = top ? 1 + Math.floor(hashXY(x, y, 4) * 4) : 0;
    for (let yy = top + jag; yy < T; yy++) {
      const c = P.rock[foot ? Math.min(2, 1 + Math.floor((yy / T) * 2)) : Math.min(1, Math.floor((yy / T) * 2))];
      px(g, c, X, Y + yy, T, 1);
    }
    for (let i = 0; i < 4; i++) px(g, P.hi, X + Math.floor(hashXY(x, y, 20 + i) * 14), Y + top + jag + Math.floor(hashXY(x, y, 30 + i) * 8), 2, 1);
    for (let i = 0; i < 3; i++) px(g, P.foot, X + Math.floor(hashXY(x, y, 40 + i) * 14), Y + 8 + Math.floor(hashXY(x, y, 44 + i) * 6), 1, 2);
    if (foot) px(g, P.foot, X, Y + T - 1, T, 1);
  }
}

function column(g, x, y, cave) {
  const X = x * T, Y = y * T;
  if (cave) { px(g, '#3c342c', X + 4, Y - 6, 8, 20); px(g, '#4a4036', X + 5, Y - 9, 5, 6); px(g, '#5e5246', X + 5, Y - 5, 1, 14); return; }
  px(g, '#3a3530', X + 2, Y + 11, 12, 4);                 // base
  px(g, '#77706a', X + 4, Y - 6, 8, 17);                  // shaft
  px(g, '#8f877e', X + 5, Y - 6, 2, 17);
  px(g, '#4f4842', X + 10, Y - 6, 2, 17);
  px(g, '#3a3530', X + 2, Y - 9, 12, 4);                  // capital
}

/** One baked prop (cells; wall pieces sit on their wall cell's face). */
function staticProp(g, p, cave) {
  const X = p.x * T, Y = p.y * T, r = p.r;
  const face = p.face || 's';
  // a wall piece's anchor: the middle of the face toward the floor
  const wx = face === 'e' ? X + T - 3 : face === 'w' ? X + 2 : X + 8, wy = face === 's' ? Y + 2 : Y + 6;
  switch (p.t) {
    case 'dg_torch': px(g, '#2a2420', wx - 1, wy, 3, 4); px(g, '#5a3a20', wx, wy - 3, 1, 4); break;
    case 'dg_niche':
      px(g, '#6a6058', X + 3, Y + 3, 10, 12); px(g, '#060408', X + 4, Y + 5, 8, 9); px(g, '#4a3220', X + 5, Y + 6, 6, 8);
      if (r > 0.5) { px(g, '#d8cfb8', X + 9, Y + 12, 2, 2); }
      break;
    case 'dg_banner': px(g, '#2a2420', X + 3, Y + 3, 10, 1); px(g, '#5a1c18', X + 4, Y + 4, 8, 10); px(g, '#7a2a22', X + 5, Y + 4, 2, 10); px(g, '#5a1c18', X + 6, Y + 14, 4, 2); break;
    case 'dg_roots': for (let i = 0; i < 3; i++) { const rx = X + 3 + Math.floor(hashXY(i, p.x, p.y) * 10), len = 5 + Math.floor(hashXY(p.y, i, p.x) * 9); for (let k = 0; k < len; k++) px(g, '#3a2a1c', rx + ((k >> 2) % 2), Y + 3 + k); } break;
    case 'dg_bones': for (let i = 0; i < 3 + Math.floor(r * 3); i++) { const bx = X + 2 + Math.floor(hashXY(i, 1, p.x * 9 + p.y) * 10), by = Y + 3 + Math.floor(hashXY(i, 2, p.x * 9 + p.y) * 10); if (i % 2) px(g, '#d8cfb8', bx, by, 4, 1); else px(g, '#c8bfa8', bx, by, 1, 3); } break;
    case 'dg_skulls': for (let i = 0; i < 3; i++) { const bx = X + 3 + i * 3, by = Y + 8 - (i === 1 ? 2 : 0); px(g, '#d8cfb8', bx, by, 3, 3); px(g, '#1a1410', bx, by + 1, 1, 1); px(g, '#1a1410', bx + 2, by + 1, 1, 1); } break;
    case 'dg_urn': px(g, '#3a2a1c', X + 5, Y + 13, 6, 1); px(g, '#7a5a3a', X + 5, Y + 6, 6, 7); px(g, '#7a5a3a', X + 6, Y + 4, 4, 2); px(g, '#9a7a52', X + 6, Y + 7, 1, 5); break;
    case 'dg_chain': for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; px(g, '#6a6460', X + 8 + Math.round(Math.cos(a) * 4), Y + 9 + Math.round(Math.sin(a) * 3)); } break;
    case 'dg_mushrooms': for (let i = 0; i < 2 + Math.floor(r * 3); i++) { const mx = X + 2 + Math.floor(hashXY(i, 5, p.x * 7 + p.y) * 11), my = Y + 5 + Math.floor(hashXY(i, 6, p.x * 7 + p.y) * 8); px(g, '#d8c8a8', mx + 1, my + 2, 1, 2); px(g, i % 2 ? '#c8a050' : '#a04a30', mx, my, 3, 2); } break;
    case 'dg_coins': for (let i = 0; i < 5; i++) px(g, '#e8c050', X + 4 + Math.floor(hashXY(i, 7, p.x) * 8), Y + 8 + Math.floor(hashXY(i, 8, p.y) * 5), 2, 1); break;
    case 'dg_candles': for (let i = 0; i < 3; i++) { px(g, '#e8e0c8', X + 5 + i * 3, Y + 7 - (i % 2) * 2, 1, 4); } break;
    case 'dg_cage': px(g, '#3a3430', X + 3, Y + 2, 10, 13); for (let i = 0; i < 5; i++) px(g, '#6a6460', X + 3 + i * 2, Y + 2, 1, 13); break;
    case 'dg_bier': px(g, '#6a625a', X + 1, Y + 4, 14, 10); px(g, '#3a3530', X + 3, Y + 6, 10, 5); break;
    case 'dg_brazier': case 'dg_column': case 'dg_stalagmite': break;     // drawn live (braziers) or as columns
    default: for (let i = 0; i < 4; i++) px(g, i % 2 ? '#5a544e' : '#3a3530', X + 3 + Math.floor(hashXY(i, 3, p.x) * 9), Y + 6 + Math.floor(hashXY(i, 4, p.y) * 7), 3, 2);
  }
  void cave;
}

const live = new WeakMap();
/** Fires (torch flames, braziers) for the per-frame pass, in zone px. */
export function placeLive(zone) {
  if (!isPlaceZone(zone)) return null;
  if (live.has(zone)) return live.get(zone);
  const plan = dungeonPlan(zone);
  const fires = [], braziers = [];
  for (const p of plan.props) {
    const X = p.x * T, Y = p.y * T, face = p.face || 's';
    if (p.t === 'dg_torch') fires.push({ x: face === 'e' ? X + T - 3 : face === 'w' ? X + 2 : X + 8, y: face === 's' ? Y - 1 : Y + 2, wall: true, s: 1 });
    else if (p.t === 'dg_brazier') { const b = { x: X + 8, y: Y + 12, cave: zone.kind === 'cave' }; braziers.push(b); fires.push({ x: b.x, y: b.y - (b.cave ? 4 : 11), wall: false, s: 1.6 }); }
    else if (p.t === 'dg_candles') fires.push({ x: X + 8, y: Y + 5, wall: false, s: 0.6 });
  }
  const out = { fires, braziers };
  live.set(zone, out);
  return out;
}

export function drawBrazier(g, b, cam) {
  const x = Math.round(b.x - cam.x), y = Math.round(b.y - cam.y);
  if (b.cave) { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; px(g, '#3a3530', x + Math.round(Math.cos(a) * 5) - 1, y - 2 + Math.round(Math.sin(a) * 2), 3, 2); } px(g, '#4a3220', x - 3, y - 3, 6, 1); return; }
  px(g, '#1e1a18', x - 4, y - 1, 1, 2); px(g, '#1e1a18', x + 3, y - 1, 1, 2); px(g, '#2a2420', x - 3, y - 8, 1, 7); px(g, '#2a2420', x + 2, y - 8, 1, 7); px(g, '#2a2420', x, y - 7, 1, 6);
  px(g, '#3a322c', x - 5, y - 11, 11, 3); px(g, '#2a1008', x - 4, y - 12, 9, 1);
}

/** Flames over the light pass (they glow): a flicker per fire, from the effect clock. */
export function drawFlames(g, lv, cam, now, W, H) {
  for (const f of lv.fires) {
    const x = Math.round(f.x - cam.x), y = Math.round(f.y - cam.y);
    if (x < -8 || y < -8 || x > W + 8 || y > H + 8) continue;
    const k = Math.floor((now * 9 + f.x * 0.37 + f.y * 0.11) % 3);
    const s = f.s;
    const h = Math.round((3 + k) * s), w = Math.max(1, Math.round(2 * s));
    px(g, '#ff6a20', x - w, y - h + 1, w * 2 + 1, h);
    px(g, '#ffb040', x - Math.max(0, w - 1), y - h + 2, Math.max(1, w * 2 - 1), h - 1);
    px(g, '#fff0b0', x, y - Math.round(h / 2), 1, Math.max(1, Math.round(h / 2)));
  }
}

/** A world door into a dungeon or cave (y-sorted with the props). */
export function drawDoorMouth(g, d, cam) {
  const X = d.x * T - cam.x, Y = d.y * T - cam.y, w = (d.w || 1) * T, h = (d.h || 1) * T;
  const dungeon = d.kind !== 'cave';
  if (d.face === 's' || d.face === 'n') {
    const top = d.face === 's' ? Y - 14 : Y + h - 2;
    if (d.face === 'n') { // a hole going down: dark, with stones round it
      g.fillStyle = '#050406'; g.beginPath(); g.ellipse(X + w / 2, Y + h / 2, w / 2 + 2, h / 2, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; px(g, '#5e564c', Math.round(X + w / 2 + Math.cos(a) * (w / 2 + 3)) - 2, Math.round(Y + h / 2 + Math.sin(a) * (h / 2 + 2)) - 1, 4, 3); }
      return;
    }
    px(g, '#050406', X + 1, top, w - 2, 16);
    if (dungeon) {
      px(g, '#7a7268', X - 5, top - 4, 5, 22); px(g, '#7a7268', X + w, top - 4, 5, 22);
      px(g, '#5a544e', X - 3, top - 4, 1, 22); px(g, '#5a544e', X + w + 3, top - 4, 1, 22);
      px(g, '#8a8278', X - 7, top - 8, w + 14, 5); px(g, '#5a544e', X - 7, top - 4, w + 14, 1);
      px(g, '#3a3530', X, top + 15, w, 2);
    } else {
      for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8); px(g, i % 2 ? '#5e564c' : '#4a4038', Math.round(X + w / 2 + Math.cos(a) * (w / 2 + 3)) - 3, Math.round(top + 12 - Math.sin(a) * 15) - 3, 6, 6); }
    }
    return;
  }
  // facing west or east: the opening on the door cell's rock side
  const ox = d.face === 'w' ? X + w - 7 : X, oy = Y - 6;
  px(g, '#050406', ox, oy, 7, h + 6);
  for (let i = 0; i < 6; i++) px(g, i % 2 ? '#5e564c' : '#4a4038', ox - 2 + (d.face === 'w' ? 3 : -1), oy - 4 + i * 5, 6, 5);
}

/** Ground warnings: casts whose ability has a telegraph (posOf(id) -> [x, y] px or null). */
export function drawTelegraphs2d(g, snap, abilities, posOf, cam, zoneId) {
  if (!abilities) return 0;
  let n = 0;
  for (const e of snap.entities) {
    if (!e.cast || e.dead || e.zone !== zoneId) continue;
    const ab = abilities[e.cast.ability];
    if (!ab || !ab.telegraph || !ab.area) continue;
    const self = posOf(e.id);
    if (!self) continue;
    const tgt = e.cast.target != null ? posOf(e.cast.target) : null;
    let c = self;
    if (ab.area.at === 'target' && tgt) c = tgt;
    else if (ab.area.at === 'ground') c = e.cast.at ? [e.cast.at.x, e.cast.at.y] : (tgt || self);
    const k = Math.max(0, Math.min(1, (snap.tick - e.cast.startTick) / Math.max(1, e.cast.endTick - e.cast.startTick)));
    const R = ab.area.radius || 32, x = c[0] - cam.x, y = c[1] - cam.y;
    const shape = ab.telegraph === 'cone' || ab.area.shape === 'cone' ? 'cone' : ab.telegraph === 'line' || ab.area.shape === 'line' ? 'line' : 'circle';
    const dir = tgt ? Math.atan2(tgt[1] - self[1], tgt[0] - self[0]) : 0;
    const path = (r) => {
      g.beginPath();
      if (shape === 'circle') g.arc(x, y, r, 0, Math.PI * 2);
      else if (shape === 'cone') { const a = ((ab.area.angle || 90) * Math.PI) / 360; g.moveTo(x, y); g.arc(x, y, r, dir - a, dir + a); g.closePath(); }
      else { const wd = (ab.area.width || 16) / 2, cs = Math.cos(dir), sn = Math.sin(dir); g.moveTo(x - sn * wd, y + cs * wd); g.lineTo(x + sn * wd, y - cs * wd); g.lineTo(x + sn * wd + cs * r, y - cs * wd + sn * r); g.lineTo(x - sn * wd + cs * r, y + cs * wd + sn * r); g.closePath(); }
    };
    path(R); g.fillStyle = 'rgba(255,40,20,0.2)'; g.fill();
    g.strokeStyle = 'rgba(255,96,60,0.95)'; g.lineWidth = 1; g.stroke();
    path(Math.max(1, R * k)); g.fillStyle = 'rgba(255,60,30,0.3)'; g.fill();
    n++;
  }
  return n;
}

const labels = new Map();
/** Door labels on the HUD-px overlay (under the HUD). */
export function drawDoorLabels2d(ctx, zone, font, worldToHud, hud) {
  if (!font || !zone || !zone.doors) return;
  const text = (s, color) => {
    const k = s + color;
    if (!labels.has(k)) {
      const w = Math.max(8, font.measure(s) + 4), h = font.lineHeight + 4;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      font.draw(c.getContext('2d'), s, 2, 2, { color, outline: '#0a0810' });
      labels.set(k, { c, w, h });
    }
    return labels.get(k);
  };
  for (const d of doorMouths(zone)) {
    const [hx, hy] = worldToHud((d.x + (d.w || 1) / 2) * T, d.y * T - 40);
    if (hx < -80 || hy < -30 || hx > hud.w + 80 || hy > hud.h + 30) continue;
    const line2 = d.label || `${d.kind === 'cave' ? 'Cave' : 'Dungeon'}, levels ${d.levels[0]} to ${d.levels[1]}`;
    const t1 = text(d.name, 'gold'), t2 = text(line2, '#c8c0d8');
    const bw = Math.max(t1.w, t2.w) + 10, bh = t1.h + t2.h, bx = Math.round(hx - bw / 2), by = Math.max(hud.top || 2, hy - bh);   // wave 10 draid: hud.top (a phone's top buttons)
    ctx.fillStyle = 'rgba(14,10,22,0.72)'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#c9a24c'; ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by + bh - 1, bw, 1);
    ctx.drawImage(t1.c, Math.round(hx - t1.w / 2), by + 1);
    ctx.drawImage(t2.c, Math.round(hx - t2.w / 2), by + t1.h - 1);
  }
}

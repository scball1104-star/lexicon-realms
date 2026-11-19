// Spell-effect runtime: turns planned specs (fxplan.js) into drawn effects. Owns cast glows, projectiles, impacts,
// heal sparkles, aura rings, death puffs, the level-up burst, small spark particles and floating combat numbers.
//
//   const F = createFx({ sheet: () => ({ img, json }) | null, numFont: () => BitmapFont | null, bigFont, playerId })
//   F.feed(events, now)                     plan + start effects for one tick's events
//   F.update(now, anchor)                   anchor(id) -> { x, y, h, hand } world px (feet; h = sprite height) or null
//   F.drawWorld(g, cam, W, H, now)          after the light pass (bright), world px
//   F.lights(now) -> [light]                 spell glows for the light map and the additive halo pass
//   F.drawNumbers(g, toHud, now)             floating numbers on the HUD-resolution overlay (640 x 360)
//   F.state(id, now) -> { attackT0, hurtT0, now }   sprite hints
//   F.auraLooks(e)                           persistent looks from the snapshot auras (stealth shimmer, ward ring)
//
// Fallbacks: every sprite effect has a procedural pixel version, used when assets/fx/fx.png is missing or lacks
// the animation. Drawn at whole world pixels only.
import { planEvents, floaterMotion } from './fxplan.js';
import { AURA_LOOKS } from './fx_table.js';
import { BAYER4 } from './lighting.js';

const hexRgb = (c) => { const n = parseInt(String(c).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const dir4 = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up'));
const DIR8 = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
const dir8 = (dx, dy) => DIR8[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];

export function createFx(opts) {
  const { sheet, numFont, bigFont } = opts;
  const abilities = opts.abilities || null;     // content abilities (mob bolt schools, fallback speeds)
  const seenSim = new Set();                    // sim projectile ids that got an event visual (late-join fallback skips them)
  let playerId = opts.playerId ?? null;
  const fx = [];            // live effects
  const sparks = [];        // tiny pixel particles
  const floats = [];        // floating numbers
  const casting = new Map();  // src -> { color, glow, light, t0 }
  const hints = new Map();    // id -> { attackT0, hurtT0 }
  const lastPos = new Map();  // id -> anchor (so a death or a lost target still has a place)
  let seq = 0;
  let rs = 12345;
  const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };

  const anim = (name) => { const s = sheet(); return s && s.json.fx && s.json.fx[name] ? s.json.fx[name] : null; };

  function feed(events, now) {
    for (const s of planEvents(events, { playerId, abilities })) start(s, now);
  }

  function start(s, now) {
    switch (s.kind) {
      case 'castglow': casting.set(s.src, { ...s, t0: now }); break;
      case 'caststop': casting.delete(s.src); break;
      case 'release': fx.push({ type: 'flash', at: s.src, t0: now, dur: 0.22, color: s.color, rgb: s.light || hexRgb(s.color), hand: true }); break;
      case 'projectile':
        if (s.simId != null) seenSim.add(s.simId);
        for (let i = 0; i < s.count; i++) fx.push({ type: 'proj', ...s, t0: now + i * 0.08, id: ++seq, pos: null, from: null, land: [], spread: (i - (s.count - 1) / 2) * 6 });
        break;
      case 'impact':
      case 'number': {
        const p = fx.find((f) => f.type === 'proj' && f.dst === s.dst && f.src === s.src && !f.done && (s.kind === 'number' || f.ability === s.ability));
        if (p) { p.land.push(s); break; }
        land(s, now);
        break;
      }
      case 'selffx': fx.push({ type: s.sprite, at: s.src, t0: now, dur: s.sprite === 'taunt' ? 0.45 : 0.6, color: s.color, rgb: s.light || hexRgb(s.color) }); break;
      case 'ground': fx.push({ type: 'groundring', at: s.src, t0: now, dur: 0.55, color: s.color, rgb: s.light || hexRgb(s.color) }); break;
      case 'aura':
        if (s.mode === 'add') fx.push({ type: s.buff ? 'buffring' : 'debuff', at: s.dst, t0: now, dur: 0.6, color: s.color, rgb: hexRgb(s.color) });
        else fx.push({ type: 'fadepuff', at: s.dst, t0: now, dur: 0.35, color: s.color });
        break;
      case 'death': { const h = hints.get(s.id) || {}; h.deathT0 = now; hints.set(s.id, h); }
        fx.push({ type: 'death', at: s.id, t0: now, dur: 0.9, fixed: lastPos.get(s.id) || null }); burst(lastPos.get(s.id), 10, '#d8d0c0', 0.7, now, 1); break;
      case 'levelup': fx.push({ type: 'levelup', at: s.id, t0: now, dur: 1.3, rgb: [255, 220, 140] }); break;
      case 'swing': { const h = hints.get(s.src) || {}; h.attackT0 = now; hints.set(s.src, h); break; }
      case 'hurt': { const h = hints.get(s.dst) || {}; h.hurtT0 = now; hints.set(s.dst, h); break; }
      default: break;
    }
  }

  function land(s, now) {
    if (s.kind === 'number') {
      floats.push({ ...s, t0: now, seed: seq++ });
      if (floats.length > 40) floats.shift();
      return;
    }
    const src = lastPos.get(s.src);
    const type = s.sprite;
    fx.push({ type, at: s.dst, t0: now, dur: { slash: 0.3, flurry: 0.3, ink_splash: 0.45, heal: 0.65, hit: 0.22, burst: 0.4, tick: 0.25, healtick: 0.5, arrowfall: 0.3 }[type] || 0.35,
      color: s.color, rgb: s.light || hexRgb(s.color || '#ffffff'), crit: s.crit, heavy: s.heavy, from: src ? [src.x, src.y] : null });
    if (s.crit) fx.push({ type: 'critflash', at: s.dst, t0: now, dur: 0.18, rgb: [255, 240, 200] });
    const a = lastPos.get(s.dst);
    if (a && type !== 'tick' && type !== 'healtick') burst({ x: a.x, y: a.y - Math.round(a.h * 0.45) }, s.crit ? 10 : 5, s.color || '#ffffff', 0.35, now, s.crit ? 1.6 : 1);
  }

  function burst(at, n, color, life, now, power = 1) {
    if (!at) return;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6, sp = (30 + rnd() * 50) * power;
      sparks.push({ x: at.x, y: at.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 30, g: 160, t0: now, life: life * (0.6 + rnd() * 0.5), color });
    }
    if (sparks.length > 220) sparks.splice(0, sparks.length - 220);
  }

  let lastNow = null;
  function update(now, anchor) {
    const dt = lastNow == null ? 0 : Math.max(0, Math.min(0.1, now - lastNow));
    lastNow = now;
    const posOf = (id) => { const a = anchor(id); if (a) lastPos.set(id, a); return a || lastPos.get(id) || null; };
    for (const id of [...casting.keys()]) posOf(id);
    for (const f of fx) {
      if (f.at != null) f.pos = f.fixed || posOf(f.at);
      if (f.type === 'proj') {
        if (now < f.t0) continue;
        const a = posOf(f.src), b = posOf(f.dst);
        if (!f.from && a) f.from = [a.x + (a.hand ? a.hand[0] : 0), a.y - (a.hand ? a.hand[1] : Math.round(a.h * 0.55))];
        if (!f.from || !b) { f.done = true; continue; }
        const to = [b.x + f.spread, b.y - Math.round(b.h * 0.45)];
        const total = Math.hypot(to[0] - f.from[0], to[1] - f.from[1]);
        const k = Math.min(1, ((now - f.t0) * f.speed) / Math.max(1, total));
        f.pos = { x: f.from[0] + (to[0] - f.from[0]) * k, y: f.from[1] + (to[1] - f.from[1]) * k };
        f.dirv = [to[0] - f.from[0], to[1] - f.from[1]];
        if (k >= 1 && !f.done) {
          f.done = true;
          for (const s of f.land) land(s, now);
          if (!f.land.length && f.sprite === 'arrow') burst({ x: to[0], y: to[1] }, 3, '#e8dcc0', 0.25, now);
        }
      }
    }
    // a projectile whose impact never comes (the sim missed it, or no damage event) just lands
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      if (f.type === 'proj' ? f.done || now - f.t0 > 3 : now - f.t0 > f.dur) fx.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      if (now - p.t0 > p.life) { sparks.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96;
    }
    for (let i = floats.length - 1; i >= 0; i--) if (!floaterMotion(floats[i].style, now - floats[i].t0, floats[i].seed)) floats.splice(i, 1);
    // cast glow sparkles rise from the hands
    for (const [id, c] of casting) {
      const a = lastPos.get(id);
      if (!a || rnd() > 0.35) continue;
      const hx = a.x + (a.hand ? a.hand[0] : 0), hy = a.y - (a.hand ? a.hand[1] : 18);
      sparks.push({ x: hx + (rnd() - 0.5) * 8, y: hy + (rnd() - 0.5) * 4, vx: (rnd() - 0.5) * 10, vy: -20 - rnd() * 20, g: 0, t0: now, life: 0.5, color: c.color });
    }
  }

  // ---------------------------------------------------------------- drawing helpers
  function drawAnim(g, name, dir, idx, x, y, cam, opts2 = {}) {
    const s = sheet(), a = anim(name);
    if (!s || !a) return false;
    const frames = a.dirs ? a.dirs[dir] || a.dirs[Object.keys(a.dirs)[0]] : a.frames;
    if (!frames || !frames.length) return false;
    const n = a.loop ? idx % frames.length : Math.min(frames.length - 1, idx);
    const key = frames[n], r = s.json.frames[key];
    if (!r) return false;
    const o = (s.json.origins && s.json.origins[key]) || a.origin || [r[2] >> 1, r[3] >> 1];
    if (opts2.alpha != null) g.globalAlpha = opts2.alpha;
    g.drawImage(s.img, r[0], r[1], r[2], r[3], Math.round(x - o[0] - cam.x), Math.round(y - o[1] - cam.y), r[2], r[3]);
    g.globalAlpha = 1;
    return true;
  }
  const animDone = (name, k) => { const a = anim(name); if (!a) return true; const n = a.frames ? a.frames.length : Object.values(a.dirs)[0].length; return k * (a.fps || 10) >= n; };

  function ring(g, cx, cy, rx, ry, color, alpha = 1) {
    // a pixel ellipse outline (no anti-aliasing): sample the rim at whole pixels
    g.globalAlpha = alpha; g.fillStyle = color;
    const n = Math.max(16, Math.round((rx + ry) * 3));
    let px = null, py = null;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
      if (x === px && y === py) continue;
      g.fillRect(x, y, 1, 1); px = x; py = y;
    }
    g.globalAlpha = 1;
  }
  function star(g, x, y, s, color, core = '#ffffff') {
    g.fillStyle = color; g.fillRect(x, y - s, 1, s * 2 + 1); g.fillRect(x - s, y, s * 2 + 1, 1);
    if (s >= 2) { g.fillStyle = core; g.fillRect(x, y, 1, 1); }
  }
  function ditherDisc(g, cx, cy, r, color, density) {
    g.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / (r + 0.3);
      if (d > 1) continue;
      const th = (BAYER4[(((cy + dy) & 3) << 2) | ((cx + dx) & 3)] + 0.5) / 16;
      if (th < density * (1 - d * 0.6)) g.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }

  function drawWorld(g, cam, W, H, now) {
    // cast glows: a pulsing dithered orb at the hands
    for (const [id, c] of casting) {
      const a = lastPos.get(id);
      if (!a) continue;
      const hx = Math.round(a.x + (a.hand ? a.hand[0] : 0) - cam.x), hy = Math.round(a.y - (a.hand ? a.hand[1] : 18) - cam.y);
      const pulse = Math.floor((now - c.t0) * 8) % 2;
      g.save(); g.globalCompositeOperation = 'lighter';
      ditherDisc(g, hx, hy, 4 + pulse, c.glow || c.color, 0.6);
      g.restore();
      star(g, hx, hy, 1 + pulse, c.color);
    }
    for (const f of fx) {
      if (!f.pos || now < f.t0) continue;
      const age = now - f.t0, k = Math.min(1, age / f.dur);
      const x = Math.round(f.pos.x), y = Math.round(f.pos.y), h = f.pos.h || 24;
      const sx = x - cam.x, sy = y - cam.y;
      if (sx < -64 || sy < -80 || sx > W + 64 || sy > H + 64) continue;
      const mid = y - Math.round(h * 0.45);
      switch (f.type) {
        case 'proj': {
          const v = f.dirv || [1, 0];
          if (f.sprite === 'arrow' && drawAnim(g, 'arrow', dir8(v[0], v[1]), 0, x, y, cam)) break;
          if (f.sprite === 'ink_bolt' && drawAnim(g, 'ink_bolt', dir4(v[0], v[1]), Math.floor(age * 10), x, y, cam)) break;
          // procedural: a glowing orb with a 3-pixel trail
          const len = Math.hypot(v[0], v[1]) || 1, ux = v[0] / len, uy = v[1] / len;
          g.save(); g.globalCompositeOperation = 'lighter';
          for (let i = 3; i >= 1; i--) { g.globalAlpha = 0.25 * (4 - i); g.fillStyle = f.glow || f.color; g.fillRect(Math.round(sx - ux * i * 3) - 1, Math.round(sy - uy * i * 3) - 1, 2, 2); }
          g.restore();
          if (f.sprite === 'arrow') { g.fillStyle = '#c8a070'; for (let i = 0; i < 6; i++) g.fillRect(Math.round(sx - ux * i), Math.round(sy - uy * i), 1, 1); g.fillStyle = '#ffffff'; g.fillRect(sx, sy, 1, 1); }
          else { g.fillStyle = f.color; g.fillRect(sx - 1, sy - 1, 3, 3); g.fillStyle = '#ffffff'; g.fillRect(sx, sy, 1, 1); }
          break;
        }
        case 'slash': {
          const d = f.from ? dir4(x - f.from[0], y - f.from[1]) : 'right';
          const off = { right: [-6, 0], left: [6, 0], down: [0, -6], up: [0, 6] }[d];
          if (!drawAnim(g, 'slash', d, Math.floor(age * 16), x + off[0], mid + off[1], cam)) {
            const n = Math.floor(k * 4);
            g.fillStyle = n < 2 ? '#ffffff' : '#bfe8ff';
            for (let i = -6 + n * 2; i <= 6 - n; i++) g.fillRect(sx + i, sy - Math.round(h * 0.45) + Math.round(Math.abs(i) * 0.5) - 3, 1, 1);
          }
          break;
        }
        case 'flurry':
          if (!drawAnim(g, 'flurry', null, Math.floor(age * 16), x, mid, cam)) {
            g.fillStyle = '#e8e0ff';
            for (let i = -5; i <= 5; i++) { g.fillRect(sx + i, sy - Math.round(h * 0.45) + i, 1, 1); g.fillRect(sx + i, sy - Math.round(h * 0.45) - i, 1, 1); }
          }
          break;
        case 'ink_splash':
          if (!drawAnim(g, 'ink_splash', null, Math.floor(age * 12), x, mid, cam)) {
            ditherDisc(g, sx, sy - Math.round(h * 0.45), Math.round(2 + k * 7), '#2a1c58', 0.8 * (1 - k));
          }
          break;
        case 'heal':
          if (!drawAnim(g, 'heal', null, Math.floor(age * 10), x, y, cam)) {
            for (let i = 0; i < 5; i++) star(g, sx - 8 + i * 4, sy - 4 - Math.round(k * 26) - (i % 2) * 6, 1, f.color || '#8fe07a');
          }
          break;
        case 'healtick': for (let i = 0; i < 2; i++) star(g, sx - 3 + i * 6, sy - 8 - Math.round(k * 16) - i * 4, 1, '#8fe07a'); break;
        case 'tick': g.fillStyle = f.color || '#ffffff'; g.globalAlpha = 1 - k; g.fillRect(sx - 2, sy - Math.round(h * 0.45) - Math.round(k * 5), 1, 1); g.fillRect(sx + 2, sy - Math.round(h * 0.5) - Math.round(k * 6), 1, 1); g.globalAlpha = 1; break;
        case 'hit': {
          const s = k < 0.4 ? 3 : k < 0.7 ? 2 : 1;
          star(g, sx, sy - Math.round(h * 0.45), s + (f.heavy ? 1 : 0), '#fff7d6');
          break;
        }
        case 'burst': {
          const r = Math.round(3 + k * 10);
          for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; star(g, Math.round(sx + Math.cos(a) * r), Math.round(sy - h * 0.45 + Math.sin(a) * r * 0.7), k < 0.5 ? 1 : 0, f.color || '#fff1a8'); }
          if (k < 0.3) star(g, sx, sy - Math.round(h * 0.45), 3, f.color || '#fff1a8');
          break;
        }
        case 'arrowfall': {
          // an arrow dropping onto the target out of the volley, then a small hit star
          const hy = sy - Math.round(h * 0.45);
          if (k < 0.6) { const ay = hy - Math.round((1 - k / 0.6) * 40); g.fillStyle = '#c8a070'; g.fillRect(sx, ay - 6, 1, 6); g.fillStyle = '#f6f4ee'; g.fillRect(sx, ay, 1, 1); g.fillRect(sx - 1, ay - 6, 3, 1); }
          else star(g, sx, hy, 2, '#fff7d6');
          break;
        }
        case 'critflash': { g.save(); g.globalCompositeOperation = 'lighter'; ditherDisc(g, sx, sy - Math.round(h * 0.45), 9, '#fff0c0', 0.9 * (1 - k)); g.restore(); break; }
        case 'flash': {
          const hx = sx + (f.pos.hand ? f.pos.hand[0] : 0), hy = sy - (f.pos.hand ? f.pos.hand[1] : 18);
          g.save(); g.globalCompositeOperation = 'lighter'; ditherDisc(g, hx, hy, Math.round(3 + k * 5), f.color, 0.9 * (1 - k)); g.restore();
          star(g, hx, hy, k < 0.5 ? 3 : 1, f.color);
          break;
        }
        case 'taunt':
          if (!drawAnim(g, 'taunt', null, Math.floor(age * 12), x, y, cam)) ring(g, sx, sy, Math.round(6 + k * 16), Math.round(3 + k * 7), '#eba14d', 1 - k);
          break;
        case 'ring': case 'buffring': ring(g, sx, sy, Math.round(5 + k * 10), Math.round(2 + k * 4), f.color, 1 - k); if (k < 0.6) for (let i = 0; i < 3; i++) star(g, sx - 6 + i * 6, sy - 6 - Math.round(k * 22) - (i % 2) * 5, 1, f.color); break;
        case 'groundring': ring(g, sx, sy, Math.round(8 + k * 34), Math.round(4 + k * 14), f.color, 1 - k); ring(g, sx, sy, Math.round(4 + k * 22), Math.round(2 + k * 9), '#ffffff', (1 - k) * 0.6); break;
        case 'debuff': for (let i = 0; i < 4; i++) { g.fillStyle = '#5a2c90'; g.globalAlpha = 1 - k; g.fillRect(sx - 6 + i * 4, sy - 6 - Math.round(k * 14) - (i % 2) * 4, 1, 2); } g.globalAlpha = 1; break;
        case 'fadepuff': g.globalAlpha = 0.6 * (1 - k); g.fillStyle = '#e8e4f0'; g.fillRect(sx - 3 - Math.round(k * 3), sy - 10, 2, 1); g.fillRect(sx + 2 + Math.round(k * 3), sy - 12, 2, 1); g.globalAlpha = 1; break;
        case 'death': {
          // a pale wisp rising out of the fallen, dithered, fading
          const wy = sy - 10 - Math.round(k * 28);
          g.save(); g.globalCompositeOperation = 'lighter'; ditherDisc(g, sx, wy, 3, '#b8c8ff', 0.8 * (1 - k)); g.restore();
          g.globalAlpha = 1 - k; g.fillStyle = '#eef2ff'; g.fillRect(sx, wy, 1, 1); g.globalAlpha = 1;
          break;
        }
        case 'levelup': {
          if (!drawAnim(g, 'levelup', null, Math.floor(age * 10), x, y, cam)) {
            const colH = Math.round(Math.min(1, k * 3) * 52);
            g.save(); g.globalCompositeOperation = 'lighter';
            g.globalAlpha = 1 - k; g.fillStyle = '#ffd67a'; g.fillRect(sx - 1, sy - colH, 3, colH); g.fillStyle = '#fff7d6'; g.fillRect(sx, sy - colH, 1, colH);
            g.restore();
          }
          ring(g, sx, sy, Math.round(6 + k * 24), Math.round(3 + k * 10), '#f9d77a', Math.max(0, 1 - k * 1.2));
          if (k < 0.8 && Math.floor(age * 30) % 2 === 0) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + age * 2; star(g, Math.round(sx + Math.cos(a) * (10 + k * 14)), Math.round(sy - 20 + Math.sin(a) * (8 + k * 8) - k * 16), 1, '#fff27a'); }
          break;
        }
        default: break;
      }
    }
    for (const p of sparks) {
      const k = (now - p.t0) / p.life;
      g.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1; g.fillStyle = p.color;
      g.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), 1, 1);
    }
    g.globalAlpha = 1;
  }

  // Persistent looks from the snapshot: stealth shimmer (fx sheet) or a dithered see-through; a ward ring.
  function auraLooks(e) {
    const out = [];
    for (const a of e.auras || []) {
      const id = String(a.id || '');
      for (const L of AURA_LOOKS) if (id.includes(L.match)) { out.push(L); break; }
    }
    return out;
  }
  function drawAuraLook(g, L, x, y, cam, now) {
    if (L.look === 'stealth') drawAnim(g, 'stealth', null, Math.floor(now * 8), x, y, cam, { alpha: 0.85 });
    else if (L.look === 'ward') { const p = Math.floor(now * 4) % 2; ring(g, x - cam.x, y - cam.y - 1, 9 + p, 4, L.color || '#fff1a8', 0.8); }
  }

  function lights(now) {
    const out = [];
    for (const [id, c] of casting) {
      const a = lastPos.get(id);
      if (!a || !c.light) continue;
      out.push({ x: a.x + (a.hand ? a.hand[0] : 0), y: a.y - (a.hand ? a.hand[1] : 18), r: 30 + (Math.floor((now - c.t0) * 8) % 2) * 2, rgb: c.light, k: 0.9, glow: 0.35 });
    }
    for (const f of fx) {
      if (!f.pos || now < f.t0) continue;
      const k = 1 - Math.min(1, (now - f.t0) / (f.dur || 1));
      const rgb = f.rgb || (f.light) || null;
      if (f.type === 'proj') { if (f.light) out.push({ x: f.pos.x, y: f.pos.y, r: 28, rgb: f.light, k: 1, glow: 0.4 }); continue; }
      if (!rgb) continue;
      const big = f.type === 'levelup' ? 72 : f.type === 'groundring' ? 56 : f.type === 'critflash' ? 40 : 34;
      if (['flash', 'heal', 'burst', 'ink_splash', 'levelup', 'groundring', 'critflash', 'buffring', 'taunt', 'ring'].includes(f.type)) {
        out.push({ x: f.pos.x, y: f.pos.y - (f.type === 'levelup' ? 12 : 10), r: big, rgb, k, glow: 0.3 * k });
      }
    }
    return out;
  }

  function drawNumbers(g, toHud, now) {
    const nf = numFont(), bf = bigFont();
    for (const n of floats) {
      const m = floaterMotion(n.style, now - n.t0, n.seed);
      if (!m) continue;
      const a = lastPos.get(n.dst);
      if (!a) continue;
      const [hx, hy] = toHud(a.x, a.y - (a.h || 24) - 2);
      const x = hx + m.dx, y = hy + m.dy;
      if (n.style === 'word') {
        if (nf && nf.words[n.word]) nf.drawWord(g, n.word, x, y - 6, { align: 'center', alpha: m.alpha });
        else fallbackText(g, n.word, x, y, '#d0d0d0', m.alpha);
        continue;
      }
      const big = (n.style === 'crit') && bf;
      const font = big ? bf : nf;
      const variant = { dmg: 'white', crit: 'crit', heal: 'heal', healcrit: 'heal', taken: 'red' }[n.style] || 'white';
      const text = n.style === 'healcrit' || n.style === 'crit' ? `${n.text}!` : n.text;
      if (font) font.draw(g, text, x, y - (big ? 10 : 6), { align: 'center', color: variant, alpha: m.alpha });
      else fallbackText(g, text, x, y, { dmg: '#f6f4ee', crit: '#f9d77a', heal: '#8fe07a', healcrit: '#8fe07a', taken: '#e06b39' }[n.style], m.alpha);
    }
  }

  // tiny 3x5 digits when the number font is not loaded
  const DIG = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', '+': '000010111010000', '!': '010010010000010' };
  function fallbackText(g, text, x, y, color, alpha) {
    const w = text.length * 4;
    let cx = Math.round(x - w / 2);
    g.globalAlpha = alpha;
    for (const ch of text) {
      const bits = DIG[ch];
      if (bits) for (let i = 0; i < 15; i++) if (bits[i] === '1') { g.fillStyle = '#14101e'; g.fillRect(cx + (i % 3) + 1, Math.round(y) + ((i / 3) | 0) + 1, 1, 1); g.fillStyle = color; g.fillRect(cx + (i % 3), Math.round(y) + ((i / 3) | 0), 1, 1); }
      cx += 4;
    }
    g.globalAlpha = 1;
  }

  return {
    feed, update, drawWorld, lights, drawNumbers, auraLooks, drawAuraLook,
    state(id, now) { const h = hints.get(id); return h ? { attackT0: h.attackT0, hurtT0: h.hurtT0, deathT0: h.deathT0, now } : null; },
    deathAt(id) { const h = hints.get(id); return h && h.deathT0 != null ? h.deathT0 : null; },
    /** True when a sim projectile id already has an event visual; prune(ids) keeps the set to live ids. */
    seenProjectile(id) { return seenSim.has(id); },
    pruneProjectiles(live) { if (seenSim.size > 64) for (const id of seenSim) if (!live.has(id)) seenSim.delete(id); },
    /** Forget hints of entities that are gone (corpse respawned, despawned). */
    clearHint(id) { hints.delete(id); },
    hurtAt(id) { const h = hints.get(id); return h && h.hurtT0 != null ? h.hurtT0 : null; },
    setPlayer(id) { playerId = id; },
    get counts() { return { fx: fx.length, sparks: sparks.length, floats: floats.length, casting: casting.size }; },
  };
}

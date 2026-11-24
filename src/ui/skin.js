// UI skin "Lantern and Vellum" (wave 6 uiskin, PLAN item 7; approved 2026-11-24 with the lane's answers): the DEFAULT window
// style for everyone, "Classic" (today's LQ frames) kept selectable in Settings for one wave. An original skin built in
// code, no image files. Night ink panels (the title screen's sky), a bronze and gilt frame with glyph rivets at the
// corners (the lexicon theme), lantern amber for what is chosen or pressed, and vellum pages for reading (quest text, the
// character ledger). Item quality is told by colour AND by shape, so it still reads for colour-blind players: common
// plain, magic corner ticks, rare corner studs, epic corner lozenges, legendary rivets and a gem, set chain links.
//
//   applySkin(g, art, id)   id 'lantern' | 'classic'. Lantern swaps g.window for its own frames (so every frame, button,
//                           slot and tooltip in the game follows) and sets g.skin: the reskinned windows (drawQuestLog,
//                           drawCharacter) and the item slot with quality borders. Classic puts today's g.window back and
//                           clears g.skin, so Classic is today's look pixel for pixel. Text size is gfx.js (g.big).
//   skinFromOptions(options, url)   the skin id: the ?skin= link flag overrides the saved option (review and tests).

import { drawQuestLogSkin, drawCharacterSkin } from './skin_windows.js';

export const SKINS = ['lantern', 'classic'];
export const DEFAULT_SKIN = 'lantern';
export function skinFromOptions(options, url = null) {
  const q = url && url.get ? url.get('skin') : null;
  if (SKINS.includes(q)) return q;
  return SKINS.includes(options && options.skin) ? options.skin : DEFAULT_SKIN;
}
/** The text size now: ?text=large|normal in the link, else the Settings choice, else Large on a phone (touch layout) and
 *  Normal on PC (options.text 'auto', the default). */
export function textSizeFrom(options, touch, url = null) {
  const q = url && url.get ? url.get('text') : null;
  if (q === 'large' || q === 'normal') return q;
  const o = options && options.text;
  if (o === 'large' || o === 'normal') return o;
  return touch ? 'large' : 'normal';
}

export const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const mix = (a, b, u) => a.map((v, i) => Math.round(v + (b[i] - v) * u));
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// today's scheme names (menus and HUD pass these) -> the skin's tones
export const TONES = {
  blue: { top: '#29254c', bot: '#100e1d', hi: '#6a63b0' },      // ink: the default panel, the title screen's night sky
  slate: { top: '#363244', bot: '#16131d', hi: '#9a93a8' },     // ash: quiet panes and empty slots
  crimson: { top: '#70262b', bot: '#2a0e13', hi: '#e07a62' },   // oxblood: close, abandon, hostile frames
  forest: { top: '#2e543a', bot: '#111d15', hi: '#8cc283' },    // moss: confirm, take, friendly frames
  ember: { top: '#c07a34', bot: '#5a2b12', hi: '#ffe0a0' },     // lantern: selected, pressed, the main action
  violet: { top: '#4f2e70', bot: '#1b1130', hi: '#c09ae8' },    // plum: touch skill buttons, glyph things
};
export const C = {
  ink: '#07060d', bronzeHi: '#e0b468', bronze: '#a87b3c', bronzeLo: '#5e3f1c', gilt: '#f9d77a', spark: '#fff4c8',
  page: '#eadbb6', pageLo: '#d3bf92', pageEdge: '#8a6a40', inkText: '#3a2618', sepia: '#7a5634', rubric: '#9a2f22',
};

const RIVET = [
  '.ooooo.',
  'obbbbbo',
  'obdgdbo',
  'obgsgbo',
  'obdgdbo',
  'obbbbbo',
  '.ooooo.',
];
const RIVET_COL = { o: C.ink, b: C.bronze, d: C.bronzeLo, g: C.gilt, s: C.spark };

function pix(ctx, map, cols, x, y) {
  for (let j = 0; j < map.length; j++) for (let i = 0; i < map[j].length; i++) {
    const k = map[j][i];
    if (k === '.') continue;
    ctx.fillStyle = cols[k]; ctx.fillRect(x + i, y + j, 1, 1);
  }
}

// a tiny deterministic grain so a large panel is not a flat gradient (no Math.random: same pixels every frame)
const grain = (x, y) => ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 7) - 3;

function fillGrain(g2, x0, y0, w, h, top, bot, alpha, amount = 1) {
  if (w <= 0 || h <= 0) return;
  const img = g2.createImageData(w, h), d = img.data, a = Math.round(alpha * 255);
  const t0 = hex(top), t1 = hex(bot);
  for (let y = 0; y < h; y++) {
    const c = mix(t0, t1, h > 1 ? y / (h - 1) : 0);
    for (let x = 0; x < w; x++) {
      const n = grain(x, y) * amount, o = (y * w + x) * 4;
      d[o] = c[0] + n; d[o + 1] = c[1] + n; d[o + 2] = c[2] + n; d[o + 3] = a;
    }
  }
  g2.putImageData(img, x0, y0);
}

function createSkin(g, art) {
  const make = art.makeCanvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const cache = new Map();
  const base = g.windowClassic || g.window;

  function panel(w, h, frame, scheme, alpha) {
    const key = `${w}x${h}:${frame}:${scheme}:${alpha}`;
    let c = cache.get(key);
    if (c) return c;
    const t = TONES[scheme] || TONES.blue;
    c = make(w, h);
    const x = c.getContext('2d');
    const fr = (cx, cy, cw, ch, col) => { x.fillStyle = col; x.fillRect(cx, cy, cw, ch); };
    if (frame === 'std' && w >= 16 && h >= 16) {
      fillGrain(x, 3, 3, w - 6, h - 6, t.top, t.bot, alpha, w * h > 6000 ? 1 : 0.5);
      // outer ink line (1 px corners left open), a two-row bronze band lit from the top left, an inner ink line
      fr(1, 0, w - 2, 1, C.ink); fr(1, h - 1, w - 2, 1, C.ink); fr(0, 1, 1, h - 2, C.ink); fr(w - 1, 1, 1, h - 2, C.ink);
      fr(1, 1, w - 2, 1, C.bronzeHi); fr(1, 1, 1, h - 2, C.bronzeHi);
      fr(1, h - 2, w - 2, 1, C.bronzeLo); fr(w - 2, 1, 1, h - 2, C.bronzeLo);
      fr(2, 2, w - 4, 1, C.bronze); fr(2, h - 3, w - 4, 1, C.bronze); fr(2, 2, 1, h - 4, C.bronze); fr(w - 3, 2, 1, h - 4, C.bronze);
      x.fillStyle = rgba(hex(C.ink), 0.9); x.fillRect(3, 3, w - 6, 1); x.fillRect(3, 3, 1, h - 6);
      // the gilt hairline, a manuscript's ruled margin
      if (w >= 40 && h >= 30) {
        x.fillStyle = rgba(hex(C.gilt), 0.22);
        x.fillRect(5, 5, w - 10, 1); x.fillRect(5, h - 6, w - 10, 1); x.fillRect(5, 6, 1, h - 12); x.fillRect(w - 6, 6, 1, h - 12);
      }
      if (w >= 30 && h >= 30) for (const [rx, ry] of [[0, 0], [w - 7, 0], [0, h - 7], [w - 7, h - 7]]) pix(x, RIVET, RIVET_COL, rx, ry);
      // a lozenge on the top band of the big windows
      if (w >= 160 && h >= 90) {
        const mx = Math.floor(w / 2);
        pix(x, ['...o...', '..obo..', '.obgbo.', 'obgsgbo', '.obgbo.', '..obo..', '...o...'], RIVET_COL, mx - 3, -1 + 0);
        fr(mx - 22, 1, 18, 1, C.gilt); fr(mx + 5, 1, 18, 1, C.gilt);
      }
    } else {
      // thin: panes, buttons, slots
      if (w < 6 || h < 6) { fr(0, 0, w, h, rgba(hex(t.bot), alpha)); cache.set(key, c); return c; }
      fillGrain(x, 2, 2, w - 4, h - 4, t.top, t.bot, alpha, 0.5);
      fr(1, 0, w - 2, 1, C.ink); fr(1, h - 1, w - 2, 1, C.ink); fr(0, 1, 1, h - 2, C.ink); fr(w - 1, 1, 1, h - 2, C.ink);
      fr(1, 1, w - 2, 1, C.bronzeHi); fr(1, 1, 1, h - 2, C.bronzeHi);
      fr(1, h - 2, w - 2, 1, C.bronzeLo); fr(w - 2, 2, 1, h - 3, C.bronzeLo);
      if (w >= 18 && h >= 18) {
        // buttons and slots big enough to touch: an inner ink line and gilt studs at the corners
        x.fillStyle = rgba(hex(C.ink), 0.8); x.fillRect(2, 2, w - 4, 1); x.fillRect(2, 3, 1, h - 5);
        for (const [sx, sy] of [[1, 1], [w - 3, 1], [1, h - 3], [w - 3, h - 3]]) { fr(sx, sy, 2, 2, C.gilt); }
        x.fillStyle = rgba(hex(t.hi), 0.3); x.fillRect(3, 3, w - 6, 1);
      } else { x.fillStyle = rgba(hex(t.hi), 0.35); x.fillRect(2, 2, w - 4, 1); }
    }
    if (cache.size > 400) cache.clear();
    cache.set(key, c);
    return c;
  }

  const skinWindow = function skinWindow(ctx, x, y, w, h, frame = 'std', scheme = 'blue', alpha = 0.92) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    ctx.drawImage(panel(w, h, frame === 'field' ? 'std' : frame, scheme, alpha), x, y);
  };

  /** A vellum page for reading: warm parchment, darker at the edges, a bronze rule. */
  function page(ctx, x, y, w, h) {
    const key = `page:${w}x${h}`;
    let c = cache.get(key);
    if (!c) {
      c = make(w, h);
      const p = c.getContext('2d');
      const img = p.createImageData(w, h), d = img.data, t0 = hex(C.page), t1 = hex(C.pageLo);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const edge = Math.min(i, j, w - 1 - i, h - 1 - j);
        const u = Math.min(1, (j / h) * 0.7 + (edge < 6 ? (6 - edge) / 9 : 0));
        const col = mix(t0, t1, u), n = grain(i, j) * 2, o = (j * w + i) * 4;
        d[o] = col[0] + n; d[o + 1] = col[1] + n; d[o + 2] = col[2] + n - 1; d[o + 3] = 255;
      }
      p.putImageData(img, 0, 0);
      p.fillStyle = C.pageEdge;
      p.fillRect(1, 0, w - 2, 1); p.fillRect(1, h - 1, w - 2, 1); p.fillRect(0, 1, 1, h - 2); p.fillRect(w - 1, 1, 1, h - 2);
      cache.set(key, c);
    }
    ctx.drawImage(c, Math.round(x), Math.round(y));
  }

  const cols0 = (col) => ({ o: C.ink, k: col });
  /** Quality border on an item box: colour and shape per rarity. */
  function quality(ctx, x, y, w, h, rarity) {
    const R = { junk: '#8e8997', common: '#b9ad94', magic: '#6f8cff', uncommon: '#6f8cff', rare: '#ffd34d', epic: '#b45cff', legendary: '#ff8a2a', set: '#3cdc6a' };
    const col = R[rarity] || R.common, dark = rgba(mix(hex(col), [0, 0, 0], 0.55));
    const f = (a, b, c2, d2, k) => { ctx.fillStyle = k; ctx.fillRect(a, b, c2, d2); };
    const ring = (i, k) => { f(x + i, y + i, w - 2 * i, 1, k); f(x + i, y + h - 1 - i, w - 2 * i, 1, k); f(x + i, y + i, 1, h - 2 * i, k); f(x + w - 1 - i, y + i, 1, h - 2 * i, k); };
    if (rarity === 'junk' || rarity === 'common' || !rarity) { ring(0, C.ink); ring(1, rarity === 'junk' ? R.junk : C.bronzeLo); return; }
    ring(0, C.ink);
    ring(1, col);
    if (rarity === 'magic' || rarity === 'uncommon') {
      for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
        f(Math.min(cx, cx + dx * 3), cy, 4, 1, col); f(cx, Math.min(cy, cy + dy * 3), 1, 4, col);
      }
      return;
    }
    ring(2, dark);
    // inner glow from the edges for epic and above
    if (rarity === 'epic' || rarity === 'legendary' || rarity === 'set') {
      const c = hex(col);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = rgba(c, 0.22 - i * 0.07); ctx.fillRect(x + 3 + i, y + 3 + i, w - 6 - 2 * i, 1); ctx.fillRect(x + 3 + i, y + h - 4 - i, w - 6 - 2 * i, 1); ctx.fillRect(x + 3 + i, y + 4 + i, 1, h - 8 - 2 * i); ctx.fillRect(x + w - 4 - i, y + 4 + i, 1, h - 8 - 2 * i); }
    }
    const corners = [[x, y], [x + w - 4, y], [x, y + h - 4], [x + w - 4, y + h - 4]];
    if (rarity === 'rare') { for (const [cx, cy] of corners) { f(cx, cy, 4, 4, C.ink); f(cx + 1, cy + 1, 2, 2, col); } return; }
    if (rarity === 'set') {
      // chain links across the middle of each side: one of a set, joined to the others
      const link = ['.oooo.', 'okkkko', 'ok..ko', 'okkkko', '.oooo.'];
      const my = y + Math.floor(h / 2) - 2, mx = x + Math.floor(w / 2) - 3;
      pix(ctx, link, cols0(col), mx, y - 2); pix(ctx, link, cols0(col), mx, y + h - 3);
      const linkV = ['.ooo.', 'okkko', 'ok.ko', 'ok.ko', 'okkko', '.ooo.'];
      pix(ctx, linkV, cols0(col), x - 2, my - 1); pix(ctx, linkV, cols0(col), x + w - 3, my - 1);
      return;
    }
    const cols = { o: C.ink, k: col, s: C.spark, d: dark };
    const at = [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]];
    if (rarity === 'epic') {
      // lozenges on the corners
      for (const [cx, cy] of at) pix(ctx, ['...o...', '..oko..', '.okkko.', 'okkskko', '.okkko.', '..oko..', '...o...'], cols, cx - 3, cy - 3);
      return;
    }
    // legendary: square rivets on the corners, a gem on the top edge and a second gilt ring inside
    ctx.fillStyle = rgba(hex(C.gilt), 0.55);
    ctx.fillRect(x + 3, y + 3, w - 6, 1); ctx.fillRect(x + 3, y + h - 4, w - 6, 1); ctx.fillRect(x + 3, y + 4, 1, h - 8); ctx.fillRect(x + w - 4, y + 4, 1, h - 8);
    for (const [cx, cy] of at) pix(ctx, ['oooooo', 'okkkko', 'okddko', 'okdsko', 'okkkko', 'oooooo'], cols, cx - 2, cy - 2);
    pix(ctx, ['..o..', '.oko.', 'oksko', '.oko.', '..o..'], cols, x + Math.floor(w / 2) - 2, y - 2);
  }

  /** Text through the bitmap fonts with control over the shadow (ink text on a page has none). */
  const font = (big) => (big ? g.large : g.font);
  function ink(ctx, s, x, y, color, o = {}) {
    return font(o.big).draw(ctx, s, x, y, { color, align: o.align || 'left', shadow: o.shadow ?? false }).width;
  }

  /** The item slot with quality borders (menus.js itemSlot calls this when a skin is on). */
  function itemSlot(ctx, env, r, it, emptyIcon, itemInfo) {
    const i = it ? itemInfo(it) : null;
    g.window(ctx, r.x, r.y, r.w, r.h, 'thin', i ? 'blue' : 'slate', i ? 0.95 : 0.7);
    if (i) {
      g.iconIn(ctx, i.icon || 'icon_bag', r.x, r.y, r.w, r.h);
      quality(ctx, r.x, r.y, r.w, r.h, i.rarity || 'common');
      const q = it.qty || 1;
      if (q > 1) g.num(ctx, String(q), r.x + r.w - 2, r.y + r.h - 12, 'white', false, 'right');
    } else if (emptyIcon) g.iconIn(ctx, emptyIcon, r.x, r.y, r.w, r.h, 0.3);
  }

  const skin = { id: 'lantern', window: skinWindow, base, page, quality, ink, font, itemSlot, tones: TONES, C };
  Object.defineProperty(skin, 'big', { get: () => g.big });
  skin.drawQuestLog = (ctx, env, m, st, regions, act) => drawQuestLogSkin(ctx, env, m, st, regions, act, skin);
  skin.drawCharacter = (ctx, env, m, st, regions, act) => drawCharacterSkin(ctx, env, m, st, regions, act, skin);
  return skin;
}

/** Put a window style on the gfx object (see the top of this file). Returns the skin id now on. */
export function applySkin(g, art, id) {
  if (!g.windowClassic) g.windowClassic = g.window;
  if (id === 'lantern') {
    if (!g.lantern) g.lantern = createSkin(g, art);
    g.window = g.lantern.window;
    g.skin = g.lantern;
    return 'lantern';
  }
  g.window = g.windowClassic;
  g.skin = null;
  return 'classic';
}

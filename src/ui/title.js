// The welcome screen, Heroes (character select) and character creation. The welcome and Heroes screens are drawn on the
// whole UI layer over the live 3D Lantern Square (main.js titleView: the last hero stands in it, render-only); with no
// 3D (loading, 2D) a night backdrop stands in. Brief: docs/handoff/briefs/BRIEF_welcome_screen.md (Scott, 2026-11-27).
import { classInfo, classOrder, abilityInfo } from './gamedata.js';
import { validateName, MAX_CHARS, LOOKS, NAME_MAX } from './save.js';
import { START_REALMS } from '../data/rootbound.js';   // big world: a class's start realm (the choice on creation)

const W = 640, H = 360;
const DIRS = ['down', 'left', 'up', 'right'];

/** The night backdrop behind every pre-game screen while the 3D square is not up (loading, 2D, creation): a deep blue
 *  wash with a warm glow low down, over the whole layer. Lexicon Quest's key art is no longer used (Scott 2026-11-27). */
export function drawBackdrop(ctx, env, dim = 0) {
  const { g } = env;
  const tr = ctx.getTransform ? ctx.getTransform() : { e: 0, f: 0 };
  const LW = ctx.canvas ? ctx.canvas.width : W, LH = ctx.canvas ? ctx.canvas.height : H;
  const x0 = -tr.e, y0 = -tr.f, w = Math.max(W, LW), h = Math.max(H, LH);
  const sky = ctx.createLinearGradient(0, y0, 0, y0 + h);
  sky.addColorStop(0, '#0b0a1c'); sky.addColorStop(0.6, '#1a1630'); sky.addColorStop(1, '#3a2630');
  ctx.fillStyle = sky; ctx.fillRect(x0, y0, w, h);
  const glow = ctx.createRadialGradient(x0 + w * 0.62, y0 + h * 1.05, 10, x0 + w * 0.62, y0 + h * 1.05, h * 0.9);
  glow.addColorStop(0, 'rgba(255,176,90,0.32)'); glow.addColorStop(1, 'rgba(255,176,90,0)');
  ctx.fillStyle = glow; ctx.fillRect(x0, y0, w, h);
  if (dim) g.scrim(ctx, x0, y0, w, h, Math.round(dim / 3));
}

function button(ctx, env, regions, r, label, on, { scheme = 'blue', color = 'cream', enabled = true, large = false, align = 'center', tag = null } = {}) {
  const { g } = env;
  g.window(ctx, r.x, r.y, r.w, r.h, 'thin', enabled ? scheme : 'slate', 0.95);
  const tx = align === 'left' ? r.x + 12 : r.x + Math.floor(r.w / 2);
  g.text(ctx, g.clip(label, r.w - 10), tx, r.y + Math.floor(r.h / 2) - (large ? 8 : 6), enabled ? color : 'dim', { align, large });
  if (enabled) regions.push({ rect: r, kind: 'button', on, label: tag || label });   // tag: the name drivers press it by
}

function drawFullscreenHelp(ctx, env, st, regions, L) {
  const { g } = env;
  const lines = ['To play full screen on an iPhone:', '1. Tap the Share button in your browser.', '2. Choose Add to Home Screen, then Add.', '3. Open Lexicon Realms from your home screen.', 'A hero made in the browser does not carry over.'];
  const w = 300, h = 34 + lines.length * 16 + 30, x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
  g.window(ctx, x, y, w, h, 'thin', 'blue', 0.97);
  lines.forEach((ln, i) => g.text(ctx, ln, x + 14, y + 14 + i * 16, i === 0 ? 'gold' : (i === lines.length - 1 ? 'dim' : 'cream')));
  const bh = Math.max(20, env.L.minHit || 0);
  button(ctx, env, regions, { x: x + w - 84, y: y + h - bh - 8, w: 74, h: bh }, 'Got it', () => { st.fsHelp = false; });
}

/** The left-hand shade that keeps the menu readable over the live square (and a little at the bottom). */
function shade(ctx, L, wide) {
  const gr = ctx.createLinearGradient(0, 0, L.W * wide, 0);
  gr.addColorStop(0, 'rgba(8,7,16,0.82)'); gr.addColorStop(0.7, 'rgba(8,7,16,0.45)'); gr.addColorStop(1, 'rgba(8,7,16,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, L.W, L.H);
  const gb = ctx.createLinearGradient(0, L.H * 0.7, 0, L.H);
  gb.addColorStop(0, 'rgba(8,7,16,0)'); gb.addColorStop(1, 'rgba(8,7,16,0.6)');
  ctx.fillStyle = gb; ctx.fillRect(0, 0, L.W, L.H);
}

/** Where a hero stopped; a hero not yet played starts in its class's realm (unless it chose Willowmere). */
function whereOf(c) {
  if (c.zoneName) return c.zoneName;
  const R = START_REALMS[c.cls];
  return c.start === 'realm' && R ? R.name : 'Willowmere';
}

/** "Played today", "3 days ago": from the save's own savedAt (ms). */
export function playedWhen(ms, now = Date.now()) {
  if (!Number.isFinite(ms) || ms <= 0) return 'not played yet';
  const day = (d) => { const o = new Date(d); return new Date(o.getFullYear(), o.getMonth(), o.getDate()).getTime(); };
  const n = Math.round((day(now) - day(ms)) / 86400000);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 7) return `${n} days ago`;
  if (n < 14) return 'last week';
  if (n < 60) return `${Math.floor(n / 7)} weeks ago`;
  return `${Math.floor(n / 30)} months ago`;
}

/** Time played, from the store's `played` seconds: "35 min", "4 h". */
export function playedFor(sec) {
  const s = Math.max(0, sec | 0);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  return `${Math.floor(s / 3600)} h`;
}

/** Average item level of what the hero wears (the save's equip): an instance's own ilvl, else the item's level. */
export function heroItemLevel(equip, itemInfo) {
  const vals = [];
  for (const v of Object.values(equip || {})) {
    if (!v) continue;
    const id = typeof v === 'string' ? v : v.item;
    const ilvl = (typeof v === 'object' && v.inst && v.inst.ilvl) || ((itemInfo(id) || {}).level) || 0;
    if (ilvl) vals.push(ilvl);
  }
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

/** The loading line along the bottom of the Continue card (or the first button) while the 3D square loads. */
function loadBar(ctx, env, r, sc) {
  if (!sc || !sc.is3d || sc.ready) return;
  const { g } = env;
  g.rect(ctx, r.x + 3, r.y + r.h - 4, r.w - 6, 2, 'rgba(20,16,30,0.85)');
  g.rect(ctx, r.x + 3, r.y + r.h - 4, Math.round((r.w - 6) * Math.max(0, Math.min(1, sc.k || 0))), 2, '#f9d77a');
}

export function drawTitle(ctx, env, st, regions, act, t) {
  const { g } = env;
  const L = env.L, phone = !!L.touch;
  const T = env.title || {};
  const sc = T.scene || null;
  const live = !!(sc && sc.ready);
  if (live) shade(ctx, L, phone ? 0.62 : 0.5); else drawBackdrop(ctx, env);
  const mx = phone ? 22 : 34;
  // logo, top left; the line under it is a draft (Scott may give his own words)
  const logo = env.art.logo, ls = phone ? 0.62 : 0.8, top = phone ? 10 : 26;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(logo, mx - 4, top, Math.round(logo.width * ls), Math.round(logo.height * ls));
  ctx.imageSmoothingEnabled = false;
  g.text(ctx, 'Five callings. One lantern-lit world.', mx, top + Math.round(logo.height * ls) + 2, 'cream');
  if (st.fsHelp) { drawFullscreenHelp(ctx, env, st, regions, L); return; }
  const chars = act.store.list();
  const last = chars[0] || null;
  const bw = phone ? 214 : 220, bh = Math.max(20, L.minHit || 0);
  // a phone: the menu sits low on the left, in thumb reach, sized from the real button height (two rows of two)
  let y = phone ? Math.max(top + Math.round(logo.height * ls) + 18, L.H - 10 - 52 - 6 - 2 * (bh + 6)) : 132;
  if (last) {
    // Continue: one tap back into the world with the last hero played
    const ch = phone ? 52 : 50, r = { x: mx, y, w: bw, h: ch };
    const ci = classInfo(last.cls);
    g.window(ctx, r.x, r.y, r.w, r.h, 'thin', 'forest', 0.96);
    env.charArt.portrait(ctx, last.cls, last.look, r.x + 7, r.y + Math.floor((ch - 34) / 2), 34, 34);
    g.text(ctx, 'Continue', r.x + 48, r.y + 6, 'cream', { large: true });   // (fixed words: never clipped)
    g.text(ctx, g.clip(`${last.name}, level ${last.level} ${ci ? ci.name : last.cls}`, bw - 54), r.x + 48, r.y + 24, 'gold');
    const where = sc && sc.is3d && !sc.ready ? `Loading the world ${Math.round((sc.k || 0) * 100)}%` : whereOf(last);
    g.text(ctx, g.clip(where, bw - 54), r.x + 48, r.y + 36, 'gray');
    loadBar(ctx, env, r, sc);
    regions.push({ rect: r, kind: 'button', label: 'Continue', on: () => act.enter(last.id) });
    y += ch + 6;
  } else {
    // a brand-new player: one big way in
    const r = { x: mx, y, w: bw, h: Math.max(30, bh + 8) };
    button(ctx, env, regions, r, 'Begin your tale', () => act.go('create'), { scheme: 'forest', large: true });
    loadBar(ctx, env, r, sc);
    y += r.h + 6;
  }
  const friends = !!st.friendsOpen && !!last;
  const items = [];
  if (last) items.push(['Heroes', () => act.go('select'), 'blue', true]);
  if (last) items.push(['New hero', () => act.go('create'), 'blue', !act.store.full()]);
  if (last && act.host && act.join) items.push([friends ? 'Close' : 'Play with friends', () => { st.friendsOpen = !friends; }, 'violet', true]);
  items.push(['Options', () => { st.open.add('menu'); }, 'slate', true]);
  if (phone) {
    const hw = Math.floor((bw - 6) / 2);
    items.forEach(([label, on, sch, en], i) => {
      button(ctx, env, regions, { x: mx + (i % 2) * (hw + 6), y: y + Math.floor(i / 2) * (bh + 6), w: hw, h: bh }, label, on, { scheme: sch, enabled: en });
    });
    y += Math.ceil(items.length / 2) * (bh + 6);
  } else {
    for (const [label, on, sch, en] of items) { button(ctx, env, regions, { x: mx, y, w: bw, h: bh }, label, on, { scheme: sch, enabled: en, align: 'left' }); y += bh + 4; }
  }
  if (friends) {
    // co-op with the last hero (docs/NET.md): host for up to 3 friends, or join a friend's game by its code
    const fw = phone ? 214 : 220, fx = mx + bw + 8, fy = phone ? Math.max(top + Math.round(logo.height * ls) + 18, L.H - 10 - 52 - 6 - 2 * (bh + 6)) : 132;
    const box = { x: fx, y: fy, w: Math.min(fw, L.W - fx - 12), h: 2 * bh + 34 };
    g.window(ctx, box.x, box.y, box.w, box.h, 'thin', 'violet', 0.96);
    g.text(ctx, g.clip(`Play as ${last.name}`, box.w - 16), box.x + 8, box.y + 6, 'gold');
    button(ctx, env, regions, { x: box.x + 8, y: box.y + 22, w: box.w - 16, h: bh }, 'Host a game', () => { st.friendsOpen = false; act.host(last.id); }, { scheme: 'violet' });
    button(ctx, env, regions, { x: box.x + 8, y: box.y + 26 + bh, w: box.w - 16, h: bh }, 'Join a game', () => { st.friendsOpen = false; act.join(last.id); }, { scheme: 'violet' });
  }
  if (act.store.full() && !phone) g.text(ctx, `All ${MAX_CHARS} hero slots are used.`, mx, y + 2, 'orange');   // why New hero is greyed out
  // what is new (src/data/news.js): hides once the player closes it, until the next one
  const news = T.news;
  if (news && !T.newsSeen) {
    const hide = () => { if (T.markNews) T.markNews(news.id); };
    if (phone) {
      const nh = Math.max(20, L.minHit || 0), nw = Math.min(250, L.W - mx - bw - 30), nx = L.W - nw - 14, ny = L.H - nh - 10;
      g.window(ctx, nx, ny, nw, nh, 'thin', 'ember', 0.92);
      g.text(ctx, g.clip(`New: ${news.short || news.title}`, nw - 26), nx + 8, ny + Math.floor(nh / 2) - 6, 'cream');
      g.text(ctx, 'x', nx + nw - 10, ny + Math.floor(nh / 2) - 6, 'gray', { align: 'center' });
      regions.push({ rect: { x: nx, y: ny, w: nw, h: nh }, kind: 'button', label: 'news', on: hide });
    } else {
      const nw = 236, lines = news.lines || [], nh = 34 + lines.length * 12 + 6, nx = L.W - nw - 24, ny = L.H - nh - 24;
      g.window(ctx, nx, ny, nw, nh, 'thin', 'ember', 0.92);
      g.text(ctx, 'New this week', nx + 10, ny + 6, 'gold');
      g.text(ctx, g.clip(news.title, nw - 20), nx + 10, ny + 21, 'cream', { large: true });
      lines.forEach((ln, i) => g.text(ctx, g.clip(ln, nw - 20), nx + 10, ny + 40 + i * 12, 'gray'));
      g.text(ctx, 'x', nx + nw - 10, ny + 5, 'gray', { align: 'center' });
      regions.push({ rect: { x: nx + nw - 18, y: ny, w: 18, h: 16 }, kind: 'button', label: 'news', on: hide });
    }
  }
  // phone full screen: a small corner chip
  if (phone && act.canFullscreen && act.canFullscreen()) {
    const s = Math.max(24, L.minHit || 0), fx = L.W - s - 12, fy = 10;
    g.window(ctx, fx, fy, s, s, 'thin', 'slate', 0.85);
    const c = '#f3e6c4', ix = fx + Math.floor(s / 2) - 6, iy = fy + Math.floor(s / 2) - 6, k = 12;
    for (const [ax, ay, dx, dy] of [[0, 0, 1, 1], [k, 0, -1, 1], [0, k, 1, -1], [k, k, -1, -1]]) {
      g.rect(ctx, dx > 0 ? ix + ax : ix + ax - 4, dy > 0 ? iy + ay : iy + ay - 1, 4, 1, c);
      g.rect(ctx, dx > 0 ? ix + ax : ix + ax - 1, dy > 0 ? iy + ay : iy + ay - 4, 1, 4, c);
    }
    regions.push({ rect: { x: fx, y: fy, w: s, h: s }, kind: 'button', label: 'Full screen', on: () => act.fullscreen() });
  }
  // the build tag: bottom left on a desktop; a phone's bottom left is the menu, so it goes top right
  if (T.build) {
    if (phone) g.text(ctx, `Build ${T.build}`, L.W - Math.max(24, L.minHit || 0) - 20, 14, 'dim', { align: 'right' });
    else g.text(ctx, `Build ${T.build}`, mx, L.H - 14, 'dim');
  }
}

// ---------------------------------------------------------------- heroes (character select)

const rwHead = (phone) => (phone ? 130 : 150);   // the loading line sits right of the Your heroes heading

export function drawSelect(ctx, env, st, regions, act, t) {
  const { g } = env;
  const L = env.L, phone = !!L.touch;
  const T = env.title || {};
  const sc = T.scene || null, live = !!(sc && sc.ready);
  const chars = act.store.list();
  if (!chars.length) { act.go('create'); return; }
  if (!chars.find((c) => c.id === st.selId)) st.selId = chars[0].id;
  if (live) shade(ctx, L, phone ? 0.5 : 0.38); else drawBackdrop(ctx, env);
  const mx = phone ? 14 : 34;
  g.text(ctx, 'Your heroes', mx, phone ? 8 : 22, 'gold', { large: true });
  if (sc && sc.is3d && !sc.ready) g.text(ctx, `Loading the world ${Math.round((sc.k || 0) * 100)}%`, mx + rwHead(phone), phone ? 12 : 26, 'gray');
  // the roster, most recently played first
  const rw = phone ? 196 : 214;
  const top = phone ? 28 : 46, room = L.H - top - (phone ? 30 : 40);
  const want = chars.length + (act.store.full() ? 0 : 1);                 // every hero, and the New hero row
  const rh = Math.max(Math.max(30, L.minHit || 0), Math.min(Math.max(phone ? 38 : 44, L.minHit || 0), Math.floor(room / want) - 4));
  const fit = Math.max(1, Math.floor(room / (rh + 4)));
  // more heroes than fit (a phone's tall rows): a window onto the list that keeps the chosen hero in view, and arrows
  const n = Math.min(MAX_CHARS, chars.length), selI = Math.max(0, chars.findIndex((o) => o.id === st.selId));
  const span = want > fit ? fit : n;
  let off = Math.max(0, Math.min(n - span, st.rosterOff || 0));
  if (selI < off) off = selI; else if (selI >= off + span) off = selI - span + 1;
  st.rosterOff = off;
  if (want > fit) {
    const ab = Math.max(18, L.minHit || 0);
    if (off > 0) button(ctx, env, regions, { x: mx + rw - 2 * ab - 4, y: Math.max(0, top - ab - 2), w: ab, h: ab }, '^', () => { st.rosterOff = off - 1; st.selId = chars[off - 1].id; }, { scheme: 'slate', tag: 'roster_up' });
    if (off + span < n) button(ctx, env, regions, { x: mx + rw - ab, y: Math.max(0, top - ab - 2), w: ab, h: ab }, 'v', () => { st.rosterOff = off + 1; st.selId = chars[off + span].id; }, { scheme: 'slate', tag: 'roster_down' });
  }
  let y = top;
  chars.slice(off, off + span).forEach((c) => {
    const sel = c.id === st.selId, ci = classInfo(c.cls);
    g.window(ctx, mx, y, rw, rh, 'thin', sel ? 'ember' : 'slate', sel ? 0.96 : 0.82);
    env.charArt.portrait(ctx, c.cls, c.look, mx + 6, y + Math.floor((rh - 30) / 2), 30, 30);
    const tag = `${c.level} ${ci ? ci.name : c.cls}`;
    g.text(ctx, tag, mx + rw - 8, y + 7, sel ? 'gold' : 'gray', { align: 'right' });
    g.text(ctx, g.clip(c.name, rw - 54 - g.textW(tag), true), mx + 42, y + 5, sel ? 'cream' : 'white', { large: true });
    const when = playedWhen(c.state && c.state.savedAt);
    g.text(ctx, g.clip(`${whereOf(c)}, ${when}`, rw - 48), mx + 42, y + rh - 18, 'gray');
    regions.push({ rect: { x: mx, y, w: rw, h: rh }, kind: 'char_row', on: () => { if (st.selId === c.id && st.lastClick && t - st.lastClick < 0.4) act.enter(c.id); st.selId = c.id; st.confirm = null; st.lastClick = t; } });
    y += rh + 4;
  });
  if (!act.store.full() && off + span >= n && y + rh - 8 <= top + room) {
    g.window(ctx, mx, y, rw, rh - 8, 'thin', 'slate', 0.5);
    g.text(ctx, '+ New hero', mx + rw / 2, y + Math.floor((rh - 8) / 2) - 6, 'cream', { align: 'center' });
    regions.push({ rect: { x: mx, y, w: rw, h: rh - 8 }, kind: 'button', label: 'New', on: () => act.go('create') });
  }
  const bb = Math.max(18, L.minHit || 0);
  button(ctx, env, regions, { x: mx, y: L.H - bb - (phone ? 6 : 14), w: 70, h: bb }, 'Back', () => act.go('title'), { scheme: 'slate' });
  // the hero card, right
  const c = chars.find((o) => o.id === st.selId);
  const ci = classInfo(c.cls);
  const s = c.state || {};
  const cw = phone ? 190 : 206, cx = L.W - cw - (phone ? 12 : 28), cy = phone ? 28 : 46;
  const bh = Math.max(20, L.minHit || 0);
  const ch = phone ? L.H - cy - 8 : Math.min(L.H - cy - 40, 236);
  g.window(ctx, cx, cy, cw, ch, 'thin', 'blue', 0.92);
  g.text(ctx, g.clip(c.name, cw - 20, true), cx + 10, cy + 6, 'cream', { large: true });
  g.text(ctx, g.clip(`Level ${c.level} ${ci ? ci.name : ''}${ci && ci.role ? `, ${ci.role}` : ''}`, cw - 20), cx + 10, cy + 24, 'gold');
  const rows = [];
  const il = T.itemInfo ? heroItemLevel(s.equip, T.itemInfo) : null;
  if (il) rows.push(['Item level', String(il)]);
  if (s.renown && s.renown.level) rows.push(['Renown', String(s.renown.level)]);
  rows.push(['Gold', (s.gold || 0).toLocaleString('en-US')]);
  if (c.played) rows.push(['Time played', playedFor(c.played)]);
  let ry = cy + 42;
  const rowH = phone ? 12 : 13;
  for (const [k, v] of rows) { g.text(ctx, k, cx + 10, ry, 'gray'); g.text(ctx, v, cx + cw - 10, ry, 'white', { align: 'right' }); ry += rowH; }
  if (c.navQuest && T.questName) {
    ry += 3;
    g.text(ctx, 'Tracking', cx + 10, ry, 'gold'); ry += 12;
    g.text(ctx, g.clip(T.questName(c.navQuest), cw - 20), cx + 10, ry, 'cream'); ry += 12;
  }
  // no 3D square (2D, or still loading): the walking sprite in the card's free space
  if (!live && ry + 70 < cy + ch - 3 * (bh + 5) - 6) stage(ctx, env, c.cls, c.look, { x: cx, y: ry, w: cw, h: cy + ch - 3 * (bh + 5) - 6 - ry }, t);
  // buttons: Enter world (big), Host and Join, Delete (press twice)
  const by = cy + ch - 3 * (bh + 5) - 3;
  button(ctx, env, regions, { x: cx + 8, y: by, w: cw - 16, h: bh }, 'Enter world', () => act.enter(c.id), { scheme: 'forest', large: true, tag: 'Enter World' });
  const hw = Math.floor((cw - 16 - 5) / 2);
  if (act.host && act.join) {
    button(ctx, env, regions, { x: cx + 8, y: by + bh + 5, w: hw, h: bh }, 'Host', () => act.host(c.id), { scheme: 'violet', tag: 'Host a game' });
    button(ctx, env, regions, { x: cx + 13 + hw, y: by + bh + 5, w: hw, h: bh }, 'Join', () => act.join(c.id), { scheme: 'violet', tag: 'Join a game' });
  }
  const confirm = st.confirm === `delete:${c.id}`;
  button(ctx, env, regions, { x: cx + 8, y: by + 2 * (bh + 5), w: cw - 16, h: bh }, confirm ? `Delete ${c.name} for good?` : 'Delete', () => {
    if (confirm) { act.store.remove(c.id); st.confirm = null; st.selId = null; act.toast(`${c.name} was deleted.`); if (!act.store.list().length) act.go('title'); }
    else st.confirm = `delete:${c.id}`;
  }, { scheme: confirm ? 'crimson' : 'slate', color: confirm ? 'orange' : 'gray', tag: confirm ? 'Press again' : 'Delete' });
}

/** A small stage with the hero walking in place, turning every 1.2 s, at an integer 2x (zoom 2 size). */
function stage(ctx, env, cls, look, P, t) {
  const { g, charArt } = env;
  const sx = P.x + Math.floor(P.w / 2), sy = P.y + P.h - 40;
  g.rect(ctx, sx - 50, sy - 2, 100, 6, 'rgba(20,16,30,0.45)');
  g.rect(ctx, sx - 40, sy + 4, 80, 2, 'rgba(20,16,30,0.3)');
  const dir = DIRS[Math.floor(t / 1.2) % 4];
  const anim = Math.floor(t / 4.8) % 2 === 0 ? 'walk' : (Math.floor(t / 2.4) % 2 === 0 ? 'attack' : 'cast');
  // draw at 1x into a scratch canvas, then blit 2x (nearest)
  const sc = env.scratch(48, 48);
  const sg = sc.getContext('2d');
  sg.clearRect(0, 0, 48, 48);
  charArt.draw(sg, cls, look, anim === 'walk' ? 'walk' : anim, dir, t, 24, 44);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sc, 0, 0, 48, 48, sx - 48, sy - 88, 96, 96);
}

// ---------------------------------------------------------------- character creation

export function drawCreate(ctx, env, st, regions, act, t) {
  const { g } = env;
  drawBackdrop(ctx, env, 160);
  g.text(ctx, 'New Character', W / 2, 8, 'gold', { large: true, align: 'center' });
  const order = classOrder();
  if (!st.cls) st.cls = order[0];
  st.look = st.look || 0;
  const touch = env.L.touch, mh = Math.max(22, env.L.minHit || 0);

  // ---- classes (left)
  const C = { x: 16, y: 32, w: 150, h: 294 };
  g.window(ctx, C.x, C.y, C.w, C.h, 'std', 'blue', 0.94);
  g.text(ctx, 'Class', C.x + 8, C.y + 5, 'gold');
  const rowH = Math.max(46, mh);
  order.forEach((id, i) => {
    const ci = classInfo(id);
    const y = C.y + 20 + i * (Math.min(rowH, 54));
    const h = Math.min(rowH, 52);
    const on = st.cls === id;
    g.window(ctx, C.x + 5, y, C.w - 10, h, 'thin', on ? 'ember' : 'slate', on ? 0.95 : 0.75);
    env.charArt.portrait(ctx, id, on ? st.look : 0, C.x + 9, y + Math.floor((h - 28) / 2), 28, 28);
    g.text(ctx, ci.name, C.x + 42, y + 6, on ? 'cream' : 'white', { large: true });
    g.text(ctx, ci.role, C.x + 42, y + 24, on ? 'gold' : 'gray');
    regions.push({ rect: { x: C.x + 5, y, w: C.w - 10, h }, kind: 'class', id, on: () => { st.cls = id; st.err = null; } });
  });

  // ---- preview + looks (middle)
  const P = { x: 174, y: 32, w: 200, h: 200 };
  g.window(ctx, P.x, P.y, P.w, P.h, 'std', 'violet', 0.85);
  stage(ctx, env, st.cls, st.look, P, t);
  const looks = env.charArt.looks(st.cls);
  g.text(ctx, 'Look', P.x + 8, P.y + 5, 'gold');
  const lw = Math.floor((P.w - 8 - (LOOKS - 1) * 4) / LOOKS);
  const ly = P.y + P.h + 4;
  for (let i = 0; i < LOOKS; i++) {
    const x = P.x + 4 + i * (lw + 4);
    const on = st.look === i;
    g.window(ctx, x, ly, lw, Math.max(40, mh), 'thin', on ? 'ember' : 'slate', 0.95);
    env.charArt.portrait(ctx, st.cls, i, x + Math.floor((lw - 28) / 2), ly + 3, 28, 28);
    g.text(ctx, String(i + 1), x + 3, ly + 1, on ? 'gold' : 'gray');
    regions.push({ rect: { x, y: ly, w: lw, h: Math.max(40, mh) }, kind: 'look', on: () => { st.look = i; } });
  }
  if (looks[st.look]) {
    const lines = g.wrap(looks[st.look].replace(/^./, (c) => c.toUpperCase()), P.w);
    lines.slice(0, 2).forEach((ln, i) => g.text(ctx, ln, P.x + P.w / 2, ly + Math.max(40, mh) + 4 + i * 11, 'dim', { align: 'center' }));
  }

  // ---- class description + name (right)
  const D = { x: 382, y: 32, w: 242, h: 294 };
  g.window(ctx, D.x, D.y, D.w, D.h, 'std', 'blue', 0.94);
  const ci = classInfo(st.cls);
  let y = D.y + 6;
  g.text(ctx, ci.name, D.x + 9, y, 'gold', { large: true });
  g.text(ctx, ci.role, D.x + D.w - 9, y + 4, 'cream', { align: 'right' }); y += 19;
  // the two-line description: the class's "plays like" line (CLASSES.md), wrapped to two lines
  const desc = ci.plays ? ci.plays.charAt(0).toUpperCase() + ci.plays.slice(1) : ci.kit;
  const dl = g.wrap(desc, D.w - 18);
  dl.slice(0, 2).forEach((ln, i) => g.text(ctx, i === 1 && dl.length > 2 ? g.clip(ln + ' ' + dl.slice(2).join(' '), D.w - 18) : ln, D.x + 9, y + i * 11, 'white'));
  y += 26;
  g.text(ctx, `Resource: ${ci.resource}.  ${(ci.gear || '').split('.')[0]}.`, D.x + 9, y, 'gray'); y += 13;
  // class identity pass: one strength line and one weakness line (classes.js identity)
  if (ci.strong || ci.weak) {
    const lw = Math.max(g.textW('Strong: '), g.textW('Weak: '));
    const lab = (word, text, color) => {
      g.text(ctx, word, D.x + 9, y, color);
      g.text(ctx, g.clip(text || '', D.w - 18 - lw), D.x + 9 + lw, y, 'white');
      y += 11;
    };
    lab('Strong:', ci.strong, 'green');
    lab('Weak:', ci.weak, 'red');
    y += 3;
  }
  g.text(ctx, 'First abilities', D.x + 9, y, 'gold'); y += 13;
  for (const aid of ci.abilities.filter((a) => (abilityInfo(a) || {}).learnLevel <= 1)) {
    const a = abilityInfo(aid);
    g.window(ctx, D.x + 9, y, 18, 18, 'thin', 'blue', 0.95);
    g.iconIn(ctx, a.icon, D.x + 9, y, 18, 18);
    g.text(ctx, a.name, D.x + 32, y + 3, 'white');
    regions.push({ rect: { x: D.x + 9, y, w: D.w - 18, h: 18 }, kind: 'ability', tipAbility: aid });
    y += 21;
  }
  // name field
  y = D.y + 168;
  g.text(ctx, 'Name', D.x + 9, y, 'gold');
  g.text(ctx, `2 to ${NAME_MAX} letters`, D.x + D.w - 9, y, 'dim', { align: 'right' });
  y += 13;
  const fh = Math.max(20, mh);
  const field = { x: D.x + 9, y, w: D.w - 18, h: fh };
  g.window(ctx, field.x, field.y, field.w, field.h, 'thin', st.nameFocus ? 'ember' : 'slate', 0.95);
  const name = st.name || '';
  const shown = name || (st.nameFocus ? '' : touch ? 'Tap to type a name' : 'Type a name');
  g.text(ctx, shown, field.x + 6, field.y + Math.floor((fh - 16) / 2), name ? 'cream' : 'dim', { large: !!name });
  if (st.nameFocus && Math.floor(t * 2) % 2 === 0) g.rect(ctx, field.x + 7 + (name ? g.textW(name, true) : 0), field.y + 4, 1, fh - 8, '#fff7d6');
  regions.push({ rect: field, kind: 'name_field', on: () => act.focusName() });
  y += fh + 4;
  const v = validateName(name, act.store.list());
  const msg = st.err || (name && !v.ok ? v.reason : '');
  if (msg) g.text(ctx, msg, D.x + 9, y, 'red'); else if (name && v.ok) g.text(ctx, `You will be ${v.name}.`, D.x + 9, y, 'green');
  // buttons
  const bh = Math.max(22, mh), bw = Math.floor((D.w - 24) / 2);
  const by = D.y + D.h - bh - 8;
  // big world: where to start. A class with a start realm (the Scribe: the Rootbound) starts there unless the player picks
  // Willowmere; the others start in Willowmere as before
  const realm = START_REALMS[st.cls] || null;
  const sy = by - Math.max(18, Math.round(mh * 0.8)) - 4;
  if (realm) {
    const want = st.start === 'willowmere' ? 'willowmere' : 'realm';
    g.text(ctx, 'Start in', D.x + 9, sy + 3, 'gold');
    const ow = Math.floor((D.w - 18 - 50 - 4) / 2), oh = Math.max(16, Math.round(mh * 0.8));
    [['realm', realm.name], ['willowmere', 'Willowmere']].forEach(([id, label], i) => {
      const x = D.x + 9 + 50 + i * (ow + 4), on = want === id;
      g.window(ctx, x, sy, ow, oh, 'thin', on ? 'ember' : 'slate', 0.95);
      g.text(ctx, g.clip(label, ow - 6), x + ow / 2, sy + Math.floor(oh / 2) - 6, on ? 'cream' : 'gray', { align: 'center' });
      regions.push({ rect: { x, y: sy, w: ow, h: oh }, kind: 'button', label: `start:${id}`, tip: { title: label, sub: id === 'realm' ? realm.line : 'The river town, where every calling meets.' }, on: () => { st.start = id; } });
    });
  } else g.text(ctx, 'You will start in Willowmere.', D.x + 9, sy + 3, 'dim');
  button(ctx, env, regions, { x: D.x + 9, y: by, w: bw, h: bh }, 'Back', () => act.go(act.store.list().length ? 'select' : 'title'));
  button(ctx, env, regions, { x: D.x + 15 + bw, y: by, w: bw, h: bh }, 'Create', () => act.create(), { scheme: 'forest', large: true, enabled: v.ok && !act.store.full() });
}

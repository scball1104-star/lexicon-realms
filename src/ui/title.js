// Title, character select and character creation, drawn on the 640x360 UI layer with Lexicon Quest's key art
// (title_backdrop.png, Willowmere at night, shown at an integer 2x) and the Lexicon Realms logo (logo_realms.png).
import { classInfo, classOrder, abilityInfo } from './gamedata.js';
import { validateName, MAX_CHARS, LOOKS, NAME_MAX } from './save.js';

const W = 640, H = 360;
const DIRS = ['down', 'left', 'up', 'right'];

export function drawBackdrop(ctx, env, dim = 0) {
  const { g } = env;
  const b = env.art.backdrop;
  // 384x216 key art at 2x = 768x432, centred crop to 640x360 (whole pixels, nearest neighbour). On a phone the
  // layer can be wider than 640x360 (the screen's aspect): the art then covers the whole layer at an integer scale.
  ctx.imageSmoothingEnabled = false;
  const tr = ctx.getTransform ? ctx.getTransform() : { e: 0, f: 0 };
  const LW = ctx.canvas ? ctx.canvas.width : W, LH = ctx.canvas ? ctx.canvas.height : H;
  if (LW <= W && LH <= H) ctx.drawImage(b, 32, 18, 320, 180, 0, 0, 640, 360);
  else {
    const k = Math.max(2, Math.ceil(LW / 384), Math.ceil(LH / 216));
    const sw = Math.ceil(LW / k), sh = Math.ceil(LH / k);
    const sx = Math.max(0, Math.floor((384 - sw) / 2)), sy = Math.max(0, Math.floor((216 - sh) / 2));
    ctx.drawImage(b, sx, sy, sw, sh, -tr.e, -tr.f, sw * k, sh * k);
  }
  if (dim) g.scrim(ctx, -tr.e, -tr.f, Math.max(W, LW), Math.max(H, LH), dim);
}

function button(ctx, env, regions, r, label, on, { scheme = 'blue', color = 'cream', enabled = true, large = false } = {}) {
  const { g } = env;
  g.window(ctx, r.x, r.y, r.w, r.h, 'thin', enabled ? scheme : 'slate', 0.95);
  g.text(ctx, label, r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2) - (large ? 8 : 6), enabled ? color : 'dim', { align: 'center', large });
  if (enabled) regions.push({ rect: r, kind: 'button', on, label });
}

export function drawTitle(ctx, env, st, regions, act, t) {
  const { g } = env;
  drawBackdrop(ctx, env, 40);
  const logo = env.art.logo;
  const lx = Math.floor((W - logo.width) / 2), ly = 54;
  ctx.drawImage(logo, lx, ly);
  // sparkles on the logo (LQ's title does the same)
  const k = Math.floor(t * 3) % 7;
  g.icon(ctx, `sparkle_rare_${Math.floor(t * 8) % 4}`, lx + 20 + k * 41, ly + 6 + (k % 3) * 5);
  const sub = 'A questing tale in the world of Lexicon Quest';
  g.scrim(ctx, Math.floor((W - g.textW(sub)) / 2) - 6, ly + logo.height + 6, g.textW(sub) + 12, 14, 150);
  g.text(ctx, sub, W / 2, ly + logo.height + 8, 'cream', { align: 'center' });
  const bh = Math.max(22, env.L.minHit || 0), bw = 170;
  const x = Math.floor((W - bw) / 2);
  let y = 196;
  const chars = act.store.list();
  if (chars.length) { button(ctx, env, regions, { x, y, w: bw, h: bh }, 'Play', () => act.go('select'), { large: true }); y += bh + 8; }
  button(ctx, env, regions, { x, y, w: bw, h: bh }, 'New Character', () => act.go('create'), { large: !chars.length, enabled: !act.store.full() });
  y += bh + 8;
  if (act.store.full()) g.text(ctx, `All ${MAX_CHARS} hero slots are used. Delete one to make another.`, W / 2, y, 'orange', { align: 'center' });
  const hint = env.L.touch ? 'Tap to begin' : 'Press Enter';
  g.scrim(ctx, Math.floor((W - g.textW(hint)) / 2) - 6, 322, g.textW(hint) + 12, 14, 150);
  if (Math.floor(t * 1.5) % 2 === 0) g.text(ctx, hint, W / 2, 324, 'gold', { align: 'center' });
  g.text(ctx, 'Lexicon Realms  phase 1', W - 6, H - 14, 'dim', { align: 'right' });
}

// ---------------------------------------------------------------- character select

export function drawSelect(ctx, env, st, regions, act, t) {
  const { g, charArt } = env;
  drawBackdrop(ctx, env, 150);
  g.text(ctx, 'Choose your hero', W / 2, 10, 'gold', { large: true, align: 'center' });
  const chars = act.store.list();
  if (!chars.length) { act.go('create'); return; }
  if (!chars.find((c) => c.id === st.selId)) st.selId = chars[0].id;
  const L = { x: 24, y: 36, w: 250, h: 286 };
  g.window(ctx, L.x, L.y, L.w, L.h, 'std', 'blue', 0.94);
  const rowH = Math.max(40, env.L.minHit || 0);
  chars.slice(0, MAX_CHARS).forEach((c, i) => {
    const y = L.y + 8 + i * (rowH + 2);
    const sel = c.id === st.selId;
    g.window(ctx, L.x + 6, y, L.w - 12, rowH, 'thin', sel ? 'ember' : 'slate', sel ? 0.95 : 0.7);
    charArt.portrait(ctx, c.cls, c.look, L.x + 11, y + Math.floor((rowH - 30) / 2), 30, 30);
    const ci = classInfo(c.cls);
    g.text(ctx, c.name, L.x + 46, y + 5, sel ? 'cream' : 'white', { large: true });
    g.text(ctx, `Level ${c.level} ${ci ? ci.name : c.cls}`, L.x + 46, y + 22, 'gray');
    g.text(ctx, c.zoneName || 'Willowmere', L.x + L.w - 12, y + 22, 'dim', { align: 'right' });
    regions.push({ rect: { x: L.x + 6, y, w: L.w - 12, h: rowH }, kind: 'char_row', on: () => { if (st.selId === c.id && st.lastClick && t - st.lastClick < 0.4) act.enter(c.id); st.selId = c.id; st.confirm = null; st.lastClick = t; } });
  });
  for (let i = chars.length; i < MAX_CHARS; i++) {
    const y = L.y + 8 + i * (rowH + 2);
    if (y + rowH > L.y + L.h - 4) break;
    g.window(ctx, L.x + 6, y, L.w - 12, rowH, 'thin', 'slate', 0.35);
    g.text(ctx, 'Empty slot', L.x + L.w / 2, y + Math.floor(rowH / 2) - 6, 'dim', { align: 'center' });
  }
  // preview
  const c = chars.find((o) => o.id === st.selId);
  const P = { x: 300, y: 36, w: 316, h: 220 };
  g.window(ctx, P.x, P.y, P.w, P.h, 'std', 'violet', 0.85);
  stage(ctx, env, c.cls, c.look, P, t);
  const ci = classInfo(c.cls);
  g.text(ctx, c.name, P.x + P.w / 2, P.y + 8, 'cream', { large: true, align: 'center' });
  g.text(ctx, `Level ${c.level} ${ci ? ci.name : ''}  ${ci ? ci.role : ''}`, P.x + P.w / 2, P.y + 26, 'gray', { align: 'center' });
  // buttons
  const bh = Math.max(22, env.L.minHit || 0);
  const by = P.y + P.h + 8;
  button(ctx, env, regions, { x: P.x, y: by, w: P.w, h: bh }, 'Enter World', () => act.enter(c.id), { scheme: 'forest', large: true });
  const by2 = by + bh + 6, bw = Math.floor((P.w - 12) / 3);
  button(ctx, env, regions, { x: P.x, y: by2, w: bw, h: bh }, 'New', () => act.go('create'), { enabled: !act.store.full() });
  const confirm = st.confirm === `delete:${c.id}`;
  button(ctx, env, regions, { x: P.x + bw + 6, y: by2, w: bw, h: bh }, confirm ? 'Press again' : 'Delete', () => {
    if (confirm) { act.store.remove(c.id); st.confirm = null; st.selId = null; act.toast(`${c.name} was deleted.`); if (!act.store.list().length) act.go('title'); }
    else st.confirm = `delete:${c.id}`;
  }, { scheme: confirm ? 'crimson' : 'blue', color: confirm ? 'orange' : 'cream' });
  button(ctx, env, regions, { x: P.x + 2 * (bw + 6), y: by2, w: bw, h: bh }, 'Back', () => act.go('title'));
  if (confirm) g.text(ctx, `Delete ${c.name} for good? Press Delete again.`, W / 2, H - 14, 'orange', { align: 'center' });
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
  g.text(ctx, `Resource: ${ci.resource}.  ${(ci.gear || '').split('.')[0]}.`, D.x + 9, y, 'gray'); y += 15;
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
  button(ctx, env, regions, { x: D.x + 9, y: by, w: bw, h: bh }, 'Back', () => act.go(act.store.list().length ? 'select' : 'title'));
  button(ctx, env, regions, { x: D.x + 15 + bw, y: by, w: bw, h: bh }, 'Create', () => act.create(), { scheme: 'forest', large: true, enabled: v.ok && !act.store.full() });
}

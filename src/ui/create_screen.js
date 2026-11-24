// The new character creation screen and the mirror (wave 6 item 8, the customization kit; brief
// D:\LQOnline\wave6\custom\BRIEF.md, approved by Scott 2026-11-24). Drawn with the game's own g.* calls (gfx.js windows,
// fonts, colours), so the UI skin's frames apply here for free; no frame is styled in this file.
//
//   const looks = createLookUI({ st, act, send, toast, say, has3d, startGear, hero, snap })   hero(): my snapshot entity
//   looks.drawCreate(ctx, env, regions, t, centred, L)   mode 'create' (replaces title.js drawCreate)
//   looks.drawMirror(ctx, env, regions, t, centred, L)   in game while st.mirror is open (the free mirror in Willowmere)
//   looks.onEvent(ev, me) -> true when taken              mirror_open, app_set
//   looks.stage() -> the turntable request or null        main.js puts it on view.stage; renderer3d draws the 3D hero there
//   looks.close()                                         Escape, walking away
//
// Desktop: the 640x360 design (class column | turntable | one Look panel with every option, a Class tab). Phone: the whole
// layer (class icons | turntable | a tabbed panel: Body, Face, Hair, Dye, Class), rows at the phone hit size; the name
// field, Back and Create share the bottom row, so nothing overlaps (today's phone screen put Start in over the name).
// A hero with no `app` is drawn as today's look; the presets ARE today's three looks (app cleared), and the first option
// a player touches starts an app from the shown look (src/data/appearance.js fromLook).
import { classInfo, classOrder, abilityInfo } from './gamedata.js';
import { validateName, NAME_MAX } from './save.js';
import { drawBackdrop } from './title.js';
import { START_REALMS } from '../data/rootbound.js';
import { BODIES, SKINS, EYES, HAIRS, HAIR_COLORS, BEARDS, BUILDS, HEIGHTS, HEIGHT_NAMES, MARKS, MARK_COLORS, DYES, clampApp, fromLook } from '../data/appearance.js';

const W = 640, H = 360;
const DIRS = ['down', 'left', 'up', 'right'];
const PHONE_TABS = [['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['dye', 'Dye'], ['class', 'Class']];

/** Desktop rects in the 640x360 design (pure; qa/tests/custom_kit.test.mjs checks that nothing overlaps). */
export function deskRects() {
  const C = { x: 16, y: 32, w: 150, h: 294 };
  const S = { x: 170, y: 26, w: 212, h: 274 };
  const D = { x: 388, y: 32, w: 236, h: 294 };
  const presets = { x: S.x + 2, y: S.y + S.h + 6, w: S.w - 4, h: 16 };
  const start = { x: S.x + 2, y: presets.y + presets.h + 4, w: S.w - 4, h: 16 };
  const name = { x: D.x + 8, y: D.y + 226, w: D.w - 16, h: 18 };
  const msgY = name.y + name.h + 2;
  const bw = Math.floor((D.w - 22) / 2);
  const back = { x: D.x + 8, y: D.y + D.h - 30, w: bw, h: 22 }, create = { x: D.x + 14 + bw, y: D.y + D.h - 30, w: bw, h: 22 };
  return { C, S, D, presets, start, name, msgY, back, create, rowsTop: D.y + 26, rowH: 15 };
}

/** Phone rects on the whole layer (pure; tested). mh: the phone hit size in HUD px (44 css px). */
export function phoneRects(LW, LH, mh, { tabs = PHONE_TABS.length } = {}) {
  const cw = Math.max(40, Math.min(mh, Math.floor((LH - 30) / 5) - 3));
  const cls = Array.from({ length: 5 }, (_, i) => ({ x: 8, y: 26 + i * (cw + 3), w: cw, h: cw }));
  const S = { x: 8 + cw + 6, y: 22, w: Math.max(150, Math.min(260, Math.round(LW * 0.3))), h: LH - 30 };
  const D = { x: S.x + S.w + 6, y: 24, w: LW - (S.x + S.w + 6) - 8, h: LH - 32 };
  const th = Math.max(26, Math.min(36, Math.round(mh * 0.72)));
  const tw = Math.floor((D.w - 12 - (tabs - 1) * 3) / tabs);
  const tabRects = Array.from({ length: tabs }, (_, i) => ({ x: D.x + 6 + i * (tw + 3), y: D.y + 6, w: tw, h: th }));
  const bh = mh, bw = Math.floor((D.w - 20 - 6) / 3);
  const by = D.y + D.h - bh - 8;
  const name = { x: D.x + 10, y: by, w: bw, h: bh }, back = { x: D.x + 10 + bw + 3, y: by, w: bw, h: bh }, create = { x: D.x + 10 + 2 * (bw + 3), y: by, w: bw, h: bh };
  const ph = Math.max(24, Math.round(mh * 0.62));
  const presets = { x: D.x + 10, y: by - 6 - ph, w: D.w - 20, h: ph };
  const msgY = presets.y - 13;
  const content = { x: D.x + 10, y: D.y + 6 + th + 8, w: D.w - 20, h: msgY - 2 - (D.y + 6 + th + 8) };
  return { cw, cls, S, D, tabs: tabRects, content, presets, msgY, name, back, create, rowH: Math.max(mh, 30) };
}

const rnd = (n) => Math.floor(Math.random() * n);     // the UI's "Surprise me" only; the sim never sees randomness

export function createLookUI({ st, act, send, toast, say, has3d = () => false, startGear = () => ({}), hero = () => null, snap = () => null }) {
  let req = null;                 // this frame's turntable request (null: no stage on screen)
  let bg = null;                  // the backdrop at layer size (the turntable draws its crop behind the hero)
  const turn = { x: null, t: 0 };
  const stageNow = () => (req && ((req.mode === 'create' && st.mode === 'create') || (req.mode === 'mirror' && st.mode === 'game' && st.mirror)) ? req : null);

  function backdropFor(env, LW, LH) {
    if (bg && bg.width === LW && bg.height === LH) return bg;
    if (typeof document === 'undefined') return null;
    bg = document.createElement('canvas'); bg.width = LW; bg.height = LH;
    const b = bg.getContext('2d'); b.imageSmoothingEnabled = false;
    drawBackdrop(b, env, 160);
    return bg;
  }
  /** The look being edited: the screen's (create) or the mirror's working copy. */
  const subject = () => (st.mode === 'create' ? { cls: st.cls, look: st.look || 0, app: st.app || null } : st.mirror);
  function edit(key, value) {
    const s = subject();
    const a = s.app ? { ...s.app } : fromLook(s.cls, s.look);
    a[key] = value;
    const c = clampApp(a);
    if (st.mode === 'create') st.app = c; else st.mirror.app = c;
  }
  function surprise() {
    const pick = (list) => rnd(list.length);
    const a = { body: pick(BODIES), skin: pick(SKINS), eyes: pick(EYES), hair: pick(HAIRS), hairColor: pick(HAIR_COLORS), beard: rnd(3) === 0 ? 1 : 0,
      build: pick(BUILDS), height: pick(HEIGHTS), mark: rnd(2) ? 0 : pick(MARKS), markColor: pick(MARK_COLORS), dye: pick(DYES), trim: pick(DYES) };
    if (a.body === 1) a.beard = 0;
    if (st.mode === 'create') st.app = clampApp(a); else st.mirror.app = clampApp(a);
  }

  // ---------------------------------------------------------------- small controls (each pushes its own regions)
  function tri(ctx, x, y, dir, color = '#f9d77a') {
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) { const h = 9 - i * 2; ctx.fillRect(dir < 0 ? x + 4 - i : x + i, y + i, 1, h); }
  }
  function swatches(ctx, env, regions, x, y, list, sel, key, { w = 12, h = 10, gap = 2, hitH = h + 4 } = {}) {
    const { g } = env;
    list.forEach((e, i) => {
      const sx = x + i * (w + gap);
      if (i === sel) { g.rect(ctx, sx - 2, y - 2, w + 4, h + 4, '#f9d77a'); g.rect(ctx, sx - 1, y - 1, w + 2, h + 2, '#14101e'); }
      else g.rect(ctx, sx - 1, y - 1, w + 2, h + 2, '#14101e');
      if (e.hex) g.rect(ctx, sx, y, w, h, e.hex);
      else { g.rect(ctx, sx, y, w, h, '#8e8997'); ctx.fillStyle = '#e06b39'; for (let k = 0; k < Math.min(w, h); k++) ctx.fillRect(sx + Math.round(k * w / h), y + k, 1, 1); }
      const hy = y + Math.floor(h / 2) - Math.floor(hitH / 2);
      regions.push({ rect: { x: sx - 1, y: hy, w: w + gap, h: hitH }, kind: 'button', label: `look:${key}:${i}`,
        tip: { title: e.name, sub: key === 'dye' || key === 'trim' ? 'Gear colour only, never its stats.' : null }, on: () => edit(key, i) });
    });
  }
  function eyeSwatches(list) {
    const hsv2 = (hh, s, v) => { const f = (n) => { const k = (n + hh * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return `rgb(${f(5) * 255 | 0},${f(3) * 255 | 0},${f(1) * 255 | 0})`; };
    return list.map((e) => ({ name: e.name, hex: hsv2((0.07 + e.hue) % 1, Math.min(1, 0.75 * e.sat), Math.min(1, 0.32 * e.val)) }));
  }
  function stepper(ctx, env, regions, x, y, w, h, list, sel, key) {
    const { g } = env;
    const n = list.length, ty = y + Math.floor((h - 9) / 2);
    tri(ctx, x, ty, -1);
    g.text(ctx, list[sel].name, x + Math.floor(w / 2), y + Math.floor(h / 2) - 6, 'cream', { align: 'center' });
    tri(ctx, x + w - 5, ty, 1);
    const aw = Math.max(16, Math.min(h, 44));
    regions.push({ rect: { x: x - 4, y, w: aw, h }, kind: 'button', label: `look:${key}:prev`, on: () => edit(key, (sel + n - 1) % n) });
    regions.push({ rect: { x: x + aw - 4, y, w: w - 2 * aw + 8, h }, kind: 'button', label: `look:${key}:next`, on: () => edit(key, (sel + 1) % n) });
    regions.push({ rect: { x: x + w - aw + 4, y, w: aw, h }, kind: 'button', label: `look:${key}:next2`, on: () => edit(key, (sel + 1) % n) });
  }
  function choice(ctx, env, regions, x, y, labels, sel, key, { w = 40, h = 15, gap = 3 } = {}) {
    const { g } = env;
    labels.forEach((t, i) => {
      const bx = x + i * (w + gap);
      g.window(ctx, bx, y, w, h, 'thin', i === sel ? 'ember' : 'slate', 0.95);
      g.text(ctx, t, bx + Math.floor(w / 2), y + Math.round((h - 11) / 2) + 1, i === sel ? 'cream' : 'gray', { align: 'center' });
      regions.push({ rect: { x: bx, y, w, h }, kind: 'button', label: `look:${key}:${i}`, on: () => edit(key, i) });
    });
  }
  function pips(ctx, env, regions, x, y, sel, { w = 12, h = 11, pitch = 16 } = {}) {
    const { g } = env;
    for (let i = 0; i < HEIGHTS.length; i++) {
      const bx = x + i * pitch;
      g.window(ctx, bx, y, w, h, 'thin', i === sel ? 'ember' : 'slate', 0.95);
      regions.push({ rect: { x: bx - 1, y, w: pitch, h }, kind: 'button', label: `look:height:${i}`, tip: { title: HEIGHT_NAMES[i] }, on: () => edit('height', i) });
    }
    g.text(ctx, HEIGHT_NAMES[sel], x + HEIGHTS.length * pitch + 4, y + Math.floor(h / 2) - 6, 'gray');
  }
  function button(ctx, env, regions, r, label, on, { scheme = 'blue', color = 'cream', enabled = true, large = false } = {}) {
    const { g } = env;
    g.window(ctx, r.x, r.y, r.w, r.h, 'thin', enabled ? scheme : 'slate', 0.95);
    g.text(ctx, label, r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2) - (large ? 8 : 6), enabled ? color : 'dim', { align: 'center', large });
    if (enabled) regions.push({ rect: r, kind: 'button', on, label });
  }

  /** The turn hint and the drag region over the stage; the request the renderer draws. */
  function stageArea(ctx, env, regions, S, mode, s, phone) {
    const { g } = env;
    const tr = ctx.getTransform ? ctx.getTransform() : { e: 0, f: 0 };
    const L = env.L;
    const drag = { rect: S, kind: 'turn', label: 'look:turn', drag: (x) => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      if (turn.x == null || now - turn.t > 0.25) turn.x = x;
      st.yaw = ((st.yaw ?? 0.5) + (x - turn.x) * 0.03) % (Math.PI * 2);
      turn.x = x; turn.t = now;
    } };
    drag.on = () => { st.drag = drag; turn.x = null; };       // the title screens' press path has no drag of its own
    regions.push(drag);
    const show3d = has3d();
    if (show3d) {
      const hint = 'Drag to turn';
      const hw = g.textW(hint);
      g.scrim(ctx, S.x + Math.floor((S.w - hw) / 2) - 18, S.y + S.h - 16, hw + 36, 14, 150);
      tri(ctx, S.x + Math.floor((S.w - hw) / 2) - 13, S.y + S.h - 14, -1);
      g.text(ctx, hint, S.x + Math.floor(S.w / 2), S.y + S.h - 15, 'cream', { align: 'center' });
      tri(ctx, S.x + Math.floor((S.w + hw) / 2) + 8, S.y + S.h - 14, 1);
      const rect = { x: S.x + tr.e, y: S.y + tr.f, w: S.w, h: S.h - 18 };
      req = { mode, rect, cls: s.cls, look: s.look || 0, app: s.app || null, equip: s.equip || startGear(s.cls) || {}, yaw: st.yaw ?? 0.5,
        bg: backdropFor(env, L.W, L.H), phone: !!phone };
      // the stage rect shows the 3D hero: clear it on the HUD layer so the WebGL canvas under it shows through
      ctx.clearRect(S.x, S.y, S.w, S.h - 18);
    } else {
      // 2D graphics: today's sprite for the look (the kit's choices show in 3D; they are kept on the hero)
      const t = st.now || 0;
      const sx = S.x + Math.floor(S.w / 2), sy = S.y + Math.floor(S.h * 0.62);
      g.rect(ctx, sx - 50, sy - 2, 100, 6, 'rgba(20,16,30,0.45)');
      const sc = env.scratch(48, 48), sg = sc.getContext('2d');
      sg.clearRect(0, 0, 48, 48);
      env.charArt.draw(sg, s.cls, s.look || 0, 'walk', DIRS[Math.floor(t / 1.2) % 4], t, 24, 44);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sc, 0, 0, 48, 48, sx - 48, sy - 88, 96, 96);
      const note = s.app ? 'Your new look shows in 3D graphics.' : '';
      if (note) { g.scrim(ctx, S.x + Math.floor((S.w - g.textW(note)) / 2) - 6, sy + 14, g.textW(note) + 12, 14, 150); g.text(ctx, note, S.x + Math.floor(S.w / 2), sy + 15, 'cream', { align: 'center' }); }
    }
  }

  function presetsBar(ctx, env, regions, r, s, phone) {
    const { g } = env;
    g.text(ctx, 'Start from', r.x, r.y + Math.floor(r.h / 2) - 6, 'gold');
    const lw = g.textW('Start from') + 6;
    const bw = phone ? Math.max(30, r.h + 4) : 22;
    for (let i = 0; i < 3; i++) {
      const bx = r.x + lw + i * (bw + 3);
      const on = !s.app && (s.look || 0) === i;
      g.window(ctx, bx, r.y, bw, r.h, 'thin', on ? 'ember' : 'slate', 0.95);
      env.charArt.portrait(ctx, s.cls, i, bx + Math.floor((bw - 16) / 2), r.y + Math.floor((r.h - 16) / 2), 16, 16);
      regions.push({ rect: { x: bx, y: r.y, w: bw, h: r.h }, kind: 'button', label: `look:preset:${i}`, tip: { title: `Look ${i + 1}`, sub: 'One of the class\'s own looks.' },
        on: () => { if (st.mode === 'create') { st.look = i; st.app = null; } else { st.mirror.app = fromLook(s.cls, i); } } });
    }
    const rx = r.x + lw + 3 * (bw + 3) + 4, rw = r.x + r.w - rx;
    button(ctx, env, regions, { x: rx, y: r.y, w: rw, h: r.h }, 'Surprise me', () => surprise(), { scheme: 'violet' });
  }

  /** The option rows. rows: [[label, draw(x, y, rowH)]]; one column, `rowH` apart. */
  function rowsFor(ctx, env, regions, keys, a, x, y, w, rowH, phone) {
    const { g } = env;
    const VX = x + (phone ? 54 : 54), vw = x + w - VX;
    const big = phone ? { w: Math.max(14, Math.min(26, Math.floor(vw / 12) - 6)), h: Math.max(18, Math.min(30, rowH - 14)), gap: 6, hitH: rowH } : { w: 12, h: 10, gap: 2, hitH: 14 };
    const pitchFor = (n) => (phone ? Math.min(big.w + big.gap, Math.floor(vw / n)) : big.w + big.gap);
    for (const k of keys) {
      const lab = { body: 'Body', skin: 'Skin', eyes: 'Eyes', hair: 'Hair', hairColor: 'Colour', beard: 'Beard', build: 'Build', height: 'Height', mark: 'Marks', markColor: 'Ink', dye: 'Dye', trim: 'Trim' }[k];
      g.text(ctx, lab, x, y + Math.floor(rowH / 2) - 6, 'gold');
      const ch = phone ? Math.max(20, Math.min(rowH - 8, 32)) : 15;
      const cy = y + Math.floor((rowH - ch) / 2);
      if (k === 'body') { choice(ctx, env, regions, VX, cy, BODIES.map((b) => b.name), a.body, 'body', { w: phone ? 44 : 30, h: ch }); g.text(ctx, '(frame only)', VX + (phone ? 100 : 70), y + Math.floor(rowH / 2) - 6, 'dim'); }
      else if (k === 'build') choice(ctx, env, regions, VX, cy, BUILDS.map((b) => b.name), a.build, 'build', { w: phone ? Math.min(70, Math.floor((vw - 9) / 4)) : 38, h: ch });
      else if (k === 'height') pips(ctx, env, regions, VX, cy, a.height, phone ? { w: 26, h: ch, pitch: 32 } : {});
      else if (k === 'hair' || k === 'beard' || k === 'mark') {
        const list = k === 'hair' ? HAIRS : k === 'beard' ? BEARDS : MARKS;
        stepper(ctx, env, regions, VX, phone ? cy : y, phone ? Math.min(200, vw) : 110, phone ? ch : 12, list, a[k], k);
      } else {
        const list = k === 'skin' ? SKINS : k === 'eyes' ? eyeSwatches(EYES) : k === 'hairColor' ? HAIR_COLORS : k === 'markColor' ? MARK_COLORS : DYES;
        const n = list.length, p = pitchFor(n);
        swatches(ctx, env, regions, VX, y + Math.floor((rowH - big.h) / 2), list, a[k], k, { ...big, gap: p - big.w });
      }
      y += rowH;
      if (!phone && k === 'markColor') { g.rect(ctx, x, y + 1, w, 1, 'rgba(249,215,122,0.35)'); y += 4; }
    }
    return y;
  }

  function classPanel(ctx, env, regions, x, y, w, cls) {
    const { g } = env;
    const ci = classInfo(cls);
    g.text(ctx, ci.name, x, y, 'gold', { large: true });
    g.text(ctx, ci.role, x + w, y + 4, 'cream', { align: 'right' }); y += 19;
    const desc = ci.plays ? ci.plays.charAt(0).toUpperCase() + ci.plays.slice(1) : ci.kit;
    for (const ln of g.wrap(desc || '', w).slice(0, 3)) { g.text(ctx, ln, x, y, 'white'); y += 11; }
    y += 3;
    g.text(ctx, g.clip(`Resource: ${ci.resource}.  ${(ci.gear || '').split('.')[0]}.`, w), x, y, 'gray'); y += 13;
    if (ci.strong || ci.weak) {
      const lw = Math.max(g.textW('Strong: '), g.textW('Weak: '));
      g.text(ctx, 'Strong:', x, y, 'green'); g.text(ctx, g.clip(ci.strong || '', w - lw), x + lw, y, 'white'); y += 11;
      g.text(ctx, 'Weak:', x, y, 'red'); g.text(ctx, g.clip(ci.weak || '', w - lw), x + lw, y, 'white'); y += 14;
    }
    g.text(ctx, 'First abilities', x, y, 'gold'); y += 13;
    for (const aid of (ci.abilities || []).filter((a) => (abilityInfo(a) || {}).learnLevel <= 1)) {
      const ab = abilityInfo(aid);
      g.window(ctx, x, y, 18, 18, 'thin', 'blue', 0.95);
      g.iconIn(ctx, ab.icon, x, y, 18, 18);
      g.text(ctx, ab.name, x + 23, y + 3, 'white');
      regions.push({ rect: { x, y, w, h: 18 }, kind: 'ability', tipAbility: aid });
      y += 21;
    }
    return y;
  }
  /** Big world: where a new hero starts (its class's realm, or Willowmere). */
  function startRow(ctx, env, regions, r, cls) {
    const { g } = env;
    const realm = START_REALMS[cls] || null;
    if (!realm) { g.text(ctx, 'You will start in Willowmere.', r.x, r.y + Math.floor(r.h / 2) - 6, 'dim'); return; }
    const want = st.start === 'willowmere' ? 'willowmere' : 'realm';
    g.text(ctx, 'Start in', r.x, r.y + Math.floor(r.h / 2) - 6, 'gold');
    const lw = Math.max(50, g.textW('Start in') + 8), ow = Math.floor((r.w - lw - 4) / 2);
    [['realm', realm.name], ['willowmere', 'Willowmere']].forEach(([id, label], i) => {
      const x = r.x + lw + i * (ow + 4), on = want === id;
      g.window(ctx, x, r.y, ow, r.h, 'thin', on ? 'ember' : 'slate', 0.95);
      g.text(ctx, g.clip(label, ow - 6), x + Math.floor(ow / 2), r.y + Math.floor(r.h / 2) - 6, on ? 'cream' : 'gray', { align: 'center' });
      regions.push({ rect: { x, y: r.y, w: ow, h: r.h }, kind: 'button', label: `start:${id}`, tip: { title: label, sub: id === 'realm' ? realm.line : 'The river town, where every calling meets.' }, on: () => { st.start = id; } });
    });
  }
  function nameField(ctx, env, regions, r, t) {
    const { g } = env;
    g.window(ctx, r.x, r.y, r.w, r.h, 'thin', st.nameFocus ? 'ember' : 'slate', 0.95);
    const name = st.name || '';
    const shown = name || (st.nameFocus ? '' : env.L.touch ? 'Tap to name' : 'Type a name');
    g.text(ctx, g.clip(shown, r.w - 10, !!name), r.x + 6, r.y + Math.floor((r.h - 16) / 2), name ? 'cream' : 'dim', { large: !!name });
    if (st.nameFocus && Math.floor(t * 2) % 2 === 0) g.rect(ctx, r.x + 7 + (name ? g.textW(name, true) : 0), r.y + 4, 1, r.h - 8, '#fff7d6');
    regions.push({ rect: r, kind: 'name_field', on: () => act.focusName() });
  }
  function nameMessage(ctx, env, x, y) {
    const { g } = env;
    const name = st.name || '';
    const v = validateName(name, act.store.list());
    const msg = st.err || (name && !v.ok ? v.reason : '');
    if (msg) g.text(ctx, msg, x, y, 'red');
    else if (name && v.ok) g.text(ctx, `You will be ${v.name}.`, x, y, 'green');
    else g.text(ctx, `Name: 2 to ${NAME_MAX} letters`, x, y, 'dim');
    return v;
  }

  // ---------------------------------------------------------------- the creation screen
  function drawCreate(ctx, env, regions, t, centred, L) {
    const order = classOrder();
    if (!st.cls) st.cls = order[0];
    st.look = st.look || 0;
    if (st.yaw == null) st.yaw = 0.5;
    const s = subject();
    const draw = () => {
      const phone = !!env.L.touch;
      const LW = phone ? env.L.W : W, LH = phone ? env.L.H : H;
      drawBackdrop(ctx, env, 160);
      env.g.text(ctx, 'New Character', Math.floor(LW / 2), phone ? 4 : 8, 'gold', { large: true, align: 'center' });
      if (phone) createPhone(ctx, env, regions, t, s, LW, LH); else createDesk(ctx, env, regions, t, s);
    };
    if (L.touch) draw(); else centred(ctx, L, regions, draw, env);
  }
  function classButtonsDesk(ctx, env, regions, C) {
    const { g } = env;
    g.window(ctx, C.x, C.y, C.w, C.h, 'std', 'blue', 0.94);
    g.text(ctx, 'Class', C.x + 8, C.y + 5, 'gold');
    classOrder().forEach((id, i) => {
      const ci = classInfo(id); const y = C.y + 20 + i * 54; const h = 52; const on = st.cls === id;
      g.window(ctx, C.x + 5, y, C.w - 10, h, 'thin', on ? 'ember' : 'slate', on ? 0.95 : 0.75);
      env.charArt.portrait(ctx, id, on ? st.look || 0 : 0, C.x + 9, y + 12, 28, 28);
      g.text(ctx, ci.name, C.x + 42, y + 6, on ? 'cream' : 'white', { large: true });
      g.text(ctx, ci.role, C.x + 42, y + 24, on ? 'gold' : 'gray');
      regions.push({ rect: { x: C.x + 5, y, w: C.w - 10, h }, kind: 'class', id, on: () => { st.cls = id; st.err = null; } });
    });
  }
  function createDesk(ctx, env, regions, t, s) {
    const { g } = env;
    const R = deskRects();
    classButtonsDesk(ctx, env, regions, R.C);
    stageArea(ctx, env, regions, R.S, 'create', s, false);
    presetsBar(ctx, env, regions, R.presets, s, false);
    startRow(ctx, env, regions, R.start, st.cls);
    const D = R.D;
    g.window(ctx, D.x, D.y, D.w, D.h, 'std', 'blue', 0.94);
    const tab = st.lookTab === 'class' ? 'class' : 'look';
    [['look', 'Look'], ['class', 'Class']].forEach(([id, lab], i) => {
      const tx = D.x + 6 + i * 58, on = tab === id;
      g.window(ctx, tx, D.y + 5, 54, 16, 'thin', on ? 'ember' : 'slate', 0.95);
      g.text(ctx, lab, tx + 27, D.y + 8, on ? 'cream' : 'gray', { align: 'center' });
      regions.push({ rect: { x: tx, y: D.y + 5, w: 54, h: 16 }, kind: 'button', label: `look:tab:${id}`, on: () => { st.lookTab = id; } });
    });
    g.text(ctx, classInfo(st.cls).name, D.x + D.w - 8, D.y + 7, 'gold', { align: 'right' });
    if (tab === 'look') {
      const a = s.app || fromLook(s.cls, s.look);
      const y = rowsFor(ctx, env, regions, ['body', 'skin', 'eyes', 'hair', 'hairColor', 'beard', 'build', 'height', 'mark', 'markColor', 'dye', 'trim'], a, D.x + 8, R.rowsTop, D.w - 16, R.rowH, false);
      g.text(ctx, 'Dyes change your gear colour, never its stats.', D.x + Math.floor(D.w / 2), y, 'dim', { align: 'center' });
    } else classPanel(ctx, env, regions, D.x + 9, D.y + 28, D.w - 18, st.cls);
    nameField(ctx, env, regions, R.name, t);
    const v = nameMessage(ctx, env, R.name.x, R.msgY);
    button(ctx, env, regions, R.back, 'Back', () => act.go(act.store.list().length ? 'select' : 'title'));
    button(ctx, env, regions, R.create, 'Create', () => act.create(), { scheme: 'forest', large: true, enabled: v.ok && !act.store.full() });
  }
  function phoneTabs(ctx, env, regions, P, list) {
    const { g } = env;
    if (!list.some(([id]) => id === st.lookTab)) st.lookTab = list[0][0];
    P.tabs.slice(0, list.length).forEach((r, i) => {
      const [id, lab] = list[i], on = st.lookTab === id;
      g.window(ctx, r.x, r.y, r.w, r.h, 'thin', on ? 'ember' : 'slate', 0.95);
      g.text(ctx, lab, r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2) - 6, on ? 'cream' : 'gray', { align: 'center' });
      regions.push({ rect: r, kind: 'button', label: `look:tab:${id}`, on: () => { st.lookTab = id; } });
    });
  }
  const TAB_KEYS = { body: ['body', 'skin', 'build', 'height'], face: ['eyes', 'beard', 'mark', 'markColor'], hair: ['hair', 'hairColor'], dye: ['dye', 'trim'] };
  function phoneContent(ctx, env, regions, P, s) {
    const { g } = env;
    const c = P.content;
    if (st.lookTab === 'class') {
      let y = classPanel(ctx, env, regions, c.x, c.y, c.w, s.cls);
      if (st.mode === 'create') startRow(ctx, env, regions, { x: c.x, y: Math.min(y + 4, c.y + c.h - P.rowH), w: c.w, h: Math.min(P.rowH, 40) }, s.cls);
      return;
    }
    const keys = TAB_KEYS[st.lookTab] || TAB_KEYS.body;
    const rowH = Math.min(P.rowH, Math.floor(c.h / keys.length));
    const a = s.app || fromLook(s.cls, s.look);
    const y = rowsFor(ctx, env, regions, keys, a, c.x, c.y, c.w, rowH, true);
    if (st.lookTab === 'dye' && y + 12 <= c.y + c.h) g.text(ctx, 'Dyes change your gear colour, never its stats.', c.x, y + 2, 'dim');
  }
  function createPhone(ctx, env, regions, t, s, LW, LH) {
    const { g } = env;
    const P = phoneRects(LW, LH, Math.max(24, env.L.minHit || 24));
    classOrder().forEach((id, i) => {
      const r = P.cls[i], on = st.cls === id;
      g.window(ctx, r.x, r.y, r.w, r.h, 'thin', on ? 'ember' : 'slate', on ? 0.95 : 0.75);
      env.charArt.portrait(ctx, id, on ? st.look || 0 : 0, r.x + Math.floor((r.w - 28) / 2), r.y + Math.floor((r.h - 28) / 2), 28, 28);
      regions.push({ rect: r, kind: 'class', id, tip: { title: classInfo(id).name, sub: classInfo(id).role }, on: () => { st.cls = id; st.err = null; } });
    });
    const ci = classInfo(st.cls);
    stageArea(ctx, env, regions, P.S, 'create', s, true);
    g.scrim(ctx, P.S.x + 2, P.S.y + 2, g.textW(ci.name, true) + 12, 18, 150);
    g.text(ctx, ci.name, P.S.x + 8, P.S.y + 3, 'gold', { large: true });
    const D = P.D;
    g.window(ctx, D.x, D.y, D.w, D.h, 'std', 'blue', 0.94);
    if (!st.lookTab) st.lookTab = 'class';     // a phone opens on the class: what it plays, where it starts (Start in)
    phoneTabs(ctx, env, regions, P, PHONE_TABS);
    phoneContent(ctx, env, regions, P, s);
    const v = nameMessage(ctx, env, P.presets.x, P.msgY);
    presetsBar(ctx, env, regions, P.presets, s, true);
    nameField(ctx, env, regions, P.name, t);
    button(ctx, env, regions, P.back, 'Back', () => act.go(act.store.list().length ? 'select' : 'title'));
    button(ctx, env, regions, P.create, 'Create', () => act.create(), { scheme: 'forest', large: true, enabled: v.ok && !act.store.full() });
  }

  // ---------------------------------------------------------------- the mirror (an existing hero, in the world)
  function openMirror(ent) {
    const me = hero();
    if (!me) return;
    st.dialog = null; st.chest = null; st.confirm = null; st.itemPick = null; st.open.clear();
    st.mirror = { ent, cls: me.cls, look: me.look || 0, name: me.name, app: me.app ? clampApp(me.app) : null, orig: me.app ? JSON.stringify(clampApp(me.app)) : null };
    st.lookTab = null; st.yaw = 0.5;
  }
  function close() { st.mirror = null; st.drag = null; }
  function keep() {
    const m = st.mirror;
    if (!m) return;
    const now = m.app ? JSON.stringify(clampApp(m.app)) : null;
    if (now && now !== m.orig) send({ t: 'set_app', app: clampApp(m.app) });
    else close();
  }
  function drawMirror(ctx, env, regions, t, centred, L) {
    const m = st.mirror;
    const me = hero();
    if (!m || !me || me.dead) { close(); return; }
    const sn = snap();
    const mirrorEnt = sn ? sn.entities.find((e) => e.id === m.ent) : null;
    if (mirrorEnt && Math.hypot(mirrorEnt.x - me.x, mirrorEnt.y - me.y) > 64 + 24) { close(); return; }
    const s = { cls: m.cls, look: m.look, app: m.app, equip: me.equip || {} };
    const draw = () => {
      const phone = !!env.L.touch;
      const LW = phone ? env.L.W : W, LH = phone ? env.L.H : H;
      const tr = ctx.getTransform ? ctx.getTransform() : { e: 0, f: 0 };
      regions.push({ rect: { x: -tr.e, y: -tr.f, w: Math.max(LW, env.L.W), h: Math.max(LH, env.L.H) }, kind: 'window', id: 'mirror', on: () => {} });   // the HUD under it takes no presses
      drawBackdrop(ctx, env, 160);
      env.g.text(ctx, 'The Standing Mirror', Math.floor(LW / 2), phone ? 4 : 8, 'gold', { large: true, align: 'center' });
      if (phone) mirrorPhone(ctx, env, regions, s, LW, LH); else mirrorDesk(ctx, env, regions, s);
    };
    if (L.touch) draw(); else centred(ctx, L, regions, draw, env);
  }
  function mirrorDesk(ctx, env, regions, s) {
    const { g } = env;
    const R = deskRects();
    // the hero card where the class column is on the creation screen
    const C = R.C, ci = classInfo(s.cls);
    g.window(ctx, C.x, C.y, C.w, C.h, 'std', 'blue', 0.94);
    env.charArt.portrait(ctx, s.cls, s.look, C.x + 9, C.y + 10, 28, 28);
    g.text(ctx, st.mirror.name, C.x + 42, C.y + 10, 'cream', { large: true });
    g.text(ctx, ci ? ci.name : s.cls, C.x + 42, C.y + 28, 'gold');
    const lines = g.wrap('Change how your hero looks. The mirror is free, and your gear keeps its stats.', C.w - 18);
    lines.forEach((ln, i) => g.text(ctx, ln, C.x + 9, C.y + 52 + i * 11, 'white'));
    g.text(ctx, 'Friends see your new look too.', C.x + 9, C.y + 58 + lines.length * 11, 'dim');
    stageArea(ctx, env, regions, R.S, 'mirror', s, false);
    presetsBar(ctx, env, regions, R.presets, s, false);
    const D = R.D;
    g.window(ctx, D.x, D.y, D.w, D.h, 'std', 'blue', 0.94);
    g.text(ctx, 'Look', D.x + 8, D.y + 7, 'gold');
    const a = s.app || fromLook(s.cls, s.look);
    const y = rowsFor(ctx, env, regions, ['body', 'skin', 'eyes', 'hair', 'hairColor', 'beard', 'build', 'height', 'mark', 'markColor', 'dye', 'trim'], a, D.x + 8, R.rowsTop, D.w - 16, R.rowH, false);
    g.text(ctx, 'Dyes change your gear colour, never its stats.', D.x + Math.floor(D.w / 2), y, 'dim', { align: 'center' });
    if (!s.app) g.text(ctx, 'Today: your class look. Any change starts from it.', D.x + Math.floor(D.w / 2), R.msgY - 10, 'gray', { align: 'center' });
    button(ctx, env, regions, R.back, 'Cancel', () => close());
    button(ctx, env, regions, R.create, 'Keep look', () => keep(), { scheme: 'forest', large: true });
  }
  function mirrorPhone(ctx, env, regions, s, LW, LH) {
    const { g } = env;
    const P = phoneRects(LW, LH, Math.max(24, env.L.minHit || 24), { tabs: 4 });
    stageArea(ctx, env, regions, { x: 8, y: P.S.y, w: P.S.x + P.S.w - 8, h: P.S.h }, 'mirror', s, true);
    g.scrim(ctx, 10, P.S.y + 2, g.textW(st.mirror.name, true) + 12, 18, 150);
    g.text(ctx, st.mirror.name, 16, P.S.y + 3, 'gold', { large: true });
    const D = P.D;
    g.window(ctx, D.x, D.y, D.w, D.h, 'std', 'blue', 0.94);
    phoneTabs(ctx, env, regions, P, PHONE_TABS.slice(0, 4));
    phoneContent(ctx, env, regions, P, s);
    g.text(ctx, 'The mirror is free. Friends see your new look too.', P.presets.x, P.msgY, 'dim');
    presetsBar(ctx, env, regions, P.presets, s, true);
    g.window(ctx, P.name.x, P.name.y, P.name.w, P.name.h, 'thin', 'slate', 0.6);
    g.text(ctx, g.clip(classInfo(s.cls) ? classInfo(s.cls).name : s.cls, P.name.w - 10), P.name.x + 6, P.name.y + Math.floor(P.name.h / 2) - 6, 'gray');
    button(ctx, env, regions, P.back, 'Cancel', () => close());
    button(ctx, env, regions, P.create, 'Keep look', () => keep(), { scheme: 'forest', large: true });
  }

  function onEvent(ev, me) {
    if (ev.type === 'mirror_open') { if (ev.src === me) openMirror(ev.id); return ev.src === me; }
    if (ev.type === 'app_set') {
      if (ev.id !== me) return false;
      close();
      toast('Your new look is set.', 3); if (say) say('system', 'You see your new look in the mirror.');
      return true;
    }
    if (ev.type === 'interact_fail' && ev.src === me && st.mirror && ev.id === st.mirror.ent) { close(); return false; }
    return false;
  }

  return {
    drawCreate, drawMirror, onEvent, close, keep,
    /** Called at the start of every UI frame: the request is made again by whichever screen draws a stage. */
    frame() { req = null; },
    stage: stageNow,
    get open() { return !!st.mirror; },
  };
}

// The in-world HUD (approved stills 1 and 2): player frame, party frames, target frame, minimap + zone name, quest
// tracker, ability bar with keybind tabs and cooldown / GCD sweeps, cast bar, XP bar, chat / combat log. On touch
// devices: the compact layout, the top menu bar, the ability cluster and the floating joystick.
// Reads only the HUD model (uivm.js). Returns hit regions so ui.js can do hover tooltips and clicks.
import { W, H, trackerRows, inRect } from './layout.js';
import { drawMarkers } from './minimap.js';
import { abilityInfo, abilityTooltip, autoTooltip, classInfo, resourceWord, liveStats } from './gamedata.js';
import { targetCast, threatTag, buffRow, partyExtras } from './group_ui.js';
import { bossFrameRect, drawBossFrame } from './boss_hud.js';   // wave 10 dbosses: the boss frame

const MENU_ICON = { character: 'icon_helm', bags: 'icon_bag', quests: 'icon_quest', talents: 'icon_star', map: 'icon_scroll', help: 'emote_question_0', menu: 'icon_gear' };
/** Quest marks drawn in code (CRITIQUE_1 item 1): a gold ! (quest to take) or ? (ready to turn in), grey when trivial or
 *  in progress. 1 = fill, 2 = highlight, everything inside the outline box is outlined in ink. */
const MARK_GLYPH = {
  '!': ['0110', '1221', '1111', '1111', '1111', '0110', '0110', '0000', '0110', '0110'],
  '?': ['011110', '122221', '110011', '000011', '000111', '001110', '001100', '000000', '001100', '001100'],
};
const MARK_COL = { gold: ['#ffd23a', '#fff2a0'], grey: ['#9c98a8', '#c8c4d0'] };
/** Draw a quest mark with its feet at (cx, bottom). Returns its box. */
export function drawQuestMark(ctx, kind, cx, bottom, grey = false) {
  const rows = MARK_GLYPH[kind] || MARK_GLYPH['!'];
  const w = rows[0].length, h = rows.length;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(bottom - h);
  const on = (x, y) => y >= 0 && y < h && x >= 0 && x < w && rows[y][x] !== '0';
  ctx.fillStyle = '#2a1a10';
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (on(x, y)) continue;
    if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) ctx.fillRect(x0 + x, y0 + y, 1, 1);
  }
  const [c1, c2] = MARK_COL[grey ? 'grey' : 'gold'];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = rows[y][x];
    if (v === '0') continue;
    ctx.fillStyle = v === '2' || y === 0 ? c2 : c1;
    ctx.fillRect(x0 + x, y0 + y, 1, 1);
  }
  return { x: x0 - 1, y: y0 - 1, w: w + 2, h: h + 2 };
}

/** Crossed swords (7 x 7): the "in combat" mark on the player frame (CRITIQUE_1 item 18). */
function drawCombatMark(ctx, x, y) {
  const rows = ['1000001', '0100010', '0010100', '0001000', '0010100', '1100011', '1100011'];
  ctx.fillStyle = '#14101e'; ctx.fillRect(x - 1, y - 1, 9, 9);
  rows.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === '1') { ctx.fillStyle = j >= 5 ? '#c88a3a' : '#e8e4f0'; ctx.fillRect(x + i, y + j, 1, 1); } });
}

/** Do two rects overlap? */
const hit = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const CH_COLOR = { system: 'gold', combat: 'gray', damage_in: 'red', damage_out: 'white', heal: 'green', party: 'blue', say: 'white', loot: 'green', xp: 'violet', error: 'red' };

// world life (src/data/worldlife.js): the rare foe's silver and the rested blue
export const RARE_SILVER = '#d4dce8', REST_BLUE = '#9fc4ff';
export function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }

/** Draw a tooltip box near (x, y), kept on screen. tip: { title, right, sub, body, foot, footColor, lines }. */
export function drawTooltip(g, ctx, tip, x, y, { w = 214, W = 640, H = 360 } = {}) {
  w = Math.max(w, Math.min(300, g.textW(tip.title || '', true) + (tip.right ? g.textW(tip.right) + 10 : 0) + 18));
  const bodyLines = tip.body ? g.wrap(tip.body, w - 14) : [];
  const subLines = tip.sub ? g.wrap(tip.sub, w - 14) : [];
  // numbers (combat role pass): damage or healing per hit, per second, area and targets, one plain line each
  const numLines = [];
  for (const ln of tip.lines || []) numLines.push(...g.wrap(ln, w - 14));
  const footLines = tip.foot ? g.wrap(tip.foot, w - 14) : [];
  const deltaLines = [];
  for (const d of tip.delta || []) for (const ln of g.wrap(d.text, w - 14)) deltaLines.push({ text: ln, color: d.color });
  const lh = g.lh;   // 11, or 16 with Large text (gfx.js g.big, wave 6 uiskin)
  const h = 8 + 16 + subLines.length * lh + (numLines.length ? 2 + numLines.length * lh : 0) + (bodyLines.length ? 2 + bodyLines.length * lh : 0) + (footLines.length ? 4 + footLines.length * lh : 0) + (deltaLines.length ? 3 + deltaLines.length * lh : 0) + 6;
  let tx = Math.round(x), ty = Math.round(y);
  if (tx + w > W - 2) tx = x - 16 - w;
  if (tx + w > W - 2) tx = W - 2 - w;
  if (ty + h > H - 2) ty = H - 2 - h;
  tx = Math.max(2, tx); ty = Math.max(2, ty);
  g.window(ctx, tx, ty, w, h, 'std', 'blue', 0.98);
  const rw = tip.right ? g.textW(tip.right) + 10 : 0;
  g.text(ctx, g.clip(tip.title || '', w - 14 - rw, true), tx + 7, ty + 5, tip.titleColor || 'gold', { large: true });
  if (tip.right) g.text(ctx, tip.right, tx + w - 7, ty + 8, 'cream', { align: 'right' });
  let yy = ty + 22;
  for (const ln of subLines) { g.text(ctx, ln, tx + 7, yy, 'gray'); yy += lh; }
  if (numLines.length) yy += 2;
  for (const ln of numLines) { g.text(ctx, ln, tx + 7, yy, 'cream'); yy += lh; }
  if (bodyLines.length) yy += 2;
  for (const ln of bodyLines) { g.text(ctx, ln, tx + 7, yy, 'white'); yy += lh; }
  if (footLines.length) yy += 4;
  for (const ln of footLines) { g.text(ctx, ln, tx + 7, yy, tip.footColor || 'green'); yy += lh; }
  if (deltaLines.length) yy += 3;
  for (const d of deltaLines) { g.text(ctx, d.text, tx + 7, yy, d.color || 'green'); yy += lh; }
  return { x: tx, y: ty, w, h };
}

/** The tracker rows that fit (pure, ui tests): row heights grow with the line height (`ls`: gfx.js g.ls, Large text), and
 *  the line cap shrinks to the same height a Normal tracker takes, so a Large tracker never reaches lower on the screen. */
export function trackerFit(rows, maxLines, ls = (n) => n) {
  const grow = ls(11) - 11;
  const cap = grow ? Math.max(1, Math.floor((maxLines * 11) / ls(11))) : maxLines;
  const out = rows.length > cap + 1 ? rows.slice(0, cap).concat([{ kind: 'more', text: '...', h: 11 }]) : rows;
  return out.map((r) => ({ ...r, h: ls(r.h) }));
}

export function createHud(env) {
  const { g, charArt, mapBook } = env;

  function playerFrame(ctx, L, p) {
    const r = L.player;
    if (!L.touch) {
      g.window(ctx, r.x, r.y, r.w, r.h);
      charArt.portrait(ctx, p.cls, p.look, r.x + 5, r.y + 5, 32, 32);
      const nx = r.x + 42;
      const lv = `Lv ${p.level}`;
      const nameW = g.textW(p.name);
      g.text(ctx, p.name, nx, r.y + 3, 'white');
      if (nx + nameW + 6 + g.textW(p.clsName) < r.x + r.w - 7 - g.textW(lv) - 4) g.text(ctx, p.clsName, nx + nameW + 6, r.y + 3, 'gray');
      g.text(ctx, lv, r.x + r.w - 7, r.y + 3, 'gold', { align: 'right' });
      bars(ctx, nx, r.y + 17, 76, r.x + r.w - 7, p, false);
    } else {
      g.window(ctx, r.x, r.y, r.w, r.h);
      charArt.portrait(ctx, p.cls, p.look, r.x + 4, r.y + 4, 26, 26);
      g.text(ctx, g.clip(p.name, 70), r.x + 33, r.y + 2, 'white');
      g.text(ctx, `Lv ${p.level}`, r.x + r.w - 6, r.y + 2, 'gold', { align: 'right' });
      g.gauge(ctx, r.x + 33, r.y + 15, r.w - 40, p.hpFrac, 'hp');
      if (p.res) g.gauge(ctx, r.x + 33, r.y + 23, r.w - 40, p.res.frac, p.resGauge);
    }
    if (p.inCombat && !p.dead) drawCombatMark(ctx, r.x + (L.touch ? 22 : 30), r.y + r.h - (L.touch ? 11 : 12));
    // in a party the death panel (group_ui.js) offers Release or Wait, so the frame just says Dead
    if (p.dead) { g.scrim(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 235); g.text(ctx, p.groupDeath ? 'Dead' : p.respawnIn != null ? `Dead. You wake at the lantern in ${Math.ceil(p.respawnIn)}.` : 'Dead. You wake at the lantern.', r.x + r.w / 2, r.y + r.h / 2 - 5, 'red', { align: 'center' }); }
  }

  function bars(ctx, nx, y0, gw, right, u) {
    const rows = [['lbl_hp', u.hp, u.hpMax, 'hp']];
    if (u.res) rows.push([u.resLabel === 'MP' ? 'lbl_mp' : null, u.res.cur, u.res.max, u.resGauge, u.resLabel]);
    rows.forEach(([lbl, v, mx, kind, txt], i) => {
      const y = y0 + i * 12;
      // the resource bar names itself ("RE" read as nothing): the word sits before the numbers, the bar shortens to fit
      const word = i === 1 && u.resWord ? u.resWord + ' ' : '';
      if (lbl) g.icon(ctx, lbl, nx, y + 1); else if (!word) g.text(ctx, txt, nx, y - 2, 'gold');
      const gx = lbl || !word ? nx + 12 : nx, gww = Math.max(20, gw - (word ? g.textW(word) - (lbl ? 0 : 12) : 0));
      g.gauge(ctx, gx, y, gww, mx ? v / mx : 0, kind);
      g.text(ctx, `${word}${fmtInt(v)}/${fmtInt(mx)}`, right, y - 2, 'white', { align: 'right' });
    });
  }

  function partyFrame(ctx, r, u, touch) {
    g.window(ctx, r.x, r.y, r.w, r.h);
    charArt.head(ctx, u.cls || 'warden', u.look || 0, r.x + 5, r.y + 6);
    if (touch) {
      g.text(ctx, g.clip(u.name, r.w - 26), r.x + 20, r.y + 1, 'blue');
      g.gauge(ctx, r.x + 20, r.y + 13, r.w - 26, u.hpFrac, 'hp', true);
      return;
    }
    const lv = `Lv ${u.level}`, room = r.w - 22 - 7 - g.textW(lv) - 6;
    const nm = g.clip(u.name, room);
    g.text(ctx, nm, r.x + 22, r.y + 2, u.dead || u.hp <= 0 ? 'dim' : 'blue');
    if (u.clsName && g.textW(nm) + 6 + g.textW(u.clsName) <= room) g.text(ctx, u.clsName, r.x + 22 + g.textW(nm) + 6, r.y + 2, 'gray');
    g.text(ctx, lv, r.x + r.w - 7, r.y + 2, 'gold', { align: 'right' });
    g.gauge(ctx, r.x + 22, r.y + 14, r.w - 30, u.hpFrac, 'hp', true);
    if (u.res) g.gauge(ctx, r.x + 22, r.y + 21, r.w - 30, u.res.frac, 'mp', true);
  }

  function targetFrame(ctx, L, t) {
    if (t.bossFight) { drawBossFrame(g, ctx, L, t); return; }   // wave 10 dbosses: a boss in its fight gets the boss frame
    const r = L.target;
    const hostile = t.faction === 'hostile';
    g.window(ctx, r.x, r.y, r.w, r.h, 'std', hostile ? 'crimson' : t.kind === 'player' ? 'forest' : 'blue');
    const headOk = (t.npc && g.head(ctx, t.npc, r.x + 6, r.y + 6)) || (t.head && g.head(ctx, t.head, r.x + 6, r.y + 6));
    if (!headOk) { g.rect(ctx, r.x + 6, r.y + 6, 12, 12, '#14101e'); g.rect(ctx, r.x + 7, r.y + 7, 10, 10, '#251d34'); g.text(ctx, '?', r.x + 10, r.y + 6, 'gray'); }
    if (t.elite || t.boss) g.icon(ctx, 'elite_mark', r.x + 6, r.y + 1);
    else if (t.rare) rareMark(ctx, r.x + 6, r.y + 2);           // a rare named foe: the silver mark (src/data/rares.js)
    const lv = t.boss ? 'Boss' : `Lv ${t.level}`;
    const lvW = g.textW(lv);
    g.text(ctx, g.clip(t.name, r.w - 22 - 7 - lvW - 4), r.x + 22, r.y + 4, t.elite || t.boss ? 'gold' : t.rare ? RARE_SILVER : 'white');
    g.text(ctx, lv, r.x + r.w - 7, r.y + 4, hostile ? 'orange' : 'gold', { align: 'right' });
    g.gauge(ctx, r.x + 22, r.y + 17, r.w - 66, t.hpFrac, 'hp');
    g.text(ctx, t.dead ? 'Dead' : `${t.hpPct}%`, r.x + r.w - 7, r.y + 15, 'white', { align: 'right' });
    if (t.elite && !t.boss) g.text(ctx, 'Elite', r.x + 22, r.y + 22, 'gold');
    else if (t.rare) g.text(ctx, 'Rare', r.x + 22, r.y + 22, RARE_SILVER);
    let ax = r.x + 22 + ((t.elite && !t.boss) || t.rare ? 26 : 0);
    for (const a of (t.auras || []).slice(0, 8)) { const ic = `st8_${a.icon || a.id}`; if (g.frame(ic)) { g.icon(ctx, ic, ax, r.y + 24); ax += 9; } }
  }

  /** Under the target frame (group_ui.js): a foe's cast with its interrupt mark and the threat warning; for a party
   *  friend, Trade and Ready check (and Rez when they are down). */
  function groupTarget(ctx, L, m, regions, act) {
    const t = m.target;
    if (!L.targetCast) return;
    // wave 10 dbosses: the boss frame is taller and wider, so the foe's cast and the threat warning step aside
    const bf = t.bossFight ? bossFrameRect(L) : null;
    const tc = bf ? { ...L.targetCast, x: L.touch ? bf.x + bf.w + 4 : L.targetCast.x, y: L.touch ? L.targetCast.y : bf.y + bf.h + 2 } : L.targetCast;
    const th = bf ? { x: bf.x + bf.w + 4, y: L.threat.y } : L.threat;
    if (m.targetCast) targetCast(g, ctx, tc, m.targetCast);
    if (t.faction === 'hostile' && t.threat && m.player.inCombat) threatTag(g, ctx, th.x, th.y, t.threat, { tank: m.player.cls === 'warden' });
    const friend = act && m.group && t.kind === 'player' && (m.party || []).some((u) => u.id === t.id);
    if (!friend) return;
    const r = L.targetCast, bh = Math.max(16, L.touch ? L.minHit || 0 : 0);
    const btns = [['Trade', 'blue', () => act.send({ t: 'trade_open', id: t.id }), 'Trade items and gold with this friend (stand close).'],
      ['Ready?', 'slate', () => act.send({ t: 'ready_start' }), 'Ready check: ask the party if everyone is ready.']];
    if (t.dead && (m.group.canRez || m.group.ash > 0)) btns.push(['Rez', 'forest', () => act.send({ t: 'rez', id: t.id, item: !m.group.canRez }), 'Wake them where they fell at 35% health (10 sec, out of combat).']);
    const bw = Math.floor((r.w - 2 * (btns.length - 1)) / btns.length);
    btns.forEach(([label, scheme, on, body], i) => {
      const bx = r.x + i * (bw + 2);
      g.window(ctx, bx, r.y, bw, bh, 'thin', scheme, 0.95);
      g.text(ctx, label, bx + Math.floor(bw / 2), r.y + Math.floor(bh / 2) - 6, 'cream', { align: 'center' });
      regions.push({ rect: { x: bx, y: r.y, w: bw, h: bh }, kind: 'button', label: `grp:${label.toLowerCase()}`, on, tip: { title: label, body } });
    });
  }

  function minimap(ctx, L, m, zoneName, regions) {
    const r = L.minimap;
    g.window(ctx, r.x, r.y, r.w, r.h, 'thin');
    const inner = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 };
    const ppt = 3;
    const img = m && mapBook.image(m.zone, ppt);
    if (img) {
      const sx = Math.max(0, Math.min(img.width - inner.w, Math.round((m.x / 16) * ppt - inner.w / 2)));
      const sy = Math.max(0, Math.min(img.height - inner.h, Math.round((m.y / 16) * ppt - inner.h / 2)));
      const cw = Math.min(inner.w, img.width), chh = Math.min(inner.h, img.height);
      ctx.fillStyle = '#14101e'; ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      ctx.drawImage(img, sx, sy, cw, chh, inner.x, inner.y, cw, chh);
      drawAreas(ctx, m.areas, inner, ppt, sx, sy, m.zone, 1);
      drawMarkers(g, ctx, m.markers, inner, ppt, sx, sy);
      edgeArrow(ctx, m, inner, ppt, sx, sy);
    }
    const z = L.zoneLabel;
    g.scrim(ctx, z.x, z.y, z.w, z.h, 170);
    g.text(ctx, g.clip(zoneName || '', z.w - 4), z.x + Math.floor(z.w / 2), z.y + 1, 'cream', { align: 'center' });
    regions.push({ rect: r, kind: 'minimap' });
  }

  /** The nearest objective area of the tracked quest, off the minimap: a small gold arrow at the edge toward it. */
  function edgeArrow(ctx, m, inner, ppt, sx, sy) {
    const goal = m.goal;
    if (!goal || goal.zone !== m.zone) return;
    const gx = inner.x + goal.x * ppt - sx, gy = inner.y + goal.y * ppt - sy;
    const r = (goal.r || 1) * ppt;
    if (gx + r >= inner.x && gy + r >= inner.y && gx - r < inner.x + inner.w && gy - r < inner.y + inner.h) return;   // visible already
    const cx = inner.x + inner.w / 2, cy = inner.y + inner.h / 2;
    const dx = gx - cx, dy = gy - cy;
    const k = Math.min((inner.w / 2 - 4) / Math.max(1e-6, Math.abs(dx)), (inner.h / 2 - 4) / Math.max(1e-6, Math.abs(dy)));
    const ax = Math.round(cx + dx * k), ay = Math.round(cy + dy * k);
    const a = Math.atan2(dy, dx);
    const pts = [[3.5, 0], [-2.5, -3], [-2.5, 3]].map(([px, py]) => [px * Math.cos(a) - py * Math.sin(a), px * Math.sin(a) + py * Math.cos(a)]);
    fillTri(ctx, ax, ay, pts.map(([x, y]) => [x * 1.45, y * 1.45]), '#2a1a10');
    fillTri(ctx, ax, ay, pts, '#ffd23a');
  }

  function tracker(ctx, L, m, st, regions, fade) {
    const T = L.tracker;
    if (!m.tracked.length) return;
    let rows = trackerRows(m.tracked, T.w, (s, w) => g.wrap(s, w), (s) => g.textW(s), L.touch ? { areas: true, compact: true, maxQuests: 3, selected: m.selectedQuest } : { areas: true });
    const collapsed = L.touch && st.trackerCollapsed;
    if (collapsed) rows = rows.slice(0, 1);
    rows = trackerFit(rows, T.maxLines, (n) => g.ls(n));
    const h = 4 + rows.reduce((s, r) => s + r.h, 0) + 4;
    const up = g.big ? 3 : 0;          // Large text: the marks sit lower on the taller rows
    const faded = (fade || []).some((u) => hit(u, { x: T.x, y: T.y, w: T.w, h }));
    if (faded) ctx.globalAlpha = 0.3;
    g.scrim(ctx, T.x, T.y, T.w, h, 140);
    let y = T.y + 2;
    for (const row of rows) {
      if (row.kind === 'head') {
        g.text(ctx, 'Quests', T.x + 5, y, 'gold', row.small ? {} : { large: true });
        if (L.touch) g.text(ctx, collapsed ? `${m.tracked.length} +` : '-', T.x + T.w - 5, y + (row.small ? 0 : 3), 'gray', { align: 'right' });
        regions.push({ rect: { x: T.x, y: T.y, w: T.w, h: Math.max(18, L.minHit || 0) }, kind: 'tracker_head' });
      } else {
        // a gold ? when the quest is ready to hand in, a small parchment bullet while it is in progress (a yellow ! means
        // "a quest to take" everywhere else, CRITIQUE_1 item 11+)
        // the selected quest (the one the map and the gold arrow follow) has a gold bullet
        const isSel = row.id && row.id === m.selectedQuest;
        if (row.kind === 'quest') { if (row.done) drawQuestMark(ctx, '?', T.x + 9, y + 10 + up); else { g.rect(ctx, T.x + 6, y + 3 + up, 5, 5, '#14101e'); g.rect(ctx, T.x + 7, y + 4 + up, 3, 3, isSel ? '#ffd23a' : '#d8c8a0'); } }
        const col = row.kind === 'area' ? 'dim' : row.kind === 'obj' ? (row.done ? 'green' : 'gray') : row.done ? 'green' : 'white';
        g.text(ctx, row.text, T.x + (row.kind === 'obj' || row.kind === 'area' ? 27 : 19), y, col);
        if (row.right) g.text(ctx, row.right, T.x + T.w - 5, y, 'green', { align: 'right' });
        if (row.id && !faded) regions.push({ rect: { x: T.x, y, w: T.w, h: row.h }, kind: 'tracker_quest', id: row.id });
      }
      y += row.h;
    }
    ctx.globalAlpha = 1;
  }

  function slot(ctx, r, s, keyLabel, regions, { touch = false, drop = false } = {}) {
    const empty = !s || (!s.ability && !s.item);
    g.window(ctx, r.x, r.y, r.w, r.h, 'thin', empty ? 'slate' : 'blue', empty ? 0.6 : 0.95);
    if (empty) {
      if (!touch) slotKey(ctx, r, keyLabel);
      // an empty slot is a drop target only while an item is being placed (otherwise a click there reaches the world)
      if (drop) regions.push({ rect: r, kind: 'slot', slot: r.slot || (s && s.slot), ability: null, item: null });
      return;
    }
    g.iconIn(ctx, s.icon, r.x, r.y + 1, r.w, r.h - 1);
    const ix = r.x + 2, iy = r.y + 2, iw = r.w - 4, ih = r.h - 4;
    // out of range: red tint. Not enough resource (or not ready): dimmed (CRITIQUE_1 item 6)
    if (!s.inRange) g.rect(ctx, ix, iy, iw, ih, 'rgba(224,80,58,0.45)');
    if (!s.usable) g.rect(ctx, ix, iy, iw, ih, 'rgba(12,10,22,0.62)');
    // an item on the bar: none left greys it out (it stays, with a 0)
    if (s.item && !s.count) g.rect(ctx, ix, iy, iw, ih, 'rgba(120,120,130,0.55)');
    const onCd = s.cdLeft > 0.05 && s.cdLeft >= (s.gcdLeft || 0);
    if (onCd) {
      g.scrim(ctx, ix, iy, iw, ih, 110);
      g.sweep(ctx, ix, iy, iw, ih, s.cdTotal ? s.cdLeft / s.cdTotal : 1);
      const secs = s.cdLeft >= 10 ? String(Math.ceil(s.cdLeft)) : s.cdLeft >= 1 ? String(Math.ceil(s.cdLeft)) : s.cdLeft.toFixed(1);
      // an item slot keeps its count in the corner, so its seconds sit higher and smaller
      if (s.item) g.text(ctx, secs, r.x + Math.floor(r.w / 2), r.y + 3, 'cream', { align: 'center' });
      else g.text(ctx, secs, r.x + Math.floor(r.w / 2) + 1, r.y + Math.floor((r.h - 16) / 2) + 1, 'cream', { large: true, align: 'center' });
    } else if (s.gcdLeft > 0.02) {
      g.sweep(ctx, ix, iy, iw, ih, s.gcdLeft / (s.gcdTotal || 1), 150);
    }
    // the count sits top right, clear of the cooldown seconds in the middle and the key label top left
    // the count sits in the bottom-right corner on a dark tab, clear of the cooldown seconds in the middle
    if (s.item) { const t = String(s.count || 0), tw = 6 * t.length + 3; g.rect(ctx, r.x + r.w - 2 - tw, r.y + r.h - 12, tw, 10, 'rgba(12,10,22,0.85)'); g.num(ctx, t, r.x + r.w - 3, r.y + r.h - 12, s.count ? 'white' : 'red', false, 'right'); }
    if (!touch) slotKey(ctx, r, keyLabel);
    regions.push({ rect: r, kind: 'slot', slot: s.slot, ability: s.ability, item: s.item || null });
  }
  function slotKey(ctx, r, label) {
    const w = Math.max(7, g.textW(label) + 3);
    g.scrim(ctx, r.x + 1, r.y + 1, w, 9, 220);
    g.text(ctx, label, r.x + 2, r.y, 'gold');
  }

  function castBar(ctx, L, c) {
    const { x, y, w } = L.cast;
    g.scrim(ctx, x - 2, y - 12, w + 4, 22, 150);
    g.text(ctx, g.clip(c.name, w - 40), x + 1, y - 12, 'cream');
    g.text(ctx, `${c.left.toFixed(1)}s`, x + w - 1, y - 12, 'gray', { align: 'right' });
    g.gauge(ctx, x, y, w, c.channel ? 1 - c.frac : c.frac, 'atb');
  }

  function xpBar(ctx, L, p) {
    const y = L.xp.y;
    const LW = L.W || W;
    g.scrim(ctx, 0, y - 3, LW, 13, 170);
    g.text(ctx, `Lv ${p.level}`, 4, y - 3, 'gold');
    // rest XP (src/sim/worldlife.js): "Rested" and the banked part as the lighter segment past the fill; "zz" where the
    // hero would rest if they logged out here (a town, a hub, beside a lantern)
    const rest = p.rest || null, banked = rest && p.xpToLevel ? rest.banked || 0 : 0;
    const label = p.xpToLevel ? `${banked > 0 ? 'Rested  ' : ''}${fmtInt(p.xp)} / ${fmtInt(p.xpToLevel)} XP` : 'Max level';
    const lw = g.textW(label);
    const zz = rest && rest.resting ? 12 : 0;
    const gx = 34, gw = LW - 4 - lw - 8 - gx - zz;
    g.gauge(ctx, gx, y, gw, p.xpToLevel ? p.xp / p.xpToLevel : 1, 'exp', false, banked > 0 ? Math.min(1, (p.xp + banked) / p.xpToLevel) : null);
    g.text(ctx, label, LW - 4, y - 3, banked > 0 ? REST_BLUE : 'white', { align: 'right' });
    if (zz) g.text(ctx, 'zz', gx + gw + 3, y - 4, REST_BLUE);
  }
  /** The rare's mark on the target frame: a small silver diamond (the elite's is the gold dragon). */
  function rareMark(ctx, x, y) {
    g.rect(ctx, x + 4, y, 3, 1, '#14101e'); g.rect(ctx, x + 2, y + 1, 7, 1, '#14101e'); g.rect(ctx, x, y + 2, 11, 3, '#14101e');
    g.rect(ctx, x + 2, y + 5, 7, 1, '#14101e'); g.rect(ctx, x + 4, y + 6, 3, 1, '#14101e');
    g.rect(ctx, x + 4, y + 1, 3, 1, RARE_SILVER); g.rect(ctx, x + 2, y + 2, 7, 3, RARE_SILVER); g.rect(ctx, x + 4, y + 5, 3, 1, RARE_SILVER);
    g.rect(ctx, x + 4, y + 2, 2, 1, '#ffffff');
  }

  function chat(ctx, L, lines, st, regions, fade) {
    const C = L.chat;
    const n = C.lines;
    const total = lines.length;
    const maxOff = Math.max(0, total - n);
    st.chatScroll = Math.max(0, Math.min(maxOff, st.chatScroll || 0));
    const view = lines.slice(Math.max(0, total - n - st.chatScroll), total - st.chatScroll);
    if (!view.length) return;
    // wrap long lines; keep the newest at the bottom
    const wrapped = [];
    for (const l of view) {
      const ls = g.wrap(l.text, C.w - 10);
      ls.forEach((t, i) => wrapped.push({ text: t, ch: l.ch, cont: i > 0 }));
    }
    const shown = wrapped.slice(-n);
    const h = 4 + g.lh * shown.length + 2;
    const y0 = C.bottom - h;
    // the player or the target under the log: the log fades to near-clear so the fight shows (CRITIQUE_1 item 3)
    const box = { x: C.x, y: y0, w: C.w, h };
    const faded = (fade || []).some((u) => hit(u, box));
    st.chatFade = (st.chatFade || 0) + ((faded ? 1 : 0) - (st.chatFade || 0)) * 0.2;
    if (st.chatFade > 0.02) ctx.globalAlpha = Math.round((1 - 0.75 * st.chatFade) * 20) / 20;
    g.scrim(ctx, C.x, y0, C.w, h, C.passive ? 90 : 130);
    shown.forEach((l, i) => g.text(ctx, l.text, C.x + 4 + (l.cont ? 6 : 0), y0 + 2 + i * g.lh, CH_COLOR[l.ch] || 'white'));
    if (st.chatScroll > 0) g.text(ctx, `+${st.chatScroll}`, C.x + C.w - 4, y0 + 2, 'dim', { align: 'right' });
    ctx.globalAlpha = 1;
    // a faded log lets clicks through to the fight under it
    if (!C.passive && !faded) regions.push({ rect: { x: C.x, y: y0, w: C.w, h }, kind: 'chat' });
  }

  function menuBar(ctx, L, st, regions) {
    for (const b of L.menuBar) {
      const on = st.openMenu === b.id;
      const d = Math.min(b.w - 4, 26);
      g.window(ctx, b.x + (b.w - d) / 2, b.y + (b.h - d) / 2, d, d, 'thin', on ? 'ember' : 'blue', 0.9);
      g.iconIn(ctx, MENU_ICON[b.id], b.x, b.y, b.w, b.h);
      regions.push({ rect: b, kind: 'menu_button', id: b.id });
    }
  }

  const CLUSTER_WORD = { interact: 'Talk', next_target: 'Next', attack: 'Attack' };
  function touchControls(ctx, L, m, st, regions) {
    const bySlot = new Map(m.bar.map((s) => [s.slot, s]));
    for (const b of L.cluster) {
      const d = Math.min(b.w - (b.w < 34 ? 2 : 6), 34);
      const r = { x: Math.round(b.x + (b.w - d) / 2), y: Math.round(b.y + (b.h - d) / 2), w: d, h: d };
      const pressed = st.pressed === b.id;
      if (b.slot) {
        slot(ctx, r, bySlot.get(b.slot), String(b.slot), [], { touch: true });
        if (pressed) g.outline(ctx, r.x - 1, r.y - 1, r.x + r.w, r.y + r.h, '#fff7d6');
        if (st.barPick) { g.outline(ctx, r.x - 2, r.y - 2, r.x + r.w + 1, r.y + r.h + 1, '#ffd34d'); g.outline(ctx, r.x - 1, r.y - 1, r.x + r.w, r.y + r.h, '#ffd34d'); }
      } else {
        g.window(ctx, r.x, r.y, r.w, r.h, 'thin', pressed ? 'ember' : 'violet', 0.9);
        // a small button (the phone's big HUD layer) shows the word alone, so the label never sits on the icon
        if (r.w >= 30) {
          if (b.id === 'interact') g.iconIn(ctx, 'prompt_talk_0', r.x, r.y - 3, r.w, r.h);
          else if (b.id === 'attack') g.iconIn(ctx, 'icon_sword', r.x, r.y - 3, r.w, r.h);
          else g.iconIn(ctx, 'reticle_0', r.x, r.y - 3, r.w, r.h);
          g.text(ctx, CLUSTER_WORD[b.id], r.x + r.w / 2, r.y + r.h - 12, 'cream', { align: 'center' });
        } else if (b.id === 'attack') g.iconIn(ctx, 'icon_sword', r.x, r.y, r.w, r.h);   // the word does not fit a small button
        else g.text(ctx, CLUSTER_WORD[b.id], r.x + Math.floor(r.w / 2) + 1, r.y + Math.floor(r.h / 2) - 6, 'cream', { align: 'center' });
      }
      const bs = b.slot ? bySlot.get(b.slot) : null;
      // an item slot is pressed on release (tapOnly), so a long press can open its card without using one. A skill is
      // too while out of a fight (its long press opens the card with Move and Take off bar, and never casts it); in a
      // fight a skill fires on touch down, as it always has, and a long press only shows its tooltip
      const holdCard = !!(bs && (bs.item || (bs.ability && !(m.player && m.player.inCombat))));
      regions.push({ rect: b, kind: b.slot ? 'slot' : b.id, slot: b.slot, tip: undefined, ability: bs ? bs.ability : null, item: (bs && bs.item) || null,
        ...(holdCard ? { tapOnly: true } : {}) });
    }
    // mounts: the horseshoe button, once the hero owns a mount (lit while riding)
    const mb = L.mountBtn;
    if (mb && m.player && m.player.mounts && m.player.mounts.length) {
      const d = Math.min(mb.w - (mb.w < 34 ? 2 : 6), 34);
      const r = { x: Math.round(mb.x + (mb.w - d) / 2), y: Math.round(mb.y + (mb.h - d) / 2), w: d, h: d };
      g.window(ctx, r.x, r.y, r.w, r.h, 'thin', st.pressed === 'mount' || m.player.mount ? 'ember' : 'violet', 0.9);
      horseshoe(ctx, r.x + r.w / 2, r.y + r.h / 2, Math.max(3, Math.floor(d / 6)), m.player.mount ? '#ffe08a' : '#d8d4cc');
      regions.push({ rect: mb, kind: 'mount', tip: { title: m.player.mount ? 'Get off' : 'Ride', body: 'Summon your mount, or get off.' } });
    }
    const j = st.joystick;
    if (j) {
      const R = 26;
      ring(ctx, j.x, j.y, R, 'rgba(20,16,30,0.55)', 'rgba(255,247,214,0.7)');
      const kx = j.x + j.dx * R * 0.7, ky = j.y + j.dy * R * 0.7;
      ring(ctx, kx, ky, 10, 'rgba(104,145,217,0.85)', 'rgba(255,247,214,0.95)');
    }
  }
  /** A horseshoe (mounts): an open U of iron, nail holes along it, pixel-hard. u = the size unit in HUD px. */
  function horseshoe(ctx, cx, cy, u, color) {
    cx = Math.round(cx); cy = Math.round(cy);
    const R = 2 * u, r0 = u;
    ctx.fillStyle = '#1c1a24';
    for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
      const d = Math.hypot(x, y); if (d <= R + 1 && d >= r0 - 1 && !(y > 0 && Math.abs(x) < r0 - 1)) ctx.fillRect(cx + x, cy + y, 1, 1);
    }
    ctx.fillStyle = color;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y); if (d <= R && d >= r0 && !(y > 0 && Math.abs(x) < r0)) ctx.fillRect(cx + x, cy + y, 1, 1);
    }
    ctx.fillStyle = '#4a4458';
    for (const a of [-2.4, -1.6, -0.8, 0.8, 1.6, 2.4]) { const k = (R + r0) / 2; ctx.fillRect(cx + Math.round(Math.sin(a) * k), cy - Math.round(Math.cos(a) * k), 1, 1); }
  }
  function ring(ctx, cx, cy, r, fill, edge) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      ctx.fillStyle = edge; ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
      const ih = Math.floor(Math.sqrt(Math.max(0, (r - 1) * (r - 1) - y * y)));
      if (Math.abs(y) < r - 1) { ctx.clearRect(cx - ih, cy + y, ih * 2 + 1, 1); ctx.fillStyle = fill; ctx.fillRect(cx - ih, cy + y, ih * 2 + 1, 1); }
    }
  }

  return {
    /** Draw the HUD; returns hit regions [{ rect, kind, ... }] (topmost last). */
    draw(ctx, m, L, st, opts = {}) {
      const regions = [];
      if (!m.player) return regions;
      // Text size (wave 6 uiskin): the tracker and chat take it on desktop; a phone's play layer is already drawn at the
      // big legible scale (>= 1.5 css px per HUD px, ui.test), so Large there would cover the play area
      const sized = (fn) => (L.touch ? fn() : g.textScope(fn));
      if (L.touch) chat(ctx, L, opts.log || [], st, regions, opts.fade);
      const party = m.party || [];
      const act = opts.act || null;
      // a party frame: a click targets that friend (heals, Trade, Rez); a dead one shows Dead and the Rez button
      // wave 10 integrate: on a phone the boss frame (dbosses) is taller than the target frame: the party frames step below it
      const bf = L.touch && m.target && m.target.bossFight ? bossFrameRect(L) : null;
      const pdy = bf ? Math.max(0, bf.y + bf.h + 2 - L.party(0).y) : 0;
      party.slice(0, 3).forEach((u, i) => {
        const r0 = L.party(i), r = pdy ? { ...r0, y: r0.y + pdy } : r0; partyFrame(ctx, r, u, L.touch);
        regions.push({ rect: r, kind: 'party', id: u.id, ...(act ? { on: () => act.send({ t: 'target', id: u.id }) } : {}) });
        partyExtras(g, ctx, r, u, m.group, regions, act, L.touch);
      });
      playerFrame(ctx, L, { ...m.player, groupDeath: !!(m.group && m.group.death) }); regions.push({ rect: L.player, kind: 'player' });
      if (L.buffs) buffRow(g, ctx, L.buffs.x, L.buffs.y, m.myAuras, regions);
      if (m.target) { targetFrame(ctx, L, m.target); regions.push({ rect: L.target, kind: 'target' }); groupTarget(ctx, L, m, regions, act); }
      minimap(ctx, L, m.minimap, m.zone && m.zone.name, regions);
      sized(() => tracker(ctx, L, m, st, regions, opts.fade));
      if (!L.touch) {
        L.bar.forEach((r, i) => slot(ctx, r, m.bar[i], opts.keyLabels ? opts.keyLabels[i] : String(i + 1), regions, { drop: !!(st.barPick || st.itemDrag) }));
        if (st.barPick || st.itemDrag) for (const r of L.bar) g.outline(ctx, r.x - 1, r.y - 1, r.x + r.w, r.y + r.h, '#ffd34d');
        sized(() => chat(ctx, L, opts.log || [], st, regions, opts.fade));
      }
      if (m.castBar) castBar(ctx, L, m.castBar);
      xpBar(ctx, L, m.player);
      regions.push({ rect: { x: 0, y: L.xp.y - 3, w: L.W || W, h: 13 }, kind: 'xp' });
      if (L.touch) touchControls(ctx, L, m, st, regions);
      return regions;
    },
    /** Touch: the top menu bar, drawn last so it stays reachable over open windows. */
    menuBar(ctx, L, st, regions) { if (L.touch && L.menuBar) menuBar(ctx, L, st, regions); },
    tooltipFor(region, m) {
      if (!region) return null;
      if (region.kind === 'slot' && region.ability) {
        const a = abilityInfo(region.ability);
        const tip = abilityTooltip(a, m.player.level, (classInfo(m.player.cls) || {}).resource || 'mana', liveStats(m));
        if (!tip) return null;
        const s = m.bar.find((b) => b.slot === region.slot);
        if (s && !s.inRange) tip.foot = 'Out of range.';
        else if (s && !s.usable && s.cdLeft > 0.05) tip.foot = `Ready in ${Math.ceil(s.cdLeft)} sec.`;
        else if (s && !s.usable) tip.foot = `Not enough ${resourceWord(m.player.res ? m.player.res.kind : (classInfo(m.player.cls) || {}).resource)}.`;
        if (tip.foot) tip.footColor = 'red';
        return tip;
      }
      if (region.kind === 'attack') return autoTooltip(liveStats(m), m.player.cls);
      if (region.kind === 'xp' && m.player.xpToLevel) {
        const left = m.player.xpToLevel - m.player.xp;
        const rest = m.player.rest || {};
        const rested = rest.banked > 0 ? ` Rested: kills give double experience for ${fmtInt(rest.banked)} more.` : '';
        const zz = rest.resting ? ' You are resting here: time away from the game banks rest.' : '';
        return { title: `Level ${m.player.level}`, sub: `${fmtInt(m.player.xp)} of ${fmtInt(m.player.xpToLevel)} XP`, body: `${fmtInt(left)} XP to level ${m.player.level + 1}.${rested}${zz}` };
      }
      if (region.kind === 'minimap' && m.zone) return { title: m.zone.name, sub: 'Click to open the world map (M).' };
      return null;
    },
  };
}

/** Soft objective areas (a dithered gold disc) on a minimap or world map. areas: [{ zone, x, y, r }] in tiles. */
export function drawAreas(ctx, areas, view, ppt, sx, sy, zone, minR = 1, look = null) {
  if (!areas || !areas.length) return;
  // look (the world map): { sel: questId, pulse: 0..1 }. The selected quest's circles are brighter, with a ring that
  // pulses out from the edge; every other quest's circles are dimmed. They draw last so they sit on top.
  const isSel = (a) => !!(look && look.sel && a.quest === look.sel);
  const order = look ? [...areas.filter((a) => !isSel(a)), ...areas.filter(isSel)] : areas;
  for (const a of order) {
    if (a.zone && zone && a.zone !== zone) continue;
    const sel = isSel(a), dim = !!(look && look.sel && !sel);
    const cx = view.x + a.x * ppt - sx, cy = view.y + a.y * ppt - sy, r = Math.max(minR * ppt, (a.r || 2) * ppt);
    const ring = sel ? r + 1 + Math.round((look.pulse || 0) * 4) : r;
    const edgeC = sel ? 'rgba(255,240,150,1)' : dim ? 'rgba(255,210,58,0.4)' : 'rgba(255,210,58,0.9)';
    const fillC = sel ? `rgba(255,214,70,${(0.45 + 0.2 * (look.pulse || 0)).toFixed(2)})` : dim ? 'rgba(255,210,58,0.14)' : 'rgba(255,210,58,0.35)';
    const ringC = sel ? `rgba(255,236,140,${(0.85 * (1 - (look.pulse || 0))).toFixed(2)})` : null;
    const x0 = Math.max(view.x, Math.floor(cx - ring)), x1 = Math.min(view.x + view.w - 1, Math.ceil(cx + ring));
    const y0 = Math.max(view.y, Math.floor(cy - ring)), y1 = Math.min(view.y + view.h - 1, Math.ceil(cy + ring));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (ringC && d <= ring && d > ring - 1.2 && d > r) { ctx.fillStyle = ringC; ctx.fillRect(x, y, 1, 1); continue; }
      if (d > r) continue;
      const edge = d > r - (sel ? 2 : 1.2);
      if (!edge && (x + y) % 2) continue;
      ctx.fillStyle = edge ? edgeC : fillC;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** The gold goal arrow (questnav.js): a chevron at (x, y) pointing along `ang` (radians, screen), `s` times its
 *  desktop size, on a dark outline so it reads on grass and on snow. */
export function drawGoalArrow(ctx, x, y, ang, s = 1) {
  const c = Math.cos(ang), sn = Math.sin(ang);
  const P = [[6, 0], [-4, -5], [-1.5, 0], [-4, 5]];
  const rot = (k) => P.map(([px, py]) => [(px * c - py * sn) * s * k, (px * sn + py * c) * s * k]);
  const quad = (Q, color) => { fillTri(ctx, x, y, [Q[0], Q[1], Q[2]], color); fillTri(ctx, x, y, [Q[0], Q[2], Q[3]], color); };
  quad(rot(1.4), '#2a1a10');
  quad(rot(1), '#ffd23a');
  const hi = rot(0.55);
  fillTri(ctx, x, y, [hi[0], hi[1], hi[2]], '#fff1a8');
}

function fillTri(ctx, x, y, P, color) {
  const ys = P.map((p) => p[1]);
  ctx.fillStyle = color;
  for (let yy = Math.floor(Math.min(...ys)); yy <= Math.ceil(Math.max(...ys)); yy++) {
    const xs = [];
    for (let i = 0; i < 3; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % 3];
      if (yy >= Math.min(y0, y1) && yy <= Math.max(y0, y1) && y0 !== y1) xs.push(x0 + ((yy - y0) * (x1 - x0)) / (y1 - y0));
    }
    if (xs.length < 2) continue;
    const a = Math.round(Math.min(...xs)), b = Math.round(Math.max(...xs));
    ctx.fillRect(x + a, y + yy, b - a + 1, 1);
  }
}

export { inRect };

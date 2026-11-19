// The in-world HUD (approved stills 1 and 2): player frame, party frames, target frame, minimap + zone name, quest
// tracker, ability bar with keybind tabs and cooldown / GCD sweeps, cast bar, XP bar, chat / combat log. On touch
// devices: the compact layout, the top menu bar, the ability cluster and the floating joystick.
// Reads only the HUD model (uivm.js). Returns hit regions so ui.js can do hover tooltips and clicks.
import { W, H, trackerRows, inRect } from './layout.js';
import { drawMarkers } from './minimap.js';
import { abilityInfo, abilityTooltip, classInfo } from './gamedata.js';

const MENU_ICON = { character: 'icon_helm', bags: 'icon_bag', quests: 'icon_quest', talents: 'icon_star', map: 'icon_scroll', menu: 'icon_gear' };
const CH_COLOR = { system: 'gold', combat: 'gray', damage_in: 'red', damage_out: 'white', heal: 'green', party: 'blue', say: 'white', loot: 'green', xp: 'violet', error: 'red' };

export function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }

/** Draw a tooltip box near (x, y), kept on screen. tip: { title, right, sub, body, foot, footColor, lines }. */
export function drawTooltip(g, ctx, tip, x, y, { w = 214 } = {}) {
  w = Math.max(w, Math.min(300, g.textW(tip.title || '', true) + (tip.right ? g.textW(tip.right) + 10 : 0) + 18));
  const bodyLines = tip.body ? g.wrap(tip.body, w - 14) : [];
  const subLines = tip.sub ? g.wrap(tip.sub, w - 14) : [];
  const footLines = tip.foot ? g.wrap(tip.foot, w - 14) : [];
  const h = 8 + 16 + subLines.length * 11 + (bodyLines.length ? 2 + bodyLines.length * 11 : 0) + (footLines.length ? 4 + footLines.length * 11 : 0) + 6;
  let tx = Math.round(x), ty = Math.round(y);
  if (tx + w > W - 2) tx = W - 2 - w;
  if (ty + h > H - 2) ty = H - 2 - h;
  tx = Math.max(2, tx); ty = Math.max(2, ty);
  g.window(ctx, tx, ty, w, h, 'std', 'blue', 0.98);
  const rw = tip.right ? g.textW(tip.right) + 10 : 0;
  g.text(ctx, g.clip(tip.title || '', w - 14 - rw, true), tx + 7, ty + 5, tip.titleColor || 'gold', { large: true });
  if (tip.right) g.text(ctx, tip.right, tx + w - 7, ty + 8, 'cream', { align: 'right' });
  let yy = ty + 22;
  for (const ln of subLines) { g.text(ctx, ln, tx + 7, yy, 'gray'); yy += 11; }
  if (bodyLines.length) yy += 2;
  for (const ln of bodyLines) { g.text(ctx, ln, tx + 7, yy, 'white'); yy += 11; }
  if (footLines.length) yy += 4;
  for (const ln of footLines) { g.text(ctx, ln, tx + 7, yy, tip.footColor || 'green'); yy += 11; }
  return { x: tx, y: ty, w, h };
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
    if (p.dead) { g.scrim(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 235); g.text(ctx, p.respawnIn != null ? `Dead. You wake at the lantern in ${Math.ceil(p.respawnIn)}.` : 'Dead. You wake at the lantern.', r.x + r.w / 2, r.y + r.h / 2 - 5, 'red', { align: 'center' }); }
  }

  function bars(ctx, nx, y0, gw, right, u) {
    const rows = [['lbl_hp', u.hp, u.hpMax, 'hp']];
    if (u.res) rows.push([u.resLabel === 'MP' ? 'lbl_mp' : null, u.res.cur, u.res.max, u.resGauge, u.resLabel]);
    rows.forEach(([lbl, v, mx, kind, txt], i) => {
      const y = y0 + i * 12;
      if (lbl) g.icon(ctx, lbl, nx, y + 1); else g.text(ctx, txt, nx, y - 2, 'gold');
      g.gauge(ctx, nx + 12, y, gw, mx ? v / mx : 0, kind);
      g.text(ctx, `${fmtInt(v)}/${fmtInt(mx)}`, right, y - 2, 'white', { align: 'right' });
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
    const r = L.target;
    const hostile = t.faction === 'hostile';
    g.window(ctx, r.x, r.y, r.w, r.h, 'std', hostile ? 'crimson' : t.kind === 'player' ? 'forest' : 'blue');
    const headOk = t.head && g.head(ctx, t.head, r.x + 6, r.y + 6);
    if (!headOk) { g.rect(ctx, r.x + 6, r.y + 6, 12, 12, '#14101e'); g.rect(ctx, r.x + 7, r.y + 7, 10, 10, '#251d34'); g.text(ctx, '?', r.x + 10, r.y + 6, 'gray'); }
    if (t.elite || t.boss) g.icon(ctx, 'elite_mark', r.x + 6, r.y + 1);
    const lv = t.boss ? 'Boss' : `Lv ${t.level}`;
    const lvW = g.textW(lv);
    g.text(ctx, g.clip(t.name, r.w - 22 - 7 - lvW - 4), r.x + 22, r.y + 4, t.elite || t.boss ? 'gold' : 'white');
    g.text(ctx, lv, r.x + r.w - 7, r.y + 4, hostile ? 'orange' : 'gold', { align: 'right' });
    g.gauge(ctx, r.x + 22, r.y + 17, r.w - 66, t.hpFrac, 'hp');
    g.text(ctx, t.dead ? 'Dead' : `${t.hpPct}%`, r.x + r.w - 7, r.y + 15, 'white', { align: 'right' });
    if (t.elite && !t.boss) g.text(ctx, 'Elite', r.x + 22, r.y + 22, 'gold');
    let ax = r.x + 22 + (t.elite && !t.boss ? 26 : 0);
    for (const a of (t.auras || []).slice(0, 8)) { const ic = `st8_${a.icon || a.id}`; if (g.frame(ic)) { g.icon(ctx, ic, ax, r.y + 24); ax += 9; } }
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
      drawMarkers(g, ctx, m.markers, inner, ppt, sx, sy);
    }
    const z = L.zoneLabel;
    g.scrim(ctx, z.x, z.y, z.w, z.h, 170);
    g.text(ctx, g.clip(zoneName || '', z.w - 4), z.x + Math.floor(z.w / 2), z.y + 1, 'cream', { align: 'center' });
    regions.push({ rect: r, kind: 'minimap' });
  }

  function tracker(ctx, L, m, st, regions) {
    const T = L.tracker;
    if (!m.tracked.length) return;
    let rows = trackerRows(m.tracked, T.w, (s, w) => g.wrap(s, w), (s) => g.textW(s));
    const collapsed = L.touch && st.trackerCollapsed;
    if (collapsed) rows = rows.slice(0, 1);
    const maxLines = T.maxLines;
    if (rows.length > maxLines + 1) rows = rows.slice(0, maxLines).concat([{ kind: 'more', text: '...', h: 11 }]);
    const h = 4 + rows.reduce((s, r) => s + r.h, 0) + 4;
    g.scrim(ctx, T.x, T.y, T.w, h, 140);
    let y = T.y + 2;
    for (const row of rows) {
      if (row.kind === 'head') {
        g.text(ctx, 'Quests', T.x + 5, y, 'gold', { large: true });
        if (L.touch) g.text(ctx, collapsed ? `${m.tracked.length} +` : '-', T.x + T.w - 5, y + 3, 'gray', { align: 'right' });
        regions.push({ rect: { x: T.x, y: T.y, w: T.w, h: Math.max(18, L.minHit || 0) }, kind: 'tracker_head' });
      } else {
        if (row.kind === 'quest') g.icon(ctx, 'icon_quest', T.x + 4, y - 1);
        const col = row.kind === 'obj' ? (row.done ? 'green' : 'gray') : row.done ? 'green' : 'white';
        g.text(ctx, row.text, T.x + (row.kind === 'obj' ? 27 : 19), y, col);
        if (row.right) g.text(ctx, row.right, T.x + T.w - 5, y, 'green', { align: 'right' });
        if (row.id) regions.push({ rect: { x: T.x, y, w: T.w, h: row.h }, kind: 'tracker_quest', id: row.id });
      }
      y += row.h;
    }
  }

  function slot(ctx, r, s, keyLabel, regions, { touch = false } = {}) {
    const empty = !s || !s.ability;
    g.window(ctx, r.x, r.y, r.w, r.h, 'thin', empty ? 'slate' : 'blue', empty ? 0.6 : 0.95);
    if (empty) { if (!touch) slotKey(ctx, r, keyLabel); return; }
    g.iconIn(ctx, s.icon, r.x, r.y + 1, r.w, r.h - 1);
    const ix = r.x + 2, iy = r.y + 2, iw = r.w - 4, ih = r.h - 4;
    if (!s.inRange) g.rect(ctx, ix, iy, iw, ih, 'rgba(224,80,58,0.45)');
    else if (!s.usable) g.rect(ctx, ix, iy, iw, ih, 'rgba(40,56,150,0.55)');
    const onCd = s.cdLeft > 0.05 && s.cdLeft >= (s.gcdLeft || 0);
    if (onCd) {
      g.scrim(ctx, ix, iy, iw, ih, 110);
      g.sweep(ctx, ix, iy, iw, ih, s.cdTotal ? s.cdLeft / s.cdTotal : 1);
      const secs = s.cdLeft >= 10 ? String(Math.ceil(s.cdLeft)) : s.cdLeft >= 1 ? String(Math.ceil(s.cdLeft)) : s.cdLeft.toFixed(1);
      g.text(ctx, secs, r.x + Math.floor(r.w / 2) + 1, r.y + Math.floor((r.h - 16) / 2) + 1, 'cream', { large: true, align: 'center' });
    } else if (s.gcdLeft > 0.02) {
      g.sweep(ctx, ix, iy, iw, ih, s.gcdLeft / (s.gcdTotal || 1), 150);
    }
    if (!touch) slotKey(ctx, r, keyLabel);
    regions.push({ rect: r, kind: 'slot', slot: s.slot, ability: s.ability });
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
    g.scrim(ctx, 0, y - 3, W, 13, 170);
    g.text(ctx, `Lv ${p.level}`, 4, y - 3, 'gold');
    const label = p.xpToLevel ? `${fmtInt(p.xp)} / ${fmtInt(p.xpToLevel)} XP` : 'Max level';
    const lw = g.textW(label);
    const gx = 34, gw = W - 4 - lw - 8 - gx;
    g.gauge(ctx, gx, y, gw, p.xpToLevel ? p.xp / p.xpToLevel : 1, 'exp');
    g.text(ctx, label, W - 4, y - 3, 'white', { align: 'right' });
  }

  function chat(ctx, L, lines, st, regions) {
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
    const h = 4 + 11 * shown.length + 2;
    const y0 = C.bottom - h;
    g.scrim(ctx, C.x, y0, C.w, h, C.passive ? 90 : 130);
    shown.forEach((l, i) => g.text(ctx, l.text, C.x + 4 + (l.cont ? 6 : 0), y0 + 2 + i * 11, CH_COLOR[l.ch] || 'white'));
    if (st.chatScroll > 0) g.text(ctx, `+${st.chatScroll}`, C.x + C.w - 4, y0 + 2, 'dim', { align: 'right' });
    if (!C.passive) regions.push({ rect: { x: C.x, y: y0, w: C.w, h }, kind: 'chat' });
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

  function touchControls(ctx, L, m, st, regions) {
    const bySlot = new Map(m.bar.map((s) => [s.slot, s]));
    for (const b of L.cluster) {
      const d = Math.min(b.w - 6, 34);
      const r = { x: Math.round(b.x + (b.w - d) / 2), y: Math.round(b.y + (b.h - d) / 2), w: d, h: d };
      const pressed = st.pressed === b.id;
      if (b.slot) {
        slot(ctx, r, bySlot.get(b.slot), String(b.slot), [], { touch: true });
        if (pressed) g.outline(ctx, r.x - 1, r.y - 1, r.x + r.w, r.y + r.h, '#fff7d6');
      } else {
        g.window(ctx, r.x, r.y, r.w, r.h, 'thin', pressed ? 'ember' : 'violet', 0.9);
        if (b.id === 'interact') g.iconIn(ctx, 'prompt_talk_0', r.x, r.y - 3, r.w, r.h);
        else g.iconIn(ctx, 'reticle_0', r.x, r.y - 3, r.w, r.h);
        g.text(ctx, b.id === 'interact' ? 'Talk' : 'Next', r.x + r.w / 2, r.y + r.h - 12, 'cream', { align: 'center' });
      }
      regions.push({ rect: b, kind: b.slot ? 'slot' : b.id, slot: b.slot, ability: b.slot && bySlot.get(b.slot) ? bySlot.get(b.slot).ability : null });
    }
    const j = st.joystick;
    if (j) {
      const R = 26;
      ring(ctx, j.x, j.y, R, 'rgba(20,16,30,0.55)', 'rgba(255,247,214,0.7)');
      const kx = j.x + j.dx * R * 0.7, ky = j.y + j.dy * R * 0.7;
      ring(ctx, kx, ky, 10, 'rgba(104,145,217,0.85)', 'rgba(255,247,214,0.95)');
    }
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
      if (L.touch) chat(ctx, L, opts.log || [], st, regions);
      const party = m.party || [];
      party.slice(0, 3).forEach((u, i) => { const r = L.party(i); partyFrame(ctx, r, u, L.touch); regions.push({ rect: r, kind: 'party', id: u.id }); });
      playerFrame(ctx, L, m.player); regions.push({ rect: L.player, kind: 'player' });
      if (m.target) { targetFrame(ctx, L, m.target); regions.push({ rect: L.target, kind: 'target' }); }
      minimap(ctx, L, m.minimap, m.zone && m.zone.name, regions);
      tracker(ctx, L, m, st, regions);
      if (!L.touch) {
        L.bar.forEach((r, i) => slot(ctx, r, m.bar[i], opts.keyLabels ? opts.keyLabels[i] : String(i + 1), regions));
        chat(ctx, L, opts.log || [], st, regions);
      }
      if (m.castBar) castBar(ctx, L, m.castBar);
      xpBar(ctx, L, m.player);
      regions.push({ rect: { x: 0, y: L.xp.y - 3, w: W, h: 13 }, kind: 'xp' });
      if (L.touch) touchControls(ctx, L, m, st, regions);
      return regions;
    },
    /** Touch: the top menu bar, drawn last so it stays reachable over open windows. */
    menuBar(ctx, L, st, regions) { if (L.touch && L.menuBar) menuBar(ctx, L, st, regions); },
    tooltipFor(region, m) {
      if (!region) return null;
      if (region.kind === 'slot' && region.ability) {
        const a = abilityInfo(region.ability);
        const tip = abilityTooltip(a, m.player.level, (classInfo(m.player.cls) || {}).resource || 'mana');
        if (!tip) return null;
        const s = m.bar.find((b) => b.slot === region.slot);
        if (s && !s.inRange) tip.foot = 'Out of range.';
        else if (s && !s.usable) tip.foot = `Not enough ${(classInfo(m.player.cls) || {}).resource || 'mana'}.`;
        if (tip.foot) tip.footColor = 'red';
        return tip;
      }
      if (region.kind === 'xp' && m.player.xpToLevel) {
        const left = m.player.xpToLevel - m.player.xp;
        return { title: `Level ${m.player.level}`, sub: `${fmtInt(m.player.xp)} of ${fmtInt(m.player.xpToLevel)} XP`, body: `${fmtInt(left)} XP to level ${m.player.level + 1}.` };
      }
      if (region.kind === 'minimap' && m.zone) return { title: m.zone.name, sub: 'Click to open the world map (M).' };
      return null;
    },
  };
}

export { inRect };

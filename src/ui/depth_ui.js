// Depths, the drawing (wave 10 dtiers, Scott 2026-11-25: "Yes for your recommendations"; brief
// D:/LQOnline/wave10/dtiers/BRIEF.md). Drawn with the g.* calls so the skin and Text size apply. Reads the HUD block's
// `depths` part (src/sim/depths.js hudOf); sends depth_pick / coffer_take. Every word is a DRAFT for Scott
// (src/data/depths.js DEPTH_WORDS, DEPTH_MODS).
//   - the depth rows on dflow's door card (addDoorRow): Depth - +, the candle, what the foes become, this week, the board
//   - the run strip in a depth copy: Depth, the candle, the modifiers, falls
//   - the friends' board (this week / best ever), Send my board (the #depths= link), a link that arrived
//   - the Sevennight Coffer: its slots and the pick
//
//   const DU = createDepthUI({ g, send, toast, storage, loc, win, nav })
//   DU.draw(ctx, L, regions, hud, me, busy)   DU.covers()   DU.escape()   DU.S (drivers)
import { addDoorRow } from './delve_ui.js';
import { DEPTH_RULES, DEPTH_MODS, DEPTH_WORDS } from '../data/depths.js';
import { weekStartDay, dayText } from '../core/eastern_week.js';
import { encodeBoard, readLink, clearLink, mergeBoard, readStore, writeStore, boardRows } from '../net/depth_board.js';

const W = DEPTH_WORDS;
const GROUP_COL = { margin: 'blue', bold: 'ember', page: 'violet' };
const MOD = {};
for (const [g, list] of Object.entries(DEPTH_MODS)) for (const m of list) MOD[m.id] = { ...m, group: g };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '23 Nov' for the Monday of a week number. */
export function mondayText(week) { const [, m, d] = dayText(weekStartDay(week)).split('-'); return `${Number(d)} ${MON[Number(m) - 1]}`; }
export const mmss = (s) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;
/** The foes' numbers at a depth with this week's modifiers, over today: { hp, dmg } as multipliers (the sim's own rule). */
export function foesAt(depth, weekIds) {
  const R = DEPTH_RULES, d = Math.max(0, depth | 0);
  let hp = Math.pow(1 + R.hpStep, d);
  const dmg = Math.pow(1 + R.dmgStep, d);
  if (d >= R.groups.margin && weekIds && weekIds.margin === 'thick_ink') hp *= R.mod.thickInk;
  return { hp, dmg };
}
/** This week's modifiers a run at this depth carries: [{ id, name, text, group, from, on }]. */
export function modsFor(weekIds, depth) {
  return ['margin', 'bold', 'page'].filter((g) => weekIds && weekIds[g]).map((g) => ({ ...MOD[weekIds[g]], from: DEPTH_RULES.groups[g], on: depth >= DEPTH_RULES.groups[g] }));
}

export function createDepthUI({ g, send, toast = () => {}, storage = globalThis.localStorage, loc = globalThis.location, win = globalThis.window, nav = globalThis.navigator }) {
  const S = { board: false, tab: 'week', coffer: false, sel: 0, linkFrom: null, big: false, hud: null, me: null };
  const store = storage || { getItem: () => null, setItem: () => {} };
  let saved = readStore(store);
  // a board link at load (like #join= and #note=): kept on this device, the board opens once a hero is in the world
  try {
    const got = readLink(loc);
    if (got) { saved.board = mergeBoard(saved.board, got); writeStore(store, saved); S.linkFrom = got.name; S.linkWeek = got.week; }
    if (loc && /[#&]depths=/.test(String(loc.hash || ''))) { if (!got) S.badLink = true; clearLink(win); }
  } catch { /* no location (node) */ }

  const bh = (L) => Math.max(g.ls(15), L.touch ? L.minHit || 0 : 0);
  const btn = (ctx, regions, x, y, w, h, label, scheme, on) => {
    g.window(ctx, x, y, w, h, 'thin', scheme, 0.95);
    g.text(ctx, g.clip(label, w - 6), x + w / 2, y + Math.round((h - g.lh) / 2) + 1, on ? 'cream' : 'dim', { align: 'center' });
    if (on) regions.push({ rect: { x, y, w, h }, kind: 'button', label: `depths:${label}`, on });
  };
  const chip = (ctx, x, y, label, scheme, on = true) => {
    const w = g.textW(label) + 10, h = g.lh + 3;
    g.window(ctx, x, y, w, h, 'thin', scheme, on ? 0.92 : 0.45);
    g.text(ctx, label, x + 5, y + 2, on ? 'cream' : 'dim');
    return w;
  };
  const pickOf = (hud, place) => { const p = hud && hud.depths && hud.depths.pick; return p && p.place === place ? p : { place, depth: 0, candle: false }; };
  const sendPick = (place, depth, candle) => send({ t: 'depth_pick', place, depth, candle: !!candle && depth > 0 });

  // ---------------------------------------------------------------- the door card rows (dflow's card, addDoorRow)
  const open = (D, hud) => (hud && hud.depths && hud.depths.open && hud.depths.open[D.id]) | 0;
  addDoorRow((D, hud) => {
    const top = open(D, hud);
    if (!top) return null;
    const p = pickOf(hud, D.id);
    return { label: W.row, value: p.depth ? `${p.depth} of ${top}` : W.off, color: p.depth ? 'gold' : 'gray',
      buttons: [['-', p.depth > 0 ? () => sendPick(D.id, p.depth - 1, p.candle) : null], ['+', p.depth < top ? () => sendPick(D.id, p.depth + 1, p.candle) : null]] };
  });
  addDoorRow((D, hud) => {
    const p = pickOf(hud, D.id);
    if (!open(D, hud) || !p.depth) return null;
    return { label: W.candle, value: p.candle ? `${DEPTH_RULES.candle[D.id] || 25}:00` : W.unlit, color: p.candle ? 'gold' : 'gray',
      buttons: [[p.candle ? 'On' : 'Off', () => sendPick(D.id, p.depth, !p.candle), p.candle ? 'ember' : 'slate']] };
  });
  addDoorRow((D, hud) => {
    const p = pickOf(hud, D.id);
    if (!open(D, hud) || !p.depth) return null;
    const f = foesAt(p.depth, hud.depths.mods);
    return { label: 'Foes', value: `+${Math.round((f.hp - 1) * 100)}% health, +${Math.round((f.dmg - 1) * 100)}% hits`, color: 'orange' };
  });
  addDoorRow((D, hud) => {
    const p = pickOf(hud, D.id);
    if (!open(D, hud) || !p.depth) return null;
    const on = modsFor(hud.depths.mods, p.depth).filter((m) => m.on).map((m) => m.name);
    return { label: W.thisWeek, value: on.join(', '), color: 'cream' };
  });
  addDoorRow((D, hud) => (open(D, hud) ? { label: W.board, value: '', buttons: [[W.depthsBtn, () => { S.board = true; S.coffer = false; }, 'violet']] } : null));

  // ---------------------------------------------------------------- the run strip
  function strip(ctx, L, run) {
    const touch = !!L.touch;
    const mods = (run.mods || []).map((id) => MOD[id]).filter(Boolean);
    const d = W.strip(run.depth), cl = run.candle ? (run.out ? W.out : mmss(run.left)) : '';
    const tw = g.textW(d) + 14 + (cl ? g.textW(cl) + 14 : 0);
    const mw = mods.reduce((s, m) => s + g.textW(m.name) + 16, 0);
    const fl = !touch && run.falls ? W.falls(run.falls, run.candle ? mmss(run.falls * DEPTH_RULES.deathSec) : '0:00') : '';
    const Wd = Math.max(tw, mw, fl ? g.textW(fl) : 0) + 16, Hh = g.lh * 2 + 14 + (fl ? g.lh : 0);
    const mb = (L.menuBar || [])[0];
    const x = Math.round((L.W - Wd) / 2), y = touch ? (mb ? mb.y + mb.h + 4 : 4) : 44;
    g.window(ctx, x, y, Wd, Hh, 'thin', 'blue', 0.88);
    let cx = x + 8;
    g.text(ctx, d, cx, y + 5, 'gold'); cx += g.textW(d) + 14;
    if (cl) {
      const frac = run.out ? 0 : Math.max(0, Math.min(1, run.left / Math.max(1, run.total)));
      g.rect(ctx, cx, y + 6, 4, g.lh - 2, '#3a2c1c');
      g.rect(ctx, cx, y + 6 + Math.round((1 - frac) * (g.lh - 2)), 4, Math.round(frac * (g.lh - 2)), '#f3e2b0');
      if (!run.out) g.rect(ctx, cx + 1, y + 3 + Math.round((1 - frac) * (g.lh - 2)), 2, 3, '#ffb347');
      g.text(ctx, cl, cx + 10, y + 5, run.out ? 'dim' : run.left < run.total * 0.15 ? 'red' : 'cream');
    }
    let mx = x + 8;
    const my = y + 5 + g.lh + 4;
    for (const m of mods) mx += chip(ctx, mx, my, m.name, GROUP_COL[m.group] || 'blue') + 6;
    if (fl) g.text(ctx, fl, x + Wd / 2, my + g.lh + 4, 'dim', { align: 'center' });
  }

  // ---------------------------------------------------------------- the board
  function boardData(hud, me) {
    const dp = hud.depths;
    const B = JSON.parse(JSON.stringify(saved.board || {}));
    mergeBoard(B, { name: me.name, cls: me.cls, week: dp.week, runs: dp.runs || [] });
    for (const [, r] of Object.entries(dp.best || {})) mergeBoard(B, { name: me.name, cls: me.cls, week: r.week, runs: [r] });
    for (const f of dp.friends || []) mergeBoard(B, { name: f.name, cls: f.cls, week: dp.week, runs: f.runs || [] });
    return B;
  }
  function shareBoard(hud, me) {
    const dp = hud.depths;
    const best = {};
    for (const r of dp.runs || []) if (!best[r.place] || r.depth > best[r.place].depth || (r.depth === best[r.place].depth && r.secs < best[r.place].secs)) best[r.place] = r;
    const runs = Object.values(best);
    if (!runs.length) { toast(W.none); return; }
    const url = `${loc ? `${loc.origin}${loc.pathname}` : ''}#${encodeBoard({ name: me.name, cls: me.cls, week: dp.week, runs })}`;
    const copy = () => { try { return nav.clipboard.writeText(url).then(() => toast('Link copied.'), () => toast(url)); } catch { toast(url); return null; } };
    try {
      if (nav && typeof nav.share === 'function') nav.share({ title: 'Lexicon Realms', text: W.shareText(me.name), url }).catch((e) => { if (!e || e.name !== 'AbortError') copy(); });
      else copy();
    } catch { copy(); }
  }
  function board(ctx, L, regions, hud, me) {
    const dp = hud.depths, touch = !!L.touch, h = bh(L);
    const rows = boardRows(boardData(hud, me), dp.week, S.tab, me.name).slice(0, touch ? 6 : 9);
    const Wd = touch ? L.W - 12 : g.big ? 640 : 520;
    const x = Math.round((L.W - Wd) / 2);
    const cols = touch ? [0, 0.34, 0.56, 0.72] : [0, 0.34, 0.54, 0.7];
    const rowH = g.lh + 2;
    const slots = dp.slots || [];
    const have = (dp.runs || []).length, full = slots.filter((s) => s.open).length;
    const note = S.linkFrom ? W.cameByLink(S.linkFrom) : S.badLink ? W.badLink : '';
    const H = 8 + g.lh + 6 + g.lh + 8 + g.lh + 2 + Math.max(1, rows.length) * rowH + 6 + (note ? g.lh + 4 : 0) + g.lh * 2 + 12 + h + 8;
    const mb = (L.menuBar || [])[0];
    const y = touch ? Math.max(mb ? mb.y + mb.h + 2 : 2, Math.round((L.H - H) / 2)) : Math.max(30, Math.round((L.H - H) / 2) - 20);
    regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'window', id: 'depths_board' });
    g.window(ctx, x, y, Wd, H, 'std', 'blue', 0.97);
    g.text(ctx, W.board, x + 10, y + 8, 'gold');
    g.text(ctx, `Week of ${mondayText(dp.week)}`, x + Wd - 10, y + 8, 'dim', { align: 'right' });
    let cy = y + 8 + g.lh + 6;
    let tx = x + 10;
    for (const [id, lab] of [['week', W.thisWeek], ['ever', W.bestEver]]) {
      const w = g.textW(lab) + 14;
      btn(ctx, regions, tx, cy - 2, w, g.lh + 6, lab, S.tab === id ? 'ember' : 'slate', () => { S.tab = id; });
      tx += w + 6;
    }
    const wm = modsFor(dp.mods, 99).map((m) => m.name).join(', ');
    g.text(ctx, g.clip(wm, x + Wd - 10 - tx - 8), x + Wd - 10, cy + 1, 'gray', { align: 'right' });
    cy += g.lh + 8;
    const iw = Wd - 20;
    [W.place, W.best, W.time, W.who].forEach((s, i) => g.text(ctx, s, x + 10 + cols[i] * iw, cy, 'gray'));
    cy += g.lh + 2;
    g.rect(ctx, x + 10, cy - 2, iw, 1, 'rgba(249,215,122,0.35)');
    if (!rows.length) { g.text(ctx, W.none, x + 10, cy, 'dim'); cy += rowH; }
    for (const r of rows) {
      const dl = W.depth(r.depth);
      g.text(ctx, g.clip(W.placeShort[r.place] || r.place, cols[1] * iw - 6), x + 10, cy, 'cream');
      g.text(ctx, dl, x + 10 + cols[1] * iw, cy, r.me ? 'gold' : 'white');
      if (r.lit) { const lx = x + 10 + cols[1] * iw + g.textW(dl) + 5; g.rect(ctx, lx, cy + 3, 2, g.lh - 6, '#f3e2b0'); g.rect(ctx, lx, cy + 1, 2, 2, '#ffb347'); }
      g.text(ctx, mmss(r.secs), x + 10 + cols[2] * iw, cy, 'white');
      g.text(ctx, g.clip(r.who.join(', '), (1 - cols[3]) * iw), x + 10 + cols[3] * iw, cy, r.me ? 'gold' : 'white');
      cy += rowH;
    }
    cy += 4;
    if (note) { g.text(ctx, note, x + 10, cy, S.badLink && !S.linkFrom ? 'red' : 'green'); cy += g.lh + 4; }
    // the coffer strip
    g.window(ctx, x + 8, cy, iw + 4, g.lh * 2 + 6, 'thin', dp.coffer ? 'ember' : 'slate', 0.9);
    g.rect(ctx, x + 14, cy + 5, 14, 10, '#8a5a24'); g.rect(ctx, x + 14, cy + 5, 14, 3, '#c8902f'); g.rect(ctx, x + 20, cy + 8, 2, 3, '#f9d77a');
    g.text(ctx, dp.coffer ? W.cofferReady : W.coffer, x + 34, cy + 3, 'gold');
    g.text(ctx, g.clip(W.cofferLine(have, full, mondayText(dp.week + 1)), iw - 30), x + 34, cy + 3 + g.lh, 'white');
    if (dp.coffer) regions.push({ rect: { x: x + 8, y: cy, w: iw + 4, h: g.lh * 2 + 6 }, kind: 'button', label: 'depths:coffer', on: () => { S.coffer = true; S.board = false; } });
    const by = y + H - h - 8;
    const sw = g.textW(W.send) + 22, cw = g.textW(W.close) + 22;
    btn(ctx, regions, x + 10, by, sw, h, W.send, 'ember', () => shareBoard(hud, me));
    btn(ctx, regions, x + Wd - 10 - cw, by, cw, h, W.close, 'crimson', () => { S.board = false; S.linkFrom = null; S.badLink = false; });
    if (!touch) g.text(ctx, g.clip(W.foot, Wd - sw - cw - 40), x + 20 + sw, by + Math.round((h - g.lh) / 2) + 1, 'dim');
  }

  // ---------------------------------------------------------------- the coffer
  function coffer(ctx, L, regions, hud) {
    const cf = hud.depths.coffer, touch = !!L.touch, h = bh(L);
    const Wd = touch ? L.W - 12 : 560;
    const x = Math.round((L.W - Wd) / 2);
    const slotW = Math.floor((Wd - 20 - 16) / 3), slotH = g.lh * 4 + 12;
    const H = 8 + g.lh + 4 + g.lh + 8 + slotH + 8 + g.lh + 8 + h + 8;
    const mb = (L.menuBar || [])[0];
    const y = touch ? Math.max(mb ? mb.y + mb.h + 2 : 2, Math.round((L.H - H) / 2)) : Math.round((L.H - H) / 2) - 10;
    regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'window', id: 'depths_coffer' });
    g.window(ctx, x, y, Wd, H, 'std', 'blue', 0.97);
    g.text(ctx, W.coffer, x + 10, y + 8, 'gold');
    g.text(ctx, `Filled the week of ${mondayText(cf.week)}`, x + Wd - 10, y + 8, 'dim', { align: 'right' });
    g.text(ctx, W.cofferSub, x + 10, y + 8 + g.lh + 2, 'gray');
    const sy = y + 8 + g.lh * 2 + 10;
    if (!(cf.slots[S.sel] && cf.slots[S.sel].open)) S.sel = 0;
    cf.slots.forEach((s, i) => {
      const sx = x + 10 + i * (slotW + 8);
      const picked = s.open && S.sel === i;
      g.window(ctx, sx, sy, slotW, slotH, 'thin', s.open ? (picked ? 'ember' : 'blue') : 'slate', s.open ? 0.95 : 0.6);
      const rar = s.open ? (s.depth >= 8 ? 'epic' : s.depth >= 3 ? 'rare' : 'magic') : '';
      g.text(ctx, g.clip(s.open ? `${W.slotHead[i]}: ${W.depth(s.depth)}` : W.slotNeed(s.need, cf.runs | 0), slotW - 12), sx + 6, sy + 5, s.open ? 'gold' : 'dim');
      if (s.open) {
        g.text(ctx, g.clip(`One piece, ${rar}`, slotW - 12), sx + 6, sy + 5 + g.lh + 2, rar === 'epic' ? 'violet' : rar === 'rare' ? 'blue' : 'green');
        g.text(ctx, g.clip('rolled for your class', slotW - 12), sx + 6, sy + 5 + g.lh * 2 + 2, 'white');
        regions.push({ rect: { x: sx, y: sy, w: slotW, h: slotH }, kind: 'button', label: `depths:slot${i + 1}`, on: () => { S.sel = i; } });
      } else g.text(ctx, W.slotEmpty, sx + 6, sy + slotH - g.lh - 4, 'dim');
    });
    g.text(ctx, 'It waits for you. Only one coffer waits at a time.', x + 10, sy + slotH + 6, 'dim');
    const by = y + H - h - 8;
    const tw = g.textW(W.take) + 24, cw = g.textW(W.later) + 22;
    btn(ctx, regions, x + Wd - 10 - tw, by, tw, h, W.take, 'ember', () => { send({ t: 'coffer_take', slot: S.sel }); S.coffer = false; });
    btn(ctx, regions, x + Wd - 10 - tw - 6 - cw, by, cw, h, W.later, 'slate', () => { S.coffer = false; });
  }

  // a small button when the coffer is ready or a board link came (outside any place, nothing else open)
  function nudge(ctx, L, regions, hud) {
    const dp = hud.depths;
    const label = dp.coffer ? W.cofferReady : S.linkFrom ? W.cameByLink(S.linkFrom) : S.badLink ? W.badLink : null;
    if (!label) return;
    const h = bh(L), w = g.textW(label) + 20;
    const mb = (L.menuBar || [])[0];
    const x = Math.round((L.W - w) / 2), y = L.touch ? (mb ? mb.y + mb.h + 4 : 4) : 44;
    btn(ctx, regions, x, y, w, h, label, dp.coffer ? 'ember' : 'violet', () => { if (dp.coffer) S.coffer = true; else S.board = true; });
  }

  /** Draw. Returns true when a big card is up (the phone top bar and toasts step aside). */
  function draw(ctx, L, regions, hud, me, busy) {
    S.big = false;
    S.hud = hud; S.me = me;
    if (!hud || !me || !hud.depths) return false;
    const dp = hud.depths;
    if (dp.run && !(hud.delve && hud.delve.summary)) strip(ctx, L, dp.run);
    if (busy) return false;
    if (S.coffer && dp.coffer) { coffer(ctx, L, regions, hud); S.big = true; return true; }
    S.coffer = false;
    if (S.board) { board(ctx, L, regions, hud, me); S.big = true; return true; }
    if (!dp.run && !(hud.delve && (hud.delve.door || hud.delve.summary || hud.delve.call))) nudge(ctx, L, regions, hud);
    return false;
  }
  function escape() { if (S.coffer || S.board) { S.coffer = false; S.board = false; return true; } return false; }
  return { draw, covers: () => S.big, escape, S };
}

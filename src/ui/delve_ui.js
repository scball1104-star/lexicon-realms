// Delve flow, the HUD side (wave 10 dflow; Scott 2026-11-25 approved the brief D:/LQOnline/wave10/dflow/BRIEF.md). Drawn
// with the g.* calls so the skin and Text size apply. Reads the HUD block's `delve` and `group` parts (src/sim/delve.js,
// src/sim/party.js); sends delve_call / delve_come / delve_enter / delve_close / ready_start. Every word is a DRAFT for Scott
// (DELVE_WORDS and the lines below).
//
//   const DV = createDelveUI({ g, st, send, toast, act })
//   DV.draw(ctx, L, regions, hud, me, t)   hud: snap.hud[playerId]; me: the hero's snapshot entity
//   DV.covers(L)                          a card that wants the whole phone screen is up (ui.js hides the phone top bar and
//                                         holds toasts while it is: the overlaps the brief found)
//   addDoorRow(fn)                        round 2 (dtiers): one more row on the door card, fn(door, hud) -> { label, value,
//                                         color?, on? } | null, drawn in the reserved slot above the stop line
//   doorCard(door, party, bookmark) / summaryModel(sum, content)   pure models (node tests)
//   readBookmarks(store) / writeBookmark(store, place, b, day) / bookmarkFor(all, place, today)   the stopped-run bookmark
//
// The bookmark: when a party stops mid-run, the bosses it beat stay beaten for 7 days. It lives on this device
// (localStorage `lexicon_realms.delve`, v1), written as bosses fall, and Go in together sends it (delve_enter resume).
import { easternDay } from '../core/eastern_week.js';
import { journalRunLine, fallsText, secsText } from '../chronicle/journal.js';

export const BOOKMARK_KEY = 'lexicon_realms.delve';
export const BOOKMARK_DAYS = 7;
const DOOR_ROWS = [];
/** Round 2 (dtiers): add a row to the door card (the depth row). Returns a remove function. */
export function addDoorRow(fn) { DOOR_ROWS.push(fn); return () => { const i = DOOR_ROWS.indexOf(fn); if (i >= 0) DOOR_ROWS.splice(i, 1); }; }

export const DELVE_WORDS = {
  yourParty: 'Your party', levelHere: 'Level here', bosses: (n) => `${n} ${n === 1 ? 'boss' : 'bosses'}`,
  plays: (from, to) => `${from}, plays as ${to}`, raised: (from, to) => `${from}, raised to ${to}`, tooLow: (lvl, need) => `${lvl}, too low (needs ${need})`,
  scale: (n, x) => (n > 1 ? `Foes are set for ${n} heroes: health x${x}` : 'Foes are set for one hero'),
  minutes: (a, b) => `About ${a} to ${b} minutes for a party`,
  stop: (d) => `Stop when you like: the bosses you beat stay beaten for ${d} days.`,
  resume: (n, m) => `Pick up where you stopped: ${n} of ${m} bosses beaten`,
  call: 'Call the party', ready: 'Ready check', go: 'Go in together', notNow: 'Not now', notHere: 'not here', locked: (n) => `Opens at level ${n}`,
  callOffer: (name, place) => `${name} is at ${place}. Come now?`, come: 'Come', coming: (place) => `Coming to ${place}...`,
  callSent: (n) => (n ? `Called ${n} ${n === 1 ? 'friend' : 'friends'}.` : 'Everyone is here already, or busy.'),
  syncChip: (to, from) => `Playing as ${to} (your level ${from})`,
  seatShort: (name, left) => `${name}: seat kept ${left}`,
  cleared: (place) => `${place}, cleared`, time: 'Time', bossesStat: 'Bosses', falls: 'Falls', goldEach: 'Your gold', bossesHead: 'Bosses',
  moments: 'Best moments', found: 'What each friend found', nothing: 'Nothing this time (your luck builds)', watch: 'Watch',
  playedAs: (n) => `played as ${n}`, raisedTo: (n) => `raised to ${n}`, kept: "Kept in tonight's chronicle.", done: 'Done',
  noReplay: 'That fight was not kept on this device.', more: (n) => `and ${n} more`, illum: ' (Illuminated)', tally: (n, sure) => (sure ? `Tally ${n} of ${sure}` : `Tally ${n}`), resumedNote: (n) => `${n} beaten last time`,   // illum, tally: wave 10 integrate (drafts)
  falls_: (place, secs) => `${place} in ${secs}`,
};
const W = DELVE_WORDS;
export const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const CLS = { warden: 'Warden', mender: 'Mender', scribe: 'Scribe', wayfinder: 'Wayfinder', inkblade: 'Inkblade' };

/** The door card's rows: each hero's level here. door: hud.delve.door; party: [{ id, name, level, cls, me?, far?, sync? }]. */
export function doorCard(door, party, bookmark) {
  const [lo, hi] = door.levels, up = door.upMax ?? 3;
  const rows = party.map((h) => {
    const own = h.sync ? h.sync.from : h.level;
    let kind = 'none', line = String(own);
    if (door.minLevel && own < door.minLevel) { kind = 'too_low'; line = W.locked(door.minLevel); }
    else if (own > hi) { kind = 'down'; line = W.plays(own, hi); }
    else if (own < lo && lo - own <= up) { kind = 'up'; line = W.raised(own, lo); }
    else if (own < lo) { kind = 'too_low'; line = W.tooLow(own, lo - up); }
    return { ...h, own, kind, line, here: (door.here || []).includes(h.id) };
  });
  const n = Math.min(4, Math.max(1, party.length));
  return { rows, scaleLine: W.scale(n, (1 + 0.6 * (n - 1)).toFixed(1)), minutesLine: door.minutes ? W.minutes(door.minutes[0], door.minutes[1]) : '',
    stopLine: W.stop(BOOKMARK_DAYS), resume: bookmark && bookmark.down.length ? { down: bookmark.down, line: W.resume(bookmark.down.length, door.bosses) } : null };
}

/** The run summary, ready to draw: words from the HUD block's summary (src/sim/delve.js hudOf). */
const LOOT_RANK = { common: 0, magic: 1, rare: 2, epic: 3, set: 4, legendary: 5 };   // wave 10 integrate
export function summaryModel(sum, content, meId = null) {
  const items = content.items || {}, mobs = content.mobs || {};
  const bossName = (t) => (mobs[t] || {}).name || ((sum.bosses || []).find((b) => b.template === t) || {}).name || t;
  const moments = [];
  for (const m of sum.moments || []) {
    if (m.kind === 'legendary') moments.push({ w: 90, text: `${m.heroName} found ${(items[m.item] || {}).name || m.item}` });
    else if (m.kind === 'boss') moments.push({ w: 80, text: `${bossName(m.template)} falls${m.secs ? ` in ${mmss(m.secs)}` : ''}`, bossId: m.id });
    else if (m.kind === 'rez') moments.push({ w: 35, text: `${m.byName} woke ${m.heroName} mid-fight` });
  }
  moments.sort((a, b) => b.w - a.w);
  const mine = (sum.heroes || []).find((h) => h.id === meId);
  return {
    title: W.cleared(sum.name), time: mmss(sum.secs), bossCount: `${(sum.bosses || []).length}${sum.resumed ? ` + ${sum.resumed}` : ''} of ${sum.of}`, falls: sum.falls | 0,
    gold: mine ? mine.gold || 0 : 0,
    bosses: (sum.bosses || []).map((b) => ({ name: b.name, time: b.secs ? mmss(b.secs) : '' })),
    moments: moments.slice(0, 3),
    // wave 10 integrate: dloot's pieces (Illuminated marked) and the Tally ride the hero's note
    heroes: (sum.heroes || []).map((h) => ({ name: h.name,
      note: [h.sync ? (h.sync.kind === 'down' ? W.playedAs(h.sync.to) : W.raisedTo(h.sync.to)) : '', h.tally ? W.tally(h.tally.n, h.tally.sure) : ''].filter(Boolean).join(', '),
      loot: [...(h.loot || [])].sort((a, b) => (b.illum ? 9 : LOOT_RANK[b.rarity] || 0) - (a.illum ? 9 : LOOT_RANK[a.rarity] || 0))   // the best first (a phone may show one line)
        .map((l) => ({ name: `${l.name || (items[l.item] || {}).name || l.item}${l.illum ? W.illum : ''}`, rarity: l.illum ? 'illum' : l.rarity })) })),
    chronicle: journalRunLine({ party: (sum.heroes || []).map((h) => h.name).join(', '), place: sum.name, secs: secsText(Math.max(1, sum.secs | 0)), falls: fallsText(sum.falls | 0) }),
  };
}

// ---------------------------------------------------------------- the bookmark (this device)
export function readBookmarks(store) {
  try { const o = JSON.parse(store.getItem(BOOKMARK_KEY) || 'null'); return o && o.v === 1 && o.runs && typeof o.runs === 'object' ? o : { v: 1, runs: {} }; } catch { return { v: 1, runs: {} }; }
}
export function writeBookmark(store, place, b, day) {
  const all = readBookmarks(store);
  if (!b) delete all.runs[place];
  else all.runs[place] = { down: [...b.down], heroes: [...(b.heroes || [])], day };
  try { store.setItem(BOOKMARK_KEY, JSON.stringify(all)); } catch { /* private window: no bookmark */ }
  return all;
}
export function bookmarkFor(all, place, today) {
  const b = all && all.runs && all.runs[place];
  if (!b || !Array.isArray(b.down) || !b.down.length || today - (b.day | 0) > BOOKMARK_DAYS) return null;
  return b;
}

// ---------------------------------------------------------------- drawing
const RAR = { epic: 'violet', rare: 'blue', legendary: 'orange', magic: 'green', set: 'green', illum: 'gold' };   // illum: wave 10 integrate

export function createDelveUI({ g, st, send, toast, act, storage = globalThis.localStorage }) {
  const S = { notNow: null, lastMark: '', big: false };
  const store = storage || { getItem: () => null, setItem: () => {} };
  const bh = (L) => Math.max(g.ls(15), L.touch ? L.minHit || 0 : 0);
  const btn = (ctx, regions, x, y, w, h, label, scheme, on) => {
    g.window(ctx, x, y, w, h, 'thin', scheme, 0.95);
    g.text(ctx, g.clip(label, w - 6), x + w / 2, y + Math.round((h - g.lh) / 2) + 1, on ? 'cream' : 'dim', { align: 'center' });
    if (on) regions.push({ rect: { x, y, w, h }, kind: 'button', label: `delve:${label}`, on });
  };
  const row = (ctx, regions, list, x, y, w, h) => {
    const gap = 4, n = list.length, bw = Math.floor((w - gap * (n - 1)) / n);
    list.forEach(([lab, sch, on], i) => btn(ctx, regions, x + i * (bw + gap), y, bw, h, lab, sch, on));
  };

  // ---- the bookmark follows the run (written as bosses fall, cleared when the last one falls)
  function keepBookmark(hud) {
    const r = hud && hud.delve && hud.delve.run;
    if (!r) return;
    const mark = `${r.place}:${r.done ? 'done' : r.down.join(',')}`;
    if (mark === S.lastMark) return;
    S.lastMark = mark;
    if (r.done) writeBookmark(store, r.place, null, 0);
    else if (r.down.length) writeBookmark(store, r.place, { down: r.down, heroes: [] }, easternDay(Date.now()));
  }

  function doorPanel(ctx, L, regions, hud, me) {
    const D = hud.delve.door, touch = !!L.touch, h = bh(L);
    const party = [{ id: me.id, name: me.name, level: me.level, cls: me.cls, me: true, ...(hud.delve.sync ? { sync: hud.delve.sync } : {}) },
      ...((hud.group && hud.group.party) || []).map((p) => ({ id: p.id, name: p.name || '?', level: p.level, cls: p.cls, far: p.far, sync: p.sync }))];
    const bm = bookmarkFor(readBookmarks(store), D.id, easternDay(Date.now()));
    const card = doorCard(D, party, bm);
    const extra = DOOR_ROWS.map((fn) => { try { return fn(D, hud); } catch { return null; } }).filter(Boolean);
    const Wd = touch ? Math.min(L.W - 16, 400) : g.big ? 300 : 236;
    const x = touch ? Math.round((L.W - Wd) / 2) : L.W - Wd - 8;
    const inner = Wd - 16;
    const flav = touch ? [] : g.wrap(D.flavour || '', inner);
    const stop = g.wrap(card.resume ? card.resume.line : card.stopLine, inner);
    const rowH = g.lh + 3;
    const inParty = party.length > 1;
    const H = 6 + g.lh + 2 + g.lh + 4 + (flav.length ? flav.length * g.lh + 6 : 0) + g.lh + 2 + card.rows.length * rowH + 4 + g.lh + 2 + (card.minutesLine ? g.lh + 2 : 0)
      + extra.reduce((n, r) => n + (r.buttons ? Math.max(g.lh + 2, h + 2) : g.lh + 2), 0) + stop.length * g.lh + 8 + (inParty ? h + 4 : 0) + h + 8;   // wave 10 dtiers: rows with buttons are taller
    const y = touch ? Math.max(2, Math.round((L.H - H) / 2)) : Math.max(30, Math.round((L.H - H) / 2) - 10);
    regions.push({ rect: { x, y, w: Wd, h: H }, kind: 'window', id: 'delve_door' });
    g.window(ctx, x, y, Wd, H, 'std', 'blue', 0.96);
    let cy = y + 6;
    g.text(ctx, g.clip(D.name, inner, true), x + 8, cy, 'gold', { large: true }); cy += g.lh + 2;
    g.text(ctx, D.label, x + 8, cy, 'gray'); g.text(ctx, W.bosses(D.bosses), x + Wd - 8, cy, 'gray', { align: 'right' }); cy += g.lh + 4;
    if (flav.length) { for (const s of flav) { g.text(ctx, s, x + 8, cy, 'dim'); cy += g.lh; } cy += 6; }
    g.text(ctx, W.yourParty, x + 8, cy, 'gold'); g.text(ctx, W.levelHere, x + Wd - 8, cy, 'gray', { align: 'right' }); cy += g.lh + 2;
    const clsX = x + 10 + Math.min(g.textW('Cassandra') + 4, Math.floor(inner * 0.3));
    for (const r of card.rows) {
      g.rect(ctx, x + 6, cy - 1, Wd - 12, rowH - 1, 'rgba(255,255,255,0.05)');
      g.text(ctx, g.clip(r.name, clsX - x - 14), x + 10, cy, r.here ? 'white' : 'dim');
      g.text(ctx, CLS[r.cls] || '', clsX, cy, 'gray');
      const col = r.kind === 'down' ? 'orange' : r.kind === 'up' ? 'green' : r.kind === 'too_low' ? 'red' : 'white';
      g.text(ctx, r.line, x + Wd - 10, cy, col, { align: 'right' });
      if (!r.here) g.text(ctx, W.notHere, x + Wd - 10 - g.textW(r.line) - 8, cy, 'dim', { align: 'right' });
      cy += rowH;
    }
    cy += 4;
    g.text(ctx, card.scaleLine, x + 8, cy, 'cream'); cy += g.lh + 2;
    if (card.minutesLine) { g.text(ctx, card.minutesLine, x + 8, cy, 'cream'); cy += g.lh + 2; }
    // the reserved slot: round 2's depth row (dtiers, addDoorRow) and any later row goes here, above the stop line
    for (const r of extra) {
      // wave 10 dtiers: a row may carry buttons ([label, fn, scheme?]) on its right, at the layout's hit size
      const rh = r.buttons ? Math.max(g.lh + 2, h + 2) : g.lh + 2, ty = cy + Math.round((rh - 2 - g.lh) / 2);
      let bx = x + Wd - 8;
      for (const [lab, fn, sch] of [...(r.buttons || [])].reverse()) { const bw = Math.max(h, g.textW(lab) + 12); bx -= bw; btn(ctx, regions, bx, cy, bw, h, lab, sch || 'slate', fn); bx -= 4; }
      g.text(ctx, r.label, x + 8, ty, 'cream'); if (r.value) g.text(ctx, g.clip(r.value, bx - x - 16 - g.textW(r.label)), bx - 4, ty, r.color || 'gold', { align: 'right' });
      cy += rh;
    }
    for (const s of stop) { g.text(ctx, s, x + 8, cy, card.resume ? 'green' : 'dim'); cy += g.lh; }
    cy += 8;
    const notNow = () => { S.notNow = D.id; };
    if (inParty) { row(ctx, regions, [[W.call, 'violet', () => send({ t: 'delve_call', door: D.id })], [W.ready, 'slate', () => send({ t: 'ready_start' })]], x + 8, cy, inner, h); cy += h + 4; }
    const me0 = card.rows[0];
    const canGo = !(D.minLevel && me0.own < D.minLevel);
    row(ctx, regions, [[W.go, 'ember', canGo ? () => send({ t: 'delve_enter', door: D.id, ...(card.resume ? { resume: card.resume.down } : {}) }) : null], [W.notNow, 'slate', notNow]], x + 8, cy, inner, h);
    return true;
  }

  function callPanel(ctx, L, regions, c) {
    const h = bh(L), text = W.callOffer(c.fromName, c.place);
    const w = Math.min(L.W - 16, Math.max(200, g.textW(text) + 20));
    const x = Math.round((L.W - w) / 2), y = L.touch ? Math.round(L.H * 0.24) : 120;
    const H = 6 + g.lh + 4 + g.lh + 6 + h + 8;
    regions.push({ rect: { x, y, w, h: H }, kind: 'window', id: 'delve_call' });
    g.window(ctx, x, y, w, H, 'std', 'violet', 0.96);
    g.text(ctx, text, x + w / 2, y + 6, 'gold', { align: 'center' });
    g.text(ctx, `${Math.ceil(c.left)} s`, x + w / 2, y + 6 + g.lh + 4, 'gray', { align: 'center' });
    row(ctx, regions, [[W.come, 'forest', () => send({ t: 'delve_come', yes: true })], [W.notNow, 'slate', () => send({ t: 'delve_come', yes: false })]], x + 8, y + 6 + 2 * g.lh + 10, w - 16, h);
  }

  function comeBar(ctx, L, c) {
    const w = 160, x = Math.round((L.W - w) / 2), y = L.touch ? Math.round(L.H * 0.62) : L.H - 96;
    g.window(ctx, x, y, w, g.lh + 12, 'thin', 'slate', 0.95);
    g.rect(ctx, x + 3, y + g.lh + 6, Math.round((w - 6) * c.frac), 3, '#c09ae8');
    g.text(ctx, g.clip(W.coming(c.place), w - 8), x + w / 2, y + 3, 'cream', { align: 'center' });
  }

  function chip(ctx, L, s, seats) {
    const lines = [];
    if (s) lines.push([W.syncChip(s.to, s.from), s.kind === 'down' ? 'orange' : 'green']);
    for (const st0 of seats || []) lines.push([W.seatShort(st0.name, mmss(st0.left)), 'orange']);
    if (!lines.length) return;
    const pf = L.player || { x: 4, y: 4, w: 150, h: 34 };
    const x = L.touch ? pf.x : pf.x + pf.w + 6, y0 = L.touch ? pf.y + pf.h + 2 : pf.y + 2;
    lines.forEach(([t, col], i) => {
      const w = g.textW(t, false) + 8, y = y0 + i * (g.lh + 3);
      g.scrim(ctx, x, y, w, g.lh + 2, 150);
      g.text(ctx, t, x + 4, y + 1, col, { small: true });
    });
  }

  function summaryPanel(ctx, L, regions, sum, content, meId) {
    const R = summaryModel(sum, content, meId), touch = !!L.touch, h = bh(L);
    const Wd = touch ? L.W - 12 : g.big ? 420 : 340;
    const x = Math.round((L.W - Wd) / 2);
    const colW = Math.floor((Wd - 24) / 2);
    const header = 6 + g.lh + 2 + g.lh + 10;
    const leftCol = g.lh + 2 + R.bosses.length * (g.lh + 1) + 6 + g.lh + 2 + R.moments.length * (g.lh + 4);
    const foot = g.lh + 4;
    // loot lines per friend: as many as fit the screen (a phone shows fewer, then "and n more")
    const linesFor = (cap) => R.heroes.reduce((n, hh) => n + Math.max(1, Math.min(hh.loot.length, cap) + (hh.loot.length > cap ? 1 : 0)), 0);
    const heightFor = (cap) => { const rightCol = g.lh + 2 + R.heroes.length * (g.lh + 1) + linesFor(cap) * (g.lh + 1);
      return touch ? header + Math.max(leftCol, rightCol) + 4 + foot + h + 6 : header + leftCol + 4 + rightCol + 6 + foot + h + 6; };
    let cap = 6;
    while (cap > 1 && heightFor(cap) > L.H - 4) cap--;
    const H = heightFor(cap);
    const y = touch ? Math.max(2, Math.round((L.H - H) / 2)) : Math.max(8, Math.round((L.H - H) / 2));
    regions.push({ rect: { x, y, w: Wd, h: H }, kind: 'window', id: 'delve_summary' });
    g.window(ctx, x, y, Wd, H, 'std', 'blue', 0.97);
    let cy = y + 6;
    g.text(ctx, g.clip(R.title, Wd - 12, true), x + Wd / 2, cy, 'gold', { large: true, align: 'center' }); cy += g.lh + 4;
    const stats = [[W.time, R.time], [W.bossesStat, R.bossCount], [W.falls, R.falls], [W.goldEach, R.gold]];
    const sw = Math.floor((Wd - 16) / stats.length);
    stats.forEach(([k, v], i) => {
      const sx = x + 8 + i * sw;
      g.window(ctx, sx + 2, cy, sw - 4, g.lh + 6, 'thin', 'slate', 0.8);
      const label = `${k} ${v}`;
      g.text(ctx, g.clip(label, sw - 10), sx + sw / 2, cy + 3, 'white', { align: 'center' });
    });
    cy += g.lh + 10;
    const top = cy;
    const lx = x + 8, lw = touch ? colW : Wd - 16;
    g.text(ctx, W.bossesHead, lx, cy, 'gold'); cy += g.lh + 2;
    for (const b of R.bosses) { g.text(ctx, g.clip(b.name, lw - 40), lx + 4, cy, 'white'); g.text(ctx, b.time, lx + lw - 4, cy, 'gray', { align: 'right' }); cy += g.lh + 1; }
    cy += 6;
    g.text(ctx, W.moments, lx, cy, 'gold'); cy += g.lh + 2;
    for (const mo of R.moments) {
      const ww = g.textW(W.watch) + 10;
      g.text(ctx, g.clip(mo.text, lw - ww - 10), lx + 4, cy + 1, 'cream');
      if (mo.bossId != null) btn(ctx, regions, lx + lw - ww, cy - 1, ww, g.lh + 3, W.watch, 'violet', () => { Promise.resolve(act.watchFight ? act.watchFight(mo.bossId) : false).then((ok) => { if (!ok) toast(W.noReplay); }); });
      cy += g.lh + 4;
    }
    let ry = touch ? top : cy + 4;
    const rx = touch ? x + 16 + colW : x + 8, rw = touch ? colW : Wd - 16;
    g.text(ctx, W.found, rx, ry, 'gold'); ry += g.lh + 2;
    for (const hh of R.heroes) {
      g.text(ctx, hh.name, rx + 4, ry, 'white'); if (hh.note) g.text(ctx, hh.note, rx + rw - 4, ry, 'gray', { align: 'right' }); ry += g.lh + 1;
      if (!hh.loot.length) { g.text(ctx, g.clip(W.nothing, rw - 16), rx + 12, ry, 'dim'); ry += g.lh + 1; }
      for (const it of hh.loot.slice(0, cap)) { g.text(ctx, g.clip(it.name, rw - 16), rx + 12, ry, RAR[it.rarity] || 'white'); ry += g.lh + 1; }
      if (hh.loot.length > cap) { g.text(ctx, W.more(hh.loot.length - cap), rx + 12, ry, 'dim'); ry += g.lh + 1; }
    }
    const fy = y + H - h - 6 - foot;
    g.text(ctx, W.kept, x + Wd / 2, fy, 'dim', { align: 'center' });
    row(ctx, regions, [[W.done, 'slate', () => send({ t: 'delve_close' })]], x + Wd / 2 - 60, y + H - h - 6, 120, h);
  }

  /** Draw the delve parts. Returns true when a big card is up (the phone top bar and toasts step aside). */
  // hold (wave 10 integrate): { summary: dloot's banner or drop card is up (the summary waits), chip: false while a target or
  // boss frame or the drop card sits where the chip would }
  function draw(ctx, L, regions, hud, me, content, busy, hold = {}) {
    S.big = false;
    if (!hud || !me) return false;
    keepBookmark(hud);
    const dv = hud.delve || {};
    const grp = hud.group || null;
    if (!dv.door) S.notNow = null;
    if (dv.summary && !hold.summary) { summaryPanel(ctx, L, regions, dv.summary, content, me.id); S.big = true; return true; }
    if (hold.chip !== false) chip(ctx, L, dv.sync, grp && !grp.ready ? grp.seats : null);
    if (dv.come) comeBar(ctx, L, dv.come);
    if (busy) return false;
    if (dv.call) { callPanel(ctx, L, regions, dv.call); return false; }
    if (dv.door && S.notNow !== dv.door.id && !(grp && grp.ready)) { doorPanel(ctx, L, regions, hud, me); S.big = !!L.touch; return S.big; }
    return false;
  }
  return { draw, covers: () => S.big, S };
}

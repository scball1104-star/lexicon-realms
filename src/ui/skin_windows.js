// The Lantern and Vellum windows (wave 6 uiskin, src/ui/skin.js): the quest log and the character sheet redrawn so each
// uses its whole frame. Same window rects as Classic at Normal text (layout.js menuRect), so the phone's 640x360 window
// layer and the bags beside the sheet still fit; with Large text (gfx.js g.big) both grow to use the 640x360 design. Same
// hit regions (kinds, labels, actions) as menus.js, so the controller and the qa drivers work unchanged.
import { menuRect } from './layout.js';
import { itemInfo, RARITY_COLOR, RARITY_NAME, statsAt, classInfo, abilityInfo, abilityTooltip, liveStats, npcInfo, questInfo, allQuests } from './gamedata.js';
import { itemTooltip, itemCard } from './menus.js';
import { scrollLines } from './textscroll.js';

const SLOT_ICON = { head: 'icon_helm', chest: 'icon_armor', legs: 'icon_mantle', feet: 'icon_boots', main: 'icon_sword', off: 'icon_shield', hands: 'icon_charm', trinket: 'icon_star' };
const SLOT_NAME = { head: 'Head', chest: 'Chest', legs: 'Legs', feet: 'Feet', main: 'Main hand', off: 'Off hand', hands: 'Hands', trinket: 'Trinket' };
const GEAR_LEFT = ['head', 'chest', 'legs', 'feet'], GEAR_RIGHT = ['main', 'off', 'hands', 'trinket'];
// The story a quest is a step of, for the line above the rewards. A story chain's own name first (src/data/story_chains.js
// tags each step `story: { name, step, of }`), else the quest's `chain`. DRAFT wording (Scott to approve):
// "<story>, step <n> of <m>", and "The <area> story" for a chain with no story name.
const CHAIN_NAME = { valley: 'The valley story', downs: 'The Downs story', moor: 'The Moor story' };
export function questChain(id) {
  const q = questInfo(id);
  if (!q) return null;
  if (q.story && q.story.name && q.story.of) return { name: q.story.name, step: q.story.step, of: q.story.of };
  if (!q.chain) return null;
  const of = Object.values(allQuests()).filter((o) => o.chain && o.chain.id === q.chain.id).length;
  const area = String(q.chain.id).replace(/_/g, ' ');
  return { name: CHAIN_NAME[q.chain.id] || `The ${area[0].toUpperCase()}${area.slice(1)} story`, step: q.chain.step, of };
}
const samePick = (pk, kind, key, it) => pk && pk.kind === kind && pk.key === key && pk.id === (it && (it.uid != null ? it.uid : it.item));

/** The skinned window frame: panel, a header band with the title, a count on the right, the close button. */
function skinFrame(ctx, env, r, title, regions, act, id, sk, right = null) {
  const { g } = env;
  g.window(ctx, r.x, r.y, r.w, r.h, 'std', 'blue', 0.97);
  regions.push({ rect: r, kind: 'window', id });
  // header band: a darker strip under the bronze, ruled in gilt
  g.rect(ctx, r.x + 4, r.y + 4, r.w - 8, 17, 'rgba(7,6,13,0.45)');
  g.rect(ctx, r.x + 6, r.y + 21, r.w - 12, 1, 'rgba(249,215,122,0.45)');
  lozenge(ctx, g, r.x + 10, r.y + 12);
  g.text(ctx, title, r.x + 18, r.y + 4, 'gold', { large: true });
  if (right) g.text(ctx, right, r.x + r.w - 26, r.y + 8, 'gray', { align: 'right' });
  const s = Math.max(16, env.L.minHit || 0);
  const cr = { x: r.x + r.w - 4 - s, y: r.y + 3, w: s, h: env.L.touch ? s : Math.min(s, 22) };
  g.window(ctx, r.x + r.w - 20, r.y + 6, 14, 14, 'thin', 'crimson', 0.97);
  g.text(ctx, 'x', r.x + r.w - 13, r.y + 6, 'cream', { align: 'center' });
  regions.push({ rect: cr, kind: 'button', on: () => act.close(id), tip: { title: 'Close', sub: 'Esc' } });
}

function button(ctx, env, regions, x, y, w, h, label, tone, color, on, sk, extra = {}) {
  const { g } = env;
  g.window(ctx, x, y, w, h, 'thin', tone, 0.97);
  const big = g.big && h >= 18;
  g.text(ctx, label, x + Math.floor(w / 2), y + Math.floor((h - (big ? 16 : 11)) / 2), color, { align: 'center', large: big });
  regions.push({ rect: { x, y, w, h }, kind: 'button', on, label, ...extra });
}

/** A 5 px gilt lozenge centred on (cx, cy). */
function lozenge(ctx, g, cx, cy) {
  g.rect(ctx, cx - 2, cy, 5, 1, '#07060d'); g.rect(ctx, cx, cy - 2, 1, 5, '#07060d');
  g.rect(ctx, cx - 1, cy - 1, 3, 3, '#f9d77a'); g.rect(ctx, cx, cy, 1, 1, '#fff4c8');
  g.rect(ctx, cx - 3, cy, 1, 1, '#a87b3c'); g.rect(ctx, cx + 3, cy, 1, 1, '#a87b3c');
}

/** A ruled flourish across a page: a line with a lozenge in the middle. */
function flourish(ctx, g, x, y, w, col) {
  const m = x + Math.floor(w / 2);
  g.rect(ctx, x, y, m - x - 4, 1, col); g.rect(ctx, m + 5, y, x + w - m - 5, 1, col);
  g.rect(ctx, m, y - 2, 1, 5, col); g.rect(ctx, m - 1, y - 1, 3, 3, col); g.rect(ctx, m - 2, y, 5, 1, col);
}

/** Wrap with the first `nNarrow` lines at `narrow` px and the rest at `wide` (text flowing round a drop cap). */
function wrapAround(g, text, narrow, wide, nNarrow, big) {
  const words = text.split(/\s+/).filter(Boolean);
  const first = g.wrap(words.join(' '), narrow, big).slice(0, nNarrow);
  const used = first.join(' ').split(/\s+/).filter(Boolean).length;
  return [...first, ...(used < words.length ? g.wrap(words.slice(used).join(' '), wide, big) : [])];
}

// a 2x drop cap from the title font, drawn through a small canvas so it stays whole pixels
let capCanvas = null;
function dropCap(ctx, g, sk, ch, x, y, box) {
  g.window(ctx, x, y, box, box, 'thin', 'violet', 1);
  g.rect(ctx, x + 2, y + 2, box - 4, 1, 'rgba(249,215,122,0.6)');
  if (!capCanvas) { capCanvas = document.createElement('canvas'); capCanvas.width = 24; capCanvas.height = 20; }
  const c2 = capCanvas.getContext('2d');
  c2.clearRect(0, 0, 24, 20);
  const w = g.large.draw(c2, ch, 12, 1, { color: 'gold', align: 'center', shadow: true }).width;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(capCanvas, 0, 0, 24, 18, x + Math.floor((box - 48) / 2) + 1, y + Math.floor((box - 30) / 2) - 1, 48, 36);
  ctx.imageSmoothingEnabled = prev;
  return w;
}

// ---------------------------------------------------------------- quest log

export function drawQuestLogSkin(ctx, env, m, st, regions, act, sk) {
  const { g, L } = env;
  const big = g.big, lh = g.lh;
  // large text: the log takes most of the 640x360 design so names and text still fit
  // (on a phone it starts under the menu buttons, as today's log does)
  const r = big ? (L.touch ? { x: 8, y: 30, w: 624, h: 326 } : { x: 8, y: 6, w: 624, h: 348 }) : menuRect('quests');
  const qs = m.quests;
  skinFrame(ctx, env, r, 'Quest Log', regions, act, 'quests', sk, `${qs.length}/20`);
  const lx = r.x + 8, lw = big ? 214 : 168, ly = r.y + 25, lhgt = r.h - 25 - 8;
  g.window(ctx, lx, ly, lw, lhgt, 'thin', 'blue', 0.6);
  const bh = Math.max(big ? 20 : 16, L.minHit || 0);
  const px = lx + lw + 6, pw = r.x + r.w - 8 - px, py = ly, ph = r.h - 25 - 8 - bh - 4;
  sk.page(ctx, px, py, pw, ph);
  if (!qs.length) {
    const cy = py + Math.floor(ph / 2) - 20;
    sk.ink(ctx, 'Your log is empty.', px + pw / 2, cy, sk.C.inkText, { big: true, align: 'center' });
    for (const [k, ln] of g.wrap('Look for a gold ! over a head. Quests you take are written here, with what to do and what you earn.', pw - 40, big).entries()) sk.ink(ctx, ln, px + pw / 2, cy + 22 + k * lh, sk.C.sepia, { big, align: 'center' });
    return;
  }
  if (!st.questSel || !qs.find((q) => q.id === st.questSel)) st.questSel = (m.selectedQuest && qs.find((q) => q.id === m.selectedQuest)) ? m.selectedQuest : qs[0].id;

  // ---- the ledger: quests grouped under their zone
  const rowH = Math.max(big ? 17 : 14, L.minHit || 0), headH = big ? 17 : 13;
  const items = [];
  let lastZone = null;
  for (const q of qs) { if (q.zoneName !== lastZone) { items.push({ head: q.zoneName || 'Elsewhere' }); lastZone = q.zoneName; } items.push({ q }); }
  const fits = (from) => { let h = 0, n = 0; for (let i = from; i < items.length; i++) { h += items[i].head ? headH : rowH; if (h > lhgt - 8) break; n++; } return n; };
  st.questScroll = Math.max(0, Math.min(Math.max(0, items.length - fits(0)), st.questScroll || 0));
  const vis = fits(st.questScroll);
  let y = ly + 4;
  for (const it of items.slice(st.questScroll, st.questScroll + vis)) {
    if (it.head) {
      const t = g.clip(it.head, lw - 16, big);
      const w = g.text(ctx, t, lx + 6, y + 1, 'gold', { large: big });
      g.rect(ctx, lx + 10 + w, y + Math.floor(headH / 2), lw - 18 - w, 1, 'rgba(249,215,122,0.35)');
      y += headH;
      continue;
    }
    const q = it.q, sel = q.id === st.questSel;
    if (sel) g.window(ctx, lx + 2, y, lw - 4, rowH, 'thin', 'ember', 0.92);
    const ty = y + Math.floor((rowH - lh) / 2) + (big ? 0 : 1);
    if (q.tracked !== false) g.rect(ctx, lx + 5, y + Math.floor(rowH / 2) - 1, 2, 3, sel ? '#fff4c8' : '#f9d77a');
    g.text(ctx, `${q.level || '?'}`, lx + 22, ty, sel ? 'cream' : 'dim', { align: 'right', large: big });
    const objs = q.objectives || [];
    const right = q.done ? '✓' : objs.length === 1 && objs[0].need > 1 ? `${objs[0].cur}/${objs[0].need}` : '';
    const rw = right ? g.textW(right, big) + 6 : 0;
    g.text(ctx, g.clip(q.name, lw - 34 - rw, big), lx + 27, ty, q.done ? 'green' : sel ? 'cream' : 'white', { large: big });
    if (right) g.text(ctx, right, lx + lw - 7, ty, q.done ? 'green' : sel ? 'cream' : 'gray', { align: 'right', large: big });
    regions.push({ rect: { x: lx, y, w: lw, h: rowH }, kind: 'quest_row', id: q.id, on: () => { st.confirm = null; act.selectQuest(q.id); } });
    y += rowH;
  }
  if (items.length <= vis && y < ly + lhgt - 30) {
    g.rect(ctx, lx + 8, ly + lhgt - 26, lw - 16, 1, 'rgba(249,215,122,0.25)');
    g.rect(ctx, lx + 8, ly + lhgt - 17, 2, 3, '#f9d77a');
    g.text(ctx, g.clip('on screen (tracked)', lw - 30, big), lx + 14, ly + lhgt - 20, 'dim', { large: big });
  }
  if (items.length > vis) {
    g.text(ctx, st.questScroll + vis < items.length ? 'more below' : 'top', lx + lw / 2, ly + lhgt - 12, 'dim', { align: 'center' });
    regions.push({ rect: { x: lx, y: ly, w: lw, h: lhgt }, kind: 'scroll', scroll: (d) => { st.questScroll += d; } });
  }

  // ---- the page
  const q = qs.find((o) => o.id === st.questSel);
  const C = sk.C, ix = px + 9, iw = pw - 18;
  y = py + 7;
  for (const ln of g.wrap(q.name, iw, true).slice(0, 2)) { sk.ink(ctx, ln, ix, y, C.inkText, { big: true }); y += 16; }
  const giver = q.giver ? npcInfo(q.giver) : null;
  const sub = [`Level ${q.level || '?'}`, q.zoneName || '', giver && giver.name ? `from ${giver.name}` : ''].filter(Boolean).join(', ');
  sk.ink(ctx, g.clip(sub, iw, big), ix, y, C.sepia, { big }); y += lh + 4;
  flourish(ctx, g, ix, y, iw, 'rgba(122,86,52,0.7)'); y += 6;

  // rewards tray (ink, so the quality colours read), pinned to the page bottom
  const rw = q.rewards || {};
  const rItems = [...(rw.items || []).map((it) => ({ it, choice: false })), ...(rw.choice || []).map((it) => ({ it, choice: true }))].slice(0, 6);
  const cellH = big ? 24 : 24, cols = 2;
  const trayH = 8 + lh + 4 + (rItems.length ? Math.ceil(rItems.length / cols) * (cellH + 2) : 0) + 2;
  const tx = px + 5, tw = pw - 10, ty = py + ph - 5 - trayH;
  g.window(ctx, tx, ty, tw, trayH, 'thin', 'blue', 0.97);
  let hx = tx + 7;
  hx += g.text(ctx, 'Rewards', hx, ty + 5, 'gold', { large: big }) + 8;
  if (rw.xp) hx += g.text(ctx, `${rw.xp.toLocaleString('en-US')} XP`, hx, ty + 5, 'violet', { large: big }) + 8;
  if (rw.gold) { g.icon(ctx, 'icon_gold', hx, ty + 5 + (big ? 3 : 0)); hx += 14; hx += g.text(ctx, `${rw.gold} gold`, hx, ty + 5, 'gold', { large: big }) + 8; }
  if ((rw.choice || []).length) g.text(ctx, 'choose one', tx + tw - 7, ty + 5, 'gray', { align: 'right', large: big });
  let cardTip = null;
  const cw = Math.floor((tw - 14) / cols);
  rItems.forEach(({ it, choice }, k) => {
    const i = itemInfo(it) || {};
    const cx = tx + 7 + (k % cols) * cw, cy = ty + 8 + lh + 4 + Math.floor(k / cols) * (cellH + 2);
    const sr = { x: cx, y: cy, w: 22, h: 22 };
    sk.itemSlot(ctx, env, sr, { ...i }, null, itemInfo);
    const col = RARITY_COLOR[i.rarity] || RARITY_COLOR.common;
    const nameW = cw - 30;
    if (big) g.text(ctx, g.clip(i.name || '', nameW, true), cx + 27, cy + 3, col, { large: true });
    else {
      g.text(ctx, g.clip(i.name || '', nameW), cx + 27, cy + 1, col);
      const kind = [RARITY_NAME[i.rarity] || 'Common', SLOT_NAME[i.slot] || (i.weaponType || '')].filter(Boolean).join(' ');
      g.text(ctx, g.clip(kind, nameW), cx + 27, cy + 12, 'dim');
    }
    const tip = itemTooltip(i, choice ? 'Choose one' : null);
    const on = L.touch ? () => { st.itemPick = samePick(st.itemPick, 'reward', `${q.id}:${k}`, { item: it }) ? null : { kind: 'reward', key: `${q.id}:${k}`, id: it }; } : undefined;
    if (L.touch && samePick(st.itemPick, 'reward', `${q.id}:${k}`, { item: it })) { g.outline(ctx, sr.x - 1, sr.y - 1, sr.x + sr.w, sr.y + sr.h, '#ffd34d'); cardTip = tip; }
    regions.push({ rect: { x: cx, y: cy, w: cw - 4, h: 22 }, kind: 'reward', tip: L.touch ? null : tip, ...(on ? { on } : {}) });
  });
  if (cardTip) itemCard(ctx, env, st, regions, cardTip, r.x + r.w + 6, r.y, null, null);

  // objectives, sitting on the ribbon
  const objs = q.objectives || [];
  const objLines = objs.map((o) => {
    const cnt = o.need > 1 ? `${o.cur}/${o.need}` : '';
    const lines = g.wrap(o.text, iw - 14 - (cnt ? g.textW(cnt, big) + 6 : 0), big).slice(0, 2);
    return { o, cnt, lines, h: lines.length * lh + (o.need > 1 ? 4 : 1) };
  });
  const where = [q.areaName && !q.done ? q.areaName : '', q.turnInName ? `hand in to ${q.turnInName}` : ''].filter(Boolean).join(', then ');
  const objH = lh + 2 + objLines.reduce((s, o) => s + o.h + 1, 0) + (where ? lh : 0);
  // the story ribbon above the tray: which chain and which step (pips), and who takes it in
  // (dropped when it would leave the story text less than two lines: large text on a phone)
  let chain = questChain(q.id);
  if (chain && ty - 5 - lh - 2 - 6 - objH - 4 - y < 2 * lh) chain = null;
  let ribbonTop = ty;
  if (chain) {
    ribbonTop = ty - 5 - lh - 2;
    const rx = ix, ry = ribbonTop;
    const label = `${chain.name}, step ${chain.step} of ${chain.of}`;
    const lw3 = sk.ink(ctx, label, rx, ry, C.sepia, { big });
    const pip = 6, gap = 3, n = chain.of;
    const pxs = Math.min(ix + iw - n * (pip + gap), rx + lw3 + 10);
    for (let k = 0; k < n; k++) {
      const cx = pxs + k * (pip + gap), cy = ry + Math.floor((lh - pip) / 2);
      g.rect(ctx, cx, cy, pip, pip, C.pageEdge);
      g.rect(ctx, cx + 1, cy + 1, pip - 2, pip - 2, k + 1 < chain.step ? '#7a5634' : k + 1 === chain.step ? '#c0782c' : C.page);
    }
  }

  let oy = ribbonTop - 6 - objH;

  // the quest's own words in the space between the title and the objectives: a drop cap when it all fits, else plain lines
  // that scroll (the wheel, or a finger drag on a phone) instead of being cut with "..."
  const desc = ((q.text && (q.done ? q.text.complete || q.text.progress : q.text.offer)) || q.desc || '').trim();
  const room = Math.floor((oy - 4 - y) / lh);
  if (desc && room >= 1) {
    const box = big ? 34 : 26, nN = Math.ceil((box + 2) / lh);
    const rest = desc.slice(1).replace(/^\s+/, '');
    const lines = wrapAround(g, rest.length && desc[1] === ' ' ? ` ${rest}` : rest, iw - box - 4, iw, nN, big);
    if (room >= nN && lines.length <= room) {
      dropCap(ctx, g, sk, desc[0], ix, y, box);
      lines.forEach((ln, k) => sk.ink(ctx, ln.trim(), k < nN ? ix + box + 4 : ix, y + k * lh, C.inkText, { big }));
    } else {
      const plain = g.wrap(desc, iw - 8, big);
      scrollLines(ctx, g, regions, st, `quest:${q.id}`, plain, { x: ix, y, w: iw, h: room * lh }, lh,
        (ln, x, yy) => sk.ink(ctx, ln, x, yy, C.inkText, { big }));
    }
  }
  sk.ink(ctx, 'Objectives', ix, oy, C.rubric, { big }); oy += lh + 2;
  for (const { o, cnt, lines, h } of objLines) {
    const done = o.cur >= o.need;
    g.rect(ctx, ix, oy + (big ? 4 : 2), 7, 7, C.inkText); g.rect(ctx, ix + 1, oy + (big ? 5 : 3), 5, 5, done ? '#cfe3a8' : C.page);
    if (done) { g.rect(ctx, ix + 2, oy + (big ? 7 : 5), 1, 2, '#2f6b2a'); g.rect(ctx, ix + 3, oy + (big ? 8 : 6), 1, 1, '#2f6b2a'); g.rect(ctx, ix + 4, oy + (big ? 5 : 3), 1, 4, '#2f6b2a'); }
    lines.forEach((ln, k) => sk.ink(ctx, ln, ix + 12, oy + k * lh, done ? '#2f6b2a' : C.inkText, { big }));
    if (cnt) sk.ink(ctx, cnt, ix + iw, oy, done ? '#2f6b2a' : C.sepia, { big, align: 'right' });
    if (o.need > 1) {
      const by2 = oy + lines.length * lh + 1, bw2 = iw - 12;
      g.rect(ctx, ix + 12, by2, bw2, 2, 'rgba(58,38,24,0.25)');
      g.rect(ctx, ix + 12, by2, Math.round(bw2 * Math.min(1, o.cur / o.need)), 2, done ? '#5f9a3a' : '#b0702c');
    }
    oy += h + 1;
  }
  if (where) sk.ink(ctx, g.clip(where[0].toUpperCase() + where.slice(1), iw, big), ix, oy, C.sepia, { big });

  // buttons under the page
  const by = r.y + r.h - 8 - bh;
  const confirm = st.confirm === `abandon:${q.id}`;
  let bx = r.x + r.w - 8;
  const btn = (label, tone, color, on, extra) => { const w = g.textW(label, big) + (big ? 22 : 18); bx -= w; button(ctx, env, regions, bx, by, w, bh, label, tone, color, on, sk, extra); bx -= 5; };
  btn(confirm ? 'Abandon? Again' : 'Abandon', 'crimson', confirm ? 'orange' : 'cream', () => { if (confirm) { st.confirm = null; act.abandonQuest(q.id); } else st.confirm = `abandon:${q.id}`; });
  btn(q.tracked === false ? 'Track' : 'Untrack', 'slate', 'cream', () => act.trackQuest(q.id, q.tracked === false));
  if (m.group && m.group.inParty && act.send) btn('Share', 'forest', 'cream', () => act.send({ t: 'quest_share', quest: q.id }), { label: 'quest_share' });
  btn('Show on map', 'ember', 'cream', () => act.showOnMap(q.id));
}

// ---------------------------------------------------------------- character sheet

const DOLL_BG = { c: null, key: '' };   // the Character window's 3D doll backdrop (one canvas, remade when the window moves)

export function drawCharacterSkin(ctx, env, m, st, regions, act, sk) {
  const { g, L, charArt } = env;
  const big = g.big, lh = g.lh;
  const p = m.player;
  const base = menuRect('character');
  const r = { x: base.x, y: base.y, w: 342, h: big ? 318 : 288 };   // the design corner (drv.js checks it); Large ends at y 358
  skinFrame(ctx, env, r, 'Character', regions, act, 'character', sk);
  const C = sk.C;
  // ---- who
  charArt.portrait(ctx, p.cls, p.look, r.x + 10, r.y + 26, 32, 32);
  g.text(ctx, p.name, r.x + 48, r.y + 25, 'white', { large: true });
  g.text(ctx, `Level ${p.level} ${p.clsName}`, r.x + 48, r.y + 42, 'gray', { large: big });
  const xpw = 120, gxp = r.x + r.w - 10 - xpw;
  if (p.xpToLevel) {
    g.text(ctx, `${Number(p.xp || 0).toLocaleString('en-US')} / ${Number(p.xpToLevel).toLocaleString('en-US')} XP`, gxp + xpw, r.y + 27, 'violet', { align: 'right' });
    g.gauge(ctx, gxp, r.y + 40, xpw, Math.min(1, (p.xp || 0) / p.xpToLevel), 'exp', true);
  }
  g.icon(ctx, 'icon_gold', gxp + xpw - g.textW(`${Number(m.gold).toLocaleString('en-US')} gold`, big) - 14, r.y + 49 + (big ? 3 : 0));
  g.text(ctx, `${Number(m.gold).toLocaleString('en-US')} gold`, gxp + xpw, r.y + 48, 'gold', { align: 'right', large: big });

  // ---- the doll: gear left and right of the hero, standing in lantern light
  const dx = r.x + 8, dy = r.y + 66, dw = 160, sz = 26, pitch = Math.max(big ? 38 : 40, L.minHit || 0);
  const dh = 4 + 4 * pitch + 2;
  const midX = dx + Math.floor(dw / 2), footY = dy + dh - 14;
  const nw = 74, nx = midX - nw / 2, ntop = dy + 10, nbot = footY + 6, rad = nw / 2;
  // the panel and an arched niche behind the hero, rimmed in bronze, with lantern light pooled on its floor
  const niche = (c) => {
    g.window(c, dx, dy, dw, dh, 'thin', 'blue', 0.95);
    for (let yy = ntop; yy < nbot; yy++) {
      const dyy = yy - (ntop + rad);
      const half = dyy >= 0 ? rad : Math.floor(Math.sqrt(Math.max(0, rad * rad - dyy * dyy)));
      if (half <= 0) continue;
      g.rect(c, midX - half - 1, yy, 1, 1, '#a87b3c'); g.rect(c, midX + half, yy, 1, 1, '#5e3f1c');
      const u = (yy - ntop) / (nbot - ntop);
      g.rect(c, midX - half, yy, half * 2, 1, `rgba(${Math.round(8 + 40 * u)},${Math.round(7 + 26 * u)},${Math.round(16 + 10 * u)},0.85)`);
    }
    g.rect(c, nx - 1, nbot, nw + 2, 1, '#a87b3c');
    // lantern light pooled round the feet: an ellipse, brightest in the middle
    for (let k = 0; k < 4; k++) {
      const rx = 34 - k * 8, ry = 7 - k * 1.5, a = 0.10 + k * 0.05;
      for (let yy = -Math.floor(ry); yy <= Math.floor(ry); yy++) {
        const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry))));
        if (hw > 0) g.rect(c, midX - hw, footY + 1 + yy, hw * 2, 1, `rgba(255,190,100,${a.toFixed(3)})`);
      }
    }
  };
  niche(ctx);
  // 3D graphics: the real hero (the creation screen's turntable, src/render3d/turntable.js) stands in the niche, wearing
  // what you wear; 2D: today's sprite at 2x. Scott 2026-11-25: "Character image not in the better quality".
  const me = env.me && env.has3d && env.has3d() && typeof document !== 'undefined' ? env.me : null;
  if (me && env.doll) {
    const tr = ctx.getTransform ? ctx.getTransform() : { e: 0, f: 0 };
    const LW = L.W || 640, LH = L.H || 360, ox = Math.round(tr.e), oy = Math.round(tr.f);
    // the backdrop the turntable draws behind the hero: the same panel and niche, at layer size (cached per place)
    const key = `${LW}x${LH}:${ox},${oy},${dx},${dy},${dh}:${g.skin ? g.skin.id : ''}`;
    if (!DOLL_BG.c || DOLL_BG.key !== key) {
      const c = document.createElement('canvas'); c.width = LW; c.height = LH;
      const b = c.getContext('2d'); b.imageSmoothingEnabled = false; b.translate(ox, oy); niche(b);
      DOLL_BG.c = c; DOLL_BG.key = key;
    }
    const rh = nbot - ntop + 1;
    env.doll({ mode: 'doll', inset: true, rect: { x: nx + ox, y: ntop + oy, w: nw, h: rh }, cls: p.cls, look: me.look || p.look || 0,
      app: me.app || null, equip: me.equip || {}, yaw: 0.45, bg: DOLL_BG.c, phone: !!L.touch });
    ctx.clearRect(nx, ntop, nw, rh);
  } else {
    // the hero at 2x, whole pixels
    try {
      const tmp = env.scratch ? env.scratch(40, 48) : null;
      if (tmp) {
        const c2 = tmp.getContext('2d');
        c2.clearRect(0, 0, 40, 48);
        charArt.draw(c2, p.cls, p.look, 'idle', 'down', 0, 20, 44);
        const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, 40, 48, midX - 40, footY - 88 + 4, 80, 96);
        ctx.imageSmoothingEnabled = prev;
      }
    } catch { /* the doll is decoration */ }
  }
  const gear = (list, x) => list.forEach((slot, i) => {
    const sr = { x, y: dy + 5 + i * pitch, w: sz, h: sz };
    const it = m.equip[slot];
    sk.itemSlot(ctx, env, sr, it, SLOT_ICON[slot], itemInfo);
    regions.push({ rect: { x: sr.x, y: sr.y, w: Math.max(sz, L.minHit || 0), h: pitch }, kind: 'equip', slot,
      tip: it ? itemTooltip(it, L.touch ? null : 'Right-click to take off') : { title: SLOT_NAME[slot], sub: 'Empty' },
      on: (btn) => {
        if (!L.touch) { if (it && btn === 2) act.unequip(slot); return; }
        if (!it) { st.itemPick = null; return; }
        if (samePick(st.itemPick, 'equip', slot, it)) { st.itemPick = null; act.unequip(slot); return; }
        st.itemPick = { kind: 'equip', key: slot, id: it.uid != null ? it.uid : it.item };
      } });
    if (it && L.touch && samePick(st.itemPick, 'equip', slot, it)) g.outline(ctx, sr.x - 1, sr.y - 1, sr.x + sr.w, sr.y + sr.h, '#ffd34d');
  });
  gear(GEAR_LEFT, dx + 5);
  gear(GEAR_RIGHT, dx + dw - 5 - sz);
  if (L.touch && st.itemPick && st.itemPick.kind === 'equip') {
    const it = m.equip[st.itemPick.key];
    if (!samePick(st.itemPick, 'equip', st.itemPick.key, it)) st.itemPick = null;
    else { const slot = st.itemPick.key; itemCard(ctx, env, st, regions, itemTooltip(it, null), r.x + r.w + 6, r.y, 'Take off', () => { st.itemPick = null; act.unequip(slot); }); }
  }

  // ---- the ledger page: attributes, vitals, combat, with dotted leaders
  const sx = dx + dw + 6, sw = r.x + r.w - 8 - sx, sy = dy, sh = r.y + r.h - 8 - sy;
  sk.page(ctx, sx, sy, sw, sh);
  const s = m.stats || statsAt(p.cls, p.level) || {};
  const ix = sx + 8, iw = sw - 16;
  let y = sy + 6;
  const head = (t) => { sk.ink(ctx, t, ix, y, C.rubric, { big }); y += lh + 1; };
  const row = (label, v, col = C.inkText) => {
    const lw2 = sk.ink(ctx, label, ix + 4, y, C.inkText, { big });
    const vs = String(v), vw = g.textW(vs, big);
    for (let x = ix + 4 + lw2 + 3; x < ix + iw - vw - 3; x += 3) g.rect(ctx, x, y + (big ? 12 : 7), 1, 1, 'rgba(122,86,52,0.6)');
    sk.ink(ctx, vs, ix + iw, y, col, { big, align: 'right' });
    y += lh;
  };
  head('Attributes');
  row('Stamina', s.sta ?? '-'); row('Strength', s.str ?? '-'); row('Agility', s.agi ?? '-'); row('Intellect', s.int ?? '-'); row('Spirit', s.spi ?? '-');
  if (s.armor != null) row('Armor', s.armor);
  y += 3; head('Vitals');
  row('Health', `${p.hp}/${p.hpMax}`, '#2f6b2a');
  if (p.res) row(p.res.kind[0].toUpperCase() + p.res.kind.slice(1), `${Math.floor(p.res.cur)}/${p.res.max}`, '#2a4f8a');
  const d = (m.stats && m.stats.derived) || p.derived;
  if (d && (d.ap != null || d.sp != null || d.crit != null)) {
    y += 3; head('Combat');
    if (d.ap != null) row('Attack power', d.ap); if (d.sp != null) row('Spell power', d.sp); if (d.crit != null) row('Crit', `${(d.crit * 100).toFixed(1)}%`);
  }
  if (!m.stats) sk.ink(ctx, g.clip('Base stats from the class table.', iw, big), ix, sy + sh - lh - 4, C.sepia, { big });

  // ---- spare skills under the doll (as menus.js spareSkills: PC drags one to the bar, a phone tap pins its card with
  // Put on bar, a second tap on the same skill does it)
  const spare = m.stats ? (m.spare || []) : null;
  if (spare) {
    const ly = dy + dh + 6, ry = ly + lh + 2, sp2 = Math.max(26, L.minHit || 0), ssz = Math.min(24, sp2 - 2);
    g.text(ctx, 'Spare skills', dx + 2, ly, 'gold', { large: big });
    if (!spare.length) {
      g.wrap(L.touch ? 'None. Hold a skill on the bar, then Take off bar.' : 'None. Drag a skill off the bar to keep it here.', dw - 4, big).slice(0, 2)
        .forEach((ln, k) => g.text(ctx, ln, dx + 2, ry + 2 + k * lh, 'dim', { large: big }));
      return;
    }
    const res = (classInfo(p.cls) || {}).resource || 'mana';
    const per = Math.max(1, Math.floor((dw) / sp2));
    const shown = spare.slice(0, per);
    shown.forEach((spk, k) => {
      const c = { x: dx + k * sp2, y: ry, w: ssz, h: ssz };
      g.window(ctx, c.x, c.y, c.w, c.h, 'thin', 'blue', 0.95);
      g.iconIn(ctx, spk.icon, c.x, c.y + 1, c.w, c.h - 1);
      const tip = abilityTooltip(abilityInfo(spk.ability), p.level, res, liveStats(m));
      if (tip) { tip.foot = L.touch ? 'Off the bar. Tap Put on bar, then a slot.' : 'Off the bar. Drag it to a bar slot.'; tip.footColor = 'gray'; }
      const picked = st.itemPick && st.itemPick.kind === 'spare' && st.itemPick.key === spk.ability;
      regions.push({ rect: { x: c.x, y: c.y, w: sp2, h: sp2 }, kind: 'spare', ability: spk.ability, icon: spk.icon, label: `spare:${spk.ability}`, tip: L.touch ? undefined : tip,
        on: () => {
          if (!L.touch) return;                          // PC: the drag (ui.js) does the work
          if (picked) { st.itemPick = null; act.barPickEntry({ entry: spk.ability, name: spk.name }); return; }
          st.itemPick = { kind: 'spare', key: spk.ability, id: spk.ability };
        } });
      if (picked) g.outline(ctx, c.x - 1, c.y - 1, c.x + c.w, c.y + c.h, '#ffd34d');
    });
    if (spare.length > shown.length) g.text(ctx, `+${spare.length - shown.length}`, dx + dw - 2, ly, 'gray', { align: 'right' });
    if (L.touch && st.itemPick && st.itemPick.kind === 'spare') {
      const spk = spare.find((x) => x.ability === st.itemPick.key);
      if (!spk) { st.itemPick = null; return; }
      const tip = abilityTooltip(abilityInfo(spk.ability), p.level, res, liveStats(m));
      if (tip) itemCard(ctx, env, st, regions, tip, r.x + r.w + 6, r.y, 'Put on bar', () => { st.itemPick = null; act.barPickEntry({ entry: spk.ability, name: spk.name }); });
    }
  }
}

// The Lantern Chest window and the glyph stones (approved stills, D:\LQOnline\storage_stills\: still1 desktop, still2 phone,
// still3 the glyph pouch). Opened by the sim's `chest_open` event (src/sim/storage.js); the chest's contents arrive in the
// HUD model as m.storage ({ hero, shared } tabs) while the hero stands at it. Every move is a sim command:
// chest_store / chest_take / chest_move / chest_row / chest_sort (CONTRACTS 2.2).
//
//   drawChest(ctx, env, m, st, regions, act)    the window (640x360 design: desktop left of the bags, phone on the left)
//   drawGlyphStone(g, ctx, x, y, s, letter, n)  a PLACEHOLDER letter stone (violet frame, gold vowel / cyan consonant)
//   glyphTip(info, n, foot)                     a glyph's card: letter, vowel or consonant, its lone stat rule, words
//
// Desktop: right-click a chest item to take it (Ctrl + right-click a glyph: one), drag it onto the bags, Shift + right-click
// moves it to the other tab. In the bags, right-click stores (Shift: straight to Shared). Phone: a tap pins the item's
// card (Take, Move to <tab>, Close; a second tap on the same item takes it); the grid scrolls with a drag.
import { frame, itemCard, itemTooltip } from './menus.js';
import { itemInfo, RARITY_COLOR } from './gamedata.js';

const VOWELS = 'AEIOU';
export const CHEST_RECT = { x: 150, y: 52, w: 244 };     // desktop (still 1); the height follows the rows shown

/** A letter stone: PLACEHOLDER art until the glyph icons are drawn (brief: violet frame plus the letter). */
export function drawGlyphStone(g, ctx, x, y, s, letter, n = 1, alpha = 1) {
  g.window(ctx, x, y, s, s, 'thin', 'violet', 0.97 * alpha);
  const L = String(letter || '?');
  const big = s >= 18;
  const lx = n > 1 ? x + 3 : x + Math.floor((s - g.textW(L, big)) / 2);
  g.text(ctx, L, lx, y + Math.floor(s / 2) - (big ? 9 : 6), VOWELS.includes(L) ? 'gold' : 'cyan', { large: big });
  if (n > 1) g.num(ctx, String(n), x + s, y + s - 10, 'white', false, 'right');
}

/** The glyph card (still 3). The stat numbers are not designed yet (open question 4): the card shows the rule only. */
export function glyphTip(info, n, foot) {
  const i = info || {};
  const L = i.letter || '?';
  const vowel = VOWELS.includes(L);
  return {
    title: i.name || `Glyph of ${L}`, titleColor: '#bc94e2', right: `x${n}`,
    sub: `${vowel ? 'Vowel' : 'Consonant'} glyph  Letter stone`,
    lines: i.rule || (vowel ? ['Vowel: +health in armor', 'In a weapon: a little damage'] : ['Consonant: +damage in a weapon', 'In armor: a little health']),
    body: `Socket it into a margin on gear. Letters in order spell a word${(i.words || []).length ? `: ${i.words.join(', ')}` : ''}.`,
    foot, footColor: 'gray',
  };
}

function cell(ctx, g, r, it, dim = false) {
  g.window(ctx, r.x, r.y, r.w, r.h, 'thin', it ? 'blue' : 'slate', it ? 0.95 : dim ? 0.35 : 0.7);
  if (!it) return;
  const i = itemInfo(it) || {};
  g.iconIn(ctx, i.icon || 'icon_bag', r.x, r.y, r.w, r.h);
  if (i.rarity && i.rarity !== 'common') g.outline(ctx, r.x + 1, r.y + 1, r.x + r.w - 2, r.y + r.h - 2, RARITY_COLOR[i.rarity] || '#e8e8e8');
  if ((it.qty || 1) > 1) g.num(ctx, String(it.qty), r.x + r.w - 1, r.y + r.h - 12, 'white', false, 'right');
}
function tab(ctx, g, x, y, w, h, label, on) {
  g.window(ctx, x, y, w, h, 'thin', on ? 'ember' : 'slate', on ? 0.98 : 0.8);
  if (on) g.outline(ctx, x + 1, y + 1, x + w - 2, y + h - 2, '#ffd34d');
  g.text(ctx, g.clip(label, w - 8), x + w / 2, y + Math.floor(h / 2) - g.mid(6), on ? 'gold' : 'gray', { align: 'center' });
}
function button(ctx, g, regions, x, y, w, h, label, scheme, color, on, tip = null) {
  g.window(ctx, x, y, w, h, 'thin', scheme, 0.97);
  g.text(ctx, g.clip(label, w - 6), x + w / 2, y + Math.floor(h / 2) - g.mid(6), color, { align: 'center' });
  regions.push({ rect: { x, y, w, h }, kind: 'button', label: `chest:${label}`, on, tip });
}
const samePick = (pk, tab, key, id) => !!pk && pk.tab === tab && pk.key === key && pk.id === id;

export function drawChest(ctx, env, m, st, regions, act) {
  const { g, L } = env;
  const c = st.chest, S = m.storage;
  if (!c || !S) return;
  const touch = !!L.touch;
  const tabId = c.tab === 'shared' ? 'shared' : 'hero';
  const T = S[tabId];
  const other = tabId === 'hero' ? 'Shared' : (m.player && m.player.name) || 'Hero';
  const heroName = (m.player && m.player.name) || 'Hero';
  const used = T.items.length;
  const hit = touch ? Math.max(24, L.minHit || 24) : 22;
  const cols = touch ? 6 : 10;
  // desktop: the next row shows locked under its Buy button; phone: Buy sits in the footer beside Sort (still 2)
  const allRows = Math.ceil(T.size / cols) + (!touch && T.nextPrice != null ? 1 : 0);
  const visRows = touch ? Math.min(allRows, (T.glyphs.length ? 3 : 4)) : allRows;
  const glyphH = touch ? (T.glyphs.length ? hit + 4 : 0) : 28;
  const helpLines = touch ? 1 : 4;
  const tabsH = touch ? hit - 4 : 16;
  const w = touch ? cols * hit + 20 : CHEST_RECT.w;
  const h = 24 + tabsH + 6 + visRows * hit + 4 + glyphH + (touch ? hit : 0) + helpLines * 11 + (touch ? 8 : 26);
  const r = touch ? { x: 6, y: Math.max(2, Math.floor((360 - h) / 2)), w, h } : { x: CHEST_RECT.x, y: CHEST_RECT.y, w, h };
  frame(ctx, env, r, 'Lantern Chest', regions, { close: () => act.closeChest() }, 'chest');
  if (!touch) g.icon(ctx, 'icon_chest', r.x + r.w - 40, r.y + 6);
  // tabs: [Hero | Shared], with the slots used
  const tw = touch ? 88 : 72;
  const ty = r.y + 24;
  [['hero', heroName], ['shared', 'Shared']].forEach(([id, label], k) => {
    const tx = r.x + (touch ? 8 : 10) + k * (tw + 4);
    tab(ctx, g, tx, ty, tw, tabsH, label, tabId === id);
    regions.push({ rect: { x: tx, y: ty, w: tw, h: tabsH }, kind: 'button', label: `chest_tab:${id}`, on: () => { c.tab = id; c.pick = null; c.scroll = 0; },
      tip: touch ? null : { title: id === 'shared' ? 'Shared' : heroName, sub: id === 'shared' ? 'Every hero on this device sees these items.' : 'Only this hero sees these items.' } });
  });
  g.text(ctx, `${used}/${T.size}`, r.x + r.w - 10, ty + Math.floor(tabsH / 2) - g.mid(6), used >= T.size ? 'red' : 'gray', { align: 'right' });

  // the grid (and the next row, locked, under a Buy button)
  const gx = r.x + Math.floor((r.w - cols * hit) / 2) + (touch ? 0 : 1), gy = ty + tabsH + 6;
  const maxScroll = Math.max(0, allRows - visRows);
  c.scroll = Math.max(0, Math.min(maxScroll, c.scroll || 0));
  const row0 = touch ? c.scroll : 0;
  const scrollDrag = touch && maxScroll > 0 ? (dx, dy, rec) => {
    if (rec.scroll0 == null) rec.scroll0 = c.scroll;
    c.scroll = Math.max(0, Math.min(maxScroll, rec.scroll0 - Math.round(dy / hit)));
  } : null;
  let card = null;
  // gold is spent: the first press asks, the second buys (the price is on the button either way)
  const buyButton = (bx, by, bw, bh) => {
    const ask = st.confirm === `chest_row:${tabId}`;
    const label = ask ? `Buy for ${T.nextPrice} gold? Again` : touch ? `Buy row: ${T.nextPrice} gold` : `Buy row: +10 slots, ${T.nextPrice} gold`;
    const can = (m.gold || 0) >= T.nextPrice;
    button(ctx, g, regions, bx, by, bw, bh, label, 'forest', can ? 'gold' : 'red',
      () => { if (!can) { act.chestRow(tabId); return; } if (ask) { st.confirm = null; act.chestRow(tabId); } else st.confirm = `chest_row:${tabId}`; },
      touch ? null : { title: 'Buy a row', sub: `+10 slots for ${tabId === 'shared' ? 'the Shared tab (every hero)' : heroName}.`, foot: `${T.nextPrice} gold. You have ${Number(m.gold || 0).toLocaleString('en-US')}.`, footColor: can ? 'gold' : 'red' });
  };
  for (let row = row0; row < row0 + visRows; row++) {
    const yy = gy + (row - row0) * hit;
    if (row * cols >= T.size) {
      // the locked row: dim cells and the Buy button over them
      for (let k = 0; k < cols; k++) g.window(ctx, gx + k * hit, yy, hit - 2, hit - 2, 'thin', 'slate', 0.35);
      buyButton(gx + Math.floor((cols * hit - 180) / 2), yy + 2, 180, hit - 6);
      break;
    }
    for (let k = 0; k < cols; k++) {
      const i = row * cols + k;
      if (i >= T.size) break;
      const cr = { x: gx + k * hit, y: yy, w: hit - 2, h: hit - 2 };
      const it = T.items[i] || null;
      cell(ctx, g, cr, it);
      if (!it) { if (scrollDrag) regions.push({ rect: cr, kind: 'window', id: 'chest_cell', scrollDrag }); continue; }
      const key = it.uid != null ? it.uid : it.item;
      const picked = touch && samePick(c.pick, tabId, i, it.item);
      if (picked) { g.outline(ctx, cr.x, cr.y, cr.x + cr.w - 1, cr.y + cr.h - 1, '#ffd34d'); card = { it, i }; }
      const info = itemInfo(it) || {};
      const tip = itemTooltip(it, touch ? (tabId === 'shared' ? 'Shared: any of your heroes can take it.' : null) : `Right-click or drag to take it. Shift + right-click: to ${other}.`,
        info.slot ? ((m.equip || {})[info.slot] || null) : undefined);
      regions.push({ rect: cr, kind: 'chest_item', tab: tabId, index: i, item: it.item, icon: info.icon, tip: touch ? null : tip, scrollDrag,
        on: (btn) => {
          if (!touch) { if (btn === 2) { if (st.mods && st.mods.shift) act.chestMove(tabId, i, it.item); else act.chestTake(tabId, i, it.item); } return; }
          if (picked) { c.pick = null; act.chestTake(tabId, i, it.item); return; }
          c.pick = { tab: tabId, key: i, id: it.item };
          void key;
        } });
    }
  }
  if (touch && maxScroll > 0) regions.push({ rect: { x: gx, y: gy, w: cols * hit, h: visRows * hit }, kind: 'scroll', scroll: (k) => { c.scroll += k; } });
  let y = gy + visRows * hit + 4;

  // glyphs kept in this tab: no slots, one stack per letter
  if (T.glyphs.length || !touch) {
    const s = touch ? hit - 4 : 20;
    g.text(ctx, 'Glyphs', gx, y + Math.floor(s / 2) - g.mid(6), 'violet');
    let x = gx + (touch ? 50 : 44);
    const fit = Math.max(1, Math.floor((r.x + r.w - 10 - x) / (s + 2)));
    const gs = Math.max(0, Math.min(T.glyphs.length - fit, c.gscroll || 0));
    c.gscroll = gs;
    const shown = T.glyphs.slice(gs, gs + fit);
    for (const gl of shown) {
      const info = itemInfo(gl.item) || {};
      const picked = touch && c.pick && c.pick.glyph === gl.item && c.pick.tab === tabId;
      drawGlyphStone(g, ctx, x, y, s, gl.letter || info.letter, gl.qty);
      if (picked) { g.outline(ctx, x - 1, y - 1, x + s, y + s, '#ffd34d'); card = { glyph: gl, info }; }
      const gdrag = touch && T.glyphs.length > fit ? (dx, dy, rec) => { if (rec.g0 == null) rec.g0 = c.gscroll; c.gscroll = Math.max(0, rec.g0 - Math.round(dx / (s + 2))); } : null;
      regions.push({ rect: { x, y, w: s, h: s }, kind: 'chest_glyph', tab: tabId, glyph: gl.item, scrollDrag: gdrag,
        tip: touch ? null : glyphTip(info, gl.qty, `Right-click: to your pouch. Ctrl + right-click: one. Shift + right-click: to ${other}.`),
        on: (btn) => {
          if (!touch) {
            if (btn !== 2) return;
            const one = !!(st.mods && st.mods.ctrl);
            if (st.mods && st.mods.shift) act.chestGlyph('move', tabId, gl.item, one); else act.chestGlyph('take', tabId, gl.item, one);
            return;
          }
          if (picked) { c.pick = null; act.chestGlyph('take', tabId, gl.item, false); return; }
          c.pick = { tab: tabId, glyph: gl.item };
        } });
      x += s + 2;
    }
    if (!T.glyphs.length) g.text(ctx, 'none here', x, y + Math.floor(s / 2) - g.mid(6), 'dim');
    else if (!touch) g.text(ctx, 'no slots used', x + 2, y + Math.floor(s / 2) - g.mid(6), 'dim');
    y += glyphH;
  }

  // Sort (and on a phone the scroll hint)
  if (touch) {
    const bh = hit - 4;
    const bw = Math.floor((r.w - 16 - 6) * 0.62);
    if (T.nextPrice != null) buyButton(r.x + 8, y, bw, bh);
    else g.text(ctx, `${T.size} slots: the most a tab holds`, r.x + 10, y + Math.floor(bh / 2) - g.mid(6), 'dim');
    button(ctx, g, regions, r.x + r.w - 8 - (r.w - 16 - 6 - bw), y, r.w - 16 - 6 - bw, bh, 'Sort', 'slate', 'cream', () => act.chestSort(tabId));
    y += hit;
    const below = Math.max(0, T.size - (c.scroll + visRows) * cols);
    if (maxScroll > 0 && below > 0) g.text(ctx, `Drag to scroll: ${below} more below. Tap a bag item to store it.`, r.x + 10, y, 'gray');
    else g.text(ctx, 'Tap a bag item: its card says Store.', r.x + 10, y, 'gray');
  } else {
    const help = [['Right-click an item: to your bags.', 'gray'], ['Right-click in your bags: Store here.', 'gray'],
      ['Or drag between the chest and bags.', 'gray'], [`Shift + right-click: straight to ${tabId === 'hero' ? 'Shared' : heroName}.`, 'dim']];
    for (const [t, col] of help) { g.text(ctx, t, gx, y, col); y += g.lh; }
    button(ctx, g, regions, r.x + r.w - 10 - 44, r.y + r.h - 22, 44, 16, 'Sort', 'slate', 'cream', () => act.chestSort(tabId),
      { title: 'Sort', sub: 'Merge stacks, then order by kind and rarity.' });
    g.icon(ctx, 'icon_gold', r.x + 10, r.y + r.h - g.ls(18));
    g.text(ctx, `${Number(m.gold || 0).toLocaleString('en-US')} gold`, r.x + 25, r.y + r.h - g.ls(19), 'gold');
    if (S.place) g.text(ctx, g.clip(S.place, 100), r.x + r.w - 60, r.y + r.h - g.ls(19), 'dim', { align: 'right' });
  }

  // the pinned card (phone): beside the chest, Take / Close and Move to the other tab. Drawn later (c.cardFn), over the
  // bags window, so its buttons are on top
  c.cardFn = null;
  if (touch && card) c.cardFn = (regions) => {
    const cx = r.x + r.w + 4, cy = r.y;
    if (card.glyph) {
      const gl = card.glyph;
      itemCard(ctx, env, st, regions, glyphTip(card.info, gl.qty, tabId === 'shared' ? 'Shared: any of your heroes can take it.' : 'Kept in your chest: no slots used.'), cx, cy, 'Take',
        () => { c.pick = null; act.chestGlyph('take', tabId, gl.item, false); },
        { onClose: () => { c.pick = null; }, more: [[`Move to ${other}`, 'violet', () => { c.pick = null; act.chestGlyph('move', tabId, gl.item, false); }]] });
    } else {
      const { it, i } = card;
      const info = itemInfo(it) || {};
      const tip = itemTooltip(it, tabId === 'shared' ? 'Shared: any of your heroes can take it.' : null, info.slot ? ((m.equip || {})[info.slot] || null) : undefined);
      if (tip) itemCard(ctx, env, st, regions, tip, cx, cy, 'Take', () => { c.pick = null; act.chestTake(tabId, i, it.item); },
        { onClose: () => { c.pick = null; }, more: [[`Move to ${other}`, 'violet', () => { c.pick = null; act.chestMove(tabId, i, it.item); }]] });
    }
  };
  // a pick that no longer matches (the list shifted): drop it
  if (c.pick && !card) c.pick = null;
  return r;
}

/** The glyph pouch strip over the bags window (still 3): one stack per letter, A to Z, no bag space. On a phone it
 *  scrolls sideways. Returns the strip's height (0 when the pouch is empty). */
export function drawPouch(ctx, env, m, st, regions, act, x, yBottom, w) {
  const { g, L } = env;
  const list = m.glyphBag || [];
  if (!list.length) return 0;
  const touch = !!L.touch;
  const s = touch ? Math.max(24, L.minHit || 24) - 4 : 22, p = s + (touch ? 4 : 3);
  const cols = Math.max(1, Math.floor((w - 18) / p));
  const rows = touch ? 1 : Math.min(2, Math.ceil(list.length / cols));
  const h = 20 + rows * p + 2;
  const r = { x, y: Math.max(2, yBottom - h), w, h };
  g.window(ctx, r.x, r.y, r.w, r.h, 'thin', 'slate', 0.95);
  regions.push({ rect: r, kind: 'window', id: 'glyph_pouch' });
  const total = list.reduce((n, gl) => n + gl.qty, 0);
  g.text(ctx, 'Glyph pouch', r.x + 8, r.y + 5, 'violet');
  g.text(ctx, `${total} stone${total === 1 ? '' : 's'}, no bag space`, r.x + r.w - 8, r.y + 5, 'dim', { align: 'right' });
  const per = cols * rows;
  const maxS = Math.max(0, list.length - per);
  st.pouchScroll = Math.max(0, Math.min(maxS, st.pouchScroll || 0));
  const shown = list.slice(st.pouchScroll, st.pouchScroll + per);
  const atChest = !!(st.chest && m.storage);
  const sideDrag = touch && maxS > 0 ? (dx, dy, rec) => { if (rec.p0 == null) rec.p0 = st.pouchScroll; st.pouchScroll = Math.max(0, Math.min(maxS, rec.p0 - Math.round(dx / p))); } : null;
  shown.forEach((gl, k) => {
    const gx = r.x + 9 + (k % cols) * p, gy = r.y + 18 + Math.floor(k / cols) * p;
    const info = itemInfo(gl.item) || {};
    drawGlyphStone(g, ctx, gx, gy, s, gl.letter || info.letter, gl.qty);
    const picked = touch && st.itemPick && st.itemPick.kind === 'glyph' && st.itemPick.id === gl.item;
    if (picked) g.outline(ctx, gx - 1, gy - 1, gx + s, gy + s, '#ffd34d');
    const foot = atChest ? 'Takes no bag space. Right-click: Store. Ctrl + right-click: one. Shift: to Shared.' : 'Takes no bag space. Store it at a Lantern Chest.';
    regions.push({ rect: { x: gx, y: gy, w: s, h: s }, kind: 'glyph', glyph: gl.item, scrollDrag: sideDrag, tip: touch ? null : glyphTip(info, gl.qty, foot),
      on: (btn) => {
        if (!touch) { if (btn === 2 && atChest) act.chestGlyph('store', st.mods && st.mods.shift ? 'shared' : (st.chest.tab || 'hero'), gl.item, !!(st.mods && st.mods.ctrl)); return; }
        if (picked && atChest) { st.itemPick = null; act.chestGlyph('store', st.chest.tab || 'hero', gl.item, false); return; }
        st.itemPick = { kind: 'glyph', key: gl.item, id: gl.item };
      } });
  });
  if (sideDrag) regions.push({ rect: { x: r.x + 4, y: r.y + 16, w: r.w - 8, h: p + 2 }, kind: 'scroll', scroll: (k) => { st.pouchScroll += k; } });
  if (!touch) g.text(ctx, 'A-Z order', r.x + r.w - 8, r.y + r.h - g.ls(12), 'dim', { align: 'right' });
  // the pinned glyph card (phone)
  if (touch && st.itemPick && st.itemPick.kind === 'glyph') {
    const gl = list.find((o) => o.item === st.itemPick.id);
    if (!gl) st.itemPick = null;
    else {
      const info = itemInfo(gl.item) || {};
      const tip = glyphTip(info, gl.qty, atChest ? 'Takes no bag space.' : 'Takes no bag space. Store it at a Lantern Chest.');
      const tab = (st.chest && st.chest.tab) || 'hero';
      itemCard(ctx, env, st, regions, tip, Math.max(4, r.x - 220), r.y, atChest ? 'Store' : null, () => { st.itemPick = null; act.chestGlyph('store', tab, gl.item, false); },
        { more: atChest && tab === 'hero' ? [['Store in Shared', 'violet', () => { st.itemPick = null; act.chestGlyph('store', 'shared', gl.item, false); }]] : [] });
    }
  }
  return h + 2;
}

// Menu windows on Lexicon Quest window art: character sheet (C), bags (B), quest log (L), world map (M), options
// (Esc). The talents window is talents.js. Each draw function pushes hit regions { rect, kind, on(button), tip }.
// `act` is the controller's action surface (commands to the sim, local state, close, toast).
import { menuRect, bagGrid } from './layout.js';
import { itemInfo, RARITY_COLOR, RARITY_NAME, statsAt, classInfo, abilityInfo, resourceLabel } from './gamedata.js';
import { drawMarkers } from './minimap.js';
import { ACTIONS, effectiveBinds, keyLabel } from './keymap.js';

const SLOT_ICON = { head: 'icon_helm', chest: 'icon_armor', legs: 'icon_mantle', feet: 'icon_boots', main: 'icon_sword', off: 'icon_shield', hands: 'icon_charm', trinket: 'icon_star' };
const SLOT_NAME = { head: 'Head', chest: 'Chest', legs: 'Legs', feet: 'Feet', main: 'Main hand', off: 'Off hand', hands: 'Hands', trinket: 'Trinket' };
const GEAR_LEFT = ['head', 'chest', 'legs', 'feet'], GEAR_RIGHT = ['main', 'off', 'hands', 'trinket'];

export function frame(ctx, env, r, title, regions, act, id) {
  const { g } = env;
  g.window(ctx, r.x, r.y, r.w, r.h, 'std', 'blue', 0.97);
  regions.push({ rect: r, kind: 'window', id });
  g.text(ctx, title, r.x + 9, r.y + 5, 'gold', { large: true });
  const s = Math.max(16, env.L.minHit || 0);
  const cr = { x: r.x + r.w - 4 - s, y: r.y + 3, w: s, h: Math.min(s, 22) };
  if (env.L.touch) cr.h = s;
  g.window(ctx, r.x + r.w - 20, r.y + 5, 14, 14, 'thin', 'crimson', 0.95);
  g.text(ctx, 'x', r.x + r.w - 13, r.y + 5, 'cream', { align: 'center' });
  regions.push({ rect: cr, kind: 'button', on: () => act.close(id), tip: { title: 'Close', sub: 'Esc' } });
}

export function itemTooltip(it, extra) {
  const i = itemInfo(it);
  if (!i) return null;
  const lines = [];
  if (i.slot) lines.push(SLOT_NAME[i.slot] || i.slot);
  if (i.weaponType) lines.push(i.weaponType);
  const sub = [RARITY_NAME[i.rarity] || 'Common', ...lines].join('  ');
  const body = [];
  if (i.damage) body.push(`${i.damage[0]} to ${i.damage[1]} damage, speed ${i.speed}`);
  if (i.armor) body.push(`${i.armor} armor`);
  for (const [k, v] of Object.entries(i.stats || {})) body.push(`+${v} ${({ str: 'Strength', agi: 'Agility', int: 'Intellect', spi: 'Spirit', sta: 'Stamina' })[k] || k}`);
  if (i.text) body.push(i.text);
  if (i.kind === 'quest') body.push('Quest item.');
  return { title: i.name, titleColor: RARITY_COLOR[i.rarity] || RARITY_COLOR.common, right: i.level ? `Lv ${i.level}` : '', sub,
    body: body.join('. ') + (body.length ? '.' : ''), foot: [i.value ? `Sells for ${i.value}c` : null, extra].filter(Boolean).join('  '), footColor: 'gray' };
}

function itemSlot(ctx, env, r, it, emptyIcon) {
  const { g } = env;
  const i = it ? itemInfo(it) : null;
  g.window(ctx, r.x, r.y, r.w, r.h, 'thin', i ? 'blue' : 'slate', i ? 0.95 : 0.7);
  if (i) {
    g.iconIn(ctx, i.icon || 'icon_bag', r.x, r.y, r.w, r.h);
    const col = RARITY_COLOR[i.rarity] || RARITY_COLOR.common;
    if (i.rarity && i.rarity !== 'common') g.outline(ctx, r.x + 1, r.y + 1, r.x + r.w - 2, r.y + r.h - 2, col);
    const q = it.qty || 1;
    if (q > 1) g.num(ctx, String(q), r.x + r.w - 1, r.y + r.h - 12, 'white', false, 'right');
  } else if (emptyIcon) g.iconIn(ctx, emptyIcon, r.x, r.y, r.w, r.h, 0.3);
}

// ---------------------------------------------------------------- character sheet

export function drawCharacter(ctx, env, m, st, regions, act) {
  const { g, charArt } = env;
  const r = menuRect('character');
  const p = m.player;
  frame(ctx, env, r, 'Character', regions, act, 'character');
  charArt.portrait(ctx, p.cls, p.look, r.x + 9, r.y + 24, 32, 32);
  g.text(ctx, p.name, r.x + 47, r.y + 25, 'white');
  g.text(ctx, `Level ${p.level} ${p.clsName}`, r.x + 47, r.y + 37, 'gray');
  const pitch = Math.max(26, env.L.minHit || 0), sz = Math.min(24, pitch - 2);
  const gy = r.y + 62;
  const gear = (list, x) => list.forEach((slot, i) => {
    const sr = { x, y: gy + i * pitch, w: sz, h: sz };
    const it = m.equip[slot];
    itemSlot(ctx, env, sr, it, SLOT_ICON[slot]);
    regions.push({ rect: { x: sr.x, y: sr.y, w: Math.max(sz, env.L.minHit || 0), h: pitch }, kind: 'equip', slot,
      tip: it ? itemTooltip(it, 'Right-click to take off') : { title: SLOT_NAME[slot], sub: 'Empty' },
      on: (btn) => { if (it && (btn === 2 || env.L.touch)) act.unequip(slot); } });
  });
  gear(GEAR_LEFT, r.x + 9);
  gear(GEAR_RIGHT, r.x + 9 + sz + 6);
  // stats
  const s = m.stats || statsAt(p.cls, p.level) || {};
  const sx = r.x + 74, sw = r.w - 84;
  let y = r.y + 60;
  const row = (label, v, col = 'white') => { g.text(ctx, label, sx, y, 'gray'); g.text(ctx, String(v), sx + sw, y, col, { align: 'right' }); y += 11; };
  g.text(ctx, 'Attributes', sx, y, 'gold'); y += 12;
  row('Stamina', s.sta ?? '-'); row('Strength', s.str ?? '-'); row('Agility', s.agi ?? '-'); row('Intellect', s.int ?? '-'); row('Spirit', s.spi ?? '-');
  if (s.armor != null) row('Armor', s.armor);
  y += 4; g.text(ctx, 'Vitals', sx, y, 'gold'); y += 12;
  row('Health', `${p.hp}/${p.hpMax}`, 'hp');
  if (p.res) row(p.res.kind[0].toUpperCase() + p.res.kind.slice(1), `${p.res.cur}/${p.res.max}`, 'mp');
  const d = (m.stats && m.stats.derived) || p.derived;
  if (d) { if (d.ap != null) row('Attack power', d.ap); if (d.sp != null) row('Spell power', d.sp); if (d.crit != null) row('Crit', `${(d.crit * 100).toFixed(1)}%`); }
  y += 4;
  g.icon(ctx, 'icon_gold', sx, y + 1);
  g.text(ctx, `${Number(m.gold).toLocaleString('en-US')} gold`, sx + 15, y, 'gold');
  if (!m.stats) g.text(ctx, 'Base stats from the class table. Gear is not counted yet.', r.x + 9, r.y + r.h - 18, 'dim');
}

// ---------------------------------------------------------------- bags

export function drawBags(ctx, env, m, st, regions, act) {
  const { g } = env;
  const bag = m.bag;
  const n = bag.size || 16;
  const pitch = Math.max(22, env.L.minHit || 0);
  const cols = Math.min(8, Math.floor((216 - 16) / pitch));
  const rows = Math.ceil(n / cols);
  const base = menuRect('bags');
  const h = Math.min(330, 28 + rows * pitch + 26);
  const r = { x: base.x, y: Math.max(20, 340 - h), w: base.w, h };
  frame(ctx, env, r, 'Bags', regions, act, 'bags');
  const used = bag.items.filter(Boolean).length;
  g.text(ctx, `${used}/${n}`, r.x + r.w - 24, r.y + 8, used >= n ? 'red' : 'gray', { align: 'right' });
  const cells = bagGrid(r, n, { minHit: env.L.minHit || 15 });
  cells.forEach((c) => {
    const it = bag.items[c.i] || null;
    itemSlot(ctx, env, c, it, null);
    if (it) regions.push({ rect: c, kind: 'bag', i: c.i, tip: itemTooltip(it, itemInfo(it).slot ? 'Right-click to equip' : itemInfo(it).use ? 'Right-click to use' : null),
      on: (btn) => { if (btn === 2 || env.L.touch) act.useItem(c.i); }, label: `bag:${c.i}` });
  });
  g.icon(ctx, 'icon_gold', r.x + 10, r.y + r.h - 18);
  g.text(ctx, `${Number(m.gold).toLocaleString('en-US')} gold`, r.x + 25, r.y + r.h - 19, 'gold');
  if (used >= n) g.text(ctx, 'Bags full', r.x + r.w - 10, r.y + r.h - 19, 'red', { align: 'right' });
}

// ---------------------------------------------------------------- quest log

export function drawQuestLog(ctx, env, m, st, regions, act) {
  const { g } = env;
  const r = menuRect('quests');
  frame(ctx, env, r, 'Quest Log', regions, act, 'quests');
  const qs = m.quests;
  g.text(ctx, `${qs.length}/20`, r.x + r.w - 24, r.y + 8, 'gray', { align: 'right' });
  const lx = r.x + 8, lw = 170, ly = r.y + 26, lh = r.h - 34;
  g.window(ctx, lx, ly, lw, lh, 'thin', 'blue', 0.5);
  if (!qs.length) { g.text(ctx, 'No quests yet. Look for a gold ! over a head.', r.x + r.w / 2, r.y + r.h / 2, 'gray', { align: 'center' }); return; }
  if (!st.questSel || !qs.find((q) => q.id === st.questSel)) st.questSel = qs[0].id;
  const rowH = Math.max(13, env.L.minHit || 0);
  const vis = Math.floor((lh - 6) / rowH);
  st.questScroll = Math.max(0, Math.min(Math.max(0, qs.length - vis), st.questScroll || 0));
  qs.slice(st.questScroll, st.questScroll + vis).forEach((q, i) => {
    const y = ly + 3 + i * rowH;
    const sel = q.id === st.questSel;
    if (sel) g.rect(ctx, lx + 2, y, lw - 4, rowH, 'rgba(104,145,217,0.45)');
    g.text(ctx, `${q.level || '?'}`, lx + 6, y + Math.floor((rowH - 11) / 2), 'dim');
    g.text(ctx, g.clip(q.name, lw - 32), lx + 22, y + Math.floor((rowH - 11) / 2), q.done ? 'green' : sel ? 'cream' : 'white');
    if (q.tracked !== false) g.rect(ctx, lx + lw - 7, y + Math.floor(rowH / 2) - 1, 3, 3, '#f9d77a');
    regions.push({ rect: { x: lx, y, w: lw, h: rowH }, kind: 'quest_row', on: () => { st.questSel = q.id; st.confirm = null; } });
  });
  if (qs.length > vis) {
    g.text(ctx, `${st.questScroll + 1}-${Math.min(qs.length, st.questScroll + vis)} of ${qs.length}`, lx + lw / 2, ly + lh - 12, 'dim', { align: 'center' });
    regions.push({ rect: { x: lx, y: ly, w: lw, h: lh }, kind: 'scroll', scroll: (d) => { st.questScroll += d; } });
  }
  // detail
  const q = qs.find((o) => o.id === st.questSel);
  const dx = lx + lw + 10, dw = r.x + r.w - 10 - dx;
  let y = r.y + 26;
  for (const ln of g.wrap(q.name, dw, true)) { g.text(ctx, ln, dx, y, 'gold', { large: true }); y += 16; }
  g.text(ctx, [`Level ${q.level || '?'}`, q.zoneName || '', q.done ? 'Complete' : ''].filter(Boolean).join('   '), dx, y, 'gray'); y += 14;
  for (const o of q.objectives || []) {
    const t = `${o.need > 1 ? `${o.cur}/${o.need}  ` : ''}${o.text}`;
    for (const ln of g.wrap(t, dw - 10)) { g.text(ctx, ln, dx + 8, y, o.cur >= o.need ? 'green' : 'white'); y += 11; }
  }
  y += 4;
  const desc = (q.text && (q.done ? q.text.complete || q.text.progress : q.text.offer)) || q.desc || '';
  const maxY = Math.min(r.y + r.h - 64, r.y + r.h - Math.max(16, env.L.minHit || 0) - 46);
  for (const ln of g.wrap(desc, dw)) { if (y > maxY) { g.text(ctx, '...', dx, y, 'gray'); y += 11; break; } g.text(ctx, ln, dx, y, 'cream'); y += 11; }
  // rewards
  const rw = q.rewards || {};
  const ry = Math.min(r.y + r.h - 58, r.y + r.h - Math.max(16, env.L.minHit || 0) - 6 - 34);
  g.text(ctx, 'Rewards', dx, ry, 'gold');
  const rparts = [rw.xp ? `${rw.xp.toLocaleString('en-US')} XP` : null, rw.gold ? `${rw.gold} gold` : null].filter(Boolean).join('   ');
  g.text(ctx, rparts || 'None', dx + 50, ry, 'white');
  let ix = dx;
  for (const it of [...(rw.items || []), ...(rw.choice || [])].slice(0, 6)) {
    const i = itemInfo(it);
    const sr = { x: ix, y: ry + 12, w: 18, h: 18 };
    itemSlot(ctx, env, sr, { ...i }, null);
    regions.push({ rect: sr, kind: 'reward', tip: itemTooltip(i, rw.choice && rw.choice.includes(it) ? 'Choose one' : null) });
    ix += 21;
  }
  // buttons
  const bh = Math.max(16, env.L.minHit || 0), by = r.y + r.h - bh - 6;
  const button = (x, w, label, color, on) => {
    g.window(ctx, x, by, w, bh, 'thin', 'slate', 0.95);
    g.text(ctx, label, x + w / 2, by + Math.floor(bh / 2) - 6, color, { align: 'center' });
    regions.push({ rect: { x, y: by, w, h: bh }, kind: 'button', on, label });
  };
  const confirm = st.confirm === `abandon:${q.id}`;
  button(r.x + r.w - 10 - 112, 112, confirm ? 'Abandon? Again' : 'Abandon', confirm ? 'orange' : 'red',
    () => { if (confirm) { st.confirm = null; act.abandonQuest(q.id); } else st.confirm = `abandon:${q.id}`; });
  button(r.x + r.w - 10 - 112 - 6 - 80, 80, q.tracked === false ? 'Track' : 'Untrack', 'cream', () => act.trackQuest(q.id, q.tracked === false));
}

// ---------------------------------------------------------------- world map

export function drawMap(ctx, env, m, st, regions, act) {
  const { g, mapBook } = env;
  const r = menuRect('map');
  frame(ctx, env, r, 'World Map', regions, act, 'map');
  const zones = env.zoneList || [];
  const cur = st.mapZone || (m.minimap && m.minimap.zone) || (zones[0] && zones[0].id);
  // zone tabs
  let tx = r.x + 120;
  const th = Math.max(16, env.L.minHit || 0);
  for (const z of zones) {
    const w = g.textW(z.name) + 14;
    const on = z.id === cur;
    g.window(ctx, tx, r.y + 4, w, Math.min(th, 18), 'thin', on ? 'ember' : 'slate', 0.95);
    g.text(ctx, z.name, tx + 7, r.y + 7, on ? 'cream' : 'gray');
    regions.push({ rect: { x: tx, y: r.y + 4, w, h: th }, kind: 'button', on: () => { st.mapZone = z.id; } });
    tx += w + 4;
  }
  const zone = mapBook.zone(cur);
  if (!zone) return;
  const area = { x: r.x + 10, y: r.y + 28, w: r.w - 20, h: r.h - 52 };
  const ppt = Math.max(1, Math.floor(Math.min(area.w / zone.w, area.h / zone.h)));
  const img = mapBook.image(cur, ppt);
  const mx = area.x + Math.floor((area.w - img.width) / 2), my = area.y + Math.floor((area.h - img.height) / 2);
  g.rect(ctx, mx - 2, my - 2, img.width + 4, img.height + 4, '#14101e');
  ctx.drawImage(img, mx, my);
  // joins (edges to other zones)
  for (const j of zone.joins || []) {
    const z2 = zones.find((o) => o.id === j.to);
    const label = z2 ? `To ${z2.name}` : 'Unexplored';
    const jx = mx + (j.x + j.w / 2) * ppt, jy = my + (j.y + j.h / 2) * ppt;
    const lw = g.textW(label);
    const lx = Math.max(mx + 2, Math.min(mx + img.width - lw - 2, jx - lw / 2));
    const ly = Math.max(my + 2, Math.min(my + img.height - 13, jy - 5));
    g.scrim(ctx, lx - 2, ly - 1, lw + 4, 12, 170);
    g.text(ctx, label, lx, ly - 1, z2 ? 'gold' : 'dim');
  }
  const markers = m.minimap && m.minimap.zone === cur ? m.minimap.markers.filter((k) => k.kind !== 'foe') : [];
  drawMarkers(g, ctx, markers, { x: mx, y: my, w: img.width, h: img.height }, ppt, 0, 0);
  const here = markers.find((k) => k.kind === 'me');
  g.text(ctx, here ? 'You are here (white arrow).  Gold ! = quest, ? = turn in.' : 'You are not in this zone.', r.x + r.w / 2, r.y + r.h - 18, 'gray', { align: 'center' });
}

// ---------------------------------------------------------------- options / game menu

export function drawOptions(ctx, env, m, st, regions, act, options) {
  const { g } = env;
  const r = { x: 60, y: 24, w: 520, h: 316 };
  frame(ctx, env, r, 'Options', regions, act, 'menu');
  const touch = env.L.touch;
  const rowH = Math.max(12, env.L.minHit || 0);
  // ---- left: key bindings
  const kx = r.x + 10, kw = 250;
  if (!touch) {
    g.text(ctx, 'Key bindings', kx, r.y + 26, 'gold');
    g.text(ctx, 'click, then press a key', kx + kw, r.y + 26, 'dim', { align: 'right' });
    const binds = effectiveBinds(options.binds);
    ACTIONS.forEach((a, i) => {
      const y = r.y + 40 + i * rowH;
      const waiting = st.rebinding === a.id;
      if (waiting) g.rect(ctx, kx - 2, y - 1, kw + 4, rowH, 'rgba(104,145,217,0.45)');
      g.text(ctx, a.label, kx, y, 'white');
      g.text(ctx, waiting ? 'press a key' : keyLabel(binds[a.id]), kx + kw, y, waiting ? 'orange' : a.fixed ? 'dim' : 'gold', { align: 'right' });
      if (!a.fixed) regions.push({ rect: { x: kx - 2, y: y - 1, w: kw + 4, h: rowH }, kind: 'button', on: () => { st.rebinding = waiting ? null : a.id; } });
    });
    const by = r.y + 40 + ACTIONS.length * rowH + 4;
    g.text(ctx, 'Reset keys', kx, by, 'cream');
    regions.push({ rect: { x: kx - 2, y: by - 1, w: 70, h: 12 }, kind: 'button', on: () => act.setOption('binds', {}) });
  } else {
    g.text(ctx, 'Touch controls', kx, r.y + 30, 'gold');
    const lines = ['Left thumb: touch anywhere on the left half to walk.', 'Tap a foe to target it. Tap a person to talk.',
      'Right thumb: abilities 1 to 6, Talk, Next target.', 'Hold an icon to read about it.', 'Key bindings live on the keyboard version.'];
    lines.forEach((l, i) => g.text(ctx, l, kx, r.y + 46 + i * 12, 'white'));
  }
  // ---- right: sound and view
  const ox = r.x + 280, ow = 228;
  let y = r.y + 26;
  g.text(ctx, 'Sound and view', ox, y, 'gold'); y += 16;
  const slider = (label, key) => {
    g.text(ctx, label, ox, y, 'white');
    g.text(ctx, `${Math.round(options[key] * 100)}%`, ox + ow, y, 'gold', { align: 'right' });
    const sy = y + 13, sw = ow;
    g.gauge(ctx, ox, sy + Math.floor(rowH / 2) - 3, sw, options[key], 'mp');
    const knobX = ox + Math.round(options[key] * (sw - 4));
    g.rect(ctx, knobX, sy + Math.floor(rowH / 2) - 5, 4, 9, '#fff7d6');
    const rect = { x: ox, y: sy, w: sw, h: rowH };
    regions.push({ rect, kind: 'slider', drag: (hx) => act.setOption(key, Math.round(Math.max(0, Math.min(1, (hx - ox) / sw)) * 20) / 20) });
    y = sy + rowH + 6;
  };
  slider('Music volume', 'music');
  slider('Effects volume', 'sfx');
  // on a phone the choices go under the touch notes (left column) so nothing meets the bottom buttons
  let cx = ox, cw = ow;
  if (touch) { cx = kx; cw = 250; y = r.y + 46 + 5 * 12 + 8; }
  const choice = (label, key, vals, names) => {
    g.text(ctx, label, cx, y, 'white'); y += 13;
    const bw = Math.floor((cw - (vals.length - 1) * 4) / vals.length);
    vals.forEach((v, i) => {
      const x = cx + i * (bw + 4), on = options[key] === v;
      g.window(ctx, x, y, bw, rowH, 'thin', on ? 'ember' : 'slate', 0.95);
      g.text(ctx, names[i], x + bw / 2, y + Math.floor(rowH / 2) - 6, on ? 'cream' : 'gray', { align: 'center' });
      regions.push({ rect: { x, y, w: bw, h: rowH }, kind: 'button', on: () => act.setOption(key, v) });
    });
    y += rowH + 6;
  };
  choice('Zoom', 'zoom', [1, 1.5, 2], ['1x', '1.5x', '2x']);
  choice('Effects', 'fx', ['low', 'high'], ['Low', 'High']);
  // ---- bottom buttons
  const bh = Math.max(16, env.L.minHit || 0);
  const by = r.y + r.h - bh - 8;
  const btn = (x, w, label, on) => {
    g.window(ctx, x, by, w, bh, 'thin', 'blue', 0.95);
    g.text(ctx, label, x + w / 2, by + Math.floor(bh / 2) - 6, 'cream', { align: 'center' });
    regions.push({ rect: { x, y: by, w, h: bh }, kind: 'button', on, label });
  };
  btn(ox, 110, 'Resume', () => act.close('menu'));
  btn(ox + 118, 110, 'Character select', () => act.logout());
}

export { SLOT_ICON, classInfo, abilityInfo, resourceLabel };

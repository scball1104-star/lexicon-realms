// Menu windows on Lexicon Quest window art: character sheet (C), bags (B), quest log (L), world map (M), options
// (Esc). The talents window is talents.js. Each draw function pushes hit regions { rect, kind, on(button), tip }.
// `act` is the controller's action surface (commands to the sim, local state, close, toast).
import { FLIGHT } from '../data/travel.js';   // big world: flight points on the world map
import { AFFIXES } from '../data/items.js';   // loot fixes 2026-11-26: the Embers line says what it really does
import { menuRect, bagGrid } from './layout.js';
import { itemInfo, itemSetId, setInfo, wornSetCount, RARITY_COLOR, RARITY_NAME, statsAt, classInfo, abilityInfo, abilityTooltip, resourceLabel, liveStats } from './gamedata.js';
import { drawMarkers, worldView, serifWidth } from './minimap.js';
import { drawAreas, drawTooltip, drawGoalArrow } from './hud.js';
import { whereLabel } from './questnav.js';
import { ACTIONS, effectiveBinds, keyLabel } from './keymap.js';
import { BIND_TEXT } from './group_ui.js';
import { scrollLines } from './textscroll.js';   // Large text: long quest text scrolls (wave 6 uiskin)

const FLIGHT_POINTS = Object.values(FLIGHT.points);

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
  g.text(ctx, 'x', r.x + r.w - 13, r.y + 5, 'cream', { align: 'center', small: true });
  regions.push({ rect: cr, kind: 'button', on: () => act.close(id), tip: { title: 'Close', sub: 'Esc' } });
}

const STAT_NAME = { str: 'Strength', agi: 'Agility', int: 'Intellect', spi: 'Spirit', sta: 'Stamina',
  resInk: 'Ink Resistance', resShadow: 'Shadow Resistance', resLight: 'Light Resistance', resFire: 'Fire Resistance', resNature: 'Nature Resistance', resAll: 'All Resistances',
  // the weapon affixes that act in a fight (src/sim/affixes.js)
  dps: 'damage per second', leech: 'Life Leech', fireOnHit: 'Embers (fire damage on hit)',
  // every other stat gear can carry, spelled out (Scott, 2026-11-22: "sp" meant nothing to a player)
  crit: 'Critical Strike chance', sp: 'Spell Power', mana: 'Mana', speed: 'Movement Speed', armorPct: 'Armor', main: 'Main Stat',
  dodge: 'Dodge chance', maxHp: 'Health', armor: 'Armor', haste: 'Haste' };
const PCT_STAT = new Set(['crit', 'speed', 'armorPct', 'dodge', 'leech']);
/** One stat line on a tooltip. Embers and Leech say what they do in a fight (src/sim/affixes.js, with its caps). */
export function statLine(k, v) {
  if (k === 'fireOnHit') {
    const c = (AFFIXES.of_embers && AFFIXES.of_embers.combat) || { chance: 0.25, per: 4 };
    return `Embers: ${Math.round((c.chance == null ? 1 : c.chance) * 100)}% chance on a hit to deal ${Math.round(v * (c.per || 1))} more fire damage`;
  }
  if (k === 'leech') return `+${v}% Life Leech (heal for that share of your direct hits; gear leech caps at 10%)`;
  return `+${v}${k.startsWith('res') || PCT_STAT.has(k) ? '%' : ''} ${STAT_NAME[k] || k}`;
}
/** Green / red lines: what wearing `i` instead of `worn` changes (CRITIQUE_1 item 13). */
export function compareLines(i, worn) {
  const w = worn ? itemInfo(worn) : null;
  if (!i || !i.slot) return [];
  const out = [];
  const add = (label, d, pct = false) => { if (d) out.push({ text: `${d > 0 ? '+' : ''}${d}${pct ? '%' : ''} ${label}`, color: d > 0 ? 'green' : 'red' }); };
  if (!w) { out.push({ text: 'Nothing worn there yet.', color: 'green' }); return out; }
  if (w.id === i.id && w.name === i.name) return [];
  add('armor', (i.armor || 0) - (w.armor || 0));
  const avg = (x) => (x && x.damage ? (x.damage[0] + x.damage[1]) / 2 : 0);
  if (i.damage || w.damage) add('damage', Math.round(avg(i) - avg(w)));
  const keys = new Set([...Object.keys(i.stats || {}), ...Object.keys(w.stats || {})]);
  for (const k of keys) add(STAT_NAME[k] || k, ((i.stats || {})[k] || 0) - ((w.stats || {})[k] || 0), k.startsWith('res') || PCT_STAT.has(k));
  if (!out.length) out.push({ text: 'Same as what you wear.', color: 'gray' });
  return out.map((o, n) => (n === 0 ? { ...o, text: `vs ${w.name}: ${o.text}` } : o));
}

export function itemTooltip(it, extra, worn) {
  const i = itemInfo(it);
  if (!i) return null;
  const lines = [];
  if (i.slot) lines.push(SLOT_NAME[i.slot] || i.slot);
  if (i.weaponType) lines.push(i.weaponType);
  // binding (src/sim/trade.js): Soulbound, Binds when picked up, Binds when equipped
  const bind = i.soulbound ? BIND_TEXT.soulbound : i.bind ? BIND_TEXT[i.bind] : null;
  const sub = [RARITY_NAME[i.rarity] || 'Common', ...lines, ...(bind ? [bind] : [])].join('  ');
  const body = [];
  if (i.damage) body.push(`${i.damage[0]} to ${i.damage[1]} damage, speed ${i.speed}`);
  if (i.armor) body.push(`${i.armor} armor`);
  for (const [k, v] of Object.entries(i.stats || {})) body.push(statLine(k, v));
  if (i.text) body.push(i.text);
  if (i.q != null) body.push(`Quality ${Math.round(i.q * 100)} of 100${i.illum ? '. Illuminated: every line at its best, and one more' : ''}`);   // wave 10 dloot (only pieces dropped since the build carry q)
  if (i.kind === 'quest') body.push('Quest item.');
  // class set progress (Watchtower 2/3, Endmarket 2/4/5): worn count and each threshold, live or grey
  const sid = itemSetId(i);
  const set = sid ? setInfo(sid) : null;
  const setLines = [];
  if (set) {
    const total = Object.keys(set.pieces).length;
    const n = wornSetCount(sid);
    setLines.push({ text: `${set.name} (${n} of ${total})`, color: 'green' });
    if (set.for) setLines.push({ text: `For: ${set.for}`, color: 'gray' });
    else if (set.track) setLines.push({ text: `For: ${set.track}`, color: 'gray' });
    for (const need of Object.keys(set.bonus || {}).map(Number).sort((a, b) => a - b)) {
      setLines.push({ text: `(${need}) ${set.bonus[need].text}`, color: n >= need ? 'green' : 'gray' });
    }
  }
  // Inscriptions (src/sim/glyphs.js glyphView): the margins, their letters and a spelled word
  if (i.glyph) {
    const gl = i.glyph;
    body.push(`Margins: ${gl.glyphs.map((L) => (L ? `[${L}]` : '[ ]')).join(' ')}`);
    if (gl.word) body.push(`Spells ${gl.wordText.replace(/\.$/, '')}`);
    else for (const t of gl.letterText) body.push(`${t}${gl.draft ? ' (draft)' : ''}`);
  }
  return { title: i.name, titleColor: RARITY_COLOR[i.rarity] || RARITY_COLOR.common, right: i.level ? `Lv ${i.level}` : '', sub,
    body: body.join('. ') + (body.length ? '.' : ''), foot: [i.value ? `Sells for ${i.value} gold` : null, extra].filter(Boolean).join('  '), footColor: 'gray',
    delta: worn !== undefined ? compareLines(i, worn) : null, setLines };
}

function itemSlot(ctx, env, r, it, emptyIcon) {
  const { g } = env;
  if (g.skin) return g.skin.itemSlot(ctx, env, r, it, emptyIcon, itemInfo);   // Lantern and Vellum: quality by colour and shape (skin.js)
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
  const p = m.player;
  const pitch = Math.max(26, env.L.minHit || 0), sz = Math.min(24, pitch - 2);
  // the spare skills (known, not on the bar) sit under the stats; the window grows to fit a row of them
  const spare = m.stats ? (m.spare || []) : null;
  const base = menuRect('character');
  // Large text (gfx.js g.big): a taller, wider sheet from the top of the 640x360 design, the gold beside the name
  const big = g.big;
  const r = big ? { x: base.x, y: 8, w: 300, h: 344 } : spare ? { ...base, h: Math.max(base.h, Math.min(360 - 4 - base.y, 240 + pitch + 8)) } : base;
  frame(ctx, env, r, 'Character', regions, act, 'character');
  charArt.portrait(ctx, p.cls, p.look, r.x + 9, r.y + 24, 32, 32);
  g.text(ctx, p.name, r.x + 47, r.y + 25, 'white');
  g.text(ctx, `Level ${p.level} ${p.clsName}`, r.x + 47, r.y + 25 + g.ls(12), 'gray');
  const gy = r.y + 62;
  const gear = (list, x) => list.forEach((slot, i) => {
    const sr = { x, y: gy + i * pitch, w: sz, h: sz };
    const it = m.equip[slot];
    itemSlot(ctx, env, sr, it, SLOT_ICON[slot]);
    regions.push({ rect: { x: sr.x, y: sr.y, w: Math.max(sz, env.L.minHit || 0), h: pitch }, kind: 'equip', slot,
      tip: it ? itemTooltip(it, env.L.touch ? null : 'Right-click to take off') : { title: SLOT_NAME[slot], sub: 'Empty' },
      on: (btn) => {
        if (!env.L.touch) { if (it && btn === 2) act.unequip(slot); return; }
        if (!it) { st.itemPick = null; return; }
        if (samePick(st.itemPick, 'equip', slot, it)) { st.itemPick = null; act.unequip(slot); return; }
        st.itemPick = { kind: 'equip', key: slot, id: it.uid != null ? it.uid : it.item };
      } });
    if (it && env.L.touch && samePick(st.itemPick, 'equip', slot, it)) g.outline(ctx, sr.x, sr.y, sr.x + sr.w - 1, sr.y + sr.h - 1, '#ffd34d');
  });
  // the pinned item card (touch): right of the character window
  if (env.L.touch && st.itemPick && st.itemPick.kind === 'equip') {
    const it = m.equip[st.itemPick.key];
    if (!samePick(st.itemPick, 'equip', st.itemPick.key, it)) st.itemPick = null;
    else { const slot = st.itemPick.key; itemCard(ctx, env, st, regions, itemTooltip(it, null), r.x + r.w + 6, r.y, 'Take off', () => { st.itemPick = null; act.unequip(slot); }); }
  }
  gear(GEAR_LEFT, r.x + 9);
  gear(GEAR_RIGHT, r.x + 9 + sz + 6);
  // stats
  const s = m.stats || statsAt(p.cls, p.level) || {};
  const sx = r.x + 74, sw = r.w - 84;
  let y = r.y + 60;
  const row = (label, v, col = 'white') => { g.text(ctx, label, sx, y, 'gray'); g.text(ctx, String(v), sx + sw, y, col, { align: 'right' }); y += g.lh; };
  g.text(ctx, 'Attributes', sx, y, 'gold'); y += g.ls(12);
  row('Stamina', s.sta ?? '-'); row('Strength', s.str ?? '-'); row('Agility', s.agi ?? '-'); row('Intellect', s.int ?? '-'); row('Spirit', s.spi ?? '-');
  if (s.armor != null) row('Armor', s.armor);
  y += 4; g.text(ctx, 'Vitals', sx, y, 'gold'); y += g.ls(12);
  row('Health', `${p.hp}/${p.hpMax}`, 'hp');
  if (p.res) row(p.res.kind[0].toUpperCase() + p.res.kind.slice(1), `${Math.floor(p.res.cur)}/${p.res.max}`, 'mp');
  const d = (m.stats && m.stats.derived) || p.derived;
  if (d) { if (d.ap != null) row('Attack power', d.ap); if (d.sp != null) row('Spell power', d.sp); if (d.crit != null) row('Crit', `${(d.crit * 100).toFixed(1)}%`); }
  y += 4;
  const goldS = `${Number(m.gold).toLocaleString('en-US')} gold`;
  const gx = big ? r.x + r.w - 10 - g.textW(goldS) - 15 : sx, gyy = big ? r.y + 25 + g.ls(12) : y;
  g.icon(ctx, 'icon_gold', gx, gyy + 1 + (big ? 3 : 0));
  g.text(ctx, goldS, gx + 15, gyy, 'gold');
  if (p.xpToLevel) {
    y += 4;
    const capLbl = p.renown ? `Renown ${p.renown.level}` : 'Experience';
    g.text(ctx, capLbl, sx, y, 'gold'); y += g.ls(12);
    g.text(ctx, `${Number(p.xp || 0).toLocaleString('en-US')} / ${Number(p.xpToLevel).toLocaleString('en-US')}`, sx, y, 'violet');
    y += g.lh;
  }
  const rn = p.renown;
  if (rn && rn.pending > 0 && rn.choices && rn.choices.length) {
    g.text(ctx, `${rn.pending} reward${rn.pending === 1 ? '' : 's'} to pick`, sx, y, 'gold'); y += g.ls(12);
    const bh = Math.max(14, Math.min(18, g.ls(16)));
    for (const ch of rn.choices) {
      const bw = sw;
      g.window(ctx, sx, y, bw, bh, 'thin', 'gold', 0.95);
      g.text(ctx, ch.label, sx + bw / 2, y + Math.floor(bh / 2) - g.mid(6), 'cream', { align: 'center' });
      regions.push({ rect: { x: sx, y, w: bw, h: bh }, kind: 'button', label: `renown:${ch.id}`, on: () => act.send({ t: 'renown_pick', choice: ch.id }) });
      y += bh + 2;
    }
  }
  if (!m.stats) g.text(ctx, g.clip('Base stats from the class table. Gear is not counted yet.', r.w - 18), r.x + 9, r.y + r.h - g.ls(18), 'dim');
  if (spare) spareSkills(ctx, env, m, st, regions, act, r, spare, pitch, sz, big ? y + 2 : null);
}

// Spare skills (Scott 2026-11-20: "Add the ability to rearrange skills on the bar"): the skills the hero knows that are
// not on the bar. PC: drag one onto a bar slot (ui.js starts the drag from the `spare` region). Phone: a tap pins its
// card with Put on bar, then a tap on a gold bar slot (the same flow as an item from the bags).
function spareSkills(ctx, env, m, st, regions, act, r, spare, pitch, sz, top = null) {
  const { g, L } = env;
  const ly = top ?? r.y + 228, ry = ly + g.ls(12);
  const per = Math.max(1, Math.floor((r.w - 18) / pitch));
  g.text(ctx, 'Spare skills', r.x + 9, ly, 'gold');
  if (!spare.length) {
    const none = L.touch ? 'None. Hold a skill on the bar, then Take off bar.' : 'None. Drag a skill off the bar to keep it here.';
    if (g.big) { g.wrap(none, r.w - 18).slice(0, 2).forEach((ln, k) => g.text(ctx, ln, r.x + 9, ry + k * g.lh, 'dim')); return; }
    g.text(ctx, g.clip(none, r.w - 90), r.x + 80, ly, 'dim');
    return;
  }
  g.text(ctx, g.big ? g.clip(L.touch ? 'Tap one to put it on the bar' : 'Drag one to a bar slot', r.w - 110) : L.touch ? 'Tap one to put it on the bar' : 'Drag one to a bar slot', r.x + r.w - 10, ly, 'dim', { align: 'right' });
  const res = (classInfo(m.player.cls) || {}).resource || 'mana';
  const shown = spare.slice(0, per);
  shown.forEach((sp, k) => {
    const c = { x: r.x + 9 + k * pitch, y: ry, w: sz, h: sz };
    g.window(ctx, c.x, c.y, c.w, c.h, 'thin', 'blue', 0.95);
    g.iconIn(ctx, sp.icon, c.x, c.y + 1, c.w, c.h - 1);
    const tip = abilityTooltip(abilityInfo(sp.ability), m.player.level, res, liveStats(m));
    if (tip) { tip.foot = L.touch ? 'Off the bar. Tap Put on bar, then a slot.' : 'Off the bar. Drag it to a bar slot.'; tip.footColor = 'gray'; }
    const picked = st.itemPick && st.itemPick.kind === 'spare' && st.itemPick.key === sp.ability;
    regions.push({ rect: { x: c.x, y: c.y, w: Math.max(sz, L.minHit || 0), h: Math.max(sz, L.minHit || 0) }, kind: 'spare', ability: sp.ability, icon: sp.icon,
      label: `spare:${sp.ability}`, tip: L.touch ? undefined : tip,
      on: () => {
        if (!L.touch) return;                          // PC: the drag (ui.js) does the work
        if (picked) { st.itemPick = null; act.barPickEntry({ entry: sp.ability, name: sp.name }); return; }
        st.itemPick = { kind: 'spare', key: sp.ability, id: sp.ability };
      } });
    if (picked) g.outline(ctx, c.x, c.y, c.x + c.w - 1, c.y + c.h - 1, '#ffd34d');
  });
  if (spare.length > shown.length) g.text(ctx, `+${spare.length - shown.length}`, r.x + 9 + shown.length * pitch + 2, ry + 6, 'gray');
  // the pinned card (phone): the skill's tooltip with Put on bar
  if (L.touch && st.itemPick && st.itemPick.kind === 'spare') {
    const sp = spare.find((x) => x.ability === st.itemPick.key);
    if (!sp) { st.itemPick = null; return; }
    const tip = abilityTooltip(abilityInfo(sp.ability), m.player.level, res, liveStats(m));
    if (tip) itemCard(ctx, env, st, regions, tip, r.x + r.w + 6, r.y, 'Put on bar', () => { st.itemPick = null; act.barPickEntry({ entry: sp.ability, name: sp.name }); });
  }
}

// ---------------------------------------------------------------- item card (touch)
// On a phone a tap on a bag or worn item opens this card: the full tooltip, pinned where the finger is not, with the
// action as a button. A second tap on the same item does the action at once. (Scott 2026-11-19: "On mobile, how can I
// tell what the items in my bag and what stats they have? It's difficult right now.")
// opts.more: extra full-width buttons [[label, tone, on]] on their own rows under the first row (Put on bar);
// opts.onClose: what Close does (default: unpin the bag or worn item).
export function itemCard(ctx, env, st, regions, tip, x, y, label, onAct, opts = {}) {
  const { g, L } = env;
  const more = (opts.more || []).filter((b) => b && b[0]);
  const bh = Math.max(g.ls(20), L.minHit || 0), gap = 4;
  const rowsH = (1 + more.length) * (bh + gap);
  const box = drawTooltip(g, ctx, tip, x, y, { W: L.W, H: L.H - rowsH });
  let by = box.y + box.h + gap;
  regions.push({ rect: { x: box.x, y: box.y, w: box.w, h: box.h + rowsH }, kind: 'window', id: 'item_card' });
  const button = (text, tone, on, bx, w) => {
    g.window(ctx, bx, by, w, bh, 'thin', tone, 0.97);
    g.text(ctx, g.big ? g.clip(text, w - 6) : text, bx + w / 2, by + Math.floor(bh / 2) - g.mid(6), 'cream', { align: 'center' });
    regions.push({ rect: { x: bx, y: by, w, h: bh }, kind: 'button', label: `card:${text.toLowerCase()}`, on: () => { on(); } });
  };
  const bw = Math.floor((box.w - gap) / 2);
  const btns = [[label, 'forest', onAct], ['Close', 'slate', opts.onClose || (() => { st.itemPick = null; })]].filter((b) => b[0]);
  btns.forEach(([text, tone, on], k) => button(text, tone, on, box.x + k * (bw + gap), btns.length === 1 ? box.w : bw));
  for (const [text, tone, on] of more) { by += bh + gap; button(text, tone, on, box.x, box.w); }
}
const samePick = (pk, kind, key, it) => pk && pk.kind === kind && pk.key === key && pk.id === (it && (it.uid != null ? it.uid : it.item));

// ---------------------------------------------------------------- bags

export function drawBags(ctx, env, m, st, regions, act) {
  const { g } = env;
  const bag = m.bag;
  const n = bag.size || 16;
  const pitch = Math.max(22, env.L.minHit || 0);
  const cols = Math.min(8, Math.floor((216 - 16) / pitch));
  const rows = Math.ceil(n / cols);
  const base = menuRect('bags');
  const h = Math.min(330, 28 + rows * pitch + g.ls(26));
  const r = { x: base.x, y: Math.max(20, 340 - h), w: base.w, h };
  frame(ctx, env, r, 'Bags', regions, act, 'bags');
  const used = bag.items.filter(Boolean).length;
  g.text(ctx, `${used}/${n}`, r.x + r.w - 24, r.y + 8, used >= n ? 'red' : 'gray', { align: 'right' });
  const cells = bagGrid(r, n, { minHit: env.L.minHit || 15 });
  cells.forEach((c) => {
    const it = bag.items[c.i] || null;
    itemSlot(ctx, env, c, it, null);
    const touchHint = env.L.touch ? 'Tap to' : 'Right-click to';
    // at an open Lantern Chest a right-click (or the card's Store) stores the item instead (Shift: straight to Shared)
    const chestOpen = !!(st.chest && m.storage);
    if (it) regions.push({ rect: c, kind: 'bag', i: c.i, item: it.item, icon: itemInfo(it).icon, barItem: itemInfo(it).use && it.kind !== 'quest' ? it.item : null,
      tip: itemTooltip(it, chestOpen ? (env.L.touch ? null : 'Right-click or drag to store it. Shift + right-click: to Shared.') : itemInfo(it).slot ? `${touchHint} equip` : itemInfo(it).use ? (env.L.touch ? `${touchHint} use` : 'Right-click to use. Drag it to the bar') : null, itemInfo(it).slot ? (m.equip[itemInfo(it).slot] || null) : undefined),
      on: (btn) => {
        if (!env.L.touch) { if (btn === 2) act.useItem(c.i); return; }
        if (samePick(st.itemPick, 'bag', c.i, it)) { st.itemPick = null; act.useItem(c.i); return; }
        st.itemPick = { kind: 'bag', key: c.i, id: it.uid != null ? it.uid : it.item };
      }, label: `bag:${c.i}` });
    if (it && env.L.touch && samePick(st.itemPick, 'bag', c.i, it)) g.outline(ctx, c.x, c.y, c.x + c.w - 1, c.y + c.h - 1, '#ffd34d');
  });
  // the pinned item card (touch): left of the bags window
  if (env.L.touch && st.itemPick && st.itemPick.kind === 'bag') {
    const i = st.itemPick.key, it = bag.items[i];
    if (!samePick(st.itemPick, 'bag', i, it)) st.itemPick = null;
    else {
      const info = itemInfo(it) || {};
      const vendor = st.dialog && st.dialog.page === 'vendor';
      const chest = !!(st.chest && m.storage);
      const label = chest ? 'Store' : vendor ? (info.value && info.kind !== 'quest' ? `Sell (${info.value}g)` : null) : info.slot || it.kind === 'bag' ? 'Equip' : info.use ? 'Use' : null;
      const tip = itemTooltip(it, null, info.slot ? (m.equip[info.slot] || null) : undefined);
      // a usable item (potion, ether, food, antidote) can go on the skill bar: the card asks which slot next
      const more = chest ? (st.chest.tab !== 'shared' ? [['Store in Shared', 'violet', () => { st.itemPick = null; act.chestStore(i, 'shared'); }]] : [])
        : !vendor && info.use && it.kind !== 'quest' && act.barPickStart ? [['Put on bar', 'violet', () => act.barPickStart(it.item)]] : [];
      if (tip) itemCard(ctx, env, st, regions, tip, Math.max(4, r.x - 220), r.y, label, () => { st.itemPick = null; act.useItem(i); }, { more });
    }
  }
  g.icon(ctx, 'icon_gold', r.x + 10, r.y + r.h - g.ls(18) + (g.big ? 3 : 0));
  g.text(ctx, `${Number(m.gold).toLocaleString('en-US')} gold`, r.x + 25, r.y + r.h - g.ls(19), 'gold');
  if (used >= n) g.text(ctx, 'Bags full', r.x + r.w - 10, r.y + r.h - g.ls(19), 'red', { align: 'right' });
  // which hand (a dagger for the Inkblade): two buttons under the grid
  if (st.handPick != null && bag.items[st.handPick]) {
    const bh = Math.max(g.ls(16), env.L.minHit || 0), bw = 90, by = r.y + r.h + 2;
    for (const [k, label, hand] of [[0, 'Main hand', 'main'], [1, 'Off hand', 'off']]) {
      const bx = r.x + 8 + k * (bw + 6);
      g.window(ctx, bx, by, bw, bh, 'thin', 'forest', 0.97);
      g.text(ctx, label, bx + bw / 2, by + Math.floor(bh / 2) - g.mid(6), 'cream', { align: 'center' });
      regions.push({ rect: { x: bx, y: by, w: bw, h: bh }, kind: 'button', label: `hand:${hand}`, on: () => act.useItem(st.handPick, hand) });
    }
  }
  // quest items (they take no bag space) and loot that did not fit (fix pass 1)
  const qb = m.questBag || [], pend = m.pendingLoot || [];
  if (qb.length || pend.length) {
    let qy = r.y - 4;
    const rows = [];
    if (pend.length) rows.push('pend');
    if (qb.length) rows.push('quest');
    const ph = 8 + rows.length * Math.max(g.ls(20), env.L.minHit || 0) + 4;
    const pr = { x: r.x, y: Math.max(2, r.y - ph - 2), w: r.w, h: ph };
    g.window(ctx, pr.x, pr.y, pr.w, pr.h, 'thin', 'slate', 0.95);
    regions.push({ rect: pr, kind: 'window', id: 'bags_extra' });
    qy = pr.y + 5;
    const rowH = Math.max(g.ls(20), env.L.minHit || 0);
    if (pend.length) {
      const n = pend.reduce((s2, it) => s2 + (it.qty || 1), 0);
      g.text(ctx, `Loot waiting: ${n}`, pr.x + 8, qy + Math.floor(rowH / 2) - g.mid(6), 'orange');
      const bw = 56, bx = pr.x + pr.w - bw - 8;
      g.window(ctx, bx, qy, bw, rowH - 2, 'thin', 'forest', 0.97);
      g.text(ctx, 'Take', bx + bw / 2, qy + Math.floor(rowH / 2) - g.mid(7), 'cream', { align: 'center' });
      regions.push({ rect: { x: bx, y: qy, w: bw, h: rowH - 2 }, kind: 'button', label: 'loot_take', on: () => act.send({ t: 'loot_take' }),
        tip: { title: 'Loot waiting', sub: 'It did not fit your bags when it dropped.', body: pend.map((it) => `${it.name || it.item}${it.qty > 1 ? ` x${it.qty}` : ''}`).join(', ') } });
      qy += rowH;
    }
    if (qb.length) {
      g.text(ctx, 'Quest', pr.x + 8, qy + Math.floor(rowH / 2) - g.mid(6), 'gold');
      let ix = pr.x + (g.big ? 56 : 44);
      for (const it of qb.slice(0, 8)) {
        const sr = { x: ix, y: qy, w: rowH - 2, h: rowH - 2 };
        itemSlot(ctx, env, sr, it, null);
        regions.push({ rect: sr, kind: 'questitem', tip: itemTooltip(it, 'Quest item: takes no bag space.') });
        ix += rowH;
      }
    }
  }
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
  if (!st.questSel || !qs.find((q) => q.id === st.questSel)) st.questSel = (m.selectedQuest && qs.find((q) => q.id === m.selectedQuest)) ? m.selectedQuest : qs[0].id;
  const big = g.big, nx = big ? 28 : 22;           // Large text (gfx.js g.big): taller rows, the name clear of a two-digit level
  const rowH = Math.max(g.ls(13), env.L.minHit || 0);
  const vis = Math.floor((lh - 6) / rowH);
  st.questScroll = Math.max(0, Math.min(Math.max(0, qs.length - vis), st.questScroll || 0));
  qs.slice(st.questScroll, st.questScroll + vis).forEach((q, i) => {
    const y = ly + 3 + i * rowH;
    const sel = q.id === st.questSel;
    if (sel) g.rect(ctx, lx + 2, y, lw - 4, rowH, 'rgba(104,145,217,0.45)');
    g.text(ctx, `${q.level || '?'}`, lx + 6, y + Math.floor((rowH - g.lh) / 2), 'dim');
    g.text(ctx, g.clip(q.name, lw - nx - 10), lx + nx, y + Math.floor((rowH - g.lh) / 2), q.done ? 'green' : sel ? 'cream' : 'white');
    if (q.tracked !== false) g.rect(ctx, lx + lw - 7, y + Math.floor(rowH / 2) - 1, 3, 3, '#f9d77a');
    regions.push({ rect: { x: lx, y, w: lw, h: rowH }, kind: 'quest_row', id: q.id, on: () => { st.confirm = null; act.selectQuest(q.id); } });
  });
  if (qs.length > vis) {
    g.text(ctx, `${st.questScroll + 1}-${Math.min(qs.length, st.questScroll + vis)} of ${qs.length}`, lx + lw / 2, ly + lh - g.ls(12), 'dim', { align: 'center' });
    regions.push({ rect: { x: lx, y: ly, w: lw, h: lh }, kind: 'scroll', scroll: (d) => { st.questScroll += d; } });
  }
  // detail
  const q = qs.find((o) => o.id === st.questSel);
  const dx = lx + lw + 10, dw = r.x + r.w - 10 - dx;
  let y = r.y + 26;
  for (const ln of g.wrap(q.name, dw, true)) { g.text(ctx, ln, dx, y, 'gold', { large: true }); y += 16; }
  g.text(ctx, g.clip([`Level ${q.level || '?'}`, q.zoneName || '', q.done ? 'Complete' : ''].filter(Boolean).join('   '), dw), dx, y, 'gray'); y += g.ls(14);
  for (const o of q.objectives || []) {
    const t = `${o.need > 1 ? `${o.cur}/${o.need}  ` : ''}${o.text}`;
    for (const ln of g.wrap(t, dw - 10)) { g.text(ctx, ln, dx + 8, y, o.cur >= o.need ? 'green' : 'white'); y += g.lh; }
  }
  y += 4;
  const desc = (q.text && (q.done ? q.text.complete || q.text.progress : q.text.offer)) || q.desc || '';
  const maxY = Math.min(r.y + r.h - 64, r.y + r.h - Math.max(16, env.L.minHit || 0) - 46);
  if (big) {
    // Large text: the quest's words scroll (wheel, or a finger drag) instead of ending in "..."
    const hh = Math.min(r.y + r.h - Math.max(g.ls(16), env.L.minHit || 0) - 6 - 42, maxY + 11) - y;
    if (hh >= g.lh) scrollLines(ctx, g, regions, st, `quest:${q.id}`, g.wrap(desc, dw - 8), { x: dx, y, w: dw, h: hh }, g.lh, (ln, x, yy) => g.text(ctx, ln, x, yy, 'cream'), '#e8dcc0');
  } else for (const ln of g.wrap(desc, dw)) { if (y > maxY) { g.text(ctx, '...', dx, y, 'gray'); y += 11; break; } g.text(ctx, ln, dx, y, 'cream'); y += 11; }
  // rewards
  const rw = q.rewards || {};
  const ry = big ? r.y + r.h - Math.max(g.ls(16), env.L.minHit || 0) - 6 - 40 : Math.min(r.y + r.h - 58, r.y + r.h - Math.max(16, env.L.minHit || 0) - 6 - 34);
  g.text(ctx, 'Rewards', dx, ry, 'gold');
  const rparts = [rw.xp ? `${rw.xp.toLocaleString('en-US')} XP` : null, rw.gold ? `${rw.gold} gold` : null].filter(Boolean).join('   ');
  g.text(ctx, rparts || 'None', dx + (big ? g.textW('Rewards') + 10 : 50), ry, 'white');
  let ix = dx;
  let cardTip = null;
  [...(rw.items || []), ...(rw.choice || [])].slice(0, 6).forEach((it, k) => {
    const i = itemInfo(it);
    const sr = { x: ix, y: ry + g.ls(12), w: 18, h: 18 };
    itemSlot(ctx, env, sr, { ...i }, null);
    const tip = itemTooltip(i, rw.choice && rw.choice.includes(it) ? 'Choose one' : null);
    // on a phone a tap pins the item's card beside the log (Scott 2026-11-19: "I can't see what the rewards options are")
    const on = env.L.touch ? () => { st.itemPick = samePick(st.itemPick, 'reward', `${q.id}:${k}`, { item: it }) ? null : { kind: 'reward', key: `${q.id}:${k}`, id: it }; } : undefined;
    if (env.L.touch && samePick(st.itemPick, 'reward', `${q.id}:${k}`, { item: it })) { g.outline(ctx, sr.x - 1, sr.y - 1, sr.x + sr.w, sr.y + sr.h, '#ffd34d'); cardTip = tip; }
    regions.push({ rect: sr, kind: 'reward', tip: env.L.touch ? null : tip, ...(on ? { on } : {}) });
    ix += 21;
  });
  if (cardTip) itemCard(ctx, env, st, regions, cardTip, r.x + r.w + 6, r.y, null, null);
  else if (env.L.touch && ix > dx) g.text(ctx, 'Tap an item to see it', ix + 4, ry + g.ls(16) - (big ? 3 : 0), 'gray');
  // buttons
  const bh = Math.max(g.ls(16), env.L.minHit || 0), by = r.y + r.h - bh - 6;
  const button = (x, w, label, color, on) => {
    g.window(ctx, x, by, w, bh, 'thin', 'slate', 0.95);
    g.text(ctx, g.clip(label, w - 4), x + w / 2, by + Math.floor(bh / 2) - g.mid(6), color, { align: 'center' });
    regions.push({ rect: { x, y: by, w, h: bh }, kind: 'button', on, label });
  };
  const confirm = st.confirm === `abandon:${q.id}`;
  button(r.x + r.w - 10 - 112, 112, confirm ? 'Abandon? Again' : 'Abandon', confirm ? 'orange' : 'red',
    () => { if (confirm) { st.confirm = null; act.abandonQuest(q.id); } else st.confirm = `abandon:${q.id}`; });
  button(r.x + r.w - 10 - 112 - 6 - 80, 80, q.tracked === false ? 'Track' : 'Untrack', 'cream', () => act.trackQuest(q.id, q.tracked === false));
  // where it sends you: select it and open the map on its goal (Scott, 2026-11-19)
  button(r.x + r.w - 10 - 112 - 6 - 80 - 6 - 96, 96, 'Show on map', 'gold', () => act.showOnMap(q.id));
  // group play: offer it to the party (src/sim/party.js quest_share)
  // group play: offer it to the party (src/sim/party.js quest_share), on the rewards line at the right
  if (m.group && m.group.inParty && act.send) {
    const sw = 60, sh = Math.max(g.ls(16), env.L.minHit || 0), sx = r.x + r.w - 10 - sw, sy = ry - 2;
    g.window(ctx, sx, sy, sw, sh, 'thin', 'blue', 0.95);
    g.text(ctx, 'Share', sx + sw / 2, sy + Math.floor(sh / 2) - g.mid(6), 'cream', { align: 'center' });
    regions.push({ rect: { x: sx, y: sy, w: sw, h: sh }, kind: 'button', label: 'quest_share', on: () => act.send({ t: 'quest_share', quest: q.id }),
      tip: { title: 'Share', body: 'Offer this quest to everyone in your party within 40 tiles who can take it.' } });
  }
}

// ---------------------------------------------------------------- world map

const SIDE_ANGLE = { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 };

/** The world map. It opens on the zone of the SELECTED quest's goal (questnav.js), lists your quests on the left (a
 *  tap selects one), pulses the selected quest's circles with what to do there ("Slay Ink Slimes 2/6", "Hand in to
 *  Oren") and dims the rest. When the goal is in another zone, both zones' maps say which way to go ("Go to Shepherd's
 *  Downs (east exit)") and your zone's map points a gold arrow at that exit. */
export function drawMap(ctx, env, m, st, regions, act) {
  const { g, mapBook } = env;
  const r = menuRect('map');
  frame(ctx, env, r, 'World Map', regions, act, 'map');
  const zones = env.zoneList || [];
  const nav = m.nav || null;
  const here = m.minimap && m.minimap.zone;
  const goalZone = nav && nav.goal ? nav.goal.zone : null;
  const cur = st.mapZone || goalZone || here || (zones[0] && zones[0].id);
  st.mapShown = cur;
  const pulse = ((st.now || 0) * 1.2) % 1;
  // zone picker: < name > (nine outdoor zones and growing: tabs no longer fit). Outdoor zones, plus the one shown or
  // stood in if it is a dungeon or cave; it stops short of the close button.
  const tabZones = zones.filter((z) => z.id === cur || z.id === here || !env.zoneKind || env.zoneKind(z.id) === 'field');
  if (tabZones.length > 1) {
    const th = Math.max(g.ls(16), env.L.minHit || 0);
    const bh = Math.min(th, g.ls(22));
    const right = r.x + r.w - 8 - th;
    const ci = Math.max(0, tabZones.findIndex((z) => z.id === cur));
    const step = (d) => () => { st.mapZone = tabZones[(ci + d + tabZones.length) % tabZones.length].id; };
    const bw = Math.max(18, th);
    let px = r.x + 150;
    const nameW = Math.max(60, right - px - 2 * bw - 12);
    g.window(ctx, px, r.y + 4, bw, bh, 'thin', 'slate', 0.95);
    g.text(ctx, '<', px + bw / 2, r.y + 4 + Math.floor((bh - g.lh) / 2), 'cream', { align: 'center' });
    regions.push({ rect: { x: px, y: r.y + 4, w: bw, h: th }, kind: 'button', label: 'map_zone:prev', tip: { title: 'Previous map' }, on: step(-1) });
    px += bw + 4;
    const nm = (tabZones[ci] || {}).name || cur;
    g.window(ctx, px, r.y + 4, nameW, bh, 'thin', 'ember', 0.95);
    g.text(ctx, g.clip(`${nm}  (${ci + 1} of ${tabZones.length})`, nameW - 10), px + nameW / 2, r.y + 4 + Math.floor((bh - g.lh) / 2), 'cream', { align: 'center' });
    regions.push({ rect: { x: px, y: r.y + 4, w: nameW, h: th }, kind: 'button', label: 'map_zone:next_name', tip: { title: 'Next map' }, on: step(1) });
    px += nameW + 4;
    g.window(ctx, px, r.y + 4, bw, bh, 'thin', 'slate', 0.95);
    g.text(ctx, '>', px + bw / 2, r.y + 4 + Math.floor((bh - g.lh) / 2), 'cream', { align: 'center' });
    regions.push({ rect: { x: px, y: r.y + 4, w: bw, h: th }, kind: 'button', label: 'map_zone:next', tip: { title: 'Next map' }, on: step(1) });
  }
  // your quests (a tap selects one; the map moves to its zone)
  const sel = m.selectedQuest ? (m.quests || []).find((q) => q.id === m.selectedQuest) : null;
  const list = [...(m.tracked || [])];
  if (sel && !list.some((q) => q.id === sel.id)) list.push(sel);
  // Large text (gfx.js g.big): a wider list, taller rows, the key line a row higher
  const lg = { x: r.x + 8, y: r.y + g.ls(28), w: g.big ? 140 : 108, h: r.h - (g.big ? 62 : 52) };
  g.window(ctx, lg.x, lg.y, lg.w, lg.h, 'thin', 'blue', 0.5);
  g.text(ctx, 'Your quests', lg.x + 6, lg.y + 4, 'gold');
  const rowH = Math.max(g.ls(15), env.L.minHit || 0);
  let ly = lg.y + g.ls(17);
  if (!list.length) g.text(ctx, 'None tracked', lg.x + 6, ly + 2, 'dim');
  for (const q of list) {
    if (ly + rowH > lg.y + lg.h - 2) break;
    const on = sel && q.id === sel.id;
    g.window(ctx, lg.x + 3, ly, lg.w - 6, rowH - 2, 'thin', on ? 'ember' : 'slate', on ? 0.95 : 0.6);
    const tyy = ly + Math.floor((rowH - 2 - g.lh) / 2);
    if (on) drawGoalArrow(ctx, lg.x + 10, tyy + Math.floor(g.lh / 2) + (g.big ? 1 : 0), 0, 0.6);
    g.text(ctx, g.clip(q.name, lg.w - 24), lg.x + 17, tyy, q.done ? 'green' : on ? 'cream' : 'gray');
    regions.push({ rect: { x: lg.x + 3, y: ly, w: lg.w - 6, h: rowH }, kind: 'button', label: `map_quest:${q.id}`, tip: { title: q.name, sub: 'Show where it sends you' },
      on: () => { act.selectQuest(q.id); st.mapZone = null; } });
    ly += rowH;
  }
  // what to do next, under the list when there is room
  if (nav && nav.goal && ly + g.ls(26) < lg.y + lg.h) {
    let ny = ly + 4;
    g.text(ctx, 'Next', lg.x + 6, ny, 'gold'); ny += g.lh;
    const lines = [nav.goal.label, nav.line].filter(Boolean).flatMap((s) => g.wrap(s, lg.w - 12));
    for (const ln of lines) { if (ny + g.lh > lg.y + lg.h - 2) break; g.text(ctx, ln, lg.x + 6, ny, 'cream'); ny += g.lh; }
  }
  const zone = mapBook.zone(cur);
  if (!zone) return;
  const area = { x: lg.x + lg.w + 6, y: lg.y, w: r.x + r.w - 10 - (lg.x + lg.w + 6), h: lg.h };
  // map art (BRIEF.md look A): the Lantern skin's vellum map, zoomed on your area with a Whole world button
  if (env.mapPass && env.mapPass.enabled && g.skin) { drawMapVellum(ctx, env, m, st, regions, { r, area, zone, cur, here, nav, sel, zones, pulse, goalZone }); return; }
  // a zone bigger than the window (the big realms) is drawn scaled down, so ppt can be below 1
  // the map fills the window: ppt can be fractional (scaled up or down from the nearest whole-pixel image)
  const ppt = Math.min(area.w / zone.w, area.h / zone.h);
  const src = mapBook.image(cur, Math.max(1, Math.ceil(ppt)));
  const img = { width: Math.floor(zone.w * ppt), height: Math.floor(zone.h * ppt) };
  const mx = area.x + Math.floor((area.w - img.width) / 2), my = area.y + Math.floor((area.h - img.height) / 2);
  g.rect(ctx, mx - 2, my - 2, img.width + 4, img.height + 4, '#14101e');
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = ppt < 1;
  ctx.drawImage(src, mx, my, img.width, img.height);
  ctx.imageSmoothingEnabled = smooth;
  const placed = [];   // every label's box: a label that would overlap one already drawn is left out
  const hits = (box) => placed.some((q) => q.x < box.x + box.w && box.x < q.x + q.w && q.y < box.y + box.h && box.y < q.y + q.h);
  const exitHere = nav && nav.exit && cur === here ? nav.exit : null;
  // joins (edges to other zones)
  for (const j of zone.joins || []) {
    const z2 = zones.find((o) => o.id === j.to);
    if (!z2) continue;                      // an edge with nothing behind it yet: no label (it only cluttered)
    const label = `To ${z2.name}`;
    const jx = mx + (j.x + j.w / 2) * ppt, jy = my + (j.y + j.h / 2) * ppt;
    const lw = g.textW(label);
    const lx = Math.max(mx + 2, Math.min(mx + img.width - lw - 2, jx - lw / 2));
    const lyy = Math.max(my + 2, Math.min(my + img.height - g.ls(13), jy - g.mid(5)));
    const isExit = exitHere && j.to === exitHere.to;
    const jb = { x: lx - 2, y: lyy - 1, w: lw + 4, h: g.ls(12) };
    if (!isExit && hits(jb)) continue;
    placed.push(jb);
    g.scrim(ctx, lx - 2, lyy - 1, lw + 4, g.ls(12), isExit ? 220 : 170);
    g.text(ctx, label, lx, lyy - 1, isExit ? 'cream' : z2 ? 'gold' : 'dim');
  }
  // place names (the Fork, the North Landing...): quest text names them, so the map does too (CRITIQUE_1 item 9)
  const view = { x: mx, y: my, w: img.width, h: img.height };
  // the big areas first (one world: the High Moor, the Downs, Willowmere, the valley), in gold, so they win any overlap
  const big = (ar) => /^region_/.test(ar.id);
  for (const ar of [...(zone.areas || []).filter(big), ...(zone.areas || []).filter((a) => !big(a))]) {
    if (!ar.name || ar.w * ar.h < 30) continue;
    const lw = g.textW(ar.name);
    const lx = Math.round(mx + (ar.x + ar.w / 2) * ppt - lw / 2), lyy = Math.round(my + (ar.y + ar.h / 2) * ppt - g.mid(5));
    const box = { x: lx - 2, y: lyy - 1, w: lw + 4, h: g.ls(12) };
    if (box.x < mx || box.y < my || box.x + box.w > mx + img.width || box.y + box.h > my + img.height) continue;
    if (hits(box)) continue;
    placed.push(box);
    g.scrim(ctx, box.x, box.y, box.w, box.h, big(ar) ? 200 : 110);
    g.text(ctx, ar.name, lx, lyy - 1, big(ar) ? 'gold' : 'cream');
  }
  // big world: the flight points in this zone (src/data/travel.js), lit when the hero has been to them
  for (const p of FLIGHT_POINTS.filter((q) => q.zone === cur)) {
    const known = (env.flights || []).includes(p.id);
    const px = mx + (p.x + 0.5) * ppt, py = my + (p.y + 0.5) * ppt;
    g.rect(ctx, Math.round(px - 8), Math.round(py - 8), 16, 16, known ? 'rgba(60,40,10,0.85)' : 'rgba(20,16,30,0.7)');
    g.iconIn(ctx, 'icon_feather', Math.round(px - 7), Math.round(py - 7), 14, 14, known ? 1 : 0.4);
    regions.push({ rect: { x: Math.round(px - 7), y: Math.round(py - 7), w: 14, h: 14 }, kind: 'map_flight', tip: { title: p.name, sub: known ? 'Flight point: you can fly here from any kitemaster.' : 'Flight point: talk to the kitemaster here to unlock it.' } });
  }
  // objective areas of your quests in this zone: the selected quest's pulse, the others are dimmed
  const areas = ((m.minimap && m.minimap.areas) || []).filter((a) => a.zone === cur);
  drawAreas(ctx, areas, view, ppt, 0, 0, cur, 2, { sel: sel ? sel.id : null, pulse });
  const named = new Set();
  const labelAt = (w, label, color, alpha, force = false) => {
    const lw = g.textW(label);
    const lx = Math.max(mx + 2, Math.min(mx + img.width - lw - 2, mx + w.x * ppt - lw / 2)), lyy = Math.max(my + 2, Math.min(my + img.height - g.ls(12), my + (w.y + (w.r || 2)) * ppt + 3));
    const qb = { x: lx - 2, y: lyy - 1, w: lw + 4, h: g.ls(12) };
    if (!force && hits(qb)) return;
    placed.push(qb);
    ctx.globalAlpha = alpha;
    g.scrim(ctx, lx - 2, lyy - 1, lw + 4, g.ls(12), 190);
    g.text(ctx, label, lx, lyy - 1, color);
    ctx.globalAlpha = 1;
  };
  for (const q of m.tracked || []) {
    if (sel && q.id === sel.id) continue;
    for (const w of q.wheres || []) {
      if (w.zone !== cur || named.has(q.id)) continue;
      named.add(q.id);
      labelAt(w, g.clip(q.done ? `Hand in: ${q.name}` : q.name, 130), 'gold', sel ? 0.5 : 1);
    }
  }
  // the selected quest: one label per objective here, saying what to do ("Slay Ink Slimes 2/6", "Hand in to Oren")
  const selLabels = [];
  if (sel) {
    const seen = new Set();
    const ws = (sel.wheres || []).filter((w) => w.zone === cur);
    const gi = nav && nav.goal ? ws.findIndex((w) => w.x === nav.goal.x && w.y === nav.goal.y && w.zone === nav.goal.zone) : -1;
    if (gi > 0) ws.unshift(ws.splice(gi, 1)[0]);   // the goal's circle gets its objective's label
    for (const w of ws) {
      const label = g.clip(whereLabel(w, sel), 160);
      if (seen.has(label)) continue;
      seen.add(label);
      labelAt(w, label, 'cream', 1, true);
      selLabels.push(label);
    }
  }
  st.mapLabels = selLabels;
  // which way to go when the goal is in another zone: a line on both zones' maps, an arrow at the exit on yours
  let routeText = '';
  if (nav && nav.goal && here && goalZone !== here && nav.line) {
    const hereName = (zones.find((z) => z.id === here) || {}).name || here;
    if (cur === here) routeText = nav.line;
    else if (cur === goalZone) routeText = `You are in ${hereName}. ${nav.line}`;
  }
  st.mapRoute = routeText;
  if (routeText) {
    // under the map, where the key line goes, so it never covers a place name
    const t = g.clip(routeText, area.w - 12);
    const tw = g.textW(t);
    const bx = area.x + Math.floor((area.w - tw) / 2);
    g.window(ctx, bx - 6, r.y + r.h - g.ls(21), tw + 12, g.ls(16), 'thin', 'ember', 0.95);
    g.text(ctx, t, bx, r.y + r.h - g.ls(19) + (g.big ? 1 : 0), 'cream');
  }
  if (exitHere) {
    const ex = mx + exitHere.x * ppt, ey = my + exitHere.y * ppt;
    const ang = SIDE_ANGLE[exitHere.side] || 0;
    const back = 12 + Math.round(pulse * 4);
    const ax = Math.round(Math.max(mx + 8, Math.min(mx + img.width - 8, ex - Math.cos(ang) * back)));
    const ay = Math.round(Math.max(my + 8, Math.min(my + img.height - 8, ey - Math.sin(ang) * back)));
    drawGoalArrow(ctx, ax, ay, ang, 1.3);
  }
  const markers = m.minimap && m.minimap.zone === cur ? m.minimap.markers.filter((k) => k.kind !== 'foe') : [];
  drawMarkers(g, ctx, markers, view, ppt, 0, 0);
  const meHere = markers.find((k) => k.kind === 'me');
  if (!routeText) g.text(ctx, g.clip(meHere ? 'White arrow: you.  Gold !: a quest.  Gold ?: hand it in.  Bright circle: the quest you picked.' : 'You are not in this zone.  Bright circle: the quest you picked.', r.x + r.w - 8 - area.x), area.x + area.w / 2, r.y + r.h - g.ls(18), 'gray', { align: 'center' });
}

const JOIN_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const measureCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** The world map under the Lantern skin (map art, BRIEF.md look A): the map box is left clear on this layer and the
 *  map pass draws the vellum map there at screen resolution, with place names lettered in the serif; what is drawn
 *  here afterwards (quest labels, the Whole world button, the route line, tooltips) sits on top. It opens zoomed on
 *  your area at the minimap's scale (Scott 2026-11-25); "Whole world" shows all of it. Foes stay hidden. */
function drawMapVellum(ctx, env, m, st, regions, o) {
  const { g } = env;
  const { r, area, zone, cur, here, nav, sel, zones, pulse, goalZone } = o;
  const meM = m.minimap && m.minimap.zone === cur ? m.minimap : null;
  const goalHere = nav && nav.goal && nav.goal.zone === cur ? nav.goal : null;
  // centred on you (and following you), or on the selected quest's goal after "Show on map" (st.mapCenter 'goal')
  if (!st.mapCenter || st.mapCenter === 'goal' || st.mapCenter.zone !== cur) {
    const onGoal = goalHere && (st.mapCenter === 'goal' || !meM);
    st.mapCenter = onGoal ? { zone: cur, x: goalHere.x, y: goalHere.y, me: false } : meM ? { zone: cur, x: meM.x / 16, y: meM.y / 16, me: true } : { zone: cur, x: zone.w / 2, y: zone.h / 2, me: false };
  }
  let v = worldView(zone, area, !!st.mapWhole, st.mapCenter);
  if (!v.whole && meM && st.mapCenter.me) {
    // you walked toward the edge with the map open: centre on you again
    const hx = (meM.x / 16) * v.ppt - v.sx, hy = (meM.y / 16) * v.ppt - v.sy;
    if (hx < area.w * 0.12 || hx > area.w * 0.88 || hy < area.h * 0.12 || hy > area.h * 0.88) {
      st.mapCenter = { zone: cur, x: meM.x / 16, y: meM.y / 16, me: true };
      v = worldView(zone, area, false, st.mapCenter);
    }
  }
  st.mapView = { whole: v.whole, canZoom: v.canZoom, ppt: v.ppt };   // drivers and tests
  const ppt = v.ppt;
  // the map box: the whole area when zoomed, the fitted map when whole
  const box = v.whole ? { x: area.x - v.sx, y: area.y - v.sy, w: v.w, h: v.h } : { x: area.x, y: area.y, w: area.w, h: area.h };
  const sx = v.whole ? 0 : v.sx, sy = v.whole ? 0 : v.sy;
  const at = (tx, ty) => [box.x + tx * ppt - sx, box.y + ty * ppt - sy];
  const inBox = (x, y, pad = 0) => x >= box.x + pad && y >= box.y + pad && x < box.x + box.w - pad && y < box.y + box.h - pad;
  g.rect(ctx, box.x - 2, box.y - 2, box.w + 4, box.h + 4, '#14101e');
  ctx.clearRect(box.x, box.y, box.w, box.h);

  // lettering (the pass draws it in the serif): region names in spaced capitals, places in italic, exits with an arrow
  const placed = [];
  const hits = (b) => placed.some((q) => q.x < b.x + b.w && b.x < q.x + q.w && q.y < b.y + b.h && b.y < q.y + q.h);
  const labels = [];
  // the selected quest's objective labels always show (drawn below): place names keep clear of where they will go
  const reserved = [];
  if (sel) for (const w of (sel.wheres || []).filter((q) => q.zone === cur)) {
    const lw = g.textW(g.clip(whereLabel(w, sel), 160));
    const [wx, wy] = at(w.x, w.y + (w.r || 2));
    reserved.push({ x: Math.max(box.x + 2, Math.min(box.x + box.w - lw - 2, wx - lw / 2)) - 2, y: Math.max(box.y + 2, Math.min(box.y + box.h - g.ls(12), wy + 3)) - 1, w: lw + 4, h: g.ls(12) });
  }
  const clash = (b) => reserved.some((q) => q.x < b.x + b.w && b.x < q.x + q.w && q.y < b.y + b.h && b.y < q.y + q.h);
  // flight points (lit when the hero has been to them) and dungeon doors: drawn by the pass, tooltips here
  const flights = [];
  for (const p of FLIGHT_POINTS.filter((q) => q.zone === cur)) {
    const known = (env.flights || []).includes(p.id);
    const [px, py] = at(p.x + 0.5, p.y + 0.5);
    if (!inBox(px, py, 4)) continue;
    flights.push({ x: p.x + 0.5, y: p.y + 0.5, known });
    placed.push({ x: px - 7, y: py - 7, w: 14, h: 14 });
    regions.push({ rect: { x: Math.round(px - 7), y: Math.round(py - 7), w: 14, h: 14 }, kind: 'map_flight', tip: { title: p.name, sub: known ? 'Flight point: you can fly here from any kitemaster.' : 'Flight point: talk to the kitemaster here to unlock it.' } });
  }
  const doors = [];
  for (const d of zone.doors || []) {
    const [px, py] = at(d.x + d.w / 2, d.y + d.h / 2);
    if (!inBox(px, py, 4)) continue;
    doors.push({ x: d.x + d.w / 2, y: d.y + d.h / 2 });
    placed.push({ x: px - 6, y: py - 6, w: 12, h: 12 });
    if (d.name) regions.push({ rect: { x: Math.round(px - 6), y: Math.round(py - 6), w: 12, h: 12 }, kind: 'map_door', tip: { title: d.name, ...(d.label ? { sub: d.label } : {}) } });
  }

  const big = (ar) => /^region_/.test(ar.id);
  const sReg = v.whole ? 6.5 : 8.5, sPlace = v.whole ? 5.5 : 7, sJoin = v.whole ? 5.5 : 6.5;
  for (const ar of [...(zone.areas || []).filter(big), ...(zone.areas || []).filter((a) => !big(a))]) {
    if (!ar.name || ar.w * ar.h < 30) continue;
    const isReg = big(ar), text = isReg ? ar.name.toUpperCase() : ar.name, size = isReg ? sReg : sPlace, style = isReg ? 'caps' : 'italic';
    if (!isReg && v.whole && ar.w * ar.h < 200) continue;          // the whole world: only the larger places
    const lw = serifWidth(text, size, style, measureCanvas);
    const [cx, cy] = at(ar.x + ar.w / 2, ar.y + ar.h / 2);
    const b = { x: Math.round(cx - lw / 2) - 2, y: Math.round(cy - size / 2) - 1, w: Math.ceil(lw) + 4, h: Math.ceil(size) + 3 };
    if (!inBox(b.x, b.y) || !inBox(b.x + b.w, b.y + b.h, -1) || hits(b) || clash(b)) continue;
    placed.push(b);
    labels.push({ text, size, style, color: isReg ? '#7a2a1e' : '#3a2618', x: b.x + 2 - box.x, y: b.y + 1 - box.y });
  }
  const exitHere = nav && nav.exit && cur === here ? nav.exit : null;
  for (const j of zone.joins || []) {
    const z2 = zones.find((q) => q.id === j.to);
    if (!z2) continue;
    const text = `To ${z2.name}`, lw = serifWidth(text, sJoin, 'italic', measureCanvas);
    const [jx, jy] = at(j.x + j.w / 2, j.y + j.h / 2);
    if (!inBox(jx, jy, -2)) continue;
    const ang = JOIN_ANGLE[j.dir] != null ? JOIN_ANGLE[j.dir] : 0;
    const ax = Math.max(box.x + 6, Math.min(box.x + box.w - 6, jx)), ay = Math.max(box.y + 6, Math.min(box.y + box.h - 6, jy));
    const lx = Math.max(box.x + 2, Math.min(box.x + box.w - lw - 2, ax - lw / 2 - Math.cos(ang) * (lw / 2 + 8)));
    const ly = Math.max(box.y + 2, Math.min(box.y + box.h - sJoin - 3, ay - sJoin / 2 - Math.sin(ang) * 9));
    const b = { x: Math.round(lx) - 2, y: Math.round(ly) - 1, w: Math.ceil(lw) + 4, h: Math.ceil(sJoin) + 3 };
    const isExit = exitHere && j.to === exitHere.to;
    if (!isExit && (hits(b) || clash(b))) continue;
    placed.push(b);
    labels.push({ text, size: sJoin, style: 'italic', color: isExit ? '#7a2a1e' : '#3a2618', x: b.x + 2 - box.x, y: b.y + 1 - box.y, arrow: ang, ax: ax - box.x, ay: ay - box.y });
  }
  // quest labels (the game's pixel font, on top of the map): the tracked quests, the selected quest's objectives
  const named = new Set();
  const labelAt = (w, label, color, alpha, force = false) => {
    const lw = g.textW(label);
    const [wx, wy] = at(w.x, w.y + (w.r || 2));
    const lx = Math.max(box.x + 2, Math.min(box.x + box.w - lw - 2, wx - lw / 2)), lyy = Math.max(box.y + 2, Math.min(box.y + box.h - g.ls(12), wy + 3));
    const qb = { x: lx - 2, y: lyy - 1, w: lw + 4, h: g.ls(12) };
    if (!force && hits(qb)) return;
    if (!inBox(wx, wy - (w.r || 2) * ppt, -8)) return;
    placed.push(qb);
    ctx.globalAlpha = alpha;
    g.scrim(ctx, lx - 2, lyy - 1, lw + 4, g.ls(12), 190);
    g.text(ctx, label, lx, lyy - 1, color);
    ctx.globalAlpha = 1;
  };
  for (const q of m.tracked || []) {
    if (sel && q.id === sel.id) continue;
    for (const w of q.wheres || []) {
      if (w.zone !== cur || named.has(q.id)) continue;
      named.add(q.id);
      labelAt(w, g.clip(q.done ? `Hand in: ${q.name}` : q.name, 130), 'gold', sel ? 0.5 : 1);
    }
  }
  const selLabels = [];
  if (sel) {
    const seen = new Set();
    const ws = (sel.wheres || []).filter((w) => w.zone === cur);
    const gi = nav && nav.goal ? ws.findIndex((w) => w.x === nav.goal.x && w.y === nav.goal.y && w.zone === nav.goal.zone) : -1;
    if (gi > 0) ws.unshift(ws.splice(gi, 1)[0]);
    for (const w of ws) {
      const label = g.clip(whereLabel(w, sel), 160);
      if (seen.has(label)) continue;
      seen.add(label);
      labelAt(w, label, 'cream', 1, true);
      selLabels.push(label);
    }
  }
  st.mapLabels = selLabels;
  let routeText = '';
  if (nav && nav.goal && here && goalZone !== here && nav.line) {
    const hereName = (zones.find((z) => z.id === here) || {}).name || here;
    if (cur === here) routeText = nav.line;
    else if (cur === goalZone) routeText = `You are in ${hereName}. ${nav.line}`;
  }
  st.mapRoute = routeText;
  let exit = null;
  if (exitHere) {
    const [ex, ey] = at(exitHere.x, exitHere.y);
    const ang = SIDE_ANGLE[exitHere.side] || 0;
    const back = 12 + Math.round(pulse * 4);
    exit = { x: Math.max(8, Math.min(box.w - 8, ex - box.x - Math.cos(ang) * back)), y: Math.max(8, Math.min(box.h - 8, ey - box.y - Math.sin(ang) * back)), ang };
  }
  const markers = m.minimap && m.minimap.zone === cur ? m.minimap.markers.filter((k) => k.kind !== 'foe') : [];
  const areas = ((m.minimap && m.minimap.areas) || []).filter((a) => a.zone === cur);
  // the box on the HUD layer (drawMap runs inside centred(): add its translation)
  const tf = ctx.getTransform ? ctx.getTransform() : null;
  const ox = tf ? tf.e : 0, oy = tf ? tf.f : 0;
  env.mapPass.world({
    key: `${cur}|${ppt}|${sx}|${sy}|${box.w}x${box.h}|${flights.filter((f) => f.known).length}|${labels.length}`,
    x: box.x + ox, y: box.y + oy, w: box.w, h: box.h, zone: cur, ppt, sx: sx + 0, sy: sy + 0, tx0: v.tx0, ty0: v.ty0, tw: v.tw, th: v.th,
    labels, flights, doors, markers, areas, look: { sel: sel ? sel.id : null, pulse }, exit,
  });
  // Whole world / Your area (only when the zone is bigger than the window at the minimap's scale)
  if (v.canZoom) {
    const label = v.whole ? 'Your area' : 'Whole world';
    const bw = g.textW(label) + 14, bh = Math.max(g.ls(16), env.L.minHit || 0);
    const bx = area.x + area.w - bw - 3, by = area.y + 3;
    g.window(ctx, bx, by, bw, Math.min(bh, g.ls(18)), 'thin', 'slate', 0.95);
    g.text(ctx, label, bx + bw / 2, by + Math.floor((Math.min(bh, g.ls(18)) - g.lh) / 2), 'cream', { align: 'center' });
    regions.push({ rect: { x: bx, y: by, w: bw, h: bh }, kind: 'button', label: 'map_zoom', tip: { title: label, sub: v.whole ? 'Zoom in on where you are.' : 'Show the whole map.' },
      on: () => { st.mapWhole = !v.whole; st.mapCenter = null; } });
  }
  if (routeText) {
    const t = g.clip(routeText, area.w - 12);
    const tw = g.textW(t);
    const bx = area.x + Math.floor((area.w - tw) / 2);
    g.window(ctx, bx - 6, r.y + r.h - g.ls(21), tw + 12, g.ls(16), 'thin', 'ember', 0.95);
    g.text(ctx, t, bx, r.y + r.h - g.ls(19) + (g.big ? 1 : 0), 'cream');
  } else {
    const meHere = markers.find((k) => k.kind === 'me');
    g.text(ctx, g.clip(meHere ? 'White arrow: you.  Gold !: a quest.  Gold ?: hand it in.  Bright circle: the quest you picked.' : 'You are not in this zone.  Bright circle: the quest you picked.', r.x + r.w - 8 - area.x), area.x + area.w / 2, r.y + r.h - g.ls(18), 'gray', { align: 'center' });
  }
}

// ---------------------------------------------------------------- options / game menu

/** Options title bar, right to left from the close box: Invite a friend (src/net/dropin.js; starts hosting when solo),
 *  Replays (wave 8), Chronicle (wave 9), Use my phone (wave 9 second). Region labels stay fixed (the gates tap them);
 *  when the full words would reach the "Options" title, every button shows its short word instead. */
function titleButtons(ctx, env, r, regions, act) {
  const { g } = env;
  const list = [];
  if (act.canInvite && act.canInvite()) list.push({ text: 'Invite a friend', short: 'Invite', skin: 'forest', on: () => act.invite(), label: 'Invite a friend' });
  if (act.replays) list.push({ text: 'Replays', short: 'Replays', skin: 'violet', on: () => act.replays(), label: 'replays' });
  if (act.chronicle) list.push({ text: 'Chronicle', short: 'Story', skin: 'ember', on: () => act.chronicle(), label: 'chronicle' });
  if (act.usePhone && act.canPhone && act.canPhone()) list.push({ text: 'Use my phone', short: 'Phone', skin: 'blue', on: () => act.usePhone(), label: 'use_phone', id: 'second-open' });
  if (!list.length) return;
  const s = Math.max(16, env.L.minHit || 0), h = Math.min(s, 22), y = r.y + 4, right = r.x + r.w - 10 - s;
  const titleEnd = r.x + 12 + g.textW('Options') + 8;
  const span = (key) => list.reduce((n, b) => n + g.textW(b[key]) + 18, 0);
  const key = right - span('text') + 4 < titleEnd ? 'short' : 'text';
  let x1 = right;
  for (const b of list) {
    const lab = b[key], w = g.textW(lab) + 14, x = x1 - w;
    g.window(ctx, x, y, w, h, 'thin', b.skin, 0.95);
    g.text(ctx, lab, x + Math.floor(w / 2), y + Math.floor(h / 2) - g.mid(6), 'cream', { align: 'center' });
    regions.push({ rect: { x, y, w, h }, kind: 'button', ...(b.id ? { id: b.id } : {}), on: b.on, label: b.label });
    x1 = x - 4;
  }
}

export function drawOptions(ctx, env, m, st, regions, act, options) {
  const { g } = env;
  const r = { x: 60, y: 24, w: 520, h: 316 };
  frame(ctx, env, r, 'Options', regions, act, 'menu');
  if (!env.preplay) titleButtons(ctx, env, r, regions, act);   // (not on the welcome screen: no hero in the world) Invite a friend (wave 8), Replays (wave 8), Chronicle and Use my phone (wave 9)
  const touch = env.L.touch, big = g.big;
  const short = touch || big;                  // short labels where room is short (a phone, or Large text)
  // key rows: 11 px a row on desktop (22 rows with 8 skill keys); Large text scrolls the list. A phone has no key list.
  const rowH = touch ? Math.max(12, env.L.minHit || 0) : g.ls(11);
  const bh = Math.max(g.ls(16), env.L.minHit || 0);
  const by = r.y + r.h - bh - 8;
  // ---- left: key bindings (desktop) or a pointer to the phone controls in Help
  const kx = r.x + 10, kw = 250;
  if (!touch) {
    g.text(ctx, 'Key bindings', kx, r.y + 26, 'gold');
    g.text(ctx, big ? 'click, press a key' : 'click, then press a key', kx + kw, r.y + 26, 'dim', { align: 'right' });
    const binds = effectiveBinds(options.binds);
    const top = r.y + 40 + (big ? 4 : 0), vis = Math.min(ACTIONS.length, Math.floor((r.y + r.h - 26 - top) / rowH));   // wave 7: 25 keys scroll at Normal too
    const maxOff = ACTIONS.length - vis;
    st.keyScroll = Math.max(0, Math.min(maxOff, st.keyScroll || 0));
    if (maxOff > 0) regions.push({ rect: { x: kx - 2, y: top - 1, w: kw + 4, h: vis * rowH }, kind: 'window', id: 'key_scroll', scroll: (d) => { st.keyScroll = Math.max(0, Math.min(maxOff, (st.keyScroll || 0) + d)); } });
    ACTIONS.slice(st.keyScroll, st.keyScroll + vis).forEach((a, i) => {
      const y = top + i * rowH;
      const waiting = st.rebinding === a.id;
      if (waiting) g.rect(ctx, kx - 2, y - 1, kw + 4, rowH, 'rgba(104,145,217,0.45)');
      g.text(ctx, a.label, kx, y, 'white');
      g.text(ctx, waiting ? 'press a key' : keyLabel(binds[a.id]), kx + kw, y, waiting ? 'orange' : a.fixed ? 'dim' : 'gold', { align: 'right' });
      if (!a.fixed) regions.push({ rect: { x: kx - 2, y: y - 1, w: kw + 4, h: rowH }, kind: 'button', on: () => { st.rebinding = waiting ? null : a.id; } });
    });
    const ky = top + vis * rowH + 4;
    g.text(ctx, 'Reset keys', kx, ky, 'cream');
    regions.push({ rect: { x: kx - 2, y: ky - 1, w: g.textW('Reset keys') + 8, h: g.ls(12) }, kind: 'button', on: () => act.setOption('binds', {}) });
    if (maxOff > 0) g.text(ctx, `${st.keyScroll + 1}-${st.keyScroll + vis} of ${ACTIONS.length}`, kx + kw, ky, 'dim', { align: 'right' });
  }   // a phone: the pointer to the phone controls in Help is drawn after the rows, where there is room (wave 6)
  // ---- right: sound and view
  const ox = r.x + 280, ow = 228;
  let y = r.y + 26;
  if (!touch) { g.text(ctx, 'Sound and view', ox, y, 'gold'); y += g.ls(16); }   // a phone needs the height for its rows
  // a phone (and Large text on desktop): each slider is one row, the label and percent left and the bar right
  const slider = (label, shortLabel, key) => {
    const pct = `${Math.round(options[key] * 100)}%`;
    const lw = touch ? 64 : big ? 116 : 0, sh = touch ? rowH : big ? 18 : rowH;
    let sy;
    if (touch) { sy = y; g.text(ctx, shortLabel, ox, y + Math.floor(rowH / 2) - g.ls(12), 'white'); g.text(ctx, pct, ox, y + Math.floor(rowH / 2) + 1, 'gold'); }
    else if (big) { sy = y; g.text(ctx, `${shortLabel} ${pct}`, ox, y + 1, 'white'); }
    else { g.text(ctx, label, ox, y, 'white'); g.text(ctx, pct, ox + ow, y, 'gold', { align: 'right' }); sy = y + 13; }
    const sx = ox + lw, sw = ow - lw;
    g.gauge(ctx, sx, sy + Math.floor(sh / 2) - 3, sw, options[key], 'mp');
    const knobX = sx + Math.round(options[key] * (sw - 4));
    g.rect(ctx, knobX, sy + Math.floor(sh / 2) - 5, 4, 9, '#fff7d6');
    const rect = { x: sx, y: sy, w: sw, h: sh };
    regions.push({ rect, kind: 'slider', drag: (hx) => act.setOption(key, Math.round(Math.max(0, Math.min(1, (hx - sx) / sw)) * 20) / 20) });
    y = sy + sh + (touch ? 4 : big ? 3 : 6);
  };
  slider('Music volume', 'Music', 'music');
  slider('Effects volume', 'Sounds', 'sfx');
  // the choices: one row each, the label beside its buttons. They fill the free column first (a phone's left column,
  // under the Help line) and flow on into the right column under the sliders, so a new row never meets the bottom
  // buttons (Scott's phone, 2026-11-24). Desktop: the right column, under the sliders.
  const cols = touch
    ? [{ x: kx, w: 250, y: r.y + 26, bottom: r.y + r.h - 4 }, { x: ox, w: ow, y: y - 4, bottom: by - 4 }]
    : [{ x: ox, w: ow, y: y + (big ? 2 : 0), bottom: by - 3 }];
  const ch = touch ? rowH : big ? 18 : 11, gap = touch ? 2 : big ? 3 : 5;
  const rows = [];
  const choice = (label, key, vals, names, inline = false, cur = options[key]) => { rows.push({ label, key, vals, names, cur }); };   // eslint-disable-line no-unused-vars
  // lay the rows out once they are all known: each column's labels get the width of its longest one
  const placeChoices = () => {
    let col = 0, cy = cols[0].y;
    for (const row of rows) {
      if (cy + ch > cols[col].bottom && col + 1 < cols.length) { col++; cy = cols[col].y; }
      row.col = col; row.y = cy; cy += ch + gap;
    }
    cols.forEach((c, ci) => {
      const mine = rows.filter((o) => o.col === ci);
      const lw = Math.min(Math.floor(c.w * 0.45), Math.max(40, ...mine.map((o) => g.textW(o.label) + 8)));
      for (const { label, key, vals, names, cur, y: ry } of mine) {
        g.text(ctx, g.clip(label, lw - 4), c.x, ry + Math.floor(ch / 2) - g.mid(6), 'white');
        const bw = Math.floor((c.w - lw - (vals.length - 1) * 4) / vals.length);
        vals.forEach((v, i) => {
          const x = c.x + lw + i * (bw + 4), on = cur === v;
          g.window(ctx, x, ry, bw, ch, 'thin', on ? 'ember' : 'slate', 0.95);
          g.text(ctx, g.clip(names[i], bw - 2), x + bw / 2, ry + Math.floor(ch / 2) - g.mid(6), on ? 'cream' : 'gray', { align: 'center' });
          regions.push({ rect: { x, y: ry, w: bw, h: ch }, kind: 'button', label: `opt:${key}:${v}`, on: () => act.setOption(key, v) });
        });
      }
    });
  };
  choice('Zoom', 'zoom', [1, 1.5, 2], ['1x', '1.5x', '2x']);
  choice('Effects', 'fx', ['low', 'high'], ['Low', 'High']);
  choice(short ? 'Shake, hit stop' : 'Screen shake and hit stop', 'shake', [true, false], ['On', 'Off']);   // wave 6 combat feel: Off turns both off
  choice('Window style', 'skin', ['lantern', 'classic'], ['Lantern', 'Classic']);                  // wave 6 uiskin (Classic for one wave)
  choice('Text size', 'text', ['normal', 'large'], ['Normal', 'Large'], false, g.textSize);       // wave 6 uiskin (Large by default on a phone)
  choice(short ? 'Graphics' : 'Graphics (reloads)', 'r3d', [false, true], ['2D', short ? '3D' : '3D preview'], touch);
  choice(short ? 'Camera' : 'Camera (3D)', 'cam', ['fixed', 'horizon'], ['Fixed', 'Horizon'], touch);   // wave 5b horizon camera (an option)
  choice(short ? 'Synth' : 'Synth sound', 'synth', [true, false], ['On', 'Off'], touch);   // wave 5b synth sound (off = today's sounds)
  choice(short ? 'Scenes' : 'Quest scenes', 'questScenes', [true, false], ['On', 'Off']);   // wave 6 quest scenes (off = today's npc window)
  placeChoices();               // new choice(...) rows go above this line
  if (touch && !rows.some((o) => o.col === 1) && cols[1].y + g.lh <= by - 4) g.text(ctx, g.clip('Phone controls: see Help.', ow), ox, cols[1].y + 2, 'dim');
  // ---- bottom buttons
  const btn = (x, w, label, on) => {
    g.window(ctx, x, by, w, bh, 'thin', 'blue', 0.95);
    g.text(ctx, label, x + w / 2, by + Math.floor(bh / 2) - g.mid(6), 'cream', { align: 'center' });
    regions.push({ rect: { x, y: by, w, h: bh }, kind: 'button', on, label });
  };
  if (env.preplay) { btn(ox, big ? 90 : 110, 'Back', () => act.close('menu')); return; }   // the welcome screen's Options
  if (big) { btn(ox, 90, 'Resume', () => act.close('menu')); btn(ox + 96, ow - 96, 'Character select', () => act.logout()); return; }
  btn(ox, 110, 'Resume', () => act.close('menu'));
  btn(ox + 118, 110, 'Character select', () => act.logout());
}

export { SLOT_ICON, classInfo, abilityInfo, resourceLabel };

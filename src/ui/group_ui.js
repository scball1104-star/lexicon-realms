// Group play on the HUD (group play basics, 2026-11-22; brief and stills: D:\LQOnline\group_ui\BRIEF.md).
// Pure drawing from the HUD model: each function draws one piece and pushes hit regions { rect, kind, on, tip } like the
// menus do. The sim owns every rule (src/sim/party.js, src/sim/trade.js); this file only shows the HUD block's `group`
// part and sends commands.
//
//   targetCast(g, ctx, r, cast)                the foe's cast bar under the target frame, with the interrupt mark
//   threatTag(g, ctx, r, threat, me)           "Threat 92%" or "It is on you" beside the target frame
//   buffRow(g, ctx, x, y, auras, regions, max) your own buffs, then your debuffs (red edge), seconds left under each
//   partyExtras(g, ctx, r, u, grp, regions, act)  a party frame's extras: dead, the Rez button, a friend's rez cast
//   deathPanel(g, ctx, L, grp, regions, act)   Release to lantern or Wait for a rez
//   readyCheck(g, ctx, L, grp, regions, act)   the Yes / No popup and everyone's answers
//   shareOffers(g, ctx, L, grp, regions, act)  a quest a friend shared: Accept or Decline
//   tradeWindow(g, ctx, env, m, grp, st, regions, act)   the trade window (rows on desktop, a grid on a phone)
import { itemInfo, RARITY_COLOR } from './gamedata.js';

const RAR = { ...RARITY_COLOR, magic: '#6f8cff', set: '#3cdc6a', epic: RARITY_COLOR.epic || '#b061ff' };
export const BIND_TEXT = { pickup: 'Binds when picked up', equip: 'Binds when equipped', soulbound: 'Soulbound' };
const mmss = (s) => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function button(g, ctx, regions, x, y, w, h, label, scheme, on, opts = {}) {
  g.window(ctx, x, y, w, h, 'thin', scheme, opts.dim ? 0.55 : 0.97);
  g.text(ctx, g.clip(label, w - 6), x + Math.floor(w / 2), y + Math.floor(h / 2) - g.mid(6), opts.color || (opts.dim ? 'dim' : 'cream'), { align: 'center' });
  if (on) regions.push({ rect: { x, y, w, h }, kind: 'button', label: opts.label || `grp:${label.toLowerCase()}`, on, ...(opts.tip ? { tip: opts.tip } : {}) });
}

/** A small lightning bolt (the interrupt mark, 7 x 9) or a padlock (cannot interrupt, 7 x 8). */
function boltMark(ctx, x, y, color = '#ffd23a') {
  const rows = ['0001110', '0011100', '0111000', '1111110', '0011100', '0111000', '0110000', '1100000', '1000000'];
  ctx.fillStyle = '#14101e'; ctx.fillRect(x - 1, y - 1, 9, 11);
  rows.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === '1') { ctx.fillStyle = color; ctx.fillRect(x + i, y + j, 1, 1); } });
}
function lockMark(ctx, x, y) {
  const rows = ['0011100', '0100010', '0100010', '1111111', '1110111', '1110111', '1111111'];
  rows.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === '1') { ctx.fillStyle = j < 3 ? '#c8c4d0' : '#8e8997'; ctx.fillRect(x + i, y + j, 1, 1); } });
}

/**
 * The target's cast bar (GAP B7), under the target frame. cast: the sim's castView { name, icon, frac, left, kind,
 * interruptible }. Interruptible: an ember frame, the gold bolt and "Interrupt"; not: a slate frame, the lock and
 * "Cannot interrupt". Returns the height used.
 */
export function targetCast(g, ctx, r, c) {
  if (!c) return 0;
  const h = 18, can = c.interruptible !== false;
  g.window(ctx, r.x, r.y, r.w, h, 'thin', can ? 'ember' : 'slate', 0.95);
  g.iconIn(ctx, c.icon && g.frame(c.icon) ? c.icon : can ? 'icon_magic' : 'icon_shield', r.x + 2, r.y + 1, 16, 16);
  const tag = can ? 'Interrupt' : 'Cannot interrupt';
  const tagW = g.textW(tag) + (can ? 12 : 11);
  g.text(ctx, g.clip(c.name || '', r.w - 22 - tagW - 4), r.x + 19, r.y + 1, 'cream');
  if (can) { boltMark(ctx, r.x + r.w - tagW - 3, r.y + 2); g.text(ctx, tag, r.x + r.w - 5, r.y + 1, 'gold', { align: 'right' }); }
  else { lockMark(ctx, r.x + r.w - tagW - 3, r.y + 3); g.text(ctx, tag, r.x + r.w - 5, r.y + 1, 'gray', { align: 'right' }); }
  const frac = c.kind === 'channel' ? 1 - (c.frac || 0) : c.frac || 0;
  g.gauge(ctx, r.x + 19, r.y + 11, r.w - 24, frac, 'atb', true);
  return h;
}

/**
 * The threat warning (GAP B7), beside the target frame. threat: the sim's threatView { pct, top, aggro }. me: { tank }.
 * A damage dealer or healer at 80% or more of the top sees orange "Threat 92%"; one the foe is hitting sees red "It is on
 * you". A tank (the Warden) who lost the foe sees "Lost it: taunt". Nothing when calm.
 */
export function threatWarning(threat, me = {}) {
  if (!threat || !threat.list || !threat.list.length) return null;
  if (threat.top && !me.tank) return { text: 'It is on you', color: 'red', scheme: 'crimson' };
  if (!threat.top && me.tank && threat.aggro != null) return { text: 'Lost it: taunt', color: 'orange', scheme: 'ember' };
  if (!threat.top && threat.pct >= 80) return { text: `Threat ${threat.pct}%`, color: 'orange', scheme: 'ember' };
  return null;
}
export function threatTag(g, ctx, x, y, threat, me) {
  const w0 = threatWarning(threat, me);
  if (!w0) return 0;
  const w = g.textW(w0.text) + 12;
  g.window(ctx, x, y, w, 15, 'thin', w0.scheme, 0.95);
  g.text(ctx, w0.text, x + 6, y + 1, w0.color);
  return w;
}

/**
 * Your own buffs and debuffs (GAP B8): a row of 14 px icons, buffs first, then debuffs with a red edge; whole seconds
 * left under each (none for a lasting one). Hover or long-press shows the name. Returns the row's rect.
 */
export function buffRow(g, ctx, x, y, auras, regions, max = 12, size = 14) {
  const list = (auras || []).filter((a) => !(a.flags || []).includes('hidden'));
  const buffs = list.filter((a) => a.kind !== 'debuff'), debuffs = list.filter((a) => a.kind === 'debuff');
  let cx = x;
  const draw = (a, bad) => {
    g.window(ctx, cx, y, size, size, 'thin', bad ? 'crimson' : 'blue', 0.95);
    const ic = a.icon || a.id;
    const src = a.src && a.ab ? a.ab : null;
    const pick = [ic, src, `icon_${ic}`].find((n) => n && g.frame(n));
    if (pick) g.iconIn(ctx, pick, cx, y, size, size); else if (g.frame(`st8_${ic}`)) g.icon(ctx, `st8_${ic}`, cx + 3, y + 3);
    else g.iconIn(ctx, bad ? 'icon_poison' : 'icon_protect', cx, y, size, size);
    if (bad) g.outline(ctx, cx, y, cx + size - 1, y + size - 1, '#e0503a');
    if (a.stacks > 1) g.num(ctx, String(a.stacks), cx + size, y + size - 9, 'white', false, 'right');
    if (a.left != null) { const s = a.left >= 60 ? `${Math.ceil(a.left / 60)}m` : String(Math.ceil(a.left)); g.text(ctx, s, cx + size / 2, y + size - 1, a.left <= 5 ? 'orange' : 'cream', { align: 'center' }); }
    regions.push({ rect: { x: cx, y, w: size, h: size + 9 }, kind: 'aura', id: a.id,
      tip: { title: a.name || a.id, titleColor: bad ? 'red' : 'gold', sub: bad ? 'Debuff' : 'Buff', body: a.left != null ? `${Math.ceil(a.left)} sec left.` : 'Lasts until it is used or cancelled.' } });
    cx += size + 2;
  };
  for (const a of buffs.slice(0, max)) draw(a, false);
  if (buffs.length && debuffs.length) cx += 4;
  for (const a of debuffs.slice(0, max)) draw(a, true);
  return { x, y, w: cx - x, h: list.length ? size + 9 : 0 };
}

/** A party frame's extras: a dead friend (grey name, "Dead"), the Rez button when you can rez them, a rez on its way. */
export function partyExtras(g, ctx, r, u, grp, regions, act, touch = false) {
  const p = ((grp && grp.party) || []).find((x) => x.id === u.id) || null;
  if (p && p.far && !u.dead) { g.scrim(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 120); }
  if (!u.dead) return;
  g.scrim(ctx, r.x + 20, r.y + (touch ? 12 : 13), r.w - 26, touch ? 7 : 12, 200);
  g.text(ctx, p && p.rezBy ? `Rez ${Math.ceil(p.rezLeft || 0)}s` : p && p.released ? 'Released' : 'Dead', r.x + 22, r.y + (touch ? 9 : 12), p && p.rezBy ? 'green' : 'red');
  const can = grp && (grp.canRez || grp.ash > 0) && p && !p.released && !p.rezBy;
  if (can && act) {
    const bw = 34, bh = Math.max(14, touch ? r.h - 2 : 14);
    const bx = r.x + r.w - bw - 4, by = touch ? r.y + 1 : r.y + 14;
    button(g, ctx, regions, bx, by, bw, bh, 'Rez', 'forest', () => act.send({ t: 'rez', id: u.id, item: !grp.canRez }), { label: `grp:rez:${u.id}`,
      tip: { title: grp.canRez ? 'Rekindle' : 'Lantern-ash', sub: grp.canRez ? '10 sec cast, out of combat' : `Uses 1 lantern-ash (${grp.ash} left), 10 sec`, body: `Wake ${u.name} where they fell at 35% health.` } });
  }
}

/** The death panel (group only): Release to lantern, or Wait for a rez (up to 5 minutes), with a friend's rez on its way. */
export function deathPanel(g, ctx, L, grp, regions, act) {
  const d = grp && grp.death;
  if (!d) return null;
  const w = 248, bh = Math.max(20, L.minHit || 0), h = 58 + bh + (d.rez ? 22 : 0);
  const x = Math.floor((L.W - w) / 2), y = Math.floor(L.H * 0.3);
  g.window(ctx, x, y, w, h, 'std', 'crimson', 0.96);
  regions.push({ rect: { x, y, w, h }, kind: 'window', id: 'death' });
  g.text(ctx, 'You have fallen', x + w / 2, y + 5, 'gold', { large: true, align: 'center' });
  const line = d.choice === 'wait' ? `Waiting for a rez. ${mmss(d.waitLeft)} left, then you wake at the lantern.`
    : `Wake at your lantern now, or wait here up to ${mmss(d.waitLeft)} for a friend.`;
  g.wrap(line, w - 20).slice(0, 2).forEach((ln, i) => g.text(ctx, ln, x + w / 2, y + 24 + i * g.lh, 'cream', { align: 'center' }));
  let yy = y + 50;
  if (d.rez) {
    g.text(ctx, g.clip(`${d.rez.name} is casting ${d.rez.spell} on you`, w - 20), x + 10, yy, 'green');
    g.gauge(ctx, x + 10, yy + 12, w - 20, d.rez.total ? 1 - d.rez.left / d.rez.total : 0, 'exp', true);
    yy += 22;
  }
  const bw = Math.floor((w - 26) / 2);
  button(g, ctx, regions, x + 9, yy, bw, bh, 'Release to lantern', 'slate', () => act.send({ t: 'release' }), { label: 'grp:release' });
  button(g, ctx, regions, x + 17 + bw, yy, bw, bh, d.choice === 'wait' ? 'Waiting...' : 'Wait for a rez', 'forest', d.choice === 'wait' ? null : () => act.send({ t: 'death_wait' }),
    { label: 'grp:wait', dim: d.choice === 'wait' });
  return { x, y, w, h };
}

// wave 10 dflow: a dropped friend's kept seat (src/sim/party.js seatSec), in plain words. DRAFT for Scott.
export function runSeatLine(st) { return `${st.name} lost the connection. Their seat is kept for ${mmss(st.left)}: the same link brings them back in here. Foes stay set for them until then.`; }

/** The ready check popup: who asked, Yes / No (until you answer), and everyone's answer as it comes in. */
export function readyCheck(g, ctx, L, grp, regions, act) {
  const rc = grp && grp.ready;
  if (!rc) return null;
  const bh = Math.max(18, L.minHit || 0);
  // wave 10 dflow: inside a dungeon the check names the next boss, shows each hero's level here and any kept seat
  const seats = (grp.seats || []).map((st) => runSeatLine(st));
  const seatLines = seats.flatMap((t) => g.wrap(t, (rc.boss ? 236 : 200) - 20));
  const w = rc.boss || seats.length ? 240 : 200, rows = rc.answers.length + (grp.seats || []).length;
  const h = 40 + rows * 11 + (seatLines.length ? seatLines.length * g.lh + 4 : 0) + (rc.mine == null && !rc.done ? bh + 6 : 0);
  const x = Math.floor((L.W - w) / 2), y = L.touch ? Math.floor(L.H * 0.22) : 96;
  g.window(ctx, x, y, w, h, 'std', 'blue', 0.97);
  regions.push({ rect: { x, y, w, h }, kind: 'window', id: 'ready' });
  const title = rc.boss && !rc.done ? `Ready for ${rc.boss.name}?` : 'Ready check';
  g.text(ctx, rc.done ? (rc.allYes ? 'Everyone is ready' : 'Not everyone is ready') : g.clip(title, w - 12, true), x + w / 2, y + 4, rc.done && !rc.allYes ? 'orange' : 'gold', { large: true, align: 'center' });
  g.text(ctx, rc.done ? '' : `${rc.byName} asks. ${Math.ceil(rc.left)} sec`, x + w / 2, y + 22, 'gray', { align: 'center' });
  let yy = y + 34;
  for (const a of rc.answers) {
    g.text(ctx, g.clip(a.name, 80), x + 12, yy, 'white');
    if (a.sync) g.text(ctx, a.sync === 'down' ? `plays as ${a.level}` : `raised to ${a.level}`, x + 96, yy, 'orange');
    else if (rc.boss && a.level) g.text(ctx, String(a.level), x + 96, yy, 'gray');
    g.text(ctx, a.answer === true ? 'Ready' : a.answer === false ? 'Not ready' : '...', x + w - 12, yy, a.answer === true ? 'green' : a.answer === false ? 'red' : 'dim', { align: 'right' });
    yy += g.lh;
  }
  for (const st of grp.seats || []) {
    g.text(ctx, g.clip(st.name, 80), x + 12, yy, 'dim');
    g.text(ctx, `Seat kept ${mmss(st.left)}`, x + w - 12, yy, 'orange', { align: 'right' });
    yy += g.lh;
  }
  if (seatLines.length) { yy += 2; for (const t of seatLines) { g.text(ctx, t, x + 10, yy, 'orange'); yy += g.lh; } yy += 2; }
  if (rc.mine == null && !rc.done) {
    const bw = Math.floor((w - 26) / 2);
    button(g, ctx, regions, x + 9, yy + 4, bw, bh, 'Ready', 'forest', () => act.send({ t: 'ready_answer', yes: true }), { label: 'grp:ready_yes' });
    button(g, ctx, regions, x + 17 + bw, yy + 4, bw, bh, 'Not ready', 'crimson', () => act.send({ t: 'ready_answer', yes: false }), { label: 'grp:ready_no' });
  }
  return { x, y, w, h };
}

/** A quest a friend shared with you: Accept or Decline (the newest one; it waits a minute). */
export function shareOffers(g, ctx, L, grp, regions, act) {
  const s = grp && grp.shares && grp.shares[0];
  if (!s) return null;
  const bh = Math.max(18, L.minHit || 0), w = 230, h = 42 + bh;
  const x = Math.floor((L.W - w) / 2), y = L.touch ? Math.floor(L.H * 0.22) : 150;
  g.window(ctx, x, y, w, h, 'std', 'blue', 0.97);
  regions.push({ rect: { x, y, w, h }, kind: 'window', id: 'share' });
  g.text(ctx, g.clip(`${s.fromName} shares a quest`, w - 16), x + w / 2, y + 4, 'gold', { align: 'center' });
  g.text(ctx, g.clip(s.name, w - 16), x + w / 2, y + 18, 'cream', { align: 'center' });
  const bw = Math.floor((w - 26) / 2), by = y + 34;
  button(g, ctx, regions, x + 9, by, bw, bh, 'Accept', 'forest', () => act.send({ t: 'quest_share_accept', quest: s.quest }), { label: 'grp:share_accept' });
  button(g, ctx, regions, x + 17 + bw, by, bw, bh, 'Decline', 'slate', () => act.send({ t: 'quest_share_decline', quest: s.quest }), { label: 'grp:share_decline' });
  return { x, y, w, h };
}

// ------------------------------------------------------------------------------------------------ trade
function bindOfView(it) { return it && (it.soulbound ? 'soulbound' : it.bind || null); }
function slotBox(g, ctx, r, it, dim = false) {
  const i = it ? itemInfo(it) : null;
  g.window(ctx, r.x, r.y, r.w, r.h, 'thin', i ? 'blue' : 'slate', i ? (dim ? 0.5 : 0.95) : 0.6);
  if (!i) return;
  g.iconIn(ctx, i.icon || 'icon_bag', r.x, r.y, r.w, r.h, dim ? 0.35 : 1);
  if (i.rarity && i.rarity !== 'common') g.outline(ctx, r.x + 1, r.y + 1, r.x + r.w - 2, r.y + r.h - 2, RAR[i.rarity] || RAR.common);
  if ((it.qty || 1) > 1) g.num(ctx, String(it.qty), r.x + r.w - 1, r.y + r.h - 12, 'white', false, 'right');
  if (dim) lockMark(ctx, r.x + r.w - 9, r.y + 2);
}
const itemTip = (it, foot, footColor = 'gray') => {
  const i = itemInfo(it) || {};
  const b = bindOfView(it);
  return { title: i.name || it.item, titleColor: RAR[i.rarity] || RAR.common, sub: [i.rarity ? (i.rarity[0].toUpperCase() + i.rarity.slice(1)) : '', b ? BIND_TEXT[b] : ''].filter(Boolean).join('  '),
    body: i.text || '', foot, footColor };
};

/**
 * The trade window (src/sim/trade.js): your six slots and gold on the left, theirs on the right, each side's Ready, and
 * your tradeable bag items along the bottom (click to offer; a bound item is greyed with a lock and says why it cannot
 * go). Any change clears both Ready marks; the swap happens when both sides are Ready.
 * Desktop: rows with names. Phone (L.touch): a 3 x 2 grid per side at touch size; tap shows the item's card.
 */
export function tradeWindow(g, ctx, env, m, grp, st, regions, act) {
  const t = grp && grp.trade;
  if (!t) return null;
  const L = env.L, touch = !!L.touch;
  const P = Math.max(touch ? 26 : 20, touch ? L.minHit || 0 : 0);
  const rowH = touch ? P : 18, bh = Math.max(18, L.minHit || 0);
  const sideW = touch ? 3 * P + 8 : 176;
  const w = 2 * sideW + 36;
  const offerH = touch ? 2 * P + 4 : 6 * rowH;
  const bagN = (t.bag || []).length;
  const bagPitch = touch ? P : 20, bagCols = Math.floor((w - 20) / bagPitch), bagRows = touch ? 1 : Math.min(2, Math.max(1, Math.ceil(bagN / bagCols)));
  const h = 26 + 14 + offerH + 6 + 16 + 2 + 14 + bagRows * bagPitch + 2 + 12 + bh + 8;
  const x = Math.floor((640 - w) / 2), y = Math.max(4, Math.floor((360 - h) / 2) - 6);
  g.window(ctx, x, y, w, h, 'std', 'blue', 0.97);
  regions.push({ rect: { x, y, w, h }, kind: 'window', id: 'trade' });
  g.text(ctx, g.clip(`Trade with ${t.name}`, w - 40), x + 9, y + 5, 'gold', { large: true });
  const s = Math.max(16, L.minHit || 0);
  g.window(ctx, x + w - 20, y + 5, 14, 14, 'thin', 'crimson', 0.95);
  g.text(ctx, 'x', x + w - 13, y + 5, 'cream', { align: 'center' });
  regions.push({ rect: { x: x + w - 4 - s, y: y + 3, w: s, h: Math.min(s, 22) }, kind: 'button', label: 'trade:close', on: () => act.send({ t: 'trade_cancel' }), tip: { title: 'Cancel the trade' } });
  const side = (sx, title, who, mine) => {
    let yy = y + 26;
    g.text(ctx, g.clip(title, sideW - 50), sx, yy, mine ? 'cream' : 'blue');
    g.text(ctx, who.ready ? 'Ready' : 'Not ready', sx + sideW, yy, who.ready ? 'green' : 'dim', { align: 'right' });
    yy += g.ls(14);
    const box = { x: sx - 3, y: yy - 2, w: sideW + 6, h: offerH + 4 };
    g.window(ctx, box.x, box.y, box.w, box.h, 'thin', who.ready ? 'forest' : 'slate', who.ready ? 0.75 : 0.4);
    for (let k = 0; k < 6; k++) {
      const it = who.items[k] || null;
      const r = touch ? { x: sx + (k % 3) * P + 2, y: yy + Math.floor(k / 3) * P, w: P - 2, h: P - 2 } : { x: sx, y: yy + k * rowH, w: 16, h: 16 };
      slotBox(g, ctx, r, it);
      if (!touch && it) {
        const i = itemInfo(it) || {};
        g.text(ctx, g.clip(`${i.name || it.item}${(it.qty || 1) > 1 ? ` x${it.qty}` : ''}`, sideW - 22), sx + 20, r.y + 2, RAR[i.rarity] || 'white');
      } else if (!touch && !it) g.text(ctx, '-', sx + 20, r.y + 2, 'dim');
      if (it) regions.push({ rect: touch ? r : { x: sx, y: r.y, w: sideW, h: rowH - 1 }, kind: 'button', label: `trade:${mine ? 'mine' : 'theirs'}:${k}`,
        tip: itemTip(it, mine ? (touch ? 'Tap again to take it back.' : 'Click to take it back.') : null),
        on: mine ? () => act.send({ t: 'trade_offer', remove: k }) : () => {} });
    }
    yy += offerH + 6;
    // a phone's narrow side has no room for the gold beside its buttons: your gold shows in your heading instead
    if (!(touch && mine)) { g.icon(ctx, 'icon_gold', sx, yy + 1); g.text(ctx, `${Number(who.gold || 0).toLocaleString('en-US')} gold`, sx + 14, yy, 'gold'); }
    if (mine) {
      const bw = touch ? Math.max(28, P) : 26;
      [['+1', 1], ['+10', 10], ['0', 0]].forEach(([lb, n], i) => {
        const bx = sx + sideW - (3 - i) * (bw + 2);
        button(g, ctx, regions, bx, yy - 1, bw, touch ? Math.max(14, Math.min(P, 18)) : 14, lb, 'slate', () => act.send({ t: 'trade_offer', gold: n === 0 ? 0 : Math.min(m.gold || 0, (who.gold || 0) + n) }),
          { label: `trade:gold:${lb}` });
      });
    }
    return yy + 16;
  };
  side(x + 12, touch ? `You: ${Number(t.mine.gold || 0).toLocaleString('en-US')}g` : `You (${m.player ? m.player.name : ''})`, t.mine, true);
  const yAfter = side(x + 24 + sideW, t.name, t.theirs, false);
  g.line(ctx, x + 18 + sideW, y + 26, x + 18 + sideW, yAfter - 4, 'rgba(255,247,214,0.25)');
  // your bags: what you can offer (a bound item greys out and says why)
  let yy = yAfter + 2;
  g.text(ctx, touch ? 'Your bags (tap to offer)' : 'Your bags (click to offer)', x + 10, yy, 'gray');
  yy += g.ls(14);
  const page = Math.max(0, st && st.tradePage ? st.tradePage : 0);
  const per = bagCols * bagRows;
  const list = (t.bag || []).slice(page * per, page * per + per);
  list.forEach((it, k) => {
    const r = { x: x + 10 + (k % bagCols) * bagPitch, y: yy + Math.floor(k / bagCols) * bagPitch, w: bagPitch - 2, h: bagPitch - 2 };
    const why = noTradeText(it.noTrade, (itemInfo(it) || {}).name || it.item);
    slotBox(g, ctx, r, it, !!why || !!it.offered);
    regions.push({ rect: r, kind: 'button', label: `trade:bag:${it.uid}`,
      tip: itemTip(it, why || (it.offered ? 'Already offered.' : touch ? 'Tap to offer it.' : 'Click to offer it.'), why ? 'red' : 'gray'),
      // a bound item goes to the sim too: it refuses and says why (the log keeps the line)
      on: () => { if (!it.offered) act.send({ t: 'trade_offer', uid: it.uid, item: it.item }); } });
  });
  if ((t.bag || []).length > per && st) {
    const pages = Math.ceil(t.bag.length / per);
    button(g, ctx, regions, x + w - 46, yy - 15, 36, 13, `${page + 1}/${pages}`, 'slate', () => { st.tradePage = (page + 1) % pages; }, { label: 'trade:page' });
  }
  yy += bagRows * bagPitch + 2;
  const note = typeof t.note === 'string' ? t.note : env.nameOf ? tradeNoteText(t.note, env.nameOf, m.player && m.player.id) : null;
  if (note) g.text(ctx, g.clip(note, w - 20), x + 10, yy, 'red');
  yy += g.ls(12);
  const bw = 96;
  button(g, ctx, regions, x + w / 2 - bw - 4, yy, bw, bh, t.mine.ready ? 'Not ready' : 'Ready', t.mine.ready ? 'slate' : 'forest', () => act.send({ t: 'trade_ready', ready: !t.mine.ready }), { label: 'trade:ready' });
  button(g, ctx, regions, x + w / 2 + 4, yy, bw, bh, 'Cancel', 'crimson', () => act.send({ t: 'trade_cancel' }), { label: 'trade:cancel' });
  return { x, y, w, h };
}

// ------------------------------------------------------------------------------------------------ words
const NO_TRADE = { pickup: 'binds when picked up: it cannot be traded.', soulbound: 'is soulbound (you wore it): it cannot be traded.', quest: 'is a quest item: it stays with you.' };
/** Why a bag item cannot be offered, in words (the sim sends a code). */
export function noTradeText(code, name) { return code && NO_TRADE[code] ? `${name} ${NO_TRADE[code]}` : null; }
const GROUP_FAIL = {
  combat: 'Not while in combat.', range: 'Too far away. Walk closer.', not_party: 'Only with someone in your party.', not_dead: 'They are not dead.',
  no_item: 'You need lantern-ash (1 gold at Pell or Penny).', busy: 'Busy right now.', taken: 'Someone is already waking them.', dead: 'Not while dead.',
  no_party: 'You are not in a party.', no_check: 'No ready check is open.', not_active: 'You do not have that quest.', no_share: 'That quest cannot be shared.',
  no_offer: 'That offer is gone.', bad_target: 'Pick a friend first.',
};
const TRADE_FAIL = {
  gold: 'Not enough gold.', full: 'Six items at most.', offered: 'Already offered.', gone: 'An offered item is no longer in the bags.', range: 'Stand closer to trade.',
  not_party: 'You can trade with your party only.', dead: 'Not while dead.', busy: 'They are trading with someone else.', no_trade: 'No trade is open.', no_item: 'That item is gone.',
};
const SHARE_WHY = { range: 'too far', dead: 'dead', offered: 'already offered', done: 'already done', active: 'already has it', ready: 'already has it', log_full: 'quest log full',
  bag_full: 'bags full', level: 'level too low', locked: 'not open to them yet', later: 'not open to them yet' };
/** A trade note from the sim ({ reason, item, who }) in words. */
export function tradeNoteText(note, nameOf, me) {
  if (!note) return null;
  const item = note.item ? nameOf.item(note.item) : 'That item';
  if (NO_TRADE[note.reason]) return noTradeText(note.reason, item);
  if (note.reason === 'bag_full') return note.who === me ? 'Your bags cannot hold this trade. Nothing moved.' : `${nameOf.unit(note.who)}'s bags cannot hold this trade. Nothing moved.`;
  return TRADE_FAIL[note.reason] || null;
}
/**
 * One group event for this hero, in words: { toast?, say?: [channel, text] } or null. nameOf: { unit(id), item(id), quest(id) }.
 */
export function groupEvent(ev, me, nameOf) {
  const U = (id) => nameOf.unit(id), I = (id) => nameOf.item(id);
  switch (ev.type) {
    case 'group_fail': return ev.id === me && GROUP_FAIL[ev.reason] ? { toast: GROUP_FAIL[ev.reason] } : null;
    case 'trade_fail': {
      if (ev.id !== me) return null;
      const t = tradeNoteText({ reason: ev.reason, item: ev.item, who: ev.who }, nameOf, me);
      return t ? { toast: t, say: ['error', t] } : null;
    }
    case 'trade':
      if (ev.id !== me) return null;
      if (ev.kind === 'open') return { say: ['system', `Trading with ${U(ev.with)}.`] };
      if (ev.kind === 'close') return ev.reason === 'cancel' ? { say: ['system', 'Trade cancelled.'] } : { toast: ev.reason === 'range' ? 'Trade closed: you walked apart.' : 'Trade closed.' };
      if (ev.kind === 'done') {
        const list = (xs, g) => [...xs.map((x) => `${I(x.item)}${x.qty > 1 ? ` x${x.qty}` : ''}`), ...(g ? [`${g} gold`] : [])].join(', ') || 'nothing';
        return { toast: 'Trade done.', say: ['loot', `Trade with ${U(ev.with)}: you gave ${list(ev.gave, ev.goldGave)}; you got ${list(ev.got, ev.goldGot)}.`] };
      }
      return null;
    case 'rez':
      if (ev.kind === 'start' && ev.id === me) return { toast: `${U(ev.src)} is waking you.` };
      if (ev.kind === 'done' && ev.id === me) return { toast: 'You wake where you fell.', say: ['system', `${U(ev.src)} woke you where you fell.`] };
      if (ev.kind === 'done' && ev.src === me) return { say: ['system', `You woke ${U(ev.id)}.`] };
      if (ev.kind === 'stop' && ev.src === me && ev.reason !== 'cancel') return { toast: ev.reason === 'move' ? 'Rez stopped: you moved.' : ev.reason === 'combat' ? 'Rez stopped: you are in combat.' : 'Rez stopped.' };
      return null;
    case 'death_wait':
      if (ev.id !== me) return null;
      return ev.kind === 'expired' ? { say: ['system', 'No rez came. You wake at the lantern.'] } : null;
    case 'quest_share':
      if (ev.id !== me) return null;
      if (ev.kind === 'offer') return { toast: `${U(ev.from)} shares a quest: ${nameOf.quest(ev.quest)}` };
      if (ev.kind === 'accepted') return { say: ['party', `${U(ev.by)} took ${nameOf.quest(ev.quest)}.`] };
      if (ev.kind === 'sent') {
        const ok = ev.results.filter((r) => r.ok).map((r) => r.name), no = ev.results.filter((r) => !r.ok).map((r) => `${r.name} (${SHARE_WHY[r.reason] || 'cannot take it'})`);
        const t = ev.results.length ? `Shared ${nameOf.quest(ev.quest)}${ok.length ? ` with ${ok.join(', ')}` : ''}.${no.length ? ` Not: ${no.join(', ')}.` : ''}` : 'Nobody in your party is near.';
        return { toast: ok.length ? 'Quest shared.' : 'Nobody could take it.', say: ['party', t] };
      }
      return null;
    case 'ready_check':
      if (ev.id !== me) return null;
      if (ev.kind === 'start' && ev.by !== me) return { say: ['party', `${U(ev.by)} asks: is everyone ready?`] };
      if (ev.kind === 'done') return { toast: ev.allYes ? 'Everyone is ready.' : 'Not everyone is ready.' };
      return null;
    default: return null;
  }
}

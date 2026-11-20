// The NPC window (integration wave, 2026-11-19): talk, quest offers and turn-ins, the class trainer, and vendors.
// Opened by the sim's `interact` event (trainer / vendor stock ride on it) and the quest module's `quest_dialog`.
// Pages: 'main' (greeting + choices), 'quest' (one quest: text, objectives, rewards, Accept / Complete), 'train',
// 'vendor' (stock, buyback; your bags open beside it and a right-click or tap on a bag item sells it).
// Every choice is a sim command (CONTRACTS 2.2): quest_accept, quest_turnin, train, respec, buy, sell, buyback.
import { frame, itemTooltip } from './menus.js';
import { drawTooltip } from './hud.js';
import { itemInfo, abilityInfo, abilityTooltip, classInfo, questInfo, npcInfo, RARITY_COLOR } from './gamedata.js';

export const DIALOG_RECT = { x: 60, y: 40, w: 330, h: 262 };
export const DIALOG_RECT_TOUCH = { x: 4, y: 36, w: 300, h: 300 };
/** The npc window on this HUD layer: the desktop rect, or on a phone the left of the screen under the menu buttons. */
export function dialogRectFor(L) {
  if (!L.touch) return { ...DIALOG_RECT };
  const y = (L.minHit || 24) + 6;
  return { x: 4, y, w: Math.min(340, (L.W || 640) - 4 * (L.minHit || 24) - 14), h: (L.H || 360) - y - 16 };
}

/** The dialog state from the sim's interact event (pure). */
export function dialogFromInteract(ev) {
  return { ent: ev.id, npc: ev.npc, trainer: ev.trainer || null, vendor: ev.vendor || null, offers: [], turnins: [], progress: [], soon: [],
    page: 'main', quest: null, choice: 0, scroll: 0, line: 0 };
}

export function drawDialog(ctx, env, m, st, regions, act) {
  const { g } = env;
  const d = st.dialog;
  if (!d || !m.player) return;
  const touch = env.L.touch;
  const r = dialogRectFor(env.L);
  const rowH0 = Math.max(14, env.L.minHit || 0);
  if (d.page === 'main') {
    // the greeting window is only as tall as its choices
    const n = d.turnins.length + d.offers.length + d.progress.length + (d.trainer ? 1 : 0) + (d.vendor ? 1 : 0) + 2;
    r.h = Math.min(r.h, 26 + 40 + n * (rowH0 + 1) + 6);
  }
  const npc = npcInfo(d.npc) || { name: d.npc, talk: [] };
  frame(ctx, env, r, npc.name + (npc.title ? `, ${npc.title}` : ''), regions, act, 'dialog');
  const rowH = Math.max(14, env.L.minHit || 0);
  const x0 = r.x + 10, w0 = r.w - 20;
  let y = r.y + 26;
  const button = (x, yy, w, label, color, on, scheme = 'slate') => {
    const bh = Math.max(16, env.L.minHit || 0);
    g.window(ctx, x, yy, w, bh, 'thin', scheme, 0.95);
    g.text(ctx, label, x + w / 2, yy + Math.floor(bh / 2) - 6, color, { align: 'center' });
    regions.push({ rect: { x, y: yy, w, h: bh }, kind: 'button', on, label });
    return bh;
  };
  const bottom = r.y + r.h - Math.max(16, env.L.minHit || 0) - 8;
  const back = (label = 'Back') => button(r.x + r.w - 10 - 70, bottom, 70, label, 'cream', () => { d.page = 'main'; d.quest = null; d.scroll = 0; });

  if (d.page === 'main') {
    // the npc's own portrait (assets/portraits, INTEGRATION_TODO 16), else LQ's
    const hasPortrait = !!(g.portrait(ctx, d.npc, x0, y, 32) || (npc.lq && g.portrait(ctx, npc.lq, x0, y, 32)));
    const line = (npc.talk && npc.talk.length) ? npc.talk[d.line % npc.talk.length] : 'Well met.';
    const tx = hasPortrait ? x0 + 40 : x0;
    const ls = g.wrap(line, w0 - (tx - x0));
    ls.slice(0, 4).forEach((ln, i) => g.text(ctx, ln, tx, y + i * 11, 'cream'));
    y += Math.max(hasPortrait ? 36 : 0, Math.min(4, ls.length) * 11 + 6);
    const opts = [];
    for (const id of d.turnins) opts.push({ icon: 'emote_question_0', label: (questInfo(id) || { name: id }).name, color: 'gold', on: () => { d.page = 'quest'; d.quest = id; d.textPage = 0; d.choice = 0; } });
    for (const id of d.offers) opts.push({ icon: 'emote_exclaim_0', label: (questInfo(id) || { name: id }).name, color: 'gold', on: () => { d.page = 'quest'; d.quest = id; d.textPage = 0; } });
    for (const id of d.progress) opts.push({ icon: 'emote_question_0', dim: true, label: (questInfo(id) || { name: id }).name, color: 'gray', on: () => { d.page = 'quest'; d.quest = id; d.textPage = 0; } });
    if (d.trainer && d.trainer.cls === m.player.cls) opts.push({ icon: 'icon_book', label: 'Train me.', color: 'white', on: () => { d.page = 'train'; d.scroll = 0; } });
    else if (d.trainer) opts.push({ icon: 'icon_book', label: `I only train ${(classInfo(d.trainer.cls) || { name: d.trainer.cls }).name}s.`, color: 'gray', on: () => {} });
    if (d.vendor) opts.push({ icon: 'icon_gold', label: 'Let me browse your goods.', color: 'white', on: () => act.openVendor() });
    if (d.soon.length && !opts.length) opts.push({ icon: 'emote_dots_0', label: 'Come back when you have more experience.', color: 'gray', on: () => {} });
    opts.push({ icon: null, label: 'Goodbye.', color: 'cream', on: () => act.closeDialog() });
    for (const o of opts) {
      const ry = y;
      g.rect(ctx, x0, ry, w0, rowH - 1, 'rgba(20,16,30,0.35)');
      if (o.icon) g.iconIn(ctx, o.icon, x0 + 1, ry, 16, rowH - 1, o.dim ? 0.45 : 1);
      g.text(ctx, g.clip(o.label, w0 - 24), x0 + 20, ry + Math.floor((rowH - 11) / 2), o.color);
      regions.push({ rect: { x: x0, y: ry, w: w0, h: rowH - 1 }, kind: 'button', on: o.on, label: o.label });
      y += rowH + 1;
      if (y > bottom - 4) break;
    }
    return;
  }

  if (d.page === 'quest') {
    const q = questInfo(d.quest);
    if (!q) { d.page = 'main'; return; }
    const ready = d.turnins.includes(q.id), offer = d.offers.includes(q.id);
    for (const ln of g.wrap(q.name, w0, true)) { g.text(ctx, ln, x0, y, 'gold', { large: true }); y += 15; }
    const text = (ready ? q.text.complete : offer ? q.text.offer : q.text.progress) || '';
    // long text pages: the rest waits behind "more" (tap or click the text, or scroll) instead of being cut
    const objH = offer ? 11 + q.objectives.length * 11 : 0;
    const maxText = bottom - 46 - objH - 14;
    const all = g.wrap(text, w0);
    const fit = Math.max(1, Math.floor((maxText - y) / 11) + 1);
    const pages = Math.max(1, Math.ceil(all.length / fit));
    d.textPage = Math.max(0, Math.min(pages - 1, d.textPage || 0));
    const shown = all.slice(d.textPage * fit, d.textPage * fit + fit);
    const ty0 = y;
    for (const ln of shown) { g.text(ctx, ln, x0, y, 'cream'); y += 11; }
    if (pages > 1) {
      const more = d.textPage < pages - 1 ? `more (${d.textPage + 1}/${pages})` : `back to start (${pages}/${pages})`;
      g.text(ctx, more, x0 + w0, y, 'gold', { align: 'right' }); y += 11;
      const rect = { x: x0, y: ty0, w: w0, h: y - ty0 };
      regions.push({ rect, kind: 'button', on: () => { d.textPage = (d.textPage + 1) % pages; }, label: 'more' });
      regions.push({ rect, kind: 'scroll', scroll: (k) => { d.textPage = Math.max(0, Math.min(pages - 1, d.textPage + k)); } });
    }
    y += 3;
    if (offer) {
      g.text(ctx, 'Objectives', x0, y, 'gold'); y += 11;
      for (const o of q.objectives) { g.text(ctx, g.clip(`${o.count > 1 ? `${o.count} ` : ''}${o.label}`, w0 - 10), x0 + 8, y, 'white'); y += 11; }
    }
    const rw = q.rewards || {};
    y = Math.max(y + 2, bottom - 42);
    g.text(ctx, 'Rewards', x0, y, 'gold');
    g.text(ctx, [rw.xp ? `${rw.xp} XP` : null, rw.gold ? `${rw.gold} gold` : null].filter(Boolean).join('   ') || 'None', x0 + 50, y, 'white');
    let ix = x0;
    const items = [...(rw.items || []).map((i) => ({ i, fixed: true })), ...(rw.choice || []).map((i, k) => ({ i, k }))];
    // the sim says which choices this hero can use (quest_dialog rewards, fix pass 1): the rest are greyed with why
    const simRw = d.rewards && d.rewards[q.id];
    const choiceOf = (k) => (simRw && simRw.choice && simRw.choice[k]) || null;
    if (!d.choicePicked && (rw.choice || []).length > 1) {
      const firstOk = (rw.choice || []).findIndex((_, k) => { const c = choiceOf(k); return !c || c.usable !== false; });
      if (firstOk >= 0) d.choice = firstOk;
    }
    const tips = [];
    for (const it of items.slice(0, 8)) {
      const sz = Math.max(18, Math.min(24, env.L.minHit || 0));
      const sr = { x: ix, y: y + 12, w: sz, h: sz };
      const sc = it.fixed ? null : choiceOf(it.k);
      const info = itemInfo(sc && sc.inst ? { ...itemInfo(it.i), ...sc.inst } : it.i);
      const unusable = !!(sc && sc.usable === false);
      const why = unusable ? (sc.reqLevel && sc.reqLevel > m.player.level ? `Needs level ${sc.reqLevel}.` : 'Your class cannot use this.') : null;
      g.window(ctx, sr.x, sr.y, sr.w, sr.h, 'thin', 'blue', 0.95);
      if (info) g.iconIn(ctx, info.icon || 'icon_bag', sr.x, sr.y, sr.w, sr.h, unusable ? 0.4 : 1);
      if (unusable) g.rect(ctx, sr.x + 2, sr.y + 2, sr.w - 4, sr.h - 4, 'rgba(160,40,40,0.35)');
      const picked = !it.fixed && d.choice === it.k;
      if (picked && ready) g.outline(ctx, sr.x - 1, sr.y - 1, sr.x + sr.w, sr.y + sr.h, '#fff7d6');
      else if (info && info.rarity && info.rarity !== 'common') g.outline(ctx, sr.x + 1, sr.y + 1, sr.x + sr.w - 2, sr.y + sr.h - 2, RARITY_COLOR[info.rarity] || '#e8e8e8');
      const tip = info ? itemTooltip(info, it.fixed ? null : 'Choose one', info.slot ? (m.equip[info.slot] || null) : undefined) : null;
      if (tip && why) { tip.foot = why; tip.footColor = 'red'; }
      const idx = items.indexOf(it);
      tips[idx] = tip;
      if (env.L.touch && d.peek === idx) g.outline(ctx, sr.x - 2, sr.y - 2, sr.x + sr.w + 1, sr.y + sr.h + 1, '#ffd34d');
      // on a phone a tap shows that item's card above the rewards (Scott 2026-11-19: "I can't see what the rewards options
      // are"); a tap on the shown item hides it again
      regions.push({ rect: sr, kind: 'reward', tip: env.L.touch ? null : tip, on: () => {
        if (!it.fixed) { d.choice = it.k; d.choicePicked = true; }
        if (env.L.touch) d.peek = d.peek === idx ? -1 : idx;
      } });
      ix += sz + 3;
    }
    if (env.L.touch && items.length) {
      if (d.peek == null || d.peekQuest !== q.id) { d.peekQuest = q.id; d.peek = -1; }
      const tp = d.peek >= 0 ? tips[d.peek] : null;
      if (tp) drawTooltip(g, ctx, tp, x0, y, { w: Math.min(214, w0), W: x0 + w0 + 2, H: y - 1 });
      else g.text(ctx, 'Tap an item to see it', ix + 6, y + 12 + 4, 'gray');
    }
    if (offer) button(x0, bottom, 90, 'Accept', 'green', () => { act.send({ t: 'quest_accept', quest: q.id, npc: d.ent }); act.refreshDialog(); }, 'forest');
    // one reward choice is simply yours: no "pick one" (CRITIQUE_1 item 20)
    if (ready) button(x0, bottom, 110, (rw.choice || []).length > 1 ? 'Complete (pick one)' : 'Complete', 'gold', () => { act.send({ t: 'quest_turnin', quest: q.id, npc: d.ent, choice: (rw.choice || []).length > 1 ? d.choice : 0 }); act.refreshDialog(); }, 'ember');
    back();
    return;
  }

  if (d.page === 'train') {
    const offer = (d.trainer && d.trainer.offer) || [];
    g.text(ctx, 'Abilities', x0, y, 'gold'); g.text(ctx, `${m.gold} gold`, x0 + w0, y, 'gold', { align: 'right' }); y += 13;
    const vis = Math.floor((bottom - 6 - y) / rowH);
    d.scroll = Math.max(0, Math.min(Math.max(0, offer.length - vis), d.scroll || 0));
    const known = new Set((m.bar || []).map((b) => b.ability).filter(Boolean));
    for (const o of offer.slice(d.scroll, d.scroll + vis)) {
      const a = abilityInfo(o.ability) || { name: o.ability };
      const isKnown = o.known || known.has(o.ability) || (st.trained && st.trained.has(o.ability));
      const can = !isKnown && m.player.level >= o.level && m.gold >= o.cost;
      g.rect(ctx, x0, y, w0, rowH - 1, 'rgba(20,16,30,0.35)');
      g.iconIn(ctx, a.icon, x0, y, 16, rowH - 1);
      g.text(ctx, g.clip(a.name, 130), x0 + 20, y + Math.floor((rowH - 11) / 2), isKnown ? 'gray' : can ? 'white' : 'dim');
      const right = isKnown ? 'Known' : m.player.level < o.level ? `Level ${o.level}` : o.cost ? `${o.cost} gold` : 'Free';
      g.text(ctx, right, x0 + w0 - 60, y + Math.floor((rowH - 11) / 2), isKnown ? 'gray' : can ? 'gold' : 'red', { align: 'right' });
      if (can) {
        const bw = 52;
        g.window(ctx, x0 + w0 - bw, y + 1, bw, rowH - 3, 'thin', 'forest', 0.95);
        g.text(ctx, 'Train', x0 + w0 - bw / 2, y + Math.floor((rowH - 11) / 2), 'cream', { align: 'center' });
      }
      regions.push({ rect: { x: x0, y, w: w0, h: rowH - 1 }, kind: 'button', tip: abilityTooltip(a, Math.max(m.player.level, o.level), (classInfo(m.player.cls) || {}).resource),
        on: () => { if (can) act.send({ t: 'train', ability: o.ability, npc: d.ent }); }, label: `train:${o.ability}` });
      y += rowH;
    }
    if (offer.length > vis) regions.push({ rect: { x: x0, y: r.y + 36, w: w0, h: vis * rowH }, kind: 'scroll', scroll: (k) => { d.scroll += k; } });
    const rc = d.trainer && d.trainer.respecCost != null ? d.trainer.respecCost : null;
    const b2 = m.builds2;
    if (b2 && b2.build && b2.respec && b2.respec.where !== 'lantern' && (Object.keys(b2.build.ranks || {}).length || b2.build.freeRespec)) {
      // Builds 2 (src/sim/builds2.js respecCost): free once when flagged, free at a lantern under 10, here from 10
      const c = b2.respec || { cost: 0, where: 'trainer' };
      const confirm = st.confirm === 'b2respec';
      button(x0, bottom, 150, confirm ? 'Reset talents? Again' : `Reset talents (${c.cost ? `${c.cost} gold` : 'free'})`, confirm ? 'orange' : 'cream',
        () => { if (confirm) { st.confirm = null; act.b2({ t: 'b2_respec', npc: d.ent }); } else st.confirm = 'b2respec'; });
    } else if (!b2 && rc != null && Object.keys(m.talents || {}).length) {
      const confirm = st.confirm === 'respec';
      button(x0, bottom, 150, confirm ? 'Reset talents? Again' : `Reset talents (${rc ? `${rc} gold` : 'free'})`, confirm ? 'orange' : 'cream',
        () => { if (confirm) { st.confirm = null; act.send({ t: 'respec', npc: d.ent }); } else st.confirm = 'respec'; });
    }
    back();
    return;
  }

  if (d.page === 'vendor') {
    const stock = (d.vendor && d.vendor.items) || [];
    g.text(ctx, 'For sale', x0, y, 'gold');
    g.icon(ctx, 'icon_gold', x0 + w0 - 60, y + 1); g.text(ctx, `${m.gold}`, x0 + w0, y, 'gold', { align: 'right' });
    y += 13;
    const listBottom = bottom - 26;
    const vis = Math.floor((listBottom - y) / rowH);
    d.scroll = Math.max(0, Math.min(Math.max(0, stock.length - vis), d.scroll || 0));
    for (const s of stock.slice(d.scroll, d.scroll + vis)) {
      const can = m.gold >= s.price && (s.reqLevel || 1) <= m.player.level + 2;
      const col = RARITY_COLOR[s.rarity] || '#e8e8e8';
      g.rect(ctx, x0, y, w0, rowH - 1, 'rgba(20,16,30,0.35)');
      g.iconIn(ctx, s.icon || 'icon_bag', x0, y, 16, rowH - 1);
      g.text(ctx, g.clip(s.name, w0 - 100), x0 + 20, y + Math.floor((rowH - 11) / 2), m.gold >= s.price ? 'white' : 'dim');
      if ((s.reqLevel || 1) > m.player.level) g.text(ctx, `Lv ${s.reqLevel}`, x0 + w0 - 56, y + Math.floor((rowH - 11) / 2), 'red', { align: 'right' });
      g.text(ctx, `${s.price} gold`, x0 + w0 - 2, y + Math.floor((rowH - 11) / 2), m.gold >= s.price ? 'gold' : 'red', { align: 'right' });
      void col;
      const info = itemInfo(s.item);
      regions.push({ rect: { x: x0, y, w: w0, h: rowH - 1 }, kind: 'button',
        tip: info ? { ...itemTooltip(info, touch ? 'Tap to buy' : 'Click to buy (right-click: 5)', info.slot ? (m.equip[info.slot] || null) : undefined), foot: `${touch ? 'Tap to buy' : 'Click to buy, right-click for 5'}.  ${s.price} gold each.`, footColor: can ? 'gold' : 'red' } : null,
        on: (btn) => act.send({ t: 'buy', npc: d.ent, index: s.index, qty: btn === 2 && (s.stack || 1) > 1 ? 5 : 1 }), label: `buy:${s.item}` });
      y += rowH;
    }
    if (stock.length > vis) regions.push({ rect: { x: x0, y: r.y + 36, w: w0, h: vis * rowH }, kind: 'scroll', scroll: (k) => { d.scroll += k; } });
    // buyback strip
    const bb = m.buyback || [];
    const by = listBottom + 2;
    g.text(ctx, 'Buy back', x0, by + 4, 'gray');
    let bx = x0 + 50;
    bb.slice(-6).forEach((b, k) => {
      const sz = 20;
      const sr = { x: bx, y: by, w: sz, h: sz };
      g.window(ctx, sr.x, sr.y, sz, sz, 'thin', 'slate', 0.95);
      g.iconIn(ctx, b.icon || 'icon_bag', sr.x, sr.y, sz, sz);
      regions.push({ rect: sr, kind: 'button', tip: { ...itemTooltip(b), foot: `Buy back for ${b.price} gold.`, footColor: 'gold' }, on: () => act.send({ t: 'buyback', npc: d.ent, index: k }) });
      bx += sz + 3;
    });
    g.text(ctx, touch ? 'Tap bag items to sell.' : 'Right-click bag items to sell.', x0, bottom + 3, 'gray');
    const junkN = (m.bag.items || []).filter((it) => it && it.kind === 'junk').length;
    if (junkN) button(r.x + r.w - 10 - 70 - 6 - 74, bottom, 74, 'Sell junk', 'cream', () => act.sellJunk());
    back();
  }
}

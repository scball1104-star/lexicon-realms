// Trade between party members and item binding (group play basics, 2026-11-22). Pure: no clock, no Math.random.
//
//   const TR = createTrade(D)   D = { state, content, emit, get, onBag(e) }
//   TR.handles(t) / TR.command(e, cmd)    trade_open { id }, trade_offer { uid, item? } | { remove: k } | { gold: n },
//                                         trade_ready { ready }, trade_cancel
//   TR.tick()                    once per world step: a trade ends when the two walk apart, die, leave the party or log out
//   TR.hudOf(e, itemView)        the HUD block's `group.trade` (null when not trading)
//   TR.onEquip(slot)             wearing a bind-on-equip item makes it Soulbound (world.js equipItem)
//   TR.onDrop(mob, drop)         a dungeon boss's drops bind on pickup (world.js, after the dungeon adds its pieces)
//   TR.onLeave(id)               a hero left the world: their trade closes
//   bindOf(content, slot) -> 'pickup' | 'equip' | null;  noTrade(content, slot) -> null | 'pickup' | 'soulbound' | 'quest'
//
// Binding (content.party.bind): bind on pickup = a dungeon boss's drops (named pieces, the rare, the legendary, set
// pieces, and any gear a boss rolls), set and legendary rarity, quest rewards. Bind on equip = gear of magic rarity or
// better found in the world: it trades until it is worn once, then it is Soulbound (inst.soulbound). Consumables, common
// gear and trade goods are free. A bound item never trades. Old saves need nothing: the rule reads the item.
//
// The swap is atomic: when both sides are Ready, every offered slot must still be in its owner's bags (by uid) and
// tradeable, the gold must be there, and each side's bags must hold what comes in after what goes out. Otherwise nothing
// moves, both Ready marks clear and both are told why. Any change to either side's offer clears both Ready marks.
import { distPx } from './geom.js';
import { bagAdd, bagFindUid } from './loot.js';

const CMDS = new Set(['trade_open', 'trade_offer', 'trade_ready', 'trade_cancel']);
const clone = (v) => JSON.parse(JSON.stringify(v));

const BOP_CACHE = new WeakMap();
/** Item ids that bind on pickup by where they come from: dungeon boss pieces, rares, legendaries, sets, quest rewards. */
function bopIds(content) {
  if (BOP_CACHE.has(content)) return BOP_CACHE.get(content);
  const ids = new Set();
  const items = content.items || {};
  const walk = (v) => {
    if (typeof v === 'string') { if (items[v]) ids.add(v); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (v && typeof v === 'object') { if (typeof v.item === 'string') walk(v.item); else for (const x of Object.values(v)) walk(x); }
  };
  for (const pl of Object.values(content.dungeons || {})) { walk(pl.drops); walk(pl.rare); walk(pl.legendary); }
  for (const s of Object.values(content.sets || {})) walk(s.pieces);
  for (const q of Object.values(content.quests || {})) { const r = q.rewards || {}; walk(r.items); walk(r.choice); }
  BOP_CACHE.set(content, ids);
  return ids;
}

export function bindOf(content, slot) {
  if (!slot || !slot.item) return null;
  const def = (content.items || {})[slot.item];
  if (!def) return null;
  const B = (content.party && content.party.bind) || {};
  const inst = slot.inst || null;
  if (inst && inst.bind === 'pickup') return 'pickup';
  if (def.kind === 'quest') return 'pickup';
  const rarity = (inst && inst.rarity) || def.rarity || 'common';
  if ((B.pickupRarities || []).includes(rarity)) return 'pickup';
  if (bopIds(content).has(slot.item)) return 'pickup';
  if ((def.kind === 'weapon' || def.kind === 'armor') && (B.equipRarities || []).includes(rarity)) return 'equip';
  return null;
}
/** Why a bag slot cannot trade (null: it can). */
export function noTrade(content, slot) {
  const def = (content.items || {})[slot.item] || {};
  if (def.kind === 'quest') return 'quest';
  const b = bindOf(content, slot);
  if (b === 'pickup') return 'pickup';
  if (slot.inst && slot.inst.soulbound) return 'soulbound';
  return null;
}

export function createTrade(D) {
  const { state, content, emit, get } = D;
  const R = content.party.trade;
  const partner = (e) => (e && e.trade ? get(e.trade.with) : null);
  const fail = (e, cmd, reason, extra = {}) => { emit({ type: 'trade_fail', id: e.id, cmd: cmd.t, reason, ...extra }); return false; };
  const close = (e, reason) => {
    const p = partner(e);
    for (const x of [e, p]) if (x && x.trade) { delete x.trade; emit({ type: 'trade', kind: 'close', id: x.id, reason }); }
  };
  const near = (a, b, slack = 0) => a.zone === b.zone && distPx(a, b) <= R.rangePx + slack;
  const changed = (e) => {
    const p = partner(e);
    for (const x of [e, p]) if (x && x.trade) { x.trade.ready = false; x.trade.note = null; }
    if (p) emit({ type: 'trade', kind: 'change', id: p.id, with: e.id });
    emit({ type: 'trade', kind: 'change', id: e.id, with: p ? p.id : null });
  };

  function open(e, cmd) {
    const t = get(cmd.id);
    if (!t || t.kind !== 'player' || t === e) return fail(e, cmd, 'bad_target');
    if (e.party == null || t.party !== e.party) return fail(e, cmd, 'not_party');
    if (t.dead) return fail(e, cmd, 'dead');
    if (!near(e, t)) return fail(e, cmd, 'range');
    if (e.trade && e.trade.with === t.id) return true;
    if (e.trade) close(e, 'cancel');
    if (t.trade) return fail(e, cmd, 'busy');
    e.trade = { with: t.id, items: [], gold: 0, ready: false, note: null };
    t.trade = { with: e.id, items: [], gold: 0, ready: false, note: null };
    emit({ type: 'trade', kind: 'open', id: e.id, with: t.id, by: e.id });
    emit({ type: 'trade', kind: 'open', id: t.id, with: e.id, by: e.id });
    return true;
  }
  function offer(e, cmd) {
    const tr = e.trade;
    if (!tr || !partner(e)) return fail(e, cmd, 'no_trade');
    if (cmd.remove != null) {
      const k = cmd.remove | 0;
      if (!tr.items[k]) return fail(e, cmd, 'no_item');
      tr.items.splice(k, 1);
      changed(e);
      return true;
    }
    if (cmd.gold != null) {
      const n = Math.max(0, Math.min(R.maxGold, Math.floor(+cmd.gold || 0)));
      if (n > (e.gold || 0)) return fail(e, cmd, 'gold');
      tr.gold = n;
      changed(e);
      return true;
    }
    const k = bagFindUid(e, cmd.uid | 0);
    const slot = k >= 0 ? e.bag[k] : null;
    if (!slot || (cmd.item && slot.item !== cmd.item)) return fail(e, cmd, 'no_item');
    const why = noTrade(content, slot);
    if (why) { tr.note = { reason: why, item: slot.item }; return fail(e, cmd, why, { item: slot.item }); }
    if (tr.items.some((x) => x.uid === slot.uid)) return fail(e, cmd, 'offered');
    if (tr.items.length >= R.slots) return fail(e, cmd, 'full');
    tr.items.push({ uid: slot.uid, item: slot.item });
    changed(e);
    return true;
  }
  /** The offered bag slots, still there and tradeable, or the reason they are not. */
  function gather(e) {
    const out = [];
    for (const x of e.trade.items) {
      const k = bagFindUid(e, x.uid);
      const s = k >= 0 ? e.bag[k] : null;
      if (!s || s.item !== x.item) return { reason: 'gone', item: x.item };
      const why = noTrade(content, s);
      if (why) return { reason: why, item: s.item };
      out.push(s);
    }
    if ((e.trade.gold || 0) > (e.gold || 0)) return { reason: 'gold' };
    return { slots: out };
  }
  /** Would `e`'s bags hold `incoming` once `outgoing` is gone? A dry run on a copy of the bags. */
  function fits(e, outgoing, incoming) {
    const out = new Set(outgoing.map((s) => s.uid));
    const tmp = { bag: clone((e.bag || []).filter((s) => !out.has(s.uid))), bags: e.bags, uidNext: e.uidNext || 1 };
    for (const s of incoming) if (bagAdd(tmp, s.item, s.qty || 1, s.inst || null, content) < (s.qty || 1)) return false;
    return true;
  }
  function swap(a, b) {
    const ga = gather(a), gb = gather(b);
    let bad = null;
    if (ga.reason) bad = { who: a, ...ga }; else if (gb.reason) bad = { who: b, ...gb };
    else if (!fits(a, ga.slots, gb.slots)) bad = { who: a, reason: 'bag_full' };
    else if (!fits(b, gb.slots, ga.slots)) bad = { who: b, reason: 'bag_full' };
    if (bad) {
      for (const x of [a, b]) { x.trade.ready = false; x.trade.note = { reason: bad.reason, item: bad.item || null, who: bad.who.id }; }
      for (const x of [a, b]) emit({ type: 'trade_fail', id: x.id, cmd: 'trade_ready', reason: bad.reason, who: bad.who.id, ...(bad.item ? { item: bad.item } : {}) });
      return false;
    }
    const take = (e, slots) => { const ids = new Set(slots.map((s) => s.uid)); e.bag = e.bag.filter((s) => !ids.has(s.uid)); return slots.map((s) => clone(s)); };
    const fromA = take(a, ga.slots), fromB = take(b, gb.slots);
    for (const s of fromB) bagAdd(a, s.item, s.qty || 1, s.inst || null, content);
    for (const s of fromA) bagAdd(b, s.item, s.qty || 1, s.inst || null, content);
    const goldA = a.trade.gold || 0, goldB = b.trade.gold || 0;
    a.gold = (a.gold || 0) - goldA + goldB;
    b.gold = (b.gold || 0) - goldB + goldA;
    const view = (list) => list.map((s) => ({ item: s.item, qty: s.qty || 1 }));
    delete a.trade; delete b.trade;
    emit({ type: 'trade', kind: 'done', id: a.id, with: b.id, gave: view(fromA), got: view(fromB), goldGave: goldA, goldGot: goldB });
    emit({ type: 'trade', kind: 'done', id: b.id, with: a.id, gave: view(fromB), got: view(fromA), goldGave: goldB, goldGot: goldA });
    if (goldA || goldB) {
      emit({ type: 'gold', id: a.id, amount: goldB - goldA, total: a.gold, source: 'trade' });
      emit({ type: 'gold', id: b.id, amount: goldA - goldB, total: b.gold, source: 'trade' });
    }
    if (D.onBag) { D.onBag(a); D.onBag(b); }
    return true;
  }
  function ready(e, cmd) {
    const p = partner(e);
    if (!e.trade || !p || !p.trade) return fail(e, cmd, 'no_trade');
    e.trade.ready = cmd.ready !== false;
    emit({ type: 'trade', kind: 'ready', id: p.id, with: e.id, ready: e.trade.ready });
    emit({ type: 'trade', kind: 'ready', id: e.id, with: e.id, ready: e.trade.ready });
    if (e.trade.ready && p.trade.ready) swap(e, p);
    return true;
  }
  function command(e, cmd) {
    if (e.dead && cmd.t !== 'trade_cancel') return fail(e, cmd, 'dead');
    switch (cmd.t) {
      case 'trade_open': return open(e, cmd);
      case 'trade_offer': return offer(e, cmd);
      case 'trade_ready': return ready(e, cmd);
      case 'trade_cancel': if (e.trade) close(e, 'cancel'); return true;
      default: return false;
    }
  }
  function tick() {
    for (const e of state.ents) {
      if (e.kind !== 'player' || !e.trade) continue;
      const p = partner(e);
      if (!p || !p.trade || p.trade.with !== e.id) { delete e.trade; emit({ type: 'trade', kind: 'close', id: e.id, reason: 'gone' }); continue; }
      if (e.dead || p.dead) close(e, 'dead');
      else if (e.party == null || p.party !== e.party) close(e, 'party');
      else if (!near(e, p, 32)) close(e, 'range');
    }
  }
  function onLeave(id) { const e = get(id); if (e && e.trade) close(e, 'gone'); }
  function onEquip(slot) {
    if (slot && slot.inst && bindOf(content, slot) === 'equip' && !slot.inst.soulbound) slot.inst.soulbound = true;
  }
  function onDrop(mob, drop) {
    const t = (content.mobs || {})[mob.template] || {};
    if (!t.boss || !mob.spawn || !mob.spawn.copy) return;
    for (const it of drop.items || []) if (it.inst && (content.items[it.item] || {}).kind !== 'consumable') it.inst.bind = 'pickup';
  }
  function hudOf(e, itemView) {
    const tr = e.trade, p = partner(e);
    if (!tr || !p || !p.trade) return null;
    const side = (x) => ({
      ready: !!x.trade.ready, gold: x.trade.gold || 0,
      items: x.trade.items.map((o) => { const k = bagFindUid(x, o.uid); return k >= 0 ? { ...itemView(x, x.bag[k]), uid: o.uid } : { item: o.item, qty: 1, name: o.item, resolved: true }; }),
    });
    const offered = new Set(tr.items.map((o) => o.uid));
    const bag = (e.bag || []).map((s) => ({ ...itemView(e, s), offered: offered.has(s.uid), noTrade: noTrade(content, s) }));
    return { with: p.id, name: p.name, mine: side(e), theirs: side(p), bag, note: tr.note || null };
  }
  return { handles: (t) => CMDS.has(t), command, tick, hudOf, onEquip, onDrop, onLeave, bindOf: (slot) => bindOf(content, slot) };
}

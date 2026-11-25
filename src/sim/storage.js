// Storage: the Lantern Chest (a hero tab and a Shared tab) and the glyph pouch's trips to it (design brief
// D:\LQOnline\storage_stills\BRIEF.md, approved 2026-11-20). Pure: no imports from outside sim.
//
//   const S = createStorage(ctx)      ctx = { state, content, emit, get(id), distPx(a, b), reach (px, commands), openReach (px, opening), tileToSub(tx, ty),
//                                           bagIndex(e, cmd) (world.js: uid, index + item, or item), onBag(e) }
//   S.spawnChests(add, nextId)        one object entity per content.lanternChests entry (kind 'object', chest: {...})
//   S.open(e, chestEnt)               the interact path: range and combat checks, then event `chest_open`
//   S.command(e, cmd)                 chest_store / chest_take / chest_move / chest_row / chest_sort (CONTRACTS 2.2)
//   S.view(e, itemView)               the HUD block (hud.storage) while the hero stands at an open chest, else null
//   S.saveOf(e) / S.restore(e, spec)  the hero tab in the hero's save (`chest`); missing = an empty chest
//   S.shared() / S.setShared(obj)     the Shared tab: lives in world state (state.shared), saved by main.js under its own
//                                     key (lexicon_realms.shared v1), never in a hero save
//
// A tab is { rows, items: [{ item, qty, inst? }], glyphs: [{ item, qty }] }: `rows` bought so far, `items` a dense list
// (capacity start + rows x rowSize), `glyphs` one stack per letter (no slots used). Every command names the chest it is
// at (`chest`: entity id): in reach, same zone, alive and out of combat. Refusals are `inventory_fail` with reason
// range / combat / dead / no_item / chest_full / bag_full / gold / max / quest.
import { bagAdd, bagFree, isGlyph, pouchAdd } from './loot.js';

const TABS = ['hero', 'shared'];
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const emptyTab = () => ({ rows: 0, items: [], glyphs: [] });
/** A tab from a save (anything malformed is dropped, never thrown on). */
export function cleanTab(raw, content) {
  const t = emptyTab();
  if (!raw || typeof raw !== 'object') return t;
  t.rows = Math.max(0, raw.rows | 0);
  const items = (content && content.items) || {};
  for (const s of Array.isArray(raw.items) ? raw.items : []) {
    if (!s || typeof s.item !== 'string' || !items[s.item] || isGlyph(content, s.item) || items[s.item].kind === 'quest') continue;
    const q = Math.max(1, s.qty | 0);
    t.items.push(s.inst ? { item: s.item, qty: 1, inst: clone(s.inst) } : { item: s.item, qty: q });
  }
  for (const s of Array.isArray(raw.glyphs) ? raw.glyphs : []) {
    if (!s || !isGlyph(content, s.item) || !(s.qty > 0)) continue;
    pouchAdd(t.glyphs, s.item, s.qty | 0);
  }
  return t;
}

export function createStorage(ctx) {
  const { state, content, emit } = ctx;
  const R = content.storage || { hero: { start: 30, rowSize: 10, rowPrices: [100, 300, 800], max: 60 }, shared: { start: 30, rowSize: 10, rowPrices: [300, 900, 2000], max: 60 } };
  const items = content.items || {};
  if (!state.shared) state.shared = emptyTab();

  const rule = (tab) => R[tab];
  const capacity = (tab, t) => Math.min(rule(tab).max, rule(tab).start + t.rows * rule(tab).rowSize);
  const tabOf = (e, tab) => (tab === 'shared' ? state.shared : (e.chest || (e.chest = emptyTab())));
  const stackOf = (item, inst) => (inst ? 1 : (items[item] && items[item].stack) || 1);
  const fail = (e, cmd, reason, item) => { emit({ type: 'inventory_fail', id: e.id, cmd: cmd.t, item: item || cmd.item || cmd.glyph || null, reason }); return false; };

  /** How many of `item` fit in a tab now. */
  function roomIn(tab, t, item, inst) {
    const stack = stackOf(item, inst);
    let n = (capacity(tab, t) - t.items.length) * stack;
    if (!inst) for (const s of t.items) if (s.item === item && !s.inst) n += Math.max(0, stack - s.qty);
    return Math.max(0, n);
  }
  /** Put qty in a tab (stacks merge first). The caller checked the room. */
  function tabAdd(tab, t, item, qty, inst) {
    const stack = stackOf(item, inst);
    let left = qty;
    if (!inst) for (const s of t.items) {
      if (left <= 0) break;
      if (s.item !== item || s.inst || s.qty >= stack) continue;
      const k = Math.min(stack - s.qty, left); s.qty += k; left -= k;
    }
    while (left > 0 && t.items.length < capacity(tab, t)) {
      const k = Math.min(stack, left);
      t.items.push(inst ? { item, qty: 1, inst: clone(inst) } : { item, qty: k });
      left -= k;
    }
    return qty - left;
  }
  /** Room in the hero's bags for this (the glyph pouch has no limit). */
  function bagRoom(e, item, inst) {
    const stack = stackOf(item, inst);
    let n = bagFree(e, content) * stack;
    if (!inst) for (const s of e.bag || []) if (s.item === item && !s.inst) n += Math.max(0, stack - s.qty);
    return n;
  }

  /** The chest object a command names, if the hero can use it now (else a refusal). */
  function atChest(e, cmd) {
    const c = cmd.chest != null ? ctx.get(cmd.chest | 0) : null;
    if (!c || !c.chest || c.zone !== e.zone || ctx.distPx(e, c) > ctx.reach) { fail(e, cmd, 'range'); return null; }
    if (e.dead) { fail(e, cmd, 'dead'); return null; }
    if (e.inCombat) { fail(e, cmd, 'combat'); return null; }
    return c;
  }
  const tabName = (v) => (TABS.includes(v) ? v : 'hero');
  /** A chest slot named by index + item (the item must still be there: the list may have shifted). */
  function slotAt(t, cmd) {
    const k = cmd.index | 0;
    const s = t.items[k];
    return s && cmd.item && s.item === cmd.item ? k : -1;
  }
  const changed = (tabs) => tabs.includes('shared');

  function store(e, cmd) {
    if (!atChest(e, cmd)) return false;
    const tab = tabName(cmd.tab);
    const t = tabOf(e, tab);
    if (cmd.glyph) {
      const g = (e.gbag || []).find((s) => s.item === cmd.glyph);
      if (!g) return fail(e, cmd, 'no_item');
      const qty = Math.max(1, Math.min(g.qty, cmd.qty | 0 || g.qty));
      g.qty -= qty;
      if (g.qty <= 0) e.gbag.splice(e.gbag.indexOf(g), 1);
      pouchAdd(t.glyphs, g.item, qty);
      emit({ type: 'chest', id: e.id, kind: 'store', tab, item: g.item, qty, glyph: true, shared: changed([tab]) });
      return true;
    }
    const i = ctx.bagIndex(e, cmd);
    if (i < 0) return fail(e, cmd, 'no_item');
    const slot = e.bag[i];
    if (items[slot.item] && items[slot.item].kind === 'quest') return fail(e, cmd, 'quest', slot.item);
    const qty = Math.max(1, Math.min(slot.qty, cmd.qty | 0 || slot.qty));
    if (roomIn(tab, t, slot.item, slot.inst) < qty) return fail(e, cmd, 'chest_full', slot.item);
    tabAdd(tab, t, slot.item, qty, slot.inst || null);
    if (qty >= slot.qty) e.bag.splice(i, 1); else slot.qty -= qty;
    emit({ type: 'chest', id: e.id, kind: 'store', tab, item: slot.item, qty, shared: changed([tab]) });
    if (ctx.onBag) ctx.onBag(e);
    return true;
  }

  function take(e, cmd) {
    if (!atChest(e, cmd)) return false;
    const tab = tabName(cmd.tab);
    const t = tabOf(e, tab);
    if (cmd.glyph) {
      const g = t.glyphs.find((s) => s.item === cmd.glyph);
      if (!g) return fail(e, cmd, 'no_item');
      const qty = Math.max(1, Math.min(g.qty, cmd.qty | 0 || g.qty));
      g.qty -= qty;
      if (g.qty <= 0) t.glyphs.splice(t.glyphs.indexOf(g), 1);
      if (!e.gbag) e.gbag = [];
      pouchAdd(e.gbag, g.item, qty);
      emit({ type: 'chest', id: e.id, kind: 'take', tab, item: g.item, qty, glyph: true, shared: changed([tab]) });
      return true;
    }
    const k = slotAt(t, cmd);
    if (k < 0) return fail(e, cmd, 'no_item');
    const s = t.items[k];
    const qty = Math.max(1, Math.min(s.qty, cmd.qty | 0 || s.qty));
    if (bagRoom(e, s.item, s.inst) < qty) return fail(e, cmd, 'bag_full', s.item);
    bagAdd(e, s.item, qty, s.inst || null, content);
    if (qty >= s.qty) t.items.splice(k, 1); else s.qty -= qty;
    emit({ type: 'chest', id: e.id, kind: 'take', tab, item: s.item, qty, shared: changed([tab]) });
    if (ctx.onBag) ctx.onBag(e);
    return true;
  }

  /** From one tab to the other (the hero's own and Shared). */
  function move(e, cmd) {
    if (!atChest(e, cmd)) return false;
    const from = tabName(cmd.tab), to = from === 'hero' ? 'shared' : 'hero';
    const a = tabOf(e, from), b = tabOf(e, to);
    if (cmd.glyph) {
      const g = a.glyphs.find((s) => s.item === cmd.glyph);
      if (!g) return fail(e, cmd, 'no_item');
      const qty = Math.max(1, Math.min(g.qty, cmd.qty | 0 || g.qty));
      g.qty -= qty;
      if (g.qty <= 0) a.glyphs.splice(a.glyphs.indexOf(g), 1);
      pouchAdd(b.glyphs, g.item, qty);
      emit({ type: 'chest', id: e.id, kind: 'move', tab: from, to, item: g.item, qty, glyph: true, shared: true });
      return true;
    }
    const k = slotAt(a, cmd);
    if (k < 0) return fail(e, cmd, 'no_item');
    const s = a.items[k];
    const qty = Math.max(1, Math.min(s.qty, cmd.qty | 0 || s.qty));
    if (roomIn(to, b, s.item, s.inst) < qty) return fail(e, cmd, 'chest_full', s.item);
    tabAdd(to, b, s.item, qty, s.inst || null);
    if (qty >= s.qty) a.items.splice(k, 1); else s.qty -= qty;
    emit({ type: 'chest', id: e.id, kind: 'move', tab: from, to, item: s.item, qty, shared: true });
    return true;
  }

  /** Buy the next row of a tab (one at a time; the hero pays, the row belongs to the tab). */
  function buyRow(e, cmd) {
    if (!atChest(e, cmd)) return false;
    const tab = tabName(cmd.tab);
    const t = tabOf(e, tab);
    const price = rule(tab).rowPrices[t.rows];
    if (price == null || capacity(tab, t) >= rule(tab).max) return fail(e, cmd, 'max');
    if ((e.gold || 0) < price) return fail(e, cmd, 'gold');
    e.gold -= price;
    t.rows++;
    emit({ type: 'chest', id: e.id, kind: 'row', tab, cost: price, size: capacity(tab, t), shared: changed([tab]) });
    emit({ type: 'gold', id: e.id, amount: -price, total: e.gold, source: 'chest_row' });
    return true;
  }

  /** Sort a tab: stacks merge, then by kind, rarity (best first), name, item level. */
  function sort(e, cmd) {
    if (!atChest(e, cmd)) return false;
    const tab = tabName(cmd.tab);
    const t = tabOf(e, tab);
    const kinds = (R.sortKinds || []), rar = (R.sortRarity || []);
    const rank = (list, v) => { const i = list.indexOf(v); return i < 0 ? list.length : i; };
    const key = (s) => {
      const d = items[s.item] || {};
      return [rank(kinds, d.kind), rank(rar, (s.inst && s.inst.rarity) || d.rarity || 'common'), d.name || s.item, s.item, -((s.inst && s.inst.ilvl) || d.level || 0)];
    };
    const cmp = (a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; } return b.qty - a.qty; };
    // merge loose stacks of the same item first, then order
    const merged = [];
    for (const s of t.items) {
      if (!s.inst) {
        const stack = stackOf(s.item, null);
        let left = s.qty;
        for (const m of merged) { if (left <= 0) break; if (m.item === s.item && !m.inst && m.qty < stack) { const k = Math.min(stack - m.qty, left); m.qty += k; left -= k; } }
        if (left > 0) merged.push({ item: s.item, qty: left });
      } else merged.push(clone(s));
    }
    t.items = merged.sort(cmp);
    emit({ type: 'chest', id: e.id, kind: 'sort', tab, shared: changed([tab]) });
    return true;
  }

  return {
    spawnChests(add, nextId) {
      for (const c of content.lanternChests || []) {
        const zone = content.zones[c.zone];
        if (!zone) continue;
        const [x, y] = ctx.tileToSub(c.x, c.y);
        add({ id: nextId(), kind: 'object', zone: c.zone, x, y, dir: 'down', moving: false, name: c.name || 'Lantern Chest', level: 1, faction: 'neutral',
          sprite: 'lantern_chest', template: c.id, hp: 1, hpMax: 1, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
          stats: { str: 0, agi: 0, int: 0, spi: 0, sta: 0, armor: 0 }, chest: { id: c.id, place: c.place || null } });
      }
    },
    open(e, c) {
      if (ctx.distPx(e, c) > (ctx.openReach || ctx.reach)) { emit({ type: 'interact_fail', src: e.id, id: c.id, reason: 'range' }); return false; }
      if (e.dead) { emit({ type: 'interact_fail', src: e.id, id: c.id, reason: 'dead' }); return false; }
      if (e.inCombat) { emit({ type: 'interact_fail', src: e.id, id: c.id, reason: 'combat' }); return false; }
      e.chestAt = c.id;
      emit({ type: 'chest_open', src: e.id, id: c.id, chest: c.chest.id, place: c.chest.place || null });
      return true;
    },
    command(e, cmd) {
      switch (cmd.t) {
        case 'chest_store': return store(e, cmd);
        case 'chest_take': return take(e, cmd);
        case 'chest_move': return move(e, cmd);
        case 'chest_row': return buyRow(e, cmd);
        case 'chest_sort': return sort(e, cmd);
        default: return false;
      }
    },
    /** The HUD block while the hero stands at the chest they opened (null otherwise, so the snapshot stays small). */
    view(e, itemView) {
      const c = e.chestAt != null ? ctx.get(e.chestAt) : null;
      if (!c || !c.chest || c.zone !== e.zone || ctx.distPx(e, c) > ctx.reach) return null;
      const tabView = (tab) => {
        const t = tab === 'shared' ? state.shared : (e.chest || emptyTab());   // a view never writes state (hash)
        const r = rule(tab);
        const size = capacity(tab, t);
        return { size, rows: t.rows, max: r.max, nextPrice: size < r.max && r.rowPrices[t.rows] != null ? r.rowPrices[t.rows] : null,
          items: t.items.map((s) => itemView(e, s)), glyphs: t.glyphs.map((g) => ({ item: g.item, qty: g.qty, letter: (items[g.item] || {}).letter || '?' })) };
      };
      return { chest: c.id, place: c.chest.place || null, hero: tabView('hero'), shared: tabView('shared') };
    },
    saveOf(e) { return e.chest ? clone(e.chest) : null; },
    restore(e, spec) {
      if (spec.chest) e.chest = cleanTab(spec.chest, content);
      if (Number.isFinite(spec.glyphSeen)) e.glyphSeen = spec.glyphSeen >>> 0;   // wave 9 music: letters ever found
      if (Array.isArray(spec.gbag)) { e.gbag = []; for (const g of spec.gbag) if (g && isGlyph(content, g.item) && g.qty > 0) pouchAdd(e.gbag, g.item, g.qty | 0); }
    },
    shared() { return clone(state.shared); },
    setShared(obj) { state.shared = cleanTab(obj, content); },
  };
}

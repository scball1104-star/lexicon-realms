// The raid's rules (wave 10 draid, 2026-11-25; Scott: "Go with your recommendations"; wing 2 2026-11-26; the data is
// src/data/raid_endmarket.js, src/data/raid_endmarket_streets.js and src/data/raid_places.js, content.raid). Pure: no
// clock, no Math.random (the world rng).
//
//   const RD = createRaid(D)   D = { state, content, emit, rng, get, add, remove, spawnMob, bagAdd, onBag, combat, ai }
//   RD.isRaid(zid)             is this zone a raid place (or a copy of one)
//   RD.onKill(mob, p, drop)    per hero who shares the kill: the lockout, a Lot or Street Ticket, the Purse
//   RD.useTicket(e, def, u)    a Lot Ticket or a Street Ticket turned into gear -> null, or the reason it failed
//   RD.tick()                  once per world step: the bosses' party rules (toll, pen, Weigh the Lot, Sold!, Hook)
//   RD.weekOf(day)             the Eastern Monday week of a sim day
//
// The lockout. Loot once per hero, per boss, per Eastern calendar week: the week is worked out from the sim's day
// (world.setDay, the same day the bounty boards use), so no new clock enters the sim. A hero who killed a boss this week
// still gets its gold, never its loot. Boss kills are not kept between sittings: a copy resets as every dungeon copy does.
// A lone hero (fewer than RAID_RULES.minParty heroes inside the copy) gets gold only. Saved per hero as
// `p.raid = { week, killed: [bossIds], purse: [placeIds] }` (saveFields; additive, SAVE_VERSION unchanged).
//
// Teamwork rules cost a lone hero time, never damage they cannot avoid: alone in the toll ring you are held in place
// (the toll is paid in time), and a penned hero alone breaks their own hurdle with no flock trampling them.
import { zoneBase } from './dungeons.js';

const TICK_HZ = 20;
const T = (sec) => Math.round((sec || 0) * TICK_HZ);
const SUB = 16;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz', VOWELS = 'aeiou';

/** The Monday week of an Eastern day number. The same rule as src/sim/eastern_week.js easternWeek (wave 10 dflow); the
 *  lead joins the two at merge (this file then imports it). Day 0 (1970-01-01) was a Thursday, day -3 a Monday. */
export function easternWeek(day) { return Math.floor(((day | 0) + 3) / 7); }

export function createRaid(D) {
  const { state, content, emit, rng } = D;
  const RR = content.raid;
  if (!RR) return null;
  const PL = content.dungeons || {};
  const zones = content.zones;
  const now = () => state.tick;
  const K = () => D.combat();
  const items = () => content.items || {};
  const placeOf = (zid) => { const p = PL[zoneBase(zid)]; return p && p.raid ? p : null; };
  const isRaid = (zid) => !!placeOf(zid);
  const weekOf = (day = state.day) => easternWeek(day);
  const heroesIn = (zid, alive = false) => state.ents.filter((e) => e.kind === 'player' && e.zone === zid && (!alive || !e.dead));
  const distPx = (a, x, y) => Math.hypot(a.x - x, a.y - y) / SUB;

  function raidOf(p) {
    const w = weekOf();
    if (!p.raid || typeof p.raid !== 'object' || p.raid.week !== w) p.raid = { week: w, killed: [], purse: [] };
    p.raid.killed = p.raid.killed || []; p.raid.purse = p.raid.purse || [];
    return p.raid;
  }
  const setFor = (cls) => Object.values(content.sets || {}).find((s) => s.tier === 'endmarket' && s.cls === cls) || null;
  function owns(p, id) {
    if (Object.values(p.equip || {}).some((x) => x && (typeof x === 'string' ? x : x.item) === id)) return true;
    return (p.bag || []).some((x) => x && x.item === id);
  }
  const ticketId = (slot) => String(slot).startsWith('street_') ? `street_ticket_${slot.slice(7)}` : `lot_ticket_${slot}`;
  const holdsTicket = (p, slot) => (p.bag || []).some((x) => x && x.item === ticketId(slot));
  function streetIds(cls, kind) {
    const G = RR.streetGear || {};
    if (kind === 'trinket' || (kind === 'off' && cls === 'wayfinder')) return [...(G.trinket || [])];
    const one = G[kind] && G[kind][cls];
    return one ? [one] : [];
  }
  function ownsSlot(p, slot) {
    if (String(slot).startsWith('street_')) return streetIds(p.cls, slot.slice(7)).some((id) => owns(p, id)) || holdsTicket(p, slot);
    const set = setFor(p.cls);
    return !!(set && set.pieces[slot] && owns(p, set.pieces[slot][0])) || holdsTicket(p, slot);
  }
  function slotFor(p, slots) {
    const lacking = slots.filter((s) => !ownsSlot(p, s));
    const pool = lacking.length ? lacking : slots;
    return pool[rng.int(0, pool.length - 1)];
  }
  const tilePx = (xy) => ({ x: xy[0] * 256 + 128, y: (xy[1] + 1) * 256 - 16 });
  const keepOnlyQuest = (drop) => { drop.items = drop.items.filter((it) => { const d = items()[it.item]; return d && d.kind === 'quest'; }); };

  function onKill(mob, p, drop) {
    const place = placeOf(mob.zone);
    if (!place || !p || p.kind !== 'player' || !(place.bosses || []).includes(mob.template)) return;
    const tpl = mob.template;
    const n = heroesIn(mob.zone).length;
    const r = raidOf(p);
    if (n < (RR.minParty || 2)) { keepOnlyQuest(drop); emit({ type: 'raid_loot', id: p.id, place: place.id, boss: tpl, kind: 'alone', heroes: n }); return; }
    if (r.killed.includes(tpl)) { keepOnlyQuest(drop); emit({ type: 'raid_loot', id: p.id, place: place.id, boss: tpl, kind: 'locked', week: r.week }); return; }
    r.killed.push(tpl);
    const slot = slotFor(p, (RR.ticketSlots || {})[tpl] || ['head', 'chest', 'legs', 'hands', 'feet']);
    drop.items.push({ item: ticketId(slot), qty: 1 });
    emit({ type: 'raid_loot', id: p.id, place: place.id, boss: tpl, kind: 'ticket', slot, week: r.week });
    if (tpl !== place.last || r.purse.includes(place.id)) return;
    // the Fair Purse or the Street Purse: the first kill of the wing's last boss this week (per place, so both can drop)
    r.purse.push(place.id);
    const pu = (RR.purses && RR.purses[place.id]) || RR.purse || { gold: [100, 150], glyphs: 3, tickets: 1 };
    const gold = rng.int(pu.gold[0], Math.max(pu.gold[0], pu.gold[1]));
    drop.gold = (drop.gold || 0) + gold;
    const glyphs = [];
    for (let i = 0; i < (pu.glyphs || 0); i++) {
      const pool = rng.chance(0.2) ? VOWELS : LETTERS.split('').filter((L) => !VOWELS.includes(L)).join('');
      const id = `glyph_${pool[rng.int(0, pool.length - 1)]}`;
      if (items()[id]) { drop.items.push({ item: id, qty: 1 }); glyphs.push(id); }
    }
    const tickets = [];
    const purseSlots = place.id === 'endmarket_streets'
      ? ['head', 'chest', 'legs', 'hands', 'feet', 'street_weapon', 'street_off', 'street_trinket']
      : ['head', 'chest', 'legs', 'hands', 'feet'];
    for (let i = 0; i < (pu.tickets || 0); i++) { const s = slotFor(p, purseSlots); drop.items.push({ item: ticketId(s), qty: 1 }); tickets.push(s); }
    emit({ type: 'raid_purse', id: p.id, place: place.id, gold, glyphs, tickets, week: r.week });
  }

  /** A Street Ticket: the class weapon, off-hand or a trinket they lack (a Wayfinder's off ticket is a trinket). */
  function useStreetTicket(e, def, u) {
    const kind = u.slot;
    let ids = streetIds(e.cls, kind);
    if (!ids.length) return 'no_item';
    let id = ids.find((i) => !owns(e, i)) || ids[0];
    if (owns(e, id)) {
      const G = RR.streetGear || {};
      const all = [...new Set([...Object.values(G.weapon || {}), ...Object.values(G.off || {}), ...(G.trinket || [])])];
      const lack = all.find((i) => items()[i] && (!items()[i].classes || items()[i].classes.includes(e.cls)) && !owns(e, i));
      if (lack) id = lack;
    }
    const it = items()[id];
    if (!it) return 'no_item';
    const inst = { ilvl: it.level, rarity: it.rarity || 'epic', affixes: [], armorType: it.armorType || null, weaponType: it.weaponType || null };
    if (D.bagAdd(e, id, 1, inst, content) < 1) return 'bag_full';
    emit({ type: 'raid_ticket', id: e.id, ticket: def.id, item: id, slot: kind, kind: 'street' });
    emit({ type: 'loot', id: e.id, from: e.id, gold: 0, items: [{ item: id, qty: 1, inst }] });
    return null;
  }
  /** A Lot Ticket: the hero's class piece for its slot (a slot they already own a piece of becomes one they lack). */
  function useTicket(e, def, u) {
    if ((u && u.ticket === 'street') || String(def.id || '').startsWith('street_ticket_')) return useStreetTicket(e, def, u);
    const set = setFor(e.cls);
    if (!set) return 'no_set';
    let slot = u.slot;
    if (owns(e, set.pieces[slot][0])) { const lack = Object.keys(set.pieces).find((s) => !owns(e, set.pieces[s][0])); if (lack) slot = lack; }
    const id = set.pieces[slot][0];
    const cg = (content.classGear || {})[e.cls];
    const inst = { ilvl: items()[id].level, rarity: 'set', affixes: [], armorType: cg ? cg.armor : set.armor };
    if (D.bagAdd(e, id, 1, inst, content) < 1) return 'bag_full';
    emit({ type: 'raid_ticket', id: e.id, ticket: def.id, item: id, slot });
    emit({ type: 'loot', id: e.id, from: e.id, gold: 0, items: [{ item: id, qty: 1, inst }] });
    return null;
  }

  // ---------------------------------------------------------------- the bosses' party rules
  function freeNear(zid, tx, ty) {
    const z = zones[zid];
    const ok = (x, y) => z.collision[y] && z.collision[y][x] === '.';
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) if (ok(tx + dx, ty + dy)) return [tx + dx, ty + dy];
    return [tx, ty];
  }
  function toll(m, b) {
    const R = RR.toll;
    if (m.cast && m.cast.ability === 'em_pay_toll' && !b.toll && m.cast.at) b.toll = { x: m.cast.at.x, y: m.cast.at.y, end: m.cast.endTick };
    if (!b.toll || now() < b.toll.end) return;
    const { x, y } = b.toll;
    b.toll = null;
    const heroes = heroesIn(m.zone, true);
    if (!heroes.length) return;
    const inside = heroes.filter((h) => distPx(h, x, y) <= R.radiusPx);
    const portion = (h) => K().rawAmount(m, h, { mobHit: R.swings }, {});
    if (heroes.length === 1) {
      const h = heroes[0];
      if (inside.length) K().applyAura(m, h, { id: 'em_toll_paid', name: 'Toll Paid', icon: 'stun', kind: 'debuff', duration: R.soloRootSec, flags: ['root'] }, {});
      else K().dealDamage(m, h, portion(h), { ability: 'em_pay_toll', school: 'physical' });
    } else if (inside.length) {
      const total = heroes.reduce((s, h) => s + portion(h), 0);
      for (const h of inside) K().dealDamage(m, h, total / inside.length, { ability: 'em_pay_toll', school: 'physical' });
    } else {
      for (const h of heroes) K().dealDamage(m, h, portion(h) * (1 + R.unpaidMult), { ability: 'em_pay_toll', school: 'physical' });
    }
    emit({ type: 'raid_toll', id: m.id, zone: m.zone, heroes: heroes.length, inside: inside.length });
  }
  function herd(m, b) {
    const R = RR.herd;
    if (b.pen) {
      const h = D.get(b.pen.hero), u = D.get(b.pen.hurdle);
      const free = !u || u.dead || !h || h.dead || h.zone !== m.zone;
      if (free || now() >= b.pen.until) {
        if (h) for (const a of [...(h.auras || [])]) if (a.id === 'em_penned') K().removeAura(h, a, 'cancel');
        if (u && !u.dead) { D.remove(u); emit({ type: 'despawn', id: u.id, template: u.template, zone: u.zone, kind: 'mob' }); }
        emit({ type: 'raid_pen', id: m.id, zone: m.zone, kind: free ? 'broken' : 'out', hero: b.pen.hero });
        b.pen = null;
      } else if ((now() - b.pen.at) % TICK_HZ === 0 && now() > b.pen.at && heroesIn(m.zone, true).length > 1) {
        K().dealDamage(m, h, K().rawAmount(m, h, { mobHit: R.flockSwings }, {}), { ability: 'em_flock', school: 'physical' });
      }
      return;
    }
    if (now() < b.nextHerd) return;
    b.nextHerd = now() + T(R.every);
    const heroes = heroesIn(m.zone, true).filter((h) => distPx(h, m.x, m.y) <= 30 * 16);
    if (!heroes.length) return;
    const pool = heroes.length > 1 ? heroes.filter((h) => h.id !== m.ai.target) : heroes;
    const h = pool.slice().sort((a, c) => distPx(c, m.x, m.y) - distPx(a, m.x, m.y) || a.id - c.id)[0];
    K().applyAura(m, h, { id: 'em_penned', name: 'Penned', icon: 'stun', kind: 'debuff', duration: R.pennedSec, flags: ['root'] }, {});
    const [tx, ty] = freeNear(m.zone, Math.floor(h.x / 256), Math.floor((h.y - 1) / 256));
    const u = D.spawnMob({ zone: m.zone, mob: 'em_hurdle', level: m.level, x: tx, y: ty, wander: 0, temporary: true });
    u.raidPen = h.id;
    b.pen = { hero: h.id, hurdle: u.id, at: now(), until: now() + T(R.pennedSec) };
    emit({ type: 'yell', id: m.id, text: 'Come by! Come by!' });
    emit({ type: 'raid_pen', id: m.id, zone: m.zone, kind: 'penned', hero: h.id, hurdle: u.id });
  }

  function knockFrom(h, fromX, fromY, tiles) {
    const z = zones[h.zone];
    if (!z) return;
    const dx = h.x - fromX, dy = h.y - fromY, len = Math.hypot(dx, dy) || 1;
    const nx = h.x + (dx / len) * tiles * 256, ny = h.y + (dy / len) * tiles * 256;
    const tx = Math.floor(nx / 256), ty = Math.floor((ny - 1) / 256);
    if (z.collision[ty] && z.collision[ty][tx] === '.') { h.x = nx; h.y = ny; }
  }
  function pullToward(h, m, sub) {
    const z = zones[h.zone];
    if (!z) return;
    const dx = m.x - h.x, dy = m.y - h.y, len = Math.hypot(dx, dy) || 1;
    const nx = h.x + (dx / len) * sub, ny = h.y + (dy / len) * sub;
    const tx = Math.floor(nx / 256), ty = Math.floor((ny - 1) / 256);
    if (z.collision[ty] && z.collision[ty][tx] === '.') { h.x = nx; h.y = ny; }
  }
  function weigh(m, b) {
    const R = RR.weigh;
    if (!R) return;
    if (m.cast && m.cast.ability === 'em_weigh_lot') {
      if (!b.weigh) {
        const heroes = heroesIn(m.zone, true);
        const heavy = heroes.find((h) => h.id === m.ai.target) || heroes[0];
        if (heavy) K().applyAura(m, heavy, { id: 'em_heavy', name: 'Heavy', icon: 'stun', kind: 'debuff', duration: (R.castSec || 3) + 0.5 }, {});
        b.weigh = { end: m.cast.endTick, heavy: heavy ? heavy.id : null };
        emit({ type: 'raid_weigh', id: m.id, zone: m.zone, kind: 'start', heavy: heavy ? heavy.id : null });
      }
      return;
    }
    if (!b.weigh || now() < b.weigh.end) return;
    const gold = tilePx(R.gold), blue = tilePx(R.blue);
    const on = (h, p) => distPx(h, p.x, p.y) <= R.radiusPx;
    const heroes = heroesIn(m.zone, true);
    const heavy = D.get(b.weigh.heavy);
    b.weigh = null;
    if (!heroes.length) return;
    const goldPaid = !!(heavy && !heavy.dead && heavy.zone === m.zone && on(heavy, gold));
    const bluePaid = heroes.some((h) => (!heavy || h.id !== heavy.id) && on(h, blue));
    const mid = tilePx([Math.round((R.gold[0] + R.blue[0]) / 2), Math.round((R.gold[1] + R.blue[1]) / 2)]);
    if (heroes.length === 1) {
      const h = heroes[0];
      if (goldPaid || on(h, gold)) K().applyAura(m, h, { id: 'em_weigh_paid', name: 'Weighed', icon: 'stun', kind: 'debuff', duration: R.soloRootSec, flags: ['root'] }, {});
      else { K().dealDamage(m, h, K().rawAmount(m, h, { mobHit: R.paidSwings }, {}) * (1 + R.unpaidMult), { ability: 'em_weigh_lot', school: 'physical' }); knockFrom(h, mid.x, mid.y, 1.5); }
      emit({ type: 'raid_weigh', id: m.id, zone: m.zone, kind: goldPaid || on(h, gold) ? 'solo' : 'unpaid', heroes: 1, gold: goldPaid || on(h, gold), blue: false });
      return;
    }
    if (goldPaid && bluePaid) {
      const inside = heroes.filter((h) => on(h, gold) || on(h, blue));
      const total = heroes.reduce((s, h) => s + K().rawAmount(m, h, { mobHit: R.paidSwings }, {}), 0);
      for (const h of inside) K().dealDamage(m, h, total / inside.length, { ability: 'em_weigh_lot', school: 'physical' });
      emit({ type: 'raid_weigh', id: m.id, zone: m.zone, kind: 'paid', heroes: heroes.length, gold: true, blue: true, inside: inside.length });
    } else {
      for (const h of heroes) {
        if (on(h, gold) || on(h, blue)) continue;
        K().dealDamage(m, h, K().rawAmount(m, h, { mobHit: R.paidSwings }, {}) * (1 + R.unpaidMult), { ability: 'em_weigh_lot', school: 'physical' });
        knockFrom(h, mid.x, mid.y, 1.5);
      }
      emit({ type: 'raid_weigh', id: m.id, zone: m.zone, kind: 'unpaid', heroes: heroes.length, gold: goldPaid, blue: bluePaid });
    }
  }
  function onStall(h, color, R) {
    const p = tilePx(R.stalls[color]);
    return distPx(h, p.x, p.y) <= (R.radiusPx || 40);
  }
  function startSold(m, b, R, opts) {
    const heroes = heroesIn(m.zone, true);
    if (!heroes.length) return;
    const pool = heroes.length > 1 ? heroes.filter((h) => h.id !== m.ai.target) : heroes;
    const h = (opts.hero && D.get(opts.hero) && !D.get(opts.hero).dead) ? D.get(opts.hero) : pool.slice().sort((a, c) => a.id - c.id)[0];
    if (!h) return;
    let color = opts.color;
    if (!color) {
      if (heroes.length === 1) color = R.colors.slice().sort((a, c) => distPx(h, tilePx(R.stalls[a]).x, tilePx(R.stalls[a]).y) - distPx(h, tilePx(R.stalls[c]).x, tilePx(R.stalls[c]).y))[0];
      else color = R.colors[rng.int(0, R.colors.length - 1)];
    }
    const win = heroes.length === 1 ? R.soloWindowSec : (opts.jump ? R.jumpSec : R.windowSec);
    K().applyAura(m, h, { id: 'em_sold_tag', name: 'Sold!', icon: 'icon_scroll', kind: 'debuff', duration: win, dispel: 'magic' }, {});
    h.soldColor = color;
    b.sold = { hero: h.id, color, until: now() + T(win), jumped: !!opts.jump || !!(opts.jumped) };
    emit({ type: 'yell', id: m.id, text: `Sold! ${color}!` });
    emit({ type: 'raid_sold', id: m.id, zone: m.zone, kind: opts.jump ? 'jump' : 'tag', hero: h.id, color });
  }
  function sold(m, b) {
    const R = RR.sold;
    if (!R) return;
    if (b.sold) {
      const h = D.get(b.sold.hero);
      const has = !!(h && !h.dead && h.zone === m.zone && (h.auras || []).some((a) => a.id === 'em_sold_tag'));
      if (!has) { emit({ type: 'raid_sold', id: m.id, zone: m.zone, kind: 'cleared', hero: b.sold.hero, color: b.sold.color }); b.sold = null; return; }
      if (onStall(h, b.sold.color, R)) {
        for (const a of [...(h.auras || [])]) if (a.id === 'em_sold_tag') K().removeAura(h, a, 'cancel');
        delete h.soldColor;
        emit({ type: 'raid_sold', id: m.id, zone: m.zone, kind: 'paid', hero: h.id, color: b.sold.color });
        b.sold = null;
        return;
      }
      if (now() < b.sold.until) return;
      const friends = heroesIn(m.zone, true).filter((x) => x.id !== h.id && onStall(x, b.sold.color, R));
      const portion = K().rawAmount(m, h, { mobHit: R.burstSwings }, {});
      const split = friends.length ? [h, ...friends] : [h];
      for (const t of split) K().dealDamage(m, t, portion / split.length, { ability: 'em_sold', school: 'shadow' });
      for (const a of [...(h.auras || [])]) if (a.id === 'em_sold_tag') K().removeAura(h, a, 'expire');
      const color = b.sold.color, jumped = b.sold.jumped, hero = h.id;
      delete h.soldColor;
      b.sold = null;
      emit({ type: 'raid_sold', id: m.id, zone: m.zone, kind: 'fail', hero, color, split: split.length });
      if (heroesIn(m.zone, true).length > 1 && !jumped) {
        const next = R.colors.find((c) => c !== color) || R.colors[0];
        startSold(m, b, R, { hero, color: next, jump: true, jumped: true });
      }
      return;
    }
    if (now() < b.nextSold) return;
    b.nextSold = now() + T(R.every);
    startSold(m, b, R, {});
  }
  function hookClear(m, b, kind) {
    const h = b.hook && D.get(b.hook.hero), u = b.hook && D.get(b.hook.ring);
    if (h) for (const a of [...(h.auras || [])]) if (a.id === 'em_hooked' || a.id === 'em_hook_root') K().removeAura(h, a, 'cancel');
    if (u && !u.dead) { D.remove(u); emit({ type: 'despawn', id: u.id, template: u.template, zone: u.zone, kind: 'mob' }); }
    emit({ type: 'raid_hook', id: m.id, zone: m.zone, kind, hero: b.hook && b.hook.hero, ring: b.hook && b.hook.ring });
    b.hook = null;
  }
  function hook(m, b) {
    const R = RR.hook;
    if (!R) return;
    if (b.hook) {
      const h = D.get(b.hook.hero), u = D.get(b.hook.ring);
      const broken = !u || u.dead;
      const gone = !h || h.dead || h.zone !== m.zone;
      if (broken || gone) { hookClear(m, b, broken && !gone ? 'broken' : 'out'); return; }
      if (now() >= b.hook.until) {
        K().dealDamage(m, h, K().rawAmount(m, h, { mobHit: R.failSwings }, {}), { ability: 'em_hook_draw', school: 'physical' });
        K().applyAura(m, h, { id: 'em_hook_stun', name: 'Hooked', icon: 'stun', kind: 'debuff', duration: R.stunSec, flags: ['stun'] }, {});
        pullToward(h, m, 2 * 256);
        hookClear(m, b, 'fail');
        return;
      }
      if (heroesIn(m.zone, true).length > 1) pullToward(h, m, (R.pullSpeed || 28) * 16 / TICK_HZ);
      return;
    }
    if (now() < b.nextHook) return;
    b.nextHook = now() + T(R.every);
    const heroes = heroesIn(m.zone, true).filter((h) => distPx(h, m.x, m.y) <= 30 * 16);
    if (!heroes.length) return;
    const pool = heroes.length > 1 ? heroes.filter((h) => h.id !== m.ai.target) : heroes;
    const h = pool.slice().sort((a, c) => distPx(c, m.x, m.y) - distPx(a, m.x, m.y) || a.id - c.id)[0];
    const solo = heroes.length === 1;
    if (solo) K().applyAura(m, h, { id: 'em_hook_root', name: 'Hooked', icon: 'stun', kind: 'debuff', duration: R.soloRootSec, flags: ['root'] }, {});
    else K().applyAura(m, h, { id: 'em_hooked', name: 'Hook and Draw', icon: 'icon_slow', kind: 'debuff', duration: R.windowSec, flags: ['slow'], mods: [{ stat: 'speed', add: -0.4 }] }, {});
    const [hx, hy] = [Math.floor(h.x / 256), Math.floor((h.y - 1) / 256)];
    const [bx, by] = [Math.floor(m.x / 256), Math.floor((m.y - 1) / 256)];
    const [tx, ty] = freeNear(m.zone, solo ? hx : bx, solo ? hy : by);
    const u = D.spawnMob({ zone: m.zone, mob: 'em_chain_ring', level: m.level, x: tx, y: ty, wander: 0, temporary: true });
    b.hook = { hero: h.id, ring: u.id, at: now(), until: now() + T(R.windowSec) };
    emit({ type: 'yell', id: m.id, text: 'The hook finds you!' });
    emit({ type: 'raid_hook', id: m.id, zone: m.zone, kind: 'hooked', hero: h.id, ring: u.id });
  }
  const RULES = { em_turnpike: toll, em_old_shep: herd, em_weighmaster: weigh, em_crier: sold, em_catchpole: hook };


  function tick() {
    const cs = state.copies;
    if (!cs) return;
    let any = false;
    for (const zid of Object.keys(cs)) if (isRaid(zid)) { any = true; break; }
    if (!any) return;
    for (const m of state.ents) {
      if (m.kind !== 'mob' || !RULES[m.template] || !isRaid(m.zone)) continue;
      const fighting = !m.dead && m.ai && m.ai.mode === 'combat';
      if (!fighting) {
        if (m.ai && m.ai.raid) { raidClear(m, m.ai.raid); m.ai.raid = null; }
        continue;
      }
      const b = m.ai.raid || (m.ai.raid = {
        t0: now(), toll: null, pen: null, nextHerd: now() + T((RR.herd || {}).first || 10),
        weigh: null, sold: null, nextSold: now() + T((RR.sold || {}).first || 10),
        hook: null, nextHook: now() + T((RR.hook || {}).first || 12),
      });
      RULES[m.template](m, b);
    }
  }
  function herdClear(m, b) {
    const h = D.get(b.pen.hero), u = D.get(b.pen.hurdle);
    if (h) for (const a of [...(h.auras || [])]) if (a.id === 'em_penned') K().removeAura(h, a, 'cancel');
    if (u && !u.dead) { D.remove(u); emit({ type: 'despawn', id: u.id, template: u.template, zone: u.zone, kind: 'mob' }); }
    b.pen = null;
  }
  function raidClear(m, b) {
    if (b.pen) herdClear(m, b);
    if (b.hook) hookClear(m, b, 'out');
    if (b.sold) {
      const h = D.get(b.sold.hero);
      if (h) { for (const a of [...(h.auras || [])]) if (a.id === 'em_sold_tag') K().removeAura(h, a, 'cancel'); delete h.soldColor; }
      b.sold = null;
    }
    if (b.weigh) {
      const h = D.get(b.weigh.heavy);
      if (h) for (const a of [...(h.auras || [])]) if (a.id === 'em_heavy' || a.id === 'em_weigh_paid') K().removeAura(h, a, 'cancel');
      b.weigh = null;
    }
  }

  return { isRaid, placeOf, onKill, useTicket, tick, weekOf, raidOf, setFor };
}

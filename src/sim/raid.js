// The raid's rules (wave 10 draid, wave A, 2026-11-25; Scott: "Go with your recommendations"; the data is
// src/data/raid_endmarket.js and src/data/raid_places.js, content.raid). Pure: no clock, no Math.random (the world rng).
//
//   const RD = createRaid(D)   D = { state, content, emit, rng, get, add, remove, spawnMob, bagAdd, onBag, combat, ai }
//   RD.isRaid(zid)             is this zone a raid place (or a copy of one)
//   RD.onKill(mob, p, drop)    per hero who shares the kill: the lockout, a Lot Ticket, the Fair Purse (after DG.onKill)
//   RD.useTicket(e, def, u)    a Lot Ticket turned into the hero's class set piece -> null, or the reason it failed
//   RD.tick()                  once per world step: the bosses' party rules (the Turnpike's toll, Old Shep's pen)
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
  const holdsTicket = (p, slot) => (p.bag || []).some((x) => x && x.item === `lot_ticket_${slot}`);
  function slotFor(p, slots) {
    const set = setFor(p.cls);
    const lacking = slots.filter((s) => !(set && set.pieces[s] && owns(p, set.pieces[s][0])) && !holdsTicket(p, s));
    const pool = lacking.length ? lacking : slots;
    return pool[rng.int(0, pool.length - 1)];
  }
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
    drop.items.push({ item: `lot_ticket_${slot}`, qty: 1 });
    emit({ type: 'raid_loot', id: p.id, place: place.id, boss: tpl, kind: 'ticket', slot, week: r.week });
    if (tpl !== place.last || r.purse.includes(place.id)) return;
    // the Fair Purse: the first kill of the wing's last boss this week
    r.purse.push(place.id);
    const pu = RR.purse || { gold: [100, 150], glyphs: 3, tickets: 1 };
    const gold = rng.int(pu.gold[0], Math.max(pu.gold[0], pu.gold[1]));
    drop.gold = (drop.gold || 0) + gold;
    const glyphs = [];
    for (let i = 0; i < (pu.glyphs || 0); i++) {
      const pool = rng.chance(0.2) ? VOWELS : LETTERS.split('').filter((L) => !VOWELS.includes(L)).join('');
      const id = `glyph_${pool[rng.int(0, pool.length - 1)]}`;
      if (items()[id]) { drop.items.push({ item: id, qty: 1 }); glyphs.push(id); }
    }
    const tickets = [];
    for (let i = 0; i < (pu.tickets || 0); i++) { const s = slotFor(p, ['head', 'chest', 'legs', 'hands', 'feet']); drop.items.push({ item: `lot_ticket_${s}`, qty: 1 }); tickets.push(s); }
    emit({ type: 'raid_purse', id: p.id, place: place.id, gold, glyphs, tickets, week: r.week });
  }

  /** A Lot Ticket: the hero's class piece for its slot (a slot they already own a piece of becomes one they lack). */
  function useTicket(e, def, u) {
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
  const RULES = { em_turnpike: toll, em_old_shep: herd };

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
        if (m.ai && m.ai.raid) { const b = m.ai.raid; if (b.pen) { b.until = 0; herdClear(m, b); } m.ai.raid = null; }
        continue;
      }
      const b = m.ai.raid || (m.ai.raid = { t0: now(), toll: null, pen: null, nextHerd: now() + T((RR.herd || {}).first || 10) });
      RULES[m.template](m, b);
    }
  }
  function herdClear(m, b) {
    const h = D.get(b.pen.hero), u = D.get(b.pen.hurdle);
    if (h) for (const a of [...(h.auras || [])]) if (a.id === 'em_penned') K().removeAura(h, a, 'cancel');
    if (u && !u.dead) { D.remove(u); emit({ type: 'despawn', id: u.id, template: u.template, zone: u.zone, kind: 'mob' }); }
    b.pen = null;
  }

  return { isRaid, placeOf, onKill, useTicket, tick, weekOf, raidOf, setFor };
}

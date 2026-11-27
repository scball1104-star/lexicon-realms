// The Endmarket raid (wave 10 draid): the frame (lockout, Lot and Street Tickets, the Fair Purse and the Street Purse, a
// lone hero gets gold only), the tier set, the doors and the way in, the bosses' party rules (both wings), and the party
// bot's gate (four heroes clear a wing with no wipe, at most 2 deaths, each boss 60 to 300 s; a party of two clears it
// too). Wing 2 bot runs are their own tests so each stays under the suite's time ceiling.
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { easternWeek } from '../../src/sim/raid.js';
import { partyRun, partyOk } from './party_bot.mjs';

let CC = null;
const content = () => CC || (CC = { ...buildContent(), nightSpawns: [] });
const assert = (c, m) => { if (!c) throw new Error(m); };
const DAY = 20418;           // Wednesday 2025-11-26 (any day works: the week is from the sim's day)

function party(n, { day = DAY, cls = ['warden', 'mender', 'wayfinder', 'inkblade'], place = 'endmarket_gate' } = {}) {
  const w = createWorld({ seed: 3, content: { ...content(), spawns: [] }, day });
  const ps = [];
  for (let i = 0; i < n; i++) { const id = w.addPlayer({ name: `H${i}`, cls: cls[i % cls.length], level: 30 }); w.setParty(id, 5); ps.push(w.get(id)); }
  let zid = null;
  for (const p of ps) { zid = w.internals.dungeons.enter(p, place); p.zone = zid; }
  for (const m of w.state.ents.filter((e) => e.zone === zid && e.kind === 'mob' && !(e.spawn && e.spawn.boss))) w.internals.remove(m);
  return { w, ps, zid };
}
function killBoss(w, ps, zid, tpl) {
  const b = w.state.ents.find((e) => e.zone === zid && e.template === tpl && !e.dead);
  for (const p of ps) { p.x = b.x; p.y = b.y + 512; }
  const ev = [];
  w.internals.combat.kill(b, ps[0]);
  ev.push(...w.step(2));
  return ev;
}
const tickets = (p) => (p.bag || []).filter((x) => /^(lot|street)_ticket_/.test(x.item)).reduce((s, x) => s + x.qty, 0);

export const tests = [
  {
    name: 'raid data: the place, its door in Drovers\' Reach (level 30), Mother Tally, the way in from Mael, five 5-piece sets',
    fn() {
      const C = content();
      const D = C.dungeons.endmarket_gate;
      assert(D && D.raid && D.bosses.join() === 'em_turnpike,em_old_shep' && D.last === 'em_old_shep', 'place');
      const door = (C.zones.drovers_reach.doors || []).find((d) => d.id === 'endmarket_gate');
      assert(door && door.minLevel === 30 && door.label === 'Raid for 4, level 30', 'door');
      assert(C.spawns.some((s) => s.npc === 'em_tally' && s.zone === 'drovers_reach'), 'Mother Tally');
      assert(C.quests.em_market_that_closed.giver === 'mael' && C.quests.em_market_that_closed.requires.quests[0] === 'dr_what_the_list_said', 'way in');
      assert(C.sideQuests.includes('em_pay_going_in'), 'side quests');
      const sets = Object.values(C.sets).filter((s) => s.tier === 'endmarket');
      assert(sets.length === 5 && sets.every((s) => Object.keys(s.pieces).length === 5 && s.bonus[2] && s.bonus[4] && s.bonus[5]), 'sets');
      for (const s of sets) for (const [id] of Object.values(s.pieces)) assert(C.items[id] && C.items[id].level === 32 && C.items[id].set === s.id, `piece ${id}`);
      for (const sl of ['head', 'chest', 'legs', 'hands', 'feet']) assert(C.items[`lot_ticket_${sl}`].use.kind === 'lot_ticket', 'ticket');
    },
  },
  {
    name: 'raid week: the Eastern Monday week from the sim day (Monday to Sunday share a week)',
    fn() {
      // day 20416 is Monday 2025-11-24 (day 0 = Thursday 1970-01-01), day 20422 the Sunday after
      assert(easternWeek(20416) === easternWeek(20422) && easternWeek(20415) === easternWeek(20416) - 1 && easternWeek(20423) === easternWeek(20416) + 1, 'week bounds');
    },
  },
  {
    name: 'raid lockout: a party of 2 gets a ticket each; the same boss again that week gives gold only; a new week loots again',
    fn() {
      const a = party(2);
      killBoss(a.w, a.ps, a.zid, 'em_turnpike');
      assert(a.ps.every((p) => tickets(p) === 1 && p.raid.killed.includes('em_turnpike')), 'first kill: a ticket each');
      // a second sitting the same week (a fresh copy)
      a.w.internals.dungeons.destroy(a.zid);
      for (const p of a.ps) { const z = a.w.internals.dungeons.enter(p, 'endmarket_gate'); p.zone = z; }
      killBoss(a.w, a.ps, a.zid, 'em_turnpike');
      assert(a.ps.every((p) => tickets(p) === 1 && p.raid.killed.length === 1), 'locked: no second ticket');
      // next week
      a.w.setDay(DAY + 7);
      a.w.internals.dungeons.destroy(a.zid);
      for (const p of a.ps) { const z = a.w.internals.dungeons.enter(p, 'endmarket_gate'); p.zone = z; }
      killBoss(a.w, a.ps, a.zid, 'em_turnpike');
      assert(a.ps.every((p) => tickets(p) === 2), 'a new week loots again');
    },
  },
  {
    name: 'raid: a lone hero gets gold only; the Fair Purse once a week for the wing\'s last boss in a party',
    fn() {
      const s = party(1);
      const bag0 = s.ps[0].bag.length, gold0 = s.ps[0].gold || 0;
      killBoss(s.w, s.ps, s.zid, 'em_old_shep');
      const lone = s.ps[0];
      assert(tickets(lone) === 0 && !(lone.raid && lone.raid.purse.length) && !(lone.raid && lone.raid.killed.length), 'alone: no ticket, no Purse, no lockout used');
      assert(lone.bag.length === bag0 && (lone.gold || 0) > gold0, 'alone: gold only');
      const p = party(3);
      killBoss(p.w, p.ps, p.zid, 'em_old_shep');
      assert(p.ps.every((h) => tickets(h) === 2 && h.raid.purse.includes('endmarket_gate')), 'boss ticket + Purse ticket');
    },
  },
  {
    name: 'raid tickets: a ticket turns into the class piece; a slot already owned becomes one the hero lacks; saved in saveFields',
    fn() {
      const { w, ps } = party(2);
      const p = ps[0];
      p.bag.push({ item: 'lot_ticket_head', qty: 2, uid: 77001 });
      w.enqueue(p.id, { t: 'use_item', item: 'lot_ticket_head' }); w.step(1);
      assert(p.bag.some((x) => x.item === 'gatebreaker_helm' && x.inst && x.inst.rarity === 'set'), 'helm');
      w.enqueue(p.id, { t: 'use_item', item: 'lot_ticket_head' }); w.step(1);
      assert(p.bag.filter((x) => x.item === 'gatebreaker_helm').length === 1 && p.bag.some((x) => /^gatebreaker_/.test(x.item) && x.item !== 'gatebreaker_helm'), 'owned slot -> a lacking one');
      p.raid = { week: w.internals.raid.weekOf(), killed: ['em_turnpike'], purse: [] };
      assert(JSON.stringify(w.saveFields(p.id).raid.killed) === '["em_turnpike"]', 'saved');
    },
  },
  {
    name: 'raid party rules: the shared toll ring and Old Shep\'s pen (broken by a friend)',
    fn() {
      const { w, ps, zid } = party(2);
      const t = w.state.ents.find((e) => e.zone === zid && e.template === 'em_turnpike');
      for (const p of ps) { p.x = t.x; p.y = t.y + 400; }
      w.enqueue(ps[0].id, { t: 'attack', id: t.id });
      let tolls = [];
      for (let i = 0; i < 600 && !tolls.length; i++) { tolls = w.step(1).filter((e) => e.type === 'raid_toll'); for (const p of ps) p.hp = p.hpMax; }
      assert(tolls.length === 1 && tolls[0].heroes === 2, 'a toll');
      const s = w.state.ents.find((e) => e.zone === zid && e.template === 'em_old_shep');
      w.internals.remove(t);
      for (const p of ps) { p.x = s.x; p.y = s.y + 400; p.inCombat = false; }
      w.enqueue(ps[0].id, { t: 'attack', id: s.id });
      let pen = null;
      for (let i = 0; i < 800 && !pen; i++) { pen = w.step(1).find((e) => e.type === 'raid_pen' && e.kind === 'penned'); for (const p of ps) p.hp = p.hpMax; }
      assert(pen, 'penned');
      const h = w.get(pen.hero), u = w.get(pen.hurdle);
      assert(h.auras.some((a) => a.id === 'em_penned') && u && u.template === 'em_hurdle', 'root and hurdle');
      w.internals.combat.kill(u, ps.find((p) => p.id !== h.id));
      let freed = null;
      for (let i = 0; i < 5 && !freed; i++) freed = w.step(1).find((e) => e.type === 'raid_pen' && e.kind === 'broken');
      assert(freed && !h.auras.some((a) => a.id === 'em_penned'), 'freed');
    },
  },
  {
    name: 'party bot: four heroes clear the Drove Gate (no wipe, deaths <= 2, bosses 60 to 300 s); two heroes clear it too',
    fn() {
      const r = partyRun('endmarket_gate', { seed: 1 });
      assert(partyOk(r), `four: ${JSON.stringify(r)}`);
      const r2 = partyRun('endmarket_gate', { seed: 1, party: ['warden', 'mender'] });
      assert(r2.cleared, `two: ${JSON.stringify(r2)}`);
    },
  },
  {
    name: 'raid wing 2 data: the Fair Streets place, its door beside the Fair Gate (level 30, needs Pay Going In), Street Tickets, the streets quest',
    fn() {
      const C = content();
      const D = C.dungeons.endmarket_streets;
      assert(D && D.raid && D.raid.wing === 2 && D.bosses.join() === 'em_weighmaster,em_crier,em_catchpole' && D.last === 'em_catchpole', 'place');
      const door = (C.zones.drovers_reach.doors || []).find((d) => d.id === 'endmarket_streets');
      assert(door && door.minLevel === 30 && door.needs === 'em_pay_going_in' && door.x === 306 && door.y === 74 && door.w === 3, 'door');
      const join = (C.zones.drovers_reach.joins || []).find((j) => j.door === 'endmarket_streets' || j.to === 'endmarket_streets');
      assert(join && join.needs === 'em_pay_going_in' && join.minLevel === 30, 'join needs');
      // the door tiles and the out tile are walkable on Drovers' Reach (309,74 is rock, so the door is 306 w=3)
      const Z = C.zones.drovers_reach;
      for (const [x, y] of [[306, 74], [307, 74], [308, 74], [307, 76]]) assert(Z.collision[y][x] === '.', `walk ${x},${y}`);
      assert(C.quests.em_streets_still_selling && C.quests.em_streets_still_selling.requires.quests[0] === 'em_pay_going_in', 'quest');
      assert(C.sideQuests.includes('em_streets_still_selling'), 'side quests');
      for (const sl of ['weapon', 'off', 'trinket']) {
        const it = C.items[`street_ticket_${sl}`];
        assert(it && it.use.kind === 'lot_ticket' && it.use.ticket === 'street' && it.reqLevel === 30, `ticket ${sl}`);
      }
      assert(C.items.weigh_bar && C.items.weigh_bar.level === 33 && C.items.weigh_bar.reqLevel === 30, 'weigh-bar');
      assert(C.items.weighmasters_weight && C.items.weighmasters_weight.power, 'weight trinket');
      assert(C.raid.places.includes('endmarket_streets') && C.raid.ticketSlots.em_catchpole, 'rules');
      assert(C.mobs.em_weighmaster.boss && C.mobs.em_crier.boss && C.mobs.em_catchpole.boss && C.mobs.em_chain_ring, 'foes');
    },
  },
  {
    name: 'raid wing 2 lockout: Street Tickets and the Street Purse once a week; a lone hero gets gold only; both wings loot in one week',
    fn() {
      const a = party(2, { place: 'endmarket_streets' });
      killBoss(a.w, a.ps, a.zid, 'em_weighmaster');
      assert(a.ps.every((p) => tickets(p) === 1 && p.raid.killed.includes('em_weighmaster')), 'first kill: a ticket each');
      const s = party(1, { place: 'endmarket_streets' });
      const bag0 = s.ps[0].bag.length, gold0 = s.ps[0].gold || 0;
      killBoss(s.w, s.ps, s.zid, 'em_catchpole');
      const lone = s.ps[0];
      assert(tickets(lone) === 0 && !(lone.raid && lone.raid.purse && lone.raid.purse.length), 'alone: no ticket, no Purse');
      assert(lone.bag.length === bag0 && (lone.gold || 0) > gold0, 'alone: gold only');
      const p = party(3, { place: 'endmarket_streets' });
      killBoss(p.w, p.ps, p.zid, 'em_catchpole');
      assert(p.ps.every((h) => tickets(h) === 2 && h.raid.purse.includes('endmarket_streets')), 'boss ticket + Street Purse ticket');
      const gold = (p.ps[0].gold || 0);
      // a Street Purse is 160-220, plus the boss gold: at least 160
      assert(p.ps.every((h) => (h.gold || 0) >= 160), `street purse gold, sample ${gold}`);
      // the same week, wing 1 still loots (per-boss, per-place purse)
      const g = party(2, { place: 'endmarket_gate' });
      for (const h of g.ps) h.raid = JSON.parse(JSON.stringify(p.ps[0].raid));
      killBoss(g.w, g.ps, g.zid, 'em_old_shep');
      assert(g.ps.every((h) => h.raid.killed.includes('em_catchpole') && h.raid.killed.includes('em_old_shep') && h.raid.purse.includes('endmarket_streets') && h.raid.purse.includes('endmarket_gate')), 'both wings in one week');
    },
  },
  {
    name: 'raid wing 2 tickets: a Street Ticket turns into the class weapon; an owned one becomes a piece they lack; a Wayfinder off ticket is a trinket',
    fn() {
      const { w, ps } = party(2);
      const p = ps[0];
      p.bag.push({ item: 'street_ticket_weapon', qty: 2, uid: 88001 });
      w.enqueue(p.id, { t: 'use_item', item: 'street_ticket_weapon' }); w.step(1);
      assert(p.bag.some((x) => x.item === 'weigh_bar' && x.inst && x.inst.rarity === 'epic'), 'weigh-bar');
      w.enqueue(p.id, { t: 'use_item', item: 'street_ticket_weapon' }); w.step(1);
      assert(p.bag.filter((x) => x.item === 'weigh_bar').length === 1 && p.bag.some((x) => x.item === 'scale_plate' || x.item === 'weighmasters_weight' || x.item === 'criers_tag' || x.item === 'catchpoles_hook'), 'owned weapon -> a lacking street piece');
      const { w: w2, ps: ps2 } = party(1, { cls: ['wayfinder'] });
      const y = ps2[0];
      y.bag.push({ item: 'street_ticket_off', qty: 1, uid: 88003 });
      w2.enqueue(y.id, { t: 'use_item', item: 'street_ticket_off' }); w2.step(1);
      assert(y.bag.some((x) => ['weighmasters_weight', 'criers_tag', 'catchpoles_hook'].includes(x.item)), 'wayfinder off ticket -> a trinket');
    },
  },
  {
    name: 'raid wing 2 party rules: Weigh the Lot pans, Sold! to a stall (and Purify clears it), Hook and Draw broken by a friend',
    fn() {
      const { w, ps, zid } = party(2, { place: 'endmarket_streets' });
      const wm = w.state.ents.find((e) => e.zone === zid && e.template === 'em_weighmaster');
      const gold = w.internals.content.raid.weigh.gold, blue = w.internals.content.raid.weigh.blue;
      const toTile = (e, xy) => { e.x = xy[0] * 256 + 128; e.y = (xy[1] + 1) * 256 - 16; };
      for (const p of ps) { p.x = wm.x; p.y = wm.y + 400; }
      // put both on the pans once Heavy is applied, and start a fight; wait for a paid weigh
      w.enqueue(ps[0].id, { t: 'attack', id: wm.id });
      let weigh = null;
      for (let i = 0; i < 800 && !weigh; i++) {
        const ev = w.step(1);
        const start = ev.find((e) => e.type === 'raid_weigh' && e.kind === 'start');
        if (start) {
          const heavy = w.get(start.heavy) || ps[0];
          const other = ps.find((p) => p.id !== heavy.id) || ps[1];
          toTile(heavy, gold); toTile(other, blue);
        }
        weigh = ev.find((e) => e.type === 'raid_weigh' && (e.kind === 'paid' || e.kind === 'unpaid' || e.kind === 'solo'));
        for (const p of ps) p.hp = p.hpMax;
      }
      assert(weigh && weigh.kind === 'paid' && weigh.gold && weigh.blue, `weigh ${JSON.stringify(weigh)}`);
      // the Crier: walk the tagged hero to the stall
      w.internals.remove(wm);
      const cr = w.state.ents.find((e) => e.zone === zid && e.template === 'em_crier');
      for (const p of ps) { p.x = cr.x; p.y = cr.y + 400; p.inCombat = false; }
      w.enqueue(ps[0].id, { t: 'attack', id: cr.id });
      let tag = null;
      for (let i = 0; i < 800 && !tag; i++) { tag = w.step(1).find((e) => e.type === 'raid_sold' && e.kind === 'tag'); for (const p of ps) p.hp = p.hpMax; }
      assert(tag, 'sold tag');
      const tagged = w.get(tag.hero);
      const stall = w.internals.content.raid.sold.stalls[tag.color];
      toTile(tagged, stall);
      let paid = null;
      for (let i = 0; i < 20 && !paid; i++) paid = w.step(1).find((e) => e.type === 'raid_sold' && e.kind === 'paid');
      assert(paid, 'sold paid by walking to the stall');
      // Purify clears a later tag
      tag = null;
      for (let i = 0; i < 800 && !tag; i++) { tag = w.step(1).find((e) => e.type === 'raid_sold' && e.kind === 'tag'); for (const p of ps) p.hp = p.hpMax; }
      assert(tag, 'second tag');
      const tagged2 = w.get(tag.hero);
      w.internals.combat.removeAura(tagged2, tagged2.auras.find((a) => a.id === 'em_sold_tag'), 'dispel');
      let cleared = null;
      for (let i = 0; i < 5 && !cleared; i++) cleared = w.step(1).find((e) => e.type === 'raid_sold' && e.kind === 'cleared');
      assert(cleared, 'sold cleared by a dispel');
      // the Catchpole: a friend breaks the Chain Ring
      w.internals.remove(cr);
      const cp = w.state.ents.find((e) => e.zone === zid && e.template === 'em_catchpole');
      for (const p of ps) { p.x = cp.x; p.y = cp.y + 400; p.inCombat = false; }
      w.enqueue(ps[0].id, { t: 'attack', id: cp.id });
      let hooked = null;
      for (let i = 0; i < 800 && !hooked; i++) { hooked = w.step(1).find((e) => e.type === 'raid_hook' && e.kind === 'hooked'); for (const p of ps) p.hp = p.hpMax; }
      assert(hooked, 'hooked');
      const h = w.get(hooked.hero), u = w.get(hooked.ring);
      assert(u && u.template === 'em_chain_ring', 'chain ring');
      w.internals.combat.kill(u, ps.find((p) => p.id !== h.id) || ps[0]);
      let broken = null;
      for (let i = 0; i < 5 && !broken; i++) broken = w.step(1).find((e) => e.type === 'raid_hook' && e.kind === 'broken');
      assert(broken && !(h.auras || []).some((a) => a.id === 'em_hooked' || a.id === 'em_hook_root'), 'hook cut');
    },
  },
  {
    name: 'party bot: four heroes clear the Fair Streets (no wipe, deaths <= 2, bosses 60 to 300 s)',
    fn() {
      const r = partyRun('endmarket_streets', { seed: 1 });
      assert(partyOk(r), `four: ${JSON.stringify(r)}`);
    },
  },
  {
    name: 'party bot: two heroes clear the Fair Streets too',
    fn() {
      const r2 = partyRun('endmarket_streets', { seed: 1, party: ['warden', 'mender'] });
      assert(r2.cleared, `two: ${JSON.stringify(r2)}`);
    },
  },
];

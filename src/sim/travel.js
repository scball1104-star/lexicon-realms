// Travel rules (big world piece 1, 2026-11-22): the Lantern Stone, inn homes, flight. Pure (no DOM, no clock, no
// randomness): the data arrives as content.travel (src/data/travel.js via src/data/maps/index.js buildContent).
//
//   const T = createTravel(C)                 C: the world's context (state, content, emit, get, zoneOf, ...)
//   T.command(e, cmd)                         'set_home' { npc } | 'fly' { npc, to } | 'ride' { npc } | 'flight_list' { npc }
//   T.useStone(e, def)                        the Lantern Stone's use (world.js useItem): starts the 10 s cast
//   T.onInteract(e, npc, ev)                  an npc talk: a flight master unlocks its point; adds ev.inn / ev.flight
//   T.flying(e)                               true while the hero rides a kite (no commands, no walking)
//   T.tickPlayer(e)                           the stone's cast (broken by moving, combat, death), the flight's motion
//   T.restore(e, spec) / T.saveOf(e)          save fields: home, flights (known points); missing = default home, none
//   T.publicOf(e)                             snapshot fields: home, flights, hearth { start, end }, flight { to, k, ... }
//
// Events: hearth_start { id, endTick }, hearth_stop { id, reason }, hearth { id, zone, x, y, inn }, home { id, inn, name },
// home_fail { id, reason }, flight_point { id, point, name }, flight_start { id, to, cost, ticks }, flight_fail { id, reason },
// flight_end { id, to }, ride_start { id, ride, name, ticks }, ride_fail { id, reason } (a ride: an ore cart or a ferry, wave 3;
// it moves like a flight, on the ground, free and from level 1, and ends with flight_end), plus a `zone` event whenever the hero changes zone (the loading card listens to that).
import { SUB, TILE, INTERACT_RANGE_PX } from './constants.js';
import { standTile } from './collision.js';
import { distPx } from './geom.js';
import { zoneGate, heroLevel } from './gates.js';   // cap 35: an inn behind a level gate keeps a lower hero's home elsewhere

const tileToSub = (tx, ty) => [tx * TILE + TILE / 2, (ty + 1) * TILE - SUB];
export const FLIGHT_AURA = 'lr_flight';

export function createTravel(C) {
  const { state, content, emit } = C;
  const T = content.travel || null;
  const now = () => state.tick;
  const ticks = (s) => Math.round(s * 20);
  const near = (e, npc) => !!npc && npc.kind === 'npc' && npc.zone === e.zone && distPx(e, npc) <= INTERACT_RANGE_PX + 8;
  const npcDef = (n) => (n && content.npcs ? content.npcs[n.template] : null) || null;
  const innOf = (n) => (T && n ? T.inns[n.template] || null : null);
  const pointOf = (n) => { const d = npcDef(n); return T && d && d.flight ? T.flight.points[d.flight] || null : null; };
  const rideOf = (n) => { const d = npcDef(n); return T && T.rides && d && d.ride ? T.rides[d.ride] || null : null; };
  // where a flight or a ride ends: a flight point, or a ride's own landing (both carry zone and land)
  const destOf = (id) => (T ? T.flight.points[id] || (T.rides || {})[id] || null : null);
  const homeSpot = (e) => {
    const h = e.home && T && Object.values(T.inns).find((i) => i.id === e.home.inn) ? e.home : null;
    if (h) return h;
    const d = T && T.inns[T.defaultHome];
    return d ? { zone: d.zone, x: d.x, y: d.y, inn: d.id, name: d.name } : null;
  };

  /** Move a hero to a tile (another zone too): a `zone` event when the zone changes (the loading card's cue). */
  function place(e, zone, tx, ty, why) {
    const z = content.zones[zone];
    if (!z) return false;
    const [x0, y0] = standTile(z, tx, ty);
    const from = e.zone;
    const [x, y] = tileToSub(x0, y0);
    e.zone = zone; e.x = x; e.y = y; e.mx = 0; e.my = 0; e.moving = false; e.target = null; e.forced = null;
    if (from !== zone) {
      emit({ type: 'zone', id: e.id, from, to: zone, x: x0, y: y0, why });
      if (C.prog) C.prog.onZoneEnter(e);
    }
    return true;
  }

  // ------------------------------------------------------------------ the Lantern Stone
  function useStone(e, def) {
    const fail = (reason) => { emit({ type: 'inventory_fail', id: e.id, cmd: 'use_item', item: def.id, reason }); return false; };
    if (!T) return fail('not_usable');
    if (e.inCombat) return fail('combat');
    if (e.flight) return fail('flying');
    if (e.hearth) return fail('busy');
    const key = `item:${(def.use && def.use.group) || def.id}`;
    if ((e.cd[key] || 0) > now()) return fail('cooldown');
    if (e.cast && C.combat) C.combat.cancelCast(e, 'cancel');
    e.mx = 0; e.my = 0; e.sitting = 0;
    e.hearth = { start: now(), end: now() + ticks((def.use && def.use.castSec) || T.stone.castSec), x: e.x, y: e.y, zone: e.zone, key, cd: ticks((def.use && def.use.cooldown) || T.stone.cooldownSec) };
    emit({ type: 'hearth_start', id: e.id, endTick: e.hearth.end, to: (homeSpot(e) || {}).name || null });
    return true;
  }
  function stopStone(e, reason) {
    if (!e.hearth) return;
    e.hearth = null;
    emit({ type: 'hearth_stop', id: e.id, reason });
  }

  // ------------------------------------------------------------------ inns and flight masters
  function onInteract(e, npc, ev) {
    if (!T) return;
    const inn = innOf(npc);
    if (inn) ev.inn = { id: inn.id, name: inn.name, home: !!(e.home && e.home.inn === inn.id) || (!e.home && T.inns[T.defaultHome] && T.inns[T.defaultHome].id === inn.id) };
    const pt = pointOf(npc);
    if (pt) {
      e.flights = e.flights || [];
      if (!e.flights.includes(pt.id)) { e.flights.push(pt.id); emit({ type: 'flight_point', id: e.id, point: pt.id, name: pt.name }); }
      ev.flight = { point: pt.id, name: pt.name, minLevel: T.flight.minLevel, known: [...e.flights],
        to: Object.values(T.flight.points).filter((p) => p.id !== pt.id).map((p) => {
          const r = T.routes[`${pt.id}>${p.id}`];
          return { id: p.id, name: p.name, known: e.flights.includes(p.id), cost: r ? r.cost : null, secs: r ? Math.round(r.ticks / 20) : null, ...(p.minLevel ? { minLevel: p.minLevel } : {}) };
        }) };
    }
    const rd = rideOf(npc);
    if (rd) ev.ride = { id: rd.id, label: rd.label, name: rd.name, vehicle: rd.vehicle, secs: Math.round(rd.ticks / 20) };
  }

  function command(e, cmd) {
    if (!T) return;
    const npc = cmd.npc != null ? C.get(cmd.npc) : null;
    if (cmd.t === 'set_home') {
      const inn = innOf(npc);
      if (!inn) return emit({ type: 'home_fail', id: e.id, reason: 'not_inn' });
      if (!near(e, npc)) return emit({ type: 'home_fail', id: e.id, reason: 'range' });
      { const need = zoneGate(content.zones, inn.zone); if (heroLevel(e) < need) return emit({ type: 'home_fail', id: e.id, reason: 'level', need }); }
      e.home = { zone: inn.zone, x: inn.x, y: inn.y, inn: inn.id, name: inn.name };
      emit({ type: 'home', id: e.id, inn: inn.id, name: inn.name });
      return;
    }
    if (cmd.t === 'ride') {
      const fail = (reason) => emit({ type: 'ride_fail', id: e.id, reason });
      const rd = rideOf(npc);
      if (!rd) return fail('not_ride');
      if (!near(e, npc)) return fail('range');
      if (e.flight) return fail('flying');
      if (e.inCombat) return fail('combat');
      stopStone(e, 'ride');
      if (e.cast && C.combat) C.combat.cancelCast(e, 'cancel');
      e.autoOn = false; e.target = null; e.sitting = 0; e.mx = 0; e.my = 0; e.moving = false;
      e.flight = { from: null, to: rd.id, ride: rd.vehicle, leg: 0, i: 0, t: 0, start: now(), lift: ticks(T.ride.lift), end: now() + rd.ticks, legs: rd.legs, speed: rd.speed };
      e.auras.push({ id: FLIGHT_AURA, src: e.id, stacks: 1, startTick: now(), until: null, nextTick: null, absorb: 0, data: {},
        def: { id: FLIGHT_AURA, name: rd.vehicle === 'ferry' ? 'On the ferry' : 'In the ore cart', icon: 'icon_feather', kind: 'buff', flags: ['untargetable', 'stealth', 'immune'] } });
      for (const m of state.ents) if (m.kind === 'mob' && m.threat && m.threat[e.id] != null) delete m.threat[e.id];
      const leg = rd.legs[0];
      if (leg.zone !== e.zone) place(e, leg.zone, leg.pts[0][0], leg.pts[0][1], 'ride');
      emit({ type: 'ride_start', id: e.id, ride: rd.id, name: rd.name, ticks: rd.ticks, vehicle: rd.vehicle });
      return;
    }
    if (cmd.t === 'fly') {
      const fail = (reason) => emit({ type: 'flight_fail', id: e.id, reason, to: cmd.to || null });
      const from = pointOf(npc);
      if (!from) return fail('not_master');
      if (!near(e, npc)) return fail('range');
      if (e.flight) return fail('flying');
      if (e.inCombat) return fail('combat');
      if ((e.level || 1) < T.flight.minLevel) return fail('level');
      const to = T.flight.points[cmd.to];
      if (!to || to.id === from.id) return fail('unknown');
      if (!(e.flights || []).includes(to.id)) return fail('not_known');
      // a point with its own level (cap 35: Ferrick's Mill at 30, the same gate as the chain on the road)
      if (to.minLevel && (e.level || 1) < to.minLevel) return emit({ type: 'flight_fail', id: e.id, reason: 'dest_level', to: cmd.to, need: to.minLevel });
      const r = T.routes[`${from.id}>${to.id}`];
      if (!r) return fail('no_route');
      if ((e.gold || 0) < r.cost) return fail('gold');
      e.gold -= r.cost;
      emit({ type: 'gold', id: e.id, amount: -r.cost, total: e.gold, source: 'flight' });
      stopStone(e, 'flight');
      if (e.cast && C.combat) C.combat.cancelCast(e, 'cancel');
      e.autoOn = false; e.target = null; e.sitting = 0; e.mx = 0; e.my = 0; e.moving = false;
      e.flight = { from: from.id, to: to.id, leg: 0, i: 0, t: 0, start: now(), lift: ticks(T.flight.lift), end: now() + r.ticks, legs: r.legs, speed: r.speed };
      // the kite carries you out of reach: foes cannot pick or hit you while you fly (the flags the combat rules read)
      e.auras.push({ id: FLIGHT_AURA, src: e.id, stacks: 1, startTick: now(), until: null, nextTick: null, absorb: 0, data: {},
        def: { id: FLIGHT_AURA, name: 'On the Lantern Kite', icon: 'icon_feather', kind: 'buff', flags: ['untargetable', 'stealth', 'immune'] } });
      for (const m of state.ents) if (m.kind === 'mob' && m.threat && m.threat[e.id] != null) delete m.threat[e.id];
      const leg = r.legs[0];
      if (leg.zone !== e.zone) place(e, leg.zone, leg.pts[0][0], leg.pts[0][1], 'flight');
      emit({ type: 'flight_start', id: e.id, from: from.id, to: to.id, cost: r.cost, ticks: r.ticks, name: to.name });
      return;
    }
  }

  const flying = (e) => !!e.flight;

  // ------------------------------------------------------------------ per tick
  function tickFlight(e) {
    const f = e.flight;
    const t = now() - f.start;
    // take off and land: the bird climbs and settles in place for `lift` ticks at each end
    if (t < f.lift) return;
    const leg = f.legs[f.leg];
    let left = f.speed;                  // SUB this tick
    while (left > 0 && f.leg < f.legs.length) {
      const L = f.legs[f.leg];
      const a = L.pts[f.i], b = L.pts[f.i + 1];
      if (!b) {
        // end of a leg: on to the next zone's first point, else land
        if (f.leg + 1 < f.legs.length) { f.leg++; f.i = 0; f.t = 0; const N = f.legs[f.leg]; place(e, N.zone, N.pts[0][0], N.pts[0][1], 'flight'); continue; }
        break;
      }
      const ax = a[0] * TILE + TILE / 2, ay = (a[1] + 1) * TILE - SUB, bx = b[0] * TILE + TILE / 2, by = (b[1] + 1) * TILE - SUB;
      const seg = Math.hypot(bx - ax, by - ay);
      const step = Math.min(left, seg - f.t);
      f.t += step; left -= step;
      const k = seg > 0 ? f.t / seg : 1;
      e.x = Math.round(ax + (bx - ax) * k); e.y = Math.round(ay + (by - ay) * k);
      const dx = bx - ax, dy = by - ay;
      e.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      if (f.t >= seg - 0.5) { f.i++; f.t = 0; }
    }
    void leg;
    const L = f.legs[f.legs.length - 1];
    const done = f.leg >= f.legs.length - 1 && f.i >= L.pts.length - 1;
    if (done) {
      if (f.landAt == null) f.landAt = now() + f.lift;
      if (now() >= f.landAt) land(e);
    }
  }
  function land(e) {
    const f = e.flight;
    const to = destOf(f.to);
    e.flight = null;
    e.auras = e.auras.filter((a) => a.id !== FLIGHT_AURA);
    if (to) place(e, to.zone, to.land[0], to.land[1], 'flight');
    e.dir = 'down';
    emit({ type: 'flight_end', id: e.id, to: f.to, name: to ? to.name : '' });
  }

  function tickPlayer(e) {
    if (!T) return;
    if (e.flight) { if (e.dead) { e.flight = null; e.auras = e.auras.filter((a) => a.id !== FLIGHT_AURA); } else tickFlight(e); return; }
    const h = e.hearth;
    if (!h) return;
    if (e.dead) return stopStone(e, 'dead');
    if (e.inCombat) return stopStone(e, 'combat');
    if (e.zone !== h.zone || Math.abs(e.x - h.x) > SUB * 2 || Math.abs(e.y - h.y) > SUB * 2 || e.mx || e.my) return stopStone(e, 'move');
    if (e.cast) return stopStone(e, 'cast');
    if (now() < h.end) return;
    const home = homeSpot(e);
    e.hearth = null;
    if (!home) return;
    e.cd[h.key] = now() + h.cd;
    place(e, home.zone, home.x, home.y, 'hearth');
    emit({ type: 'hearth', id: e.id, zone: home.zone, x: home.x, y: home.y, inn: home.inn, name: home.name });
  }

  // ------------------------------------------------------------------ saves and snapshots
  function restore(e, spec) {
    if (!T) return;
    if (spec.home && typeof spec.home === 'object' && Object.values(T.inns).some((i) => i.id === spec.home.inn)) {
      const inn = Object.values(T.inns).find((i) => i.id === spec.home.inn);
      e.home = { zone: inn.zone, x: inn.x, y: inn.y, inn: inn.id, name: inn.name };
    }
    if (Array.isArray(spec.flights)) e.flights = [...new Set(spec.flights.filter((p) => T.flight.points[p]))];
  }
  function saveOf(e) {
    const out = {};
    if (e.home) out.home = { inn: e.home.inn };
    if (e.flights && e.flights.length) out.flights = [...e.flights];
    return out;
  }
  function publicOf(e) {
    const o = { home: e.home ? { inn: e.home.inn, name: e.home.name } : null, flights: e.flights ? [...e.flights] : [] };
    if (e.hearth) o.hearth = { start: e.hearth.start, end: e.hearth.end };
    if (e.flight) {
      const f = e.flight, total = f.end - f.start;
      o.flight = { from: f.from, to: f.to, start: f.start, end: f.end, k: Math.max(0, Math.min(1, (now() - f.start) / Math.max(1, total))),
        up: f.ride ? 0 : Math.min(1, (now() - f.start) / Math.max(1, f.lift), f.landAt != null ? Math.max(0, (f.landAt - now()) / Math.max(1, f.lift)) : 1) };
      if (f.ride) o.flight.ride = f.ride;            // an ore cart or a ferry: on the ground, no kite (the renderers draw the vehicle)
    }
    return o;
  }

  return { command, useStone, stopStone, onInteract, flying, tickPlayer, restore, saveOf, publicOf, homeSpot };
}

// Delve flow (wave 10 dflow, Scott 2026-11-25: "Yes for your recommendations"; brief D:/LQOnline/wave10/dflow/BRIEF.md).
// Getting a party of friends into a dungeon or cave and keeping it fun. Pure: no clock, no Math.random (ticks only).
// Numbers: content.party.delve and content.party.seatSec (src/data/party.js). Every player-facing word is in the UI
// (src/ui/delve_ui.js); the sim only emits events and the HUD block.
//
//   const DV = createDelve(D)   D = { state, content, emit, get, C, DG, tileToSub, distPx }
//   DV.handles(t) / DV.command(e, cmd)
//   DV.tick()                   the Come casts and the call offers
//   DV.observe(ev)              every event the world emits (world.js): the run record of each copy
//   DV.onEnter(p, zid) / DV.onLeave(p)   src/sim/dungeons.js enter / leave: level sync, the run record
//   DV.nextBoss(e)              the nearest living boss of the hero's copy (the ready check names it)
//   DV.hudOf(e)                 the HUD block's `delve` part: sync, the door the hero stands at, a call, the cast, the run
//   syncFor(level, band, upMax) -> { from, to, kind: 'none' | 'down' | 'up' | 'too_low' }
//
// Level sync: a hero over a place's band plays at the band's top; a hero up to `syncUpMax` levels under its floor plays
// at the floor. e.level is the synced level while inside (every rule that reads a level sees it) and e.sync.from keeps the
// hero's own level: XP is earned and levels are gained on it (progression.js), the save keeps it (main.js), and leaving
// puts it back. Worn gear is scaled to the band (stats.js). A door with a level gate (the Deep Halls) stays shut to a
// lower hero: sync never opens it. No foe is changed by any of this.
//
// Commands
//   delve_call { door }          a hero at a door calls the party: each friend out of combat, outside any place, gets an offer
//   delve_come { yes }           answer a call: yes starts a still cast (comeSec); then the hero stands at the door
//   delve_enter { door, resume? } a hero at the door takes the party heroes near it in together, on one tick. resume: the
//                                bosses a stopped run had beaten (the client's bookmark); a fresh copy is made without them
//   delve_close                  the hero closes the run summary
//
// Events: delve_call { id, kind: 'offer' | 'sent' | 'expired' | 'no', from, door, place } ; delve_come { id, kind: 'start' |
// 'stop' | 'done', door, reason? } ; delve_enter { id, place, zone, heroes, resumed } ; sync { id, kind, from, to, place } ;
// delve_done { id, place, zone, name, secs, falls, bosses } (each hero in the copy, when its last boss falls) ; delve_fail.
import { TICK_HZ } from './constants.js';
import { zoneBase } from './dungeons.js';
import { itemName } from './loot.js';
import { zoneGate, heroLevel } from './gates.js';   // cap 35: a call never carries a hero past a level gate

const T = (sec) => Math.round((sec || 0) * TICK_HZ);
const TILE = 256;
const CMDS = new Set(['delve_call', 'delve_come', 'delve_enter', 'delve_close']);
const RUN_LOOT_MAX = 6;

export function syncFor(level, band, upMax = 3) {
  const [lo, hi] = band;
  if (level > hi) return { from: level, to: hi, kind: 'down' };
  if (level >= lo) return { from: level, to: level, kind: 'none' };
  if (lo - level <= upMax) return { from: level, to: lo, kind: 'up' };
  return { from: level, to: level, kind: 'too_low' };
}

/** What a loot event gave, as summary lines: { item, rarity }. The adapter dloot replaces with its own API when merged
 *  (wave 10 dloot: rolled affixes and rarity tiers); today it reads the loot event's items. */
export function lootLines(ev, items, affixes = null) {
  const out = [];
  for (const it of (ev && ev.items) || []) {
    const d = items[it.item];
    if (!d || d.kind === 'consumable' || d.kind === 'quest' || /^glyph_/.test(it.item) || d.slot == null) continue;
    let name = d.name;
    try { name = itemName({ items, affixes: affixes || {} }, { item: it.item, inst: it.inst || null }); } catch { /* the base name */ }
    out.push({ item: it.item, name, rarity: (it.inst && it.inst.rarity) || d.rarity || 'common' });
  }
  return out;
}

export function createDelve(D) {
  const { state, content, emit, get, C } = D;
  const R = (content.party && content.party.delve) || {};
  const PL = content.dungeons || {};
  const now = () => state.tick;
  const DG = () => D.DG;
  const zones = content.zones;
  const fail = (e, cmd, reason) => { emit({ type: 'delve_fail', id: e.id, cmd: cmd.t, reason }); return false; };
  // cap 35 (review fix): the level a hero needs to stand at a door: the door's own gate and the gate of the zone it stands in
  // (the Weir Works' door is in the Millrace, behind Ferrick's chain). A call and the Come refuse a hero under it.
  const gateOf = (f) => (f ? Math.max(f.door.minLevel || 0, zoneGate(zones, f.zone)) : 0);
  const tooLow = (p, f) => heroLevel(p) < gateOf(f);
  const sayLow = (p, f) => emit({ type: 'door_locked', id: p.id, door: f.door.id, need: gateOf(f), reason: 'call', place: f.door.name });
  const members = (e) => (e.party != null ? state.ents.filter((p) => p.kind === 'player' && p.party === e.party) : [e]);
  const tileOf = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];

  // ---------------------------------------------------------------- doors
  /** The doors of an outdoor zone (world.doors, also any outdoor zone's own, src/data/maps/doors.js). */
  function doorsIn(zid) { const z = zid != null ? zones[zid] : null; return (z && z.doors) || []; }
  function doorAt(e, tiles) {
    if (!e || DG().isPlace(e.zone)) return null;
    const [tx, ty] = tileOf(e);
    let best = null, bd = Infinity;
    for (const d of doorsIn(e.zone)) {
      if (!PL[d.id]) continue;
      const dd = Math.max(Math.abs(tx - d.out[0]), Math.abs(ty - d.out[1]));
      if (dd <= tiles && dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  function findDoor(id) {
    for (const z of Object.values(zones)) for (const d of (z && z.doors) || []) if (d.id === id) return { zone: z.id, door: d };
    return null;
  }

  // ---------------------------------------------------------------- level sync (dungeons.js enter / leave)
  function onEnter(p, zid) {
    const place = PL[zoneBase(zid)];
    const c = (state.copies || {})[zid];
    if (c) {
      if (!c.run) c.run = { t0: now(), place: zoneBase(zid), bosses: [], down: [], deaths: {}, loot: {}, gold: {}, moments: [], names: {}, pulls: {}, done: null, seen: [] };
      c.run.names[p.id] = p.name;
    }
    if (!place || !place.levels || p.sync || !C.stats) return;
    const s = syncFor(p.level, place.levels, R.syncUpMax ?? 3);
    if (s.kind !== 'down' && s.kind !== 'up') return;
    const frac = p.hpMax > 0 ? p.hp / p.hpMax : 1;
    p.sync = { from: p.level, to: s.to, kind: s.kind, place: place.id };
    p.level = s.to;
    C.stats.recalc(p);
    if (!p.dead) p.hp = Math.max(1, Math.round(frac * p.hpMax));
    emit({ type: 'sync', id: p.id, kind: s.kind, from: s.from, to: s.to, place: place.id });
  }
  function onLeave(p) {
    if (!p.sync) return;
    const frac = p.hpMax > 0 ? p.hp / p.hpMax : 1;
    const s = p.sync;
    p.level = s.from;
    delete p.sync;
    if (C.stats) C.stats.recalc(p);
    if (!p.dead) p.hp = Math.max(1, Math.round(frac * p.hpMax));
    emit({ type: 'sync', id: p.id, kind: 'off', from: s.to, to: p.level, place: s.place });
  }

  // ---------------------------------------------------------------- the run record (every event the world emits)
  function runOf(zid) { const c = zid != null ? (state.copies || {})[zid] : null; return c && c.run ? c.run : null; }
  function moment(run, kind, extra) { if (run.moments.length < 12) run.moments.push({ kind, tick: now(), ...extra }); }
  function observe(ev) {
    const t = ev.type;
    if (t === 'boss' && ev.zone && (ev.kind === 'pull' || ev.kind === 'death')) {
      const run = runOf(ev.zone);
      if (!run) return;
      if (ev.kind === 'pull') { run.pulls[ev.template] = now(); return; }
      if (run.down.includes(ev.template) || !((PL[run.place] || {}).bosses || []).includes(ev.template)) return;
      const t0 = run.pulls[ev.template];
      const secs = t0 != null ? Math.max(1, Math.round((now() - t0) / TICK_HZ)) : null;
      run.down.push(ev.template);
      run.bosses.push({ template: ev.template, id: ev.id, secs, tick: now() });
      moment(run, 'boss', { template: ev.template, id: ev.id, secs });
      return;
    }
    if (t === 'death' && ev.kind === 'player') { const p = get(ev.id); const run = p && runOf(p.zone); if (run) run.deaths[ev.id] = (run.deaths[ev.id] || 0) + 1; return; }
    if (t === 'loot') {
      const p = get(ev.id), run = p && runOf(p.zone);
      if (!run) return;
      // wave 10 integrate: a boss's pieces come from dloot (DG.lootOf, read in hudOf); this keeps the rest (chests, packs)
      const src = ev.from != null ? get(ev.from) : null;
      if (src && src.kind === 'mob' && src.spawn && src.spawn.boss && DG().lootOf) return;
      const got = lootLines(ev, content.items || {}, content.affixes || null);
      if (got.length) run.loot[ev.id] = [...(run.loot[ev.id] || []), ...got].slice(0, RUN_LOOT_MAX);
      return;
    }
    // wave 10 integrate: dloot's Tally after each boss kill (the legendary roll's count for this place)
    if (t === 'dloot' && ev.tally != null) { const run = runOf(ev.zone); if (run) (run.tally = run.tally || {})[ev.id] = { n: ev.tally, sure: ev.sure || null }; return; }
    if (t === 'gold' && ev.source === 'dungeon') { const p = get(ev.id), run = p && runOf(p.zone); if (run) run.gold[ev.id] = (run.gold[ev.id] || 0) + (ev.amount | 0); return; }
    if (t === 'legendary') { const p = get(ev.id), run = p && runOf(p.zone); if (run) moment(run, 'legendary', { hero: ev.id, item: ev.item }); return; }
    if (t === 'rez' && ev.kind === 'done') { const p = get(ev.id), run = p && runOf(p.zone); if (run) moment(run, 'rez', { by: ev.src, hero: ev.id }); return; }
    if (t === 'dungeon_clear') {
      const run = runOf(ev.zone);
      if (!run || run.done != null) return;
      run.done = now();
      const secs = Math.round((now() - run.t0) / TICK_HZ);
      const falls = Object.values(run.deaths).reduce((s, v) => s + v, 0);
      const place = PL[run.place] || {};
      for (const p of state.ents) if (p.kind === 'player' && p.zone === ev.zone) {
        emit({ type: 'delve_done', id: p.id, place: run.place, zone: ev.zone, name: place.name || run.place, secs, falls, bosses: run.down.length,
          heroes: Object.values(run.names) });
      }
    }
  }

  // ---------------------------------------------------------------- the ready check's boss
  function nextBoss(e) {
    if (!DG().isPlace(e.zone)) return null;
    let best = null, bd = Infinity;
    for (const m of state.ents) {
      if (m.kind !== 'mob' || m.dead || m.zone !== e.zone || !(m.spawn && m.spawn.boss)) continue;
      const d = Math.hypot(m.x - e.x, m.y - e.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best ? { id: best.id, template: best.template, name: best.name } : null;
  }

  // ---------------------------------------------------------------- moving heroes (the same steps as a door, world.js checkJoin)
  function moveTo(p, zid, tx, ty, dir) {
    const from = p.zone;
    const [x, y] = D.tileToSub(tx, ty);
    p.zone = zid; p.x = x; p.y = y; p.mx = 0; p.my = 0; p.moving = false;
    if (dir) p.dir = dir;
    p.target = null; p.autoOn = false; p.combo = null; p.forced = null;
    if (p.cast && C.combat) C.combat.cancelCast(p, 'move');
    const inf = DG().info(zid);
    emit({ type: 'zone', id: p.id, from, to: zid, x: tx, y: ty, ...(inf ? { kind: inf.kind, base: inf.base, name: inf.name, levels: inf.levels, label: inf.label } : {}) });
    if (C.prog && from !== zid) C.prog.onZoneEnter(p);
  }

  // ---------------------------------------------------------------- commands
  function call(e, cmd) {
    const d = doorAt(e, R.doorTiles ?? 3);
    if (!d || (cmd.door && cmd.door !== d.id)) return fail(e, cmd, 'not_at_door');
    if (e.party == null) return fail(e, cmd, 'no_party');
    let n = 0;
    const fd = findDoor(d.id);
    for (const f of members(e)) {
      if (f === e || f.dead || f.inCombat || DG().isPlace(f.zone)) continue;
      if (doorAt(f, R.gatherTiles ?? 6) === d) continue;            // already here
      if (tooLow(f, fd)) { sayLow(f, fd); continue; }               // cap 35: never past a gate they cannot walk through
      f.delveCall = { from: e.id, door: d.id, until: now() + T(R.callSec ?? 60) };
      emit({ type: 'delve_call', id: f.id, kind: 'offer', from: e.id, door: d.id, place: d.name });
      n++;
    }
    emit({ type: 'delve_call', id: e.id, kind: 'sent', door: d.id, place: d.name, n });
    return true;
  }
  function come(e, cmd) {
    const c = e.delveCall;
    if (!c) return fail(e, cmd, 'no_call');
    if (!cmd.yes) { delete e.delveCall; emit({ type: 'delve_call', id: e.id, kind: 'no', door: c.door }); return true; }
    if (e.dead || e.inCombat) return fail(e, cmd, 'combat');
    if (DG().isPlace(e.zone)) return fail(e, cmd, 'inside');
    { const f = findDoor(c.door); if (tooLow(e, f)) { delete e.delveCall; sayLow(e, f); return fail(e, cmd, 'level'); } }
    delete e.delveCall;
    e.mx = 0; e.my = 0; e.sitting = 0;
    e.delveCome = { door: c.door, startTick: now(), endTick: now() + T(R.comeSec ?? 5) };
    emit({ type: 'delve_come', id: e.id, kind: 'start', door: c.door, sec: R.comeSec ?? 5 });
    return true;
  }
  function enter(e, cmd) {
    const d = doorAt(e, R.doorTiles ?? 3);
    if (!d || (cmd.door && cmd.door !== d.id)) return fail(e, cmd, 'not_at_door');
    const place = PL[d.id], z = zones[d.id];
    if (!place || !z) return fail(e, cmd, 'not_at_door');
    if (e.inCombat) return fail(e, cmd, 'combat');
    const tiles = R.gatherTiles ?? 6;
    const gated = (p) => (d.minLevel && (p.sync ? p.sync.from : p.level) < d.minLevel) || (d.needs && !(p.questsDone || []).includes(d.needs));
    const go = members(e).filter((p) => !p.dead && !p.inCombat && p.zone === e.zone && doorAt(p, tiles) === d && !gated(p));
    if (!go.includes(e)) { emit({ type: 'door_locked', id: e.id, door: d.id, need: d.minLevel || d.needs, reason: (d.needs && !(e.questsDone || []).includes(d.needs)) ? 'quest' : 'level' }); return false; }
    // resume: only boss ids of this place, never its last boss, only into a copy made now
    const resume = Array.isArray(cmd.resume) ? cmd.resume.filter((b, i, a) => typeof b === 'string' && (place.bosses || []).includes(b) && b !== place.last && a.indexOf(b) === i) : [];
    let zid = null, resumed = false;
    go.forEach((p, i) => {
      zid = DG().enter(p, d.id);
      const c = state.copies[zid];
      if (i === 0 && resume.length && c && c.made === now() && !(c.run && c.run.bosses.length)) {
        for (const m of [...state.ents]) {
          if (m.kind !== 'mob' || m.zone !== zid || !resume.includes(m.template) || !(m.spawn && m.spawn.boss)) continue;
          D.remove(m);
          emit({ type: 'despawn', id: m.id, template: m.template, zone: m.zone, kind: 'mob', reason: 'resume' });
        }
        if (c.run) { c.run.down = [...resume]; c.run.resumed = resume.length; }
        resumed = true;
      }
      const [ax, ay] = z.arrival;
      moveTo(p, zid, ax + (i % 2 ? 1 : 0), ay + (i >> 1), 'up');
    });
    emit({ type: 'delve_enter', id: e.id, place: d.id, zone: zid, heroes: go.map((p) => p.id), resumed });
    return true;
  }
  function close(e) {
    const run = runOf(e.zone);
    if (run && !run.seen.includes(e.id)) run.seen.push(e.id);
    return true;
  }
  function command(e, cmd) {
    switch (cmd.t) {
      case 'delve_call': return e.dead ? fail(e, cmd, 'dead') : call(e, cmd);
      case 'delve_come': return come(e, cmd);
      case 'delve_enter': return e.dead ? fail(e, cmd, 'dead') : enter(e, cmd);
      case 'delve_close': return close(e);
      default: return false;
    }
  }

  // ---------------------------------------------------------------- tick: offers run out, the Come cast
  function tick() {
    for (const e of state.ents) {
      if (e.kind !== 'player') continue;
      if (e.delveCall && now() >= e.delveCall.until) { emit({ type: 'delve_call', id: e.id, kind: 'expired', door: e.delveCall.door }); delete e.delveCall; }
      const cc = e.delveCome;
      if (!cc) continue;
      const stop = e.dead ? 'dead' : e.inCombat ? 'combat' : (e.moving || e.mx || e.my) ? 'move' : e.cast ? 'cast' : DG().isPlace(e.zone) ? 'inside' : null;
      if (stop) { delete e.delveCome; emit({ type: 'delve_come', id: e.id, kind: 'stop', door: cc.door, reason: stop }); continue; }
      if (now() < cc.endTick) continue;
      delete e.delveCome;
      const f = findDoor(cc.door);
      if (!f) continue;
      if (tooLow(e, f)) { sayLow(e, f); emit({ type: 'delve_come', id: e.id, kind: 'stop', door: cc.door, reason: 'level' }); continue; }
      const [ox, oy] = f.door.out;
      moveTo(e, f.zone, ox, oy + 1, 'up');
      emit({ type: 'delve_come', id: e.id, kind: 'done', door: cc.door });
    }
  }

  // ---------------------------------------------------------------- the HUD block
  const sec = (t) => Math.round(Math.max(0, t) / TICK_HZ * 10) / 10;
  function hudOf(e) {
    const out = {};
    if (e.sync) out.sync = { from: e.sync.from, to: e.sync.to, kind: e.sync.kind };
    const d = !e.dead ? doorAt(e, R.doorTiles ?? 3) : null;
    if (d) {
      const place = PL[d.id] || {};
      const z = zones[d.id] || {};
      const mins = (R.minutes || {})[place.kind] || null;
      out.door = { id: d.id, name: d.name, kind: place.kind, levels: [...(place.levels || d.levels)], label: d.label || '', bosses: (place.bosses || []).length,
        bossIds: [...(place.bosses || [])], last: place.last || null, flavour: place.flavour || '', minLevel: d.minLevel || null, minutes: mins ? [...mins] : null,
        upMax: R.syncUpMax ?? 3, here: members(e).filter((p) => doorAt(p, R.gatherTiles ?? 6) === d).map((p) => p.id), arrival: z.arrival ? [...z.arrival] : null };
    }
    if (e.delveCall) { const f = get(e.delveCall.from); const fd = findDoor(e.delveCall.door); out.call = { from: e.delveCall.from, fromName: f ? f.name : '', door: e.delveCall.door, place: fd ? fd.door.name : '', left: sec(e.delveCall.until - now()) }; }
    if (e.delveCome) { const fd = findDoor(e.delveCome.door); out.come = { place: fd ? fd.door.name : '', left: sec(e.delveCome.endTick - now()), frac: Math.min(1, (now() - e.delveCome.startTick) / Math.max(1, e.delveCome.endTick - e.delveCome.startTick)) }; }
    const run = runOf(e.zone);
    if (run) {
      const place = PL[run.place] || {};
      out.run = { place: run.place, name: place.name || run.place, down: [...run.down], of: (place.bosses || []).length, done: run.done != null };
      if (run.done != null && !run.seen.includes(e.id)) {
        const nm = (id) => run.names[id] || (get(Number(id)) || {}).name || '?';
        // wave 10 integrate: boss pieces from dloot (named lines, Illuminated, the Tally) first, then the other loot of the run
        const bossLoot = DG().lootOf ? DG().lootOf(e.zone) : {};
        const fromBoss = (id) => (bossLoot[id] || []).map((x) => { let name = ((content.items || {})[x.item] || {}).name || x.item; try { name = itemName(content, x); } catch { /* base */ }
          return { item: x.item, name, rarity: (x.inst && x.inst.rarity) || ((content.items || {})[x.item] || {}).rarity || 'common', illum: !!(x.inst && x.inst.illum), boss: x.from }; });
        const sumOf = (id) => (DG().lootSummaryOf ? DG().lootSummaryOf(e.zone, Number(id)) : null);
        const heroes = Object.keys(run.names).map((id) => ({ id: Number(id), name: run.names[id], loot: [...fromBoss(id), ...(run.loot[id] || [])], gold: run.gold[id] || 0,
          best: (sumOf(id) || {}).best || null, illuminated: (sumOf(id) || {}).illuminated || 0, tally: (run.tally || {})[id] || null,
          falls: run.deaths[id] || 0, sync: (() => { const p = get(Number(id)); return p && p.sync ? { kind: p.sync.kind, to: p.sync.to, from: p.sync.from } : null; })() }));
        out.summary = { place: run.place, name: place.name || run.place, secs: Math.round((run.done - run.t0) / TICK_HZ), resumed: run.resumed || 0,
          bosses: run.bosses.map((b) => ({ template: b.template, id: b.id, name: ((content.mobs || {})[b.template] || {}).name || b.template, secs: b.secs })),
          of: (place.bosses || []).length, falls: Object.values(run.deaths).reduce((s, v) => s + v, 0), heroes,
          moments: run.moments.map((m) => ({ ...m, heroName: m.hero != null ? nm(m.hero) : null, byName: m.by != null ? nm(m.by) : null })) };
      }
    }
    return Object.keys(out).length ? out : null;
  }

  return { handles: (t) => CMDS.has(t), command, tick, observe, onEnter, onLeave, nextBoss, hudOf, doorAt };
}

// Big world piece 1 (2026-11-22, D:/LQOnline/world3/BRIEF.md): zone joins between outdoor zones (the Root Stair), the
// Lantern Stone, inn homes, flight (unlock, level, cost, route, arrival, no acting in the air), the save fields (no
// SAVE_VERSION bump). Sim only: createWorld on the real content.
import { assert, eq, content } from './_harness.mjs';
import { createWorld } from '../../src/sim/index.js';
import { OUTDOOR } from '../../src/data/maps/index.js';
import { FLIGHT, INNS, TRAVEL_NPC_SPAWNS, flightRoute } from '../../src/data/travel.js';
import { spotFree } from '../../src/sim/collision.js';
import { SAVE_VERSION } from '../../src/ui/save.js';
import { framesFor, createFrameState, applyFrame } from '../../src/net/frames.js';
import { guestCommandOk } from '../../src/net/session.js';
import { RB_QUESTS, RB_QUEST_ORDER, START_REALMS } from '../../src/data/rootbound.js';
import { createCharStore } from '../../src/ui/save.js';

const world = (seed = 3) => createWorld({ seed, content: content() });
const tile = (e) => [Math.floor(e.x / 256), Math.floor((e.y - 1) / 256)];
/** Step until an event matching pred (or n ticks); returns the events seen. */
function run(w, n, pred = null) {
  const out = [];
  for (let i = 0; i < n; i++) { const ev = w.step(); out.push(...ev); if (pred && ev.some(pred)) break; }
  return out;
}
const npcOf = (w, template) => w.state.ents.find((e) => e.kind === 'npc' && e.template === template);
const besideNpc = (w, id, n) => { const e = w.get(id); e.zone = n.zone; e.x = n.x + 16 * 16; e.y = n.y; };

export const tests = [
  {
    name: 'zones: the Rootbound is its own outdoor zone, joined to the world at the Root Stair both ways (the hero walks through)',
    fn() {
      const C = content();
      assert(OUTDOOR.rootbound && C.zones.rootbound, 'the Rootbound is loaded');
      eq(C.zones.rootbound.w * 1000 + C.zones.rootbound.h, 576384, '576 x 384');
      const up = C.zones.world.joins.find((j) => j.to === 'rootbound');
      const down = C.zones.rootbound.joins.find((j) => j.to === 'world');
      assert(up && down, 'a join each way');
      const w = world();
      const id = w.addPlayer({ name: 'Ann', cls: 'scribe', zone: 'world', x: up.x + 1, y: up.y + 4 });
      w.enqueue(id, { t: 'move', dx: 0, dy: -1 });
      let ev = run(w, 60, (e) => e.type === 'zone' && e.id === id).find((e) => e.type === 'zone');
      assert(ev, 'walking north onto the pass changes zone');
      eq(`${ev.from}>${ev.to}`, 'world>rootbound');
      eq(w.get(id).zone, 'rootbound');
      eq(tile(w.get(id)).join(','), `${up.tx},${up.ty}`, 'lands where the pass says');
      // and back up the stair
      w.enqueue(id, { t: 'move', dx: 0, dy: -1 });
      ev = run(w, 80, (e) => e.type === 'zone' && e.id === id).find((e) => e.type === 'zone');
      assert(ev && ev.to === 'world', 'walking north up the stair returns to the world');
      eq(tile(w.get(id)).join(','), `${down.tx},${down.ty}`);
    },
  },
  {
    name: 'zones: the Rootbound`s foes, npcs and the world`s stay apart (zone ids), and a hero there can be saved and restored there',
    fn() {
      const w = world();
      const id = w.addPlayer({ name: 'Ann', cls: 'scribe', zone: 'rootbound', x: 288, y: 70 });
      eq(w.get(id).zone, 'rootbound');
      const s = w.saveFields(id);
      assert(s && typeof s === 'object', 'save fields');
      const id2 = w.addPlayer({ name: 'Bea', cls: 'scribe', zone: 'rootbound', x: 288, y: 70, ...s });
      eq(w.get(id2).zone, 'rootbound');
    },
  },
  {
    name: 'travel data: every npc spot and every inn spot is free, every flight point lands on a free tile, every pair has a route',
    fn() {
      const C = content();
      for (const n of TRAVEL_NPC_SPAWNS) assert(spotFree(C.zones[n.zone], n.x, n.y), `${n.npc} at ${n.zone} ${n.x},${n.y} is not free`);
      for (const [k, i] of Object.entries(INNS)) { assert(C.npcs[k] && C.npcs[k].innkeeper, `${k} is an innkeeper`); assert(spotFree(C.zones[i.zone], i.x, i.y), `inn ${i.id} spot not free`); }
      for (const p of Object.values(FLIGHT.points)) {
        assert(spotFree(C.zones[p.zone], p.land[0], p.land[1]), `flight ${p.id} landing not free`);
        assert(TRAVEL_NPC_SPAWNS.some((n) => n.npc === p.npc), `flight ${p.id} has a master`);
        for (const q of Object.values(FLIGHT.points)) if (q !== p) { assert(flightRoute(p.id, q.id), `no route ${p.id}>${q.id}`); assert(C.travel.routes[`${p.id}>${q.id}`], `no content route ${p.id}>${q.id}`); }
      }
      // a route across zones ends a leg on the world's pass and starts the next on the Rootbound's
      const r = C.travel.routes['willowmere>willow_library'];
      eq(r.legs.map((l) => l.zone).join(','), 'world,rootbound');
      // flight is about four times walking speed
      eq(r.speed, Math.round(58 * 4));
    },
  },
  {
    name: 'Lantern Stone: a new hero has it in the bag and on the last bar slot; 10 s cast; home to the default inn; 30 minute cooldown',
    fn() {
      const w = world();
      const C = content();
      const id = w.addPlayer({ name: 'Ann', cls: 'warden', zone: 'world', x: 240, y: 140, lanternStone: true, newHero: true });
      const e = w.get(id);
      assert(e.bag.some((s) => s.item === 'lantern_stone'), 'in the bag');
      eq(e.bar[7], 'item:lantern_stone', 'on slot 8');
      w.enqueue(id, { t: 'cast', slot: 8 });
      let evs = run(w, 2);
      assert(evs.some((x) => x.type === 'hearth_start' && x.id === id), 'the cast starts');
      evs = run(w, 195);
      assert(!evs.some((x) => x.type === 'hearth'), 'not before 10 s');
      evs = run(w, 10);
      const h = evs.find((x) => x.type === 'hearth');
      assert(h, 'home after 10 s');
      const inn = INNS.hob;
      eq(e.zone, inn.zone);
      assert(Math.hypot(tile(e)[0] - inn.x, tile(e)[1] - inn.y) <= 2, `beside the inn: ${tile(e)}`);
      eq(e.cd['item:lantern_stone'] - w.tick, 30 * 60 * 20 - 0 - (w.tick - h.tick), 'the 30 minute cooldown');
      assert(e.bag.some((s) => s.item === 'lantern_stone'), 'never used up');
      // on cooldown: refused
      w.enqueue(id, { t: 'use_item', item: 'lantern_stone' });
      evs = run(w, 2);
      assert(evs.some((x) => x.type === 'inventory_fail' && x.reason === 'cooldown'), 'refused while dim');
      eq(C.items.lantern_stone.value, 0, 'cannot be sold');
    },
  },
  {
    name: 'Lantern Stone: moving breaks the cast; an existing hero without one is given one (to waiting loot when the bags are full)',
    fn() {
      const w = world();
      const id = w.addPlayer({ name: 'Ann', cls: 'warden', zone: 'world', x: 240, y: 140, lanternStone: true, newHero: true });
      w.enqueue(id, { t: 'use_item', item: 'lantern_stone' });
      run(w, 20);
      w.enqueue(id, { t: 'move', dx: 1, dy: 0 });
      const evs = run(w, 5);
      assert(evs.some((x) => x.type === 'hearth_stop' && x.reason === 'move'), 'stopped by moving');
      run(w, 220);
      eq(w.get(id).zone, 'world');
      assert(!w.get(id).cd['item:lantern_stone'], 'no cooldown for a broken cast');
      // a full-bag old hero: the stone waits in the pending loot; the bar is left as saved
      const full = Array.from({ length: 12 }, (_, i) => ({ item: 'potion', qty: 1, uid: 100 + i }));
      const id2 = w.addPlayer({ name: 'Old', cls: 'warden', zone: 'world', x: 240, y: 140, xp: 10, bag: full, bar: ['warden_shield_bash', 'warden_strike'], lanternStone: true });
      const o = w.get(id2);
      assert(o.pendingLoot.some((p) => p.item === 'lantern_stone'), 'waiting in the loot window');
      assert(!o.bar.includes('item:lantern_stone'), 'an old bar is left alone');
    },
  },
  {
    name: 'inn home: "Make this inn your home" at the Rootbound`s inn; the stone then goes there (another zone: a zone event); saved and restored',
    fn() {
      const w = world();
      const id = w.addPlayer({ name: 'Ann', cls: 'scribe', zone: 'world', x: 240, y: 140, lanternStone: true, newHero: true });
      const inn = npcOf(w, 'rb_innkeeper');
      besideNpc(w, id, inn);
      w.enqueue(id, { t: 'interact', id: inn.id });
      let evs = run(w, 2);
      const it = evs.find((x) => x.type === 'interact' && x.src === id);
      assert(it && it.inn && it.inn.home === false, 'the innkeeper offers a home');
      w.enqueue(id, { t: 'set_home', npc: inn.id });
      evs = run(w, 2);
      assert(evs.some((x) => x.type === 'home' && x.inn === 'lamplit_shelf'), 'home set');
      // walk off to the world, then use the stone
      const e = w.get(id); e.zone = 'world'; e.x = 240 * 256 + 128; e.y = 141 * 256 - 16;
      w.enqueue(id, { t: 'use_item', item: 'lantern_stone' });
      evs = run(w, 205);
      assert(evs.some((x) => x.type === 'zone' && x.id === id && x.to === 'rootbound'), 'a zone event (the loading card)');
      eq(e.zone, 'rootbound');
      const s = w.saveFields(id);
      eq(JSON.stringify(s.home), '{"inn":"lamplit_shelf"}', 'saved as the inn id');
      const id2 = w.addPlayer({ name: 'Bea', cls: 'scribe', zone: 'world', x: 240, y: 140, ...s });
      eq(w.get(id2).home.inn, 'lamplit_shelf', 'restored');
      // too far: refused
      const far = w.addPlayer({ name: 'Cid', cls: 'warden', zone: 'world', x: 240, y: 140 });
      w.enqueue(far, { t: 'set_home', npc: inn.id });
      evs = run(w, 2);
      assert(evs.some((x) => x.type === 'home_fail' && x.id === far && x.reason === 'range'), 'range checked');
    },
  },
  {
    name: 'flight: talking to a master unlocks its point; level 6 and gold are checked; the kite flies the route, the hero cannot act, lands beside the master',
    fn() {
      const w = world();
      const C = content();
      const id = w.addPlayer({ name: 'Ann', cls: 'warden', zone: 'world', x: 240, y: 140 });
      const e = w.get(id);
      const wm = npcOf(w, 'fm_willowmere'), tf = npcOf(w, 'fm_thornfold');
      // visit Thornfold's master: unlocked
      besideNpc(w, id, tf);
      w.enqueue(id, { t: 'interact', id: tf.id });
      let evs = run(w, 2);
      assert(evs.some((x) => x.type === 'flight_point' && x.point === 'thornfold'), 'Thornfold unlocked');
      // at Willowmere: level 1 is refused
      besideNpc(w, id, wm);
      w.enqueue(id, { t: 'interact', id: wm.id });
      evs = run(w, 2);
      const ev = evs.find((x) => x.type === 'interact' && x.src === id);
      assert(ev.flight && ev.flight.to.find((p) => p.id === 'thornfold').known, 'the master lists Thornfold as known');
      w.enqueue(id, { t: 'fly', npc: wm.id, to: 'thornfold' });
      evs = run(w, 2);
      assert(evs.some((x) => x.type === 'flight_fail' && x.reason === 'level'), 'level 1 refused');
      w.setLevel(id, 6);
      e.gold = 1;
      w.enqueue(id, { t: 'fly', npc: wm.id, to: 'thornfold' });
      evs = run(w, 2);
      assert(evs.some((x) => x.type === 'flight_fail' && x.reason === 'gold'), 'too poor refused');
      w.enqueue(id, { t: 'fly', npc: wm.id, to: 'ridge_path' });
      evs = run(w, 2);
      assert(evs.some((x) => x.type === 'flight_fail' && x.reason === 'not_known'), 'an unvisited point refused');
      const route = C.travel.routes['willowmere>thornfold'];
      e.gold = 50;
      w.enqueue(id, { t: 'fly', npc: wm.id, to: 'thornfold' });
      evs = run(w, 2);
      const st = evs.find((x) => x.type === 'flight_start');
      assert(st, 'flight starts');
      eq(e.gold, 50 - route.cost, 'paid the fare');
      assert(w.travel.flying(e), 'flying');
      // cannot act while flying; keys are ignored; foes cannot target the hero
      const snapP = w.snapshot().entities.find((x) => x.id === id);
      assert(snapP.flight && snapP.flight.to === 'thornfold', 'the snapshot carries the flight');
      w.enqueue(id, { t: 'cast', slot: 1 });
      w.enqueue(id, { t: 'use_item', item: 'potion' });
      w.enqueue(id, { t: 'move', dx: 1, dy: 0 });
      evs = run(w, 2);
      eq(evs.filter((x) => x.type === 'cmd_reject' && x.reason === 'flying').length, 2, 'cast and item refused');
      assert(e.auras.some((a) => a.def.flags.includes('untargetable')), 'out of reach of foes');
      // halfway: off the ground, between the two points
      run(w, Math.round(route.ticks / 2));
      const mid = tile(e);
      assert(Math.hypot(mid[0] - wm.x / 16, mid[1] - wm.y / 16) > 10, `moved away from Willowmere: ${mid}`);
      evs = run(w, route.ticks + 40, (x) => x.type === 'flight_end');
      const end = evs.find((x) => x.type === 'flight_end');
      assert(end && end.to === 'thornfold', 'lands');
      const land = FLIGHT.points.thornfold.land;
      assert(Math.hypot(tile(e)[0] - land[0], tile(e)[1] - land[1]) <= 1, `beside the master: ${tile(e)}`);
      assert(!w.travel.flying(e) && !e.auras.some((a) => a.id === 'lr_flight'), 'on foot again');
      const took = end.tick - st.tick;
      assert(Math.abs(took - route.ticks) <= 6, `about the route time: ${took} vs ${route.ticks}`);
      // the save keeps the known points
      eq(JSON.stringify(w.saveFields(id).flights), '["thornfold","willowmere"]');
    },
  },
  {
    name: 'flight across zones: Willowmere to the Willow Library flies the world leg, changes zone at the pass (a zone event) and lands in the Rootbound',
    fn() {
      const w = world();
      const id = w.addPlayer({ name: 'Ann', cls: 'scribe', zone: 'world', x: 240, y: 140, level: 6, gold: 40, flights: ['willowmere', 'willow_library'] });
      const e = w.get(id);
      const wm = npcOf(w, 'fm_willowmere');
      besideNpc(w, id, wm);
      w.enqueue(id, { t: 'fly', npc: wm.id, to: 'willow_library' });
      const evs = run(w, 400, (x) => x.type === 'flight_end');
      assert(evs.some((x) => x.type === 'zone' && x.id === id && x.from === 'world' && x.to === 'rootbound'), 'zone event at the pass');
      eq(e.zone, 'rootbound');
      assert(evs.some((x) => x.type === 'flight_end'), 'landed');
    },
  },
  {
    name: 'save compat: travel fields are optional (an old save loads with the default home and no flight points); SAVE_VERSION unchanged',
    fn() {
      eq(SAVE_VERSION, 2, 'SAVE_VERSION');
      const w = world();
      const id = w.addPlayer({ name: 'Old', cls: 'mender', zone: 'world', x: 240, y: 140, xp: 5, gold: 3 });
      const s = w.saveFields(id);
      assert(!('home' in s) && !('flights' in s), 'nothing saved until used');
      eq(w.travel.homeSpot(w.get(id)).inn, 'lantern_inn', 'default home');
      // junk in the fields is dropped
      const id2 = w.addPlayer({ name: 'Odd', cls: 'mender', zone: 'world', x: 240, y: 140, home: { inn: 'nowhere' }, flights: ['willowmere', 'atlantis'] });
      assert(!w.get(id2).home, 'an unknown inn is ignored');
      eq(JSON.stringify(w.get(id2).flights), '["willowmere"]');
    },
  },
  {
    name: 'online: a guest`s fly command goes through (the host world runs it); the guest`s frames carry its own flight, and a friend sees it fly',
    fn() {
      const w = world(5);
      const host = w.addPlayer({ name: 'Host', cls: 'warden', zone: 'world', x: 240, y: 140, party: 1 });
      const guest = w.addPlayer({ name: 'Gus', cls: 'scribe', zone: 'world', x: 240, y: 140, party: 1, level: 6, gold: 20, flights: ['thornfold'] });
      const wm = npcOf(w, 'fm_willowmere');
      besideNpc(w, guest, wm); besideNpc(w, host, wm);
      const cmd = { t: 'fly', npc: wm.id, to: 'thornfold' };
      assert(guestCommandOk(cmd) && guestCommandOk({ t: 'set_home', npc: 1 }), 'the host takes travel commands from a guest');
      const txG = framesFor(guest), rxG = createFrameState(guest), txH = framesFor(host), rxH = createFrameState(host);
      let sg = null, sh = null, sawStart = false;
      w.enqueue(guest, cmd);
      for (let i = 0; i < 60; i++) {
        const ev = w.step(), snap = w.snapshot();
        const mg = JSON.parse(JSON.stringify(txG.frame(snap, ev))), mh = JSON.parse(JSON.stringify(txH.frame(snap, ev)));
        if ((mg.e || []).some((x) => x.type === 'flight_start' && x.id === guest)) sawStart = true;
        sg = applyFrame(rxG, mg); sh = applyFrame(rxH, mh);
      }
      assert(sawStart, 'the guest gets its own flight_start event');
      const me = sg.entities.find((e) => e.id === guest);
      assert(me.flight && me.flight.to === 'thornfold', 'the guest`s frame carries its flight');
      const seen = sh.entities.find((e) => e.id === guest);
      assert(seen && seen.flight, 'the host sees the guest on the kite (flight is not trimmed)');
    },
  },
  {
    name: 'Rootbound: 14 quests (10 to 14), every giver and turn-in stands somewhere, every foe, item and area they ask for exists in the realm',
    fn() {
      const C = content(), Z = C.zones.rootbound;
      const n = RB_QUEST_ORDER.length;
      assert(n >= 10 && n <= 14, `${n} quests`);
      const npcAt = new Map();
      for (const s of C.spawns) if (s.npc) npcAt.set(s.npc, s.zone);
      const mobsHere = new Set(C.spawns.filter((s) => s.zone === 'rootbound' && s.mob).map((s) => s.mob));
      const nodeItems = new Set((Z.nodes || []).map((x) => x.item));
      const dropItems = new Set();
      for (const m of mobsHere) for (const e of (C.mobs[m].loot.table || [])) dropItems.add(e.item);
      const noDash = (t) => !/[–—]/.test(t);
      for (const id of RB_QUEST_ORDER) {
        const q = C.quests[id];
        assert(q && RB_QUESTS[id], `${id} loaded`);
        assert(npcAt.has(q.giver) && npcAt.has(q.turnIn), `${id}: giver ${q.giver} / turn-in ${q.turnIn} placed`);
        assert(q.level >= 1 && q.level <= 6, `${id}: level 1 to 6`);
        for (const t of Object.values(q.text)) assert(noDash(t), `${id}: no dashes`);
        for (const o of q.objectives) {
          if (o.kind === 'kill') assert(mobsHere.has(o.mob), `${id}: kill ${o.mob} lives in the Rootbound`);
          if (o.kind === 'collect') assert(nodeItems.has(o.item) || dropItems.has(o.item), `${id}: ${o.item} has a source`);
          if (o.kind === 'explore') assert((Z.areas || []).some((a) => a.id === o.area), `${id}: area ${o.area}`);
          if (o.kind === 'talk' || o.kind === 'deliver') assert(npcAt.has(o.npc || o.to), `${id}: ${o.npc || o.to} placed`);
          if (o.kind === 'collect' || o.kind === 'deliver') assert(C.items[o.item] && C.items[o.item].kind === 'quest', `${id}: ${o.item} is a quest item`);
        }
        for (const r of q.rewards.choice || []) assert(C.items[r], `${id}: reward ${r}`);
      }
      // the foes, a rare, a boss, the class tie (the Scribe's first teacher is here)
      const kinds = new Set(C.spawns.filter((s) => s.zone === 'rootbound' && s.mob).map((s) => s.mob));
      for (const m of ['rb_bookmite', 'rb_tome', 'rb_shelf_golem', 'rb_echo_warden', 'rb_archivore', 'rb_rare_dogear', 'ink_slime']) assert(kinds.has(m), `${m} spawns in the Rootbound`);
      assert(C.rares.rb_rare_dogear && C.mobs.rb_rare_dogear.rare, 'the rare');
      assert(C.mobs.rb_archivore.boss && C.mobs.rb_archivore.elite, 'the boss');
      eq(C.npcs.rb_ottilie.trainer.cls, 'scribe', 'the Scribe trains here');
      eq(START_REALMS.scribe.zone, 'rootbound', 'the start realm of the Scribe');
    },
  },
  {
    name: 'Rootbound: a new Scribe starts in the Willow Library (lantern and home there), the first quest is on offer; the store keeps the choice; old heroes have none',
    fn() {
      const w = world(9);
      const R = START_REALMS.scribe;
      const id = w.addPlayer({ name: 'Ann', cls: 'scribe', zone: R.zone, x: R.x, y: R.y, lantern: { ...R.lantern }, home: { inn: R.home }, lanternStone: true, newHero: true });
      const e = w.get(id);
      eq(e.zone, 'rootbound');
      eq(e.lantern.zone + ':' + e.lantern.id, 'rootbound:rb_library', 'wakes at the library lantern');
      eq(e.home.inn, 'lamplit_shelf', 'home is the Lamplit Shelf');
      eq(w.quests.status(e, 'rb_speak_and_be_kept'), 'available', 'the first quest is on offer');
      const mem = new Map();
      const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
      const st = createCharStore(storage);
      const a = st.add({ name: 'Rowan', cls: 'scribe', look: 0, start: 'realm' }), b = st.add({ name: 'Sela', cls: 'scribe', look: 0, start: 'willowmere' }), c = st.add({ name: 'Old', cls: 'scribe', look: 0 });
      eq(a.char.start, 'realm'); eq(b.char.start, 'willowmere'); eq(c.char.start, undefined, 'no choice recorded: Willowmere');
    },
  },
  {
    name: 'Rootbound: the chain plays through with quest commands (accept, kill, collect, explore, talk, deliver, turn in) to Elder Mael in Willowmere',
    fn() {
      const C = content();
      const w = world(21);
      const R = START_REALMS.scribe;
      const id = w.addPlayer({ name: 'Ann', cls: 'scribe', zone: R.zone, x: R.x, y: R.y, lantern: { ...R.lantern }, home: { inn: R.home } });
      const e = w.get(id);
      w.setLevel(id, 6);
      const npc = (t) => w.state.ents.find((x) => x.kind === 'npc' && x.template === t);
      const goTo = (zone, tx, ty) => { e.zone = zone; e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };
      const at = (t) => { const n = npc(t); e.zone = n.zone; e.x = n.x + 8 * 16; e.y = n.y; return n; };
      const kill = (m) => { goTo('rootbound', Math.floor(m.x / 256), Math.floor((m.y - 1) / 256)); m.tagger = id; w.internals.combat.kill(m, e); run(w, 1); };
      for (const qid of RB_QUEST_ORDER) {
        const q = C.quests[qid];
        const g = at(q.giver);
        // a full bag refuses a quest: sell the junk and materials as a player would (professions step 2 added cloth drops)
        e.bag = e.bag.filter((s) => !['junk', 'material'].includes((C.items[s.item] || {}).kind));
        w.enqueue(id, { t: 'quest_accept', quest: qid, npc: g.id });
        run(w, 2);
        assert(e.quests[qid], `${qid}: accepted`);
        q.objectives.forEach((o, i) => {
          const left = () => e.quests[qid] && e.quests[qid].counts[i] < (o.count || 1);
          if (o.kind === 'kill') {
            for (let k = 0; k < 200 && left(); k++) { const m = w.state.ents.find((x) => x.kind === 'mob' && x.template === o.mob && !x.dead && x.zone === 'rootbound'); if (m) kill(m); else run(w, 400); }
          } else if (o.kind === 'collect') {
            const nodes = w.state.ents.filter((x) => x.kind === 'object' && x.node && x.node.item === o.item);
            if (nodes.length) {
              for (let k = 0; k < 40 && left(); k++) { const ob = nodes[k % nodes.length]; goTo('rootbound', Math.floor(ob.x / 256), Math.floor((ob.y - 1) / 256)); w.enqueue(id, { t: 'interact', id: ob.id }); run(w, 4 + (ob.node.channel || 0) * 20); }
            } else {
              const src = Object.entries(C.mobs).find(([mid, m]) => (m.loot.table || []).some((x) => x.item === o.item) && w.state.ents.some((x) => x.kind === 'mob' && x.template === mid && x.zone === 'rootbound'));
              assert(src, `${qid}: a foe drops ${o.item}`);
              const minL = (src[1].loot.table.find((t2) => t2.item === o.item) || {}).minLevel || 0;
              for (let k = 0; k < 200 && left(); k++) {
                const m = w.state.ents.find((x) => x.kind === 'mob' && x.template === src[0] && !x.dead && x.zone === 'rootbound' && x.level >= minL);
                if (m) kill(m); else run(w, 400);
              }
            }
          } else if (o.kind === 'explore') {
            const a = C.zones.rootbound.areas.find((x) => x.id === o.area);
            const cx = a.x + Math.floor(a.w / 2), cy = a.y + Math.floor(a.h / 2);
            let ok = false;
            for (let r = 0; r <= 6 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) if (spotFree(C.zones.rootbound, cx + dx, cy + dy)) { goTo('rootbound', cx + dx, cy + dy); ok = true; }
            w.enqueue(id, { t: 'move', dx: 1, dy: 0 }); run(w, 2); w.enqueue(id, { t: 'stop' }); run(w, 2);
          } else if (o.kind === 'talk') { const n = at(o.npc); w.enqueue(id, { t: 'interact', id: n.id }); run(w, 2); }
          else if (o.kind === 'deliver') { const n = at(o.to); w.enqueue(id, { t: 'interact', id: n.id }); run(w, 2); }
        });
        assert(e.quests[qid] && e.quests[qid].state === 'ready', `${qid}: ready (${JSON.stringify(e.quests[qid])})`);
        const t = at(q.turnIn);
        w.enqueue(id, { t: 'quest_turnin', quest: qid, npc: t.id, choice: 0 });
        run(w, 2);
        assert(e.questsDone.includes(qid), `${qid}: turned in`);
      }
      eq(e.zone, 'world', 'the last hand-in is in Willowmere');
    },
  },
];

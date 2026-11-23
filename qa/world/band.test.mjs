// The 20 to 30 band zones (band lane, 2026-11-22; D:/LQOnline/world3/BRIEF.md 2, 4, 5): Larchhill and Drovers' Reach as
// their own outdoor zones (sizes, passes both ways, outdoor to outdoor), the Larch Mine's door inside Larchhill (in, out,
// a save made inside), the content counts the brief asks for, flights to the new hubs, the night events, and both
// zones' quests played through with quest commands. Sim only: createWorld on the real content.
//
// The level cap is 20 on main (the cap30 lane raises it). The tests that need heroes past 20 run on a copy of the
// content with progression.maxLevel 30 and xpToNext extended by BUILDS_2 5.2 (bandXpToNext): a test-only copy, the
// game's numbers are untouched.
import { assert, eq, content } from './_harness.mjs';
import { createWorld } from '../../src/sim/index.js';
import { OUTDOOR, PLACES } from '../../src/data/maps/index.js';
import { spotFree } from '../../src/sim/collision.js';
import { LH_QUESTS, LH_QUEST_ORDER, LH_NPCS, LH_EVENT } from '../../src/data/larchhill.js';
import { DR_QUESTS, DR_QUEST_ORDER, DR_NPCS, DR_EVENT } from '../../src/data/drovers_reach.js';
import { BAND_MOBS, BAND_LOOT, bandXpToNext, lootTier } from '../../src/data/band20.js';
import { BAND_TRAVEL_NPCS } from '../../src/data/band_travel.js';
import { flightRoute } from '../../src/data/travel.js';

const ZIDS = ['larchhill', 'drovers_reach'];
let C30 = null;
/** The real content with the cap at 30 (test only). */
function content30() {
  if (C30) return C30;
  const C = content(), P = C.progression;
  const xp = [...P.xpToNext];
  for (let L = xp.length; L < 30; L++) xp[L] = bandXpToNext(L);
  C30 = { ...C, progression: { ...P, maxLevel: 30, xpToNext: xp } };
  return C30;
}
/** content30 with only the band zones' foes (the rest of the world's camps are not needed and slow every step). */
let CB = null;
function contentBand() {
  if (CB) return CB;
  const C = content30();
  CB = { ...C, spawns: C.spawns.filter((s) => s.npc || ZIDS.includes(s.zone)), nightSpawns: C.nightSpawns.filter((s) => ZIDS.includes(s.zone)) };
  return CB;
}
const world = (seed = 3, C = content()) => createWorld({ seed, content: C });
const tile = (e) => [Math.floor(e.x / 256), Math.floor((e.y - 1) / 256)];
function run(w, n, pred = null) {
  const out = [];
  for (let i = 0; i < n; i++) { const ev = w.step(); out.push(...ev); if (pred && ev.some(pred)) break; }
  return out;
}
const npcOf = (w, template) => w.state.ents.find((e) => e.kind === 'npc' && e.template === template);

/** Walk a hero onto a join's cells from the side and return the zone event. */
function walkJoin(w, id, dx, dy) {
  const e = w.get(id);
  w.enqueue(id, { t: 'move', dx, dy });
  const ev = run(w, 120, (x) => x.type === 'zone' && x.id === id).find((x) => x.type === 'zone' && x.id === id);
  w.enqueue(id, { t: 'stop' });
  return { ev, e };
}

export const tests = [
  {
    name: 'band zones: Larchhill and Drovers` Reach are their own 1088 x 704 zones; the world, Larchhill and the Reach join both ways (a hero walks through)',
    fn() {
      const C = content();
      for (const id of ZIDS) {
        assert(OUTDOOR[id] && C.zones[id], `${id} loaded`);
        eq(C.zones[id].w * 1000 + C.zones[id].h, 1088704, `${id}: 1088 x 704`);
        let walk = 0;
        for (const row of C.zones[id].collision) for (const c of row) if (c === '.') walk++;
        assert(walk / (1088 * 704) > 0.2, `${id}: a fifth or more walkable (${(100 * walk / (1088 * 704)).toFixed(1)}%)`);
      }
      const w = world();
      // the world's Larchhill gate (the Downs, south-west) -> Larchhill
      const gate = C.zones.world.joins.find((j) => j.to === 'larchhill');
      assert(gate, 'the world has a join to Larchhill');
      const id = w.addPlayer({ name: 'Ann', cls: 'warden', zone: 'world', x: gate.x + 1, y: gate.y - 2 });
      let r = walkJoin(w, id, 0, 1);
      assert(r.ev && r.ev.from === 'world' && r.ev.to === 'larchhill', `walking south through the gate goes to Larchhill (${JSON.stringify(r.ev)})`);
      eq(tile(w.get(id)).join(','), `${gate.tx},${gate.ty}`, 'lands where the gate says');
      r = walkJoin(w, id, 0, -1);
      assert(r.ev && r.ev.to === 'world', 'and back north to the world');
      // Larchhill's west pass -> Drovers' Reach and back
      const gap = C.zones.larchhill.joins.find((j) => j.to === 'drovers_reach');
      const back = C.zones.drovers_reach.joins.find((j) => j.to === 'larchhill');
      assert(gap && back, 'a pass each way between Larchhill and the Reach');
      const e = w.get(id);
      e.zone = 'larchhill'; e.x = (gap.x + 3) * 256 + 128; e.y = (gap.y + 1) * 256 + 240;
      r = walkJoin(w, id, -1, 0);
      assert(r.ev && r.ev.from === 'larchhill' && r.ev.to === 'drovers_reach', 'walking west through Drovers` Gap goes to the Reach');
      eq(tile(e).join(','), `${gap.tx},${gap.ty}`);
      r = walkJoin(w, id, 1, 0);
      assert(r.ev && r.ev.to === 'larchhill', 'walking east goes back to Larchhill');
      eq(tile(e).join(','), `${back.tx},${back.ty}`);
    },
  },
  {
    name: 'band zones: the brief`s counts (about 20 quests, 12 camps, 14 people, 2 rares, 1 event each; a hub with inn and kitemaster; the cave in Larchhill)',
    fn() {
      const C = content();
      const count = { larchhill: { q: LH_QUEST_ORDER.length, npcs: LH_NPCS, ev: LH_EVENT }, drovers_reach: { q: DR_QUEST_ORDER.length, npcs: DR_NPCS, ev: DR_EVENT } };
      for (const id of ZIDS) {
        const Z = C.zones[id], c = count[id];
        assert(c.q >= 18 && c.q <= 24, `${id}: ${c.q} quests`);
        const groups = new Set(Z.spawns.filter((s) => s.group).map((s) => s.group));
        assert(groups.size >= 12, `${id}: ${groups.size} camps (want 12 or more)`);
        const people = Object.keys(c.npcs).length + Object.keys(BAND_TRAVEL_NPCS).filter((k) => k.startsWith(id === 'larchhill' ? 'lh_' : 'dr_')).length;
        assert(people >= 13 && people <= 16, `${id}: ${people} people`);
        const rares = Object.values(C.rares).filter((r) => C.spawns.some((s) => s.mob === r.id && s.zone === id));
        eq(rares.length, 2, `${id}: two rares`);
        for (const r of rares) assert(r.respawn[0] >= 1800 && C.mobs[r.id].rare, `${r.id}: on a long timer`);
        assert(C.worldEvents.some((ev) => ev.zone === id && ev.when === 'night'), `${id}: a zone event`);
        assert(C.nightSpawns.some((s) => s.zone === id && s.group === c.ev.groups[0]), `${id}: the event's night spawns`);
        assert(Z.regions.some((r) => r.kind === 'town') && Z.areas.some((a) => a.safe), `${id}: a hub town`);
        assert(Z.lanterns.length >= 3, `${id}: lanterns`);
      }
      // the inns and kitemasters stand in their zones; the cave's door is in Larchhill
      for (const [npc, zone] of [['lh_innkeeper', 'larchhill'], ['lh_kitemaster', 'larchhill'], ['dr_innkeeper', 'drovers_reach'], ['dr_kitemaster', 'drovers_reach']]) assert(C.spawns.some((s) => s.npc === npc && s.zone === zone), `${npc} in ${zone}`);
      assert(C.travel.inns.lh_innkeeper && C.travel.inns.dr_innkeeper, 'two inns');
      assert(C.travel.flight.points.larch_cross && C.travel.flight.points.highdrove, 'two flight points');
      assert(PLACES.larch_mine && C.dungeons.larch_mine.door.zone === 'larchhill', 'the Larch Mine, door in Larchhill');
      assert(C.zones.larchhill.doors.some((d) => d.id === 'larch_mine') && !C.zones.world.joins.some((j) => j.to === 'larch_mine'), 'its door is in Larchhill, not on the world');
      // foes 20 to 30, families beast and humanoid among them; loot tiers cover 20 to 30
      const fams = new Set(Object.values(BAND_MOBS).map((m) => m.family));
      for (const f of ['beast', 'humanoid', 'insect', 'spirit']) assert(fams.has(f), `a ${f} family`);
      for (const m of Object.values(BAND_MOBS)) assert(m.level[0] >= 20 && m.level[1] <= 30, `${m.id}: levels 20 to 30`);
      for (let L = 20; L <= 30; L++) assert(lootTier(L), `a loot tier at ${L}`);
      eq(BAND_LOOT[0].levels[0], 20); eq(BAND_LOOT[BAND_LOOT.length - 1].levels[1], 30);
    },
  },
  {
    name: 'band quests: every giver and turn-in stands somewhere, every foe, item, area and npc they ask for exists; levels in band; rewards wearable; no dashes',
    fn() {
      const C = content();
      const npcAt = new Map();
      for (const s of C.spawns) if (s.npc) npcAt.set(s.npc, s.zone);
      const zoneOf = (id) => (id in LH_QUESTS ? 'larchhill' : 'drovers_reach');
      for (const id of [...LH_QUEST_ORDER, ...DR_QUEST_ORDER]) {
        const q = C.quests[id], zid = zoneOf(id), Z = C.zones[zid];
        assert(q, `${id} loaded`);
        assert(npcAt.has(q.giver) && npcAt.has(q.turnIn), `${id}: giver ${q.giver} / turn-in ${q.turnIn} placed`);
        assert(q.level >= 20 && q.level <= 30, `${id}: level ${q.level}`);
        assert(C.sideQuests.includes(id), `${id}: offered (side quest)`);
        for (const t of Object.values(q.text)) assert(!/[\u2013\u2014]/.test(t), `${id}: no dashes`);
        for (const o of q.objectives) {
          if (o.kind === 'kill') assert(C.spawns.some((s) => s.mob === o.mob) || Object.values(PLACES).some((p) => p.spawns.some((s) => s.mob === o.mob)), `${id}: ${o.mob} spawns`);
          if (o.kind === 'collect') assert((Z.nodes || []).some((n) => n.item === o.item) || Object.values(C.mobs).some((m) => (m.loot.table || []).some((t) => t.item === o.item)), `${id}: ${o.item} has a source`);
          if (o.kind === 'explore') assert(Z.areas.some((a) => a.id === o.area), `${id}: area ${o.area}`);
          if (o.kind === 'talk' || o.kind === 'deliver') assert(npcAt.has(o.npc || o.to), `${id}: ${o.npc || o.to} placed`);
          if (o.kind === 'escort') assert(C.npcs[o.npc] && C.npcs[o.npc].roles.includes('escort'), `${id}: escort ${o.npc}`);
        }
        for (const r of q.rewards.choice || []) {
          const it = C.items[r];
          assert(it, `${id}: reward ${r}`);
          assert(it.reqLevel <= Math.max(q.minLevel, q.requires.level || 0) + 2, `${id}: ${r} wearable at once (req ${it.reqLevel})`);
        }
      }
      const kinds = new Set([...LH_QUEST_ORDER, ...DR_QUEST_ORDER].flatMap((id) => C.quests[id].objectives.map((o) => o.kind)));
      for (const k of ['kill', 'collect', 'escort', 'deliver', 'explore', 'talk']) assert(kinds.has(k), `a ${k} quest`);
    },
  },
  {
    name: 'Larch Mine: the door in Larchhill takes a hero into their own copy; the exit puts them back on the door`s out in Larchhill; a save inside loads there',
    fn() {
      const C = content();
      const w = world(11);
      const dr = C.zones.larchhill.doors.find((d) => d.id === 'larch_mine');
      const id = w.addPlayer({ name: 'Ann', cls: 'warden', zone: 'larchhill', x: dr.out[0], y: dr.out[1], level: 20 });
      w.enqueue(id, { t: 'move', dx: 1, dy: 0 });
      const ev = run(w, 120, (x) => x.type === 'zone' && x.id === id).find((x) => x.type === 'zone' && x.id === id);
      w.enqueue(id, { t: 'stop' }); run(w, 2);
      assert(ev && ev.from === 'larchhill' && /^larch_mine#/.test(ev.to), `into a copy (${JSON.stringify(ev)})`);
      eq(ev.kind, 'cave');
      const e = w.get(id);
      const s = w.saveFields(id);
      const id2 = w.addPlayer({ name: 'Bea', cls: 'warden', ...s, zone: e.zone, x: e.x, y: e.y });
      eq(w.get(id2).zone, 'larchhill', 'a save made inside loads in Larchhill');
      eq(tile(w.get(id2)).join(','), dr.out.join(','), 'at the door`s out');
      // walk out: the exit join is under the entry
      w.enqueue(id, { t: 'move', dx: 0, dy: 1 });
      const ev2 = run(w, 120, (x) => x.type === 'zone' && x.id === id).find((x) => x.type === 'zone' && x.id === id);
      assert(ev2 && ev2.to === 'larchhill', `out to Larchhill (${JSON.stringify(ev2)})`);
      eq(tile(e).join(','), dr.out.join(','));
    },
  },
  {
    name: 'band flights: Thornfold to Larch Cross flies the world leg, changes zone at the gate and lands in Larchhill; Larch Cross to Highdrove lands in the Reach',
    fn() {
      const r1 = flightRoute('thornfold', 'larch_cross'), r2 = flightRoute('larch_cross', 'highdrove');
      eq(r1.legs.map((l) => l.zone).join(','), 'world,larchhill');
      eq(r2.legs.map((l) => l.zone).join(','), 'larchhill,drovers_reach');
      const C = content30();
      const w = world(5, C);
      const id = w.addPlayer({ name: 'Ann', cls: 'scribe', zone: 'world', x: 240, y: 140, level: 22, gold: 80, flights: ['thornfold', 'larch_cross', 'highdrove'] });
      const e = w.get(id);
      const fm = npcOf(w, 'fm_thornfold');
      e.zone = fm.zone; e.x = fm.x + 16 * 16; e.y = fm.y;
      w.enqueue(id, { t: 'fly', npc: fm.id, to: 'larch_cross' });
      let evs = run(w, 1200, (x) => x.type === 'flight_end');
      assert(evs.some((x) => x.type === 'zone' && x.id === id && x.from === 'world' && x.to === 'larchhill'), 'zone event at the gate');
      eq(e.zone, 'larchhill');
      run(w, 40);
      const km = npcOf(w, 'lh_kitemaster');
      e.x = km.x + 16 * 16; e.y = km.y;
      w.enqueue(id, { t: 'fly', npc: km.id, to: 'highdrove' });
      evs = run(w, 2400, (x) => x.type === 'flight_end');
      assert(evs.some((x) => x.type === 'flight_end'), 'landed');
      eq(e.zone, 'drovers_reach');
    },
  },
  {
    name: 'band events: the Night Post and the Night Drove spawn only at night in their own zones and pay bonus kill XP',
    fn() {
      const C = content();
      for (const ev of [LH_EVENT, DR_EVENT]) {
        const Z = C.zones[ev.zone];
        const sp = C.nightSpawns.filter((s) => s.zone === ev.zone && ev.groups.includes(s.group));
        assert(sp.length >= 6, `${ev.id}: ${sp.length} night spawns`);
        for (const s of sp) assert(spotFree(Z, s.x, s.y) || Z.collision[s.y][s.x] === '.', `${ev.id}: spawn at ${s.x},${s.y} walkable`);
        assert(!C.spawns.some((s) => ev.groups.includes(s.group)), `${ev.id}: none by day`);
        assert(ev.xpBonus > 0 && /night/i.test(ev.text.start), `${ev.id}: bonus and text`);
      }
    },
  },
  {
    name: 'band chains: both zones` quests play through with quest commands (accept, kill, collect, explore, talk, deliver, escort, turn in), ending with Elder Mael',
    fn() {
      const C = contentBand();
      const w = world(21, C);
      const id = w.addPlayer({ name: 'Ann', cls: 'warden', zone: 'larchhill', x: 545, y: 6 });
      const e = w.get(id);
      w.setLevel(id, 30);
      eq(e.level, 30, 'level 30 (the test cap)');
      const npc = (t) => w.state.ents.find((x) => x.kind === 'npc' && x.template === t);
      const goTo = (zone, tx, ty) => { e.zone = zone; e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };
      const at = (t) => { const n = npc(t); assert(n, `npc ${t} spawned`); e.zone = n.zone; e.x = n.x + 8 * 16; e.y = n.y; return n; };
      const kill = (m) => { e.zone = m.zone; e.x = m.x + 8 * 16; e.y = m.y; m.tagger = id; w.internals.combat.kill(m, e); run(w, 1); };
      const dg = w.internals.dungeons;
      const inZone = (x, zid) => x.zone === zid || (zid === 'larch_mine' && /^larch_mine#/.test(x.zone));
      for (const qid of [...LH_QUEST_ORDER, ...DR_QUEST_ORDER]) {
        const q = C.quests[qid];
        const zid = q.place || q.zone;
        // the hero at the quest's level (a hero 5 levels over a foe gets no drops from it)
        w.setLevel(id, Math.min(30, Math.max(q.level, (q.requires && q.requires.level) || 0)));
        const g = at(q.giver);
        w.enqueue(id, { t: 'quest_accept', quest: qid, npc: g.id });
        run(w, 2);
        assert(e.quests[qid], `${qid}: accepted (${w.quests.status(e, qid)})`);
        // a quest in the cave: into the hero's copy
        let copy = null;
        if (q.place) { copy = dg.enter(e, q.place); e.zone = copy; }
        q.objectives.forEach((o, i) => {
          const left = () => e.quests[qid] && e.quests[qid].counts[i] < (o.count || 1);
          const find = (pred) => w.state.ents.find((x) => x.kind === 'mob' && !x.dead && (copy ? x.zone === copy : inZone(x, zid)) && pred(x));
          if (o.kind === 'kill') {
            for (let k = 0; k < 300 && left(); k++) { const m = find((x) => x.template === o.mob); if (m) kill(m); else run(w, 400); }
          } else if (o.kind === 'collect') {
            const nodes = w.state.ents.filter((x) => x.kind === 'object' && x.node && x.node.item === o.item);
            if (nodes.length) {
              for (let k = 0; k < 60 && left(); k++) { const ob = nodes[k % nodes.length]; goTo(ob.zone, Math.floor(ob.x / 256), Math.floor((ob.y - 1) / 256)); w.enqueue(id, { t: 'interact', id: ob.id }); run(w, 4 + (ob.node.channel || 0) * 20); }
            } else {
              const srcs = Object.entries(C.mobs).filter(([, m]) => (m.loot.table || []).some((x) => x.item === o.item)).map(([mid]) => mid);
              assert(srcs.length, `${qid}: a foe drops ${o.item}`);
              for (let k = 0; k < 400 && left(); k++) { const m = find((x) => srcs.includes(x.template)); if (m) kill(m); else run(w, 400); }
            }
          } else if (o.kind === 'explore') {
            const a = C.zones[o.zone].areas.find((x) => x.id === o.area);
            const cx = a.x + Math.floor(a.w / 2), cy = a.y + Math.floor(a.h / 2);
            let ok = false;
            for (let r = 0; r <= 12 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) if (spotFree(C.zones[o.zone], cx + dx, cy + dy)) { goTo(o.zone, cx + dx, cy + dy); ok = true; }
            w.enqueue(id, { t: 'move', dx: 1, dy: 0 }); run(w, 2); w.enqueue(id, { t: 'stop' }); run(w, 2);
          } else if (o.kind === 'talk') { const n = at(o.npc); w.enqueue(id, { t: 'interact', id: n.id }); run(w, 2); }
          else if (o.kind === 'deliver') { const n = at(o.to); w.enqueue(id, { t: 'interact', id: n.id }); run(w, 2); }
          else if (o.kind === 'escort') {
            // walk to the escort, then carry hero and escort to the end (the ambushes are the escort tests' job)
            goTo(o.from.zone, o.from.x + 1, o.from.y); run(w, 10);
            const es = w.state.ents.find((x) => x.kind === 'npc' && x.escort && x.escort.owner === id);
            assert(es, `${qid}: the escort spawned`);
            for (let k = 0; k < 40 && left(); k++) {
              for (const m of w.state.ents.filter((x) => x.kind === 'mob' && !x.dead && x.zone === es.zone && Math.hypot(x.x - es.x, x.y - es.y) < 256 * 12)) { m.tagger = id; w.internals.combat.kill(m, e); }
              goTo(o.to.zone, o.to.x, o.to.y); es.x = e.x + 256; es.y = e.y; run(w, 10);
            }
          }
          assert(!left(), `${qid}: objective ${i} (${o.kind}) done (${JSON.stringify(e.quests[qid])})`);
        });
        if (copy) { e.zone = 'larchhill'; dg.leave(e, copy); }
        assert(e.quests[qid] && e.quests[qid].state === 'ready', `${qid}: ready (${JSON.stringify(e.quests[qid])})`);
        e.bag = []; e.pendingLoot = [];     // a long run fills the bag with junk and drops: room for the reward
        const t = at(q.turnIn);
        w.enqueue(id, { t: 'quest_turnin', quest: qid, npc: t.id, choice: 0 });
        run(w, 2);
        assert(e.questsDone.includes(qid), `${qid}: turned in`);
      }
      eq(e.zone, 'world', 'the last hand-in is in Willowmere');
    },
  },
];

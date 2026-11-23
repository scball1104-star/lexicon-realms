// Wave 3 realms2 (2026-11-22): Saffron Haven and the Nameless Hollow, two more start realms built like the Rootbound.
// Zones and their one-way journeys, quests and their data, the start choice, the chains played through to Elder Mael,
// flight and inns, and the two signature mechanics in the sim: the sandstorm (sight, the wind's pull, chime shelter,
// riders who see further) and the lantern watch (cones, the alarm, ravens that squawk, fog banks, Curfew resets).
import { assert, eq, content } from './_harness.mjs';
import { createWorld } from '../../src/sim/index.js';
import { spotFree } from '../../src/sim/collision.js';
import { OUTDOOR } from '../../src/data/maps/index.js';
import { START_REALMS } from '../../src/data/rootbound.js';
import { SH_QUESTS, SH_QUEST_ORDER } from '../../src/data/saffron.js';
import { NH_QUESTS, NH_QUEST_ORDER } from '../../src/data/hollow.js';
import { R2_RULES, stormAt, fogBanksAt } from '../../src/data/realms2.js';
import { flightRoute } from '../../src/data/travel.js';

const world = (seed = 3) => createWorld({ seed, content: content() });
const tile = (e) => [Math.floor(e.x / 256), Math.floor((e.y - 1) / 256)];
const run = (w, n, pred = null) => { const out = []; for (let i = 0; i < n; i++) { const ev = w.step(); out.push(...ev); if (pred && ev.some(pred)) break; } return out; };
const goTo = (e, zone, tx, ty) => { e.zone = zone; e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };
const REALMS = [
  { cls: 'wayfinder', zone: 'saffron', quests: SH_QUESTS, order: SH_QUEST_ORDER, boss: 'sh_ravi', teacher: 'sh_sava', inn: 'blue_sail', point: 'saffron_haven' },
  { cls: 'inkblade', zone: 'hollow', quests: NH_QUESTS, order: NH_QUEST_ORDER, boss: 'nh_steward', teacher: 'nh_corvin', inn: 'blank_sign', point: 'blank_sign' },
];
const newHero = (w, cls, name = 'Ann') => {
  const R = START_REALMS[cls];
  return w.addPlayer({ name, cls, zone: R.zone, x: R.x, y: R.y, lantern: { ...R.lantern }, home: { inn: R.home }, lanternStone: true, newHero: true });
};

export const tests = [
  {
    name: 'realms2 zones: Saffron Haven and the Nameless Hollow are 576 x 384 outdoor zones; each leaves by a one-way ride that lands on a walkable world cell (the walk through, the ride line on the zone event)',
    fn() {
      const C = content();
      for (const R of REALMS) {
        const Z = C.zones[R.zone];
        assert(OUTDOOR[R.zone] && Z, `${R.zone} loaded`);
        eq(Z.w * 1000 + Z.h, 576384, `${R.zone} 576 x 384`);
        let walk = 0; for (const row of Z.collision) for (const c of row) if (c === '.') walk++;
        assert(walk / (Z.w * Z.h) > 0.15, `${R.zone} walkable ${(100 * walk / (Z.w * Z.h)).toFixed(1)}%`);
        const out = Z.joins.find((j) => j.to === 'world');
        assert(out && out.ride && !/[–—]/.test(out.ride), `${R.zone}: a ride out`);
        assert(spotFree(C.zones.world, out.tx, out.ty), `${R.zone}: lands on a free world cell ${out.tx},${out.ty}`);
        const w = world(5);
        const id = newHero(w, R.cls);
        const e = w.get(id);
        // the ride waits for the boss: a new hero is turned back with a line
        goTo(e, R.zone, out.x + 3, out.y + 1);
        const ev0 = [];
        for (let i = 0; i < 40; i++) { w.enqueue(id, { t: 'move', dx: -1, dy: 0 }); ev0.push(...run(w, 1)); }
        eq(e.zone, R.zone, `${R.zone}: the ride waits for ${out.needs}`);
        assert(ev0.some((x) => x.type === 'mob_emote' && (x.to || []).includes(id)), `${R.zone}: told why`);
        e.questsDone = [...(e.questsDone || []), out.needs];
        goTo(e, R.zone, out.x + Math.floor(out.w / 2) + (out.x === 0 ? 2 : 2), out.y + 1);
        const evs = [];
        for (let i = 0; i < 60 && e.zone === R.zone; i++) { w.enqueue(id, { t: 'move', dx: -1, dy: 0 }); evs.push(...run(w, 1)); }
        const ev = evs.find((x) => x.type === 'zone' && x.id === id);
        assert(ev && ev.from === R.zone && ev.to === 'world' && ev.ride, `${R.zone}: walked onto the world (${JSON.stringify(ev)})`);
        eq(e.zone, 'world');
        const [tx, ty] = tile(e);
        assert(Math.abs(tx - out.tx) <= 1 && Math.abs(ty - out.ty) <= 1, `${R.zone}: landed at ${tx},${ty}`);
      }
    },
  },
  {
    name: 'realms2 quests: 11 to 13 per realm, levels 1 to 6, every giver and turn-in stands somewhere, every foe, item and area they ask for exists in the realm, a boss, a rare, the teacher trains the class, no dashes',
    fn() {
      const C = content();
      const npcAt = new Map();
      for (const s of C.spawns) if (s.npc) npcAt.set(s.npc, s.zone);
      for (const R of REALMS) {
        const Z = C.zones[R.zone];
        assert(R.order.length >= 11 && R.order.length <= 13, `${R.zone}: ${R.order.length} quests`);
        const mobsHere = new Set(C.spawns.filter((s) => s.zone === R.zone && s.mob).map((s) => s.mob));
        const nodeItems = new Set((Z.nodes || []).map((x) => x.item));
        const dropItems = new Set();
        for (const m of mobsHere) for (const x of (C.mobs[m].loot.table || [])) dropItems.add(x.item);
        let xp = 0;
        for (const id of R.order) {
          const q = C.quests[id];
          assert(q && R.quests[id], `${id} loaded`);
          assert(C.sideQuests.includes(id), `${id} offered`);
          assert(npcAt.has(q.giver) && npcAt.has(q.turnIn), `${id}: giver ${q.giver} / turn-in ${q.turnIn} placed`);
          assert(q.level >= 1 && q.level <= 6, `${id}: level 1 to 6`);
          for (const t of Object.values(q.text)) assert(!/[–—]/.test(t), `${id}: no dashes`);
          for (const o of q.objectives) {
            if (o.kind === 'kill') assert(mobsHere.has(o.mob), `${id}: kill ${o.mob} lives in ${R.zone}`);
            if (o.kind === 'collect') assert(nodeItems.has(o.item) || dropItems.has(o.item), `${id}: ${o.item} has a source`);
            if (o.kind === 'explore') assert((Z.areas || []).some((a) => a.id === o.area), `${id}: area ${o.area}`);
            if (o.kind === 'talk' || o.kind === 'deliver') assert(npcAt.has(o.npc || o.to), `${id}: ${o.npc || o.to} placed`);
            if (o.kind === 'collect' || o.kind === 'deliver') assert(C.items[o.item] && C.items[o.item].kind === 'quest', `${id}: ${o.item} is a quest item`);
            if (o.kind === 'escort') { assert(C.npcs[o.npc] && C.npcs[o.npc].escort, `${id}: escort ${o.npc}`); assert(spotFree(Z, o.from.x, o.from.y) && spotFree(Z, o.to.x, o.to.y), `${id}: escort ends walkable`); }
          }
          for (const r of q.rewards.choice || []) assert(C.items[r], `${id}: reward ${r}`);
          xp += q.rewards.xp;
        }
        assert(xp >= C.progression.xpAtLevel[6], `${R.zone}: the chain alone gives ${xp} xp, enough for level 6`);
        assert(C.mobs[R.boss].boss && C.mobs[R.boss].elite && mobsHere.has(R.boss), `${R.zone}: the boss`);
        assert(Object.values(C.rares).some((r) => C.spawns.some((s) => s.mob === r.id && s.zone === R.zone)), `${R.zone}: a rare`);
        eq(C.npcs[R.teacher].trainer.cls, R.cls, `${R.zone}: the ${R.cls} trains here`);
        const camps = new Set(C.spawns.filter((s) => s.zone === R.zone && s.mob).map((s) => (C.zones[R.zone].areas.find((a) => s.x >= a.x && s.y >= a.y && s.x < a.x + a.w && s.y < a.y + a.h && !a.safe) || {}).id).filter(Boolean));
        assert(camps.size >= 5, `${R.zone}: ${camps.size} camp areas`);
        assert([...npcAt.entries()].filter(([, z]) => z === R.zone).length >= 6, `${R.zone}: about 6 npcs`);
      }
    },
  },
  {
    name: 'realms2 start: a new Wayfinder starts at the oasis and a new Inkblade at the Blank Sign (lantern and home there), the first quest on offer; the start list keeps the Scribe and adds both',
    fn() {
      eq(START_REALMS.scribe.zone, 'rootbound', 'the Scribe still starts in the Rootbound');
      for (const R of REALMS) {
        const S = START_REALMS[R.cls];
        eq(S.zone, R.zone, `${R.cls} start realm`);
        assert(S.welcome && !/[–—]/.test(S.welcome + S.line), 'a welcome line');
        const w = world(9);
        const e = w.get(newHero(w, R.cls));
        eq(e.zone, R.zone);
        eq(e.lantern.zone + ':' + e.lantern.id, `${R.zone}:${S.lantern.id}`, 'wakes at the hub lantern');
        eq(e.home.inn, R.inn, 'home is the realm inn');
        eq(w.quests.status(e, R.order[0]), 'available', 'the first quest is on offer');
        assert(content().zones[R.zone].lanterns.some((l) => l.id === S.lantern.id), 'the lantern exists');
      }
    },
  },
  {
    name: 'realms2 travel: each hub has a kitemaster (talk unlocks the point) and an inn; the kite flies Willowmere to each realm and back',
    fn() {
      const C = content();
      for (const R of REALMS) {
        const pt = C.travel.flight.points[R.point];
        assert(pt && pt.zone === R.zone, `${R.point} point`);
        assert(Object.values(C.travel.inns).some((i) => i.id === R.inn && i.zone === R.zone), `${R.inn} inn`);
        const there = flightRoute('willowmere', R.point), back = flightRoute(R.point, 'willowmere');
        assert(there && back && there.legs.map((l) => l.zone).join() === `world,${R.zone}`, `${R.point}: route`);
        const w = world(4);
        const id = newHero(w, R.cls);
        const n = w.state.ents.find((x) => x.kind === 'npc' && x.template === pt.npc);
        const e = w.get(id); e.zone = n.zone; e.x = n.x + 16 * 16; e.y = n.y;
        w.enqueue(id, { t: 'interact', id: n.id });
        run(w, 2);
        assert((e.flights || []).includes(R.point), `${R.point}: unlocked by talking`);
      }
    },
  },
  {
    name: 'realms2 chains: each realm plays through with quest commands (accept, kill, collect, explore, talk, escort, deliver, turn in) to Elder Mael in Willowmere',
    fn() {
      const C = content();
      for (const R of REALMS) {
        const w = world(21);
        const id = newHero(w, R.cls);
        const e = w.get(id);
        w.setLevel(id, 6);
        const npc = (t) => w.state.ents.find((x) => x.kind === 'npc' && x.template === t && !x.escort);
        const at = (t) => { const n = npc(t); e.zone = n.zone; e.x = n.x + 8 * 16; e.y = n.y; return n; };
        const kill = (m) => { goTo(e, R.zone, ...tile(m)); m.tagger = id; w.internals.combat.kill(m, e); run(w, 1); };
        for (const qid of R.order) {
          const q = C.quests[qid];
          const g = at(q.giver);
          w.enqueue(id, { t: 'quest_accept', quest: qid, npc: g.id });
          run(w, 2);
          assert(e.quests[qid], `${qid}: accepted`);
          q.objectives.forEach((o, i) => {
            const left = () => e.quests[qid] && e.quests[qid].counts[i] < (o.count || 1);
            if (o.kind === 'kill') {
              for (let k = 0; k < 200 && left(); k++) { const m = w.state.ents.find((x) => x.kind === 'mob' && x.template === o.mob && !x.dead && x.zone === R.zone); if (m) kill(m); else run(w, 400); }
            } else if (o.kind === 'collect') {
              const nodes = w.state.ents.filter((x) => x.kind === 'object' && x.node && x.node.item === o.item);
              if (nodes.length) {
                for (let k = 0; k < 40 && left(); k++) { const ob = nodes[k % nodes.length]; goTo(e, R.zone, ...tile(ob)); w.enqueue(id, { t: 'interact', id: ob.id }); run(w, 4 + (ob.node.channel || 0) * 20); }
              } else {
                const src = Object.entries(C.mobs).find(([mid, m]) => (m.loot.table || []).some((x) => x.item === o.item) && w.state.ents.some((x) => x.kind === 'mob' && x.template === mid && x.zone === R.zone));
                assert(src, `${qid}: a foe drops ${o.item}`);
                for (let k = 0; k < 300 && left(); k++) { const m = w.state.ents.find((x) => x.kind === 'mob' && x.template === src[0] && !x.dead && x.zone === R.zone); if (m) kill(m); else run(w, 400); }
              }
            } else if (o.kind === 'explore') {
              const a = C.zones[R.zone].areas.find((x) => x.id === o.area);
              const cx = a.x + Math.floor(a.w / 2), cy = a.y + Math.floor(a.h / 2);
              let ok = false;
              for (let r = 0; r <= 6 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) if (spotFree(C.zones[R.zone], cx + dx, cy + dy)) { goTo(e, R.zone, cx + dx, cy + dy); ok = true; }
              w.enqueue(id, { t: 'move', dx: 1, dy: 0 }); run(w, 2); w.enqueue(id, { t: 'stop' }); run(w, 2);
            } else if (o.kind === 'escort') {
              const es = w.state.ents.find((x) => x.escort && x.escort.owner === id);
              assert(es, `${qid}: the escort stands at the start`);
              e.zone = es.zone; e.x = es.x + 16; e.y = es.y; run(w, 3);
              goTo(e, R.zone, o.to.x, o.to.y); es.x = e.x + 16; es.y = e.y;
              run(w, 6);
            } else if (o.kind === 'talk') { const n = at(o.npc); w.enqueue(id, { t: 'interact', id: n.id }); run(w, 2); }
            else if (o.kind === 'deliver') { const n = at(o.to); w.enqueue(id, { t: 'interact', id: n.id }); run(w, 2); }
          });
          assert(e.quests[qid] && e.quests[qid].state === 'ready', `${qid}: ready (${JSON.stringify(e.quests[qid])})`);
          const t = at(q.turnIn);
          e.bag = (e.bag || []).filter((b) => b && C.items[b.item] && C.items[b.item].kind === 'quest');
          w.enqueue(id, { t: 'quest_turnin', quest: qid, npc: t.id, choice: 0 });
          run(w, 2);
          assert(e.questsDone.includes(qid), `${qid}: turned in`);
        }
        eq(e.zone, 'world', `${R.zone}: the last hand-in is in Willowmere`);
      }
    },
  },
  {
    name: 'realms2 storm: the clock (data helper and sim agree), the wind pulls a hero in the open east, a chime post and the town shelter her, the storm takes far targets, riders see further and scorpions less',
    fn() {
      const S = R2_RULES.storm;
      const w = world(7);
      const R2 = w.internals.realms2;
      for (let t = 0; t < S.period * 2; t += 37) { const a = stormAt(t), b = R2.stormAt(t); eq(a.phase + a.k.toFixed(4), b.phase + b.k.toFixed(4), `tick ${t}`); }
      const full = (() => { for (let t = 0; t < S.period * 2; t++) if (stormAt(t).phase === 'full' && stormAt(t).left > 300) return t; return null; })();
      assert(full != null, 'a full storm');
      while (w.state.tick < full) w.step();
      const id = newHero(w, 'wayfinder');
      const e = w.get(id);
      // the open sand, far from a chime and the town
      goTo(e, 'saffron', 300, 196);
      assert(!R2.sheltered(e), 'the open sand is no shelter');
      const x0 = e.x; run(w, 40);
      assert(e.x - x0 > 256, `pulled east ${((e.x - x0) / 256).toFixed(1)} tiles`);
      // by a chime post: no pull
      const [cx, cy] = S.chimes[3];
      let spot = null;
      for (let r = 1; r <= 4 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) if (spotFree(content().zones.saffron, cx + dx, cy + r)) spot = [cx + dx, cy + r];
      goTo(e, 'saffron', ...spot);
      assert(R2.sheltered(e), 'a chime post shelters');
      const x1 = e.x; run(w, 40);
      eq(e.x, x1, 'no pull by the chime');
      // the town
      goTo(e, 'saffron', 190, 194); assert(R2.sheltered(e), 'the town shelters');
      // a far target is lost in the storm
      goTo(e, 'saffron', 300, 196);
      const far = w.state.ents.find((m) => m.kind === 'mob' && m.zone === 'saffron' && !m.dead && Math.hypot(m.x - e.x, m.y - e.y) > (S.sightTiles + 2) * 256 && Math.hypot(m.x - e.x, m.y - e.y) < 30 * 256);
      assert(far, 'a foe out there');
      e.target = far.id;
      const evs = run(w, 2);
      assert(e.target == null && evs.some((x) => x.type === 'target' && x.src === id && x.reason === 'lost'), 'the storm takes the target');
      // sight: a rider sees further, a scorpion less
      const ai = w.internals.ai;
      const rider = w.state.ents.find((m) => m.template === 'sh_rider' && m.zone === 'saffron');
      const scorp = w.state.ents.find((m) => m.template === 'sh_scorpion' && m.zone === 'saffron');
      const T = content().mobs;
      e.level = rider.level; assert(ai.aggroRadius(rider, e) > T.sh_rider.aggroRadius * 1.3, `a rider sees further (${ai.aggroRadius(rider, e)})`);
      e.level = scorp.level; assert(ai.aggroRadius(scorp, e) < T.sh_scorpion.aggroRadius * 0.7, `a scorpion sees less (${ai.aggroRadius(scorp, e)})`);
      // clear air: back to normal
      const clear = (() => { for (let t = w.state.tick; t < w.state.tick + S.period; t++) if (stormAt(t).phase === 'clear') return t; return null; })();
      while (w.state.tick < clear) w.step();
      goTo(e, 'saffron', 300, 196);
      const x2 = e.x; run(w, 20); eq(e.x, x2, 'no wind in clear air');
    },
  },
  {
    name: 'realms2 watch: a watchman sees only inside his lantern cone; seen, he raises the alarm and the watch near comes; a raven squawks and wakes the watch; a fog bank hides you; being seen resets Curfew',
    fn() {
      const C = content();
      const Wt = R2_RULES.watch;
      const w = world(11);
      const R2 = w.internals.realms2, ai = w.internals.ai;
      for (let t = 0; t < 4000; t += 113) { const a = fogBanksAt(t), b = R2.fogAt(t); for (let i = 0; i < a.length; i++) assert(Math.abs(a[i].x - b[i].x) < 1e-6 && Math.abs(a[i].y - b[i].y) < 1e-6, `fog ${i} tick ${t}`); }
      const id = newHero(w, 'inkblade');
      const e = w.get(id);
      e.level = 4;
      const wm = w.state.ents.find((m) => m.template === 'nh_watchman' && m.zone === 'hollow' && !(m.spawn && m.spawn.patrol));
      assert(wm, 'a standing watchman');
      // far from any fog bank: move the fog clock to a tick whose banks are all far from him
      const [mx, my] = tile(wm);
      wm.dir = 'right';
      const place = (dx, dy) => { e.zone = 'hollow'; e.x = wm.x + dx * 256; e.y = wm.y + dy * 256; };
      place(4, 0);
      if (!R2.inFog(e)) assert(ai.aggroRadius(wm, e) >= Wt.coneTiles * 16 * 0.9, `in front, inside the cone (${ai.aggroRadius(wm, e)})`);
      place(-4, 0);
      if (!R2.inFog(e)) assert(ai.aggroRadius(wm, e) <= Wt.bumpTiles * 16 + 1, `behind him, unseen (${ai.aggroRadius(wm, e)})`);
      place(0, 4);
      if (!R2.inFog(e)) assert(ai.aggroRadius(wm, e) <= Wt.bumpTiles * 16 + 1, 'beside him, unseen');
      place(-1, 0);
      assert(ai.aggroRadius(wm, e) >= Wt.bumpTiles * 16, 'bump into him and he notices');
      // the alarm: a second watchman near comes to the same hero; Curfew's progress resets
      const qid = 'nh_curfew';
      e.quests[qid] = { state: 'active', counts: [1, 1, 0], at: w.state.tick };
      const other = w.state.ents.find((m) => m !== wm && m.template === 'nh_watchman' && m.zone === 'hollow' && !m.dead && Math.hypot(m.x - wm.x, m.y - wm.y) < Wt.alarmTiles * 256 * 0.8);
      assert(other, 'another watchman near');
      wm.threat[id] = 1; ai.engage(wm, e, false);
      const evs = run(w, 2);
      assert(evs.some((x) => x.type === 'yell' && x.id === wm.id), 'HALT: the alarm');
      eq(other.ai.mode, 'combat', 'the watch near comes running');
      eq(other.ai.target, id, 'to the same hero');
      eq(e.quests[qid].counts.join(','), '0,0,0', 'Curfew starts again');
      assert(evs.some((x) => x.type === 'mob_emote' && (x.to || []).includes(id) && /start the crossing again/.test(x.text)), 'told why');
      // a raven squawks after a moment and wakes the watch
      const w2 = world(12), id2 = newHero(w2, 'inkblade', 'Bea'), e2 = w2.get(id2), ai2 = w2.internals.ai;
      const raven = w2.state.ents.find((m) => m.template === 'nh_raven' && m.zone === 'hollow' && w2.state.ents.some((x) => x.template === 'nh_watchman' && Math.hypot(x.x - m.x, x.y - m.y) < Wt.alarmTiles * 256 * 0.8));
      assert(raven, 'a raven near the watch');
      e2.zone = 'hollow'; e2.x = raven.x + 256; e2.y = raven.y; e2.hp = e2.hpMax = 99999;
      raven.threat[id2] = 1; ai2.engage(raven, e2, false);
      const evs2 = run(w2, Wt.squawkSec * 20 + 4);
      assert(evs2.some((x) => x.type === 'yell' && x.id === raven.id && /SQUAWK/.test(x.text)), 'the raven squawks');
      assert(w2.state.ents.some((m) => m.template === 'nh_watchman' && m.ai && m.ai.mode === 'combat' && m.ai.target === id2), 'the watch wakes');
      // a raven killed before it squawks wakes nobody
      const w3 = world(13), id3 = newHero(w3, 'inkblade', 'Cat'), e3 = w3.get(id3), ai3 = w3.internals.ai;
      const r3 = w3.state.ents.find((m) => m.template === 'nh_raven' && m.zone === 'hollow');
      e3.zone = 'hollow'; e3.x = r3.x + 256; e3.y = r3.y;
      r3.threat[id3] = 1; ai3.engage(r3, e3, false); run(w3, 5);
      r3.tagger = id3; w3.internals.combat.kill(r3, e3);
      const evs3 = run(w3, Wt.squawkSec * 20 + 4);
      assert(!evs3.some((x) => x.type === 'yell' && x.id === r3.id), 'a dead raven cannot squawk');
      // fog: a hero inside a bank is unseen, and a foe chasing her drops the chase
      const f = R2.fogAt(w.state.tick)[0];
      e.zone = 'hollow'; e.x = Math.round(f.x * 256 + 128); e.y = Math.round(f.y * 256 + 128);
      assert(R2.inFog(e), 'inside the bank');
      eq(ai.aggroRadius(wm, e), 16, 'unseen in the fog (the floor radius)');
      wm.threat[id] = 1; ai.engage(wm, e, false);
      run(w, 12);
      assert(wm.ai.mode !== 'combat', `the watchman lost her in the fog (${wm.ai.mode})`);
      void mx; void my;
    },
  },
];

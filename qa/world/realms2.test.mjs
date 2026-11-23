// Wave 3 start realms, lane realms1 (2026-11-22): Emberpeak (the Warden) and Valewyn (the Mender). The zones and their
// joins by ride, the quests (every giver, foe, item and area exists; the chain plays through to Elder Mael and leaves
// the first Willowmere quest on offer), the start choice, the inn and the kitemaster, the rides both ways, and each
// realm's signature in the sim: the lava crossings and Hold the Gate, the tide. Sim only: createWorld on the real content.
import { assert, eq, content } from './_harness.mjs';
import { createWorld, restoreWorld } from '../../src/sim/index.js';
import { OUTDOOR } from '../../src/data/maps/index.js';
import { START_REALMS } from '../../src/data/rootbound.js';
import { REALMS2_ORDER } from '../../src/data/start_realms2.js';
import { lavaAt, tideAt, WADE_AURA } from '../../src/sim/realm_mech.js';
import * as CY from '../../src/data/realm_cycles.js';
import { spotFree } from '../../src/sim/collision.js';

const world = (seed = 3) => createWorld({ seed, content: content() });
const tile = (e) => [Math.floor(e.x / 256), Math.floor((e.y - 1) / 256)];
function run(w, n, pred = null) {
  const out = [];
  for (let i = 0; i < n; i++) { const ev = w.step(); out.push(...ev); if (pred && ev.some(pred)) break; }
  return out;
}
const npcOf = (w, template) => w.state.ents.find((e) => e.kind === 'npc' && e.template === template);
const goTo = (e, zone, tx, ty) => { e.zone = zone; e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };
const atNpc = (e, n) => { e.zone = n.zone; e.x = n.x + 8 * 16; e.y = n.y; };
const REALMS = [
  { id: 'emberpeak', cls: 'warden', teacher: 'ep_harl', first: 'ep_bellows_square', boss: 'ep_brask', rare: 'ep_rare_scorchjaw', inn: 'bellows_inn', point: 'emberpeak',
    down: { npc: 'ep_carter', ride: 'ep_cart_down' }, up: { npc: 'wm_ep_carter', ride: 'ep_cart_up' },
    foes: ['ep_cinderling', 'ep_ash_hound', 'ep_slag_golem', 'ep_raider', 'ep_firethrower', 'ep_gate_raider', 'ep_furnace_golem', 'ep_brask', 'ep_rare_scorchjaw'] },
  { id: 'valewyn', cls: 'mender', teacher: 'vw_orla', first: 'vw_wet_feet', boss: 'vw_brine_widow', rare: 'vw_rare_old_pinch', inn: 'dry_loft', point: 'valewyn',
    down: { npc: 'vw_maren', ride: 'vw_ferry_up' }, up: { npc: 'wm_vw_ferryhand', ride: 'vw_ferry_down' },
    foes: ['vw_mudsnapper', 'vw_bog_leech', 'vw_drowned', 'vw_brine_eel', 'vw_brine_widow', 'vw_rare_old_pinch'] },
];

/** Play one realm's chain with quest commands (the Rootbound test's way): accept, satisfy, hand in, up to Mael. */
function playChain(R) {
  const C = content();
  const w = world(31);
  const S = START_REALMS[R.cls];
  const id = w.addPlayer({ name: 'Ann', cls: R.cls, zone: S.zone, x: S.x, y: S.y, lantern: { ...S.lantern }, home: { inn: S.home } });
  const e = w.get(id);
  w.setLevel(id, 6);
  const Z = C.zones[R.id];
  const npc = (t) => npcOf(w, t);
  const at = (t) => { const n = npc(t); atNpc(e, n); return n; };
  const kill = (m) => { goTo(e, R.id, Math.floor(m.x / 256), Math.floor((m.y - 1) / 256)); m.tagger = id; w.internals.combat.kill(m, e); run(w, 1); };
  const live = (tpl, minL = 0) => w.state.ents.find((x) => x.kind === 'mob' && x.template === tpl && !x.dead && x.zone === R.id && x.level >= minL && !x.realmParked);
  for (const qid of REALMS2_ORDER[R.id]) {
    const q = C.quests[qid];
    const g = at(q.giver);
    w.enqueue(id, { t: 'quest_accept', quest: qid, npc: g.id });
    run(w, 2);
    assert(e.quests[qid], `${qid}: accepted`);
    q.objectives.forEach((o, i) => {
      const left = () => e.quests[qid] && e.quests[qid].counts[i] < (o.count || 1);
      if (o.kind === 'kill') {
        for (let k = 0; k < 300 && left(); k++) {
          // the Gate: step out before it so the waves come; the drowned: wait for high water
          if (Z.gate && o.mob === 'ep_gate_raider') { goTo(e, R.id, 430, 202); run(w, 12); }
          const m = live(o.mob);
          if (m) kill(m); else run(w, 200);
        }
      } else if (o.kind === 'collect') {
        const nodes = w.state.ents.filter((x) => x.kind === 'object' && x.node && x.node.item === o.item);
        if (nodes.length) {
          for (let k = 0; k < 200 && left(); k++) {
            const ob = nodes[k % nodes.length];
            if (ob.dead) { run(w, 40); continue; }      // gone for now (the tide, or just picked): wait a little
            goTo(e, R.id, Math.floor(ob.x / 256), Math.floor((ob.y - 1) / 256));
            w.enqueue(id, { t: 'interact', id: ob.id }); run(w, 4 + (ob.node.channel || 0) * 20);
          }
        } else {
          const src = Object.entries(C.mobs).find(([mid, m]) => (m.loot.table || []).some((x) => x.item === o.item) && w.state.ents.some((x) => x.kind === 'mob' && x.template === mid && x.zone === R.id));
          assert(src, `${qid}: a foe drops ${o.item}`);
          for (let k = 0; k < 300 && left(); k++) { const m = live(src[0]); if (m) kill(m); else run(w, 200); }
        }
      } else if (o.kind === 'explore') {
        const a = Z.areas.find((x) => x.id === o.area);
        const cx = a.x + Math.floor(a.w / 2), cy = a.y + Math.floor(a.h / 2);
        let ok = false;
        for (let r = 0; r <= 8 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) if (spotFree(Z, cx + dx, cy + dy)) { goTo(e, R.id, cx + dx, cy + dy); ok = true; }
        w.enqueue(id, { t: 'move', dx: 1, dy: 0 }); run(w, 2); w.enqueue(id, { t: 'stop' }); run(w, 2);
      } else if (o.kind === 'talk') { const n = at(o.npc); w.enqueue(id, { t: 'interact', id: n.id }); run(w, 2); }
      else if (o.kind === 'deliver') { const n = at(o.to); w.enqueue(id, { t: 'interact', id: n.id }); run(w, 2); }
      else if (o.kind === 'escort') {
        // walk the escort home: put the hero by her, start her following, then carry both to the end (the escort sim's own test covers the walk)
        goTo(e, R.id, o.from.x, o.from.y + 1); run(w, 4);
        const esc = w.state.ents.find((x) => x.escort && x.escort.owner === id);
        assert(esc, `${qid}: the escort stands at the keep steps`);
        w.enqueue(id, { t: 'interact', id: esc.id }); run(w, 4);
        for (let k = 0; k < 40 && left(); k++) {
          for (const m of w.state.ents) if (m.kind === 'mob' && !m.dead && m.zone === R.id && m.spawn && m.spawn.temporary) { m.tagger = id; w.internals.combat.kill(m, e); }
          const ty = Math.max(o.to.y, Math.floor((esc.y - 1) / 256) - 6);
          goTo(e, R.id, o.to.x, ty); esc.x = e.x; esc.y = e.y + 256; run(w, 20);
        }
      }
      assert(!left(), `${qid}: objective ${i} (${o.kind}) done: ${JSON.stringify(e.quests[qid])}`);
    });
    assert(e.quests[qid] && e.quests[qid].state === 'ready', `${qid}: ready (${JSON.stringify(e.quests[qid])})`);
    const t = at(q.turnIn);
    e.bag = e.bag.filter((b) => (C.items[b.item] || {}).kind === 'quest' || b.item === 'lantern_stone');   // a player sells the junk; the test just drops it
    w.enqueue(id, { t: 'quest_turnin', quest: qid, npc: t.id, choice: 0 });
    const tev = run(w, 2);
    assert(e.questsDone.includes(qid), `${qid}: turned in (${JSON.stringify(tev.filter((x) => x.id === id || x.src === id).slice(0, 4))})`);
  }
  eq(e.zone, 'world', 'the last hand-in is in Willowmere');
  eq(w.quests.status(e, 'wm_name_twice'), 'available', 'the first Willowmere quest (Hob, the gold !) is on offer');
}

export const tests = [
  {
    name: 'realms2: Emberpeak and Valewyn are outdoor zones of 576 x 384 (about a third walkable), each with a hub, a kitemaster, an inn, camps, a boss and a rare',
    fn() {
      const C = content();
      for (const R of REALMS) {
        const Z = C.zones[R.id];
        assert(OUTDOOR[R.id] && Z, `${R.id} loaded`);
        eq(Z.w * 1000 + Z.h, 576384, `${R.id}: 576 x 384`);
        let walk = 0; for (const row of Z.collision) for (const c of row) if (c === '.') walk++;
        const k = walk / (Z.w * Z.h);
        assert(k > 0.28 && k < 0.5, `${R.id}: ${Math.round(k * 100)}% walkable`);
        assert(Z.regions.some((r) => r.kind === 'town'), `${R.id}: a town`);
        const npcs = new Set(C.spawns.filter((s) => s.npc && s.zone === R.id).map((s) => s.npc));
        assert(npcs.size >= 6, `${R.id}: ${npcs.size} npcs`);
        assert([...npcs].some((n) => C.npcs[n].flight === R.point), `${R.id}: a kitemaster`);
        assert([...npcs].some((n) => C.npcs[n].innkeeper && C.travel.inns[n] && C.travel.inns[n].id === R.inn), `${R.id}: an innkeeper`);
        const kinds = new Set(C.spawns.filter((s) => s.zone === R.id && s.mob).map((s) => s.mob));
        for (const m of R.foes) assert(kinds.has(m), `${m} spawns in ${R.id}`);
        assert(C.mobs[R.boss].boss && C.mobs[R.boss].elite, `${R.id}: the boss`);
        assert(C.rares[R.rare] && C.mobs[R.rare].rare, `${R.id}: the rare`);
        const groups = new Set(C.spawns.filter((s) => s.zone === R.id && s.mob).map((s) => (Z.areas.find((a) => s.x >= a.x && s.y >= a.y && s.x < a.x + a.w && s.y < a.y + a.h) || {}).id));
        assert(groups.size >= 5, `${R.id}: camps in ${groups.size} places`);
        eq(C.npcs[R.teacher].trainer.cls, R.cls, `${R.id}: the ${R.cls}'s first teacher`);
        for (const s of C.spawns.filter((x) => x.zone === R.id)) assert(spotFree(Z, s.x, s.y), `${R.id}: ${s.mob || s.npc} at ${s.x},${s.y} stands on floor`);
      }
    },
  },
  {
    name: 'realms2: 10 quests each (7 to 12), every giver and turn-in stands somewhere, every foe, item and area they ask for exists, no dashes',
    fn() {
      const C = content();
      const npcAt = new Map();
      for (const s of C.spawns) if (s.npc) npcAt.set(s.npc, s.zone);
      const noDash = (t) => !/[–—]/.test(t);
      for (const R of REALMS) {
        const Z = C.zones[R.id], order = REALMS2_ORDER[R.id];
        assert(order.length >= 7 && order.length <= 12, `${R.id}: ${order.length} quests`);
        const mobsHere = new Set(C.spawns.filter((s) => s.zone === R.id && s.mob).map((s) => s.mob));
        const nodeItems = new Set((Z.nodes || []).map((x) => x.item));
        const dropItems = new Set();
        for (const m of mobsHere) for (const x of (C.mobs[m].loot.table || [])) dropItems.add(x.item);
        assert(order.some((id) => C.quests[id].objectives.some((o) => o.kind === 'kill' && o.mob === R.boss)), `${R.id}: a boss quest`);
        for (const id of order) {
          const q = C.quests[id];
          assert(q && C.sideQuests.includes(id), `${id} loaded`);
          assert(npcAt.has(q.giver) && npcAt.has(q.turnIn), `${id}: giver ${q.giver} / turn-in ${q.turnIn} placed`);
          assert(q.level >= 1 && q.level <= 6, `${id}: level 1 to 6`);
          for (const t of Object.values(q.text)) assert(noDash(t), `${id}: no dashes`);
          assert(noDash(q.name), `${id}: no dashes in the name`);
          for (const o of q.objectives) {
            if (o.kind === 'kill') assert(mobsHere.has(o.mob), `${id}: kill ${o.mob} lives in ${R.id}`);
            if (o.kind === 'collect') assert(nodeItems.has(o.item) || dropItems.has(o.item), `${id}: ${o.item} has a source`);
            if (o.kind === 'explore') assert(Z.areas.some((a) => a.id === o.area), `${id}: area ${o.area}`);
            if (o.kind === 'talk' || o.kind === 'deliver') assert(npcAt.has(o.npc || o.to), `${id}: ${o.npc || o.to} placed`);
            if (o.kind === 'collect' || o.kind === 'deliver') assert(C.items[o.item] && C.items[o.item].kind === 'quest', `${id}: ${o.item} is a quest item`);
            if (o.kind === 'escort') assert(C.npcs[o.npc] && spotFree(Z, o.from.x, o.from.y) && spotFree(Z, o.to.x, o.to.y), `${id}: the escort's ends`);
          }
          for (const r of q.rewards.choice || []) assert(C.items[r], `${id}: reward ${r}`);
        }
        for (const n of Object.values(C.npcs).filter((x) => /^(ep|vw|wm_ep|wm_vw)_/.test(x.id))) for (const t of n.talk || []) assert(noDash(t), `${n.id}: no dashes`);
      }
    },
  },
  {
    name: 'realms2: the start choice: a new Warden starts in Emberpeak, a new Mender in Valewyn (lantern and home there, the first quest on offer); the Scribe keeps the Rootbound',
    fn() {
      eq(START_REALMS.scribe.zone, 'rootbound', 'the Scribe is unchanged');
      for (const R of REALMS) {
        const w = world(9);
        const S = START_REALMS[R.cls];
        eq(S.zone, R.id, `${R.cls} -> ${R.id}`);
        assert(S.line && S.welcome && !/[–—]/.test(S.line + S.welcome), 'the card line and the welcome, no dashes');
        const id = w.addPlayer({ name: 'Ann', cls: R.cls, zone: S.zone, x: S.x, y: S.y, lantern: { ...S.lantern }, home: { inn: S.home }, lanternStone: true, newHero: true });
        const e = w.get(id);
        eq(e.zone, R.id);
        eq(e.lantern.zone, R.id, 'wakes at the realm lantern');
        eq(e.home.inn, R.inn, 'home is the realm inn');
        eq(w.quests.status(e, R.first), 'available', 'the first quest is on offer');
        // any class may pick any start realm: a Scribe in Valewyn plays the same quests
        const id2 = w.addPlayer({ name: 'Bea', cls: 'scribe', zone: S.zone, x: S.x, y: S.y, lantern: { ...S.lantern }, home: { inn: S.home } });
        eq(w.quests.status(w.get(id2), R.first), 'available', 'open to every class');
      }
    },
  },
  {
    name: 'realms2: the rides: the ore cart and the ferry carry a level 1 hero, free and out of reach, into Willowmere (a zone event) and back; the kites fly in from Willowmere',
    fn() {
      const C = content();
      for (const R of REALMS) {
        const w = world(5);
        const S = START_REALMS[R.cls];
        const id = w.addPlayer({ name: 'Ann', cls: R.cls, zone: S.zone, x: S.x, y: S.y, gold: 3 });
        const e = w.get(id);
        const carter = npcOf(w, R.down.npc);
        atNpc(e, carter);
        w.enqueue(id, { t: 'interact', id: carter.id });
        let evs = run(w, 2);
        const it = evs.find((x) => x.type === 'interact' && x.src === id);
        assert(it && it.ride && it.ride.id === R.down.ride, `${R.id}: the carter offers the ride`);
        w.enqueue(id, { t: 'ride', npc: carter.id });
        evs = run(w, 2);
        assert(evs.some((x) => x.type === 'ride_start' && x.id === id), `${R.id}: the ride starts`);
        eq(e.gold, 3, 'free');
        assert(e.auras.some((a) => a.def.flags.includes('untargetable')), 'out of reach of foes');
        const snapP = w.snapshot().entities.find((x) => x.id === id);
        assert(snapP.flight && snapP.flight.ride && snapP.flight.up === 0, 'the snapshot says ride, on the ground');
        const rd = C.travel.rides[R.down.ride];
        assert(rd.ticks / 20 > 15 && rd.ticks / 20 < 90, `${R.id}: about half a minute (${rd.ticks / 20} s)`);
        evs = run(w, rd.ticks + 60, (x) => x.type === 'flight_end' && x.id === id);
        assert(evs.some((x) => x.type === 'zone' && x.id === id && x.from === R.id && x.to === 'world'), 'a zone event into the world');
        eq(e.zone, 'world');
        assert(Math.hypot(tile(e)[0] - rd.land[0], tile(e)[1] - rd.land[1]) <= 2, `${R.id}: lands at ${rd.name} (${tile(e)})`);
        assert(spotFree(C.zones.world, ...tile(e)), 'on walkable ground');
        assert(!e.flight && !e.auras.some((a) => a.id === 'lr_flight'), 'on foot again');
        // and back up from the world side
        const back = npcOf(w, R.up.npc);
        atNpc(e, back);
        w.enqueue(id, { t: 'ride', npc: back.id });
        evs = run(w, C.travel.rides[R.up.ride].ticks + 60, (x) => x.type === 'flight_end' && x.id === id);
        eq(e.zone, R.id, 'the ride back lands home');
        // the kite: Willowmere to the realm's point
        const k = C.travel.routes[`willowmere>${R.point}`];
        assert(k && k.legs[k.legs.length - 1].zone === R.id, `${R.id}: a kite route from Willowmere`);
      }
    },
  },
  {
    name: 'realms2: the chain plays through: Emberpeak, accept to Elder Mael, Hold the Gate waves included',
    fn() { playChain(REALMS[0]); },
  },
  {
    name: 'realms2: the chain plays through: Valewyn, accept to Elder Mael, the tide-bound nodes, the drowned and the escort included',
    fn() { playChain(REALMS[1]); },
  },
  {
    name: 'Emberpeak lava: three crossings crust and glow on 40 s; standing on a glowing one burns, a crusted one is safe, a hero off it is safe',
    fn() {
      const C = content(), Z = C.zones.emberpeak;
      eq(Z.lava.crossings.length, 3, 'three crossings');
      const V = C.zones.valewyn;
      for (let t = 0; t < 3700; t += 7) {
        eq(JSON.stringify(lavaAt(Z, t)), JSON.stringify(CY.lavaAt(Z, t)), `the renderers' lava copy agrees at ${t}`);
        eq(JSON.stringify(tideAt(V, t)), JSON.stringify(CY.tideAt(V, t)), `the renderers' tide copy agrees at ${t}`);
      }
      let hot = 0;
      for (let t = 0; t < 800; t++) if (lavaAt(Z, t).hot) hot++;
      eq(hot, Z.lava.hot * 20, 'glows the hot part of the cycle');
      const w = world(4);
      const id = w.addPlayer({ name: 'Ann', cls: 'warden', zone: 'emberpeak', x: 300, y: 207, level: 3 });
      const e = w.get(id);
      let cell = null;
      for (let y = 0; y < Z.h && !cell; y++) for (let x = 0; x < Z.w && !cell; x++) if (Z.ground[y][x] === Z.lava.ch && spotFree(Z, x, y)) cell = [x, y];
      assert(cell, 'a crossing cell');
      // to the start of a hot window, on the crossing
      while (!lavaAt(Z, w.tick + 1).hot) run(w, 1);
      goTo(e, 'emberpeak', ...cell);
      const hp0 = e.hp;
      let evs = run(w, 40);
      assert(evs.some((x) => x.type === 'damage' && x.ability === 'realm_lava' && x.dst === id), 'burns');
      assert(e.hp < hp0, 'loses health');
      // off the crossing: safe
      e.hp = e.hpMax; goTo(e, 'emberpeak', 300, 207);
      evs = run(w, 40);
      assert(!evs.some((x) => x.type === 'damage' && x.ability === 'realm_lava'), 'off it: no burn');
      // crusted: safe
      while (lavaAt(Z, w.tick + 1).hot) run(w, 1);
      goTo(e, 'emberpeak', ...cell); e.hp = e.hpMax;
      evs = run(w, 100);
      assert(!evs.some((x) => x.type === 'damage' && x.ability === 'realm_lava'), 'crusted: no burn');
    },
  },
  {
    name: 'Emberpeak Hold the Gate: the raiders stay hidden until a hero on the quest steps before the Gate, then three waves come in order; nobody there, they go',
    fn() {
      const C = content(), Z = C.zones.emberpeak;
      const w = world(6);
      const waves = () => w.state.ents.filter((m) => m.kind === 'mob' && m.zone === 'emberpeak' && m.spawn && Z.gate.waves.includes(m.spawn.group));
      run(w, 20);
      assert(waves().length >= 10 && waves().every((m) => m.dead), 'hidden at the start');
      // a hero without the quest: nothing comes
      const id = w.addPlayer({ name: 'Ann', cls: 'warden', zone: 'emberpeak', x: 430, y: 202, level: 5 });
      const e = w.get(id);
      run(w, 60);
      assert(waves().every((m) => m.dead), 'not on the quest: the field stays empty');
      // on the quest: wave 1 comes and charges
      e.questsDone.push('ep_bellows_square', 'ep_sparks_on_the_road', 'ep_the_ashen_crew');
      const harl = npcOf(w, 'ep_harl');
      atNpc(e, harl);
      w.enqueue(id, { t: 'quest_accept', quest: 'ep_hold_the_gate', npc: harl.id });
      run(w, 2);
      assert(e.quests.ep_hold_the_gate, 'Hold the Gate accepted');
      goTo(e, 'emberpeak', 430, 202);
      let evs = run(w, 40);
      assert(evs.some((x) => x.type === 'quest_hook' && x.id === id && /Wave 1/.test(x.lines[0])), 'wave 1 called');
      const up1 = waves().filter((m) => !m.dead);
      assert(up1.length === 4 && up1.every((m) => m.spawn.group === Z.gate.waves[0]), `wave 1 up (${up1.length})`);
      assert(up1.every((m) => m.ai.mode === 'combat'), 'and coming for the hero');
      // beat each wave: the next one comes after the pause
      for (let wv = 1; wv <= 3; wv++) {
        for (const m of waves().filter((x) => !x.dead)) { m.tagger = id; w.internals.combat.kill(m, e); }
        evs = run(w, Z.gate.pause * 20 + 60);
        if (wv < 3) {
          assert(evs.some((x) => x.type === 'quest_hook' && new RegExp(`Wave ${wv + 1}`).test(x.lines[0])), `wave ${wv + 1} called`);
          assert(waves().some((m) => !m.dead && m.spawn.group === Z.gate.waves[wv]), `wave ${wv + 1} up`);
        } else assert(evs.some((x) => x.type === 'quest_hook' && /breaks/.test(x.lines[0])), 'the Crew breaks');
      }
      // the state is saved with the world
      const w2 = restoreWorld(JSON.parse(JSON.stringify(w.state)), content());
      eq(w2.state.realm.emberpeak.gate.phase, w.state.realm.emberpeak.gate.phase, 'the Gate state restores');
      eq(e.quests.ep_hold_the_gate.state, 'ready', 'ten raiders held: the quest is done');
      run(w, 60);
      assert(waves().every((m) => m.dead), 'done: they do not come again for this hero');
      // a second hero on the quest calls them, then walks away: the raiders melt back
      const id2 = w.addPlayer({ name: 'Bea', cls: 'warden', zone: 'emberpeak', x: 300, y: 207, level: 5 });
      const b = w.get(id2);
      b.questsDone.push('ep_bellows_square', 'ep_sparks_on_the_road', 'ep_the_ashen_crew');
      atNpc(b, harl);
      w.enqueue(id2, { t: 'quest_accept', quest: 'ep_hold_the_gate', npc: harl.id });
      run(w, 2);
      goTo(b, 'emberpeak', 430, 202);
      run(w, 40);
      assert(waves().some((m) => !m.dead), 'a hero on the quest calls them again');
      goTo(b, 'emberpeak', 300, 207);
      run(w, (Z.gate.giveUp + 5) * 20);
      for (const m of waves()) { m.threat = {}; if (m.ai) m.ai.mode = 'idle'; }
      run(w, 40);
      assert(waves().every((m) => m.dead), 'nobody before the Gate: gone');
    },
  },
  {
    name: 'Valewyn tide: every 3 minutes the water rises and falls; high water floods the flats (wading), raises the drowned and opens the stranded; low water opens the bells',
    fn() {
      const C = content(), Z = C.zones.valewyn;
      let hi = 0;
      for (let t = 0; t < 3600; t++) if (tideAt(Z, t).high) hi++;
      assert(Math.abs(hi - 1800) <= 2, `half the loop is high water (${hi})`);
      const w = world(8);
      const id = w.addPlayer({ name: 'Ann', cls: 'mender', zone: 'valewyn', x: 300, y: 106, level: 4 });
      const e = w.get(id);
      let flat = null;
      for (let y = 150; y < Z.h && !flat; y++) for (let x = 0; x < Z.w && !flat; x++) if (Z.ground[y][x] === Z.tide.ch && spotFree(Z, x, y)) flat = [x, y];
      const drowned = () => w.state.ents.filter((m) => m.kind === 'mob' && m.template === 'vw_drowned' && m.zone === 'valewyn');
      const nodes = (kind) => w.state.ents.filter((o) => o.kind === 'object' && o.node && o.zone === 'valewyn' && (Z.nodes.find((n) => n.id === o.template) || {}).tide === kind);
      run(w, 20);
      assert(!tideAt(Z, w.tick).high, 'low water at the start');
      assert(drowned().every((m) => m.dead), 'the drowned are down');
      assert(nodes('high').every((o) => o.dead) && nodes('low').some((o) => !o.dead), 'the stranded are fine, the bells are reachable');
      goTo(e, 'valewyn', ...flat);
      run(w, 20);
      assert(!e.auras.some((a) => a.id === WADE_AURA), 'dry flats: no wading');
      // to high water
      const evs = run(w, 2000, () => tideAt(Z, w.tick).level >= 0.65);
      run(w, 40);
      assert(evs.some((x) => x.type === 'quest_hook' && x.id === id && /coming in/.test(x.lines[0])), 'the tide turn is told');
      goTo(e, 'valewyn', ...flat);
      run(w, 20);
      assert(e.auras.some((a) => a.id === WADE_AURA), 'wading on the flooded flats');
      assert(drowned().some((m) => !m.dead), 'the drowned rise');
      assert(nodes('high').some((o) => !o.dead) && nodes('low').every((o) => o.dead), 'the stranded can be reached, the bells cannot');
      goTo(e, 'valewyn', 300, 106);
      run(w, 20);
      assert(!e.auras.some((a) => a.id === WADE_AURA), 'off the flats: dry');
      // and back to low water: the drowned sink when nobody is fighting them
      run(w, 2400, () => tideAt(Z, w.tick).level < 0.3);
      run(w, 40);
      assert(drowned().every((m) => m.dead), 'the drowned sink');
    },
  },
];

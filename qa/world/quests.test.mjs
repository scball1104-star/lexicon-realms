import { bagCount } from '../../src/sim/loot.js';
// Quests: every reference resolves, nothing needs a mob that does not spawn, the chain reaches level 15 on the curve,
// and a scripted player completes all 24 through the real quest system (src/sim/quests.js).
import { assert, eq, ZONES, content, reachable, questHarness } from './_harness.mjs';
import { canStep } from '../../tools/maps/kit.mjs';
import { questGapMult } from '../../src/sim/quests.js';

function spawnsOf(mob) {
  const out = [];
  for (const z of Object.values(ZONES)) for (const s of z.spawns || []) if (s.mob === mob && !s.night) out.push({ zone: z.id, ...s });
  return out;
}
function nodesFor(item) {
  const out = [];
  for (const z of Object.values(ZONES)) for (const n of z.nodes || []) if (n.item === item) out.push({ zone: z.id, ...n });
  return out;
}
function droppersOf(C, item, quest) {
  return Object.values(C.mobs).filter((m) => (m.loot.table || []).some((e) => e.item === item && e.quest === quest));
}
function npcSpot(npc) {
  for (const z of Object.values(ZONES)) for (const n of z.npcs || []) if (n.npc === npc) return { zone: z.id, x: n.x, y: n.y };
  return null;
}
function areaCell(zoneId, areaId) {
  const z = ZONES[zoneId], a = z.areas.find((x) => x.id === areaId), ok = reachable(zoneId);
  for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) if (ok(x, y)) return [x, y];
  return null;
}
function path(zone, from, to) {
  const W = zone.w, prev = new Int32Array(W * zone.h).fill(-1);
  const s = from[1] * W + from[0], t = to[1] * W + to[0];
  prev[s] = s;
  const q = [s];
  for (let i = 0; i < q.length && prev[t] < 0; i++) {
    const k = q[i], x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!canStep(zone, x, y, dx, dy)) continue;
      const n = (y + dy) * W + x + dx;
      if (prev[n] < 0) { prev[n] = k; q.push(n); }
    }
  }
  if (prev[t] < 0) return null;
  const out = [];
  for (let k = t; k !== s; k = prev[k]) out.push([k % W, (k / W) | 0]);
  return out.reverse();
}

export const tests = [
  {
    name: 'quests: 24 quests, every giver / turn-in / objective resolves and is reachable; no objective needs a mob that does not spawn',
    fn() {
      const C = content();
      eq(C.questOrder.length, 24, 'quest count');
      for (const id of C.questOrder) {
        const q = C.quests[id];
        assert(q, `no quest ${id}`);
        for (const n of [q.giver, q.turnIn]) { assert(C.npcs[n], `${id}: npc ${n}`); const s = npcSpot(n); assert(s && reachable(s.zone)(s.x, s.y), `${id}: ${n} not placed / unreachable`); }
        for (const r of q.requires.quests) assert(C.quests[r], `${id} requires unknown ${r}`);
        for (const it of [...q.rewards.items, ...q.rewards.choice]) assert(C.items[it], `${id} reward ${it} is not an item`);
        for (const g of q.giveOnAccept || []) assert(C.items[g.item], `${id} gives unknown ${g.item}`);
        for (const o of q.objectives) {
          if (o.kind === 'kill') {
            const sp = spawnsOf(o.mob);
            assert(sp.length >= Math.min(o.count, 1), `${id}: ${o.mob} never spawns`);
            assert(sp.some((s) => Math.abs(s.level - q.level) <= 3), `${id}: no ${o.mob} spawns near level ${q.level}`);
          } else if (o.kind === 'collect') {
            assert(C.items[o.item] && C.items[o.item].kind === 'quest', `${id}: ${o.item} is not a quest item`);
            const nodes = nodesFor(o.item), mobs = droppersOf(C, o.item, id);
            assert(nodes.length >= o.count || mobs.length, `${id}: nothing gives ${o.item}`);
            for (const m of mobs) assert(spawnsOf(m.id).length, `${id}: ${o.item} drops from ${m.id}, which never spawns`);
          } else if (o.kind === 'deliver') {
            assert(C.npcs[o.to] && npcSpot(o.to), `${id}: deliver to ${o.to}`);
            assert((q.giveOnAccept || []).some((g) => g.item === o.item), `${id}: ${o.item} is not given on accept`);
          } else if (o.kind === 'explore') {
            assert(ZONES[o.zone] && areaCell(o.zone, o.area), `${id}: area ${o.zone}/${o.area} missing or unreachable`);
          } else if (o.kind === 'escort') {
            const ok = reachable(o.from.zone);
            assert(ok(o.from.x, o.from.y) && reachable(o.to.zone)(o.to.x, o.to.y), `${id}: escort ends unreachable`);
            assert(C.npcs[o.npc], `${id}: escort npc ${o.npc}`);
            for (const a of o.ambush || []) for (const m of a.mobs) assert(C.mobs[m.mob], `${id}: ambush mob ${m.mob}`);
          } else if (o.kind === 'talk') {
            assert(npcSpot(o.npc), `${id}: talk to ${o.npc}, who is not placed`);
          } else throw new Error(`${id}: unknown objective kind ${o.kind}`);
        }
      }
    },
  },
  {
    name: 'quests: the chain in order, kills at 3/7 of quest XP (PROGRESSION 9.4), reaches level 15 within 1 level and every pickup is in level',
    fn() {
      const C = content();
      const P = C.progression;
      let level = 1, xp = 0;
      const gain = (n) => { xp += n; while (level < 15 && xp >= P.xpToNext[level]) { xp -= P.xpToNext[level]; level++; } };
      for (const id of C.questOrder) {
        const q = C.quests[id];
        assert(level >= q.minLevel, `${id} picked up at level ${level}, needs ${q.minLevel}`);
        assert(level <= q.level + 2, `${id} (level ${q.level}) picked up at ${level}: the chain runs ahead of its quests`);
        gain(Math.round(q.rewards.xp * questGapMult(level, q.level)));
        gain(Math.round(q.rewards.xp * 3 / 7));
      }
      assert(level >= 14, `the chain ends at level ${level}`);
    },
  },
  {
    name: 'quests: a scripted player completes all 24 through the quest system (accept, kill, loot, nodes, explore, escort, deliver, turn in)',
    fn() {
      const H = questHarness(11);
      const { QS, p, C } = H;
      const P = C.progression;
      p.bags = ['starter_satchel', 'loom_bag', 'drovers_pack'];   // the bags a player buys on the way (PROGRESSION 6.5)
      for (const id of C.questOrder) {
        const q = C.quests[id];
        const g = npcSpot(q.giver);
        H.place(g.zone, g.x, g.y);
        QS.interact(p, H.npcEnt(q.giver));
        eq(QS.status(p, id), 'available', `${id} available at its giver (level ${p.level})`);
        assert(['!', '!grey'].includes(QS.marker(p, q.giver)) || QS.marker(p, q.giver) === '?', `${id}: ${q.giver} shows no marker`);
        assert(QS.accept(p, id), `${id} accept`);
        q.objectives.forEach((o, i) => {
          const s = () => p.quests[id] && p.quests[id].counts[i];
          if (o.kind === 'talk' || o.kind === 'deliver') {
            const n = npcSpot(o.kind === 'talk' ? o.npc : o.to);
            H.place(n.zone, n.x, n.y);
            QS.interact(p, H.npcEnt(o.kind === 'talk' ? o.npc : o.to));
          } else if (o.kind === 'kill') {
            const sp = spawnsOf(o.mob)[0];
            H.place(sp.zone, sp.x, sp.y);
            for (let k = 0; k < o.count; k++) H.kill(o.mob, sp.level);
          } else if (o.kind === 'explore') {
            const [x, y] = areaCell(o.zone, o.area);
            H.place(o.zone, x, y);
          } else if (o.kind === 'collect') {
            const nodes = nodesFor(o.item);
            if (nodes.length) {
              for (const n of nodes) {
                if (s() >= o.count) break;
                const ent = H.Q.ents().find((e) => e.kind === 'object' && e.template === n.id);
                H.place(n.zone, n.x, n.y);
                QS.interact(p, ent);
                if (ent.node.channel) H.step(Math.round(ent.node.channel * 20) + 1);
              }
            } else {
              const m = droppersOf(C, o.item, id)[0];
              const sp = spawnsOf(m.id).find((x) => !m.loot.table.find((e) => e.item === o.item).minLevel || x.level >= m.loot.table.find((e) => e.item === o.item).minLevel);
              H.place(sp.zone, sp.x, sp.y);
              for (let k = 0; k < 300 && s() < o.count; k++) H.kill(m.id, sp.level);
            }
          } else if (o.kind === 'escort') {
            const esc = H.Q.ents().find((e) => e.escort && e.escort.quest === id);
            assert(esc, `${id}: no escort spawned`);
            const z = ZONES[o.from.zone];
            const route = path(z, [o.from.x, o.from.y + 1 < z.h && reachable(z.id)(o.from.x, o.from.y + 1) ? o.from.y + 1 : o.from.y], [o.to.x, o.to.y]);
            assert(route, `${id}: no path for the escort`);
            H.place(o.from.zone, o.from.x, o.from.y);
            H.step(2);
            for (const [x, y] of route) { H.place(z.id, x, y); H.step(6); if (s() >= 1) break; }
            for (let k = 0; k < 200 && s() < 1; k++) H.step(1);
          }
          assert(s() >= (o.count || 1) || p.quests[id].state === 'ready', `${id}: objective ${i} (${o.kind}) stuck at ${s()}`);
        });
        eq(p.quests[id].state, 'ready', `${id} ready`);
        const t = npcSpot(q.turnIn);
        H.place(t.zone, t.x, t.y);
        eq(QS.marker(p, q.turnIn), '?', `${id}: ${q.turnIn} shows ?`);
        QS.interact(p, H.npcEnt(q.turnIn));
        assert(QS.turnIn(p, id, 0), `${id} turn in`);
        eq(QS.status(p, id), 'done');
        H.Q.grantXp(p, Math.round(q.rewards.xp * 3 / 7));      // the kills along the way
        p.bag = p.bag.filter((b) => C.items[b.item].kind !== 'junk' && !C.items[b.item].base);   // sold at the next vendor
      }
      eq(p.questsDone.length, 24, 'all quests done');
      assert(p.level >= 14, `ends at level ${p.level}`);
      assert(H.events.some((e) => e.type === 'quest_hook'), 'the finale hook fired');
      const choices = p.bag.filter((b) => C.items[b.item].reward);
      assert(choices.length >= 18, `reward items in the bag: ${choices.length}`);
      for (const b of choices) assert(!C.items[b.item].armorType || C.items[b.item].armorType !== 'class' || b.inst.armorType === 'plate', `${b.item} rolled to the Warden's plate`);
      void P;
    },
  },
  {
    name: 'quests: log cap 20, prerequisites, abandon returns given items, quest drops only while the quest needs them',
    fn() {
      const H = questHarness(3);
      const { QS, p, C } = H;
      eq(QS.status(p, 'wm_yard_slimes'), 'locked', 'q02 locked before q01');
      assert(!QS.accept(p, 'wm_yard_slimes'), 'cannot accept a locked quest');
      // fake a long log: every quest done but the last few, then fill
      p.questsDone = ['wm_name_twice'];
      assert(QS.accept(p, 'wm_pells_crate'));
      eq(bagCount(p, 'pells_crate'), 1, 'crate given (in the quest bag)');
      assert(QS.abandon(p, 'wm_pells_crate'));
      eq(bagCount(p, 'pells_crate'), 0, 'crate taken back');
      // quests_copy drops only while q07 is active
      for (let k = 0; k < 40; k++) H.kill('ink_slime', 4);
      eq(bagCount(p, 'quills_copy'), 0, 'no pages without the quest');
      for (let i = 0; i < 25; i++) p.quests[`fake_${i}`] = undefined;
      const fakeLog = {};
      for (const id of C.questOrder.slice(0, 20)) fakeLog[id] = { state: 'active', counts: C.quests[id].objectives.map(() => 0) };
      p.quests = fakeLog;
      p.questsDone = C.questOrder.slice(0, 22);
      p.level = 14;
      eq(QS.canAccept(p, 'mo_long_watch'), 'log_full', '20 quests is the cap');
    },
  },
];

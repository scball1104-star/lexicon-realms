// The Moor band (quests20 lane, 2026-11-23; src/data/moor_band.js): 25 more quests for levels 13 to 20. Every giver,
// turn-in, foe, item, node, area and escort exists and is reachable on foot; levels and XP sit on the PROGRESSION 2.2
// curve; gold stays modest; every objective kind is used; the four story chains hand out a card; no em dashes; and a
// scripted hero completes all 25 through the real quest system (accept, kill, loot, nodes, explore, escort, deliver).
import { assert, eq, ZONES, content, reachable, questHarness } from '../world/_harness.mjs';
import { canStep } from '../../tools/maps/kit.mjs';
import { QUEST_ORDER } from '../../src/data/quests.js';
import { MB_QUESTS, MB_QUEST_ORDER, MB_NPCS, MB_ITEMS, MB_NODES, MB_AREAS, MB_NPC_SPOTS, MB_CHAINS, mbQuestXp } from '../../src/data/moor_band.js';

const DASH = new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']');
function npcSpot(npc) {
  for (const z of Object.values(ZONES)) for (const n of z.npcs || []) if (n.npc === npc) return { zone: z.id, x: n.x, y: n.y };
  return null;
}
function spawnsOf(mob, region) {
  const out = [];
  for (const z of Object.values(ZONES)) for (const s of z.spawns || []) if (s.mob === mob && !s.night && (!region || s.region === region)) out.push({ zone: z.id, ...s });
  return out;
}
const nodesFor = (item) => { const out = []; for (const z of Object.values(ZONES)) for (const n of z.nodes || []) if (n.item === item) out.push({ zone: z.id, ...n }); return out; };
const droppersOf = (C, item, quest) => Object.values(C.mobs).filter((m) => (m.loot.table || []).some((e) => e.item === item && e.quest === quest));
function areaCell(zoneId, areaId) {
  const z = ZONES[zoneId], a = (z.areas || []).find((x) => x.id === areaId), ok = reachable(zoneId);
  if (!a) return null;
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
    name: 'moor band: 25 quests offered as side quests; every giver, turn-in, foe, item, node, area and escort exists and is reachable',
    fn() {
      const C = content();
      eq(MB_QUEST_ORDER.length, 25, 'quest count');
      eq(C.questOrder.length, 24, 'the main chain is untouched');
      const seenNum = new Set();
      for (const id of MB_QUEST_ORDER) {
        const q = C.quests[id];
        assert(q && C.sideQuests.includes(id), `${id}: loaded and offered`);
        assert(!seenNum.has(q.num), `${id}: num ${q.num} unique`); seenNum.add(q.num);
        for (const n of [q.giver, q.turnIn]) { assert(C.npcs[n], `${id}: npc ${n}`); const s = npcSpot(n); assert(s && reachable(s.zone)(s.x, s.y), `${id}: ${n} not placed or unreachable`); }
        for (const r of q.requires.quests) assert(C.quests[r], `${id} requires unknown ${r}`);
        for (const it of [...q.rewards.items, ...q.rewards.choice]) {
          assert(C.items[it] && C.items[it].reward, `${id}: reward ${it} is an existing reward item`);
          assert(C.items[it].reqLevel <= q.minLevel + 2, `${id}: ${it} wearable at once`);
        }
        for (const g of q.giveOnAccept) assert(C.items[g.item] && C.items[g.item].kind === 'quest', `${id} gives ${g.item}`);
        for (const o of q.objectives) {
          if (o.kind === 'kill') {
            const sp = spawnsOf(o.mob, o.region);
            assert(sp.length >= 1, `${id}: ${o.mob} spawns in ${o.region}`);
            assert(sp.some((s) => Math.abs(s.level - q.level) <= 3), `${id}: ${o.mob} near level ${q.level}`);
            assert(!C.mobs[o.mob].elite && !C.mobs[o.mob].boss, `${id}: an open-world foe`);
          } else if (o.kind === 'collect') {
            assert(C.items[o.item] && C.items[o.item].kind === 'quest', `${id}: ${o.item} is a quest item`);
            const nodes = nodesFor(o.item), mobs = droppersOf(C, o.item, id);
            assert(nodes.length >= Math.min(o.count, 4) || mobs.length, `${id}: nothing gives ${o.item}`);
            for (const n of nodes) assert(reachable(n.zone)(n.x, n.y), `${id}: node ${n.id} unreachable`);
            for (const m of mobs) assert(spawnsOf(m.id, 'moor').length, `${id}: ${o.item} drops from ${m.id}, which never spawns on the moor`);
          } else if (o.kind === 'deliver') {
            assert(npcSpot(o.to), `${id}: deliver to ${o.to}`);
            assert(q.giveOnAccept.some((g) => g.item === o.item), `${id}: ${o.item} given on accept`);
          } else if (o.kind === 'explore') {
            assert(areaCell(o.zone, o.area), `${id}: area ${o.area} missing or unreachable`);
          } else if (o.kind === 'escort') {
            assert(C.npcs[o.npc] && C.npcs[o.npc].roles.includes('escort'), `${id}: escort ${o.npc}`);
            const ok = reachable(o.from.zone);
            assert(ok(o.from.x, o.from.y) && reachable(o.to.zone)(o.to.x, o.to.y), `${id}: escort ends unreachable`);
            assert(path(ZONES[o.from.zone], [o.from.x, o.from.y], [o.to.x, o.to.y]), `${id}: no path for the escort`);
            for (const a of o.ambush || []) for (const m of a.mobs) assert(C.mobs[m.mob] && spawnsOf(m.mob, 'moor').length, `${id}: ambush foe ${m.mob} is an existing moor foe`);
          } else if (o.kind === 'talk') {
            assert(npcSpot(o.npc), `${id}: talk to ${o.npc}`);
          } else throw new Error(`${id}: unknown objective kind ${o.kind}`);
          for (const w of o.where || []) assert(w.zone === 'world' && w.r > 0, `${id}: where circle on the world`);
        }
      }
      // every placed person stands on a free tile and well away from the rares' spots and the bounty foes
      for (const s of MB_NPC_SPOTS) {
        const p = npcSpot(s.npc);
        assert(p && reachable(p.zone)(p.x, p.y), `${s.npc} placed and reachable`);
        for (const r of Object.values(C.rares)) for (const [rx, ry] of r.spots || []) if ((r.zone || 'world') === p.zone) assert(Math.hypot(rx - p.x, ry - p.y) >= 7, `${s.npc} within 7 tiles of the rare ${r.id || ''} spot`);
      }
      for (const n of MB_NODES) assert(ZONES.world.nodes.some((x) => x.id === n.id), `node ${n.id} on the world`);
      for (const a of MB_AREAS) assert(ZONES.world.areas.some((x) => x.id === a.id && x.banner === false), `area ${a.id} on the world, no banner`);
      eq(ZONES.world.npcs.filter((n) => n.npc === 'mb_linnet').length, 1, 'placed once');
      // the looks are existing ones: no new art
      const looks = new Set(Object.values(C.npcs).filter((n) => !n.id.startsWith('mb_')).map((n) => n.sprite));
      for (const n of Object.values(MB_NPCS)) assert(looks.has(n.sprite), `${n.id}: existing look ${n.sprite}`);
    },
  },
  {
    name: 'moor band: levels 13 to 20 on the PROGRESSION 2.2 curve, minLevel = level - 2, modest gold, every objective kind, chains in level order',
    fn() {
      const C = content();
      const kinds = new Set(), perLevel = {};
      for (const id of MB_QUEST_ORDER) {
        const q = C.quests[id];
        assert(q.level >= 13 && q.level <= 20, `${id}: level ${q.level}`);
        eq(q.minLevel, q.level - 2, `${id}: minLevel`);
        assert(q.requires.level >= q.minLevel, `${id}: requires.level`);
        assert(q.size >= 0.15 && q.size <= 1.2, `${id}: size ${q.size} (the band's small 2.2 sizes, moor_band.js)`);
        eq(q.rewards.xp, mbQuestXp(q.level, q.size), `${id}: xp on the curve`);
        eq(q.rewards.xp, Math.round(0.94 * (160 + 90 * q.level + 7 * q.level ** 2) * q.size / 10) * 10, `${id}: the 2.2 formula`);
        assert(q.rewards.gold <= 3 * q.level + 5, `${id}: gold ${q.rewards.gold} modest`);
        for (const r of q.requires.quests) if (MB_QUESTS[r]) assert(MB_QUESTS[r].level <= q.level, `${id}: needs a later quest ${r}`);
        for (const o of q.objectives) kinds.add(o.kind);
        perLevel[q.level] = (perLevel[q.level] || 0) + 1;
      }
      for (const k of ['kill', 'collect', 'escort', 'deliver', 'explore', 'talk']) assert(kinds.has(k), `a ${k} objective`);
      for (let L = 13; L <= 20; L++) assert(perLevel[L] >= 1, `a quest at level ${L}`);
      assert(MB_QUEST_ORDER.filter((id) => MB_QUESTS[id].objectives.some((o) => o.kind === 'escort')).length >= 2, 'two escorts');
      assert(MB_QUEST_ORDER.filter((id) => new Set(MB_QUESTS[id].objectives.map((o) => o.kind)).size >= 2).length >= 5, 'mixed quests');
      const chains = Object.values(MB_CHAINS);
      assert(chains.length >= 2, 'story chains');
      for (const ch of chains) {
        assert(ch.steps.length >= 3, `${ch.name}: multi-step`);
        ch.steps.forEach((id, i) => {
          const q = C.quests[id];
          eq(q.story.step, i + 1, `${id}: part ${i + 1}`); eq(q.story.of, ch.steps.length);
          if (i) assert(q.requires.quests.some((r) => ch.steps.slice(0, i).includes(r)), `${id}: needs an earlier step of its chain`);
        });
        assert(C.quests[ch.steps[ch.steps.length - 1]].story.end.lines.length >= 3, `${ch.name}: a payoff card`);
      }
      const total = MB_QUEST_ORDER.reduce((s, id) => s + C.quests[id].rewards.xp, 0);
      assert(total > 12000 && total < 25000, `band XP ${total}: enough to quest 13 to 20, not so much that it halves the band's time`);
    },
  },
  {
    name: 'moor band: no em or en dashes in any quest, card, hook, person or item text',
    fn() {
      const C = content();
      for (const id of MB_QUEST_ORDER) {
        const q = C.quests[id];
        for (const t of [q.name, ...Object.values(q.text), ...q.objectives.map((o) => o.label), ...((q.hook && q.hook.lines) || []), ...((q.story && q.story.end && q.story.end.lines) || [])]) assert(!DASH.test(t), `${id}: dash in "${t}"`);
      }
      for (const n of Object.values(MB_NPCS)) for (const t of [n.name, n.title || '', ...n.talk]) assert(!DASH.test(t), `${n.id}: dash`);
      for (const it of Object.values(MB_ITEMS)) assert(!DASH.test(it.name + it.text), `${it.id}: dash`);
      for (const a of MB_AREAS) assert(!DASH.test(a.name), `${a.id}: dash`);
    },
  },
  {
    name: 'moor band: a scripted hero completes all 25 through the quest system (accept, kill, loot, nodes, explore, escort, deliver, turn in), with the chain cards and hooks',
    fn() {
      const H = questHarness(23);
      const { QS, p, C } = H;
      p.bags = ['starter_satchel', 'loom_bag', 'drovers_pack'];
      p.questsDone = [...QUEST_ORDER];
      p.level = 13;
      const done = new Set();
      const order = [];
      while (order.length < MB_QUEST_ORDER.length) {
        const next = MB_QUEST_ORDER.find((id) => !done.has(id) && MB_QUESTS[id].requires.quests.every((r) => !MB_QUESTS[r] || done.has(r)));
        assert(next, 'a quest is always open');
        order.push(next); done.add(next);
      }
      for (const id of order) {
        const q = C.quests[id];
        p.level = Math.max(p.level, q.requires.level, q.level);
        const g = npcSpot(q.giver);
        H.place(g.zone, g.x, g.y);
        QS.interact(p, H.npcEnt(q.giver));
        eq(QS.status(p, id), 'available', `${id} available at its giver`);
        assert(QS.accept(p, id), `${id} accept`);
        q.objectives.forEach((o, i) => {
          const s = () => p.quests[id] && p.quests[id].counts[i];
          if (o.kind === 'talk' || o.kind === 'deliver') {
            const who = o.kind === 'talk' ? o.npc : o.to;
            const n = npcSpot(who);
            H.place(n.zone, n.x, n.y);
            QS.interact(p, H.npcEnt(who));
          } else if (o.kind === 'kill') {
            const sp = spawnsOf(o.mob, o.region)[0];
            H.place(sp.zone, sp.x, sp.y);
            for (let k = 0; k < o.count; k++) H.kill(o.mob, sp.level);
          } else if (o.kind === 'explore') {
            const [x, y] = areaCell(o.zone, o.area);
            H.place(o.zone, x, y);
          } else if (o.kind === 'collect') {
            const nodes = nodesFor(o.item);
            if (nodes.length) {
              for (let pass = 0; pass < 3 && s() < o.count; pass++) {
                for (const n of nodes) {
                  if (s() >= o.count) break;
                  const ent = H.Q.ents().find((e) => e.kind === 'object' && e.template === n.id);
                  H.place(n.zone, n.x, n.y);
                  QS.interact(p, ent);
                }
                H.step(31 * 20);      // the nodes grow back
              }
            } else {
              const m = droppersOf(C, o.item, id)[0];
              const sp = spawnsOf(m.id, 'moor')[0];
              H.place(sp.zone, sp.x, sp.y);
              for (let k = 0; k < 300 && s() < o.count; k++) H.kill(m.id, sp.level);
            }
          } else if (o.kind === 'escort') {
            const esc = H.Q.ents().find((e) => e.escort && e.escort.quest === id);
            assert(esc, `${id}: no escort spawned`);
            const z = ZONES[o.from.zone];
            const route = path(z, [o.from.x, o.from.y], [o.to.x, o.to.y]);
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
        p.bag = p.bag.filter((b) => C.items[b.item].kind !== 'junk' && !C.items[b.item].base);
      }
      for (const id of MB_QUEST_ORDER) assert(p.questsDone.includes(id), `${id} done`);
      eq(H.events.filter((e) => e.type === 'quest_hook').length, 2, 'the two finale hooks fired');
      // quest items left nothing behind in the bag
      assert(!p.bag.some((b) => C.items[b.item].kind === 'quest'), 'no quest items left over');
    },
  },
];

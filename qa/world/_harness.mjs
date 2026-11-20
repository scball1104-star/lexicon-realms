// Shared helpers for the world tests (zones, quests, loot). Not a test file.
//
// questHarness(): the quest system wired to a minimal world (the Q context CONTRACTS 7.7 describes), so the tests
// drive accept / kill / loot / nodes / explore / escort / turn-in exactly the way world.js will, without combat.
import { buildContent, ZONES } from '../../src/data/maps/index.js';
import { createQuests } from '../../src/sim/quests.js';
import { createRng } from '../../src/sim/rng.js';
import { rollKill, bagAdd } from '../../src/sim/loot.js';
import { SUB, TILE } from '../../src/sim/constants.js';
import { reach } from '../../tools/maps/kit.mjs';

export function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
export function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }

let _content = null;
export const content = () => _content || (_content = buildContent());
export { ZONES };

const reachCache = new Map();
/** Reachable-on-foot mask of a zone from its arrival cell. */
export function reachable(zoneId) {
  if (!reachCache.has(zoneId)) { const z = ZONES[zoneId]; reachCache.set(zoneId, reach(z, z.arrival[0], z.arrival[1])); }
  const seen = reachCache.get(zoneId);
  const z = ZONES[zoneId];
  return (x, y) => x >= 0 && y >= 0 && x < z.w && y < z.h && seen[y * z.w + x] === 1;
}

const tileToSub = (tx, ty) => [tx * TILE + TILE / 2, (ty + 1) * TILE - SUB];

export function questHarness(seed = 7) {
  const C = content();
  const state = { tick: 0 };
  const ents = [];
  const byId = new Map();
  const events = [];
  let next = 1;
  const P = C.progression;
  const Q = {
    state, content: C, rng: createRng(seed),
    emit: (ev) => events.push({ tick: state.tick, ...ev }),
    get: (id) => byId.get(id) || null,
    ents: () => ents,
    nextId: () => next++,
    addEntity: (e) => { ents.push(e); byId.set(e.id, e); return e; },
    grantXp(p, amount) {
      p.xp += amount;
      while (p.level < P.maxLevel && p.xp >= P.xpToNext[p.level]) { p.xp -= P.xpToNext[p.level]; p.level++; }
      return amount;
    },
  };
  const QS = createQuests(Q);
  QS.spawnObjects();
  const [x, y] = tileToSub(C.start.x, C.start.y);
  const p = Q.addEntity({ id: next++, kind: 'player', zone: C.start.zone, x, y, level: 1, xp: 0, cls: 'warden', hp: 200, hpMax: 200, gold: 0, bag: [], dead: false });
  return { Q, QS, p, events, C,
    place(zone, tx, ty) { p.zone = zone; [p.x, p.y] = tileToSub(tx, ty); QS.onMove(p); },
    step(n = 1) { for (let i = 0; i < n; i++) { state.tick++; QS.tick(); } },
    npcEnt(npc) {
      let e = ents.find((x) => x.kind === 'npc' && x.template === npc && !x.escort);
      if (!e) {
        for (const z of Object.values(ZONES)) for (const n of z.npcs || []) if (n.npc === npc) {
          const [sx, sy] = tileToSub(n.x, n.y);
          e = Q.addEntity({ id: next++, kind: 'npc', zone: z.id, x: sx, y: sy, template: npc, hp: 100, hpMax: 100 });
        }
      }
      return e;
    },
    /** Kill a mob of `template` at `level` for p: the quest hook plus a loot roll into the bag. */
    kill(template, level) {
      const m = { id: next++, kind: 'mob', template, level, zone: p.zone };
      QS.onKill(p, m);
      const drop = rollKill({ content: C, rng: Q.rng, questNeeds: QS.needsItem }, m, p);
      for (const it of drop.items) bagAdd(p, it.item, it.qty, it.inst || null, C);
      p.gold += drop.gold;
      QS.onBag(p);
      return drop;
    },
  };
}

// Bounty boards (docs/design/BUILDS_2.md 5.6, PROGRESSION.md 2.4; phase 5 "cap 20"): the data resolves, the daily
// rotation is deterministic from the day index alone, and a bounty runs through the real quest system and the world:
// posted, accepted, handed in, kept for the day (not finished for good), open again on another day, and saved.
import { assert, eq, ZONES, REGIONS, content, reachable } from './_harness.mjs';
import { toWorld } from '../../src/data/maps/layout.js';
import { createWorld } from '../../src/sim/index.js';
import { BOARDS, NAMED_SPAWNS, bountyXp, bountyGold } from '../../src/data/bounties.js';

const KINDS = ['named', 'camp', 'gather'];
const npcSpot = (npc) => { for (const z of Object.values(ZONES)) for (const n of z.npcs || []) if (n.npc === npc) return { zone: z.id, x: n.x, y: n.y }; return null; };
const inCircle = (s, w) => Math.hypot(s.x * 16 + 8 - w.x, s.y * 16 + 8 - w.y) <= w.r;
const seg = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };

function boardWorld(day, { level = 6, questsDone = ['wm_name_twice'], board = 'willowmere' } = {}) {
  const C = content();
  const w = createWorld({ seed: 31, content: C, day });
  const b = BOARDS.find((x) => x.id === board);
  const s = npcSpot(b.npc);
  const pid = w.addPlayer({ name: 'Hunter', cls: 'warden', zone: s.zone, x: s.x, y: s.y + 1, level, questsDone });
  return { w, C, p: w.get(pid), pid, b, QS: w.quests, npc: w.state.ents.find((e) => e.kind === 'npc' && e.template === b.npc) };
}

export const tests = [
  {
    name: 'bounties: 3 boards of 3 pools (named, camp, gather) of 2; every bounty resolves, pays about a quest, and sends you to nothing more than 1 level over it',
    fn() {
      const C = content();
      eq(BOARDS.length, 3, 'three hubs');
      const spawns = C.spawns.filter((s) => s.mob);
      for (const b of BOARDS) {
        const g = npcSpot(b.npc);
        assert(g && reachable(g.zone)(g.x, g.y), `${b.id}: ${b.npc} placed and reachable`);
        assert(C.quests[b.requires] && C.questOrder.includes(b.requires), `${b.id}: opens after a chain quest`);
        eq(b.pools.length, 3, `${b.id}: three kinds`);
        b.pools.forEach((pool, k) => {
          eq(pool.length, 2, `${b.id} ${KINDS[k]}: two to rotate`);
          for (const id of pool) {
            const q = C.quests[id];
            assert(q && q.bounty && q.bounty.board === b.id && q.bounty.kind === KINDS[k], `${id}: bounty of ${b.id} ${KINDS[k]}`);
            assert(!C.questOrder.includes(id), `${id} is not a chain quest`);
            eq(q.giver, b.npc, `${id} giver`); eq(q.turnIn, b.npc, `${id} turn-in`);
            eq(q.rewards.xp, bountyXp(q.level), `${id} XP is a size 1.0 quest at its level`);
            eq(q.rewards.gold, bountyGold(q.level), `${id} gold`);
            eq(q.minLevel, q.level - 2, `${id} min level`);
            assert(q.name.startsWith('Bounty: '), `${id} reads as a bounty in the dialog`);
            for (const t of Object.values(q.text)) assert(!/[–—]/.test(t), `${id}: no em or en dashes`);
            for (const o of q.objectives) {
              assert(o.where && o.where.length, `${id}: where circles`);
              const mobs = o.kind === 'kill' ? [o.mob] : Object.values(C.mobs).filter((m) => (m.loot.table || []).some((e) => e.item === o.item && e.quest === id)).map((m) => m.id);
              if (o.kind === 'collect') assert(C.items[o.item] && C.items[o.item].kind === 'quest', `${id}: ${o.item} is a quest item`);
              else eq(o.kind, 'kill', `${id}: kill or collect`);
              assert(mobs.length, `${id}: something gives ${o.item || o.mob}`);
              let hits = 0;
              for (const s of spawns) {
                if (!mobs.includes(s.mob) || (o.zone && s.zone !== o.zone) || s.night) continue;
                for (const w of o.where) if (w.zone === s.zone && inCircle(s, w)) {
                  const e = o.kind === 'collect' ? C.mobs[s.mob].loot.table.find((t) => t.item === o.item) : null;
                  if (e && ((e.maxLevel && s.level > e.maxLevel) || (e.minLevel && s.level < e.minLevel))) continue;
                  hits++;
                  assert(s.level <= q.level + 1, `${id}: ${s.mob} L${s.level} at ${s.zone} ${s.x},${s.y} (bounty L${q.level})`);
                }
              }
              assert(hits >= (KINDS[k] === 'named' ? 1 : 3), `${id}: ${hits} target spawns inside its circles`);
            }
          }
        });
      }
    },
  },
  {
    name: 'bounties: named foes stand on walkable, reachable cells, 6+ tiles from every camp and npc, the valley two 9+ tiles off Lark\'s walk home',
    fn() {
      const C = content();
      eq(NAMED_SPAWNS.length, 6, 'two named foes per board');
      const route = [[88, 26], [74, 30], [60, 38], [44, 42]];
      for (const s of NAMED_SPAWNS) {
        const z = REGIONS[s.zone];                    // named foes are authored in their area's own tiles
        assert(C.mobs[s.mob] && (C.mobs[s.mob].traits || []).includes('tough'), `${s.mob}: a tough named foe`);
        eq(z.collision[s.y][s.x], '.', `${s.mob} walkable`);
        assert(reachable(s.zone)(s.x, s.y), `${s.mob} reachable`);
        // camps and npcs of every area count (one world: a neighbour's camp can stand just across a seam)
        const [sx, sy] = toWorld(s.zone, s.x, s.y);
        for (const o of [...ZONES.world.spawns, ...ZONES.world.npcs]) assert(Math.hypot(o.x - sx, o.y - sy) >= 6, `${s.mob} within 6 tiles of ${o.mob || o.npc} at world ${o.x},${o.y}`);
        if (s.zone === 'valley') {
          let r = Infinity; for (let i = 0; i < route.length - 1; i++) r = Math.min(r, seg(s.x, s.y, route[i], route[i + 1]));
          assert(r >= 9, `${s.mob} ${r.toFixed(1)} tiles from Lark's way home`);
        }
        assert(C.spawns.some((x) => x.mob === s.mob && x.zone === 'world' && x.region === s.zone && x.x === sx && x.y === sy), `${s.mob} is in content.spawns (world tiles)`);
      }
    },
  },
  {
    name: 'bounties: each board posts one of each kind a day, from the day index alone (repeats every 2 days, negative days fine), and only today\'s show',
    fn() {
      const { QS } = boardWorld(0);
      for (const day of [-3, 0, 1, 7, 20512]) {
        const t = QS.bountiesToday(day);
        eq(t.length, 3 * content().bounties.boards.length, `day ${day}: three a board posted (the three here and the Millrace's mill board)`);
        eq(JSON.stringify(t), JSON.stringify(QS.bountiesToday(day + 2)), `day ${day} = day ${day + 2}`);
        const next = QS.bountiesToday(day + 1);
        assert(t.every((id) => !next.includes(id)), `day ${day + 1} posts the other half`);
        for (const b of BOARDS) eq(KINDS.map((k) => t.filter((id) => content().quests[id].bounty.board === b.id && content().quests[id].bounty.kind === k).length).join(), '1,1,1', `${b.id} day ${day}`);
      }
      for (const day of [4, 5]) {
        const { QS: Q2, p, npc } = boardWorld(day);
        const posted = Q2.bountiesToday().filter((id) => content().quests[id].bounty.board === 'willowmere');
        const offers = Q2.offersAt(p, 'pip').offers;
        eq(JSON.stringify(offers.filter((id) => id.startsWith('bounty_'))), JSON.stringify(posted), `day ${day}: Pip offers today's three`);
        eq(Q2.marker(p, 'pip'), '!', 'Pip shows a !');
        for (const id of BOARDS[0].pools.flat()) if (!posted.includes(id)) eq(Q2.status(p, id), 'locked', `${id} not posted on day ${day}`);
        void npc;
      }
      const { QS: Q3, p: low } = boardWorld(4, { level: 1 });
      eq(Q3.marker(low, 'pip'), '!soon', 'a level 1 hero sees the bounties coming');
      const { QS: Q4, p: fresh } = boardWorld(4, { questsDone: [] });
      assert(Q4.bountiesToday().every((id) => Q4.status(fresh, id) === 'locked' || content().quests[id].bounty.board !== 'willowmere'), 'the board opens after A Name Written Twice');
    },
  },
  {
    name: 'bounties: accept, kill, hand in through the world; kept for the day (not in questsDone), open again on another day; saved and restored',
    fn() {
      const { w, pid, p, QS, npc, C } = boardWorld(4);
      const id = QS.bountiesToday().find((x) => C.quests[x].bounty.board === 'willowmere' && C.quests[x].bounty.kind === 'named');
      const q = C.quests[id];
      w.enqueue(pid, { t: 'interact', id: npc.id });
      const dlg = w.step().find((e) => e.type === 'quest_dialog');
      assert(dlg && dlg.offers.includes(id), 'the dialog offers the bounty');
      w.enqueue(pid, { t: 'quest_accept', quest: id, npc: npc.id });
      w.step();
      eq(QS.status(p, id), 'active', 'accepted');
      QS.onKill(p, { template: q.objectives[0].mob, zone: 'valley', id: -1 });
      eq(QS.status(p, id), 'ready', 'the named foe counts');
      const xp0 = p.xp, gold0 = p.gold, lvl0 = p.level;
      w.enqueue(pid, { t: 'quest_turnin', quest: id, choice: 0, npc: npc.id });
      w.step();
      eq(QS.status(p, id), 'done', 'done for today');
      assert(!p.questsDone.includes(id), 'never in questsDone');
      eq(p.bounties.day, 4); assert(p.bounties.done.includes(id));
      assert(p.level > lvl0 || p.xp > xp0, 'XP paid'); eq(p.gold - gold0, q.rewards.gold, 'gold paid');
      // the save keeps it (CONTRACTS 2.4 sim-owned fields), and a restored hero on the same day still has it done
      const save = w.saveFields(pid);
      eq(JSON.stringify(save.bounties), JSON.stringify(p.bounties), 'saved');
      const w2 = createWorld({ seed: 32, content: C, day: 4 });
      const s = npcSpot('pip');
      const p2 = w2.get(w2.addPlayer({ name: 'Back', cls: 'warden', zone: s.zone, x: s.x, y: s.y + 1, level: 6, questsDone: ['wm_name_twice'], bounties: save.bounties }));
      eq(w2.quests.status(p2, id), 'done', 'restored: still done today');
      // two days on the same bounty is posted again and can be taken again; tomorrow it is not on the board
      w.setDay(5);
      eq(w.day, 5);
      eq(QS.status(p, id), 'locked', 'tomorrow the other named foe is up');
      w.setDay(6);
      eq(QS.status(p, id), 'available', 'posted again two days later');
      assert(QS.accept(p, id), 'and taken again');
    },
  },
];

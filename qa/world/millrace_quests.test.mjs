// The Millrace's foes, quests, mill board and named drops (cap 35 stage 1, foes and quests lane, 2026-11-27;
// docs/handoff/briefs/BRIEF_cap35_millrace.md sections 4, 5 and 8). The foe families with the ids the cave lane reuses, a
// pack of 2 or 3 on every camp spot at its level, the Weir-Count alone at the Upper Weir; ten quests whose givers stand
// somewhere and whose objectives can be done, XP by the formula; the board's three dailies on the boards' day clock; the
// 1% named pieces at ilvl 33; and the chain played through with quest commands. Sim only: createWorld on the real content.
//
// The live cap is 30 (another lane raises it to 35). Tests that need heroes past 30 run on a copy of the content with
// progression.maxLevel 35 and xpToNext by the brief's curve (bandXpToNext): a test-only copy, the game's numbers stand.
import { assert, eq, content, reachable } from './_harness.mjs';
import { createWorld } from '../../src/sim/index.js';
import { ZONES } from '../../src/data/maps/index.js';
import { spotFree } from '../../src/sim/collision.js';
import { mobStats } from '../../src/data/mobs.js';
import { rollKill } from '../../src/sim/loot.js';
import { createRng } from '../../src/sim/rng.js';
import { bandXpToNext } from '../../src/data/band20.js';
import { MR_MOBS } from '../../src/data/millrace_foes.js';
import { MR_QUESTS, MR_QUEST_ORDER, MR_BOARD, MR_BOUNTIES, MR_NAMED_ROWS, MR_NAMED_BAND, MR_CAVE_XP_BUDGET, mrQuestXp, mrBountyXp, mrBountyGold, PAGES_EAST_AFTER } from '../../src/data/millrace_quests.js';
import { CAMPS, CAMP_FOES, NAMED_FOES, MARKS } from '../../tools/maps/zone_millrace.mjs';

const FAMILIES = ['weir_rat', 'drowned_drover', 'silt_hound', 'name_washer', 'weir_count'];
const KINDS = ['named', 'camp', 'gather'];
const r10 = (x) => Math.round(x / 10) * 10;
const inCircle = (s, w) => Math.hypot(s.x * 16 + 8 - w.x, s.y * 16 + 8 - w.y) <= w.r;
const noDash = (t) => !/[–—]/.test(t);

let C35 = null;
/** The real content with the cap at 35 (test only). */
function content35() {
  if (C35) return C35;
  const C = content(), P = C.progression;
  const xp = [...P.xpToNext];
  for (let L = xp.length; L < 35; L++) xp[L] = bandXpToNext(L);
  C35 = { ...C, progression: { ...P, maxLevel: 35, xpToNext: xp } };
  return C35;
}
/** content35 with only the Millrace's foes and every npc (the rest of the world's camps slow every step). */
let CM = null;
function contentMill() {
  if (CM) return CM;
  const C = content35();
  CM = { ...C, spawns: C.spawns.filter((s) => s.npc || s.zone === 'millrace'), nightSpawns: [] };
  return CM;
}
function run(w, n, pred = null) {
  const out = [];
  for (let i = 0; i < n; i++) { const ev = w.step(); out.push(...ev); if (pred && ev.some(pred)) break; }
  return out;
}
const millSpawns = () => content().spawns.filter((s) => s.zone === 'millrace' && s.mob);

export const tests = [
  {
    name: 'millrace foes: the five families (weir_rat, drowned_drover, silt_hound, name_washer, weir_count) and the board`s two named foes, levels 30 to 34, on the live curve',
    fn() {
      const C = content();
      for (const id of FAMILIES) assert(C.mobs[id] && MR_MOBS[id], `${id} is a foe`);
      eq(C.mobs.weir_rat.family, 'beast'); eq(C.mobs.silt_hound.family, 'beast');
      eq(C.mobs.drowned_drover.family, 'humanoid', 'drowned drovers are humanoid: they run at 15% and call friends (src/sim/ai.js fleeAt)');
      eq(C.mobs.drowned_drover.flee, null, 'no flee of their own: the humanoid rule applies');
      assert(C.mobs.weir_rat.flee > 0 && C.mobs.weir_rat.flee <= 0.25, 'weir-rats run at low health');
      // the name-washer's cast hurts and slows, and can be interrupted
      const wash = C.mobAbilities[C.mobs.name_washer.abilities[0].id];
      assert(wash && wash.castTime >= 1.5 && !wash.uninterruptible, 'a cast you can interrupt');
      assert(wash.effects.some((e) => e.type === 'aura' && e.aura.mods.some((m) => m.stat === 'speed' && m.mul < 1)), 'it slows you');
      eq(C.mobs.name_washer.kind, 'caster');
      // the elite
      const ec = C.mobs.weir_count;
      assert(ec.elite && ec.level[0] === 34 && ec.card && noDash(ec.card) && noDash(ec.deathLine), 'the Weir-Count: elite, level 34, its card');
      assert(ec.fight.phases.some((p) => p.summon && p.summon.mob === 'weir_rat'), 'it calls rats at half');
      for (const a of ec.abilities) assert(C.mobAbilities[a.id], `${a.id} exists`);
      // levels and the live health formula (835 + 58 x (L - 15) at kind normal)
      for (const [id, m] of Object.entries(MR_MOBS)) {
        assert(m.level[0] >= 30 && m.level[1] <= 34, `${id}: levels ${m.level}`);
        for (const a of m.abilities) assert(C.mobAbilities[a.id], `${id}: ability ${a.id}`);
        assert(C.mobSprites[id] && C.mobSprites[id].sprite, `${id}: a 2D look`);
        for (const t of [m.name]) assert(noDash(t), `${id}: no dashes`);
      }
      for (const L of [30, 31, 32, 33, 34]) eq(mobStats('weir_rat', L).hp, 835 + 58 * (L - 15), `weir_rat health at ${L}`);
      eq(mobStats('drowned_drover', 33).xp, 20 + 4 * 33, 'kill XP on the live formula');
    },
  },
  {
    name: 'millrace camps: a pack of 2 or 3 on every camp spot at the spot`s level, every foe walkable and reachable, the Weir-Count alone on the Upper Weir`s elite spot',
    fn() {
      const Z = ZONES.millrace, ok = reachable('millrace');
      eq(Object.keys(CAMP_FOES).sort().join(','), CAMPS.map((c) => c.id).sort().join(','), 'every camp spot has its foes');
      for (const c of Z.camps) {
        const sp = Z.spawns.filter((s) => s.group === c.id);
        eq(sp.length, CAMP_FOES[c.id].length, `${c.id}: its pack`);
        if (c.elite) { eq(sp.length, 1, `${c.id}: the elite alone`); eq(sp[0].mob, 'weir_count'); eq(sp[0].level, 34); assert(!sp[0].pack, 'the elite is not a pack'); }
        else assert(sp.length >= 2 && sp.length <= 3 && sp.every((s) => s.pack === sp.length), `${c.id}: a pack of 2 or 3 (${sp.length})`);
        for (const s of sp) {
          eq(s.level, c.level, `${c.id}: ${s.mob} at the camp's level`);
          assert(Math.hypot(s.x - c.x, s.y - c.y) <= 3.5, `${c.id}: ${s.mob} at ${s.x},${s.y} on its spot`);
          assert(ok(s.x, s.y) && Z.collision[s.y][s.x] === '.', `${c.id}: ${s.mob} walkable and reachable`);
          const m = content().mobs[s.mob];
          assert(s.level >= m.level[0] && s.level <= m.level[1], `${c.id}: ${s.mob} level ${s.level} in its template's range`);
        }
      }
      eq(Z.spawns.filter((s) => s.mob === 'weir_count').length, 1, 'one Weir-Count');
      // every family stands somewhere, in content.spawns too
      for (const id of FAMILIES) assert(millSpawns().some((s) => s.mob === id), `${id} spawns in the Millrace`);
      // the deep flood has the hounds and washers; the fords the drovers
      const areaOf = (s) => (Z.camps.find((c) => c.id === s.camp) || {}).area;
      for (const s of Z.spawns.filter((x) => x.mob === 'silt_hound' || x.mob === 'name_washer')) assert(['mr_flood', 'mr_weir'].includes(areaOf(s)), `${s.mob} at ${s.x},${s.y} in the flood or at the weir`);
      for (const s of Z.spawns.filter((x) => x.mob === 'drowned_drover')) assert(['mr_fords', 'mr_weir'].includes(areaOf(s)), `drowned drover at ${s.x},${s.y} on the fords or the weir`);
    },
  },
  {
    name: 'millrace quests: ten, givers and turn-ins placed, every foe, item, area and npc they ask for exists and can be reached; XP by the formula; levels 30 to 35; no dashes',
    fn() {
      const C = content(), Z = C.zones.millrace, ok = reachable('millrace');
      eq(MR_QUEST_ORDER.length, 10, 'ten zone quests (#1 to #9 and #12; the cave lane`s #10 and #11 are in src/data/weir_works.js)');
      const npcAt = new Map();
      for (const s of C.spawns) if (s.npc) npcAt.set(s.npc, s.zone);
      assert(npcAt.get('mr_clerk') === 'millrace', 'the clerk stands in the Millrace');
      eq(MR_QUESTS.mr_chain_comes_down.giver, 'mael', 'the breadcrumb comes from Willowmere');
      eq(MR_QUESTS.mr_chain_comes_down.level, 30);
      eq(npcAt.get('mael'), 'world', 'Elder Mael stands in Willowmere');
      assert(MR_QUEST_ORDER.filter((id) => MR_QUESTS[id].giver === 'mr_clerk').length >= 5, 'the clerk is the main giver');
      eq(MR_QUESTS.mr_pages_to_the_east.requires.quests.join(), PAGES_EAST_AFTER, '#12 follows the switchable constant');
      for (const id of MR_QUEST_ORDER) {
        const q = C.quests[id];
        assert(q, `${id} loaded`);
        assert(npcAt.has(q.giver) && npcAt.has(q.turnIn), `${id}: giver ${q.giver} / turn-in ${q.turnIn} placed`);
        assert(q.level >= 30 && q.level <= 35, `${id}: level ${q.level}`);
        eq(q.minLevel, q.level - 1, `${id}: min level`);
        assert(C.sideQuests.includes(id), `${id}: offered (side quest)`);
        eq(q.rewards.gold > 0 && q.rewards.xp % 10, 0, `${id}: XP in tens`);
        assert(q.rewards.xp >= mrQuestXp(q.level, 0.3) && q.rewards.xp <= mrQuestXp(q.level, 1.0), `${id}: XP ${q.rewards.xp} is the formula at a size 0.3 to 1.0`);
        for (const t of [q.name, ...Object.values(q.text), ...q.objectives.map((o) => o.label)]) assert(noDash(t), `${id}: no dashes in ${t}`);
        for (const r of q.requires.quests) assert(C.quests[r], `${id}: requires ${r}, which exists`);
        q.objectives.forEach((o, i) => {
          assert(o.where && o.where.length, `${id} ${i}: where circles`);
          if (o.kind === 'kill') {
            const hits = millSpawns().filter((s) => s.mob === o.mob && o.where.some((w) => inCircle(s, w)));
            assert(hits.length >= 1, `${id}: ${o.mob} stands inside its circles`);
            for (const s of hits) assert(s.level <= q.level + 1, `${id}: ${o.mob} L${s.level} for a level ${q.level} quest`);
          }
          if (o.kind === 'collect') {
            const nodes = (Z.nodes || []).filter((n) => n.item === o.item);
            const drops = Object.values(C.mobs).filter((m) => (m.loot.table || []).some((t) => t.item === o.item && t.quest === id));
            assert(C.items[o.item] && C.items[o.item].kind === 'quest', `${id}: ${o.item} is a quest item`);
            assert(nodes.length >= o.count || drops.length, `${id}: ${o.item} has a source (${nodes.length} nodes, ${drops.length} foes)`);
            for (const n of nodes) assert(ok(n.x, n.y), `${id}: node ${n.id} reachable`);
            if (drops.length) assert(millSpawns().some((s) => drops.some((m) => m.id === s.mob) && o.where.some((w) => inCircle(s, w))), `${id}: a foe that drops ${o.item} inside its circles`);
          }
          if (o.kind === 'explore') {
            const a = C.zones[o.zone].areas.find((x) => x.id === o.area);
            assert(a, `${id}: area ${o.area}`);
            let any = false;
            for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) if (ok(x, y)) any = true;
            assert(any, `${id}: ${o.area} has a reachable cell`);
          }
          if (o.kind === 'talk' || o.kind === 'deliver') assert(npcAt.has(o.npc || o.to), `${id}: ${o.npc || o.to} placed`);
          if (o.kind === 'deliver') assert((q.giveOnAccept || []).some((g) => g.item === o.item), `${id}: the parcel is given on accept`);
          if (o.kind === 'escort') {
            assert(C.npcs[o.npc] && C.npcs[o.npc].roles.includes('escort'), `${id}: escort ${o.npc}`);
            for (const p of [o.from, o.to]) assert(ok(p.x, p.y), `${id}: escort ${p.x},${p.y} reachable`);
            for (const a of o.ambush) for (const m of a.mobs) assert(C.mobs[m.mob], `${id}: ambush ${m.mob}`);
          }
        });
        for (const r of q.rewards.choice || []) {
          const it = C.items[r];
          assert(it && (it.kind === 'armor' || it.kind === 'weapon'), `${id}: reward ${r}`);
          assert(it.reqLevel <= Math.max(q.minLevel, q.requires.level || 0) + 2, `${id}: ${r} wearable at once (req ${it.reqLevel})`);
          assert(noDash(it.name), `${r}: no dashes`);
        }
      }
      for (const m of MARKS) assert(Z.areas.some((a) => a.id === m.id && a.banner === false), `${m.id}: an unbannered mark`);
      const kinds = new Set(MR_QUEST_ORDER.flatMap((id) => C.quests[id].objectives.map((o) => o.kind)));
      for (const k of ['kill', 'collect', 'escort', 'deliver', 'explore', 'talk']) assert(kinds.has(k), `a ${k} quest`);
      for (const t of C.npcs.mr_wat.talk) assert(noDash(t), 'escort lines: no dashes');
    },
  },
  {
    name: 'millrace XP: the ten pay 54,010; with one day of the mill board and the cave chain`s share the stage`s quests pay about 78,000, 70% of the 111,430 from 30 to 35',
    fn() {
      const C = content();
      const zone = MR_QUEST_ORDER.reduce((n, id) => n + C.quests[id].rewards.xp, 0);
      eq(zone, 54010, 'the ten quests');
      const span = [30, 31, 32, 33, 34].reduce((n, L) => n + bandXpToNext(L), 0);
      eq(span, 111430, 'the brief`s 30 to 35');
      for (const day of [0, 1]) {
        const w = createWorld({ seed: 2, content: contentMill(), day });
        const posted = w.quests.bountiesToday(day).filter((id) => C.quests[id].bounty.board === 'millrace');
        eq(posted.length, 3, `day ${day}: three dailies`);
        const board = posted.reduce((n, id) => n + C.quests[id].rewards.xp, 0);
        const all = zone + board + MR_CAVE_XP_BUDGET;
        assert(all >= 76000 && all <= 80000, `day ${day}: ${all} quest XP for the stage`);
        const share = all / span;
        assert(share > 0.68 && share < 0.72, `day ${day}: quests ${(100 * share).toFixed(1)}% of the stage`);
        // the walk: kills at 3/7 of quest XP; the first three, the day's board (lowest first), the rest with the cave's
        // share where the cave chain will sit (#10 before the elite, #11 before #12); every pickup in level; 35 at the end
        const P = content35().progression;
        let level = 30, xp = 0;
        const gain = (n) => { xp += n; while (level < 35 && xp >= P.xpToNext[level]) { xp -= P.xpToNext[level]; level++; } };
        const take = (n, q) => { if (q) { assert(level >= q.minLevel, `day ${day}: ${q.id} at level ${level}, needs ${q.minLevel}`); assert(level <= q.level + 2, `day ${day}: ${q.id} (level ${q.level}) at ${level}`); } gain(n); gain(Math.round(n * 3 / 7)); };
        const ids = [...MR_QUEST_ORDER];
        for (const id of ids.slice(0, 3)) take(C.quests[id].rewards.xp, C.quests[id]);
        for (const id of [...posted].sort((a, b) => C.quests[a].level - C.quests[b].level)) take(C.quests[id].rewards.xp, C.quests[id]);
        for (const id of ids.slice(3, 7)) take(C.quests[id].rewards.xp, C.quests[id]);
        // the cave lane's two (src/data/weir_works.js) pay exactly the share this lane left them
        eq(C.quests.mr_down_the_undershot.rewards.xp + C.quests.mr_wheel_still_turns.rewards.xp, MR_CAVE_XP_BUDGET, 'the cave chain pays its budget');
        take(C.quests.mr_down_the_undershot.rewards.xp, C.quests.mr_down_the_undershot);       // #10 (33, size 0.3)
        for (const id of ['mr_the_upper_weir', 'mr_who_broke_the_weir']) take(C.quests[id].rewards.xp, C.quests[id]);
        take(C.quests.mr_wheel_still_turns.rewards.xp, C.quests.mr_wheel_still_turns);          // #11 (35, size 0.75)
        take(C.quests.mr_pages_to_the_east.rewards.xp, null);       // #12 is picked up at 34, the min level
        eq(level, 35, `day ${day}: 35 at the last hand-in (${xp} over)`);
      }
    },
  },
  {
    name: 'mill board: the clerk keeps it by the board, three pools (named, camp, gather) of two, on the same day clock as the others; each bounty can be done in the Millrace',
    fn() {
      const C = content(), Z = C.zones.millrace, ok = reachable('millrace');
      const B = C.bounties.boards.find((b) => b.id === 'millrace');
      assert(B && B === C.bounties.boards[C.bounties.boards.length - 1], 'the mill board, after the other three (their posting days are unchanged)');
      const clerk = Z.npcs.find((n) => n.npc === B.npc);
      const [bx, by] = Z.spots.bountyBoard;
      assert(clerk && Math.hypot(clerk.x - bx, clerk.y - by) <= 4, 'the clerk stands by the board');
      eq(B.requires, 'mr_chain_comes_down');
      eq(B.pools.length, 3);
      const spawns = millSpawns();
      B.pools.forEach((pool, k) => {
        eq(pool.length, 2, `${KINDS[k]}: two to rotate`);
        for (const id of pool) {
          const q = C.quests[id];
          assert(q && q === C.quests[id] && MR_BOUNTIES[id] && q.bounty.board === 'millrace' && q.bounty.kind === KINDS[k], `${id}: a ${KINDS[k]} bounty`);
          eq(q.giver, 'mr_clerk'); eq(q.turnIn, 'mr_clerk');
          eq(q.rewards.xp, mrBountyXp(q.level)); eq(q.rewards.xp, r10(mrQuestXp(q.level, 0.45))); eq(q.rewards.gold, mrBountyGold(q.level));
          eq(q.minLevel, q.level - 2);
          assert(q.level >= 31 && q.level <= 33, `${id}: level ${q.level}`);
          assert(q.name.startsWith('Bounty: '));
          for (const t of Object.values(q.text)) assert(noDash(t), `${id}: no dashes`);
          for (const o of q.objectives) {
            const mobs = o.kind === 'kill' ? [o.mob] : Object.values(C.mobs).filter((m) => (m.loot.table || []).some((e) => e.item === o.item && e.quest === id)).map((m) => m.id);
            assert(mobs.length, `${id}: something gives ${o.item || o.mob}`);
            const hits = spawns.filter((s) => mobs.includes(s.mob) && o.where.some((w) => inCircle(s, w)));
            assert(hits.length >= (KINDS[k] === 'named' ? 1 : 3), `${id}: ${hits.length} targets inside its circles`);
            for (const s of hits) assert(s.level <= q.level + 1, `${id}: ${s.mob} L${s.level}`);
          }
        }
      });
      // the named foes: walkable, reachable, 6+ tiles from every camp and npc
      for (const n of NAMED_FOES) {
        const s = Z.spawns.find((x) => x.mob === n.mob);
        assert(s && (C.mobs[n.mob].traits || []).includes('tough'), `${n.mob}: a tough named foe`);
        assert(ok(s.x, s.y), `${n.mob} reachable`);
        for (const c of Z.camps) assert(Math.hypot(c.x - s.x, c.y - s.y) >= 6, `${n.mob} within 6 tiles of ${c.id}`);
        for (const p of Z.npcs) assert(Math.hypot(p.x - s.x, p.y - s.y) >= 6, `${n.mob} within 6 tiles of ${p.npc}`);
      }
      // the day clock: one of each kind a day, from the day index alone, repeating every 2 days; the clerk offers them
      for (const day of [-3, 0, 1, 7, 20512]) {
        const w = createWorld({ seed: 4, content: contentMill(), day });
        const t = w.quests.bountiesToday(day).filter((id) => C.quests[id].bounty.board === 'millrace');
        eq(KINDS.map((kd) => t.filter((id) => C.quests[id].bounty.kind === kd).length).join(), '1,1,1', `day ${day}: one of each`);
        eq(JSON.stringify(t), JSON.stringify(w.quests.bountiesToday(day + 2).filter((id) => C.quests[id].bounty.board === 'millrace')), `day ${day} = day ${day + 2}`);
        assert(t.every((id) => !w.quests.bountiesToday(day + 1).includes(id)), `day ${day + 1} posts the other three`);
      }
      const w = createWorld({ seed: 5, content: contentMill(), day: 4 });
      const pid = w.addPlayer({ name: 'Board', cls: 'warden', zone: 'millrace', x: clerk.x, y: clerk.y + 1, level: 30, questsDone: ['mr_chain_comes_down'] });
      w.setLevel(pid, 33);
      const p = w.get(pid);
      const posted = w.quests.bountiesToday().filter((id) => C.quests[id].bounty.board === 'millrace');
      const offers = w.quests.offersAt(p, 'mr_clerk').offers.filter((id) => id.startsWith('bounty_'));
      eq(JSON.stringify(offers), JSON.stringify(posted), 'the clerk offers today`s three');
      const fresh = w.get(w.addPlayer({ name: 'New', cls: 'warden', zone: 'millrace', x: clerk.x, y: clerk.y + 1, level: 31 }));
      assert(posted.every((id) => w.quests.status(fresh, id) === 'locked'), 'the board opens after The Chain Comes Down');
      // a named bounty through the world: accept, kill, hand in; done for today, not for good
      const id = posted.find((x) => C.quests[x].bounty.kind === 'named');
      const npc = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'mr_clerk');
      w.enqueue(pid, { t: 'quest_accept', quest: id, npc: npc.id }); w.step();
      eq(w.quests.status(p, id), 'active', 'accepted');
      w.quests.onKill(p, { template: C.quests[id].objectives[0].mob, zone: 'millrace', id: -1 });
      eq(w.quests.status(p, id), 'ready');
      const gold0 = p.gold;
      w.enqueue(pid, { t: 'quest_turnin', quest: id, choice: 0, npc: npc.id }); w.step();
      eq(w.quests.status(p, id), 'done', 'done for today'); assert(!p.questsDone.includes(id), 'never in questsDone');
      eq(p.gold - gold0, C.quests[id].rewards.gold, 'gold paid');
    },
  },
  {
    name: 'millrace named drops: four magic pieces at ilvl 33, about 1% from foes of 31 to 35 (the Millrace`s), none from level 30',
    fn() {
      const C = content();
      eq(MR_NAMED_ROWS.length, 4);
      assert(C.dropRules.named.includes(MR_NAMED_BAND), 'the band is on the drop rules');
      eq(`${MR_NAMED_BAND.from},${MR_NAMED_BAND.to},${MR_NAMED_BAND.chance}`, '31,35,0.01');
      for (const [id] of MR_NAMED_ROWS) {
        const it = C.items[id];
        assert(it && (it.kind === 'armor') && it.level === 33 && it.rarity === 'magic' && it.reqLevel <= 31, `${id}: magic, ilvl 33, wearable at 31`);
        assert(noDash(it.name), `${id}: no dashes`);
      }
      const named = new Set(MR_NAMED_BAND.items);
      const count = (template, level) => {
        const rng = createRng(17);
        let n = 0;
        for (let i = 0; i < 3000; i++) n += rollKill({ content: C, rng, questNeeds: () => false }, { template, level }, { level, cls: 'warden' }).items.filter((x) => named.has(x.item)).length;
        return n;
      };
      eq(count('weir_rat', 30), 0, 'none from level 30 foes');
      const n = count('drowned_drover', 33);
      assert(n >= 15 && n <= 50, `about 1% from level 33 foes (${n} in 3000)`);
    },
  },
  {
    name: 'millrace chain: the twelve quests (#1 to #9, the Weir Works` #10 and #11, #12) play through with quest commands (accept, explore, collect, kill, escort, talk, deliver, delve_enter, turn in), from Elder Mael and back to him',
    fn() {
      const C = contentMill();
      const w = createWorld({ seed: 21, content: C });
      const id = w.addPlayer({ name: 'Ann', cls: 'warden', zone: 'millrace', x: 92, y: 84 });
      const e = w.get(id);
      w.setLevel(id, 35);
      eq(e.level, 35, 'level 35 (the test cap)');
      const npc = (t) => w.state.ents.find((x) => x.kind === 'npc' && x.template === t);
      const goTo = (zone, tx, ty) => { e.zone = zone; e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };
      const at = (t) => { const n = npc(t); assert(n, `npc ${t} spawned`); e.zone = n.zone; e.x = n.x + 8 * 16; e.y = n.y; return n; };
      const kill = (m) => { e.zone = m.zone; e.x = m.x + 8 * 16; e.y = m.y; m.tagger = id; w.internals.combat.kill(m, e); run(w, 1); };
      // the brief's order: #1 to #9, then the cave lane's #10 and #11 (src/data/weir_works.js), then #12
      const CHAIN12 = [...MR_QUEST_ORDER.filter((x) => x !== 'mr_pages_to_the_east'), 'mr_down_the_undershot', 'mr_wheel_still_turns', 'mr_pages_to_the_east'];
      eq(CHAIN12.length, 12, 'twelve');
      let cave = null;
      for (const qid of CHAIN12) {
        const q = C.quests[qid];
        w.setLevel(id, Math.min(35, Math.max(q.level, q.requires.level || 0)));
        const g = at(q.giver);
        w.enqueue(id, { t: 'quest_accept', quest: qid, npc: g.id });
        run(w, 2);
        assert(e.quests[qid], `${qid}: accepted (${w.quests.status(e, qid)})`);
        // a quest in the Weir Works: in by the undercroft door with the real command (src/sim/delve.js), once
        if (q.place === 'weir_works' && !(cave && e.zone === cave)) {
          goTo('millrace', 77, 38); w.enqueue(id, { t: 'delve_enter', door: 'weir_works' }); run(w, 3);
          assert(/^weir_works#/.test(e.zone), `${qid}: into a Weir Works copy (${e.zone})`);
          cave = e.zone;
        }
        const here = q.place === 'weir_works' ? cave : 'millrace';
        q.objectives.forEach((o, i) => {
          const left = () => e.quests[qid] && e.quests[qid].counts[i] < (o.count || 1);
          const find = (pred) => w.state.ents.find((x) => x.kind === 'mob' && !x.dead && x.zone === here && pred(x));
          if (o.kind === 'kill') {
            for (let k = 0; k < 300 && left(); k++) { const m = find((x) => x.template === o.mob); if (m) kill(m); else run(w, 400); }
          } else if (o.kind === 'collect') {
            const nodes = w.state.ents.filter((x) => x.kind === 'object' && x.node && x.node.item === o.item);
            if (nodes.length) {
              for (let k = 0; k < 60 && left(); k++) { const ob = nodes[k % nodes.length]; goTo(ob.zone, Math.floor(ob.x / 256), Math.floor((ob.y - 1) / 256)); w.enqueue(id, { t: 'interact', id: ob.id }); run(w, 4 + (ob.node.channel || 0) * 20); }
            } else {
              const srcs = Object.entries(C.mobs).filter(([, m]) => (m.loot.table || []).some((x) => x.item === o.item)).map(([mid]) => mid);
              for (let k = 0; k < 400 && left(); k++) { const m = find((x) => srcs.includes(x.template)); if (m) kill(m); else run(w, 400); }
            }
          } else if (o.kind === 'explore') {
            const a = C.zones[o.zone].areas.find((x) => x.id === o.area);
            const cx = a.x + Math.floor(a.w / 2), cy = a.y + Math.floor(a.h / 2);
            let ok = false;
            for (let r = 0; r <= 12 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) {
              const x = cx + dx, y = cy + dy;
              if (x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h && spotFree(C.zones[o.zone], x, y)) { goTo(o.zone === q.place ? cave : o.zone, x, y); ok = true; }
            }
            assert(ok, `${qid}: a free cell in ${o.area}`);
            w.enqueue(id, { t: 'move', dx: 1, dy: 0 }); run(w, 2); w.enqueue(id, { t: 'stop' }); run(w, 2);
          } else if (o.kind === 'talk') { const n = at(o.npc); w.enqueue(id, { t: 'interact', id: n.id }); run(w, 2); }
          else if (o.kind === 'deliver') { const n = at(o.to); w.enqueue(id, { t: 'interact', id: n.id }); run(w, 2); }
          else if (o.kind === 'escort') {
            // walk to the escort, then carry hero and escort to the end (the escort tests cover the ambushes)
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
        assert(e.quests[qid] && e.quests[qid].state === 'ready', `${qid}: ready (${JSON.stringify(e.quests[qid])})`);
        e.bag = []; e.pendingLoot = [];
        const t = at(q.turnIn);
        w.enqueue(id, { t: 'quest_turnin', quest: qid, npc: t.id, choice: 0 });
        run(w, 2);
        assert(e.questsDone.includes(qid), `${qid}: turned in`);
      }
      eq(e.zone, 'world', 'the last hand-in is in Willowmere');
      assert(w.state.ents.some((x) => x.kind === 'npc' && x.template === 'mr_ferrick' && x.zone === 'millrace'), 'Ferrick is back at the mill');
    },
  },
];

// Professions, build step 1 (src/data/professions.js, src/sim/professions.js): the data (counts, every reagent and
// product exists, crafted gear under dungeon gear), the nodes (spawn points, a third up, shared, respawn at a free point),
// the gather cast (2 s, a move or a hit stops it, yields, skill-up colours), trainers and ranks (two primaries, level,
// gold), recipes (trainer, Patterns), crafting (each craft takes its reagents at once, all or none; Create All),
// the consumables (elixir slots, a flask through death, food out of combat, bandage over time and its own cooldown),
// drops (meat, boss Patterns), save and load (optional field, old saves) and a guest's commands through the sim.
import { assert, eq } from './_fixtures.mjs';
import { createWorld, restoreWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { RECIPES_BY_PROF, RECIPES, PROF_ITEMS, NODE_KINDS, RANKS, recipeColor, nodeColor } from '../../src/data/professions.js';
import { NODE_POINTS } from '../../src/data/prof_nodes.js';
import { reach } from '../../tools/maps/kit.mjs';
import { resolveItem } from '../../src/sim/loot.js';
import { framesFor, createFrameState, applyFrame, createTickCache } from '../../src/net/frames.js';

let _C = null;
const content = () => _C || (_C = buildContent());
const SUBT = 256;
const npcEnt = (w, t) => w.state.ents.find((e) => e.kind === 'npc' && e.template === t);
const nodes = (w, pred = () => true) => w.state.ents.filter((e) => e.kind === 'object' && e.node && e.node.gather && pred(e));
const count = (p, item) => (p.bag || []).filter((s) => s.item === item).reduce((n, s) => n + s.qty, 0);
const ofType = (evs, t) => evs.filter((e) => e.type === t);

function world(seed = 5) { return createWorld({ seed, content: content() }); }
function hero(w, opts = {}) {
  const id = w.addPlayer({ name: 'Ash', cls: opts.cls || 'warden', level: opts.level || 1, gold: opts.gold ?? 1000 });
  return w.get(id);
}
/** Put the hero right next to an entity (same tile row, a few px off). */
function standBy(p, e) { p.x = e.x - 10 * 16; p.y = e.y; }
function run(w, n) { const all = []; for (let i = 0; i < n; i++) all.push(...w.step()); return all; }
function learn(w, p, prof, npc) {
  const n = npcEnt(w, npc);
  standBy(p, n);
  w.enqueue(p.id, { t: 'prof_train', npc: n.id, prof });
  return run(w, 1);
}
function giveSkill(p, prof, v, rank = 5) { p.prof.skills[prof] = { v, rank }; }

export const tests = [
  {
    name: 'data: recipe counts (Smithing 44, Alchemy 26, Cooking 31, First Aid 11, Leatherwork 39, Tailoring 35, Inscription 28), every reagent and product exists, sources and Patterns',
    fn() {
      const C = content();
      eq(RECIPES_BY_PROF.smithing.length, 44, 'smithing'); eq(RECIPES_BY_PROF.alchemy.length, 26, 'alchemy');
      eq(RECIPES_BY_PROF.cooking.length, 31, 'cooking'); eq(RECIPES_BY_PROF.first_aid.length, 11, 'first aid');
      eq(RECIPES_BY_PROF.leatherwork.length, 39, 'leatherwork'); eq(RECIPES_BY_PROF.tailoring.length, 35, 'tailoring'); eq(RECIPES_BY_PROF.inscription.length, 28, 'inscription');
      for (const r of Object.values(RECIPES)) {
        assert(C.items[r.makes.item], `${r.id} makes ${r.makes.item}`);
        for (const [i, k] of r.reagents) assert(C.items[i] && k > 0, `${r.id} needs ${i}`);
        assert(r.skill >= 1 && r.skill <= 150, `${r.id} skill`);
        if (r.source !== 'trainer') assert(C.items[`pattern_${r.id}`] && C.items[`pattern_${r.id}`].use.recipe === r.id, `${r.id} has a Pattern`);
      }
      const all = Object.values(RECIPES);
      const share = (s) => all.filter((r) => r.source === s || r.source.startsWith(s)).length / all.length;
      assert(share('trainer') > 0.7 && share('world') > 0.08 && share('boss:') > 0.04, `sources ${share('trainer')} ${share('world')} ${share('boss:')}`);
      for (const it of Object.values(PROF_ITEMS)) {
        assert(!/[–—]/.test(`${it.name} ${it.text || ''}`), `${it.id}: no em dash`);
        for (const cls of ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade']) assert(resolveItem(C, { item: it.id }, cls), `${it.id} resolves`);
      }
      // the trainers' reagents are on sale
      for (const [npc, it] of [['garrick', 'smith_flux'], ['pell', 'empty_vial'], ['oren', 'sack_of_flour'], ['oren', 'cooking_salt'], ['dunstan', 'smith_flux'], ['briony', 'empty_vial']]) {
        assert(C.npcs[npc].vendor.items.some((s) => s.item === it), `${npc} sells ${it}`);
      }
    },
  },
  {
    name: 'data: crafted gear stays under dungeon gear (blues at most the band level less one, boss yellows one under the dungeon rare)',
    fn() {
      const C = content();
      const crafted = Object.values(C.items).filter((i) => i.crafted);
      assert(crafted.length >= 25, `crafted gear ${crafted.length}`);
      const sum = (s) => Object.values(s).reduce((a, b) => a + b, 0);
      for (const it of crafted) {
        assert(['common', 'magic', 'rare'].includes(it.rarity), `${it.id} rarity ${it.rarity}`);
        // the 20 to 30 band (build step 2): no dungeon of its own yet, so blues stay at most level 29 and never yellow
        if (it.level > 19) { assert(it.level <= 29 && it.rarity !== 'rare', `${it.id} ilvl ${it.level} ${it.rarity} in the 20 to 30 band`); continue; }
        const band = it.level <= 12 ? 'barrow' : 'watchtower';
        const dungeon = Object.values(C.items).filter((d) => d.dungeon === band && (d.rarity === 'rare' || d.rarity === 'epic') && !d.set);
        const top = Math.max(...dungeon.map((d) => d.level));
        assert(it.level <= top - 1, `${it.id} ilvl ${it.level} under ${band} ${top}`);
        if (it.rarity === 'rare') {
          const best = Math.max(...dungeon.filter((d) => d.slot !== 'trinket').map((d) => sum(d.stats)));
          assert(sum(it.stats) <= best + 1, `${it.id} stats ${sum(it.stats)} vs ${best}`);
        }
      }
    },
  },
  {
    name: 'nodes: 30 spawn points per kind per area, all walkable and reachable; a third up at start; node skill colours follow the brief',
    fn() {
      const C = content(), Z = C.zones.world;
      const seen = reach(Z, Z.arrival[0], Z.arrival[1]);
      let pts = 0;
      for (const pool of Object.values(C.professions.pools)) {
        eq(pool.points.length, 30, `${pool.area} ${pool.kind}`);
        for (const [x, y] of pool.points) { assert(Z.collision[y][x] === '.' && seen[y * Z.w + x] === 1, `${pool.area} ${pool.kind} ${x},${y}`); pts++; }
      }
      eq(pts, 180, 'spawn points');
      eq(Object.keys(NODE_POINTS).length, 3, 'three areas');
      const w = world();
      eq(nodes(w).length, 60, 'a third up');
      for (const pool of Object.keys(C.professions.pools)) eq(nodes(w, (e) => e.node.gather.pool === pool).length, 10, pool);
      eq(nodeColor(1, 1), 'orange'); eq(nodeColor(26, 1), 'yellow'); eq(nodeColor(51, 1), 'green'); eq(nodeColor(76, 1), 'gray'); eq(nodeColor(29, 30), 'red');
      eq(recipeColor(9, 0), 'orange'); eq(recipeColor(10, 0), 'yellow'); eq(recipeColor(20, 0), 'green'); eq(recipeColor(30, 0), 'gray');
    },
  },
  {
    name: 'gather: needs the profession and the skill, a 2 s cast, gives 1 to 3 ore (stone, sand, rare sometimes), the node goes and comes back after 5 min at a free point',
    fn() {
      const w = world(11);
      const p = hero(w);
      const tin = nodes(w, (e) => e.node.gather.node === 'tin_vein')[0];
      standBy(p, tin);
      w.enqueue(p.id, { t: 'interact', id: tin.id });
      let ev = run(w, 1);
      assert(ofType(ev, 'prof_fail').some((e) => e.reason === 'unknown_prof'), 'no Mining yet');
      learn(w, p, 'mining', 'garrick');
      eq(p.prof.skills.mining.v, 1, 'Novice miner'); eq(p.prof.skills.mining.rank, 1);
      // an iron seam needs Mining 30
      const iron = nodes(w, (e) => e.node.gather.node === 'iron_vein')[0];
      standBy(p, iron);
      w.enqueue(p.id, { t: 'interact', id: iron.id });
      ev = run(w, 1);
      assert(ofType(ev, 'prof_fail').some((e) => e.reason === 'skill' && e.need === 30), 'Needs Mining 30');
      standBy(p, tin);
      w.enqueue(p.id, { t: 'interact', id: tin.id });
      ev = run(w, 1);
      assert(ofType(ev, 'prof_work').some((e) => e.phase === 'start' && e.kind === 'gather'), 'the cast starts');
      const h = w.snapshot().hud[p.id].prof.work;
      assert(h && h.kind === 'gather' && /Mining: Tin Seam/.test(h.label), `the bar ${JSON.stringify(h)}`);
      ev = run(w, 38);
      eq(count(p, 'tin_ore'), 0, 'not before 2 s');
      ev = run(w, 3);
      const got = count(p, 'tin_ore');
      assert(got >= 1 && got <= 3, `1 to 3 ore (${got})`);
      assert(!w.get(tin.id), 'the node is gone');
      eq(p.prof.skills.mining.v, 2, 'orange: +1');
      assert(ofType(ev, 'xp').some((e) => e.source === 'gather' && e.amount >= 2), 'a little XP');
      eq(w.state.prof.pending.length, 1, 'one respawn waiting');
      const pool = 'valley:ore';
      run(w, 300 * 20 - 50);
      eq(nodes(w, (e) => e.node.gather.pool === pool).length, 9, 'not back before 5 minutes');
      run(w, 60);
      eq(nodes(w, (e) => e.node.gather.pool === pool).length, 10, 'back after 5 minutes');
      const pts = new Set(nodes(w, (e) => e.node.gather.pool === pool).map((e) => e.x + ',' + e.y));
      eq(pts.size, 10, 'never two on one point');
      // yields over many gathers: about 2.25 a node, stone about 30%
      for (const m of w.state.ents) if (m.kind === 'mob') { m.dead = true; m.respawnAt = 1e9; if (m.ai) m.ai.mode = 'dead'; }   // no foes: no hits
      let n = 0, ore = 0, stone = 0;
      const p2 = hero(w); learn(w, p2, 'mining', 'garrick'); p2.bags = ['loom_bag', 'loom_bag', 'loom_bag', 'loom_bag'];
      for (let i = 0; i < 80; i++) {
        const t = nodes(w, (e) => e.node.gather.node === 'tin_vein')[0];
        if (!t) { run(w, 600); continue; }
        standBy(p2, t); const o0 = count(p2, 'tin_ore'), s0 = count(p2, 'rubble_stone');
        w.enqueue(p2.id, { t: 'interact', id: t.id }); run(w, 42);
        ore += count(p2, 'tin_ore') - o0; stone += count(p2, 'rubble_stone') - s0; n++;
      }
      assert(ore / n > 1.9 && ore / n < 2.6, `ore a node ${ore / n}`);
      assert(stone / n > 0.15 && stone / n < 0.45, `stone a node ${stone / n}`);
    },
  },
  {
    name: 'gather: moving or a hit stops the cast; shared nodes, the first to finish gets it',
    fn() {
      const w = world(12);
      const a = hero(w), b = hero(w);
      learn(w, a, 'mining', 'garrick'); learn(w, b, 'mining', 'garrick');
      const t = nodes(w, (e) => e.node.gather.node === 'tin_vein')[0];
      standBy(a, t);
      w.enqueue(a.id, { t: 'interact', id: t.id }); run(w, 5);
      w.enqueue(a.id, { t: 'move', dx: 1, dy: 0 });
      let ev = run(w, 2);
      assert(ofType(ev, 'prof_work').some((e) => e.phase === 'stop' && e.reason === 'move'), 'a step stops it');
      w.enqueue(a.id, { t: 'stop' }); run(w, 2);
      standBy(a, t);
      w.enqueue(a.id, { t: 'interact', id: t.id }); run(w, 5);
      a.hp -= 5;
      ev = run(w, 1);
      assert(ofType(ev, 'prof_work').some((e) => e.phase === 'stop' && e.reason === 'interrupt'), 'a hit stops it');
      // both start on one node: a finishes first and gets it; b's cast stops, empty
      standBy(a, t); standBy(b, t);
      w.enqueue(a.id, { t: 'interact', id: t.id }); run(w, 10);
      w.enqueue(b.id, { t: 'interact', id: t.id });
      ev = run(w, 60);
      assert(count(a, 'tin_ore') > 0 && count(b, 'tin_ore') === 0, 'a got it, b did not');
      assert(ofType(ev, 'prof_work').some((e) => e.id === b.id && e.phase === 'stop' && e.reason === 'empty'), 'b: the node is gone');
    },
  },
  {
    name: 'trainers: two primary professions, Cooking and First Aid on top; ranks need level and gold; drop one, its skill goes',
    fn() {
      const w = world(13);
      const p = hero(w, { gold: 20 });
      learn(w, p, 'mining', 'garrick');
      learn(w, p, 'smithing', 'garrick');
      let ev = learn(w, p, 'alchemy', 'pell');
      assert(ofType(ev, 'prof_fail').some((e) => e.reason === 'two_primary'), 'no third primary');
      learn(w, p, 'cooking', 'oren'); learn(w, p, 'first_aid', 'hazel');
      eq(Object.keys(p.prof.skills).sort().join(), 'cooking,first_aid,mining,smithing', 'four known');
      eq(p.gold, 16, '1 gold each');
      assert(p.prof.recipes.includes('smelt_tin') && p.prof.recipes.includes('hide_strip_bandage'), 'Novice recipes');
      ev = learn(w, p, 'mining', 'garrick');
      assert(ofType(ev, 'prof_fail').some((e) => e.reason === 'level' && e.need === 6), 'Apprentice needs level 6');
      w.setLevel(p.id, 6);
      ev = learn(w, p, 'mining', 'garrick');
      eq(p.prof.skills.mining.rank, 2, 'Apprentice'); eq(p.gold, 1, '15 gold');
      ev = learn(w, p, 'smithing', 'garrick');
      assert(ofType(ev, 'prof_fail').some((e) => e.reason === 'gold'), 'no gold');
      // the wrong trainer, out of reach
      const n = npcEnt(w, 'oren'); standBy(p, n);
      w.enqueue(p.id, { t: 'prof_train', npc: n.id, prof: 'smithing' });
      assert(ofType(run(w, 1), 'prof_fail').some((e) => e.reason === 'not_trainer'), 'Oren does not train Smithing');
      p.x += 40 * SUBT;
      w.enqueue(p.id, { t: 'prof_train', npc: npcEnt(w, 'garrick').id, prof: 'smithing' });
      assert(ofType(run(w, 1), 'prof_fail').some((e) => e.reason === 'range'), 'too far');
      w.enqueue(p.id, { t: 'prof_unlearn', prof: 'smithing' }); run(w, 1);
      assert(!p.prof.skills.smithing && !p.prof.recipes.includes('smelt_tin'), 'Smithing dropped');
      p.gold = 10;
      ev = learn(w, p, 'alchemy', 'pell');
      assert(p.prof.skills.alchemy, 'room for Alchemy now');
      // the Downs trainers
      const q = hero(w, { gold: 5 });
      learn(w, q, 'mining', 'dunstan'); learn(w, q, 'herbalism', 'briony');
      assert(q.prof.skills.mining && q.prof.skills.herbalism, 'Thornfold trains too');
    },
  },
  {
    name: 'skill: the rank cap holds the skill; recipe colours give orange +1, grey nothing',
    fn() {
      const w = world(14);
      const p = hero(w);
      learn(w, p, 'mining', 'garrick'); learn(w, p, 'smithing', 'garrick');
      p.prof.skills.smithing.v = 30;          // Novice cap
      p.bag = []; for (let i = 0; i < 10; i++) w.internals.prof && null;
      const C = content();
      const add = (item, n) => { p.bag.push({ item, qty: n, uid: 900 + p.bag.length }); };
      add('tin_ore', 20);
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'smelt_tin', qty: 3 }); run(w, 100);
      eq(p.prof.skills.smithing.v, 30, 'capped at 30 by Novice'); eq(count(p, 'tin_bar'), 3, 'three bars');
      p.prof.skills.smithing = { v: 5, rank: 1 };
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'smelt_tin', qty: 2 }); run(w, 70);
      eq(p.prof.skills.smithing.v, 7, 'orange: +1 each');
      p.prof.skills.smithing = { v: 31, rank: 2 };
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'smelt_tin', qty: 2 }); run(w, 70);
      eq(p.prof.skills.smithing.v, 31, 'grey: nothing');
      void C;
    },
  },
  {
    name: 'craft: each craft takes its reagents at once, all or none; Create All stops when they run out; a full bag refuses and keeps them',
    fn() {
      const w = world(15);
      const p = hero(w);
      learn(w, p, 'smithing', 'garrick');
      p.bag = [{ item: 'tin_ore', qty: 7, uid: 1 }];
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'smelt_tin', qty: 99 });
      const seen = [];
      for (let i = 0; i < 160; i++) { run(w, 1); seen.push(count(p, 'tin_ore') + 2 * count(p, 'tin_bar')); }
      assert(seen.every((v) => v === 7), 'ore + 2 x bars is always 7: no half craft ever shows');
      eq(count(p, 'tin_bar'), 3, 'three bars'); eq(count(p, 'tin_ore'), 1, 'one ore left'); eq(p.work, null, 'stopped');
      // a recipe without the reagents
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'smelt_tin', qty: 1 });
      assert(ofType(run(w, 1), 'prof_fail').some((e) => e.reason === 'reagents'), 'no reagents');
      // not known
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'tin_dagger', qty: 1 });
      assert(ofType(run(w, 1), 'prof_fail').some((e) => e.reason === 'not_known'), 'not known yet');
      // buy it (skill 4 needed), then a full bag: the dagger does not fit and nothing is taken
      p.prof.skills.smithing.v = 4;
      const g = npcEnt(w, 'garrick'); standBy(p, g);
      const gold0 = p.gold;
      w.enqueue(p.id, { t: 'prof_recipe', npc: g.id, recipe: 'tin_dagger' }); run(w, 1);
      assert(p.prof.recipes.includes('tin_dagger') && p.gold < gold0, 'bought');
      p.bag = [{ item: 'tin_bar', qty: 3, uid: 50 }];
      const cap = 12;
      for (let i = 1; i < cap; i++) p.bag.push({ item: 'potion', qty: 20, uid: 50 + i });
      p.bag.push({ item: 'hi_potion', qty: 20, uid: 99 });
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'tin_dagger', qty: 1 });
      let ev = run(w, 40);
      assert(ofType(ev, 'prof_fail').some((e) => e.reason === 'bag_full'), 'bag full');
      eq(count(p, 'tin_bar'), 3, 'bars kept');
      p.bag = [{ item: 'tin_bar', qty: 3, uid: 50 }];
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'tin_dagger', qty: 1 }); ev = run(w, 40);
      const d = p.bag.find((s) => s.item === 'tin_dagger');
      assert(d && d.inst && d.inst.rarity === 'common' && d.inst.ilvl === 3, 'the dagger, with its instance');
      eq(count(p, 'tin_bar'), 0, 'bars used');
      // a move stops Create All between crafts
      p.bag = [{ item: 'tin_ore', qty: 20, uid: 70 }];
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'smelt_tin', qty: 10 }); run(w, 35);
      w.enqueue(p.id, { t: 'move', dx: 1, dy: 0 }); run(w, 2); w.enqueue(p.id, { t: 'stop' }); run(w, 40);
      eq(count(p, 'tin_bar'), 1, 'one made before the step');
    },
  },
  {
    name: 'consumables: elixir slots, a flask replaces both and stays through death; food only out of combat; bandage heals over 6 s on its own cooldown',
    fn() {
      const w = world(16);
      const p = hero(w, { level: 20 });
      const give = (item, n = 1) => p.bag.push({ item, qty: n, uid: 500 + p.bag.length });
      give('elixir_of_gloamfire'); give('elixir_of_the_long_watch'); give('flask_of_the_last_lamp'); give('valley_stew'); give('mallow_poultice', 2); give('elixir_of_the_ram');
      const hp0 = p.hpMax;
      w.enqueue(p.id, { t: 'use_item', item: 'elixir_of_gloamfire' }); run(w, 22);
      w.enqueue(p.id, { t: 'use_item', item: 'elixir_of_the_long_watch' }); run(w, 22);
      assert(p.auras.some((a) => a.id === 'prof_battle') && p.auras.some((a) => a.id === 'prof_guardian'), 'battle + guardian');
      assert(p.hpMax > hp0, `guardian: more health ${p.hpMax} > ${hp0}`);
      w.enqueue(p.id, { t: 'use_item', item: 'elixir_of_the_ram' }); run(w, 22);
      eq(p.auras.filter((a) => a.id === 'prof_battle').length, 1, 'one battle elixir at a time');
      eq(p.auras.find((a) => a.id === 'prof_battle').def.name, 'The Ram', 'the new one replaces the old');
      w.enqueue(p.id, { t: 'use_item', item: 'flask_of_the_last_lamp' }); run(w, 22);
      assert(p.auras.some((a) => a.id === 'prof_flask') && !p.auras.some((a) => a.id === 'prof_battle' || a.id === 'prof_guardian'), 'the flask replaces both');
      // death: the flask comes back when the hero is up again
      w.internals.combat.kill(p, null);
      assert(!p.auras.some((a) => a.id === 'prof_flask'), 'gone while dead');
      p.dead = false; p.hp = p.hpMax;
      run(w, 25);
      assert(p.auras.some((a) => a.id === 'prof_flask'), 'back after death');
      // food: not in combat
      p.inCombat = true;
      w.enqueue(p.id, { t: 'use_item', item: 'valley_stew' });
      assert(ofType(run(w, 1), 'inventory_fail').some((e) => e.reason === 'combat'), 'not in combat');
      p.inCombat = false; p.lastCombat = -99999;
      w.enqueue(p.id, { t: 'use_item', item: 'valley_stew' }); run(w, 1);
      assert(p.auras.some((a) => a.id === 'prof_food') && p.sitting, 'Well Fed, sitting to eat');
      // bandage: works in combat, heals 25% over 6 s, its own 60 s cooldown (not the potion one)
      p.hp = Math.round(p.hpMax * 0.4); p.inCombat = true; p.sitting = 0;
      const h0 = p.hp;
      w.enqueue(p.id, { t: 'use_item', item: 'mallow_poultice' }); run(w, 6 * 20 + 2);
      const gained = (p.hp - h0) / p.hpMax;
      assert(gained > 0.2 && gained < 0.33, `about 25% over 6 s (${gained.toFixed(3)})`);
      w.enqueue(p.id, { t: 'use_item', item: 'mallow_poultice' });
      assert(ofType(run(w, 1), 'inventory_fail').some((e) => e.reason === 'cooldown'), 'bandage cooldown');
      assert(!(p.cd['item:potion'] > w.tick), 'the potion cooldown is free');
    },
  },
  {
    name: 'Patterns: a world Pattern teaches its recipe (profession and skill needed); bosses drop their Patterns and materials; beasts drop meat',
    fn() {
      const w = world(17);
      const p = hero(w, { level: 12 });
      p.bag.push({ item: 'pattern_gatewright_sword', qty: 1, uid: 700 });
      w.enqueue(p.id, { t: 'use_item', item: 'pattern_gatewright_sword' });
      assert(ofType(run(w, 1), 'inventory_fail').some((e) => e.reason === 'unknown_prof'), 'needs Smithing');
      learn(w, p, 'smithing', 'garrick');
      w.enqueue(p.id, { t: 'use_item', item: 'pattern_gatewright_sword' });
      assert(ofType(run(w, 1), 'inventory_fail').some((e) => e.reason === 'skill'), 'needs Smithing 52');
      giveSkill(p, 'smithing', 60, 2);
      w.enqueue(p.id, { t: 'use_item', item: 'pattern_gatewright_sword' }); run(w, 1);
      assert(p.prof.recipes.includes('gatewright_sword') && !count(p, 'pattern_gatewright_sword'), 'learned, the Pattern used');
      // drops: a boss of the Barrow, many kills
      const PF = w.internals.prof;
      let pats = 0, mats = 0, meat = 0;
      for (let i = 0; i < 400; i++) {
        const drop = { gold: 0, items: [] };
        PF.extraLoot({ template: 'barrow_reeve', zone: 'barrow#1', level: 12 }, p, drop);
        pats += drop.items.filter((x) => /^pattern_/.test(x.item)).length;
        mats += drop.items.filter((x) => x.item === 'tally_iron' || x.item === 'undying_wick').length;
        const d2 = { gold: 0, items: [] };
        PF.extraLoot({ template: 'fold_ram', zone: 'world', level: 12 }, p, d2);
        meat += d2.items.filter((x) => x.item === 'downs_mutton').length;
      }
      assert(pats > 20 && pats < 80, `boss Patterns ${pats} / 400`);
      assert(mats > 300, `boss materials ${mats}`);
      assert(meat > 120 && meat < 240, `mutton ${meat} / 400`);
    },
  },
  {
    name: 'save: the prof field round-trips (skills, recipes, a flask); an old save without it loads; restoreWorld keeps nodes and the stream',
    fn() {
      const w = world(18);
      const p = hero(w, { level: 20 });
      learn(w, p, 'mining', 'garrick'); learn(w, p, 'smithing', 'garrick');
      giveSkill(p, 'mining', 47, 2);
      p.bag.push({ item: 'flask_of_the_last_lamp', qty: 1, uid: 800 });
      w.enqueue(p.id, { t: 'use_item', item: 'flask_of_the_last_lamp' }); run(w, 2);
      const save = JSON.parse(JSON.stringify(w.saveFields(p.id)));
      assert(save.prof && save.prof.skills.mining.v === 47 && save.prof.recipes.includes('smelt_tin') && save.prof.flask.left > 0, 'saved');
      const w2 = world(19);
      const id2 = w2.addPlayer({ name: 'Ash', cls: 'warden', level: 20, ...save });
      const q = w2.get(id2);
      eq(q.prof.skills.mining.v, 47, 'skill back'); eq(q.prof.skills.mining.rank, 2, 'rank back');
      assert(q.auras.some((a) => a.id === 'prof_flask'), 'flask back');
      // an old save: no prof at all
      const id3 = w2.addPlayer({ name: 'Old', cls: 'mender', level: 5 });
      const o = w2.get(id3);
      eq(w2.saveFields(id3).prof, undefined, 'nothing saved for a hero with no profession');
      assert(!o.prof || !Object.keys(o.prof.skills || {}).length, 'no professions');
      // a malformed save drops quietly
      const id4 = w2.addPlayer({ name: 'Bad', cls: 'warden', prof: { skills: { nonsense: { v: 9 }, mining: { v: 500, rank: 1 } }, recipes: ['no_such', 'smelt_tin'] } });
      const b = w2.get(id4);
      eq(b.prof.skills.mining.v, 30, 'clamped to the Novice cap'); assert(!b.prof.skills.nonsense, 'unknown dropped'); eq(b.prof.recipes.join(), '', 'smelt_tin needs Smithing');
      // world round trip: nodes, pending respawns and the profession stream
      const t = nodes(w, (e) => e.node.gather.node === 'tin_vein')[0];
      standBy(p, t); w.enqueue(p.id, { t: 'interact', id: t.id }); run(w, 45);
      const r = restoreWorld(w.serialize(), content());
      eq(r.hash(), w.hash(), 'restored hash');
      run(w, 300); for (let i = 0; i < 300; i++) r.step();
      eq(r.hash(), w.hash(), 'same after 15 s more');
    },
  },
  {
    name: 'online co-op: a guest gathers and crafts through the host sim; the guest frame carries the gather bar and the node',
    fn() {
      const w = world(20);
      const host = hero(w), guest = hero(w);
      w.setParty(host.id, host.id); w.setParty(guest.id, host.id);
      const tx = framesFor(guest.id), rx = createFrameState(guest.id);
      let snap = null;
      const tick = (n) => { for (let i = 0; i < n; i++) { const ev = w.step(); snap = applyFrame(rx, JSON.parse(JSON.stringify(tx.frame(w.snapshot(), ev, createTickCache())))); } };
      tick(1);
      const g = npcEnt(w, 'garrick'); standBy(guest, g);
      w.enqueue(guest.id, { t: 'prof_train', npc: g.id, prof: 'mining' }); tick(1);
      const t = snap.entities.find((e) => e.kind === 'object' && e.node && e.node.gather && e.node.gather.node === 'tin_vein');
      assert(t && t.node.gather.skill === 1, 'the guest sees the node and its skill');
      standBy(guest, w.get(t.id));
      w.enqueue(guest.id, { t: 'interact', id: t.id }); tick(10);
      assert(snap.hud[guest.id].prof.work && snap.hud[guest.id].prof.work.kind === 'gather', 'the gather bar on the guest');
      assert(snap.entities.find((e) => e.id === guest.id).work, 'the guest hero shows as working');
      tick(35);
      assert(count(guest, 'tin_ore') > 0, 'the guest got ore');
      eq(snap.hud[guest.id].prof.skills.mining.v, 2, 'the guest HUD has the skill');
    },
  },
];
void RANKS; void NODE_KINDS;

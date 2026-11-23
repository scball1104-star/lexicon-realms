// Professions, build step 2 (src/data/professions2.js, src/sim/professions.js): the new data (counts, trainers in
// Willowmere, bags, glyph letters, boss Patterns in every dungeon and cave), Skinning a dead beast, Tailoring a bag
// that adds bag slots, Inscription's glyph to order, Fishing at water by area, the cloth and 20 to 30 meat drops, and
// the save of the new skills.
import { assert, eq } from './_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { RECIPES_BY_PROF, RECIPES } from '../../src/data/professions.js';
import { PROF_NPC_SPOTS2, VOWEL_LETTERS, COMMON_LETTERS, RARE_LETTERS } from '../../src/data/professions2.js';
import { bagCapacity } from '../../src/sim/loot.js';

let _C = null;
const content = () => _C || (_C = buildContent());
const world = (seed = 5) => createWorld({ seed, content: content() });
const run = (w, n) => { const all = []; for (let i = 0; i < n; i++) all.push(...w.step()); return all; };
const ofType = (evs, t) => evs.filter((e) => e.type === t);
const npc = (w, t) => w.state.ents.find((e) => e.kind === 'npc' && e.template === t);
const count = (p, item) => [...(p.bag || []), ...(p.gbag || [])].filter((s) => s.item === item).reduce((n, s) => n + s.qty, 0);
function hero(w, opts = {}) { return w.get(w.addPlayer({ name: 'Ash', cls: opts.cls || 'wayfinder', level: opts.level || 10, gold: opts.gold ?? 2000 })); }
function standBy(p, e) { p.x = e.x - 10 * 16; p.y = e.y; }
function learn(w, p, prof, at) { const n = npc(w, at); standBy(p, n); w.enqueue(p.id, { t: 'prof_train', npc: n.id, prof }); return run(w, 1); }
function corpse(w, p, template, level) {
  const m = w.state.ents.find((e) => e.kind === 'mob' && e.template === template && !e.dead);
  m.dead = true; m.hp = 0; m.level = level; m.respawnAt = w.tick + 20 * 600;
  p.x = m.x - 10 * 16; p.y = m.y;
  return m;
}

export const tests = [
  {
    name: 'data: the five new professions, four trainers standing in Willowmere selling their reagents, bags, every letter to order, boss Patterns in all five places',
    fn() {
      const C = content(), P = C.professions;
      for (const id of ['skinning', 'leatherwork', 'tailoring', 'inscription', 'fishing']) assert(P.list[id], id);
      assert(!P.list.fishing.primary && P.list.skinning.primary, 'Fishing is secondary, Skinning primary');
      const w = world();
      for (const s of PROF_NPC_SPOTS2) {
        const n = npc(w, s.npc);
        assert(n && n.zone === 'world', `${s.npc} stands in the world`);
        const tx = Math.floor(n.x / 256), ty = Math.floor((n.y - 1) / 256);
        assert(C.zones.world.collision[ty][tx] === '.', `${s.npc} on a walkable tile`);
        const R = C.zones.world.regions.find((r) => r.id === 'willowmere');
        assert(tx >= R.x && tx < R.x + R.w && ty >= R.y && ty < R.y + R.h, `${s.npc} in Willowmere`);
      }
      for (const [n, it] of [['hesper', 'tanners_salt'], ['hesper', 'coarse_thread'], ['maudie', 'fine_thread']]) assert(C.npcs[n].vendor.items.some((s) => s.item === it), `${n} sells ${it}`);
      const bags = Object.values(C.items).filter((i) => i.kind === 'bag' && /^pi_/.test(i.icon));
      assert(bags.length >= 9 && bags.every((b) => b.bagSlots >= 6), 'crafted bags and quivers');
      eq([VOWEL_LETTERS, COMMON_LETTERS, RARE_LETTERS].join('').split('').sort().join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'all 26 letters to order');
      for (const r of Object.values(RECIPES)) assert(r.skill <= 150, `${r.id} skill`);
      for (const prof of Object.keys(RECIPES_BY_PROF)) if (P.list[prof].kind === 'craft') assert(Math.max(...RECIPES_BY_PROF[prof].map((r) => r.skill)) >= 100, `${prof} reaches the 20 to 30 band`);
      for (const d of ['barrow', 'watchtower', 'rootcellar', 'smugglers_cut', 'tarn_hollow']) {
        const bd = P.bossDrops[d];
        assert(bd && bd.patterns.length, `${d} drops Patterns`);
        for (const r of bd.patterns) assert(C.items[`pattern_${r}`] && RECIPES[r].source === `boss:${d}`, `${d}: ${r}`);
      }
      eq(P.bossDrops.barrow.patterns.map((r) => RECIPES[r].prof).sort().join(), 'alchemy,inscription,leatherwork,smithing,tailoring', 'the Barrow: one per craft');
    },
  },
  {
    name: 'Skinning: a dead beast, not a slime; needs the skill for its level; a 2 s cast gives hide (vellum sometimes) and skill; once per corpse',
    fn() {
      const w = world(7), p = hero(w);
      const C = content(), PF = w.internals.prof;
      const wolf = corpse(w, p, 'briar_wolf', 4);
      w.enqueue(p.id, { t: 'interact', id: wolf.id });
      assert(ofType(run(w, 1), 'prof_fail').some((e) => e.reason === 'unknown_prof'), 'needs Skinning');
      learn(w, p, 'skinning', 'hesper');
      eq(p.prof.skills.skinning.v, 1, 'Novice skinner');
      assert(w.snapshot().entities.find((e) => e.id === wolf.id).skin, 'the corpse shows as skinnable');
      p.x = wolf.x - 10 * 16; p.y = wolf.y;
      w.enqueue(p.id, { t: 'interact', id: wolf.id });
      let ev = run(w, 1);
      assert(ofType(ev, 'prof_work').some((e) => e.phase === 'start'), 'the cast starts');
      ev = run(w, 42);
      assert(count(p, 'ragged_hide') >= 1, 'a ragged hide');
      eq(p.prof.skills.skinning.v, 2, '+1 skill');
      assert(!w.snapshot().entities.find((e) => e.id === wolf.id).skin, 'skinned: no longer shown');
      w.enqueue(p.id, { t: 'interact', id: wolf.id });
      assert(ofType(run(w, 1), 'prof_fail').some((e) => e.reason === 'empty'), 'once per corpse');
      // a mist wolf (level 16) needs Skinning 60
      const mist = corpse(w, p, 'mist_wolf', 16);
      w.enqueue(p.id, { t: 'interact', id: mist.id });
      assert(ofType(run(w, 1), 'prof_fail').some((e) => e.reason === 'skill' && e.need === 60), 'Needs Skinning 60');
      eq(PF.skinOf(mist).item, 'mist_hide', 'a mist hide');
      // an ink slime (an ooze) has no hide; a spirit neither
      assert(!PF.skinOf({ kind: 'mob', template: 'ink_slime', level: 3 }) && !PF.skinOf({ kind: 'mob', template: 'barrow_shade', level: 11 }), 'no hide on oozes or spirits');
      // the skinned list clears once the foe is up again
      wolf.dead = false; run(w, 21);
      assert(!(w.state.prof.skinned || []).includes(wolf.id), 'forgotten once alive');
      void C;
    },
  },
  {
    name: 'Leatherwork and Tailoring: cure leather, sew a bag, wear it: six more bag slots',
    fn() {
      const w = world(8), p = hero(w);
      learn(w, p, 'leatherwork', 'hesper'); learn(w, p, 'tailoring', 'maudie');
      assert(p.prof.recipes.includes('cure_light_leather') && p.prof.recipes.includes('linen_bolt'), 'the free recipes');
      p.bag.push({ item: 'ragged_hide', qty: 4, uid: 901 }, { item: 'tanners_salt', qty: 2, uid: 902 });
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'cure_light_leather', qty: 2 }); run(w, 70);
      eq(count(p, 'light_leather'), 2, 'two Light Leather');
      // the bag: Bolt of Linen x3 + thread at Tailoring 12 (bought from Maudie)
      p.prof.skills.tailoring.v = 12;
      const m = npc(w, 'maudie'); standBy(p, m);
      w.enqueue(p.id, { t: 'prof_recipe', npc: m.id, recipe: 'linen_pouch' }); run(w, 1);
      assert(p.prof.recipes.includes('linen_pouch'), 'learned the pouch');
      p.bag.push({ item: 'linen_rag', qty: 6, uid: 903 }, { item: 'coarse_thread', qty: 1, uid: 904 });
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'linen_bolt', qty: 3 }); run(w, 100);
      eq(count(p, 'linen_bolt'), 3, 'three bolts');
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'linen_pouch', qty: 1 }); run(w, 40);
      eq(count(p, 'linen_pouch'), 1, 'a Linen Pouch');
      const cap = bagCapacity(p, content());
      const slot = p.bag.find((s) => s.item === 'linen_pouch');
      w.enqueue(p.id, { t: 'equip', uid: slot.uid }); run(w, 1);
      eq(bagCapacity(p, content()), cap + 6, 'six more slots');
    },
  },
  {
    name: 'Inscription: ink from herbs, paper from vellum, and a glyph made to order (the letter you name) into the pouch',
    fn() {
      const w = world(9), p = hero(w);
      learn(w, p, 'inscription', 'corwen');
      p.prof.skills.inscription = { v: 60, rank: 2 };
      p.prof.recipes.push('glyph_vowel', 'mallow_ink');
      p.bag.push({ item: 'hedge_mallow', qty: 4, uid: 911 }, { item: 'vellum_scrap', qty: 4, uid: 912 });
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'mallow_ink', qty: 2 }); run(w, 70);
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'vellum_sheet', qty: 2 }); run(w, 70);
      eq(count(p, 'mallow_ink'), 2, 'ink'); eq(count(p, 'vellum_sheet'), 2, 'paper');
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'glyph_vowel', qty: 1, letter: 'K' });
      assert(ofType(run(w, 1), 'prof_fail').some((e) => e.reason === 'bad_letter'), 'K is not a vowel');
      w.enqueue(p.id, { t: 'prof_craft', recipe: 'glyph_vowel', qty: 1, letter: 'E' });
      const h = (() => { run(w, 1); return w.snapshot().hud[p.id].prof.work; })();
      assert(h && /Glyph of E/.test(h.label), `the bar names the letter ${h && h.label}`);
      run(w, 40);
      eq(count(p, 'glyph_e'), 1, 'a Glyph of E in the pouch');
      eq(p.bag.filter((s) => s.item === 'glyph_e').length, 0, 'no bag slot');
    },
  },
  {
    name: 'Fishing: cast at water by the angler, a catch from Willowmere\'s table and skill; no water, no cast; the Moor\'s fish get away at low skill',
    fn() {
      const w = world(10), p = hero(w);
      const PF = w.internals.prof;
      learn(w, p, 'fishing', 'old_fen');
      eq(p.prof.skills.fishing.v, 1, 'Novice angler');
      const fen = npc(w, 'old_fen');
      p.x = fen.x; p.y = fen.y;
      assert(PF.waterNear(p), 'water in reach of Old Fen');
      eq(PF.fishArea(p).id, 'willowmere', 'Willowmere\'s table');
      let caught = 0;
      for (let i = 0; i < 6; i++) {
        w.enqueue(p.id, { t: 'prof_fish' });
        const ev = run(w, 210);
        caught += ofType(ev, 'loot').filter((e) => e.fish).length;
      }
      eq(caught, 6, 'six casts, six fish');
      assert(count(p, 'brook_minnow') + count(p, 'willow_trout') + count(p, 'lantern_carp') === 6, 'from the table');
      eq(p.prof.skills.fishing.v, 7, 'orange: +1 each');
      // a hit stops the cast
      w.enqueue(p.id, { t: 'prof_fish' }); run(w, 5);
      p.hp -= 5; const ev2 = run(w, 2);
      assert(ofType(ev2, 'prof_work').some((e) => e.phase === 'stop' && e.reason === 'interrupt'), 'a hit stops it');
      // the middle of Willowmere square: no water
      const garrick = npc(w, 'garrick'); p.x = garrick.x; p.y = garrick.y;
      w.enqueue(p.id, { t: 'prof_fish' });
      assert(ofType(run(w, 1), 'prof_fail').some((e) => e.reason === 'no_water'), 'no water');
      // the Moor's table needs 60: at 7 most get away
      const Z = content().zones.world, R = Z.regions.find((r) => r.id === 'moor');
      let spot = null;
      for (let y = R.y + 2; y < R.y + R.h - 2 && !spot; y++) for (let x = R.x + 2; x < R.x + R.w - 2 && !spot; x++) if (Z.collision[y][x] === '.' && Z.collision[y][x + 1] === '~') spot = [x, y];
      for (const m of w.state.ents) if (m.kind === 'mob') { m.dead = true; m.respawnAt = 1e9; m.threat = {}; }
      p.inCombat = false; p.hp = p.hpMax;
      p.x = spot[0] * 256 + 128; p.y = (spot[1] + 1) * 256 - 16;
      eq(PF.fishArea(p).id, 'moor', 'the Moor');
      let away = 0, got = 0;
      for (let i = 0; i < 12; i++) { w.enqueue(p.id, { t: 'prof_fish' }); const ev = run(w, 210); away += ofType(ev, 'prof_fail').filter((e) => e.reason === 'got_away').length; got += ofType(ev, 'loot').filter((e) => e.fish).length; }
      assert(away > 4 && away + got === 12, `got away ${away}, caught ${got}`);
    },
  },
  {
    name: 'drops: cloth from spirits and oozes (about 1 in 4, by level), none from beasts; meat from 20 to 30 beasts that have none of their own',
    fn() {
      const w = world(11), p = hero(w, { level: 12 });
      const PF = w.internals.prof;
      let grave = 0, rag = 0, wolfCloth = 0, venison = 0;
      for (let i = 0; i < 800; i++) {
        const d = { gold: 0, items: [] }; PF.extraLoot({ template: 'barrow_shade', zone: 'world', level: 11 }, p, d); grave += d.items.filter((x) => x.item === 'grave_linen').length;
        const d2 = { gold: 0, items: [] }; PF.extraLoot({ template: 'ink_blot', zone: 'world', level: 8 }, p, d2); rag += d2.items.filter((x) => x.item === 'grave_linen' || x.item === 'linen_rag').length;
        const d3 = { gold: 0, items: [] }; PF.extraLoot({ template: 'thornback_wolf', zone: 'world', level: 10 }, p, d3); wolfCloth += d3.items.filter((x) => /^(linen_rag|grave_linen|gloamsilk|lampsilk|emberweave)$/.test(x.item)).length;
        const d4 = { gold: 0, items: [] }; PF.extraLoot({ template: 'hollowfang', zone: 'world', level: 24 }, { ...p, level: 24 }, d4); venison += d4.items.filter((x) => x.item === 'lampback_venison').length;
      }
      assert(grave > 140 && grave < 260, `grave linen ${grave} / 800`);
      assert(rag > 140 && rag < 260, `ooze cloth ${rag} / 800`);
      eq(wolfCloth, 0, 'no cloth from a wolf');
      assert(venison > 240 && venison < 400, `venison ${venison} / 800`);
    },
  },
  {
    name: 'save: the new skills and recipes round-trip',
    fn() {
      const w = world(12), p = hero(w);
      learn(w, p, 'skinning', 'hesper'); learn(w, p, 'fishing', 'old_fen'); learn(w, p, 'inscription', 'corwen');
      const save = JSON.parse(JSON.stringify(w.saveFields(p.id)));
      const w2 = world(13);
      const q = w2.get(w2.addPlayer({ name: 'Ash', cls: 'wayfinder', level: 10, ...save }));
      for (const k of ['skinning', 'fishing', 'inscription']) eq(q.prof.skills[k].v, 1, k);
      assert(q.prof.recipes.includes('wayleaf_ink'), 'recipes');
    },
  },
];

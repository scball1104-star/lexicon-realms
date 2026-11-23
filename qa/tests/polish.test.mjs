// Polish lane (2026-11-22): the Rootbound starter's way into the valley chain, elixirs and food in flat points, random
// legendaries from world rares and bosses, rare minor powers, the weapon affixes that act in a fight (Gleaming, of
// Leeching, of Embers), and the humanoid family that runs at low health.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { createRng } from '../../src/sim/rng.js';
import { rollGear, resolveItem } from '../../src/sim/loot.js';
import { gearEffects, rollMinor } from '../../src/sim/affixes.js';
import { createLegendDrops } from '../../src/sim/legend_drops.js';
import { MINOR_POWERS } from '../../src/data/legendary_powers.js';
import { MOB_RULES } from '../../src/sim/mob_rules.js';

const C = buildContent();
const run = (w, n) => { const all = []; for (let i = 0; i < n; i++) all.push(...w.step()); return all; };
const TILE = 256;
const noEmDash = (s) => !String(s).includes('\u2014');

function hero(w, spec = {}) {
  const st = C.start;
  const id = w.addPlayer({ name: spec.name || 'Pol', cls: spec.cls || 'warden', x: st.x, y: st.y, level: spec.level || 10, ...spec });
  w.step();
  return w.get(id);
}
function foeNear(w, p, tpl) {
  const m = w.state.ents.find((e) => e.kind === 'mob' && e.template === tpl && !e.dead && !(e.spawn && e.spawn.copy));
  assert(m, `a ${tpl}`);
  m.zone = p.zone; m.x = p.x + TILE * 2; m.y = p.y; m.spawn.x = m.x; m.spawn.y = m.y;
  return m;
}

export const tests = [
  // ---------------------------------------------------------------- 1. the Rootbound starter and Hob's first quest
  {
    name: 'Rootbound start: the first quest pays as Hob\'s does; Up the Root Stair stands for it (valley chain and board open, no double pay)',
    fn() {
      const hob = C.quests.wm_name_twice, rb = C.quests.rb_speak_and_be_kept;
      eq(rb.rewards.gold, hob.rewards.gold, 'same first gold'); eq(rb.rewards.xp, hob.rewards.xp, 'same first XP');
      eq(rb.level, hob.level, 'same level');
      const w = createWorld({ seed: 5, content: C });
      const p = hero(w, { cls: 'scribe', level: 6 });
      const QS = w.quests;
      // a level-6 hero up from the roots: Hob's quest is a grey mark, so the chain behind it would stay shut
      eq(QS.status(p, 'wm_yard_slimes'), 'locked', 'before: the valley chain is shut behind Hob');
      p.questsDone.push(...Object.keys(C.quests).filter((id) => id.startsWith('rb_') && id !== 'rb_up_the_root_stair'));
      eq(QS.status(p, 'wm_name_twice'), 'available');
      p.questsDone.push('rb_up_the_root_stair');
      eq(QS.status(p, 'wm_name_twice'), 'done', 'the root stair stands for Hob\'s quest');
      eq(QS.status(p, 'wm_yard_slimes'), 'available', 'the valley chain is open');
      assert(!QS.offersAt(p, 'hob').offers.includes('wm_name_twice'), 'Hob does not offer it again');
      const board = Object.values(C.quests).filter((q) => q.bounty && q.bounty.board === 'willowmere' && (q.requires.quests || []).includes('wm_name_twice'));
      assert(board.length > 0, 'the Willowmere board quests need Hob\'s quest');
      assert(board.every((q) => QS.status(p, q.id) !== 'locked' || !QS.bountiesToday().includes(q.id)), 'the board is open for the Rootbound hero');
      // a Willowmere starter is untouched
      const w2 = createWorld({ seed: 5, content: C });
      const q = hero(w2, { cls: 'warden', level: 1 });
      eq(w2.quests.status(q, 'wm_name_twice'), 'available');
      eq(w2.quests.status(q, 'wm_yard_slimes'), 'locked');
    },
  },
  {
    name: 'Rootbound start: a hero holding Hob\'s quest when the root stair is turned in can still hand it in',
    fn() {
      const w = createWorld({ seed: 6, content: C });
      const p = hero(w, { cls: 'scribe', level: 6 });
      const QS = w.quests;
      p.quests.wm_name_twice = { state: 'ready', counts: [1] };
      p.questsDone.push('rb_up_the_root_stair');
      eq(QS.status(p, 'wm_name_twice'), 'ready', 'an active quest keeps its state');
    },
  },
  // ---------------------------------------------------------------- 2. elixirs and food in flat points
  {
    name: 'consumables: battle elixirs, damage flasks and Well Fed give flat main stat and Stamina by tier; guardian, whetstone keep shares',
    fn() {
      const it = C.items;
      const mods = (id) => it[id].use.aura.mods;
      const main = (id) => (mods(id).find((m) => m.stat === 'main') || {}).add || 0;
      eq(main('elixir_small_courage'), 2); eq(main('elixir_of_the_ram'), 4); eq(main('elixir_of_gloamfire'), 6); eq(main('elixir_of_inkthorn'), 8);
      eq(main('flask_of_the_last_lamp'), 8); eq(main('flask_of_the_lantern'), 10);
      assert(mods('elixir_of_fold_stone').some((m) => m.stat === 'maxHp' && m.mul > 1), 'guardian keeps health %');
      assert(mods('rough_whetstone').some((m) => m.stat === 'weaponMul'), 'whetstone keeps weapon %');
      for (const id of Object.keys(it).filter((k) => it[k].use && it[k].use.aura && it[k].use.aura.id === 'prof_food')) {
        for (const m of mods(id)) assert((m.stat === 'sta' || m.stat === 'main') && Number.isInteger(m.add) && !m.mul, `${id}: flat`);
        assert(it[id].use.aura.recalc, `${id}: recalc`);
      }
      eq((mods('watchmans_breakfast').find((m) => m.stat === 'sta') || {}).add, 3, 'top food +3 Stamina');
      eq((mods('watchmans_breakfast').find((m) => m.stat === 'main') || {}).add, 3, 'top food +3 main stat');
      for (const id of ['elixir_of_inkthorn', 'flask_of_the_lantern', 'watchmans_breakfast']) assert(noEmDash(it[id].text), 'no em dash');
      // in the sim: the hero's own main stat goes up by the points and back down when the buff ends
      const w = createWorld({ seed: 8, content: C });
      for (const [cls, k] of [['warden', 'str'], ['scribe', 'int'], ['wayfinder', 'agi']]) {
        const p = hero(w, { cls, level: 20, name: cls });
        const s0 = p.stats[k], sta0 = p.stats.sta, hp0 = p.hpMax;
        p.bag.push({ item: 'elixir_of_inkthorn', qty: 1, uid: 900 }, { item: 'watchmans_breakfast', qty: 1, uid: 901 });
        w.enqueue(p.id, { t: 'use_item', item: 'elixir_of_inkthorn' }); run(w, 22);
        eq(p.stats[k], s0 + 8, `${cls}: +8 ${k}`);
        p.inCombat = false; p.lastCombat = -99999;
        w.enqueue(p.id, { t: 'use_item', item: 'watchmans_breakfast' }); run(w, 2);
        eq(p.stats.sta, sta0 + 3, `${cls}: Well Fed +3 Stamina`); eq(p.stats[k], s0 + 11, `${cls}: +3 more ${k}`);
        assert(p.hpMax > hp0, 'more Stamina, more health');
        for (const a of [...p.auras]) if (a.id === 'prof_battle' || a.id === 'prof_food') w.internals.combat.removeAura(p, a, 'expire');
        eq(p.stats[k], s0, `${cls}: back to ${s0}`); eq(p.stats.sta, sta0, 'Stamina back');
      }
    },
  },
  // ---------------------------------------------------------------- 3. random legendaries and minor powers
  {
    name: 'legendaries: world rares and lesser bosses roll a small, data-driven chance; never a last boss with its own roll, a low or a grey foe',
    fn() {
      const R = C.rarity.legendary.random;
      assert(R && R.rare > 0 && R.rare <= 0.05 && R.boss > 0 && R.boss <= 0.05, 'low chances');
      const evs = [];
      const state = {};
      const LD = createLegendDrops({ content: C, rng: createRng(77), state, emit: (e) => evs.push(e) });
      eq(LD.sourceOf({ template: 'barrow_reeve' }), null, 'the Barrow\'s last boss keeps its own roll');
      eq(LD.sourceOf({ template: 'barrow_bellwether' }), 'boss', 'a lesser boss');
      const rareId = Object.keys(C.rares).find((id) => C.rares[id].level >= 10);
      assert(rareId, 'a world rare of level 10 or more');
      eq(LD.sourceOf({ template: rareId }), 'rare');
      eq(LD.sourceOf({ template: 'thornback_wolf' }), null, 'an ordinary foe never');
      const p = { kind: 'player', id: 1, cls: 'mender', level: 12 };
      let n = 0;
      for (let i = 0; i < 4000; i++) {
        const drop = { items: [] };
        LD.onKill({ template: rareId, level: 12 }, p, drop);
        n += drop.items.length;
        for (const d of drop.items) { eq(C.items[d.item].rarity, 'legendary'); assert(C.items[d.item].level <= 12 + R.ilvlOver, 'in reach of the foe\'s level'); }
      }
      assert(n > 40 && n < 130, `about 2% of 4000: ${n}`);
      assert(evs.length === n && evs.every((e) => e.type === 'legendary' && e.source === 'rare'), 'a legendary event each');
      assert(state.legendRng != null, 'its own stream, saved in the state');
      const low = { items: [] };
      for (let i = 0; i < 500; i++) LD.onKill({ template: 'rb_archivore', level: 6 }, { ...p, level: 6 }, low);
      eq(low.items.length, 0, 'never below level 10');
      const grey = { items: [] };
      for (let i = 0; i < 500; i++) LD.onKill({ template: rareId, level: 12 }, { ...p, level: 18 }, grey);
      eq(grey.items.length, 0, 'never from a grey foe');
      // the same seed gives the same drops
      const a = createLegendDrops({ content: C, rng: createRng(5), state: {}, emit() {} }), b = createLegendDrops({ content: C, rng: createRng(5), state: {}, emit() {} });
      const seq = (L) => { const out = []; for (let i = 0; i < 2000; i++) { const d = { items: [] }; L.onKill({ template: rareId, level: 14 }, p, d); out.push(d.items.map((x) => x.item).join()); } return out.join('|'); };
      eq(seq(a), seq(b), 'deterministic');
    },
  },
  {
    name: 'legendaries: a world rare kill in the sim can drop one (hooked after the dungeon drops)',
    fn() {
      const rareId = Object.keys(C.rares).find((id) => C.rares[id].level >= 10);
      const C2 = { ...C, rarity: { ...C.rarity, legendary: { ...C.rarity.legendary, random: { ...C.rarity.legendary.random, rare: 1 } } } };
      const w = createWorld({ seed: 21, content: C2 });
      const p = hero(w, { cls: 'warden', level: C.rares[rareId].level });
      const m = w.state.ents.find((e) => e.kind === 'mob' && e.template === rareId);
      assert(m, 'the rare is up');
      m.tagger = p.id; m.zone = p.zone; m.x = p.x + 300; m.y = p.y;
      w.internals.combat.kill(m, p);
      const ev = run(w, 2);
      const got = [...(p.bag || []), ...(p.pendingLoot || []).flatMap((x) => x.items || [x])].some((s) => s && C.items[s.item] && C.items[s.item].rarity === 'legendary');
      assert(got || ev.some((e) => e.type === 'legendary'), 'a legendary came');
    },
  },
  {
    name: 'minor powers: rares and epics from item level 15 roll one about 1 in 10; the power shows on the tooltip and applies when worn',
    fn() {
      const rng = createRng(3);
      let n = 0;
      for (let i = 0; i < 3000; i++) if (rollMinor(C, rng, 'rare', 16)) n++;
      assert(n > 220 && n < 380, `about 10%: ${n}`);
      for (let i = 0; i < 300; i++) eq(rollMinor(C, rng, 'rare', 14), null, 'never under 15');
      for (let i = 0; i < 300; i++) eq(rollMinor(C, rng, 'magic', 20), null, 'never on a magic item');
      let g = null;
      for (let i = 0; i < 400 && !g; i++) { const x = rollGear({ content: C, rng }, { ilvl: 18, rarity: 'rare', cls: 'warden' }); if (x.inst.minor) g = x; }
      assert(g && MINOR_POWERS[g.inst.minor], 'a rare rolled a minor power');
      const r = resolveItem(C, g, 'warden');
      assert(r.text && r.text.includes(MINOR_POWERS[g.inst.minor].text), 'its tooltip line');
      for (const pw of Object.values(MINOR_POWERS)) assert(noEmDash(pw.text) && pw.text.startsWith('Minor power, '), pw.id);
      // worn: Keen Eye adds crit, Second Wind heals on a kill
      const w = createWorld({ seed: 9, content: C });
      const p = hero(w, { cls: 'warden', level: 18 });
      const c0 = w.internals.stats.mod(p, 'crit').add;
      p.equip.trinket = { item: 'gear_trinket', inst: { ilvl: 18, rarity: 'rare', affixes: [], minor: 'minor_keen_eye' } };
      w.internals.stats.recalc(p);
      eq(p.minors && p.minors[0], 'minor_keen_eye', 'listed as worn');
      assert(Math.abs(w.internals.stats.mod(p, 'crit').add - c0 - 0.01) < 1e-9, 'Keen Eye: +1% crit');
      p.equip.trinket = { item: 'gear_trinket', inst: { ilvl: 18, rarity: 'rare', affixes: [], minor: 'minor_second_wind' } };
      w.internals.stats.recalc(p);
      const m = foeNear(w, p, 'thornback_wolf');
      p.hp = Math.round(p.hpMax * 0.5);
      const h0 = p.hp;
      w.internals.combat.kill(m, p);
      assert(p.hp > h0, `Second Wind healed on the kill (${h0} -> ${p.hp})`);
    },
  },
  // ---------------------------------------------------------------- 4. affixes that act in a fight
  {
    name: 'affixes: Gleaming adds weapon damage, of Leeching heals on hits, of Embers deals fire on hit (never from a tick, never a chain)',
    fn() {
      const w = createWorld({ seed: 13, content: C });
      const p = hero(w, { cls: 'warden', level: 15 });
      const S = w.internals.stats, K = w.internals.combat;
      const sword = (affixes) => ({ item: 'gear_sword', inst: { ilvl: 15, rarity: 'rare', affixes } });
      p.equip.main = sword([]); S.recalc(p);
      const min0 = p.weapon.main.min, max0 = p.weapon.main.max;
      p.equip.main = sword([{ id: 'gleaming', value: 2 }]); S.recalc(p);
      assert(Math.abs(p.weapon.main.min - min0 - 2 * p.weapon.main.speed) < 1e-9 && Math.abs(p.weapon.main.max - max0 - 2 * p.weapon.main.speed) < 1e-9, 'Gleaming: +2 dps on the swing');
      const fx = gearEffects(C, { equip: { main: sword([{ id: 'of_leeching', value: 5 }, { id: 'of_embers', value: 4 }]) } });
      assert(Math.abs(fx.leech - 0.05) < 1e-9, 'of Leeching 5: 5%');
      eq(fx.onHit.length, 1); eq(fx.onHit[0].school, 'fire'); eq(fx.onHit[0].amount, 16, 'of Embers 4: 16 fire');
      // leech in the fight
      p.equip.main = sword([{ id: 'of_leeching', value: 6 }]); S.recalc(p);
      const m = foeNear(w, p, 'thornback_wolf');
      m.hp = m.hpMax = 100000;
      p.hp = Math.round(p.hpMax * 0.5);
      K.dealDamage(p, m, 200, { ability: 'warden_strike', school: 'physical', canCrit: false });
      assert(p.hp > Math.round(p.hpMax * 0.5), 'of Leeching healed the hero');
      // embers: chance 1 for the test; compare the same blow with the affix off
      p.equip.main = sword([{ id: 'of_embers', value: 5 }]); S.recalc(p);
      const always = () => { p.gearFx = { ...p.gearFx, onHit: p.gearFx.onHit.map((o) => ({ ...o, chance: 1 })) }; };
      always();
      const f0 = m.hp;
      K.dealDamage(p, m, 50, { ability: 'warden_strike', school: 'physical', canCrit: false });
      const lost = f0 - m.hp;
      assert(lost > 0, 'it hurt');
      p.gearFx = null;
      const f1 = m.hp;
      K.dealDamage(p, m, 50, { ability: 'warden_strike', school: 'physical', canCrit: false });
      const plain = f1 - m.hp;
      assert(lost > plain, `the ember added fire damage (${lost} > ${plain})`);
      assert(lost - plain <= 5 * 4 * 1.5, 'one ember hit, not a chain');
      // a periodic tick never triggers it
      S.recalc(p); always();
      const f2 = m.hp;
      K.dealDamage(p, m, 30, { ability: 'warden_strike', school: 'physical', canCrit: false, periodic: true });
      const tick = f2 - m.hp;
      p.gearFx = null;
      const f3 = m.hp;
      K.dealDamage(p, m, 30, { ability: 'warden_strike', school: 'physical', canCrit: false, periodic: true });
      eq(tick, f3 - m.hp, 'no embers from a tick');
    },
  },
  // ---------------------------------------------------------------- 5. humanoids run at low health
  {
    name: 'humanoids: a humanoid foe runs at the mob_rules share with its line; beasts keep their own rules (the Gorse Boar stands)',
    fn() {
      eq(MOB_RULES.flee.humanoid, 0.15);
      const beasts = Object.values(C.mobs).filter((t) => t.family === 'beast');
      assert(beasts.length > 5, 'beasts stay beasts');
      const mobs = { ...C.mobs, hum_test: { ...C.mobs.thornback_wolf, id: 'hum_test', name: 'Hedge Cutthroat', family: 'humanoid', flee: null, social: false } };
      const C2 = { ...C, mobs };
      const w = createWorld({ seed: 31, content: C2 });
      const p = hero(w, { cls: 'warden', level: 8 });
      const m = foeNear(w, p, 'thornback_wolf');
      m.template = 'hum_test'; w.internals.stats.recalc(m);
      eq(m.mob.family, 'humanoid');
      m.hp = Math.round(m.hpMax * 0.12);
      w.internals.combat.addThreat(m, p, 10); m.ai.mode = 'combat'; m.ai.target = p.id; m.target = p.id;
      const ev = run(w, 3);
      assert(ev.some((e) => e.type === 'flee' && e.id === m.id), 'the humanoid ran');
      assert(ev.some((e) => e.type === 'mob_emote' && /runs away in fear/.test(e.text)), 'with its line');
      // a beast with no flee of its own does not
      const w2 = createWorld({ seed: 31, content: C });
      const p2 = hero(w2, { cls: 'warden', level: 15 });
      const b = foeNear(w2, p2, 'gorse_boar');
      b.hp = Math.round(b.hpMax * 0.12);
      w2.internals.combat.addThreat(b, p2, 10); b.ai.mode = 'combat'; b.ai.target = p2.id; b.target = p2.id;
      assert(!run(w2, 3).some((e) => e.type === 'flee' && e.id === b.id), 'the Gorse Boar stands (stays tough)');
    },
  },
];

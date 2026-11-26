// Loot fixes (2026-11-26, Scott approved): the caps on gear leech and chance-on-hit, the total leech cap, tooltips that
// say what of Embers and of Leeching really do, elixirs in flat main stat for every class, the Rootbound Scribe's first
// gold, and the Ashen Crew as humanoids that run at low health (the wave raiders never do).
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { gearEffects, GEAR_LEECH_CAP, LEECH_TOTAL_CAP, GEAR_ONHIT_MAX } from '../../src/sim/affixes.js';
import { statLine } from '../../src/ui/menus.js';
import { MOB_RULES } from '../../src/sim/mob_rules.js';

const C = buildContent();
const run = (w, n) => { const all = []; for (let i = 0; i < n; i++) all.push(...w.step()); return all; };
const TILE = 256;
function hero(w, spec = {}) {
  const st = C.start;
  const id = w.addPlayer({ name: spec.name || 'Fix', cls: spec.cls || 'warden', x: st.x, y: st.y, level: spec.level || 10, ...spec });
  w.step();
  return w.get(id);
}
function foeNear(w, p, tpl) {
  const m = w.state.ents.find((e) => e.kind === 'mob' && e.template === tpl && !e.dead && !(e.spawn && e.spawn.copy));
  assert(m, `a ${tpl}`);
  m.zone = p.zone; m.x = p.x + TILE * 2; m.y = p.y; m.spawn.x = m.x; m.spawn.y = m.y;
  return m;
}
const weapon = (item, affixes) => ({ item, inst: { ilvl: 15, rarity: 'rare', affixes } });

export const tests = [
  {
    name: 'loot fixes: gear leech caps at 10%; only the strongest chance-on-hit fires (two of Embers weapons roll one)',
    fn() {
      eq(GEAR_LEECH_CAP, 0.1); eq(GEAR_ONHIT_MAX, 1); eq(LEECH_TOTAL_CAP, 0.3);
      const fx = gearEffects(C, { equip: { main: weapon('gear_dagger', [{ id: 'of_leeching', value: 9 }, { id: 'of_embers', value: 3 }]),
        off: weapon('gear_dagger', [{ id: 'of_leeching', value: 9 }, { id: 'of_embers', value: 6 }]) } });
      assert(Math.abs(fx.leech - 0.1) < 1e-9, `two of Leeching 9: capped at 10% (${fx.leech})`);
      eq(fx.onHit.length, 1, 'one Embers'); eq(fx.onHit[0].amount, 24, 'the stronger one (6 x 4)');
      const one = gearEffects(C, { equip: { main: weapon('gear_sword', [{ id: 'of_leeching', value: 5 }]) } });
      assert(Math.abs(one.leech - 0.05) < 1e-9, 'under the cap: unchanged');
    },
  },
  {
    name: 'loot fixes: all leech on one hit (talents plus gear) tops out at 30% of the damage',
    fn() {
      const w = createWorld({ seed: 21, content: C });
      const p = hero(w, { cls: 'warden', level: 15 });
      const S = w.internals.stats, K = w.internals.combat;
      p.equip.main = weapon('gear_sword', [{ id: 'of_leeching', value: 9 }]); S.recalc(p);
      K.applyAura(p, p, { id: 'qa_big_leech', name: 'Leech', icon: 'icon_regen', kind: 'buff', duration: 60, mods: [{ stat: 'leech', add: 0.6 }] }, {});
      const m = foeNear(w, p, 'thornback_wolf');
      m.hp = m.hpMax = 100000;
      p.hpMax = 100000; p.hp = 1000;
      const before = p.hp;
      const r = K.dealDamage(p, m, 1000, { ability: 'warden_strike', school: 'physical', canCrit: false });
      const dealt = 100000 - m.hp;
      assert(dealt > 0, 'it hit');
      const healed = p.hp - before;
      assert(healed > 0 && healed <= Math.ceil(dealt * 0.3) + 1, `healed ${healed} of ${dealt} dealt (cap 30%)`);
      void r;
    },
  },
  {
    name: 'loot fixes: tooltips say what of Embers and of Leeching do (chance, real fire damage, the cap); no em dashes',
    fn() {
      eq(statLine('fireOnHit', 4), 'Embers: 25% chance on a hit to deal 16 more fire damage');
      assert(/^\+5% Life Leech \(heal for that share of your direct hits; gear leech caps at 10%\)$/.test(statLine('leech', 5)), statLine('leech', 5));
      eq(statLine('str', 3), '+3 Strength');
      for (const s of [statLine('fireOnHit', 8), statLine('leech', 9)]) assert(!s.includes('\u2014'), 'no em dash');
    },
  },
  {
    name: 'loot fixes: a battle elixir adds flat points to the hero\'s own main stat for all five classes (no percent)',
    fn() {
      const it = C.items.elixir_of_inkthorn;
      const mods = ((it.use || it).aura || {}).mods || [];
      assert(mods.some((m) => m.stat === 'main' && m.add === 8) && !mods.some((m) => m.stat === 'main' && m.mul != null), 'Inkthorn: main +8, flat');
      const w = createWorld({ seed: 8, content: C });
      for (const [cls, k] of [['warden', 'str'], ['mender', 'int'], ['scribe', 'int'], ['wayfinder', 'agi'], ['inkblade', 'agi']]) {
        const p = hero(w, { cls, level: 20, name: cls });
        const s0 = p.stats[k];
        p.bag.push({ item: 'elixir_of_inkthorn', qty: 1, uid: 900 });
        w.enqueue(p.id, { t: 'use_item', item: 'elixir_of_inkthorn' }); run(w, 22);
        eq(p.stats[k], s0 + 8, `${cls}: +8 ${k}`);
      }
    },
  },
  {
    name: 'loot fixes: a Rootbound Scribe\'s first quest pays Hob\'s first gold, and turning it in gives that gold',
    fn() {
      const hob = C.quests.wm_name_twice, rb = C.quests.rb_speak_and_be_kept;
      assert(hob.rewards.gold > 0 && rb.rewards.gold === hob.rewards.gold, `same first gold (${rb.rewards.gold})`);
      const w = createWorld({ seed: 4, content: C });
      const p = hero(w, { cls: 'scribe', level: 1 });
      p.quests.rb_speak_and_be_kept = { state: 'ready', counts: (rb.objectives || []).map((o) => o.count || 1) };
      const g0 = p.gold || 0;
      w.quests.turnIn(p, 'rb_speak_and_be_kept');
      eq((p.gold || 0) - g0, rb.rewards.gold, 'the gold is paid');
    },
  },
  {
    name: 'loot fixes: the Ashen Crew are humanoids; a raider runs at 15% with its line, a gate wave raider never runs',
    fn() {
      for (const id of ['ep_raider', 'ep_firethrower', 'ep_gate_raider']) eq(C.mobs[id].family, 'humanoid', id);
      eq(C.mobs.ep_gate_raider.flee, 0, 'the wave raider: flee 0');
      const humanoids = Object.values(C.mobs).filter((t) => t.family === 'humanoid' && !t.elite && !t.boss && Math.min(...[].concat(t.level)) <= 10);
      assert(humanoids.length >= 4, `low-level humanoids that can run (${humanoids.length})`);
      const fight = (tpl) => {
        const w = createWorld({ seed: 31, content: C });
        const p = hero(w, { cls: 'warden', level: 8 });
        const m = foeNear(w, p, 'thornback_wolf');
        m.template = tpl; m.mob = { ...m.mob, family: C.mobs[tpl].family }; w.internals.stats.recalc(m);
        m.hp = Math.round(m.hpMax * (MOB_RULES.flee.humanoid - 0.03));
        w.internals.combat.addThreat(m, p, 10); m.ai.mode = 'combat'; m.ai.target = p.id; m.target = p.id;
        return { m, ev: run(w, 3) };
      };
      const a = fight('ep_raider');
      assert(a.ev.some((e) => e.type === 'flee' && e.id === a.m.id), 'the raider ran');
      const b = fight('ep_gate_raider');
      assert(!b.ev.some((e) => e.type === 'flee' && e.id === b.m.id), 'the wave raider stands');
    },
  },
];

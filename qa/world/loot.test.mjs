// Loot tables, gear rolls and item resolution (PROGRESSION 4 and 6).
import { assert, eq, content, ZONES } from './_harness.mjs';
import { createRng } from '../../src/sim/rng.js';
import { rollKill, rollGear, resolveItem, bagAdd, bagRemove, bagCount, itemName } from '../../src/sim/loot.js';
import { mobStats } from '../../src/data/mobs.js';

const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];

export const tests = [
  {
    name: 'loot tables: every item exists, chances in (0, 1], every quest drop belongs to a quest that collects it',
    fn() {
      const C = content();
      for (const [id, m] of Object.entries(C.mobs)) {
        assert(m.sprite && C.mobSprites[id], `${id} has a sprite in MOB_SPRITES`);
        assert(Array.isArray(m.loot.gold) && m.loot.gold[0] <= m.loot.gold[1], `${id} gold range`);
        if (m.loot.junk) eq(C.items[m.loot.junk] && C.items[m.loot.junk].kind, 'junk', `${id} junk ${m.loot.junk}`);
        for (const e of m.loot.table) {
          assert(C.items[e.item], `${id} drops unknown ${e.item}`);
          assert(e.chance > 0 && e.chance <= 1, `${id} ${e.item} chance`);
          if (e.quest) assert(C.quests[e.quest] && C.quests[e.quest].objectives.some((o) => o.kind === 'collect' && o.item === e.item), `${id}: ${e.item} for ${e.quest}, which does not collect it`);
        }
        for (const a of m.abilities) assert(C.mobAbilities[a.id], `${id} ability ${a.id}`);
      }
      // the elite: PROGRESSION 9.3 hp and its always-gear rule
      // the Watchtower's last boss since 2026-11-22: level 20, curve x elite 2.5 x armored 1.1 x BOSS_TUNE 0.6 (2670 on the open moor before)
      eq(mobStats('sentinel_long_watch', 20).hp, 1856, 'elite hp (the Watchtower dungeon, level 20)');
      eq(mobStats('briar_wolf', 15).hp, 835, 'curve L15 hp (the quadratic)');
      eq(mobStats('briar_wolf', 20).hp, 1125, 'curve L20 hp (linear past 15: 835 + 58 x 5, BUILDS_2 5.3)');
      eq(mobStats('ink_slime', 1).hp, 110, 'curve L1 hp (141 x 0.78, lowLevelHp fix pass 1)');
      eq(mobStats('briar_wolf', 8).hp, 458, 'curve L8 hp');
      const rng = createRng(5);
      for (let i = 0; i < 20; i++) {
        const d = rollKill({ content: C, rng, questNeeds: () => false }, { template: 'sentinel_long_watch', level: 14 }, { level: 14, cls: 'warden' });
        const gear = d.items.filter((x) => x.inst);
        eq(gear.length, 1, 'the elite always drops one piece');
        assert(['magic', 'rare'].includes(gear[0].inst.rarity), 'elite gear is magic or rare');
      }
    },
  },
  {
    name: 'loot rolls: deterministic for a seed; grey mobs give coin only; rarity weights near 70/25/5; affix counts and slots legal',
    fn() {
      const C = content();
      const run = (seed) => { const rng = createRng(seed); const out = []; for (let i = 0; i < 200; i++) out.push(rollKill({ content: C, rng, questNeeds: () => true }, { template: 'briar_wolf', level: 4 }, { level: 4, cls: 'inkblade' })); return JSON.stringify(out); };
      eq(run(9), run(9), 'same seed, same drops');
      const rng = createRng(2);
      for (let i = 0; i < 50; i++) eq(rollKill({ content: C, rng, questNeeds: () => true }, { template: 'ink_slime', level: 1 }, { level: 9, cls: 'warden' }).items.length, 0, 'grey: coin only');
      const n = { common: 0, magic: 0, rare: 0 };
      for (let i = 0; i < 4000; i++) {
        const g = rollGear({ content: C, rng }, { ilvl: 1 + (i % 15), source: 'normal', cls: CLASSES[i % 5] });
        const def = C.items[g.item];
        assert(def && def.base, `rolled ${g.item}`);
        n[g.inst.rarity]++;
        const R = C.rarity[g.inst.rarity];
        assert(g.inst.affixes.length >= R.affixes[0] || g.inst.rarity !== 'common', `${g.item} affixes`);
        assert(g.inst.affixes.length <= R.affixes[1], `${g.item} too many affixes`);
        for (const a of g.inst.affixes) assert(C.affixes[a.id].slots.includes(def.slot), `${a.id} on a ${def.slot}`);
        const pre = g.inst.affixes.filter((a) => C.affixes[a.id].kind === 'prefix').length;
        assert(pre <= R.prefixMax && g.inst.affixes.length - pre <= R.suffixMax, 'prefix / suffix caps');
        assert(itemName(C, g).length > 0, 'a name');
      }
      assert(Math.abs(n.common / 4000 - 0.7) < 0.04 && Math.abs(n.magic / 4000 - 0.25) < 0.04 && Math.abs(n.rare / 4000 - 0.05) < 0.02, `weights ${JSON.stringify(n)}`);
    },
  },
  {
    name: 'items: every reward, start item and vendor stock resolves for every class; armor and damage follow the formulas',
    fn() {
      const C = content();
      for (const [id, it] of Object.entries(C.items)) {
        for (const cls of CLASSES) {
          const r = resolveItem(C, { item: id, inst: it.base ? { ilvl: 8, rarity: 'magic', affixes: [] } : null }, cls);
          assert(r && r.name, `${id} resolves for ${cls}`);
          if (r.kind === 'armor' && r.slot !== 'trinket') assert(Number.isFinite(r.armor) && r.armor > 0 && typeof r.armorType === 'string', `${id} armor for ${cls}`);
          if (r.kind === 'weapon' && r.weaponType !== 'shield' && r.weaponType !== 'bell' && r.weaponType !== 'book') assert(r.damage && r.damage[1] > r.damage[0], `${id} damage`);
          assert(!('main' in r.stats), `${id}: main stat resolved`);
        }
      }
      // PROGRESSION 4.3 example: ilvl 8 sword, dps 9.0, damage [17, 26]
      const s = resolveItem(C, { item: 'gear_sword', inst: { ilvl: 8, rarity: 'common', affixes: [] } }, 'warden');
      eq(JSON.stringify(s.damage), '[17,26]', 'ilvl 8 sword');
      eq(resolveItem(C, 'flour_dusted_gloves', 'scribe').armorType, 'cloth', 'any armor rolls to class');
      eq(resolveItem(C, 'garricks_iron_rod', 'scribe').weaponType, 'quill', 'rod or quill by class');
      eq(resolveItem(C, 'register_ribbon', 'wayfinder').stats.agi, 3, '+3 main stat by class');
      for (const npc of Object.values(C.npcs)) for (const v of (npc.vendor && npc.vendor.items) || []) assert(C.items[v.item], `${npc.id} sells unknown ${v.item}`);
      for (const z of Object.values(ZONES)) void z;
    },
  },
  {
    name: 'bags: stacks, capacity, removal',
    fn() {
      const C = content();
      const p = { bag: [] };
      eq(bagAdd(p, 'potion', 25, null, C), 25);
      eq(p.bag.length, 2, '20 + 5');
      eq(bagRemove(p, 'potion', 7), 7);
      eq(bagCount(p, 'potion'), 18);
      for (let i = 0; i < 20; i++) bagAdd(p, 'gear_sword', 1, { ilvl: 2, rarity: 'common', affixes: [] }, C);
      eq(p.bag.length, 12, 'the starter satchel holds 12');
    },
  },
];

// Cap 30 (BUILDS_2 phase 10, the 20 to 30 band; Scott 2026-11-22 "Go with all of it"): the XP curve to 30, the level 25
// picks (passive picks never take a bar slot and work while known), the second signature at 20, the named builds to 30,
// the 20 to 30 gear tier (affix tiers 6 to 8, named drops by level band), and the Barrow Deep Halls (door at the Standing
// Stones, level gate 26, bosses, pools, quests). The gates are qa/sim/builds2.mjs (every build at every level to 30) and
// qa/sim/dungeon_bot.mjs (the Deep Halls at 28 and 30).
import { assert, eq } from './_helpers.mjs';
import { duelWorld } from '../sim/_fixtures.mjs';
import { buildContent, WORLD } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/index.js';
import { PROGRESSION } from '../../src/data/progression.js';
import { BUILDS2, SKILL_PICKS, B2_ABILITIES } from '../../src/data/builds2.js';
import { PICKS_25 } from '../../src/data/builds2_cap30.js';
import { ITEMS, AFFIXES, DROP_RULES, affixTier } from '../../src/data/items.js';
import { BAND_DROPS } from '../../src/data/gear_tier3.js';
import { DUNGEONS } from '../../src/data/dungeons.js';
import { DUNGEON_QUESTS } from '../../src/data/dungeon_quests.js';
import { rollKill, rollAffixes } from '../../src/sim/loot.js';
import { createRng } from '../../src/sim/rng.js';
import { pickSlots } from '../../src/ui/talents2.js';

const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
const TILE = 256;

export const tests = [
  {
    name: 'cap 30: XP to next for 20 to 29 is 4 x kill XP x (20 + L - 14) minutes, rounded to tens; 226,920 at 30; 1 to 19 unchanged',
    fn() {
      eq(PROGRESSION.maxLevel, 30, 'cap 30');
      for (let L = 15; L < 30; L++) eq(PROGRESSION.xpToNext[L], Math.round((4 * (20 + 4 * L) * (20 + L - 14)) / 10) * 10, `xp to next at ${L}`);
      eq(PROGRESSION.xpAtLevel[20], 81640, '20 unchanged'); eq(PROGRESSION.xpAtLevel[25], 142280, '25 (BUILDS_2 5.2)'); eq(PROGRESSION.xpAtLevel[30], 226920, '30 (BUILDS_2 5.2)');
    },
  },
  {
    name: 'cap 30: every class has a level 25 pick of two ready skills; every named build suggests one and spends 30 points',
    fn() {
      for (const cls of CLASSES) {
        const p = SKILL_PICKS[cls].find((x) => x.level === 25);
        assert(p && p.ready && p.options.length === 2 && p.axis, `${cls} level 25 pick`);
        eq(p, PICKS_25[cls], `${cls} pick joined once`);
        for (const id of p.options) { const a = B2_ABILITIES[id]; assert(a && a.learnLevel === 25 && a.text && !a.text.includes(String.fromCharCode(0x2014)), `${id} data`); }
        for (const b of BUILDS2[cls].builds) { assert(p.options.includes(b.picks[25]), `${b.id} suggests a level 25 pick`); eq(b.path.length, 30, `${b.id} 30 points`); }
      }
    },
  },
  {
    name: 'cap 30: a passive pick is known, never on the bar, never cast, and its effect joins the hero (Slag Brand patches Strike)',
    fn() {
      const { world, p, C } = duelWorld({ cls: 'warden', level: 25, learnAll: false, builds2: true });
      p.build.firstKill = true;
      for (const lv of [1, 3, 6, 14]) C.b2.pick(p, { level: lv, ability: BUILDS2.warden.builds[0].picks[lv] });
      assert(C.b2.picksOpen(p).some((x) => x.level === 25), 'the level 25 pick is open at 25');
      const bar0 = JSON.stringify(p.bar);
      assert(C.b2.pick(p, { level: 25, ability: 'warden_slag_brand' }), 'pick Slag Brand');
      assert(p.known.includes('warden_slag_brand'), 'known');
      eq(JSON.stringify(p.bar), bar0, 'the bar is unchanged');
      const strike = C.data.ability(p, 'warden_strike');
      assert(strike.effects.some((f) => f.key === 'slag'), 'Strike now leaves slag');
      world.enqueue(p.id, { t: 'cast', ability: 'warden_slag_brand' });
      const ev = world.step();
      assert(ev.some((x) => x.type === 'cast_fail' && x.ability === 'warden_slag_brand' && x.reason === 'passive'), 'a passive is never cast');
      const lo = duelWorld({ cls: 'warden', level: 24, learnAll: false, builds2: true });
      lo.p.build.firstKill = true;
      assert(!lo.C.b2.picksOpen(lo.p).some((x) => x.level === 25), 'not before 25');
    },
  },
  {
    name: 'cap 30: the second signature opens at 20 (not before); the talents window keeps five pick slots and shows the 25 pick from 20',
    fn() {
      const { p, C } = duelWorld({ cls: 'scribe', level: 20, learnAll: false, builds2: true });
      p.build.firstKill = true;
      const b = BUILDS2.scribe.builds[0];
      assert(C.b2.pick(p, { level: 10, ability: b.signatures[0] }), 'first signature');
      const sg = C.b2.picksOpen(p).find((x) => x.signature);
      assert(sg && sg.level === 20 && !sg.options.includes(b.signatures[0]), 'second signature open at 20');
      assert(C.b2.pick(p, { level: 20, ability: b.signatures[1] }), 'second signature taken');
      eq(p.build.sigs.length, 2, 'two signatures');
      for (const cls of CLASSES) {
        eq(pickSlots(cls, 15).length, 5, `${cls} at 15: five slots`); assert(!pickSlots(cls, 15).some((x) => x.level === 25), `${cls}: no 25 slot at 15`);
        eq(pickSlots(cls, 20).length, 5, `${cls} at 20: five slots`); assert(pickSlots(cls, 20).some((x) => x.level === 25), `${cls}: the 25 slot at 20`);
        assert(pickSlots(cls).some((x) => x.level === 1) && pickSlots(cls).some((x) => x.level === 25), `${cls}: every slot for lookups`);
      }
    },
  },
  {
    name: 'gear tier 20 to 30: affix tiers 6 to 8 above ilvl 20 (16 to 20 stay tier 5); every affix has 8 tiers rising',
    fn() {
      eq(affixTier(15), 5); eq(affixTier(20), 5, '20 stays T5'); eq(affixTier(21), 6); eq(affixTier(25), 7); eq(affixTier(30), 8);
      for (const [id, a] of Object.entries(AFFIXES)) {
        eq(a.values.length, 8, `${id} 8 tiers`);
        for (let t = 1; t < 8; t++) assert(a.values[t][0] >= a.values[t - 1][0] && a.values[t][1] >= a.values[t - 1][1], `${id} rises at tier ${t + 1}`);
      }
      const content = buildContent();
      const rng = createRng(5);
      const v20 = [], v30 = [];
      for (let i = 0; i < 200; i++) { for (const x of rollAffixes({ content, rng }, 'chest', 20, 'rare')) if (x.id === 'vital') v20.push(x.value); for (const x of rollAffixes({ content, rng }, 'chest', 30, 'rare')) if (x.id === 'vital') v30.push(x.value); }
      assert(Math.max(...v20) <= 5 && Math.min(...v30) >= 7, `Vital at ilvl 20 ${Math.max(...v20)}, at 30 ${Math.min(...v30)}`);
    },
  },
  {
    name: 'gear tier 20 to 30: named band drops come only from foes of their band; every piece is gear wearable at its band',
    fn() {
      eq(DROP_RULES.named.length, BAND_DROPS.length, 'bands joined');
      for (const b of BAND_DROPS) for (const r of b.rows) {
        const it = ITEMS[r[0]];
        assert(it && (it.kind === 'armor' || it.kind === 'weapon') && it.reqLevel <= b.from, `${r[0]} wearable at ${b.from}`);
      }
      const content = buildContent();
      const named = new Set(DROP_RULES.named.flatMap((b) => b.items));
      const count = (level) => {
        const rng = createRng(9);
        let n = 0;
        for (let i = 0; i < 3000; i++) n += rollKill({ content, rng, questNeeds: () => false }, { template: 'gorse_boar', level }, { level, cls: 'warden' }).items.filter((x) => named.has(x.item)).length;
        return n;
      };
      eq(count(19), 0, 'none from level 19 foes');
      const n27 = count(27);
      assert(n27 >= 15 && n27 <= 50, `about 1% from level 27 foes (${n27} in 3000)`);
    },
  },
  {
    name: 'Barrow Deep Halls: 26 to 30, three bosses that stand in its map, pools of real items for the killer, two legendaries with powers, two quests',
    fn() {
      const D = DUNGEONS.barrow_deep;
      const content = buildContent();
      const Z = content.zones.barrow_deep;
      eq(D.levels.join(','), '26,30'); eq(Z.kind, 'dungeon');
      for (const b of D.bosses) assert(Z.spawns.some((s) => s.mob === b && s.boss) && content.mobs[b] && content.mobs[b].boss, `${b} placed and a boss`);
      for (const s of Z.spawns) assert(s.level >= 26 && s.level <= 30, `${s.mob} level ${s.level} in band`);
      for (const ids of [...Object.values(D.drops), D.rare, D.legendary]) for (const id of ids) assert(ITEMS[id] && ITEMS[id].dungeon === 'barrow_deep', `${id} is a Deep Halls item`);
      for (const id of D.legendary) assert(ITEMS[id].rarity === 'legendary' && ITEMS[id].power && ITEMS[id].text.startsWith('Power, '), `${id} legendary power`);
      for (const id of D.rare) eq(ITEMS[id].rarity, 'epic', `${id} epic`);
      const qs = Object.values(DUNGEON_QUESTS).filter((q) => q.place === 'barrow_deep');
      eq(qs.length, 2, 'two quests');
      for (const q of qs) for (const o of q.objectives) assert(D.bosses.includes(o.mob), `${q.id} kills a boss`);
      for (const q of qs) for (const r of q.rewards.choice) assert(ITEMS[r] && ITEMS[r].reqLevel <= q.minLevel, `${q.id} reward ${r} wearable at once`);
    },
  },
  {
    name: 'Barrow Deep Halls: the door is at the Standing Stones; a level 25 hero is refused (door_locked), a level 26 hero goes down into its own copy',
    fn() {
      const j = WORLD.joins.find((x) => x.door === 'barrow_deep');
      assert(j && j.minLevel === 26 && j.region === 'downs', 'the door join on the Downs, gated at 26');
      const stones = WORLD.areas.find((a) => a.id === 'standing_stones');
      assert(stones && j.x >= stones.x && j.x < stones.x + stones.w && j.y >= stones.y && j.y < stones.y + stones.h, 'inside the Standing Stones');
      const d = WORLD.doors.find((x) => x.id === 'barrow_deep');
      const content = buildContent();
      const tryDoor = (level) => {
        const w = createWorld({ seed: 3, content });
        const id = w.addPlayer({ name: 'Down', cls: 'warden', level, zone: 'world', x: d.out[0], y: d.out[1] });
        const e = w.get(id);
        e.x = d.out[0] * TILE + 128; e.y = (d.out[1] + 1) * TILE - 16;
        w.enqueue(id, { t: 'move', dx: 0, dy: -1 });
        const evs = [];
        for (let i = 0; i < 40 && e.zone === 'world'; i++) evs.push(...w.step());
        return { e, evs };
      };
      const lo = tryDoor(25);
      eq(lo.e.zone, 'world', 'level 25 stays out');
      assert(lo.evs.some((x) => x.type === 'door_locked' && x.need === 26), 'door_locked says 26');
      const hi = tryDoor(26);
      assert(hi.e.zone.startsWith('barrow_deep#'), `level 26 goes in (${hi.e.zone})`);
    },
  },
];

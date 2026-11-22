// Combat role pass (Scott 2026-11-19: "Spells and skills and attacks should consider DPS, AOE, etc"): packs (lighter
// members that pull together), the camp table, every kit's coverage, the tooltip numbers, and the pack harness.
import { assert, eq, near, duelWorld, addMob, stepN } from './_fixtures.mjs';
import { ABILITIES, MOB_ABILITIES } from '../../src/data/abilities.js';
import { CLASSES } from '../../src/data/classes.js';
import { TALENTS } from '../../src/data/talents.js';
import { PROGRESSION } from '../../src/data/progression.js';
import { PACKS } from '../../src/data/packs.js';
import { allSpawns, REGIONS } from '../../src/data/maps/index.js';
import { setAbilityContent, setGameData, resetGameData, abilityTooltip, abilityInfo, abilityNumbers, autoTooltip } from '../../src/ui/gamedata.js';
import { fight } from './pack.mjs';

const TILE = 256;

export const tests = [
  { name: 'packs: a member of a 3-pack has 0.66 health and 0.5 damage, of a pair 0.85 and 0.75, against the same foe alone', fn() {
    const { world } = duelWorld({ cls: 'warden', level: 8 });
    const solo = addMob(world, 'brute_8', 20, 10);
    const trio = addMob(world, 'brute_8', 20, 14, { pack: 3, group: 't3' });
    const pair = addMob(world, 'brute_8', 20, 18, { pack: 2, group: 't2' });
    near(trio.hpMax, solo.hpMax * PROGRESSION.packs[3].hp, 1, 'trio health');
    near(pair.hpMax, solo.hpMax * PROGRESSION.packs[2].hp, 1, 'pair health');
    near(trio.mob.damage[1] / solo.mob.damage[1], 0.5, 0.06, 'trio damage');
    near(pair.mob.damage[1] / solo.mob.damage[1], 0.75, 0.06, 'pair damage');
    // the pack budget: a trio is 1.6 to 2 foes of health, and less damage
    const budget = 3 * PROGRESSION.packs[3].hp, dmg = 3 * PROGRESSION.packs[3].damage;
    assert(budget >= 1.6 && budget <= 2.0, `trio health budget ${budget}`);
    assert(dmg <= 2.0, `trio damage budget ${dmg}`);
    assert(2 * PROGRESSION.packs[2].hp >= 1.6 && 2 * PROGRESSION.packs[2].hp <= 2.0, 'pair budget');
  } },
  { name: 'packs: pulling one member pulls its whole camp (even beyond the social radius); a foe of another camp stays', fn() {
    const { world, pid, p, C } = duelWorld({ cls: 'warden', level: 8, x: 10, y: 15 });
    const a = addMob(world, 'dummy_8', 14, 15, { pack: 3, group: 'camp_a' });
    const b = addMob(world, 'dummy_8', 18, 15, { pack: 3, group: 'camp_a' });     // 4 tiles: beyond the 3-tile social pull
    const c = addMob(world, 'dummy_8', 14, 19, { pack: 3, group: 'camp_a' });
    const other = addMob(world, 'dummy_8', 17, 18, { pack: 3, group: 'camp_b' });
    C.combat.dealDamage(p, a, 5, { ability: 'test', canCrit: false });
    stepN(world, 2);
    for (const m of [a, b, c]) eq(m.ai.mode, 'combat', `camp member ${m.id} pulled`);
    assert(other.ai.mode !== 'combat', 'another camp is not pulled');
  } },
  { name: 'packs: a pack member gives its share of kill XP (x0.65 for a trio, x0.85 for a pair)', fn() {
    const { world, p, C } = duelWorld({ cls: 'warden', level: 8 });
    const solo = addMob(world, 'brute_8', 20, 10);
    const trio = addMob(world, 'brute_8', 20, 14, { pack: 3, group: 't3' });
    const pair = addMob(world, 'brute_8', 20, 18, { pack: 2, group: 't2' });
    const x = C.prog.killXp(p, solo);
    eq(C.prog.killXp(p, trio), Math.round(x * PROGRESSION.packs[3].xp), 'trio xp');
    eq(C.prog.killXp(p, pair), Math.round(x * PROGRESSION.packs[2].xp), 'pair xp');
  } },
  { name: 'packs: the camp table tags real camps of 2 or 3 at level 3 and up; the first quests\' camps stay single pulls', fn() {
    const { day } = allSpawns();
    const groups = {};
    for (const s of day) if (s.mob) (groups[`${s.region}:${s.group}`] = groups[`${s.region}:${s.group}`] || []).push(s);   // one world: camps are keyed by their area
    let n = 0;
    for (const [zone, camps] of Object.entries(PACKS)) {
      assert(REGIONS[zone], `area ${zone}`);
      for (const [g, size] of Object.entries(camps)) {
        const list = groups[`${zone}:${g}`];
        assert(list && list.length === size, `${zone}:${g} has ${list && list.length} spawns, table says ${size}`);
        for (const s of list) { eq(s.pack, size, `${g} tagged`); assert(s.level >= 3, `${g} level ${s.level}`); }
        n++;
      }
    }
    assert(n >= 10, `${n} pack camps`);
    for (const g of ['sm_slimes_a', 'sm_slimes_b', 'sm_slimes_c', 'cobb_scarabs', 'eb_slimes_a', 'eb_slimes_b', 'eb_scarabs', 'nl_slimes', 'nl_slimes_b']) {
      for (const s of groups[`valley:${g}`] || []) assert(!s.pack, `${g} must stay a single pull`);
    }
    for (const s of day) if (s.pack) assert(s.level >= 3, 'no pack below level 3');
  } },
  { name: 'kits: by 15 every class has a filler, an area option by level 6, damage over time, a long cooldown and a defense', fn() {
    const isArea = (a) => !!a.area || (a.effects || []).some((f) => f.object && (f.object.pulse || (f.object.effects || []).some((e) => e.to === 'enemies_near_holder')));
    const isDot = (a) => (a.effects || []).some((f) => f.aura && f.aura.tick && f.aura.tick.some((t) => t.type === 'damage')) || !!a.channel
      || (a.effects || []).some((f) => f.object && f.object.pulse);
    const isDefense = (a) => (a.effects || []).some((f) => (f.type === 'heal') || (f.aura && (f.aura.absorb || (f.aura.flags || []).some((x) => ['root', 'stun', 'incap', 'slow'].includes(x))
      || (f.aura.mods || []).some((m) => (m.stat === 'damageTaken' || m.stat === 'damageDone') && m.mul < 1) || (f.aura.tick || []).some((t) => t.type === 'heal')))
      || (f.type === 'move' && f.kind === 'leap') || (f.object && (f.object.effects || []).some((e) => e.aura && (e.aura.flags || []).includes('root'))));
    for (const [cls, c] of Object.entries(CLASSES)) {
      const ks = c.abilities.map((x) => ({ ...ABILITIES[x.id], level: x.level }));
      eq(ks.length, 6, `${cls} keeps a 6-slot bar`);
      assert(ks.some((a) => a.level === 1 && !a.cooldown && (a.effects || []).some((f) => f.type === 'damage')), `${cls} filler`);
      const area = ks.filter(isArea).sort((x, y) => x.level - y.level)[0];
      assert(area && area.level <= 6, `${cls} area option by 6 (first: ${area && area.id} at ${area && area.level})`);
      assert(ks.some(isDot), `${cls} damage over time`);
      assert(ks.some((a) => (a.cooldown || 0) >= 6 || a.castTime >= 2), `${cls} a big hit or cooldown`);
      assert(ks.some(isDefense), `${cls} a defensive tool`);
    }
  } },
  { name: 'kits: every ability id a talent edits exists, and no talent text keeps an em dash', fn() {
    for (const [cls, t] of Object.entries(TALENTS)) {
      for (const n of Object.values(t.talents)) {
        assert(!/\u2014/.test(n.text), `${n.id} has an em dash`);
        for (const r of n.byRank) for (const m of r.modAbility || []) assert(ABILITIES[m.id], `${n.id} edits ${m.id}`);
      }
      void cls;
    }
    for (const a of Object.values(ABILITIES)) assert(!/\u2014/.test(a.text), `${a.id} text has an em dash`);
  } },
  { name: 'tooltips: per-hit damage, damage per second, area in tiles, max targets, cast, cooldown and cost from the content', fn() {
    setAbilityContent(ABILITIES, MOB_ABILITIES);
    setGameData({ classes: CLASSES, abilities: ABILITIES, talents: TALENTS });
    try {
      const live = { level: 8, ap: 40, sp: 30, crit: 0.05, hpMax: 250, weapon: { min: 10, max: 14, speed: 2.4 } };
      const ap = (2.4 * 40) / 14;
      // Sweeping Blow: 0.7 W + 2 + L to each foe, a cone of 2 tiles, up to 4, and the bleed (1 + 0.5 L) x 3 over 6 s
      const sw = abilityTooltip(abilityInfo('warden_sweeping_blow'), 8, 'resolve', live);
      assert(sw.lines.includes('Area: in front of you (2 tiles), up to 4 foes'), sw.lines.join(' | '));
      const lo = Math.floor(0.7 * (10 + ap) + 2 + 8), hi = Math.ceil(0.7 * (14 + ap) + 2 + 8);
      assert(sw.lines.includes(`Damage: ${lo} to ${hi} to each foe`), sw.lines.join(' | '));
      assert(sw.lines.includes('Damage over time: 15 over 6 sec (2.5 per sec) on each foe'), sw.lines.join(' | '));
      assert(/25 Resolve/.test(sw.sub) && /6 sec cooldown/.test(sw.sub) && /Instant/.test(sw.sub), sw.sub);
      // Scatter Letters: a zone, per pulse and per second
      const sl = abilityNumbers('scribe_scatter_letters', live);
      const pulse = Math.round(4 + 1.6 * 8 + 0.2 * 30);
      assert(sl.includes(`Damage: ${pulse} every 2 sec, 3 times (${Math.round(pulse / 2)} per sec on each foe)`), sl.join(' | '));
      assert(sl.includes('Area: 2.5 tiles around the spot, up to 8 foes, for 6 sec'), sl.join(' | '));
      // Volley: a channel, per wave and per second
      const vo = abilityTooltip(abilityInfo('wayfinder_volley'), 14, 'focus', { ...live, level: 14 });
      assert(/Channel 3 sec/.test(vo.sub) && /35 Focus/.test(vo.sub), vo.sub);
      assert(vo.lines.some((l) => /per wave to each foe, 3 waves over 3 sec \(\d+ per sec on each foe\)/.test(l)), vo.lines.join(' | '));
      // Briar Trap: the burst's area and targets
      const bt = abilityNumbers('wayfinder_briar_trap', live);
      assert(bt.includes('Area: 2 tiles around the foe that springs it, up to 4 foes'), bt.join(' | '));
      assert(bt.includes(`Damage: ${8 + 3 * 8} to each foe`) && bt.includes('Root: 6 sec, does not break'), bt.join(' | '));
      // Inkstep: cost and cooldown from the content (not the design table), Smudge
      const is = abilityTooltip(abilityInfo('inkblade_inkstep'), 8, 'focus', live);
      assert(/25 Focus/.test(is.sub) && /8 sec cooldown/.test(is.sub), is.sub);
      assert(is.lines.includes('Weakens: 20% less damage dealt for 10 sec'), is.lines.join(' | '));
      assert(is.lines.some((l) => /^Interrupts a cast/.test(l)), is.lines.join(' | '));
      // Kindle: cast time; Brand: damage per second over time
      assert(/1\.5 sec cast/.test(abilityTooltip(abilityInfo('mender_kindle'), 8, 'mana', live).sub));
      const br = abilityNumbers('mender_brand', live);
      const tot = 6 * Math.round(14 / 6 + (5 / 6) * 8 + (0.6 / 6) * 30);
      assert(br.includes(`Damage over time: ${tot} over 12 sec (${Math.round(tot / 12)} per sec)`), br.join(' | '));
      // the auto-attack: per swing and per second
      const au = autoTooltip(live, 'warden');
      const alo = Math.floor(10 + ap), ahi = Math.ceil(14 + ap);
      eq(au.lines[0], `Damage: ${alo} to ${ahi} every 2.4 sec (${Math.round(((alo + ahi) / 2 / 2.4) * 10) / 10} per sec)`);
      // plain words: no em dashes, no raw ids, no unfilled placeholders
      for (const id of Object.keys(ABILITIES)) {
        const t = abilityTooltip(abilityInfo(id), 15, CLASSES[ABILITIES[id].cls].resource.kind, { ...live, level: 15 });
        for (const ln of [t.sub, t.body, ...t.lines]) {
          assert(!/\u2014/.test(ln), `${id}: em dash`);
          assert(!/[{}]|\bsome\b|undefined|NaN/.test(ln), `${id}: "${ln}"`);
        }
      }
    } finally { resetGameData(); }
  } },
  { name: 'pack harness: a played-well 3-pack fight is deterministic, cleared without dying, and slower than one foe', fn() {
    const a = fight('warden', 6, 77, { pack: 3 }), b = fight('warden', 6, 77, { pack: 3 });
    eq(a.hash, b.hash, 'same seed, same fight');
    assert(a.won && !a.died, 'cleared');
    const one = fight('warden', 6, 77, { pack: 1 });
    assert(a.ttk > one.ttk * 1.4, `pack ${a.ttk} s vs one ${one.ttk} s`);
    const w = fight('wayfinder', 6, 77, { pack: 3 });
    assert(w.won && !w.died, 'the Wayfinder clears a pack at 6 (trap, Light Foot, shots)');
  } },
];
void TILE;

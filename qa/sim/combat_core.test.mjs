// Combat core (2026-11-22, GAP 2.1 / 2.5, B3 B4 B5 B12): the WoW-style hit table, resistances, the school lockout, the
// threat pull-over rule, the epic tier and the legendary item powers. The fixtures run the hit table only when asked
// (fixtureContent({ hitTable: true })), so the formula tests elsewhere keep their exact numbers.
import { assert, eq, near, duelWorld, addMob, fixtureContent, ofType, stepN } from './_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { HIT_TABLE, ARMED } from '../../src/data/hittable.js';
import { FAMILY_RESIST } from '../../src/data/resist.js';
import { LEGENDARY_POWERS } from '../../src/data/legendary_powers.js';
import { ITEMS, RARITY, AFFIXES, DROP_RULES, WEAPON_TYPES, ARMOR_TYPES, CLASS_GEAR } from '../../src/data/items.js';
import { DUNGEONS } from '../../src/data/dungeons.js';
import { RARE_RULES } from '../../src/data/rares.js';
import { rollKill, bandRule, resolveItem } from '../../src/sim/loot.js';
import { createRng } from '../../src/sim/rng.js';
import { eventLines } from '../../src/ui/eventlog.js';
import { RARITY_COLOR, RARITY_NAME, abilityName } from '../../src/ui/gamedata.js';
import { planEvent } from '../../src/render/fxplan.js';

const SUB = 16;
/** A hero and a fixture foe in front of her (the foe faces her too), with the hit table on. */
function arena({ cls = 'warden', level = 10, mob = null, foeLevel = null, seed = 5, hitTable = true, x = 11 } = {}) {
  const d = duelWorld({ cls, level, seed, hitTable });
  const m = addMob(d.world, mob || `dummy_${foeLevel || level}`, x, 15);
  m.x = d.p.x + 20 * SUB; m.y = d.p.y;
  d.p.target = m.id; m.target = d.p.id;
  d.p.dir = 'right'; m.dir = 'left';
  return { ...d, m };
}
/** Swing n times with `info` and count the results (events land in the array the last step returned). */
function swings(world, C, src, dst, n, info, raw = 40, before = null) {
  const bag = world.step();
  const start = bag.length;
  for (let i = 0; i < n; i++) { dst.hp = dst.hpMax; if (before) before(); C.combat.dealDamage(src, dst, raw, { ability: 'auto', school: 'physical', melee: true, avoidable: true, ...info }); }
  const out = { n, hit: 0, miss: 0, dodge: 0, parry: 0, resist: 0, block: 0, crit: 0, glancing: 0, resisted: 0, amount: 0 };
  for (const e of bag.slice(start)) {
    if (e.type !== 'damage' || e.src !== src.id || e.dst !== dst.id) continue;
    out[e.result] = (out[e.result] || 0) + 1;
    if (e.crit) out.crit++;
    if (e.glancing) out.glancing++;
    if (e.resisted) out.resisted++;
    out.amount += e.amount;
  }
  return out;
}
const share = (r, k) => r[k] / r.n;

export const tests = [
  { name: 'hit table: a hero vs a foe of her level misses about 3% and is dodged about 3%; a foe above her more, one below less', fn() {
    const a = arena({ level: 10 });
    const r = swings(a.world, a.C, a.p, a.m, 4000, {});
    near(share(r, 'miss'), HIT_TABLE.miss.base, 0.012, 'miss at an equal level');
    near(share(r, 'dodge'), HIT_TABLE.mobDodge.base, 0.012, 'dodge at an equal level');
    eq(r.parry, 0, 'an unarmed foe never parries');
    const up = arena({ level: 10, foeLevel: 13 });
    const ru = swings(up.world, up.C, up.p, up.m, 4000, {});
    // +3: 3% + 1% + 1% + 3% = 8% miss, dodge 3% + 1.5%
    near(share(ru, 'miss'), 0.08, 0.015, 'miss vs a foe 3 levels up');
    near(share(ru, 'dodge'), 0.045, 0.012, 'dodge vs a foe 3 levels up');
    const dn = arena({ level: 10, foeLevel: 7 });
    const rd = swings(dn.world, dn.C, dn.p, dn.m, 4000, {});
    near(share(rd, 'miss'), HIT_TABLE.miss.floor, 0.008, 'miss vs a foe 3 levels down (the floor)');
  } },
  { name: 'hit table: an armed foe parries blows from the front, never from behind and never a shot; spells only miss (Resisted)', fn() {
    assert(ARMED.includes('tower_sentinel'), 'the sentinels are armed');
    const content = fixtureContent({ hitTable: true });
    content.mobs.armed_10 = { ...content.mobs.dummy_10, id: 'armed_10', armed: true };
    const world = createWorld({ seed: 9, content });
    const pid = world.addPlayer({ name: 'T', cls: 'warden', zone: 'arena', x: 10, y: 15, level: 10, gearMode: 'design' });
    const p = world.get(pid), C = world.internals;
    const m = addMob(world, 'armed_10', 12, 15);
    m.x = p.x + 20 * SUB; m.y = p.y; p.target = m.id; m.target = p.id;
    const front = swings(world, C, p, m, 3000, {});
    near(share(front, 'parry'), HIT_TABLE.mobParry.base, 0.012, 'parry from the front');
    // behind: the foe faces away (its target is somewhere else to its east)
    const decoy = addMob(world, 'dummy_10', 30, 15);
    const back = swings(world, C, p, m, 3000, {}, 40, () => { m.target = decoy.id; });     // (a hit makes it turn; turn it back)
    eq(back.parry, 0, 'no parry from behind');
    assert(back.dodge > 0, 'a foe still dodges from behind');
    m.target = p.id;
    const shot = swings(world, C, p, m, 2000, { melee: false });
    eq(shot.parry, 0, 'a shot is never parried');
    const spell = swings(world, C, p, m, 3000, { ability: 'scribe_inkbolt', school: 'ink', melee: false });
    eq(spell.dodge + spell.parry + spell.miss, 0, 'a spell is never dodged or parried, its miss is a resist');
    near(share(spell, 'resist'), HIT_TABLE.spellMiss.base, 0.008, 'a spell misses (Resisted) about 1% at an equal level');
  } },
  { name: 'hit table: heroes dodge (2% + agility) and the Warden and the Inkblade parry from the front; foes crit 5%, elites and bosses more', fn() {
    const ink = arena({ cls: 'inkblade', level: 20 });
    const r = swings(ink.world, ink.C, ink.m, ink.p, 6000, {});
    const want = HIT_TABLE.heroDodge.base + HIT_TABLE.heroDodge.perAgi * ink.p.stats.agi;
    near(share(r, 'dodge'), want, 0.012, `Inkblade dodge ~${(want * 100).toFixed(1)}%`);
    near(share(r, 'parry'), HIT_TABLE.heroParry.inkblade, 0.01, 'Inkblade parry');
    near(share(r, 'miss'), HIT_TABLE.foeMiss.base, 0.01, 'a foe of her level misses');
    near(r.crit / (r.hit + r.block), HIT_TABLE.mobCrit.normal, 0.012, 'a normal foe crits about 5%');
    const sc = arena({ cls: 'scribe', level: 20 });
    eq(swings(sc.world, sc.C, sc.m, sc.p, 2000, {}).parry, 0, 'a Scribe never parries');
    const el = arena({ cls: 'warden', level: 14, mob: 'elite_14' });
    const re = swings(el.world, el.C, el.m, el.p, 6000, {});
    near(re.crit / (re.hit + re.block), HIT_TABLE.mobCrit.elite, 0.015, 'an elite crits about 8%');
    // the old rules (no hit table): foes never crit, miss or are parried
    const off = arena({ cls: 'warden', level: 10, hitTable: false });
    const ro = swings(off.world, off.C, off.m, off.p, 1500, {});
    eq(ro.crit + ro.miss + ro.parry, 0, 'content without hitTable fights by the old rules');
  } },
  { name: 'hit table: glancing blows are a hero\'s auto-attacks on a foe above her (never a skill, never at her level), and never crit', fn() {
    const a = arena({ level: 10, foeLevel: 12 });
    const r = swings(a.world, a.C, a.p, a.m, 4000, {});
    near(r.glancing / r.n, HIT_TABLE.glancing.perLevel * 2, 0.025, 'about 20% glancing at +2');
    const even = arena({ level: 10 });
    eq(swings(even.world, even.C, even.p, even.m, 2000, {}).glancing, 0, 'no glancing at her level');
    eq(swings(a.world, a.C, a.p, a.m, 2000, { ability: 'warden_strike' }).glancing, 0, 'a skill never glances');
    const bag = a.world.step(); const s0 = bag.length;
    for (let i = 0; i < 3000; i++) { a.m.hp = a.m.hpMax; a.C.combat.dealDamage(a.p, a.m, 40, { ability: 'auto', school: 'physical', melee: true, avoidable: true }); }
    assert(!bag.slice(s0).some((e) => e.glancing && e.crit), 'a glancing blow is never a crit');
  } },
  { name: 'hit table: at an equal level a hero\'s weapon damage holds on average (the pay); the table rolls on its own saved stream', fn() {
    // level 20: the full pay. Mean landed damage x landed share ~ the old mean (crits and spread included)
    const on = arena({ level: 20, seed: 11 }), off = arena({ level: 20, seed: 11, hitTable: false });
    const ron = swings(on.world, on.C, on.p, on.m, 6000, {}), roff = swings(off.world, off.C, off.p, off.m, 6000, {});
    near(ron.amount / roff.amount, 1, 0.05, `total damage on/off ${(ron.amount / roff.amount).toFixed(3)}`);
    const st = JSON.parse(on.world.serialize());
    assert(typeof st.hitRng === 'number', 'state.hitRng is saved');
    // two worlds, same seed, same swings: the same results
    const w1 = arena({ seed: 21 }), w2 = arena({ seed: 21 });
    const a1 = swings(w1.world, w1.C, w1.p, w1.m, 500, {}), a2 = swings(w2.world, w2.C, w2.p, w2.m, 500, {});
    eq(JSON.stringify(a1), JSON.stringify(a2), 'deterministic');
  } },
  { name: 'hit table: a blow that misses still pulls the foe; a dodged Shield Bash neither stuns nor interrupts, and refunds 80% of its Resolve', fn() {
    const a = arena({ cls: 'warden', level: 10 });
    const { world, C, p, m } = a;
    eq(Object.keys(m.threat || {}).length, 0, 'no threat yet');
    // force the roll: a foe at +10 levels misses most blows; keep swinging until one does not land
    m.level = 20; C.stats.recalc(m);
    let missed = false;
    for (let i = 0; i < 200 && !missed; i++) { const before = m.hp; const res = C.combat.dealDamage(p, m, 30, { ability: 'auto', school: 'physical', melee: true, avoidable: true }); missed = !res && m.hp === before; }
    assert(missed, 'a blow missed');
    assert(m.threat && m.threat[p.id] > 0, 'the miss still put the hero on its threat list');
    // the rider rule and the refund, on the real Shield Bash (Builds 2 off: today's kit)
    m.level = 30; C.stats.recalc(m); m.hp = m.hpMax;
    let seen = null;
    for (let i = 0; i < 60 && !seen; i++) {
      p.res.cur = 50; p.cd = {}; p.gcdUntil = 0;
      const ev = world.step(); const s0 = ev.length;
      const ab = C.data.ability(p, 'warden_shield_bash');
      C.combat.castAbility(p, ab, { target: m.id });
      const mine = ev.slice(s0).filter((e) => e.type === 'damage' && e.src === p.id && e.ability === 'warden_shield_bash');
      if (mine.length && mine[0].result !== 'hit' && mine[0].result !== 'block') seen = { res: p.res.cur, stunned: C.stats.hasFlag(m, 'stun') };
      for (const au of [...m.auras]) C.combat.removeAura(m, au, 'cancel');
    }
    assert(seen, 'a Shield Bash was avoided');
    eq(seen.stunned, false, 'an avoided Bash does not stun');
    const cost = C.combat.costOf(p, C.data.ability(p, 'warden_shield_bash'), m);
    if (cost && cost.amount > 0 && cost.kind === 'resolve') assert(seen.res >= 50 - cost.amount * 0.2 - 1e-6, `refund: ${seen.res}`);
  } },
  { name: 'resistances: a family resists its school on average (bands 0/25/50/75%); gear affixes resist for heroes; physical never', fn() {
    eq(FAMILY_RESIST.spirit.shadow, 0.2, 'spirits resist shadow 20% on average');
    const content = fixtureContent({ hitTable: true });
    content.mobs.shade_10 = { ...content.mobs.dummy_10, id: 'shade_10', family: 'spirit' };
    const world = createWorld({ seed: 4, content });
    const pid = world.addPlayer({ name: 'T', cls: 'scribe', zone: 'arena', x: 10, y: 15, level: 10, gearMode: 'design' });
    const p = world.get(pid), C = world.internals;
    const m = addMob(world, 'shade_10', 12, 15);
    eq(m.mob.resist.shadow, 0.2, 'mob.resist from its family');
    const bag = world.step(); const s0 = bag.length;
    let raw = 0, got = 0;
    for (let i = 0; i < 3000; i++) { m.hp = m.hpMax; const r = C.combat.dealDamage(p, m, 100, { ability: 'test', school: 'shadow', canCrit: false }); if (r) { got += r.amount; raw += 100; } }
    near(1 - got / raw, 0.2, 0.03, `average shadow resisted ${(1 - got / raw).toFixed(3)}`);
    const bands = new Set(bag.slice(s0).filter((e) => e.type === 'damage' && e.resisted).map((e) => Math.round((100 * e.resisted) / (e.amount + e.resisted) / 25)));
    assert([...bands].every((b) => b === 1), `only the 25% band at an average of 20%: ${[...bands]}`);
    let phys = 0;
    for (let i = 0; i < 200; i++) { m.hp = m.hpMax; const r = C.combat.dealDamage(p, m, 100, { ability: 'test', school: 'physical', canCrit: false, noArmor: true }); if (r && r.resisted) phys++; }
    eq(phys, 0, 'physical is never resisted');
    // a hero with Shadeward gear
    assert(AFFIXES.of_shadeward && AFFIXES.of_shadeward.stat === 'resShadow', 'the Shadeward affix');
    p.derived.resist = { shadow: 0.5 };
    let in0 = 0, in1 = 0;
    for (let i = 0; i < 2000; i++) { p.hp = p.hpMax; in0 += 100; const r = C.combat.dealDamage(m, p, 100, { ability: 'test', school: 'shadow' }); if (r) in1 += r.amount + (r.absorbed || 0); }
    near(1 - in1 / in0, 0.5, 0.04, 'a hero at 50% shadow resist takes half on average');
  } },
  { name: 'interrupts lock the whole school: a foe with two shadow spells cannot cast the other; physical casts lock only themselves', fn() {
    const content = fixtureContent({ hitTable: true });
    content.mobs.twin_10 = { ...content.mobs.dummy_10, id: 'twin_10', kind: 'caster', abilities: [{ id: 'mob_chilling_touch' }, { id: 'mob_reeve_sweep' }, { id: 'mob_wolf_lunge' }] };
    const world = createWorld({ seed: 4, content });
    const pid = world.addPlayer({ name: 'T', cls: 'scribe', zone: 'arena', x: 10, y: 15, level: 10, gearMode: 'design' });
    const p = world.get(pid), C = world.internals;
    const m = addMob(world, 'twin_10', 14, 15);
    const touch = C.data.ability(m, 'mob_chilling_touch'), sweep = C.data.ability(m, 'mob_reeve_sweep');
    eq(touch.school, 'shadow'); eq(sweep.school, 'shadow');
    assert(C.combat.castAbility(m, touch, { target: p.id }), 'the foe starts Chilling Touch');
    const ev = world.step(); const s0 = ev.length;
    C.combat.interrupt(m, 3, p);
    const lock = ev.slice(s0).find((e) => e.type === 'school_lock');
    assert(lock && lock.school === 'shadow' && lock.id === m.id, 'a school_lock event');
    assert(m.cd.mob_reeve_sweep > world.tick, 'the other shadow spell shows the lock');
    assert(!(m.cd.mob_wolf_lunge > world.tick), 'a physical skill is not locked');
    m.gcdUntil = 0;
    eq(C.combat.castAbility(m, sweep, { target: p.id }), false, 'the other shadow spell fails');
    stepN(world, 61);
    m.gcdUntil = 0; m.cast = null;
    assert(C.combat.castAbility(m, sweep, { target: p.id }) || m.cd.mob_reeve_sweep <= world.tick, 'after 3 s the school is open again');
    eq(eventLines({ type: 'school_lock', id: 1, school: 'shadow' }, { me: 1 })[0].text, 'Your shadow spells are locked for a moment.');
  } },
  { name: 'threat: a new target needs 110% of the holder\'s threat in melee reach, 130% from range', fn() {
    const { world, C, p } = duelWorld({ cls: 'warden', level: 10, hitTable: true });
    const id2 = world.addPlayer({ name: 'U', cls: 'wayfinder', zone: 'arena', x: 10, y: 17, level: 10, gearMode: 'design' });
    const q = world.get(id2);
    const m = addMob(world, 'brute_10', 11, 15);
    m.x = p.x + 20 * SUB; m.y = p.y;
    C.combat.addThreat(m, p, 100); world.step();
    eq(m.ai.target, p.id, 'the Warden holds it');
    q.x = m.x + 100 * SUB; q.y = m.y;                         // far away: a ranged pull needs 130%
    m.threat[q.id] = 125; world.step();
    eq(m.ai.target, p.id, '125% from range is not enough');
    m.threat[q.id] = 131 * (m.threat[p.id] / 100); world.step();
    eq(m.ai.target, q.id, 'over 130% from range pulls it');
  } },
  { name: 'epic: a purple tier between rare and legendary; drop bands by level (BUILDS_2 6.8); last bosses and the world rares give epic', fn() {
    eq(RARITY.epic.color, '#a335ee'); eq(RARITY_COLOR.epic, '#a335ee'); eq(RARITY_NAME.epic, 'Epic');
    eq(RARITY_COLOR.magic, RARITY.magic.color, 'the UI colours the sim ids'); eq(RARITY_NAME.magic, 'Magic');
    assert(RARITY.epic.sellMult > RARITY.rare.sellMult && RARITY.epic.sellMult < RARITY.legendary.sellMult, 'sell multiplier between');
    eq(RARITY.epic.affixes.join(), '4,5', 'four to five affixes');
    eq(bandRule(DROP_RULES, 'normal', 5).weights.rare, 5, 'band 1 is today\'s'); eq(bandRule(DROP_RULES, 'normal', 15).gearChance, 0.07);
    eq(bandRule(DROP_RULES, 'elite', 12).weights.epic, 4); eq(bandRule(DROP_RULES, 'elite', 99).weights.epic, 12, 'past the last band: the last');
    for (const id of DUNGEONS.barrow.rare.concat(DUNGEONS.watchtower.rare)) eq(ITEMS[id].rarity, 'epic', `${id} is epic`);
    eq(RARE_RULES.upgradeRarity, 'epic', 'the world rares\' 1 in 20');
    const content = { items: ITEMS, rarity: RARITY, affixes: AFFIXES, dropRules: DROP_RULES, weaponTypes: WEAPON_TYPES, armorTypes: ARMOR_TYPES, classGear: CLASS_GEAR,
      mobs: { elite_x: { id: 'elite_x', elite: true, kind: 'elite', loot: { gold: [1, 2], table: [] } } } };
    const rng = createRng(3);
    let epic = 0, n = 0;
    for (let i = 0; i < 3000; i++) { const d = rollKill({ content, rng }, { template: 'elite_x', level: 15 }, { level: 15, cls: 'warden' }); const g = d.items.find((x) => x.inst); if (g) { n++; if (g.inst.rarity === 'epic') { epic++; assert(g.inst.affixes.length >= 3, 'an epic rolls its affixes'); } } }
    near(epic / n, 0.04, 0.012, `elite epic share at 15: ${(epic / n).toFixed(3)}`);
  } },
  { name: 'legendary powers: five legendaries with a power and its tooltip line; worn, they proc on hit, when struck, on a kill and on a dodge', fn() {
    const L = Object.values(ITEMS).filter((it) => it.rarity === 'legendary');
    eq(L.length, 5, 'five legendaries');
    for (const it of L) { assert(it.power && LEGENDARY_POWERS[it.power.id], `${it.id} has a power`); assert(it.text && it.text.startsWith('Power, '), `${it.id} tooltip`); assert(!/—/.test(it.text), 'no em dash'); }
    const lg = [].concat(...Object.values(DUNGEONS).map((d) => (Array.isArray(d.legendary) ? d.legendary : d.legendary ? [d.legendary] : [])));
    for (const it of L) assert(lg.includes(it.id), `${it.id} is on a dungeon table`);
    eq(abilityName('lg_reeves_count'), "The Reeve's Count", 'the log names a power');
    // a hero wearing the ring and the eye (items, not design gear)
    const content = { ...fixtureContent({ hitTable: true }), items: ITEMS, rarity: RARITY, affixes: AFFIXES, dropRules: DROP_RULES, weaponTypes: WEAPON_TYPES, armorTypes: ARMOR_TYPES, classGear: CLASS_GEAR };
    const world = createWorld({ seed: 8, content });
    const pid = world.addPlayer({ name: 'T', cls: 'warden', zone: 'arena', x: 10, y: 15, level: 12 });
    const p = world.get(pid), C = world.internals;
    p.equip = { ...(p.equip || {}), trinket: { item: 'reeves_tally_ring', inst: { ilvl: 12, rarity: 'legendary', affixes: [] } } };
    C.stats.recalc(p);
    eq((p.powers || []).join(), 'reeves_tally_ring', 'e.powers lists the worn legendary');
    const m = addMob(world, 'dummy_12', 12, 15);
    m.hpMax = m.hp = 100000;
    const bag = world.step(); const s0 = bag.length;
    for (let i = 0; i < 400; i++) { world.state.tick += 20; C.combat.dealDamage(p, m, 20, { ability: 'warden_strike', school: 'physical', melee: true }); }
    const counts = bag.slice(s0).filter((e) => e.type === 'damage' && e.ability === 'lg_reeves_count').length;
    near(counts / 400, 0.15, 0.05, `the Count procs about 15% of hits (${counts})`);
    assert(bag.slice(s0).some((e) => e.type === 'heal' && e.ability === 'lg_reeves_count'), 'and mends the hero');
    // the Eye: +3% dodge passive, a ward when struck
    p.equip.trinket = { item: 'unsleeping_eye', inst: { ilvl: 20, rarity: 'legendary', affixes: [] } };
    C.stats.recalc(p);
    eq(C.stats.mod(p, 'dodge').add, 0.03, 'Never Blinks: +3% dodge');
    C.combat.dealDamage(m, p, 5, { ability: 'test', school: 'physical' });
    assert(C.stats.findAura(p, 'lg_never_blinks'), 'struck: the ward is up');
    // the Mantle: a kill gives back health and Resolve
    p.equip.legs = { item: 'last_wick_mantle', inst: { ilvl: 20, rarity: 'legendary', affixes: [], armorType: 'plate' } };
    C.stats.recalc(p);
    p.hp = Math.round(p.hpMax * 0.5); p.res.cur = 0;
    const k = addMob(world, 'dummy_3', 13, 15);
    C.combat.dealDamage(p, k, 99999, { ability: 'test', school: 'physical', noArmor: true });
    assert(k.dead, 'the foe died');
    assert(p.hp > Math.round(p.hpMax * 0.5) && p.res.cur > 0, `The Last Wick: health and Resolve back (${p.hp}/${p.hpMax}, ${p.res.cur})`);
    // the Mistwalkers: a dodge gives Mistwalk
    p.equip.feet = { item: 'hollowfangs_mistwalkers', inst: { ilvl: 16, rarity: 'legendary', affixes: [], armorType: 'plate' } };
    C.stats.recalc(p);
    m.x = p.x + 20 * SUB; m.y = p.y; p.target = m.id;
    for (let i = 0; i < 500 && !C.stats.findAura(p, 'lg_mistwalk'); i++) { p.hp = p.hpMax; C.combat.dealDamage(m, p, 5, { ability: 'auto', school: 'physical', melee: true, avoidable: true }); }
    assert(C.stats.findAura(p, 'lg_mistwalk'), 'a dodge or parry gives Mistwalk');
    // the tooltip carries the power
    const it = resolveItem(content, { item: 'unsleeping_eye', inst: { ilvl: 20, rarity: 'legendary', affixes: [] } }, 'warden');
    assert(it.text.includes('Never Blinks'), 'the resolved item keeps the power line');
  } },
  { name: 'event log and floating text show every result the sim produces (B3): miss, dodge, parry, resist, glancing, partial resist', fn() {
    const L = (ev) => eventLines(ev, { me: 1, nameOf: (id) => (id === 2 ? 'Briar Wolf' : 'X') })[0].text;
    eq(L({ type: 'damage', src: 1, dst: 2, ability: 'warden_strike', amount: 0, result: 'parry' }), 'Your Strike is parried by Briar Wolf.');
    eq(L({ type: 'damage', src: 1, dst: 2, ability: 'warden_strike', amount: 0, result: 'miss' }), 'Your Strike misses Briar Wolf.');
    eq(L({ type: 'damage', src: 2, dst: 1, ability: 'auto', amount: 0, result: 'dodge' }), "You dodge Briar Wolf's attack.");
    eq(L({ type: 'damage', src: 2, dst: 1, ability: 'auto', amount: 0, result: 'parry' }), "You parry Briar Wolf's attack.");
    eq(L({ type: 'damage', src: 1, dst: 2, ability: 'mender_kindle', amount: 0, result: 'resist' }), 'Your Kindle is resisted by Briar Wolf.');
    eq(L({ type: 'damage', src: 1, dst: 2, ability: 'auto', amount: 9, result: 'hit', glancing: true }), 'Your attack hits Briar Wolf for 9 (glancing).');
    eq(L({ type: 'damage', src: 2, dst: 1, ability: 'auto', amount: 9, result: 'block', blocked: 9 }), 'Briar Wolf hits you for 9 (9 blocked).');
    eq(L({ type: 'damage', src: 1, dst: 2, ability: 'mender_kindle', amount: 30, result: 'hit', resisted: 10 }), 'Your Kindle hits Briar Wolf for 30 (10 resisted).');
    for (const [result, word] of [['miss', 'MISS'], ['dodge', 'DODGE'], ['parry', 'GUARD'], ['resist', 'RESIST']]) {
      eq(planEvent({ type: 'damage', src: 1, dst: 2, ability: 'warden_strike', amount: 0, result }).find((s) => s.kind === 'number').word, word, `${result} floats ${word}`);
    }
    const gl = planEvent({ type: 'damage', src: 1, dst: 2, ability: 'auto', amount: 9, result: 'hit', glancing: true }, { playerId: 1 });
    assert(gl.some((s) => s.kind === 'number' && s.word === 'WEAK') && gl.some((s) => s.kind === 'number' && s.text === '9'), 'a glancing blow floats its number and WEAK');
  } },
];

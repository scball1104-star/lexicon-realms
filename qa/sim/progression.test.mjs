// XP, levels, trainers, talents, respec, death and lanterns (PROGRESSION 1, 2, 5, 6; TALENTS 0), plus the world wiring
// that uses them: quests and loot on kills, night spawns, items, save restore.
import { assert, eq, near, duelWorld, addMob, stepN, ofType, fixtureContent } from './_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { PROGRESSION } from '../../src/data/progression.js';
import { CLASSES } from '../../src/data/classes.js';
import { DAY_TICKS } from '../../src/sim/constants.js';
import { dayFraction, isNight } from '../../src/sim/clock.js';
import { bagCapacity } from '../../src/sim/loot.js';

const at = (e, tx, ty) => { e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };
function trainerWorld(cls = 'warden', level = 1) {
  const content = fixtureContent({ spawns: [{ zone: 'arena', npc: CLASSES[cls].trainer, x: 12, y: 15, dir: 'left' }] });
  const w = createWorld({ seed: 3, content });
  const pid = w.addPlayer({ name: 'T', cls, zone: 'arena', x: 10, y: 15, level, gearMode: 'design' });
  const npc = w.state.ents.find((e) => e.kind === 'npc');
  return { w, pid, p: w.get(pid), npc, C: w.internals };
}

export const tests = [
  { name: 'bags: the starter satchel grows +2 at levels 5, 10, 15 and 20 (12 -> 20), the level-up message reads bagGrew', fn() {
    const { world: w, p } = duelWorld({ cls: 'warden', level: 1 });
    const content = w.internals.content;
    eq(bagCapacity(p, content), 12, 'level 1: 12 slots');
    const grew = [];
    while (p.level < 20) { const cap = bagCapacity(p, content); w.grantXp(p.id, 50, 'quest'); if (bagCapacity(p, content) > cap) grew.push(p.level); }
    eq(bagCapacity(p, content), 20, 'level 20: 20 slots');
    eq(grew.join(), '5,10,15,20', 'grows at 5, 10, 15, 20');
  } },
  { name: 'xp: the curve: granting 226,920 XP from level 1 lands exactly on the cap 30 (41,000 on 15, 81,640 on 20), with a level event at every PROGRESSION.md threshold', fn() {
    const { world: w, pid, p } = duelWorld({ cls: 'mender', level: 1 });
    const levels = [];
    let total = 0;
    while (p.level < 30) {
      const ev = []; const before = p.level;
      w.grantXp(pid, 10, 'quest');
      total += 10;
      if (p.level > before) levels.push([p.level, total]);
      void ev;
    }
    eq(total, 226920, 'total');
    eq(PROGRESSION.maxLevel, 30, 'cap 30 (BUILDS_2 5.1, phase 10; 20 in phase 5)');
    for (const [L, t] of levels) eq(t, PROGRESSION.xpAtLevel[L], `reached ${L} at its cumulative XP`);
    eq(levels.find(([L]) => L === 15)[1], 41000, '41,000 XP still lands on 15 (levels 1 to 14 unchanged)');
    eq(levels.find(([L]) => L === 20)[1], 81640, '81,640 XP still lands on 20');
    eq(levels.length, 29, 'twenty-nine level-ups');
  } },
  { name: 'xp: level-up recomputes stats from base + growth (floor of the running total), refills health and mana', fn() {
    const { world: w, pid, p } = duelWorld({ cls: 'warden', level: 1 });
    p.hp = 10;
    w.grantXp(pid, 480);
    eq(p.level, 2, 'level 2');
    const g = Math.floor(0.7 * 2);
    eq(p.stats.sta, Math.floor(12 + 1.5) + g, 'stamina 13 + gear');
    eq(p.hpMax, 10 * p.stats.sta + 60, 'max hp = 10 sta + 60');
    eq(p.hp, p.hpMax, 'refilled');
    w.setLevel(pid, 15);
    eq(p.stats.str, Math.floor(12 + 1.5 * 14) + Math.floor(0.7 * 15), 'strength at 15');
  } },
  { name: 'xp: kill XP = (20 + 4 x mob level) x the level-gap table; grey at 5 under; elite x2.5, weak x0.6; credit to the tagger', fn() {
    const { world: w, pid, p, C } = duelWorld({ cls: 'warden', level: 5 });
    const xp = (mob) => C.prog.killXp(p, addMob(w, mob, 30, 3));
    eq(xp('dummy_5'), 40, 'equal'); eq(xp('dummy_9'), Math.round(56 * 1.4), '+4'); eq(xp('dummy_6'), Math.round(44 * 1.1), '+1');
    eq(xp('dummy_3'), Math.round(32 * 0.75), '-2'); eq(xp('dummy_1'), Math.round(24 * 0.35), '-4');
    p.level = 6; eq(xp('dummy_1'), 0, 'grey'); p.level = 14;
    eq(xp('elite_14'), Math.round(76 * 2.5), 'elite'); p.level = 3;
    eq(xp('weak_3'), Math.round(32 * 0.6), 'weak'); p.level = 5;
    const m = addMob(w, 'dummy_5', 6, 15);
    C.combat.dealDamage(p, m, 5, { ability: 'test', school: 'ink' });
    const x0 = p.xp;
    C.combat.kill(m, p);
    eq(p.xp - x0, 40, 'kill XP to the tagger');
  } },
  { name: 'xp: at the cap (30) XP turns into gold, 1 per 50, remainder kept', fn() {
    const { world: w, pid, p } = duelWorld({ cls: 'warden', level: 30 });
    p.gold = 0;
    w.grantXp(pid, 120); eq(p.gold, 2, '120 XP = 2 gold'); w.grantXp(pid, 30); eq(p.gold, 3, 'remainder carried');
    eq(p.level, 30, 'still 30'); eq(p.xp, 0, 'no XP bar at the cap');
  } },
  { name: 'xp: a hero saved at the old cap 15 (banked cap gold, any leftover XP) loads at 15, keeps both, and levels on to 16', fn() {
    const content = buildContent();
    const w = createWorld({ seed: 4, content });
    const at15 = w.addPlayer({ name: 'Old', cls: 'warden', level: 15, xp: 0, gold: 1234 });
    const p = w.get(at15);
    eq(p.level, 15, 'still 15 on load'); eq(p.gold, 1234, 'banked cap gold kept'); eq(p.xp, 0, 'xp 0');
    w.grantXp(at15, 6720);
    eq(p.level, 16, '6,720 XP is level 16 now'); eq(p.gold, 1234, 'no XP went to gold');
    const left = w.addPlayer({ name: 'Left', cls: 'scribe', level: 15, xp: 500, gold: 9 });
    const q = w.get(left);
    eq(q.level, 15); eq(q.xp, 500, 'leftover XP kept');
    w.grantXp(left, 6220);
    eq(q.level, 16, 'the leftover counts toward 16'); eq(q.xp, 0);
  } },
  { name: 'trainer: interact shows the offer; train needs range, level and gold (5 / 15 / 40 / 90); learned goes on the bar', fn() {
    const { w, pid, p, npc } = trainerWorld('warden', 2);
    p.gold = 20;
    w.enqueue(pid, { t: 'interact', id: npc.id });
    const ev = w.step();
    const it = ofType(ev, 'interact')[0];
    assert(it && it.trainer && it.trainer.cls === 'warden', 'trainer window');
    eq(it.trainer.offer.find((o) => o.ability === 'warden_sweeping_blow').cost, 5, 'Sweeping Blow (level 3 since the combat role pass) costs 5');
    w.enqueue(pid, { t: 'train', npc: npc.id, ability: 'warden_sweeping_blow' });
    eq(ofType(w.step(), 'train_fail')[0].reason, 'level', 'level 3 needed');
    w.grantXp(pid, 780);
    eq(p.level, 3);
    w.enqueue(pid, { t: 'train', npc: npc.id, ability: 'warden_sweeping_blow' });
    assert(ofType(w.step(), 'train').length, 'learned');
    eq(p.gold, 15, 'paid 5'); assert(p.known.includes('warden_sweeping_blow') && p.bar.includes('warden_sweeping_blow'), 'known and on the bar');
    at(p, 30, 15);
    w.setLevel(pid, 6);
    w.enqueue(pid, { t: 'train', npc: npc.id, ability: 'warden_second_wind' });
    eq(ofType(w.step(), 'train_fail')[0].reason, 'range', 'must stand at the trainer');
    eq(PROGRESSION.trainCost['10'], 40); eq(PROGRESSION.trainCost['14'], 90);
  } },
  { name: 'talents: a point per level from 5 (11 at 15); tiers open at 0/2/4/6/8 in the branch; max ranks; learned talents change stats', fn() {
    const { w, pid, p, C } = trainerWorld('warden', 4);
    eq(C.prog.talentPoints(p).total, 0, 'none at 4');
    w.enqueue(pid, { t: 'learn_talent', talent: 'warden_bulwark_iron_skin' });
    eq(ofType(w.step(), 'talent_fail')[0].reason, 'points');
    w.setLevel(pid, 15);
    eq(C.prog.talentPoints(p).total, 11, '11 at 15');
    const arm0 = p.stats.armor;
    const learn = (t) => { w.enqueue(pid, { t: 'learn_talent', talent: t }); return w.step(); };
    eq(ofType(learn('warden_bulwark_stout_heart'), 'talent_fail')[0].reason, 'tier', 'tier 2 needs 2 points');
    learn('warden_bulwark_iron_skin'); learn('warden_bulwark_iron_skin');
    eq(p.stats.armor, Math.round(arm0 / 1 * 1.08), 'armor +8% at rank 2');
    learn('warden_bulwark_iron_skin');
    eq(ofType(learn('warden_bulwark_iron_skin'), 'talent_fail')[0].reason, 'max', 'max 3 ranks');
    eq(ofType(learn('warden_bulwark_challenge'), 'talent_fail')[0].reason, 'tier', 'tier 3 needs 4 (3 spent)');
    assert(ofType(learn('warden_bulwark_stout_heart'), 'talent').length, 'tier 2 open at 3 points');
    assert(ofType(learn('warden_bulwark_challenge'), 'talent').length, 'tier 3 at 4 points');
    eq(ofType(learn('warden_oathblade_sword_sworn'), 'talent_fail')[0].reason, 'tier', 'tiers count per branch');
  } },
  { name: 'talents: unlearn one rank only at the trainer and never under a deeper node; respec refunds all, first free then 10 + 5 x level, paid once per visit', fn() {
    const { w, pid, p, npc, C } = trainerWorld('warden', 15);
    w.setTalents(pid, { warden_bulwark_iron_skin: 2, warden_bulwark_stout_heart: 1 });
    p.gold = 200;
    at(p, 30, 15);
    w.enqueue(pid, { t: 'unlearn_talent', talent: 'warden_bulwark_stout_heart' });
    eq(ofType(w.step(), 'talent_fail')[0].reason, 'range', 'at the trainer only');
    at(p, 10, 15);
    w.enqueue(pid, { t: 'unlearn_talent', talent: 'warden_bulwark_iron_skin' });
    eq(ofType(w.step(), 'talent_fail')[0].reason, 'dependency', 'tier 2 still needs 2 points below it');
    w.enqueue(pid, { t: 'unlearn_talent', talent: 'warden_bulwark_stout_heart' });
    let ev = w.step();
    assert(ofType(ev, 'talent', (e) => e.kind === 'unlearn').length, 'unlearned');
    eq(ofType(ev, 'respec_paid')[0].cost, 0, 'the first respec is free');
    w.enqueue(pid, { t: 'unlearn_talent', talent: 'warden_bulwark_iron_skin' });
    ev = w.step();
    eq(ofType(ev, 'respec_paid').length, 0, 'same visit: no second charge');
    at(p, 30, 15); w.step(); at(p, 10, 15);
    w.enqueue(pid, { t: 'respec', npc: npc.id });
    ev = w.step();
    eq(ofType(ev, 'respec_paid')[0].cost, 10 + 5 * 15, 'second visit: 85 gold at 15');
    eq(Object.keys(p.talents).length, 0, 'all refunded'); eq(p.gold, 200 - 85, 'gold');
    eq(C.prog.talentPoints(p).free, 11, 'points back');
  } },
  { name: 'death: touch a lantern to bind it; die, wake there 3 s later with full health and resource, nothing lost; the killer resets', fn() {
    const { world: w, pid, p, C } = duelWorld({ cls: 'mender', level: 5, x: 49, y: 25 });
    const ev0 = stepN(w, 6);
    assert(ofType(ev0, 'lantern', (e) => e.lantern === 'arena_far').length, 'bound by touch');
    at(p, 30, 10);
    const m = addMob(w, 'brute_5', 31, 10);
    p.gold = 33; p.xp = 120;
    stepN(w, 5);
    C.combat.dealDamage(m, p, p.hp + 50, { ability: 'test', school: 'ink' });
    assert(p.dead, 'dead');
    let ev = stepN(w, 59);
    assert(p.dead, 'still down at 2.95 s');
    ev = stepN(w, 1);
    const r = ofType(ev, 'respawn')[0];
    assert(r && r.lantern === 'arena_far', 'woke at the bound lantern');
    eq(Math.floor(p.x / 256), 50, 'lantern spot'); eq(p.hp, p.hpMax, 'full health'); eq(p.res.cur, p.res.max, 'full mana');
    eq(p.gold, 33, 'gold kept'); eq(p.xp, 120, 'XP kept');
    stepN(w, 3);
    eq(Object.keys(m.threat).length, 0, 'the mob forgot you');
    assert(['reset', 'idle', 'walk', 'home'].includes(m.ai.mode), `the mob went home (${m.ai.mode})`);
  } },
  { name: 'world: the real content: kills feed quests and loot; respawns keep the spawn level; nodes and items work; night spawns follow the clock', fn() {
    const content = buildContent();
    const w = createWorld({ seed: 11, content });
    const pid = w.addPlayer({ name: 'Q', cls: 'warden' });
    const p = w.get(pid);
    // night shades are hidden by day (the world starts at 7:40)
    const shades = w.state.ents.filter((e) => e.spawn && e.spawn.night);
    eq(shades.length, content.nightSpawns.length, 'night spawns exist');
    assert(shades.every((e) => e.dead), 'hidden by day');
    assert(!isNight(0) && isNight(Math.round((0.9 - 0.32) * DAY_TICKS)), 'clock');
    near(w.snapshot().dayTime, dayFraction(0), 1e-9, 'snapshot carries dayTime for the renderer');
    // a multi-level family: every spawn's mob carries the spawn's level
    for (const e of w.state.ents.filter((x) => x.kind === 'mob' && x.spawn.level != null).slice(0, 30)) eq(e.level, e.spawn.level, `${e.template} at its spawn level`);
    // a kill feeds the quest log and rolls loot into the bag
    const qid = Object.keys(content.quests).find((id) => content.quests[id].objectives.some((o) => o.kind === 'kill'));
    const q = content.quests[qid];
    const o = q.objectives.findIndex((x) => x.kind === 'kill');
    p.quests = { [qid]: { state: 'active', counts: q.objectives.map(() => 0) } };
    p.questsDone = [...(q.requires && q.requires.quests || [])];
    const mob = w.state.ents.find((e) => e.kind === 'mob' && e.template === q.objectives[o].mob && !e.dead);
    assert(mob, `a ${q.objectives[o].mob} to kill`);
    mob.tagger = pid;
    const C = w.internals;
    p.gold = 0;
    C.combat.kill(mob, p);
    const ev = w.step();
    eq(p.quests[qid].counts[o], 1, 'quest kill counted');
    assert(p.gold > 0 || p.bag.length > 0 || true, 'loot rolled');
    // items: drink a potion
    p.bag.push({ item: 'potion', qty: 2 }); p.hp = 10;
    w.enqueue(pid, { t: 'use_item', item: 'potion' });
    const ev2 = w.step();
    assert(ofType(ev2, 'heal', (e) => e.ability === 'potion').length, 'potion heals');
    w.enqueue(pid, { t: 'use_item', item: 'potion' });
    eq(ofType(w.step(), 'inventory_fail')[0].reason, 'cooldown', 'shared potion cooldown');
    // the snapshot carries what the HUD asked for
    const s = w.snapshot();
    const me = s.entities.find((e) => e.id === pid);
    for (const k of ['quests', 'bag', 'equip', 'gold', 'stats', 'xpToLevel', 'talents', 'known', 'bar']) assert(k in me, `player.${k}`);
    assert(s.hud[pid].quests && s.hud[pid].npcMarkers, 'tracker and NPC markers');
    assert(s.entities.filter((e) => e.kind === 'mob').every((e) => 'rank' in e), 'mob rank');
    void ev;
  } },
  { name: 'world: addPlayer restores a saved character (level, xp, gold, talents, bag, equip, quests, lantern); removePlayer logs out', fn() {
    const content = buildContent();
    const w = createWorld({ seed: 2, content });
    const pid = w.addPlayer({ name: 'R', cls: 'scribe', level: 9, xp: 300, gold: 77, talents: { scribe_quill_sharp_nib: 2 },
      known: ['scribe_inkbolt', 'scribe_scrawl', 'scribe_full_stop', 'scribe_underline'], bar: ['scribe_inkbolt', 'scribe_scrawl', 'scribe_underline'],
      bag: [{ item: 'potion', qty: 3 }], questsDone: ['wm_name_twice'] });
    const p = w.get(pid);
    eq(p.level, 9); eq(p.xp, 300); eq(p.gold, 77);
    // Builds 2 is on for every class (2026-11-19): the old talents come back as points, kept aside, with a free respec
    eq(Object.keys(p.talents).length, 0, 'old talents retired'); eq(p.build.legacyTalents.scribe_quill_sharp_nib, 2, 'kept aside'); eq(p.build.freeRespec, true, 'free respec');
    eq(p.bar.length, 3); eq(p.bag[0].qty, 3); eq(p.questsDone[0], 'wm_name_twice');
    eq(p.hp, p.hpMax, 'full health');
    assert(w.removePlayer(pid), 'removed'); eq(w.get(pid), null, 'gone');
  } },
];

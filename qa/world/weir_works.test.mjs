// The Weir Works (cap 35 stage 1, cave lane, 2026-11-27; docs/handoff/briefs/BRIEF_cap35_millrace.md section 4.1): the cave
// under Ferrick's Mill, its door in the undercroft, its copy rules, the Wheel-Keeper's fight on the live boss systems
// (the sweep's cadence, the rats at half, the frenzy, a lone hero's light hit), the drops and the daily chest, quests #10
// and #11 with #12 after them, and Ferrick's two places. Sim only, on the real content. The full chain #1 to #12 (with the
// cave entered by delve_enter) is qa/world/millrace_quests.test.mjs.
import { assert, eq, content, reachable } from './_harness.mjs';
import { createWorld } from '../../src/sim/index.js';
import { ZONES, PLACES } from '../../src/data/maps/index.js';
import { spotFree } from '../../src/sim/collision.js';
import { rollKill } from '../../src/sim/loot.js';
import { createRng } from '../../src/sim/rng.js';
import { DUNGEONS, DUNGEON_RULES } from '../../src/data/dungeons.js';
import { WW_QUESTS, WW_QUEST_ORDER, WW_NAMED_BAND, WW_NAMED_ROWS, WW_NPCS, WW_STORY_NPCS, KEEPER, WW_ITEMS } from '../../src/data/weir_works.js';
import { MR_QUESTS, MR_CAVE_XP_BUDGET, PAGES_EAST_AFTER, mrQuestXp } from '../../src/data/millrace_quests.js';
import { WEIR_WORKS_DOOR, HUB } from '../../tools/maps/zone_millrace.mjs';
import { ROOMS, POOLS, FERRICK_AT, KEEPER_AT, RATS_FROM, ARRIVAL } from '../../tools/maps/zone_weir_works.mjs';

const HZ = 20, TILE = 256, SUB = 16;
const noDash = (t) => !/[\u2013\u2014]/.test(t);
const tileOf = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];
const inRoom = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
const room = (id) => ROOMS.find((r) => r.id === id);
let CW = null;
/** The real content with only the npcs and the Millrace's spawns (the cave spawns per copy from its zone data). */
const contentW = () => CW || (CW = { ...content(), spawns: content().spawns.filter((s) => s.npc || s.zone === 'millrace'), nightSpawns: [] });
function run(w, n, pred = null) { const out = []; for (let i = 0; i < n; i++) { const ev = w.step(); out.push(...ev); if (pred && ev.some(pred)) break; } return out; }
/** A hero at the undercroft door's out cell, taken in with the real command. */
function enterCave(w, opts = {}) {
  const id = w.addPlayer({ name: 'Wren', cls: opts.cls || 'warden', zone: 'millrace', x: WEIR_WORKS_DOOR.out[0], y: WEIR_WORKS_DOOR.out[1], level: opts.level || 35, gearMode: 'design', ...(opts.extra || {}) });
  const p = w.get(id);
  w.enqueue(id, { t: 'delve_enter', door: 'weir_works' });
  const ev = run(w, 3);
  return { id, p, ev };
}
const mobsIn = (w, zid, tpl) => w.state.ents.filter((e) => e.kind === 'mob' && e.zone === zid && !e.dead && (!tpl || e.template === tpl));
/** Clear the trash, stand the hero 2.5 tiles south of the Keeper and pull it. */
function pullKeeper(w, p) {
  const m = mobsIn(w, p.zone, 'wheel_keeper')[0];
  for (const x of mobsIn(w, p.zone)) if (x !== m) w.internals.combat.kill(x, p);
  p.x = m.x; p.y = m.y + 40 * SUB; p.hp = p.hpMax;
  m.threat[p.id] = 100; w.internals.ai.engage(m, p, false); run(w, 2);
  return m;
}

export const tests = [
  {
    name: 'weir works: a cave of levels 33 to 35, one boss, its door the mill undercroft in the Millrace (no cave arch drawn there), the three rooms and halls, dark 0.45',
    fn() {
      const C = content(), D = C.dungeons.weir_works, Z = ZONES.weir_works;
      assert(D && PLACES.weir_works && Z, 'the place, its zone');
      eq(D.kind, 'cave'); eq(D.levels.join(','), '33,35'); eq(D.bosses.join(','), 'wheel_keeper'); eq(D.last, 'wheel_keeper');
      assert(!D.legendary && !D.rare, 'no legendary in this stage');
      eq(JSON.stringify([D.door.zone, D.door.x, D.door.y, D.door.w, D.door.h, D.door.out]), JSON.stringify(['millrace', WEIR_WORKS_DOOR.x, WEIR_WORKS_DOOR.y, WEIR_WORKS_DOOR.w, WEIR_WORKS_DOOR.h, WEIR_WORKS_DOOR.out]), 'the door is the zone lane`s spot');
      const dr = C.zones.millrace.doors.find((d) => d.id === 'weir_works');
      assert(dr && dr.mouth === false && dr.label === 'Cave, levels 33 to 35', 'the door in the Millrace, drawn by the mill itself');
      assert(!C.zones.world.joins.some((j) => j.to === 'weir_works'), 'not on the world');
      eq(Z.kind, 'cave'); eq(Z.lighting.dark, DUNGEON_RULES.dark.cave); eq(Z.lighting.dark, 0.45);
      eq(Z.areas.map((a) => a.name).join(','), 'The Undershot,The Wet Gallery,The Wheel Chamber');
      eq(Z.lanterns[0].id, 'ww_undershot'); assert(inRoom(room('ww_undershot'), Z.lanterns[0].x, Z.lanterns[0].y), 'the lantern in the Undershot');
      assert(inRoom(room('ww_undershot'), ...ARRIVAL), 'arrival in the Undershot');
      const ok = reachable('weir_works');
      for (const s of Z.spawns) assert(ok(s.x, s.y), `${s.mob} at ${s.x},${s.y} reachable`);
      for (const c of Z.dungeon.chests) assert(ok(c.x, c.y), `chest ${c.id}`);
      // the gallery's pool is walked round: north and south of it are both open, it blocks the straight line
      const [px, py, pw, ph] = POOLS.gallery;
      for (let y = py; y < py + ph; y++) eq(Z.collision[y][px + Math.floor(pw / 2)], '~', `the pool at ${y}`);
      assert(ok(28, py - 2) && ok(28, py + ph + 1) && ok(px - 2, py + 3) && ok(px + pw + 1, py + 3), 'the walk round the pool');
      // trash: weir-rats and drowned drovers (the zone lane's) in packs, the Keeper alone in the chamber
      const trash = Z.spawns.filter((s) => !s.boss);
      assert(trash.every((s) => ['weir_rat', 'drowned_drover'].includes(s.mob) && s.pack >= 2 && s.pack <= 3), 'packs of rats and drovers');
      assert(trash.filter((s) => inRoom(room('ww_gallery'), s.x, s.y)).length >= 10, 'the gallery`s packs');
      const k = Z.spawns.find((s) => s.boss);
      eq(k.mob, 'wheel_keeper'); eq(k.level, 35); assert(inRoom(room('ww_chamber'), k.x, k.y), 'the Keeper in the Wheel Chamber');
      for (const s of trash) assert(!inRoom(room('ww_chamber'), s.x, s.y), 'no trash in the chamber');
      // the look: the great wheel on the chamber's north wall over the race, turned to face the north-up camera; a small one
      const wheels = Z.millProps.filter((p) => p.t === 'mr_wheel');
      eq(wheels.length, 2, 'two wheels');
      const great = wheels.find((p) => p.keeper);
      assert(great && great.r === 90 && great.scale > 1.2 && great.y < room('ww_chamber').y + 3, 'the great wheel, north wall, facing the camera');
      assert(wheels.some((p) => !p.keeper && p.r === 90 && p.scale < 1 && inRoom(room('ww_gallery'), Math.floor(p.x), Math.floor(p.y))), 'the small wheel in the gallery');
      const lamps = Z.decor.filter((d) => d.t === 'lamp_post' && inRoom(room('ww_chamber'), d.x, d.y));
      assert(lamps.length >= 4 && lamps.every((d) => Math.hypot(d.x - KEEPER_AT[0], d.y - KEEPER_AT[1]) <= 15), 'lamp posts round the Keeper`s floor');
      assert(Z.decor.filter((d) => d.t === 'dg_brazier').length >= 4 && Z.decor.some((d) => d.t === 'dg_torch'), 'braziers and torches (fire lights)');
      assert(Z.decor.some((d) => d.t === 'dg_chain') && Z.decor.some((d) => /crate/.test(d.t)), 'chains and crates');
      eq(Z.legend['#'], 'x1_crag_top'); eq(Z.legend['~'], 'x1_tarn');
      assert(noDash(Z.flavour) && Z.signs.every((s) => noDash(s.text)), 'no dashes');
    },
  },
  {
    name: 'weir works: delve_enter at the undercroft takes a hero into their own copy at the Undershot (the lantern binds there); the exit puts them back outside the door',
    fn() {
      const w = createWorld({ seed: 3, content: contentW() });
      const { id, p, ev } = enterCave(w);
      assert(/^weir_works#/.test(p.zone), `in a copy (${p.zone})`);
      assert(ev.some((x) => x.type === 'delve_enter' && x.place === 'weir_works'), 'the delve_enter event');
      eq(tileOf(p).join(','), ARRIVAL.join(','), 'at the arrival');
      eq(p.lantern.zone, p.zone); eq(p.lantern.id, 'ww_undershot', 'the cave lantern binds');
      // a second hero gets a copy of their own
      const b = enterCave(w);
      assert(b.p.zone !== p.zone && /^weir_works#/.test(b.p.zone), 'each its own copy');
      // copy rules: no foe respawns; the exit join under the Undershot goes back to the door's out
      for (const m of mobsIn(w, p.zone)) assert(m.spawn.noRespawn && m.spawn.copy === p.zone, `${m.template}: no respawn`);
      w.enqueue(id, { t: 'move', dx: 0, dy: 1 });
      const ev2 = run(w, 160, (x) => x.type === 'zone' && x.id === id).find((x) => x.type === 'zone' && x.id === id);
      w.enqueue(id, { t: 'stop' }); run(w, 2);
      assert(ev2 && ev2.to === 'millrace', `out to the Millrace (${JSON.stringify(ev2)})`);
      eq(tileOf(p).join(','), WEIR_WORKS_DOOR.out.join(','), 'on the door`s out');
    },
  },
  {
    name: 'weir works: the boss stays dead in its copy; death inside wakes you at the Undershot`s lantern',
    fn() {
      const w = createWorld({ seed: 4, content: contentW() });
      const { p } = enterCave(w);
      const zid = p.zone;
      const m = mobsIn(w, zid, 'wheel_keeper')[0];
      m.tagger = p.id; w.internals.combat.kill(m, p); run(w, 20 * 60);
      eq(mobsIn(w, zid, 'wheel_keeper').length, 0, 'still dead a minute later');
      const rat = mobsIn(w, zid, 'weir_rat')[0];
      w.internals.combat.dealDamage(rat, p, p.hp + 99999, { ability: 'test', school: 'physical', canCrit: false });
      run(w, 20 * 5);
      assert(!p.dead, 'awake'); eq(p.zone, zid, 'in the copy');
      eq(tileOf(p).join(','), [ZONES.weir_works.lanterns[0].x, ZONES.weir_works.lanterns[0].y].join(','), 'at the cave lantern');
    },
  },
  {
    name: 'wheel-keeper: level 35 construct, its card, a slow smash, the sweep on the live boss frame every 10 s (7 s under half), its own red slot',
    fn() {
      const C = content(), K = C.mobs.wheel_keeper;
      eq(K.card, 'THE WHEEL-KEEPER. It was set to count what the water washed off. It is still counting.');
      eq(K.level.join(','), '35,35'); eq(K.family, 'construct'); assert(K.boss && K.elite, 'a boss');
      assert(noDash(K.card) && noDash(K.deathLine) && K.fight.phases.every((ph) => !ph.yell || noDash(ph.yell)) && noDash(K.fight.frenzy.yell), 'no dashes');
      const smash = C.mobAbilities[K.abilities[0].id];
      assert(smash.castTime >= 2 && smash.telegraph === 'circle' && smash.area.at === 'ground', 'a slow smash on the ground where its target stood');
      const f = C.bossFights.wheel_keeper, sw = C.mobAbilities[f.red.id];
      assert(sw && sw.red && sw.area.shape === 'line' && sw.telegraph === 'line', 'the sweep is a line in the red slot');
      eq(f.red.every, 10); eq(f.red.faster.every, 7); eq(f.red.faster.below, 0.5);
      // in a copy: the sweep's cadence
      const w = createWorld({ seed: 5, content: contentW() });
      const { p } = enterCave(w);
      const m = pullKeeper(w, p);
      const at = [];
      for (let i = 0; i < 20 * 40; i++) { p.hp = p.hpMax; const ev = w.step(); if (ev.some((x) => x.type === 'boss_red' && x.id === m.id)) at.push(w.state.tick); }
      assert(at.length >= 3, `sweeps in 40 s: ${at.length}`);
      for (let i = 1; i < at.length; i++) assert(at[i] - at[i - 1] >= 10 * HZ && at[i] - at[i - 1] <= 10 * HZ + 10, `about every 10 s (${at[i] - at[i - 1]} ticks)`);
      const bf = w.snapshot().entities.find((e) => e.id === m.id).bossFight;
      assert(bf && bf.frenzyIn != null, 'on the live boss frame');
      // under half: about every 7 s
      m.hp = Math.round(m.hpMax * 0.45);
      const at2 = [];
      for (let i = 0; i < 20 * 40; i++) { p.hp = p.hpMax; m.hp = Math.min(m.hp, Math.round(m.hpMax * 0.45)); const ev = w.step(); if (ev.some((x) => x.type === 'boss_red' && x.id === m.id)) at2.push(w.state.tick); }
      const gaps = at2.slice(1).map((t, i) => t - at2[i]);
      assert(gaps.length >= 3 && gaps.slice(1).every((g) => g >= 7 * HZ && g <= 7 * HZ + 10), `about every 7 s under half (${gaps.join(',')})`);
    },
  },
  {
    name: 'wheel-keeper: alone, a sweep that lands is a light hit (a time tax, never a one-shot); with a friend it is the full sweep',
    fn() {
      const w = createWorld({ seed: 6, content: contentW() });
      const { p } = enterCave(w);
      const m = pullKeeper(w, p);
      let mark = null, dmg = [];
      for (let i = 0; i < 20 * 30 && !dmg.length; i++) {
        p.hp = p.hpMax;
        // stand on the line: right where the sweep points
        const ev = w.step();
        mark = mark || (m.ai.bm && m.ai.bm.marks.find((x) => x.kind === 'red'));
        dmg = ev.filter((x) => x.type === 'damage' && x.dst === p.id && x.ability === 'bf_wheel_sweep');
      }
      assert(mark, 'a sweep came');
      eq(mark.hit, KEEPER.soloHit, 'a lone hero`s sweep is the light hit');
      assert(dmg.length === 1, 'the sweep landed on a hero who stood in it');
      const pct = dmg[0].amount / p.hpMax;
      assert(pct > 0 && pct < 0.3, `a lone hero takes ${(100 * pct).toFixed(1)}% of their health from a sweep`);
      // with a friend: the mark carries the full hit
      const w2 = createWorld({ seed: 6, content: contentW() });
      const a = enterCave(w2).p;
      const bId = w2.addPlayer({ name: 'Two', cls: 'mender', level: 35, gearMode: 'design' });
      w2.setParty(a.id, 1); w2.setParty(bId, 1);
      const b2 = w2.get(bId);
      b2.zone = a.zone; b2.x = a.x + 3 * TILE; b2.y = a.y;
      const m2 = pullKeeper(w2, a);
      b2.x = m2.x + 2 * TILE; b2.y = m2.y + 2 * TILE;
      let mk = null;
      for (let i = 0; i < 20 * 30 && !mk; i++) { a.hp = a.hpMax; b2.hp = b2.hpMax; w2.step(); mk = m2.ai.bm && m2.ai.bm.marks.find((x) => x.kind === 'red'); }
      assert(mk, 'a sweep with friends');
      eq(mk.hit, w2.content.mobAbilities.bf_wheel_sweep.mobHit, 'the full sweep');
      assert(mk.hit > KEEPER.soloHit, 'heavier than alone');
    },
  },
  {
    name: 'wheel-keeper: at half it yells and two weir-rats drop from the race; frenzy at 300 s; a reset sends the rats away',
    fn() {
      const w = createWorld({ seed: 7, content: contentW() });
      const { p } = enterCave(w);
      const m = pullKeeper(w, p);
      m.hp = Math.round(m.hpMax * 0.49);
      const ev = run(w, 2);
      assert(ev.some((x) => x.type === 'yell' && x.id === m.id && x.text === 'TWO SHORT. THE RACE OWES ME TWO.'), 'the yell');
      const rats = mobsIn(w, p.zone, 'weir_rat').filter((r) => r.bossAdd === m.id);
      eq(rats.length, KEEPER.rats, 'two weir-rats');
      for (const r of rats) assert(Math.hypot(tileOf(r)[0] - RATS_FROM[0], tileOf(r)[1] - RATS_FROM[1]) <= 3, `from the race (${tileOf(r)})`);
      assert(!m.auras.some((a) => a.id === 'bf_guard'), 'alone, the gate does not guard it');
      // frenzy: 300 s into the fight
      m.ai.boss.t0 = w.state.tick - (KEEPER.frenzyAfter - 1) * HZ;
      p.hp = p.hpMax;
      assert(!run(w, 2).some((x) => x.type === 'boss' && x.kind === 'frenzy'), 'not at 299 s');
      p.hp = p.hpMax;
      const fz = run(w, 30);
      assert(fz.some((x) => x.type === 'boss' && x.kind === 'frenzy' && x.id === m.id), 'frenzy at 300 s');
      assert(m.auras.some((a) => a.id === 'boss_frenzy'), 'the frenzy buff');
    },
  },
  {
    name: 'weir works drops: a rare ilvl 35 from the Keeper (no legendary), the chest, the daily chest (55 minutes of XP, ilvl 35, glyphs, gold), 8% magic ilvl 34 pieces from foes in the cave only',
    fn() {
      const C = content(), D = C.dungeons.weir_works;
      for (const id of D.drops.wheel_keeper) { const it = C.items[id]; assert(it && it.rarity === 'rare' && it.level === 35 && noDash(it.name), `${id}: rare, ilvl 35`); }
      eq(D.daily.xpMinutes, 55); eq(D.daily.ilvl, 35); assert(D.daily.glyphs >= 3 && D.daily.gold[0] > 0, 'glyphs and gold'); eq(D.chest.ilvl, 35);
      const pend = [];
      const w = createWorld({ seed: 8, content: contentW(), day: 900, systems: [{ tick() { for (const f of pend.splice(0)) f(); } }] });
      const { id, p } = enterCave(w);
      const m = mobsIn(w, p.zone, 'wheel_keeper')[0];
      m.tagger = p.id;
      pend.push(() => w.internals.combat.dealDamage(p, m, m.hp + 99999, { ability: 'test', school: 'physical', canCrit: false }));
      const ev = run(w, 2);
      const dl = ev.find((x) => x.type === 'dloot' && x.id === p.id);
      assert(dl && dl.items.some((x) => D.drops.wheel_keeper.includes(x.item)), `a Keeper rare (${JSON.stringify(dl)})`);
      assert(!ev.some((x) => x.type === 'legendary'), 'no legendary');
      assert(ev.find((x) => x.type === 'dungeon_clear' && x.place === 'weir_works').first, 'first clear of the day');
      const chest = w.state.ents.find((e) => e.zone === p.zone && e.dchest && e.dchest.kind === 'daily');
      assert(chest, 'the daily chest by the Keeper');
      p.x = chest.x; p.y = chest.y;
      const gold0 = p.gold;
      w.enqueue(id, { t: 'interact', id: chest.id });
      const open = w.step().find((x) => x.type === 'chest_open');
      assert(open && open.kind === 'daily' && open.glyphs.length === D.daily.glyphs && open.gold >= D.daily.gold[0] && open.xp > 0, `opened: ${JSON.stringify(open)}`);
      assert(p.gold > gold0, 'gold');
      const cache = w.state.ents.find((e) => e.zone === p.zone && e.dchest && e.dchest.kind === 'cache');
      assert(cache, 'the Keeper`s Tally Box');
      // the way in: 8% named magic ilvl 34 from foes in a Weir Works copy, none from the same foes outside
      eq(WW_NAMED_ROWS.length, 4);
      for (const [nid] of WW_NAMED_ROWS) { const it = C.items[nid]; assert(it.rarity === 'magic' && it.level === 34 && noDash(it.name), `${nid}: magic, ilvl 34`); }
      const named = new Set(WW_NAMED_BAND.items);
      const count = (zone) => { const rng = createRng(31); let n = 0; for (let i = 0; i < 2000; i++) n += rollKill({ content: C, rng, questNeeds: () => false }, { template: 'drowned_drover', level: 34, zone }, { level: 35, cls: 'warden' }).items.filter((x) => named.has(x.item)).length; return n; };
      const inCave = count('weir_works#12');
      assert(inCave >= 110 && inCave <= 220, `about 8% in the cave (${inCave} in 2000)`);
      eq(count('millrace'), 0, 'none outside');
      assert(!Object.values(WW_ITEMS).some((it) => it.rarity === 'legendary'), 'no legendary item');
    },
  },
  {
    name: 'weir works quests: #10 Down the Undershot (33, 3,030 XP) and #11 The Wheel Still Turns (35, 8,380 XP) by the zone`s formula; #12 now follows #11; no dashes',
    fn() {
      const C = content();
      eq(WW_QUEST_ORDER.join(','), 'mr_down_the_undershot,mr_wheel_still_turns');
      const q10 = C.quests.mr_down_the_undershot, q11 = C.quests.mr_wheel_still_turns;
      eq(q10.name, 'Down the Undershot'); eq(q10.level, 33); eq(q10.rewards.xp, mrQuestXp(33, 0.3)); eq(q10.rewards.xp, 3030);
      eq(q11.name, 'The Wheel Still Turns'); eq(q11.level, 35); eq(q11.rewards.xp, mrQuestXp(35, 0.75)); eq(q11.rewards.xp, 8380);
      eq(q10.rewards.xp + q11.rewards.xp, MR_CAVE_XP_BUDGET, 'the share the zone lane left');
      eq(PAGES_EAST_AFTER, 'mr_wheel_still_turns'); eq(C.quests.mr_pages_to_the_east.requires.quests.join(), 'mr_wheel_still_turns', '#12 follows #11');
      eq(`${q10.chain.step},${q11.chain.step},${C.quests.mr_pages_to_the_east.chain.step}`, '10,11,12', 'the chain steps');
      assert(q11.requires.quests.includes('mr_down_the_undershot') && q11.requires.quests.includes('mr_who_broke_the_weir'), '#11 after #10 and #9');
      assert(q10.requires.quests.every((r) => MR_QUESTS[r]), '#10 opens from the zone chain');
      eq(q10.giver, 'mr_clerk'); eq(q10.turnIn, 'mr_ferrick_hurt'); eq(q11.giver, 'mr_ferrick_hurt'); eq(q11.turnIn, 'mr_clerk');
      assert(q10.objectives[0].kind === 'explore' && q10.objectives[0].zone === 'weir_works' && ZONES.weir_works.areas.some((a) => a.id === q10.objectives[0].area), 'explore the Undershot');
      assert(q11.objectives.some((o) => o.kind === 'kill' && o.mob === 'wheel_keeper'), 'the Keeper');
      const dd = q11.objectives.find((o) => o.mob === 'drowned_drover');
      assert(dd.zone === 'weir_works' && ZONES.weir_works.spawns.filter((s) => s.mob === 'drowned_drover').length >= dd.count, 'enough drovers in the cave');
      for (const q of [q10, q11]) {
        assert(C.sideQuests.includes(q.id), `${q.id}: offered`);
        for (const t of [q.name, ...Object.values(q.text), ...q.objectives.map((o) => o.label)]) assert(noDash(t), `${q.id}: no dashes in ${t}`);
        for (const r of q.rewards.choice) assert(C.items[r] && C.items[r].reqLevel <= q.minLevel + 2, `${r} wearable`);
      }
      // a drowned drover killed in a copy counts for the place's kill objective; one in the open Millrace does not
      const w = createWorld({ seed: 9, content: contentW() });
      const id = w.addPlayer({ name: 'Q', cls: 'warden', zone: 'millrace', x: 80, y: 44, level: 35 });
      const p = w.get(id);
      p.quests.mr_wheel_still_turns = { state: 'active', counts: [0, 0], at: 0 };
      w.quests.onKill(p, { template: 'drowned_drover', zone: 'millrace', id: -1 });
      eq(p.quests.mr_wheel_still_turns.counts[0], 0, 'not outside');
      w.quests.onKill(p, { template: 'drowned_drover', zone: 'weir_works#3', id: -2 });
      eq(p.quests.mr_wheel_still_turns.counts[0], 1, 'inside a copy');
    },
  },
  {
    name: 'Ferrick: hurt in the Wet Gallery of each copy (talking to him hands in #10 and gives #11); gone from copies made after #11; then at the mill door for good',
    fn() {
      const C = contentW();
      for (const n of Object.values(WW_NPCS)) for (const t of [n.name, n.title, ...n.talk]) assert(noDash(t), `no dashes: ${t}`);
      assert(WW_NPCS.mr_ferrick.talk.some((t) => /broke it on purpose/.test(t) && /names off the ledgers/.test(t)), 'he tells you why the weir broke');
      assert(!C.spawns.some((s) => s.npc === 'mr_ferrick' || s.npc === 'mr_ferrick_hurt'), 'neither is a world spawn');
      assert(inRoom(room('ww_gallery'), ...FERRICK_AT) && ZONES.weir_works.collision[FERRICK_AT[1]][FERRICK_AT[0]] === '.', 'his spot is gallery floor');
      const s = WW_STORY_NPCS[0];
      assert(spotFree(ZONES.millrace, s.x, s.y) && reachable('millrace')(s.x, s.y), 'the mill spot is free and reachable');
      assert(s.x >= HUB.plaza.x0 && s.x <= HUB.plaza.x1 && s.y >= HUB.plaza.y0 && s.y <= HUB.plaza.y1, 'on the mill plaza');
      const w = createWorld({ seed: 10, content: C });
      const ferrickAt = (zone) => w.state.ents.filter((e) => e.kind === 'npc' && e.zone === zone && /^mr_ferrick/.test(e.template));
      eq(ferrickAt('millrace').length, 0, 'not at the mill before the cave');
      const { id, p } = enterCave(w, { extra: { questsDone: ['mr_chain_comes_down', 'mr_wet_pages', 'mr_ferricks_marks', 'mr_the_upper_weir', 'mr_who_broke_the_weir'] } });
      const hurt = ferrickAt(p.zone);
      eq(hurt.length, 1, 'Ferrick in the copy'); eq(hurt[0].template, 'mr_ferrick_hurt');
      eq(tileOf(hurt[0]).join(','), FERRICK_AT.join(','), 'in the Wet Gallery');
      // #10: accepted at the clerk (given here), done on arrival, handed in to Ferrick: he gives #11
      p.quests.mr_down_the_undershot = { state: 'active', counts: [0], at: 0 };
      w.quests.onMove(p);
      eq(w.quests.status(p, 'mr_down_the_undershot'), 'ready', 'the Undershot reached');
      p.x = hurt[0].x + 8 * SUB; p.y = hurt[0].y;
      eq(w.quests.marker(p, 'mr_ferrick_hurt'), '?', 'he has your hand-in');
      w.enqueue(id, { t: 'quest_turnin', quest: 'mr_down_the_undershot', npc: hurt[0].id, choice: 0 }); run(w, 2);
      assert(p.questsDone.includes('mr_down_the_undershot'), '#10 handed in to Ferrick');
      eq(w.quests.status(p, 'mr_wheel_still_turns'), 'available', 'he offers #11');
      w.enqueue(id, { t: 'quest_accept', quest: 'mr_wheel_still_turns', npc: hurt[0].id }); run(w, 2);
      eq(w.quests.status(p, 'mr_wheel_still_turns'), 'active');
      // finish #11 and hand it in to the clerk: Ferrick stands at the mill
      for (const d of mobsIn(w, p.zone, 'drowned_drover').slice(0, 4)) { d.tagger = p.id; w.internals.combat.kill(d, p); }
      const k = mobsIn(w, p.zone, 'wheel_keeper')[0]; k.tagger = p.id; w.internals.combat.kill(k, p); run(w, 2);
      eq(w.quests.status(p, 'mr_wheel_still_turns'), 'ready');
      const clerk = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'mr_clerk');
      p.zone = clerk.zone; p.x = clerk.x + 8 * SUB; p.y = clerk.y;
      p.bag = []; p.pendingLoot = [];
      w.enqueue(id, { t: 'quest_turnin', quest: 'mr_wheel_still_turns', npc: clerk.id, choice: 0 }); run(w, 2);
      assert(p.questsDone.includes('mr_wheel_still_turns'), '#11 handed in');
      const back = ferrickAt('millrace');
      eq(back.length, 1, 'Ferrick at the mill'); eq(back[0].template, 'mr_ferrick');
      eq(tileOf(back[0]).join(','), [s.x, s.y].join(','), 'by the mill door');
      eq(w.quests.status(p, 'mr_pages_to_the_east'), 'available', '#12 opens');
      // a hero who loads with #11 done brings him back to a fresh world; a copy made for them has no hurt Ferrick
      const w2 = createWorld({ seed: 11, content: C });
      const b = enterCave(w2, { extra: { questsDone: ['mr_down_the_undershot', 'mr_wheel_still_turns'] } });
      eq(w2.state.ents.filter((e) => e.kind === 'npc' && e.template === 'mr_ferrick' && e.zone === 'millrace').length, 1, 'at the mill after a load');
      eq(w2.state.ents.filter((e) => e.kind === 'npc' && e.zone === b.p.zone).length, 0, 'not hurt in the cave any more');
    },
  },
];

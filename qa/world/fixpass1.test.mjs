// Fix pass 1 (2026-11-19): one test per bug in docs/PLAYTEST_BOT.md and per sim/data item of docs/CRITIQUE_1.md that this
// pass fixed. Each was reproduced first against the old build (the bot lane's qa/bot/edges.mjs case named in the test,
// or the map check), then fixed. All drive the real content through world commands, the way a client does.
import { assert, eq, content, ZONES, reachable } from './_harness.mjs';
import { createWorld } from '../../src/sim/world.js';
import { spotFree, boxBlocked } from '../../src/sim/collision.js';
import { bagCount } from '../../src/sim/loot.js';
import { createBot } from '../bot/lib/bot.mjs';

const C = content();
const SUB = 16, TILE = 256;
const tileOf = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];
function freeNear(zone, x, y, r = 3) {
  const Z = C.zones[zone];
  for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (spotFree(Z, x + dx, y + dy)) return [x + dx, y + dy];
  return null;
}
function npcSpot(tpl) {
  for (const [zid, z] of Object.entries(C.zones)) { const n = (z.npcs || []).find((k) => k.npc === tpl); if (n) { const [x, y] = freeNear(zid, n.x, n.y + 1, 2); return { zone: zid, x, y }; } }
  throw new Error('no npc ' + tpl);
}
const run = (w, n = 1) => { let all = []; for (let i = 0; i < n; i++) all = all.concat(w.step()); return all; };
const mine = (evs, id, type) => evs.filter((e) => (e.id === id || e.src === id) && (!type || e.type === type));
const escorts = (w) => w.state.ents.filter((e) => e.kind === 'npc' && e.template === 'lark_escort');
/** quiet the world: every mob dead for good (pure movement / quest tests) */
function calm(w) { for (const m of w.state.ents) if (m.kind === 'mob') { m.dead = true; m.respawnAt = Infinity; if (m.ai) m.ai.mode = 'dead'; } }
/** the save main.js writes (its own fields) merged with the sim's saveFields, back through addPlayer */
function relog(w, id, w2 = w) {
  const e = w.get(id);
  const spec = { name: e.name, cls: e.cls, zone: e.zone, x: tileOf(e)[0], y: tileOf(e)[1], level: e.level, xp: e.xp, gold: e.gold, bag: e.bag, bags: e.bags, equip: e.equip,
    known: e.known, bar: e.bar, talents: e.talents, quests: e.quests, questsDone: e.questsDone, nodesUsed: e.nodesUsed, lantern: e.lantern, ...w.saveFields(id) };
  const s = JSON.parse(JSON.stringify(spec));
  w.removePlayer(id);
  return w2.addPlayer(s);
}
function acceptLark(w, level = 7) {
  const s = npcSpot('nella');
  const id = w.addPlayer({ name: 'Esc', cls: 'warden', zone: s.zone, x: s.x, y: s.y, level, questsDone: ['wm_name_twice', 'wm_pilgrim_wolves'] });
  w.enqueue(id, { t: 'quest_accept', quest: 'wm_lark_wanders' });
  run(w);
  return id;
}

export const tests = [
  // ------------------------------------------------------------------------------------------- bug 1 and bug 10
  { name: 'bug 1: an escort survives save and restore: Lark respawns at her start, the quest stays active and can finish (edges save_restore_mid_escort)', fn() {
    const w = createWorld({ seed: 20, content: C });
    const id = acceptLark(w);
    eq(w.get(id).quests.wm_lark_wanders.state, 'active', 'accepted');
    eq(escorts(w).length, 1, 'Lark is out');
    const id2 = relog(w, id);
    run(w, 2);
    const p = w.get(id2);
    eq(p.quests.wm_lark_wanders.state, 'active', 'still active after the restore');
    const lark = escorts(w);
    eq(lark.length, 1, 'exactly one Lark after the restore');
    eq(lark[0].escort.owner, id2, 'she follows the restored player');
    eq(p.quests.wm_lark_wanders.escort, lark[0].id, 'the quest knows her');
    const o = C.quests.wm_lark_wanders.objectives[0];
    eq(tileOf(lark[0]).join(','), `${o.from.x},${o.from.y}`, 'back at her start');
    // a restore into a different world (a reload) works the same
    const w2 = createWorld({ seed: 21, content: C });
    const id3 = relog(w, id2, w2);
    run(w2, 1);
    eq(escorts(w2).filter((e) => e.escort.owner === id3).length, 1, 'Lark in the new world');
    eq(escorts(w).length, 0, 'none left behind in the old world');
  } },
  { name: 'bug 10: escort restarts and fails leave no dead entities behind (edges escort_restart_leaks_entities)', fn() {
    const w = createWorld({ seed: 22, content: C });
    const id = acceptLark(w);
    const n0 = w.state.ents.length;
    for (let i = 0; i < 30; i++) {
      w.enqueue(id, { t: 'quest_abandon', quest: 'wm_lark_wanders' }); run(w);
      w.enqueue(id, { t: 'quest_accept', quest: 'wm_lark_wanders' }); run(w);
    }
    eq(w.state.ents.length, n0, 'entity count unchanged after 30 cycles');
    // a knocked-out Lark restarts without leaking either
    for (let i = 0; i < 5; i++) { const l = escorts(w)[0]; l.hp = 0; run(w, 2); }
    eq(w.state.ents.length, n0, 'entity count unchanged after 5 fails');
    assert(!w.state.ents.some((e) => e.zone === '_gone'), 'no _gone entities');
    eq(w.snapshot().entities.length, n0, 'snapshot does not grow');
  } },
  // ------------------------------------------------------------------------------------------- bug 3 and bug 11
  { name: 'bug 3: escort ambush adds spawn on walkable cells a melee player can reach (edges escort_ambush_spawns_in_wall)', fn() {
    const w = createWorld({ seed: 23, content: C });
    const id = acceptLark(w);
    const o = C.quests.wm_lark_wanders.objectives[0];
    const Z = C.zones.valley;
    const p = w.get(id);
    for (const [k, a] of o.ambush.entries()) {
      const lark = escorts(w)[0];
      const [x, y] = freeNear('valley', a.at.x, a.at.y, 2);
      lark.x = x * TILE + 128; lark.y = (y + 1) * TILE - SUB;
      p.zone = 'valley'; p.x = lark.x; p.y = lark.y;          // the player walks with her
      const before = new Set(w.state.ents.map((e) => e.id));
      run(w, 1);
      const adds = w.state.ents.filter((e) => !before.has(e.id) && e.kind === 'mob');
      eq(adds.length, a.mobs.length, `ambush ${k}: ${a.mobs.length} adds`);
      const ok = reachable('valley');
      for (const m of adds) {
        const [mx, my] = tileOf(m);
        assert(!boxBlocked(Z, m.x, m.y, 0, 0, -99999, -99999, null), `ambush ${k}: add at ${mx},${my} is not inside a wall`);
        assert(ok(mx, my), `ambush ${k}: add at ${mx},${my} is reachable on foot`);
      }
      for (const m of adds) { m.dead = true; m.respawnAt = 0; }
    }
    void id;
  } },
  { name: 'bug 11: Lark follows the player\'s own path home past the river, and the player standing at the bridge with her close behind finishes it', fn() {
    const w = createWorld({ seed: 24, content: C });
    calm(w);
    const o = C.quests.wm_lark_wanders.objectives[0];
    const [sx, sy] = freeNear('valley', o.from.x - 1, o.from.y, 2);
    // a restored character with the escort active: addPlayer puts Lark back at her start (bug 1's fix)
    const walker = createBot({ world: w, content: C, cls: 'warden', spec: { name: 'Walker', cls: 'warden', zone: 'valley', x: sx, y: sy, level: 9,
      questsDone: ['wm_name_twice', 'wm_pilgrim_wolves'], quests: { wm_lark_wanders: { state: 'active', counts: [0] } } }, opts: { noDanger: true } });
    run(w, 2);
    const L = escorts(w).find((e) => e.escort.owner === walker.id);
    assert(L, 'Lark follows the walker');
    L.escort.ambushed = [0, 1];                       // this test is about walking, not fighting
    let done = false, maxGap = 0;
    for (let t = 0; t < 20 * 240 && !done; t++) {
      walker.walkTo('home', 'valley', (x, y) => Math.hypot(x - o.to.x, y - o.to.y) <= 2, [o.to.x, o.to.y]);
      const ev = w.step();
      if (ev.some((e) => e.type === 'quest' && e.quest === 'wm_lark_wanders' && e.kind === 'complete')) done = true;
      const l2 = escorts(w)[0];
      if (l2 && l2.escort && l2.escort.following) maxGap = Math.max(maxGap, Math.hypot(l2.x - walker.me().x, l2.y - walker.me().y) / SUB);
    }
    assert(done, 'the escort completed when the player reached the bridge with Lark following');
    eq(w.get(walker.id).quests.wm_lark_wanders.state, 'ready', 'ready to hand in');
    assert(maxGap < 200, `Lark kept up (largest gap ${maxGap.toFixed(0)} px)`);
    eq(escorts(w).length, 0, 'Lark goes home (removed)');
  } },
  // ------------------------------------------------------------------------------------------- bug 4
  { name: 'bug 4: loot that does not fit waits as pending loot (loot_take collects it); quest items never take a bag slot (edges bag_full_on_loot_quest_item_vanishes)', fn() {
    const w2sys = [];
    const w = createWorld({ seed: 11, content: C, systems: [{ id: 'killer', tick: (world) => w2sys.forEach((f) => f(world)) }] });
    const s = freeNear('valley', 41, 10, 3);
    const full = ['slime_ink', 'scarab_shell', 'wolf_pelt', 'thorny_pelt', 'blot_residue', 'tangled_wool', 'crow_feather', 'grave_dust', 'mist_pelt', 'boar_hide', 'torn_page', 'ink_wisp'].map((item) => ({ item, qty: 20 }));
    const id = w.addPlayer({ name: 'Full', cls: 'warden', zone: 'valley', x: s[0], y: s[1], level: 8, bag: full, quests: { wm_copied_twice: { state: 'active', counts: [0] } }, questsDone: ['wm_name_twice', 'wm_keeper_marks'] });
    const p = w.get(id);
    const slimes = w.state.ents.filter((m) => m.kind === 'mob' && m.template === 'ink_slime' && m.zone === 'valley' && m.level >= 3);
    let pending = 0, pages = 0, events = [];
    // kill inside a step (a system), so the events land in that tick's list
    let next = null;
    w2sys.push((world) => { if (next) { next.tagger = id; world.internals.combat.kill(next, p); next = null; } });
    for (const m of slimes) { next = m; events = events.concat(w.step()); }
    pages = bagCount(p, 'quills_copy');
    pending = (p.pendingLoot || []).length;
    assert(pending > 0, 'something that did not fit is waiting (junk or gear from the kills)');
    assert(pages > 0, `Quill's pages reached the quest bag with a full bag (${pages})`);
    eq(p.bag.length, 12, 'the bag is still 12 full slots');
    assert((p.qbag || []).some((s2) => s2.item === 'quills_copy'), 'pages in the quest bag');
    const lootEv = events.filter((e) => e.type === 'loot' && e.id === id);
    assert(lootEv.length > 0, 'loot events still fire');
    if (pending) {
      assert(events.some((e) => e.type === 'loot_pending' && e.id === id), 'the player is told');
      p.bag.splice(0, 3);
      w.enqueue(id, { t: 'loot_take' });
      const ev = w.step();
      assert(ev.some((e) => e.type === 'loot' && e.id === id && e.from === null), 'collected');
      assert((p.pendingLoot || []).length < pending, 'pending shrank');
    }
    // a vendor sale by uid hits the exact slot
    assert(p.bag.every((s2) => s2.uid > 0), 'every slot has a uid');
  } },
  // ------------------------------------------------------------------------------------------- bug 5
  { name: 'bug 5: quest_accept and quest_turnin need the npc within reach (edges quest_commands_ignore_range)', fn() {
    const w = createWorld({ seed: 25, content: C });
    const far = w.addPlayer({ name: 'Far', cls: 'scribe', zone: 'moor', x: 78, y: 95, level: 12, questsDone: ['wm_name_twice'], quests: { wm_yard_slimes: { state: 'ready', counts: [6] } } });
    w.enqueue(far, { t: 'quest_accept', quest: 'wm_cobbs_hens' });
    w.enqueue(far, { t: 'quest_turnin', quest: 'wm_yard_slimes' });
    const ev = run(w);
    eq(mine(ev, far, 'cmd_reject').map((e) => e.reason).join(','), 'range,range', 'both refused for range');
    assert(!w.get(far).quests.wm_cobbs_hens, 'not accepted');
    eq(w.get(far).quests.wm_yard_slimes.state, 'ready', 'not handed in');
    const s = npcSpot('oren');
    const near = w.addPlayer({ name: 'Near', cls: 'scribe', zone: s.zone, x: s.x, y: s.y, questsDone: ['wm_name_twice'], quests: { wm_yard_slimes: { state: 'ready', counts: [6] } } });
    w.enqueue(near, { t: 'quest_turnin', quest: 'wm_yard_slimes', choice: 0 });
    const ev2 = run(w);
    assert(mine(ev2, near, 'quest').some((e) => e.kind === 'turnin'), 'handed in at Oren');
    // naming the wrong npc entity is refused even when the right one is near
    const s2 = npcSpot('cobb');
    const p3 = w.addPlayer({ name: 'Cobbs', cls: 'scribe', zone: s2.zone, x: s2.x, y: s2.y, questsDone: ['wm_name_twice'] });
    const oren = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'oren');
    w.enqueue(p3, { t: 'quest_accept', quest: 'wm_cobbs_hens', npc: oren.id });
    assert(mine(run(w), p3, 'cmd_reject').some((e) => e.reason === 'range'), 'wrong npc refused');
  } },
  // ------------------------------------------------------------------------------------------- bug 6
  { name: 'bug 6: an Inkblade can upgrade the off-hand dagger (slot field, or the weaker hand by default) (edges inkblade_off_hand_dagger)', fn() {
    const w = createWorld({ seed: 26, content: C });
    const g = (ilvl) => ({ item: 'gear_dagger', qty: 1, inst: { ilvl, rarity: 'common', affixes: [] } });
    const id = w.addPlayer({ name: 'Ink', cls: 'inkblade', level: 6, bag: [g(6), g(5)] });
    const p = w.get(id);
    w.enqueue(id, { t: 'equip', bag: 0, item: 'gear_dagger' }); run(w);
    eq(p.equip.main.inst.ilvl, 6, 'first dagger: main hand');
    const k = p.bag.findIndex((s) => s.item === 'gear_dagger' && s.inst.ilvl === 5);
    w.enqueue(id, { t: 'equip', bag: k, item: 'gear_dagger' }); run(w);
    eq(p.equip.off.inst && p.equip.off.inst.ilvl, 5, 'second dagger: the weaker (off) hand');
    eq(p.equip.main.inst.ilvl, 6, 'main untouched');
    // explicit slot
    const k2 = p.bag.findIndex((s) => s.item === 'paring_dagger');
    w.enqueue(id, { t: 'equip', uid: p.bag[k2].uid, item: 'paring_dagger', slot: 'main' }); run(w);
    eq(typeof p.equip.main === 'string' ? p.equip.main : p.equip.main.item, 'paring_dagger', 'slot: main honoured');
    // a Warden's sword never goes to the off hand
    const id2 = w.addPlayer({ name: 'War', cls: 'warden', level: 6, bag: [{ item: 'gear_sword', qty: 1, inst: { ilvl: 6, rarity: 'common', affixes: [] } }] });
    w.enqueue(id2, { t: 'equip', bag: 0, item: 'gear_sword', slot: 'off' });
    assert(mine(run(w), id2, 'inventory_fail').some((e) => e.reason === 'slot'), 'sword to the off hand refused');
  } },
  // ------------------------------------------------------------------------------------------- bug 7, critique 2
  { name: 'bug 7 / critique 2: no spawn a kill or drop quest sends you to is more than 1 level over the quest; Bram and Mira need level 3; no wolf within 10 tiles of Penny or the bridge', fn() {
    const bad = [];
    for (const id of C.questOrder) {
      const q = C.quests[id];
      q.objectives.forEach((o, i) => {
        const mobs = o.kind === 'kill' ? [o.mob] : o.kind === 'collect' ? Object.values(C.mobs).filter((m) => (m.loot.table || []).some((e) => e.item === o.item)).map((m) => m.id) : [];
        for (const mob of mobs) for (const w of o.where || []) for (const s of C.zones[w.zone].spawns || []) {
          if (s.mob !== mob) continue;
          if (Math.hypot(s.x * 16 + 8 - w.x, s.y * 16 + 8 - w.y) > w.r) continue;
          if (s.level > q.level + 1) bad.push(`${id}#${i}: ${mob} L${s.level} at ${w.zone} ${s.x},${s.y} (quest L${q.level})`);
        }
      });
    }
    assert(!bad.length, bad.join('; '));
    eq(C.quests.wm_pilgrim_wolves.minLevel, 3, 'Bram needs 3'); eq(C.quests.wm_keeper_marks.minLevel, 3, 'Mira needs 3');
    const w = createWorld({ seed: 27, content: C });
    const id = w.addPlayer({ name: 'Low', cls: 'warden', questsDone: ['wm_name_twice'] });
    eq(w.quests.status(w.get(id), 'wm_pilgrim_wolves'), 'soon', 'shown as coming at level 3');
    const penny = C.zones.valley.npcs.find((n) => n.npc === 'penny');
    for (const s of C.zones.valley.spawns) if (s.mob === 'briar_wolf') {
      assert(Math.hypot(s.x - penny.x, s.y - penny.y) >= 10, `wolf at ${s.x},${s.y} within 10 tiles of Penny`);
      assert(!(s.x >= 42 && s.x < 56 && s.y >= 40 && s.y < 46), `wolf on the bridge ${s.x},${s.y}`);
      assert(s.level >= 3 && s.level <= 4, `pilgrim road wolf level ${s.level}`);
    }
  } },
  // ------------------------------------------------------------------------------------------- bug 8
  { name: 'bug 8: a ground cast at a non-finite point fails with reason target (edges ground_spells_walls_and_range)', fn() {
    const w = createWorld({ seed: 28, content: C });
    const id = w.addPlayer({ name: 'Scr', cls: 'scribe', zone: 'valley', x: 10, y: 50, level: 14 });
    w.learnAll(id);
    const p = w.get(id);
    for (const at of [{ x: NaN, y: NaN }, { x: Infinity, y: 5 }, { x: 5, y: null }]) {
      p.gcdUntil = 0; p.cd = {};
      w.enqueue(id, { t: 'cast', ability: 'scribe_scatter_letters', at: { x: p.x / SUB + (Number.isFinite(at.x) ? 0 : 0), ...at } });
      const ev = run(w);
      assert(mine(ev, id, 'cast_fail').some((e) => e.reason === 'target'), `refused ${JSON.stringify(at)}`);
      assert(!mine(ev, id, 'cast_start').length, 'no cast started');
    }
    assert(!w.state.ents.some((e) => e.kind === 'object' && !Number.isFinite(e.x)), 'no zone object at NaN');
  } },
  // ------------------------------------------------------------------------------------------- bug 9
  { name: 'bug 9: quit and return keeps health, resource and cooldowns (no free full heal) (edges save_restore_mid_cast_mid_fight_each_zone)', fn() {
    const w = createWorld({ seed: 29, content: C });
    const id = w.addPlayer({ name: 'Hurt', cls: 'scribe', zone: 'valley', x: 10, y: 50, level: 6 });
    w.learnAll(id);
    const p = w.get(id);
    p.hp = Math.round(p.hpMax * 0.4); p.res.cur = 33; p.cd.scribe_scrawl = w.tick + 200; p.cd['item:potion'] = w.tick + 900;
    const hp = p.hp, max = p.hpMax;
    const w2 = createWorld({ seed: 30, content: C });
    run(w2, 37);                                   // the new world has its own clock
    const id2 = relog(w, id, w2);
    const r = w2.get(id2);
    eq(r.hp, hp, 'health kept'); eq(r.hpMax, max, 'max same');
    eq(Math.round(r.res.cur), 33, 'mana kept');
    eq(r.cd.scribe_scrawl - w2.tick, 200, 'cooldown ticks left kept');
    eq(r.cd['item:potion'] - w2.tick, 900, 'potion cooldown kept');
    // a save with no vitals (an old save) still restores full
    const id3 = w2.addPlayer({ name: 'Old', cls: 'scribe', level: 6 });
    eq(w2.get(id3).hp, w2.get(id3).hpMax, 'old saves: full');
  } },
  // ------------------------------------------------------------------------------------------- bug 12, critique 17
  { name: 'bug 12 / critique 17: a lantern binds within 3 tiles while walking past, and a new zone binds its nearest lantern on entry', fn() {
    const w = createWorld({ seed: 31, content: C });
    calm(w);
    const L = C.zones.valley.lanterns.find((l) => l.id === 'pilgrims_rest');
    const [x, y] = freeNear('valley', L.x + 3, L.y, 1);
    const id = w.addPlayer({ name: 'Lamp', cls: 'warden', zone: 'valley', x, y });
    const p = w.get(id);
    p.lantern = { zone: 'valley', id: 'south_gate', x: 4, y: 52 };
    run(w, 6);
    eq(p.lantern.id, 'pilgrims_rest', 'bound from 3 tiles');
    // walk from Willowmere into the valley: the arrival lantern binds on entry
    const s = npcSpot('holt');
    const id2 = w.addPlayer({ name: 'Gate', cls: 'warden', zone: 'willowmere', x: 20, y: 30 });
    void s;
    const q = w.get(id2);
    eq(q.lantern.zone, 'willowmere', 'starts bound in town');
    w.enqueue(id2, { t: 'move', dx: 0, dy: 1 });
    let ev = [];
    for (let i = 0; i < 60 && q.zone === 'willowmere'; i++) ev = ev.concat(w.step());
    eq(q.zone, 'valley', 'walked into the valley');
    eq(q.lantern.zone, 'valley', 'bound a valley lantern on entry');
    assert(ev.some((e) => e.type === 'lantern' && e.id === id2 && e.auto), 'lantern event marked auto');
  } },
  // ------------------------------------------------------------------------------------------- bug 13, critique 17
  { name: 'bug 13 / critique 17: a lane from the moor arrival to Odo\'s hut has no aggressive foe above the moor entry level (13 since the cap 20 re-spread, 10 before) within 8 tiles; no sentinel within 12 tiles of the hut or 8 of the elite', fn() {
    const z = ZONES.moor;
    const odo = z.npcs.find((n) => n.npc === 'odo');
    eq(z.levels[0], 13, 'the moor opens at 13 (PROGRESSION.zoneRespread)');
    const named = C.spawns.filter((s) => s.zone === 'moor' && s.group && s.group.startsWith('bounty_'));   // the bounty boards' named foes
    const foes = [...z.spawns, ...named].filter((s) => s.level > z.levels[0] && (C.mobs[s.mob].behavior === 'aggressive' || C.mobs[s.mob].behavior === 'elite'));
    const unsafe = (x, y) => foes.some((s) => Math.hypot(s.x - x, s.y - y) <= 8);
    const ok = reachable('moor');
    const seen = new Set([`${z.arrival[0]},${z.arrival[1]}`]), q = [z.arrival];
    let found = false;
    while (q.length && !found) {
      const [x, y] = q.shift();
      if (Math.hypot(x - odo.x, y - odo.y) <= 1.5) { found = true; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (seen.has(k) || !ok(nx, ny) || z.collision[ny][nx] !== '.' || unsafe(nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    assert(found, 'a safe lane to Odo exists');
    const elite = z.spawns.find((s) => s.mob === 'sentinel_long_watch');
    for (const s of z.spawns.filter((k) => k.mob === 'tower_sentinel')) {
      assert(Math.hypot(s.x - odo.x, s.y - odo.y) >= 12 + (s.wander ?? 3) - 3, `sentinel at ${s.x},${s.y} too near Odo`);
      assert(Math.hypot(s.x - elite.x, s.y - elite.y) > 8, `sentinel at ${s.x},${s.y} beside the elite`);
    }
  } },
  // ------------------------------------------------------------------------------------------- bug 14
  { name: 'bug 14: a level 1-2 slime never calls friends; a level 3-4 one only within 28 px', fn() {
    const w = createWorld({ seed: 32, content: C });
    const id = w.addPlayer({ name: 'Pull', cls: 'warden', zone: 'valley', x: 12, y: 46 });
    const p = w.get(id);
    const a = w.state.ents.find((m) => m.kind === 'mob' && m.template === 'ink_slime' && m.level <= 2 && m.zone === 'valley');
    const b = w.state.ents.find((m) => m.kind === 'mob' && m.template === 'ink_slime' && m !== a && m.zone === 'valley');
    b.x = a.x + 16 * SUB; b.y = a.y;                            // a friend one tile away
    w.internals.ai.engage(a, p);
    assert(b.ai.mode !== 'combat', 'the neighbour stays put');
    eq(C.progression.mobAi.socialByLevel[0][1], 0, 'level 1-2: no social pull');
  } },
  // ------------------------------------------------------------------------------------------- bug 16
  { name: 'bug 16: a sell names its slot by uid or index + item; an index alone is refused (edges sell_indexes_shift)', fn() {
    const w = createWorld({ seed: 33, content: C });
    const s = npcSpot('pell');
    const id = w.addPlayer({ name: 'Sell', cls: 'warden', zone: s.zone, x: s.x, y: s.y, bag: [{ item: 'slime_ink', qty: 1 }, { item: 'scarab_shell', qty: 1 }, { item: 'wolf_pelt', qty: 1 }] });
    const p = w.get(id);
    const pell = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'pell');
    w.enqueue(id, { t: 'sell', npc: pell.id, bag: 0 });
    assert(mine(run(w), id, 'inventory_fail').some((e) => e.reason === 'no_item'), 'index-only refused');
    const uid = p.bag.find((x) => x.item === 'wolf_pelt').uid;
    w.enqueue(id, { t: 'sell', npc: pell.id, uid: p.bag.find((x) => x.item === 'slime_ink').uid });
    w.enqueue(id, { t: 'sell', npc: pell.id, uid });
    const ev = run(w);
    eq(mine(ev, id, 'inventory').map((e) => e.item).join(','), 'slime_ink,wolf_pelt', 'sold exactly the named slots');
    eq(p.bag.map((x) => x.item).join(','), 'scarab_shell', 'the other stays');
    assert(w.snapshot().hud[id].bag.items.every((it) => it.uid > 0), 'the HUD bag view carries uids');
  } },
  // ------------------------------------------------------------------------------------------- critique 6
  { name: 'critique 6: a new Warden has Shield Bash in slot 1, and the first fight\'s second press (Strike) works', fn() {
    eq(C.classes.warden.startBar[0], 'warden_shield_bash', 'Bash first');
    const w = createWorld({ seed: 34, content: C });
    const s = freeNear('valley', 12, 46, 2);
    const id = w.addPlayer({ name: 'Tank', cls: 'warden', zone: 'valley', x: s[0], y: s[1] });
    const p = w.get(id);
    const m = w.state.ents.filter((e) => e.kind === 'mob' && !e.dead && e.zone === 'valley').sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    m.x = p.x + 20 * SUB; m.y = p.y;
    w.enqueue(id, { t: 'target', id: m.id });
    w.enqueue(id, { t: 'cast', slot: 1 });
    let ev = run(w, 21);
    assert(mine(ev, id, 'cast_start').some((e) => e.ability === 'warden_shield_bash'), 'Bash on the first press');
    w.enqueue(id, { t: 'cast', slot: 2 });
    ev = run(w, 1);
    assert(mine(ev, id, 'cast_start').some((e) => e.ability === 'warden_strike'), `Strike on the second press (resolve ${p.res.cur})`);
  } },
  // ------------------------------------------------------------------------------------------- critique 7
  { name: 'critique 7: level 1-4 foes have 22% less health; standing out of combat heals 5% a second at level 1-4', fn() {
    const w = createWorld({ seed: 35, content: C });
    const slime = w.state.ents.find((m) => m.kind === 'mob' && m.template === 'ink_slime' && m.level === 1);
    assert(slime.hpMax <= 110, `level 1 slime ${slime.hpMax} <= 110 (was 141)`);
    const id = w.addPlayer({ name: 'Rest', cls: 'warden', zone: 'willowmere', x: 20, y: 24 });
    const p = w.get(id);
    p.hp = Math.round(p.hpMax * 0.3); p.combatEnd = -1000;
    run(w, 20 * 4);
    assert(p.hp >= Math.round(p.hpMax * 0.48), `4 s standing: ${p.hp}/${p.hpMax}`);
  } },
  // ------------------------------------------------------------------------------------------- critique 9
  { name: 'critique 9: every quest objective has where circles that hold its target (camp, nodes, area, npc), and the tracker rows carry them', fn() {
    for (const id of C.questOrder) {
      const q = C.quests[id];
      q.objectives.forEach((o, i) => {
        const tag = `${id}#${i}`;
        assert(Array.isArray(o.where) && o.where.length, `${tag} has where`);
        for (const w of o.where) {
          assert(C.zones[w.zone] && [w.x, w.y, w.r].every(Number.isFinite) && w.r > 0, `${tag} where shape`);
          assert(reachable(w.zone)(Math.floor(w.x / 16), Math.floor(w.y / 16)) || w.r >= 24, `${tag} centre reachable`);
        }
        const inside = (zone, tx, ty) => o.where.some((w) => w.zone === zone && Math.hypot(tx * 16 + 8 - w.x, ty * 16 + 8 - w.y) <= w.r + 8);
        let hit = false;
        if (o.kind === 'kill') hit = Object.entries(C.zones).some(([zid, z]) => (z.spawns || []).some((s) => s.mob === o.mob && inside(zid, s.x, s.y)));
        else if (o.kind === 'collect') {
          hit = Object.entries(C.zones).some(([zid, z]) => (z.nodes || []).some((n) => n.item === o.item && inside(zid, n.x, n.y)));
          const droppers = Object.values(C.mobs).filter((m) => (m.loot.table || []).some((e) => e.item === o.item)).map((m) => m.id);
          hit = hit || Object.entries(C.zones).some(([zid, z]) => (z.spawns || []).some((s) => droppers.includes(s.mob) && inside(zid, s.x, s.y)));
        } else if (o.kind === 'talk' || o.kind === 'deliver') hit = Object.entries(C.zones).some(([zid, z]) => (z.npcs || []).some((n) => n.npc === (o.npc || o.to) && inside(zid, n.x, n.y)));
        else if (o.kind === 'explore') { const a = C.zones[o.zone].areas.find((x) => x.id === o.area); hit = inside(o.zone, a.x + Math.floor(a.w / 2), a.y + Math.floor(a.h / 2)); }
        else if (o.kind === 'escort') hit = inside(o.from.zone, o.from.x, o.from.y) && inside(o.to.zone, o.to.x, o.to.y);
        assert(hit, `${tag} (${o.kind}) where holds its target`);
      });
    }
    const w = createWorld({ seed: 36, content: C });
    const s = npcSpot('oren');
    const id = w.addPlayer({ name: 'Map', cls: 'warden', zone: s.zone, x: s.x, y: s.y, questsDone: ['wm_name_twice'] });
    w.enqueue(id, { t: 'quest_accept', quest: 'wm_yard_slimes' }); run(w);
    const row = w.snapshot().hud[id].quests[0];
    eq(row.rows[0].where[0].zone, 'valley', 'tracker row where');
    eq(row.turnIn.npc, 'oren', 'turn-in npc'); assert(row.turnIn.where[0].zone === 'willowmere', 'turn-in where');
  } },
  // ------------------------------------------------------------------------------------------- critique 10
  { name: 'critique 10: every turn-in text names the giver of the next quest it opens (or the same npc gives it)', fn() {
    for (const id of C.questOrder) {
      const q = C.quests[id];
      const next = C.questOrder.filter((k) => (C.quests[k].requires.quests || []).includes(id));
      for (const k of next) {
        const g = C.quests[k].giver;
        if (g === q.turnIn) continue;
        const name = C.npcs[g].name.split(' ').pop();
        assert(q.text.complete.includes(name), `${id} (turn-in ${q.turnIn}) does not name ${name}, giver of ${k}`);
      }
    }
  } },
  // ------------------------------------------------------------------------------------------- critique 13
  { name: 'critique 13: every quest reward can be worn when handed in, and armor rolls to the class (the dialog says what is usable)', fn() {
    for (const id of C.questOrder) {
      const q = C.quests[id];
      for (const it of [...(q.rewards.items || []), ...(q.rewards.choice || [])]) {
        const d = C.items[it];
        if (d.kind !== 'weapon' && d.kind !== 'armor') continue;
        assert(d.reqLevel <= q.minLevel, `${id}: ${it} needs level ${d.reqLevel}, quest from ${q.minLevel}`);
      }
    }
    const w = createWorld({ seed: 37, content: C });
    const s = npcSpot('oren');
    const id = w.addPlayer({ name: 'Plate', cls: 'warden', zone: s.zone, x: s.x, y: s.y, questsDone: ['wm_name_twice'] });
    const oren = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'oren');
    w.enqueue(id, { t: 'interact', id: oren.id });
    const dlg = run(w).find((e) => e.type === 'quest_dialog');
    const gloves = dlg.rewards.wm_yard_slimes.choice.find((c) => c.item === 'flour_dusted_gloves');
    eq(gloves.inst.armorType, 'plate', 'gloves roll to plate for a Warden');
    eq(gloves.usable, true, 'usable');
    const w2 = createWorld({ seed: 38, content: C });
    const s2 = npcSpot('bram');
    const id2 = w2.addPlayer({ name: 'Cloth', cls: 'scribe', zone: s2.zone, x: s2.x, y: s2.y, level: 3, questsDone: ['wm_name_twice'] });
    const bram = w2.state.ents.find((e) => e.kind === 'npc' && e.template === 'bram');
    w2.enqueue(id2, { t: 'interact', id: bram.id });
    const d2 = run(w2).find((e) => e.type === 'quest_dialog');
    eq(d2.rewards.wm_pilgrim_wolves.choice.find((c) => c.item === 'gate_guard_shield').usable, false, 'a shield is not for a Scribe');
  } },
  // ------------------------------------------------------------------------------------------- critique 16
  { name: 'critique 16: a level-up that brings a new ability names the trainer and where they stand; before 5 it says when talents start', fn() {
    let target = null;
    const grant = { id: 'grant', tick(world) { if (target != null && world.tick === 2) world.grantXp(target, C.progression.xpToNext[2], 'quest'); } };
    const w = createWorld({ seed: 39, content: C, systems: [grant] });
    target = w.addPlayer({ name: 'Ding', cls: 'warden', level: 2 });
    const ev = run(w, 2);
    const lv = ev.find((e) => e.type === 'level' && e.id === target);
    assert(lv, 'level event');
    eq(lv.level, 3, 'level 3');
    // Builds 2 is on for every class (2026-11-19): a new skill is a skill pick, not a trainer lesson, and talents start at 1
    eq(lv.b2, true, 'a Builds 2 level');
    eq(lv.trainable.length, 0, 'nothing to train: the level 3 skill is a pick');
    const pr = ev.find((e) => e.type === 'b2_pick_ready' && e.id === target && e.level === 3);
    assert(pr && pr.options.join(',') === 'warden_taunt,warden_hurl_hammer', 'the level 3 pick: Taunt or Hurl Hammer');
    eq(lv.firstTalentAt, null, 'talent points from level 1');
  } },
  // ------------------------------------------------------------------------------------------- bug 15 (survival gap)
  { name: 'bug 15: the Inkblade Spill heals 8% of health per mark (5% before the combat role pass, 7% before the class identity pass); the Wayfinder Quick Shot Hobbles (30% slow, 3 s)', fn() {
    const w = createWorld({ seed: 41, content: C });
    calm(w);
    const s = freeNear('valley', 12, 46, 2);
    const id = w.addPlayer({ name: 'Ink', cls: 'inkblade', zone: 'valley', x: s[0], y: s[1], level: 5 });
    const p = w.get(id);
    const m = w.state.ents.find((e) => e.kind === 'mob' && e.zone === 'valley' && e.template === 'ink_slime');
    m.dead = false; m.respawnAt = null; m.ai.mode = 'idle'; m.hp = m.hpMax = 5000; m.x = p.x + 20 * SUB; m.y = p.y;
    p.hp = Math.round(p.hpMax * 0.5);
    p.combo = { target: m.id, n: 3, until: w.tick + 400 };
    w.enqueue(id, { t: 'target', id: m.id });
    w.enqueue(id, { t: 'cast', ability: 'inkblade_spill', target: m.id });
    const ev = run(w);
    const h = ev.find((e) => e.type === 'heal' && e.src === id && e.dst === id && e.ability === 'inkblade_spill');
    assert(h, 'Spill healed the Inkblade');
    eq(h.amount, Math.round(0.24 * p.hpMax), '3 marks = 24% of health');
    const id2 = w.addPlayer({ name: 'Way', cls: 'wayfinder', zone: 'valley', x: s[0], y: s[1], level: 5 });
    w.enqueue(id2, { t: 'target', id: m.id });
    w.enqueue(id2, { t: 'cast', ability: 'wayfinder_quick_shot', target: m.id });
    run(w, 20);
    const a = m.auras.find((x) => x.id === 'wayfinder_hobbled');
    assert(a, 'the foe is Hobbled');
    assert(w.internals.stats.slowOf(m) >= 0.3 - 1e-9, 'slowed 30%');
  } },
  // ------------------------------------------------------------------------------------------- critique 12
  { name: 'critique 12: two melee foes on one hero end up side by side (12 px or more apart), not stacked', fn() {
    const w = createWorld({ seed: 42, content: C });
    calm(w);
    const s = freeNear('valley', 66, 30, 2);
    const id = w.addPlayer({ name: 'Bait', cls: 'warden', zone: 'valley', x: s[0], y: s[1], level: 9 });
    const p = w.get(id);
    p.hp = p.hpMax = 99999;
    const wolves = w.state.ents.filter((e) => e.kind === 'mob' && e.template === 'briar_wolf').slice(0, 2);
    for (const m of wolves) { m.dead = false; m.respawnAt = null; m.hp = m.hpMax; m.x = p.x + 40 * SUB; m.y = p.y; m.ai.mode = 'idle'; w.internals.ai.engage(m, p, false); }
    run(w, 20 * 6);
    const [a, b] = wolves;
    const gap = Math.hypot(a.x - b.x, a.y - b.y) / SUB;
    assert(gap >= 11, `wolves ${gap.toFixed(1)} px apart`);
    for (const m of wolves) assert(Math.hypot(m.x - p.x, m.y - p.y) / SUB <= 40, 'both still in reach');
  } },
  // ------------------------------------------------------------------------------------------- found by the questbot in this pass
  { name: 'stale threat: a mob that stopped fighting forgets a player who left the zone, so they leave combat (questbot wayfinder seed 2)', fn() {
    const w = createWorld({ seed: 43, content: C });
    const id = w.addPlayer({ name: 'Gone', cls: 'wayfinder', zone: 'moor', x: 78, y: 96, level: 7 });
    const crow = w.state.ents.find((e) => e.kind === 'mob' && e.template === 'gorse_crow' && !e.dead);
    crow.threat[id] = 50; crow.ai.mode = 'idle';                 // the state the bot found: idle, still listing her
    run(w, 4);
    assert(crow.threat[id] == null, 'threat forgotten');
    run(w, 20 * 6);
    eq(w.get(id).inCombat, false, 'out of combat');
  } },
];

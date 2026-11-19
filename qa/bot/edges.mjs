// Edge-case hammer (docs/PLAYTEST_BOT.md). Each case builds a fresh seeded world from the real content and drives it
// ONLY through what a client can do: world.enqueue(commands), and the save / restore path main.js uses
// (addPlayer(spec) / removePlayer(id), copied below as saveState / specFor). Every case reports observed vs expected.
//
//   node qa/bot/edges.mjs            all cases; JSON to qa/out/bot/edges.json
//   node qa/bot/edges.mjs --only bag  cases whose name contains "bag"
// Prints EDGES_DONE: cases=<n> fail=<n> errors=<n> (machine-read sentinel).
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContent } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/index.js';
import { boxBlocked, spotFree, inJoin } from '../../src/sim/collision.js';
import { createBot } from './lib/bot.mjs';
import { createNav, tileOfSub } from './lib/nav.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'out', 'bot');
mkdirSync(OUT, { recursive: true });
const only = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1] : null; })();
const C = buildContent();
const nav = createNav(C);
const results = [];
const SUB = 16;

// ---------------------------------------------------------------- the save path, as src/main.js does it
function saveState(world, id) {
  const e = world.get(id);
  if (!e || e.kind !== 'player') return null;
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const spot = e.dead && e.lantern ? { zone: e.lantern.zone, tx: e.lantern.x, ty: e.lantern.y } : { zone: e.zone, tx: Math.floor(e.x / 256), ty: Math.floor((e.y - 1) / 256) };
  return { v: 1, name: e.name, cls: e.cls, look: e.look, level: e.level, xp: e.xp, gold: e.gold || 0, ...spot,
    bag: clone(e.bag), bags: clone(e.bags), equip: clone(e.equip), known: clone(e.known), bar: clone(e.bar), talents: clone(e.talents),
    quests: clone(e.quests), questsDone: clone(e.questsDone), nodesUsed: clone(e.nodesUsed), respecs: e.respecs || 0, lantern: clone(e.lantern),
    // fix pass 1 (CONTRACTS 2.4): the sim-owned fields (hp, resource, cooldowns ticks left, lasting buffs, quest bag, pending loot)
    ...(world.saveFields ? world.saveFields(id) : {}) };
}
const stripEscorts = (qs) => { if (!qs) return qs; const o = {}; for (const [k, v] of Object.entries(qs)) { const { escort, ...rest } = v; void escort; o[k] = rest; } return o; };
function specFor(c) {
  const s = c.state;
  if (!s) return { name: c.name, cls: c.cls, look: c.look };
  const at = s.zone && C.zones[s.zone] && s.tx != null ? { zone: s.zone, x: s.tx, y: s.ty } : {};
  return { name: c.name, cls: c.cls, look: c.look, ...at, level: s.level, xp: s.xp, gold: s.gold, bag: s.bag, bags: s.bags, equip: s.equip,
    known: s.known, bar: s.bar, talents: s.talents, quests: stripEscorts(s.quests), questsDone: s.questsDone, nodesUsed: s.nodesUsed,
    respecs: s.respecs, lantern: s.lantern, qbag: s.qbag, pendingLoot: s.pendingLoot, hp: s.hp, res: s.res, cdLeft: s.cdLeft, auras: s.auras };
}
function relog(world, id) { const s = saveState(world, id); const e = world.get(id); world.removePlayer(id); return { id: world.addPlayer(specFor({ name: e.name, cls: e.cls, look: e.look, state: s })), save: s }; }

// ---------------------------------------------------------------- helpers
function newWorld(seed = 7) { return createWorld({ seed, content: C }); }
function run(world, n, sink) { let all = []; for (let i = 0; i < n; i++) { const ev = world.step(); if (sink) sink(ev); all = all.concat(ev); } return all; }
function npcAt(world, tpl) { return world.state.ents.find((e) => e.kind === 'npc' && e.template === tpl && !e.escort); }
/** a walkable tile within r tiles of (x, y) */
function freeNear(zone, x, y, r = 3) {
  const Z = C.zones[zone];
  for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (spotFree(Z, x + dx, y + dy)) return [x + dx, y + dy];
  return null;
}
function standBy(tpl) { const h = Object.values(C.zones).flatMap((z) => (z.npcs || []).map((n) => ({ zone: z.id, ...n }))).find((n) => n.npc === tpl); const [x, y] = freeNear(h.zone, h.x, h.y + 1, 2); return { zone: h.zone, x, y }; }
const gear = (item, ilvl = 6, extra = {}) => ({ item, qty: 1, inst: { ilvl, rarity: 'common', affixes: [], ...extra } });
const fill12 = () => ['slime_ink', 'scarab_shell', 'wolf_pelt', 'thorny_pelt', 'blot_residue', 'tangled_wool', 'crow_feather', 'grave_dust', 'mist_pelt', 'boar_hide', 'torn_page', 'ink_wisp'].map((item) => ({ item, qty: 20 }));
function record(name, ok, observed, expected, extra = {}) { results.push({ name, ok, observed, expected, ...extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${typeof observed === 'string' ? observed : JSON.stringify(observed)}`); }
function kase(name, fn) {
  if (only && !name.includes(only)) return;
  try { fn(); } catch (err) { results.push({ name, ok: false, error: String(err.stack || err) }); console.log(`ERROR ${name}: ${err.stack || err}`); }
}
const mine = (evs, id, types) => evs.filter((e) => (e.id === id || e.src === id) && (!types || types.includes(e.type)));
/** melee-kill the nearest live mob of `tpl` with auto-attack + the class opener, walking there with the bot's nav */
function killNearest(world, bot, tpl, maxTicks = 4000, filter = () => true) {
  const p = bot.me();
  const mobs = world.state.ents.filter((m) => m.kind === 'mob' && !m.dead && m.template === tpl && m.zone === p.zone && filter(m)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const m = mobs[0];
  if (!m) return { ok: false, events: [] };
  let evs = [], attacked = false;
  for (let t = 0; t < maxTicks; t++) {
    if (m.dead) break;
    if (bot.me().dead) break;
    const d = Math.hypot((m.x - bot.me().x) / SUB, (m.y - bot.me().y) / SUB);
    if (d > 26) bot.walkToEnt('k' + m.id, m, 18);
    else { bot.hold(0, 0); if (!attacked || !bot.me().autoOn) { world.enqueue(bot.id, { t: 'attack', id: m.id }); attacked = true; } if (t % 10 === 0) for (const ab of bot.me().bar) world.enqueue(bot.id, { t: 'cast', ability: ab, target: m.id }); }
    evs = evs.concat(world.step());
  }
  return { ok: m.dead, mob: m, events: evs };
}

// ================================================================== 1. bags full
kase('bag_full_on_loot_quest_item_vanishes', () => {
  // two worlds, same seed, same kill sequence: one with room, one with a full bag. Compare what each kill paid out.
  const go = (full) => {
    const w = newWorld(11);
    const spot = freeNear('valley', 41, 10, 3);
    const bag = full ? fill12() : [];
    const bot = createBot({ world: w, content: C, cls: 'warden', spec: { name: 'Edge', cls: 'warden', zone: 'valley', x: spot[0], y: spot[1], level: 8, bag, quests: { wm_copied_twice: { state: 'active', counts: [0] } }, questsDone: ['wm_name_twice', 'wm_keeper_marks'] } });
    const loot = [], feedback = [];
    for (let k = 0; k < 6; k++) {
      const r = killNearest(w, bot, 'ink_slime', 3000, (m) => m.level >= 3);
      for (const e of mine(r.events, bot.id, ['loot'])) loot.push(e.items.map((i) => i.item).join('+') || '(gold only)');
      for (const e of r.events) if ((e.id === bot.id) && /fail|reject/.test(e.type)) feedback.push(e.type + ':' + (e.reason || ''));
    }
    return { loot, feedback, quills: (w.get(bot.id).bag || []).filter((s) => s.item === 'quills_copy').reduce((s, b) => s + b.qty, 0) };
  };
  const a = go(false), b = go(true);
  const lost = a.quills - b.quills;
  record('bag_full_on_loot_quest_item_vanishes', lost <= 0 || b.feedback.length > 0,
    { roomyBag: a, fullBag: b }, 'a quest item that does not fit is kept on the corpse or the player is told (inventory_fail / loot event); never silently destroyed',
    { severity: lost > 0 ? 'major' : 'info', suspect: 'src/sim/world.js questKill(): bagAdd() result <qty is dropped with no event', lost });
});

kase('bag_full_quest_reward_and_accept', () => {
  const w = newWorld(12);
  const s = standBy('oren');
  const id = w.addPlayer({ name: 'Edge', cls: 'scribe', zone: s.zone, x: s.x, y: s.y, gold: 0, bag: fill12(), quests: { wm_yard_slimes: { state: 'ready', counts: [6] } }, questsDone: ['wm_name_twice'] });
  const oren = npcAt(w, 'oren');
  w.enqueue(id, { t: 'interact', id: oren.id });
  w.enqueue(id, { t: 'quest_turnin', quest: 'wm_yard_slimes', choice: 0 });
  const ev = run(w, 2);
  const rej = mine(ev, id, ['cmd_reject']).map((e) => e.reason);
  const p = w.get(id);
  const ok1 = rej.includes('bag_full') && p.quests.wm_yard_slimes && p.quests.wm_yard_slimes.state === 'ready' && p.bag.length === 12 && p.gold === 0;
  record('bag_full_quest_reward_refused_cleanly', ok1, { rejects: rej, questState: p.quests.wm_yard_slimes && p.quests.wm_yard_slimes.state, bagN: p.bag.length, gold: p.gold }, 'turn-in refused (bag_full), quest stays ready, nothing taken, nothing given', { severity: ok1 ? 'info' : 'major' });
  // a collect quest: the hens leave first, so the freed slot takes the reward
  const s2 = standBy('cobb');
  const id2 = w.addPlayer({ name: 'Edgy', cls: 'scribe', zone: s2.zone, x: s2.x, y: s2.y, bag: [...fill12().slice(0, 11), { item: 'stray_hen', qty: 5 }], quests: { wm_cobbs_hens: { state: 'ready', counts: [5] } }, questsDone: ['wm_name_twice'] });
  w.enqueue(id2, { t: 'interact', id: npcAt(w, 'cobb').id });
  w.enqueue(id2, { t: 'quest_turnin', quest: 'wm_cobbs_hens', choice: 0 });
  const ev2 = run(w, 2);
  const p2 = w.get(id2);
  const ok2 = (p2.questsDone || []).includes('wm_cobbs_hens') && p2.bag.some((b) => b.item === 'cobbs_old_boots');
  record('bag_full_collect_turnin_frees_its_own_slot', ok2, { done: (p2.questsDone || []).includes('wm_cobbs_hens'), bag: p2.bag.map((b) => b.item).slice(-2), rejects: mine(ev2, id2, ['cmd_reject']).map((e) => e.reason) }, 'the 5 hens leave the bag first, so the boots fit', { severity: ok2 ? 'info' : 'minor' });
  // accept a quest that hands you an item (Pell's crate) with a full bag
  const s3 = standBy('pell');
  const id3 = w.addPlayer({ name: 'Edgier', cls: 'warden', zone: s3.zone, x: s3.x, y: s3.y, bag: fill12(), questsDone: ['wm_name_twice'] });
  w.enqueue(id3, { t: 'interact', id: npcAt(w, 'pell').id });
  w.enqueue(id3, { t: 'quest_accept', quest: 'wm_pells_crate' });
  const ev3 = run(w, 2);
  const p3 = w.get(id3);
  const ok3 = mine(ev3, id3, ['cmd_reject']).some((e) => e.reason === 'bag_full') && !p3.quests.wm_pells_crate;
  record('bag_full_accept_with_given_item', ok3, { rejects: mine(ev3, id3, ['cmd_reject']).map((e) => e.reason), active: !!p3.quests.wm_pells_crate, hasCrate: p3.bag.some((b) => b.item === 'pells_crate') }, 'accept refused (bag_full) so the crate is never lost', { severity: ok3 ? 'info' : 'major' });
});

kase('bag_full_buy', () => {
  const w = newWorld(13);
  const s = standBy('pell');
  const bag = fill12(); bag[11] = { item: 'potion', qty: 17 };   // one potion stack with 3 spaces left, no free slot
  const id = w.addPlayer({ name: 'Edge', cls: 'mender', zone: s.zone, x: s.x, y: s.y, gold: 500, bag });
  const pell = npcAt(w, 'pell');
  w.enqueue(id, { t: 'interact', id: pell.id });
  w.enqueue(id, { t: 'buy', npc: pell.id, item: 'potion', qty: 5 });
  w.enqueue(id, { t: 'buy', npc: pell.id, item: 'gear_rod' });
  w.enqueue(id, { t: 'buy', npc: pell.id, item: 'potion', qty: 3 });
  const ev = run(w, 2);
  const p = w.get(id);
  const fails = mine(ev, id, ['inventory_fail']).map((e) => `${e.item}:${e.reason}`);
  const pot = p.bag.find((b) => b.item === 'potion');
  const ok = fails.includes('potion:bag_full') && fails.includes('gear_rod:bag_full') && pot.qty === 20 && p.gold === 500 - 12;
  record('bag_full_buy', ok, { fails, potionStack: pot.qty, gold: p.gold }, 'qty 5 refused (only 3 fit), gear refused, qty 3 tops the stack up to 20 for 12 gold', { severity: ok ? 'info' : 'major' });
  // odd quantities
  w.enqueue(id, { t: 'buy', npc: pell.id, item: 'ether', qty: -4 });
  w.enqueue(id, { t: 'buy', npc: pell.id, item: 'ether', qty: 1e9 });
  w.enqueue(id, { t: 'sell', npc: pell.id, item: 'slime_ink', qty: -3 });
  const ev2 = run(w, 2);
  record('vendor_odd_quantities', true, { events: mine(ev2, id, ['inventory', 'inventory_fail']).map((e) => `${e.type}:${e.kind || e.reason}:${e.item}:${e.qty ?? ''}`) }, 'no throw; negative and huge quantities clamp (info only)', { severity: 'info' });
});

// ================================================================== 2. wrong gear
kase('equip_wrong_types', () => {
  const w = newWorld(14);
  const cases = [
    ['scribe', gear('gear_plate_chest'), 'armor'], ['wayfinder', gear('gear_sword'), 'weapon'], ['mender', gear('gear_shield'), 'class'],
    ['warden', gear('gear_plate_chest', 14, { }), 'level'], ['inkblade', gear('gear_bow'), 'class'], ['scribe', { item: 'potion', qty: 1 }, 'not_equippable'],
    ['scribe', gear('cobbs_old_boots', 3, { rarity: 'magic', armorType: 'plate' }), 'armor'],
  ];
  const out = [];
  let ok = true;
  for (const [cls, entry, want] of cases) {
    const id = w.addPlayer({ name: 'E', cls, zone: 'willowmere', x: 20, y: 24, bag: [entry] });
    w.enqueue(id, { t: 'equip', bag: 0, item: entry.item });
    const ev = run(w, 1);
    const f = mine(ev, id, ['inventory_fail', 'inventory']).map((e) => e.reason || e.kind)[0];
    const reqLvl = C.items[entry.item] && C.items[entry.item].reqLevel;
    out.push(`${cls} ${entry.item}${entry.inst ? '@' + entry.inst.ilvl : ''}: ${f}${want === 'level' ? ` (reqLevel ${reqLvl})` : ''}`);
    if (!f || f === 'equip') ok = false;                       // any refusal is fine; equipping it is the bug
    w.removePlayer(id);
  }
  record('equip_wrong_types', ok, out, 'each refused with the matching inventory_fail reason', { severity: ok ? 'info' : 'major' });
  // armor in combat
  const spot = freeNear('valley', 12, 44, 3);
  const bot = createBot({ world: w, content: C, cls: 'warden', spec: { name: 'Ec', cls: 'warden', zone: 'valley', x: spot[0], y: spot[1], bag: [gear('gear_plate_head', 1)] } });
  killNearest(w, bot, 'ink_slime', 200);
  const inC = w.get(bot.id).inCombat;
  w.enqueue(bot.id, { t: 'equip', bag: 0, item: 'gear_plate_head' });
  const ev = run(w, 1);
  record('equip_armor_in_combat', !inC || mine(ev, bot.id, ['inventory_fail']).some((e) => e.reason === 'combat'), { inCombat: inC, result: mine(ev, bot.id, ['inventory_fail', 'inventory']).map((e) => e.reason || e.kind) }, 'armor refused in combat (combat)', { severity: 'info' });
});

kase('inkblade_off_hand_dagger', () => {
  const w = newWorld(15);
  const id = w.addPlayer({ name: 'Ink', cls: 'inkblade', zone: 'willowmere', x: 20, y: 24, level: 6, bag: [gear('gear_dagger', 6), gear('gear_dagger', 6)] });
  w.enqueue(id, { t: 'equip', bag: 0, item: 'gear_dagger' });
  run(w, 1);
  w.enqueue(id, { t: 'equip', item: 'gear_dagger' });   // the second goes to the weaker hand (fix pass 1; bag indexes shift after an equip)
  run(w, 1);
  const p = w.get(id);
  const off = typeof p.equip.off === 'string' ? p.equip.off : p.equip.off && p.equip.off.item;
  const main = typeof p.equip.main === 'string' ? p.equip.main : p.equip.main && p.equip.main.item;
  const ok = off === 'gear_dagger';
  record('inkblade_off_hand_dagger', ok, { main, off, bag: p.bag.map((b) => b.item) }, 'WEAPON_TYPES.dagger.offOk: a second dagger can be worn in the off hand (an equip slot choice, or auto: off hand when the main is better)',
    { severity: ok ? 'info' : 'major', suspect: 'src/sim/world.js equipItem(): slot = it.slot (always main for daggers); the equip command has no slot field; offOk is never read' });
});

// ================================================================== 3. selling while indexes shift
kase('sell_indexes_shift', () => {
  const w = newWorld(16);
  const s = standBy('pell');
  const bag = () => [{ item: 'slime_ink', qty: 3 }, gear('gear_rod', 6), { item: 'wolf_pelt', qty: 2 }, { item: 'scarab_shell', qty: 1 }, { item: 'potion', qty: 2 }];
  const id = w.addPlayer({ name: 'Seller', cls: 'mender', zone: s.zone, x: s.x, y: s.y, bag: bag() });
  const pell = npcAt(w, 'pell');
  w.enqueue(id, { t: 'interact', id: pell.id });
  run(w, 1);
  // a client that captured the junk indexes (0, 2, 3) and sends them low to high in one tick
  for (const k of [0, 2, 3]) w.enqueue(id, { t: 'sell', npc: pell.id, bag: k, item: w.get(id).bag[k].item });
  const ev = run(w, 1);
  const left = w.get(id).bag.map((b) => b.item);
  const sold = mine(ev, id, ['inventory']).map((e) => e.item);
  const fails = mine(ev, id, ['inventory_fail']).map((e) => e.reason);
  // the same with indexes only (no item id): does it sell the WRONG thing?
  const id2 = w.addPlayer({ name: 'Seller', cls: 'mender', zone: s.zone, x: s.x, y: s.y, bag: bag() });
  run(w, 1);
  for (const k of [0, 2, 3]) w.enqueue(id2, { t: 'sell', npc: pell.id, bag: k });
  const ev2 = run(w, 1);
  const sold2 = mine(ev2, id2, ['inventory']).map((e) => e.item);
  // the UI way (ui.js sellJunk: high to low)
  const id3 = w.addPlayer({ name: 'Seller', cls: 'mender', zone: s.zone, x: s.x, y: s.y, bag: bag() });
  run(w, 1);
  for (const k of [3, 2, 0]) w.enqueue(id3, { t: 'sell', npc: pell.id, bag: k, item: w.get(id3).bag[k].item });
  const ev3 = run(w, 1);
  const sold3 = mine(ev3, id3, ['inventory']).map((e) => e.item);
  const ok = !sold2.includes('gear_rod') && !sold2.includes('potion');
  record('sell_indexes_shift', ok, { lowToHighWithItem: { sold, fails, left }, lowToHighIndexOnly: { sold: sold2 }, uiHighToLow: { sold: sold3 } },
    'a stale index never sells a different item; low-to-high with ids sells what it can and refuses the rest (no_item)',
    { severity: ok ? (sold.length < 3 ? 'minor' : 'info') : 'major', suspect: 'src/sim/world.js bagIndex(): with no `item` the index alone picks whatever sits there now' });
});

// ================================================================== 4. ground spells
kase('ground_spells_walls_and_range', () => {
  const w = newWorld(17);
  const spot = freeNear('valley', 50, 24, 2);
  const id = w.addPlayer({ name: 'Gr', cls: 'scribe', zone: 'valley', x: spot[0], y: spot[1], level: 14, known: ['scribe_scatter_letters', 'scribe_bracket'] });
  const Z = C.zones.valley;
  const p = w.get(id);
  const [tx, ty] = tileOfSub(p);
  // a wall cell within 8 tiles that is the FIRST solid cell along a ray (so the sight line reaches it)
  let wallAt = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    for (let k = 1; k <= 8; k++) { const c = Z.collision[ty + dy * k] && Z.collision[ty + dy * k][tx + dx * k]; if (c === '#') { wallAt = [tx + dx * k, ty + dy * k]; break; } if (c !== '.') break; }
    if (wallAt) break;
  }
  const tries = [
    ['inside_wall', wallAt ? { x: wallAt[0] * 16 + 8, y: wallAt[1] * 16 + 10 } : null],
    ['out_of_range', { x: p.x / SUB + 400, y: p.y / SUB }],
    ['missing_at', undefined],
    ['nan', { x: NaN, y: NaN }],
    ['off_map', { x: -5000, y: -5000 }],
    ['string', { x: '100', y: '200' }],
  ];
  const out = {};
  let bad = [];
  for (const [label, at] of tries) {
    if (label === 'inside_wall' && !at) { out[label] = 'no wall near'; continue; }
    w.enqueue(id, { t: 'cast', ability: 'scribe_scatter_letters', ...(at !== undefined ? { at } : {}) });
    let ev;
    try { ev = run(w, 1); } catch (err) { out[label] = 'THREW ' + err.message; bad.push(label); continue; }
    const r = mine(ev, id, ['cast_fail', 'cast_start', 'spawn']).map((e) => e.type + ':' + (e.reason || e.ability || e.template));
    const objs = w.state.ents.filter((o) => o.kind === 'object' && o.owner === id);
    const inWall = objs.filter((o) => !Number.isFinite(o.x) || boxBlocked(Z, o.x, o.y, 0, 0, -99999, -99999, null)).map((o) => `${o.obj && o.obj.def.id}@${(o.x / 256).toFixed(1)},${(o.y / 256).toFixed(1)}`);
    out[label] = { events: r, objectsInWallOrNaN: inWall };
    if (inWall.length || (label !== 'inside_wall' && r.some((x) => x.startsWith('cast_start')))) bad.push(label);
    run(w, 260);                                   // wait out the 12 s cooldown (and the zone) like a player
  }
  record('ground_spells_walls_and_range', bad.length === 0, out, 'out of range / NaN / off-map / missing `at` refused; never a zone object inside a wall or at NaN', { severity: bad.length ? 'major' : 'info', bad, suspect: 'src/sim/combat.js resolveTarget() ground branch / losBetween() skips the last sample (the end cell is never tested)' });
});

// ================================================================== 5. zone joins both ways
kase('zone_joins_both_ways', () => {
  const out = [];
  let bad = 0;
  for (const z of Object.values(C.zones)) for (const j of z.joins || []) {
    if (!C.zones[j.to]) continue;
    const w = newWorld(18);
    const Z = C.zones[z.id];
    const dir = j.x === 0 ? [-1, 0] : j.x >= Z.w - 1 ? [1, 0] : j.y === 0 ? [0, -1] : [0, 1];
    const [sx, sy] = [j.x - dir[0] * 2, j.y - dir[1] * 2];
    if (!spotFree(Z, sx, sy)) { out.push(`${z.id}->${j.to}: start ${sx},${sy} not free`); bad++; continue; }
    const id = w.addPlayer({ name: 'J', cls: 'wayfinder', zone: z.id, x: sx, y: sy });
    w.enqueue(id, { t: 'move', dx: dir[0], dy: dir[1] });
    let zev = null;
    for (let t = 0; t < 60 && !zev; t++) zev = run(w, 1).find((e) => e.type === 'zone' && e.id === id);
    if (!zev) { out.push(`${z.id}->${j.to}: never crossed`); bad++; continue; }
    const p = w.get(id);
    const D = C.zones[j.to];
    const [ax, ay] = tileOfSub(p);
    const issues = [];
    if (!spotFree(D, ax, ay)) issues.push('arrival not free');
    if (inJoin(D, ax, ay)) issues.push('arrival inside a join (ping-pong)');
    // keep holding the same key 0.5 s: must not bounce straight back
    const ev2 = run(w, 10);
    if (ev2.some((e) => e.type === 'zone' && e.id === id)) issues.push('bounced back while still holding the key');
    // now walk back the opposite way
    w.enqueue(id, { t: 'move', dx: -dir[0], dy: -dir[1] });
    let back = null;
    for (let t = 0; t < 80 && !back; t++) back = run(w, 1).find((e) => e.type === 'zone' && e.id === id);
    if (!back) issues.push('cannot walk straight back (opposite key)');
    else if (back.to !== z.id) issues.push(`walking back lands in ${back.to}, not ${z.id}`);
    if (issues.length) bad++;
    out.push(`${z.id} (${j.x},${j.y}) -> ${j.to} (${ax},${ay}): ${issues.length ? issues.join('; ') : 'ok'}${back ? ` | back -> ${back.to} (${back.x},${back.y})` : ''}`);
  }
  record('zone_joins_both_ways', bad === 0, out, 'every join crosses on a held key, lands on a free cell outside any join, does not bounce, and the opposite key walks straight back', { severity: bad ? 'major' : 'info' });
});

// ================================================================== 6. dying with the lantern in another zone
kase('death_lantern_other_zone', () => {
  const out = [];
  let bad = 0;
  for (const [zone, x, y, lantern] of [['moor', 30, 60, { zone: 'downs', id: 'thornfold_hearth', x: 78, y: 34 }], ['downs', 100, 62, { zone: 'willowmere', id: 'square', x: 21, y: 19 }], ['valley', 80, 25, null],
    ['valley', 80, 25, { zone: 'x1_terrace', id: 'ghost', x: 5, y: 5 }], ['valley', 80, 25, { zone: 'valley', id: 'fake', x: 0, y: 0 }]]) {
    const w = newWorld(19);
    const [fx, fy] = freeNear(zone, x, y, 4);
    const id = w.addPlayer({ name: 'D', cls: 'mender', zone, x: fx, y: fy, level: 1, quests: { wm_yard_slimes: { state: 'active', counts: [3] } }, questsDone: ['wm_name_twice'], ...(lantern ? { lantern } : {}) });
    const start = w.get(id).lantern;
    // walk toward the nearest aggressive foe until it kills us
    const bot = { me: () => w.get(id) };
    void bot;
    let death = null, resp = null, zoneEv = null, evs = [], atDeath = null;
    const tgt = w.state.ents.filter((m) => m.kind === 'mob' && !m.dead && m.zone === zone && (C.mobs[m.template].behavior !== 'passive')).sort((a, b) => Math.hypot(a.x - w.get(id).x, a.y - w.get(id).y) - Math.hypot(b.x - w.get(id).x, b.y - w.get(id).y))[0];
    w.enqueue(id, { t: 'attack', id: tgt.id });
    for (let t = 0; t < 6000 && !resp; t++) {
      const p = w.get(id);
      if (!p.dead && !death) { const dx = Math.sign(tgt.x - p.x), dy = Math.sign(tgt.y - p.y); if (Math.hypot(tgt.x - p.x, tgt.y - p.y) > 20 * SUB) w.enqueue(id, { t: 'move', dx, dy }); else w.enqueue(id, { t: 'stop' }); }
      const ev = w.step(); evs = evs.concat(ev);
      if (!death && ev.find((e) => e.type === 'death' && e.id === id)) atDeath = { ...w.get(id).lantern };
      death = death || ev.find((e) => e.type === 'death' && e.id === id);
      resp = ev.find((e) => e.type === 'respawn' && e.id === id);
      zoneEv = zoneEv || ev.find((e) => e.type === 'zone' && e.id === id);
    }
    const p = w.get(id);
    const issues = [];
    if (!death) { out.push(`${zone} lantern ${lantern ? lantern.zone + ':' + lantern.id : 'default'}: did not die (${p.hp}/${p.hpMax})`); continue; }
    if (!resp) issues.push('never woke');
    else {
      // the lantern held at death (fix pass 1: walking within 3 tiles of a lantern binds it, so the bound one can change on the way)
      const want = atDeath && C.zones[atDeath.zone] ? atDeath : start;
      const bogus = want.id === 'fake';
      if (!bogus && p.zone !== want.zone && C.zones[want.zone]) issues.push(`woke in ${p.zone}, lantern in ${want.zone}`);
      if (bogus && p.zone !== C.start.zone) issues.push('a lantern on a wall cell did not fall back to the start');
      if (p.zone !== zone && !zoneEv) issues.push('no zone event on the cross-zone respawn');
      if (!spotFree(C.zones[p.zone], ...tileOfSub(p))) issues.push('woke inside a wall');
      if (p.hp !== p.hpMax) issues.push('not full health');
      if (p.target != null) issues.push('target kept');
      if (!(p.quests.wm_yard_slimes && p.quests.wm_yard_slimes.counts[0] === 3)) issues.push('quest progress changed');
      const holders = w.state.ents.filter((m) => m.kind === 'mob' && m.threat && m.threat[id] > 0);
      if (holders.length) issues.push(`${holders.length} mobs still hold threat on the corpse`);
    }
    if (issues.length) bad++;
    out.push(`${zone} lantern ${lantern ? lantern.zone + ':' + lantern.id : 'default square'} (kept as ${start.zone}:${start.id}) -> woke ${p.zone} ${tileOfSub(p).join(',')}: ${issues.join('; ') || 'ok'}`);
  }
  record('death_lantern_other_zone', bad === 0, out, 'wake at the last lantern even in another zone (zone event), full health, no target, threat cleared, progress kept; a bad saved lantern falls back to the square', { severity: bad ? 'major' : 'info' });
});

// ================================================================== 7. save and restore mid-escort / mid-cast / mid-fight, each zone
kase('save_restore_mid_escort', () => {
  const w = newWorld(20);
  const [x, y] = freeNear('valley', 87, 27, 3);
  const id = w.addPlayer({ name: 'Esc', cls: 'warden', zone: 'valley', x, y, level: 7, questsDone: ['wm_name_twice', 'wm_pilgrim_wolves'] });
  const nella = npcAt(w, 'nella');
  void nella;
  // accept at Nella needs Willowmere; the restore path gives the quest as a save would right after accepting
  w.enqueue(id, { t: 'quest_accept', quest: 'wm_lark_wanders' });   // NOTE: accepted far from Nella; see the remote-quest case
  run(w, 5);
  const lark0 = w.state.ents.find((e) => e.escort && e.escort.owner === id);
  // walk to Lark so she follows
  const bot = { id };
  void bot;
  const { id: id2, save } = relog(w, id);
  run(w, 40);
  const p = w.get(id2);
  const lark = w.state.ents.find((e) => e.escort && e.escort.owner === id2 && !e.dead);
  const gone = w.state.ents.filter((e) => e.template === 'lark_escort' && e.zone === '_gone').length;
  const ok = !!lark || !p.quests.wm_lark_wanders;
  record('save_restore_mid_escort', ok, { beforeHadLark: !!lark0, savedQuest: save.quests.wm_lark_wanders, afterQuest: p.quests.wm_lark_wanders, larkAfter: !!lark, deadLarkEntitiesLeft: gone },
    'after a restore the escort restarts (Lark back at her start) or the quest is reset to available; never active with no Lark',
    { severity: ok ? 'info' : 'major', suspect: 'src/main.js specFor()/stripEscorts() drops the escort id but nothing respawns her; src/sim/quests.js startEscort only runs on accept' });
});

kase('save_restore_mid_cast_mid_fight_each_zone', () => {
  const out = [];
  let exploits = [];
  for (const [zone, x, y, mob] of [['valley', 12, 44, 'ink_slime'], ['downs', 120, 6, 'fold_ram'], ['moor', 110, 60, 'moss_scarab'], ['willowmere', 20, 24, null]]) {
    const w = newWorld(21);
    const [fx, fy] = freeNear(zone, x, y, 4);
    const lvl = zone === 'moor' ? 12 : zone === 'downs' ? 7 : 3;
    const bot = createBot({ world: w, content: C, cls: 'scribe', spec: { name: 'Sv', cls: 'scribe', zone, x: fx, y: fy, level: lvl, known: ['scribe_full_stop'] } });
    let id = bot.id;
    let fightInfo = '';
    if (mob) {
      // start a fight: hit it with Scrawl, let it chew on us a while, then start an Inkbolt and save mid-cast
      const m = w.state.ents.filter((e) => e.kind === 'mob' && !e.dead && e.template === mob && e.zone === zone).sort((a, b) => Math.hypot(a.x - w.get(id).x, a.y - w.get(id).y) - Math.hypot(b.x - w.get(id).x, b.y - w.get(id).y))[0];
      for (let t = 0; t < 1500; t++) { const d = Math.hypot((m.x - w.get(id).x) / SUB, (m.y - w.get(id).y) / SUB); if (d > 100) bot.walkToEnt('m', m, 80); else { bot.hold(0, 0); break; } w.step(); }
      w.enqueue(id, { t: 'cast', ability: 'scribe_scrawl', target: m.id });
      run(w, 2);
      w.enqueue(id, { t: 'cast', ability: 'scribe_full_stop' });
      for (let t = 0; t < 200 && w.get(id).hp > w.get(id).hpMax * 0.6; t++) w.step();
      w.get(id).gcdUntil <= w.tick || run(w, 20);
      w.enqueue(id, { t: 'cast', ability: 'scribe_inkbolt', target: m.id });
      run(w, 3);
      const p = w.get(id);
      fightInfo = `hp ${p.hp}/${p.hpMax} mana ${Math.round(p.res.cur)}/${p.res.max} casting ${p.cast ? p.cast.ability : '-'} inCombat ${p.inCombat} cd ${JSON.stringify(p.cd)}`;
      const before = { hp: p.hp, mana: p.res.cur, cd: { ...p.cd } };
      const r = relog(w, id); id = r.id;
      const q = w.get(id);
      const notes = [];
      if (q.zone !== zone) notes.push(`zone ${q.zone}`);
      if (!spotFree(C.zones[q.zone], ...tileOfSub(q))) notes.push('restored inside a wall');
      if (q.hp > before.hp) { notes.push(`health refilled ${before.hp} -> ${q.hp}`); exploits.push('hp'); }
      if (q.res.cur > before.mana + 1) { notes.push(`mana refilled ${Math.round(before.mana)} -> ${Math.round(q.res.cur)}`); exploits.push('mana'); }
      const running = Object.keys(before.cd).filter((k) => before.cd[k] > w.tick);       // cooldowns still running at the save
      if (running.length && !running.every((k) => q.cd[k] > w.tick)) { notes.push(`cooldowns cleared (${running.join(',')})`); exploits.push('cd'); }
      const holders = w.state.ents.filter((e) => e.kind === 'mob' && e.threat && Object.keys(e.threat).length && e.id === m.id);
      if (holders.length) notes.push('the mob still holds old threat');
      out.push(`${zone}: ${fightInfo} -> restored: ${notes.join('; ') || 'same'}`);
    } else {
      const before = saveState(w, id);
      const r = relog(w, id); id = r.id;
      const q = w.get(id);
      out.push(`${zone}: idle save ${before.tx},${before.ty} -> ${tileOfSub(q).join(',')} ${q.zone === zone ? 'ok' : 'WRONG ZONE'}`);
    }
  }
  const ok = !exploits.length;
  record('save_restore_mid_cast_mid_fight_each_zone', ok, out, 'a save mid-fight restores the same health, mana and cooldowns (or cannot be made in combat); position and zone kept',
    { severity: ok ? 'info' : 'minor', suspect: 'src/main.js saveState() saves no hp / mana / cd; src/sim/world.js addPlayer() sets hp = hpMax and mana = max: quit and re-enter = a free full heal and a cooldown reset' });
});

// ================================================================== 8. rapid quit / re-enter and two characters
kase('rapid_quit_reenter', () => {
  const w = newWorld(22);
  const [x, y] = freeNear('valley', 30, 30, 3);
  let id = w.addPlayer({ name: 'Q', cls: 'wayfinder', zone: 'valley', x, y, level: 4, known: ['wayfinder_briar_trap'] });
  w.enqueue(id, { t: 'cast', ability: 'wayfinder_briar_trap' });
  run(w, 2);
  const n0 = w.state.ents.length;
  const ids = new Set([id]);
  let reuse = false, threw = null;
  for (let k = 0; k < 300; k++) {
    try {
      w.enqueue(id, { t: 'move', dx: 1, dy: 0 });   // a command still queued for the old id when it leaves
      const r = relog(w, id);
      if (ids.has(r.id)) reuse = true;
      ids.add(r.id); id = r.id;
      if (k % 3 === 0) run(w, 1);
    } catch (err) { threw = String(err.stack || err); break; }
  }
  run(w, 5);
  const n1 = w.state.ents.length;
  const traps = w.state.ents.filter((o) => o.kind === 'object' && o.obj).length;
  const players = w.state.ents.filter((e) => e.kind === 'player').length;
  const ok = !threw && !reuse && players === 1 && n1 <= n0;
  record('rapid_quit_reenter', ok, { entsBefore: n0, entsAfter: n1, players, trapsLeft: traps, idReused: reuse, threw }, '300 quit/re-enter cycles: one player, no leaked entities, ids never reused, no throw', { severity: ok ? 'info' : 'major' });
});

kase('two_characters_switched', () => {
  const w = newWorld(23);
  const s = standBy('cobb');
  let a = w.addPlayer({ name: 'Ann', cls: 'warden', zone: s.zone, x: s.x, y: s.y, gold: 33, questsDone: ['wm_name_twice'] });
  w.enqueue(a, { t: 'interact', id: npcAt(w, 'cobb').id });
  w.enqueue(a, { t: 'quest_accept', quest: 'wm_cobbs_hens' });
  run(w, 2);
  const saveA = saveState(w, a);
  w.removePlayer(a);
  let b = w.addPlayer({ name: 'Bea', cls: 'scribe', zone: s.zone, x: s.x, y: s.y, gold: 5 });
  // Bea picks a hen node (she has no quest, so it should refuse) and takes Hob's first quest by restore
  const hen = w.state.ents.find((o) => o.kind === 'object' && o.node && o.node.item === 'stray_hen');
  w.enqueue(b, { t: 'interact', id: hen.id });
  const evb = run(w, 2);
  const saveB = saveState(w, b);
  w.removePlayer(b);
  a = w.addPlayer(specFor({ name: 'Ann', cls: 'warden', look: 0, state: saveA }));
  const pa = w.get(a);
  b = w.addPlayer(specFor({ name: 'Bea', cls: 'scribe', look: 0, state: saveB }));
  const pb = w.get(b);
  const issues = [];
  if (!pa.quests.wm_cobbs_hens) issues.push('Ann lost her quest');
  if (pb.quests.wm_cobbs_hens) issues.push('Bea got Ann\'s quest');
  if (pa.gold !== 33 || pb.gold !== 5) issues.push(`gold Ann ${pa.gold} Bea ${pb.gold}`);
  if (pa.cls !== 'warden' || pb.cls !== 'scribe') issues.push('class swapped');
  if (!mine(evb, saveB ? b - 2 : b, ['interact_fail']).length && pb.bag.length) issues.push('Bea picked a hen without the quest');
  record('two_characters_switched', !issues.length, { issues, ann: { quests: Object.keys(pa.quests), gold: pa.gold }, bea: { quests: Object.keys(pb.quests), gold: pb.gold, bag: pb.bag.map((x) => x.item) } }, 'no state bleeds between two saved characters', { severity: issues.length ? 'major' : 'info' });
});

// ================================================================== 9. extra: quest commands from anywhere, escort leak, ledge traps
kase('quest_commands_ignore_range', () => {
  const w = newWorld(24);
  const [x, y] = freeNear('moor', 78, 95, 3);
  const id = w.addPlayer({ name: 'Far', cls: 'warden', zone: 'moor', x, y });
  w.enqueue(id, { t: 'quest_accept', quest: 'wm_name_twice' });
  run(w, 1);
  const accepted = !!w.get(id).quests.wm_name_twice;
  // talk objective done the honest way would need Mael; use a ready-state restore to test turn-in
  const id2 = w.addPlayer({ name: 'Far', cls: 'warden', zone: 'moor', x, y, quests: { wm_yard_slimes: { state: 'ready', counts: [6] } }, questsDone: ['wm_name_twice'] });
  w.enqueue(id2, { t: 'quest_turnin', quest: 'wm_yard_slimes', choice: 1 });
  const ev = run(w, 1);
  const turned = (w.get(id2).questsDone || []).includes('wm_yard_slimes');
  const ok = !accepted && !turned;
  record('quest_commands_ignore_range', ok, { acceptedFromTheMoor: accepted, turnedInFromTheMoor: turned, xp: mine(ev, id2, ['xp']).map((e) => e.amount) },
    'quest_accept / quest_turnin need the giver / turn-in npc within 40 px, like interact, train, buy and sell',
    { severity: ok ? 'info' : 'major', suspect: 'src/sim/world.js applyCommand quest_accept / quest_turnin -> src/sim/quests.js accept()/turnIn() check no npc and no range (phase 2: a joined client can complete any quest anywhere)' });
});

kase('escort_restart_leaks_entities', () => {
  const w = newWorld(25);
  const [x, y] = freeNear('valley', 87, 27, 3);
  const id = w.addPlayer({ name: 'Lk', cls: 'warden', zone: 'valley', x, y, level: 7, questsDone: ['wm_name_twice', 'wm_pilgrim_wolves'] });
  const n0 = w.state.ents.length;
  for (let k = 0; k < 30; k++) { w.enqueue(id, { t: 'quest_accept', quest: 'wm_lark_wanders' }); run(w, 1); w.enqueue(id, { t: 'quest_abandon', quest: 'wm_lark_wanders' }); run(w, 1); }
  const gone = w.state.ents.filter((e) => e.zone === '_gone').length;
  const n1 = w.state.ents.length;
  const snapN = w.snapshot().entities.filter((e) => e.zone === '_gone').length;
  record('escort_restart_leaks_entities', gone === 0, { entsBefore: n0, entsAfter: n1, goneEntities: gone, inSnapshot: snapN }, 'an ended escort npc is removed from the world', { severity: gone ? 'minor' : 'info', suspect: 'src/sim/quests.js endEscort() marks dead + zone "_gone" but never removes the entity (state, hash and every snapshot grow per escort attempt)' });
});

kase('escort_ambush_spawns_in_wall', () => {
  // fix pass 1: drive the real escort: Lark at each ambush spot, then read where the adds really appeared
  const q = C.quests.wm_lark_wanders;
  const o = q.objectives.find((x) => x.kind === 'escort');
  const Z = C.zones[o.from.zone];
  const bad = [], seen = [];
  const w = newWorld(20);
  const s = standBy('nella');
  const id = w.addPlayer({ name: 'Esc', cls: 'warden', zone: s.zone, x: s.x, y: s.y, level: 7, questsDone: ['wm_name_twice', 'wm_pilgrim_wolves'] });
  w.enqueue(id, { t: 'quest_accept', quest: 'wm_lark_wanders' }); run(w, 1);
  const p = w.get(id);
  (o.ambush || []).forEach((a, k) => {
    const lark = w.state.ents.find((e) => e.kind === 'npc' && e.escort && e.escort.owner === id);
    const [x, y] = freeNear(Z.id, a.at.x, a.at.y, 2);
    lark.x = x * 256 + 128; lark.y = (y + 1) * 256 - 16; p.zone = Z.id; p.x = lark.x; p.y = lark.y;
    const before = new Set(w.state.ents.map((e) => e.id));
    run(w, 1);
    for (const m of w.state.ents.filter((e) => !before.has(e.id) && e.kind === 'mob')) {
      const mx = Math.floor(m.x / 256), my = Math.floor((m.y - 1) / 256);
      seen.push(`${k}:${mx},${my}`);
      if (boxBlocked(Z, m.x, m.y, 0, 0, -99999, -99999, null)) bad.push(`ambush ${k} add (${m.template}) at ${mx},${my}: '${Z.collision[my][mx]}'`);
    }
  });
  record('escort_ambush_spawns_in_wall', !bad.length && seen.length > 0, bad.length ? bad : `all ambush adds on free cells: ${seen.join(' ')}`, 'ambush adds appear on walkable cells', { severity: bad.length ? 'major' : 'info' });
});

kase('one_way_ledge_traps', () => {
  // cells you can walk into from the zone's arrival but from which no join or lantern can be reached: a softlock
  const out = [];
  for (const Z of Object.values(C.zones)) {
    const W = Z.w, H = Z.h;
    const can = (x, y, dx, dy) => { const c = nav.cell(Z.id, x + dx, y + dy); if (c === '.') return true; const L = { v: [0, 1], '>': [1, 0], '<': [-1, 0] }[c]; return !!L && L[0] === dx && L[1] === dy; };
    const [ax, ay] = Z.arrival;
    const seen = new Uint8Array(W * H); const q = [[ax, ay]]; seen[ay * W + ax] = 1;
    for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !can(x, y, dx, dy)) continue; seen[ny * W + nx] = 1; q.push([nx, ny]); } }
    // reverse search from exits (joins to loaded zones + lanterns)
    const back = new Uint8Array(W * H); const q2 = [];
    for (const j of Z.joins || []) if (C.zones[j.to]) for (let y = j.y; y < j.y + j.h; y++) for (let x = j.x; x < j.x + j.w; x++) { back[y * W + x] = 1; q2.push([x, y]); }
    for (const l of Z.lanterns || []) { back[l.y * W + l.x] = 1; q2.push([l.x, l.y]); }
    for (let i = 0; i < q2.length; i++) { const [x, y] = q2[i]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const px = x - dx, py = y - dy; if (px < 0 || py < 0 || px >= W || py >= H || back[py * W + px]) continue; const c = nav.cell(Z.id, px, py); if (c === '#' || c === '~') continue; if (!can(px, py, dx, dy)) continue; back[py * W + px] = 1; q2.push([px, py]); } }
    let trapped = 0; const sample = [];
    for (let i = 0; i < W * H; i++) if (seen[i] && !back[i]) { trapped++; if (sample.length < 6) sample.push(`${i % W},${(i / W) | 0}`); }
    // things the content needs that cannot be reached from the arrival
    const miss = [];
    const reach = (x, y, r = 2) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const k = (y + dy) * W + x + dx; if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && seen[k]) return true; } return false; };
    for (const n of Z.npcs || []) if (!reach(n.x, n.y)) miss.push('npc ' + n.npc);
    for (const n of Z.nodes || []) if (!reach(n.x, n.y)) miss.push('node ' + n.id);
    for (const l of Z.lanterns || []) if (!reach(l.x, l.y, 0)) miss.push('lantern ' + l.id);
    out.push(`${Z.id}: reachable ${seen.reduce((s, v) => s + v, 0)} cells, ${trapped} one-way pockets${sample.length ? ' e.g. ' + sample.join(' ') : ''}${miss.length ? '; unreachable: ' + miss.join(', ') : ''}`);
    if (trapped || miss.length) results.__trap = (results.__trap || 0) + 1;
  }
  const bad = results.__trap || 0;
  delete results.__trap;
  record('one_way_ledge_traps', bad === 0, out, 'no cell you can walk into without a way back to a join or lantern; every npc, node and lantern reachable from the arrival', { severity: bad ? 'minor' : 'info' });
});

kase('lantern_touch_radius_vs_paths', () => {
  // how far off the natural path each lantern sits (the bot walks the shortest paths a player would)
  const out = [];
  for (const Z of Object.values(C.zones)) for (const l of Z.lanterns || []) {
    const near = [];
    for (const j of Z.joins || []) if (C.zones[j.to]) near.push(`${j.to} join ${Math.round(Math.hypot(j.x - l.x, j.y - l.y))} tiles`);
    out.push(`${Z.id}:${l.id} at ${l.x},${l.y}; ${near.join(', ')}`);
  }
  record('lantern_touch_radius_vs_paths', true, out, `binding needs the feet within ${C.progression.death.lanternTouch} px (1 tile) of the lantern cell (info)`, { severity: 'info' });
});

// ---------------------------------------------------------------- report
const fails = results.filter((r) => !r.ok);
writeFileSync(join(OUT, 'edges.json'), JSON.stringify(results, null, 1));
console.log(`EDGES_DONE: cases=${results.length} fail=${fails.length} errors=${results.filter((r) => r.error).length}`);

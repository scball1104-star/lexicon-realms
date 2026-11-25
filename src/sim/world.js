// The world: state, command queue, fixed tick. Pure: no DOM, no canvas, no Date.now, no Math.random.
//
//   const w = createWorld({ seed, content, systems })  content: docs/CONTRACTS.md section 7 (zones, mobs, npcs, spawns, start,
//                                                     and for combat: classes, abilities, mobAbilities, talents, progression,
//                                                     weaponTypes). systems: optional [{ id, tick(world, events) }] (quests)
//   const id = w.addPlayer({ name, cls })            system action, applied at once (log it as { tick, sys: 'join', spec })
//   w.enqueue(id, { t: 'move', dx: 1, dy: 0 })       applied at the start of the next step, in enqueue order
//   const events = w.step()                          advance one tick (1/20 s); returns this tick's events
//   w.snapshot()                                     plain JSON view (CONTRACTS section 4, with `hud` per player)
//   w.hash()                                         16 hex chars over the full state (determinism tests, desync checks)
//   w.serialize() / restoreWorld(json, content)      full state round trip (late join, save states)
//   w.grantXp(id, amount, reason)                    XP from outside the combat rules (quest turn-ins, exploration)
//   w.setParty(id, party)                            system action (log it as { tick, sys: 'party', id, party }): co-op party
//   w.saveFields(id)                                 the sim-owned part of a character save (hp, resource, cooldowns,
//                                                    lasting buffs, quest bag, pending loot, escorts); addPlayer takes it back
//
// Positions are integers in SUB (1/16 px). The snapshot reports pixels.
// Combat runs when content carries classes + abilities + progression; without them the foundation stub rules apply
// (cast = GCD check + cast_start/cast_stop 'stub', mobs only wander), so the zone-only content still runs.
import { createRng } from './rng.js';
import { SUB, TILE, PLAYER_SPEED, DIAG, GCD_TICKS, INTERACT_RANGE_PX, TARGET_RANGE_PX, PARTY_SHARE_PX } from './constants.js';
import { moveAxis, feetTile, inJoin, spotFree, boxBlocked, standTile } from './collision.js';
import { mobThink, createAi } from './ai.js';
import { hashString } from './hash.js';
import { distPx, distPxXY, dirFromVec } from './geom.js';
import { createData } from './data.js';
import { createStats } from './stats.js';
import { createCombat } from './combat.js';
import { createScripts } from './scripts.js';
import { createProgression } from './progression.js';
import { createBuilds2 } from './builds2.js';
import { createHud } from './hud.js';
import { createQuests } from './quests.js';
import { createStorage } from './storage.js';
import { createAppearance } from './appearance.js';   // wave 6: a hero's own look (`app`) and the free mirror
import { rollKill, rollGear, bagAdd, bagRemove, bagFree, resolveItem, ensureUids, migrateQuestItems, bagFindUid } from './loot.js';
import { createDungeons, withCopies } from './dungeons.js';
import { dayFraction, isNight } from './clock.js';
import { createWorldLife } from './worldlife.js';
import { createParty } from './party.js';
import { createTrade } from './trade.js';
import { createProfessions } from './professions.js';
import { createGlyphs } from './glyphs.js';
import { createWordDoors } from './worddoor.js';   // word doors (wave 8 glyphdoor)
import { createTravel } from './travel.js';
import { createLegendDrops } from './legend_drops.js';
import { createMounts } from './mounts.js';
import { createRealmMech } from './realm_mech.js';   // wave 3: the start realms' lava, Gate waves and tide
import { createRealms2 } from './realms2.js';   // wave 3 realms2: the sandstorm and the lantern watch
import { createEmotes } from './emotes.js';   // wave 7 anim: jump and emotes, one cosmetic field (no rng, position or stats)

export { distPx };
export const STATE_VERSION = 2;
const DIRS = ['down', 'left', 'right', 'up'];

function dirFor(dx, dy, prev) {
  if (dx === 0 && dy === 0) return prev;
  if (dx !== 0 && dy !== 0) {
    // keep the current facing when it is one of the two diagonal components (no flicker on diagonals)
    if ((prev === 'left' && dx < 0) || (prev === 'right' && dx > 0) || (prev === 'up' && dy < 0) || (prev === 'down' && dy > 0)) return prev;
  }
  if (dx !== 0) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

const clampUnit = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const tileToSub = (tx, ty) => [tx * TILE + TILE / 2, (ty + 1) * TILE - SUB];

function baseEntity(id, kind, zone, tx, ty) {
  const [x, y] = tileToSub(tx, ty);
  return {
    id, kind, zone, x, y, dir: 'down', moving: false, mx: 0, my: 0,
    name: '', level: 1, faction: 'friendly', sprite: null, template: null,
    hp: 1, hpMax: 1, res: null, stats: { str: 0, agi: 0, int: 0, spi: 0, sta: 0, armor: 0 },
    target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
  };
}

export function createWorld({ seed = 1, content, systems = [], day = 0 }) {
  if (!content || !content.zones) throw new Error('createWorld needs content.zones');
  // day: the bounty boards' day index (src/sim/quests.js), a whole number from the client; never read from a clock here
  const state = { v: STATE_VERSION, seed, tick: 0, rng: 0, nextId: 1, ents: [], proj: [], day: day | 0 };
  const w = wrap(state, content, createRng(seed), systems);
  w.spawnContent();
  return w;
}

export function restoreWorld(json, content, systems = []) {
  const state = typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
  if (state.v !== STATE_VERSION) throw new Error(`state version ${state.v}, expected ${STATE_VERSION}`);
  const rng = createRng(state.seed);
  rng.state = state.rng;
  return wrap(state, content, rng, systems);
}

function wrap(state, content0, rng, systems) {
  // dungeon copies (src/sim/dungeons.js): zones['barrow#12'] reads the Barrow's zone data, so every module below can look a
  // copy's zone up like any other
  const content = { ...content0, zones: withCopies(content0.zones) };
  const queue = [];                // [{ id, cmd }] for the next step
  let events = [];
  const index = new Map(state.ents.map((e) => [e.id, e]));
  const zoneOf = (e) => content.zones[e.zone];
  // One world (src/data/maps/layout.js): a spec in an area's own tiles (an old save, a ?zone=valley link, a test) moves
  // onto the world map. content.regionAt: area id -> its corner [x, y] on the world; zones not listed pass unchanged.
  const RA = content.regionAt || {};
  const worldRef = (o) => {
    if (!o || !RA[o.zone] || content.zones[o.zone]) return o;
    const [ox, oy] = RA[o.zone];
    return { ...o, zone: content.worldId, ...(o.x != null ? { x: o.x + ox } : {}), ...(o.y != null ? { y: o.y + oy } : {}) };
  };
  const worldSpec = (spec) => {
    if (!spec) return spec;
    let out = spec;
    if (RA[spec.zone] && !content.zones[spec.zone]) out = worldRef(spec);
    if (spec.lantern && RA[spec.lantern.zone] && !content.zones[spec.lantern.zone]) out = { ...out, lantern: worldRef(spec.lantern) };
    return out;
  };
  const emit = (ev) => { events.push({ tick: state.tick, ...ev }); };
  const combatOn = !!(content.classes && content.abilities && content.progression);

  /**
   * Who shares a kill (online co-op, docs/NET.md): the tagger first, then every other player of the tagger's party
   * (e.party, set by addPlayer spec.party or setParty) who is alive, in the foe's zone and within PARTY_SHARE_PX of it,
   * in id order. Solo (no party): just the tagger. Each one gets their own kill XP, quest credit and loot roll.
   */
  function killShare(mob, who) {
    if (!who || who.kind !== 'player') return [];
    const out = [who];
    if (who.party == null) return out;
    for (const p of state.ents) {
      if (p === who || p.kind !== 'player' || p.party !== who.party || p.dead || p.zone !== mob.zone) continue;
      if (distPx(p, mob) <= PARTY_SHARE_PX) out.push(p);
    }
    return out;
  }
  function add(e) { state.ents.push(e); index.set(e.id, e); return e; }
  function remove(e) { const i = state.ents.indexOf(e); if (i >= 0) state.ents.splice(i, 1); index.delete(e.id); }

  // ---- combat context (only when combat content is loaded)
  const C = { state, content, rng, emit, get: (id) => index.get(id) || null, add, remove, zoneOf, INTERACT_RANGE_PX, killShare,
    spotFree, boxFree: (zone, x, y) => !!zone && !boxBlocked(zone, x, y, 0, 0, -99999, -99999, null) };
  if (combatOn) {
    C.P = content.progression;
    C.content = { ...content, weaponTypes: content.weaponTypes || {}, mobs: content.mobs || {}, npcs: content.npcs || {} };
    C.data = createData(content);
    C.stats = createStats(C);
    C.scripts = createScripts(C);
    C.combat = createCombat(C);
    C.ai = createAi(C);
    C.prog = createProgression(C);
    C.b2 = createBuilds2(C);                 // Builds 2 (off unless content.progression.builds2.enabled)
    C.hud = createHud(C);
    C.life = createWorldLife(C);             // rares, rest XP, story cards, Night at the Stones (src/sim/worldlife.js)
    C.realms2 = createRealms2(C);            // the realms2 start realms' storm and lantern watch (src/sim/realms2.js)
    C.onDeath = (dst, killer) => { C.prog.onDeath(dst, killer); if (dst.kind === 'mob') { C.life.onMobDeath(dst); questKill(dst, killer); } };
    C.onDamaged = (e) => { if (QS) QS.onDamaged(e); };
    C.spawnMobEnt = (spec) => spawnMob(spec);
  }

  // ---- quests and loot (CONTRACTS 7.7): src/sim/quests.js and src/sim/loot.js, called at fixed points below
  const QS = content.quests ? createQuests({
    state, content, emit, rng, get: (id) => index.get(id) || null, ents: () => state.ents,
    grantXp: (e, amount, reason, extra) => (combatOn ? C.prog.grantXp(e, amount, reason, extra) : ((e.xp += amount), amount)),
    addEntity: add, removeEntity: (e) => { if (index.has(e.id)) remove(e); }, nextId: () => state.nextId++, spawnMob: (spec) => spawnMob(spec),
    spotFree, INTERACT_RANGE_PX,
  }) : null;
  // ---- storage (the Lantern Chest, src/sim/storage.js): the hero tab, the Shared tab (state.shared) and glyph trips
  const ST = combatOn && content.items ? createStorage({
    state, content, emit, get: (id) => index.get(id) || null, distPx, reach: INTERACT_RANGE_PX + 24, openReach: INTERACT_RANGE_PX, tileToSub,
    bagIndex: (e, cmd) => bagIndex(e, cmd), onBag: (e) => { if (QS) QS.onBag(e); },
  }) : null;
  if (combatOn) C.storage = ST;
  // ---- appearance (src/sim/appearance.js): the free mirror and `set_app`; e.app rides the snapshot to every co-op friend
  const AP = createAppearance({ content, emit, get: (id) => index.get(id) || null, distPx, reach: INTERACT_RANGE_PX + 24, openReach: INTERACT_RANGE_PX, tileToSub });
  // ---- dungeons and caves (src/sim/dungeons.js): copies per party, bosses, their loot and the daily chest
  const DG = Object.values(content.zones).some((z) => z && (z.kind === 'dungeon' || z.kind === 'cave')) ? createDungeons({
    state, content, emit, rng, get: (id) => index.get(id) || null, add, remove, spawnMob: (spec) => spawnMob(spec), nextId: () => state.nextId++, tileToSub,
    rollGear, bagAdd, onBag: (e) => { if (QS) QS.onBag(e); },
    grantXp: (e, amount, reason, extra) => (combatOn ? C.prog.grantXp(e, amount, reason, extra) : 0),
    killXp: (L) => (content.progression ? content.progression.killXp.base + content.progression.killXp.perLevel * L : 20 + 4 * L),
    combat: () => C.combat, ai: () => C.ai, stats: combatOn ? () => C.stats : null,
  }) : null;
  C.dungeons = DG;
  // ---- group play (src/sim/party.js, src/sim/trade.js): foe scaling, rez, release or wait, quest sharing, ready check,
  // trade and binding. Off without content.party (src/data/party.js).
  const GP = combatOn && content.party ? createParty({ state, content, emit, get: (id) => index.get(id) || null, C, quests: () => QS }) : null;
  const TR = combatOn && content.party && content.items ? createTrade({ state, content, emit, get: (id) => index.get(id) || null, onBag: (e) => { if (QS) QS.onBag(e); } }) : null;
  C.party = GP; C.trade = TR;
  // ---- professions (src/sim/professions.js): gathering nodes, the gather and craft casts, trainers, recipes, consumables
  const PF = combatOn && content.professions ? createProfessions({
    state, content, emit, get: (id) => index.get(id) || null, add, remove, nextId: () => state.nextId++, spotFree, reach: INTERACT_RANGE_PX + 24,
    combat: () => C.combat, grantXp: (e, amount, reason) => C.prog.grantXp(e, amount, reason), onBag: (e) => { if (QS) QS.onBag(e); },
  }) : null;
  C.prof = PF;
  // ---- Inscriptions (src/sim/glyphs.js): socket letters into margins, a smith takes them out, glyph drops
  const GL = combatOn && content.glyphs && content.items ? createGlyphs({ state, content, emit, get: (id) => index.get(id) || null, reach: INTERACT_RANGE_PX + 24,
    recalc: (e) => { const f = e.hpMax > 0 ? e.hp / e.hpMax : 1; C.stats.recalc(e); e.hp = Math.max(1, Math.min(e.hpMax, Math.round(e.hpMax * f))); } }) : null;
  C.glyphs = GL;
  // ---- word doors (src/sim/worddoor.js): a dungeon slab the party spells open from the letters they carry
  const WD = combatOn && content.wordDoors && DG ? createWordDoors({ state, content, emit, get: (id) => index.get(id) || null, add, remove, nextId: () => state.nextId++,
    tileToSub, distPx, rng, rollGear, bagAdd, onBag: (e) => { if (QS) QS.onBag(e); } }) : null;
  C.wordDoors = WD;
  // ---- travel (big world, src/sim/travel.js): the Lantern Stone, inn homes, flight (content.travel)
  const TV = combatOn && content.travel ? createTravel(C) : null;
  const LD = combatOn && content.items ? createLegendDrops({ content, rng, state, emit }) : null;   // src/sim/legend_drops.js
  // ---- mounts (src/sim/mounts.js): the stable's goods teach a summon; riding is an aura (content.mounts)
  const MT = combatOn && content.mounts ? createMounts(C) : null;
  C.mounts = MT;
  const RM = combatOn ? createRealmMech(C) : null;   // the start realms' signatures (src/sim/realm_mech.js)
  const EM = createEmotes({ state, emit, mounted: (e) => !!(MT && MT.mountOf(e)) });   // wave 7 anim (src/sim/emotes.js)
  function questKill(mob, killer) {
    const p = index.get(mob.tagger) || (killer && killer.kind === 'player' ? killer : null);
    if (!p || p.kind !== 'player') return;
    for (const m of killShare(mob, p)) killCreditFor(mob, m);
  }
  function killCreditFor(mob, p) {
    if (QS) QS.onKill(p, mob);
    if (!content.items) return;
    const drop = rollKill({ content, rng, questNeeds: QS ? QS.needsItem : () => false }, mob, p);
    if (DG) DG.onKill(mob, p, drop);                 // a boss's named piece, set piece, rare, legendary roll; the daily chest
    if (LD) LD.onKill(mob, p, drop);                 // polish: a small legendary chance from world rares and other bosses
    if (TR) TR.onDrop(mob, drop);                   // a dungeon boss's drops bind on pickup
    if (combatOn) C.life.extraLoot(mob, p, drop);   // a rare's named item and blue piece; Night at the Stones gear
    if (PF) PF.extraLoot(mob, p, drop);             // professions: meat, world Patterns, dungeon Patterns and materials
    if (GL) GL.extraLoot(mob, p, drop);             // Inscriptions: a glyph about 1 kill in 20
    const got = [], pending = [];
    for (const it of drop.items) {
      const n = bagAdd(p, it.item, it.qty, it.inst || null, content);
      if (n) got.push({ item: it.item, qty: n, ...(it.inst ? { inst: it.inst } : {}) });
      if (n < it.qty) pending.push({ item: it.item, qty: it.qty - n, ...(it.inst ? { inst: JSON.parse(JSON.stringify(it.inst)) } : {}) });
    }
    if (drop.gold) p.gold = (p.gold || 0) + drop.gold;
    if (got.length || drop.gold || pending.length) emit({ type: 'loot', id: p.id, from: mob.id, gold: drop.gold || 0, items: got, ...(pending.length ? { pending } : {}) });
    if (pending.length) addPending(p, pending, mob.id);
    if (drop.gold) emit({ type: 'gold', id: p.id, amount: drop.gold, total: p.gold, source: 'loot' });
    if (QS && got.length) QS.onBag(p);
  }

  // ---- pending loot (PLAYTEST_BOT bug 4): what did not fit the bag waits on the player until they make room and take it
  // (command `loot_take`). Nothing is destroyed silently: past PENDING_MAX entries the oldest junk (else the oldest) goes,
  // with a `loot_lost` event the log can show.
  const PENDING_MAX = 24;
  function addPending(p, list, from) {
    p.pendingLoot = p.pendingLoot || [];
    for (const it of list) p.pendingLoot.push({ ...it, from: from ?? null, at: state.tick });
    while (p.pendingLoot.length > PENDING_MAX) {
      const junkAt = p.pendingLoot.findIndex((x) => (content.items[x.item] || {}).kind === 'junk');
      const [lost] = p.pendingLoot.splice(junkAt >= 0 ? junkAt : 0, 1);
      emit({ type: 'loot_lost', id: p.id, item: lost.item, qty: lost.qty });
    }
    emit({ type: 'loot_pending', id: p.id, items: list.map((x) => ({ item: x.item, qty: x.qty })), total: p.pendingLoot.length });
  }
  function takePending(p, cmd) {
    const list = p.pendingLoot || [];
    if (!list.length) return invFail(p, cmd, 'no_item');
    const which = cmd.index != null ? [cmd.index | 0] : list.map((_, i) => i);
    const got = [];
    for (const i of which.sort((a, b) => b - a)) {
      const x = list[i];
      if (!x) continue;
      const n = bagAdd(p, x.item, x.qty, x.inst || null, content);
      if (n) got.push({ item: x.item, qty: n });
      if (n >= x.qty) list.splice(i, 1); else x.qty -= n;
    }
    if (!got.length) return invFail(p, { ...cmd, item: list[0] && list[0].item }, 'bag_full');
    emit({ type: 'loot', id: p.id, from: null, gold: 0, items: got.reverse(), pendingLeft: list.length });
    if (QS) QS.onBag(p);
    return true;
  }

  function spawnMob(sp) {
    const t = content.mobs[sp.mob];
    if (!t) throw new Error(`spawn ${sp.mob}: no such mob template`);
    const e = baseEntity(state.nextId++, 'mob', sp.zone, sp.x, sp.y);
    const level = sp.level != null ? sp.level : Array.isArray(t.level) ? (combatOn ? rng.int(t.level[0], t.level[1]) : t.level[0]) : t.level || 1;
    let name = t.name;
    for (const [L, n] of Object.entries(t.names || {})) if (level >= +L) name = n;
    Object.assign(e, {
      name, level, faction: t.faction || 'hostile', sprite: sp.sprite || t.sprite, template: sp.mob,
      hp: t.hp, hpMax: t.hp, res: null, dir: 'left',
      spawn: { zone: sp.zone, x: e.x, y: e.y, respawn: sp.temporary ? 5 : sp.respawn ?? null, level: sp.level ?? null,
        night: !!sp.night, temporary: !!sp.temporary, group: sp.group || null, pack: sp.pack || null, patrol: sp.patrol || null },
      ai: { mode: 'idle', until: 0, dx: 0, dy: 0, leash: (sp.wander ?? t.wander ?? 3) * TILE },
    });
    if (combatOn) { e.threat = {}; e.hp = 0; C.stats.recalc(e); e.hp = e.hpMax; }
    add(e);
    if (combatOn) C.ai.applyPassives(e);
    if (state.tick > 0) emit({ type: 'spawn', id: e.id, template: e.template, zone: e.zone, kind: 'mob' });
    return e;
  }
  function spawnNpc(sp) {
    const t = content.npcs[sp.npc];
    if (!t) throw new Error(`spawn ${sp.npc}: no such npc`);
    const e = baseEntity(state.nextId++, 'npc', sp.zone, sp.x, sp.y);
    Object.assign(e, { name: t.name, level: t.level || 1, faction: 'friendly', sprite: t.sprite, template: sp.npc,
      hp: t.hp || 100, hpMax: t.hp || 100, dir: sp.dir || 'down', spawn: { zone: sp.zone, x: e.x, y: e.y } });
    return add(e);
  }

  /** Every hero carries a Lantern Stone (src/data/travel.js): one in the bags, the chest or waiting loot, else one is
   *  added (to the waiting loot when the bags are full). A brand-new hero also gets it on the last bar slot. */
  function ensureStone(e, fresh) {
    const id = content.travel.stone.item;
    if (!content.items || !content.items[id]) return;
    const has = (list) => (list || []).some((s) => s && s.item === id);
    const inChest = e.chest && Object.values(e.chest).some((v) => Array.isArray(v) ? has(v) : v && Array.isArray(v.items) && has(v.items));
    if (!has(e.bag) && !has(e.pendingLoot) && !inChest) {
      if (!bagAdd(e, id, 1, null, content)) { e.pendingLoot = e.pendingLoot || []; e.pendingLoot.push({ item: id, qty: 1, from: null, at: state.tick }); }
    }
    if (fresh && Array.isArray(e.bar) && !e.bar.includes(`item:${id}`)) {
      while (e.bar.length < 8) e.bar.push(null);
      if (e.bar[7] == null) e.bar[7] = `item:${id}`;
    }
  }

  /** hp, resource, cooldowns and lasting buffs from a save (saveFields); anything missing keeps the fresh value. */
  function restoreVitals(e, spec) {
    if (spec.hp != null && Number.isFinite(+spec.hp)) e.hp = Math.max(1, Math.min(e.hpMax, Math.round(+spec.hp)));
    if (spec.res != null && e.res) {
      const cur = typeof spec.res === 'object' ? (spec.res.kind === e.res.kind ? +spec.res.cur : NaN) : +spec.res;
      if (Number.isFinite(cur)) e.res.cur = Math.max(0, Math.min(e.res.max, cur));
    }
    if (spec.cdLeft && typeof spec.cdLeft === 'object') {
      for (const [k, v] of Object.entries(spec.cdLeft)) if (Number.isFinite(+v) && +v > 0) e.cd[k] = state.tick + Math.min(Math.round(+v), 20 * 60 * 30);
    }
    let auras = 0;
    for (const a of spec.auras || []) {
      if (!a || !a.def || !a.id || e.auras.some((x) => x.id === a.id)) continue;
      const period = a.def.period ? Math.max(1, Math.round(a.def.period * 20)) : 0;
      e.auras.push({ id: a.id, src: e.id, ab: null, stacks: a.stacks || 1, startTick: state.tick, until: a.left == null ? null : state.tick + a.left,
        nextTick: period ? state.tick + period : null, absorb: 0, data: {}, def: a.def });
      auras++;
    }
    if (auras) { const hp = e.hp; C.stats.recalc(e); e.hp = Math.min(e.hpMax, hp); }
  }

  const w = {
    get tick() { return state.tick; },
    get state() { return state; },
    get content() { return content; },
    get combatOn() { return combatOn; },
    /** Internal rule modules (tests and the balance harness only; never the renderer or HUD). */
    get internals() { return C; },

    spawnContent() {
      for (const sp of content.spawns || []) {
        const zone = content.zones[sp.zone];
        if (!zone) continue;                                   // a spawn for a zone that is not loaded
        if (!spotFree(zone, sp.x, sp.y)) throw new Error(`spawn ${sp.mob || sp.npc} at ${sp.zone} ${sp.x},${sp.y} is inside a wall`);
        if (sp.mob) spawnMob(sp); else if (sp.npc) spawnNpc(sp);
      }
      for (const sp of content.nightSpawns || []) {
        const zone = content.zones[sp.zone];
        if (!zone || !spotFree(zone, sp.x, sp.y)) continue;
        const m = spawnMob({ ...sp, night: true });
        if (!isNight(state.tick)) hideNightMob(m);
      }
      if (QS) QS.spawnObjects();
      if (ST) ST.spawnChests(add, () => state.nextId++);     // the Lantern Chests (content.lanternChests)
      if (PF) PF.spawnNodes();                              // professions: a third of each area's gathering nodes
      AP.spawnMirrors(add, () => state.nextId++);           // the free mirror (content.mirrors), last so no earlier id moves
    },
    /** Spawn one mob from a template (tests, scripted events). spec: { mob, zone, x, y (tiles), wander?, respawn? } */
    spawnMob(spec) { return spawnMob(spec).id; },

    /**
     * Add a player character. spec: { name, cls, look, zone?, x?, y? (tiles), level?, gearMode?: 'items' | 'design',
     * designGear? (gear level for design gear) }. Returns the entity id.
     */
    addPlayer(spec = {}) {
      const st = content.start;
      spec = worldSpec(spec);
      if (DG) spec = DG.loadSpec(spec);                   // saved inside a dungeon or cave: wake at its door outside
      const zid = spec.zone || st.zone;
      // a saved tile that is no longer free (the map changed under the save) starts on the nearest walkable tile
      const [px, py] = spec.x != null && spec.y != null && content.zones[zid] ? standTile(content.zones[zid], spec.x, spec.y) : [spec.x ?? st.x, spec.y ?? st.y];
      const e = baseEntity(state.nextId++, 'player', zid, px, py);
      Object.assign(e, {
        name: spec.name || 'Hero', cls: spec.cls || 'warden', look: spec.look || 0, level: 1, xp: 0,
        faction: 'player', sprite: 'hero', hp: 100, hpMax: 100, res: { kind: 'mana', cur: 100, max: 100 }, dir: 'up',
      });
      if (spec.party != null) e.party = spec.party;          // online co-op: the room's party (docs/NET.md); solo has none
      AP.restore(e, spec);                                   // wave 6: the hero's own look (spec.app, clamped); none = today's
      if (combatOn) {
        const cls = C.data.classes[e.cls];
        if (!cls) throw new Error(`addPlayer: no class ${e.cls}`);
        Object.assign(e, {
          res: null, known: cls.abilities.filter((a) => a.level <= 1).map((a) => a.id), bar: [...cls.startBar], talents: {},
          gold: spec.gold || 0, equip: { ...(cls.startGear || {}) }, bag: [], quests: {},
          gearMode: spec.gearMode || (content.items && Object.keys(content.items).length ? 'items' : 'design'),
          designGear: spec.designGear ?? null, swing: { main: 0, off: 0 }, autoOn: false, combo: null,
          inCombat: false, lastCombat: -99999, combatEnd: 0, stillSince: 0, sitting: 0, counters: {}, barOff: [],
        });
        e.hpMax = 1; e.hp = 1;
        C.stats.recalc(e);
        e.hp = e.hpMax;
        if (spec.level && spec.level > 1) C.prog.setLevel(e, spec.level);
        C.prog.bindStart(e);
        // restore a saved character (CONTRACTS 3): any of these may come from the save
        for (const k of ['xp', 'gold', 'bag', 'qbag', 'bags', 'quests', 'questsDone', 'nodesUsed', 'respecs', 'pendingLoot', 'bounties', 'dungeons']) if (spec[k] != null) e[k] = JSON.parse(JSON.stringify(spec[k]));
        migrateQuestItems(e, content);
        ensureUids(e);
        if (spec.equip) e.equip = JSON.parse(JSON.stringify(spec.equip));
        if (spec.talents) e.talents = { ...spec.talents };
        if (spec.known) for (const kid of spec.known) if (C.data.abilities[kid] && !e.known.includes(kid)) e.known.push(kid);
        if (spec.bar) C.prog.restoreBar(e, spec.bar);   // a save carries 8 slots, empty ones null; `item:<id>` slots keep their place
        if (spec.lantern && content.zones[spec.lantern.zone]) e.lantern = { ...spec.lantern };
        C.b2.attach(e, spec);                      // Builds 2: the build from the save (save v2), or a new one
        C.prog.restoreBarOff(e, spec.barOff);      // skills the player took off the bar stay off (save v2 barOff)
        C.prog.fillBar(e);                         // 8 slots: a known skill left off a 6-slot bar takes a free slot
        C.stats.recalc(e);
        e.hp = e.hpMax;
        if (e.res && e.res.kind === 'mana') e.res.cur = e.res.max;
        restoreVitals(e, spec);
        C.life.restore(e, spec);                   // the rest XP bank (save `rest`, missing = 0) plus the time away
        if (ST) ST.restore(e, spec);               // the hero's chest tab and glyph pouch (missing = empty)
        if (PF) PF.restore(e, spec);               // professions: skills, recipes, a flask (save `prof`, missing = none)
        if (TV) { TV.restore(e, spec); if (spec.lanternStone) ensureStone(e, !!spec.newHero); }   // home, flight points; the Lantern Stone (main.js asks)
        if (MT) MT.restore(e, spec);               // mounts owned (save `mounts`, missing = none; the summons are in `known` too)
      }
      add(e);
      emit({ type: 'join', id: e.id, name: e.name });
      if (QS && combatOn) QS.ensureEscorts(e);            // an escort in the save restarts fresh (PLAYTEST_BOT bug 1)
      return e.id;
    },

    /** The travel module (src/sim/travel.js) for tests and drivers; null without content.travel. */
    get travel() { return TV; },
    /**
     * The sim-owned fields of a character save (CONTRACTS 2.4). main.js merges them into its save and passes the whole
     * save back to addPlayer. hp and resource are kept (quit and return is no free heal); cooldowns as ticks LEFT (a new
     * world runs its own clock); lasting self buffs (no end, or a minute or more left); the quest bag and pending loot;
     * `escorts` lists the escort quests in progress (on restore they restart fresh, the npc back at the start).
     */
    saveFields(id) {
      const e = index.get(id);
      if (!e || e.kind !== 'player') return null;
      const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
      const out = { qbag: clone(e.qbag || []), pendingLoot: clone(e.pendingLoot || []), ...(e.bounties ? { bounties: clone(e.bounties) } : {}),
        ...(e.dungeons ? { dungeons: clone(e.dungeons) } : {}) };     // dungeons: the daily first clears and the legendary bad-luck count
      if (e.app) out.app = { ...e.app };          // wave 6: the hero's own look (missing = today's look)
      if (!combatOn) return out;
      out.hp = e.dead ? e.hpMax : e.hp;
      out.res = e.res ? { kind: e.res.kind, cur: Math.round(e.res.cur * 100) / 100 } : null;
      out.cdLeft = {};
      for (const [k, v] of Object.entries(e.cd || {})) if (v > state.tick) out.cdLeft[k] = v - state.tick;
      out.auras = e.auras.filter((a) => a.src === e.id && a.def && a.def.kind !== 'debuff' && (a.until == null || a.until - state.tick >= 1200)
        && !(a.def.flags || []).includes('stealth'))
        .map((a) => ({ id: a.id, left: a.until == null ? null : a.until - state.tick, stacks: a.stacks || 1, def: clone(a.def) }));
      out.escorts = Object.entries(e.quests || {}).filter(([, q]) => q.escort != null).map(([k]) => k);
      out.build = C.b2.saveOf(e);                // Builds 2 (save v2: state.build)
      if (e.chest) out.chest = clone(e.chest);   // the hero's Lantern Chest tab (the Shared tab is NOT here: w.shared())
      if (e.gbag && e.gbag.length) out.gbag = clone(e.gbag);   // the glyph pouch
      if (WD) WD.saveLent(e, out);               // word doors: a glyph lent to a door is saved as in the pouch
      if (e.barOff && e.barOff.length) out.barOff = [...e.barOff];   // skills taken off the bar (bar_set null on a skill)
      const rest = C.life.saveOf(e); if (rest) out.rest = rest;      // rest XP banked (missing = none)
      const prof = PF && PF.saveOf(e); if (prof) out.prof = prof;     // professions (missing = none)
      if (TV) Object.assign(out, TV.saveOf(e));                       // travel: home (inn id), flights (known points); missing = none
      if (MT) Object.assign(out, MT.saveOf(e));                       // mounts: owned kinds, the last one ridden; missing = none
      return out;
    },
    get(id) { return index.get(id) || null; },
    /** The Shared chest tab (every hero on this device): a plain copy for main.js to save under its own key. */
    shared() { return ST ? ST.shared() : null; },
    /** Load the Shared tab (main.js, from lexicon_realms.shared; another browser tab's write). Malformed parts drop. */
    setShared(obj) { if (ST) ST.setShared(obj); },
    /** Remove a player (log-out). Mobs forget them; their placed objects and escorts go. */
    removePlayer(id) {
      const e = index.get(id);
      if (!e || e.kind !== 'player') return false;
      for (const m of [...state.ents]) {
        if (m.kind === 'mob' && m.threat) delete m.threat[id];
        if (m.target === id) m.target = null;
        if (m.kind === 'object' && m.owner === id) remove(m);
        if (m.escort && m.escort.owner === id) remove(m);
      }
      if (TR) TR.onLeave(id);
      if (GP) GP.onLeave(id);
      remove(e);
      emit({ type: 'leave', id, name: e.name });
      return true;
    },
    /**
     * Put a player in a party (online co-op, docs/NET.md), or out of one (party null). A system action like addPlayer:
     * log it as { tick, sys: 'party', id, party }. Party members share kills (killShare). Returns false for a non-player.
     */
    setParty(id, party) {
      const e = index.get(id);
      if (!e || e.kind !== 'player') return false;
      if (party == null) delete e.party; else e.party = party;
      return true;
    },
    /** The quest module (CONTRACTS 7.7 queries: tracker, marker, status). */
    get quests() { return QS; },
    enqueue(id, cmd) { queue.push({ id, cmd }); },

    /** Grant XP from outside the combat rules (CONTRACTS 8 `xp`). The quest agent calls this on a turn-in. */
    grantXp(id, amount, reason = 'quest', extra = {}) {
      const e = typeof id === 'object' ? id : index.get(id);
      if (!combatOn || !e) return 0;
      const before = events.length;
      const n = C.prog.grantXp(e, amount, reason, extra);
      return n + 0 * before;
    },
    /** Set a player's level at once (tests, the balance harness, a debug console). */
    setLevel(id, L) { const e = index.get(id); if (combatOn && e) C.prog.setLevel(e, L); },
    /** Make a player know every ability up to their level (tests and the harness; real play trains at a trainer). */
    learnAll(id) {
      const e = index.get(id);
      if (!combatOn || !e) return;
      for (const a of C.data.classes[e.cls].abilities) if (a.level <= e.level) C.prog.learn(e, a.id);
    },
    /** Set talents directly (tests and the harness). */
    setTalents(id, talents) { const e = index.get(id); if (combatOn && e) { e.talents = { ...talents }; C.stats.recalc(e); e.hp = Math.min(e.hp, e.hpMax); } },

    step() {
      events = [];
      state.tick++;
      // 1) commands, in enqueue order
      const batch = queue.splice(0, queue.length);
      for (const { id, cmd } of batch) applyCommand(id, cmd);
      // 2) entities, in id order
      for (const e of [...state.ents]) {
        if (e.kind === 'object') continue;
        if (!index.has(e.id)) continue;
        if (e.emote) EM.tickPlayer(e);              // wave 7 anim: an emote ends on a move, combat, death or its time
        if (e.dead) {
          if (combatOn && e.kind === 'mob') {
            if (e.spawn.temporary) { if (e.respawnAt != null && state.tick >= e.respawnAt) { remove(e); emit({ type: 'despawn', id: e.id, template: e.template, zone: e.zone, kind: 'mob' }); } continue; }
            if (e.spawn.night && !isNight(state.tick)) continue;
            C.prog.tickDeadMob(e);
            if (!e.dead) C.ai.applyPassives(e);
          }
          if (combatOn && e.kind === 'player') C.prog.tickPlayer(e);
          continue;
        }
        if (e.kind === 'mob') { if (combatOn) C.ai.think(e); else mobThink(e, state.tick, rng, zoneOf(e)); }
        if (combatOn && e.kind === 'mob' && e.spawn.night && !isNight(state.tick) && e.ai.mode !== 'combat' && (state.tick + e.id) % 20 === 0) { hideNightMob(e); continue; }
        if (e.kind === 'player' || e.kind === 'mob') {
          const z0 = e.zone;
          if (TV && e.kind === 'player' && TV.flying(e)) TV.tickPlayer(e);    // on a kite: the route moves the hero, not the keys
          else moveEntity(e);
          if (QS && e.kind === 'player' && (e.moving || e.zone !== z0)) QS.onMove(e);
        }
        if (combatOn && (e.kind === 'player' || e.kind === 'mob')) C.combat.tickUnit(e);
        if (combatOn && e.kind === 'player') C.prog.tickPlayer(e);
        if (TV && e.kind === 'player' && !TV.flying(e)) TV.tickPlayer(e);  // the Lantern Stone's cast
        if (MT && e.kind === 'player') MT.tickPlayer(e);                 // mounts: off at a door, on a flight, a cast, sitting
        if (e.target != null) dropBadTarget(e);
      }
      // 3) world: projectiles, traps and zones, combat state
      if (combatOn) C.combat.tickWorld();
      if (QS) QS.tick();
      if (WD) WD.tick();                         // word doors: a new copy gets its slab, letters and coffer
      if (DG) DG.tick();                         // copies nobody has been inside for 30 minutes reset
      if (GP) GP.tick();                         // group play: foe scaling, rez casts, death waits, ready checks
      if (TR) TR.tick();                         // trades end when the two walk apart
      if (combatOn) C.life.tick(events);
      if (combatOn) C.realms2.tick();           // the sandstorm, the lantern watch, the fog banks
      if (PF) PF.tick();                         // professions: node respawns, the gather and craft casts
      if (RM) RM.tick();                         // wave 3: Emberpeak's lava and Gate waves, Valewyn's tide
      // 4) systems (quests): read this tick's events, may call grantXp / emit
      for (const s of systems) if (s && s.tick) s.tick(w, events);
      state.rng = rng.state;
      return events;
    },
    /** Emit an event from a system (quests) into this tick's list. */
    emit(ev) { emit(ev); },

    snapshot() {
      const snap = {
        v: STATE_VERSION, tick: state.tick, dayTime: dayFraction(state.tick), night: isNight(state.tick),
        entities: state.ents.map((e) => publicEntity(e)),
      };
      // dungeons and caves: the copies heroes stand in (kind, name, levels: the loading card and the banner)
      if (DG) {
        snap.places = {};
        for (const e of state.ents) if (e.kind === 'player' && !snap.places[e.zone]) { const inf = DG.info(e.zone); if (inf) snap.places[e.zone] = inf; }
      }
      if (combatOn) {
        snap.projectiles = (state.proj || []).map((p) => ({ id: p.id, src: p.src, dst: p.dst, ability: p.ability, zone: p.zone, x: p.x / SUB, y: p.y / SUB }));
        snap.hud = {};
        for (const e of state.ents) if (e.kind === 'player') {
          const h = C.hud.build(e);
          const zz = content.zones[e.zone] || {};
          h.zone = (DG && DG.info(e.zone)) || { id: e.zone, base: e.zone, kind: zz.kind || 'field', name: zz.name || '', levels: zz.levels ? [...zz.levels] : null };
          h.rest = C.life.hudOf(e);
          if (GP) { const gr = GP.hudOf(e), tr = TR ? TR.hudOf(e, C.hud.itemView) : null; if (gr || tr) h.group = { ...(gr || {}), trade: tr }; }
          if (PF) h.prof = PF.hudOf(e);            // professions: skills, recipes, the gather / craft bar
          if (QS) {
            h.quests = QS.tracker(e);
            h.npcMarkers = {};
            for (const n of state.ents) if (n.kind === 'npc' && n.zone === e.zone && !n.escort) { const mk = QS.marker(e, n.template); if (mk) h.npcMarkers[n.id] = mk; }
          }
          snap.hud[e.id] = h;
        }
      }
      return snap;
    },
    serialize() { state.rng = rng.state; return JSON.stringify(state); },
    /** The bounty boards' day (BUILDS_2 5.6): the client passes its local calendar day; boards repost when it changes. */
    setDay(day) { state.day = day | 0; },
    get day() { return state.day | 0; },
    hash() { state.rng = rng.state; return hashString(JSON.stringify(state)); },
    /** Commands waiting for the next step (read only; tests and the net layer). */
    pending() { return queue.map((q) => ({ id: q.id, cmd: { ...q.cmd } })); },
  };

  // ---------------------------------------------------------------- commands
  function reject(id, cmd, reason) { emit({ type: 'cmd_reject', id, cmd: cmd && cmd.t, reason }); }

  // quest_accept / quest_turnin need the quest's npc within reach in the same zone (PLAYTEST_BOT bug 5): `npc` names the
  // entity (the dialog's), else any npc of the right template in reach counts. A little slack over INTERACT_RANGE_PX, so
  // a dialog opened at the edge of reach still works after a half step.
  const QUEST_REACH_PX = INTERACT_RANGE_PX + 24;
  function questNpcOk(e, cmd, role) {
    const q = (content.quests || {})[cmd.quest];
    if (!q || !q[role]) return true;                      // the quest module rejects unknown quests itself
    const ok = (n) => !!n && n.kind === 'npc' && !n.escort && n.template === q[role] && n.zone === e.zone && distPx(e, n) <= QUEST_REACH_PX;
    if (cmd.npc != null ? ok(index.get(cmd.npc)) : state.ents.some(ok)) return true;
    emit({ type: 'cmd_reject', id: e.id, cmd: cmd.t, reason: 'range', quest: cmd.quest });
    return false;
  }

  function applyCommand(id, cmd) {
    const e = index.get(id);
    if (!e || e.kind !== 'player') return reject(id, cmd, 'no_actor');
    if (!cmd || typeof cmd.t !== 'string') return reject(id, cmd, 'bad_command');
    if (GP && GP.handles(cmd.t)) { GP.command(e, cmd); return; }      // group play (src/sim/party.js): some work while dead
    if (EM.handles(cmd.t) && !e.dead && !(TV && TV.flying(e))) { EM.command(e, cmd); return; }   // wave 7 anim: jump and emotes
    if (TR && TR.handles(cmd.t)) { TR.command(e, cmd); return; }
    if (WD && WD.handles(cmd.t)) { if (!e.dead) WD.command(e, cmd); return; }   // word doors: set or take a letter
    if (e.dead && cmd.t !== 'target') return reject(id, cmd, 'dead');
    // on a Lantern Kite the hero cannot act (src/sim/travel.js); held keys are ignored quietly
    if (TV && TV.flying(e)) { if (cmd.t !== 'move' && cmd.t !== 'stop') reject(id, cmd, 'flying'); return; }
    switch (cmd.t) {
      case 'move': e.mx = clampUnit(cmd.dx | 0); e.my = clampUnit(cmd.dy | 0); if (e.mx || e.my) e.sitting = 0; return;
      case 'stop': e.mx = 0; e.my = 0; return;
      case 'target': {
        if (cmd.id == null) { if (e.target != null) { e.target = null; e.autoOn = false; emit({ type: 'target', src: id, id: null }); } return; }
        const t = index.get(cmd.id);
        // one world: every foe shares the zone, so "too far to keep" (dropBadTarget) is the reject that "another zone" was
        if (!t || t.zone !== e.zone || t.id === e.id || distPx(e, t) > TARGET_RANGE_PX) return reject(id, cmd, 'bad_target');
        if (e.target !== t.id) { if (e.combo && e.combo.target !== t.id) e.combo = null; }
        e.target = t.id;
        if (combatOn && !C.combat.isHostile(e, t)) e.autoOn = false;
        emit({ type: 'target', src: id, id: t.id });
        return;
      }
      case 'cast': {
        if (combatOn) {
          // a bar slot holding an item (`item:<id>`) uses one from the bags (the same rules as use_item)
          const be = cmd.slot != null && !cmd.ability && Array.isArray(e.bar) ? e.bar[(cmd.slot | 0) - 1] : null;
          if (C.prog.isItemEntry(be)) { useItem(e, { t: 'use_item', item: C.prog.itemOfEntry(be) }); return; }
          C.combat.cast(e, cmd); return;
        }
        // STUB (no combat content): validates the GCD and the target, emits cast_start then cast_stop.
        const ability = cmd.ability || (cmd.slot != null ? `slot${cmd.slot | 0}` : null);
        if (!ability) return reject(id, cmd, 'no_ability');
        if (state.tick < e.gcdUntil) { emit({ type: 'cast_fail', src: id, ability, reason: 'gcd' }); return; }
        const tid = cmd.target ?? e.target;
        e.gcdUntil = state.tick + GCD_TICKS;
        emit({ type: 'cast_start', src: id, ability, target: tid ?? null, castTicks: 0 });
        emit({ type: 'cast_stop', src: id, ability, target: tid ?? null, reason: 'stub' });
        return;
      }
      case 'cancel': if (combatOn) C.combat.cancelCast(e, 'cancel'); return;
      case 'cancel_aura': {
        if (!combatOn) return;
        const a = e.auras.find((x) => x.id === cmd.aura && x.def.kind !== 'debuff');
        if (a) C.combat.removeAura(e, a, 'cancel'); else reject(id, cmd, 'no_aura');
        return;
      }
      case 'attack': {
        if (!combatOn) return;
        if (cmd.stop) { e.autoOn = false; return; }
        const t = index.get(cmd.id ?? e.target);
        if (!t || t.zone !== e.zone || !C.combat.isHostile(e, t) || t.dead || distPx(e, t) > TARGET_RANGE_PX) return reject(id, cmd, 'bad_target');
        if (e.target !== t.id) { if (e.combo && e.combo.target !== t.id) e.combo = null; e.target = t.id; emit({ type: 'target', src: id, id: t.id }); }
        C.combat.breakStealth(e, 'attack');
        C.combat.startAuto(e, t);
        return;
      }
      case 'sit': {
        if (!combatOn) return;
        if (e.inCombat) return reject(id, cmd, 'combat');
        e.mx = 0; e.my = 0; e.sitting = state.tick;
        emit({ type: 'sit', id: e.id });
        return;
      }
      case 'train': if (combatOn) C.prog.train(e, cmd); return;
      case 'quest_accept': if (QS && questNpcOk(e, cmd, 'giver')) QS.accept(e, cmd.quest); return;
      case 'quest_turnin': if (QS && questNpcOk(e, cmd, 'turnIn')) QS.turnIn(e, cmd.quest, cmd.choice | 0); return;
      case 'loot_take': if (combatOn) takePending(e, cmd); return;
      case 'quest_abandon': if (QS) QS.abandon(e, cmd.quest); return;
      case 'equip': if (combatOn) equipItem(e, cmd); return;
      case 'unequip': if (combatOn) unequipItem(e, cmd); return;
      case 'use_item': if (combatOn) useItem(e, cmd); return;
      case 'bar_set': if (combatOn) C.prog.barSet(e, cmd); return;
      case 'buy': if (combatOn) vendorBuy(e, cmd); return;
      case 'sell': if (combatOn) vendorSell(e, cmd); return;
      case 'buyback': if (combatOn) vendorBuyback(e, cmd); return;
      case 'learn_talent': if (combatOn) C.prog.learnTalent(e, cmd); return;
      case 'unlearn_talent': if (combatOn) C.prog.unlearnTalent(e, cmd); return;
      case 'respec': if (combatOn) C.prog.respec(e, cmd); return;
      // Builds 2 (src/sim/builds2.js); each refuses with b2_fail reason 'off' while the flag is off
      case 'b2_learn': if (combatOn) C.b2.learn(e, cmd); return;
      case 'b2_undo': if (combatOn) C.b2.undo(e); return;
      case 'b2_respec': if (combatOn) C.b2.respec(e, cmd); return;
      case 'b2_pick': if (combatOn) C.b2.pick(e, cmd); return;
      case 'b2_leaning': if (combatOn) C.b2.setLeaning(e, cmd); return;
      case 'b2_auto': if (combatOn) C.b2.setAuto(e, cmd); return;
      case 'b2_suggest': if (combatOn) C.b2.spendSuggested(e); return;
      case 'chest_store': case 'chest_take': case 'chest_move': case 'chest_row': case 'chest_sort': if (ST) ST.command(e, cmd); return;
      case 'glyph_socket': case 'glyph_remove': if (GL) GL.command(e, cmd); return;
      case 'prof_train': case 'prof_recipe': case 'prof_unlearn': case 'prof_craft': case 'prof_cancel': case 'prof_fish': if (PF) PF.command(e, cmd); return;
      case 'set_home': case 'fly': case 'ride': if (TV) TV.command(e, cmd); return;     // travel: an innkeeper's home, a flight master's route
      case 'mount': if (MT) MT.command(e, cmd); return;                  // mounts: Z / the horseshoe (summon, or get off)
      case 'set_app': AP.set(e, cmd); return;                           // wave 6: a new look, at the mirror the hero opened
      case 'interact': {
        const t = index.get(cmd.id);
        if (!t || t.zone !== e.zone) return reject(id, cmd, 'bad_target');
        if (WD && t.kind === 'object' && (t.wdoor || t.wstone || (t.dchest && t.dchest.kind === 'word'))) {   // word doors
          if (distPx(e, t) > INTERACT_RANGE_PX + 24) { emit({ type: 'interact_fail', src: id, id: t.id, reason: 'range' }); return; }
          if (t.dchest) WD.openChest(e, t); else WD.interact(e, t);
          return;
        }
        if (t.kind === 'object' && t.node) {
          if (distPx(e, t) > INTERACT_RANGE_PX) { emit({ type: 'interact_fail', src: id, id: t.id, reason: 'range' }); return; }
          if (t.dchest) { if (DG) DG.openChest(e, t); return; }      // a dungeon or cave chest (src/sim/dungeons.js)
          if (t.node.gather) { if (PF) PF.gather(e, t); return; }    // a gathering node (src/sim/professions.js)
          if (QS) QS.interact(e, t);
          return;
        }
        if (t.kind === 'object' && t.chest) { if (ST) ST.open(e, t); return; }
        if (t.kind === 'object' && t.mirror) { AP.open(e, t); return; }       // the free mirror (src/sim/appearance.js)
        if (t.kind === 'mob' && t.dead && PF) {         // Skinning a dead beast (src/sim/professions.js)
          if (distPx(e, t) > INTERACT_RANGE_PX) { emit({ type: 'interact_fail', src: id, id: t.id, reason: 'range' }); return; }
          PF.skin(e, t); return;
        }
        if (t.kind !== 'npc') return reject(id, cmd, 'not_interactable');
        if (distPx(e, t) > INTERACT_RANGE_PX) { emit({ type: 'interact_fail', src: id, id: t.id, reason: 'range' }); return; }
        t.dir = facingToward(t, e);
        const ev = { type: 'interact', src: id, id: t.id, npc: t.template };
        if (combatOn) {
          const cls = C.prog.trainerCls(t);
          if (cls) ev.trainer = cls === e.cls
            ? { cls, offer: C.prog.trainerOffer(e), respecCost: C.prog.respecCost(e) }
            : { cls, offer: [] };
          const vdef = vendorDef(t);
          if (vdef && content.items) ev.vendor = { npc: t.template, items: vdef.items.map((_, i) => stockView(e, vdef, i)).filter(Boolean) };
        }
        if (TV) TV.onInteract(e, t, ev);           // an innkeeper (ev.inn), a flight master (ev.flight; talking unlocks the point)
        emit(ev);
        if (QS && !t.escort) QS.interact(e, t);
        return;
      }
      default: return reject(id, cmd, 'unknown_command');
    }
  }

  // ---------------------------------------------------------------- night spawns
  function hideNightMob(m) {
    m.dead = true; m.hp = m.hpMax; m.threat = {}; m.respawnAt = state.tick; m.nightHidden = true;
    if (m.ai) { m.ai.mode = 'dead'; m.ai.vx = 0; m.ai.vy = 0; }
    emit({ type: 'despawn', id: m.id, template: m.template, zone: m.zone, kind: 'mob', reason: 'day' });
  }

  // ---------------------------------------------------------------- items (CONTRACTS 7.4)
  const ARMOR_CAN = { plate: ['plate', 'mail', 'leather', 'cloth'], mail: ['mail', 'leather', 'cloth'], leather: ['leather', 'cloth'], cloth: ['cloth'] };
  // A bag command names its slot by `uid` (exact), or by index + `item` (that item must still be there), or by `item`
  // alone (the first such slot). An index with neither item nor uid is refused: the list may have shifted (bug 16).
  function bagIndex(e, cmd) {
    if (cmd.uid != null) { const k = bagFindUid(e, cmd.uid | 0); return k >= 0 && (!cmd.item || e.bag[k].item === cmd.item) ? k : -1; }
    const bi = cmd.bag != null ? cmd.bag : cmd.bagSlot;           // the HUD sends bagSlot
    if (bi != null) {
      if (!cmd.item) return -1;
      const k = bi | 0;
      return k >= 0 && k < (e.bag || []).length && e.bag[k].item === cmd.item ? k : -1;
    }
    return (e.bag || []).findIndex((s) => s.item === cmd.item);
  }
  function invFail(e, cmd, reason) { emit({ type: 'inventory_fail', id: e.id, cmd: cmd.t, item: cmd.item || null, reason }); return false; }
  // ---------------------------------------------------------------- vendors (CONTRACTS 2.2 buy / sell / buyback)
  // Prices (PROGRESSION 4.8, 6.2): a vendor sells consumables and bags at `price`, gear at 4 x value; it buys at value.
  // Quest items have no value and cannot be sold. The last 6 things sold can be bought back for what they paid.
  const BUYBACK_MAX = 6, MAX_BAGS = 4;
  function vendorDef(npc) { const t = npc && npc.kind === 'npc' ? (content.npcs || {})[npc.template] : null; return t && t.vendor && t.vendor.items && t.vendor.items.length ? t.vendor : null; }
  function stockEntry(vdef, i) {
    const s = vdef.items[i | 0];
    const def = s && content.items[s.item];
    if (!def) return null;
    return def.kind === 'weapon' || def.kind === 'armor' ? { item: s.item, inst: { ilvl: s.ilvl || def.level || 1, rarity: 'common', affixes: [] } } : { item: s.item };
  }
  function priceOf(e, entry) {
    const def = content.items[entry.item];
    if (def.price != null) return def.price;
    const it = resolveItem(content, entry, e.cls);
    return 4 * Math.max(1, (it && it.value) || def.value || 1);
  }
  function stockView(e, vdef, i) {
    const entry = stockEntry(vdef, i);
    if (!entry) return null;
    const it = resolveItem(content, entry, e.cls);
    return { index: i, item: entry.item, inst: entry.inst || null, name: it.name, icon: it.icon, rarity: it.rarity, kind: it.kind, slot: it.slot || null,
      reqLevel: (MT && MT.isMountItem(entry.item) ? content.items[entry.item].reqLevel : it.reqLevel) || 1, price: priceOf(e, entry), stack: it.stack || 1 };   // a mount: its own level
  }
  function sellValue(e, slot) {
    const def = content.items[slot.item];
    if (!def || def.kind === 'quest') return 0;
    if (def.kind === 'weapon' || def.kind === 'armor') { const it = resolveItem(content, slot, e.cls); return Math.max(0, (it && it.value) || 0); }
    return Math.max(0, def.value || 0);
  }
  function atVendor(e, cmd) {
    const n = cmd.npc != null ? index.get(cmd.npc) : null;
    if (!n || !vendorDef(n)) return null;
    if (n.zone !== e.zone || distPx(e, n) > INTERACT_RANGE_PX) return null;
    return n;
  }
  /** How many of `item` (stack size `stack`, instanced or not) fit in the bag right now. */
  function roomFor(e, item, inst) {
    const def = content.items[item];
    const stack = inst ? 1 : (def && def.stack) || 1;
    let n = bagFree(e, content) * stack;
    if (!inst) for (const s of e.bag || []) if (s.item === item && !s.inst) n += Math.max(0, stack - s.qty);
    return n;
  }
  function vendorBuy(e, cmd) {
    const n = atVendor(e, cmd);
    if (!n) return invFail(e, cmd, 'range');
    const vdef = vendorDef(n);
    const entry = stockEntry(vdef, cmd.index != null ? cmd.index : vdef.items.findIndex((s) => s.item === cmd.item));
    if (!entry) return invFail(e, cmd, 'no_item');
    if (MT && MT.isMountItem(entry.item)) {          // a mount: buying it teaches the summon (no bag item, src/sim/mounts.js)
      if ((e.gold || 0) < priceOf(e, entry)) return invFail(e, { ...cmd, item: entry.item }, 'gold');
      const why = MT.buy(e, content.items[entry.item]);
      if (why) return invFail(e, { ...cmd, item: entry.item }, why);
      e.gold -= priceOf(e, entry);
      emit({ type: 'inventory', id: e.id, kind: 'buy', item: entry.item, qty: 1, cost: priceOf(e, entry), npc: n.template });
      emit({ type: 'gold', id: e.id, amount: -priceOf(e, entry), total: e.gold, source: 'buy' });
      return true;
    }
    const qty = entry.inst ? 1 : Math.max(1, Math.min(20, cmd.qty | 0 || 1));
    const cost = priceOf(e, entry) * qty;
    if ((e.gold || 0) < cost) return invFail(e, { ...cmd, item: entry.item }, 'gold');
    if (roomFor(e, entry.item, entry.inst) < qty) return invFail(e, { ...cmd, item: entry.item }, 'bag_full');
    bagAdd(e, entry.item, qty, entry.inst || null, content);
    e.gold -= cost;
    emit({ type: 'inventory', id: e.id, kind: 'buy', item: entry.item, qty, cost, npc: n.template });
    emit({ type: 'gold', id: e.id, amount: -cost, total: e.gold, source: 'buy' });
    if (QS) QS.onBag(e);
    return true;
  }
  function vendorSell(e, cmd) {
    const n = atVendor(e, cmd);
    if (!n) return invFail(e, cmd, 'range');
    const i = bagIndex(e, cmd);
    if (i < 0) return invFail(e, cmd, 'no_item');
    const slot = e.bag[i];
    const each = sellValue(e, slot);
    if (each <= 0) return invFail(e, { ...cmd, item: slot.item }, 'no_value');
    const qty = Math.max(1, Math.min(slot.qty, cmd.qty | 0 || slot.qty));
    const got = each * qty;
    if (qty >= slot.qty) e.bag.splice(i, 1); else slot.qty -= qty;
    e.gold = (e.gold || 0) + got;
    e.buyback = [...(e.buyback || []), { item: slot.item, qty, ...(slot.inst ? { inst: JSON.parse(JSON.stringify(slot.inst)) } : {}), price: got }].slice(-BUYBACK_MAX);
    emit({ type: 'inventory', id: e.id, kind: 'sell', item: slot.item, qty, gold: got, npc: n.template });
    emit({ type: 'gold', id: e.id, amount: got, total: e.gold, source: 'sell' });
    if (QS) QS.onBag(e);
    return true;
  }
  function vendorBuyback(e, cmd) {
    const n = atVendor(e, cmd);
    if (!n) return invFail(e, cmd, 'range');
    const list = e.buyback || [];
    const k = cmd.index | 0;
    const b = list[k];
    if (!b) return invFail(e, cmd, 'no_item');
    if ((e.gold || 0) < b.price) return invFail(e, { ...cmd, item: b.item }, 'gold');
    if (roomFor(e, b.item, b.inst) < b.qty) return invFail(e, { ...cmd, item: b.item }, 'bag_full');
    bagAdd(e, b.item, b.qty, b.inst || null, content);
    e.gold -= b.price;
    list.splice(k, 1);
    emit({ type: 'inventory', id: e.id, kind: 'buyback', item: b.item, qty: b.qty, cost: b.price, npc: n.template });
    emit({ type: 'gold', id: e.id, amount: -b.price, total: e.gold, source: 'buyback' });
    if (QS) QS.onBag(e);
    return true;
  }

  function equipItem(e, cmd) {
    const i = bagIndex(e, cmd);
    if (i < 0) return invFail(e, cmd, 'no_item');
    const entry = e.bag[i];
    const bdef = content.items[entry.item];
    if (bdef && bdef.kind === 'bag') {
      // a bag item goes onto the belt: more slots (CONTRACTS 7.4 player.bags), at most 4 bags worn
      e.bags = e.bags || ['starter_satchel'];
      if (e.bags.length >= MAX_BAGS) return invFail(e, cmd, 'bags_full');
      e.bag.splice(i, 1);
      e.bags.push(entry.item);
      emit({ type: 'inventory', id: e.id, kind: 'equip', slot: 'bag', item: entry.item });
      return true;
    }
    const it = resolveItem(content, entry, e.cls);
    if (!it || !it.slot || (it.kind !== 'weapon' && it.kind !== 'armor')) return invFail(e, cmd, 'not_equippable');
    if (it.classes && !it.classes.includes(e.cls)) return invFail(e, cmd, 'class');
    if ((it.reqLevel || 1) > e.level) return invFail(e, cmd, 'level');
    const cls = C.data.classes[e.cls];
    const cg = (content.classGear || {})[e.cls];
    const weapons = (cg && cg.weapons) || cls.weapons;
    if (it.kind === 'weapon' && !weapons.includes(it.weaponType)) return invFail(e, cmd, 'weapon');
    if (it.kind === 'armor' && it.armorType && !(ARMOR_CAN[cls.armor] || []).includes(it.armorType)) return invFail(e, cmd, 'armor');
    if (e.inCombat && it.kind === 'armor') return invFail(e, cmd, 'combat');
    let slot = it.slot === 'two' ? 'main' : it.slot;
    // a weapon that may go in either hand (weaponTypes[t].offOk, the Inkblade's daggers) for a class that fights with two:
    // `slot: 'main' | 'off'` picks the hand; without it the item replaces the weaker hand (main on a tie). PLAYTEST_BOT bug 6.
    const wt = it.kind === 'weapon' ? (content.weaponTypes || {})[it.weaponType] : null;
    const twoHands = !!(cls.auto && cls.auto.offHand);
    if (wt && wt.offOk && twoHands) {
      if (cmd.slot === 'main' || cmd.slot === 'off') slot = cmd.slot;
      else {
        const lvl = (s) => { const v = e.equip[s]; const r = v && resolveItem(content, typeof v === 'string' ? { item: v } : v, e.cls); return r ? r.level : -1; };
        slot = lvl('off') < lvl('main') ? 'off' : 'main';
      }
    } else if (cmd.slot != null && cmd.slot !== slot && cmd.slot !== it.slot) return invFail(e, cmd, 'slot');
    // a two-hand weapon over a main hand and an off hand frees one bag slot and needs two: with a full bag bagAdd dropped
    // the second piece and it was lost (fix20, 2026-11-23). Refuse first, before anything comes off.
    {
      const offs = [slot];
      if (it.slot === 'two') offs.push('off');
      if (slot === 'off') { const mainIt = e.equip.main && resolveItem(content, e.equip.main, e.cls); if (mainIt && mainIt.slot === 'two') offs.push('main'); }
      const n = offs.filter((s) => e.equip[s]).length;
      if (n > 1 && bagFree(e, content) + 1 < n) return invFail(e, cmd, 'bag_full');
    }
    const out = [];
    const take = (s) => { if (e.equip[s]) { out.push(e.equip[s]); delete e.equip[s]; } };
    take(slot);
    if (it.slot === 'two') take('off');
    if (slot === 'off') { const mainIt = e.equip.main && resolveItem(content, e.equip.main, e.cls); if (mainIt && mainIt.slot === 'two') take('main'); }
    e.bag.splice(i, 1);
    if (TR) TR.onEquip(entry);                     // bind on equip: worn once, it is Soulbound
    e.equip[slot] = entry.inst ? { item: entry.item, inst: entry.inst } : entry.item;
    for (const o of out) { const oe = typeof o === 'string' ? { item: o } : o; bagAdd(e, oe.item, 1, oe.inst || null, content); }
    C.stats.recalc(e);
    emit({ type: 'inventory', id: e.id, kind: 'equip', slot, item: entry.item });
    if (QS) QS.onBag(e);
    return true;
  }
  function unequipItem(e, cmd) {
    const slot = cmd.slot;
    const cur = slot && e.equip[slot];
    if (!cur) return invFail(e, cmd, 'empty');
    if (bagFree(e, content) < 1) return invFail(e, cmd, 'bag_full');
    const ce = typeof cur === 'string' ? { item: cur } : cur;
    delete e.equip[slot];
    bagAdd(e, ce.item, 1, ce.inst || null, content);
    C.stats.recalc(e);
    emit({ type: 'inventory', id: e.id, kind: 'unequip', slot, item: ce.item });
    return true;
  }
  function useItem(e, cmd) {
    const i = bagIndex(e, cmd);
    if (i < 0) return invFail(e, cmd, 'no_item');
    const def = (content.items || {})[e.bag[i].item];
    const u = def && def.use;
    if (!u) return invFail(e, cmd, 'not_usable');
    if ((def.reqLevel || 1) > e.level) return invFail(e, cmd, 'level');
    const key = `item:${u.group || def.id}`;
    if ((e.cd[key] || 0) > state.tick) return invFail(e, cmd, 'cooldown');
    if (u.kind === 'hearth') return TV ? TV.useStone(e, def) : invFail(e, cmd, 'not_usable');   // the Lantern Stone (never used up)
    if (u.kind === 'heal_pct') { if (e.hp >= e.hpMax) return invFail(e, cmd, 'full'); C.combat.heal(e, e, u.amount * e.hpMax, { ability: def.id, canCrit: false, noThreat: true }); }
    else if (u.kind === 'mana_pct') { if (!e.res || e.res.kind !== 'mana') return invFail(e, cmd, 'no_mana'); C.combat.gainRes(e, 'mana', u.amount * e.res.max); }
    else if (u.kind === 'rest_food') { if (e.inCombat) return invFail(e, cmd, 'combat'); e.restFood = u.amount || 0.1; e.mx = 0; e.my = 0; e.sitting = state.tick; emit({ type: 'sit', id: e.id, food: def.id }); }
    else if (u.kind === 'dispel') { for (const a of [...e.auras]) if (a.def.dispel === (u.dispel || 'poison') && a.def.kind === 'debuff') C.combat.removeAura(e, a, 'dispel'); }
    else if (PF && PF.canUse(u)) { const why = PF.useItem(e, def, u); if (why) return invFail(e, cmd, why); }   // professions: elixirs, food, bandages, Patterns
    else return invFail(e, cmd, 'not_usable');
    if (u.cooldown) e.cd[key] = state.tick + Math.round(u.cooldown * 20);
    bagRemove(e, def.id, 1);
    emit({ type: 'inventory', id: e.id, kind: 'use', item: def.id });
    if (QS) QS.onBag(e);
    return true;
  }

  // ---------------------------------------------------------------- movement and zone joins
  function speedMult(e) {
    if (!combatOn) return 1;
    if (C.combat.cannotMove(e)) return 0;
    let slow = C.stats.slowOf(e);
    if (e.mob && e.mob.kind === 'armored' && slow < (content.progression.mobKinds.armored.slowFloor || 0)) slow = 0;
    for (const a of e.auras) if (a.def.immune && a.def.immune.includes('slow')) slow = 0;
    const sm = C.stats.mod(e, 'speed');
    let m = Math.max(0, 1 + sm.add + ((e.derived && e.derived.gearSpeed) || 0)) * sm.mul * (1 - slow);
    if (e.cast && e.cast.kind === 'channel' && e.cast.walk) m *= e.cast.walk;
    if (e.cast && e.kind === 'player' && C.stats.mod(e, 'castMove').add > 0) m *= C.stats.mod(e, 'castMove').add;   // Builds 2 Running Hand
    return m;
  }

  function moveEntity(e) {
    const zone = zoneOf(e);
    let opts = e.kind === 'mob' ? { noJoins: true } : null;
    const shut = WD ? WD.shutCells(e.zone) : null; if (shut) opts = { ...(opts || {}), shut };   // a shut word door
    let vx = 0, vy = 0, dx = 0, dy = 0;
    if (e.forced) {
      vx = e.forced.vx; vy = e.forced.vy;
      e.forced.left--;
    } else if (e.kind === 'player') {
      dx = e.mx; dy = e.my;
      if (dx === 0 && dy === 0) {
        if (e.moving) { e.moveRun = state.tick - (e.moveStart ?? state.tick); e.moveStop = state.tick; }
        e.moving = false; return;
      }
      const sp = Math.round(PLAYER_SPEED * speedMult(e));
      vx = dx * sp; vy = dy * sp;
      if (dx !== 0 && dy !== 0) { vx = Math.trunc((vx * DIAG) / 256); vy = Math.trunc((vy * DIAG) / 256); }
    } else if (e.ai.vx != null) {
      const m = speedMult(e);
      vx = Math.round(e.ai.vx * m); vy = Math.round(e.ai.vy * m);
    } else {
      dx = e.ai.dx; dy = e.ai.dy;
      if (dx === 0 && dy === 0) { e.moving = false; return; }
      const sp = Math.round(e.ai.speed * speedMult(e));
      vx = dx * sp; vy = dy * sp;
      if (dx !== 0 && dy !== 0) { vx = Math.trunc((vx * DIAG) / 256); vy = Math.trunc((vy * DIAG) / 256); }
    }
    const ox = e.x, oy = e.y;
    let mx = 0, my = 0;
    if (vx !== 0 || vy !== 0) {
      mx = moveAxis(zone, e, vx, 'x', opts);
      my = moveAxis(zone, e, vy, 'y', opts);
      if (combatOn && e.kind === 'mob' && (mx || my) && blockedByObject(e, ox, oy)) { e.x = ox; e.y = oy; mx = 0; my = 0; }
    }
    if (e.forced && e.forced.left <= 0) {
      const arrive = e.forced.arrive;
      e.forced = null;
      if (arrive && combatOn) C.scripts.arrive(e, arrive);
    }
    const wasMoving = !!e.moving;
    e.moving = mx !== 0 || my !== 0;
    // Builds 2 Hasty Note: how long the hero's last walk lasted (moveRun, ticks), read when she stops
    if (e.kind === 'player') {
      if (e.moving && !wasMoving) e.moveStart = state.tick;
      else if (!e.moving && wasMoving) { e.moveRun = state.tick - (e.moveStart ?? state.tick); e.moveStop = state.tick; }
    }
    if (e.forced == null && (dx || dy)) e.dir = dirFor(dx, dy, e.dir);
    else if (e.moving && e.kind === 'mob') e.dir = dirFromVec(mx, my, e.dir);
    if (e.kind === 'mob' && !e.moving && (vx || vy)) e.ai.blocked = (e.ai.blocked || 0) + 1;
    if (combatOn && e.moving) {
      e.stillSince = state.tick;
      if (e.kind === 'player') {
        e.sitting = 0; e.restFood = 0;
        C.combat.breakStealth(e, 'move');
        if (e.cast && !e.forced) {
          const ab = C.data.ability(e, e.cast.ability);
          if (ab && ab.moveInterrupts !== false && !(e.cast.kind === 'channel' && e.cast.walk) && !(C.stats.mod(e, 'castMove').add > 0)) C.combat.cancelCast(e, 'move');
        }
      }
    }
    if (e.kind === 'player') checkJoin(e, zone);
  }

  function blockedByObject(e, ox, oy) {
    for (const o of state.ents) {
      if (o.kind !== 'object' || !o.obj || o.zone !== e.zone || !o.obj.def.blocks) continue;
      const r = o.obj.def.radius || 24;
      const now = distPxXY(e.x, e.y, o.x, o.y), before = distPxXY(ox, oy, o.x, o.y);
      if (now < r && now < before) return true;
    }
    return false;
  }

  function checkJoin(e, zone) {
    const [tx, ty] = feetTile(e);
    const j = inJoin(zone, tx, ty);
    if (!j || !content.zones[j.to]) return;          // a join to a zone that is not loaded: just the map edge
    if (j.needs && !(e.questsDone || []).includes(j.needs)) { if (combatOn && C.realms2) C.realms2.notYet(e, j); return; }   // realms2: the ride out waits for the boss
    // a door with a level gate (cap 30: the Barrow Deep Halls at 26) stays shut to a lower hero; one line every 5 s
    if (j.minLevel && (e.level || 1) < j.minLevel) { if (!(e.doorSaidAt > state.tick - 100)) { e.doorSaidAt = state.tick; emit({ type: 'door_locked', id: e.id, door: j.door || j.to, need: j.minLevel }); } return; }
    const from = e.zone;
    // a door into a dungeon or cave goes into the hero's party's own copy (made here, or reset after 30 minutes empty)
    const to = DG && DG.isPlace(j.to) && !DG.isPlace(from) ? DG.enter(e, j.to) : j.to;
    const [x, y] = tileToSub(j.tx, j.ty);
    e.zone = to; e.x = x; e.y = y;
    if (j.dir && DIRS.includes(j.dir)) e.dir = j.dir;
    e.target = null;
    if (combatOn) { e.autoOn = false; e.combo = null; e.forced = null; if (e.cast) C.combat.cancelCast(e, 'move'); }
    if (DG && DG.isPlace(from) && !DG.isPlace(to)) DG.leave(e, from);
    const inf = DG ? DG.info(to) : null;
    emit({ type: 'zone', id: e.id, from, to, x: j.tx, y: j.ty, ...(j.ride ? { ride: j.ride } : {}), ...(inf ? { kind: inf.kind, base: inf.base, name: inf.name, levels: inf.levels, label: inf.label } : {}) });
    if (combatOn) C.prog.onZoneEnter(e);
  }

  function dropBadTarget(e) {
    const t = index.get(e.target);
    if (!t || t.zone !== e.zone || distPx(e, t) > TARGET_RANGE_PX) { e.target = null; if (combatOn) e.autoOn = false; emit({ type: 'target', src: e.id, id: null, reason: 'lost' }); }
  }

  /** The snapshot view of one entity (CONTRACTS section 4). Internal-only fields (ai, spawn, mx/my, threat, aura defs) stay out. */
  function publicEntity(e) {
    const o = {
      id: e.id, kind: e.kind, zone: e.zone, x: e.x / SUB, y: e.y / SUB, dir: e.dir, moving: e.moving,
      name: e.name, level: e.level, faction: e.faction, sprite: e.sprite, template: e.template,
      hp: e.hp, hpMax: e.hpMax, res: e.res ? { ...e.res } : null,
      target: e.target, cast: e.cast ? publicCast(e.cast) : null,
      auras: e.auras.map((a) => ({ id: a.id, src: a.src, stacks: a.stacks, startTick: a.startTick, until: a.until, nextTick: a.nextTick, absorb: a.absorb || 0,
        name: a.def ? a.def.name || a.id : a.id, icon: a.def ? a.def.icon || a.id : a.id, kind: a.def ? a.def.kind || 'buff' : 'buff',
        flags: a.def && a.def.flags ? [...a.def.flags] : [] })),
      cd: { ...e.cd }, gcdUntil: e.gcdUntil, dead: e.dead,
    };
    if (e.kind === 'player') {
      o.cls = e.cls; o.look = e.look; o.xp = e.xp; o.party = e.party ?? null;
      if (e.app) o.app = { ...e.app };          // wave 6: the hero's own look; every co-op friend draws it from this
      Object.assign(o, EM.publicOf(e));          // wave 7 anim: emote ({ id, tick } | null), friends see the hop and the wave
      if (combatOn) {
        Object.assign(o, { bar: [...e.bar], known: [...e.known], talents: { ...e.talents }, gold: e.gold, combo: e.combo ? { ...e.combo } : null,
          lantern: e.lantern ? { ...e.lantern } : null, inCombat: !!e.inCombat, autoOn: !!e.autoOn, sitting: !!e.sitting,
          stats: { ...e.stats }, derived: { ...e.derived }, xpToLevel: C.prog.xpToNext(e.level),
          equip: JSON.parse(JSON.stringify(e.equip || {})), bag: JSON.parse(JSON.stringify(e.bag || [])),
          qbag: JSON.parse(JSON.stringify(e.qbag || [])), pendingLoot: JSON.parse(JSON.stringify(e.pendingLoot || [])), bags: e.bags ? [...e.bags] : ['starter_satchel'],
          quests: JSON.parse(JSON.stringify(e.quests || {})), questsDone: [...(e.questsDone || [])],
          b2: !!e.b2, build: e.build ? JSON.parse(JSON.stringify(e.build)) : null });
        if (PF && e.work) o.work = PF.workView(e);      // professions: a hero mining or crafting (the 3D pickaxe)
        if (TV) Object.assign(o, TV.publicOf(e));                            // travel: home, flights, hearth, flight
        if (MT) Object.assign(o, MT.publicOf(e));                            // mounts: mount (kind ridden | null), mounts (owned)
      }
    }
    if (e.kind === 'npc') { const job = e.job !== undefined ? e.job : ((content.npcs || {})[e.template] || {}).job; if (job) o.job = job; }   // wave 7 anim: the work loop (a routine may set e.job)
    if (e.kind === 'mob' && combatOn) {
      o.elite =!!(e.mob && e.mob.elite); o.mobKind = e.mob ? e.mob.kind : 'normal'; o.pack = (e.spawn && e.spawn.pack) || null;
      const mt = (content.mobs || {})[e.template] || {};
      o.rank = mt.boss ? 'boss' : o.elite ? 'elite' : (e.mob && e.mob.kind === 'weak') ? 'weak' : 'normal';
      if (mt.rare) o.rare = true;                // a rare named foe (src/data/rares.js): the silver mark
      o.aggro = e.ai && e.ai.mode === 'combat' ? e.ai.target : null; o.aiMode = e.ai ? e.ai.mode : null;
      // the wind-up tell (src/sim/ai.js): the glint before a swing, a heavy blow or a telegraphed cast (Ring Block reads it)
      if (PF && e.dead) { const sk = PF.skinView(e); if (sk) o.skin = sk; }     // professions: a corpse that can be skinned
      o.windup = e.windup && !e.dead && state.tick <= e.windup.at ? { kind: e.windup.kind, start: e.windup.start, at: e.windup.at, target: e.windup.target ?? null } : null;
    }
    if (WD && e.kind === 'object' && (e.wdoor || e.wstone)) Object.assign(o, WD.publicOf(e) || {});   // word doors
    if (e.kind === 'object' && e.node) {
      o.node = { item: e.node.item, channel: e.node.channel || 0 };
      if (e.node.gather) { const { prof, skill, kind, node, pool } = e.node.gather; o.node.gather = { prof, skill, kind, node, pool }; }   // professions: a gathering node
      // a secret cache: which heroes have opened it (each client draws it open for its own hero)
      if (e.node.secret) { o.node.secret = true; o.node.openedBy = e.dchest ? [...e.dchest.opened] : state.ents.filter((p) => p.kind === 'player' && (p.nodesUsed || []).includes(e.template)).map((p) => p.id); }
      // a dungeon or cave chest: a copy's cache (once per hero) or the first-clear-of-the-day chest (its hero only)
      if (e.dchest) o.node.chest = { kind: e.dchest.kind, place: e.dchest.place, for: e.dchest.for ?? null };
    }
    else if (e.kind === 'object' && e.chest) { o.chest = { id: e.chest.id, place: e.chest.place || null }; }
    else if (e.kind === 'object' && e.mirror) { o.mirror = { id: e.mirror.id, place: e.mirror.place || null }; }
    else if (e.kind === 'object' && e.obj) {
      o.owner = e.owner; o.objType = e.obj.def.id; o.radius = e.obj.def.radius || (e.obj.def.trigger && e.obj.def.trigger.radius) || 0;
      o.armed = state.tick >= e.obj.armAt; o.until = e.obj.until;
    }
    return o;
  }
  function publicCast(c) {
    return { ability: c.ability, target: c.target, at: c.at ? { x: c.at.x / SUB, y: c.at.y / SUB } : null, startTick: c.startTick, endTick: c.endTick, kind: c.kind, nextTick: c.nextTick ?? null };
  }

  return w;
}

function facingToward(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

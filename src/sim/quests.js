// The quest system (docs/CONTRACTS.md 7.5 and 7.7, docs/design/ZONES_QUESTS.md 5). Pure and deterministic: no DOM,
// no clock, no Math.random. The world owns entities and the tick; it hands this module a small context Q and calls the
// hooks below at fixed points (CONTRACTS 7.7 lists them). Everything the module keeps lives on the player entity
// (`quests`, `questsDone`, `nodesUsed`, `area`) or on entities it spawned (escorts, nodes), so serialize/restore and
// the state hash cover it.
//
//   const QS = createQuests(Q)
//   Q = { state, content, emit(ev), rng, get(id), ents() (iterable), grantXp(e, amount, reason, extra?),
//         addEntity(e) -> e, nextId() -> int, spawnMob({ zone, mob, level, x, y }) -> e (optional, escort ambushes) }
//
//   commands:  QS.interact(p, target)            npc talk (talk / deliver objectives, then a `quest_dialog` event) or a node
//              QS.accept(p, questId)              CONTRACTS command quest_accept
//              QS.turnIn(p, questId, choice)      CONTRACTS command quest_turnin (choice = reward index)
//              QS.abandon(p, questId)             CONTRACTS command quest_abandon
//   hooks:     QS.spawnObjects()                  once after spawnContent: every zone `nodes` entry becomes an object entity
//              QS.onKill(p, mob)                  a mob died and p gets the credit (its tagger)
//              QS.onBag(p)                        p's bag changed (loot, vendor, node): recount collect objectives
//              QS.onMove(p)                       p moved or changed zone: explore objectives, area banners, escort start
//              QS.onDamaged(e)                    e took damage: breaks a node channel
//              QS.tick()                          once per tick: node channels, node respawns, escorts
//   queries:   QS.marker(p, npcId)               '!' | '?' | '!grey' | '!soon' | '?grey' | null
//              QS.status(p, questId)              'done' | 'ready' | 'active' | 'available' | 'soon' | 'locked'
//              QS.needsItem(p, item)              an active quest still needs this item (loot.js asks before a quest drop)
//              QS.tracker(p)                      rows for the HUD quest tracker
//              QS.offersAt(p, npcId)              { offers, turnins, progress } quest ids at that NPC
//              QS.bountiesToday(day?)             the bounty ids posted today (content.bounties.boards; BUILDS_2 5.6)
//
// Bounty boards (BUILDS_2 5.6, cap 20): content.bounties.boards = [{ id, npc, pools: [named[], camp[], gather[]] }]. Each
// board posts one bounty from each pool a day: pool[(day + board index + pool index) mod pool length]. `day` is
// Q.state.day, a whole number the world is given (createWorld({ day }) / world.setDay(day): the client passes its local
// calendar day), never a clock read here. A bounty is a quest with `bounty: { board, kind }`: it never goes to
// questsDone; a turn-in goes to p.bounties = { day, done: [ids] }, so the same bounty is open again on another day.
import { bagCount, bagAdd, bagRemove, bagFree, rollGear } from './loot.js';
import { zoneBase } from './dungeons.js';
import { xpRate } from './progression.js';
import { moveAxis } from './collision.js';
import { SUB, TILE } from './constants.js';

export const MAX_LOG = 20;
const QUEST_GAP = { 2: 1.0, 3: 0.75, 4: 0.5, 5: 0.25 };   // PROGRESSION 2.2: your level minus quest level
const ESCORT_SPEED = 52;                                  // SUB per tick, a little slower than the player
const tileToSub = (tx, ty) => [tx * TILE + TILE / 2, (ty + 1) * TILE - SUB];
const feet = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];
const dist = (a, b) => Math.hypot((a.x - b.x) / SUB, (a.y - b.y) / SUB);

export function questGapMult(playerLevel, questLevel) {
  const d = playerLevel - questLevel;
  if (d <= 2) return 1;
  if (d >= 5) return QUEST_GAP[5];
  return QUEST_GAP[d];
}

export function createQuests(Q) {
  const C = Q.content;
  const QUESTS = C.quests || {};
  const CHAIN = C.questOrder || Object.keys(QUESTS);
  const BOARDS = (C.bounties && C.bounties.boards) || [];
  const BOUNTY_IDS = [...new Set(BOARDS.flatMap((b) => b.pools.flat()))].filter((id) => QUESTS[id] && !CHAIN.includes(id));
  // dungeons build: side quests (content.sideQuests, src/data/dungeon_quests.js) come after the bounties
  const SIDE = (C.sideQuests || []).filter((id) => QUESTS[id] && !CHAIN.includes(id) && !BOUNTY_IDS.includes(id));
  const ORDER = [...CHAIN, ...BOUNTY_IDS, ...SIDE];        // the chain first, then every bounty (posted or not), then side quests
  const today = () => (Q.state.day | 0);
  function bountiesToday(day = today()) {
    const out = [];
    BOARDS.forEach((b, i) => b.pools.forEach((pool, k) => { if (pool.length) out.push(pool[(((day + i + k) % pool.length) + pool.length) % pool.length]); }));
    return out;
  }
  const bountyDoneToday = (p, id) => !!(p.bounties && p.bounties.day === today() && (p.bounties.done || []).includes(id));
  const tick = () => Q.state.tick;
  const emit = (ev) => Q.emit(ev);
  const ensure = (p) => { if (!p.quests) p.quests = {}; if (!p.questsDone) p.questsDone = []; if (!p.nodesUsed) p.nodesUsed = []; return p; };
  const done = (p, id) => ensure(p).questsDone.includes(id);
  // a story chain step counts as done when the hero has done or holds a LATER step of it (src/data/worldlife.js storyLater):
  // a save that finished part of a chain out of order is never locked out by the prerequisites the chain added
  // a quest may stand for another (`standsFor`, polish 2026-11-22): the Rootbound's Up the Root Stair ends at Elder Mael as
  // Hob's A Name Written Twice does, so a hero who started in the Rootbound is never locked out of the valley chain and the
  // Willowmere board, and is not paid twice for meeting Mael (the realm's own first quest pays as Hob's does)
  const STOOD = {};
  for (const [qid, q] of Object.entries(QUESTS)) for (const x of q.standsFor || []) (STOOD[x] = STOOD[x] || []).push(qid);
  const stoodFor = (p, id) => (STOOD[id] || []).some((x) => done(p, x));
  const doneOrLater = (p, id) => done(p, id) || stoodFor(p, id) || ((C.storyLater || {})[id] || []).some((x) => done(p, x) || !!p.quests[x]);
  const active = (p) => ORDER.filter((id) => ensure(p).quests[id]);

  // ---------------------------------------------------------------- status
  function status(p, id) {
    ensure(p);
    const q = QUESTS[id];
    if (!q) return 'locked';
    if (q.bounty ? bountyDoneToday(p, id) : done(p, id)) return 'done';
    const s = p.quests[id];
    if (s) return s.state === 'ready' ? 'ready' : 'active';
    if (stoodFor(p, id)) return 'done';                              // a quest that stands for it is done (standsFor)
    if (q.bounty && !bountiesToday().includes(id)) return 'locked';   // not on the board today
    const req = q.requires || {};
    if ((req.quests || []).some((r) => !doneOrLater(p, r))) return 'locked';
    if (req.cls && req.cls !== p.cls) return 'locked';
    if (p.level < (req.level || q.minLevel || 1)) return 'soon';
    return 'available';
  }

  function canAccept(p, id) {
    const st = status(p, id);
    if (st !== 'available') return st;
    if (active(p).length >= MAX_LOG) return 'log_full';
    const q = QUESTS[id];
    for (const g of q.giveOnAccept || []) if (bagFree(p, C) < 1 && !bagCount(p, g.item)) return 'bag_full';
    return null;
  }

  // ---------------------------------------------------------------- objective bookkeeping
  function need(o) { return o.kind === 'kill' || o.kind === 'collect' ? o.count || 1 : 1; }

  function setCount(p, id, i, n) {
    const s = p.quests[id];
    const q = QUESTS[id];
    const o = q.objectives[i];
    n = Math.max(0, Math.min(need(o), n));
    if (s.counts[i] === n) return false;
    s.counts[i] = n;
    emit({ type: 'quest', id: p.id, quest: id, kind: 'progress', objective: i, cur: n, need: need(o) });
    return true;
  }

  function checkReady(p, id) {
    const s = p.quests[id];
    if (!s) return;
    const q = QUESTS[id];
    const all = q.objectives.every((o, i) => s.counts[i] >= need(o));
    if (all && s.state !== 'ready') { s.state = 'ready'; emit({ type: 'quest', id: p.id, quest: id, kind: 'complete' }); }
    else if (!all && s.state === 'ready') s.state = 'active';
  }

  function recountCollect(p) {
    for (const id of active(p)) {
      const q = QUESTS[id];
      q.objectives.forEach((o, i) => { if (o.kind === 'collect') setCount(p, id, i, bagCount(p, o.item)); });
      checkReady(p, id);
    }
  }

  function needsItem(p, item) {
    if (!p || p.kind !== 'player') return false;
    for (const id of active(p)) {
      const q = QUESTS[id];
      const s = p.quests[id];
      for (let i = 0; i < q.objectives.length; i++) {
        const o = q.objectives[i];
        if (o.kind === 'collect' && o.item === item && s.counts[i] < need(o)) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- commands
  function accept(p, id) {
    const why = canAccept(p, id);
    if (why) { emit({ type: 'cmd_reject', id: p.id, cmd: 'quest_accept', reason: why }); return false; }
    const q = QUESTS[id];
    p.quests[id] = { state: 'active', counts: q.objectives.map(() => 0), at: tick() };
    for (const g of q.giveOnAccept || []) if (bagCount(p, g.item) < g.qty) bagAdd(p, g.item, g.qty - bagCount(p, g.item), null, C);
    emit({ type: 'quest', id: p.id, quest: id, kind: 'accept' });
    q.objectives.forEach((o, i) => {
      if (o.kind === 'collect') setCount(p, id, i, bagCount(p, o.item));
      if (o.kind === 'explore' && p.zone === o.zone && inArea(p, o.zone, o.area)) setCount(p, id, i, 1);
      if (o.kind === 'escort') startEscort(p, id, i, o);
    });
    checkReady(p, id);
    return true;
  }

  function abandon(p, id) {
    ensure(p);
    if (!p.quests[id]) { emit({ type: 'cmd_reject', id: p.id, cmd: 'quest_abandon', reason: 'not_active' }); return false; }
    const q = QUESTS[id];
    for (const g of q.giveOnAccept || []) bagRemove(p, g.item, g.qty);
    for (const o of q.objectives) if (o.kind === 'collect' && !otherNeeds(p, id, o.item)) bagRemove(p, o.item, bagCount(p, o.item));
    endEscort(p, id);
    delete p.quests[id];
    emit({ type: 'quest', id: p.id, quest: id, kind: 'abandon' });
    return true;
  }
  const otherNeeds = (p, except, item) => active(p).some((id) => id !== except && QUESTS[id].objectives.some((o) => o.kind === 'collect' && o.item === item));

  function turnIn(p, id, choice = 0) {
    ensure(p);
    const q = QUESTS[id];
    const s = p.quests[id];
    if (!q || !s || s.state !== 'ready') { emit({ type: 'cmd_reject', id: p.id, cmd: 'quest_turnin', reason: 'not_ready' }); return false; }
    const r = q.rewards || {};
    const choices = r.choice || [];
    const pick = choices.length ? choices[Math.max(0, Math.min(choices.length - 1, choice | 0))] : null;
    const gifts = [...(r.items || []), ...(pick ? [pick] : [])];
    // collected quest items go back first, so the slots they free count
    const taken = [];
    for (const o of q.objectives) if (o.kind === 'collect') taken.push([o.item, bagRemove(p, o.item, o.count)]);
    if (bagFree(p, C) < gifts.length) {
      for (const [it, n] of taken) bagAdd(p, it, n, null, C);
      emit({ type: 'cmd_reject', id: p.id, cmd: 'quest_turnin', reason: 'bag_full' });
      return false;
    }
    delete p.quests[id];
    if (q.bounty) {
      if (!p.bounties || p.bounties.day !== today()) p.bounties = { day: today(), done: [] };
      p.bounties.done.push(id);
    } else { p.questsDone.push(id); ensureStoryNpcs(p); }
    const xp = Math.round((r.xp || 0) * questGapMult(p.level, q.level));
    if (xp > 0) {
      if (Q.grantXp) Q.grantXp(p, xp, 'quest', { quest: id });
      else emit({ type: 'xp', id: p.id, amount: xp, source: 'quest', quest: id });   // HOOK: combat's grantXp not wired yet
    }
    p.gold = (p.gold || 0) + (r.gold || 0);
    const items = [];
    for (const it of gifts) {
      const inst = rewardInstance(p, it, q);
      bagAdd(p, it, 1, inst, C);
      items.push({ item: it, qty: 1 });
    }
    emit({ type: 'quest', id: p.id, quest: id, kind: 'turnin', xp, gold: r.gold || 0, items });
    if (r.gold) emit({ type: 'gold', id: p.id, amount: r.gold, total: p.gold, source: 'quest' });
    if (q.hook) emit({ type: 'quest_hook', id: p.id, quest: id, lines: q.hook.lines, later: C.comingLater || null });
    return true;
  }

  /** A reward that "rolls to class" is fixed to the receiver's class at the moment it is given. */
  function rewardInstance(p, itemId, q) {
    const def = C.items[itemId];
    if (!def || (def.kind !== 'weapon' && def.kind !== 'armor')) return null;
    const cg = (C.classGear || {})[p.cls];
    const inst = { ilvl: def.level, rarity: def.rarity };
    if (def.armorType === 'class') inst.armorType = cg ? cg.armor : 'cloth';
    else if (Array.isArray(def.armorType)) inst.armorType = cg && def.armorType.includes(cg.armor) ? cg.armor : def.armorType[0];
    if (Array.isArray(def.weaponType)) inst.weaponType = cg ? (def.weaponType.find((w) => cg.weapons.includes(w)) || def.weaponType[0]) : def.weaponType[0];
    inst.affixes = [];
    return inst;
  }

  // ---------------------------------------------------------------- talking
  function offersAt(p, npcId) {
    const offers = [], turnins = [], progress = [], soon = [];
    for (const id of ORDER) {
      const q = QUESTS[id];
      const st = status(p, id);
      if (q.giver === npcId && st === 'available') offers.push(id);
      if (q.giver === npcId && st === 'soon') soon.push(id);
      if (q.turnIn === npcId && st === 'ready') turnins.push(id);
      else if (q.turnIn === npcId && st === 'active') progress.push(id);
    }
    return { offers, turnins, progress, soon };
  }

  function interact(p, t) {
    ensure(p);
    if (t.kind === 'object' && t.node) return pickNode(p, t);
    if (t.kind !== 'npc') return false;
    const npc = t.template;
    // talk and deliver objectives complete by speaking to the npc
    for (const id of active(p)) {
      const q = QUESTS[id];
      q.objectives.forEach((o, i) => {
        if (p.quests[id].counts[i] >= need(o)) return;
        if (o.kind === 'talk' && o.npc === npc) setCount(p, id, i, 1);
        if (o.kind === 'deliver' && o.to === npc && bagCount(p, o.item) > 0) { bagRemove(p, o.item, 1); setCount(p, id, i, 1); }
      });
      checkReady(p, id);
    }
    const o = offersAt(p, npc);
    const rewards = {};
    for (const id of [...o.offers, ...o.turnins, ...o.progress]) rewards[id] = rewardsFor(p, id);
    emit({ type: 'quest_dialog', id: p.id, npc, ent: t.id, offers: o.offers, turnins: o.turnins, progress: o.progress, soon: o.soon, rewards });
    return true;
  }

  function marker(p, npcId) {
    const o = offersAt(p, npcId);
    if (o.turnins.length) return '?';
    for (const id of active(p)) {
      const q = QUESTS[id];
      if (q.objectives.some((ob, i) => p.quests[id].counts[i] < need(ob) && ((ob.kind === 'talk' && ob.npc === npcId) || (ob.kind === 'deliver' && ob.to === npcId)))) return '?';
    }
    const fresh = o.offers.filter((id) => p.level - QUESTS[id].level < 5);
    if (fresh.length) return '!';
    if (o.offers.length) return '!grey';
    if (o.progress.length) return '?grey';
    if (o.soon.length) return '!soon';
    return null;
  }

  // ---------------------------------------------------------------- kills and moving
  function onKill(p, mob) {
    if (!p || p.kind !== 'player') return;
    ensure(p);
    for (const id of active(p)) {
      const q = QUESTS[id];
      q.objectives.forEach((o, i) => {
        // a kill objective named for a place counts in any copy of it (cap 35: the Weir Works' drowned drovers)
        if (o.kind === 'kill' && o.mob === mob.template && (!o.zone || o.zone === mob.zone || o.zone === zoneBase(mob.zone)) && (!o.region || regionOfMob(mob) === o.region)) setCount(p, id, i, p.quests[id].counts[i] + 1);
      });
      checkReady(p, id);
    }
  }

  // one world: a kill objective names an area (`region`, src/data/maps/index.js); a mob belongs to the area of its spawn
  function regionOfMob(m) {
    const z = C.zones[m.zone];
    if (!z || !z.regions) return null;
    const at = m.spawn || m;
    const tx = Math.floor(at.x / TILE), ty = Math.floor((at.y - 1) / TILE);
    for (const r of z.regions) if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) return r.id;
    return null;
  }

  function inArea(e, zoneId, areaId) {
    const z = C.zones[zoneId];
    const a = z && (z.areas || []).find((x) => x.id === areaId);
    if (!a || (e.zone !== zoneId && zoneBase(e.zone) !== zoneId)) return false;     // a dungeon copy is its place's zone
    const [tx, ty] = feet(e);
    return tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.h;
  }

  function areaAt(e) {
    const z = C.zones[e.zone];
    if (!z) return null;
    const [tx, ty] = feet(e);
    let best = null;
    for (const a of z.areas || []) {
      if (a.banner === false) continue;
      if (tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.h && (!best || a.w * a.h < best.w * best.h)) best = a;
    }
    return best;
  }

  function onMove(p) {
    ensure(p);
    const a = areaAt(p);
    const key = a ? `${p.zone}:${a.id}` : null;
    if (key !== (p.area || null)) {
      p.area = key;
      if (a) emit({ type: 'area', id: p.id, zone: p.zone, area: a.id, name: a.name, levels: a.levels || null, safe: !!a.safe });
    }
    for (const id of active(p)) {
      const q = QUESTS[id];
      q.objectives.forEach((o, i) => { if (o.kind === 'explore' && p.quests[id].counts[i] < 1 && inArea(p, o.zone, o.area)) setCount(p, id, i, 1); });
      checkReady(p, id);
    }
  }

  // ---------------------------------------------------------------- nodes (collect objectives on the ground)
  function spawnObjects() {
    for (const zid of Object.keys(C.zones).sort()) {
      for (const n of C.zones[zid].nodes || []) {
        const [x, y] = tileToSub(n.x, n.y);
        Q.addEntity({
          id: Q.nextId(), kind: 'object', zone: zid, x, y, dir: 'down', moving: false, name: n.name || n.id, level: 1, faction: 'neutral',
          sprite: n.sprite || 'node', template: n.id, hp: 1, hpMax: 1, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0,
          dead: false, node: { item: n.item, respawn: n.respawn || 30, channel: n.channel || 0, perPlayer: !!n.perPlayer, readyAt: 0 },
        });
      }
      // secret caches (landscape pass, zone `secrets`, tools/maps/kit.mjs): once per hero, the hero's nodesUsed keeps it
      for (const s of C.zones[zid].secrets || []) {
        const k = s.chest;
        const [x, y] = tileToSub(k.x, k.y);
        Q.addEntity({
          id: Q.nextId(), kind: 'object', zone: zid, x, y, dir: 'down', moving: false, name: k.name || 'Hidden Cache', level: 1, faction: 'neutral',
          sprite: 'chest_gold', template: k.id, hp: 1, hpMax: 1, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0,
          dead: false, node: { item: null, respawn: 0, channel: 0, perPlayer: true, readyAt: 0, secret: { id: s.id, gold: k.gold || [10, 20], levels: k.levels || [1, 1], text: k.text || '' } },
        });
      }
    }
  }

  /** A secret cache: gold and one rare piece rolled for the hero's class, once per hero (p.nodesUsed). */
  function openSecret(p, t) {
    const n = t.node, s = n.secret;
    if (p.nodesUsed.includes(t.template)) { emit({ type: 'interact_fail', src: p.id, id: t.id, reason: 'used' }); return false; }
    const C2 = C.dropRules ? { ...C, dropRules: { ...C.dropRules, classBias: 1 } } : C;
    const ilvl = Math.max(s.levels[0], Math.min(s.levels[1], p.level || 1));
    const gear = C.items && C.dropRules ? rollGear({ content: C2, rng: Q.rng }, { ilvl, source: 'chest_gold', cls: p.cls, rarity: 'rare' }) : null;
    if (gear && bagAdd(p, gear.item, 1, gear.inst, C) < 1) { emit({ type: 'interact_fail', src: p.id, id: t.id, reason: 'bag_full' }); return false; }
    const gold = Q.rng.int(s.gold[0], Math.max(s.gold[0], s.gold[1]));
    p.gold = (p.gold || 0) + gold;
    p.nodesUsed.push(t.template);
    emit({ type: 'secret_found', id: p.id, from: t.id, secret: s.id, name: t.name, text: s.text });
    emit({ type: 'loot', id: p.id, from: t.id, gold, items: gear ? [{ item: gear.item, qty: 1, inst: gear.inst }] : [] });
    emit({ type: 'gold', id: p.id, amount: gold, total: p.gold, source: 'secret' });
    if (gear) recountCollect(p);
    return true;
  }

  function pickNode(p, t) {
    const n = t.node;
    if (n.secret) return openSecret(p, t);
    if (t.dead || tick() < n.readyAt) { emit({ type: 'interact_fail', src: p.id, id: t.id, reason: 'empty' }); return false; }
    if (!needsItem(p, n.item)) { emit({ type: 'interact_fail', src: p.id, id: t.id, reason: 'not_needed' }); return false; }
    if (n.perPlayer && p.nodesUsed.includes(t.template)) { emit({ type: 'interact_fail', src: p.id, id: t.id, reason: 'used' }); return false; }
    if (n.channel > 0) {
      p.questChannel = { node: t.id, until: tick() + Math.round(n.channel * 20), x: p.x, y: p.y, hp: p.hp };
      emit({ type: 'cast_start', src: p.id, ability: 'quest_channel', target: t.id, castTicks: Math.round(n.channel * 20), node: t.template });
      return true;
    }
    return giveNode(p, t);
  }

  function giveNode(p, t) {
    const n = t.node;
    if (bagAdd(p, n.item, 1, null, C) < 1) { emit({ type: 'interact_fail', src: p.id, id: t.id, reason: 'bag_full' }); return false; }
    if (n.perPlayer) p.nodesUsed.push(t.template);
    else { t.dead = true; n.readyAt = tick() + Math.round(n.respawn * 20); emit({ type: 'despawn', id: t.id, template: t.template, zone: t.zone }); }
    emit({ type: 'loot', id: p.id, from: t.id, gold: 0, items: [{ item: n.item, qty: 1 }] });
    recountCollect(p);
    return true;
  }

  function onDamaged(e) {
    if (e && e.questChannel) { emit({ type: 'cast_stop', src: e.id, ability: 'quest_channel', target: e.questChannel.node, reason: 'interrupt' }); e.questChannel = null; }
  }

  // ---------------------------------------------------------------- escorts (escort-lite)
  function startEscort(p, id, i, o) {
    if (!Q.addEntity) return;
    endEscort(p, id);
    const t = (C.npcs || {})[o.npc] || {};
    const [x, y] = tileToSub(o.from.x, o.from.y);
    const hpMax = Math.max(20, Math.round((p.hpMax || 100) * ((t.escort && t.escort.hpPct) || 0.4)));
    const e = Q.addEntity({
      id: Q.nextId(), kind: 'npc', zone: o.from.zone, x, y, dir: 'down', moving: false, name: t.name || o.npc, level: p.level, faction: 'friendly',
      sprite: t.sprite || 'npc_child_b', template: o.npc, hp: hpMax, hpMax, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
      escort: { owner: p.id, quest: id, objective: i, following: false, ambushed: [], trail: [], still: 0 },
    });
    p.quests[id].escort = e.id;
    emit({ type: 'spawn', id: e.id, template: e.template, zone: e.zone, kind: 'npc', escort: id });
  }

  /** The escort npc leaves the world for good (PLAYTEST_BOT bug 10: it used to stay in state as a dead `_gone` entity). */
  function dropEscortEnt(e) {
    const zone = e.zone;
    e.dead = true; e.escort = null;
    if (Q.removeEntity) Q.removeEntity(e); else e.zone = '_gone';
    emit({ type: 'despawn', id: e.id, template: e.template, zone });
  }

  function endEscort(p, id) {
    const s = p.quests && p.quests[id];
    if (!s || s.escort == null) return;
    const e = Q.get(s.escort);
    if (e && e.escort) dropEscortEnt(e);
    s.escort = null;
  }

  /**
   * After a restore (addPlayer from a save) or a join: every active escort objective that is not done gets a fresh
   * escort at its start, as a fresh accept would (PLAYTEST_BOT bug 1). An escort id in the save that no longer names this
   * player's live escort is dropped first.
   */
  /**
   * Story npcs (cap 35: Ferrick back at the mill, src/data/weir_works.js WW_STORY_NPCS): content.storyNpcs =
   * [{ npc, zone, x, y, dir, after }]. Once a hero in the world has handed in `after`, the npc stands at its spot (one,
   * for everyone in the world; it is never in content.spawns, so a world nobody has done it in has none). Runs on a
   * hand-in and when a hero joins or loads (ensureEscorts).
   */
  function ensureStoryNpcs(p) {
    if (!Q.addEntity) return;
    for (const s of C.storyNpcs || []) {
      if (!done(p, s.after) || !C.zones[s.zone]) continue;
      if ([...Q.ents()].some((e) => e.kind === 'npc' && e.template === s.npc && !e.dead)) continue;
      const t = (C.npcs || {})[s.npc] || {};
      const [x, y] = tileToSub(s.x, s.y);
      const e = Q.addEntity({
        id: Q.nextId(), kind: 'npc', zone: s.zone, x, y, dir: s.dir || 'down', moving: false, name: t.name || s.npc, level: t.level || 1, faction: 'friendly',
        sprite: t.sprite || 'npc_farmer', template: s.npc, hp: t.hp || 100, hpMax: t.hp || 100, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
        spawn: { zone: s.zone, x, y }, story: s.after,
      });
      emit({ type: 'spawn', id: e.id, template: e.template, zone: e.zone, kind: 'npc' });
    }
  }

  function ensureEscorts(p) {
    ensure(p);
    ensureStoryNpcs(p);
    for (const id of active(p)) {
      const q = QUESTS[id];
      const s = p.quests[id];
      q.objectives.forEach((o, i) => {
        if (o.kind !== 'escort' || s.counts[i] >= need(o)) return;
        const cur = s.escort != null ? Q.get(s.escort) : null;
        if (cur && cur.escort && cur.escort.owner === p.id && cur.escort.quest === id) return;
        s.escort = null;
        startEscort(p, id, i, o);
      });
    }
  }

  // ---- escort ambush spots: walkable tiles reachable on foot from the escort, 2 to 6 steps away (PLAYTEST_BOT bug 3)
  function walkableNear(zoneId, fromTx, fromTy, maxSteps) {
    const zone = C.zones[zoneId];
    const free = (x, y) => (Q.spotFree ? Q.spotFree(zone, x, y) : zone.collision[y] && zone.collision[y][x] === '.');
    const seen = new Map([[`${fromTx},${fromTy}`, 0]]);
    const q = [[fromTx, fromTy]];
    const out = [];
    while (q.length) {
      const [x, y] = q.shift();
      const d = seen.get(`${x},${y}`);
      out.push([x, y, d]);
      if (d >= maxSteps) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (seen.has(k) || nx < 0 || ny < 0 || nx >= zone.w || ny >= zone.h || !free(nx, ny)) continue;
        seen.set(k, d + 1);
        q.push([nx, ny]);
      }
    }
    return out;
  }
  function ambushSpots(e, a, n) {
    const [ex, ey] = feet(e);
    const near = walkableNear(e.zone, ex, ey, 7);
    const ok = new Set(near.map(([x, y]) => `${x},${y}`));
    const picked = [];
    for (const s of a.spots || []) if (picked.length < n && ok.has(`${s.x},${s.y}`)) picked.push([s.x, s.y]);
    const rest = near.filter(([x, y, d]) => d >= 3 && d <= 6 && !picked.some(([px, py]) => px === x && py === y))
      .sort((p1, p2) => Math.abs(p1[2] - 4) - Math.abs(p2[2] - 4) || p1[1] - p2[1] || p1[0] - p2[0]);
    for (const [x, y] of rest) { if (picked.length >= n) break; if (!picked.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) < 2)) picked.push([x, y]); }
    while (picked.length < n) picked.push([ex, ey]);
    return picked;
  }

  const TRAIL_STEP = 8 * SUB;                     // a breadcrumb every 8 px the player walks
  const TRAIL_MAX = 96;

  function tickEscort(e) {
    const E = e.escort;
    const p = Q.get(E.owner);
    const s = p && p.quests && p.quests[E.quest];
    if (!s || s.escort !== e.id) { dropEscortEnt(e); return; }
    const o = QUESTS[E.quest].objectives[E.objective];
    if (e.dead || e.hp <= 0) {                     // knocked out: she wakes at the start
      emit({ type: 'quest', id: p.id, quest: E.quest, kind: 'fail', objective: E.objective });
      startEscort(p, E.quest, E.objective, o);
      return;
    }
    if (p.zone !== e.zone) { e.moving = false; return; }
    const d = dist(e, p);
    if (!E.following && d <= 48) { E.following = true; E.trail = []; emit({ type: 'quest', id: p.id, quest: E.quest, kind: 'progress', objective: E.objective, cur: 0, need: 1, escort: 'start' }); }
    E.trail = E.trail || [];
    if (E.following && !p.dead) {
      // the player's breadcrumbs: every cell on the trail is one the player stood on, so following it never walks her
      // into the river (PLAYTEST_BOT bug 11)
      const last = E.trail[E.trail.length - 1];
      if (!last || Math.hypot(p.x - last[0], p.y - last[1]) >= TRAIL_STEP) E.trail.push([p.x, p.y]);
      if (E.trail.length > TRAIL_MAX) { const [jx, jy] = E.trail[E.trail.length - TRAIL_MAX]; e.x = jx; e.y = jy; E.trail = E.trail.slice(-TRAIL_MAX + 1); }
    }
    if (E.following && d > 32) {
      const zone = C.zones[e.zone];
      while (E.trail.length && Math.hypot(E.trail[0][0] - e.x, E.trail[0][1] - e.y) <= 3 * SUB) E.trail.shift();
      const [gx, gy] = E.trail.length ? E.trail[0] : [p.x, p.y];
      const dx = gx - e.x, dy = gy - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const sp = Math.min(ESCORT_SPEED, Math.ceil(len));
      const vx = Math.round((dx / len) * sp), vy = Math.round((dy / len) * sp);
      const mx = moveAxis(zone, e, vx, 'x', { noJoins: true }), my = moveAxis(zone, e, vy, 'y', { noJoins: true });
      e.moving = mx !== 0 || my !== 0;
      if (Math.abs(dx) > Math.abs(dy)) e.dir = dx < 0 ? 'left' : 'right'; else e.dir = dy < 0 ? 'up' : 'down';
      E.still = e.moving ? 0 : (E.still || 0) + 1;
      if (E.still >= 20) {                         // blocked a full second: hop to the next breadcrumb (a cell the player stood on)
        const [hx, hy] = E.trail.length ? E.trail.shift() : [p.x, p.y];
        e.x = hx; e.y = hy; E.still = 0;
      }
    } else { e.moving = false; E.still = 0; }
    // ambushes: the adds come out of the trees a few steps away, on walkable cells she can be reached from
    (o.ambush || []).forEach((a, k) => {
      if (E.ambushed.includes(k)) return;
      const [ax, ay] = feet(e);
      if (Math.hypot(ax - a.at.x, ay - a.at.y) > a.at.r) return;
      E.ambushed.push(k);
      if (!Q.spawnMob) return;
      const spots = ambushSpots(e, a, a.mobs.length);
      a.mobs.forEach((m, j) => {
        const mob = Q.spawnMob({ zone: e.zone, mob: m.mob, level: m.level, x: spots[j][0], y: spots[j][1], temporary: true });
        if (mob) { mob.threat = mob.threat || {}; mob.threat[e.id] = 1; mob.target = e.id; if (mob.ai) mob.ai.mode = 'aggro'; }
      });
      emit({ type: 'quest', id: p.id, quest: E.quest, kind: 'progress', objective: E.objective, cur: 0, need: 1, escort: 'ambush' });
    });
    // home: she arrives, or the player arrives with her following close behind (within 10 tiles)
    if (e.zone === o.to.zone) {
      const at = (u) => { const [tx, ty] = feet(u); return Math.hypot(tx - o.to.x, ty - o.to.y) <= o.to.r; };
      if (at(e) || (E.following && !p.dead && p.zone === e.zone && at(p) && d <= 160)) {
        setCount(p, E.quest, E.objective, 1);
        checkReady(p, E.quest);
        endEscort(p, E.quest);
      }
    }
  }

  // ---------------------------------------------------------------- the tick
  function step() {
    for (const e of [...Q.ents()]) {
      if (e.kind === 'object' && e.node && e.dead && tick() >= e.node.readyAt) {
        e.dead = false;
        emit({ type: 'spawn', id: e.id, template: e.template, zone: e.zone, kind: 'object' });
      }
      if (e.escort) tickEscort(e);
      if (e.kind === 'player' && e.questChannel) {
        const c = e.questChannel;
        const t = Q.get(c.node);
        if (!t || e.x !== c.x || e.y !== c.y || e.hp < c.hp || e.dead) { onDamaged(e); continue; }
        if (tick() >= c.until) {
          e.questChannel = null;
          emit({ type: 'cast_stop', src: e.id, ability: 'quest_channel', target: t.id, reason: 'done' });
          giveNode(e, t);
        }
      }
    }
  }

  // ---------------------------------------------------------------- where (objective circles in px)
  const NPC_AT = {};
  // one world: a circle's zone is 'world'; `region` (when known) names the area it lies in, for labels ("in the valley")
  for (const [zid, z] of Object.entries(C.zones || {})) for (const n of z.npcs || []) if (!NPC_AT[n.npc]) NPC_AT[n.npc] = { zone: zid, x: n.x * 16 + 8, y: n.y * 16 + 8, r: 24, ...(n.region ? { region: n.region } : {}) };
  function npcWhere(npc) { return NPC_AT[npc] ? [{ ...NPC_AT[npc] }] : []; }
  function whereOf(o) { return (o.where || []).map((w) => ({ zone: w.zone, x: w.x, y: w.y, r: w.r, ...(w.region ? { region: w.region } : {}) })); }

  /** The reward choices of a quest as this player would get them (armor and weapon type rolled to the class) and whether
   *  the class can use each (critique 13: the dialog shows plate to a Warden, and greys out what the class cannot wear). */
  function rewardsFor(p, id) {
    const q = QUESTS[id];
    if (!q) return null;
    const r = q.rewards || {};
    const cg = (C.classGear || {})[p.cls] || null;
    const view = (it) => {
      const def = (C.items || {})[it];
      if (!def) return { item: it, usable: true };
      const inst = rewardInstance(p, it, q);
      let usable = true;
      if (def.kind === 'weapon') { const wt = (inst && inst.weaponType) || def.weaponType; usable = !!(cg && cg.weapons.includes(Array.isArray(wt) ? wt[0] : wt)); }
      if (def.kind === 'armor' && def.slot !== 'trinket') {
        const at = (inst && inst.armorType) || def.armorType;
        const CAN = { plate: ['plate', 'mail', 'leather', 'cloth'], mail: ['mail', 'leather', 'cloth'], leather: ['leather', 'cloth'], cloth: ['cloth'] };
        usable = !!(cg && (CAN[cg.armor] || []).includes(at));
      }
      return { item: it, inst, usable, reqLevel: Math.max(1, ((inst && inst.ilvl) || def.level || 1) - 2) };
    };
    return { xp: Math.max(r.xp ? 1 : 0, Math.round((r.xp || 0) * questGapMult(p.level, q.level) * xpRate(Q.content.progression, p.level))), gold: r.gold || 0, items: (r.items || []).map(view), choice: (r.choice || []).map(view) };
  }

  function tracker(p) {
    ensure(p);
    return active(p).map((id) => {
      const q = QUESTS[id];
      const s = p.quests[id];
      // where (CONTRACTS 7.5): each row's circles ({ zone, x, y, r } px) for the map and minimap; `turnIn` is the npc to go
      // back to (drawn as the `?` once the quest is ready)
      return { quest: id, name: q.name, level: q.level, ready: s.state === 'ready',
        rows: q.objectives.map((o, i) => ({ label: o.label, cur: s.counts[i], need: need(o), done: s.counts[i] >= need(o), where: whereOf(o) })),
        turnIn: { npc: q.turnIn, name: ((C.npcs || {})[q.turnIn] || {}).name || q.turnIn, where: npcWhere(q.turnIn) } };
    });
  }

  return { accept, abandon, turnIn, interact, onKill, onBag: recountCollect, onMove, onDamaged, tick: step, spawnObjects,
    marker, status, needsItem, tracker, offersAt, canAccept, inArea, areaAt, ensureEscorts, ensureStoryNpcs, rewardsFor, whereOf, ambushSpots, bountiesToday };
}

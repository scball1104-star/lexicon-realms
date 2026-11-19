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
import { bagCount, bagAdd, bagRemove, bagFree } from './loot.js';
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
  const ORDER = C.questOrder || Object.keys(QUESTS);
  const tick = () => Q.state.tick;
  const emit = (ev) => Q.emit(ev);
  const ensure = (p) => { if (!p.quests) p.quests = {}; if (!p.questsDone) p.questsDone = []; if (!p.nodesUsed) p.nodesUsed = []; return p; };
  const done = (p, id) => ensure(p).questsDone.includes(id);
  const active = (p) => ORDER.filter((id) => ensure(p).quests[id]);

  // ---------------------------------------------------------------- status
  function status(p, id) {
    ensure(p);
    const q = QUESTS[id];
    if (!q) return 'locked';
    if (done(p, id)) return 'done';
    const s = p.quests[id];
    if (s) return s.state === 'ready' ? 'ready' : 'active';
    const req = q.requires || {};
    if ((req.quests || []).some((r) => !done(p, r))) return 'locked';
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
    p.questsDone.push(id);
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
    emit({ type: 'quest_dialog', id: p.id, npc, ent: t.id, offers: o.offers, turnins: o.turnins, progress: o.progress, soon: o.soon });
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
        if (o.kind === 'kill' && o.mob === mob.template && (!o.zone || o.zone === mob.zone)) setCount(p, id, i, p.quests[id].counts[i] + 1);
      });
      checkReady(p, id);
    }
  }

  function inArea(e, zoneId, areaId) {
    const z = C.zones[zoneId];
    const a = z && (z.areas || []).find((x) => x.id === areaId);
    if (!a || e.zone !== zoneId) return false;
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
    }
  }

  function pickNode(p, t) {
    const n = t.node;
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
      escort: { owner: p.id, quest: id, objective: i, following: false, ambushed: [] },
    });
    p.quests[id].escort = e.id;
  }

  function endEscort(p, id) {
    const s = p.quests && p.quests[id];
    if (!s || s.escort == null) return;
    const e = Q.get(s.escort);
    if (e) { e.dead = true; e.zone = '_gone'; e.escort = null; emit({ type: 'despawn', id: e.id, template: e.template, zone: e.zone }); }
    s.escort = null;
  }

  function tickEscort(e) {
    const E = e.escort;
    const p = Q.get(E.owner);
    const s = p && p.quests && p.quests[E.quest];
    if (!s) { e.dead = true; e.zone = '_gone'; e.escort = null; return; }
    const o = QUESTS[E.quest].objectives[E.objective];
    if (e.dead || e.hp <= 0) {                     // knocked out: she wakes at the start
      emit({ type: 'quest', id: p.id, quest: E.quest, kind: 'fail', objective: E.objective });
      startEscort(p, E.quest, E.objective, o);
      return;
    }
    if (p.zone !== e.zone) { e.moving = false; return; }
    const d = dist(e, p);
    if (!E.following && d <= 48) { E.following = true; emit({ type: 'quest', id: p.id, quest: E.quest, kind: 'progress', objective: E.objective, cur: 0, need: 1, escort: 'start' }); }
    if (E.following && d > 32) {
      const zone = C.zones[e.zone];
      const dx = p.x - e.x, dy = p.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const vx = Math.round((dx / len) * ESCORT_SPEED), vy = Math.round((dy / len) * ESCORT_SPEED);
      const mx = moveAxis(zone, e, vx, 'x', { noJoins: true }), my = moveAxis(zone, e, vy, 'y', { noJoins: true });
      e.moving = mx !== 0 || my !== 0;
      if (Math.abs(dx) > Math.abs(dy)) e.dir = dx < 0 ? 'left' : 'right'; else e.dir = dy < 0 ? 'up' : 'down';
      if (!e.moving && d > 96) {                   // stuck behind a corner: she catches up the way a follower does
        const [tx, ty] = feet(p);
        [e.x, e.y] = tileToSub(tx, ty);
      }
    } else e.moving = false;
    // ambushes
    (o.ambush || []).forEach((a, k) => {
      if (E.ambushed.includes(k)) return;
      const [ax, ay] = feet(e);
      if (Math.hypot(ax - a.at.x, ay - a.at.y) > a.at.r) return;
      E.ambushed.push(k);
      if (!Q.spawnMob) return;
      a.mobs.forEach((m, j) => {
        const mob = Q.spawnMob({ zone: e.zone, mob: m.mob, level: m.level, x: a.at.x + 4 + j, y: a.at.y - 3, temporary: true });
        if (mob) { mob.threat = mob.threat || {}; mob.threat[e.id] = 1; mob.target = e.id; if (mob.ai) mob.ai.mode = 'aggro'; }
      });
      emit({ type: 'quest', id: p.id, quest: E.quest, kind: 'progress', objective: E.objective, cur: 0, need: 1, escort: 'ambush' });
    });
    // home
    if (e.zone === o.to.zone) {
      const [tx, ty] = feet(e);
      if (Math.hypot(tx - o.to.x, ty - o.to.y) <= o.to.r) {
        setCount(p, E.quest, E.objective, 1);
        checkReady(p, E.quest);
        endEscort(p, E.quest);
      }
    }
  }

  // ---------------------------------------------------------------- the tick
  function step() {
    for (const e of Q.ents()) {
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

  function tracker(p) {
    ensure(p);
    return active(p).map((id) => {
      const q = QUESTS[id];
      const s = p.quests[id];
      return { quest: id, name: q.name, level: q.level, ready: s.state === 'ready',
        rows: q.objectives.map((o, i) => ({ label: o.label, cur: s.counts[i], need: need(o), done: s.counts[i] >= need(o) })) };
    });
  }

  return { accept, abandon, turnIn, interact, onKill, onBag: recountCollect, onMove, onDamaged, tick: step, spawnObjects,
    marker, status, needsItem, tracker, offersAt, canAccept, inArea, areaAt };
}

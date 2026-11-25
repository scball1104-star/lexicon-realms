// Group play rules (group play basics, 2026-11-22): foe scaling for a party, the rez, Release or Wait on death, quest
// sharing and the ready check. Pure: no clock, no Math.random. Numbers: content.party (src/data/party.js PARTY_RULES).
//
//   const GP = createParty(D)   D = { state, content, emit, get, C (the combat context), quests: () => QS, tileToSub }
//   GP.handles(t) / GP.command(e, cmd)   the commands below (a dead hero may send release, death_wait, ready_answer)
//   GP.tick()                    once per world step, after the entities
//   GP.onPlayerDeath(e)          progression.js: a hero in a party with a friend in the world waits instead of waking
//   GP.hudOf(e)                  the HUD block's `group` part (null for a hero with no party and nothing going on)
//   GP.scaleOf(m)                { n, hpMul, dmgMul } for a foe (tests, the HUD)
//   GP.onLeave(id)               a hero left the world: their rez, offers and ready answers go
//
// Commands
//   release                      a dead hero wakes at their lantern now
//   death_wait                   a dead hero stays where they fell (up to rez.waitSec) for a rez
//   rez { id, item? }            start the rez on a dead party member: the Mender's Rekindle, or (item: true, or a
//                                hero of another class) one lantern-ash. Out of combat, 10 s, standing still
//   rez_cancel                   stop your rez cast
//   ready_start                  any party member starts a ready check (30 s)
//   ready_answer { yes }         answer the open ready check
//   quest_share { quest }        offer a quest you have to every party member in reach who can take it
//   quest_share_accept { quest } / quest_share_decline { quest }
//
// Foe scaling (BUILDS_2 7.4): a foe whose threat list holds a party hero gets hp x (1 + 0.6 (n - 1)) and damage
// x (1 + 0.1 (n - 1)), n = that party's heroes alive in its zone within the kill-share reach (at most 4), never less than
// the heroes who entered its dungeon copy. n only grows during a fight; a boss keeps the n it was pulled with. The extra
// damage is a hidden aura (`party_scale`, mods damageDone) so combat.js needs no change. The foe drops back to its own
// numbers when the fight ends (evade, reset) and a respawn starts it fresh.
import { TICK_HZ } from './constants.js';
import { distPx } from './geom.js';
import { bagCount, bagRemove } from './loot.js';

const T = (sec) => Math.round((sec || 0) * TICK_HZ);
const SCALE_AURA = 'party_scale';
const CMDS = new Set(['release', 'death_wait', 'rez', 'rez_cancel', 'ready_start', 'ready_answer', 'quest_share', 'quest_share_accept', 'quest_share_decline']);
const DEAD_OK = new Set(['release', 'death_wait', 'ready_answer', 'quest_share_decline']);

export function createParty(D) {
  const { state, emit, get } = D;
  const C = D.C;
  const R = D.content.party;
  const now = () => state.tick;
  const QS = () => (D.quests ? D.quests() : null);

  const members = (e) => (e && e.party != null ? state.ents.filter((p) => p.kind === 'player' && p.party === e.party) : e ? [e] : []);
  const friends = (e) => members(e).filter((p) => p !== e);
  const fail = (e, cmd, reason, extra = {}) => { emit({ type: 'group_fail', id: e.id, cmd: cmd.t, reason, ...extra }); return false; };

  // ------------------------------------------------------------------------------------------------ foe scaling
  function heroesFor(m) {
    let n = 1;
    const seen = new Set();
    for (const k of Object.keys(m.threat || {})) {
      const p = get(Number(k));
      if (!p || p.kind !== 'player' || p.party == null || seen.has(p.party)) continue;
      seen.add(p.party);
      let c = 0;
      for (const q of state.ents) if (q.kind === 'player' && q.party === p.party && !q.dead && q.zone === m.zone && distPx(q, m) <= R.scale.reachPx) c++;
      if (c > n) n = c;
    }
    const copy = m.spawn && m.spawn.copy ? (state.copies || {})[m.spawn.copy] : null;
    // wave 10 dflow (Scott 2026-11-25): the heroes in the copy plus a dropped friend's seat for seatSec, never fewer than
    // the heroes present (a copy saved before seats counts everyone who entered, as before)
    const seated = copy ? (copy.seats ? seatsOf(copy).length : (copy.heroes || []).length) : 0;
    if (seated > n) n = seated;
    return Math.min(R.scale.maxHeroes, n);
  }
  /** wave 10 dflow: the seats of a copy that still count: heroes inside now, and friends who left less than seatSec ago. */
  function seatsOf(copy) {
    const keep = T(R.seatSec != null ? R.seatSec : 300);
    return Object.keys(copy.seats || {}).filter((id) => now() - copy.seats[id] <= keep);
  }
  const hpMulOf = (n) => 1 + R.scale.hpPerHero * (n - 1);
  const dmgMulOf = (n) => 1 + R.scale.dmgPerHero * (n - 1);
  function setScale(m, n) {
    const g = m.gscale;
    const old = g ? g.n : 1;
    if (n <= old) return;
    const base = g ? g.base : m.hpMax;
    const frac = m.hpMax > 0 ? m.hp / m.hpMax : 1;
    m.hpMax = Math.round(base * hpMulOf(n));
    m.hp = Math.max(1, Math.min(m.hpMax, Math.round(frac * m.hpMax)));
    m.gscale = { n, base };
    const def = { id: SCALE_AURA, name: 'Many foes, many heroes', icon: 'icon_fury', kind: 'buff', flags: ['hidden'], mods: [{ stat: 'damageDone', mul: dmgMulOf(n) }] };
    const a = m.auras.find((x) => x.id === SCALE_AURA);
    if (a) a.def = def;
    else m.auras.push({ id: SCALE_AURA, src: m.id, ab: null, stacks: 1, startTick: now(), until: null, nextTick: null, absorb: 0, data: {}, def });
    emit({ type: 'group_scale', mob: m.id, n, hpMax: m.hpMax });
  }
  function clearScale(m) {
    const g = m.gscale;
    delete m.gscale;
    const i = m.auras.findIndex((x) => x.id === SCALE_AURA);
    if (i >= 0) m.auras.splice(i, 1);
    if (m.dead || !g) return;
    const frac = m.hpMax > 0 ? m.hp / m.hpMax : 1;
    m.hpMax = g.base;
    m.hp = Math.max(1, Math.min(m.hpMax, Math.round(frac * m.hpMax)));
  }
  function tickScale() {
    // heroes inside a dungeon copy are counted for its foes (bosses scale by the party that entered)
    if (state.copies) {
      for (const p of state.ents) {
        if (p.kind !== 'player') continue;
        const c = state.copies[p.zone];
        if (c && !(c.heroes || []).includes(p.id)) c.heroes = [...(c.heroes || []), p.id];
        if (c) { (c.seats = c.seats || {})[p.id] = now(); (c.seatNames = c.seatNames || {})[p.id] = p.name; }   // wave 10 dflow
      }
    }
    for (const m of state.ents) {
      if (m.kind !== 'mob' || !m.ai) continue;
      const fighting = !m.dead && (m.ai.mode === 'combat' || m.ai.mode === 'flee');
      if (!fighting) { if (m.gscale) clearScale(m); continue; }
      if (m.gscale && m.gscale.locked) continue;
      const n = heroesFor(m);
      if (n > 1) setScale(m, n);
      const t = (D.content.mobs || {})[m.template] || {};
      if (t.boss && m.spawn && m.spawn.copy) { if (m.gscale) m.gscale.locked = true; else m.gscale = { n: 1, base: m.hpMax, locked: true }; }
    }
  }
  function scaleOf(m) { const n = (m && m.gscale && m.gscale.n) || 1; return { n, hpMul: hpMulOf(n), dmgMul: dmgMulOf(n) }; }

  // ------------------------------------------------------------------------------------------------ death: release or wait
  function onPlayerDeath(e) {
    if (e.party == null || !friends(e).length) return;           // solo (or alone in the room): wake at the lantern as always
    e.respawnAt = null;
    e.deathWait = { until: now() + T(R.death.waitSec), choice: null };
    emit({ type: 'death_wait', id: e.id, kind: 'start', left: R.death.waitSec });
  }
  function wake(e) { e.deathWait = null; C.prog.respawn(e); }
  function tickDeath(e) {
    if (!e.deathWait) return;
    if (!e.dead) { e.deathWait = null; return; }
    if (now() >= e.deathWait.until) { emit({ type: 'death_wait', id: e.id, kind: 'expired' }); wake(e); return; }
    // the friends all left: wake at the lantern after the usual short delay
    if (!friends(e).length) { e.deathWait = null; e.respawnAt = now() + T((C.P.death && C.P.death.respawnDelay) || 3); }
  }

  // ------------------------------------------------------------------------------------------------ the rez
  const canSpell = (e) => (R.rez.classes || []).includes(e.cls);
  function rezStart(e, cmd) {
    if (e.rezCast) return fail(e, cmd, 'busy');
    const t = get(cmd.id);
    if (!t || t.kind !== 'player' || t === e) return fail(e, cmd, 'bad_target');
    if (e.party == null || t.party !== e.party) return fail(e, cmd, 'not_party');
    if (!t.dead) return fail(e, cmd, 'not_dead');
    if (t.zone !== e.zone || distPx(e, t) > R.rez.rangePx) return fail(e, cmd, 'range');
    if (e.inCombat) return fail(e, cmd, 'combat');
    if (e.cast) return fail(e, cmd, 'busy');
    if (state.ents.some((p) => p.kind === 'player' && p.rezCast && p.rezCast.target === t.id)) return fail(e, cmd, 'taken');
    const item = !!cmd.item || !canSpell(e);
    if (item && bagCount(e, R.rez.item) < 1) return fail(e, cmd, 'no_item', { item: R.rez.item });
    e.mx = 0; e.my = 0; e.sitting = 0;
    e.rezCast = { target: t.id, startTick: now(), endTick: now() + T(R.rez.castSec), item };
    emit({ type: 'rez', kind: 'start', src: e.id, id: t.id, item, sec: R.rez.castSec });
    return true;
  }
  function rezStop(e, reason) {
    const rc = e.rezCast;
    if (!rc) return;
    e.rezCast = null;
    emit({ type: 'rez', kind: 'stop', src: e.id, id: rc.target, reason });
  }
  function revive(t, by, item) {
    t.dead = false; t.respawnAt = null; t.deathWait = null;
    t.hp = Math.max(1, Math.round(t.hpMax * R.rez.hpPct));
    if (t.res) t.res.cur = t.res.kind === 'resolve' ? 0 : t.res.kind === 'mana' ? Math.round(t.res.max * R.rez.resPct) : t.res.max;
    t.cast = null; t.forced = null; t.autoOn = false; t.mx = 0; t.my = 0;
    t.lastCombat = -99999; t.inCombat = false; t.combatEnd = now();
    emit({ type: 'rez', kind: 'done', src: by.id, id: t.id, item, hp: t.hp });
  }
  function tickRez(e) {
    const rc = e.rezCast;
    if (!rc) return;
    const t = get(rc.target);
    if (e.dead) return rezStop(e, 'dead');
    if (!t || !t.dead || t.zone !== e.zone || distPx(e, t) > R.rez.rangePx + 32) return rezStop(e, 'target');
    if (e.inCombat) return rezStop(e, 'combat');
    if (e.moving || e.mx || e.my) return rezStop(e, 'move');
    if (e.cast) return rezStop(e, 'cast');
    if (now() < rc.endTick) return;
    if (rc.item) { if (bagCount(e, R.rez.item) < 1) return rezStop(e, 'no_item'); bagRemove(e, R.rez.item, 1); emit({ type: 'inventory', id: e.id, kind: 'use', item: R.rez.item }); }
    e.rezCast = null;
    revive(t, e, rc.item);
  }

  // ------------------------------------------------------------------------------------------------ ready check
  const checks = () => (state.ready = state.ready || {});
  function readyStart(e, cmd) {
    if (e.party == null || !friends(e).length) return fail(e, cmd, 'no_party');
    const cur = checks()[e.party];
    if (cur && !cur.done) return fail(e, cmd, 'busy');
    const answers = {};
    for (const p of members(e)) answers[p.id] = p === e ? true : null;
    const boss = C.delve ? C.delve.nextBoss(e) : null;            // wave 10 dflow: inside a copy the check names the next boss
    checks()[e.party] = { by: e.id, startTick: now(), until: now() + T(R.readyCheck.sec), answers, done: false, closeAt: null, ...(boss ? { boss } : {}) };
    for (const p of members(e)) emit({ type: 'ready_check', id: p.id, kind: 'start', by: e.id });
    return true;
  }
  function readyFinish(party, rc) {
    rc.done = true; rc.closeAt = now() + T(R.readyCheck.closeSec);
    for (const k of Object.keys(rc.answers)) if (rc.answers[k] == null) rc.answers[k] = false;
    const allYes = Object.values(rc.answers).every((v) => v === true);
    for (const k of Object.keys(rc.answers)) emit({ type: 'ready_check', id: Number(k), kind: 'done', allYes, by: rc.by });
  }
  function readyAnswer(e, cmd) {
    const rc = e.party != null ? checks()[e.party] : null;
    if (!rc || rc.done || !(String(e.id) in rc.answers)) return fail(e, cmd, 'no_check');
    rc.answers[e.id] = !!cmd.yes;
    for (const k of Object.keys(rc.answers)) emit({ type: 'ready_check', id: Number(k), kind: 'answer', who: e.id, yes: !!cmd.yes });
    if (Object.values(rc.answers).every((v) => v != null)) readyFinish(e.party, rc);
    return true;
  }
  function tickReady() {
    if (!state.ready) return;
    for (const [party, rc] of Object.entries(state.ready)) {
      if (!rc.done && now() >= rc.until) readyFinish(party, rc);
      else if (rc.done && now() >= rc.closeAt) delete state.ready[party];
    }
    if (!Object.keys(state.ready).length) delete state.ready;
  }

  // ------------------------------------------------------------------------------------------------ quest sharing
  function shareable(q) { return !!q && !(q.objectives || []).some((o) => o.kind === 'escort') && !q.noShare; }
  function share(e, cmd) {
    const qs = QS();
    const q = qs && (D.content.quests || {})[cmd.quest];
    if (!q || !e.quests || !e.quests[cmd.quest]) return fail(e, cmd, 'not_active', { quest: cmd.quest });
    if (!shareable(q)) return fail(e, cmd, 'no_share', { quest: cmd.quest });
    const results = [];
    for (const m of friends(e)) {
      let reason = null;
      if (m.dead) reason = 'dead';
      else if (m.zone !== e.zone || distPx(m, e) > R.share.rangePx) reason = 'range';
      else reason = qs.canAccept(m, cmd.quest);
      if (!reason && (m.shareOffers || []).some((o) => o.quest === cmd.quest)) reason = 'offered';
      if (!reason) {
        m.shareOffers = [...(m.shareOffers || []), { quest: cmd.quest, from: e.id, until: now() + T(R.share.offerSec) }];
        emit({ type: 'quest_share', id: m.id, kind: 'offer', quest: cmd.quest, from: e.id });
      }
      results.push({ id: m.id, name: m.name, ok: !reason, reason });
    }
    emit({ type: 'quest_share', id: e.id, kind: 'sent', quest: cmd.quest, results });
    return true;
  }
  function shareAnswer(e, cmd, yes) {
    const list = e.shareOffers || [];
    const i = list.findIndex((o) => o.quest === cmd.quest);
    if (i < 0) return fail(e, cmd, 'no_offer', { quest: cmd.quest });
    const [o] = list.splice(i, 1);
    if (!list.length) delete e.shareOffers;
    if (!yes) return true;
    const ok = QS().accept(e, cmd.quest);
    const from = get(o.from);
    if (from && ok) emit({ type: 'quest_share', id: from.id, kind: 'accepted', quest: cmd.quest, by: e.id });
    return ok;
  }
  function tickShares(e) {
    if (!e.shareOffers) return;
    e.shareOffers = e.shareOffers.filter((o) => o.until > now());
    if (!e.shareOffers.length) delete e.shareOffers;
  }

  // ------------------------------------------------------------------------------------------------ commands, tick, HUD
  function command(e, cmd) {
    if (e.dead && !DEAD_OK.has(cmd.t)) return fail(e, cmd, 'dead');
    switch (cmd.t) {
      case 'release': if (!e.dead) return fail(e, cmd, 'not_dead'); emit({ type: 'death_wait', id: e.id, kind: 'release' }); wake(e); return true;
      case 'death_wait': if (!e.dead || !e.deathWait) return fail(e, cmd, 'not_dead'); e.deathWait.choice = 'wait'; return true;
      case 'rez': return rezStart(e, cmd);
      case 'rez_cancel': rezStop(e, 'cancel'); return true;
      case 'ready_start': return readyStart(e, cmd);
      case 'ready_answer': return readyAnswer(e, cmd);
      case 'quest_share': return share(e, cmd);
      case 'quest_share_accept': return shareAnswer(e, cmd, true);
      case 'quest_share_decline': return shareAnswer(e, cmd, false);
      default: return false;
    }
  }
  function tick() {
    tickScale();
    for (const e of state.ents) {
      if (e.kind !== 'player') continue;
      if (e.deathWait) tickDeath(e);
      if (e.rezCast) tickRez(e);
      if (e.shareOffers && (now() + e.id) % 20 === 0) tickShares(e);
    }
    tickReady();
  }
  function onLeave(id) {
    for (const p of state.ents) {
      if (p.kind !== 'player') continue;
      if (p.rezCast && (p.id === id || p.rezCast.target === id)) p.rezCast = null;
      if (p.shareOffers) { p.shareOffers = p.shareOffers.filter((o) => o.from !== id); if (!p.shareOffers.length) delete p.shareOffers; }
    }
    for (const rc of Object.values(state.ready || {})) if (String(id) in rc.answers) delete rc.answers[id];
  }

  const sec = (t) => Math.round(Math.max(0, t) / TICK_HZ * 100) / 100;
  function hudOf(e) {
    const fr = friends(e);
    const rc = e.party != null && state.ready ? state.ready[e.party] : null;
    // wave 10 dflow: friends who dropped out of this copy and still hold a seat: { name, left } (seconds)
    const cp = state.copies ? state.copies[e.zone] : null;
    const seats = cp && cp.seats ? seatsOf(cp).filter((id) => !state.ents.some((p) => p.kind === 'player' && String(p.id) === id && p.zone === e.zone))
      .map((id) => ({ id: Number(id), name: (cp.seatNames || {})[id] || '?', left: sec(cp.seats[id] + T(R.seatSec != null ? R.seatSec : 300) - now()) })) : [];
    if (!fr.length && !rc && !e.deathWait && !e.rezCast && !e.shareOffers && !seats.length) return null;
    const rezOn = (id) => state.ents.find((p) => p.kind === 'player' && p.rezCast && p.rezCast.target === id) || null;
    const party = fr.map((p) => {
      const by = p.dead ? rezOn(p.id) : null;
      return { id: p.id, far: p.zone !== e.zone || distPx(p, e) > R.scale.reachPx, dead: !!p.dead, waiting: !!p.deathWait,
        name: p.name, cls: p.cls, level: p.level, ...(p.sync ? { sync: { from: p.sync.from, to: p.sync.to, kind: p.sync.kind } } : {}),   // wave 10 dflow: the door card
        ...(by ? { rezBy: by.id, rezLeft: sec(by.rezCast.endTick - now()) } : {}) };
    });
    let death = null;
    if (e.dead && e.deathWait) {
      const by = rezOn(e.id);
      death = { waitLeft: sec(e.deathWait.until - now()), choice: e.deathWait.choice,
        rez: by ? { by: by.id, name: by.name, spell: by.rezCast.item ? 'Lantern-ash' : R.rez.spell, left: sec(by.rezCast.endTick - now()), total: R.rez.castSec } : null };
    }
    const ready = rc ? {
      by: rc.by, byName: (get(rc.by) || {}).name || '', left: sec(rc.until - now()), done: rc.done, boss: rc.boss || null,   // wave 10 dflow: boss
      allYes: rc.done && Object.values(rc.answers).every((v) => v === true), mine: rc.answers[e.id] ?? null,
      answers: Object.entries(rc.answers).map(([k, v]) => { const q = get(Number(k)) || {}; return { id: Number(k), name: q.name || '?', answer: v, level: q.level || null, ...(q.sync ? { sync: q.sync.kind, from: q.sync.from } : {}) }; }),   // wave 10 dflow: level here
    } : null;
    const shares = (e.shareOffers || []).map((o) => ({ quest: o.quest, name: ((D.content.quests || {})[o.quest] || {}).name || o.quest, from: o.from,
      fromName: (get(o.from) || {}).name || '', left: sec(o.until - now()) })).reverse();
    const rz = e.rezCast;
    const rezCast = rz ? { target: rz.target, name: (get(rz.target) || {}).name || '', spell: rz.item ? 'Lantern-ash' : R.rez.spell, left: sec(rz.endTick - now()),
      total: R.rez.castSec, frac: Math.min(1, (now() - rz.startTick) / Math.max(1, rz.endTick - rz.startTick)) } : null;
    return { party, death, ready, shares, rezCast, canRez: canSpell(e) && !e.dead, ash: bagCount(e, R.rez.item), inParty: fr.length > 0, ...(seats.length ? { seats } : {}) };
  }

  return { handles: (t) => CMDS.has(t), command, tick, onPlayerDeath, hudOf, scaleOf, onLeave };
}

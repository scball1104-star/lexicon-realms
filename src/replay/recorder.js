// The replay recorder (wave 8, replay lane; BRIEF.md "What it is"). Records fights on this device from the world's own
// replay log: the full state at the pull, then every command and system action in the order the client made them.
//
//   const rec = createRecorder({ world, content, heroId, isGuest, build, onSaved, note })
//   rec.toggle()          the record key: start recording this fight now, or stop and keep it
//   rec.active            null, or { kind, title, startTick } of the recording in progress
//   rec.devTouch(dev)     ?dev=1 helpers write the world directly: one used mid-recording drops that recording
//
// What starts one by itself: a boss or a rare (content.mobs[t].boss / .rare, content.rares) with a hero on its threat
// list. It ends 5 s after the kill or after the fight resets (a wipe), or at 15 minutes. Only the world that runs the sim
// records (solo or a co-op host); a guest gets frames, not commands. The recorder wraps the world's own calls (enqueue,
// addPlayer, removePlayer, setParty, setDay, setShared, step), so nothing else needs to remember to log; it never
// changes what they do.
import { placeAt } from '../data/maps/compose.js';
import { REPLAY_V, KIND, CHECK_EVERY, TAIL_TICKS, MAX_TICKS, HZ, checkHash } from './format.js';

const TILE_SUB = 256;
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

export function createRecorder({ world: w, content, heroId, isGuest = () => false, build = () => null, onSaved = () => {}, note = () => {} }) {
  const mobs = content.mobs || {}, rares = content.rares || {};
  const special = (t) => { const m = mobs[t] || {}; return m.boss ? 'boss' : m.rare || rares[t] ? 'rare' : null; };
  let cur = null, wantManual = false;
  const op = (...o) => { if (cur) cur.ops.push([w.tick, ...o.map(clone)]); };

  // ---- the world's own calls, logged while a recording runs (each returns what the world returned)
  const orig = {};
  for (const k of ['enqueue', 'addPlayer', 'removePlayer', 'setParty', 'setDay', 'setShared', 'step']) orig[k] = w[k].bind(w);
  w.enqueue = (id, cmd) => { op('c', id, cmd); return orig.enqueue(id, cmd); };
  w.addPlayer = (spec) => { op('j', spec); return orig.addPlayer(spec); };
  w.removePlayer = (id) => { op('l', id); return orig.removePlayer(id); };
  w.setParty = (id, party) => { op('p', id, party); return orig.setParty(id, party); };
  w.setDay = (day) => { op('d', day); return orig.setDay(day); };
  w.setShared = (obj) => { op('s', obj); return orig.setShared(obj); };
  w.step = () => { const ev = orig.step(); try { afterStep(ev); } catch (e) { cur = null; console.warn('replay recorder', e); } return ev; };

  const onThreat = (m) => { if (!m.threat) return false; for (const k of Object.keys(m.threat)) { const p = w.get(Number(k)); if (p && p.kind === 'player') return true; } return false; };
  function placeName(e) {
    const z = content.zones[e.zone];
    const p = z ? placeAt(z, Math.floor(e.x / TILE_SUB), Math.floor((e.y - 1) / TILE_SUB)) : null;
    return (p && p.name) || (content.zoneNames || {})[e.zone] || e.zone;
  }

  function start(kind, boss) {
    const me = w.get(heroId());
    if (!me) return;
    cur = { kind, bossId: boss ? boss.id : null, title: boss ? boss.name : null, startTick: w.tick, start: w.serialize(), ops: [], h: [],
      place: placeName(me), heroId: me.id, killAt: null, endAt: null, fought: false, quietFor: 0 };
  }

  function finish() {
    const c = cur; cur = null;
    const len = w.tick - c.startTick;
    if (len < 20) return;                         // under a second: nothing worth keeping
    const players = w.state.ents.filter((e) => e.kind === 'player');
    const me = w.get(c.heroId) || players[0];
    const who = (e) => ({ id: e.id, name: e.name, cls: e.cls, level: e.level });
    const result = c.killAt != null ? 'kill' : c.kind === 'fight' ? 'fight' : 'wipe';
    const meta = { id: `r${Date.now().toString(36)}${(c.startTick % 1296).toString(36)}`, when: Date.now(), kind: c.kind, bossId: c.bossId,
      title: c.title || 'A fight', place: c.place, hero: me ? who(me) : { id: c.heroId, name: '?', cls: '', level: 0 }, heroes: players.map(who),
      result, secs: Math.round(len / HZ), killAt: c.killAt != null ? Math.round((c.killAt - c.startTick) / HZ) : null, friend: false };
    const file = { v: REPLAY_V, kind: KIND, build: build() || 'local', stateV: w.state.v, meta, startTick: c.startTick, len,
      start: c.start, ops: c.ops, check: { every: CHECK_EVERY, h: c.h } };
    onSaved(file);
  }

  function afterStep() {
    if (isGuest()) { cur = null; wantManual = false; return; }
    if (wantManual && !cur) { wantManual = false; start('fight', null); return; }
    if (cur) {
      const k = w.tick - cur.startTick;
      if (k % CHECK_EVERY === 0) cur.h.push(checkHash(w.state, cur.bossId));
      const me = w.get(cur.heroId);
      if (!me) { cur.endAt = cur.endAt ?? w.tick; }
      if (cur.bossId != null) {
        const b = w.get(cur.bossId);
        if (b && b.dead && cur.killAt == null) { cur.killAt = w.tick; cur.endAt = w.tick + TAIL_TICKS; }
        if (cur.killAt == null) {
          const on = !!b && !b.dead && onThreat(b);
          if (cur.endAt == null && !on) cur.endAt = w.tick + TAIL_TICKS;   // the fight reset: a wipe
          else if (cur.endAt != null && on && b) cur.endAt = null;          // a moment off the threat list (a vanish) is not the end
        }
      } else if (me) {
        if (me.inCombat) { cur.fought = true; cur.quietFor = 0; } else cur.quietFor++;
        if (cur.endAt == null && ((cur.fought && cur.quietFor >= TAIL_TICKS) || (!cur.fought && k >= 60 * HZ))) cur.endAt = w.tick;
      }
      if ((cur.endAt != null && w.tick >= cur.endAt) || k >= MAX_TICKS) finish();
      return;
    }
    if (heroId() == null) return;
    for (const m of w.state.ents) {
      if (m.kind !== 'mob' || m.dead || !m.threat) continue;
      const kind = special(m.template);
      if (kind && onThreat(m)) { start(kind, m); return; }
    }
  }

  return {
    get active() { return cur ? { kind: cur.kind, title: cur.title, startTick: cur.startTick, secs: Math.round((w.tick - cur.startTick) / HZ) } : wantManual ? { kind: 'fight', title: null, startTick: w.tick, secs: 0 } : null; },
    /** The record key. Returns 'start' or 'stop' (or null when this world cannot record). */
    toggle() {
      if (isGuest() || heroId() == null) return null;
      if (cur) { if (cur.endAt == null) cur.endAt = w.tick; finish(); return 'stop'; }
      wantManual = !wantManual;
      return wantManual ? 'start' : 'stop';
    },
    /** Drop the recording in progress (a dev helper wrote the world directly). */
    abort() { if (cur) note('dev'); cur = null; wantManual = false; },
    devTouch(dev) {
      if (!dev) return;
      for (const k of Object.keys(dev)) { const f = dev[k]; if (typeof f === 'function') dev[k] = (...a) => { if (cur) { cur = null; note('dev'); } return f(...a); }; }
    },
  };
}

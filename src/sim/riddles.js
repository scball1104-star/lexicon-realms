// Riddles friends write (wave 9 riddles; D:/LQOnline/wave9/riddles/BRIEF.md, approved 2026-11-25). The sim side. Pure:
// imports only from src/sim/. The link code and its rules are in src/sim/riddle.js; data in src/data/riddle_words.js
// (content.riddleRules, content.riddleBlocked). CONTRACTS section "Riddles".
//
//   const RD = createRiddles(X)   X = { state, content, emit, get, add, remove, nextId, tileToSub, distPx }
//   RD.handles(t) / RD.command(e, cmd)
//   RD.interact(e, t)              a hero touches a riddle stone: the stone panel opens on that client (an event, no state)
//   RD.publicOf(e)                 the snapshot view: a stone's public part (never an answer), a hero's solved count
//   RD.saveOf(e) / RD.restore(e, spec)   the hero's "riddles solved" count (save `riddles`, missing = 0)
//
// Commands (the whole trail rides in the command, so the command log and replays carry it exactly)
//   riddle_add { code, keys? }     put a trail out in this world. keys = the words already solved on this device: each
//                                  must open the next part, or the walk stops there. In co-op only the host sends it
//                                  (src/net/session.js refuses it from a guest; a guest offers the code instead)
//   riddle_guess { rid, word }     spell a word at the trail's current stone (stand within reach)
//   riddle_remove { rid }          take a trail down (the riddle book's "Take it down")
// A wrong word: the stone is quiet for wrongQuietSec, the count goes up, the author's hint shows after hintAfter. A right
// word: the stone goes and the next one rises where the author set it; after the last, the author's closing line and
// +1 "riddles solved" for every hero standing there who is not the author. No loot, no xp, no gold (Scott, 2026-11-25).
//
// Determinism: no rng at all. Stone places are tile numbers in the code, the id is a hash of the code, the quiet time is
// in ticks. state.riddles exists only once a trail was added, so a world without riddles hashes exactly as before.
import { createRiddleRules } from './riddle.js';

const TICK_HZ = 20;
const CMDS = new Set(['riddle_add', 'riddle_guess', 'riddle_remove']);

export function createRiddles(X) {
  const { state, content, emit, get } = X;
  const R = content.riddleRules;
  const RB = createRiddleRules(R, content.riddleBlocked || []);
  const cache = new Map();                    // rid -> the unpacked code (rebuilt from state on demand)
  const now = () => state.tick;
  const fail = (e, cmd, reason, extra = {}) => { emit({ type: 'riddle_fail', id: e.id, cmd: cmd.t, reason, ...extra }); return false; };
  const list = () => (state.riddles ? state.riddles.list : {});
  function unpacked(r) {
    let u = cache.get(r.rid);
    if (!u) { u = RB.unpack(r.code); cache.set(r.rid, u); }
    return u;
  }
  const where = (s) => ({ zone: s.z, x: s.x, y: s.y });

  function spawnStone(r) {
    const s = r.cur;
    const [x, y] = X.tileToSub(s.x, s.y);
    const ent = X.add({ id: X.nextId(), kind: 'object', zone: s.z, x, y, dir: 'down', moving: false, name: 'Riddle stone', level: 1, faction: 'neutral',
      sprite: 'riddle_stone', template: 'riddle_stone', hp: 1, hpMax: 1, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
      rstone: { rid: r.rid } });
    r.stone = ent.id;
    if (now() > 0) emit({ type: 'spawn', id: ent.id, template: 'riddle_stone', zone: s.z, kind: 'object' });
  }
  function dropStone(r) {
    const t = r.stone != null ? get(r.stone) : null;
    if (t) { X.remove(t); emit({ type: 'despawn', id: t.id, template: t.template, zone: t.zone, kind: 'object' }); }
    r.stone = null;
  }

  function addTrail(e, cmd) {
    const code = String(cmd.code || '');
    const u = RB.unpack(code);
    if (u.error) return fail(e, cmd, 'bad_link', { why: u.error });
    if (u.flagged) return fail(e, cmd, 'words');
    if (list()[u.id]) return fail(e, cmd, 'have', { rid: u.id });
    if (Object.keys(list()).length >= (R.maxActive || 3)) return fail(e, cmd, 'full');
    let cur = u.first, k = 0;
    const keys = [];
    for (const w of Array.isArray(cmd.keys) ? cmd.keys.slice(0, u.n) : []) {
      const res = RB.tryWord(u, k, w);
      if (!res.ok) break;
      if (!res.stone) return fail(e, cmd, 'done', { rid: u.id });   // every stone solved already: nothing to put out
      keys.push(String(w).toUpperCase()); cur = res.stone; k++;
    }
    if (!content.zones[cur.z]) return fail(e, cmd, 'zone');
    if (!state.riddles) state.riddles = { list: {} };
    const r = { rid: u.id, code, by: u.by, title: u.title, n: u.n, k, keys, cur, tries: 0, quietUntil: 0, stone: null, addedBy: e.id };
    state.riddles.list[u.id] = r;
    cache.set(u.id, u);
    spawnStone(r);
    emit({ type: 'riddle', kind: 'added', id: e.id, rid: r.rid, k, n: r.n, title: r.title, by: r.by, at: where(cur) });
    return true;
  }

  function guess(e, cmd) {
    const r = list()[cmd.rid];
    if (!r) return fail(e, cmd, 'no_riddle');
    const t = r.stone != null ? get(r.stone) : null;
    if (!t || t.zone !== e.zone || X.distPx(e, t) > (R.reachPx || 80)) return fail(e, cmd, 'range');
    if (now() < r.quietUntil) return fail(e, cmd, 'quiet');
    const u = unpacked(r);
    const w = String(cmd.word || '').toUpperCase().slice(0, R.answerMax || 8);
    const res = u.error ? { ok: false } : RB.tryWord(u, r.k, w);
    if (!res.ok) {
      r.tries++;
      r.quietUntil = now() + Math.round((R.wrongQuietSec || 4) * TICK_HZ);
      emit({ type: 'riddle', kind: 'wrong', id: e.id, rid: r.rid, k: r.k, spelled: w, tries: r.tries });
      return true;
    }
    const at = { zone: t.zone, x: t.x, y: t.y };
    r.keys.push(w); r.tries = 0; r.quietUntil = 0;
    dropStone(r);
    if (res.stone) {
      r.k++; r.cur = res.stone;
      spawnStone(r);
      emit({ type: 'riddle', kind: 'right', id: e.id, rid: r.rid, k: r.k, n: r.n, word: w, keys: [...r.keys], next: where(r.cur) });
      return true;
    }
    // the last stone: the author's closing line, and +1 for every hero standing there who is not the author
    const reach = (R.creditTiles || 12) * 16;
    const solvers = state.ents.filter((p) => p.kind === 'player' && p.zone === at.zone && Math.hypot(p.x - at.x, p.y - at.y) / 16 <= reach && p.name !== r.by);
    for (const p of solvers) p.riddlesSolved = Math.min(1e6, (p.riddlesSolved | 0) + 1);
    delete state.riddles.list[r.rid];
    cache.delete(r.rid);
    emit({ type: 'riddle', kind: 'done', id: e.id, rid: r.rid, n: r.n, word: w, keys: [...r.keys], by: r.by, title: r.title, end: res.end, solvers: solvers.map((p) => p.id) });
    return true;
  }

  function removeTrail(e, cmd) {
    const r = list()[cmd.rid];
    if (!r) return fail(e, cmd, 'no_riddle');
    dropStone(r);
    delete state.riddles.list[r.rid];
    cache.delete(r.rid);
    emit({ type: 'riddle', kind: 'removed', id: e.id, rid: r.rid });
    return true;
  }

  function interact(e, t) {
    if (!t.rstone || !list()[t.rstone.rid]) return false;
    emit({ type: 'riddle', kind: 'look', id: e.id, rid: t.rstone.rid, stone: t.id });
    return true;
  }

  function publicOf(e) {
    if (e.kind === 'player') return e.riddlesSolved ? { riddles: e.riddlesSolved } : null;
    if (!e.rstone) return null;
    const r = list()[e.rstone.rid];
    if (!r) return null;
    const u = unpacked(r);
    const line = (s) => (s == null || RB.check(s) ? null : s);      // a line that fails the word check shows as hidden
    return { rstone: {
      rid: r.rid, title: r.title, by: r.by, k: r.k, n: r.n, len: u.lens ? u.lens[r.k] : 0, tries: r.tries,
      quiet: now() < r.quietUntil ? r.quietUntil : 0,
      clue: (r.cur.c || []).map(line), hint: r.cur.h && r.tries >= (R.hintAfter || 2) ? line(r.cur.h) : null,
      hasHint: !!r.cur.h,
    } };
  }

  return {
    handles: (t) => CMDS.has(t),
    command: (e, cmd) => (cmd.t === 'riddle_add' ? addTrail(e, cmd) : cmd.t === 'riddle_guess' ? guess(e, cmd) : cmd.t === 'riddle_remove' ? removeTrail(e, cmd) : false),
    interact, publicOf,
    saveOf: (e) => (e.riddlesSolved ? { riddles: e.riddlesSolved | 0 } : {}),
    restore: (e, spec) => { const n = Number(spec && spec.riddles); if (Number.isFinite(n) && n > 0) e.riddlesSolved = Math.min(1e6, Math.floor(n)); },
    active: () => Object.values(list()).map((r) => ({ rid: r.rid, k: r.k, n: r.n, stone: r.stone })),
  };
}

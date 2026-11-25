// Replay playback (wave 8, replay lane). Rebuilds a recorded fight in its own world with the real sim, or plays a baked
// ("Keep forever") one from its frames. Pure: no DOM; node tests run it. The live world is never touched.
//
//   const P = await openPlayer(file, content, { onProgress })   first pass: keyframes, the timeline tracks, the checks
//   P.N                     ticks in the recording; P.okTo: the last tick that still matches this build (N when all do)
//   P.seek(k) -> { prev, snap, events }    the fight at tick k (a keyframe, then forward); events of the last tick
//   P.heroId, P.bossId, P.track [{ b, h }], P.marks [{ k, kind }], P.checks { ok, bad, firstBad }
//   await bake(file, content) -> a baked file (frames as a co-op guest would get them), or throws when it no longer matches
import { restoreWorld } from '../sim/world.js';
import { framesFor, createFrameState, applyFrame, createTickCache } from '../net/frames.js';
import { CHECK_EVERY, checkHash } from './format.js';

const KEY_EVERY = 100;            // keyframes for seeking: a jump steps at most 99 ticks
const CHUNK = 200;                // ticks per slice of the first pass (the page stays live)
const tickYield = () => new Promise((r) => setTimeout(r, 0));

/** Apply every op made at world.tick (before the next step), in the order the client made them. */
function applyOps(w, ops, i) {
  while (i < ops.length && ops[i][0] < w.tick) i++;
  while (i < ops.length && ops[i][0] === w.tick) {
    const o = ops[i++];
    if (o[1] === 'c') w.enqueue(o[2], o[3]);
    else if (o[1] === 'j') w.addPlayer(o[2]);
    else if (o[1] === 'l') w.removePlayer(o[2]);
    else if (o[1] === 'p') w.setParty(o[2], o[3]);
    else if (o[1] === 'd') w.setDay(o[2]);
    else if (o[1] === 's') w.setShared(o[2]);
  }
  return i;
}

/** Run a recording from its start: each(world, k, events) after every tick. Returns the world. Sync. */
export function runFile(file, content, each) {
  const w = restoreWorld(file.start, content);
  let i = 0;
  for (let k = 1; k <= file.len; k++) {
    i = applyOps(w, file.ops, i);
    const ev = w.step();
    if (each && each(w, k, ev) === false) break;
  }
  return w;
}

function trackOf(snapEnts, heroId, bossId) {
  let b = 0, h = 0;
  for (const e of snapEnts) {
    if (e.id === bossId) b = e.hpMax ? Math.max(0, e.hp) / e.hpMax : 0;
    if (e.id === heroId) h = e.hpMax ? Math.max(0, e.hp) / e.hpMax : 0;
  }
  return { b, h };
}
function marksFrom(marks, k, ev, heroId, bossId) {
  for (const e of ev || []) {
    if (e.type === 'cast_start' && e.src === bossId && bossId != null) marks.push({ k, kind: 'cast' });
    if ((e.type === 'death' || e.type === 'die') && e.id === heroId) marks.push({ k, kind: 'down' });
    if ((e.type === 'death' || e.type === 'die') && e.id === bossId && bossId != null && !marks.some((m) => m.kind === 'kill')) marks.push({ k, kind: 'kill' });
  }
}

export async function openPlayer(file, content, { onProgress = null, sync = false } = {}) {
  return file.baked ? openBaked(file) : openSim(file, content, { onProgress, sync });
}

async function openSim(file, content, { onProgress, sync }) {
  const heroId = file.meta.hero.id, bossId = file.meta.bossId ?? null;
  const w = restoreWorld(file.start, content);
  const N = file.len;
  const keys = [{ s: file.start, i: 0 }];
  const track = [], marks = [];
  const checks = { ok: 0, bad: 0, firstBad: null };
  let i = 0;
  for (let k = 1; k <= N; k++) {
    i = applyOps(w, file.ops, i);
    const ev = w.step();
    const snap = w.snapshot();
    track.push(trackOf(snap.entities, heroId, bossId));
    marksFrom(marks, k, ev, heroId, bossId);
    if (k % CHECK_EVERY === 0) {
      const want = file.check.h[k / CHECK_EVERY - 1];
      if (want != null) { if (checks.firstBad == null && checkHash(w.state, bossId) === want) checks.ok++; else { checks.bad++; if (checks.firstBad == null) checks.firstBad = k; } }
    }
    if (k % KEY_EVERY === 0) keys.push({ s: w.serialize(), i });
    if (!sync && k % CHUNK === 0) { if (onProgress) onProgress(k / N); await tickYield(); }
  }
  // plays to the last check that matched; past a mismatch the copy is not the fight any more
  const okTo = checks.firstBad == null ? N : Math.max(0, checks.firstBad - CHECK_EVERY);
  let cur = null, at = -1, ci = 0, snap = null, prev = null, events = [];
  function seek(k) {
    k = Math.max(0, Math.min(okTo, k | 0));
    if (!cur || k < at || Math.floor(k / KEY_EVERY) > Math.floor(at / KEY_EVERY)) {
      const kk = Math.floor(k / KEY_EVERY), key = keys[kk];
      cur = restoreWorld(key.s, content); at = kk * KEY_EVERY; ci = key.i;
      snap = cur.snapshot(); prev = snap; events = [];
    }
    while (at < k) {
      ci = applyOps(cur, file.ops, ci);
      events = cur.step(); at++;
      prev = snap; snap = cur.snapshot();
    }
    return { prev, snap, events, k: at };
  }
  seek(0);
  return { N, okTo, heroId, bossId, track, marks, checks, keys: keys.length, seek, baked: false, get at() { return at; } };
}

function openBaked(file) {
  const B = file.baked, heroId = file.meta.hero.id, bossId = file.meta.bossId ?? null, N = file.len;
  const track = [], marks = [];
  let st = createFrameState(heroId);
  for (let k = 1; k <= N; k++) {
    const msg = B.frames[k - 1];
    if ((k - 1) % B.every === 0) st = createFrameState(heroId);
    const s = applyFrame(st, msg);
    track.push(trackOf(s.entities, heroId, bossId));
    marksFrom(marks, k, msg.e, heroId, bossId);
  }
  let at = -1, snap = null, prev = null, events = [];
  // frame k - 1 makes tick k; every B.every frames is a whole one (no deltas), so a jump starts there
  function seek(k) {
    k = Math.max(1, Math.min(N, k | 0));
    if (snap == null || k < at || Math.floor((k - 1) / B.every) > Math.floor((at - 1) / B.every)) {
      const k0 = Math.floor((k - 1) / B.every) * B.every + 1;
      st = createFrameState(heroId); at = k0 - 1; snap = null;
    }
    while (at < k) { const msg = B.frames[at]; prev = snap; snap = applyFrame(st, msg); events = msg.e || []; at++; }
    if (!prev) prev = snap;
    return { prev, snap, events, k: at };
  }
  seek(1);
  return { N, okTo: N, heroId, bossId, track, marks, checks: { ok: 0, bad: 0, firstBad: null }, keys: 0, seek, baked: true, get at() { return at; } };
}

/** "Keep forever": frames for the recorded hero, as a co-op guest gets them, while this build still matches. Async slices. */
export async function bake(file, content, { onProgress = null } = {}) {
  if (file.baked) return file;
  const heroId = file.meta.hero.id, bossId = file.meta.bossId ?? null;
  const tx = framesFor(heroId);
  const frames = [];
  let bad = null;
  const w = restoreWorld(file.start, content);
  let i = 0;
  for (let k = 1; k <= file.len; k++) {
    i = applyOps(w, file.ops, i);
    const ev = w.step();
    if (k % CHECK_EVERY === 0) { const want = file.check.h[k / CHECK_EVERY - 1]; if (want != null && checkHash(w.state, bossId) !== want) { bad = k; break; } }
    if ((k - 1) % KEY_EVERY === 0) tx.reset();
    frames.push(JSON.parse(JSON.stringify(tx.frame(w.snapshot(), ev, createTickCache()))));
    if (k % CHUNK === 0) { if (onProgress) onProgress(k / file.len); await tickYield(); }
  }
  if (bad != null) throw new Error('changed');
  const { start, ops, check, ...rest } = file;
  void start; void ops; void check;
  return { ...rest, baked: { every: KEY_EVERY, frames } };
}

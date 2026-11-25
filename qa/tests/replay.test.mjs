// Replays (wave 8, replay lane; D:/LQOnline/wave8/replay/BRIEF.md, src/replay/): a recorded fight rebuilt by the real sim
// matches the original on every tick (full state hash), co-op joins, leaves, party and day changes included; a check that
// reads a charge never writes it (combat.cdReady); the store keeps the newest 40 and never clears a pinned one; a baked
// ("Keep forever") copy plays the same fight; a changed game is caught by the checks.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { createRecorder } from '../../src/replay/recorder.js';
import { runFile, openPlayer, bake } from '../../src/replay/player.js';
import { createReplayStore, memoryBackend, KEEP } from '../../src/replay/store.js';
import { pack, unpack, badFile, CHECK_EVERY } from '../../src/replay/format.js';

// the real map with one foe on it, so a full state hash every tick stays quick
const C0 = buildContent();
const C = { ...C0, spawns: C0.spawns.filter((s) => s.mob === 'rare_lambert'), nightSpawns: [] };
const TILE = 256;

/** A hero next to the rare Lambert the Unshorn on the world map, fighting it with a plain script. Records by itself. */
function rareFight({ coop = false, ticks = 1400 } = {}) {
  const w = createWorld({ seed: 31, content: C, day: 3 });
  const saved = [];
  let hero = null;
  const rec = createRecorder({ world: w, content: C, heroId: () => hero, onSaved: (f) => saved.push(f) });
  // the live run's own full hash after every tick, by tick (taken after the recorder's wrapper)
  const live = new Map();
  const step0 = w.step;
  w.step = () => { const ev = step0(); live.set(w.tick, w.hash()); return ev; };
  const rare = w.state.ents.find((e) => e.template === 'rare_lambert');
  const rx = Math.floor(rare.x / TILE), ry = Math.floor((rare.y - 1) / TILE);
  hero = w.addPlayer({ name: 'Ash', cls: 'warden', level: 14, gearMode: 'design', zone: 'world', x: rx - 3, y: ry });
  let friend = null;
  for (let t = 1; t <= ticks; t++) {
    if (coop && t === 60) { friend = w.addPlayer({ name: 'Bryn', cls: 'mender', level: 14, gearMode: 'design', zone: 'world', x: rx - 4, y: ry + 1, party: hero }); w.setParty(hero, hero); }
    if (coop && t === 300 && friend != null) { w.removePlayer(friend); friend = null; }
    if (coop && t === 320) w.setDay(4);
    const p = w.get(hero);
    if (p && !p.dead) {
      if (t === 5) { w.enqueue(hero, { t: 'target', id: rare.id }); w.enqueue(hero, { t: 'attack', id: rare.id }); }
      if (t % 5 === 0) { const d = Math.hypot(rare.x - p.x, rare.y - p.y) / 16; w.enqueue(hero, d > 20 ? { t: 'move', dx: Math.sign(rare.x - p.x), dy: Math.sign(rare.y - p.y) } : { t: 'move', dx: 0, dy: 0 }); }
      if (t % 12 === 0) w.enqueue(hero, { t: 'cast', slot: 1 + ((t / 12) % 4) });
    }
    if (friend != null && t % 15 === 0) { const h = w.get(hero); w.enqueue(friend, h && h.hp < h.hpMax * 0.8 ? { t: 'cast', slot: 2, target: hero } : { t: 'move', dx: 0, dy: 0 }); }
    w.step();
    if (saved.length && !rec.active) break;
  }
  return { w, saved, live, rec, hero };
}

function matchEveryTick(file, live) {
  let bad = null, n = 0;
  runFile(file, C, (w) => { n++; if (live.get(w.tick) !== w.hash()) { bad = w.tick; return false; } return true; });
  return { bad, n };
}

export const tests = [
  {
    name: 'a rare pull records by itself and the real sim rebuilds it: full state hash equal on every tick',
    fn() {
      const { saved, live } = rareFight();
      eq(saved.length, 1, 'one recording');
      const f = saved[0];
      eq(f.meta.kind, 'rare', 'kind'); eq(f.meta.title, 'Lambert the Unshorn', 'title');
      assert(f.len > 100 && f.ops.length > 10, `a real fight: ${f.len} ticks, ${f.ops.length} ops`);
      assert(['kill', 'wipe'].includes(f.meta.result), f.meta.result);
      eq(f.check.h.length, Math.floor(f.len / CHECK_EVERY), 'a check every 5 s');
      const m = matchEveryTick(f, live);
      eq(m.bad, null, `diverged at tick ${m.bad}`);
      eq(m.n, f.len, 'every tick');
    },
  },
  {
    name: 'co-op: a friend joining, the party call, the friend leaving and the day changing all replay exactly',
    fn() {
      const { saved, live } = rareFight({ coop: true });
      const f = saved[0];
      const kinds = new Set(f.ops.map((o) => o[1]));
      for (const k of ['c', 'j', 'p', 'l', 'd']) assert(kinds.has(k), `op ${k} logged`);
      const m = matchEveryTick(f, live);
      eq(m.bad, null, `diverged at tick ${m.bad}`);
    },
  },
  {
    name: 'the record key: records any fight, a second press stops and keeps it; it replays exactly',
    fn() {
      const w = createWorld({ seed: 9, content: C, day: 1 });
      const saved = [];
      const hero = w.addPlayer({ name: 'Cy', cls: 'scribe', level: 12, gearMode: 'design' });
      const rec = createRecorder({ world: w, content: C, heroId: () => hero, onSaved: (f) => saved.push(f) });
      const live = new Map(); const s0 = w.step; w.step = () => { const ev = s0(); live.set(w.tick, w.hash()); return ev; };
      for (let t = 0; t < 10; t++) w.step();
      eq(rec.toggle(), 'start', 'start');
      for (let t = 0; t < 140; t++) { if (t % 7 === 0) w.enqueue(hero, { t: 'move', dx: (t / 7) % 2 ? 1 : -1, dy: 0 }); w.step(); }
      eq(rec.toggle(), 'stop', 'stop');
      eq(saved.length, 1, 'kept'); eq(saved[0].meta.kind, 'fight', 'kind');
      eq(matchEveryTick(saved[0], live).bad, null, 'matches');
    },
  },
  {
    name: 'combat.cdReady reads a charged skill without writing it (the state hash stays the same)',
    fn() {
      const w = createWorld({ seed: 3, content: C, day: 1 });
      const id = w.addPlayer({ name: 'Di', cls: 'scribe', level: 12, gearMode: 'design' });
      const e = w.get(id), ab = (C.builds2 || {}).abilities.scribe_ellipsis;
      assert(ab && ab.charges, 'a charged skill');
      e.charges = { scribe_ellipsis: { n: 0, next: w.tick + 5 } };
      for (let t = 0; t < 30; t++) w.step();
      const before = w.hash();
      const ready = w.internals.combat.cdReady(e, ab);
      eq(ready, true, 'the charge is back');
      eq(w.hash(), before, 'no write');
      eq(e.charges.scribe_ellipsis.n, 0, 'stored count untouched');
    },
  },
  {
    name: 'files: gzip round trip, bad files refused in plain words',
    async fn() {
      const { saved } = rareFight();
      const f = saved[0];
      const b = await pack(f);
      assert(b.length < JSON.stringify(f).length / 4, `gzipped: ${b.length}`);
      const back = await unpack(b);
      eq(JSON.stringify(back), JSON.stringify(f), 'round trip');
      eq(badFile(back), null, 'good');
      assert(badFile({ kind: 'x' }), 'not a replay');
      assert(badFile({ ...f, v: 99 }), 'other version');
    },
  },
  {
    name: 'store: newest 40 kept, pinned never cleared out, size reported',
    async fn() {
      const S = createReplayStore({ backend: memoryBackend() });
      const mk = (i) => ({ v: 1, kind: 'lexicon-realms-replay', build: 'b', meta: { id: `r${i}`, when: 1000 + i, title: `T${i}`, hero: { id: 1, name: 'A' } }, len: 20, start: '{}', ops: [], check: { h: [] } });
      await S.put(mk(0));
      eq((await S.pin('r0', { ...mk(0), baked: { every: 100, frames: [] } })).ok, true, 'pinned');
      for (let i = 1; i <= KEEP + 5; i++) await S.put(mk(i));
      const rows = await S.list();
      eq(rows.filter((r) => !r.pinned).length, KEEP, 'newest 40');
      assert(rows.some((r) => r.id === 'r0' && r.pinned), 'pinned kept');
      assert(!rows.some((r) => r.id === 'r1'), 'oldest unpinned cleared');
      const u = await S.usage();
      eq(u.kept, KEEP, 'kept'); eq(u.pinned, 1, 'pinned');
      assert(u.bytes > 0, 'bytes');
    },
  },
  {
    name: 'Keep forever: the baked copy plays the same fight as the sim; a changed game is caught and cannot be baked',
    async fn() {
      const { saved } = rareFight();
      const f = saved[0];
      const P = await openPlayer(f, C, { sync: true });
      eq(P.okTo, P.N, 'all checks match'); eq(P.checks.bad, 0, 'no bad check');
      const baked = await bake(f, C);
      eq(baked.baked.frames.length, f.len, 'one frame a tick');
      assert(!baked.start && !baked.ops, 'no sim data kept');
      const B = await openPlayer(baked, C);
      for (const k of [1, Math.floor(f.len / 2), f.len]) {
        const a = P.seek(k).snap.entities.find((e) => e.id === f.meta.hero.id), b = B.seek(k).snap.entities.find((e) => e.id === f.meta.hero.id);
        eq(b.hp, a.hp, `hero hp at ${k}`); eq(Math.round(b.x), Math.round(a.x), `hero x at ${k}`);
      }
      // a tuning change the fight touches: the rare hits harder
      const m = JSON.parse(JSON.stringify(C.mobs.rare_lambert || {}));
      const C2 = { ...C, mobs: { ...C.mobs, rare_lambert: { ...m, speed: (m.speed || 60) + 7, dmg: m.dmg ? m.dmg * 2 : m.dmg } } };
      const P2 = await openPlayer(f, C2, { sync: true });
      assert(P2.okTo < P2.N, `changed game caught (okTo ${P2.okTo} of ${P2.N})`);
      let threw = false; try { await bake(f, C2); } catch { threw = true; }
      assert(threw, 'too late to keep');
    },
  },
];

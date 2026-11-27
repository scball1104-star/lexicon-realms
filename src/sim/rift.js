// Word rifts, the sim side (wave 10 drift, Scott 2026-11-25; D:/LQOnline/wave10/drift/BRIEF.md). Pure: no clock, no
// Math.random. Imports nothing outside src/sim/: the data comes in as content.rift (src/data/rift.js, src/data/maps/index.js)
// and the zones themselves through content.zones (a rift's zone is made on first use, src/data/maps/copies.js).
//
//   const RF = createRifts(D)   D = { state, content, emit, get, C, DG, tileToSub }
//   RF.handles(t) / RF.command(e, cmd)
//   RF.tick()                  rift records for copies that exist (a loaded world), and the held rooms
//   RF.observe(ev)             every event: a word door opened teaches its word, a cleared rift teaches the rift's word
//   RF.hudOf(e)                { stone } at the Rift Stone (the words this hero may open), { inside } in a rift
//   RF.wordsOf(e)              the hero's learned words (e.dungeons.words, saved with the hero's dungeon record)
//   RF.ensure(base)            the rift's place record (content.dungeons) and the seal's word door (content.wordDoors)
//
// Commands
//   rift_open { word, link? }  at the Rift Stone: open the rift of `word` at the hero's own level (minLevel to maxLevel, 35); party
//                              heroes beside the stone go in with them, on one tick (as dflow's Go in together).
//                              Allowed words: this Eastern week's word, the hero's learned words, or (link: true, a friend's
//                              #rift= link) any word in the game's own book. A rift's level is the opener's own level.
// Events: rift { kind: 'open', id, word, level, zone, heroes } ; rift { kind: 'breath', zone, room } (a held room wakes) ;
//         rift { kind: 'learn', id, word } ; rift_fail { id, reason: 'not_here' | 'level' | 'word' | 'combat' | 'dead' | 'inside' }
//
// Held rooms (the brief's "The Held Breath"): spawns with `held: <room>` keep m.spawn.held (src/sim/dungeons.js) and never
// notice a hero (src/sim/ai.js scan) until a hero stands within heldTiles of the room's middle, or one of them is pulled;
// then every pack of the room comes at once. Foes themselves are never changed.
const TILE = 256;
const CMDS = new Set(['rift_open']);
const base = (id) => { const s = String(id); const i = s.indexOf('#'); return i < 0 ? s : s.slice(0, i); };

export function createRifts(D) {
  const { state, content, emit, get, C } = D;
  const RX = content.rift;
  const R = RX.rules;
  const zones = content.zones;
  const PL = content.dungeons || (content.dungeons = {});
  const WDS = content.wordDoors || null;
  const now = () => state.tick;
  let book = null;
  const bookOf = () => (book || (book = RX.book(content)));
  const isRift = (zid) => !!RX.parse(base(zid));
  const tileOf = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];
  const fail = (e, reason) => { emit({ type: 'rift_fail', id: e.id, reason }); return false; };

  /** The place record and the seal's word door for a rift base id (idempotent; the same on every machine). */
  function ensure(b) {
    if (!isRift(b)) return null;
    const z = zones[b];
    if (!z || !z.rift) return null;
    if (!PL[b]) PL[b] = RX.place(z, PL);
    if (WDS && !WDS[`${b}_seal`]) WDS[`${b}_seal`] = z.rift.wordDoorDef;
    return PL[b];
  }

  // ---------------------------------------------------------------- words
  function dun(e) { if (!e.dungeons || typeof e.dungeons !== 'object') e.dungeons = { day: state.day | 0, done: [], miss: 0 }; return e.dungeons; }
  function wordsOf(e) { return Array.isArray(e && e.dungeons && e.dungeons.words) ? [...e.dungeons.words] : []; }
  function learn(e, w) {
    if (!e || e.kind !== 'player' || !w || !bookOf().has(w)) return;
    const d = dun(e);
    const list = Array.isArray(d.words) ? d.words : (d.words = []);
    if (list.includes(w)) return;
    list.push(w);
    while (list.length > (R.wordsMax || 24)) list.shift();
    emit({ type: 'rift', kind: 'learn', id: e.id, word: w });
  }
  const week = () => RX.weekWord(state.day | 0);

  // ---------------------------------------------------------------- the stone
  const ownLevel = (e) => (e.sync ? e.sync.from : e.level) | 0;
  function atStone(e, tiles) {
    const S = RX.stone;
    if (!e || e.zone !== S.zone) return false;
    const [tx, ty] = tileOf(e);
    return Math.max(Math.abs(tx - S.x), Math.abs(ty - S.y)) <= tiles;
  }
  function members(e) { return e.party != null ? state.ents.filter((p) => p.kind === 'player' && p.party === e.party) : [e]; }

  function open(e, cmd) {
    if (e.dead) return fail(e, 'dead');
    if (D.DG.isPlace(e.zone)) return fail(e, 'inside');
    if (!atStone(e, R.stoneTiles)) return fail(e, 'not_here');
    if (e.inCombat) return fail(e, 'combat');
    const L = Math.min(R.maxLevel || 30, ownLevel(e));
    if (L < R.minLevel) return fail(e, 'level');
    const w = typeof cmd.word === 'string' ? cmd.word.toUpperCase().replace(/[^A-Z]/g, '') : '';
    const ok = w.length >= 3 && w.length <= 8 && bookOf().has(w) && (w === week() || wordsOf(e).includes(w) || cmd.link === true);
    if (!ok) return fail(e, 'word');
    const b = `rift_${w.toLowerCase()}_${L}`;
    if (!zones[b] || !ensure(b)) return fail(e, 'word');
    const z = zones[b];
    const go = members(e).filter((p) => p === e || (!p.dead && !p.inCombat && atStone(p, R.gatherTiles) && !D.DG.isPlace(p.zone)));
    let zid = null;
    go.forEach((p, i) => {
      zid = D.DG.enter(p, b);
      const [ax, ay] = z.arrival;
      moveTo(p, zid, ax + (i % 2 ? 1 : 0), ay + (i >> 1), 'up');
    });
    learn(e, w);
    emit({ type: 'rift', kind: 'open', id: e.id, word: w, level: L, zone: zid, heroes: go.map((p) => p.id) });
    return true;
  }
  // the same steps as a door (world.js checkJoin) and dflow's Go in together (delve.js moveTo)
  function moveTo(p, zid, tx, ty, dir) {
    const from = p.zone;
    const [x, y] = D.tileToSub(tx, ty);
    p.zone = zid; p.x = x; p.y = y; p.mx = 0; p.my = 0; p.moving = false; p.dir = dir;
    p.target = null; p.autoOn = false; p.combo = null; p.forced = null;
    if (p.cast && C.combat) C.combat.cancelCast(p, 'move');
    const inf = D.DG.info(zid);
    emit({ type: 'zone', id: p.id, from, to: zid, x: tx, y: ty, ...(inf ? { kind: inf.kind, base: inf.base, name: inf.name, levels: inf.levels, label: inf.label } : {}) });
    if (C.prog && from !== zid) C.prog.onZoneEnter(p);
  }

  // ---------------------------------------------------------------- held rooms
  function wake(zid, room, by) {
    const c = (state.copies || {})[zid];
    if (c) (c.woke = c.woke || []).push(room);
    for (const m of state.ents) {
      if (m.kind !== 'mob' || m.zone !== zid || !m.spawn || m.spawn.held !== room) continue;
      delete m.spawn.held;
      if (!m.dead && by && C.ai && m.ai && m.ai.mode !== 'combat') { m.threat = m.threat || {}; m.threat[by.id] = (m.threat[by.id] || 0) + 1; C.ai.engage(m, by, false); }
    }
    emit({ type: 'rift', kind: 'breath', zone: zid, room });
  }
  function tickHeld(zid, c) {
    const z = zones[zid];
    for (const h of (z.rift && z.rift.held) || []) {
      if ((c.woke || []).includes(h.room)) continue;
      const r = (R.heldTiles || 3) * TILE;
      const cx = h.x * TILE + TILE / 2, cy = h.y * TILE + TILE / 2;
      let by = null;
      for (const p of state.ents) if (p.kind === 'player' && !p.dead && p.zone === zid && Math.hypot(p.x - cx, p.y - cy) <= r) { by = p; break; }
      if (!by) {
        // one of the room's foes was pulled (hit from range, or caught by a spell): the whole room comes
        const pulled = state.ents.find((m) => m.kind === 'mob' && m.zone === zid && m.spawn && m.spawn.held === h.room && (m.dead || (m.ai && m.ai.mode === 'combat')));
        if (pulled) by = (pulled.ai && pulled.ai.target != null && get(pulled.ai.target)) || state.ents.find((p) => p.kind === 'player' && p.zone === zid && !p.dead) || null;
        if (!pulled) continue;
      }
      wake(zid, h.room, by);
    }
  }
  function tick() {
    if (now() % 5 !== 0) return;
    for (const [zid, c] of Object.entries(state.copies || {})) {
      if (!isRift(zid)) continue;
      ensure(base(zid));
      tickHeld(zid, c);
    }
  }

  // ---------------------------------------------------------------- events
  function observe(ev) {
    if (ev.type === 'wdoor' && ev.kind === 'open' && ev.word) {
      for (const p of state.ents) if (p.kind === 'player' && p.zone === ev.zone) learn(p, ev.word);
      return;
    }
    if (ev.type === 'dungeon_clear' && isRift(ev.zone)) {
      const w = RX.parse(base(ev.zone)).word;
      for (const p of state.ents) if (p.kind === 'player' && p.zone === ev.zone) learn(p, w);
    }
  }

  // ---------------------------------------------------------------- HUD
  function hudOf(e) {
    if (isRift(e.zone)) {
      const p = RX.parse(base(e.zone)), z = zones[base(e.zone)];
      return { inside: { word: p.word, level: p.level, look: z && z.rift ? z.rift.look : null } };
    }
    if (e.dead || !atStone(e, R.stoneTiles)) return null;
    const wk = week();
    const words = wordsOf(e).filter((w) => w !== wk && bookOf().has(w)).reverse();
    return { stone: { week: wk, words, level: Math.min(R.maxLevel || 30, ownLevel(e)), min: R.minLevel, ok: ownLevel(e) >= R.minLevel && !e.inCombat } };
  }

  return { handles: (t) => CMDS.has(t), command: (e, cmd) => (cmd.t === 'rift_open' ? open(e, cmd) : false), tick, observe, hudOf, wordsOf, ensure, isRift };
}

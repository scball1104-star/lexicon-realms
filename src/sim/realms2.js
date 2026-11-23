// The two signature mechanics of the wave 3 realms2 start realms (2026-11-22; WORLD_2.md 1.4 and 1.5). Pure and
// deterministic: everything is a function of the tick and the state (no Math.random, no clock).
//
//   const R2 = createRealms2(C)      C: the world's combat context (state, content, emit, get, ai, boxFree, zoneOf)
//   R2.tick()                        once a tick after the units: storm pull and sight, the watch's alarms, fog
//   R2.sense(m, p, r)                ai.js aggroRadius hook: the radius (px) foe m notices hero p at, given the normal r
//   R2.stormAt(tick) / R2.fogAt(tick) / R2.inFog(e) / R2.sheltered(e)    for tests and drivers
//
// Data: content.realms2 (src/data/realms2.js R2_RULES, which documents every knob). The storm and fog helpers mirror
// src/data/realms2.js stormAt / fogBanksAt (the renderers use those; qa/world/realms2.test.mjs checks they agree).
// Events: mob_emote { text, to: [hero ids] } for the storm's warnings, the watch's alarm and the fog losing you; yell
// { id, text } when a watchman or a raven raises the alarm.

const SUB_TILE = 256, PX = 16;                       // SUB per tile, SUB per px
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function createRealms2(C) {
  const R = C.content.realms2 || null;
  const S = R && R.storm, Wt = R && R.watch;
  const { state, emit } = C;
  const tmpl = (m) => (C.content.mobs || {})[m.template] || {};
  const tileOf = (e) => [e.x / SUB_TILE, (e.y - 1) / SUB_TILE];

  function stormAt(tick) {
    if (!S) return { k: 0, phase: 'clear', left: 0 };
    const t = ((tick - S.offset) % S.period + S.period) % S.period;
    const a = S.warn, b = a + S.rise, c = b + S.full, d = c + S.fall;
    if (t < a) return { k: 0, phase: 'warn', left: a - t };
    if (t < b) return { k: (t - a) / S.rise, phase: 'rise', left: b - t };
    if (t < c) return { k: 1, phase: 'full', left: c - t };
    if (t < d) return { k: 1 - (t - c) / S.fall, phase: 'fall', left: d - t };
    return { k: 0, phase: 'clear', left: S.period - t };
  }
  function fogAt(tick) {
    if (!Wt) return [];
    return Wt.fog.map((f) => {
      const pts = [...f.route, f.route[0]];
      const segs = []; let len = 0;
      for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push(l); len += l; }
      let s = ((tick / 20) * f.speed) % len;
      for (let i = 0; i < segs.length; i++) {
        if (s <= segs[i] || i === segs.length - 1) { const k = segs[i] ? Math.min(1, s / segs[i]) : 0; return { id: f.id, x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k, r: f.r }; }
        s -= segs[i];
      }
      return { id: f.id, x: pts[0][0], y: pts[0][1], r: f.r };
    });
  }
  let fogTick = -1, fogNow = [];
  const fogs = () => { if (fogTick !== state.tick) { fogTick = state.tick; fogNow = fogAt(state.tick); } return fogNow; };
  function inFog(e) {
    if (!Wt || e.zone !== Wt.zone) return false;
    const [x, y] = tileOf(e);
    return fogs().some((f) => Math.hypot(x - f.x, y - f.y) <= f.r);
  }
  function sheltered(e) {
    if (!S || e.zone !== S.zone) return true;
    const [x, y] = tileOf(e);
    if (S.shelters.some((a) => x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h)) return true;
    return S.chimes.some(([cx, cy]) => Math.hypot(x - cx - 0.5, y - cy - 0.5) <= S.shelterTiles);
  }
  const heroesIn = (zone) => state.ents.filter((e) => e.kind === 'player' && !e.dead && e.zone === zone);
  const tell = (zone, text) => { const to = heroesIn(zone).map((e) => e.id); if (to.length) emit({ type: 'mob_emote', text, to }); };

  // ---------------------------------------------------------------- the sense hook (ai.js aggroRadius)
  function sense(m, p, r) {
    if (S && m.zone === S.zone) {
      const k = stormAt(state.tick).k;
      if (k > 0) return tmpl(m).stormRider ? r * (1 + (S.riderMult - 1) * k) : r * (1 - (1 - S.seeMult) * k);
      return r;
    }
    if (Wt && m.zone === Wt.zone) {
      if (inFog(p)) return 0;
      const t = tmpl(m);
      if (!t.watch) return r;
      const dx = (p.x - m.x) / PX, dy = (p.y - m.y) / PX, d = Math.hypot(dx, dy);
      const bump = Wt.bumpTiles * 16;
      if (d <= bump) return bump;
      const v = DIRV[m.dir] || DIRV.down;
      const cos = (dx * v[0] + dy * v[1]) / Math.max(1e-6, d);
      const lit = Wt.coneTiles * 16 * (C.stats && C.stats.hasFlag(p, 'stealth') ? 0.5 : 1);     // a sneaking hero is seen half as far
      return cos >= Math.cos((Wt.halfAngle * Math.PI) / 180) ? lit : bump;
    }
    return r;
  }

  // ---------------------------------------------------------------- the watch: alarms, ravens, fog, Curfew
  function seen(p) {
    if (!p || p.kind !== 'player' || !p.quests) return;
    for (const [qid, s] of Object.entries(p.quests)) {
      const q = (C.content.quests || {})[qid];
      if (!q || !s || s.state !== 'active') continue;
      let reset = false;
      q.objectives.forEach((o, i) => {
        if (o.unseen && s.counts[i] > 0) { s.counts[i] = 0; reset = true; emit({ type: 'quest', id: p.id, quest: qid, kind: 'progress', objective: i, cur: 0, need: o.count || 1 }); }
      });
      if (reset) emit({ type: 'mob_emote', text: `The watch saw you. ${q.name}: start the crossing again.`, to: [p.id] });
    }
  }
  function alarm(src, p, text) {
    if (!p || p.dead) return;
    emit({ type: 'yell', id: src.id, text });
    const R2 = Wt.alarmTiles * SUB_TILE;
    for (const m of state.ents) {
      if (m === src || m.kind !== 'mob' || m.dead || m.zone !== src.zone || !tmpl(m).watch || !m.ai) continue;
      if (m.ai.mode === 'combat' || m.ai.mode === 'reset') continue;
      if (Math.hypot(m.x - src.x, m.y - src.y) > R2) continue;
      m.threat[p.id] = Math.max(m.threat[p.id] || 0, 1);
      C.ai.engage(m, p, false);
      m.r2Alarmed = true;
    }
    seen(p);
  }
  function tickWatch() {
    const now = state.tick;
    for (const m of state.ents) {
      if (m.kind !== 'mob' || m.zone !== Wt.zone || !m.ai) continue;
      const t = tmpl(m);
      const fighting = !m.dead && m.ai.mode === 'combat';
      const foe = fighting && m.ai.target != null ? C.get(m.ai.target) : null;
      if (t.watch) {
        if (fighting && !m.r2Alarmed && foe) { m.r2Alarmed = true; alarm(m, foe, 'HALT! CURFEW!'); }
        else if (!fighting) m.r2Alarmed = false;
      } else if (t.spotter) {
        if (fighting && foe) {
          if (m.r2SquawkAt == null) m.r2SquawkAt = now + Math.round(Wt.squawkSec * 20);
          else if (m.r2SquawkAt > 0 && now >= m.r2SquawkAt) { m.r2SquawkAt = -1; alarm(m, foe, 'SQUAWK! SQUAWK!'); }
        } else m.r2SquawkAt = null;
      }
      // a foe chasing a hero into a fog bank loses her (not the Steward in his court)
      if (fighting && foe && !t.boss && (now + m.id) % 10 === 0 && inFog(foe)) {
        C.ai.reset(m);
        m.r2Alarmed = false;
        if (!foe.r2FogSaid || now - foe.r2FogSaid > 100) { foe.r2FogSaid = now; emit({ type: 'mob_emote', text: 'The fog closes round you. They have lost you.', to: [foe.id] }); }
      }
    }
  }

  // ---------------------------------------------------------------- the storm: warnings, sight, the wind's pull
  let lastPhase = null;
  function tickStorm() {
    const st = stormAt(state.tick);
    if (st.phase !== lastPhase) {
      if (lastPhase != null) {
        if (st.phase === 'warn') tell(S.zone, 'The storm wall darkens in the east and the chimes start to ring. A sandstorm is coming: find a chime post or shelter.');
        else if (st.phase === 'rise') tell(S.zone, 'The sandstorm is on you. Stay by a chime post or the wind will drag you east.');
        else if (st.phase === 'clear') tell(S.zone, 'The storm blows itself out. The air clears.');
      }
      lastPhase = st.phase;
    }
    if (st.k <= 0) return;
    const zone = C.content.zones[S.zone];
    const sight = S.sightTiles * SUB_TILE + (1 - st.k) * 20 * SUB_TILE;
    for (const e of heroesIn(S.zone)) {
      // sight: a target further than the storm lets you see is lost
      if (e.target != null && st.k >= 0.5) {
        const t = C.get(e.target);
        if (t && t.zone === e.zone && Math.hypot(t.x - e.x, t.y - e.y) > sight) { e.target = null; e.autoOn = false; emit({ type: 'target', src: e.id, id: null, reason: 'lost' }); }
      }
      // the pull: the wind drags a hero in the open toward the storm wall
      if (e.flight || e.forced || sheltered(e)) continue;
      const dx = Math.round(S.pullDir[0] * S.pullSub * st.k), dy = Math.round(S.pullDir[1] * S.pullSub * st.k);
      if ((dx || dy) && C.boxFree(zone, e.x + dx, e.y + dy)) { e.x += dx; e.y += dy; }
    }
  }

  function tick() {
    if (!R) return;
    if (S && C.content.zones[S.zone]) tickStorm();
    if (Wt && C.content.zones[Wt.zone]) tickWatch();
  }
  // a one-way ride whose quest is not done yet (join.needs): the hero stays, and is told why (once in a while)
  function notYet(e, j) {
    if (e.r2RideSaid != null && state.tick - e.r2RideSaid < 200) return;
    e.r2RideSaid = state.tick;
    emit({ type: 'mob_emote', text: j.notYet || 'That road is not open to you yet.', to: [e.id] });
  }
  return { tick, sense, stormAt, fogAt, inFog, sheltered, notYet };
}

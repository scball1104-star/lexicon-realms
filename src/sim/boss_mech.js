// Boss fights that need the party (wave 10 dbosses BUILD; data and every word in src/data/boss_fights.js; brief
// D:/LQOnline/wave10/dbosses/BRIEF.md). Pure: no clock, no Math.random, the world's own ticks; target picks go round the
// heroes by id (no rng draw, so a copy's other rolls are unchanged).
//
//   const BM = createBossMech(X)   X = { state, content, emit, get, combat(), summon(m, spec, b), dun(p) }
//   BM.tick(m, b)        from dungeons.js bossTick (the boss is in combat): gates, mechanics, the red slot, the Last Count
//   BM.reset(m)          from dungeons.js bossReset: every mark goes, the boss's own auras come off
//   BM.onDeath(m)        a boss died: each hero in the copy counts one clear of it (p.dungeons.clears, saved)
//   BM.view(m)           the boss frame's state for the snapshot (entity field bossFight)
//   BM.marks()           every live mark for the snapshot (snap.bossMarks), in px
//
// Mechanics (kinds): share (gold ring, split between the heroes inside), notch (violet ring that follows one hero and
// bursts on the OTHERS near them), letters (Roll Call: floor letters, one hero on each, in order), call (an interruptible
// cast in the boss's own bar), pair (two adds that must fall together), stacks (Leave Denied on the boss's target).
// A lone hero pays only in time: shares and notches have nobody else to hurt, a missed call or Roll Call heals the boss
// 5%, stacks need a second hero, paired adds come back slower. Every new phase gate guards the boss 4 s.
// The red slot: each boss's new red move is its own ground warning (a mark of kind 'red'), cast on its own timer
// beside the boss's normal moves, so it never takes a turn from them.
const HZ = 20;
const T = (s) => Math.round(s * HZ);
const SUB = 16;

export function createBossMech(X) {
  const { state, content, emit, get } = X;
  const R = content.bossRules;
  const FIGHTS = content.bossFights || {};
  const now = () => state.tick;
  const K = () => X.combat();
  const defOf = (m) => FIGHTS[m.template] || null;
  const fightOf = (m) => ((content.mobs || {})[m.template] || {}).fight || {};
  const px = (u) => ({ x: u.x / SUB, y: u.y / SUB });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function heroes(m) {
    const reach = R.reachPx * SUB;
    return state.ents.filter((p) => p.kind === 'player' && !p.dead && p.zone === m.zone && Math.hypot(p.x - m.x, p.y - m.y) <= reach).sort((a, b) => a.id - b.id);
  }
  function swingsTo(m, h, swings, school, ability) {
    if (!h || h.dead || swings <= 0) return;
    const raw = K().rawAmount(m, h, { mobHit: swings }, {});
    K().dealDamage(m, h, raw, { ability, school: school || 'physical', canCrit: false });
  }
  function aura(m, def) { K().applyAura(m, m, def, {}); }
  function dropAura(e, id) { const a = (e.auras || []).find((x) => x.id === id); if (a) K().removeAura(e, a, 'expire'); }
  function healPct(m, pct, ability) {
    const amt = Math.round(m.hpMax * pct);
    m.hp = Math.min(m.hpMax, m.hp + amt);
    emit({ type: 'heal', src: m.id, dst: m.id, amount: amt, ability });
  }

  function init(m, b) {
    const f = defOf(m);
    const bm = { gates: [], next: {}, marks: [], letters: null, call: null, pairs: [], bound: [], st: {}, stNext: 0, redNext: null, hardStep: 0, cycle: 0,
      everyMul: 1, hardAfter: f.hard ? f.hard.after : null, unspoken: false, usDone: false };
    void b;
    return bm;
  }
  /** The hidden version: the boss's name-stone (a word door) is open in this copy while the boss is still untouched. */
  function checkUnspoken(m, bm, f) {
    if (bm.usDone) return;
    if (m.hp < m.hpMax) { bm.usDone = true; return; }
    const c = (state.copies || {})[m.zone];
    const ns = c && c.wd && c.wd[`ns_${m.template}`];
    if (ns && ns.open && f.unspoken) {
      bm.usDone = true;
      bm.unspoken = true; bm.everyMul = R.unspoken.every;
      if (bm.hardAfter != null) bm.hardAfter = Math.max(60, bm.hardAfter - R.hard.sooner);
      aura(m, { id: 'bf_unspoken', name: 'Unspoken', icon: 'frenzy', kind: 'buff', duration: null, mods: [{ stat: 'damageTaken', mul: 1 / R.unspoken.hp }, { stat: 'damageDone', mul: R.unspoken.dmg }] });
      emit({ type: 'boss', id: m.id, kind: 'unspoken', template: m.template, zone: m.zone, text: f.unspoken.card });
      if (f.unspoken.card) emit({ type: 'yell', id: m.id, text: f.unspoken.card });
    }
  }

  // ------------------------------------------------------------------ the mechanics
  function start(m, b, bm, mc, i, H, solo) {
    if (!H.length) return false;
    const pick = () => H[(bm.cycle++) % H.length];
    if (mc.kind === 'share') {
      const t = pick();
      bm.marks.push({ kind: 'share', mech: i, x: t.x, y: t.y, r: (mc.radius || R.share.radius) * SUB, t0: now(), t1: now() + T(R.share.delay), swings: mc.swings, solo });
      return true;
    }
    if (mc.kind === 'notch') {
      const n = solo ? 1 : Math.ceil(H.length / 2);
      for (let k = 0; k < n; k++) { const t = pick(); bm.marks.push({ kind: 'notch', mech: i, follow: t.id, x: t.x, y: t.y, r: R.notch.radius * SUB, t0: now(), t1: now() + T(R.notch.delay), swings: mc.swings }); }
      return true;
    }
    if (mc.kind === 'letters') {
      if (bm.letters) return false;
      const k = solo ? 2 : Math.max(2, Math.min(4, H.length));
      const words = (content.rollWords || {})[k] || ['ON'];
      const word = words[bm.cycle++ % words.length];
      const z = content.zones[m.zone];
      const free = (x, y) => z && (z.collision[Math.floor((y - 1) / 256)] || '')[Math.floor(x / 256)] === '.';
      const out = [];
      for (let j = 0; j < word.length; j++) {
        const a = -Math.PI / 2 + Math.PI / 4 + (j * 2 * Math.PI) / word.length;
        let spot = null;
        for (const rr of [R.letters.ring, R.letters.ring * 0.7, R.letters.ring * 0.45]) {
          const x = m.x + Math.cos(a) * rr * SUB, y = m.y + Math.sin(a) * rr * SUB;
          if (free(x, y)) { spot = { x, y }; break; }
        }
        out.push({ L: word[j], ...(spot || { x: m.x, y: m.y }), done: false });
      }
      bm.letters = { mech: i, word, list: out, t0: now(), end: now() + T(solo ? R.letters.soloWindow : R.letters.window), solo };
      emit({ type: 'boss_mech', id: m.id, kind: 'letters', word, zone: m.zone });
      return true;
    }
    if (mc.kind === 'call') {
      const ab = (content.mobAbilities || {})[mc.ability];
      if (!ab || m.cast) return false;
      if (!K().castAbility(m, ab, { target: m.id })) return false;
      bm.call = { mech: i, ability: ab.id, end: m.cast ? m.cast.endTick : now(), swings: mc.swings, school: ab.school };
      return true;
    }
    if (mc.kind === 'pair') {
      if (solo || !mc.gates) return true;                     // a lone hero gets no extra adds: today's are paired below
      X.summon(m, { mob: mc.mob, level: mc.level || m.level - 1, count: 2 }, b);
      return true;
    }
    return false;
  }

  function resolveMarks(m, bm, H, solo) {
    const keep = [];
    for (const mk of bm.marks) {
      if (mk.follow != null) { const c = get(mk.follow); if (c && !c.dead && c.zone === m.zone) { mk.x = c.x; mk.y = c.y; } }
      if (now() < mk.t1) { keep.push(mk); continue; }
      if (mk.kind === 'share') {
        const inside = H.filter((h) => dist(h, mk) <= mk.r);
        if (!solo && H.length > 1) {
          const total = mk.swings * H.length;
          if (inside.length) for (const h of inside) swingsTo(m, h, total / inside.length, 'physical', 'bf_share');
          else for (const h of H) swingsTo(m, h, mk.swings * 2, 'physical', 'bf_share');
        }
        emit({ type: 'boss_mech', id: m.id, kind: 'share', inside: inside.length, of: H.length, zone: m.zone });
      } else if (mk.kind === 'notch') {
        const c = get(mk.follow);
        for (const h of H) if (h !== c && dist(h, mk) <= mk.r) swingsTo(m, h, mk.swings, 'shadow', 'bf_notch');
        emit({ type: 'boss_mech', id: m.id, kind: 'notch', zone: m.zone });
      } else if (mk.kind === 'red') {
        if (!m.dead) for (const h of H) if (inRed(mk, h)) swingsTo(m, h, mk.hit, mk.school, mk.ability);
      }
    }
    bm.marks = keep;
  }
  function inRed(mk, u) {
    if (mk.shape === 'circle') return dist(u, mk) <= mk.r;
    const dx = u.x - mk.x, dy = u.y - mk.y, cs = Math.cos(mk.dir), sn = Math.sin(mk.dir);
    const along = dx * cs + dy * sn, across = -dx * sn + dy * cs;
    if (mk.shape === 'line') return along >= 0 && along <= mk.r && Math.abs(across) <= mk.w / 2;
    return Math.hypot(dx, dy) <= mk.r && along >= Math.hypot(dx, dy) * Math.cos((mk.angle / 2) * Math.PI / 180) - 1e-6;
  }

  function tickLetters(m, b, bm, H) {
    const L = bm.letters;
    if (!L) return;
    const next = L.list.find((x) => !x.done);
    if (next && H.some((h) => dist(h, next) <= R.letters.radius * SUB)) {
      next.done = true;
      emit({ type: 'boss_mech', id: m.id, kind: 'letter', letter: next.L, zone: m.zone });
    }
    if (L.list.every((x) => x.done)) { bm.letters = null; emit({ type: 'boss_mech', id: m.id, kind: 'letters_done', zone: m.zone }); return; }
    if (now() < L.end) return;
    // missed: the boss heals; with friends, one of its adds joins too
    bm.letters = null;
    healPct(m, defOf(m).missHeal ?? R.miss.heal, 'bf_miscount');
    if (!L.solo) { const ph = (fightOf(m).phases || []).find((p) => p.summon); if (ph) X.summon(m, { ...ph.summon, count: 1 }, b); }
    emit({ type: 'boss_mech', id: m.id, kind: 'miscount', zone: m.zone });
  }
  function tickCall(m, bm, H, solo) {
    const c = bm.call;
    if (!c) return;
    if (m.cast && m.cast.ability === c.ability) return;
    bm.call = null;
    if (now() < c.end) { emit({ type: 'boss_mech', id: m.id, kind: 'call_broken', ability: c.ability, zone: m.zone }); return; }
    if (solo || H.length <= 1) healPct(m, defOf(m).missHeal ?? R.miss.heal, c.ability);
    else for (const h of H) swingsTo(m, h, c.swings, c.school, c.ability);
    emit({ type: 'boss_mech', id: m.id, kind: 'call_landed', ability: c.ability, zone: m.zone });
  }
  function tickPairs(m, b, bm, f, H, solo) {
    const mc = (f.mechs || []).find((x) => x.kind === 'pair');
    if (!mc) return;
    const free = (b.adds || []).filter((id) => { const a = get(id); return a && !a.dead && a.template === mc.mob && !bm.bound.includes(id); });
    while (free.length >= 2) { const ids = free.splice(0, 2); bm.bound.push(...ids); bm.pairs.push({ ids, deadAt: {}, mob: mc.mob }); }
    const win = T(solo ? f.pairSoloWindow || R.pair.soloWindow : R.pair.window);
    bm.pairs = bm.pairs.filter((pr) => {
      for (const id of pr.ids) { const a = get(id); if ((!a || a.dead) && pr.deadAt[id] == null) pr.deadAt[id] = now(); }
      const dead = pr.ids.filter((id) => pr.deadAt[id] != null);
      if (dead.length === 2) { emit({ type: 'boss_mech', id: m.id, kind: 'pair_down', zone: m.zone }); return false; }
      if (dead.length === 1 && now() - pr.deadAt[dead[0]] > win) {
        const before = (b.adds || []).length;
        X.summon(m, { mob: pr.mob, level: Math.max(1, m.level - 1), count: 1 }, b);
        const nid = (b.adds || [])[before];
        const a = nid != null ? get(nid) : null;
        if (a) { a.hp = Math.max(1, Math.round(a.hpMax * R.pair.reviveHp)); pr.ids = pr.ids.map((x) => (x === dead[0] ? nid : x)); bm.bound.push(nid); delete pr.deadAt[dead[0]]; }
        emit({ type: 'boss_mech', id: m.id, kind: 'pair_back', zone: m.zone });
      }
      return true;
    });
  }
  function tickStacks(m, bm, f, H, solo) {
    if (!(f.mechs || []).some((x) => x.kind === 'stacks') || solo || H.length < 2) return;
    if (now() < bm.stNext) return;
    bm.stNext = now() + T(R.stacks.every);
    const t = m.ai && m.ai.target != null ? get(m.ai.target) : null;
    if (!t || t.kind !== 'player' || t.dead) return;
    const s = bm.st[t.id] && bm.st[t.id].until > now() ? bm.st[t.id] : { n: 0 };
    s.n = Math.min(R.stacks.max, s.n + 1); s.until = now() + T(R.stacks.dur); bm.st[t.id] = s;
    dropAura(t, 'bf_leave_denied');
    K().applyAura(m, t, { id: 'bf_leave_denied', name: `Leave Denied x${s.n}`, icon: 'frenzy', kind: 'debuff', duration: R.stacks.dur, mods: [{ stat: 'damageTaken', mul: 1 + R.stacks.add * s.n }] }, {});
  }
  function tickRed(m, bm, f, H) {
    if (!f.red) return;
    const ab = (content.mobAbilities || {})[f.red.id];
    if (!ab) return;
    if (bm.redNext == null) { bm.redNext = now() + T(Math.min(8, f.red.every * 0.6)); return; }
    if (now() < bm.redNext || bm.marks.some((x) => x.kind === 'red') || K().cannotAct(m)) return;
    const t = m.ai && m.ai.target != null ? get(m.ai.target) : null;
    if (!t || t.dead || !H.includes(t)) return;
    bm.redNext = now() + T(f.red.every * bm.everyMul);
    const a = ab.area, circle = a.shape === 'circle';
    bm.marks.push({ kind: 'red', ability: ab.id, shape: a.shape, school: ab.school, hit: ab.mobHit,
      x: circle ? t.x : m.x, y: circle ? t.y : m.y, dir: Math.atan2(t.y - m.y, t.x - m.x), r: a.radius * SUB, w: (a.width || 16) * SUB, angle: a.angle || 90,
      t0: now(), t1: now() + T(ab.castTime) });
    emit({ type: 'boss_red', id: m.id, ability: ab.id, zone: m.zone });
  }
  function tickHard(m, b, bm, f) {
    if (bm.hardAfter == null) return;
    const since = now() - b.t0 - T(bm.hardAfter);
    if (since < 0) return;
    const step = 1 + Math.floor(since / T(R.hard.stepSec));
    if (step <= bm.hardStep) return;
    if (!bm.hardStep) { if (f.hard.yell) emit({ type: 'yell', id: m.id, text: f.hard.yell }); emit({ type: 'boss', id: m.id, kind: 'enrage', template: m.template, zone: m.zone }); }
    bm.hardStep = step;
    dropAura(m, 'bf_last_count');
    aura(m, { id: 'bf_last_count', name: f.hard.name, icon: 'frenzy', kind: 'buff', duration: null, mods: [{ stat: 'damageDone', mul: R.hard.mul ** step }] });
  }

  function tick(m, b) {
    const f = defOf(m);
    if (!f || m.dead || !b) return;
    const bm = m.ai.bm || (m.ai.bm = init(m, b));
    checkUnspoken(m, bm, f);
    const H = heroes(m), solo = H.length <= 1, hp = m.hp / m.hpMax;
    // the new gates: guard 4 s, start their mechanics, and (Unspoken) one of today's adds joins at each
    f.gates.forEach((g, i) => {
      if (bm.gates.includes(i) || hp > g.at) return;
      bm.gates.push(i);
      // the guard is the time spent on the gate's mechanic; the Barrow (the classroom) spares a lone hero it
      if (!solo || f.soloGuard !== false) aura(m, { id: 'bf_guard', name: 'Guarded', icon: 'shield', kind: 'buff', duration: f.guardSec || R.guardSec, mods: [{ stat: 'damageTaken', mul: R.guardMul }] });
      if (bm.unspoken) { const ph = (fightOf(m).phases || []).find((p) => p.summon); if (ph) X.summon(m, { ...ph.summon, count: 1 }, b); }
    });
    (f.mechs || []).forEach((mc, i) => {
      if (mc.gates) {
        for (const at of mc.gates) { const k = `g${i}:${at}`; if (!bm.next[k] && hp <= at) { bm.next[k] = 1; start(m, b, bm, mc, i, H, solo); } }
        return;
      }
      if (mc.every == null || (mc.from != null && hp > mc.from)) return;
      if (bm.next[i] == null) { bm.next[i] = now() + T(mc.every * bm.everyMul * 0.5); return; }
      if (now() < bm.next[i]) return;
      bm.next[i] = now() + (start(m, b, bm, mc, i, H, solo) ? T(mc.every * bm.everyMul) : T(2));
    });
    resolveMarks(m, bm, H, solo);
    tickLetters(m, b, bm, H);
    tickCall(m, bm, H, solo);
    tickPairs(m, b, bm, f, H, solo);
    tickStacks(m, bm, f, H, solo);
    tickRed(m, bm, f, H);
    tickHard(m, b, bm, f);
  }

  function reset(m) {
    if (!m.ai || !m.ai.bm) return;
    for (const id of ['bf_guard', 'bf_last_count', 'bf_unspoken']) dropAura(m, id);
    for (const pid of Object.keys(m.ai.bm.st || {})) { const p = get(Number(pid)); if (p) dropAura(p, 'bf_leave_denied'); }
    m.ai.bm = null;
  }
  function onDeath(m) {
    if (!defOf(m) || m.bfCleared) return;          // once per boss (onKill runs for each hero who shares the kill)
    m.bfCleared = true;
    for (const p of state.ents) {
      if (p.kind !== 'player' || p.zone !== m.zone) continue;
      const d = X.dun(p);
      d.clears = d.clears || {};
      d.clears[m.template] = (d.clears[m.template] || 0) + 1;
    }
  }

  // ------------------------------------------------------------------ the snapshot
  function view(m) {
    const bm = m.ai && m.ai.bm, b = m.ai && m.ai.boss, f = defOf(m);
    if (!bm || !b || !f || m.dead) return null;
    const ph = fightOf(m).phases || [];
    const crossed = ph.map((p, i) => (b.phases.includes(i) ? p : null)).filter(Boolean);
    let name = f.first;
    for (const p of crossed) if (p.name) name = p.name;
    const fz = fightOf(m).frenzy;
    const H = heroes(m);
    let call = null;
    const mc = (i) => (f.mechs || [])[i] || {};
    if (bm.letters) {
      const L = bm.letters, done = L.list.filter((x) => x.done).length, nx = L.list.find((x) => !x.done);
      call = { kind: 'letter', title: `${mc(L.mech).title}: ${L.word.split('').join(' ')}`, line: `${mc(L.mech).line}. ${done} of ${L.list.length} answered.${nx ? ` Next: ${nx.L}` : ''}` };
    } else if (bm.call) call = { kind: 'red', title: mc(bm.call.mech).title, line: mc(bm.call.mech).line };
    else {
      const mk = bm.marks.find((x) => x.kind === 'share') || bm.marks.find((x) => x.kind === 'notch');
      if (mk && mk.kind === 'share') call = { kind: 'share', title: mc(mk.mech).title, line: `${mc(mk.mech).line}. ${H.filter((h) => dist(h, mk) <= mk.r).length} of ${H.length} inside` };
      else if (mk) call = { kind: 'mark', title: mc(mk.mech).title, line: mc(mk.mech).line };
      else if (bm.pairs.length) { const p = (f.mechs || []).find((x) => x.kind === 'pair'); call = { kind: 'tether', title: p.title, line: p.line }; }
    }
    const left = (at) => Math.max(0, Math.round((at - now()) / HZ));
    return {
      phase: crossed.length + 1, of: ph.length + 1, phaseName: name, gates: ph.map((p) => p.at),
      frenzyIn: fz ? left(b.t0 + T(fz.after)) : null, hardIn: bm.hardAfter != null ? left(b.t0 + T(bm.hardAfter)) : null,
      hardName: f.hard ? f.hard.name : null, unspoken: bm.unspoken, call,
    };
  }
  function marks() {
    const out = [];
    for (const m of state.ents) {
      const bm = m.kind === 'mob' && !m.dead && m.ai && m.ai.bm;
      if (!bm) continue;
      const H = heroes(m);
      for (const mk of bm.marks) {
        const k = Math.max(0, Math.min(1, (now() - mk.t0) / Math.max(1, mk.t1 - mk.t0)));
        const o = { zone: m.zone, boss: m.id, kind: mk.kind === 'notch' ? 'mark' : mk.kind, x: mk.x / SUB, y: mk.y / SUB, r: mk.r / SUB, k };
        if (mk.kind === 'share') { o.n = H.filter((h) => dist(h, mk) <= mk.r).length; o.of = H.length; }
        if (mk.kind === 'red') Object.assign(o, { shape: mk.shape, dir: mk.dir, w: mk.w / SUB, angle: mk.angle, ability: mk.ability });
        out.push(o);
      }
      if (bm.letters) {
        const nx = bm.letters.list.find((x) => !x.done);
        for (const L of bm.letters.list) out.push({ zone: m.zone, boss: m.id, kind: 'letter', x: L.x / SUB, y: L.y / SUB, r: R.letters.radius, letter: L.L, done: L.done, next: L === nx });
      }
      for (const pr of bm.pairs) {
        const [a, c] = pr.ids.map((id) => get(id));
        if (a && c && !a.dead && !c.dead) out.push({ zone: m.zone, boss: m.id, kind: 'tether', ...px(a), to: px(c) });
      }
    }
    return out;
  }

  return { tick, reset, onDeath, view, marks };
}

// Playthrough driver helpers, injected into the page by qa/integrate/playthrough.py. Reads the game through
// window.__realms (snapshot, regions, layout) and plans walking routes; the Python side turns them into REAL key and
// mouse events. Nothing here writes game state.
(() => {
  const R = window.__realms;
  const C = R.content;
  const T = 16;
  const passable = (z, x, y) => { const zz = C.zones[z]; if (!zz || x < 0 || y < 0 || x >= zz.w || y >= zz.h) return false; return zz.collision[y][x] === '.'; };
  // NPCs stand on tiles; do not plan through them (they block nothing in the sim, but a path through a crowd snags less)
  function bfs(z, sx, sy, goal) {
    const zz = C.zones[z];
    const W = zz.w, H = zz.h;
    const prev = new Int32Array(W * H).fill(-1);
    const q = [sy * W + sx];
    prev[sy * W + sx] = sy * W + sx;
    let found = -1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = c % W, y = (c / W) | 0;
      if (goal(x, y)) { found = c; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!passable(z, nx, ny)) continue;
        const k = ny * W + nx;
        if (prev[k] !== -1) continue;
        prev[k] = c; q.push(k);
      }
    }
    if (found < 0) return null;
    const path = [];
    for (let c = found; ; c = prev[c]) { path.push([c % W, (c / W) | 0]); if (prev[c] === c) break; }
    return path.reverse();
  }
  const ROUTE = { willowmere: { valley: 'valley', downs: 'downs' }, valley: { willowmere: 'willowmere', downs: 'downs' } };
  let plan = null, lastPos = null, still = 0;
  const me = () => R.player();
  const tileOf = (p) => [Math.floor(p.x / T), Math.floor((p.y - 1) / T)];
  function regionsBy(pred) { return (R.ui.regions || []).filter(pred); }
  function hudToCss(hx, hy) { const l = R.renderer.layout; const d = window.devicePixelRatio || 1; return [(l.ox + hx * l.base) / d, (l.oy + hy * l.base) / d]; }
  function worldToCss(wx, wy) { const l = R.renderer.layout, cam = R.renderer.camera, d = window.devicePixelRatio || 1; return [((wx - cam.x) * l.ws + l.worldOx) / d, ((wy - cam.y) * l.ws + l.worldOy) / d]; }
  window.__drv = {
    me() { const p = me(); if (!p) return null; const [tx, ty] = tileOf(p); const h = R.hud(); return { id: p.id, zone: p.zone, x: p.x, y: p.y, tx, ty, dead: p.dead, hp: p.hp, hpMax: p.hpMax, level: p.level, xp: p.xp, gold: p.gold, target: p.target, res: p.res, inCombat: p.inCombat, autoOn: p.autoOn, cast: !!p.cast, bar: p.bar, known: p.known, quests: h ? h.quests : null, talents: p.talents, bagN: (p.bag || []).length, questsDone: p.questsDone, equip: Object.keys(p.equip || {}).sort(), b2: !!p.b2, build: p.build || null }; },
    npc(template) { const e = R.snapshot().entities.find((o) => o.kind === 'npc' && o.template === template); return e ? { id: e.id, zone: e.zone, tx: Math.floor(e.x / T), ty: Math.floor((e.y - 1) / T), x: e.x, y: e.y } : null; },
    /** Live mobs of a template in my zone, nearest first. */
    mobs(template, maxLevel = 99) {
      const p = me(); if (!p) return [];
      return R.snapshot().entities.filter((e) => e.kind === 'mob' && !e.dead && e.zone === p.zone && (!template || e.template === template) && e.level <= maxLevel)
        .map((e) => ({ id: e.id, template: e.template, level: e.level, x: e.x, y: e.y, tx: Math.floor(e.x / T), ty: Math.floor((e.y - 1) / T), hp: e.hp, d: Math.hypot(e.x - p.x, e.y - p.y), aggro: e.aggro }))
        .sort((a, b) => a.d - b.d);
    },
    ent(id) { const e = R.snapshot().entities.find((o) => o.id === id); return e ? { id: e.id, dead: e.dead, hp: e.hp, hpMax: e.hpMax, x: e.x, y: e.y, zone: e.zone, kind: e.kind, aiMode: e.aiMode, aggro: e.aggro, level: e.level } : null; },
    /** Plan a walk to (zone, tx, ty), stopping within `near` tiles. */
    plan(zone, tx, ty, near = 0) {
      // one world: a spot given in an area's own tiles ('valley', 6, 52) moves onto the world map
      if (!C.zones[zone] && C.regionAt && C.regionAt[zone]) { const [ox, oy] = C.regionAt[zone]; zone = C.worldId; tx += ox; ty += oy; }
      const p = me(); if (!p) return false;
      const [sx, sy] = tileOf(p);
      plan = { final: [zone, tx, ty, near], path: null, i: 0, joinDir: null, zone: p.zone };
      if (p.zone === zone) {
        plan.path = bfs(p.zone, sx, sy, (x, y) => Math.abs(x - tx) + Math.abs(y - ty) <= near && passable(zone, x, y));
      } else {
        const via = (ROUTE[p.zone] || {})[zone] || zone;
        const j = (C.zones[p.zone].joins || []).find((o) => o.to === via);
        if (!j) return false;
        plan.path = bfs(p.zone, sx, sy, (x, y) => x >= j.x && x < j.x + j.w && y >= j.y && y < j.y + j.h);
        plan.joinDir = j.x === 0 ? 'KeyA' : j.y === 0 ? 'KeyW' : j.x >= C.zones[p.zone].w - 1 ? 'KeyD' : 'KeyS';
      }
      lastPos = null; still = 0;
      return !!plan.path;
    },
    /** Keys to hold now to follow the plan: { keys, done, stuck }. */
    steer() {
      const p = me();
      if (!p || !plan) return { keys: [], done: true };
      if (p.zone !== plan.zone) { const [z, tx, ty, n] = plan.final; this.plan(z, tx, ty, n); return { keys: [], done: false, rezoned: true }; }
      if (!plan.path) return { keys: [], done: true, fail: true };
      // stuck check
      if (lastPos && Math.hypot(p.x - lastPos[0], p.y - lastPos[1]) < 0.5) still++; else still = 0;
      lastPos = [p.x, p.y];
      while (plan.i < plan.path.length) {
        const [wx, wy] = plan.path[plan.i];
        const cx = wx * T + 8, cy = wy * T + 11;
        if (Math.abs(p.x - cx) <= 3 && Math.abs(p.y - cy) <= 3) plan.i++; else break;
      }
      if (plan.i >= plan.path.length) {
        if (plan.joinDir && p.zone === plan.zone) return { keys: [plan.joinDir], done: false };
        return { keys: [], done: true };
      }
      const [wx, wy] = plan.path[plan.i];
      const cx = wx * T + 8, cy = wy * T + 11;
      const keys = [];
      if (p.x < cx - 2) keys.push('KeyD'); else if (p.x > cx + 2) keys.push('KeyA');
      if (p.y < cy - 2) keys.push('KeyS'); else if (p.y > cy + 2) keys.push('KeyW');
      return { keys, done: false, stuck: still > 25 };
    },
    hudToCss, worldToCss,
    /** CSS point of a HUD region found by label / kind / id. */
    region(sel) {
      const labelOk = (o) => (sel.labelStarts != null ? String(o.label || '').startsWith(sel.labelStarts) : sel.label == null || o.label === sel.label);
      const r = regionsBy((o) => labelOk(o) && (sel.kind == null || o.kind === sel.kind) && (sel.id == null || o.id === sel.id)).pop();
      if (!r) return null;
      return hudToCss(r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2);
    },
    labels() { return (R.ui.regions || []).filter((o) => o.label).map((o) => o.label); },
    /** The desktop HUD on its layer (wide layer check, Scott 2026-11-21): every HUD box inside the layer and anchored to
     *  its edge, no two overlapping, and every open window where its 640x360 design puts it, centred on the layer. */
    hudCheck() {
      const l = R.renderer.layout, W = l.hudW, H = l.hudH, regs = R.ui.regions || [];
      const ox = Math.max(0, Math.floor((W - 640) / 2)), oy = Math.max(0, Math.floor((H - 360) / 2));
      // the whole 8-slot bar from any slot on it (empty slots have no region): slot n sits at x0 + (n - 1) * 29
      const barBox = (ss) => { if (!ss.length) return null; const s = ss[0]; const x0 = s.rect.x - (s.slot - 1) * (s.rect.w + 3);
        return { x: x0, y: s.rect.y, w: 8 * s.rect.w + 7 * 3, h: s.rect.h }; };
      const union = (rs) => { if (!rs.length) return null; const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
        return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y }; };
      // only the HUD itself (the regions hud.js draws before any window)
      const firstWin = regs.findIndex((o) => o.kind === 'window');
      const hudRegs = firstWin < 0 ? regs : regs.slice(0, firstWin);
      const of = (k) => hudRegs.filter((o) => o.kind === k).map((o) => o.rect);
      const boxes = { player: of('player')[0], target: of('target')[0], minimap: of('minimap')[0], chat: union(of('chat')), xp: of('xp')[0],
        tracker: union([...of('tracker_head'), ...of('tracker_quest')]), bar: barBox(hudRegs.filter((o) => o.kind === 'slot' && o.slot)) };
      of('party').forEach((r, i) => { boxes[`party${i}`] = r; });
      const problems = [];
      for (const [k, b] of Object.entries(boxes)) {
        if (!b) { problems.push(`${k} missing`); continue; }
        if (b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H) problems.push(`${k} outside ${W}x${H}: ${JSON.stringify(b)}`);
      }
      const ks = Object.keys(boxes).filter((k) => boxes[k]);
      const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (ov(boxes[ks[i]], boxes[ks[j]])) problems.push(`${ks[i]} overlaps ${ks[j]}`);
      const B = boxes, gap = { player: B.player && [B.player.x, B.player.y], minimapRight: B.minimap && W - B.minimap.x - B.minimap.w,
        trackerRight: B.tracker && W - B.tracker.x - B.tracker.w, barBottom: B.bar && H - B.bar.y - B.bar.h, barCentre: B.bar && Math.round(B.bar.x + B.bar.w / 2 - W / 2),
        chatLeft: B.chat && B.chat.x, chatBottom: B.chat && H - B.chat.y - B.chat.h, xpBottom: B.xp && H - B.xp.y - B.xp.h, xpW: B.xp && B.xp.w };
      if (gap.player && (gap.player[0] > 6 || gap.player[1] > 6)) problems.push(`player frame not top left: ${gap.player}`);
      if (gap.minimapRight > 6) problems.push(`minimap not at the right edge: ${gap.minimapRight}`);
      if (gap.trackerRight > 6) problems.push(`tracker not at the right edge: ${gap.trackerRight}`);
      if (gap.barBottom > 20 || Math.abs(gap.barCentre) > 1) problems.push(`bar not bottom centre: ${gap.barBottom} ${gap.barCentre}`);
      if (gap.chatLeft > 6 || gap.chatBottom > 70) problems.push(`chat not bottom left: ${gap.chatLeft} ${gap.chatBottom}`);
      if (gap.xpBottom > 2 || gap.xpW !== W) problems.push(`xp bar not along the bottom: ${gap.xpBottom} ${gap.xpW}`);
      const windows = {};
      for (const o of regs) if (o.kind === 'window' && o.id && !windows[o.id]) {
        windows[o.id] = o.rect;
        const d = R.ui.rect(o.id);
        // Character keeps its design corner; Bags its design x and its bottom at 340 (its height follows the bag size)
        if (o.id === 'character' && (o.rect.x !== d.x + ox || o.rect.y !== d.y + oy)) problems.push(`character window at ${o.rect.x},${o.rect.y}, its design spot is ${d.x + ox},${d.y + oy}`);
        if (o.id === 'bags' && (o.rect.x !== d.x + ox || o.rect.y + o.rect.h !== Math.max(20 + o.rect.h, 340) + oy)) problems.push(`bags window at ${o.rect.x},${o.rect.y}+${o.rect.h}, its design x is ${d.x + ox}, bottom ${340 + oy}`);
        if (o.rect.x < 0 || o.rect.y < 0 || o.rect.x + o.rect.w > W || o.rect.y + o.rect.h > H) problems.push(`${o.id} window outside the layer`);
      }
      return { layer: { W, H, base: l.base, ox: l.ox, oy: l.oy }, design: { x: ox, y: oy }, boxes, gap, windows, problems };
    },
    /** CSS point on an entity's body (for clicks / taps). */
    entCss(id) { const a = R.renderer.anchorOf(id); if (!a) return null; return worldToCss(a.x, a.y - Math.max(4, Math.round(a.h / 2))); },
    /** True when a CSS point lands on a HUD box: a tap there goes to the HUD (a bar slot, the tracker), not the world. */
    onHud(cx, cy) { const l = R.renderer.layout, d = window.devicePixelRatio || 1; const hx = (cx * d - l.ox) / l.base, hy = (cy * d - l.oy) / l.base; return (R.ui.regions || []).some((o) => o.rect && hx >= o.rect.x && hx < o.rect.x + o.rect.w && hy >= o.rect.y && hy < o.rect.y + o.rect.h); },
    dialog() { const d = R.ui.state.dialog; return d ? { page: d.page, npc: d.npc, offers: d.offers, turnins: d.turnins, quest: d.quest, vendor: !!d.vendor, trainer: !!d.trainer } : null; },
    mode() { return R.ui.mode; },
    log(n = 12) { return R.ui.logText().slice(-n); },
  };
})();

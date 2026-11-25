// Replays on screen (wave 8, replay lane; D:/LQOnline/wave8/replay/BRIEF.md, stills 1 to 3). Scott 2026-11-24: go on the
// stills; unpinned replays expire with a clear message when the game changes, "Keep forever" bakes frames while the build
// still matches; every boss and rare pull records by itself, the newest 40 kept, and a key records any fight.
//
//   const R = await createReplayUi({ world, content, renderer, view, ui, input, canvas, font, heroId, liveHero, isGuest,
//                                    build, createHorizonCam })
//   R.render(alpha, nowMs) -> true when the viewer drew this frame (main.js render() then draws nothing else)
//   R.openList()   the Replays window (the Options button, Shift+R)      R.recorder: src/replay/recorder.js
//
// Keys: R records this fight (again: stop and keep it), Shift+R the list. In the viewer: Space play or pause, , and .
// one tick, Left and Right 5 s, Esc back to the list. While the list or the viewer is up a see-through layer
// (data-overlay) takes the pointer and the keys, so the game below never sees them; the live world keeps running under
// it (a co-op game cannot stop), and a hit on the live hero closes the viewer.
// Every word a player reads here is a DRAFT for Scott (listed in the lane report).
import { loadUiArt } from '../ui/uiassets.js';
import { createGfx } from '../ui/gfx.js';
import { applySkin, skinFromOptions, textSizeFrom } from '../ui/skin.js';
import { effectiveBinds } from '../ui/keymap.js';
import { createRecorder } from './recorder.js';
import { createReplayStore } from './store.js';
import { openPlayer, bake } from './player.js';
import { HZ, EXT, mmss, sizeText, badFile, pack, unpack } from './format.js';
import { KEEP } from './store.js';

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const inR = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export const WORDS = {   // DRAFT words (Scott has not written these)
  title: 'Replays', rec: 'REC', replay: 'REPLAY',
  used: (n, b, p) => `${n} of ${KEEP} kept${p ? `, ${p} forever` : ''}, ${sizeText(b)}`,
  foot: 'Kept on this device. Boss and rare fights record by themselves; R records any fight.',
  footShort: 'Kept on this device. Bosses and rares record by themselves.',
  open: 'Open a file a friend sent you: drop it here, or Open file.',
  none: 'No replays yet. Pull a boss or a rare, or press R in a fight.',
  watch: 'Watch', keep: 'Keep forever', kept: 'Kept forever', save: 'Save file', del: 'Delete', delSure: 'Sure? Delete', openFile: 'Open file', close: 'Close',
  expired: 'The game changed after this fight. It plays as far as it still matches.',
  keptLine: 'Kept forever: it plays after any update.',
  matches: 'Matches the fight', changed: (t) => `The game changed after this fight; it plays to ${t}`,
  keys: 'Space play or pause, , and . one step, drag to look, Esc back',
  keysPhone: 'Drag to look',
  loading: (p) => `Loading the fight... ${Math.round(p * 100)}%`, keeping: (p) => `Keeping it... ${Math.round(p * 100)}%`,
  tooLate: 'Too late to keep: the game changed after this fight.', pinCount: 'You can keep 20 forever. Delete one first.',
  pinBytes: 'Not enough room to keep it. Delete a kept one first.', keptOk: 'Kept forever.',
  badFile: (w) => w, opened: 'Replay added from the file.', saved: (t) => `Replay kept: ${t}`, recStart: 'Recording this fight (R again to stop).',
  recStop: 'Recording stopped.', recFail: 'Recording stopped: a dev helper changed the world.', combat: 'Not in combat.',
  attacked: 'You are under attack. The replay closed.', guestRec: 'Only the host records in a co-op game.',
  cam: 'Camera', follow: 'Follow', orbit: 'Orbit', boss: 'Boss', hud: 'HUD', pull: 'Pull', hero: 'Hero', bossKey: 'Boss', kill: (t) => `Kill ${t}`,
  fight: 'Fight', heroCol: 'Hero', result: 'Result', when: 'When', size: 'Size', from: (n) => `(from ${n})`,
  rKill: 'Kill', rWipe: 'Wipe', rFight: 'Fight', rOld: 'Expired', rare: '(rare)', today: 'Today', back: 'Back',
};

function whenText(ms, now = Date.now()) {
  const d = new Date(ms), n = new Date(now);
  let h = d.getHours(); const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12;
  const t = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
  if (d.toDateString() === n.toDateString()) return `${WORDS.today} ${t}`;
  if (now - ms < 6 * 86400000) return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${t}`;
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getDate()}`;
}

export async function createReplayUi(o) {
  const { world, content, renderer, view, ui, input, canvas, font } = o;
  const art = await loadUiArt({ font });
  const g = createGfx(art);
  const store = createReplayStore();
  const clsName = (c) => ((content.classes || {})[c] || {}).name || c || '';
  const toast = (t, s = 4) => ui.notify(t, s);
  const curBuild = () => o.build() || 'local';

  const recorder = createRecorder({ world, content, heroId: o.heroId, isGuest: o.isGuest, build: o.build,
    onSaved: (file) => { store.put(file).then((row) => { toast(WORDS.saved(row.title)); if (S.mode === 'list') refresh(); }).catch((e) => console.warn('replay store', e)); },
    note: (k) => { if (k === 'dev') toast(WORDS.recFail); } });

  const S = { mode: null, rows: [], usage: { kept: 0, pinned: 0, bytes: 0 }, sel: 0, scroll: 0, msg: null, busy: null, sure: null, regions: [], drag: null };
  const V = { P: null, row: null, playing: true, speed: 1, acc: 0, last: 0, k: 0, prev: null, snap: null, cam: 'follow', hud: true, savedCam: null, hcam: null };

  // ---- the see-through layer: takes the pointer and the keys while the list or the viewer is up
  let layer = null, fileIn = null;
  function addLayer() {
    if (layer || typeof document === 'undefined') return;
    layer = document.createElement('div');
    layer.setAttribute('data-overlay', 'replay');
    layer.tabIndex = 0;
    layer.style.cssText = 'position:fixed;inset:0;z-index:30;background:transparent;outline:none;touch-action:none;user-select:none';
    layer.addEventListener('pointerdown', onDown);
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
    layer.addEventListener('pointercancel', onUp);
    layer.addEventListener('wheel', onWheel, { passive: false });
    layer.addEventListener('keydown', onLayerKey);
    layer.addEventListener('keyup', (ev) => ev.stopPropagation());
    layer.addEventListener('contextmenu', (ev) => ev.preventDefault());
    layer.addEventListener('dragover', (ev) => { ev.preventDefault(); });
    layer.addEventListener('drop', (ev) => { ev.preventDefault(); const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) openFile(f); });
    fileIn = document.createElement('input');
    fileIn.type = 'file'; fileIn.accept = `${EXT},application/gzip,application/json`; fileIn.style.display = 'none';
    fileIn.addEventListener('change', () => { const f = fileIn.files && fileIn.files[0]; if (f) openFile(f); fileIn.value = ''; });
    layer.appendChild(fileIn);
    document.body.appendChild(layer);
    // keys held as the layer opened would walk the hero on: let them go
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) input.release(c);
    layer.focus();
  }
  function dropLayer() { if (layer) { layer.remove(); layer = null; fileIn = null; } }

  // ---- list
  async function refresh() {
    try { S.rows = await store.list(); S.usage = await store.usage(); } catch (e) { S.rows = []; console.warn('replay list', e); }
    S.sel = Math.max(0, Math.min(S.rows.length - 1, S.sel));
  }
  function liveFighting() { const h = o.liveHero(); return !!(h && h.inCombat && !h.dead); }
  async function openList() {
    if (liveFighting()) { toast(WORDS.combat); return; }
    if (ui.isOpen('menu')) ui.act.close('menu');
    S.mode = 'list'; S.msg = null; S.sure = null; S.busy = null;
    addLayer();
    await refresh();
  }
  function closeAll() {
    if (S.mode === 'view') leaveView();
    S.mode = null; dropLayer();
  }
  const selRow = () => S.rows[S.sel] || null;
  const expired = (r) => !r.pinned && r.build !== curBuild();

  async function watch(row) {
    if (!row || S.busy) return;
    S.busy = WORDS.loading(0); S.msg = null;
    try {
      const file = await store.get(row.id);
      const why = badFile(file);
      if (why) { S.msg = why; return; }
      const P = await openPlayer(file, content, { onProgress: (p) => { S.busy = WORDS.loading(p); } });
      enterView(P, row);
    } catch (e) { console.warn('replay open', e); S.msg = 'That replay could not be opened.'; }
    finally { S.busy = null; }
  }
  async function keep(row) {
    if (!row || row.pinned || S.busy) return;
    S.busy = WORDS.keeping(0); S.msg = null;
    try {
      const file = await store.get(row.id);
      let baked;
      try { baked = await bake(file, content, { onProgress: (p) => { S.busy = WORDS.keeping(p); } }); } catch { S.msg = WORDS.tooLate; return; }
      const r = await store.pin(row.id, baked);
      S.msg = r.ok ? WORDS.keptOk : r.why === 'count' ? WORDS.pinCount : WORDS.pinBytes;
      await refresh();
    } catch (e) { console.warn('replay keep', e); S.msg = 'That replay could not be kept.'; }
    finally { S.busy = null; }
  }
  async function saveFile(row) {
    if (!row) return;
    const file = await store.get(row.id);
    if (!file) return;
    const bytes = await pack(file);
    const name = `${(row.title || 'replay').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${row.hero ? row.hero.name : ''}${EXT}`;
    const blob = new Blob([bytes], { type: 'application/gzip' });
    try {
      const f = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/gzip' }) : null;
      if (f && navigator.canShare && navigator.canShare({ files: [f] }) && o.touch) { await navigator.share({ files: [f] }); return; }
    } catch { /* the share sheet was closed: fall back to a download */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function openFile(f) {
    try {
      if (f.size > 20 * 1024 * 1024) { S.msg = 'That file is too big to be a replay.'; return; }
      const file = await unpack(await f.arrayBuffer());
      const why = badFile(file);
      if (why) { S.msg = why; return; }
      const meta = { ...file.meta, id: `f${Date.now().toString(36)}`, when: Date.now(), friend: true };
      await store.put({ ...file, meta }, { friend: true });
      S.msg = WORDS.opened; S.sel = 0;
      await refresh();
    } catch (e) { console.warn('replay file', e); S.msg = 'That is not a replay file.'; }
  }
  async function remove(row) {
    if (!row) return;
    if (S.sure !== row.id) { S.sure = row.id; return; }
    S.sure = null;
    await store.remove(row.id);
    await refresh();
  }

  // ---- viewer
  function enterView(P, row) {
    V.P = P; V.row = row; V.playing = true; V.speed = 1; V.acc = 0; V.last = 0; V.cam = 'follow';
    const s = P.seek(P.baked ? 1 : 0); V.prev = s.prev; V.snap = s.snap; V.k = s.k;
    V.savedCam = view.cam; V.savedFollow = view.followId;
    if (!V.hcam && renderer.is3d && o.createHorizonCam) V.hcam = o.createHorizonCam({ touch: !!o.touch });
    renderer.setPlayer(P.heroId);
    S.mode = 'view';
  }
  function leaveView() {
    view.cam = V.savedCam; view.replayCam = false;
    const id = o.heroId(); if (id != null) renderer.setPlayer(id);
    V.P = null; S.mode = layer ? 'list' : null;
  }
  function seekTo(k) { if (!V.P) return; const s = V.P.seek(k); V.prev = s.snap; V.snap = s.snap; V.k = s.k; V.acc = 0; }
  function stepOne(d) { V.playing = false; seekTo(V.k + d); }
  const first = () => (V.P && V.P.baked ? 1 : 0);

  // the live game's own effects stay off the replay (the renderer keeps one effect state)
  const feed0 = renderer.feed.bind(renderer);
  renderer.feed = (ev) => { if (S.mode !== 'view') feed0(ev); };

  function render(alpha, nowMs) {
    if (S.mode !== 'view' || !V.P) return false;
    if (liveFighting()) { closeAll(); toast(WORDS.attacked, 5); return false; }
    const P = V.P;
    const dt = V.last ? Math.min(0.25, (nowMs - V.last) / 1000) : 0;
    V.last = nowMs;
    if (V.playing) {
      V.acc += dt * V.speed * HZ;
      let n = 0;
      while (V.acc >= 1 && V.k < P.okTo) {
        V.acc -= 1; n++;
        const s = P.seek(V.k + 1); V.prev = s.prev; V.snap = s.snap; V.k = s.k;
        if (n <= 3) feed0(s.events);
      }
      if (V.k >= P.okTo) { V.playing = false; V.acc = 0; }
    }
    const snap = V.snap;
    const hero = snap.entities.find((e) => e.id === P.heroId);
    const boss = P.bossId != null ? snap.entities.find((e) => e.id === P.bossId && !e.dead) : null;
    const focus = (V.cam === 'boss' && boss) || hero || boss || snap.entities[0];
    view.zone = focus ? focus.zone : view.zone; view.followId = focus ? focus.id : null;
    view.targetId = hero && hero.target != null ? hero.target : null;
    view.time = nowMs / 1000; view.stage = null; view.talk = null;
    view.cam = V.cam === 'orbit' && V.hcam ? V.hcam : null; view.replayCam = V.cam === 'orbit';
    renderer.draw(V.prev, snap, V.playing ? Math.min(1, V.acc) : 1, view);
    renderer.drawHud((ctx, L) => drawView(ctx, L));
    return true;
  }

  // ---- drawing helpers
  const Lui = () => { try { return ui.layout(); } catch { return { touch: !!o.touch, minHit: 15 }; } };
  function button(ctx, x, y, w, h, label, on, { lit = false, color = null, off = false } = {}) {
    g.window(ctx, x, y, w, h, 'thin', lit ? 'violet' : 'slate', off ? 0.5 : 0.95);
    g.text(ctx, g.clip(label, w - 6), x + Math.floor(w / 2), y + Math.floor(h / 2) - g.mid(6), off ? 'dim' : color || (lit ? 'white' : 'cream'), { align: 'center' });
    if (on && !off) S.regions.push({ rect: { x, y, w, h }, on });
    return w;
  }
  const bw = (label, pad = 12) => g.textW(label) + pad;

  function timeline(ctx, x, y, w, h, big) {
    const P = V.P, N = P.N;
    g.rect(ctx, x, y, w, h, 'rgba(10,8,18,0.7)');
    const line = (key, col) => {
      ctx.fillStyle = col;
      for (let px = 0; px < w; px++) { const t = P.track[Math.min(N - 1, Math.floor((px / w) * N))]; if (!t) continue; ctx.fillRect(x + px, y + 1 + Math.round((1 - t[key]) * (h - 3)), 1, big ? 2 : 1); }
    };
    if (P.bossId != null) line('b', 'rgba(226,92,72,0.95)');
    line('h', 'rgba(120,214,128,0.85)');
    for (const m of P.marks) {
      const mx = x + Math.round((m.k / N) * w);
      if (m.kind === 'cast') g.rect(ctx, mx, y + h, 1, 3, 'rgba(249,215,122,0.6)');
      if (m.kind === 'down') g.rect(ctx, mx - 1, y - 3, 3, 3, '#e25c48');
      if (m.kind === 'kill') { ctx.fillStyle = '#f9d77a'; for (let r = 0; r < 5; r++) ctx.fillRect(mx - Math.min(r, 4 - r), y - 6 + r, 1 + 2 * Math.min(r, 4 - r), 1); }
    }
    if (P.okTo < N) g.rect(ctx, x + Math.round((P.okTo / N) * w), y, w - Math.round((P.okTo / N) * w), h, 'rgba(10,8,18,0.75)');
    g.rect(ctx, x, y, Math.round((V.k / N) * w), h, 'rgba(249,215,122,0.10)');
    const hx = x + Math.round((V.k / N) * w);
    g.rect(ctx, hx, y - 2, 1, h + 4, '#f9d77a');
    g.rect(ctx, hx - 2, y + h + 1, 5, 3, '#f9d77a');
    S.regions.push({ rect: { x, y: y - 6, w, h: h + 12 }, drag: (hxp) => { V.playing = false; seekTo(Math.round(((hxp - x) / w) * N)); } });
  }
  function playIcon(ctx, x, y, playing) {
    ctx.fillStyle = '#f9d77a';
    if (playing) { ctx.fillRect(x, y, 3, 10); ctx.fillRect(x + 5, y, 3, 10); return; }
    for (let r = 0; r < 10; r++) ctx.fillRect(x, y + r, Math.max(1, Math.round(Math.min(r, 9 - r) * 0.9)) + 1, 1);
  }
  function unitFrame(ctx, x, y, w, e, title, sub, col, resFrac = null) {
    const gh = g.gaugeHeight(true), h = g.ls(17) + gh + (resFrac != null ? gh + 2 : 0) + 4;
    g.window(ctx, x, y, w, h, 'thin', 'slate', 0.9);
    g.text(ctx, g.clip(title, w - g.textW(sub) - 16), x + 6, y + 4, col);
    g.text(ctx, sub, x + w - 6, y + 4, 'gray', { align: 'right' });
    g.gauge(ctx, x + 6, y + g.ls(16), w - 12, e.hpMax ? Math.max(0, e.hp) / e.hpMax : 0, 'hp', true);
    if (resFrac != null) g.gauge(ctx, x + 6, y + g.ls(16) + gh + 2, w - 12, resFrac, 'mp', true);
    return h;
  }
  function drawHeroHud(ctx, L) {
    const P = V.P, snap = V.snap, touch = Lui().touch;
    const hero = snap.entities.find((e) => e.id === P.heroId);
    const top = touch ? g.ls(30) + 6 : 6, fw = touch ? 176 : 150;
    let y = top;
    if (hero) {
      const rf = hero.res && hero.res.max ? Math.max(0, Math.min(1, hero.res.cur / hero.res.max)) : null;
      y += unitFrame(ctx, 6, y, fw, hero, `${hero.name}, ${clsName(hero.cls)} ${hero.level}`, `${Math.max(0, Math.round(hero.hp))}/${hero.hpMax}`, 'cream', rf) + 2;
    }
    const boss = P.bossId != null ? snap.entities.find((e) => e.id === P.bossId) : null;
    if (boss) {
      const bw0 = touch ? 176 : 160, bx = touch ? L.hudW - bw0 - 6 : Math.floor(L.hudW / 2) - 80;
      const by = top;
      const h = unitFrame(ctx, bx, by, bw0, boss, boss.name, boss.dead ? '0%' : `${Math.max(1, Math.round((100 * boss.hp) / boss.hpMax))}%`, 'red');
      if (boss.cast && boss.cast.ability) {
        const ab = (content.mobAbilities || {})[boss.cast.ability] || (content.abilities || {})[boss.cast.ability] || {};
        const span = Math.max(1, (boss.cast.endTick || 0) - (boss.cast.startTick || 0));
        const f = Math.max(0, Math.min(1, (snap.tick - (boss.cast.startTick || 0)) / span));
        g.window(ctx, bx, by + h + 1, bw0, g.ls(14), 'thin', 'violet', 0.9);
        g.rect(ctx, bx + 2, by + h + 3, Math.round((bw0 - 4) * f), g.ls(14) - 4, 'rgba(249,215,122,0.35)');
        g.text(ctx, g.clip(ab.name || boss.cast.ability, bw0 - 10), bx + Math.floor(bw0 / 2), by + h + 3, 'white', { align: 'center' });
      }
    }
  }

  function drawView(ctx, L) {
    S.regions = [];
    const touch = Lui().touch, minHit = Lui().minHit || 15;
    g.setTextSize(textSizeFrom(ui.options, touch));
    g.textScope(() => {
      const P = V.P, W = L.hudW, H = L.hudH, row = V.row;
      if (V.hud) drawHeroHud(ctx, L);
      // the ribbon: what this is
      const title = row.title, sub = `${row.place}. ${row.hero.name}, ${clsName(row.hero.cls)} ${row.hero.level}${row.heroes && row.heroes.length > 1 ? `, ${row.heroes.length} heroes` : ', solo'}.`;
      const lw = g.textW(WORDS.replay) + 10;
      const rw = Math.min(W - 16, Math.max(g.textW(title, true) + 2 * lw + 12, g.textW(sub) + 2 * lw));
      const rx = touch ? Math.floor((W - rw) / 2) : 8, ry = touch ? 2 : H - g.ls(54) - g.ls(34);
      g.window(ctx, rx, ry, rw, g.ls(30), 'thin', 'slate', 0.9);
      g.text(ctx, WORDS.replay, rx + 5, ry + 5, 'red', { small: true });
      g.text(ctx, g.clip(title, rw - 2 * lw, true), rx + Math.floor(rw / 2), ry + 3, 'gold', { align: 'center', large: true });
      g.text(ctx, g.clip(sub, rw - 2 * lw), rx + Math.floor(rw / 2), ry + g.ls(17), 'gray', { align: 'center', small: true });
      const ok = P.okTo >= P.N;
      if (touch) {
        const bh = Math.max(18, Math.min(26, minHit)), y = H - bh - 16;
        g.window(ctx, 4, y - 4, W - 8, bh + 18, 'std', 'slate', 0.86);
        button(ctx, 8, y, bh + 6, bh, '', () => { V.playing = !V.playing; if (V.k >= P.okTo) seekTo(first()); });
        playIcon(ctx, 8 + Math.floor((bh + 6) / 2) - 4, y + Math.floor(bh / 2) - 5, V.playing);
        g.text(ctx, `${mmss(V.k)} / ${mmss(P.N)}`, bh + 20, y + Math.floor(bh / 2) - g.mid(6), 'cream');
        let x = W - 8;
        const cams = camList();
        x -= bw(WORDS.back, 16); button(ctx, x, y, bw(WORDS.back, 16), bh, WORDS.back, () => leaveView());
        x -= 4 + bw(`Cam: ${camLabel(V.cam)}`, 14); button(ctx, x, y, bw(`Cam: ${camLabel(V.cam)}`, 14), bh, `Cam: ${camLabel(V.cam)}`, () => { V.cam = cams[(cams.indexOf(V.cam) + 1) % cams.length]; });
        x -= 4 + 36; button(ctx, x, y, 36, bh, `${V.speed}x`, () => { V.speed = SPEEDS[(SPEEDS.indexOf(V.speed) + 1) % SPEEDS.length]; }, { lit: true });
        if (!ok) g.text(ctx, g.clip(WORDS.changed(mmss(P.okTo)), W - 16), W / 2, y - g.ls(16), 'orange', { align: 'center', small: true });
        timeline(ctx, 12, y + bh + 4, W - 24, 6, false);
        return;
      }
      const ph = g.ls(54), py = H - ph - 6;
      g.text(ctx, WORDS.keys, W - 12, py - g.ls(10), 'dim', { align: 'right', small: true });
      g.window(ctx, 8, py, W - 16, ph, 'std', 'slate', 0.97);
      const bh = g.ls(13), ty = py + 7;
      button(ctx, 14, ty - 1, 18, bh + 1, '', () => { V.playing = !V.playing; if (V.k >= P.okTo) seekTo(first()); });
      playIcon(ctx, 19, ty + Math.floor(bh / 2) - 5, V.playing);
      g.text(ctx, `${mmss(V.k)} / ${mmss(P.N)}`, 38, ty + 1, 'cream', { small: true });
      let x = 38 + g.textW('00:00 / 00:00') + 6;
      for (const s of SPEEDS) x += button(ctx, x, ty - 1, bw(`${s}x`, 8), bh, `${s}x`, () => { V.speed = s; }, { lit: s === V.speed }) + 2;
      x += 8;
      g.text(ctx, WORDS.cam, x, ty + 1, 'gray', { small: true }); x += g.textW(WORDS.cam) + 4;
      for (const c of camList()) x += button(ctx, x, ty - 1, bw(camLabel(c), 8), bh, camLabel(c), () => { V.cam = c; }, { lit: c === V.cam }) + 2;
      x += 8;
      x += button(ctx, x, ty - 1, bw(WORDS.hud, 8), bh, WORDS.hud, () => { V.hud = !V.hud; }, { lit: V.hud }) + 2;
      x += button(ctx, x, ty - 1, bw(WORDS.back, 8), bh, WORDS.back, () => leaveView()) + 2;
      g.text(ctx, g.clip(ok ? WORDS.matches : WORDS.changed(mmss(P.okTo)), Math.max(40, W - 18 - x - 6)), W - 18, ty + 1, ok ? 'green' : 'orange', { align: 'right', small: true });
      const tly = py + g.ls(25);
      timeline(ctx, 16, tly, W - 32, 13, true);
      const ly = tly + 15;
      g.text(ctx, WORDS.pull, 18, ly, 'dim', { small: true });
      if (P.bossId != null) g.text(ctx, WORDS.bossKey, W - 20, ly, 'red', { align: 'right', small: true });
      g.text(ctx, WORDS.hero, W - 20 - (P.bossId != null ? g.textW(WORDS.bossKey) + 8 : 0), ly, 'green', { align: 'right', small: true });
      const kill = P.marks.find((m) => m.kind === 'kill');
      if (kill) g.text(ctx, WORDS.kill(mmss(kill.k)), 16 + Math.round((kill.k / P.N) * (W - 32)), ly, 'gold', { align: 'center', small: true });
    });
  }
  function camList() { const c = ['follow']; if (V.hcam) c.push('orbit'); if (V.P && V.P.bossId != null) c.push('boss'); return c; }
  const camLabel = (c) => ({ follow: WORDS.follow, orbit: WORDS.orbit, boss: WORDS.boss })[c];

  function drawList(ctx, L) {
    S.regions = [];
    const touch = Lui().touch, minHit = Lui().minHit || 15;
    g.setTextSize(textSizeFrom(ui.options, touch));
    g.textScope(() => {
      const W = L.hudW, H = L.hudH;
      const ww = Math.min(W - 12, touch ? W - 12 : 500), wh = Math.min(H - 12, touch ? H - 12 : 290);
      const x = Math.floor((W - ww) / 2), y = Math.floor((H - wh) / 2);
      g.rect(ctx, 0, 0, W, H, 'rgba(10,8,18,0.45)');
      g.window(ctx, x, y, ww, wh, 'std', 'blue', 0.96);
      g.text(ctx, WORDS.title, x + 12, y + 7, 'gold', { large: true });
      const bh = touch ? Math.max(18, Math.min(24, minHit)) : g.ls(15);
      button(ctx, x + ww - 10 - bw(WORDS.close), y + 5, bw(WORDS.close), bh, WORDS.close, () => closeAll());
      g.text(ctx, WORDS.used(S.usage.kept, S.usage.bytes, S.usage.pinned), x + ww - 16 - bw(WORDS.close), y + 9, 'gray', { align: 'right', small: true });
      const narrow = ww < 420 || touch || g.big;
      const cols = narrow ? [[x + 12, WORDS.fight], [x + ww - 150, WORDS.result], [x + ww - 12, WORDS.size]]
        : [[x + 12, WORDS.fight], [x + 178, WORDS.heroCol], [x + 280, WORDS.result], [x + 340, WORDS.when], [x + ww - 12, WORDS.size]];
      const hy = y + 10 + bh;
      for (const [cx, lab] of cols) g.text(ctx, lab, cx, hy, 'dim', { small: true, align: lab === WORDS.size ? 'right' : 'left' });
      const rowH = touch ? Math.max(16, Math.min(22, minHit)) : g.ls(14);
      const top = hy + g.ls(11);
      const bottom = y + wh - g.ls(44) - bh;
      const fit = Math.max(1, Math.floor((bottom - top) / rowH));
      S.scroll = Math.max(0, Math.min(Math.max(0, S.rows.length - fit), S.scroll));
      if (S.sel < S.scroll) S.scroll = S.sel; else if (S.sel >= S.scroll + fit) S.scroll = S.sel - fit + 1;
      if (!S.rows.length) g.text(ctx, WORDS.none, x + 12, top + 4, 'gray');
      S.rows.slice(S.scroll, S.scroll + fit).forEach((r, i0) => {
        const i = i0 + S.scroll, ry = top + i0 * rowH, sel = i === S.sel;
        if (sel) g.rect(ctx, x + 6, ry - 1, ww - 12, rowH, 'rgba(249,215,122,0.16)');
        if (r.pinned) g.rect(ctx, x + 7, ry + Math.floor(rowH / 2) - 2, 3, 3, '#f9d77a');
        const name = `${r.title}${r.kind === 'rare' ? ` ${WORDS.rare}` : ''}`;
        const ty = ry + Math.floor(rowH / 2) - g.mid(5);
        g.text(ctx, g.clip(r.friend ? `${name} ${WORDS.from(r.hero.name)}` : name, (narrow ? ww - 170 : 160)), x + 12, ty, r.friend ? 'cyan' : 'white', { small: true });
        const res = expired(r) ? WORDS.rOld : `${r.result === 'kill' ? WORDS.rKill : r.result === 'wipe' ? WORDS.rWipe : WORDS.rFight} ${r.result === 'kill' && r.killAt != null ? mmss(r.killAt * HZ) : mmss(r.secs * HZ)}`;
        const resCol = expired(r) ? 'orange' : r.result === 'kill' ? 'green' : r.result === 'wipe' ? 'orange' : 'cream';
        if (narrow) { g.text(ctx, res, x + ww - 150, ty, resCol, { small: true }); }
        else {
          g.text(ctx, g.clip(`${r.hero.name}, ${clsName(r.hero.cls)} ${r.hero.level}`, 98), x + 178, ty, 'cream', { small: true });
          g.text(ctx, res, x + 280, ty, resCol, { small: true });
          g.text(ctx, whenText(r.when), x + 340, ty, 'gray', { small: true });
        }
        g.text(ctx, sizeText(r.bytes), x + ww - 12, ty, 'gray', { small: true, align: 'right' });
        S.regions.push({ rect: { x: x + 6, y: ry - 1, w: ww - 12, h: rowH }, on: () => { if (S.sel === i && !touch) watch(r); S.sel = i; S.sure = null; }, dbl: true });
      });
      S.regions.push({ rect: { x, y: top, w: ww, h: fit * rowH }, scroll: (d) => { S.sel = Math.max(0, Math.min(S.rows.length - 1, S.sel + d)); } });
      // the chosen one: what it is and what you can do with it
      const r = selRow();
      const dy = bottom + 4;
      g.rect(ctx, x + 10, dy - 2, ww - 20, 1, 'rgba(249,215,122,0.25)');
      const line = S.busy || S.msg || (r ? (r.pinned ? WORDS.keptLine : expired(r) ? WORDS.expired : touch ? WORDS.footShort : WORDS.foot) : touch ? WORDS.footShort : WORDS.foot);
      g.text(ctx, g.clip(line, ww - 24), x + 12, dy + 2, S.msg && !S.busy ? 'orange' : 'gray', { small: true });
      let bx = x + 12;
      const by = dy + g.ls(14);
      const off = !r || !!S.busy;
      bx += button(ctx, bx, by, bw(WORDS.watch), bh, WORDS.watch, () => watch(r), { off, lit: true }) + 4;
      bx += button(ctx, bx, by, bw(r && r.pinned ? WORDS.kept : WORDS.keep), bh, r && r.pinned ? WORDS.kept : WORDS.keep, () => keep(r), { off: off || (r && r.pinned) }) + 4;
      bx += button(ctx, bx, by, bw(WORDS.save), bh, WORDS.save, () => saveFile(r), { off }) + 4;
      const dl = r && S.sure === r.id ? WORDS.delSure : WORDS.del;
      bx += button(ctx, bx, by, bw(dl), bh, dl, () => remove(r), { off, color: S.sure ? 'orange' : null }) + 4;
      button(ctx, x + ww - 12 - bw(WORDS.openFile), by, bw(WORDS.openFile), bh, WORDS.openFile, () => { if (fileIn) fileIn.click(); });
      g.text(ctx, g.clip(WORDS.open, ww - 24), x + 12, y + wh - g.ls(13), 'dim', { small: true });
    });
  }

  // the list over the live game, and the REC mark while a recording runs
  const drawHud0 = renderer.drawHud.bind(renderer);
  renderer.drawHud = (fn) => drawHud0((ctx, L) => {
    fn(ctx, L);
    if (S.mode === 'list') { drawList(ctx, L); return; }
    const a = S.mode == null && recorder.active;
    if (a && ui.mode === 'game') {
      const lu = Lui(), mm = lu.minimap;
      const x = mm ? mm.x : L.hudW - 60, y = mm ? mm.y + mm.h + 4 : 4;
      g.textScope(() => {
        if ((Math.floor(performance.now() / 600) % 2) === 0) g.rect(ctx, x, y + 2, 5, 5, '#e25c48');
        g.text(ctx, `${WORDS.rec} ${mmss(a.secs * HZ)}`, x + 8, y, 'red', { small: true });
      });
    }
  });

  // ---- pointer and keys on the layer
  const hud = (ev) => ui.hudPoint(ev.clientX, ev.clientY);
  let lastTap = { t: 0, x: 0, y: 0 }, look = null;
  function hitAt(p) { for (let i = S.regions.length - 1; i >= 0; i--) { const r = S.regions[i]; if ((r.on || r.drag) && inR(r.rect, p.x, p.y)) return r; } return null; }
  function onDown(ev) {
    ev.preventDefault(); ev.stopPropagation();
    if (layer) layer.focus();
    const p = hud(ev), r = hitAt(p);
    if (r && r.drag) { S.drag = r; r.drag(p.x); try { layer.setPointerCapture(ev.pointerId); } catch { /* old browsers */ } return; }
    if (r && r.on) { const now = performance.now(); const dbl = r.dbl && now - lastTap.t < 350 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 6; lastTap = { t: now, x: p.x, y: p.y }; r.on(); if (dbl && S.mode === 'list') watch(selRow()); return; }
    if (S.mode === 'view') { look = { x: ev.clientX, y: ev.clientY }; try { layer.setPointerCapture(ev.pointerId); } catch { /* old browsers */ } }
  }
  function onMove(ev) {
    ev.stopPropagation();
    if (S.drag) { S.drag.drag(hud(ev).x); return; }
    if (look && S.mode === 'view') {
      if (V.cam !== 'orbit' && V.hcam) V.cam = 'orbit';      // a drag on the world turns the camera
      if (V.hcam) V.hcam.orbit(ev.clientX - look.x, ev.clientY - look.y);
      look = { x: ev.clientX, y: ev.clientY };
    }
  }
  function onUp(ev) { ev.stopPropagation(); S.drag = null; look = null; }
  function onWheel(ev) {
    ev.preventDefault(); ev.stopPropagation();
    if (S.mode === 'list') { const p = hud(ev); const r = S.regions.find((x) => x.scroll && inR(x.rect, p.x, p.y)); if (r) r.scroll(ev.deltaY < 0 ? -1 : 1); return; }
    if (S.mode === 'view' && V.hcam) { if (V.cam !== 'orbit') V.cam = 'orbit'; V.hcam.zoomBy(ev.deltaY < 0 ? 1 : -1); }
  }
  function onLayerKey(ev) {
    ev.stopPropagation();
    const c = ev.code;
    if (c === 'Tab') { ev.preventDefault(); return; }
    if (S.mode === 'list') {
      if (c === 'Escape') closeAll();
      else if (c === 'ArrowDown') S.sel = Math.min(S.rows.length - 1, S.sel + 1);
      else if (c === 'ArrowUp') S.sel = Math.max(0, S.sel - 1);
      else if (c === 'Enter' || c === 'NumpadEnter') watch(selRow());
      else if (c === 'KeyR' && ev.shiftKey) closeAll();
      else return;
      ev.preventDefault(); return;
    }
    if (S.mode !== 'view' || !V.P) return;
    if (c === 'Escape') leaveView();
    else if (c === 'Space') { V.playing = !V.playing; if (V.playing && V.k >= V.P.okTo) seekTo(first()); }
    else if (c === 'Comma') stepOne(-1);
    else if (c === 'Period') stepOne(1);
    else if (c === 'ArrowLeft') seekTo(V.k - 5 * HZ);
    else if (c === 'ArrowRight') seekTo(V.k + 5 * HZ);
    else return;
    ev.preventDefault();
  }

  // ---- R (record this fight) and Shift+R (the list) in play
  function onGameKey(ev) {
    if (ev.code !== 'KeyR' || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || ui.mode !== 'game' || S.mode) return;
    if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName || '')) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-overlay]')) return;
    if (Object.values(effectiveBinds((ui.options || {}).binds)).includes('KeyR')) return;   // the player gave R to something else
    ev.preventDefault();
    if (ev.shiftKey) { openList(); return; }
    if (o.isGuest()) { toast(WORDS.guestRec); return; }
    const r = recorder.toggle();
    if (r === 'start') toast(WORDS.recStart); else if (r === 'stop') toast(WORDS.recStop);
  }
  if (typeof window !== 'undefined') window.addEventListener('keydown', onGameKey);

  return {
    recorder, store, render, openList, closeAll,
    get mode() { return S.mode; },
    /** drivers and tests */
    get viewer() { return V.P ? { k: V.k, N: V.P.N, okTo: V.P.okTo, playing: V.playing, speed: V.speed, cam: V.cam, checks: V.P.checks, baked: V.P.baked } : null; },
    get list() { return { rows: S.rows, sel: S.sel, msg: S.msg, busy: S.busy, usage: S.usage }; },
    watch: (i = 0) => watch(S.rows[i]), keep: (i = 0) => keep(S.rows[i]), refresh, seek: seekTo,
    setPlaying(v) { V.playing = !!v; }, setCam(c) { if (camList().includes(c)) V.cam = c; }, setSpeed(s) { if (SPEEDS.includes(s)) V.speed = s; },
  };
}

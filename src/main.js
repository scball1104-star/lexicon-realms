// Lexicon Realms: wires sim, render, input, HUD, audio. The only module that knows about all of them.
//
// URL options (dev): ?seed=123  ?zoom=1|1.5|2  ?zone=valley&x=5&y=33 (start spot, tiles)  ?paused=1 (no loop; drivers step)
//   With none of those, the game opens on the title screen (character select / creation). Any of them, or ?skiptitle=1,
//   skips the title and plays a default Warden (qa/shot.py keeps working unchanged).
//   ?name=Ann&cls=scribe&look=1 picks that default hero. ?uidemo=normal|worst fills the HUD's placeholder data
//   (quests, bags, party) for screenshots. ?touch=1|0 forces the phone HUD on or off.
//   View: ?tod=0..1 (freeze the time of day), ?weather=clear|rain|leaves|pollen, ?fx=low|high (overrides the option).
//   DEV ONLY: ?dev=1 adds window.__realms.dev (xp, level, gold) for drivers. Never linked from the game.
//
// Headless drivers (qa/shot.py, qa/ui/ui_shots.py, qa/integrate/) use window.__realms: press/release keys, inject
// intents, step ticks, read snapshots; window.__realms.ui is the UI controller.
import { bagAdd } from './sim/loot.js';
import { createWorld, TICK_HZ } from './sim/index.js';
import { buildContent } from './data/maps/index.js';
import { loadAssets, MANIFEST } from './core/assets.js';
import { createLoop } from './core/loop.js';
import { createBus } from './core/bus.js';
import { buildViewModel } from './core/viewmodel.js';
import { BitmapFont } from './core/font.js';
import { createRenderer } from './render/renderer.js';
import { createInput } from './input/input.js';
import { createTouch, isTouchDevice } from './input/touch.js';
import { createUI } from './ui/ui.js';
import { padBar } from './ui/save.js';
import { createAudio } from './audio/audio.js';

const ZOOMS = [1, 1.5, 2];
const TILE = 16;

async function boot() {
  const q = new URLSearchParams(location.search);
  const canvas = document.getElementById('game');
  // Size the canvas to the VISIBLE viewport (phones: 100vh runs under the browser's bars, so the bottom of the screen
  // was cut off). Safe-area insets (notch, home bar) are measured from a CSS probe so the HUD stays clear of them.
  const safeProbe = document.getElementById('safe');
  const insets = { l: 0, t: 0, r: 0, b: 0 };
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const vv = window.visualViewport;
    const w = Math.round(vv ? vv.width : window.innerWidth), h = Math.round(vv ? vv.height : window.innerHeight);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (safeProbe) {
      const cs = getComputedStyle(safeProbe), px = (k) => Math.round((parseFloat(cs[k]) || 0) * dpr);
      insets.l = px('paddingLeft'); insets.t = px('paddingTop'); insets.r = px('paddingRight'); insets.b = px('paddingBottom');
    }
    window.scrollTo(0, 0);
  };
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

  const assets = await loadAssets(MANIFEST);
  const content = buildContent();
  const seed = Number(q.get('seed')) || 20261119;
  const world = createWorld({ seed, content });
  let playerId = null;                 // created by the title screen (or at once in dev mode, below)
  const joins = [];                    // [tick, spec]: addPlayer calls, replayable with commandLog (CONTRACTS 2.3)

  // ?r=3d: the 3D renderer (src/render3d/, same contract); it falls back to 2D with a console warning if WebGL fails
  const rOpts = { zones: content.zones, abilities: { ...content.abilities, ...content.mobAbilities }, items: content.items };
  const renderer = (q.get('r') === '3d' && await import('./render3d/renderer3d.js').then((m) => m.createRenderer3D(canvas, assets, rOpts))
    .catch((e) => { console.warn('Lexicon Realms: 3D renderer unavailable, using 2D.', e); return null; })) || createRenderer(canvas, assets, rOpts);
  const input = createInput(window, canvas, { abilities: content.abilities, classes: content.classes });
  const bus = createBus();
  const font = new BitmapFont(assets.json('font'), assets.img('font'), { id: 'main' });
  const view = { zoom: ZOOMS.includes(Number(q.get('zoom'))) ? Number(q.get('zoom')) : 1, fx: 'high' };
  // view overrides from the URL (CONTRACTS 9: view.tod / view.weather / view.fx)
  if (q.has('tod')) { const v = Number(q.get('tod')); if (Number.isFinite(v)) view.tod = ((v % 1) + 1) % 1; }
  if (q.has('weather')) view.weather = q.get('weather');
  const fxOverride = ['low', 'high'].includes(q.get('fx')) ? q.get('fx') : null;

  // ---- audio (CONTRACTS 11): music after the first user input (browser rule), zone themes, event sfx
  const audio = createAudio({ base: 'assets/audio/' });
  audio.attach(bus, { playerId: () => playerId, cls: () => (world.get(playerId) || {}).cls, zoneMusic: (z) => (content.zones[z] || {}).music });
  const unlockAudio = () => audio.unlock();
  for (const t of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(t, unlockAudio, { once: true, capture: true });

  // ---- UI (HUD, menus, title, character creation, npc windows)
  const uiCommands = [];               // menu actions -> sim commands, applied on the next tick like input
  const touch = isTouchDevice(window, q);
  input.setTouch(touch);
  let storage = null;
  try { storage = window.localStorage; } catch { storage = null; }
  const ui = await createUI({
    canvas, font, zones: content.zones, zoneNames: content.zoneNames, storage, touch,
    demo: q.get('uidemo') || null,
    hooks: {
      input,
      getLayout: () => renderer.layout,
      command: (cmd) => uiCommands.push(cmd),
      setZoom: (z) => { if (ZOOMS.includes(z)) view.zoom = z; },
      optionsChanged: (o) => { view.fx = fxOverride || o.fx; audio.setVolumes({ master: 1, music: o.music, sfx: o.sfx }); },
      enterWorld: (c) => addHero(specFor(c)),
      saveState: (id) => saveState(id),
      logout: (id) => {
        if (id != null) world.removePlayer(id);
        playerId = null;
        uiCommands.length = 0;
        audio.music('title'); audio.ambience(null);
      },
      worldMarks: () => worldMarks(),
      unitRects: () => unitRects(),
      // the gold quest arrow (ui.js drawGoalPointer): world px -> HUD px, and where the hero was drawn this frame
      toHud: (wx, wy) => renderer.worldToHud(wx, wy),
      heroAnchor: () => (playerId != null ? renderer.anchorOf(playerId) : null),
    },
  });
  ui.setGameData({ classes: content.classes, abilities: content.abilities, talents: content.talents });
  ui.setItems(content.items);
  ui.setQuests(content.quests, content.npcs);
  ui.setAbilityContent(content.abilities, content.mobAbilities);
  if (ui.options.zoom && ZOOMS.includes(ui.options.zoom) && !q.get('zoom')) view.zoom = ui.options.zoom;
  // phones: the world at 1.5x unless the player picked a zoom (CRITIQUE_1 item 8); the canvas fills the screen
  view.touch = touch;
  if (touch && !ui.options.zoomSet && !q.get('zoom')) view.zoom = 1.5;
  view.fx = fxOverride || ui.options.fx;
  audio.setVolumes({ master: 1, music: ui.options.music, sfx: ui.options.sfx });
  if (touch) createTouch({ canvas, input, ui });

  /** addPlayer spec for a stored character: a new hero, or the full restore (CONTRACTS 2.4). */
  function specFor(c) {
    const s = c.state;
    if (!s) return { name: c.name, cls: c.cls, look: c.look, ...(c.build ? { build: c.build } : {}) };   // save v2: a migrated hero not yet played
    const at = s.zone && content.zones[s.zone] && s.tx != null ? { zone: s.zone, x: s.tx, y: s.ty } : {};
    return { name: c.name, cls: c.cls, look: c.look, ...at, level: s.level, xp: s.xp, gold: s.gold, bag: s.bag, bags: s.bags, equip: s.equip,
      known: s.known, bar: s.bar, talents: s.talents, quests: stripEscorts(s.quests), questsDone: s.questsDone, nodesUsed: s.nodesUsed,
      respecs: s.respecs, lantern: s.lantern, build: s.build || c.build,     // build: Builds 2 (save v2, src/data/builds2.js)
      // fix pass 1: the sim-owned part (health, resource, cooldowns, lasting buffs, quest bag, loot waiting, escorts)
      qbag: s.qbag, pendingLoot: s.pendingLoot, hp: s.hp, res: s.res, cdLeft: s.cdLeft, auras: s.auras, escorts: s.escorts };
  }
  // an escort in progress cannot be restored (its npc is gone): it restarts as a fresh accept would
  const stripEscorts = (qs) => { if (!qs) return qs; const o = {}; for (const [k, v] of Object.entries(qs)) { const { escort, ...rest } = v; void escort; o[k] = rest; } return o; };
  /** The character as a save (plain JSON; positions in tiles). */
  function saveState(id) {
    const e = world.get(id);
    if (!e || e.kind !== 'player') return null;
    const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
    // a dead hero saves at the lantern they will wake at
    const spot = e.dead && e.lantern ? { zone: e.lantern.zone, tx: e.lantern.x, ty: e.lantern.y } : { zone: e.zone, tx: Math.floor(e.x / (TILE * 16)), ty: Math.floor((e.y - 1) / (TILE * 16)) };   // SUB -> tiles
    return { v: 2, name: e.name, cls: e.cls, look: e.look, level: e.level, xp: e.xp, gold: e.gold || 0, ...spot,
      bag: clone(e.bag), bags: clone(e.bags), equip: clone(e.equip), known: clone(e.known), bar: padBar(e.bar), talents: clone(e.talents),
      quests: clone(e.quests), questsDone: clone(e.questsDone), nodesUsed: clone(e.nodesUsed), respecs: e.respecs || 0, lantern: clone(e.lantern),
      ...(world.saveFields ? clone(world.saveFields(id)) || {} : {}) };
  }
  function addHero(spec) {
    playerId = world.addPlayer(spec);
    joins.push([world.tick, spec]);
    renderer.setPlayer(playerId);
    audio.zone(spec.zone || content.start.zone, (z) => (content.zones[z] || {}).music);
    return playerId;
  }
  const devStart = ['paused', 'zone', 'zoom', 'seed', 'skiptitle'].some((k) => q.has(k));
  if (devStart) {
    addHero({
      name: q.get('name') || 'Scott', cls: q.get('cls') || 'warden', look: Number(q.get('look')) || 0,
      ...(q.get('zone') ? { zone: q.get('zone'), x: Number(q.get('x')), y: Number(q.get('y')) } : {}),
    });
    ui.attach(playerId);
  } else audio.music('title');
  const nameOf = (id) => { const e = world.get(id); return e ? e.name : `#${id}`; };
  bus.on('*', (ev) => ui.handleEvents([ev], { nameOf, zoneNames: content.zoneNames }));

  /** Quest marks over npc heads, in HUD px (the sim's npcMarkers + where the renderer drew each npc). */
  function worldMarks() {
    const h = snap.hud && playerId != null ? snap.hud[playerId] : null;
    if (!h || !h.npcMarkers) return [];
    const out = [];
    const marks = { ...h.npcMarkers };
    // after a level-up with new abilities, the class trainer wears a gold ! until you train (CRITIQUE_1 item 16)
    const tm = ui.trainerMark;
    if (tm) for (const e of snap.entities) if (e.kind === 'npc' && e.template === tm && !(marks[e.id] === '?' || marks[e.id] === '!')) marks[e.id] = '!';
    for (const [id, mark] of Object.entries(marks)) {
      const a = renderer.anchorOf(Number(id));
      if (!a) continue;
      const [x, y] = renderer.worldToHud(a.x, a.y - a.h);
      const l = renderer.layout;
      if (x < -16 || y < -16 || x > l.hudW + 16 || y > l.hudH + 16) continue;
      out.push({ x, y, mark, id: Number(id) });
    }
    return out;
  }
  /** HUD rects of the player and the target (the chat log and the tracker fade when one is under them). */
  function unitRects() {
    const out = [];
    const me = playerId != null ? snap.entities.find((e) => e.id === playerId) : null;
    for (const id of [playerId, me ? me.target : null]) {
      if (id == null) continue;
      const a = renderer.anchorOf(id);
      if (!a) continue;
      const [x0, y0] = renderer.worldToHud(a.x - 8, a.y - a.h);
      const [x1, y1] = renderer.worldToHud(a.x + 8, a.y + 2);
      out.push({ x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) });
    }
    return out;
  }

  let prev = world.snapshot(), snap = prev;
  const commandLog = [];   // [tick, entityId, cmd]: replayable (CONTRACTS section 2.3)
  function tick() {
    if (playerId != null) {
      for (const cmd of [...input.poll({ snap, playerId, pick: renderer.pick, toWorld: renderer.devToWorld }), ...uiCommands.splice(0)]) {
        world.enqueue(playerId, cmd);
        commandLog.push([world.tick + 1, playerId, cmd]);
      }
    } else { input.poll({ snap, playerId: null }); uiCommands.length = 0; }
    const events = world.step();
    prev = snap;
    snap = world.snapshot();
    bus.publish(events);
    renderer.feed(events);
  }
  // frame timing for drivers (60 fps check): a rolling window of rAF deltas
  const frames = { last: 0, dts: [] };
  function render(alpha, nowMs) {
    if (frames.last) { frames.dts.push(nowMs - frames.last); if (frames.dts.length > 240) frames.dts.shift(); }
    frames.last = nowMs;
    const me = playerId != null ? snap.entities.find((e) => e.id === playerId) : null;
    // before a hero exists the world still draws (behind the title art) at the start zone
    view.zone = me ? me.zone : content.start.zone; view.followId = playerId; view.targetId = me ? me.target : null; view.time = nowMs / 1000;
    view.dpr = window.devicePixelRatio || 1; view.hud = ui.hudMode;
    view.inset = ui.mode === 'game' ? insets : null;   // title screens: the art covers the notch strips too
    renderer.draw(prev, snap, alpha, view);
    const dpr = window.devicePixelRatio || 1;
    ui.setMetrics({ cssPerHud: renderer.layout.base / dpr });
    const vm = buildViewModel(snap, playerId, { zoneNames: content.zoneNames, log: ui.logText(), tickHz: TICK_HZ });
    renderer.drawHud((ctx) => ui.draw(ctx, vm, snap, nowMs / 1000));
  }
  window.addEventListener('keydown', (ev) => {
    if (ui.mode !== 'game') return;    // zoom keys only in play (the name field takes '-')
    if (ev.code === 'Equal' || ev.code === 'NumpadAdd') view.zoom = ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(view.zoom) + 1)];
    if (ev.code === 'Minus' || ev.code === 'NumpadSubtract') view.zoom = ZOOMS[Math.max(0, ZOOMS.indexOf(view.zoom) - 1)];
  });
  // keep the hero on this PC: every 5 s, on hide (phones rarely fire beforeunload) and on unload
  setInterval(() => ui.saveProgress(), 5000);
  window.addEventListener('beforeunload', () => ui.saveProgress());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ui.saveProgress(); });

  const loop = createLoop({ hz: TICK_HZ, tick, render });
  if (q.get('paused') !== '1') loop.start();
  else render(0, 0);

  window.__realms = {
    world, get playerId() { return playerId; }, input, renderer, view, commandLog, joins, ui, audio, content,
    snapshot: () => snap,
    player: () => snap.entities.find((e) => e.id === playerId),
    hud: () => (snap.hud && playerId != null ? snap.hud[playerId] : null),
    /** Advance n ticks synchronously and redraw (drivers). */
    step(n = 1) { for (let i = 0; i < n; i++) tick(); render(0, performance.now()); return snap.tick; },
    /** Redraw without stepping (drivers: after a UI change in paused mode). */
    redraw(tSec) { render(0, tSec != null ? tSec * 1000 : performance.now()); },
    setZoom(z) { if (ZOOMS.includes(z)) view.zoom = z; },
    pause() { loop.stop(); }, resume() { loop.start(); },
    /** Frame timing: { fps, p95ms } over the last ~4 s of animation frames. */
    fps() { const d = [...frames.dts].sort((a, b) => a - b); if (!d.length) return null; const avg = d.reduce((s, v) => s + v, 0) / d.length; return { fps: Math.round(10000 / avg) / 10, p95ms: Math.round(d[Math.floor(d.length * 0.95)] * 10) / 10, n: d.length }; },
    ready: true,
  };
  if (q.get('dev') === '1') {
    // DEV ONLY (drivers and testing): never reachable without ?dev=1
    window.__realms.dev = {
      xp(n) { if (playerId != null) world.grantXp(playerId, n, 'quest'); },
      level(L) { if (playerId != null) world.setLevel(playerId, L); },
      gold(n) { const e = world.get(playerId); if (e) e.gold = (e.gold || 0) + n; },
      /** a bag item for drivers (phone item-card check): an item id from content.items */
      item(id, qty = 1) { const e = world.get(playerId); if (e) return bagAdd(e, id, qty, null, content); return 0; },
      hp(n) { const e = world.get(playerId); if (e && !e.dead) e.hp = Math.max(1, Math.min(e.hpMax, n)); },
    };
  }
  document.title = 'Lexicon Realms';
}

boot().catch((err) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f6f4ee;background:#14101e;padding:16px;position:fixed;inset:0;margin:0;white-space:pre-wrap';
  pre.textContent = `Lexicon Realms failed to start:\n${err && err.stack || err}`;
  document.body.appendChild(pre);
  window.__realms = { error: String(err && err.stack || err) };
});

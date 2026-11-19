// Lexicon Realms: wires sim, render, input, HUD. The only module that knows about all of them.
//
// URL options (dev): ?seed=123  ?zoom=1|1.5|2  ?zone=valley&x=5&y=33 (start spot, tiles)  ?paused=1 (no loop; drivers step)
//   HUD AGENT (2026-11-19): with none of those, the game opens on the title screen (character select / creation).
//   Any of them, or ?skiptitle=1, skips the title and plays a default Warden (qa/shot.py keeps working unchanged).
//   ?name=Ann&cls=scribe&look=1 picks that default hero. ?uidemo=normal|worst fills the HUD's placeholder data
//   (quests, bags, party) for screenshots. ?touch=1|0 forces the phone HUD on or off.
//
// Headless drivers (qa/shot.py, qa/ui/ui_shots.py) use window.__realms: press/release keys, inject intents, step ticks,
// read snapshots; window.__realms.ui is the UI controller.
import { createWorld, TICK_HZ } from './sim/index.js';
import { buildContent } from './data/maps/index.js';
import { loadAssets, MANIFEST } from './core/assets.js';
import { createLoop } from './core/loop.js';
import { createBus } from './core/bus.js';
import { buildViewModel } from './core/viewmodel.js';
import { BitmapFont } from './core/font.js';
import { createRenderer } from './render/renderer.js';
import { createInput } from './input/input.js';
import { createTouch, isTouchDevice } from './input/touch.js';     // HUD AGENT EDIT: phone controls
import { createUI } from './ui/ui.js';                             // HUD AGENT EDIT: replaces ui/hud_stub.js

const ZOOMS = [1, 1.5, 2];

async function boot() {
  const q = new URLSearchParams(location.search);
  const canvas = document.getElementById('game');
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  fit();
  window.addEventListener('resize', fit);

  const assets = await loadAssets(MANIFEST);
  const content = buildContent();
  const seed = Number(q.get('seed')) || 20261119;
  const world = createWorld({ seed, content });
  // HUD AGENT EDIT: the player is created by the title screen (or at once in dev mode, below), not at boot.
  let playerId = null;
  const joins = [];                    // [tick, spec]: addPlayer calls, replayable with commandLog (CONTRACTS 2.3)

  const renderer = createRenderer(canvas, assets, { zones: content.zones });
  const input = createInput(window, canvas);
  const bus = createBus();
  const font = new BitmapFont(assets.json('font'), assets.img('font'), { id: 'main' });
  const view = { zoom: ZOOMS.includes(Number(q.get('zoom'))) ? Number(q.get('zoom')) : 1, fx: 'high' };

  // ---- HUD AGENT EDIT: UI (HUD, menus, title, character creation)
  const uiCommands = [];               // menu actions -> sim commands, applied on the next tick like input
  const touch = isTouchDevice(window, q);
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
      optionsChanged: (o) => { view.fx = o.fx; },
      enterWorld: (c) => addHero({ name: c.name, cls: c.cls, look: c.look, ...(c.zone && content.zones[c.zone] && c.x != null ? { zone: c.zone, x: c.x, y: c.y } : {}) }),
      logout: () => { location.href = location.pathname; },
    },
  });
  // the UI's data hook: real class / ability / talent data over the design text, when those modules load
  try {
    const [c, a, t] = await Promise.all([import('./data/classes.js'), import('./data/abilities.js'), import('./data/talents.js')]);
    ui.setGameData({ classes: c.CLASSES, abilities: a.ABILITIES, talents: t.TALENTS });
  } catch (err) { console.warn('UI keeps the design text (content data did not load):', err); }
  if (ui.options.zoom && ZOOMS.includes(ui.options.zoom) && !q.get('zoom')) view.zoom = ui.options.zoom;
  view.fx = ui.options.fx;
  if (touch) createTouch({ canvas, input, ui });
  function addHero(spec) {
    playerId = world.addPlayer(spec);
    joins.push([world.tick, spec]);
    return playerId;
  }
  const devStart = ['paused', 'zone', 'zoom', 'seed', 'skiptitle'].some((k) => q.has(k));
  if (devStart) {
    addHero({
      name: q.get('name') || 'Scott', cls: q.get('cls') || 'warden', look: Number(q.get('look')) || 0,
      ...(q.get('zone') ? { zone: q.get('zone'), x: Number(q.get('x')), y: Number(q.get('y')) } : {}),
    });
    ui.attach(playerId);
  }
  // the old stub's placeholder log lines now come from the UI's event log (src/ui/eventlog.js)
  const nameOf = (id) => { const e = world.get(id); return e ? e.name : `#${id}`; };
  bus.on('*', (ev) => ui.handleEvents([ev], { nameOf, zoneNames: content.zoneNames }));
  // ---- end HUD AGENT EDIT

  let prev = world.snapshot(), snap = prev;
  const commandLog = [];   // [tick, entityId, cmd]: replayable (CONTRACTS section 2.3)
  function tick() {
    if (playerId != null) {   // HUD AGENT EDIT: no player on the title screen
      for (const cmd of [...input.poll({ snap, playerId, pick: renderer.pick }), ...uiCommands.splice(0)]) {
        world.enqueue(playerId, cmd);
        commandLog.push([world.tick + 1, playerId, cmd]);
      }
    }
    const events = world.step();
    prev = snap;
    snap = world.snapshot();
    bus.publish(events);
  }
  function render(alpha, nowMs) {
    const me = playerId != null ? snap.entities.find((e) => e.id === playerId) : null;
    // HUD AGENT EDIT: before a hero exists the world still draws (behind the title art) at the start zone
    view.zone = me ? me.zone : content.start.zone; view.followId = playerId; view.targetId = me ? me.target : null; view.time = nowMs / 1000;
    renderer.draw(prev, snap, alpha, view);
    const dpr = window.devicePixelRatio || 1;
    ui.setMetrics({ cssPerHud: renderer.layout.base / dpr });
    const vm = buildViewModel(snap, playerId, { zoneNames: content.zoneNames, log: ui.logText(), tickHz: TICK_HZ });
    renderer.drawHud((ctx) => ui.draw(ctx, vm, snap, nowMs / 1000));
  }
  window.addEventListener('keydown', (ev) => {
    if (ui.mode !== 'game') return;    // HUD AGENT EDIT: zoom keys only in play (the name field takes '-')
    if (ev.code === 'Equal' || ev.code === 'NumpadAdd') view.zoom = ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(view.zoom) + 1)];
    if (ev.code === 'Minus' || ev.code === 'NumpadSubtract') view.zoom = ZOOMS[Math.max(0, ZOOMS.indexOf(view.zoom) - 1)];
  });
  // HUD AGENT EDIT: keep the hero's place and level on this PC
  setInterval(() => ui.saveProgress(), 5000);
  window.addEventListener('beforeunload', () => ui.saveProgress());

  const loop = createLoop({ hz: TICK_HZ, tick, render });
  if (q.get('paused') !== '1') loop.start();
  else render(0, 0);

  window.__realms = {
    world, get playerId() { return playerId; }, input, renderer, view, commandLog, joins, ui,
    snapshot: () => snap,
    player: () => snap.entities.find((e) => e.id === playerId),
    /** Advance n ticks synchronously and redraw (drivers). */
    step(n = 1) { for (let i = 0; i < n; i++) tick(); render(0, performance.now()); return snap.tick; },
    /** Redraw without stepping (drivers: after a UI change in paused mode). */
    redraw(tSec) { render(0, tSec != null ? tSec * 1000 : performance.now()); },
    setZoom(z) { if (ZOOMS.includes(z)) view.zoom = z; },
    pause() { loop.stop(); }, resume() { loop.start(); },
    ready: true,
  };
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

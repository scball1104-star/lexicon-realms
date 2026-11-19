// Lexicon Realms: wires sim, render, input, HUD. The only module that knows about all of them.
//
// URL options (dev): ?seed=123  ?zoom=1|1.5|2  ?zone=valley&x=5&y=33 (start spot, tiles)  ?paused=1 (no loop; drivers step)
//
// Headless drivers (qa/shot.py) use window.__realms: press/release keys, inject intents, step ticks, read snapshots.
import { createWorld, TICK_HZ } from './sim/index.js';
import { buildContent } from './data/maps/index.js';
import { loadAssets, MANIFEST } from './core/assets.js';
import { createLoop } from './core/loop.js';
import { createBus } from './core/bus.js';
import { buildViewModel } from './core/viewmodel.js';
import { BitmapFont } from './core/font.js';
import { createRenderer } from './render/renderer.js';
import { createInput } from './input/input.js';
import { createHudStub } from './ui/hud_stub.js';

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
  const playerId = world.addPlayer({
    name: 'Scott', cls: 'warden',
    ...(q.get('zone') ? { zone: q.get('zone'), x: Number(q.get('x')), y: Number(q.get('y')) } : {}),
  });

  const renderer = createRenderer(canvas, assets, { zones: content.zones });
  const input = createInput(window, canvas);
  const bus = createBus();
  const font = new BitmapFont(assets.json('font'), assets.img('font'), { id: 'main' });
  const hud = createHudStub(font);
  const view = { zoom: ZOOMS.includes(Number(q.get('zoom'))) ? Number(q.get('zoom')) : 1 };

  // HUD log from events (placeholder wording; the real chat/log box belongs to the HUD agent)
  const log = [];
  const nameOf = (id) => { const e = world.get(id); return e ? e.name : `#${id}`; };
  bus.on('*', (ev) => {
    if (ev.type === 'zone' && ev.id === playerId) log.push(`Entered ${content.zoneNames[ev.to] || ev.to}.`);
    else if (ev.type === 'interact' && ev.src === playerId) log.push(`You speak with ${nameOf(ev.id)}.`);
    else if (ev.type === 'interact_fail' && ev.src === playerId) log.push('Too far away.');
    else if (ev.type === 'cast_fail' && ev.src === playerId && ev.reason === 'gcd') log.push('Not ready yet.');
    else if (ev.type === 'cast_start' && ev.src === playerId) log.push(`Slot ${ev.ability.replace('slot', '')} (abilities arrive next wave).`);
  });

  let prev = world.snapshot(), snap = prev;
  const commandLog = [];   // [tick, entityId, cmd]: replayable (CONTRACTS section 2.3)
  function tick() {
    for (const cmd of input.poll({ snap, playerId, pick: renderer.pick })) {
      world.enqueue(playerId, cmd);
      commandLog.push([world.tick + 1, playerId, cmd]);
    }
    const events = world.step();
    prev = snap;
    snap = world.snapshot();
    bus.publish(events);
  }
  function render(alpha, nowMs) {
    const me = snap.entities.find((e) => e.id === playerId);
    view.zone = me.zone; view.followId = playerId; view.targetId = me.target; view.time = nowMs / 1000;
    renderer.draw(prev, snap, alpha, view);
    const vm = buildViewModel(snap, playerId, { zoneNames: content.zoneNames, log, tickHz: TICK_HZ });
    renderer.drawHud((ctx) => hud.draw(ctx, vm));
  }
  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Equal' || ev.code === 'NumpadAdd') view.zoom = ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(view.zoom) + 1)];
    if (ev.code === 'Minus' || ev.code === 'NumpadSubtract') view.zoom = ZOOMS[Math.max(0, ZOOMS.indexOf(view.zoom) - 1)];
  });

  const loop = createLoop({ hz: TICK_HZ, tick, render });
  if (q.get('paused') !== '1') loop.start();
  else render(0, 0);

  window.__realms = {
    world, playerId, input, renderer, view, commandLog,
    snapshot: () => snap,
    player: () => snap.entities.find((e) => e.id === playerId),
    /** Advance n ticks synchronously and redraw (drivers). */
    step(n = 1) { for (let i = 0; i < n; i++) tick(); render(0, performance.now()); return snap.tick; },
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

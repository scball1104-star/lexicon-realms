// Lexicon Realms: wires sim, render, input, HUD, audio. The only module that knows about all of them.
//
// URL options (dev): ?seed=123  ?zoom=1|1.5|2  ?zone=valley&x=5&y=33 (start spot, tiles)  ?paused=1 (no loop; drivers step)
//   With none of those, the game opens on the title screen (character select / creation). Any of them, or ?skiptitle=1,
//   skips the title and plays a default Warden (qa/shot.py keeps working unchanged).
//   ?name=Ann&cls=scribe&look=1 picks that default hero. ?uidemo=normal|worst fills the HUD's placeholder data
//   (quests, bags, party) for screenshots. ?touch=1|0 forces the phone HUD on or off.
//   View: ?tod=0..1 (freeze the time of day), ?weather=clear|rain|leaves|pollen, ?fx=low|high (overrides the option).
//   DEV ONLY: ?dev=1 adds window.__realms.dev (xp, level, gold) for drivers. Never linked from the game.
//   Online co-op (docs/NET.md): ?net=local|relay picks the signalling (default: the free room-code broker), ?stun=0 no STUN.
//
// Headless drivers (qa/shot.py, qa/ui/ui_shots.py, qa/integrate/) use window.__realms: press/release keys, inject
// intents, step ticks, read snapshots; window.__realms.ui is the UI controller.
import { bagAdd } from './sim/loot.js';
import { createWorld, TICK_HZ } from './sim/index.js';
import { buildContent } from './data/maps/index.js';
import { placeAt } from './data/maps/compose.js';
import { loadAssets, MANIFEST } from './core/assets.js';
import { createLoop } from './core/loop.js';
import { createBus } from './core/bus.js';
import { buildViewModel } from './core/viewmodel.js';
import { BitmapFont } from './core/font.js';
import { createRenderer } from './render/renderer.js';
import { createInput } from './input/input.js';
import { createTouch, isTouchDevice } from './input/touch.js';
import { attachHorizonInput } from './input/horizon_input.js';   // wave 5b: the optional horizon camera
import { createHorizonCam } from './render3d/horizon_cam.js';
import { dayFraction } from './render/daycycle.js';   // wave 8 photo: the live clock under the Time slider
import { isPlaceZone } from './render/dungeon_plan.js';
import { photoInput } from './ui/photo_rig.js';
import { createUI } from './ui/ui.js';
import { padBar, loadOptions, loadShared, saveShared, SHARED_KEY } from './ui/save.js';
import { createAudio } from './audio/audio.js';
import { createLetterNotes } from './ui/letters_ui.js';   // wave 9 music
import { createCoop } from './net/coop.js';
import { createLanternNotes } from './ui/notes_wire.js';   // wave 9 notes: lantern notes

import { readRiddle, clearRiddle } from './ui/riddle_book.js';   // wave 9 riddles: a #riddle= link
import { createRiddleRules } from './sim/riddle.js';   // wave 9 riddles: the link code's rules for the UI

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
  // DEV ONLY (big world piece 1 measurements): ?dev=1&devzone=<id> adds the QA test zone qa/out/bigworld/<id>.js
  // (qa/integrate/make_bigtest.mjs, never shipped) before any hero is made
  if (q.get('dev') === '1' && /^[a-z0-9_]+$/.test(q.get('devzone') || '')) {
    try { const m = await import(`../qa/out/bigworld/${q.get('devzone')}.js`); content.zones[m.default.id] = m.default; } catch (e) { console.warn('devzone', e); }
  }
  const seed = Number(q.get('seed')) || 20261119;
  // the bounty boards' day (BUILDS_2 5.6): this PC's local calendar day, so the boards repost at local midnight; ?day=n pins it
  const bountyDay = () => (q.has('day') ? Number(q.get('day')) | 0 : Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000));
  const world = createWorld({ seed, content, day: bountyDay() });
  let playerId = null;                 // created by the title screen (or at once in dev mode, below)
  const joins = [];                    // [tick, spec]: addPlayer calls, replayable with commandLog (CONTRACTS 2.3)

  // the 3D renderer (src/render3d/, same contract): ?r=3d or ?r=2d in the link wins, else Settings > Graphics (options.r3d).
  // If WebGL fails it falls back to 2D and says so on screen (Scott 2026-11-19: the silent fallback looked like "no update")
  const rOpts = { zones: content.zones, abilities: { ...content.abilities, ...content.mobAbilities }, items: content.items };
  let savedR3d = false;
  try { savedR3d = !!loadOptions(window.localStorage).r3d; } catch { savedR3d = false; }
  const want3d = q.get('r') === '3d' || (!q.has('r') && savedR3d);
  let fell2d = false;
  const renderer = (want3d && await import('./render3d/renderer3d.js').then((m) => m.createRenderer3D(canvas, assets, rOpts))
    .catch((e) => { console.warn('Lexicon Realms: 3D renderer unavailable, using 2D.', e); fell2d = true; return null; })) || createRenderer(canvas, assets, rOpts);
  const input = createInput(window, canvas, { abilities: content.abilities, classes: content.classes });
  const bus = createBus();
  const font = new BitmapFont(assets.json('font'), assets.img('font'), { id: 'main' });
  const view = { zoom: ZOOMS.includes(Number(q.get('zoom'))) ? Number(q.get('zoom')) : 1, fx: 'high' };
  // view overrides from the URL (CONTRACTS 9: view.tod / view.weather / view.fx)
  if (q.has('tod')) { const v = Number(q.get('tod')); if (Number.isFinite(v)) view.tod = ((v % 1) + 1) % 1; }
  if (q.has('weather')) view.weather = q.get('weather');
  const fxOverride = ['low', 'high'].includes(q.get('fx')) ? q.get('fx') : null;
  const letterNotes = createLetterNotes();   // wave 9 music: a toast when a new letter joins the song
  const synthQ = q.get('synth');      // ?synth=0 / 1: the synth switch for QA and the frame budget (Settings otherwise)

  // ---- audio (CONTRACTS 11): music after the first user input (browser rule), zone themes, event sfx
  const audio = createAudio({ base: 'assets/audio/' });
  // one world: music and the HUD's place name follow the area you stand in (render() below), not zone events
  audio.attach(bus, { playerId: () => playerId, cls: () => (heroEnt() || {}).cls, zoneMusic: (z) => (content.zones[z] || {}).music, followPlace: true,
    mobFamily: (tpl) => ((content.mobs || {})[tpl] || {}).family || null });
  let place = null;                    // placeAt() of the hero's tile, refreshed each frame (HUD place name)
  let musicArea = null;                // the area whose music is playing; null: pick on the next frame
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
      // Settings > Graphics: save, then reload into the other renderer (a ?r= in the link would override it, so drop it)
      setGraphics: () => { ui.saveProgress(); const u = new URL(window.location.href); u.searchParams.delete('r'); window.location.replace(u.toString()); },
      optionsChanged: (o) => { view.fx = fxOverride || o.fx; view.shake = o.shake !== false; audio.setVolumes({ master: 1, music: o.music, sfx: o.sfx }); setCam(o.cam); audio.setSynth(synthQ === '0' ? false : o.synth !== false); },
      enterWorld: (c) => {
        // a hero joining a friend's game: the friend's world made it (coop.js); this tab plays back their frames
        const gid = coop.takeGuestId();
        if (gid != null) { playerId = gid; renderer.setPlayer(gid); musicArea = null; return gid; }
        return addHero(specFor(c));
      },
      saveState: (id) => { const g = coop.guestSave(id); return g !== undefined ? g : saveState(id); },
      hostGame: (c) => coop.hostGame(c),
      joinGame: (c) => coop.joinGame(c),
      invite: () => coop.invite(), canInvite: () => !coop.isGuest,   // drop-in with one link (src/net/dropin.js)
      namePlates: () => namePlates(),
      talkHeads: () => talkHeads(),   // wave 8 talk: where each hero's speech bubble sits (src/ui/chat_ui.js)
      logout: (id) => {
        const wasGuest = coop.onLogout(id);
        if (id != null && !wasGuest) world.removePlayer(id);
        if (chron) chron.endNight('quit');   // wave 9 chronicle: the night's page at Quit to title (and a guest sent home)
        playerId = null;
        uiCommands.length = 0;
        audio.music('title'); audio.ambience(null);
      },
      sound: (kind) => audio.ui(kind),   // menu sounds (src/audio/ui_sounds.js observes the UI state)
      worldMarks: () => worldMarks(),
      unitRects: () => unitRects(),
      // the gold quest arrow (ui.js drawGoalPointer): world px -> HUD px, and where the hero was drawn this frame
      toHud: (wx, wy) => renderer.worldToHud(wx, wy),
      heroAnchor: () => (playerId != null ? renderer.anchorOf(playerId) : null),
      // wave 6 (customization kit): can the creation screen show the 3D hero, and a class's starting gear for it
      has3d: () => !!(renderer.is3d && renderer.stageOk),
      startGear: (cls) => ((content.classes[cls] || {}).startGear || {}),
      scenes: () => !!renderer.is3d, talkVoice: (m) => audio.talk(m),   // wave 6 quest scenes (src/ui/talk_ui.js)
    },
  });
  // online co-op (src/net/): host a game for up to 3 friends, or join one by room code or copy-paste codes
  const coop = createCoop({ world, ui, content, specFor, saveState: (id) => saveState(id), heroId: () => playerId, q,
    // the phone HUD has its menu buttons along the top: the co-op bar goes under the party frames (HUD px -> css px)
    barSpot: () => { const L = ui.layout(); if (!L.touch) return null; const r = L.party(3), l = renderer.layout, d = window.devicePixelRatio || 1; return { left: (l.ox + r.x * l.base) / d, top: (l.oy + (r.y + 2) * l.base) / d }; } });
  const notes = createLanternNotes({ notesUi: ui.notes, content, storage, bus, hero: () => heroEnt(), heroId: () => playerId,   // wave 9 notes
    toHud: (x, y) => renderer.worldToHud(x, y), is3d: () => !!(renderer.is3d && renderer.stageOk !== false), notify: (s) => ui.notify(s, 4) });   // wave 9 notes
  coop.useNotes(notes);   // wave 9 notes: the swap when friends play together (src/net/session.js { t:'notes' })

  ui.riddles.setNet({ isGuest: () => coop.isGuest, offer: (code) => coop.riddleOffer(code), rules: createRiddleRules(content.riddleRules, content.riddleBlocked) });   // wave 9 riddles
  const riddleHash = () => { const c = readRiddle(window.location); if (c) { ui.riddles.receive(c); clearRiddle(); } };   // wave 9 riddles
  riddleHash(); window.addEventListener('hashchange', riddleHash);   // wave 9 riddles: the card shows once a hero is in the world
  ui.setGameData({ classes: content.classes, abilities: content.abilities, talents: content.talents });
  ui.setItems(content.items);
  ui.setQuests(content.quests, content.npcs);
  ui.setAbilityContent(content.abilities, content.mobAbilities);
  if (ui.options.zoom && ZOOMS.includes(ui.options.zoom) && !q.get('zoom')) view.zoom = ui.options.zoom;
  // phones: the world at 1.5x unless the player picked a zoom (CRITIQUE_1 item 8); the canvas fills the screen
  view.touch = touch;
  if (touch && !ui.options.zoomSet && !q.get('zoom')) view.zoom = 1.5;
  view.fx = fxOverride || ui.options.fx;
  view.shake = ui.options.shake !== false;   // the 3D effects' camera kick (Options)
  audio.setVolumes({ master: 1, music: ui.options.music, sfx: ui.options.sfx });
  const touchCtl = touch ? createTouch({ canvas, input, ui }) : null;
  // the horizon camera (wave 5b, 3D only, an option): ?cam=horizon|fixed in the link wins, else Options: Camera.
  // Off (the default) leaves view.cam null and every horizon listener idle, so today's camera and controls are unchanged
  const hcam = renderer.is3d ? createHorizonCam({ touch }) : null;
  const hin = hcam ? attachHorizonInput({ canvas, cam: hcam, input, ui, touchCtl }) : null;
  function setCam(mode) {
    const want = ['horizon', 'fixed'].includes(q.get('cam')) ? q.get('cam') : mode;
    const on = !!hcam && want === 'horizon';
    view.cam = on ? hcam : null;
    if (hin) hin.setOn(on);
  }
  setCam(ui.options.cam);
  // wave 8 photo mode (src/ui/photo_ui.js, photo_rig.js): render-only. While it is open this client draws its own time,
  // weather and camera (the horizon camera, lent); on close the view goes back exactly as it was. Nothing reaches the sim,
  // the save or co-op, and tick() passes the sim no command from the keys, mouse or stick but `stop` (the hero stays put).
  let photoKeep = null;
  const zoneOf = () => { const e = heroEnt(); return e ? content.zones[e.zone] : null; };
  ui.setPhotoHooks({
    capture: () => (renderer.capture ? renderer.capture() : null), is3d: () => !!renderer.is3d && !!hcam, ready: () => !!renderer.ready,
    place: () => (place && place.name) || null, liveTod: () => dayFraction(snap, photoKeep || view), cam: () => hcam,
    zone: () => (heroEnt() || {}).zone || null, flying: () => !!(heroEnt() || {}).flight,
    place3d: () => { const z = zoneOf(); return !!z && isPlaceZone(z); }, under: () => { const z = zoneOf(); return !!z && (isPlaceZone(z) || !!z.cavern || !!z.atmos); },
  });
  function photoView() {
    if (ui.photo.on && ui.mode !== 'game') ui.photo.close('gone');
    const pv = ui.photo.view;
    if (pv && !photoKeep) photoKeep = { tod: view.tod, weather: view.weather, cam: view.cam };
    if (pv) {
      view.tod = pv.tod != null ? pv.tod : photoKeep.tod; view.weather = pv.weather != null ? pv.weather : photoKeep.weather; view.photo = pv.photo;
      if (hcam && view.cam !== hcam) { view.cam = hcam; if (hin) hin.setOn(true); }
    } else if (photoKeep) {
      view.tod = photoKeep.tod; view.weather = photoKeep.weather; view.photo = null;
      if (view.cam !== photoKeep.cam) { view.cam = photoKeep.cam; if (hin) hin.setOn(view.cam === hcam); }
      photoKeep = null;
    }
  }
  // Settings: synth music and sounds (wave 5b); off = today's sounds only. ?synth=0 / 1 overrides it (QA, the frame budget)
  audio.setSynth(synthQ === '0' ? false : synthQ === '1' ? true : ui.options.synth !== false);
  // the Lantern Chest's Shared tab (every hero on this device): its own key, never inside a hero save (src/ui/save.js)
  world.setShared(loadShared(storage));
  window.addEventListener('storage', (ev) => { if (ev.key === SHARED_KEY) world.setShared(loadShared(storage)); });   // another tab wrote it

  /** addPlayer spec for a stored character: a new hero, or the full restore (CONTRACTS 2.4). */
  function specFor(c) {
    const s = c.state;
    // big world: every hero carries a Lantern Stone (a new one also gets it on the bar); travel fields from the save
    if (!s) return { name: c.name, cls: c.cls, look: c.look, ...(c.build ? { build: c.build } : {}), ...(c.app ? { app: c.app } : {}), lanternStone: true, newHero: true, ...startSpot(c) };   // save v2: a migrated hero not yet played; app: wave 6
    // an old save names its area ('valley') and that area's tiles: addPlayer moves it onto the world map
    const at = s.zone && (content.zones[s.zone] || (content.regionAt || {})[s.zone]) && s.tx != null ? { zone: s.zone, x: s.tx, y: s.ty } : {};
    return { name: c.name, cls: c.cls, look: c.look, ...at, level: s.level, xp: s.xp, gold: s.gold, bag: s.bag, bags: s.bags, equip: s.equip,
      known: s.known, bar: s.bar, talents: s.talents, quests: stripEscorts(s.quests), questsDone: s.questsDone, nodesUsed: s.nodesUsed,
      respecs: s.respecs, lantern: s.lantern, build: s.build || c.build,     // build: Builds 2 (save v2, src/data/builds2.js)
      // fix pass 1: the sim-owned part (health, resource, cooldowns, lasting buffs, quest bag, loot waiting, escorts)
      qbag: s.qbag, pendingLoot: s.pendingLoot, hp: s.hp, res: s.res, cdLeft: s.cdLeft, auras: s.auras, escorts: s.escorts,
      bounties: s.bounties,                                                  // the bounty boards: which were handed in today
      dungeons: s.dungeons,                                                  // dungeons: today's first clears, the legendary bad-luck count
      glyphSeen: s.glyphSeen,                                                // wave 9 music: letters ever found (optional)
      chest: s.chest, gbag: s.gbag,                                          // the hero's Lantern Chest tab and glyph pouch (missing = empty)
      barOff: s.barOff,                                                      // skills the player took off the bar (save v2)
      // rest XP (src/sim/worldlife.js): the bank, and the real time away since the last save (savedAt, ms; this PC's clock,
      // never inside the sim). A save without them banks nothing new. Optional fields: SAVE_VERSION is unchanged.
      rest: s.rest, offlineSecs: Number.isFinite(s.savedAt) ? Math.max(0, (Date.now() - s.savedAt) / 1000) : 0,
      prof: s.prof,                                                       // professions (optional; src/sim/professions.js)
      home: s.home, flights: s.flights, lanternStone: true,                  // big world travel (src/sim/travel.js); optional fields
      riddles: s.riddles,                                                    // wave 9 riddles: the riddles solved count (optional)
      mounts: s.mounts, mountPick: s.mountPick,                              // mounts owned, the last ridden (src/sim/mounts.js); optional
      app: s.app || c.app || null };                                         // wave 6: the hero's own look (the mirror's last word is in state)
  }
  /** Where a brand-new hero starts: its class's start realm (chosen on creation, the default) or Willowmere ({}). */
  function startSpot(c) {
    const R = (content.startRealms || {})[c.cls];
    if (!R || c.start !== 'realm') return {};       // Willowmere (and every hero made before the choice existed)
    return { zone: R.zone, x: R.x, y: R.y, lantern: { ...R.lantern }, home: { inn: R.home } };
  }
  // an escort in progress cannot be restored (its npc is gone): it restarts as a fresh accept would
  const stripEscorts = (qs) => { if (!qs) return qs; const o = {}; for (const [k, v] of Object.entries(qs)) { const { escort, ...rest } = v; void escort; o[k] = rest; } return o; };
  /** The character as a save (plain JSON; positions in tiles). */
  function saveState(id) {
    const e = world.get(id);
    if (!e || e.kind !== 'player') return null;
    const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
    // a dead hero saves at the lantern they will wake at
    // a hero on a Lantern Kite saves where the kite lands (big world, src/sim/travel.js)
    const fl = e.flight && content.travel ? content.travel.flight.points[e.flight.to] || (content.travel.rides || {})[e.flight.to] || null : null;   // a ride (wave 3) saves at its landing too
    const spot = e.dead && e.lantern ? { zone: e.lantern.zone, tx: e.lantern.x, ty: e.lantern.y } : fl ? { zone: fl.zone, tx: fl.land[0], ty: fl.land[1] }
      : { zone: e.zone, tx: Math.floor(e.x / (TILE * 16)), ty: Math.floor((e.y - 1) / (TILE * 16)) };   // SUB -> tiles
    return { v: 2, name: e.name, cls: e.cls, look: e.look, level: e.level, xp: e.xp, gold: e.gold || 0, ...spot,
      bag: clone(e.bag), bags: clone(e.bags), equip: clone(e.equip), known: clone(e.known), bar: padBar(e.bar), talents: clone(e.talents),
      quests: clone(e.quests), questsDone: clone(e.questsDone), nodesUsed: clone(e.nodesUsed), respecs: e.respecs || 0, lantern: clone(e.lantern),
      ...(world.saveFields ? clone(world.saveFields(id)) || {} : {}), savedAt: Date.now() };   // savedAt: rest XP's time away (specFor)
  }
  function addHero(spec) {
    playerId = world.addPlayer(spec);
    joins.push([world.tick, spec]);
    renderer.setPlayer(playerId);
    musicArea = null;                  // the next frame picks the area's music
    return playerId;
  }
  const devStart = ['paused', 'zone', 'zoom', 'seed', 'skiptitle'].some((k) => q.has(k));
  if (devStart) {
    addHero({
      name: q.get('name') || 'Scott', cls: q.get('cls') || 'warden', look: Number(q.get('look')) || 0, lanternStone: true, newHero: true,
      ...(q.get('zone') ? { zone: q.get('zone'), x: Number(q.get('x')), y: Number(q.get('y')) } : {}),
    });
    ui.attach(playerId);
  } else audio.music('title');
  const nameOf = (id) => { const e = world.get(id); return e ? e.name : `#${id}`; };
  bus.on('*', (ev) => ui.handleEvents([ev], { nameOf, zoneNames: content.zoneNames }));
  // every store / take / move / row at the Lantern Chest saves at once: the Shared tab under its own key when it changed,
  // and the hero (a crash must not duplicate or lose an item)
  bus.on('*', (ev) => {
    if (ev.type !== 'chest' || ev.id !== playerId || coop.isGuest) return;   // a guest's chest lives in the host's world
    if (ev.shared) saveShared(storage, world.shared());
    ui.saveProgress();
  });
  // ---- BEGIN dungeon loading card (render lane, 2026-11-22; src/ui/loading.js) ----
  // The hero's own step into (or, when the renderer must rebuild, out of) a dungeon or cave shows the card on this tick,
  // before the frame that would draw the new place; it is drawn over everything after the HUD until the renderer says
  // the place is ready (3D: built and warmed behind it). Drivers: renderer.loadingCard.
  {
    const { createLoadingCard } = await import('./ui/loading.js');
    const card = createLoadingCard({ font });
    bus.on('zone', (ev) => { if (ev.id === playerId) card.onZone(ev, { zones: content.zones, renderer }); });
    const drawHud0 = renderer.drawHud;
    renderer.drawHud = (fn) => { drawHud0(fn); card.draw(canvas.getContext('2d'), renderer, performance.now()); };
    renderer.loadingCard = card;
  }
  // ---- END dungeon loading card ----
  // ---- big world travel (src/ui/travelui.js): the Lantern Stone's cast bar and the flight bar over the HUD, the toasts
  {
    const { createTravelUi } = await import('./ui/travelui.js');
    const tv = createTravelUi({ font, content });
    bus.on('*', (ev) => { const t = tv.message(ev, playerId); if (t) ui.notify(t, 4); });
    const drawHud1 = renderer.drawHud;
    renderer.drawHud = (fn) => { drawHud1((c, l) => { fn(c, l); }); if (!renderer.loadingCard || !renderer.loadingCard.active) tv.draw(canvas.getContext('2d'), renderer, snap, playerId); };
  }

  // ---- BEGIN boss intro card (wave 6, bosscard lane; src/ui/boss_card.js, src/render3d/boss_cam.js) ----
  // The first pull of each boss per run: a card for about 2.5 s and a short push-in (render and UI only, no input, never
  // pauses). Settings "Quest scenes" Off: no card (read as !== false, so it is on before the option exists).
  {
    const { createBossCard } = await import('./ui/boss_card.js');
    const bc = createBossCard({ content, zoneNames: content.zoneNames });
    bus.on('*', (ev) => bc.onEvent(ev, { snap, playerId, enabled: ui.options.questScenes !== false }));
    const draw0 = renderer.draw;
    renderer.draw = (p, s, a, v) => { v.bossCam = bc.frame(v.time || 0, s, playerId); return draw0(p, s, a, v); };
    ui.bossCard = (ctx, g, L, t) => bc.draw(ctx, g, L, t);
    renderer.bossCard = bc;
  }
  // ---- END boss intro card ----

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
  /** Friends' names over their heads, in HUD px (online co-op: the other heroes of this hero's party). */
  function namePlates() {
    const me = heroEnt();
    if (!me || me.party == null) return [];
    if (renderer.is3d && renderer.stageOk !== false) return [];   // wave 8 talk: 3D already names every other hero (renderer3d drawPlates)
    const out = [];
    const l = renderer.layout;
    for (const e of snap.entities) {
      if (e.kind !== 'player' || e.id === playerId || e.party !== me.party || e.zone !== me.zone) continue;
      const a = renderer.anchorOf(e.id);
      if (!a) continue;
      const [x, y] = renderer.worldToHud(a.x, a.y - a.h);
      if (x < -40 || y < -16 || x > l.hudW + 40 || y > l.hudH + 16) continue;
      out.push({ x, y, name: e.name, dead: !!e.dead, id: e.id });
    }
    return out;
  }
  /** wave 8 talk: every hero's head in the zone on screen, HUD px (speech bubbles; a watcher's view follows the host). */
  function talkHeads() {
    const zone = view.zone, out = [];
    const l = renderer.layout;
    const is3d = !!(renderer.is3d && renderer.stageOk !== false);
    const me = heroEnt();
    for (const e of snap.entities) {
      if (e.kind !== 'player' || e.zone !== zone) continue;
      const a = renderer.anchorOf(e.id);
      if (!a) continue;
      const [x, y] = renderer.worldToHud(a.x, a.y - a.h);
      if (x < -40 || y < -16 || x > l.hudW + 40 || y > l.hudH + 40) continue;
      out.push({ id: e.id, name: e.name, x, y, me: e.id === playerId, plate: e.id !== playerId && (is3d || (me && me.party != null && e.party === me.party)), is3d });
    }
    return out;
  }
  const heroEnt = () => (playerId != null ? snap.entities.find((e) => e.id === playerId) || null : null);
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
  let replay = null;                   // wave 8 replays (set below, before the loop starts)
  let chron = null;                    // wave 9 chronicle (set below, after the replays)
  const commandLog = [];   // [tick, entityId, cmd]: replayable (CONTRACTS section 2.3)
  function tick() {
    if (coop.isGuest) {
      // a guest: input goes to the host; the host's frames come back (one per tick, src/net/session.js nextFrame)
      if (playerId != null) {
        const ic = input.poll({ snap, playerId, pick: renderer.pick, toWorld: renderer.devToWorld });
        const cmds = [...(ui.photo.on ? photoInput(ic) : ic), ...uiCommands.splice(0)];   // wave 8 photo: the hero stays put
        coop.sendCmds(cmds);
      } else { input.poll({ snap, playerId: null }); uiCommands.length = 0; }
      const fr = coop.nextFrame();
      prev = snap;
      if (fr) { snap = fr.snap; bus.publish(fr.events); renderer.feed(fr.events); }
      return;
    }
    if (playerId != null) {
      const ic = input.poll({ snap, playerId, pick: renderer.pick, toWorld: renderer.devToWorld });
      for (const cmd of [...(ui.photo.on ? photoInput(ic) : ic), ...uiCommands.splice(0)]) {   // wave 8 photo: the hero stays put
        world.enqueue(playerId, cmd);
        commandLog.push([world.tick + 1, playerId, cmd]);
      }
    } else { input.poll({ snap, playerId: null }); uiCommands.length = 0; }
    coop.beforeStep();                 // a host: friends' commands join the queue
    const events = world.step();
    prev = snap;
    snap = world.snapshot();
    bus.publish(events);
    renderer.feed(events);
    coop.afterStep(events, snap);      // a host: one frame to each friend
  }
  coop.onCommandLogged((id, cmd) => commandLog.push([world.tick + 1, id, cmd]));
  coop.onJoinLogged((tick, spec) => joins.push([tick, spec]));     // a friend's hero, added by the host (docs/NET.md)
  // frame timing for drivers (60 fps check): a rolling window of rAF deltas
  const frames = { last: 0, dts: [] };
  function render(alpha, nowMs) {
    if (replay && replay.render(alpha, nowMs)) return;   // wave 8: the replay viewer draws its own frame (src/replay/)
    if (frames.last) { frames.dts.push(nowMs - frames.last); if (frames.dts.length > 240) frames.dts.shift(); }
    frames.last = nowMs;
    const me = playerId != null ? snap.entities.find((e) => e.id === playerId) : null;
    // before a hero exists the world still draws (behind the title art) at the start zone
    const watchE = !me && coop.watchId != null ? snap.entities.find((e) => e.id === coop.watchId) : null;   // a drop-in watcher follows the host
    view.zone = me ? me.zone : watchE ? watchE.zone : content.start.zone; view.followId = watchE ? watchE.id : playerId; view.targetId = me ? me.target : null; view.time = nowMs / 1000;
    view.dpr = window.devicePixelRatio || 1; view.hud = ui.hudMode;
    view.stage = ui.stage;             // wave 6: the creation screen's or the mirror's turntable (renderer3d draws only it)
    view.inset = ui.mode === 'game' ? insets : null;   // title screens: the art covers the notch strips too
    view.talk = ui.talkView(snap);                     // wave 6 quest scenes: the talk camera (null: today's)
    photoView();                                       // wave 8 photo: this client's own time, weather and camera step
    // secret caches this hero has opened draw open, without their glint
    for (const e of snap.entities) if (e.node && e.node.secret) e.opened = (e.node.openedBy || []).includes(playerId);
    renderer.draw(prev, snap, alpha, view);
    const dpr = window.devicePixelRatio || 1;
    ui.setMetrics({ cssPerHud: renderer.layout.base / dpr });
    if (me) {
      const z = content.zones[me.zone];
      place = placeAt(z, Math.floor(me.x / TILE), Math.floor((me.y - 1) / TILE));   // snapshot positions are pixels
      // an area starts its own music (a new zone or world region; the roads keep the music you came with), its ambience
      // bed, the battle track in a real fight, friends' sounds by distance (src/audio/audio.js frame)
      audio.frame(nowMs, { me, snap, place, zone: z, fresh: musicArea == null });
      letterNotes.frame(snap.hud && snap.hud[playerId], playerId, ui, { synthOn: synthQ === '0' ? false : ui.options.synth !== false });   // wave 9 music
      musicArea = place.region || place.id;
    } else audio.frame(nowMs, { snap });
    const vm = buildViewModel(snap, playerId, { zoneNames: content.zoneNames, log: ui.logText(), tickHz: TICK_HZ, place: me ? place : null });
    renderer.drawHud((ctx) => ui.draw(ctx, vm, snap, nowMs / 1000));
  }
  window.addEventListener('keydown', (ev) => {
    if (ui.mode !== 'game') return;    // zoom keys only in play (the name field takes '-')
    if (ev.code === 'Equal' || ev.code === 'NumpadAdd') view.zoom = ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(view.zoom) + 1)];
    if (ev.code === 'Minus' || ev.code === 'NumpadSubtract') view.zoom = ZOOMS[Math.max(0, ZOOMS.indexOf(view.zoom) - 1)];
  });
  // keep the hero on this PC: every 5 s, on hide (phones rarely fire beforeunload) and on unload
  setInterval(() => ui.saveProgress(), 5000);
  // 3D was asked for but could not start: say so once the hero is in the world (a toast on the title would be missed)
  if (fell2d) { const t = setInterval(() => { if (ui.mode === 'game') { clearInterval(t); ui.notify('3D could not start on this device. Showing 2D.', 8); } }, 500); }
  setInterval(() => { if (world.day !== bountyDay()) world.setDay(bountyDay()); }, 60000);
  window.addEventListener('beforeunload', () => { ui.saveProgress(); coop.shutdown(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ui.saveProgress(); });
  // updates reach a Home Screen copy (Scott 2026-11-19: the Home Screen app stayed on an old build with no Graphics switch).
  // iPhone keeps a Home Screen web app suspended, so opening it again resumes the old page. The deploy writes version.json
  // (the commit); when the game comes back to the front and the site has moved on, save and reload.
  const siteVersion = () => fetch('version.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.v) || null).catch(() => null);
  // a local test server has no version.json (the deploy writes it): skip the check there, so drivers see no 404
  const bootVersion = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) ? null : await siteVersion();
  coop.setBuild(bootVersion);          // host and friends must run the same build (a deploy in between: both reload)
  if (bootVersion) {
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible') return;
      const v = await siteVersion();
      if (v && v !== bootVersion && !coop.role) { ui.saveProgress(); window.location.reload(); }   // never mid co-op game
    });
  }

  // ---- wave 8 replays (src/replay/replay_ui.js): boss and rare fights record by themselves, R any fight, the Replays list
  replay = await import('./replay/replay_ui.js').then((m) => m.createReplayUi({ world, content, renderer, view, ui, input, canvas, font, touch,
    heroId: () => playerId, liveHero: () => heroEnt(), isGuest: () => coop.isGuest, build: () => bootVersion, createHorizonCam })).catch((e) => { console.warn('replays', e); return null; });
  if (replay) ui.act.replays = () => replay.openList();
  // wave 9 chronicle (src/chronicle/): the night's story with the stills the game took itself, the picture, the #chron= link
  chron = await import('./chronicle/chronicle.js').then((m) => m.createChronicle({ bus, content, renderer, ui, input, canvas, font, touch,
    heroId: () => playerId, snapshot: () => snap, coop, replay: () => replay, q })).catch((e) => { console.warn('chronicle', e); return null; });
  if (chron) ui.act.chronicle = () => chron.openList();   // wave 9 chronicle: Options: Chronicle
  const loop = createLoop({ hz: TICK_HZ, tick, render });
  coop.setPump({ loop, tick });
  if (q.get('paused') !== '1') loop.start();
  else render(0, 0);

  window.__realms = {
    world, get playerId() { return playerId; }, input, renderer, view, commandLog, joins, ui, audio, content, net: coop,
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
    photo: ui.photo,                   // wave 8 photo mode: drivers (open, state, save)
  };
  if (q.get('dev') === '1') {
    // DEV ONLY (drivers and testing): never reachable without ?dev=1
    window.__realms.dev = {
      xp(n) { if (playerId != null) world.grantXp(playerId, n, 'quest'); },
      level(L) { if (playerId != null) world.setLevel(playerId, L); },
      gold(n) { const e = world.get(playerId); if (e) e.gold = (e.gold || 0) + n; },
      /** a bag item for drivers (phone item-card check): an item id from content.items */
      item(id, qty = 1) { const e = world.get(playerId); if (e) return bagAdd(e, id, qty, null, content); return 0; },
      /** glyph stones into the pouch (no drops are wired yet): glyphs('AOGS', 2) */
      glyphs(letters = 'ASHVOW', qty = 1) { const e = world.get(playerId); let n = 0; if (e) for (const L of String(letters).toUpperCase()) if (content.items[`glyph_${L.toLowerCase()}`]) n += bagAdd(e, `glyph_${L.toLowerCase()}`, qty, null, content); return n; },
      hp(n) { const e = world.get(playerId); if (e && !e.dead) e.hp = Math.max(1, Math.min(e.hpMax, n)); },
    };
    if (replay) replay.recorder.devTouch(window.__realms.dev);   // a dev write mid-recording drops that recording
    if (replay) window.__realms.replay = replay;                 // drivers
    if (chron) window.__realms.chronicle = chron;                // wave 9 chronicle: drivers
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

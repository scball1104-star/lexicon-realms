// The UI controller: title -> character select / creation -> game; the HUD; menu windows; mouse, keyboard and
// touch routing in front of src/input/ (UI events are handled first and stopped, everything else reaches input).
//
//   const ui = await createUI({ canvas, font, zones, zoneNames, storage, touch, hooks })
//   hooks: { enterWorld(char) -> playerId, command(cmd), input (createInput object), setZoom(z), logout(), getLayout() }
//   ui.draw(ctx, vm, snap, timeSec)   once per frame, inside renderer.drawHud (640x360 layer)
//   ui.handleEvents(events)           sim events -> chat / combat log
//   ui.mode                           'title' | 'select' | 'create' | 'game'
//
// The HUD layer is 640x360, the same pixel density as the world (CONTRACTS section 10, decided 2026-11-19).
import { loadUiArt } from './uiassets.js';
import { createGfx } from './gfx.js';
import { createCharArt } from './charsprite.js';
import { createMinimapBook } from './minimap.js';
import { createHud, drawTooltip } from './hud.js';
import { hudLayout, hitPx, inRect, menuRect, W, H } from './layout.js';
import { buildHudModel } from './uivm.js';
import { drawCharacter, drawBags, drawQuestLog, drawMap, drawOptions } from './menus.js';
import { drawTalents } from './talents.js';
import { drawTitle, drawSelect, drawCreate } from './title.js';
import { createCharStore, loadOptions, saveOptions, validateName } from './save.js';
import { routeKey, rebind, effectiveBinds, keyLabel } from './keymap.js';
import { eventLines } from './eventlog.js';
import { setGameData, setItems, abilityInfo, abilityTooltip, classInfo, classOrder, itemInfo, talentTree, talentState, canUnlearn, talentPointsAt, xpToNext } from './gamedata.js';
import { demoState, demoLog } from './demo.js';

const SIDE = ['character', 'bags'];
const CENTER = ['talents', 'quests', 'map', 'menu'];

export async function createUI({ canvas, font, zones, zoneNames = {}, storage = null, touch = false, hooks = {}, demo = null }) {
  const art = await loadUiArt({ font });
  const g = createGfx(art);
  const charArt = createCharArt(art);
  const mapBook = createMinimapBook(zones);
  const hud = createHud({ g, charArt, mapBook });
  const store = createCharStore(storage);
  let options = loadOptions(storage);
  const scratchC = document.createElement('canvas');
  const scratch = (w, h) => { if (scratchC.width < w || scratchC.height < h) { scratchC.width = w; scratchC.height = h; } return scratchC; };
  const zoneList = Object.keys(zones).map((id) => ({ id, name: zoneNames[id] || id }));

  // ---- state
  const st = {
    mode: 'title', open: new Set(), hover: null, regions: [], toast: null, chatScroll: 0, trackerCollapsed: false,
    confirm: null, rebinding: null, talentSel: null, questSel: null, mapZone: null, joystick: null, pressed: null,
    name: '', nameFocus: false, cls: null, look: 0, err: null, selId: null, charId: null, longTip: null,
    drag: null, metrics: { cssPerHud: 1, touch }, now: 0,
  };
  // PLACEHOLDER state for SPEC fields the sim does not send yet (quests, bag, equip, gold, talents). See uivm.js.
  const local = { quests: [], bag: { size: 16, items: [] }, equip: {}, gold: 0, talents: {} };
  let demoExtra = null;
  if (demo) {
    demoExtra = demoState(demo);
    Object.assign(local, { quests: demoExtra.quests, bag: demoExtra.bag, equip: demoExtra.equip, gold: demoExtra.gold, talents: demoExtra.talents || {} });
  }
  const log = demo ? demoLog(demo === 'worst') : [];
  let lastModel = null, playerId = null, lastSnap = null;

  // hidden text field: brings up the phone keyboard and handles IME / paste on desktop
  const nameInput = document.createElement('input');
  Object.assign(nameInput, { type: 'text', maxLength: 16, autocomplete: 'off', spellcheck: false });
  nameInput.setAttribute('autocapitalize', 'words');
  nameInput.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;pointer-events:none;';
  document.body.appendChild(nameInput);
  nameInput.addEventListener('input', () => { st.name = nameInput.value; st.err = null; });
  nameInput.addEventListener('blur', () => { st.nameFocus = false; });

  const toast = (text, secs = 2.5) => { st.toast = { text, until: st.now + secs }; };
  const say = (ch, text) => { log.push({ ch, text }); if (log.length > 200) log.splice(0, log.length - 200); st.chatScroll = 0; };
  const localOnly = () => !!demoExtra || !(lastSnap && playerId != null && (lastSnap.entities.find((e) => e.id === playerId) || {}).talents);
  const send = (cmd) => { if (hooks.command) hooks.command(cmd); };

  // ---- the action surface menus and screens call
  const act = {
    store, toast,
    go(mode) {
      st.mode = mode; st.confirm = null; st.err = null;
      if (mode === 'create') { st.name = ''; nameInput.value = ''; st.cls = null; st.look = 0; if (!st.metrics.touch) act.focusName(); }
      else { nameInput.blur(); st.nameFocus = false; }
    },
    focusName() { nameInput.value = st.name || ''; nameInput.focus({ preventScroll: true }); st.nameFocus = true; },
    create() {
      const r = store.add({ name: st.name, cls: st.cls, look: st.look });
      if (!r.ok) { st.err = r.reason; return; }
      nameInput.blur();
      act.enter(r.char.id);
    },
    enter(id) {
      const c = store.get(id);
      if (!c) return;
      store.touch(id);
      st.charId = id;
      playerId = hooks.enterWorld ? hooks.enterWorld(c) : null;
      st.mode = 'game'; st.open.clear();
      say('system', `Welcome to Willowmere, ${c.name}.`);
      if (!c.lastPlayedSeq || c.createdSeq === c.lastPlayedSeq - 1) {
        say('system', st.metrics.touch ? 'Left thumb to walk. Tap a foe to target it, tap a person to talk. Your skills are on the right.'
          : 'WASD to walk, Tab to target, 1 to 6 to fight. C, B, L, N, M open your menus.');
      }
    },
    close(id) { st.open.delete(id); st.confirm = null; st.rebinding = null; st.talentSel = null; },
    toggle(id) {
      if (st.open.has(id)) { act.close(id); return; }
      if (CENTER.includes(id)) for (const c of CENTER) st.open.delete(c);
      if (st.metrics.touch) st.open.clear();         // one window at a time on a phone
      st.open.add(id); st.confirm = null;
      if (id === 'map') st.mapZone = null;
    },
    learnTalent(id) {
      send({ t: 'learn_talent', talent: id });
      if (localOnly()) { local.talents = { ...local.talents, [id]: (local.talents[id] || 0) + 1 }; }
    },
    unlearnTalent(id) {
      send({ t: 'unlearn_talent', talent: id });
      if (localOnly()) { const n = (local.talents[id] || 0) - 1; const nt = { ...local.talents }; if (n > 0) nt[id] = n; else delete nt[id]; local.talents = nt; }
    },
    respec() { send({ t: 'respec' }); if (localOnly()) local.talents = {}; toast('Talents reset.'); },
    abandonQuest(id) {
      send({ t: 'quest_abandon', quest: id });
      const q = local.quests.find((o) => o.id === id);
      local.quests = local.quests.filter((o) => o.id !== id);
      if (q) say('system', `Quest abandoned: ${q.name}`);
    },
    trackQuest(id, on) {
      const tracked = local.quests.filter((q) => q.tracked !== false).length;
      if (on && tracked >= 5) { toast('You can track 5 quests at once.'); return; }
      local.quests = local.quests.map((q) => (q.id === id ? { ...q, tracked: on } : q));
    },
    useItem(i) {
      const it = local.bag.items[i];
      if (!it) return;
      const info = itemInfo(it);
      if (info.slot) {
        send({ t: 'equip', bagSlot: i, item: info.id });
        const prev = local.equip[info.slot] || null;
        local.equip = { ...local.equip, [info.slot]: { ...it, qty: 1 } };
        local.bag.items[i] = prev;
        toast(`Equipped ${info.name}.`);
      } else if (info.use) { send({ t: 'use_item', bagSlot: i, item: info.id }); toast(`Used ${info.name}.`); }
      else toast(`${info.name} cannot be used.`);
    },
    unequip(slot) {
      const it = local.equip[slot];
      if (!it) return;
      const free = local.bag.items.findIndex((x, k) => !x && k < local.bag.size);
      const idx = free >= 0 ? free : local.bag.items.length < local.bag.size ? local.bag.items.length : -1;
      if (idx < 0) { toast('Your bags are full.'); say('error', 'Your bags are full.'); return; }
      send({ t: 'unequip', slot });
      local.bag.items[idx] = it;
      const e = { ...local.equip }; delete e[slot]; local.equip = e;
    },
    setOption(key, v) {
      options = { ...options, [key]: v };
      saveOptions(storage, options);
      if (key === 'zoom' && hooks.setZoom) hooks.setZoom(v);
      if (hooks.optionsChanged) hooks.optionsChanged(options);
    },
    logout() { saveProgress(); if (hooks.logout) hooks.logout(); },
  };

  function saveProgress() {
    if (st.charId == null || !lastSnap || playerId == null) return;
    const e = lastSnap.entities.find((o) => o.id === playerId);
    if (!e) return;
    store.update(st.charId, { level: e.level, xp: e.xp || 0, zone: e.zone, zoneName: zoneNames[e.zone] || e.zone, x: Math.floor(e.x / 16), y: Math.floor(e.y / 16) });
  }

  // ---------------------------------------------------------------- drawing
  function layoutNow() {
    return hudLayout({ touch: st.metrics.touch, minHit: st.metrics.touch ? hitPx(st.metrics.cssPerHud) : 15 });
  }

  function draw(ctx, vm, snap, t) {
    st.now = t;
    lastSnap = snap;
    const L = layoutNow();
    const env = { g, charArt, mapBook, art, L, hover: st.hover, scratch, zoneList };
    const regions = [];
    ctx.imageSmoothingEnabled = false;
    if (st.mode === 'title') drawTitle(ctx, env, st, regions, act, t);
    else if (st.mode === 'select') drawSelect(ctx, env, st, regions, act, t);
    else if (st.mode === 'create') drawCreate(ctx, env, st, regions, act, t);
    else {
      let m = buildHudModel(vm, snap, { state: local, tickHz: 20 });
      if (demoExtra) m = applyDemo(m);
      lastModel = m;
      st.openMenu = [...st.open].pop() || null;
      regions.push(...hud.draw(ctx, m, L, st, { log, keyLabels: Array.from({ length: 6 }, (_, i) => keyLabel(effectiveBinds(options.binds)[`slot${i + 1}`])) }));
      if (m.player) {
        for (const id of SIDE) if (st.open.has(id)) (id === 'character' ? drawCharacter : drawBags)(ctx, env, m, st, regions, act);
        if (st.open.has('quests')) drawQuestLog(ctx, env, m, st, regions, act);
        if (st.open.has('map')) drawMap(ctx, env, m, st, regions, act);
        if (st.open.has('talents')) drawTalents(ctx, env, m, st, regions, act);
        if (st.open.has('menu')) drawOptions(ctx, env, m, st, regions, act, options);
        hud.menuBar(ctx, L, st, regions);
      }
    }
    st.regions = regions;
    // tooltip (hover on desktop, long-press on touch)
    const tipAt = st.metrics.touch ? st.longTip : st.hover;
    if (tipAt) {
      const r = topRegion(tipAt.x, tipAt.y);
      let tip = r && r.tip ? r.tip : null;
      if (!tip && r && r.tipAbility) tip = abilityTooltip(abilityInfo(r.tipAbility), 1, (classInfo(st.cls) || {}).resource);
      if (!tip && r && lastModel && st.mode === 'game') tip = hud.tooltipFor(r, lastModel);
      if (tip && !(r.kind === 'talent')) drawTooltip(g, ctx, tip, tipAt.x + 12, tipAt.y - 8);
    }
    if (st.toast && st.toast.until > t) {
      const w = g.textW(st.toast.text) + 16;
      g.window(ctx, Math.floor((W - w) / 2), 150, w, 18, 'thin', 'slate', 0.95);
      g.text(ctx, st.toast.text, W / 2, 153, 'cream', { align: 'center' });
    }
  }

  function applyDemo(m) {
    const d = demoExtra;
    const p = m.player ? { ...m.player } : null;
    if (p && d.level) { p.level = d.level; p.xp = 8450; p.xpToLevel = 12000; p.hp = 1066; p.hpMax = 1480; p.hpFrac = 1066 / 1480; if (p.res) p.res = { ...p.res, cur: 41, max: 100, frac: 0.41 }; }
    const total = talentPointsAt(p ? p.level : 1);
    const spent = Object.values(local.talents).reduce((s, r) => s + r, 0);
    let bar = m.bar;
    if (p && d.level) {
      const ci = classInfo(p.cls);
      bar = ci.abilities.map((id, i) => { const a = abilityInfo(id); return { slot: i + 1, ability: id, name: a.name, icon: a.icon, key: String(i + 1),
        cdLeft: i === 1 ? 6 : i === 3 ? 14 : 0, cdTotal: i === 1 ? 6 : i === 3 ? 45 : 0, usable: i !== 4, inRange: i !== 2, gcdLeft: i === 0 ? 0.6 : 0, gcdTotal: 1 }; });
    }
    const castBar = d.level && !m.castBar ? { ability: 'demo', name: (abilityInfo(classInfo(p.cls).abilities[5]) || { name: 'Casting' }).name, frac: 0.62, left: 0.7 } : m.castBar;
    return { ...m, player: p, bar, castBar, talents: local.talents, party: d.party.length ? d.party : m.party, talentPoints: { total, spent, free: Math.max(0, total - spent) } };
  }

  function topRegion(x, y) {
    for (let i = st.regions.length - 1; i >= 0; i--) if (inRect(st.regions[i].rect, x, y)) return st.regions[i];
    return null;
  }

  // ---------------------------------------------------------------- pointer
  function toHud(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const dx = (clientX - r.left) * (canvas.width / r.width), dy = (clientY - r.top) * (canvas.height / r.height);
    const l = hooks.getLayout ? hooks.getLayout() : { ox: 0, oy: 0, base: 1 };
    return { x: (dx - l.ox) / l.base, y: (dy - l.oy) / l.base };
  }

  /** A press at HUD (x, y) with button 0 (primary) or 2. Returns true when the UI took it. */
  function press(x, y, button = 0) {
    if (st.mode !== 'game') {
      const r = topRegion(x, y);
      if (r && r.on) r.on(button);
      else if (st.mode === 'title' && !r) { if (store.list().length) act.go('select'); else act.go('create'); }
      if (st.mode === 'create' && (!r || r.kind !== 'name_field')) { nameInput.blur(); st.nameFocus = false; }
      return true;
    }
    if (st.rebinding) { st.rebinding = null; }
    const r = topRegion(x, y);
    if (!r) {
      // a click outside the open windows closes the touch window; on desktop windows stay
      return false;
    }
    if (r.drag) { st.drag = r; r.drag(x); return true; }
    if (r.on) { r.on(button); return true; }
    switch (r.kind) {
      case 'slot': if (r.ability || r.slot) hooks.input && hooks.input.inject({ k: 'cast', slot: r.slot }); st.pressed = `slot${r.slot}`; return true;
      case 'interact': hooks.input && hooks.input.inject({ k: 'interact' }); st.pressed = 'interact'; return true;
      case 'next_target': hooks.input && hooks.input.inject({ k: 'tab', back: false }); st.pressed = 'next_target'; return true;
      case 'menu_button': act.toggle(r.id); return true;
      case 'minimap': act.toggle('map'); return true;
      case 'tracker_head': st.trackerCollapsed = !st.trackerCollapsed; return true;
      case 'tracker_quest': st.questSel = r.id; if (!st.open.has('quests')) act.toggle('quests'); return true;
      case 'chat': case 'window': case 'xp': return true;
      case 'player': case 'target': case 'party': return true;
      default: return true;
    }
  }

  const onMouseMove = (ev) => {
    const p = toHud(ev.clientX, ev.clientY);
    st.hover = p.x >= 0 && p.y >= 0 && p.x < W && p.y < H ? p : null;
    if (st.drag && st.drag.drag && (ev.buttons & 1)) st.drag.drag(p.x);
  };
  const onMouseDown = (ev) => {
    if (ev.pointerType === 'touch' || ev.sourceCapabilities && ev.sourceCapabilities.firesTouchEvents) return;
    const p = toHud(ev.clientX, ev.clientY);
    st.hover = p;
    if (press(p.x, p.y, ev.button)) { ev.stopPropagation(); ev.preventDefault(); }
  };
  const onMouseUp = () => { st.drag = null; st.pressed = null; };
  const onWheel = (ev) => {
    const p = toHud(ev.clientX, ev.clientY);
    const r = topRegion(p.x, p.y);
    if (r && r.kind === 'chat') { st.chatScroll += ev.deltaY < 0 ? 1 : -1; ev.preventDefault(); }
    else if (r && r.scroll) { r.scroll(ev.deltaY < 0 ? -1 : 1); ev.preventDefault(); }
  };
  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('contextmenu', (ev) => ev.preventDefault(), true);

  // ---------------------------------------------------------------- keyboard
  const onKey = (down) => (ev) => {
    if (st.mode !== 'game') {
      if (!down) return;
      if (st.mode === 'create' && st.nameFocus && ev.code !== 'Enter' && ev.code !== 'Escape' && ev.code !== 'Tab') { ev.stopPropagation(); return; }
      ev.stopPropagation();
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter') {
        ev.preventDefault();
        if (st.mode === 'title') act.go(store.list().length ? 'select' : 'create');
        else if (st.mode === 'select' && st.selId != null) act.enter(st.selId);
        else if (st.mode === 'create') act.create();
      } else if (ev.code === 'Escape') {
        if (st.mode === 'create') act.go(store.list().length ? 'select' : 'title'); else if (st.mode === 'select') act.go('title');
      } else if (st.mode === 'select' && (ev.code === 'ArrowDown' || ev.code === 'ArrowUp')) {
        const list = store.list(); const i = list.findIndex((c) => c.id === st.selId);
        const n = list[(i + (ev.code === 'ArrowDown' ? 1 : list.length - 1)) % list.length]; if (n) st.selId = n.id; st.confirm = null;
      } else if (st.mode === 'create' && (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight' || ev.code === 'Tab')) {
        ev.preventDefault();
        const order = classOrder();
        const i = order.indexOf(st.cls || order[0]);
        st.cls = order[(i + (ev.code === 'ArrowLeft' || ev.shiftKey ? order.length - 1 : 1)) % order.length];
      } else if (st.mode === 'create' && !st.nameFocus && /^Key[A-Z]$/.test(ev.code)) { act.focusName(); }
      return;
    }
    // game
    if (st.rebinding) {
      if (!down) return;
      ev.stopPropagation(); ev.preventDefault();
      if (ev.code !== 'Escape') act.setOption('binds', rebind(options.binds, st.rebinding, ev.code));
      st.rebinding = null;
      return;
    }
    if (ev.repeat && down) { if (ev.code === 'Tab') ev.preventDefault(); }
    const route = routeKey(ev.code, down, options.binds);
    if (route.kind === 'pass') return;
    ev.stopPropagation();
    if (route.kind === 'swallow') { ev.preventDefault(); return; }
    if (route.kind === 'drive') {
      ev.preventDefault();
      if (ev.repeat) return;
      for (const [op, arg] of route.ops) if (hooks.input) hooks.input[op](arg);
      return;
    }
    // ui actions
    if (!down || ev.repeat) return;
    ev.preventDefault();
    if (route.action === 'menu') {
      const open = [...st.open];
      if (open.length) act.close(open[open.length - 1]);
      else if (lastModel && lastModel.target) hooks.input && hooks.input.inject({ k: 'clear' });
      else act.toggle('menu');
      return;
    }
    if (route.action === 'interact') { hooks.input && hooks.input.inject({ k: 'interact' }); return; }
    act.toggle(route.action);
  };
  window.addEventListener('keydown', onKey(true), true);
  window.addEventListener('keyup', onKey(false), true);

  // ---------------------------------------------------------------- the object
  const ui = {
    get mode() { return st.mode; },
    get state() { return st; },
    get options() { return options; },
    get model() { return lastModel; },
    get regions() { return st.regions; },
    store, act, local, log,
    draw,
    setMetrics({ cssPerHud, touch: t }) { st.metrics.cssPerHud = cssPerHud; if (t != null) st.metrics.touch = t; },
    layout: layoutNow,
    /** Touch / driver entry points (src/input/touch.js). */
    press, topRegion,
    hudPoint: toHud,
    setJoystick(j) { st.joystick = j; },
    setLongTip(p) { st.longTip = p; },
    setPressed(id) { st.pressed = id; },
    /** True when a HUD point belongs to the UI (a region, an open window, or a non-game screen). */
    owns(x, y) { return st.mode !== 'game' || !!topRegion(x, y); },
    handleEvents(events, ctx) {
      for (const ev of events) for (const l of eventLines(ev, { me: playerId, ...ctx })) say(l.ch, l.text);
    },
    say,
    logText: () => log.map((l) => l.text),
    saveProgress,
    get playerId() { return playerId; },
    /** Dev start / drivers: play an already-added entity (no saved character). */
    attach(id) { playerId = id; st.mode = 'game'; st.open.clear(); nameInput.blur(); },
    validateName: (n) => validateName(n, store.list()),
    talentInfo(cls = 'warden') { return talentTree(cls); },
    _talentState: talentState, _canUnlearn: canUnlearn, _xpToNext: xpToNext,
    isOpen: (id) => st.open.has(id),
    /** The data hook: real content over the design text (see gamedata.js). */
    setGameData(d) { return setGameData({ ...d, hasIcon: (n) => !!g.frame(n) }); },
    setItems,
    rect: menuRect,
  };
  return ui;
}

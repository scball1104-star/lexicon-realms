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
import { createHud, drawTooltip, drawQuestMark, drawGoalArrow } from './hud.js';
import { arrowMode } from './questnav.js';
import { hudLayout, hitPx, inRect, menuRect, W, H, BAR } from './layout.js';
import { buildHudModel } from './uivm.js';
import { drawCharacter, drawBags, drawQuestLog, drawMap, drawOptions } from './menus.js';
import { drawHelp } from './help.js';
import { drawTalents } from './talents.js';
import { drawTalents2, isBuilds2, b2Class, b2FailText } from './talents2.js';
import { drawTitle, drawSelect, drawCreate } from './title.js';
import { createCharStore, loadOptions, saveOptions, validateName } from './save.js';
import { routeKey, rebind, effectiveBinds, keyLabel } from './keymap.js';
import { eventLines } from './eventlog.js';
import { drawDialog, dialogFromInteract, dialogRectFor } from './dialog.js';
import { setQuests, npcInfo, questInfo as questInfoById, setGameData, setItems, abilityInfo, abilityTooltip, classInfo, classOrder, itemInfo, talentTree, talentState, canUnlearn, talentPointsAt, xpToNext, setAbilityContent, liveStats, resourceWord } from './gamedata.js';
import { demoState, demoLog } from './demo.js';

const SIDE = ['character', 'bags'];
const CENTER = ['talents', 'quests', 'map', 'menu', 'help'];

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
    confirm: null, rebinding: null, talentSel: null, questSel: null, navQuest: null, mapZone: null, joystick: null, pressed: null,
    name: '', nameFocus: false, cls: null, look: 0, err: null, selId: null, charId: null, longTip: null, itemPick: null,
    drag: null, metrics: { cssPerHud: 1, touch }, now: 0,
    dialog: null, untracked: new Set(), trained: new Set(), hint: null, levelUp: null, quiet: { text: null, t: -99 }, chatFade: 0,
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
    /** Phone full screen: the Fullscreen API where the browser has it (Android, iPad); an iPhone browser has none, so
     *  the title shows how to add the game to the home screen, which opens it with no browser bars. */
    canFullscreen() {
      if (typeof document === 'undefined' || typeof window === 'undefined') return false;
      const standalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
      return !standalone && !(document.fullscreenElement || document.webkitFullscreenElement);
    },
    fullscreen() {
      const d = document, el = d.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req && (d.fullscreenEnabled || d.webkitFullscreenEnabled)) {
        try {
          const p = req.call(el, { navigationUI: 'hide' });
          const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch { /* not offered */ } };
          if (p && p.then) p.then(lock, () => { st.fsHelp = true; }); else lock();
        } catch { st.fsHelp = true; }
      } else st.fsHelp = true;
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
      st.mode = 'game'; st.open.clear(); st.dialog = null; st.trained = new Set();
      st.navQuest = c.navQuest || null; st.questSel = null; st.mapZone = null;
      log.length = 0;
      if (!c.state) {
        // a brand-new hero: a short welcome and, once per hero, the controls card
        say('system', `Welcome to Willowmere, ${c.name}. Hob the innkeeper has a word for you: look for the gold ! over his head.`);
      } else say('system', `Welcome back, ${c.name}.`);
      if (!c.hinted) { st.hint = { t0: st.now }; store.update(id, { hinted: true }); }
    },
    close(id) { if (id === 'dialog') { act.closeDialog(); return; } st.open.delete(id); st.confirm = null; st.rebinding = null; st.talentSel = null; },
    send,
    closeDialog() { if (st.dialog && st.dialog.page === 'vendor') st.open.delete('bags'); st.dialog = null; st.confirm = null; },
    /** Ask the npc again (fresh quest lists after accept / turn-in), staying on the main page. */
    refreshDialog() { if (st.dialog) { const ent = st.dialog.ent; st.dialog.page = 'main'; st.dialog.quest = null; send({ t: 'interact', id: ent }); } },
    openVendor() { if (!st.dialog) return; st.dialog.page = 'vendor'; st.dialog.scroll = 0; st.open.add('bags'); },
    sellJunk() {
      if (!st.dialog || !lastModel) return;
      // highest index first so the earlier indexes stay valid while the sim applies them in order
      lastModel.bag.items.map((it, i) => [it, i]).filter(([it]) => it && it.kind === 'junk').reverse()
        .forEach(([it, i]) => send({ t: 'sell', npc: st.dialog.ent, bag: i, item: it.item, ...(it.uid != null ? { uid: it.uid } : {}) }));
    },
    dismissHint() { st.hint = null; },
    toggle(id) {
      if (st.open.has(id)) { act.close(id); st.itemPick = null; return; }
      if (CENTER.includes(id)) for (const c of CENTER) st.open.delete(c);
      if (st.metrics.touch) st.open.clear();         // one window at a time on a phone
      st.open.add(id); st.confirm = null; st.itemPick = null;
      if (id === 'map') st.mapZone = null;
    },
    /** The selected quest (questnav.js): the map, the minimap arrow and the gold arrow in the world follow it. Saved
     *  with the character. */
    selectQuest(id) {
      st.navQuest = id || null; st.questSel = id || st.questSel;
      if (st.charId != null) store.update(st.charId, { navQuest: st.navQuest });
    },
    /** Select a quest and open the map on the zone of its goal (quest log "Show on map", tracker rows, the map list). */
    showOnMap(id) {
      act.selectQuest(id);
      if (!st.open.has('map')) act.toggle('map');
      st.mapZone = null;           // the map opens on the selected quest's zone
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
    /** Builds 2 commands (talents2.js): remembered so a refusal can be worded ("Nothing to undo." vs "Nothing to reset."). */
    b2(cmd) { st.b2Last = cmd.t.replace(/^b2_/, ''); send(cmd); },
    abandonQuest(id) {
      send({ t: 'quest_abandon', quest: id });
      if (lastModel && lastModel.live) return;        // the sim's quest event writes the log line
      const q = local.quests.find((o) => o.id === id);
      local.quests = local.quests.filter((o) => o.id !== id);
      if (q) say('system', `Quest abandoned: ${q.name}`);
    },
    trackQuest(id, on) {
      if (lastModel && lastModel.live) {
        const tracked = lastModel.quests.filter((q) => q.tracked).length;
        if (on && tracked >= 5) { toast('You can track 5 quests at once.'); return; }
        if (on) st.untracked.delete(id); else st.untracked.add(id);
        return;
      }
      const tracked = local.quests.filter((q) => q.tracked !== false).length;
      if (on && tracked >= 5) { toast('You can track 5 quests at once.'); return; }
      local.quests = local.quests.map((q) => (q.id === id ? { ...q, tracked: on } : q));
    },
    useItem(i, hand = null) {
      if (lastModel && lastModel.live) {
        const it = lastModel.bag.items[i];
        if (!it) return;
        const ref = { bag: i, item: it.item, ...(it.uid != null ? { uid: it.uid } : {}) };   // uid: fix pass 1
        if (st.dialog && st.dialog.page === 'vendor') {
          if (it.kind === 'quest' || !it.value) { toast('The vendor will not buy that.'); return; }
          send({ t: 'sell', npc: st.dialog.ent, bag: i, item: it.item, ...(it.uid != null ? { uid: it.uid } : {}) });
          return;
        }
        // a dagger for a two-dagger class: ask which hand (the bags window shows Main hand / Off hand)
        if (!hand && act.twoHandPick(it)) { st.handPick = i; return; }
        st.handPick = null;
        if (it.slot || it.kind === 'bag') send({ t: 'equip', ...ref, ...(hand ? { slot: hand } : {}) });
        else if (it.use) send({ t: 'use_item', ...ref });
        else toast(`${it.name} cannot be used.`);
        return;
      }
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
    /** Can this bag item go in either hand (daggers for the Inkblade)? */
    twoHandPick(it) {
      const p = lastModel && lastModel.player;
      return !!(it && p && (it.weaponType === 'dagger' || it.weaponType === 'daggers') && p.cls === 'inkblade');
    },
    unequip(slot) {
      if (lastModel && lastModel.live) { if (lastModel.equip[slot]) send({ t: 'unequip', slot }); return; }
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
      if (key === 'zoom') { options.zoomSet = true; saveOptions(storage, options); if (hooks.setZoom) hooks.setZoom(v); }
      if (hooks.optionsChanged) hooks.optionsChanged(options);
      if (key === 'r3d' && hooks.setGraphics) hooks.setGraphics(v);
    },
    logout() {
      saveProgress();
      if (hooks.logout) hooks.logout(playerId);
      playerId = null; st.charId = null; st.dialog = null; st.hint = null; st.open.clear(); lastModel = null;
      act.go(store.list().length ? 'select' : 'title');
    },
  };

  /** Save the hero: the select-screen summary plus the full character (hooks.saveState: CONTRACTS 2.4 addPlayer restore). */
  function saveProgress() {
    if (st.charId == null || playerId == null) return;
    const full = hooks.saveState ? hooks.saveState(playerId) : null;
    const e = full || (lastSnap && lastSnap.entities.find((o) => o.id === playerId));
    if (!e) return;
    store.update(st.charId, { level: e.level, xp: e.xp || 0, zone: e.zone, zoneName: zoneNames[e.zone] || e.zone, x: e.tx ?? Math.floor(e.x / 16), y: e.ty ?? Math.floor(e.y / 16),
      ...(full ? { state: full } : {}) });
  }

  // ---------------------------------------------------------------- drawing
  function layoutNow() {
    const l = hooks.getLayout ? hooks.getLayout() : null;
    return hudLayout({ touch: st.metrics.touch, minHit: st.metrics.touch ? hitPx(st.metrics.cssPerHud) : 15, W: (l && l.hudW) || W, H: (l && l.hudH) || H });
  }
  /** Phone: menu windows and the title screens are 640x360 designs; they open on the larger layer ('win'), play and
   *  the npc window use the big legible one ('big'). Desktop is always 640x360. */
  function hudMode() {
    if (!st.metrics.touch) return 'big';
    if (st.mode !== 'game') return 'win';
    for (const id of st.open) if (CENTER.includes(id) || SIDE.includes(id)) return 'win';
    return 'big';
  }
  /** Draw a 640x360 window design centred on a larger layer; its regions are shifted to layer px. */
  function centred(ctx, L, regions, fn) {
    const ox = Math.max(0, Math.floor((L.W - W) / 2)), oy = Math.max(0, Math.floor((L.H - H) / 2));
    if (!ox && !oy) { fn(); return; }
    const n0 = regions.length;
    ctx.save(); ctx.translate(ox, oy);
    try { fn(); } finally { ctx.restore(); }
    for (let i = n0; i < regions.length; i++) { const r = regions[i]; regions[i] = { ...r, rect: { ...r.rect, x: r.rect.x + ox, y: r.rect.y + oy } }; }
  }

  function draw(ctx, vm, snap, t) {
    st.now = t;
    lastSnap = snap;
    const L = layoutNow();
    const env = { g, charArt, mapBook, art, L, hover: st.hover, scratch, zoneList };
    const regions = [];
    ctx.imageSmoothingEnabled = false;
    if (st.mode !== 'game' && (L.W > W || L.H > H)) { ctx.fillStyle = '#0b0a12'; ctx.fillRect(0, 0, L.W, L.H); }
    if (st.mode === 'title') centred(ctx, L, regions, () => drawTitle(ctx, env, st, regions, act, t));
    else if (st.mode === 'select') centred(ctx, L, regions, () => drawSelect(ctx, env, st, regions, act, t));
    else if (st.mode === 'create') centred(ctx, L, regions, () => drawCreate(ctx, env, st, regions, act, t));
    else {
      let m = buildHudModel(vm, snap, { state: { ...local, untracked: st.untracked, navQuest: st.navQuest }, tickHz: 20, zoneNames, zones });
      if (demoExtra) m = applyDemo(m);
      lastModel = m;
      st.openMenu = [...st.open].pop() || null;
      if (m.player && !m.player.dead) drawGoalPointer(ctx, m, L, t);
      if (m.player && hooks.worldMarks) drawWorldMarks(ctx, hooks.worldMarks(), t, regions, L);
      const fade = m.player && hooks.unitRects ? hooks.unitRects() : [];
      regions.push(...hud.draw(ctx, m, L, st, { log, fade, keyLabels: Array.from({ length: BAR.n }, (_, i) => keyLabel(effectiveBinds(options.binds)[`slot${i + 1}`])) }));
      if (m.player && st.dialog) {
        // walk away (or change zone, or die) and the npc window closes
        const me = snap.entities.find((e) => e.id === playerId), n = snap.entities.find((e) => e.id === st.dialog.ent);
        if (!me || !n || me.zone !== n.zone || me.dead || Math.hypot(me.x - n.x, me.y - n.y) > 64) act.closeDialog();
      }
      if (m.player) {
        if (st.levelUp) drawLevelUp(ctx, L, t);
        if (st.dialog) drawDialog(ctx, env, m, st, regions, act);
        centred(ctx, L, regions, () => {
          for (const id of SIDE) if (st.open.has(id)) (id === 'character' ? drawCharacter : drawBags)(ctx, env, m, st, regions, act);
          if (st.open.has('quests')) drawQuestLog(ctx, env, m, st, regions, act);
          if (st.open.has('map')) drawMap(ctx, env, m, st, regions, act);
          if (st.open.has('talents') && !isBuilds2(m)) drawTalents(ctx, env, m, st, regions, act);
          if (st.open.has('menu')) drawOptions(ctx, env, m, st, regions, act, options);
          if (st.open.has('help')) drawHelp(ctx, env, st, regions, act, options.binds);
        });
        // Builds 2 (talents2.js): the whole layer on a phone (six columns), the 640x360 window on desktop
        if (st.open.has('talents') && isBuilds2(m)) drawTalents2(ctx, env, m, st, regions, act);
        hud.menuBar(ctx, L, st, regions);
        if (isBuilds2(m)) builds2Prompts(ctx, L, m);
        if (st.hint) drawHint(ctx, L, regions);
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
      if (tip && !(r.kind === 'talent')) drawTooltip(g, ctx, tip, tipAt.x + 12, tipAt.y - 8, { W: L.W, H: L.H });
    }
    if (st.hint && t - st.hint.t0 > 30) st.hint = null;
    if (st.levelUp && t - st.levelUp.t0 > 6) st.levelUp = null;
    if (st.banner && st.banner.until > t && st.mode === 'game') {
      const bw = Math.min(L.W - 8, Math.max(g.textW(st.banner.title), g.textW(st.banner.sub || '')) + 28), bh = st.banner.sub ? 32 : 20;
      const bx = Math.floor((L.W - bw) / 2), by = L.touch ? Math.floor(L.H * 0.3) : 70;
      g.window(ctx, bx, by, bw, bh, 'thin', 'ember', 0.97);
      g.text(ctx, g.clip(st.banner.title, bw - 12), L.W / 2, by + 3, 'gold', { align: 'center' });
      if (st.banner.sub) g.text(ctx, st.banner.sub, L.W / 2, by + 16, 'cream', { align: 'center' });
    }
    if (st.toast && st.toast.until > t) {
      // above everything, clear of the npc window (CRITIQUE_1 item 20)
      const w = g.textW(st.toast.text) + 16;
      let cx = Math.floor(L.W / 2), ty = L.touch ? L.minHit + 8 : 44;
      if (st.dialog) { const dr = dialogRect(L); cx = Math.floor((dr.x + dr.w + L.W) / 2); ty = L.touch ? Math.floor(L.H / 2) - 30 : 92; }
      const tx = Math.max(2, Math.min(L.W - w - 2, cx - Math.floor(w / 2)));
      g.window(ctx, tx, ty, w, 18, 'thin', 'slate', 0.95);
      g.text(ctx, st.toast.text, tx + Math.floor(w / 2), ty + 3, 'cream', { align: 'center' });
    }
  }

  /** The npc window's rect on this layer (dialog.js draws it; the toast and the quest marks keep clear of it). */
  function dialogRect(L) {
    return dialogRectFor(L);
  }

  /** Builds 2 prompts: a gold count on the phone's talents button while points or a skill pick wait, and once per visit
   *  the free-respec line for a hero whose old talents were retired. */
  function builds2Prompts(ctx, L, m) {
    const B = m.builds2;
    const free = (B.points && B.points.free) || 0, picks = (B.picks || []).length;
    if (st.b2Told !== st.charId && B.freeRespec && B.freeRespecWhy === 'builds2') {
      st.b2Told = st.charId;
      say('system', `New talents: your points came back and one respec is free. Open Talents (${L.touch ? 'star button' : 'N'}).`);
    }
    if (!L.touch || !L.menuBar || st.open.has('talents')) return;
    const b = L.menuBar.find((x) => x.id === 'talents');
    if (!b || !(free > 0 || picks > 0)) return;
    const label = free > 0 ? String(free) : '!';
    const w = Math.max(11, g.textW(label) + 6), x = b.x + b.w - w - 1, y = b.y + 1;
    g.rect(ctx, x, y, w, 11, '#14101e');
    g.rect(ctx, x + 1, y + 1, w - 2, 9, '#b8862b');
    g.text(ctx, label, x + Math.floor(w / 2), y + 1, 'cream', { align: 'center' });
  }

  /** The level-up flourish (CRITIQUE_1 item 16): a gold flash across the screen, a banner, and what you unlocked. */
  function drawLevelUp(ctx, L, t) {
    const lu = st.levelUp;
    const age = t - lu.t0;
    if (age < 0.5) { ctx.fillStyle = `rgba(255,214,90,${(0.35 * (1 - age / 0.5)).toFixed(3)})`; ctx.fillRect(0, 0, L.W, L.H); }
    const out = age > 5.4 ? Math.max(0, 1 - (age - 5.4) / 0.6) : 1;
    if (out <= 0) return;
    ctx.globalAlpha = Math.round(out * 10) / 10;
    const lines = lu.lines.slice(0, 3);
    const h = 30 + lines.length * 11 + 4;
    const y = L.touch ? Math.floor(L.H * 0.32) : 96;
    const grow = Math.min(1, age / 0.25);
    const bw = Math.round(L.W * grow);
    const x = Math.floor((L.W - bw) / 2);
    ctx.fillStyle = 'rgba(20,16,30,0.82)'; ctx.fillRect(x, y, bw, h);
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(x, y, bw, 1); ctx.fillRect(x, y + h - 1, bw, 1);
    ctx.fillStyle = '#8a6a1a'; ctx.fillRect(x, y + 1, bw, 1); ctx.fillRect(x, y + h - 2, bw, 1);
    if (grow >= 1) {
      g.text(ctx, `Level ${lu.level}`, Math.floor(L.W / 2), y + 5, 'gold', { large: true, align: 'center' });
      lines.forEach((ln, i) => g.text(ctx, g.clip(ln, L.W - 20), Math.floor(L.W / 2), y + 24 + i * 11, i === 0 ? 'cream' : 'white', { align: 'center' }));
    }
    ctx.globalAlpha = 1;
  }

  /** Quest marks on npc heads (CRITIQUE_1 item 1): gold ! (a quest to take), gold ? (ready to hand in), grey ! (too
   *  low for you) and grey ? (in progress). marks: [{ x, y (the head, HUD px), mark, id }]. Clicking or tapping a mark
   *  talks to the npc under it (walking there first when it is out of reach). */
  function drawWorldMarks(ctx, marks, t, regions, L) {
    const bob = Math.floor(t * 2) % 2;
    for (const mk of marks || []) {
      if (mk.mark === '!soon') continue;
      const grey = mk.mark === '!grey' || mk.mark === '?grey';
      const box = drawQuestMark(ctx, mk.mark[0] === '?' ? '?' : '!', mk.x, mk.y - 3 - bob, grey);
      if (mk.id != null) {
        const s = Math.max(14, Math.round((L.minHit || 15) * 0.8));
        regions.push({ rect: { x: Math.round(mk.x - s / 2), y: Math.round(box.y + box.h / 2 - s / 2), w: s, h: s }, kind: 'mark', id: mk.id });
      }
    }
  }

  /** The gold arrow in the world (questnav.js arrowMode): at the hero's feet, pointing at the selected quest's goal in
   *  this zone (or the exit toward its zone) while that is off screen or far; a small bobbing pin over it when it is
   *  near and on screen; nothing inside the circle. A HUD overlay, so the 2D and 3D renderers both get it: the direction
   *  is the screen direction of a short step toward the goal from the hero's feet (worldToHud), right under a tilted
   *  3D camera too. */
  function drawGoalPointer(ctx, m, L, t) {
    const goal = m.minimap && m.minimap.goal;
    if (!goal || goal.zone !== m.minimap.zone || !hooks.toHud) return;
    const a = (hooks.heroAnchor && hooks.heroAnchor()) || { x: m.minimap.x, y: m.minimap.y };
    const gx = goal.x * 16, gy = goal.y * 16;
    const dist = Math.hypot(gx - a.x, gy - a.y) / 16;
    const [px, py] = hooks.toHud(gx, gy);
    // "on screen" means well inside it: a goal at the edge sits under the chat, the bars or the tracker
    const padX = Math.round(L.W * 0.18), padY = Math.round(L.H * 0.2);
    const onScreen = px >= padX && py >= padY && px <= L.W - padX && py <= L.H - padY;
    const mode = arrowMode(dist, goal.r, onScreen);
    st.goalArrow = { mode, dist: Math.round(dist * 10) / 10 };
    if (mode === 'none') return;
    const s = L.touch ? 1.4 : 1.35;
    const pulse = 0.8 + 0.2 * Math.sin(t * 4);
    ctx.save();
    ctx.globalAlpha = pulse;
    if (mode === 'pin') {
      const bob = Math.round(Math.sin(t * 3) * 2);
      drawGoalArrow(ctx, px, py - 10 * s + bob, Math.PI / 2, s);
      st.goalArrow.at = [px, py];
    } else {
      const [hx, hy] = hooks.toHud(a.x, a.y);
      const k = 32 / Math.max(1e-6, dist * 16);
      const [sx, sy] = hooks.toHud(a.x + (gx - a.x) * k, a.y + (gy - a.y) * k);
      const ang = Math.atan2(sy - hy, sx - hx);
      const R = 18 * s;
      const ax = Math.round(hx + Math.cos(ang) * R), ay = Math.round(hy - 4 + Math.sin(ang) * R * 0.7);
      drawGoalArrow(ctx, ax, ay, ang, s);
      st.goalArrow.at = [ax, ay];
      st.goalArrow.ang = Math.round(ang * 100) / 100;
    }
    ctx.restore();
  }

  /** The one-time controls card for a new hero (desktop and phone versions). */
  function drawHint(ctx, L, regions) {
    const lines = L.touch
      ? ['Left thumb: drag to walk, or tap the ground.', 'Tap a foe to target it. Tap a person or a ! to talk.', 'Right thumb: skills, sword (attack), Talk, Next.', 'Top buttons: character, bags, quests, talents, map.', 'The ? button lists every control.']
      : ['WASD to walk. Tab or click to target a foe.', '1 to 8 to use skills. Right-click a foe to attack.', 'F or right-click to talk. X to sit and rest.', 'C B L N M: character, bags, quests, talents, map.', 'H lists every control.'];
    const bh = Math.max(14, L.minHit || 0);
    const w = 250, h = 22 + lines.length * 11 + 6 + bh + 6;      // the button has its own row (CRITIQUE_1 item 20)
    const x = Math.floor((L.W - w) / 2), y = L.touch ? Math.max(L.minHit + 6, Math.floor((L.H - h) / 2) - 10) : 96;
    g.window(ctx, x, y, w, h, 'std', 'blue', 0.96);
    g.text(ctx, 'How to play', x + 9, y + 5, 'gold', { large: true });
    lines.forEach((l, i) => g.text(ctx, l, x + 9, y + 22 + i * 11, 'cream'));
    const bw = 60, bx = x + w - bw - 8, by = y + h - bh - 6;
    g.window(ctx, bx, by, bw, bh, 'thin', 'forest', 0.95);
    g.text(ctx, 'Got it', bx + bw / 2, by + Math.floor(bh / 2) - 6, 'cream', { align: 'center' });
    regions.push({ rect: { x, y, w, h }, kind: 'window', id: 'hint', on: () => act.dismissHint() });
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
    // the demo's placeholder bags, gear, gold and quests replace the live ones (screenshots of full windows); live: false
    // sends the menu actions down the local path
    const quests = local.quests || [];
    return { ...m, live: false, player: p, bar, castBar, talents: local.talents, party: d.party.length ? d.party : m.party, talentPoints: { total, spent, free: Math.max(0, total - spent) },
      bag: local.bag, equip: local.equip, gold: local.gold, quests, tracked: quests.filter((q) => q.tracked !== false).slice(0, 5) };
  }

  function topRegion(x, y) {
    for (let i = st.regions.length - 1; i >= 0; i--) if (st.regions[i].kind !== 'scroll' && inRect(st.regions[i].rect, x, y)) return st.regions[i];   // scroll areas take the wheel only
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
      else if (st.mode === 'title' && !r && !st.fsHelp) { if (store.list().length) act.go('select'); else act.go('create'); }
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
      case 'mark': hooks.input && hooks.input.inject({ k: 'talk', id: r.id }); return true;
      case 'next_target': hooks.input && hooks.input.inject({ k: 'tab', back: false }); st.pressed = 'next_target'; return true;
      case 'attack': hooks.input && hooks.input.inject({ k: 'attack' }); st.pressed = 'attack'; return true;
      case 'menu_button': act.toggle(r.id); return true;
      case 'minimap': act.toggle('map'); return true;
      case 'tracker_head': st.trackerCollapsed = !st.trackerCollapsed; return true;
      // a tracker row selects its quest and opens the map on it (the question it answers is "where do I go?"; the quest
      // log is one key or button away); the same row again closes the map
      case 'tracker_quest':
        if (st.open.has('map') && st.navQuest === r.id) { act.close('map'); return true; }
        act.showOnMap(r.id); return true;
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
    else { const sr = [...st.regions].reverse().find((o) => o.scroll && inRect(o.rect, p.x, p.y)); if (sr) { sr.scroll(ev.deltaY < 0 ? -1 : 1); ev.preventDefault(); } }
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
      if (st.hint) act.dismissHint();
      else if (st.dialog) act.closeDialog();
      else if (open.length) act.close(open[open.length - 1]);
      else if (lastModel && lastModel.target) hooks.input && hooks.input.inject({ k: 'clear' });
      else act.toggle('menu');
      return;
    }
    if (route.action === 'interact') { hooks.input && hooks.input.inject({ k: 'interact' }); return; }
    if (route.action === 'sit') {
      // the sim ignores sit in combat: say so instead of failing silently (CRITIQUE_1 item 18)
      if (lastModel && lastModel.player && lastModel.player.inCombat) quietSay("You can't rest in combat.");
      else send({ t: 'sit' });
      return;
    }
    act.toggle(route.action);
  };
  window.addEventListener('keydown', onKey(true), true);
  window.addEventListener('keyup', onKey(false), true);

  // ---------------------------------------------------------------- sim events that drive windows and prompts
  const FAIL_TEXT = { gold: 'Not enough gold.', bag_full: 'Your bags are full.', range: 'Too far away.', level: 'You are not high enough level.',
    class: 'Your class cannot use that.', weapon: 'You cannot use that weapon.', armor: 'You cannot wear that armor.', combat: 'Not while in combat.',
    no_value: 'The vendor will not buy that.', bags_full: 'You can wear 4 bags.', cooldown: 'Not ready yet.', full: 'You are already at full health.',
    known: 'You already know that.', points: 'No talent points left.', tier: 'That tier is not open yet.', dependency: 'A deeper talent needs that one.', empty: 'Nothing to reset.' };
  function onOwnEvent(ev) {
    const me = playerId;
    switch (ev.type) {
      case 'interact':
        if (ev.src !== me) return;
        if (st.dialog && st.dialog.ent === ev.id) Object.assign(st.dialog, { trainer: ev.trainer || null, vendor: ev.vendor || null, line: st.dialog.line + 1 });
        else { st.dialog = dialogFromInteract(ev); st.dialog.line = Math.floor(st.now * 7); if (st.metrics.touch) st.open.clear(); }
        return;
      case 'quest_dialog':
        if (ev.id !== me || !st.dialog || st.dialog.ent !== ev.ent) return;
        Object.assign(st.dialog, { offers: ev.offers || [], turnins: ev.turnins || [], progress: ev.progress || [], soon: ev.soon || [], rewards: ev.rewards || st.dialog.rewards || null });
        // one thing to say and nothing else: open it directly (the first quest, a single turn-in)
        if (st.dialog.page === 'main' && !st.dialog.trainer && !st.dialog.vendor && st.dialog.turnins.length + st.dialog.offers.length === 1) {
          st.dialog.page = 'quest'; st.dialog.quest = st.dialog.turnins[0] || st.dialog.offers[0]; st.dialog.choice = 0;
        }
        return;
      case 'train':
        if (ev.id !== me) return;
        st.trained.add(ev.ability);
        if (st.trainerMark && st.trainerMark.abilities.every((a) => st.trained.has(a))) st.trainerMark = null;
        toast(`You learn ${(abilityInfo(ev.ability) || { name: ev.ability }).name}.`);
        say('system', `You learn ${(abilityInfo(ev.ability) || { name: ev.ability }).name}. It is on your bar.`);
        return;
      case 'train_fail': case 'inventory_fail': case 'talent_fail':
        if (ev.id !== me) return;
        if (FAIL_TEXT[ev.reason]) { toast(FAIL_TEXT[ev.reason]); say('error', FAIL_TEXT[ev.reason]); }
        return;
      case 'inventory':
        if (ev.id !== me) return;
        if (ev.kind === 'buy') say('loot', `You buy ${(itemInfo(ev.item) || { name: ev.item }).name}${ev.qty > 1 ? ` x${ev.qty}` : ''} for ${ev.cost} gold.`);
        else if (ev.kind === 'sell') say('loot', `You sell ${(itemInfo(ev.item) || { name: ev.item }).name}${ev.qty > 1 ? ` x${ev.qty}` : ''} for ${ev.gold} gold.`);
        else if (ev.kind === 'buyback') say('loot', `You buy back ${(itemInfo(ev.item) || { name: ev.item }).name}.`);
        else if (ev.kind === 'equip') say('system', `Equipped ${(itemInfo(ev.item) || { name: ev.item }).name}.`);
        return;
      case 'level': {
        if (ev.id !== me) return;
        // the flourish (gold flash, banner) and the log say what is new and where to get it (CRITIQUE_1 item 16)
        const lines = [];
        const names = (ev.trainable || []).map((id) => (abilityInfo(id) || { name: id }).name);
        const where = ev.trainer ? ` (${ev.trainer.name}${ev.trainer.zone ? `, ${zoneNames[ev.trainer.zone] || ev.trainer.zone}` : ''})` : ' (your class trainer in Willowmere)';
        if (names.length) { const l = `New ability at your trainer: ${names.join(', ')}${where}`; lines.push(l); say('system', `${l}.`); }
        if (ev.b2) {
          // Builds 2: a point every level; auto-spend (to level 5) may take it at once (b2_talent kind 'auto' rewrites this line)
          if (ev.b2Free > 0) { const l = `${ev.b2Free} talent point${ev.b2Free > 1 ? 's' : ''} to spend (${st.metrics.touch ? 'star button' : 'N'})`; lines.push(l); say('system', `You have ${l}.`); }
        } else if (ev.talentPoints > 0) { const l = `${ev.talentPoints} talent point${ev.talentPoints > 1 ? 's' : ''} to spend (${st.metrics.touch ? 'star button' : 'N'})`; lines.push(l); say('system', `You have ${l}.`); }
        else if (ev.firstTalentAt) lines.push(`Your first talent point comes at level ${ev.firstTalentAt}`);
        lines.push('Health and power grow stronger');
        st.levelUp = { t0: st.now, level: ev.level, lines };
        // the trainer's mark turns gold until you train (or for two minutes)
        if (names.length && ev.trainer && ev.trainer.npc) st.trainerMark = { npc: ev.trainer.npc, until: st.now + 120, abilities: ev.trainable.slice() };
        return;
      }
      case 'b2_talent': {
        if (ev.id !== me) return;
        const cd = b2Class(lastModel && lastModel.player && lastModel.player.cls);
        const n = cd && cd.nodes[ev.node];
        const name = n ? n.name : ev.node;
        if (ev.kind === 'auto') {
          // BUILDS_2 3.4: "+1 Bulwark: Iron Skin. Change?"
          const t = n && cd.tracks.find((x) => x.id === n.track);
          const key = st.metrics.touch ? 'star button' : 'N';
          const l = `+1 ${t ? `${t.name}: ` : ''}${name} (auto-spent; change it in Talents)`;
          say('system', `Auto-spend: +1 ${t ? `${t.name}: ` : ''}${name}. Change it in Talents (${key}).`);
          if (st.levelUp && st.now - st.levelUp.t0 < 1) {
            const i = st.levelUp.lines.findIndex((x) => x.includes(' to spend ('));
            if (i >= 0) { if (ev.free > 0) st.levelUp.lines[i] = `${ev.free} talent point${ev.free > 1 ? 's' : ''} to spend (${key})`; else st.levelUp.lines.splice(i, 1); }
            if (!st.levelUp.lines.includes(l)) st.levelUp.lines.unshift(l);
          } else toast(`+1 ${name}`);
        } else if (ev.kind === 'undo') toast(`Undone: ${name} (${ev.ranks}/${n ? n.maxRanks : '?'})`);
        return;
      }
      case 'b2_fail': {
        if (ev.id !== me) return;
        const t = b2FailText(ev.reason, st.b2Last);
        if (t) { toast(t); say('error', t); }
        return;
      }
      case 'b2_respec':
        if (ev.id !== me) return;
        toast(ev.cost ? `Talents reset for ${ev.cost} gold. Your points are back.` : 'Talents reset. Your points are back.', 3);
        say('system', ev.cost ? `Your talents are reset (${ev.cost} gold). Your points are back to spend.` : 'Your talents are reset. Your points are back to spend.');
        return;
      case 'b2_pick': {
        if (ev.id !== me) return;
        const nm = (abilityInfo(ev.ability) || { name: null }).name || ev.ability;
        toast(`You learn ${nm}.`);
        say('system', `You learn ${nm}. It is on your bar.`);
        return;
      }
      case 'b2_pick_ready': {
        if (ev.id !== me) return;
        const key = st.metrics.touch ? 'star button' : 'N';
        const nms = (ev.options || []).map((id) => (abilityInfo(id) || { name: id }).name);
        const l = `New skill: choose ${nms.join(' or ')} (Talents)`;
        say('system', `Choose a new skill: ${nms.join(' or ')}. Open Talents (${key}).`);
        if (st.levelUp && st.now - st.levelUp.t0 < 1) { if (!st.levelUp.lines.includes(l)) st.levelUp.lines.splice(1, 0, l); } else toast(`New skill to choose (${key})`, 3);
        return;
      }
      case 'b2_leaning':
        if (ev.id === me) {
          const cd = b2Class(lastModel && lastModel.player && lastModel.player.cls);
          const b = cd && cd.builds.find((x) => x.id === ev.build);
          toast(`Leaning: ${b ? b.name : "your trainer's choice"}`);
        }
        return;
      case 'b2_auto':
        if (ev.id === me) toast(`Auto-spend ${ev.on ? 'on' : 'off'}`);
        return;
      case 'area':
        if (ev.id === me && ev.name) toast(ev.name, 2);
        return;
      case 'quest':
        if (ev.id === me && ev.kind === 'complete') toast(`${(questInfoName(ev.quest))}: complete`, 2.5);
        // turned in: a banner drawn above every window, the npc's included (it used to land behind the dialog)
        if (ev.id === me && ev.kind === 'turnin') {
          const bits = [ev.xp ? `+${ev.xp} XP` : '', ev.gold ? `+${ev.gold} gold` : ''].filter(Boolean);
          st.banner = { title: `Quest complete: ${questInfoName(ev.quest)}`, sub: bits.join('   '), until: st.now + 3.5 };
        }
        return;
      case 'lantern':
        if (ev.id === me) toast(`Lantern bound: ${ev.name || 'this lantern'}`, 3);
        return;
      case 'loot_pending':
        if (ev.id === me) toast(`Bags full: ${ev.total || ''} waiting (Bags, Take)`.replace('  ', ' '), 3);
        return;
      case 'respawn':
        if (ev.id === me) say('system', 'You wake at the lantern.');
        return;
      case 'quest_hook':
        if (ev.id === me) for (const l of ev.lines || []) say('say', l);
        return;
      default:
    }
  }
  const questInfoName = (id) => { const q = id && questInfoById(id); return q ? q.name : id; };
  /** The player's resource kind now (Resolve / Focus / Mana in the log). */
  function resKindNow() {
    const p = lastModel && lastModel.player;
    return (p && p.res && p.res.kind) || (p && (classInfo(p.cls) || {}).resource) || 'mana';
  }
  /** "Not enough Resolve." and friends: one quiet line at most every few seconds, never the same one twice in a row
   *  within 6 s (CRITIQUE_1 items 6 and 19). */
  function quietSay(text) {
    const q = st.quiet;
    if (st.now - q.t < 2.5 || (q.text === text && st.now - q.t < 6)) return;
    st.quiet = { text, t: st.now };
    say('error', text);
  }

  // ---------------------------------------------------------------- the object
  const ui = {
    get mode() { return st.mode; },
    get state() { return st; },
    get options() { return options; },
    notify(text, secs = 4) { toast(text, secs); },
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
      for (const ev of events) {
        for (const l of eventLines(ev, { me: playerId, resourceKind: resKindNow(), ...ctx })) (l.quiet ? quietSay(l.text) : say(l.ch, l.text));
        if (playerId != null) onOwnEvent(ev);
      }
    },
    /** The npc template whose mark is gold after a level-up with new abilities (main.js adds it to the quest marks). */
    get trainerMark() { return st.trainerMark && st.trainerMark.until > st.now ? st.trainerMark.npc : null; },
    /** Phone layer mode for the renderer: 'big' (play) or 'win' (a 640x360 menu window is open). */
    get hudMode() { return hudMode(); },
    setAbilityContent,
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
    setQuests,
    rect: menuRect,
  };
  return ui;
}

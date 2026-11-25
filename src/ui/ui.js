// The UI controller: title -> character select / creation -> game; the HUD; menu windows; mouse, keyboard and
// touch routing in front of src/input/ (UI events are handled first and stopped, everything else reaches input).
//
//   const ui = await createUI({ canvas, font, zones, zoneNames, storage, touch, hooks })
//   hooks: { enterWorld(char) -> playerId, command(cmd), input (createInput object), setZoom(z), logout(), getLayout(),
//            hostGame(char), joinGame(char), namePlates() -> [{ x, y, name, dead }] (online co-op, docs/NET.md) }
//   ui.draw(ctx, vm, snap, timeSec)   once per frame, inside renderer.drawHud (the HUD layer)
//   ui.handleEvents(events)           sim events -> chat / combat log
//   ui.mode                           'title' | 'select' | 'create' | 'game'
//
// The HUD layer has the same pixel density as the world (CONTRACTS section 10, decided 2026-11-19): 640x360, or in 3D the
// whole window at that scale with the HUD at its edges and the 640x360 window designs centred (2026-11-21).
import { loadUiArt } from './uiassets.js';
import { createGfx } from './gfx.js';
import { createCharArt } from './charsprite.js';
import { createMinimapBook } from './minimap.js';
import { createHud, drawTooltip, drawQuestMark, drawGoalArrow } from './hud.js';
import { arrowMode } from './questnav.js';
import { hudLayout, hitPx, inRect, menuRect, designOrigin, W, H, BAR } from './layout.js';
import { buildHudModel } from './uivm.js';
import { drawCharacter, drawBags, drawQuestLog, drawMap, drawOptions, itemCard, itemTooltip } from './menus.js';
import { drawHelp } from './help.js';
import { drawTalents } from './talents.js';
import { drawTalents2, isBuilds2, b2Class, b2FailText } from './talents2.js';
import { drawTitle, drawSelect } from './title.js';
import { createLookUI } from './create_screen.js';   // wave 6: the new creation screen and the mirror (customization kit)
import { createCharStore, loadOptions, saveOptions, validateName } from './save.js';
import { routeKey, rebind, effectiveBinds, keyLabel } from './keymap.js';
import { eventLines } from './eventlog.js';
import { drawDialog, dialogFromInteract, dialogRectFor } from './dialog.js';
import { drawChest, drawPouch } from './chest.js';
import { drawStoryCard } from './worldlife_ui.js';
import { deathPanel, readyCheck, shareOffers, tradeWindow, groupEvent } from './group_ui.js';
import { createProfUI } from './prof_ui.js';
import { createGlyphUI } from './glyph_ui.js';
import { createWordDoorUI } from './worddoor_ui.js';   // word doors (wave 8 glyphdoor)
import { createRiddleUI } from './riddle_ui.js';   // wave 9 riddles
import { setQuests, npcInfo, questInfo as questInfoById, setGameData, setItems, abilityInfo, abilityTooltip, classInfo, classOrder, itemInfo, talentTree, talentState, canUnlearn, talentPointsAt, xpToNext, setAbilityContent, liveStats, resourceWord } from './gamedata.js';
import { demoState, demoLog } from './demo.js';
import { placeAt } from '../data/maps/compose.js';
import { START_REALMS } from '../data/rootbound.js';   // big world: the welcome line of a hero who starts in a realm
import { createUiSounds } from '../audio/ui_sounds.js';   // menu sounds (pure observer; hooks.sound plays them)
import { applySkin, skinFromOptions, textSizeFrom } from './skin.js';   // wave 6 uiskin: Lantern and Vellum, text size
import { createTalkUI } from './talk_ui.js';   // wave 6 quest scenes: the talk panel and flourishes (view.talk)
import { createOnboard } from './onboard.js';   // wave 7 onboarding: by-doing hints for a new hero (Help turns them off)
import { createEmoteUI } from './emote_ui.js';   // wave 7 anim: Space jumps, the G emote ring, the portrait long press
import { createPhotoUI } from './photo_ui.js';   // wave 8 photo: photo mode and postcards (main.js lends it the camera)
import { createChatUI } from './chat_ui.js';   // wave 8 talk: chat window, bubbles, Say sheet, a friend's card (co-op only)
import { markPage } from './page_marks.js';   // wave 9 fixes: the co-op bar steps aside for a phone's open window

const SIDE = ['character', 'bags'];
const CENTER = ['talents', 'quests', 'map', 'menu', 'help', 'prof', 'glyphs'];

export async function createUI({ canvas, font, zones, zoneNames = {}, storage = null, touch = false, hooks = {}, demo = null }) {
  const art = await loadUiArt({ font });
  const g = createGfx(art);
  // window style and text size (wave 6 uiskin, src/ui/skin.js): Settings rows; ?skin= and ?text= in the link override them
  const skinQ = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const charArt = createCharArt(art);
  const mapBook = createMinimapBook(zones);
  const hud = createHud({ g, charArt, mapBook });
  const store = createCharStore(storage);
  let options = loadOptions(storage);
  applySkin(g, art, skinFromOptions(options, skinQ));
  let bossCardDraw = null;     // wave 6: the boss intro card (main.js sets ui.bossCard)
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
  // an HTML panel over the canvas (src/net/netui.js, data-overlay) owns its own keys and clicks
  const overlayEv = (ev) => !!(ev && ev.target && ev.target.closest && ev.target.closest('[data-overlay]'));
  const say = (ch, text, extra = null) => { log.push(extra ? { ch, text, ...extra } : { ch, text }); if (log.length > 200) log.splice(0, log.length - 200); st.chatScroll = 0; };
  const localOnly = () => !!demoExtra || !(lastSnap && playerId != null && (lastSnap.entities.find((e) => e.id === playerId) || {}).talents);
  const send = (cmd) => { if (hooks.command) hooks.command(cmd); };
  const uiSnd = createUiSounds((k) => { if (hooks.sound) hooks.sound(k); });
  const talkUi = createTalkUI({ g, zones, zoneNames, hooks, options: () => options });
  const onb = createOnboard({ g, store, options: () => options, hooks });   // wave 7 onboarding (src/ui/onboard.js)
  const emoteUi = createEmoteUI({ g, st, send, say: (ch, t) => say(ch, t), photo: (p) => photoUi.open(p) });
  const photoHooks = { releaseMove: (codes) => { if (hooks.input) for (const c of codes) hooks.input.release(c); } };
  const photoUi = createPhotoUI({ g, st, send, say: (ch, t) => { say(ch, t); toast(t); }, hooks: photoHooks });   // wave 8 photo
  const chatUi = createChatUI({ g, st, log });   // wave 8 talk (coop.js turns it on and feeds it)

  // ---- the action surface menus and screens call
  const act = {
    store, toast,
    go(mode) {
      st.mode = mode; st.confirm = null; st.err = null;
      if (mode === 'create') { st.name = ''; nameInput.value = ''; st.cls = null; st.look = 0; st.start = null; st.app = null; st.lookTab = null; st.yaw = 0.5; if (!st.metrics.touch) act.focusName(); }
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
      const r = store.add({ name: st.name, cls: st.cls, look: st.look, start: st.start === 'willowmere' ? 'willowmere' : 'realm', app: st.app || null });
      if (!r.ok) { st.err = r.reason; return; }
      nameInput.blur();
      act.enter(r.char.id);
    },
    /** Online co-op (character select): host a game with this hero (it enters the world first), or join a friend's. */
    host(id) {
      const c = store.get(id);
      if (!c) return;
      act.enter(id);
      if (hooks.hostGame) hooks.hostGame(store.get(id));
    },
    join(id) { const c = store.get(id); if (c && hooks.joinGame) hooks.joinGame(c); },
    /** Options: Invite a friend (drop-in, src/net/dropin.js); canInvite false for a hero in a friend's game. */
    invite() { act.close('menu'); if (hooks.invite) hooks.invite(); },
    canInvite: () => !!hooks.invite && !(hooks.canInvite && !hooks.canInvite()),
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
        if (c.start === 'realm' && START_REALMS[c.cls]) say('system', `Welcome to ${START_REALMS[c.cls].name}, ${c.name}. ${START_REALMS[c.cls].welcome || 'Ottilie the Head Archivist has a word for you: look for the gold ! over her head.'}`);
        else say('system', `Welcome to Willowmere, ${c.name}. Hob the innkeeper has a word for you: look for the gold ! over his head.`);
      } else say('system', `Welcome back, ${c.name}.`);
      onb.start(c);   // wave 7: by-doing hints stand in for the controls card while they are on (Help turns them off)
      if (!c.hinted) { if (!onb.live) st.hint = { t0: st.now }; store.update(id, { hinted: true }); }
    },
    close(id) { if (id === 'dialog') { act.closeDialog(); return; } st.open.delete(id); st.confirm = null; st.rebinding = null; st.talentSel = null; },
    send,
    closeDialog() { if (st.dialog && st.dialog.page === 'vendor') st.open.delete('bags'); st.dialog = null; st.confirm = null; },
    // ---- the Lantern Chest (chest.js; src/sim/storage.js): every move is a sim command naming the chest it is at
    closeChest() { if (st.chest) st.open.delete('bags'); st.chest = null; st.confirm = null; st.itemPick = null; },
    /** Store bag slot i in a tab ('hero' | 'shared'). */
    chestStore(i, tab = 'hero') {
      const it = lastModel && lastModel.bag.items[i];
      if (!st.chest || !it) return;
      if (it.kind === 'quest') { toast('Quest items stay in the quest bag.'); return; }
      send({ t: 'chest_store', chest: st.chest.ent, tab, bag: i, item: it.item, ...(it.uid != null ? { uid: it.uid } : {}) });
    },
    chestTake(tab, index, item) { if (st.chest) send({ t: 'chest_take', chest: st.chest.ent, tab, index, item }); },
    chestMove(tab, index, item) { if (st.chest) send({ t: 'chest_move', chest: st.chest.ent, tab, index, item }); },
    /** A glyph stack: kind 'store' (pouch -> tab), 'take' (tab -> pouch) or 'move' (to the other tab); one = a single stone. */
    chestGlyph(kind, tab, glyph, one = false) { if (st.chest) send({ t: `chest_${kind}`, chest: st.chest.ent, tab, glyph, ...(one ? { qty: 1 } : {}) }); },
    chestRow(tab) { if (st.chest) send({ t: 'chest_row', chest: st.chest.ent, tab }); },
    chestSort(tab) { if (st.chest) send({ t: 'chest_sort', chest: st.chest.ent, tab }); },
    /** Ask the npc again (fresh quest lists after accept / turn-in), staying on the main page. */
    refreshDialog() { if (st.dialog) { const ent = st.dialog.ent; st.dialog.page = 'main'; st.dialog.quest = null; send({ t: 'interact', id: ent }); } },
    /** Mounts: Z or the horseshoe. On a mount: get off. Else summon (the sim says no in a fight or indoors). */
    mount() {
      const p = lastModel && lastModel.player;
      if (p && !p.mount && p.inCombat) { quietSay("You can't summon a mount in combat."); return; }
      send({ t: 'mount' });
    },
    openVendor() { if (!st.dialog) return; st.dialog.page = 'vendor'; st.dialog.scroll = 0; st.open.add('bags'); },
    sellJunk() {
      if (!st.dialog || !lastModel) return;
      // highest index first so the earlier indexes stay valid while the sim applies them in order
      lastModel.bag.items.map((it, i) => [it, i]).filter(([it]) => it && it.kind === 'junk').reverse()
        .forEach(([it, i]) => send({ t: 'sell', npc: st.dialog.ent, bag: i, item: it.item, ...(it.uid != null ? { uid: it.uid } : {}) }));
    },
    dismissHint() { st.hint = null; },
    /** The skill bar: `bar_set { slot, entry }` (entry `item:<id>`, an ability id, or null: clears an item, takes a skill
     *  off the bar). */
    barSet(slot, entry) { send({ t: 'bar_set', slot, entry: entry ?? null }); },
    /** Move what is on slot `from` to slot `to` (`bar_set { slot: to, from }`); an occupied slot swaps. */
    barMove(from, to) { send({ t: 'bar_set', slot: to, from }); },
    /** Take a skill or item off the bar; a skill goes to the Character window's spare skills. */
    barTakeOff(slot) {
      const s = lastModel && (lastModel.bar || [])[slot - 1];
      act.barSet(slot, null);
      if (s && s.ability) toast(`${s.name || 'The skill'} is off the bar. Find it in Character, Spare skills.`, 3);
    },
    /** Phone: Put on bar for a spare skill, or Move for a bar slot (from): the bar slots light up until one is tapped. */
    barPickEntry({ entry, name, from = null }) {
      st.barPick = { entry, name, from };
      st.itemPick = null; st.slotCard = null;
      if (st.metrics.touch) st.open.clear();
    },
    /** Phone (the bag card): "Put on bar" asks which slot next; the bar slots light up until one is tapped. */
    barPickStart(itemId) {
      st.barPick = { entry: `item:${itemId}`, name: (itemInfo(itemId) || { name: itemId }).name };
      st.itemPick = null; st.slotCard = null;
      if (st.metrics.touch) st.open.clear();          // the phone's bar is under the windows: show it
    },
    barPickCancel() { st.barPick = null; },
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
        if (st.chest && lastModel.storage) { act.chestStore(i, st.mods && st.mods.shift ? 'shared' : st.chest.tab || 'hero'); return; }
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
      if (key === 'skin') applySkin(g, art, skinFromOptions(options, skinQ));
    },
    logout() {
      saveProgress();
      if (hooks.logout) hooks.logout(playerId);
      playerId = null; st.charId = null; st.dialog = null; st.hint = null; st.mirror = null; st.open.clear(); lastModel = null; onb.stop();
      act.go(store.list().length ? 'select' : 'title');
    },
  };

  // professions (src/ui/prof_ui.js): the window (K), the trainer page, the gather / craft bar, node card and tracking
  const prof = createProfUI({ st, act, send, toast, say, storage, hero: () => (lastSnap && playerId != null ? { snap: lastSnap, id: playerId } : null) });
  // Inscriptions (src/ui/glyph_ui.js): the Margins window (J), its minimap button, a smith's "take a glyph out"
  const glyphs = createGlyphUI({ st, act, send, toast, say, hero: () => (lastSnap && playerId != null ? { snap: lastSnap, id: playerId } : null) });
  act.profOptions = (d) => [...prof.dialogOptions(d), ...glyphs.dialogOptions(d)];
  const wdoor = createWordDoorUI({ st, send, toast, say, hero: () => (lastSnap && playerId != null ? { snap: lastSnap, id: playerId } : null) });
  const riddleUI = createRiddleUI({ st, send, toast, say, storage, hero: () => (lastSnap && playerId != null ? { snap: lastSnap, id: playerId } : null),   // wave 9 riddles
    placeName: (z, tx, ty) => { const p = zones[z] ? placeAt(zones[z], tx, ty) : null; return (p && p.name) || zoneNames[z] || z; } });   // wave 9 riddles
  act.profOpen = (o) => prof.open(o);
  // the creation screen and the free mirror (src/ui/create_screen.js); the turntable request goes to main.js view.stage
  const looks = createLookUI({ st, act, send, toast, say, has3d: () => !!(hooks.has3d && hooks.has3d()), startGear: (cls) => (hooks.startGear ? hooks.startGear(cls) : {}),
    hero: () => (lastSnap && playerId != null ? lastSnap.entities.find((e) => e.id === playerId) || null : null), snap: () => lastSnap });

  /** Save the hero: the select-screen summary plus the full character (hooks.saveState: CONTRACTS 2.4 addPlayer restore). */
  function saveProgress() {
    if (st.charId == null || playerId == null) return;
    const full = hooks.saveState ? hooks.saveState(playerId) : null;
    const e = full || (lastSnap && lastSnap.entities.find((o) => o.id === playerId));
    if (!e) return;
    saveHero(st.charId, e, !!full);
  }
  /** Store a hero's save (or its snapshot entity, full = false) under a stored character: the select-screen summary and
   *  the full restore. Online co-op calls it with the save a friend's game sent back (src/net/coop.js). */
  function saveHero(charId, e, full = true) {
    if (charId == null || !e || !store.get(charId)) return;
    const tx = e.tx ?? Math.floor(e.x / 16), ty = e.ty ?? Math.floor(e.y / 16);
    const where = zones[e.zone] ? placeAt(zones[e.zone], tx, ty) : null;   // the select screen names the area, not the world
    store.update(charId, { level: e.level, xp: e.xp || 0, zone: e.zone, zoneName: (where && where.name) || zoneNames[e.zone] || e.zone, x: tx, y: ty,
      ...(full ? { state: e } : {}) });
  }

  // ---------------------------------------------------------------- drawing
  function layoutNow() {
    const l = hooks.getLayout ? hooks.getLayout() : null;
    return hudLayout({ touch: st.metrics.touch, minHit: st.metrics.touch ? hitPx(st.metrics.cssPerHud) : 15, W: (l && l.hudW) || W, H: (l && l.hudH) || H });
  }
  /** Phone: menu windows and the title screens are 640x360 designs; they open on the larger layer ('win'), play and
   *  the npc window use the big legible one ('big'). Desktop has one layer: 640x360, or in 3D the whole window at the
   *  same scale (camera.js `fill`), with the windows centred on it. */
  function hudMode() {
    if (!st.metrics.touch) return 'big';
    if (st.mode !== 'game') return 'win';
    if (st.chest) return 'win';
    if (st.mirror) return 'win';                 // the mirror screen is a creation-screen layout
    if (lastModel && lastModel.group && lastModel.group.trade) return 'win';     // the trade window is a 640x360 design
    for (const id of st.open) if (CENTER.includes(id) || SIDE.includes(id)) return 'win';
    return 'big';
  }
  /** Draw a 640x360 window design centred on a larger layer; its regions are shifted to layer px (a slider's drag gets
   *  design px back). On desktop the design also sees a 640x360 layer and the pointer in design px, so a window on the
   *  wide 3D layer looks and clamps its tooltips exactly as on a 640x360 one. */
  function centred(ctx, L, regions, fn, env) {
    const { x: ox, y: oy } = designOrigin(L.W, L.H);
    if (!ox && !oy) { fn(); return; }
    const n0 = regions.length;
    const swap = env && !L.touch ? { L: env.L, hover: env.hover } : null;
    if (swap) { env.L = { ...L, W, H }; env.hover = env.hover ? { ...env.hover, x: env.hover.x - ox, y: env.hover.y - oy } : null; }
    ctx.save(); ctx.translate(ox, oy);
    try { fn(); } finally { ctx.restore(); if (swap) { env.L = swap.L; env.hover = swap.hover; } }
    for (let i = n0; i < regions.length; i++) {
      const r = regions[i];
      regions[i] = { ...r, rect: { ...r.rect, x: r.rect.x + ox, y: r.rect.y + oy }, ...(r.drag ? { drag: (hx) => r.drag(hx - ox) } : {}) };
    }
  }
  /** Where the 640x360 design sits on this layer (0, 0 on a 640x360 one): desktop prompts keep their design spots. */
  const dOrg = (L) => (L.touch ? { x: 0, y: 0 } : designOrigin(L.W, L.H));

  /** Text size scope for cards and prompts: everywhere but a phone's play layer, which is already the big legible scale. */
  const sizeScope = (fn) => (st.metrics.touch && hudMode() === 'big' ? fn() : g.textScope(fn));
  function draw(ctx, vm, snap, t) {
    st.now = t;
    uiSnd.frame(st);
    looks.frame();
    lastSnap = snap;
    const L = layoutNow();
    st.layer = { W: L.W, H: L.H };
    g.setTextSize(textSizeFrom(options, st.metrics.touch, skinQ));   // Large by default on a phone, Normal on PC
    // big world: the hero's known flight points (the world map lights them, menus.js drawMap)
    const meS = snap && playerId != null ? snap.entities.find((e) => e.id === playerId) : null;
    const env = { g, charArt, mapBook, art, L, hover: st.hover, scratch, zoneList, zoneKind: (id) => (zones[id] || {}).kind, flights: (meS && meS.flights) || [] };
    const regions = [];
    ctx.imageSmoothingEnabled = false;
    markPage('lr-window', st.mode === 'game' && !!L.touch && (st.open.size > 0 || !!chatUi.sheetOpen || !!chatUi.cardOpen || !!chatUi.state.full));   // wave 9 fixes: the bar hid talents nodes and Say phrases
    if (st.mode !== 'game' && st.mode !== 'watch' && (L.W > W || L.H > H)) { ctx.fillStyle = '#0b0a12'; ctx.fillRect(0, 0, L.W, L.H); }
    if (st.mode === 'title') centred(ctx, L, regions, () => drawTitle(ctx, env, st, regions, act, t), env);
    else if (st.mode === 'select') centred(ctx, L, regions, () => drawSelect(ctx, env, st, regions, act, t), env);
    else if (st.mode === 'create') looks.drawCreate(ctx, env, regions, t, centred, L);
    else if (st.mode === 'watch') chatUi.drawWatch(ctx, L, regions, hooks.talkHeads ? hooks.talkHeads() : []);   // drop-in watcher: the world and the chat (wave 8 talk)
    else {
      let m = buildHudModel(vm, snap, { state: { ...local, untracked: st.untracked, navQuest: st.navQuest }, tickHz: 20, zoneNames, zones });
      if (demoExtra) m = applyDemo(m);
      lastModel = m;
      st.openMenu = [...st.open].pop() || null;
      if (photoUi.on && photoUi.draw(ctx, L, regions, m)) { st.regions = regions; return; }   // wave 8 photo: the HUD steps aside
      talkUi.frame(st, snap, playerId, act);   // quest scenes: a move, a hit or walking off ends the talk
      talkUi.drawUnder(ctx, L, t);
      if (m.player && !m.player.dead) drawGoalPointer(ctx, m, L, t);
      if (m.player && hooks.namePlates) drawNamePlates(ctx, hooks.namePlates());
      if (m.player) chatUi.drawUnder(ctx, L, hooks.talkHeads ? hooks.talkHeads() : []);   // wave 8 talk: speech bubbles, under the HUD
      if (m.player && hooks.worldMarks) drawWorldMarks(ctx, hooks.worldMarks().filter((k) => k.id !== talkUi.hiddenMark(st)), t, regions, L);
      const fade = m.player && hooks.unitRects ? hooks.unitRects() : [];
      regions.push(...hud.draw(ctx, m, L, st, { log: chatUi.active ? [] : log, fade, act, keyLabels: Array.from({ length: BAR.n }, (_, i) => keyLabel(effectiveBinds(options.binds)[`slot${i + 1}`])) }));
      st.bossUp = !!(m.player && bossCardDraw && bossCardDraw(ctx, g, L, t));   // wave 6: the boss intro card (boss_card.js, set by main.js); toasts wait under it
      if (m.player) prof.drawHud(ctx, env, m, L, regions);     // professions: the gather / craft bar, the node card, tracking
      if (m.player) glyphs.drawHud(ctx, env, m, L, regions);   // Inscriptions: the Margins button
      if (m.player) chatUi.draw(ctx, L, regions, m);           // wave 8 talk: the chat window (in co-op), Say sheet, card
      if (m.player && st.dialog) {
        // walk away (or change zone, or die) and the npc window closes
        const me = snap.entities.find((e) => e.id === playerId), n = snap.entities.find((e) => e.id === st.dialog.ent);
        if (!me || !n || me.zone !== n.zone || me.dead || Math.hypot(me.x - n.x, me.y - n.y) > 64) act.closeDialog();
      }
      // the Lantern Chest closes when the hero walks off (the sim stops sending its contents), dies or changes zone
      if (st.chest && (!m.player || m.player.dead || (!m.storage && st.now - st.chest.t0 > 0.5))) act.closeChest();
      if (m.player) {
        if (st.levelUp) drawLevelUp(ctx, L, t);
        // the npc window is a 640x360 design on desktop (centred on a wide layer), the phone's own on a phone
        // Text size: the desktop npc window; a phone's npc window is on the big legible play layer already
        if (st.dialog && talkUi.panel(st)) talkUi.drawPanel(ctx, env, m, st, regions, act);   // quest scenes: the talk panel
        else if (st.dialog) { if (L.touch) drawDialog(ctx, env, m, st, regions, act); else centred(ctx, L, regions, () => g.textScope(() => drawDialog(ctx, env, m, st, regions, act)), env); }
        centred(ctx, L, regions, () => g.textScope(() => {
          if (st.chest && m.storage) drawChest(ctx, env, m, st, regions, act);
          for (const id of SIDE) if (st.open.has(id)) (id === 'character' ? (g.skin && g.skin.drawCharacter) || drawCharacter : drawBags)(ctx, env, m, st, regions, act);
          // the glyph pouch strip over the bags (and over the quest strip when there is one)
          // on a phone a pinned chest card covers the strip: hide the strip while the card is up (it overlapped, 2026-11-21)
          if (st.open.has('bags') && !(L.touch && st.chest && st.chest.cardFn && m.storage)) {
            const tops = regions.filter((o) => o.kind === 'window' && (o.id === 'bags' || o.id === 'bags_extra'));
            const b = tops.find((o) => o.id === 'bags');
            if (b) drawPouch(ctx, env, m, st, regions, act, b.rect.x, Math.min(...tops.map((o) => o.rect.y)) - 2, b.rect.w);
          }
          if (st.chest && st.chest.cardFn && m.storage) st.chest.cardFn(regions);
          if (st.open.has('quests')) ((g.skin && g.skin.drawQuestLog) || drawQuestLog)(ctx, env, m, st, regions, act);
          if (st.open.has('quests')) riddleUI.questButton(ctx, env, regions);   // wave 9 riddles: the Riddles button
          if (st.open.has('map')) drawMap(ctx, env, m, st, regions, act);
          if (st.open.has('talents') && !isBuilds2(m)) g.smallScope(() => drawTalents(ctx, env, m, st, regions, act));   // its tree is a fixed small-text grid
          if (st.open.has('menu')) drawOptions(ctx, env, m, st, regions, act, options);
          if (st.open.has('help')) drawHelp(ctx, env, st, regions, act, options.binds, options);   // options: the hints switch (wave 7)
          if (st.open.has('prof')) prof.drawWindow(ctx, env, m, regions);   // professions (prof_ui.js)
          if (st.open.has('glyphs')) glyphs.drawWindow(ctx, env, m, regions);   // Inscriptions (glyph_ui.js)
        }), env);
        // Builds 2 (talents2.js): the whole layer on a phone (six columns), the 640x360 window on desktop (centred)
        if (st.open.has('talents') && isBuilds2(m)) {
          if (L.touch) drawTalents2(ctx, env, m, st, regions, act);
          else centred(ctx, L, regions, () => drawTalents2(ctx, env, m, st, regions, act), env);
        }
        if (st.wdoor) wdoor.draw(ctx, env, m, L, regions);   // word doors: the word panel (worddoor_ui.js)
        if (m.group) sizeScope(() => drawGroup(ctx, env, m, L, regions));       // group play: trade, ready check, a shared quest, death (group_ui.js)
        hud.menuBar(ctx, L, st, regions);
        riddleUI.draw(ctx, env, m, L, regions);   // wave 9 riddles: the book, the maker, a stone, a link card (riddle_ui.js), over the phone's menu buttons
        if (st.barPick) sizeScope(() => drawBarPick(ctx, L, regions));
        if (st.slotCard) sizeScope(() => drawSlotCard(ctx, env, m, L, regions));
        if (isBuilds2(m)) builds2Prompts(ctx, L, m);
        if (st.hint) drawHint(ctx, L, regions);
        // wave 7 onboarding: one by-doing hint, never over a window, the npc window, the boss card or a banner
        onb.frame(st, m, snap, playerId, t, L, !!(st.open.size || st.dialog || st.bossUp || st.levelUp || st.chest || st.mirror || st.barPick || st.emoteRing || st.slotCard || st.hint || st.story || m.player.dead || (m.group && (m.group.trade || m.group.ready))));
        sizeScope(() => onb.draw(ctx, L, regions, t));
        if (st.emoteRing) sizeScope(() => emoteUi.draw(ctx, L, regions, m));   // wave 7 anim: the emote ring
        if (st.mirror) looks.drawMirror(ctx, env, regions, t, centred, L);   // the free mirror covers the HUD
      }
    }
    st.regions = regions;
    // tooltip (hover on desktop, long-press on touch)
    const tipAt = st.metrics.touch ? (st.slotCard ? null : st.longTip) : (st.itemDrag && st.itemDrag.active ? null : st.hover);
    if (tipAt) {
      const r = topRegion(tipAt.x, tipAt.y);
      let tip = r && r.tip ? r.tip : null;
      if (!tip && r && r.kind === 'slot' && r.item && lastModel && st.mode === 'game') tip = barItemTip(r.slot, r.item);
      if (!tip && r && r.tipAbility) tip = abilityTooltip(abilityInfo(r.tipAbility), 1, (classInfo(st.cls) || {}).resource);
      if (!tip && r && lastModel && st.mode === 'game') tip = hud.tooltipFor(r, lastModel);
      if (tip && !(r.kind === 'talent')) sizeScope(() => drawTooltip(g, ctx, tip, tipAt.x + 12, tipAt.y - 8, { W: L.W, H: L.H }));
    }
    if (st.itemDrag && st.itemDrag.active) g.iconIn(ctx, st.itemDrag.icon || 'icon_book', Math.round(st.itemDrag.x) - 11, Math.round(st.itemDrag.y) - 11, 22, 22);
    if (st.hint && t - st.hint.t0 > 30) st.hint = null;
    if (st.levelUp && t - st.levelUp.t0 > 6) st.levelUp = null;
    if (st.story && st.mode === 'game') sizeScope(() => drawStoryCard(ctx, g, L, st, regions));   // the end of a story chain (worldlife_ui.js)
    if (st.banner && st.banner.until > t && st.mode === 'game') {
      const bw = Math.min(L.W - 8, Math.max(g.textW(st.banner.title), g.textW(st.banner.sub || '')) + 28), bh = st.banner.sub ? 32 : 20;
      const bx = Math.floor((L.W - bw) / 2), by = L.touch ? Math.floor(L.H * 0.3) : dOrg(L).y + 70;
      g.window(ctx, bx, by, bw, bh, 'thin', 'ember', 0.97);
      g.text(ctx, g.clip(st.banner.title, bw - 12), L.W / 2, by + 3, 'gold', { align: 'center' });
      if (st.banner.sub) g.text(ctx, st.banner.sub, L.W / 2, by + 16, 'cream', { align: 'center' });
    }
    if (st.mode === 'game') talkUi.drawOver(ctx, env, L, st, regions);   // quest scenes: accept and turn-in flourishes
    if (st.toast && st.toast.until > t && !(st.bossUp && st.mode === 'game')) {
      // above everything, clear of the npc window (CRITIQUE_1 item 20)
      const w = g.textW(st.toast.text) + 16;
      let cx = Math.floor(L.W / 2), ty = L.touch ? L.minHit + 8 : dOrg(L).y + 44;
      if (st.dialog) { const dr = dialogRect(L); cx = Math.floor((dr.x + dr.w + L.W) / 2); ty = L.touch ? Math.floor(L.H / 2) - 30 : dOrg(L).y + 92; }
      const tx = Math.max(2, Math.min(L.W - w - 2, cx - Math.floor(w / 2)));
      g.window(ctx, tx, ty, w, 18, 'thin', 'slate', 0.95);
      g.text(ctx, st.toast.text, tx + Math.floor(w / 2), ty + 3, 'cream', { align: 'center' });
    }
  }

  // group play (src/ui/group_ui.js): names for its words, and its windows over the HUD
  const nameOf = {
    unit: (id) => { const e = lastSnap && lastSnap.entities.find((x) => x.id === id); return e ? e.name : 'Someone'; },
    item: (id) => (itemInfo(id) || { name: id }).name, quest: (id) => questInfoName(id),
  };
  function drawGroup(ctx, env, m, L, regions) {
    const grp = m.group;
    if (grp.trade) centred(ctx, L, regions, () => tradeWindow(g, ctx, { ...env, nameOf }, m, grp, st, regions, act), env);
    if (grp.death) deathPanel(g, ctx, L, grp, regions, act);
    else if (grp.ready) readyCheck(g, ctx, L, grp, regions, act);
    else if (grp.shares && grp.shares.length) shareOffers(g, ctx, L, grp, regions, act);
  }

  /** The item tooltip for an item on the bar: how many are in the bags, its cooldown, and how to take it off. */
  function barItemTip(slotN, itemId) {
    const tip = itemTooltip(itemId, null);
    if (!tip) return null;
    const s = (lastModel.bar || [])[slotN - 1] || {};
    const n = s.count || 0;
    const lines = [n ? `${n} in your bags` : 'None left in your bags'];
    if (s.cdLeft > 0.05) lines.push(`Ready in ${Math.ceil(s.cdLeft)} sec`);
    if (!st.metrics.touch) lines.push('Right-click to take it off the bar');
    tip.foot = lines.join('. ') + '.';
    tip.footColor = n ? 'gray' : 'red';
    return tip;
  }
  /** "Put on bar" (phone bag card) or Move (the slot card): a prompt over the play area with Cancel; the bar slots are
   *  outlined in gold. */
  function drawBarPick(ctx, L, regions) {
    const text = st.barPick.from ? `Tap a slot to move ${st.barPick.name}` : `Tap a bar slot for ${st.barPick.name}`;
    const bh = Math.max(20, L.minHit || 0), bw = Math.max(60, L.minHit || 0);
    const w = Math.min(L.W - 8, g.textW(text) + bw + 30), h = bh + 10;
    const x = Math.floor((L.W - w) / 2), y = L.touch ? Math.floor(L.H * 0.3) : L.H - 100;
    g.window(ctx, x, y, w, h, 'thin', 'ember', 0.97);
    regions.push({ rect: { x, y, w, h }, kind: 'window', id: 'bar_pick' });
    g.text(ctx, g.clip(text, w - bw - 22), x + 8, y + Math.floor(h / 2) - 6, 'cream');
    const bx = x + w - bw - 5, by = y + 5;
    g.window(ctx, bx, by, bw, bh, 'thin', 'slate', 0.97);
    g.text(ctx, 'Cancel', bx + bw / 2, by + Math.floor(bh / 2) - 6, 'cream', { align: 'center' });
    regions.push({ rect: { x: bx, y: by, w: bw, h: bh }, kind: 'button', label: 'bar_pick:cancel', on: () => act.barPickCancel() });
  }
  /** Phone: a long press on a bar slot (an item, or a skill out of a fight) pins its card: Move, Close, Take off bar. */
  function drawSlotCard(ctx, env, m, L, regions) {
    const sc = st.slotCard, s = (m.bar || [])[sc.slot - 1];
    if (!s || (s.item || null) !== (sc.item || null) || (s.ability || null) !== (sc.ability || null)) { st.slotCard = null; return; }
    let tip = sc.item ? barItemTip(sc.slot, sc.item) : hud.tooltipFor({ kind: 'slot', slot: sc.slot, ability: sc.ability }, m);
    if (!tip) { st.slotCard = null; return; }
    if (sc.ability) tip = { ...tip, foot: `Slot ${sc.slot}. Move it, or take it off: it waits in Character, Spare skills.`, footColor: 'gray' };
    const left = L.cluster && L.cluster.length ? Math.min(...L.cluster.map((b) => b.x)) : L.W;
    const name = s.name || (sc.item ? sc.item : sc.ability);
    itemCard(ctx, env, st, regions, tip, Math.max(4, left - 210), Math.max((L.minHit || 0) + 6, Math.floor(L.H / 2) - 90), 'Move',
      () => { st.slotCard = null; act.barPickEntry({ entry: sc.item ? `item:${sc.item}` : sc.ability, name, from: sc.slot }); },
      { onClose: () => { st.slotCard = null; }, more: [['Take off bar', 'crimson', () => { st.slotCard = null; act.barTakeOff(sc.slot); }]] });
  }

  /** The npc window's rect on this layer (dialog.js draws it; the toast and the quest marks keep clear of it). */
  function dialogRect(L) {
    const r = dialogRectFor(L, g.textSize === 'large'), o = dOrg(L);
    return { ...r, x: r.x + o.x, y: r.y + o.y };
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
    const y = L.touch ? Math.floor(L.H * 0.32) : dOrg(L).y + 96;
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

  /** Friends' names over their heads (online co-op): blue like the party frames, dim when they are down. */
  function drawNamePlates(ctx, plates) {
    for (const p of plates || []) {
      const name = g.clip(p.name, 90), w = g.textW(name);
      const x = Math.round(p.x - w / 2), y = Math.round(p.y - 13);
      g.scrim(ctx, x - 2, y, w + 4, 11, 120);
      g.text(ctx, name, x, y - 1, p.dead ? 'dim' : 'blue');
    }
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
    const x = Math.floor((L.W - w) / 2), y = L.touch ? Math.max(L.minHit + 6, Math.floor((L.H - h) / 2) - 10) : dOrg(L).y + 96;
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
      if (r && r.on) { r.on(button); uiSnd.press(r.label); }
      else if (st.mode === 'title' && !r && !st.fsHelp) { if (store.list().length) act.go('select'); else act.go('create'); }
      if (st.mode === 'create' && (!r || r.kind !== 'name_field')) { nameInput.blur(); st.nameFocus = false; }
      return true;
    }
    if (st.rebinding) { st.rebinding = null; }
    const r = topRegion(x, y);
    // "Put on bar": the next slot pressed takes the item; Cancel (or a press on anything else) leaves the bar as it was
    // Move (the slot card): the next slot pressed takes it, an occupied one swaps
    if (st.barPick && r && r.kind === 'slot' && r.slot) {
      if (st.barPick.from) act.barMove(st.barPick.from, r.slot); else act.barSet(r.slot, st.barPick.entry);
      toast(`${st.barPick.name} is on slot ${r.slot}.`); st.barPick = null; return true;
    }
    if (st.barPick && r && !(r.on && r.label === 'bar_pick:cancel')) { st.barPick = null; return true; }
    if (!r) {
      // a click outside the open windows closes the touch window; on desktop windows stay
      return false;
    }
    if (r.drag) { st.drag = r; r.drag(x); return true; }
    if (button === 2 && chatUi.rightClick(r)) return true;   // wave 8 talk: right click a friend's party frame: their card
    if (r.on) { r.on(button); uiSnd.press(r.label); return true; }
    switch (r.kind) {
      case 'slot':
        if (button === 2 && r.item) { act.barSet(r.slot, null); return true; }      // right-click takes an item off the bar
        if (r.ability || r.slot) hooks.input && hooks.input.inject({ k: 'cast', slot: r.slot }); st.pressed = `slot${r.slot}`; return true;
      case 'interact': hooks.input && hooks.input.inject({ k: 'interact' }); st.pressed = 'interact'; return true;
      case 'mark': hooks.input && hooks.input.inject({ k: 'talk', id: r.id }); return true;
      case 'next_target': hooks.input && hooks.input.inject({ k: 'tab', back: false }); st.pressed = 'next_target'; return true;
      case 'attack': hooks.input && hooks.input.inject({ k: 'attack' }); st.pressed = 'attack'; return true;
      case 'mount': act.mount(); st.pressed = 'mount'; return true;     // mounts: the phone's horseshoe
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
    if (overlayEv(ev)) { st.hover = null; return; }
    const p = toHud(ev.clientX, ev.clientY);
    const lw = (st.layer && st.layer.W) || W, lh = (st.layer && st.layer.H) || H;
    st.hover = p.x >= 0 && p.y >= 0 && p.x < lw && p.y < lh ? p : null;
    if (st.drag && st.drag.drag && (ev.buttons & 1)) st.drag.drag(p.x);
    const d = st.itemDrag;
    if (d) { d.x = p.x; d.y = p.y; if (!d.active && Math.hypot(p.x - d.x0, p.y - d.y0) > 3) d.active = true; }
  };
  const onMouseDown = (ev) => {
    if (overlayEv(ev)) return;
    if (ev.pointerType === 'touch' || ev.sourceCapabilities && ev.sourceCapabilities.firesTouchEvents) return;
    const p = toHud(ev.clientX, ev.clientY);
    st.hover = p;
    st.mods = { shift: !!ev.shiftKey, ctrl: !!(ev.ctrlKey || ev.metaKey) };
    // PC: an item in the bags (potion, ether, food, antidote) can be dragged onto a bar slot
    const r0 = st.mode === 'game' && ev.button === 0 ? topRegion(p.x, p.y) : null;
    st.itemDrag = r0 && r0.kind === 'bag' && r0.barItem
      ? { entry: `item:${r0.barItem}`, icon: (itemInfo(r0.barItem) || {}).icon || r0.barItem, x0: p.x, y0: p.y, x: p.x, y: p.y, active: false } : null;
    // at the Lantern Chest: a bag item drags into the chest, a chest item drags onto the bags
    const chestUp = !!(st.chest && lastModel && lastModel.storage);
    if (chestUp && r0 && r0.kind === 'bag') st.itemDrag = { ...(st.itemDrag || { x0: p.x, y0: p.y, x: p.x, y: p.y, active: false }), icon: r0.icon || (st.itemDrag && st.itemDrag.icon), bagFrom: r0.i };
    if (chestUp && r0 && r0.kind === 'chest_item') st.itemDrag = { chestFrom: { tab: r0.tab, index: r0.index, item: r0.item }, icon: r0.icon, x0: p.x, y0: p.y, x: p.x, y: p.y, active: false };
    // a spare skill (Character window) drags onto a slot the same way
    if (r0 && r0.kind === 'spare' && r0.ability) st.itemDrag = { entry: r0.ability, icon: r0.icon || (abilityInfo(r0.ability) || {}).icon, x0: p.x, y0: p.y, x: p.x, y: p.y, active: false };
    // a bar slot (skill or item): held and moved a few pixels it drags to another slot (swap) or off the bar; a plain
    // click still casts, on release (the drag has to be ruled out first), as an action button does in the classic MMOs
    if (r0 && r0.kind === 'slot' && r0.slot && !st.barPick && (r0.ability || r0.item)) {
      const s = lastModel && (lastModel.bar || [])[r0.slot - 1];
      st.itemDrag = { from: r0.slot, entry: r0.item ? `item:${r0.item}` : r0.ability, name: (s && s.name) || '', icon: (s && s.icon) || null,
        x0: p.x, y0: p.y, x: p.x, y: p.y, active: false };
      st.pressed = `slot${r0.slot}`;
      ev.stopPropagation(); ev.preventDefault();
      return;
    }
    if (press(p.x, p.y, ev.button)) { ev.stopPropagation(); ev.preventDefault(); }
  };
  const onMouseUp = (ev) => {
    if (overlayEv(ev)) { st.drag = null; st.itemDrag = null; return; }
    st.drag = null; st.pressed = null;
    const d = st.itemDrag;
    st.itemDrag = null;
    if (!d || !ev) return;
    if (!d.active) { if (d.from) press(d.x0, d.y0, 0); return; }   // a bar slot clicked, not dragged: cast it
    const p = toHud(ev.clientX, ev.clientY);
    // the Lantern Chest: dropped on the bags takes it, dropped on the chest stores it
    if (d.chestFrom || d.bagFrom != null) {
      const under = [...st.regions].reverse().filter((o) => inRect(o.rect, p.x, p.y));
      const onWin = (id) => under.some((o) => o.kind === 'window' && o.id === id);
      if (d.chestFrom && (onWin('bags') || under.some((o) => o.kind === 'bag'))) { act.chestTake(d.chestFrom.tab, d.chestFrom.index, d.chestFrom.item); return; }
      if (d.bagFrom != null && onWin('chest')) {
        const tb = under.find((o) => o.label === 'chest_tab:shared') ? 'shared' : under.find((o) => o.label === 'chest_tab:hero') ? 'hero' : (st.chest && st.chest.tab) || 'hero';
        act.chestStore(d.bagFrom, tb); return;
      }
      if (!d.entry) return;
    }
    // the slot under the pointer, even where a window edge overlaps the bar
    const r = [...st.regions].reverse().find((o) => o.kind === 'slot' && o.slot && inRect(o.rect, p.x, p.y));
    if (d.from) {
      if (r && r.slot !== d.from) act.barMove(d.from, r.slot);
      else if (!r && !nearBar(p)) act.barTakeOff(d.from);            // dropped off the bar (not in a gap between slots): taken off
      return;
    }
    if (r) act.barSet(r.slot, d.entry);
  };
  /** Is a HUD point on the desktop bar's row (a slot or the gap between two)? A drag let go there is not "off the bar". */
  const nearBar = (p) => {
    const bar = (layoutNow().bar || []);
    if (!bar.length) return false;
    const x0 = bar[0].x - 4, x1 = bar[bar.length - 1].x + bar[bar.length - 1].w + 4, y0 = bar[0].y - 4, y1 = bar[0].y + bar[0].h + 4;
    return p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1;
  };
  const onWheel = (ev) => {
    if (overlayEv(ev)) return;
    const p = toHud(ev.clientX, ev.clientY);
    const r = topRegion(p.x, p.y);
    if (r && r.kind === 'chat') { st.chatScroll += ev.deltaY < 0 ? 1 : -1; ev.preventDefault(); }
    else { const sr = [...st.regions].reverse().find((o) => o.scroll && inRect(o.rect, p.x, p.y)); if (sr) { sr.scroll(ev.deltaY < 0 ? -1 : 1); ev.preventDefault(); } }
  };
  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('contextmenu', (ev) => { if (!overlayEv(ev)) ev.preventDefault(); }, true);

  // ---------------------------------------------------------------- keyboard
  const onKey = (down) => (ev) => {
    if (overlayEv(ev)) return;
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
    if (!down) photoUi.keyUp(ev);                // wave 8 photo: lets go of a held camera key (the event goes on as before)
    if (st.rebinding) {
      if (!down) return;
      ev.stopPropagation(); ev.preventDefault();
      if (ev.code !== 'Escape') act.setOption('binds', rebind(options.binds, st.rebinding, ev.code));
      st.rebinding = null;
      return;
    }
    if (ev.repeat && down) { if (ev.code === 'Tab') ev.preventDefault(); }
    if (down && !ev.repeat && talkUi.key(ev, st, options.binds, act)) { ev.stopPropagation(); ev.preventDefault(); return; }   // quest scenes
    if (down && photoUi.key(ev, lastModel, options.binds)) { ev.stopPropagation(); ev.preventDefault(); return; }   // wave 8 photo: P, and every key while open
    if (down && emoteUi.key(ev, options.binds, lastModel)) { ev.stopPropagation(); ev.preventDefault(); return; }   // wave 7 anim: Space, G, the ring
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
      if (st.mirror) looks.close();
      else if (chatUi.escape()) { /* wave 9 fixes: Esc closes the Say sheet, a friend's card or the chat log */ }
      else if (st.barPick || st.slotCard) { st.barPick = null; st.slotCard = null; }
      else if (st.hint) act.dismissHint();
      else if (st.dialog) act.closeDialog();
      else if (st.chest) act.closeChest();
      else if (open.length) act.close(open[open.length - 1]);
      else if (lastModel && lastModel.target) hooks.input && hooks.input.inject({ k: 'clear' });
      else act.toggle('menu');
      return;
    }
    if (route.action === 'interact') { hooks.input && hooks.input.inject({ k: 'interact' }); return; }
    if (route.action === 'mount') { act.mount(); return; }      // mounts: summon, or get off (src/sim/mounts.js)
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
    no_value: 'The vendor will not buy that.', chest_full: 'The chest is full. Buy a row or take something out.', max: 'That tab is as big as it gets.',
    quest: 'Quest items stay in the quest bag.', dead: 'Not while dead.', bags_full: 'You can wear 4 bags.', cooldown: 'Not ready yet.', full: 'You are already at full health.',
    known: 'You already know that.', points: 'No talent points left.', tier: 'That tier is not open yet.', dependency: 'A deeper talent needs that one.', empty: 'Nothing to reset.' };
  const QUEST_FAIL_TEXT = { bag_full: 'Your bags are full. Sell or drop an item, then try again.', range: 'Too far away. Walk closer and talk again.',
    not_ready: 'That quest is not finished yet.', not_active: 'You do not have that quest.' };
  function onOwnEvent(ev) {
    const me = playerId;
    if (talkUi.onEvent(ev, me, st)) return;     // quest scenes: the turn-in flourish stands in for the banner
    if (emoteUi.onEvent(ev, me)) return;         // wave 7 anim: an emote the sim refused (combat, riding, working)
    const gl = groupEvent(ev, me, nameOf);
    if (gl) { if (gl.toast) toast(gl.toast, 3); if (gl.say) say(gl.say[0], gl.say[1]); return; }
    if (prof.onEvent(ev, me)) return;            // professions (prof_ui.js)
    if (glyphs.onEvent(ev, me)) return;          // Inscriptions (glyph_ui.js)
    if (wdoor.onEvent(ev, me)) return;           // word doors (worddoor_ui.js)
    if (riddleUI.onEvent(ev, me)) return;        // wave 9 riddles (riddle_ui.js)
    if (looks.onEvent(ev, me)) return;           // the free mirror (create_screen.js)
    switch (ev.type) {
      case 'interact':
        if (ev.src !== me) return;
        if (st.dialog && st.dialog.ent === ev.id) Object.assign(st.dialog, { trainer: ev.trainer || null, vendor: ev.vendor || null, inn: ev.inn || null, flight: ev.flight || null, ride: ev.ride || null, line: st.dialog.line + 1 });
        else { st.dialog = dialogFromInteract(ev); st.dialog.line = Math.floor(st.now * 7); if (st.metrics.touch) st.open.clear(); }
        return;
      case 'chest_open':
        if (ev.src !== me) return;
        st.dialog = null; st.confirm = null; st.itemPick = null;
        if (st.metrics.touch) st.open.clear();
        st.chest = { ent: ev.id, tab: (st.chest && st.chest.tab) || 'hero', place: ev.place || null, pick: null, scroll: 0, t0: st.now };
        st.open.add('bags');
        return;
      case 'chest': {
        if (ev.id !== me) return;
        const nm = ev.item ? (itemInfo(ev.item) || { name: ev.item }).name : '';
        const qty = ev.qty > 1 ? ` x${ev.qty}` : '';
        const heroName = (lastModel && lastModel.player && lastModel.player.name) || 'your hero';
        if (ev.kind === 'store') say('loot', `Stored ${nm}${qty}${ev.tab === 'shared' ? ' in Shared' : ''}.`);
        else if (ev.kind === 'take') say('loot', `Took ${nm}${qty} from the chest.`);
        else if (ev.kind === 'move') say('loot', `Moved ${nm}${qty} to ${ev.to === 'shared' ? 'Shared' : heroName}.`);
        else if (ev.kind === 'row') { toast(`+10 slots: ${ev.size} in ${ev.tab === 'shared' ? 'Shared' : heroName}.`, 3); say('loot', `You buy a chest row for ${ev.cost} gold.`); }
        return;
      }
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
      case 'cmd_reject': {
        // a refused quest turn-in or accept used to fail with no word (Scott 2026-11-20: "Complete (pick one)" did nothing)
        if (ev.id !== me || (ev.cmd !== 'quest_turnin' && ev.cmd !== 'quest_accept')) return;
        const t = QUEST_FAIL_TEXT[ev.reason];
        if (t) { toast(t); say('error', t); }
        return;
      }
      case 'train_fail': case 'inventory_fail': case 'talent_fail':
        if (ev.id !== me) return;
        if (ev.type === 'inventory_fail' && ev.cmd === 'use_item' && ev.reason === 'no_item') { const t = `No ${(itemInfo(ev.item) || { name: ev.item }).name} left.`; toast(t); say('error', t); return; }
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
        if (ev.bagGrew > 0) { const l = `Your satchel stretches: +${ev.bagGrew} bag slots`; lines.push(l); say('loot', `${l}.`); }
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
        say('system', ev.passive ? `You learn ${nm}. It works on its own and takes no bar slot.` : `You learn ${nm}. It is on your bar.`);
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
      case 'bar_fail':
        if (ev.id === me) toast(ev.reason === 'empty' ? 'That slot is empty.' : ev.reason === 'not_usable' ? 'Only items you can use go on the bar.' : 'That cannot go there.');
        return;
      case 'secret_found':
        if (ev.id === me) toast(`Secret found: ${ev.name || 'a hidden cache'}!`, 3);
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
      // world life (src/sim/worldlife.js): the story card, coming back rested, Night at the Stones
      case 'story':
        if (ev.id === me) st.story = { title: ev.title, lines: ev.lines || [], until: st.now + 40 };
        return;
      case 'rest':
        if (ev.id === me && ev.gained > 0) toast('Rested: your kills give double experience for a while', 4);
        return;
      case 'world_event':
        if (ev.text) toast(ev.text, 5);
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
    /** wave 6: main.js hands in the boss intro card's draw (src/ui/boss_card.js); drawn after the HUD, under the windows */
    set bossCard(fn) { bossCardDraw = fn; },
    photo: photoUi, setPhotoHooks(h) { Object.assign(photoHooks, h); },   // wave 8 photo: main.js hands in the capture and the camera
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
    setLongTip(p) {
      st.longTip = p;
      // a long press on an item on the bar pins its card (Take off bar); it stays after the finger lifts
      const r = p && st.mode === 'game' ? topRegion(p.x, p.y) : null;
      if (r && r.kind === 'slot' && r.item) st.slotCard = { slot: r.slot, item: r.item };
      // a skill out of a fight (its slot fires on release then, so this hold cast nothing): Move, Take off bar
      else if (r && r.kind === 'slot' && r.ability && r.tapOnly) st.slotCard = { slot: r.slot, ability: r.ability };
      else if (emoteUi.longPress(r)) st.longTip = null;   // wave 7 anim: a long press on your own portrait opens the emote ring
      else if (chatUi.longPress(r)) st.longTip = null;    // wave 8 talk: a long press on a friend's party frame opens their card
    },
    setPressed(id) { st.pressed = id; },
    /** Quest scenes: view.talk for the 3D renderer (talk_ui.js view), and the talk state for drivers. */
    talkView: (snap) => (st.mode === 'game' ? talkUi.view(st, snap, playerId, st.metrics.touch) : null),
    talk: talkUi,
    chat: chatUi,   // wave 8 talk (src/ui/chat_ui.js): coop.js feeds it
    openEmotes: () => emoteUi.open(true),   // wave 8 talk: the Say sheet's Emotes button
    onboard: onb,   // wave 7 onboarding hints (drivers and tests)
    /** True when a HUD point belongs to the UI (a region, an open window, or a non-game screen). */
    owns(x, y, who) { const r = st.mode === 'game' ? topRegion(x, y) : null; return st.mode !== 'game' || (!!r && !(who === 'cam' && r.camThrough)); },   // 'cam': horizon_input.js (wave 8 photo)
    handleEvents(events, ctx) {
      for (const ev of events) {
        for (const l of eventLines(ev, { me: playerId, resourceKind: resKindNow(), ...ctx })) (l.quiet ? quietSay(l.text) : say(l.ch, l.text));
        if (playerId != null) { onb.onEvent(ev, playerId); onOwnEvent(ev); }   // wave 7 onboarding sees what the hero did
      }
    },
    /** The npc template whose mark is gold after a level-up with new abilities (main.js adds it to the quest marks). */
    get trainerMark() { return st.trainerMark && st.trainerMark.until > st.now ? st.trainerMark.npc : null; },
    /** Phone layer mode for the renderer: 'big' (play) or 'win' (a 640x360 menu window is open). */
    get hudMode() { return hudMode(); },
    /** The creation screen's or the mirror's turntable request (main.js view.stage; renderer3d draws the 3D hero), or null. */
    get stage() { return looks.stage(); },
    setAbilityContent,
    say,
    logText: () => log.map((l) => l.text),
    saveProgress,
    saveHero,
    get playerId() { return playerId; },
    /** Dev start / drivers: play an already-added entity (no saved character). */
    riddles: riddleUI,   // wave 9 riddles: main.js passes links and the co-op hooks
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

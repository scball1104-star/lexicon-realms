// Party chronicle (wave 9 chronicle lane; brief D:/LQOnline/wave9/chronicle/BRIEF.md, approved by Scott 2026-11-25 with
// the lane's recommendations). The controller: a night starts when a hero enters the world; the journal (journal.js)
// reads every sim event on the bus (solo, a co-op host, and a guest from the host's frames); a big moment asks for a
// still, which the 3D renderer's own capture() takes a set time later (the photo-mode call: the 3D frame only, never the
// HUD); the night is kept on this device (store.js) as it goes. The page opens by itself at Quit to title and when a
// co-op game ends (a host's End game, or a guest sent home), for a night of 5 minutes or more with at least one moment;
// Options: Chronicle lists past nights; a tab closed mid-night shows "Last time" when the next night starts. A link with
// #chron= (words only) opens a friend's night read-only.
//
//   const C = await createChronicle({ bus, content, renderer, ui, input, canvas, font, touch, heroId, snapshot, coop, replay, q })
//   C.openList()   Options: Chronicle         C.endNight(why)   'quit' | 'coop' | 'quiet' (main.js logout hook)
//   C.state        drivers and tests: { night, page, list, due, last }
//
// Every word a player reads comes from journal.js WORDS and LINES (DRAFTS for Scott).
import { loadUiArt } from '../ui/uiassets.js';
import { createGfx } from '../ui/gfx.js';
import { textSizeFrom } from '../ui/skin.js';
import { placeAt } from '../data/maps/compose.js';
import { createJournal, writeStory, toRow, fromRow, packLink, readLink, knownNames, fill, isoDay, WORDS, STILL_W, STILL_H, STILL_Q,
  QUIET_END_MIN, PAGE_MIN_MIN, LINK_KEY } from './journal.js';
import { createChronicleUI, preload } from './chronicle_ui.js';
import { createChronicleStore } from './store.js';

const TILE = 256;
const STILLS_KEY = 'lexicon_realms_chronicle_stills';
const inR = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
export const SHARE_TEXT = 'The story of our night in Lexicon Realms.';   // DRAFT: the text beside a shared link

export async function createChronicle(o) {
  const { bus, content, renderer, ui, input, canvas, font, coop, q } = o;
  const art = await loadUiArt({ font });
  const g = createGfx(art);
  const store = createChronicleStore();
  const known = knownNames(content);
  const dev = q && q.get && q.get('dev') === '1';
  const pageMinMs = (dev && q.has('chronmin') ? Number(q.get('chronmin')) : PAGE_MIN_MIN) * 60000;   // drivers: ?dev=1&chronmin=0
  const ls = (() => { try { return window.localStorage; } catch { return null; } })();
  let stillsOn = (() => { try { return ls ? ls.getItem(STILLS_KEY) !== '0' : true; } catch { return true; } })();

  // ---- the snapshot as the journal's world: the same entities on the host, a guest and solo
  let idx = null, idxOf = null;
  const snap = () => o.snapshot() || { entities: [], tick: 0 };
  const get = (id) => { const s = snap(); if (idxOf !== s) { idx = new Map(s.entities.map((e) => [e.id, e])); idxOf = s; } return idx.get(id) || null; };
  const players = () => snap().entities.filter((e) => e.kind === 'player');
  const placeOf = (e) => {
    const z = content.zones[e.zone];
    const p = z ? placeAt(z, Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)) : null;
    return (p && p.name) || (content.zoneNames || {})[e.zone] || (z && z.name) || String(e.zone || '');
  };

  // ---- the night
  const S = { night: null, due: [], last: null, role: null, saving: null };
  function startNight() {
    const me = get(o.heroId());
    if (!me) return null;
    const startMs = Date.now();
    const J = createJournal({ get, players, heroId: o.heroId, placeOf, content, startMs, id: `n${startMs.toString(36)}` });
    for (const p of players()) if (p.id === me.id || (p.party != null && p.party === me.party)) J.hero(p);
    S.night = { J, openPlace: placeOf(me), hero: me.name };
    S.due = [];
    lastTime();
    return S.night;
  }
  const rowOf = (finished) => { const N = S.night; return { ...toRow(N.J.session, { endMs: Date.now(), openPlace: N.openPlace, finished }), owner: N.hero }; };
  function save(finished = false) {
    const N = S.night;
    if (!N || !N.J.worth()) return Promise.resolve(null);
    S.saving = store.put(rowOf(finished)).catch((e) => { console.warn('chronicle store', e); return null; });
    return S.saving;
  }
  /** End the night: keep it; open its page at Quit to title and when a co-op game ends. */
  async function endNight(why = 'quit') {
    const N = S.night;
    S.night = null; S.due = [];
    if (!N || !N.J.worth()) return false;
    const row = { ...toRow(N.J.session, { endMs: Date.now(), openPlace: N.openPlace, finished: true }), owner: N.hero };
    await linkReplays(row);
    try { await store.put(row); } catch (e) { console.warn('chronicle store', e); }
    if ((why === 'quit' || why === 'coop') && row.endMs - row.startMs >= pageMinMs) { await openRow(row); return true; }
    return false;
  }
  /** A tab closed mid-night: the next night opens with that one's page, once ("Last time"). */
  async function lastTime() {
    let rows = [];
    try { rows = await store.list(); } catch { return; }
    const r = rows.find((x) => !x.finished && (!S.night || x.id !== S.night.J.session.id));
    if (!r) return;
    const full = await store.get(r.id);
    if (!full) return;
    full.finished = true;
    try { await store.put(full); } catch { /* still shows */ }
    if (full.endMs - full.startMs >= pageMinMs && (full.moments || []).some((m) => m.w > 0)) openRow(full, { last: true });
  }
  /** Boss and rare chapters: the fight the replay recorder kept by itself (src/replay/), for Watch the fight. */
  async function linkReplays(row) {
    const RP = o.replay && o.replay();
    if (!RP || !RP.store) return;
    let rows = [];
    try { rows = await RP.store.list(); } catch { return; }
    for (const m of row.moments) {
      if ((m.kind !== 'boss' && m.kind !== 'rare') || m.mobId == null) continue;
      const r = rows.find((x) => x.bossId === m.mobId && x.when >= row.startMs - 60000);
      if (r) m.replay = r.id;
    }
  }

  // ---- events: every sim event on the bus
  bus.on('*', (ev) => {
    if (ui.mode !== 'game' || o.heroId() == null) return;
    if (!S.night) startNight();
    if (!S.night) return;
    const r = S.night.J.onEvent(ev, snap().tick);
    if (!r) return;
    if (stillsOn && renderer.is3d) S.due.push({ m: r.moment, at: snap().tick + r.delay, t0: Date.now() });
    else S.night.J.keepShot(r.moment, null);
    save(false);
  });

  // ---- the still: the 3D frame as the player sees it (no HUD), 960x540 JPEG
  function shoot() {
    const c = renderer.capture ? renderer.capture() : null;
    if (!c) return null;
    const out = document.createElement('canvas'); out.width = STILL_W; out.height = STILL_H;
    const x = out.getContext('2d'); x.imageSmoothingQuality = 'high';
    const r = Math.max(out.width / c.width, out.height / c.height), sw = out.width / r, sh = out.height / r;
    x.drawImage(c, (c.width - sw) / 2, (c.height - sh) / 2, sw, sh, 0, 0, out.width, out.height);
    try { return out.toDataURL('image/jpeg', STILL_Q); } catch { return null; }
  }
  function frame() {
    const N = S.night;
    // the role changed: a host's game ended (End game), so the night ends with its page
    const role = coop ? coop.role : null;
    if (S.role === 'host' && role == null && ui.mode === 'game' && N) endNight('coop');
    S.role = role;
    if (!N) return;
    if (ui.mode !== 'game' || o.heroId() == null) return;
    if (Date.now() - N.J.session.lastMomentMs > QUIET_END_MIN * 60000 && N.J.worth()) { endNight('quiet'); return; }
    if (!S.due.length) return;
    const me = get(o.heroId());
    const ready = renderer.is3d && renderer.ready && me && (!renderer.zoneReady || renderer.zoneReady(me.zone)) && !(renderer.loadingCard && renderer.loadingCard.active);
    const tick = snap().tick;
    for (let i = S.due.length - 1; i >= 0; i--) {
      const d = S.due[i];
      if (tick < d.at) continue;
      if (!ready && Date.now() - d.t0 < 8000) continue;        // a still waits for the scene to be drawn (8 s at most)
      S.due.splice(i, 1);
      const still = ready && stillsOn && !(ui.photo && ui.photo.on) ? shoot() : null;
      N.J.keepShot(d.m, still);
      if (still && !U.page && !U.list) U.toast = { still, t0: performance.now() / 1000 };
      save(false);
    }
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { save(false); });

  // ---- the page
  const U = createChronicleUI({ g, act: {
    close: () => closeAll(), prev: () => { if (U.page) U.page.sel--; }, next: () => { if (U.page) U.page.sel++; },
    save: () => savePicture(), copy: () => copyLink(), watch: (ch) => watchFight(ch), earlier: () => openList(),
    stills: () => setStills(!stillsOn), open: (i) => openListRow(i),
  } });
  let cur = null;        // the night on the page: { S, endMs, openPlace, reader, from }
  async function openRow(row, { last = false } = {}) {
    const r = fromRow(row);
    const story = writeStory(r.S, { endMs: r.endMs, openPlace: r.openPlace });
    await preload(story.chapters.map((c) => c.shot));
    cur = { ...r, owner: row.owner || null, reader: false };
    U.list = null; U.toast = null;
    U.page = { story, sel: 0, reader: false, stillsOff: !stillsOn, last };
    addLayer();
  }
  async function openList() {
    if (ui.isOpen && ui.isOpen('menu')) ui.act.close('menu');
    let rows = [];
    try { rows = await store.list(); } catch (e) { console.warn('chronicle list', e); }
    U.page = null; U.list = { rows: rows.filter((r) => r.moments), sel: 0 };
    addLayer();
  }
  async function openListRow(i) {
    const r = U.list && U.list.rows[i];
    if (!r) return;
    const full = await store.get(r.id);
    if (full) openRow(full);
  }
  function closeAll() { U.page = null; U.list = null; cur = null; dropLayer(); }
  function setStills(on) {
    stillsOn = !!on;
    try { if (ls) ls.setItem(STILLS_KEY, stillsOn ? '1' : '0'); } catch { /* private mode: this tab only */ }
    if (U.page) U.page.stillsOff = !stillsOn;
    if (!stillsOn) { if (S.night) for (const d of S.due) S.night.J.keepShot(d.m, null); S.due = []; }
  }
  const touchNow = () => { try { return !!ui.layout().touch; } catch { return !!o.touch; } };
  const say = (t) => ui.notify(t, 3);
  async function savePicture() {
    if (!U.page || U.page.reader) return;
    const story = U.page.story;
    await preload(story.chapters.map((c) => c.shot));
    const pic = U.compose(story);
    const name = fill(WORDS.file, { date: isoDay(cur ? cur.S.startMs : Date.now()) });
    const blob = await new Promise((res) => { try { pic.toBlob(res, 'image/jpeg', 0.85); } catch { res(null); } });
    if (!blob) return;
    if (touchNow() && typeof navigator !== 'undefined' && navigator.canShare && typeof File === 'function') {
      const f = new File([blob], name, { type: 'image/jpeg' });
      if (navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: story.title }); say(WORDS.pictureShared); } catch { /* cancelled */ }
        return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(WORDS.pictureSaved);
  }
  async function linkFor() {
    if (!cur) return null;
    const owner = cur.owner || (Object.values(cur.S.heroes)[0] || {}).name || 'Hero';
    const h = await packLink(cur.S, { from: owner, endMs: cur.endMs, openPlace: cur.openPlace });
    return `${location.origin}${location.pathname}${h}`;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* the old way below */ }
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }
  async function copyLink() {
    const url = await linkFor();
    if (!url) return;
    S.lastLink = url;
    if (touchNow() && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try { await navigator.share({ title: 'Lexicon Realms', text: SHARE_TEXT, url }); say(WORDS.linkShared); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    if (await copyText(url)) say(WORDS.linkCopied);
  }
  async function watchFight(ch) {
    const RP = o.replay && o.replay();
    if (!RP || !ch || !ch.replay) return;
    await RP.refresh();
    const i = RP.list.rows.findIndex((r) => r.id === ch.replay);
    if (i < 0) { say(WORDS.noReplay); return; }
    closeAll();
    RP.watch(i);
  }

  // ---- a friend's link: #chron=... opens their night, words only
  async function readHash() {
    if (typeof location === 'undefined' || !new RegExp(`[#&]${LINK_KEY}=`).test(location.hash || '')) return;
    const r = await readLink(location.hash, { known });
    try { history.replaceState(history.state, '', `${location.pathname}${location.search}`); } catch { /* keeps the # */ }
    if (!r) { say(WORDS.notReadable); return; }
    const story = writeStory(r.S, { endMs: r.endMs, openPlace: r.openPlace, readerFrom: r.from });
    cur = { ...r, reader: true };
    U.list = null;
    U.page = { story, sel: 0, reader: true };
    addLayer();
  }

  // ---- the see-through layer: takes the pointer and the keys while the page or the list is up (as the replay list does)
  let layer = null;
  function addLayer() {
    if (layer || typeof document === 'undefined') return;
    layer = document.createElement('div');
    layer.setAttribute('data-overlay', 'chronicle');
    layer.tabIndex = 0;
    layer.style.cssText = 'position:fixed;inset:0;z-index:31;background:transparent;outline:none;touch-action:none;user-select:none';
    layer.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); ev.stopPropagation(); layer.focus();
      const p = ui.hudPoint(ev.clientX, ev.clientY);
      for (let i = U.regions.length - 1; i >= 0; i--) { const r = U.regions[i]; if (inR(r.rect, p.x, p.y)) { r.on(); return; } }
    });
    for (const k of ['pointermove', 'pointerup', 'pointercancel', 'keyup', 'wheel']) layer.addEventListener(k, (ev) => ev.stopPropagation());
    layer.addEventListener('contextmenu', (ev) => ev.preventDefault());
    layer.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      const c = ev.code;
      if (c === 'Escape') closeAll();
      else if (c === 'ArrowLeft' && U.page) U.page.sel--;
      else if (c === 'ArrowRight' && U.page) U.page.sel++;
      else if (c === 'Tab') { /* nothing */ } else return;
      ev.preventDefault();
    });
    document.body.appendChild(layer);
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) input.release(c);
    layer.focus();
  }
  function dropLayer() { if (layer) { layer.remove(); layer = null; } }

  // ---- drawn over the HUD (the menus too), the stills at full resolution after the HUD is composited
  const c2d = canvas.getContext('2d');
  const drawHud0 = renderer.drawHud.bind(renderer);
  renderer.drawHud = (fn) => {
    drawHud0((ctx, L) => {
      fn(ctx, L);
      try {
        frame();
        let lay = null; try { lay = ui.layout(); } catch { lay = { touch: !!o.touch, minHit: 15 }; }
        g.setTextSize(textSizeFrom(ui.options, !!lay.touch));
        if (U.toast && (ui.mode !== 'game' || (ui.photo && ui.photo.on))) U.toast = null;
        U.draw(ctx, L, lay, performance.now() / 1000);
      } catch (e) { console.warn('chronicle', e); }
    });
    try { if (U.pics.length && c2d) U.hires(c2d, renderer.layout); } catch (e) { console.warn('chronicle stills', e); }
  };

  readHash();
  return {
    openList, endNight, closeAll, openRow, savePicture, copyLink, setStills, store,
    get state() { return { night: S.night ? S.night.J.session : null, due: S.due.length, page: U.page, list: U.list, toast: !!U.toast, stillsOn, lastLink: S.lastLink || null }; },
    get regions() { return U.regions; },
    linkFor, compose: () => (U.page ? U.compose(U.page.story) : null),
  };
}

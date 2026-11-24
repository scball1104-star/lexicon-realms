// Drop-in with one link (docs/NET.md "Invite links"): the host sends a link, a friend taps it and lands on a join screen
// that offers their saved heroes, a quick new hero, or just watching. coop.js runs the connection; this file holds the
// link helpers (pure, node-tested) and the join screen (an HTML panel in src/net/netui.js, like the other co-op panels).
//
//   inviteLink(loc, code)      -> 'https://site/path/#join=ABCDE'   the room code only, after the #
//   readInvite(loc)            -> 'ABCDE' | null
//   clearInvite(win)           drop the #join from the address bar (a reload then opens the title, not the join screen)
//   shareOrCopy(nui, url, btn) the phone share sheet where the browser has one, else copy (the button says which)
//   quickName(existing, pick)  a free name for a quick new hero (draft names)
//   openDropPanel({ nui, store, classOrder, classInfo, on })   the join screen; returns { status, setHost, close, open }
//
// What is in the link: the page address and the 5-letter room code, nothing else. No name, hero, save or device detail.
// The code sits after the # so it never reaches the web server (browsers do not send the part after #). The room code is
// also the key the signalling messages are encrypted with (transport.js roomCrypto), exactly as when it is typed.
import { cleanRoomCode, validRoomCode, signalFor, joinRoom } from './transport.js';
import { classOrder, classInfo } from '../ui/gamedata.js';

export const INVITE_KEY = 'join';
// query keys a dev or test page keeps in its invite links (which signal, STUN off, dev tools); none is personal
const KEEP = ['net', 'stun', 'dev'];

export function inviteLink(loc, code) {
  const c = cleanRoomCode(code);
  if (!validRoomCode(c)) return null;
  const q = new URLSearchParams(loc.search || '');
  const keep = new URLSearchParams();
  for (const k of KEEP) if (q.has(k)) keep.set(k, q.get(k));
  const qs = keep.toString();
  return `${loc.origin}${loc.pathname}${qs ? `?${qs}` : ''}#${INVITE_KEY}=${c}`;
}

export function readInvite(loc) {
  const h = String((loc && loc.hash) || '').replace(/^#/, '');
  const m = new RegExp(`(?:^|&)${INVITE_KEY}=([^&]*)`).exec(h);
  if (!m) return null;
  let raw = m[1];
  try { raw = decodeURIComponent(raw); } catch { /* keep as is */ }
  const c = cleanRoomCode(raw);
  return validRoomCode(c) ? c : null;
}

export function clearInvite(win = globalThis.window) {
  try {
    if (!win || !readInvite(win.location)) return;
    win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}`);
  } catch { /* an old browser keeps the # (a reload shows the join screen again, which is harmless) */ }
}

/** Phone share sheet first (Android, iPhone), then copy. Resolves 'shared' | 'copied' | 'failed' | 'cancelled'. */
export async function shareOrCopy(nui, url, btn = null, { text = SHARE_TEXT, nav = globalThis.navigator } = {}) {
  if (nav && typeof nav.share === 'function') {
    try { await nav.share({ title: 'Lexicon Realms', text, url }); return 'shared'; } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // no share target (desktop Chrome without one): copy instead
    }
  }
  return (await nui.copy(url, btn)) ? 'copied' : 'failed';
}

// ---------------------------------------------------------------- player-facing words (all drafts, docs/NET.md)
export const SHARE_TEXT = 'Come play Lexicon Realms with me. Tap the link to join my game.';
export const QUICK_NAMES = ['Wren', 'Bramble', 'Tamsin', 'Corrin', 'Juniper', 'Ellis', 'Rowan', 'Maple', 'Fennick', 'Odette', 'Thistle', 'Quill',
  'Hollis', 'Marlow', 'Sorrel', 'Linden'];

/** A name for a quick hero that no hero on this device has. pick(n) -> 0..n-1 (crypto in the page; a test passes its own). */
export function quickName(existing = [], pick = cryptoPick) {
  const taken = new Set(existing.map((c) => String(c.name || '').toLowerCase()));
  const free = QUICK_NAMES.filter((n) => !taken.has(n.toLowerCase()));
  if (free.length) return free[pick(free.length)];
  for (let i = 2; i < 100; i++) { const n = `${QUICK_NAMES[0]}${'abcdefghijklmnopqrstuvwxyz'[i % 26]}`; if (!taken.has(n.toLowerCase())) return n; }
  return '';
}
function cryptoPick(n) {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch { return 0; }
}

const CSS = `
#net-ui .net-drop-list { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
#net-ui .net-drop-list button { text-align: left; display: flex; justify-content: space-between; gap: 8px; }
#net-ui .net-drop-list button span { color: #a79fb8; font-weight: 400; }
#net-ui .net-drop-cls { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
#net-ui .net-drop-cls button { padding: 6px 10px; min-height: 34px; }
#net-ui .net-drop-cls button.on { border-color: #ffd75a; background: #4a3a1c; }
#net-ui h3 { margin: 12px 0 2px; font-size: 15px; color: #ffd75a; font-weight: 600; }
`;
let styled = false;

/**
 * The join screen. on: { pick(char), quick(name, cls) -> reason | null, watch(), cancel() }.
 * mode 'join' (from a link) or 'play' (a watcher's Play button: no Just watch / Not now, a Back instead).
 */
export function openDropPanel({ nui, store, classOrder, classInfo, on, mode = 'join', host = null }) {
  if (!styled && typeof document !== 'undefined') { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); styled = true; }
  const titleFor = (h) => (h ? `Join ${h}'s game` : "Join your friend's game");
  let busy = false;
  const api = nui.panel({ title: titleFor(host), id: 'net-drop', build: (body, p) => {
    const { el } = nui;
    const heroes = store.list();
    const btns = [];
    const lock = (on2) => { busy = on2; for (const b of btns) b.disabled = on2; };
    if (heroes.length) {
      body.appendChild(el('h3', { text: 'Play as' }));
      const list = el('div', { class: 'net-drop-list' });
      heroes.forEach((c, i) => {
        const ci = classInfo(c.cls);
        const b = el('button', { class: 'net-go', id: `net-drop-hero-${i}`, data: { name: c.name }, onclick: () => { if (busy) return; lock(true); on.pick(c); } },
          [c.name, el('span', { text: `Level ${c.level || 1} ${ci ? ci.name : ''}` })]);
        btns.push(b); list.appendChild(b);
      });
      body.appendChild(list);
    }
    // a quick new hero: a class (the first is picked) and a name (one is filled in), then one tap. With heroes on this
    // device it folds away (a phone held sideways then shows Just watch without scrolling)
    const quick = heroes.length ? el('details', { id: 'net-drop-quick' }, [el('summary', { text: 'Or make a quick new hero' })]) : el('div', { id: 'net-drop-quick' }, [el('h3', { text: 'Make a quick hero' })]);
    const order = classOrder();
    let cls = order[0];
    const row = el('div', { class: 'net-drop-cls' });
    const clsBtns = order.map((id) => {
      const ci = classInfo(id);
      const b = el('button', { text: ci ? ci.name : id, class: id === cls ? 'on' : '', data: { cls: id }, onclick: () => { cls = id; for (const o of clsBtns) o.className = o.dataset.cls === cls ? 'on' : ''; } });
      return b;
    });
    row.append(...clsBtns);
    const name = el('input', { id: 'net-drop-name', maxLength: 12, value: quickName(heroes), autocomplete: 'off', spellcheck: false, placeholder: 'Hero name' });
    const make = el('button', { text: 'Make hero and join', class: 'net-go', id: 'net-drop-new', disabled: store.full(), onclick: () => {
      if (busy) return;
      const why = on.quick(name.value, cls);
      if (why) p.status(why, 'err'); else lock(true);
    } });
    name.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') make.click(); });
    btns.push(make);
    quick.append(row, name, el('div', { class: 'net-row' }, [make]));
    if (store.full()) quick.appendChild(el('p', { class: 'net-dim', text: 'All hero slots on this device are used. Play as one of your heroes.' }));
    body.appendChild(quick);
    const foot = mode === 'join'
      ? [el('button', { text: 'Just watch', id: 'net-drop-watch', onclick: () => on.watch() }), el('button', { text: 'Not now', class: 'net-quiet', id: 'net-drop-cancel', onclick: () => on.cancel() })]
      : [el('button', { text: 'Keep watching', class: 'net-quiet', id: 'net-drop-watch', onclick: () => on.watch() })];
    body.append(el('p', { class: 'net-dim', text: mode === 'join' ? 'You can watch first and pick a hero later.' : 'Your hero arrives beside your friend.' }), el('div', { class: 'net-row' }, foot));
  } });
  return {
    status: (t, k) => api.status(t, k),
    setHost(h) { const t = api.root.querySelector('h2'); if (t) t.textContent = titleFor(h); },
    unlock() { busy = false; for (const b of api.root.querySelectorAll('button')) if (b.id !== 'net-drop-new' || !store.full()) b.disabled = false; },
    close: () => api.close(),
    get open() { return api.open; },
  };
}

// ---------------------------------------------------------------- the drop-in flow (coop.js runs the connection)
/**
 * b: the bridge into coop.js. { nui, ui, kind, iceServers, WHY, heroBlob, startGuest(link, char, api, watch),
 * hostGame(char), hostPanel(), openChat(), heroId(), st } where st has get/set role, sess, host, charId and get roomCode.
 * Returns what coop.js calls: dropIn(code), invite(), inviteBlock(box, api), shareInvite(api), startWatching(sess, w),
 * refused(why), playerWelcome() -> the hero a watcher picked (or null), ended(reason) -> true for a watcher, watching, follow.
 */
export function createDropFlow(b) {
  const { nui, ui } = b;
  let watching = false, watchFollow = null;
  function inviteBlock(box, api) {
    const { el } = nui;
    const url = inviteLink(window.location, b.st.roomCode);
    if (!url) return;
    const share = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    const copyBtn = el('button', { text: 'Copy invite link', class: 'net-go', id: 'net-invite-copy', onclick: () => nui.copy(url, copyBtn) });
    const kids = [copyBtn];
    if (share) kids.push(el('button', { text: 'Share', id: 'net-invite-share', onclick: () => shareInvite(api) }));
    box.append(el('p', { text: 'Send a friend this link. They tap it and are beside you in seconds, no install.' }),
      el('input', { id: 'net-invite-link', value: url, readOnly: true, onfocus: (ev) => ev.target.select() }),
      el('div', { class: 'net-row' }, kids),
      el('p', { class: 'net-dim', text: 'Or they open Lexicon Realms, tap Join a game and type the code.' }));
  }
  async function shareInvite(api) {
    const url = b.st.roomCode ? inviteLink(window.location, b.st.roomCode) : null;
    if (!url) { b.hostPanel(); return; }
    const r = await shareOrCopy(nui, url, null);
    if (r === 'copied') ui.notify('Invite link copied. Paste it to a friend.', 3);
    else if (r === 'failed') b.hostPanel();
    if (api && api.open && r === 'shared') api.status('Invite sent.', 'ok');
  }
  /** Options: Invite a friend. Solo: start hosting with the hero in the world. Hosting: the host panel. */
  function invite() {
    if (b.st.role === 'host') { b.hostPanel(); return; }
    if (b.st.role || b.heroId() == null) return;
    const c = ui.store.get(ui.state.charId);
    if (c) b.hostGame(c);
  }
  let dropApi = null, dropChar = null, dropGen = 0;
  function dropIn(code) {
    clearInvite();
    if (b.st.role) return;
    dropChar = null;
    const api = openDrop('join', null);
    const gen = ++dropGen;               // Not now before the game is found: the late link is closed, not used
    joinRoom({ signal: signalFor(b.kind, code), code, iceServers: b.iceServers })
      .then((link) => { if (gen !== dropGen || b.st.role) { link.close('left'); return; } b.startGuest(link, null, api, true); },
        (e) => { if (gen === dropGen) api.status(b.WHY[e && e.message] || b.WHY.no_room, 'err'); });
  }
  function openDrop(mode, host) {
    dropApi = openDropPanel({ nui, store: ui.store, classOrder, classInfo, mode, host, on: {
      pick: (c) => dropPlay(c),
      quick: (name, cls) => {
        const r = ui.store.add({ name, cls, look: 0, start: 'realm' });
        if (!r.ok) return r.reason;
        dropPlay(r.char);
        return null;
      },
      watch: () => { if (dropApi) dropApi.close(); if (!watching) ui.notify('You will watch as soon as the game is found.', 3); },
      cancel: () => { if (dropApi) dropApi.close(); leaveWatch(); },
    } });
    return { status: (t, k) => dropApi.status(t, k), close: () => dropApi.close(), get open() { return dropApi.open; } };
  }
  function dropPlay(c) {
    dropChar = c;
    if (watching && b.st.sess) { b.st.sess.play(b.heroBlob(c)); dropApi.status(`Joining as ${c.name}...`); }
    else dropApi.status(`You join as ${c.name} as soon as the game is found.`);
  }
  function dropRefused(why) {
    if (!dropApi || !dropApi.open) openDrop('play', b.st.host);
    dropApi.unlock();
    dropApi.status(b.WHY[why] || b.WHY.bad_hero, 'err');
  }
  function startWatching(sess, w) {
    b.st.sess = sess; b.st.role = 'guest'; watching = true; watchFollow = w.follow; b.st.host = w.host || 'your friend'; b.st.charId = null;
    ui.act.go('watch');
    if (dropApi && dropApi.open) dropApi.setHost(b.st.host);
    nui.setBar([
      { label: `Watching ${b.st.host}`, id: 'net-bar-room' },
      { label: 'Play', id: 'net-bar-play', cls: 'net-go', on: () => openDrop('play', b.st.host) },
      { label: 'Chat', id: 'net-bar-chat', on: () => b.openChat() },
      { label: 'Leave', id: 'net-bar-leave', cls: 'net-quiet', on: () => leaveWatch() },
    ]);
    if (dropChar) dropPlay(dropChar);   // picked a hero before the game was found
  }
  function leaveWatch() {
    const s = b.st.sess;
    const was = watching;
    if (was) { b.st.sess = null; b.st.role = null; watching = false; watchFollow = null; nui.setBar(null); nui.close(); }
    if (s && was) s.leave();
    else if (s && !b.st.role) s.close('left');
    dropChar = null; dropGen++;
    ui.act.go(ui.store.list().length ? 'select' : 'title');
  }

  /** A watcher's game ended (the host left or the link dropped): back to the hero list. True when it was a watcher. */
  function ended(text) {
    if (!watching) return false;
    watching = false; watchFollow = null; dropChar = null;
    nui.close(); ui.act.go(ui.store.list().length ? 'select' : 'title');
    nui.message('The game ended', text);
    return true;
  }
  /** The host's welcome with a hero id: a watcher becomes a player. The hero it picked (or null: not a watcher). */
  function playerWelcome() {
    if (!watching) return null;
    watching = false; watchFollow = null;
    if (dropApi) dropApi.close();
    return dropChar;
  }
  return {
    dropIn, invite, inviteBlock, shareInvite, startWatching, leaveWatch, playerWelcome, ended,
    refused: (why) => dropRefused(why),
    get watching() { return watching; },
    get follow() { return watching ? watchFollow : null; },
  };
}

// Phone as a second screen (wave 9 second lane; docs/NET.md "Phone as a second screen"; brief and stills:
// D:/LQOnline/wave9/second/BRIEF.md, approved by Scott 2026-11-25). A player pairs their own phone to their own PC game;
// the phone shows that hero's map, bags, quests and chat while the PC keeps the world. Pure, no DOM (node tests run it):
// the glue (rooms, panels, the UI) is src/net/second_coop.js, the drawing src/ui/second_ui.js.
//
//   pairLink(loc, code, key)   -> 'https://site/path/#pair=ABCDE.KEY'   room code + a one-use pair key, after the #
//   readPair(loc)              -> { code, key } | null          clearPair(win): drop the #pair from the address bar
//   newPairKey(pick)           -> 16 letters from the room-code alphabet (about 79 bits, WebCrypto)
//   phoneCommandOk(c)          the sim commands a phone may send for the hero (Scott: equip, use, sort, the bar; nothing else)
//   createPairDesk({ now })    the PC: one key (2 min, one use), a hello -> 'ask' | 'resume' | 'no', allow, unpair
//   createSecondHost(...)      the PC end of one phone link: hello, Allow, frames at 5 a second, commands, chat
//   createSecondPhone(...)     the phone end: hello, the PC's frames into snapshots, commands and asks back
//
// What goes where:
//   - the MQTT brokers see only what any room code sends today: the SHA-256 topic of the room code and the offer /
//     answer encrypted with it (transport.js). The pair key is NEVER sent there.
//   - the pair key travels in the link (QR code or typed), then once over the WebRTC data channel (DTLS) in the phone's
//     hello. The PC compares it and asks the player to press Allow. Used or 2 minutes old, it is dead.
//   - after Allow the phone gets a resume token (memory only on the PC, the phone's tab only) so a phone that slept can
//     come back without a new code while the PC game is open. Closing the PC game kills it.
//   - the phone never adds a hero: the world, the party, saves and replays are exactly as without it.
//
// Phone -> PC   { t:'hello', proto, build, pair } | { t:'hello', proto, build, resume }
//               { t:'cmd', c:[cmd...] }   only phoneCommandOk ones are used
//               { t:'ui', nav, untracked:[quest ids] }   the PC's quest arrow and tracker (never the world)
//               { t:'chat', text }   a party line, said by the PC's hero (co-op only)   { t:'ping', at }  { t:'bye' }
// PC -> phone   { t:'ask' }   waiting for Allow on the PC
//               { t:'welcome', second:1, id, host, token, nav, untracked, coop }   id: the hero; host: its name
//               { t:'f', ... }  frames.js frames for the hero, 5 a second   { t:'line', ch, text, talk? }  a chat line
//               { t:'coop', on }  friends came or went   { t:'pong', at }   { t:'refuse', reason:'pair'|'version' }
//               { t:'bye', reason:'unpaired'|'host_left' }
import { framesFor, createTickCache, createFrameState, applyFrame } from './frames.js';
import { PROTO, cleanChat } from './session.js';

export const PAIR_KEY = 'pair';
export const PAIR_TTL_MS = 120000;           // a pairing code lives 2 minutes
export const PHONE_EVERY = 4;                // a frame to the phone every 4 ticks: 5 a second (the sim stays at 20 Hz)
export const PHONE_VIEW_PX = 160;            // foes the phone gets: only those beside the hero (the map draws npcs)
const PHONE_SILENT_MS = 45000;               // a phone that sends nothing this long is dropped (resume brings it back)
const PC_SILENT_MS = 8000;                   // the PC sends a frame 5 times a second; this long without one is a lost PC
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // the room-code alphabet (transport.js CODE_ABC): no I L O 0 1
const now0 = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const clean = (s, n) => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n);
const valid = (s, n) => s.length === n && [...s].every((ch) => ABC.includes(ch));

function cryptoPick(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);       // the page and node both have WebCrypto; never Math.random
  return a[0] % n;
}
export function newPairKey(pick = cryptoPick) {
  let k = '';
  for (let i = 0; i < 16; i++) k += ABC[pick(ABC.length)];
  return k;
}

export function pairLink(loc, code, key) {
  const c = clean(code, 5), k = clean(key, 16);
  if (!valid(c, 5) || !valid(k, 16)) return null;
  const q = new URLSearchParams(loc.search || ''), keep = new URLSearchParams();
  for (const name of ['net', 'stun']) if (q.has(name)) keep.set(name, q.get(name));   // test signalling only, nothing personal
  const qs = keep.toString();
  return `${loc.origin}${loc.pathname}${qs ? `?${qs}` : ''}#${PAIR_KEY}=${c}.${k}`;
}

export function readPair(loc) {
  const h = String((loc && loc.hash) || '').replace(/^#/, '');
  const m = new RegExp(`(?:^|&)${PAIR_KEY}=([^&]*)`).exec(h);
  if (!m) return null;
  let raw = m[1];
  try { raw = decodeURIComponent(raw); } catch { /* keep as is */ }
  const [a, b] = raw.split('.');
  const code = clean(a, 5), key = clean(b, 16);
  return valid(code, 5) && valid(key, 16) ? { code, key } : null;
}

export function clearPair(win = globalThis.window) {
  try {
    if (!win || !readPair(win.location)) return;
    win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}`);
  } catch { /* an old browser keeps the #; a reload then asks again and the spent key is refused (harmless) */ }
}

/** Same-length compare that does not stop at the first difference. */
export function sameKey(a, b) {
  const x = String(a || ''), y = String(b || '');
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0 && x.length > 0;
}

// What the phone may ask the hero to do (Scott 2026-11-25: equip, use, sort, track and share quests, arrange the bar and
// chat; nothing else). Tracking is a screen ask (PHONE_UI), chat its own message. Moving, casting, targeting, npcs,
// buying and selling, the Lantern Chest, trade, talents, professions, mounts, word doors and abandoning a quest stay on
// the PC, where the player sees the world.
const PHONE_CMDS = new Set(['equip', 'unequip', 'use_item', 'bag', 'quest_share', 'bar_set']);
export function phoneCommandOk(c) {
  return !!(c && typeof c === 'object' && !Array.isArray(c) && typeof c.t === 'string' && PHONE_CMDS.has(c.t));
}

/**
 * The PC side of pairing. One phone at a time. Clock passed in so node tests can run it.
 *   offer()  a fresh key (the old one dies): { key, until }       offered: { key, until, left } | null
 *   hello(m) a phone's hello: 'ask' (a fresh key: ask the player), 'resume' (its token), 'no' (wrong, used, old, busy)
 *   allow()  the player pressed Allow: { token }      refuse(): the key stays spent      unpair(): the token dies
 */
export function createPairDesk({ now = () => Date.now(), pick = cryptoPick } = {}) {
  let key = null, until = 0, asking = false, token = null;
  return {
    offer() { key = newPairKey(pick); until = now() + PAIR_TTL_MS; asking = false; return { key, until }; },
    get offered() { return key && now() < until ? { key, until, left: Math.max(0, until - now()) } : null; },
    get paired() { return !!token; },
    get asking() { return asking; },
    hello(m) {
      if (!m || typeof m !== 'object') return 'no';
      if (m.resume && token && sameKey(m.resume, token)) return 'resume';
      if (token || asking) return 'no';                        // one phone; a second ask waits for the first answer
      if (!key || now() >= until || !sameKey(m.pair, key)) return 'no';
      key = null; asking = true;                               // one use: spent the moment it is shown
      return 'ask';
    },
    allow() { if (!asking) return null; asking = false; token = newPairKey(pick); return { token }; },
    refuse() { asking = false; },
    unpair() { token = null; asking = false; key = null; },
  };
}

/**
 * The PC end of the phone link. desk: createPairDesk. hero() -> { id, name } | null (this PC's hero now).
 * on: { ask(answer(yes)), paired(), gone(why), cmd(c), ui(nav, untracked), chat(text) }. state() -> { nav, untracked, coop }.
 * frame(snap, events): every tick (sends every PHONE_EVERY ticks, events kept in between). line(l): a chat line.
 */
export function createSecondHost({ desk, hero, state = () => ({}), build = null, on = {}, now = now0 }) {
  let link = null, tx = null, pend = [], n = 0, seen = 0, heroId = null;
  const send = (m) => { if (link) link.send(m); };
  function drop(why) {
    const l = link;
    link = null; tx = null; pend = [];
    if (l) l.close(why);
    if (on.gone) on.gone(why);
  }
  function welcome(token) {
    const h = hero();
    if (!h) { send({ t: 'refuse', reason: 'pair' }); drop('nohero'); return; }
    heroId = h.id;
    tx = framesFor(h.id, { viewPx: PHONE_VIEW_PX });
    const s = state() || {};
    send({ t: 'welcome', second: 1, id: h.id, host: h.name, token, nav: s.nav || null, untracked: s.untracked || [], coop: !!s.coop, proto: PROTO });
    n = 0;
    if (on.paired) on.paired();
  }
  function onMessage(l, m) {
    if (!m || typeof m.t !== 'string') return;
    if (l !== link) {
      // a new link: only a hello, and only one phone at a time (a resume replaces a dead one)
      if (m.t !== 'hello') return;
      const refuse = (reason) => { l.send({ t: 'refuse', reason }); setTimeout(() => l.close('refused'), 500); };
      if (m.proto !== PROTO || (build && m.build && m.build !== build)) return refuse('version');
      const r = desk.hello(m);
      if (r === 'no') return refuse('pair');
      if (link) drop('replaced');
      link = l; seen = now();
      if (r === 'resume') { welcome(m.resume); return; }
      l.send({ t: 'ask' });
      if (on.ask) on.ask((yes) => {
        if (link !== l) return;
        if (!yes) { desk.refuse(); l.send({ t: 'refuse', reason: 'pair' }); link = null; setTimeout(() => l.close('refused'), 500); if (on.gone) on.gone('refused'); return; }
        const a = desk.allow();
        if (a) welcome(a.token);
      });
      return;
    }
    seen = now();
    if (m.t === 'ping') { send({ t: 'pong', at: m.at }); return; }
    if (!tx) return;                                        // nothing else before Allow
    if (m.t === 'cmd') { for (const c of (Array.isArray(m.c) ? m.c.slice(0, 32) : [])) if (phoneCommandOk(c) && on.cmd) on.cmd(c); }
    else if (m.t === 'ui') {
      const nav = typeof m.nav === 'string' ? m.nav.slice(0, 64) : null;
      const un = Array.isArray(m.untracked) ? m.untracked.filter((x) => typeof x === 'string').slice(0, 64) : [];
      if (on.ui) on.ui(nav, un);
    } else if (m.t === 'chat') { const t = cleanChat(m.text); if (t && on.chat) on.chat(t); }
    else if (m.t === 'bye') { desk.unpair(); send({ t: 'bye', reason: 'unpaired' }); setTimeout(() => drop('unpaired'), 300); }
  }
  return {
    get connected() { return !!tx; },
    get waiting() { return !!link && !tx; },
    addLink(l) {
      l.on('message', (m) => onMessage(l, m));
      l.on('close', () => { if (link === l) { link = null; tx = null; pend = []; if (desk.asking) desk.refuse(); if (on.gone) on.gone('closed'); } });
      setTimeout(() => { if (link !== l && l.open) l.close('no_hello'); }, 10000);
    },
    /** After each tick: frames to the phone (the hero changed: a new welcome), and drop a silent phone. */
    frame(snap, events = []) {
      if (!tx || !snap) return;
      if (now() - seen > PHONE_SILENT_MS) { drop('timeout'); return; }
      const h = hero();
      if (!h) { send({ t: 'bye', reason: 'host_left' }); desk.unpair(); drop('nohero'); return; }
      if (h.id !== heroId) { welcome(null); return; }
      for (const e of events) pend.push(e);
      if (pend.length > 300) pend = pend.slice(-300);
      if (++n % PHONE_EVERY !== 0) return;
      send(tx.frame(snap, pend, createTickCache()));
      pend = [];
    },
    line(l) { if (tx) send({ t: 'line', ch: l.ch, text: l.text, ...(l.talk ? { talk: l.talk } : {}) }); },
    coop(onNow) { if (tx) send({ t: 'coop', on: !!onNow }); },
    /** Unpair from the PC (the chip) or the game ending: the phone is told, the token dies. */
    unpair(reason = 'unpaired') { desk.unpair(); if (link) { const l = link; send({ t: 'bye', reason }); link = null; tx = null; const t = setTimeout(() => { if (l && l.close) l.close(reason); }, 300); if (t && t.unref) t.unref(); if (on.gone) on.gone(reason); } },   // l taken before send: a send can close the link
  };
}

/**
 * The phone end. pair: { key } or { resume }. on: { ask(), welcome(w), line(l), coop(on), end(reason) }.
 * The game loop takes the newest frame (nextFrame), as a guest does.
 */
export function createSecondPhone({ link, pair, build = null, on = {}, now = now0 }) {
  let fs = null, welcome = null, ended = false, last = now(), lastUi = '';
  const queue = [];
  const end = (reason) => { if (ended) return; ended = true; clearInterval(beat); link.close(reason); if (on.end) on.end(reason); };
  link.on('message', (m) => {
    if (ended || !m) return;
    last = now();
    switch (m.t) {
      case 'ask': if (on.ask) on.ask(); break;
      case 'welcome': welcome = m; fs = createFrameState(m.id); queue.length = 0; if (on.welcome) on.welcome(m); break;
      case 'f': {
        if (!fs) break;
        const snap = applyFrame(fs, m);
        queue.push({ snap, events: m.e || [] });
        if (queue.length > 50) { const old = queue.shift(); queue[0].events = old.events.concat(queue[0].events).slice(-300); }
        break;
      }
      case 'line': if (on.line && typeof m.text === 'string') on.line(m); break;
      case 'coop': if (welcome) welcome.coop = !!m.on; if (on.coop) on.coop(!!m.on); break;
      case 'refuse': end(m.reason || 'pair'); break;
      case 'bye': end(m.reason || 'unpaired'); break;
      default: break;
    }
  });
  link.on('close', () => end(ended ? 'closed' : 'lost'));
  const beat = setInterval(() => {
    if (ended) return;
    if (welcome && now() - last > PC_SILENT_MS) { end('lost'); return; }
    link.send({ t: 'ping', at: now() });
  }, 2000);
  link.send({ t: 'hello', proto: PROTO, build, ...(pair.resume ? { resume: pair.resume } : { pair: pair.key }) });
  return {
    get welcome() { return welcome; },
    get id() { return welcome ? welcome.id : null; },
    get ended() { return ended; },
    nextFrame() {
      if (!queue.length) return null;
      const taken = queue.splice(0, queue.length);
      return { snap: taken[taken.length - 1].snap, events: taken.flatMap((f) => f.events).slice(-300) };
    },
    sendCmds(cmds) {
      const ok = (cmds || []).filter(phoneCommandOk);
      if (!ended && welcome && ok.length) link.send({ t: 'cmd', c: ok });
    },
    /** The phone's selected quest and hidden tracker rows: sent when they change. */
    syncUi(nav, untracked) {
      const s = JSON.stringify([nav || null, [...(untracked || [])].sort()]);
      if (ended || !welcome || s === lastUi) return;
      lastUi = s;
      link.send({ t: 'ui', nav: nav || null, untracked: [...(untracked || [])] });
    },
    chat(text) { const t = cleanChat(text); if (t && !ended && welcome) link.send({ t: 'chat', text: t }); return t; },
    leave() { if (ended) return; link.send({ t: 'bye' }); setTimeout(() => end('unpaired'), 500); },
    close(reason = 'left') { end(reason); },
  };
}

// ---------------------------------------------------------------- player-facing words (ALL DRAFTS for Scott)
export const WORDS = {
  optionsButton: 'Use my phone',
  panelTitle: 'Use your phone as a second screen',
  panelLead: "Scan this with your phone's camera. Your phone shows your map, bags, quests and chat while you play here.",
  steps: ["Open your phone's camera.", 'Point it at this square and tap the link.', 'Press Allow here.'],
  panelOr: 'Or open this link on your phone:',
  panelSafe: 'For your own phone only. The code works once, for 2 minutes, and you press Allow here first.',
  panelLeft: (s) => `Code ends in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  panelOld: 'This code has ended. Press New code.',
  panelOpening: 'Opening a room for your phone...',
  panelFailed: 'Could not reach the free room-code service. Try New code in a moment.',
  panelPaired: 'Your phone is paired.',
  newCode: 'New code', copyLink: 'Copy link', close: 'Close',
  askTitle: 'A phone wants to pair',
  askBody: (hero) => `It will show ${hero}'s map, bags, quests and chat. Only allow your own phone.`,
  allow: 'Allow', no: 'No',
  pairedToast: 'Your phone is paired.',
  goneToast: 'Your phone is no longer paired.',
  chip: 'Phone', unpair: 'Unpair phone',
  phoneTitle: 'Lexicon Realms',
  phoneConnecting: 'Finding your PC...',
  phoneAsk: 'Press Allow on your PC.',
  phoneRail: 'PC',
  tabs: ['Map', 'Bags', 'Quests', 'Chat'],
  phoneUnpair: 'Unpair',
  notNow: 'Not now',
  type: 'Type', party: 'Party',
  mapHint: "Tap a quest to point your PC's arrow at it.",
  bagsHint: 'Equip, use and sort here. Selling and the chest stay on the PC.',
  questsHint: 'Pick a quest to point your PC at it. Abandoning stays on the PC.',
  chatSolo: 'Just you for now. Your log is here; chat opens when friends join.',
  ended: {
    pair: 'This pairing code has ended. On your PC: Options, Use my phone, New code.',
    version: 'Your phone and your PC have different versions of the game. Reload both, then pair again.',
    unpaired: 'Unpaired. Your hero stays on your PC.',
    host_left: 'Your PC closed the game. Your hero is saved there.',
    lost: 'Lost your PC. Open the link again from your PC to pair again.',
    no_room: 'Could not find your PC. Check it still shows the code, then scan it again.',
  },
};

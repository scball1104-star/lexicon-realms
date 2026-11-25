// Online co-op sessions (docs/NET.md): the host runs the one world; guests send commands and play back frames.
// No DOM here (timers only), so the protocol reads top to bottom.
//
// Guest -> host   { t:'hello', proto, build, hero }    hero: the guest's stored character (name, cls, look, state)
//                 { t:'hello', proto, build, watch:1 }  a watcher (drop-in spectate): no hero, the view follows the host
//                 { t:'play', hero }                    a watcher picks a hero and joins as a player
//                 { t:'cmd', c:[cmd...], s }           the same command objects local input makes; s = sequence number
//                 { t:'chat', text, to? }  { t:'ping', at }  { t:'bye' }   to: a hero id (a whisper; wave 8 talk)
//                 { t:'notes', list }                 wave 9 notes: this hero's own lantern notes (src/net/notes.js)
// Host -> guest   { t:'welcome', id, host, room, party, proto }
//                 { t:'welcome', watch:1, id:null, follow, host, room, party, proto }   a watcher; follow = the host's hero
//                 { t:'nope', reason }                 a watcher's play was refused (full | bad_hero); it keeps watching
//                 { t:'f', ... }                       a frame (src/net/frames.js), every host tick; a = last cmd s applied
//                 { t:'save', hero, final? }           the guest's hero as a save (every 5 s when it changed, and on leave)
//                 { t:'chat', from, text, fid?, w?, to? }  { t:'sys', text }  { t:'pong', at }   fid: the speaker's hero id;
//                                                      w:1 a whisper (to: on the sender's own copy) (wave 8 talk)
//                 { t:'talk', watch }                  wave 8 talk: watchers may talk (1) or only read (0)
//                 { t:'notes', from, list }            wave 9 notes: a friend's own notes (from: their hero name)
//                 { t:'refuse', reason }               full | version | bad_hero | removed | locked (wave 8 talk)
//                 { t:'bye', reason }                  host_left | left | kicked
import { framesFor, createTickCache, createFrameState, applyFrame } from './frames.js';
import { createFlood } from './talk.js';   // wave 8 talk: the host's flood guard (docs/NET.md "Talk")

export const PROTO = 1;
export const MAX_PLAYERS = 4;          // the host plus three friends (DESIGN: "start up to 4")
export const MAX_WATCHERS = 4;         // drop-in watchers (no hero; a frame costs about what a friend's does)
export const WATCHER_NAME = 'A watcher';   // draft: a watcher's chat name (they have no hero yet)
const SAVE_EVERY_TICKS = 100;          // 5 s
const GUEST_SILENT_MS = 45000;         // a guest who sends nothing (not even a ping) this long is dropped
const HOST_SILENT_MS = 8000;           // the host sends a frame every tick; this long without one is a lost host
const CHAT_MAX = 140;
const CMD_MAX = 32;                    // commands per message (input makes a handful per tick)
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const cleanChat = (t) => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, CHAT_MAX);

/** Commands a guest may send. Everything goes through the sim's own checks; this only keeps a guest out of the host's
 *  device-wide Shared chest tab (chest_move always touches it). */
export function guestCommandOk(c) {
  if (!c || typeof c !== 'object' || typeof c.t !== 'string') return false;
  if (c.t === 'chest_move') return false;
  if (c.t.startsWith('chest_') && c.tab === 'shared') return false;
  return true;
}

/**
 * The host side. world: the sim. hostId: the host's hero. party: the room's party id.
 * spawnGuest(hero) -> addPlayer spec (sanitised, placed beside the host) or null. saveOf(id) -> the hero as a save.
 * on: { join(g), leave(g, reason), chat(from, text, meta), commandLogged(id, cmd), joinLogged(tick, spec) }
 * meta (wave 8 talk): { fid, w }. The host's game shows party lines and whispers to the host; a whisper between two
 * guests passes through the host's tab, but on.chat is not called for it.
 */
export function createHostSession({ world, hostId, hostName, party, room, build = null, spawnGuest, saveOf, on = {} }) {
  const guests = new Set();              // every link, joined or not: { link, pid, name, frames, cmds, seen, ack, saveStr }
  let closed = false;
  // wave 8 talk: watchers read only until the host lets them talk; a locked game takes no one new; a removed hero's name
  // is refused until the host ends the game; at most FLOOD_LINES lines per FLOOD_MS from each guest
  let watchTalk = false, locked = false;
  const banned = new Set(), flood = createFlood();
  const byPid = () => [...guests].filter((g) => g.pid != null);
  const watchers = () => [...guests].filter((g) => g.watch);
  const live = () => [...guests].filter((g) => g.pid != null || g.watch);   // everyone who gets frames, chat and sys lines
  const sendAll = (msg, except = null) => { for (const g of live()) if (g !== except) g.link.send(msg); };

  function sendSave(g, final = false) {
    if (g.pid == null) return;
    const hero = saveOf(g.pid);
    if (!hero) return;
    const s = JSON.stringify(hero);
    if (!final && s === g.saveStr) return;
    g.saveStr = s;
    g.link.send({ t: 'save', hero, ...(final ? { final: true } : {}) });
  }
  function removeGuest(g, reason) {
    if (!guests.has(g)) return;
    guests.delete(g);
    if (g.watch && on.unwatch) on.unwatch(g, reason);
    if (g.pid != null) {
      world.removePlayer(g.pid);
      sendAll({ t: 'sys', text: reason === 'kicked' ? `${g.name} was removed by the host.` : `${g.name} left.` });   // drafts
      if (on.leave) on.leave(g, reason);
    }
  }
  /** A hero into the world beside the host: { pid } or { reason } (full | bad_hero). */
  function spawn(g, hero) {
    if (byPid().length >= MAX_PLAYERS - 1) return { reason: 'full' };
    if (locked) return { reason: 'locked' };                                                       // wave 8 talk
    if (hero && banned.has(String(hero.name || '').trim().toLowerCase())) return { reason: 'removed' };
    let pid = null;
    let spec = null;
    try { spec = spawnGuest(hero); if (spec) { spec = { ...spec, party }; pid = world.addPlayer(spec); } } catch (e) { pid = null; }
    if (pid == null) return { reason: 'bad_hero' };
    if (on.joinLogged) on.joinLogged(world.tick, spec);      // the replay log's addPlayer call (CONTRACTS 2.3)
    g.pid = pid;
    g.watch = false;
    g.name = (world.get(pid) || {}).name || 'Friend';
    g.frames = framesFor(pid);
    g.link.send({ t: 'welcome', id: pid, host: hostName, room, party, proto: PROTO });
    sendSave(g);
    sendAll({ t: 'sys', text: `${g.name} joined.` }, g);
    notesWelcome(g);   // wave 9 notes
    if (on.join) on.join(g);
    return { pid };
  }
  function onMessage(g, m) {
    if (closed || !m || typeof m.t !== 'string') return;
    g.seen = now();
    if (m.t === 'ping') { g.link.send({ t: 'pong', at: m.at }); return; }
    if (m.t === 'hello') {
      if (g.pid != null) return;
      const refuse = (reason) => { g.link.send({ t: 'refuse', reason }); setTimeout(() => g.link.close('refused'), 500); guests.delete(g); };
      if (m.proto !== PROTO || (build && m.build && m.build !== build)) return refuse('version');
      if (g.watch) return;
      if (locked) return refuse('locked');   // wave 8 talk: a locked game takes no one new
      if (m.watch) {
        // drop-in: watch first (no hero), pick a hero later with { t:'play' }
        if (watchers().length >= MAX_WATCHERS) return refuse('full');
        g.watch = true; g.name = WATCHER_NAME;
        g.frames = framesFor(null, { follow: hostId });
        g.link.send({ t: 'welcome', watch: 1, id: null, follow: hostId, host: hostName, room, party, proto: PROTO, talk: watchTalk ? 1 : 0 });
        if (on.watch) on.watch(g);
        return;
      }
      const r = spawn(g, m.hero);
      if (r.reason) return refuse(r.reason);
      return;
    }
    if (g.watch) {
      // a watcher: may pick a hero, chat, or leave; nothing else (it has no hero for commands to move)
      if (m.t === 'play') {
        const r = spawn(g, m.hero);
        if (r.reason) g.link.send({ t: 'nope', reason: r.reason });
        else if (on.unwatch) on.unwatch(g, 'play');
      } else if (m.t === 'chat') {
        if (watchTalk) heard(g, m, null);      // wave 8 talk: read only until the host lets watchers talk (dropped)
      } else if (m.t === 'bye') {
        g.link.send({ t: 'bye', reason: 'left' });
        removeGuest(g, 'left');
        setTimeout(() => g.link.close('left'), 1500);
      }
      return;
    }
    if (g.pid == null) return;
    if (m.t === 'cmd') {
      const list = Array.isArray(m.c) ? m.c.slice(0, CMD_MAX) : [];
      for (const c of list) if (guestCommandOk(c)) g.cmds.push(c);
      if (Number.isFinite(m.s)) g.ack = m.s;
    } else if (m.t === 'chat') {
      heard(g, m, g.pid);
    } else if (m.t === 'notes') { notesIn(g, m);   // wave 9 notes
    } else if (m.t === 'bye') {
      sendSave(g, true);
      g.link.send({ t: 'bye', reason: 'left' });
      removeGuest(g, 'left');
      setTimeout(() => g.link.close('left'), 1500);
    }
  }

  /** wave 8 talk: a guest's line: party to everyone, or a whisper to one hero (plus its echo to the sender). */
  function heard(g, m, fid) {
    const text = cleanChat(m.text);
    if (!text) return;
    const f = flood.ok(g, now());
    if (f === 'warn') { g.link.send({ t: 'sys', text: 'Slow down: wait a moment before your next line.' }); return; }   // draft
    if (!f) return;
    if (m.to != null && fid != null) {
      if (m.to === hostId) {
        g.link.send({ t: 'chat', from: g.name, text, fid, w: 1, to: hostName });
        if (on.chat) on.chat(g.name, text, { fid, w: 1 });
        return;
      }
      const t = byPid().find((x) => x.pid === m.to);
      if (!t || t === g) return;
      t.link.send({ t: 'chat', from: g.name, text, fid, w: 1 });
      g.link.send({ t: 'chat', from: g.name, text, fid, w: 1, to: t.name });
      return;
    }
    sendAll({ t: 'chat', from: g.name, text, ...(fid != null ? { fid } : {}) });
    if (on.chat) on.chat(g.name, text, { fid });
  }

  // wave 9 notes: the swap when friends play together (src/ui/notes_wire.js). A player's game sends its own hero's notes;
  // the host keeps the newest list per guest, passes it on to the other players and its own game (on.notes), and gives
  // a newcomer its own (on.notesMine) and everyone's. Watchers get none. Each side checks every word on arrival.
  function notesIn(g, m) {
    if (!Array.isArray(m.list) || (g.notesN = (g.notesN || 0) + 1) > 10) return;
    g.notes = m.list.slice(0, 20);
    for (const o of byPid()) if (o !== g) o.link.send({ t: 'notes', from: g.name, list: g.notes });
    if (on.notes) on.notes(g.name, g.notes);
  }
  function notesWelcome(g) {
    if (on.notesMet) on.notesMet(g.name);
    const mine = on.notesMine ? on.notesMine() : [];
    if (mine.length) g.link.send({ t: 'notes', from: hostName, list: mine.slice(0, 20) });
    for (const o of byPid()) if (o !== g && o.notes && o.notes.length) g.link.send({ t: 'notes', from: o.name, list: o.notes });
  }
  return {
    get guests() { return byPid().map((g) => ({ id: g.pid, name: g.name, stats: g.link.stats, buffered: g.link.buffered })); },
    get count() { return 1 + byPid().length; },
    notes(list) { if (Array.isArray(list)) for (const g of byPid()) g.link.send({ t: 'notes', from: hostName, list: list.slice(0, 20) }); },   // wave 9 notes: the host's own notes
    /** Drop-in watchers (no hero). */
    get watching() { return watchers().length; },
    get watcherStats() { return watchers().map((g) => ({ stats: g.link.stats, buffered: g.link.buffered })); },
    get room() { return room; },
    /** A friend's data channel opened (by room code or by copy-paste). They have 10 s to say hello. */
    addLink(link) {
      if (closed) { link.close('closed'); return; }
      const g = { link, pid: null, watch: false, name: 'Friend', frames: null, cmds: [], seen: now(), ack: 0, saveStr: null };
      guests.add(g);
      link.on('message', (m) => onMessage(g, m));
      link.on('close', (why) => removeGuest(g, why || 'closed'));
      setTimeout(() => { if (g.pid == null && !g.watch && guests.has(g)) { guests.delete(g); link.close('no_hello'); } }, 10000);
    },
    /** Before world.step(): every guest's commands into the sim's queue (and the command log). */
    beforeStep() {
      for (const g of byPid()) {
        if (!g.cmds.length) continue;
        for (const c of g.cmds) { world.enqueue(g.pid, c); if (on.commandLogged) on.commandLogged(g.pid, c); }
        g.cmds = [];
      }
    },
    /** After world.step(): one frame per guest; saves every 5 s; drop the silent. */
    afterStep(events, snap) {
      if (closed) return;
      const cache = createTickCache();
      const t = now();
      for (const g of live()) {
        if (t - g.seen > GUEST_SILENT_MS) { g.link.close('timeout'); removeGuest(g, 'timeout'); continue; }
        const msg = g.frames.frame(snap, events, cache);
        msg.a = g.ack;
        g.link.send(msg);
        if (g.pid != null && snap.tick % SAVE_EVERY_TICKS === 0) sendSave(g);
      }
    },
    /** The host's own line: to everyone, or a whisper to one guest (to: their hero id). The cleaned text, or null. */
    chat(text, to = null) {
      const t = cleanChat(text);
      if (!t) return null;
      if (to != null) {
        const g = byPid().find((x) => x.pid === to);
        if (!g) return null;
        g.link.send({ t: 'chat', from: hostName, text: t, fid: hostId, w: 1 });
        return t;
      }
      sendAll({ t: 'chat', from: hostName, text: t, fid: hostId });
      return t;
    },
    /** wave 8 talk: may watchers talk? Every watcher is told, so its Chat button can say so. */
    get watchersTalk() { return watchTalk; },
    setWatchersTalk(on) { watchTalk = !!on; for (const g of watchers()) g.link.send({ t: 'talk', watch: watchTalk ? 1 : 0 }); },
    /** wave 8 talk: a locked game refuses new players and watchers (those already in stay). */
    get locked() { return locked; },
    setLocked(on) { locked = !!on; },
    /** wave 8 talk: remove a friend: their hero goes home saved, and that hero name is refused until the game ends. */
    kick(pid) {
      const g = byPid().find((x) => x.pid === pid);
      if (!g) return false;
      banned.add(String(g.name || '').trim().toLowerCase());
      sendSave(g, true);
      g.link.send({ t: 'bye', reason: 'kicked' });
      removeGuest(g, 'kicked');
      setTimeout(() => g.link.close('kicked'), 800);
      return true;
    },
    /** The host ends the game: every guest gets their hero as a final save, then a goodbye. */
    close(reason = 'host_left') {
      if (closed) return;
      for (const g of live()) { sendSave(g, true); g.link.send({ t: 'bye', reason }); }
      closed = true;
      for (const g of [...guests]) {
        const pid = g.pid;
        guests.delete(g);
        if (pid != null) world.removePlayer(pid);
        setTimeout(() => g.link.close(reason), 800);
      }
    },
    get closed() { return closed; },
  };
}

/**
 * The guest side. hero: the stored character sent in hello. on: { welcome(w), save(hero, final), chat(from, text),
 * sys(text), end(reason) }. Frames queue up as they arrive; the game loop takes one per tick (nextFrame).
 */
export function createGuestSession({ link, hero, build = null, watch: asWatcher = false, on = {} }) {
  const fs = createFrameState(null);
  const queue = [];
  const sentAt = new Map();               // cmd sequence -> when it was sent (input-to-ack timing)
  const stats = { rttMs: null, ackMs: [], frames: 0, dropped: 0 };
  let seq = 0, lastMsg = now(), welcome = null, lastSave = null, ended = false, leaving = null;
  const end = (reason) => {
    if (ended) return;
    ended = true;
    clearInterval(watch);
    if (leaving) { clearTimeout(leaving); leaving = null; }
    link.close(reason);
    if (on.end) on.end(reason);
  };
  link.on('message', (m) => {
    if (ended || !m) return;
    lastMsg = now();
    switch (m.t) {
      case 'welcome':
        // a watcher who picks a hero gets a second welcome: start the view again from the host's next (full) frame
        if (welcome) { fs.ents.clear(); fs.hud = null; fs.proj = []; queue.length = 0; }
        welcome = m; fs.me = m.id == null ? null : m.id; if (on.welcome) on.welcome(m); break;
      case 'nope': if (on.nope) on.nope(m.reason || 'full'); break;
      case 'f': {
        if (!welcome) break;
        const snap = applyFrame(fs, m);
        stats.frames++;
        if (m.a && sentAt.has(m.a)) { const t0 = sentAt.get(m.a); for (const k of [...sentAt.keys()]) if (k <= m.a) sentAt.delete(k); stats.ackMs.push(lastMsg - t0); if (stats.ackMs.length > 200) stats.ackMs.shift(); }
        queue.push({ snap, events: m.e || [] });
        // a tab in the background plays nothing back: fold the oldest frames together (their events stay)
        if (queue.length > 200) { const old = queue.shift(); queue[0].events = old.events.concat(queue[0].events).slice(-300); }
        break;
      }
      case 'save': lastSave = m.hero; if (on.save) on.save(m.hero, !!m.final); if (m.final && leaving) end('left'); break;
      case 'chat': if (on.chat) on.chat(m.from, m.text, { fid: m.fid, w: m.w, to: m.to }); break;
      case 'talk': if (welcome) welcome.talk = m.watch ? 1 : 0; if (on.talk) on.talk(!!m.watch); break;   // wave 8 talk
      case 'notes': if (on.notes) on.notes(m.from, m.list); break;   // wave 9 notes: a friend's own notes (src/ui/notes_wire.js checks every word)
      case 'sys': if (on.sys) on.sys(m.text); break;
      case 'pong': stats.rttMs = Math.round(now() - m.at); break;
      case 'refuse': end(m.reason || 'refused'); break;
      case 'bye': if (m.reason !== 'left') end(m.reason || 'host_left'); break;
      default: break;
    }
  });
  link.on('close', (why) => end(leaving ? 'left' : why === 'timeout' ? 'timeout' : 'closed'));
  const watch = setInterval(() => {
    if (ended) return;
    if (now() - lastMsg > HOST_SILENT_MS) { end('timeout'); return; }
    link.send({ t: 'ping', at: now() });
  }, 2000);
  link.send(asWatcher ? { t: 'hello', proto: PROTO, build, watch: 1 } : { t: 'hello', proto: PROTO, build, hero });

  return {
    get welcome() { return welcome; },
    get id() { return welcome ? welcome.id : null; },
    /** A watcher (no hero yet): the host hero id the view follows. */
    get watching() { return !!(welcome && welcome.watch); },
    get follow() { return welcome && welcome.watch ? welcome.follow : null; },
    /** A watcher picks a hero: the host answers with a welcome (in) or a nope (full, bad hero; still watching). */
    play(h) { if (!ended && welcome && welcome.watch) link.send({ t: 'play', hero: h }); },
    get lastSave() { return lastSave; },
    get ended() { return ended; },
    get stats() { return { ...stats, link: link.stats, queued: queue.length }; },
    sendCmds(cmds) {
      if (ended || !welcome || !cmds.length) return;
      seq++;
      sentAt.set(seq, now());
      link.send({ t: 'cmd', c: cmds, s: seq });
    },
    /** A line to the party, or a whisper (to: a hero id; the host passes it on). */
    chat(text, to = null) { const t = cleanChat(text); if (t && !ended) link.send(to != null ? { t: 'chat', text: t, to } : { t: 'chat', text: t }); return t; },
    notes(list) { if (!ended && welcome && !welcome.watch && Array.isArray(list)) link.send({ t: 'notes', list: list.slice(0, 20) }); },   // wave 9 notes: this hero's own notes
    /** wave 8 talk: may this tab talk? (players always; a watcher once the host lets watchers talk) */
    get canTalk() { return !!(welcome && (!welcome.watch || welcome.talk)); },
    /**
     * The next frame for the game loop's tick, or null (hold the last one). Normally one per tick; two or more behind (a
     * slow frame, a tab that was in the background) it jumps to the newest and keeps every event on the way, so the
     * delay from a key press to the hero moving stays near one round trip.
     */
    nextFrame() {
      if (!queue.length) return null;
      const n = queue.length > 2 ? queue.length : 1;
      const taken = queue.splice(0, n);
      if (n > 1) stats.dropped += n - 1;
      const events = taken.length === 1 ? taken[0].events : taken.flatMap((f) => f.events).slice(-300);
      return { snap: taken[taken.length - 1].snap, events };
    },
    /** Leave: ask the host for the hero's final save; give up waiting after 3 s (the last 5 s save stands). */
    leave() {
      if (ended || leaving) return;
      link.send({ t: 'bye' });
      leaving = setTimeout(() => end('left'), 3000);
    },
    close(reason = 'left') { end(reason); },
  };
}

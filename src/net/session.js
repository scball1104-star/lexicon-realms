// Online co-op sessions (docs/NET.md): the host runs the one world; guests send commands and play back frames.
// No DOM here (timers only), so the protocol reads top to bottom.
//
// Guest -> host   { t:'hello', proto, build, hero }    hero: the guest's stored character (name, cls, look, state)
//                 { t:'cmd', c:[cmd...], s }           the same command objects local input makes; s = sequence number
//                 { t:'chat', text }  { t:'ping', at }  { t:'bye' }
// Host -> guest   { t:'welcome', id, host, room, party, proto }
//                 { t:'f', ... }                       a frame (src/net/frames.js), every host tick; a = last cmd s applied
//                 { t:'save', hero, final? }           the guest's hero as a save (every 5 s when it changed, and on leave)
//                 { t:'chat', from, text }  { t:'sys', text }  { t:'pong', at }
//                 { t:'refuse', reason }               full | version | bad_hero
//                 { t:'bye', reason }                  host_left | left | kicked
import { framesFor, createTickCache, createFrameState, applyFrame } from './frames.js';

export const PROTO = 1;
export const MAX_PLAYERS = 4;          // the host plus three friends (DESIGN: "start up to 4")
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
 * on: { join(g), leave(g, reason), chat(from, text), commandLogged(id, cmd), joinLogged(tick, spec) }
 */
export function createHostSession({ world, hostId, hostName, party, room, build = null, spawnGuest, saveOf, on = {} }) {
  const guests = new Set();              // every link, joined or not: { link, pid, name, frames, cmds, seen, ack, saveStr }
  let closed = false;
  const byPid = () => [...guests].filter((g) => g.pid != null);
  const sendAll = (msg, except = null) => { for (const g of byPid()) if (g !== except) g.link.send(msg); };

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
    if (g.pid != null) {
      world.removePlayer(g.pid);
      sendAll({ t: 'sys', text: `${g.name} left.` });
      if (on.leave) on.leave(g, reason);
    }
  }
  function onMessage(g, m) {
    if (closed || !m || typeof m.t !== 'string') return;
    g.seen = now();
    if (m.t === 'ping') { g.link.send({ t: 'pong', at: m.at }); return; }
    if (m.t === 'hello') {
      if (g.pid != null) return;
      const refuse = (reason) => { g.link.send({ t: 'refuse', reason }); setTimeout(() => g.link.close('refused'), 500); guests.delete(g); };
      if (m.proto !== PROTO || (build && m.build && m.build !== build)) return refuse('version');
      if (byPid().length >= MAX_PLAYERS - 1) return refuse('full');
      let pid = null;
      let spec = null;
      try { spec = spawnGuest(m.hero); if (spec) { spec = { ...spec, party }; pid = world.addPlayer(spec); } } catch (e) { pid = null; }
      if (pid == null) return refuse('bad_hero');
      if (on.joinLogged) on.joinLogged(world.tick, spec);      // the replay log's addPlayer call (CONTRACTS 2.3)
      g.pid = pid;
      g.name = (world.get(pid) || {}).name || 'Friend';
      g.frames = framesFor(pid);
      g.link.send({ t: 'welcome', id: pid, host: hostName, room, party, proto: PROTO });
      sendSave(g);
      sendAll({ t: 'sys', text: `${g.name} joined.` }, g);
      if (on.join) on.join(g);
      return;
    }
    if (g.pid == null) return;
    if (m.t === 'cmd') {
      const list = Array.isArray(m.c) ? m.c.slice(0, CMD_MAX) : [];
      for (const c of list) if (guestCommandOk(c)) g.cmds.push(c);
      if (Number.isFinite(m.s)) g.ack = m.s;
    } else if (m.t === 'chat') {
      const text = cleanChat(m.text);
      if (!text) return;
      sendAll({ t: 'chat', from: g.name, text });
      if (on.chat) on.chat(g.name, text);
    } else if (m.t === 'bye') {
      sendSave(g, true);
      g.link.send({ t: 'bye', reason: 'left' });
      removeGuest(g, 'left');
      setTimeout(() => g.link.close('left'), 1500);
    }
  }

  return {
    get guests() { return byPid().map((g) => ({ id: g.pid, name: g.name, stats: g.link.stats, buffered: g.link.buffered })); },
    get count() { return 1 + byPid().length; },
    get room() { return room; },
    /** A friend's data channel opened (by room code or by copy-paste). They have 10 s to say hello. */
    addLink(link) {
      if (closed) { link.close('closed'); return; }
      const g = { link, pid: null, name: 'Friend', frames: null, cmds: [], seen: now(), ack: 0, saveStr: null };
      guests.add(g);
      link.on('message', (m) => onMessage(g, m));
      link.on('close', (why) => removeGuest(g, why || 'closed'));
      setTimeout(() => { if (g.pid == null && guests.has(g)) { guests.delete(g); link.close('no_hello'); } }, 10000);
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
      for (const g of byPid()) {
        if (t - g.seen > GUEST_SILENT_MS) { g.link.close('timeout'); removeGuest(g, 'timeout'); continue; }
        const msg = g.frames.frame(snap, events, cache);
        msg.a = g.ack;
        g.link.send(msg);
        if (snap.tick % SAVE_EVERY_TICKS === 0) sendSave(g);
      }
    },
    chat(text) {
      const t = cleanChat(text);
      if (!t) return null;
      sendAll({ t: 'chat', from: hostName, text: t });
      return t;
    },
    /** The host ends the game: every guest gets their hero as a final save, then a goodbye. */
    close(reason = 'host_left') {
      if (closed) return;
      for (const g of byPid()) { sendSave(g, true); g.link.send({ t: 'bye', reason }); }
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
export function createGuestSession({ link, hero, build = null, on = {} }) {
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
      case 'welcome': welcome = m; fs.me = m.id; if (on.welcome) on.welcome(m); break;
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
      case 'chat': if (on.chat) on.chat(m.from, m.text); break;
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
  link.send({ t: 'hello', proto: PROTO, build, hero });

  return {
    get welcome() { return welcome; },
    get id() { return welcome ? welcome.id : null; },
    get lastSave() { return lastSave; },
    get ended() { return ended; },
    get stats() { return { ...stats, link: link.stats, queued: queue.length }; },
    sendCmds(cmds) {
      if (ended || !welcome || !cmds.length) return;
      seq++;
      sentAt.set(seq, now());
      link.send({ t: 'cmd', c: cmds, s: seq });
    },
    chat(text) { const t = cleanChat(text); if (t && !ended) link.send({ t: 'chat', text: t }); return t; },
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

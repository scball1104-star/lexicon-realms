// Talking with friends, the wiring (wave 8 talk lane, approved 2026-11-24): what a typed line means and who hears it,
// mute (this device only), the host's Remove from game and Lock the game, and watchers who read but only talk when the
// host lets them. coop.js makes one and calls it; the model is talk.js, the drawing src/ui/chat_ui.js, the protocol
// session.js. Everything goes peer to peer over the game's own data channel, never through a broker. No voice chat.
// History is the UI's in-memory log; nothing here is written to the device except the mute list. Words: DRAFTS.
//
//   const T = createTalk({ ui, nui, compact, st })   st: { role, host, guest, hostName, hostId, myId, snap, refresh() }
//   T.start(isHost)  T.stop()  T.heard(from, text, meta)  T.send(text)  T.openChat(prefill)  T.openTalk()
//   T.hostBlock(body)  T.watchButton()  T.watchTalkChanged(on)  T.mutes
import { parseLine, badText, createMutes, stamp, talkText, COMMANDS, WHISPER_NOTE, WATCH_READ_ONLY } from './talk.js';
import { emoteFromChat } from '../sim/emotes.js';   // wave 7 anim: /wave /cheer /sit /dance /jump

function deviceStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function createTalk({ ui, nui, compact = () => false, st, storage = deviceStorage() }) {
  const mutes = createMutes(storage);
  let lastWhisper = null, noted = false, myName = null;
  const chat = () => ui.chat || null;
  const sys = (text) => ui.say('system', text);

  /** Friends a whisper can go to: [{ id, name }] (not yourself, not watchers). */
  function names() {
    if (st.role === 'host' && st.host) return st.host.guests.map((g) => ({ id: g.id, name: g.name }));
    const snap = st.snap, me = st.myId;
    if (!snap || me == null) return [];
    const mine = snap.entities.find((e) => e.id === me);
    return snap.entities.filter((e) => e.kind === 'player' && e.id !== me && (!mine || mine.party == null || e.party === mine.party)).map((e) => ({ id: e.id, name: e.name }));
  }
  function line(t) {
    if (!t.out && t.from && mutes.has(t.from)) return;           // muted: their words never reach this screen
    t.at = stamp(new Date());
    ui.say('party', talkText(t), { talk: t });
    const c = chat();
    if (c && t.kind === 'party' && t.fid != null) c.bubble(t.fid, t.body);
    if (t.kind === 'whisper' && !t.out) lastWhisper = t.from;
  }
  /** A line that came in (host: from a guest; guest: from the host). meta: { fid, w, to } */
  function heard(from, text, meta = {}) {
    const mine = from === myName;
    if (meta.w) line({ kind: 'whisper', from, body: text, fid: meta.fid, out: !!meta.to, to: meta.to || null });
    else line({ kind: 'party', from, body: text, fid: meta.fid, me: mine });
  }
  function whisper(to, text) {
    const n = names().find((x) => x.name.toLowerCase() === String(to || '').toLowerCase());
    if (!n) { ui.say('error', `No one called ${to} is in this game.`); return; }
    if (!noted) { noted = true; sys(WHISPER_NOTE); }
    if (st.role === 'host' && st.host) {
      const t = st.host.chat(text, n.id);
      if (t) line({ kind: 'whisper', from: st.hostName, to: n.name, body: t, out: true });
    } else if (st.guest) st.guest.chat(text, n.id);              // the host passes it on and echoes it back
  }
  function party(text) {
    if (st.role === 'host' && st.host) { const t = st.host.chat(text); if (t) line({ kind: 'party', from: st.hostName, body: t, fid: st.hostId, me: true }); }
    else if (st.guest) st.guest.chat(text);                       // the host echoes it back to everyone
  }
  const canTalk = () => st.role === 'host' || !!(st.guest && st.guest.canTalk);
  /** A typed (or tapped) line. */
  function send(text) {
    if (!st.role) return;
    const em = emoteFromChat(text);                              // an emote, not a chat line
    if (em) { if (canTalk() && ui.mode === 'game') ui.act.send(em); return; }
    const p = parseLine(text, { names: names().map((n) => n.name) });
    if (p.kind === 'mute' || p.kind === 'unmute') { (p.kind === 'mute' ? mute : unmute)(p.to); return; }
    if (p.kind === 'help') { for (const [c, w] of COMMANDS) sys(`${c}: ${w}`); return; }
    if (!canTalk()) { ui.say('error', WATCH_READ_ONLY); return; }
    if (p.kind === 'emote') { if (ui.mode === 'game') ui.act.send(p.cmd); return; }
    if (p.kind === 'party') party(p.text);
    else if (p.kind === 'whisper') whisper(p.to, p.text);
    else if (p.kind === 'reply') { if (lastWhisper) whisper(lastWhisper, p.text); else ui.say('error', 'No one has whispered to you yet.'); }
    else if (p.why !== 'empty') ui.say('error', badText(p));
  }
  function mute(name) { mutes.mute(name); sys(`${name} is muted. Their words are hidden on this device only.`); }
  function unmute(name) { mutes.unmute(name); sys(`${name} is not muted now.`); }
  /** The line's chip while typing: To <name> for a whisper or reply, else Party. */
  function chipFor(text) {
    const m = /^\s*\/(w|whisper|tell)\s+(\S+)/i.exec(text || '');
    if (m) return { label: `To ${m[2]}`, whisper: true };
    if (/^\s*\/(r|reply)\b/i.test(text || '') && lastWhisper) return { label: `To ${lastWhisper}`, whisper: true };
    return { label: 'Party', whisper: false };
  }
  function openChat(prefill = '') {
    if (!st.role) return;
    if (!canTalk()) { ui.notify(WATCH_READ_ONLY, 4); return; }
    nui.openChat((text) => send(text), { prefill, chip: chipFor });
  }
  /** The bar's Chat button: the Say sheet on a phone in play, else the typed line. */
  function openTalk() {
    if (compact() && ui.mode === 'game' && chat() && chat().openSheet()) return;
    openChat();
  }
  function kick(id, name) {
    if (st.role !== 'host' || !st.host) return;
    if (st.host.kick(id)) sys(`${name} was removed from the game. They cannot come back with that hero until you end this game.`);
  }

  // ---------------------------------------------------------------- the host's controls
  function watchButton() {
    const h = st.host;
    if (st.role !== 'host' || !h || !h.watching) return null;
    const on = h.watchersTalk;
    return { label: on ? (compact() ? 'Hush' : 'Watchers quiet') : (compact() ? 'Let talk' : 'Let watchers talk'), id: 'net-bar-watchtalk',
      on: () => { h.setWatchersTalk(!on); sys(on ? 'Watchers can only read the chat now.' : 'Watchers can talk now.'); st.refresh(); } };
  }
  function hostBlock(body) {
    const h = st.host;
    if (!h) return;
    const { el } = nui;
    const lockBtn = el('button', { class: 'net-quiet', id: 'net-lock', text: h.locked ? 'Unlock the game' : 'Lock the game' });
    const talkBtn = el('button', { class: 'net-quiet', id: 'net-watchtalk', text: h.watchersTalk ? 'Watchers: read only' : 'Let watchers talk' });
    const state = el('p', { class: 'net-dim', id: 'net-talk-state' });
    const show = () => {
      lockBtn.textContent = h.locked ? 'Unlock the game' : 'Lock the game';
      talkBtn.textContent = h.watchersTalk ? 'Watchers: read only' : 'Let watchers talk';
      state.textContent = `${h.locked ? 'Locked: no one new can join or watch.' : 'Anyone with the link or code can join.'} ${h.watchersTalk ? 'Watchers can talk.' : 'Watchers can read the chat but not talk.'}`;
    };
    lockBtn.addEventListener('click', () => { h.setLocked(!h.locked); show(); st.refresh(); });
    talkBtn.addEventListener('click', () => { h.setWatchersTalk(!h.watchersTalk); show(); st.refresh(); });
    show();
    body.append(state, el('div', { class: 'net-row' }, [lockBtn, talkBtn]),
      el('p', { class: 'net-dim', text: "Whispers between friends pass through your game on the way. Long press (or right click) a friend's frame to whisper, mute or remove them." }));
  }

  const api = {
    mutes, heard, send, openChat, openTalk, hostBlock, watchButton, mute, unmute, kick,
    get lastWhisper() { return lastWhisper; },
    names,
    start(isHost) {
      noted = false; lastWhisper = null;
      myName = isHost ? st.hostName : null;
      const c = chat();
      if (!c) return;
      c.setActions({ say: (t) => send(t), type: () => openChat(), whisper: (n) => openChat(`/w ${n} `), mute, unmute,
        isMuted: (n) => mutes.has(n), kick, emotes: () => ui.openEmotes && ui.openEmotes() });
      c.setActive(true, { host: !!isHost, live: () => !!st.role });
    },
    /** A guest's own hero name (its own party lines come back from the host in green). */
    setMyName(n) { myName = n || null; },
    stop() { const c = chat(); if (c) c.setActive(false); },
    watchTalkChanged(on) { ui.notify(on ? 'The host lets watchers talk now.' : 'Watchers can only read the chat now.', 3); },
  };
  return api;
}

// Phone as a second screen, the glue (wave 9 second lane; docs/NET.md "Phone as a second screen"). coop.js makes one.
//
// The PC (solo, hosting or a guest, it does not matter): Options, Use my phone opens a small room of its own (a fresh
// room code on the same free signalling as co-op), shows the pairing link as a QR code and as text, and asks Allow when
// a phone says the right key. Then every tick it hands the phone a frame of its own hero (5 a second, second.js), takes
// the phone's few commands into the same queue as its own menus (ui.act.send), its quest pick into the PC's arrow and
// tracker, and its chat lines into the PC's own talk. The phone link never touches the co-op session: a host's friends
// and a guest's host never see it.
//
// The phone (the page opened with #pair=CODE.KEY): no hero of its own, no world step, no sound. It joins that room,
// sends the key, waits for Allow, then plays back the PC's frames like a guest (main.js tick takes nextFrame) and draws
// the second screen (src/ui/second_ui.js) instead of the HUD.
//
//   const S = createSecondFlow({ ui, nui, kind, iceServers, build, hero, coopOn, talkSend, setHero, quiet })
//   S.open()   the Options button          S.frame(snap, events)   after every tick (the PC)
//   S.boot()   a #pair link, once the build is known       S.isPhone, S.sendCmds(cmds), S.nextFrame()   (the phone)
//   S.shutdown()   the tab closes
import { signalFor, hostRoom, joinRoom, newRoomCode } from './transport.js';
import { createPairDesk, createSecondHost, createSecondPhone, pairLink, readPair, clearPair, WORDS, PAIR_TTL_MS } from './second.js';
import { openPairPanel, askPanel } from '../ui/second_ui.js';
import { emoteFromChat } from '../sim/emotes.js';

const RESUME_KEY = 'lr_second_resume';   // the phone tab only (sessionStorage): { code, token } after Allow

function tabStore() {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
}

export function createSecondFlow({ ui, nui, kind, iceServers, build = () => null, hero, coopOn = () => false, talkSend = () => {}, setHero = () => {}, quiet = () => {} }) {
  const S = ui.second ? ui.second.state : { on: false };
  const sec = ui.second || { setActions() {} };
  // ---------------------------------------------------------------- the PC
  const desk = createPairDesk();
  let room = null, roomCode = null, roomState = 'off', host = null, panel = null, timer = null, wasCoop = false;
  const sentLines = new WeakSet();

  function makeHost() {
    host = createSecondHost({ desk, hero, build: build(),
      state: () => ({ nav: ui.state.navQuest || null, untracked: [...ui.state.untracked], coop: coopOn() }),
      on: {
        ask: (answer) => {
          const h = hero();
          askPanel(nui, { hero: h ? h.name : '', answer: (yes) => { answer(yes); } });
        },
        paired: () => {
          S.pcPaired = true;
          if (panel && panel.open) panel.close();
          ui.notify(WORDS.pairedToast, 3);
          // the log so far, so the phone's Chat starts with tonight's talk
          for (const l of ui.log.slice(-30)) if (l.ch === 'party') { sentLines.add(l); host.line(l); }
          wasCoop = coopOn();
        },
        gone: (why) => {
          const was = S.pcPaired;
          S.pcPaired = false;
          if (was && why !== 'replaced' && why !== 'host_left') ui.notify(WORDS.goneToast, 3);
        },
        cmd: (c) => ui.act.send(c),
        ui: (nav, untracked) => {
          if (nav !== (ui.state.navQuest || null)) ui.act.selectQuest(nav);
          ui.state.untracked.clear();
          for (const id of untracked) ui.state.untracked.add(id);
        },
        // a party line or a whisper; never an emote or another slash command (they act in the world: the PC's job)
        chat: (text) => { if (coopOn() && !emoteFromChat(text) && (!/^\s*\//.test(text) || /^\s*\/(w|whisper|tell|r|reply|p|party)\s/i.test(text))) talkSend(text); },
      } });
  }
  async function openRoom() {
    if (room || roomState === 'opening') return;
    roomState = 'opening';
    const code = newRoomCode();
    try {
      room = await hostRoom({ signal: signalFor(kind, code), code, iceServers, onLink: (l) => { if (host) host.addLink(l); else l.close(); } });
      roomCode = code; roomState = 'open';
    } catch {
      room = null; roomState = 'failed';
    }
    refresh();
  }
  function closeRoom() {
    if (room) room.close();
    room = null; roomCode = null; roomState = 'off';
  }
  function refresh() {
    if (!panel || !panel.open) return;
    const o = desk.offered;
    if (roomState === 'opening') { panel.setLink(null, WORDS.panelOpening); panel.setLeft(''); return; }
    if (roomState === 'failed') { panel.setLink(null, WORDS.panelFailed); panel.setLeft(''); return; }
    if (!o) { panel.setLink(null, desk.paired ? WORDS.panelPaired : WORDS.panelOld); panel.setLeft(''); return; }
    const url = pairLink(window.location, roomCode, o.key);
    if (panel.url !== url) { panel.url = url; panel.setLink(url); }
    panel.setLeft(WORDS.panelLeft(Math.ceil(o.left / 1000)));
  }
  function tickTimer() {
    refresh();
    // the room stays open while a code is live, a phone is paired or one is waiting for Allow; otherwise it closes
    if (room && !desk.offered && !desk.paired && !desk.asking && !(host && host.waiting)) closeRoom();
    if (!(panel && panel.open) && !room) { clearInterval(timer); timer = null; }
  }
  /** Options: Use my phone. */
  function open() {
    if (phone || !hero()) return;
    if (!host) makeHost();
    if (!desk.paired) desk.offer();          // paired already: the panel says so, and New code replaces that phone
    panel = openPairPanel(nui, { onNew: () => { if (desk.paired) host.unpair(); desk.offer(); if (roomState === 'failed') { roomState = 'off'; openRoom(); } refresh(); } });
    panel.url = null;
    if (roomState === 'off' || roomState === 'failed') { roomState = 'off'; openRoom(); }
    refresh();
    if (!timer) timer = setInterval(tickTimer, 1000);
  }
  function frame(snap, events) {
    if (!host || !host.connected) return;
    host.frame(snap, events);
    const c = coopOn();
    if (c !== wasCoop) { wasCoop = c; host.coop(c); }
    // party lines (talk, joins) to the phone's Chat; the phone makes the rest of its log from the frames' events
    for (let i = Math.max(0, ui.log.length - 8); i < ui.log.length; i++) {
      const l = ui.log[i];
      if (l.ch === 'party' && !sentLines.has(l)) { sentLines.add(l); host.line(l); }
    }
  }

  // ---------------------------------------------------------------- the phone
  let phone = null, pending = null, retries = 0, isPhone = false;
  function phoneEnded(reason, code) {
    phone = null;
    const store = tabStore();
    let saved = null;
    try { saved = store ? JSON.parse(store.getItem(RESUME_KEY) || 'null') : null; } catch { saved = null; }
    // a phone that slept or lost Wi-Fi: back with its token while the PC game is open (three tries, 3 s apart)
    if ((reason === 'lost' || reason === 'closed') && saved && saved.code === code && saved.token && retries < 3) {
      retries++;
      S.status = 'connecting';
      setTimeout(() => connect(code, { resume: saved.token }), 3000);
      return;
    }
    if (store) try { store.removeItem(RESUME_KEY); } catch { /* private mode */ }
    isPhone = false; S.on = false; S.status = 'connecting';
    setHero(null);
    nui.close();
    ui.act.go(ui.store.list().length ? 'select' : 'title');
    if (reason !== 'cancel') nui.message(WORDS.phoneTitle, WORDS.ended[reason] || WORDS.ended.lost);
  }
  function connect(code, pair) {
    joinRoom({ signal: signalFor(kind, code), code, iceServers }).then((link) => {
      if (!isPhone) { link.close('left'); return; }
      const p = createSecondPhone({ link, pair, build: build(), on: {
        ask: () => { S.status = 'ask'; },
        welcome: (w) => {
          retries = 0;
          S.status = 'paired'; S.hero = w.host || ''; S.coop = !!w.coop;
          if (w.token) { const st = tabStore(); if (st) try { st.setItem(RESUME_KEY, JSON.stringify({ code, token: w.token })); } catch { /* private mode */ } }
          setHero(w.id);
          ui.attach(w.id);
          ui.state.navQuest = w.nav || null;
          ui.state.untracked.clear();
          for (const id of w.untracked || []) ui.state.untracked.add(id);
          p.syncUi(ui.state.navQuest, ui.state.untracked);
        },
        line: (l) => ui.say(l.ch || 'party', l.text, l.talk && typeof l.talk === 'object' ? { talk: l.talk } : null),
        coop: (on) => { S.coop = on; },
        end: (reason) => { if (phone === p) phoneEnded(reason, code); },
      } });
      phone = p;
    }, (e) => { if (isPhone) phoneEnded(e && e.message === 'no_room' ? 'no_room' : 'lost', code); });
  }
  /** The page was opened with #pair=CODE.KEY: become the phone screen (after the build is known). */
  function boot() {
    const pr = pending || (typeof window !== 'undefined' ? readPair(window.location) : null);
    pending = null;
    if (!pr) return false;
    clearPair();
    isPhone = true; S.on = true; S.status = 'connecting'; S.tab = 'map';
    quiet();                                 // the phone makes no sound: the PC is the one with speakers on
    ui.act.go('watch');                      // not the title: a stray tap must not start making a hero
    sec.setActions({
      unpair: () => { if (phone) phone.leave(); else phoneEnded('unpaired', pr.code); },
      cancel: () => { const p = phone; phone = null; isPhone = false; if (p) p.close('left'); phoneEnded('cancel', pr.code); },
      type: () => nui.openChat((t) => { if (phone) phone.chat(t); }),
      say: (t) => { if (phone) phone.chat(t); },
    });
    retries = 0;
    connect(pr.code, { key: pr.key });
    return true;
  }
  sec.setActions({ pcUnpair: () => { if (host) host.unpair(); } });

  return {
    open, frame, boot,
    /** Show the Options button: a hero in the world, and this tab is not itself a phone screen. */
    get canOpen() { return !isPhone && !!hero(); },
    get isPhone() { return isPhone; },
    get paired() { return !!(host && host.connected); },
    get roomCode() { return roomCode; },
    sendCmds(cmds) { if (phone) phone.sendCmds(cmds); },
    nextFrame() {
      if (!phone) return null;
      phone.syncUi(ui.state.navQuest, ui.state.untracked);
      return phone.nextFrame();
    },
    shutdown() { if (host) host.unpair('host_left'); closeRoom(); if (phone) phone.close('left'); },
    /** Drivers. */
    stats() { return { isPhone, paired: !!(host && host.connected), waiting: !!(host && host.waiting), roomCode, roomState, offered: !!desk.offered, status: S.status, ttl: PAIR_TTL_MS }; },
  };
}

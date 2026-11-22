// Online co-op glue (docs/NET.md): the lobby flows (host, join by room code, join by copy-paste codes), the session
// for this tab, and what main.js asks each tick. main.js stays the only module that wires sim, render, ui and input;
// this one knows the world (host side), the UI's action surface and the transport.
//
//   const coop = createCoop({ world, ui, content, specFor, saveState, heroId, q })
//   coop.role                      null (solo) | 'host' | 'guest'
//   host: coop.beforeStep() before world.step(), coop.afterStep(events, snap) after it
//   guest: coop.sendCmds(cmds), coop.nextFrame() -> { snap, events } | null, coop.guestSave()
//   coop.hostGame(char) / coop.joinGame(char)   from the character select screen
//   coop.takeGuestId()             main.js enterWorld: the id the host gave this hero (once)
//   coop.onLogout(id) -> true when it was a guest hero (main.js must not touch its own world for it)
//   coop.setPump({ loop, tick })   a host in a background tab keeps ticking (Web Worker timer)
import { ICE_DEFAULT, signalFor, hostRoom, joinRoom, makeOffer, makeAnswer, encodeCode, decodeCode, newRoomCode, cleanRoomCode, validRoomCode } from './transport.js';
import { createHostSession, createGuestSession, MAX_PLAYERS } from './session.js';
import { createNetUI } from './netui.js';

const SUB_TILE = 256;     // sim units per tile (src/sim/constants.js TILE), for placing a guest beside the host

const WHY = {
  no_room: 'No game found with that code. Check the code, and check that your friend is still hosting.',
  broker_unreachable: 'Could not reach the free room-code service. Use join codes instead (below).',
  broker_error: 'The free room-code service said no. Use join codes instead (below).',
  connect_failed: 'Found the game but could not connect. One of your networks blocks direct connections. Try another network (for example a phone hotspot).',
  connect_timeout: 'Found the game but the connection did not finish. Try again, or try another network.',
  full: `That game is full (${MAX_PLAYERS} players).`,
  version: "Your game and your friend's game are different versions. Both of you reload the page, then try again.",
  bad_hero: 'The host could not load your hero.',
};
const ENDED = {
  host_left: ['The host ended the game.', 'Your hero is saved on this device with everything you earned.'],
  timeout: ['Lost the connection to the host.', 'Your hero is saved as of a few seconds ago.'],
  closed: ['Lost the connection to the host.', 'Your hero is saved as of a few seconds ago.'],
  disconnected: ['Lost the connection to the host.', 'Your hero is saved as of a few seconds ago.'],
  failed: ['Lost the connection to the host.', 'Your hero is saved as of a few seconds ago.'],
  kicked: ['The host removed you from the game.', 'Your hero is saved.'],
};

export function createCoop({ world, ui, content, specFor, saveState, heroId, barSpot = null, q = new URLSearchParams() }) {
  // the room-code service: free public MQTT brokers (src/net/transport.js mqttSignal); ?net=local|relay for dev and tests
  const kind = ['local', 'relay', 'mqtt'].includes(q.get('net')) ? q.get('net') : 'mqtt';
  const iceServers = q.get('stun') === '0' ? [] : ICE_DEFAULT;
  const nui = createNetUI();
  nui.setBarSpot(barSpot);
  const compact = () => !!(ui.layout && ui.layout().touch);   // a phone: short labels on the bar
  let role = null, build = null;
  // host
  let hostSess = null, room = null, roomCode = null, roomState = 'off', hostId = null, party = null, hostName = '';
  // guest
  let guestSess = null, pendingId = null, guestCharId = null, endedGuestId = null, guestHost = '';
  let guestPid = null, guestLast = null;  // the hero id the host gave us and its latest save (kept until logout is done)
  const sysLog = [];                    // system actions besides joins: { tick, sys: 'party', id, party }
  const say = (text) => ui.say('party', text);

  // ---------------------------------------------------------------- host
  function spawnGuest(hero) {
    if (!hero || typeof hero !== 'object') return null;
    const name = String(hero.name || '').replace(/[^\p{L}\p{N} '-]/gu, '').trim().slice(0, 16);
    if (!name || !content.classes[hero.cls]) return null;
    const c = { name, cls: hero.cls, look: Math.max(0, Math.min(7, Number(hero.look) | 0)),
      state: hero.state && typeof hero.state === 'object' ? hero.state : null, build: hero.build || undefined };
    const spec = specFor(c);
    // a friend arrives beside the host (they came to play together); their quests, bags and lantern are their own
    const h = world.get(hostId);
    if (h) { spec.zone = h.zone; spec.x = Math.floor(h.x / SUB_TILE) + 1; spec.y = Math.floor((h.y - 1) / SUB_TILE); }
    return spec;
  }
  function hostGame(c) {
    if (role) return;
    hostId = heroId();
    if (hostId == null) return;
    role = 'host'; hostName = c.name; party = hostId;
    world.setParty(hostId, party);
    sysLog.push({ tick: world.tick, sys: 'party', id: hostId, party });
    hostSess = createHostSession({ world, hostId, hostName, party, room: null, build, spawnGuest, saveOf: (id) => saveState(id), on: {
      join: (g) => { say(`${g.name} joined the party.`); ui.notify(`${g.name} joined.`, 3); hostBar(); },
      leave: (g, why) => { say(`${g.name} ${why === 'left' ? 'left' : 'dropped out'}.`); hostBar(); },
      chat: (from, text) => say(`[Party] ${from}: ${text}`),
      commandLogged: (id, cmd) => { if (onCommand) onCommand(id, cmd); },
      joinLogged: (tick, spec) => { if (onJoin) onJoin(tick, spec); },
    } });
    openRoom();                         // sets 'opening' at once, so the panel never flashes the failure text
    hostBar();
    hostPanel();
  }
  async function openRoom() {
    roomState = 'opening'; refreshHostPanel();
    const code = newRoomCode();
    try {
      room = await hostRoom({ signal: signalFor(kind, code), code, iceServers, onLink: (l) => { if (hostSess) hostSess.addLink(l); else l.close(); } });
      if (role !== 'host') { room.close(); room = null; return; }
      roomCode = code; roomState = 'open';
    } catch (e) {
      roomState = 'failed';
    }
    hostBar(); refreshHostPanel();
  }
  let hostPanelApi = null;
  function hostPanel() {
    hostPanelApi = nui.panel({ title: 'Hosting a game', id: 'net-host', build: (body, api) => {
      const { el } = nui;
      const codeBox = el('div', { id: 'net-room' });
      body.appendChild(codeBox);
      body.appendChild(el('p', { class: 'net-dim', text: `Up to ${MAX_PLAYERS} players. Friends play their own heroes in your world. Keep this tab open while you play.` }));
      // copy-paste: a friend's join code in, a reply code out
      const det = el('details', { id: 'net-manual-host' });
      det.appendChild(el('summary', { text: 'A friend sent you a join code' }));
      const inp = el('textarea', { id: 'net-joincode-in', placeholder: 'Paste their join code here' });
      const out = el('textarea', { id: 'net-reply-out', readOnly: true, placeholder: 'Your reply code shows here' });
      const copyBtn = el('button', { text: 'Copy reply code', id: 'net-reply-copy', disabled: true, onclick: () => nui.copy(out.value, copyBtn) });
      const make = el('button', { text: 'Make reply code', id: 'net-reply-make', class: 'net-go', onclick: async () => {
        const d = await decodeCode(inp.value);
        if (!d || d.kind !== 'J') { api.status('That is not a join code. Ask your friend to copy all of it.', 'err'); return; }
        api.status('Making a reply code...');
        try {
          const a = await makeAnswer(d.sdp, { iceServers });
          out.value = await encodeCode('R', a.sdp);
          copyBtn.disabled = false;
          api.status('Send this reply code to your friend. They paste it, then they are in.', 'ok');
          a.link.then((l) => { if (hostSess) hostSess.addLink(l); else l.close(); }, () => { if (api.open) api.status('That friend did not connect. Make a new reply code from a new join code.', 'err'); });
        } catch { api.status('Could not use that join code. Ask for a new one.', 'err'); }
      } });
      det.append(el('p', { class: 'net-dim', text: 'No room code? Your friend taps Join a game, then Use join codes, and sends you their join code.' }), inp,
        el('div', { class: 'net-row' }, [make]), out, el('div', { class: 'net-row' }, [copyBtn]));
      body.appendChild(det);
      body.appendChild(el('div', { class: 'net-row' }, [el('button', { text: 'Play', class: 'net-go', id: 'net-host-close', onclick: () => api.close() })]));
    } });
    refreshHostPanel();
  }
  function refreshHostPanel() {
    const api = hostPanelApi;
    if (!api || !api.open) return;
    const box = api.root.querySelector('#net-room');
    if (!box) return;
    box.textContent = '';
    const { el } = nui;
    if (roomState === 'open') {
      box.append(el('p', { text: 'Your room code:' }), el('div', { class: 'net-code', id: 'net-room-code', text: roomCode }),
        el('p', { text: 'Friends open Lexicon Realms, pick a hero, tap Join a game and type this code.' }));
    } else if (roomState === 'opening') box.append(el('p', { text: 'Opening a room...' }));
    else {
      box.append(el('p', { text: 'Room codes are not working right now (the free room-code service did not answer).' }),
        el('p', { text: 'You can still play together with join codes, below.' }),
        el('button', { text: 'Try room codes again', class: 'net-quiet', onclick: () => openRoom() }));
      const d = api.root.querySelector('#net-manual-host');
      if (d) d.open = true;
    }
  }
  function hostBar() {
    if (role !== 'host') return;
    const n = hostSess ? hostSess.count : 1;
    nui.setBar([
      { label: roomState === 'open' ? `Room ${roomCode}` : roomState === 'opening' ? 'Opening room' : 'Room: join codes', id: 'net-bar-room', on: () => hostPanel() },
      { label: `${n} of ${MAX_PLAYERS}`, id: 'net-bar-count' },
      { label: 'Chat', id: 'net-bar-chat', on: () => openChat() },
      { label: compact() ? 'End' : 'End game', id: 'net-bar-leave', cls: 'net-quiet', on: () => { if (confirmEnd()) endHosting('host_left'); } },
    ]);
  }
  let endArmed = 0;
  function confirmEnd() {
    const n = hostSess ? hostSess.count - 1 : 0;
    if (!n) return true;
    const t = typeof performance !== 'undefined' ? performance.now() : 0;
    if (t - endArmed < 4000) return true;
    endArmed = t;
    ui.notify(`Press End game again to send ${n === 1 ? 'your friend' : `all ${n} friends`} home (they keep what they earned).`, 4);
    return false;
  }
  function endHosting(reason, quiet = false) {
    if (role !== 'host') return;
    if (hostSess) hostSess.close(reason);
    if (room) room.close();
    if (hostId != null && world.get(hostId)) { world.setParty(hostId, null); sysLog.push({ tick: world.tick, sys: 'party', id: hostId, party: null }); }
    role = null; hostSess = null; room = null; roomCode = null; roomState = 'off';
    nui.setBar(null); nui.close(); stopPump();
    if (!quiet) say('You ended the game. Your friends kept everything they earned.');
  }

  // ---------------------------------------------------------------- guest
  const heroBlob = (c) => ({ name: c.name, cls: c.cls, look: c.look, state: c.state || null, build: c.build || null });
  let joinApi = null;
  function joinGame(c) {
    if (role) return;
    joinApi = nui.panel({ title: `Join a game as ${c.name}`, id: 'net-join', build: (body, api) => {
      const { el } = nui;
      const inp = el('input', { class: 'net-codein', id: 'net-code-in', maxLength: 8, placeholder: 'CODE', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false });
      const go = el('button', { text: 'Join', class: 'net-go', id: 'net-join-go', onclick: () => {
        const code = cleanRoomCode(inp.value);
        if (!validRoomCode(code)) { api.status('A room code is 5 letters and numbers. Ask the host for theirs.', 'err'); return; }
        go.disabled = true;
        api.status('Looking for the game...');
        joinRoom({ signal: signalFor(kind, code), code, iceServers })
          .then((link) => startGuest(link, c, api), (e) => { go.disabled = false; api.status(WHY[e && e.message] || WHY.no_room, 'err'); if (e && /broker/.test(e.message)) det.open = true; });
      } });
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go.click(); });
      body.append(el('p', { text: 'Type the room code your friend sees on their screen.' }), inp,
        el('div', { class: 'net-row' }, [go, el('button', { text: 'Cancel', class: 'net-quiet', id: 'net-join-cancel', onclick: () => api.close() })]));
      // copy-paste fallback
      const det = el('details', { id: 'net-manual-join' });
      det.appendChild(el('summary', { text: 'Use join codes (no room code needed)' }));
      const mine = el('textarea', { id: 'net-joincode-out', readOnly: true, placeholder: 'Your join code shows here' });
      const copyBtn = el('button', { text: 'Copy join code', id: 'net-joincode-copy', disabled: true, onclick: () => nui.copy(mine.value, copyBtn) });
      const reply = el('textarea', { id: 'net-reply-in', placeholder: "Paste the host's reply code here" });
      let offer = null;
      const make = el('button', { text: 'Make my join code', id: 'net-joincode-make', onclick: async () => {
        make.disabled = true;
        api.status('Making a join code...');
        try {
          if (offer) offer.close();
          offer = await makeOffer({ iceServers, openMs: 30000 });
          mine.value = await encodeCode('J', offer.sdp);
          copyBtn.disabled = false; connect.disabled = false;
          api.status('Send this join code to the host (a text message is fine). Then paste their reply code below.', 'ok');
        } catch { api.status('Could not make a join code on this device.', 'err'); }
        make.disabled = false;
      } });
      const connect = el('button', { text: 'Connect', class: 'net-go', id: 'net-reply-go', disabled: true, onclick: async () => {
        const d = await decodeCode(reply.value);
        if (!d || d.kind !== 'R') { api.status("That is not a reply code. Ask the host to copy all of it.", 'err'); return; }
        connect.disabled = true;
        api.status('Connecting...');
        try { startGuest(await offer.accept(d.sdp), c, api); } catch (e) { connect.disabled = false; api.status(WHY[e && e.message] || WHY.connect_timeout, 'err'); }
      } });
      det.append(el('p', { class: 'net-dim', text: 'For when room codes do not work. You and the host swap two codes by text message.' }),
        el('div', { class: 'net-row' }, [make]), mine, el('div', { class: 'net-row' }, [copyBtn]), reply, el('div', { class: 'net-row' }, [connect]));
      body.appendChild(det);
      setTimeout(() => inp.focus(), 0);
    } });
  }
  function startGuest(link, c, api) {
    api.status('Connected. Joining...', 'ok');
    let sess = null;
    sess = createGuestSession({ link, hero: heroBlob(c), build, on: {
      welcome: (w) => {
        guestSess = sess; role = 'guest'; pendingId = w.id; guestPid = w.id; guestLast = sess.lastSave; guestCharId = c.id; guestHost = w.host || 'your friend';
        api.close();
        ui.act.enter(c.id);
        say(`You joined ${guestHost}'s game.`);
        nui.setBar([
          compact() ? null : { label: `In ${guestHost}'s game`, id: 'net-bar-room' },
          { label: 'Chat', id: 'net-bar-chat', on: () => openChat() },
          { label: 'Leave', id: 'net-bar-leave', cls: 'net-quiet', on: () => ui.act.logout() },
        ]);
      },
      save: (hero) => { if (guestPid === sess.id) guestLast = hero; ui.saveHero(c.id, hero); },
      chat: (from, text) => say(`[Party] ${from}: ${text}`),
      sys: (text) => { say(text); ui.notify(text, 3); },
      end: (reason) => guestEnded(sess, reason, api),
    } });
  }
  function guestEnded(sess, reason, api) {
    if (guestSess !== sess) {
      // never got in: say why in the join panel
      if (api && api.open) api.status(WHY[reason] || WHY.connect_timeout, 'err');
      return;
    }
    const wasPlaying = role === 'guest';
    guestSess = null;
    if (!wasPlaying) return;        // left on purpose (onLogout already went back to the select screen)
    role = null;
    nui.setBar(null);
    endedGuestId = ui.playerId;
    ui.act.logout();
    const m = ENDED[reason] || ENDED.closed;
    nui.message('The game ended', m);
  }

  // ---------------------------------------------------------------- chat (both sides)
  function openChat() {
    if (!role) return;
    nui.openChat((text) => {
      if (role === 'host' && hostSess) { const t = hostSess.chat(text); if (t) say(`[Party] ${hostName}: ${t}`); }
      else if (role === 'guest' && guestSess) guestSess.chat(text);   // the host echoes it back to everyone
    });
  }
  window.addEventListener('keydown', (ev) => {
    if (!role || ui.mode !== 'game' || nui.chatOpen || nui.panelOpen) return;
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter') { ev.preventDefault(); openChat(); }
  }, true);

  // ---------------------------------------------------------------- a host in a background tab
  let pump = null, worker = null;
  function startPump() {
    if (!pump || worker || role !== 'host') return;
    pump.loop.stop();
    let last = performance.now(), acc = 0;
    try {
      worker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' })));
    } catch { worker = null; pump.loop.start(); return; }
    worker.onmessage = () => {
      const t = performance.now();
      acc += Math.min(1000, t - last); last = t;
      let n = 0;
      while (acc >= 50 && n < 10) { pump.tick(); acc -= 50; n++; }
      if (acc >= 50) acc = 0;
    };
  }
  function stopPump() {
    if (!worker) return;
    worker.terminate(); worker = null;
    if (pump) pump.loop.start();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') startPump(); else stopPump(); });

  let onCommand = null, onJoin = null;
  return {
    get role() { return role; },
    get isGuest() { return role === 'guest'; },
    get isHost() { return role === 'host'; },
    get roomCode() { return roomCode; },
    get roomState() { return roomState; },
    get kind() { return kind; },
    sysLog,
    ui: nui,
    setBuild(v) { build = v || null; },
    onCommandLogged(fn) { onCommand = fn; },
    onJoinLogged(fn) { onJoin = fn; },
    setPump(p) { pump = p; },
    hostGame, joinGame, endHosting, openChat,
    takeGuestId() { const id = pendingId; pendingId = null; return id; },
    /** The save of a hero this tab plays in a friend's game (main.js saveState hook), or undefined for a local hero. */
    guestSave(id) { return guestPid != null && id === guestPid ? guestLast : undefined; },
    beforeStep() { if (hostSess) hostSess.beforeStep(); },
    afterStep(events, snap) { if (hostSess) hostSess.afterStep(events, snap); },
    sendCmds(cmds) { if (guestSess) guestSess.sendCmds(cmds); },
    nextFrame() { return guestSess ? guestSess.nextFrame() : null; },
    onLogout(id) {
      // (ui.saveProgress ran just before this with the guest save; from here on that id means nothing on this tab)
      if (role === 'guest') { const s = guestSess; role = null; guestPid = null; guestLast = null; nui.setBar(null); nui.close(); if (s) s.leave(); return true; }
      if (endedGuestId != null && id === endedGuestId) { endedGuestId = null; guestPid = null; guestLast = null; return true; }
      if (role === 'host') endHosting('host_left');
      return false;
    },
    /** The tab is closing: a host sends every friend their hero; a guest says goodbye (its last 5 s save stands). */
    shutdown() {
      if (role === 'host') endHosting('host_left', true);
      else if (role === 'guest' && guestSess) guestSess.close('left');
    },
    /** Drivers and the bandwidth check. */
    stats() {
      return {
        role, roomCode, roomState, kind,
        guests: hostSess ? hostSess.guests : [],
        guest: guestSess ? guestSess.stats : null,
        guestHost,
        guestCharId,
      };
    },
  };
}

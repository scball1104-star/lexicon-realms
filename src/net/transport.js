// Online co-op transport (docs/NET.md): browser-native WebRTC data channels, no library, no game server.
//
// A Link is one reliable, ordered message pipe to one friend:
//   link.send(obj) -> bool    link.on('message', fn(obj))    link.on('close', fn(reason))    link.close()
//   link.stats                { out, in (chars), msgsOut, msgsIn }    link.open
//
// Getting two browsers to open a data channel needs one offer and one answer passed between them ("signalling"). The
// signalling is swappable; a Signal is:
//   sig.open(myId) -> Promise    sig.send(dstId, msg)    sig.on('message', fn(srcId, msg))    sig.on('expire', fn(dstId))
//   sig.close()                  sig.kind
// Three are here (signalFor(kind, roomCode) picks one):
//   mqttSignal()     free public MQTT brokers (HiveMQ and EMQX, both at once) over a secure WebSocket, MQTT 3.1.1 spoken
//                    directly (no library). No account. The topic is a hash of the room code and every message is
//                    AES-GCM encrypted with a key made from the room code, so a broker (or anyone watching it) sees
//                    only ciphertext on a meaningless topic. Only the offer and answer (SDP with ICE candidates, which
//                    hold IP addresses) pass through it, a few KB per join; game data never does (that goes peer to
//                    peer, encrypted by WebRTC). The PeerJS cloud broker was tried first (2026-11-22): it accepts a
//                    connection but closes it on the first OFFER, so it is not used.
//   localSignal()    BroadcastChannel: two tabs of one browser on one PC (dev).
//   relaySignal()    a mailbox on window.__netRelay that a test driver carries between pages (qa/integrate/coop.py).
// And the copy-paste fallback needs no signal at all: makeOffer / makeAnswer plus encodeCode / decodeCode give a "join
// code" and a "reply code" friends send each other by text message.
//
// ICE: STUN (stun.l.google.com) finds each side's public address; no TURN (a relay costs money or an account), so two
// very strict networks (some phone carriers, some offices) cannot connect. Candidates are gathered in full before an
// offer or answer is sent (no trickle), so each side sends exactly one message.

export const ICE_DEFAULT = [{ urls: 'stun:stun.l.google.com:19302' }];
export const ROOM_PREFIX = 'lexrealms-';
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no I, L, O, 0, 1 (read aloud and typed on a phone)
export const CODE_LEN = 5;
const CHUNK = 15000;                                  // under every browser's safe data channel message size (16 KiB)
const GATHER_MS = 5000;

const rand = (n, abc = CODE_ABC) => {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (v) => abc[v % abc.length]).join('');
};
export const newRoomCode = () => rand(CODE_LEN);
/** A typed code, cleaned: upper case, spaces and dashes gone. */
export const cleanRoomCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
export const validRoomCode = (s) => s.length === CODE_LEN && [...s].every((c) => CODE_ABC.includes(c));
export const roomPeerId = (code) => `${ROOM_PREFIX}${String(code).toLowerCase()}`;

// ---------------------------------------------------------------- the link
export function wrapChannel(dc, pc) {
  const handlers = { message: [], close: [] };
  const early = [];                // messages before anyone listens
  const parts = new Map();         // chunked message id -> [parts]
  const stats = { out: 0, in: 0, msgsOut: 0, msgsIn: 0 };
  let open = dc.readyState === 'open', closed = false, chunkId = 0, discTimer = 0;
  const deliver = (obj) => { stats.msgsIn++; if (handlers.message.length) for (const f of handlers.message) f(obj); else early.push(obj); };
  const shut = (reason) => {
    if (closed) return;
    closed = true; open = false;
    clearTimeout(discTimer);
    try { dc.close(); } catch { /* already */ }
    try { pc.close(); } catch { /* already */ }
    for (const f of handlers.close) f(reason);
  };
  dc.onopen = () => { open = true; };
  dc.onclose = () => shut('closed');
  dc.onerror = () => shut('error');
  dc.onmessage = (ev) => {
    const s = typeof ev.data === 'string' ? ev.data : '';
    stats.in += s.length;
    if (s[0] === '~') {
      // ~id:i:n:data
      const a = s.indexOf(':'), b = s.indexOf(':', a + 1), c = s.indexOf(':', b + 1);
      const id = s.slice(1, a), i = +s.slice(a + 1, b), n = +s.slice(b + 1, c);
      const list = parts.get(id) || [];
      list[i] = s.slice(c + 1);
      parts.set(id, list);
      if (list.filter((x) => x != null).length === n) { parts.delete(id); try { deliver(JSON.parse(list.join(''))); } catch { /* a bad message is dropped */ } }
      return;
    }
    try { deliver(JSON.parse(s)); } catch { /* dropped */ }
  };
  pc.addEventListener('connectionstatechange', () => {
    const st = pc.connectionState;
    if (st === 'failed' || st === 'closed') shut(st);
    else if (st === 'disconnected') { clearTimeout(discTimer); discTimer = setTimeout(() => { if (pc.connectionState === 'disconnected') shut('disconnected'); }, 5000); }
    else if (st === 'connected') clearTimeout(discTimer);
  });
  return {
    get open() { return open && !closed; },
    stats,
    get buffered() { return dc.bufferedAmount || 0; },
    send(obj) {
      if (!open || closed) return false;
      const s = JSON.stringify(obj);
      try {
        if (s.length <= CHUNK) dc.send(s);
        else {
          const id = (++chunkId).toString(36), n = Math.ceil(s.length / CHUNK);
          for (let i = 0; i < n; i++) dc.send(`~${id}:${i}:${n}:${s.slice(i * CHUNK, (i + 1) * CHUNK)}`);
        }
      } catch { shut('send_failed'); return false; }
      stats.out += s.length; stats.msgsOut++;
      return true;
    },
    on(ev, fn) {
      (handlers[ev] || (handlers[ev] = [])).push(fn);
      if (ev === 'message' && early.length) for (const m of early.splice(0)) fn(m);
      if (ev === 'close' && closed) fn('closed');
    },
    close(reason = 'closed') { shut(reason); },
  };
}

/** Wait for ICE candidates: until gathering completes, or 1 s after the first public address (STUN) arrives (the rest
 *  rarely matter and some networks take seconds to time out), or GATHER_MS at most. */
function gather(pc, ms = GATHER_MS) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((res) => {
    let soon = 0;
    const done = () => { clearTimeout(t); clearTimeout(soon); res(); };
    const t = setTimeout(done, ms);   // a STUN server that never answers: send what we have
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') done(); });
    pc.addEventListener('icecandidate', (ev) => { if (ev.candidate && / typ srflx /.test(ev.candidate.candidate) && !soon) soon = setTimeout(done, 1000); });
  });
}
const withTimeout = (p, ms, why) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(why)), ms))]);

/** The joining side: an offer (with its data channel). accept(answerSdp) -> Promise<Link>. */
export async function makeOffer({ iceServers = ICE_DEFAULT, openMs = 30000 } = {}) {
  const pc = new RTCPeerConnection({ iceServers });
  const dc = pc.createDataChannel('realms', { ordered: true });
  const opened = new Promise((res, rej) => {
    dc.addEventListener('open', () => res(), { once: true });
    pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed') rej(new Error('connect_failed')); });
  });
  await pc.setLocalDescription(await pc.createOffer());
  await gather(pc);
  return {
    sdp: pc.localDescription.sdp,
    async accept(answerSdp) {
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      await withTimeout(opened, openMs, 'connect_timeout');
      return wrapChannel(dc, pc);
    },
    close() { try { pc.close(); } catch { /* closed */ } },
  };
}

/** The hosting side: an answer to one offer. link: Promise<Link> once the friend's channel opens. */
export async function makeAnswer(offerSdp, { iceServers = ICE_DEFAULT, openMs = 120000 } = {}) {
  const pc = new RTCPeerConnection({ iceServers });
  const link = new Promise((res, rej) => {
    pc.addEventListener('datachannel', (ev) => {
      const dc = ev.channel;
      const ready = () => res(wrapChannel(dc, pc));
      if (dc.readyState === 'open') ready(); else dc.addEventListener('open', ready, { once: true });
    });
    pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed') rej(new Error('connect_failed')); });
  });
  await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gather(pc);
  const timed = withTimeout(link, openMs, 'connect_timeout');
  timed.catch(() => { try { pc.close(); } catch { /* closed */ } });
  return { sdp: pc.localDescription.sdp, link: timed, close() { try { pc.close(); } catch { /* closed */ } } };
}

// ---------------------------------------------------------------- copy-paste codes
// "J" a join code (the joiner's offer), "R" a reply code (the host's answer). Version 1 is deflate + base64url; 0 is
// plain base64url (a browser without CompressionStream).
const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(t, (c) => c.charCodeAt(0)); };
async function pipe(bytes, Stream, mode) {
  const out = new Blob([bytes]).stream().pipeThrough(new Stream(mode));
  return new Uint8Array(await new Response(out).arrayBuffer());
}
export async function encodeCode(kind, sdp) {
  const raw = new TextEncoder().encode(sdp);
  if (typeof CompressionStream !== 'undefined') {
    try { return `LR${kind}1${b64u(await pipe(raw, CompressionStream, 'deflate-raw'))}`; } catch { /* fall through */ }
  }
  return `LR${kind}0${b64u(raw)}`;
}
/** -> { kind: 'J' | 'R', sdp } or null for anything that is not a code. Spaces and line breaks from a paste are fine. */
export async function decodeCode(text) {
  const s = String(text || '').replace(/\s+/g, '');
  const m = /^LR([JR])([01])([A-Za-z0-9_-]+)$/.exec(s);
  if (!m) return null;
  try {
    let bytes = unb64u(m[3]);
    if (m[2] === '1') bytes = await pipe(bytes, DecompressionStream, 'deflate-raw');
    const sdp = new TextDecoder().decode(bytes);
    return sdp.startsWith('v=0') ? { kind: m[1], sdp } : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- signals
function emitter() {
  const h = {};
  return { on(ev, fn) { (h[ev] || (h[ev] = [])).push(fn); }, emit(ev, ...a) { for (const f of h[ev] || []) f(...a); } };
}

// ---- MQTT 3.1.1 over WebSocket, just enough for QoS 0 publish / subscribe (CONNECT, SUBSCRIBE, PUBLISH, PINGREQ)
export const MQTT_BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
const enc = (t) => new TextEncoder().encode(t);
const mqStr = (t) => { const b = enc(t); return [b.length >> 8, b.length & 255, ...b]; };
const mqLen = (n) => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return o; };
const mqPkt = (h, body) => { const head = [h, ...mqLen(body.length)]; const out = new Uint8Array(head.length + body.length); out.set(head); out.set(body, head.length); return out; };
function mqttConn(url, topic, onPayload, openMs = 8000) {
  return new Promise((res, rej) => {
    let ws = null, buf = new Uint8Array(0), ping = 0, done = false;
    const fail = (why) => { if (done) return; done = true; clearInterval(ping); try { ws.close(); } catch { /* closed */ } rej(new Error(why)); };
    const t = setTimeout(() => fail('broker_unreachable'), openMs);
    try { ws = new WebSocket(url, ['mqtt']); } catch { clearTimeout(t); fail('broker_unreachable'); return; }
    ws.binaryType = 'arraybuffer';
    const conn = {
      publish(text) { if (ws.readyState === 1) ws.send(mqPkt(0x30, [...mqStr(topic), ...enc(text)])); },
      close() { clearInterval(ping); try { ws.send(new Uint8Array([0xe0, 0])); ws.close(); } catch { /* closed */ } },
    };
    ws.onopen = () => ws.send(mqPkt(0x10, [...mqStr('MQTT'), 4, 2, 0, 60, ...mqStr(`lexrealms${rand(10, 'abcdefghijklmnopqrstuvwxyz0123456789')}`)]));
    ws.onerror = () => { clearTimeout(t); fail('broker_unreachable'); };
    ws.onclose = () => { clearInterval(ping); if (!done) { clearTimeout(t); fail('broker_unreachable'); } };
    ws.onmessage = (m) => {
      const add = new Uint8Array(m.data);
      const nb = new Uint8Array(buf.length + add.length); nb.set(buf); nb.set(add, buf.length); buf = nb;
      for (;;) {
        if (buf.length < 2) return;
        let i = 1, mul = 1, len = 0, d;
        do { if (i >= buf.length) return; d = buf[i++]; len += (d & 127) * mul; mul *= 128; } while (d & 128);
        if (buf.length < i + len) return;
        const type = buf[0] >> 4, body = buf.subarray(i, i + len);
        buf = buf.slice(i + len);
        if (type === 2) {                                   // CONNACK
          if (body[1] !== 0) { clearTimeout(t); fail('broker_error'); return; }
          ws.send(mqPkt(0x82, [0, 1, ...mqStr(topic), 0]));
        } else if (type === 9) {                            // SUBACK
          clearTimeout(t); done = true;
          ping = setInterval(() => { try { ws.send(new Uint8Array([0xc0, 0])); } catch { /* closed */ } }, 30000);
          res(conn);
        } else if (type === 3) {                            // PUBLISH (QoS 0: no packet id)
          const tl = (body[0] << 8) | body[1];
          onPayload(new TextDecoder().decode(body.subarray(2 + tl)));
        }
      }
    };
  });
}
/** The room's topic and key, both from the room code (so only someone with the code can read or answer). */
async function roomCrypto(code) {
  const c = String(code).toUpperCase();
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc(`lexicon-realms-topic:${c}`)));
  const topic = `lexrealms/v1/${Array.from(h.subarray(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  const base = await crypto.subtle.importKey('raw', enc(`lexicon-realms-key:${c}`), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc('lexicon-realms-room-v1'), iterations: 100000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { topic, key };
}

/**
 * Room codes over free public MQTT brokers (see the top of this file). Every broker in the list at once: a message goes
 * out on each, and the first copy in wins, so one broker being down does not matter. open() fails only when none answer.
 */
export function mqttSignal({ code, brokers = MQTT_BROKERS } = {}) {
  const ev = emitter();
  let me = null, conns = [], rc = null, closed = false;
  const seen = new Set();
  async function onPayload(text) {
    try {
      const raw = unb64u(text);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, rc.key, raw.subarray(12));
      const m = JSON.parse(new TextDecoder().decode(plain));
      if (!m || m.d !== me || seen.has(m.n)) return;
      seen.add(m.n);
      ev.emit('message', m.s, m.p);
    } catch { /* not ours, or not for this room */ }
  }
  return {
    kind: 'mqtt',
    on: ev.on,
    async open(id) {
      me = id;
      rc = await roomCrypto(code);
      // ready as soon as one broker is; the slower ones join the list when they connect
      await new Promise((res, rej) => {
        let left = brokers.length;
        for (const u of brokers) {
          mqttConn(u, rc.topic, onPayload).then((c) => { if (closed) { c.close(); return; } conns.push(c); res(); },
            () => { if (--left === 0 && !conns.length) rej(new Error('broker_unreachable')); });
        }
      });
    },
    async send(dst, msg) {
      if (!conns.length) return false;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const body = enc(JSON.stringify({ s: me, d: dst, p: msg, n: rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789') }));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, rc.key, body));
      const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
      const text = b64u(all);
      for (const c of conns) c.publish(text);
      return true;
    },
    close() { closed = true; for (const c of conns) c.close(); conns = []; },
  };
}

/** Two tabs of one browser (dev): a BroadcastChannel. */
export function localSignal(name = 'lexicon-realms-net') {
  const ev = emitter();
  let bc = null, me = null;
  return {
    kind: 'local',
    on: ev.on,
    async open(id) { me = id; bc = new BroadcastChannel(name); bc.onmessage = (m) => { const d = m.data; if (d && d.dst === me) ev.emit('message', d.src, d.payload); }; },
    send(dst, msg) { if (bc) bc.postMessage({ src: me, dst, payload: msg }); return !!bc; },
    close() { if (bc) bc.close(); bc = null; },
  };
}

/** Test drivers: messages wait in window.__netRelay.out; the driver calls __netRelay.deliver(m) on the page they are for. */
export function relaySignal(hub = globalThis) {
  const ev = emitter();
  let me = null;
  const R = hub.__netRelay || (hub.__netRelay = { out: [], ids: [], subs: [], deliver(m) { for (const f of R.subs) f(m); } });
  return {
    kind: 'relay',
    on: ev.on,
    async open(id) { me = id; R.ids.push(id); R.subs.push((m) => { if (m.dst === me) ev.emit('message', m.src, m.payload); }); },
    send(dst, msg) { R.out.push({ src: me, dst, payload: msg }); return true; },
    close() { R.ids = R.ids.filter((x) => x !== me); },
  };
}

export function signalFor(kind, code) {
  if (kind === 'local') return localSignal();
  if (kind === 'relay') return relaySignal();
  return mqttSignal({ code });
}

// ---------------------------------------------------------------- rooms over a signal
/** Host: listen on the room code; every friend's offer gets an answer, and onLink(link) when their channel opens. */
export async function hostRoom({ signal, code, iceServers = ICE_DEFAULT, onLink, onError = () => {} }) {
  await signal.open(roomPeerId(code));
  const answered = new Map();           // friend's id -> our answer (a repeated offer gets the same answer again)
  signal.on('message', async (src, msg) => {
    if (!msg || msg.t !== 'offer' || typeof msg.sdp !== 'string' || msg.sdp.length > 20000) return;
    if (answered.has(src)) { const sdp = await answered.get(src); if (sdp) signal.send(src, { t: 'answer', sdp }); return; }
    let ready = null;
    answered.set(src, new Promise((r) => { ready = r; }));
    try {
      const a = await makeAnswer(msg.sdp, { iceServers, openMs: 30000 });
      ready(a.sdp);
      signal.send(src, { t: 'answer', sdp: a.sdp });
      onLink(await a.link);
    } catch (e) { ready(null); onError(e); }
  });
  return { code, close() { signal.close(); } };
}

/** Guest: find the room by code; resolves with the Link, rejects with no_room / connect_failed / connect_timeout. */
export async function joinRoom({ signal, code, iceServers = ICE_DEFAULT, timeoutMs = 12000 }) {
  const dst = roomPeerId(code);
  await signal.open(`${ROOM_PREFIX}g-${rand(10, 'abcdefghijklmnopqrstuvwxyz0123456789')}`);
  let o = null;
  try {
    o = await makeOffer({ iceServers });
    const answer = new Promise((res, rej) => {
      signal.on('message', (src, msg) => { if (src === dst && msg && msg.t === 'answer' && typeof msg.sdp === 'string') res(msg.sdp); });
      signal.on('expire', (who) => { if (who === dst) rej(new Error('no_room')); });
      setTimeout(() => rej(new Error('no_room')), timeoutMs);
    });
    // sent again at 3 s and 6 s: a public broker drops nothing on purpose, but one may have been a moment late to connect
    const send = () => signal.send(dst, { t: 'offer', sdp: o.sdp });
    send();
    const again = [setTimeout(send, 3000), setTimeout(send, 6000)];
    const sdp = await answer.finally(() => again.forEach(clearTimeout));
    return await o.accept(sdp);
  } catch (e) {
    if (o) o.close();
    throw e;
  } finally {
    signal.close();
  }
}

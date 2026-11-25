// Talking with friends (wave 8 talk lane, docs/NET.md "Talk"): the talk model (src/net/talk.js), the host session's
// whisper routing, flood drop, Remove from game, Lock the game and watchers who read only (src/net/session.js), and the
// chat window's tabs and mute (src/net/talk_coop.js with a stand-in UI).
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { createHostSession, createGuestSession } from '../../src/net/session.js';
import { parseLine, createFlood, createMutes, bubbleFor, stamp, tabHas, talkText, PHRASES, CHAT_MAX, FLOOD_LINES } from '../../src/net/talk.js';
import { createTalk } from '../../src/net/talk_coop.js';

const C = buildContent();
const eqj = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);   // deep, for arrays and objects

function pair() {
  const mk = () => ({ h: { message: [], close: [] }, early: [], open: true, stats: { out: 0 } });
  const a = mk(), b = mk();
  const link = (me, other) => ({
    get open() { return me.open; }, stats: me.stats, get buffered() { return 0; },
    send(obj) { if (!me.open) return false; const m = JSON.parse(JSON.stringify(obj)); if (other.h.message.length) for (const f of other.h.message) f(m); else other.early.push(m); return true; },
    on(ev, fn) { me.h[ev].push(fn); if (ev === 'message') for (const m of me.early.splice(0)) fn(m); },
    close(why = 'closed') { if (!me.open) return; me.open = false; other.open = false; for (const f of me.h.close) f(why); for (const f of other.h.close) f(why); },
  });
  return [link(a, b), link(b, a)];
}

function rig() {
  const world = createWorld({ seed: 7, content: C });
  const hostId = world.addPlayer({ name: 'Hosta', cls: 'warden' });
  world.step();
  const heard = [];
  const sess = createHostSession({ world, hostId, hostName: 'Hosta', party: hostId, room: null,
    spawnGuest: (hero) => (hero && hero.name ? { name: hero.name, cls: hero.cls || 'warden', zone: world.get(hostId).zone, x: Math.floor(world.get(hostId).x / 256) + 1, y: Math.floor((world.get(hostId).y - 1) / 256) } : null),
    saveOf: () => ({ ok: 1 }), on: { chat: (from, text, meta) => heard.push({ from, text, ...meta }) } });
  const guest = (name, watch = false) => {
    const [hl, gl] = pair();
    const got = { chat: [], sys: [], end: null, talk: [], welcome: null };
    sess.addLink(hl);
    const g = createGuestSession({ link: gl, hero: watch ? null : { name, cls: 'mender' }, watch, on: {
      welcome: (w) => { got.welcome = w; }, chat: (from, text, meta) => got.chat.push({ from, text, ...meta }), sys: (t) => got.sys.push(t),
      talk: (on) => got.talk.push(on), end: (r) => { got.end = r; } } });
    return { g, got };
  };
  return { world, hostId, sess, heard, guest };
}

export const tests = [
  {
    name: 'talk: a typed line: party, /w Name (any case), /r, /mute, emotes, help, unknown; 140 letters; control characters',
    fn() {
      const names = ['Bryn', 'Cass'];
      eqj(parseLine('hello', { names }).kind, 'party', 'plain');
      const w = parseLine('/w cass meet me', { names });
      eqj([w.kind, w.to, w.text], ['whisper', 'Cass', 'meet me'], 'whisper');
      eqj(parseLine('/w Dax hi', { names }).why, 'no_one', 'unknown name');
      eqj(parseLine('/r ok', { names }).kind, 'reply', 'reply');
      eqj(parseLine('/mute bryn', { names }).to, 'Bryn', 'mute');
      eqj(parseLine('/wave', { names }).cmd, { t: 'emote', id: 'wave' }, 'emote');
      eqj(parseLine('/sit', { names }).cmd, { t: 'sit' }, 'sit');
      eqj(parseLine('/help', { names }).kind, 'help', 'help');
      eqj(parseLine('/zz', { names }).why, 'unknown', 'unknown command');
      eqj(parseLine('x'.repeat(300), { names }).text.length, CHAT_MAX, '140');
      eqj(parseLine('a\u0007b', { names }).text, 'a b', 'control');
      eqj(stamp(new Date(2026, 10, 24, 19, 42)), '7:42', 'time');
      eqj(talkText({ kind: 'party', from: 'Bryn', body: 'hi' }), '[Party] Bryn: hi', 'party words in the log (drivers read them)');
      assert(PHRASES.length === 8, '8 phrases');
      const b = bubbleFor('one two three four five six seven eight nine ten', (s) => s.split(' ').reduce((a, w) => { if (!a.length || a[a.length - 1].length > 8) a.push(w); else a[a.length - 1] += ` ${w}`; return a; }, []), 60);
      assert(b.lines.length === 2 && b.lines[1].endsWith('..'), 'bubble: 2 lines, clipped');
    },
  },
  {
    name: 'talk: the chat window tabs: combat lines only on Combat, whispers on Whispers, party and joins on Party',
    fn() {
      const dmg = { ch: 'damage_out', text: 'Your Strike hits' };
      const wh = { ch: 'party', text: 'x', talk: { kind: 'whisper' } };
      const pa = { ch: 'party', text: 'x', talk: { kind: 'party' } };
      const loot = { ch: 'loot', text: 'You loot 3 gold.' };
      eqj([tabHas('all', dmg), tabHas('combat', dmg), tabHas('all', loot), tabHas('all', wh)], [false, true, true, true], 'all and combat');
      eqj([tabHas('party', pa), tabHas('party', wh), tabHas('whispers', wh), tabHas('whispers', pa)], [true, false, true, false], 'party and whispers');
    },
  },
  {
    name: 'talk: flood: a guest gets 5 lines in 10 s, then one "slow down" and the rest are dropped (not relayed)',
    fn() {
      const f = createFlood();
      const r = Array.from({ length: 7 }, (_, i) => f.ok('k', i * 100));
      eqj(r, [true, true, true, true, true, 'warn', false], 'guard');
      eqj(f.ok('k', 20000), true, 'a new window');
      const R = rig();
      const a = R.guest('Bryn'), b = R.guest('Cass');
      for (let i = 0; i < FLOOD_LINES + 3; i++) a.g.chat(`line ${i}`);
      eqj(b.got.chat.filter((m) => /^line/.test(m.text)).length, FLOOD_LINES, 'the other guest got only 5');
      eqj(R.heard.length, FLOOD_LINES, 'the host saw only 5');
      eqj(a.got.sys.filter((t) => /Slow down/.test(t)).length, 1, 'one notice to the sender');
    },
  },
  {
    name: 'talk: a whisper reaches only the one friend (and the sender\'s echo); a whisper to the host shows on the host',
    fn() {
      const R = rig();
      const a = R.guest('Bryn'), b = R.guest('Cass'), c = R.guest('Dara');
      const cassId = b.got.welcome.id;
      a.g.chat('psst', cassId);
      eqj(b.got.chat.find((m) => m.text === 'psst'), { from: 'Bryn', text: 'psst', fid: a.got.welcome.id, w: 1, to: undefined }, 'Cass got it');
      assert(a.got.chat.some((m) => m.text === 'psst' && m.to === 'Cass' && m.w), 'Bryn got the echo');
      assert(!c.got.chat.some((m) => m.text === 'psst'), 'Dara did not');
      assert(!R.heard.some((m) => m.text === 'psst'), 'the host game does not show a whisper between guests');
      a.g.chat('to you', R.hostId);
      assert(R.heard.some((m) => m.text === 'to you' && m.w), 'host sees a whisper to the host');
      eqj(R.sess.chat('back', a.got.welcome.id), 'back', 'host whispers');
      assert(a.got.chat.some((m) => m.text === 'back' && m.w) && !b.got.chat.some((m) => m.text === 'back'), 'only Bryn');
      R.sess.chat('all of you');
      assert([a, b, c].every((x) => x.got.chat.some((m) => m.text === 'all of you' && m.fid === R.hostId)), 'party line with the host hero id (bubbles)');
    },
  },
  {
    name: 'talk: Remove from game sends the friend home saved and refuses that hero name until the game ends',
    fn() {
      const R = rig();
      const a = R.guest('Bryn'), b = R.guest('Cass');
      const id = a.got.welcome.id;
      eqj(R.sess.count, 3, 'three in');
      assert(R.sess.kick(id), 'kicked');
      eqj(a.got.end, 'kicked', 'the friend is told (the guest side words: "The host removed you from the game.")');
      assert(!R.world.get(id), 'their hero left the world');
      assert(b.got.sys.some((t) => /Bryn was removed by the host/.test(t)), 'the others are told');
      const again = R.guest('bryn');
      eqj(again.got.end, 'removed', 'the same hero name is refused');
      eqj(R.sess.kick(9999), false, 'no such friend');
    },
  },
  {
    name: 'talk: Lock the game refuses new players and watchers; those in stay; unlock lets them in again',
    fn() {
      const R = rig();
      const a = R.guest('Bryn');
      R.sess.setLocked(true);
      const b = R.guest('Cass'), w = R.guest(null, true);
      eqj([b.got.end, w.got.end], ['locked', 'locked'], 'refused');
      eqj(a.got.end, null, 'Bryn stays');
      R.sess.setLocked(false);
      const c = R.guest('Cass');
      assert(c.got.welcome && c.got.welcome.id != null, 'in after unlock');
    },
  },
  {
    name: 'talk: watchers read the chat but cannot talk until the host lets them (one switch, told to every watcher)',
    fn() {
      const R = rig();
      const a = R.guest('Bryn'), w = R.guest(null, true);
      eqj(w.got.welcome.talk, 0, 'read only by default');
      eqj(w.g.canTalk, false, 'the watcher knows');
      a.g.chat('hello all');
      assert(w.got.chat.some((m) => m.text === 'hello all'), 'the watcher reads');
      w.g.chat('let me talk');
      assert(!a.got.chat.some((m) => m.text === 'let me talk') && !R.heard.some((m) => m.text === 'let me talk'), 'dropped, not relayed');
      R.sess.setWatchersTalk(true);
      eqj(w.got.talk, [true], 'told');
      eqj(w.g.canTalk, true, 'can talk now');
      w.g.chat('thanks');
      assert(a.got.chat.some((m) => m.text === 'thanks' && m.from === 'A watcher'), 'relayed now');
      w.g.chat('psst', a.got.welcome.id);
      assert(!a.got.chat.some((m) => m.text === 'psst' && m.w), 'a watcher cannot whisper (no hero)');
    },
  },
  {
    name: 'talk: mute hides a friend\'s words on this device only (saved there), and /mute, /unmute and /help work from the line',
    fn() {
      const mem = {};
      const storage = { getItem: (k) => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
      const log = [];
      const sent = [];
      const ui = { say: (ch, text, extra) => log.push({ ch, text, ...(extra || {}) }), notify() {}, mode: 'game', act: { send: (c) => sent.push(c) }, chat: null };
      const st = { role: 'guest', host: null, guest: { canTalk: true, chat: (t, to) => sent.push({ t, to }) }, hostName: 'Hosta', hostId: 1, myId: 5,
        snap: { entities: [{ id: 5, kind: 'player', name: 'Me', party: 1 }, { id: 6, kind: 'player', name: 'Bryn', party: 1 }, { id: 1, kind: 'player', name: 'Hosta', party: 1 }] }, refresh() {} };
      const T = createTalk({ ui, nui: { openChat() {} }, st, storage });
      T.heard('Bryn', 'first', { fid: 6 });
      T.send('/mute bryn');
      T.heard('Bryn', 'hidden now', { fid: 6 });
      assert(log.some((l) => l.talk && l.talk.body === 'first') && !log.some((l) => l.talk && l.talk.body === 'hidden now'), 'muted words never arrive');
      assert(createMutes(storage).has('Bryn'), 'kept on this device');
      T.send('/unmute Bryn');
      T.heard('Bryn', 'back', { fid: 6 });
      assert(log.some((l) => l.talk && l.talk.body === 'back'), 'unmuted');
      T.send('/w bryn hi there');
      eqj(sent.find((x) => x.t === 'hi there'), { t: 'hi there', to: 6 }, 'whisper to the hero id');
      assert(log.some((l) => /pass through the host/.test(l.text)), 'the whisper note, in plain words');
      T.send('/wave');
      eqj(sent.find((x) => x.t === 'emote'), { t: 'emote', id: 'wave' }, 'emote');
      T.send('/help');
      assert(log.some((l) => /^\/w Name words/.test(l.text)), 'help');
      st.guest.canTalk = false;
      T.send('a watcher line');
      assert(!sent.some((x) => x.t === 'a watcher line') && log.some((l) => /Watchers can read/.test(l.text)), 'read only');
    },
  },
];

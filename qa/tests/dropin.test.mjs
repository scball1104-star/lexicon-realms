// Drop-in with one link (docs/NET.md "Invite links", src/net/dropin.js): the invite link holds the room code and nothing
// else; a watcher's frames follow the host and carry nothing private; the host session lets a watcher in without a hero,
// lets it pick one later, and refuses a full game without dropping the watcher.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { framesFor, createFrameState, applyFrame } from '../../src/net/frames.js';
import { createHostSession, createGuestSession, MAX_PLAYERS, WATCHER_NAME } from '../../src/net/session.js';
import { inviteLink, readInvite, quickName, QUICK_NAMES, shareOrCopy } from '../../src/net/dropin.js';
import { validateName } from '../../src/ui/save.js';

const C = buildContent();

/** Two ends of a reliable, ordered pipe (the data channel), delivering at once. */
function pair() {
  const mk = () => ({ h: { message: [], close: [] }, early: [], open: true, stats: { out: 0, in: 0, msgsOut: 0, msgsIn: 0 }, buffered: 0 });
  const a = mk(), b = mk();
  const link = (me, other) => ({
    get open() { return me.open; }, stats: me.stats, get buffered() { return 0; },
    send(obj) { if (!me.open) return false; const m = JSON.parse(JSON.stringify(obj)); me.stats.out += 1; if (other.h.message.length) for (const f of other.h.message) f(m); else other.early.push(m); return true; },
    on(ev, fn) { me.h[ev].push(fn); if (ev === 'message') for (const m of me.early.splice(0)) fn(m); },
    close(why = 'closed') { if (!me.open) return; me.open = false; other.open = false; for (const f of me.h.close) f(why); for (const f of other.h.close) f(why); },
  });
  return [link(a, b), link(b, a)];
}

function hostRig() {
  const world = createWorld({ seed: 7, content: C });
  const hostId = world.addPlayer({ name: 'Hosta', cls: 'warden' });
  world.step();
  const seen = { watch: 0, unwatch: 0, join: 0 };
  const sess = createHostSession({ world, hostId, hostName: 'Hosta', party: hostId, room: null,
    spawnGuest: (hero) => (hero && hero.name ? { name: hero.name, cls: hero.cls || 'warden', zone: world.get(hostId).zone, x: Math.floor(world.get(hostId).x / 256) + 1, y: Math.floor((world.get(hostId).y - 1) / 256) } : null),
    saveOf: () => ({ ok: 1 }),
    on: { watch: () => seen.watch++, unwatch: () => seen.unwatch++, join: () => seen.join++ } });
  const tick = () => { sess.beforeStep(); const ev = world.step(); sess.afterStep(ev, world.snapshot()); };
  return { world, hostId, sess, seen, tick };
}
const players = (w) => w.state.ents.filter((e) => e.kind === 'player');

export const tests = [
  {
    name: 'drop-in: the invite link is the page plus the room code after #; dev keys kept, anything else dropped; readInvite round trips',
    fn() {
      const loc = { origin: 'https://friends.example', pathname: '/realms/index.html', search: '?name=Scott&net=relay&r=3d&stun=0&dev=1' };
      const url = inviteLink(loc, 'byv57');
      eq(url, 'https://friends.example/realms/index.html?net=relay&stun=0&dev=1#join=BYV57', 'link');
      assert(!/scott/i.test(url), 'no name in the link');
      eq(inviteLink({ origin: 'https://x.io', pathname: '/', search: '' }, 'BYV57'), 'https://x.io/#join=BYV57', 'a plain page has no ?');
      eq(inviteLink(loc, 'TOOLONGCODE'), null, 'a bad code makes no link');
      eq(readInvite(new URL(url)), 'BYV57', 'round trip');
      eq(readInvite({ hash: '#join=byv57' }), 'BYV57', 'case-blind');
      eq(readInvite({ hash: '#x=1&join=BYV57' }), 'BYV57', 'among other keys');
      eq(readInvite({ hash: '#join=hello%20there' }), null, 'not a code');
      eq(readInvite({ hash: '#join=BYV5I' }), null, 'I is not in the code alphabet');
      eq(readInvite({ hash: '' }), null, 'no hash');
    },
  },
  {
    name: 'drop-in: a quick hero name is valid and not one this device has; share falls back to copy without a share sheet',
    async fn() {
      for (const n of QUICK_NAMES) assert(validateName(n, []).ok, `draft name ${n} is valid`);
      const have = QUICK_NAMES.slice(0, -1).map((name) => ({ name }));
      eq(quickName(have, () => 0), QUICK_NAMES[QUICK_NAMES.length - 1], 'the one free name');
      const all = QUICK_NAMES.map((name) => ({ name }));
      const n = quickName(all, () => 0);
      assert(validateName(n, all).ok, `a name even when every draft is taken (${n})`);
      let copied = null;
      const nui = { copy: async (t) => { copied = t; return true; } };
      eq(await shareOrCopy(nui, 'u1', null, { nav: {} }), 'copied', 'no navigator.share: copy');
      eq(copied, 'u1', 'copied the link');
      let shared = null;
      eq(await shareOrCopy(nui, 'u2', null, { nav: { share: async (d) => { shared = d; } } }), 'shared', 'the share sheet');
      eq(shared.url, 'u2', 'the share sheet gets the link');
      eq(await shareOrCopy(nui, 'u3', null, { nav: { share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } } }), 'cancelled', 'cancel is not a copy');
    },
  },
  {
    name: 'drop-in: watcher frames follow the host, trim the host like a friend, carry no HUD block and no private events',
    fn() {
      const w = createWorld({ seed: 3, content: C });
      const h = w.addPlayer({ name: 'Hosta', cls: 'warden' });
      w.step();
      const tx = framesFor(null, { follow: h });
      const snap = w.snapshot();
      const events = [{ type: 'xp', id: h, amount: 5 }, { type: 'loot', id: h }, { type: 'damage', src: h, dst: 999, amount: 1 }];
      const m = tx.frame(snap, events);
      const he = (m.u || []).find((e) => e.id === h);
      assert(he, 'the host is in the watcher frame');
      for (const k of ['bag', 'quests', 'gold', 'talents']) assert(!(k in he), `no ${k}`);
      assert(!m.h, 'no HUD block');
      assert(!(m.e || []).some((e) => e.type === 'xp' || e.type === 'loot'), 'no private events');
      const rx = createFrameState(null);
      const back = applyFrame(rx, m);
      const me = snap.entities.find((e) => e.id === h);
      const mobs = back.entities.filter((e) => e.kind === 'mob');
      assert(mobs.every((e) => e.zone === me.zone && Math.abs(e.x - me.x) <= 960 && Math.abs(e.y - me.y) <= 960), 'foes only near the host');
      eq(Object.keys(back.hud).length, 0, 'rebuilt snapshot: no hud');
      assert(back.entities.some((e) => e.id === h), 'rebuilt snapshot has the host');
    },
  },
  {
    name: 'drop-in: a watcher joins with no hero, gets frames, chats, then plays and stands beside the host; a full game says nope and keeps it watching',
    fn() {
      const { world, hostId, sess, seen, tick } = hostRig();
      const [hl, gl] = pair();
      sess.addLink(hl);
      const got = { welcome: [], nope: [], frames: 0, chat: [] };
      const g = createGuestSession({ link: gl, hero: null, watch: true, on: { welcome: (w) => got.welcome.push(w), nope: (r) => got.nope.push(r), chat: (f, t) => got.chat.push(`${f}: ${t}`) } });
      eq(got.welcome.length, 1, 'welcomed');
      eq(got.welcome[0].watch, 1, 'as a watcher');
      eq(got.welcome[0].follow, hostId, 'following the host');
      eq(sess.watching, 1, 'host counts one watcher');
      eq(sess.count, 1, 'a watcher is not a player');
      eq(players(world).length, 1, 'no hero added for a watcher');
      eq(seen.watch, 1, 'on.watch');
      for (let i = 0; i < 3; i++) tick();
      const f = g.nextFrame();
      assert(f && f.snap.entities.some((e) => e.id === hostId), 'the watcher plays back frames with the host in them');
      g.chat('hello');
      assert(!got.chat.includes(`${WATCHER_NAME}: hello`), 'wave 8 talk: a watcher reads only until the host lets watchers talk');
      sess.setWatchersTalk(true);
      g.chat('hello');
      assert(got.chat.includes(`${WATCHER_NAME}: hello`), 'watcher chat comes back to everyone');
      g.sendCmds([{ t: 'move', dx: 1, dy: 0 }]);   // no welcome id: nothing to move; the host would ignore it anyway
      // fill the game: three friends
      const others = [];
      for (let i = 0; i < MAX_PLAYERS - 1; i++) {
        const [a, b] = pair();
        sess.addLink(a);
        others.push(createGuestSession({ link: b, hero: { name: `Friend${'abc'[i]}`, cls: 'warden' } }));
      }
      eq(sess.count, MAX_PLAYERS, 'game full');
      g.play({ name: 'Watcha', cls: 'warden' });
      eq(got.nope[0], 'full', 'a full game: nope');
      eq(sess.watching, 1, 'still watching after the nope');
      assert(!g.ended, 'the watcher session is still open');
      // one friend leaves; now the watcher plays
      others[0].leave();
      tick();
      eq(sess.count, MAX_PLAYERS - 1, 'a seat is free');
      g.play({ name: 'Watcha', cls: 'warden' });
      eq(got.welcome.length, 2, 'a second welcome');
      const id = got.welcome[1].id;
      assert(id != null && !got.welcome[1].watch, 'with a hero id');
      eq(g.id, id, 'guest session knows its hero');
      eq(sess.watching, 0, 'no watchers now');
      eq(seen.unwatch, 1, 'on.unwatch');
      const H = world.get(hostId), W = world.get(id);
      assert(W && W.party === hostId, 'in the party');
      assert(Math.abs(H.x - W.x) <= 2 * 256 && Math.abs(H.y - W.y) <= 2 * 256 && H.zone === W.zone, 'beside the host');
      tick();
      const f2 = g.nextFrame();
      assert(f2 && f2.snap.hud[id], 'frames now carry its own HUD block');
      for (const o of others) o.close();
      g.close();
      sess.close();
    },
  },
  {
    name: 'drop-in: a watcher who leaves is gone from the host; watchers past the cap are refused',
    fn() {
      const { sess } = hostRig();
      const ws = [];
      for (let i = 0; i < 5; i++) {
        const [a, b] = pair();
        sess.addLink(a);
        const ended = [];
        ws.push({ s: createGuestSession({ link: b, hero: null, watch: true, on: { end: (r) => ended.push(r) } }), ended });
      }
      eq(sess.watching, 4, 'four watchers at most');
      eq(ws[4].ended[0], 'full', 'the fifth is told full');
      ws[0].s.leave();
      eq(sess.watching, 3, 'a watcher leaves');
      for (const w of ws) w.s.close();
      sess.close();
    },
  },
];

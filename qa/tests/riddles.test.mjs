// Riddles friends write (wave 9 riddles; src/sim/riddle.js, src/sim/riddles.js, src/ui/riddle_book.js,
// src/data/riddle_words.js, CONTRACTS "Riddles"). A friend's trail rides in one command; the sim never sees an answer.
import { assert, eq } from './_helpers.mjs';
import { createWorld, TILE } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { createRiddleRules } from '../../src/sim/riddle.js';
import { RIDDLE_RULES, BLOCKED, RW } from '../../src/data/riddle_words.js';
import { createRiddleBook, readRiddle, codeIn, riddleLink, RIDDLE_KEY } from '../../src/ui/riddle_book.js';
import { guestCommandOk, createHostSession, createGuestSession } from '../../src/net/session.js';

const T = TILE;
const BASE = { ...buildContent(), spawns: [], nightSpawns: [] };
const RB = createRiddleRules(RIDDLE_RULES, BLOCKED);
const world = (seed = 77) => createWorld({ seed, content: BASE, day: 1 });
const step = (w, n = 1) => { let ev = []; for (let i = 0; i < n; i++) ev = ev.concat(w.step() || []); return ev; };
const at = (p, tx, ty) => { p.x = tx * T + 128; p.y = (ty + 1) * T - 16; };
// sample text for the tests (not game text): three stones on open grass west of Willowmere
const TRAIL = {
  by: 'Ash', title: 'The Well Keeps Secrets', end: 'You found all three. Drinks are on me.',
  stones: [
    { zone: 'world', tx: 134, ty: 152, answer: 'BUCKET', clue: ['I go down empty and come up full,', 'and the well needs me.'], hint: 'Look at the rope.' },
    { zone: 'world', tx: 146, ty: 152, answer: 'ECHO', clue: ['Speak to me in the old mill', 'and I answer with your own words.'], hint: 'Shout.' },
    { zone: 'world', tx: 134, ty: 164, answer: 'SHADOW', clue: ['I follow you all day.'] },
  ],
};
const CODE = RB.pack(TRAIL);
function setup(names = ['Bryn']) {
  const w = world();
  const heroes = names.map((n) => w.get(w.addPlayer({ name: n, cls: 'wayfinder', gearMode: 'design' })));
  step(w, 2);
  return { w, p: heroes[0], heroes };
}
const add = (w, p, code = CODE, keys) => { w.enqueue(p.id, { t: 'riddle_add', code, ...(keys ? { keys } : {}) }); return step(w, 1); };
const guess = (w, p, rid, word) => { w.enqueue(p.id, { t: 'riddle_guess', rid, word }); return step(w, 1); };
const stoneEnt = (w) => w.state.ents.find((e) => e.rstone);
const snapStone = (w) => w.snapshot().entities.find((e) => e.rstone);
function pair() {   // two in-memory links (as qa/tests/talk.test.mjs)
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
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

export const tests = [
  {
    name: 'riddles: the link code seals answers, locks later stones and refuses cut, changed or huge links',
    fn() {
      eq(RB.pack(TRAIL), CODE, 'same trail, same code');
      const body = Buffer.from(CODE.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
      assert(!/BUCKET|ECHO|SHADOW/.test(body), 'no answer in the code');
      assert(!body.includes('old mill'), 'stone 2 unreadable before stone 1 is solved');
      const u = RB.unpack(CODE);
      assert(!u.error && u.n === 3 && u.by === 'Ash', 'unpacks');
      assert(!RB.tryWord(u, 0, 'BASKET').ok && !RB.tryWord(u, 0, 'PAIL').ok, 'wrong words fail');
      const s1 = RB.tryWord(u, 0, 'bucket');
      assert(s1.ok && s1.stone.x === 146 && s1.stone.c[0] === 'Speak to me in the old mill', 'the right word opens stone 2');
      assert(/Drinks/.test(RB.tryWord(u, 2, 'SHADOW').end), 'the last word opens the last words');
      assert(RB.unpack(CODE.slice(0, -12)).error, 'cut link refused');
      const p = CODE.split('.'); p[1] = p[1].slice(0, 40) + (p[1][40] === 'A' ? 'B' : 'A') + p[1].slice(41);
      eq(RB.unpack(p.join('.')).error, 'cut', 'changed link refused');
      eq(RB.unpack(`r1.${'A'.repeat(5000)}.x`).error, 'long', 'huge link refused unread');
      eq(RB.unpack('<script>alert(1)</script>').error, 'shape', 'junk refused');
      const big = { by: 'A'.repeat(16), title: 'T'.repeat(32), end: 'E'.repeat(80), stones: [0, 1, 2, 3, 4].map((k) => ({ zone: 'world', tx: 100 + k * 20, ty: 100, answer: 'ABCDEFGH', clue: ['W'.repeat(60), 'W'.repeat(60)], hint: 'H'.repeat(60) })) };
      assert(RB.validate(big).length === 0 && RB.pack(big).length < RIDDLE_RULES.linkMax, 'the biggest trail fits a link');
    },
  },
  {
    name: 'riddles: the word check (whole words, leet, stretched, spaced) and no contact details',
    fn() {
      eq(RB.check('what a damn mess'), 'bad', 'blocked');
      eq(RB.check('you 1d10t'), 'bad', 'leet');
      eq(RB.check('stuuuupid'), 'bad', 'stretched');
      eq(RB.check('l o s e r'), 'bad', 'spaced');
      eq(RB.check('Crapple cider and a dumbbell'), null, 'whole words only');
      eq(RB.check('see www.example.com'), 'contact', 'links');
      eq(RB.check('mail bob@x'), 'contact', 'handles');
      eq(RB.check('call 555 123 4567'), 'contact', 'phone numbers');
      eq(RB.check('Count the 12 posts by the 3 gates'), null, 'small numbers fine');
      const RX = createRiddleRules(RIDDLE_RULES, ['ass', 'coon']);
      eq(RX.check('as good as a con'), null, 'a listed word never blocks a shorter one');
      eq(RX.check('what an asssss'), 'bad', 'a stretched listed word');
      const v = RB.validate({ ...TRAIL, stones: [{ ...TRAIL.stones[0], clue: ['You are a l0ser'] }, { ...TRAIL.stones[1], tx: 136 }] });
      assert(v.some((x) => x.k === 0 && x.why === 'bad') && v.some((x) => x.k === 1 && x.why === 'close'), JSON.stringify(v));
      assert(RB.validate({ ...TRAIL, stones: [{ ...TRAIL.stones[0], zone: 'barrow#1' }] }).some((x) => x.why === 'zone'), 'open world only');
    },
  },
  {
    name: 'riddles: a trail put out raises stone 1 where the author stood; the snapshot never carries an answer',
    fn() {
      const { w, p } = setup();
      assert(!w.state.riddles, 'no riddle state before the first add (old worlds hash as before)');
      const ev = add(w, p);
      const a = ev.find((e) => e.type === 'riddle' && e.kind === 'added');
      assert(a && a.k === 0 && a.n === 3, 'added event');
      const s = stoneEnt(w);
      assert(s && s.zone === 'world' && Math.floor(s.x / T) === 134 && Math.floor((s.y - 1) / T) === 152, 'stone at its tile');
      const ss = snapStone(w);
      eq(ss.rstone.clue[0], TRAIL.stones[0].clue[0], 'clue in the snapshot');
      eq(ss.rstone.len, 6, 'answer length only');
      assert(!JSON.stringify(w.snapshot()).includes('BUCKET'), 'no answer anywhere in the snapshot');
      eq(ss.rstone.hint, null, 'no hint before 2 wrong words');
      eq(add(w, p).find((e) => e.type === 'riddle_fail').reason, 'have', 'the same trail twice is refused');
    },
  },
  {
    name: 'riddles: wrong words quiet the stone and show the hint after two; right words move on; the last counts once',
    fn() {
      const { w, heroes } = setup(['Bryn', 'Cass', 'Ash']);
      const [p, c, author] = heroes;
      add(w, p);
      const rid = stoneEnt(w).rstone.rid;
      for (const h of heroes) at(h, 134, 153);
      step(w, 1);
      const gold0 = p.gold;
      let ev = guess(w, p, rid, 'BASKET');
      assert(ev.some((e) => e.type === 'riddle' && e.kind === 'wrong' && e.tries === 1), 'wrong 1');
      eq(guess(w, p, rid, 'BUCKET').find((e) => e.type === 'riddle_fail').reason, 'quiet', 'quiet after a wrong word');
      step(w, RIDDLE_RULES.wrongQuietSec * 20);
      guess(w, p, rid, 'PICKET');
      eq(snapStone(w).rstone.hint, 'Look at the rope.', 'hint after 2 wrong');
      step(w, RIDDLE_RULES.wrongQuietSec * 20);
      ev = guess(w, c, rid, 'bucket');
      const r = ev.find((e) => e.type === 'riddle' && e.kind === 'right');
      assert(r && r.k === 1 && r.next.x === 146, 'right word: stone 2');
      const s2 = stoneEnt(w);
      eq(Math.floor(s2.x / T), 146, 'stone 2 stands at its tile');
      eq(guess(w, p, rid, 'ECHO').find((e) => e.type === 'riddle_fail').reason, 'range', 'stand by the stone');
      for (const h of heroes) at(h, 146, 153);
      step(w, 1);
      guess(w, p, rid, 'ECHO');
      for (const h of heroes) at(h, 134, 165);
      at(author, 134, 165);
      step(w, 1);
      ev = guess(w, p, rid, 'SHADOW');
      const d = ev.find((e) => e.type === 'riddle' && e.kind === 'done');
      assert(d && /Drinks/.test(d.end), 'done with the last words');
      eq(p.riddlesSolved, 1, 'Bryn counts it'); eq(c.riddlesSolved, 1, 'Cass counts it');
      assert(!author.riddlesSolved, 'the author does not count their own trail');
      eq(p.gold, gold0, 'no gold, no loot');
      assert(!stoneEnt(w) && !Object.keys(w.state.riddles.list).length, 'the trail is gone');
      eq(w.snapshot().entities.find((e) => e.id === p.id).riddles, 1, 'the count is in the snapshot');
    },
  },
  {
    name: 'riddles: a re-add with the words solved on this device puts the trail out at the next stone; bad keys stop the walk',
    fn() {
      const { w, p } = setup();
      add(w, p, CODE, ['BUCKET', 'ECHO']);
      eq(Math.floor(stoneEnt(w).x / T), 134, 'stone 3'); eq(Math.floor((stoneEnt(w).y - 1) / T), 164, 'stone 3 row');
      const w2 = setup().w; const p2 = w2.get(w2.state.ents.find((e) => e.kind === 'player').id);
      add(w2, p2, CODE, ['BUCKET', 'WRONG']);
      eq(Math.floor(stoneEnt(w2).x / T), 146, 'a wrong key stops at stone 2');
      const w3 = setup().w; const p3 = w3.get(w3.state.ents.find((e) => e.kind === 'player').id);
      eq(add(w3, p3, CODE, ['BUCKET', 'ECHO', 'SHADOW']).find((e) => e.type === 'riddle_fail').reason, 'done', 'a solved trail is not put out');
    },
  },
  {
    name: 'riddles: refusals (broken link, a flagged trail, three at most) and take it down',
    fn() {
      const { w, p } = setup();
      eq(add(w, p, 'r1.abc.def').find((e) => e.type === 'riddle_fail').reason, 'bad_link', 'broken');
      eq(add(w, p, RB.pack({ ...TRAIL, title: 'crap riddles' })).find((e) => e.type === 'riddle_fail').reason, 'words', 'flagged');
      for (let i = 0; i < 3; i++) add(w, p, RB.pack({ ...TRAIL, title: `Trail ${i}`, stones: [{ ...TRAIL.stones[0], tx: 120 + i * 12 }] }));
      eq(add(w, p).find((e) => e.type === 'riddle_fail').reason, 'full', 'three at most');
      const rid = stoneEnt(w).rstone.rid;
      w.enqueue(p.id, { t: 'riddle_remove', rid }); step(w, 1);
      eq(Object.keys(w.state.riddles.list).length, 2, 'taken down');
    },
  },
  {
    name: 'riddles: deterministic (same commands, same hash) and the count survives a save',
    fn() {
      const run = () => { const { w, p } = setup(); add(w, p); at(p, 134, 153); step(w, 1); guess(w, p, stoneEnt(w).rstone.rid, 'BUCKET'); step(w, 30); return w.hash(); };
      eq(run(), run(), 'same hash');
      const { w, p } = setup();
      p.riddlesSolved = 4;
      const save = w.saveFields(p.id);
      eq(save.riddles, 4, 'saved');
      const id = w.addPlayer({ name: 'Bryn2', cls: 'wayfinder', gearMode: 'design', riddles: save.riddles });
      eq(w.get(id).riddlesSolved, 4, 'restored');
      eq(w.saveFields(w.addPlayer({ name: 'New', cls: 'mender', gearMode: 'design' })).riddles, undefined, 'missing = none');
    },
  },
  {
    name: 'riddles: a guest cannot put trails out or take them down (the host decides); guesses go through',
    fn() {
      eq(guestCommandOk({ t: 'riddle_add', code: CODE }), false, 'add refused');
      eq(guestCommandOk({ t: 'riddle_remove', rid: 'x' }), false, 'remove refused');
      eq(guestCommandOk({ t: 'riddle_guess', rid: 'x', word: 'ECHO' }), true, 'guess allowed');
    },
  },
  {
    name: 'riddles: a guest offers a trail over the co-op link; the host hears who offered it and the code',
    fn() {
      const w = world();
      const hostId = w.addPlayer({ name: 'Hosta', cls: 'warden', gearMode: 'design' });
      step(w, 1);
      const offers = [];
      const sess = createHostSession({ world: w, hostId, hostName: 'Hosta', party: hostId, room: null,
        spawnGuest: (hero) => ({ name: hero.name, cls: 'mender', zone: 'world', x: 134, y: 153 }), saveOf: () => ({ ok: 1 }),
        on: { riddleOffer: (from, code) => offers.push({ from, code }) } });
      const [hl, gl] = pair();
      sess.addLink(hl);
      const g = createGuestSession({ link: gl, hero: { name: 'Bryn', cls: 'mender' }, on: {} });
      g.riddleOffer(CODE);
      g.riddleOffer('x'.repeat(5000));
      eq(offers.length, 1, 'one offer (an oversized one is dropped)');
      eq(offers[0].from, 'Bryn', 'who'); eq(offers[0].code, CODE, 'the code');
    },
  },
  {
    name: 'riddles: the riddle book (this device only) and the #riddle= link helpers',
    fn() {
      const mem = memStore();
      const b = createRiddleBook(mem);
      const u = RB.unpack(CODE);
      assert(b.addGot(u, CODE, 1) && !b.addGot(u, CODE, 2), 'added once');
      b.progress(u.id, ['BUCKET']);
      eq(createRiddleBook(mem).got[0].k, 1, 'progress persists');
      b.hide('ASH');
      eq(b.toPutOut(3).length, 0, 'hidden authors are not put out');
      assert(b.isHidden('ash'), 'hidden by name, any case');
      mem.setItem(RIDDLE_KEY, '{broken');
      eq(createRiddleBook(mem).got.length, 0, 'a broken book starts empty');
      const link = riddleLink({ origin: 'https://x.example', pathname: '/game/' }, CODE);
      eq(readRiddle({ hash: link.slice(link.indexOf('#')) }), CODE, 'read back from the link');
      eq(codeIn(`My trail!\n${link}\n`), CODE, 'found in a pasted file');
      eq(readRiddle({ hash: '#join=ABCDE' }), null, 'an invite is not a riddle');
    },
  },
  {
    name: 'riddles: every player-facing word is plain (no em dashes) and the placeholder list is mild',
    fn() {
      const all = Object.values(RW).map((v) => (typeof v === 'function' ? v('X', 2) : v)).join(' ');
      assert(!all.includes(String.fromCharCode(0x2014)), 'no em dashes');
      assert(BLOCKED.length >= 5 && BLOCKED.every((b) => /^[a-z]+$/.test(b)), 'placeholder list shape');
    },
  },
];

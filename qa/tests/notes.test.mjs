// Lantern notes (wave 9 notes lane; brief D:/LQOnline/wave9/notes/BRIEF.md): the model (src/net/notes.js), the co-op swap
// (src/net/session.js { t:'notes' }), and the wiring (src/ui/notes_wire.js with a stand-in UI): words only from the
// game's list, the #note= link both ways, a game never passes on notes it was given, caps, hide, the local day.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { WORD_DOORS } from '../../src/data/word_doors.js';
import { createHostSession, createGuestSession } from '../../src/net/session.js';
import { wordBook, lexiconOf, makeNote, noteText, encodeLink, readLink, createNotebook, syncOffer, syncTake, ago, localDay, LIMITS, FRAMES, NOTES_KEY } from '../../src/net/notes.js';
import { createLanternNotes } from '../../src/ui/notes_wire.js';
import { CHAR_KEY } from '../../src/ui/save.js';

const C = buildContent();
const book = wordBook(C, { doors: WORD_DOORS });
const eqj = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const keyOf = (pre, re) => [...book.keys()].find((k) => k.startsWith(pre) && re.test(book.get(k).text));
const SQ = 'world:square', BOAR = keyOf('m:', /^Gorse Boars$/), INN = keyOf('h:', /Lantern Inn/);
const LOC = { origin: 'https://example.github.io', pathname: '/lexicon-realms/', search: '' };
const ashNote = () => makeNote({ from: 'Ash', at: SQ, parts: [['beware', BOAR], ['meet', INN]], day: '2026-11-23' }, book);

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

export const tests = [
  {
    name: 'notes: the word book is the game\'s own words; a note is lines plus words from it, never free text',
    fn() {
      assert(book.size > 100, `book ${book.size}`);
      assert(BOAR && INN && book.has(`p:${SQ}`) && book.has('g:ASH') && book.has('d:NAME'), 'foes, inns, lanterns, glyph and door words');
      const n = ashNote();
      assert(!n.bad, JSON.stringify(n));
      eq(noteText(n, book), 'Beware the Gorse Boars. Meet me at the Lantern Inn.', 'text');
      eq(makeNote({ from: 'Ash', at: SQ, parts: [['beware', 's:tonight']], day: '2026-11-25' }, book).bad, 'word', 'a word must fit its line');
      eq(makeNote({ from: 'Ash', at: SQ, parts: [['say', 'x:call me 555']], day: '2026-11-25' }, book).bad, 'word', 'no free text');
      eq(makeNote({ from: 'Ash http', at: SQ, parts: [['say', 's:welldone']], day: '2026-11-25' }, book).bad, 'from', 'a hero name: letters only');
      eq(makeNote({ from: 'Ash', at: SQ, parts: [['say', 's:welldone'], ['say', 's:hurry'], ['say', 's:rest']], day: '2026-11-25' }, book).bad, 'parts', 'two lines at most');
      eq(makeNote({ from: 'Ash', at: SQ, parts: [['luck', 'n:bad name!']], day: '2026-11-25' }, book).bad, 'word', 'a friend word is a name');
      assert(FRAMES.every((f) => (f.text.match(/\{\}/g) || []).length === 1), 'every line has one blank');
    },
  },
  {
    name: 'notes: the lexicon is the hero\'s own: starter words, what it learned, its flight points, its friends',
    fn() {
      const lex = lexiconOf({ flights: ['willowmere'] }, book, [BOAR], ['Bryn']);
      assert(lex.has('s:tonight') && lex.has(BOAR) && lex.has('f:willowmere') && lex.has('n:Bryn'), 'has');
      assert(!lex.has(INN) && !lex.has('g:HUSH'), 'not what it has not learned');
    },
  },
  {
    name: 'notes: the #note= link carries the note itself (ids only), is short, and a forged word is refused',
    fn() {
      const n = ashNote();
      const url = encodeLink(LOC, n);
      assert(url.length < 200, `short: ${url.length}`);
      assert(!/Gorse|Ash/.test(url.split('#')[1]), 'the words are ids, not text');
      eq(readLink({ hash: url.slice(url.indexOf('#')) }, book).id, n.id, 'round trip');
      eq(readLink({ hash: `#note=${Buffer.from('1~Ash~world:square~2026-11-25~~say=x:hello there').toString('base64url')}` }, book), null, 'forged');
      eq(readLink({ hash: '#join=ABCDE' }, book), null, 'an invite is not a note');
    },
  },
  {
    name: 'notes: the notebook: take once, read, hide a writer, "to" one friend, 30 days, caps, a bad blob kept aside',
    fn() {
      const s = mem();
      const nb = createNotebook(s, { today: () => '2026-11-25' });
      const n = ashNote();
      assert(nb.take(n, { me: ['Bryn'] }) && !nb.take(n, { me: ['Bryn'] }), 'once');
      eq(nb.unread(SQ).length, 1, 'unread'); nb.markRead(n.id); eq(nb.unread(SQ).length, 0, 'read');
      assert(!nb.take(makeNote({ from: 'Ash', at: SQ, parts: [['luck', 'n:Cass']], to: 'Cass', day: '2026-11-25' }, book), { me: ['Bryn'] }), 'to Cass, not Bryn');
      assert(!nb.take(makeNote({ from: 'Dell', at: SQ, parts: [['say', 's:welldone']], day: '2026-09-01' }, book), { me: ['Bryn'] }) || nb.at(SQ).every((x) => x.from !== 'Dell'), '30 days');
      nb.hide('Ash'); eq(nb.at(SQ).length, 0, 'hidden'); nb.unhide('Ash');
      for (let i = 0; i < 80; i++) nb.take(makeNote({ from: 'Eve', at: SQ, parts: [['when', i % 2 ? 's:soon' : 's:tonight'], ['luck', `n:${'Bryn'}`]], day: `2026-11-${String(1 + (i % 25)).padStart(2, '0')}` }, book), { me: ['Bryn'] });
      assert(nb.data.got.length <= LIMITS.got && nb.at(SQ).length <= LIMITS.perLantern, 'caps');
      assert(JSON.parse(s.getItem(NOTES_KEY)).v === 1, 'own key, own version');
      const bad = mem(); bad.setItem(NOTES_KEY, '{"v":9}');
      eq(createNotebook(bad).data.got.length, 0, 'unknown version starts empty');
      eq(bad.getItem(`${NOTES_KEY}.bad`), '{"v":9}', 'kept aside');
      eq(ago('2026-11-23', '2026-11-25'), '2 days ago', 'ago'); eq(ago('2026-11-25', '2026-11-25'), 'today', 'today');
      eq(localDay(new Date(2026, 10, 25, 23, 30)), '2026-11-25', 'the local day, never UTC');
    },
  },
  {
    name: 'notes: a game offers only its own hero\'s notes for friends, never notes it was given, never "just me"',
    fn() {
      const a = createNotebook(mem(), { today: () => '2026-11-25' });
      a.leave(ashNote());
      a.leave({ ...makeNote({ from: 'Ash', at: SQ, parts: [['say', 's:rest']], day: '2026-11-25' }, book), share: false });
      a.take(makeNote({ from: 'Dell', at: SQ, parts: [['say', 's:welldone']], day: '2026-11-25' }, book), { me: ['Ash'] });
      const offer = syncOffer(a, 'Ash');
      eqj(offer.map((n) => n.from), ['Ash'], 'own only');
      assert(offer.every((n) => !('share' in n)), 'no device fields');
      const b = createNotebook(mem(), { today: () => '2026-11-25' });
      eq(syncTake(b, offer, book, { from: 'Cass', me: ['Bryn'] }), 0, 'notes not written by the sender are refused');
      eq(syncTake(b, [...offer, { from: 'Ash', at: SQ, day: '2026-11-25', parts: [['say', 'free words']] }], book, { from: 'Ash', me: ['Bryn'] }), 1, 'every word checked');
    },
  },
  {
    name: 'notes: co-op swap: a guest\'s notes reach the host and the other guest; a newcomer gets everyone\'s; watchers none',
    fn() {
      const world = createWorld({ seed: 7, content: C });
      const hostId = world.addPlayer({ name: 'Hosta', cls: 'warden' });
      world.step();
      const hostGot = [], met = [];
      const hostNotes = [{ from: 'Hosta', at: SQ, parts: [['say', 's:hurry']], day: '2026-11-25' }];
      const sess = createHostSession({ world, hostId, hostName: 'Hosta', party: hostId, room: null,
        spawnGuest: (hero) => (hero && hero.name ? { name: hero.name, cls: 'mender', zone: world.get(hostId).zone, x: Math.floor(world.get(hostId).x / 256) + 1, y: Math.floor((world.get(hostId).y - 1) / 256) } : null),
        saveOf: () => ({ ok: 1 }), on: { notes: (from, list) => hostGot.push([from, list.length]), notesMine: () => hostNotes, notesMet: (n) => met.push(n) } });
      const guests = [];
      const guest = (name, watch = false) => {
        const [hl, gl] = pair();
        const got = [];
        sess.addLink(hl);
        const g = createGuestSession({ link: gl, hero: watch ? null : { name, cls: 'mender' }, watch, on: { notes: (from, list) => got.push([from, list.length]) } });
        guests.push(g);
        return { g, got };
      };
      const bryn = guest('Bryn');
      eqj(bryn.got, [['Hosta', 1]], 'the host\'s own notes on join');
      bryn.g.notes([{ from: 'Bryn', at: SQ, parts: [['say', 's:welldone']], day: '2026-11-25' }]);
      eqj(hostGot, [['Bryn', 1]], 'host game got Bryn\'s');
      const cass = guest('Cass');
      eqj(cass.got, [['Hosta', 1], ['Bryn', 1]], 'a newcomer gets the host\'s and Bryn\'s');
      cass.g.notes([{ from: 'Cass', at: SQ, parts: [['say', 's:sorry']], day: '2026-11-25' }]);
      eqj(bryn.got.slice(-1), [['Cass', 1]], 'Bryn gets Cass\'s');
      sess.notes(hostNotes);
      eqj([bryn.got.length, cass.got.length], [3, 3], 'a note the host leaves goes to everyone playing');
      const w = guest('', true);
      eq(w.got.length, 0, 'a watcher gets none');
      w.g.notes([{ from: 'Eve', at: SQ, parts: [['say', 's:sorry']], day: '2026-11-25' }]);
      eq(hostGot.length, 2, 'a watcher sends none');
      eqj(met, ['Bryn', 'Cass'], 'friends met');
      for (let i = 0; i < 15; i++) bryn.g.notes([]);
      eq(hostGot.filter(([f]) => f === 'Bryn').length, 10, 'at most 10 note messages a guest');
      for (const g of guests) g.close();
      sess.close();
    },
  },
  {
    name: 'notes: the wiring: learns words from its own events, reads a #note= link once, near a lantern, leave and send',
    async fn() {
      const handlers = [];
      const bus = { on: (_, f) => handlers.push(f) };
      const store = mem();
      store.setItem(CHAR_KEY, JSON.stringify({ v: 2, chars: [{ id: 1, name: 'Bryn', cls: 'mender' }] }));
      const n = ashNote();
      const url = encodeLink(LOC, n);
      let replaced = null, opened = null, model = null;
      const notified = [];
      const ui = { setModel: (m) => { model = m; }, openLink: (x) => { opened = x; } };
      const lan = C.zones.world.lanterns.find((l) => l.id === 'square');
      const hero = { id: 5, name: 'Bryn', zone: 'world', x: (lan.x * 256 + 128) / 16, y: ((lan.y + 1) * 256 - 16) / 16 + 20, flights: [], party: null };   // snapshots are px
      let shared = null;
      const N = createLanternNotes({ notesUi: ui, content: C, storage: store, bus, hero: () => hero, heroId: () => 5, toHud: (x, y) => [x / 2, y / 2],
        notify: (s) => notified.push(s), loc: { ...LOC, hash: url.slice(url.indexOf('#')) }, history: { state: null, replaceState: (a, b, u) => { replaced = u; } },
        nav: { share: async (o) => { shared = o; } } });
      eq(replaced, '/lexicon-realms/', 'the #note= is dropped from the address bar');
      model.posts();
      eq(opened && opened.id, n.id, 'the link card once a hero is in the world');
      opened = null; model.posts(); eq(opened, null, 'once');
      const p = model.posts().find((x) => x.key === SQ);
      assert(p && p.n === 1 && p.unread, 'the seal on Lantern Square');
      eqj(model.near(), { key: SQ, name: 'Lantern Square' }, 'near the lantern');
      for (const h of handlers) h({ type: 'death', killer: 5, kind: 'mob', template: 'gorse_boar' });
      for (const h of handlers) h({ type: 'death', killer: 9, kind: 'mob', template: 'ink_slime' });
      for (const h of handlers) h({ type: 'glyph', id: 5, word: 'ASH' });
      const lex = model.lexicon();
      assert(lex.has('m:gorse_boar') && lex.get('m:gorse_boar').isNew && lex.has('g:ASH') && !lex.has('m:ink_slime'), 'learned only from its own events');
      const sent = [];
      N.onLeave = (list) => sent.push(list);
      const mine = model.leave({ at: SQ, parts: [['thanks', 'n:Ash']], share: true });
      assert(!mine, 'Ash is not yet a friend word');
      N.met('Ash');
      const mine2 = model.leave({ at: SQ, parts: [['thanks', 'n:Ash']], share: true });
      assert(mine2 && sent.length === 1 && sent[0][0].from === 'Bryn', 'left and offered to friends playing now');
      eq(N.offer('Bryn').length, 1, 'a guest at welcome names its hero (its snapshot is not there yet)');
      eq(await model.sendLink(mine2), 'shared', 'share sheet');
      assert(shared.url.includes('#note=') && /Bryn left you a note/.test(shared.text), 'link text');
      eq(N.take([{ from: 'Cass', at: SQ, parts: [['say', 's:sorry']], day: localDay() }], 'Cass'), 1, 'a friend\'s note');
      eq(N.take([{ from: 'Dell', at: SQ, parts: [['say', 's:sorry']], day: localDay() }], 'Cass'), 0, 'not passed on');
      assert(notified.some((s) => /Cass/.test(s)), 'told');
    },
  },
];

// Lantern notes, the wiring (wave 9 notes lane; brief D:/LQOnline/wave9/notes/BRIEF.md, approved by Scott 2026-11-25).
// main.js makes one after the UI and hands it to coop.js. It owns this device's notebook (src/net/notes.js, its own key
// lexicon_realms.notes, never in a hero save), learns words from the hero's own events, finds the lanterns near the hero,
// reads a #note= link at load, makes the link to send, and does the co-op swap (coop.js calls offer / take).
// No sim state: notes are UI and device data only, so nothing here touches determinism or replays.
// Player-facing words in this file are DRAFTS (NOTES_WIRE_WORDS).
//
//   const N = createLanternNotes({ notesUi, content, storage, bus, hero, heroId, toHud, is3d, notify, loc, history })
//   N.offer()  N.take(list, from)  N.onLeave = (list) => {}   (coop.js: send this hero's notes to friends playing now)
import { wordBook, lexiconOf, makeNote, noteText, encodeLink, readLink, createNotebook, syncOffer, syncTake, ago, localDay, FRAMES, NOTES_KEY } from '../net/notes.js';
import { WORD_DOORS } from '../data/word_doors.js';
import { CHAR_KEY } from './save.js';

export const NOTES_WIRE_WORDS = {   // drafts (Scott)
  share: (n) => `${n} left you a note in Lexicon Realms. Tap to read it.`,
  shared: 'Sent.', copied: 'Link copied. Send it to your friends.', failed: 'Could not copy the link.',
  notForYou: (to) => `That note is for ${to}.`,
  got: (n) => `${n}'s notes are waiting on the lanterns.`,
};
const TOUCH_PX = 48;                       // the lantern bind reach (src/data/progression.js death.lanternTouch)
const SUB = 16, TILE = 256;                // SUB units per px, per tile (src/sim/constants.js)

export function createLanternNotes({ notesUi, content, storage, bus = null, hero: hero0, heroId, toHud, is3d = () => false, notify = () => {},
  loc = globalThis.location, history = globalThis.history, nav = globalThis.navigator }) {
  const hero = () => { try { return hero0() || null; } catch { return null; } };   // main.js's snapshot may not exist yet at boot
  const book = wordBook(content, { doors: WORD_DOORS });
  const nb = createNotebook(storage);
  const fresh = new Set();                 // words learned this session (violet in the writer)
  let pendingLink = null, lastBound = null;
  const me = () => ((hero() || {}).name || '');
  const myHeroes = () => {
    try { const o = JSON.parse((storage && storage.getItem(CHAR_KEY)) || 'null'); return o && Array.isArray(o.chars) ? o.chars.map((c) => c.name) : []; } catch { return []; }
  };
  const learn = (key) => { const n = me(); if (!n || !book.has(key)) return; if (!nb.learned(n).includes(key)) { nb.learn(n, key); fresh.add(key); } };
  const lanternsOf = (zid) => ((content.zones[zid] || {}).lanterns || []);
  const lanternAt = (at) => { const [zid, id] = String(at).split(':'); return lanternsOf(zid).find((l) => l.id === id) || null; };
  const regionName = (zid, l) => { const z = content.zones[zid] || {}; const r = (z.regions || []).find((x) => x.id === l.region); return r ? r.name : (content.zoneNames || {})[zid] || ''; };

  // ---- words the hero learns (its own events only)
  if (bus) bus.on('*', (ev) => {
    const id = heroId();
    if (id == null || !ev) return;
    if (ev.type === 'death' && (ev.killer === id || ev.tagger === id) && ev.kind === 'mob' && ev.template) learn(`m:${ev.template}`);
    if (ev.id !== id) return;
    if (ev.type === 'lantern' && ev.lantern) learn(`p:${ev.zone}:${ev.lantern}`);
    else if (ev.type === 'flight_point' && ev.point) learn(`f:${ev.point}`);
    else if (ev.type === 'home' && ev.inn) learn(`h:${ev.inn}`);
    else if (ev.type === 'glyph' && ev.word) learn(`g:${ev.word}`);
    else if (ev.type === 'wdoor' && ev.kind === 'open' && ev.word) learn(`d:${ev.word}`);
  });

  // ---- a #note= link at load: file it on this device, show the card once a hero is in the world
  try {
    const n = readLink(loc, book);
    if (n) {
      const mine = myHeroes();
      if (n.to && mine.length && !mine.includes(n.to)) pendingLink = { refused: n.to };
      else { nb.take(n, { me: mine }); pendingLink = { note: n }; }
      const h = String(loc.hash || '').replace(/^#/, '').split('&').filter((p) => !p.startsWith('note=')).join('&');
      if (history && history.replaceState) history.replaceState(history.state, '', `${loc.pathname}${loc.search}${h ? `#${h}` : ''}`);
    }
  } catch { /* an old browser: the note is still filed, the # stays (a reload files it again, which is harmless) */ }

  function near() {
    const e = hero();
    if (!e || e.dead || e.flight) return null;
    for (const l of lanternsOf(e.zone)) {
      const lx = (l.x * TILE + TILE / 2) / SUB, ly = ((l.y + 1) * TILE - SUB) / SUB;   // the sim's lantern spot, in px (snapshots are px)
      if (Math.hypot(e.x - lx, e.y - ly) <= TOUCH_PX) return { key: `${e.zone}:${l.id}`, name: l.name || 'the lantern' };
    }
    return null;
  }
  function frame() {
    const e = hero();
    if (!e) return;
    if (e.lantern && e.lantern.id && lastBound !== `${e.lantern.zone}:${e.lantern.id}`) { lastBound = `${e.lantern.zone}:${e.lantern.id}`; learn(`p:${lastBound}`); }
    if (pendingLink) {
      if (pendingLink.note) notesUi.openLink(pendingLink.note);
      else if (pendingLink.refused) notify(NOTES_WIRE_WORDS.notForYou(pendingLink.refused));
      pendingLink = null;
    }
  }
  const model = {
    frames: () => FRAMES,
    me,
    lexicon() {
      const n = me();
      const lex = lexiconOf(hero(), book, nb.learned(n), nb.friends(n));
      for (const [k, v] of lex) if (fresh.has(k)) lex.set(k, { ...v, isNew: true });
      return lex;
    },
    kindOf: (key) => (String(key).startsWith('n:') ? 'friend' : (book.get(key) || {}).kind),
    lineText: (p) => noteText({ parts: [p] }, book),
    text: (n) => noteText(n, book),
    friends: () => nb.friends(me()),
    hiddenCount: () => nb.data.hidden.length,
    unhideAll() { for (const h of [...nb.data.hidden]) nb.unhide(h); },
    leave({ at, parts, to = null, share = true }) {
      const lex = model.lexicon();
      if (!Array.isArray(parts) || parts.some((p) => !p || !lex.has(p[1]))) return null;   // words from this hero's own lexicon only
      const n = makeNote({ from: me(), at, parts, to, day: localDay() }, book);
      if (n.bad) return null;
      nb.leave({ ...n, share });
      if (share && api.onLeave) api.onLeave(syncOffer(nb, me()));
      return n;
    },
    async sendLink(n) {
      const url = encodeLink(loc, n);
      const text = NOTES_WIRE_WORDS.share(n.from);
      if (nav && typeof nav.share === 'function') {
        try { await nav.share({ title: 'Lexicon Realms', text, url }); notify(NOTES_WIRE_WORDS.shared); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
      }
      try { await nav.clipboard.writeText(`${text} ${url}`); notify(NOTES_WIRE_WORDS.copied); return 'copied'; } catch { notify(NOTES_WIRE_WORDS.failed); return 'failed'; }
    },
    posts() {
      frame();
      const e = hero();
      if (!e) return [];
      const out = [];
      const lift = is3d() ? 36 : 30;          // world px above the post's foot: the lamp's head in each renderer
      for (const l of lanternsOf(e.zone)) {
        const key = `${e.zone}:${l.id}`;
        const list = nb.at(key);
        if (!list.length) continue;
        const [px, py] = l.post || [l.x, l.y];
        // the seal sits over the lamp's head: up from the post's foot by the lift; in 3D a ground point to the north drifts
        // toward the middle of the screen while a tall post leans away from it, so x goes the other way (perspective)
        const [bx, by] = toHud(px * 16 + 8, py * 16 + 8), [nx, ny] = toHud(px * 16 + 8, py * 16 + 8 - lift);
        const x = is3d() ? bx - (nx - bx) * 2.4 : bx, y = ny;
        out.push({ key, x, y, n: list.length, unread: nb.unread(key).length > 0 });
      }
      return out;
    },
    near,
    notesAt: (key) => nb.at(key),
    isUnread: (n) => !nb.data.read.includes(n.id) && nb.data.got.includes(n),
    markRead: (id) => nb.markRead(id),
    hide: (name) => nb.hide(name),
    remove: (id) => nb.remove(id),
    placeName(at, withRegion = false) {
      const [zid] = String(at).split(':');
      const l = lanternAt(at);
      if (!l) return 'a lantern';
      const r = withRegion ? regionName(zid, l) : '';
      return r && r !== l.name ? `${l.name}, ${r}` : l.name;
    },
    ago: (day) => ago(day, localDay()),
  };
  notesUi.setModel(model);

  const api = {
    model, book, notebook: nb,
    /** co-op: this hero's own notes for friends (never notes it was given) */
    offer: () => (me() ? syncOffer(nb, me()) : []),
    /** co-op: a friend's notes; only notes written by that friend's hero are taken */
    take(list, from) {
      if (!from || from === me()) return 0;
      nb.friend(me(), from);
      const k = syncTake(nb, list, book, { from, me: myHeroes() });
      if (k) notify(NOTES_WIRE_WORDS.got(from));
      return k;
    },
    /** co-op: a friend in this game (Friends words, For...) */
    met(name) { if (me()) nb.friend(me(), name); },
    onLeave: null,
    key: NOTES_KEY,
  };
  return api;
}

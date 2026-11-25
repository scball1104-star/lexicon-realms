// Lantern notes (wave 9 notes lane; brief D:/LQOnline/wave9/notes/BRIEF.md, approved by Scott 2026-11-25): the model, pure
// (no DOM, no clock of its own), so node tests run it. The drawing is src/ui/notes_ui.js, the wiring src/ui/notes_wire.js,
// the co-op swap src/net/session.js { t:'notes' }. Every player-facing word here is a DRAFT for Scott.
//
// A note is one or two short sentences, each a sentence frame with one blank filled from the writer's lexicon (a closed
// word list the game owns). There is no free text anywhere in a note: only the writer's hero name (letters only, the
// save.js name rule) is not from the list. So a note cannot carry a link, a phone number, a rude word or a real name.
//
//   FRAMES, STARTER                    the sentence frames and the words every hero knows (DRAFT words for Scott)
//   wordBook(content, { doors })       every word a note may use: key -> { text, kind } (built from the game's own data)
//   lexiconOf(hero, book, learned)     the words THIS hero may write with (starter + what they have learned)
//   makeNote({ from, at, parts, to, day })   -> note | { bad }
//   noteText(note, book)               the note as one line of words
//   encodeLink(loc, note) / readLink(loc, book)   the #note= link (no server: the words ride in the link itself)
//   createNotebook(storage)            this device's notes: mine, got (from links or co-op), read, hidden writers
//   syncOffer(nb, hero) / syncTake(nb, list, book, { from, me })   what goes over the co-op link when friends play together
//
// How a note reaches a friend who was not online (no server): a link that carries the note itself after the # (the
// friend taps it; the note is filed on their device and waits on that lantern), and the swap when friends next play
// together (each game sends only notes its own player wrote; a game never passes on notes it was given).

export const NOTES_KEY = 'lexicon_realms.notes';   // own key and version (like the Shared tab): never in the hero save
export const NOTES_VERSION = 1;
export const LIMITS = Object.freeze({ mine: 20, got: 60, perLantern: 3, keepDays: 30, sentences: 2, linkMax: 400 });

/** Sentence frames (DRAFT). `{}` is the one blank; `kind` says which words fit it. */
export const FRAMES = [
  { id: 'beware', text: 'Beware the {}.', kind: 'foe' },
  { id: 'meet', text: 'Meet me at {}.', kind: 'place' },
  { id: 'when', text: 'I will be back {}.', kind: 'time' },
  { id: 'try', text: 'Try {} here.', kind: 'word' },
  { id: 'worth', text: '{} is worth the walk.', kind: 'place' },
  { id: 'going', text: 'I went on to {}.', kind: 'place' },
  { id: 'found', text: 'I found {} nearby.', kind: 'thing' },
  { id: 'thanks', text: 'Thank you, {}!', kind: 'friend' },
  { id: 'luck', text: 'Good luck, {}.', kind: 'friend' },
  { id: 'say', text: '{}', kind: 'thing', label: 'Just say ...' },
];

/** Words every hero knows from the start (DRAFT). kind 'time' and 'thing' are only these. */
export const STARTER = {
  's:tonight': ['tonight', 'time'], 's:tomorrow': ['tomorrow', 'time'], 's:weekend': ['this weekend', 'time'], 's:soon': ['soon', 'time'],
  's:treasure': ['treasure', 'thing'], 's:danger': ['danger', 'thing'], 's:shortcut': ['a shortcut', 'thing'], 's:rest': ['a good place to rest', 'thing'],
  's:welldone': ['Well done!', 'thing'], 's:waited': ['I waited for you.', 'thing'], 's:sorry': ['Sorry I missed you.', 'thing'], 's:hurry': ['No hurry.', 'thing'],
  's:friends': ['friends', 'friend'], 's:everyone': ['everyone', 'friend'],
};

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const NAME = /^[A-Z][a-z]{1,11}$/;              // the save.js name rule, as a hero name is shown (Capitalised, letters)

/** Every word a note may use, from the game's own data. Keys are stable ids, never text, so a link carries ids only. */
export function wordBook(content, { doors = null } = {}) {
  const book = new Map(Object.entries(STARTER).map(([k, [text, kind]]) => [k, { text, kind }]));
  for (const [zid, z] of Object.entries((content && content.zones) || {})) {
    for (const l of z.lanterns || []) if (l.name) book.set(`p:${zid}:${l.id}`, { text: l.name, kind: 'place' });
  }
  const tr = (content && content.travel) || {};
  for (const p of Object.values((tr.flight && tr.flight.points) || {})) if (p && p.id && p.name) book.set(`f:${p.id}`, { text: p.name.split(',')[0], kind: 'place' });
  for (const h of Object.values(tr.inns || {})) if (h && h.id && h.name) book.set(`h:${h.id}`, { text: h.name, kind: 'place' });
  for (const [id, m] of Object.entries((content && content.mobs) || {})) if (m && m.name && !m.boss && !m.hidden) book.set(`m:${id}`, { text: plural(m.name), kind: 'foe' });
  for (const w of Object.keys((content && content.glyphs && content.glyphs.words) || {})) book.set(`g:${w}`, { text: w, kind: 'word' });
  for (const d of Object.values(doors || {})) for (const w of d.words || []) if (/^[A-Z]{2,8}$/.test(w.word)) book.set(`d:${w.word}`, { text: w.word, kind: 'word' });
  return book;
}
/** "Gorse Boar" -> "Gorse Boars" (a simple English plural; a name already plural is kept). */
export function plural(s) {
  const t = String(s);
  if (/s$/i.test(t)) return t;
  if (/(ch|sh|x)$/i.test(t)) return `${t}es`;
  if (/[^aeiou]y$/i.test(t)) return `${t.slice(0, -1)}ies`;
  if (/wolf$/i.test(t)) return `${t.slice(0, -1)}ves`;
  return `${t}s`;
}

/** The words this hero may write with: the starter words, plus what they have learned (lanterns touched, flight points
 *  known, foes beaten, words spelled), plus the names of friends they have played with. learned: [key]. */
export function lexiconOf(hero, book, learned = [], friends = []) {
  const out = new Map();
  for (const [k, v] of book) if (k.startsWith('s:')) out.set(k, v);
  for (const k of learned) if (book.has(k)) out.set(k, book.get(k));
  for (const f of (hero && hero.flights) || []) if (book.has(`f:${f}`)) out.set(`f:${f}`, book.get(`f:${f}`));
  for (const n of friends) if (NAME.test(n)) out.set(`n:${n}`, { text: n, kind: 'friend' });
  return out;
}

/** A word's text: a book word, or a friend's name (n:Name, letters only). Null when it is neither. */
function wordText(key, book) {
  if (typeof key !== 'string') return null;
  if (key.startsWith('n:')) return NAME.test(key.slice(2)) ? key.slice(2) : null;
  const w = book.get(key);
  return w ? w.text : null;
}
function wordKind(key, book) { return key.startsWith('n:') ? 'friend' : (book.get(key) || {}).kind; }

/** parts: [[frameId, wordKey], ...] one or two. at: 'zone:lanternId'. to: a friend's name or null (all friends). */
export function makeNote({ from, at, parts, to = null, day }, book) {
  if (!NAME.test(String(from || ''))) return { bad: 'from' };
  if (!/^[a-z0-9_#]+:[a-z0-9_]+$/i.test(String(at || ''))) return { bad: 'at' };
  if (to != null && !NAME.test(String(to))) return { bad: 'to' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return { bad: 'day' };
  if (!Array.isArray(parts) || !parts.length || parts.length > LIMITS.sentences) return { bad: 'parts' };
  for (const p of parts) {
    const f = FRAMES.find((x) => x.id === (p && p[0]));
    if (!f || wordText(p[1], book) == null || wordKind(p[1], book) !== f.kind) return { bad: 'word' };
  }
  const note = { v: 1, from, at, parts: parts.map((p) => [p[0], p[1]]), to, day };
  note.id = noteId(note);
  return note;
}
/** A short id from the note's own content (the same note from two routes is one note). */
export function noteId(n) {
  const s = `${n.from}|${n.at}|${n.day}|${n.to || ''}|${n.parts.map((p) => p.join('=')).join(';')}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}
export function noteText(n, book) {
  return n.parts.map(([fid, k]) => {
    const f = FRAMES.find((x) => x.id === fid);
    const w = wordText(k, book) || '';
    const s = f.text.replace('{}', w);
    return s[0].toUpperCase() + s.slice(1);
  }).join(' ');
}
/** "today", "yesterday", "3 days ago" (the reader's own calendar day; no times are ever sent). DRAFT words. */
export function ago(day, today) {
  const d = Math.round((Date.parse(today) - Date.parse(day)) / 86400000);
  if (!(d > 0)) return 'today';
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// ---------------------------------------------------------------- the link (no server: the note rides in the #)
const b64u = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return typeof atob === 'function' ? decodeURIComponent(escape(atob(t))) : Buffer.from(t, 'base64').toString('utf8'); };

/** 'https://site/path/#note=...' : the note's ids only (name, lantern, frame and word ids, the day). */
export function encodeLink(loc, n) {
  const packed = [n.v, n.from, n.at, n.day, n.to || '', ...n.parts.map((p) => `${p[0]}=${p[1]}`)].join('~');
  return `${loc.origin}${loc.pathname}#note=${b64u(packed)}`;
}
/** The note a link carries, checked word by word against this game's own list; null for anything else. */
export function readLink(loc, book) {
  const h = String((loc && loc.hash) || '').replace(/^#/, '');
  const m = /(?:^|&)note=([A-Za-z0-9_-]{8,400})(?:&|$)/.exec(h);
  if (!m) return null;
  let s;
  try { s = unb64u(m[1]); } catch { return null; }
  const f = s.split('~');
  if (f.length < 6 || f[0] !== '1') return null;
  const parts = f.slice(5).map((x) => x.split('='));
  const n = makeNote({ from: f[1], at: f[2], day: f[3], to: f[4] || null, parts }, book);
  return n.bad ? null : n;
}

// ---------------------------------------------------------------- this device's notebook
/** The viewer's own calendar day, 'yyyy-mm-dd' (local, never UTC: an evening note must not say tomorrow). */
export function localDay(d = new Date()) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

export function createNotebook(storage, { today = () => localDay() } = {}) {
  let d = load();
  function load() {
    const empty = { v: NOTES_VERSION, mine: [], got: [], read: [], hidden: [], learned: {}, friends: {} };
    let raw = null;
    try { raw = storage ? storage.getItem(NOTES_KEY) : null; } catch { raw = null; }
    if (raw == null) return empty;
    let o = null;
    try { o = JSON.parse(raw); } catch { o = null; }
    if (!isObj(o) || o.v !== NOTES_VERSION) { try { if (storage.getItem(`${NOTES_KEY}.bad`) == null) storage.setItem(`${NOTES_KEY}.bad`, String(raw)); } catch { /* */ } return empty; }
    return { ...empty, ...o };
  }
  const save = () => { try { if (storage) storage.setItem(NOTES_KEY, JSON.stringify(d)); return true; } catch { return false; } };
  const fresh = (n) => (Date.parse(today()) - Date.parse(n.day)) / 86400000 <= LIMITS.keepDays;
  function prune() {
    d.mine = d.mine.filter(fresh).slice(-LIMITS.mine);
    d.got = d.got.filter(fresh).slice(-LIMITS.got);
    const ids = new Set([...d.mine, ...d.got].map((n) => n.id));
    d.read = d.read.filter((id) => ids.has(id));
  }
  return {
    get data() { return d; },
    leave(n) { d.mine = d.mine.filter((x) => x.id !== n.id); d.mine.push({ ...n, share: n.share !== false }); prune(); save(); return n; },
    /** a note from a link or from co-op. Refused: hidden writer, a note "to" someone else's hero, or a duplicate. */
    take(n, { me = [] } = {}) {
      if (!n || d.hidden.includes(n.from)) return false;
      if (n.to && me.length && !me.includes(n.to)) return false;
      if (me.includes(n.from)) return false;                  // my own hero's note: it is in mine already
      if (d.got.some((x) => x.id === n.id)) return false;
      d.got.push(n); prune(); save(); return true;
    },
    /** notes to show at one lantern for this viewer: newest first, at most perLantern, mine included */
    at(key) { return [...d.got, ...d.mine].filter((n) => n.at === key && !d.hidden.includes(n.from) && fresh(n)).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, LIMITS.perLantern); },
    unread(key) { return this.at(key).filter((n) => !d.read.includes(n.id) && d.got.includes(n)); },
    markRead(id) { if (!d.read.includes(id)) { d.read.push(id); save(); } },
    hide(name) { if (NAME.test(name) && !d.hidden.includes(name)) { d.hidden.push(name); d.got = d.got.filter((n) => n.from !== name); save(); } },
    unhide(name) { d.hidden = d.hidden.filter((x) => x !== name); save(); },
    remove(id) { d.mine = d.mine.filter((n) => n.id !== id); d.got = d.got.filter((n) => n.id !== id); save(); },
    learn(hero, key) { const L = d.learned[hero] || (d.learned[hero] = []); if (!L.includes(key)) { L.push(key); save(); } },
    learned(hero) { return d.learned[hero] || []; },
    /** names of friends this hero has played with (the Friends words and the For... choices) */
    friend(hero, name) { if (!NAME.test(String(name)) || name === hero) return; const F = d.friends[hero] || (d.friends[hero] = []); if (!F.includes(name)) { F.push(name); if (F.length > 12) F.shift(); save(); } },
    friends(hero) { return d.friends[hero] || []; },
  };
}

/** Co-op: what this game offers friends it is playing with now: the notes ITS OWN hero wrote and left for friends. Never
 *  notes it was given (a game never passes on notes from someone the others may not know), never "Just me" notes. */
export function syncOffer(nb, hero) {
  return nb.data.mine.filter((n) => n.from === hero && n.share !== false).map(({ share, ...n }) => n).slice(-LIMITS.mine);
}
/** Co-op: notes a friend's game sent. Each is rebuilt from its parts and checked like a link; only notes written by the
 *  sender's own hero are taken (from). Returns how many were new. */
export function syncTake(nb, list, book, { from = null, me = [] } = {}) {
  let k = 0;
  for (const raw of Array.isArray(list) ? list.slice(0, LIMITS.mine) : []) {
    if (!isObj(raw) || (from != null && raw.from !== from)) continue;
    const n = makeNote({ from: raw.from, at: raw.at, parts: raw.parts, to: raw.to || null, day: raw.day }, book);
    if (!n.bad && nb.take(n, { me })) k++;
  }
  return k;
}
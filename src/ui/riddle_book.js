// The riddle book (wave 9 riddles; D:/LQOnline/wave9/riddles/BRIEF.md): what this device keeps, and the #riddle= link.
// Pure apart from the storage object passed in, so node tests run it. Never sent anywhere; never inside a hero save.
//
//   const book = createRiddleBook(storage)     localStorage key `lexicon_realms.riddles`, versioned
//   book.made                 trails written here: { id, by, title, end, stones: [{ zone, tx, ty, clue: [2], hint, answer }] }
//                             (the plain answers live ONLY here, on the author's device)
//   book.got                  trails received: { rid, code, by, title, n, k, keys: [words solved here], done, added }
//   book.hidden               hero names whose riddles this device does not show (Hide riddles from <name>)
//   book.saveMade(d) / book.dropMade(id) / book.addGot(u, code, at) / book.progress(rid, keys, done) / book.dropGot(rid)
//   book.hide(name) / book.isHidden(name) / book.solvedHere()
//   riddleLink(loc, code) / readRiddle(loc) / clearRiddle(win)   the link helpers (the code sits after #, as #join=)
export const RIDDLE_KEY = 'lexicon_realms.riddles';
export const RIDDLE_HASH = 'riddle';
const MAX_MADE = 12, MAX_GOT = 40, MAX_HIDDEN = 50;

export function createRiddleBook(storage) {
  let data = { v: 1, made: [], got: [], hidden: [] };
  try {
    const raw = storage ? storage.getItem(RIDDLE_KEY) : null;
    const o = raw ? JSON.parse(raw) : null;
    if (o && o.v === 1 && Array.isArray(o.made) && Array.isArray(o.got) && Array.isArray(o.hidden)) data = o;
  } catch { /* a broken or blocked book starts empty; it is never overwritten until something new is saved */ }
  const write = () => { try { if (storage) storage.setItem(RIDDLE_KEY, JSON.stringify(data)); return true; } catch { return false; } };
  const low = (s) => String(s || '').trim().toLowerCase();
  return {
    get made() { return data.made; },
    get got() { return data.got; },
    get hidden() { return data.hidden; },
    saveMade(d) {
      const i = data.made.findIndex((m) => m.id === d.id);
      const copy = JSON.parse(JSON.stringify(d));
      if (i >= 0) data.made[i] = copy; else { data.made.unshift(copy); data.made.length = Math.min(data.made.length, MAX_MADE); }
      return write();
    },
    dropMade(id) { data.made = data.made.filter((m) => m.id !== id); return write(); },
    addGot(u, code, at = 0) {
      if (data.got.some((g) => g.rid === u.id)) return false;
      data.got.unshift({ rid: u.id, code, by: u.by, title: u.title, n: u.n, k: 0, keys: [], done: false, added: at });
      data.got.length = Math.min(data.got.length, MAX_GOT);
      return write();
    },
    progress(rid, keys, done = false) {
      const g = data.got.find((x) => x.rid === rid);
      if (!g) return false;
      if (Array.isArray(keys) && keys.length >= g.keys.length) { g.keys = keys.map((w) => String(w).toUpperCase()); g.k = keys.length; }
      if (done) { g.done = true; g.k = g.n; }
      return write();
    },
    dropGot(rid) { data.got = data.got.filter((g) => g.rid !== rid); return write(); },
    hide(name) { const n = low(name); if (n && !data.hidden.includes(n)) { data.hidden.push(n); data.hidden.length = Math.min(data.hidden.length, MAX_HIDDEN); } return write(); },
    isHidden(name) { return data.hidden.includes(low(name)); },
    /** Trails to put out in this world when a game starts: not done, not hidden, most recent first. */
    toPutOut(max) { return data.got.filter((g) => !g.done && !data.hidden.includes(low(g.by))).slice(0, max); },
  };
}

export function riddleLink(loc, code) { return `${loc.origin}${loc.pathname}#${RIDDLE_HASH}=${code}`; }
export function readRiddle(loc) {
  const h = String((loc && loc.hash) || '').replace(/^#/, '');
  const m = new RegExp(`(?:^|&)${RIDDLE_HASH}=([^&]*)`).exec(h);
  if (!m) return null;
  let raw = m[1];
  try { raw = decodeURIComponent(raw); } catch { /* keep as is */ }
  return raw.length > 4100 ? null : raw;
}
/** A code pasted anywhere (a whole link, a file's text, or the bare code): the r1. code, or null. */
export function codeIn(text) {
  const m = /r1\.[A-Za-z0-9_-]+\.[0-9a-z]+/.exec(String(text || ''));
  return m ? m[0] : null;
}
export function clearRiddle(win = globalThis.window) {
  try {
    if (!win || !readRiddle(win.location)) return;
    win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}`);
  } catch { /* a page without history: the link stays, which is harmless */ }
}

// Local characters and options (localStorage, versioned). Pure apart from the storage object passed in, so Node tests
// run it with a fake storage.
//
//   const store = createCharStore(window.localStorage)
//   store.list()  store.add({ name, cls, look })  store.remove(id)  store.update(id, patch)  store.get(id)
//   validateName('scott', store.list()) -> { ok: true, name: 'Scott' } | { ok: false, reason }
//
// Schema v1 (key `lexicon_realms.chars`):
//   { v: 1, nextId: 3, chars: [{ id, name, cls, look, level, xp, zone, x, y, createdSeq, lastPlayedSeq }] }
// `x, y` are tiles (null = the class start spot). Seqs are counters, not wall-clock times.
// A corrupt or newer-version blob is never overwritten: it is copied to `<key>.bad` and the list starts empty.

export const CHAR_KEY = 'lexicon_realms.chars';
export const OPTIONS_KEY = 'lexicon_realms.options';
export const SAVE_VERSION = 1;
export const MAX_CHARS = 6;
export const NAME_MIN = 2, NAME_MAX = 12;
export const CLASS_IDS = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
export const LOOKS = 3;

/** Player names: letters only, 2 to 12, shown as Capitalised. Unique per PC (case-insensitive). */
export function validateName(raw, existing = []) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { ok: false, reason: 'Enter a name.' };
  if (!/^[A-Za-z]+$/.test(s)) return { ok: false, reason: 'Letters only, no spaces or numbers.' };
  if (s.length < NAME_MIN) return { ok: false, reason: `At least ${NAME_MIN} letters.` };
  if (s.length > NAME_MAX) return { ok: false, reason: `At most ${NAME_MAX} letters.` };
  const name = s[0].toUpperCase() + s.slice(1).toLowerCase();
  if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) return { ok: false, reason: 'You already have a hero with that name.' };
  return { ok: true, name };
}

function blank() { return { v: SAVE_VERSION, nextId: 1, seq: 0, chars: [] }; }

/** Bring any stored blob to the current schema, or report why not. */
export function migrate(raw) {
  if (raw == null) return { data: blank(), bad: false };
  let o;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { data: blank(), bad: true }; }
  if (!o || typeof o !== 'object' || !Array.isArray(o.chars)) return { data: blank(), bad: true };
  if (o.v !== SAVE_VERSION) return { data: blank(), bad: true };       // newer or unknown: keep it aside, never clobber
  const chars = o.chars.filter((c) => c && typeof c.name === 'string' && CLASS_IDS.includes(c.cls)).slice(0, MAX_CHARS)
    .map((c) => ({ id: c.id | 0, name: c.name, cls: c.cls, look: Math.max(0, Math.min(LOOKS - 1, c.look | 0)), level: Math.max(1, c.level | 0 || 1),
      xp: c.xp | 0, zone: c.zone || null, zoneName: c.zoneName || null, x: c.x ?? null, y: c.y ?? null, createdSeq: c.createdSeq | 0, lastPlayedSeq: c.lastPlayedSeq | 0,
      // the full character (CONTRACTS 2.4 addPlayer restore: gold, bag, equip, known, bar, talents, quests, lantern ...) and the one-time hint flag
      ...(c.state && typeof c.state === 'object' ? { state: c.state } : {}), ...(c.hinted ? { hinted: true } : {}) }));
  const nextId = Math.max(o.nextId | 0, 1 + Math.max(0, ...chars.map((c) => c.id)));
  return { data: { v: SAVE_VERSION, nextId, seq: o.seq | 0, chars }, bad: false };
}

export function createCharStore(storage) {
  const read = () => {
    let raw = null;
    try { raw = storage ? storage.getItem(CHAR_KEY) : null; } catch { raw = null; }
    const { data, bad } = migrate(raw);
    if (bad && raw != null) { try { storage.setItem(CHAR_KEY + '.bad', String(raw)); } catch { /* full or blocked */ } }
    return data;
  };
  let data = read();
  const write = () => { try { if (storage) storage.setItem(CHAR_KEY, JSON.stringify(data)); return true; } catch { return false; } };
  return {
    get data() { return data; },
    reload() { data = read(); return data; },
    /** Most recently played first. */
    list() { return [...data.chars].sort((a, b) => b.lastPlayedSeq - a.lastPlayedSeq || a.id - b.id); },
    get(id) { return data.chars.find((c) => c.id === id) || null; },
    full() { return data.chars.length >= MAX_CHARS; },
    add({ name, cls, look }) {
      if (data.chars.length >= MAX_CHARS) return { ok: false, reason: `You can keep ${MAX_CHARS} heroes on this PC.` };
      const v = validateName(name, data.chars);
      if (!v.ok) return v;
      if (!CLASS_IDS.includes(cls)) return { ok: false, reason: 'Pick a class.' };
      const c = { id: data.nextId++, name: v.name, cls, look: Math.max(0, Math.min(LOOKS - 1, look | 0)), level: 1, xp: 0,
        zone: null, x: null, y: null, createdSeq: ++data.seq, lastPlayedSeq: data.seq };
      data.chars.push(c);
      write();
      return { ok: true, char: c };
    },
    remove(id) { const n = data.chars.length; data.chars = data.chars.filter((c) => c.id !== id); write(); return data.chars.length < n; },
    update(id, patch) { const c = data.chars.find((o) => o.id === id); if (!c) return null; Object.assign(c, patch); write(); return c; },
    touch(id) { return this.update(id, { lastPlayedSeq: ++data.seq }); },
  };
}

// ---------------------------------------------------------------- options

export const DEFAULT_OPTIONS = Object.freeze({
  v: 1, music: 0.7, sfx: 0.8, zoom: 1, fx: 'high',
  binds: {},                 // action -> KeyboardEvent.code overrides (see keymap.js ACTIONS for defaults)
});

export function loadOptions(storage) {
  let o = null;
  try { o = JSON.parse(storage.getItem(OPTIONS_KEY) || 'null'); } catch { o = null; }
  if (!o || o.v !== 1) return JSON.parse(JSON.stringify(DEFAULT_OPTIONS));
  return { ...JSON.parse(JSON.stringify(DEFAULT_OPTIONS)), ...o, binds: { ...(o.binds || {}) } };
}
export function saveOptions(storage, o) { try { storage.setItem(OPTIONS_KEY, JSON.stringify(o)); return true; } catch { return false; } }

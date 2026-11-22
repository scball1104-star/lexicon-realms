// Local characters and options (localStorage, versioned). Pure apart from the storage object passed in, so Node tests
// run it with a fake storage.
//
//   const store = createCharStore(window.localStorage)
//   store.list()  store.add({ name, cls, look })  store.remove(id)  store.update(id, patch)  store.get(id)
//   validateName('scott', store.list()) -> { ok: true, name: 'Scott' } | { ok: false, reason }
//
// Schema v2 (key `lexicon_realms.chars`; Builds 2, docs/design/BUILDS_2.md section 8):
//   { v: 2, nextId: 3, seq: 9, chars: [{ id, name, cls, look, level, xp, zone, zoneName, x, y, createdSeq, lastPlayedSeq,
//     state?, hinted?, build?, migratedFrom? }] }
//   state: the full character (CONTRACTS 2.4 addPlayer restore) with `v: 2` and `build` (src/data/builds2.js newBuild:
//   talent ranks, undo, skill picks, signatures, leaning, auto-spend, respec counter, free respec flag).
//   build at the top level: only for a v1 hero that never entered the world (no state yet); entering moves it into state.
// `x, y` are tiles (null = the class start spot). Seqs are counters, not wall-clock times.
//
// v1 -> v2 (migrateV1): every hero keeps name, class, look, level, XP, gold, gear, bags, quests and position; a build is
// added with a one-time free respec flagged (`freeRespecWhy: 'builds2'`), because today's talents are retired by Builds 2.
// The v1 blob is copied to `<key>.v1` the first time it is migrated, so a rollback can always get it back.
// A corrupt, unknown or newer-version blob is never overwritten: it is copied to `<key>.bad` and the list starts empty.
import { buildFromV1 } from '../data/builds2.js';

export const CHAR_KEY = 'lexicon_realms.chars';
export const OPTIONS_KEY = 'lexicon_realms.options';
export const SAVE_VERSION = 2;
export const STATE_VERSION = 2;                  // the per-hero `state` blob (main.js saveState)
export const MAX_CHARS = 6;
export const NAME_MIN = 2, NAME_MAX = 12;
export const CLASS_IDS = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
export const LOOKS = 3;
export const BAR_SLOTS = 8;                      // the skill bar (was 6): a save carries 8 slots, an empty slot is null

/** A bar as saved: exactly BAR_SLOTS entries (ability id, `item:<itemId>` for an item on the bar, or null). An old 6-slot
 *  bar pads with empty slots. */
export function padBar(bar) {
  const ids = Array.isArray(bar) ? bar.slice(0, BAR_SLOTS).map((id) => (typeof id === 'string' && id ? id : null)) : [];
  while (ids.length < BAR_SLOTS) ids.push(null);
  return ids;
}
const barOk = (bar) => Array.isArray(bar) && bar.length === BAR_SLOTS;
/** A hero's state with its bar at 8 slots (unchanged when it already is). */
const withBar = (s) => (isObj(s) && Array.isArray(s.bar) && !barOk(s.bar) ? { ...s, bar: padBar(s.bar) } : s);

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

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const validChar = (c) => isObj(c) && typeof c.name === 'string' && CLASS_IDS.includes(c.cls);

/** One v1 hero in the v2 shape. Nothing the hero earned is dropped: every field of the old state is kept. */
export function migrateCharV1(c) {
  const out = { id: c.id | 0, name: c.name, cls: c.cls, look: Math.max(0, Math.min(LOOKS - 1, c.look | 0)), level: Math.max(1, c.level | 0 || 1),
    xp: c.xp | 0, zone: c.zone || null, zoneName: c.zoneName || null, x: c.x ?? null, y: c.y ?? null, createdSeq: c.createdSeq | 0, lastPlayedSeq: c.lastPlayedSeq | 0,
    ...(c.hinted ? { hinted: true } : {}), migratedFrom: 1 };
  const s = isObj(c.state) ? c.state : null;
  if (s) {
    const level = Math.max(1, (s.level | 0) || out.level);
    const build = buildFromV1({ cls: c.cls, level, xp: s.xp | 0, known: Array.isArray(s.known) ? s.known : [], talents: isObj(s.talents) ? s.talents : {},
      questsDone: Array.isArray(s.questsDone) ? s.questsDone : [] });
    out.state = { ...s, v: STATE_VERSION, build, ...(Array.isArray(s.bar) ? { bar: padBar(s.bar) } : {}) };
  } else {
    out.build = buildFromV1({ cls: c.cls, level: out.level, xp: out.xp });
  }
  return out;
}

/** Bring any stored blob to the current schema, or report why not. `migrated` names the version it came from. */
export function migrate(raw) {
  if (raw == null) return { data: blank(), bad: false };
  let o;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { data: blank(), bad: true }; }
  if (!isObj(o) || !Array.isArray(o.chars)) return { data: blank(), bad: true };
  if (o.v === 1) {
    const chars = o.chars.filter(validChar).slice(0, MAX_CHARS).map(migrateCharV1);
    const nextId = Math.max(o.nextId | 0, 1 + Math.max(0, ...chars.map((c) => c.id)));
    return { data: { v: SAVE_VERSION, nextId, seq: o.seq | 0, chars }, bad: false, migrated: 1 };
  }
  if (o.v !== SAVE_VERSION) return { data: blank(), bad: true };       // newer or unknown: keep it aside, never clobber
  // already v2: loaded as stored (a valid blob comes back unchanged); only entries that cannot be a hero are dropped
  // a bar saved before the bar grew to 8 slots pads with empty slots (the hero's skills fill them when it loads)
  const chars = o.chars.filter(validChar).slice(0, MAX_CHARS).map((c) => (c.state && withBar(c.state) !== c.state ? { ...c, state: withBar(c.state) } : c));
  if (chars.length === o.chars.length && chars.every((c, i) => c === o.chars[i]) && Number.isInteger(o.nextId) && o.nextId > Math.max(0, ...chars.map((c) => c.id | 0))) return { data: o, bad: false };
  const nextId = Math.max(o.nextId | 0, 1 + Math.max(0, ...chars.map((c) => c.id | 0)));
  return { data: { ...o, nextId, chars }, bad: false };
}

export function createCharStore(storage) {
  const read = () => {
    let raw = null;
    try { raw = storage ? storage.getItem(CHAR_KEY) : null; } catch { raw = null; }
    const { data, bad, migrated } = migrate(raw);
    if (bad && raw != null) { try { storage.setItem(CHAR_KEY + '.bad', String(raw)); } catch { /* full or blocked */ } }
    // keep the old blob once, then write the new one so the next load is a plain v2 load
    if (migrated && raw != null) {
      try { if (storage.getItem(CHAR_KEY + '.v1') == null) storage.setItem(CHAR_KEY + '.v1', String(raw)); } catch { /* full or blocked */ }
      try { storage.setItem(CHAR_KEY, JSON.stringify(data)); } catch { /* the migrated list still loads from memory */ }
    }
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
    add({ name, cls, look, start = null }) {
      if (data.chars.length >= MAX_CHARS) return { ok: false, reason: `You can keep ${MAX_CHARS} heroes on this PC.` };
      const v = validateName(name, data.chars);
      if (!v.ok) return v;
      if (!CLASS_IDS.includes(cls)) return { ok: false, reason: 'Pick a class.' };
      const c = { id: data.nextId++, name: v.name, cls, look: Math.max(0, Math.min(LOOKS - 1, look | 0)), level: 1, xp: 0,
        zone: null, x: null, y: null, createdSeq: ++data.seq, lastPlayedSeq: data.seq,
        ...(start === 'realm' || start === 'willowmere' ? { start } : {}) };   // big world: the class's start realm or Willowmere (optional)
      data.chars.push(c);
      write();
      return { ok: true, char: c };
    },
    remove(id) { const n = data.chars.length; data.chars = data.chars.filter((c) => c.id !== id); write(); return data.chars.length < n; },
    update(id, patch) { const c = data.chars.find((o) => o.id === id); if (!c) return null; Object.assign(c, patch); write(); return c; },
    touch(id) { return this.update(id, { lastPlayedSeq: ++data.seq }); },
  };
}

// ---------------------------------------------------------------- the Shared chest tab
// Every hero on this device sees one Shared tab of the Lantern Chest (src/sim/storage.js). It lives OUTSIDE the hero list,
// under its own key with its own version, so deleting a hero never deletes shared items and two heroes never write a
// stale copy over each other. NEVER fold it into CHAR_KEY or bump SAVE_VERSION for it: load() treats any other `v` as
// unknown and the hero list comes up empty. Schema v1: { v: 1, rows, items: [{ item, qty, inst? }], glyphs: [{ item, qty }] }.
// A corrupt or newer blob is copied to `<key>.bad` once and the tab starts empty (never overwritten unseen).
export const SHARED_KEY = 'lexicon_realms.shared';
export const SHARED_VERSION = 1;

/** The Shared tab from storage: { rows, items, glyphs } (empty when there is none). */
export function loadShared(storage) {
  const empty = { rows: 0, items: [], glyphs: [] };
  let raw = null;
  try { raw = storage ? storage.getItem(SHARED_KEY) : null; } catch { raw = null; }
  if (raw == null) return empty;
  let o = null;
  try { o = JSON.parse(raw); } catch { o = null; }
  if (!isObj(o) || o.v !== SHARED_VERSION) {
    try { if (storage.getItem(SHARED_KEY + '.bad') == null) storage.setItem(SHARED_KEY + '.bad', String(raw)); } catch { /* full or blocked */ }
    return { ...empty, bad: true };
  }
  return { rows: Math.max(0, o.rows | 0), items: Array.isArray(o.items) ? o.items : [], glyphs: Array.isArray(o.glyphs) ? o.glyphs : [] };
}
/** Write the Shared tab (main.js calls it on every chest event that touched it). False when storage refused. */
export function saveShared(storage, tab) {
  if (!storage || !tab) return false;
  try { storage.setItem(SHARED_KEY, JSON.stringify({ v: SHARED_VERSION, rows: tab.rows | 0, items: tab.items || [], glyphs: tab.glyphs || [] })); return true; } catch { return false; }
}

// ---------------------------------------------------------------- options

export const DEFAULT_OPTIONS = Object.freeze({
  v: 1, music: 0.7, sfx: 0.8, zoom: 1, fx: 'high',
  r3d: false,                // the 3D preview renderer (Scott 2026-11-19: a switch in Settings instead of the ?r=3d link)
  binds: {},                 // action -> KeyboardEvent.code overrides (see keymap.js ACTIONS for defaults)
});

export function loadOptions(storage) {
  let o = null;
  try { o = JSON.parse(storage.getItem(OPTIONS_KEY) || 'null'); } catch { o = null; }
  if (!o || o.v !== 1) return JSON.parse(JSON.stringify(DEFAULT_OPTIONS));
  return { ...JSON.parse(JSON.stringify(DEFAULT_OPTIONS)), ...o, binds: { ...(o.binds || {}) } };
}
export function saveOptions(storage, o) { try { storage.setItem(OPTIONS_KEY, JSON.stringify(o)); return true; } catch { return false; } }

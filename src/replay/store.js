// Kept replays (wave 8, replay lane): the browser's own IndexedDB on this device, no server. Bounded: the newest 40
// unpinned recordings (and at most 12 MB of them), plus up to 20 pinned ("Keep forever") ones in at most 40 MB. A pinned
// one is never cleared out to make room. Node tests use the memory backend.
//
//   const S = createReplayStore()                 IndexedDB when the page has it, else memory
//   await S.list()   -> [meta + { bytes, pinned, build }], newest first
//   await S.put(file) -> the stored row (gzipped with format.js pack); clears out the oldest unpinned past the limits
//   await S.get(id)  -> the file          await S.pin(id, bakedFile) -> { ok } | { ok: false, why }
//   await S.remove(id)                     await S.usage() -> { kept, pinned, bytes }
import { pack, unpack } from './format.js';

export const KEEP = 40;
export const KEEP_BYTES = 12 * 1024 * 1024;
export const PIN_MAX = 20;
export const PIN_BYTES = 40 * 1024 * 1024;
const DB = 'lexicon_realms_replays';

export function memoryBackend() {
  const S = { meta: new Map(), data: new Map() };
  return {
    async all(store) { return [...S[store].values()]; },
    async get(store, key) { return S[store].get(key) ?? null; },
    async put(store, key, val) { S[store].set(key, val); },
    async del(store, key) { S[store].delete(key); },
  };
}

function idbBackend(idb) {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = idb.open(DB, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta'); if (!d.objectStoreNames.contains('data')) d.createObjectStore('data'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const req = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => { const t = d.transaction(store, mode); const r = fn(t.objectStore(store)); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  };
  return {
    all: (store) => req(store, 'readonly', (s) => s.getAll()).then((v) => v || []),
    get: (store, key) => req(store, 'readonly', (s) => s.get(key)).then((v) => v ?? null),
    put: (store, key, val) => req(store, 'readwrite', (s) => s.put(val, key)),
    del: (store, key) => req(store, 'readwrite', (s) => s.delete(key)),
  };
}

export function createReplayStore({ backend = null } = {}) {
  let B = backend;
  if (!B) { try { B = globalThis.indexedDB ? idbBackend(globalThis.indexedDB) : memoryBackend(); } catch { B = memoryBackend(); } }
  const sortNew = (a, b) => b.when - a.when;
  const S = {
    async list() { return (await B.all('meta')).sort(sortNew); },
    async usage() {
      const rows = await S.list();
      return { kept: rows.filter((r) => !r.pinned).length, pinned: rows.filter((r) => r.pinned).length, bytes: rows.reduce((s, r) => s + (r.bytes || 0), 0) };
    },
    async put(file, { friend = false } = {}) {
      const bytes = await pack(file);
      const row = { ...file.meta, friend: friend || !!file.meta.friend, build: file.build, bytes: bytes.length, pinned: false, baked: !!file.baked };
      await B.put('data', row.id, bytes);
      await B.put('meta', row.id, row);
      await S.prune();
      return row;
    },
    /** Clear out the oldest unpinned rows past KEEP or KEEP_BYTES. Returns how many went. */
    async prune() {
      const rows = (await S.list()).filter((r) => !r.pinned);
      let n = 0, bytes = 0;
      for (let i = 0; i < rows.length; i++) {
        bytes += rows[i].bytes || 0;
        if (i >= KEEP || (i > 0 && bytes > KEEP_BYTES)) { await S.remove(rows[i].id); n++; }
      }
      return n;
    },
    async get(id) { const b = await B.get('data', id); return b ? unpack(b) : null; },
    async pin(id, baked) {
      const row = await B.get('meta', id);
      if (!row) return { ok: false, why: 'gone' };
      const rows = (await S.list()).filter((r) => r.pinned && r.id !== id);
      const bytes = await pack(baked);
      if (rows.length >= PIN_MAX) return { ok: false, why: 'count' };
      if (rows.reduce((s, r) => s + r.bytes, 0) + bytes.length > PIN_BYTES) return { ok: false, why: 'bytes' };
      await B.put('data', id, bytes);
      await B.put('meta', id, { ...row, pinned: true, baked: true, bytes: bytes.length });
      return { ok: true, bytes: bytes.length };
    },
    async remove(id) { await B.del('data', id); await B.del('meta', id); },
  };
  return S;
}

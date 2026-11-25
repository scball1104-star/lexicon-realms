// Kept nights (wave 9 chronicle lane): the browser's own IndexedDB on this device, no server. Bounded: the newest KEEP
// nights; the oldest is cleared first. A night is its words' ingredients plus its stills (JPEG data URLs, at most 6, about
// 30 to 110 KB each). Node tests use the memory backend.
//
//   const S = createChronicleStore()            IndexedDB when the page has it, else memory
//   await S.put(row)    a night (journal.js toRow); replaces the row with the same id; clears out past KEEP
//   await S.list()      -> rows without stills, newest first: { id, startMs, endMs, finished, heroes, chapters }
//   await S.get(id)     -> the full row (stills too)          await S.remove(id)
export const KEEP = 12;
const DB = 'lexicon_realms_chronicle';

export function memoryBackend() {
  const M = new Map();
  return { async all() { return [...M.values()]; }, async get(k) { return M.get(k) ?? null; }, async put(k, v) { M.set(k, v); }, async del(k) { M.delete(k); } };
}

function idbBackend(idb) {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = idb.open(DB, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('nights')) d.createObjectStore('nights'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const req = async (mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => { const t = d.transaction('nights', mode); const r = fn(t.objectStore('nights')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  };
  return {
    all: () => req('readonly', (s) => s.getAll()).then((v) => v || []),
    get: (k) => req('readonly', (s) => s.get(k)).then((v) => v ?? null),
    put: (k, v) => req('readwrite', (s) => s.put(v, k)),
    del: (k) => req('readwrite', (s) => s.delete(k)),
  };
}

export function createChronicleStore({ backend = null } = {}) {
  let B = backend;
  if (!B) { try { B = globalThis.indexedDB ? idbBackend(globalThis.indexedDB) : memoryBackend(); } catch { B = memoryBackend(); } }
  const brief = (r) => ({ id: r.id, startMs: r.startMs, endMs: r.endMs, finished: !!r.finished, heroes: r.heroes, openPlace: r.openPlace,
    chapters: (r.moments || []).filter((m) => m.wantShot).length, moments: (r.moments || []).length });
  return {
    async put(row) {
      await B.put(row.id, row);
      const all = (await B.all()).sort((a, b) => b.startMs - a.startMs);
      for (const old of all.slice(KEEP)) await B.del(old.id);
      return brief(row);
    },
    async list() { return (await B.all()).sort((a, b) => b.startMs - a.startMs).map(brief); },
    async get(id) { return B.get(id); },
    async remove(id) { return B.del(id); },
  };
}

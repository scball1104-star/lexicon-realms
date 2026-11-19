// Import a Lexicon Quest field map as a Lexicon Realms zone object (dev tool; never at runtime).
//
//   node tools/dev/import_lq_maps.mjs          rebuilds the whole world (same as node tools/maps/build_world.mjs)
//
// `importLqMap(id)` reads D:\LexiconQuest\next (READ ONLY: it imports LQ's own map loader and collision builder and
// writes nothing there) and returns the plain zone object: LQ's ground rows, legend, overlays, decor, overhead, a baked
// collision grid, the LQ exits as `joins`, and LQ's NPC and enemy spots under `lq`. tools/maps/build_world.mjs calls it
// for Willowmere (kept exactly as LQ draws it, plus the Realms patch: the west gate and the joins), generates the grown
// valley, the Downs and the High Moor itself, then writes src/data/maps/*.js and the trimmed assets/tiles/tiles.json.
//
// Collision chars (docs/CONTRACTS.md section 6): '.' walk, '#' solid, '~' water (blocks), 'v' ledge south,
// '>' ledge east, '<' ledge west (one-way: enterable only moving that way).
// LQ's x1/x2 expansion edits are OFF in Node (their packs never load here), so a map imports as its baseline.
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const LQ = 'D:/LexiconQuest/next';
const CODE_CHAR = { none: '.', solid: '#', water: '~', ledge_s: 'v', ledge_e: '>', ledge_w: '<', pit: '#', counter: '#', void: '#' };
// Events that stand in the world as solid things. NPCs and enemies are sim entities in Realms, not map cells.
const SOLID_EVENTS = new Set(['sign', 'object', 'chest']);

let mc = null, db = null;
async function lq() {
  if (!mc) { mc = await import(pathToFileURL(path.join(LQ, 'tools/maps/mapcheck.mjs')).href); db = await mc.loadDb(); }
  return { mc, db };
}

export async function importLqMap(id) {
  const { mc, db } = await lq();
  const m = await mc.loadMap(id);
  const solidEvents = (m.events || []).filter((e) => SOLID_EVENTS.has(e.type) && e.solid !== false && e.if == null && e.ifNot == null);
  const grid = mc.buildGrid({ ...m, events: solidEvents }, db);
  if (grid.errors.length) console.warn(`[${id}] grid warnings:\n  ` + grid.errors.slice(0, 10).join('\n  '));
  const collision = grid.code.map((row) => row.map((c) => CODE_CHAR[c] ?? '#').join(''));
  const plain = (list) => (list || []).filter((o) => o && o.if == null && o.ifNot == null).map((o) => {
    const c = { t: o.t, x: o.x, y: o.y };
    for (const k of ['state', 'w', 'h', 'dx', 'dy']) if (o[k] != null) c[k] = o[k];
    return c;
  });
  const npcs = (m.events || []).filter((e) => e.type === 'npc' && e.if == null && e.ifNot == null).map((e) => {
    const n = db.NPCS[e.id] || {};
    return { id: e.id, name: n.name || e.id, sprite: n.sprite || 'npc_farmer', x: e.x, y: e.y, dir: e.dir || 'down' };
  });
  const enemies = (m.events || []).filter((e) => e.type === 'enemy' && e.if == null && e.ifNot == null).map((e) => ({ id: e.id, sprite: e.sprite, x: e.x, y: e.y }));
  const doors = (m.events || []).filter((e) => e.type === 'door').map((e) => ({ id: e.id, x: e.x, y: e.y, to: e.to[0] }));
  const joins = (m.exits || []).map((e) => ({ x: e.x, y: e.y, w: e.w || 1, h: e.h || 1, to: e.to[0], tx: e.to[1], ty: e.to[2], dir: e.to[3] || 'down' }));
  return {
    id: m.id || id, name: m.name || id, kind: m.area === 'town' ? 'town' : 'field',
    source: `LexiconQuest next/src/data/maps/${id}.js (baseline, x1 off)`,
    w: m.ground[0].length, h: m.ground.length,
    music: typeof m.music === 'string' ? m.music : null,
    lighting: m.lighting || { tint: 'none', dark: 0 },
    under: m.under || 'grass', legend: m.legend, ground: m.ground,
    overlays: plain(m.overlays), decor: plain(m.decor), overhead: plain(m.overhead),
    collision, joins,
    lq: { npcs, enemies, doors, marks: m.marks || {}, start: m.start || null },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'maps', 'build_world.mjs')).href);
}

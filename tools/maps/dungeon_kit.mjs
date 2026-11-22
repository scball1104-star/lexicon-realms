// The dungeon and cave kit (dungeons build, 2026-11-22): carves rooms and halls out of solid rock and returns a zone in
// the CONTRACTS 6 shape with kind 'dungeon' or 'cave'. Used by tools/maps/zone_<id>.mjs for every dungeon and cave;
// tools/maps/build_world.mjs runs them and checks them (every boss, chest and spawn reachable from the entry).
//
//   carveDungeon({ id, rooms, halls, entry, exitOut, ... }) -> zone module object
//
// rooms: [{ id, name, x, y, w, h, banner? }]  floor boxes (tiles), also the zone's `areas` (banners, explore objectives)
// halls: [{ pts: [[x, y], ...], width }]      thick polylines between rooms (axis-aligned legs, 4 to 8 wide)
// pools: [[x, y, w, h]]                       water inside a room (look only; foes and heroes walk round it)
// entry: { x, y, w } the exit door: a w-wide opening in the floor row under the entry room at (x..x+w-1, y); stepping on
//        it leaves for the world tile `exitOut` ([x, y], world tiles, the walkable cell outside the door)
// arrival: [x, y] where a hero stands on arriving (inside the entry room, next to the door)
// lantern: { id, name, x, y } the inside lantern (death inside wakes you here); its post is drawn on the rock above it
// Collision is written directly ('#' rock, '.' floor, '~' water): no tile sheet decides it, so nothing in Lexicon Quest
// is read. The ground uses tile ids the trimmed tiles.json already carries (render only).
import { DUNGEON_RULES } from '../../src/data/dungeons.js';

export function carveDungeon(def) {
  const { id, name, kind, w, h, levels, music, rooms, halls = [], pools = [], entry, exitOut, arrival, lantern, spawns = [], chests = [], script = null, signs = [],
    floor = 'dirt', rock = 'x1_crag_top', water = 'x1_tarn', dark = DUNGEON_RULES.dark[kind] } = def;
  const g = Array.from({ length: h }, () => new Array(w).fill('#'));
  const set = (x, y, c) => { if (x >= 1 && y >= 1 && x < w - 1 && y < h - 1) g[y][x] = c; };
  const box = (x, y, bw, bh, c = '.') => { for (let j = y; j < y + bh; j++) for (let i = x; i < x + bw; i++) set(i, j, c); };
  for (const r of rooms) box(r.x, r.y, r.w, r.h);
  for (const hl of halls) {
    const half = Math.floor((hl.width || 4) / 2), wd = hl.width || 4;
    for (let k = 0; k + 1 < hl.pts.length; k++) {
      const [ax, ay] = hl.pts[k], [bx, by] = hl.pts[k + 1];
      if (ax !== bx && ay !== by) throw new Error(`${id}: hall leg ${ax},${ay} -> ${bx},${by} is not axis-aligned`);
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      if (ay === by) box(x0 - half, y0 - half, x1 - x0 + wd, wd);
      else box(x0 - half, y0 - half, wd, y1 - y0 + wd);
    }
  }
  for (const [x, y, pw, ph] of pools) box(x, y, pw, ph, '~');
  // the door: an opening in the rock under the entry room, kept walkable; the join covers it
  for (let i = 0; i < entry.w; i++) g[entry.y][entry.x + i] = '.';
  // the lantern's post: one rock cell above the touch cell (drawn as the lit post)
  const post = [lantern.x, lantern.y - 1];
  g[post[1]][post[0]] = '#';
  const collision = g.map((r) => r.join(''));
  const ground = g.map((r) => r.map((c) => (c === '#' ? '#' : c === '~' ? '~' : '.')).join(''));
  const label = DUNGEON_RULES.label(kind, levels);
  return {
    id, name, kind, w, h, music, lighting: { tint: 'none', dark }, under: floor,
    legend: { '.': floor, '#': rock, '~': water }, ground,
    overlays: [], decor: [{ t: 'lamp_post', x: post[0], y: post[1], state: 1 }], overhead: [],
    collision,
    joins: [{ x: entry.x, y: entry.y, w: entry.w, h: 1, to: 'world', tx: exitOut[0], ty: exitOut[1], dir: 'down' }],
    arrival, levels,
    areas: rooms.map((r) => ({ id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, levels, ...(r.banner === false ? { banner: false } : {}) })),
    lanterns: [{ id: lantern.id, name: lantern.name, x: lantern.x, y: lantern.y, post }],
    spawns, npcs: [], nodes: [], signs, hooks: [], secrets: [],
    ...(script ? { script } : {}),
    dungeon: { id, kind, name, levels, label, chests },
  };
}

/** A pack of 2 or 3 at (x, y): the members stand side by side and pull as one (CONTRACTS 6 spawns, PROGRESSION packs). */
export function pack(group, members, x, y) {
  const spots = [[0, 0], [1, 1], [-1, 1]];
  return members.map(([mob, level], i) => ({ mob, level, x: x + spots[i][0], y: y + spots[i][1], wander: 0, group, ...(members.length > 1 ? { pack: members.length } : {}) }));
}
/** A boss (or a named cave foe): a fixed spot, no wander. */
export function boss(mob, level, x, y, extra = {}) { return { mob, level, x, y, wander: 0, group: `boss_${mob}`, boss: true, ...extra }; }

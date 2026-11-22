// Lay the four areas and the wilds onto one world zone (layout.js). Pure: the game (src/data/maps/index.js), the map
// build (tools/maps/build_world.mjs, which checks the result) and the tests all call the same function.
//
//   const world = composeWorld({ willowmere, valley, downs, moor }, wilds)
//   regionAt(world, tx, ty) -> 'valley' | ... | null (the wilds)      underAt(world, tx, ty) -> base terrain id
//
// What changes on the way in: every x, y moves by the area's corner; the joins between areas go (you walk across the
// seam); a join to a zone that is not built (the closed roads) stays as the map edge it always was; far-off backdrop
// props (overhead) that would now stand inside a neighbouring area go. Every list item keeps its area as `region`.
import { REGION_AT, WORLD_ID, WORLD_NAME, WORLD_W, WORLD_H, WILDS_AREAS, isRegion } from './layout.js';

const POOL = '.,=~-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!$%&*+:;<>?@[]^_{|}()/';

export function composeWorld(regions, wilds) {
  const W = WORLD_W, H = WORLD_H;
  const legend = {}, charOf = {};
  const code = (name) => {
    if (charOf[name] == null) {
      const ch = POOL[Object.keys(legend).length];
      if (ch == null) throw new Error('composeWorld: legend pool exhausted');
      legend[ch] = name; charOf[name] = ch;
    }
    return charOf[name];
  };
  const ground = [], coll = [];
  const wl = wilds.legend;
  for (let y = 0; y < H; y++) {
    const g = [], c = [];
    for (let x = 0; x < W; x++) {
      const ch = wilds.ground[y][x];
      g.push(ch === ' ' ? null : code(wl[ch] || wilds.under));
      c.push(wilds.collision[y][x] === ' ' ? '#' : wilds.collision[y][x]);
    }
    ground.push(g); coll.push(c);
  }
  const out = { overlays: [], decor: [], overhead: [], areas: [], lanterns: [], npcs: [], spawns: [], nodes: [], signs: [], hooks: [], secrets: [], joins: [] };
  for (const d of wilds.overlays || []) out.overlays.push({ ...d, region: null });
  for (const d of wilds.decor || []) out.decor.push({ ...d, region: null });
  const regionList = [];
  let script = null;
  for (const [id, [ox, oy]] of Object.entries(REGION_AT)) {
    const z = regions[id];
    if (!z) throw new Error(`composeWorld: missing area ${id}`);
    regionList.push({ id, name: z.name, kind: z.kind, x: ox, y: oy, w: z.w, h: z.h, levels: z.levels || null, music: z.music, lighting: z.lighting, under: z.under });
    for (let y = 0; y < z.h; y++) {
      const row = z.ground[y], crow = z.collision[y];
      for (let x = 0; x < z.w; x++) {
        const name = z.legend[row[x]];
        ground[y + oy][x + ox] = name ? code(name) : null;    // null: the area's own base terrain (underAt)
        coll[y + oy][x + ox] = crow[x];
      }
    }
    const mv = (o) => ({ ...o, x: o.x + ox, y: o.y + oy, region: id });
    const pt = (p) => [p[0] + ox, p[1] + oy];
    for (const k of ['overlays', 'decor', 'areas', 'lanterns', 'npcs', 'spawns', 'nodes', 'signs', 'hooks']) for (const o of z[k] || []) {
      const m = mv(o);
      if (k === 'lanterns' && o.post) m.post = pt(o.post);
      if (k === 'nodes' && o.at) m.at = pt(o.at);
      out[k].push(m);
    }
    for (const o of z.overhead || []) {
      const X = o.x + ox, Y = o.y + oy;
      const inside = X >= 0 && Y >= 0 && X < W && Y < H;
      const other = inside && !(o.x >= 0 && o.y >= 0 && o.x < z.w && o.y < z.h);   // off its own map but on the world
      if (!other) out.overhead.push({ ...o, x: X, y: Y, region: id });
    }
    out.areas.push({ id: `region_${id}`, name: z.name, x: ox, y: oy, w: z.w, h: z.h, region: id, ...(z.levels ? { levels: z.levels } : {}),
      ...(z.kind === 'town' ? { safe: true } : {}) });
    for (const s of z.secrets || []) out.secrets.push({ ...s, region: id, passage: s.passage.map(pt), nook: { ...s.nook, x: s.nook.x + ox, y: s.nook.y + oy },
      hint: pt(s.hint), chest: { ...s.chest, x: s.chest.x + ox, y: s.chest.y + oy } });
    for (const j of z.joins || []) if (!isRegion(j.to)) out.joins.push({ ...j, x: j.x + ox, y: j.y + oy, region: id });
    if (z.script) {
      script = script || {};
      for (const [k, sc] of Object.entries(z.script)) {
        const m = { region: id };
        for (const [f, v] of Object.entries(sc)) {
          if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') m[f] = pt(v);
          else if (Array.isArray(v) && Array.isArray(v[0])) m[f] = v.map(pt);
          else m[f] = v;
        }
        script[k] = m;
      }
    }
  }
  for (const a of WILDS_AREAS) out.areas.push({ ...a, region: null });
  // the wilds' own joins: passes to outdoor zones of their own (big world, 2026-11-22: the Root Stair to the Rootbound)
  for (const j of wilds.joins || []) out.joins.push({ ...j, region: null });
  const home = regions.willowmere;
  const [hx, hy] = REGION_AT.willowmere;
  return {
    id: WORLD_ID, name: WORLD_NAME, kind: 'field', w: W, h: H,
    music: home.music, lighting: home.lighting, under: 'grass',
    legend, ground: ground.map((r, y) => r.map((ch, x) => ch ?? code(underOf(regionList, x, y) || 'grass')).join('')),
    collision: coll.map((r) => r.join('')),
    ...out, ...(script ? { script } : {}),
    levels: [1, 20], arrival: [home.arrival[0] + hx, home.arrival[1] + hy],
    regions: regionList,
  };
}

function underOf(list, tx, ty) {
  for (const r of list) if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) return r.under;
  return null;
}

/** Which area a world tile is in (null: the wilds, or a zone with no regions). */
export function regionAt(zone, tx, ty) {
  for (const r of (zone && zone.regions) || []) if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) return r.id;
  return null;
}

/** The region record ({ id, name, music, lighting, under, levels, ... }) at a world tile, or null. */
export function regionInfo(zone, tx, ty) {
  for (const r of (zone && zone.regions) || []) if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) return r;
  return null;
}

/** Where a world tile is, for the HUD and saves: { id, name, region, music } (an area, a named wilds road, else the world). */
export function placeAt(zone, tx, ty) {
  const r = regionInfo(zone, tx, ty);
  if (r) return { id: r.id, name: r.name, region: r.id, music: r.music };
  for (const a of (zone && zone.areas) || []) if (a.region === null && tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.h) return { id: a.id, name: a.name, region: null, music: zone.music };
  return { id: zone ? zone.id : null, name: zone ? zone.name : '', region: null, music: zone ? zone.music : null };
}

/** The base terrain under a tile: its area's own `under` (the moor is turf, the rest grass), else the zone's. */
export function underAt(zone, tx, ty) {
  return (zone.regions && underOf(zone.regions, tx, ty)) || zone.under;
}

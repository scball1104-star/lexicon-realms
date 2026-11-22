// The one world (approved by Scott 2026-11-21, D:/LQOnline/world_join/BRIEF.md): where each area sits on the big map.
//
// The four areas are still authored and generated one by one (tools/maps/zone_*.mjs -> src/data/maps/<area>.js, in
// their own local tiles). src/data/maps/compose.js lays them out here, adds the wilds between them (wilds.js: the
// North Road, Gate Road South and the forest) and hands the sim ONE zone, 'world'. Data that names an area and a local
// tile (quests, bounties, chests, old saves, ?zone=valley&x=&y= links) goes through toWorld / toWorldPx.
//
// Plain data plus pure helpers; no imports, so tools, tests and the game all read the same numbers.

export const WORLD_ID = 'world';
export const WORLD_NAME = 'Willowmere Lands';
export const WORLD_W = 296;
export const WORLD_H = 196;

// area id -> top-left corner on the world map (tiles). Order: drawn first to last (none overlap).
export const REGION_AT = Object.freeze({
  moor: Object.freeze([0, 0]),
  downs: Object.freeze([0, 100]),
  willowmere: Object.freeze([144, 126]),
  valley: Object.freeze([200, 102]),
});
export const REGION_IDS = Object.freeze(Object.keys(REGION_AT));

// The wilds' named stretches (world tiles): a banner and the HUD place name on the two new roads.
export const WILDS_AREAS = Object.freeze([
  Object.freeze({ id: 'north_road', name: 'North Road', x: 144, y: 100, w: 56, h: 26 }),
  Object.freeze({ id: 'gate_road_south', name: 'Gate Road South', x: 144, y: 158, w: 56, h: 38 }),
  Object.freeze({ id: 'gate_road_east', name: 'Gate Road South', x: 192, y: 126, w: 8, h: 32 }),
]);

export const isRegion = (id) => Object.prototype.hasOwnProperty.call(REGION_AT, id);

/** An area's local tile -> world tile. Unknown area ids (already 'world', or a closed road) pass through unchanged. */
export function toWorld(region, tx, ty) {
  const o = REGION_AT[region];
  return o ? [tx + o[0], ty + o[1]] : [tx, ty];
}

/** An area's local PIXEL -> world pixel (16 px a tile). */
export function toWorldPx(region, px, py) {
  const o = REGION_AT[region];
  return o ? [px + o[0] * 16, py + o[1] * 16] : [px, py];
}

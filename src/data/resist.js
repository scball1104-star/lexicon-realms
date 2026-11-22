// Resistances (GAP 2.1). Plain data: the sim reads it as content.resist (src/sim/stats.js recalcMob, src/sim/combat.js
// dealDamage). Kept light so the balance holds.
//
// A resist value is the AVERAGE share of that school's damage a holder shrugs off (0 to 0.75). Each hit rolls a band,
// 0%, 25%, 50% or 75%, between the two bands either side of the value (0.10: 60% of hits take 0%, 40% take 25%), so the
// average is exactly the value. A spell that misses outright is a full resist (src/data/hittable.js, result 'resist').
// Physical damage is never resisted (armor handles it).
//
// Foes: by family, then by template id (a template entry replaces its family's school by school); a template may also
// carry its own `resist: { school: value }`. Heroes: gear affixes (src/data/items.js AFFIXES, of Inkward, of Shadeward,
// of Lampward, of Warding), in percentage points, plus a `resist` mod (talents, auras) with a school filter.
export const RESIST_CAP = 0.75;
export const RESIST_BANDS = Object.freeze([0, 0.25, 0.5, 0.75]);

export const FAMILY_RESIST = Object.freeze({
  ooze: Object.freeze({ ink: 0.1 }),             // the blots and slimes are half ink themselves
  spirit: Object.freeze({ shadow: 0.2 }),        // shades and wraiths are made of the dark
  construct: Object.freeze({ nature: 0.1 }),     // stone and iron ground the storm
});
export const TEMPLATE_RESIST = Object.freeze({
  watch_lamp: Object.freeze({ light: 0.25, nature: 0.1 }),   // a lamp does not mind more light
});

/** Gear affix stat -> the schools it covers (`all`: every non-physical school). */
export const RESIST_STATS = Object.freeze({ resInk: ['ink'], resShadow: ['shadow'], resLight: ['light'], resFire: ['fire'], resNature: ['nature'], resAll: ['all'] });

/** What content.resist carries (src/data/maps/index.js buildContent, qa/sim/_fixtures.mjs). */
export const RESIST_CONTENT = Object.freeze({ cap: RESIST_CAP, bands: RESIST_BANDS, family: FAMILY_RESIST, template: TEMPLATE_RESIST, stats: RESIST_STATS });

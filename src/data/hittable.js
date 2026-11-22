// The hit table (GAP 2.1, B12; WoW-style, kept light). Plain data: the sim reads it as content.hitTable
// (src/sim/combat.js dealDamage). Content without it fights by the old rules (no miss, no mob dodge, no mob crits).
//
// One roll per direct, single-target attack, in this order: miss, dodge, parry, glancing, then block and crit as before.
//   kind   'melee' (a weapon blow within reach), 'ranged' (a weapon shot), 'spell' (any other school: it can only miss,
//          shown as "Resisted", and be partly resisted, src/data/resist.js)
//   gap    the defender's level minus the attacker's (both ways: a foe above you is harder to hit, one below easier)
// Not on the table: damage over time, area attacks (ground circles, cones), procs, cleaves and copies, pets and traps.
//
// Heroes' weapon blows and shots are scaled by 1 / (1 - the same attack's avoid chance at an equal level), so a fight
// against a foe of your own level lasts about as long as before (the 2026-11-19 Builds 2 time-to-kill tuning holds); the
// table bites as the level gap grows. Spells get no pay (they only miss, 1%: the casters sat at the bottom of the time
// band, and a pay on spells made their kills one cast quicker). Foes get no pay: their crits and misses roughly cancel at
// an equal level. A skill that misses refunds 80% of its Resolve or Focus (WoW's rule).
export const HIT_TABLE = Object.freeze({
  // miss by level gap: base at an equal level, +perUp a level for the first two levels above, then +steepUp a level;
  // -perDown a level below, never under floor. Capped.
  miss: Object.freeze({ base: 0.03, perUp: 0.01, steepFrom: 2, steepUp: 0.03, perDown: 0.01, floor: 0.01, cap: 0.4 }),
  // a hero's spell (a miss shows as "Resisted"): a little lighter, as spells get no pay below
  spellMiss: Object.freeze({ base: 0.01, perUp: 0.01, steepFrom: 2, steepUp: 0.03, perDown: 0.01, floor: 0, cap: 0.4 }),
  // a foe's blow or spell on a hero: the same shape (a grey foe far below you misses often, one above rarely)
  foeMiss: Object.freeze({ base: 0.03, perUp: 0.01, steepFrom: 2, steepUp: 0.03, perDown: 0.01, floor: 0.01, cap: 0.4 }),
  // foes dodge weapon blows and shots from any side; armed foes (ARMED below, or a template's `armed: true`) parry blows
  // from the front. +perUp a level above the attacker.
  mobDodge: Object.freeze({ base: 0.03, perUp: 0.005 }),
  mobParry: Object.freeze({ base: 0.03, perUp: 0.005 }),
  // heroes dodge blows and shots from the front: base + agility x perAgi (+ talents, the `dodge` mod); the Warden and the
  // Inkblade also parry blows from the front (+ the `parry` mod). One cap for dodge and parry together.
  heroDodge: Object.freeze({ base: 0.02, perAgi: 0.0005 }),
  heroParry: Object.freeze({ warden: 0.03, inkblade: 0.03 }),
  avoidCap: 0.6,
  // a hero's auto-attack blow on a foe above them can glance: chance per level of gap, damage cut grows with the gap
  glancing: Object.freeze({ perLevel: 0.1, cap: 0.4, reduceBase: 0.1, reducePerLevel: 0.05, reduceCap: 0.3 }),
  // foes crit (direct, single-target hits; never area attacks): x combat.critMult like a hero's
  mobCrit: Object.freeze({ normal: 0.05, elite: 0.08, boss: 0.1 }),
  // the Warden still gains Resolve from a blow she dodged or parried (she took it on her guard)
  resolveOnAvoid: true,
  // what a blow that did not land also loses on that target (later effects of the same ability): a debuff, an interrupt,
  // Ink Marks (a dodged Nick gives no mark, a parried Shield Bash does not stun)
  ridersOnAvoid: Object.freeze(['debuff', 'interrupt', 'combo']),
  // a skill whose blow on its own target did not land refunds this share of the Resolve or Focus it cost (mana is spent)
  refundOnAvoid: Object.freeze({ share: 0.8, kinds: Object.freeze(['resolve', 'focus']) }),
  // dual wield (the Inkblade): auto-attack blows miss this much more often, not covered by the pay (WoW's rule)
  dualWieldMiss: 0.06,
  // heroes' pay for the equal-level table (see above), by attack kind; false turns it off, true pays every kind
  equalLevelPay: Object.freeze(['melee', 'ranged']),
  // weapon skill: the pay grows in with the hero's level, none at level 5 and below, all of it from level 15 (a new hero
  // misses and is dodged like anyone; the 2026-11-19 tuning sat right at the bottom of the time band at level 5)
  payLevels: Object.freeze([5, 15]),
});

// Foes that fight with a weapon (they parry). Template ids; a template may also set `armed: true` itself.
export const ARMED = Object.freeze([
  'tower_sentinel', 'sentinel_long_watch', 'watch_stair_captain', 'watch_wickwright', 'barrow_reeve',
]);

/** What content.hitTable carries (src/data/maps/index.js buildContent, qa/sim/_fixtures.mjs). */
export const HIT_CONTENT = Object.freeze({ ...HIT_TABLE, armed: ARMED });

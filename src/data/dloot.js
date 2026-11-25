// Delve loot (wave 10 dloot, Scott 2026-11-25 "Yes for your recommendations"; D:/LQOnline/wave10/dloot/BRIEF.md). Plain
// data, read by src/sim/dloot.js (the rolls), src/sim/dungeons.js (boss drops), src/sim/loot.js (quality on a piece),
// src/ui/dloot_ui.js and src/render3d/dloot3d.js (the drop's look). Every name and player line here is a DRAFT for Scott.
//
// Items already in saves read exactly as today: a piece with no `q` keeps its fixed numbers, and a piece with no rolled
// lines keeps its name (qa/tests/dloot.test.mjs checks every weapon and armor item against a hash taken before the build).

export const DLOOT_RULES = Object.freeze({
  // Rolled lines on the places' named pieces (before: `affixes: []`): blue 0 or 1, purple 1, gold 1, set 1, legendary 2.
  // Same affix pool and tiers as random gear (items.js AFFIXES), so a named epic stays at or under a random epic.
  namedAffixes: Object.freeze({ magic: [0, 1], rare: [1, 1], epic: [1, 1], set: [1, 1], legendary: [2, 2] }),
  // Quality q in [0, 1] on a dropped named piece: its fixed stats x (0.9 + 0.2 q); a power with `q` paths rolls in its band.
  // q 0.5 is the old value exactly; a piece without q reads as before.
  quality: Object.freeze({ stats: Object.freeze([0.9, 1.1]) }),
  // Illuminated: 1 legendary or set piece in 8: q = 1, every rolled line at its tier's top, one more line, a gold edge.
  illuminated: Object.freeze({ chance: 1 / 8, rarities: Object.freeze(['legendary', 'set']), extraAffix: 1 }),
  // Smart loot for boss pieces: only what the class can use; half the time lean x3 to the hero's Builds 2 track
  // (`forTrack` on set pieces); the slot where the hero wears the lowest item level x2; a legendary the hero holds is
  // skipped while the pool has one they do not.
  smart: Object.freeze({ classOnly: true, trackBias: 0.5, trackWeight: 3, weakSlot: 2, skipOwned: true }),
  // The Tally (bad-luck protection), per place: chance = start + step x misses; the sure-th clear without one gives one.
  tally: Object.freeze({ start: 0.10, step: 0.025, sure: 25 }),
  // Pass it on: a boss piece that binds on pickup may still be traded, for this many ticks (2 hours at 20 Hz), to a friend
  // who shared the kill. After that it is Soulbound as before.
  passOn: Object.freeze({ ticks: 2 * 60 * 60 * 20 }),
});

// The drop: a light column at the foe's feet for each piece of rare or better (blue: a ring only), by rarity.
// h = height in metres (3D) and HUD px (2D); beat = seconds of warm screen edges (render only, the sim never slows).
export const DROP_LOOK = Object.freeze({
  colors: Object.freeze({ magic: '#6f8cff', rare: '#ffd34d', epic: '#b45cff', set: '#3cdc6a', legendary: '#ff8a2a', gilt: '#f3d27a' }),
  h3d: Object.freeze({ magic: 0, rare: 2.6, epic: 4.2, set: 5.0, legendary: 9.0 }),
  r3d: Object.freeze({ magic: 0.5, rare: 0.7, epic: 0.9, set: 1.0, legendary: 1.3 }),
  h2d: Object.freeze({ magic: 0, rare: 48, epic: 70, set: 80, legendary: 140 }),
  stay: 20,                 // seconds a column stands
  beat: 0.6,                // a legendary or Illuminated piece of your own: warm edges for this long
  friend: 0.35,             // a friend's column: this bright, thinner, their name on top
});

// Retold (draft name): legendaries that change how one skill plays, one per class, item level 30, from the Deep Halls'
// last boss (dungeons.js barrow_deep `retold`) and, by name, the endless tiers and rifts (round 2). Built only from
// records the sim already has (cleave mods, ability-scoped procs, pctOfDamage / pctOfHeal, consumeOn). `q` lists the
// numbers that roll with quality: [path into the power, value at q 0, value at q 1]; the record holds the q 0.5 value.
// Text: "[a to b]" shows the band in data and the rolled number on a piece (src/sim/dloot_q.js scaleText); no closing
// full stop (the tooltip joins its lines with one).
export const RETOLD = Object.freeze({
  hinge_of_oaths: { id: 'hinge_of_oaths', name: 'The Hinge of Oaths', cls: 'warden', slot: 'off', type: 'shield', ilvl: 30, stats: { sta: 9, str: 5 },
    power: { id: 'retold_hinge', name: 'The Hinge of Oaths',
      text: 'Retold, Shield Bash: it also strikes up to 3 more foes within 3 tiles of your target for 60% of its damage, and taunts every foe it strikes for 2 s. Shield Bash costs [15 to 25]% less',
      mods: [{ stat: 'cleave', add: 3, ability: 'warden_shield_bash' }, { stat: 'cleavePct', add: 0.6, ability: 'warden_shield_bash' },
        { stat: 'cleaveRange', add: 48, ability: 'warden_shield_bash' }, { stat: 'cost', mul: 0.8, ability: 'warden_shield_bash' }],
      procs: [{ on: 'hit', ability: 'warden_shield_bash', icd: 0.5, effects: [{ type: 'threat', to: 'enemies_near_holder', radius: 48, maxTargets: 4, taunt: true, duration: 2 }] }],
      q: [[['mods', 3, 'mul'], 0.85, 0.75]] } },
  second_name_bell: { id: 'second_name_bell', name: 'Bell of the Second Name', cls: 'mender', slot: 'off', type: 'bell', ilvl: 30, stats: { int: 5, spi: 5, sta: 5 },
    power: { id: 'retold_bell', name: 'Bell of the Second Name',
      text: 'Retold, Mend: it also mends the most hurt other friend within 6 tiles of its target for [40 to 60]% as much',
      procs: [{ on: 'heal', ability: 'mender_mend', effects: [{ type: 'heal', to: 'allies_near_target', radius: 96, maxTargets: 1, pctOfHeal: 0.5, canCrit: false, ability: 'lg_retold_bell' }] }],
      q: [[['procs', 0, 'effects', 0, 'pctOfHeal'], 0.4, 0.6]] } },
  unfinished_sentence: { id: 'unfinished_sentence', name: 'The Unfinished Sentence', cls: 'scribe', slot: 'main', type: 'quill', ilvl: 30, stats: { int: 8, sp: 4 },
    power: { id: 'retold_sentence', name: 'The Unfinished Sentence',
      text: 'Retold, Inkbolt: each Inkbolt has a [25 to 40]% chance to leave the next one unfinished: instant and free. Inkbolt deals 10% more damage',
      mods: [{ stat: 'damageDone', mul: 1.1, ability: 'scribe_inkbolt' }],
      procs: [{ on: 'cast', ability: 'scribe_inkbolt', chance: 0.325, effects: [{ type: 'aura', to: 'self', aura: { id: 'lg_unfinished', name: 'Unfinished', icon: 'icon_haste', kind: 'buff', duration: 10,
        mods: [{ stat: 'castTime', mul: 0, ability: 'scribe_inkbolt' }, { stat: 'cost', mul: 0, ability: 'scribe_inkbolt' }], consumeOn: { cast: 'scribe_inkbolt' } } }] }],
      q: [[['procs', 0, 'chance'], 0.25, 0.4]] } },
  long_margin: { id: 'long_margin', name: 'The Long Margin', cls: 'wayfinder', slot: 'two', type: 'bow', ilvl: 30, stats: { agi: 10, sta: 5 },
    power: { id: 'retold_margin', name: 'The Long Margin',
      text: 'Retold, Aimed Shot: the arrow runs on into up to 3 more foes within 4 tiles of your target, [55 to 85]% of its damage to each',
      mods: [{ stat: 'cleave', add: 3, ability: 'wayfinder_aimed_shot' }, { stat: 'cleavePct', add: 0.7, ability: 'wayfinder_aimed_shot' },
        { stat: 'cleaveRange', add: 64, ability: 'wayfinder_aimed_shot' }],
      q: [[['mods', 1, 'add'], 0.55, 0.85]] } },
  spreading_blot: { id: 'spreading_blot', name: 'The Spreading Blot', cls: 'inkblade', slot: 'main', type: 'dagger', ilvl: 30, stats: { agi: 8, crit: 2 },
    power: { id: 'retold_blot', name: 'The Spreading Blot',
      text: 'Retold, Spill: it also makes up to [1 to 3] other foes within 3 tiles of your target bleed for half of its damage over 6 s',
      procs: [{ on: 'hit', ability: 'inkblade_spill', direct: true, effects: [{ type: 'aura', to: 'enemies_near_holder', radius: 48, maxTargets: 2, excludeHolder: true,
        aura: { id: 'lg_blot', name: 'Spreading Blot', icon: 'icon_slow', kind: 'debuff', duration: 6, period: 1, fromDamage: 0.5,
          tick: [{ type: 'damage', fromData: true, school: 'physical', canCrit: false, noArmor: true, ability: 'lg_retold_blot' }] } }] }],
      q: [[['procs', 0, 'effects', 0, 'maxTargets'], 1, 3, 'int']] } },
});

// Words a player reads (DRAFTS for Scott).
export const DLOOT_WORDS = Object.freeze({
  illuminated: 'Illuminated',
  illumLine: 'Illuminated: every line at its best, and one more.',
  quality: (pct) => `Quality ${pct} of 100.`,
  tally: (place, n, sure) => `${place} Tally: ${n} of ${sure}`,
  tallyHint: (left) => (left <= 1 ? 'The next one is sure.' : `Sure within ${left} more clears.`),
  forYou: 'Chosen for your class',
  friendGot: (name, item) => `${name} found ${item}`,
  passOn: (mins) => `You may pass this to a friend from the run for ${mins} more minutes.`,
  legendary: 'Legendary', legendaryIllum: 'Legendary, Illuminated',
  wear: 'Wear it', keep: 'Keep',
  reset: 'reset',
});

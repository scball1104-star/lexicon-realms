// The five classes (docs/design/CLASSES.md section 7, CONTRACTS 7.1). Plain data.
// base = level 1 naked; perLevel = growth. Stat at level L = floor(base + perLevel * (L - 1)) + gear.
// base.hp is the flat hp bonus: max_hp = hpPerSta * sta + base.hp (Warden 60, everyone else 30).

export const CLASSES = {
  warden: {
    id: 'warden', name: 'Warden', role: 'tank', armor: 'plate', weapons: ['sword', 'shield'],
    // class identity pass (CLASSES.md, strengths and weaknesses): the two lines the class card shows
    identity: { strong: 'Packs. Every hit taken feeds Resolve.', weak: 'Heavy hitters. They drain your Resolve.' },
    // combatStart: Resolve gained the moment a fight starts (fix pass 1, critique 6): Bash (+15) then Strike (20) works on
    // the second press of the first fight instead of failing until two auto-attacks land
    resource: { kind: 'resolve', max: 100, start: 0, regen: 0, decayOoc: 5, decayDelay: 3, onHitDealt: 10, onHitTaken: 3, onBlock: 5, combatStart: 10 },
    base: { hp: 60, str: 12, agi: 7, int: 4, spi: 6, sta: 12 },
    perLevel: { hp: 0, str: 1.5, agi: 0.5, int: 0.2, spi: 0.4, sta: 1.5 },
    hpPerSta: 10, apPerStr: 2, critBase: 0.05, blockBase: 0.10, threatMult: 1.5, mainStat: 'str',
    auto: { weapon: 'sword', range: 40 },
    // combat role pass (2026-11-19): Sweeping Blow at 3 (was 10) so packs have an answer early; Taunt at 10 (was 3)
    abilities: [{ id: 'warden_strike', level: 1 }, { id: 'warden_shield_bash', level: 1 }, { id: 'warden_sweeping_blow', level: 3 },
      { id: 'warden_second_wind', level: 6 }, { id: 'warden_taunt', level: 10 }, { id: 'warden_oath_of_iron', level: 14 }],
    startBar: ['warden_shield_bash', 'warden_strike'], talentTree: 'warden', trainer: 'holt',   // Bash first: "Bash, then Strike" (CLASSES 2)
    startGear: { main: 'gate_sword', off: 'plank_shield', chest: 'padded_jerkin' },
    looks: [{ id: 0, sprite: 'warden_a' }, { id: 1, sprite: 'warden_b' }, { id: 2, sprite: 'warden_c' }],
  },
  mender: {
    id: 'mender', name: 'Mender', role: 'healer', armor: 'cloth', weapons: ['rod', 'bell'],
    identity: { strong: 'Long fights. Your light burns hotter.', weak: 'Packs. Every hit pushes your casts back.' },
    resource: { kind: 'mana', maxBase: 50, maxPerInt: 15, start: 'max', regenPerSpi: 0.4, regenOocMult: 2, sitPct: 0.06 },
    base: { hp: 30, str: 6, agi: 6, int: 11, spi: 12, sta: 10 },
    perLevel: { hp: 0, str: 0.4, agi: 0.4, int: 1.3, spi: 1.3, sta: 1.0 },
    hpPerSta: 10, apPerStr: 2, spPerInt: 1, critBase: 0.05, mainStat: 'int',
    // class identity pass: Long Light. The longer a fight runs, the hotter her light: damage +10% after 8 s, +20% after 16 s
    passives: { mods: [{ stat: 'damageDone', mul: 1.1, when: { inCombatFor: 8 } }, { stat: 'damageDone', mul: 1.1, when: { inCombatFor: 16 } }] },
    auto: { weapon: 'rod', range: 40 },
    // combat role pass: Chorus (the area heal and burn) at 6 (was 14), Warding Word at 10 (was 6), Steady Name at 14 (was 10)
    abilities: [{ id: 'mender_kindle', level: 1 }, { id: 'mender_mend', level: 1 }, { id: 'mender_brand', level: 3 },
      { id: 'mender_chorus', level: 6 }, { id: 'mender_warding_word', level: 10 }, { id: 'mender_steady_name', level: 14 }],
    startBar: ['mender_kindle', 'mender_mend'], talentTree: 'mender', trainer: 'hazel',
    startGear: { main: 'willow_rod', off: 'tin_hand_bell', chest: 'plain_robe' },
    looks: [{ id: 0, sprite: 'mender_a' }, { id: 1, sprite: 'mender_b' }, { id: 2, sprite: 'mender_c' }],
  },
  scribe: {
    id: 'scribe', name: 'Scribe', role: 'caster', armor: 'cloth', weapons: ['quill', 'book'],
    identity: { strong: 'Armored foes. Ink ignores plating.', weak: 'Fast foes. Your roots last half as long.' },
    resource: { kind: 'mana', maxBase: 50, maxPerInt: 15, start: 'max', regenPerSpi: 0.4, regenOocMult: 2, sitPct: 0.06 },
    base: { hp: 30, str: 5, agi: 6, int: 13, spi: 10, sta: 9 },
    perLevel: { hp: 0, str: 0.3, agi: 0.4, int: 1.6, spi: 1.0, sta: 0.9 },
    hpPerSta: 10, apPerStr: 2, spPerInt: 1, critBase: 0.05, mainStat: 'int',
    auto: { weapon: 'quill', range: 40 },
    abilities: [{ id: 'scribe_inkbolt', level: 1 }, { id: 'scribe_scrawl', level: 1 }, { id: 'scribe_full_stop', level: 3 },
      { id: 'scribe_underline', level: 6 }, { id: 'scribe_scatter_letters', level: 10 }, { id: 'scribe_bracket', level: 14 }],
    startBar: ['scribe_inkbolt', 'scribe_scrawl'], talentTree: 'scribe', trainer: 'iris',
    startGear: { main: 'goose_quill', off: 'blank_daybook', chest: 'plain_robe' },
    looks: [{ id: 0, sprite: 'scribe_a' }, { id: 1, sprite: 'scribe_b' }, { id: 2, sprite: 'scribe_c' }],
  },
  wayfinder: {
    id: 'wayfinder', name: 'Wayfinder', role: 'ranged', armor: 'mail', weapons: ['bow'],
    identity: { strong: 'Fast foes. +25% damage, full snares.', weak: 'Casters. They stand off and duel you.' },
    resource: { kind: 'focus', max: 100, start: 'max', regen: 5 },
    base: { hp: 30, str: 7, agi: 13, int: 6, spi: 8, sta: 10 },
    perLevel: { hp: 0, str: 0.5, agi: 1.6, int: 0.4, spi: 0.6, sta: 1.1 },
    hpPerSta: 10, apPerAgi: 2, critBase: 0.05, autoNeedsStill: true, mainStat: 'agi',
    // class identity pass: Quarry. +25% damage to fast foes, and your slows and roots hold them for their full time
    passives: { mods: [{ stat: 'damageDone', mul: 1.25, when: { targetTrait: 'fast' } }, { stat: 'snareFast', add: 1 }] },
    auto: { weapon: 'bow', range: 144, projectile: { speed: 480 }, name: 'Auto Shot' },
    abilities: [{ id: 'wayfinder_quick_shot', level: 1 }, { id: 'wayfinder_pinning_shot', level: 1 }, { id: 'wayfinder_briar_trap', level: 3 },
      { id: 'wayfinder_light_foot', level: 6 }, { id: 'wayfinder_aimed_shot', level: 10 }, { id: 'wayfinder_volley', level: 14 }],
    startBar: ['wayfinder_quick_shot', 'wayfinder_pinning_shot'], talentTree: 'wayfinder', trainer: 'tess',
    startGear: { main: 'ash_shortbow', chest: 'ring_jerkin' },
    looks: [{ id: 0, sprite: 'wayfinder_a' }, { id: 1, sprite: 'wayfinder_b' }, { id: 2, sprite: 'wayfinder_c' }],
  },
  inkblade: {
    id: 'inkblade', name: 'Inkblade', role: 'melee', armor: 'leather', weapons: ['dagger', 'dagger'],
    identity: { strong: 'Casters. +30% damage; hits break spells.', weak: 'Armored foes. Plating eats dagger hits.' },
    resource: { kind: 'focus', max: 100, start: 'max', regen: 10 }, combo: { max: 3, duration: 20 },
    base: { hp: 30, str: 8, agi: 13, int: 4, spi: 6, sta: 10 },
    perLevel: { hp: 0, str: 0.6, agi: 1.6, int: 0.2, spi: 0.4, sta: 1.1 },
    hpPerSta: 10, apPerAgi: 2, critBase: 0.05, offHandMult: 0.5, mainStat: 'agi',
    // class identity pass: Cut the Word. +30% damage to casters, and a hit on a foe that is casting breaks the spell (once per
    // 4 s; the spell is not locked). Builds 2: Quick Cut shortens the 4 s (icdStat), Unwritten turns it off (noScript)
    passives: { mods: [{ stat: 'damageDone', mul: 1.3, when: { targetTrait: 'caster' } }],
      procs: [{ on: 'hit', chance: 1, icd: 4, icdStat: 'cutWordIcd', when: { targetCasting: true, noScript: 'b2_unwritten' }, effects: [{ type: 'interrupt', to: 'target', lockout: 0.05 }] }] },
    auto: { weapon: 'dagger', range: 40, offHand: true },
    // combat role pass: Inkstep (now the area strike) at 6 (was 14), Ink in the Eyes at 14 (was 6)
    abilities: [{ id: 'inkblade_nick', level: 1 }, { id: 'inkblade_spill', level: 1 }, { id: 'inkblade_fade', level: 3 },
      { id: 'inkblade_inkstep', level: 6 }, { id: 'inkblade_bleed_line', level: 10 }, { id: 'inkblade_ink_in_the_eyes', level: 14 }],
    startBar: ['inkblade_nick', 'inkblade_spill'], talentTree: 'inkblade', trainer: 'sloe',
    startGear: { main: 'paring_dagger', off: 'paring_dagger', chest: 'scuffed_leathers' },
    looks: [{ id: 0, sprite: 'inkblade_a' }, { id: 1, sprite: 'inkblade_b' }, { id: 2, sprite: 'inkblade_c' }],
  },
};

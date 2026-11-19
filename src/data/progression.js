// Progression numbers (docs/design/PROGRESSION.md). Plain data: the sim reads these through content.progression.
// Every number here is copied from PROGRESSION.md / CLASSES.md section 0; formulas are written as coefficients so the
// sim (src/sim/progression.js, src/sim/stats.js) evaluates them. Change a number here, never in the sim.

export const PROGRESSION = {
  maxLevel: 15,
  // XP to go from level L to L + 1 (index = level). PROGRESSION 1.
  xpToNext: [0, 480, 780, 1020, 1440, 1760, 2110, 2500, 2910, 3360, 3840, 4350, 4900, 5470, 6080],
  // Cumulative XP at the start of each level (index = level). 41,000 at 15.
  xpAtLevel: [0, 0, 480, 1260, 2280, 3720, 5480, 7590, 10090, 13000, 16360, 20200, 24550, 29450, 34920, 41000],
  capGoldPerXp: 50,                        // at the cap: 1 gold per 50 XP (OPEN_QUESTIONS Q17)

  // Kill XP (2.1): (base + perLevel * mobLevel) * gap multiplier * kind multiplier.
  killXp: { base: 20, perLevel: 4 },
  // mob level minus your level -> multiplier. Below -4 = grey, no XP.
  killGap: { '4': 1.4, '3': 1.3, '2': 1.2, '1': 1.1, '0': 1.0, '-1': 0.9, '-2': 0.75, '-3': 0.55, '-4': 0.35 },
  killKind: { normal: 1, weak: 0.6, elite: 2.5, caster: 1, armored: 1 },
  // Quest XP (2.2) for the quest agent: your level minus quest level -> multiplier.
  questGap: { '2': 1.0, '3': 0.75, '4': 0.5, '5': 0.25 },

  // Talents (TALENTS 0, PROGRESSION 8).
  talents: { firstLevel: 5, pointsPerLevel: 1, tierStep: 2 },     // tier n opens at (n - 1) * tierStep points in its branch
  // Trainer cost of a new ability by its learn level (6.3). Level-1 abilities are known at creation.
  trainCost: { '1': 0, '3': 5, '6': 15, '10': 40, '14': 90 },
  // Respec (6.4): 10 + 5 * level gold; the first respec is free.
  respec: { base: 10, perLevel: 5, firstFree: true },

  // Mob stat curve (3): hp = round(100 + 40 L + 0.6 L^2); swing mean 2 + 2.2 L (+-15 %); gold [floor(L / 3), L].
  mobCurve: { hp: [100, 40, 0.6], hit: [2, 2.2], hitSpread: 0.15, attackSpeed: 2.0 },
  mobKinds: {
    normal: { hp: 1, damage: 1 },
    weak: { hp: 0.6, damage: 0.7 },
    caster: { hp: 0.85, damage: 0.7, bolt: { castTime: 2.0, range: 112, mult: 1.6 } },
    armored: { hp: 1.1, damage: 1, physReduce: 0.3, speedMult: 0.7, slowFloor: 0.3 },
    elite: { hp: 2.5, damage: 1.3 },
  },
  // Mob AI (3.2). Distances in px.
  mobAi: {
    speed: 72, armoredSpeed: 50, fleeSpeed: 80,
    aggroRadius: 80, aggroPerLevel: 8, aggroMin: 32, aggroMax: 128,
    stealthNotice: 24, stealthPerLevel: 8,
    social: 48,
    leashDist: 640, leashTime: 10,
    flee: { pct: 0.2, time: 4, dist: 128 },
    respawn: { normal: 90, weak: 60, elite: 360 },
    respawnBlock: 192,                     // a camp never respawns within 12 tiles of a player in combat
    meleeReach: 40, standOff: 24,          // mobs walk to standOff, swing within meleeReach
  },

  // Combat constants (7, CLASSES 0).
  combat: {
    gcd: 1.0, critBase: 0.05, critMult: 1.5,
    pushback: 0.25, pushbackMax: 2, interruptLock: 3,
    combatEnd: 5,
    levelGapStep: 0.05, levelGapMax: 4,
    armor: { perLevel: 40, flat: 100, cap: 0.6 },
    block: { reduce: 0.5 },
    threatHeal: 0.5,
    threatSwitchMelee: 1.1, threatSwitchRanged: 1.3,
    dr: { window: 15, steps: [1, 0.5, 0.25, 0] },
    rootBreakPct: 0.2,
    eliteStunMult: 0.5,
  },

  // Rest and death (5).
  rest: { sitDelay: 1, sitPct: 0.06, standDelay: 5, standHpPct: 0.01 },
  death: { respawnDelay: 3, lanternTouch: 16 },

  // Design gear (4, PROGRESSION 9.1 assumption): weapon ilvl = level, gear adds floor(0.7 L) to the main stat and sta,
  // full-kit armor at ilvl L.
  gear: {
    weaponDps: [2.2, 0.85],                // dps(ilvl) = (2.2 + 0.85 ilvl) * type mult
    weaponSpread: 0.2,
    statPerLevel: 0.7,
    kitArmor: { plate: [32, 18], mail: [30, 16], leather: [20, 11], cloth: [10, 5] },
    shieldArmor: [8, 4],
  },
};

// Weapon types (CLASSES 0.4). speed s, type_mult.
export const WEAPON_TYPES = {
  sword: { speed: 2.4, mult: 1.0, hands: 1 },
  shield: { speed: 0, mult: 0, hands: 1, off: true },
  bow: { speed: 2.6, mult: 1.0, hands: 2 },
  dagger: { speed: 1.6, mult: 0.85, hands: 1 },
  rod: { speed: 3.0, mult: 0.75, hands: 1 },
  quill: { speed: 3.0, mult: 0.75, hands: 1 },
  bell: { speed: 0, mult: 0, hands: 1, off: true },
  book: { speed: 0, mult: 0, hands: 1, off: true },
};

// Mob families (docs/CONTRACTS.md 7.3, docs/design/ZONES_QUESTS.md 2.3 / 3.1 / 4.1, PROGRESSION.md 3). Plain data.
//
// One template per family; a family that lives in more than one zone at different levels (moss scarabs, ink slimes,
// thornbacks, ink blots) keeps one id and each spawn names its own level (zone `spawns[].level`). `level` here is the
// family's whole range. Stats come from the PROGRESSION 3 curve times the kind multiplier: `mobStats(id, level)` is the
// one formula; `hp`, `damage`, `armor`, `attackSpeed` on the template are the values at the range's lowest level (for
// any reader that takes a template as is).
//
// Sprites: real-time mob atlases from the art lane (assets/sprites/mobs/<id>.png/.json, index mobs_index.json).
// MOB_SPRITES is the single table: `sprite` = the Realms atlas id, `lq` = the closest Lexicon Quest field enemy kept as a
// fallback (the renderer uses it while an atlas is missing), `byLevel` = a darker variant from that level up.
// Swapping one family's art is one line here.
export const MOB_SPRITES = {
  ink_slime: { sprite: 'ink_slime', lq: 'ink_slime', byLevel: { 3: 'ink_slime_deep' } },
  moss_scarab: { sprite: 'moss_scarab', lq: 'moss_scarab', byLevel: { 13: 'moss_scarab_moor' } },   // 13: the moor (10 before the cap 20 re-spread)
  briar_wolf: { sprite: 'briar_wolf', lq: 'briar_wolf' },
  thornback_wolf: { sprite: 'thornback_wolf', lq: 'thornback_wolf' },
  ink_blot: { sprite: 'ink_blot', lq: 'ink_blot' },
  fold_ram: { sprite: 'fold_ram', lq: 'glassback' },
  gorse_crow: { sprite: 'gorse_crow', lq: 'lost_page' },
  barrow_shade: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  mist_wolf: { sprite: 'mist_wolf', lq: 'mist_wolf' },
  gorse_boar: { sprite: 'gorse_boar', lq: 'briar_alpha' },
  page_wraith: { sprite: 'page_wraith', lq: 'page_wraith' },
  ink_wraith: { sprite: 'ink_wraith', lq: 'ink_wraith' },
  tower_sentinel: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  watch_lamp: { sprite: 'watch_lamp', lq: 'glint_wisp' },
  sentinel_long_watch: { sprite: 'sentinel_long_watch', lq: 'echo_warden' },
  // the bounty boards' named foes (src/data/bounties.js, BUILDS_2 5.6) wear their family's art
  bramblejaw: { sprite: 'briar_wolf', lq: 'briar_alpha' },
  inkpot: { sprite: 'ink_blot', lq: 'ink_blot' },
  black_tup: { sprite: 'fold_ram', lq: 'glassback' },
  cold_count: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  grimmet: { sprite: 'mist_wolf', lq: 'mist_wolf' },
  drowned_clerk: { sprite: 'page_wraith', lq: 'page_wraith' },
  // dungeons and caves (src/data/dungeons.js): new foes wear the closest family's art until their own exists
  barrow_wether: { sprite: 'fold_ram', lq: 'glassback' },
  the_uncounted: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  barrow_bellwether: { sprite: 'fold_ram', lq: 'glassback' },
  barrow_tallywife: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  barrow_reeve: { sprite: 'barrow_shade', lq: 'echo_warden' },
  watch_wickwright: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  watch_stair_captain: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  cellar_piglet: { sprite: 'gorse_boar', lq: 'briar_alpha' },
  mother_mudge: { sprite: 'gorse_boar', lq: 'briar_alpha' },
  oil_blot: { sprite: 'ink_blot', lq: 'ink_blot' },
  cut_scarab: { sprite: 'moss_scarab', lq: 'moss_scarab' },
  gutterwick: { sprite: 'ink_blot', lq: 'ink_blot' },
  hollow_wolf: { sprite: 'mist_wolf', lq: 'mist_wolf' },
  hollowfang: { sprite: 'mist_wolf', lq: 'mist_wolf' },
};
/** The sprite key for a family at a level (the atlas id; spawns carry it as `sprite`). */
export function mobSprite(id, level = 1) {
  const m = MOB_SPRITES[id];
  if (!m) return id;
  let out = m.sprite;
  for (const [L, v] of Object.entries(m.byLevel || {})) if (level >= +L) out = v;
  return out;
}

// PROGRESSION 3: hp = round(100 + 40 L + 0.6 L^2), swing mean 2 + 2.2 L (+-15%), gold [floor(L / 3), L]; kind multipliers 3.1.
// lowLevelHp mirrors PROGRESSION mobCurve.lowLevelHp (fix pass 1): levels 1-4 x0.78, 5 x0.85, 6 x0.92
// linearFrom mirrors PROGRESSION mobCurve.linearFrom (cap 20, BUILDS_2 5.3): past 15, hp(15) + 58 x (L - 15)
export const MOB_CURVE = { hp: [100, 40, 0.6], hit: [2, 2.2], spread: 0.15, attackSpeed: 2.0, lowLevelHp: [[4, 0.78], [5, 0.85], [6, 0.92]], linearFrom: [15, 58] };
export const MOB_KINDS = {
  normal: { hp: 1, damage: 1, xp: 1 },
  weak: { hp: 0.6, damage: 0.7, xp: 0.6 },
  caster: { hp: 0.85, damage: 0.7, xp: 1, bolt: { castTime: 2.0, range: 112, mult: 1.6 } },
  armored: { hp: 1.1, damage: 1, xp: 1, physReduce: 0.3, speedMult: 0.7 },
  elite: { hp: 2.5, damage: 1.3, xp: 2.5, gold: 3 },
};

/** Stats for a family at a level (PROGRESSION 3 and 3.1). kinds is the template's `kind` (string or list, e.g. ['elite', 'armored']). */
export function mobStats(id, level) {
  const t = MOBS[id];
  const kinds = Array.isArray(t.kind) ? t.kind : [t.kind];
  let hpM = 1, dmgM = 1, xpM = 1, goldM = 1;
  for (const k of kinds) { const m = MOB_KINDS[k]; hpM *= m.hp; dmgM *= m.damage; xpM *= m.xp; goldM *= m.gold || 1; }
  const L = level;
  const low = MOB_CURVE.lowLevelHp.find(([upTo]) => L <= upTo);
  const curve = (x) => MOB_CURVE.hp[0] + MOB_CURVE.hp[1] * x + MOB_CURVE.hp[2] * x * x;
  const [linL, slope] = MOB_CURVE.linearFrom;
  const hp = Math.round((L > linL ? curve(linL) + slope * (L - linL) : curve(L)) * hpM * (low ? low[1] : 1));
  const mean = (MOB_CURVE.hit[0] + MOB_CURVE.hit[1] * L) * dmgM;
  return {
    level: L, hp: t.hpOverride || Math.round(hp * (t.hpMult || 1)),   // hpMult: BOSS_TUNE (dungeon bosses)
    damage: [Math.max(1, Math.round(mean * (1 - MOB_CURVE.spread))), Math.max(1, Math.round(mean * (1 + MOB_CURVE.spread)))],
    attackSpeed: t.attackSpeed || MOB_CURVE.attackSpeed,
    armor: 0, xp: Math.round((20 + 4 * L) * xpM),
    gold: [Math.floor(L / 3) * goldM, L * goldM],
  };
}

// Mob abilities in the CONTRACTS 5.1 shape (the combat sim reads them like a player's; `mob_` prefix keeps ids apart).
// Mob abilities in the CONTRACTS 5.1 shape, with the combat lane's `mobHit` (x one swing of the mob's own damage).
// buildContent merges them over abilities.js MOB_ABILITIES (combat's generic mob_bolt / mob_lunge stay).
export const MOB_ABILITIES = {
  mob_shell_up: { id: 'mob_shell_up', name: 'Shell Up', school: 'physical', castTime: 0, cooldown: 0, gcd: false, target: 'self',
    trigger: { hpBelow: 0.5, once: true },
    effects: [{ type: 'aura', aura: { id: 'shell_up', name: 'Shell Up', kind: 'buff', duration: 4, mods: [{ stat: 'damageTaken', mul: 0.7 }] } }] },
  mob_wolf_lunge: { id: 'mob_wolf_lunge', name: 'Lunge', school: 'physical', castTime: 0, cooldown: 8, gcd: false, target: 'enemy',
    range: { min: 48, max: 64 }, effects: [{ type: 'move', kind: 'leap', distance: 64, speed: 240 }, { type: 'damage', mobHit: 1.0, canCrit: false }] },
  mob_thorn_hide: { id: 'mob_thorn_hide', name: 'Thorn Hide', passive: true, target: 'self',
    effects: [{ type: 'aura', aura: { id: 'thorn_hide', name: 'Thorn Hide', kind: 'buff', duration: null,
      onHitTaken: [{ type: 'damage', to: 'attacker', amount: [2, 2], school: 'nature', if: { melee: true } }] } }] },
  mob_ink_spit: { id: 'mob_ink_spit', name: 'Ink Spit', school: 'ink', castTime: 2.0, cooldown: 0, gcd: true, target: 'enemy',
    range: { min: 0, max: 112 }, projectile: { speed: 200 },
    effects: [{ type: 'damage', mobHit: 1.6, canCrit: false, school: 'ink' }, { type: 'aura', aura: { id: 'ink_spit_slow', name: 'Inked', kind: 'debuff', duration: 4, flags: ['slow'], mods: [{ stat: 'speed', mul: 0.8 }] } }] },
  mob_ram_charge: { id: 'mob_ram_charge', name: 'Ram Charge', school: 'physical', castTime: 0, cooldown: 10, gcd: false, target: 'enemy',
    trigger: { hitFromRange: 48 }, effects: [{ type: 'move', kind: 'charge', distance: 160, speed: 200 }, { type: 'damage', mobHit: 1.2, canCrit: false }, { type: 'move', kind: 'knockback', distance: 32, to: 'target' }] },
  mob_chilling_touch: { id: 'mob_chilling_touch', name: 'Chilling Touch', school: 'shadow', castTime: 2.0, cooldown: 0, gcd: true, target: 'enemy',
    range: { min: 0, max: 112 }, effects: [{ type: 'damage', mobHit: 1.6, canCrit: false, school: 'shadow' }, { type: 'aura', aura: { id: 'chilled', name: 'Chilled', kind: 'debuff', duration: 5, flags: ['slow'], mods: [{ stat: 'speed', mul: 0.7 }] } }] },
  mob_mist_veil: { id: 'mob_mist_veil', name: 'Mist Veil', target: 'self', trigger: { onFlee: true },
    effects: [{ type: 'aura', aura: { id: 'mist_veil', name: 'Mist Veil', kind: 'buff', duration: 2, flags: ['untargetable'] } }] },
  mob_boar_charge: { id: 'mob_boar_charge', name: 'Boar Charge', school: 'physical', castTime: 1.0, telegraph: 'line', cooldown: 12, gcd: true, target: 'enemy',
    range: { min: 32, max: 96 }, area: { shape: 'line', width: 16, radius: 96, at: 'self' },
    effects: [{ type: 'move', kind: 'charge', distance: 96, speed: 260 }, { type: 'damage', mobHit: 1.4, canCrit: false }, { type: 'aura', aura: { id: 'boar_stun', name: 'Bowled Over', kind: 'debuff', duration: 1, flags: ['stun'] } }] },
  mob_paper_cut: { id: 'mob_paper_cut', name: 'Paper Cut', school: 'ink', castTime: 2.0, cooldown: 0, gcd: true, target: 'enemy',
    range: { min: 0, max: 112 }, projectile: { speed: 220 }, effects: [{ type: 'damage', mobHit: 1.6, canCrit: false, school: 'ink' }] },
  mob_scatter: { id: 'mob_scatter', name: 'Scatter', target: 'self', cooldown: 10, gcd: false, trigger: { meleeHit: true },
    effects: [{ type: 'move', kind: 'blink', distance: 64 }] },
  mob_ink_tide: { id: 'mob_ink_tide', name: 'Ink Tide', school: 'ink', castTime: 2.5, telegraph: 'circle', cooldown: 6, gcd: true, target: 'enemy',
    range: { min: 0, max: 112 }, area: { shape: 'circle', radius: 24, at: 'target' },
    effects: [{ type: 'damage', mobHit: 1.6, canCrit: false, school: 'ink' }, { type: 'aura', aura: { id: 'ink_tide_slow', name: 'Ink Tide', kind: 'debuff', duration: 4, flags: ['slow'], mods: [{ stat: 'speed', mul: 0.6 }] } }] },
  mob_lamp_sweep: { id: 'mob_lamp_sweep', name: 'Lamp Sweep', school: 'light', castTime: 1.5, telegraph: 'cone', cooldown: 10, gcd: true, target: 'enemy',
    range: { min: 0, max: 48 }, area: { shape: 'cone', radius: 48, angle: 90, at: 'self' }, effects: [{ type: 'damage', mobHit: 2.5, canCrit: false, school: 'light' }] },
  mob_kindle_watch: { id: 'mob_kindle_watch', name: 'Kindle the Watch', school: 'light', castTime: 3.0, interruptible: true, cooldown: 0, gcd: true, target: 'ally',
    range: { min: 0, max: 128 }, targetRule: { family: 'construct', hurtMost: true }, effects: [{ type: 'heal', pctMaxHp: 0.08 }] },
  mob_order_given: { id: 'mob_order_given', name: 'Order Given', target: 'self', trigger: { hpBelow: 0.5, once: true }, yell: 'WATCH THE ROADS',
    effects: [{ type: 'summon', mob: 'tower_sentinel', level: 17, count: 2, walkIn: 6, from: 'adds_from' }] },
  mob_bolt: { id: 'mob_bolt', name: 'Bolt', school: 'ink', castTime: 2.0, cooldown: 0, gcd: true, target: 'enemy', range: { min: 0, max: 112 }, projectile: { speed: 200 },
    effects: [{ type: 'damage', mobHit: 1.6, canCrit: false, school: 'ink' }] },

  // ---- dungeon and cave bosses (src/data/dungeons.js, src/sim/dungeons.js). Every big hit shows its ground warning first
  // (`telegraph`): a circle on the ground ('ground' target: the spot is fixed where the hero stood when the cast began, so
  // stepping out of it works), a cone in front of the boss, or a line. Damage is in swings of the boss's own hit (mobHit).
// Every effect says `to: 'enemies'`: it lands on whoever is inside the shape when the cast ends (without it an effect
// goes to the cast's target, or to the caster when there is none, and the warning would mean nothing).
  mob_bell_toll: { id: 'mob_bell_toll', name: 'Bell Toll', school: 'physical', castTime: 1.5, telegraph: 'circle', cooldown: 12, gcd: true, target: 'enemy',
    range: { min: 0, max: 40 }, area: { shape: 'circle', radius: 48, at: 'self' },
    effects: [{ type: 'damage', to: 'enemies', mobHit: 1.8, canCrit: false }, { type: 'aura', to: 'enemies', aura: { id: 'bell_toll_slow', name: 'Ringing Ears', kind: 'debuff', duration: 3, flags: ['slow'], mods: [{ stat: 'speed', mul: 0.7 }] } }] },
  mob_tally_rain: { id: 'mob_tally_rain', name: 'Tally Rain', school: 'shadow', castTime: 2.0, telegraph: 'circle', cooldown: 9, gcd: true, target: 'ground',
    range: { min: 0, max: 128 }, area: { shape: 'circle', radius: 32, at: 'ground' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.2, canCrit: false, school: 'shadow' }] },
  mob_reeve_slam: { id: 'mob_reeve_slam', name: 'Ledger Slam', school: 'physical', castTime: 1.6, telegraph: 'circle', cooldown: 10, gcd: true, target: 'ground',
    range: { min: 0, max: 64 }, area: { shape: 'circle', radius: 36, at: 'ground' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.6, canCrit: false }] },
  mob_reeve_sweep: { id: 'mob_reeve_sweep', name: 'Counting Sweep', school: 'shadow', castTime: 1.2, telegraph: 'cone', cooldown: 8, gcd: true, target: 'enemy',
    range: { min: 0, max: 40 }, area: { shape: 'cone', radius: 56, angle: 120, at: 'self' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.0, canCrit: false, school: 'shadow' }] },
  mob_wick_flare: { id: 'mob_wick_flare', name: 'Wick Flare', school: 'light', castTime: 1.8, telegraph: 'circle', cooldown: 9, gcd: true, target: 'ground',
    range: { min: 0, max: 128 }, area: { shape: 'circle', radius: 40, at: 'ground' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.4, canCrit: false, school: 'light' }] },
  mob_captain_hammer: { id: 'mob_captain_hammer', name: 'Stair Hammer', school: 'physical', castTime: 1.6, telegraph: 'circle', cooldown: 10, gcd: true, target: 'ground',
    range: { min: 0, max: 64 }, area: { shape: 'circle', radius: 36, at: 'ground' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.6, canCrit: false }] },
  mob_stair_rush: { id: 'mob_stair_rush', name: 'Stair Rush', school: 'physical', castTime: 1.0, telegraph: 'line', cooldown: 14, gcd: true, target: 'enemy',
    range: { min: 32, max: 112 }, area: { shape: 'line', width: 16, radius: 112, at: 'self' },
    effects: [{ type: 'move', kind: 'charge', distance: 112, speed: 280 }, { type: 'damage', mobHit: 1.5, canCrit: false }] },
  mob_watch_hammer: { id: 'mob_watch_hammer', name: 'Watch Hammer', school: 'light', castTime: 1.6, telegraph: 'circle', cooldown: 11, gcd: true, target: 'ground',
    range: { min: 0, max: 64 }, area: { shape: 'circle', radius: 40, at: 'ground' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.8, canCrit: false, school: 'light' }] },
  // the Watchtower bosses' Lamp Sweep: the open moor's cone (mob_lamp_sweep), but it lands only inside the cone
  mob_keeper_sweep: { id: 'mob_keeper_sweep', name: 'Lamp Sweep', school: 'light', castTime: 1.5, telegraph: 'cone', cooldown: 10, gcd: true, target: 'enemy',
    range: { min: 0, max: 48 }, area: { shape: 'cone', radius: 48, angle: 90, at: 'self' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.5, canCrit: false, school: 'light' }] },
  mob_oil_pool: { id: 'mob_oil_pool', name: 'Oil Pool', school: 'ink', castTime: 2.0, telegraph: 'circle', cooldown: 10, gcd: true, target: 'ground',
    range: { min: 0, max: 112 }, area: { shape: 'circle', radius: 28, at: 'ground' },
    effects: [{ type: 'damage', to: 'enemies', mobHit: 2.0, canCrit: false, school: 'ink' }, { type: 'aura', to: 'enemies', aura: { id: 'oil_slick', name: 'Oil-Slicked', kind: 'debuff', duration: 4, flags: ['slow'], mods: [{ stat: 'speed', mul: 0.6 }] } }] },
};

const T = (o) => o;
// traits (class identity pass, PROGRESSION mobTraits): armored, caster, fast, heavy, tough. Kind 'caster' and kind 'armored' carry
// their trait without listing it (Ink Blot, Barrow Shade, the wraiths and the Watch Lamp are casters; the Tower Sentinel and the
// Sentinel of the Long Watch are armored).
// loot.table entries: { item, chance, quest?, minLevel? }; gear and junk rolls are generic (PROGRESSION 4.6, items.js DROP_RULES)
export const MOBS = {
  ink_slime: T({ name: 'Ink Slime', level: [1, 4], family: 'ooze', kind: 'normal', behavior: 'passive', aggroRadius: 0, speed: 40, wander: 2, flee: null,
    abilities: [], loot: { junk: 'slime_ink', table: [{ item: 'quills_copy', chance: 0.5, quest: 'wm_copied_twice', minLevel: 3 }] } }),
  moss_scarab: T({ name: 'Moss Scarab', level: [2, 14], family: 'insect', kind: 'normal', traits: ['armored'], behavior: 'passive', aggroRadius: 0, speed: 48, wander: 2, flee: null,
    names: { 14: 'Moor Scarab' }, abilities: [{ id: 'mob_shell_up' }], loot: { junk: 'scarab_shell', table: [] } }),
  briar_wolf: T({ name: 'Briar Wolf', level: [3, 5], family: 'beast', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 3, flee: 0.2, social: true,
    abilities: [{ id: 'mob_wolf_lunge', chance: 1, cooldown: 8 }], loot: { junk: 'wolf_pelt', table: [] } }),
  thornback_wolf: T({ name: 'Thornback Wolf', level: [5, 10], family: 'beast', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 3, flee: 0.2, social: true,
    abilities: [{ id: 'mob_thorn_hide' }], loot: { junk: 'thorny_pelt', table: [{ item: 'thornback_hide', chance: 0.6, quest: 'wm_rhythm_of_the_forge' },
      { item: 'thornback_fang', chance: 0.5, quest: 'bounty_wm_fangs', maxLevel: 6 }] } }),
  ink_blot: T({ name: 'Ink Blot', level: [5, 8], family: 'ooze', kind: 'caster', behavior: 'aggressive', aggroRadius: 80, speed: 60, wander: 1, flee: null,
    abilities: [{ id: 'mob_ink_spit' }], loot: { junk: 'blot_residue', table: [{ item: 'blot_ink_pot', chance: 0.6, quest: 'bounty_wm_blot_ink', maxLevel: 6 }] } }),
  fold_ram: T({ name: 'Fold Ram', level: [6, 8], family: 'beast', kind: 'normal', traits: ['heavy'], behavior: 'passive', aggroRadius: 0, speed: 72, wander: 3, flee: null,
    abilities: [{ id: 'mob_ram_charge' }], loot: { junk: 'tangled_wool', table: [{ item: 'fold_fleece', chance: 1.0, quest: 'dn_name_in_the_hem' }] } }),
  gorse_crow: T({ name: 'Gorse Crow', level: [10, 10], family: 'beast', kind: 'weak', behavior: 'flees', aggroRadius: 48, speed: 80, wander: 2, flee: 0.5, flying: true,
    fleeRule: { at: 0.5, distance: 160, returnTo: 'spawn' }, abilities: [], loot: { junk: 'crow_feather', table: [{ item: 'pocket_button', chance: 1.0, quest: 'dn_eleven_pockets' },
      { item: 'black_crow_quill', chance: 0.6, quest: 'bounty_dn_crow_quills' }] } }),
  barrow_shade: T({ name: 'Barrow Shade', level: [10, 12], family: 'spirit', kind: 'caster', behavior: 'aggressive', aggroRadius: 96, speed: 60, wander: 3, flee: null,
    abilities: [{ id: 'mob_chilling_touch' }], loot: { junk: 'grave_dust', table: [{ item: 'barrow_candle', chance: 0.5, quest: 'bounty_dn_candles' }] } }),
  mist_wolf: T({ name: 'Mist Wolf', level: [13, 16], family: 'beast', kind: 'normal', traits: ['fast'], behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 3, flee: 0.2, social: true,
    abilities: [{ id: 'mob_mist_veil' }], loot: { junk: 'mist_pelt', table: [{ item: 'mist_wolf_tooth', chance: 0.5, quest: 'bounty_mo_teeth' }] } }),
  gorse_boar: T({ name: 'Gorse Boar', level: [14, 16], family: 'beast', kind: 'normal', traits: ['heavy', 'tough'], behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 3, flee: null,
    abilities: [{ id: 'mob_boar_charge', cooldown: 12 }], loot: { junk: 'boar_hide', table: [{ item: 'boar_tusk', chance: 0.7, quest: 'mo_peat_and_tusk' },
      { item: 'boar_bristle', chance: 0.6, quest: 'bounty_mo_bristles' }] } }),
  page_wraith: T({ name: 'Page Wraith', level: [16, 19], family: 'spirit', kind: 'caster', traits: ['fast'], behavior: 'aggressive', aggroRadius: 96, speed: 64, wander: 3, flee: null, flying: true,
    abilities: [{ id: 'mob_paper_cut' }, { id: 'mob_scatter', cooldown: 10 }], loot: { junk: 'torn_page', table: [] } }),
  ink_wraith: T({ name: 'Ink Wraith', level: [17, 19], family: 'spirit', kind: 'caster', behavior: 'aggressive', aggroRadius: 96, speed: 64, wander: 3, flee: null, flying: true,
    abilities: [{ id: 'mob_ink_tide' }], loot: { junk: 'ink_wisp', table: [] } }),
  tower_sentinel: T({ name: 'Tower Sentinel', level: [17, 19], family: 'construct', kind: 'armored', behavior: 'aggressive', aggroRadius: 80, speed: 50, wander: 4, flee: null, patrol: true,
    abilities: [{ id: 'mob_lamp_sweep' }], loot: { junk: 'lamp_glass', table: [{ item: 'chime_piece', chance: 0.4, quest: 'mo_ninth_chime' }] } }),
  watch_lamp: T({ name: 'Watch Lamp', level: [17, 18], family: 'construct', kind: 'caster', behavior: 'aggressive', aggroRadius: 112, speed: 0, wander: 0, flee: null, stationary: true,
    respawnInFight: false, abilities: [{ id: 'mob_kindle_watch' }], loot: { junk: 'lamp_glass', table: [] } }),
  // the Watchtower's last boss since the dungeons build (2026-11-22): it moved off the open moor into its own copy
  // (src/data/maps/watchtower.js); Odo still rings the eighth post outside, and the chime carries down the stair
  sentinel_long_watch: T({ name: 'Sentinel of the Long Watch', level: [19, 20], family: 'construct', kind: ['elite', 'armored'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96,
    speed: 50, wander: 0, leash: 480, flee: null, attackSpeed: 2.4,   // health and damage: BOSS_TUNE below (was hpOverride 2670 on the open moor)
    card: 'SENTINEL OF THE LONG WATCH. Its lamps were never put out.', deathLine: '...the roads... are watched...',
    script: 'long_watch', abilities: [{ id: 'mob_watch_hammer' }, { id: 'mob_keeper_sweep', cooldown: 10 }],
    // Order Given (its adds at half health) is a boss phase now (src/sim/dungeons.js), so the adds come tuned for a solo hero
    fight: { odoChime: { every: 20, stun: 2, delaysSweep: true }, lamps: 2, adds: { at: 0.5, mob: 'tower_sentinel', level: 17, count: 2, walkIn: 6 },
      phases: [{ at: 0.5, yell: 'WATCH THE ROADS', summon: { mob: 'tower_sentinel', level: 18, count: 2, from: 'adds_from' } }],
      frenzy: { after: 120, yell: 'THE WATCH NEVER ENDS', mods: [{ stat: 'damageDone', mul: 1.4 }, { stat: 'attackSpeed', mul: 1.25 }] } },
    loot: { junk: 'lamp_glass', table: [], gear: 'elite' } }),

  // ---- the bounty boards' named foes (src/data/bounties.js, BUILDS_2 5.6): one each, a fixed spot, the `tough` trait
  // (a lone hard foe: x1.6 health, x1.15 damage, x1.5 XP). They never call friends.
  bramblejaw: T({ name: 'Old Bramblejaw', level: [5, 5], family: 'beast', kind: 'normal', traits: ['tough'], behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 2, flee: null,
    abilities: [{ id: 'mob_wolf_lunge', chance: 1, cooldown: 8 }], loot: { junk: 'wolf_pelt', table: [] } }),
  inkpot: T({ name: 'The Inkpot', level: [6, 6], family: 'ooze', kind: 'caster', traits: ['tough'], behavior: 'aggressive', aggroRadius: 80, speed: 60, wander: 1, flee: null,
    abilities: [{ id: 'mob_ink_spit' }], loot: { junk: 'blot_residue', table: [] } }),
  black_tup: T({ name: 'The Black Tup', level: [10, 10], family: 'beast', kind: 'normal', traits: ['heavy', 'tough'], behavior: 'passive', aggroRadius: 0, speed: 72, wander: 2, flee: null,
    abilities: [{ id: 'mob_ram_charge' }], loot: { junk: 'tangled_wool', table: [] } }),
  cold_count: T({ name: 'The Cold Count', level: [12, 12], family: 'spirit', kind: 'caster', traits: ['tough'], behavior: 'aggressive', aggroRadius: 96, speed: 60, wander: 2, flee: null,
    abilities: [{ id: 'mob_chilling_touch' }], loot: { junk: 'grave_dust', table: [] } }),
  grimmet: T({ name: 'Grimmet', level: [15, 15], family: 'beast', kind: 'normal', traits: ['fast', 'tough'], behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 2, flee: null,
    abilities: [{ id: 'mob_wolf_lunge', chance: 1, cooldown: 8 }], loot: { junk: 'mist_pelt', table: [] } }),
  drowned_clerk: T({ name: 'The Drowned Clerk', level: [17, 17], family: 'spirit', kind: 'caster', traits: ['tough'], behavior: 'aggressive', aggroRadius: 96, speed: 64, wander: 2, flee: null, flying: true,
    abilities: [{ id: 'mob_paper_cut' }], loot: { junk: 'torn_page', table: [] } }),

  // ---- dungeons and caves (src/data/dungeons.js). Bosses are `boss: true` (the snapshot's rank 'boss'), cave foes `elite: true`.
  // `fight` is the boss script (src/sim/dungeons.js): phases by health (adds), a frenzy after `after` s in the fight.
  // hpMult / dmgMult scale the curve values (src/sim/stats.js recalcMob); they are the tuning knobs the clear bot sets.
  // The Wethers' Barrow (10 to 12): the barrow of a reeve who counted the folds and the names, and never once came out right
  barrow_wether: T({ name: 'Barrow Wether', level: [10, 12], family: 'spirit', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 64, wander: 1, flee: null,
    abilities: [{ id: 'mob_ram_charge' }], loot: { junk: 'tangled_wool', table: [] } }),
  the_uncounted: T({ name: 'The Uncounted', level: [10, 12], family: 'spirit', kind: 'weak', behavior: 'aggressive', aggroRadius: 96, speed: 60, wander: 0, flee: null,
    abilities: [], loot: { junk: 'grave_dust', table: [] } }),
  barrow_bellwether: T({ name: 'The Bellwether', level: [11, 11], family: 'spirit', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96,
    speed: 64, wander: 0, leash: 320, flee: null, attackSpeed: 2.2,
    card: 'THE BELLWETHER. It led the flock in. It will lead you nowhere.', deathLine: 'The bell rolls on the stone, and stops.',
    abilities: [{ id: 'mob_bell_toll' }, { id: 'mob_ram_charge' }],
    fight: { phases: [{ at: 0.5, yell: 'The bell rings once, and the fold answers.', summon: { mob: 'the_uncounted', level: 10, count: 2 } }],
      frenzy: { after: 90, yell: 'The Bellwether lowers its horns.', mods: [{ stat: 'damageDone', mul: 1.4 }, { stat: 'attackSpeed', mul: 1.25 }] } },
    loot: { junk: 'tangled_wool', table: [], gear: 'elite' } }),
  barrow_tallywife: T({ name: 'The Tally-Wife', level: [11, 11], family: 'spirit', kind: ['elite', 'caster'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96,
    speed: 56, wander: 0, leash: 320, flee: null,
    card: 'THE TALLY-WIFE. Every notch a name. Every name a notch.', deathLine: 'Her sticks fall in a heap, uncounted.',
    abilities: [{ id: 'mob_tally_rain' }, { id: 'mob_chilling_touch' }],
    fight: { phases: [{ at: 0.5, yell: 'Stand still. I am not done counting you.', summon: { mob: 'the_uncounted', level: 10, count: 2 } }],
      frenzy: { after: 90, yell: 'She cuts the notches faster.', mods: [{ stat: 'damageDone', mul: 1.4 }, { stat: 'castTime', mul: 0.8 }] } },
    loot: { junk: 'grave_dust', table: [], gear: 'elite' } }),
  barrow_reeve: T({ name: 'The Barrow Reeve', level: [12, 12], family: 'spirit', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96,
    speed: 56, wander: 0, leash: 320, flee: null, attackSpeed: 2.4,
    card: 'THE BARROW REEVE. He counts the names, and always comes up one short.', deathLine: '...eleven... twelve... and you. Thirteen. All here.',
    abilities: [{ id: 'mob_reeve_slam' }, { id: 'mob_reeve_sweep' }],
    fight: { phases: [{ at: 0.5, yell: 'ONE SHORT. WHO IS MISSING? STAND AND BE COUNTED.', summon: { mob: 'the_uncounted', level: 11, count: 2 } }],
      frenzy: { after: 150, yell: 'COUNT AGAIN. COUNT AGAIN.', mods: [{ stat: 'damageDone', mul: 1.5 }, { stat: 'attackSpeed', mul: 1.3 }] } },
    loot: { junk: 'grave_dust', table: [], gear: 'elite' } }),
  // The Watchtower (18 to 20): the tower's keepers, still on the stair; the Sentinel of the Long Watch (above) at the top
  watch_wickwright: T({ name: 'The Wickwright', level: [19, 19], family: 'construct', kind: ['elite', 'caster'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96,
    speed: 50, wander: 0, leash: 320, flee: null,
    card: 'THE WICKWRIGHT. It trims the wicks. It has never let one go out.', deathLine: 'A thin smoke, and the smell of a snuffed lamp.',
    abilities: [{ id: 'mob_wick_flare' }, { id: 'mob_keeper_sweep', cooldown: 10 }, { id: 'mob_paper_cut' }],
    fight: { phases: [{ at: 0.5, yell: 'LIGHT THE LAMPS', summon: { mob: 'watch_lamp', level: 18, count: 2 } }],
      frenzy: { after: 100, yell: 'The Wickwright turns every flame up high.', mods: [{ stat: 'damageDone', mul: 1.4 }, { stat: 'castTime', mul: 0.8 }] } },
    loot: { junk: 'lamp_glass', table: [], gear: 'elite' } }),
  watch_stair_captain: T({ name: 'Captain of the Stair', level: [19, 19], family: 'construct', kind: ['elite', 'armored'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96,
    speed: 50, wander: 0, leash: 320, flee: null, attackSpeed: 2.4,
    card: 'CAPTAIN OF THE STAIR. Nobody goes up without leave.', deathLine: 'The captain kneels on the step it guarded.',
    abilities: [{ id: 'mob_captain_hammer' }, { id: 'mob_stair_rush' }],
    fight: { phases: [{ at: 0.5, yell: 'SENTRIES, TO THE STAIR', summon: { mob: 'tower_sentinel', level: 18, count: 2 } }],
      frenzy: { after: 100, yell: 'The captain stops giving ground.', mods: [{ stat: 'damageDone', mul: 1.4 }, { stat: 'attackSpeed', mul: 1.25 }] } },
    loot: { junk: 'lamp_glass', table: [], gear: 'elite' } }),
  // the caves: a named rare foe each (elite, not a boss)
  cellar_piglet: T({ name: 'Rootcellar Piglet', level: [4, 6], family: 'beast', kind: 'weak', behavior: 'aggressive', aggroRadius: 64, speed: 72, wander: 1, flee: 0.3,
    abilities: [], loot: { junk: 'boar_hide', table: [] } }),
  mother_mudge: T({ name: 'Old Mother Mudge', level: [6, 6], family: 'beast', kind: ['elite'], elite: true, rare: true, behavior: 'elite', aggroRadius: 80, speed: 72, wander: 0, leash: 256, flee: null,
    card: 'OLD MOTHER MUDGE. She went to ground, and the ground is hers now.', deathLine: 'The sow sighs, and is still.',
    abilities: [{ id: 'mob_boar_charge', cooldown: 12 }],
    fight: { phases: [{ at: 0.5, yell: 'Mother Mudge squeals for her litter.', summon: { mob: 'cellar_piglet', level: 4, count: 2 } }] },
    loot: { junk: 'boar_hide', table: [{ item: 'cellar_door_key', chance: 1.0, quest: 'cv_mother_mudge' }], gear: 'elite' } }),
  oil_blot: T({ name: 'Oil-Slick Blot', level: [7, 9], family: 'ooze', kind: 'caster', behavior: 'aggressive', aggroRadius: 80, speed: 56, wander: 1, flee: null,
    abilities: [{ id: 'mob_ink_spit' }], loot: { junk: 'blot_residue', table: [{ item: 'stolen_oil_flask', chance: 0.75, quest: 'cv_lantern_oil' }] } }),
  cut_scarab: T({ name: 'Cut Scarab', level: [7, 9], family: 'insect', kind: 'normal', traits: ['armored'], behavior: 'aggressive', aggroRadius: 64, speed: 48, wander: 1, flee: null,
    abilities: [{ id: 'mob_shell_up' }], loot: { junk: 'scarab_shell', table: [] } }),
  gutterwick: T({ name: 'Gutterwick the Oil-Drinker', level: [9, 9], family: 'ooze', kind: ['elite', 'caster'], elite: true, rare: true, behavior: 'elite', aggroRadius: 64, speed: 50, wander: 0, leash: 256, flee: null,
    card: 'GUTTERWICK THE OIL-DRINKER. It drank the smugglers\' whole cargo, and it is still thirsty.', deathLine: 'It burps once, and spreads out flat.',
    abilities: [{ id: 'mob_oil_pool' }, { id: 'mob_ink_spit' }],
    loot: { junk: 'blot_residue', table: [{ item: 'stolen_oil_flask', chance: 1.0, qty: 3, quest: 'cv_lantern_oil' }], gear: 'elite' } }),
  hollow_wolf: T({ name: 'Hollow Wolf', level: [14, 16], family: 'beast', kind: 'normal', traits: ['fast'], behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 1, flee: null, social: true,
    abilities: [{ id: 'mob_wolf_lunge', chance: 1, cooldown: 8 }], loot: { junk: 'mist_pelt', table: [{ item: 'shrine_bell_shard', chance: 0.6, quest: 'cv_drowned_shrine' }] } }),
  hollowfang: T({ name: 'Hollowfang, Alpha of the Mist', level: [16, 16], family: 'beast', kind: ['elite'], elite: true, rare: true, behavior: 'elite', aggroRadius: 96, speed: 72, wander: 0, leash: 256, flee: null,
    card: 'HOLLOWFANG. The mist comes out of the hollow when it breathes.', deathLine: 'The mist thins, and the shrine bell is quiet.',
    abilities: [{ id: 'mob_wolf_lunge', chance: 1, cooldown: 8 }, { id: 'mob_mist_veil' }],
    fight: { phases: [{ at: 0.5, yell: 'Hollowfang howls, and the hollow howls back.', summon: { mob: 'hollow_wolf', level: 14, count: 2 } }] },
    loot: { junk: 'mist_pelt', table: [{ item: 'shrine_bell_shard', chance: 1.0, qty: 4, quest: 'cv_drowned_shrine' }], gear: 'elite' } }),
};
// Boss and named-foe tuning (the dungeon clear bot's knobs, qa/sim/dungeon_bot.mjs): health and damage x the curve
// (src/sim/stats.js recalcMob). Kept in one table so a tuning pass is one place.
export const BOSS_TUNE = {
  barrow_bellwether: { hpMult: 0.8, dmgMult: 0.42 }, barrow_tallywife: { hpMult: 0.8, dmgMult: 0.42 }, barrow_reeve: { hpMult: 0.8, dmgMult: 0.38 },
  watch_wickwright: { hpMult: 0.7, dmgMult: 0.32 }, watch_stair_captain: { hpMult: 0.65, dmgMult: 0.32 },
  sentinel_long_watch: { hpMult: 0.6, dmgMult: 0.32 },
  mother_mudge: { hpMult: 0.7, dmgMult: 0.4 }, gutterwick: { hpMult: 0.7, dmgMult: 0.4 }, hollowfang: { hpMult: 0.7, dmgMult: 0.36 },
};
for (const [id, m] of Object.entries(MOBS)) {
  m.id = id;
  m.sprite = MOB_SPRITES[id].sprite;
  m.spriteLq = MOB_SPRITES[id].lq;
  m.faction = 'hostile';
  m.school = 'physical';
  m.elite = !!m.elite;
  m.leash = m.leash || 640;
  if (BOSS_TUNE[id]) Object.assign(m, BOSS_TUNE[id]);
  // a boss or named foe in a dungeon or cave follows you anywhere in its place (30 tiles): a kited fight never resets halfway
  if (BOSS_TUNE[id]) m.leash = Math.max(m.leash, 480);
  m.xp = null;                                             // the level formula (PROGRESSION 2.1)
  const s = mobStats(id, m.level[0]);
  Object.assign(m, { hp: s.hp, damage: s.damage, attackSpeed: s.attackSpeed, armor: s.armor });
  m.loot.gold = s.gold;
  m.respawn = m.elite ? 360 : m.kind === 'weak' ? 60 : 90;
}

export const MOB_IDS = Object.keys(MOBS);

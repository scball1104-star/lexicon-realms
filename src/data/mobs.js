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
  moss_scarab: { sprite: 'moss_scarab', lq: 'moss_scarab', byLevel: { 10: 'moss_scarab_moor' } },
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
export const MOB_CURVE = { hp: [100, 40, 0.6], hit: [2, 2.2], spread: 0.15, attackSpeed: 2.0, lowLevelHp: [[4, 0.78], [5, 0.85], [6, 0.92]] };
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
  const hp = Math.round((MOB_CURVE.hp[0] + MOB_CURVE.hp[1] * L + MOB_CURVE.hp[2] * L * L) * hpM * (low ? low[1] : 1));
  const mean = (MOB_CURVE.hit[0] + MOB_CURVE.hit[1] * L) * dmgM;
  return {
    level: L, hp: t.hpOverride || hp,
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
    effects: [{ type: 'summon', mob: 'tower_sentinel', level: 13, count: 2, walkIn: 6, from: 'adds_from' }] },
  mob_bolt: { id: 'mob_bolt', name: 'Bolt', school: 'ink', castTime: 2.0, cooldown: 0, gcd: true, target: 'enemy', range: { min: 0, max: 112 }, projectile: { speed: 200 },
    effects: [{ type: 'damage', mobHit: 1.6, canCrit: false, school: 'ink' }] },
};

const T = (o) => o;
// traits (class identity pass, PROGRESSION mobTraits): armored, caster, fast, heavy, tough. Kind 'caster' and kind 'armored' carry
// their trait without listing it (Ink Blot, Barrow Shade, the wraiths and the Watch Lamp are casters; the Tower Sentinel and the
// Sentinel of the Long Watch are armored).
// loot.table entries: { item, chance, quest?, minLevel? }; gear and junk rolls are generic (PROGRESSION 4.6, items.js DROP_RULES)
export const MOBS = {
  ink_slime: T({ name: 'Ink Slime', level: [1, 4], family: 'ooze', kind: 'normal', behavior: 'passive', aggroRadius: 0, speed: 40, wander: 2, flee: null,
    abilities: [], loot: { junk: 'slime_ink', table: [{ item: 'quills_copy', chance: 0.5, quest: 'wm_copied_twice', minLevel: 3 }] } }),
  moss_scarab: T({ name: 'Moss Scarab', level: [2, 11], family: 'insect', kind: 'normal', traits: ['armored'], behavior: 'passive', aggroRadius: 0, speed: 48, wander: 2, flee: null,
    names: { 11: 'Moor Scarab' }, abilities: [{ id: 'mob_shell_up' }], loot: { junk: 'scarab_shell', table: [] } }),
  briar_wolf: T({ name: 'Briar Wolf', level: [3, 5], family: 'beast', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 3, flee: 0.2, social: true,
    abilities: [{ id: 'mob_wolf_lunge', chance: 1, cooldown: 8 }], loot: { junk: 'wolf_pelt', table: [] } }),
  thornback_wolf: T({ name: 'Thornback Wolf', level: [5, 8], family: 'beast', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 3, flee: 0.2, social: true,
    abilities: [{ id: 'mob_thorn_hide' }], loot: { junk: 'thorny_pelt', table: [{ item: 'thornback_hide', chance: 0.6, quest: 'wm_rhythm_of_the_forge' }] } }),
  ink_blot: T({ name: 'Ink Blot', level: [5, 7], family: 'ooze', kind: 'caster', behavior: 'aggressive', aggroRadius: 80, speed: 60, wander: 1, flee: null,
    abilities: [{ id: 'mob_ink_spit' }], loot: { junk: 'blot_residue', table: [] } }),
  fold_ram: T({ name: 'Fold Ram', level: [6, 7], family: 'beast', kind: 'normal', traits: ['heavy'], behavior: 'passive', aggroRadius: 0, speed: 72, wander: 3, flee: null,
    abilities: [{ id: 'mob_ram_charge' }], loot: { junk: 'tangled_wool', table: [{ item: 'fold_fleece', chance: 1.0, quest: 'dn_name_in_the_hem' }] } }),
  gorse_crow: T({ name: 'Gorse Crow', level: [8, 8], family: 'beast', kind: 'weak', behavior: 'flees', aggroRadius: 48, speed: 80, wander: 2, flee: 0.5, flying: true,
    fleeRule: { at: 0.5, distance: 160, returnTo: 'spawn' }, abilities: [], loot: { junk: 'crow_feather', table: [{ item: 'pocket_button', chance: 1.0, quest: 'dn_eleven_pockets' }] } }),
  barrow_shade: T({ name: 'Barrow Shade', level: [8, 9], family: 'spirit', kind: 'caster', behavior: 'aggressive', aggroRadius: 96, speed: 60, wander: 3, flee: null,
    abilities: [{ id: 'mob_chilling_touch' }], loot: { junk: 'grave_dust', table: [] } }),
  mist_wolf: T({ name: 'Mist Wolf', level: [10, 12], family: 'beast', kind: 'normal', traits: ['fast'], behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 3, flee: 0.2, social: true,
    abilities: [{ id: 'mob_mist_veil' }], loot: { junk: 'mist_pelt', table: [] } }),
  gorse_boar: T({ name: 'Gorse Boar', level: [11, 12], family: 'beast', kind: 'normal', traits: ['heavy', 'tough'], behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 3, flee: null,
    abilities: [{ id: 'mob_boar_charge', cooldown: 12 }], loot: { junk: 'boar_hide', table: [{ item: 'boar_tusk', chance: 0.7, quest: 'mo_peat_and_tusk' }] } }),
  page_wraith: T({ name: 'Page Wraith', level: [12, 13], family: 'spirit', kind: 'caster', traits: ['fast'], behavior: 'aggressive', aggroRadius: 96, speed: 64, wander: 3, flee: null, flying: true,
    abilities: [{ id: 'mob_paper_cut' }, { id: 'mob_scatter', cooldown: 10 }], loot: { junk: 'torn_page', table: [] } }),
  ink_wraith: T({ name: 'Ink Wraith', level: [13, 13], family: 'spirit', kind: 'caster', behavior: 'aggressive', aggroRadius: 96, speed: 64, wander: 3, flee: null, flying: true,
    abilities: [{ id: 'mob_ink_tide' }], loot: { junk: 'ink_wisp', table: [] } }),
  tower_sentinel: T({ name: 'Tower Sentinel', level: [13, 14], family: 'construct', kind: 'armored', behavior: 'aggressive', aggroRadius: 80, speed: 50, wander: 4, flee: null, patrol: true,
    abilities: [{ id: 'mob_lamp_sweep' }], loot: { junk: 'lamp_glass', table: [{ item: 'chime_piece', chance: 0.4, quest: 'mo_ninth_chime' }] } }),
  watch_lamp: T({ name: 'Watch Lamp', level: [13, 13], family: 'construct', kind: 'caster', behavior: 'aggressive', aggroRadius: 112, speed: 0, wander: 0, flee: null, stationary: true,
    respawnInFight: false, abilities: [{ id: 'mob_kindle_watch' }], loot: { junk: 'lamp_glass', table: [] } }),
  sentinel_long_watch: T({ name: 'Sentinel of the Long Watch', level: [14, 14], family: 'construct', kind: ['elite', 'armored'], elite: true, behavior: 'elite', aggroRadius: 96,
    speed: 50, wander: 0, leash: 256, flee: null, attackSpeed: 2.4, hpOverride: 1945,
    card: 'SENTINEL OF THE LONG WATCH. Its lamps were never put out.', deathLine: '...the roads... are watched...',
    script: 'long_watch', abilities: [{ id: 'mob_lamp_sweep', cooldown: 10 }, { id: 'mob_order_given' }],
    fight: { odoChime: { every: 20, stun: 2, delaysSweep: true }, lamps: 2, adds: { at: 0.5, mob: 'tower_sentinel', level: 13, count: 2, walkIn: 6 } },
    loot: { junk: 'lamp_glass', table: [], gear: 'elite' } }),
};
for (const [id, m] of Object.entries(MOBS)) {
  m.id = id;
  m.sprite = MOB_SPRITES[id].sprite;
  m.spriteLq = MOB_SPRITES[id].lq;
  m.faction = 'hostile';
  m.school = 'physical';
  m.elite = !!m.elite;
  m.leash = m.leash || 640;
  m.xp = null;                                             // the level formula (PROGRESSION 2.1)
  const s = mobStats(id, m.level[0]);
  Object.assign(m, { hp: s.hp, damage: s.damage, attackSpeed: s.attackSpeed, armor: s.armor });
  m.loot.gold = s.gold;
  m.respawn = m.elite ? 360 : m.kind === 'weak' ? 60 : 90;
}

export const MOB_IDS = Object.keys(MOBS);

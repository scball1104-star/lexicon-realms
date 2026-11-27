// The Millrace's foes (cap 35 stage 1, foes and quests lane, 2026-11-27; docs/handoff/briefs/BRIEF_cap35_millrace.md
// section 4): levels 30 to 34, placed in packs of 2 or 3 on the zone's camp spots by tools/maps/zone_millrace.mjs
// (CAMP_FOES). The ids are plain (no zone prefix) so the Weir Works cave lane can reuse the families:
//
//   weir_rat        small wet beasts on the catwalks and in the shallows; they run when they are hurt
//   drowned_drover  spirit drovers still walking a road that is under water; mixed melee; humanoid, so they run at 15%
//                   and call their friends on the way, the same rule as the Ashen Crew (src/sim/ai.js fleeAt)
//   silt_hound      the second beast family, in the deeper flood, one or two to a pack
//   name_washer     casters who write on the water: a 2 s cast that hurts and slows you (interrupt it)
//   weir_count      the elite (level 34) at the broken dam: a tall counter with a tally, who calls rats at half
//
// Plus the mill board's two named foes (src/data/millrace_quests.js MR_BOARD): Old Gnaw and the Long Drover.
// Stats come from the one curve (src/data/mobs.js mobStats: health 835 + 58 x (L - 15) at kind normal, damage and kill
// XP the same live formulas), registered onto MOBS the way src/data/band20.js registers the 20 to 30 band. Looks reuse
// live atlases (2D) and retinted live creature-kit recipes (3D, src/render3d/creature_recipes.js); nothing new is drawn
// or downloaded. Every name and line is a DRAFT for Scott. No em dashes.
import { MOBS, MOB_SPRITES, MOB_ABILITIES as WORLD_MOB_ABILITIES, mobStats } from './mobs.js';
import './band20.js';     // the band's abilities (mob_shoulder_barge, mob_pounce) are on the world's mob abilities first

// ---------------------------------------------------------------- junk (sell to any vendor; value about the dropper's level)
const junk = (id, name, value) => Object.freeze({ id, name, rarity: 'common', kind: 'junk', slot: null, stack: 20, value, level: 1, reqLevel: 1, icon: 'slime_ink' });
export const MR_JUNK = {
  wet_rat_pelt: junk('wet_rat_pelt', 'Wet Rat Pelt', 32), sodden_halter: junk('sodden_halter', 'Sodden Halter', 33),
  silt_caked_fang: junk('silt_caked_fang', 'Silt-Caked Fang', 33), blotted_page: junk('blotted_page', 'Blotted Page', 34),
  cracked_tally: junk('cracked_tally', 'Cracked Tally', 36),
};

// ---------------------------------------------------------------- abilities (the live shapes, new names)
const A = WORLD_MOB_ABILITIES;
export const MR_MOB_ABILITIES = {
  // the name-washer's cast: 2 s, interruptible (no `uninterruptible`), a hit and a slow
  mob_wash_out: { ...A.mob_chilling_touch, id: 'mob_wash_out', name: 'Wash Out',
    effects: [{ type: 'damage', mobHit: 1.6, canCrit: false, school: 'shadow' }, { type: 'aura', aura: { id: 'washed_out', name: 'Washed Out', kind: 'debuff', duration: 5, flags: ['slow'], mods: [{ stat: 'speed', mul: 0.7 }] } }] },
  mob_rat_dart: { ...A.mob_wolf_lunge, id: 'mob_rat_dart', name: 'Dart' },
  mob_silt_lunge: { ...A.mob_wolf_lunge, id: 'mob_silt_lunge', name: 'Silt Lunge' },
  // the Weir-Count (every big hit shows its ground warning first, like the band's elites)
  mob_tally_sweep: { ...A.mob_reeve_sweep, id: 'mob_tally_sweep', name: 'Tally Sweep' },
  mob_floodwash: { ...A.mob_tally_rain, id: 'mob_floodwash', name: 'Floodwash' },
};
Object.assign(WORLD_MOB_ABILITIES, MR_MOB_ABILITIES);

// ---------------------------------------------------------------- foes
const T = (o) => o;
export const MR_MOBS = {
  weir_rat: T({ name: 'Weir-Rat', level: [30, 33], family: 'beast', kind: 'normal', traits: ['fast'], behavior: 'aggressive', aggroRadius: 72, speed: 74, wander: 2, flee: 0.2, social: true,
    abilities: [{ id: 'mob_rat_dart', chance: 1, cooldown: 9 }],
    loot: { junk: 'wet_rat_pelt', table: [{ item: 'mr_rat_tail', chance: 0.55, quest: 'bounty_mr_rat_tails' }] } }),
  drowned_drover: T({ name: 'Drowned Drover', level: [32, 34], family: 'humanoid', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 62, wander: 2,
    abilities: [{ id: 'mob_shoulder_barge' }], loot: { junk: 'sodden_halter', table: [] } }),
  silt_hound: T({ name: 'Silt-Hound', level: [32, 33], family: 'beast', kind: 'normal', traits: ['heavy'], behavior: 'aggressive', aggroRadius: 80, speed: 70, wander: 2, flee: null, social: true,
    abilities: [{ id: 'mob_silt_lunge', chance: 1, cooldown: 8 }],
    loot: { junk: 'silt_caked_fang', table: [{ item: 'mr_named_page', chance: 0.5, quest: 'mr_names_in_the_silt' }, { item: 'mr_hound_tooth', chance: 0.6, quest: 'bounty_mr_hound_teeth' }] } }),
  name_washer: T({ name: 'Name-Washer', level: [32, 34], family: 'spirit', kind: 'caster', behavior: 'aggressive', aggroRadius: 96, speed: 58, wander: 1, flee: null, flying: true,
    abilities: [{ id: 'mob_wash_out' }], loot: { junk: 'blotted_page', table: [{ item: 'mr_named_page', chance: 0.5, quest: 'mr_names_in_the_silt' }] } }),
  weir_count: T({ name: 'The Weir-Count', level: [34, 34], family: 'spirit', kind: ['elite', 'caster'], elite: true, behavior: 'elite', aggroRadius: 96, speed: 54, wander: 0, leash: 320, flee: null, attackSpeed: 2.4,
    card: 'THE WEIR-COUNT. It stands where the dam broke and counts the names going out on the water. It has never lost count.',
    deathLine: 'The tally drops from its hand. The water keeps running, but nobody is counting it now.',
    abilities: [{ id: 'mob_tally_sweep' }, { id: 'mob_floodwash' }],
    fight: { phases: [{ at: 0.5, yell: 'SHORT BY TWO. FETCH ME TWO.', summon: { mob: 'weir_rat', level: 33, count: 2 } }] },
    loot: { junk: 'cracked_tally', table: [{ item: 'mr_count_tally', chance: 1.0, quest: 'mr_who_broke_the_weir' }], gear: 'elite' } }),
  // ---- the mill board's named foes (one each, a fixed spot, the `tough` trait, like the other boards')
  mr_old_gnaw: T({ name: 'Old Gnaw', level: [32, 32], family: 'beast', kind: 'normal', traits: ['fast', 'tough'], behavior: 'aggressive', aggroRadius: 80, speed: 76, wander: 2, flee: null,
    abilities: [{ id: 'mob_rat_dart', chance: 1, cooldown: 7 }], loot: { junk: 'wet_rat_pelt', table: [] } }),
  mr_long_drover: T({ name: 'The Long Drover', level: [33, 33], family: 'humanoid', kind: 'normal', traits: ['heavy', 'tough'], behavior: 'aggressive', aggroRadius: 80, speed: 62, wander: 2, flee: null,
    abilities: [{ id: 'mob_shoulder_barge' }], loot: { junk: 'sodden_halter', table: [] } }),
};
// the open-world elite is soloable at its level with a plan (the band's knobs: src/data/band20.js BAND_TUNE)
const MR_TUNE = { weir_count: { hpMult: 0.55, dmgMult: 0.42 } };
// 2D: the closest live atlases (the 3D bodies are their own retinted recipes)
export const MR_MOB_SPRITES = {
  weir_rat: { sprite: 'moss_scarab', lq: 'moss_scarab' },
  drowned_drover: { sprite: 'dr_shade', lq: 'borrowed_shadow' },
  silt_hound: { sprite: 'mist_wolf', lq: 'mist_wolf' },
  name_washer: { sprite: 'page_wraith', lq: 'page_wraith' },
  weir_count: { sprite: 'sentinel_long_watch', lq: 'echo_warden' },
  mr_old_gnaw: { sprite: 'moss_scarab', lq: 'moss_scarab' },
  mr_long_drover: { sprite: 'dr_shade', lq: 'borrowed_shadow' },
};
// register the templates the way src/data/band20.js does (stats from the curve at the low level; the sim scales by spawn)
for (const [id, m] of Object.entries(MR_MOBS)) {
  MOB_SPRITES[id] = MR_MOB_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = MR_MOB_SPRITES[id].sprite; m.spriteLq = MR_MOB_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  m.elite = !!m.elite; m.leash = m.leash || 640;
  if (m.flee === undefined) m.flee = null;
  if (MR_TUNE[id]) Object.assign(m, MR_TUNE[id]);
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: st.damage, attackSpeed: st.attackSpeed, armor: st.armor });
  m.loot.gold = st.gold;
  m.respawn = m.elite ? 360 : m.kind === 'weak' ? 60 : 90;
}

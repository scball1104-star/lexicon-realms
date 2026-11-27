// The Weir Works (cap 35 stage 1, cave lane, 2026-11-27; docs/handoff/briefs/BRIEF_cap35_millrace.md section 4.1; Scott
// approved the brief's defaults the same day: Ferrick found hurt, not dead and not a villain, and back at the mill as the
// hamlet's face; the Wheel-Keeper as drafted, no legendary). Plain data plus applyWeirWorks(content), run in
// src/data/maps/index.js buildContent right after applyMillrace. The place itself is src/data/dungeons.js weir_works and
// tools/maps/zone_weir_works.mjs; the trash is the zone lane's weir-rats and drowned drovers (src/data/millrace_foes.js).
//
//   wheel_keeper        the boss, level 35: a construct bound to the great wheel. A slow smash on its target; a line
//                       sweep with a floor warning about every 10 s (its own red slot, src/sim/boss_mech.js), every 7 s
//                       under half health; at half it yells and two weir-rats drop from the race; frenzy at 300 s. A
//                       lone hero hit by the sweep takes a light hit (soloHit): it costs time, never a one-shot.
//   drops               four named magic pieces at ilvl 34 from the way in (8% from any foe in a Weir Works copy), six rares
//                       at ilvl 35 from the Keeper (src/sim/dloot.js picks one the killer can use), the chest, the daily chest
//   quests              #10 Down the Undershot (33) and #11 The Wheel Still Turns (35), XP by the zone's formula
//                       (millrace_quests.js mrQuestXp): 3,030 and 8,380, the 11,410 the zone lane left for the cave chain
//   Ferrick             hurt in the Wet Gallery (a cave npc, until #11 is handed in); then at the mill door, for good
//                       (content.storyNpcs: src/sim/quests.js spawns him once a hero in the world has handed in #11)
//
// Every name, card, yell and line here is a DRAFT for Scott: plain, short, original, no em or en dashes.
import { MOBS, MOB_SPRITES, MOB_ABILITIES as WORLD_MOB_ABILITIES, mobStats } from './mobs.js';
import './millrace_foes.js';     // the weir-rats and drowned drovers are on MOBS first
import { rewardGear, whereIn, questGold } from './band20.js';
import { makeGear } from './rares.js';
import { mrQuestXp } from './millrace_quests.js';

// ---------------------------------------------------------------- the boss's moves
export const WW_MOB_ABILITIES = {
  // a slow smash where its target stood: 2.2 s of warning on the ground
  mob_keeper_smash: { id: 'mob_keeper_smash', name: 'Spoke Smash', school: 'physical', castTime: 2.2, telegraph: 'circle', cooldown: 9, gcd: true, target: 'ground',
    range: { min: 0, max: 56 }, area: { shape: 'circle', radius: 36, at: 'ground' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.4, canCrit: false }] },
  // the wheel sweep: the red slot's line (src/data/boss_fights.js RED shape), from the Keeper toward its target
  bf_wheel_sweep: { id: 'bf_wheel_sweep', name: 'Wheel Sweep', school: 'physical', castTime: 1.8, telegraph: 'line', red: true, mobHit: 1.6,
    area: { shape: 'line', radius: 160, width: 24, at: 'self' } },
};
Object.assign(WORLD_MOB_ABILITIES, { mob_keeper_smash: WW_MOB_ABILITIES.mob_keeper_smash });

// ---------------------------------------------------------------- the Wheel-Keeper
export const KEEPER = Object.freeze({ level: 35, sweepEvery: 10, sweepFaster: 7, half: 0.5, frenzyAfter: 300, rats: 2, soloHit: 1.0 });
export const WW_MOBS = {
  wheel_keeper: { name: 'The Wheel-Keeper', level: [35, 35], family: 'construct', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 50, wander: 0,
    leash: 480, flee: null, attackSpeed: 2.8,
    card: 'THE WHEEL-KEEPER. It was set to count what the water washed off. It is still counting.',
    deathLine: 'The Keeper stops mid-count. Behind it, for the first time in years, the wheel slows.',
    abilities: [{ id: 'mob_keeper_smash' }],
    fight: {
      phases: [{ at: KEEPER.half, yell: 'TWO SHORT. THE RACE OWES ME TWO.', summon: { mob: 'weir_rat', level: 34, count: KEEPER.rats, from: 'adds_from' } }],
      frenzy: { after: KEEPER.frenzyAfter, yell: 'The wheel runs wild, and the Keeper runs with it.', mods: [{ stat: 'damageDone', mul: 1.4 }, { stat: 'attackSpeed', mul: 1.25 }] },
    },
    loot: { junk: 'cracked_tally', table: [], gear: 'elite' } },
};
// the cave boss like the other caves' (src/data/mobs.js BOSS_TUNE: Hollowfang, the Gaffer)
const WW_TUNE = { wheel_keeper: { hpMult: 0.7, dmgMult: 0.36 } };
export const WW_MOB_SPRITES = { wheel_keeper: { sprite: 'sentinel_long_watch', lq: 'echo_warden' } };
for (const [id, m] of Object.entries(WW_MOBS)) {
  MOB_SPRITES[id] = WW_MOB_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = WW_MOB_SPRITES[id].sprite; m.spriteLq = WW_MOB_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  Object.assign(m, WW_TUNE[id]);
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: st.damage, attackSpeed: st.attackSpeed, armor: st.armor });
  m.loot.gold = st.gold;
  m.respawn = 360;
}

/** The Keeper's fight on the live boss frame (src/data/boss_fights.js shape, merged by applyBossFights): one gate at half
 *  (the wheel runs fast), no teamwork mechanic, the sweep in the red slot. `faster` and `soloHit` are read by boss_mech.js. */
export const WW_FIGHTS = {
  wheel_keeper: { first: 'The Count', soloGuard: false,
    gates: [{ at: KEEPER.half, name: 'The Race Runs Fast' }],
    mechs: [],
    red: { id: 'bf_wheel_sweep', every: KEEPER.sweepEvery, faster: { below: KEEPER.half, every: KEEPER.sweepFaster }, soloHit: KEEPER.soloHit } },
};

// ---------------------------------------------------------------- items
export const WW_ITEMS = {};
const g = (id, name, slot, type, ilvl, stats = null, rarity = 'magic') => rewardGear(WW_ITEMS, id, name, slot, type, ilvl, stats, rarity);
// the Keeper's rares (src/data/dungeons.js weir_works.drops), ilvl 35
g('keepers_spoke_maul', "Keeper's Spoke Maul", 'main', 'sword', 35, null, 'rare'); g('race_iron_knives', 'Race-Iron Knives', 'main', 'dagger', 35, null, 'rare');
g('undershot_longbow', 'Undershot Longbow', 'two', 'bow', 35, null, 'rare'); g('sluice_gate_rod', 'Sluice-Gate Rod', 'main', ['rod', 'quill'], 35, null, 'rare');
g('wheelwrights_mantle', "Wheelwright's Mantle", 'chest', 'class', 35, null, 'rare'); g('drowned_tally_charm', 'Drowned Tally Charm', 'trinket', null, 35, null, 'rare');
// quest rewards
g('undershot_lamp_charm', 'Undershot Lamp Charm', 'trinket', null, 33);
g('millers_oath_mantle', "Miller's Oath Mantle", 'chest', 'class', 35); g('wheel_brake_gloves', 'Wheel-Brake Gloves', 'hands', 'class', 35);
g('counted_out_charm', 'Counted Out Charm', 'trinket', null, 35);
// named magic pieces from the way in: any foe in a Weir Works copy, 8%, fixed stats at ilvl 34 (src/sim/loot.js `zone`)
export const WW_NAMED_ROWS = [
  ['gallery_wader_boots', 'Gallery Wader Boots', 'feet', 'class', 34, { main: 6, sta: 6 }],
  ['sluice_iron_gloves', 'Sluice-Iron Gloves', 'hands', 'class', 34, { main: 6, sta: 6 }],
  ['undershot_hood', 'Undershot Hood', 'head', 'class', 34, { main: 7, sta: 6 }],
  ['wet_spoke_charm', 'Wet Spoke Charm', 'trinket', null, 34, { main: 6, sta: 6 }],
];
export const WW_NAMED_BAND = Object.freeze({ from: 33, to: 35, chance: 0.08, zone: 'weir_works', items: WW_NAMED_ROWS.map((r) => r[0]) });
for (const [id, name, slot, type, ilvl, stats] of WW_NAMED_ROWS) WW_ITEMS[id] = makeGear(id, name, slot, type, ilvl, 'magic', stats, { band: [WW_NAMED_BAND.from, WW_NAMED_BAND.to] });

// ---------------------------------------------------------------- Ferrick
const N = (o) => ({ faction: 'friendly', roles: [], vendor: null, trainer: null, innkeeper: false, ...o });
export const WW_NPCS = {
  mr_ferrick_hurt: N({ id: 'mr_ferrick_hurt', name: 'Ferrick', sprite: 'npc_smith', title: 'The Miller, hurt',
    talk: ['Mind the pool. It is deeper than the race and it does not give things back.', 'My leg went under a paddle. It will mend. The wheel will not stop on its own.'] }),
  mr_ferrick: N({ id: 'mr_ferrick', name: 'Ferrick', sprite: 'npc_smith', title: 'Miller of the Millrace',
    talk: ['I did not break the weir. I went down to stop the ones who did. They broke it on purpose, to wash the names off the ledgers before anybody read them.',
      'Every page that went out on the water had a name on it that somebody wanted gone. I chalked the race so I would remember which way they went.',
      'Listen. The wheel turns slow again. I can hear my own mill. I had forgotten the sound.'] }),
};
/** Npcs that stand in the world once a hero has handed in a quest (src/sim/quests.js ensureStoryNpcs). */
export const WW_STORY_NPCS = [{ npc: 'mr_ferrick', zone: 'millrace', x: 81, y: 44, dir: 'down', after: 'mr_wheel_still_turns' }];

// ---------------------------------------------------------------- quests (#10 and #11)
const DOOR_AT = whereIn('millrace')(77, 36, 3);      // the undercroft door (the Larch Mine's quests point at its mouth the same way)
function Q(o) {
  const { size, ...rest } = o;
  return { minLevel: Math.max(1, o.level - 1), zone: 'millrace', rewardRarity: 'magic', giveOnAccept: [], ...rest,
    rewards: { items: [], choice: [], ...o.rewards, xp: mrQuestXp(o.level, size), gold: questGold(o.level, size) } };
}
export const WW_QUESTS = {
  mr_down_the_undershot: Q({ id: 'mr_down_the_undershot', num: 410, name: 'Down the Undershot', level: 33, size: 0.3, giver: 'mr_clerk', turnIn: 'mr_ferrick_hurt', place: 'weir_works',
    requires: { quests: ['mr_ferricks_marks'], cls: null, level: 32 }, chain: { id: 'millrace', step: 10 },
    objectives: [{ kind: 'explore', zone: 'weir_works', area: 'ww_undershot', where: [DOOR_AT], label: 'Go down the undershot into the Weir Works' }],
    rewards: { choice: ['undershot_lamp_charm'] },
    text: {
      offer: "Ferrick's marks all end back here, at the undercroft door on the race side of the mill. He kept the Weir Works under the wheel, where the race runs in. Nobody has opened that door since the flood. Last night somebody knocked on it from the inside. Take a lamp and go down.",
      progress: 'The undercroft door, on the race side of the mill. Down the undershot. If he is there, find him.',
      complete: 'You came down. Nobody comes down. No, do not lift me, the leg is bad. Sit. Listen to me first.',
    } }),
  mr_wheel_still_turns: Q({ id: 'mr_wheel_still_turns', num: 411, name: 'The Wheel Still Turns', level: 35, size: 0.75, giver: 'mr_ferrick_hurt', turnIn: 'mr_clerk', place: 'weir_works',
    requires: { quests: ['mr_down_the_undershot', 'mr_who_broke_the_weir'], cls: null, level: 34 }, chain: { id: 'millrace', step: 11 },
    objectives: [
      { kind: 'kill', mob: 'drowned_drover', zone: 'weir_works', count: 4, where: [DOOR_AT], label: 'Drowned drovers cleared from the Wet Gallery' },
      { kind: 'kill', mob: 'wheel_keeper', count: 1, where: [DOOR_AT], label: 'The Wheel-Keeper stopped (the Weir Works)' },
    ],
    rewards: { choice: ['millers_oath_mantle', 'wheel_brake_gloves', 'counted_out_charm'] },
    text: {
      offer: 'The weir did not break. I watched them break it. Then the wheel started counting, and the Keeper with it. It was built to count the grain. Now it counts the names the water takes, and it will not stop. Clear the drovers out of this gallery so I can crawl out. Then stop the Keeper, past here. When the wheel turns it swings along a line. Watch the floor and step off the line.',
      progress: 'The chamber is north, past the pool. When the wheel turns, step off the line.',
      complete: 'Ferrick came up the race an hour ago, wet to the neck and cursing his leg. He is sitting by the mill door. He says you stopped the wheel. He says a great deal more than that. Go and hear him.',
    } }),
};
export const WW_QUEST_ORDER = Object.keys(WW_QUESTS);

/** content -> content with the Weir Works' boss, moves, items, quests, Ferrick and its drop band merged in. */
export function applyWeirWorks(C) {
  return {
    ...C,
    mobs: { ...C.mobs, ...WW_MOBS },
    mobAbilities: { ...C.mobAbilities, ...WW_MOB_ABILITIES },
    npcs: { ...C.npcs, ...WW_NPCS },
    items: { ...C.items, ...WW_ITEMS },
    quests: { ...C.quests, ...WW_QUESTS },
    sideQuests: [...(C.sideQuests || []), ...WW_QUEST_ORDER],
    dropRules: { ...C.dropRules, named: [...((C.dropRules && C.dropRules.named) || []), WW_NAMED_BAND] },
    storyNpcs: [...(C.storyNpcs || []), ...WW_STORY_NPCS],
    bossFights: { ...(C.bossFights || {}), ...WW_FIGHTS },
  };
}

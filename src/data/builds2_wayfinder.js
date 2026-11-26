// Builds 2, the Wayfinder (docs/design/BUILDS_2.md 4.4; the Snare fork chip "Traps vs Shots" and the named builds stated
// in full from BUILDS_2_PLAY 1.3 and 1.4). Plain data. Numbers are the design numbers unless a line says "tuned"
// (qa/sim/builds2.mjs is the gate).
import { ranks, pct, lv, mod, abl, rep, dmgUp, MELEE, nodeMaker, pathMaker } from './builds2_kit.js';

const N = nodeMaker('wayfinder');
const P = pathMaker('wayfinder');
const R9 = { min: 0, max: 144 };
// every arrow: the shots, the volley and Auto Shot ('auto')
export const WAYFINDER_SHOTS = ['wayfinder_quick_shot', 'wayfinder_pinning_shot', 'wayfinder_aimed_shot', 'wayfinder_volley', 'wayfinder_hush_arrow', 'wayfinder_scatter_shot', 'auto'];
const SHOTS = WAYFINDER_SHOTS;

export const WAYFINDER_ABILITIES = {
  // level 6 pick: Attack boost vs Defense boost
  wayfinder_hunters_mark: {
    id: 'wayfinder_hunters_mark', name: "Hunter's Mark", icon: 'icon_sigil', cls: 'wayfinder', learnLevel: 6, school: 'physical',
    cost: { kind: 'focus', amount: 10 }, castTime: 0, cooldown: 15, gcd: true, range: { min: 0, max: 160 }, target: 'enemy', threatMult: 1,
    effects: [{ type: 'aura', key: 'mark', aura: { id: 'wayfinder_hunters_mark', name: "Hunter's Mark", icon: 'icon_sigil', kind: 'debuff', duration: 15, mods: [{ stat: 'damageTaken', mul: 1.1 }] } }],
    text: 'Mark a foe: it takes 10% more damage from everyone for 15 s.',
  },
  wayfinder_sand_cloak: {
    id: 'wayfinder_sand_cloak', name: 'Sand Cloak', icon: 'icon_mantle', cls: 'wayfinder', learnLevel: 6, school: 'physical',
    cost: { kind: 'focus', amount: 15 }, castTime: 0, cooldown: 30, gcd: false, range: null, target: 'self', threatMult: 0,
    effects: [{ type: 'aura', key: 'cloak', to: 'self', aura: { id: 'wayfinder_sand_cloak', name: 'Sand Cloak', icon: 'icon_mantle', kind: 'buff', duration: 8, mods: [{ stat: 'dodge', add: 0.25 }] } }],
    text: 'Wrap yourself in blowing sand: 25% of hits miss you for 8 s.',
  },
  // level 14 pick: Duel casters vs Push a pack
  wayfinder_hush_arrow: {
    id: 'wayfinder_hush_arrow', name: 'Hush Arrow', icon: 'icon_silence', cls: 'wayfinder', learnLevel: 14, school: 'physical',
    cost: { kind: 'focus', amount: 15 }, castTime: 0, cooldown: 12, gcd: false, range: R9, target: 'enemy', threatMult: 1, requires: { weapon: 'bow' }, projectile: { speed: 600 },
    effects: [
      { type: 'damage', key: 'hit', weapon: 0.3, amount: lv(2, 1), school: 'physical', canCrit: true },
      { type: 'interrupt', key: 'cut', lockout: 3 },
      { type: 'aura', key: 'hush', aura: { id: 'wayfinder_hushed', name: 'Hushed', icon: 'icon_silence', kind: 'debuff', duration: 2, flags: ['silence'] } },
    ],
    text: 'A whistling arrow for {dmg}: it breaks a cast and silences the foe 2 s.',
  },
  wayfinder_scatter_shot: {
    id: 'wayfinder_scatter_shot', name: 'Scatter Shot', icon: 'icon_bow', cls: 'wayfinder', learnLevel: 14, school: 'physical',
    cost: { kind: 'focus', amount: 25 }, castTime: 0, cooldown: 15, gcd: true, range: null, target: 'none', threatMult: 1, requires: { weapon: 'bow' },
    area: { shape: 'cone', radius: 64, angle: 90, at: 'self', maxTargets: 3 },
    effects: [
      { type: 'damage', key: 'hit', to: 'enemies', weapon: 0.5, amount: lv(3, 1.5), school: 'physical', canCrit: true },
      { type: 'move', key: 'push', to: 'enemies', kind: 'knockback', distance: 48, time: 0.25 },
    ],
    text: 'A spray of arrows in a 4-tile cone: up to 3 foes take {dmg} and are knocked 3 tiles back.',
  },
  // +skill nodes: Field Dressing (Trailcraft tier 1), Kick (Close Quarters tier 2)
  wayfinder_field_dressing: {
    id: 'wayfinder_field_dressing', name: 'Field Dressing', icon: 'icon_regen', cls: 'wayfinder', learnLevel: 1, school: 'nature',
    cost: { kind: 'focus', amount: 10 }, castTime: 0, cooldown: 30, gcd: true, range: null, target: 'self', threatMult: 0,
    effects: [{ type: 'aura', key: 'hot', to: 'self', aura: { id: 'wayfinder_field_dressing', name: 'Field Dressing', icon: 'icon_regen', kind: 'buff', duration: 6, period: 2,
      tick: [{ type: 'heal', to: 'holder', pctMaxHp: pct(0.2 / 3), canCrit: false, ability: 'wayfinder_field_dressing' }] } }],
    text: 'Bind your wounds: heal 20% of your max health over 6 s.',
  },
  wayfinder_kick: {
    id: 'wayfinder_kick', name: 'Kick', icon: 'icon_flee', cls: 'wayfinder', learnLevel: 1, school: 'physical',
    cost: null, castTime: 0, cooldown: 10, gcd: false, range: MELEE, target: 'enemy', threatMult: 1,
    effects: [{ type: 'move', key: 'kick', kind: 'knockback', distance: 48, time: 0.25 }],
    text: 'Kick a foe 3 tiles back. It breaks its cast.',
  },
  // ---- signatures
  wayfinder_sand_kestrel: {
    id: 'wayfinder_sand_kestrel', name: 'Sand Kestrel', icon: 'icon_feather', cls: 'wayfinder', learnLevel: 10, school: 'physical',
    cost: null, castTime: 0, cooldown: 1, gcd: true, range: null, target: 'none', threatMult: 0,
    effects: [{ type: 'summon', key: 'bird', object: { id: 'wayfinder_kestrel', name: 'Sand Kestrel', sprite: 'ink_double', at: 'self', armTime: 0, duration: 600, max: 1,
      // tuned 2026-11-19 (qa/sim/builds2.mjs spread): it strikes every 2 s (BUILDS_2 4.4: 1.5 s)
      pet: { period: 2, range: 144, speed: 160, fly: true, interrupt: { every: 10, lockout: 2 }, effects: [{ type: 'damage', amount: lv(3, 1.4), school: 'physical' }] } } }],
    text: 'Call a falcon. It hits your target for {dmg} every 2 s and breaks a cast once per 10 s. Use it again while the falcon is out: Dive, a 1 s stun (15 s).',
  },
  wayfinder_grapple_line: {
    id: 'wayfinder_grapple_line', name: 'Grapple Line', icon: 'icon_spear', cls: 'wayfinder', learnLevel: 10, school: 'physical',
    cost: { kind: 'focus', amount: 10 }, castTime: 0, cooldown: 14, gcd: true, range: { min: 0, max: 192 }, target: 'enemy', threatMult: 1,
    effects: [{ type: 'script', key: 'line', name: 'b2_grapple' }],
    text: 'Fire a line at a foe within 12 tiles: a small foe is pulled to you; anything bigger pulls you to it.',
  },
  wayfinder_storm_quiver: {
    id: 'wayfinder_storm_quiver', name: 'Storm Quiver', icon: 'icon_thunder', cls: 'wayfinder', learnLevel: 10, school: 'nature',
    cost: null, castTime: 0, cooldown: 2, gcd: false, range: null, target: 'self', threatMult: 0, toggle: true,
    effects: [{ type: 'aura', key: 'storm', to: 'self', aura: { id: 'wayfinder_storm_quiver', name: 'Storm Quiver', icon: 'icon_thunder', kind: 'buff', duration: null,
      mods: [{ stat: 'stormShots', add: 1, ability: SHOTS }, { stat: 'cleave', add: 1, ability: SHOTS }, { stat: 'cleavePct', add: 0.5 }, { stat: 'cleaveRange', add: 48 },
        { stat: 'arcShots', add: 1, ability: SHOTS }, { stat: 'cost', add: 5, ability: SHOTS }] } }],
    // redesign 2026-11-26 (Scott approved): the rule it breaks is line of sight. Arrows arc over walls, trees and cover like
    // lightning out of a cloud, so a Wayfinder can shoot from behind a wall or over a ridge (src/sim/combat.js arcShots)
    // Not in a boss fight: while a boss nearby is in combat the arrows need sight again (src/sim/combat.js bossFightNear)
    text: 'Toggle: your arrows fall from the sky as storm. They need no line of sight, arcing over walls and cover (not during a boss fight); each is storm damage (past armor) and jumps to one more foe within 3 tiles for 50%. Each shot costs 5 more Focus.',
  },
};

// Track names are BUILDS_2 4.4's, shortened where the 98 px column needs it (qa/tests/talents2.test.mjs): Windrunner -> Windstep,
// Running Fire -> On the Run, Close Quarters -> Close Fight
export const WAYFINDER_TRACKS = [
  { id: 'longshot', name: 'Longshot', kind: 'strength', trait: 'S1', purpose: 'Strength: the longest reach', axis: 'One target vs Volley', chip: 'One vs Volley' },
  { id: 'windrunner', name: 'Windstep', kind: 'strength', trait: 'S2', purpose: 'Strength: the fastest feet', axis: 'Escape vs Blind', chip: 'Leap vs Dust' },
  // BUILDS_2_PLAY 1.3 retag: this fork is the traps vs shots axis
  { id: 'snare', name: 'Snare', kind: 'strength', trait: 'S3', purpose: 'Strength: runs down the fast', axis: 'Traps vs Shots', chip: 'Traps vs Shots' },
  { id: 'running', name: 'On the Run', kind: 'weakness', trait: 'W1', purpose: 'Patches: must stand to shoot', axis: 'Moving vs Still for power', chip: 'Move vs Still' },
  { id: 'trailcraft', name: 'Trailcraft', kind: 'weakness', trait: 'W2', purpose: 'Patches: no healing', axis: 'With friends vs Alone', chip: 'Group vs Self' },
  { id: 'close', name: 'Close Fight', kind: 'weakness', trait: 'W3', purpose: 'Patches: loses close duels', axis: 'Physical vs Elemental arrows', chip: 'Spear vs Storm' },
];

const WAYFINDER_NODES = [
  // ---- Longshot (S1: reach)
  N('longshot', 1, 'steady_draw', 'Steady Draw', 5, 'wayfinder_fletch_true_aim', 'Aimed Shot damage +{r*3}%.', ranks(5, (r) => ({ mods: [dmgUp(0.03 * r, { ability: 'wayfinder_aimed_shot' })] }))),
  N('longshot', 2, 'far_sight', 'Far Sight', 5, 'wayfinder_fletch_long_eye', 'Range +{r*0.4} tile.', ranks(5, (r) => ({ mods: [mod('range', { add: pct(6.4 * r) })] }))),
  N('longshot', 3, 'heartseeker', 'Heartseeker', 1, 'wayfinder_fletch_called_shot', 'Aimed Shot +30%; Volley -20%.',
    [{ mods: [dmgUp(0.3, { ability: 'wayfinder_aimed_shot' }), dmgUp(-0.2, { ability: 'wayfinder_volley' })] }], { fork: 'a' }),
  N('longshot', 3, 'rain_of_arrows', 'Rain of Arrows', 1, 'wayfinder_fletch_thread_the_needle', 'Volley covers 3.5 tiles and rains one more wave.',
    [{ modAbility: [abl('wayfinder_volley', 'area.radius', { set: 56 }), abl('wayfinder_volley', 'channel.ticks', { set: 4 }), abl('wayfinder_volley', 'channel.duration', { set: 4 })] }], { fork: 'b' }),
  N('longshot', 4, 'lethal_distance', 'Lethal Distance', 5, 'wayfinder_fletch_long_road_shot', 'Shots from 8 tiles or more deal {r*3}% more.',
    ranks(5, (r) => ({ mods: [dmgUp(0.03 * r, { ability: SHOTS, when: { targetBeyond: 128 } })] }))),
  N('longshot', 5, 'horizon', 'Horizon', 1, 'wayfinder_fletch_piercing_point', 'Aimed Shot reaches 16 tiles and pierces every foe in a line. It takes 2.5 s to draw.',
    [{ modAbility: [abl('wayfinder_aimed_shot', 'range.max', { set: 256 }), abl('wayfinder_aimed_shot', 'castTime', { set: 2.5 })],
      procs: [{ on: 'hit', ability: 'wayfinder_aimed_shot', effects: [{ type: 'damage', to: 'enemies_in_line', length: 256, width: 16, pctOfDamage: 1, school: 'physical', canCrit: false, ability: 'b2_horizon' }] }] }], { keystone: true }),

  // ---- Windrunner (S2: speed)
  N('windrunner', 1, 'light_step', 'Light Step', 5, 'wayfinder_roadwise_footsure', 'Move speed +{r*1.5}%.', ranks(5, (r) => ({ mods: [mod('speed', { mul: pct(1 + 0.015 * r) })] }))),
  N('windrunner', 2, 'spring', 'Spring', 5, 'wayfinder_roadwise_road_wit', 'Light Foot cooldown -{r*1.5} s.', ranks(5, (r) => ({ modAbility: [abl('wayfinder_light_foot', 'cooldown', { add: pct(-1.5 * r) })] }))),
  N('windrunner', 3, 'free_leap', 'Free Leap', 1, 'wayfinder_roadwise_mile_eater', 'Light Foot leaps the way you are moving, not only back.',
    [{ modAbility: [abl('wayfinder_light_foot', 'effects.#leap.dir', { set: 'moving' })] }], { fork: 'a' }),
  N('windrunner', 3, 'dust_kick', 'Dust Kick', 1, 'wayfinder_roadwise_long_way_round', 'Light Foot leaves a dust cloud for 3 s: foes in it deal 30% less.',
    [{ modAbility: [abl('wayfinder_light_foot', 'effects', { push: { type: 'summon', key: 'dust', object: { id: 'wayfinder_dust_cloud', name: 'Dust', sprite: 'zone_peal', at: 'self', armTime: 0, duration: 3, max: 1, radius: 32,
      inside: [{ type: 'aura', aura: { id: 'wayfinder_dusted', name: 'Dust', icon: 'icon_blind', kind: 'debuff', duration: 0.25, mods: [{ stat: 'damageDone', mul: 0.7 }] } }] } } })] }], { fork: 'b' }),
  N('windrunner', 4, 'sand_rush', 'Sand Rush', 5, 'wayfinder_roadwise_steady_feet', 'After Light Foot, your next 2 shots deal {r*5}% more.',
    ranks(5, (r) => ({ modAbility: [abl('wayfinder_light_foot', 'effects', { push: { type: 'aura', key: 'rush', to: 'self', aura: { id: 'b2_sand_rush', name: 'Sand Rush', icon: 'icon_haste', kind: 'buff', duration: 8,
      hitCharges: 2, hitAbility: SHOTS, mods: [{ stat: 'damageDone', mul: pct(1 + 0.05 * r), ability: SHOTS }] } } })] }))),
  N('windrunner', 5, 'mirage', 'Mirage', 1, 'wayfinder_roadwise_unseen_road', 'Light Foot leaves a decoy that holds every foe\'s eye for 4 s. It costs 10 more Focus.',
    [{ mods: [mod('cost', { add: 10 }, { ability: 'wayfinder_light_foot' })],
      modAbility: [abl('wayfinder_light_foot', 'effects', { push: { type: 'summon', key: 'decoy', object: { id: 'wayfinder_mirage', name: 'Mirage', sprite: 'ink_double', at: 'self', armTime: 0, duration: 4, max: 1, holdThreat: true } } })] }],
    { keystone: true }),

  // ---- Snare (S3: the hunt)
  N('snare', 1, 'long_bramble', 'Long Bramble', 5, 'wayfinder_snare_long_bramble', 'Your roots and slows last {r*6}% longer.', ranks(5, (r) => ({ mods: [mod('snareDuration', { mul: pct(1 + 0.06 * r) })] }))),
  N('snare', 2, 'barbs', 'Barbs', 5, 'wayfinder_snare_thornbite', 'Briar Trap damage +{r*6}%.', ranks(5, (r) => ({ mods: [dmgUp(0.06 * r, { ability: 'wayfinder_briar_trap' })] }))),
  N('snare', 3, 'run_to_ground', 'Run to Ground', 1, 'wayfinder_snare_pinning_point', 'Rooted or slowed foes take 15% more from you.',
    [{ mods: [dmgUp(0.15, { when: { targetSnared: true } })] }], { fork: 'a' }),
  N('snare', 3, 'thorn_garden', 'Thorn Garden', 1, 'wayfinder_snare_bramble_patch', 'Lay two Briar Traps at once (2 charges). Trap damage -20%.',
    [{ modAbility: [abl('wayfinder_briar_trap', 'effects.#trap.object.max', { set: 2 }), abl('wayfinder_briar_trap', 'charges', { set: 2 })],
      mods: [dmgUp(-0.2, { ability: 'wayfinder_briar_trap' })] }], { fork: 'b' }),
  N('snare', 4, 'quick_set', 'Quick Set', 5, 'wayfinder_snare_quick_set', 'Briar Trap arms {r*0.15} s faster and its cooldown is {r*1} s shorter.',
    ranks(5, (r) => ({ modAbility: [abl('wayfinder_briar_trap', 'effects.#trap.object.armTime', { add: pct(-0.15 * r) }), abl('wayfinder_briar_trap', 'cooldown', { add: -r })] }))),
  N('snare', 5, 'hunters_ground', "Hunter's Ground", 1, 'wayfinder_snare_hedge_wall', 'Briar Trap is thrown up to 8 tiles and re-arms once after it bursts. Its cooldown is 5 s longer.',
    [{ modAbility: [abl('wayfinder_briar_trap', 'target', { set: 'ground' }), abl('wayfinder_briar_trap', 'range', { set: { min: 0, max: 128 } }),
      abl('wayfinder_briar_trap', 'effects.#trap.object.at', { set: 'ground' }), abl('wayfinder_briar_trap', 'effects.#trap.object.rearm', { set: 1 }), abl('wayfinder_briar_trap', 'cooldown', { add: 5 })] }],
    { keystone: true }),

  // ---- Running Fire (W1: shoot on the move)
  N('running', 1, 'loose', 'Loose', 5, 'wayfinder_fletch_fletchers_pace', 'Quick Shot costs {r*2} less Focus.', ranks(5, (r) => ({ mods: [mod('cost', { add: -2 * r }, { ability: 'wayfinder_quick_shot' })] }))),
  N('running', 2, 'snap_shot', 'Snap Shot', 5, 'wayfinder_fletch_draw_weight', 'When you stop, your first Auto Shot comes {r*0.1} s sooner.', ranks(5, (r) => ({ mods: [mod('snapShot', { add: pct(0.1 * r) })] }))),
  N('running', 3, 'skirmisher', 'Skirmisher', 1, 'wayfinder_fletch_running_shot', 'Auto Shot fires while you move, at 60% damage.', [{ mods: [mod('moveShot', { add: 0.6 })] }], { fork: 'a' }),
  N('running', 3, 'anchored', 'Anchored', 1, 'wayfinder_fletch_steady_breath', 'Stand still 2 s: damage +15%.', [{ mods: [dmgUp(0.15, { when: { still: 2 } })] }], { fork: 'b' }),
  N('running', 4, 'agile_fingers', 'Agile Fingers', 5, 'wayfinder_roadwise_second_breath', 'Focus regen +{r*0.4} a second.', ranks(5, (r) => ({ mods: [mod('focusRegen', { add: pct(0.4 * r) })] }))),
  N('running', 5, 'dancing_bow', 'Dancing Bow', 1, 'wayfinder_fletch_double_nock', 'Auto Shot fires at full damage while you move, and every 3rd instant shot is free. Armor -15%.',
    [{ script: 'b2_dancing_bow', mods: [mod('moveShot', { add: 1 }), mod('armor', { mul: 0.85 })] }], { keystone: true }),

  // ---- Trailcraft (W2: no healing)
  N('trailcraft', 1, 'field_dressing', 'Field Dressing', 5, 'wayfinder_roadwise_field_dressing', 'New skill, Field Dressing: heal 20% over 6 s (30 s). Each rank after the first adds 4% to it.',
    ranks(5, (r) => ({ grant: 'wayfinder_field_dressing', modAbility: r > 1 ? [abl('wayfinder_field_dressing', 'effects.#hot.aura.tick.0.pctMaxHp', { set: pct((0.2 + 0.04 * (r - 1)) / 3) })] : [] }))),
  N('trailcraft', 2, 'forager', 'Forager', 5, 'wayfinder_roadwise_weathered', 'A kill heals you {r*0.6}% of your max health.',
    ranks(5, (r) => ({ procs: [{ on: 'kill', effects: [{ type: 'heal', to: 'self', pctMaxHp: pct(0.006 * r), canCrit: false, noThreat: true, ability: 'b2_forager' }] }] }))),
  N('trailcraft', 3, 'herbal_smoke', 'Herbal Smoke', 1, 'wayfinder_roadwise_path_sense', 'Field Dressing also heals friends within 4 tiles.',
    [{ modAbility: [abl('wayfinder_field_dressing', 'effects', { push: { type: 'aura', key: 'smoke', to: 'allies_near', radius: 64, aura: { id: 'wayfinder_herbal_smoke', name: 'Herbal Smoke', icon: 'icon_regen', kind: 'buff', duration: 6, period: 2,
      tick: [{ type: 'heal', to: 'holder', pctMaxHp: pct(0.2 / 3), canCrit: false }] } } })] }], { fork: 'a' }),
  N('trailcraft', 3, 'hardy', 'Hardy', 1, 'wayfinder_roadwise_close_quarters', 'Field Dressing heals 20% more.', [{ mods: [mod('healingDone', { mul: 1.2 }, { ability: 'wayfinder_field_dressing' })] }], { fork: 'b' }),
  N('trailcraft', 4, 'thick_hide', 'Thick Hide', 5, 'wayfinder_snare_hardened_briar', 'Armor +{r*4}%.', ranks(5, (r) => ({ mods: [mod('armor', { mul: pct(1 + 0.04 * r) })] }))),
  N('trailcraft', 5, 'living_off_the_land', 'Living off the Land', 1, 'wayfinder_snare_clinging_thorns', 'Every kill heals you 8% and resets Light Foot. Healing from every other source -30%.',
    [{ mods: [mod('healingTaken', { mul: 0.7 }, { notAbility: 'b2_living_off_land' })],
      procs: [{ on: 'kill', effects: [{ type: 'heal', to: 'self', pctMaxHp: 0.08, canCrit: false, noThreat: true, ability: 'b2_living_off_land' },
        { type: 'cooldown', to: 'self', ability: 'wayfinder_light_foot', reset: true }] }] }], { keystone: true }),

  // ---- Close Quarters (W3: duels)
  N('close', 1, 'point_blank', 'Point Blank', 5, 'wayfinder_snare_trap_line', 'Lifts the close-range cut, then +{r*4}% damage within 3 tiles.',
    ranks(5, (r) => ({ script: 'b2_point_blank', mods: [dmgUp(0.04 * r, { when: { targetWithin: 48 } })] }))),
  N('close', 2, 'kick', 'Kick', 5, 'wayfinder_snare_thrown_snare', 'New skill, Kick: knock a foe 3 tiles back (10 s). Cooldown {r*1} s shorter after the first rank.',
    ranks(5, (r) => ({ grant: 'wayfinder_kick', modAbility: r > 1 ? [abl('wayfinder_kick', 'cooldown', { add: -(r - 1) })] : [] }))),
  N('close', 3, 'hunting_spear', 'Hunting Spear', 1, 'wayfinder_snare_snarecraft', 'Within 2 tiles, Quick Shot is a spear thrust: it hits 2 foes for 30% more.',
    [{ script: 'b2_hunting_spear' }], { fork: 'a' }),
  N('close', 3, 'storm_arrows', 'Storm Arrows', 1, 'wayfinder_fletch_piercing_point', 'Your shots are storm damage and pass armor. Auto Shot -10%.',
    [{ mods: [mod('stormShots', { add: 1 }, { ability: SHOTS }), dmgUp(-0.1, { ability: 'auto' })] }], { fork: 'b' }),
  N('close', 4, 'duelists_eye', "Duelist's Eye", 5, 'wayfinder_fletch_called_shot', 'Damage +{r*3}% to casters, and their spells deal {r*3}% less to you.',
    ranks(5, (r) => ({ mods: [dmgUp(0.03 * r, { when: { targetTrait: 'caster' } }), mod('damageTaken', { mul: pct(1 - 0.03 * r) }, { when: { attackerTrait: 'caster' } })] }))),
  N('close', 5, 'kick_and_shoot', 'Kick and Shoot', 1, 'wayfinder_roadwise_steady_feet', 'When a foe reaches you, your next Quick Shot knocks it 4 tiles back and slows it 50% (once per 8 s). Range -1 tile.',
    [{ script: 'b2_kick_and_shoot', mods: [mod('range', { add: -16 })],
      procs: [{ on: 'hit', ability: 'wayfinder_quick_shot', when: { selfAura: 'b2_kick_ready' }, effects: [{ type: 'move', to: 'target', kind: 'knockback', distance: 64, time: 0.3 },
        { type: 'aura', to: 'target', aura: { id: 'b2_kicked', name: 'Kicked', icon: 'icon_flee', kind: 'debuff', duration: 3, flags: ['slow'], mods: [{ stat: 'slow', add: 0.5 }] } }] }] }], { keystone: true }),
];

export const WAYFINDER_SIGNATURES = [
  { id: 'wayfinder_sand_kestrel', name: 'Sand Kestrel', icon: 'icon_feather', ready: true, text: 'A falcon partner: it hits your target and breaks casts. Call it again to Dive.' },
  { id: 'wayfinder_grapple_line', name: 'Grapple Line', icon: 'icon_spear', ready: true, text: 'Fire a line: pull a small foe to you, or yourself to a big one. Grapple points come later.' },
  { id: 'wayfinder_storm_quiver', name: 'Storm Quiver', icon: 'icon_thunder', ready: true, text: 'Toggle: arrows arc over walls (no line of sight, except in boss fights), fall as storm and jump to one more foe.' },
];

export const WAYFINDER_BUILDS = [
  { id: 'falconer', name: 'Falconer', line: 'The bird and the briars hold them while she walks and shoots.', tracks: ['snare', 'trailcraft', 'running'], answers: { caster: 10 },
    // Herbal Smoke (its second fork, a party heal) comes after level 15; the last points go on Barbs
    forks: ['thorn_garden', 'herbal_smoke'], keystone: 'hunters_ground', signature: 'wayfinder_sand_kestrel', signatures: ['wayfinder_sand_kestrel', 'wayfinder_grapple_line', 'wayfinder_storm_quiver'],
    picks: { 1: 'wayfinder_briar_trap', 3: 'wayfinder_aimed_shot', 6: 'wayfinder_hunters_mark', 14: 'wayfinder_hush_arrow' },
    path: [...rep(P('trailcraft', 'field_dressing'), 2), ...rep(P('snare', 'long_bramble'), 3), ...rep(P('snare', 'barbs'), 2), P('snare', 'thorn_garden'), ...rep(P('snare', 'quick_set'), 2),
      P('snare', 'hunters_ground'), ...rep(P('snare', 'barbs'), 3), P('running', 'loose')] },
  { id: 'stormcaller', name: 'Stormcaller', line: 'Chain lightning arrows and big volleys: the pack clearer.', tracks: ['longshot', 'close', 'running'],
    forks: ['rain_of_arrows', 'storm_arrows', 'skirmisher'], keystone: 'horizon', signature: 'wayfinder_storm_quiver', signatures: ['wayfinder_storm_quiver', 'wayfinder_sand_kestrel', 'wayfinder_grapple_line'],
    picks: { 1: 'wayfinder_briar_trap', 3: 'wayfinder_volley', 6: 'wayfinder_hunters_mark', 14: 'wayfinder_scatter_shot' },
    // Steady Draw and Horizon are Aimed Shot nodes, so at 6 the build buys Aimed Shot back at the trainer (the level 3 pick it skipped)
    buy: { 6: 'wayfinder_aimed_shot' },
    path: [...rep(P('longshot', 'steady_draw'), 3), ...rep(P('longshot', 'far_sight'), 2), P('longshot', 'rain_of_arrows'), ...rep(P('longshot', 'lethal_distance'), 2), P('close', 'point_blank'),
      P('longshot', 'horizon'), P('close', 'point_blank'), ...rep(P('running', 'loose'), 3), P('longshot', 'lethal_distance')] },
  { id: 'grapple_skirmisher', name: 'Grapple Skirmisher', line: 'Yank in, spear, kick out, shoot: she never stands still.', tracks: ['close', 'windrunner', 'running'], answers: { caster: 1 },
    // Hunting Spear (its second fork at 20) is left past the 15-point path: with it this build killed in 8 s at 15, 1.7x the others
    forks: ['skirmisher', 'hunting_spear'], keystone: 'dancing_bow', signature: 'wayfinder_grapple_line', signatures: ['wayfinder_grapple_line', 'wayfinder_sand_kestrel', 'wayfinder_storm_quiver'],
    // tuned 2026-11-19 (qa/sim/builds2.mjs spread): level 3 pick Volley, not Aimed Shot (BUILDS_2_PLAY 1.4); Aimed Shot's 2 s
    // stand is the opposite of a build that never stands still, and with it this build killed 1.5x faster than the other two
    picks: { 1: 'wayfinder_light_foot', 3: 'wayfinder_volley', 6: 'wayfinder_sand_cloak', 14: 'wayfinder_scatter_shot' },
    path: [...rep(P('windrunner', 'light_step'), 2), ...rep(P('running', 'loose'), 2), P('windrunner', 'spring'), P('running', 'loose'), ...rep(P('running', 'snap_shot'), 2), P('running', 'skirmisher'),
      ...rep(P('close', 'point_blank'), 2), ...rep(P('running', 'agile_fingers'), 2), P('running', 'dancing_bow'), P('close', 'kick')] },
];

// Cap 20 (phase 5, BUILDS_2 5.4): five more points per build for levels 16 to 20, on the build's own tracks (ranks the
// first 15 points left unfilled; no new forks, keystones or skills). qa/sim/builds2.mjs gates every level to 20.
const PAST_15 = {
  falconer: [...rep(P('snare', 'long_bramble'), 2), P('running', 'loose'), P('running', 'snap_shot'), P('trailcraft', 'field_dressing')],   // Quick Set 3 and 4 slowed it to 15 s at 19
  stormcaller: [...rep(P('longshot', 'steady_draw'), 2), ...rep(P('longshot', 'far_sight'), 2), P('longshot', 'lethal_distance')],
  grapple_skirmisher: [...rep(P('running', 'agile_fingers'), 2), ...rep(P('running', 'snap_shot'), 2), P('running', 'loose')],
};
for (const b of WAYFINDER_BUILDS) b.path.push(...PAST_15[b.id]);

export const WAYFINDER = {
  tracks: WAYFINDER_TRACKS,
  nodes: Object.fromEntries(WAYFINDER_NODES.map((n) => [n.id, n])),
  signatures: WAYFINDER_SIGNATURES,
  signatureAxis: 'Partner vs Line vs Storm',
  builds: WAYFINDER_BUILDS,
  defaultBuild: 'falconer',
  // BUILDS_2 4.4 baseline rules new in Builds 2: S2 move speed +5%; W3 shots within 2 tiles deal 20% less (Point Blank lifts it).
  // Tuned 2026-11-19 (qa/sim/builds2.mjs): every shot -10%. Builds 2 gives her Briar Trap at 1 and Aimed Shot at 3 (they were 3
  // and 10), and one plain foe fell in 8 s at level 5, under the 9 s floor
  baseline: { mods: [{ stat: 'speed', mul: 1.05 }, { stat: 'damageDone', mul: 0.8, ability: SHOTS, when: { targetWithin: 32, noScript: 'b2_point_blank' } },
    { stat: 'damageDone', mul: 0.9 }] },
};

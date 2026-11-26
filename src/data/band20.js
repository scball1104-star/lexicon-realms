// The 20 to 30 band (band lane, 2026-11-22; D:/LQOnline/world3/BRIEF.md sections 2 and 4, docs/design/BUILDS_2.md 5.5):
// the foes of Larchhill (20 to 25), the Larch Mine (21 to 23) and Drovers' Reach (25 to 30), their abilities, the band's
// loot tiers, and the helpers the two zone files (src/data/larchhill.js, src/data/drovers_reach.js) share: quest XP by
// level, quest and reward builders, and a rare's template. Plain data, merged into the content by src/data/maps/index.js.
//
// Families: beasts (lynx, bears, wild drove oxen, the gang's hounds, carrion kites), insects (hornets, tunnel grubs),
// humanoids (the list-writer's grey couriers and their hired cudgels, the Drovers' chain gang: gangers, warders,
// tallymen; humanoids run at 15% health and call friends, src/sim/ai.js), spirits (the drowned shift, the drover shades).
// Stats come from the one curve (src/data/mobs.js mobStats). Art: each foe wears the closest family's atlas until its own
// exists (MOB_SPRITES below; the 3D bodies in src/render3d/creatures.js familyOf). Text is original. No em dashes.
import { MOBS, MOB_SPRITES, MOB_ABILITIES as WORLD_MOB_ABILITIES, mobStats } from './mobs.js';
import { makeGear } from './rares.js';

// ---------------------------------------------------------------- the band's numbers
/** BUILDS_2 5.2's XP rule past 14 (the cap30 lane owns progression.js; this mirrors it for the band's quest rewards). */
export function bandXpToNext(L) {
  const kill = 20 + 4 * L;
  const minutes = L <= 30 ? 20 + Math.max(0, L - 14) : 36 + 0.8 * (L - 30);
  return Math.round((4 * kill * minutes) / 10) * 10;
}
/** A quest's XP at its level: about a third of the level (kills and the zone event make up the rest). `mult` for the
 *  long ones (a chain's end, an elite). */
export const questXp = (L, mult = 1) => Math.round((0.3 * mult * bandXpToNext(L)) / 10) * 10;
export const questGold = (L, mult = 1) => Math.round(3 * L * mult);

// Loot tiers for 20 to 30 (BUILDS_2 6): what a foe of the tier drops besides the curve's gold and the drop bands
// (src/data/items.js DROP_RULES.bands already runs past 20), the quest reward item level, and the vendors' gear level.
export const BAND_LOOT = Object.freeze([
  Object.freeze({ id: 'larch', name: 'Larchhill', levels: [20, 22], rewardIlvl: [20, 22], vendorIlvl: 21, rewardRarity: 'magic', chainEnd: 'rare' }),
  Object.freeze({ id: 'deep_larch', name: 'Larchhill and the Larch Mine', levels: [23, 25], rewardIlvl: [23, 25], vendorIlvl: 23, rewardRarity: 'magic', chainEnd: 'rare' }),
  Object.freeze({ id: 'drove', name: "Drovers' Reach", levels: [25, 27], rewardIlvl: [25, 27], vendorIlvl: 26, rewardRarity: 'magic', chainEnd: 'rare' }),
  Object.freeze({ id: 'high_drove', name: "Drovers' Reach, the Pound", levels: [28, 30], rewardIlvl: [28, 30], vendorIlvl: 28, rewardRarity: 'magic', chainEnd: 'rare' }),
]);
export const lootTier = (L) => BAND_LOOT.find((t) => L >= t.levels[0] && L <= t.levels[1]) || (L < 20 ? null : BAND_LOOT[BAND_LOOT.length - 1]);
/** A band reward's stats at an item level: main and stamina grow about one point every five levels past 20. */
export function bandStats(ilvl, shape = 'both') {
  const b = 4 + Math.floor((ilvl - 18) / 3);
  if (shape === 'trinket') return { main: b, sta: b - 1 };
  if (shape === 'boots') return { sta: b, main: b - 1, speed: 3 };
  if (shape === 'weapon') return { main: b + 1, sta: b - 1 };
  return { main: b, sta: b };
}

// ---------------------------------------------------------------- junk (sell to any vendor; value about the dropper's level)
const junk = (id, name, value) => Object.freeze({ id, name, rarity: 'common', kind: 'junk', slot: null, stack: 20, value, level: 1, reqLevel: 1, icon: 'slime_ink' });
export const BAND_JUNK = {
  hornet_wing: junk('hornet_wing', 'Hornet Wing', 22), lynx_pelt: junk('lynx_pelt', 'Lynx Pelt', 24), grub_chitin: junk('grub_chitin', 'Grub Chitin', 23),
  grey_coat_scrap: junk('grey_coat_scrap', 'Grey Coat Scrap', 25), cudgel_splinter: junk('cudgel_splinter', 'Cudgel Splinter', 25), barkhide: junk('barkhide', 'Barkhide', 27),
  blackdamp_ash: junk('blackdamp_ash', 'Blackdamp Ash', 24), ox_horn: junk('ox_horn', 'Ox Horn', 28), kite_quill: junk('kite_quill', 'Kite Quill', 28),
  hound_collar: junk('hound_collar', 'Spiked Hound Collar', 29), broken_link: junk('broken_link', 'Broken Chain Link', 30), tally_stick: junk('tally_stick', 'Notched Tally Stick', 31),
  drove_dust: junk('drove_dust', 'Drove Dust', 31),
};

// ---------------------------------------------------------------- abilities (the mobs.js shapes, new names)
export const BAND_MOB_ABILITIES = {
  mob_pounce: { ...WORLD_MOB_ABILITIES.mob_wolf_lunge, id: 'mob_pounce', name: 'Pounce' },
  mob_shoulder_barge: { ...WORLD_MOB_ABILITIES.mob_ram_charge, id: 'mob_shoulder_barge', name: 'Shoulder Barge' },
  mob_gore: { ...WORLD_MOB_ABILITIES.mob_ram_charge, id: 'mob_gore', name: 'Gore' },
  mob_thick_hide: { ...WORLD_MOB_ABILITIES.mob_shell_up, id: 'mob_thick_hide', name: 'Thick Hide' },
  mob_brace: { ...WORLD_MOB_ABILITIES.mob_shell_up, id: 'mob_brace', name: 'Brace' },
  mob_cold_hand: { ...WORLD_MOB_ABILITIES.mob_chilling_touch, id: 'mob_cold_hand', name: 'Cold Hand' },
  mob_blackdamp: { ...WORLD_MOB_ABILITIES.mob_ink_spit, id: 'mob_blackdamp', name: 'Blackdamp Breath', school: 'shadow',
    effects: [{ type: 'damage', mobHit: 1.6, canCrit: false, school: 'shadow' }, { type: 'aura', aura: { id: 'blackdamp_slow', name: 'Choking', kind: 'debuff', duration: 4, flags: ['slow'], mods: [{ stat: 'speed', mul: 0.8 }] } }] },
  // the elites (every big hit shows its ground warning first, like the dungeon bosses)
  mob_seal_sweep: { ...WORLD_MOB_ABILITIES.mob_reeve_sweep, id: 'mob_seal_sweep', name: 'Sealing Sweep' },
  mob_pick_slam: { ...WORLD_MOB_ABILITIES.mob_reeve_slam, id: 'mob_pick_slam', name: 'Pick Slam' },
  mob_damp_cloud: { ...WORLD_MOB_ABILITIES.mob_tally_rain, id: 'mob_damp_cloud', name: 'Damp Cloud' },
  mob_chain_lash: { ...WORLD_MOB_ABILITIES.mob_stair_rush, id: 'mob_chain_lash', name: 'Chain Lash' },
  mob_chain_slam: { ...WORLD_MOB_ABILITIES.mob_captain_hammer, id: 'mob_chain_slam', name: 'Chain Slam' },
};
// onto the world's mob abilities (src/data/mobs.js MOB_ABILITIES), the way the templates below go onto MOBS: every
// reader of content.mobAbilities (buildContent, the qa fixtures) sees them
Object.assign(WORLD_MOB_ABILITIES, BAND_MOB_ABILITIES);

// ---------------------------------------------------------------- foes
const T = (o) => o;
export const BAND_MOBS = {
  // ---- Larchhill (20 to 25)
  lh_hornet: T({ name: 'Larch Hornet', level: [20, 23], family: 'insect', kind: 'weak', traits: ['fast'], behavior: 'aggressive', aggroRadius: 64, speed: 76, wander: 3, flee: null, flying: true, social: true,
    abilities: [], loot: { junk: 'hornet_wing', table: [{ item: 'lh_stolen_comb', chance: 0.55, quest: 'lh_wax_and_honey' }] } }),
  lh_lynx: T({ name: 'Larch Lynx', level: [21, 24], family: 'beast', kind: 'normal', traits: ['fast'], behavior: 'aggressive', aggroRadius: 80, speed: 72, wander: 3, flee: 0.2, social: true,
    abilities: [{ id: 'mob_pounce', chance: 1, cooldown: 9 }], loot: { junk: 'lynx_pelt', table: [{ item: 'lh_lynx_ear', chance: 0.5, quest: 'lh_bounty_on_ears' }] } }),
  lh_grub: T({ name: 'Tunnel Grub', level: [21, 23], family: 'insect', kind: 'armored', behavior: 'aggressive', aggroRadius: 64, speed: 44, wander: 2, flee: null,
    abilities: [{ id: 'mob_shell_up' }], loot: { junk: 'grub_chitin', table: [] } }),
  lh_courier: T({ name: 'Grey Courier', level: [22, 25], family: 'humanoid', kind: 'caster', behavior: 'aggressive', aggroRadius: 96, speed: 62, wander: 2,
    abilities: [{ id: 'mob_cold_hand' }], loot: { junk: 'grey_coat_scrap', table: [{ item: 'lh_courier_satchel', chance: 0.5, quest: 'lh_seal_of_the_cold_hand' }] } }),
  lh_cudgel: T({ name: 'Hired Cudgel', level: [22, 25], family: 'humanoid', kind: 'normal', traits: ['heavy'], behavior: 'aggressive', aggroRadius: 80, speed: 64, wander: 2,
    abilities: [{ id: 'mob_shoulder_barge' }], loot: { junk: 'cudgel_splinter', table: [{ item: 'lh_courier_coin', chance: 0.6, quest: 'lh_paid_in_silver' }] } }),
  lh_bear: T({ name: 'Barkhide Bear', level: [24, 25], family: 'beast', kind: 'normal', traits: ['heavy', 'tough'], behavior: 'aggressive', aggroRadius: 72, speed: 66, wander: 3, flee: null,
    abilities: [{ id: 'mob_thick_hide' }], loot: { junk: 'barkhide', table: [{ item: 'lh_bear_fat', chance: 0.6, quest: 'lh_bearfat_and_bark' }] } }),
  lh_courier_captain: T({ name: 'Sable, Captain of the Grey Post', level: [25, 25], family: 'humanoid', kind: ['elite', 'caster'], elite: true, behavior: 'elite', aggroRadius: 96, speed: 60, wander: 0, leash: 320, flee: null,
    card: 'SABLE, CAPTAIN OF THE GREY POST. Every letter that leaves Larchhill passes through her hands. Every one is sealed cold.',
    deathLine: 'Her seal ring rolls in the dirt. The wax on it is still cold.',
    abilities: [{ id: 'mob_seal_sweep' }, { id: 'mob_cold_hand' }], loot: { junk: 'grey_coat_scrap', table: [{ item: 'lh_sables_orders', chance: 1.0, quest: 'lh_the_grey_captain' }], gear: 'elite' } }),
  // ---- the Larch Mine (21 to 23)
  lm_damp_miner: T({ name: 'Blackdamp Miner', level: [21, 23], family: 'spirit', kind: 'caster', behavior: 'aggressive', aggroRadius: 88, speed: 56, wander: 1, flee: null,
    abilities: [{ id: 'mob_blackdamp' }], loot: { junk: 'blackdamp_ash', table: [{ item: 'lh_miners_tag', chance: 1.0, quest: 'lh_the_shift_below' }] } }),
  lm_gaffer: T({ name: 'The Gaffer', level: [23, 23], family: 'spirit', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 56, wander: 0, leash: 320, flee: null, attackSpeed: 2.4,
    card: 'THE GAFFER. He sent the shift down. He went down after them. None of them came up.',
    deathLine: 'The Gaffer lowers his pick at last. Somewhere above, a bell rings the end of the shift.',
    abilities: [{ id: 'mob_pick_slam' }, { id: 'mob_damp_cloud' }],
    fight: { phases: [{ at: 0.5, yell: 'BACK TO WORK. ALL OF YOU. BACK TO WORK.', summon: { mob: 'lm_damp_miner', level: 21, count: 2 } }],
      frenzy: { after: 120, yell: 'The Gaffer swings for the seam.', mods: [{ stat: 'damageDone', mul: 1.4 }, { stat: 'attackSpeed', mul: 1.25 }] } },
    loot: { junk: 'blackdamp_ash', table: [{ item: 'lh_gaffers_bell', chance: 1.0, quest: 'lh_end_of_shift' }], gear: 'elite' } }),
  // ---- Drovers' Reach (25 to 30)
  dr_ox: T({ name: 'Wild Drove Ox', level: [25, 27], family: 'beast', kind: 'normal', traits: ['heavy'], behavior: 'aggressive', aggroRadius: 64, speed: 70, wander: 3, flee: null, social: true,
    abilities: [{ id: 'mob_gore' }], loot: { junk: 'ox_horn', table: [{ item: 'dr_brass_tag', chance: 0.55, quest: 'dr_brand_the_herd' }] } }),
  dr_kite: T({ name: 'Carrion Kite', level: [25, 27], family: 'beast', kind: 'weak', behavior: 'aggressive', aggroRadius: 72, speed: 82, wander: 3, flee: 0.4, flying: true,
    abilities: [], loot: { junk: 'kite_quill', table: [{ item: 'dr_kite_feather', chance: 0.6, quest: 'dr_feathers_for_hester' }] } }),
  dr_hound: T({ name: 'Chain Hound', level: [26, 28], family: 'beast', kind: 'normal', traits: ['fast'], behavior: 'aggressive', aggroRadius: 88, speed: 74, wander: 2, flee: null, social: true,
    abilities: [{ id: 'mob_pounce', chance: 1, cooldown: 8 }], loot: { junk: 'hound_collar', table: [] } }),
  dr_ganger: T({ name: 'Chain Ganger', level: [26, 28], family: 'humanoid', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 64, wander: 2,
    abilities: [{ id: 'mob_shoulder_barge' }], loot: { junk: 'broken_link', table: [{ item: 'dr_gang_key', chance: 0.5, quest: 'dr_keys_to_the_chains' }] } }),
  dr_tallyman: T({ name: 'Chain Tallyman', level: [27, 29], family: 'humanoid', kind: 'caster', behavior: 'aggressive', aggroRadius: 96, speed: 60, wander: 2,
    abilities: [{ id: 'mob_cold_hand' }], loot: { junk: 'tally_stick', table: [{ item: 'dr_ledger_page', chance: 0.55, quest: 'dr_the_toll_ledger' }] } }),
  dr_warder: T({ name: 'Chain Warder', level: [28, 29], family: 'humanoid', kind: 'armored', behavior: 'aggressive', aggroRadius: 80, speed: 56, wander: 2,
    abilities: [{ id: 'mob_brace' }], loot: { junk: 'broken_link', table: [{ item: 'dr_pound_key', chance: 0.35, quest: 'dr_the_pound_keys' }] } }),
  dr_shade: T({ name: 'Drover Shade', level: [27, 29], family: 'spirit', kind: 'caster', behavior: 'aggressive', aggroRadius: 96, speed: 60, wander: 2, flee: null, flying: true,
    abilities: [{ id: 'mob_chilling_touch' }], loot: { junk: 'drove_dust', table: [] } }),
  dr_chainmaster: T({ name: 'Harrow Coyle, the Chainmaster', level: [30, 30], family: 'humanoid', kind: ['elite', 'armored'], elite: true, behavior: 'elite', aggroRadius: 96, speed: 56, wander: 0, leash: 320, flee: null, attackSpeed: 2.4,
    card: 'HARROW COYLE, THE CHAINMASTER. He bought the drove roads with other people\'s names.',
    deathLine: 'The chain round his fist goes slack, and every link of it rattles at once.',
    abilities: [{ id: 'mob_chain_slam' }, { id: 'mob_chain_lash' }],
    fight: { phases: [{ at: 0.5, yell: 'HOUNDS! TO ME!', summon: { mob: 'dr_hound', level: 28, count: 2 } }] },
    loot: { junk: 'broken_link', table: [{ item: 'dr_coyles_list', chance: 1.0, quest: 'dr_the_chainmaster' }], gear: 'elite' } }),
};
// tuning (the dungeon bosses' knobs): the open-world elites are soloable at their level with a plan; the cave boss like
// the other caves' (src/data/mobs.js BOSS_TUNE)
const BAND_TUNE = {
  lh_courier_captain: { hpMult: 0.55, dmgMult: 0.45 }, dr_chainmaster: { hpMult: 0.55, dmgMult: 0.42 },
  lm_gaffer: { hpMult: 0.7, dmgMult: 0.36 },
};
export const BAND_MOB_SPRITES = {
  lh_hornet: { sprite: 'gorse_crow', lq: 'lost_page' },
  lh_lynx: { sprite: 'thornback_wolf', lq: 'thornback_wolf' },
  lh_grub: { sprite: 'lh_grub', lq: 'moss_scarab' },
  lh_courier: { sprite: 'lh_courier', lq: 'borrowed_shadow' },
  lh_cudgel: { sprite: 'lh_cudgel', lq: 'glass_sentinel' },
  lh_bear: { sprite: 'gorse_boar', lq: 'briar_alpha' },
  lh_courier_captain: { sprite: 'lh_courier_captain', lq: 'echo_warden' },
  lm_damp_miner: { sprite: 'lm_damp_miner', lq: 'borrowed_shadow' },
  lm_gaffer: { sprite: 'lm_gaffer', lq: 'echo_warden' },
  dr_ox: { sprite: 'fold_ram', lq: 'glassback' },
  dr_kite: { sprite: 'gorse_crow', lq: 'lost_page' },
  dr_hound: { sprite: 'mist_wolf', lq: 'mist_wolf' },
  dr_ganger: { sprite: 'dr_ganger', lq: 'glass_sentinel' },
  dr_tallyman: { sprite: 'page_wraith', lq: 'page_wraith' },
  dr_warder: { sprite: 'dr_warder', lq: 'glass_sentinel' },
  dr_shade: { sprite: 'dr_shade', lq: 'borrowed_shadow' },
  dr_chainmaster: { sprite: 'dr_chainmaster', lq: 'echo_warden' },
};
// register the templates the way src/data/mobs.js finishes its own (stats from the curve at the low level)
function register(id, m) {
  MOB_SPRITES[id] = BAND_MOB_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = BAND_MOB_SPRITES[id].sprite; m.spriteLq = BAND_MOB_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  m.elite = !!m.elite; m.leash = m.leash || 640;
  if (m.flee === undefined) m.flee = null;
  if (BAND_TUNE[id]) Object.assign(m, BAND_TUNE[id]);
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: st.damage, attackSpeed: st.attackSpeed, armor: st.armor });
  m.loot.gold = st.gold;
  m.respawn = m.elite ? 360 : m.kind === 'weak' ? 60 : 90;
}
for (const [id, m] of Object.entries(BAND_MOBS)) register(id, m);

// ---------------------------------------------------------------- rares (one mob on a long timer, a few spots)
/** A rare in the src/data/rootbound.js RB_RARE shape: { id, name, level, family (a band template it copies), zone, where,
 *  spots: [[x, y] tiles], flavour, item: { id, name, slot, type, stats } }. Returns { mob, item, runtime, spawn }. */
export function bandRare(R) {
  const base = BAND_MOBS[R.family];
  const item = makeGear(R.item.id, R.item.name, R.item.slot, R.item.type, R.level + 1, 'magic', R.item.stats, { rareDrop: R.id });
  const st = mobStats(R.family, R.level);
  const mob = Object.freeze({
    id: R.id, name: R.name, level: [R.level, R.level], family: base.family, kind: Array.isArray(base.kind) ? base.kind[0] : base.kind, traits: [...(base.traits || []), 'tough', 'rare'],
    behavior: 'aggressive', aggroRadius: 80, speed: base.speed, wander: 2, flee: null, social: false, ...(base.flying ? { flying: true } : {}),
    abilities: [...base.abilities], rare: true, flavour: R.flavour, rareItem: item.id,
    sprite: base.sprite, spriteLq: base.spriteLq, faction: 'hostile', school: 'physical', elite: false, leash: 640, xp: null,
    hp: Math.round(st.hp / 0.6), damage: st.damage, attackSpeed: 2.0, armor: 0, respawn: 1800, loot: { gold: [st.gold[0] * 2, st.gold[1] * 2], junk: base.loot.junk, table: [] },
  });
  MOB_SPRITES[R.id] = { sprite: base.sprite, lq: base.spriteLq };
  return {
    mob, item,
    runtime: { id: R.id, spots: R.spots.map(([a, b]) => [a, b]), respawn: [30 * 60, 60 * 60], item: item.id, level: R.level, region: null, where: R.where },
    spawn: { zone: R.zone, mob: R.id, level: R.level, x: R.spots[0][0], y: R.spots[0][1], wander: 2, respawn: null, group: `rare_${R.id}`, sprite: base.sprite },
  };
}

// ---------------------------------------------------------------- shared builders for the two zones' data files
/** A quest item (kind 'quest', stack 20, no value). */
export const questItem = (id, name, text, icon = 'icon_scroll') => Object.freeze({ id, name, rarity: 'common', kind: 'quest', slot: null, stack: 20, value: 0, level: 1, reqLevel: 1, text, icon, classes: null, use: null, bagSlots: 0, stats: {} });
/** A reward piece (magic unless said; rolls to class when type is 'class'). Stats from bandStats unless given. */
export function rewardGear(into, id, name, slot, type, ilvl, stats = null, rarity = 'magic') {
  const shape = slot === 'trinket' ? 'trinket' : slot === 'feet' ? 'boots' : slot === 'main' || slot === 'two' ? 'weapon' : 'both';
  into[id] = makeGear(id, name, slot, type, ilvl, rarity, stats || bandStats(ilvl, shape), { reward: true });
  return id;
}
/** A where circle in PIXELS (CONTRACTS 7.5) from tiles, in a zone of its own. */
export const whereIn = (zone) => (tx, ty, r) => ({ zone, x: Math.round(tx * 16 + 8), y: Math.round(ty * 16 + 8), r: Math.round(r * 16) });
/** A quest in the QUESTS shape with the band's defaults: XP and gold from its level unless given. */
export function bandQuest(zone, o) {
  const xp = o.rewards && o.rewards.xp != null ? o.rewards.xp : questXp(o.level, o.xpMult || 1);
  const gold = o.rewards && o.rewards.gold != null ? o.rewards.gold : questGold(o.level, o.xpMult || 1);
  const { xpMult, ...rest } = o;
  return { minLevel: Math.max(1, o.level - 1), zone, rewardRarity: 'magic', giveOnAccept: [], ...rest, rewards: { items: [], choice: [], ...o.rewards, xp, gold } };
}

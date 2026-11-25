// The Endmarket, the first raid (wave 10 draid, wave A; Scott 2026-11-25: "Go with your recommendations"; brief
// D:/LQOnline/wave10/draid/BRIEF.md). Wave A is the raid's frame and its first wing, the Drove Gate: the Turnpike and
// Old Shep. Every name and line here is a DRAFT for Scott. Plain data plus applyRaid(content), the last step of
// buildContent (src/data/maps/index.js). The rules live in src/sim/raid.js.
//
// The story: a hundred years ago the drove roads ended at the Endmarket, the great fair at the far end of the Old Drove.
// A buyer came who paid for names instead of beasts, and the fair's auctioneer, the Lot-Caller, sold them. The fair fell
// into one long dusk and the roads forgot the way. Every list since is a bill of sale, and the names on it are lots,
// driven west to be sold. Text is original. No em dashes.
//
//   RAID_RULES          the lockout, the Purse, the tickets (read by src/sim/raid.js as content.raid)
//   EM_MOBS             the wing's foes, registered into src/data/mobs.js MOBS / MOB_SPRITES on import (as deep_halls.js)
//   EM_MOB_ABILITIES    Pay the Toll (a ground ring the party shares), the Toll Bar, Come By! (Old Shep's pen), Drive
//   (the place)         src/data/raid_places.js, merged into DUNGEONS by src/data/dungeons.js (its door is in Drovers' Reach)
//   RAID_SETS           the tier set: one five-piece set per class, ilvl 32, from Lot Tickets
//   RAID_ITEMS          the set pieces and the five Lot Tickets
//   RAID_NPCS, RAID_QUESTS  Mother Tally at the Fair Gate, and the way in from Elder Mael (three steps)
//   fairGateDecor(zone) the Fair Gate's street on Drovers' Reach: decor and Mother Tally
import { MOBS, MOB_SPRITES, mobStats } from './mobs.js';
import { makeGear } from './rares.js';
import { bandQuest, whereIn } from './band20.js';

const T = (o) => o;

// ---------------------------------------------------------------- the rules (src/sim/raid.js)
export const RAID_RULES = Object.freeze({
  // a raid place: who gets loot. Heroes counted are the players inside the boss's copy when it dies.
  minParty: 2,                        // a lone hero gets gold only (Scott 2026-11-25, the brief's recommendation)
  // the lockout: loot once per hero per boss per Eastern calendar week (the week from the sim's day, src/sim/raid.js).
  // Boss kills are not kept between sittings: a copy resets as every dungeon's does (DUNGEON_RULES.resetSec).
  places: Object.freeze(['endmarket_gate']),
  // the Fair Purse: the first kill of a wing's last boss each week, per hero, in a party of 2 or more
  purse: Object.freeze({ gold: [140, 190], glyphs: 4, tickets: 1 }),
  // the slots a boss's Lot Ticket may be for (the first one the hero lacks, else any of them, by the copy's rng)
  ticketSlots: Object.freeze({ em_turnpike: ['head', 'legs', 'hands'], em_old_shep: ['chest', 'feet', 'hands'] }),
  setIlvl: 32,
  // Pay the Toll (the Turnpike): a ring on its target; when the 3 s cast ends the toll is shared by the heroes inside
  toll: Object.freeze({ every: 16, first: 8, castSec: 3, radiusPx: 40, swings: 3.2, unpaidMult: 0.6, soloRootSec: 3 }),
  // Come By! (Old Shep): the hero furthest from him is penned (rooted) until a friend breaks the hurdle
  herd: Object.freeze({ every: 20, first: 10, pennedSec: 9, flockSwings: 0.45, hurdleHp: 0.42 }),
});

// ---------------------------------------------------------------- abilities
export const EM_MOB_ABILITIES = {
  // the telegraph only: src/sim/raid.js resolves the toll when the cast ends (and even if something stopped it)
  em_pay_toll: { id: 'em_pay_toll', name: 'Pay the Toll', school: 'physical', castTime: 3.0, telegraph: 'circle', cooldown: 16, gcd: true, target: 'ground', uninterruptible: true,
    range: { min: 0, max: 96 }, area: { shape: 'circle', radius: 40, at: 'ground', share: true }, effects: [] },
  em_toll_bar: { id: 'em_toll_bar', name: 'Toll Bar', school: 'physical', castTime: 1.3, telegraph: 'cone', cooldown: 9, gcd: true, target: 'enemy',
    range: { min: 0, max: 40 }, area: { shape: 'cone', radius: 56, angle: 110, at: 'self' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.0, canCrit: false }] },
  em_drive: { id: 'em_drive', name: 'Drive', school: 'physical', castTime: 1.2, telegraph: 'line', cooldown: 13, gcd: true, target: 'enemy',
    range: { min: 0, max: 112 }, area: { shape: 'line', width: 24, radius: 112, at: 'self' },
    effects: [{ type: 'move', kind: 'charge', distance: 112, speed: 260 }, { type: 'damage', to: 'enemies', mobHit: 1.8, canCrit: false }] },
};

// ---------------------------------------------------------------- foes
export const EM_MOBS = {
  // the fair's folk: drovers who never went home, and the fair's dogs
  fair_drover: T({ name: 'Unsold Drover', level: [30, 30], family: 'spirit', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 62, wander: 1, flee: null,
    abilities: [{ id: 'mob_chilling_touch' }], loot: { junk: 'drove_dust', table: [] } }),
  fair_dog: T({ name: 'Fair Dog', level: [30, 30], family: 'beast', kind: 'normal', traits: ['fast'], behavior: 'aggressive', aggroRadius: 88, speed: 76, wander: 1, flee: null,
    abilities: [{ id: 'mob_ram_charge' }], loot: { junk: 'tangled_wool', table: [] } }),
  fair_stallholder: T({ name: 'Stallholder', level: [30, 30], family: 'spirit', kind: 'armored', traits: ['armored'], behavior: 'aggressive', aggroRadius: 72, speed: 54, wander: 0, flee: null,
    abilities: [{ id: 'mob_shell_up' }], loot: { junk: 'grave_dust', table: [] } }),
  // Old Shep's pen: a hurdle, no fight in it (src/sim/raid.js spawns it next to the penned hero)
  em_hurdle: T({ name: 'Pen Hurdle', level: [30, 30], family: 'construct', kind: 'weak', behavior: 'passive', aggroRadius: 0, speed: 0, wander: 0, flee: null,
    abilities: [], loot: { junk: null, table: [] } }),
  em_turnpike: T({ name: 'The Turnpike', level: [30, 30], family: 'construct', kind: ['elite', 'armored'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 44, wander: 0, leash: 400, flee: null, attackSpeed: 2.6,
    card: 'THE TURNPIKE. The toll gate that walked. Pay going in, pay going out.', deathLine: 'The bar swings up for the last time, and stays up.',
    abilities: [{ id: 'em_pay_toll', cooldown: 15 }, { id: 'em_toll_bar' }],
    fight: { phases: [{ at: 0.5, yell: 'TOLL! TOLL! Every head is counted!', summon: { mob: 'fair_drover', level: 30, count: 2 } }],
      frenzy: { after: 300, yell: 'The bar comes down for good.', mods: [{ stat: 'damageDone', mul: 1.5 }, { stat: 'attackSpeed', mul: 1.25 }] } },
    loot: { junk: 'grave_dust', table: [], gear: 'elite' } }),
  em_old_shep: T({ name: 'Old Shep', level: [30, 30], family: 'beast', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 80, wander: 0, leash: 400, flee: null, attackSpeed: 1.8,
    card: 'OLD SHEP. The best dog on the drove roads. He is still herding, and you are the flock.', deathLine: 'He lies down by the pen gate, the way he always did at the end of a long day.',
    abilities: [{ id: 'em_drive', cooldown: 13 }, { id: 'mob_ram_charge' }],
    fight: { phases: [{ at: 0.4, yell: 'A whistle from nowhere, and the fair dogs come running.', summon: { mob: 'fair_dog', level: 30, count: 2 } }],
      frenzy: { after: 300, yell: 'Old Shep stops herding, and starts hunting.', mods: [{ stat: 'damageDone', mul: 1.5 }, { stat: 'attackSpeed', mul: 1.3 }] } },
    loot: { junk: 'tangled_wool', table: [], gear: 'elite' } }),
};
const EM_SPRITES = {
  fair_drover: { sprite: 'barrow_shade', lq: 'borrowed_shadow' }, fair_dog: { sprite: 'mist_wolf', lq: 'glassback' },
  fair_stallholder: { sprite: 'barrow_shade', lq: 'borrowed_shadow' }, em_hurdle: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  em_turnpike: { sprite: 'tower_sentinel', lq: 'glass_sentinel' }, em_old_shep: { sprite: 'mist_wolf', lq: 'glassback' },
};
// boss tuning (the party bot's knobs, qa/sim/party_bot.mjs: four heroes at level 30, the party scaling of src/data/party.js on top)
export const EM_TUNE = {
  em_turnpike: { hpMult: 3.0, dmgMult: 0.4 },
  em_old_shep: { hpMult: 3.2, dmgMult: 0.36 },
  em_hurdle: { hpMult: 0.42, dmgMult: 0 },
};
for (const [id, m] of Object.entries(EM_MOBS)) {
  MOB_SPRITES[id] = EM_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = EM_SPRITES[id].sprite; m.spriteLq = EM_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  m.elite = !!m.elite; m.leash = m.leash || 640;
  if (EM_TUNE[id]) { Object.assign(m, EM_TUNE[id]); m.leash = Math.max(m.leash, 480); }
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: id === 'em_hurdle' ? [0, 0] : st.damage, attackSpeed: m.attackSpeed || st.attackSpeed, armor: st.armor });
  m.loot.gold = id === 'em_hurdle' ? [0, 0] : st.gold;
  m.respawn = m.elite ? 360 : 90;
}

// the place (wing 1; wings 2 and 3 are waves B and C) is plain data in src/data/raid_places.js, merged into DUNGEONS there

// ---------------------------------------------------------------- the tier set (ilvl 32) and the Lot Tickets
export const RAID_SLOTS = Object.freeze(['head', 'chest', 'legs', 'hands', 'feet']);
const S = (id, name, cls, armor, pieces, bonus) => ({ id, name, cls, armor, tier: 'endmarket', pieces, bonus });
export const RAID_SETS = {
  set_gatebreaker: S('set_gatebreaker', "Gatebreaker's Plate", 'warden', 'plate',
    { head: ['gatebreaker_helm', "Gatebreaker's Helm"], chest: ['gatebreaker_breastplate', "Gatebreaker's Breastplate"], legs: ['gatebreaker_greaves', "Gatebreaker's Greaves"],
      hands: ['gatebreaker_gauntlets', "Gatebreaker's Gauntlets"], feet: ['gatebreaker_sabatons', "Gatebreaker's Sabatons"] },
    { 2: { text: 'Damage taken -4%.', mods: [{ stat: 'damageTaken', mul: 0.96 }] },
      4: { text: 'Gatewheel deals 20% more damage.', mods: [{ stat: 'damageDone', mul: 1.2, ability: 'warden_gatewheel' }] },
      5: { text: 'Threat +20% and damage taken -3% more.', mods: [{ stat: 'threat', mul: 1.2 }, { stat: 'damageTaken', mul: 0.97 }] } }),
  set_fairbell: S('set_fairbell', 'Fairbell Vestments', 'mender', 'cloth',
    { head: ['fairbell_hood', 'Fairbell Hood'], chest: ['fairbell_robe', 'Fairbell Robe'], legs: ['fairbell_trousers', 'Fairbell Trousers'],
      hands: ['fairbell_gloves', 'Fairbell Gloves'], feet: ['fairbell_slippers', 'Fairbell Slippers'] },
    { 2: { text: 'Healing +6%.', mods: [{ stat: 'healingDone', mul: 1.06 }] },
      4: { text: 'Tolling Hammers deal 15% more damage.', mods: [{ stat: 'damageDone', mul: 1.15, ability: 'mender_tolling_hammers' }] },
      5: { text: 'Healing +8% more.', mods: [{ stat: 'healingDone', mul: 1.08 }] } }),
  set_redeemer: S('set_redeemer', "Redeemer's Folio", 'scribe', 'cloth',
    { head: ['redeemer_hood', "Redeemer's Hood"], chest: ['redeemer_robe', "Redeemer's Robe"], legs: ['redeemer_wraps', "Redeemer's Wraps"],
      hands: ['redeemer_gloves', "Redeemer's Gloves"], feet: ['redeemer_slippers', "Redeemer's Slippers"] },
    { 2: { text: 'Damage +5%.', mods: [{ stat: 'damageDone', mul: 1.05 }] },
      4: { text: 'Underline deals 25% more damage.', mods: [{ stat: 'damageDone', mul: 1.25, ability: 'scribe_underline' }] },
      5: { text: 'Your hounds and other summons deal 20% more damage.', mods: [{ stat: 'summonDamageDone', mul: 1.2 }] } }),
  set_night_drove: S('set_night_drove', 'Night Drove Harness', 'wayfinder', 'mail',
    { head: ['night_drove_coif', 'Night Drove Coif'], chest: ['night_drove_hauberk', 'Night Drove Hauberk'], legs: ['night_drove_chausses', 'Night Drove Chausses'],
      hands: ['night_drove_mitts', 'Night Drove Mitts'], feet: ['night_drove_boots', 'Night Drove Boots'] },
    { 2: { text: 'Damage +4%.', mods: [{ stat: 'damageDone', mul: 1.04 }] },
      4: { text: 'Your Sand Kestrel and other summons deal 20% more damage.', mods: [{ stat: 'summonDamageDone', mul: 1.2 }] },
      5: { text: 'Damage +5% more.', mods: [{ stat: 'damageDone', mul: 1.05 }] } }),
  set_struck_name: S('set_struck_name', 'Struck-Name Leathers', 'inkblade', 'leather',
    { head: ['struck_name_cap', 'Struck-Name Cap'], chest: ['struck_name_jerkin', 'Struck-Name Jerkin'], legs: ['struck_name_breeches', 'Struck-Name Breeches'],
      hands: ['struck_name_gloves', 'Struck-Name Gloves'], feet: ['struck_name_boots', 'Struck-Name Boots'] },
    { 2: { text: 'Critical strike +3%.', mods: [{ stat: 'crit', add: 0.03 }] },
      4: { text: 'Spill deals 15% more damage.', mods: [{ stat: 'damageDone', mul: 1.15, ability: 'inkblade_spill' }] },
      5: { text: 'Damage +5%.', mods: [{ stat: 'damageDone', mul: 1.05 }] } }),
};
const SLOT_STATS = { chest: { main: 8, sta: 9 }, legs: { main: 7, sta: 8 }, head: { main: 7, sta: 7 }, hands: { main: 6, sta: 6 }, feet: { main: 6, sta: 6, speed: 2 } };
export const RAID_ITEMS = {};
for (const s of Object.values(RAID_SETS)) {
  for (const [slot, [id, name]] of Object.entries(s.pieces)) {
    RAID_ITEMS[id] = makeGear(id, name, slot, s.armor, RAID_RULES.setIlvl, 'set', SLOT_STATS[slot], { dungeon: 'endmarket_gate', set: s.id, classes: [s.cls] });
  }
}
const SLOT_WORD = { head: 'Head', chest: 'Chest', legs: 'Legs', hands: 'Hands', feet: 'Feet' };
for (const slot of RAID_SLOTS) {
  const id = `lot_ticket_${slot}`;
  RAID_ITEMS[id] = Object.freeze({ id, name: `Lot Ticket: ${SLOT_WORD[slot]}`, rarity: 'epic', kind: 'consumable', slot: null, stack: 5, value: 0, level: 30, reqLevel: 30,
    icon: 'icon_scroll', classes: null, bagSlots: 0, stats: {},
    text: `A fair ticket with a name on it: yours. Use it to claim the ${SLOT_WORD[slot].toLowerCase()} piece of your class's Endmarket set.`,
    use: { kind: 'lot_ticket', slot } });
}

// ---------------------------------------------------------------- Mother Tally and the way in
const N = (o) => ({ faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false, ...o });
export const RAID_NPCS = {
  em_tally: N({ id: 'em_tally', name: 'Mother Tally', sprite: 'npc_old_woman', title: 'The Fair\'s Last Honest Clerk',
    talk: ['Every lot has a ticket, and every ticket has a name. Bring me yours and I will see you are paid what you are owed.',
      'Four go in, love. Two at the least. The fair does not pay a lone bidder.', 'Once a week the Purse is full. Mondays, as it always was.'] }),
};
const at = whereIn('drovers_reach');
const MAEL = { zone: 'world', x: 168 * 16 + 8, y: 144 * 16 + 8, r: 24 };
const Q = (o) => bandQuest('drovers_reach', o);
export const RAID_QUESTS = {
  em_market_that_closed: Q({ id: 'em_market_that_closed', num: 340, name: 'The Market That Closed', level: 30, giver: 'mael', turnIn: 'dr_bede',
    requires: { quests: ['dr_what_the_list_said'], cls: null, level: 30 }, chain: { id: 'endmarket', step: 1 },
    objectives: [{ kind: 'talk', npc: 'dr_bede', where: [at(412, 150, 3)], label: 'Ask Old Bede where the market went' }],
    rewards: { xp: 2400, gold: 40 },
    text: {
      offer: 'Sit. I need to tell you about the fair. Every list that crossed this well was a bill of sale. Names counted at the Barrow, written down on the drove roads, and sent on west to be sold. Old Bede on the Old Drove tells the ghosts where the market went. Go and ask him. Believe him, even if they never do.',
      progress: 'Old Bede, on the Old Drove. He talks to the dead. Today he talks to you.',
      complete: 'The market? Nobody asks about the market. (He looks at you a long time.) You finished the count. Then the road will remember the way. It goes north, where the drove runs into the trees.',
    } }),
  em_ghost_road: Q({ id: 'em_ghost_road', num: 341, name: 'The Ghost Road', level: 30, giver: 'dr_bede', turnIn: 'em_tally',
    requires: { quests: ['em_market_that_closed'], cls: null, level: 30 }, chain: { id: 'endmarket', step: 2 },
    objectives: [{ kind: 'talk', npc: 'em_tally', where: [at(306, 78, 3)], label: 'Follow the Old Drove north to the Fair Gate' }],
    rewards: { xp: 2400, gold: 40 },
    text: {
      offer: 'Follow the drove north, past the last cairn, into the trees. There is a gate there that was not there yesterday. A woman will be standing by it. She was standing by it a hundred years ago too.',
      progress: 'North up the Old Drove, into the trees.',
      complete: 'A new face. Four of you, I hope. The Endmarket is open again, love, and it has been waiting for buyers.',
    } }),
  em_pay_going_in: Q({ id: 'em_pay_going_in', num: 342, name: 'Pay Going In', level: 30, giver: 'em_tally', turnIn: 'em_tally', elite: true,
    requires: { quests: ['em_ghost_road'], cls: null, level: 30 }, chain: { id: 'endmarket', step: 3 },
    objectives: [
      { kind: 'kill', mob: 'em_turnpike', count: 1, where: [at(303, 75, 3)], label: 'The Turnpike (the Endmarket, the Drove Gate)' },
      { kind: 'kill', mob: 'em_old_shep', count: 1, where: [at(303, 75, 3)], label: 'Old Shep (the Endmarket, the Drove Gate)' },
    ],
    rewards: { xp: 9000, gold: 160 },
    text: {
      offer: 'The Drove Gate takes a toll going in, and the Turnpike collects it. Pay together: stand in its ring with your friends and the toll is shared. Past it, in the pens, Old Shep is still herding. When he pens one of you, the others break the hurdle. Bring three friends. Bring one at the least.',
      progress: 'Pay the toll together. Break the pen for whoever he puts in it.',
      complete: 'The gate is paid and the dog is resting. The fair knows your faces now. Every Monday the Purse is full again, and your tickets are good with me any day.',
    } }),
};
export const RAID_QUEST_ORDER = Object.keys(RAID_QUESTS);

// ---------------------------------------------------------------- the Fair Gate on Drovers' Reach
/** Drovers' Reach with the Fair Gate's street: the line trees cleared, old stalls, hay, a trough, lamp posts, Mother Tally. */
export function fairGateDecor(z) {
  const clear = (d) => !(d.x >= 297 && d.x <= 309 && d.y >= 72 && d.y <= 88 && !(d.deep && d.y < 73));
  const decor = (z.decor || []).filter(clear);
  const add = (t, x, y) => decor.push({ t, x, y, region: 'dr_olddrove' });
  add('lamp_post', 299, 77); add('lamp_post', 307, 77); add('lamp_post', 297, 84); add('lamp_post', 309, 84);
  add('market_stall_cloth', 293, 79); add('market_stall_fruit', 311, 80);
  add('x1_haybale', 296, 81); add('x1_haybale', 310, 86); add('x1_trough', 293, 86); add('crates_barrels', 312, 83);
  add('x1_sack_stack', 297, 79); add('barrel', 309, 79); add('signboard', 300, 88);
  return { ...z, decor, npcs: [...(z.npcs || []), { npc: 'em_tally', x: 306, y: 78, dir: 'left' }] };
}

/** content -> content with the raid merged in (buildContent's last step). */
export function applyRaid(C) {
  return {
    ...C,
    mobs: { ...C.mobs, ...EM_MOBS },
    mobAbilities: { ...C.mobAbilities, ...EM_MOB_ABILITIES },
    items: { ...C.items, ...RAID_ITEMS },
    sets: { ...C.sets, ...RAID_SETS },
    npcs: { ...C.npcs, ...RAID_NPCS },
    quests: { ...C.quests, ...RAID_QUESTS },
    sideQuests: [...(C.sideQuests || []), ...RAID_QUEST_ORDER],
    raid: RAID_RULES,
  };
}

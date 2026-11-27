// The Endmarket, wing 2: the Fair Streets (wave 10 draid, wave B; brief BRIEF_raid_wing2.md, Scott 2026-11-26:
// "Go with your recs"). Past the Drove Fold the stalls still sell names. The Weighmaster, the Crier and the Catchpole
// stand between the Fair Streets and the Tollhall doors. Every name and line here is a DRAFT for Scott. Plain data,
// merged by applyRaid in src/data/raid_endmarket.js. The rules live in src/sim/raid.js. Text is original. No em dashes.
//
//   STREET_RULES        weigh, Sold!, Hook and Draw, Street Tickets, the Street Purse (merged into content.raid)
//   STREET_ABILITIES    Weigh the Lot, the Weigh Beam, the Bidding Bell, Pound the Lane, Claim the Lot
//   STREET_MOBS         Lot Buyers, the three bosses, the Chain Ring
//   STREET_ITEMS        Street Tickets (ilvl 33, reqLevel 30 so a cap-30 hero can wear them) and the street weapons
//                       and trinkets
//   STREET_QUESTS       The Streets Still Selling (Mother Tally, after Pay Going In)
import { MOBS, MOB_SPRITES, mobStats } from './mobs.js';
import { makeGear } from './rares.js';
import { bandQuest, whereIn } from './band20.js';

const T = (o) => o;

// Pan and stall tiles match tools/maps/zone_endmarket_streets.mjs (the Weighmaster's scales at 40,90; the Crier's
// three stalls on the ring). src/sim/raid.js reads them from content.raid.
export const STREET_RULES = Object.freeze({
  places: Object.freeze(['endmarket_streets']),
  // the Street Purse: the first kill of this wing's last boss each week, per hero, in a party of 2 or more
  purses: Object.freeze({ endmarket_streets: Object.freeze({ gold: [160, 220], glyphs: 4, tickets: 1 }) }),
  // a Street Ticket key (street_weapon, street_off, street_trinket) or a Lot Ticket armor slot
  ticketSlots: Object.freeze({
    em_weighmaster: Object.freeze(['head', 'hands', 'street_trinket']),
    em_crier: Object.freeze(['legs', 'feet', 'street_off']),
    em_catchpole: Object.freeze(['chest', 'hands', 'street_weapon']),
  }),
  streetIlvl: 33,
  streetGear: Object.freeze({
    weapon: Object.freeze({ warden: 'weigh_bar', mender: 'street_rod', scribe: 'tag_quill', wayfinder: 'midway_bow', inkblade: 'lot_knife' }),
    off: Object.freeze({ warden: 'scale_plate', mender: 'hawker_hand_bell', scribe: 'midway_folio', inkblade: 'tag_knife' }),
    trinket: Object.freeze(['weighmasters_weight', 'criers_tag', 'catchpoles_hook']),
  }),
  // Weigh the Lot (the Weighmaster): a 3 s uninterruptible weigh; the heavy hero stands on the gold (east) pan, at
  // least one other on the blue (west) pan. Both paid: a modest shared hit. A missed pan: an unpaid hit and a short
  // knock. Alone: the gold pan roots (the weigh is paid in time); neither pan is an avoidable unpaid hit.
  weigh: Object.freeze({ every: 18, first: 8, castSec: 3, radiusPx: 40, paidSwings: 1.2, unpaidMult: 0.8, soloRootSec: 3,
    gold: Object.freeze([46, 91]), blue: Object.freeze([34, 91]) }),
  // Sold! (the Crier): a coloured tag on a non-target; 6 s (8 s alone) to the matching stall. Purify or a magic dispel
  // drops it. A friend already in the stall splits a late burst. A party fail jumps the tag to another colour with a
  // shorter window. Alone: the nearest stall, no jump.
  sold: Object.freeze({ every: 20, first: 10, windowSec: 6, soloWindowSec: 8, jumpSec: 4, burstSwings: 2.2,
    colors: Object.freeze(['oxblood', 'bone', 'teal']),
    stalls: Object.freeze({ oxblood: Object.freeze([22, 50]), bone: Object.freeze([40, 48]), teal: Object.freeze([58, 50]) }) }),
  // Hook and Draw (the Catchpole): the furthest non-target is hooked and slowed, not rooted. A friend breaks the
  // Chain Ring to cut the hook. Fail: a pull, a short stun, a modest hit. Alone: a brief root, then a Chain Ring
  // beside them (they break their own; no drag through packs).
  hook: Object.freeze({ every: 22, first: 12, windowSec: 6, pullSpeed: 28, stunSec: 1.5, failSwings: 1.6, soloRootSec: 2, ringHp: 0.42 }),
});

export const STREET_ABILITIES = {
  // the telegraph only: src/sim/raid.js applies Heavy at the start and weighs the pans when the cast ends
  em_weigh_lot: { id: 'em_weigh_lot', name: 'Weigh the Lot', school: 'physical', castTime: 3.0, telegraph: 'circle', cooldown: 18, gcd: true, target: 'ground', uninterruptible: true,
    range: { min: 0, max: 96 }, area: { shape: 'circle', radius: 40, at: 'ground', share: true }, effects: [] },
  em_weigh_beam: { id: 'em_weigh_beam', name: 'Weigh Beam', school: 'physical', castTime: 1.3, telegraph: 'cone', cooldown: 9, gcd: true, target: 'enemy',
    range: { min: 0, max: 40 }, area: { shape: 'cone', radius: 56, angle: 110, at: 'self' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.0, canCrit: false }] },
  em_bidding_bell: { id: 'em_bidding_bell', name: 'Bidding Bell', school: 'shadow', castTime: 1.5, telegraph: 'circle', cooldown: 14, gcd: true, target: 'enemy',
    range: { min: 0, max: 80 }, area: { shape: 'circle', radius: 48, at: 'self' },
    effects: [
      { type: 'damage', to: 'enemies', mobHit: 1.4, canCrit: false, school: 'shadow' },
      { type: 'aura', to: 'enemies', aura: { id: 'em_bidding', name: 'The Bidding Bell', icon: 'icon_silence', kind: 'debuff', duration: 2, flags: ['silence'], dispel: 'magic' } },
    ] },
  em_pound_lane: { id: 'em_pound_lane', name: 'Pound the Lane', school: 'physical', castTime: 1.2, telegraph: 'line', cooldown: 13, gcd: true, target: 'enemy',
    range: { min: 0, max: 112 }, area: { shape: 'line', width: 24, radius: 112, at: 'self' },
    effects: [{ type: 'move', kind: 'charge', distance: 112, speed: 260 }, { type: 'damage', to: 'enemies', mobHit: 1.8, canCrit: false }] },
  // a Lot Buyer's claim: interruptible; a short slow if it lands (the bot can kick it, and a miss is not a wipe)
  em_claim_lot: { id: 'em_claim_lot', name: 'Claim the Lot', school: 'shadow', castTime: 2.0, cooldown: 10, gcd: true, target: 'enemy',
    range: { min: 0, max: 96 },
    effects: [
      { type: 'damage', mobHit: 1.3, canCrit: false, school: 'shadow' },
      { type: 'aura', aura: { id: 'em_claimed', name: 'Claimed', icon: 'icon_slow', kind: 'debuff', duration: 4, flags: ['slow'], dispel: 'magic', mods: [{ stat: 'speed', add: -0.3 }] } },
    ] },
};

export const STREET_MOBS = {
  fair_lot_buyer: T({ name: 'Lot Buyer', level: [30, 30], family: 'spirit', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 58, wander: 1, flee: null,
    abilities: [{ id: 'em_claim_lot' }], loot: { junk: 'grave_dust', table: [] } }),
  em_chain_ring: T({ name: 'Chain Ring', level: [30, 30], family: 'construct', kind: 'weak', behavior: 'passive', aggroRadius: 0, speed: 0, wander: 0, flee: null,
    abilities: [], loot: { junk: null, table: [] } }),
  em_weighmaster: T({ name: 'The Weighmaster', level: [30, 30], family: 'construct', kind: ['elite', 'armored'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 42, wander: 0, leash: 400, flee: null, attackSpeed: 2.6,
    card: 'THE WEIGHMASTER. The fair\'s great scales still weigh every lot that comes down the street.', deathLine: 'The beam settles, and the pans hang still.',
    abilities: [{ id: 'em_weigh_lot', cooldown: 17 }, { id: 'em_weigh_beam' }],
    fight: { phases: [{ at: 0.5, yell: 'Another lot on the pan!', summon: { mob: 'fair_lot_buyer', level: 30, count: 2 } }],
      frenzy: { after: 300, yell: 'The beam will not come back to rest.', mods: [{ stat: 'damageDone', mul: 1.5 }, { stat: 'attackSpeed', mul: 1.25 }] } },
    loot: { junk: 'grave_dust', table: [], gear: 'elite' } }),
  em_crier: T({ name: 'The Crier', level: [30, 30], family: 'spirit', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 56, wander: 0, leash: 400, flee: null, attackSpeed: 2.2,
    card: 'THE CRIER. He still calls the lots. A name on a tag is a name for sale.', deathLine: 'The last call hangs in the dusk, and no one answers it.',
    abilities: [{ id: 'em_bidding_bell', cooldown: 14 }],
    fight: { phases: [{ at: 0.4, yell: 'Sold, going, gone! The stalls still want their share.', summon: { mob: 'fair_stallholder', level: 30, count: 2 } }],
      frenzy: { after: 300, yell: 'EVERY NAME IS SOLD!', mods: [{ stat: 'damageDone', mul: 1.5 }, { stat: 'attackSpeed', mul: 1.3 }] } },
    loot: { junk: 'grave_dust', table: [], gear: 'elite' } }),
  em_catchpole: T({ name: 'The Catchpole', level: [30, 30], family: 'spirit', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 62, wander: 0, leash: 400, flee: null, attackSpeed: 2.0,
    card: 'THE CATCHPOLE. The fair\'s bailiff. His hook still finds the one who tries to leave the lane unpaid.',
    deathLine: 'The hook goes slack. Far up the lane, the Tollhall doors do not open. Not yet.',
    abilities: [{ id: 'em_pound_lane', cooldown: 13 }],
    fight: { phases: [{ at: 0.4, yell: 'The dogs of the lane still run for the bailiff.', summon: { mob: 'fair_dog', level: 30, count: 2 } }],
      frenzy: { after: 300, yell: 'No one leaves the lane.', mods: [{ stat: 'damageDone', mul: 1.5 }, { stat: 'attackSpeed', mul: 1.3 }] } },
    loot: { junk: 'grave_dust', table: [], gear: 'elite' } }),
};
const STREET_SPRITES = {
  fair_lot_buyer: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  em_chain_ring: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  em_weighmaster: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  em_crier: { sprite: 'barrow_tallywife', lq: 'borrowed_shadow' },
  em_catchpole: { sprite: 'barrow_reeve', lq: 'borrowed_shadow' },
};
export const STREET_TUNE = {
  em_weighmaster: { hpMult: 3.0, dmgMult: 0.38 },
  em_crier: { hpMult: 3.1, dmgMult: 0.36 },
  em_catchpole: { hpMult: 3.3, dmgMult: 0.36 },
  em_chain_ring: { hpMult: 0.42, dmgMult: 0 },
};
for (const [id, m] of Object.entries(STREET_MOBS)) {
  MOB_SPRITES[id] = STREET_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = STREET_SPRITES[id].sprite; m.spriteLq = STREET_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  m.elite = !!m.elite; m.leash = m.leash || 640;
  if (STREET_TUNE[id]) { Object.assign(m, STREET_TUNE[id]); m.leash = Math.max(m.leash, 480); }
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: id === 'em_chain_ring' ? [0, 0] : st.damage, attackSpeed: m.attackSpeed || st.attackSpeed, armor: st.armor });
  m.loot.gold = id === 'em_chain_ring' ? [0, 0] : st.gold;
  m.respawn = m.elite ? 360 : 90;
}

// Street Tickets and the street weapons / trinkets (ilvl 33). reqLevel is 30: reqLevel(33) would be 31, past the cap.
const I = 33;
const RQ = { reqLevel: 30, dungeon: 'endmarket_streets' };
export const STREET_ITEMS = {};
const g = (id, name, slot, typ, stats, extra = {}) => {
  STREET_ITEMS[id] = makeGear(id, name, slot, typ, I, 'epic', stats, { ...RQ, bind: 'boe', ...extra });
};
g('weigh_bar', 'Weigh-Bar', 'main', 'sword', { main: 10, sta: 9 }, { classes: ['warden'] });
g('scale_plate', 'Scale-Plate', 'off', 'shield', { main: 7, sta: 8 }, { classes: ['warden'] });
g('street_rod', 'Street Rod', 'main', 'rod', { main: 10, sta: 9, spi: 4 }, { classes: ['mender'] });
g('hawker_hand_bell', "Hawker's Hand Bell", 'off', 'bell', { main: 7, sta: 8, spi: 3 }, { classes: ['mender'] });
g('tag_quill', 'Tag Quill', 'main', 'quill', { main: 10, sta: 9, crit: 3 }, { classes: ['scribe'] });
g('midway_folio', 'Midway Folio', 'off', 'book', { main: 7, sta: 8, crit: 2 }, { classes: ['scribe'] });
g('midway_bow', 'Midway Bow', 'two', 'bow', { main: 12, sta: 11, haste: 3 }, { classes: ['wayfinder'] });
g('lot_knife', 'Lot-Knife', 'main', 'dagger', { main: 10, sta: 9, crit: 3 }, { classes: ['inkblade'] });
g('tag_knife', 'Tag-Knife', 'off', 'dagger', { main: 6, sta: 6, crit: 2 }, { classes: ['inkblade'] });
STREET_ITEMS.weighmasters_weight = makeGear('weighmasters_weight', "The Weighmaster's Weight", 'trinket', null, I, 'epic', { main: 8, sta: 8 }, {
  ...RQ, bind: 'boe',
  text: 'A blow against you may raise a small ward, the way a pan takes a weight and holds it.',
  power: { id: 'em_weight', text: 'A blow against you may raise a small ward.',
    procs: [{ on: 'damageTaken', icd: 20, effects: [{ type: 'aura', to: 'self', aura: { id: 'em_weight_ward', name: 'Weighed', icon: 'mender_warding_word', kind: 'buff', duration: 4, absorb: { pctMaxHp: 0.06 } } }] }] },
});
STREET_ITEMS.criers_tag = makeGear('criers_tag', "A Crier's Tag", 'trinket', null, I, 'epic', { main: 8, sta: 6, crit: 3 }, {
  ...RQ, bind: 'boe',
  text: 'A tag from the Crier\'s stall. A hard dispel or Purify was meant to wake a short burst (a draft, for the balance pass).',
});
STREET_ITEMS.catchpoles_hook = makeGear('catchpoles_hook', "The Catchpole's Hook", 'trinket', null, I, 'epic', { main: 8, sta: 8 }, {
  ...RQ, bind: 'boe',
  text: 'The first spell or shot on a foe more than 8 tiles away was meant to pull you 2 tiles closer, once every 30 s (a draft, for the balance pass).',
});
const TICKET_WORD = { weapon: 'Weapon', off: 'Off Hand', trinket: 'Trinket' };
const TICKET_TEXT = {
  weapon: "Use it to claim your class's Street weapon (ilvl 33).",
  off: "Use it to claim your class's Street off-hand (ilvl 33). A Wayfinder's off ticket is a Street trinket.",
  trinket: 'Use it to claim a Street trinket you do not yet hold (ilvl 33).',
};
for (const slot of ['weapon', 'off', 'trinket']) {
  const id = `street_ticket_${slot}`;
  STREET_ITEMS[id] = Object.freeze({ id, name: `Street Ticket: ${TICKET_WORD[slot]}`, rarity: 'epic', kind: 'consumable', slot: null, stack: 5, value: 0, level: 30, reqLevel: 30,
    icon: 'icon_scroll', classes: null, bagSlots: 0, stats: {},
    text: `A fair ticket from the streets past the Fold. ${TICKET_TEXT[slot]}`,
    use: { kind: 'lot_ticket', ticket: 'street', slot } });
}

const at = whereIn('drovers_reach');
const Q = (o) => bandQuest('drovers_reach', o);
export const STREET_QUESTS = {
  em_streets_still_selling: Q({ id: 'em_streets_still_selling', num: 343, name: 'The Streets Still Selling', level: 30, giver: 'em_tally', turnIn: 'em_tally', elite: true,
    requires: { quests: ['em_pay_going_in'], cls: null, level: 30 }, chain: { id: 'endmarket', step: 4 },
    objectives: [
      { kind: 'kill', mob: 'em_weighmaster', count: 1, where: [at(307, 75, 3)], label: 'The Weighmaster (the Endmarket, the Fair Streets)' },
      { kind: 'kill', mob: 'em_crier', count: 1, where: [at(307, 75, 3)], label: 'The Crier (the Endmarket, the Fair Streets)' },
      { kind: 'kill', mob: 'em_catchpole', count: 1, where: [at(307, 75, 3)], label: 'The Catchpole (the Endmarket, the Fair Streets)' },
    ],
    rewards: { xp: 9000, gold: 180, items: ['street_ticket_weapon'] },
    text: {
      offer: 'Past the Fold the stalls are still selling, love. The Weighmaster takes the weight of a lot, the Crier calls the name, and the Catchpole\'s hook finds whoever walks out unpaid. The door is the one beside this gate. Four go in. Two at the least. Come back when the hook has gone slack.',
      progress: 'The Fair Streets, through the door beside the Fair Gate. Weigh the lot together. Walk a Sold! tag to its stall. Cut the Catchpole\'s hook.',
      complete: 'The Lot-Caller is still calling. Not today. The Tollhall doors did not open. Your Street Tickets are good with me, same as the Lot ones.',
    } }),
};
export const STREET_QUEST_ORDER = Object.keys(STREET_QUESTS);

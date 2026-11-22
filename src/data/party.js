// Group play rules (group play basics, 2026-11-22; GAP B9, B10 and the group table in D:\LQOnline\wow_gap\GAP.md).
// Plain data. The rules live in src/sim/party.js (scaling, rez, release or wait, quest sharing, ready check) and
// src/sim/trade.js (trade and binding). applyParty(content) adds the lantern-ash item, puts it on two vendors and hangs
// PARTY_RULES on the content object; buildContent (src/data/maps/index.js) calls it once.

export const PARTY_RULES = {
  // BUILDS_2 7.4: a foe a party fights gets +60% health and +10% damage for each hero past the first (up to 4 heroes).
  // Heroes counted: the party's members alive in the foe's zone within reachPx (the kill-share reach, 40 tiles) once any
  // of them is on its threat list. The count only grows during a fight. In a dungeon copy the count is at least the
  // heroes who entered the copy; a boss keeps the count it had when the fight began.
  scale: { hpPerHero: 0.6, dmgPerHero: 0.1, maxHeroes: 4, reachPx: 640 },
  // the rez: the Mender's Rekindle (free) and anyone's lantern-ash (one per use), both out of combat
  rez: { castSec: 10, hpPct: 0.35, resPct: 0.35, rangePx: 160, classes: ['mender'], spell: 'Rekindle', item: 'lantern_ash' },
  // death in a party: Release (wake at your lantern now) or Wait (stay where you fell up to waitSec for a rez)
  death: { waitSec: 300 },
  readyCheck: { sec: 30, closeSec: 4 },
  share: { rangePx: 640, offerSec: 60 },
  trade: { slots: 6, rangePx: 96, maxGold: 1e9 },
  // binding (src/sim/trade.js bindOf): 'pickup' never trades; 'equip' trades until worn once (then Soulbound)
  bind: { equipRarities: ['magic', 'rare', 'epic', 'set', 'legendary'], pickupRarities: ['legendary', 'set'] },
};

export const PARTY_ITEMS = {
  lantern_ash: {
    id: 'lantern_ash', name: 'Lantern-ash', rarity: 'common', kind: 'consumable', slot: null, stack: 20, price: 1, value: 0, level: 1, reqLevel: 1,
    icon: 'icon_lantern', text: 'Ash from a lantern wick. Wakes a fallen friend where they fell, out of combat: press Rez on their party frame',
  },
};

// who sells it: the general goods in Willowmere and the valley peddler
const SELLERS = ['pell', 'penny'];

/** The content object with group play added (unchanged where nothing is added). */
export function applyParty(C) {
  const npcs = { ...(C.npcs || {}) };
  for (const id of SELLERS) {
    const n = npcs[id];
    if (!n || !n.vendor || !Array.isArray(n.vendor.items) || n.vendor.items.some((s) => s.item === 'lantern_ash')) continue;
    npcs[id] = { ...n, vendor: { ...n.vendor, items: [...n.vendor.items, { item: 'lantern_ash' }] } };
  }
  return { ...C, npcs, items: { ...(C.items || {}), ...PARTY_ITEMS }, party: PARTY_RULES };
}

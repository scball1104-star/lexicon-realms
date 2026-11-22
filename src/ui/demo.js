// UI TEST DATA ONLY (dev URL ?uidemo=normal|worst). Fills the PLACEHOLDER parts of the HUD model (quests, bags, gear,
// talents, party, gold) so every screen can be seen and screenshotted before the sim sends those fields. Never used
// in normal play. Quest names here are test strings, not content: the real quests come from src/data/quests.js.

const item = (id, name, icon, rarity, extra = {}) => ({ id, name, icon, rarity, kind: 'armor', value: 12, level: 3, ...extra });

export const DEMO_ITEMS = [
  item('rusty_sword', 'Rusty Sword', 'icon16_sword', 'common', { kind: 'weapon', slot: 'main', weaponType: 'sword', damage: [3, 6], speed: 2.4 }),
  item('plank_shield', 'Plank Shield', 'icon_shield', 'common', { slot: 'off', armor: 14 }),
  item('tess_gloves', "Tess's Patched Gloves", 'icon_charm', 'magic', { slot: 'hands', armor: 6, stats: { sta: 1, str: 1 } }),
  item('willow_cloak', 'Willowbark Cloak of the Lantern Road', 'icon_mantle', 'rare', { slot: 'chest', armor: 21, stats: { sta: 3, spi: 2 } }),
  item('briar_helm', 'Briar Crown', 'icon_helm', 'epic', { slot: 'head', armor: 18, stats: { sta: 4, str: 3 } }),
  item('keeper_lamp', 'Lamp of the First Keeper', 'icon_lantern', 'legendary', { slot: 'trinket', stats: { int: 5, spi: 5 }, text: 'It was lit before the roads' }),
  item('minor_potion', 'Minor Healing Draught', 'icon_potion', 'common', { kind: 'consumable', use: { ability: 'minor_heal' }, value: 5 }),
  item('wolf_pelt', 'Thornback Wolf Pelt', 'icon_leaf', 'common', { kind: 'quest', value: 0 }),
  item('ink_vial', 'Vial of Wet Ink', 'icon_ether', 'magic', { kind: 'junk', value: 3 }),
  item('old_boots', 'Old Ferry Boots', 'icon_boots', 'common', { slot: 'feet', armor: 5 }),
];

const Q = (id, name, level, objectives, extra = {}) => ({ id, name, level, objectives, tracked: true, state: 'active', zoneName: 'Willowmere Valley',
  rewards: { xp: 420 + level * 90, gold: level * 2, choice: [] },
  text: { offer: 'Test quest text for the UI. The real words come from the quest data, written in the voice of Lexicon Quest.' }, ...extra });

export function demoState(kind = 'normal') {
  const worst = kind === 'worst';
  const withChoice = (q) => ({ ...q, rewards: { ...q.rewards, choice: [DEMO_ITEMS[2], DEMO_ITEMS[3]] } });
  const quests = (worst ? [
    Q('q1', 'Return the Unwritten Page to Elder Mael in Willowmere Before the Lanterns Go Out', 4, [{ text: 'Unwritten Page delivered', cur: 0, need: 1 }]),
    Q('q2', 'Clear the Thornback Wolves', 3, [{ text: 'Thornback Wolves slain', cur: 3, need: 8 }]),
    Q('q3', 'Pelts and Briar Thread for Tess the Weaver of Willowmere', 3, [{ text: 'Thornback Wolf Pelts', cur: 2, need: 6 }, { text: 'Bundles of Briar Thread from the hedges by the old mill', cur: 9, need: 10 }]),
    Q('q4', 'Sergeant Holt Wants a Word', 2, [{ text: 'Speak with Sergeant Holt at the south gate', cur: 1, need: 1 }], { done: true, turnIn: 'holt' }),
    Q('q5', 'Ink in the Millpond', 5, [{ text: 'Ink Slimes', cur: 11, need: 12 }, { text: 'Read the sign at the mill', cur: 0, need: 1 }]),
    Q('q6', 'Lost Ferry Rope', 4, [{ text: 'Ferry rope found', cur: 0, need: 1 }], { tracked: false }),
    Q('q7', 'A Letter for Nella', 2, [{ text: 'Letter delivered', cur: 0, need: 1 }], { tracked: false }),
  ] : [
    Q('q2', 'Clear the Thornback Wolves', 3, [{ text: 'Thornback Wolves slain', cur: 3, need: 8 }]),
    Q('q1', 'Return the Unwritten Page to Elder Mael in Willowmere', 4, [{ text: 'Unwritten Page delivered', cur: 0, need: 1 }]),
    Q('qa', 'Mael Has Work', 1, [], { state: 'available', giver: 'mael', tracked: false }),
  ]).map(withChoice);
  const bagItems = worst
    ? Array.from({ length: 16 }, (_, i) => ({ ...DEMO_ITEMS[i % DEMO_ITEMS.length], qty: [1, 1, 1, 1, 1, 1, 20, 6, 99, 1][i % 10] }))
    : [{ ...DEMO_ITEMS[6], qty: 5 }, { ...DEMO_ITEMS[7], qty: 3 }, { ...DEMO_ITEMS[9], qty: 1 }, null, { ...DEMO_ITEMS[8], qty: 2 }];
  return {
    quests,
    bag: { size: 16, items: bagItems },
    equip: worst ? { main: DEMO_ITEMS[0], off: DEMO_ITEMS[1], hands: DEMO_ITEMS[2], chest: DEMO_ITEMS[3], head: DEMO_ITEMS[4], trinket: DEMO_ITEMS[5] }
      : { main: DEMO_ITEMS[0], off: DEMO_ITEMS[1] },
    gold: worst ? 98765 : 42,
    party: worst ? [
      { id: 901, name: 'Abcdefghijkl', cls: 'mender', clsName: 'Mender', level: 11, hp: 1150, hpMax: 1210, hpFrac: 0.95, res: { kind: 'mana', cur: 760, max: 980, frac: 0.78 } },
      { id: 902, name: 'Wwwwwwwwwwww', cls: 'inkblade', clsName: 'Inkblade', level: 12, hp: 300, hpMax: 1100, hpFrac: 0.27, res: { kind: 'focus', cur: 40, max: 100, frac: 0.4 } },
      { id: 903, name: 'Mo', cls: 'wayfinder', clsName: 'Wayfinder', level: 9, hp: 0, hpMax: 900, hpFrac: 0, res: { kind: 'focus', cur: 100, max: 100, frac: 1 } },
    ] : [],
    level: worst ? 12 : null,
    talents: worst ? { warden_bulwark_iron_skin: 3, warden_bulwark_hold_the_line: 2, warden_oathblade_keen_edge: 1 } : null,
  };
}

/** Long system and combat lines for the chat box. */
export function demoLog(worst) {
  const L = [
    { ch: 'system', text: 'Entered Willowmere Valley.' },
    { ch: 'party', text: '[Party] Abcdefghijkl: Meet you at the bridge.' },
    { ch: 'say', text: 'Scott: On my way, grabbing a quest.' },
  ];
  if (worst) L.push(
    { ch: 'damage_out', text: 'Your Shield Bash hits Thornback Wolf for 214 (critical).' },
    { ch: 'damage_in', text: 'Thornback Wolf bites you for 87.' },
    { ch: 'heal', text: "Abcdefghijkl's Mend heals you for 142." },
    { ch: 'xp', text: 'You gain 1,240 experience (Return the Unwritten Page to Elder Mael in Willowmere).' },
    { ch: 'loot', text: 'You receive: Willowbark Cloak of the Lantern Road.' },
    { ch: 'error', text: 'Your bags are full.' },
  );
  return L;
}

// Quests into the dungeons and caves (dungeons build, 2026-11-22; D:/LQOnline/dungeons/BRIEF.md section 2). Plain data,
// the QUESTS shape (CONTRACTS 7.5). They are side quests: content.sideQuests lists them, the quest module offers them
// after the main chain and the bounties (src/sim/quests.js ORDER), and the main chain's order and count are unchanged.
//
// A short quest per cave, and a chain into each dungeon with its giver in the nearest hub: the Barrow from Thornfold
// (Brindle, then Tamsin), the Watchtower from Odo's hut (two steps here; the old "The Long Watch" is the third, its
// Sentinel now at the top of the tower). Rewards: a choice of three pieces that roll to class, the best in the band.
// Every `where` is the door on the world (or the giver): the tracker points you at the way in.
const at = (zone, tx, ty, rTiles) => ({ zone, x: Math.round(tx * 16 + 8), y: Math.round(ty * 16 + 8), r: Math.round(rTiles * 16) });
// the doors (src/data/dungeons.js), in their area's own tiles (Smugglers' Cut is in the wilds: world tiles)
const DOOR = {
  barrow: at('downs', 28, 7, 2), watchtower: at('moor', 117.5, 7, 2), rootcellar: at('valley', 91, 26, 2),
  smugglers_cut: at('world', 180, 168, 2), tarn_hollow: at('moor', 42, 47, 2),
  barrow_deep: at('downs', 28, 20, 2),          // cap 30: the stair under the cairn in the Standing Stones
};
const NPC = {
  cobb: at('valley', 31, 48, 1.5), pell: at('willowmere', 14, 27, 1.5), sorrel: at('moor', 82, 58, 1.5),
  brindle: at('downs', 95, 37, 1.5), tamsin: at('downs', 77, 33, 1.5), odo: at('moor', 106, 21, 1.5),
};

export const DUNGEON_QUESTS = {
  // ---------------------------------------------------------------------------------------------- the caves
  cv_mother_mudge: {
    id: 'cv_mother_mudge', num: 25, name: 'Gone to Ground', level: 5, minLevel: 4, zone: 'valley',
    giver: 'cobb', turnIn: 'cobb', place: 'rootcellar',
    requires: { quests: [], cls: null, level: 4 },
    chain: { id: 'rootcellar', step: 1 },
    objectives: [
      { kind: 'kill', mob: 'mother_mudge', count: 1, where: [DOOR.rootcellar], label: 'Old Mother Mudge driven out (Rootcellar Den)' },
      { kind: 'collect', item: 'cellar_door_key', count: 1, where: [DOOR.rootcellar], label: 'Cellar Door Key' },
    ],
    rewards: { xp: 740, gold: 25, items: [], choice: ['cobbs_good_gloves', 'sow_hide_leggings', 'turnip_charm'] },
    rewardRarity: 'magic',
    text: {
      offer: "My old sow, Mother Mudge, broke her pen and went to ground in the root cellar by Whisperwood. Took the cellar key with her, round her neck, don't ask me how. She's had a litter down there and she bites. Bring me that key and I'll make it worth the walk.",
      progress: 'Is she still down there? She will be. She likes it. It is full of turnips.',
      complete: "That's my key! Smells like a pig, but it turns. You've a good arm on you. Here, take one of these, they did me no good in the cellar anyway.",
    },
    giveOnAccept: [],
  },
  cv_lantern_oil: {
    id: 'cv_lantern_oil', num: 26, name: 'Every Last Drop', level: 8, minLevel: 7, zone: 'willowmere',
    giver: 'pell', turnIn: 'pell', place: 'smugglers_cut',
    requires: { quests: [], cls: null, level: 7 },
    chain: { id: 'smugglers_cut', step: 1 },
    objectives: [
      { kind: 'collect', item: 'stolen_oil_flask', count: 3, where: [DOOR.smugglers_cut], label: 'Flasks of Lantern Oil' },
      { kind: 'kill', mob: 'gutterwick', count: 1, where: [DOOR.smugglers_cut], label: "Gutterwick the Oil-Drinker (Smugglers' Cut)" },
    ],
    rewards: { xp: 1250, gold: 33, items: [], choice: ['pells_spare_lamp', 'oilcloth_hood', 'wick_trimmers_gloves'] },
    rewardRarity: 'magic',
    text: {
      offer: "Smugglers took a whole cart of my lamp oil off Gate Road South and hid it in the cut in the cliff. I went to look. Something in there is DRINKING it. Something big and black and glad about it. Get me back what you can, and stop whatever is doing the drinking.",
      progress: 'Any oil? Even a little? The lamps on the square go dark at the third bell without it.',
      complete: 'Three flasks! And the drinker is done drinking? Then the square stays lit tonight. Pick something, you earned it. Mind, that one is still warm.',
    },
    giveOnAccept: [],
  },
  cv_drowned_shrine: {
    id: 'cv_drowned_shrine', num: 27, name: 'The Bell Under the Tarn', level: 15, minLevel: 14, zone: 'moor',
    giver: 'sorrel', turnIn: 'sorrel', place: 'tarn_hollow',
    requires: { quests: [], cls: null, level: 14 },
    chain: { id: 'tarn_hollow', step: 1 },
    objectives: [
      { kind: 'kill', mob: 'hollowfang', count: 1, where: [DOOR.tarn_hollow], label: 'Hollowfang, Alpha of the Mist (Tarn Hollow)' },
      { kind: 'collect', item: 'shrine_bell_shard', count: 4, where: [DOOR.tarn_hollow], label: 'Shrine Bell Shards' },
    ],
    rewards: { xp: 2900, gold: 49, items: [], choice: ['sorrels_peat_boots', 'drowned_shrine_charm', 'reedwoven_mantle'] },
    rewardRarity: 'magic',
    text: {
      offer: "There's a hollow under the south shore of the tarn, and an old shrine in it, half under the water. The mist comes out of there in the mornings, and the wolves with it. My gran said the shrine bell kept the mist down. The bell is in pieces now. Bring me the pieces, and see to the big wolf that sleeps on them.",
      progress: 'The mist was thick again this morning. I could not see my own turf stack.',
      complete: 'Four pieces. That is near enough the whole bell. I will have it mended in the spring. And the big wolf? Good. The mornings will be clear. Take one of these for your trouble.',
    },
    giveOnAccept: [],
  },

  // ---------------------------------------------------------------------------------------------- the Wethers' Barrow
  dg_barrow_count: {
    id: 'dg_barrow_count', num: 28, name: 'A Count Gone Wrong', level: 10, minLevel: 9, zone: 'downs',
    giver: 'brindle', turnIn: 'tamsin', place: 'barrow',
    requires: { quests: [], cls: null, level: 9 },
    chain: { id: 'barrow', step: 1 },
    objectives: [
      { kind: 'talk', npc: 'tamsin', where: [NPC.tamsin], label: 'Ask Tamsin about the barrow' },
    ],
    rewards: { xp: 1000, gold: 30, items: [], choice: [] },
    rewardRarity: 'magic',
    text: {
      offer: "Every night this week I count my flock in and come up one short. Every morning they're all there. Tamsin says the counting comes up out of the barrow by the Stones. She knows the old stories. Go and ask her, before I start counting in my sleep.",
      progress: "Tamsin is at the loom house. She'll talk your ear off about the old reeve. Let her.",
      complete: "The barrow under the Stones is the Wethers' Barrow. The old reeve was buried there with his flock and his tallies, because he never once got the count right. Now the door stands open, and he is counting again. He will not stop until it comes out right.",
    },
    giveOnAccept: [],
  },
  dg_barrow_bell_and_tally: {
    id: 'dg_barrow_bell_and_tally', num: 29, name: 'Bell and Tally', level: 11, minLevel: 10, zone: 'downs',
    giver: 'tamsin', turnIn: 'tamsin', place: 'barrow',
    requires: { quests: ['dg_barrow_count'], cls: null, level: 10 },
    chain: { id: 'barrow', step: 2 },
    objectives: [
      { kind: 'kill', mob: 'barrow_bellwether', count: 1, where: [DOOR.barrow], label: "The Bellwether (Wethers' Barrow)" },
      { kind: 'kill', mob: 'barrow_tallywife', count: 1, where: [DOOR.barrow], label: "The Tally-Wife (Wethers' Barrow)" },
    ],
    rewards: { xp: 1870, gold: 41, items: [], choice: [] },
    rewardRarity: 'magic',
    text: {
      offer: "Two helped him with his counting in life. The Bellwether led the flock through the gate so he could count them as they passed, and the Tally-Wife cut a notch in a stick for each one. They are down there still. Put them to rest, and the reeve has nobody left to count with.",
      progress: 'Can you hear the bell from here? I can, some nights.',
      complete: 'The bell is quiet and the sticks are cut no more. Brindle slept the whole night through. Now there is only the reeve himself.',
    },
    giveOnAccept: [],
  },
  dg_barrow_one_short: {
    id: 'dg_barrow_one_short', num: 30, name: 'One Short', level: 12, minLevel: 10, zone: 'downs', elite: true,
    giver: 'tamsin', turnIn: 'tamsin', place: 'barrow',
    requires: { quests: ['dg_barrow_count'], cls: null, level: 10 },
    chain: { id: 'barrow', step: 3 },
    objectives: [
      { kind: 'kill', mob: 'barrow_reeve', count: 1, where: [DOOR.barrow], label: "The Barrow Reeve (Wethers' Barrow)" },
    ],
    rewards: { xp: 2100, gold: 60, items: [], choice: ['brindles_second_best_coat', 'ring_count_helm', 'thirteen_stone_charm'] },
    rewardRarity: 'magic',
    text: {
      offer: "The reeve is at the far end of the barrow, counting names, and he always comes up one short. I think the one he is missing is himself. Somebody has to go down and be counted, and then stop him for good. Take a friend if you have one. Take two.",
      progress: 'He will count you. Do not answer him.',
      complete: 'Twelve names and the reeve makes thirteen. The count came out right at last. Brindle asked me to give you one of these, and he says the coat is his second best, which from Brindle is a great deal.',
    },
    giveOnAccept: [],
  },

  // ---------------------------------------------------------------------------------------------- the Watchtower
  dg_tower_door: {
    id: 'dg_tower_door', num: 31, name: 'The Tower Door', level: 18, minLevel: 17, zone: 'moor',
    giver: 'odo', turnIn: 'odo', place: 'watchtower',
    requires: { quests: [], cls: null, level: 17 },
    chain: { id: 'watchtower', step: 1 },
    objectives: [
      { kind: 'explore', zone: 'watchtower', area: 'tower_foot', where: [DOOR.watchtower], label: 'Look inside the Watchtower door' },
    ],
    rewards: { xp: 2500, gold: 50, items: [], choice: [] },
    rewardRarity: 'magic',
    text: {
      offer: "The Sentinel has gone inside the tower. I rang the eighth post and it did not come out to answer, so it has gone up the stair to its lamps. The tower door is open. Have a look inside, only a look, and come and tell me what is keeping the stair.",
      progress: 'Just a look. The door is at the foot of the tower, north of here.',
      complete: 'Lamps, and things that tend the lamps, all the way up. The Wickwright and the Captain of the Stair. They kept the tower when there were keepers. They keep it still.',
    },
    giveOnAccept: [],
  },
  dg_tower_lamps_out: {
    id: 'dg_tower_lamps_out', num: 32, name: 'Lamps Out', level: 19, minLevel: 17, zone: 'moor',
    giver: 'odo', turnIn: 'odo', place: 'watchtower',
    requires: { quests: ['dg_tower_door'], cls: null, level: 17 },
    chain: { id: 'watchtower', step: 2 },
    objectives: [
      { kind: 'kill', mob: 'watch_wickwright', count: 1, where: [DOOR.watchtower], label: 'The Wickwright (the Watchtower)' },
      { kind: 'kill', mob: 'watch_stair_captain', count: 1, where: [DOOR.watchtower], label: 'Captain of the Stair (the Watchtower)' },
    ],
    rewards: { xp: 4500, gold: 70, items: [], choice: ['odos_chime_cord', 'stair_climbers_boots', 'tower_guard_gauntlets'] },
    rewardRarity: 'magic',
    text: {
      offer: "Nobody reaches the Sentinel while the Wickwright keeps the lamps lit and the Captain keeps the stair. Put out the one and get past the other. I will ring the post while you climb. If the chime reaches you, the Sentinel will hear it too, and it never liked my chime.",
      progress: 'I rang the post an hour ago. Did you hear it? You must have heard it.',
      complete: "The lamps are out on the gallery and the stair is clear. All that is left is the top of the tower. Take this. I made the cord from an old chime rope, it brings luck, mostly.",
    },
    giveOnAccept: [],
  },
  // ---------------------------------------------------------------------------------------------- the Barrow Deep Halls (cap 30)
  // Tamsin again (Thornfold): the barrow she sent you into at 10 goes on down, under the drove roads. XP: the PROGRESSION
  // 2.2 formula at the quest level, size about 1.1 (the Watchtower chain's).
  dg_deep_drove_roads: {
    id: 'dg_deep_drove_roads', num: 330, name: 'Under the Drove Roads', level: 27, minLevel: 26, zone: 'downs',
    giver: 'tamsin', turnIn: 'tamsin', place: 'barrow_deep',
    requires: { quests: [], cls: null, level: 26 },
    chain: { id: 'barrow_deep', step: 1 },
    objectives: [
      { kind: 'kill', mob: 'deep_drove_herd', count: 1, where: [DOOR.barrow_deep], label: 'The Drove-Herd (the Barrow Deep Halls)' },
      { kind: 'kill', mob: 'deep_cairn_counter', count: 1, where: [DOOR.barrow_deep], label: 'The Cairn-Counter (the Barrow Deep Halls)' },
    ],
    rewards: { xp: 7950, gold: 110, items: [], choice: ['deep_halls_signet', 'stone_counters_gloves', 'drove_road_boots'] },
    rewardRarity: 'magic',
    text: {
      offer: "The cairn in the middle of the Stones has a stair under it now. It was not there last spring. The old drovers said the Barrow went on under the roads, further than anyone dug, and that the flocks that went in were still being driven down there. Brindle swears he hears hooves under the fold at night. Go down. Find what drives them, and what keeps count of the ones who never came back.",
      progress: 'The hooves again last night. Under the fold, under the road, all the way to the Stones.',
      complete: "The herd is scattered and the cairn is finished. Brindle slept, and so did the sheep. There is one more down there, I think. The one they were all counting for.",
    },
    giveOnAccept: [],
  },
  dg_deep_kings_count: {
    id: 'dg_deep_kings_count', num: 331, name: "The King's Count", level: 29, minLevel: 28, zone: 'downs', elite: true,
    giver: 'tamsin', turnIn: 'tamsin', place: 'barrow_deep',
    requires: { quests: ['dg_deep_drove_roads'], cls: null, level: 28 },
    chain: { id: 'barrow_deep', step: 2 },
    objectives: [
      { kind: 'kill', mob: 'deep_barrow_king', count: 1, where: [DOOR.barrow_deep], label: 'The Barrow-King (the Barrow Deep Halls)' },
    ],
    rewards: { xp: 8950, gold: 140, items: [], choice: ['kings_road_greaves', 'barrow_lamp_charm', 'ninefold_hood'] },
    rewardRarity: 'magic',
    text: {
      offer: "At the bottom of the Deep Halls sits the first name the Barrow ever counted. A king, the drovers called him, though nobody remembers of what. Every name in the Barrow was counted for him, and he will not let the count end. End it. Take friends. Take all the friends you have.",
      progress: 'He will tell you to kneel. Do not kneel.',
      complete: "The count is done. All of it, all the way down. You can hear the quiet from here, if you listen. Pick one of these. The drovers left them at the Stones for whoever finished the count, and I kept them for a long time.",
    },
    giveOnAccept: [],
  },
};
export const DUNGEON_QUEST_ORDER = Object.keys(DUNGEON_QUESTS);

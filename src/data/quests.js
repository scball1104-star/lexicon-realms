// Lexicon Realms quests: the 24 quests of Willowmere, Shepherd's Downs and the High Moor.
// Source of truth: docs/design/ZONES_QUESTS.md sections 5.1 (list), 5.2 (text), 5.3 (hook), 5.6 (quest items).
// Plain data. Objective kinds: talk, kill, collect, deliver, explore, escort.
//
// where (CONTRACTS 7.5, fix pass 1, critique 9): every objective names one or more circles { zone, x, y, r } in PIXELS
// where it is done (the camp, the nodes, the area, the npc); the HUD tracker rows carry them for the map and minimap.
// Authored here in tiles with at(); tools/maps/quest_where.mjs suggests them from the zone data after spawns move.
const at = (zone, tx, ty, rTiles) => ({ zone, x: Math.round(tx * 16 + 8), y: Math.round(ty * 16 + 8), r: Math.round(rTiles * 16) });

export const QUESTS = {
  // ---------------------------------------------------------------------------------------------
  // Valley chain (Willowmere and the valley, levels 1 to 6)
  // ---------------------------------------------------------------------------------------------
  wm_name_twice: {
    id: 'wm_name_twice', num: 1, name: 'A Name Written Twice', level: 1, minLevel: 1, zone: 'willowmere',
    giver: 'hob', turnIn: 'mael',
    requires: { quests: [], cls: null, level: 1 },
    chain: { id: 'valley', step: 1 },
    objectives: [
      { kind: 'talk', npc: 'mael', where: [at('willowmere', 24, 18, 1.5)], label: 'Speak with Elder Mael' },
    ],
    rewards: { xp: 100, gold: 5, items: [], choice: [] },
    rewardRarity: 'magic',
    text: {
      offer: "There. Written you in twice, in case the first one wanders off. Bed's upstairs, breakfast is whenever Oren says. Elder Mael likes to meet anyone who sleeps under a Willowmere roof. He's at the well, worrying at the sky. Go on, he doesn't bite. His knees do.",
      progress: "Mael's at the well. Can't miss him. He's the one frowning at clouds.",
      complete: "Welcome. These knees have opinions about stairs, so you will forgive me for not rising. Willowmere keeps names. Yours is safe here. Now, Oren at the bakery has slimes in his yard again, and Cobb and Pell could use a hand. When you have your feet under you, Bram at the south gate wants a sword arm, and Mira wants a careful copyist.",
    },
    giveOnAccept: [],
  },

  wm_yard_slimes: {
    id: 'wm_yard_slimes', num: 2, name: 'Not My Starter', level: 1, minLevel: 1, zone: 'valley',
    giver: 'oren', turnIn: 'oren',
    requires: { quests: ['wm_name_twice'], cls: null, level: 1 },
    chain: { id: 'valley', step: 2 },
    objectives: [
      { kind: 'kill', mob: 'ink_slime', count: 6, where: [at('valley', 15.5, 50.5, 13)], label: 'Ink Slimes slain' },
    ],
    rewards: { xp: 240, gold: 9, items: [], choice: ['flour_dusted_gloves', 'bakers_charm'] },
    rewardRarity: 'magic',
    text: {
      offer: "Ink slimes in the south meadow again, bold as bread. One got into my yard and ate a whole tray of rolls. Not my starter, mind. Mine only ever bit bread, and it's paler. Clear out half a dozen and I'll owe you a roll a day.",
      progress: "Still slimes in the meadow? I can hear them from here. Squelching. Rudely.",
      complete: "Six! Habit is a stubborn kind of love, and so is breakfast. Here.",
    },
    giveOnAccept: [],
  },

  wm_cobbs_hens: {
    id: 'wm_cobbs_hens', num: 3, name: 'Every Hen Has a Name', level: 2, minLevel: 1, zone: 'valley',
    giver: 'cobb', turnIn: 'cobb',
    requires: { quests: ['wm_name_twice'], cls: null, level: 1 },
    chain: { id: 'valley', step: 3 },
    objectives: [
      { kind: 'collect', item: 'stray_hen', count: 5, where: [at('valley', 36.5, 55, 7.5)], label: 'Hens found' },
    ],
    rewards: { xp: 350, gold: 13, items: [], choice: ['cobbs_old_boots'] },
    rewardRarity: 'magic',
    text: {
      offer: "Fence went down in the night and my hens went with it. Five of them. I named every one, and I'll know them when I see them. Henrietta's the bossy one. Bertha sits on things. Mind the beetles in the barley, they don't like being stepped on.",
      progress: "Any hens? Bertha will be sitting on something. Look under anything flat.",
      complete: "Henrietta. Bertha. And the other three, whose names I definitely know. Thank you.",
    },
    giveOnAccept: [],
  },

  wm_pells_crate: {
    id: 'wm_pells_crate', num: 4, name: 'Labeled Twice', level: 2, minLevel: 1, zone: 'valley',
    giver: 'pell', turnIn: 'penny',
    requires: { quests: ['wm_name_twice'], cls: null, level: 1 },
    chain: { id: 'valley', step: 4 },
    objectives: [
      { kind: 'deliver', item: 'pells_crate', to: 'penny', where: [at('valley', 57, 42, 1.5)], label: 'Deliver the crate to Penny' },
    ],
    rewards: { xp: 210, gold: 13, items: [], choice: ['penny_s_lucky_button'] },
    rewardRarity: 'magic',
    text: {
      offer: "This crate is for my sister Penny, at her cart over the stone bridge. It says LAMP OIL. And under that it says LAMP OIL, because I labeled the label. Please do not open it. Please do not drop it. Please tell her I am not worried.",
      progress: "The crate is still upright? Good. Not worried. Just asking. Twice.",
      complete: "He's worried. I sell. Lamp oil, is it? It's soap. It's always soap.",
    },
    giveOnAccept: [{ item: 'pells_crate', qty: 1 }],
  },

  wm_pilgrim_wolves: {
    id: 'wm_pilgrim_wolves', num: 5, name: 'Wolves on the Pilgrim Road', level: 3, minLevel: 3, zone: 'valley',
    giver: 'bram', turnIn: 'bram',
    requires: { quests: ['wm_name_twice'], cls: null, level: 3 },
    chain: { id: 'valley', step: 5 },
    objectives: [
      { kind: 'kill', mob: 'briar_wolf', count: 8, where: [at('valley', 66, 31, 9)], label: 'Briar Wolves slain' },
    ],
    rewards: { xp: 460, gold: 17, items: [], choice: ['gate_guard_shield', 'guardhouse_bow', 'watch_rod'] },
    rewardRarity: 'magic',
    text: {
      offer: "Right. Briar wolves are working the pilgrim road in pairs again. They come to you, so let them, and be ready when they do. Eight should send the rest back to the trees. Somebody has to keep that road open, and Holt says it isn't me today.",
      progress: "How's the road? Let them come to you. Pairs, remember. Always pairs.",
      complete: "Eight. Good. Pilgrims will thank you. Quill will copy it down. Twice. Nella at the ferry is looking for her Lark again, Garrick wants a word about your weapon, and Holt has a job past the west gate.",
    },
    giveOnAccept: [],
  },

  wm_keeper_marks: {
    id: 'wm_keeper_marks', num: 6, name: 'Forty-One Letters', level: 3, minLevel: 3, zone: 'valley',
    giver: 'mira', turnIn: 'mira',
    requires: { quests: ['wm_name_twice'], cls: null, level: 3 },
    chain: { id: 'valley', step: 6 },
    objectives: [
      { kind: 'explore', zone: 'valley', area: 'the_fork', where: [at('valley', 50.5, 22.5, 7)], label: 'Read the milestone at the Fork' },
      { kind: 'explore', zone: 'valley', area: 'north_landing', where: [at('valley', 40.5, 9.5, 5)], label: 'Read the bell post at the north landing' },
      { kind: 'explore', zone: 'valley', area: 'archive_door', where: [at('valley', 45.5, 3.5, 6)], label: 'Copy the door carving' },
    ],
    rewards: { xp: 460, gold: 17, items: [], choice: ['mira_s_spare_quill', 'copying_gloves'] },
    rewardRarity: 'magic',
    text: {
      offer: "I'm copying every Keeper carving in the valley before the weather takes them. The milestone at the fork. The bell post at the north landing. And the door under the Mother Willow. Copy them exactly, please. I counted the letters on the door last spring. Forty-one. If you count forty, count again.",
      progress: "Did you copy them exactly? Every letter? Count the door again, just in case.",
      complete: "Forty-one. Thank you. 'Speak, and be kept.' I've always wondered who it means. Quill was at the milestone this morning, and he looked like a man missing pages.",
    },
    giveOnAccept: [],
  },

  wm_copied_twice: {
    id: 'wm_copied_twice', num: 7, name: 'Copy Everything Twice', level: 4, minLevel: 3, zone: 'valley',
    giver: 'quill', turnIn: 'quill',
    requires: { quests: ['wm_keeper_marks'], cls: null, level: 3 },
    chain: { id: 'valley', step: 7 },
    objectives: [
      { kind: 'collect', item: 'quills_copy', count: 6, where: [at('valley', 41.5, 10.5, 9), at('valley', 70, 56, 10)], label: "Quill's pages recovered" },
    ],
    rewards: { xp: 590, gold: 21, items: [], choice: ['scribes_satchel_strap', 'ink_stained_charm'] },
    rewardRarity: 'magic',
    text: {
      offer: "The wind took my copies off the milestone this morning, every page, and the slimes at the north landing have been eating them. Ink to ink, I suppose. I copy every name twice, as a rule. A name is harder to lose when it is written somewhere else. Six pages, please. Soggy is fine.",
      progress: "Any pages? Soggy is fine. Chewed is fine. Mostly chewed is still fine.",
      complete: "Soggy is fine. I will copy them again tonight. Twice.",
    },
    giveOnAccept: [],
  },

  wm_lark_wanders: {
    id: 'wm_lark_wanders', num: 8, name: 'Lark Wanders', level: 5, minLevel: 3, zone: 'valley',
    giver: 'nella', turnIn: 'nella',
    requires: { quests: ['wm_pilgrim_wolves'], cls: null, level: 3 },
    chain: { id: 'valley', step: 8 },
    objectives: [
      {
        kind: 'escort', npc: 'lark_escort',
        from: { zone: 'valley', x: 88, y: 26 },
        to: { zone: 'valley', x: 44, y: 42, r: 4 },
        fail: 'death',
        ambush: [
          // fix pass 1: level 4 adds (a level 3 to 5 hero takes the escort, often with a camp on the way); the sim puts
          // them on walkable cells near her (src/sim/quests.js ambushSpots)
          { at: { x: 74, y: 30, r: 3 }, mobs: [{ mob: 'thornback_wolf', level: 4 }, { mob: 'thornback_wolf', level: 4 }] },
          { at: { x: 60, y: 38, r: 3 }, mobs: [{ mob: 'thornback_wolf', level: 4 }, { mob: 'thornback_wolf', level: 4 }] },
        ],
        where: [at('valley', 88, 26, 3), at('valley', 44, 42, 4)], label: 'Bring Lark home',
      },
    ],
    rewards: { xp: 890, gold: 25, items: [], choice: ['ferrymenders_coat', 'rope_singer_charm'] },
    rewardRarity: 'magic',
    text: {
      offer: "Lark's gone after that duck again. The Duke. A duck of low character. She chased him up the east bank to the Whisperwood, and the wolves are thick there this week. Bring her home. She'll say she was winning. Let her.",
      progress: "No Lark yet? Follow the quacking. Then follow the shouting.",
      complete: "Lark. Inside. Now. (A look that softens.) Thank you. I'll name a rope for you.",
    },
    giveOnAccept: [],
  },

  wm_rhythm_of_the_forge: {
    id: 'wm_rhythm_of_the_forge', num: 9, name: 'Respect the Rhythm', level: 5, minLevel: 3, zone: 'valley',
    giver: 'garrick', turnIn: 'garrick',
    requires: { quests: ['wm_pilgrim_wolves'], cls: null, level: 3 },
    chain: { id: 'valley', step: 9 },
    objectives: [
      { kind: 'collect', item: 'thornback_hide', count: 6, where: [at('valley', 84.5, 15, 13), at('valley', 85.5, 40, 7)], label: 'Thornback hides' },
    ],
    rewards: { xp: 740, gold: 25, items: [], choice: ['garricks_gate_sword', 'garricks_twin_knives', 'garricks_ash_bow', 'garricks_iron_rod'] },
    rewardRarity: 'magic',
    text: {
      offer: "Do not rush a forge. Do not rush a fight. (He looks at your weapon a long time.) That will not do. Thornback hides make good grip-wraps. Six. The wolves at the Whisperwood edge wear them well. Bring them, and I will make you something that will.",
      progress: "Six hides. Not five. Respect the rhythm.",
      complete: "Hold it. Feel the balance. Respect the rhythm, and come home.",
    },
    giveOnAccept: [],
  },

  wm_west_gate: {
    id: 'wm_west_gate', num: 10, name: 'Wool Is Late', level: 6, minLevel: 4, zone: 'downs',
    giver: 'holt', turnIn: 'brindle',
    requires: { quests: ['wm_pilgrim_wolves'], cls: null, level: 4 },
    chain: { id: 'valley', step: 10 },
    objectives: [
      { kind: 'talk', npc: 'brindle', where: [at('downs', 95, 37, 1.5)], label: 'Speak with Brindle in Thornfold' },
    ],
    rewards: { xp: 450, gold: 29, items: [], choice: [] },
    rewardRarity: 'magic',
    text: {
      offer: "Thornfold's wool cart comes in every week, regular as the bells. Not this week. Not last week either. Old Brindle up on the Downs keeps the fold. Out the west gate, follow the lane to the signpost. Tell him Holt asked after him. He'll pretend not to know who that is.",
      progress: "West gate, then the lane to the signpost. Brindle will be at the fold.",
      complete: "Holt. Never heard of him. Tell him the wool is coming. Now. Wolves at the ford, and something in the old fold. And Tamsin at the Loom House is short of fleece.",
    },
    giveOnAccept: [],
  },

  // ---------------------------------------------------------------------------------------------
  // Downs chain (Shepherd's Downs, levels 5 to 10)
  // ---------------------------------------------------------------------------------------------
  dn_name_in_the_hem: {
    id: 'dn_name_in_the_hem', num: 11, name: 'A Name in the Hem', level: 6, minLevel: 4, zone: 'downs',
    giver: 'tamsin', turnIn: 'tamsin',
    requires: { quests: ['wm_west_gate'], cls: null, level: 4 },
    chain: { id: 'downs', step: 1 },
    objectives: [
      { kind: 'collect', item: 'fold_fleece', count: 8, where: [at('downs', 111.5, 9.5, 8), at('downs', 125.5, 9, 8.5), at('downs', 136, 10.5, 9.5), at('downs', 48, 46, 7)], label: 'Fold fleece gathered' },
    ],
    rewards: { xp: 890, gold: 29, items: [], choice: ['hemmed_mantle_cloak'] },
    rewardRarity: 'magic',
    text: {
      offer: "Hold still. Ah. There. That stitch is older than my mother. I sew a name into every cloth I sell, so it finds its way home. I'm short of fleece for the hems. The rams in the pasture will spare a tuft, if you ask them kindly from close up. From far off, they ask you.",
      progress: "Fleece? Ask the rams close up. From far off, they do the asking.",
      complete: "Eight. Good, clean wool. Your name goes in the hem of this one.",
    },
    giveOnAccept: [],
  },

  dn_wolves_at_the_ford: {
    id: 'dn_wolves_at_the_ford', num: 12, name: 'Wolves at the Ford', level: 7, minLevel: 5, zone: 'downs',
    giver: 'brindle', turnIn: 'brindle',
    requires: { quests: ['wm_west_gate'], cls: null, level: 5 },
    chain: { id: 'downs', step: 2 },
    objectives: [
      { kind: 'kill', mob: 'thornback_wolf', count: 8, where: [at('downs', 92, 56.5, 5), at('downs', 114, 58.5, 5), at('downs', 118, 72.5, 5), at('downs', 92, 78.5, 5), at('downs', 130, 66.5, 5)], label: 'Thornback Wolves slain' },
    ],
    rewards: { xp: 1070, gold: 33, items: [], choice: ['drovers_leggings', 'fold_gate_greaves', 'shepherds_wrap'] },
    rewardRarity: 'magic',
    text: {
      offer: "Twelve in the fold. Twelve is right. Twelve is always right. But the thornbacks have come down to the ford in threes, and the drovers will not cross. A sheep knows its whistle. A wolf knows its chance. Take its chance away.",
      progress: "Still wolves at the ford? The drovers are waiting. So are the sheep.",
      complete: "Quiet at the ford. I whistled twelve times and got twelve back. Wool cart leaves tomorrow.",
    },
    giveOnAccept: [],
  },

  dn_black_in_the_fold: {
    id: 'dn_black_in_the_fold', num: 13, name: 'Something Black in the Old Fold', level: 7, minLevel: 5, zone: 'downs',
    giver: 'brindle', turnIn: 'brindle',
    requires: { quests: ['wm_west_gate'], cls: null, level: 5 },
    chain: { id: 'downs', step: 3 },
    objectives: [
      { kind: 'kill', mob: 'ink_blot', count: 6, where: [at('downs', 25.5, 55.5, 10.5)], label: 'Ink Blots slain' },
      { kind: 'collect', item: 'ink_soaked_hay', count: 4, where: [at('downs', 25, 54, 12)], label: 'Ink-soaked hay' },
    ],
    rewards: { xp: 1070, gold: 33, items: [], choice: ['old_fold_helm', 'hawthorn_charm'] },
    rewardRarity: 'magic',
    text: {
      offer: "There is ink coming up through the hay in the old fold, west of here. Black, and it moves. My grandfather said that fold was older than the hamlet. Clear the blots and bring me some of the hay. I want to see it in daylight.",
      progress: "The hay. I want it in daylight. The blots can stay in the dark.",
      complete: "It's ink. Real ink, like off a page. What would a page be doing under a sheep fold?",
    },
    giveOnAccept: [],
  },

  dn_eleven_pockets: {
    id: 'dn_eleven_pockets', num: 14, name: 'Patch Has Eleven Pockets', level: 8, minLevel: 6, zone: 'downs',
    giver: 'tamsin', turnIn: 'tamsin',
    requires: { quests: ['dn_name_in_the_hem'], cls: null, level: 6 },
    chain: { id: 'downs', step: 4 },
    objectives: [
      { kind: 'collect', item: 'pocket_button', count: 6, where: [at('downs', 78, 8, 11.5)], label: 'Pocket buttons recovered' },
    ],
    rewards: { xp: 1250, gold: 37, items: [], choice: ['scarecrow_gloves', 'crow_feather_charm'] },
    rewardRarity: 'magic',
    text: {
      offer: "Patch is the scarecrow on the ridge. Eleven pockets, and in every pocket a button with a family's mark, so the crows know whose field they're stealing from. The crows have emptied six. They fly off when they're caught, the cheats. Six buttons, please.",
      progress: "Buttons? Don't let the crows run off with them. Cheats, the lot.",
      complete: "Six. I'll sew them back on. Patch counts them, you know. Nobody believes me.",
    },
    giveOnAccept: [],
  },

  dn_cold_at_the_stones: {
    id: 'dn_cold_at_the_stones', num: 15, name: 'Something Counts Down There', level: 8, minLevel: 6, zone: 'downs',
    giver: 'brindle', turnIn: 'brindle',
    requires: { quests: ['dn_wolves_at_the_ford'], cls: null, level: 6 },
    chain: { id: 'downs', step: 5 },
    objectives: [
      { kind: 'kill', mob: 'barrow_shade', count: 6, where: [at('downs', 28, 20.5, 18)], label: 'Barrow Shades slain' },
    ],
    rewards: { xp: 1250, gold: 37, items: [], choice: ['ring_stone_boots', 'shade_ward_bell', 'chilled_buckler'] },
    rewardRarity: 'magic',
    text: {
      offer: "Cold at the Stones these nights. Shades walk the ring, and in the barrow under it something counts, and always comes up one short. I've not slept. The stones want their names said, not read. Do something about the shades, and I'll do something about my nerves.",
      progress: "Still cold at the Stones? I counted the fold twice. Twelve. Still not sleeping.",
      complete: "Quiet. For now. I don't like that the stones look paler. Do you? Tell Tamsin. She'll want their names in thread before they fade.",
    },
    giveOnAccept: [],
  },

  dn_rubbings: {
    id: 'dn_rubbings', num: 16, name: 'Hold Still, Stone', level: 9, minLevel: 7, zone: 'downs',
    giver: 'tamsin', turnIn: 'tamsin',
    requires: { quests: ['dn_cold_at_the_stones'], cls: null, level: 7 },
    chain: { id: 'downs', step: 6 },
    objectives: [
      { kind: 'collect', item: 'stone_rubbing', count: 4, where: [at('downs', 28, 21, 10)], label: 'Stone rubbings taken' },
    ],
    rewards: { xp: 1440, gold: 41, items: [], choice: ['rubbing_cloth_robe', 'stonewright_hauberk', 'fold_leather_vest', 'kept_plate'] },
    rewardRarity: 'magic',
    text: {
      offer: "Brindle says the stones are paling. Then I want their names in cloth before they go any paler. Take four rubbings, any four, and I'll stitch them into the sampler on my wall. A stitch remembers. The shades won't like you standing still. Neither do I, much.",
      progress: "Four rubbings, any four. Hold still for the stone, not for the shades.",
      complete: "Four names, in thread. The sampler's darker already. Good. Something in it is holding.",
    },
    giveOnAccept: [],
  },

  dn_ridge_path: {
    id: 'dn_ridge_path', num: 17, name: 'Odo Has Not Come Down', level: 9, minLevel: 7, zone: 'moor',
    giver: 'brindle', turnIn: 'odo',
    requires: { quests: ['dn_wolves_at_the_ford'], cls: null, level: 7 },
    chain: { id: 'downs', step: 7 },
    objectives: [
      { kind: 'talk', npc: 'odo', where: [at('moor', 106, 21, 1.5)], label: 'Find Odo on the High Moor' },
    ],
    rewards: { xp: 720, gold: 41, items: [], choice: [] },
    rewardRarity: 'magic',
    text: {
      offer: "Odo keeps the chimes on the High Moor. Comes down for his wool the first of every month. Not this month. Through the gap on the Ridge, follow the chime posts to the tower. He'll be in a turf hut beneath it, talking to himself. He calls it company.",
      progress: "Through the Ridge gap, then the chime posts. Listen for a man talking to himself.",
      complete: "Brindle sent you. He worries. I am fine. The chimes are not.",
    },
    giveOnAccept: [],
  },

  // ---------------------------------------------------------------------------------------------
  // Moor chain (the High Moor, levels 10 to 15)
  // ---------------------------------------------------------------------------------------------
  mo_fifty_paces: {
    id: 'mo_fifty_paces', num: 18, name: 'Fifty Paces', level: 10, minLevel: 8, zone: 'moor',
    giver: 'odo', turnIn: 'odo',
    requires: { quests: ['dn_ridge_path'], cls: null, level: 8 },
    chain: { id: 'moor', step: 1 },
    objectives: [
      { kind: 'explore', zone: 'moor', area: 'chime_post_2', where: [at('moor', 42, 73.5, 2.5)], label: 'Chime post 2 rung' },
      { kind: 'explore', zone: 'moor', area: 'chime_post_3', where: [at('moor', 21, 56.5, 2.5)], label: 'Chime post 3 rung' },
      { kind: 'explore', zone: 'moor', area: 'chime_post_4', where: [at('moor', 12, 33.5, 2.5)], label: 'Chime post 4 rung' },
      { kind: 'explore', zone: 'moor', area: 'chime_post_5', where: [at('moor', 21, 16.5, 2.5)], label: 'Chime post 5 rung' },
    ],
    rewards: { xp: 1650, gold: 45, items: [], choice: ['chime_walkers_boots', 'heather_charm'] },
    rewardRarity: 'magic',
    text: {
      offer: "Every dawn I walk the nine posts and say each word aloud. Fifty paces apart. Follow them or do not. My legs have stopped agreeing with the second to the fifth. Touch them for me. Let them ring. Mind the mist; the wolves wear it.",
      progress: "I am listening for them. Two, three, four, five. Not yet. Odo, be patient.",
      complete: "I heard every one from here. Two, three, four, five. Good words. Still there. Sorrel cuts peat down by the tarn overlook. She has boar trouble, and she will not ask.",
    },
    giveOnAccept: [],
  },

  mo_mist_pack: {
    id: 'mo_mist_pack', num: 19, name: 'The Mist Pack', level: 11, minLevel: 9, zone: 'moor',
    giver: 'odo', turnIn: 'odo',
    requires: { quests: ['mo_fifty_paces'], cls: null, level: 9 },
    chain: { id: 'moor', step: 2 },
    objectives: [
      { kind: 'kill', mob: 'mist_wolf', count: 10, where: [at('moor', 50.5, 70.5, 4.5), at('moor', 30.5, 66.5, 4.5), at('moor', 22.5, 50.5, 4.5), at('moor', 60.5, 83.5, 4.5), at('moor', 17.5, 38.5, 5.5), at('moor', 26, 22.5, 5), at('moor', 52, 13.5, 5)], label: 'Mist Wolves slain' },
    ],
    rewards: { xp: 1880, gold: 49, items: [], choice: ['mistcutter', 'mist_fang', 'moor_longbow', 'chime_rod', 'tarn_quill'] },
    rewardRarity: 'magic',
    text: {
      offer: "The mist wolves have come round the tarn and taken the north road. They come out of the fog and go back into it when they are hurt. Do not chase them into it. Let them come to you. Ten, and they will go back to the far side where they belong.",
      progress: "Do not chase them into the fog. I told them that. I mean, I told you.",
      complete: "The road is quiet. A wolf is only a wolf when you can see it.",
    },
    giveOnAccept: [],
  },

  mo_peat_and_tusk: {
    id: 'mo_peat_and_tusk', num: 20, name: 'Peat and Tusk', level: 11, minLevel: 9, zone: 'moor',
    giver: 'sorrel', turnIn: 'sorrel',
    requires: { quests: ['mo_fifty_paces'], cls: null, level: 9 },
    chain: { id: 'moor', step: 3 },
    objectives: [
      { kind: 'collect', item: 'boar_tusk', count: 6, where: [at('moor', 127, 65, 22)], label: 'Boar tusks' },
    ],
    rewards: { xp: 1880, gold: 49, items: [], choice: ['peat_cutters_gauntlets', 'turf_stack_shield', 'heath_book'] },
    rewardRarity: 'magic',
    text: {
      offer: "I cut peat here for the whole of Thornfold, and the boars have decided the heath is theirs. When one paws the ground, it is about to charge. Step aside. Do not be brave about it. Six tusks and I'll cut you a winter's worth of credit at the hearth.",
      progress: "Tusks? When one paws the ground, step aside. Not brave. Aside.",
      complete: "Six. You stepped aside, I hope. Brave people make poor peat-cutters.",
    },
    giveOnAccept: [],
  },

  mo_wraiths_on_the_water: {
    id: 'mo_wraiths_on_the_water', num: 21, name: 'Wraiths on the Water', level: 12, minLevel: 10, zone: 'moor',
    giver: 'sorrel', turnIn: 'sorrel',
    requires: { quests: ['mo_peat_and_tusk'], cls: null, level: 10 },
    chain: { id: 'moor', step: 4 },
    objectives: [
      { kind: 'kill', mob: 'page_wraith', count: 8, where: [at('moor', 48.5, 23.5, 25)], label: 'Page Wraiths slain' },
    ],
    rewards: { xp: 2110, gold: 53, items: [], choice: ['reed_wraps', 'wet_page_charm'] },
    rewardRarity: 'magic',
    text: {
      offer: "Pages on the tarn. Old, loose pages, flying low over the reeds with something in them. They cut, and they skip off when you get close. I don't know where they blew from, and I don't like guessing. Eight, please. Then I can sleep with the door open.",
      progress: "Still pages over the reeds? I heard one rustle past the hut. Paper should not do that.",
      complete: "Gone. The reeds are just reeds again. Paper should not fly.",
    },
    giveOnAccept: [],
  },

  mo_ninth_chime: {
    id: 'mo_ninth_chime', num: 22, name: 'The Ninth Post Is Quiet', level: 13, minLevel: 11, zone: 'moor',
    giver: 'odo', turnIn: 'odo',
    requires: { quests: ['mo_mist_pack'], cls: null, level: 11 },
    chain: { id: 'moor', step: 5 },
    objectives: [
      { kind: 'collect', item: 'chime_piece', count: 3, where: [at('moor', 100, 4.5, 14), at('moor', 133, 8.5, 9)], label: 'Chime pieces' },
    ],
    rewards: { xp: 2830, gold: 57, items: [], choice: ['watch_iron_helm', 'tower_hood', 'kept_charm'] },
    rewardRarity: 'magic',
    text: {
      offer: "Eight posts sing. The ninth says KEPT and nothing else. Its chime is gone: the old watchers up at the tower took it in pieces, for their lamps. They have been keeping the tower a long time. Bring me three pieces and I will hang it again.",
      progress: "Three pieces. The ninth post is waiting. So am I. We are good at waiting.",
      complete: "There. Listen. (A long, clean note.) Kept. Somebody meant that, once.",
    },
    giveOnAccept: [],
  },

  mo_long_watch: {
    id: 'mo_long_watch', num: 23, name: 'The Long Watch', level: 14, minLevel: 12, zone: 'moor',
    giver: 'odo', turnIn: 'odo', elite: true,
    requires: { quests: ['mo_ninth_chime'], cls: null, level: 12 },
    chain: { id: 'moor', step: 6 },
    objectives: [
      { kind: 'kill', mob: 'sentinel_long_watch', count: 1, where: [at('moor', 118, 8, 3)], label: 'Sentinel of the Long Watch defeated' },
    ],
    rewards: { xp: 4720, gold: 183, items: [], choice: ['long_watch_blade', 'lampglass_knives', 'watchtower_bow', 'lantern_rod', 'last_order_quill'] },
    rewardRarity: 'rare',
    text: {
      offer: "Something stands at the foot of the tower that the watchers obey. It was there before my grandmother. Its lamps were never put out. It does not leave and it does not sleep. I will ring the eighth chime when you go in. It hates the sound. Use that.",
      progress: "I will ring the eighth when you go in. Listen for it. Odo, stand by your post.",
      complete: "It's still. The lamps are dark. I can see the stars from my door for the first time in my life.",
    },
    giveOnAccept: [],
  },

  mo_word_for_the_elder: {
    id: 'mo_word_for_the_elder', num: 24, name: 'Word for the Elder', level: 14, minLevel: 12, zone: 'willowmere',
    giver: 'odo', turnIn: 'mael',
    requires: { quests: ['mo_long_watch'], cls: null, level: 12 },
    chain: { id: 'moor', step: 7 },
    objectives: [
      { kind: 'deliver', item: 'odos_chime_word', to: 'mael', where: [at('willowmere', 24, 18, 1.5)], label: "Bring Odo's note to Elder Mael" },
    ],
    rewards: { xp: 1570, gold: 61, items: ['register_ribbon'], choice: [] },
    rewardRarity: 'rare',
    text: {
      offer: "From the top of the tower I saw a town east of the river. I have watched that country fifty years and I could not tell you its name. And one of my posts lost a word this spring. Take this to your Elder Mael. He keeps the Register. He will know if it means anything.",
      progress: "Willowmere is a long walk. Take the note to your Elder. Odo will wait. Odo is good at it.",
      complete: "Fainter than yesterday. Thank you. Keep your own name close, friend. Say it out loud now and then. That is all any of us can do.",
    },
    hook: {
      lines: [
        "Mael reads Odo's note twice.",
        'He opens the Town Register and turns to a page you cannot see.',
        'He is quiet for a while.',
        '"Fainter than yesterday," he says, to nobody.',
        'Then, to you:',
        '"Thank you. Keep your own name close, friend."',
        '"Say it out loud now and then. That is all any of us can do."',
        'He closes the book.',
        'Far off, the twelve bells ring the hour.',
        'You count twelve.',
      ],
    },
    giveOnAccept: [{ item: 'odos_chime_word', qty: 1 }],
  },
};

export const QUEST_ORDER = [
  'wm_name_twice', 'wm_yard_slimes', 'wm_cobbs_hens', 'wm_pells_crate', 'wm_pilgrim_wolves', 'wm_keeper_marks',
  'wm_copied_twice', 'wm_lark_wanders', 'wm_rhythm_of_the_forge', 'wm_west_gate',
  'dn_name_in_the_hem', 'dn_wolves_at_the_ford', 'dn_black_in_the_fold', 'dn_eleven_pockets', 'dn_cold_at_the_stones',
  'dn_rubbings', 'dn_ridge_path',
  'mo_fifty_paces', 'mo_mist_pack', 'mo_peat_and_tusk', 'mo_wraiths_on_the_water', 'mo_ninth_chime', 'mo_long_watch',
  'mo_word_for_the_elder',
];

export const COMING_LATER = { id: 'east_road_later', name: 'The East Road', text: 'Coming later.' };

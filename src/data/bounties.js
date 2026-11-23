// Bounty boards (docs/design/BUILDS_2.md 5.6, phase 5 "cap 20"; PROGRESSION.md 2.4). Plain data.
//
// Each hub posts 3 bounties a day: kill a named foe, clear a camp, gather. A board keeps a pool of two for each kind and
// the sim (src/sim/quests.js bountiesToday) picks pool[(day + board index + kind index) mod 2], where `day` is the whole
// number the world is given (the client passes its local calendar day). A bounty is an ordinary quest with
// `bounty: { board, kind }`: the board's keeper gives it and takes it back through the quest dialog, and it can be done
// again on another day (it never goes to questsDone). Each pays about a quest: XP = PROGRESSION 2.2 at size 1.0
// (round10(0.94 x (160 + 90 L + 7 L^2))), gold = 4 L + 5 (the chain's own gold line). One day of the three boards is the
// extra play BUILDS_2 5.5 asks for between 15 and 20 (about 1.5 hours, PROGRESSION.md 2.4).
//
// NAMED_SPAWNS: one fixed spot per named foe (tiles), merged into content.spawns by src/data/maps/index.js. Each sits on
// a walkable, reachable cell at least 6 tiles from every camp and npc, and the valley two at least 9 tiles off Lark's
// walk home (qa/world/bounties.test.mjs checks it). The named foes themselves are mob templates in src/data/mobs.js.
const at = (zone, tx, ty, rTiles) => ({ zone, x: Math.round(tx * 16 + 8), y: Math.round(ty * 16 + 8), r: Math.round(rTiles * 16) });
const r10 = (x) => Math.round(x / 10) * 10;
export const bountyXp = (L) => r10(0.94 * (160 + 90 * L + 7 * L * L));
export const bountyGold = (L) => 4 * L + 5;

export const BOARDS = [
  { id: 'willowmere', name: 'The Willowmere Board', npc: 'pip', zone: 'willowmere', requires: 'wm_name_twice',
    pools: [['bounty_wm_bramblejaw', 'bounty_wm_inkpot'], ['bounty_wm_thornbacks', 'bounty_wm_blots'], ['bounty_wm_fangs', 'bounty_wm_blot_ink']] },
  { id: 'thornfold', name: 'The Thornfold Board', npc: 'tamsin', zone: 'downs', requires: 'wm_west_gate',
    pools: [['bounty_dn_black_tup', 'bounty_dn_cold_count'], ['bounty_dn_ford_wolves', 'bounty_dn_shades'], ['bounty_dn_crow_quills', 'bounty_dn_candles']] },
  { id: 'tarn_overlook', name: 'The Tarn Overlook Board', npc: 'sorrel', zone: 'moor', requires: 'dn_ridge_path',
    pools: [['bounty_mo_grimmet', 'bounty_mo_drowned_clerk'], ['bounty_mo_boars', 'bounty_mo_ink_wraiths'], ['bounty_mo_teeth', 'bounty_mo_bristles']] },
];
const KINDS = ['named', 'camp', 'gather'];

export const NAMED_SPAWNS = [
  { zone: 'valley', mob: 'bramblejaw', level: 5, x: 71, y: 8, wander: 2, respawn: 180, group: 'bounty_bramblejaw' },
  { zone: 'valley', mob: 'inkpot', level: 6, x: 74, y: 43, wander: 1, respawn: 180, group: 'bounty_inkpot' },
  { zone: 'downs', mob: 'black_tup', level: 10, x: 111, y: 68, wander: 2, respawn: 180, group: 'bounty_black_tup' },
  { zone: 'downs', mob: 'cold_count', level: 12, x: 16, y: 30, wander: 2, respawn: 180, group: 'bounty_cold_count' },
  // fix20 (2026-11-23): Grimmet stood at 40,8, beside the walk from Odo's hut to chime post 5 (Fifty Paces, level 13):
  // 7 of the audit's deaths on that post were his. He keeps the Chime Road's north west end now, 12+ tiles off the walk.
  { zone: 'moor', mob: 'grimmet', level: 15, x: 5, y: 21, wander: 2, respawn: 180, group: 'bounty_grimmet' },
  { zone: 'moor', mob: 'drowned_clerk', level: 17, x: 50, y: 20, wander: 2, respawn: 180, group: 'bounty_drowned_clerk' },
];

// where circles (tiles): the camps a bounty sends you to
const W = {
  wwWolves: at('valley', 84, 27, 17), wwBlots: at('valley', 86, 25, 17),
  fordWolves: at('downs', 111, 67, 22), stones: at('downs', 28, 21, 15), ridgeCrows: at('downs', 78, 8, 9),
  heath: at('moor', 126, 64, 22), ridgeline: at('moor', 122, 36, 10), chimeSouth: at('moor', 40, 72, 20), chimeNorth: at('moor', 26, 36, 18),
};

const b = (id, kind, level, name, objectives, text) => ({ id, kind, level, name, objectives, text });
const LIST = {
  willowmere: [
    b('bounty_wm_bramblejaw', 'named', 5, 'Old Bramblejaw',
      [{ kind: 'kill', mob: 'bramblejaw', count: 1, where: [at('valley', 71, 8, 4)], label: 'Old Bramblejaw slain' }],
      { offer: "The board says: OLD BRAMBLEJAW. A grey briar wolf, too big, too old, and too clever for the Pilgrim Road. He keeps to the top of the Whisperwood now. The bells ring wrong when he howls. I notice these things.",
        progress: 'Bramblejaw still out there? The bells say yes.', complete: 'Bramblejaw! Gone! The bells will ring right tonight. Here, the bounty, as posted.' }),
    b('bounty_wm_inkpot', 'named', 6, 'The Inkpot',
      [{ kind: 'kill', mob: 'inkpot', count: 1, where: [at('valley', 74, 43, 4)], label: 'The Inkpot slain' }],
      { offer: "The board says: THE INKPOT. An ink blot the size of a cart, south in the Whisperwood, spitting at anything that walks. It spat at my bell rope once. I have not forgotten.",
        progress: 'The Inkpot, south edge of the wood. Mind the spit.', complete: 'Popped, is it? Good. My bell rope thanks you. The bounty, as posted.' }),
    b('bounty_wm_thornbacks', 'camp', 6, 'Thin the Thornbacks',
      [{ kind: 'kill', mob: 'thornback_wolf', zone: 'valley', count: 8, where: [W.wwWolves], label: 'Thornback Wolves slain in the valley' }],
      { offer: 'The board says: THIN THE THORNBACKS. Eight of them, along the Whisperwood Edge. The farmers count their sheep twice and still come up short.',
        progress: 'Eight thornbacks. The Whisperwood is full of them.', complete: 'Eight! The farmers will sleep. Here, as posted.' }),
    b('bounty_wm_blots', 'camp', 6, 'Mop Up the Blots',
      [{ kind: 'kill', mob: 'ink_blot', zone: 'valley', count: 6, where: [W.wwBlots], label: 'Ink Blots slain in the valley' }],
      { offer: 'The board says: MOP UP THE BLOTS. Six ink blots in the Whisperwood, spitting at the woodcutters. Mira wants it done before the ink gets into the river.',
        progress: 'Six blots, the Whisperwood. Stay out of the spit.', complete: 'Mopped! Mira will be pleased. As posted.' }),
    b('bounty_wm_fangs', 'gather', 6, 'Fangs for Garrick',
      [{ kind: 'collect', item: 'thornback_fang', count: 6, where: [W.wwWolves], label: 'Thornback Fangs' }],
      { offer: 'The board says: FANGS FOR GARRICK. Six thornback fangs, for rivets. He says they hold better than iron. He would know. He is very loud about it.',
        progress: 'Six fangs from the Whisperwood thornbacks.', complete: "Six fangs. Garrick's rivets will hold. The bounty, as posted." }),
    b('bounty_wm_blot_ink', 'gather', 6, 'Ink for the Copyists',
      [{ kind: 'collect', item: 'blot_ink_pot', count: 5, where: [W.wwBlots], label: 'Pots of Blot Ink' }],
      { offer: 'The board says: INK FOR THE COPYISTS. Five pots of blot ink, scooped from the Whisperwood blots. Mira says it copies twice as dark. She says that about everything.',
        progress: 'Five pots of blot ink. The blots will not give it up kindly.', complete: 'Five pots. Dark as a bell at midnight. As posted.' }),
  ],
  thornfold: [
    b('bounty_dn_black_tup', 'named', 10, 'The Black Tup',
      [{ kind: 'kill', mob: 'black_tup', count: 1, where: [at('downs', 111, 68, 4)], label: 'The Black Tup slain' }],
      { offer: "Posted on the hearth board: THE BLACK TUP. A ram gone wrong, black to the hoof, down by Drovers' Ford. He has knocked two drovers into the water. Leave him be and he leaves you be, mostly. Mostly is the trouble.",
        progress: 'The Black Tup grazes by the ford. Do not stand in front of him.', complete: 'The Tup is down. The drovers will cross dry. Your bounty.' }),
    b('bounty_dn_cold_count', 'named', 12, 'The Cold Count',
      [{ kind: 'kill', mob: 'cold_count', count: 1, where: [at('downs', 16, 30, 4)], label: 'The Cold Count slain' }],
      { offer: 'Posted on the hearth board: THE COLD COUNT. A shade at the west of the Standing Stones that counts out loud and does not stop. Folk who hear it lose their place in everything. Put it to rest.',
        progress: 'The Cold Count, west of the Stones. Do not listen to the numbers.', complete: 'Quiet at last. I had lost count of my stitches for a week. Your bounty.' }),
    b('bounty_dn_ford_wolves', 'camp', 10, 'Clear the Ford',
      [{ kind: 'kill', mob: 'thornback_wolf', zone: 'downs', count: 9, where: [W.fordWolves], label: "Thornback Wolves slain at Drovers' Ford" }],
      { offer: "Posted on the hearth board: CLEAR THE FORD. Nine thornbacks from the packs round Drovers' Ford. The wool carts will not go out until it is done.",
        progress: "Nine thornbacks. The packs at the ford run in threes.", complete: 'Nine. The carts go out at dawn. Your bounty.' }),
    b('bounty_dn_shades', 'camp', 11, 'Settle the Stones',
      [{ kind: 'kill', mob: 'barrow_shade', zone: 'downs', count: 6, where: [W.stones], label: 'Barrow Shades laid to rest' }],
      { offer: 'Posted on the hearth board: SETTLE THE STONES. Six barrow shades among the Standing Stones. They come up colder every night.',
        progress: 'Six shades at the Stones. They hit from a distance.', complete: 'Six. The Stones are only stones again, for a while. Your bounty.' }),
    b('bounty_dn_crow_quills', 'gather', 10, 'Black Quills',
      [{ kind: 'collect', item: 'black_crow_quill', count: 6, where: [W.ridgeCrows], label: 'Black Crow Quills' }],
      { offer: 'Posted on the hearth board: BLACK QUILLS. Six long quills from the gorse crows on the Ridge. I weave them into the borders. They keep the moths off. Probably.',
        progress: 'Six quills from the Ridge crows. They fly off when hurt; they come back.', complete: 'Six black quills. Lovely. Your bounty.' }),
    b('bounty_dn_candles', 'gather', 11, 'Barrow Candles',
      [{ kind: 'collect', item: 'barrow_candle', count: 5, where: [W.stones], label: 'Barrow Candle Stubs' }],
      { offer: 'Posted on the hearth board: BARROW CANDLES. The shades at the Stones carry candle stubs that never quite go out. Bring five. They light a loom room for a month.',
        progress: 'Five candle stubs from the Stones shades.', complete: 'Five stubs, still warm. Your bounty.' }),
  ],
  tarn_overlook: [
    b('bounty_mo_grimmet', 'named', 15, 'Grimmet',
      [{ kind: 'kill', mob: 'grimmet', count: 1, where: [at('moor', 5, 21, 4)], label: 'Grimmet slain' }],
      { offer: 'Board by the cutting: GRIMMET. A mist wolf with one white eye, up the north end of the Chime Road. Fast. Faster than you. Took my second-best spade.',
        progress: 'Grimmet runs the north road. Do not try to outrun him.', complete: 'Grimmet. Huh. No spade on him? Pity. Your bounty, then.' }),
    b('bounty_mo_drowned_clerk', 'named', 17, 'The Drowned Clerk',
      [{ kind: 'kill', mob: 'drowned_clerk', count: 1, where: [at('moor', 50, 20, 4)], label: 'The Drowned Clerk slain' }],
      { offer: "Board by the cutting: THE DROWNED CLERK. A page wraith on the tarn's north shore, still filing something. Nobody knows what. Nobody wants to be filed.",
        progress: 'The Clerk, north shore of the tarn. It cuts.', complete: 'Filed away for good. Your bounty.' }),
    b('bounty_mo_boars', 'camp', 16, 'Clear the Heath',
      [{ kind: 'kill', mob: 'gorse_boar', zone: 'moor', count: 7, where: [W.heath], label: 'Gorse Boars slain' }],
      { offer: 'Board by the cutting: CLEAR THE HEATH. Seven gorse boars. They rip up a season of turf in a night.',
        progress: 'Seven boars on the Gorse Heath. They charge.', complete: 'Seven. The turf stays where I put it. Your bounty.' }),
    b('bounty_mo_ink_wraiths', 'camp', 17, 'Wraiths on the Ridgeline',
      [{ kind: 'kill', mob: 'ink_wraith', zone: 'moor', count: 6, where: [W.ridgeline], label: 'Ink Wraiths slain on the Ridgeline' }],
      { offer: 'Board by the cutting: WRAITHS ON THE RIDGELINE. Six ink wraiths. When they pool their ink the whole ridge goes black.',
        progress: 'Six wraiths on the Ridgeline. Step out of the dark circles.', complete: 'Six. The ridge is grey again. Your bounty.' }),
    b('bounty_mo_teeth', 'gather', 15, 'Mist Teeth',
      [{ kind: 'collect', item: 'mist_wolf_tooth', count: 6, where: [W.chimeSouth, W.chimeNorth], label: 'Mist Wolf Teeth' }],
      { offer: 'Board by the cutting: MIST TEETH. Six mist wolf teeth from the Chime Road. Odo hangs them on the posts. Says it keeps the mist honest.',
        progress: 'Six teeth from the Chime Road wolves.', complete: 'Six teeth. Odo will be pleased, in his way. Your bounty.' }),
    b('bounty_mo_bristles', 'gather', 16, 'Boar Bristles',
      [{ kind: 'collect', item: 'boar_bristle', count: 6, where: [W.heath], label: 'Boar Bristles' }],
      { offer: 'Board by the cutting: BOAR BRISTLES. Six good bristles from the heath boars. Best brush there is for peat.',
        progress: 'Six bristles from the Gorse Heath boars.', complete: 'Six bristles. A fine brush. Your bounty.' }),
  ],
};

/** The bounty quests (CONTRACTS 7.5 quest shape plus `bounty`), merged into content.quests by src/data/maps/index.js. */
export const BOUNTIES = {};
for (const board of BOARDS) {
  for (const x of LIST[board.id]) {
    BOUNTIES[x.id] = {
      id: x.id, num: null, name: `Bounty: ${x.name}`, level: x.level, minLevel: x.level - 2, zone: board.zone,
      giver: board.npc, turnIn: board.npc,
      requires: { quests: [board.requires], cls: null, level: x.level - 2 },
      chain: null, bounty: { board: board.id, kind: x.kind },
      objectives: x.objectives,
      rewards: { xp: bountyXp(x.level), gold: bountyGold(x.level), items: [], choice: [] },
      rewardRarity: 'magic',
      text: x.text,
      giveOnAccept: [],
    };
  }
}
// every pool entry is a bounty of that board and kind (a typo here would post nothing)
for (const board of BOARDS) board.pools.forEach((pool, k) => { for (const id of pool) if (!BOUNTIES[id] || BOUNTIES[id].bounty.kind !== KINDS[k]) throw new Error(`bounties: ${board.id} pool ${k} names ${id}`); });

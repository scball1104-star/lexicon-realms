// The Moor band (quests20 lane, 2026-11-23): 25 more quests for levels 13 to 20 on the High Moor and the roads off it,
// so the band is quested and not ground (the audit: 13 to 20 was 50 to 75% grinding, quest XP 43% against PROGRESSION's
// 70%). Plain data, merged by src/data/maps/index.js: placeMoorBand(WORLD) once (people, quest nodes and a few small
// unbannered areas on the world map) and applyMoorBand(content, worldQuests) in buildContent (people, quest items, quest
// drops on existing foes, the quests as side quests, offered after the chain and the bounties).
//
// Nothing here changes an existing quest, foe stat or item. Every foe is an existing moor foe (a quest drop is added to its
// loot table only, and drops only while the quest needs it); every person wears an existing npc look; every reward choice
// is an existing reward item. XP is PROGRESSION 2.2 at the quest's level and a small size (0.15 to 0.3): the band already
// has the chain and three boards, so at full sizes the questbot went 13 to 20 in 70 minutes (PROGRESSION 1 asks for about
// 154) with quests and bounties at 88% of the XP; at these sizes quests and bounties are about three quarters of it. Gold is kept low
// (about 1.5 x level).
//
// Four story chains (src/data/story_chains.js shape, carried on the quests here: part n of m, a card at the end):
//   The Surveyor's Line (Linnet, 13 to 15), Reeds and Pages (Osric, 14 to 16), Forwards and Backwards (Ewan, 15 to 17),
//   The Watchers' Glass (Corra, 17 to 19). Two escorts (Jory, Pim), seven deliveries that walk you between the moor's
//   places, Thornfold and Willowmere, and short side jobs. Text is original. No em dashes.
import { toWorld } from './maps/layout.js';

// moor tiles -> a where circle in PIXELS (CONTRACTS 7.5), the same as quests.js at()
const at = (zone, tx, ty, rTiles) => ({ zone, x: Math.round(tx * 16 + 8), y: Math.round(ty * 16 + 8), r: Math.round(rTiles * 16) });
const round10 = (n) => Math.round(n / 10) * 10;
/** PROGRESSION 2.2: quest_xp(L, size) = round10(0.94 * (160 + 90 L + 7 L^2) * size). */
export const mbQuestXp = (L, size) => round10(0.94 * (160 + 90 * L + 7 * L * L) * size);
/** Modest gold (the audit: heroes hold 9,000 to 10,000 gold at 20 with little to spend it on). */
export const mbQuestGold = (L, mult = 1) => Math.round(1.5 * L * mult);

// ---------------------------------------------------------------- where things stand (moor tiles; the moor's corner is 0, 0)
export const MB_NPC_SPOTS = [
  { npc: 'mb_linnet', x: 77, y: 89, dir: 'down' },     // the Ridge Path, by the lantern
  { npc: 'mb_agnes', x: 84, y: 90, dir: 'left' },      // the Ridge Path, her cart
  { npc: 'mb_osric', x: 70, y: 50, dir: 'up' },        // the tarn's south shore, below the overlook
  { npc: 'mb_ewan', x: 70, y: 10, dir: 'down' },       // the Chime Road north, past post 7
  { npc: 'mb_corra', x: 147, y: 20, dir: 'left' },     // by the Stile
];
const N = (id, name, x, y, item, sprite = 'node') => ({ id, name, item, x, y, respawn: 30, sprite });
export const MB_NODES = [
  ...[[64, 78], [56, 80], [48, 76], [68, 80], [52, 86], [44, 82]].map(([x, y], i) => N(`mb_bell_${i + 1}`, 'Harness Bell', x, y, 'mb_harness_bell')),
  ...[[32, 48], [38, 49], [46, 48], [52, 48], [58, 48], [62, 49]].map(([x, y], i) => N(`mb_reeds_${i + 1}`, 'Reed Bed', x, y, 'mb_reed_bundle', 'x1_haybale')),
  ...[[148, 12], [149, 16], [151, 22], [146, 24]].map(([x, y], i) => N(`mb_root_${i + 1}`, 'Stile Root', x, y, 'mb_stile_root')),
  ...[[118, 84], [124, 86], [130, 82], [112, 86], [136, 86]].map(([x, y], i) => N(`mb_cairn_${i + 1}`, 'Cairn Stone', x, y, 'mb_cairn_stone')),
];
// small unbannered areas for explore steps (the moor's own areas are used where they fit)
export const MB_AREAS = [
  { id: 'mb_stake_west', name: 'The West Stake', x: 8, y: 44, w: 5, h: 4, banner: false },
  { id: 'mb_stake_north', name: 'The North Stake', x: 64, y: 10, w: 5, h: 4, banner: false },
  { id: 'mb_stake_heath', name: 'The Heath Stake', x: 106, y: 86, w: 5, h: 4, banner: false },
  { id: 'mb_hollow_mouth', name: 'The Hollow Mouth', x: 38, y: 48, w: 8, h: 4, banner: false },
];

let placed = false;
/** Once, at load: the band's people, quest nodes and areas onto the world map (moor tiles -> world tiles). */
export function placeMoorBand(world) {
  if (placed) return world;
  placed = true;
  const W = (x, y) => toWorld('moor', x, y);
  for (const n of MB_NPC_SPOTS) { const [x, y] = W(n.x, n.y); world.npcs.push({ ...n, x, y, region: 'moor' }); }
  for (const n of MB_NODES) { const [x, y] = W(n.x, n.y); world.nodes.push({ ...n, x, y, region: 'moor' }); }
  for (const a of MB_AREAS) { const [x, y] = W(a.x, a.y); world.areas.push({ ...a, x, y, region: 'moor' }); }
  return world;
}

// ---------------------------------------------------------------- people (existing looks only)
const P = (o) => ({ faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false, lq: null, ...o });
export const MB_NPCS = {
  mb_linnet: P({ id: 'mb_linnet', name: 'Linnet Lake', sprite: 'npc_scholar', title: 'Surveyor',
    talk: ['Fifty paces between posts. The sign says so. My chain says otherwise, and my chain has never lied to me.', 'I measure things. It is restful. The things do not argue back, usually.'] }),
  mb_agnes: P({ id: 'mb_agnes', name: 'Agnes Thatch', sprite: 'npc_farmer', title: 'Carter',
    talk: ['Peat down to Thornfold, wool back up. The pony knows the road better than I do. That is the trouble.', 'Mist on the moor makes the pony sing. Badly.'] }),
  mb_osric: P({ id: 'mb_osric', name: 'Osric Reed', sprite: 'npc_ferry', title: 'Reed-cutter',
    talk: ['Reeds for thatch, reeds for lamps, reeds for my lunch if the week goes badly.', 'The tarn is quiet. Quiet water is the kind that remembers.'] }),
  mb_ewan: P({ id: 'mb_ewan', name: 'Ewan Strake', sprite: 'npc_elder', title: 'Chime Walker',
    talk: ['I ring the posts backwards, nine to one. Somebody has to hear them the other way round.', 'Odo and I have not spoken in forty years. We are both very good at it.'] }),
  mb_corra: P({ id: 'mb_corra', name: 'Corra Vane', sprite: 'npc_smith', title: 'Glass-grinder',
    talk: ['Watcher lamp glass is the clearest glass in the valley. The watchers are not keen to share it.', 'The Stile is choked with roots. Roots are patient. So am I, mostly.'] }),
  // the escorts (src/sim/quests.js escort-lite; spawned at the start when the quest is taken)
  mb_jory: P({ id: 'mb_jory', name: 'Old Jory', sprite: 'npc_brindle', title: 'Shepherd', roles: ['escort'], escort: { follow: 2, hpPct: 0.45 },
    talk: ['Forty-one sheep. I had forty-one. Now I have forty-one and no idea where I am.', 'Is that a wolf or a rock? Do not answer. I would rather not know.'] }),
  mb_pim: P({ id: 'mb_pim', name: 'Pim', sprite: 'npc_child_b', title: null, roles: ['escort'], escort: { follow: 2, hpPct: 0.4 },
    talk: ['I was not lost. I was watching the boars. They were watching me back.', 'Aunt Sorrel says brave people make poor peat-cutters. I am going to be a boar-watcher.'] }),
};

// ---------------------------------------------------------------- quest items (CONTRACTS 7.4 kind 'quest', stack 20, no value)
const qi = (id, name, text, icon = 'icon_scroll') => Object.freeze({ id, name, rarity: 'common', kind: 'quest', slot: null, stack: 20, value: 0, level: 1, reqLevel: 1, text, icon, classes: null, use: null, bagSlots: 0, stats: {} });
export const MB_ITEMS = {
  mb_chain_link: qi('mb_chain_link', "Surveyor's Chain Link", 'A brass link from a measuring chain, chewed. Wolves have no respect for a standard length.', 'icon_key'),
  mb_linnets_figures: qi('mb_linnets_figures', "Linnet's Figures", 'Columns of paces, neatly ruled. The last column is underlined twice, then once more, harder.'),
  mb_harness_bell: qi('mb_harness_bell', 'Harness Bell', "A little brass bell off Agnes's pony harness. It rings when you pick it up, which is the point of it.", 'icon_key'),
  mb_peat_bundle: qi('mb_peat_bundle', 'Bundle of Peat', "Sorrel's peat, cut square and tied tight. It smells of smoke that has not happened yet."),
  mb_reed_bundle: qi('mb_reed_bundle', 'Reed Bundle', 'Tarn reeds, cut long. Good for thatch and for lamp wicks.'),
  mb_scarab_shell: qi('mb_scarab_shell', 'Moss Scarab Shell', 'Green and thin as a fingernail. Held to a lamp it glows the colour of the heath.'),
  mb_sodden_page: qi('mb_sodden_page', 'Sodden Page', 'A wet page torn from a page wraith. The ink has run, but some of the words are holding on.'),
  mb_dried_pages: qi('mb_dried_pages', 'Dried Pages', "The wraiths' pages, dried on Osric's reed rack. Every one is a letter, and every one begins 'Odo'."),
  mb_peat_brick: qi('mb_peat_brick', 'Peat Brick', "One brick of Sorrel's best, for Odo's stove. She says he will pretend he did not need it."),
  mb_ewans_half: qi('mb_ewans_half', "Ewan's Half", 'A strip of slate with half a word on it, written backwards. Ewan says Odo has the other half.'),
  mb_inked_glass: qi('mb_inked_glass', 'Inked Lamp Glass', 'A curved shard of watcher lamp glass, clouded with ink. Under the ink it is perfectly clear.'),
  mb_stile_root: qi('mb_stile_root', 'Stile Root', 'A length of pale root from the Stile. Corra burns them to polish glass. The roots are said to object.'),
  mb_watch_lens: qi('mb_watch_lens', "Corra's Lens", 'A lens ground from watcher glass, clean as cold water. Look through it at a post and the word on it looks back.', 'icon_lantern'),
  mb_chime_thread: qi('mb_chime_thread', 'Chime Thread', "A hank of the waxed thread Odo hangs his chimes on. Tamsin's, originally. He has been meaning to return the favour for thirty years."),
  mb_full_survey: qi('mb_full_survey', 'The High Moor Survey', "Linnet's survey of the moor, every pace between every post, fair-copied. Addressed to Mira, at the Willowmere Archive door."),
  mb_cairn_stone: qi('mb_cairn_stone', 'Cairn Stone', 'A flat stone from a fallen cairn on the heath. Someone scratched a tally on it a long time ago.'),
};

// quest drops on existing foes (loot table rows only; src/sim/loot.js drops a quest item only while a quest needs it)
export const MB_DROPS = {
  mist_wolf: [{ item: 'mb_chain_link', chance: 0.5, quest: 'mb_first_fifty' }],
  moss_scarab: [{ item: 'mb_scarab_shell', chance: 0.75, quest: 'mb_shells_for_lamps' }],
  page_wraith: [{ item: 'mb_sodden_page', chance: 0.5, quest: 'mb_wet_pages' }],
  ink_wraith: [{ item: 'mb_inked_glass', chance: 0.5, quest: 'mb_inked_glass' }],
};

// ---------------------------------------------------------------- the quests
// story chains carried here: `story: { id, name, step, of }`, and `end` on the last step (src/sim/worldlife.js emits the card)
const CHAINS = {
  surveyors_line: { name: "The Surveyor's Line", steps: ['mb_first_fifty', 'mb_figures_for_brindle', 'mb_counted_in_thread', 'mb_the_long_pace'],
    end: { title: "The Surveyor's Line", lines: [
      'Fifty paces, the sign says. Linnet\'s chain said fifty-one, then fifty-two, then fifty-three.',
      "Brindle counted it again and got the same. Tamsin's sampler had the old figure, stitched in her grandmother's thread: fifty, exactly.",
      'The moor is the same size it always was. It is the words on the posts that have thinned, and a word that is half gone does not hold a distance as well.',
      'Linnet has written that down, underlined twice. She would like someone to tell her it is wrong.',
    ] } },
  reeds_and_pages: { name: 'Reeds and Pages', steps: ['mb_reed_cutter', 'mb_shells_for_lamps', 'mb_wet_pages', 'mb_pages_to_ewan'],
    end: { title: 'Reeds and Pages', lines: [
      'Reeds for the rack, shells for the lamp, and in the lamplight the wraiths\' pages turned out to be letters.',
      "Forty years of letters, every one beginning 'Odo', every one ending without a name.",
      'Ewan Strake wrote them and never sent them. The tarn kept them. Then the tarn let them fly.',
      'Osric says quiet water is the kind that remembers. He did not say it was the kind that forgives.',
    ] } },
  forwards_backwards: { name: 'Forwards and Backwards', steps: ['mb_the_other_walker', 'mb_ewans_round', 'mb_a_word_each_way'],
    end: { title: 'Forwards and Backwards', lines: [
      'Two old men walk the same nine posts. One says the words from one to nine. One says them from nine to one.',
      'For forty years each was sure the other had it wrong. Each kept half of the word they argued over.',
      'Put together, the slate says KEPT. Rung forwards and backwards at once, post four found its voice again, faintly.',
      'Odo and Ewan have agreed on nothing else. It is a start.',
    ] } },
  watchers_glass: { name: "The Watchers' Glass", steps: ['mb_inked_glass', 'mb_stile_roots', 'mb_ridge_ink', 'mb_count_the_lamps'],
    end: { title: "The Watchers' Glass", lines: [
      "Ink scraped off watcher glass, roots from the Stile to polish it, and a lens as clear as the tower's lamps were once.",
      "Through it the eighth post reads plainly, and from Odo's door so does the ninth. Through it the watchers read plainly too: WATCH THE ROADS, carved inside every one.",
      'Somebody gave them that order and never came back to take it off them.',
      'Corra has put the lens in Odo\'s window. He says he will look through it when he is ready.',
    ] } },
};

const Q = (o) => {
  const { size, goldMult = 1, ...rest } = o;
  const minLevel = Math.max(1, o.level - 2);
  return {
    minLevel, zone: 'moor', rewardRarity: 'magic', giveOnAccept: [], ...rest,
    requires: { quests: [], cls: null, level: minLevel, ...o.requires },
    rewards: { items: [], choice: [], ...o.rewards, xp: mbQuestXp(o.level, size), gold: mbQuestGold(o.level, goldMult) },
    size,
  };
};
const M = 'moor';
const AT = {
  linnet: at(M, 77, 89, 1.5), agnes: at(M, 84, 90, 1.5), osric: at(M, 70, 50, 1.5), ewan: at(M, 70, 10, 1.5), corra: at(M, 147, 20, 1.5),
  odo: at(M, 106, 21, 1.5), sorrel: at(M, 82, 58, 1.5),
  brindle: at('downs', 95, 37, 1.5), tamsin: at('downs', 77, 33, 1.5), mira: at('willowmere', 38, 27, 1.5),
  post1: at(M, 73.5, 87, 2.5), post6: at(M, 44.5, 8, 2.5), post7: at(M, 66.5, 9, 2.5), post8: at(M, 108.5, 10, 2.5),
  southWolves: [at(M, 50.5, 70.5, 4.5), at(M, 30.5, 66.5, 4.5), at(M, 60.5, 83.5, 4.5)],
  northWolves: [at(M, 26, 22.5, 5), at(M, 52, 13.5, 5), at(M, 17.5, 38.5, 5.5)],
  bells: at(M, 57, 81, 9), reeds: at(M, 47, 48.5, 16), scarabs: at(M, 128, 70, 22), wraiths: at(M, 46, 23.5, 18),
  inkRidge: at(M, 122, 36, 10), stile: at(M, 150, 17, 7), ridgeline: at(M, 110, 34, 12), cairns: at(M, 124, 84, 14),
  sentinels: at(M, 116, 7, 20), stakeW: at(M, 10.5, 46, 3), stakeN: at(M, 66.5, 12, 3), stakeH: at(M, 108.5, 88, 3), hollow: at(M, 42, 50, 4),
};

const QUESTS = {
  // ------------------------------------------------ The Surveyor's Line (Linnet Lake, the Ridge Path)
  mb_first_fifty: Q({ id: 'mb_first_fifty', num: 301, name: 'The First Fifty', level: 13, size: 0.2, giver: 'mb_linnet', turnIn: 'mb_linnet',
    requires: { quests: ['dn_ridge_path'] },
    objectives: [
      { kind: 'explore', zone: M, area: 'chime_post_1', where: [AT.post1], label: 'Pace out the first post' },
      { kind: 'collect', item: 'mb_chain_link', count: 5, where: AT.southWolves, label: 'Chain links taken back from the mist wolves' },
    ],
    text: {
      offer: "Linnet Lake, surveying for the Thornfold drovers. The sign says fifty paces between posts. I laid my chain from the first post to the second and got fifty-one. Then the mist wolves ate the chain. Pace the first post for me, and get my links back from the wolves. Five will do. I can splice.",
      progress: 'Five links. They will be inside wolves. I am sorry about that, but not very.',
      complete: "Five links, only slightly digested. And the first post is where I left it, which is something. Fifty-one paces. I have checked my feet. My feet are the standard length.",
    } }),
  mb_figures_for_brindle: Q({ id: 'mb_figures_for_brindle', num: 302, name: 'A Second Opinion', level: 13, size: 0.15, giver: 'mb_linnet', turnIn: 'brindle', zone: 'downs',
    requires: { quests: ['mb_first_fifty'] },
    objectives: [{ kind: 'deliver', item: 'mb_linnets_figures', to: 'brindle', where: [AT.brindle], label: "Take Linnet's figures to Brindle in Thornfold" }],
    giveOnAccept: [{ item: 'mb_linnets_figures', qty: 1 }],
    text: {
      offer: "I need someone who counts for a living and does not trust it. Brindle, down at the Thornfold fold. Take him my figures. If he gets fifty, I am wrong and I will be delighted. If he gets fifty-one, I am right and I will be worried.",
      progress: "Brindle, at the fold in Thornfold. He will count it twice. Let him.",
      complete: "(Brindle runs a finger down the columns, twice.) Fifty-one. And this one fifty-two. I do not like a number that grows. Sheep are bad enough.",
    } }),
  mb_counted_in_thread: Q({ id: 'mb_counted_in_thread', num: 303, name: 'Counted in Thread', level: 14, size: 0.15, giver: 'brindle', turnIn: 'mb_linnet',
    requires: { quests: ['mb_figures_for_brindle'] },
    objectives: [{ kind: 'talk', npc: 'tamsin', where: [AT.tamsin], label: 'Ask Tamsin for the old figure' }],
    text: {
      offer: "Tamsin's grandmother walked the chime posts when they were new, and stitched the paces into a sampler so nobody could argue. Ask Tamsin what it says. Then take it up to your surveyor. I will be here, counting.",
      progress: 'Tamsin first, then up the Ridge to your surveyor. Mind the gap.',
      complete: "Fifty, exactly, in thread older than Thornfold. So the old figure is fifty and my chain says fifty-one. Either the moor has grown, or something on it has shrunk. I know which one I would bet on.",
    } }),
  mb_the_long_pace: Q({ id: 'mb_the_long_pace', num: 304, name: 'The Long Pace', level: 15, size: 0.25, goldMult: 2, giver: 'mb_linnet', turnIn: 'mb_linnet',
    requires: { quests: ['mb_counted_in_thread'] },
    objectives: [
      { kind: 'explore', zone: M, area: 'mb_stake_west', where: [AT.stakeW], label: 'Drive the west stake (the Chime Road, by the tarn)' },
      { kind: 'explore', zone: M, area: 'mb_stake_north', where: [AT.stakeN], label: 'Drive the north stake (past post 7)' },
      { kind: 'explore', zone: M, area: 'mb_stake_heath', where: [AT.stakeH], label: 'Drive the heath stake (the south of the Gorse Heath)' },
    ],
    rewards: { choice: ['sorrels_peat_boots', 'reedwoven_mantle', 'drowned_shrine_charm'] },
    text: {
      offer: "Three stakes, as far apart as the moor allows: west by the tarn, north past the seventh post, south on the heath. If the moor itself has grown, the stakes will tell me. If it has not, then it is the posts. Mind the boars on the heath. They have opinions about stakes.",
      progress: 'West, north, heath. Three stakes. The moor will not measure itself.',
      complete: "The stakes agree with my grandmother's grandmother's map, to the inch. The moor is the size it always was. So it is the posts that are wrong, and posts do not move. Their words must be going thin. A word that is half gone holds half a distance. Write that down. No, I will.",
    } }),

  // ------------------------------------------------ Agnes Thatch (the Ridge Path)
  mb_harness_bells: Q({ id: 'mb_harness_bells', num: 305, name: 'The Pony Sings', level: 13, size: 0.15, giver: 'mb_agnes', turnIn: 'mb_agnes',
    requires: { quests: ['dn_ridge_path'] },
    objectives: [{ kind: 'collect', item: 'mb_harness_bell', count: 6, where: [AT.bells], label: 'Harness bells found on the Chime Road' }],
    text: {
      offer: "The mist came down, the pony bolted down the Chime Road, and the bells came off his harness one by one. He came back. The bells did not. Six, please. You will hear them before you see them. So will the wolves.",
      progress: 'Bells. Little, brass, noisy. The pony misses them. He hums without them.',
      complete: "Six. Listen to that. He sounds like a pony again and not a kettle.",
    } }),
  mb_peat_for_agnes: Q({ id: 'mb_peat_for_agnes', num: 306, name: 'Peat for the Cart', level: 14, size: 0.15, giver: 'sorrel', turnIn: 'mb_agnes',
    requires: { quests: ['mo_fifty_paces'] },
    objectives: [{ kind: 'deliver', item: 'mb_peat_bundle', to: 'mb_agnes', where: [AT.agnes], label: 'Bring the peat to Agnes at the Ridge Path' }],
    giveOnAccept: [{ item: 'mb_peat_bundle', qty: 1 }],
    text: {
      offer: "Agnes Thatch is waiting at the Ridge Path with her cart and her opinions. This is the Thornfold load. Carry it down to her. Do not let her tell you it is short. It is never short. I cut it square.",
      progress: "Down the road to the Ridge Path. Agnes will be the one checking the corners.",
      complete: "(Agnes squeezes the bundle.) Square. Tight. Annoyingly perfect. Tell her thank you. Do not tell her I said annoyingly.",
    } }),
  mb_jory_in_the_mist: Q({ id: 'mb_jory_in_the_mist', num: 307, name: 'Jory in the Mist', level: 14, size: 0.25, giver: 'mb_agnes', turnIn: 'mb_agnes',
    requires: { quests: ['mb_harness_bells'] },
    objectives: [{
      kind: 'escort', npc: 'mb_jory',
      from: { zone: M, x: 70, y: 72 },
      to: { zone: M, x: 79, y: 90, r: 4 },
      fail: 'death',
      ambush: [
        { at: { x: 73, y: 79, r: 3 }, mobs: [{ mob: 'mist_wolf', level: 14 }] },
        { at: { x: 77, y: 85, r: 3 }, mobs: [{ mob: 'mist_wolf', level: 14 }] },
      ],
      where: [at(M, 70, 72, 3), at(M, 79, 90, 4)], label: 'Bring Old Jory to the Ridge Path',
    }],
    rewards: { choice: ['watch_iron_helm', 'tower_hood', 'kept_charm'] },
    text: {
      offer: "Old Jory came up for his strays and the mist took him. I can hear him from here, up on the open moor north of the Ridge Path, counting sheep that are not there. Bring him in to the cart. He will follow anyone who sounds sure of themselves. Try to sound sure.",
      progress: 'North of the Ridge Path, on the open moor. Follow the counting. He is up to ninety, and he only had forty-one.',
      complete: "Jory. Sit on the cart. No, the sheep are fine, the sheep are in Thornfold. (To you:) He thanks you. He will tell you so himself once he has counted you.",
    } }),

  // ------------------------------------------------ Reeds and Pages (Osric Reed, the tarn's south shore)
  mb_reed_cutter: Q({ id: 'mb_reed_cutter', num: 308, name: 'Cut Long', level: 14, size: 0.15, giver: 'mb_osric', turnIn: 'mb_osric',
    requires: { quests: ['mo_fifty_paces'] },
    objectives: [{ kind: 'collect', item: 'mb_reed_bundle', count: 8, where: [AT.reeds], label: 'Reed bundles cut on the south shore' }],
    text: {
      offer: "Osric Reed. Yes, really. My knee will not take the shore this week, and I need reeds for the drying rack. Eight bundles along the south shore, cut long. Something has been drying on my rack that is not reeds, and I would like it to have company it can argue with.",
      progress: 'Long, mind. Short reeds make short racks and short tempers.',
      complete: "Long. Lovely. Now the rack can hold what the tarn keeps giving me.",
    } }),
  mb_shells_for_lamps: Q({ id: 'mb_shells_for_lamps', num: 309, name: 'Shells for the Lamp', level: 15, size: 0.15, giver: 'mb_osric', turnIn: 'mb_osric',
    requires: { quests: ['mb_reed_cutter'] },
    objectives: [{ kind: 'collect', item: 'mb_scarab_shell', count: 4, where: [AT.scarabs], label: 'Moss scarab shells from the Gorse Heath' }],
    text: {
      offer: "To read wet ink you want a green light. Do not ask me why, my mother knew and she did not say. The moss scarabs on the Gorse Heath have shells that glow green in a lamp. Four. They are peaceable beasts until you are not.",
      progress: 'Green shells, from the heath. The scarabs are slow. The boars beside them are not.',
      complete: "Green as a new leaf. Now, what the tarn has been giving me. Come and look.",
    } }),
  mb_wet_pages: Q({ id: 'mb_wet_pages', num: 310, name: 'What the Water Kept', level: 16, size: 0.25, giver: 'mb_osric', turnIn: 'mb_osric',
    requires: { quests: ['mb_shells_for_lamps'] },
    objectives: [
      { kind: 'kill', mob: 'page_wraith', zone: M, count: 6, where: [AT.wraiths], label: 'Page Wraiths torn down' },
      { kind: 'collect', item: 'mb_sodden_page', count: 5, where: [AT.wraiths], label: 'Sodden pages' },
    ],
    text: {
      offer: "Under the green lamp the pages on my rack are letters. The wraiths over the north shore are made of more of them. Pull a few down and bring me the pages before they blow off again. Five. Wet is fine. I have a rack for wet.",
      progress: 'The north shore. They cut, and they skip. Bring the pages, not the wraiths.',
      complete: "Every one begins 'Odo'. Not one of them is signed. Somebody wrote to Odo for years and never sent a word of it. I know only one man who writes that small.",
    } }),
  mb_pages_to_ewan: Q({ id: 'mb_pages_to_ewan', num: 311, name: 'Return to Sender', level: 16, size: 0.15, giver: 'mb_osric', turnIn: 'mb_ewan',
    requires: { quests: ['mb_wet_pages'] },
    objectives: [{ kind: 'deliver', item: 'mb_dried_pages', to: 'mb_ewan', where: [AT.ewan], label: 'Take the dried pages to Ewan Strake' }],
    giveOnAccept: [{ item: 'mb_dried_pages', qty: 1 }],
    text: {
      offer: "Ewan Strake walks the Chime Road north, the wrong way round. He writes small. Take him these, dried and stacked. If they are not his, he will say so. If they are, he will say so louder.",
      progress: 'North road, past the seventh post. Look for a man ringing the posts backwards.',
      complete: "(Ewan turns the pages over one by one.) Mine. I threw them in the tarn, a few at a time, for forty years. I thought water was where words went to be quiet. Apparently not.",
    } }),

  // ------------------------------------------------ Sorrel's side jobs (the Tarn Overlook)
  mb_pim_wanders: Q({ id: 'mb_pim_wanders', num: 312, name: 'The Boar-Watcher', level: 16, size: 0.25, giver: 'sorrel', turnIn: 'sorrel',
    requires: { quests: ['mo_peat_and_tusk'] },
    objectives: [{
      kind: 'escort', npc: 'mb_pim',
      from: { zone: M, x: 104, y: 80 },
      to: { zone: M, x: 84, y: 61, r: 4 },
      fail: 'death',
      ambush: [
        { at: { x: 97, y: 74, r: 3 }, mobs: [{ mob: 'mist_wolf', level: 15 }] },
        { at: { x: 90, y: 67, r: 3 }, mobs: [{ mob: 'mist_wolf', level: 15 }, { mob: 'mist_wolf', level: 14 }] },
      ],
      where: [at(M, 104, 80, 3), at(M, 84, 61, 4)], label: 'Bring Pim back to the overlook',
    }],
    rewards: { choice: ['sorrels_peat_boots', 'reedwoven_mantle', 'drowned_shrine_charm'] },
    text: {
      offer: "My sister's boy, Pim, has gone up the heath to watch the boars. He wants to be a boar-watcher. There is no such job. Fetch him back to the overlook before he invents it. The mist comes in off the heath this time of day, and the wolves come with it.",
      progress: 'South on the heath. He will be lying in the gorse, very still, very proud of it.',
      complete: "Pim. Inside. Wash. (A look that does not soften at all.) Thank you. He says the boars nodded at him. I expect they were measuring him.",
    } }),
  mb_odos_stove: Q({ id: 'mb_odos_stove', num: 313, name: "Odo's Stove", level: 15, size: 0.15, giver: 'sorrel', turnIn: 'odo',
    requires: { quests: ['mo_peat_and_tusk'] },
    objectives: [{ kind: 'deliver', item: 'mb_peat_brick', to: 'odo', where: [AT.odo], label: 'Take the peat brick up to Odo' }],
    giveOnAccept: [{ item: 'mb_peat_brick', qty: 1 }],
    text: {
      offer: "Odo burns heather in his stove because he will not ask me for peat. Heather burns like a bad mood: bright and short. Take him a brick. Do not say it is from me. He will know. He will pretend not to. That is how we get on.",
      progress: "Up to the hut under the tower. Hand it over and leave before he thanks you. He is bad at it.",
      complete: "Peat. From nobody, I suppose. Tell nobody that Odo says it is very square. Odo, be gracious. ...Thank you.",
    } }),
  mb_hollow_hum: Q({ id: 'mb_hollow_hum', num: 314, name: 'Something Hums', level: 16, size: 0.15, giver: 'sorrel', turnIn: 'sorrel',
    requires: { quests: ['mo_peat_and_tusk'] },
    objectives: [
      { kind: 'explore', zone: M, area: 'mb_hollow_mouth', where: [AT.hollow], label: 'Listen at the mouth of Tarn Hollow' },
      { kind: 'kill', mob: 'mist_wolf', zone: M, count: 6, where: AT.southWolves, label: 'Mist Wolves by the Chime Road' },
    ],
    text: {
      offer: "On still nights the ground by the tarn hums. Low, like a bell somebody is holding. It comes from the hollow on the south shore. Go and listen. You do not have to go in. And thin the wolves on the way, they have started sleeping on my turf stack.",
      progress: 'The hollow by the south shore. Listen, do not go in. Unless you want to. I will not stop you.',
      complete: "A bell, under the water? I knew it. Well, I did not know it. I suspected it loudly. Odo will want to hear that.",
    } }),

  // ------------------------------------------------ Forwards and Backwards (Ewan Strake, the Chime Road north)
  mb_the_other_walker: Q({ id: 'mb_the_other_walker', num: 315, name: 'The Other Walker', level: 15, size: 0.15, giver: 'odo', turnIn: 'mb_ewan',
    requires: { quests: ['mo_mist_pack'] },
    objectives: [{ kind: 'talk', npc: 'mb_ewan', where: [AT.ewan], label: 'Find who rings the posts backwards' }],
    text: {
      offer: "Someone rings my posts in the wrong order. Nine, eight, seven, at dusk, when I have rung them right at dawn. I know who. I am not going to say his name. Go along the north road past the seventh post. Tell him Odo has noticed. Odo, do not say anything else.",
      progress: 'Past the seventh post. He will be ringing something. Backwards.',
      complete: "Odo noticed? Forty years and he noticed. Good. I ring them backwards so the words wear evenly. You do not read a book from one end only. Well, he does.",
    } }),
  mb_ewans_round: Q({ id: 'mb_ewans_round', num: 316, name: 'Nine to One', level: 16, size: 0.25, giver: 'mb_ewan', turnIn: 'mb_ewan',
    requires: { quests: ['mb_the_other_walker'] },
    objectives: [
      { kind: 'explore', zone: M, area: 'chime_post_7', where: [AT.post7], label: 'Ring post 7' },
      { kind: 'explore', zone: M, area: 'chime_post_6', where: [AT.post6], label: 'Ring post 6' },
      { kind: 'kill', mob: 'mist_wolf', zone: M, count: 6, where: AT.northWolves, label: 'Mist Wolves off the north road' },
    ],
    text: {
      offer: "My knees have joined Odo's side. Ring seven, then six, for me, and see the wolves off the road while you are at it. The packs up here hunt in threes. Count them. Then count them again, there is always one more.",
      progress: "Seven, then six. Backwards. The wolves can go in any order they like.",
      complete: "I heard them. Seven, six. They sound thin. Odo's sound thin too, he just will not say so. I have something he needs to see.",
    } }),
  mb_a_word_each_way: Q({ id: 'mb_a_word_each_way', num: 317, name: 'A Word Each Way', level: 17, size: 0.25, goldMult: 2, giver: 'mb_ewan', turnIn: 'odo',
    requires: { quests: ['mb_ewans_round', 'mb_pages_to_ewan'] },
    objectives: [{ kind: 'deliver', item: 'mb_ewans_half', to: 'odo', where: [AT.odo], label: "Take Ewan's half of the word to Odo" }],
    giveOnAccept: [{ item: 'mb_ewans_half', qty: 1 }],
    rewards: { choice: ['odos_chime_cord', 'stair_climbers_boots', 'tower_guard_gauntlets'] },
    text: {
      offer: "When we fell out we broke the slate the old word was on. I kept my half, he kept his. Take him mine. Tell him it is not an apology. It is not. It is a slate.",
      progress: 'To the hut under the tower. He will say he lost his half. He did not. He keeps it under the kettle.',
      complete: "(Odo lifts the kettle. Under it, a half-slate.) KE. And his: TP, backwards. KEPT. Forty years. Odo, ring four. ...Hear that? Faint, but there. Tell him. No. I will tell him. Odo, be brave.",
    },
    hook: { lines: [
      'Odo rings the fourth post from his door, forwards.',
      'Far along the road, a second chime answers, backwards.',
      'For a moment the two notes sit on top of each other.',
      'The fourth post, the one that lost its word this spring, hums.',
      '"Kept," Odo says, to nobody. "Somebody meant that."',
    ] } }),

  // ------------------------------------------------ The Watchers' Glass (Corra Vane, the Stile)
  mb_inked_glass: Q({ id: 'mb_inked_glass', num: 318, name: 'Glass Under Ink', level: 17, size: 0.2, giver: 'mb_corra', turnIn: 'mb_corra',
    requires: { quests: ['mo_mist_pack'] },
    objectives: [{ kind: 'collect', item: 'mb_inked_glass', count: 6, where: [AT.inkRidge], label: 'Inked lamp glass from the Ink Wraiths' }],
    text: {
      offer: "Corra Vane. I grind glass. The ink wraiths on the Ridgeline carry shards of watcher lamp glass inside them, the way a pearl carries grit. Six shards, please. They throw ink and it slows you. Do not stand in it, it is worse than it looks, and it looks bad.",
      progress: 'The Ridgeline. Glass inside ink. Do not stand in the puddles.',
      complete: "Six. Under the ink this glass is perfectly clear. The watchers made the best glass in the valley and then pointed it at the roads for three hundred years.",
    } }),
  mb_stile_roots: Q({ id: 'mb_stile_roots', num: 319, name: 'Roots at the Stile', level: 18, size: 0.15, giver: 'mb_corra', turnIn: 'mb_corra',
    requires: { quests: ['mb_inked_glass'] },
    objectives: [
      { kind: 'explore', zone: M, area: 'the_stile', where: [AT.stile], label: 'Look over the Stile' },
      { kind: 'collect', item: 'mb_stile_root', count: 4, where: [AT.stile], label: 'Stile roots' },
    ],
    text: {
      offer: "To get the ink off you want a slow, clean heat. The roots that choke the Stile burn that way. Four lengths. Have a look over the Stile while you are there. Nobody has crossed it in my lifetime. The roots like it that way.",
      progress: 'Four roots. Pull, do not cut. They take cutting personally.',
      complete: "Pale and dry. Good. Did you look over? Terraces. Gardens, once. The roots have kept them very neatly for nobody.",
    } }),
  mb_ridge_ink: Q({ id: 'mb_ridge_ink', num: 320, name: 'Ink on the Ridge', level: 18, size: 0.25, giver: 'mb_corra', turnIn: 'mb_corra',
    requires: { quests: ['mb_inked_glass'] },
    objectives: [
      { kind: 'kill', mob: 'ink_wraith', zone: M, count: 8, where: [AT.inkRidge], label: 'Ink Wraiths on the Ridgeline' },
      { kind: 'explore', zone: M, area: 'ridgeline', where: [AT.ridgeline], label: 'Look east from the Ridgeline' },
    ],
    text: {
      offer: "While the roots dry, thin the wraiths on the Ridgeline. Eight. Then stand on the top and look east. There is a town out there past the river. Tell me if you can read its name. I never can. I grind glass for a living and I cannot read it.",
      progress: 'Eight wraiths, then the view. The town is out east. Its name is not.',
      complete: "You could not read it either. Good. I mean, not good. But I am glad it is not my eyes.",
    } }),
  mb_count_the_lamps: Q({ id: 'mb_count_the_lamps', num: 321, name: 'Through the Lens', level: 19, size: 0.3, goldMult: 2, giver: 'mb_corra', turnIn: 'odo',
    requires: { quests: ['mb_stile_roots', 'mb_ridge_ink'] },
    objectives: [
      { kind: 'explore', zone: M, area: 'chime_post_8', where: [AT.post8], label: 'Read post 8 through the lens' },
      { kind: 'deliver', item: 'mb_watch_lens', to: 'odo', where: [AT.odo], label: 'Give the lens to Odo' },
    ],
    giveOnAccept: [{ item: 'mb_watch_lens', qty: 1 }],
    rewards: { choice: ['tower_guard_gauntlets', 'stair_climbers_boots', 'odos_chime_cord'] },
    text: {
      offer: "The lens is done. Clean as cold water. Take it up to the eighth post, under the tower, and read it through the lens. The sentinels walk there, so read quickly. Then give it to Odo. He has looked at the ninth from his door every day for fifty years. He should see it properly once.",
      progress: 'The eighth post, under the tower. Read fast, the sentinels do not like being read.',
      complete: "(Odo holds the lens a long time before he looks.) The ninth says KEPT. It always has. Through this it says it the way it did when it was cut. And the sentinels. Look. WATCH THE ROADS, inside every one. Somebody told them that and never told them to stop.",
    },
    hook: { lines: [
      'Odo sets the lens in his window, facing the tower.',
      'From the door you can see the ninth post through it, and the word on it, clear and new.',
      'Behind it a sentinel walks its round, as it has for three hundred years.',
      '"It is not their fault," Odo says. "They were told."',
      'He leaves the lens where it is.',
    ] } }),

  // ------------------------------------------------ late jobs (18 to 20)
  mb_thin_the_rounds: Q({ id: 'mb_thin_the_rounds', num: 322, name: 'Thin the Rounds', level: 19, size: 0.2, giver: 'odo', turnIn: 'odo',
    requires: { quests: ['mo_ninth_chime'] },
    objectives: [{ kind: 'kill', mob: 'tower_sentinel', zone: M, count: 3, where: [AT.sentinels], label: 'Tower Sentinels stopped' }],
    text: {
      offer: "The sentinels have started walking their rounds down to my door. Three of them, last night, standing in the heather looking at my chimes. Stop three. They walk in pairs, and they sweep the lamp in front of them before they hit. Stand to the side. That is all the advice I have. It is good advice.",
      progress: 'Three. Stand to the side of the lamp. Odo, stop watching from the window.',
      complete: "Quiet. They will build more, or the tower will. But not tonight. Tonight Odo sleeps.",
    } }),
  mb_thread_for_tamsin: Q({ id: 'mb_thread_for_tamsin', num: 323, name: 'Thirty Years Late', level: 19, size: 0.15, giver: 'odo', turnIn: 'tamsin', zone: 'downs',
    requires: { quests: ['mb_a_word_each_way'] },
    objectives: [{ kind: 'deliver', item: 'mb_chime_thread', to: 'tamsin', where: [AT.tamsin], label: 'Take the chime thread to Tamsin in Thornfold' }],
    giveOnAccept: [{ item: 'mb_chime_thread', qty: 1 }],
    text: {
      offer: "Tamsin's mother gave me the thread my chimes hang on, the year I took the posts. I said I would return the favour. That was thirty years ago. This is the best of it, waxed and wound. Take it down to her. Tell her it is late. She will already know.",
      progress: 'Down the Ridge to Thornfold. The Loom House. Tell her it is late.',
      complete: "Odo's chime thread. My mother's wax, still on it. He is thirty years late. (She winds it twice round her hand.) Tell him it was worth the wait. Then tell him it was not, so he does not get ideas.",
    } }),
  mb_survey_for_mira: Q({ id: 'mb_survey_for_mira', num: 324, name: 'Fair Copy', level: 20, size: 0.15, giver: 'mb_linnet', turnIn: 'mira', zone: 'willowmere',
    requires: { quests: ['mb_the_long_pace'], level: 18 },
    objectives: [{ kind: 'deliver', item: 'mb_full_survey', to: 'mira', where: [AT.mira], label: 'Take the survey to Mira in Willowmere' }],
    giveOnAccept: [{ item: 'mb_full_survey', qty: 1 }],
    text: {
      offer: "The survey is done and fair-copied. Every pace between every post, and a note at the end that I have rewritten six times. Mira in Willowmere copies the old carvings before the weather takes them. She should have this. It is about words going thin, really. I only measured it.",
      progress: 'Willowmere, Mira. She counts letters. She will like the columns.',
      complete: "(Mira reads the note at the end twice, then counts something on her fingers.) Fifty-three paces at the fourth post. That is the one that lost its word. Thank you. I am going to copy this. Twice.",
    } }),
  mb_heath_cairn: Q({ id: 'mb_heath_cairn', num: 325, name: 'The Fallen Cairn', level: 17, size: 0.15, giver: 'mb_linnet', turnIn: 'mb_linnet',
    requires: { quests: ['mb_the_long_pace'] },
    objectives: [{ kind: 'collect', item: 'mb_cairn_stone', count: 5, where: [AT.cairns], label: 'Tally stones from the fallen cairn' }],
    text: {
      offer: "When I drove the heath stake I tripped over a fallen cairn. Every stone has a tally scratched on it. Shepherds' counts, I think, from before the posts. Bring me five. If they counted paces, I want to know what they got.",
      progress: 'The south of the heath. Flat stones, scratched. Mind the boars, they sleep on them.',
      complete: "Fifty. Fifty. Fifty. And this one, forty-nine, and a little drawing of a boar. I suspect the boar was the cause.",
    } }),
};

// tag the story chains (part n of m; the card on the last step)
for (const [id, ch] of Object.entries(CHAINS)) ch.steps.forEach((qid, i) => {
  QUESTS[qid].story = { id, name: ch.name, step: i + 1, of: ch.steps.length, ...(i === ch.steps.length - 1 ? { end: ch.end } : {}) };
});
export const MB_QUESTS = QUESTS;
export const MB_QUEST_ORDER = Object.keys(QUESTS).sort((a, b) => QUESTS[a].level - QUESTS[b].level || QUESTS[a].num - QUESTS[b].num);
export const MB_CHAINS = CHAINS;

/** content -> content with the Moor band merged in. `toWorld` is buildContent's worldQuests (area tiles -> the world). */
export function applyMoorBand(C, toWorldQuests) {
  const mobs = { ...C.mobs };
  for (const [id, rows] of Object.entries(MB_DROPS)) {
    const m = mobs[id];
    if (!m) continue;
    mobs[id] = { ...m, loot: { ...m.loot, table: [...((m.loot && m.loot.table) || []), ...rows] } };
  }
  const quests = toWorldQuests ? toWorldQuests(MB_QUESTS) : MB_QUESTS;
  return {
    ...C,
    mobs,
    npcs: { ...C.npcs, ...MB_NPCS },
    items: { ...C.items, ...MB_ITEMS },
    quests: { ...C.quests, ...quests },
    sideQuests: [...(C.sideQuests || []), ...MB_QUEST_ORDER],
  };
}

// Story chains (the open world, 2026-11-22): one per questing area, linking quests that already exist into a short tale
// with a lead-in at every step, a story card when the last one is handed in, and a better last reward. Plain data.
//
// Nothing here renames a quest or changes an id. A chain only:
//   - ADDS prerequisites (`requires`) to later steps (never removes one), so a fresh hero walks the steps in order;
//   - counts a step as done for its successors when the hero has done (or holds) any LATER step of the same chain, so a
//     save that already finished part of a chain out of order is never locked out (src/sim/quests.js status);
//   - appends a lead-in line to the end of a step's `complete` text (and may prefix the next step's `offer`);
//   - adds `rewards.items` and gold to the last step;
//   - tags each step `story: { id, name, step, of }` (the dialog shows "part 2 of 4").
// The sim emits `story` when the last step is turned in (src/sim/worldlife.js); the HUD shows the card.
// Every step's order agrees with QUEST_ORDER (qa/sim/worldlife.test.mjs checks it). Text is original.
export const STORY_CHAINS = [
  {
    id: 'keepers_and_copies', name: 'Keepers and Copies', area: 'valley',
    steps: ['wm_keeper_marks', 'wm_copied_twice', 'wm_rhythm_of_the_forge'],
    addRequires: { wm_rhythm_of_the_forge: ['wm_copied_twice'] },
    leadIns: {
      wm_copied_twice: { complete: "One page is not a name at all. It says DONG, dong, dong, DONG, rest, in very angry capitals. That is Garrick's forge rhythm, I would know it anywhere. He lost it in the spring and has been hammering out of time ever since. Take it to him. Gently. He bites." },
      wm_rhythm_of_the_forge: { offer: "(Garrick reads the page twice, then a third time, mouthing the beats.) DONG, dong, dong, DONG. Rest. There it is. Six months of crooked nails, and the slimes had it. Right. I owe you a weapon worth the rhythm." },
    },
    reward: { gold: 15, items: ['forge_song_locket'] },
    story: {
      title: 'Keepers and Copies',
      lines: [
        'Mira counted forty-one letters, and you made her count them again.',
        'Quill copied every name twice, and one of the names turned out to be a song.',
        'Garrick is hammering on the beat again. The whole of Willowmere can hear it, and for once nobody minds.',
        'Speak, and be kept. Somebody in this valley is still keeping things.',
      ],
    },
  },
  {
    id: 'tamsins_sampler', name: "Tamsin's Sampler", area: 'downs',
    steps: ['dn_name_in_the_hem', 'dn_black_in_the_fold', 'dn_eleven_pockets', 'dn_rubbings'],
    addRequires: { dn_black_in_the_fold: ['dn_name_in_the_hem'], dn_eleven_pockets: ['dn_black_in_the_fold'], dn_rubbings: ['dn_eleven_pockets'] },
    leadIns: {
      dn_name_in_the_hem: { complete: 'Brindle came by asking for you while you were off chasing rams. Something about the old fold, and a smell like a schoolroom.' },
      dn_black_in_the_fold: { complete: 'Take a wisp of this to Tamsin. If anyone in the Downs knows what a page is doing under a sheep fold, it is the woman who sews names into hems.' },
      dn_eleven_pockets: { offer: '(Tamsin sniffs the inky hay and goes quiet.) Old ink. My grandmother said the first names here were written, not sewn. I will think on it. Meanwhile, a smaller trouble, with feathers.',
        complete: 'Look at the marks on these buttons. Older than the families who wear them. I have seen them once before, carved on the Standing Stones.' },
    },
    reward: { gold: 25, items: ['sampler_thread_charm'] },
    story: {
      title: "Tamsin's Sampler",
      lines: [
        'A tuft of fleece for a hem. A fold that grew ink instead of grass. Six stolen buttons, each with a mark older than its owner.',
        'And four names from the Standing Stones, held still in thread before they could fade any further.',
        "Tamsin's sampler hangs darker on her wall now. She says something in it is holding.",
        'The crows say nothing, which for crows is a kind of apology.',
      ],
    },
  },
  {
    id: 'sorrels_tarn', name: "Sorrel's Tarn", area: 'moor',
    steps: ['mo_fifty_paces', 'mo_peat_and_tusk', 'mo_wraiths_on_the_water'],
    leadIns: {
      mo_peat_and_tusk: { complete: 'While you are standing there with your tusks: something flies low over the tarn at night. Paper. I am a peat-cutter, not a librarian, and I would like it to stop.' },
    },
    reward: { gold: 40, items: ['peat_smoke_charm'] },
    story: {
      title: "Sorrel's Tarn",
      lines: [
        'You rang four chime posts for an old man whose legs had stopped agreeing with him.',
        'You stepped aside, not bravely, while six boars learned what a peat spade is for.',
        'And the loose pages over the tarn are only reeds again. Sorrel sleeps with her door open.',
        'Somewhere up the hill, a lamp in the Watchtower is still lit. Nobody on the moor wants to guess who keeps it.',
      ],
    },
  },
];

// The chains' last rewards ([id, name, slot, type, ilvl, stats, rarity]): gold `rare` charms anyone can wear, ilvl = the
// quest's minimum level + 2 so each can be worn the moment it is handed in (qa/world/fixpass1.test.mjs critique 13).
export const CHAIN_REWARDS = [
  ['forge_song_locket', 'Forge-Song Locket', 'trinket', null, 5, { main: 2, sta: 2 }, 'rare'],
  ['sampler_thread_charm', 'Sampler Thread Charm', 'trinket', null, 11, { main: 3, sta: 2, spi: 1 }, 'rare'],
  ['peat_smoke_charm', 'Peat-Smoke Charm', 'trinket', null, 16, { main: 4, sta: 3 }, 'rare'],
];

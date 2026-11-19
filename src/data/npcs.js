// Lexicon Realms NPCs: Willowmere, Shepherd's Downs and the High Moor.
// Source of truth: docs/design/ZONES_QUESTS.md section 2.1 (Willowmere cast) and 5.1 (givers and turn-ins).
// Set in the month before Lexicon Quest's Episode 1: nothing has gone wrong in town yet.
// `lq` is the matching Lexicon Quest NPC id (null for NPCs new to the Realms).

const SLOTS = ['head', 'chest', 'legs', 'feet', 'hands'];
const armor = (type, ilvl) => SLOTS.map((s) => ({ item: `gear_${type}_${s}`, ilvl }));
const WEAPONS = ['gear_sword', 'gear_shield', 'gear_dagger', 'gear_bow', 'gear_rod', 'gear_quill', 'gear_bell', 'gear_book'];

export const NPCS = {
  // ---------------------------------------------------------------------------------------------
  // Willowmere: quest givers and services
  // ---------------------------------------------------------------------------------------------
  mael: {
    id: 'mael', name: 'Elder Mael', sprite: 'npc_elder', title: null, faction: 'friendly', roles: ['quest'],
    vendor: null, trainer: null, innkeeper: false, lq: 'mael',
    talk: [
      'Good morning. Go gently. Old places do not like to be hurried.',
      'I check the Register every morning, before my tea. Habit. A good one.',
      'These knees have opinions about the well steps. I let them win.',
    ],
  },

  hob: {
    id: 'hob', name: 'Hob', sprite: 'npc_innkeeper', title: 'Innkeeper', faction: 'friendly', roles: ['quest', 'innkeeper'],
    vendor: null, trainer: null, innkeeper: true, lq: 'hob',
    talk: [
      'Welcome to the Lantern Inn! A bed, a meal, a story. The story is free.',
      'I write every guest in the book twice. Once for them, once in case the first one wanders off.',
      'Nobody ever saved the world on no sleep. Rest first.',
    ],
  },

  holt: {
    id: 'holt', name: 'Sergeant Holt', sprite: 'npc_guard', title: 'Warden Trainer', faction: 'friendly', roles: ['quest', 'trainer'],
    vendor: null, trainer: { cls: 'warden' }, innkeeper: false, lq: 'holt',
    talk: [
      'Stand where the trouble has to go through you. That is the whole of the job.',
      'A gate is only a gate if somebody stands at it. Today that is me.',
      'Bram keeps the left post, I keep the right. We argue about which is better.',
    ],
  },

  hazel: {
    id: 'hazel', name: 'Hazel', sprite: 'npc_parent', title: 'Mender Trainer', faction: 'friendly', roles: ['trainer'],
    vendor: null, trainer: { cls: 'mender' }, innkeeper: false, lq: 'hazel',
    talk: [
      'Mine is off up the road somewhere. Probably not eating. Sit down, I will teach you a mend.',
      'A cut wants cleaning, a fever wants broth, and a worry wants a chore. I have all three.',
      'Eat first. Then mend. In that order. With nothing left out.',
    ],
  },

  iris: {
    id: 'iris', name: 'Iris', sprite: 'npc_scholar', title: 'Scribe Trainer', faction: 'friendly', roles: ['trainer'],
    vendor: null, trainer: { cls: 'scribe' }, innkeeper: false, lq: 'iris',
    talk: [
      'A word, properly written, is a small and stubborn thing. Write it properly.',
      'Mira is somewhere in the stacks. If you hear a book sigh, that is her.',
      'Quiet, please. The books are reading.',
    ],
  },

  tess: {
    id: 'tess', name: 'Tess', sprite: 'npc_tess', title: 'Wayfinder Trainer', faction: 'friendly', roles: ['trainer'],
    vendor: null, trainer: { cls: 'wayfinder' }, innkeeper: false, lq: 'tess',
    talk: [
      'A courier never loses her way. She sometimes takes the scenic one.',
      'Mind your boots. They know the roads better than you do. Let them lead.',
      "Every road goes somewhere. I'd like to see them all before I'm old.",
    ],
  },

  sloe: {
    id: 'sloe', name: 'Sloe', sprite: 'npc_sloe', title: 'Inkblade Trainer', faction: 'friendly', roles: ['trainer'],
    vendor: null, trainer: { cls: 'inkblade' }, innkeeper: false, lq: null,
    talk: [
      'You walked right past me. Good. Now you know what the lesson is.',
      'Hob lets me the cellar. It is quiet, and the cheese does not ask questions.',
      'Shadow is only ink that has not settled yet. Step where it pools.',
    ],
  },

  mira: {
    id: 'mira', name: 'Mira', sprite: 'mira', title: null, faction: 'friendly', roles: ['quest'],
    vendor: null, trainer: null, innkeeper: false, lq: 'mira',
    talk: [
      'Forty-one books about the old Keepers, and I have read forty. The last one bites.',
      'If you find a carving anywhere in the valley, tell me. I will want to copy it.',
    ],
  },

  bram: {
    id: 'bram', name: 'Bram', sprite: 'bram', title: null, faction: 'friendly', roles: ['quest'],
    vendor: null, trainer: null, innkeeper: false, lq: 'bram',
    talk: [
      'Holt says the left post builds character. I think he just likes the right one.',
      "Dad says don't rush a fight. I say don't keep it waiting either.",
    ],
  },

  oren: {
    id: 'oren', name: 'Oren', sprite: 'npc_baker', title: 'Baker', faction: 'friendly', roles: ['quest', 'vendor'],
    vendor: { items: [{ item: 'honey_roll' }] }, trainer: null, innkeeper: false, lq: 'oren',
    talk: [
      'Honey rolls, fresh! Well. Fresh this morning. Fresh enough.',
      'Shh. The dough is rising. It gets shy if you watch.',
      'My brother says my rolls are too sweet. My brother is wrong, and has been for forty years.',
    ],
  },

  garrick: {
    id: 'garrick', name: 'Garrick', sprite: 'npc_smith', title: 'Smith', faction: 'friendly', roles: ['quest', 'vendor'],
    vendor: {
      items: [
        ...armor('plate', 6),
        ...armor('mail', 6),
        { item: 'gear_sword', ilvl: 6 },
        { item: 'gear_shield', ilvl: 6 },
      ],
    },
    trainer: null, innkeeper: false, lq: 'garrick',
    talk: [
      'Do not rush a forge.',
      'Respect the rhythm.',
      'Hm. Good steel. Bad grip. Fix the grip.',
    ],
  },

  pell: {
    id: 'pell', name: 'Pell', sprite: 'npc_shopkeeper', title: 'General Goods', faction: 'friendly', roles: ['quest', 'vendor'],
    vendor: {
      items: [
        { item: 'potion' },
        { item: 'ether' },
        { item: 'antidote' },
        { item: 'travel_satchel' },
        ...armor('cloth', 6),
        ...armor('leather', 6),
        { item: 'gear_dagger', ilvl: 6 },
        { item: 'gear_bow', ilvl: 6 },
        { item: 'gear_rod', ilvl: 6 },
        { item: 'gear_quill', ilvl: 6 },
        { item: 'gear_bell', ilvl: 6 },
        { item: 'gear_book', ilvl: 6 },
      ],
    },
    trainer: null, innkeeper: false, lq: 'pell',
    talk: [
      'Welcome to Willowmere Goods! That is a Potion. The label says POTION. So does the label on the label.',
      'Buy a spare antidote. Buy two. I worry. It is most of what I do.',
      'Everything here is labeled twice. The labels too. Just in case.',
    ],
  },

  cobb: {
    id: 'cobb', name: 'Cobb', sprite: 'npc_farmer', title: null, faction: 'friendly', roles: ['quest'],
    vendor: null, trainer: null, innkeeper: false, lq: 'cobb',
    talk: [
      'Henrietta runs the coop. Bertha sits on things. The rest are working on their personalities.',
      'I named every one of my hens. They have never once said thank you.',
    ],
  },

  nella: {
    id: 'nella', name: 'Nella', sprite: 'npc_ferry', title: null, faction: 'friendly', roles: ['quest'],
    vendor: null, trainer: null, innkeeper: false, lq: 'nella',
    talk: [
      'Every rope has its own sound. That one is called Grumble. You can hear why.',
      'If you see a small girl chasing a large duck, that is my daughter. Wave. She will not stop.',
    ],
  },

  // ---------------------------------------------------------------------------------------------
  // Willowmere: ambient
  // ---------------------------------------------------------------------------------------------
  lark: {
    id: 'lark', name: 'Lark', sprite: 'npc_child_b', title: null, faction: 'friendly', roles: ['ambient'],
    vendor: null, trainer: null, innkeeper: false, lq: 'lark',
    talk: [
      'I am the tag champion of Willowmere. Officially. I decided.',
      'The Duke is a duck of low character. One day I will catch him.',
    ],
  },

  wick: {
    id: 'wick', name: 'Wick', sprite: 'npc_child_a', title: null, faction: 'friendly', roles: ['ambient'],
    vendor: null, trainer: null, innkeeper: false, lq: 'wick',
    talk: [
      'My mum sewed my name in my collar. So it does not get lost. Or I do not.',
      'Lark always wins at tag. I think she cheats. Do not tell her I said.',
    ],
  },

  pip: {
    id: 'pip', name: 'Pip', sprite: 'npc_bellkeeper', title: null, faction: 'friendly', roles: ['ambient'],
    vendor: null, trainer: null, innkeeper: false, lq: 'pip',
    talk: [
      'Twelve bells, every hour on the hour. I count them. I ALWAYS count.',
      'Eh? Speak into the left ear. The right one belongs to the bells.',
      'Bells talk, you know. Nobody listens. Except bells.',
    ],
  },

  edda: {
    id: 'edda', name: 'Edda', sprite: 'npc_old_woman', title: null, faction: 'friendly', roles: ['ambient'],
    vendor: null, trainer: null, innkeeper: false, lq: 'edda',
    talk: [
      'A bed for every founding family, dear. Twelve of them, and one spare. I like a spare.',
      'The lantern blossoms are coming up early. They like being talked to.',
    ],
  },

  // ---------------------------------------------------------------------------------------------
  // The valley
  // ---------------------------------------------------------------------------------------------
  penny: {
    id: 'penny', name: 'Penny', sprite: 'npc_penny', title: 'Peddler', faction: 'friendly', roles: ['quest', 'vendor'],
    vendor: { items: [{ item: 'potion' }, { item: 'ether' }] }, trainer: null, innkeeper: false, lq: 'penny',
    talk: [
      'Supplies for the road! Potions, remedies, and directions. The directions are free.',
      'My brother worries enough for both of us, so I do not have to. Very efficient.',
    ],
  },

  quill: {
    id: 'quill', name: 'Quill', sprite: 'npc_quill', title: null, faction: 'friendly', roles: ['quest'],
    vendor: null, trainer: null, innkeeper: false, lq: 'quill',
    talk: [
      'I walk the pilgrim road every year to copy the milestone. Every name, twice.',
      'A name is harder to lose when it is written somewhere else. So I write it somewhere else.',
    ],
  },

  lark_escort: {
    id: 'lark_escort', name: 'Lark', sprite: 'npc_child_b', title: null, faction: 'friendly', roles: ['escort'],
    vendor: null, trainer: null, innkeeper: false, lq: 'lark',
    escort: { follow: 2, hpPct: 0.4 },
    talk: [
      'I was WINNING. The Duke was nearly tired. Nearly.',
      'He went that way! No. That way. Ducks are very sneaky.',
      'Fine, I will come home. But tell Mum I was winning.',
    ],
  },

  // ---------------------------------------------------------------------------------------------
  // Shepherd's Downs (Thornfold)
  // ---------------------------------------------------------------------------------------------
  brindle: {
    id: 'brindle', name: 'Brindle', sprite: 'npc_brindle', title: 'Shepherd', faction: 'friendly', roles: ['quest'],
    vendor: null, trainer: null, innkeeper: false, lq: 'brindle',
    talk: [
      'Twelve in the fold. Twelve is right. Twelve is always right.',
      'Never named a one of them. A sheep knows its whistle.',
      'One, two, three... twelve. I checked. I always check.',
    ],
  },

  tamsin: {
    id: 'tamsin', name: 'Tamsin', sprite: 'npc_tamsin', title: 'Weaver', faction: 'friendly', roles: ['quest', 'vendor'],
    vendor: {
      items: [
        { item: 'potion' },
        { item: 'ether' },
        { item: 'hi_potion' },
        { item: 'hi_ether' },
        { item: 'drovers_pack' },
        { item: 'loom_bag' },
        ...armor('plate', 9),
        ...armor('mail', 9),
        ...armor('leather', 9),
        ...armor('cloth', 9),
        ...WEAPONS.map((item) => ({ item, ilvl: 9 })),
      ],
    },
    trainer: null, innkeeper: false, lq: 'tamsin',
    talk: [
      'Hold still. Ah. There. That stitch is older than my mother.',
      'Every cloth I sell has a name in the hem, so it finds its way home.',
      'Look as long as you like. Touch with clean hands.',
    ],
  },

  // ---------------------------------------------------------------------------------------------
  // The High Moor
  // ---------------------------------------------------------------------------------------------
  odo: {
    id: 'odo', name: 'Odo', sprite: 'npc_odo', title: 'Chime Keeper', faction: 'friendly', roles: ['quest', 'vendor'],
    vendor: { items: [{ item: 'hi_potion' }, { item: 'hi_ether' }] }, trainer: null, innkeeper: false, lq: 'odo',
    talk: [
      'Nine posts. I count them. They count me.',
      'Visitor, Odo. Be polite. ...I am being polite. Good.',
      'Wind from the west today. Good for chimes. Bad for hats.',
    ],
  },

  sorrel: {
    id: 'sorrel', name: 'Sorrel', sprite: 'npc_sorrel', title: 'Peat-cutter', faction: 'friendly', roles: ['quest'],
    vendor: null, trainer: null, innkeeper: false, lq: null,
    talk: [
      'Every hearth in Thornfold burns my peat. I like to think they think of me. They do not.',
      'Cut it square, stack it dry, and never argue with a boar.',
    ],
  },
};

export const NPC_IDS = Object.keys(NPCS);

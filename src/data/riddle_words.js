// Riddles friends write (wave 9 riddles, approved 2026-11-25; D:/LQOnline/wave9/riddles/BRIEF.md). Plain data: the limits,
// the blocked words and every line a player reads. Rules: src/sim/riddle.js (pure) and src/sim/riddles.js (the sim module);
// the maker, the riddle book, the stone panel and the link card: src/ui/riddle_ui.js. CONTRACTS section "Riddles".
//
// SCOTT: EVERY PLAYER-FACING LINE BELOW IS A DRAFT (riddles lane). The blocked list is the mild PLACEHOLDER you approved to
// ship; the fuller draft waits for your yes outside the repo (D:/LQOnline/wave9/riddles/blocklist_draft.txt).
export const RIDDLE_DRAFT = true;

export const RIDDLE_RULES = {
  maxStones: 5,            // a trail is 1 to 5 stones
  answerMin: 3, answerMax: 8,   // capital letters A to Z only
  titleMax: 32, clueLines: 2, clueMax: 60, hintMax: 60, endMax: 80, byMax: 16,
  minApartTiles: 10,       // stones stand at least this far apart
  clearOfTiles: 3,         // and this far from a townsfolk, a door, a portal or a quest giver
  zones: ['world'],        // the open world only (never a dungeon copy, which resets)
  wrongQuietSec: 4,        // after a wrong word the stone is quiet this long (as word doors)
  hintAfter: 2,            // the author's hint line shows after this many wrong words
  maxActive: 3,            // trails standing in one world at once
  linkMax: 4000,           // a longer #riddle= is refused before it is read
  reachPx: 80,             // stand this close to a stone to spell at it (as word doors)
  creditTiles: 12,         // every hero within this many tiles of the last stone counts it as solved (not the author)
};

// PLACEHOLDER list (whole words after the clean-up in riddle.js: case, spacing, repeated letters, 4->a 3->e 1->i 0->o
// 5->s 7->t @->a $->s). Scott's real list replaces it.
export const BLOCKED = ['damn', 'crap', 'idiot', 'stupid', 'loser', 'shutup', 'dumb'];

// DRAFT words, grouped by where they show.
export const RW = {
  // the Quest Log button and the riddle book
  riddles: 'Riddles', book: 'Riddles', solvedCount: (n) => `Riddles solved: ${n}`, fromFriends: 'From friends', mine: 'Made by you',
  noneGot: 'No riddles yet. Open a link a friend sends, or paste one.', noneMade: 'Nothing written yet.',
  putOut: 'Put out', takeDown: 'Take it down', edit: 'Edit', paste: 'Paste a riddle', pasteHere: 'Paste the link here',
  solved: 'solved', outHere: 'out here', more: (n) => `and ${n} more`,
  // the maker
  maker: 'Riddle maker', newTrail: 'New riddle trail', title: 'Title', stone: 'Stone', of: 'of',
  here: 'Set a stone here', moveHere: 'Move it here', removeStone: 'Remove stone', clue: 'Clue', hint: 'Hint (after 2 wrong words)',
  answer: 'Answer', end: 'Last words (shown when the trail is done)', show: 'Show', hide: 'Hide', letters: (n) => `${n} letters`,
  check: 'Words checked on this device', ok: 'All clear', share: 'Share', copyLink: 'Copy link', saveFile: 'Save as file',
  offerHost: 'Offer to the host', done: 'Done', placed: 'placed', placedHere: 'placed here', empty: 'not set yet', walk: 'Walk',
  makerPill: (k, n) => `Riddle maker: stone ${k} of ${n}`,
  sealed: 'Answers are sealed in the link. Later clues stay locked until the one before is solved.',
  linkCopied: 'Riddle link copied. Send it to your friends.', fileSaved: 'Riddle saved as a file.', offered: 'Offered to the host.',
  copyFailed: 'Could not copy. The link is in the paste box: select it and copy.', stoneSet: (k) => `Stone ${k} set here.`,
  newTitle: 'A riddle trail', unplaced: (k) => `Stone ${k} is not set yet: stand there and press Set a stone here.`,
  emptyClue: (k) => `Stone ${k} needs a clue.`, needTitle: 'Give the trail a title.', tooLong: 'That line is too long.',
  // the stone panel
  fromWho: (by) => `A riddle from ${by}`, stoneOf: (k, n) => `stone ${k} of ${n}`, wrongCount: (n) => `${n} wrong`,
  clear: 'Clear', tryIt: 'Try', quiet: 'The stone is settling...', wrong: 'The stone does not take that word.',
  right: 'The stone takes the word.', nextNear: (p) => `The next stone stands somewhere near ${p}.`,
  trailDone: (by) => `You solved ${by}'s riddle trail.`, hintLabel: 'Hint', keysHint: 'Type the word.  Backspace takes a letter back.  Enter tries it.',
  lastWords: (by, t) => `${by}: "${t}"`,
  // the link card and a guest's offer
  sentYou: (by) => `${by} sent you a riddle trail`, stones: (n) => `${n} stone${n === 1 ? '' : 's'}`, near: (p) => `first stone near ${p}`,
  add: 'Add to my riddles', notNow: 'Not now', never: (by) => `Hide riddles from ${by}`, putHere: 'Put it out here',
  noAnswers: 'No answers in the link. Only the first clue can be read before you solve it.',
  linkSize: (n) => `Link: ${n} letters, kept on this device only`, flagged: 'This riddle has words this game does not show.',
  hostSays: (by) => `${by} offers a riddle trail`, added: 'Added to your riddles. Its first stone is out in the world.',
  addedGuest: 'Added to your riddles. It goes out when you play your own game, or offer it to the host.',
  already: 'That riddle is already in your book.', hiddenFrom: (by) => `Riddles from ${by} are hidden on this device.`,
  // refusals (the sim's riddle_fail reasons and the maker's checks)
  badWord: 'That word is not allowed in a riddle.', noContact: 'No links, emails or phone numbers in a riddle.',
  tooClose: 'Too close to another stone.', notHere: 'A stone cannot stand here.', notZone: 'Riddle stones stand in the open world only.',
  answerShape: 'An answer is 3 to 8 letters, A to Z.', tooMany: 'A trail has at most 5 stones.',
  badLink: 'This riddle link is broken or cut short. Ask for it again.', hiddenLine: '(hidden: a word this game does not show)',
  full: 'Three riddle trails already stand in this world.', have: 'That riddle is already out in this world.',
  allDone: 'You have solved that whole trail.', range: 'Stand by the stone to spell.', gone: 'That riddle is no longer here.',
  guestOnly: 'In a friend\'s game, the host puts riddles out. Offer it to the host.',
};
// Depths (wave 10 dtiers, Scott 2026-11-25: "Yes for your recommendations"; brief D:/LQOnline/wave10/dtiers/BRIEF.md).
// Plain data. The rules live in src/sim/depths.js; the drawing in src/ui/depth_ui.js; the friends' board in
// src/net/depth_board.js. Every word a player reads here is a DRAFT for Scott.
//
// A place a hero has cleared once opens its Depths: Depth 1, 2, 3 and on with no end. Each depth makes every foe in the
// copy tougher than today's copy (never softer), adds this week's modifiers as you go deeper, and pays more. Heroes play
// at the place's band (dflow's level sync); the depth never changes a foe's level, only multiplies it up.
// The week is the Eastern calendar week (src/core/eastern_week.js), worked out from the sim's day: the same on every
// friend's machine with no server.

export const DEPTH_RULES = {
  // Depth T foes, over today's copy (its trash tuning and boss tuning stay, then this on top):
  // health x (1 + hpStep)^T, damage x (1 + dmgStep)^T. Depth 1 is already tougher than today.
  hpStep: 0.10,
  dmgStep: 0.06,
  maxDepth: 99,                          // shown as endless; a stop so numbers stay finite
  // a modifier group joins the run at this depth (one modifier per group per week)
  groups: { margin: 1, bold: 4, page: 8 },
  // the optional candle, minutes per place (DRAFTS; tune from the friends' first runs). Each fall takes deathSec off.
  // Lit and beaten: the next depth AND the one after open, and a Candle Cache by the last boss.
  candle: { barrow: 25, watchtower: 25, barrow_deep: 30, rootcellar: 10, smugglers_cut: 12, tarn_hollow: 12, larch_mine: 14, weir_works: 16 },
  deathSec: 10,
  // the weekly chest: runs this week fill its slots (1 run, 4 runs, 8 runs); slot k pays at your k-th best depth.
  // It opens on the Monday after (Eastern) and you take one piece. Only one waits at a time.
  chest: { slots: [1, 4, 8] },
  // modifier numbers (the sim reads these; the words are in DEPTH_MODS)
  mod: {
    thickInk: 1.2, runSpeed: 1.15, runAggro: 1.3, blot: { delaySec: 2, radius: 24, swings: 1.2 }, underline: { hp: 1.6, dmg: 1.2 },
    secondDraftAt: 0.3, heavyHand: { dmg: 1.15, soonerSec: 20 }, wideMargins: 1.25, fadedAggro: 1.25, errata: { at: 0.5, heal: 0.2 }, runOnLeash: 1.5,
  },
};

/** Rewards per depth, on top of today's drops (dloot rolls every piece: these are the depth's inputs to it). The sim keeps
 *  its own copy of this table (src/sim/depths.js rewardAt: the sim imports nothing from src/data); a test keeps them equal. */
export function depthReward(T) {
  const d = Math.max(0, T | 0);
  return {
    goldMul: Math.round((1 + 0.1 * d) * 100) / 100,          // every foe's gold in the copy
    glyphs: Math.floor(d / 3),                               // letter glyphs with the last boss
    extraPiece: Math.min(0.5, 0.05 * d),                     // chance of one more boss piece, rolled by dloot
    extraEpic: d >= 8,                                       // from Depth 8 that extra piece comes from the place's epic pool
    legendBonus: Math.min(0.1, 0.01 * d),                    // a second legendary chance with the last boss
    mark: [5, 10, 15, 20, 30].includes(d) ? d : null,        // a milestone mark beside your name on the board
  };
}

// The weekly modifiers. Every one only ADDS challenge (DO NOT SOFTEN: no modifier lowers a foe's number).
export const DEPTH_MODS = {
  margin: [
    { id: 'thick_ink', name: 'Thick Ink', text: 'Foes have 20% more health.' },
    { id: 'running_ink', name: 'Running Ink', text: 'Foes move 15% faster and notice you from farther off.' },
    { id: 'blotted', name: 'Blotted', text: 'A fallen foe leaves a blot that bursts after 2 seconds. Step out of it.' },
    { id: 'underlined', name: 'Underlined', text: 'One foe in every pack is Underlined: 60% more health, 20% more damage.' },
  ],
  bold: [
    { id: 'second_draft', name: 'Second Draft', text: 'At 30% health each boss calls its helpers once more.' },
    { id: 'heavy_hand', name: 'Heavy Hand', text: 'Bosses hit 15% harder and lose their temper 20 seconds sooner.' },
    { id: 'footnoted', name: 'Footnoted', text: 'Every boss phase calls one more helper.' },
    { id: 'wide_margins', name: 'Wide Margins', text: "A boss's red ground warnings are 25% wider." },
  ],
  page: [
    { id: 'faded_lamps', name: 'Faded Lamps', text: 'In the dim, foes notice you from a quarter farther.' },
    { id: 'errata', name: 'Errata', text: 'A foe at half health mends itself once, for a fifth of its health.' },
    { id: 'small_print', name: 'Small Print', text: 'Every pack has one more foe in it.' },
    { id: 'run_on', name: 'Run-on', text: 'Foes chase you half again as far before they give up.' },
  ],
};

export const DEPTH_WORDS = {
  groupNames: { margin: 'Margin', bold: 'Bold', page: 'Page' },
  row: 'Depth', off: 'Off (today)', depth: (d) => `Depth ${d}`, open: (n) => `deepest open: ${n}`, candle: 'Candle', lit: 'lit', unlit: 'off',
  strip: (d) => `Depth ${d}`, falls: (n, s) => `Falls ${n} (the candle lost ${s})`,
  board: "Friends' Depths", thisWeek: 'This week', bestEver: 'Best ever', place: 'Place', best: 'Best', time: 'Time', who: 'Who',
  send: 'Send my board', close: 'Close', foot: 'The link holds your best depths, times and who was with you.', none: 'No depth runs yet this week.',
  cameByLink: (n) => `${n}'s board came by link.`, badLink: 'That board link could not be read.',
  coffer: 'The Sevennight Coffer', cofferLine: (runs, open, d) => `${runs} ${runs === 1 ? 'run' : 'runs'} this week: ${open} of 3 slots full. Opens Monday ${d}.`,
  cofferReady: 'Your coffer is ready', cofferSub: 'Your runs last week filled it. Pick one piece.', slotHead: ['Best run', '4th best', '8th best'],
  slotNeed: (n, have) => `${n} runs: ${have} so far`, slotEmpty: 'empty', take: 'Take this one', later: 'Later', depthsBtn: 'Depths',
  cleared: (d, next) => `Depth ${d} cleared. Depth ${next} is open.`, litDone: (a, b) => `Lit! Depths ${a} and ${b} are open.`, out: 'The candle went out.',
  placeShort: { barrow: "Wethers' Barrow", watchtower: 'Watchtower', barrow_deep: 'Deep Halls', rootcellar: 'Rootcellar', smugglers_cut: "Smugglers' Cut", tarn_hollow: 'Tarn Hollow', larch_mine: 'Larch Mine', weir_works: 'Weir Works' },
  candleCache: 'Candle Cache', shareText: (n) => `${n}'s Depths this week in Lexicon Realms. Tap to see the board.`,
};

/** The content object with Depths added (buildContent calls it once). */
export function applyDepths(C) {
  return { ...C, depths: { rules: DEPTH_RULES, mods: DEPTH_MODS, words: DEPTH_WORDS } };
}

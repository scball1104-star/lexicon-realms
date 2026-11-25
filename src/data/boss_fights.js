// Boss fights that need the party (wave 10 dbosses BUILD, Scott 2026-11-25 "Go with your recommendations";
// D:/LQOnline/wave10/dbosses/BRIEF.md). Plain data plus applyBossFights(content), the last step of buildContent().
// The rules are in src/sim/boss_mech.js; the boss frame in src/ui/boss_hud.js; the ground marks in
// src/render3d/boss_marks3d.js and src/render/boss_marks2d.js.
//
// NOTHING of today's fights is removed or lowered: every ability, health and damage knob (BOSS_TUNE, DH_TUNE), add wave
// and frenzy time stays. This file only ADDS: new phase gates, one teamwork mechanic (or two), one new red move with its
// own cast slot, a hard enrage that is a soft wall, a frenzy for the three caves that had none, and the hidden version.
//
// Scott's rules for the build:
//   - a teamwork mechanic costs a LONE hero time only (a guarded boss, a heal when a call is missed), never damage they
//     cannot avoid; with friends it costs damage (shares, notches, missed calls);
//   - Unspoken is found by its hidden word, spelled on the boss's name-stone (a word door, src/sim/worddoor.js), with a
//     hint line on the stone once anyone in the copy has cleared that boss three times;
//   - the hard enrage is a soft wall: the boss's hits grow 25% every 5 s, it never resets the fight;
//   - a new red move has its own cast slot (src/sim/boss_mech.js: a ground warning of its own, it never takes a turn
//     from today's moves).
//
// ------------------------------------------------------------------------------------------------------------------
// SCOTT: EVERY NAME, YELL, CALL LINE, TRUE NAME, LOOK LINE AND HINT BELOW IS A DRAFT (dbosses lane).
// ------------------------------------------------------------------------------------------------------------------
export const BOSS_FIGHTS_DRAFT = true;

export const BOSS_RULES = Object.freeze({
  guardSec: 4, guardMul: 0.25,          // a new phase gate: the boss takes 75% less for 4 s while the mechanic plays out
  hard: { stepSec: 5, mul: 1.25, sooner: 60 },   // the Last Count: hits x1.25 every 5 s (stacking); Unspoken 60 s sooner
  reachPx: 640,                         // heroes counted in a fight: alive, in the copy, within 40 tiles (party.js reach)
  share: { radius: 40, delay: 3 }, notch: { radius: 32, delay: 4 },
  letters: { window: 8, soloWindow: 10, radius: 16, ring: 72 },
  pair: { window: 10, soloWindow: 15, reviveHp: 0.3 },
  stacks: { every: 6, add: 0.1, max: 5, dur: 10 },
  miss: { heal: 0.05 },                 // a missed call: the boss heals 5% (a lone hero's only cost)
  unspoken: { hp: 1.3, dmg: 1.15, every: 0.7 },
  hintAfter: 3,                         // the name-stone shows its hint once someone in the copy has 3 clears of the boss
});

// Roll Call words by length (one letter per hero; a lone hero gets 2). DRAFTS.
export const ROLL_WORDS = { 2: ['ON', 'NO', 'US'], 3: ['ONE', 'SUM', 'ALL'], 4: ['NAME', 'TALL', 'KNEE'] };

// The new red moves (their own cast slot: src/sim/boss_mech.js casts them as ground warnings of their own).
// shape: circle at the hero's spot / line or cone from the boss toward the hero. Damage in swings of the boss's own hit.
const RED = (id, name, shape, o) => ({ id, name, school: o.school || 'physical', castTime: o.cast, telegraph: shape, red: true, mobHit: o.hit,
  area: { shape, radius: o.r, ...(o.w ? { width: o.w } : {}), ...(o.angle ? { angle: o.angle } : {}), at: shape === 'circle' ? 'ground' : 'self' } });
export const BOSS_RED = {
  bf_lead_ram: RED('bf_lead_ram', 'Lead Ram', 'line', { cast: 1.4, w: 20, r: 112, hit: 1.4 }),
  bf_triple_rain: RED('bf_triple_rain', 'Tally Rain', 'circle', { cast: 2.0, r: 30, hit: 1.4, school: 'shadow' }),
  bf_double_ledger: RED('bf_double_ledger', 'Double Ledger', 'circle', { cast: 2.0, r: 36, hit: 1.6 }),
  bf_lamp_glare: RED('bf_lamp_glare', 'Lamp Glare', 'circle', { cast: 2.0, r: 44, hit: 2.2, school: 'light' }),
  bf_no_leave: RED('bf_no_leave', 'No Leave', 'cone', { cast: 2.0, r: 64, angle: 140, hit: 2.6 }),
  bf_sightline: RED('bf_sightline', 'Sightline', 'line', { cast: 1.6, w: 20, r: 112, hit: 2.0, school: 'light' }),
  bf_turn_herd: RED('bf_turn_herd', 'Turn the Herd', 'line', { cast: 1.4, w: 28, r: 112, hit: 2.0 }),
  bf_stone_fall: RED('bf_stone_fall', 'Stone Fall', 'circle', { cast: 2.0, r: 40, hit: 2.2, school: 'shadow' }),
  bf_kings_count: RED('bf_kings_count', "King's Count", 'circle', { cast: 2.0, r: 48, hit: 2.6 }),
  bf_run_down: RED('bf_run_down', 'Run Down', 'line', { cast: 1.2, w: 16, r: 96, hit: 1.4 }),
  bf_spill: RED('bf_spill', 'Spill', 'circle', { cast: 2.0, r: 32, hit: 1.8, school: 'ink' }),
  bf_from_mist: RED('bf_from_mist', 'From the Mist', 'circle', { cast: 1.6, r: 40, hit: 2.2 }),
  bf_cave_in: RED('bf_cave_in', 'Cave-In', 'circle', { cast: 2.0, r: 40, hit: 2.4 }),
};

// The called casts (a real, interruptible cast in the boss's own cast bar). `group` lands on every hero in the room when
// it is not interrupted; `solo` is what a lone hero pays instead (time: the boss heals).
const CALL = (id, name, castTime, school) => ({ id, name, school, castTime, interruptible: true, cooldown: 0, gcd: true, target: 'self', effects: [], bossCall: true });
export const BOSS_CALLS = {
  bf_final_tally: CALL('bf_final_tally', 'Final Tally', 3.0, 'shadow'),
  bf_long_look: CALL('bf_long_look', 'The Long Look', 4.0, 'light'),
  bf_wallow: CALL('bf_wallow', 'Wallow', 3.0, 'physical'),
  bf_drink_deep: CALL('bf_drink_deep', 'Drink Deep', 3.0, 'ink'),
  bf_relight: CALL('bf_relight', 'Relight', 3.0, 'light'),
  bf_back_to_work: CALL('bf_back_to_work', 'Back to Work', 3.0, 'shadow'),
};

const W = (o) => o;
// gates: the NEW phase gates (today's half-health adds stay as they are and count as a phase on the boss frame).
// mechs: { kind: share | notch | letters | call | pair | stacks, every (s) or gates: [at], from (health below which it
//   starts), ... }, with the call-out the boss frame shows while it is up. red: { id, every }. hard: the Last Count.
export const BOSS_FIGHTS = {
  // ---- the Wethers' Barrow (10 to 12): one habit per boss
  // the classroom: a shorter guard (2 s, none for a lone hero) and a smaller heal for a missed call (1%), so a lone
  // scribe at 11 (who already dies once a clear today) still clears within the gate
  barrow_bellwether: W({ first: 'The Bell', guardSec: 2, missHeal: 0.01, soloGuard: false,
    gates: [{ at: 0.6, name: 'The Fold Answers' }, { at: 0.3, name: 'Lead Ram', yell: 'The bell swings wide, and the flock runs.' }],
    mechs: [{ kind: 'share', every: 16, from: 0.6, swings: 2.4, title: 'SHARE THE TOLL', line: 'Stand in the gold ring together' }],
    red: { id: 'bf_lead_ram', every: 30 }, hard: { after: 240, name: 'Last Bell', yell: 'The bell will not stop ringing.' },
    unspoken: { word: 'HORN', look: 'A bell-stone, its tongue cut out. It waits for what called the flock before it.', hint: 'What called the flock before the bell? Four letters.', card: 'It leads them still, and now it leads them at you.' } }),
  barrow_tallywife: W({ first: 'The Count', guardSec: 2, missHeal: 0.01, soloGuard: false,
    gates: [{ at: 0.25, name: 'Final Tally', yell: 'The last notch is yours.' }],
    mechs: [{ kind: 'notch', every: 12, swings: 1.6, title: 'NOTCHED', line: 'Carry the violet ring away from friends' },
      { kind: 'call', gates: [0.25], ability: 'bf_final_tally', swings: 1.2, title: 'FINAL TALLY', line: 'Interrupt her, or everyone pays' }],
    red: { id: 'bf_triple_rain', every: 30 }, hard: { after: 240, name: 'Last Tally', yell: 'Every stick is full.' },
    unspoken: { word: 'NOTCH', look: 'A tally-stick of stone, every notch filled but one.', hint: 'She cuts one for every name. Five letters.', card: 'Her sticks are full, and she has started on yours.' } }),
  barrow_reeve: W({ first: 'The Ledger', guardSec: 2, missHeal: 0.01, soloGuard: false,
    gates: [{ at: 0.7, name: 'Roll Call', yell: 'ROLL CALL. ANSWER TO YOUR LETTER.' }, { at: 0.35, name: 'One Short', yell: 'AGAIN. ONE OF YOU IS MISSING.' }],
    mechs: [{ kind: 'letters', gates: [0.7, 0.35], title: 'ROLL CALL', line: 'One of you on each letter, in order' }],
    red: { id: 'bf_double_ledger', every: 30 }, hard: { after: 240, name: 'Count Again', yell: 'COUNT AGAIN. COUNT AGAIN.' },
    unspoken: { word: 'SHORT', look: 'A ledger cut in stone. The last line is blank.', hint: 'He always comes up one... Five letters.', card: 'He has found the missing name. It is yours.' } }),
  // ---- the Watchtower (18 to 20): the same habits, under pressure
  // a caster: anything in its cast bar costs a bolt, so its solo cost is the lamps (they relight after 8 s, not 15)
  watch_wickwright: W({ first: 'Trimming', pairSoloWindow: 8,
    gates: [{ at: 0.2, name: 'Every Flame Up', yell: 'EVERY FLAME UP.' }],
    mechs: [{ kind: 'pair', mob: 'watch_lamp', title: 'SNUFF THE WICKS', line: 'Both lamps out together, or one relights' }],
    red: { id: 'bf_lamp_glare', every: 30 }, hard: { after: 240, name: 'Lights Out', yell: 'No flame goes out on my stair.' },
    unspoken: { word: 'WICK', look: 'A lamp of stone with no flame in it.', hint: 'Trimmed every night, never let die. Four letters.', card: 'Every lamp on the stair turns toward you.' } }),
  watch_stair_captain: W({ first: 'The Stair',
    gates: [{ at: 0.25, name: 'No Leave', yell: 'NO LEAVE GIVEN.' }],
    mechs: [{ kind: 'stacks', title: 'LEAVE DENIED', line: 'Take turns holding him' }],
    red: { id: 'bf_no_leave', every: 20 }, hard: { after: 240, name: 'Hold the Stair', yell: 'Nobody goes up. Nobody.' },
    unspoken: { word: 'LEAVE', look: 'A step worn hollow in the middle. Ask it what it never gives.', hint: 'Nobody goes up without it. Five letters.', card: 'The Captain will not give ground, and will not give leave.' } }),
  sentinel_long_watch: W({ first: 'The Watch',
    gates: [{ at: 0.66, name: 'Eyes on the Roads', yell: 'EYES ON THE ROADS.' }, { at: 0.33, name: 'Every Road', yell: 'EVERY ROAD. EVERY NIGHT.' }],
    mechs: [{ kind: 'call', every: 26, ability: 'bf_long_look', swings: 2.0, title: 'THE LONG LOOK', line: 'Interrupt it, or the whole watch sees you' }],
    red: { id: 'bf_sightline', every: 24 }, hard: { after: 240, name: 'The Watch Never Ends', yell: 'THE WATCH NEVER ENDS' },
    unspoken: { word: 'ROADS', look: 'A brass plate: what it watches, rubbed away.', hint: 'Its last words, before the lamps go out. Five letters.', card: 'It has seen every road, and now it sees only you.' } }),
  // ---- the Barrow Deep Halls (26 to 30): the exam
  deep_drove_herd: W({ first: 'The Drive',
    gates: [{ at: 0.6, name: 'The Herd Splits', yell: 'The herd breaks in two, and both halves come for you.' }, { at: 0.3, name: 'Last of the Drove' }],
    mechs: [{ kind: 'pair', mob: 'deep_wether', gates: [0.6, 0.3], level: 26, title: 'TURN THE HERD', line: 'Both halves down together, or one comes back' }],
    red: { id: 'bf_turn_herd', every: 18 }, hard: { after: 300, name: 'Last Drove', yell: 'The Drove-Herd lowers a hundred heads.' },
    unspoken: { word: 'DROVE', look: 'A stone worn smooth by hooves.', hint: 'A herd on the move, and the road it takes. Five letters.', card: 'The whole flock, every one, and all of them angry.' } }),
  deep_cairn_counter: W({ first: 'Stone by Stone',
    gates: [{ at: 0.25, name: 'The Cairn Is Nearly Full', yell: 'The cairn is nearly full.' }],
    mechs: [{ kind: 'share', every: 18, swings: 2.6, title: 'SET THE STONE', line: 'Carry its weight together in the gold ring' }],
    red: { id: 'bf_stone_fall', every: 14 }, hard: { after: 300, name: 'The Cairn Is Full', yell: 'It counts faster, and the stones fall faster.' },
    unspoken: { word: 'CAIRN', look: 'One stone short of a cairn.', hint: 'A stone for every drover lost. Five letters.', card: 'It has a stone with your name on it.' } }),
  deep_barrow_king: W({ first: 'Court',
    gates: [{ at: 0.7, name: 'The Count', yell: 'THE COURT WILL RISE FOR THE COUNT.' }, { at: 0.4, name: 'The Last Count', yell: 'THE LAST COUNT BEGINS.' }],
    mechs: [{ kind: 'share', every: 20, swings: 3.0, radius: 48, title: 'KNEEL AND BE COUNTED', line: 'All in the gold ring' },
      { kind: 'letters', gates: [0.7, 0.4], title: 'ROLL CALL', line: 'One of you on each letter, in order' },
      { kind: 'notch', every: 14, from: 0.4, swings: 1.8, title: 'NOTCHED', line: 'Carry the violet ring away from friends' }],
    red: { id: 'bf_kings_count', every: 18 }, hard: { after: 300, name: 'The Count Is Never Done', yell: 'THE COUNT IS NEVER DONE.' },
    unspoken: { word: 'CROWN', look: 'A throne of stone, and nothing on its seat.', hint: 'The first thing counted, the last let go. Five letters.', card: 'The first name ever counted wants yours.' } }),
  // ---- the caves (one boss each, short)
  mother_mudge: W({ first: 'Rooting', frenzy: { after: 90, yell: 'Mother Mudge has had quite enough.', mods: [{ stat: 'damageDone', mul: 1.3 }, { stat: 'attackSpeed', mul: 1.2 }] },
    gates: [{ at: 0.25, name: 'Digs In', yell: 'Mother Mudge digs in.' }],
    mechs: [{ kind: 'call', every: 20, ability: 'bf_wallow', swings: 1.0, title: 'WALLOW', line: 'Interrupt her, or she heals in the mud' }],
    red: { id: 'bf_run_down', every: 18 }, hard: { after: 180, name: 'Bad Temper', yell: 'Mother Mudge is not getting up again.' },
    unspoken: { word: 'ROOTS', look: 'A root-tangled stone by her wallow.', hint: 'She went to ground among them. Five letters.', card: 'She went to ground, and she is not coming up alone.' } }),
  gutterwick: W({ first: 'Slurping', frenzy: { after: 90, yell: 'Gutterwick boils.', mods: [{ stat: 'damageDone', mul: 1.3 }, { stat: 'castTime', mul: 0.85 }] },
    gates: [{ at: 0.6, name: 'Thirsty', yell: 'Gutterwick slurps at the puddles.' }, { at: 0.3, name: 'Still Thirsty', yell: 'It is still thirsty.' }],
    mechs: [{ kind: 'call', every: 20, ability: 'bf_drink_deep', swings: 1.0, title: 'DRINK DEEP', line: 'Interrupt it, or it drinks and heals' }],
    red: { id: 'bf_spill', every: 16 }, hard: { after: 180, name: 'Boiling Over', yell: 'Gutterwick bubbles over.' },
    unspoken: { word: 'CARGO', look: 'An empty crate, stamped and stained.', hint: 'What the smugglers lost down here. Five letters.', card: 'It drank the cargo. It wants the crew.' } }),
  hollowfang: W({ first: 'Circling', frenzy: { after: 100, yell: 'Hollowfang stops circling.', mods: [{ stat: 'damageDone', mul: 1.3 }, { stat: 'attackSpeed', mul: 1.25 }] },
    gates: [{ at: 0.25, name: 'The Hunt', yell: 'The mist closes, and the hunt begins.' }],
    mechs: [{ kind: 'notch', every: 20, from: 0.7, swings: 1.6, title: 'THE HUNT', line: 'The prey runs, the others peel' }],
    red: { id: 'bf_from_mist', every: 18 }, hard: { after: 180, name: 'Pack Hunger', yell: 'The hollow howls with it.' },
    unspoken: { word: 'MIST', look: 'A shrine stone, wet with fog.', hint: 'It comes out of the hollow when it breathes. Four letters.', card: 'The mist has teeth tonight.' } }),
  lm_gaffer: W({ first: 'The Shift',
    gates: [{ at: 0.25, name: 'Blackdamp', yell: 'NOBODY GOES UP TILL THE SEAM IS CUT.' }],
    mechs: [{ kind: 'pair', mob: 'lm_damp_miner', title: 'BOTH SHIFTS DOWN', line: 'Both miners down together, or one gets up' },
      { kind: 'call', every: 22, ability: 'bf_back_to_work', swings: 1.6, title: 'BACK TO WORK', line: 'Interrupt him, or the damp rises' }],
    red: { id: 'bf_cave_in', every: 16 }, hard: { after: 180, name: 'End of Shift', yell: 'The Gaffer swings for the seam.' },
    unspoken: { word: 'SHIFT', look: 'A tally board for the shift. Every peg is out.', hint: 'He sent it down. None came up. Five letters.', card: 'The shift is still working, and you are on it.' } }),
};

/** The name-stone for a boss: a free floor tile with rock right behind it (north), 7 to 14 tiles from the boss's spawn. */
function stoneSpot(zone, bx, by) {
  const free = (x, y) => (zone.collision[y] || '')[x] === '.';
  const rock = (x, y) => (zone.collision[y] || '')[x] === '#';
  let best = null, bd = Infinity;
  // at least 7 tiles off, past a boss's pull reach (96 px = 6 tiles): you can spell its name without waking it
  for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
    const x = bx + dx, y = by + dy, d = dx * dx + dy * dy;
    if (d < 49 || d >= bd) continue;
    if (free(x, y) && rock(x, y - 1) && free(x, y + 1) && free(x - 1, y) && free(x + 1, y)) { best = [x, y]; bd = d; }
  }
  return best;
}

/** buildContent()'s last step: copies the boss templates with the merged fight, adds the moves, the name-stones. */
export function applyBossFights(C) {
  const mobs = { ...C.mobs };
  const wordDoors = { ...(C.wordDoors || {}) };
  for (const [id, f] of Object.entries(BOSS_FIGHTS)) {
    const m = mobs[id];
    if (!m) continue;
    const fight = { ...(m.fight || {}) };
    fight.phases = [...(fight.phases || []), ...f.gates.map((g) => ({ at: g.at, ...(g.yell ? { yell: g.yell } : {}), name: g.name, gate: true }))].sort((a, b) => b.at - a.at);
    if (!fight.frenzy && f.frenzy) fight.frenzy = f.frenzy;
    mobs[id] = { ...m, fight, bossFight: f };
    // the name-stone: a word door of one word in the boss's room (pouch glyphs only, no found letters, no coffer)
    const base = Object.keys(C.dungeons || {}).find((p) => (C.dungeons[p].bosses || []).includes(id));
    const zone = base && C.zones[base];
    const sp = zone && (zone.spawns || []).find((s) => s.mob === id);
    if (!zone || !sp || !f.unspoken) continue;
    const at = stoneSpot(zone, sp.x, sp.y);
    if (!at) continue;
    const did = `ns_${id}`;
    zone.dungeon = zone.dungeon || {};
    const list = zone.dungeon.wordDoors = zone.dungeon.wordDoors || [];
    if (!list.some((d) => d.id === did)) list.push({ id: did, cells: [], face: { x: at[0], y: at[1], w: 1 }, stones: [], chest: null, nameStone: id });
    wordDoors[did] = { place: base, name: 'Name-stone', look: f.unspoken.look, boss: id, nameStone: true,
      hint: f.unspoken.hint, hintAfter: BOSS_RULES.hintAfter,
      words: [{ word: f.unspoken.word, draft: true, clue: ['It waits for a name.', 'Not that name.'], opened: 'The stone takes the name. Something in the room wakes, Unspoken.' }] };
  }
  return { ...C, mobs, wordDoors, mobAbilities: { ...C.mobAbilities, ...BOSS_RED, ...BOSS_CALLS }, bossFights: BOSS_FIGHTS, bossRules: BOSS_RULES, rollWords: ROLL_WORDS };
}

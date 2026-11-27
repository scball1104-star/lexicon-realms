// Word rifts (wave 10 drift, Scott 2026-11-25 approved D:/LQOnline/wave10/drift/BRIEF.md with its recommendations: only
// today's looks and foes; the word is the word of the week or a word the hero has learned; the seal is always the rift's
// own word). Pure: no clock, no Math.random, no DOM. The sim side is src/sim/rift.js; the card src/ui/rift_ui.js.
// CONTRACTS section "Word rifts".
//
//   riftWord(text)               -> 'EMBER' | null         3 to 8 letters A to Z (case, spaces and marks are dropped)
//   riftId(word, level)          -> 'rift_ember_22'        the place id; a party's copy is 'rift_ember_22#party3'
//   parseRiftId(id)              -> { word, level } | null
//   buildRift(word, { level, out })  -> a zone in the CONTRACTS 6 shape (kind 'dungeon' or 'cave'), the same shape
//                                   tools/maps/dungeon_kit.mjs carveDungeon gives the hand-built places, plus zone.rift
//   riftPlace(zone, dungeons)    -> the src/data/dungeons.js shaped record of a rift (trash tuning, guardian, loot pools)
//   riftZoneMaker(out)           -> (id) => zone | null    copies.js addZoneMaker: content.zones['rift_ember_22'] builds it
//   weekWord(day)                -> this Eastern week's word (day = the Eastern day number, src/core/eastern_week.js)
//   riftBook(content)            -> Set of every word a rift may be opened with (all from the game's own lists)
//   RIFT_HOOKS.scale             -> null, or (place, { word, level }) => { trash?: { hp, dmg }, guardian?: { hp, dmg } }:
//                                   the dtiers lane fills it later (Depths); multipliers on top of the copy tuning, never
//                                   below 1 (a hook may only make a rift harder)
//
// Determinism: every choice comes from createRng(hashSeed(`rift${RIFT_VERSION}:${WORD}`)) (src/sim/rng.js), so the same
// word builds the same floor on every friend's machine; the level only sets foe levels and loot, never the floor.
// RIFT_VERSION is in the share link: a change to the generator bumps it (qa/tests/rift.test.mjs pins three floors).
//
// SCOTT: EVERY ROOM NAME, EVENT NAME, LINE AND WEEK WORD BELOW IS A DRAFT (drift lane).
import { createRng, hashSeed } from '../sim/rng.js';
import { easternWeek } from '../core/eastern_week.js';
import { DUNGEONS } from './dungeons.js';
import { WORDS as GLYPH_WORDS } from './glyphs.js';

export const RIFT_DRAFT = true;
export const RIFT_VERSION = 1;
export const RIFT_HOOKS = { scale: null };       // wave 10 dtiers fills this (Depths); see the header

export const RIFT_RULES = Object.freeze({
  minLevel: 10,              // a hero opens a rift at level 10 or more; the rift is at the opener's own level (up to maxLevel)
  maxLevel: 35,              // cap 35 stage 1: rifts follow the level cap (was 30); the loot comes from the nearest place with an epic pool
  stoneTiles: 3,             // stand this close to the Rift Stone (Lantern Square's post in Willowmere) to open one
  gatherTiles: 6,            // party heroes this close to the stone go in together
  heldTiles: 3,              // a held room's packs wait until a hero is this close to the room's middle
  trash: Object.freeze({ hp: 0.75, dmg: 0.55 }),   // the same copy tuning as the hand-built dungeons (src/data/dungeons.js)
  wordsMax: 24,              // learned words kept per hero (newest kept)
});

const DARK = { dungeon: 0.55, cave: 0.45 };

// Looks: each one is a hand-built place's look (wall kit, floor tile, water) and its own foes and bosses, as they are.
export const RIFT_LOOKS = Object.freeze({
  barrow: { kind: 'dungeon', floor: 'dirt', music: 'the_downs',
    trash: ['barrow_wether', 'barrow_shade', 'deep_wether', 'drove_shade', 'cairn_ward'],
    guardians: ['barrow_reeve', 'deep_barrow_king', 'deep_cairn_counter'],
    rooms: ['Fold', 'Tally Walk', 'Bone Pen', 'Lintel Hall', 'Counting Room', 'Long Grave', 'Cairn Room', 'Shroud Store'] },
  tower: { kind: 'dungeon', floor: 'dirt', music: 'high_moor',
    trash: ['tower_sentinel', 'ink_wraith', 'page_wraith'],
    guardians: ['sentinel_long_watch', 'watch_wickwright', 'watch_stair_captain'],
    rooms: ['Lamp Room', 'Stair Foot', 'Ink Store', 'Guard Walk', 'Wick Hall', 'Page Room', 'Bell Loft', 'Map Room'] },
  cellar: { kind: 'cave', floor: 'dirt', music: 'valley',
    trash: ['cellar_piglet', 'oil_blot', 'cut_scarab'],
    guardians: ['mother_mudge', 'gutterwick'],
    rooms: ['Root Hole', 'Oil Seep', 'Damp Run', 'Sow Wallow', 'Crate Cut', 'Drip Hall', 'Mud Shelf', 'Low Crawl'] },
  tarn: { kind: 'cave', floor: 'x1_peat', music: 'high_moor', pools: true,
    trash: ['hollow_wolf', 'lh_grub', 'lm_damp_miner'],
    guardians: ['hollowfang', 'lm_gaffer'],
    rooms: ['Black Water', 'Mist Shelf', 'Peat Cut', 'Wolf Run', 'Drowned Seam', 'Tarn Edge', 'Grub Hole', 'Still Pool'] },
});
const LOOK_IDS = Object.keys(RIFT_LOOKS);

// The word of the week: one for everyone, from the Eastern Monday week. DRAFT list.
export const WEEK_WORDS = Object.freeze(['EMBER', 'HOLLOW', 'LANTERN', 'MARGIN', 'QUILL', 'THRESH', 'VESPER', 'WICK', 'FURROW', 'CINDER',
  'BRAMBLE', 'TALLOW', 'SPINDLE', 'GLOAM', 'RUNNEL', 'HEARTH']);
export function weekWord(day) { return WEEK_WORDS[hashSeed(`week:${easternWeek(day | 0)}`) % WEEK_WORDS.length]; }

// Every player-facing word of the sim side and the zone (the card's words are in src/ui/rift_ui.js). DRAFTS.
export const RIFT_TEXT = Object.freeze({
  name: (w) => `The ${cap(w)} Rift`,
  door: (w) => `The ${cap(w)} Door`,
  heart: (w) => `The Heart of ${cap(w)}`,
  seal: (w) => `The Seal of ${cap(w)}`,
  heartChest: 'The Heart Chest',
  cache: 'A Sealed Cache',
  label: (L) => `Rift, level ${L}`,
  flavour: (w) => `A rift opened with the word ${w}. Its letters are somewhere inside.`,
  sealLook: 'A slab across the stair, cut with one empty space for each letter of the rift word.',
  sealClue: (n) => [`The rift was opened with ${n} letters.`, 'You already know them. Find them.'],
  sealOpened: 'The seal reads its own word and sinks into the stair.',
});

export function riftWord(text) {
  const w = String(text == null ? '' : text).toUpperCase().replace(/[^A-Z]/g, '');
  return w.length >= 3 && w.length <= 8 ? w : null;
}
export const riftId = (word, level) => `rift_${String(word).toLowerCase()}_${level | 0}`;
export function parseRiftId(id) {
  const m = /^rift_([a-z]{3,8})_(\d{1,2})$/.exec(String(id || ''));
  if (!m) return null;
  const level = +m[2];
  return level >= 1 && level <= RIFT_RULES.maxLevel ? { word: m[1].toUpperCase(), level } : null;
}
export const isRiftId = (id) => !!parseRiftId(String(id || '').split('#')[0]);

/** Every word a rift may be opened with: the week words, the word doors' words (never a name-stone's hidden word) and the
 *  glyph words of 3 or more letters. All from the game's own lists, so a shared rift name is always clean. */
export function riftBook(content) {
  const out = new Set(WEEK_WORDS);
  for (const d of Object.values((content && content.wordDoors) || {})) {
    if (!d || d.nameStone || d.rift) continue;
    for (const w of d.words || []) { const x = riftWord(w.word); if (x) out.add(x); }
  }
  for (const k of Object.keys(GLYPH_WORDS)) { const x = riftWord(k); if (x) out.add(x); }
  return out;
}

// grid: GX x GY cells, each CW x CH tiles; a 2-tile rock border all round, room for the door row at the bottom
const GX = 4, GY = 4, CW = 18, CH = 15, PADX = 2, PADY = 2;

export function buildRift(text, opts = {}) {
  const WORD = riftWord(text);
  if (!WORD) throw new Error(`not a rift word: ${text}`);
  const level = Math.max(1, Math.min(RIFT_RULES.maxLevel, (opts.level | 0) || 20));
  const rng = createRng(hashSeed(`rift${RIFT_VERSION}:${WORD}`));
  const lookId = rng.pick(LOOK_IDS);
  const look = RIFT_LOOKS[lookId];
  const W = PADX * 2 + GX * CW, H = PADY * 2 + GY * CH + 3;
  const id = riftId(WORD, level);

  // ---- the way through: a walk over the grid from the bottom row, never back on itself, 6 or 7 rooms, the last step up
  const want = rng.int(6, 7);
  let path = null;
  for (let tries = 0; tries < 200 && !path; tries++) {
    const p = [[rng.int(0, GX - 1), GY - 1]];
    const seen = new Set([`${p[0][0]},${p[0][1]}`]);
    while (p.length < want) {
      const [cx, cy] = p[p.length - 1];
      const last = p.length === want - 1;
      const next = (last ? [[0, -1]] : [[0, -1], [0, -1], [-1, 0], [1, 0]])
        .map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < GX && y < GY && !seen.has(`${x},${y}`));
      if (!next.length) break;
      const n = rng.pick(next);
      p.push(n); seen.add(`${n[0]},${n[1]}`);
    }
    if (p.length === want) path = p;
  }
  if (!path) throw new Error(`${WORD}: no path`);
  const used = new Set(path.map(([x, y]) => `${x},${y}`));
  // side rooms: one or two cells next to the way (never off the guardian's room or the one before it)
  const sides = [];
  const nSide = rng.int(1, 2);
  for (let i = 1; i < path.length - 2 && sides.length < nSide; i++) {
    if (!rng.chance(0.55) && i < path.length - 3) continue;
    const [cx, cy] = path[i];
    const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < GX && y < GY && !used.has(`${x},${y}`));
    if (!free.length) continue;
    const s = rng.pick(free);
    used.add(`${s[0]},${s[1]}`);
    sides.push({ cell: s, from: i });
  }

  // ---- rooms in their cells
  const names = rng.shuffle([...look.rooms]);
  const cellBox = ([gx, gy], big) => {
    const w = big ? CW - 2 : rng.int(10, CW - 4), h = big ? CH - 2 : rng.int(8, CH - 4);
    const x = PADX + gx * CW + (big ? 1 : rng.int(1, CW - w - 1)), y = PADY + gy * CH + (big ? 1 : rng.int(1, CH - h - 1));
    return { x, y, w, h };
  };
  const rooms = path.map((c, i) => {
    const role = i === 0 ? 'entry' : i === path.length - 1 ? 'guardian' : 'way';
    const b = cellBox(c, role === 'guardian');
    const name = role === 'entry' ? RIFT_TEXT.door(WORD) : role === 'guardian' ? RIFT_TEXT.heart(WORD) : `The ${names[i % names.length]}`;
    return { id: `r${i}`, name, role, ...b };
  });
  for (const [k, s] of sides.entries()) {
    const b = cellBox(s.cell, false);
    rooms.push({ id: `s${k}`, name: `The ${names[(path.length + k) % names.length]}`, role: 'side', from: `r${s.from}`, ...b });
  }
  const byId = Object.fromEntries(rooms.map((r) => [r.id, r]));
  const ctr = (r) => [r.x + (r.w >> 1), r.y + (r.h >> 1)];

  // ---- halls: an L between room centres (axis-aligned legs, 4 or 5 wide); the last link is the seal's narrow stair
  const halls = [];
  const link = (a, b) => {
    const [ax, ay] = ctr(a), [bx, by] = ctr(b), wd = rng.int(4, 5);
    halls.push({ pts: rng.chance(0.5) ? [[ax, ay], [bx, ay], [bx, by]] : [[ax, ay], [ax, by], [bx, by]], width: wd });
  };
  for (let i = 0; i + 2 < path.length; i++) link(byId[`r${i}`], byId[`r${i + 1}`]);
  for (const r of rooms) if (r.role === 'side') link(byId[r.from], r);
  const before = byId[`r${path.length - 2}`], heart = byId[`r${path.length - 1}`];
  const sx = Math.max(before.x + 1, Math.min(before.x + before.w - 3, heart.x + (heart.w >> 1) - 1));
  const seal = { x: sx, y: heart.y + heart.h, w: 2, h: before.y - (heart.y + heart.h) };

  // ---- carve (carveDungeon's rules: rock everywhere, boxes of floor, halls as thick axis-aligned legs)
  const g = Array.from({ length: H }, () => new Array(W).fill('#'));
  const set = (x, y, c) => { if (x >= 1 && y >= 1 && x < W - 1 && y < H - 1) g[y][x] = c; };
  const box = (x, y, bw, bh, c = '.') => { for (let j = y; j < y + bh; j++) for (let i = x; i < x + bw; i++) set(i, j, c); };
  for (const r of rooms) box(r.x, r.y, r.w, r.h);
  for (const hl of halls) {
    const half = Math.floor(hl.width / 2), wd = hl.width;
    for (let k = 0; k + 1 < hl.pts.length; k++) {
      const [ax, ay] = hl.pts[k], [bx, by] = hl.pts[k + 1];
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      if (ay === by) box(x0 - half, y0 - half, x1 - x0 + wd, wd); else box(x0 - half, y0 - half, wd, y1 - y0 + wd);
    }
  }
  box(seal.x, seal.y, seal.w, seal.h);
  const pools = [];
  if (look.pools) for (const r of rooms.filter((q) => q.role === 'way' && q.w >= 12 && q.h >= 9).slice(0, 2)) {
    const pw = rng.int(3, 4), ph = rng.int(2, 3), px0 = r.x + 2 + (rng.chance(0.5) ? 0 : r.w - pw - 4), py0 = r.y + 2;
    pools.push([px0, py0, pw, ph]); box(px0, py0, pw, ph, '~');
  }
  const entry = rooms[0];
  const door = { x: entry.x + (entry.w >> 1) - 1, y: entry.y + entry.h, w: 2 };
  for (let i = 0; i < door.w; i++) g[door.y][door.x + i] = '.';
  const lantern = { id: `${id}_door`, name: entry.name, x: entry.x + 2, y: entry.y + 2 };
  const post = [lantern.x, lantern.y - 1];
  g[post[1]][post[0]] = '#';
  const arrival = [door.x, door.y - 2];

  // ---- packs: 1 or 2 in each room on the way (2 or 3 foes, pulled as one); one held room whose packs wait for you
  const open = (x, y) => g[y] && g[y][x] === '.';
  const spot = (r, edge = 2) => {
    let s = null;
    for (let t = 0; t < 30; t++) {
      s = [r.x + rng.int(edge, r.w - 1 - edge), r.y + rng.int(edge, r.h - 1 - edge)];
      if (open(s[0], s[1]) && open(s[0] + 1, s[1] + 1) && open(s[0] - 1, s[1] + 1)) return s;
    }
    return s;
  };
  const lvl = () => Math.min(RIFT_RULES.maxLevel, level + (rng.chance(0.3) ? 1 : 0));
  const spawns = [];
  const packOf = (gid, r, held) => {
    const n = rng.int(2, 3), [x, y] = spot(r, 2), out = [];
    const sp = [[0, 0], [1, 1], [-1, 1]];
    for (let k = 0; k < n; k++) out.push({ mob: rng.pick(look.trash), level: lvl(), x: x + sp[k][0], y: y + sp[k][1], wander: 0, group: gid,
      ...(n > 1 ? { pack: n } : {}), ...(held ? { held } : {}) });
    return out;
  };
  const way = rooms.filter((r) => r.role === 'way');
  const heldRoom = way.length > 2 ? way[rng.int(1, way.length - 1)] : null;
  for (const r of way) {
    const n = r.w * r.h >= 120 ? 2 : 1;
    for (let k = 0; k < n; k++) spawns.push(...packOf(`${id}_${r.id}_${k}`, r, r === heldRoom ? r.id : null));
  }
  const chests = [];
  for (const [k, r] of rooms.filter((q) => q.role === 'side').entries()) {
    chests.push({ id: `${id}_cache${k}`, x: r.x + r.w - 3, y: r.y + 1, name: RIFT_TEXT.cache });
    spawns.push(...packOf(`${id}_${r.id}_guard`, r, null));
  }
  // the guardian: one of the look's bosses, its fight as it is (wave 10 dbosses), in the middle of a 16 x 13 room
  const gmob = rng.pick(look.guardians);
  const [hx, hy] = ctr(heart);
  spawns.push({ mob: gmob, level: Math.min(RIFT_RULES.maxLevel, level + 1), x: hx, y: hy, wander: 0, group: `boss_${gmob}`, boss: true });
  const heartChest = { id: `${id}_heart`, x: heart.x + heart.w - 3, y: heart.y + 1, name: RIFT_TEXT.heartChest };

  // the scattered word: one found letter per letter of the word in the rooms on the way and the side rooms, never past the
  // seal; the seal (src/sim/worddoor.js as it is) reads the rift's own word
  const letterRooms = [...way, ...rooms.filter((q) => q.role === 'side')];
  const stones = [];
  for (let i = 0; i < WORD.length; i++) {
    const r = letterRooms[(i + rng.int(0, letterRooms.length - 1)) % letterRooms.length];
    let s = spot(r, 1), guard = 0;
    while (stones.some(([a, b]) => Math.abs(a - s[0]) + Math.abs(b - s[1]) < 3) && guard++ < 20) s = spot(r, 1);
    stones.push(s);
  }
  const wordDoor = { id: `${id}_seal`, cells: [], face: { x: seal.x, y: seal.y + seal.h, w: 2 }, stones, chest: heartChest };
  for (let y = seal.y; y < seal.y + seal.h; y++) for (let x = seal.x; x < seal.x + 2; x++) wordDoor.cells.push([x, y]);

  const name = RIFT_TEXT.name(WORD);
  const levels = [level, Math.min(RIFT_RULES.maxLevel, level + 1)];
  const label = RIFT_TEXT.label(level);
  const out = opts.out || [0, 0];
  return {
    id, name, kind: look.kind, w: W, h: H, music: look.music, lighting: { tint: 'none', dark: DARK[look.kind] }, under: look.floor,
    legend: { '.': look.floor, '#': 'x1_crag_top', '~': 'x1_tarn' }, ground: g.map((r) => r.map((c) => (c === '#' ? '#' : c === '~' ? '~' : '.')).join('')),
    overlays: [], decor: [{ t: 'lamp_post', x: post[0], y: post[1], state: 1 }], overhead: [],
    collision: g.map((r) => r.join('')),
    joins: [{ x: door.x, y: door.y, w: door.w, h: 1, to: 'world', tx: out[0], ty: out[1], dir: 'down' }],
    arrival, levels, flavour: RIFT_TEXT.flavour(WORD),
    areas: rooms.map((r) => ({ id: `${id}_${r.id}`, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, levels })),
    lanterns: [{ ...lantern, post }],
    spawns, npcs: [], nodes: [], signs: [], hooks: [], secrets: [],
    dungeon: { id, kind: look.kind, name, levels, label, chests, wordDoors: [wordDoor] },
    rift: {
      word: WORD, version: RIFT_VERSION, look: lookId, level, guardian: gmob, seal, pools,
      rooms: rooms.map(({ id: rid, name: n, role, x, y, w, h }) => ({ id: rid, name: n, role, x, y, w, h })),
      held: heldRoom ? [{ room: heldRoom.id, x: ctr(heldRoom)[0], y: ctr(heldRoom)[1] }] : [],
      wordDoorDef: { place: id, rift: true, name: RIFT_TEXT.seal(WORD), look: RIFT_TEXT.sealLook, draft: true,
        words: [{ word: WORD, draft: true, clue: RIFT_TEXT.sealClue(WORD.length), opened: RIFT_TEXT.sealOpened }] },
    },
  };
}

/** The hand-built place whose loot a rift's guardian and chests use: the one with an epic pool nearest the rift's level. */
export function bandPlace(level, dungeons = DUNGEONS) {
  let best = null, bd = Infinity;
  for (const d of Object.values(dungeons)) {
    if (!d || d.rift || !d.rare || !d.levels || !(d.bosses || []).length) continue;
    const mid = (d.levels[0] + d.levels[1]) / 2, dd = Math.abs(mid - level);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

/** A rift as a src/data/dungeons.js place: the copy tuning of the hand-built dungeons (times the dtiers hook, never
 *  lower), the guardian as its one boss, the loot pools of the nearest hand-built dungeon (rolled by wave 10 dloot). */
export function riftPlace(zone, dungeons = DUNGEONS) {
  const R = zone.rift, L = R.level;
  const band = bandPlace(L, dungeons) || {};
  const pool = [...new Set(Object.values(band.drops || {}).flat())];
  let trash = { ...RIFT_RULES.trash }, guardian = null;
  if (typeof RIFT_HOOKS.scale === 'function') {
    let s = null;
    try { s = RIFT_HOOKS.scale({ id: zone.id, word: R.word, level: L, look: R.look }, { word: R.word, level: L }); } catch { s = null; }
    const up = (v) => Math.max(1, Number(v) || 1);
    if (s && s.trash) trash = { hp: trash.hp * up(s.trash.hp), dmg: trash.dmg * up(s.trash.dmg) };
    if (s && s.guardian) guardian = { hp: up(s.guardian.hp), dmg: up(s.guardian.dmg) };
  }
  return {
    id: zone.id, rift: true, word: R.word, name: zone.name, kind: zone.kind, levels: [...zone.levels], flavour: zone.flavour,
    trash, ...(guardian ? { guardianTune: guardian } : {}),
    bosses: [R.guardian], last: R.guardian,
    drops: { [R.guardian]: pool },
    ...(band.rare ? { rare: [...band.rare] } : {}),
    ...(band.legendary && band.legend ? { legendary: [].concat(band.legendary), legend: { ...band.legend } } : {}),
    loot: band.id || null,
    chest: { gold: [Math.round(0.08 * L * L + 8), Math.round(0.12 * L * L + 12)], rarity: 'magic', ilvl: L },
  };
}

/** For copies.js addZoneMaker: a rift id builds its zone (once per id; the caller caches it). `out` = the world tile a
 *  hero steps out onto (in front of the Rift Stone). */
export function riftZoneMaker(out) {
  return (id) => { const p = parseRiftId(id); return p ? buildRift(p.word, { level: p.level, out }) : null; };
}

function cap(w) { const s = String(w).toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

/** The share link's part after #: `rift=EMBER.1.22` (word, generator version, level). Never reaches a server. */
export function riftLink(word, level) { return `rift=${riftWord(word)}.${RIFT_VERSION}.${level | 0}`; }
export function readRiftLink(hash) {
  const m = /(?:^|[#&])rift=([A-Za-z]{3,8})\.(\d+)\.(\d+)/.exec(String(hash || ''));
  return m ? { word: riftWord(m[1]), version: +m[2], level: +m[3] } : null;
}

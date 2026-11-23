// Inscriptions (BUILDS_2 6.4; data in src/data/glyphs.js): margins on gear, letters socketed in order, spelled words.
// Pure: imports only from src/sim/.
//
// Item state (saved with the bag or worn entry, so saves, the chest, trade and co-op frames carry it):
//   entry.inst.margins   how many margins the piece has (set once, when the piece first enters a bag: loot.js bagAdd)
//   entry.inst.glyphs    the letters in margin order, e.g. ['A', 'S', null] (missing = all empty)
// A piece's margin count comes from a hash of (item, slot uid), never from the world's random stream, so adding
// margins changed no other roll.
//
// Commands (CONTRACTS 2.2 style):
//   glyph_socket { uid | equip, index, letter }   put a letter from the pouch into an empty margin
//   glyph_remove { uid | equip, index, npc }      a smith takes a letter out for gold; the letter goes back to the pouch
// Events: glyph { id, kind: socket | remove, item, index, letter, word?, cost? }, glyph_fail { id, reason }, plus gold.
// A lone letter gives a small stat; a spelled word (the letters, in order, in a piece it fits) replaces them with its
// power. stats.js recalc reads glyphPowers(e) into e.glyphPw (mods, procs, immune, moveCharges).
import { createRng, hashSeed } from './rng.js';
import { bagFindUid, bagCount, bagRemove, pouchAdd, resolveItem } from './loot.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The margin cap for an item record (kind and slot). */
export function marginCap(G, def) {
  if (!def || (def.kind !== 'weapon' && def.kind !== 'armor')) return 0;
  if (def.kind === 'weapon') return G.margins.cap.weapon;
  return G.margins.cap[def.slot] || G.margins.cap.other;
}
/** How many margins a piece rolls (0 to cap, plus one past the cap for rare and better), from a hash. */
export function rollMargins(G, def, rarity, uid) {
  const cap = marginCap(G, def);
  if (!cap) return 0;
  const r = rarity || def.rarity || 'common';
  const p = G.margins.chance[r] ?? G.margins.chance.common;
  const rng = createRng(hashSeed(`margin:${def.id}:${uid || 0}`));
  let n = 0;
  for (let i = 0; i < cap; i++) if (rng.next() < p) n++;
  const x = G.margins.extra[r];
  if (n === cap && x && rng.next() < x) n++;
  return n;
}
/** The margins of a bag or worn entry: { n, glyphs } (glyphs padded to n). */
export function marginsOf(content, entry) {
  const G = content && content.glyphs;
  if (!G || !entry) return { n: 0, glyphs: [] };
  const id = typeof entry === 'string' ? entry : entry.item;
  const inst = typeof entry === 'string' ? null : entry.inst;
  const def = content.items && content.items[id];
  if (!def) return { n: 0, glyphs: [] };
  const n = inst && inst.margins != null ? inst.margins | 0 : rollMargins(G, def, inst && inst.rarity, typeof entry === 'string' ? 0 : entry.uid);
  const glyphs = [];
  for (let i = 0; i < n; i++) glyphs.push((inst && inst.glyphs && inst.glyphs[i]) || null);
  return { n, glyphs };
}
/** The word an entry spells (its letters in margin order, no gaps, in a piece the word fits), or null. */
export function wordOf(content, entry, cls) {
  const G = content && content.glyphs;
  const { glyphs } = marginsOf(content, entry);
  if (!G || !glyphs.length || glyphs.some((g) => !g)) return null;
  const W = G.words[glyphs.join('')];
  if (!W) return null;
  const it = resolveItem(content, entry, cls);
  if (!it || it.kind !== W.fits.kind) return null;
  if (W.fits.slots && !W.fits.slots.includes(it.slot)) return null;
  if (W.fits.types && !W.fits.types.includes(it.weaponType)) return null;
  return W;
}
/** The view the HUD and tooltips show: { margins, glyphs, word, wordText, letterText }. */
export function glyphView(content, entry, cls) {
  const G = content && content.glyphs;
  const m = marginsOf(content, entry);
  if (!G || !m.n) return null;
  const W = wordOf(content, entry, cls);
  const def = content.items[typeof entry === 'string' ? entry : entry.item];
  const where = def.kind === 'weapon' ? 'weapon' : 'armor';
  const lone = m.glyphs.filter(Boolean).map((L) => `${L}: ${G.letters.text[where][G.vowels.includes(L) ? 'vowel' : 'consonant']}`);
  return { margins: m.n, glyphs: m.glyphs, word: W ? W.word : null, wordText: W ? W.text : null, letterText: W ? [] : lone, draft: !!G.draft };
}

/** Everything the worn letters and words give: power records for stats.js (mods, procs, immune, moveCharges). */
export function glyphPowers(content, e) {
  const G = content && content.glyphs;
  if (!G || !e.equip) return null;
  const out = [];
  for (const [slot, entry] of Object.entries(e.equip)) {
    if (!entry || typeof entry === 'string' || !entry.inst || !entry.inst.glyphs) continue;
    const W = wordOf(content, entry, e.cls);
    if (W) { out.push({ ...W.power, id: `${W.power.id}_${slot}` }); continue; }
    const def = content.items[entry.item];
    const where = def && def.kind === 'weapon' ? 'weapon' : 'armor';
    const mods = [];
    for (const L of marginsOf(content, entry).glyphs) if (L) for (const m of G.letters[where][G.vowels.includes(L) ? 'vowel' : 'consonant']) mods.push({ ...m });
    if (mods.length) out.push({ id: `glyph_${slot}`, mods });
  }
  return out.length ? out : null;
}

export function createGlyphs(X) {
  const { state, content, emit, get, reach, recalc } = X;
  const G = content.glyphs;
  const items = content.items || {};
  const rng = createRng(hashSeed(`glyph:${state.seed}`));
  if (state.glyph && Number.isFinite(state.glyph.rng)) rng.state = state.glyph.rng;
  const roll = () => { if (!state.glyph) state.glyph = { rng: rng.state }; const v = rng.next(); state.glyph.rng = rng.state; return v; };
  const fail = (e, reason, extra = {}) => { emit({ type: 'glyph_fail', id: e.id, reason, ...extra }); return false; };

  /** The entry a command names: a bag slot by uid, or a worn slot. Returns { entry, set(v) } or null. */
  function target(e, cmd) {
    if (cmd.equip) {
      const cur = e.equip && e.equip[cmd.equip];
      if (!cur) return null;
      return { entry: typeof cur === 'string' ? { item: cur } : cur, worn: cmd.equip, set: (v) => { e.equip[cmd.equip] = v; } };
    }
    const k = cmd.uid != null ? bagFindUid(e, cmd.uid | 0) : -1;
    if (k < 0) return null;
    return { entry: e.bag[k], set: (v) => { e.bag[k] = v; } };
  }
  function ensureInst(t) {
    const m = marginsOf(content, t.entry);
    const inst = { ...(t.entry.inst || {}), margins: m.n, glyphs: m.glyphs.slice() };
    const next = { ...t.entry, inst };
    t.set(next);
    t.entry = next;
    return inst;
  }

  function socket(e, cmd) {
    if (e.dead) return fail(e, 'dead');
    const t = target(e, cmd);
    if (!t) return fail(e, 'no_item');
    if (t.worn && e.inCombat) return fail(e, 'combat');
    const m = marginsOf(content, t.entry);
    const i = cmd.index | 0;
    if (!m.n) return fail(e, 'no_margins');
    if (i < 0 || i >= m.n) return fail(e, 'bad_margin');
    if (m.glyphs[i]) return fail(e, 'margin_full');
    const L = String(cmd.letter || '').toUpperCase();
    if (L.length !== 1 || !LETTERS.includes(L)) return fail(e, 'bad_letter');
    const gid = `glyph_${L.toLowerCase()}`;
    if (bagCount({ gbag: e.gbag }, gid) < 1) return fail(e, 'no_glyph', { letter: L });
    bagRemove({ gbag: e.gbag }, gid, 1);
    const inst = ensureInst(t);
    inst.glyphs[i] = L;
    const W = wordOf(content, t.entry, e.cls);
    emit({ type: 'glyph', id: e.id, kind: 'socket', item: t.entry.item, index: i, letter: L, word: W ? W.word : null });
    if (t.worn) recalc(e);
    return true;
  }
  const costOf = (entry) => { const def = items[entry.item] || {}; const L = (entry.inst && entry.inst.ilvl) || def.level || 1; return G.remove.base + G.remove.perLevel * L; };
  function removeGlyph(e, cmd) {
    if (e.dead) return fail(e, 'dead');
    const n = cmd.npc != null ? get(cmd.npc) : null;
    if (!n || n.kind !== 'npc' || n.zone !== e.zone || !G.remove.smiths.includes(n.template) || Math.hypot(n.x - e.x, n.y - e.y) > reach) return fail(e, 'not_smith');
    const t = target(e, cmd);
    if (!t) return fail(e, 'no_item');
    if (t.worn && e.inCombat) return fail(e, 'combat');
    const m = marginsOf(content, t.entry);
    const i = cmd.index | 0;
    if (i < 0 || i >= m.n || !m.glyphs[i]) return fail(e, 'empty_margin');
    const cost = costOf(t.entry);
    if ((e.gold || 0) < cost) return fail(e, 'gold', { need: cost });
    e.gold -= cost;
    const inst = ensureInst(t);
    const L = inst.glyphs[i];
    inst.glyphs[i] = null;
    if (!e.gbag) e.gbag = [];
    pouchAdd(e.gbag, `glyph_${L.toLowerCase()}`, 1);
    emit({ type: 'gold', id: e.id, amount: -cost, total: e.gold, source: 'glyph' });
    emit({ type: 'glyph', id: e.id, kind: 'remove', item: t.entry.item, index: i, letter: L, cost });
    if (t.worn) recalc(e);
    return true;
  }

  /** A kill's glyph drop (world.js killCreditFor): about 1 in 20, vowels half as likely as consonants. */
  function extraLoot(mob, p, drop) {
    if (!mob || !p || p.kind !== 'player' || mob.level - p.level <= -5) return;
    if (roll() >= G.drop.chance) return;
    let total = 0;
    for (const L of LETTERS) total += G.vowels.includes(L) ? G.drop.vowelWeight : G.drop.consonantWeight;
    let r = roll() * total;
    for (const L of LETTERS) {
      r -= G.vowels.includes(L) ? G.drop.vowelWeight : G.drop.consonantWeight;
      if (r < 0) { drop.items.push({ item: `glyph_${L.toLowerCase()}`, qty: 1 }); return; }
    }
  }

  function command(e, cmd) {
    if (cmd.t === 'glyph_socket') return socket(e, cmd);
    if (cmd.t === 'glyph_remove') return removeGlyph(e, cmd);
    return false;
  }
  return { command, extraLoot, costOf, view: (entry, cls) => glyphView(content, entry, cls) };
}

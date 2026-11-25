// Music made from your letters (wave 9 music lane, Scott 2026-11-25: "go with your recommendations"): which glyph
// letters a hero has ever found, and the party's letters together. The audio side (src/audio/synth/letters.js) turns the
// mask into how much of a synth place's song plays. Pure: imports nothing outside src/sim/.
//
//   e.glyphSeen                     26-bit mask (bit 0 = A), saved with the hero (world.saveFields); missing = 0
//   markSeen(content, e, item)      a glyph entered the hero's pouch: set its bit; true when the letter is new
//   seenMask(content, e)            glyphSeen, plus every letter the hero holds now (pouch, worn and bagged margins, the
//                                   hero's Lantern Chest tab). An old save with no mask starts from what it holds, and
//                                   the song never shrinks: a letter socketed, lent to a word door or sold still counts.
//   partyLetters(state, content, e) the union over the hero's party (solo: the hero's own)

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const LETTERS_ALL = (1 << 26) - 1;

export function bitOf(letter) {
  const s = String(letter == null ? '' : letter).toUpperCase();
  const i = s.length === 1 ? LETTERS.indexOf(s) : -1;
  return i < 0 ? 0 : 1 << i;
}
function letterOfItem(content, item) {
  const d = content && content.items && content.items[item];
  return d && d.kind === 'glyph' ? d.letter : null;
}
export function markSeen(content, e, item) {
  const b = bitOf(letterOfItem(content, item));
  if (!e || !b) return false;
  const was = (e.glyphSeen >>> 0) || 0;
  e.glyphSeen = (was | b) >>> 0;
  return !(was & b);
}
function marginBits(entry) {
  let m = 0;
  for (const L of (entry && typeof entry === 'object' && entry.inst && entry.inst.glyphs) || []) if (L) m |= bitOf(L);
  return m;
}
export function seenMask(content, e) {
  if (!e) return 0;
  let m = Number.isFinite(e.glyphSeen) ? e.glyphSeen >>> 0 : 0;
  for (const g of e.gbag || []) if (g && g.qty > 0) m |= bitOf(letterOfItem(content, g.item));
  for (const w of Object.values(e.equip || {})) m |= marginBits(w);
  for (const s of e.bag || []) m |= marginBits(s);
  for (const g of (e.chest && e.chest.glyphs) || []) if (g && g.qty > 0) m |= bitOf(letterOfItem(content, g.item));
  return (m & LETTERS_ALL) >>> 0;
}
export function partyLetters(state, content, e) {
  if (!e) return 0;
  if (e.party == null) return seenMask(content, e);
  let m = 0;
  for (const p of state.ents) if (p.kind === 'player' && p.party === e.party) m |= seenMask(content, p);
  return m >>> 0;
}

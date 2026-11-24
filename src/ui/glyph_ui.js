// Inscriptions on screen (BUILDS_2 6.4; src/sim/glyphs.js): the Margins window. J, the stone button by the minimap, or
// a smith's "Take a glyph out" opens it. Left: your gear that has margins (worn first, then the bags). Right: the chosen
// piece's margins in order, what its letters give or the word they spell, and the pouch's letters: tap one to set it in
// the first empty margin. At a smith a filled margin shows "Take out" and its gold. Every action is a sim command, so a
// guest's go through the host like any other.
import { frame, itemTooltip } from './menus.js';
import { drawGlyphStone } from './chest.js';
import { WORDS } from '../data/glyphs.js';
import { inRect } from './layout.js';

const RAR = { common: '#e8e8e8', magic: '#6f8cff', rare: '#ffd34d', epic: '#a335ee', set: '#3cdc6a', legendary: '#ff8a2a' };
const SLOT = { main: 'Main hand', off: 'Off hand', two: 'Two hands', head: 'Head', chest: 'Chest', legs: 'Legs', feet: 'Feet', hands: 'Hands', trinket: 'Trinket' };
const FAIL = { no_glyph: (e) => `You have no Glyph of ${e.letter}.`, margin_full: () => 'That margin is full. A smith can take the letter out.', combat: () => 'Not in combat.',
  no_margins: () => 'That piece has no margins.', bad_margin: () => 'No such margin.', not_smith: () => 'Only a smith can take a glyph out.', gold: (e) => `You need ${e.need} gold.`,
  empty_margin: () => 'That margin is empty.', no_item: () => 'That piece is gone.', dead: () => 'Not while dead.', bad_letter: () => 'No such letter.' };
const WORD_LINES = Object.values(WORDS).map((w) => `${w.word} in ${w.where}`);

export function createGlyphUI({ st, act, send, toast, say, hero }) {
  const S = () => { if (!st.glyphWin) st.glyphWin = { sel: null, scroll: 0, npc: null, smith: null }; return st.glyphWin; };

  function view() {
    const h = hero();
    if (!h || !h.snap) return null;
    const me = h.snap.entities.find((e) => e.id === h.id);
    const hud = h.snap.hud && h.snap.hud[h.id];
    if (!me || !hud) return null;
    const pieces = [];
    for (const [slot, it] of Object.entries(hud.equip || {})) if (it && it.glyph) pieces.push({ key: `w:${slot}`, cmd: { equip: slot }, worn: slot, it });
    for (const it of (hud.bag && hud.bag.items) || []) if (it.glyph && it.uid != null) pieces.push({ key: `b:${it.uid}`, cmd: { uid: it.uid }, worn: null, it });
    return { me, hud, snap: h.snap, pieces, pouch: hud.glyphBag || [] };
  }

  function open(opts = {}) {
    const s = S();
    s.npc = opts.npc ?? null; s.smith = opts.smith || null; s.scroll = 0;
    if (!st.open.has('glyphs')) act.toggle('glyphs');
  }

  function drawWindow(ctx, env, m, regions) {
    const { g, L } = env;
    const s = S();
    const v = view();
    if (!v) return;
    const touch = !!L.touch;
    const btnH = touch ? Math.max(18, Math.min(24, L.minHit || 18)) : 15;
    const rowH = touch ? Math.max(22, Math.min(26, L.minHit || 22)) : 20;
    const r = { x: 96, y: 26, w: 448, h: 304 };
    // the smith's offer ends when the hero walks off
    if (s.npc != null) {
      const n = v.snap.entities.find((e) => e.id === s.npc);
      if (!n || n.zone !== v.me.zone || Math.hypot(n.x - v.me.x, n.y - v.me.y) > 72) { s.npc = null; s.smith = null; }
    }
    frame(ctx, env, r, s.npc != null ? `Margins, at ${s.smith || 'the smith'}` : 'Margins', regions, act, 'glyphs');
    const button = (x, y, w, label, on, scheme = 'slate', color = 'cream', h = btnH, tip = null) => {
      g.window(ctx, x, y, w, h, 'thin', scheme, 0.97);
      g.text(ctx, g.clip(label, w - 6), x + w / 2, y + Math.floor(h / 2) - 6, color, { align: 'center' });
      regions.push({ rect: { x, y, w, h }, kind: 'button', on, label, ...(tip ? { tip } : {}) });
    };
    const body = { x: r.x + 8, y: r.y + 26, w: r.w - 16, h: r.h - 34 };
    if (!v.pieces.length) {
      const lines = ['None of your gear has margins yet.', '', 'Margins are slots for letter glyphs. Weapons can have up to 3, a chest or legs 2,',
        'other pieces 1, and rare gear sometimes one more. Glyphs drop from foes (about 1 in 20),', 'come in daily dungeon chests, and a scribe with Inscription can make them to order.',
        '', `Words: ${WORD_LINES.join(', ')}.`];
      let y = body.y + 6;
      for (const ln of lines) { for (const w of g.wrap(ln, body.w - 8)) { g.text(ctx, w, body.x + 4, y, ln ? 'cream' : 'gray'); y += 12; } }
      return;
    }
    if (!s.sel || !v.pieces.some((p) => p.key === s.sel)) s.sel = v.pieces[0].key;
    // the list of pieces
    const Lw = 176;
    const Lr = { x: body.x, y: body.y, w: Lw, h: body.h };
    g.window(ctx, Lr.x, Lr.y, Lr.w, Lr.h, 'thin', 'slate', 0.85);
    const fit = Math.max(1, Math.floor((Lr.h - 8) / rowH));
    s.scroll = Math.max(0, Math.min(Math.max(0, v.pieces.length - fit), s.scroll || 0));
    v.pieces.slice(s.scroll, s.scroll + fit).forEach((p, i) => {
      const x = Lr.x + 4, y = Lr.y + 4 + i * rowH;
      if (p.key === s.sel) g.outline(ctx, x, y, x + Lr.w - 10, y + rowH - 2, '#f9d77a');
      g.iconIn(ctx, p.it.icon || 'icon_bag', x + 1, y + 1, 16, 16);
      g.text(ctx, g.clip(p.it.name, Lr.w - 30), x + 20, y, RAR[p.it.rarity] || RAR.common);
      const gl = p.it.glyph;
      g.text(ctx, `${p.worn ? SLOT[p.worn] || p.worn : 'In bag'}  ${gl.glyphs.map((L) => L || '_').join(' ')}${gl.word ? `  ${gl.word}` : ''}`, x + 20, y + 10, gl.word ? 'gold' : 'gray');
      regions.push({ rect: { x, y, w: Lr.w - 8, h: rowH }, kind: 'button', label: `glyph_piece:${p.key}`, on: () => { s.sel = p.key; }, tip: itemTooltip(p.it) });
    });
    regions.push({ rect: Lr, kind: 'scroll', scroll: (k) => { s.scroll = Math.max(0, Math.min(Math.max(0, v.pieces.length - fit), (s.scroll || 0) + k)); } });
    if (v.pieces.length > fit && touch) {
      button(Lr.x + Lr.w - 26, Lr.y + 2, 22, '^', () => { s.scroll = Math.max(0, s.scroll - fit + 1); }, 'violet', 'white', btnH);
      button(Lr.x + Lr.w - 26, Lr.y + Lr.h - btnH - 2, 22, 'v', () => { s.scroll = Math.min(v.pieces.length - fit, s.scroll + fit - 1); }, 'violet', 'white', btnH);
    }
    // the chosen piece
    const p = v.pieces.find((x) => x.key === s.sel);
    const R = { x: body.x + Lw + 6, y: body.y, w: body.w - Lw - 6, h: body.h };
    g.window(ctx, R.x, R.y, R.w, R.h, 'thin', 'slate', 0.85);
    const gl = p.it.glyph;
    let y = R.y + 6;
    g.text(ctx, g.clip(p.it.name, R.w - 16), R.x + 8, y, RAR[p.it.rarity] || RAR.common, { large: true }); y += 16;
    g.text(ctx, `${p.worn ? `Worn: ${SLOT[p.worn] || p.worn}` : 'In your bags'}, ${gl.margins} margin${gl.margins === 1 ? '' : 's'}`, R.x + 8, y, 'gray'); y += 14;
    // the margins, in order
    const ms = touch ? Math.max(30, Math.min(36, (L.minHit || 30) + 6)) : 30;
    const firstEmpty = gl.glyphs.findIndex((x) => !x);
    gl.glyphs.forEach((Lt, i) => {
      const x = R.x + 8 + i * (ms + 8);
      g.window(ctx, x, y, ms, ms, 'thin', i === firstEmpty ? 'violet' : 'blue', 0.95);
      if (Lt) drawGlyphStone(g, ctx, x + 3, y + 3, ms - 6, Lt, 1);
      else g.text(ctx, String(i + 1), x + ms / 2, y + ms / 2 - 6, 'dim', { align: 'center' });
      if (Lt && s.npc != null) {
        regions.push({ rect: { x, y, w: ms, h: ms }, kind: 'button', label: `glyph_take:${i}`, on: () => send({ t: 'glyph_remove', ...p.cmd, index: i, npc: s.npc }),
          tip: { title: `Take out ${Lt}`, sub: `${costOf(p.it)} gold. The letter goes back to your pouch.` } });
      }
    });
    y += ms + 4;
    if (s.npc != null && gl.glyphs.some(Boolean)) { g.text(ctx, `Tap a letter to take it out: ${costOf(p.it)} gold. The letter is kept.`, R.x + 8, y, 'cream'); y += 12; }
    // what it gives
    if (gl.word) {
      for (const w of g.wrap(`Spells ${gl.wordText}`, R.w - 16)) { g.text(ctx, w, R.x + 8, y, 'gold'); y += 11; }
    } else if (gl.letterText.length) {
      for (const t of gl.letterText.slice(0, 4)) { g.text(ctx, g.clip(`${t}${gl.draft ? ' (draft)' : ''}`, R.w - 16), R.x + 8, y, 'green'); y += 11; }
    } else { g.text(ctx, 'Empty. Letters in order can spell a word.', R.x + 8, y, 'gray'); y += 11; }
    y += 4;
    if (firstEmpty < 0) { g.text(ctx, s.npc != null ? 'Every margin is full.' : 'Every margin is full. A smith can take letters out.', R.x + 8, y, 'dim'); y += 12; }
    else if (p.worn && v.me.inCombat) { g.text(ctx, 'Not in combat.', R.x + 8, y, 'red'); y += 12; }
    // the pouch: tap a letter to set it in the next margin
    const ps = touch ? Math.max(24, Math.min(28, L.minHit || 24)) : 20, pp = ps + 3;
    const cols = Math.max(1, Math.floor((R.w - 16) / pp));
    const top = Math.max(y + 2, R.y + R.h - 8 - Math.ceil(Math.max(1, v.pouch.length) / cols) * pp - 12);
    g.text(ctx, v.pouch.length ? 'Your glyphs (tap to place in the next margin)' : 'Your glyph pouch is empty.', R.x + 8, top, 'violet');
    v.pouch.forEach((st0, k) => {
      const x = R.x + 8 + (k % cols) * pp, yy = top + 12 + Math.floor(k / cols) * pp;
      if (yy + ps > R.y + R.h - 2) return;
      drawGlyphStone(g, ctx, x, yy, ps, st0.letter, st0.qty, firstEmpty < 0 ? 0.4 : 1);
      regions.push({ rect: { x, y: yy, w: ps, h: ps }, kind: 'button', label: `glyph_put:${st0.letter}`, on: () => {
        if (firstEmpty < 0) { toast('Every margin is full.'); return; }
        send({ t: 'glyph_socket', ...p.cmd, index: firstEmpty, letter: st0.letter });
      }, tip: { title: `Glyph of ${st0.letter}`, sub: `${st0.qty} in your pouch. Click to place it in margin ${firstEmpty + 1}.` } });
    });
  }
  const costOf = (it) => 2 + (it.level || 1);   // src/data/glyphs.js GLYPH_REMOVE (base 2, 1 a level)

  /** The stone button beside the profession book by the minimap. */
  function drawHud(ctx, env, m, L, regions) {
    const { g } = env;
    const mm = L.minimap;
    if (!mm || !m.minimap || !m.player || m.player.dead) return;
    const s = L.touch ? Math.max(18, Math.min(28, L.minHit || 18)) : 14;
    const mb = L.touch && L.mapBtns && L.mapBtns[1];
    const x = mb ? mb.x : L.touch ? mm.x - 3 * (s + 3) : mm.x - s - 3, y = mb ? mb.y : L.touch ? mm.y : mm.y + mm.h - 3 * s - 6;
    g.window(ctx, x, y, s, s, 'thin', st.open.has('glyphs') ? 'violet' : 'slate', 0.95);
    drawGlyphStone(g, ctx, x + 1, y + 1, s - 2, 'A', 1);
    regions.push({ rect: { x, y, w: s, h: s }, kind: 'button', label: 'glyph_book', on: () => { if (st.open.has('glyphs')) act.close('glyphs'); else open(); },
      tip: { title: 'Margins', sub: 'Set letter glyphs into your gear (J).' } });
  }

  function onEvent(ev, me) {
    if (!ev || ev.id !== me) return false;
    if (ev.type === 'glyph') {
      if (ev.kind === 'socket') { const t = ev.word ? `${ev.letter} set. It spells ${ev.word}!` : `${ev.letter} set in margin ${ev.index + 1}.`; toast(t); say('system', t); }
      else { say('system', `The smith takes out the ${ev.letter} for ${ev.cost} gold. It is back in your pouch.`); toast(`${ev.letter} back in your pouch.`); }
      return true;
    }
    if (ev.type === 'glyph_fail') { const f = FAIL[ev.reason]; const t = f ? f(ev) : 'You cannot do that.'; toast(t); say('error', t); return true; }
    return false;
  }

  /** At a smith (dialog.js): take a glyph out. */
  function dialogOptions(d) {
    if (!d || !['garrick', 'dunstan'].includes(d.npc)) return [];
    return [{ icon: 'icon_magic', label: 'Take a glyph out of my gear.', color: 'white', on: () => { const ent = d.ent, name = d.name || null; act.closeDialog(); open({ npc: ent, smith: name }); } }];
  }

  function onKey(ev) {
    if (st.mode !== 'game' || ev.repeat || ev.code !== 'KeyJ' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-overlay]')) return;
    if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName || '')) return;
    ev.preventDefault();
    if (st.open.has('glyphs')) act.close('glyphs'); else open();
  }
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  return { open, drawWindow, drawHud, onEvent, dialogOptions, hit: (x, y) => (st.regions || []).some((r) => r.label && /^glyph_/.test(r.label) && inRect(r.rect, x, y)) };
}

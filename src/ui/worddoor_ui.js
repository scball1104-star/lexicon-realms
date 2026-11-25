// The word panel (wave 8 glyphdoor; sim in src/sim/worddoor.js, words in src/data/word_doors.js). Opens when a hero touches a word door
// (the slab's `look` event), closes when they walk off. A strip over the skill bar on desktop, so the door and the party
// stay in view; a sheet over the lower screen on a phone, with tiles at the phone's hit size.
//
//   the clue (one line, two after a wrong word), the slab's cuts in order (each filled cut shows who set it),
//   "You carry": your found letters (gold) then your pouch glyphs (violet, lent), tap or type one to set it,
//   "Your party carries": which friend holds which found letter, so you know who to call over.
// Desktop: type a letter (found first, then the pouch), Backspace takes back the last letter you set, Esc closes.
// Phone: tap a tile; tap your own letter in the slab to take it back. No system keyboard is ever raised.
// Every action is a sim command (wdoor_set, wdoor_take), so a guest's go through the host like any other.
// Every player-facing line here is a DRAFT (glyphdoor lane): listed in the lane report for Scott.
import { drawGlyphStone } from './chest.js';

const FRIEND = ['cyan', 'green', 'pink', 'orange'];
const FAIL = { range: 'Stand by the door to set a letter.', quiet: 'The slab is still settling.', not_carried: (e) => `You do not carry a ${e.letter}.`,
  no_glyph: (e) => `No ${e.letter} in your pouch.`, full: 'Every cut is full.', not_yours: 'Only the hero who set that letter can take it back.', open: 'The door is open.' };

export function createWordDoorUI({ st, send, toast, say, hero }) {
  const S = () => st.wdoor || null;
  function data() {
    const h = hero(); const s = S();
    if (!h || !h.snap || !s) return null;
    const me = h.snap.entities.find((e) => e.id === h.id);
    const slab = h.snap.entities.find((e) => e.id === s.slab);
    if (!me || !slab || !slab.wdoor || slab.zone !== me.zone) return null;
    const hud = (h.snap.hud && h.snap.hud[h.id]) || {};
    return { me, slab, w: slab.wdoor, pouch: hud.glyphBag || [], ents: h.snap.entities };
  }
  const nameOf = (v, id) => { const e = v.ents.find((x) => x.id === id); return e ? e.name : '?'; };
  const party = (v) => { const ids = [v.me.id, ...v.ents.filter((e) => e.kind === 'player' && e.id !== v.me.id && e.zone === v.me.zone).map((e) => e.id)]; return ids; };
  const colorOf = (v, id) => (id === v.me.id ? 'gold' : FRIEND[(party(v).indexOf(id) - 1 + FRIEND.length) % FRIEND.length]);

  /** My letters: found ones not yet in the slab, then my pouch. */
  function mine(v) {
    const used = {};
    for (const s of v.w.slots) if (s && s.by === v.me.id && s.src === 'found') used[s.letter] = (used[s.letter] || 0) + 1;
    const found = [];
    for (const c of v.w.carried) if (c.by === v.me.id) { if (used[c.letter] > 0) used[c.letter]--; else found.push(c.letter); }
    return { found, pouch: v.pouch.filter((p) => p.qty > 0) };
  }
  function setLetter(v, L) {
    const m = mine(v);
    send({ t: 'wdoor_set', door: v.w.door, letter: L, from: m.found.includes(L) ? 'found' : 'pouch' });
  }

  function draw(ctx, env, mdl, L, regions) {
    const v = data();
    const s = S();
    if (!s) return;
    if (!v || Math.hypot(v.me.x - v.slab.x, v.me.y - v.slab.y) > 72 || v.me.dead) { st.wdoor = null; return; }
    const { g } = env;
    const w0 = v.w, touch = !!L.touch;
    const w = w0.hint ? { ...w0, clue: [...w0.clue, w0.hint] } : w0;   // wave 10 dbosses: a name-stone's hint after three clears
    const tile = touch ? Math.max(30, Math.min(36, (L.minHit || 30) + 4)) : 22;
    const m = mine(v);
    const pw = touch ? Math.min(L.W - 16, 520) : 330;
    const lineH = g.ls(12);
    const titleH = g.big ? 22 : 17, nameH = 12;
    // heights first, so nothing overlaps at Large text: title, clue, cuts + names, (label), my tiles, the party line, (hint)
    const ph = 5 + titleH + w.clue.length * lineH + 4 + tile + nameH + 6 + (touch ? 0 : lineH) + tile + 6 + lineH + (touch ? 0 : lineH) + 6;
    const x = Math.floor((L.W - pw) / 2);
    const y = touch ? L.H - ph - 6 : (L.bar && L.bar[0] ? L.bar[0].y : L.H - 40) - ph - 22;
    g.window(ctx, x, y, pw, ph, 'thin', 'slate', 0.94);
    regions.push({ rect: { x, y, w: pw, h: ph }, kind: 'window', id: 'wdoor' });
    let yy = y + 5;
    g.text(ctx, w.name, x + 8, yy, 'gold', { large: true });
    const closeW = touch ? tile : 14;
    g.window(ctx, x + pw - closeW - 4, y + 4, closeW, touch ? tile - 8 : 12, 'thin', 'slate', 0.97);
    g.text(ctx, 'x', x + pw - closeW / 2 - 4, y + (touch ? (tile - 8) / 2 - 2 : 2), 'gray', { align: 'center' });
    regions.push({ rect: { x: x + pw - closeW - 4, y: y + 4, w: closeW, h: touch ? tile - 8 : 12 }, kind: 'button', label: 'wdoor_close', on: () => { st.wdoor = null; } });
    yy += titleH;
    // the clue: the first line always, the second after a wrong word (DRAFT text is Scott's to write)
    w.clue.forEach((ln, i) => { g.text(ctx, g.clip(`${i ? '' : '"'}${ln}${i === w.clue.length - 1 ? '"' : ''}`, pw - 20), x + 10, yy, 'cream'); yy += lineH; });
    if (w.draft) g.text(ctx, 'draft', x + pw - 10, yy - lineH, 'dim', { align: 'right' });
    yy += 4;
    // the slab's cuts
    const n = w.len, gap = touch ? 8 : 6;
    const sx = x + Math.floor((pw - (n * tile + (n - 1) * gap)) / 2);
    for (let i = 0; i < n; i++) {
      const cx = sx + i * (tile + gap);
      const sl = w.slots[i], lit = w.lit[i];
      if (sl) {
        drawGlyphStone(g, ctx, cx, yy, tile, sl.letter, 1);
        if (sl.by != null) {
          const who = nameOf(v, sl.by);
          g.text(ctx, g.clip(who, tile + gap), cx + tile / 2, yy + tile + 1, colorOf(v, sl.by), { align: 'center', small: true });
          if (sl.by === v.me.id) regions.push({ rect: { x: cx, y: yy, w: tile, h: tile }, kind: 'button', label: `wdoor_take:${i}`, on: () => send({ t: 'wdoor_take', door: w.door, slot: i }),
            tip: { title: `Take back ${sl.letter}`, sub: sl.src === 'pouch' ? 'It goes back to your pouch.' : 'You keep carrying it.' } });
        }
      } else {
        g.window(ctx, cx, yy, tile, tile, 'thin', 'blue', 0.9);
        if (lit) g.text(ctx, lit, cx + tile / 2, yy + Math.floor(tile / 2) - g.mid(6), 'blue', { align: 'center', large: tile >= 22 });
        else g.text(ctx, String(i + 1), cx + tile / 2, yy + Math.floor(tile / 2) - g.mid(6), 'dark', { align: 'center' });
      }
    }
    yy += tile + nameH + 6;
    // what I carry (desktop: a label row; phone: the label sits left of the tiles)
    const label = w.quiet ? 'The slab is settling...' : touch ? 'Tap to set' : 'You carry';
    let lx = x + 10;
    if (touch) { g.text(ctx, label, lx, yy + Math.floor(tile / 2) - g.mid(6), w.quiet ? 'gray' : 'violet'); lx += g.textW(label) + 10; }
    else { g.text(ctx, label, lx, yy, w.quiet ? 'gray' : 'violet'); yy += lineH; }
    const tiles = [...m.found.map((L2) => ({ L: L2, src: 'found', qty: 1 })), ...m.pouch.map((p) => ({ L: p.letter, src: 'pouch', qty: p.qty }))];
    const tg = touch ? 6 : 4;
    const per = Math.max(1, Math.floor((x + pw - 10 - lx + tg) / (tile + tg)));
    tiles.slice(0, per).forEach((t, k) => {
      const tx = lx + k * (tile + tg);
      if (t.src === 'found') {
        g.window(ctx, tx, yy, tile, tile, 'thin', 'ember', 0.97);
        g.text(ctx, t.L, tx + tile / 2, yy + Math.floor(tile / 2) - (tile >= 18 ? 9 : 6), 'white', { align: 'center', large: tile >= 18 });
      } else drawGlyphStone(g, ctx, tx, yy, tile, t.L, t.qty, w.quiet ? 0.4 : 1);
      regions.push({ rect: { x: tx, y: yy, w: tile, h: tile }, kind: 'button', label: `wdoor_put:${t.L}:${t.src}`, on: () => send({ t: 'wdoor_set', door: w.door, letter: t.L, from: t.src }),
        tip: { title: t.src === 'found' ? `${t.L}, found here` : `Glyph of ${t.L}`, sub: t.src === 'found' ? 'Set it in the next cut.' : 'Lent to the door: it comes back to your pouch.' } });
    });
    if (!tiles.length) g.text(ctx, 'Nothing yet. Found letters lie in the rooms ahead.', lx, yy + 4, 'gray');
    yy += tile + 6;
    // who else carries what
    const others = w.carried.filter((c) => c.by !== v.me.id && !w.slots.some((s2) => s2 && s2.by === c.by && s2.letter === c.letter && s2.src === 'found'));
    const byWho = {};
    for (const c of others) (byWho[c.by] = byWho[c.by] || []).push(c.letter);
    let ox = x + 10;
    const parts = Object.entries(byWho);
    if (parts.length) {
      ox += g.text(ctx, 'Your party carries ', ox, yy, 'gray');
      for (const [id, ls] of parts) { ox += g.text(ctx, `${nameOf(v, +id)}: ${ls.join(' ')}   `, ox, yy, colorOf(v, +id)); }
    } else g.text(ctx, w.left ? `${w.left} found letter${w.left === 1 ? '' : 's'} still lie in the rooms.` : 'Every found letter is carried.', ox, yy, 'gray');
    yy += lineH;
    if (!touch) g.text(ctx, 'Type a letter to set it.  Backspace takes yours back.', x + pw / 2, y + ph - lineH - 2, 'dim', { align: 'center' });
  }

  function onEvent(ev, me) {
    if (!ev) return false;
    if (ev.type === 'wdoor') {
      if (ev.kind === 'look' && ev.id === me) { st.wdoor = { slab: ev.slab, door: ev.door }; return true; }
      if (ev.kind === 'found' && ev.id === me) { toast(`You pick up a lintel stone. It is cut with ${ev.letter}.`); return true; }
      if (ev.kind === 'wrong') { toast('The slab does not know that word. The letters fall back.'); say('system', `The slab does not know ${ev.spelled}.`); return true; }
      if (ev.kind === 'open') { if (st.wdoor && st.wdoor.door === ev.door) st.wdoor = null; toast(ev.line || 'The door opens.'); say('system', ev.line || 'The door opens.'); return true; }
      return ev.id === me;
    }
    if (ev.type === 'wdoor_fail' && ev.id === me) { const f = FAIL[ev.reason]; const t = typeof f === 'function' ? f(ev) : f || 'Not now.'; toast(t); return true; }
    return false;
  }

  function onKey(ev) {
    const v = data();
    if (!v || st.mode !== 'game' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (v.w.open || v.me.dead || Math.hypot(v.me.x - v.slab.x, v.me.y - v.slab.y) > 72) return;   // closing: the keys walk again
    if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName || '')) return;
    const k = ev.key || '';
    if (/^[a-zA-Z]$/.test(k)) { ev.preventDefault(); ev.stopImmediatePropagation(); if (!ev.repeat) setLetter(v, k.toUpperCase()); return; }
    if (k === 'Backspace') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      let last = -1; v.w.slots.forEach((s2, i) => { if (s2 && s2.by === v.me.id) last = i; });
      if (last >= 0) send({ t: 'wdoor_take', door: v.w.door, slot: last });
      return;
    }
    if (k === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); st.wdoor = null; }
  }
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey, true);   // capture: the panel eats WASD while it is open

  return { draw, onEvent, open: (slab, door) => { st.wdoor = { slab, door }; } };
}

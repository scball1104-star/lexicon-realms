// Riddles friends write (wave 9 riddles, approved 2026-11-25; D:/LQOnline/wave9/riddles/BRIEF.md). The canvas panels,
// drawn with the existing g.* calls so the skin and Text size apply:
//   book   the riddle book (Quest Log > Riddles): trails from friends (put out, take down), trails you made, solved count
//   maker  the Riddle maker: title, stones (set where you stand), clue, hint, answer (hidden until Show), last words,
//          the word check, Copy link, Save as file, Offer to the host (a guest), Done. "Walk" folds it to a pill so you
//          can walk to the next spot
//   solve  the stone panel when a hero touches a riddle stone: the clue, the hint after 2 wrong words, the cuts, an A to Z
//          tap board (no system keyboard on a phone; desktop types)
//   card   what a #riddle= link (or a pasted one) opens, and the host's card for a guest's offer: nothing is added
//          without a tap
// Text fields use one hidden <input data-overlay> (so phone keyboards, paste and accents work); the canvas draws it.
// The sim side is src/sim/riddles.js; the book (this device only) src/ui/riddle_book.js. Every line: src/data/riddle_words.js.
import { drawGlyphStone } from './chest.js';
import { RW, RIDDLE_RULES as R } from '../data/riddle_words.js';
import { createRiddleBook, riddleLink, codeIn } from './riddle_book.js';

const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const FAIL = { bad_link: RW.badLink, words: RW.flagged, have: RW.have, full: RW.full, done: RW.allDone, range: RW.range, quiet: RW.quiet, no_riddle: RW.gone, zone: RW.notZone };
const WHY = { bad: RW.badWord, contact: RW.noContact, close: RW.tooClose, zone: RW.notZone, shape: RW.answerShape, many: RW.tooMany, long: RW.tooLong };

export function createRiddleUI({ st, send, toast, say, storage, hero, placeName = (z) => z }) {
  // the link code's rules (src/sim/riddle.js createRiddleRules) come in from main.js through setNet: ui never imports the sim
  let RB = null;
  const book = createRiddleBook(storage);
  let net = { isGuest: () => false, offer: null };
  const queue = [];                     // cards waiting while another riddle panel is up
  let putOutFor = null;                 // the hero this device last put its trails out for
  const S = () => st.riddle || null;
  const snapView = () => { const h = hero(); if (!h || !h.snap) return null; const me = h.snap.entities.find((e) => e.id === h.id); return me ? { me, snap: h.snap, id: h.id } : null; };

  // ---- the hidden text input -------------------------------------------------------------------------------------
  let inp = null;
  const MAX = { title: R.titleMax, clue0: R.clueMax, clue1: R.clueMax, hint: R.hintMax, answer: R.answerMax, end: R.endMax, paste: 4200 };
  function input() {
    if (inp || typeof document === 'undefined') return inp;
    inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'riddle-input';
    inp.setAttribute('data-overlay', '1'); inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocapitalize', 'sentences'); inp.spellcheck = false;
    Object.assign(inp.style, { position: 'fixed', left: '0px', top: '0px', width: '2px', height: '2px', opacity: '0.01', fontSize: '16px', border: '0', padding: '0', zIndex: '0' });
    document.body.appendChild(inp);
    inp.addEventListener('input', () => setField(st.riddleFocus, inp.value));
    inp.addEventListener('blur', () => { st.riddleFocus = null; });
    return inp;
  }
  function getField(k) {
    const s = S();
    if (!s) return '';
    if (k === 'paste') return s.paste || '';
    if (!s.d) return '';
    const sn = s.d.stones[s.at] || {};
    return { title: s.d.title, end: s.d.end, clue0: (sn.clue || [])[0], clue1: (sn.clue || [])[1], hint: sn.hint, answer: sn.answer }[k] || '';
  }
  function setField(k, v) {
    const s = S();
    if (!s || !k) return;
    let t = String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX[k] || 60);
    if (k === 'answer') { t = t.toUpperCase().replace(/[^A-Z]/g, ''); if (inp && inp.value !== t) inp.value = t; }
    if (k === 'paste') { s.paste = t; const c = codeIn(t); if (c) { s.paste = ''; if (inp) inp.blur(); receive(c); } return; }
    const sn = s.d.stones[s.at];
    if (k === 'title') s.d.title = t; else if (k === 'end') s.d.end = t;
    else if (k === 'clue0' || k === 'clue1') { sn.clue = sn.clue || ['', '']; sn.clue[k === 'clue0' ? 0 : 1] = t; }
    else if (k === 'hint') sn.hint = t; else if (k === 'answer') sn.answer = t;
    s.bad = firstBad(s.d);
  }
  function focusField(k) {
    const el = input();
    st.riddleFocus = k;
    if (!el) return;
    el.maxLength = MAX[k] || 60;
    el.value = getField(k);
    el.setAttribute('autocapitalize', k === 'answer' ? 'characters' : 'sentences');
    const go = () => { try { el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length); } catch { /* old browser */ } };
    go(); setTimeout(() => { if (st.riddleFocus === k && document.activeElement !== el) go(); }, 0);
  }
  const ORDER = ['title', 'clue0', 'clue1', 'hint', 'answer', 'end'];
  if (typeof window !== 'undefined') {
    // first in line (registered inside createUI, before ui.js's own and co-op's): keys typed into the riddle field never
    // reach the game, the chat or the menus; the field's own text still goes in (stopping propagation keeps the default)
    const keyInField = (ev) => {
      if (!inp || ev.target !== inp) return;
      ev.stopImmediatePropagation();
      if (ev.type !== 'keydown') return;
      if (ev.key === 'Escape') { ev.preventDefault(); inp.blur(); }
      else if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault();
        const k = st.riddleFocus, i = ORDER.indexOf(k);
        if (i >= 0 && i < ORDER.length - 1) focusField(ORDER[i + (ev.shiftKey ? -1 : 1)] || ORDER[0]); else inp.blur();
      }
    };
    window.addEventListener('keydown', keyInField, true);
    window.addEventListener('keyup', keyInField, true);
    window.addEventListener('keydown', onSolveKey, true);
  }

  // ---- the trail as written (the maker's draft) ----------------------------------------------------------------------
  const blankStone = () => ({ zone: null, tx: 0, ty: 0, clue: ['', ''], hint: '', answer: '' });
  const packable = (d) => ({ by: d.by, title: d.title.trim(), end: d.end, stones: d.stones.map((s) => ({ zone: s.zone, tx: s.tx, ty: s.ty, answer: s.answer, clue: s.clue.filter((l, i) => i === 0 || l.trim()), ...(s.hint.trim() ? { hint: s.hint } : {}) })) });
  function firstBad(d) {
    if (!RB) return null;
    for (const [k, sn] of d.stones.entries()) {
      for (const [i, ln] of (sn.clue || []).entries()) { const c = RB.check(ln); if (c) return { k, field: 'clue', line: i, why: c }; }
      const h = RB.check(sn.hint); if (h) return { k, field: 'hint', why: h };
      if (sn.answer && RB.check(sn.answer)) return { k, field: 'answer', why: 'bad' };
    }
    for (const f of ['title', 'end']) { const c = RB.check(d[f]); if (c) return { k: -1, field: f, why: c }; }
    return null;
  }
  /** Ready to share: null, or the first thing to fix (a line for the toast). */
  function readyProblem(d) {
    if (!d.title.trim()) return RW.needTitle;
    const un = d.stones.findIndex((s) => !s.zone);
    if (un >= 0) return RW.unplaced(un + 1);
    const nc = d.stones.findIndex((s) => !String(s.clue[0] || '').trim());
    if (nc >= 0) return RW.emptyClue(nc + 1);
    const v = RB.validate(packable(d));
    if (!v.length) return null;
    const w = v[0];
    return (w.k >= 0 ? `${RW.stone} ${w.k + 1}: ` : '') + (WHY[w.why] || RW.badWord);
  }
  function openMaker(made) {
    const v = snapView();
    const d = made ? JSON.parse(JSON.stringify(made)) : { id: `m${Date.now().toString(36)}`, by: v ? v.me.name : 'Friend', title: '', end: '', stones: [blankStone()] };
    if (v) d.by = v.me.name;
    for (const s of d.stones) { s.clue = [s.clue[0] || '', s.clue[1] || '']; s.hint = s.hint || ''; }
    st.riddle = { mode: 'maker', d, at: 0, showAnswer: false, bad: firstBad(d), min: false };
  }
  function setStoneHere() {
    const s = S(), v = snapView();
    if (!s || !v) return;
    const me = v.me;
    if (!R.zones.includes(me.zone)) { toast(RW.notZone, 3); return; }
    if (me.dead || me.flight) { toast(RW.notHere, 3); return; }
    const tx = Math.floor(me.x / 16), ty = Math.floor((me.y - 1) / 16);
    const crowd = v.snap.entities.some((e) => e.zone === me.zone && e.id !== me.id && (e.kind === 'npc' || (e.kind === 'object' && !e.rstone))
      && Math.hypot(e.x - me.x, e.y - me.y) < R.clearOfTiles * 16);
    if (crowd) { toast(RW.notHere, 3); return; }
    if (s.d.stones.some((o, i) => i !== s.at && o.zone === me.zone && Math.hypot(o.tx - tx, o.ty - ty) < R.minApartTiles)) { toast(RW.tooClose, 3); return; }
    Object.assign(s.d.stones[s.at], { zone: me.zone, tx, ty });
    toast(RW.stoneSet(s.at + 1), 2.5);
  }
  function codeOf(d) { return RB.pack(packable(d)); }
  function share(how) {
    const s = S();
    if (!s) return;
    const p = readyProblem(s.d);
    if (p) { toast(p, 4); return; }
    const code = codeOf(s.d);
    book.saveMade(s.d);
    if (how === 'offer') { if (net.offer) { net.offer(code); toast(RW.offered, 3); } return; }
    const link = typeof location !== 'undefined' ? riddleLink(location, code) : code;
    if (how === 'file') {
      try {
        const blob = new Blob([`${s.d.title}\n${link}\n`], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `riddle-${s.d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'trail'}.txt`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast(RW.fileSaved, 3);
      } catch { toast(RW.copyFailed, 4); }
      return;
    }
    copyText(link);
  }
  function copyText(link) {
    const fallback = () => { st.riddle = { mode: 'book', paste: link }; focusField('paste'); if (inp) inp.select(); toast(RW.copyFailed, 5); };
    try {
      if (typeof navigator !== 'undefined' && navigator.share && st.metrics && st.metrics.touch) { navigator.share({ url: link }).catch(() => {}); return; }
      if (typeof navigator !== 'undefined' && navigator.clipboard) { navigator.clipboard.writeText(link).then(() => toast(RW.linkCopied, 3), fallback); return; }
    } catch { /* fall through */ }
    fallback();
  }

  // ---- a link, a paste or a guest's offer ----------------------------------------------------------------------------
  function receive(code, from = null) {
    if (!RB) return false;
    const u = RB.unpack(code);
    if (u.error) { toast(RW.badLink, 4); return false; }
    if (book.isHidden(u.by)) { if (!from) toast(RW.hiddenFrom(u.by), 3); return false; }
    if (!from && book.got.some((g) => g.rid === u.id)) { toast(RW.already, 3); return false; }
    const card = { mode: 'card', code, u, from };
    const s = S();
    if (s && (s.mode === 'card' || s.mode === 'solve')) queue.push(card); else st.riddle = card;
    return true;
  }
  function nextCard() { st.riddle = queue.shift() || null; }

  // ---- drawing helpers -----------------------------------------------------------------------------------------------
  function button(g, ctx, regions, x, y, w, h, label, on, scheme = 'slate', color = 'cream') {
    g.window(ctx, x, y, w, h, 'thin', scheme, 0.97);
    g.text(ctx, g.clip(label, w - 4), x + w / 2, y + Math.floor(h / 2) - g.mid(6), color, { align: 'center' });
    regions.push({ rect: { x, y, w, h }, kind: 'button', label: `riddle:${label}`, on: on || (() => {}) });
  }
  function field(g, ctx, regions, x, y, w, h, key, color = 'white') {
    const on = st.riddleFocus === key;
    g.window(ctx, x, y, w, h, 'field', on ? 'blue' : 'slate', 0.95);
    let s = getField(key);
    if (key === 'answer' && S() && !S().showAnswer && !on) s = s.replace(/./g, '*');
    const shown = on ? clipLeft(g, s, w - 12) : g.clip(s, w - 10);
    const tw = g.text(ctx, shown, x + 5, y + Math.floor(h / 2) - g.mid(6), color);
    if (on && Math.floor(st.now * 2) % 2 === 0) g.rect(ctx, x + 6 + (tw || 0), y + 3, 1, h - 6, '#f4e8c8');
    regions.push({ rect: { x, y, w, h }, kind: 'button', label: `riddle_field:${key}`, on: () => focusField(key) });
  }
  function clipLeft(g, s, w) { let t = s; while (t.length && g.textW(t) > w) t = t.slice(1); return t; }
  function closeBtn(g, ctx, regions, x, y, touch, on) { const w = touch ? 24 : 14, h = touch ? 20 : 12; button(g, ctx, regions, x - w, y, w, h, 'x', on); }

  // ---- the riddle book -----------------------------------------------------------------------------------------------
  function drawBook(ctx, env, L, regions, s) {
    const { g } = env, touch = !!L.touch;
    const lh = g.ls(12), bh = touch ? Math.max(22, Math.min(28, L.minHit || 22)) : 16, rowH = Math.max(lh, bh) + 4;
    const v = snapView();
    const out = new Set(v ? v.snap.entities.filter((e) => e.rstone).map((e) => e.rstone.rid) : []);
    const guest = net.isGuest();
    const pw = touch ? L.W - 16 : 380;
    const got = book.got, made = book.made;
    const maxGot = touch ? 3 : 5, maxMade = touch ? 2 : 3;
    const ph = Math.min(L.H - 16, 8 + 18 + lh + 6 + lh + Math.max(1, Math.min(got.length, maxGot)) * rowH + (got.length > maxGot ? lh : 0) + 6 + lh + Math.max(1, Math.min(made.length, maxMade)) * rowH + 8 + bh + (s.paste != null ? bh + 6 : 0) + 10);
    const x = Math.floor((L.W - pw) / 2), y = Math.max(4, Math.floor((L.H - ph) / 2));
    g.window(ctx, x, y, pw, ph, 'std', 'slate', 0.97);
    regions.push({ rect: { x, y, w: pw, h: ph }, kind: 'window', id: 'riddle_book' });
    let yy = y + 6;
    g.text(ctx, RW.book, x + 10, yy, 'gold', { large: true });
    g.text(ctx, RW.solvedCount((v && v.me.riddles) || 0), x + pw - 36, yy + 3, 'violet', { align: 'right' });
    closeBtn(g, ctx, regions, x + pw - 6, y + 5, touch, () => { st.riddle = null; });
    yy += 18 + 4;
    const row = (title, sub, subColor, btns) => {
      const bw = touch ? 74 : 62;
      let bx = x + pw - 10;
      for (const b of [...btns].reverse()) { const w = b.w || bw; bx -= w; button(g, ctx, regions, bx, yy, w, bh, b.label, b.on, b.scheme || 'slate', b.color || 'cream'); bx -= 4; }
      const room = bx - (x + 12) - 4;
      const tw = g.text(ctx, g.clip(title, room * 0.6), x + 12, yy + Math.floor(bh / 2) - g.mid(6), 'cream');
      g.text(ctx, g.clip(sub, room - tw - 8), x + 12 + tw + 8, yy + Math.floor(bh / 2) - g.mid(6), subColor);
      yy += rowH;
    };
    g.text(ctx, RW.fromFriends, x + 10, yy, 'gray'); yy += lh;
    if (!got.length) { g.text(ctx, g.clip(RW.noneGot, pw - 24), x + 12, yy + 2, 'dim'); yy += rowH; }
    for (const e of got.slice(0, maxGot)) {
      const isOut = out.has(e.rid);
      const sub = e.done ? RW.solved : `${e.by}, ${RW.stoneOf(Math.min(e.k + 1, e.n), e.n)}${isOut ? `, ${RW.outHere}` : ''}`;
      const btns = [];
      if (!e.done && !guest) btns.push(isOut ? { label: RW.takeDown, on: () => send({ t: 'riddle_remove', rid: e.rid }) } : { label: RW.putOut, scheme: 'ember', color: 'white', on: () => send({ t: 'riddle_add', code: e.code, keys: e.keys }) });
      if (!e.done && guest && net.offer) btns.push({ label: RW.offerHost, w: touch ? 110 : 92, on: () => { net.offer(e.code); toast(RW.offered, 3); } });
      btns.push({ label: 'x', w: bh, on: () => { if (isOut && !guest) send({ t: 'riddle_remove', rid: e.rid }); book.dropGot(e.rid); } });
      row(e.title, sub, e.done ? 'green' : 'gray', btns);
    }
    if (got.length > maxGot) { g.text(ctx, RW.more(got.length - maxGot), x + 12, yy, 'dim'); yy += lh; }
    yy += 6;
    g.text(ctx, RW.mine, x + 10, yy, 'gray'); yy += lh;
    if (!made.length) { g.text(ctx, RW.noneMade, x + 12, yy + 2, 'dim'); yy += rowH; }
    for (const m of made.slice(0, maxMade)) {
      row(m.title || RW.newTitle, RW.stones(m.stones.length), 'gray', [
        { label: RW.edit, on: () => openMaker(m) },
        { label: RW.share, scheme: 'ember', color: 'white', on: () => { openMaker(m); share('link'); if (S() && S().mode === 'maker') st.riddle = { mode: 'book' }; } },
        { label: 'x', w: bh, on: () => book.dropMade(m.id) },
      ]);
    }
    yy += 8;
    const bw2 = Math.floor((pw - 24) / 2);
    button(g, ctx, regions, x + 10, yy, bw2, bh, RW.newTrail, () => openMaker(null), 'ember', 'white');
    button(g, ctx, regions, x + 14 + bw2, yy, bw2, bh, RW.paste, () => { const c = S(); c.paste = c.paste || ''; focusField('paste'); });
    yy += bh + 6;
    if (s.paste != null) { g.text(ctx, RW.pasteHere, x + 10, yy + Math.floor(bh / 2) - g.mid(6), 'gray'); const lw = g.textW(RW.pasteHere) + 16; field(g, ctx, regions, x + 10 + lw, yy, pw - 20 - lw, bh, 'paste', 'white'); }
  }

  // ---- the Riddle maker ----------------------------------------------------------------------------------------------
  function drawMaker(ctx, env, L, regions, s) {
    const { g } = env, touch = !!L.touch;
    const lh = g.ls(12), fh = touch ? Math.max(20, g.ls(16)) : g.ls(15), bh = touch ? Math.max(22, Math.min(26, L.minHit || 22)) : 20;
    if (s.min) {
      const n = s.d.stones.length, label = RW.makerPill(s.at + 1, n);
      const w = g.textW(label) + 24, h = touch ? 24 : 16, x = Math.floor((L.W - w) / 2);
      const y = touch ? L.H - h - 22 : (L.bar && L.bar[0] ? L.bar[0].y - h - 8 : L.H - 60);   // low, clear of the toasts
      button(g, ctx, regions, x, y, w, h, label, () => { s.min = false; }, 'violet', 'white');
      return;
    }
    const two = touch;                       // a phone: two columns side by side (the layer is wide and short)
    const pw = touch ? L.W - 12 : 270;
    const colW = two ? Math.floor((pw - 24) / 2) : pw - 16;
    const x = touch ? 6 : L.W - pw - 8;
    const yTop = touch ? 4 : 26;
    const ph = touch ? L.H - 8 : Math.min(L.H - 40, 5 + 16 + lh + fh + 6 + 22 + 6 + lh + 6 + lh + 2 * (fh + 3) + lh + fh + 6 + lh + 22 + 6 + lh + fh + 6 + lh + 2 * (bh + 4) + 2 * lh + 8);
    g.window(ctx, x, yTop, pw, ph, 'thin', 'slate', 0.96);
    regions.push({ rect: { x, y: yTop, w: pw, h: ph }, kind: 'window', id: 'riddle_maker' });
    let yy = yTop + 5;
    g.text(ctx, RW.maker, x + 8, yy, 'gold', { large: true });
    closeBtn(g, ctx, regions, x + pw - 4, yTop + 4, touch, () => { book.saveMade(s.d); st.riddle = { mode: 'book' }; });
    const ww = touch ? 44 : 34;
    button(g, ctx, regions, x + pw - 4 - (touch ? 24 : 14) - 4 - ww, yTop + 4, ww, touch ? 20 : 12, RW.walk, () => { s.min = true; if (inp) inp.blur(); });
    yy += 16;
    const c1 = x + 8;
    // column 1: title, the stones, where, clue, hint
    g.text(ctx, RW.title, c1, yy, 'gray'); yy += lh;
    field(g, ctx, regions, c1, yy, colW, fh, 'title'); yy += fh + 6;
    const n = s.d.stones.length, tg = 4, tw = Math.min(touch ? 40 : 36, Math.floor((colW - 26) / R.maxStones) - tg);
    s.d.stones.forEach((sn, k) => {
      const tx = c1 + k * (tw + tg), on = k === s.at;
      g.window(ctx, tx, yy, tw, 22, 'thin', on ? 'ember' : 'slate', on ? 0.97 : 0.9);
      if (tw >= 36) {
        g.text(ctx, `${k + 1}`, tx + 10, yy + 11 - g.mid(6), on ? 'white' : 'cream', { align: 'center' });
        g.text(ctx, sn.zone ? 'set' : '...', tx + tw - 12, yy + 11 - g.mid(6), sn.zone ? 'green' : 'dim', { align: 'center', small: true });
      } else g.text(ctx, `${k + 1}`, tx + tw / 2, yy + 11 - g.mid(6), sn.zone ? 'green' : on ? 'white' : 'cream', { align: 'center' });   // narrow: a set stone's number is green
      regions.push({ rect: { x: tx, y: yy, w: tw, h: 22 }, kind: 'button', label: `riddle:stone${k}`, on: () => { s.at = k; if (inp) inp.blur(); } });
    });
    if (n < R.maxStones) button(g, ctx, regions, c1 + n * (tw + tg), yy, 22, 22, '+', () => { s.d.stones.push(blankStone()); s.at = s.d.stones.length - 1; });
    yy += 22 + 6;
    const sn = s.d.stones[s.at];
    const head = `${RW.stone} ${s.at + 1} ${RW.of} ${n}: `;
    g.text(ctx, head, c1, yy, 'cream');
    const v = snapView();
    const isHere = sn.zone && v && v.me.zone === sn.zone && Math.floor(v.me.x / 16) === sn.tx && Math.floor((v.me.y - 1) / 16) === sn.ty;
    g.text(ctx, g.clip(sn.zone ? (isHere ? RW.placedHere : `${RW.placed}, ${placeName(sn.zone, sn.tx, sn.ty)}`) : RW.empty, colW - g.textW(head)), c1 + g.textW(head), yy, sn.zone ? 'green' : 'gray');
    yy += lh + 4;
    const hw = Math.floor((colW - 4) * 0.62);
    button(g, ctx, regions, c1, yy, hw, bh, sn.zone ? RW.moveHere : RW.here, setStoneHere, 'ember', 'white');
    if (n > 1) button(g, ctx, regions, c1 + hw + 4, yy, colW - hw - 4, bh, RW.removeStone, () => { s.d.stones.splice(s.at, 1); s.at = Math.max(0, s.at - 1); s.bad = firstBad(s.d); });
    yy += bh + 6;
    const cnt = st.riddleFocus === 'clue0' || st.riddleFocus === 'clue1' ? `${getField(st.riddleFocus).length}/${R.clueMax}` : '';
    g.text(ctx, RW.clue, c1, yy, 'gray'); if (cnt) g.text(ctx, cnt, c1 + colW, yy, 'dim', { align: 'right' }); yy += lh;
    for (let i = 0; i < 2; i++) {
      const bad = s.bad && s.bad.k === s.at && s.bad.field === 'clue' && s.bad.line === i;
      field(g, ctx, regions, c1, yy, colW, fh, `clue${i}`, bad ? 'red' : 'white');
      if (bad) g.rect(ctx, c1 + 5, yy + fh - 4, Math.min(colW - 10, g.textW(g.clip(getField(`clue${i}`), colW - 10))), 1, '#e05050');
      yy += fh + 3;
    }
    g.text(ctx, RW.hint, c1, yy, 'gray'); yy += lh;
    field(g, ctx, regions, c1, yy, colW, fh, 'hint', s.bad && s.bad.k === s.at && s.bad.field === 'hint' ? 'red' : 'white'); yy += fh + 6;
    // column 2 (or on down): the answer, the last words, the check, the buttons
    const c2 = two ? x + 16 + colW : c1;
    if (two) yy = yTop + 5 + 16 + 10;   // under the Walk and x buttons
    g.text(ctx, RW.answer, c2, yy, 'gray');
    button(g, ctx, regions, c2 + colW - 40, yy - 2, 40, lh + 2, s.showAnswer ? RW.hide : RW.show, () => { s.showAnswer = !s.showAnswer; });
    yy += lh + 2;
    const tile = 22, cg = 4, ans = sn.answer || '';
    const fw = Math.max(tile * 3, Math.min(colW - 70, R.answerMax * (tile + cg)));
    if (st.riddleFocus === 'answer' || !ans) field(g, ctx, regions, c2, yy, fw, tile, 'answer');
    else {
      ans.split('').forEach((Ltr, i) => {
        const cx = c2 + i * (tile + cg);
        if (s.showAnswer) drawGlyphStone(g, ctx, cx, yy, tile, Ltr, 1);
        else { g.window(ctx, cx, yy, tile, tile, 'thin', 'blue', 0.9); g.text(ctx, '*', cx + tile / 2, yy + 11 - g.mid(6), 'blue', { align: 'center' }); }
      });
      regions.push({ rect: { x: c2, y: yy, w: ans.length * (tile + cg), h: tile }, kind: 'button', label: 'riddle_field:answer', on: () => focusField('answer') });
    }
    g.text(ctx, RW.letters(ans.length), c2 + (st.riddleFocus === 'answer' || !ans ? fw : ans.length * (tile + cg)) + 4, yy + 11 - g.mid(6), 'dim');
    yy += tile + 6;
    g.text(ctx, g.clip(RW.end, colW), c2, yy, 'gray'); yy += lh;
    field(g, ctx, regions, c2, yy, colW, fh, 'end', s.bad && s.bad.field === 'end' ? 'red' : 'white'); yy += fh + 6;
    if (s.bad) g.text(ctx, g.clip(WHY[s.bad.why] || RW.badWord, colW), c2, yy, 'red');
    else { g.text(ctx, `${RW.check}: `, c2, yy, 'gray'); g.text(ctx, RW.ok, c2 + g.textW(`${RW.check}: `), yy, 'green'); }
    yy += lh + 2;
    const dim = !!s.bad;
    const guest = net.isGuest() && !!net.offer;
    const bw = Math.floor((colW - 4) / 2);
    button(g, ctx, regions, c2, yy, bw, bh, RW.copyLink, () => { if (!s.bad) share('link'); }, dim ? 'slate' : 'ember', dim ? 'dim' : 'white');
    button(g, ctx, regions, c2 + bw + 4, yy, bw, bh, RW.saveFile, () => { if (!s.bad) share('file'); }, 'slate', dim ? 'dim' : 'cream');
    yy += bh + 4;
    if (guest) button(g, ctx, regions, c2, yy, bw, bh, RW.offerHost, () => { if (!s.bad) share('offer'); }, 'slate', dim ? 'dim' : 'cream');
    button(g, ctx, regions, guest ? c2 + bw + 4 : c2, yy, guest ? bw : colW, bh, RW.done, () => { book.saveMade(s.d); if (inp) inp.blur(); st.riddle = { mode: 'book' }; });
    yy += bh + 4;
    for (const ln of g.wrap(RW.sealed, colW)) { if (yy + lh > yTop + ph - 2) break; g.text(ctx, ln, c2, yy, 'dim'); yy += lh; }
  }

  // ---- the stone panel -----------------------------------------------------------------------------------------------
  function stoneView() {
    const s = S(), v = snapView();
    if (!s || s.mode !== 'solve' || !v) return null;
    const t = v.snap.entities.find((e) => e.id === s.stone);
    if (!t || !t.rstone || t.zone !== v.me.zone || v.me.dead || Math.hypot(v.me.x - t.x, v.me.y - t.y) > (R.reachPx || 80) + 16) return null;
    return { s, r: t.rstone, me: v.me };
  }
  function typeLetter(L1) { const sv = stoneView(); if (!sv || sv.r.quiet) return; if (sv.s.typed.length < sv.r.len) sv.s.typed.push(L1); sv.s.pressed = L1; }
  function tryIt() { const sv = stoneView(); if (!sv || sv.s.typed.length !== sv.r.len) return; send({ t: 'riddle_guess', rid: sv.r.rid, word: sv.s.typed.join('') }); }
  function onSolveKey(ev) {
    const s = S();
    if (!s || st.mode !== 'game' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName || '')) return;
    const k = ev.key || '';
    if (k === 'Escape' && (s.mode !== 'maker' || !s.min)) { ev.preventDefault(); ev.stopImmediatePropagation(); if (s.mode === 'maker') book.saveMade(s.d); st.riddle = s.mode === 'card' ? null : s.mode === 'maker' ? { mode: 'book' } : null; if (s.mode === 'card') nextCard(); return; }
    if (s.mode !== 'solve' || !stoneView()) return;
    if (/^[a-zA-Z]$/.test(k)) { ev.preventDefault(); ev.stopImmediatePropagation(); if (!ev.repeat) typeLetter(k.toUpperCase()); return; }
    if (k === 'Backspace') { ev.preventDefault(); ev.stopImmediatePropagation(); s.typed.pop(); return; }
    if (k === 'Enter') { ev.preventDefault(); ev.stopImmediatePropagation(); tryIt(); }
  }
  function drawSolve(ctx, env, L, regions, sv) {
    const { g } = env, touch = !!L.touch, { s, r } = sv;
    const lh = g.ls(12);
    const key = touch ? Math.max(28, Math.min(30, L.minHit || 28)) : 18, kg = touch ? 2 : 3, cols = 13;
    const pw = Math.min(L.W - 12, Math.max(touch ? 0 : 330, cols * (key + kg) + 20));
    const cut = touch ? 26 : 22;
    const clue = r.clue.length ? r.clue : [null];
    const ph = 4 + 16 + clue.length * lh + (r.hint ? lh : 0) + 4 + cut + 4 + 2 * (key + kg) + 2 + (touch ? 0 : lh + 2);
    const x = Math.floor((L.W - pw) / 2);
    const y = touch ? L.H - ph - 4 : (L.bar && L.bar[0] ? L.bar[0].y : L.H - 40) - ph - 22;
    g.window(ctx, x, y, pw, ph, 'thin', 'slate', 0.95);
    regions.push({ rect: { x, y, w: pw, h: ph }, kind: 'window', id: 'riddle_stone' });
    let yy = y + 4;
    const right = `${RW.fromWho(r.by)}, ${RW.stoneOf(r.k + 1, r.n)}`;
    g.text(ctx, right, x + pw - (touch ? 34 : 22), yy + 2, 'violet', { align: 'right' });
    g.text(ctx, g.clip(r.title, pw - 40 - g.textW(right), true), x + 8, yy, 'gold', { large: true });
    closeBtn(g, ctx, regions, x + pw - 4, y + 4, touch, () => { st.riddle = null; });
    yy += 16;
    // the stone's mood, right-aligned on the last line above the cuts: settling, or how many wrong words
    const mood = r.quiet ? RW.quiet : r.tries ? RW.wrongCount(r.tries) : '';
    clue.forEach((ln, i) => { g.text(ctx, g.clip(`${i ? '' : '"'}${ln == null ? RW.hiddenLine : ln}${i === clue.length - 1 ? '"' : ''}`, pw - 20 - (i === clue.length - 1 && !r.hint && mood ? g.textW(mood) + 8 : 0)), x + 10, yy, ln == null ? 'gray' : 'cream'); yy += lh; });
    if (r.hint) { g.text(ctx, `${RW.hintLabel}: `, x + 10, yy, 'violet'); g.text(ctx, g.clip(r.hint, pw - 60 - g.textW(mood)), x + 10 + g.textW(`${RW.hintLabel}: `), yy, 'cream'); yy += lh; }
    if (mood) g.text(ctx, mood, x + pw - 10, yy - lh, r.quiet ? 'gray' : 'dim', { align: 'right' });
    yy += 4;
    const len = r.len, cgap = touch ? 6 : 4;
    const cx0 = x + 10;
    for (let i = 0; i < len; i++) {
      const cx = cx0 + i * (cut + cgap), Ltr = s.typed[i];
      if (Ltr) drawGlyphStone(g, ctx, cx, yy, cut, Ltr, 1);
      else { g.window(ctx, cx, yy, cut, cut, 'thin', 'blue', 0.9); g.text(ctx, String(i + 1), cx + cut / 2, yy + Math.floor(cut / 2) - g.mid(6), 'dim', { align: 'center' }); }
    }
    const bw = touch ? 56 : 40;
    button(g, ctx, regions, x + pw - 10 - 2 * bw - 4, yy, bw, cut, RW.clear, () => { s.typed = []; });
    const full = s.typed.length === len && !r.quiet;
    button(g, ctx, regions, x + pw - 10 - bw, yy, bw, cut, RW.tryIt, tryIt, full ? 'ember' : 'slate', full ? 'white' : 'dim');
    yy += cut + 4;
    const kx0 = x + Math.floor((pw - (cols * (key + kg) - kg)) / 2);
    AZ.forEach((Ltr, i) => {
      const kx = kx0 + (i % cols) * (key + kg), ky = yy + Math.floor(i / cols) * (key + kg);
      g.window(ctx, kx, ky, key, key, 'thin', s.pressed === Ltr ? 'ember' : 'violet', r.quiet ? 0.6 : 0.97);
      g.text(ctx, Ltr, kx + key / 2, ky + Math.floor(key / 2) - g.mid(touch ? 9 : 6), r.quiet ? 'gray' : 'white', { align: 'center', large: touch });
      regions.push({ rect: { x: kx, y: ky, w: key, h: key }, kind: 'button', label: `riddle_key:${Ltr}`, on: () => typeLetter(Ltr) });
    });
    yy += 2 * (key + kg) + 2;
    if (!touch) g.text(ctx, RW.keysHint, x + pw / 2, yy, 'dim', { align: 'center' });
  }

  // ---- the link card (and a guest's offer on the host) ---------------------------------------------------------------
  function drawCard(ctx, env, L, regions, s) {
    const { g } = env, touch = !!L.touch;
    const lh = g.ls(12), bh = touch ? Math.max(26, L.minHit || 26) : 22;
    const u = s.u;
    g.scrim(ctx, 0, 0, L.W, L.H, 120);
    const pw = Math.min(L.W - 20, 380);
    const lines = g.wrap(RW.noAnswers, pw - 24);
    const ph = 6 + lh + 20 + lh + lh + 8 + lines.length * lh + 6 + lh + 10 + bh + 6 + bh + 8;
    const x = Math.floor((L.W - pw) / 2), y = Math.max(4, Math.floor((L.H - ph) / 2));
    g.window(ctx, x, y, pw, ph, 'std', 'slate', 0.97);
    regions.push({ rect: { x, y, w: pw, h: ph }, kind: 'window', id: 'riddle_card' });
    let yy = y + 8;
    g.text(ctx, g.clip(s.from ? RW.hostSays(s.from) : RW.sentYou(u.by), pw - 20), x + pw / 2, yy, 'violet', { align: 'center' }); yy += lh;
    g.text(ctx, g.clip(u.flagged ? RW.hiddenLine : u.title, pw - 20, true), x + pw / 2, yy + 2, 'gold', { align: 'center', large: true }); yy += 20;
    g.text(ctx, g.clip(`${RW.stones(u.n)}, ${RW.near(placeName(u.first.z, u.first.x, u.first.y))}`, pw - 20), x + pw / 2, yy, 'cream', { align: 'center' }); yy += lh;
    if (u.flagged) g.text(ctx, g.clip(RW.flagged, pw - 24), x + 12, yy, 'red');
    else { g.text(ctx, `${RW.check}: `, x + 12, yy, 'gray'); g.text(ctx, RW.ok, x + 12 + g.textW(`${RW.check}: `), yy, 'green'); }
    yy += lh + 8;
    for (const ln of lines) { g.text(ctx, ln, x + 12, yy, 'dim'); yy += lh; }
    yy += 6;
    g.text(ctx, RW.linkSize(s.code.length), x + 12, yy, 'dim'); yy += lh + 10;
    const bw = pw - 24, aw = Math.floor(bw * 0.6);
    const add = () => {
      if (u.flagged) return;
      const guest = net.isGuest();
      book.addGot(u, s.code, Date.now());
      if (!guest) send({ t: 'riddle_add', code: s.code, keys: [] });
      toast(guest ? RW.addedGuest : RW.added, 4);
      nextCard();
    };
    button(g, ctx, regions, x + 12, yy, aw, bh, s.from ? RW.putHere : RW.add, add, u.flagged ? 'slate' : 'ember', u.flagged ? 'dim' : 'white');
    button(g, ctx, regions, x + 18 + aw, yy, bw - aw - 6, bh, RW.notNow, nextCard);
    yy += bh + 6;
    button(g, ctx, regions, x + 12, yy, bw, bh, RW.never(u.by), () => { book.hide(u.by); toast(RW.hiddenFrom(u.by), 3); nextCard(); }, 'slate', 'gray');
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------
  function draw(ctx, env, mdl, L, regions) {
    const v = snapView();
    // a game starts: put this device's trails out in its own world (a guest never: the host's world is the host's)
    if (v && putOutFor !== v.id && !net.isGuest()) {
      putOutFor = v.id;
      const outNow = new Set(v.snap.entities.filter((e) => e.rstone).map((e) => e.rstone.rid));
      for (const e of book.toPutOut(R.maxActive || 3)) if (!outNow.has(e.rid)) { st.riddleQuiet = (st.riddleQuiet || 0) + 1; send({ t: 'riddle_add', code: e.code, keys: e.keys }); }
    }
    const s = S();
    if (!s) return;
    if (s.mode === 'solve') { const sv = stoneView(); if (!sv) { st.riddle = null; return; } drawSolve(ctx, env, L, regions, sv); }
    else if (s.mode === 'book') drawBook(ctx, env, L, regions, s);
    else if (s.mode === 'maker') drawMaker(ctx, env, L, regions, s);
    else if (s.mode === 'card') drawCard(ctx, env, L, regions, s);
  }
  /** The Quest Log's "Riddles" button (inside the log's own 640x360 design scope). */
  function questButton(ctx, env, regions) {
    const w = [...regions].reverse().find((r) => r.kind === 'window' && r.id === 'quests');
    if (!w) return;
    const { g } = env, r = w.rect;
    const bw = g.textW(RW.riddles) + 18, bh = 14;
    button(g, ctx, regions, r.x + r.w - bw - 70, r.y + 5, bw, bh, RW.riddles, () => { st.open.delete('quests'); st.riddle = { mode: 'book' }; }, 'violet', 'white');
  }
  function onEvent(ev, me) {
    if (!ev) return false;
    if (ev.type === 'riddle_fail') {
      if (ev.id !== me) return true;
      if (ev.cmd === 'riddle_add' && st.riddleQuiet > 0 && (ev.reason === 'have' || ev.reason === 'full')) { st.riddleQuiet--; return true; }
      if (ev.reason === 'quiet' && S() && S().mode === 'solve') return true;
      toast(FAIL[ev.reason] || RW.gone, 3);
      return true;
    }
    if (ev.type !== 'riddle') return false;
    const s = S();
    if (ev.kind === 'added') { if (ev.id === me && st.riddleQuiet > 0) st.riddleQuiet--; return true; }
    if (ev.kind === 'look') { if (ev.id === me) { if (!s || s.mode !== 'maker') st.riddle = { mode: 'solve', stone: ev.stone, rid: ev.rid, typed: [], pressed: null }; } return true; }
    if (ev.kind === 'wrong') {
      if (s && s.mode === 'solve' && s.rid === ev.rid) { s.typed = []; s.pressed = null; }
      if (ev.id === me) toast(RW.wrong, 2.5);
      return true;
    }
    if (ev.kind === 'right') {
      book.progress(ev.rid, ev.keys);
      if (s && s.mode === 'solve' && s.rid === ev.rid) st.riddle = null;
      toast(`${RW.right} ${RW.nextNear(placeName(ev.next.zone, ev.next.x, ev.next.y))}`, 5);
      say('system', `${RW.right} (${RW.stoneOf(ev.k, ev.n)})`);
      return true;
    }
    if (ev.kind === 'done') {
      book.progress(ev.rid, ev.keys, true);
      if (s && s.mode === 'solve' && s.rid === ev.rid) st.riddle = null;
      toast(RW.trailDone(ev.by), 5);
      say('system', RW.trailDone(ev.by));
      if (ev.end) say('system', RW.lastWords(ev.by, ev.end));
      return true;
    }
    if (ev.kind === 'removed') return true;
    return false;
  }

  return {
    draw, questButton, onEvent, receive,
    offered: (from, code) => receive(code, from),
    setNet(n) { if (n.rules) RB = n.rules; net = { ...net, ...n }; },
    openBook() { st.riddle = { mode: 'book' }; },
    get book() { return book; },
    get rules() { return RB; },
  };
}

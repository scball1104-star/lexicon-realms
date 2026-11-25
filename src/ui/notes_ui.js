// Lantern notes, the drawing (wave 9 notes lane; brief D:/LQOnline/wave9/notes/BRIEF.md, approved by Scott 2026-11-25).
// Drawn with the g.* calls, so the skin and Text size apply. The model is src/net/notes.js, the wiring (word book,
// notebook, lanterns, the #note= link, co-op) is src/ui/notes_wire.js, which hands this file a model with setModel().
//   - a sealed note over each lantern post that holds notes (a HUD overlay at the post, like quest marks; tap to read)
//   - "Leave a note" while the hero stands at a lantern (the bind reach)
//   - the writer: pick a line, fill its blank from your own lexicon, up to two lines, who it is for
//   - "Your note is on the lantern": how it reaches friends (next time you play together, or now by a link)
//   - the reader: the note on a vellum page, Reply, Hide <name>'s notes, Next note, Close (your own: Take it down)
//   - the link card: a friend's note link was tapped
// There is no free text anywhere: every word comes from the game's own list. Every word a player reads is a DRAFT.
//
//   const N = createNotesUI({ g, st })   N.setModel(model)   N.drawUnder(ctx, L, t)   N.draw(ctx, L, regions)
//   N.open (a panel is up)   N.escape()   N.openReader(key)   N.openLink(note)
const TABS = [['place', 'Places'], ['foe', 'Foes'], ['word', 'Words'], ['friend', 'Friends'], ['time', 'Times'], ['thing', 'Things']];   // drafts
export const NOTES_WORDS = {   // drafts (Scott)
  leave: 'Leave a note', at: (p) => `at ${p}`, title: (p) => `A note at ${p}`, lines: (n) => `${n} of 2 lines`,
  pick: 'Pick a line', fill: 'Fill it from your lexicon', more: 'More...', learn: 'Touch lanterns, beat foes and spell words to learn more.',
  forFriends: 'For: my friends', forOne: (n) => `For: just ${n}`, forMe: 'For: just me', addLine: 'Add a line', clear: 'Clear',
  cancel: 'Cancel', leaveHere: 'Leave it here', sign: (n, f) => `${n}, today, ${f}`,
  signFor: { friends: 'for my friends', me: 'just for me', one: (n) => `for ${n}` },
  leftTitle: 'Your note is on the lantern.',
  leftBody: 'Friends playing with you now see it here. Friends who are not here get it the next time you play together, or right away if you send them a link.',
  leftMe: 'Only you will see this note.',
  leftSub: 'The link holds only this note: your hero name, the words and the day. Anyone with the link can read it.',
  sendLink: 'Send a link', done: 'Done',
  readTitle: (n) => `${n} left a note`, mineTitle: 'Your note', signAt: (n, p) => `${n}, at ${p}`,
  reply: 'Reply', hide: (n) => `Hide ${n}'s notes`, next: 'Next note', close: 'Close', takeDown: 'Take it down',
  linkTitle: (n, p) => `${n} left you a note at ${p}.`, linkSub: 'It is waiting on the lantern.', readNow: 'Read it now', findThere: 'Find it there',
  showHidden: (n) => `Show hidden notes (${n})`,
};
const W8 = NOTES_WORDS;

export function createNotesUI({ g, st }) {
  const S = { near: null, write: null, left: null, read: null, link: null, posts: [] };
  let M = null;                       // the model (notes_wire.js)
  const C = () => (g.skin && g.skin.C) || { page: '#eadbb6', inkText: '#3a2618', bronzeLo: '#5e3f1c', gilt: '#f9d77a' };
  const ink = (ctx, s, x, y, col, o) => (g.skin ? g.skin.ink(ctx, s, x, y, col, { big: g.big, ...(o || {}) }) : g.text(ctx, s, x, y, col, o));
  const page = (ctx, x, y, w, h) => { const c = C(); if (g.skin) g.skin.page(ctx, x, y, w, h); else g.rect(ctx, x, y, w, h, c.page); g.outline(ctx, x - 1, y - 1, x + w, y + h, c.bronzeLo); g.rect(ctx, x, y, w, 1, c.gilt); };
  const bh = (L) => Math.max(g.ls(15), L.touch ? L.minHit || 0 : 0);
  function btn(ctx, regions, x, y, w, h, label, scheme, on, off = false) {
    g.window(ctx, x, y, w, h, 'thin', off ? 'slate' : scheme, off ? 0.6 : 0.95);
    g.text(ctx, label, x + w / 2, y + Math.round((h - g.lh) / 2) + 1, off ? 'dim' : 'cream', { align: 'center' });
    regions.push({ rect: { x, y, w, h }, kind: 'button', label: `notes:${label}`, on: off ? () => {} : on });
  }
  const closeAll = () => { S.write = null; S.left = null; S.read = null; S.link = null; };

  // ---------------------------------------------------------------- the sealed note over a lantern
  function seal(ctx, x, y, unread, n, t) {
    const c = C();
    const bob = unread ? Math.round(Math.sin(t * 3) * 1.5) : 0;
    const w = 14, h = 10, X = Math.round(x - w / 2), Y = Math.round(y - h) + bob;
    if (unread) { ctx.save(); ctx.globalAlpha = 0.28 + 0.12 * Math.sin(t * 3); ctx.fillStyle = '#ffd77a'; ctx.beginPath(); ctx.arc(x, Y + h / 2, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    g.rect(ctx, X, Y, w, h, c.page);
    g.outline(ctx, X - 1, Y - 1, X + w, Y + h, c.bronzeLo);
    for (let i = 0; i < 7; i++) { g.rect(ctx, X + i, Y + Math.floor(i * 0.7), 1, 1, c.bronzeLo); g.rect(ctx, X + w - 1 - i, Y + Math.floor(i * 0.7), 1, 1, c.bronzeLo); }
    g.rect(ctx, X + 5, Y + 4, 4, 4, '#a8322a'); g.rect(ctx, X + 6, Y + 3, 2, 6, '#a8322a'); g.rect(ctx, X + 4, Y + 5, 6, 2, '#a8322a'); g.rect(ctx, X + 6, Y + 5, 1, 1, '#e06a55');
    if (n > 1) { g.scrim(ctx, X + w - 2, Y - 6, g.textW(String(n)) + 4, 9, 200); g.text(ctx, String(n), X + w, Y - 7, 'gold', { small: true }); }
    return { x: X - 4, y: Y - 4, w: w + 8, h: h + 8 };
  }

  // ---------------------------------------------------------------- "Leave a note" at the lantern
  function nearButton(ctx, L, regions) {
    const label = W8.leave;
    const w = g.textW(label) + 24, h = bh(L);
    const x = Math.round(L.W / 2 - w / 2), y = L.touch ? Math.round(L.H * 0.62) : L.H - 92;
    btn(ctx, regions, x, y, w, h, label, 'ember', () => openWriter());
    if (!L.touch) { const s = W8.at(S.near.name), sw = g.textW(s) + 8; g.scrim(ctx, Math.round(L.W / 2 - sw / 2), y + h + 2, sw, g.lh + 2, 150); g.text(ctx, s, L.W / 2, y + h + 3, 'cream', { align: 'center' }); }
  }
  function openWriter(preset = null) {
    if (!M || !S.near) return false;
    const fr = M.frames();
    const W = { at: S.near.key, place: S.near.name, parts: [], cur: 0, frame: fr[1] ? fr[1].id : fr[0].id, kind: 'place', start: 0, starts: [0], forIdx: 0 };
    if (preset) { W.frame = preset[0]; W.kind = (fr.find((f) => f.id === preset[0]) || {}).kind || W.kind; W.parts = [preset]; }
    closeAll(); S.write = W;
    return true;
  }

  // ---------------------------------------------------------------- the writer
  function forChoices() { return ['friends', ...(M ? M.friends() : []), 'me']; }
  function forLabel(W) { const c = forChoices()[W.forIdx % forChoices().length]; return c === 'friends' ? W8.forFriends : c === 'me' ? W8.forMe : W8.forOne(c); }
  function signFor(W) { const c = forChoices()[W.forIdx % forChoices().length]; return c === 'friends' ? W8.signFor.friends : c === 'me' ? W8.signFor.me : W8.signFor.one(c); }
  function previewOf(W) {
    const done = W.parts.filter(Boolean).map((p) => M.lineText(p));
    if (!W.parts[W.cur]) { const f = M.frames().find((x) => x.id === W.frame); if (f) done.push(f.text.replace('{}', '...')); }
    return done.join(' ');
  }
  function writer(ctx, L, regions) {
    const W0 = S.write, touch = !!L.touch, h = bh(L);
    const lex = M.lexicon();
    const frames = M.frames();
    // desktop: a column beside the lantern post, on the side away from it, so the post and the hero stay in view
    const post = S.posts.find((p) => p.key === W0.at);
    let W, x;
    if (touch) { W = L.W - 16; x = 8; } else {
      const minW = g.big ? 380 : 300, maxW = g.big ? 470 : 340;
      const px = post ? post.x : L.W / 2;
      const right = px < L.W / 2;
      const avail = right ? L.W - (px + 34) - 8 : px - 34 - 8;
      W = Math.max(minW, Math.min(maxW, avail));
      x = right ? L.W - W - 8 : 8;
    }
    const chipH = touch ? Math.max(g.lh + 6, Math.round((L.minHit || 24) * 0.78)) : g.lh + 5;
    const inner = W - 16;
    const flow = (items, x0, w, maxRows = 99) => {
      let cx = x0, cy = 0, rows = 1; const out = [];
      for (const it of items) {
        const cw = g.textW(it.label) + 12;
        if (cx + cw > x0 + w && cx > x0) { if (rows >= maxRows) break; cx = x0; cy += chipH + 3; rows++; }
        out.push({ ...it, x: cx, y: cy, w: cw }); cx += cw + 3;
      }
      return { out, bottom: cy + chipH };
    };
    const fr = flow(frames.map((f) => ({ label: f.label || f.text.replace('{}', '...'), on: f.id === W0.frame, scheme: 'slate', on2: () => pickFrame(f) })), x + 8, inner);
    const counts = {};
    for (const v of lex.values()) counts[v.kind] = (counts[v.kind] || 0) + 1;
    const tabs = flow(TABS.filter(([k]) => counts[k]).map(([k, lab]) => ({ label: `${lab} ${counts[k]}`, on: k === W0.kind, scheme: 'slate', on2: () => pickKind(k) })), x + 8, inner);
    const all = [...lex.entries()].filter(([, v]) => v.kind === W0.kind).map(([k, v]) => ({ key: k, text: v.text, isNew: !!v.isNew }));
    const cur = W0.parts[W0.cur];
    const maxRows = touch ? 2 : 3;
    const list = all.slice(W0.start).map((w) => ({ label: w.text, on: !!(cur && cur[1] === w.key), scheme: w.isNew ? 'violet' : 'blue', on2: () => pickWord(w.key) }));
    let wd = flow(list, x + 8, inner, maxRows);
    const more = W0.start + wd.out.length < all.length || W0.start > 0;
    if (more) {
      const lab = W8.more;
      while (wd.out.length && (() => { const last = wd.out[wd.out.length - 1]; return last.x + last.w + 3 + g.textW(lab) + 12 > x + 8 + inner && last.y >= wd.bottom - chipH; })()) wd.out.pop();
      const last = wd.out[wd.out.length - 1];
      const mx = last ? last.x + last.w + 3 : x + 8, my = last ? last.y : 0;
      const shown = wd.out.length;
      wd.out.push({ label: lab, x: mx, y: my, w: g.textW(lab) + 12, scheme: 'slate', on2: () => { W0.start = W0.start + shown >= all.length ? 0 : W0.start + shown; } });
      wd = { out: wd.out, bottom: Math.max(wd.bottom, my + chipH) };
    }
    const hint = touch ? [] : g.wrap(W8.learn, inner);
    const pv = g.wrap(previewOf(W0), inner - 12);
    const hidden = M.hiddenCount();
    const H = 6 + g.lh + 4 + g.lh + 2 + fr.bottom + 6 + g.lh + 2 + tabs.bottom + 4 + wd.bottom + 4 + hint.length * g.lh + 6 + (pv.length + 1) * g.lh + 8 + 6 + h + 8 + (hidden && !touch ? g.lh + 2 : 0);
    const y = touch ? Math.max(2, Math.round((L.H - H) / 2)) : Math.max(4, Math.min(g.big ? 62 : 92, L.H - H - 4));
    regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'window', id: 'notes_write' });
    g.window(ctx, x, y, W, H, 'std', 'blue', 0.97);
    g.text(ctx, g.clip(W8.title(W0.place), W - 80), x + 8, y + 6, 'gold');
    g.text(ctx, W8.lines(W0.parts.filter(Boolean).length), x + W - 8, y + 6, 'dim', { align: 'right' });
    let cy = y + 6 + g.lh + 4;
    const chips = (F, oy, kind) => {
      for (const c of F.out) {
        g.window(ctx, c.x, oy + c.y, c.w, chipH, 'thin', c.on ? 'ember' : c.scheme, c.on ? 0.95 : 0.85);
        g.text(ctx, c.label, c.x + 6, oy + c.y + Math.round((chipH - g.lh) / 2), c.on ? 'cream' : 'white');
        regions.push({ rect: { x: c.x, y: oy + c.y, w: c.w, h: chipH }, kind: 'button', label: `notes_${kind}:${c.label}`, on: c.on2 });
      }
    };
    g.text(ctx, W8.pick, x + 8, cy, 'gray'); cy += g.lh + 2;
    chips(fr, cy, 'frame'); cy += fr.bottom + 6;
    g.text(ctx, W8.fill, x + 8, cy, 'gray'); cy += g.lh + 2;
    chips(tabs, cy, 'tab'); cy += tabs.bottom + 4;
    chips(wd, cy, 'word'); cy += wd.bottom + 4;
    hint.forEach((s, i) => g.text(ctx, s, x + 8, cy + i * g.lh, 'dim')); cy += hint.length * g.lh + 6;
    const ph = (pv.length + 1) * g.lh + 8;
    page(ctx, x + 6, cy, W - 12, ph);
    pv.forEach((s, i) => ink(ctx, s, x + 12, cy + 4 + i * g.lh, C().inkText));
    ink(ctx, W8.sign(M.me(), signFor(W0)), x + W - 12, cy + 4 + pv.length * g.lh, '#7a5a3a', { align: 'right' });
    cy += ph + 6;
    const ok = W0.parts.some(Boolean);
    const lw = g.textW(W8.leaveHere) + 20, cw2 = g.textW(W8.cancel) + 20;
    let bx = x + 8;
    const fl = forLabel(W0), fw = g.textW(fl) + 16;
    btn(ctx, regions, bx, cy, fw, h, fl, 'slate', () => { W0.forIdx = (W0.forIdx + 1) % forChoices().length; }); bx += fw + 4;
    const canAdd = W0.parts.length === 1 && !!W0.parts[0];
    const al = canAdd ? W8.addLine : W8.clear, aw = g.textW(al) + 16;
    if (bx + aw < x + W - 8 - lw - cw2 - 8) btn(ctx, regions, bx, cy, aw, h, al, 'blue', () => { if (canAdd) { W0.cur = 1; W0.parts.push(null); } else { W0.parts = []; W0.cur = 0; } });
    btn(ctx, regions, x + W - 8 - lw - cw2 - 4, cy, cw2, h, W8.cancel, 'crimson', () => { S.write = null; });
    btn(ctx, regions, x + W - 8 - lw, cy, lw, h, W8.leaveHere, 'ember', () => leave(W0), !ok);
    if (hidden && !touch) btn(ctx, regions, x + 8, cy + h + 2, g.textW(W8.showHidden(hidden)) + 12, g.lh, W8.showHidden(hidden), 'slate', () => M.unhideAll());
  }
  function pickFrame(f) {
    const W = S.write;
    W.frame = f.id;
    if (W.kind !== f.kind) { W.kind = f.kind; W.start = 0; }
    const cur = W.parts[W.cur];
    if (cur && M.kindOf(cur[1]) === f.kind) W.parts[W.cur] = [f.id, cur[1]];
    else W.parts[W.cur] = null;
    if (W.parts[W.cur] === null && W.cur === W.parts.length - 1 && W.cur > 0) { /* keep the empty second line */ }
  }
  function pickKind(k) {
    const W = S.write;
    if (W.kind === k) return;
    W.kind = k; W.start = 0;
    const f = M.frames().find((x) => x.id === W.frame);
    if (!f || f.kind !== k) { const nf = M.frames().find((x) => x.kind === k); if (nf) { W.frame = nf.id; W.parts[W.cur] = null; } }
  }
  function pickWord(key) {
    const W = S.write;
    let f = M.frames().find((x) => x.id === W.frame);
    if (!f || f.kind !== M.kindOf(key)) { f = M.frames().find((x) => x.kind === M.kindOf(key)); if (!f) return; W.frame = f.id; }
    W.parts[W.cur] = [f.id, key];
  }
  function leave(W) {
    const c = forChoices()[W.forIdx % forChoices().length];
    const n = M.leave({ at: W.at, parts: W.parts.filter(Boolean), to: c === 'friends' || c === 'me' ? null : c, share: c !== 'me' });
    if (!n) return;
    S.write = null;
    S.left = { note: n, text: M.text(n), me: c === 'me' };
  }

  // ---------------------------------------------------------------- left: how it reaches friends
  function leftCard(ctx, L, regions) {
    const touch = !!L.touch, h = bh(L);
    const W = touch ? Math.max(Math.round(L.W * 0.54), Math.min(L.W - 16, 220)) : g.big ? 420 : 330;
    const body = g.wrap(S.left.me ? W8.leftMe : W8.leftBody, W - 20);
    const sub = touch || S.left.me ? [] : g.wrap(W8.leftSub, W - 20);
    const pv = g.wrap(S.left.text, W - 32);
    const ph = (pv.length + 1) * g.lh + 6;
    const H = 8 + g.lh + 4 + ph + 6 + body.length * g.lh + 8 + h + 8 + (sub.length ? sub.length * g.lh + 4 : 0);
    const post = S.posts.find((p) => S.left.note && p.key === S.left.note.at);   // a phone: the side away from the post
    const x = touch ? (post && post.x > L.W / 2 ? 4 : L.W - W - 4) : Math.round((L.W - W) / 2), y = touch ? Math.max(4, L.H - H - 4) : Math.max(4, Math.round((L.H - H) / 2) - 30);
    regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'window', id: 'notes_left' });
    g.window(ctx, x, y, W, H, 'std', 'blue', 0.97);
    g.text(ctx, W8.leftTitle, x + 10, y + 7, 'gold');
    const py = y + 8 + g.lh + 4;
    page(ctx, x + 10, py, W - 20, ph);
    pv.forEach((s, i) => ink(ctx, s, x + 16, py + 3 + i * g.lh, C().inkText));
    ink(ctx, `${M.me()}, today`, x + W - 16, py + 3 + pv.length * g.lh, '#7a5a3a', { align: 'right' });
    let ly = py + ph + 6;
    for (const s of body) { g.text(ctx, s, x + 10, ly, 'white'); ly += g.lh; }
    const by = ly + 6, bw = Math.round((W - 30) / 2);
    if (S.left.me) btn(ctx, regions, x + 10, by, W - 20, h, W8.done, 'slate', () => { S.left = null; });
    else {
      btn(ctx, regions, x + 10, by, bw, h, W8.sendLink, 'ember', () => { M.sendLink(S.left.note); });
      btn(ctx, regions, x + 20 + bw, by, bw, h, W8.done, 'slate', () => { S.left = null; });
    }
    sub.forEach((s, i) => g.text(ctx, s, x + 10, by + h + 4 + i * g.lh, 'dim'));
  }

  // ---------------------------------------------------------------- the reader
  function reader(ctx, L, regions) {
    const R = S.read, touch = !!L.touch, h = bh(L);
    const n = R.list[R.i];
    if (!n) { S.read = null; return; }
    M.markRead(n.id);
    const mine = n.from === M.me();
    const wrapW = touch ? Math.min(L.W - 60, 330) : g.big ? 360 : 280;
    const rows = g.wrap(M.text(n), wrapW);
    const near = !!(S.near && S.near.key === n.at);
    const more = R.list.length > 1;
    const B = mine ? [[W8.takeDown, 'slate', () => { M.remove(n.id); R.list.splice(R.i, 1); if (!R.list.length) S.read = null; else R.i %= R.list.length; }]]
      : [...(near ? [[W8.reply, 'ember', () => { S.read = null; openWriter(['thanks', `n:${n.from}`]); }]] : []),
        [W8.hide(n.from), 'slate', () => { M.hide(n.from); R.list = R.list.filter((x) => x.from !== n.from); R.i = 0; if (!R.list.length) S.read = null; }]];
    if (more) B.push([W8.next, 'blue', () => { R.i = (R.i + 1) % R.list.length; }]);
    B.push([W8.close, 'crimson', () => { S.read = null; }]);
    const bws = B.map(([s]) => g.textW(s) + 16);
    const W = Math.min(L.W - 8, Math.max(wrapW, bws.reduce((a, b) => a + b + 6, 0)) + 24);
    const place = M.placeName(n.at);
    const H = 8 + g.lh + 6 + rows.length * g.lh + g.lh + 14 + 8 + h + 8;
    const x = Math.round((L.W - W) / 2), y = touch ? Math.round(L.H * 0.5 - H / 2) + 18 : Math.round(L.H * 0.5 - H / 2) - 30;
    regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'window', id: 'notes_read' });
    g.window(ctx, x, y, W, H, 'std', 'blue', 0.97);
    g.text(ctx, mine ? W8.mineTitle : W8.readTitle(n.from), x + 10, y + 7, 'gold');
    g.text(ctx, `${M.ago(n.day)}${more ? `  ${R.i + 1}/${R.list.length}` : ''}`, x + W - 10, y + 7, 'dim', { align: 'right' });
    const py = y + 8 + g.lh + 4, ph = rows.length * g.lh + g.lh + 12;
    page(ctx, x + 10, py, W - 20, ph);
    rows.forEach((s, i) => ink(ctx, s, x + 17, py + 5 + i * g.lh, C().inkText));
    ink(ctx, W8.signAt(n.from, place), x + W - 17, py + 5 + rows.length * g.lh + 2, '#7a5a3a', { align: 'right' });
    let bx = x + 10;
    const by = py + ph + 8;
    B.forEach(([s, sch, on], i) => { btn(ctx, regions, bx, by, bws[i], h, s, sch, on); bx += bws[i] + 6; });
  }

  // ---------------------------------------------------------------- a note link was tapped
  function linkCard(ctx, L, regions) {
    const n = S.link, touch = !!L.touch, h = bh(L);
    const lines = [W8.linkTitle(n.from, M.placeName(n.at, true)), W8.linkSub];
    const W = Math.min(L.W - 16, Math.max(...lines.map((s) => g.textW(s))) + 40);
    const H = 8 + g.lh * 2 + 8 + h + 10;
    const x = touch ? 8 : Math.round((L.W - W) / 2), y = touch ? Math.round(L.H * 0.3) : 40;
    regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'window', id: 'notes_link' });
    g.window(ctx, x, y, W, H, 'std', 'blue', 0.97);
    seal(ctx, x + 16, y + 20, true, 1, 0);
    g.text(ctx, lines[0], x + 28, y + 7, 'gold');
    g.text(ctx, lines[1], x + 28, y + 7 + g.lh, 'white');
    const bw = Math.round((W - 30) / 2);
    btn(ctx, regions, x + 10, y + 8 + 2 * g.lh + 6, bw, h, W8.readNow, 'ember', () => { S.link = null; S.read = { list: [n], i: 0 }; });
    btn(ctx, regions, x + 20 + bw, y + 8 + 2 * g.lh + 6, bw, h, W8.findThere, 'slate', () => { S.link = null; });
  }

  const scoped = (L, fn) => (L.touch ? fn() : g.textScope(fn));
  return {
    S,
    setModel(m) { M = m; },
    get open() { return !!(S.write || S.left || S.read || S.link); },
    escape() { if (!(S.write || S.left || S.read || S.link)) return false; closeAll(); return true; },
    openReader(key) { if (!M) return false; const list = M.notesAt(key); if (!list.length) return false; closeAll(); S.read = { list, i: Math.max(0, list.findIndex((n) => M.isUnread(n))) }; return true; },
    openLink(n) { if (n) { closeAll(); S.link = n; } },
    openWriter,
    /** under the HUD: the seals over the lantern posts (a tap reads the notes there) */
    drawUnder(ctx, L, regions, t) {
      if (!M) return;
      S.posts = M.posts();
      S.near = M.near();
      if (S.write && (!S.near || S.near.key !== S.write.at)) S.write = null;   // walked off: the writer closes
      scoped(L, () => {
        for (const p of S.posts) {
          if (!p.n || p.x < -20 || p.y < -20 || p.x > L.W + 20 || p.y > L.H + 20) continue;
          const r = seal(ctx, p.x, p.y, p.unread, p.n, t || 0);
          const s = Math.max(r.w, Math.round((L.minHit || 15) * 0.8));
          regions.push({ rect: { x: Math.round(p.x - s / 2), y: Math.round(r.y + r.h / 2 - s / 2), w: s, h: s }, kind: 'button', label: `notes_seal:${p.key}`, on: () => this.openReader(p.key) });
        }
      });
    },
    /** over the HUD (after the phone's top bar, so a panel is never under it) */
    draw(ctx, L, regions) {
      if (!M) return;
      scoped(L, () => {
        if (S.write) writer(ctx, L, regions);
        else if (S.left) leftCard(ctx, L, regions);
        else if (S.read) reader(ctx, L, regions);
        else if (S.link) linkCard(ctx, L, regions);
        else if (S.near && !st.open.size && !st.dialog && !st.chest && !st.wdoor) nearButton(ctx, L, regions);
      });
    },
  };
}

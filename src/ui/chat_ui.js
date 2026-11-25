// Talking with friends, the drawing (wave 8 talk lane, D:/LQOnline/wave8/talk/BRIEF.md, approved 2026-11-24). Only in an
// online co-op game (setActive); solo play keeps today's log exactly. Drawn with the g.* calls, so the UI skin applies,
// and Text size Large reaches it on desktop as it does today's log (a phone's play layer is already big, hud.js sized):
//   - the chat window (bottom left): tabs All / Party / Whispers / Combat, a time on every talk line; the phone shows
//     the newest 3 lines (it lets taps through: the left thumb walks there) and opens the whole log from the Say sheet
//   - speech bubbles over the speaker's head, 2D and 3D, under the HUD (frames and buttons always win), never overlapping
//   - the phone Say sheet (the Chat button in play): quick phrases, a tap each, no keyboard
//   - a friend's card (long press their party frame on a phone, right click it on desktop): Whisper, Mute, and for the
//     host Remove from game (tap twice)
// The lines are ui.js's own log ({ ch, text, talk? }): coop.js adds talk lines with a `talk` field, so logText, the
// drivers and the 2D log keep working. History is that in-memory log (200 lines), never saved. Player words: DRAFTS.
//
//   const C = createChatUI({ g, st, log })
//   C.setActive(on, { host })   C.setActions({ say, type, whisper, mute, unmute, isMuted, kick, emotes })
//   C.bubble(id, text)          C.openSheet()   C.openCard(id)   C.longPress(region)   C.rightClick(region)
//   C.drawUnder(ctx, L, heads)  heads: [{ id, name, x, y, me, plate, is3d }] HUD px (main.js talkHeads)
//   C.draw(ctx, L, regions, m)  C.drawWatch(ctx, L, regions)
import { PHRASES, bubbleFor, tabHas } from '../net/talk.js';

const CH = { party: '#8fb8ff', whisper: '#d6a8ff', you: '#a8f0b0' };
const LOG_COLOR = { system: 'gold', combat: 'gray', damage_in: 'red', damage_out: 'white', heal: 'green', party: 'blue', say: 'white', loot: 'green', xp: 'violet', error: 'red' };
const TABS = [['all', 'All'], ['party', 'Party'], ['whispers', 'Whispers'], ['combat', 'Combat']];   // drafts
const SHEET_ROW = ['Type', 'Emotes', 'Chat log', 'Close'];                                          // drafts

export function createChatUI({ g, st, log }) {
  const S = { active: false, live: null, host: false, tab: 'all', sheet: false, full: false, card: null, seenW: 0, pressed: null };
  let A = {};
  const bubbles = new Map();          // hero id -> { text, t0 }
  const now = () => st.now || 0;
  const muted = (name) => !!(name && A.isMuted && A.isMuted(name));
  const visible = (l) => !(l.talk && muted(l.talk.from) && !l.talk.out);
  const whispers = () => log.filter((l) => l.talk && l.talk.kind === 'whisper' && !l.talk.out && visible(l)).length;
  const ink = (ctx, s, x, y, col) => (g.skin ? g.skin.ink(ctx, s, x, y, col, { big: g.big }) : g.text(ctx, s, x, y, col));
  const C = () => (g.skin && g.skin.C) || { page: '#eadbb6', inkText: '#3a2618', bronzeLo: '#5e3f1c', gilt: '#f9d77a' };

  // ---------------------------------------------------------------- speech bubbles
  const placed = [];
  function bubble(ctx, L, h, text) {
    const c = C();
    const maxW = L.touch ? Math.min(150, Math.round(L.W * 0.26)) : g.big ? 175 : 120;
    const b = bubbleFor(text, (s, w) => g.wrap(s, w), maxW);
    const tw = Math.max(...b.lines.map((s) => g.textW(s)));
    const pad = 4, w = tw + pad * 2, hh = b.lines.length * g.lh + pad + 2;
    // above the name: 3D draws a name and health pip over every other hero, 2D the co-op plate; your own hero has none
    let bottom = Math.round(h.y - (h.me ? 6 : h.is3d ? 27 : 17));
    const x = Math.max(2, Math.min(L.W - w - 2, Math.round(h.x - w / 2)));
    for (let k = 0; k < 6; k++) {
      const hit = placed.find((p) => x < p.x + p.w + 2 && p.x < x + w + 2 && bottom - hh - 5 < p.y + p.h + 5 && p.y - 5 < bottom + 5);
      if (!hit) break;
      bottom = hit.y - 8;
    }
    const y = Math.max(2, bottom - hh);
    placed.push({ x, y, w, h: hh });
    if (g.skin) g.skin.page(ctx, x, y, w, hh); else g.rect(ctx, x, y, w, hh, c.page);
    g.outline(ctx, x - 1, y - 1, x + w, y + hh, c.bronzeLo);
    g.rect(ctx, x, y, w, 1, c.gilt);
    const tx = Math.max(x + 4, Math.min(x + w - 8, Math.round(h.x - 3)));
    for (let i = 0; i < 4; i++) { g.rect(ctx, tx + i, y + hh + i, 7 - 2 * i, 1, c.page); g.rect(ctx, tx + i - 1, y + hh + i, 1, 1, c.bronzeLo); g.rect(ctx, tx + 7 - i - (i ? 1 : 0), y + hh + i, 1, 1, c.bronzeLo); }
    b.lines.forEach((s, i) => ink(ctx, s, x + pad, y + 2 + i * g.lh, c.inkText));
  }
  function drawBubbles(ctx, L, heads) {
    placed.length = 0;
    const t = now();
    const list = [];
    for (const [id, bb] of bubbles) {
      const secs = bubbleFor(bb.text, (s) => [s], 999).ticks / 20;
      if (t - bb.t0 > secs || t < bb.t0 - 1) { bubbles.delete(id); continue; }
      const h = (heads || []).find((u) => u.id === id);
      if (h && !muted(h.name)) list.push([bb.t0, h, bb.text]);
    }
    list.sort((a, b) => a[0] - b[0]);             // oldest first: a newer bubble climbs above an older one
    for (const [, h, text] of list) bubble(ctx, L, h, text);
  }

  // ---------------------------------------------------------------- the chat window
  function parts(l, withTime) {
    const t = l.talk;
    const time = withTime && t && t.at ? [[`${t.at} `, 'dim']] : [];
    if (!t) return [[l.text, LOG_COLOR[l.ch] || 'white']];
    if (t.kind === 'whisper') return [...time, [t.out ? `To ${t.to}: ` : `${t.from} whispers: `, CH.whisper], [t.body, CH.whisper]];
    if (t.kind === 'party') return [...time, [`${t.from}: `, t.me ? CH.you : CH.party], [t.body, 'cream']];
    return [...time, [t.body, 'gold']];
  }
  function wrapRuns(runs, width) {
    const words = [];
    for (const [s, col] of runs) for (const w of String(s).split(/(\s+)/)) if (w) words.push([w, col]);
    const rows = [[]];
    let x = 0;
    for (const [w, col] of words) {
      const ww = g.textW(w);
      if (x + ww > width && x > 0 && !/^\s+$/.test(w)) { rows.push(Object.assign([], { cont: true })); x = 10; }
      if (!rows[rows.length - 1].length && /^\s+$/.test(w)) continue;
      rows[rows.length - 1].push([w, col]); x += ww;
    }
    return rows;
  }
  function chatWindow(ctx, L, regions, { full = false, watch = false } = {}) {
    const touch = !!L.touch;
    const small = touch && !full;
    const w = small ? Math.min(L.W - 12, L.chat.w + 30) : touch ? Math.min(L.W - 12, 330) : g.big ? 330 : 250;
    const x = L.chat.x;
    const n = small ? 3 : touch ? 7 : 8;
    const tabH = small ? 0 : Math.max(g.ls(13), touch ? Math.round((L.minHit || 24) * 0.8) : 0);
    if (S.tab === 'whispers') S.seenW = whispers();
    const unread = Math.max(0, whispers() - S.seenW);
    const lines = log.filter((l) => visible(l) && tabHas(S.tab, l));
    let rows = [];
    for (const l of lines.slice(-60)) for (const r of wrapRuns(parts(l, !small), w - 10)) rows.push(r);
    const maxOff = Math.max(0, rows.length - n);
    st.chatScroll = Math.max(0, Math.min(maxOff, st.chatScroll || 0));
    rows = rows.slice(Math.max(0, rows.length - n - st.chatScroll), rows.length - st.chatScroll);
    if (small && !rows.length) return;
    const closeH = full && touch ? Math.max(g.ls(15), L.minHit || 0) : 0;
    const h = 5 + tabH + Math.max(rows.length, small ? 0 : 2) * g.lh + 4 + (closeH ? closeH + 4 : 0);
    const y = full && touch ? Math.max(2, L.H - h - 12) : L.chat.bottom - h;
    if (full && touch) regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'window', id: 'chat_full', on: () => { S.full = false; } });
    g.window(ctx, x, y, w, h, 'thin', 'blue', small ? 0.62 : 0.88);
    let ty = y + 4;
    if (tabH) {
      let tx = x + 4;
      for (const [id, label] of TABS) {
        const lab = id === 'whispers' && unread ? `${label} ${unread}` : label;
        const tw = g.textW(lab) + 10;
        const on = S.tab === id;
        g.window(ctx, tx, ty, tw, tabH - 2, 'thin', on ? 'ember' : 'slate', on ? 0.95 : 0.8);
        g.text(ctx, lab, tx + 5, ty + Math.round((tabH - 2 - g.lh) / 2), on ? 'cream' : id === 'whispers' && unread ? CH.whisper : 'gray');
        regions.push({ rect: { x: tx, y: ty, w: tw, h: tabH - 2 }, kind: 'button', label: `chat_tab:${id}`, on: () => { S.tab = id; st.chatScroll = 0; } });
        tx += tw + 3;
      }
      ty += tabH;
    }
    rows.forEach((r, i) => { let cx = x + 5 + (r.cont ? 10 : 0); for (const [s, col] of r) cx += g.text(ctx, s, cx, ty + 1 + i * g.lh, col); });
    if (st.chatScroll > 0 && !small) g.text(ctx, `+${st.chatScroll}`, x + w - 5, ty + 1, 'dim', { align: 'right' });
    if (!small) regions.push({ rect: { x, y: ty, w, h: Math.max(1, rows.length) * g.lh + 4 }, kind: 'chat' });   // the wheel scrolls it
    else if (watch) regions.push({ rect: { x, y, w, h }, kind: 'button', label: 'chat_open', on: () => { S.full = true; } });   // a watcher has no thumb stick there
    if (closeH) {
      const by = y + h - closeH - 4;
      g.window(ctx, x + 4, by, w - 8, closeH, 'thin', 'crimson', 0.9);
      g.text(ctx, 'Close', x + w / 2, by + Math.round((closeH - g.lh) / 2) + 1, 'cream', { align: 'center' });
      regions.push({ rect: { x: x + 4, y: by, w: w - 8, h: closeH }, kind: 'button', label: 'chat_full:close', on: () => { S.full = false; } });
    }
    if (watch && !small && !rows.length) g.text(ctx, 'No one has said anything yet.', x + 5, ty + 1, 'dim');   // draft
  }

  // ---------------------------------------------------------------- the phone Say sheet
  function sheet(ctx, L, regions) {
    const touch = !!L.touch;
    const bh = Math.max(g.ls(16), touch ? L.minHit || 0 : 0);
    const cols = 4, gap = 4;
    const bw = Math.max(...PHRASES.map((p) => g.textW(p)), ...SHEET_ROW.map((p) => g.textW(p))) + 14;
    const gw = cols * bw + (cols - 1) * gap;
    const W = gw + 16, H = 8 + g.lh + 6 + 3 * bh + 2 * gap + 6 + 8;
    const x = touch ? 4 : Math.round((L.W - W) / 2), y = L.H - H - 12;
    regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'window', id: 'chat_sheet', on: () => { S.sheet = false; } });
    g.window(ctx, x, y, W, H, 'std', 'blue', 0.95);
    g.text(ctx, 'Say to your party', x + 8, y + 6, 'gold');                 // draft
    g.text(ctx, 'tap one', x + W - 8, y + 6, 'dim', { align: 'right' });     // draft
    const cell = (i, row, label, scheme, on) => {
      const bx = x + 8 + i * (bw + gap), by = y + 8 + g.lh + 6 + row * (bh + gap) + (row === 2 ? 6 - gap : 0);
      g.window(ctx, bx, by, bw, bh, 'thin', scheme, 0.95);
      g.text(ctx, label, bx + bw / 2, by + Math.round((bh - g.lh) / 2) + 1, 'cream', { align: 'center' });
      regions.push({ rect: { x: bx, y: by, w: bw, h: bh }, kind: 'button', label: `chat_say:${label}`, on });
    };
    PHRASES.forEach((p, i) => cell(i % cols, Math.floor(i / cols), p, S.pressed === p ? 'ember' : 'blue', () => { S.sheet = false; S.pressed = null; if (A.say) A.say(p); }));
    cell(0, 2, SHEET_ROW[0], 'slate', () => { S.sheet = false; if (A.type) A.type(); });
    cell(1, 2, SHEET_ROW[1], 'violet', () => { S.sheet = false; if (A.emotes) A.emotes(); });
    cell(2, 2, SHEET_ROW[2], 'slate', () => { S.sheet = false; S.full = true; });
    cell(3, 2, SHEET_ROW[3], 'crimson', () => { S.sheet = false; });
  }

  // ---------------------------------------------------------------- a friend's card
  function card(ctx, L, regions, m) {
    const u = ((m && m.party) || []).find((p) => p.id === S.card.id);
    if (!u) { S.card = null; return; }
    const touch = !!L.touch;
    const bh = Math.max(g.ls(15), touch ? L.minHit || 0 : 0);
    const isMuted = muted(u.name);
    const items = [['Whisper', 'violet', () => { S.card = null; if (A.whisper) A.whisper(u.name); }],
      [isMuted ? 'Unmute' : 'Mute', 'slate', () => { S.card = null; if (isMuted) { if (A.unmute) A.unmute(u.name); } else if (A.mute) A.mute(u.name); }]];
    if (S.host) {
      items.push([S.card.armed ? 'Tap again to remove' : 'Remove from game', 'crimson', () => {
        if (!S.card.armed) { S.card.armed = true; return; }
        S.card = null; if (A.kick) A.kick(u.id, u.name);
      }]);
    }
    const sub = `Level ${u.level || 1}${u.clsName ? ` ${u.clsName}` : ''}`;
    const note = 'Mute is only on this device. They are not told.';           // draft
    const W = touch ? g.textW('Tap again to remove') + 28 : Math.max(g.textW(note), g.textW('Tap again to remove') + 20, g.textW(sub)) + 16;
    const H = touch ? 6 + g.lh + 4 + items.length * (bh + 3) + 4 : 6 + 2 * g.lh + 6 + items.length * (bh + 3) + g.lh + 6;
    const party = (m.party || []).length;
    const pf = L.party(Math.max(0, Math.min(2, party - 1)));
    let x = 4, y = pf.y + pf.h + 4;
    if (!touch) { const r = L.party(Math.max(0, (m.party || []).findIndex((p) => p.id === u.id))); x = r.x + r.w + 6; y = r.y; }
    x = Math.max(2, Math.min(L.W - W - 2, x)); y = Math.max(2, Math.min(L.H - H - 2, y));
    regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'window', id: 'chat_card', on: () => { S.card = null; } });
    g.window(ctx, x, y, W, H, 'std', 'blue', 0.96);
    g.text(ctx, u.name, x + 8, y + 5, 'gold');
    if (!touch) g.text(ctx, sub, x + 8, y + 5 + g.lh, 'gray');
    items.forEach(([lab, sch, on], i) => {
      const by = touch ? y + 6 + g.lh + 4 + i * (bh + 3) : y + 6 + 2 * g.lh + 6 + i * (bh + 3);
      g.window(ctx, x + 8, by, W - 16, bh, 'thin', sch, 0.95);
      g.text(ctx, lab, x + W / 2, by + Math.round((bh - g.lh) / 2) + 1, 'cream', { align: 'center' });
      regions.push({ rect: { x: x + 8, y: by, w: W - 16, h: bh }, kind: 'button', label: `chat_card:${lab}`, on });
    });
    if (!touch) g.text(ctx, note, x + 8, y + H - g.lh - 4, 'dim');
  }

  const on = () => S.active && (!S.live || S.live());   // live: coop.js says a co-op game is still on
  const scoped = (L, fn) => (L.touch ? fn() : g.textScope(fn));
  return {
    state: S,
    get active() { return on(); },
    get sheetOpen() { return S.sheet; },
    get cardOpen() { return S.card; },
    setActive(yes, { host = false, live = null } = {}) {
      S.active = !!yes; S.host = !!host; S.live = live; S.sheet = false; S.full = false; S.card = null; bubbles.clear();
      S.seenW = whispers();
    },
    setHost(on) { S.host = !!on; },
    setActions(a) { A = a || {}; },
    bubble(id, text) { if (id != null && text) bubbles.set(id, { text, t0: now() }); },
    openSheet() { if (!on()) return false; S.sheet = true; S.card = null; S.full = false; return true; },
    openCard(id) { if (!on() || id == null) return false; S.card = { id, armed: false }; S.sheet = false; return true; },
    close() { S.sheet = false; S.card = null; S.full = false; },
    /** Esc (wave 9 fixes): closes the card, the Say sheet or the whole log, one at a time; false when none was open */
    escape() {
      if (S.card) S.card = null; else if (S.sheet) S.sheet = false; else if (S.full) S.full = false; else return false;
      return true;
    },
    /** a long press on a friend's party frame (phone) opens their card */
    longPress(r) { return !!(r && r.kind === 'party' && st.mode === 'game' && this.openCard(r.id)); },
    /** a right click on a friend's party frame (desktop) opens their card */
    rightClick(r) { return !!(r && r.kind === 'party' && this.openCard(r.id)); },
    /** under the HUD, with the name plates */
    drawUnder(ctx, L, heads) { if (on()) scoped(L, () => drawBubbles(ctx, L, heads)); },
    /** over the HUD: the window (in place of today's log), then the sheet or the card */
    draw(ctx, L, regions, m) {
      if (!on()) return;
      scoped(L, () => {
        if (L.touch && (S.sheet || S.card || S.full)) {
          if (S.full) chatWindow(ctx, L, regions, { full: true });
        } else chatWindow(ctx, L, regions);
        if (S.sheet) sheet(ctx, L, regions);
        else if (S.card) card(ctx, L, regions, m);
      });
    },
    /** a watcher (no hero, no HUD): the window only, so they can read */
    drawWatch(ctx, L, regions, heads) {
      if (!on()) return;
      scoped(L, () => { drawBubbles(ctx, L, heads); chatWindow(ctx, L, regions, { full: !!S.full, watch: true }); });
    },
  };
}

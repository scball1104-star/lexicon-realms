// Word rifts, the card (wave 10 drift, Scott 2026-11-25; D:/LQOnline/wave10/drift/BRIEF.md). Drawn with the g.* calls so
// the skin and Text size apply. Reads the HUD block's `rift` part (src/sim/rift.js hudOf) and sends rift_open.
//
//   const RU = createRiftUI({ g, send, toast })
//   RU.draw(ctx, L, regions, hud, busy)   the Rift Stone button and card at Lantern Square's post; the chip in a rift
//   RU.receive(link)                      main.js: a friend's #rift= link ({ word, version, level }, readRiftLink)
//   RU.onEvent(ev, me)                    a room breathing out, a word learned, a refusal, as short toasts
//   stoneRows(stone, link)                pure model of the card's rows (node tests)
//
// SCOTT: EVERY WORD IN RIFT_WORDS IS A DRAFT (drift lane).
import { riftLink } from '../data/rift.js';

export const RIFT_WORDS = {
  button: 'Rift Stone', title: 'The Rift Stone', line: 'Say a word, and a rift opens under the square.',
  week: 'Word of the week', yours: 'Your words', fromLink: "A friend's link", open: 'Open', link: 'Link', close: 'Close',
  level: (n) => `Rifts open at your level: ${n}. Friends beside the stone go in with you.`,
  low: (n) => `Rifts open at level ${n}.`, combat: 'Not while you are fighting.',
  none: 'Spell word doors and clear rifts to learn more words.',
  chip: (w) => `Find the letters of ${w}`,
  copied: 'Link copied.', shared: 'Link shared.', noShare: 'Could not share the link.',
  linkCard: (w) => `A friend sent you the ${w} rift. Take it to the Rift Stone in Lantern Square.`,
  breath: 'The room breathes out.', learned: (w) => `New rift word: ${w}`,
  fail: { not_here: 'Stand at the Rift Stone in Lantern Square.', level: 'Rifts open at level 10.', word: 'That word does not open a rift for you yet.',
    combat: 'Not while you are fighting.', dead: 'Not now.', inside: 'Leave this place first.' },
};
const W = RIFT_WORDS;

/** The card's rows: [{ word, kind: 'week' | 'yours' | 'link', link? }] (the week word first, then a link's, then yours). */
export function stoneRows(stone, link, max = 6) {
  const rows = [{ word: stone.week, kind: 'week' }];
  if (link && link.word && link.word !== stone.week && !(stone.words || []).includes(link.word)) rows.push({ word: link.word, kind: 'link', link: true });
  for (const w of (stone.words || []).slice(0, Math.max(0, max - rows.length))) rows.push({ word: w, kind: 'yours' });
  return rows;
}

export function createRiftUI({ g, send, toast, loc = globalThis.location, nav = globalThis.navigator }) {
  const S = { open: false, link: null };
  const bh = (L) => Math.max(g.ls(15), L.touch ? L.minHit || 0 : 0);
  const btn = (ctx, regions, x, y, w, h, label, scheme, on) => {
    g.window(ctx, x, y, w, h, 'thin', scheme, 0.95);
    g.text(ctx, g.clip(label, w - 6), x + w / 2, y + Math.round((h - g.lh) / 2) + 1, on ? 'cream' : 'dim', { align: 'center' });
    if (on) regions.push({ rect: { x, y, w, h }, kind: 'button', label: `rift:${label}`, on });
  };

  function share(word, level) {
    const url = loc ? `${loc.origin}${loc.pathname}#${riftLink(word, level)}` : `#${riftLink(word, level)}`;
    const done = (t) => toast(t);
    try {
      if (nav && nav.share) { nav.share({ url, text: `${word}: a rift in Lexicon Realms` }).then(() => done(W.shared), () => {}); return; }
      if (nav && nav.clipboard) { nav.clipboard.writeText(url).then(() => done(W.copied), () => done(W.noShare)); return; }
    } catch { /* below */ }
    done(W.noShare);
  }

  function stoneButton(ctx, L, regions) {
    const h = bh(L), w = Math.max(110, g.textW(W.button) + 24);
    const x = Math.round((L.W - w) / 2), y = L.touch ? Math.round(L.H * 0.6) : L.H - 120;
    btn(ctx, regions, x, y, w, h, W.button, 'violet', () => { S.open = true; });
  }

  function card(ctx, L, regions, stone) {
    const touch = !!L.touch, h = bh(L);
    const rows = stoneRows(stone, S.link, touch ? 4 : 7);
    const Wd = touch ? Math.min(L.W - 16, 380) : g.big ? 330 : 270;
    const inner = Wd - 16;
    const intro = g.wrap(W.line, inner);
    const foot = g.wrap(stone.ok ? W.level(stone.level) : stone.level < stone.min ? W.low(stone.min) : W.combat, inner);
    const rowH = h + 4;
    const heads = new Set(rows.map((r) => r.kind)).size;
    const none = !(stone.words || []).length;
    const H = 6 + g.lh + 4 + intro.length * g.lh + 6 + heads * (g.lh + 2) + rows.length * rowH + (none ? g.wrap(W.none, inner).length * g.lh + 4 : 0) + 4 + foot.length * g.lh + 8 + h + 8;
    const x = touch ? Math.round((L.W - Wd) / 2) : L.W - Wd - 8;
    const y = touch ? Math.max(2, Math.round((L.H - H) / 2)) : Math.max(30, Math.round((L.H - H) / 2) - 10);
    regions.push({ rect: { x, y, w: Wd, h: H }, kind: 'window', id: 'rift_stone' });
    g.window(ctx, x, y, Wd, H, 'std', 'violet', 0.96);
    let cy = y + 6;
    g.text(ctx, W.title, x + 8, cy, 'gold', { large: true }); cy += g.lh + 4;
    for (const s of intro) { g.text(ctx, s, x + 8, cy, 'gray'); cy += g.lh; }
    cy += 6;
    let last = null;
    const bw = Math.max(56, g.textW(W.open) + 16), lw = Math.max(48, g.textW(W.link) + 14);
    for (const r of rows) {
      if (r.kind !== last) { g.text(ctx, r.kind === 'week' ? W.week : r.kind === 'link' ? W.fromLink : W.yours, x + 8, cy, 'gold'); cy += g.lh + 2; last = r.kind; }
      g.rect(ctx, x + 6, cy - 1, Wd - 12, rowH - 2, 'rgba(255,255,255,0.05)');
      g.text(ctx, r.word, x + 12, cy + Math.round((h - g.lh) / 2), r.kind === 'week' ? 'white' : r.kind === 'link' ? 'green' : 'cream', { large: !touch });
      const go = stone.ok ? () => { S.open = false; if (r.link) S.link = null; send({ t: 'rift_open', word: r.word, ...(r.link ? { link: true } : {}) }); } : null;
      btn(ctx, regions, x + Wd - 8 - bw, cy, bw, h, W.open, 'ember', go);
      btn(ctx, regions, x + Wd - 8 - bw - 4 - lw, cy, lw, h, W.link, 'slate', () => share(r.word, stone.level));
      cy += rowH;
    }
    if (none) { cy += 2; for (const s of g.wrap(W.none, inner)) { g.text(ctx, s, x + 8, cy, 'dim'); cy += g.lh; } cy += 2; }
    cy += 4;
    for (const s of foot) { g.text(ctx, s, x + 8, cy, stone.ok ? 'cream' : 'orange'); cy += g.lh; }
    cy += 8;
    btn(ctx, regions, x + Math.round((Wd - 120) / 2), cy, 120, h, W.close, 'slate', () => { S.open = false; });
    return true;
  }

  function chip(ctx, L, inside) {
    const t = W.chip(inside.word);
    const pf = L.player || { x: 4, y: 4, w: 150, h: 34 };
    const x = L.touch ? pf.x : pf.x + pf.w + 6, y = L.touch ? pf.y + pf.h + 2 + 2 * (g.lh + 3) : pf.y + 2 + 2 * (g.lh + 3);
    g.scrim(ctx, x, y, g.textW(t, false) + 8, g.lh + 2, 150);
    g.text(ctx, t, x + 4, y + 1, 'violet', { small: true });
  }

  /** Returns true when the card is up (a big card on a phone). */
  function draw(ctx, L, regions, hud, busy) {
    const rf = hud && hud.rift;
    if (!rf) { S.open = false; return false; }
    if (rf.inside) { chip(ctx, L, rf.inside); return false; }
    if (!rf.stone || busy) return false;
    if (S.open) return card(ctx, L, regions, rf.stone) && !!L.touch;
    stoneButton(ctx, L, regions);
    return false;
  }

  function receive(link) {
    if (!link || !link.word) return;
    S.link = { word: link.word, level: link.level | 0 };
    toast(W.linkCard(link.word), 6);
  }
  function onEvent(ev, me) {
    if (ev.type === 'rift' && ev.kind === 'learn' && ev.id === me) toast(W.learned(ev.word));
    else if (ev.type === 'rift' && ev.kind === 'breath') toast(W.breath);
    else if (ev.type === 'rift_fail' && ev.id === me) toast(W.fail[ev.reason] || W.fail.word);
  }
  return { draw, receive, onEvent, S, covers: () => S.open };
}

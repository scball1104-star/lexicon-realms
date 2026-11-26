// Delve loot on the HUD (wave 10 dloot, Scott 2026-11-25; D:/LQOnline/wave10/dloot/BRIEF.md). UI only: reads the sim's
// `dloot` and `loot` events and the HUD model, never writes the sim except through `act` (Wear it = act.useItem).
//
//   const D = createDlootUI({ g, st, act, look })     look = src/data/dloot.js DROP_LOOK, words = DLOOT_WORDS
//   D.onEvent(ev, me, snap, zoneNames)   a drop: a column (3D: src/render3d/dloot3d.js; 2D: drawn here) and a tag; a
//                                        legendary of your own: the beat and the banner; a friend's: one line
//   D.drawUnder(ctx, env, toHud, t, is3d)   the tags at each column's foot (and in 2D the column), under the HUD
//   D.draw(ctx, env, m, L, regions, t)      the warm edges, the banner, a friend's line, the drop card (Wear it, Keep)
//   D.S.drops                            [{ wx, wy (world px, as the snapshot), zone, name, rarity, mine, who, illum, item, t0 }] (the 3D columns read it)
// Tags and cards: tap or click a tag for the card; while a card is open only its drop keeps a tag. On a small phone the
// tags fold into one chip for you and one name per friend. The card sits under the hero frame, clear of the minimap and
// the replay's REC mark (the brief's still 2 overlap).
import { drawTooltip } from './hud.js';
import { itemTooltip } from './menus.js';
import { itemInfo } from './gamedata.js';
import { DROP_LOOK, DLOOT_WORDS } from '../data/dloot.js';

const RANK = { magic: 1, rare: 2, epic: 3, set: 4, legendary: 5 };
const MAX_DROPS = 24;

export function createDlootUI({ g, st, act }) {
  const C = DROP_LOOK.colors, W_ = DLOOT_WORDS;
  const S = { drops: [], card: null, beat: null, banner: null, friend: null, cardBox: null };
  const now = () => (st && st.now) || 0;
  const posOf = (snap, id) => { const e = snap && id != null ? snap.entities.find((x) => x.id === id) : null; return e ? { x: e.x, y: e.y, zone: e.zone, name: e.name } : null; };
  const nameOfHero = (snap, id) => { const e = snap ? snap.entities.find((x) => x.id === id && x.kind === 'player') : null; return e ? e.name : 'A friend'; };
  const seen = new Map();   // `${id}:${from}` -> item ids a dloot event already placed (the loot event that follows skips them)

  function place(at, list, mine, who) {
    let k = S.drops.filter((d) => d.from === at.from).length;
    const ring = [[0, 0], [-1.4, 0.6], [1.4, 0.5], [-0.6, -1.2], [0.8, -1.3], [-2.2, -0.4], [2.3, -0.5], [0, 1.6]];
    for (const it of list.slice().sort((a, b) => (RANK[b.rarity] || 0) - (RANK[a.rarity] || 0))) {
      if (!(RANK[it.rarity] >= 1)) continue;
      const [ox, oy] = ring[k % ring.length];
      const sp = mine ? 24 : 30;
      S.drops.push({ wx: at.x + ox * sp, wy: at.y + oy * sp, zone: at.zone, from: at.from, name: it.name || (itemInfo(it.item) || {}).name || it.item, generic: !it.name,
        rarity: it.rarity, illum: !!it.illum, mine, who, item: it.item, t0: now(), dy: (k % 2) * 15 });
      k++;
    }
    while (S.drops.length > MAX_DROPS) S.drops.shift();
  }

  function onEvent(ev, me, snap, zoneNames) {
    if (!ev || me == null) return;
    if (ev.type === 'dloot') {
      const at = posOf(snap, ev.from) || posOf(snap, ev.id);
      if (!at) return;
      at.from = ev.from;
      const mine = ev.id === me, who = mine ? null : nameOfHero(snap, ev.id);
      seen.set(`${ev.id}:${ev.from}`, new Set(ev.items.map((x) => x.item)));
      place(at, ev.items, mine, who);
      const leg = ev.items.find((x) => x.rarity === 'legendary');
      const placeName = ((zoneNames && zoneNames[ev.place]) || ev.place || '').replace(/^The /, '');
      if (mine && leg) {
        S.beat = { t0: now() };
        S.banner = { t0: now(), kicker: leg.illum ? W_.legendaryIllum : W_.legendary, title: leg.name, rarity: 'legendary', illum: leg.illum,
          sub: `${W_.forYou}.  ${ev.sure ? `${W_.tally(placeName, ev.tally || 0, ev.sure)}: ${W_.reset}` : ''}`.trim() };
      } else if (mine && ev.sure && ev.tally != null) {
        S.banner = { t0: now(), kicker: '', title: '', rarity: 'epic', tallyOnly: true, sub: `${W_.tally(placeName, ev.tally, ev.sure)}.  ${W_.tallyHint(ev.sure - ev.tally)}` };
        S.chipSub = W_.tally(placeName.replace(/^Wethers' /, ''), ev.tally, ev.sure);   // a phone shows it under your chip
      }
      if (mine && ev.items.some((x) => x.illum && x.rarity === 'set')) S.beat = { t0: now() };
      if (!mine) {
        const best = ev.items.filter((x) => x.rarity === 'legendary' || x.rarity === 'epic').sort((a, b) => (RANK[b.rarity] || 0) - (RANK[a.rarity] || 0))[0];
        if (best) {
          S.friend = { t0: now(), text: W_.friendGot(who, (itemInfo(best.item) || {}).name || best.name), color: C[best.rarity] };
          const d = S.drops.find((x) => x.from === ev.from && x.who === who && x.item === best.item);
          if (d) d.found = S.friend.text;   // a phone puts the line on the friend's column instead
        }
      }
      return;
    }
    if (ev.type === 'loot' && ev.from != null && !ev.gather && !ev.skin) {
      const skip = seen.get(`${ev.id}:${ev.from}`) || new Set();
      const list = (ev.items || []).filter((x) => x.inst && (RANK[x.inst.rarity] || 0) >= 2 && !skip.has(x.item)).map((x) => ({ item: x.item, rarity: x.inst.rarity, illum: !!x.inst.illum }));
      seen.delete(`${ev.id}:${ev.from}`);
      if (!list.length) return;
      const at = posOf(snap, ev.from);
      if (!at) return;
      at.from = ev.from;
      place(at, list, ev.id === me, ev.id === me ? null : nameOfHero(snap, ev.id));
    }
  }

  /** Columns that still stand: in the hero's zone, under DROP_LOOK.stay seconds, not yet walked through. */
  function live(me) {
    const t = now();
    S.drops = S.drops.filter((d) => t - d.t0 < DROP_LOOK.stay && !(d.mine && me && d.zone === me.zone && Math.hypot(me.x - d.wx, me.y - d.wy) < 10 && t - d.t0 > 2));
    return S.drops.filter((d) => !me || d.zone === me.zone);
  }

  function tag(ctx, x, y, text, color, { faint = false, illum = false, sub = null } = {}) {
    const lh = g.lh || 11, w = Math.min(260, Math.max(g.textW(text), sub ? g.textW(sub) : 0) + 12), h = sub ? 2 * lh + 4 : lh + 3;
    const bx = Math.round(x - w / 2), by = Math.round(y);
    g.window(ctx, bx, by, w, h, 'thin', 'slate', faint ? 0.55 : 0.92);
    if (illum) { g.outline(ctx, bx - 1, by - 1, bx + w, by + h, C.gilt); g.outline(ctx, bx + 1, by + 1, bx + w - 2, by + h - 2, C.gilt); }
    g.text(ctx, g.clip(text, w - 8), x, by + 2, color, { align: 'center', alpha: faint ? 0.7 : 1 });
    if (sub) g.text(ctx, sub, x, by + 2 + lh, 'cream', { align: 'center' });
    return { x: bx, y: by, w, h };
  }

  function column2d(ctx, x, y, d, t) {
    const c = C[d.rarity] || '#ffffff';
    const h = (DROP_LOOK.h2d[d.rarity] || 0) * (d.mine ? 1 : 0.6) * Math.min(1, (now() - d.t0) * 4 + 0.2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = d.mine ? 0.75 : DROP_LOOK.friend;
    ctx.strokeStyle = c; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, 9 + 2 * Math.sin(t * 3), 4, 0, 0, Math.PI * 2); ctx.stroke();
    if (h > 0) {
      const w = d.mine ? (d.rarity === 'legendary' ? 9 : 6) : 3;
      const gr = ctx.createLinearGradient(0, y, 0, y - h);
      gr.addColorStop(0, c); gr.addColorStop(0.55, c + '88'); gr.addColorStop(1, c + '00');
      ctx.globalAlpha = d.mine ? 0.85 : 0.4;
      ctx.fillStyle = gr; ctx.fillRect(x - w / 2, y - h, w, h);
      const core = ctx.createLinearGradient(0, y, 0, y - h);
      core.addColorStop(0, '#ffffff'); core.addColorStop(1, '#ffffff00');
      ctx.globalAlpha = d.mine ? 0.9 : 0.4;
      ctx.fillStyle = core; ctx.fillRect(x - 1, y - h, 2, h);
      if (d.illum) { ctx.globalAlpha = 0.5; ctx.fillStyle = C.gilt; ctx.fillRect(x - w, y - h * 0.5, 1, h * 0.5); ctx.fillRect(x + w - 1, y - h * 0.5, 1, h * 0.5); }
    }
    ctx.restore();
  }

  function drawUnder(ctx, env, toHud, t, is3d, me, regions, L) {
    const list = live(me);
    if (!list.length) return;
    for (const d of list) { if (!is3d) { const [x, y] = toHud(d.wx, d.wy); column2d(ctx, x, y, d, t); } }
    const open = (d) => { S.card = { item: d.item, t0: now() }; };
    const hit = (r, d) => { if (regions) regions.push({ rect: { x: r.x, y: r.y, w: Math.max(r.w, (L && L.minHit) || 0), h: Math.max(r.h, (L && L.minHit) || 0) }, kind: 'button', label: `dloot:tag:${d.item}`, on: () => open(d) }); };
    if (L && L.touch && !S.card && (list.filter((d) => d.mine).length > 2 || list.some((d) => !d.mine))) {
      // a small phone: one chip for you, one name per friend
      const mine = list.filter((d) => d.mine).sort((a, b) => (RANK[b.rarity] || 0) - (RANK[a.rarity] || 0));
      const best = mine[0];
      if (best) { const [x, y] = toHud(best.wx, best.wy); hit(tag(ctx, x, y + 6, `${best.name}${mine.length > 1 ? `  +${mine.length - 1}` : ''}`, C[best.rarity], { illum: best.illum, sub: S.chipSub || null }), best); }
      const named = new Set(), used = [];
      const top = (L && L.touch ? 44 : 30), lh = g.lh || 11;
      for (const d of list.filter((q) => !q.mine).sort((a, b) => (RANK[b.rarity] || 0) - (RANK[a.rarity] || 0))) {
        if (named.has(d.who)) continue;
        named.add(d.who);
        const [x, y0] = toHud(d.wx, d.wy);
        // a friend's name (or what they found) at the top of their column, kept under the top bar and off the other names
        let y = Math.max(top, y0 - (DROP_LOOK.h2d[d.rarity] || 0) * 0.6 - 18);
        while (used.some((u) => Math.abs(u - y) < lh + 4)) y += lh + 5;
        used.push(y);
        tag(ctx, x, y, d.found || d.who, C[d.rarity], { faint: true });
      }
      return;
    }
    for (const d of list) {
      if (S.card && S.card.item !== d.item) continue;   // a card is open: only its drop keeps a tag
      const [x, y] = toHud(d.wx, d.wy);
      if (!d.mine) { tag(ctx, x, y - (DROP_LOOK.h2d[d.rarity] || 0) * 0.6 - 18, d.who, C[d.rarity], { faint: true }); continue; }
      hit(tag(ctx, x, y + 6 + (d.dy || 0), d.name, C[d.rarity] || 'white', { illum: d.illum }), d);
    }
  }

  function draw(ctx, env, m, L, regions) {
    const W = L.W || 640, H = L.H || 360, t = now();
    // a random piece's tag names it as the bag does (its rolled lines), once the bag has it
    for (const d of S.drops) if (d.generic && d.mine && m.bag) {
      let best = null;
      for (const it of m.bag.items || []) if (it && it.item === d.item && (!best || (it.uid || 0) > (best.uid || 0))) best = it;
      if (best) { d.name = (itemInfo(best) || {}).name || d.name; d.generic = false; }
    }
    if (S.beat && t - S.beat.t0 < DROP_LOOK.beat * 2) {
      const k = Math.max(0, 1 - (t - S.beat.t0) / (DROP_LOOK.beat * 2));
      ctx.save();
      const r = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(60,24,0,${0.55 * k})`);
      ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (S.banner && t - S.banner.t0 < 5 && !S.card && !(L.touch && S.banner.tallyOnly)) {
      // low on the screen, clear of the boss frame, the toasts and the party frames (a phone: just under the hero)
      const b = S.banner, lh = g.lh || 11, y = L.touch ? Math.round(H * 0.6) : H - 118;
      if (b.tallyOnly) {
        const w = g.textW(b.sub) + 16, x = Math.round(W / 2 - w / 2);
        g.window(ctx, x, y, w, lh + 5, 'thin', 'slate', 0.88);
        g.text(ctx, b.sub, W / 2, y + 3, 'cream', { align: 'center' });
      } else {
        const big = !L.touch;
        const tw = big ? g.textW(b.title, true) : g.textW(b.title);
        const w = Math.max(tw, g.textW(b.sub || ''), g.textW(b.kicker)) + 30, x = Math.round(W / 2 - w / 2), h = (big ? 22 : lh + 4) + 2 * lh + 6;
        g.window(ctx, x, y, w, h, 'thin', 'slate', 0.9);
        if (b.illum) { g.outline(ctx, x - 1, y - 1, x + w, y + h, C.gilt); g.outline(ctx, x + 1, y + 1, x + w - 2, y + h - 2, C.gilt); }
        g.text(ctx, b.kicker, W / 2, y + 3, b.illum ? C.gilt : C.legendary, { align: 'center', small: true });
        g.text(ctx, b.title, W / 2, y + 3 + lh, C[b.rarity] || C.legendary, { align: 'center', large: big });
        if (b.sub) g.text(ctx, b.sub, W / 2, y + h - lh - 3, 'cream', { align: 'center' });
      }
    }
    if (S.friend && t - S.friend.t0 < 5 && !L.touch) {
      const f = S.friend, lh = g.lh || 11, w = g.textW(f.text) + 16, x = Math.round(W / 2 - w / 2), y = H - 140;
      g.window(ctx, x, y, w, lh + 5, 'thin', 'slate', 0.85);
      g.text(ctx, f.text, W / 2, y + 3, f.color || 'cream', { align: 'center' });
    }
    if (S.card) drawCard(ctx, m, L, regions, W, H);
  }

  function drawCard(ctx, m, L, regions, W, H) {
    const items = (m.bag && m.bag.items) || [];
    let idx = -1;
    for (let i = 0; i < items.length; i++) if (items[i] && items[i].item === S.card.item && (idx < 0 || (items[i].uid || 0) > (items[idx].uid || 0))) idx = i;
    if (idx < 0) { S.card = null; return; }
    const it = items[idx], info = itemInfo(it) || {};
    const tip = itemTooltip(it, null, info.slot ? (m.equip[info.slot] || null) : undefined);
    if (!tip) { S.card = null; return; }
    // under the hero frame on the left: clear of the minimap, the REC mark and the action bar
    const pf = L.player || { x: 4, y: 4, w: 150, h: 34 };
    const w = L.touch ? 236 : 250, lh = g.lh || 11;
    const bh = Math.max(g.ls ? g.ls(18) : 18, L.minHit || 0), gap = 4;
    const box = drawTooltip(g, ctx, tip, pf.x, pf.y + pf.h + 6, { w, W, H: H - bh - gap - 4 });
    if (info.illum) { g.outline(ctx, box.x - 1, box.y - 1, box.x + box.w, box.y + box.h, C.gilt); g.outline(ctx, box.x + 2, box.y + 2, box.x + box.w - 3, box.y + box.h - 3, C.gilt); }
    regions.push({ rect: { x: box.x, y: box.y, w: box.w, h: box.h + bh + gap }, kind: 'window', id: 'dloot_card' });
    const btns = [[W_.wear, 'forest', () => { S.card = null; act.useItem(idx); }], [W_.keep, 'slate', () => { S.card = null; }]];
    const bw = Math.floor((box.w - gap) / 2);
    btns.forEach(([text, tone, on], k) => {
      const bx = box.x + k * (bw + gap), by = box.y + box.h + gap;
      g.window(ctx, bx, by, bw, bh, 'thin', tone, 0.97);
      g.text(ctx, text, bx + bw / 2, by + Math.floor(bh / 2) - Math.floor(lh / 2), 'cream', { align: 'center' });
      regions.push({ rect: { x: bx, y: by, w: bw, h: bh }, kind: 'button', label: `dloot:${text.toLowerCase()}`, on });
    });
    S.cardBox = { ...box, bh };
  }
  return { S, onEvent, drawUnder, draw, get now() { return now(); }, close() { const was = !!S.card; S.card = null; return was; } };
}

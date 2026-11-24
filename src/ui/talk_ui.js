// Quest scenes (wave 6, PLAN item 9, approved by Scott 2026-11-24: "Go with all your recommendations"; brief and stills
// D:\LQOnline\wave6\questpres\BRIEF.md). Talking to someone with a quest is a scene: the camera goes over your shoulder
// onto them (view.talk, src/render3d/talk_cam.js), their words arrive at a talking pace with a quiet voice murmur under
// them (src/audio/talk_voice.js), and accepting and handing in each get a short moment. (The boss intro card is the
// bosscard lane: src/ui/boss_card.js, src/render3d/boss_cam.js.)
//
//   const tk = createTalkUI({ g, zones, zoneNames, hooks, options })
//   tk.frame(st, snap, playerId, act, L)     each draw: starts and ends the talk (a move, a hit, walking off end it)
//   tk.view(st, snap, playerId, touch)       -> view.talk for the 3D renderer, or null (main.js, before the draw)
//   tk.panel(st)                             -> true when the npc window's quest page is drawn as the talk panel
//   tk.drawPanel(ctx, env, m, st, regions, act)
//   tk.drawUnder(ctx, L, t)                  the thin letterbox bars, under the HUD
//   tk.drawOver(ctx, env, L, st, regions)    the accept and turn-in flourishes, over every window
//   tk.key(ev, st, binds, act) -> true when it used the key (Space or Enter shows the whole text)
//   tk.onEvent(ev, me, st) -> true when it replaced the default handling (the turn-in banner)
//   tk.hiddenMark(st)                        the npc whose quest mark hides while you talk to them
//
// On by default, desktop and phone, with the 3D renderer; Settings "Quest scenes: Off" is today's npc window and camera,
// unchanged. The 2D renderer keeps today's window. The trainer, vendor and flight pages
// stay today's window. Every word on the panel is Scott's own, from src/data: quest text, quest and npc names, item
// names. The only fixed words are labels the game already uses (Accept, Complete, Goodbye,
// Back, Rewards, Objectives) and "Quest accepted", "Quest complete", "Choose one" and the key hints.
// Never traps you: the panel takes no input it does not need, any move key, Esc, being hit or walking off ends it at
// once (the key still moves you).
import { questInfo, npcInfo, itemInfo, RARITY_COLOR } from './gamedata.js';
import { frame as windowFrame, itemTooltip } from './menus.js';
import { drawTooltip } from './hud.js';
import { dialogRectFor } from './dialog.js';
import { pace } from './talk_pace.js';
import { pickShoulder } from '../render3d/talk_cam.js';
import { effectiveBinds, actionFor } from './keymap.js';

export const ACCEPT_SECS = 1.4;
export const TURNIN_SECS = 3.6;
const LETTERBOX_SECS = 0.4;
const MOVE_END_PX = 4;          // the hero moved this far since the talk began: it ends
const GRACE_SECS = 0.35;        // the first moment of a talk: the hero may still be settling from the walk up
const MOVE_ACTIONS = new Set(['move_up', 'move_down', 'move_left', 'move_right']);
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const smooth = (k) => { const t = Math.max(0, Math.min(1, k)); return t * t * (3 - 2 * t); };

/** A blocked map cell for the clear-shoulder test (walls, buildings, water; ledges count as open). */
export function solidFn(zone) {
  if (!zone || !zone.collision) return null;
  return (tx, ty) => { const row = zone.collision[ty]; const c = row ? row[tx] : '#'; return c == null || !(c === '.' || c === 'v' || c === '>' || c === '<'); };
}

/** The lines of `all` shown after `n` letters of the page have arrived (lines never re-flow while letters come in). */
export function shownLines(lines, n) {
  const out = [];
  let left = n;
  for (const ln of lines) {
    if (left <= 0) break;
    out.push(ln.slice(0, left));
    left -= ln.length + 1;
  }
  return out;
}

export function createTalkUI({ g, zones = {}, zoneNames = {}, hooks = {}, options = () => ({}) } = {}) {
  let talk = null;              // { ent, npc, x0, y0, hp, t0, flip, key, tp, full }
  let lb = 0, lbAt = null;      // the letterbox, 0..1
  const fl = [];                // flourishes: { kind: 'accept' | 'turnin', t0, ... }
  let lastSnap = null, lastMe = null, now = 0;

  const enabled = () => options().questScenes !== false;
  const scene3d = () => !!(hooks.scenes && hooks.scenes());
  const voice = (m) => { try { if (hooks.talkVoice) hooks.talkVoice(m); } catch { /* never break the game for a sound */ } };
  const active = (st) => !!(enabled() && scene3d() && st.mode === 'game' && st.dialog && (st.dialog.page === 'main' || st.dialog.page === 'quest'));
  const ent = (id) => (lastSnap ? lastSnap.entities.find((e) => e.id === id) || null : null);

  function end() { if (talk) voice({ stop: true }); talk = null; }

  function frame(st, snap, playerId, act) {
    lastSnap = snap; lastMe = playerId; now = st.now;
    const meE = snap && playerId != null ? snap.entities.find((e) => e.id === playerId) : null;
    if (!active(st) || !meE) { end(); return; }
    if (!talk || talk.ent !== st.dialog.ent) {
      end();
      const n = snap.entities.find((e) => e.id === st.dialog.ent);
      if (!n) return;
      talk = { ent: st.dialog.ent, npc: st.dialog.npc, x0: meE.x, y0: meE.y, hp: meE.hp, t0: st.now, flip: pickShoulder(meE, n, solidFn(zones[meE.zone]), { lite: !!st.metrics.touch }), key: null, tp: st.now, full: false };
    }
    if (st.dialog.page !== 'quest' && talk.key) { talk.key = null; voice({ stop: true }); }   // back to the greeting
    if (st.now - talk.t0 < GRACE_SECS) { talk.x0 = meE.x; talk.y0 = meE.y; talk.hp = meE.hp; return; }
    // a move (keys, the stick, a click on the ground) or a hit ends the talk at once; the move itself goes on
    if (Math.hypot(meE.x - talk.x0, meE.y - talk.y0) > MOVE_END_PX || (meE.hp != null && talk.hp != null && meE.hp < talk.hp)) { end(); act.closeDialog(); return; }
    talk.hp = meE.hp;
  }

  function view(st, snap, playerId, touch = false) {
    const me = snap && playerId != null ? snap.entities.find((e) => e.id === playerId) : null;
    if (!me) return null;
    if (talk && active(st) && st.dialog.ent === talk.ent) {
      const n = snap.entities.find((e) => e.id === talk.ent);
      if (n && n.zone === me.zone) return { kind: 'talk', hero: { x: me.x, y: me.y }, speaker: { x: n.x, y: n.y }, flip: talk.flip, aside: touch ? 0.5 : 0, hideLabels: true };
    }
    return null;
  }

  const panel = (st) => active(st) && st.dialog.page === 'quest' && !!questInfo(st.dialog.quest);

  /** Space or Enter shows the whole text while it is still coming in; a move key ends the talk (and still moves). */
  function key(ev, st, binds, act) {
    if (!talk || !active(st)) return false;
    const a = actionFor(ev.code, effectiveBinds(binds || {}));
    if (MOVE_ACTIONS.has(a) || ARROWS.has(ev.code)) { end(); act.closeDialog(); return false; }
    if ((ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'NumpadEnter') && panel(st) && !talk.full) { reveal(); return true; }
    return false;
  }
  function reveal() { if (talk && !talk.full) { talk.full = true; voice({ stop: true }); } }

  // ---------------------------------------------------------------- the talk panel (the npc window's quest page)
  /** Every line height, row step and centring the panel uses, in one place. Today's Normal text: 11 px lines. With the
   *  uiskin lane's Large text the lead wraps drawPanel in g.textScope, where g.lh / g.mid(h) give the larger font's values;
   *  until then they fall back to today's numbers. */
  function metrics(L) {
    const lh = g.lh || 11;                                       // one line of the normal font
    const mid = (h) => (g.mid ? g.mid(h) : Math.floor(h / 2) - 6);   // a line's top so it sits in the middle of a row h tall
    return {
      lh, mid,
      lhBig: lh + 4,                                             // one line of the large font (the npc's name)
      pad: 8, gap: 4,                                            // the frame's inner margin, a small gap between blocks
      bh: Math.max(lh + 5, L.minHit || 0),                       // a button row
      head: Math.max(46, 32 + 14),                               // portrait (32) and its margins: name, title, quest line
      nameY: 6, titleY: 10, questY: 6 + lh + 7,                  // header rows from the panel's top
      btnW: (label, min) => Math.max(min, g.textW(label) + 16),  // a button fits its label in any text size
    };
  }
  function drawPanel(ctx, env, m, st, regions, act) {
    const L = env.L, d = st.dialog;
    const q = questInfo(d.quest);
    if (!q || !talk) return;
    const ready = d.turnins.includes(q.id), offer = d.offers.includes(q.id);
    const text = (ready ? q.text.complete : offer ? q.text.offer : q.text.progress) || '';
    const desk = !L.touch;
    const M = metrics(L), bh = M.bh, lineH = M.lh;
    const W0 = desk ? Math.min(440, L.W - 40) : dialogRectFor(L).w;
    const tw = W0 - 20;
    const all = g.wrap(text, tw);
    const objs = offer ? (q.objectives || []).slice(0, 3).map((o) => `${o.count > 1 ? `${o.count} ` : ''}${o.label}`) : [];
    const objH = objs.length ? lineH + objs.length * lineH + 2 : 0;
    const rw0 = q.rewards || {};
    const simRw = d.rewards && d.rewards[q.id];
    const rw = simRw && simRw.xp != null ? { ...rw0, xp: simRw.xp } : rw0;   // the XP this hero really gets (the sim's view)
    const items = [...(rw.items || []).map((i) => ({ i, fixed: true })), ...(rw.choice || []).map((i, k) => ({ i, k }))].slice(0, 8);
    const sz = desk ? 20 : Math.max(18, Math.min(24, L.minHit || 0));
    const rewH = lineH + 1 + (items.length ? sz + 2 : 0);
    let r, maxLines;
    if (desk) {
      maxLines = Math.min(5, Math.max(1, all.length));
      const h = M.head + maxLines * lineH + M.gap + objH + rewH + M.pad + bh + M.pad;
      const barTop = L.bar && L.bar.length ? L.bar[0].y : L.H - 46;
      r = { x: Math.floor((L.W - W0) / 2), y: Math.max(4, barTop - 8 - h), w: W0, h };
    } else {
      r = dialogRectFor(L);
      maxLines = Math.max(2, Math.floor((r.h - M.head - M.gap - objH - rewH - M.pad - bh - M.pad) / lineH));
    }
    windowFrame(ctx, env, r, '', regions, act, 'dialog');
    // header: the npc's portrait, name and title, the voice bars, the quest's name and its story part
    const x0 = r.x + 10;
    const npc = npcInfo(d.npc) || { name: d.npc };
    const hasP = !!(g.portrait(ctx, d.npc, x0, r.y + 8, 32) || (npc.lq && g.portrait(ctx, npc.lq, x0, r.y + 8, 32)));
    const tx = hasP ? x0 + 40 : x0;
    g.text(ctx, g.clip(npc.name, r.w - (tx - r.x) - 30, true), tx, r.y + M.nameY, 'gold', { large: true });
    const nw = g.textW(npc.name, true);
    let hx = tx + nw + 6;
    if (npc.title && hx + g.textW(npc.title) < r.x + r.w - 28) { g.text(ctx, npc.title, hx, r.y + M.titleY, 'gray'); hx += g.textW(npc.title) + 6; }
    // pages: the whole text wrapped once; a long one waits behind "more" (a click on the text, or the wheel)
    const pages = Math.max(1, Math.ceil(all.length / maxLines));
    d.textPage = Math.max(0, Math.min(pages - 1, d.textPage || 0));
    const lines = all.slice(d.textPage * maxLines, d.textPage * maxLines + maxLines);
    const pageText = lines.join(' ');
    const key = `${q.id}:${ready ? 'c' : offer ? 'o' : 'p'}:${d.textPage}`;
    if (talk.key !== key) { talk.key = key; talk.tp = st.now; talk.full = false; voice({ say: { npc: d.npc, text: pageText } }); }
    const P = pace(pageText);
    const shown = talk.full ? pageText.length : P.at(st.now - talk.tp);
    if (shown >= pageText.length) talk.full = true;
    const speaking = !talk.full && st.now - talk.tp < P.total;
    if (speaking && hx < r.x + r.w - 40) {
      for (let i = 0; i < 3; i++) {
        const hh = 2 + Math.round(3 * Math.abs(Math.sin(st.now * 9 + i * 1.7)));
        g.rect(ctx, hx + i * 3, r.y + M.titleY + lineH - 4 - hh, 2, hh, '#f9d77a');
      }
    }
    const story = q.story ? `${q.story.name}, part ${q.story.step} of ${q.story.of}` : '';
    g.text(ctx, g.clip(q.name, r.w - (tx - r.x) - 12), tx, r.y + M.questY, 'cream');
    if (story) { const qw = g.textW(q.name) + 8; if (tx + qw + 40 < r.x + r.w - 10) g.text(ctx, g.clip(story, r.x + r.w - 10 - (tx + qw)), tx + qw, r.y + M.questY, 'gray'); }
    // the text, letter by letter, with a small gold caret while it comes in
    let y = r.y + M.head;
    const ty0 = y;
    const out = shownLines(lines, shown);
    out.forEach((ln) => { g.text(ctx, ln, x0, y, 'cream'); y += lineH; });
    if (!talk.full && out.length) g.rect(ctx, x0 + g.textW(out[out.length - 1]) + 2, ty0 + (out.length - 1) * lineH + 2, 4, lineH - 4, '#f9d77a');
    y = ty0 + maxLines * lineH;
    if (pages > 1 && talk.full) g.text(ctx, d.textPage < pages - 1 ? `more (${d.textPage + 1}/${pages})` : `back to start (${pages}/${pages})`, r.x + r.w - 10, y - lineH, 'gold', { align: 'right' });
    const trect = { x: x0, y: ty0, w: r.w - 20, h: maxLines * lineH };
    regions.push({ rect: trect, kind: 'button', label: 'talk:text', on: () => { if (!talk.full) reveal(); else if (pages > 1) d.textPage = (d.textPage + 1) % pages; } });
    if (pages > 1) regions.push({ rect: trect, kind: 'scroll', scroll: (k) => { reveal(); d.textPage = Math.max(0, Math.min(pages - 1, d.textPage + k)); } });
    y += M.gap;
    if (objs.length) {
      g.text(ctx, 'Objectives', x0, y, 'gold'); y += lineH;
      for (const o of objs) { g.text(ctx, g.clip(o, r.w - 28), x0 + 8, y, 'white'); y += lineH; }
      y += 2;
    }
    // rewards: what the sim says this hero can use; a choice is picked here (the phone shows the picked item's card)
    g.text(ctx, 'Rewards', x0, y, 'gold');
    g.text(ctx, [rw.xp ? `${rw.xp} XP` : null, rw.gold ? `${rw.gold} gold` : null].filter(Boolean).join('   ') || 'None', x0 + 50, y, 'white');
    if ((rw.choice || []).length > 1) g.text(ctx, 'Choose one', r.x + r.w - 10, y, 'gray', { align: 'right' });
    const choiceOf = (k) => (simRw && simRw.choice && simRw.choice[k]) || null;
    if (!d.choicePicked && (rw.choice || []).length > 1) {
      const firstOk = (rw.choice || []).findIndex((_, k) => { const c = choiceOf(k); return !c || c.usable !== false; });
      if (firstOk >= 0) d.choice = firstOk;
    }
    if (L.touch && (d.peek == null || d.peekQuest !== q.id)) { d.peekQuest = q.id; d.peek = -1; }
    let ix = x0;
    const iy = y + lineH + 1;
    const tips = [];
    items.forEach((it, idx) => {
      const sr = { x: ix, y: iy, w: sz, h: sz };
      const sc = it.fixed ? null : choiceOf(it.k);
      const info = itemInfo(sc && sc.inst ? { ...itemInfo(it.i), ...sc.inst } : it.i);
      const unusable = !!(sc && sc.usable === false);
      const why = unusable ? (sc.reqLevel && sc.reqLevel > m.player.level ? `Needs level ${sc.reqLevel}.` : 'Your class cannot use this.') : null;
      g.window(ctx, sr.x, sr.y, sr.w, sr.h, 'thin', 'blue', 0.95);
      if (info) g.iconIn(ctx, info.icon || 'icon_bag', sr.x, sr.y, sr.w, sr.h, unusable ? 0.4 : 1);
      if (unusable) g.rect(ctx, sr.x + 2, sr.y + 2, sr.w - 4, sr.h - 4, 'rgba(160,40,40,0.35)');
      const picked = !it.fixed && d.choice === it.k;
      if (picked && ready) g.outline(ctx, sr.x - 1, sr.y - 1, sr.x + sr.w, sr.y + sr.h, '#fff7d6');
      else if (info && info.rarity && info.rarity !== 'common') g.outline(ctx, sr.x + 1, sr.y + 1, sr.x + sr.w - 2, sr.y + sr.h - 2, RARITY_COLOR[info.rarity] || '#e8e8e8');
      const tip = info ? itemTooltip(info, it.fixed ? null : 'Choose one', info.slot ? (m.equip[info.slot] || null) : undefined) : null;
      if (tip && why) { tip.foot = why; tip.footColor = 'red'; }
      tips[idx] = tip;
      if (L.touch && d.peek === idx) g.outline(ctx, sr.x - 2, sr.y - 2, sr.x + sr.w + 1, sr.y + sr.h + 1, '#ffd34d');
      regions.push({ rect: sr, kind: 'reward', tip: L.touch ? null : tip, on: () => {
        if (!it.fixed) { d.choice = it.k; d.choicePicked = true; }
        if (L.touch) d.peek = d.peek === idx ? -1 : idx;
      } });
      ix += sz + 3;
    });
    if (L.touch && items.length && !(d.peek >= 0 && tips[d.peek])) g.text(ctx, 'Tap an item to see it', ix + 6, iy + M.mid(sz) + 2, 'gray');
    // buttons: Accept or Complete as today (they work at once, even while the words still come in), Back, Goodbye
    const by = r.y + r.h - bh - M.pad;
    const button = (x, w, label, color, scheme, on, glow = 0) => {
      if (glow > 0) g.rect(ctx, x - 2, by - 2, w + 4, bh + 4, `rgba(249,215,122,${(0.3 * glow).toFixed(2)})`);
      g.window(ctx, x, by, w, bh, 'thin', scheme, 0.95);
      g.text(ctx, label, x + w / 2, by + M.mid(bh), color, { align: 'center' });
      regions.push({ rect: { x, y: by, w, h: bh }, kind: 'button', on, label });
      return x + w + 6;
    };
    let bx = x0;
    const glow = talk.full ? 0.6 + 0.4 * Math.sin(st.now * 4) : 0;
    if (offer) bx = button(bx, M.btnW('Accept', 80), 'Accept', 'green', 'forest', () => { act.send({ t: 'quest_accept', quest: q.id, npc: d.ent }); act.refreshDialog(); }, glow);
    if (ready) {
      const bag = m.bag || { size: 12, items: [] };
      const gifts = (rw.items || []).length + ((rw.choice || []).length ? 1 : 0);
      const freeSlots = (bag.size || 0) - (bag.items || []).filter(Boolean).length;
      bx = button(bx, M.btnW((rw.choice || []).length > 1 ? 'Complete (pick one)' : 'Complete', 84), (rw.choice || []).length > 1 ? 'Complete (pick one)' : 'Complete', 'gold', 'ember',
        () => { act.send({ t: 'quest_turnin', quest: q.id, npc: d.ent, choice: (rw.choice || []).length > 1 ? d.choice : 0 }); act.refreshDialog(); }, glow);
      if (gifts > 0 && freeSlots < gifts) g.text(ctx, g.clip(`Bags full: free ${gifts - Math.max(0, freeSlots)} slot${gifts - Math.max(0, freeSlots) > 1 ? 's' : ''} first`, r.x + r.w - 10 - bx), bx, by - lineH - 1, 'red');
    }
    const more = d.turnins.length + d.offers.length + d.progress.length + (d.trainer ? 1 : 0) + (d.vendor ? 1 : 0) + (d.inn ? 1 : 0) + (d.flight ? 1 : 0) > 1;
    if (more) bx = button(bx, M.btnW('Back', 56), 'Back', 'cream', 'slate', () => { d.page = 'main'; d.quest = null; d.scroll = 0; });
    bx = button(bx, M.btnW('Goodbye.', 70), 'Goodbye.', 'cream', 'slate', () => act.closeDialog());
    const hint = desk ? (talk.full ? 'Esc or a move key: leave' : 'Space: show it all') : (talk.full ? '' : 'Tap the words: show it all');
    if (hint && bx + g.textW(hint) < r.x + r.w - 8) g.text(ctx, hint, r.x + r.w - 10, by + M.mid(bh), 'gray', { align: 'right' });
    // the phone's picked reward card, over the text (as today's window does)
    if (L.touch && d.peek >= 0 && tips[d.peek]) drawTooltip(g, ctx, tips[d.peek], x0, iy - 2, { w: Math.min(214, r.w - 20), W: r.x + r.w - 8, H: iy - 2 });
  }

  // ---------------------------------------------------------------- the letterbox (under the HUD)
  function drawUnder(ctx, L, t) {
    const dt = lbAt == null ? 0 : Math.max(0, Math.min(0.1, t - lbAt));
    lbAt = t;
    const want = talk ? 1 : 0;
    lb = want ? Math.min(1, lb + dt / LETTERBOX_SECS) : Math.max(0, lb - dt / LETTERBOX_SECS);
    const h = Math.round(L.H * (L.touch ? 0.045 : 0.06) * smooth(lb));
    if (h <= 0) return;
    ctx.fillStyle = 'rgba(8,6,14,0.82)';
    ctx.fillRect(0, 0, L.W, h);
    ctx.fillRect(0, L.H - h, L.W, h);
  }

  // ---------------------------------------------------------------- flourishes (over everything)
  function drawOver(ctx, env, L, st, regions) {
    for (let i = fl.length - 1; i >= 0; i--) if (st.now - fl[i].t0 > (fl[i].kind === 'accept' ? ACCEPT_SECS : TURNIN_SECS)) fl.splice(i, 1);
    for (const f of fl) (f.kind === 'accept' ? drawAccept : drawTurnIn)(ctx, L, st, f);
    void env; void regions;
  }

  function drawAccept(ctx, L, st, f) {
    const k = (st.now - f.t0) / ACCEPT_SECS;
    const w = Math.min(260, L.W - 40);
    const fly = Math.max(0, (k - 0.55) / 0.45);
    const cx0 = L.W / 2, cy0 = L.touch ? L.H * 0.3 : L.H * 0.36;
    // the tracker row of this quest when it is there (the last frame's regions), else the tracker's top
    const row = (st.regions || []).find((o) => o.kind === 'tracker_quest' && o.id === f.quest);
    const tr = L.tracker || { x: L.W - 150, y: 90, w: 140 };
    const to = row ? { x: row.rect.x + row.rect.w / 2, y: row.rect.y + row.rect.h / 2 } : { x: tr.x + (tr.w || 140) / 2, y: tr.y + 8 };
    const e = fly * fly;
    const cx = cx0 + (to.x - cx0) * e, cy = cy0 + (to.y - cy0) * e;
    const sc = k < 0.12 ? 1.4 - (k / 0.12) * 0.4 : 1 - fly * 0.6;
    const ww = Math.round(w * sc), hh = Math.round(38 * sc);
    if (fly > 0) {
      for (let i = 1; i <= 5; i++) {
        const f2 = Math.max(0, fly - i * 0.06), e2 = f2 * f2;
        ctx.fillStyle = `rgba(249,215,122,${(0.18 - i * 0.03).toFixed(2)})`;
        ctx.fillRect(Math.round(cx0 + (to.x - cx0) * e2 - 3), Math.round(cy0 + (to.y - cy0) * e2 - 3), 6, 6);
      }
    }
    g.window(ctx, Math.round(cx - ww / 2), Math.round(cy - hh / 2), ww, hh, 'std', 'forest', 0.96);
    if (sc > 0.7) {
      g.text(ctx, 'Quest accepted', Math.round(cx), Math.round(cy - hh / 2 + 6), 'gray', { align: 'center' });
      g.text(ctx, g.clip(f.name, ww - 16, true), Math.round(cx), Math.round(cy - hh / 2 + 17), 'gold', { align: 'center', large: true });
    }
  }

  function drawTurnIn(ctx, L, st, f) {
    const k = Math.min(1, (st.now - f.t0) / (TURNIN_SECS * 0.6));
    const a = Math.min(1, (TURNIN_SECS - (st.now - f.t0)) / 0.4);
    const sz = 22, gap = 6;
    const items = f.items || [];
    const nameW = g.textW(f.name, true);
    const w = Math.min(L.W - 8, Math.max(220, nameW + 30, 130 + items.length * (sz + gap)));
    const h = 66;
    // on a phone the npc window is on the left: the card goes in the free space right of it
    let cx = L.W / 2;
    if (L.touch && st.dialog) { const dr = dialogRectFor(L); cx = Math.floor((dr.x + dr.w + L.W) / 2); }
    const x = Math.round(Math.max(4, Math.min(L.W - w - 4, cx - w / 2)));
    const y = Math.round(L.touch ? L.H * 0.26 : Math.max(40, L.H * 0.2));
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    g.window(ctx, x, y, w, h, 'std', 'blue', 0.95);
    const rw = Math.min(w - 40, 150), rx = Math.round(x + (w - rw) / 2);
    g.window(ctx, rx, y - 10, rw, 18, 'thin', 'ember', 0.97);
    g.text(ctx, 'Quest complete', rx + rw / 2, y - 7, 'gold', { align: 'center' });
    g.text(ctx, g.clip(f.name, w - 16, true), x + w / 2, y + 11, 'gold', { align: 'center', large: true });
    const kx = Math.min(1, k / 0.45);
    let lx = x + 10;
    const ly = y + 34;
    if (f.xp) { g.text(ctx, `+${Math.round(f.xp * kx)} XP`, lx, ly + 6, 'green'); lx += 58; }
    if (f.gold) { g.icon(ctx, 'icon_gold', lx, ly + 4); g.text(ctx, `${Math.round(f.gold * kx)} gold`, lx + 16, ly + 6, 'gold'); lx += 66; }
    items.forEach((it, i) => {
      const ki = Math.max(0, Math.min(1, (k - 0.45 - i * 0.18) / 0.25));
      const ix = lx + i * (sz + gap);
      if (it.picked && ki >= 1) rays(ctx, ix + sz / 2, ly + sz / 2, 24, st.now, it.color);
      const iw = Math.max(2, Math.round(sz * Math.abs(Math.cos((1 - ki) * Math.PI))));   // turns over like a card
      const show = ki >= 0.5;
      g.window(ctx, ix + Math.floor((sz - iw) / 2), ly, iw, sz, 'thin', show ? 'blue' : 'ember', 0.97);
      if (show && iw > 8) {
        g.iconIn(ctx, it.icon || 'icon_bag', ix + Math.floor((sz - iw) / 2), ly, iw, sz, 1);
        g.outline(ctx, ix + 1, ly + 1, ix + sz - 2, ly + sz - 2, it.color || '#e8e8e8');
      }
    });
    ctx.restore();
  }

  function rays(ctx, cx, cy, R, t, color = '#f9d77a') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.6);
    ctx.globalAlpha *= 0.45;
    ctx.fillStyle = color;
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, -4); ctx.lineTo(R, 4); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- sim events
  function onEvent(ev, me, st) {
    if (ev.type !== 'quest' || ev.id !== me || !enabled() || !scene3d()) return false;
    const q = questInfo(ev.quest);
    if (ev.kind === 'accept') {
      fl.push({ kind: 'accept', t0: st.now, quest: ev.quest, name: q ? q.name : ev.quest });
      voice({ flourish: 'accept' });
      return false;
    }
    if (ev.kind === 'turnin') {
      const choice = new Set((q && q.rewards && q.rewards.choice) || []);
      const items = (ev.items || []).slice(0, 6).map((it) => {
        const info = itemInfo(it.item) || {};
        return { id: it.item, icon: info.icon, color: RARITY_COLOR[info.rarity] || '#e8e8e8', picked: choice.size > 1 && choice.has(it.item) };
      });
      fl.push({ kind: 'turnin', t0: st.now, quest: ev.quest, name: q ? q.name : ev.quest, xp: ev.xp || 0, gold: ev.gold || 0, items });
      voice({ flourish: 'turnin', items: items.length });
      return true;     // in place of today's "Quest complete" banner
    }
    return false;
  }
  return {
    frame, view, panel, drawPanel, drawUnder, drawOver, key, onEvent, end,
    /** the npc whose quest mark hides while you talk to them */
    hiddenMark: (st) => (talk && active(st) ? talk.ent : null),
    get talking() { return !!talk; },
    debug: () => ({ talk: talk ? { ent: talk.ent, flip: talk.flip, full: talk.full, key: talk.key, t0: talk.t0, tp: talk.tp } : null,
      flourishes: fl.map((f) => ({ kind: f.kind, t0: f.t0 })), letterbox: +lb.toFixed(2) }),
  };
}

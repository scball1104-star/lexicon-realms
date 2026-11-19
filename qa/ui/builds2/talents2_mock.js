// Builds 2 talents window: a MOCK render for the visual brief (qa/out/builds2/BRIEF.md). Not game code: nothing in src/
// imports this, and the live game keeps today's talents window. It draws with the game's own UI art and drawing code
// (src/ui/gfx.js windows, fonts and icon atlases; src/ui/hud.js drawTooltip; src/ui/charsprite.js portraits) and the real
// Builds 2 data (src/data/builds2.js), so the stills show the real names and numbers at the real pixel sizes.
//
// Loaded into the running game by qa/ui/builds2_stills.py:
//   const m = await import('/qa/ui/builds2/talents2_mock.js'); await m.install(scenario)
// install() wraps window.__realms.ui.draw so the mock window is drawn over the live HUD every frame.
import { createGfx } from '../../../src/ui/gfx.js';
import { loadUiArt } from '../../../src/ui/uiassets.js';
import { BitmapFont } from '../../../src/core/font.js';
import { createCharArt } from '../../../src/ui/charsprite.js';
import { drawTooltip } from '../../../src/ui/hud.js';
import { hitPx } from '../../../src/ui/layout.js';
import { BUILDS2, SKILL_PICKS, RULES, B2_ABILITIES } from '../../../src/data/builds2.js';
import { ABILITIES } from '../../../src/data/abilities.js';
import { CLASSES } from '../../../src/data/classes.js';

const SKILLS = { ...ABILITIES, ...B2_ABILITIES };
const LATER = { mender_purify: { name: 'Purify', icon: 'icon_regen' }, mender_sunlance: { name: 'Sunlance', icon: 'icon_light' } };
const skillName = (id) => (SKILLS[id] || LATER[id] || { name: id }).name;
const skillIcon = (id) => (B2_ABILITIES[id] ? B2_ABILITIES[id].icon : LATER[id] ? LATER[id].icon : id);

// ------------------------------------------------------------------------------------------------ the rules, mirrored
// (src/sim/builds2.js is the authority; this copy only colours the mock)
function rules(cls, build, level) {
  const cd = BUILDS2[cls];
  const nodes = cd.nodes;
  const byTrack = {};
  let spent = 0, keys = 0;
  for (const [id, r] of Object.entries(build.ranks)) { const n = nodes[id]; byTrack[n.track] = (byTrack[n.track] || 0) + r; spent += r; if (n.keystone) keys++; }
  const slots = level < RULES.keystoneLevel ? 0 : RULES.keystoneSlots.reduce((k, [from, n]) => (level >= from ? n : k), 0);
  const pts = { total: level, spent, free: level - spent, byTrack, keys, slots };
  const why = (id) => {
    const n = nodes[id], r = build.ranks[id] || 0;
    if (r >= n.maxRanks) return 'maxed';
    if (n.fork && Object.keys(build.ranks).some((o) => o !== id && nodes[o].track === n.track && nodes[o].tier === n.tier)) return 'fork';
    if ((byTrack[n.track] || 0) < (n.tier - 1) * RULES.tierStep) return 'tier';
    if (n.keystone && level < RULES.keystoneLevel) return 'level';
    if (n.keystone && keys >= slots) return 'keystones';
    if (pts.free <= 0) return 'points';
    return '';
  };
  const lb = cd.builds.find((b) => b.id === build.leaning) || cd.builds[0];
  let star = null;
  const want = {};
  for (const id of lb.path) { want[id] = (want[id] || 0) + 1; if ((build.ranks[id] || 0) >= want[id]) continue; star = why(id) ? null : id; break; }
  return { pts, why, star, lb };
}
const WHY = {
  tier: (n, t) => `Needs ${(n.tier - 1) * RULES.tierStep} points in ${t.name}`, level: () => `Keystone: needs level ${RULES.keystoneLevel}`,
  keystones: () => 'Keystone slots full (1 at 10, 2 at 25, 3 at 40)', fork: (n, t) => `You took the other side of this fork (${t.chip})`,
  points: () => 'No points left', maxed: () => 'Fully learned',
};
const rankText = (text, r) => text.replace(/\{r\*([\d.]+)\}/g, (_, k) => String(Math.round(r * Number(k) * 100) / 100));

// ------------------------------------------------------------------------------------------------ layout
/**
 * Geometry for a window `R` with six track columns, 5 tier rows (tier 3 two nodes, the fork), a skill-picks strip and a
 * footer. `hit` is the touch target (the node art stays 24 px). Rows: tiers 1-2, the fork + its chip, tiers 4-5.
 */
function layout(R, tracks, { hit = 15, touch = false }) {
  const sz = 24, pad = 8;
  const headH = touch ? Math.max(48, hit + 4) : 44;
  const colTop = R.y + headH + 4;
  // phone: the skill picks stand in a column on the right (the layer is wide, not tall); desktop: a strip under the tracks
  const picksW = touch ? Math.max(140, 2 * hit + 30) : 0;
  const colW = Math.floor((R.w - 2 * pad - (picksW ? picksW + 4 : 0)) / tracks.length);
  const step = Math.max(touch ? hit : 37, sz + 10);
  const chipGap = 12;                                         // the fork's chip line under its rank text
  const rowsTop = colTop + 30;
  const rowY = [0, step, 2 * step, 3 * step + chipGap, 4 * step + chipGap].map((d) => rowsTop + d);
  const colH = rowY[4] + sz + 14 - colTop;
  const cols = tracks.map((t, i) => {
    const x = R.x + pad + i * colW, mid = x + Math.floor(colW / 2);
    return { track: t, x: x + 2, y: colTop, w: colW - 4, h: colH, mid };
  });
  const footH = touch ? 0 : 16;
  const picks = touch ? { x: R.x + R.w - pad - picksW, y: colTop, w: picksW, h: colH, vertical: true }
    : { x: R.x + pad + 2, y: colTop + colH + 4, w: R.w - 2 * pad - 4, h: 46, vertical: false };
  return { sz, hit, cols, rowY, picks, footY: R.y + R.h - 15, footH, headH };
}

// ------------------------------------------------------------------------------------------------ draw
export function drawTalents2(ctx, env, sc) {
  const { g, charArt, L } = env;
  const cls = 'mender', cd = BUILDS2[cls];
  const { pts, why, star } = rules(cls, sc.build, sc.level);
  const touch = !!L.touch;
  const R = sc.rect;
  const lay = layout(R, cd.tracks, { hit: touch ? L.minHit : 15, touch });
  g.window(ctx, R.x, R.y, R.w, R.h, 'std', 'blue', 1);

  // ---- header: portrait, title, hero line, points left; buttons; the free-respec notice
  const hy = touch ? Math.floor((lay.headH - 36) / 2) : 0;
  charArt.portrait(ctx, cls, sc.look || 0, R.x + 10, R.y + hy + 9, 32, 32);
  g.text(ctx, `${CLASSES[cls].name} Talents`, R.x + 50, R.y + hy + 8, 'cream', { large: true });
  const lean = (cd.builds.find((b) => b.id === sc.build.leaning) || { name: 'Trainer choice' }).name;
  const subW = g.text(ctx, `${sc.name}   Lv ${sc.level}`, R.x + 50, R.y + hy + 26, 'gray');
  g.icon(ctx, 'icon_star', R.x + 50 + subW + 8, R.y + hy + 24);
  g.text(ctx, g.clip(lean, 196 - subW - 22), R.x + 50 + subW + 22, R.y + hy + 26, 'gold');
  const rightX = R.x + R.w - (touch ? L.minHit + 16 : 12);
  g.text(ctx, `Points left: ${pts.free}`, rightX, R.y + hy + 8, 'gold', { large: true, align: 'right' });
  g.text(ctx, `Spent ${pts.spent} of ${pts.total}`, rightX, R.y + hy + 26, 'gray', { align: 'right' });
  // buttons: Spend suggested (gold star) and Undo
  const bh = touch ? L.minHit : 18;
  const bY = R.y + (touch ? Math.floor((lay.headH - L.minHit) / 2) + 1 : 6);
  const btn = (x, w, label, scheme, icon) => {
    g.window(ctx, x, bY, w, bh, 'thin', scheme, 0.95);
    const tw = g.textW(label) + (icon ? 14 : 0);
    const tx = x + Math.floor((w - tw) / 2);
    if (icon) g.icon(ctx, icon, tx, bY + Math.floor((bh - 12) / 2));
    g.text(ctx, label, tx + (icon ? 14 : 0), bY + Math.floor((bh - 9) / 2), 'cream');
  };
  const midX = R.x + 252;
  btn(midX, touch ? 118 : 108, 'Spend suggested', 'forest', 'icon_star');
  btn(midX + (touch ? 124 : 112), touch ? 64 : 56, `Undo (${Math.min(RULES.undo, sc.build.undo.length)})`, sc.build.undo.length ? 'blue' : 'slate');
  if (sc.build.freeRespec && !touch) g.text(ctx, 'New talents: your points came back. One respec is free.', midX, R.y + 28, 'orange');
  if (sc.build.freeRespec && touch) g.text(ctx, 'One respec is free.', midX + 196, bY + Math.floor(bh / 2) - 5, 'orange');
  if (touch) {
    // phone close button (one window at a time; the X is a full touch target)
    const cx = R.x + R.w - L.minHit - 4;
    g.window(ctx, cx, bY, L.minHit, L.minHit, 'thin', 'crimson', 0.95);
    g.text(ctx, 'X', cx + L.minHit / 2, bY + Math.floor((L.minHit - 12) / 2), 'cream', { large: true, align: 'center' });
  }
  g.rect(ctx, R.x + 8, R.y + lay.headH, R.w - 17, 1, '#0e153b');
  g.rect(ctx, R.x + 8, R.y + lay.headH + 1, R.w - 17, 1, '#6891d9');

  // ---- six track columns
  const nodeRects = {};
  for (const col of lay.cols) {
    const t = col.track;
    const n = (tier) => Object.values(cd.nodes).filter((o) => o.track === t.id && o.tier === tier);
    const spentHere = pts.byTrack[t.id] || 0;
    g.window(ctx, col.x, col.y, col.w, col.h, 'thin', t.kind === 'strength' ? 'blue' : 'violet', 0.55);
    g.text(ctx, t.name, col.mid, col.y + 3, 'gold', { large: true, align: 'center' });
    g.text(ctx, `${t.kind === 'strength' ? 'Strength' : 'Weakness'}  ${spentHere} pt${spentHere === 1 ? '' : 's'}`, col.mid, col.y + 19, t.kind === 'strength' ? 'green' : 'orange', { align: 'center' });
    const place = (tier) => {
      const list = n(tier);
      const y = lay.rowY[tier - 1];
      const gap = list.length > 1 ? Math.max(lay.sz + 18, Math.min(lay.hit + 4, col.w / 2 - 2)) : 0;
      return list.map((o, i) => ({ o, x: Math.round(col.mid + (i - (list.length - 1) / 2) * gap - lay.sz / 2), y }));
    };
    const rows = [1, 2, 3, 4, 5].map(place);
    // connectors (lit when the next tier is open in this track)
    for (let ti = 0; ti < 4; ti++) {
      const lit = spentHere >= (ti + 1) * RULES.tierStep;
      const a = rows[ti], c = rows[ti + 1];
      const y0 = a[0].y + lay.sz + 10, y1 = c[0].y - 2;
      const xs = [...a, ...c].map((p) => p.x + lay.sz / 2);
      const busY = Math.round((y0 + y1) / 2) + (ti === 2 ? 4 : 0);
      for (const [color, w] of [['#14101e', 3], [lit ? '#f9d77a' : '#3a3f6b', 1]]) {
        if (ti !== 2) g.line(ctx, col.mid, ti === 1 ? busY : y0, col.mid, y1, color, w);
        if (a.length > 1 || c.length > 1) g.line(ctx, Math.min(...xs), busY, Math.max(...xs), busY, color, w);
        for (const p of a) g.line(ctx, p.x + lay.sz / 2, y0, p.x + lay.sz / 2, busY, color, w);
        for (const p of c) g.line(ctx, p.x + lay.sz / 2, busY, p.x + lay.sz / 2, y1, color, w);
      }
    }
    for (const row of rows) for (const { o, x, y } of row) {
      const r = sc.build.ranks[o.id] || 0;
      const w = why(o.id);
      const state = r > 0 ? 'taken' : w ? 'locked' : 'available';
      const scheme = state === 'taken' ? 'ember' : state === 'available' ? 'blue' : 'slate';
      g.window(ctx, x, y, lay.sz, lay.sz, 'thin', scheme, 1);
      g.iconIn(ctx, o.icon, x, y, lay.sz, lay.sz, state === 'locked' ? 0.45 : 1);
      if (state === 'locked') g.scrim(ctx, x + 2, y + 2, lay.sz - 4, lay.sz - 4, w === 'fork' ? 150 : 90);
      if (o.keystone) { g.outline(ctx, x - 2, y - 2, x + lay.sz + 1, y + lay.sz + 1, '#b8862b'); g.outline(ctx, x - 3, y - 3, x + lay.sz + 2, y + lay.sz + 2, '#14101e'); }
      if (state === 'taken') g.outline(ctx, x - 1, y - 1, x + lay.sz, y + lay.sz, '#f9d77a');
      else if (state === 'available') g.outline(ctx, x - 1, y - 1, x + lay.sz, y + lay.sz, '#b6cc58');
      if (star === o.id) g.icon(ctx, 'icon_star', x + lay.sz + 3, y + 6);
      const rc = state === 'taken' ? 'gold' : state === 'available' ? 'green' : 'dim';
      g.text(ctx, `${r}/${o.maxRanks}`, x + lay.sz / 2 + 1, y + lay.sz + 1, rc, { align: 'center' });
      const sel = sc.pin === o.id || sc.hover === o.id;
      if (sel) g.outline(ctx, x - 2, y - 2, x + lay.sz + 1, y + lay.sz + 1, '#fff7d6');
      nodeRects[o.id] = { x, y, w: lay.sz, h: lay.sz, col };
    }
    // the fork: "or" between its two nodes, and its axis chip under them
    const fk = rows[2];
    if (fk.length === 2) {
      g.text(ctx, 'or', col.mid, fk[0].y + 7, 'dim', { align: 'center' });
      const chip = g.clip(t.chip, col.w - 10), cw = g.textW(chip) + 8, cy = fk[0].y + lay.sz + 10;
      g.rect(ctx, col.mid - Math.ceil(cw / 2), cy, cw, 11, '#14101e');
      g.outline(ctx, col.mid - Math.ceil(cw / 2), cy, col.mid - Math.ceil(cw / 2) + cw - 1, cy + 10, t.kind === 'strength' ? '#4f7fd0' : '#8a63c8');
      g.text(ctx, chip, col.mid, cy + 1, 'cream', { align: 'center' });
    }
    if (touch) {
      // touch: the hit area of each node, drawn faintly so the still shows the real 44 css px targets
      for (const row of rows) for (const { x, y } of row) {
        const hx = x + lay.sz / 2 - lay.hit / 2, hy = y + lay.sz / 2 - lay.hit / 2;
        if (sc.showHits) g.outline(ctx, Math.round(hx), Math.round(hy), Math.round(hx + lay.hit - 1), Math.round(hy + lay.hit - 1), 'rgba(255,247,214,0.25)');
      }
    }
  }

  // ---- skill picks: 1 of 2 at levels 1, 3, 6 and 14 (desktop: a strip under the tracks; phone: a column on the right)
  const P = lay.picks;
  g.window(ctx, P.x, P.y, P.w, P.h, 'thin', 'blue', 0.6);
  const picks = SKILL_PICKS[cls];
  const isz = touch ? 28 : 20;
  const pitch = touch ? Math.max(L.minHit, isz) : isz + 18;    // touch: each skill a full 44 css px target
  const slot = (p, sx, sy, nameW) => {
    const open = sc.level >= p.level, taken = sc.build.picks[p.level];
    g.text(ctx, `Lv ${p.level}`, sx, sy + (touch ? 0 : 1), open ? 'cream' : 'dim');
    const ix = touch ? sx : sx + 26, iy = touch ? sy + 11 + Math.floor((pitch - isz) / 2) : sy;
    const off = touch ? Math.floor((pitch - isz) / 2) : 0;
    p.options.forEach((id, k) => {
      const x = ix + k * pitch + off, y = iy;
      const isTaken = taken === id, bought = (sc.build.bought || []).includes(id);
      const scheme = !p.ready ? 'slate' : isTaken || bought ? 'ember' : open && !taken ? 'blue' : 'slate';
      g.window(ctx, x, y, isz, isz, 'thin', scheme, 1);
      g.iconIn(ctx, skillIcon(id), x, y, isz, isz, isTaken || bought || (open && !taken && p.ready) ? 1 : 0.4);
      if (isTaken) g.outline(ctx, x - 1, y - 1, x + isz, y + isz, '#f9d77a');
      if (open && !taken && p.ready) g.outline(ctx, x - 1, y - 1, x + isz, y + isz, '#b6cc58');
    });
    g.text(ctx, 'or', ix + off + isz + Math.floor((pitch - isz) / 2), iy + Math.floor(isz / 2) - 5, 'dim', { align: 'center' });
    const line = !p.ready ? `${skillName(p.options[0])} or ${skillName(p.options[1])}: later` : taken ? skillName(taken)
      : open ? 'Choose one' : `${skillName(p.options[0])} or ${skillName(p.options[1])}`;
    const lineT = touch && !p.ready ? `${skillName(p.options[0])} or ${skillName(p.options[1])}` : line;
    const lc = !p.ready ? 'dim' : taken ? 'gold' : open ? 'green' : 'gray';
    if (touch) g.text(ctx, g.clip(lineT, nameW - 34), sx + 32, sy, lc);
    else g.text(ctx, g.clip(line, nameW), sx, sy + isz + 4, lc);
  };
  if (!P.vertical) {
    g.text(ctx, 'Skill picks', P.x + 8, P.y + 4, 'gold');
    g.text(ctx, '(one of two)', P.x + 8, P.y + 15, 'gray');
    const sw = Math.floor((P.w - 80) / picks.length);
    picks.forEach((p, i) => slot(p, P.x + 74 + i * sw, P.y + 4, sw - 6));
  } else {
    g.text(ctx, 'Skill picks', P.x + P.w / 2, P.y + 3, 'gold', { large: true, align: 'center' });
    const rowH = Math.floor((P.h - 22) / picks.length);
    picks.forEach((p, i) => slot(p, P.x + 6, P.y + 22 + i * rowH, P.w - 12));
  }

  // ---- footer (desktop): close, hint, auto-spend, respec rule
  if (!touch) {
    const fy = lay.footY;
    g.icon(ctx, 'btn_key_esc', R.x + 12, fy);
    g.text(ctx, 'Close', R.x + 32, fy, 'white');
    g.text(ctx, 'Click a lit talent to learn it.  The gold star is your leaning\'s next step.', R.x + R.w / 2 - 30, fy, 'gray', { align: 'center' });
    g.text(ctx, `Auto-spend: ${sc.build.auto ? 'On' : 'Off'}`, R.x + R.w - 12, fy, 'dim', { align: 'right' });
  }

  if (touch) g.text(ctx, 'Tap a talent or a skill to see it.  Your last 3 points undo free.  The gold star is your leaning\'s next step.', R.x + R.w / 2, lay.cols[0].y + lay.cols[0].h + 8, 'gray', { align: 'center' });

  // ---- hover tooltip (desktop) or the pinned card (touch)
  const show = sc.pin || sc.hover;
  if (show && nodeRects[show]) {
    const o = cd.nodes[show], t = cd.tracks.find((x) => x.id === o.track), nr = nodeRects[show];
    const tip = nodeTip(o, t, sc, why);
    if (!touch) {
      const right = nr.x + nr.w + 20 + 230 < R.x + R.w;
      // keep the footer readable: a tooltip low in the window grows upward from the node
      const wl = (x) => (x ? g.wrap(x, 230 - 14).length : 0);
      const estH = 8 + 16 + wl(tip.sub) * 11 + (tip.lines.length ? 2 + tip.lines.reduce((n, x) => n + wl(x), 0) * 11 : 0) + 2 + wl(tip.body) * 11 + 4 + wl(tip.foot) * 11 + 6;
      const ty = Math.max(R.y + 4, Math.min(nr.y - 8, lay.footY - 4 - estH));
      drawTooltip(g, ctx, tip, right ? nr.x + nr.w + 20 : nr.x - 20 - 230, ty, { w: 230, W: L.W, H: L.H });
      g.icon(ctx, 'cursor_1', nr.x - 1, nr.y + Math.floor(nr.h / 2) + 1);
    } else {
      // the item-card style pinned card: the window dims behind it, the tapped node stays lit, the full tooltip sits on the
      // side away from the finger, and Learn and Close are full touch targets under it
      g.scrim(ctx, R.x + 4, R.y + lay.headH + 2, R.w - 8, R.h - lay.headH - 6, 120);
      g.window(ctx, nr.x, nr.y, nr.w, nr.h, 'thin', why(o.id) ? 'slate' : 'blue', 1);
      g.iconIn(ctx, o.icon, nr.x, nr.y, nr.w, nr.h, 1);
      g.outline(ctx, nr.x - 2, nr.y - 2, nr.x + nr.w + 1, nr.y + nr.h + 1, '#fff7d6');
      const cw = 250;
      const leftSide = nr.x + nr.w / 2 > R.x + R.w / 2;
      const cx = leftSide ? Math.max(R.x + 6, nr.col.x - cw - 6) : Math.min(R.x + R.w - cw - 6, nr.col.x + nr.col.w + 6);
      const box = drawTooltip(g, ctx, tip, cx, R.y + lay.headH + 6, { w: cw, W: L.W, H: L.H - L.minHit - 6 });
      const bw = Math.floor((box.w - 6) / 2), by = box.y + box.h + 2;
      g.rect(ctx, box.x + 2, box.y + box.h, box.w - 4, 2, '#14101e');
      const can = !why(o.id);
      g.window(ctx, box.x, by, bw, L.minHit, 'thin', can ? 'forest' : 'slate', 0.97);
      g.text(ctx, g.clip(can ? `Learn ${o.name}` : 'Locked', bw - 8), box.x + bw / 2, by + Math.floor(L.minHit / 2) - 5, can ? 'cream' : 'dim', { align: 'center' });
      g.window(ctx, box.x + bw + 6, by, bw, L.minHit, 'thin', 'slate', 0.97);
      g.text(ctx, 'Close', box.x + bw + 6 + bw / 2, by + Math.floor(L.minHit / 2) - 5, 'cream', { align: 'center' });
    }
  }
}

function nodeTip(o, t, sc, why) {
  const r = sc.build.ranks[o.id] || 0;
  const w = why(o.id);
  let body = rankText(o.text, Math.max(1, r));
  if (r > 0 && r < o.maxRanks) body += ` Next rank: ${rankText(o.text, r + 1)}`;
  const lines = [];
  let sub = `${t.name}  Tier ${o.tier}  ${t.kind === 'strength' ? 'Strength' : 'Weakness'} track`;
  if (o.fork) {
    const other = Object.values(BUILDS2.mender.nodes).find((x) => x.track === o.track && x.tier === o.tier && x.id !== o.id);
    sub = `${t.name}  Tier 3 fork`;
    lines.push(`${t.axis}: take one side, the other closes.`);
    lines.push(`Other side: ${other.name}. ${rankText(other.text, 1)}`);
  }
  if (o.keystone) {
    sub = `${t.name}  Tier 5 keystone`;
    lines.push(`A keystone changes how you play and costs something. Needs level ${RULES.keystoneLevel}; hold 1 at 10, 2 at 25, 3 at 40.`);
  }
  if (t.kind === 'weakness' && o.tier === 1) lines.push(`Patches: ${t.purpose.replace(/^Patches: /, '')}.`);
  let foot = !w ? (sc.pin ? 'Tap Learn to take it (1 point).' : 'Click to learn it (1 point). Undo is free for your last 3 points.') : `${WHY[w](o, t)}.`;
  if (o.keystone && w === 'tier' && sc.level < RULES.keystoneLevel) foot = `Needs ${(o.tier - 1) * RULES.tierStep} points in ${t.name} and level ${RULES.keystoneLevel}.`;
  return { title: o.name, right: `Rank ${r}/${o.maxRanks}`, sub, body: body.charAt(0).toUpperCase() + body.slice(1), lines, foot, footColor: w ? 'red' : 'green' };
}

// ------------------------------------------------------------------------------------------------ install over the live game
export async function install(sc) {
  const R = window.__realms;
  const font = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => fetch('assets/ui/font.json').then((r) => r.json()).then((j) => resolve(new BitmapFont(j, img, { id: 'main' })), reject);
    img.onerror = reject;
    img.src = 'assets/ui/font.png';
  });
  const art = await loadUiArt({ font });
  const g = createGfx(art), charArt = createCharArt(art);
  const orig = R.ui.draw;
  R.ui.draw = (ctx, ...rest) => {
    orig(ctx, ...rest);
    const lay = R.renderer.layout, st = R.ui.state;
    const touch = !!st.metrics.touch;
    const L = { touch, W: lay.hudW, H: lay.hudH, minHit: touch ? hitPx(st.metrics.cssPerHud) : 15 };
    let rect = sc.rect;
    if (!rect) {
      if (!touch) rect = { x: 8, y: 4, w: 624, h: 352 };
      else {
        const top = 2 + L.minHit + 2;                         // under the phone menu bar
        rect = { x: 4, y: top, w: L.W - 8, h: L.H - top - 2 };
      }
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    try { drawTalents2(ctx, { g, charArt, L }, { ...sc, rect }); } finally { ctx.restore(); }
    window.__b2mock = { L, rect };
  };
  return true;
}

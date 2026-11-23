// The Builds 2 talents window (approved stills: qa/out/builds2/BRIEF.md, Scott 2026-11-19 "Ok. Approved."). It replaces
// talents.js for a hero whose class runs Builds 2 (the HUD model carries `builds2`); every other class keeps talents.js.
//
// Driven by data only: src/data/builds2.js BUILDS2[cls] (tracks, nodes, named builds) and SKILL_PICKS[cls]. A class
// joins by adding its tracks there (and to progression.builds2.classes); nothing here names a class.
//
//   six tracks (strengths blue, weaknesses violet), 5 tiers each; tier 3 a fork of two (one side only, an "X vs Y" chip);
//   tier 5 a keystone (double gold frame; 1 at level 10, 2 at 25, 3 at 40); the skill picks (one of two at 1, 3, 6, 14)
//   and the signature pick (one of the class's three at 10; phase 2, 2026-11-19);
//   the gold star on the leaning's next step, "Spend suggested", Undo (the last 3 points, free), Respec (its rules), the
//   auto-spend switch (on by default to level 5), and the free-respec notice for a migrated hero.
//
// Desktop: hover shows the tooltip, click learns, right-click undoes the last point. Phone: a tap pins an item-card style
// card with Learn and Close (the bag card pattern, menus.js itemCard); six columns when they fit at 44 css px, else three
// tabs (Strengths, Weaknesses, Skills). The sim owns the rules (src/sim/builds2.js); this file only mirrors them to colour
// the nodes and word the reasons, and every action is a command (b2_learn, b2_undo, b2_respec, b2_pick, b2_suggest,
// b2_leaning, b2_auto).
import { BUILDS2, SKILL_PICKS, RULES, B2_ABILITIES } from '../data/builds2.js';
import { drawTooltip } from './hud.js';
import { inRect } from './layout.js';
import { abilityInfo, abilityTooltip, abilityName, classInfo, liveStats } from './gamedata.js';

export const b2Class = (cls) => (cls && BUILDS2[cls]) || null;
/**
 * The pick slots the window shows: the class's skill picks (one of two) and its first signature pick (one of three, at
 * SIGNATURE_LEVELS[0]; `signature: true`). A signature slot is ready when every one of its skills is built.
 */
// cap 30: the level 25 pick joins the strip from level 20, and the level 1 pick (long taken by then, its skill on the bar)
// leaves it, so the strip keeps five slots and the approved geometry. `level` null: every slot (for lookups).
export const LATE_PICKS_FROM = 20;
export function pickSlots(cls, level = null) {
  const late = level != null && level >= LATE_PICKS_FROM;
  const out = (SKILL_PICKS[cls] || []).filter((p) => level == null || (p.level >= 25 ? late : !(late && p.level === 1)));
  const cd = b2Class(cls);
  const sigs = (cd && cd.signatures) || [];
  if (sigs.length) out.push({ level: RULES.signatureLevels[0], options: sigs.map((x) => x.id), axis: cd.signatureAxis || 'Signature skill', ready: sigs.every((x) => x.ready), signature: true });
  return out.sort((a, b) => a.level - b.level);   // in level order, the signature at its own level (Scott, 2026-11-23)
}
/** The skill a hero took in a slot ('' when none): b.picks[level] for a skill pick, the first of b.sigs for the signature. */
export const slotTaken = (build, slot) => (slot.signature ? (build.sigs || []).find((id) => slot.options.includes(id)) || '' : (build.picks || {})[slot.level] || '');
/** Does this HUD model run Builds 2 (the sim says so and the UI has the class's tracks)? */
export const isBuilds2 = (m) => !!(m && m.builds2 && m.player && b2Class(m.player.cls));

// ------------------------------------------------------------------------------------------------ rules, mirrored
// src/sim/builds2.js is the authority (it refuses with b2_fail); this copy colours nodes and words the reasons.
export function trackSpend(cd, ranks) {
  const byTrack = {};
  let spent = 0, keys = 0;
  for (const [id, r] of Object.entries(ranks || {})) {
    const n = cd.nodes[id];
    if (!n || !r) continue;
    byTrack[n.track] = (byTrack[n.track] || 0) + r;
    spent += r;
    if (n.keystone) keys++;
  }
  return { byTrack, spent, keys };
}
export function keystoneSlots(level) {
  if (level < RULES.keystoneLevel) return 0;
  return RULES.keystoneSlots.reduce((k, [from, n]) => (level >= from ? n : k), 0);
}
const tierNeed = (tier) => (tier - 1) * RULES.tierStep;
/** Why one more rank of `id` cannot be taken now ('' when it can), in display order. */
export function nodeWhy(cd, build, level, free, id) {
  const n = cd.nodes[id];
  if (!n) return 'unknown';
  const ranks = (build && build.ranks) || {};
  const r = ranks[id] || 0;
  if (r >= n.maxRanks) return 'maxed';
  if (n.fork && Object.keys(ranks).some((o) => o !== id && ranks[o] > 0 && cd.nodes[o] && cd.nodes[o].track === n.track && cd.nodes[o].tier === n.tier)) return 'fork';
  const sp = trackSpend(cd, ranks);
  if ((sp.byTrack[n.track] || 0) < tierNeed(n.tier)) return 'tier';
  if (n.keystone && level < RULES.keystoneLevel) return 'level';
  if (n.keystone && sp.keys >= keystoneSlots(level)) return 'keystones';
  if (free <= 0) return 'points';
  return '';
}
export function whyText(why, n, t, have = 0) {
  switch (why) {
    case 'tier': return `Needs ${tierNeed(n.tier)} points in ${t.name} (you have ${have})`;
    case 'level': return `Keystones need level ${RULES.keystoneLevel}`;
    case 'keystones': return 'Keystone slots full (1 at 10, 2 at 25, 3 at 40)';
    case 'fork': return `You took the other side of this fork (${t.chip})`;
    case 'points': return 'No points left';
    case 'maxed': return 'Fully learned';
    default: return 'Not now';
  }
}
/** b2_fail reasons as player words (ui.js toasts them). `last`: the command the UI sent last ('undo' | 'respec' | ...). */
export function b2FailText(reason, last = null) {
  const T = {
    max: 'Already at full rank.', points: 'No talent points left.', tier: 'That tier is not open yet.', fork: 'You took the other side of that fork.',
    level: `Keystones need level ${RULES.keystoneLevel}.`, keystones: 'Keystone slots are full (1 at 10, 2 at 25, 3 at 40).', combat: 'Not while in combat.',
    dependency: 'A deeper talent needs that point.', lantern: 'Below level 10 a respec is free at any lantern. Stand by one.',
    range: 'From level 10, respec at your class trainer.', gold: 'Not enough gold.', none: 'No suggested step right now.',
    taken: 'You already chose that skill.', unknown: 'You cannot learn that.', off: 'Your class uses the old talents.',
  };
  if (reason === 'empty') return last === 'undo' ? 'Nothing to undo.' : 'Nothing to reset.';
  return T[reason] || null;
}
const rankText = (text, r) => text.replace(/\{r\*([\d.]+)\}/g, (_, k) => String(Math.round(r * Number(k) * 100) / 100));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** A skill's display name: the UI's ability data, else the id without its class ("mender_purify" -> "Purify"). */
export function skillName(id) {
  const n = abilityName(id) || (B2_ABILITIES[id] && B2_ABILITIES[id].name);
  if (n) return n;
  return id.split('_').slice(1).map(cap).join(' ') || id;
}
const skillIcon = (id) => (abilityInfo(id) || {}).icon || (B2_ABILITIES[id] && B2_ABILITIES[id].icon) || 'icon_magic';

// ------------------------------------------------------------------------------------------------ geometry (pure)
/** The window on this layer: near full screen on desktop; under the phone's menu bar on a phone. */
export function talents2Rect(L) {
  if (!L.touch) return { x: 8, y: 4, w: 624, h: 352 };
  const top = 2 + L.minHit + 2;
  return { x: 4, y: top, w: L.W - 8, h: L.H - top - 2 };
}

/**
 * Every box the window draws or hits, from the window rect `R`, the class and the touch size `hit` (HUD px for 44 css
 * px; 15 on desktop). Phone: six columns when each fits two 44 px fork targets, else 3 tabs. Pure (node tests).
 */
export function talents2Layout(R, cls, { touch = false, hit = 15, tab = 'strength', level = 1 } = {}) {
  const cd = b2Class(cls);
  const sz = 24, pad = 8;
  const headH = touch ? Math.max(48, hit + 4) : 44;
  const colTop = R.y + headH + 4;
  const step = Math.max(touch ? hit : 37, sz + 10);
  const chipGap = 12;
  const rowsTop = colTop + 30;
  const rowY = [0, step, 2 * step, 3 * step + chipGap, 4 * step + chipGap].map((d) => rowsTop + d);
  const colH = rowY[4] + sz + 14 - colTop;
  // the phone's side column holds the picks: wide enough for a signature's three 44 css px targets
  // with a signature (five slots) the phone's picks go compact: the level beside the icons, no name line (the card names them)
  const maxOpts = Math.max(2, ...pickSlots(cls, level).map((p) => p.options.length));
  const sideW = touch ? Math.max(140, 2 * hit + 30, maxOpts * Math.max(hit, 28) + (pickSlots(cls, level).length > 4 ? 22 : 12)) : 0;
  const colW6 = Math.floor((R.w - 2 * pad - (sideW ? sideW + 4 : 0)) / cd.tracks.length);
  const tabs = touch && colW6 < Math.max(96, 2 * hit + 8);
  const shown = !tabs ? cd.tracks : tab === 'skills' ? [] : cd.tracks.filter((t) => t.kind === (tab === 'weakness' ? 'weakness' : 'strength'));
  const perRow = tabs ? Math.max(...['strength', 'weakness'].map((k) => cd.tracks.filter((t) => t.kind === k).length)) : cd.tracks.length;
  const sideX = R.x + R.w - pad - sideW;
  const colW = tabs ? Math.floor((sideX - 4 - R.x - pad) / perRow) : colW6;
  const nodeHit = touch ? hit : sz + 4;
  const cols = shown.map((t, i) => {
    const x = R.x + pad + i * colW, mid = x + Math.floor(colW / 2);
    const col = { track: t, x: x + 2, y: colTop, w: colW - 4, h: colH, mid, rows: [] };
    for (let tier = 1; tier <= 5; tier++) {
      const list = Object.values(cd.nodes).filter((o) => o.track === t.id && o.tier === tier).sort((a, b) => (a.fork || '').localeCompare(b.fork || ''));
      const y = rowY[tier - 1];
      const gap = list.length > 1 ? Math.max(sz + 18, Math.min(nodeHit + 4, Math.floor(colW / 2) - 2)) : 0;
      col.rows.push(list.map((o, k) => {
        const nx = Math.round(col.mid + (k - (list.length - 1) / 2) * gap - sz / 2);
        const cx = nx + sz / 2, cy = y + sz / 2;
        return { id: o.id, tier, x: nx, y, w: sz, h: sz, hit: { x: Math.round(cx - nodeHit / 2), y: Math.round(cy - nodeHit / 2), w: nodeHit, h: nodeHit } };
      }));
    }
    return col;
  });

  // header buttons
  const bh = touch ? hit : 18;
  const bY = R.y + (touch ? Math.floor((headH - hit) / 2) + 1 : 6);
  const bw = touch ? { suggest: 118, undo: 64, side: 64 } : { suggest: 108, undo: 56, side: 56 };
  const bx0 = R.x + 252;
  const buttons = { suggest: { x: bx0, y: bY, w: bw.suggest, h: bh } };
  buttons.undo = { x: bx0 + bw.suggest + 6, y: bY, w: bw.undo, h: bh };
  if (!touch || !tabs) buttons.respec = { x: buttons.undo.x + bw.undo + 6, y: bY, w: bw.side, h: bh };
  if (touch && !tabs) buttons.auto = { x: buttons.respec.x + bw.side + 6, y: bY, w: bw.side, h: bh };
  if (touch) buttons.close = { x: R.x + R.w - hit - 4, y: bY, w: hit, h: hit };
  const pointsRight = R.x + R.w - (touch ? hit + 16 : 12);
  // the leaning (tap to change): the hero line, a full touch target tall
  buttons.leaning = touch ? { x: R.x + 50, y: R.y + Math.floor((headH - hit) / 2) + 1, w: 196, h: hit } : { x: R.x + 50, y: R.y + 24, w: 196, h: 14 };
  if (touch) buttons.leaning = { ...buttons.leaning, x: R.x + 50, w: Math.min(196, bx0 - 4 - (R.x + 50)) };

  // the side column (phone): skill picks (six columns) or the tabs, Respec and Auto (tabs)
  let picks = null, tabRects = [];
  const pickList = pickSlots(cls, level);
  const slotsV = (P) => {
    const rowH = Math.floor((P.h - 22) / Math.max(1, pickList.length));
    const isz = 28, pitch = Math.max(hit, isz), off = Math.floor((pitch - isz) / 2);
    const compact = rowH < 11 + pitch;
    return pickList.map((p, i) => {
      const sx = P.x + 6, sy = P.y + 22 + i * rowH;
      const ix = compact ? sx + 16 : sx, iy = compact ? sy : sy + 11;
      return { level: p.level, sx, sy: compact ? sy + Math.floor(pitch / 2) - 5 : sy, nameW: compact ? 0 : P.w - 12, isz, signature: !!p.signature, compact,
        opts: p.options.map((id, k) => ({ id, x: ix + k * pitch + off, y: iy + off, isz, hit: { x: ix + k * pitch, y: iy, w: pitch, h: pitch } })),
        orX: ix + pitch, orY: iy + Math.floor(pitch / 2) - 5 };
    });
  };
  if (!touch) {
    const P = { x: R.x + pad + 2, y: colTop + colH + 4, w: R.w - 2 * pad - 4, h: 46, vertical: false };
    // each slot's width follows its option count (a signature offers three)
    const wt = (p) => (p.options.length > 2 ? 2.6 : 2);       // three icons fit in 2.6 units
    const units = pickList.reduce((n, p) => n + wt(p), 0);
    const unit = (P.w - 80) / Math.max(1, units);
    let ux = 0;
    P.slots = pickList.map((p) => {
      const sw = Math.floor(unit * wt(p));
      const sx = P.x + 74 + Math.floor(ux * unit), sy = P.y + 4, isz = 20;
      ux += wt(p);
      return { level: p.level, sx, sy, nameW: sw - 6, isz, signature: !!p.signature,
        opts: p.options.map((id, k) => ({ id, x: sx + 30 + k * 38, y: sy, isz, hit: { x: sx + 30 + k * 38 - 2, y: sy - 2, w: isz + 4, h: isz + 4 } })),
        orX: sx + 30 + isz + 9, orY: sy + 5 };
    });
    picks = P;
  } else if (!tabs) {
    const P = { x: sideX, y: colTop, w: sideW, h: colH, vertical: true };
    P.slots = slotsV(P);
    picks = P;
  } else {
    const ids = [['strength', 'Strengths'], ['weakness', 'Weaknesses'], ['skills', 'Skills'], ['respec', null], ['auto', null]];
    const pitch = Math.floor(colH / ids.length);
    tabRects = ids.map(([id, label], i) => ({ id, label, rect: { x: sideX, y: colTop + i * pitch, w: sideW, h: Math.max(hit, pitch - 6) } }));
    for (const t of tabRects) if (t.id === 'respec' || t.id === 'auto') buttons[t.id] = t.rect;
    tabRects = tabRects.filter((t) => t.label);
    if (tab === 'skills') {
      const P = { x: R.x + pad + 2, y: colTop, w: sideX - 6 - R.x - pad, h: colH, vertical: true };
      P.slots = slotsV(P);
      picks = P;
    }
  }
  return { mode: tabs ? 'tabs' : 'six', tab: tabs ? tab : null, sz, hit, headH, step, rowY, cols, colTop, colH, picks, buttons, tabs: tabRects,
    pointsRight, hintY: colTop + colH + 8, footY: R.y + R.h - 15 };
}

/** Every interactive rect of a layout (overlap and touch-size tests). */
export function layoutTargets(lay) {
  const out = [];
  for (const [id, r] of Object.entries(lay.buttons)) out.push({ id: `button:${id}`, r });
  for (const c of lay.cols) for (const row of c.rows) for (const n of row) out.push({ id: n.id, r: n.hit });
  if (lay.picks) for (const s of lay.picks.slots) for (const o of s.opts) out.push({ id: `pick:${s.level}:${o.id}`, r: o.hit });
  for (const t of lay.tabs) out.push({ id: `tab:${t.id}`, r: t.rect });
  return out;
}

// ------------------------------------------------------------------------------------------------ tooltips
export function nodeTip(cd, o, build, level, free, { touch = false, pinned = false } = {}) {
  const t = cd.tracks.find((x) => x.id === o.track);
  const r = (build.ranks || {})[o.id] || 0;
  const why = nodeWhy(cd, build, level, free, o.id);
  const have = trackSpend(cd, build.ranks).byTrack[o.track] || 0;
  let body = rankText(o.text, Math.max(1, r));
  if (r > 0 && r < o.maxRanks) body += ` Next rank: ${rankText(o.text, r + 1)}`;
  const lines = [];
  let sub = `${t.name}  Tier ${o.tier}  ${t.kind === 'strength' ? 'Strength' : 'Weakness'} track`;
  if (o.fork) {
    const other = Object.values(cd.nodes).find((x) => x.track === o.track && x.tier === o.tier && x.id !== o.id);
    sub = `${t.name}  Tier ${o.tier} fork`;
    // only the chosen node's details; the other side is just named (Scott 2026-11-20: "just the details for the one selected")
    lines.push(other ? `Fork: taking this closes ${other.name}.` : 'Fork: taking this closes the other side.');
  }
  if (o.keystone) {
    sub = `${t.name}  Tier ${o.tier} keystone`;
    lines.push(`A keystone changes how you play and costs something. Needs level ${RULES.keystoneLevel}; hold 1 at 10, 2 at 25, 3 at 40.`);
  }
  if (t.kind === 'weakness' && o.tier === 1 && t.purpose) lines.push(`${t.purpose}.`);
  let foot;
  if (!why) foot = touch || pinned ? 'Tap Learn to take it (1 point).' : 'Click to learn it (1 point). Your last 3 points undo free.';
  else if (o.keystone && why === 'tier' && level < RULES.keystoneLevel) foot = `Needs ${tierNeed(o.tier)} points in ${t.name} and level ${RULES.keystoneLevel}.`;
  else foot = `${whyText(why, o, t, have)}.`;
  return { title: o.name, right: `Rank ${r}/${o.maxRanks}`, sub, body: cap(body), lines, foot, footColor: why && why !== 'maxed' ? 'red' : 'green' };
}

export function pickTip(m, slot, id, { touch = false } = {}) {
  const level = m.player.level;
  const build = m.builds2.build || {};
  const p = pickSlots(m.player.cls).find((x) => x.level === slot.level) || { options: [], ready: false };
  const taken = slotTaken(build, p);
  const open = (m.builds2.picks || []).some((x) => x.level === slot.level);
  const a = abilityInfo(id) || (B2_ABILITIES[id] ? { ...B2_ABILITIES[id] } : null);
  const res = (classInfo(m.player.cls) || {}).resource || 'mana';
  const base = a && p.ready ? abilityTooltip(a, Math.max(level, slot.level), res, liveStats(m)) : null;
  const other = p.options.find((x) => x !== id);
  const tip = base ? { ...base } : { title: skillName(id), body: 'This skill comes in a later update.' };
  tip.right = p.signature ? `Lv ${slot.level} signature` : `Lv ${slot.level} pick`;
  tip.sub = p.signature ? `${p.axis}: one of three. The other two come at 20 and 35.` : `${p.axis || 'Skill pick'}: ${skillName(id)} or ${other ? skillName(other) : ''}`.trim();
  let foot, ok = false;
  if (!p.ready) foot = 'Comes in a later update.';
  else if (taken === id) { foot = 'You chose this one.'; ok = true; }
  else if ((build.bought || []).includes(id)) { foot = 'Bought at your trainer.'; ok = true; }
  else if (taken && p.signature) foot = 'You chose another signature. This one can be your next, at level 20.';
  else if (taken) foot = 'You chose the other one. Your trainer sells this one for gold.';
  else if (open && p.signature) { foot = `${touch ? 'Tap Learn' : 'Click'} to take it. You get another signature at 20 and the last at 35.`; ok = true; }
  else if (open) { foot = touch ? `Tap Learn to take it. ${other ? skillName(other) : 'The other'} stays at your trainer for gold.` : `Click to take it. ${other ? skillName(other) : 'The other'} stays at your trainer for gold.`; ok = true; }
  else if (level >= slot.level && slot.level === 1) foot = 'Win your first fight to choose.';
  else foot = `Choose one at level ${slot.level}.`;
  tip.foot = foot; tip.footColor = ok ? 'green' : 'red';
  return tip;
}

/** drawTooltip's box size for `tip` at width `w` (the same sums), so a tooltip can be placed before it is drawn. */
export function tipSize(tm, tip, w = 214) {
  w = Math.max(w, Math.min(300, tm.textW(tip.title || '', true) + (tip.right ? tm.textW(tip.right) + 10 : 0) + 18));
  const n = (s) => (s ? tm.wrap(s, w - 14).length : 0);
  const sub = n(tip.sub), body = n(tip.body), foot = n(tip.foot);
  const nums = (tip.lines || []).reduce((k, ln) => k + n(ln), 0);
  const h = 8 + 16 + sub * 11 + (nums ? 2 + nums * 11 : 0) + (body ? 2 + body * 11 : 0) + (foot ? 4 + foot * 11 : 0) + 6;
  return { w, h };
}

/** Where the phone card goes: beside the tapped column, away from the finger; Learn and Close under it. */
export function cardPlace(R, lay, at, tipH, L, cw = 250) {
  const leftSide = at.x + at.w / 2 > R.x + R.w / 2;
  const colX = at.colX ?? at.x, colW = at.colW ?? at.w;
  const x = leftSide ? Math.max(R.x + 6, colX - cw - 6) : Math.min(R.x + R.w - cw - 6, colX + colW + 6);
  let y = R.y + lay.headH + 6;
  const maxBottom = L.H - 2 - lay.hit - 2;
  if (y + tipH > maxBottom) y = Math.max(2, maxBottom - tipH);
  const bw = Math.floor((cw - 6) / 2), by = y + tipH + 2;
  return { x, y, w: cw, h: tipH, learn: { x, y: by, w: bw, h: lay.hit }, close: { x: x + bw + 6, y: by, w: bw, h: lay.hit } };
}

// ------------------------------------------------------------------------------------------------ draw
export function drawTalents2(ctx, env, m, st, regions, act) {
  const { g, charArt, L } = env;
  const touch = !!L.touch;
  const p = m.player, cls = p.cls, cd = b2Class(cls);
  const B = m.builds2, build = B.build || { ranks: {}, undo: [], picks: {}, bought: [] };
  const pts = B.points || { total: p.level, spent: 0, free: p.level, byTrack: {} };
  const R = talents2Rect(L);
  const hit = touch ? L.minHit : 15;
  st.b2Tab = st.b2Tab || 'strength';
  const lay = talents2Layout(R, cls, { touch, hit, tab: st.b2Tab, level: p.level });
  const free = pts.free;
  const star = B.suggested;
  const sel = st.talentSel;
  const hov = !touch && env.hover ? env.hover : null;
  const confirmRespec = st.confirm === 'b2respec';

  g.window(ctx, R.x, R.y, R.w, R.h, 'std', 'blue', 1);
  regions.push({ rect: R, kind: 'window', id: 'talents' });

  // ---- header: portrait, title, hero line (leaning behind a gold star), buttons, points left
  const hy = touch ? Math.floor((lay.headH - 36) / 2) : 0;
  charArt.portrait(ctx, cls, p.look || 0, R.x + 10, R.y + hy + 9, 32, 32);
  g.text(ctx, g.clip(`${p.clsName || (classInfo(cls) || {}).name || cls} Talents`, 196, true), R.x + 50, R.y + hy + 8, 'cream', { large: true });
  const lb = cd.builds.find((b) => b.id === B.leaning) || cd.builds.find((b) => b.id === cd.defaultBuild) || cd.builds[0];
  // the leaning is shown whole (a long one, "Grapple Skirmisher", takes room from the hero's name, never the other way)
  const nameRoom = Math.max(40, Math.min(74, 196 - 22 - g.textW(`   Lv ${p.level}`) - g.textW(lb ? lb.name : '')));
  const subW = g.text(ctx, `${g.clip(p.name || '', nameRoom)}   Lv ${p.level}`, R.x + 50, R.y + hy + 26, 'gray');
  g.icon(ctx, 'icon_star', R.x + 50 + subW + 8, R.y + hy + 24);
  g.text(ctx, g.clip(lb ? lb.name : '', 196 - subW - 22), R.x + 50 + subW + 22, R.y + hy + 26, 'gold');
  regions.push({ rect: lay.buttons.leaning, kind: 'button', label: 'b2:leaning',
    tip: { title: `Leaning: ${lb ? lb.name : ''}`, body: lb ? lb.line : '', foot: `The gold star follows your leaning. ${touch ? 'Tap' : 'Click'} to try the next one.` },
    on: () => {
      const i = cd.builds.indexOf(lb);
      const next = cd.builds[(i + 1) % cd.builds.length];
      act.b2({ t: 'b2_leaning', build: next.id });
    } });
  g.text(ctx, `Points left: ${free}`, lay.pointsRight, R.y + hy + 8, free > 0 ? 'gold' : 'cream', { large: true, align: 'right' });
  g.text(ctx, `Spent ${pts.spent} of ${pts.total}`, lay.pointsRight, R.y + hy + 26, 'gray', { align: 'right' });

  const btn = (r, label, scheme, icon, on, tip, color = 'cream') => {
    g.window(ctx, r.x, r.y, r.w, r.h, 'thin', scheme, 0.95);
    const lab = g.clip(label, r.w - 8 - (icon ? 14 : 0));
    const tw = g.textW(lab) + (icon ? 14 : 0);
    const tx = r.x + Math.floor((r.w - tw) / 2);
    if (icon) g.icon(ctx, icon, tx, r.y + Math.floor((r.h - 12) / 2));
    g.text(ctx, lab, tx + (icon ? 14 : 0), r.y + Math.floor((r.h - 9) / 2), color);
    regions.push({ rect: r, kind: 'button', on, tip, label: `b2:${label}` });
  };
  const canSuggest = !!star && free > 0;
  btn(lay.buttons.suggest, 'Spend suggested', canSuggest ? 'forest' : 'slate', 'icon_star',
    () => { if (canSuggest) act.b2({ t: 'b2_suggest' }); else act.toast(free > 0 ? 'No suggested step right now.' : 'No points left.'); },
    { title: 'Spend suggested', body: 'Puts one point on the gold star: your leaning\'s next step.' }, canSuggest ? 'cream' : 'dim');
  const nUndo = Math.min(RULES.undo, (build.undo || []).length);
  btn(lay.buttons.undo, `Undo (${nUndo})`, nUndo ? 'blue' : 'slate', null,
    () => { if (nUndo) act.b2({ t: 'b2_undo' }); else act.toast('Nothing to undo.'); },
    { title: 'Undo', body: `Takes back your last point, free. Your last ${RULES.undo} points can be undone, out of combat.` }, nUndo ? 'cream' : 'dim');
  const rc = B.respec || { cost: 0, where: 'lantern' };
  const respecTip = { title: 'Respec', body: 'Takes back every point. Free once after the new talents came in. Below level 10: free at any lantern. From 10: at your class trainer, the first time free, then 10 gold + 5 per level (at most 250).',
    foot: rc.where === 'free' ? 'Your free respec is waiting.' : rc.where === 'lantern' ? 'Free now at any lantern.' : `At your trainer: ${rc.cost ? `${rc.cost} gold` : 'free'}.` };
  const doRespec = () => {
    if (!Object.keys(build.ranks || {}).length && !build.freeRespec) { act.toast('Nothing to reset.'); return; }
    if (rc.where === 'trainer') { act.toast(`From level 10, respec at your class trainer (${rc.cost ? `${rc.cost} gold` : 'free the first time'}).`); return; }
    if (!confirmRespec) { st.confirm = 'b2respec'; return; }
    st.confirm = null;
    act.b2({ t: 'b2_respec' });
  };
  const respecLabel = confirmRespec ? 'Sure?' : build.freeRespec && touch ? 'Free respec' : 'Respec';
  const autoTip = { title: 'Auto-spend', body: `On: each new point goes on the gold star until level ${RULES.autoSpendUntil}, with a note each time.`, foot: `${touch ? 'Tap' : 'Click'} to turn it ${build.auto ? 'off' : 'on'}.` };
  const doAuto = () => act.b2({ t: 'b2_auto', on: !build.auto });
  if (lay.buttons.respec && lay.mode === 'six') btn(lay.buttons.respec, respecLabel, build.freeRespec || confirmRespec ? 'ember' : 'blue', null, doRespec, respecTip);
  if (lay.buttons.auto && lay.mode === 'six') btn(lay.buttons.auto, `Auto: ${build.auto ? 'On' : 'Off'}`, build.auto ? 'forest' : 'slate', null, doAuto, autoTip);
  if (build.freeRespec && !touch) g.text(ctx, 'New talents: your points came back. One respec is free.', lay.buttons.suggest.x, R.y + 28, 'orange');
  if (touch) {
    const c = lay.buttons.close;
    g.window(ctx, c.x, c.y, c.w, c.h, 'thin', 'crimson', 0.95);
    g.text(ctx, 'X', c.x + c.w / 2, c.y + Math.floor((c.h - 12) / 2), 'cream', { large: true, align: 'center' });
    regions.push({ rect: c, kind: 'button', on: () => act.close('talents'), label: 'b2:close' });
  }
  g.rect(ctx, R.x + 8, R.y + lay.headH, R.w - 17, 1, '#0e153b');
  g.rect(ctx, R.x + 8, R.y + lay.headH + 1, R.w - 17, 1, '#6891d9');

  // ---- phone tabs (narrow phones): Strengths, Weaknesses, Skills, then Respec and Auto
  if (lay.mode === 'tabs') {
    for (const t of lay.tabs) {
      const on = st.b2Tab === t.id;
      g.window(ctx, t.rect.x, t.rect.y, t.rect.w, t.rect.h, 'thin', on ? 'ember' : t.id === 'weakness' ? 'violet' : 'blue', 0.95);
      g.text(ctx, t.label, t.rect.x + t.rect.w / 2, t.rect.y + Math.floor((t.rect.h - 9) / 2), on ? 'gold' : 'cream', { align: 'center' });
      regions.push({ rect: t.rect, kind: 'button', label: `b2:tab:${t.id}`, on: () => { st.b2Tab = t.id; st.talentSel = null; } });
    }
    btn(lay.buttons.respec, respecLabel, build.freeRespec || confirmRespec ? 'ember' : 'blue', null, doRespec, respecTip);
    btn(lay.buttons.auto, `Auto: ${build.auto ? 'On' : 'Off'}`, build.auto ? 'forest' : 'slate', null, doAuto, autoTip);
  }

  // ---- the track columns
  const nodeAt = {};
  let hovered = null;
  for (const col of lay.cols) {
    const t = col.track;
    const spentHere = (pts.byTrack || {})[t.id] || 0;
    const strength = t.kind === 'strength';
    g.window(ctx, col.x, col.y, col.w, col.h, 'thin', strength ? 'blue' : 'violet', 0.55);
    g.text(ctx, g.clip(t.name, col.w - 4, true), col.mid, col.y + 3, 'gold', { large: true, align: 'center' });
    g.text(ctx, g.clip(`${strength ? 'Strength' : 'Weakness'}  ${spentHere} pt${spentHere === 1 ? '' : 's'}`, col.w - 4), col.mid, col.y + 19, strength ? 'green' : 'orange', { align: 'center' });
    const rows = col.rows;
    for (let ti = 0; ti < 4; ti++) {
      const a = rows[ti], c = rows[ti + 1];
      if (!a.length || !c.length) continue;
      const lit = spentHere >= (ti + 1) * RULES.tierStep;
      const y0 = a[0].y + lay.sz + 10, y1 = c[0].y - 2;
      const xs = [...a, ...c].map((n) => n.x + lay.sz / 2);
      const busY = Math.round((y0 + y1) / 2) + (ti === 2 ? 4 : 0);
      for (const [color, w] of [['#14101e', 3], [lit ? '#f9d77a' : '#3a3f6b', 1]]) {
        if (a.length === 1 && c.length === 1) g.line(ctx, col.mid, y0, col.mid, y1, color, w);
        else {
          g.line(ctx, Math.min(...xs), busY, Math.max(...xs), busY, color, w);
          for (const n of a) g.line(ctx, n.x + lay.sz / 2, y0, n.x + lay.sz / 2, busY, color, w);
          for (const n of c) g.line(ctx, n.x + lay.sz / 2, busY, n.x + lay.sz / 2, y1, color, w);
        }
      }
    }
    for (const row of rows) for (const n of row) {
      const o = cd.nodes[n.id];
      const r = (build.ranks || {})[o.id] || 0;
      const why = nodeWhy(cd, build, p.level, free, o.id);
      const state = r > 0 ? 'taken' : why ? 'locked' : 'available';
      g.window(ctx, n.x, n.y, lay.sz, lay.sz, 'thin', state === 'taken' ? 'ember' : state === 'available' ? 'blue' : 'slate', 1);
      g.iconIn(ctx, o.icon, n.x, n.y, lay.sz, lay.sz, state === 'locked' ? 0.45 : 1);
      if (state === 'locked') g.scrim(ctx, n.x + 2, n.y + 2, lay.sz - 4, lay.sz - 4, why === 'fork' ? 150 : 90);
      if (o.keystone) { g.outline(ctx, n.x - 2, n.y - 2, n.x + lay.sz + 1, n.y + lay.sz + 1, '#b8862b'); g.outline(ctx, n.x - 3, n.y - 3, n.x + lay.sz + 2, n.y + lay.sz + 2, '#14101e'); }
      if (state === 'taken') g.outline(ctx, n.x - 1, n.y - 1, n.x + lay.sz, n.y + lay.sz, '#f9d77a');
      else if (state === 'available') g.outline(ctx, n.x - 1, n.y - 1, n.x + lay.sz, n.y + lay.sz, '#b6cc58');
      if (star === o.id) g.icon(ctx, 'icon_star', n.x + lay.sz + 3, n.y + 6);
      const canMore = !why;
      g.text(ctx, `${r}/${o.maxRanks}`, n.x + lay.sz / 2 + 1, n.y + lay.sz + 1, r > 0 ? 'gold' : canMore ? 'green' : 'dim', { align: 'center' });
      const isHov = hov && inRect(n.hit, hov.x, hov.y);
      if (isHov || sel === o.id) { g.outline(ctx, n.x - 2, n.y - 2, n.x + lay.sz + 1, n.y + lay.sz + 1, '#fff7d6'); if (isHov) hovered = { kind: 'node', o, n, col }; }
      nodeAt[o.id] = { n, col };
      regions.push({ rect: n.hit, kind: 'talent', id: o.id, label: `b2node:${o.id}`,
        on: (button) => {
          if (touch) { st.talentSel = st.talentSel === o.id ? null : o.id; return; }
          if (button === 2) {
            const last = (build.undo || [])[(build.undo || []).length - 1];
            if (last === o.id) act.b2({ t: 'b2_undo' }); else act.toast(`Right-click undoes your last point${last ? ` (${(cd.nodes[last] || { name: last }).name})` : ''}.`);
            return;
          }
          if (canMore) act.b2({ t: 'b2_learn', node: o.id });
          else act.toast(`${whyText(why, o, t, spentHere)}.`);
        } });
    }
    // the fork: "or" between its two nodes, and its axis chip under them
    const fk = rows[2];
    if (fk.length === 2) {
      g.text(ctx, 'or', col.mid, fk[0].y + 7, 'dim', { align: 'center' });
      const chip = g.clip(t.chip || t.axis || '', col.w - 10), cw = g.textW(chip) + 8, cy = fk[0].y + lay.sz + 10;
      g.rect(ctx, col.mid - Math.ceil(cw / 2), cy, cw, 11, '#14101e');
      g.outline(ctx, col.mid - Math.ceil(cw / 2), cy, col.mid - Math.ceil(cw / 2) + cw - 1, cy + 10, strength ? '#4f7fd0' : '#8a63c8');
      g.text(ctx, chip, col.mid, cy + 1, 'cream', { align: 'center' });
    }
  }

  // ---- skill picks
  const picksAt = {};
  if (lay.picks) {
    const P = lay.picks;
    g.window(ctx, P.x, P.y, P.w, P.h, 'thin', 'blue', 0.6);
    if (!P.vertical) { g.text(ctx, 'Skill picks', P.x + 8, P.y + 4, 'gold'); g.text(ctx, '(one of two)', P.x + 8, P.y + 15, 'gray'); }
    else g.text(ctx, 'Skill picks', P.x + P.w / 2, P.y + 3, 'gold', { large: true, align: 'center' });
    const defs = pickSlots(cls);
    for (const s of P.slots) {
      const def = defs.find((x) => x.level === s.level) || { options: [], ready: false };
      // cap 30: the signature slot also takes the second signature (level 20): the open signature pick names its level
      const sigOpen = s.signature ? (B.picks || []).find((x) => x.signature) : null;
      const taken = sigOpen ? '' : slotTaken(build, def);
      const open = s.signature ? !!sigOpen : (B.picks || []).some((x) => x.level === s.level);
      const reached = p.level >= s.level;
      g.text(ctx, s.compact ? String(s.level) : `Lv ${s.level}`, s.sx, s.sy + (P.vertical ? 0 : 1), reached ? (s.signature ? 'gold' : 'cream') : 'dim');
      for (const o of s.opts) {
        const isTaken = s.signature ? (build.sigs || []).includes(o.id) : taken === o.id, bought = (build.bought || []).includes(o.id);
        const lit = def.ready && (isTaken || bought || open);
        g.window(ctx, o.x, o.y, o.isz, o.isz, 'thin', !def.ready ? 'slate' : isTaken || bought ? 'ember' : open ? 'blue' : 'slate', 1);
        g.iconIn(ctx, skillIcon(o.id), o.x, o.y, o.isz, o.isz, lit ? 1 : 0.4);
        if (isTaken) g.outline(ctx, o.x - 1, o.y - 1, o.x + o.isz, o.y + o.isz, '#f9d77a');
        else if (open && def.ready) g.outline(ctx, o.x - 1, o.y - 1, o.x + o.isz, o.y + o.isz, '#b6cc58');
        const starred = s.signature ? lb && lb.signature === o.id : lb && lb.picks && lb.picks[s.level] === o.id;
        if (def.ready && open && !taken && starred) g.icon(ctx, 'icon_star', o.x + o.isz - 6, o.y - 6);
        const key = `pick:${s.level}:${o.id}`;
        const isHov = hov && inRect(o.hit, hov.x, hov.y);
        if (isHov || sel === key) { g.outline(ctx, o.x - 2, o.y - 2, o.x + o.isz + 1, o.y + o.isz + 1, '#fff7d6'); if (isHov) hovered = { kind: 'pick', s, id: o.id, o }; }
        picksAt[key] = { s, o };
        regions.push({ rect: o.hit, kind: 'talent', id: key, label: `b2pick:${s.level}:${o.id}`,
          on: () => {
            if (touch) { st.talentSel = st.talentSel === key ? null : key; return; }
            if (open && !taken && !isTaken && def.ready) act.b2({ t: 'b2_pick', level: sigOpen ? sigOpen.level : s.level, ability: o.id });
            else act.toast(pickTip(m, s, o.id).foot);
          } });
      }
      if (!s.signature && !s.compact) g.text(ctx, 'or', s.orX, s.orY, 'dim', { align: 'center' });
      const nm = (id) => skillName(id);
      const both = s.signature ? 'Signature: one of three' : `${nm(def.options[0])} or ${nm(def.options[1])}`;
      const line = !def.ready ? both : taken ? nm(taken)
        : open ? (s.signature ? ((build.sigs || []).length ? 'Choose your next signature' : 'Choose a signature') : 'Choose one') : both;
      const lc = !def.ready ? 'dim' : taken ? 'gold' : open ? 'green' : 'gray';
      if (s.compact) { /* compact phone slots: no name line (the card names the skill) */ }
      else if (P.vertical) g.text(ctx, g.clip(line, s.nameW - 34), s.sx + 32, s.sy, lc);
      else g.text(ctx, g.clip(line, s.nameW), s.sx, s.sy + s.isz + 4, lc);
    }
  }

  // ---- footer (desktop): close, hint, auto-spend switch; hint line (phone)
  if (!touch) {
    const fy = lay.footY;
    g.icon(ctx, 'btn_key_esc', R.x + 12, fy);
    g.text(ctx, 'Close', R.x + 32, fy, 'white');
    regions.push({ rect: { x: R.x + 8, y: fy - 4, w: 56, h: 18 }, kind: 'button', on: () => act.close('talents'), label: 'b2:close' });
    g.text(ctx, 'Click a lit talent to learn it.  The gold star is your leaning\'s next step.', R.x + R.w / 2 - 30, fy, 'gray', { align: 'center' });
    const at = `Auto-spend: ${build.auto ? 'On' : 'Off'}`;
    const aw = g.textW(at);
    g.text(ctx, at, R.x + R.w - 12, fy, build.auto ? 'green' : 'dim', { align: 'right' });
    lay.buttons.autoFoot = { x: R.x + R.w - 12 - aw - 4, y: fy - 4, w: aw + 8, h: 18 };
    regions.push({ rect: lay.buttons.autoFoot, kind: 'button', on: doAuto, tip: autoTip, label: 'b2:auto' });
  } else if (lay.hintY + 10 <= R.y + R.h - 2) {
    const long = build.freeRespec ? 'New talents: your points came back. One respec is free.'
      : 'Tap a talent or a skill to see it.  Your last 3 points undo free.  The gold star is your leaning\'s next step.';
    const short = build.freeRespec ? 'One respec is free.' : 'Tap a talent to see it.  Last 3 points undo free.';
    const hint = g.textW(long) <= R.w - 16 ? long : short;
    g.text(ctx, g.clip(hint, R.w - 16), R.x + R.w / 2, lay.hintY, build.freeRespec ? 'orange' : 'gray', { align: 'center' });
  }

  // ---- the hover tooltip (desktop) or the pinned card (phone)
  if (!touch && hovered) {
    const tip = hovered.kind === 'node' ? nodeTip(cd, hovered.o, build, p.level, free) : pickTip(m, hovered.s, hovered.id);
    const nr = hovered.kind === 'node' ? hovered.n : { x: hovered.o.x, y: hovered.o.y, w: hovered.o.isz, h: hovered.o.isz };
    const size = tipSize(g, tip, 230);
    const right = nr.x + nr.w + 20 + size.w < R.x + R.w;
    const ty = Math.max(R.y + 4, Math.min(nr.y - 8, lay.footY - 4 - size.h));
    drawTooltip(g, ctx, tip, right ? nr.x + nr.w + 20 : nr.x - 20 - size.w, ty, { w: 230, W: L.W, H: L.H });
    g.icon(ctx, 'cursor_1', nr.x - 1, nr.y + Math.floor(nr.h / 2) + 1);
  }
  if (touch && sel && (nodeAt[sel] || picksAt[sel])) {
    let tip, at, can, learn, label;
    if (nodeAt[sel]) {
      const { n, col } = nodeAt[sel];
      const o = cd.nodes[sel];
      tip = nodeTip(cd, o, build, p.level, free, { touch: true, pinned: true });
      at = { x: n.x, y: n.y, w: n.w, h: n.h, colX: col.x, colW: col.w };
      can = !nodeWhy(cd, build, p.level, free, sel);
      learn = () => act.b2({ t: 'b2_learn', node: sel });
      label = `Learn ${o.name}`;
    } else {
      const { s, o } = picksAt[sel];
      tip = pickTip(m, s, o.id, { touch: true });
      const def = pickSlots(cls).find((x) => x.level === s.level) || {};
      at = { x: o.x, y: o.y, w: o.isz, h: o.isz, colX: lay.picks.x, colW: lay.picks.w };
      const sigOpen = s.signature ? (B.picks || []).find((x) => x.signature) : null;     // cap 30: the second signature at 20
      can = !!def.ready && (sigOpen ? !(build.sigs || []).includes(o.id) : (B.picks || []).some((x) => x.level === s.level) && !slotTaken(build, def));
      learn = () => { act.b2({ t: 'b2_pick', level: sigOpen ? sigOpen.level : s.level, ability: o.id }); st.talentSel = null; };
      label = `Learn ${skillName(o.id)}`;
    }
    // the window dims behind the card; a tap on the dim closes it
    const dim = { x: R.x + 4, y: R.y + lay.headH + 2, w: R.w - 8, h: R.h - lay.headH - 6 };
    g.scrim(ctx, dim.x, dim.y, dim.w, dim.h, 120);
    regions.push({ rect: dim, kind: 'button', on: () => { st.talentSel = null; }, label: 'b2:card_dim' });
    g.window(ctx, at.x, at.y, at.w, at.h, 'thin', can ? 'blue' : 'slate', 1);
    if (nodeAt[sel]) g.iconIn(ctx, cd.nodes[sel].icon, at.x, at.y, at.w, at.h, 1);
    else g.iconIn(ctx, skillIcon(picksAt[sel].o.id), at.x, at.y, at.w, at.h, 1);
    g.outline(ctx, at.x - 2, at.y - 2, at.x + at.w + 1, at.y + at.h + 1, '#fff7d6');
    const size = tipSize(g, tip, 250);
    const card = cardPlace(R, lay, at, size.h, L, size.w);
    const box = drawTooltip(g, ctx, tip, card.x, card.y, { w: 250, W: L.W, H: L.H });
    regions.push({ rect: box, kind: 'window', id: 'b2card' });
    g.rect(ctx, box.x + 2, box.y + box.h, box.w - 4, 2, '#14101e');
    const cb = (r, text, scheme, color, on, lab) => {
      g.window(ctx, r.x, r.y, r.w, r.h, 'thin', scheme, 0.97);
      g.text(ctx, g.clip(text, r.w - 8), r.x + r.w / 2, r.y + Math.floor(r.h / 2) - 5, color, { align: 'center' });
      regions.push({ rect: r, kind: 'button', on, label: lab });
    };
    const bw = Math.floor((box.w - 6) / 2), by = box.y + box.h + 2;
    cb({ x: box.x, y: by, w: bw, h: card.learn.h }, can ? label : 'Locked', can ? 'forest' : 'slate', can ? 'cream' : 'dim', () => { if (can) learn(); else act.toast(tip.foot); }, 'b2:learn');
    cb({ x: box.x + bw + 6, y: by, w: bw, h: card.close.h }, 'Close', 'slate', 'cream', () => { st.talentSel = null; }, 'b2:card_close');
  }
}

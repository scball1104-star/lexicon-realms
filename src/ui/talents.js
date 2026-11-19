// Talents window (approved still 3): three branch columns, five tiers, node states taken / available / locked,
// hover tooltip, click to learn, right-click to unlearn (desktop), tap for a detail card with Learn and Unlearn
// buttons (touch), points counter, Reset. Reads the tree through gamedata.js (the data hook).
import { menuRect, talentLayout } from './layout.js';
import { talentTree, treeTiers, talentState, canUnlearn, branchSpend, rankText, tierNeeds } from './gamedata.js';
import { drawTooltip } from './hud.js';

const SCHEME = { taken: 'ember', available: 'blue', locked: 'slate' };

export function talentTooltip(tree, t, alloc, free, touch) {
  const st = talentState(tree, alloc, t.id, free);
  const branch = (tree.branches.find((b) => b.id === t.branch) || { name: t.branch }).name;
  const cur = Math.max(1, st.rank);
  let body = rankText(t.text, cur);
  if (st.rank > 0 && st.rank < t.maxRanks) body = `${body.replace(/[.]?$/, '.')} Next rank: ${rankText(t.text, st.rank + 1)}`;
  body = body.charAt(0).toUpperCase() + body.slice(1);
  if (!/[.!]$/.test(body)) body += '.';
  const foot = st.canLearn ? `${touch ? 'Tap Learn' : 'Click'} to learn rank ${st.rank + 1} (1 point)` : st.why === 'maxed' ? 'Fully learned.' : `${st.why}.`;
  return {
    title: t.name, right: `Rank ${st.rank}/${t.maxRanks}`,
    sub: `${branch}  Tier ${t.tier}  ${t.play ? 'Changes how you play (+ mark)' : 'A steady bonus'}`, body,
    foot: foot + (!touch && canUnlearn(tree, alloc, t.id) ? ' Right-click to unlearn.' : ''),
    footColor: st.canLearn || st.why === 'maxed' ? 'green' : 'red',
  };
}

export function drawTalents(ctx, env, m, st, regions, act) {
  const { g, charArt } = env;
  const p = m.player;
  const tree = talentTree(p.cls);
  const P = menuRect('talents');
  const W = 640;
  // level banner (still 3); the phone's menu bar sits there, so it is desktop only
  if (!env.L.touch) levelBanner();
  function levelBanner() {
  const msg = `Level ${p.level}`;
  const bw = g.textW(msg, true) + 40, bx = Math.floor((W - bw) / 2);
  g.icon(ctx, 'banner_l', bx, 6, 1);
  const bm = g.frame('banner_m');
  if (bm) ctx.drawImage(g.art.uiImg, bm[0], bm[1], bm[2], bm[3], bx + 18, 6, bw - 36, 24);
  g.icon(ctx, 'banner_r', bx + bw - 18, 6);
  g.text(ctx, msg, W / 2, 8, 'cream', { large: true, align: 'center' });
  }

  g.window(ctx, P.x, P.y, P.w, P.h, 'std', 'blue', 0.97);
  regions.push({ rect: P, kind: 'window', id: 'talents' });
  charArt.portrait(ctx, p.cls, p.look, P.x + 10, P.y + 9, 32, 32);
  g.text(ctx, `${p.clsName} Talents`, P.x + 50, P.y + 8, 'cream', { large: true });
  g.text(ctx, `${p.name}   Level ${p.level}`, P.x + 50, P.y + 26, 'gray');
  const pts = m.talentPoints;
  g.text(ctx, `Talent points: ${pts.free}`, P.x + P.w - 12, P.y + 10, 'gold', { large: true, align: 'right' });
  // no points yet: say when the first one comes (CRITIQUE_1 item 14)
  if (!pts.total) g.text(ctx, 'Your first point comes at level 5, then one every level.', P.x + P.w - 12, P.y + 26, 'orange', { align: 'right' });
  else g.text(ctx, `Spent: ${pts.spent}`, P.x + P.w - 12, P.y + 26, 'gray', { align: 'right' });
  g.rect(ctx, P.x + 8, P.y + 44, P.w - 17, 1, '#0e153b');
  g.rect(ctx, P.x + 8, P.y + 45, P.w - 17, 1, '#6891d9');
  if (!tree) { g.text(ctx, 'No talent data for this class yet.', W / 2, 180, 'gray', { align: 'center' }); return; }

  const alloc = m.talents;
  const cols = talentLayout(P, tree.branches, treeTiers(tree), { minHit: env.L.touch ? env.L.minHit : 15 });
  const { per } = branchSpend(tree, alloc);
  let hovered = null;
  for (const col of cols) {
    const b = tree.branches.find((o) => o.id === col.branch);
    g.window(ctx, col.x, col.y, col.w, col.h, 'thin', 'blue', 0.55);
    g.text(ctx, b.name, col.mid, P.y + 53, 'gold', { large: true, align: 'center' });
    // class identity pass: the branch's purpose (talents.js branches[].purpose) and the points spent in it
    const KCOL = { strength: 'green', counter: 'orange', flavor: 'cream' };
    if (b.purpose) g.text(ctx, g.clip(`${b.purpose}  ${per[b.id] || 0} ${(per[b.id] || 0) === 1 ? 'pt' : 'pts'}`, col.w - 6), col.mid, P.y + 70, KCOL[b.kind] || 'gray', { align: 'center' });
    else g.text(ctx, `${per[b.id] || 0} pts`, col.mid, P.y + 70, 'gray', { align: 'center' });
    // connectors: node -> bus -> next tier (lit when the next tier is open in this branch)
    const byTier = [];
    for (const n of col.nodes) (byTier[n.tier - 1] || (byTier[n.tier - 1] = [])).push(n);
    for (let ti = 0; ti < byTier.length - 1; ti++) {
      const a = byTier[ti], c = byTier[ti + 1];
      if (!a || !c) continue;
      const lit = (per[b.id] || 0) >= tierNeeds(ti + 2);
      const color = lit ? '#f9d77a' : '#3a3f6b';
      const busY = a[0].y + a[0].h + 15;
      const xs = [...a, ...c].map((n) => n.cx);
      const seg = (x0, y0, x1, y1) => { g.line(ctx, x0, y0, x1, y1, '#14101e', 3); };
      const segC = (x0, y0, x1, y1) => { g.line(ctx, x0, y0, x1, y1, color, 1); };
      for (const pass of [seg, segC]) {
        pass(Math.min(...xs), busY, Math.max(...xs), busY);
        for (const n of a) pass(n.cx, n.y + n.h + 12, n.cx, busY);
        for (const n of c) pass(n.cx, busY, n.cx, n.y - 2);
      }
    }
    for (const n of col.nodes) {
      const t = tree.talents[n.id];
      const s = talentState(tree, alloc, n.id, pts.free);
      g.window(ctx, n.x, n.y, n.w, n.h, 'thin', SCHEME[s.state], 1.0);
      g.iconIn(ctx, t.icon, n.x, n.y, n.w, n.h, s.state === 'locked' ? 0.45 : 1);
      if (s.state === 'locked') g.scrim(ctx, n.x + 2, n.y + 2, n.w - 4, n.h - 4, 90);
      if (s.state === 'taken') g.outline(ctx, n.x - 1, n.y - 1, n.x + n.w, n.y + n.h, '#f9d77a');
      else if (s.canLearn) g.outline(ctx, n.x - 1, n.y - 1, n.x + n.w, n.y + n.h, '#b6cc58');
      if (t.play) { g.rect(ctx, n.x + n.w - 6, n.y + 1, 5, 5, '#14101e'); g.rect(ctx, n.x + n.w - 5, n.y + 3, 3, 1, '#fff7d6'); g.rect(ctx, n.x + n.w - 4, n.y + 2, 1, 3, '#fff7d6'); }
      const rc = s.state === 'taken' ? 'gold' : s.canLearn ? 'green' : 'dim';
      g.text(ctx, `${s.rank}/${t.maxRanks}`, n.cx + 1, n.y + n.h + 1, rc, { align: 'center' });
      const sel = st.talentSel === n.id;
      const hov = env.hover && env.hover.x >= n.hit.x && env.hover.y >= n.hit.y && env.hover.x < n.hit.x + n.hit.w && env.hover.y < n.hit.y + n.hit.h;
      if (hov || sel) { g.outline(ctx, n.x - 2, n.y - 2, n.x + n.w + 1, n.y + n.h + 1, '#fff7d6'); hovered = { n, t }; }
      regions.push({ rect: n.hit, kind: 'talent', id: n.id,
        on: (btn) => {
          if (env.L.touch) { st.talentSel = st.talentSel === n.id ? null : n.id; return; }
          if (btn === 2) { if (canUnlearn(tree, alloc, n.id)) act.unlearnTalent(n.id); else act.toast('Spend points deeper in this branch first.'); }
          else if (s.canLearn) act.learnTalent(n.id); else act.toast(s.why === 'maxed' ? 'Already at full rank.' : `${s.why}.`);
        } });
    }
  }
  // footer
  const fy = P.y + P.h - 15;
  g.icon(ctx, 'btn_key_esc', P.x + 12, fy);
  g.text(ctx, 'Close', P.x + 32, fy, 'white');
  regions.push({ rect: { x: P.x + 8, y: fy - 4, w: Math.max(56, env.L.minHit || 0), h: Math.max(18, env.L.minHit || 0) }, kind: 'button', on: () => act.close('talents') });
  g.text(ctx, env.L.touch ? 'Tap a talent to see it, then Learn or Unlearn.' : 'Click a lit talent to learn it.  Right-click to unlearn.', W / 2, fy, 'gray', { align: 'center' });
  // a full reset happens at your class trainer (the sim refuses it anywhere else), so this only says where
  g.text(ctx, 'Reset at your trainer', P.x + P.w - 12, fy, 'dim', { align: 'right' });

  // tooltip: hover (desktop) or the selected node (touch, with buttons)
  const show = env.L.touch ? (st.talentSel ? { n: cols.flatMap((c) => c.nodes).find((x) => x.id === st.talentSel), t: tree.talents[st.talentSel] } : null) : hovered;
  if (show && show.n) {
    const tip = talentTooltip(tree, show.t, alloc, pts.free, env.L.touch);
    const right = show.n.x + show.n.w + 22 + 214 < W;
    const box = drawTooltip(g, ctx, tip, right ? show.n.x + show.n.w + 22 : show.n.x - 22 - 214, show.n.y - 6);
    if (!env.L.touch) g.icon(ctx, 'cursor_1', show.n.x - 1, show.n.y + Math.floor(show.n.h / 2) + 1);
    if (env.L.touch) {
      const bh = env.L.minHit, bw = 96;
      const by = Math.min(360 - bh - 2, box.y + box.h + 2);
      const s = talentState(tree, alloc, show.t.id, pts.free);
      const btn = (x, label, ok, on) => {
        g.window(ctx, x, by, bw, bh, 'thin', ok ? 'forest' : 'slate', 0.95);
        g.text(ctx, label, x + bw / 2, by + Math.floor(bh / 2) - 6, ok ? 'cream' : 'dim', { align: 'center' });
        regions.push({ rect: { x, y: by, w: bw, h: bh }, kind: 'button', on: () => { if (ok) on(); } });
      };
      btn(box.x, 'Learn', s.canLearn, () => act.learnTalent(show.t.id));
      btn(box.x + bw + 8, 'Unlearn', canUnlearn(tree, alloc, show.t.id), () => act.unlearnTalent(show.t.id));
    }
  }
}

// The boss frame and the call-out (wave 10 dbosses BUILD; sim src/sim/boss_mech.js view -> the snapshot entity's
// `bossFight`; brief D:/LQOnline/wave10/dbosses/BRIEF.md). Drawn with g.* so the skin and Text size apply.
//   drawBossFrame(g, ctx, L, t)   in place of the target frame while the target has a bossFight (src/ui/hud.js): the
//                                 name, Phase n of m, health with a gold notch at each phase gate, the phase's name,
//                                 the frenzy and Last Count clocks (red under 30 s); violet for the Unspoken version
//   createBossHud({ g }).draw(ctx, L, m)   the one-line call-out for the mechanic happening now (m.bossCall, uivm.js)
// Every word comes from src/data/boss_fights.js (DRAFTS) or is a DRAFT here: "Phase", "Frenzy", "Frenzy!".
const KIND = { share: '#ffc640', mark: '#b26bff', safe: '#4fb6ff', letter: '#ffe27a', tether: '#3fe0c8', red: '#ff5030' };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The boss frame's rect: the target frame's spot, wider and one line taller. */
export function bossFrameRect(L) {
  const r = L.target;
  return { x: r.x, y: r.y, w: r.w + (L.touch ? 70 : 96), h: r.h + 12 };
}

/** The boss frame, drawn in place of the target frame while the target is a boss (src/ui/hud.js targetFrame). */
export function drawBossFrame(g, ctx, L, t) {
  const S = t.bossFight;
  const r = bossFrameRect(L);
  const lh = g.lh || 10;
  g.window(ctx, r.x, r.y, r.w, r.h, 'std', S.unspoken ? 'violet' : 'crimson');
  g.icon(ctx, 'elite_mark', r.x + 6, r.y + 1);
  const right = `Phase ${S.phase} of ${S.of}`;
  g.text(ctx, g.clip(S.unspoken ? `${t.name}, Unspoken` : t.name, r.w - 30 - g.textW(right) - 6), r.x + 22, r.y + 4, S.unspoken ? 'violet' : 'gold');
  g.text(ctx, right, r.x + r.w - 7, r.y + 4, 'cream', { align: 'right' });
  // health with a notch at each phase gate
  const bx = r.x + 8, by = r.y + 6 + lh + 2, bw = r.w - 16 - 30, barH = 7;
  const hp = t.hpFrac != null ? t.hpFrac : 1;
  g.rect(ctx, bx - 1, by - 1, bw + 2, barH + 2, '#120c08');
  g.rect(ctx, bx, by, bw, barH, '#3a1612');
  g.rect(ctx, bx, by, Math.round(bw * hp), barH, S.unspoken ? '#8e3fd0' : '#c0352a');
  g.rect(ctx, bx, by, Math.round(bw * hp), 2, S.unspoken ? '#c79bff' : '#ef6a4e');
  for (const gt of S.gates || []) g.rect(ctx, bx + Math.round(bw * gt) - 1, by - 2, 2, barH + 4, '#f9d77a');
  g.text(ctx, `${t.hpPct != null ? t.hpPct : Math.round(hp * 100)}%`, r.x + r.w - 7, by - 2, 'white', { align: 'right' });
  // the phase name, and the clocks
  const ly = by + barH + 2;
  const clk = [S.frenzyIn != null ? (S.frenzyIn > 0 ? `Frenzy ${clock(S.frenzyIn)}` : 'Frenzy!') : null, S.hardIn != null && S.hardIn < 600 ? (S.hardIn > 0 ? `Last Count ${clock(S.hardIn)}` : 'Last Count!') : null].filter(Boolean).join('  ');
  g.text(ctx, clk, r.x + r.w - 7, ly, S.hardIn != null && S.hardIn < 30 ? 'red' : 'gray', { align: 'right' });
  g.text(ctx, g.clip(S.phaseName, Math.max(20, r.w - 22 - (clk ? g.textW(clk) : 0))), r.x + 8, ly, 'cream');   // wave 10 integrate: never runs into the clocks
}

export function createBossHud({ g }) {
  /** The call-out for the mechanic happening now: desktop under the top frames, phone just above your cast bar. */
  function draw(ctx, L, m) {
    const S = m && m.bossCall ? { call: m.bossCall } : null;
    if (!S) return;
    const lh = g.lh || 10;
    const t = S.call.title, l = S.call.line || '';
    const cw = Math.min(L.W - 16, Math.max(g.textW(t), g.textW(l)) + 30);
    const ch = 6 + lh * (l ? 2 : 1) + 4;
    const cx = Math.round(L.W / 2 - cw / 2);
    const cy = L.touch ? Math.round((L.cast ? L.cast.y : L.H - 70) - ch - 6) : 78;
    g.scrim(ctx, cx, cy, cw, ch, 190);
    const col = KIND[S.call.kind] || KIND.share;
    ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx + 10, cy + 6 + lh / 2, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    g.rect(ctx, cx, cy, cw, 1, col); g.rect(ctx, cx, cy + ch - 1, cw, 1, col);
    g.text(ctx, t, cx + 18, cy + 5, 'gold');
    if (l) g.text(ctx, l, cx + 18, cy + 5 + lh, 'cream');
  }
  return { draw };
}

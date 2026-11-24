// World life on the HUD (2026-11-22): the story card shown when the last step of a story chain is handed in
// (the sim's `story` event, src/sim/worldlife.js). The rested XP bar and the rare's target-frame mark are in hud.js.
// Pure drawing on the HUD layer; the card closes on a click or tap, or by itself after `until`.

/** st.story = { title, lines, until } (ui.js sets it on the `story` event). Draws the card and its close region. */
export function drawStoryCard(ctx, g, L, st, regions) {
  const s = st.story;
  if (!s) return;
  if (s.until <= st.now) { st.story = null; return; }
  const w = Math.min(L.W - 16, g.big ? 380 : 300);
  const lines = [];
  for (const l of s.lines || []) { for (const ln of g.wrap(l, w - 20)) lines.push(ln); lines.push(''); }
  if (lines.length) lines.pop();
  const h = g.ls(38) + lines.length * g.lh + g.ls(16);   // Large text (gfx.js g.big): the card grows with the font
  const x = Math.floor((L.W - w) / 2), y = Math.max(4, Math.floor((L.H - h) / 2) - 20);
  g.window(ctx, x, y, w, h, 'std', 'ember', 0.97);
  g.text(ctx, 'A story told', x + w / 2, y + 6, 'gray', { align: 'center' });
  g.text(ctx, g.clip(s.title || '', w - 16), x + w / 2, y + g.ls(17), 'gold', { align: 'center' });
  let ty = y + g.ls(34);
  for (const ln of lines) { if (ln) g.text(ctx, ln, x + 10, ty, 'cream'); ty += g.lh; }
  g.text(ctx, L.touch ? 'Tap to close' : 'Click to close', x + w / 2, y + h - g.ls(13), 'gray', { align: 'center' });
  regions.push({ rect: { x, y, w, h }, kind: 'button', label: 'story:close', on: () => { st.story = null; } });
}

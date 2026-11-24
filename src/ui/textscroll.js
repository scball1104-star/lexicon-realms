// Long text that scrolls instead of ending in "..." (wave 6 uiskin: "Long text scrolls instead of '...'"). Pure drawing
// over the gfx object; the offset lives in st.textScroll[key] so each quest or npc page keeps its own place.
//
//   scrollLines(ctx, g, regions, st, key, lines, box, lh, draw)
//     lines: already wrapped. box: { x, y, w, h } in layer px. draw(line, x, y, k) paints one line (k: its index).
//     Shows floor(box.h / lh) lines from the offset, a small up / down mark at the right edge when there is more, and
//     pushes one region over the box: the wheel scrolls it on desktop (`scroll`), a finger drag on a phone (`scrollDrag`).
//     Returns { rows, off, max }.

export function scrollLines(ctx, g, regions, st, key, lines, box, lh, draw, markColor = '#7a5634') {
  const rows = Math.max(1, Math.floor(box.h / lh));
  const max = Math.max(0, lines.length - rows);
  const all = st.textScroll || (st.textScroll = {});
  const clamp = (v) => Math.max(0, Math.min(max, v | 0));
  const off = clamp(all[key] || 0);
  all[key] = off;
  lines.slice(off, off + rows).forEach((ln, k) => draw(ln, box.x, box.y + k * lh, off + k));
  if (max > 0) {
    const mx = box.x + box.w - 5;
    // a 5 px wide arrow head, lit when there is more that way
    const head = (y, up, lit) => {
      for (let i = 0; i < 3; i++) g.rect(ctx, mx + 2 - i, up ? y + i : y + 2 - i, 1 + 2 * i, 1, lit ? markColor : 'rgba(122,86,52,0.25)');
    };
    head(box.y + 1, true, off > 0);
    head(box.y + rows * lh - 4, false, off < max);
    const bar = Math.max(4, Math.floor((rows * lh - 12) * rows / lines.length));
    const by = box.y + 6 + Math.round((rows * lh - 12 - bar) * (off / max));
    g.rect(ctx, mx + 2, by, 1, bar, markColor);
    regions.push({ rect: { ...box }, kind: 'window', id: 'text_scroll', label: `scroll:${key}`,
      scroll: (d) => { all[key] = clamp((all[key] || 0) + d); },
      scrollDrag: (dx, dy, rec) => { if (rec.scroll0 == null) rec.scroll0 = all[key] || 0; all[key] = clamp(rec.scroll0 - Math.round(dy / lh)); } });
  }
  return { rows, off, max };
}

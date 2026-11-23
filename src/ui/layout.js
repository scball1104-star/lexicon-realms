// HUD and menu geometry on the 640x360 HUD layer (CONTRACTS section 10). Pure: no canvas, so Node tests check it.
// Desktop numbers are the approved mockups' (D:\LQOnline\mockups\build_stills.py). The touch layout is the compact
// phone HUD (DESIGN section 1, "Phone"); its hit areas are at least `minHit` HUD px (44 css px, see hitPx()).

export const W = 640, H = 360;

/** HUD px that make 44 css px: cssPerHud = renderer base scale / devicePixelRatio. */
export function hitPx(cssPerHud) { return Math.ceil(44 / Math.max(0.25, cssPerHud || 1)); }

// 8 skill slots (BUILDS_2 open question 4, Scott 2026-11-19 "yes to all"): keys 1 to 8 on desktop, 8 buttons on a phone
export const BAR = { n: 8, sz: 26, gap: 3, y: 318 };

export function hudLayout({ touch = false, minHit = 15, W: LW = W, H: LH = H } = {}) {
  if (!touch) return desktopLayout(LW, LH);
  return touchLayout(minHit, LW, LH);
}

/**
 * The desktop HUD on a layer of LW x LH HUD px (at least 640x360). At 640x360 every box is the approved stills'
 * (D:\LQOnline\mockups\build_stills.py). On a wider or taller layer (the 3D renderer fills the window, Scott
 * 2026-11-21: "there's still room around the border to spread these out") each box keeps its distance from its own
 * edge: frames top left, zone label + minimap + tracker top right, the bar and cast bar bottom centre, the XP bar along
 * the bottom edge, chat bottom left. Menu windows stay 640x360 designs centred on the layer (ui.js `centred`).
 */
function desktopLayout(LW, LH) {
  const W = Math.max(640, LW | 0), H = Math.max(360, LH | 0);
  const dy = H - 360;                            // how much taller than the 640x360 design
  const tw = BAR.n * BAR.sz + (BAR.n - 1) * BAR.gap;
  const bx = Math.floor((W - tw) / 2);
  const barY = BAR.y + dy;
  return {
    touch: false, W, H,
    player: { x: 4, y: 4, w: 194, h: 46 },
    // group play (src/ui/group_ui.js): your buff row under the player frame pushes the party frames down a row
    party: (i) => ({ x: 4, y: 77 + i * 35, w: 150, h: 32 }),
    target: { x: 204, y: 4, w: 150, h: 34 },
    buffs: { x: 6, y: 53 }, targetCast: { x: 204, y: 40, w: 150 }, threat: { x: 358, y: 4 },
    zoneLabel: { x: W - 100, y: 4, w: 96, h: 13 },
    minimap: { x: W - 100, y: 18, w: 96, h: 64 },
    tracker: { x: W - 188, y: 86, w: 184, maxLines: 16 + Math.floor(dy / 11) },
    bar: Array.from({ length: BAR.n }, (_, i) => ({ slot: i + 1, x: bx + i * (BAR.sz + BAR.gap), y: barY, w: BAR.sz, h: BAR.sz })),
    cast: { x: Math.floor((W - 150) / 2), y: 296 + dy, w: 150 },
    xp: { y: 350 + dy },
    chat: { x: 4, w: 184, lines: 6, bottom: 296 + dy },
    menuBar: null, cluster: null,
  };
}

/** Where a 640x360 window design sits on a layer of LW x LH (centred, whole pixels; 0, 0 on a 640x360 layer). */
export function designOrigin(LW = W, LH = H) {
  return { x: Math.max(0, Math.floor((LW - W) / 2)), y: Math.max(0, Math.floor((LH - H) / 2)) };
}

/**
 * The phone HUD on a layer of any size (fix wave 2026-11-19, CRITIQUE_1 item 8): the layer follows the screen aspect,
 * so every box is placed from the edges. Frames top left, menu buttons along the top, minimap and tracker top right,
 * the ability cluster bottom right, a 3-line log bottom left. Hit areas are at least `minHit` HUD px (44 css px).
 */
function touchLayout(minHit, LW, LH) {
  const W = LW, H = LH;
  const m = Math.max(minHit, 24);
  const mbX = 160, mbY = 2;
  const mb = ['character', 'bags', 'quests', 'talents', 'map', 'help', 'menu'].map((id, i) => ({ id, x: mbX + i * m, y: mbY, w: m, h: m }));
  // cluster: 8 skills, Attack, Talk and Next Target on two rows, anchored to the lower right. Skills 1 to 6 keep their
  // old spots under the thumb (1 to 3 on top, 4 to 6 below), Talk and Next beside them; 7 sits over Attack and 8 at the
  // outer end of the bottom row, so the cluster is six buttons wide and two tall
  const p = m, right = W - 4, bottom = H - 14;
  const pos = [
    ['slot1', 3, 1], ['slot2', 2, 1], ['slot3', 1, 1], ['slot4', 3, 2], ['slot5', 2, 2], ['slot6', 1, 2],
    ['interact', 0, 1], ['next_target', 0, 2], ['slot7', -1, 1], ['attack', -1, 2], ['slot8', -2, 2],
  ];
  const cluster = pos.map(([id, col, row]) => ({ id, x: right - (4 - col) * p, y: bottom - (3 - row) * p, w: p, h: p }))
    .map((b) => ({ ...b, slot: /^slot(\d)$/.test(b.id) ? Number(b.id.slice(4)) : null }));
  const clusterTop = bottom - 2 * p;
  const mmW = 64, mmH = 44;
  const trY = 15 + mmH + 3;
  return {
    touch: true, minHit: m, W, H,
    player: { x: 4, y: 4, w: 150, h: 34 },
    party: (i) => ({ x: 4, y: 76 + i * 22, w: 110, h: 20 }),
    target: { x: 4, y: 40, w: 150, h: 34 },
    // group play (src/ui/group_ui.js): your buffs right of your frame under the menu buttons, the foe's cast and the
    // threat warning right of the target frame
    buffs: { x: 158, y: mbY + m + 2 }, targetCast: { x: 158, y: Math.max(42, mbY + m + 27), w: 150 }, threat: { x: 158, y: Math.max(42, mbY + m + 27) + 20 },
    zoneLabel: { x: W - 4 - mmW, y: 2, w: mmW, h: 13 },
    minimap: { x: W - 4 - mmW, y: 15, w: mmW, h: mmH },
    tracker: { x: W - 4 - 150, y: trY, w: 150, maxLines: Math.max(2, Math.min(8, Math.floor((clusterTop - 6 - trY - 20) / 11))),
      header: { x: W - 4 - 150, y: trY, w: 150, h: Math.max(16, Math.min(m, 24)) } },
    bar: [],
    cast: { x: Math.floor((W - 150) / 2), y: Math.min(H - 64, clusterTop - 6), w: 150 },
    xp: { y: H - 10 },
    chat: { x: 4, w: Math.min(170, W - 6 * p - 16), lines: 3, bottom: H - 16, passive: true },
    menuBar: mb, cluster,
    // mounts: the horseshoe (shown once you own one) in the free spot above slot 8, by the bar's left end
    mountBtn: { id: 'mount', x: right - 6 * p, y: bottom - 2 * p, w: p, h: p },
  };
}

/**
 * Quest tracker rows (still 1): a gold "Quests" heading, then each tracked quest (max 5) as an icon line with its
 * name wrapped to the width, the count right-aligned on the first line when the quest has one count objective,
 * and one gray line per extra objective. wrap(text, width) -> lines; textW(text) -> px.
 */
export function trackerRows(quests, width, wrap, textW, { maxQuests = 5, areas = false, compact = false, selected = null } = {}) {
  // compact (the phone, Scott 2026-11-19: "the quest text and box are too big"): a small heading, each quest on one line,
  // the where-to-go line and the next objective only for the selected quest (the one the map and arrow follow)
  if (compact) {
    const rows = [{ kind: 'head', text: 'Quests', h: 12, small: true }];
    const list = (quests || []).slice(0, maxQuests);
    const sel = list.find((q) => q.id === selected) || list[0];
    for (const q of list) {
      const objs = q.objectives || [];
      const count = objs.length === 1 && objs[0].need > 1 ? `${objs[0].cur}/${objs[0].need}` : (q.done ? 'Done' : '');
      const nameW = width - 22 - (count ? textW(count) + 6 : 0);
      const lines = wrap(q.name, nameW);
      rows.push({ kind: 'quest', text: lines.length > 1 ? `${lines[0]}...` : lines[0] || '', right: count, done: !!q.done, id: q.id, h: 11 });
      if (q !== sel) continue;
      const next = objs.length > 1 ? objs.find((o) => o.cur < o.need) : null;
      const where = q.done ? (q.turnInName ? `Return to ${q.turnInName}` : '') : next ? `${next.need > 1 ? `${next.cur}/${next.need} ` : ''}${next.text}` : (areas ? q.areaName || '' : '');
      if (where) { const wl = wrap(where, width - 30); rows.push({ kind: 'area', text: wl.length > 1 ? `${wl[0]}...` : wl[0], id: q.id, h: 11 }); }
    }
    return rows;
  }
  const rows = [{ kind: 'head', text: 'Quests', h: 16 }];
  for (const q of (quests || []).slice(0, maxQuests)) {
    const objs = q.objectives || [];
    const count = objs.length === 1 && objs[0].need > 1 ? `${objs[0].cur}/${objs[0].need}` : (q.done ? 'Done' : '');
    const nameW = width - 22 - (count ? textW(count) + 6 : 0);
    const lines = wrap(q.name, nameW);
    lines.forEach((ln, i) => rows.push({ kind: i === 0 ? 'quest' : 'quest2', text: ln, right: i === 0 ? count : '', done: !!q.done, id: q.id, h: 11 }));
    // where to go (CRITIQUE_1 item 9): the objective's area, or who to hand it to
    const where = areas ? (q.done ? (q.turnInName ? `Return to ${q.turnInName}` : '') : q.areaName || '') : '';
    if (where) for (const ln of wrap(where, width - 30).slice(0, 1)) rows.push({ kind: 'area', text: ln, id: q.id, h: 11 });
    if (objs.length > 1) {
      for (const o of objs) {
        const t = `${o.need > 1 ? `${o.cur}/${o.need} ` : ''}${o.text}`;
        for (const ln of wrap(t, width - 30)) rows.push({ kind: 'obj', text: ln, done: o.cur >= o.need, id: q.id, h: 11 });
      }
    }
  }
  return rows;
}

/** Centered menu window rects. */
export function menuRect(id) {
  switch (id) {
    case 'talents': return { x: 40, y: 34, w: 560, h: 316 };
    case 'character': return { x: 24, y: 40, w: 250, h: 270 };
    case 'bags': return { x: 400, y: 120, w: 216, h: 190 };
    case 'quests': return { x: 70, y: 30, w: 500, h: 300 };
    case 'map': return { x: 40, y: 24, w: 560, h: 316 };
    case 'menu': return { x: 170, y: 30, w: 300, h: 300 };
    default: return { x: 120, y: 60, w: 400, h: 240 };
  }
}

/**
 * Talent tree node positions (still 3): three branch columns, 5 tiers. Nodes per tier are spread around the column
 * centre at a pitch of max(42, minHit) px; tiers step max(44, minHit) px.
 */
export function talentLayout(panel, branches, nodesByBranchTier, { minHit = 15, sz = 24 } = {}) {
  const colw = Math.floor((panel.w - 24) / 3);
  const step = Math.max(44, minHit), pitch = Math.max(42, minHit, sz + 6);
  const out = [];
  branches.forEach((b, ci) => {
    const cx0 = panel.x + 12 + ci * colw, mid = cx0 + Math.floor(colw / 2);
    const tiers = nodesByBranchTier[b.id] || [];
    const col = { branch: b.id, x: cx0 + 4, y: panel.y + 50, w: colw - 8, h: panel.h - 66, mid, nodes: [] };
    tiers.forEach((ids, ti) => {
      const y = panel.y + 86 + ti * step;
      const n = ids.length;
      ids.forEach((id, ni) => {
        const cx = Math.round(mid + (ni - (n - 1) / 2) * pitch);
        col.nodes.push({ id, tier: ti + 1, x: cx - sz / 2, y, w: sz, h: sz, cx, cy: y + sz / 2,
          hit: { x: cx - Math.max(sz, minHit) / 2, y: y + sz / 2 - Math.max(sz, minHit) / 2, w: Math.max(sz, minHit), h: Math.max(sz, minHit) } });
      });
    });
    out.push(col);
  });
  return out;
}

/** Bag grid: `n` slots, `cols` per row, pitch max(22, minHit). */
export function bagGrid(rect, n, { minHit = 15 } = {}) {
  const pitch = Math.max(22, minHit);
  const cols = Math.max(1, Math.min(8, Math.floor((rect.w - 16) / pitch)));
  const gx = rect.x + Math.floor((rect.w - cols * pitch) / 2), gy = rect.y + 28;
  return Array.from({ length: n }, (_, i) => ({ i, x: gx + (i % cols) * pitch, y: gy + Math.floor(i / cols) * pitch, w: pitch - 2, h: pitch - 2 }));
}

export const inRect = (r, x, y) => !!r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

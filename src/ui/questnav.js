// Quest navigation (Scott, 2026-11-19: "There should be a way to see where current quests need me to go"). Pure: no
// canvas, so Node tests check it. One quest is the SELECTED quest (picked in the quest log, on the map's list, or by a
// tap on its tracker row; the first tracked quest by default). This file finds where it sends you: its nearest
// objective circle (or its hand-in npc when it is done), and, when that is in another zone, the route through the zone
// joins and the exit to take from the zone you stand in. Everything is in TILES, like the map and the minimap.

/** The selected quest: the picked one while it is still in the log, else the first tracked quest, else null. */
export function selectedQuest(quests, pickedId) {
  const qs = quests || [];
  const picked = pickedId != null ? qs.find((q) => q.id === pickedId) : null;
  if (picked) return picked;
  return qs.find((q) => q.tracked !== false) || null;
}

/** Which edge of the zone a join sits on: 'west', 'east', 'north' or 'south' (the nearest edge for an inner door). */
export function exitSide(zone, j) {
  const cx = j.x + j.w / 2, cy = j.y + j.h / 2;
  const d = { west: cx, east: (zone.w || 0) - cx, north: cy, south: (zone.h || 0) - cy };
  return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
}

/** The fewest-joins route between two zones: [{ from, to, join }] (empty when from === to), or null when none. */
export function zoneRoute(zones, from, to) {
  if (!zones || !zones[from] || !zones[to]) return null;
  if (from === to) return [];
  const prev = { [from]: null };
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const z = q[h];
    for (const j of zones[z].joins || []) {
      if (!zones[j.to] || j.to in prev) continue;
      prev[j.to] = { from: z, to: j.to, join: j };
      if (j.to === to) {
        const out = [];
        for (let s = prev[to]; s; s = prev[s.from]) out.unshift(s);
        return out;
      }
      q.push(j.to);
    }
  }
  return null;
}

/** "Ink Slimes slain" -> "Slay Ink Slimes": what to do, not what is counted. */
function doWords(label) {
  const m = /^(.*) slain$/i.exec(label || '');
  return m ? `Slay ${m[1]}` : label || '';
}

/** What a circle asks of you: "Slay Ink Slimes 2/6", "Hand in to Oren", "Speak with Elder Mael". */
export function whereLabel(w, q) {
  if (!w) return '';
  if (w.turnIn) return q && q.turnInName ? `Hand in to ${q.turnInName}` : 'Hand it in';
  const t = doWords(w.obj || (q && q.name) || '');
  return w.need > 1 ? `${t} ${w.cur || 0}/${w.need}` : t;
}

/** The circle to go to next: the nearest one in your zone, else the one fewest joins away. */
export function questGoal(q, me, zones) {
  const ws = (q && q.wheres) || [];
  if (!ws.length) return null;
  let best = null, bestD = Infinity;
  for (const w of ws) {
    let d;
    if (me && w.zone === me.zone) d = Math.hypot(w.x - me.x, w.y - me.y);
    else {
      const r = me ? zoneRoute(zones, me.zone, w.zone) : null;
      d = r ? 1e5 * r.length : 1e9;
    }
    if (d < bestD) { bestD = d; best = w; }
  }
  return best ? { ...best, label: whereLabel(best, q) } : null;
}

/** "Go to Shepherd's Downs (east exit)", ", then The High Moor" when it takes more than one join. */
export function routeLine(route, zones, zoneNames = {}) {
  if (!route || !route.length) return '';
  const name = (id) => zoneNames[id] || id;
  const s = route[0];
  const side = exitSide(zones[s.from], s.join);
  let t = `Go to ${name(s.to)} (${side} exit)`;
  const last = route[route.length - 1];
  if (route.length > 1) t += `, then ${name(last.to)}`;
  return t;
}

/**
 * Where the selected quest sends you, seen from `me` ({ zone, x, y } tiles):
 *   { quest, goal, route, line, exit, target }
 * goal: the circle ({ zone, x, y, r, label }); route: zoneRoute to the goal's zone; line: routeLine (empty in the
 * goal's zone); exit: the join to take out of your zone ({ zone, x, y, r, side, to }) when the goal is elsewhere;
 * target: what the arrows point at in YOUR zone (the goal, or the exit).
 */
export function questNav(q, me, zones, zoneNames = {}) {
  if (!q) return null;
  const goal = questGoal(q, me, zones);
  if (!goal) return { quest: q.id, goal: null, route: null, line: '', exit: null, target: null };
  const route = me ? zoneRoute(zones, me.zone, goal.zone) : null;
  let exit = null;
  if (route && route.length) {
    const j = route[0].join;
    exit = { zone: me.zone, x: j.x + j.w / 2, y: j.y + j.h / 2, r: Math.max(1.5, Math.max(j.w, j.h) / 2), side: exitSide(zones[me.zone], j), to: j.to };
  }
  const target = me && goal.zone === me.zone ? goal : exit;
  return { quest: q.id, goal, route, line: routeLine(route, zones, zoneNames), exit, target };
}

/** The gold arrow in the world: hidden inside the target circle; shown when the target is off screen or far.
 *  dist and r in tiles; onScreen: the target's HUD point is inside the screen margin. */
export function arrowMode(dist, r, onScreen, far = 9) {
  if (!(dist >= 0)) return 'none';
  if (dist <= Math.max(1, r || 0)) return 'none';
  if (onScreen && dist <= far) return 'pin';
  return 'arrow';
}

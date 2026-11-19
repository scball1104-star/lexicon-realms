// Suggest each quest objective's `where` circles (docs/CONTRACTS.md 7.5) from the zone data (dev tool, read only).
//
//   node tools/maps/quest_where.mjs            prints, per quest and objective, the circles in TILES: [zone, x, y, r]
//   node tools/maps/quest_where.mjs --json     the same as JSON (quest id -> [[circles per objective]])
//
// How a circle is found: kill -> each spawn group of that mob whose levels sit within the quest level -2..+1 (centre of
// the group, radius = the farthest member + its wander + 1); collect -> the item's nodes (one circle round them), or the
// groups of the mobs whose loot table names the item; explore -> the area rectangle's centre, radius half its longer
// side; talk / deliver -> the npc (radius 1.5); escort -> the start (radius 3) and the destination (its own r). The quest
// data (src/data/quests.js) holds the circles as authored values; qa/world/quests.test.mjs checks every objective has
// them and that each circle covers what it should. Re-run this after moving spawns and copy any changed circle by hand.
import { buildContent } from '../../src/data/maps/index.js';

const C = buildContent();
const r1 = (v) => Math.round(v * 2) / 2;

function npcAt(npc) {
  for (const [zid, z] of Object.entries(C.zones)) { const n = (z.npcs || []).find((x) => x.npc === npc); if (n) return [zid, n.x, n.y]; }
  return null;
}
function groupsOf(mob, lo, hi, zoneHint) {
  const out = [];
  for (const [zid, z] of Object.entries(C.zones)) {
    const groups = {};
    for (const s of z.spawns || []) if (s.mob === mob && s.level >= lo && s.level <= hi) (groups[s.group || `${s.x},${s.y}`] = groups[s.group || `${s.x},${s.y}`] || []).push(s);
    for (const [g, list] of Object.entries(groups)) {
      const cx = list.reduce((a, s) => a + s.x, 0) / list.length, cy = list.reduce((a, s) => a + s.y, 0) / list.length;
      const r = Math.max(...list.map((s) => Math.hypot(s.x - cx, s.y - cy) + (s.wander ?? 3))) + 1;
      out.push({ zone: zid, x: r1(cx), y: r1(cy), r: r1(Math.max(3, r)), group: g, n: list.length, hint: zid === zoneHint });
    }
  }
  return out;
}
function nodesOf(item) {
  const out = [];
  for (const [zid, z] of Object.entries(C.zones)) {
    const list = (z.nodes || []).filter((n) => n.item === item);
    if (!list.length) continue;
    const cx = list.reduce((a, s) => a + s.x, 0) / list.length, cy = list.reduce((a, s) => a + s.y, 0) / list.length;
    out.push({ zone: zid, x: r1(cx), y: r1(cy), r: r1(Math.max(...list.map((s) => Math.hypot(s.x - cx, s.y - cy))) + 2), n: list.length });
  }
  return out;
}

/** Groups whose centres sit within `gap` tiles of each other (single link) become one circle covering them all. */
function merge(list, gap = 10) {
  const out = [];
  const left = [...list];
  while (left.length) {
    const cl = [left.shift()];
    for (let k = 0; k < cl.length; k++) for (let i = left.length - 1; i >= 0; i--) {
      if (left[i].zone === cl[k].zone && Math.hypot(left[i].x - cl[k].x, left[i].y - cl[k].y) <= gap) cl.push(...left.splice(i, 1));
    }
    if (cl.length === 1) { out.push(cl[0]); continue; }
    const n = cl.reduce((a, g) => a + (g.n || 1), 0);
    const cx = cl.reduce((a, g) => a + g.x * (g.n || 1), 0) / n, cy = cl.reduce((a, g) => a + g.y * (g.n || 1), 0) / n;
    out.push({ zone: cl[0].zone, x: r1(cx), y: r1(cy), r: r1(Math.max(...cl.map((g) => Math.hypot(g.x - cx, g.y - cy) + g.r))), group: cl.map((g) => g.group).join('+'), n });
  }
  return out;
}
const prefer = (list, zone) => { const own = list.filter((g) => g.zone === zone); return own.length ? own : list; };

export function suggest() {
  const res = {};
  for (const id of C.questOrder) {
    const q = C.quests[id];
    res[id] = q.objectives.map((o) => {
      if (o.kind === 'kill') return merge(prefer(groupsOf(o.mob, q.level - 2, q.level + 1, q.zone), q.zone));
      if (o.kind === 'collect') {
        const nodes = nodesOf(o.item);
        if (nodes.length) return nodes;
        const out = [];
        for (const m of Object.values(C.mobs)) {
          const e = (m.loot.table || []).find((x) => x.item === o.item);
          if (e) out.push(...groupsOf(m.id, Math.max(q.level - 2, e.minLevel || 1), Math.min(q.level + 1, e.maxLevel || 99), q.zone));
        }
        return merge(prefer(out, q.zone));
      }
      if (o.kind === 'explore') {
        const a = (C.zones[o.zone].areas || []).find((x) => x.id === o.area);
        return [{ zone: o.zone, x: r1(a.x + a.w / 2 - 0.5), y: r1(a.y + a.h / 2 - 0.5), r: r1(Math.max(a.w, a.h) / 2) }];
      }
      if (o.kind === 'talk' || o.kind === 'deliver') { const at = npcAt(o.kind === 'talk' ? o.npc : o.to); return at ? [{ zone: at[0], x: at[1], y: at[2], r: 1.5 }] : []; }
      if (o.kind === 'escort') return [{ zone: o.from.zone, x: o.from.x, y: o.from.y, r: 3 }, { zone: o.to.zone, x: o.to.x, y: o.to.y, r: o.to.r }];
      return [];
    });
  }
  return res;
}

if (process.argv[1] && process.argv[1].endsWith('quest_where.mjs')) {
  const s = suggest();
  if (process.argv.includes('--json')) console.log(JSON.stringify(s));
  else for (const [id, objs] of Object.entries(s)) {
    console.log(id);
    objs.forEach((list, i) => console.log(`  ${i}: ${list.map((w) => `[${w.zone} ${w.x},${w.y} r${w.r}${w.group ? ' ' + w.group + ' x' + w.n : ''}]`).join(' ')}`));
  }
}

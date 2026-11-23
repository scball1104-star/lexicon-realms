// Dungeons and caves, render side (pure): the dressing plan both renderers draw from, the doors' facing, the fallback.
import { PLACES, WORLD } from '../../src/data/maps/index.js';
import { DUNGEONS } from '../../src/data/dungeons.js';
import { dungeonPlan, doorMouths, isPlaceZone, cells, DG_KNOWN, DG_WALL } from '../../src/render/dungeon_plan.js';

const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

export const tests = [
  {
    name: 'dungeon plan: every place is dressed, lit, deterministic; wall pieces on rock with floor beside, floor pieces on floor',
    fn() {
      for (const [id, z] of Object.entries(PLACES)) {
        assert(isPlaceZone(z), `${id} is a place`);
        const p = dungeonPlan(z);
        assert(p === dungeonPlan(z), `${id}: cached`);
        const torches = p.props.filter((q) => q.t === 'dg_torch');
        assert(torches.length >= 4, `${id}: lit (${torches.length} torches)`);
        const { solid, floor } = cells(z);
        for (const q of p.props) {
          assert(DG_KNOWN.includes(q.t) || q.t === 'dg_unknown', `${id}: known id ${q.t}`);
          if (DG_WALL.has(q.t)) {
            assert(solid(q.x, q.y), `${id}: ${q.t} at ${q.x},${q.y} is on rock`);
            const [dx, dy] = { s: [0, 1], e: [1, 0], w: [-1, 0], n: [0, -1] }[q.face || 's'];
            assert(floor(q.x + dx, q.y + dy), `${id}: ${q.t} at ${q.x},${q.y} faces floor`);
          } else assert(floor(q.x, q.y), `${id}: ${q.t} at ${q.x},${q.y} is on floor`);
        }
        // nothing on or next to the way out
        for (const j of z.joins) for (const q of p.props) assert(Math.abs(q.x - j.x) > 1 || Math.abs(q.y - j.y) > 1 || DG_WALL.has(q.t), `${id}: ${q.t} clear of the door`);
      }
    },
  },
  {
    name: 'dungeon plan: authored dg_* decor wins, an unknown id falls back, a field zone has no plan',
    fn() {
      const z = { ...PLACES.barrow, decor: [{ t: 'dg_torch', x: 40, y: 48, face: 's' }, { t: 'dg_spooky_thing', x: 41, y: 52 }] };
      const p = dungeonPlan(z);
      assert(p.props.length === 2, 'only the authored pieces');
      assert(p.props[1].t === 'dg_unknown' && p.props[1].id === 'dg_spooky_thing', 'unknown id kept for the fallback');
      assert(dungeonPlan(WORLD).props.length === 0, 'the world has no dungeon dressing');
    },
  },
  {
    name: 'doors: every dungeon and cave door on the world faces away from its rock, with a label',
    fn() {
      const ds = doorMouths(WORLD);
      assert(ds.length === Object.keys(PLACES).filter((k) => !(DUNGEONS[k] && DUNGEONS[k].door.zone)).length, `one door per place (${ds.length})`);
      for (const d of ds) {
        assert(['s', 'w', 'n', 'e'].includes(d.face), `${d.id}: face ${d.face}`);
        assert(d.name && (d.label || d.levels), `${d.id}: name and label`);
      }
      assert(ds.find((d) => d.id === 'barrow').face === 's', 'the Barrow opens to the south');
    },
  },
];

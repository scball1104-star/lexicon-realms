// Host -> guest snapshot frames for online co-op (docs/NET.md). Pure: no DOM, no clock (node tests run it).
//
//   const tx = framesFor(guestId)                 host side, one per guest
//   const msg = tx.frame(snap, events, cache)     after each host tick; cache = createTickCache() shared by all guests
//   const rx = createFrameState(guestId)          guest side
//   const snap = applyFrame(rx, msg)              a full snapshot again (CONTRACTS section 4), for the renderer and UI
//
// A frame carries only what changed since the last frame to that guest: entities new to the view (u, whole), the changed
// fields of entities already there (q, patches: { id, ...fields, $d: [removed keys] }), ids that left the view (x), the guest's own HUD block when it changed (h), projectiles when they changed (p), and this tick's events
// the guest may see (e). The data channel is reliable and ordered, so deltas are safe. What a guest sees:
//   - its own hero: the full entity (bag, quests, talents, build: the UI reads them)
//   - other heroes: trimmed (no bag, quests, talents, stats); gear stays (the 3D hero wears it)
//   - npcs and objects in its zone: always (they change rarely, so they cost almost nothing after the first frame)
//   - foes and projectiles: within VIEW_PX of its hero (square), so a far camp costs nothing
//   - events: its own, and public ones about something in view; another hero's vendor, xp, loot, quest lines stay private

export const VIEW_PX = 960;   // 60 tiles: wider than any zoom shows, so foes never pop in at the screen edge

// fields a friend's hero does not need on another screen
const TRIM = ['bag', 'qbag', 'pendingLoot', 'quests', 'questsDone', 'known', 'talents', 'build', 'stats', 'derived', 'bar', 'cd', 'combo',
  'gold', 'lantern', 'xpToLevel', 'bags', 'gcdUntil'];
// event types that belong to one hero only (menus, bags, quest log, xp)
const PRIVATE = new Set(['interact', 'interact_fail', 'inventory', 'inventory_fail', 'quest', 'loot', 'loot_pending', 'loot_lost', 'gold', 'xp',
  'cmd_reject', 'cast_fail', 'secret_found', 'lantern', 'sit', 'target', 'bounty']);
const PRIVATE_RE = /^(b2_|chest|train|talent|storage|vendor|respec|glyph)/;   // glyph: Inscriptions
const REF_KEYS = ['id', 'src', 'dst', 'killer', 'target', 'tagger'];

/** Event filter for guest `me` with the set of entity ids in its view. */
export function publicFilter(me, visible) {
  return (ev) => {
    if (!ev || typeof ev !== 'object') return false;
    if (ev.id === me || ev.src === me) return true;
    if (PRIVATE.has(ev.type) || PRIVATE_RE.test(ev.type || '')) return false;
    let refs = false;
    for (const k of REF_KEYS) {
      const v = ev[k];
      if (typeof v !== 'number') continue;
      refs = true;
      if (visible.has(v)) return true;
    }
    return !refs;
  };
}

/** Per-tick string cache shared by every guest's frame (each entity is stringified once per tick, not once per guest). */
export function createTickCache() { return { full: new Map(), lite: new Map() }; }

// positions travel as whole sixteenths of a pixel (the sim's own unit): "41985" instead of "2624.0625"
const POS = 16;
function wire(e, lite) {
  const o = { ...e };
  if (lite) for (const k of TRIM) delete o[k];
  if (typeof o.x === 'number') o.x = Math.round(o.x * POS);
  if (typeof o.y === 'number') o.y = Math.round(o.y * POS);
  return o;
}
function strOf(cache, e, lite) {
  const m = lite ? cache.lite : cache.full;
  let v = m.get(e.id);
  if (!v) { const obj = wire(e, lite); v = { obj, s: JSON.stringify(obj), keys: null }; m.set(e.id, v); }
  return v;
}
/** Each top-level field's JSON (computed once per tick per entity, only for entities that changed for someone). */
function keysOf(v) {
  if (!v.keys) { v.keys = new Map(); for (const [k, x] of Object.entries(v.obj)) if (x !== undefined) v.keys.set(k, JSON.stringify(x)); }
  return v.keys;
}

function inView(e, me, viewPx) {
  if (e.kind === 'player') return true;
  if (!me) return e.kind !== 'mob';
  if (e.zone !== me.zone) return false;
  if (e.kind !== 'mob') return true;
  return Math.abs(e.x - me.x) <= viewPx && Math.abs(e.y - me.y) <= viewPx;
}

export function framesFor(me, { viewPx = VIEW_PX } = {}) {
  const sent = new Map();          // id -> { s: the entity JSON last sent, keys: Map field -> JSON }
  let hudStr = null, projStr = '[]';
  return {
    get me() { return me; },
    /** Forget what was sent: the next frame is a full one (after a resync request). */
    reset() { sent.clear(); hudStr = null; projStr = '[]'; },
    frame(snap, events = [], cache = createTickCache()) {
      const meE = snap.entities.find((e) => e.id === me) || null;
      const vis = new Set();
      const u = [], q = [];
      for (const e of snap.entities) {
        if (!inView(e, meE, viewPx)) continue;
        vis.add(e.id);
        const v = strOf(cache, e, e.kind === 'player' && e.id !== me);
        const old = sent.get(e.id);
        if (old && old.s === v.s) continue;
        const keys = keysOf(v);
        if (!old) { u.push(v.obj); sent.set(e.id, { s: v.s, keys }); continue; }
        const patch = { id: e.id };
        for (const [k, js] of keys) if (old.keys.get(k) !== js) patch[k] = v.obj[k];
        const gone = [...old.keys.keys()].filter((k) => !keys.has(k));
        if (gone.length) patch.$d = gone;
        q.push(patch);
        sent.set(e.id, { s: v.s, keys });
      }
      const x = [];
      for (const id of sent.keys()) if (!vis.has(id)) x.push(id);
      for (const id of x) sent.delete(id);
      const msg = { t: 'f', k: snap.tick, d: Math.round(snap.dayTime * 1e6) / 1e6 };
      if (snap.night) msg.n = 1;
      if (u.length) msg.u = u;
      if (q.length) msg.q = q;
      if (x.length) msg.x = x;
      const hud = snap.hud ? snap.hud[me] : null;
      if (hud) { const s = JSON.stringify(hud); if (s !== hudStr) { hudStr = s; msg.h = hud; } }
      if (snap.projectiles) {
        const pr = meE ? snap.projectiles.filter((p) => p.zone === meE.zone && Math.abs(p.x - meE.x) <= viewPx && Math.abs(p.y - meE.y) <= viewPx) : [];
        const s = JSON.stringify(pr);
        if (s !== projStr) { projStr = s; msg.p = pr; }
      }
      const pub = publicFilter(me, vis);
      const ev = events.filter(pub);
      if (ev.length) msg.e = ev;
      return msg;
    },
  };
}

export function createFrameState(me = null) {
  return { me, ents: new Map(), hud: null, proj: [], tick: 0, frames: 0 };
}

/** Apply one frame to the guest's state; returns the rebuilt snapshot (entities in id order). */
export function applyFrame(st, msg) {
  for (const id of msg.x || []) st.ents.delete(id);
  for (const w of msg.u || []) {
    const e = { ...w };
    if (typeof e.x === 'number') e.x /= POS;
    if (typeof e.y === 'number') e.y /= POS;
    st.ents.set(e.id, e);
  }
  for (const p of msg.q || []) {
    const old = st.ents.get(p.id);
    if (!old) continue;                    // cannot happen on an ordered channel; a later whole entity repairs it
    const e = { ...old, ...p };            // a new object: the previous snapshot keeps the old one (interpolation)
    if (typeof p.x === 'number') e.x = p.x / POS;
    if (typeof p.y === 'number') e.y = p.y / POS;
    delete e.$d;
    for (const k of p.$d || []) delete e[k];
    st.ents.set(p.id, e);
  }
  if (msg.h) st.hud = msg.h;
  if (msg.p) st.proj = msg.p;
  st.tick = msg.k;
  st.frames++;
  const entities = [...st.ents.values()].sort((a, b) => a.id - b.id);
  const snap = { v: 2, tick: msg.k, dayTime: msg.d, night: !!msg.n, entities, projectiles: st.proj, hud: {} };
  if (st.hud && st.me != null) snap.hud[st.me] = st.hud;
  return snap;
}

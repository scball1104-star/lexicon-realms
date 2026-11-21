// Keyboard + mouse -> command objects. Produces commands only; never touches the sim or the renderer's state.
//
//   const input = createInput(window, canvas)
//   const cmds = input.poll({ snap, playerId, pick })   once per sim tick; pick(devX, devY) -> entity id | null
//
// Bindings (phase 1; rebinding comes with the options menu):
//   WASD / arrows   move (8 directions). Emits { t:'move', dx, dy } when the held direction changes, { t:'stop' } on release
//   Tab             cycle hostile targets: foes attacking you first (nearest first), then foes in front of you, then the
//                   rest, all within TAB_RANGE_PX (Shift+Tab backwards). Fix wave 2026-11-19, CRITIQUE_1 item 11.
//   left click      target the entity under the cursor
//   right click     on an NPC: target + interact; on anything else: target
//   1-8             { t:'cast', slot: n, target }
//   Esc             clear target
// Losing focus releases every key (no runaway walking).

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
export const TAB_RANGE_PX = 280;      // about the width of the view at zoom 1.5: never a foe you cannot see
export const INTERACT_REACH_PX = 48;   // HUD AGENT EDIT: nearest-NPC search for the Interact intent (sim reach is 40)
export const GCD_QUEUE_S = 0.4;        // a press in the last 0.4 s of the global cooldown waits for it (CRITIQUE_1 item 19)
export const TALK_REACH_PX = 34;       // walking to an npc to talk stops this close (the sim's reach is 40)
const DIR8 = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

export function createInput(keyTarget, canvas, { abilities = {}, classes = {} } = {}) {
  const held = new Set();
  const pending = [];            // raw UI intents gathered between polls
  let lastMove = [0, 0];
  let mouse = null;              // last canvas device-pixel point (ground-targeted casts aim here on desktop)
  let touchMode = false;
  let tabCycle = [];             // ids in the last Tab order, to step through them
  let queued = null;             // a cast pressed near the end of the global cooldown: { intent, until (s of game time) }
  let goal = null;               // tap-to-walk / walk-to-talk: { x, y, reach, then: cmd | null, best, stuck, n }

  const onKey = (down) => (ev) => {
    if (ev.repeat && down) { if (ev.code === 'Tab') ev.preventDefault(); return; }
    if (MOVE_KEYS[ev.code]) { down ? held.add(ev.code) : held.delete(ev.code); ev.preventDefault(); return; }
    if (!down) return;
    if (ev.code === 'Tab') { pending.push({ k: 'tab', back: ev.shiftKey }); ev.preventDefault(); return; }
    if (ev.code === 'Escape') { pending.push({ k: 'clear' }); return; }
    const m = /^Digit([1-8])$/.exec(ev.code);
    if (m) pending.push({ k: 'cast', slot: Number(m[1]) });
  };
  keyTarget.addEventListener('keydown', onKey(true));
  keyTarget.addEventListener('keyup', onKey(false));
  keyTarget.addEventListener('blur', () => held.clear());
  const devPoint = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) * (canvas.width / r.width), (ev.clientY - r.top) * (canvas.height / r.height)];
  };
  canvas.addEventListener('mousemove', (ev) => { mouse = devPoint(ev); });
  canvas.addEventListener('mousedown', (ev) => {
    const [x, y] = devPoint(ev);
    mouse = [x, y];
    if (ev.button === 0) pending.push({ k: 'click', x, y });
    if (ev.button === 2) pending.push({ k: 'rclick', x, y });
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  /**
   * Where a ground-targeted spell lands (world px): the mouse on desktop; on a phone (or with no mouse yet) the current
   * hostile target's feet, else 48 px in front of the player.
   */
  function groundPoint(snap, me, target, toWorld) {
    if (!touchMode && mouse && toWorld) { const [wx, wy] = toWorld(mouse[0], mouse[1]); return { x: Math.round(wx), y: Math.round(wy) }; }
    const t = target != null ? snap.entities.find((o) => o.id === target) : null;
    if (t && t.zone === me.zone && !t.dead && t.kind !== 'npc') return { x: Math.round(t.x), y: Math.round(t.y) };
    const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[me.dir] || [0, 1];
    return { x: Math.round(me.x + d[0] * 48), y: Math.round(me.y + d[1] * 48) };
  }

  /**
   * Hostiles in the player's zone within TAB_RANGE_PX in Tab order: foes attacking you (their target is you) nearest
   * first, then the rest by distance, where a foe in front of you (the way you face, within 60 degrees) counts as 40%
   * nearer; ties by id (deterministic).
   */
  function hostilesByDistance(snap, me) {
    const f = DIR8[me.dir] || [0, 1];
    return snap.entities
      .filter((e) => e.zone === me.zone && !e.dead && e.faction === 'hostile' && e.kind !== 'object')
      .map((e) => {
        const dx = e.x - me.x, dy = e.y - me.y, d = Math.hypot(dx, dy);
        const onMe = e.target === me.id || e.aggro === me.id;
        const front = d > 0 && (dx * f[0] + dy * f[1]) / d >= 0.5;
        return { id: e.id, d, rank: onMe ? 0 : 1, score: front ? d * 0.6 : d };
      })
      .filter((o) => o.d <= TAB_RANGE_PX || o.rank === 0)
      .sort((a, b) => a.rank - b.rank || a.score - b.score || a.id - b.id)
      .map((o) => o.id);
  }

  /** One step of walking toward the goal: a move command when the direction changes, null otherwise. */
  function walkStep(me) {
    const dx = goal.x - me.x, dy = goal.y - me.y, d = Math.hypot(dx, dy);
    if (d <= goal.reach) return 'arrived';
    // stuck: no progress for 1 s -> give up (the player can tap again or use the stick)
    if (d < goal.best - 0.5) { goal.best = d; goal.n = 0; } else if (++goal.n > 20) return 'stuck';
    const t = 0.38;   // tan(22.5 deg): pick the nearest of 8 directions
    const mx = Math.abs(dx) > Math.abs(dy) * t ? Math.sign(dx) : 0;
    const my = Math.abs(dy) > Math.abs(dx) * t ? Math.sign(dy) : 0;
    return [mx, my];
  }

  return {
    /** Synthetic input for headless drivers and tests: same path as real keys. */
    inject(intent) { pending.push(intent); },
    press(code) { if (MOVE_KEYS[code]) held.add(code); },
    release(code) { held.delete(code); },
    /** Phone: ground spells aim at the target (or in front of you) instead of the mouse. */
    setTouch(on) { touchMode = !!on; },
    setMouse(devX, devY) { mouse = [devX, devY]; },

    poll({ snap, playerId, pick, toWorld = null }) {
      const out = [];
      const me = snap && snap.entities.find((e) => e.id === playerId);
      const hud = snap && snap.hud && playerId != null ? snap.hud[playerId] : null;
      const intents = pending.splice(0, pending.length);
      // movement: held keys -> one direction. Keys (or the stick) cancel a tap-to-walk goal.
      let dx = 0, dy = 0;
      for (const c of held) { dx += MOVE_KEYS[c][0]; dy += MOVE_KEYS[c][1]; }
      dx = Math.sign(dx); dy = Math.sign(dy);
      if (held.size) goal = null;
      if (goal && me && !me.dead) {
        const s = walkStep(me);
        if (s === 'arrived' || s === 'stuck') {
          if (s === 'arrived' && goal.then) intents.push({ k: '_cmd', cmd: goal.then });
          goal = null;
        } else [dx, dy] = s;
      } else if (goal) goal = null;
      if (dx !== lastMove[0] || dy !== lastMove[1]) {
        out.push(dx === 0 && dy === 0 ? { t: 'stop' } : { t: 'move', dx, dy });
        lastMove = [dx, dy];
      }
      if (!me) { queued = null; return out; }
      // a cast queued during the global cooldown goes out the tick the cooldown ends
      const gcdLeft = hud ? hud.gcdLeft || 0 : 0;
      const now = (snap.tick || 0) / 20;
      if (queued && (now > queued.until || me.dead)) queued = null;
      if (queued && gcdLeft <= 0.001) { intents.unshift(queued.intent); queued = null; }
      let target = me.target;
      const walkTo = (x, y, reach, then) => { goal = { x, y, reach, then, best: Infinity, n: 0, fresh: true }; };
      for (const it of intents) {
        if (it.k === '_cmd') { out.push(it.cmd); continue; }
        if (it.k === 'tab') {
          const list = hostilesByDistance(snap, me);
          if (!list.length) continue;
          // keep stepping through the previous order while it still holds the current target
          const order = tabCycle.length && tabCycle.includes(target) && list.every((id) => tabCycle.includes(id)) ? tabCycle : list;
          tabCycle = order;
          const i = order.indexOf(target);
          const next = i < 0 ? order[0] : order[(i + (it.back ? order.length - 1 : 1)) % order.length];
          if (next !== target) { target = next; out.push({ t: 'target', id: next }); }
        } else if (it.k === 'attack') {
          // the phone Attack button: auto-attack the target (the nearest foe when none is picked); out of weapon reach,
          // walk in first (melee) so a thumb press always starts a fight
          if (me.dead) continue;
          let t = target != null ? snap.entities.find((o) => o.id === target) : null;
          if (!t || t.kind !== 'mob' || t.faction !== 'hostile' || t.dead) {
            const list = hostilesByDistance(snap, me);
            if (!list.length) continue;
            target = list[0]; out.push({ t: 'target', id: target });
            t = snap.entities.find((o) => o.id === target);
          }
          out.push({ t: 'attack', id: t.id });
          const reach = ((classes[me.cls] || {}).auto || {}).range || 24;
          if (Math.hypot(t.x - me.x, t.y - me.y) > reach - 4) walkTo(Math.round(t.x), Math.round(t.y), Math.max(10, reach - 8), { t: 'attack', id: t.id });
        } else if (it.k === 'clear') {
          if (target != null) { target = null; out.push({ t: 'target', id: null }); }
        } else if (it.k === 'click' || it.k === 'rclick' || it.k === 'tap') {
          // left click: target. right click: an NPC or a quest node -> talk / use; a foe -> attack (auto-attack on).
          // tap (phone): target, and talk to an NPC or use a node (a foe is only targeted; skills start the fight);
          // a tap on empty ground walks there (CRITIQUE_1 item 8)
          const id = pick ? pick(it.x, it.y) : null;
          if (id == null) {
            if (it.k === 'tap' && toWorld && !me.dead) { const [wx, wy] = toWorld(it.x, it.y); walkTo(Math.round(wx), Math.round(wy) + 2, 3, null); }
            continue;
          }
          if (id === me.id) continue;
          const e = snap.entities.find((o) => o.id === id);
          if (it.k === 'rclick' && e && e.kind === 'mob' && e.faction === 'hostile' && !e.dead) { target = id; out.push({ t: 'attack', id }); continue; }
          if (id !== target && !(e && e.kind === 'object' && (e.node || e.chest))) { target = id; out.push({ t: 'target', id }); }
          if ((it.k === 'rclick' || it.k === 'tap') && e && (e.kind === 'npc' || (e.kind === 'object' && (e.node || e.chest)))) {
            const d = Math.hypot(e.x - me.x, e.y - me.y);
            if (it.k === 'tap' && d > INTERACT_REACH_PX - 8) walkTo(e.x, e.y, TALK_REACH_PX, { t: 'interact', id });
            else out.push({ t: 'interact', id });
          }
        } else if (it.k === 'talk') {
          // a click or tap on a quest mark: talk to that npc, walking there first when it is out of reach
          const e = snap.entities.find((o) => o.id === it.id);
          if (!e || e.zone !== me.zone || e.dead) continue;
          if (e.id !== target && e.kind === 'npc') { target = e.id; out.push({ t: 'target', id: e.id }); }
          if (Math.hypot(e.x - me.x, e.y - me.y) <= INTERACT_REACH_PX - 8) out.push({ t: 'interact', id: e.id });
          else walkTo(e.x, e.y, TALK_REACH_PX, { t: 'interact', id: e.id });
        } else if (it.k === 'cast') {
          const abId = it.ability || (me.bar ? me.bar[it.slot - 1] : null);
          // an item on the bar (`item:<id>`): use one from the bags. Items are off the global cooldown; the sim checks
          // the stock and the item's own cooldown group (the potion group shares one)
          if (typeof abId === 'string' && abId.startsWith('item:')) { out.push({ t: 'use_item', item: abId.slice(5) }); continue; }
          const ab = abId ? abilities[abId] : null;
          // the global cooldown: a press in its last GCD_QUEUE_S waits for it; an earlier one is dropped without a word
          const offGcd = ab && ab.gcd === false;
          if (!offGcd && gcdLeft > 0.001 && !it.fromQueue) {
            if (gcdLeft <= GCD_QUEUE_S) queued = { intent: { ...it, fromQueue: true }, until: now + gcdLeft + 0.3 };
            continue;
          }
          // WoW: an attack skill pressed with no live foe targeted (yours just died) takes the nearest foe, the ones
          // fighting you and in front first (Scott 2026-11-20: "apply the same default action as WoW")
          if (ab && ab.target === 'enemy' && !me.dead) {
            const cur = target != null ? snap.entities.find((o) => o.id === target) : null;
            if (!cur || cur.dead || cur.faction !== 'hostile') {
              const list = hostilesByDistance(snap, me);
              if (list.length) { target = list[0]; out.push({ t: 'target', id: target }); }
            }
          }
          if (ab && ab.target === 'ground') {
            out.push({ t: 'cast', slot: it.slot, target: target ?? null, at: groundPoint(snap, me, target, toWorld) });
            continue;
          }
          out.push({ t: 'cast', slot: it.slot, target: target ?? null });
        } else if (it.k === 'interact') {
          // The Interact key (F) and the phone Talk button: the nearest NPC with a quest mark (! or ?) within reach first
          // (CRITIQUE_1 item 21), then the current target when it is an NPC within reach, else the nearest NPC or node.
          let npcId = null;
          const marks = (hud && hud.npcMarkers) || {};
          let bestMark = INTERACT_REACH_PX + 1;
          for (const o of snap.entities) {
            const mk = marks[o.id];
            if (o.kind !== 'npc' || o.zone !== me.zone || o.dead || !(mk === '!' || mk === '?')) continue;
            const d = Math.hypot(o.x - me.x, o.y - me.y);
            if (d < bestMark || (d === bestMark && npcId != null && o.id < npcId)) { bestMark = d; npcId = o.id; }
          }
          const cur = target != null ? snap.entities.find((o) => o.id === target) : null;
          if (npcId != null) { /* a quest giver in reach wins */ }
          else if (cur && cur.kind === 'npc' && Math.hypot(cur.x - me.x, cur.y - me.y) <= INTERACT_REACH_PX) npcId = cur.id;
          else {
            let best = INTERACT_REACH_PX + 1;
            for (const o of snap.entities) {
              if (!(o.kind === 'npc' || (o.kind === 'object' && (o.node || o.chest))) || o.zone !== me.zone || o.dead) continue;
              const d = Math.hypot(o.x - me.x, o.y - me.y);
              if (d < best || (d === best && npcId != null && o.id < npcId)) { best = d; npcId = o.id; }
            }
          }
          if (npcId != null) {
            const isNode = (snap.entities.find((o) => o.id === npcId) || {}).kind === 'object';
            if (npcId !== target && !isNode) { target = npcId; out.push({ t: 'target', id: npcId }); }
            out.push({ t: 'interact', id: npcId });
          }
        }
      }
      // a walk goal set this poll starts this tick (no one-tick lag after a tap)
      if (goal && goal.fresh && !held.size) {
        goal.fresh = false;
        const st = walkStep(me);
        if (Array.isArray(st) && (st[0] !== lastMove[0] || st[1] !== lastMove[1])) { out.push({ t: 'move', dx: st[0], dy: st[1] }); lastMove = st; }
      }
      return out;
    },
  };
}

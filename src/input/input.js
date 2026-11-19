// Keyboard + mouse -> command objects. Produces commands only; never touches the sim or the renderer's state.
//
//   const input = createInput(window, canvas)
//   const cmds = input.poll({ snap, playerId, pick })   once per sim tick; pick(devX, devY) -> entity id | null
//
// Bindings (phase 1; rebinding comes with the options menu):
//   WASD / arrows   move (8 directions). Emits { t:'move', dx, dy } when the held direction changes, { t:'stop' } on release
//   Tab             cycle hostile targets, nearest first (Shift+Tab backwards)
//   left click      target the entity under the cursor
//   right click     on an NPC: target + interact; on anything else: target
//   1-6             { t:'cast', slot: n, target }
//   Esc             clear target
// Losing focus releases every key (no runaway walking).

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
export const TAB_RANGE_PX = 400;
export const INTERACT_REACH_PX = 48;   // HUD AGENT EDIT: nearest-NPC search for the Interact intent (sim reach is 40)

export function createInput(keyTarget, canvas) {
  const held = new Set();
  const pending = [];            // raw UI intents gathered between polls
  let lastMove = [0, 0];
  let tabCycle = [];             // ids in the last Tab order, to step through them

  const onKey = (down) => (ev) => {
    if (ev.repeat && down) { if (ev.code === 'Tab') ev.preventDefault(); return; }
    if (MOVE_KEYS[ev.code]) { down ? held.add(ev.code) : held.delete(ev.code); ev.preventDefault(); return; }
    if (!down) return;
    if (ev.code === 'Tab') { pending.push({ k: 'tab', back: ev.shiftKey }); ev.preventDefault(); return; }
    if (ev.code === 'Escape') { pending.push({ k: 'clear' }); return; }
    const m = /^Digit([1-6])$/.exec(ev.code);
    if (m) pending.push({ k: 'cast', slot: Number(m[1]) });
  };
  keyTarget.addEventListener('keydown', onKey(true));
  keyTarget.addEventListener('keyup', onKey(false));
  keyTarget.addEventListener('blur', () => held.clear());
  const devPoint = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) * (canvas.width / r.width), (ev.clientY - r.top) * (canvas.height / r.height)];
  };
  canvas.addEventListener('mousedown', (ev) => {
    const [x, y] = devPoint(ev);
    if (ev.button === 0) pending.push({ k: 'click', x, y });
    if (ev.button === 2) pending.push({ k: 'rclick', x, y });
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  /** Hostiles in the player's zone within TAB_RANGE_PX, nearest first (ties by id: deterministic). */
  function hostilesByDistance(snap, me) {
    return snap.entities
      .filter((e) => e.zone === me.zone && !e.dead && e.faction === 'hostile')
      .map((e) => ({ id: e.id, d: Math.hypot(e.x - me.x, e.y - me.y) }))
      .filter((o) => o.d <= TAB_RANGE_PX)
      .sort((a, b) => a.d - b.d || a.id - b.id)
      .map((o) => o.id);
  }

  return {
    /** Synthetic input for headless drivers and tests: same path as real keys. */
    inject(intent) { pending.push(intent); },
    press(code) { if (MOVE_KEYS[code]) held.add(code); },
    release(code) { held.delete(code); },

    poll({ snap, playerId, pick }) {
      const out = [];
      const me = snap && snap.entities.find((e) => e.id === playerId);
      // movement: held keys -> one direction
      let dx = 0, dy = 0;
      for (const c of held) { dx += MOVE_KEYS[c][0]; dy += MOVE_KEYS[c][1]; }
      dx = Math.sign(dx); dy = Math.sign(dy);
      if (dx !== lastMove[0] || dy !== lastMove[1]) {
        out.push(dx === 0 && dy === 0 ? { t: 'stop' } : { t: 'move', dx, dy });
        lastMove = [dx, dy];
      }
      const intents = pending.splice(0, pending.length);
      if (!me) return out;
      let target = me.target;
      for (const it of intents) {
        if (it.k === 'tab') {
          const list = hostilesByDistance(snap, me);
          if (!list.length) continue;
          // keep stepping through the previous order while it still holds the current target
          const order = tabCycle.length && tabCycle.includes(target) && list.every((id) => tabCycle.includes(id)) ? tabCycle : list;
          tabCycle = order;
          const i = order.indexOf(target);
          const next = i < 0 ? order[0] : order[(i + (it.back ? order.length - 1 : 1)) % order.length];
          if (next !== target) { target = next; out.push({ t: 'target', id: next }); }
        } else if (it.k === 'clear') {
          if (target != null) { target = null; out.push({ t: 'target', id: null }); }
        } else if (it.k === 'click' || it.k === 'rclick') {
          const id = pick ? pick(it.x, it.y) : null;
          if (id == null || id === me.id) continue;
          if (id !== target) { target = id; out.push({ t: 'target', id }); }
          const e = snap.entities.find((o) => o.id === id);
          if (it.k === 'rclick' && e && e.kind === 'npc') out.push({ t: 'interact', id });
        } else if (it.k === 'cast') {
          out.push({ t: 'cast', slot: it.slot, target: target ?? null });
        } else if (it.k === 'interact') {
          // HUD AGENT EDIT 2026-11-19: the Interact key (F) and the phone Talk button. Talk to the current target when
          // it is an NPC, else the nearest NPC within reach (targeting it first so the HUD shows who you talk to).
          let npcId = null;
          const cur = target != null ? snap.entities.find((o) => o.id === target) : null;
          if (cur && cur.kind === 'npc') npcId = cur.id;
          else {
            let best = INTERACT_REACH_PX + 1;
            for (const o of snap.entities) {
              if (o.kind !== 'npc' || o.zone !== me.zone || o.dead) continue;
              const d = Math.hypot(o.x - me.x, o.y - me.y);
              if (d < best || (d === best && npcId != null && o.id < npcId)) { best = d; npcId = o.id; }
            }
          }
          if (npcId != null) {
            if (npcId !== target) { target = npcId; out.push({ t: 'target', id: npcId }); }
            out.push({ t: 'interact', id: npcId });
          }
        }
      }
      return out;
    },
  };
}

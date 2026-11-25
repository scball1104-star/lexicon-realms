// The emote ring (wave 7 anim lane, approved 2026-11-24): Wave, Cheer, Sit, Dance, Jump. Desktop: G opens it (Space
// jumps straight away, both rebindable in Options), 1 to 5 or a click picks, G, Esc or a click outside closes. Phone: a
// long press on your own portrait opens it (a normal tap never does: touch.js only calls setLongTip after 0.45 s held),
// a tap picks, a tap outside closes. Co-op: /wave /cheer /sit /dance /jump in party chat (sim/emotes.js emoteFromChat).
// Drawn with the g.* calls, so the UI skin and Text size apply. Sends ordinary commands: { t: 'emote', id } or { t: 'sit' }.
//
//   const E = createEmoteUI({ g, st, send, say })      st: the UI state (st.emoteRing, st.dialog, st.metrics.touch)
//   E.key(ev, binds, model) -> true when it used the key       E.longPress(region) -> true when it opened the ring
//   E.draw(ctx, L, regions, model)                              E.onEvent(ev, me) -> true when it handled the event
import { effectiveBinds, actionFor } from './keymap.js';

/** The ring, in order round from the top. Player-facing labels (draft). */
export const RING = [
  { id: 'wave', label: 'Wave', cmd: { t: 'emote', id: 'wave' } },
  { id: 'cheer', label: 'Cheer', cmd: { t: 'emote', id: 'cheer' } },
  { id: 'sit', label: 'Sit', cmd: { t: 'sit' } },
  { id: 'dance', label: 'Dance', cmd: { t: 'emote', id: 'dance' } },
  { id: 'jump', label: 'Jump', cmd: { t: 'emote', id: 'jump' } },
];
const SAY = { combat: 'Not while in combat.', mounted: 'Not while riding.', busy: 'Not while you work.' };   // drafts

/** What a picked ring entry does given the hero's state: the command, or a line to say instead. Pure (tests). */
export function ringPick(id, player) {
  const it = RING.find((r) => r.id === id);
  if (!it) return null;
  if (player && player.inCombat && id !== 'jump') return { say: id === 'sit' ? "You can't rest in combat." : SAY.combat };
  return { cmd: { ...it.cmd } };
}

/** Ring button centres round (cx, cy), radius r, from the top, clockwise. Pure. */
export function ringSpots(cx, cy, r, n = RING.length) {
  return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI * 2) / n; return [Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]; });
}

/** wave 8 photo: the phone ring's sixth button (photo: () => opens photo mode; it says why when it cannot). Draft label. */
export const RING_PHOTO = { id: 'photo', label: 'Photo' };

export function createEmoteUI({ g, st, send, say = () => {}, photo = null }) {
  const open = (touch) => { st.emoteRing = { t0: st.now || 0, touch: !!touch }; return true; };
  const close = () => { st.emoteRing = null; };
  let model = null;
  function pick(id) {
    const r = ringPick(id, model && model.player);
    close();
    if (!r) return;
    if (r.say) say('error', r.say); else send(r.cmd);
  }
  return {
    open, close, pick,
    get isOpen() { return !!st.emoteRing; },
    /** keydown in play, before the key routing: Space jumps, G toggles the ring, 1 to 5 and Esc while it is open */
    key(ev, binds, m) {
      if (ev.repeat) return !!st.emoteRing && /^Digit[1-5]$/.test(ev.code);
      model = m || model;
      const act = actionFor(ev.code, effectiveBinds(binds || {}));
      if (st.emoteRing) {
        const d = /^Digit([1-5])$/.exec(ev.code);
        if (d) { pick(RING[Number(d[1]) - 1].id); return true; }
        if (ev.code === 'Escape' || act === 'emotes') { close(); return true; }
      }
      if (act === 'jump') { if (!st.dialog && !st.mirror) pick('jump'); return true; }    // the npc window keeps Space quiet
      if (act === 'emotes') { if (!st.dialog && !st.mirror) open(false); return true; }
      return false;
    },
    /** the phone: a long press on your own portrait (touch.js setLongTip) */
    longPress(region) { return !!(region && region.kind === 'player' && st.mode === 'game' && !st.mirror && open(true)); },
    onEvent(ev, me) {
      if (ev.type !== 'cmd_reject' || ev.cmd !== 'emote' || ev.id !== me) return false;
      if (SAY[ev.reason]) say('error', SAY[ev.reason]);
      return true;
    },
    draw(ctx, L, regions, m) {
      model = m || model;
      const p = m && m.player;
      if (!st.emoteRing) return;
      if (!p || p.dead || st.mirror) { close(); return; }
      const touch = !!L.touch;
      const ring = touch && photo ? [...RING, RING_PHOTO] : RING;   // wave 8 photo: the phone's way in (desktop: the P key)
      const bh = Math.max(g.ls(16), touch ? L.minHit || 0 : 0);
      const labels = ring.map((it, i) => (touch ? it.label : `${i + 1} ${it.label}`));
      const bw = Math.max(touch ? L.minHit || 0 : 0, ...labels.map((s) => g.textW(s))) + 14;
      const r = Math.round(Math.max(touch ? bh * 1.35 : 38, bw * 1.05) * (ring.length > 5 ? 1.2 : 1));   // six round: a wider ring
      // desktop: over the hero, a little low of centre; phone: just under the portrait
      let cx = touch ? L.player.x + Math.round(L.player.w / 2) + 30 : Math.round(L.W / 2);
      let cy = touch ? L.player.y + L.player.h + r + Math.round(bh / 2) + 6 : Math.round(L.H * 0.56);
      const mx = r + Math.ceil(bw / 2) + 4, my = r + Math.ceil(bh / 2) + 4;
      cx = Math.max(mx, Math.min(L.W - mx, cx)); cy = Math.max(my, Math.min(L.H - my - g.lh, cy));
      // the backdrop: a click or tap outside the buttons closes the ring (and does nothing else)
      regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'window', id: 'emote_ring', on: () => close() });
      g.scrim(ctx, cx - r - bw / 2 - 6, cy - r - bh / 2 - 6, 2 * r + bw + 12, 2 * r + bh + 12 + g.lh, 70);
      g.text(ctx, 'Emotes', cx, cy - Math.round(g.lh / 2), 'gold', { align: 'center' });
      ringSpots(cx, cy, r, ring.length).forEach(([x, y], i) => {
        const it = ring[i], off = p.inCombat && it.id !== 'jump';
        const bx = Math.round(x - bw / 2), by = Math.round(y - bh / 2);
        g.window(ctx, bx, by, bw, bh, 'thin', off ? 'slate' : 'ember', 0.95);
        g.text(ctx, labels[i], x, by + Math.round((bh - g.lh) / 2) + 1, off ? 'gray' : 'cream', { align: 'center' });
        regions.push({ rect: { x: bx, y: by, w: bw, h: bh }, kind: 'button', label: `emote:${it.id}`, on: () => (it === RING_PHOTO ? (close(), photo(p)) : pick(it.id)) });
      });
      const hint = touch ? 'Tap outside to close' : 'G or Esc: close';
      g.text(ctx, hint, cx, cy + r + Math.round(bh / 2) + 3, 'gray', { align: 'center' });
    },
  };
}

// Onboarding hints (wave 7, PLAN item 13: "the first 10 minutes teach movement, targeting, interrupt and rez by doing").
// A short line appears the first time the player needs a thing (walk, talk to a quest giver, follow the arrow, target a
// foe, use a skill, interrupt a cast, look at loot, rest when hurt, rez a friend) and goes the moment they do it. Each one is remembered
// per hero in the save (`tips` on the stored character, src/ui/save.js) and never shown again; a player who does the
// thing before its hint would show never sees it. Help (H, or the ? button) has the switch that turns them all off
// (options.hints === false). The text uses the player's own key bindings on a PC and the phone's own buttons on a phone,
// and lights the button it names. All wording here is a DRAFT for Scott (listed in the wave 7 onboard report).
//
//   const ob = createOnboard({ g, store, options: () => options, hooks })
//   ob.start(char)                       entering the world with a stored hero (ui.js act.enter)
//   ob.stop()                            logout
//   ob.frame(st, m, snap, playerId, t, L, busy)   once a draw: decides which hint shows (m = the HUD model)
//   ob.draw(ctx, L, regions, t)          the hint and the light on its button (after the HUD and windows, under toasts)
//   ob.onEvent(ev, me)                   sim events: the things the player did
//   ob.state                             { show, done, ... } for drivers and tests
//
// Never in the way: no pause, no input taken, one short box above the bar (desktop) or under the menu buttons (phone),
// hidden while a window, the npc window or talk panel, the boss card, the level-up banner or a death is up. Its x (a
// thumb-sized corner on a phone) puts that hint away for good; a click or tap elsewhere on it goes through to the world.
import { effectiveBinds, keyLabel } from './keymap.js';
import { ABILITIES } from '../data/abilities.js';
import { B2_ABILITIES } from '../data/builds2.js';

export const TIP_IDS = ['move', 'talk', 'follow', 'target', 'ability', 'interrupt', 'loot', 'rest', 'rez'];
// first that applies wins: a friend down and a spell to break come before anything else; walking before talking
export const PRIORITY = ['rez', 'interrupt', 'ability', 'target', 'rest', 'move', 'talk', 'loot', 'follow'];
export const SHOW_DELAY = { move: 1.5, talk: 0.8, follow: 1.2, target: 0.4, ability: 0.6, interrupt: 0.15, loot: 0.3, rest: 1.0, rez: 0.5 };
export const REST_BELOW = 0.5;    // out of a fight under half health: the rest hint
export const SNOOZE_AFTER = 25;     // shown this long and still not done: put away for SNOOZE_FOR (never nag)
export const SNOOZE_FOR = 60;
export const LOOT_SECS = 8;
export const MOVE_DONE_PX = 32;     // two tiles from where the hero came in
export const FOLLOW_DONE_PX = 160;  // ten tiles walked while the arrow showed the way
export const FOE_NEAR_PX = 7 * 16;
export const GIVER_NEAR_PX = 24 * 16;   // no quest yet: a gold ! this close counts though it is off screen

/** Ability ids that break a cast (an `interrupt` effect): Shield Bash, Inkstep, the Builds 2 picks. */
export const INTERRUPTS = new Set(Object.values({ ...ABILITIES, ...B2_ABILITIES })
  .filter((a) => a && (a.effects || []).some((fx) => fx && fx.type === 'interrupt')).map((a) => a.id));

/** The done list a stored hero starts with: a hero from before hints existed (it has seen the old controls card) has
 *  done them all; a new hero none. */
export function tipsFor(char) {
  if (!char) return new Set(TIP_IDS);
  if (Array.isArray(char.tips)) return new Set(char.tips.filter((id) => TIP_IDS.includes(id)));
  return char.hinted ? new Set(TIP_IDS) : new Set();
}

/** The words of a hint: [line, line?]. touch: the phone's buttons; binds: the player's own keys. ctx: names. */
export function tipText(id, { touch = false, binds = {}, ctx = {} } = {}) {
  const b = effectiveBinds(binds || {});
  const k = (a) => keyLabel(b[a]);
  switch (id) {
    case 'move': return touch
      ? ['Drag your left thumb to walk, or tap the ground.', 'The ? button shows every control.']
      : [`Walk with ${k('move_up')} ${k('move_left')} ${k('move_down')} ${k('move_right')} or the arrow keys.`, `Press ${k('help')} any time to see every control.`];
    case 'talk': return touch
      ? ['A gold ! means a quest. Tap them, or walk up and tap Talk.']
      : [`A gold ! means a quest. Walk up and press ${k('interact')}, or right-click them.`];
    case 'follow': return touch
      ? ['Follow the gold arrow at your feet.', 'Tap a quest at the top right to see it on the map.']
      : ['Follow the gold arrow at your feet.', 'Click a quest on the right to see it on the map.'];
    case 'target': return touch
      ? ['A foe! Tap it to target it, or tap Next.']
      : [`A foe! Press ${k('next_target')} or click it to target it.`];
    case 'ability': {
      if (ctx.attack) return touch
        ? [`Tap the sword to attack. Your hits fill ${ctx.res || 'Resolve'}, then your skills light up.`]
        : [`Right-click the foe to attack. Your hits fill ${ctx.res || 'Resolve'}, then your skills light up.`];
      const nm = ctx.ability || 'a skill';
      return touch
        ? [`Tap ${nm} (lit up) to use it on your foe.`]
        : [`Press ${ctx.slot ? k(`slot${ctx.slot}`) : k('slot1')} to use ${nm}. Your skills are on the bar.`];
    }
    case 'interrupt': {
      const nm = ctx.ability || 'your interrupt';
      return touch
        ? [`It is casting! Tap ${nm} (lit up) to stop the spell.`]
        : [`It is casting! Press ${ctx.slot ? k(`slot${ctx.slot}`) : '?'} (${nm}) to stop the spell.`];
    }
    case 'loot': return touch
      ? ['Loot goes straight into your bags. Tap the bag button.']
      : [`Loot goes straight into your bags. Press ${k('bags')} to look.`];
    case 'rest': return touch
      ? ['Hurt? Out of a fight you heal on your own. Wait a moment before the next foe.']
      : [`Hurt? Press ${k('sit')} to sit and heal faster before the next fight.`];
    case 'rez': {
      const nm = ctx.name || 'A friend';
      return touch
        ? [`${nm} is down. Tap Rez on their frame (out of combat).`]
        : [`${nm} is down. Click Rez on their frame (out of combat, 10 s).`];
    }
    default: return [];
  }
}

/**
 * Which hints could show now (pure, so Node tests check it). s: { me (snapshot entity), m (HUD model), marksOnScreen
 * (gold ! marks on the layer), foeNear (a live hostile foe within FOE_NEAR_PX), goalArrow (st.goalArrow), lootUntil, t,
 * bagsOpen }. Returns [{ id, ctx }] (frame() sorts them by PRIORITY), not yet filtered by done or snooze.
 */
export function tipCandidates(s) {
  const out = [];
  const { me, m } = s;
  if (!me || me.dead || !m || !m.player) return out;
  const bar = (m.bar || []).filter((b) => b && b.ability);
  const hostileTarget = !!(m.target && m.target.faction === 'hostile' && !m.target.dead);
  // rez: a friend is down where you can rez them (src/ui/group_ui.js partyExtras shows the same Rez button)
  const grp = m.group;
  if (grp && (grp.canRez || grp.ash > 0)) {
    const down = (m.party || []).find((u) => {
      const p = (grp.party || []).find((x) => x.id === u.id);
      return u.dead && p && !p.released && !p.rezBy;
    });
    if (down) out.push({ id: 'rez', ctx: { name: down.name, unit: down.id } });
  }
  // interrupt: the foe you target is casting something you can break, and your interrupt is ready
  const tc = m.targetCast;
  if (hostileTarget && tc && tc.interruptible && (tc.left == null || tc.left >= 0.5)) {
    const ib = bar.find((b) => INTERRUPTS.has(b.ability) && !(b.cdLeft > 0) && b.usable !== false);
    if (ib) out.push({ id: 'interrupt', ctx: { slot: ib.slot, ability: ib.name || ib.ability, id: ib.ability } });
  }
  if (hostileTarget) {
    // the first skill that can be used now; a new Warden starts at 0 Resolve, so none can: attack first (the playtest)
    const ready = bar.filter((b) => b.usable !== false && !(b.cdLeft > 0));
    const first = ready.find((b) => !INTERRUPTS.has(b.ability)) || ready[0];
    if (first) out.push({ id: 'ability', ctx: { slot: first.slot, ability: first.name || first.ability, id: first.ability } });
    else if (bar.length && !s.autoOn) out.push({ id: 'ability', ctx: { attack: true, res: (m.player && m.player.resWord) || 'Resolve' } });
  }
  if (!hostileTarget && s.foeNear) out.push({ id: 'target', ctx: {} });
  const p = m.player;
  if (!p.inCombat && !p.sitting && p.hpMax > 0 && p.hp / p.hpMax < REST_BELOW) out.push({ id: 'rest', ctx: {} });
  if (s.marksOnScreen) out.push({ id: 'talk', ctx: {} });
  if (s.lootUntil != null && s.t < s.lootUntil && !s.bagsOpen) out.push({ id: 'loot', ctx: {} });
  if ((m.quests || []).length && s.goalArrow && s.goalArrow.mode === 'arrow') out.push({ id: 'follow', ctx: {} });
  out.push({ id: 'move', ctx: {} });
  return out;
}

export function createOnboard({ g, store, options, hooks = {} }) {
  const S = {
    on: false, charId: null, done: new Set(), show: null, pending: null, snooze: {}, spawn: null, followFrom: null, lootUntil: null,
    t: 0, touch: false, sawSlot: null, light: null,
  };
  const enabled = () => S.on && (options() || {}).hints !== false;
  function markDone(id) {
    if (!id || S.done.has(id)) return;
    S.done.add(id);
    if (S.show && S.show.id === id) S.show = null;
    if (S.pending && S.pending.id === id) S.pending = null;
    if (store && S.charId != null && store.get(S.charId)) store.update(S.charId, { tips: TIP_IDS.filter((x) => S.done.has(x)) });
  }

  const ob = {
    get state() { return S; },
    markDone,
    start(char) {
      S.on = !!char; S.charId = char ? char.id : null; S.done = tipsFor(char); S.show = null; S.pending = null; S.snooze = {};
      S.spawn = null; S.followFrom = null; S.lootUntil = null; S.restSeen = false;
      // a new hero keeps its list in the save from the start (so a hero made today is never taken for an old one)
      if (char && !Array.isArray(char.tips) && store) store.update(char.id, { tips: TIP_IDS.filter((x) => S.done.has(x)) });
    },
    stop() { S.on = false; S.charId = null; S.show = null; S.pending = null; },
    /** True while a hero who has not done every hint plays with hints on (ui.js: the old controls card stays away). */
    get live() { return enabled() && S.done.size < TIP_IDS.length; },
    frame(st, m, snap, playerId, t, L, busy) {
      S.t = t; S.touch = !!(L && L.touch);
      S.toastUp = !!(st.toast && st.toast.until > t);   // a phone's toast sits under the menu buttons too: the hint steps below it
      if (!S.on || playerId == null || !snap) { S.show = null; return; }
      const me = snap.entities.find((e) => e.id === playerId) || null;
      if (!me) { S.show = null; return; }
      // things done whether or not their hint is up (a player who knows the game never sees them)
      if (!S.spawn || S.spawn.zone !== me.zone) S.spawn = { zone: me.zone, x: me.x, y: me.y };
      if (!S.done.has('move') && Math.hypot(me.x - S.spawn.x, me.y - S.spawn.y) >= MOVE_DONE_PX) markDone('move');
      const tgt = me.target != null ? snap.entities.find((e) => e.id === me.target) : null;
      if (tgt && tgt.kind === 'mob' && tgt.faction === 'hostile') markDone('target');
      if (st.open && st.open.has('bags')) markDone('loot');
      const arrow = st.goalArrow;
      if (!S.done.has('follow') && m && (m.quests || []).length && arrow && arrow.mode === 'arrow') {
        if (!S.followFrom) S.followFrom = { x: me.x, y: me.y };
        else if (Math.hypot(me.x - S.followFrom.x, me.y - S.followFrom.y) >= FOLLOW_DONE_PX) markDone('follow');
      }
      if (!S.done.has('follow') && arrow && arrow.mode === 'pin' && S.followFrom) markDone('follow');
      // rest: sitting (the sim's sit event, onEvent) or, on a phone that has no sit button, healing back once it showed
      if (S.show && S.show.id === 'rest') S.restSeen = true;
      if (!S.done.has('rest') && S.restSeen && m && m.player && m.player.hpMax > 0 && m.player.hp / m.player.hpMax >= 0.9) markDone('rest');
      if (S.pin) return;          // drivers only (the after sheet's staged frames): hold the hint they set
      if (!enabled() || busy) { S.show = null; S.pending = null; return; }
      // the facts the hints need
      let marksOnScreen = !S.done.has('talk') && hooks.worldMarks ? hooks.worldMarks().some((k) => k.mark === '!' && k.x >= 0 && k.y >= 0 && k.x <= L.W && k.y <= L.H) : false;
      // a hero with no quest yet whose first giver stands just off screen (Hob in Willowmere is 14 tiles away)
      if (!marksOnScreen && !S.done.has('talk') && m && !(m.quests || []).length) {
        const marks = (snap.hud && snap.hud[playerId] && snap.hud[playerId].npcMarkers) || {};
        marksOnScreen = Object.entries(marks).some(([id, k]) => {
          if (k !== '!') return false;
          const e = snap.entities.find((o) => o.id === Number(id));
          return !!e && e.zone === me.zone && Math.hypot(e.x - me.x, e.y - me.y) <= GIVER_NEAR_PX;
        });
      }
      let foeNear = false;
      if (!S.done.has('target')) {
        for (const e of snap.entities) {
          if (e.kind !== 'mob' || e.dead || e.zone !== me.zone || e.faction !== 'hostile') continue;
          if (Math.hypot(e.x - me.x, e.y - me.y) <= FOE_NEAR_PX) { foeNear = true; break; }
        }
      }
      const cands = tipCandidates({ me, m, autoOn: !!(me.autoOn || (m.player && m.player.autoOn)), marksOnScreen, foeNear, goalArrow: arrow, lootUntil: S.lootUntil, t, bagsOpen: st.open && st.open.has('bags') })
        .filter((c) => !S.done.has(c.id) && !(S.snooze[c.id] > t))
        .sort((a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id));
      const c = cands[0] || null;
      if (S.show && (!c || c.id !== S.show.id)) {
        // a hint whose moment passed goes (it comes back the next time it is needed)
        if (!cands.some((x) => x.id === S.show.id)) S.show = null;
      }
      if (S.show && t - S.show.t0 > SNOOZE_AFTER) { S.snooze[S.show.id] = t + SNOOZE_FOR; S.show = null; return; }
      if (c && (!S.show || (c.id !== S.show.id && PRIORITY.indexOf(c.id) < PRIORITY.indexOf(S.show.id)))) {
        if (!S.pending || S.pending.id !== c.id) S.pending = { id: c.id, t0: t };
        if (t - S.pending.t0 >= (SHOW_DELAY[c.id] || 0.5)) { S.show = { id: c.id, ctx: c.ctx, t0: t }; S.pending = null; }
      } else if (S.show && c && c.id === S.show.id) S.show.ctx = c.ctx;
      if (!c) S.pending = null;
    },
    onEvent(ev, me) {
      if (!S.on || me == null) return;
      switch (ev.type) {
        case 'interact': if (ev.src === me) markDone('talk'); return;
        case 'quest': if (ev.id === me && ev.kind === 'accept') markDone('talk'); return;
        case 'cast_start':
          if (ev.src !== me || !ev.ability || ev.ability === 'auto' || /^item:|lantern|mount|quest_channel/.test(ev.ability)) return;
          if (INTERRUPTS.has(ev.ability)) { if (S.show && S.show.id === 'interrupt') markDone('interrupt'); return; }
          markDone('ability');
          return;
        case 'school_lock': if (ev.by === me) markDone('interrupt'); return;
        case 'loot':
          if (ev.id === me && ev.from != null && !ev.gather && !ev.skin && ((ev.items || []).length || ev.gold) && !S.done.has('loot')) S.lootUntil = S.t + LOOT_SECS;
          return;
        case 'rez': if (ev.src === me && ev.kind === 'start') markDone('rez'); return;
        case 'sit': if (ev.id === me) markDone('rest'); return;
        default:
      }
    },
    /** Where the hint box sits: desktop above the cast bar, bottom centre; phone under the menu buttons, centred on
     *  the space between the frames and the minimap (clear of the hero, the thumbs and the talk panel). */
    rect(L, w, h) {
      if (L.touch) {
        const top = (L.menuBar && L.menuBar[0] ? L.menuBar[0].y + L.menuBar[0].h : 26) + 3 + (S.toastUp ? 24 : 0);
        const left = (L.player ? L.player.x + L.player.w : 154) + 4, right = (L.minimap ? L.minimap.x : L.W - 70) - 4;
        const ww = Math.min(w, right - left);
        return { x: Math.round(left + (right - left - ww) / 2), y: top, w: ww, h };
      }
      const y = (L.cast ? L.cast.y : L.H - 64) - 6 - h;
      return { x: Math.floor((L.W - w) / 2), y, w, h };
    },
    /** The widest the box may be: a phone's gap between the frames and the minimap; on a PC centred clear of the chat. */
    maxW(L) {
      if (L.touch) return Math.max(120, ((L.minimap ? L.minimap.x : L.W) - (L.player ? L.player.x + L.player.w : 154)) - 8);
      const chatR = L.chat ? L.chat.x + L.chat.w + 4 : 0;
      return Math.max(200, Math.min(360, L.W - 2 * chatR));
    },
    draw(ctx, L, regions, t) {
      S.light = null;
      if (!S.show || !enabled()) return;
      const sh = S.show;
      const lines = tipText(sh.id, { touch: L.touch, binds: (options() || {}).binds, ctx: sh.ctx });
      if (!lines.length) return;
      const lh = g.lh || 11, padX = 8, xw = 10;
      const maxW = ob.maxW(L);
      const wrapped = [];
      for (const ln of lines) wrapped.push(...g.wrap(ln, maxW - padX * 2 - xw));
      const w = Math.min(maxW, Math.max(...wrapped.map((s) => g.textW(s))) + padX * 2 + xw);
      const h = wrapped.length * lh + 8;
      const r = ob.rect(L, w, h);
      const age = t - sh.t0, a = Math.min(1, age / 0.2);
      ctx.save();
      ctx.globalAlpha = a;
      g.window(ctx, r.x, r.y, r.w, r.h, 'thin', 'ember', 0.94);
      wrapped.forEach((s, i) => g.text(ctx, s, r.x + padX, r.y + 4 + i * lh, i === 0 ? 'gold' : 'cream'));
      g.text(ctx, 'x', r.x + r.w - 7, r.y + 3, 'dim', { align: 'center', small: true });
      ctx.restore();
      // a click or tap on the box itself still reaches the world (a foe under it must stay tappable): only its x
      // puts it away, a thumb-sized square on a phone
      const xs = L.touch ? Math.max(18, L.minHit || 0) : 14;
      const hitR = { x: r.x + r.w - xs, y: r.y, w: xs, h: L.touch ? xs : Math.min(r.h, 14) };
      regions.push({ rect: hitR, kind: 'window', id: 'onb', label: `onb:${sh.id}`, on: () => markDone(sh.id),
        tip: { title: 'Hint', sub: `${L.touch ? 'Tap' : 'Click'} the x to put it away. Help turns hints off.` } });
      // light the button the hint names (a pulse round it): a bar slot or cluster button, Next, the bags, the Rez button
      const want = sh.id === 'ability' && sh.ctx.attack ? (L.touch ? (o) => o.kind === 'attack' : null)
        : sh.id === 'ability' || sh.id === 'interrupt' ? (o) => o.kind === 'slot' && o.slot === sh.ctx.slot
        : sh.id === 'target' && L.touch ? (o) => o.kind === 'next_target'
          : sh.id === 'loot' && L.touch ? (o) => o.kind === 'menu_button' && o.id === 'bags'
            : sh.id === 'talk' && L.touch ? (o) => o.kind === 'interact'
              : sh.id === 'rez' ? (o) => o.label === `grp:rez:${sh.ctx.unit}` : null;
      const hit = want ? regions.find(want) : null;
      if (hit) {
        const b = hit.rect, on = Math.floor(t * 3) % 2 === 0;
        g.outline(ctx, b.x - 2, b.y - 2, b.x + b.w + 1, b.y + b.h + 1, on ? '#ffd34d' : '#b8862b');
        g.outline(ctx, b.x - 1, b.y - 1, b.x + b.w, b.y + b.h, on ? '#fff3b0' : '#ffd34d');
        S.light = { kind: hit.kind, slot: hit.slot || null, id: hit.id || hit.label || null };
      }
    },
  };
  return ob;
}

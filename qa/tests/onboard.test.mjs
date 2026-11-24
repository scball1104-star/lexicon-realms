// Onboarding hints (wave 7, PLAN item 13): by-doing hints for a new hero, remembered per hero, the player's own keys and
// the phone's own buttons, never over the npc window or the boss card, off from Help. Pure: no browser.
import { assert, eq } from './_helpers.mjs';
import { createOnboard, tipsFor, tipText, tipCandidates, INTERRUPTS, TIP_IDS, PRIORITY, SHOW_DELAY, SNOOZE_AFTER } from '../../src/ui/onboard.js';
import { createCharStore, DEFAULT_OPTIONS } from '../../src/ui/save.js';
import { rebind } from '../../src/ui/keymap.js';
import { hudLayout } from '../../src/ui/layout.js';
import { drawHelp } from '../../src/ui/help.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
// a fake gfx: every drawing call is a no-op, text is 5 px a letter
const fakeG = new Proxy({ lh: 11, textW: (s) => String(s).length * 5,
  wrap: (s, w) => { const out = []; let ln = ''; for (const word of String(s).split(' ')) { const t = ln ? `${ln} ${word}` : word; if (t.length * 5 > w && ln) { out.push(ln); ln = word; } else ln = t; } if (ln) out.push(ln); return out; },
  clip: (s) => s, ls: (n) => n }, { get: (o, k) => (k in o ? o[k] : () => 0) });
const fakeCtx = () => new Proxy({}, { get: () => () => 0, set: () => true });

const hero = (over = {}) => ({ id: 1, kind: 'player', zone: 'world', x: 1000, y: 1000, dead: false, target: null, ...over });
const foe = (over = {}) => ({ id: 50, kind: 'mob', faction: 'hostile', zone: 'world', x: 1040, y: 1000, dead: false, ...over });
const bar = [{ slot: 1, ability: 'warden_strike', name: 'Strike', cdLeft: 0, usable: true }, { slot: 2, ability: 'warden_shield_bash', name: 'Shield Bash', cdLeft: 0, usable: true }];
const model = (over = {}) => ({ player: { level: 1, hp: 100, hpMax: 100, inCombat: false }, bar, quests: [], target: null, targetCast: null, party: [], group: null, ...over });

function rig({ options = {}, marks = [] } = {}) {
  const store = createCharStore(memStorage());
  const c = store.add({ name: 'Nova', cls: 'warden', look: 0 }).char;
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ob = createOnboard({ g: fakeG, store, options: () => opts, hooks: { worldMarks: () => marks } });
  ob.start(store.get(c.id));
  const st = { open: new Set(), goalArrow: null };
  const L = hudLayout({ touch: false });
  let t = 0;
  const tick = (snap, m, secs = 0.1, busy = false) => { t += secs; ob.frame(st, m, snap, 1, t, L, busy); return ob.state.show && ob.state.show.id; };
  const hold = (snap, m, secs, busy = false) => { let id = null; for (let k = 0; k < Math.round(secs / 0.1); k++) id = tick(snap, m, 0.1, busy); return id; };
  return { store, c, ob, st, L, opts, tick, hold, get t() { return t; } };
}

export const tests = [
  {
    name: 'onboard: a new hero has done no hint; a hero from before hints (it saw the controls card) has done them all',
    fn() {
      eq(tipsFor({ id: 1 }).size, 0);
      eq(tipsFor({ id: 1, hinted: true }).size, TIP_IDS.length, 'an old hero is not taught to walk');
      eq([...tipsFor({ id: 1, hinted: true, tips: ['move'] })].join(), 'move', 'the saved list wins');
      eq(PRIORITY.length, TIP_IDS.length);
      for (const id of TIP_IDS) assert(PRIORITY.includes(id) && SHOW_DELAY[id] > 0, id);
    },
  },
  {
    name: 'onboard: every hint has words on PC and phone, in the player\'s own keys, with no em dash',
    fn() {
      for (const id of TIP_IDS) for (const touch of [false, true]) {
        const lines = tipText(id, { touch, ctx: { ability: 'Strike', slot: 1, name: 'Lark' } });
        assert(lines.length >= 1 && lines.every((l) => l.length > 8), `${id} ${touch}`);
        assert(!lines.join(' ').includes('\u2014'), `${id}: no em dash`);
      }
      eq(tipText('move', {})[0], 'Walk with W A S D or the arrow keys.');
      let binds = rebind({}, 'move_up', 'KeyI'); binds = rebind(binds, 'next_target', 'KeyQ'); binds = rebind(binds, 'slot2', 'KeyE'); binds = rebind(binds, 'interact', 'KeyG');
      assert(tipText('move', { binds })[0].startsWith('Walk with I A S D'), tipText('move', { binds })[0]);
      assert(tipText('target', { binds })[0].includes('Press Q'), 'Tab rebound to Q');
      assert(tipText('interrupt', { binds, ctx: { slot: 2, ability: 'Shield Bash' } })[0].includes('Press E (Shield Bash)'), 'slot 2 on E');
      assert(tipText('talk', { binds })[0].includes('press G'), 'talk on G');
      assert(tipText('move', { touch: true })[0].includes('left thumb'), 'the phone says thumb');
      assert(tipText('target', { touch: true })[0].includes('Next'), 'the phone names its Next button');
      for (const id of TIP_IDS) assert(!/\b(WASD|Tab|press [A-Z]\b)/.test(tipText(id, { touch: true }).join(' ')), `${id}: no keys on a phone`);
    },
  },
  {
    name: 'onboard: the interrupt list holds the Warden\'s Shield Bash and the Inkblade\'s Inkstep, not Strike',
    fn() {
      assert(INTERRUPTS.has('warden_shield_bash') && INTERRUPTS.has('inkblade_inkstep'), [...INTERRUPTS].join());
      assert(!INTERRUPTS.has('warden_strike') && !INTERRUPTS.has('scribe_inkbolt'));
    },
  },
  {
    name: 'onboard: candidates: a friend down first, then a spell to break (only with the interrupt ready), then a skill',
    fn() {
      const me = hero();
      const tgt = { id: 50, faction: 'hostile', dead: false };
      const casting = { interruptible: true, left: 1.5, name: 'Kindle the Watch' };
      let ids = tipCandidates({ me, m: model({ target: tgt, targetCast: casting }), t: 0 }).map((c) => c.id);
      eq(ids.slice(0, 2).join(), 'interrupt,ability');
      const cd = [bar[0], { ...bar[1], cdLeft: 3 }];
      ids = tipCandidates({ me, m: model({ target: tgt, targetCast: casting, bar: cd }), t: 0 }).map((c) => c.id);
      assert(!ids.includes('interrupt'), 'no interrupt hint while it is cooling down');
      ids = tipCandidates({ me, m: model({ target: tgt, targetCast: { ...casting, interruptible: false } }), t: 0 }).map((c) => c.id);
      assert(!ids.includes('interrupt'), 'not for a cast that cannot be broken');
      const m = model({ party: [{ id: 7, name: 'Lark', dead: true }], group: { canRez: false, ash: 1, party: [{ id: 7 }] } });
      const c = tipCandidates({ me, m, t: 0 });
      eq(c[0].id, 'rez'); eq(c[0].ctx.name, 'Lark');
      eq(tipCandidates({ me, m: model({ party: [{ id: 7, dead: true }], group: { canRez: false, ash: 0, party: [{ id: 7 }] } }), t: 0 })[0].id, 'move', 'no ash, no Rekindle: no rez hint');
      eq(tipCandidates({ me: hero({ dead: true }), m: model(), t: 0 }).length, 0, 'nothing while dead');
      // a new Warden at 0 Resolve: no skill is usable, so the hint says attack first
      const zero = bar.map((b) => ({ ...b, usable: false }));
      const a = tipCandidates({ me, m: model({ target: tgt, bar: zero, player: { level: 1, hp: 100, hpMax: 100, resWord: 'Resolve' } }), t: 0 }).find((x) => x.id === 'ability');
      assert(a && a.ctx.attack && tipText('ability', { ctx: a.ctx })[0].startsWith('Right-click the foe to attack. Your hits fill Resolve'), JSON.stringify(a));
      assert(!tipCandidates({ me, autoOn: true, m: model({ target: tgt, bar: zero }), t: 0 }).some((x) => x.id === 'ability'), 'already attacking: nothing to say');
    },
  },
  {
    name: 'onboard: a new hero sees "walk" after a moment, it goes once they walk, and the save remembers it',
    fn() {
      const R = rig();
      const snap = { entities: [hero()] };
      R.ob.start(R.store.get(R.c.id));
      const marks = [{ mark: '!', x: 300, y: 100 }];
      const RR = rig({ marks });
      eq(RR.hold(snap, model(), 2.5), 'move', 'walk first even with a gold ! on screen');
      RR.tick({ entities: [hero({ x: 1040 })] }, model());
      eq(RR.hold({ entities: [hero({ x: 1040 })] }, model(), 1.0), 'talk', 'then the gold !');
      eq(R.hold(snap, model(), 1.0), null, 'not at once: the welcome reads first');
      eq(R.hold(snap, model(), 1.0), 'move');
      eq(PRIORITY.indexOf('move') < PRIORITY.indexOf('talk'), true, 'walking comes before talking');
      R.tick({ entities: [hero({ x: 1040 })] }, model());
      eq(R.ob.state.show, null);
      assert(R.store.get(R.c.id).tips.includes('move'), 'saved on the hero');
      // a new session with the same hero never shows it again
      R.ob.start(R.store.get(R.c.id));
      eq(R.hold({ entities: [hero()] }, model(), 3), null);
    },
  },
  {
    name: 'onboard: an experienced player who targets and casts at once never sees those hints',
    fn() {
      const R = rig();
      R.tick({ entities: [hero()] }, model());
      R.tick({ entities: [hero({ x: 1100 })] }, model());        // walked before anything showed
      const f = foe();
      R.tick({ entities: [hero({ x: 1100, target: 50 }), f] }, model({ target: { id: 50, faction: 'hostile' } }), 0.1);   // Tab at once
      R.ob.onEvent({ type: 'cast_start', src: 1, ability: 'warden_strike' }, 1);
      const shown = new Set();
      for (let k = 0; k < 30; k++) { const id = R.tick({ entities: [hero({ x: 1100, target: 50 }), f] }, model({ target: { id: 50, faction: 'hostile' } })); if (id) shown.add(id); }
      assert(!shown.has('move') && !shown.has('target') && !shown.has('ability'), [...shown].join());
      for (const id of ['move', 'target', 'ability']) assert(R.store.get(R.c.id).tips.includes(id), id);
    },
  },
  {
    name: 'onboard: target, then skill, then interrupt hints follow the fight and each goes when done',
    fn() {
      const R = rig();
      R.ob.markDone('move');
      const f = foe();
      eq(R.hold({ entities: [hero(), f] }, model(), 0.6), 'target');
      const m = model({ target: { id: 50, faction: 'hostile' } });
      const snapT = { entities: [hero({ target: 50 }), f] };
      R.tick(snapT, m);
      assert(R.ob.state.done.has('target'));
      eq(R.hold(snapT, m, 0.8), 'ability');
      eq(R.ob.state.show.ctx.slot, 1, 'Strike, not the interrupt');
      const mc = model({ target: { id: 50, faction: 'hostile' }, targetCast: { interruptible: true, left: 2 } });
      eq(R.hold(snapT, mc, 0.3), 'interrupt', 'the interrupt comes in over the skill hint');
      eq(R.ob.state.show.ctx.slot, 2);
      R.ob.onEvent({ type: 'cast_start', src: 1, ability: 'warden_shield_bash' }, 1);
      assert(R.ob.state.done.has('interrupt') && !R.ob.state.done.has('ability'), 'the bash teaches the interrupt only');
      R.ob.onEvent({ type: 'cast_start', src: 1, ability: 'warden_strike' }, 1);
      assert(R.ob.state.done.has('ability'));
      R.ob.onEvent({ type: 'cast_start', src: 2, ability: 'warden_strike' }, 1);
    },
  },
  {
    name: 'onboard: loot shows after a kill drops something and goes when the bags open; rez goes on a rez start',
    fn() {
      const R = rig();
      R.ob.markDone('move');
      R.ob.onEvent({ type: 'loot', id: 1, from: 50, gold: 3, items: [] }, 1);
      eq(R.hold({ entities: [hero()] }, model(), 0.5), 'loot');
      R.st.open.add('bags');
      R.tick({ entities: [hero()] }, model(), 0.1, true);
      assert(R.ob.state.done.has('loot') && !R.ob.state.show);
      R.st.open.clear();
      R.ob.onEvent({ type: 'loot', id: 1, from: null, items: [{ item: 'x' }], craft: 'y' }, 1);
      const m = model({ party: [{ id: 7, name: 'Lark', dead: true }], group: { canRez: true, party: [{ id: 7 }] } });
      eq(R.hold({ entities: [hero()] }, m, 0.6), 'rez');
      R.ob.onEvent({ type: 'rez', kind: 'start', src: 1, id: 7 }, 1);
      assert(R.ob.state.done.has('rez'));
    },
  },
  {
    name: 'onboard: rest shows out of a fight under half health and goes on a sit (or, on a phone, once healed back)',
    fn() {
      const R = rig();
      R.ob.markDone('move');
      const hurt = model({ player: { level: 1, hp: 30, hpMax: 100, inCombat: false } });
      eq(R.hold({ entities: [hero()] }, model({ player: { level: 1, hp: 30, hpMax: 100, inCombat: true } }), 2), null, 'not in a fight');
      eq(R.hold({ entities: [hero()] }, hurt, 1.2), 'rest');
      assert(R.ob.state.show && tipText('rest', {})[0].includes('Press X'));
      R.ob.onEvent({ type: 'sit', id: 1 }, 1);
      assert(R.ob.state.done.has('rest'));
      const P = rig();
      P.ob.markDone('move');
      eq(P.hold({ entities: [hero()] }, hurt, 1.2), 'rest');
      P.tick({ entities: [hero()] }, model({ player: { level: 1, hp: 95, hpMax: 100 } }));
      assert(P.ob.state.done.has('rest'), 'healed back');
    },
  },
  {
    name: 'onboard: hidden while busy (a window, the npc window, the boss card); off from Help; snoozed when ignored',
    fn() {
      const R = rig();
      eq(R.hold({ entities: [hero()] }, model(), 3, true), null, 'busy: nothing');
      eq(R.hold({ entities: [hero()] }, model(), 2), 'move');
      eq(R.tick({ entities: [hero()] }, model(), 0.1, true), null, 'a window opens: it goes');
      eq(R.hold({ entities: [hero()] }, model(), SNOOZE_AFTER + 2), null, 'ignored too long: put away');
      eq(R.hold({ entities: [hero()] }, model(), 64), 'move', 'and back a minute later');
      R.opts.hints = false;
      eq(R.tick({ entities: [hero()] }, model()), null, 'Help: Hints Off');
      assert(!R.ob.live);
      R.tick({ entities: [hero({ x: 1100 })] }, model());
      assert(R.ob.state.done.has('move'), 'what the hero does still counts while hints are off');
    },
  },
  {
    name: 'onboard: the hint box sits above the bar on a PC and between the frames and the minimap on a phone',
    fn() {
      const R = rig();
      for (const [W, H] of [[640, 360], [960, 540]]) {
        const L = hudLayout({ touch: false, W, H });
        const r = R.ob.rect(L, R.ob.maxW(L), 30);
        assert(r.y + r.h <= L.cast.y - 2 && r.y > H / 2, `${W}: above the cast bar, below the hero ${JSON.stringify(r)}`);
        assert(r.x >= L.chat.x + L.chat.w, `${W}: clear of the chat ${JSON.stringify(r)}`);
      }
      // an 844x390 phone at the play layer's scales
      for (const [W, H, hit] of [[422, 195, 22], [562, 260, 30], [640, 296, 34]]) {
        const L = hudLayout({ touch: true, W, H, minHit: hit });
        const r = R.ob.rect(L, 400, 24);
        const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert(r.x >= L.player.x + L.player.w && r.x + r.w <= L.minimap.x, `${W}: between the frames and the minimap`);
        for (const b of [...L.menuBar, ...L.cluster, L.player, L.target, L.minimap]) assert(!ov(r, b), `${W}: clear of ${JSON.stringify(b)}`);
        assert(r.y + r.h < H / 2 - 8, `${W}: above the hero`);
        // a toast (ui.js: under the menu buttons, L.minHit + 8, 18 tall) pushes the box down below it
        R.ob.state.toastUp = true;
        const r2 = R.ob.rect(L, 400, 24);
        R.ob.state.toastUp = false;
        assert(r2.y >= L.minHit + 8 + 18 && r2.y + r2.h < H / 2, `${W}: below a toast ${JSON.stringify(r2)}`);
      }
    },
  },
  {
    name: 'onboard: Help has the hints switch (not a Settings row) and it flips options.hints',
    fn() {
      for (const touch of [false, true]) {
        const regions = [];
        let opt = null;
        const act = { setOption: (k, v) => { opt = [k, v]; }, close() {} };
        const env = { g: fakeG, L: hudLayout({ touch, minHit: touch ? 30 : 15 }) };
        drawHelp(fakeCtx(), env, { open: new Set(['help']) }, regions, act, {}, { ...DEFAULT_OPTIONS });
        const b = regions.find((r) => r.label === 'help:hints');
        assert(b, `switch drawn (${touch})`);
        assert(b.rect.x + b.rect.w <= 24 + 592 && b.rect.y + b.rect.h <= 12 + 336, 'inside the Help window');
        b.on();
        eq(JSON.stringify(opt), '["hints",false]');
      }
      eq(DEFAULT_OPTIONS.hints, true);
    },
  },
];

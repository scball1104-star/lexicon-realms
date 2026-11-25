// Wave 7 anim lane (D:/LQOnline/wave7/anim/BRIEF.md, approved 2026-11-24): jump and emotes through one cosmetic sim
// field (`emote`, no rng, position or stats, 0.8 s jump cooldown), Space and G, the emote ring, /wave in party chat,
// the phone portrait long press (never on a normal tap), NPC work loops keyed by a `job` field, the emote kit's timings.
import fs from 'node:fs';
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { NPCS } from '../../src/data/npcs.js';
import { EMOTE_IDS, JUMP_COOLDOWN_TICKS, EMOTE_TICKS, emoteFromChat } from '../../src/sim/emotes.js';
import { framesFor, createFrameState, applyFrame } from '../../src/net/frames.js';
import { guestCommandOk } from '../../src/net/session.js';
import { ACTIONS, ACTION_BY_ID, effectiveBinds, actionFor, routeKey } from '../../src/ui/keymap.js';
import { helpSections } from '../../src/ui/help.js';
import { createEmoteUI, ringPick, ringSpots, RING } from '../../src/ui/emote_ui.js';
import { createTouch, LONG_PRESS_MS } from '../../src/input/touch.js';
import { jumpPhase, JUMP, smithPose, kneadPose, guardPose, SIT_DOWN, POSES } from '../../src/render3d/emote_kit.js';

const C = buildContent();
const SQUARE = { zone: 'world', x: 164, y: 146 };    // Willowmere square
function hero(seed = 11, extra = {}) {
  const w = createWorld({ seed, content: C });
  const id = w.addPlayer({ name: 'Ash', cls: 'warden', ...SQUARE, ...extra });
  return { w, id, e: w.get(id) };
}
const step = (w, n = 1) => { const ev = []; for (let i = 0; i < n; i++) ev.push(...w.step()); return ev; };
const snapOf = (w, id) => w.snapshot().entities.find((x) => x.id === id);
const rejects = (ev, id) => ev.filter((x) => x.type === 'cmd_reject' && x.id === id && x.cmd === 'emote').map((x) => x.reason);

export const tests = [
  { name: 'emote: a command sets the one cosmetic field, the snapshot carries it like sit, and it ends on its own', fn() {
    const { w, id } = hero();
    step(w, 5);
    w.enqueue(id, { t: 'emote', id: 'wave' }); step(w);
    let s = snapOf(w, id);
    eq(s.emote && s.emote.id, 'wave', 'the snapshot shows the wave');
    eq(s.emote.tick, w.tick, 'with the tick it started (the renderer times it from that)');
    step(w, EMOTE_TICKS.wave + 1);
    eq(snapOf(w, id).emote, null, 'a wave ends by itself');
    w.enqueue(id, { t: 'emote', id: 'dance' }); step(w, 200);
    eq(snapOf(w, id).emote.id, 'dance', 'a dance goes on until you move');
    w.enqueue(id, { t: 'move', dx: 1, dy: 0 }); step(w, 2);
    eq(snapOf(w, id).emote, null, 'moving ends the dance');
    w.enqueue(id, { t: 'emote', id: 'nope' });
    assert(rejects(step(w), id).includes('bad_emote'), 'an unknown emote is refused');
    for (const k of EMOTE_IDS) assert(k in EMOTE_TICKS, k);
  } },
  { name: 'emote: a jump keeps running (no stop), has a 0.8 s cooldown, and combat, riding or death refuse or end the rest', fn() {
    const { w, id, e } = hero();
    step(w, 5);
    w.enqueue(id, { t: 'move', dx: 1, dy: 0 }); step(w, 3);
    const x0 = e.x;
    w.enqueue(id, { t: 'emote', id: 'jump' }); step(w);
    eq(snapOf(w, id).emote.id, 'jump', 'a running jump');
    assert(e.moving && e.x > x0, 'still running: the jump never stops the hero');
    eq(JUMP_COOLDOWN_TICKS, 16, '0.8 s at 20 Hz');
    w.enqueue(id, { t: 'emote', id: 'jump' });
    assert(rejects(step(w), id).includes('cooldown'), 'a second jump at once is refused');
    step(w, JUMP_COOLDOWN_TICKS);
    w.enqueue(id, { t: 'emote', id: 'jump' });
    eq(rejects(step(w), id).length, 0, 'after 0.8 s it jumps again');
    w.enqueue(id, { t: 'stop' }); step(w, 30);
    e.inCombat = true;
    w.enqueue(id, { t: 'emote', id: 'cheer' });
    assert(rejects(step(w), id).includes('combat'), 'no cheering in a fight');
    e.inCombat = false;
    w.enqueue(id, { t: 'emote', id: 'dance' }); step(w);
    e.inCombat = true; step(w);
    eq(snapOf(w, id).emote, null, 'a fight ends the dance');
    e.inCombat = false;
    w.enqueue(id, { t: 'emote', id: 'dance' }); step(w);
    e.hp = 0; e.dead = true; step(w);
    eq(e.emote, null, 'death ends it');
    w.enqueue(id, { t: 'emote', id: 'wave' });
    assert(step(w).some((x) => x.type === 'cmd_reject' && x.id === id), 'the dead cannot wave');
  } },
  { name: 'emote: touches no rng, position, movement, health, resources or stats (a twin world without emotes stays identical)', fn() {
    const A = hero(77), B = hero(77);
    const moves = [[3, 1, 0], [20, 0, 1], [45, 0, 0], [60, -1, 0], [90, 0, 0], [120, 1, 1], [150, 0, 0]];
    for (let t = 1; t <= 220; t++) {
      for (const [at, dx, dy] of moves) if (at === t) for (const W of [A, B]) W.w.enqueue(W.id, { t: 'move', dx, dy });
      if (t % 7 === 0) A.w.enqueue(A.id, { t: 'emote', id: EMOTE_IDS[(t / 7) % EMOTE_IDS.length] });
      A.w.step(); B.w.step();
    }
    eq(JSON.stringify(A.w.state.rng), JSON.stringify(B.w.state.rng), 'the rng state is the same');
    const strip = (s) => JSON.stringify({ ...s, entities: s.entities.map((x) => { const o = { ...x }; delete o.emote; return o; }), hud: Object.fromEntries(Object.entries(s.hud || {}).map(([k, v]) => [k, v])) });
    eq(strip(A.w.snapshot()), strip(B.w.snapshot()), 'every entity (position, hp, res, stats, auras) and the HUD match');
    const a = A.w.get(A.id), b = B.w.get(B.id);
    eq(`${a.x},${a.y},${a.mx},${a.my},${a.hp},${a.sitting}`, `${b.x},${b.y},${b.mx},${b.my},${b.hp},${b.sitting}`, 'the hero itself');
  } },
  { name: 'emote: deterministic replay (the same command log gives the same snapshots)', fn() {
    const runOnce = () => {
      const { w, id } = hero(5);
      const out = [];
      for (let t = 1; t <= 120; t++) {
        if (t % 11 === 0) w.enqueue(id, { t: 'emote', id: EMOTE_IDS[t % 4] });
        if (t % 23 === 0) w.enqueue(id, { t: 'move', dx: (t % 3) - 1, dy: 0 });
        w.step(); out.push(JSON.stringify(snapOf(w, id)));
      }
      return out.join('\n');
    };
    eq(runOnce(), runOnce(), 'two runs');
  } },
  { name: 'emote: co-op friends see it (frames carry the emote of another hero), the guest filter lets it through', fn() {
    const { w, id } = hero();
    const id2 = w.addPlayer({ name: 'Bee', cls: 'mender', zone: 'world', x: 165, y: 146 });
    step(w, 3);
    const tx = framesFor(id2), rx = createFrameState(id2);
    applyFrame(rx, tx.frame(w.snapshot(), []));
    w.enqueue(id, { t: 'emote', id: 'cheer' }); step(w);
    const snap = applyFrame(rx, tx.frame(w.snapshot(), []));
    eq(snap.entities.find((x) => x.id === id).emote.id, 'cheer', "the friend's screen shows the cheer");
    assert(guestCommandOk({ t: 'emote', id: 'wave' }), 'a guest may send it');
  } },
  { name: 'emote: /wave /cheer /sit /dance /jump in party chat are commands, anything else is chat', fn() {
    eq(JSON.stringify(emoteFromChat('/wave')), JSON.stringify({ t: 'emote', id: 'wave' }), '/wave');
    eq(JSON.stringify(emoteFromChat(' /Dance ')), JSON.stringify({ t: 'emote', id: 'dance' }), 'case and spaces');
    eq(JSON.stringify(emoteFromChat('/sit')), JSON.stringify({ t: 'sit' }), '/sit is the real sit');
    eq(emoteFromChat('wave'), null, 'no slash: chat');
    eq(emoteFromChat('/wave at Bee'), null, 'more words: chat');
    // wave 8 talk: the chat line's commands moved to src/net/talk_coop.js (coop.js calls it)
    const coop = fs.readFileSync(new URL('../../src/net/coop.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../../src/net/talk_coop.js', import.meta.url), 'utf8');
    assert(/emoteFromChat\(text\)/.test(coop), 'the party chat box checks it before sending');
  } },
  { name: 'keys: Space jumps and G opens the ring, rebindable, no default key shared; Space still shows talk text first', fn() {
    eq(ACTION_BY_ID.jump.key, 'Space', 'Space');
    eq(ACTION_BY_ID.emotes.key, 'KeyG', 'G');
    const defaults = ACTIONS.map((a) => a.key);
    eq(new Set(defaults).size, defaults.length, 'every default key is its own');
    const b = effectiveBinds({});
    eq(actionFor('Space', b), 'jump', 'Space is only the jump');
    eq(actionFor('KeyG', b), 'emotes', 'G is only the ring');
    eq(routeKey('Space', true, {}).kind, 'pass', 'Space reaches no other key route');
    // the talk panel's "Space: show it all" is asked first, so it never jumps while the words come in
    const ui = fs.readFileSync(new URL('../../src/ui/ui.js', import.meta.url), 'utf8');
    const talk = ui.indexOf('talkUi.key(ev'), em = ui.indexOf('emoteUi.key(ev');
    assert(talk > 0 && em > talk, 'talkUi.key runs before emoteUi.key');
    const rows = helpSections({}).flatMap((s) => s.rows.map((r) => r[0]));
    assert(rows.includes('Jump') && rows.includes('Emotes'), 'Help lists them');
  } },
  { name: 'ring: G toggles, 1 to 5 pick, Space jumps, an open npc window keeps Space quiet, combat greys all but Jump', fn() {
    const sent = [], said = [];
    const st = { mode: 'game', now: 0, dialog: null, mirror: null, emoteRing: null };
    const E = createEmoteUI({ g: null, st, send: (c) => sent.push(c), say: (ch, t) => said.push(t) });
    const key = (code, extra = {}) => E.key({ code, repeat: false, ...extra }, {}, { player: { inCombat: false } });
    assert(key('KeyG') && st.emoteRing, 'G opens');
    assert(key('Digit4') && !st.emoteRing, '4 picks Dance and closes');
    eq(JSON.stringify(sent.pop()), JSON.stringify({ t: 'emote', id: 'dance' }), 'dance sent');
    key('KeyG'); key('Digit3');
    eq(JSON.stringify(sent.pop()), JSON.stringify({ t: 'sit' }), 'Sit is the real sit command');
    key('KeyG'); assert(key('Escape') && !st.emoteRing, 'Esc closes');
    key('KeyG'); key('KeyG'); assert(!st.emoteRing, 'G again closes');
    key('Space'); eq(JSON.stringify(sent.pop()), JSON.stringify({ t: 'emote', id: 'jump' }), 'Space jumps');
    st.dialog = { ent: 1 }; const n = sent.length;
    assert(key('Space') && sent.length === n, 'with an npc window open Space does nothing (and is used)');
    st.dialog = null;
    assert(!key('Digit1'), 'with the ring shut, 1 is still ability 1');
    eq(ringPick('wave', { inCombat: true }).say, 'Not while in combat.', 'combat: no wave');
    assert(ringPick('jump', { inCombat: true }).cmd, 'combat: a jump is fine');
    eq(RING.map((r) => r.id).join(','), 'wave,cheer,sit,dance,jump', 'the ring');
    const sp = ringSpots(100, 100, 40);
    eq(sp[0].join(','), '100,60', 'Wave at the top');
  } },
  { name: 'phone: a long press on your own portrait opens the ring; a normal tap never does', async fn() {
    const st = { mode: 'game', now: 0, emoteRing: null };
    const E = createEmoteUI({ g: null, st, send: () => {} });
    assert(!E.longPress({ kind: 'target' }) && !st.emoteRing, 'not the target frame');
    assert(!E.longPress(null) && !st.emoteRing, 'not the ground');
    assert(E.longPress({ kind: 'player' }) && st.emoteRing, 'the portrait');
    // touch.js: setLongTip (which opens it) only fires after LONG_PRESS_MS held; a tap on the portrait is ui.press only
    const handlers = {}, calls = [];
    const canvas = { addEventListener: (t, f) => { handlers[t] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 844, height: 390 }), width: 844, height: 390 };
    const ui = { hudPoint: (x, y) => ({ x, y }), owns: () => true, topRegion: () => ({ kind: 'player' }), press: () => calls.push('press'),
      setLongTip: (p) => calls.push(p ? 'long' : 'long_end'), setPressed: () => {}, setJoystick: () => {}, layout: () => ({ W: 422 }) };
    const input = { press() {}, release() {}, inject() {} };
    createTouch({ canvas, input, ui });
    const ev = (type, id = 1) => ({ type, preventDefault() {}, changedTouches: [{ identifier: id, clientX: 30, clientY: 20 }] });
    handlers.touchstart(ev('touchstart'));
    await new Promise((r) => setTimeout(r, 120));
    handlers.touchend(ev('touchend'));
    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 100));
    eq(calls.join(','), 'press', 'a 0.12 s tap: a press, never the long press');
    calls.length = 0;
    handlers.touchstart(ev('touchstart', 2));
    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 80));
    handlers.touchend(ev('touchend', 2));
    eq(calls.join(','), 'long,long_end', 'held: the long press, and no tap on release');
    const ui2 = fs.readFileSync(new URL('../../src/ui/ui.js', import.meta.url), 'utf8');
    assert(/emoteUi\.longPress\(r\)/.test(ui2), 'ui.setLongTip hands the region to the ring');
  } },
  { name: 'NPC work loops: a `job` in the data (smith, baker, guard), in the snapshot, and e.job switches it', fn() {
    eq(NPCS.garrick.job, 'smith', 'Garrick'); eq(NPCS.oren.job, 'baker', 'Oren'); eq(NPCS.holt.job, 'guard', 'Holt');
    const { w } = hero();
    const n = (t) => w.state.ents.find((x) => x.kind === 'npc' && x.template === t);
    const snapN = (e) => w.snapshot().entities.find((x) => x.id === e.id);
    eq(snapN(n('garrick')).job, 'smith', 'the snapshot carries the job');
    eq(snapN(n('mael')).job, undefined, 'no job: no field');
    n('garrick').job = null; eq(snapN(n('garrick')).job, undefined, 'a routine sets e.job = null: no loop');
    n('mael').job = 'guard'; eq(snapN(n('mael')).job, 'guard', 'or gives one');
  } },
  { name: 'emote kit: the hop (0.6 m, 0.9 s), the sit-down, the smith keeps Garrick\'s rhythm, poses are finite', fn() {
    const top = jumpPhase(JUMP.crouch + JUMP.air / 2);
    eq(top.ph, 'air', 'mid-air'); assert(Math.abs(top.y - JUMP.h) < 1e-9, 'the top of the hop');
    eq(jumpPhase(0.05).y, 0, 'the crouch is on the ground');
    eq(jumpPhase(JUMP.crouch + JUMP.air + JUMP.land + 0.01), null, 'over in 0.9 s');
    assert((JUMP.crouch + JUMP.air + JUMP.land) * 20 <= EMOTE_TICKS.jump, 'the hop fits in the sim field\'s life');
    assert(SIT_DOWN < 1.6, 'the sit-down is over before r3d.py looks for the sit loop');
    const beats = [0, 1, 2, 3, 4].map((b) => [0.1, 0.3, 0.5, 0.7, 0.9, 1.035, 1.2, 1.4].some((c) => smithPose(b * 1.5 + c).strike));
    eq(beats.join(','), 'true,true,true,true,false', 'DONG, dong, dong, DONG, rest');
    for (const p of [smithPose(0.4).pose, kneadPose(5.1), guardPose(3.3, 0.2), ...Object.values(POSES)]) assert(p.every(Number.isFinite), 'finite');
  } },
  { name: 'emote kit: hooked into actors.js in a few lines, ?anim=0 keeps today, no QAL or Bestiary assets', fn() {
    const act = fs.readFileSync(new URL('../../src/render3d/actors.js', import.meta.url), 'utf8');
    eq((act.match(/emotes\./g) || []).length, 3, 'three calls (npcKit, clip, pose)');
    assert(/get\('anim'\) === '0'/.test(act), '?anim=0');
    const kit = fs.readFileSync(new URL('../../src/render3d/emote_kit.js', import.meta.url), 'utf8');
    assert(!/QAL|Bestiary|Fantasy Races|Puglin/i.test(kit.replace(/Nothing from QAL \/ Bestiary\./, '')), 'no restricted kit');
    const lic = fs.readFileSync(new URL('../../assets3d/LICENSES.md', import.meta.url), 'utf8');
    assert(/Jump_Start/.test(lic), 'the licence manifest names the new clips');
  } },
];

// Music made from your letters (wave 9 music lane; Scott 2026-11-25 approved the brief with its recommendations).
// The sim keeps which letters each hero has ever found (src/sim/letters_seen.js, saved), the HUD view carries the hero's
// and the party's masks, and the synth gates the place's tune by the party's letters (src/audio/synth/letters.js,
// sequencer.js). Tests compare NOTE SCHEDULES (a recording fake AudioContext), never samples: the synth is not always
// sample-identical run to run (D:\LQOnline\wave9\music\BRIEF.md, finding).
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { framesFor, createFrameState, applyFrame, createTickCache } from '../../src/net/frames.js';
import { bagAdd, bagRemove } from '../../src/sim/loot.js';
import { seenMask, partyLetters, bitOf, LETTERS_ALL } from '../../src/sim/letters_seen.js';
import { maskOf, countOf, lettersOf, dealLetters, letterGate, ALL, STAGES } from '../../src/audio/synth/letters.js';
import { createCore } from '../../src/audio/synth/core.js';
import { createSequencer, textureArrangement, combatArrangement } from '../../src/audio/synth/sequencer.js';
import { synthPlaceFor, synthTrackId } from '../../src/audio/synth_places.js';
import { createLetterNotes, LETTER_WORDS } from '../../src/ui/letters_ui.js';
import { ZONES } from '../../src/data/maps/index.js';

const BASE = { ...buildContent(), spawns: [], nightSpawns: [] };
const world = (seed = 7) => createWorld({ seed, content: BASE, day: 1 });
const gid = (L) => `glyph_${L.toLowerCase()}`;
const HOLLOW = synthPlaceFor({ zoneId: 'hollow', zoneKind: 'field', zoneName: 'The Nameless Hollow' });

// ---------------------------------------------------------------- a recording fake AudioContext (no sound, no samples)
function fakeCtx() {
  const log = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}, exponentialRampToValueAtTime() {} });
  const node = (kind) => {
    const n = { kind, connect() {}, disconnect() {}, gain: param(), frequency: param(), detune: param(), Q: param(), pan: param(), playbackRate: param(), delayTime: param() };
    n.start = (t) => { if (kind === 'osc') log.push(['osc', n.type, Math.round(n.frequency._f * 100) / 100, t]); };
    n.stop = () => {};
    if (kind === 'osc') { const f = n.frequency; f.setValueAtTime = (v) => { f._f = v; }; }
    return n;
  };
  const ctx = new Proxy({
    sampleRate: 8000, currentTime: 0, destination: node('dest'),
    createGain: () => node('gain'), createWaveShaper: () => node('shaper'), createBiquadFilter: () => node('filter'),
    createStereoPanner: () => node('pan'), createOscillator: () => node('osc'), createBufferSource: () => node('src'),
    createDelay: () => node('delay'), createConvolver: () => node('conv'), createDynamicsCompressor: () => node('comp'),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(Math.max(1, len | 0)) }),
  }, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' && k.startsWith('create') ? () => node(k) : undefined) });
  return { ctx, log };
}
/** The schedule of one theme loop: every oscillator start (type, Hz, bar, eighth step within the bar) and the note count. */
function schedule(spec, { arr = textureArrangement({ perc: !spec.under }), night = false, mix = null } = {}) {
  const { ctx, log } = fakeCtx();
  const S = createCore(ctx, { seed: spec.seed, reverbDecay: 2.6 });
  const seq = createSequencer(S, { ...spec }, { night, crickets: !!spec.outdoors });
  const m = mix || (night ? { explore: 0, night: 1, combat: 0 } : { explore: 1, night: 0, combat: 0 });
  let t = 0.05;
  for (const plan of arr) t += seq.scheduleBar(plan, t, m, m);
  const bar = seq.barLen, eighth = seq.eighth;
  const notes = log.map(([, type, hz, at]) => {
    const b = Math.floor((at - 0.05 + 0.02) / bar);
    return { type, hz, bar: b, step: Math.round(((at - 0.05 - b * bar) / eighth) * 2) / 2 };
  });
  return { notes: S.stats.notes, nodes: S.stats.nodes, oscs: notes };
}
const key = (n) => `${n.bar}|${n.step}|${n.type}|${n.hz}`;

export const tests = [
  {
    name: 'letters music: a glyph entering the pouch is found for good; the song never shrinks',
    fn() {
      const w = world(); const id = w.addPlayer({ name: 'Ash', cls: 'inkblade' }); const e = w.get(id);
      eq(seenMask(BASE, e), 0, 'a new hero has found no letters');
      bagAdd(e, gid('A'), 2, null, BASE); bagAdd(e, gid('S'), 1, null, BASE);
      eq(lettersOf(seenMask(BASE, e)).join(''), 'AS', 'pouch letters found');
      bagRemove({ gbag: e.gbag }, gid('S'), 1);    // socketed, lent or traded away
      assert(!(e.gbag || []).some((g) => g.item === gid('S') && g.qty > 0), 'S left the pouch');
      eq(lettersOf(seenMask(BASE, e)).join(''), 'AS', 'S still counts');
      bagAdd(e, gid('A'), 0, null, BASE);
      eq(countOf(seenMask(BASE, e)), 2, 'adding nothing finds nothing');
    },
  },
  {
    name: 'letters music: the mask is saved; an old save with no mask starts from what the hero holds',
    fn() {
      const w = world(); const id = w.addPlayer({ name: 'Ash', cls: 'inkblade' }); const e = w.get(id);
      bagAdd(e, gid('H'), 1, null, BASE); bagAdd(e, gid('Z'), 1, null, BASE);
      bagRemove({ gbag: e.gbag }, gid('Z'), 1);
      const save = w.saveFields(id);
      eq(lettersOf(save.glyphSeen).join(''), 'HZ', 'saved mask has the letter that left the pouch');
      const w2 = world(); const id2 = w2.addPlayer({ name: 'Ash', cls: 'inkblade', ...save });
      eq(lettersOf(seenMask(BASE, w2.get(id2))).join(''), 'HZ', 'loaded back');
      // an old save: a pouch and a socketed letter, no glyphSeen
      const old = { gbag: [{ item: gid('Q'), qty: 3 }] };
      const w3 = world(); const id3 = w3.addPlayer({ name: 'Old', cls: 'warden', ...old });
      const e3 = w3.get(id3);
      e3.equip = { ...(e3.equip || {}), main: { item: 'x', inst: { glyphs: ['V', null] } } };
      eq(lettersOf(seenMask(BASE, e3)).join(''), 'QV', 'old save: pouch and worn margins count');
      eq(lettersOf(w3.saveFields(id3).glyphSeen).join(''), 'QV', 'and are saved from then on');
      const none = world(); const idn = none.addPlayer({ name: 'New', cls: 'warden' });
      eq(none.saveFields(idn).glyphSeen, undefined, 'no letters, no field (old save shape)');
    },
  },
  {
    name: 'letters music: the party hears its letters together, solo your own; the HUD view carries both to a guest',
    fn() {
      const w = world(); const a = w.addPlayer({ name: 'Ash', cls: 'inkblade' }); const b = w.addPlayer({ name: 'Bryn', cls: 'mender' });
      bagAdd(w.get(a), gid('A'), 1, null, BASE); bagAdd(w.get(b), gid('B'), 1, null, BASE);
      eq(lettersOf(partyLetters(w.state, BASE, w.get(a))).join(''), 'A', 'solo: own letters');
      w.setParty(a, a); w.setParty(b, a);
      eq(lettersOf(partyLetters(w.state, BASE, w.get(a))).join(''), 'AB', 'party: together');
      const h = w.snapshot().hud[b];
      eq(lettersOf(h.letters.seen).join(''), 'B', 'HUD: own letters');
      eq(lettersOf(h.letters.song).join(''), 'AB', 'HUD: the song is the party\'s');
      const tx = framesFor(b), rx = createFrameState(b);
      const g = applyFrame(rx, JSON.parse(JSON.stringify(tx.frame(w.snapshot(), w.step(), createTickCache()))));
      eq(lettersOf(g.hud[b].letters.song).join(''), 'AB', 'a guest\'s frame carries the party mask');
    },
  },
  {
    name: 'letters music: the deal and the gates (pure)',
    fn() {
      const deal = dealLetters(HOLLOW).flat();
      eq(new Set(deal).size, 26, 'every letter owns a tune note');
      eq(JSON.stringify(dealLetters(HOLLOW)), JSON.stringify(dealLetters({ ...HOLLOW })), 'same realm, same deal');
      const g0 = letterGate(HOLLOW, 0), g4 = letterGate(HOLLOW, maskOf('AEST'.split(''))), gA = letterGate(HOLLOW, ALL);
      assert(!g0.layer('harp') && g0.layer('pad') && g0.line(0, 0).length === 0, 'no letters: pad and bass only');
      assert(!g4.layer('harp') && letterGate(HOLLOW, (1 << STAGES.harp) - 1).layer('harp'), 'harp at 8');
      assert(gA.full && gA.line(2, 0).length === 0, 'all 26: no bell line');
      eq(maskOf(['', '?', 'AA', null, 'a']), bitOf('A'), 'only single letters count');
      eq(LETTERS_ALL, ALL, 'sim and synth agree on the mask');
    },
  },
  {
    name: 'letters music: schedules: 26 letters = today note for note; more letters only ever add tune notes; combat whole',
    fn() {
      const today = schedule(HOLLOW), all = schedule({ ...HOLLOW, letters: ALL });
      eq(all.notes, today.notes, '26: same note count');
      eq(all.nodes, today.nodes, '26: same nodes');
      eq(JSON.stringify(all.oscs), JSON.stringify(today.oscs), '26: the same schedule, note for note');
      const sets = ['AEST', 'ACDEHILNORSTU', 'ABCDEFGHIKLMNOPRSTUVWY'].map((s) => schedule({ ...HOLLOW, letters: maskOf(s.split('')) }));
      assert(sets[0].notes < sets[1].notes && sets[1].notes < sets[2].notes, `the song grows: ${sets.map((s) => s.notes)}`);
      // the tune (the flute: sine voices above the harp and pad, in bars 8 to 15 of the in-game loop, which have no bell
      // line): what plays at fewer letters still plays at more. (Bass and harp picks use the synth's rng, so only the tune.)
      const tune = (s) => new Set(s.oscs.filter((n) => n.bar >= 8 && n.bar <= 15 && n.type === 'sine' && n.hz >= 380).map(key));
      assert(tune(today).size >= 25, `the tune is found (${tune(today).size})`);
      for (let i = 0; i < 2; i++) { const a = tune(sets[i]), b = tune(sets[i + 1]); for (const k of a) assert(b.has(k), `tune note ${k} kept at more letters`); }
      for (const k of tune(sets[2])) assert(tune(today).has(k), `tune note ${k} is today's`);
      // night and underground: gated the same way, 26 = today
      const night = schedule(HOLLOW, { night: true }), nightAll = schedule({ ...HOLLOW, letters: ALL }, { night: true });
      eq(JSON.stringify(nightAll.oscs), JSON.stringify(night.oscs), 'night: 26 = today');
      assert(schedule({ ...HOLLOW, letters: maskOf(['A']) }, { night: true }).notes < night.notes, 'night grows too');
      // combat: the combat layer itself is whole at any count
      const cmix = { explore: 0, night: 0, combat: 1 };
      const c0 = schedule({ ...HOLLOW, letters: 0 }, { arr: combatArrangement(), mix: cmix }), cT = schedule(HOLLOW, { arr: combatArrangement(), mix: cmix });
      eq(c0.notes, cT.notes, 'combat layer: the same notes with no letters');
    },
  },
  {
    name: 'letters music: places and track ids (the Hollow, dungeons, caves, roads; realms with their own tracks untouched)',
    fn() {
      const m = maskOf('ASH'.split(''));
      const h = synthPlaceFor({ zoneId: 'hollow', zoneKind: 'field', zoneName: 'The Nameless Hollow', letters: m });
      eq(h.letters, m, 'the Hollow takes the mask');
      eq(synthTrackId(h, 'day'), `synth:hollow:L${m.toString(36)}:day`, 'id carries the mask');
      assert(/:(day|night)$/.test(synthTrackId(h, 'day')) && synthTrackId(h, 'combat').endsWith(':combat'), 'variant stays last (the battle swap)');
      eq(synthTrackId(synthPlaceFor({ zoneId: 'hollow', zoneKind: 'field', zoneName: 'The Nameless Hollow', letters: ALL }), 'day'), 'synth:hollow:day', '26 = today\'s id');
      eq(synthTrackId(synthPlaceFor({ zoneId: 'hollow', zoneKind: 'field', zoneName: 'The Nameless Hollow' }), 'day'), 'synth:hollow:day', 'no mask = today');
      for (const [id, z] of Object.entries(ZONES)) {
        const s = synthPlaceFor({ zoneId: id, zoneKind: z.kind, zoneName: z.name, letters: m });
        if (z.kind === 'dungeon' || z.kind === 'cave' || id === 'hollow') eq(s && s.letters, m, `${id}: letters`);
        else eq(s, null, `${id} keeps its own track`);
      }
      eq(synthPlaceFor({ zoneId: 'world', zoneKind: 'field', onRoad: true, letters: m }).letters, m, 'the roads: letters');
      eq(synthPlaceFor({ zoneId: 'world', zoneKind: 'field', region: 'valley', letters: m }), null, 'a world region keeps its track');
    },
  },
  {
    name: 'letters music: the toast (DRAFT words) only for a new letter, never for a hero\'s own load, and not with Synth Off',
    fn() {
      const st = { toast: null, now: 10 }; const said = [];
      const ui = { state: st, say: (ch, t) => said.push([ch, t]) };
      const n = createLetterNotes();
      const hud = (seen, song = seen) => ({ letters: { seen, song } });
      eq(n.frame(hud(maskOf(['A', 'B'])), 1, ui), null, 'first frame: no toast for what the hero brought');
      const t = n.frame(hud(maskOf(['A', 'B', 'R']), maskOf(['A', 'B', 'R', 'Z'])), 1, ui);
      eq(t, LETTER_WORDS.toast('R', 4), 'toast names the letter and the party count');
      eq(st.toast.text, t, 'shown'); eq(said.length, 1, 'one log line');
      n.frame(hud(maskOf(['A', 'B', 'R', 'S'])), 1, ui); eq(said.length, 1, 'the log line once a session');
      eq(n.frame(hud(maskOf(['A', 'B', 'R', 'S', 'T'])), 1, ui, { synthOn: false }), null, 'Synth Off: nothing');
      eq(n.frame(hud(maskOf(['Q'])), 2, ui), null, 'another hero: no toast');
      eq(n.frame(hud(ALL), 2, ui), LETTER_WORDS.whole, 'all 26');
      for (const s of [LETTER_WORDS.toast('R', 4), LETTER_WORDS.whole, LETTER_WORDS.log]) assert(!s.includes(String.fromCharCode(0x2014)), 'no em dashes');
    },
  },
];

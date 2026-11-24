// Audio quick wins (wave 5, PLAN item 1): the new event -> sound rows, friends' sounds and their distance falloff, the
// combat music state machine, the menu-sound observer, and the per-place music and ambience beds. All pure, node-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq } from './_helpers.mjs';
import { soundsFor, friendGain, friendPan, FRIEND, UI_SOUNDS } from '../../src/audio/sfx_table.js';
import { createCombatMusic, COMBAT_MUSIC } from '../../src/audio/combat_music.js';
import { createUiSounds } from '../../src/audio/ui_sounds.js';
import { musicFor, bedFor, placeKey, REALM_MUSIC, ZONE_BEDS, KIND_BEDS, ROAD_BED } from '../../src/audio/beds.js';
import { createAudio } from '../../src/audio/audio.js';
import { ZONES } from '../../src/data/maps/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/audio/manifest.json'), 'utf8'));
const ME = 1, FR = 7, MOB = 9;
const ctx = { me: ME, cls: 'warden', zone: 'world', isPlayer: (id) => id === ME || id === FR, clsOf: () => 'mender' };
const ids = (ev, c = ctx) => soundsFor(ev, c).map((s) => `${s.kind}:${s.id}`);

export const tests = [
  {
    name: 'audio wave 5: rez, level, trade, flight, mount, ready check and boss pull make a sound',
    fn() {
      eq(ids({ type: 'rez', kind: 'done', src: FR, id: ME }).join(), 'sfx:revive', 'rezzed by a friend');
      eq(ids({ type: 'rez', kind: 'done', src: ME, id: FR }).join(), 'sfx:revive', 'I rezzed a friend');
      eq(ids({ type: 'rez', kind: 'start', src: ME, id: FR }).join(), 'sfx:buff', 'rez cast starts');
      eq(ids({ type: 'level', id: ME, level: 3 }).join(), 'jingle:level_up', 'my level');
      eq(ids({ type: 'trade', kind: 'open', id: ME, with: FR }).join(), 'sfx:menu_open', 'trade opens');
      eq(ids({ type: 'trade', kind: 'done', id: ME, with: FR }).join(), 'sfx:buy', 'trade done');
      eq(ids({ type: 'flight_start', id: ME, to: 'x' }).join(), 'sfx:buff', 'flight');
      eq(ids({ type: 'flight_end', id: ME, to: 'x' }).join(), 'sfx:lantern_reveal', 'landed');
      eq(ids({ type: 'aura_add', dst: ME, src: ME, aura: 'mount_bay_horse' }).join(), 'sfx:equip', 'mounted');
      eq(ids({ type: 'mount_learn', id: ME, kind: 'bay_horse' }).join(), 'jingle:item_get', 'new mount');
      eq(ids({ type: 'ready_check', id: ME, kind: 'start', by: FR }).join(), 'sfx:oath_ring', 'ready check');
      eq(ids({ type: 'ready_check', id: ME, kind: 'done', allYes: true }).join(), 'sfx:lantern_reveal', 'all ready');
      eq(ids({ type: 'boss', id: 40, kind: 'pull', zone: 'world' }).join(), 'sfx:oath_ring', 'boss pull here');
      eq(ids({ type: 'boss', id: 40, kind: 'pull', zone: 'barrow' }).length, 0, 'a boss in another zone: silent');
      eq(ids({ type: 'dungeon_clear', id: ME, place: 'barrow' }).join(), 'jingle:quest_done', 'cleared');
      const f = soundsFor({ type: 'door_locked', id: ME, need: 10 }, ctx);
      eq(f.map((s) => s.id).join(), 'buzzer', 'locked door buzzes'); eq(f[0].key, 'fail', 'throttled with the other fails');
    },
  },
  {
    name: 'audio wave 5: a friend\'s hits, heals and spells are audible, marked as theirs; mobs and private events stay quiet',
    fn() {
      const hit = soundsFor({ type: 'damage', src: FR, dst: MOB, ability: 'auto', result: 'hit', amount: 5 }, ctx);
      eq(hit.map((s) => s.id).join(), 'staff_hit', 'friend auto uses their class swing (mender)');
      eq(hit[0].from, FR, 'marked from the friend'); assert(hit[0].key && hit[0].gap > 0, 'friend hits are throttled');
      eq(soundsFor({ type: 'heal', src: FR, dst: FR, amount: 20 }, ctx)[0].id, 'heal', 'friend heal');
      eq(soundsFor({ type: 'cast_start', src: FR, ability: 'scribe_inkbolt', castTicks: 40 }, ctx)[0].id, 'page_flutter', 'friend spell');
      const lv = soundsFor({ type: 'level', id: FR, level: 5 }, ctx);
      eq(lv[0].kind + ':' + lv[0].id, 'jingle:level_up', 'friend level'); assert(lv[0].volume < 1, 'friend level is softer');
      eq(ids({ type: 'damage', src: MOB, dst: FR, ability: 'auto', result: 'hit', amount: 5 }).length, 0, 'a mob hitting a friend: silent');
      eq(ids({ type: 'damage', src: FR, dst: MOB, periodic: true, amount: 2 }).length, 0, 'friend DoT tick: silent');
      eq(ids({ type: 'loot', id: FR, gold: 5, items: [] }).length, 0, 'friend loot: silent');
      eq(ids({ type: 'damage', src: 4, dst: MOB, ability: 'auto', result: 'hit', amount: 5 }).length, 0, 'not a hero: silent');
      // without isPlayer (older callers) a friend is silent, as before
      eq(soundsFor({ type: 'damage', src: FR, dst: MOB, ability: 'auto', result: 'hit', amount: 5 }, { me: ME }).length, 0, 'no isPlayer: silent');
      // join / leave are about a friend but never fall off with distance
      eq(ids({ type: 'join', id: FR, name: 'Ash' }).join(), 'sfx:confirm', 'friend joins');
      assert(soundsFor({ type: 'join', id: FR }, ctx)[0].from == null, 'join is not placed');
    },
  },
  {
    name: 'audio wave 5: friend falloff: full close by, smooth to zero at FRIEND.far, none in another zone; pan is clamped',
    fn() {
      eq(friendGain(0, 0), 1, 'on top of you');
      eq(friendGain(FRIEND.near, 0), 1, 'at near');
      eq(friendGain(FRIEND.far, 0), 0, 'at far');
      eq(friendGain(FRIEND.far * 3, 0), 0, 'past far');
      eq(friendGain(10, 10, false), 0, 'other zone');
      let prev = 1;
      for (let d = FRIEND.near; d <= FRIEND.far; d += 32) { const g = friendGain(d, 0); assert(g <= prev && g >= 0, `monotone at ${d}`); prev = g; }
      const mid = friendGain((FRIEND.near + FRIEND.far) / 2, 0);
      assert(mid > 0.1 && mid < 0.5, `halfway is quiet but audible (${mid})`);
      eq(friendGain(3, 4), friendGain(5, 0), 'distance, not axis');
      eq(friendPan(0), 0, 'centre'); eq(friendPan(1e6), FRIEND.pan, 'right clamp'); eq(friendPan(-1e6), -FRIEND.pan, 'left clamp');
      assert(FRIEND.volume < 1, 'friends are quieter than you');
    },
  },
  {
    name: 'audio wave 5: combat music: a real fight starts the battle track, a one-shot does not; it holds after combat',
    fn() {
      const P = COMBAT_MUSIC;
      // one stray hit, in combat for a while: no battle track
      let cm = createCombatMusic();
      cm.hit(0);
      for (let t = 0; t <= 5000; t += 100) eq(cm.update(true, t), null, `one hit at ${t}`);
      eq(cm.update(false, 5100), null, 'combat ends'); eq(cm.state, 'field', 'never left the field track');
      // a real fight
      cm = createCombatMusic();
      const acts = [];
      for (let t = 0; t <= 40000; t += 100) {
        if (t < 15000 && t % 1000 === 0) cm.hit(t);
        const a = cm.update(t < 15000, t);
        if (a) acts.push([a, t]);
      }
      eq(acts.length, 2, 'one start and one stop, not one per hit');
      eq(acts[0][0], 'start'); assert(acts[0][1] >= P.ENTER_MS && acts[0][1] < P.ENTER_MS + 1000, `starts after ENTER_MS (${acts[0][1]})`);
      eq(acts[1][0], 'stop'); assert(acts[1][1] >= 15000 + P.HOLD_MS, `holds HOLD_MS after combat (${acts[1][1]})`);
      // a second pull inside the hold keeps it going
      cm = createCombatMusic();
      for (let t = 0; t <= 3000; t += 500) { cm.hit(t); cm.update(true, t); }
      eq(cm.state, 'battle', 'battle');
      const a1 = []; for (let t = 3100; t < 30000; t += 100) { const inC = t < 5000 || (t > 7000 && t < 20000); const a = cm.update(inC, t); if (a) a1.push(a); }
      eq(a1.join(), 'stop', 'the break in the middle did not stop it');
      // a short fight plays at least MIN_BATTLE_MS
      cm = createCombatMusic();
      for (let t = 0; t <= 2600; t += 200) { cm.hit(t); cm.update(true, t); }
      let stopAt = null; for (let t = 2700; t < 40000 && stopAt == null; t += 100) if (cm.update(false, t) === 'stop') stopAt = t;
      assert(stopAt >= P.MIN_BATTLE_MS, `min battle length (${stopAt})`);
      // a boss pull starts it at once; reset (quit to title) stops it
      cm = createCombatMusic(); cm.boss(0); eq(cm.update(true, 10), 'start', 'boss pull'); eq(cm.reset(), 'stop', 'reset stops'); eq(cm.reset(), null, 'reset twice');
    },
  },
  {
    name: 'audio wave 5: menu sounds: open, close, tab, click and error from the UI state, one sound a frame',
    fn() {
      const heard = [];
      const us = createUiSounds((k) => heard.push(k));
      const st = { mode: 'game', open: new Set(), dialog: null, chest: null, confirm: null, err: null, toast: null };
      us.frame(st);                                   // first frame: nothing to compare
      st.open.add('bags'); us.press('menu:bags'); us.frame(st);
      st.open.add('character'); us.frame(st);
      us.press('b2:tab:skills'); us.frame(st);
      us.press('options:music'); us.frame(st);
      st.open.delete('bags'); us.frame(st);
      st.dialog = { page: 'talk' }; us.frame(st);
      st.dialog = null; us.frame(st);
      st.toast = { text: "You can't rest in combat.", until: 9 }; us.frame(st);
      st.toast = { text: 'Stored Bread.', until: 9 }; us.frame(st);
      us.frame(st);
      eq(heard.join(), 'open,open,tab,click,close,open,close,error', 'sounds in order');
      for (const k of new Set(heard)) assert(UI_SOUNDS[k] && manifest.sfx[UI_SOUNDS[k]], `ui ${k} has a file`);
      const quiet = createUiSounds(() => { throw new Error('no audio'); });
      quiet.frame(st); st.open.add('map'); quiet.frame(st);   // a throwing player never breaks the UI
    },
  },
  {
    name: 'audio wave 5: every start realm has its own track; every zone, region and road has an ambience bed on disk',
    fn() {
      const realms = ['rootbound', 'emberpeak', 'valewyn', 'saffron', 'hollow'];
      const tracks = realms.map((z) => musicFor({ zoneId: z, track: ZONES[z].music }));
      eq(new Set(tracks).size, realms.length, `five realms, five tracks (${tracks.join()})`);
      for (const t of [...tracks, ...Object.values(REALM_MUSIC)]) assert(manifest.music[t], `track ${t} on disk`);
      eq(musicFor({ zoneId: 'barrow', track: 'the_downs' }), 'the_downs', 'other zones keep their own track');
      for (const b of [...Object.values(ZONE_BEDS), ...Object.values(KIND_BEDS), ROAD_BED]) assert(manifest.ambience[b.id], `bed ${b.id} on disk`);
      for (const z of Object.values(ZONES)) assert(bedFor({ zoneId: z.id, zoneKind: z.kind, region: null }), `zone ${z.id} has a bed`);
      for (const r of ['willowmere', 'valley', 'downs', 'moor']) assert(bedFor({ zoneId: 'world', region: r }), `region ${r}`);
      const out = bedFor({ zoneId: 'world', region: 'moor' }), dun = bedFor({ zoneId: 'barrow', zoneKind: 'dungeon' }), cave = bedFor({ zoneId: 'rootcellar', zoneKind: 'cave' });
      assert(dun.volume < out.volume && cave.volume < out.volume, 'dungeons and caves are quieter');
      eq(bedFor({ zoneId: 'world', region: 'valley', night: true }).id, 'wind_valley', 'no birds at night');
      // the music key: a new zone or region re-picks, a road keeps what you came with
      const k1 = placeKey(null, { zoneId: 'world', region: 'moor' });
      eq(placeKey(k1, { zoneId: 'world', region: null }), k1, 'road keeps');
      assert(placeKey(k1, { zoneId: 'world', region: 'downs' }) !== k1, 'new region');
      assert(placeKey(k1, { zoneId: 'barrow', region: null }) !== k1, 'new zone (a dungeon has no regions)');
    },
  },
  {
    name: 'audio wave 5: over every sim event type, each sound the table can name is on disk, and most events now sound',
    fn() {
      const types = new Set();
      for (const f of fs.readdirSync(path.join(ROOT, 'src/sim')).filter((f) => f.endsWith('.js'))) for (const m of fs.readFileSync(path.join(ROOT, 'src/sim', f), 'utf8').matchAll(/type: '([a-z_]+)'/g)) types.add(m[1]);
      const kinds = ['start', 'stop', 'done', 'open', 'change', 'ready', 'close', 'answer', 'pull', 'phase', 'death', 'socket', 'remove', 'learn', 'recipe', 'unlearn', 'release', 'accept', 'turnin', 'equip', 'use', 'buy', 'sell', 'leap', 'blink'];
      let sounding = 0;
      for (const t of types) {
        const base = { type: t, src: ME, dst: MOB, id: ME, tagger: ME, amount: 5, castTicks: 20, ability: 'scribe_inkbolt', school: 'ink', zone: 'world', target: ME, by: ME, on: true, phase: 'done', food: 'bread' };
        let any = false;
        for (const ev of [base, ...kinds.map((kind) => ({ ...base, kind })), { ...base, src: FR, id: FR }]) {
          for (const s of soundsFor(ev, ctx)) {
            any = true;
            assert(s.kind === 'jingle' ? manifest.jingles[s.id] : manifest.sfx[s.id], `${t}: ${s.kind} ${s.id} not in the manifest`);
          }
        }
        if (any) sounding++;
      }
      assert(types.size >= 90, `sim event types found (${types.size})`);
      assert(sounding >= 65, `events with a sound: ${sounding} of ${types.size} (was 20 before wave 5)`);
    },
  },
  {
    name: 'audio wave 5: node no-op keeps the new calls silent and safe',
    async fn() {
      const a = createAudio();
      a.frame(0, { me: { id: 1, zone: 'world', x: 0, y: 0, inCombat: true }, snap: { entities: [] }, place: { region: 'moor' }, zone: ZONES.world });
      a.ui('click'); a.ui('tab'); a.jingle('level_up'); a.music('title');
      eq(a.debug().available, false, 'no audio in node');
    },
  },
];

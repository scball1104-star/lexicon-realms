// Synth in the game (wave 5b): which places get a synth theme, surfaces, creature voices, and the event -> synth
// sound table. All pure; the browser side (synth_game.js) is exercised by the integrate drivers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq } from './_helpers.mjs';
import { synthPlaceFor, synthTrackId, surfaceOf, familyVoice, SYNTH_FIELDS } from '../../src/audio/synth_places.js';
import { synthSoundsFor, npcVoice } from '../../src/audio/synth_table.js';
import { BANK_NAMES } from '../../src/audio/synth/render.js';
import { REALM_MUSIC } from '../../src/audio/beds.js';
import { createAudio } from '../../src/audio/audio.js';
import { DEFAULT_OPTIONS } from '../../src/ui/save.js';
import { ZONES } from '../../src/data/maps/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ME = 1, FRIEND = 7;
const ENTS = {
  5: { kind: 'mob', template: 'gorse_boar', x: 10, y: 10, zone: 'world' },
  6: { kind: 'mob', template: 'ink_wraith', x: 10, y: 10, zone: 'world' },
  8: { kind: 'npc', template: 'smith_edda', x: 10, y: 10, zone: 'world' },
  [ME]: { kind: 'player', x: 0, y: 0, zone: 'world' }, [FRIEND]: { kind: 'player', x: 40, y: 0, zone: 'world' },
};
const ctx = { me: ME, isPlayer: (id) => id === ME || id === FRIEND, ent: (id) => ENTS[id] || null, family: () => null };
const names = (ev) => synthSoundsFor(ev, ctx).map((s) => s.name);

export const tests = [
  {
    name: 'synth places: beside today\'s tracks (own tracks kept; the Hollow, dungeons, caves and roads get synth themes)',
    fn() {
      for (const [id, z] of Object.entries(ZONES)) {
        const spec = synthPlaceFor({ zoneId: id, zoneKind: z.kind, zoneName: z.name });
        if (z.kind === 'dungeon' || z.kind === 'cave') assert(spec && spec.under, `${id}: underground synth theme`);
        else if (SYNTH_FIELDS.has(id)) assert(spec && !spec.under, `${id}: synth field theme`);
        else eq(spec, null, `${id} keeps its own track`);
      }
      for (const [zone, track] of Object.entries(REALM_MUSIC)) if (zone !== 'hollow') eq(synthPlaceFor({ zoneId: zone, zoneKind: 'field' }), null, `${zone} keeps ${track}`);
      eq(synthPlaceFor({ zoneId: 'world', zoneKind: 'field', region: 'valley' }), null, 'a world region keeps its track');
      eq(synthPlaceFor({ zoneId: 'world', zoneKind: 'field', region: null, onRoad: false }), null, 'not yet on the road long enough');
      eq(synthPlaceFor({ zoneId: 'world', zoneKind: 'field', region: null, onRoad: true }).key, 'road', 'the roads');
      const b = synthPlaceFor({ zoneId: 'barrow', zoneKind: 'dungeon', zoneName: "The Wethers' Barrow" });
      eq(synthTrackId(b, 'night'), 'synth:barrow:day', 'no night underground');
      eq(synthTrackId(synthPlaceFor({ zoneId: 'hollow', zoneKind: 'field', zoneName: 'The Nameless Hollow' }), 'night'), 'synth:hollow:night', 'the Hollow at night');
      assert(b.seed !== synthPlaceFor({ zoneId: 'watchtower', zoneKind: 'dungeon', zoneName: 'The Watchtower' }).seed, 'seeded from the place name');
    },
  },
  {
    name: 'synth: surfaces under foot and creature voices by family',
    fn() {
      eq(surfaceOf('tallgrass'), 'grass', 'tall grass'); eq(surfaceOf('plaza'), 'stone', 'plaza'); eq(surfaceOf('shallow'), 'water', 'shallows');
      eq(surfaceOf('x1_crag_top'), 'stone', 'dungeon floor'); eq(surfaceOf('cliff_stairs_mid'), 'stone', 'stairs'); eq(surfaceOf(null), 'dirt', 'unknown');
      eq(familyVoice('gorse_boar'), 'boar', 'Gorse Boar'); eq(familyVoice('thornback_wolf'), 'wolf', 'wolf');
      eq(familyVoice('ink_wraith'), 'spirit', 'wraith'); eq(familyVoice('ink_slime'), 'ooze', 'slime'); eq(familyVoice('moss_scarab'), 'insect', 'scarab');
      eq(familyVoice('x', 'humanoid'), 'humanoid', 'by data family'); eq(familyVoice('x', 'construct'), 'construct', 'construct');
      // every voice the table can name is rendered into the bank
      for (const f of ['boar', 'wolf', 'bird', 'insect', 'ooze', 'spirit', 'construct', 'humanoid', 'small']) for (const m of ['aggro', 'hurt', 'death', 'flee']) assert(BANK_NAMES.includes(`voice:${f}:${m}`), `${f} ${m} in the bank`);
    },
  },
  {
    name: 'synth table: voices on aggro, hit and death; barks on talk; world sounds; busy events stay quiet',
    fn() {
      eq(names({ type: 'threat', mob: 5, top: ME }).join(), 'voice:boar:aggro', 'boar turns on me');
      eq(names({ type: 'threat', mob: 5, top: FRIEND }).join(), 'voice:boar:aggro', 'boar turns on a friend');
      eq(names({ type: 'threat', mob: 5, top: null }).length, 0, 'threat cleared');
      eq(names({ type: 'damage', src: ME, dst: 6, amount: 4 }).join(), 'voice:spirit:hurt', 'hit a wraith');
      eq(names({ type: 'damage', src: ME, dst: 6, amount: 4, periodic: true }).length, 0, 'DoT ticks quiet');
      eq(names({ type: 'damage', src: 5, dst: ME, amount: 4 }).length, 0, 'it hits me: the table has that');
      eq(names({ type: 'death', id: 5, kind: 'mob', killer: ME }).join(), 'voice:boar:death', 'a kill');
      eq(names({ type: 'death', id: 5, kind: 'mob', killer: 99 }).length, 0, 'someone else\'s kill');
      eq(names({ type: 'flee', id: 5 }).join(), 'voice:boar:flee', 'flee');
      const v = npcVoice('smith_edda');
      eq(JSON.stringify(npcVoice('smith_edda')), JSON.stringify(v), 'an NPC keeps one voice');
      eq(names({ type: 'interact', src: ME, id: 8, npc: 'smith_edda' }).join(), `bark:${v.shape}:${v.band}`, 'talk');
      eq(names({ type: 'interact', src: FRIEND, id: 8, npc: 'smith_edda' }).length, 0, 'a friend talks: quiet');
      assert(names({ type: 'quest_dialog', id: ME, npc: 'smith_edda', ent: 8, offers: [] })[0].startsWith('bark:'), 'quest window');
      eq(names({ type: 'yell', id: 5, text: 'x' }).join(), 'voice:boar:aggro', 'a foe yells');
      const lk = synthSoundsFor({ type: 'door_locked', id: ME }, ctx);
      assert(lk.length === 1 && lk[0].replace, 'a locked door rattles instead of buzzing');
      assert(synthSoundsFor({ type: 'chest_open', id: ME }, ctx)[0].replace, 'a chest opens');
      eq(names({ type: 'zone', id: ME, from: 'world', to: 'barrow', kind: 'dungeon' }).join(), 'door', 'through a dungeon door');
      eq(names({ type: 'zone', id: ME, from: 'world', to: 'hollow', why: 'flight' }).length, 0, 'a flight is not a door');
      eq(names({ type: 'windup_miss', id: 5, target: ME }).join(), 'whiff', 'a miss');
      eq(names({ type: 'cast_stop', src: ME, reason: 'cancel' }).join(), 'fizzle', 'a broken cast');
      eq(names({ type: 'cast_stop', src: ME, reason: 'done' }).length, 0, 'a finished cast');
      eq(names({ type: 'area', id: ME, name: 'Mill Lane' }).join(), 'chime:area', 'a new area');
      for (const t of ['target', 'spawn', 'despawn', 'xp', 'aura_remove', 'combo', 'bar', 'copy_new', 'loot_pending']) eq(names({ type: t, id: ME, src: ME }).length, 0, `${t} quiet`);
      for (const s of synthSoundsFor({ type: 'threat', mob: 5, top: ME }, ctx)) assert(BANK_NAMES.includes(s.name), `${s.name} in the bank`);
    },
  },
  {
    name: 'synth: a Settings switch (on by default) and a node no-op',
    fn() {
      eq(DEFAULT_OPTIONS.synth, true, 'on by default');
      const a = createAudio();
      eq(typeof a.setSynth, 'function', 'setSynth');
      a.setSynth(false); a.setSynth(true);
      const menus = fs.readFileSync(path.join(ROOT, 'src/ui/menus.js'), 'utf8');
      assert(menus.includes("choice('Synth sound', 'synth'"), 'the Settings choice');
    },
  },
];

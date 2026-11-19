// Audio: the event -> sound table (pure) and the node no-op. Also checks every id the table can name is in the manifest
// and every manifest file exists, so a missing copy fails here instead of going silent in the browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq } from './_helpers.mjs';
import { soundsFor, CLASS_HIT, SCHOOL_HIT, CAST_START, AURA_SOUNDS, UI_SOUNDS, JINGLE_RANK } from '../../src/audio/sfx_table.js';
import { createAudio } from '../../src/audio/audio.js';
import { ZONES } from '../../src/data/maps/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/audio/manifest.json'), 'utf8'));
const ids = (ev, cls = 'warden') => soundsFor(ev, { me: 1, cls }).map((s) => `${s.kind}:${s.id}`);

export const tests = [
  {
    name: 'audio table: hits, blocks, crits and class swings',
    fn() {
      eq(ids({ type: 'damage', src: 1, dst: 9, ability: 'warden_strike', school: 'physical', result: 'hit', amount: 5 }).join(), 'sfx:sword_slash', 'warden strike');
      eq(ids({ type: 'damage', src: 1, dst: 9, ability: 'auto', school: 'physical', result: 'hit', amount: 5 }, 'mender').join(), 'sfx:staff_hit', 'mender auto');
      eq(ids({ type: 'damage', src: 1, dst: 9, ability: 'scribe_inkbolt', school: 'ink', result: 'hit', amount: 5 }, 'scribe').join(), 'sfx:ink_gurgle', 'ink');
      eq(ids({ type: 'damage', src: 9, dst: 1, ability: 'auto', result: 'block', amount: 2 }).join(), 'sfx:defend', 'block');
      eq(ids({ type: 'damage', src: 1, dst: 9, ability: 'warden_strike', result: 'hit', crit: true, amount: 9 }).join(), 'sfx:crit', 'crit');
      eq(ids({ type: 'damage', src: 1, dst: 9, ability: 'warden_shield_bash', result: 'hit', amount: 9 }).join(), 'sfx:hit_heavy', 'heavy');
      eq(ids({ type: 'damage', src: 7, dst: 9, ability: 'auto', result: 'hit', amount: 9 }).length, 0, 'not mine: silent');
      eq(ids({ type: 'damage', src: 1, dst: 9, ability: 'scribe_x', periodic: true, result: 'hit', amount: 1 }).length, 0, 'DoT tick silent');
    },
  },
  {
    name: 'audio table: casts, shots, fails, kills, jingles, inventory',
    fn() {
      eq(ids({ type: 'cast_start', src: 1, ability: 'warden_taunt', castTicks: 0 }).join(), 'sfx:oath_ring', 'taunt');
      eq(ids({ type: 'cast_start', src: 1, ability: 'scribe_inkbolt', castTicks: 40 }).join(), 'sfx:page_flutter', 'scribe cast');
      eq(ids({ type: 'projectile', src: 1, ability: 'auto', speed: 480 }, 'wayfinder').join(), 'sfx:bow_shot', 'auto shot');
      eq(ids({ type: 'cast_fail', src: 1, ability: 'x', reason: 'gcd' }).length, 0, 'gcd fail quiet');
      const f = soundsFor({ type: 'cast_fail', src: 1, ability: 'x', reason: 'range' }, { me: 1 });
      eq(f[0].id, 'buzzer', 'range fail'); eq(f[0].key, 'cast_fail', 'throttle key');
      eq(ids({ type: 'death', id: 9, tagger: 1 }).join(), 'sfx:enemy_die', 'my kill');
      eq(ids({ type: 'death', id: 9, tagger: 4 }).length, 0, 'not my kill');
      eq(ids({ type: 'level', id: 1, level: 2 }).join(), 'jingle:level_up', 'level');
      eq(ids({ type: 'quest', id: 1, quest: 'q', kind: 'turnin' }).join(), 'jingle:quest_done', 'turnin');
      eq(ids({ type: 'loot', id: 1, gold: 3, items: [] }).join(), 'sfx:coin', 'gold loot');
      eq(ids({ type: 'loot', id: 1, gold: 0, items: [{ item: 'x', qty: 1, inst: { rarity: 'rare' } }] }).join(), 'jingle:item_get', 'rare loot');
      eq(ids({ type: 'aura_add', dst: 1, src: 9, aura: 'mob_stun' }).join(), 'sfx:stun', 'stun on me');
      eq(ids({ type: 'inventory', id: 1, kind: 'equip', item: 'x' }).join(), 'sfx:equip', 'equip');
      eq(ids({ type: 'inventory', id: 1, kind: 'buy', item: 'x' }).join(), 'sfx:buy', 'buy');
      eq(ids({ type: 'respawn', id: 1, zone: 'valley' }).join(), 'sfx:lantern_reveal', 'respawn');
      eq(soundsFor({ type: 'level', id: 1 }, {}).length, 0, 'no player: silent');
    },
  },
  {
    name: 'audio manifest: every id the table names exists and every file is on disk; every zone has its track',
    fn() {
      const sfxIds = new Set([...Object.values(CLASS_HIT), ...Object.values(SCHOOL_HIT), ...Object.values(CAST_START), ...AURA_SOUNDS.map((a) => a.id),
        ...Object.values(UI_SOUNDS), 'defend', 'crit', 'hit_heavy', 'hit_light', 'heal', 'page_flutter', 'buff', 'bow_shot', 'buzzer', 'enemy_die',
        'lantern_reveal', 'confirm', 'cursor', 'coin', 'equip', 'item_use', 'buy']);
      for (const id of sfxIds) assert(manifest.sfx[id], `sfx ${id} not in assets/audio/manifest.json`);
      for (const id of Object.keys(JINGLE_RANK)) assert(manifest.jingles[id], `jingle ${id}`);
      for (const z of Object.values(ZONES)) assert(manifest.music[z.music], `zone ${z.id} music ${z.music}`);
      assert(manifest.music.title, 'title music');
      for (const sec of ['music', 'sfx', 'jingles']) for (const [id, e] of Object.entries(manifest[sec])) {
        for (const s of [].concat(e.src || [])) assert(fs.existsSync(path.join(ROOT, 'assets/audio', s)), `${sec} ${id}: missing ${s}`);
      }
    },
  },
  {
    name: 'audio in node is a silent no-op that never throws',
    async fn() {
      const a = createAudio({ base: 'assets/audio/' });
      await a.unlock(); a.setVolumes({ master: 1, music: 0.5, sfx: 0.5 }); a.music('valley'); a.zone('valley'); a.sfx('crit'); a.ui('open');
      const off = a.attach({ on: () => () => {} }, { playerId: () => 1 });
      assert(typeof off === 'function', 'attach returns an off function');
      eq(a.debug().available, false, 'no audio in node');
    },
  },
];

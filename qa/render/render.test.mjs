// Pure render modules: day/night math, light bands, event -> effect mapping, sprite resolution, weather flags.
import { dayFraction, skyAt, ambientAt, KEYS, DAY_TICKS, DAY_START, clockLabel, luminance } from '../../src/render/daycycle.js';
import { bandBrightness, stampPixel, BANDS } from '../../src/render/lighting.js';
import { planEvent, planEvents, floaterMotion } from '../../src/render/fxplan.js';
import { fxFor, ABILITIES, SCHOOLS } from '../../src/render/fx_table.js';
import { charKey, charAnim, mobKey, mobAnim, MOB_ATLASES } from '../../src/render/sprites.js';
import { objectLook } from '../../src/render/objects.js';
import { normalizeWeather } from '../../src/render/renderer.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const kinds = (specs) => specs.map((s) => s.kind);

export const tests = [
  {
    name: 'day clock: 40 minutes a day from the tick, overrides win',
    fn() {
      eq(DAY_TICKS, 48000, 'ticks per day');
      assert(Math.abs(dayFraction({ tick: 0 }) - DAY_START) < 1e-9, 'tick 0 starts in the morning');
      assert(Math.abs(dayFraction({ tick: DAY_TICKS }) - DAY_START) < 1e-9, 'one day later wraps to the same time');
      assert(Math.abs(dayFraction({ tick: DAY_TICKS / 4 }) - ((DAY_START + 0.25) % 1)) < 1e-9, 'quarter day');
      eq(dayFraction({ tick: 999, dayTime: 0.5 }), 0.5, 'sim dayTime wins over tick');
      eq(dayFraction({ tick: 999, dayTime: 0.5 }, { tod: 0.9 }), 0.9, 'view.tod wins over everything');
      eq(dayFraction({}, { tod: 1.25 }), 0.25, 'wraps');
      eq(clockLabel(0.5), '12:00'); eq(clockLabel(0.75), '18:00'); eq(clockLabel(0), '00:00');
    },
  },
  {
    name: 'sky: noon is bright and unlit, night is dark with lamps lit, dusk and dawn are warm',
    fn() {
      const noon = skyAt(0.5), night = skyAt(0.95), dusk = skyAt(0.76), dawn = skyAt(0.255);
      assert(noon.lum > 0.95 && noon.lamps === 0 && noon.desat === 0, `noon ${JSON.stringify(noon)}`);
      eq(noon.phase, 'day'); eq(night.phase, 'night'); eq(dusk.phase, 'dusk'); eq(dawn.phase, 'dawn');
      assert(night.lum < 0.4 && night.lamps === 1, `night lamps ${night.lamps} lum ${night.lum}`);
      assert(dusk.amb[0] > dusk.amb[2] && dawn.amb[0] > dawn.amb[2], 'dusk and dawn lean warm (red over blue)');
      assert(night.amb[2] > night.amb[0], 'night leans cool');
      assert(dusk.lamps > 0.2 && dusk.lamps < 1, `lamps come on through dusk (${dusk.lamps})`);
      eq(night.sun.lean, 0, 'no sun lean at night');
      assert(skyAt(0.3).sun.lean < 0 && skyAt(0.7).sun.lean > 0, 'morning shadows lean west, evening east');
      assert(Math.abs(skyAt(0.3).sun.lean) <= 3 && Math.abs(skyAt(0.7).sun.lean) <= 3, 'lean stays small (crisp)');
      assert(noon.sun.alpha > night.sun.alpha, 'shadows fainter at night');
    },
  },
  {
    name: 'sky: continuous through every keyframe (no pops), wraps at midnight',
    fn() {
      let prev = ambientAt(0);
      for (let i = 1; i <= 2000; i++) {
        const cur = ambientAt(i / 2000);
        for (let c = 0; c < 3; c++) assert(Math.abs(cur.amb[c] - prev.amb[c]) < 0.03, `jump at ${i / 2000}`);
        prev = cur;
      }
      for (const [f] of KEYS) assert(f >= 0 && f <= 1, 'key in range');
      const a = ambientAt(0), b = ambientAt(0.99999);
      for (let c = 0; c < 3; c++) assert(Math.abs(a.amb[c] - b.amb[c]) < 0.01, 'midnight wraps');
      assert(luminance([1, 1, 1]) > 0.999, 'luminance');
    },
  },
  {
    name: 'light bands: bright centre, stepped falloff, dark past the edge, never brighter than the light',
    fn() {
      eq(bandBrightness(0, 0, 0), 1, 'centre');
      eq(bandBrightness(1.2, 0, 0), 0, 'past the edge');
      const vals = new Set();
      for (let i = 0; i < 100; i++) vals.add(bandBrightness(i / 100, i, i * 3));
      for (const v of vals) assert([...BANDS.map((b) => b[1]), 0].includes(v), `band value ${v} is one of the steps (no smooth gradient)`);
      const amb = [80, 84, 140];
      const p = stampPixel(amb, [255, 214, 150], 1, 1);
      assert(p[0] === 255 && p[1] === 214, 'full light at the centre');
      const q = stampPixel(amb, [255, 214, 150], 0, 1);
      assert(q.join() === amb.join(), 'ambient outside');
      const r = stampPixel(amb, [100, 100, 100], 1, 1);
      assert(r[2] === 140, 'lighten: a light never darkens a channel below ambient');
    },
  },
  {
    name: 'fx table: ability > class > school, every school has a colour',
    fn() {
      const bolt = fxFor('scribe_inkbolt');
      eq(bolt.projectile.sprite, 'ink_bolt'); eq(bolt.school, 'ink'); assert(bolt.castGlow, 'inkbolt glows while casting');
      eq(fxFor('wayfinder_quick_shot').projectile.sprite, 'arrow');
      eq(fxFor('warden_strike').impact, 'slash');
      eq(fxFor('inkblade_some_future_move').impact, 'flurry', 'unknown inkblade ability falls back to the class');
      eq(fxFor('warden_taunt').selfFx, 'taunt');
      eq(fxFor('auto').projectile, null, 'auto attacks fly nothing');
      eq(fxFor('mob_spit', 'nature').school, 'nature', 'an unknown ability takes the event school');
      for (const [k, v] of Object.entries(SCHOOLS)) assert(/^#[0-9a-f]{6}$/i.test(v.color), `${k} colour`);
      for (const id of Object.keys(ABILITIES)) assert(fxFor(id).color, `${id} resolves`);
    },
  },
  {
    name: 'events -> effects: cast start / success / fail',
    fn() {
      const a = planEvent({ type: 'cast_start', src: 1, ability: 'scribe_inkbolt', target: 9, castTicks: 40 });
      eq(kinds(a).join(), 'castglow');
      const b = planEvent({ type: 'cast_stop', src: 1, ability: 'scribe_inkbolt', target: 9, reason: 'done' });
      assert(kinds(b).includes('caststop') && !kinds(b).includes('projectile'), `success: ${kinds(b)} (bolts fly from the sim's projectile event)`);
      // the visual flies from the sim's projectile event at the sim's speed, so it lands with the damage
      const abilities = { scribe_inkbolt: { school: 'ink', projectile: { speed: 240 } }, mob_paper_cut: { school: 'ink', projectile: { speed: 220 } } };
      const p = planEvent({ type: 'projectile', id: 77, src: 1, dst: 9, ability: 'scribe_inkbolt', speed: 240 }, { abilities }).find((s) => s.kind === 'projectile');
      eq(p.src, 1); eq(p.dst, 9); eq(p.sprite, 'ink_bolt'); eq(p.speed, 240); eq(p.simId, 77);
      const shot = planEvent({ type: 'projectile', id: 78, src: 3, dst: 9, ability: 'auto', speed: 480 });
      eq(shot.find((s) => s.kind === 'projectile').sprite, 'arrow', 'Auto Shot flies an arrow'); assert(kinds(shot).includes('swing'), 'the shooter draws');
      const mob = planEvent({ type: 'projectile', id: 79, src: 5, dst: 1, ability: 'mob_paper_cut', speed: 220 }, { abilities }).find((s) => s.kind === 'projectile');
      eq(mob.sprite, 'orb'); eq(mob.color, SCHOOLS.ink.color, 'a mob bolt takes its school colour');
      eq(kinds(planEvent({ type: 'damage', src: 1, dst: 9, ability: 'scribe_inkbolt', school: 'ink', amount: 9, result: 'hit' }, { abilities })).includes('swing'), false, 'the landing bolt does not swing the caster again');
      for (const id of Object.keys(ABILITIES)) { const f = fxFor(id); assert(!f.projectile || f.projectile.speed == null, `${id}: speeds come from the ability data, not the fx table`); }
      const c = planEvent({ type: 'cast_stop', src: 1, ability: 'scribe_inkbolt', target: 9, reason: 'move' });
      eq(kinds(c).join(), 'caststop', 'interrupted cast: glow off, nothing flies');
      eq(kinds(planEvent({ type: 'cast_fail', src: 1, ability: 'x', reason: 'gcd' })).join(), 'caststop');
      eq(planEvent({ type: 'cast_start', src: 1, ability: 'warden_strike', castTicks: 0 }).length, 0, 'instant melee: no glow');
      eq(kinds(planEvent({ type: 'cast_stop', src: 1, ability: 'warden_taunt', target: 5, reason: 'done' })).join(), 'caststop,selffx');
      eq(planEvent({ type: 'cast_stop', src: 1, ability: 'slot1', target: null, reason: 'stub' }).length, 1, 'the stub cast draws nothing');
    },
  },
  {
    name: 'events -> effects: damage, crit, heal, misses, periodic',
    fn() {
      const hit = planEvent({ type: 'damage', src: 1, dst: 2, ability: 'warden_strike', school: 'physical', amount: 12, crit: false, result: 'hit' }, { playerId: 1 });
      assert(['swing', 'impact', 'hurt', 'number'].every((k) => kinds(hit).includes(k)), `hit: ${kinds(hit)}`);
      eq(hit.find((s) => s.kind === 'number').style, 'dmg');
      eq(hit.find((s) => s.kind === 'impact').sprite, 'slash');
      const crit = planEvent({ type: 'damage', src: 1, dst: 2, ability: 'warden_strike', amount: 30, crit: true, result: 'hit' }, { playerId: 1 });
      eq(crit.find((s) => s.kind === 'number').style, 'crit'); eq(crit.find((s) => s.kind === 'number').text, '30');
      const taken = planEvent({ type: 'damage', src: 2, dst: 1, ability: 'auto', amount: 5, result: 'hit' }, { playerId: 1 });
      eq(taken.find((s) => s.kind === 'number').style, 'taken', 'damage to me is red');
      const miss = planEvent({ type: 'damage', src: 1, dst: 2, ability: 'warden_strike', amount: 0, result: 'dodge' });
      eq(miss.find((s) => s.kind === 'number').word, 'DODGE'); assert(!kinds(miss).includes('impact'), 'a dodge has no impact');
      const dot = planEvent({ type: 'damage', src: 1, dst: 2, ability: 'mender_brand', school: 'light', amount: 3, result: 'hit', periodic: true });
      eq(dot.find((s) => s.kind === 'impact').sprite, 'tick'); assert(!kinds(dot).includes('swing'), 'a DoT tick does not swing');
      const heal = planEvent({ type: 'heal', src: 3, dst: 1, ability: 'mender_mend', amount: 31, crit: false });
      eq(heal.find((s) => s.kind === 'number').text, '+31'); eq(heal.find((s) => s.kind === 'number').style, 'heal');
      eq(heal.find((s) => s.kind === 'impact').sprite, 'heal');
      eq(planEvent({ type: 'heal', src: 3, dst: 1, ability: 'mender_mend', amount: 31, crit: true }).find((s) => s.kind === 'number').style, 'healcrit');
      eq(planEvent({ type: 'heal', src: 3, dst: 1, ability: 'mender_mend', amount: 0 }).filter((s) => s.kind === 'number').length, 0, 'full overheal shows no number');
    },
  },
  {
    name: 'events -> effects: auras, death, level up; unknown events are ignored',
    fn() {
      eq(planEvent({ type: 'aura_add', dst: 1, src: 1, aura: 'inkblade_fade' })[0].mode, 'add');
      eq(planEvent({ type: 'aura_remove', dst: 1, aura: 'inkblade_fade', reason: 'expire' })[0].mode, 'remove');
      eq(planEvent({ type: 'aura_add', dst: 1, src: 7, aura: 'snared' }, { playerId: 1 })[0].buff, false, 'a hostile aura on me is a debuff');
      eq(kinds(planEvent({ type: 'death', id: 4, killer: 1 })).join(), 'death');
      const lv = planEvent({ type: 'level', id: 1, level: 5 })[0];
      eq(lv.kind, 'levelup'); eq(lv.level, 5);
      eq(planEvent({ type: 'zone', id: 1 }).length, 0);
      eq(planEvent({ type: 'something_new' }).length, 0);
      eq(planEvents([{ type: 'death', id: 1 }, { type: 'level', id: 1, level: 2 }]).length, 2);
    },
  },
  {
    name: 'floating numbers: rise, fade, end; crits pop and last longer; whole pixels',
    fn() {
      const a = floaterMotion('dmg', 0.1), b = floaterMotion('dmg', 0.8);
      assert(b.dy < a.dy, 'rises'); assert(b.alpha < 1 && a.alpha === 1, 'fades late');
      eq(floaterMotion('dmg', 1.2), null, 'gone');
      assert(floaterMotion('crit', 1.2) !== null, 'crit lasts longer');
      for (let t = 0; t < 1.3; t += 0.013) for (const s of ['dmg', 'crit', 'heal', 'word']) {
        const m = floaterMotion(s, t, 3);
        if (m) assert(Number.isInteger(m.dx) && Number.isInteger(m.dy), `${s} at ${t}: whole pixels`);
      }
    },
  },
  {
    name: 'sprites: players use the class atlas and look; animation state from the snapshot and fx hints',
    fn() {
      eq(JSON.stringify(charKey({ kind: 'player', sprite: 'hero', cls: 'scribe', look: 2 })), JSON.stringify({ cls: 'scribe', look: 3 }));
      eq(JSON.stringify(charKey({ kind: 'npc', sprite: 'mender_b' })), JSON.stringify({ cls: 'mender', look: 2 }));
      eq(charKey({ kind: 'mob', sprite: 'briar_wolf' }), null);
      eq(charAnim({ dir: 'left', moving: true }, 0.2).anim, 'walk');
      eq(charAnim({ dir: 'left', cast: { ability: 'x' } }, 0.2).anim, 'cast');
      eq(charAnim({ dir: 'up' }, 1, { attackT0: 0.9, now: 1 }).anim, 'attack');
      eq(charAnim({ dir: 'up' }, 1, { hurtT0: 0.95, now: 1 }).anim, 'hurt');
      eq(charAnim({ dead: true, dir: 'up' }, 1).anim, 'dead');
      // every frame name the book can ask for exists in every class atlas
      for (const cls of ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade']) {
        const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sprites/chars', `${cls}.json`), 'utf8'));
        for (const look of [1, 2, 3]) for (const dir of ['down', 'left', 'right', 'up']) {
          for (const [anim, n] of [['idle', 2], ['walk', 4], ['attack', 3], ['cast', 2], ['hurt', 1]]) for (let i = 0; i < n; i++) {
            assert(j.frames[`look${look}_${anim}_${dir}_${i}`], `${cls} look${look}_${anim}_${dir}_${i}`);
          }
        }
        for (const look of [1, 2, 3]) assert(j.frames[`look${look}_dead_down_0`], `${cls} dead frame`);
      }
    },
  },
  {
    name: 'mob atlases: sprite then template picks the atlas; anims from moving / attack / hurt / cast / death hints',
    fn() {
      eq(mobKey({ kind: 'mob', sprite: 'ink_slime_deep', template: 'ink_slime' }), 'ink_slime_deep');
      eq(mobKey({ kind: 'mob', sprite: 'lq_only_thing', template: 'briar_wolf' }), 'briar_wolf');
      eq(mobKey({ kind: 'npc', sprite: 'briar_wolf' }), null);
      for (const id of MOB_ATLASES) {
        const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sprites/mobs', `${id}.json`), 'utf8'));
        assert(fs.existsSync(path.join(ROOT, 'assets/sprites/mobs', j.image)), `${id} sheet`);
        if (j.emissive) assert(fs.existsSync(path.join(ROOT, 'assets/sprites/mobs', j.emissive)), `${id} emissive`);
        for (const dir of ['down', 'left', 'right', 'up']) for (const [a, n] of [['idle', 2], ['walk', 4], ['attack', 3], ['hurt', 1], ['death', 3]]) for (let i = 0; i < n; i++) assert(j.frames[`${a}_${dir}_${i}`], `${id} ${a}_${dir}_${i}`);
        const e = { id: 3, dir: 'left' };
        eq(mobAnim(e, 1, { attackT0: 0.97, now: 1 }, j).name, `attack_left_${j.windupFrame.attack}`, `${id} windup first`);
        eq(mobAnim(e, 1, { attackT0: 0.88, now: 1 }, j).name, `attack_left_${j.hitFrame.attack}`, `${id} then the strike`);
        eq(mobAnim(e, 1, { hurtT0: 0.95, now: 1 }, j).anim, 'hurt');
        eq(mobAnim({ ...e, dead: true }, 1, { deathT0: 0, now: 1 }, j).name, 'death_left_2', 'death plays once and holds');
        eq(mobAnim({ ...e, dead: true }, 1, { deathT0: 0.95, now: 1 }, j).name, 'death_left_0');
        eq(mobAnim({ ...e, moving: true }, 1, null, j).anim, j.stationary ? 'idle' : 'walk', `${id} walk unless stationary`);
        if (j.frames.cast_left_0) eq(mobAnim({ ...e, cast: { ability: 'x' } }, 1, null, j).anim, 'cast');
      }
    },
  },
  {
    name: 'objects: every summon sprite in the data has a look; zones are ground, traps and hedges stand up',
    fn() {
      eq(objectLook('zone_letters'), 'ground'); eq(objectLook('zone_peal'), 'ground'); eq(objectLook('zone_semicolon'), 'ground');
      eq(objectLook('zone_bramble'), 'ground'); eq(objectLook('zone_ink'), 'ground'); eq(objectLook('trap_briar'), 'trap');
      eq(objectLook('hedge'), 'hedge'); eq(objectLook('ink_double'), 'double'); eq(objectLook('node'), 'node');
      eq(objectLook('zone_future'), 'ground'); eq(objectLook('mystery', 20), 'ground'); eq(objectLook('mystery'), 'unknown');
      const src = ['src/data/abilities.js', 'src/data/talents.js', 'src/sim/scripts.js'].map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');
      for (const m of src.matchAll(/sprite: '([a-z_]+)'/g)) assert(objectLook(m[1]) !== 'unknown', `summon sprite ${m[1]} has a look`);
    },
  },
  {
    name: 'fx sheet: every sprite the table names exists in assets/fx/fx.json (or has a procedural fallback)',
    fn() {
      const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/fx/fx.json'), 'utf8'));
      const procedural = new Set(['hit', 'burst', 'tick', 'healtick', 'orb', 'ring', 'arrowfall']);
      const named = new Set();
      for (const id of Object.keys(ABILITIES)) { const f = fxFor(id); if (f.impact) named.add(f.impact); if (f.projectile) named.add(f.projectile.sprite); if (f.selfFx) named.add(f.selfFx); }
      for (const n of named) assert(j.fx[n] || procedural.has(n), `fx "${n}" has no sheet animation and no fallback`);
      for (const [name, a] of Object.entries(j.fx)) {
        const frames = a.frames || Object.values(a.dirs).flat();
        for (const f of frames) assert(j.frames[f], `${name}: frame ${f} missing`);
      }
    },
  },
  {
    name: 'weather flags normalize from strings, objects and zone data',
    fn() {
      eq(normalizeWeather('rain').rain, 1);
      eq(normalizeWeather('leaves').leaves, true);
      eq(normalizeWeather(null, { weather: 'pollen' }).pollen, true);
      eq(normalizeWeather({ rain: 0.4 }).rain, 0.4);
      eq(normalizeWeather(undefined).rain, 0);
    },
  },
];

// Audio inventory for Lexicon Realms (read-only on the game). Prints a plain report and writes JSON.
// Copied from the look-dev lane (D:\lr_lookdev\harness, 2026-11-23) into the repo in wave 5; reads this checkout.
//
//   node qa/lookdev/audio_inventory.mjs [--game <repo root>] [--out qa/out/lookdev/audio_inventory.json]
//
// What it does: reads assets/audio/manifest.json (what sound files exist), every sim event type emitted in src/sim/*.js
// (regex over `type: '...'`), then asks the game's own sfx_table.soundsFor() which of those events make a sound for
// the local player, and which make one when a FRIEND (another hero) does them. Also maps each zone to its music track
// (beds.js musicFor) and ambience bed (bedFor), and finds manifest entries nothing ever plays.
// Last line: AUDIO_INVENTORY: files=<n> events=<n> sounding=<n> silent=<n> friend=<n>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const GAME = arg('--game', ROOT);
const OUT = arg('--out', path.join(GAME, 'qa/out/lookdev/audio_inventory.json'));
const imp = (p) => import(pathToFileURL(path.join(GAME, p)).href);

const man = JSON.parse(fs.readFileSync(path.join(GAME, 'assets/audio/manifest.json'), 'utf8'));
const { soundsFor, UI_SOUNDS, MUSIC_ALIAS } = await imp('src/audio/sfx_table.js');
const beds = await imp('src/audio/beds.js');

// every event type the sim emits (a regex: a few hits are data fields named type, not events; the JSON lists the file)
const simDir = path.join(GAME, 'src/sim');
const types = new Map();
for (const f of fs.readdirSync(simDir).filter((f) => f.endsWith('.js'))) {
  const s = fs.readFileSync(path.join(simDir, f), 'utf8');
  for (const m of s.matchAll(/type: '([a-z_]+)'/g)) { const t = types.get(m[1]) || new Set(); t.add(f); types.set(m[1], t); }
}
// probe soundsFor with the local player (id 1) in every role, plus the variants that switch on kind/result
const ME = 1, FR = 7;
const ctxFor = () => ({ me: ME, cls: 'scribe', zone: 'world', isPlayer: (id) => id === ME || id === FR, clsOf: () => 'warden' });
const KINDS = {
  quest: ['accept', 'progress', 'complete', 'turnin', 'fail'], inventory: ['equip', 'use', 'buy', 'sell'],
  rez: ['start', 'stop', 'done'], trade: ['open', 'change', 'ready', 'done', 'close'], ready_check: ['start', 'answer', 'done'],
  boss: ['pull', 'phase', 'death'], glyph: ['socket', 'remove'], prof: ['learn', 'rank', 'recipe', 'unlearn'], death_wait: ['release'],
  leap: ['leap', 'blink'],
};
const variants = (t) => {
  const base = { type: t, src: ME, dst: 9, id: ME, tagger: ME, killer: ME, amount: 10, castTicks: 20, ability: 'scribe_inkbolt', school: 'ink', zone: 'world', target: ME, by: ME, on: true };
  const v = [base, { ...base, src: 9, dst: ME }];
  for (const kind of KINDS[t] || []) v.push({ ...base, kind });
  if (t === 'loot') v.push({ ...base, gold: 3 }, { ...base, items: [{ inst: { rarity: 'rare' } }] });
  if (t === 'death') v.push({ ...base, id: 9 });
  if (t === 'aura_add') v.push({ ...base, aura: { id: 'stun' } }, { ...base, dst: ME, aura: 'mount_bay_horse' });
  if (t === 'damage') v.push({ ...base, crit: true }, { ...base, school: null, ability: 'warden_shield_bash' });
  if (t === 'projectile') v.push({ ...base, ability: 'wayfinder_aimed_shot' });
  if (t === 'cast_start') v.push({ ...base, ability: 'warden_taunt' });
  if (t === 'prof_work') v.push({ ...base, phase: 'done' });
  if (t === 'sit') v.push({ ...base, food: 'bread' });
  if (t === 'join' || t === 'leave') v.push({ ...base, id: FR });
  return v;
};
// the battle track is not an event sound: combat_music.js starts it from the hero's inCombat flag (the `combat` event)
const MUSIC_EVENTS = { combat: 'music:battle', zone: 'music:zone_track' };
// (zone: beds.js musicFor picks the new zone's track in audio.frame, so a zone change is heard as the music changing)
const rows = [];
for (const [t, files] of [...types].sort()) {
  const mine = new Set(), friend = new Set();
  if (MUSIC_EVENTS[t]) mine.add(MUSIC_EVENTS[t]);
  for (const ev of variants(t)) {
    for (const s of soundsFor(ev, ctxFor())) mine.add(`${s.kind}:${s.id}`);
    const swap = (x) => (x === ME ? FR : x);
    const fe = { ...ev, src: swap(ev.src), dst: swap(ev.dst), id: swap(ev.id), tagger: FR, killer: FR, target: 9, by: FR };
    for (const s of soundsFor(fe, ctxFor())) if (s.from === FR) friend.add(`${s.kind}:${s.id}`);
  }
  rows.push({ type: t, files: [...files].sort(), mine: [...mine].sort(), friend: [...friend].sort() });
}
// zone music and ambience (each world region and the roads, then every other zone)
const { buildContent } = await imp('src/data/maps/index.js');
const C = buildContent();
const zones = [];
for (const [id, z] of Object.entries(C.zones)) {
  const regs = (z.regions || []).filter((r) => r.id && id === 'world');
  for (const r of regs) zones.push({ id: `${id}/${r.id}`, kind: z.kind || 'field', music: beds.musicFor({ zoneId: id, track: MUSIC_ALIAS[r.music] || r.music }), ambience: beds.bedFor({ zoneId: id, zoneKind: z.kind, region: r.id }) });
  const track = MUSIC_ALIAS[z.music] || z.music || null;
  zones.push({ id: regs.length ? `${id}/roads` : id, kind: z.kind || 'field', music: regs.length ? '(keeps the music you came with)' : beds.musicFor({ zoneId: id, track }), ambience: beds.bedFor({ zoneId: id, zoneKind: z.kind, region: null }) });
}
// menu sounds and the battle track: who calls them
const grepSrc = (re, skip = ['vendor', 'audio']) => {
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!skip.includes(f.name)) walk(p); } else if (p.endsWith('.js') && re.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(GAME, p).replace(/\\/g, '/')); } };
  walk(path.join(GAME, 'src'));
  return hits;
};
const uiCalls = grepSrc(/audio\.ui\(|createUiSounds\(/);
const battleCalls = grepSrc(/pushMusic\(BATTLE|music\('battle'\)/, ['vendor']);
const files = ['music', 'sfx', 'jingles', 'ambience'].reduce((n, k) => n + Object.keys(man[k] || {}).length, 0);
const tableSrc = fs.readFileSync(path.join(GAME, 'src/audio/sfx_table.js'), 'utf8');
const unplayed = Object.keys(man.sfx).filter((k) => !tableSrc.includes(`'${k}'`));
const silent = rows.filter((r) => !r.mine.length);
const usedBeds = new Set(zones.map((z) => z.ambience && z.ambience.id).filter(Boolean));
const report = { date: new Date().toISOString().slice(0, 10), manifest: { music: Object.keys(man.music), sfx: Object.keys(man.sfx), jingles: Object.keys(man.jingles), ambience: Object.keys(man.ambience), source: man.generatedBy },
  events: rows, silentEvents: silent.map((r) => r.type), friendAudible: rows.filter((r) => r.friend.length).map((r) => r.type),
  zones, uiSoundCallSites: uiCalls, battleMusicCallSites: battleCalls, sfxNeverPlayedByEvents: unplayed, uiSounds: UI_SOUNDS, bedsUsed: [...usedBeds] };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

console.log(`Sound files: ${files} (music ${report.manifest.music.length}, sfx ${report.manifest.sfx.length}, jingles ${report.manifest.jingles.length}, ambience ${report.manifest.ambience.length}). Source: ${man.generatedBy}`);
console.log(`Sim event types: ${rows.length}. With a sound for the local player: ${rows.length - silent.length}. Silent: ${silent.length}.`);
console.log(`Audible when a FRIEND does it (${report.friendAudible.length}): ${report.friendAudible.length ? report.friendAudible.join(', ') : 'none'}`);
console.log(`Silent events: ${report.silentEvents.join(', ') || 'none'}`);
console.log(`Menu sound call sites outside src/audio: ${uiCalls.length ? uiCalls.join(', ') : 'none (menus are silent)'}`);
console.log(`battle music call sites: ${battleCalls.length ? battleCalls.join(', ') : 'none (battle.mp3 ships but never plays)'}`);
console.log(`sfx not named anywhere in sfx_table.js: ${unplayed.join(', ') || 'none'}`);
const byTrack = {};
for (const z of zones) (byTrack[z.music || 'none'] = byTrack[z.music || 'none'] || []).push(z.id);
console.log('Music by zone: ' + Object.entries(byTrack).map(([t, z]) => `${t} <- ${z.join(' ')}`).join(' | '));
console.log('Ambience by zone: ' + zones.map((z) => `${z.id}=${z.ambience ? `${z.ambience.id}@${z.ambience.volume}` : 'none'}`).join(', '));
console.log(`AUDIO_INVENTORY: files=${files} events=${rows.length} sounding=${rows.length - silent.length} silent=${silent.length} friend=${report.friendAudible.length}`);

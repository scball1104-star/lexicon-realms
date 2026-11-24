// Emotes (wave 7 anim lane, D:/LQOnline/wave7/anim/BRIEF.md, approved 2026-11-24): jump, wave, cheer and dance, carried
// to co-op friends through ONE cosmetic field on the hero, shaped like today's `sit`. Pure (no DOM, no clock, no rng).
// It never touches position, movement, stats, health, auras or the rng: the 3D renderer plays it (render3d/emote_kit.js).
// Sit stays the sim's own `sit` command (X, the ring and /sit send that), so resting works exactly as before.
//
//   const EM = createEmotes({ state, emit, mounted })   mounted(e) -> bool (riding a mount)
//   EM.handles(t)              'emote'
//   EM.command(e, cmd)         { t: 'emote', id: 'jump' | 'wave' | 'cheer' | 'dance' }: sets e.emote = { id, tick }
//   EM.tickPlayer(e)           ends it: moving, combat or a cast (not a jump), death, a mount, sitting, work, or its time is up
//   EM.publicOf(e)             snapshot field: emote ({ id, tick } | null)
//
// Rejects (cmd_reject reason): bad_emote, combat (not a jump), mounted, cooldown (a jump within 0.8 s of the last), busy.

export const EMOTE_IDS = ['jump', 'wave', 'cheer', 'dance'];
export const JUMP_COOLDOWN_TICKS = 16;            // 0.8 s at 20 Hz
// how long each lasts in ticks (null: until the hero moves): the renderer's own timings fit inside these
export const EMOTE_TICKS = { jump: 18, wave: 50, cheer: 40, dance: null };

/** `/wave`, `/cheer`, `/sit`, `/dance`, `/jump` typed in party chat -> the command to send, or null for plain chat. */
export function emoteFromChat(text) {
  const m = /^\s*\/(wave|cheer|sit|dance|jump)\s*$/i.exec(String(text == null ? '' : text));
  if (!m) return null;
  const id = m[1].toLowerCase();
  return id === 'sit' ? { t: 'sit' } : { t: 'emote', id };
}

export function createEmotes({ state, emit, mounted = () => false }) {
  const reject = (e, reason) => emit({ type: 'cmd_reject', id: e.id, cmd: 'emote', reason });
  function command(e, cmd) {
    const id = cmd && cmd.id;
    if (!EMOTE_IDS.includes(id)) return reject(e, 'bad_emote');
    if (mounted(e)) return reject(e, 'mounted');
    if (e.work) return reject(e, 'busy');                     // gathering or crafting (professions)
    if (id !== 'jump' && e.inCombat) return reject(e, 'combat');
    if (id === 'jump' && e.jumpTick != null && state.tick - e.jumpTick < JUMP_COOLDOWN_TICKS) return reject(e, 'cooldown');
    if (id === 'jump') e.jumpTick = state.tick;
    e.emote = { id, tick: state.tick };
  }
  function tickPlayer(e) {
    const em = e.emote;
    if (!em) return;
    const len = EMOTE_TICKS[em.id];
    if (e.dead || mounted(e) || e.work || e.sitting || (em.id !== 'jump' && (e.moving || e.inCombat || e.cast)) || (len != null && state.tick - em.tick >= len)) e.emote = null;
  }
  function publicOf(e) {
    return { emote: e.emote ? { id: e.emote.id, tick: e.emote.tick } : null };
  }
  return { handles: (t) => t === 'emote', command, tickPlayer, publicOf };
}

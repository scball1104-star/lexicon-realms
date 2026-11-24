// Combat music state machine (audio quick wins, wave 5): when the shipped battle track takes over from the field track
// and when it hands back. Pure: the caller passes the time, so node tests drive it (qa/tests/audio_combat.test.mjs).
//
//   const cm = createCombatMusic()
//   cm.hit(nowMs)                      a damage event that involves the local player (dealt or taken)
//   cm.boss(nowMs)                     a boss pull in the player's zone: the battle track starts on the next update
//   cm.update(inCombat, nowMs)         -> 'start' | 'stop' | null   (call every frame with the hero's inCombat flag)
//   cm.reset()                         -> 'stop' | null              (quit to title, hero gone)
//   cm.state                           'field' | 'arming' | 'battle' | 'holding'
//
// Not on every hit: the battle track starts only when a fight is real (in combat for ENTER_MS and at least MIN_HITS
// hits in the last HIT_WINDOW_MS), so a one-shot critter or a stray arrow keeps the field track. It holds HOLD_MS after
// combat ends (a second pull straight after keeps it going) and plays at least MIN_BATTLE_MS once started.

export const COMBAT_MUSIC = { ENTER_MS: 2500, MIN_HITS: 3, HIT_WINDOW_MS: 6000, HOLD_MS: 5000, MIN_BATTLE_MS: 12000 };

export function createCombatMusic(opts = {}) {
  const P = { ...COMBAT_MUSIC, ...opts };
  let state = 'field', since = 0, startedAt = 0, bossAt = -1e12;
  const hits = [];
  const recent = (now) => { while (hits.length && now - hits[0] > P.HIT_WINDOW_MS) hits.shift(); return hits.length; };
  const begin = (now) => { state = 'battle'; startedAt = now; return 'start'; };
  return {
    get state() { return state; },
    hit(now) { hits.push(now); if (hits.length > 64) hits.shift(); },
    boss(now) { bossAt = now; },
    update(inCombat, now) {
      switch (state) {
        case 'field':
          if (!inCombat) return null;
          if (now - bossAt < P.HIT_WINDOW_MS) return begin(now);
          state = 'arming'; since = now;
          return null;
        case 'arming':
          if (!inCombat) { state = 'field'; return null; }
          if (now - bossAt < P.HIT_WINDOW_MS) return begin(now);
          if (now - since >= P.ENTER_MS && recent(now) >= P.MIN_HITS) return begin(now);
          return null;
        case 'battle':
          if (!inCombat) { state = 'holding'; since = now; }
          return null;
        case 'holding':
          if (inCombat) { state = 'battle'; return null; }
          if (now - since >= P.HOLD_MS && now - startedAt >= P.MIN_BATTLE_MS) { state = 'field'; hits.length = 0; bossAt = -1e12; return 'stop'; }
          return null;
        default: return null;
      }
    },
    reset() {
      const was = state === 'battle' || state === 'holding';
      state = 'field'; hits.length = 0; bossAt = -1e12;
      return was ? 'stop' : null;
    },
  };
}

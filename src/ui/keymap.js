// Key bindings: one table of actions with default keys, the player's overrides (options.binds), and the translation
// layer that lets a rebound key drive src/input/input.js through its public driver API (press/release/inject), so the
// input module keeps its own defaults and needs no rebinding code. Pure (tests run it in Node).

export const ACTIONS = [
  { id: 'move_up', label: 'Move forward', key: 'KeyW', group: 'Movement' },
  { id: 'move_down', label: 'Move back', key: 'KeyS', group: 'Movement' },
  { id: 'move_left', label: 'Move left', key: 'KeyA', group: 'Movement' },
  { id: 'move_right', label: 'Move right', key: 'KeyD', group: 'Movement' },
  { id: 'mount', label: 'Ride / get off', key: 'KeyZ', group: 'Movement' },     // mounts (src/sim/mounts.js)
  { id: 'jump', label: 'Jump', key: 'Space', group: 'Movement' },            // wave 7 anim (src/ui/emote_ui.js)
  { id: 'emotes', label: 'Emotes', key: 'KeyG', group: 'Movement' },
  { id: 'slot1', label: 'Ability 1', key: 'Digit1', group: 'Combat' },
  { id: 'slot2', label: 'Ability 2', key: 'Digit2', group: 'Combat' },
  { id: 'slot3', label: 'Ability 3', key: 'Digit3', group: 'Combat' },
  { id: 'slot4', label: 'Ability 4', key: 'Digit4', group: 'Combat' },
  { id: 'slot5', label: 'Ability 5', key: 'Digit5', group: 'Combat' },
  { id: 'slot6', label: 'Ability 6', key: 'Digit6', group: 'Combat' },
  { id: 'slot7', label: 'Ability 7', key: 'Digit7', group: 'Combat' },
  { id: 'slot8', label: 'Ability 8', key: 'Digit8', group: 'Combat' },
  { id: 'next_target', label: 'Next target', key: 'Tab', group: 'Combat' },
  { id: 'interact', label: 'Interact', key: 'KeyF', group: 'Combat' },
  { id: 'sit', label: 'Sit / rest', key: 'KeyX', group: 'Combat' },
  { id: 'character', label: 'Character', key: 'KeyC', group: 'Menus' },
  { id: 'bags', label: 'Bags', key: 'KeyB', group: 'Menus' },
  { id: 'quests', label: 'Quest log', key: 'KeyL', group: 'Menus' },
  { id: 'talents', label: 'Talents', key: 'KeyN', group: 'Menus' },
  { id: 'map', label: 'World map', key: 'KeyM', group: 'Menus' },
  { id: 'help', label: 'Help (all controls)', key: 'KeyH', group: 'Menus' },
  { id: 'menu', label: 'Menu / close', key: 'Escape', group: 'Menus', fixed: true },
];
export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
export const MENU_ACTIONS = ['character', 'bags', 'quests', 'talents', 'map', 'help'];
const MOVE_DEFAULT = { move_up: 'KeyW', move_down: 'KeyS', move_left: 'KeyA', move_right: 'KeyD' };

/** Effective code for every action. */
export function effectiveBinds(overrides = {}) {
  const out = {};
  for (const a of ACTIONS) out[a.id] = (!a.fixed && overrides[a.id]) || a.key;
  return out;
}

/** The action a key code triggers under `binds` (null if none). */
export function actionFor(code, binds) {
  for (const a of ACTIONS) if (binds[a.id] === code) return a.id;
  return null;
}

/** Rebind: returns new overrides. A key taken by another action is swapped onto it so no action is left unbound. */
export function rebind(overrides, actionId, code) {
  const a = ACTION_BY_ID[actionId];
  if (!a || a.fixed || code === 'Escape') return { ...overrides };
  const binds = effectiveBinds(overrides);
  const next = { ...overrides };
  const other = actionFor(code, binds);
  if (other && other !== actionId) next[other] = binds[actionId];
  next[actionId] = code;
  for (const k of Object.keys(next)) if (next[k] === ACTION_BY_ID[k].key) delete next[k];
  return next;
}

/**
 * How a key event is handled. Returns one of:
 *   { kind: 'ui', action }                  a menu key: the UI handles it and stops the event
 *   { kind: 'pass' }                        default meaning, let src/input see the event unchanged
 *   { kind: 'drive', action, ops }          a rebound key: stop the event and drive input with `ops`
 *   { kind: 'swallow' }                     a default input key that has been rebound away: stop it
 * ops: [['press', code] | ['release', code] | ['inject', intent]]
 */
export function routeKey(code, down, overrides) {
  const binds = effectiveBinds(overrides);
  const defaults = effectiveBinds({});
  const act = actionFor(code, binds);
  const def = actionFor(code, defaults);
  if (act && (MENU_ACTIONS.includes(act) || act === 'menu' || act === 'interact' || act === 'sit' || act === 'mount')) return { kind: 'ui', action: act };
  if (act && act === def) return { kind: 'pass' };
  if (!act) {
    // arrows always move (input's own second set); anything an input default used and that moved away is swallowed
    if (def && !MENU_ACTIONS.includes(def)) return { kind: 'swallow' };
    return { kind: 'pass' };
  }
  if (MOVE_DEFAULT[act]) return { kind: 'drive', action: act, ops: [[down ? 'press' : 'release', MOVE_DEFAULT[act]]] };
  if (!down) return { kind: 'drive', action: act, ops: [] };
  const m = /^slot(\d)$/.exec(act);
  if (m) return { kind: 'drive', action: act, ops: [['inject', { k: 'cast', slot: Number(m[1]) }]] };
  if (act === 'next_target') return { kind: 'drive', action: act, ops: [['inject', { k: 'tab', back: false }]] };
  return { kind: 'pass' };
}

export function keyLabel(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  const map = { Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Space: 'Space',
    ShiftLeft: 'Shift', ShiftRight: 'RShift', ControlLeft: 'Ctrl', Backquote: '`', Minus: '-', Equal: '=', Enter: 'Enter',
    Backspace: 'Bksp', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
  return map[code] || code;
}

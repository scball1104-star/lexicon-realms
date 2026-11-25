// Talking with friends (wave 8 talk lane, D:/LQOnline/wave8/talk/BRIEF.md, approved 2026-11-24): the talk model, pure
// (no DOM, no clock of its own), so node tests run it. The drawing is src/ui/chat_ui.js, the wiring src/net/coop.js, the
// protocol src/net/session.js. No voice chat (Scott). History lives in memory only. Every player-facing string is a DRAFT.
//
//   parseLine(text, { names })      what a typed line means: { kind: 'party' | 'whisper' | 'reply' | 'emote' | 'mute' |
//                                   'unmute' | 'help' | 'bad', to?, text?, cmd? }
//   PHRASES                         the phone quick phrases (tap, no keyboard)
//   createFlood()                   host side: at most 5 lines per 10 s per sender, the rest dropped with one notice
//   createMutes(storage)            this device only: hero names whose words are hidden for you
//   bubbleFor(text, wrap, maxW)     the speech bubble's lines (2 at most, clipped) and how long it stays (ticks of 50 ms)
//   stamp(date)                     "7:42" in the viewer's own clock

export const CHAT_MAX = 140;                  // today's limit (src/net/session.js), unchanged
export const HISTORY_MAX = 200;               // lines kept in memory for the log window; never written to disk
export const FLOOD_LINES = 5, FLOOD_MS = 10000;

/** Phone quick phrases (DRAFT words for Scott). Each is sent as an ordinary party line. */
export const PHRASES = [
  'Hello!', 'Follow me', 'Wait for me', 'Ready?',
  'On my way', 'Thanks!', 'Help!', 'Good fight',
];

/** Commands (DRAFT). /wave /cheer /sit /dance /jump stay as wave 7 made them. */
export const COMMANDS = [
  ['/w Name words', 'whisper to one friend'],
  ['/r words', 'reply to your last whisper'],
  ['/p words', 'back to party'],
  ['/mute Name', 'hide their words (this device)'],
  ['/unmute Name', 'show them again'],
  ['/wave /cheer /sit /dance /jump', 'emotes'],
];

/** DRAFT: said once per game, the first time you whisper (guests reach each other through the host's tab). */
export const WHISPER_NOTE = "Whispers pass through the host's game on their way. Say nothing you would not want the host to see.";
export const WATCH_READ_ONLY = 'Watchers can read the chat. The host can let watchers talk.';   // DRAFT

/** Log channels the chat window puts on its Combat tab (everything else is on All). */
export const COMBAT_CH = ['combat', 'damage_in', 'damage_out', 'heal'];

/** Which log lines a chat window tab shows. l: a ui.log line { ch, text, talk? }. Pure (tests). */
export function tabHas(tab, l) {
  const t = l.talk;
  if (tab === 'party') return !!t && t.kind !== 'whisper';
  if (tab === 'whispers') return !!t && t.kind === 'whisper';
  if (tab === 'combat') return COMBAT_CH.includes(l.ch);
  return !COMBAT_CH.includes(l.ch);
}

/** The words a talk line shows in the log (logText and the 2D log keep these): party "[Party] Name: text", whispers
 *  "Name whispers: text" / "To Name: text". DRAFT wording. */
export function talkText(t) {
  if (t.kind === 'whisper') return t.out ? `To ${t.to}: ${t.body}` : `${t.from} whispers: ${t.body}`;
  if (t.kind === 'party') return `[Party] ${t.from}: ${t.body}`;
  return t.body;
}

const EMOTE = /^\/(wave|cheer|sit|dance|jump)$/i;

export function parseLine(raw, { names = [] } = {}) {
  const text = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, CHAT_MAX + 24);
  if (!text) return { kind: 'bad', why: 'empty' };
  if (text[0] !== '/') return { kind: 'party', text: text.slice(0, CHAT_MAX) };
  const [head, ...rest] = text.split(/\s+/);
  const em = EMOTE.exec(head);
  if (em && !rest.length) { const id = em[1].toLowerCase(); return { kind: 'emote', cmd: id === 'sit' ? { t: 'sit' } : { t: 'emote', id } }; }
  const cmd = head.toLowerCase();
  // a name match ignores case; names are what the host's frames call each hero (no accounts, so a name is all there is)
  const who = (s) => names.find((n) => n.toLowerCase() === String(s || '').toLowerCase()) || null;
  if (cmd === '/w' || cmd === '/whisper' || cmd === '/tell') {
    const to = who(rest[0]);
    if (!to) return { kind: 'bad', why: 'no_one', name: rest[0] || '' };
    const body = rest.slice(1).join(' ').slice(0, CHAT_MAX);
    return body ? { kind: 'whisper', to, text: body } : { kind: 'bad', why: 'empty' };
  }
  if (cmd === '/r' || cmd === '/reply') { const body = rest.join(' ').slice(0, CHAT_MAX); return body ? { kind: 'reply', text: body } : { kind: 'bad', why: 'empty' }; }
  if (cmd === '/p' || cmd === '/party') { const body = rest.join(' ').slice(0, CHAT_MAX); return body ? { kind: 'party', text: body } : { kind: 'bad', why: 'empty' }; }
  if (cmd === '/mute' || cmd === '/unmute') { const to = who(rest[0]); return to ? { kind: cmd.slice(1), to } : { kind: 'bad', why: 'no_one', name: rest[0] || '' }; }
  if (cmd === '/help' || cmd === '/?') return { kind: 'help' };
  return { kind: 'bad', why: 'unknown', name: head };
}

/** DRAFT words for a line that could not be sent. */
export function badText(p) {
  if (p.why === 'no_one') return p.name ? `No one called ${p.name} is in this game.` : 'Whisper to whom? Type /w and their name.';
  if (p.why === 'unknown') return `${p.name} is not a command. Type /help for the list.`;
  return '';
}

/** Host side flood guard: sender key -> times of their recent lines. ok(key, nowMs) -> true to relay, 'warn' once. */
export function createFlood() {
  const seen = new Map(), warned = new Set();
  return {
    ok(key, t) {
      const list = (seen.get(key) || []).filter((x) => t - x < FLOOD_MS);
      seen.set(key, list);
      if (list.length >= FLOOD_LINES) { if (warned.has(key)) return false; warned.add(key); return 'warn'; }
      warned.delete(key);
      list.push(t); return true;
    },
  };
}

/** This device only (localStorage in a build): muted hero names. Muting never tells the other player. */
export function createMutes(storage = null, key = 'lr_mutes') {
  let set = new Set();
  try { set = new Set(JSON.parse((storage && storage.getItem(key)) || '[]')); } catch { set = new Set(); }
  const save = () => { try { if (storage) storage.setItem(key, JSON.stringify([...set].slice(0, 100))); } catch { /* private window */ } };
  const k = (n) => String(n || '').toLowerCase();
  return {
    has: (n) => set.has(k(n)),
    mute(n) { set.add(k(n)); save(); },
    unmute(n) { set.delete(k(n)); save(); },
    get list() { return [...set]; },
  };
}

/** A speech bubble: at most 2 lines (the rest clipped with ".."), and its time on screen: 4 s plus 1 s per 20 letters,
 *  at most 9 s (ticks of 50 ms). wrap(text, w) -> lines (the game's own font wrap). */
export function bubbleFor(text, wrap, maxW) {
  const lines = wrap(text, maxW);
  const out = lines.slice(0, 2);
  if (lines.length > 2) out[1] = `${out[1].replace(/\s*\S{0,2}$/, '')}..`;
  return { lines: out, ticks: Math.min(180, 80 + Math.ceil(text.length / 20) * 20) };
}

export function stamp(d) {
  const h = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

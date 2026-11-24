// Menu sounds from the UI's own state (audio quick wins, wave 5): one observer instead of a call at every open/close
// site. Pure: no DOM, no audio; the caller passes play(kind) (main.js: audio.ui). Node-tested (qa/tests/audio_ui.test.mjs).
//
//   const us = createUiSounds((kind) => audio.ui(kind))
//   us.press(label)      a button or tab was pressed this frame (ui.js press(): regions with an `on`)
//   us.frame(st)         once per drawn frame with the UI state: plays at most one sound
//
// What it hears: a window, dialog, chest or confirm box opening -> 'open'; closing -> 'close'; a screen change on the
// title (select, create) -> 'open'; a new create-screen error or an error toast -> 'error'; a tab -> 'tab'; any other
// button -> 'click'. A press that opened or closed something plays only the open/close sound.

const ERROR_TOAST = /^(you can't|you cannot|can't|cannot|not enough|too far|no room|your bags are full|you need|you are dead|you must)/i;

export function uiSignature(st) {
  if (!st) return { count: 0, mode: null, err: null, toast: null };
  let n = st.open ? st.open.size : 0;
  if (st.dialog) n++;
  if (st.chest) n++;
  if (st.confirm) n++;
  return { count: n, mode: st.mode || null, err: st.err || null, toast: st.toast || null };
}

export function createUiSounds(play) {
  let last = null, pending = null;
  const say = (k) => { try { play(k); } catch { /* audio never breaks the UI */ } };
  return {
    press(label) { pending = /tab/.test(String(label || '')) ? 'tab' : 'click'; },
    frame(st) {
      const s = uiSignature(st);
      const p = last;
      last = s;
      const click = pending;
      pending = null;
      if (!p) return null;
      let k = null;
      if (s.err && s.err !== p.err) k = 'error';
      else if (s.toast && s.toast !== p.toast && ERROR_TOAST.test(String(s.toast.text || ''))) k = 'error';
      else if (s.mode !== p.mode) k = s.mode === 'game' ? null : 'open';     // entering the world: the zone music says it
      else if (s.count > p.count) k = 'open';
      else if (s.count < p.count) k = 'close';
      else if (click) k = click;
      if (k) say(k);
      return k;
    },
  };
}

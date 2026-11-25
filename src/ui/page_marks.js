// Classes on <html> that let the page's own HTML over the canvas (src/net/netui.js: the co-op bar, the chat line) step
// aside when the canvas needs the room (wave 9 fixes). Written only when a mark changes; safe with no page (node tests).
//   lr-photo   photo mode is open (photo_ui.js): the whole HUD steps aside, the bar and chat line too
//   lr-window  a phone has a window open (ui.js): the bar sits over the window's top left (the talents nodes), so it hides
const marks = new Map();
export function markPage(name, on) {
  on = !!on;
  if (marks.get(name) === on) return;
  marks.set(name, on);
  try { if (typeof document !== 'undefined' && document.documentElement) document.documentElement.classList.toggle(name, on); } catch (e) { /* no page */ }
}

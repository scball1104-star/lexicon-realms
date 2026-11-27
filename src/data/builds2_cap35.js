// Cap 35 (stage 1, the Millrace; BRIEF_cap35_millrace.md, Scott approved 2026-11-27): five more points per named build for
// levels 31 to 35, on the build's own tracks (ranks the first 30 points left unfilled; one fork where a build had none
// in that pair). No new skills. The third signature at 35 needs no data here: SIGNATURE_LEVELS is already [10, 20, 35]
// and each build's `signatures` order names it. Gated by qa/sim/builds2.mjs at every level to 35.
import { rep, pathMaker } from './builds2_kit.js';

const W = pathMaker('warden'), M = pathMaker('mender'), S = pathMaker('scribe'), F = pathMaker('wayfinder'), I = pathMaker('inkblade');
export const PAST_30 = {
  // Warden
  shieldwheel: [...rep(W('oathkeeper', 'retribution'), 2), ...rep(W('stride', 'long_stride'), 3)],
  forge_reaver: [...rep(W('bulwark', 'steady_shield'), 3), W('cinder', 'kindled_resolve'), W('cinder', 'wide_arc')],
  spellbreaker: [...rep(W('oathblade', 'momentum'), 2), ...rep(W('oathblade', 'finishing_cut'), 2), W('stride', 'long_stride')],
  // Mender
  tidehammer: [...rep(M('sunfire', 'kindling'), 2), M('sunfire', 'flare'), ...rep(M('hearth', 'quick_words'), 2)],
  lamplighter: [...rep(M('wardlight', 'steadfast_ward'), 3), ...rep(M('wardlight', 'blessed_cloth'), 2)],
  battle_mender: [...rep(M('hearth', 'gentle_hands'), 3), ...rep(M('hearth', 'quick_words'), 2)],
  // Scribe
  ellipsis_duelist: [...rep(S('shorthand', 'light_feet'), 5)],
  author_of_beasts: [...rep(S('margin', 'long_pause'), 3), ...rep(S('inkwell', 'spill_over'), 2)],
  wordstorm: [...rep(S('quill', 'underscore'), 3), ...rep(S('inkwell', 'reclaim'), 2)],
  // Wayfinder
  falconer: [...rep(F('running', 'agile_fingers'), 3), ...rep(F('trailcraft', 'forager'), 2)],
  stormcaller: [...rep(F('running', 'snap_shot'), 2), ...rep(F('running', 'agile_fingers'), 3)],
  grapple_skirmisher: [F('running', 'loose'), F('running', 'snap_shot'), ...rep(F('windrunner', 'spring'), 2), F('close', 'point_blank')],
  // Inkblade
  night_letter: [...rep(I('edge', 'ruthless'), 3), ...rep(I('spellcutter', 'quick_cut'), 2)],
  fan_dancer: [I('edge', 'long_bleed'), ...rep(I('edge', 'ruthless'), 4)],
  venom_knife: [I('spellcutter', 'quick_cut'), ...rep(I('spellcutter', 'hunter_of_words'), 3), I('inkbody', 'ink_leech')],
};

/** Join the cap 35 points onto the class data (called once by src/data/builds2.js, after joinL30). */
export function joinCap35(BUILDS2) {
  for (const c of Object.values(BUILDS2)) for (const b of c.builds) if (PAST_30[b.id] && b.path.length === 30) b.path.push(...PAST_30[b.id]);
}

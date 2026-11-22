// The open world feeling more alive (2026-11-22): rare named foes, rest XP, story chains and a world event, merged
// onto the content object once (src/data/maps/index.js buildContent calls applyWorldLife). Plain data; the rules are in
// src/sim/worldlife.js. docs/CONTRACTS.md "World life" lists the shapes.
import { RARES, RARE_RULES, RARE_TRAIT, RARE_ITEMS, RARE_MOBS, RARE_SPRITES, RARE_RUNTIME, rareSpawns, makeGear } from './rares.js';
import { STORY_CHAINS, CHAIN_REWARDS } from './story_chains.js';
import { WORLD_EVENTS } from './world_events.js';
import { mobSprite } from './mobs.js';

// Rest XP (docs/design/BUILDS_2.md 5.6 "Lantern rest", approved): real time logged out while the hero last stood in a
// safe (town or hub) area or within `lanternTiles` of a lantern banks bonus XP; kills pay double (`killMult`) until the
// bank is spent. The bank fills at `levelsPerHour` of the hero's current level per hour (a full day away fills it) and
// holds at most `capLevels` levels' worth. None at the level cap. The client measures the time away (main.js savedAt).
export const REST = { levelsPerHour: 1.5 / 24, capLevels: 1.5, lanternTiles: 3, killMult: 2, maxOfflineHours: 24 * 30 };

export { RARES, STORY_CHAINS, WORLD_EVENTS };

const CHAIN_ITEMS = Object.fromEntries(CHAIN_REWARDS.map(([id, name, slot, type, ilvl, stats, rarity]) => [id, makeGear(id, name, slot, type, ilvl, rarity, stats, { reward: true })]));

/** Quests with the story chains applied (a new object per changed quest; ids, objectives and order unchanged). */
export function applyChains(quests) {
  const out = { ...quests };
  const later = {};
  for (const ch of STORY_CHAINS) {
    ch.steps.forEach((id, i) => {
      const q0 = out[id];
      if (!q0) throw new Error(`story chain ${ch.id}: no quest ${id}`);
      const q = { ...q0, text: { ...q0.text }, requires: { ...(q0.requires || {}), quests: [...((q0.requires || {}).quests || [])] }, rewards: { ...q0.rewards } };
      for (const r of (ch.addRequires || {})[id] || []) if (!q.requires.quests.includes(r)) q.requires.quests.push(r);
      const li = (ch.leadIns || {})[id] || {};
      if (li.offer) q.text.offer = `${li.offer} ${q.text.offer}`;
      if (li.complete) q.text.complete = `${q.text.complete} ${li.complete}`;
      q.story = { id: ch.id, name: ch.name, step: i + 1, of: ch.steps.length };
      if (i === ch.steps.length - 1) {
        q.rewards.gold = (q.rewards.gold || 0) + (ch.reward.gold || 0);
        q.rewards.items = [...(q.rewards.items || []), ...(ch.reward.items || [])];
        q.story.end = { title: ch.story.title, lines: [...ch.story.lines] };
      }
      out[id] = q;
      later[id] = ch.steps.slice(i + 1);
    });
  }
  return { quests: out, later };
}

/** The content object with the world life merged in (buildContent's result, unchanged where nothing is added). */
export function applyWorldLife(C) {
  const P = C.progression;
  const progression = P ? { ...P, mobTraits: { ...(P.mobTraits || {}), rare: RARE_TRAIT } } : P;
  const { quests, later } = C.quests ? applyChains(C.quests) : { quests: C.quests, later: {} };
  const eventSpawns = [];
  for (const ev of WORLD_EVENTS) for (const s of ev.spawns) {
    eventSpawns.push({ zone: C.worldId, mob: s.mob, level: s.level, x: s.x, y: s.y, wander: 2, respawn: 120, group: 'stones_night', region: ev.region,
      night: true, sprite: mobSprite(s.mob, s.level) });
  }
  return {
    ...C,
    progression,
    mobs: { ...C.mobs, ...RARE_MOBS },
    mobSprites: { ...(C.mobSprites || {}), ...RARE_SPRITES },
    items: { ...C.items, ...RARE_ITEMS, ...CHAIN_ITEMS },
    quests,
    storyLater: later,                              // quest id -> the later steps of its chain (src/sim/quests.js status)
    spawns: [...(C.spawns || []), ...rareSpawns(C.worldId)],
    nightSpawns: [...(C.nightSpawns || []), ...eventSpawns],
    rares: RARE_RUNTIME, rareRules: RARE_RULES,
    rest: REST,
    worldEvents: WORLD_EVENTS,
  };
}

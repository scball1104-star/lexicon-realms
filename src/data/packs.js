// Camps that pull as a pack (combat role pass, Scott 2026-11-19: "Spells and skills and attacks should consider DPS, AOE").
// Plain data. Each entry names a camp (its zone spawn `group`); every spawn in that group gets `pack: <size>`, which the sim
// reads two ways: the members are lighter (PROGRESSION packs: a pair is 2 x 0.85 health, a trio 3 x 0.66, so a pack is
// about 1.6 to 2 normal foes), and pulling one pulls the rest of its camp (src/sim/ai.js engage).
//
// The zone modules are generated (tools/maps/build_world.mjs), so the tag lives here and is added in
// src/data/maps/index.js allSpawns(); the camp layouts themselves are unchanged. These camps already stand in tight pairs or
// threes on the map, so they already pulled together at full strength; tagging them makes them a fair fight.
//
// Not packs on purpose: the first quests' camps (the south meadow slimes, Cobb's scarabs, the east bank, the north landing)
// stay single pulls. Packs start with the Pilgrim Road pairs (levels 3 to 4, which pulled as full-strength pairs before).
export const PACKS = {
  valley: {
    // Pilgrim Road briar wolves, levels 3 to 4: pairs
    pr_wolves_a: 2, pr_wolves_b: 2, pr_wolves_c: 2, pr_wolves_d: 2, pr_wolves_e: 2,
    // Whisperwood thornbacks, levels 5 to 6: pairs
    ww_wolves_a: 2, ww_wolves_b: 2, ww_wolves_c: 2, ww_wolves_d: 2, ww_wolves_e: 2,
  },
  downs: {
    // the Dark Fold thornback packs, levels 7 to 8: threes
    df_pack_a: 3, df_pack_b: 3, df_pack_c: 3, df_pack_d: 3, df_pack_e: 3,
  },
  moor: {
    // Cold Stones mist wolves, levels 10 to 11: pairs
    cs_wolves_a: 2, cs_wolves_b: 2, cs_wolves_c: 2, cs_wolves_d: 2,
    // the north cairn mist wolf packs, levels 10 to 11: threes
    cn_pack_a: 3, cn_pack_b: 3, cn_pack_c: 3,
  },
};

/** The pack size of a spawn (0 when it is a single pull). */
export function packOf(zone, group) { return (PACKS[zone] && PACKS[zone][group]) || 0; }

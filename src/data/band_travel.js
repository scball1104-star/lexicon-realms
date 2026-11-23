// The 20 to 30 band's travel (band lane, 2026-11-22; D:/LQOnline/world3/BRIEF.md section 5): the inns and kitemasters
// of Larch Cross (Larchhill) and Highdrove (Drovers' Reach), their flight points and routes. Plain data, no imports;
// src/data/travel.js spreads it into INNS, FLIGHT.points, FLIGHT.routes, TRAVEL_NPCS and TRAVEL_NPC_SPAWNS.
// Spots are tiles in their own zone (tools/maps/zone_larchhill.mjs town at 572, 178; zone_drovers_reach.mjs at 860, 404).
export const BAND_INNS = {
  lh_innkeeper: Object.freeze({ id: 'pick_and_pinecone', name: 'the Pick and Pinecone', zone: 'larchhill', x: 584, y: 176 }),
  dr_innkeeper: Object.freeze({ id: 'last_drove', name: 'the Last Drove', zone: 'drovers_reach', x: 872, y: 402 }),
};
export const BAND_POINTS = {
  larch_cross: Object.freeze({ id: 'larch_cross', name: 'Larch Cross, Larchhill', npc: 'lh_kitemaster', zone: 'larchhill', x: 576, y: 181, land: [576, 182] }),
  highdrove: Object.freeze({ id: 'highdrove', name: "Highdrove, Drovers' Reach", npc: 'dr_kitemaster', zone: 'drovers_reach', x: 864, y: 407, land: [864, 408] }),
};
// a route between zones ends one leg at the pass and starts the next where the pass lands (src/data/travel.js FLIGHT.routes)
export const BAND_ROUTES = [
  { a: 'thornfold', b: 'larch_cross', legs: [
    { zone: 'world', pts: [[82, 135], [62, 150], [40, 168], [24, 184], [20, 194]] },
    { zone: 'larchhill', pts: [[545, 4], [548, 60], [560, 124], [576, 181]] },
  ] },
  { a: 'larch_cross', b: 'highdrove', legs: [
    { zone: 'larchhill', pts: [[576, 181], [500, 300], [420, 450], [260, 560], [60, 570], [1, 571]] },
    { zone: 'drovers_reach', pts: [[1086, 381], [960, 390], [864, 407]] },
  ] },
];
export const BAND_TRAVEL_NPCS = {
  lh_innkeeper: { id: 'lh_innkeeper', name: 'Nell', sprite: 'npc_innkeeper', title: 'Keeper of the Pick and Pinecone', faction: 'friendly', roles: ['innkeeper'], vendor: null, trainer: null, innkeeper: true,
    talk: ['Pine on the fire, honey in the tea, and a bed that does not move. The Pick and Pinecone.', 'Make this your home and the Lantern Stone brings you back to the larches.'] },
  lh_kitemaster: { id: 'lh_kitemaster', name: 'Hap', sprite: 'npc_ferry', title: 'Kitemaster', faction: 'friendly', roles: ['flight'], vendor: null, trainer: null, flight: 'larch_cross',
    talk: ['Over the larches is the only way to see the valley. Under them you only see larches.', 'The kites come and go to Thornfold, and west to Highdrove once you have been.'] },
  dr_innkeeper: { id: 'dr_innkeeper', name: 'Sal', sprite: 'npc_innkeeper', title: 'Keeper of the Last Drove', faction: 'friendly', roles: ['innkeeper'], vendor: null, trainer: null, innkeeper: true,
    talk: ['The Last Drove. Every drover on the Reach drank here once. Most of them still owe me.', 'A bed here costs coin. Not a name. Never a name.'] },
  dr_kitemaster: { id: 'dr_kitemaster', name: 'Corwen', sprite: 'npc_brindle', title: 'Kitemaster', faction: 'friendly', roles: ['flight'], vendor: null, trainer: null, flight: 'highdrove',
    talk: ['The kites hate the scar birds. They fly high over the Reach and low over nothing.', 'East to Larch Cross, and on from there to anywhere you know.'] },
};
export const BAND_TRAVEL_NPC_SPAWNS = [
  { npc: 'lh_innkeeper', zone: 'larchhill', x: 584, y: 174, dir: 'down' },
  { npc: 'lh_kitemaster', zone: 'larchhill', x: 576, y: 181, dir: 'down' },
  { npc: 'dr_innkeeper', zone: 'drovers_reach', x: 872, y: 400, dir: 'down' },
  { npc: 'dr_kitemaster', zone: 'drovers_reach', x: 864, y: 407, dir: 'down' },
];

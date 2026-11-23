// The 20 to 30 band's cave (band lane, 2026-11-22; D:/LQOnline/world3/BRIEF.md section 4). Plain data in the
// src/data/dungeons.js shape, merged into DUNGEONS there. Its door stands in Larchhill, not on the world: `door.zone`
// names the outdoor zone (src/data/maps/doors.js withDoors places it there; the cave's exit goes back to it).
// The Barrow Deep Halls (26 to 30) are the cap30 lane's, with their door at the Downs stones: not here.
export const BAND_DUNGEONS = {
  larch_mine: {
    id: 'larch_mine', flavour: 'The blackdamp took a whole shift down here. The shift is still working.', name: 'The Larch Mine', kind: 'cave', levels: [21, 23],
    trash: { hp: 0.75, dmg: 0.55 },               // packs in a copy: lighter than the open world's (a solo hero, no second pull)
    door: { zone: 'larchhill', x: 1004, y: 298, w: 1, h: 3, out: [1000, 299], dir: 'right' },   // the mine mouth east of Shaftmouth Camp
    bosses: ['lm_gaffer'], last: 'lm_gaffer',
    drops: { lm_gaffer: ['gaffers_tally_lamp', 'blackdamp_boots'] },
    chest: { gold: [50, 70], rarity: 'magic', ilvl: 23 },
  },
};

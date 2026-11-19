# three.js r170 (vendored)

- Version: 0.170.0 (npm package `three@0.170.0`), copied from the hero mockup's vendor copy. MIT license (`LICENSE`).
- `three.module.min.js` is the unmodified build file.
- `addons/` holds only the example modules the 3D renderer (`src/render3d/`) uses. The one change to each: the bare
  `from 'three'` import is rewritten to a relative path, so the game needs no import map and no CDN.

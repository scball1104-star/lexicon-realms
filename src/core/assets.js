// Asset loader (browser). Images and JSON by name, loaded in parallel, with a readable error per missing file.
//
//   const assets = await loadAssets(MANIFEST, { onProgress(done, total) {} })
//   assets.img('terrain')  -> HTMLImageElement      assets.json('tiles') -> object      assets.has(name)
//
// Paths are relative to index.html. No caching layer of our own: the browser's HTTP cache is enough for phase 1.

export const MANIFEST = {
  images: {
    // tiles (copied from Lexicon Quest by tools/dev/import_lq_maps.mjs)
    terrain: 'assets/tiles/terrain.png',
    cliffs: 'assets/tiles/cliffs.png',
    town: 'assets/tiles/town.png',
    archive: 'assets/tiles/archive.png',
    x1: 'assets/tiles/x1.png',          // Shepherd's Downs and the High Moor (Lexicon Quest x1 set; tools/maps/build_world.mjs copies it)
    props: 'assets/tiles/props.png',
    // placeholder sprites (Lexicon Quest field sprites)
    party_field: 'assets/sprites/lq/party_field.png',
    enemies_field: 'assets/sprites/lq/enemies_field.png',
    npcs: 'assets/sprites/lq/npcs.png',
    font: 'assets/ui/font.png',
    font_num: 'assets/ui/font_num.png',  // floating combat numbers (the renderer's fx)
    // class atlases (art lane): loaded up front so a hero never draws as the LQ placeholder for a frame
    char_warden: 'assets/sprites/chars/warden.png', char_warden_em: 'assets/sprites/chars/warden_emissive.png',
    char_mender: 'assets/sprites/chars/mender.png', char_mender_em: 'assets/sprites/chars/mender_emissive.png',
    char_scribe: 'assets/sprites/chars/scribe.png', char_scribe_em: 'assets/sprites/chars/scribe_emissive.png',
    char_wayfinder: 'assets/sprites/chars/wayfinder.png', char_wayfinder_em: 'assets/sprites/chars/wayfinder_emissive.png',
    char_inkblade: 'assets/sprites/chars/inkblade.png', char_inkblade_em: 'assets/sprites/chars/inkblade_emissive.png',
    fx_img: 'assets/fx/fx.png',          // spell effects sheet (assets/fx/fx.json)
  },
  json: {
    tiles: 'assets/tiles/tiles.json',
    props: 'assets/tiles/props.json',
    party_field: 'assets/sprites/lq/party_field.json',
    enemies_field: 'assets/sprites/lq/enemies_field.json',
    npcs: 'assets/sprites/lq/npcs.json',
    font: 'assets/ui/font.json',
    font_num: 'assets/ui/font_num.json',
    char_warden: 'assets/sprites/chars/warden.json', char_mender: 'assets/sprites/chars/mender.json', char_scribe: 'assets/sprites/chars/scribe.json',
    char_wayfinder: 'assets/sprites/chars/wayfinder.json', char_inkblade: 'assets/sprites/chars/inkblade.json',
    fx: 'assets/fx/fx.json',
    // mob atlases (assets/sprites/mobs/) stay lazy in the renderer: 17 sheets, most of them for later zones
  },
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed to load: ${url}`));
    img.src = url;
  });
}

async function loadJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`json failed to load: ${url} (${r.status})`);
  return r.json();
}

export async function loadAssets(manifest = MANIFEST, opts = {}) {
  const images = new Map(), json = new Map();
  const jobs = [
    ...Object.entries(manifest.images || {}).map(([k, u]) => loadImage(u).then((v) => images.set(k, v))),
    ...Object.entries(manifest.json || {}).map(([k, u]) => loadJson(u).then((v) => json.set(k, v))),
  ];
  let done = 0;
  await Promise.all(jobs.map((p) => p.then(() => { done++; if (opts.onProgress) opts.onProgress(done, jobs.length); })));
  return {
    img(name) { const v = images.get(name); if (!v) throw new Error(`no image asset "${name}"`); return v; },
    json(name) { const v = json.get(name); if (!v) throw new Error(`no json asset "${name}"`); return v; },
    has(name) { return images.has(name) || json.has(name); },
  };
}

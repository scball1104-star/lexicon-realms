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
    props: 'assets/tiles/props.png',
    // placeholder sprites (Lexicon Quest field sprites)
    party_field: 'assets/sprites/lq/party_field.png',
    enemies_field: 'assets/sprites/lq/enemies_field.png',
    npcs: 'assets/sprites/lq/npcs.png',
    font: 'assets/ui/font.png',
  },
  json: {
    tiles: 'assets/tiles/tiles.json',
    props: 'assets/tiles/props.json',
    party_field: 'assets/sprites/lq/party_field.json',
    enemies_field: 'assets/sprites/lq/enemies_field.json',
    npcs: 'assets/sprites/lq/npcs.json',
    font: 'assets/ui/font.json',
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

// 3D asset loading: glTF files from assets3d/ (built by assets3d/_build/build_assets3d.py), shared materials, the
// animation clips, and a progress count the renderer shows while the title screen keeps running.
//
//   const L = createLoader('assets3d/')
//   await L.gltf('village/Wall_Plaster_Straight.gltf')  -> the loaded glTF (cached; materials of static kits shared)
//   await L.tex('tex/T_Ranger_3_BaseColor.jpg')          -> THREE.Texture (sRGB, flipY false, cached)
//   await L.clips()                                       -> Map(name -> AnimationClip) of the Universal Animation Library
//   L.progress                                            -> { done, total, failed: [urls] }
import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';

THREE.Cache.enabled = true;   // one download and one decode per texture, however many glTF files point at it

export const WINDOW_LIT = new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ff9a3a', emissiveIntensity: 0.0, roughness: 0.4, name: 'lr_window' });

export function createLoader(base = 'assets3d/') {
  const progress = { done: 0, total: 0, failed: [] };
  const manager = new THREE.LoadingManager();
  manager.onProgress = (url, loaded, total) => { progress.done = loaded; progress.total = total; };
  manager.onError = (url) => { progress.failed.push(url); };
  const gl = new GLTFLoader(manager);
  const tl = new THREE.TextureLoader(manager);
  const cache = new Map(), texCache = new Map();
  const shared = new Map();      // material name -> material (static kits only)

  /** Static kit pieces: one material per name across every file (fewer programs, fewer texture uploads). */
  function share(root) {
    root.traverse((m) => {
      if (!m.isMesh) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      const out = list.map((mat) => {
        if (/WindowGlass/i.test(mat.name)) return WINDOW_LIT;
        if (!shared.has(mat.name)) shared.set(mat.name, mat);
        return shared.get(mat.name);
      });
      m.material = Array.isArray(m.material) ? out : out[0];
    });
  }

  // At most 8 downloads at once, and one retry: the one world asks for every area's models together, and a burst of
  // hundreds of requests can run a phone (or a busy PC's network stack) out of sockets (ERR_NO_BUFFER_SPACE).
  const MAX_LOADS = 8;
  let loading = 0;
  const waiting = [];
  const slot = () => (loading < MAX_LOADS ? (loading++, Promise.resolve()) : new Promise((res) => waiting.push(res)));
  const free = () => { const next = waiting.shift(); if (next) next(); else loading--; };
  const fetchOne = (loader, url) => slot().then(() => loader.loadAsync(url)).finally(free);
  const limited = (loader, url) => fetchOne(loader, url).catch(() => new Promise((res) => setTimeout(res, 400)).then(() => fetchOne(loader, url)));

  function gltf(rel, { shareMaterials = !/^(ubc|hair|mco|animals|monsters)\//.test(rel) } = {}) {
    if (!cache.has(rel)) {
      cache.set(rel, limited(gl, base + rel).then((g) => { if (shareMaterials) share(g.scene); return g; }));
    }
    return cache.get(rel);
  }
  function tex(rel, srgb = true) {
    if (!texCache.has(rel)) {
      texCache.set(rel, limited(tl, base + rel).then((t) => { t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }));
    }
    return texCache.get(rel);
  }
  let clipsP = null;
  function clips() {
    if (!clipsP) {
      clipsP = gltf('ual/UAL_clips.glb', { shareMaterials: false }).then((g) => {
        let pel = null;
        g.scene.traverse((b) => { if (b.name === 'pelvis') pel = b; });
        const m = new Map(g.animations.map((c) => [c.name, c]));
        m.pelvisLen = pel ? pel.position.length() : 1;
        return m;
      });
    }
    return clipsP;
  }
  return { gltf, tex, clips, progress, shared };
}

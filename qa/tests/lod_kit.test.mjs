// Horizon camera level of detail (wave 8, lod lane, src/render3d/lod_kit.js): only the horizon camera gets a plan, the
// phones and Low quality get the shorter reaches and no prepass, far small props hide and far tree bark trims and both
// come back, and the depth prepass passes today's renders straight through and puts every material back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../src/vendor/three/three.module.min.js';
import { assert, eq } from './_helpers.mjs';
import { LOD_TIER, PRE_LAYER, barkPart, createPrepass, horizonLod, loGeometry, lodCell, preEligible, unLodCell } from '../../src/render3d/lod_kit.js';
import { horizonPose } from '../../src/render3d/horizon_cam.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// a little kit tree: a trunk (low) with branches (high, inside the crown) as Bark, and a crown as Leaves
function treeProto(url = 'test/Tree.gltf') {
  const bark = new THREE.BufferGeometry();
  const P = [], I = [];
  const quad = (y0, y1, x) => { const b = P.length / 3; P.push(x, y0, 0, x + 0.1, y0, 0, x + 0.1, y1, 0, x, y1, 0); I.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  quad(0, 1, 0); quad(0.5, 1.5, 0.2);                       // the trunk below the crown (base at 2 m)
  for (let i = 0; i < 8; i++) quad(2.7 + i * 0.25, 3.0 + i * 0.25, 0.3 * i);   // branches inside the crown (the cut: 12% of the height above its base)
  bark.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); bark.setIndex(I);
  const leaves = new THREE.BoxGeometry(2, 2, 2).translate(0, 3, 0);
  const barkMat = new THREE.MeshStandardMaterial({ name: 'Bark_NormalTree' }), leafMat = new THREE.MeshStandardMaterial({ name: 'Leaves_NormalTree', alphaTest: 0.5 });
  return { url, parts: [{ geometry: bark, material: barkMat, matrix: new THREE.Matrix4() }, { geometry: leaves, material: leafMat, matrix: new THREE.Matrix4() }] };
}
function inst(geo, mat, x, z, { small = false } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, 1);
  m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, 0, z)); m.computeBoundingSphere();
  if (small) m.userData.small = true;
  return m;
}

export const tests = [
  {
    name: 'lod: only the horizon camera gets a plan; phones and Low get shorter reaches and no prepass',
    fn() {
      eq(horizonLod(null, { x: 0, z: 0 }), null, 'today\'s camera: no plan');
      const hi = horizonLod(horizonPose({ yaw: 0, pitch: 12, dist: 10 }), { x: 5, z: 6 });
      const lo = horizonLod(horizonPose({ yaw: 0, pitch: 12, dist: 10, lite: true }, { lite: true }), { x: 5, z: 6 });
      eq(hi.x, 5); eq(hi.z, 6); eq(hi.smallR, LOD_TIER.high.smallR); eq(hi.prepass, true, 'desktop High: the prepass');
      eq(lo.prepass, false, 'phones and Low: no prepass (more draw calls, measured no gain there)');
      assert(lo.smallR < hi.smallR && lo.treeR <= hi.treeR, 'lite reaches are shorter');
      // reaches sit inside the camera's own full-detail reach, so nothing pops at the edge of the cells
      assert(LOD_TIER.high.smallR < 56 && LOD_TIER.high.treeR < 56, 'inside the near ring');
    },
  },
  {
    name: 'lod: a kit tree far off keeps its leaves and the trunk below the crown, the bark inside the crown goes',
    fn() {
      const pr = treeProto();
      eq(barkPart(pr), 0, 'the bark part');
      eq(barkPart({ parts: [pr.parts[0]] }), -1, 'no leaves: not a tree');
      const lo = loGeometry(pr, 0);
      assert(lo, 'a far version');
      eq(lo.index.count, 12, 'the two trunk quads stay (4 triangles), the 8 branch quads go');
      assert(lo.attributes.position === pr.parts[0].geometry.attributes.position, 'it shares the full vertex buffer');
      assert(loGeometry(pr, 0) === lo, 'cached');
    },
  },
  {
    name: 'lod: far small props hide and far bark trims by camera distance, and both come back for today\'s camera',
    fn() {
      const pr = treeProto('test/Tree2.gltf');
      const g = new THREE.Group();
      const near = inst(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial(), 10, 0, { small: true });
      const far = inst(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial(), 90, 0, { small: true });
      const tNear = inst(pr.parts[0].geometry, pr.parts[0].material, 12, 0), tFar = inst(pr.parts[0].geometry, pr.parts[0].material, 95, 0);
      for (const t of [tNear, tFar]) { t.userData.loSrc = { proto: pr, part: 0 }; t.userData.hiGeo = pr.parts[0].geometry; }
      g.add(near, far, tNear, tFar);
      const c = { g, small: [near, far], lo: [tNear, tFar], smallOn: true };
      lodCell(c, horizonLod(horizonPose({ yaw: 0, pitch: 12, dist: 10 }), { x: 0, z: 0 }));
      eq(near.visible, true); eq(far.visible, false, 'a pebble 90 m off');
      eq(tNear.geometry, pr.parts[0].geometry, 'a near tree is whole');
      assert(tFar.geometry !== pr.parts[0].geometry && tFar.geometry.index.count < pr.parts[0].geometry.index.count, 'a far tree trims');
      eq(c.smallOn, null, 'the default path re-applies its own rule next time');
      eq(c.lodOn, true);
      unLodCell(c);
      eq(far.visible, true); eq(tFar.geometry, pr.parts[0].geometry, 'whole again'); eq(c.lodOn, false);
      assert(c.pre.every((m) => m.layers.isEnabled(PRE_LAYER)), 'prepass pieces marked');
      eq(near.layers.isEnabled(0), true, 'still on the default layer (today\'s camera sees them as before)');
    },
  },
  {
    name: 'lod: the prepass takes opaque see-through scenery only (no leaves, no small props, nothing transparent)',
    fn() {
      const see = (o = {}) => { const m = new THREE.MeshStandardMaterial(o); m.userData.lrSee = true; return m; };
      const geo = new THREE.BoxGeometry();
      eq(preEligible(new THREE.Mesh(geo, see())), true);
      eq(preEligible(new THREE.Mesh(geo, new THREE.MeshStandardMaterial())), false, 'not patched');
      eq(preEligible(new THREE.Mesh(geo, see({ alphaTest: 0.5 }))), false, 'leaves');
      eq(preEligible(new THREE.Mesh(geo, see({ transparent: true }))), false, 'water, glass');
      const s = new THREE.Mesh(geo, see()); s.userData.small = true;
      eq(preEligible(s), false, 'small props');
    },
  },
  {
    name: 'lod: the prepass passes a render straight through when off, and puts every material and setting back when on',
    async fn() {
      const calls = [];
      const fake = {
        autoClear: true, autoClearDepth: true, shadowMap: { autoUpdate: true, needsUpdate: false }, info: { render: { calls: 0 } },
        clear() { calls.push('clear'); },
        render(s, c) { const mats = []; s.traverseVisible((m) => { if (m.isMesh && m.layers.test(c.layers)) mats.push(m.material); }); calls.push({ mask: c.layers.mask, mats, ac: this.autoClear, acd: this.autoClearDepth, sh: this.shadowMap.autoUpdate }); this.info.render.calls += mats.length; },
      };
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
      const mat = new THREE.MeshStandardMaterial(); mat.userData.lrSee = true; mat.userData.lrPre = true;
      const m = new THREE.Mesh(new THREE.BoxGeometry(), mat); m.layers.enable(PRE_LAYER); scene.add(m);
      let compiled = 0;
      const pre = createPrepass(fake, scene, camera, { precompile: () => { compiled++; return Promise.resolve(); } });
      fake.render(scene, camera);
      eq(calls.length, 1, 'off: one render'); eq(calls[0].mats[0], mat, 'with the material as it is');
      calls.length = 0; pre.active = true;
      fake.render(scene, camera);
      eq(compiled, 1, 'the programs compile in the background first');
      eq(calls.filter((x) => x !== 'clear').length, 1, 'meanwhile the frame draws as without the prepass');
      await new Promise((r) => setTimeout(r, 0));
      calls.length = 0;
      fake.render(scene, camera);
      const [p, main] = calls.filter((x) => x !== 'clear');
      eq(p.mask, 1 << PRE_LAYER, 'the prepass sees only the marked layer'); eq(p.sh, false, 'no second shadow pass');
      assert(p.mats[0] !== mat && p.mats[0].colorWrite === false, 'depth only');
      assert(main.mats[0] !== mat && main.mats[0].depthFunc === THREE.EqualDepth && main.mats[0].depthWrite === false, 'the twin tests EQUAL, writes none');
      eq(main.acd, false, 'the background clear keeps the depth');
      eq(m.material, mat, 'the material is put back'); eq(camera.layers.mask, 1, 'camera layers put back');
      eq(fake.autoClear, true); eq(fake.autoClearDepth, true); eq(fake.shadowMap.autoUpdate, true);
    },
  },
  {
    name: 'lod: today\'s camera path is untouched (zone cull takes no plan, the renderer passes one only with the horizon camera)',
    fn() {
      const z = src('src/render3d/zone3d.js'), r = src('src/render3d/renderer3d.js');
      assert(/cull\(x, zz, r, farR = 0, lod = null\)/.test(z), 'cull: lod defaults to null');
      assert(/if \(lod\) \{ lodCell\(c, lod\); continue; \}/.test(z), 'the plan only branches in when given');
      assert(/dev\.lod = hpose && /.test(r), 'a plan only with the horizon camera pose');
      assert(/prepass\.active = !!\(dev\.lod && dev\.lod\.prepass/.test(r), 'the prepass only with a plan');
      // the twins strip exactly this line: if the dither line changes, lod_kit.js SEE_DISCARD must change with it
      assert(z.includes('if (lrC < 0.999 && lrC <= lrBayer(gl_FragCoord.xy) + 0.001) discard;'), 'zone3d.js see-through discard line as lod_kit.js expects');
    },
  },
  {
    name: 'lod: the frame budget has the horizon camera views beside today\'s at the same spots',
    fn() {
      const ld = src('qa/lookdev/lookdev.py');
      for (const v of ['horizon_willowmere', 'horizon_willowmere_west', 'horizon_moor', 'horizon_moor_shoulder']) {
        assert(ld.includes(`('${v}'`), `${v} in VIEWS`);
        assert(new RegExp(`'${v}': \\{'yaw'`).test(ld), `${v} has a pose`);
      }
      const b = JSON.parse(src('qa/lookdev/budget.json'));
      for (const p of ['desktop', 'phone']) for (const v of ['horizon_willowmere', 'horizon_moor']) assert(b.profiles[p].views[v], `${p} budget for ${v}`);
    },
  },
];

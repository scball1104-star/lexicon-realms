// Weather in 3D (wave 5 Track A, 2026-11-24): rain streaks in a box round the view. Code only, no textures.
//
//   const W = createRain3d(THREE, scene, { count })
//   W.update({ t, center, camera, rain, wind, lit })   t: render seconds (pinned for stills); center: THREE.Vector3 on
//                                                     the ground under the view; rain 0..1 (0 hides it); lit 0..1
//   W.mesh                                            the LineSegments (one draw call)
//
// The streaks are fixed in the world and wrap round the box as the view moves (no streak slides with the camera), and
// the fall is done in the vertex shader from a seed per streak, so a frame costs one uniform update, not a buffer upload.
// Only the 'full' sky tier makes one (phones get the sky and the darker light but no rain particles).

export function createRain3d(THREE, scene, opts = {}) {
  const N = opts.count || 6000;
  const seed = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), pos = new Float32Array(N * 2 * 3);
  let s = 7;
  const rr = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const a = rr(), b = rr(), c = rr();
    for (let v = 0; v < 2; v++) { seed.set([a, b, c], (i * 2 + v) * 3); end[i * 2 + v] = v; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));   // unused by the shader (three wants one)
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const U = {
    uC: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uT: { value: 0 }, uB: { value: 46 }, uH: { value: 22 },
    uSpeed: { value: 19 }, uLen: { value: 0.85 }, uWind: { value: new THREE.Vector2(0.14, 0.05) },
    uCol: { value: new THREE.Color('#b8c8e0') }, uA: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute vec3 aSeed; attribute float aEnd; uniform vec3 uC, uCam; uniform float uT, uB, uH, uSpeed, uLen; uniform vec2 uWind;
      varying float vA;
      void main(){
        float x = uC.x + mod(aSeed.x * uB - uC.x, uB) - uB * 0.5;
        float z = uC.z + mod(aSeed.y * uB - uC.z, uB) - uB * 0.5;
        float y = uH - mod(aSeed.z * uH + uT * uSpeed * (0.85 + 0.3 * aSeed.x), uH);
        vec3 p = vec3(x, y, z) + vec3(uWind.x, 1.0, uWind.y) * uLen * aEnd;
        vec2 d = abs(vec2(x - uC.x, z - uC.z)) / (uB * 0.5);
        float edge = 1.0 - smoothstep(0.7, 1.0, max(d.x, d.y));
        float cd = distance(p, uCam);
        vA = edge * smoothstep(1.5, 4.0, cd) * (1.0 - smoothstep(30.0, 48.0, cd)) * smoothstep(0.0, 1.5, y) * (0.55 + 0.45 * aEnd);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 uCol; uniform float uA; varying float vA;
      void main(){ gl_FragColor = vec4(uCol, uA * vA);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.LineSegments(g, mat);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5; mesh.name = 'sky:rain';
  scene.add(mesh);
  return {
    mesh,
    update({ t, center, camera, rain = 0, lit = 1 }) {
      mesh.visible = rain > 0.01;
      if (!mesh.visible) return;
      U.uT.value = t; U.uC.value.copy(center); U.uCam.value.copy(camera.position);
      U.uA.value = 0.5 * Math.min(1, rain);
      // pale streaks by day, dim blue-grey at night (they catch the lamps, not the sun)
      U.uCol.value.setRGB(0.42 + 0.34 * lit, 0.48 + 0.32 * lit, 0.6 + 0.28 * lit);
    },
  };
}

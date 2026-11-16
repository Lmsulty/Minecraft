import * as THREE from 'three';
import { THEME } from './theme.js';

// ==========================================================
//  CURVE: makes the world LOOK like the inside of a giant cylinder.
//
//  Only the drawing bends. Blocks, physics, saving and terrain all stay
//  in the normal flat world. Just before each corner of each block is
//  drawn, the graphics card moves it onto a circle:
//
//   - Along X (left/right of the cylinder), land curves UP with distance.
//   - Along Z, the world stays flat (that's the length of the cylinder).
//   - The bend is measured from the camera, so the area around you is
//     never distorted. Land always rises on both sides of you.
//
//  It also handles the air haze: distant land fading into the haze colour.
//
//  Settings live in theme.js (THEME.station). Press B to turn the curve
//  off and on, to compare.
// ==========================================================

const S = THEME.station;
const R = S.curveRadius;      // distance from the ground to the middle of the cylinder
const Y0 = S.curveGroundLevel; // the height that sits exactly at that radius

// Values the graphics card reads every frame. One shared copy for every
// bent material, so updating them once updates everything.
const uniforms = {
  uBendCenterX: { value: 0 }, // the camera's X: the bend starts here
  uBendOn: { value: 1 },      // 1 = curved, 0 = flat (B key)
};

let enabled = true;
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && !e.repeat) {
    enabled = !enabled;
    uniforms.uBendOn.value = enabled ? 1 : 0;
  }
});

// ---- The bend, written for the graphics card (GLSL) ----
// Same maths as bendPoint() below.
const BEND_GLSL = /* glsl */ `
  uniform float uBendCenterX;
  uniform float uBendOn;
  vec3 bendPoint(vec3 p) {
    if (uBendOn < 0.5) return p;
    float angle = (p.x - uBendCenterX) / ${R.toFixed(1)};      // how far around the circle
    float r = ${R.toFixed(1)} - (p.y - ${Y0.toFixed(1)});      // taller = closer to the middle
    return vec3(
      uBendCenterX + r * sin(angle),
      ${(Y0 + R).toFixed(1)} - r * cos(angle),
      p.z
    );
  }
`;

// ---- Air haze (replaces Three.js's normal fog in bent materials) ----
// fogNear/fogFar come from scene.fog (hazeStart/hazeEnd in theme.js).
const HAZE_GLSL = /* glsl */ `
  #ifdef USE_FOG
    float hazeT = smoothstep(fogNear, fogFar, vFogDepth);
    float fogFactor = ${S.hazeMax.toFixed(3)} * pow(hazeT, ${S.hazeCurve.toFixed(3)});
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
`;

// Add the bend to a Three.js material. The lighting still uses the flat
// world's directions, so every patch of land is lit as if light comes
// from its own "up" (towards the middle of the cylinder).
export function bendMaterial(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBendCenterX = uniforms.uBendCenterX;
    shader.uniforms.uBendOn = uniforms.uBendOn;
    shader.vertexShader = BEND_GLSL + shader.vertexShader
      .replace('#include <project_vertex>', /* glsl */ `
        vec4 bentWorld = modelMatrix * vec4(transformed, 1.0);
        bentWorld.xyz = bendPoint(bentWorld.xyz);
        vec4 mvPosition = viewMatrix * bentWorld;
        gl_Position = projectionMatrix * mvPosition;
      `)
      // Haze by the real straight-line distance to the (bent) point. The
      // usual fog only measures straight ahead, so land at the edges of the
      // screen and overhead would be too clear, and turning your head would
      // change it.
      .replace('#include <fog_vertex>', /* glsl */ `
        #ifdef USE_FOG
          vFogDepth = length(mvPosition.xyz);
        #endif
      `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', HAZE_GLSL);
  };
  // Tell Three.js this shader is different from an unbent one of the same type.
  material.customProgramCacheKey = () => 'bend';
  return material;
}

// ---- The same bend in JavaScript (for culling and clicking) ----

// Flat world point -> where it's drawn. Writes into `out`.
export function bendPoint(p, centerX, out) {
  if (!enabled) return out.copy(p);
  const angle = (p.x - centerX) / R;
  const r = R - (p.y - Y0);
  return out.set(centerX + r * Math.sin(angle), Y0 + R - r * Math.cos(angle), p.z);
}

// Where it's drawn -> flat world point (the exact opposite of bendPoint).
export function unbendPoint(p, centerX, out) {
  if (!enabled) return out.copy(p);
  const across = p.x - centerX;   // sideways from the camera
  const below = Y0 + R - p.y;     // down from the middle of the cylinder
  const r = Math.hypot(across, below);
  const angle = Math.atan2(across, below);
  return out.set(centerX + angle * R, Y0 + R - r, p.z);
}

// Call once per frame, before drawing.
export function updateCurve(camera) {
  uniforms.uBendCenterX.value = camera.position.x;
}

// ---- Culling: skip chunks that are off-screen ----
// Three.js normally decides this from the flat positions, which would wrongly
// hide land that has bent up into view. So chunk meshes turn that off
// (frustumCulled = false) and we check their BENT positions here instead.
const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const flatCenter = new THREE.Vector3();

export function cullBentChunks(group, camera) {
  camera.updateMatrixWorld();
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProjection);
  const centerX = camera.position.x;

  for (const chunk of group.children) {
    for (const mesh of chunk.children) {
      const geometry = mesh.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const bounds = geometry.boundingSphere;
      flatCenter.copy(bounds.center);
      bendPoint(flatCenter, centerX, sphere.center);
      // Below the ground level, the bend spreads things out a little, so
      // grow the sphere to match (never shrink it).
      const lowest = bounds.center.y - bounds.radius;
      const spread = enabled ? Math.max(1, (R - (lowest - Y0)) / R) : 1;
      sphere.radius = bounds.radius * spread;
      mesh.visible = frustum.intersectsSphere(sphere);
    }
  }
}

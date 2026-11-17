import * as THREE from 'three';
import { THEME } from './theme.js';

// ==========================================================
//  CURVE: makes the world LOOK like the inside of a giant cylinder.
//
//  Only the drawing bends. Blocks, physics, saving and terrain all stay
//  in the normal flat world. Just before each corner of each block is
//  drawn, the graphics card moves it onto a curved ground line:
//
//   - Along X (left/right of the cylinder), land curves UP with distance.
//   - Along Z, the world stays flat (that's the length of the cylinder).
//   - The bend is measured from the camera, and the ground near you is
//     completely flat (the "flat zone"), so it never swims as you walk.
//     Past that, the curve slowly gets stronger over the "ramp", until it
//     bends as tightly as a circle of radius curveRadius.
//
//  Side view of the ground line (you are at the middle):
//
//      \                                   /   <- full curve (curveRadius)
//        \_                             _/     <- ramp: curve getting stronger
//           \___________ YOU ___________/       <- flat zone
//
//  It also handles the air haze: distant land fading into the haze colour.
//
//  This is an EASTER EGG: the curve starts off, and pressing B turns it on
//  and off. Settings live in theme.js (THEME.curve, and THEME.haze for the haze).
// ==========================================================

const S = THEME.curve;
const Y0 = S.curveGroundLevel; // this height lies exactly on the ground line
const R = S.curveRadius;       // tightest bend, reached at the end of the ramp
// Blocks this high above ground level would reach the middle of the curve
// and flip over, so anything taller is squashed down to it.
const MAX_HEIGHT = R - 2;

// ---- The ground line, worked out once at startup ----
// For every whole block of distance from the camera (0, 1, 2 ... 511) we store
// where the ground line is (x across, y up) and which way it's tilted (angle).
// Points in between are blended from the two nearest entries. The graphics
// card gets the same numbers as a tiny image, so both sides always agree.
const TABLE_SIZE = 512; // covers far more than the loaded world (about 80 blocks)
const table = new Float32Array(TABLE_SIZE * 4); // x, y, angle, (unused) per entry

// How tightly the ground bends at distance s: 0 in the flat zone, rising
// smoothly over the ramp to 1 / curveRadius.
function bendAt(s) {
  const t = Math.min(1, Math.max(0, (s - S.flatZone) / Math.max(S.curveRamp, 0.001)));
  return (t * t * (3 - 2 * t)) / R;
}

{
  // Walk along the ground line in small steps, turning by bendAt() each step.
  const STEPS_PER_BLOCK = 8;
  const ds = 1 / STEPS_PER_BLOCK;
  let x = 0, y = 0, angle = 0;
  for (let i = 0; i < TABLE_SIZE; i++) {
    table.set([x, y, angle, 0], i * 4);
    for (let k = 0; k < STEPS_PER_BLOCK; k++) {
      const s = i + (k + 0.5) * ds;
      const mid = angle + (bendAt(s) * ds) / 2; // tilt halfway through this step
      x += Math.cos(mid) * ds;
      y += Math.sin(mid) * ds;
      angle += bendAt(s) * ds;
    }
  }
}

const tableTexture = new THREE.DataTexture(table, TABLE_SIZE, 1, THREE.RGBAFormat, THREE.FloatType);
tableTexture.magFilter = THREE.NearestFilter; // we blend entries ourselves (exactly like the JS below)
tableTexture.minFilter = THREE.NearestFilter;
tableTexture.needsUpdate = true;

// Ground line at distance s: writes x, y, angle into `out`.
// Past the end of the table, it carries on in a straight line.
const LAST = TABLE_SIZE - 1;
function groundAt(s, out) {
  const i = Math.min(Math.floor(s), LAST);
  const j = Math.min(i + 1, LAST);
  const f = Math.min(s - i, 1);
  out.x = table[i * 4] + (table[j * 4] - table[i * 4]) * f;
  out.y = table[i * 4 + 1] + (table[j * 4 + 1] - table[i * 4 + 1]) * f;
  out.angle = table[i * 4 + 2] + (table[j * 4 + 2] - table[i * 4 + 2]) * f;
  const beyond = Math.max(0, s - LAST);
  out.x += Math.cos(out.angle) * beyond;
  out.y += Math.sin(out.angle) * beyond;
  return out;
}

// Values the graphics card reads. One shared copy for every bent material,
// so updating them once updates everything.
const uniforms = {
  uBendCenterX: { value: 0 }, // the camera's X: the bend starts here
  uBendOn: { value: S.startsOn ? 1 : 0 }, // 1 = curved, 0 = flat (B key)
  uCurveTable: { value: tableTexture },
};

let enabled = S.startsOn;
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
  uniform sampler2D uCurveTable;

  vec3 groundAt(float s) {
    int i = min(int(s), ${LAST});
    int j = min(i + 1, ${LAST});
    float f = min(s - float(i), 1.0);
    vec3 g = mix(texelFetch(uCurveTable, ivec2(i, 0), 0).xyz,
                 texelFetch(uCurveTable, ivec2(j, 0), 0).xyz, f);
    float beyond = max(0.0, s - ${LAST.toFixed(1)});
    g.xy += vec2(cos(g.z), sin(g.z)) * beyond;
    return g;
  }

  vec3 bendPoint(vec3 p) {
    if (uBendOn < 0.5) return p;
    float dx = p.x - uBendCenterX;
    float h = min(p.y - ${Y0.toFixed(1)}, ${MAX_HEIGHT.toFixed(1)}); // height above ground level
    vec3 g = groundAt(abs(dx));       // ground line: x, y, angle
    float side = dx < 0.0 ? -1.0 : 1.0;
    // Start on the ground line, then go h blocks "up" (tilted with the ground).
    return vec3(
      uBendCenterX + side * (g.x - h * sin(g.z)),
      ${Y0.toFixed(1)} + g.y + h * cos(g.z),
      p.z
    );
  }
`;

// ---- Air haze (replaces Three.js's normal fog in bent materials) ----
// fogNear/fogFar come from scene.fog (THEME.haze start/end).
const HAZE_GLSL = /* glsl */ `
  #ifdef USE_FOG
    float hazeT = smoothstep(fogNear, fogFar, vFogDepth);
    float fogFactor = pow(hazeT, ${THEME.haze.curve.toFixed(3)});
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
    shader.uniforms.uCurveTable = uniforms.uCurveTable;
    shader.vertexShader = BEND_GLSL + shader.vertexShader
      .replace('#include <project_vertex>', /* glsl */ `
        #ifdef USE_INSTANCING
          // Many copies of one shape in one draw (e.g. mobs): each copy has its own position.
          vec4 flatWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 flatWorld = modelMatrix * vec4(transformed, 1.0);
        #endif
        vec4 bentWorld = vec4(bendPoint(flatWorld.xyz), 1.0);
        vec4 mvPosition = viewMatrix * bentWorld;
        gl_Position = projectionMatrix * mvPosition;
      `)
      // Haze by the real straight-line distance to the point. (The usual fog
      // only measures straight ahead, so land at the edges of the screen and
      // overhead would be too clear, and turning your head would change it.)
      // Bending pulls distant land a little closer to your eye, so we also
      // measure the flat-world distance and use whichever is bigger. That way
      // the edge of the loaded world is always hidden, however strong the curve.
      .replace('#include <fog_vertex>', /* glsl */ `
        #ifdef USE_FOG
          vFogDepth = max(length(mvPosition.xyz), distance(flatWorld.xyz, cameraPosition));
        #endif
      `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', HAZE_GLSL);
  };
  // Tell Three.js this shader is different from an unbent one of the same type.
  material.customProgramCacheKey = () => 'bend';
  return material;
}

// ---- The same bend in JavaScript (for culling and clicking) ----

const g = { x: 0, y: 0, angle: 0 }; // scratch space for groundAt()

// Flat world point -> where it's drawn. Writes into `out`.
export function bendPoint(p, centerX, out) {
  if (!enabled) return out.copy(p);
  const dx = p.x - centerX;
  const h = Math.min(p.y - Y0, MAX_HEIGHT);
  groundAt(Math.abs(dx), g);
  const side = dx < 0 ? -1 : 1;
  return out.set(
    centerX + side * (g.x - h * Math.sin(g.angle)),
    Y0 + g.y + h * Math.cos(g.angle),
    p.z,
  );
}

// Where it's drawn -> flat world point (the opposite of bendPoint).
// Inside the flat zone this changes nothing. Further out, it finds the spot
// on the ground line the point sits above, by guessing and correcting a few
// times (each correction gets much closer).
export function unbendPoint(p, centerX, out) {
  if (!enabled) return out.copy(p);
  const across = Math.abs(p.x - centerX);
  const side = p.x - centerX < 0 ? -1 : 1;
  const up = p.y - Y0;
  let s = across;
  let offX = 0, offY = 0;
  for (let i = 0; i < 8; i++) {
    groundAt(s, g);
    offX = across - g.x; // from the ground line to the point
    offY = up - g.y;
    // Slide along the ground line by how far the point is ahead of / behind us.
    // High points move faster than the ground below them where it curves,
    // so divide by that to land on the right spot quickly.
    const ahead = offX * Math.cos(g.angle) + offY * Math.sin(g.angle);
    const height = -offX * Math.sin(g.angle) + offY * Math.cos(g.angle);
    s = Math.max(0, s + ahead / Math.max(0.1, 1 - bendAt(s) * height));
  }
  groundAt(s, g);
  offX = across - g.x;
  offY = up - g.y;
  const h = -offX * Math.sin(g.angle) + offY * Math.cos(g.angle); // height above the ground line
  return out.set(centerX + side * s, Y0 + h, p.z);
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

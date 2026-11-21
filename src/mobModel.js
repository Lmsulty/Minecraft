import * as THREE from 'three';
import { THEME } from './theme.js';
import { bendMaterial } from './curve.js';
import { makeRandom } from './random.js';

// Drawing and animating creatures.
//
// Every creature is made of boxes (its `parts` in mobTypes.js). All the boxes
// of all the creatures of one type are copies of ONE cube, drawn together in
// a single draw call (an "instanced mesh"): each copy just gets its own
// position, size, angle and colour. So 16 grazers cost the same number of
// draw calls as 1.
//
// The material is bent like the land (curve.js), so creatures follow the
// curved view and fade into the haze exactly like the blocks around them.
//
// Parts marked `glow: true` go in a second batch whose material ignores light
// and darkness, so they shine at night (like the glow lamp block). Halos and
// real lights around glowing creatures are in mobGlow.js.

const FAR_ANIMATION = 40; // creatures further away than this don't move their legs (saves time)

// ---- A soft speckle, so the boxes have a pixel-art look like the blocks ----
function makeSpeckleTexture() {
  const size = 8;
  const random = makeRandom(4242);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(255 * (0.8 + 0.2 * random()));
    data.set([v, v, v, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter; // chunky pixels
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Also used by the spaceship (ship.js), so it looks like it belongs with the creatures.
export const CUBE = new THREE.BoxGeometry(1, 1, 1);
const SPECKLE = makeSpeckleTexture();
export const MATERIAL = bendMaterial(new THREE.MeshLambertMaterial({ map: SPECKLE }));    // lit by the sun, moon and lights
export const GLOW_MATERIAL = bendMaterial(new THREE.MeshBasicMaterial({ map: SPECKLE })); // always fully bright
const FLASH = new THREE.Color(THEME.mobs.hitFlash);

// Scratch space, reused every frame (making new objects every frame would
// create garbage for the browser to clean up).
const mobMatrix = new THREE.Matrix4();
const boneMatrix = new THREE.Matrix4();
const partMatrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const turn = new THREE.Quaternion();
const scale = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const pivotPoint = new THREE.Vector3();
const color = new THREE.Color();

// Rotate around the X axis (nodding forward) by `angle`, about point (px, py, pz).
function rotateXAbout(out, angle, px, py, pz) {
  out.makeRotationX(angle);
  pivotPoint.set(px, py, pz).applyMatrix4(out);
  return out.setPosition(px - pivotPoint.x, py - pivotPoint.y, pz - pivotPoint.z);
}

// Draws every creature of one type.
export class MobRenderer {
  constructor(type, maxMobs, scene) {
    this.type = type;
    this.parts = type.parts;

    // The colours of each part, from THEME.mobs (stops with a clear message on a typo).
    const palette = THEME.mobs[type.colors];
    if (!palette) throw new Error(`theme.js: no THEME.mobs.${type.colors} colours for ${type.name}`);
    this.colors = this.parts.map((part) => {
      if (!palette[part.color]) throw new Error(`theme.js: THEME.mobs.${type.colors} has no colour "${part.color}"`);
      return new THREE.Color(palette[part.color]);
    });

    // One batch for normal parts, and one for glowing parts (only if it has any).
    const glowCount = this.parts.filter((part) => part.glow).length;
    this.mesh = makeBatch(MATERIAL, maxMobs * (this.parts.length - glowCount), scene);
    this.glowMesh = glowCount ? makeBatch(GLOW_MATERIAL, maxMobs * glowCount, scene) : null;
  }

  // Update the pose of every creature of this type and send it to the graphics card.
  draw(mobs, camera) {
    const parts = this.parts;
    let i = 0; // next free copy in the normal batch
    let g = 0; // ...and in the glowing batch
    for (const mob of mobs) {
      if (mob.type !== this.type) continue;
      const near = Math.hypot(mob.position.x - camera.position.x, mob.position.z - camera.position.z) < FAR_ANIMATION;

      // Where the whole creature is, which way it faces, and how big (it shrinks away when defeated).
      const size = mob.dying ? Math.max(0.01, mob.dyingTimer / mob.dyingLength) : 1;
      position.set(mob.position.x, mob.position.y, mob.position.z);
      turn.setFromAxisAngle(UP, mob.yaw);
      mobMatrix.compose(position, turn, scale.set(size, size, size));

      // Animation: legs swing in two groups, the body bobs, the head dips to graze.
      const swing = near ? Math.sin(mob.walkPhase) * this.type.legSwing * mob.moving : 0;
      const bob = near ? Math.abs(Math.sin(mob.walkPhase)) * 0.05 * mob.moving : 0;

      for (let p = 0; p < parts.length; p++) {
        const part = parts[p];
        const [w, h, d] = part.size;
        const [x, y, z] = part.at;
        partMatrix.makeScale(w, h, d).setPosition(x, y, z);
        if (part.bone === 'leg') {
          // Swing from the hip (top of the leg). Group 1 swings the opposite way.
          rotateXAbout(boneMatrix, part.leg === 0 ? swing : -swing, x, y + h / 2, z);
        } else if (part.bone === 'head') {
          const [px, py, pz] = this.type.head.pivot;
          rotateXAbout(boneMatrix, mob.headDip, px, py, pz);
          boneMatrix.elements[13] += bob;
        } else {
          boneMatrix.makeTranslation(0, bob, 0);
        }
        partMatrix.premultiply(boneMatrix).premultiply(mobMatrix);

        // Colour: normal parts are darker under cover; glowing parts pulse
        // gently (and fade when it leaves at dawn). Both flash when hit.
        color.copy(this.colors[p]).multiplyScalar(part.glow ? mob.glow : mob.shade);
        if (mob.flash > 0) color.lerp(FLASH, mob.flash);
        const batch = part.glow ? this.glowMesh : this.mesh;
        const index = part.glow ? g++ : i++;
        batch.setMatrixAt(index, partMatrix);
        batch.setColorAt(index, color);
      }
    }
    finishBatch(this.mesh, i);
    if (this.glowMesh) finishBatch(this.glowMesh, g);
  }
}

// One instanced mesh: up to `copies` boxes in a single draw call.
function makeBatch(material, copies, scene) {
  const mesh = new THREE.InstancedMesh(CUBE, material, copies);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // changes every frame
  mesh.setColorAt(0, color.set(0xffffff)); // makes the per-copy colour list
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  // Off-screen checks don't work for one mesh spread over many creatures
  // (and the curve moves things). It's a single draw call anyway.
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

// Draw only the first `count` copies, and send this frame's changes.
function finishBatch(mesh, count) {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}

// Move the animation along. `moved` = how far the creature walked this frame.
export function animateMob(mob, dt, moved) {
  const type = mob.type;
  // How much it's walking (0..1), eased so the legs don't stop dead.
  const target = moved > 0.002 ? 1 : 0;
  mob.moving += (target - mob.moving) * Math.min(1, dt * 8);
  // Legs step in time with the distance actually walked, so feet don't slide.
  mob.walkPhase = (mob.walkPhase + (moved / type.stride) * Math.PI * 2) % (Math.PI * 2);
  // Head down while grazing, with a little chewing nod. Head up when alert.
  mob.chew += dt * 8;
  let dip = 0;
  if (mob.grazing) dip = type.head.grazeDip + Math.sin(mob.chew) * 0.06;
  else if (mob.alert) dip = -(type.head.alertLift ?? 0);
  mob.headDip += (dip - mob.headDip) * Math.min(1, dt * 4);
  // Glowing parts pulse gently, and fade out as it leaves at dawn.
  if (type.glow) {
    mob.pulse += dt * type.glow.pulseSpeed;
    mob.glow = (0.82 + 0.18 * Math.sin(mob.pulse)) * mob.glowFade;
  }
  // Fade the hit flash out.
  mob.flash = Math.max(0, mob.flash - dt * 5);
}

// The box around a creature's model at rest (in its own space, facing +z),
// used to check whether a click hit it.
export function modelBounds(type) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { size, at } of type.parts) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], at[a] - size[a] / 2);
      max[a] = Math.max(max[a], at[a] + size[a] / 2);
    }
  }
  return { min, max };
}

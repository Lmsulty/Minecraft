import * as THREE from 'three';
import { THEME } from './theme.js';
import { bendMaterial, bendPoint } from './curve.js';

// The glow around glowing creatures (those with a `glow` section in mobTypes.js):
//
//  1. A soft halo around each one, always facing you.
//  2. A faint pool of light on the ground under each one.
//     Both are see-through pictures that ADD light to whatever is behind
//     them. All of them together are a single draw call, so they're cheap.
//  3. Real lights on the few creatures nearest you (how many depends on the
//     graphics level: glowLights in theme.js), so nearby grass and blocks
//     really light up.
//
// Why only a few real lights, and why a fixed number: every light costs a
// little on every pixel of land. And when the NUMBER of lights changes, the
// graphics card has to rebuild its programs (a hitch), so the lights always
// exist and unused ones are simply turned down to zero.

const MAX_LIGHTS = Math.max(0, ...Object.values(THEME.graphics.levels).map((level) => level.glowLights ?? 0));
const LIGHT_HEIGHT = 0.6; // the light sits this far above the creature's feet
const HALO_HEIGHT = 0.55; // middle of the halo, above its feet
const POOL_LIFT = 0.04;   // the pool floats just above the ground, so it doesn't flicker into it

// A soft round dot: bright in the middle, fading smoothly to nothing at the edge.
function makeSoftDot() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const fade = Math.max(0, 1 - r);
      data.set([255, 255, 255, Math.round(255 * fade * fade)], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Scratch space, reused every frame.
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const flatPoint = new THREE.Vector3();
const color = new THREE.Color();
const LIE_FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export class MobGlow {
  // types = every creature type on this planet (only the glowing ones are used).
  constructor(scene, types) {
    this.types = types.filter((type) => type.glow);
    this.lightColors = new Map(this.types.map((type) => [type, new THREE.Color(THEME.mobs[type.colors].light)]));

    // Halos and pools: 2 copies of one flat square per creature.
    const copies = this.types.reduce((sum, type) => sum + type.spawn.maxCount * 2, 0);
    this.mesh = null;
    if (copies) {
      const material = bendMaterial(new THREE.MeshBasicMaterial({
        map: makeSoftDot(),
        transparent: true,
        blending: THREE.AdditiveBlending, // adds light, never darkens
        depthWrite: false,                // never hides anything behind it
      }));
      this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, copies);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.setColorAt(0, color.set(0xffffff));
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.mesh.count = 0;
      this.mesh.frustumCulled = false;
      scene.add(this.mesh);
    }

    // The real lights (always there; unused ones are turned down to zero).
    this.lights = [];
    if (this.types.length) {
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const light = new THREE.PointLight(0xffffff, 0, 1, 2); // fades with distance, like real light
        scene.add(light);
        this.lights.push(light);
      }
    }
    this.used = []; // scratch: creatures that already have a light this frame
  }

  // How many real lights to use (graphics level). Changing this makes the
  // graphics card rebuild its programs once, so it's only done on a level change.
  setLightCount(count) {
    this.lights.forEach((light, i) => {
      light.visible = i < count;
    });
  }

  update(mobs, camera) {
    if (!this.mesh) return;
    let n = 0;
    for (const mob of mobs) {
      const glow = mob.type.glow;
      if (!glow) continue;
      const strength = this.strengthOf(mob);
      const light = this.lightColors.get(mob.type);

      // Halo, turned to face the camera.
      position.set(mob.position.x, mob.position.y + HALO_HEIGHT, mob.position.z);
      matrix.compose(position, camera.quaternion, scale.set(glow.halo, glow.halo, 1));
      this.mesh.setMatrixAt(n, matrix);
      this.mesh.setColorAt(n++, color.copy(light).multiplyScalar(glow.haloStrength * strength));

      // Pool of light, lying flat on the ground.
      position.set(mob.position.x, mob.position.y + POOL_LIFT, mob.position.z);
      matrix.compose(position, LIE_FLAT, scale.set(glow.pool, glow.pool, 1));
      this.mesh.setMatrixAt(n, matrix);
      this.mesh.setColorAt(n++, color.copy(light).multiplyScalar(glow.poolStrength * strength));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;

    this.placeLights(mobs, camera);
  }

  // How brightly a creature glows right now: its pulse (which also fades as
  // it leaves at dawn), and shrinking away when defeated.
  strengthOf(mob) {
    const size = mob.dying ? Math.max(0, mob.dyingTimer / mob.dyingLength) : 1;
    return mob.glow * size;
  }

  // Put the real lights on the glowing creatures nearest the camera.
  placeLights(mobs, camera) {
    const used = this.used;
    used.length = 0;
    for (const light of this.lights) {
      if (!light.visible) continue;
      // The nearest glowing creature that doesn't have a light yet.
      let best = null;
      let bestDistance = Infinity;
      for (const mob of mobs) {
        if (!mob.type.glow || used.includes(mob)) continue;
        const d = (mob.position.x - camera.position.x) ** 2 + (mob.position.z - camera.position.z) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = mob;
        }
      }
      if (!best) {
        light.intensity = 0;
        continue;
      }
      used.push(best);
      const settings = best.type.glow.light;
      // Lights work on the drawn (possibly curved) world, so put it where the creature is DRAWN.
      flatPoint.set(best.position.x, best.position.y + LIGHT_HEIGHT, best.position.z);
      bendPoint(flatPoint, camera.position.x, light.position);
      light.color.copy(this.lightColors.get(best.type));
      light.intensity = settings.strength * this.strengthOf(best);
      light.distance = settings.reach;
    }
  }
}

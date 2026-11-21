import * as THREE from 'three';
import { THEME } from './theme.js';
import { BLOCK } from './blocks.js';

// With your head under water, the view turns sea-coloured and fades out a
// few blocks away (settings: THEME.underwater). It works by changing the
// distance haze while you're under, and putting it back when you come up.
//
// Call update() every frame AFTER dayNight.update(), because the day/night
// cycle sets the haze colour every frame and this needs to override it.

// Daytime brightness of the soft light (ambientStrength in the day keyframes).
// At night the light is dimmer, and the water gets darker to match.
const DAY_AMBIENT = 1.2;

export class Underwater {
  // getHaze() = the normal [start, end] of the haze, from the graphics level.
  constructor(scene, camera, world, ambientLight, getHaze) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.ambientLight = ambientLight;
    this.getHaze = getHaze;
    this.color = new THREE.Color(THEME.underwater.color);
    this.under = false;
  }

  update() {
    const eye = this.camera.position;
    const under = this.world.getBlock(eye.x, eye.y, eye.z) === BLOCK.WATER;
    const fog = this.scene.fog;
    if (under) {
      const light = Math.min(1, this.ambientLight.intensity / DAY_AMBIENT);
      fog.color.copy(this.color).multiplyScalar(light);
      this.scene.background.copy(fog.color);
      fog.near = 0;
      fog.far = THEME.underwater.distance;
    } else if (this.under) {
      // Just came up: put the normal haze back (the colour comes back by itself).
      [fog.near, fog.far] = this.getHaze();
    }
    this.under = under;
  }
}

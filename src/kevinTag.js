import './kevin.css';
import * as THREE from 'three';
import { bendPoint } from './curve.js';
import { getKevinName, onKevinNameChange } from './kevinName.js';

// The little floating name tag above Kevin's head.
//
// It's a normal web page element (not part of the 3D scene), moved every
// frame to wherever his head appears on screen. That makes it always face
// you, stay sharp, and stay readable at night. It shrinks a little and then
// fades out as he gets further away. Colours: THEME.ui (--kevin-tag-...).
//
// toScreen() is shared: his speech bubble (step 2) will use it too.

const FULL_SIZE_WITHIN = 6; // blocks: closer than this, the tag is full size
const SMALLEST = 0.6;       // ...further away it shrinks, down to this size
const FADE_START = 14;      // blocks: starts fading out here...
const FADE_END = 22;        // ...and is gone by here

const drawn = new THREE.Vector3();

// Where a point in the (flat) game world appears on screen, in pixels from
// the top-left, written into `out`. Returns null if it's behind the camera.
// Bends the point first, so it matches the curved view (curve.js).
export function toScreen(point, camera, out) {
  bendPoint(point, camera.position.x, drawn);
  drawn.project(camera);
  if (drawn.z < -1 || drawn.z > 1) return null; // behind you
  out.x = (drawn.x + 1) / 2 * window.innerWidth;
  out.y = (1 - drawn.y) / 2 * window.innerHeight;
  return out;
}

export class KevinTag {
  constructor(element) {
    this.element = element;
    this.screen = { x: 0, y: 0 };
    this.point = new THREE.Vector3();
    this.setName(getKevinName());
    onKevinNameChange((name) => this.setName(name));
  }

  setName(name) {
    this.element.textContent = name; // textContent (not innerHTML), so any name is shown as plain text
  }

  // Put the tag over `point` (just above his head, in the flat world).
  update(point, camera) {
    camera.updateMatrixWorld(); // the player just moved: use this frame's camera
    this.point.copy(point);
    const distance = this.point.distanceTo(camera.position);
    const fade = 1 - (distance - FADE_START) / (FADE_END - FADE_START);
    const onScreen = fade > 0 && toScreen(this.point, camera, this.screen);
    if (!onScreen) {
      this.element.style.display = 'none';
      return;
    }
    const size = Math.max(SMALLEST, Math.min(1, FULL_SIZE_WITHIN / distance));
    this.element.style.display = 'block';
    this.element.style.opacity = Math.min(1, fade).toFixed(2);
    // Centred above the point, sitting on it.
    this.element.style.transform =
      `translate(${this.screen.x.toFixed(1)}px, ${this.screen.y.toFixed(1)}px) translate(-50%, -100%) scale(${size.toFixed(2)})`;
  }
}

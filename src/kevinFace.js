import * as THREE from 'three';
import { THEME } from './theme.js';
import { bendMaterial } from './curve.js';

// Kevin's TV-screen face.
//
// The screen is a tiny 16 x 12 pixel picture, drawn in code on a canvas and
// shown on a flat panel in front of his head. It always shines (it ignores
// light and darkness, like the glow lamp block), so you can see his face at
// night. It's bent like the land (curve.js), so it follows the curved view.
//
// Expressions:
//   'idle'      two square eyes that blink now and then, and a smug little smirk
//   'talking'   the mouth opens and closes
//   'thinking'  eyes look up while three dots count up
//   'annoyed'   slanted brows, squinting eyes, flat mouth (in a warning orange)
//
// The picture is only redrawn when it actually changes (e.g. a blink), so
// this costs almost nothing.

const WIDTH = 16;  // pixels across the screen
const HEIGHT = 12; // pixels down
const PLANE = new THREE.PlaneGeometry(1, 1); // stretched to the screen's size by kevin.js

const TALK_FRAME = 0.13;  // seconds per mouth open/close
const THINK_FRAME = 0.35; // seconds per extra dot
const BLINK_TIME = 0.12;  // how long a blink lasts
const BLINK_EVERY = [2.5, 5.5]; // seconds between blinks (random in this range)

export class KevinFace {
  constructor(scene) {
    this.colors = THEME.mobs.kevin;

    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter; // chunky pixels, not blurry
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.mesh = new THREE.Mesh(PLANE, bendMaterial(new THREE.MeshBasicMaterial({ map: this.texture })));
    this.mesh.matrixAutoUpdate = false; // kevin.js hands us the exact position every frame
    this.mesh.frustumCulled = false;    // the curve moves things, so off-screen checks can be wrong
    scene.add(this.mesh);

    this.expression = null;
    this.time = 0;       // seconds since the expression changed
    this.blinkIn = 3;    // seconds until the next blink
    this.blinking = 0;   // > 0 while the eyes are shut
    this.drawn = '';     // which picture is on the screen now
  }

  // Called every frame. `matrix` = where the screen is and which way it faces.
  update(dt, expression, matrix) {
    if (expression !== this.expression) {
      this.expression = expression;
      this.time = 0;
    }
    this.time += dt;

    this.blinkIn -= dt;
    this.blinking -= dt;
    if (this.blinkIn <= 0) {
      this.blinking = BLINK_TIME;
      this.blinkIn = BLINK_EVERY[0] + Math.random() * (BLINK_EVERY[1] - BLINK_EVERY[0]);
    }

    // Only redraw when the picture is different from what's showing.
    const key = `${expression}:${this.frame(expression)}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.paint(expression, this.frame(expression));
      this.texture.needsUpdate = true; // send the new picture to the graphics card
    }

    this.mesh.matrix.copy(matrix);
    this.mesh.matrixWorldNeedsUpdate = true;
  }

  // Which step of its little animation an expression is on.
  frame(expression) {
    if (expression === 'talking') return Math.floor(this.time / TALK_FRAME) % 2;
    if (expression === 'thinking') return Math.floor(this.time / THINK_FRAME) % 4;
    return this.blinking > 0 ? 1 : 0; // idle and annoyed: eyes open or shut
  }

  // Draw one picture. (0, 0) is the top-left pixel.
  paint(expression, frame) {
    const c = this.ctx;
    const k = this.colors;

    // Background, with faint lines across like an old TV.
    c.fillStyle = k.screenBg;
    c.fillRect(0, 0, WIDTH, HEIGHT);
    c.fillStyle = k.screenLines;
    for (let y = 1; y < HEIGHT; y += 2) c.fillRect(0, y, WIDTH, 1);

    c.fillStyle = expression === 'annoyed' ? k.screenAngry : k.screenPixel;
    const px = (x, y, w = 1, h = 1) => c.fillRect(x, y, w, h);
    const eyes = (shut) => {
      if (shut) { px(4, 5, 2, 1); px(10, 5, 2, 1); }
      else { px(4, 3, 2, 3); px(10, 3, 2, 3); }
    };

    if (expression === 'talking') {
      eyes(false);
      if (frame === 0) {
        // Mouth open: a hollow box.
        px(6, 7, 4, 1);
        px(6, 9, 4, 1);
        px(6, 8);
        px(9, 8);
      } else {
        px(6, 8, 4, 1); // mouth shut
      }
    } else if (expression === 'thinking') {
      // Eyes look up, and 0 to 3 dots fill in, one at a time.
      px(4, 2, 2, 2);
      px(10, 2, 2, 2);
      for (let i = 0; i < frame; i++) px(4 + i * 3, 8, 2, 2);
    } else if (expression === 'annoyed') {
      // Brows slanting down towards the middle.
      px(3, 2, 2, 1); px(5, 3, 2, 1);
      px(9, 3, 2, 1); px(11, 2, 2, 1);
      // Squinting eyes (still blinks), and a long flat mouth.
      if (frame === 1) { px(4, 5, 2, 1); px(10, 5, 2, 1); }
      else { px(4, 4, 2, 2); px(10, 4, 2, 2); }
      px(5, 9, 6, 1);
    } else {
      // Idle: eyes, and a flat mouth that tips up at one end (smug).
      eyes(frame === 1);
      px(6, 8, 4, 1);
      px(10, 7);
    }
  }
}

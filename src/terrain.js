import { createNoise2D } from 'simplex-noise';
import { BLOCK } from './blocks.js';
import { makeRandom } from './random.js';

// Decides what the untouched world looks like at any spot.
// It only uses seeded noise, so the same seed always gives the same terrain,
// and any chunk can be thrown away and rebuilt identically later.

// ---- Terrain settings ----
const BASE_HEIGHT = 16;  // average ground level
const HILL_HEIGHT = 8;   // how far hills rise/fall from the average
const DIRT_DEPTH = 3;    // dirt layers under the grass

export class Terrain {
  constructor(seed) {
    this.noise2D = createNoise2D(makeRandom(seed));
  }

  // Y of the grass block at column (x, z).
  height(x, z) {
    // Two layers of noise: big gentle hills + smaller bumps.
    const n =
      this.noise2D(x * 0.02, z * 0.02) * 0.75 +
      this.noise2D(x * 0.07, z * 0.07) * 0.25;
    return Math.floor(BASE_HEIGHT + n * HILL_HEIGHT);
  }

  // Which block goes at height y in a column whose grass is at `height`.
  blockForHeight(y, height) {
    if (y > height) return BLOCK.AIR;
    if (y === height) return BLOCK.GRASS;
    if (y >= height - DIRT_DEPTH) return BLOCK.DIRT;
    return BLOCK.STONE;
  }

  // The original block at (x, y, z), before anyone changed it.
  blockAt(x, y, z) {
    return this.blockForHeight(y, this.height(x, z));
  }
}

import * as THREE from 'three';
import { makeRandom } from './random.js';
import { THEME, hexToRgb } from './theme.js';

// All block textures are drawn here, pixel by pixel, in code.
// Each texture is a 16 x 16 tile. They're all packed into one image
// (the "atlas") so every block can share a single material.

const TILE = 16;        // pixels per tile side
const ATLAS_TILES = 4;  // atlas is 4 x 4 tiles = 64 x 64 pixels (room for 16 textures)
const ATLAS_SIZE = TILE * ATLAS_TILES;

// ---- Colours: all come from theme.js ----
// Turn every '#rrggbb' in THEME.textures into [r, g, b] numbers, keeping the same shape.
function toRgb(value) {
  if (typeof value === 'string') return hexToRgb(value);
  if (Array.isArray(value)) return value.map(toRgb);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toRgb(v)]));
}
const C = toRgb(THEME.textures);

// ---- Little colour helpers ----

// Make a colour lighter (f > 1) or darker (f < 1).
function shade([r, g, b], f) {
  return [r * f, g * f, b * f];
}

// Pick one colour from a list at random.
function pick(rand, colors) {
  return colors[Math.floor(rand() * colors.length)];
}

// A 16 x 16 grid of colours that tile painters draw into.
class Tile {
  constructor() {
    this.pixels = new Uint8ClampedArray(TILE * TILE * 4); // red, green, blue, alpha per pixel
  }

  // Wraps around the edges, so cracks and streaks continue on the other side
  // and the texture repeats without visible seams.
  set(x, y, [r, g, b]) {
    x = ((x % TILE) + TILE) % TILE;
    y = ((y % TILE) + TILE) % TILE;
    const i = (y * TILE + x) * 4;
    this.pixels[i] = r;
    this.pixels[i + 1] = g;
    this.pixels[i + 2] = b;
    this.pixels[i + 3] = 255;
  }

  get(x, y) {
    x = ((x % TILE) + TILE) % TILE;
    y = ((y % TILE) + TILE) % TILE;
    const i = (y * TILE + x) * 4;
    return [this.pixels[i], this.pixels[i + 1], this.pixels[i + 2]];
  }
}

// ---- The tile painters: one function per texture ----
// Each gets an empty tile and its own seeded random function.

function paintDirt(t, rand) {
  // Reddish clay in horizontal layers, like soil seen in a cut bank.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.dirt.base));
  }
  // Two gently wavy layer lines, each with a thin lighter line on top.
  for (const home of [4, 11]) {
    let y = home;
    for (let x = 0; x < TILE; x++) {
      if (rand() < 0.25) y += rand() < 0.5 ? -1 : 1;
      y = Math.max(home - 1, Math.min(home + 1, y));
      t.set(x, y, C.dirt.band);
      if (rand() < 0.7) t.set(x, y - 1, C.dirt.bandLight);
    }
  }
  // A few small pebbles: a light pixel with a dark one underneath.
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rand() * TILE);
    const y = Math.floor(rand() * TILE);
    t.set(x, y, C.dirt.pebble);
    t.set(x, y + 1, C.dirt.pebbleDark);
    if (rand() < 0.5) t.set(x + 1, y, C.dirt.pebble);
  }
}

function paintGrassTop(t, rand) {
  // Golden meadow seen from above: neat rows of little tufts, each a short
  // diagonal stroke with a lit tip and a shadow beside it, plus a few flowers.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.grassTop.base));
  }
  // Tufts sit on a staggered grid (every 4 pixels, every other row shifted),
  // nudged a little so it doesn't look too regular.
  for (let gy = 0; gy < TILE; gy += 4) {
    for (let gx = 0; gx < TILE; gx += 4) {
      const x = gx + ((gy / 4) % 2) * 2 + Math.floor(rand() * 2);
      const y = gy + Math.floor(rand() * 2);
      t.set(x, y + 2, C.grassTop.tuftShadow);    // base of the stroke
      t.set(x + 1, y + 1, pick(rand, C.grassTop.base));
      t.set(x + 2, y, C.grassTop.tuft);          // lit tip, leaning up-right
      t.set(x + 1, y + 2, C.grassTop.tuftShadow); // shadow beside it
    }
  }
  // A few flowers.
  for (let i = 0; i < 3; i++) {
    t.set(Math.floor(rand() * TILE), Math.floor(rand() * TILE), pick(rand, C.grassTop.flower));
  }
}

function paintGrassSide(t, rand) {
  // The whole side is a thick mat of moss and roots: no soil showing.
  // Darker fibres run up and down; roots tangle near the bottom.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.grassSide.base));
  }
  // Vertical fibres of random length.
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rand() * TILE);
    const y0 = 1 + Math.floor(rand() * 10);
    const length = 2 + Math.floor(rand() * 4);
    for (let y = y0; y < y0 + length && y < TILE; y++) t.set(x, y, C.grassSide.streak);
  }
  // Roots: the bottom 3 rows are speckled with root colour, thicker at the very bottom.
  for (let y = TILE - 3; y < TILE; y++) {
    const chance = (y - (TILE - 4)) * 0.22;
    for (let x = 0; x < TILE; x++) if (rand() < chance) t.set(x, y, C.grassSide.root);
  }
  // Top row: the meadow colour, so the edge between top and side reads cleanly.
  for (let x = 0; x < TILE; x++) t.set(x, 0, C.grassSide.edge);
}

function paintStone(t, rand) {
  // Warm rock in horizontal bedding layers, with a crack or two between them.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.stone.base));
  }
  // Layer lines at slightly uneven heights, each with a lit edge above it.
  const layers = [2 + Math.floor(rand() * 2), 7 + Math.floor(rand() * 2), 12 + Math.floor(rand() * 2)];
  for (const home of layers) {
    let y = home;
    for (let x = 0; x < TILE; x++) {
      if (rand() < 0.12) y += rand() < 0.5 ? -1 : 1;
      y = Math.max(home - 1, Math.min(home + 1, y));
      t.set(x, y, C.stone.layer);
      t.set(x, y - 1, C.stone.layerLight);
    }
  }
  // Short vertical cracks, so the layers look like separate slabs.
  for (let c = 0; c < 3; c++) {
    const x = Math.floor(rand() * TILE);
    const y = Math.floor(rand() * TILE);
    for (let i = 0; i < 3; i++) t.set(x, y + i, C.stone.crack);
  }
  for (let i = 0; i < 6; i++) {
    t.set(Math.floor(rand() * TILE), Math.floor(rand() * TILE), C.stone.fleck);
  }
}

function paintWoodSide(t, rand) {
  // Red-brown bark with rings around the trunk every few pixels,
  // each with a lit line above it, and the odd knot.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.woodSide.base));
  }
  for (let ring = 0; ring < 4; ring++) {
    const y = ring * 4 + 3;
    for (let x = 0; x < TILE; x++) {
      // Rings are mostly straight, with an occasional one-pixel step.
      const dip = rand() < 0.15 ? 1 : 0;
      t.set(x, y + dip, C.woodSide.ring);
      t.set(x, y - 1 + dip, C.woodSide.ringLight);
    }
  }
  for (let k = 0; k < 2; k++) {
    const x = Math.floor(rand() * TILE);
    const y = Math.floor(rand() * TILE);
    t.set(x, y, C.woodSide.knot);
    t.set(x + 1, y, C.woodSide.knot);
  }
}

function paintWoodTop(t, rand) {
  // Cut log end: rings around the centre, bark around the rim.
  const centre = 7.5;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1) {
        t.set(x, y, pick(rand, C.woodTop.bark));
        continue;
      }
      const d = Math.hypot(x - centre, y - centre);
      const ring = Math.floor(d * 0.75 + rand() * 0.3) % 2;
      let color = ring === 0 ? C.woodTop.ringLight : C.woodTop.ringDark;
      if (d < 1.2) color = C.woodTop.heart; // dark heart in the middle
      t.set(x, y, shade(color, 0.96 + rand() * 0.08));
    }
  }
}

function paintLeaves(t, rand) {
  // Deep shadow, covered in little fans of needles: three short strokes
  // spreading up-left, up and up-right from one point, with lit tips.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.leaves.shadow));
  }
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rand() * TILE);
    const y = Math.floor(rand() * TILE);
    const needle = pick(rand, C.leaves.needle);
    for (const dx of [-1, 0, 1]) {
      t.set(x + dx, y - 1, needle);
      t.set(x + dx * 2, y - 2, needle);
      t.set(x + dx * 2, y - 3, C.leaves.lit); // tip catches the light
    }
    t.set(x, y, needle); // where the needles join
  }
}

function paintSand(t, rand) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // Soft wavy ripples across the tile.
      const ripple = (y + Math.round(Math.sin(x * 0.7) * 1.2) + TILE) % 5 === 0;
      const base = ripple ? C.sand.ripple : pick(rand, C.sand.base);
      t.set(x, y, base);
    }
  }
  for (let i = 0; i < 10; i++) {
    const color = rand() < 0.5 ? C.sand.speckDark : C.sand.speckLight;
    t.set(Math.floor(rand() * TILE), Math.floor(rand() * TILE), color);
  }
}

function paintPlanks(t, rand) {
  // 4 boards, each 4 pixels tall: 3 rows of wood + 1 dark seam.
  for (let b = 0; b < 4; b++) {
    const base = shade(C.planks.board, 0.92 + rand() * 0.12); // each board a slightly different tone
    const joint = (b * 7 + 3 + Math.floor(rand() * 3)) % TILE; // where this board's end meets the next
    for (let row = 0; row < 4; row++) {
      const y = b * 4 + row;
      for (let x = 0; x < TILE; x++) {
        let color;
        if (row === 3) color = C.planks.seam;                 // seam between boards
        else if (x === joint) color = C.planks.joint;         // end joint
        else if (row === 0) color = shade(base, 1.06);       // top edge catches the light
        else color = shade(base, 0.96 + rand() * 0.08);
        t.set(x, y, color);
      }
    }
    // Grain: a couple of short darker streaks along each board.
    for (let s = 0; s < 2; s++) {
      const y = b * 4 + 1 + Math.floor(rand() * 2);
      const x0 = Math.floor(rand() * TILE);
      const len = 3 + Math.floor(rand() * 4);
      for (let x = x0; x < x0 + len; x++) {
        if (x % TILE !== joint) t.set(x, y, shade(base, 0.86));
      }
    }
  }
}

function paintCore(t, rand) {
  // Dark, dense rock with pale streaks running sideways through it.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.core.base));
  }
  for (let v = 0; v < 3; v++) {
    let y = Math.floor(rand() * TILE);
    const x0 = Math.floor(rand() * TILE);
    const length = 6 + Math.floor(rand() * 7);
    for (let x = x0; x < x0 + length; x++) {
      t.set(x, y, C.core.vein);
      if (rand() < 0.25) y += rand() < 0.5 ? -1 : 1; // streaks wander a little
    }
  }
  for (let i = 0; i < 8; i++) {
    t.set(Math.floor(rand() * TILE), Math.floor(rand() * TILE), C.core.speck);
  }
}

function paintStoneBricks(t, rand) {
  // Rows of bricks 4 pixels tall (3 brick + 1 mortar). Every other row is
  // shifted half a brick, like a real wall.
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 === 0 ? 0 : 4;
    for (let r = 0; r < 4; r++) {
      const y = row * 4 + r;
      for (let x = 0; x < TILE; x++) {
        const brickEdge = (x + offset) % 8 === 0;
        let color;
        if (r === 3 || brickEdge) color = C.stoneBricks.mortar;
        else if (r === 0) color = C.stoneBricks.highlight;      // top of each brick catches the light
        else color = pick(rand, C.stoneBricks.base);
        t.set(x, y, color);
      }
    }
  }
  // A few chips and stains.
  for (let i = 0; i < 6; i++) {
    t.set(Math.floor(rand() * TILE), Math.floor(rand() * TILE), C.stoneBricks.chip);
  }
}

function paintGlowLamp(t, rand) {
  // A dark frame with a warm glowing middle, split into 4 panes by a cross.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
      const innerEdge = x === 1 || y === 1 || x === TILE - 2 || y === TILE - 2;
      const cross = x === 7 || x === 8 || y === 7 || y === 8;
      let color;
      if (edge) color = C.glowLamp.frame;
      else if (innerEdge || cross) color = C.glowLamp.frameLight;
      else {
        // Brighter towards the middle of the lamp.
        const d = Math.hypot(x - 7.5, y - 7.5);
        color = d < 4.5 ? C.glowLamp.core : pick(rand, C.glowLamp.glow);
      }
      t.set(x, y, color);
    }
  }
}

function paintGlass(t) {
  // A thin frame round the edge; the middle stays see-through (pixels never
  // set are fully transparent). A few streaks of shine across the pane.
  for (let i = 0; i < TILE; i++) {
    t.set(i, 0, C.glass.frame);
    t.set(i, TILE - 1, C.glass.frameShade);
    t.set(0, i, C.glass.frame);
    t.set(TILE - 1, i, C.glass.frameShade);
  }
  // Shine: two short diagonal lines in the upper-left.
  for (let i = 0; i < 4; i++) {
    t.set(3 + i, 6 - i, C.glass.shine);
    t.set(3 + i, 9 - i, C.glass.shine);
  }
  t.set(11, 11, C.glass.shine); // a small glint bottom-right
}

// ---- Atlas layout ----
// Order here = position in the atlas (left to right, then next row).
// Names must match the `textures` entries in blocks.js.
const PAINTERS = {
  grass_top: paintGrassTop,
  grass_side: paintGrassSide,
  dirt: paintDirt,
  stone: paintStone,
  wood_side: paintWoodSide,
  wood_top: paintWoodTop,
  leaves: paintLeaves,
  sand: paintSand,
  planks: paintPlanks,
  core: paintCore,
  // New tiles go at the end, so the existing ones keep their look.
  stone_bricks: paintStoneBricks,
  glow_lamp: paintGlowLamp,
  glass: paintGlass,
};
const TILE_NAMES = Object.keys(PAINTERS);

// Draw one tile and return its raw pixels (RGBA).
// Each tile has its own fixed seed, so it looks the same every time the game loads.
export function paintTile(name) {
  const index = TILE_NAMES.indexOf(name);
  if (index === -1) throw new Error(`No texture called "${name}"`);
  const tile = new Tile();
  PAINTERS[name](tile, makeRandom(1000 + index * 7919));
  return tile.pixels;
}

// Build the 64 x 64 atlas image with every tile in its slot.
export function paintAtlas() {
  const pixels = new Uint8ClampedArray(ATLAS_SIZE * ATLAS_SIZE * 4);
  TILE_NAMES.forEach((name, index) => {
    const tilePixels = paintTile(name);
    const ox = (index % ATLAS_TILES) * TILE;
    const oy = Math.floor(index / ATLAS_TILES) * TILE;
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((oy + y) * ATLAS_SIZE + ox) * 4;
      pixels.set(tilePixels.subarray(from, from + TILE * 4), to);
    }
  });
  return { pixels, size: ATLAS_SIZE };
}

// Turn the atlas into a Three.js texture, set up to stay crisp and pixelated.
export function createAtlasTexture() {
  const { pixels, size } = paintAtlas();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').putImageData(new ImageData(pixels, size, size), 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;  // close up: big sharp pixels, no blur
  texture.minFilter = THREE.NearestFilter;  // far away: no blur either
  texture.generateMipmaps = false;          // mipmaps would blur distant blocks
  texture.colorSpace = THREE.SRGBColorSpace; // so colours aren't washed out
  return texture;
}

// Where a tile sits in the atlas, as UV coordinates (0..1).
// u goes left -> right; v goes bottom -> top (Three.js flips the canvas so v=1 is the top row).
// The edges are pulled in very slightly so the neighbouring tile can't leak in as a thin line.
const INSET = 0.01 / ATLAS_SIZE;
export function getTileUV(name) {
  const index = TILE_NAMES.indexOf(name);
  if (index === -1) throw new Error(`No texture called "${name}"`);
  const col = index % ATLAS_TILES;
  const row = Math.floor(index / ATLAS_TILES);
  return {
    u0: col / ATLAS_TILES + INSET,
    u1: (col + 1) / ATLAS_TILES - INSET,
    v0: 1 - (row + 1) / ATLAS_TILES + INSET,
    v1: 1 - row / ATLAS_TILES - INSET,
  };
}

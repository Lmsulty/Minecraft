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
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.dirt.base));
  }
  // Small pebbles: a few 1-3 pixel clusters, some dark, some light.
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rand() * TILE);
    const y = Math.floor(rand() * TILE);
    const color = rand() < 0.6 ? C.dirt.pebbleDark : C.dirt.pebbleLight;
    t.set(x, y, color);
    if (rand() < 0.6) t.set(x + 1, y, color);
    if (rand() < 0.4) t.set(x, y + 1, shade(color, 0.9));
  }
}

function paintGrassTop(t, rand) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.grassTop.base));
  }
  // Light blade tips with a darker pixel beneath each, like little leaning blades.
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rand() * TILE);
    const y = Math.floor(rand() * TILE);
    t.set(x, y, C.grassTop.bladeTip);
    t.set(x + 1, y + 1, C.grassTop.bladeShadow);
  }
}

function paintGrassSide(t, rand) {
  paintDirt(t, rand);
  // An uneven grass band along the top. Its depth wanders column by column.
  let depth = 3;
  for (let x = 0; x < TILE; x++) {
    depth += Math.floor(rand() * 3) - 1; // -1, 0 or +1
    depth = Math.max(2, Math.min(5, depth));
    for (let y = 0; y < depth; y++) {
      t.set(x, y, y === 0 ? C.grassSide.bandTop : pick(rand, C.grassSide.band));
    }
    t.set(x, depth, C.grassSide.bandEdge); // darker edge where grass meets dirt
    // Occasional tuft hanging a little further down.
    if (rand() < 0.2) t.set(x, depth + 1, C.grassSide.tuft);
  }
}

function paintStone(t, rand) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.stone.base));
  }
  // Two thin cracks that wander downwards, with a lighter edge beside them.
  for (let c = 0; c < 2; c++) {
    let x = Math.floor(rand() * TILE);
    let y = Math.floor(rand() * TILE);
    const length = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < length; i++) {
      t.set(x, y, C.stone.crack);
      t.set(x + 1, y, C.stone.crackEdge);
      x += Math.floor(rand() * 3) - 1;
      y += 1;
    }
  }
  // A couple of lighter flecks.
  for (let i = 0; i < 5; i++) {
    t.set(Math.floor(rand() * TILE), Math.floor(rand() * TILE), C.stone.fleck);
  }
}

function paintWoodSide(t, rand) {
  // Bark: brown base with 4 dark grooves running up and down, wiggling a little.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.woodSide.base));
  }
  for (let g = 0; g < 4; g++) {
    const home = g * 4 + 1;
    let x = home;
    for (let y = 0; y < TILE; y++) {
      if (rand() < 0.3) x += rand() < 0.5 ? -1 : 1;
      x = Math.max(home - 1, Math.min(home + 1, x));
      t.set(x, y, C.woodSide.groove);
      t.set(x + 1, y, C.woodSide.ridge); // lit ridge next to the groove
    }
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
  // Start with deep shadow, then paint round clumps of leaves on top.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, pick(rand, C.leaves.shadow));
  }
  for (let i = 0; i < 16; i++) {
    const cx = rand() * TILE;
    const cy = rand() * TILE;
    const radius = 1.5 + rand() * 1.2;
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
      for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > radius) continue;
        // Lighter on the upper-left of each clump, like light from above.
        const lit = x - cx + (y - cy) < -1;
        t.set(x, y, lit ? C.leaves.lit : pick(rand, C.leaves.clump));
      }
    }
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

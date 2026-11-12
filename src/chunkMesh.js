import * as THREE from 'three';
import { BLOCK_TYPES } from './blocks.js';
import { createAtlasTexture, getTileUV } from './textures.js';
import { THEME, hexToRgb } from './theme.js';

// Turns a chunk's block data into a mesh Three.js can draw.
// Every block face that could be seen (its neighbour doesn't hide it) is added
// to ONE shared shape per chunk, so each chunk is a single draw call.
//
// It also works out how much SUNLIGHT reaches each face, so caves are dark:
//   1. Air that can see straight up to the sky gets full light.
//   2. That light spreads sideways and downwards through air, one step
//      dimmer per block, for LIGHT_SPREAD blocks (so cave mouths fade smoothly).
//   3. Each face is tinted by the light in the air just in front of it.
// This all happens once, when the chunk is built. It costs nothing per frame.

// How many blocks sunlight spreads from open sky before it's fully dark.
export const LIGHT_SPREAD = 5;
const MARGIN = LIGHT_SPREAD; // look this far into neighbouring chunks, so light at edges is right

// ---- Materials (shared by every chunk) ----
const atlas = createAtlasTexture();
const MATERIALS = {
  // Normal blocks: every pixel solid. vertexColors = use the per-face light tint.
  opaque: new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true }),
  // See-through-pixel blocks (e.g. leaves later): pixels with alpha below 0.5
  // are simply not drawn, so you see through the gaps.
  cutout: new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 }),
};

// ---- Brightness for each light level ----
// Level 0 = THEME.caveLight (darkest), level LIGHT_SPREAD = full brightness.
const BRIGHTNESS = (() => {
  const [r, g, b] = hexToRgb(THEME.caveLight).map((v) => v / 255);
  const levels = [];
  for (let level = 0; level <= LIGHT_SPREAD; level++) {
    const t = level / LIGHT_SPREAD;
    const color = new THREE.Color().setRGB(
      r + (1 - r) * t, g + (1 - g) * t, b + (1 - b) * t, THREE.SRGBColorSpace
    );
    levels.push([color.r, color.g, color.b]);
  }
  return levels;
})();

// Fast lookups by block id (faster than calling a function per block).
const IS_OPAQUE = Uint8Array.from(BLOCK_TYPES, (t) => (t.opaque ? 1 : 0));
const BLOCKS_LIGHT = Uint8Array.from(BLOCK_TYPES, (t) => (t.blocksLight ? 1 : 0));

// ---- The 6 faces of a block ----
// For each face:
//   dir     = which neighbour to check (and which way the face points)
//   tile    = which texture from the block's `textures` to use
//   corners = 4 corner positions inside the 1x1x1 block, in the order
//             bottom-left, bottom-right, top-left, top-right *as seen from outside*.
//             That order makes the triangles face outwards, and keeps
//             side textures the right way up.
const FACES = [
  { dir: [1, 0, 0], tile: 'side', corners: [[1, 0, 1], [1, 0, 0], [1, 1, 1], [1, 1, 0]] },   // east  (+x)
  { dir: [-1, 0, 0], tile: 'side', corners: [[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1]] },  // west  (-x)
  { dir: [0, 1, 0], tile: 'top', corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] },    // top   (+y)
  { dir: [0, -1, 0], tile: 'bottom', corners: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]] }, // bottom (-y)
  { dir: [0, 0, 1], tile: 'side', corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },   // south (+z)
  { dir: [0, 0, -1], tile: 'side', corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] },  // north (-z)
];

// Work out each block type's 6 face UVs once, up front, instead of per face.
const FACE_UVS = BLOCK_TYPES.map((type) =>
  type.textures ? FACES.map((face) => getTileUV(type.textures[face.tile])) : null
);

// Collects faces for one render type, then turns them into a Three.js shape.
class FaceList {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
  }

  addFace(x, y, z, face, uv, [r, g, b]) {
    const first = this.positions.length / 3; // index of this face's first corner
    for (const [cx, cy, cz] of face.corners) {
      this.positions.push(x + cx, y + cy, z + cz);
      this.normals.push(face.dir[0], face.dir[1], face.dir[2]);
      this.colors.push(r, g, b);
    }
    // Corners are bottom-left, bottom-right, top-left, top-right.
    this.uvs.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u0, uv.v1, uv.u1, uv.v1);
    // Two triangles make the square.
    this.indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
  }

  isEmpty() {
    return this.indices.length === 0;
  }

  toGeometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere(); // lets Three.js skip chunks that are off-screen
    return geometry;
  }
}

// ---- Scratch memory, reused for every chunk ----
// Building a chunk needs a few big temporary arrays. Making new ones every
// time creates lots of garbage for the browser to clean up (which can cause
// small hitches), so the same arrays are reused. They grow if ever needed.
const scratch = { blocks: null, light: null, queue: null, skyTop: null };
function scratchArray(name, Type, length) {
  if (!scratch[name] || scratch[name].length < length) scratch[name] = new Type(length);
  return scratch[name];
}

// ---- Step 1: copy the chunk plus a MARGIN-wide border into one box ----
// The "region" is (16 + 2*MARGIN) x worldHeight x (16 + 2*MARGIN) blocks, centred
// on the chunk. Reading from one flat array is much faster than asking the
// world for every single block.
function copyRegion(world, chunk, chunkSize, worldHeight) {
  const size = chunkSize + MARGIN * 2;
  const layer = size * size;
  const blocks = scratchArray('blocks', Uint8Array, layer * worldHeight);
  blocks.fill(0, 0, layer * worldHeight); // 0 = air (also for unloaded chunks)
  const chunkLayer = chunkSize * chunkSize;

  // The 3 x 3 chunks around this one (null if not loaded).
  const around = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) around.push(world.getChunk(chunk.cx + dx, chunk.cz + dz) ?? null);
  }

  for (let rz = 0; rz < size; rz++) {
    for (let rx = 0; rx < size; rx++) {
      const lx = rx - MARGIN; // position relative to this chunk (can be negative)
      const lz = rz - MARGIN;
      const dx = lx < 0 ? -1 : lx >= chunkSize ? 1 : 0;
      const dz = lz < 0 ? -1 : lz >= chunkSize ? 1 : 0;
      const source = around[(dz + 1) * 3 + (dx + 1)];
      if (!source) continue;
      const from = (lx - dx * chunkSize) + (lz - dz * chunkSize) * chunkSize;
      const to = rx + rz * size;
      for (let y = 0; y < worldHeight; y++) {
        blocks[to + y * layer] = source.blocks[from + y * chunkLayer];
      }
    }
  }
  return { blocks, size, layer };
}

// ---- Step 2: work out sunlight for every air block in the region ----
function computeLight({ blocks, size, layer }, worldHeight) {
  const total = layer * worldHeight;
  const light = scratchArray('light', Uint8Array, total);
  light.fill(0, 0, total);

  // 2a. Everything above the highest light-blocking block in a column sees the sky.
  const skyTop = scratchArray('skyTop', Int16Array, layer); // per column: highest y that blocks light (-1 = none)
  for (let col = 0; col < layer; col++) {
    let top = -1;
    for (let y = worldHeight - 1; y >= 0; y--) {
      if (BLOCKS_LIGHT[blocks[col + y * layer]]) { top = y; break; }
    }
    skyTop[col] = top;
    for (let y = top + 1; y < worldHeight; y++) light[col + y * layer] = LIGHT_SPREAD;
  }

  // 2b. Start spreading from sky blocks that sit next to a darker air block
  //     (e.g. beside a cliff or above a cave mouth). Only these can spread light.
  const queue = scratchArray('queue', Int32Array, total);
  let head = 0;
  let tail = 0;
  for (let rz = 0; rz < size; rz++) {
    for (let rx = 0; rx < size; rx++) {
      const col = rx + rz * size;
      let lowestNeighbourTop = skyTop[col];
      if (rx > 0) lowestNeighbourTop = Math.max(lowestNeighbourTop, skyTop[col - 1]);
      if (rx < size - 1) lowestNeighbourTop = Math.max(lowestNeighbourTop, skyTop[col + 1]);
      if (rz > 0) lowestNeighbourTop = Math.max(lowestNeighbourTop, skyTop[col - size]);
      if (rz < size - 1) lowestNeighbourTop = Math.max(lowestNeighbourTop, skyTop[col + size]);
      // Sky blocks in this column that are level with a neighbour column's covered part.
      for (let y = skyTop[col] + 1; y <= lowestNeighbourTop; y++) queue[tail++] = col + y * layer;
    }
  }

  // 2c. Spread: each step into open air (or leaves) is one level dimmer.
  while (head < tail) {
    const i = queue[head++];
    const next = light[i] - 1;
    if (next <= 0) continue;
    const y = Math.floor(i / layer);
    const col = i - y * layer;
    const rz = Math.floor(col / size);
    const rx = col - rz * size;
    const tryCell = (j) => {
      if (light[j] < next && !BLOCKS_LIGHT[blocks[j]]) {
        light[j] = next;
        queue[tail++] = j;
      }
    };
    if (rx > 0) tryCell(i - 1);
    if (rx < size - 1) tryCell(i + 1);
    if (rz > 0) tryCell(i - size);
    if (rz < size - 1) tryCell(i + size);
    if (y > 0) tryCell(i - layer);
    if (y < worldHeight - 1) tryCell(i + layer);
  }
  return light;
}

// ---- Step 3: build the faces ----
export function buildChunkMesh(world, chunk, chunkSize, worldHeight) {
  const region = copyRegion(world, chunk, chunkSize, worldHeight);
  const light = computeLight(region, worldHeight);
  const { blocks, size, layer } = region;

  const ox = chunk.cx * chunkSize; // chunk's position in the world, in blocks
  const oz = chunk.cz * chunkSize;
  const lists = { opaque: new FaceList(), cutout: new FaceList() };

  // Only loop up to the highest block in this chunk; everything above is air.
  let maxY = 0;
  for (let lz = 0; lz < chunkSize; lz++) {
    for (let lx = 0; lx < chunkSize; lx++) {
      const col = (lx + MARGIN) + (lz + MARGIN) * size;
      for (let y = worldHeight - 1; y > maxY; y--) {
        if (blocks[col + y * layer]) { maxY = y; break; }
      }
    }
  }

  // How far apart neighbouring blocks are in the region array, per face direction.
  const step = FACES.map(({ dir: [dx, dy, dz] }) => dx + dz * size + dy * layer);

  for (let y = 0; y <= maxY; y++) {
    for (let lz = 0; lz < chunkSize; lz++) {
      for (let lx = 0; lx < chunkSize; lx++) {
        const i = (lx + MARGIN) + (lz + MARGIN) * size + y * layer;
        const id = blocks[i];
        if (id === 0) continue; // air
        const uvs = FACE_UVS[id];
        const list = lists[BLOCK_TYPES[id].renderType];

        for (let f = 0; f < FACES.length; f++) {
          const dy = FACES[f].dir[1];
          // The underside of the bottom layer can never be seen. Skip it.
          if (dy === -1 && y === 0) continue;
          // Above the top of the world: always open sky.
          if (dy === 1 && y === worldHeight - 1) {
            list.addFace(ox + lx, y, oz + lz, FACES[f], uvs[f], BRIGHTNESS[LIGHT_SPREAD]);
            continue;
          }
          const n = i + step[f];
          if (IS_OPAQUE[blocks[n]]) continue; // hidden behind a solid neighbour
          // Tint the face by the light in the air just in front of it.
          list.addFace(ox + lx, y, oz + lz, FACES[f], uvs[f], BRIGHTNESS[light[n]]);
        }
      }
    }
  }

  // One mesh per render type that has faces. Today that's just "opaque",
  // so each chunk is a single draw call.
  const group = new THREE.Group();
  for (const [renderType, list] of Object.entries(lists)) {
    if (list.isEmpty()) continue;
    group.add(new THREE.Mesh(list.toGeometry(), MATERIALS[renderType]));
  }
  return group;
}

// Free a chunk's old shapes from graphics memory before replacing them.
// Each chunk owns its own geometry, so skipping this would leak memory
// every time a block is broken or placed. Materials are shared, so they stay.
export function disposeChunkMesh(group) {
  group.traverse((obj) => {
    if (obj.isMesh) obj.geometry.dispose();
  });
}

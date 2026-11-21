import * as THREE from 'three';
import { BLOCK_TYPES } from './blocks.js';
import { createAtlasTexture, getTileUV } from './textures.js';
import { THEME, hexToRgb } from './theme.js';
import { bendMaterial } from './curve.js';

// Turns a chunk's block data into a mesh Three.js can draw.
// Every block face that could be seen (its neighbour doesn't hide it) is added
// to ONE shared shape per chunk, so each chunk is a single draw call.
//
// It also works out how much SUNLIGHT reaches each face, so caves are dark:
//   1. Air that can see straight up to the sky gets full light.
//   2. That light spreads sideways and downwards through air, one step
//      dimmer per block, for LIGHT_SPREAD blocks (so cave mouths fade smoothly).
//   3. Blocks that give off light (like the glow lamp) light up the air
//      around them the same way, fading over LIGHT_SPREAD blocks.
//   4. Each face is tinted by the light in the air just in front of it.
// This all happens once, when the chunk is built. It costs nothing per frame.

// How many blocks sunlight spreads from open sky before it's fully dark.
export const LIGHT_SPREAD = 5;
const MARGIN = LIGHT_SPREAD; // look this far into neighbouring chunks, so light at edges is right

// ---- Materials (shared by every chunk) ----
const atlas = createAtlasTexture();
const MATERIALS = {
  // Normal blocks: every pixel solid. vertexColors = use the per-face light tint.
  // All three are bent so the world looks like the inside of a cylinder (curve.js).
  opaque: bendMaterial(new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true })),
  // See-through-pixel blocks (e.g. leaves later): pixels with alpha below 0.5
  // are simply not drawn, so you see through the gaps.
  cutout: bendMaterial(new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 })),
  // Glowing blocks: ignore the sun and moon, so they look lit even at night.
  glow: bendMaterial(new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true })),
  // Water: see-through all over. Drawn after everything solid, so you see the
  // sea floor through it. depthWrite: false = it never hides other water or
  // creatures behind it. DoubleSide = you see the surface from underneath too.
  water: bendMaterial(new THREE.MeshLambertMaterial({
    map: atlas, vertexColors: true, transparent: true, opacity: THEME.waterOpacity,
    depthWrite: false, side: THREE.DoubleSide,
  })),
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
const EMITS_LIGHT = Uint8Array.from(BLOCK_TYPES, (t) => (t.emitsLight ? 1 : 0));

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

// ---- Ambient occlusion: soft shadows where blocks meet ----
// Each corner of a face looks at the 3 blocks just in front of it that touch
// that corner: one on each side, and one diagonally. The more of them are
// solid, the darker that corner. The graphics card then fades smoothly
// between the 4 corners, so edges and inside corners get soft shading.
//
// Level 3 = nothing nearby (full brightness) ... level 0 = tucked in a corner.
const AO_ON = THEME.ambientOcclusion > 0;
const AO_BRIGHTNESS = [0, 1, 2, 3].map((level) => 1 - (THEME.ambientOcclusion * (3 - level)) / 3);
const NO_SHADE = [3, 3, 3, 3];

// For each face and each of its 4 corners: the 3 blocks (as [dx, dy, dz]
// from the block) that can shade that corner.
const AO_NEIGHBOURS = FACES.map((face) => {
  const out = face.dir;                                   // the face points this way
  const axis = out.findIndex((v) => v !== 0);
  const [a1, a2] = [0, 1, 2].filter((a) => a !== axis);   // the two directions along the face
  return face.corners.map((corner) => {
    const side1 = [...out];
    side1[a1] += corner[a1] === 1 ? 1 : -1;
    const side2 = [...out];
    side2[a2] += corner[a2] === 1 ? 1 : -1;
    const diagonal = [...out];
    diagonal[a1] = side1[a1];
    diagonal[a2] = side2[a2];
    return [side1, side2, diagonal];
  });
});

// Collects faces for one render type, then turns them into a Three.js shape.
//
// The numbers are written into fixed-size number arrays that are kept and
// reused for every chunk (they double in size if a chunk ever needs more).
// Growing ordinary lists face by face made lots of throwaway memory, and
// every so often the browser had to stop and clean it up, which made a
// chunk now and then take 5-10 times longer than usual to build.
const START_FACES = 4096; // room for this many faces before growing (most chunks have 1,000-3,000)
class FaceList {
  constructor() {
    this.capacity = 0;
    this.grow(START_FACES);
    this.faces = 0;
  }

  // Make room for `faces` faces, keeping what's already written.
  grow(faces) {
    const keep = (old, Type, perFace) => {
      const bigger = new Type(faces * perFace);
      if (old) bigger.set(old);
      return bigger;
    };
    this.positions = keep(this.positions, Float32Array, 12); // 4 corners x (x, y, z)
    this.normals = keep(this.normals, Float32Array, 12);
    this.colors = keep(this.colors, Float32Array, 12);
    this.uvs = keep(this.uvs, Float32Array, 8);              // 4 corners x (u, v)
    this.indices = keep(this.indices, Uint32Array, 6);       // 2 triangles x 3 corners
    this.capacity = faces;
  }

  // Start again for the next chunk (keeps the memory).
  reset() {
    this.faces = 0;
  }

  // [r, g, b] = the light tint. ao = shade level (0-3) for each of the 4 corners.
  addFace(x, y, z, face, uv, [r, g, b], ao = NO_SHADE) {
    if (this.faces === this.capacity) this.grow(this.capacity * 2);
    const n = this.faces++;
    const first = n * 4; // index of this face's first corner
    let p = n * 12;
    for (let k = 0; k < 4; k++, p += 3) {
      const [cx, cy, cz] = face.corners[k];
      const shade = AO_BRIGHTNESS[ao[k]];
      this.positions[p] = x + cx;
      this.positions[p + 1] = y + cy;
      this.positions[p + 2] = z + cz;
      this.normals[p] = face.dir[0];
      this.normals[p + 1] = face.dir[1];
      this.normals[p + 2] = face.dir[2];
      this.colors[p] = r * shade;
      this.colors[p + 1] = g * shade;
      this.colors[p + 2] = b * shade;
    }
    // Corners are bottom-left, bottom-right, top-left, top-right.
    const t = n * 8;
    const uvs = this.uvs;
    uvs[t] = uv.u0; uvs[t + 1] = uv.v0; uvs[t + 2] = uv.u1; uvs[t + 3] = uv.v0;
    uvs[t + 4] = uv.u0; uvs[t + 5] = uv.v1; uvs[t + 6] = uv.u1; uvs[t + 7] = uv.v1;
    // Two triangles make the square. The square can be split along either
    // diagonal; splitting along the one joining the two darker corners keeps
    // the soft shadows smooth and even (the other way leaves a visible crease).
    const i = n * 6;
    const idx = this.indices;
    if (ao[0] + ao[3] < ao[1] + ao[2]) {
      idx[i] = first; idx[i + 1] = first + 1; idx[i + 2] = first + 3;
      idx[i + 3] = first; idx[i + 4] = first + 3; idx[i + 5] = first + 2;
    } else {
      idx[i] = first; idx[i + 1] = first + 1; idx[i + 2] = first + 2;
      idx[i + 3] = first + 2; idx[i + 4] = first + 1; idx[i + 5] = first + 3;
    }
  }

  isEmpty() {
    return this.faces === 0;
  }

  // Copy exactly the part that was used into the chunk's own shape.
  toGeometry() {
    const n = this.faces;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions.slice(0, n * 12), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals.slice(0, n * 12), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs.slice(0, n * 8), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors.slice(0, n * 12), 3));
    // Corner numbers fit in the smaller 16-bit kind unless a chunk has over 16,383 faces.
    const indices = n * 4 <= 65536 ? Uint16Array.from(this.indices.subarray(0, n * 6)) : this.indices.slice(0, n * 6);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere(); // lets Three.js skip chunks that are off-screen
    return geometry;
  }
}
// One reusable list per render type (see MATERIALS above).
const LISTS = { opaque: new FaceList(), cutout: new FaceList(), glow: new FaceList(), water: new FaceList() };

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

  const queue = scratchArray('queue', Int32Array, total);
  let head = 0;
  let tail = 0;

  // 2b. Glowing blocks (e.g. the glow lamp) spread light too. Each one counts
  //     as one level brighter than open sky, so the air touching it gets full
  //     light. They go in the queue FIRST: brightest first means every air
  //     block gets its final light the first time it's reached.
  for (let i = 0; i < total; i++) {
    if (EMITS_LIGHT[blocks[i]]) {
      light[i] = LIGHT_SPREAD + 1;
      queue[tail++] = i;
    }
  }

  // 2c. Start spreading from sky blocks that sit next to a darker air block
  //     (e.g. beside a cliff or above a cave mouth). Only these can spread light.
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

  // 2d. Spread: each step into open air (or leaves, or glass) is one level dimmer.
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
  const lists = LISTS;
  for (const list of Object.values(lists)) list.reset();

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
  // The same for the ambient occlusion neighbours, plus their height change
  // (so we never look below the bottom or above the top of the world).
  // Stored flat for speed: per face, 4 corners x 3 blocks, in that order.
  const aoStep = AO_NEIGHBOURS.map((corners) => corners.flat().map(([dx, dy, dz]) => dx + dz * size + dy * layer));
  const aoDy = AO_NEIGHBOURS.map((corners) => corners.flat().map(([, dy]) => dy));
  const ao = [3, 3, 3, 3];
  // 1 if the block (step away from block i, at height y + dy) is solid, else 0.
  const solidAt = (i, y, step, dy) => {
    const ny = y + dy;
    return ny >= 0 && ny < worldHeight ? IS_OPAQUE[blocks[i + step]] : 0;
  };

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
          // Two see-through blocks of the same kind side by side (e.g. a glass
          // window): no wall between them, so the window looks like one pane.
          if (blocks[n] === id && !IS_OPAQUE[id]) continue;
          // Tint the face by the light in the air just in front of it.
          const tint = BRIGHTNESS[light[n]];
          // Glowing blocks and water are never shaded; everything else gets soft corner shadows.
          if (!AO_ON || list === lists.glow || list === lists.water) {
            list.addFace(ox + lx, y, oz + lz, FACES[f], uvs[f], tint);
            continue;
          }
          const steps = aoStep[f];
          const dys = aoDy[f];
          for (let k = 0; k < 4; k++) {
            const j = k * 3; // this corner's 3 blocks: side, side, diagonal
            const a = solidAt(i, y, steps[j], dys[j]);
            const b = solidAt(i, y, steps[j + 1], dys[j + 1]);
            // Both sides solid = deepest corner, even if the diagonal is open.
            ao[k] = a && b ? 0 : 3 - a - b - solidAt(i, y, steps[j + 2], dys[j + 2]);
          }
          list.addFace(ox + lx, y, oz + lz, FACES[f], uvs[f], tint, ao);
        }
      }
    }
  }

  // One mesh per render type that has faces. Most chunks only have "opaque"
  // faces, so they're a single draw call; glass or lamps add one more each.
  const group = new THREE.Group();
  for (const [renderType, list] of Object.entries(lists)) {
    if (list.isEmpty()) continue;
    const mesh = new THREE.Mesh(list.toGeometry(), MATERIALS[renderType]);
    // Off-screen checks use the bent positions instead (cullBentChunks in curve.js).
    mesh.frustumCulled = false;
    group.add(mesh);
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

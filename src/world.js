import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { BLOCK, BLOCK_TYPES, isSolidId } from './blocks.js';
import { makeRandom } from './random.js';
import { createAtlasTexture, getTileUV } from './textures.js';

// ---- World size settings ----
export const CHUNK_SIZE = 16;    // chunk width and depth, in blocks
export const WORLD_HEIGHT = 48;  // how tall the world is, in blocks
const WORLD_CHUNKS = 4;          // 4 x 4 chunks = 64 x 64 blocks

// ---- Terrain settings ----
const BASE_HEIGHT = 16;  // average ground level
const HILL_HEIGHT = 8;   // how far hills rise/fall from the average
const DIRT_DEPTH = 3;    // dirt layers under the grass

// One 16 x WORLD_HEIGHT x 16 piece of the world.
class Chunk {
  constructor(cx, cz) {
    this.cx = cx; // chunk coordinates (not block coordinates)
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.mesh = null;
  }

  index(x, y, z) {
    return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
  }

  // x, y, z here are *local* to the chunk (0..15, 0..WORLD_HEIGHT-1, 0..15)
  get(x, y, z) {
    return this.blocks[this.index(x, y, z)];
  }

  set(x, y, z, id) {
    this.blocks[this.index(x, y, z)] = id;
  }
}

// One material for every block: it uses the texture atlas.
const blockMaterial = new THREE.MeshLambertMaterial({ map: createAtlasTexture() });

// One cube shape per block type, with each face pointing at the right
// tile in the atlas. Shared by every chunk.
// (Temporary: merged chunk meshes will replace these cubes in the next step.)
function makeBlockGeometry(textures) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // BoxGeometry stores its 6 faces in this order, 4 corners each:
  // +x (east), -x (west), +y (top), -y (bottom), +z (south), -z (north)
  const faceTiles = [
    textures.side, textures.side, textures.top,
    textures.bottom, textures.side, textures.side,
  ];
  const uv = geometry.attributes.uv;
  faceTiles.forEach((name, face) => {
    const t = getTileUV(name);
    for (let i = face * 4; i < face * 4 + 4; i++) {
      // Each corner's UV starts as 0 or 1 (the whole image). Squeeze it into the tile.
      uv.setXY(i, t.u0 + uv.getX(i) * (t.u1 - t.u0), t.v0 + uv.getY(i) * (t.v1 - t.v0));
    }
  });
  return geometry;
}
const blockGeometries = BLOCK_TYPES.map((type) =>
  type.solid ? makeBlockGeometry(type.textures) : null
);

export class World {
  constructor(seed = 12345) {
    this.seed = seed;
    this.noise2D = createNoise2D(makeRandom(seed));
    this.chunks = new Map(); // key "cx,cz" -> Chunk
    this.group = new THREE.Group(); // add this to the scene to see the world
  }

  // ---- Looking up blocks (always in world coordinates) ----

  chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  getChunk(cx, cz) {
    return this.chunks.get(this.chunkKey(cx, cz));
  }

  getBlock(x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return BLOCK.AIR; // outside the generated world
    return chunk.get(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE);
  }

  isSolid(x, y, z) {
    return isSolidId(this.getBlock(x, y, z));
  }

  // ---- Changing blocks ----

  // Change one block and redraw only the chunks that could look different.
  // Returns true if the block was changed.
  setBlock(x, y, z, id) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false; // outside the generated world

    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    if (chunk.get(lx, y, lz) === id) return false;
    chunk.set(lx, y, lz, id);

    // Always rebuild this chunk. If the block sits on a chunk edge, the
    // neighbouring chunk may have blocks that were hidden (or uncovered)
    // by this one, so rebuild that too. A corner block touches two neighbours.
    const toRebuild = [chunk];
    if (lx === 0) toRebuild.push(this.getChunk(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) toRebuild.push(this.getChunk(cx + 1, cz));
    if (lz === 0) toRebuild.push(this.getChunk(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) toRebuild.push(this.getChunk(cx, cz + 1));
    for (const c of toRebuild) {
      if (c) this.updateChunkMesh(c); // neighbour may not exist at the world's edge
    }
    return true;
  }

  // Y of the first air block above the ground at column (x, z).
  getSurfaceY(x, z) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (this.isSolid(x, y, z)) return y + 1;
    }
    return 0;
  }

  // ---- Generating terrain ----

  terrainHeight(x, z) {
    // Two layers of noise: big gentle hills + smaller bumps.
    const n =
      this.noise2D(x * 0.02, z * 0.02) * 0.75 +
      this.noise2D(x * 0.07, z * 0.07) * 0.25;
    return Math.floor(BASE_HEIGHT + n * HILL_HEIGHT);
  }

  generateChunk(cx, cz) {
    const chunk = new Chunk(cx, cz);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const height = this.terrainHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
        for (let y = 0; y <= height && y < WORLD_HEIGHT; y++) {
          let id = BLOCK.STONE;
          if (y === height) id = BLOCK.GRASS;
          else if (y >= height - DIRT_DEPTH) id = BLOCK.DIRT;
          chunk.set(lx, y, lz, id);
        }
      }
    }
    this.chunks.set(this.chunkKey(cx, cz), chunk);
    return chunk;
  }

  // Build the whole 64 x 64 world. All chunks are generated first,
  // then meshed, so each chunk can see its neighbours' blocks.
  generate() {
    for (let cx = 0; cx < WORLD_CHUNKS; cx++) {
      for (let cz = 0; cz < WORLD_CHUNKS; cz++) {
        this.generateChunk(cx, cz);
      }
    }
    for (const chunk of this.chunks.values()) {
      this.updateChunkMesh(chunk);
    }
  }

  // ---- Drawing ----

  updateChunkMesh(chunk) {
    if (chunk.mesh) {
      this.group.remove(chunk.mesh);
      disposeChunkMesh(chunk.mesh);
    }
    chunk.mesh = buildChunkMesh(this, chunk);
    this.group.add(chunk.mesh);
  }
}

// Turns a chunk's block data into something Three.js can draw.
// FOR NOW: one instanced cube per visible block, grouped by block type.
// LATER: replace just this function with a merged-face mesh + texture atlas.
function buildChunkMesh(world, chunk) {
  const group = new THREE.Group();
  const ox = chunk.cx * CHUNK_SIZE; // chunk's world-space origin
  const oz = chunk.cz * CHUNK_SIZE;

  // Collect positions of visible blocks, per block type.
  const positions = BLOCK_TYPES.map(() => []);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = chunk.get(lx, y, lz);
        if (id === BLOCK.AIR) continue;
        const x = ox + lx;
        const z = oz + lz;
        // Skip blocks completely buried by solid neighbours.
        const hidden =
          world.isSolid(x + 1, y, z) && world.isSolid(x - 1, y, z) &&
          world.isSolid(x, y + 1, z) && world.isSolid(x, y - 1, z) &&
          world.isSolid(x, y, z + 1) && world.isSolid(x, y, z - 1);
        if (!hidden) positions[id].push(x, y, z);
      }
    }
  }

  const matrix = new THREE.Matrix4();
  positions.forEach((list, id) => {
    if (list.length === 0) return;
    const count = list.length / 3;
    const mesh = new THREE.InstancedMesh(blockGeometries[id], blockMaterial, count);
    for (let i = 0; i < count; i++) {
      // +0.5 so block (x, y, z) fills the space x..x+1, y..y+1, z..z+1
      matrix.makeTranslation(list[i * 3] + 0.5, list[i * 3 + 1] + 0.5, list[i * 3 + 2] + 0.5);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  return group;
}

function disposeChunkMesh(group) {
  // Geometry and materials are shared, so only the per-chunk instance data is freed.
  group.traverse((obj) => {
    if (obj.isInstancedMesh) obj.dispose();
  });
}

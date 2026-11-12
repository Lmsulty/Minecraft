import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { BLOCK, isSolidId } from './blocks.js';
import { makeRandom } from './random.js';
import { buildChunkMesh, disposeChunkMesh } from './chunkMesh.js';

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
    chunk.mesh = buildChunkMesh(this, chunk, CHUNK_SIZE, WORLD_HEIGHT);
    this.group.add(chunk.mesh);
  }
}

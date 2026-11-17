import * as THREE from 'three';
import { BLOCK, isSolidId } from './blocks.js';
import { Terrain } from './terrain.js';
import { buildChunkMesh, disposeChunkMesh, LIGHT_SPREAD } from './chunkMesh.js';

// ---- World size settings ----
export const CHUNK_SIZE = 16;    // chunk width and depth, in blocks
export const WORLD_HEIGHT = 96;  // how tall the world is, in blocks

// ---- Loading settings (distances are in chunks, measured in a circle) ----
// The draw distance and the time budget come from the graphics level
// (THEME.graphics in theme.js) and can change while playing: setDrawRadius().
//   drawRadius: chunks this close are generated AND drawn
//   dataRadius: an extra ring of block data (not drawn), so every drawn chunk
//               has all 8 neighbours (diagonals too) for faces and light at
//               its edges. Anything further is unloaded.
const DATA_RING = 1.5;
const COLUMNS_PER_SLICE = 64; // new chunk data is made in slices of this many
                              // block columns (a quarter chunk), so no single step is slow

// Rough first guesses (ms) for how long each kind of step takes. The real
// times are measured as the game runs and replace these.
const FIRST_GUESS_SLICE_MS = 0.5;
const FIRST_GUESS_DRAW_MS = 2;

// One 16 x WORLD_HEIGHT x 16 piece of the world.
class Chunk {
  constructor(cx, cz) {
    this.cx = cx; // chunk coordinates (not block coordinates)
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.mesh = null; // null = block data exists but it isn't drawn
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

// Running average: moves the old value 20% of the way towards the new one,
// so one unusually slow or fast step doesn't throw it off.
function blend(average, latest) {
  return average + (latest - average) * 0.2;
}

export class World {
  constructor(seed, editStore) {
    this.seed = seed;
    this.terrain = new Terrain(seed, WORLD_HEIGHT);
    this.editStore = editStore; // remembers the player's changes (storage.js)
    this.chunks = new Map();    // key "cx,cz" -> Chunk (only the loaded ones)
    this.group = new THREE.Group(); // add this to the scene to see the world

    // Chunk loading
    this.centerCX = null; // the chunk the player was in last time we checked
    this.centerCZ = null;
    this.queue = [];      // chunks waiting to be drawn, nearest one at the end
    this.redrawSoon = new Set(); // drawn chunks to redraw over the next frames (after an edit)
    this.drawRadius = 5;
    this.dataRadius = this.drawRadius + DATA_RING;
    this.budgetMs = 4;    // max time per frame spent building chunks (a frame is ~16.7 ms)
    this.generating = null; // a chunk whose block data is half made: { chunk, nextColumn }

    // How long steps usually take (ms), kept up to date as they're measured.
    // Used to avoid starting a step there isn't time left for.
    this.sliceMs = FIRST_GUESS_SLICE_MS;
    this.drawMs = FIRST_GUESS_DRAW_MS;
  }

  // Change the draw distance (in chunks) and the per-frame time budget.
  // Chunks that are now too far are dropped; new ones in range get queued.
  setDrawRadius(radius, budgetMs) {
    this.drawRadius = radius;
    this.dataRadius = radius + DATA_RING;
    this.budgetMs = budgetMs;
    if (this.centerCX === null) return; // not started yet
    this.unloadFarChunks();
    this.planQueue();
  }

  // ---- Looking up blocks (always in world coordinates) ----

  chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  getChunk(cx, cz) {
    return this.chunks.get(this.chunkKey(cx, cz));
  }

  // Is the chunk containing block column (x, z) loaded?
  isLoadedAt(x, z) {
    return !!this.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
  }

  getBlock(x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return BLOCK.AIR; // not loaded
    return chunk.get(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE);
  }

  isSolid(x, y, z) {
    return isSolidId(this.getBlock(x, y, z));
  }

  // Y of the first air block above the ground at column (x, z).
  getSurfaceY(x, z) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (this.isSolid(x, y, z)) return y + 1;
    }
    return 0;
  }

  // ---- Changing blocks ----

  // Change one block, remember the change, and redraw only the chunks that
  // could look different. Returns true if the block was changed.
  setBlock(x, y, z, id) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false; // not loaded

    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    if (chunk.get(lx, y, lz) === id) return false;
    chunk.set(lx, y, lz, id);
    this.editStore.record(this.chunkKey(cx, cz), lx, y, lz, id, this.terrain.blockAt(x, y, z));

    // Redraw this chunk right away, so the change shows this frame.
    this.updateChunkMesh(chunk);

    // A change near a chunk's edge can also change the neighbouring chunks:
    // faces right on the edge, and sunlight that spreads up to LIGHT_SPREAD
    // blocks. Those neighbours (diagonals too) get redrawn over the next few
    // frames instead of all at once, so breaking a block never causes a hitch.
    const nearWest = lx < LIGHT_SPREAD;
    const nearEast = lx >= CHUNK_SIZE - LIGHT_SPREAD;
    const nearNorth = lz < LIGHT_SPREAD;
    const nearSouth = lz >= CHUNK_SIZE - LIGHT_SPREAD;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        if ((dx === -1 && !nearWest) || (dx === 1 && !nearEast)) continue;
        if ((dz === -1 && !nearNorth) || (dz === 1 && !nearSouth)) continue;
        const neighbour = this.getChunk(cx + dx, cz + dz);
        // Only redraw chunks that are drawn. Data-only chunks get drawn later anyway.
        if (neighbour?.mesh) this.redrawSoon.add(neighbour);
      }
    }
    return true;
  }

  // ---- Generating chunk data ----

  // Make a chunk's block data all at once.
  generateChunk(cx, cz) {
    // If this chunk was half made in slices, finish that one instead.
    const g = this.generating;
    if (g && g.chunk.cx === cx && g.chunk.cz === cz) {
      this.generating = null;
      this.fillColumns(g.chunk, g.nextColumn, CHUNK_SIZE * CHUNK_SIZE);
      return this.finishChunk(g.chunk);
    }
    const chunk = new Chunk(cx, cz);
    this.fillColumns(chunk, 0, CHUNK_SIZE * CHUNK_SIZE);
    return this.finishChunk(chunk);
  }

  // Make the next slice of a chunk's block data (used while loading, so no
  // single frame does a whole chunk). Returns true once the chunk is done.
  generateSlice(cx, cz) {
    let g = this.generating;
    if (!g || g.chunk.cx !== cx || g.chunk.cz !== cz) {
      g = this.generating = { chunk: new Chunk(cx, cz), nextColumn: 0 };
    }
    const end = Math.min(g.nextColumn + COLUMNS_PER_SLICE, CHUNK_SIZE * CHUNK_SIZE);
    this.fillColumns(g.chunk, g.nextColumn, end);
    g.nextColumn = end;
    if (end < CHUNK_SIZE * CHUNK_SIZE) return false;
    this.generating = null;
    this.finishChunk(g.chunk);
    return true;
  }

  // Terrain from the seeded noise (hills, caves, floor, trees) for block
  // columns number `from` up to (not including) `to`. Columns are numbered
  // 0..255 across the chunk.
  fillColumns(chunk, from, to) {
    for (let i = from; i < to; i++) {
      const lx = i % CHUNK_SIZE;
      const lz = Math.floor(i / CHUNK_SIZE);
      const x = chunk.cx * CHUNK_SIZE + lx;
      const z = chunk.cz * CHUNK_SIZE + lz;
      const col = this.terrain.column(x, z);
      for (let y = 0; y <= col.top && y < WORLD_HEIGHT; y++) {
        const id = this.terrain.blockInColumn(x, y, z, col);
        if (id !== BLOCK.AIR) chunk.set(lx, y, lz, id);
      }
    }
  }

  // The terrain is complete: add the player's saved changes on top, and
  // only now add it to the world (so nothing ever sees a half-made chunk).
  finishChunk(chunk) {
    const key = this.chunkKey(chunk.cx, chunk.cz);
    const edits = this.editStore.forChunk(key);
    if (edits) {
      for (const [pos, id] of edits) {
        const [lx, y, lz] = pos.split(',').map(Number);
        chunk.set(lx, y, lz, id);
      }
    }
    this.chunks.set(key, chunk);
    return chunk;
  }

  // Make sure a chunk's block data exists.
  ensureChunk(cx, cz) {
    return this.getChunk(cx, cz) ?? this.generateChunk(cx, cz);
  }

  // Generate a chunk (if needed) plus all 8 neighbours, then draw it.
  // Neighbours come first so faces and light at the chunk's edges are worked out correctly.
  loadAndDraw(cx, cz) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) this.ensureChunk(cx + dx, cz + dz);
    }
    this.updateChunkMesh(this.getChunk(cx, cz));
  }

  // The first of a chunk's 3 x 3 block (itself + 8 neighbours) without data yet.
  findMissingAround(cx, cz) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!this.getChunk(cx + dx, cz + dz)) return { cx: cx + dx, cz: cz + dz };
      }
    }
    return null;
  }

  // ---- Loading around the player (call every frame) ----

  update(playerX, playerZ) {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);
    if (cx !== this.centerCX || cz !== this.centerCZ) {
      // Only re-plan when the player walks into a different chunk.
      this.centerCX = cx;
      this.centerCZ = cz;
      this.unloadFarChunks();
      this.planQueue();
    }
    this.workOnQueue();
  }

  // Squared distance (in chunks) from the player's chunk. Squared avoids a square root.
  distanceSq(cx, cz) {
    const dx = cx - this.centerCX;
    const dz = cz - this.centerCZ;
    return dx * dx + dz * dz;
  }

  unloadFarChunks() {
    const dataSq = this.dataRadius * this.dataRadius;
    const drawSq = this.drawRadius * this.drawRadius;
    for (const [key, chunk] of this.chunks) {
      const d = this.distanceSq(chunk.cx, chunk.cz);
      if (d > dataSq) {
        // Too far: forget it completely. Saved edits live in the EditStore,
        // so they come back when the chunk is generated again.
        this.removeMesh(chunk);
        this.chunks.delete(key);
      } else if (d > drawSq) {
        // In the outer ring: keep the block data, stop drawing it.
        this.removeMesh(chunk);
      }
    }
    // A half-made chunk that's now out of range isn't needed any more.
    const g = this.generating;
    if (g && this.distanceSq(g.chunk.cx, g.chunk.cz) > dataSq) this.generating = null;
  }

  // List every chunk within draw distance that isn't drawn yet.
  planQueue() {
    this.queue = [];
    const r = this.drawRadius;
    for (let dx = -Math.floor(r); dx <= r; dx++) {
      for (let dz = -Math.floor(r); dz <= r; dz++) {
        const d = dx * dx + dz * dz;
        if (d > r * r) continue;
        const cx = this.centerCX + dx;
        const cz = this.centerCZ + dz;
        if (this.getChunk(cx, cz)?.mesh) continue; // already drawn
        this.queue.push({ cx, cz, d });
      }
    }
    // Furthest first, so the nearest one can be taken off the end with pop().
    this.queue.sort((a, b) => b.d - a.d);
  }

  // Build queued chunks until this frame's time budget is used up.
  // Work is done in small steps: one slice of a chunk's block data, or
  // drawing one chunk. Before each step we check that its usual time still
  // fits in what's left of the budget, so a frame never runs far over.
  // The first step of a frame always runs, so loading never stalls.
  workOnQueue() {
    const start = performance.now();
    let stepsDone = 0;
    // Is there time left for a step that usually takes `usualMs`?
    const fits = (usualMs) =>
      stepsDone === 0 || performance.now() - start + usualMs * 1.25 <= this.budgetMs;

    // Redraws after an edit come first: they're right next to the player.
    for (const chunk of this.redrawSoon) {
      if (!fits(this.drawMs)) return;
      this.redrawSoon.delete(chunk);
      if (!chunk.mesh) continue; // it was unloaded meanwhile
      this.timedDraw(chunk);
      stepsDone++;
    }
    while (this.queue.length > 0) {
      const { cx, cz } = this.queue[this.queue.length - 1]; // nearest
      if (this.getChunk(cx, cz)?.mesh) {
        this.queue.pop(); // already drawn (e.g. by loadAroundNow)
        continue;
      }
      // Either make a slice of ONE missing neighbour's block data, or (once
      // all 9 are ready) draw the chunk.
      const missing = this.findMissingAround(cx, cz);
      if (missing) {
        if (!fits(this.sliceMs)) return;
        const t = performance.now();
        this.generateSlice(missing.cx, missing.cz);
        this.sliceMs = blend(this.sliceMs, performance.now() - t);
      } else {
        if (!fits(this.drawMs)) return;
        this.queue.pop();
        this.timedDraw(this.getChunk(cx, cz));
      }
      stepsDone++;
    }
  }

  // Draw a chunk, and remember how long that took.
  timedDraw(chunk) {
    const t = performance.now();
    this.updateChunkMesh(chunk);
    this.drawMs = blend(this.drawMs, performance.now() - t);
  }

  // Load and draw the chunks right around a spot immediately (used at startup
  // so the player has ground to stand on before the first frame).
  loadAroundNow(x, z, radius = 1) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (!this.getChunk(cx + dx, cz + dz)?.mesh) this.loadAndDraw(cx + dx, cz + dz);
      }
    }
  }

  // Numbers for the FPS counter.
  stats() {
    let drawn = 0;
    for (const chunk of this.chunks.values()) if (chunk.mesh) drawn++;
    return { loaded: this.chunks.size, drawn, queued: this.queue.length };
  }

  // ---- Drawing ----

  updateChunkMesh(chunk) {
    this.removeMesh(chunk);
    chunk.mesh = buildChunkMesh(this, chunk, CHUNK_SIZE, WORLD_HEIGHT);
    this.group.add(chunk.mesh);
  }

  removeMesh(chunk) {
    if (!chunk.mesh) return;
    this.group.remove(chunk.mesh);
    disposeChunkMesh(chunk.mesh);
    chunk.mesh = null;
  }
}

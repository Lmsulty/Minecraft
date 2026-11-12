import * as THREE from 'three';
import { BLOCK, BLOCK_TYPES, isOpaqueId } from './blocks.js';
import { createAtlasTexture, getTileUV } from './textures.js';

// Turns a chunk's block data into a mesh Three.js can draw.
// Every block face that could be seen (its neighbour doesn't hide it) is added
// to ONE shared shape per chunk, so each chunk is a single draw call.

// ---- Materials (shared by every chunk) ----
const atlas = createAtlasTexture();
const MATERIALS = {
  // Normal blocks: every pixel solid.
  opaque: new THREE.MeshLambertMaterial({ map: atlas }),
  // See-through-pixel blocks (e.g. leaves later): pixels with alpha below 0.5
  // are simply not drawn, so you see through the gaps.
  cutout: new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.5 }),
};

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
    this.indices = [];
  }

  addFace(x, y, z, face, uv) {
    const first = this.positions.length / 3; // index of this face's first corner
    for (const [cx, cy, cz] of face.corners) {
      this.positions.push(x + cx, y + cy, z + cz);
      this.normals.push(...face.dir);
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
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere(); // lets Three.js skip chunks that are off-screen
    return geometry;
  }
}

// Should we draw the face of a block that touches this neighbour?
// Yes, unless the neighbour is opaque (it would cover the face completely).
// Note: a see-through block next to the same see-through block (leaves next to
// leaves) still draws the face between them, which makes tree tops look full.
function faceVisible(neighbourId) {
  return !isOpaqueId(neighbourId);
}

export function buildChunkMesh(world, chunk, chunkSize, worldHeight) {
  const ox = chunk.cx * chunkSize; // chunk's position in the world, in blocks
  const oz = chunk.cz * chunkSize;
  const lists = { opaque: new FaceList(), cutout: new FaceList() };

  // Look up a neighbour. Inside this chunk: read it directly (fast).
  // Past the chunk's edge: ask the world, which finds the neighbouring chunk.
  const blockAt = (lx, y, lz) => {
    if (lx >= 0 && lx < chunkSize && lz >= 0 && lz < chunkSize) {
      if (y < 0 || y >= worldHeight) return BLOCK.AIR;
      return chunk.get(lx, y, lz);
    }
    return world.getBlock(ox + lx, y, oz + lz);
  };

  for (let y = 0; y < worldHeight; y++) {
    for (let lz = 0; lz < chunkSize; lz++) {
      for (let lx = 0; lx < chunkSize; lx++) {
        const id = chunk.get(lx, y, lz);
        if (id === BLOCK.AIR) continue;
        const uvs = FACE_UVS[id];
        const list = lists[BLOCK_TYPES[id].renderType];

        for (let f = 0; f < FACES.length; f++) {
          const [dx, dy, dz] = FACES[f].dir;
          // The underside of the bottom layer can never be seen. Skip it.
          if (dy === -1 && y === 0) continue;
          if (!faceVisible(blockAt(lx + dx, y + dy, lz + dz))) continue;
          list.addFace(ox + lx, y, oz + lz, FACES[f], uvs[f]);
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
// Each chunk owns its own geometry now, so skipping this would leak memory
// every time a block is broken or placed. Materials are shared, so they stay.
export function disposeChunkMesh(group) {
  group.traverse((obj) => {
    if (obj.isMesh) obj.geometry.dispose();
  });
}

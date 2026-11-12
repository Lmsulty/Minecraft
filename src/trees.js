import { THEME } from './theme.js';
import { BLOCK, BLOCK_TYPES } from './blocks.js';

// Trees: where they grow and what shape they are.
// The shape and settings live in theme.js (THEME.trees) so they can be reskinned.
//
// Placement: the world is split into square cells. Each cell may get one tree,
// decided by a random roll seeded by the world seed + the cell, so trees are
// always in the same places. A tree's whole canopy fits inside its own cell,
// so trees never overlap, and finding "which tree is here?" means checking
// just one cell.

const S = THEME.trees;

function blockIdByName(name) {
  const id = BLOCK_TYPES.findIndex((type) => type.name === name);
  if (id === -1) throw new Error(`theme.js trees: no block called "${name}"`);
  return id;
}
const TRUNK = blockIdByName(S.trunkBlock);
const LEAVES = blockIdByName(S.leafBlock);

// Widest leaf layer, and the highest one above the trunk top.
export const TREE_RADIUS = Math.max(...S.canopy.map((layer) => layer.radius));
const CANOPY_ABOVE = Math.max(0, ...S.canopy.map((layer) => layer.y));
const LAYERS = new Map(S.canopy.map((layer) => [layer.y, layer.radius])); // y -> radius

// Cell size: room for the widest canopy plus the spacing.
const TREE_CELL = TREE_RADIUS * 2 + 1 + S.spacing;

// The tree that belongs to a cell, or null. `terrain` decides whether the spot
// is allowed (not in a sinkhole, cave opening, or the spawn area).
function treeForCell(terrain, cellX, cellZ) {
  return terrain.cached(`t${cellX},${cellZ}`, () => {
    const rand = terrain.cellRandom(cellX, cellZ, 0x7f4a7c15);
    if (rand() >= S.chance) return null;
    // Trunk position: anywhere that keeps the whole canopy inside the cell.
    const x = cellX * TREE_CELL + TREE_RADIUS + Math.floor(rand() * (S.spacing + 1));
    const z = cellZ * TREE_CELL + TREE_RADIUS + Math.floor(rand() * (S.spacing + 1));
    const [lo, hi] = S.trunkHeight;
    const trunkHeight = lo + Math.floor(rand() * (hi - lo + 1));
    if (!terrain.canGrowTree(x, z, TREE_RADIUS)) return null;
    const ground = terrain.height(x, z);
    const trunkTop = ground + trunkHeight;
    const top = trunkTop + CANOPY_ABOVE;
    if (top >= terrain.worldHeight) return null; // would poke out of the world
    return { x, z, ground, trunkTop, top };
  });
}

// The tree whose trunk or leaves reach column (x, z), or null.
export function treeAtColumn(terrain, x, z) {
  const tree = treeForCell(terrain, Math.floor(x / TREE_CELL), Math.floor(z / TREE_CELL));
  if (!tree) return null;
  if (Math.abs(x - tree.x) > TREE_RADIUS || Math.abs(z - tree.z) > TREE_RADIUS) return null;
  return tree;
}

// Which block of `tree` is at (x, y, z): trunk, leaves, or air.
export function treeBlockAt(tree, x, y, z) {
  if (x === tree.x && z === tree.z && y > tree.ground && y <= tree.trunkTop) return TRUNK;
  const radius = LAYERS.get(y - tree.trunkTop);
  if (radius === undefined) return BLOCK.AIR;
  const dx = Math.abs(x - tree.x);
  const dz = Math.abs(z - tree.z);
  if (dx > radius || dz > radius) return BLOCK.AIR;
  if (S.trimCorners && radius > 0 && dx === radius && dz === radius) return BLOCK.AIR;
  return LEAVES;
}

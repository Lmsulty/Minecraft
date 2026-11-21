import { BLOCK, isBreakableId } from './blocks.js';
import { treeAtColumn, treeBlockAt, TREE_RADIUS } from './trees.js';
import { facing, wantedSpot, at, shapeOf, structure, MAIN } from './kevinBlueprints.js';

// Finding (and clearing) a SPOT for a wall, tower or hut.
//
// 1. He looks at the spot you're aiming at, then at spots around it (up to
//    3 blocks away, nearest first):
//      - the first one that's already clear and flat (ground bumps of at
//        most 1 block), he uses as it is
//      - otherwise he takes the nearest one he could clear: ground bumps of
//        at most 2 blocks, and nothing of YOURS in the way
// 2. Clearing: he removes the NATURAL blocks where the build goes (ground,
//    stone, sand, trees...), levelling the ground. Touch any part of a tree
//    and he takes the whole tree, trunk and all its leaves, so nothing is
//    left floating.
// 3. Foundations: wherever the ground dips under the build, he fills down
//    to the ground, so nothing floats and there are no holes. Huts also get
//    a full floor.
//
// He NEVER removes a block you (or he) placed: world.isNatural() tells them
// apart, because the world remembers every block that's been changed. If
// your blocks are in the way everywhere nearby, he says so instead.

// ==========================================================
const SEARCH = 3;          // looks up to this many blocks around the spot you're aiming at
const FLAT_ENOUGH = 1;     // ground bumps up to this high count as flat (no levelling needed)
const MAX_BUMP = 2;        // he'll level ground with bumps up to this high
const MAX_FOUNDATION = 4;  // fills at most this deep under any part of the build
// ==========================================================

const key = (b) => `${b.x},${b.y},${b.z}`;

// A natural tree block (trunk or leaves)?
function isNaturalTree(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  return (id === BLOCK.WOOD || id === BLOCK.LEAVES) && world.isNatural(x, y, z);
}

// The ground level in column (x, z) near height `nearY`, ignoring trees:
// the y of the first space above real ground. null if there's none close.
function groundLevel(world, x, z, nearY) {
  for (let y = nearY + 3; y >= nearY - 6; y--) {
    const below = world.isSolid(x, y - 1, z) && !isNaturalTree(world, x, y - 1, z);
    const here = !world.isSolid(x, y, z) || isNaturalTree(world, x, y, z);
    if (below && here) return y;
  }
  return null;
}

// Every natural block of the tree that block (x, y, z) belongs to, or just
// that block if it isn't part of a generated tree.
function wholeTree(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  const tree = treeAtColumn(world.terrain, x, z);
  if (!tree || treeBlockAt(tree, x, y, z) !== id) return [{ x, y, z, id }];
  const blocks = [];
  for (let tx = tree.x - TREE_RADIUS; tx <= tree.x + TREE_RADIUS; tx++) {
    for (let tz = tree.z - TREE_RADIUS; tz <= tree.z + TREE_RADIUS; tz++) {
      for (let ty = tree.ground + 1; ty <= tree.top; ty++) {
        const treeId = treeBlockAt(tree, tx, ty, tz);
        if (treeId === BLOCK.AIR) continue;
        if (world.getBlock(tx, ty, tz) === treeId && world.isNatural(tx, ty, tz)) {
          blocks.push({ x: tx, y: ty, z: tz, id: treeId });
        }
      }
    }
  }
  return blocks;
}

// Could it go with its front-middle at column (x, z)? Returns
//   { ok: true, start, clear, foundation, alreadyClear }  or
//   { ok: false, yours }  (yours = one of your blocks is in the way)
function checkSpot(kind, shape, world, player, dir, x, z, nearY) {
  const p = player.position;
  const columns = shape.columns.map(([along, side]) => at({ x, y: 0, z }, dir, along, side, 0));

  // Ground level under each column.
  const levels = [];
  for (const c of columns) {
    if (!world.isLoadedAt(c.x, c.z)) return { ok: false };
    if (c.x === Math.floor(p.x) && c.z === Math.floor(p.z)) return { ok: false }; // you're standing there
    const level = groundLevel(world, c.x, c.z, nearY);
    if (level === null) return { ok: false };
    levels.push(level);
  }
  const lowest = Math.min(...levels);
  const highest = Math.max(...levels);
  if (highest - lowest > MAX_BUMP) return { ok: false };

  // Build at the most common ground level (ties: the higher one), so he
  // digs off the odd bump and fills the odd dip.
  const counts = new Map();
  for (const level of levels) counts.set(level, (counts.get(level) ?? 0) + 1);
  let base = lowest;
  for (const [level, n] of counts) {
    if (n > counts.get(base) || (n === counts.get(base) && level > base)) base = level;
  }

  // What's in the space it fills: must be air, or natural blocks he can clear.
  const clear = [];
  let inTheWay = 0; // solid blocks above ground level (not counting a hut's floor layer)
  for (const c of columns) {
    for (let up = shape.bottom; up <= shape.top; up++) {
      const y = base + up;
      const id = world.getBlock(c.x, y, c.z);
      if (id === BLOCK.AIR) continue;
      if (!world.isNatural(c.x, y, c.z)) return { ok: false, yours: true };
      if (!isBreakableId(id)) return { ok: false };
      clear.push({ x: c.x, y, z: c.z, id });
      if (up >= 0) inTheWay++;
    }
  }

  // Foundations: fill any gap under the lowest layer, down to the ground.
  // (A tree trunk counts as a gap: the tree is coming out.)
  const foundation = [];
  for (const c of columns) {
    let depth = 0;
    for (let y = base + shape.bottom - 1; !world.isSolid(c.x, y, c.z) || isNaturalTree(world, c.x, y, c.z); y--) {
      if (++depth > MAX_FOUNDATION) return { ok: false };
      if (world.isSolid(c.x, y, c.z)) clear.push({ x: c.x, y, z: c.z, id: world.getBlock(c.x, y, c.z) }); // that tree goes too
      foundation.push({ x: c.x, y, z: c.z, id: MAIN });
    }
  }

  return {
    ok: true,
    start: { x, y: base, z },
    clear,
    foundation,
    alreadyClear: inTheWay === 0 && highest - lowest <= FLAT_ENOUGH,
  };
}

// Find a spot for a wall, tower or hut. Returns
//   { ok: true, clear, blocks }   clear = natural blocks to remove first (top down),
//                                 blocks = what to place (foundations first)
//   { ok: false, reason }         'yoursInTheWay' or 'tooBumpy'
export function findSite(kind, { world, player, aim }) {
  const dir = facing(player);
  const shape = shapeOf(kind);
  const wanted = wantedSpot(kind, world, player, aim, dir);

  // Spots around the one you're aiming at, nearest first.
  const offsets = [];
  for (let along = -SEARCH; along <= SEARCH; along++) {
    for (let side = -SEARCH; side <= SEARCH; side++) offsets.push([along, side]);
  }
  offsets.sort((a, b) => (a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2));

  let nearestToClear = null;
  let yours = false;
  let chosen = null;
  for (const [along, side] of offsets) {
    const c = at(wanted, dir, along, side, 0);
    const spot = checkSpot(kind, shape, world, player, dir, c.x, c.z, wanted.y);
    if (spot.yours) yours = true;
    if (!spot.ok) continue;
    if (spot.alreadyClear) {
      chosen = spot;
      break;
    }
    nearestToClear ??= spot;
  }
  chosen ??= nearestToClear;
  if (!chosen) return { ok: false, reason: yours ? 'yoursInTheWay' : 'tooBumpy' };

  // Clearing list: each block, plus the whole tree for any tree block (no repeats).
  const seen = new Set();
  const clear = [];
  for (const b of chosen.clear) {
    const group = b.id === BLOCK.WOOD || b.id === BLOCK.LEAVES ? wholeTree(world, b.x, b.y, b.z) : [b];
    for (const g of group) {
      if (seen.has(key(g))) continue;
      seen.add(key(g));
      clear.push(g);
    }
  }
  clear.sort((a, b) => b.y - a.y); // top down, so treetops go first

  chosen.foundation.sort((a, b) => a.y - b.y); // from the ground up
  return { ok: true, clear, blocks: [...chosen.foundation, ...structure(kind, chosen.start, dir)] };
}

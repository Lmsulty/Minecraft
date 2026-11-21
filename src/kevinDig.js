import { BLOCK, isBreakableId } from './blocks.js';
import { facing, at } from './kevinBlueprints.js';
import { wholeTree } from './kevinSite.js';

// Kevin DIGGING: tunnels and staircases going down. (kevinBuild.js does the
// actual digging, one block at a time, like clearing a spot for a hut.)
//
//   tunnel  2 high, 1 wide, 10 long. It starts at the block you're POINTING
//           at (the side of a hill or a wall, up to about 8 blocks away) and
//           goes straight on, level, the way you're facing. Not pointing at
//           a hillside or wall? He asks you to, instead of tunnelling through air.
//   stairs  a staircase going down 8 steps, 3 blocks of headroom on every
//           step so you can walk down AND back up. It starts at the ground
//           you're aiming at, or right in front of you if you're not aiming
//           at the ground.
//
// "The way you're facing" is snapped to the nearest of the four directions,
// so tunnels and stairs line up with the blocks.
//
// Same rules as clearing a spot:
//   - he only digs NATURAL blocks. If one of YOUR blocks is in the way, the
//     tunnel or staircase stops just before it (and he says so)
//   - dig through part of a tree and the whole tree comes out (no floating leaves)
//   - in survival, everything he digs goes into your inventory
//
// Lamps: every 4 blocks he sets a glow lamp into the side wall at head
// height, so it's not pitch black. In creative they're free; in survival
// he uses yours, as many as you have (none = no lamps, but he still digs).
//
// A staircase also stops early if it breaks into a cave (there'd be no
// step to stand on), and never goes near the unbreakable floor of the world.

// ==========================================================
const TUNNEL = { length: 10, height: 2 };
const STAIRS = { steps: 8, headroom: 3 };
const LAMP_EVERY = 4;   // a lamp every this many blocks...
const FIRST_LAMP = 2;   // ...starting this far in
const LOWEST_FLOOR = 2; // never digs a step lower than this (the world's floor is at 0)
// ==========================================================

const key = (b) => `${b.x},${b.y},${b.z}`;

// Is there something there he must not dig? (Yours, or unbreakable.)
function isOffLimits(world, c) {
  const id = world.getBlock(c.x, c.y, c.z);
  return id !== BLOCK.AIR && (!world.isNatural(c.x, c.y, c.z) || !isBreakableId(id));
}

// A natural block he could dig?
function isDiggable(world, c) {
  return world.isSolid(c.x, c.y, c.z) && !isOffLimits(world, c);
}

// Where the dig starts: the spot just BEFORE the first column he digs (so
// "along 1" is the first column). Returns { start } or { reason }.
//   aim = the block you're pointing at, with the face you hit (nx, ny, nz), or null
function startOf(kind, world, player, aim, dir) {
  const p = player.position;
  const feet = { x: Math.floor(p.x), y: Math.floor(p.y + 0.01), z: Math.floor(p.z) }; // the block your feet are in

  if (kind === 'tunnel') {
    // Must be pointing at the SIDE of a natural block (a hillside or wall).
    const side = aim && aim.ny === 0;
    if (!side) return { reason: 'pointAtHill' };
    if (!isDiggable(world, aim)) return { reason: world.isSolid(aim.x, aim.y, aim.z) ? 'yoursInTheWay' : 'pointAtHill' };
    // 2 high: the block you're pointing at and the one above it, or the one
    // below it if you're pointing at head height (so you can walk straight in).
    const below = { x: aim.x, y: aim.y - 1, z: aim.z };
    const bottom = aim.y > feet.y && isDiggable(world, below) ? aim.y - 1 : aim.y;
    return { start: { x: aim.x - dir.fx, y: bottom, z: aim.z - dir.fz } };
  }

  // Stairs: the TOP of a natural ground block you're aiming at (with air above it)...
  const ground = aim && aim.ny === 1 && isDiggable(world, aim) && !world.isSolid(aim.x, aim.y + 1, aim.z);
  if (ground) return { start: { x: aim.x - dir.fx, y: aim.y + 1, z: aim.z - dir.fz } };
  // ...or else right in front of you.
  return { start: feet };
}

// Plan a tunnel ('tunnel') or a staircase down ('stairs').
// `aim` = the block you're pointing at (see startOf), or null.
// `lamps` = how many glow lamps he may use (Infinity in creative).
// Returns
//   { ok: true, dig, lamps, short }  dig = blocks to remove, in order;
//                                    lamps = lamp blocks to place afterwards;
//                                    short = stopped early at your blocks
//   { ok: false, reason }            'pointAtHill', 'yoursInTheWay' or 'nothingToDig'
export function digPlan(kind, { world, player, aim, lamps: lampsAllowed }) {
  const dir = facing(player);
  const begin = startOf(kind, world, player, aim, dir);
  if (!begin.start) return { ok: false, reason: begin.reason };
  const start = begin.start;
  const length = kind === 'tunnel' ? TUNNEL.length : STAIRS.steps;
  const height = kind === 'tunnel' ? TUNNEL.height : STAIRS.headroom;

  const dig = [];
  const lamps = [];
  let short = false;
  for (let along = 1; along <= length; along++) {
    const level = kind === 'tunnel' ? 0 : -along; // where your feet go, counted from the start's level
    if (start.y + level < LOWEST_FLOOR) break;

    // The space to dig out in this column, top first.
    const cells = [];
    for (let up = height - 1; up >= 0; up--) cells.push(at(start, dir, along, 0, level + up));
    if (cells.some((c) => isOffLimits(world, c))) {
      short = true; // your blocks: stop just before them
      break;
    }
    for (const c of cells) {
      const id = world.getBlock(c.x, c.y, c.z);
      if (id !== BLOCK.AIR) dig.push({ ...c, id });
    }

    // A lamp set into the side wall at head height (right side, else left).
    if (along % LAMP_EVERY === FIRST_LAMP % LAMP_EVERY && lamps.length < lampsAllowed) {
      for (const side of [1, -1]) {
        const w = at(start, dir, along, side, level + 1);
        const id = world.getBlock(w.x, w.y, w.z);
        if (id === BLOCK.AIR || id === BLOCK.WOOD || id === BLOCK.LEAVES || isOffLimits(world, w)) continue;
        dig.push({ ...w, id });
        lamps.push({ ...w, id: BLOCK.GLOW_LAMP });
        break;
      }
    }

    // Staircase broke into a cave: nothing to stand on below this step. Stop here.
    const below = at(start, dir, along, 0, level - 1);
    if (kind === 'stairs' && !world.isSolid(below.x, below.y, below.z)) break;
  }

  if (dig.length === 0) return { ok: false, reason: short ? 'yoursInTheWay' : 'nothingToDig' };

  // Any tree blocks: take the whole tree (right after that block, treetop first).
  const seen = new Set();
  const ordered = [];
  for (const b of dig) {
    const group = b.id === BLOCK.WOOD || b.id === BLOCK.LEAVES
      ? wholeTree(world, b.x, b.y, b.z).sort((a, c) => c.y - a.y)
      : [b];
    for (const g of group) {
      if (seen.has(key(g))) continue;
      seen.add(key(g));
      ordered.push(g);
    }
  }
  return { ok: true, dig: ordered, lamps, short };
}

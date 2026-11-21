import { BLOCK } from './blocks.js';

// Kevin's BLUEPRINTS: where each block of each build goes, and in what order.
// (kevinSite.js finds a good spot for walls, towers and huts and clears it;
// kevinBuild.js picks which block to use, checks you have enough, and places
// them one by one.)
//
// Every build is lined up with the way you're facing, snapped to the
// nearest of the four directions, so walls come out straight.
//
//   wall    5 wide, 3 high, standing across your view
//   tower   a 1x1 pillar, 7 high, with a glow lamp on top (a beacon to find your way back)
//   hut     5x5 with a floor, 3 high walls, a doorway facing you, and a flat roof
//   bridge  a 1-wide walkway straight ahead at the height of the block you're
//           standing on. It only fills gaps, and stops when it reaches ground again.
//   light   4 glow lamps on the ground around you
//
// Each block is { x, y, z, id }. id is either a real block id (the lamps)
// or MAIN, meaning "whatever block Kevin is building with".

export const MAIN = 'main';

// ==========================================================
//  SIZES: tweak these to change how big things are.
// ==========================================================
const WALL = { width: 5, height: 3, distance: 3 };
const TOWER = { height: 7, distance: 3 };          // plus the lamp on top
const HUT = { size: 5, wallHeight: 3, distance: 2 }; // distance to its front wall
const BRIDGE = { maxLength: 12, landBefore: 3 };   // gives up if no gap starts within 3 blocks
const LIGHT = { lamps: 4, radius: 4 };
const AIM_REACH = 8; // aiming at ground further away than this: use "in front of you" instead
// ==========================================================

// Which way you're facing, snapped to the nearest of the four directions.
// forward = (fx, fz), right = (rx, rz). The player looks along -sin/-cos of yaw.
export function facing(player) {
  const lookX = -Math.sin(player.yaw);
  const lookZ = -Math.cos(player.yaw);
  const [fx, fz] = Math.abs(lookX) > Math.abs(lookZ) ? [Math.sign(lookX), 0] : [0, Math.sign(lookZ)];
  return { fx, fz, rx: -fz, rz: fx };
}

// The first air block just above the ground in column (x, z), searching
// near height `nearY`. null if there's no ground close to that height.
export function groundAt(world, x, z, nearY) {
  for (let y = nearY + 3; y >= nearY - 6; y--) {
    if (world.isSolid(x, y - 1, z) && !world.isSolid(x, y, z)) return y;
  }
  return null;
}

// Where you'd like it: the spot you're aiming at (if it's ground with air
// above, and not too far), or else a few blocks in front of you.
export function wantedSpot(kind, world, player, aim, dir) {
  const p = player.position;
  if (aim && !world.isSolid(aim.x, aim.y + 1, aim.z) &&
      Math.hypot(aim.x + 0.5 - p.x, aim.z + 0.5 - p.z) < AIM_REACH) {
    return { x: aim.x, y: aim.y + 1, z: aim.z };
  }
  const distance = { wall: WALL.distance, tower: TOWER.distance, hut: HUT.distance }[kind];
  const x = Math.floor(p.x) + dir.fx * distance;
  const z = Math.floor(p.z) + dir.fz * distance;
  return { x, y: groundAt(world, x, z, Math.floor(p.y)) ?? Math.floor(p.y), z };
}

// A block at (along, side, up) from `start`, in the facing direction.
export function at(start, dir, along, side, up, id = MAIN) {
  return {
    x: start.x + dir.fx * along + dir.rx * side,
    y: start.y + up,
    z: start.z + dir.fz * along + dir.rz * side,
    id,
  };
}

// ---- Walls, towers and huts: built on a spot found by kevinSite.js ----

// The ground they cover, as [along, side] pairs, and the space they fill
// (from `bottom` to `top`, counted in blocks up from the start spot's level).
export function shapeOf(kind) {
  const columns = [];
  if (kind === 'wall') {
    const half = Math.floor(WALL.width / 2);
    for (let side = -half; side <= half; side++) columns.push([0, side]);
    return { columns, bottom: 0, top: WALL.height - 1 };
  }
  if (kind === 'tower') {
    columns.push([0, 0]);
    return { columns, bottom: 0, top: TOWER.height }; // the lamp sits at TOWER.height
  }
  // Hut: the floor replaces the top layer of ground (up = -1), the roof is at wallHeight.
  const half = Math.floor(HUT.size / 2);
  for (let along = 0; along < HUT.size; along++) {
    for (let side = -half; side <= half; side++) columns.push([along, side]);
  }
  return { columns, bottom: -1, top: HUT.wallHeight };
}

// The blocks of a wall, tower or hut standing on `start` (the middle of
// its front, at the level of the first air above the ground).
export function structure(kind, start, dir) {
  const blocks = [];

  if (kind === 'wall') {
    const half = Math.floor(WALL.width / 2);
    for (let up = 0; up < WALL.height; up++) {
      for (let side = -half; side <= half; side++) blocks.push(at(start, dir, 0, side, up));
    }
  }

  if (kind === 'tower') {
    for (let up = 0; up < TOWER.height; up++) blocks.push(at(start, dir, 0, 0, up));
    blocks.push(at(start, dir, 0, 0, TOWER.height, BLOCK.GLOW_LAMP));
  }

  if (kind === 'hut') {
    const half = Math.floor(HUT.size / 2);
    // Floor first, front to back.
    for (let along = 0; along < HUT.size; along++) {
      for (let side = -half; side <= half; side++) blocks.push(at(start, dir, along, side, -1));
    }
    // Walls, a layer at a time, all the way round. The doorway (middle of
    // the front wall, 2 high) is left open.
    for (let up = 0; up < HUT.wallHeight; up++) {
      for (let along = 0; along < HUT.size; along++) {
        for (let side = -half; side <= half; side++) {
          const edge = along === 0 || along === HUT.size - 1 || side === -half || side === half;
          const doorway = along === 0 && side === 0 && up < 2;
          if (edge && !doorway) blocks.push(at(start, dir, along, side, up));
        }
      }
    }
    // Roof, front to back.
    for (let along = 0; along < HUT.size; along++) {
      for (let side = -half; side <= half; side++) blocks.push(at(start, dir, along, side, HUT.wallHeight));
    }
  }

  return blocks;
}

// ---- Bridges and lamps: no spot to find, they go where you are ----

// The blocks, in the order he places them. Returns [] if there's nothing to
// build (e.g. no gap for a bridge).
export function blueprint(kind, { world, player }) {
  const dir = facing(player);
  const blocks = [];

  if (kind === 'bridge') {
    // Straight ahead, level with the block you're standing on.
    const p = player.position;
    const start = { x: Math.floor(p.x), y: Math.floor(p.y + 0.01) - 1, z: Math.floor(p.z) };
    for (let along = 1; along <= BRIDGE.maxLength + BRIDGE.landBefore; along++) {
      const spot = at(start, dir, along, 0, 0);
      const solid = world.isSolid(spot.x, spot.y, spot.z);
      if (blocks.length === 0) {
        if (solid && along >= BRIDGE.landBefore) break; // no gap ahead: nothing to bridge
        if (solid) continue;                            // still on land, keep looking
      } else if (solid) {
        break;                                          // reached the other side
      }
      blocks.push(spot);
      if (blocks.length >= BRIDGE.maxLength) break;
    }
  }

  if (kind === 'light') {
    // On the ground around you, on the diagonals (so not right where you walk).
    const p = player.position;
    for (let i = 0; i < LIGHT.lamps; i++) {
      const angle = Math.PI / 4 + (i * Math.PI * 2) / LIGHT.lamps;
      const x = Math.floor(p.x + Math.sin(angle) * LIGHT.radius);
      const z = Math.floor(p.z + Math.cos(angle) * LIGHT.radius);
      const y = groundAt(world, x, z, Math.floor(p.y));
      if (y !== null) blocks.push({ x, y, z, id: BLOCK.GLOW_LAMP });
    }
  }

  return blocks;
}

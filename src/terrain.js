import { createNoise2D, createNoise3D } from 'simplex-noise';
import { BLOCK } from './blocks.js';
import { makeRandom } from './random.js';

// Decides what the untouched world looks like at any spot: hills, caves,
// sinkholes and hillside entrances leading into them, and the unbreakable floor. It only uses seeded noise, so the same seed always
// gives the same world, and any chunk can be thrown away and rebuilt
// identically later. world.js (generating chunks) and the save system
// (blockAt) both use the SAME functions here, so they always agree.

// Where new players start (block column). main.js spawns here, and the
// "starter" sinkhole is placed where it can be seen from here.
export const SPAWN = { x: 8, z: 8 };

// ---- Surface settings ----
const BASE_HEIGHT = 48;  // average ground level (world is 96 tall)
const HILL_HEIGHT = 8;   // how far hills rise/fall from the average
const DIRT_DEPTH = 3;    // dirt layers under the grass

// ---- Cave settings ----
const CAVE_MIN_Y = 2;          // caves never go below this, so the floor stays thick
const CRUST = 5;               // solid layers kept under the grass (so tunnels don't poke holes)

// Tunnels: carved where two wavy 3D noise "sheets" both pass near zero.
// Where two sheets cross you get a long, winding tube.
const TUNNEL_SCALE_XZ = 0.045; // smaller = longer, straighter tunnels
const TUNNEL_SCALE_Y = 0.07;   // bigger than XZ = tunnels stay flatter, less steep
const TUNNEL_WIDTH = 0.09;     // bigger = wider tunnels

// Caverns: big open spaces, deep down. Squashed vertically so they're wide, not tall.
const CAVERN_SCALE_XZ = 0.03;
const CAVERN_SCALE_Y = 0.06;
const CAVERN_THRESHOLD = 0.62; // smaller = more / bigger caverns
const CAVERN_MAX_DEPTH = 12;   // caverns stay at least this far below the grass

// Sinkholes: big ways into the caves from the surface. The world is split into
// square cells; some cells get one sinkhole: a funnel at the top that narrows
// into a shaft and ends in a chamber deep underground (where it often meets
// tunnels). Each sinkhole stays inside its own cell, so they never overlap.
const SINKHOLE_CELL = 40;            // cell size in blocks (smaller = more sinkholes)
const SINKHOLE_CHANCE = 0.6;         // share of cells that get a sinkhole
const SINKHOLE_TOP_RADIUS = [4, 6];  // funnel width at the surface (random between)
const SINKHOLE_SHAFT_RADIUS = 2.5;   // width of the narrow part
const SINKHOLE_FUNNEL_DEPTH = 6;     // how deep the funnel narrows before becoming a shaft
const SINKHOLE_DEPTH = [22, 30];     // how far down the chamber is
const SINKHOLE_CHAMBER = { radius: 6, height: 4 }; // the room at the bottom
const SINKHOLE_WOBBLE = 1.2;         // makes the walls bumpy instead of perfectly round
const SINKHOLE_REACH = SINKHOLE_TOP_RADIUS[1] + SINKHOLE_WOBBLE + 1; // widest it can get

// Hillside entrances: smaller walk-in tunnels. The world is split into cells;
// in some cells the steepest slope gets a tunnel that starts at the bottom of
// the slope, runs flat into the hill for a few blocks, then winds downward.
const HILLSIDE_CELL = 24;            // cell size in blocks (smaller = more entrances)
const HILLSIDE_CHANCE = 0.7;         // share of cells that try to get one
const HILLSIDE_TRIES = 10;           // spots checked per cell when looking for a slope
const HILLSIDE_CHECK = 3;            // how far down-slope to look for lower ground
const HILLSIDE_MIN_DROP = 3;         // slope must drop at least this much over HILLSIDE_CHECK blocks
const HILLSIDE_RADIUS = 1.7;         // tunnel radius (about 3 blocks wide and tall)
const HILLSIDE_FLAT = 5;             // flat part at the mouth, before it starts going down
const HILLSIDE_LEGS = [[8, 0.5], [8, 0.6], [7, 0.5]]; // then: [length, how steeply it drops] per bend
const HILLSIDE_WIGGLE = 0.6;         // how much it can turn at each bend (radians)
// How many cells away a tunnel can reach from the cell it starts in (worked out
// from the lengths above, so changing them can never chop a tunnel off).
const HILLSIDE_CELL_REACH = Math.ceil(
  (HILLSIDE_CELL + HILLSIDE_CHECK + HILLSIDE_FLAT +
    HILLSIDE_LEGS.reduce((sum, [length]) => sum + length, 0) + HILLSIDE_RADIUS + 1) / HILLSIDE_CELL
);

// The starter sinkhole: one guaranteed sinkhole near spawn, placed where the
// player can see down INTO it from the spawn point (not just its edge), and
// looks down at it as steeply as possible (easier to spot than a hole seen edge-on).
const STARTER_DISTANCES = [15, 16, 17, 18, 19]; // blocks from spawn
const STARTER_DIRECTIONS = 48;                  // directions tried around spawn
const STARTER_SEE_DEPTH = 3;                    // must be able to see this far down into the hole
const EYE_HEIGHT = 1.62; // must match player.js

// Remembered grid-cell results (sinkholes, tunnels). Each is tiny; this limit
// just stops the memory growing forever on very long walks.
const CACHE_LIMIT = 50000;

export class Terrain {
  constructor(seed, worldHeight) {
    this.seed = seed;
    this.worldHeight = worldHeight;
    this.sinkholeCache = new Map(); // per grid cell: sinkholes, hillside tunnels, so each is worked out once
    const rand = makeRandom(seed);
    // The hill noise is made first so the hills keep the same shape as before.
    this.noise2D = createNoise2D(rand);
    this.tunnelA = createNoise3D(rand);
    this.tunnelB = createNoise3D(rand);
    this.cavern = createNoise3D(rand);
    this.starter = this.pickStarterSinkhole();
  }

  // Y of the grass block at column (x, z).
  height(x, z) {
    // Two layers of noise: big gentle hills + smaller bumps.
    const n =
      this.noise2D(x * 0.02, z * 0.02) * 0.75 +
      this.noise2D(x * 0.07, z * 0.07) * 0.25;
    return Math.floor(BASE_HEIGHT + n * HILL_HEIGHT);
  }

  // Everything about a column that doesn't change with height. Worked out
  // once per column when generating a chunk, instead of once per block.
  column(x, z) {
    // Sinkholes close enough to carve this column: the one in this cell, and the starter.
    const sinkholes = [];
    for (const s of [this.sinkholeFor(x, z), this.starter]) {
      if (s && Math.hypot(x + 0.5 - s.x, z + 0.5 - s.z) <= SINKHOLE_REACH) sinkholes.push(s);
    }
    // Hillside tunnels passing over/under this column.
    const nearby = this.tunnelsNearCell(Math.floor(x / HILLSIDE_CELL), Math.floor(z / HILLSIDE_CELL));
    const tunnels = nearby.filter((t) => x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ);
    return { height: this.height(x, z), sinkholes, tunnels };
  }

  // Every hillside tunnel that could reach into a cell. A tunnel can stretch into
  // nearby cells, so the cells around this one are checked too. Saved per cell.
  tunnelsNearCell(cellX, cellZ) {
    const key = `n${cellX},${cellZ}`;
    if (this.sinkholeCache.has(key)) return this.sinkholeCache.get(key);
    const list = [];
    const reach = HILLSIDE_CELL_REACH;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const t = this.hillsideTunnelFor(cellX + dx, cellZ + dz);
        if (t) list.push(t);
      }
    }
    this.sinkholeCache.set(key, list);
    return list;
  }

  // A random generator for one grid cell: same world seed + same cell = same numbers.
  cellRandom(cellX, cellZ, salt) {
    return makeRandom((this.seed ^ salt ^ Math.imul(cellX, 73856093) ^ Math.imul(cellZ, 19349663)) >>> 0);
  }

  // The hillside tunnel belonging to a cell, or null. Worked out once per cell.
  hillsideTunnelFor(cellX, cellZ) {
    const key = `h${cellX},${cellZ}`;
    if (this.sinkholeCache.has(key)) return this.sinkholeCache.get(key);
    const rand = this.cellRandom(cellX, cellZ, 0x2545f491);
    let tunnel = null;
    if (rand() < HILLSIDE_CHANCE) {
      // Look at a few random spots and keep the steepest slope.
      const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let best = null;
      for (let i = 0; i < HILLSIDE_TRIES; i++) {
        const x = cellX * HILLSIDE_CELL + Math.floor(rand() * HILLSIDE_CELL);
        const z = cellZ * HILLSIDE_CELL + Math.floor(rand() * HILLSIDE_CELL);
        const h = this.height(x, z);
        for (const [dx, dz] of DIRS) {
          const low = this.height(x + dx * HILLSIDE_CHECK, z + dz * HILLSIDE_CHECK);
          if (!best || h - low > best.drop) best = { x, z, dx, dz, low, drop: h - low };
        }
      }
      if (best && best.drop >= HILLSIDE_MIN_DROP) tunnel = this.makeHillsideTunnel(best, rand);
    }
    if (this.sinkholeCache.size > CACHE_LIMIT) this.sinkholeCache.clear();
    this.sinkholeCache.set(key, tunnel);
    return tunnel;
  }

  // Build the tunnel's path: a list of points it runs through, starting at the
  // bottom of the slope and heading uphill (into the hill), then downwards.
  makeHillsideTunnel({ x, z, dx, dz, low }, rand) {
    let px = x + dx * HILLSIDE_CHECK + 0.5;      // mouth: at the foot of the slope
    let pz = z + dz * HILLSIDE_CHECK + 0.5;
    let py = low + 1 + HILLSIDE_RADIUS - 0.5;    // tunnel floor level with the ground there
    let angle = Math.atan2(-dz, -dx);            // pointing into the hill
    const points = [[px, py, pz]];
    px += Math.cos(angle) * HILLSIDE_FLAT;
    pz += Math.sin(angle) * HILLSIDE_FLAT;
    points.push([px, py, pz]);
    for (const [length, steepness] of HILLSIDE_LEGS) {
      angle += (rand() * 2 - 1) * HILLSIDE_WIGGLE;
      px += Math.cos(angle) * length;
      pz += Math.sin(angle) * length;
      py = Math.max(CAVE_MIN_Y + HILLSIDE_RADIUS, py - length * steepness);
      points.push([px, py, pz]);
    }
    const pad = HILLSIDE_RADIUS + 1;
    return {
      points,
      minX: Math.floor(Math.min(...points.map((p) => p[0])) - pad),
      maxX: Math.ceil(Math.max(...points.map((p) => p[0])) + pad),
      minZ: Math.floor(Math.min(...points.map((p) => p[2])) - pad),
      maxZ: Math.ceil(Math.max(...points.map((p) => p[2])) + pad),
    };
  }

  // Is block (x, y, z) inside the hillside tunnel `t`? (Close enough to its path.)
  inHillsideTunnel(x, y, z, t) {
    const cx = x + 0.5;
    const cy = y + 0.5;
    const cz = z + 0.5;
    const r2 = HILLSIDE_RADIUS * HILLSIDE_RADIUS;
    for (let i = 0; i < t.points.length - 1; i++) {
      const [ax, ay, az] = t.points[i];
      const [bx, by, bz] = t.points[i + 1];
      // Closest point on the straight piece from a to b.
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const lengthSq = abx * abx + aby * aby + abz * abz;
      const k = Math.max(0, Math.min(1, ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / lengthSq));
      const ex = ax + abx * k - cx, ey = ay + aby * k - cy, ez = az + abz * k - cz;
      if (ex * ex + ey * ey + ez * ez <= r2) return true;
    }
    return false;
  }

  // Make a sinkhole centred on block column (sx, sz), sized using `rand`.
  makeSinkhole(sx, sz, rand) {
    const between = ([lo, hi]) => lo + rand() * (hi - lo);
    const top = this.height(sx, sz);
    return {
      x: sx + 0.5,
      z: sz + 0.5,
      top,                                         // ground level at the centre
      topRadius: between(SINKHOLE_TOP_RADIUS),
      bottom: Math.max(CAVE_MIN_Y + SINKHOLE_CHAMBER.height, top - Math.round(between(SINKHOLE_DEPTH))),
    };
  }

  // Choose where the starter sinkhole goes. Every direction and distance around
  // spawn is scored by how steeply the player looks DOWN at it; spots hidden
  // behind a hill are skipped. The best spot wins, and gets the widest funnel.
  pickStarterSinkhole() {
    const eyeY = this.height(SPAWN.x, SPAWN.z) + 1 + EYE_HEIGHT;
    const ex = SPAWN.x + 0.5;
    const ez = SPAWN.z + 0.5;
    let best = null;
    for (let i = 0; i < STARTER_DIRECTIONS; i++) {
      const angle = (i * Math.PI * 2) / STARTER_DIRECTIONS;
      for (const distance of STARTER_DISTANCES) {
        const sx = Math.round(SPAWN.x + Math.cos(angle) * distance);
        const sz = Math.round(SPAWN.z + Math.sin(angle) * distance);
        const ground = this.height(sx, sz) + 1; // top surface of the ground there
        const lookDown = (eyeY - ground) / distance; // bigger = looking more steeply down
        if (best && lookDown <= best.lookDown) continue;
        // Can you see a few blocks down into the middle of the hole? The hole's
        // own opening doesn't block the view (it will be dug out).
        const opening = { x: sx + 0.5, z: sz + 0.5, radius: SINKHOLE_TOP_RADIUS[1] - 1 };
        if (!this.canSeeFrom(ex, eyeY, ez, sx + 0.5, ground - STARTER_SEE_DEPTH, sz + 0.5, opening)) continue;
        best = { sx, sz, lookDown };
      }
    }
    best ??= { sx: SPAWN.x + STARTER_DISTANCES[0], sz: SPAWN.z }; // (never expected)
    const rand = makeRandom((this.seed ^ 0x5eed) >>> 0);
    const sinkhole = this.makeSinkhole(best.sx, best.sz, rand);
    sinkhole.topRadius = SINKHOLE_TOP_RADIUS[1]; // widest funnel, easiest to spot
    return sinkhole;
  }

  // Is the straight line between two points clear of hills (untouched terrain)?
  // Ground inside `opening` (a circle: x, z, radius) is ignored, if given.
  canSeeFrom(ax, ay, az, bx, by, bz, opening = null) {
    const steps = 80;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      if (opening && Math.hypot(x - opening.x, z - opening.z) < opening.radius) continue;
      if (this.height(Math.floor(x), Math.floor(z)) + 1 > y) return false;
    }
    return true;
  }

  // The sinkhole in the cell containing (x, z), or null if that cell has none.
  sinkholeFor(x, z) {
    const cellX = Math.floor(x / SINKHOLE_CELL);
    const cellZ = Math.floor(z / SINKHOLE_CELL);
    const key = `${cellX},${cellZ}`;
    if (this.sinkholeCache.has(key)) return this.sinkholeCache.get(key);

    // A random generator seeded by the world seed AND the cell, so every cell
    // always gets the same answer.
    const rand = this.cellRandom(cellX, cellZ, 0);
    let sinkhole = null;
    if (rand() < SINKHOLE_CHANCE) {
      const margin = SINKHOLE_REACH + SINKHOLE_CHAMBER.radius; // keep it inside the cell
      const sx = cellX * SINKHOLE_CELL + Math.floor(margin + rand() * (SINKHOLE_CELL - margin * 2));
      const sz = cellZ * SINKHOLE_CELL + Math.floor(margin + rand() * (SINKHOLE_CELL - margin * 2));
      // Skip it if it would run into the starter sinkhole.
      const tooClose = this.starter &&
        Math.hypot(sx + 0.5 - this.starter.x, sz + 0.5 - this.starter.z) < (SINKHOLE_REACH + SINKHOLE_CHAMBER.radius) * 2;
      if (!tooClose) sinkhole = this.makeSinkhole(sx, sz, rand);
    }
    if (this.sinkholeCache.size > CACHE_LIMIT) this.sinkholeCache.clear();
    this.sinkholeCache.set(key, sinkhole);
    return sinkhole;
  }

  // Is (x, y, z) inside the sinkhole `s`?
  inSinkhole(x, y, z, s) {
    const dx = x + 0.5 - s.x;
    const dz = z + 0.5 - s.z;
    const across = Math.hypot(dx, dz);
    const wobble = this.cavern(x * 0.15, y * 0.15, z * 0.15) * SINKHOLE_WOBBLE;

    // The chamber at the bottom: a squashed ball.
    const { radius, height } = SINKHOLE_CHAMBER;
    const up = (y - s.bottom) / height;
    if ((across / (radius + wobble)) ** 2 + up * up <= 1) return true;

    // The funnel and shaft, from the chamber up to the surface.
    if (y < s.bottom) return false;
    const depth = s.top - y; // blocks below the ground at the centre (negative = above it)
    const funnel = Math.min(1, Math.max(0, depth / SINKHOLE_FUNNEL_DEPTH));
    const r = s.topRadius + (SINKHOLE_SHAFT_RADIUS - s.topRadius) * funnel;
    return across <= r + wobble;
  }

  // Is (x, y, z) hollowed out by a cave?
  isCave(x, y, z, col) {
    if (y < CAVE_MIN_Y) return false;
    for (const s of col.sinkholes) {
      if (this.inSinkhole(x, y, z, s)) return true;
    }
    for (const t of col.tunnels) {
      if (this.inHillsideTunnel(x, y, z, t)) return true;
    }
    // Keep a solid crust under the grass, so tunnels don't poke holes in the surface.
    if (y > col.height - CRUST) return false;

    const sx = x * TUNNEL_SCALE_XZ;
    const sy = y * TUNNEL_SCALE_Y;
    const sz = z * TUNNEL_SCALE_XZ;
    if (Math.abs(this.tunnelA(sx, sy, sz)) < TUNNEL_WIDTH &&
        Math.abs(this.tunnelB(sx, sy, sz)) < TUNNEL_WIDTH) {
      return true;
    }

    if (y < col.height - CAVERN_MAX_DEPTH) {
      return this.cavern(x * CAVERN_SCALE_XZ, y * CAVERN_SCALE_Y, z * CAVERN_SCALE_XZ) > CAVERN_THRESHOLD;
    }
    return false;
  }

  // The original block at height y in a column (see column()).
  blockInColumn(x, y, z, col) {
    if (y === 0) return BLOCK.CORE;               // unbreakable floor
    if (y > col.height) return BLOCK.AIR;
    if (this.isCave(x, y, z, col)) return BLOCK.AIR;
    if (y === col.height) return BLOCK.GRASS;
    if (y >= col.height - DIRT_DEPTH) return BLOCK.DIRT;
    return BLOCK.STONE;
  }

  // The original block at (x, y, z), before anyone changed it.
  // Used by the save system to tell real changes from "put it back how it was".
  blockAt(x, y, z) {
    if (y < 0 || y >= this.worldHeight) return BLOCK.AIR;
    return this.blockInColumn(x, y, z, this.column(x, z));
  }
}

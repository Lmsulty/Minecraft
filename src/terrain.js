import { createNoise2D, createNoise3D } from 'simplex-noise';
import { BLOCK, BLOCK_TYPES } from './blocks.js';
import { makeRandom } from './random.js';
import { treeAtColumn, treeBlockAt } from './trees.js';
import { THEME } from './theme.js';

// Decides what the untouched world looks like at any spot: hills, caves,
// sinkholes and hillside entrances leading into them, sand in low ground, trees, and the unbreakable floor.
// (Plus, on planets that switch them on: glowing cracks, crevasses, crystal
// clusters and frozen clouds.) It only uses seeded noise, so the same seed always
// gives the same world, and any chunk can be thrown away and rebuilt
// identically later. world.js (generating chunks) and the save system
// (blockAt) both use the SAME functions here, so they always agree.

// Where new players start (block column). main.js spawns here, and the
// "starter" sinkhole is placed where it can be seen from here.
export const SPAWN = { x: 8, z: 8 };

// ---- Surface, sand and sea settings ----
// These live in theme.js (THEME.terrain), because each planet has its own.
const T = THEME.terrain;
const SAND = T.sand;
const SEA_LEVEL = T.seaLevel; // 0 = no sea
const SEA_SLOPE = 4;          // the sea gets 1 block deeper for every this many blocks the ground drops
const CRACKS = T.cracks;      // glowing cracks across the ground (null = none)
const CREVASSES = T.crevasses; // deep narrow cracks in the ground (null = none)
const CRYSTALS = T.crystals;   // clusters of glowing crystal sticking up (null = none)
const CLOUDS = T.frozenClouds; // shelves of ice floating high up (null = none)

// The blocks the ground is made of on this planet (THEME.terrain.blocks).
function blockIdByName(name) {
  const id = BLOCK_TYPES.findIndex((type) => type.name === name);
  if (id === -1) throw new Error(`theme.js terrain: no block called "${name}"`);
  return id;
}
const SURFACE = blockIdByName(T.blocks.surface);
const UNDER_SURFACE = blockIdByName(T.blocks.underSurface);
const ROCK = blockIdByName(T.blocks.rock);
const LOWLAND = blockIdByName(SAND.block); // the block in the low patches (sand at home)

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
    // Sand gets its own random numbers, so adding it never changed the hills or caves.
    this.sandNoise = createNoise2D(makeRandom((seed ^ 0x5a4d5a4d) >>> 0));
    // So do the cracks (only planets with cracks use them).
    this.crackNoise = createNoise2D(makeRandom((seed ^ 0x3c6ef372) >>> 0));
    // And the ice planet's crevasses and frozen clouds.
    this.crevasseNoise = createNoise2D(makeRandom((seed ^ 0x1b873593) >>> 0));
    this.cloudNoise = createNoise2D(makeRandom((seed ^ 0x6b43a9b5) >>> 0));
    // No caves on this planet = no starter sinkhole either.
    this.starter = T.caves ? this.pickStarterSinkhole() : null;
  }

  // Y of the grass block at column (x, z).
  height(x, z) {
    // Two layers of noise: big gentle hills + smaller bumps.
    const n =
      this.noise2D(x * 0.02, z * 0.02) * 0.75 +
      this.noise2D(x * 0.07, z * 0.07) * 0.25;
    const h = Math.floor(T.baseHeight + n * T.hillHeight);
    if (h >= SEA_LEVEL) return h; // dry land (always, on planets with no sea)
    // Under the sea: raise deep ground so the sea stays shallow. Near the
    // shore it's 1 block deep, then slowly deeper, up to maxSeaDepth.
    const drop = SEA_LEVEL - h;
    return SEA_LEVEL - Math.min(T.maxSeaDepth, Math.ceil(drop / SEA_SLOPE));
  }

  // The nearest dry land to column (x, z): somewhere to stand when you arrive.
  // Searches in growing squares. On planets with no sea, that's (x, z) itself.
  findLand(x, z) {
    if (!SEA_LEVEL) return { x, z };
    const isDry = (px, pz) => this.height(px, pz) > SEA_LEVEL; // at least 1 block above the water
    for (let r = 0; r <= 600; r += 2) {
      for (let d = -r; d <= r; d += 2) {
        for (const [px, pz] of [[x + d, z - r], [x + d, z + r], [x - r, z + d], [x + r, z + d]]) {
          if (isDry(px, pz)) return { x: px, z: pz };
        }
      }
    }
    return { x, z }; // (never expected: no land anywhere nearby)
  }

  // Everything about a column that doesn't change with height. Worked out
  // once per column when generating a chunk, instead of once per block.
  column(x, z) {
    const col = this.groundColumn(x, z);
    col.tree = treeAtColumn(this, x, z); // tree trunk/leaves above this column, or null
    // Highest block this column can have (used to know how far up to fill).
    // Water reaches up to sea level, so fill at least that high.
    col.top = Math.max(col.tree ? col.tree.top : col.height, col.height + col.crystal, SEA_LEVEL, col.cloud ? col.cloud.top : 0);
    return col;
  }

  // Like column(), but without trees: just the ground and the caves in it
  // (and on the ice planet: crevasses, crystals and frozen clouds).
  groundColumn(x, z) {
    const height = this.height(x, z);
    const crack = this.isCracked(x, z);
    const crevasse = this.crevasseDepth(x, z);
    const crystal = crevasse ? 0 : this.crystalHeight(x, z);
    const cloud = this.cloudAt(x, z, height);
    if (!T.caves) return { height, sinkholes: [], tunnels: [], sand: this.isSandy(x, z, height), crack, crevasse, crystal, cloud };
    // Sinkholes close enough to carve this column: the one in this cell, and the starter.
    const sinkholes = [];
    for (const s of [this.sinkholeFor(x, z), this.starter]) {
      if (s && Math.hypot(x + 0.5 - s.x, z + 0.5 - s.z) <= SINKHOLE_REACH) sinkholes.push(s);
    }
    // Hillside tunnels passing over/under this column.
    const nearby = this.tunnelsNearCell(Math.floor(x / HILLSIDE_CELL), Math.floor(z / HILLSIDE_CELL));
    const tunnels = nearby.filter((t) => x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ);
    return { height, sinkholes, tunnels, sand: this.isSandy(x, z, height), crack, crevasse, crystal, cloud };
  }

  // ---- Ice planet features (see THEME.terrain.crevasses / crystals / frozenClouds) ----

  // How many blocks deep a crevasse cuts into column (x, z) (0 = none).
  // Like the cracks, crevasses follow the lines where a wavy pattern passes
  // through zero. They're deepest in the middle of the line and shallower
  // towards its edges, so each one is a narrow V. A second, slower pattern
  // makes them come and go, so they're separate cracks, not one big network.
  crevasseDepth(x, z) {
    if (!CREVASSES) return 0;
    const across = Math.abs(this.crevasseNoise(x * CREVASSES.scale, z * CREVASSES.scale)) / CREVASSES.width;
    if (across >= 1) return 0;
    const along = this.crevasseNoise(x * CREVASSES.scale * 0.4 + 300, z * CREVASSES.scale * 0.4 - 300);
    if (along < CREVASSES.gaps) return 0;
    const strength = Math.min(1, (along - CREVASSES.gaps) / 0.3); // fades in at each end
    return Math.round(CREVASSES.depth * strength * (1 - across * across));
  }

  // A crystal cluster in a grid cell, or null. Worked out once per cell.
  crystalClusterFor(cellX, cellZ) {
    return this.cached(`c${cellX},${cellZ}`, () => {
      const rand = this.cellRandom(cellX, cellZ, 0x7f4a7c15);
      if (rand() >= CRYSTALS.chance) return null;
      const margin = CRYSTALS.radius + 1; // stays inside its cell
      const span = CRYSTALS.cell - margin * 2;
      return {
        x: cellX * CRYSTALS.cell + margin + rand() * span,
        z: cellZ * CRYSTALS.cell + margin + rand() * span,
        tallest: CRYSTALS.height[0] + rand() * (CRYSTALS.height[1] - CRYSTALS.height[0]),
      };
    });
  }

  // How many blocks of crystal stick up out of column (x, z) (0 = none).
  // Shards in a cluster: tallest in the middle, some columns left empty.
  crystalHeight(x, z) {
    if (!CRYSTALS) return 0;
    const c = this.crystalClusterFor(Math.floor(x / CRYSTALS.cell), Math.floor(z / CRYSTALS.cell));
    if (!c) return 0;
    const d = Math.hypot(x + 0.5 - c.x, z + 0.5 - c.z);
    if (d > CRYSTALS.radius) return 0;
    const rand = this.cellRandom(x, z, 0x2f6b9d31); // this column's own numbers
    if (d > 0.8 && rand() < CRYSTALS.gaps) return 0;
    return Math.max(1, Math.round(c.tallest * (1 - d / (CRYSTALS.radius + 0.5)) + rand() * 1.5));
  }

  // The frozen cloud shelf in a grid cell, or null. Worked out once per cell.
  // A flat oval of ice (a little wobbly round the edge) floating `above`
  // blocks over the ground at its middle.
  cloudShelfFor(cellX, cellZ) {
    return this.cached(`f${cellX},${cellZ}`, () => {
      const rand = this.cellRandom(cellX, cellZ, 0x4cf5ad43);
      if (rand() >= CLOUDS.chance) return null;
      const between = ([lo, hi]) => lo + rand() * (hi - lo);
      const x = (cellX + 0.2 + rand() * 0.6) * CLOUDS.cell;
      const z = (cellZ + 0.2 + rand() * 0.6) * CLOUDS.cell;
      const top = Math.min(this.worldHeight - 3,
        this.height(Math.floor(x), Math.floor(z)) + Math.round(between(CLOUDS.above)));
      return { x, z, top, rx: between(CLOUDS.radius), rz: between(CLOUDS.radius), turn: rand() * Math.PI };
    });
  }

  // The frozen cloud over column (x, z): { bottom, top } (block heights,
  // both filled), or null. Its top is flat (to walk on); its bottom is
  // lumpy, thickest in the middle, with icicles hanging down here and there.
  // `ground` = the ground height there: clouds always stay well above it.
  cloudAt(x, z, ground) {
    if (!CLOUDS) return null;
    const cellX = Math.floor(x / CLOUDS.cell);
    const cellZ = Math.floor(z / CLOUDS.cell);
    let best = null;
    // A shelf can stretch over the edge of its cell, so check the cells around too.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const s = this.cloudShelfFor(cellX + dx, cellZ + dz);
        if (!s) continue;
        const px = x + 0.5 - s.x;
        const pz = z + 0.5 - s.z;
        if (Math.abs(px) > CLOUDS.radius[1] * 1.5 || Math.abs(pz) > CLOUDS.radius[1] * 1.5) continue;
        // Turned oval, with a wobbly edge.
        const u = (px * Math.cos(s.turn) + pz * Math.sin(s.turn)) / s.rx;
        const v = (pz * Math.cos(s.turn) - px * Math.sin(s.turn)) / s.rz;
        const edge = 1 + CLOUDS.wobble * this.cloudNoise(x * 0.09, z * 0.09);
        const inside = 1 - (u * u + v * v) / edge; // 1 = the middle, 0 = the edge
        if (inside <= 0 || (best && inside <= best.inside)) continue;
        best = { inside, top: s.top };
      }
    }
    if (!best) return null;
    const lumps = (this.cloudNoise(x * 0.12 + 50, z * 0.12 - 50) + 1) / 2; // 0..1
    let thick = 1 + Math.floor(Math.sqrt(best.inside) * CLOUDS.thickness + lumps * CLOUDS.lumps * best.inside);
    const rand = this.cellRandom(x, z, 0x1d2e3f4b); // this column's own numbers
    if (best.inside > 0.15 && rand() < CLOUDS.icicles) {
      thick += Math.round(CLOUDS.icicleLength[0] + rand() * (CLOUDS.icicleLength[1] - CLOUDS.icicleLength[0]));
    }
    const bottom = Math.max(best.top - thick + 1, ground + CLOUDS.minClearance);
    return bottom <= best.top ? { bottom, top: best.top } : null;
  }

  // Does a glowing crack run through column (x, z)? (see THEME.terrain.cracks)
  // Cracks follow the lines where a smooth wavy pattern passes through zero,
  // so they wind across the ground and join up into a network.
  isCracked(x, z) {
    if (!CRACKS) return false;
    return Math.abs(this.crackNoise(x * CRACKS.scale, z * CRACKS.scale)) < CRACKS.width;
  }

  // Is the ground at column (x, z) sand instead of grass? (see SAND settings)
  isSandy(x, z, height) {
    if (height > SAND.maxHeight) return false;
    const blobs = this.sandNoise(x * SAND.patchScale, z * SAND.patchScale);
    return blobs + (SAND.maxHeight - height) * SAND.lowlandBonus > SAND.threshold;
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

  // Remember the result of make() under `key`, so it's only worked out once.
  cached(key, make) {
    if (this.sinkholeCache.has(key)) return this.sinkholeCache.get(key);
    const value = make();
    if (this.sinkholeCache.size > CACHE_LIMIT) this.sinkholeCache.clear();
    this.sinkholeCache.set(key, value);
    return value;
  }

  // Can a tree grow with its trunk at (x, z)? Not near spawn, not blocking the
  // view of the starter sinkhole, not in or next to a sinkhole, and not over
  // any cave opening (every column under the canopy must have its ground intact).
  canGrowTree(x, z, radius) {
    const keepClear = radius + 2;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < keepClear + 1) return false;
    if (this.starter &&
        distanceToLine(x + 0.5, z + 0.5, SPAWN.x + 0.5, SPAWN.z + 0.5, this.starter.x, this.starter.z) < keepClear) {
      return false;
    }
    // Sinkholes: the starter, and any in this or the neighbouring sinkhole cells.
    const nearbySinkholes = T.caves ? [this.starter] : [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (T.caves) nearbySinkholes.push(this.sinkholeFor(x + dx * SINKHOLE_CELL, z + dz * SINKHOLE_CELL));
      }
    }
    for (const s of nearbySinkholes) {
      if (s && Math.hypot(x + 0.5 - s.x, z + 0.5 - s.z) < SINKHOLE_REACH + keepClear) return false;
    }
    // Ground under the trunk must be grass, and nothing under the canopy dug out.
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const col = this.groundColumn(x + dx, z + dz);
        const ground = this.blockInColumn(x + dx, col.height, z + dz, col);
        if (dx === 0 && dz === 0 ? ground !== SURFACE : ground === BLOCK.AIR) return false;
      }
    }
    return true;
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
    if (!T.caves || y < CAVE_MIN_Y) return false;
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
    if (col.cloud && y >= col.cloud.bottom && y <= col.cloud.top) return BLOCK.CLOUD_ICE; // a frozen cloud
    // Above the ground: crystal, a tree, or open air. (Trees never fill caves.)
    // Below sea level, the open space is water instead.
    if (y > col.height) {
      if (y <= col.height + col.crystal) return BLOCK.CRYSTAL_ICE;
      const tree = col.tree ? treeBlockAt(col.tree, x, y, z) : BLOCK.AIR;
      return tree === BLOCK.AIR && y <= SEA_LEVEL ? BLOCK.WATER : tree;
    }
    if (col.crevasse && y > col.height - col.crevasse) return BLOCK.AIR;
    if (this.isCave(x, y, z, col)) return BLOCK.AIR;
    if (col.crack && y > col.height - CRACKS.depth) return BLOCK.EMBER_CRACK;
    if (col.sand) return y > col.height - SAND.depth ? LOWLAND : ROCK;
    if (y === col.height) return SURFACE;
    if (y >= col.height - T.dirtDepth) return UNDER_SURFACE;
    return ROCK;
  }

  // The original block at (x, y, z), before anyone changed it.
  // Used by the save system to tell real changes from "put it back how it was".
  blockAt(x, y, z) {
    if (y < 0 || y >= this.worldHeight) return BLOCK.AIR;
    return this.blockInColumn(x, y, z, this.column(x, z));
  }
}

// Shortest distance from point (px, pz) to the straight line from (ax, az) to (bx, bz).
function distanceToLine(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(ax + abx * t - px, az + abz * t - pz);
}

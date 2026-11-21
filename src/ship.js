import * as THREE from 'three';
import { THEME } from './theme.js';
import { BLOCK } from './blocks.js';
import { CUBE, MATERIAL, GLOW_MATERIAL } from './mobModel.js';
import { CHUNK_SIZE } from './world.js';

// ==========================================================
//  THE SPACESHIP: a chunky old cargo hauler parked near where you start,
//  on every planet. (Boarding it and picking a planet comes in step 4b.)
//
//  It's built from boxes, like Kevin and the creatures, so it follows the
//  curved view and fades into the haze like everything else. Colours are in
//  theme.js (THEME.ship).
//
//  It can't be broken: the space it takes up is filled with invisible
//  "ship hull" blocks (blocks.js, never drawn or saved). Those make it solid
//  for you, Kevin and creatures, and stop anything being built or dug there.
// ==========================================================

// ---- The ship's shape ----
// Ship coordinates, in blocks: x across (+x = the side with the door and
// ramp), y up from the ground, z along it (-z = the nose, +z = the engines).
//   at:    the middle of the box
//   size:  [width, height, length]
//   color: a colour name from THEME.ship
//   glow:  true = always fully bright, so it shows at night
//   tilt:  [x, y, z] degrees to turn the box
//   leg:   a landing leg: it stretches down to reach the ground under it
//   foot:  a landing pad: it moves down with its leg
//   blink: the light on the tail fin (blinks on and off)
const PARTS = [
  // Three thick landing legs with pads.
  { at: [0, 0.65, -2.4], size: [0.35, 1.3, 0.35], color: 'legs', leg: true },
  { at: [-1.6, 0.65, 2.2], size: [0.35, 1.3, 0.35], color: 'legs', leg: true },
  { at: [1.6, 0.65, 2.2], size: [0.35, 1.3, 0.35], color: 'legs', leg: true },
  { at: [0, 0.07, -2.4], size: [0.8, 0.14, 0.8], color: 'feet', foot: true },
  { at: [-1.6, 0.07, 2.2], size: [0.8, 0.14, 0.8], color: 'feet', foot: true },
  { at: [1.6, 0.07, 2.2], size: [0.8, 0.14, 0.8], color: 'feet', foot: true },

  // Body: belly, main hull, a hump on the roof, the cockpit and a stubby nose.
  { at: [0, 1.25, 0.5], size: [3.6, 0.3, 5.6], color: 'hullDark' },
  { at: [0, 2.15, 0.6], size: [4.2, 1.6, 5.0], color: 'hull' },
  { at: [0, 3.15, 1.0], size: [2.4, 0.4, 3.0], color: 'hull' },
  { at: [0, 2.05, -2.6], size: [3.4, 1.3, 1.4], color: 'hull' },
  { at: [0, 1.85, -3.65], size: [2.6, 0.9, 0.7], color: 'hull' },

  // Glowing windows: a band round the cockpit, the windscreen, and a slit in the nose.
  { at: [0, 2.45, -2.65], size: [3.5, 0.4, 1.0], color: 'window', glow: true },
  { at: [0, 2.5, -3.32], size: [2.8, 0.3, 0.06], color: 'window', glow: true },
  { at: [0, 2.05, -4.02], size: [1.8, 0.25, 0.06], color: 'window', glow: true },

  // Wear and tear: faded stripes, a replacement panel that doesn't match, rust.
  { at: [2.11, 2.7, 0.5], size: [0.06, 0.2, 4.6], color: 'stripe' },
  { at: [-2.11, 2.7, 0.5], size: [0.06, 0.2, 4.6], color: 'stripe' },
  { at: [-2.11, 2.0, -0.4], size: [0.06, 0.9, 1.4], color: 'patch' },
  { at: [-2.12, 1.7, 1.6], size: [0.06, 0.4, 0.8], color: 'rust' },
  { at: [2.12, 1.6, 2.4], size: [0.06, 0.3, 0.5], color: 'rust' },
  { at: [0.6, 3.36, 0.2], size: [0.7, 0.04, 0.5], color: 'rust' },

  // Two fat engine pods, scorched at the back, with glowing nozzles.
  { at: [-2.0, 1.95, 2.7], size: [1.3, 1.3, 2.4], color: 'hullDark' },
  { at: [2.0, 1.95, 2.7], size: [1.3, 1.3, 2.4], color: 'hullDark' },
  { at: [-2.0, 1.95, 3.6], size: [1.34, 1.34, 0.6], color: 'scorch' },
  { at: [2.0, 1.95, 3.6], size: [1.34, 1.34, 0.6], color: 'scorch' },
  { at: [-2.0, 1.95, 4.05], size: [1.0, 1.0, 0.3], color: 'metal' },
  { at: [2.0, 1.95, 4.05], size: [1.0, 1.0, 0.3], color: 'metal' },
  { at: [-2.0, 1.95, 4.21], size: [0.7, 0.7, 0.04], color: 'engine', glow: true },
  { at: [2.0, 1.95, 4.21], size: [0.7, 0.7, 0.04], color: 'engine', glow: true },
  // Glowing bands round the outside of each engine, so they show from the side too.
  { at: [-2.66, 1.95, 3.75], size: [0.04, 0.7, 0.15], color: 'engine', glow: true },
  { at: [2.66, 1.95, 3.75], size: [0.04, 0.7, 0.15], color: 'engine', glow: true },

  // Running lights along both sides of the belly, so the ship is easy to spot at night.
  { at: [-1.82, 1.2, 0.8], size: [0.06, 0.1, 3.4], color: 'light', glow: true },
  { at: [1.82, 1.2, 0.8], size: [0.06, 0.1, 3.4], color: 'light', glow: true },

  // Tail fin with a blinking light, and a bent antenna dish on the roof.
  { at: [0, 3.65, 2.9], size: [0.25, 1.2, 1.4], color: 'hull' },
  { at: [0, 4.35, 3.3], size: [0.25, 0.2, 0.25], color: 'beacon', glow: true, blink: true },
  { at: [-0.8, 3.6, -0.2], size: [0.12, 0.6, 0.12], color: 'metal' },
  { at: [-0.85, 3.95, -0.2], size: [0.8, 0.1, 0.8], color: 'metal', tilt: [25, 0, -15] },

  // The door on the right side, a ramp down to the ground, and two door lights.
  { at: [2.12, 1.9, -0.6], size: [0.06, 1.1, 1.2], color: 'door' },
  { at: [2.85, 0.73, -0.6], size: [1.95, 0.12, 1.2], color: 'metal', tilt: [0, 0, -40] },
  { at: [2.15, 2.55, -1.35], size: [0.1, 0.12, 0.12], color: 'light', glow: true },
  { at: [2.15, 2.55, 0.15], size: [0.1, 0.12, 0.12], color: 'light', glow: true },
];

// Where you stand when you get off: just past the foot of the ramp (ship coordinates).
const RAMP_FOOT = new THREE.Vector3(4.4, 0, -0.6);

// ---- Where the ship lands ----
const SITE_DISTANCES = [5, 6, 7, 8, 9, 10];  // blocks from where you start
const SITE_DIRECTIONS = 24;                    // directions tried around it
const MAX_BUMPINESS = 2;                       // ground under it may rise and fall this much at most
const BLINK_SECONDS = 1.2;                     // the tail light: one blink per this many seconds

// The box for one part, placed in the world: ship position + facing, then
// the part's own spot, tilt and size. `drop` stretches a leg further down.
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
function partMatrix(part, origin, turns, drop = 0) {
  const at = new THREE.Vector3(...part.at);
  const size = new THREE.Vector3(...part.size);
  if (part.leg) { at.y -= drop / 2; size.y += drop; }
  if (part.foot) at.y -= drop;
  const tilt = (part.tilt ?? [0, 0, 0]).map(THREE.MathUtils.degToRad);
  scratchQuaternion.setFromEuler(scratchEuler.set(tilt[0], tilt[1], tilt[2]));
  const own = new THREE.Matrix4().compose(at, scratchQuaternion, size);
  const ship = new THREE.Matrix4().makeRotationY(turns * Math.PI / 2).setPosition(origin);
  return ship.multiply(own);
}

// The block cells a box covers (shrunk a hair, so a box that only touches a
// block's side doesn't claim it).
const CORNERS = [];
for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) CORNERS.push(new THREE.Vector3(x, y, z));
function cellsOf(matrix, out) {
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (const c of CORNERS) box.expandByPoint(corner.copy(c).applyMatrix4(matrix));
  for (let x = Math.floor(box.min.x + 0.02); x <= Math.floor(box.max.x - 0.02); x++) {
    for (let y = Math.floor(box.min.y + 0.02); y <= Math.floor(box.max.y - 0.02); y++) {
      for (let z = Math.floor(box.min.z + 0.02); z <= Math.floor(box.max.z - 0.02); z++) out.set(`${x},${y},${z}`, { x, y, z });
    }
  }
  return out;
}

// Turn ship coordinates into a world block column (x, z).
function toWorldColumn(point, origin, turns) {
  const p = point.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(turns * Math.PI / 2)).add(origin);
  return { x: Math.floor(p.x), z: Math.floor(p.z) };
}

// Pick the ship's landing spot near block column `near` (where you start).
// It must be dry ground (an island on the water world), with no trees, no
// cave holes and nothing you've built. Flat ground wins; then about 7 blocks
// away, with the ramp facing you. Only uses the terrain and the save, so it
// can be worked out before any land is loaded, and it's the same every time
// (unless you build on the spot: then it lands somewhere else next time).
export function chooseShipSite(terrain, editStore, near) {
  const seaLevel = THEME.terrain.seaLevel;

  // Columns you've changed anything in, near the start.
  const edited = new Set();
  const ncx = Math.floor(near.x / CHUNK_SIZE);
  const ncz = Math.floor(near.z / CHUNK_SIZE);
  for (let cx = ncx - 2; cx <= ncx + 2; cx++) {
    for (let cz = ncz - 2; cz <= ncz + 2; cz++) {
      for (const pos of editStore.forChunk(`${cx},${cz}`)?.keys() ?? []) {
        const [lx, , lz] = pos.split(',').map(Number);
        edited.add(`${cx * CHUNK_SIZE + lx},${cz * CHUNK_SIZE + lz}`);
      }
    }
  }

  // Ground height at a column, or null if the ship can't stand there. Remembered.
  const groundCache = new Map();
  const ground = (x, z) => {
    const key = `${x},${z}`;
    if (groundCache.has(key)) return groundCache.get(key);
    const col = terrain.column(x, z);
    const top = terrain.blockInColumn(x, col.height, z, col);
    const ok = (!seaLevel || col.height > seaLevel) && // dry
      top !== BLOCK.AIR && top !== BLOCK.WATER &&      // not a cave hole
      !col.tree && !edited.has(key);
    const result = ok ? col.height : null;
    groundCache.set(key, result);
    return result;
  };

  // The ship's columns for each way it can face, relative to its position.
  const footprints = [0, 1, 2, 3].map((turns) => {
    const cells = new Map();
    for (const part of PARTS) cellsOf(partMatrix(part, new THREE.Vector3(), turns), cells);
    const columns = new Map();
    for (const { x, z } of cells.values()) columns.set(`${x},${z}`, { x, z });
    return [...columns.values()];
  });

  let best = null;
  for (const distance of SITE_DISTANCES) {
    for (let i = 0; i < SITE_DIRECTIONS; i++) {
      const angle = (i / SITE_DIRECTIONS) * Math.PI * 2;
      const ox = Math.round(near.x + Math.cos(angle) * distance);
      const oz = Math.round(near.z + Math.sin(angle) * distance);
      for (let turns = 0; turns < 4; turns++) {
        let low = Infinity;
        let high = -Infinity;
        let ok = true;
        for (const c of footprints[turns]) {
          const h = ground(ox + c.x, oz + c.z);
          if (h === null) { ok = false; break; }
          low = Math.min(low, h);
          high = Math.max(high, h);
        }
        if (!ok || high - low > MAX_BUMPINESS) continue;
        // Somewhere to stand at the foot of the ramp.
        const origin = new THREE.Vector3(ox, 0, oz);
        const foot = toWorldColumn(RAMP_FOOT, origin, turns);
        const footH = ground(foot.x, foot.z);
        if (footH === null || Math.abs(footH - high) > 2) continue;
        // Score: flat ground first, then about 7 blocks away, ramp facing you.
        const rampDirection = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), turns * Math.PI / 2);
        const toYou = new THREE.Vector3(near.x - ox, 0, near.z - oz).normalize();
        const score = (high - low) * 10 + Math.abs(distance - 7) - rampDirection.dot(toYou) * 3;
        if (!best || score < best.score) best = { score, ox, oz, turns, high };
      }
    }
  }
  // (Never expected: no room anywhere. Land right where you start.)
  best ??= { ox: near.x + 6, oz: near.z, turns: 0, high: terrain.height(near.x + 6, near.z) };

  // The ship stands on the highest ground under it; legs reach down the rest.
  const origin = new THREE.Vector3(best.ox, best.high + 1, best.oz);
  const drops = PARTS.map((part) => {
    if (!part.leg && !part.foot) return 0;
    const column = toWorldColumn(new THREE.Vector3(...part.at), origin, best.turns);
    return best.high - terrain.height(column.x, column.z);
  });
  const matrices = PARTS.map((part, i) => partMatrix(part, origin, best.turns, drops[i]));
  const cells = new Map();
  for (const m of matrices) cellsOf(m, cells);
  return {
    origin,
    turns: best.turns,
    matrices,
    cells: [...cells.values()],
    door: toWorldColumn(RAMP_FOOT, origin, best.turns), // where you stand when you get off
  };
}

// ---- Drawing it ----
export class Ship {
  constructor(scene, site) {
    const colors = THEME.ship;
    const make = (glow) => {
      const parts = PARTS.map((part, i) => ({ part, matrix: site.matrices[i] })).filter(({ part }) => !!part.glow === glow);
      const mesh = new THREE.InstancedMesh(CUBE, glow ? GLOW_MATERIAL : MATERIAL, parts.length);
      parts.forEach(({ part, matrix }, i) => {
        if (!colors[part.color]) throw new Error(`theme.js: THEME.ship has no colour "${part.color}"`);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, new THREE.Color(colors[part.color]));
        if (part.blink) this.blink = { mesh, index: i, matrix };
      });
      mesh.frustumCulled = false; // its box would be checked unbent (curve.js); it's cheap to always draw
      scene.add(mesh);
      return mesh;
    };
    make(false);
    make(true);
    this.time = 0;
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  // Call every frame: blinks the light on the tail fin.
  update(dt) {
    this.time += dt;
    if (!this.blink) return;
    const on = (this.time % BLINK_SECONDS) < BLINK_SECONDS * 0.3;
    const { mesh, index, matrix } = this.blink;
    mesh.setMatrixAt(index, on ? matrix : this.hidden);
    mesh.instanceMatrix.needsUpdate = true;
  }
}

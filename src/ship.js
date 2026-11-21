import * as THREE from 'three';
import { THEME } from './theme.js';
import { BLOCK } from './blocks.js';
import { CUBE, MATERIAL, GLOW_MATERIAL } from './mobModel.js';
import { CHUNK_SIZE } from './world.js';

// ==========================================================
//  THE SPACESHIP: a stubby old explorer rocket standing near where you start,
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

// ---- The ship's shape: a stubby explorer rocket, standing upright ----
// Ship coordinates, in blocks: y up from the ground, x and z across it
// (+x = the side with the door and ramp).
//   at:     the middle of the box
//   size:   [width (x), height (y), depth (z)]
//   color:  a colour name from THEME.ship
//   glow:   true = always fully bright, so it shows at night
//   tilt:   [x, y, z] degrees to turn the box
//   leg:    a landing leg: it stretches down to reach the ground under `ground`
//   foot:   a landing pad: it moves down with its leg (also uses `ground`)
//   ground: [x, z] where a leg or pad touches the ground
//   blink:  the light on the nose (blinks on and off)

// The body is round-ish: three overlapping boxes (a square plus a wide one
// each way) give it a twelve-sided outline. `ring` makes a band around it
// between heights y0 and y1, `grow` blocks bigger, so bands sit on the surface.
const BODY = { square: 3.6, wide: 4.4, narrow: 2.4 };
function ring(y0, y1, color, grow = 0, extra = {}) {
  const h = y1 - y0;
  const y = (y0 + y1) / 2;
  const { square, wide, narrow } = BODY;
  return [
    { at: [0, y, 0], size: [square + grow, h, square + grow], color, ...extra },
    { at: [0, y, 0], size: [wide + grow, h, narrow + grow], color, ...extra },
    { at: [0, y, 0], size: [narrow + grow, h, wide + grow], color, ...extra },
  ];
}

// Four landing legs, angled out at the corners, each with a pad.
function legs() {
  const parts = [];
  for (const degrees of [45, 135, 225, 315]) {
    const a = THREE.MathUtils.degToRad(degrees);
    const out = (r) => [r * Math.cos(a), r * -Math.sin(a)]; // r blocks out from the middle, this way
    const [fx, fz] = out(3.0);
    parts.push({ at: [out(2.4)[0], 1.15, out(2.4)[1]], size: [0.35, 2.5, 0.35], color: 'legs', leg: true,
      tilt: [0, degrees, 28], ground: [fx, fz] });
    parts.push({ at: [fx, 0.07, fz], size: [0.9, 0.14, 0.9], color: 'feet', foot: true, ground: [fx, fz] });
  }
  return parts;
}

const PARTS = [
  // The body: cream, from just above the engine to the nose.
  ...ring(1.4, 10, 'hull'),
  // Scorch marks round the bottom, a rust band above them, and a red band near the top.
  ...ring(1.4, 2.0, 'scorch', 0.04),
  ...ring(2.0, 2.5, 'rust', 0.04),
  ...ring(8.6, 9.2, 'band', 0.04),
  // A glowing window band wrapping round the upper middle.
  ...ring(6.6, 7.3, 'window', 0.06, { glow: true }),

  // The nose cone: steps getting smaller, so it reads as round. A metal tip
  // with a blinking light on top.
  { at: [0, 10.45, 0], size: [3.0, 0.9, 3.0], color: 'hull' },
  { at: [0, 10.45, 0], size: [3.6, 0.9, 2.0], color: 'hull' },
  { at: [0, 10.45, 0], size: [2.0, 0.9, 3.6], color: 'hull' },
  { at: [0, 11.3, 0], size: [2.4, 0.8, 2.4], color: 'hull' },
  { at: [0, 11.3, 0], size: [2.8, 0.8, 1.6], color: 'hull' },
  { at: [0, 11.3, 0], size: [1.6, 0.8, 2.8], color: 'hull' },
  { at: [0, 12.05, 0], size: [1.6, 0.7, 1.6], color: 'hull' },
  { at: [0, 12.05, 0], size: [1.9, 0.7, 1.0], color: 'hull' },
  { at: [0, 12.05, 0], size: [1.0, 0.7, 1.9], color: 'hull' },
  { at: [0, 12.7, 0], size: [0.9, 0.6, 0.9], color: 'hull' },
  { at: [0, 13.2, 0], size: [0.4, 0.4, 0.4], color: 'metal' },
  { at: [0, 13.52, 0], size: [0.25, 0.25, 0.25], color: 'beacon', glow: true, blink: true },

  // One round porthole lower down, above the door (a cross of two boxes in a metal rim).
  { at: [2.225, 4.8, 0], size: [0.05, 1.0, 1.0], color: 'metal' },
  { at: [2.24, 4.8, 0], size: [0.06, 0.8, 0.5], color: 'window', glow: true },
  { at: [2.24, 4.8, 0], size: [0.06, 0.5, 0.8], color: 'window', glow: true },

  // Wear and tear: a greenish replacement panel that doesn't match, and rust spots.
  { at: [0.3, 5.0, -2.23], size: [1.2, 1.5, 0.06], color: 'patch' },
  { at: [-0.7, 3.1, -2.23], size: [0.5, 0.25, 0.06], color: 'rust' },
  { at: [-2.23, 5.4, 0.5], size: [0.06, 0.3, 0.4], color: 'rust' },
  { at: [0.4, 8.0, 2.23], size: [0.4, 0.3, 0.06], color: 'rust' },
  { at: [-2.23, 3.4, -0.6], size: [0.06, 0.4, 0.3], color: 'rust' },

  // The engine: a dark stepped bell under the body, glowing orange at the bottom.
  { at: [0, 1.1, 0], size: [1.8, 0.6, 1.8], color: 'engineBell' },
  { at: [0, 0.55, 0], size: [2.4, 0.5, 2.4], color: 'engineBell' },
  { at: [0, 0.38, 0], size: [2.46, 0.14, 2.46], color: 'engine', glow: true },
  { at: [0, 0.29, 0], size: [1.7, 0.04, 1.7], color: 'engine', glow: true },

  // Two small fins on the sides.
  { at: [0, 2.9, 2.9], size: [0.25, 2.6, 1.4], color: 'band' },
  { at: [0, 2.9, -2.9], size: [0.25, 2.6, 1.4], color: 'band' },
  { at: [0, 1.25, 3.2], size: [0.25, 0.8, 0.8], color: 'band' },
  { at: [0, 1.25, -3.2], size: [0.25, 0.8, 0.8], color: 'band' },

  // Landing legs.
  ...legs(),

  // The door near the bottom, a short ramp down to the ground, and two door lights.
  { at: [2.25, 2.4, 0], size: [0.06, 1.8, 1.1], color: 'door' },
  { at: [3.12, 0.78, 0], size: [2.27, 0.12, 1.2], color: 'metal', tilt: [0, 0, -40] },
  { at: [2.27, 3.5, -0.75], size: [0.08, 0.15, 0.15], color: 'light', glow: true },
  { at: [2.27, 3.5, 0.75], size: [0.08, 0.15, 0.15], color: 'light', glow: true },
];

// Where you stand when you get off: just past the foot of the ramp (ship coordinates).
const RAMP_FOOT = new THREE.Vector3(4.8, 0, 0);

// ---- Where the ship lands ----
const SITE_DISTANCES = [7, 8, 9, 10, 11, 12]; // blocks from where you start (the base is about 8 wide)
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
// cave holes and nothing you've built. Flat ground wins; then about 9 blocks
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
        // Score: flat ground first, then about 9 blocks away, ramp facing you.
        const rampDirection = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), turns * Math.PI / 2);
        const toYou = new THREE.Vector3(near.x - ox, 0, near.z - oz).normalize();
        const score = (high - low) * 10 + Math.abs(distance - 9) - rampDirection.dot(toYou) * 3;
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
    const [gx, gz] = part.ground ?? [part.at[0], part.at[2]];
    const column = toWorldColumn(new THREE.Vector3(gx, 0, gz), origin, best.turns);
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

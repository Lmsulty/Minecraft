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
// Ship coordinates, in blocks: y up from the bottom of the rocket (the
// highest ground under it), x and z across it
// (+x = the side with the door and ramp).
//   at:     the middle of the box
//   size:   [width (x), height (y), depth (z)]
//   color:  a colour name from THEME.ship
//   glow:   true = always fully bright, so it shows at night
//   tilt:   [x, y, z] degrees to turn the box
//   ground: [x, z]: this part reaches down to the real ground there. For a
//           `beam` that's its bottom end; anything else moves down to sit on it.
//   beam:   instead of at/size/tilt, a straight bar from `from` [x, y, z] (fixed
//           on the rocket) down to the ground at `ground`, plus `lift` above it.
//           thick: [across, sideways] size; `flat` = a slab that stays level
//           sideways (the ramp). Legs and the ramp are beams, so they always
//           reach the ground, however uneven it is.
//   blink:  the light on the nose (blinks on and off)
//   ramp:      the ramp: hidden while the door is shut (cutscenes)
//   doorPanel: the shut door: only shown while the door is shut (cutscenes)

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
    const [tx, tz] = out(1.8);
    // The leg: from the bottom of the body down to the top of its pad.
    parts.push({ beam: true, from: [tx, 2.2, tz], ground: [fx, fz], lift: 0.14, thick: [0.35, 0.35], color: 'legs' });
    // The pad, sitting on the ground.
    parts.push({ at: [fx, 0.07, fz], size: [0.9, 0.14, 0.9], color: 'feet', ground: [fx, fz] });
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
  { at: [2.27, 2.4, 0], size: [0.06, 1.8, 1.1], color: 'hull', doorPanel: true }, // the door, shut (cutscenes)
  { beam: true, flat: true, ramp: true, from: [2.25, 1.45, 0], ground: [4.0, 0], lift: 0.06, thick: [0.12, 1.2], color: 'metal' },
  { at: [2.27, 3.5, -0.75], size: [0.08, 0.15, 0.15], color: 'light', glow: true },
  { at: [2.27, 3.5, 0.75], size: [0.08, 0.15, 0.15], color: 'light', glow: true },
];

// Where you stand when you get off: just past the foot of the ramp (ship coordinates).
const RAMP_FOOT = new THREE.Vector3(4.8, 0, 0);

// ---- Where the ship lands ----
const SITE_DISTANCES = [7, 8, 9, 10, 11, 12]; // blocks from where you start (the base is about 8 wide)
const SITE_DIRECTIONS = 24;                    // directions tried around it
const MAX_BUMPINESS = 2;                       // ground under it may rise and fall this much at most
const BLINK_SECONDS = 1.2;
const FLAME_TOP = 0.3;                         // the bottom of the engine nozzle, above the ground (ship coordinates)                     // the tail light: one blink per this many seconds

// The box for one part, placed in the world: ship position + facing, then
// the part's own spot, tilt and size. `drop` stretches a leg further down.
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
// `groundY` = the height of the real ground under part.ground, compared with
// the bottom of the rocket (0 = level with it, -1 = one block lower...).
function partMatrix(part, origin, turns, groundY = 0) {
  const own = part.beam ? beamMatrix(part, groundY) : boxMatrix(part, groundY);
  const ship = new THREE.Matrix4().makeRotationY(turns * Math.PI / 2).setPosition(origin);
  return ship.multiply(own);
}

// An ordinary box: at, size, tilt. Parts with `ground` move down onto it.
function boxMatrix(part, groundY) {
  const at = new THREE.Vector3(...part.at);
  if (part.ground) at.y += groundY;
  const tilt = (part.tilt ?? [0, 0, 0]).map(THREE.MathUtils.degToRad);
  scratchQuaternion.setFromEuler(scratchEuler.set(tilt[0], tilt[1], tilt[2]));
  return new THREE.Matrix4().compose(at, scratchQuaternion, new THREE.Vector3(...part.size));
}

// A beam: a bar from `from` to the ground. The box's height runs along the
// bar; its width and depth (`thick`) go across it.
function beamMatrix(part, groundY) {
  const top = new THREE.Vector3(...part.from);
  const bottom = new THREE.Vector3(part.ground[0], groundY + part.lift, part.ground[1]);
  const along = top.clone().sub(bottom);
  const length = along.length();
  along.normalize();
  // Which way is "sideways": for the ramp, level (so it's a flat slab you'd
  // walk up); for legs, any direction (they're square).
  const hint = part.flat ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(along.z, 0, -along.x).normalize();
  const across = along.clone().cross(hint).normalize();
  const sideways = across.clone().cross(along).normalize();
  const turn = new THREE.Matrix4().makeBasis(across, along, sideways);
  const middle = top.clone().add(bottom).multiplyScalar(0.5);
  return turn.setPosition(middle).multiply(new THREE.Matrix4().makeScale(part.thick[0], length, part.thick[1]));
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
  // Legs, pads and the ramp reach the real ground under them.
  const groundYs = PARTS.map((part) => {
    if (!part.ground) return 0;
    const column = toWorldColumn(new THREE.Vector3(part.ground[0], 0, part.ground[1]), origin, best.turns);
    return terrain.height(column.x, column.z) - best.high;
  });
  const matrices = PARTS.map((part, i) => partMatrix(part, origin, best.turns, groundYs[i]));
  const cells = new Map();
  for (const m of matrices) cellsOf(m, cells);
  const door = toWorldColumn(RAMP_FOOT, origin, best.turns);
  door.y = terrain.height(door.x, door.z) + 1; // standing height there
  return {
    origin,
    turns: best.turns,
    matrices,
    cells: [...cells.values()],
    door, // where you stand when you get off (and where you board)
  };
}

// ---- Drawing it ----
export class Ship {
  constructor(scene, site) {
    const colors = THEME.ship;
    this.site = site;
    // Everything is in one group, so the cutscenes (cutscene.js) can lift the
    // whole rocket: group.position.y = how far above its landing spot it is.
    this.group = new THREE.Group();
    scene.add(this.group);
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    this.ramp = [];      // ramp parts (shown while the door is open)
    this.doorPanel = []; // closed-door parts (shown while it's shut)
    this.meshes = [];
    const make = (glow) => {
      const parts = PARTS.map((part, i) => ({ part, matrix: site.matrices[i] })).filter(({ part }) => !!part.glow === glow);
      const mesh = new THREE.InstancedMesh(CUBE, glow ? GLOW_MATERIAL : MATERIAL, parts.length);
      parts.forEach(({ part, matrix }, i) => {
        if (!colors[part.color]) throw new Error(`theme.js: THEME.ship has no colour "${part.color}"`);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, new THREE.Color(colors[part.color]));
        if (part.blink) this.blink = { mesh, index: i, matrix };
        if (part.ramp) this.ramp.push({ mesh, index: i, matrix });
        if (part.doorPanel) this.doorPanel.push({ mesh, index: i, matrix });
      });
      mesh.frustumCulled = false; // its box would be checked unbent (curve.js); it's cheap to always draw
      this.group.add(mesh);
      this.meshes.push(mesh);
    };
    make(false);
    make(true);

    // The engine flame (hidden until a cutscene fires the engine). Two
    // see-through glowing boxes, one inside the other, that add their light
    // to whatever's behind them. Made now, so nothing new is set up mid-cutscene.
    const flameMaterial = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.flameOuter = new THREE.Mesh(CUBE, flameMaterial(colors.flame, 0.75));
    this.flameInner = new THREE.Mesh(CUBE, flameMaterial(colors.flameCore, 0.9));
    for (const flame of [this.flameOuter, this.flameInner]) {
      flame.frustumCulled = false;
      this.group.add(flame);
    }
    this.throttle = 0;   // 0 = engine off, 1 = full power
    this.trail = 0;      // extra flame length while flying, in blocks
    this.time = 0;

    this.setDoorOpen(true);
  }

  // Open: doorway and ramp down. Shut: a panel over the doorway, ramp tucked away.
  setDoorOpen(open) {
    for (const { mesh, index, matrix } of this.ramp) mesh.setMatrixAt(index, open ? matrix : this.hidden);
    for (const { mesh, index, matrix } of this.doorPanel) mesh.setMatrixAt(index, open ? this.hidden : matrix);
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  // How far above its landing spot the rocket is (blocks).
  setLift(height) {
    this.group.position.y = height;
  }

  // Engine power (0..1) and how long the flame trail is (blocks).
  setEngine(throttle, trail = 0) {
    this.throttle = throttle;
    this.trail = trail;
  }

  // Call every frame: blinks the nose light and flickers the flame.
  update(dt) {
    this.time += dt;
    if (this.blink) {
      const on = (this.time % BLINK_SECONDS) < BLINK_SECONDS * 0.3;
      const { mesh, index, matrix } = this.blink;
      mesh.setMatrixAt(index, on ? matrix : this.hidden);
      mesh.instanceMatrix.needsUpdate = true;
    }
    // The flame hangs under the engine nozzle, flickering.
    const { origin } = this.site;
    const power = this.throttle;
    const flicker = 1 + Math.sin(this.time * 47) * 0.08 + Math.sin(this.time * 31) * 0.06;
    const length = power > 0 ? (0.6 + power * 2.2 + this.trail) * flicker : 0;
    const width = power > 0 ? (1.2 + power * 0.8) * (2 - flicker) : 0;
    const top = origin.y + FLAME_TOP;
    this.flameOuter.scale.set(width, length, width);
    this.flameOuter.position.set(origin.x, top - length / 2, origin.z);
    this.flameInner.scale.set(width * 0.55, length * 0.7, width * 0.55);
    this.flameInner.position.set(origin.x, top - length * 0.35, origin.z);
    this.flameOuter.visible = this.flameInner.visible = power > 0;
  }
}

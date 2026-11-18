import * as THREE from 'three';
import { BLOCK, isBreakableId, dropId } from './blocks.js';
import { isPlaceableId, displayName } from './items.js';
import { THEME } from './theme.js';
import { bendMaterial, unbendPoint } from './curve.js';

// Breaking and placing blocks: finds the block under the crosshair,
// draws an outline around it, and handles mouse clicks.
// Left click also hits creatures (mobs.js), if one is closer than the block.
// Which block gets placed comes from the hotbar (hotbar.js).
// Broken blocks go into the inventory; placing a block uses one up.
// Defeated creatures' drops go straight into the inventory too.
// Items (items.js) can be held, but right click doesn't place them.

const REACH = 5; // how far away (in blocks) you can break/place

// The line of sight is checked in small steps. Smaller = more exact but slower.
const RAY_STEP = 0.05;   // blocks between checks
const REFINE_STEPS = 12; // extra checks to find exactly where the ray enters a block
const MOB_STEP = 0.1;    // blocks between checks when looking for a creature

export class Interaction {
  constructor(camera, world, player, scene, hotbar, inventory, mobs) {
    this.camera = camera;
    this.mobs = mobs;
    this.world = world;
    this.player = player;
    this.hotbar = hotbar;
    this.inventory = inventory;
    this.direction = new THREE.Vector3();
    this.drawnPoint = new THREE.Vector3(); // a point along the line of sight, as drawn
    this.flatPoint = new THREE.Vector3();  // the same point in the flat game world

    // Wireframe box drawn around the targeted block. Slightly bigger
    // than a block so the lines don't flicker against the block's faces.
    const box = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      // Bent like the blocks, so it lines up with them exactly (curve.js).
      bendMaterial(new THREE.LineBasicMaterial({ color: THEME.blockOutline }))
    );
    this.outline.visible = false;
    scene.add(this.outline);

    this.setupControls();
  }

  setupControls() {
    document.addEventListener('mousedown', (e) => {
      if (!this.player.locked) return; // ignore the "click to play" click
      if (e.button === 0) this.breakBlock();
      if (e.button === 2) this.placeBlock();
    });

    // Stop the browser's right-click menu popping up.
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  breakBlock() {
    const hit = this.raycast();
    // A creature in the way, closer than the block (or with no block in reach)?
    const mob = this.mobInSight(hit ? hit.t : REACH);
    if (mob) {
      if (this.mobs.hit(mob, this.player.position) === 'defeated') this.collectDrops(mob);
      return;
    }
    if (!hit) return;
    const blockId = this.world.getBlock(hit.x, hit.y, hit.z);
    if (!isBreakableId(blockId)) return; // e.g. the core rock floor
    if (!this.world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR)) return; // chunk not loaded
    // Collect it. If the inventory is full, the block is simply lost.
    // In creative mode you already have unlimited blocks, so nothing is collected.
    if (!this.inventory.creative) this.inventory.add(dropId(blockId));
  }

  // Put a defeated creature's drops in the inventory, and say so above the
  // hotbar ("+2 Grazer fleece"). Like breaking blocks: nothing is collected in
  // creative mode, and whatever doesn't fit in a full inventory is lost.
  collectDrops(mob) {
    if (this.inventory.creative) return;
    const got = [];
    let lost = false;
    for (const { id, count } of this.mobs.dropsFor(mob)) {
      const added = this.inventory.add(id, count);
      if (added > 0) got.push(`+${added} ${displayName(id)}`);
      if (added < count) lost = true;
    }
    if (lost) got.push('Inventory full');
    if (got.length) this.hotbar.showText(got.join('   '));
  }

  placeBlock() {
    const blockId = this.hotbar.selectedBlock;
    if (blockId === null) return;         // empty hotbar slot: nothing to place
    if (!isPlaceableId(blockId)) return;  // an item, like fleece: can't be placed
    const hit = this.raycast();
    if (!hit) return;
    // The new block goes in the space touching the face we're aiming at.
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (this.world.getBlock(x, y, z) !== BLOCK.AIR) return;
    if (this.player.overlapsBlock(x, y, z)) return; // don't trap yourself
    // Only use one up if the block really went in (and never in creative mode).
    if (this.world.setBlock(x, y, z, blockId) && !this.inventory.creative) {
      this.inventory.removeFromSlot(this.hotbar.selected, 1);
    }
  }

  // Called every frame: move the outline to whatever we're looking at.
  update() {
    const hit = this.player.locked ? this.raycast() : null;
    this.outline.visible = !!hit;
    if (hit) this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  // Find the first solid block along the line of sight, within reach, plus
  // which face we hit (nx, ny, nz points out of that face). Returns null if
  // nothing is in reach.
  //
  // The world is DRAWN curved but the blocks are really flat (curve.js). The
  // line of sight is straight in the drawn picture, so we walk along it in
  // small steps and turn each step back into flat-world coordinates. That way
  // you always hit the block you can see under the crosshair.
  raycast() {
    const origin = this.camera.position;
    const dir = this.camera.getWorldDirection(this.direction);

    let air = this.cellAt(origin, dir, 0); // the block the ray starts in
    let airT = 0;
    for (let t = RAY_STEP; t <= REACH; t += RAY_STEP) {
      const cell = this.cellAt(origin, dir, t);
      if (cell.x === air.x && cell.y === air.y && cell.z === air.z) continue;
      if (!this.world.isSolid(cell.x, cell.y, cell.z)) {
        air = cell;
        airT = t;
        continue;
      }
      // Found a solid block somewhere between airT and t. Narrow down
      // exactly where the ray crosses into it, so we know which face it hit.
      let solid = cell;
      let lo = airT;
      let hi = t;
      for (let i = 0; i < REFINE_STEPS; i++) {
        const mid = (lo + hi) / 2;
        const c = this.cellAt(origin, dir, mid);
        if (this.world.isSolid(c.x, c.y, c.z)) { solid = c; hi = mid; }
        else { air = c; lo = mid; }
      }
      return { ...solid, ...faceBetween(air, solid), t: hi }; // t = how far away it is
    }
    return null;
  }

  // The first creature along the line of sight, up to `maxT` blocks away, or
  // null. Walks along the drawn line and turns each point back into the flat
  // world, like raycast(), so it also works in the curved view.
  mobInSight(maxT) {
    const origin = this.camera.position;
    const dir = this.camera.getWorldDirection(this.direction);
    for (let t = MOB_STEP; t <= maxT; t += MOB_STEP) {
      this.drawnPoint.copy(origin).addScaledVector(dir, t);
      const mob = this.mobs.mobAt(unbendPoint(this.drawnPoint, origin.x, this.flatPoint));
      if (mob) return mob;
    }
    return null;
  }

  // The flat-world block at distance t along the (drawn) line of sight.
  cellAt(origin, dir, t) {
    this.drawnPoint.copy(origin).addScaledVector(dir, t);
    const p = unbendPoint(this.drawnPoint, origin.x, this.flatPoint);
    return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
  }
}

// Which face of `solid` the ray came through, from the air block just before it.
// Normally they differ along exactly one axis. If the ray slipped exactly
// through an edge or corner, pick one axis (up/down first, as that's most
// common when building).
function faceBetween(air, solid) {
  const dx = Math.sign(air.x - solid.x);
  const dy = Math.sign(air.y - solid.y);
  const dz = Math.sign(air.z - solid.z);
  if (dy !== 0) return { nx: 0, ny: dy, nz: 0 };
  if (dx !== 0) return { nx: dx, ny: 0, nz: 0 };
  return { nx: 0, ny: 0, nz: dz };
}

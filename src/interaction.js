import * as THREE from 'three';
import { BLOCK, isBreakableId, dropId } from './blocks.js';
import { THEME } from './theme.js';

// Breaking and placing blocks: finds the block under the crosshair,
// draws an outline around it, and handles mouse clicks.
// Which block gets placed comes from the hotbar (hotbar.js).
// Broken blocks go into the inventory; placing a block uses one up.

const REACH = 5; // how far away (in blocks) you can break/place

export class Interaction {
  constructor(camera, world, player, scene, hotbar, inventory) {
    this.camera = camera;
    this.world = world;
    this.player = player;
    this.hotbar = hotbar;
    this.inventory = inventory;
    this.direction = new THREE.Vector3();

    // Wireframe box drawn around the targeted block. Slightly bigger
    // than a block so the lines don't flicker against the block's faces.
    const box = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: THEME.blockOutline })
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
    if (!hit) return;
    const blockId = this.world.getBlock(hit.x, hit.y, hit.z);
    if (!isBreakableId(blockId)) return; // e.g. the core rock floor
    if (!this.world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR)) return; // chunk not loaded
    // Collect it. If the inventory is full, the block is simply lost.
    this.inventory.add(dropId(blockId));
  }

  placeBlock() {
    const blockId = this.hotbar.selectedBlock;
    if (blockId === null) return; // empty hotbar slot: nothing to place
    const hit = this.raycast();
    if (!hit) return;
    // The new block goes in the space touching the face we're aiming at.
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (this.world.getBlock(x, y, z) !== BLOCK.AIR) return;
    if (this.player.overlapsBlock(x, y, z)) return; // don't trap yourself
    // Only use one up if the block really went in.
    if (this.world.setBlock(x, y, z, blockId)) {
      this.inventory.removeFromSlot(this.hotbar.selected, 1);
    }
  }

  // Called every frame: move the outline to whatever we're looking at.
  update() {
    const hit = this.player.locked ? this.raycast() : null;
    this.outline.visible = !!hit;
    if (hit) this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  // Walk along the line of sight one block boundary at a time and return
  // the first solid block within reach, plus which face we hit
  // (nx, ny, nz points out of that face). Returns null if nothing is in reach.
  raycast() {
    const origin = this.camera.position;
    const dir = this.camera.getWorldDirection(this.direction);

    // The block the ray starts in.
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    // Which way we step along each axis (+1, -1, or 0).
    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);

    // How far along the ray it takes to cross one whole block on each axis.
    const deltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const deltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const deltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

    // How far along the ray until we cross the *next* block edge on each axis.
    const firstEdge = (pos, cell, step, delta) => {
      if (step > 0) return (cell + 1 - pos) * delta;
      if (step < 0) return (pos - cell) * delta;
      return Infinity;
    };
    let nextX = firstEdge(origin.x, x, stepX, deltaX);
    let nextY = firstEdge(origin.y, y, stepY, deltaY);
    let nextZ = firstEdge(origin.z, z, stepZ, deltaZ);

    while (true) {
      // Step into whichever neighbouring block the ray reaches first.
      let distance;
      let nx = 0, ny = 0, nz = 0;
      if (nextX < nextY && nextX < nextZ) {
        x += stepX; distance = nextX; nextX += deltaX; nx = -stepX;
      } else if (nextY < nextZ) {
        y += stepY; distance = nextY; nextY += deltaY; ny = -stepY;
      } else {
        z += stepZ; distance = nextZ; nextZ += deltaZ; nz = -stepZ;
      }
      if (distance > REACH) return null;
      if (this.world.isSolid(x, y, z)) return { x, y, z, nx, ny, nz };
    }
  }
}

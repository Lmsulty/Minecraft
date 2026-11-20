import { moveBody } from './physics.js';

// First-person player: mouse look, WASD movement, jumping, gravity and
// collision against solid blocks (the collision rules are in physics.js,
// shared with mobs).

// ---- Tuning numbers (play with these!) ----
const WALK_SPEED = 4.5;         // blocks per second
const JUMP_SPEED = 8;           // upward speed when jumping (clears 1 block)
const GRAVITY = 25;             // blocks per second, per second
const MAX_FALL_SPEED = 40;
const MOUSE_SENSITIVITY = 0.002;

// When the mouse is captured again (after a menu, or the pause screen), some
// browsers send one or two bogus mouse movements with a huge jump in them,
// which would snap your view somewhere else. So for a moment after capturing
// we ignore mouse movement, and we always ignore any single huge jump.
const SETTLE_TIME_MS = 150;   // ignore the mouse for this long after capturing it
const MAX_MOUSE_JUMP = 250;   // pixels in one event: more than this is a glitch, not a real move

// ---- Body size ----
const HALF_WIDTH = 0.3;  // player is 0.6 blocks wide
const HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;

export class Player {
  constructor(camera, world, domElement, overlay) {
    this.camera = camera;
    this.world = world;
    this.domElement = domElement;
    this.overlay = overlay;

    // Position is the centre of the player's feet.
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.onGround = false;
    this.halfWidth = HALF_WIDTH; // body size, for physics.js
    this.height = HEIGHT;

    this.yaw = 0;   // looking left/right
    this.pitch = 0; // looking up/down
    camera.rotation.order = 'YXZ'; // turn left/right first, then tilt up/down

    this.keys = new Set();
    this.locked = false;
    this.menuOpen = false; // e.g. the inventory screen: mouse is free, but not paused
    this.savedLook = null; // where you were looking when a menu opened (put back afterwards)
    this.ignoreMouseUntil = 0; // see SETTLE_TIME_MS
    this.spawnPoint = { x: 0, y: 0, z: 0 };

    this.setupControls();
  }

  spawn(x, y, z) {
    this.spawnPoint = { x, y, z };
    this.position = { x, y, z };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.updateCamera();
  }

  // ---- Input ----

  setupControls() {
    // Clicking the overlay captures the mouse (pointer lock).
    this.overlay.addEventListener('click', () => {
      this.capture();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
      this.updateOverlay();
      if (!this.locked) this.keys.clear(); // stop walking when paused or in a menu
      if (this.locked) {
        // Just captured: let the mouse settle, and look exactly where you
        // were looking before the menu opened.
        this.ignoreMouseUntil = performance.now() + SETTLE_TIME_MS;
        this.restoreLook();
        this.savedLook = null; // done: a later normal pause shouldn't snap back to it
      }
    });
    // If the browser refuses to capture the mouse, show "Click to play" again.
    document.addEventListener('pointerlockerror', () => this.updateOverlay());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (performance.now() < this.ignoreMouseUntil) return; // still settling
      if (Math.abs(e.movementX) > MAX_MOUSE_JUMP || Math.abs(e.movementY) > MAX_MOUSE_JUMP) return; // a glitch
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      const limit = Math.PI / 2 - 0.01; // can't look past straight up/down
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    });

    document.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault(); // stop the page scrolling
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  // Capture the mouse so moving it looks around.
  capture() {
    // The browser may refuse if you ask again right after pressing Esc.
    this.domElement.requestPointerLock()?.catch?.(() => this.updateOverlay());
  }

  // The "Click to play" screen shows when the mouse is free and no menu is open.
  updateOverlay() {
    this.overlay.style.display = this.locked || this.menuOpen ? 'none' : 'flex';
  }

  // A menu (like the inventory) is opening: free the mouse, but don't pause.
  // Remembers where you're looking, so it can be put back exactly afterwards.
  openMenu() {
    this.menuOpen = true;
    this.savedLook = { yaw: this.yaw, pitch: this.pitch };
    document.exitPointerLock();
  }

  // The menu closed. resume = true: capture the mouse and keep playing.
  // resume = false: show the pause screen instead.
  // Either way your view goes back to where it was when the menu opened
  // (now, and again when the mouse is captured, in case it jumped).
  closeMenu({ resume }) {
    this.menuOpen = false;
    this.restoreLook();
    if (resume) this.capture();
    else this.updateOverlay();
  }

  // Look where you were looking when the last menu opened (if one did).
  restoreLook() {
    if (!this.savedLook) return;
    this.yaw = this.savedLook.yaw;
    this.pitch = this.savedLook.pitch;
    this.updateCamera();
  }

  // ---- Every frame ----

  update(dt) {
    // The ground under us hasn't loaded yet (e.g. right after starting):
    // wait in place instead of falling through the world.
    if (!this.world.isLoadedAt(this.position.x, this.position.z)) {
      this.updateCamera();
      return;
    }

    // Walking: work out which way WASD points, relative to where we're looking.
    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyW')) forward += 1;
    if (this.keys.has('KeyS')) forward -= 1;
    if (this.keys.has('KeyD')) strafe += 1;
    if (this.keys.has('KeyA')) strafe -= 1;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let moveX = -sin * forward + cos * strafe;
    let moveZ = -cos * forward - sin * strafe;
    const length = Math.hypot(moveX, moveZ);
    if (length > 0) {
      // Divide by length so diagonal walking isn't faster.
      moveX /= length;
      moveZ /= length;
    }
    this.velocity.x = moveX * WALK_SPEED;
    this.velocity.z = moveZ * WALK_SPEED;

    // Jumping and gravity.
    if (this.keys.has('Space') && this.onGround) {
      this.velocity.y = JUMP_SPEED;
    }
    this.velocity.y = Math.max(this.velocity.y - GRAVITY * dt, -MAX_FALL_SPEED);

    // Move, stopping at solid blocks (physics.js).
    moveBody(this, this.world, this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);

    // Fell out of the bottom of the world? Back to the start.
    if (this.position.y < -30) {
      this.spawn(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
    }

    this.updateCamera();
  }

  // ---- Collision ----

  // Would a block at (bx, by, bz) overlap the player's body?
  // Used to stop you placing a block inside yourself.
  overlapsBlock(bx, by, bz) {
    const p = this.position;
    return (
      p.x - HALF_WIDTH < bx + 1 && p.x + HALF_WIDTH > bx &&
      p.y < by + 1 && p.y + HEIGHT > by &&
      p.z - HALF_WIDTH < bz + 1 && p.z + HALF_WIDTH > bz
    );
  }

  updateCamera() {
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}

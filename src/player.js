// First-person player: mouse look, WASD movement, jumping, gravity and
// collision against solid blocks. Only talks to the world through world.isSolid().

// ---- Tuning numbers (play with these!) ----
const WALK_SPEED = 4.5;         // blocks per second
const JUMP_SPEED = 8;           // upward speed when jumping (clears 1 block)
const GRAVITY = 25;             // blocks per second, per second
const MAX_FALL_SPEED = 40;
const MOUSE_SENSITIVITY = 0.002;

// ---- Body size ----
const HALF_WIDTH = 0.3;  // player is 0.6 blocks wide
const HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const EPSILON = 0.001;   // tiny gap so we never sit *exactly* on a block edge

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

    this.yaw = 0;   // looking left/right
    this.pitch = 0; // looking up/down
    camera.rotation.order = 'YXZ'; // turn left/right first, then tilt up/down

    this.keys = new Set();
    this.locked = false;
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
      // The browser may refuse if you click again right after pressing Esc.
      this.domElement.requestPointerLock()?.catch?.(() => {});
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
      this.overlay.style.display = this.locked ? 'none' : 'flex';
      if (!this.locked) this.keys.clear(); // stop walking when paused
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
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

    // Move in small steps so a fast fall can't skip through a block.
    const dx = this.velocity.x * dt;
    const dy = this.velocity.y * dt;
    const dz = this.velocity.z * dt;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4) || 1;
    this.onGround = false;
    for (let i = 0; i < steps; i++) {
      // One axis at a time: hitting a wall in X still lets you slide in Z.
      this.moveAxis('x', dx / steps);
      this.moveAxis('z', dz / steps);
      this.moveAxis('y', dy / steps);
    }

    // Fell out of the bottom of the world? Back to the start.
    if (this.position.y < -30) {
      this.spawn(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
    }

    this.updateCamera();
  }

  // ---- Collision ----

  moveAxis(axis, amount) {
    if (amount === 0) return;
    const p = this.position;
    p[axis] += amount;
    if (!this.collides()) return;

    // We moved into a block: push back to just touching its face.
    if (axis === 'y') {
      if (amount < 0) {
        p.y = Math.floor(p.y) + 1; // landed on top of a block
        this.onGround = true;
      } else {
        p.y = Math.floor(p.y + HEIGHT) - HEIGHT - EPSILON; // bumped head
      }
      this.velocity.y = 0;
    } else {
      if (amount > 0) {
        p[axis] = Math.floor(p[axis] + HALF_WIDTH) - HALF_WIDTH - EPSILON;
      } else {
        p[axis] = Math.floor(p[axis] - HALF_WIDTH) + 1 + HALF_WIDTH + EPSILON;
      }
    }
  }

  // Is any solid block overlapping the player's body box?
  collides() {
    const p = this.position;
    const minX = Math.floor(p.x - HALF_WIDTH);
    const maxX = Math.floor(p.x + HALF_WIDTH);
    const minY = Math.floor(p.y);
    const maxY = Math.floor(p.y + HEIGHT);
    const minZ = Math.floor(p.z - HALF_WIDTH);
    const maxZ = Math.floor(p.z + HALF_WIDTH);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

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

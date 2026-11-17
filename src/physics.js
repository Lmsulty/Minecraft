// Shared movement rules for anything with a body: the player and mobs.
// A body is a box standing on its feet:
//   position:  { x, y, z } = the centre of its feet
//   velocity:  { x, y, z } in blocks per second
//   halfWidth: half its width (the box is square from above)
//   height:    how tall it is
// After moving, these are filled in:
//   onGround:  true if it's standing on a block
//   hitWall:   true if it bumped into something sideways
// Only talks to the world through world.isSolid().

const EPSILON = 0.001; // tiny gap so a body never sits *exactly* on a block edge

// Move a body by (dx, dy, dz), stopping at solid blocks.
export function moveBody(body, world, dx, dy, dz) {
  // Move in small steps so a fast fall can't skip through a block.
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4) || 1;
  body.onGround = false;
  body.hitWall = false;
  for (let i = 0; i < steps; i++) {
    // One axis at a time: hitting a wall in X still lets you slide in Z.
    moveAxis(body, world, 'x', dx / steps);
    moveAxis(body, world, 'z', dz / steps);
    moveAxis(body, world, 'y', dy / steps);
  }
}

function moveAxis(body, world, axis, amount) {
  if (amount === 0) return;
  const p = body.position;
  p[axis] += amount;
  if (!collides(body, world)) return;

  // We moved into a block: push back to just touching its face.
  if (axis === 'y') {
    if (amount < 0) {
      p.y = Math.floor(p.y) + 1; // landed on top of a block
      body.onGround = true;
    } else {
      p.y = Math.floor(p.y + body.height) - body.height - EPSILON; // bumped head
    }
    body.velocity.y = 0;
  } else {
    if (amount > 0) {
      p[axis] = Math.floor(p[axis] + body.halfWidth) - body.halfWidth - EPSILON;
    } else {
      p[axis] = Math.floor(p[axis] - body.halfWidth) + 1 + body.halfWidth + EPSILON;
    }
    body.hitWall = true;
  }
}

// Is any solid block overlapping the body's box?
export function collides(body, world) {
  const p = body.position;
  const w = body.halfWidth;
  const minX = Math.floor(p.x - w);
  const maxX = Math.floor(p.x + w);
  const minY = Math.floor(p.y);
  const maxY = Math.floor(p.y + body.height);
  const minZ = Math.floor(p.z - w);
  const maxZ = Math.floor(p.z + w);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (world.isSolid(x, y, z)) return true;
      }
    }
  }
  return false;
}

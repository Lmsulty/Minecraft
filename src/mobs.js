import { THEME } from './theme.js';
import { BLOCK_TYPES } from './blocks.js';
import { idByName } from './items.js';
import { MOB_TYPES } from './mobTypes.js';
import { BRAINS } from './mobBrains.js';
import { MobRenderer, animateMob, modelBounds } from './mobModel.js';
import { MobGlow } from './mobGlow.js';
import { moveBody, collides } from './physics.js';

// Creatures: spawning them near the player, moving them, hitting them, and
// removing them when they're far away. They aren't saved: like the weather,
// new ones simply appear.
//
//   mobTypes.js   what each creature is (looks, speeds, spawn rules)
//   mobBrains.js  how each one behaves
//   mobModel.js   how they're drawn and animated
//   mobGlow.js    halos and real light around glowing creatures
//   physics.js    gravity and bumping into blocks (shared with the player)

const GRAVITY = 25;          // same as the player
const MAX_FALL_SPEED = 40;
const SPAWN_EVERY = 1;       // seconds between spawn attempts
const SPAWN_TRIES = 4;       // spots tried per attempt before giving up
const DESPAWN_MARGIN = 4;    // removed once this far past the draw distance
const BLOCKED_COOLDOWN = 0.5; // seconds between "the way is blocked" reactions
const STUN_TIME = 0.35;      // after a hit, it flies back for this long before running
const HIT_COOLDOWN = 0.3;    // can't be hit again this soon (one click = one hit)
const DYING_TIME = 0.35;     // how long it takes to shrink away
const SHADE_EVERY = 0.5;     // seconds between "is there open sky above me?" checks
const VIEW_HALF_ANGLE = 0.95; // about 55 degrees: "in front of the player" for spawning

// Block name -> id (stops with a clear message if mobTypes.js has a typo).
function blockId(name, mobName) {
  const type = BLOCK_TYPES.find((t) => t.name === name);
  if (!type) throw new Error(`mobTypes.js, ${mobName}: no block called "${name}"`);
  return type.id;
}

// What a creature drops, with ids instead of names (stops with a clear
// message if mobTypes.js has a typo).
function dropList(type) {
  return (type.drops ?? []).map(({ item, count }) => {
    const id = idByName(item);
    if (id === null) throw new Error(`mobTypes.js, ${type.name}: no item or block called "${item}"`);
    return { id, count };
  });
}

// Smallest difference between two angles, from -PI to PI.
export function angleDifference(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Mobs {
  constructor(scene, world, player, camera, dayNight) {
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.scene = scene;
    this.dayNight = dayNight;
    this.list = [];       // every creature that exists right now
    this.scale = 1;       // spawn limit multiplier (graphics level, see graphics.js)
    this.spawnTimer = SPAWN_EVERY;

    // What brains get to look at (see mobBrains.js).
    this.game = { mobs: this.list, player, random: Math.random };

    // This planet's creature types, each with its own renderer.
    const planetTypes = MOB_TYPES[THEME.planet] ?? {};
    this.types = Object.values(planetTypes).map((type) => {
      if (!BRAINS[type.brain]) throw new Error(`mobTypes.js, ${type.name}: no brain called "${type.brain}"`);
      return {
        type,
        groundId: blockId(type.spawn.ground, type.name),
        drops: dropList(type),
        bounds: modelBounds(type),
        renderer: new MobRenderer(type, type.spawn.maxCount, scene),
      };
    });
    this.glow = new MobGlow(scene, this.types.map((e) => e.type));
  }

  // The graphics level changed (graphics.js): how many creatures are allowed,
  // and how many glowing ones cast real light.
  setGraphics(level) {
    this.scale = level.mobScale;
    this.glow.setLightCount(level.glowLights ?? 0);
  }

  // ---- Every frame ----

  update(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_EVERY;
      for (const entry of this.types) this.trySpawn(entry);
    }

    const tooFar = this.world.drawRadius * 16 + DESPAWN_MARGIN;
    const p = this.player.position;
    for (const mob of this.list) {
      const far = Math.hypot(mob.position.x - p.x, mob.position.z - p.z) > tooFar;
      if (far || !this.world.isLoadedAt(mob.position.x, mob.position.z)) mob.removed = true;
      else {
        // Wrong time of day for it (e.g. dawn for a night creature)? It runs off.
        if (!mob.leaving && !this.rightTime(mob.type.spawn.time)) mob.leaving = true;
        this.updateMob(mob, dt);
      }
    }
    // Take out the removed ones (keeping the same list, which brains also see).
    let kept = 0;
    for (const mob of this.list) if (!mob.removed) this.list[kept++] = mob;
    this.list.length = kept;

    for (const entry of this.types) entry.renderer.draw(this.list, this.camera);
    this.glow.update(this.list, this.camera);
  }

  updateMob(mob, dt) {
    const type = mob.type;
    mob.hitCooldown -= dt;
    mob.blockedCooldown -= dt;

    const startX = mob.position.x;
    const startZ = mob.position.z;
    const v = mob.velocity;
    let tryingSpeed = 0; // how fast it's trying to walk forward this frame

    // Leaving: its glow fades as it runs off, then it vanishes.
    if (mob.leaving && !mob.dying) {
      mob.leaveTimer += dt;
      const leaveTime = type.leaveTime ?? 3;
      mob.glowFade = Math.max(0, 1 - mob.leaveTimer / leaveTime);
      if (mob.leaveTimer >= leaveTime) {
        mob.dying = true; // shrinks away (not defeated, so no drop)
        mob.dyingTimer = DYING_TIME;
      }
    }

    if (mob.dying) {
      // Shrinking away (it still flies back from the last hit).
      mob.dyingTimer -= dt;
      if (mob.dyingTimer <= 0) mob.removed = true;
      if (mob.onGround) {
        v.x *= Math.exp(-6 * dt);
        v.z *= Math.exp(-6 * dt);
      }
    } else if (mob.stun > 0) {
      // Flying back from a hit: no walking, just slow down along the ground.
      mob.stun -= dt;
      if (mob.onGround) {
        const slow = Math.exp(-6 * dt);
        v.x *= slow;
        v.z *= slow;
      }
    } else {
      BRAINS[type.brain].update(mob, this.game, dt);

      // Turn towards where it wants to face, at its turning speed.
      const diff = angleDifference(mob.goal, mob.yaw);
      const maxTurn = type.turnSpeed * dt * (mob.fleeing ? 2 : 1);
      mob.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));

      // Walk the way it's facing. It slows down while turning, so it turns
      // on the spot first instead of walking in a wide circle.
      const facing = Math.max(0, Math.cos(diff));
      tryingSpeed = mob.speed * facing;
      v.x = Math.sin(mob.yaw) * tryingSpeed;
      v.z = Math.cos(mob.yaw) * tryingSpeed;

      // A wall or cliff ahead: stop for now (the brain picks a new way).
      if (tryingSpeed > 0 && !this.steer(mob)) {
        v.x = 0;
        v.z = 0;
      }
      this.keepApart(mob);
    }

    // Gravity, then move (stopping at blocks).
    v.y = Math.max(v.y - GRAVITY * dt, -MAX_FALL_SPEED);
    moveBody(mob, this.world, v.x * dt, v.y * dt, v.z * dt);

    // Stuck (trying to walk forward without getting anywhere)? React.
    // Turning on the spot doesn't count: then it isn't trying to walk yet.
    const moved = Math.hypot(mob.position.x - startX, mob.position.z - startZ);
    if (tryingSpeed > 0.3 && moved < tryingSpeed * dt * 0.2) mob.stuckTime += dt;
    else mob.stuckTime = 0;
    if (mob.stuckTime > 0.6) {
      mob.stuckTime = 0;
      this.blocked(mob);
    }

    // Is there open sky above? (creatures under cover are drawn darker)
    mob.shadeTimer -= dt;
    if (mob.shadeTimer <= 0) {
      mob.shadeTimer = SHADE_EVERY;
      const covered = this.world.getSurfaceY(mob.position.x, mob.position.z) > Math.floor(mob.position.y) + 1;
      mob.shade = covered ? THEME.mobs.underCover : 1;
    }

    animateMob(mob, dt, moved);
  }

  // ---- Finding its way ----
  // Look at the ground just ahead: hop up a 1-block step, turn away from
  // walls and from drops that are too high. Returns false if it should stop.
  steer(mob) {
    const w = this.world;
    const reach = mob.halfWidth + 0.5;
    const ax = Math.floor(mob.position.x + Math.sin(mob.yaw) * reach);
    const az = Math.floor(mob.position.z + Math.cos(mob.yaw) * reach);
    const y = Math.floor(mob.position.y + 0.01); // the block its feet are in

    if (w.isSolid(ax, y, az)) {
      // Something in front. A single block with room above = a step to hop up.
      const tall = Math.ceil(mob.height);
      let room = true;
      for (let k = 1; k <= tall; k++) {
        if (w.isSolid(ax, y + k, az)) room = false;
      }
      // ...and room above its own head for the jump.
      if (w.isSolid(Math.floor(mob.position.x), y + tall + 1, Math.floor(mob.position.z))) room = false;
      if (room) {
        if (mob.onGround) mob.velocity.y = mob.type.jumpSpeed;
        return true;
      }
      this.blocked(mob);
      return false;
    }

    // Nothing in front: how far down is the ground there?
    const maxDrop = mob.type.maxDrop + (mob.fleeing ? 3 : 0);
    for (let k = 1; k <= maxDrop; k++) {
      if (w.isSolid(ax, y - k, az)) return true; // ground within reach: fine
    }
    if (!mob.onGround) return true; // mid-hop: keep going
    this.blocked(mob); // a cliff: don't walk off it
    return false;
  }

  blocked(mob) {
    if (mob.blockedCooldown > 0) return;
    mob.blockedCooldown = BLOCKED_COOLDOWN;
    BRAINS[mob.type.brain].onBlocked(mob, this.game);
  }

  // Creatures gently push apart so they don't stand inside each other.
  keepApart(mob) {
    for (const other of this.list) {
      if (other === mob || other.dying) continue;
      const dx = mob.position.x - other.position.x;
      const dz = mob.position.z - other.position.z;
      const near = mob.halfWidth + other.halfWidth + 0.2;
      const d = Math.hypot(dx, dz);
      if (d >= near || d < 0.0001) continue;
      const push = (near - d) * 3;
      mob.velocity.x += (dx / d) * push;
      mob.velocity.z += (dz / d) * push;
    }
  }

  // ---- Spawning ----

  trySpawn(entry) {
    const { type } = entry;
    const rules = type.spawn;
    const limit = Math.round(rules.maxCount * this.scale);
    const count = this.list.filter((m) => m.type === type).length;
    const room = limit - count;
    if (room < 1 || Math.random() > rules.chance || !this.rightTime(rules.time)) return;

    // Pick a spot in a ring around the player: not too close, inside the
    // draw distance, and if it's in front of the player, out in the haze
    // (so creatures never pop into view right in front of you).
    const p = this.player.position;
    const maxDistance = this.world.drawRadius * 16 - 10;
    const minDistance = Math.min(rules.minDistance, maxDistance - 4);
    const look = this.camera.rotation.y; // which way the player faces (0 = looking along -z)
    for (let attempt = 0; attempt < SPAWN_TRIES; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = minDistance + Math.random() * (maxDistance - minDistance);
      const x = p.x + Math.sin(angle) * distance;
      const z = p.z + Math.cos(angle) * distance;
      const inView = Math.abs(angleDifference(angle, look + Math.PI)) < VIEW_HALF_ANGLE;
      if (inView && distance < this.scene.fog.near) continue;
      if (this.spawnHerd(entry, x, z, Math.min(room, this.herdSize(type)))) return;
    }
  }

  rightTime(time) {
    if (time === 'any') return true;
    const hour = this.dayNight.hour;
    const night = hour >= 20 || hour < 6;
    return time === 'night' ? night : !night;
  }

  herdSize(type) {
    const [a, b] = type.herdSize ?? [1, 1];
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  // Spawn up to `size` creatures around (x, z). Returns true if any appeared.
  spawnHerd(entry, x, z, size) {
    const herd = { members: [] };
    for (let i = 0; i < size; i++) {
      const spread = i === 0 ? 0 : entry.type.herdSpread ?? 0;
      const mx = x + (Math.random() * 2 - 1) * spread;
      const mz = z + (Math.random() * 2 - 1) * spread;
      const mob = this.makeMob(entry, mx, mz, herd);
      if (mob) herd.members.push(mob);
      else if (i === 0) return false; // the main spot is no good
    }
    this.list.push(...herd.members);
    return herd.members.length > 0;
  }

  // A new creature standing on the ground at (x, z), or null if it can't stand there.
  makeMob(entry, x, z, herd) {
    const { type } = entry;
    const w = this.world;
    // Only on land that's being drawn (not the hidden outer ring of chunks).
    const chunk = w.getChunk(Math.floor(x / 16), Math.floor(z / 16));
    if (!chunk?.mesh) return null;
    const y = w.getSurfaceY(x, z);
    if (w.getBlock(x, y - 1, z) !== entry.groundId) return null; // wrong ground (or a treetop)

    const mob = {
      type,
      herd,
      position: { x: Math.floor(x) + 0.5, y, z: Math.floor(z) + 0.5 },
      velocity: { x: 0, y: 0, z: 0 },
      halfWidth: type.halfWidth,
      height: type.height,
      onGround: false,
      hitWall: false,
      yaw: 0,
      goal: 0,
      speed: 0,
      state: 'idle',
      timer: 0,
      grazing: false,
      fleeing: false,
      alert: false,
      fear: null,
      dodge: 0,
      dodgeTimer: 0,
      leaving: false,     // wrong time of day: running off before vanishing
      leaveTimer: 0,
      health: type.health,
      stun: 0,
      hitCooldown: 0,
      blockedCooldown: 0,
      stuckTime: 0,
      dying: false,
      defeated: false,    // true = the player beat it (so it drops something)
      dyingTimer: 0,
      dyingLength: DYING_TIME,
      removed: false,
      shade: 1,
      shadeTimer: 0,
      // Animation (mobModel.js)
      walkPhase: 0,
      moving: 0,
      headDip: 0,
      chew: Math.random() * 10,
      flash: 0,
      // Glow (glowing creatures only): pulse, and fading out when leaving.
      pulse: Math.random() * 10,
      glowFade: 1,
      glow: 1,
    };
    if (collides(mob, w)) return null; // squeezed against a tree or a wall
    BRAINS[type.brain].start(mob, this.game);
    mob.yaw = mob.goal;
    return mob;
  }

  // ---- Being hit ----

  // The creature at a point in the (flat) world, or null. Checks each
  // creature's model box, turned the way it faces.
  mobAt(point) {
    for (const mob of this.list) {
      if (mob.dying) continue;
      const { min, max } = this.types.find((e) => e.type === mob.type).bounds;
      // The point, in the creature's own space (facing +z).
      const dx = point.x - mob.position.x;
      const dz = point.z - mob.position.z;
      const sin = Math.sin(-mob.yaw);
      const cos = Math.cos(-mob.yaw);
      const lx = dx * cos + dz * sin;
      const lz = -dx * sin + dz * cos;
      const ly = point.y - mob.position.y;
      if (lx >= min[0] && lx <= max[0] && ly >= min[1] && ly <= max[1] && lz >= min[2] && lz <= max[2]) {
        return mob;
      }
    }
    return null;
  }

  // The player hit `mob` from position `from`. Returns what happened:
  //   'missed'    it didn't count (already dying, or hit a moment ago)
  //   'hit'       it took a hit
  //   'defeated'  that was its last hit (see dropsFor for what it drops)
  hit(mob, from) {
    if (mob.dying || mob.hitCooldown > 0) return 'missed';
    const type = mob.type;
    mob.hitCooldown = HIT_COOLDOWN;
    mob.health--;
    mob.flash = 1;

    // Knocked away from the player, and up a little.
    let dx = mob.position.x - from.x;
    let dz = mob.position.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    mob.velocity.x = dx * type.knockback.push;
    mob.velocity.z = dz * type.knockback.push;
    mob.velocity.y = type.knockback.up;
    mob.stun = STUN_TIME;

    if (mob.health <= 0) {
      // Defeated: it shrinks away.
      mob.dying = true;
      mob.defeated = true;
      mob.dyingTimer = DYING_TIME;
      return 'defeated';
    }
    BRAINS[type.brain].onHit(mob, this.game, from);
    return 'hit';
  }

  // What a defeated creature drops: [{ id, count }, ...], with the counts
  // rolled at random from the ranges in mobTypes.js.
  dropsFor(mob) {
    const entry = this.types.find((e) => e.type === mob.type);
    const random = this.game.random;
    return entry.drops
      .map(({ id, count: [least, most] }) => ({ id, count: least + Math.floor(random() * (most - least + 1)) }))
      .filter((drop) => drop.count > 0);
  }

  // For the FPS box: how many of each creature are around / the most allowed,
  // e.g. "Grazer 5/16  Glow critter 2/8"
  statsText() {
    return this.types.map(({ type }) => {
      const count = this.list.filter((m) => m.type === type).length;
      return `${type.name} ${count}/${Math.round(type.spawn.maxCount * this.scale)}`;
    }).join('  ');
  }
}

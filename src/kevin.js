import * as THREE from 'three';
import { THEME } from './theme.js';
import { MobRenderer, animateMob, modelBounds } from './mobModel.js';
import { angleTowards } from './mobBrains.js';
import { angleDifference } from './mobs.js';
import { moveBody } from './physics.js';
import { KevinFace } from './kevinFace.js';
import { KevinTag } from './kevinTag.js';

// Kevin: the player's robot companion.
//
// He isn't one of the normal creatures (mobs.js): he never spawns, despawns
// or gets defeated. He just follows you around, forever. But he's built from
// the same pieces:
//   mobModel.js   draws his boxes (so he follows the curved view, fades into
//                 the haze, flashes when hit, swings his legs and arms)
//   physics.js    gravity and bumping into blocks
//   kevinFace.js  the pixel face on his TV-screen head
//   kevinTag.js   the floating name tag above him
//   kevinName.js  his name (the player can rename him with N)
//
// What he does, depending on how far away you are (numbers below):
//   closer than 2 blocks      steps back to give you room
//   up to 5 blocks            stands still, faces you, glances around now and then
//   5 to 10 blocks            walks towards you (stops again at 4)
//   10 to 24 blocks           hurries to catch up
//   further than 24           teleports next to you (behind you, out of sight)
// If he's standing between you and the block you're aiming at, or right
// next to that block, he shuffles sideways out of your way.
// He also teleports if he's been stuck, if he can't get any closer for a
// while, or if you're far above or below him (up a tower, down a pit).
// So he can never get lost.

// ==========================================================
//  PERSONAL SPACE: tweak these to change how close he stays.
//  (All in blocks, measured across the ground.)
// ==========================================================
const START_FOLLOWING = 5;    // you're further than this: he walks over...
const STOP_FOLLOWING = 4;     // ...and stops once he's this close
const TOO_CLOSE = 2;          // you're closer than this: he steps back...
const BACK_OFF_TO = 3;        // ...until he's this far away
const RUN_FROM = 10;          // further than this: he hurries
const TELEPORT_DISTANCE = 24; // further than this: he teleports to you
const TELEPORT_RADII = [4, 5, 3]; // how far from you he appears (tries these in order)
const NEAR_AIMED_BLOCK = 1.5; // this close to the block you're aiming at = in your way
const IN_THE_WAY_DELAY = 0.5; // seconds he has to be in your way before he moves (so a quick glance doesn't)
const SHUFFLE_TIME = 0.8;     // seconds he keeps shuffling aside (longer if still in the way)

// ---- Other tuning numbers ----
const GRAVITY = 25;           // same as the player
const MAX_FALL_SPEED = 40;
const WALK_SPEED = 4.3;       // the player walks at 4.5
const RUN_SPEED = 6.5;        // catching up
const BACK_OFF_SPEED = 2.5;
const SHUFFLE_SPEED = 3;
const TURN_SPEED = 8;         // radians per second
const JUMP_SPEED = 8;         // clears one block, like the player
const MAX_DROP = 4;           // happy to step down drops this high
const DETOUR_ANGLES = [0.7, 1.4, 2.1]; // how far to the side he tries when a wall is in the way
const DETOUR_TIME = 1;        // seconds he keeps to a side-step before trying straight again

const TELEPORT_HEIGHT = 5;    // you're this much higher or lower...
const HEIGHT_PATIENCE = 2.5;  // ...for this many seconds: teleport
const STUCK_PATIENCE = 3;     // stuck against something for this long: teleport
const PROGRESS_PATIENCE = 8;  // following, but not getting any closer, for this long: teleport

const STUN_TIME = 0.35;       // after a hit, he flies back for this long
const HIT_COOLDOWN = 0.3;     // one click = one hit
const KNOCKBACK = { push: 5, up: 4 };
const ANNOYED_TIME = 3.5;     // seconds his face stays annoyed after a hit
const STREAK_TIME = 5;        // hits closer together than this count as a streak
const SHADE_EVERY = 0.5;      // seconds between "is there open sky above me?" checks
const FAR_ANIMATION = 40;     // same as mobModel.js: no bobbing further away than this
const TAG_HEIGHT = 2.45;      // the name tag floats this high above his feet (just over the antenna)
const ANTENNA_BLINK = 6;      // times a second the antenna tip blinks while he talks

// ---- Looks ----
// Same format as the creatures in mobTypes.js. Colours: THEME.mobs.kevin.
// He faces +z, and y = 0 is the ground under his feet.
// Arms use the 'leg' bone too, swinging opposite to the leg on the same side.
const SCREEN = { width: 0.52, height: 0.39, at: [0, 1.74, 0.272] }; // the face panel (kevinFace.js)
export const KEVIN_LOOKS = {
  name: 'Kevin',
  colors: 'kevin',
  halfWidth: 0.35,    // collision box: 0.7 wide...
  height: 1.95,       // ...and just under 2 tall, so he fits through 2-block tunnels
  stride: 1,          // blocks moved per full step
  legSwing: 0.6,
  head: { pivot: [0, 1.46, 0], grazeDip: 0 },
  parts: [
    // Legs and hips
    { size: [0.26, 0.75, 0.28], at: [-0.18, 0.375, 0], color: 'legs', bone: 'leg', leg: 0 },
    { size: [0.26, 0.75, 0.28], at: [0.18, 0.375, 0], color: 'legs', bone: 'leg', leg: 1 },
    { size: [0.62, 0.12, 0.4], at: [0, 0.81, 0], color: 'belt', bone: 'body' },

    // Body, with a panel on the chest and two rivets
    { size: [0.7, 0.56, 0.44], at: [0, 1.15, 0], color: 'body', bone: 'body' },
    { size: [0.3, 0.2, 0.04], at: [0, 1.17, 0.23], color: 'panel', bone: 'body' },
    { size: [0.06, 0.06, 0.03], at: [-0.25, 1.36, 0.225], color: 'rivet', bone: 'body' },
    { size: [0.06, 0.06, 0.03], at: [0.25, 1.36, 0.225], color: 'rivet', bone: 'body' },

    // Arms (swing from the shoulder)
    { size: [0.14, 0.6, 0.14], at: [-0.43, 1.13, 0], color: 'arms', bone: 'leg', leg: 1 },
    { size: [0.14, 0.6, 0.14], at: [0.43, 1.13, 0], color: 'arms', bone: 'leg', leg: 0 },

    // Neck, and the TV head: a box with a dark frame round the screen and two knobs on the side
    { size: [0.2, 0.06, 0.2], at: [0, 1.46, 0], color: 'belt', bone: 'body' },
    { size: [0.72, 0.5, 0.5], at: [0, 1.74, 0], color: 'head', bone: 'body' },
    { size: [0.6, 0.45, 0.02], at: [0, 1.74, 0.26], color: 'bezel', bone: 'body' },
    { size: [0.05, 0.08, 0.08], at: [0.385, 1.8, 0.1], color: 'rivet', bone: 'body' },
    { size: [0.05, 0.08, 0.08], at: [0.385, 1.66, 0.1], color: 'rivet', bone: 'body' },

    // A small antenna with a glowing tip
    { size: [0.03, 0.18, 0.03], at: [0.2, 2.08, -0.08], color: 'antenna', bone: 'body' },
    { size: [0.08, 0.08, 0.08], at: [0.2, 2.2, -0.08], color: 'tip', bone: 'body', glow: true },
  ],
};

// Scratch space, reused every frame.
const bodyMatrix = new THREE.Matrix4();
const screenMatrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const turn = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

export class Kevin {
  constructor(scene, world, player, camera, tagElement) {
    this.world = world;
    this.player = player;
    this.camera = camera;

    this.renderer = new MobRenderer(KEVIN_LOOKS, 1, scene);
    this.face = new KevinFace(scene);
    this.tag = new KevinTag(tagElement);
    this.bounds = modelBounds(KEVIN_LOOKS);

    // His body. The animation fields are the ones mobModel.js expects.
    this.body = {
      type: KEVIN_LOOKS,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      halfWidth: KEVIN_LOOKS.halfWidth,
      height: KEVIN_LOOKS.height,
      onGround: false,
      hitWall: false,
      yaw: 0,
      goal: 0,
      stun: 0,
      hitCooldown: 0,
      shade: 1,
      // Animation (mobModel.js)
      walkPhase: 0,
      moving: 0,
      headDip: 0,
      chew: 0,
      flash: 0,
      glow: 1,           // brightness of the antenna tip
      grazing: false,
      alert: false,
      dying: false,
    };

    this.mode = 'idle';       // 'idle', 'follow' or 'backoff'
    this.mood = 'idle';       // face to show: 'idle' or 'thinking' (talking and annoyed win over these)
    this.talking = false;     // set by kevinTalk.js while he's saying something
    this.clock = 0;           // seconds since the game started (for the antenna blink)
    this.headPoint = new THREE.Vector3(); // just above his head: where the name tag and speech bubble go
    this.lookTimer = 0;       // idle: seconds until he glances somewhere else
    this.lookOffset = 0;      // idle: how far from straight at you he's looking
    this.detour = 0;          // side-step angle while getting round something
    this.detourSide = 1;      // which side he tried last (he tries that side first next time)
    this.detourTimer = 0;
    this.stuckTime = 0;
    this.heightTime = 0;
    this.progressTime = 0;
    this.bestDistance = Infinity;
    this.shadeTimer = 0;
    this.annoyedTimer = 0;
    this.hitStreak = 0;       // hits in a row (for his reactions later)
    this.streakTimer = 0;
    this.aim = null;          // the block the player is aiming at (from interaction.js), or null
    this.inTheWayTime = 0;    // how long he's been in the way of it
    this.shuffleTimer = 0;    // > 0 while he's shuffling out of the way

    this.teleport(); // start next to the player
    this.events = [];  // things that happened, for kevinTalk.js: 'hit', 'teleport' (not the first arrival)
  }

  // What's happened since last asked (and forget them).
  takeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  // ---- Every frame ----

  update(dt) {
    const b = this.body;
    const p = this.player.position;
    this.annoyedTimer -= dt;
    this.streakTimer -= dt;
    b.hitCooldown -= dt;

    // The ground under the player hasn't loaded yet: wait.
    if (!this.world.isLoadedAt(p.x, p.z)) {
      this.draw(dt);
      return;
    }
    // The ground under HIM unloaded (you went far away): come back.
    if (!this.world.isLoadedAt(b.position.x, b.position.z)) this.teleport();

    const startX = b.position.x;
    const startZ = b.position.z;
    const v = b.velocity;

    if (b.stun > 0) {
      // Flying back from a hit: just slow down along the ground.
      b.stun -= dt;
      if (b.onGround) {
        const slow = Math.exp(-6 * dt);
        v.x *= slow;
        v.z *= slow;
      }
    } else {
      // In the way of what you're building or mining? Shuffle aside.
      this.inTheWayTime = this.isInTheWay() ? this.inTheWayTime + dt : 0;
      if (this.inTheWayTime > IN_THE_WAY_DELAY) {
        this.shuffleTimer = SHUFFLE_TIME; // keeps topping up while he's still in the way
        this.mode = 'idle';               // (so it doesn't count as being stuck while following)
      }
      this.think(dt);
    }

    // Gravity, then move (stopping at blocks).
    v.y = Math.max(v.y - GRAVITY * dt, -MAX_FALL_SPEED);
    moveBody(b, this.world, v.x * dt, v.y * dt, v.z * dt);

    const moved = Math.hypot(b.position.x - startX, b.position.z - startZ);
    this.checkLost(dt, moved);

    // Is there open sky above? (darker under cover, like the creatures)
    this.shadeTimer -= dt;
    if (this.shadeTimer <= 0) {
      this.shadeTimer = SHADE_EVERY;
      const covered = this.world.getSurfaceY(b.position.x, b.position.z) > Math.floor(b.position.y) + 2;
      b.shade = covered ? THEME.mobs.underCover : 1;
    }

    animateMob(b, dt, moved);
    this.draw(dt);
  }

  // Decide where to go, turn, and set his walking speed.
  think(dt) {
    const b = this.body;
    const p = this.player.position;
    const distance = Math.hypot(p.x - b.position.x, p.z - b.position.z);
    const toPlayer = angleTowards(b.position.x, b.position.z, p.x, p.z);

    // Switch modes. The gaps between the numbers stop him flicking back and forth.
    if (this.mode === 'follow' && distance < STOP_FOLLOWING) this.mode = 'idle';
    else if (this.mode !== 'follow' && distance > START_FOLLOWING) this.startFollowing();
    if (this.mode === 'idle' && distance < TOO_CLOSE) this.mode = 'backoff';
    if (this.mode === 'backoff' && distance > BACK_OFF_TO) this.mode = 'idle';

    let speed = 0;
    if (this.shuffleTimer > 0) {
      this.shuffleTimer -= dt;
      const way = this.shuffleWay();
      b.goal = way ?? toPlayer;
      speed = way === null ? 0 : SHUFFLE_SPEED;
    } else if (this.mode === 'follow') {
      const way = this.chooseWay(toPlayer, dt);
      if (way !== null) {
        b.goal = way;
        speed = distance > RUN_FROM ? RUN_SPEED : WALK_SPEED;
      } else {
        b.goal = toPlayer; // boxed in: face you and wait (he teleports if it lasts)
      }
    } else if (this.mode === 'backoff') {
      b.goal = toPlayer + Math.PI; // step away from you
      speed = this.probe(b.goal) ? BACK_OFF_SPEED : 0;
    } else {
      // Idle: mostly looks at you, but glances around now and then.
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTimer = 1.5 + Math.random() * 2.5;
        this.lookOffset = Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 1.6;
      }
      b.goal = toPlayer + this.lookOffset;
    }

    // Turn towards his goal. He slows down while turning, so he turns on the
    // spot first instead of walking in a wide circle.
    const diff = angleDifference(b.goal, b.yaw);
    const maxTurn = TURN_SPEED * dt;
    b.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
    let trying = speed * Math.max(0, Math.cos(diff));

    // Last check right in front of his feet: hop up a step, never walk off a cliff.
    if (trying > 0) {
      const ahead = this.probe(b.yaw);
      if (!ahead) trying = 0;
      if (ahead === 'hop' && b.onGround) b.velocity.y = JUMP_SPEED;
    }
    b.velocity.x = Math.sin(b.yaw) * trying;
    b.velocity.z = Math.cos(b.yaw) * trying;
  }

  // ---- Staying out of your way ----

  // interaction.js tells him every frame which block you're aiming at:
  // { x, y, z, blocking } (blocking = he's between you and it), or null.
  setAim(aim) {
    this.aim = aim;
  }

  // Is he in your line of sight to that block, or standing right next to it?
  isInTheWay() {
    const a = this.aim;
    if (!a) return false;
    if (a.blocking) return true;
    const b = this.body;
    const across = Math.hypot(b.position.x - (a.x + 0.5), b.position.z - (a.z + 0.5));
    // Level with it, give or take a block (his body is a bit under 2 tall).
    const level = a.y + 2 > b.position.y && a.y - 1 < b.position.y + b.height;
    return across < NEAR_AIMED_BLOCK && level;
  }

  // Which way to shuffle: sideways across your line of sight (staying on
  // the side he's already on), or else straight away from you. null = boxed in.
  shuffleWay() {
    const b = this.body;
    const p = this.player.position;
    const a = this.aim;
    const away = angleTowards(p.x, p.z, b.position.x, b.position.z);
    const ways = [];
    if (a) {
      const lx = a.x + 0.5 - p.x; // your line of sight, across the ground
      const lz = a.z + 0.5 - p.z;
      if (Math.hypot(lx, lz) > 0.3) {
        // At right angles to it, on his side of the line.
        let sx = -lz;
        let sz = lx;
        if (sx * (b.position.x - p.x) + sz * (b.position.z - p.z) < 0) { sx = -sx; sz = -sz; }
        const side = Math.atan2(sx, sz);
        ways.push(side, side + Math.PI);
      }
    }
    ways.push(away);
    for (const way of ways) if (this.probe(way)) return way;
    return null;
  }

  startFollowing() {
    this.mode = 'follow';
    this.bestDistance = Infinity;
    this.progressTime = 0;
  }

  // Which way to walk towards the player (an angle), or null if every way
  // is blocked. If straight ahead is blocked, he tries stepping to one side,
  // then the other, further and further round, and sticks with a side-step
  // for a moment so he gets round the corner.
  chooseWay(toPlayer, dt) {
    if (this.detourTimer > 0) {
      this.detourTimer -= dt;
      const way = toPlayer + this.detour;
      if (this.probe(way)) return way;
    }
    if (this.probe(toPlayer)) return toPlayer;
    for (const angle of DETOUR_ANGLES) {
      for (const side of [this.detourSide, -this.detourSide]) {
        const way = toPlayer + side * angle;
        if (this.probe(way)) {
          this.detour = side * angle;
          this.detourSide = side;
          this.detourTimer = DETOUR_TIME;
          return way;
        }
      }
    }
    return null;
  }

  // Can he walk in direction `angle`? Looks at the ground just ahead:
  //   'clear'  yes
  //   'hop'    yes, but there's a 1-block step to hop up
  //   false    no: a wall, a low ceiling, or a drop that's too high
  probe(angle) {
    const w = this.world;
    const b = this.body;
    const reach = b.halfWidth + 0.5;
    const ax = Math.floor(b.position.x + Math.sin(angle) * reach);
    const az = Math.floor(b.position.z + Math.cos(angle) * reach);
    const y = Math.floor(b.position.y + 0.01); // the block his feet are in

    if (w.isSolid(ax, y, az)) {
      // A step, if there's room for his body on top and above his head for the jump.
      const room = !w.isSolid(ax, y + 1, az) && !w.isSolid(ax, y + 2, az) &&
        !w.isSolid(Math.floor(b.position.x), y + 3, Math.floor(b.position.z));
      return room ? 'hop' : false;
    }
    if (w.isSolid(ax, y + 1, az)) return false; // something at head height
    for (let k = 1; k <= MAX_DROP; k++) {
      if (w.isSolid(ax, y - k, az)) return 'clear'; // ground within reach
    }
    return b.onGround ? false : 'clear'; // a cliff (but keep going if mid-hop)
  }

  // ---- Never getting lost ----

  checkLost(dt, moved) {
    const b = this.body;
    const p = this.player.position;
    const distance = Math.hypot(p.x - b.position.x, p.z - b.position.z);

    // Stuck: trying to follow, but hardly moving.
    if (this.mode === 'follow' && moved < WALK_SPEED * dt * 0.2) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt);

    // Following, but not getting any closer (e.g. walking round and round a wall).
    if (this.mode === 'follow') {
      if (distance < this.bestDistance - 0.5) {
        this.bestDistance = distance;
        this.progressTime = 0;
      } else {
        this.progressTime += dt;
      }
    }

    // You're far above or below him.
    if (Math.abs(p.y - b.position.y) > TELEPORT_HEIGHT) this.heightTime += dt;
    else this.heightTime = 0;

    if (distance > TELEPORT_DISTANCE || b.position.y < -30 ||
        this.stuckTime > STUCK_PATIENCE ||
        this.progressTime > PROGRESS_PATIENCE ||
        this.heightTime > HEIGHT_PATIENCE) {
      this.teleport();
    }
  }

  // Appear on a safe spot near the player: preferably just behind them (so
  // you don't see him pop in), at about the same height.
  teleport() {
    const b = this.body;
    const p = this.player.position;
    const spot = this.findSpotNear(3) ?? this.findSpotNear(10) ?? { x: p.x, y: p.y, z: p.z };
    b.position.x = spot.x;
    b.position.y = spot.y;
    b.position.z = spot.z;
    b.velocity.x = b.velocity.y = b.velocity.z = 0;
    b.stun = 0;
    b.yaw = b.goal = angleTowards(spot.x, spot.z, p.x, p.z);
    b.flash = 0.8; // a little flash as he beams in
    this.events?.push('teleport');
    this.mode = 'idle';
    this.stuckTime = 0;
    this.progressTime = 0;
    this.detourTimer = 0;
    // Still far above or below you (no better spot)? Don't try again for a while.
    this.heightTime = Math.abs(p.y - spot.y) > TELEPORT_HEIGHT ? -10 : 0;
  }

  // A spot to stand (solid block below, 2 blocks of air) around the player,
  // up to `maxBelow` blocks lower than them. Tries behind the player first.
  findSpotNear(maxBelow) {
    const p = this.player.position;
    const behind = this.player.yaw; // the player looks along -sin/-cos of yaw, so this angle points behind them
    const heights = [0, 1, -1, 2, -2, 3];
    for (let k = -3; k >= -maxBelow; k--) if (!heights.includes(k)) heights.push(k);

    for (const radius of TELEPORT_RADII) {
      for (const turnBy of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5, Math.PI]) {
        const x = Math.floor(p.x + Math.sin(behind + turnBy) * radius);
        const z = Math.floor(p.z + Math.cos(behind + turnBy) * radius);
        if (!this.world.isLoadedAt(x, z)) continue;
        for (const dy of heights) {
          const y = Math.floor(p.y) + dy;
          if (this.world.isSolid(x, y - 1, z) && !this.world.isSolid(x, y, z) && !this.world.isSolid(x, y + 1, z)) {
            return { x: x + 0.5, y, z: z + 0.5 };
          }
        }
      }
    }
    return null;
  }

  // ---- Being hit ----

  // Is a (flat world) point inside his model? Same check as mobs.js mobAt().
  isAt(point) {
    const b = this.body;
    const { min, max } = this.bounds;
    const dx = point.x - b.position.x;
    const dz = point.z - b.position.z;
    const sin = Math.sin(-b.yaw);
    const cos = Math.cos(-b.yaw);
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    const ly = point.y - b.position.y;
    return lx >= min[0] && lx <= max[0] && ly >= min[1] && ly <= max[1] && lz >= min[2] && lz <= max[2];
  }

  // The player hit him from position `from`. He can't be hurt: he just gets
  // knocked back a little and looks annoyed. Returns true if the hit counted.
  hit(from) {
    const b = this.body;
    if (b.hitCooldown > 0) return false;
    b.hitCooldown = HIT_COOLDOWN;
    b.flash = 1;

    let dx = b.position.x - from.x;
    let dz = b.position.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    b.velocity.x = (dx / d) * KNOCKBACK.push;
    b.velocity.z = (dz / d) * KNOCKBACK.push;
    b.velocity.y = KNOCKBACK.up;
    b.stun = STUN_TIME;

    this.annoyedTimer = ANNOYED_TIME;
    this.hitStreak = this.streakTimer > 0 ? this.hitStreak + 1 : 1;
    this.streakTimer = STREAK_TIME;
    this.events.push('hit');
    return true;
  }

  // ---- Drawing ----

  draw(dt) {
    const b = this.body;
    // The antenna tip blinks while he talks.
    this.clock += dt;
    b.glow = this.talking && Math.sin(this.clock * ANTENNA_BLINK * Math.PI * 2) < 0 ? 0.3 : 1;
    this.renderer.draw([b], this.camera);

    // The face panel sits in front of his head, and bobs with his body
    // exactly like mobModel.js bobs the boxes.
    const c = this.camera.position;
    const near = Math.hypot(b.position.x - c.x, b.position.z - c.z) < FAR_ANIMATION;
    const bob = near ? Math.abs(Math.sin(b.walkPhase)) * 0.05 * b.moving : 0;
    position.set(b.position.x, b.position.y, b.position.z);
    turn.setFromAxisAngle(UP, b.yaw);
    bodyMatrix.compose(position, turn, ONE);
    screenMatrix.makeScale(SCREEN.width, SCREEN.height, 1)
      .setPosition(SCREEN.at[0], SCREEN.at[1] + bob, SCREEN.at[2])
      .premultiply(bodyMatrix);
    const expression = this.annoyedTimer > 0 ? 'annoyed' : this.talking ? 'talking' : this.mood;
    this.face.update(dt, expression, screenMatrix);

    this.headPoint.set(b.position.x, b.position.y + TAG_HEIGHT + bob, b.position.z);
    this.tag.update(this.headPoint, this.camera);
  }
}

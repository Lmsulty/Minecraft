// Creature behaviour ("brains"). Each mob type in mobTypes.js names one.
//
// A brain only decides what the creature WANTS to do, by setting:
//   mob.goal      which way it wants to face (an angle: 0 = +z, PI/2 = +x)
//   mob.speed     how fast it wants to walk (0 = stand still)
//   mob.grazing   true = head down, eating
//   mob.fleeing   true = running away (allowed to jump off bigger drops)
//   mob.alert     true = head up, watching something
// mobs.js does the rest: turning, walking, avoiding walls and cliffs,
// hopping up steps, gravity.
//
// Each brain has:
//   start(mob)                 set up a newly spawned creature
//   update(mob, game, dt)      called every frame
//   onBlocked(mob, game)       the way ahead is a wall or a cliff
//   onHit(mob, game, from)     the player hit it (from = where the hit came from)
//
// game = { mobs (every creature), player, random () => 0..1 }
// mob.leaving is set by mobs.js when it's the wrong time of day for this
// creature (e.g. dawn for a night creature): it should run off.
//
// Later, a hostile brain (e.g. 'hunter') would go here too: idle -> chase
// the player when close -> attack when in reach -> give up when far.

const TURN_AROUND = Math.PI;

// A random number between a and b, from [a, b].
function between([a, b], random) {
  return a + (b - a) * random();
}

// Angle pointing from (x1, z1) towards (x2, z2), in the same units as mob.goal.
export function angleTowards(x1, z1, x2, z2) {
  return Math.atan2(x2 - x1, z2 - z1);
}

export const BRAINS = {
  // ---- Herd: gentle grazers that stay together and run when hit ----
  herd: {
    start(mob, game) {
      mob.goal = game.random() * Math.PI * 2;
      pickNext(mob, game);
    },

    update(mob, game, dt) {
      mob.timer -= dt;
      const type = mob.type;

      if (mob.state === 'flee') {
        // Keep running directly away from whatever scared it. If a wall is in
        // the way, onBlocked adds a sideways dodge for a moment.
        mob.dodgeTimer -= dt;
        if (mob.dodgeTimer <= 0) mob.dodge = 0;
        mob.goal = angleTowards(mob.fear.x, mob.fear.z, mob.position.x, mob.position.z) + mob.dodge;
        if (mob.timer <= 0) pickNext(mob, game);
        return;
      }

      if (mob.timer <= 0) pickNext(mob, game);

      // Strayed too far from the herd? Head back towards the others.
      if (mob.state === 'wander') {
        const centre = herdCentre(mob);
        if (centre) {
          const away = Math.hypot(centre.x - mob.position.x, centre.z - mob.position.z);
          if (away > type.stayWithin) {
            mob.goal = angleTowards(mob.position.x, mob.position.z, centre.x, centre.z);
          }
        }
      }
    },

    onBlocked(mob, game) {
      if (mob.state === 'flee') {
        // Dodge sideways for a moment, then try to run straight away again.
        mob.dodge = (game.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + game.random() * 0.8);
        mob.dodgeTimer = 1.2;
      } else {
        // Turn somewhere new: a quarter turn or more, either way.
        mob.goal += (game.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + game.random() * (TURN_AROUND / 2));
      }
    },

    onHit(mob, game, from) {
      startFleeing(mob, game, from);
      // Herd-mates nearby panic too.
      for (const other of game.mobs) {
        if (other === mob || other.herd !== mob.herd || other.dying) continue;
        const d = Math.hypot(other.position.x - mob.position.x, other.position.z - mob.position.z);
        if (d <= mob.type.panicRadius) startFleeing(other, game, from);
      }
    },
  },

  // ---- Shy: keeps its distance from the player, and runs if they come close ----
  shy: {
    start(mob, game) {
      mob.goal = game.random() * Math.PI * 2;
      pickNext(mob, game);
    },

    update(mob, game, dt) {
      mob.timer -= dt;
      const type = mob.type;
      const p = game.player.position;
      const distance = Math.hypot(p.x - mob.position.x, p.z - mob.position.z);

      // Dawn (or too close): run away from the player.
      const tooClose = mob.state === 'flee'
        ? distance < type.safeDistance || mob.timer > 0 // keeps running until safe (and after a hit)
        : distance < type.scaredDistance;
      if (mob.leaving || tooClose) {
        if (mob.state !== 'flee') startFleeing(mob, game, p, 0);
        mob.fear.x = p.x;
        mob.fear.z = p.z;
        mob.dodgeTimer -= dt;
        if (mob.dodgeTimer <= 0) mob.dodge = 0;
        mob.goal = angleTowards(p.x, p.z, mob.position.x, mob.position.z) + mob.dodge;
        return;
      }

      // Close enough to be curious: stop, turn to face the player, head up.
      if (distance < type.watchDistance) {
        if (mob.state !== 'watch') {
          mob.state = 'watch';
          mob.speed = 0;
          mob.fleeing = false;
          mob.alert = true;
        }
        mob.goal = angleTowards(mob.position.x, mob.position.z, p.x, p.z);
        return;
      }

      // Otherwise it goes about its business.
      if (mob.state === 'watch' || mob.state === 'flee' || mob.timer <= 0) pickNext(mob, game);
    },

    onBlocked(mob, game) {
      BRAINS.herd.onBlocked(mob, game); // same: dodge sideways when fleeing, else turn
    },

    onHit(mob, game, from) {
      startFleeing(mob, game, from);
    },
  },
};

// Choose what to do next: wander, graze or stand still.
function pickNext(mob, game) {
  const type = mob.type;
  const wander = type.choices.wander ?? 0;
  const graze = type.choices.graze ?? 0;
  const roll = game.random() * (wander + graze + (type.choices.idle ?? 0));
  mob.grazing = false;
  mob.fleeing = false;
  mob.alert = false;
  if (roll < wander) {
    mob.state = 'wander';
    mob.timer = between(type.wanderTime, game.random);
    mob.goal += (game.random() - 0.5) * Math.PI; // a new direction, roughly ahead
    mob.speed = type.walkSpeed;
  } else if (roll < wander + graze) {
    mob.state = 'graze';
    mob.timer = between(type.grazeTime, game.random);
    mob.speed = 0;
    mob.grazing = true;
  } else {
    mob.state = 'idle';
    mob.timer = between(type.idleTime, game.random);
    mob.speed = 0;
  }
}

// Run away from `from`. `time` = how long to keep running at least
// (default: the creature's fleeTime).
function startFleeing(mob, game, from, time = between(mob.type.fleeTime, game.random)) {
  mob.state = 'flee';
  mob.timer = time;
  mob.alert = false;
  mob.speed = mob.type.fleeSpeed;
  mob.grazing = false;
  mob.fleeing = true;
  mob.fear = { x: from.x, z: from.z };
  mob.dodge = 0;
  mob.dodgeTimer = 0;
}

// The middle of the rest of this creature's herd (null if it's alone).
function herdCentre(mob) {
  let x = 0, z = 0, n = 0;
  for (const other of mob.herd.members) {
    if (other === mob || other.removed) continue;
    x += other.position.x;
    z += other.position.z;
    n++;
  }
  return n ? { x: x / n, z: z / n } : null;
}

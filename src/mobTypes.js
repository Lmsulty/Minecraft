// ==========================================================
//  MOB TYPES: every creature in the game, grouped by planet.
//  THEME.planet (theme.js) picks which planet's creatures appear.
//  Colours live in theme.js (THEME.mobs); everything else is here.
//
//  To add a creature: copy one, change the numbers and parts, and add its
//  colours to THEME.mobs. The logic is in mobs.js (spawning, moving,
//  hitting), mobBrains.js (behaviour) and mobModel.js (drawing).
//
//  Distances are in blocks, speeds in blocks per second, times in seconds.
//  [a, b] means "a random number between a and b".
// ==========================================================

export const MOB_TYPES = {
  home: {
    grazer: {
      name: 'Grazer',
      colors: 'grazer',        // which colour set in THEME.mobs
      brain: 'herd',           // behaviour, from mobBrains.js

      // ---- Body ----
      halfWidth: 0.65,         // collision box: 1.3 wide (square from above)...
      height: 1.4,             // ...and this tall
      health: 5,               // hits it takes

      // ---- Moving ----
      walkSpeed: 1.3,
      fleeSpeed: 4.5,
      turnSpeed: 3,            // how fast it turns (radians per second)
      jumpSpeed: 7.5,          // enough to hop up one block
      knockback: { push: 6, up: 4.5 }, // how far a hit sends it flying
      stride: 1.1,             // blocks moved per full step of the legs
      legSwing: 0.55,          // how far the legs swing (radians)

      // ---- Behaviour (used by the 'herd' brain) ----
      wanderTime: [3, 7],      // how long it walks before deciding again
      grazeTime: [2, 5],       // how long it stands eating
      idleTime: [1, 3],        // how long it stands still
      choices: { wander: 0.45, graze: 0.35, idle: 0.2 }, // how often it picks each
      fleeTime: [4, 6],        // how long it runs after being hit
      panicRadius: 10,         // herd-mates this close run too
      herdSize: [2, 4],
      herdSpread: 3,           // how far apart a herd spawns
      stayWithin: 6,           // wanders back if it gets further than this from its herd
      maxDrop: 3,              // won't walk off a drop higher than this (unless fleeing)

      // ---- Spawning ----
      spawn: {
        ground: 'grass',       // block name it must stand on (blocks.js)
        time: 'any',           // 'any', 'day' or 'night'
        maxCount: 16,          // most that can be around at once (times mobScale in theme.js)
        chance: 0.5,           // chance per second of trying to spawn a new herd
        minDistance: 24,       // never closer to the player than this
      },

      // ---- Looks: a list of boxes ----
      // The creature faces +z. y = 0 is the ground under its feet.
      //   size:  [width (x), height (y), length (z)]
      //   at:    centre of the box
      //   color: a colour name from its set in THEME.mobs
      //   bone:  what moves it: 'body', 'head' (dips to graze), or 'leg'
      //   leg:   for legs, which step group: legs in group 0 move together,
      //          and group 1 moves the opposite way (a "tripod" walk, like insects)
      head: { pivot: [0, 0.95, 0.85], grazeDip: 0.6 }, // the head turns around its neck, here
      parts: [
        { size: [1.3, 0.75, 1.8], at: [0, 0.83, 0], color: 'body', bone: 'body' },
        { size: [1.1, 0.12, 1.5], at: [0, 0.43, 0], color: 'belly', bone: 'body' },
        { size: [0.36, 0.22, 0.36], at: [0, 1.3, -0.55], color: 'plates', bone: 'body' },
        { size: [0.4, 0.26, 0.4], at: [0, 1.32, 0], color: 'plates', bone: 'body' },
        { size: [0.36, 0.22, 0.36], at: [0, 1.3, 0.55], color: 'plates', bone: 'body' },

        { size: [0.9, 0.55, 0.6], at: [0, 0.95, 1.15], color: 'head', bone: 'head' },
        { size: [0.6, 0.32, 0.36], at: [0, 0.74, 1.52], color: 'snout', bone: 'head' },
        { size: [0.1, 0.32, 0.1], at: [-0.28, 1.36, 1.2], color: 'stalks', bone: 'head' },
        { size: [0.1, 0.32, 0.1], at: [0.28, 1.36, 1.2], color: 'stalks', bone: 'head' },
        { size: [0.18, 0.18, 0.18], at: [-0.28, 1.56, 1.2], color: 'eyes', bone: 'head' },
        { size: [0.18, 0.18, 0.18], at: [0.28, 1.56, 1.2], color: 'eyes', bone: 'head' },

        // Six legs. Each swings from its hip (the top of the leg).
        { size: [0.22, 0.5, 0.22], at: [-0.52, 0.25, 0.62], color: 'legs', bone: 'leg', leg: 0 },
        { size: [0.22, 0.5, 0.22], at: [0.52, 0.25, 0.62], color: 'legs', bone: 'leg', leg: 1 },
        { size: [0.22, 0.5, 0.22], at: [-0.52, 0.25, 0], color: 'legs', bone: 'leg', leg: 1 },
        { size: [0.22, 0.5, 0.22], at: [0.52, 0.25, 0], color: 'legs', bone: 'leg', leg: 0 },
        { size: [0.22, 0.5, 0.22], at: [-0.52, 0.25, -0.62], color: 'legs', bone: 'leg', leg: 0 },
        { size: [0.22, 0.5, 0.22], at: [0.52, 0.25, -0.62], color: 'legs', bone: 'leg', leg: 1 },
      ],
    },
  },
};

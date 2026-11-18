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

      // ---- What you get for defeating it ----
      // item: an item or block name (items.js / blocks.js)
      // count: [least, most], a whole number between them (both included)
      drops: [{ item: 'grazer fleece', count: [1, 2] }],

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
      //   glow:  true = this part glows (stays bright in the dark, see glowCritter)
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

    glowCritter: {
      name: 'Glow critter',
      colors: 'glowCritter',
      brain: 'shy',            // keeps its distance, runs if you get close

      // ---- Body ----
      halfWidth: 0.3,
      height: 0.8,             // fits through 1-block gaps
      health: 2,

      // ---- Moving ----
      walkSpeed: 1.6,
      fleeSpeed: 5.5,          // a bit faster than you, so it's hard to catch
      turnSpeed: 5,
      jumpSpeed: 7.5,
      knockback: { push: 5, up: 4 },
      stride: 0.45,            // small steps: its legs scurry quickly
      legSwing: 0.7,

      // ---- Behaviour (used by the 'shy' brain) ----
      wanderTime: [2, 5],
      idleTime: [1, 3],
      choices: { wander: 0.6, idle: 0.4 },
      fleeTime: [3, 5],        // how long it runs after being hit
      scaredDistance: 8,       // runs away if you come closer than this...
      safeDistance: 12,        // ...until it's this far away again
      watchDistance: 15,       // closer than this (but not scared): stops and watches you
      maxDrop: 3,
      herdSize: [1, 2],        // alone or in pairs
      herdSpread: 2,
      leaveTime: 4,            // at dawn it runs off for this long, then vanishes

      drops: [{ item: 'glow dust', count: [1, 1] }], // not when it leaves at dawn: only if you catch it

      // ---- Spawning ----
      spawn: {
        ground: 'grass',
        time: 'night',         // only comes out at night, and leaves at dawn
        maxCount: 8,
        chance: 0.6,
        minDistance: 20,
      },

      // ---- Glow (logic in mobGlow.js) ----
      // Parts marked glow: true ignore the darkness. Around each critter
      // there's also a soft halo, a pool of light on the ground, and (for the
      // nearest ones, see glowLights in theme.js) a real light.
      glow: {
        pulseSpeed: 2,         // how fast the glow gently pulses
        halo: 1.4,             // size of the soft halo around it
        pool: 3.5,             // width of the pool of light on the ground
        haloStrength: 0.35,    // how bright the halo is (0 = none)
        poolStrength: 0.35,
        light: { strength: 2.2, reach: 6 }, // the real light: brightness, and how far it reaches
      },

      // ---- Looks ----
      head: { pivot: [0, 0.45, 0.25], grazeDip: 0, alertLift: 0.3 }, // lifts its head to watch you
      parts: [
        { size: [0.5, 0.38, 0.56], at: [0, 0.37, 0], color: 'body', bone: 'body' },
        { size: [0.42, 0.1, 0.48], at: [0, 0.17, 0], color: 'glow', bone: 'body', glow: true }, // glowing belly
        { size: [0.06, 0.06, 0.3], at: [0, 0.42, -0.4], color: 'body', bone: 'body' },          // tail
        { size: [0.1, 0.1, 0.1], at: [0, 0.44, -0.58], color: 'glow', bone: 'body', glow: true }, // tail tip

        { size: [0.4, 0.34, 0.3], at: [0, 0.52, 0.38], color: 'body', bone: 'head' },
        { size: [0.14, 0.16, 0.04], at: [-0.1, 0.55, 0.54], color: 'eyes', bone: 'head' },
        { size: [0.14, 0.16, 0.04], at: [0.1, 0.55, 0.54], color: 'eyes', bone: 'head' },
        { size: [0.04, 0.04, 0.02], at: [-0.07, 0.59, 0.565], color: 'shine', bone: 'head', glow: true },
        { size: [0.04, 0.04, 0.02], at: [0.13, 0.59, 0.565], color: 'shine', bone: 'head', glow: true },
        { size: [0.03, 0.34, 0.03], at: [-0.1, 0.86, 0.36], color: 'antennae', bone: 'head' },
        { size: [0.03, 0.34, 0.03], at: [0.1, 0.86, 0.36], color: 'antennae', bone: 'head' },
        { size: [0.09, 0.09, 0.09], at: [-0.1, 1.05, 0.36], color: 'glow', bone: 'head', glow: true },
        { size: [0.09, 0.09, 0.09], at: [0.1, 1.05, 0.36], color: 'glow', bone: 'head', glow: true },

        // Four thin legs. Diagonal pairs step together (a trot).
        { size: [0.07, 0.2, 0.07], at: [-0.18, 0.1, 0.18], color: 'legs', bone: 'leg', leg: 0 },
        { size: [0.07, 0.2, 0.07], at: [0.18, 0.1, -0.18], color: 'legs', bone: 'leg', leg: 0 },
        { size: [0.07, 0.2, 0.07], at: [0.18, 0.1, 0.18], color: 'legs', bone: 'leg', leg: 1 },
        { size: [0.07, 0.2, 0.07], at: [-0.18, 0.1, -0.18], color: 'legs', bone: 'leg', leg: 1 },
      ],
    },
  },
};

// ==========================================================
//  THEME: every colour in the game lives in this file.
//  To reskin the game, edit only this file.
//
//  Colours are written as '#rrggbb' (red, green, blue in hex).
//  Interface colours may also use 'rgba(r, g, b, alpha)' for see-through.
// ==========================================================

export const THEME = {
  // Which planet you're on. Set automatically when the game starts (from the
  // save, see the bottom of this file), so don't change it here.
  planet: 'home',

  // ---- Planets ----
  // Every planet orbits the same black hole. Each one is its own endless world
  // with its own seed (so its own terrain and its own save).
  //   name:    shown on screen
  //   description: one line about it, on its card in the ship's planet picker
  //   timeSlip: how much faster time passes at home while you're here. Planets
  //            closer to the black hole have a bigger slip (1 = none).
  //   color:   the stripe on its card in the planet picker
  //   seed:    the number its terrain grows from. Changing it gives a brand new
  //            world (and the old save for that planet no longer lines up).
  //   changes: settings that are DIFFERENT from home. Anything you put here
  //            replaces the same setting further down this file, only on that
  //            planet. Anything you leave out stays the same as home.
  //            Example: trees: { chance: 0 } = no trees, same tree shape.
  // Home has no changes, so home is exactly the game as it was before planets.
  planets: {
    home: {
      name: 'Home',
      description: 'Golden meadows, tiered forests and deep caves.',
      timeSlip: 1,
      color: '#9fc0d0',
      seed: 12345,
      changes: {},
    },
    water: {
      name: 'Water world',
      description: 'Shallow teal seas, pale sand islands and a ringed planet overhead.',
      timeSlip: 60,
      color: '#3fb0c8',
      seed: 777,
      changes: {
        // Low ground under a shallow sea, with sandy islands poking out.
        terrain: {
          baseHeight: 40,
          hillHeight: 9,
          seaLevel: 43,
          maxSeaDepth: 3,
          caves: false,
          spawnOn: 'sand',
          sand: { maxHeight: 96, threshold: -99, depth: 4 }, // sand everywhere
        },
        trees: { chance: 0 },

        // Bright aqua sky. Same hours as home's keyframes (see skyKeyframes below).
        skyKeyframes: [
          { hour: 4,  name: 'night',   sky: '#0c1e26', skyTop: '#030a10', light: '#8fc4d8', lightStrength: 0.45, ambientSky: '#2e5a6a', ambientGround: '#10181a', ambientStrength: 0.5,  cloudLit: '#24404a', cloudShade: '#0e1c22', stars: 1 },
          { hour: 5,  name: 'dawn',    sky: '#4e6e7a', skyTop: '#1c3448', light: '#b0c8d0', lightStrength: 0.5,  ambientSky: '#6a8a9a', ambientGround: '#22282a', ambientStrength: 0.55, cloudLit: '#a8c0c4', cloudShade: '#3a5060', stars: 0.5 },
          { hour: 6,  name: 'sunrise', sky: '#f2c8a0', skyTop: '#5aa0b8', light: '#ffd8a8', lightStrength: 1.0,  ambientSky: '#ffe2c4', ambientGround: '#6a6650', ambientStrength: 0.85, cloudLit: '#ffe0b0', cloudShade: '#d8a0a0', stars: 0 },
          { hour: 8,  name: 'day',     sky: '#bfe8e4', skyTop: '#3fb0c8', light: '#fffaf0', lightStrength: 1.9,  ambientSky: '#ffffff', ambientGround: '#8a8a70', ambientStrength: 1.25, cloudLit: '#ffffff', cloudShade: '#b8d4d8', stars: 0 },
          { hour: 18, name: 'day',     sky: '#bfe8e4', skyTop: '#3fb0c8', light: '#fffaf0', lightStrength: 1.9,  ambientSky: '#ffffff', ambientGround: '#8a8a70', ambientStrength: 1.25, cloudLit: '#ffffff', cloudShade: '#b8d4d8', stars: 0 },
          { hour: 19.5, name: 'sunset', sky: '#f0a878', skyTop: '#3a7a9a', light: '#ffaa66', lightStrength: 1.0, ambientSky: '#ffcca0', ambientGround: '#5a4a3a', ambientStrength: 0.8,  cloudLit: '#ffc880', cloudShade: '#c87890', stars: 0 },
          { hour: 21, name: 'dusk',    sky: '#2e4a5e', skyTop: '#0e1e30', light: '#8ab0c8', lightStrength: 0.45, ambientSky: '#4a6a80', ambientGround: '#161c20', ambientStrength: 0.5,  cloudLit: '#5a7890', cloudShade: '#1e2c3a', stars: 0.6 },
          { hour: 22, name: 'night',   sky: '#0c1e26', skyTop: '#030a10', light: '#8fc4d8', lightStrength: 0.45, ambientSky: '#2e5a6a', ambientGround: '#10181a', ambientStrength: 0.5,  cloudLit: '#24404a', cloudShade: '#0e1c22', stars: 1 },
        ],
        clouds: { coverage: 0.3 }, // fewer clouds, so the black hole and ringed planet show

        // A big ringed planet, low in the south-east sky (see skyPlanets below).
        skyPlanets: [
          {
            direction: 150,  // compass degrees: 0 = north (where the black hole is), 90 = east, 180 = south
            height: 24,      // degrees above the horizon
            size: 8,         // degrees across the ball (the ring reaches about twice as far)
            bands: ['#e3c49a', '#d2a77c', '#ecd6b2', '#c8966c'], // stripes, repeating from pole to pole
            nightSide: '#141522',  // the side facing away from the sun
            atmosphere: '#cfeaff', // the thin glow around its edge
            ring: '#efe6d2',       // the ring
            ringDark: '#a99c86',   // the ring's inner edge
            ringTilt: -18,         // degrees the ring is tipped
            ringOpen: 0.28,        // how open the ring looks (0 = edge-on line, 1 = a full circle)
            dayHaze: 0.4,          // how much of the sky's light shows in it by day (0 = none, 1 = its dark side vanishes)...
            nightHaze: 0.06,       // ...and at night
            // It's lit by the big sun, wherever that is, so the lit side moves through the day.
          },
        ],

        textures: {
          sand: {          // pale, almost white sand
            base: ['#f4eedc', '#ede5cf', '#f8f3e6'],
            ripple: '#ddd2b6',
            speckDark: '#cbbf9f',
            speckLight: '#ffffff',
          },
        },
        // The closest planet: the black hole looks biggest from here.
        blackHole: { size: 14 }, // black centre 28 degrees across, 35 with its ring

        ui: { '--page-bg': '#bfe8e4' },
      },
    },
    lava: {
      name: 'Lava planet',
      description: 'Black glass hills split by glowing cracks, under a dark red sky.',
      timeSlip: 10,
      color: '#c0582a',
      seed: 4242,
      changes: {
        // Rugged hills of black glass, split by glowing orange cracks.
        terrain: {
          baseHeight: 46,
          hillHeight: 13,   // steeper, craggier hills than home
          caves: false,
          spawnOn: 'black glass',
          blocks: { surface: 'black glass', underSurface: 'black glass', rock: 'black glass' },
          sand: { threshold: 99 }, // no sand
          cracks: {
            scale: 0.035,   // smaller = longer, straighter cracks, further apart
            width: 0.07,    // bigger = wider cracks
            depth: 3,       // how many blocks down the glow goes (shows in cliff sides)
          },
        },
        trees: { chance: 0 },

        // Dark red sky, never really blue. Same hours as home's keyframes.
        // Nights aren't pitch black: a dim red glow from the sky above and the
        // cracks below (ambientSky / ambientGround) keeps the hills visible.
        skyKeyframes: [
          { hour: 4,  name: 'night',   sky: '#2a0c08', skyTop: '#080202', light: '#ff8a5a', lightStrength: 0.6,  ambientSky: '#b0503a', ambientGround: '#6a2414', ambientStrength: 1.1,   cloudLit: '#3a1410', cloudShade: '#120606', stars: 0.8 },
          { hour: 5,  name: 'dawn',    sky: '#3a1410', skyTop: '#140606', light: '#ff8a5a', lightStrength: 0.6,  ambientSky: '#a04432', ambientGround: '#5a2012', ambientStrength: 0.95, cloudLit: '#6a2a1a', cloudShade: '#200a08', stars: 0.4 },
          { hour: 6,  name: 'sunrise', sky: '#8a2e18', skyTop: '#3a1010', light: '#ffa060', lightStrength: 0.9,  ambientSky: '#c06040', ambientGround: '#3a1a10', ambientStrength: 0.75, cloudLit: '#c0582a', cloudShade: '#4a1810', stars: 0 },
          { hour: 8,  name: 'day',     sky: '#7a2a1c', skyTop: '#3c0e0c', light: '#ffd0a0', lightStrength: 1.5,  ambientSky: '#ffb090', ambientGround: '#4a2018', ambientStrength: 1.0,  cloudLit: '#a04a30', cloudShade: '#4a1a14', stars: 0 },
          { hour: 18, name: 'day',     sky: '#7a2a1c', skyTop: '#3c0e0c', light: '#ffd0a0', lightStrength: 1.5,  ambientSky: '#ffb090', ambientGround: '#4a2018', ambientStrength: 1.0,  cloudLit: '#a04a30', cloudShade: '#4a1a14', stars: 0 },
          { hour: 19.5, name: 'sunset', sky: '#9a3418', skyTop: '#2a0a0a', light: '#ff8040', lightStrength: 0.9, ambientSky: '#d06a40', ambientGround: '#3a1810', ambientStrength: 0.75, cloudLit: '#d06030', cloudShade: '#501a12', stars: 0 },
          { hour: 21, name: 'dusk',    sky: '#3a0e0a', skyTop: '#100404', light: '#ff7a4a', lightStrength: 0.6,  ambientSky: '#a04432', ambientGround: '#5a2012', ambientStrength: 1.0,  cloudLit: '#4a1a12', cloudShade: '#160606', stars: 0.6 },
          { hour: 22, name: 'night',   sky: '#2a0c08', skyTop: '#080202', light: '#ff8a5a', lightStrength: 0.6,  ambientSky: '#b0503a', ambientGround: '#6a2414', ambientStrength: 1.1,   cloudLit: '#3a1410', cloudShade: '#120606', stars: 0.8 },
        ],
        clouds: { coverage: 0.6 }, // smoky

        // The cracks cast a dim red-orange glow over the black glass around them.
        glowLight: { strength: 0.8 },

        // Closer than home, further than the water world: a medium-sized black hole.
        blackHole: { size: 9 }, // black centre 18 degrees across, 22 with its ring

        ui: { '--page-bg': '#3a0e0a' },
      },
    },
  },

  // ---- Terrain shape (logic in terrain.js) ----
  // These are home's settings. Other planets change some of them (see planets above).
  terrain: {
    baseHeight: 48,   // average ground level (world is 96 tall)
    hillHeight: 8,    // how far hills rise/fall from the average
    dirtDepth: 3,     // dirt layers under the grass
    caves: true,      // false = no tunnels, caverns, sinkholes or hillside entrances
    spawnOn: 'grass', // block name (blocks.js) you start the game standing on

    // Which blocks (names from blocks.js) the ground is made of.
    blocks: {
      surface: 'grass',      // the top block
      underSurface: 'dirt',  // the next dirtDepth blocks down
      rock: 'stone',         // everything deeper (and under sand)
    },

    // Glowing cracks running across the ground (null = none). Each planet with
    // cracks sets: scale (smaller = longer cracks, further apart), width, and
    // depth (how many blocks down the glow goes).
    cracks: null,

    // Sea: every gap between the ground and this height is filled with water.
    // 0 = no sea at all.
    seaLevel: 0,
    // How deep the sea gets, in blocks. Deeper ground is raised up to this,
    // so the sea stays shallow. The sea gets deeper slowly away from the shore:
    // about 1 block deeper for every 4 blocks the ground would have dropped.
    maxSeaDepth: 3,

    // Sand: patches of sand form in low-lying ground (hollows and valleys),
    // like dried-up ponds. A column is sand if it's low enough AND its "sand
    // noise" (a seeded pattern of blobs) plus a bonus for being extra low is high enough.
    sand: {
      maxHeight: 45,      // ground must be at or below this height
      patchScale: 0.06,   // smaller = bigger, smoother patches
      threshold: 0.15,    // -1 to 1. Bigger = fewer, smaller patches; -1 = every low spot
      lowlandBonus: 0.12, // each block lower than maxHeight makes sand this much more likely
      depth: 3,           // sand layers, counting the top one. Stone underneath.
    },
  },

  // ---- Sky, haze and light through the day ----
  // The game clock runs 0:00 -> 24:00 (one full day takes about 6 real minutes).
  // Each keyframe is a snapshot of the sky at a certain hour. The game blends
  // smoothly between the keyframes on either side of the current time.
  //
  //   sky:           sky colour at the horizon. Distant land fades into it (the haze).
  //   skyTop:        sky colour straight overhead (the sky fades between the two)
  //   light:         colour of the big sun's light by day, or starlight by night
  //   lightStrength: how bright that light is
  //   ambientSky:    soft light coming from above
  //   ambientGround: soft light bouncing up from below (shades the undersides)
  //   ambientStrength: how bright the soft light is
  //   cloudLit:      colour of the sunny side of the clouds
  //   cloudShade:    colour of the shaded side of the clouds
  //   stars:         0 = no stars, 1 = fully visible stars
  skyKeyframes: [
    { hour: 4,  name: 'night',   sky: '#121a30', skyTop: '#04060e', light: '#8fa6d8', lightStrength: 0.45, ambientSky: '#3a4a78', ambientGround: '#16161c', ambientStrength: 0.45, cloudLit: '#2a3150', cloudShade: '#121626', stars: 1 },
    { hour: 5,  name: 'dawn',    sky: '#6e5a7e', skyTop: '#232448', light: '#c49ac0', lightStrength: 0.5,  ambientSky: '#7a6a9a', ambientGround: '#2a2428', ambientStrength: 0.55, cloudLit: '#c49ab4', cloudShade: '#4a3a5a', stars: 0.5 },
    { hour: 6,  name: 'sunrise', sky: '#f0b484', skyTop: '#6c8cb4', light: '#ffc58a', lightStrength: 1.0,  ambientSky: '#ffd9b0', ambientGround: '#5a4a3a', ambientStrength: 0.85, cloudLit: '#ffd08a', cloudShade: '#e8899a', stars: 0 },
    { hour: 8,  name: 'day',     sky: '#c3d6d6', skyTop: '#5f9cc6', light: '#fff8ea', lightStrength: 1.8,  ambientSky: '#ffffff', ambientGround: '#6a6458', ambientStrength: 1.2,  cloudLit: '#ffffff', cloudShade: '#b4c2d0', stars: 0 },
    { hour: 18, name: 'day',     sky: '#c3d6d6', skyTop: '#5f9cc6', light: '#fff8ea', lightStrength: 1.8,  ambientSky: '#ffffff', ambientGround: '#6a6458', ambientStrength: 1.2,  cloudLit: '#ffffff', cloudShade: '#b4c2d0', stars: 0 },
    { hour: 19.5, name: 'sunset', sky: '#ec9662', skyTop: '#4e5888', light: '#ff9a50', lightStrength: 1.0, ambientSky: '#ffbf8f', ambientGround: '#4f3f32', ambientStrength: 0.8,  cloudLit: '#ffbe6a', cloudShade: '#d66e8a', stars: 0 },
    { hour: 21, name: 'dusk',    sky: '#4c3f66', skyTop: '#16162e', light: '#9b8bc8', lightStrength: 0.45, ambientSky: '#5a5080', ambientGround: '#1e1a22', ambientStrength: 0.5,  cloudLit: '#8c6c9e', cloudShade: '#2e2440', stars: 0.6 },
    { hour: 22, name: 'night',   sky: '#121a30', skyTop: '#04060e', light: '#8fa6d8', lightStrength: 0.45, ambientSky: '#3a4a78', ambientGround: '#16161c', ambientStrength: 0.45, cloudLit: '#2a3150', cloudShade: '#121626', stars: 1 },
  ],

  // Distance haze: how far-away land fades into the horizon sky colour.
  // Where it starts and ends depends on the draw distance, so those numbers
  // live with each graphics level below (graphics.levels.*.haze).
  haze: {
    curve: 1,    // 1 = fades evenly. Bigger = stays clear longer, then fades quickly.
  },

  // ---- Graphics quality (pause screen: Auto / Low / Medium / High) ----
  // Logic in graphics.js. The player's choice is saved in the browser.
  // "Auto" (the default) starts on High and steps down a level if the game
  // keeps stuttering, then remembers the level that worked for next time.
  graphics: {
    // Auto mode steps down a level when, out of the last `outOf` readings of
    // the FPS box's "Slowest" number (one reading every half second), at
    // least `badReadings` are over `slowestMs`. At 60 FPS a smooth frame
    // takes about 16.7 ms, and one skipped frame shows up as about 33 ms.
    auto: {
      slowestMs: 20,
      badReadings: 4,
      outOf: 6,            // 6 readings = 3 seconds
      warmupSeconds: 5,    // seconds of play to ignore at the start (the world is still loading)
      settleSeconds: 5,    // seconds to wait after a change before judging again
      ignoreOverMs: 250,   // ignore readings with one huge frame (e.g. switching browser tabs)
    },

    // What each level does:
    //   pixelRatio:    max pixels drawn per screen pixel. Sharp ("Retina") screens
    //                  are 2; 1 draws a quarter as many pixels there. Plain
    //                  screens are already 1, so this changes nothing on them.
    //   drawRadius:    draw distance, in chunks (16 blocks each)
    //   haze:          [start, end] of the distance haze, in blocks. `end` must
    //                  stay about 2 blocks under drawRadius x 16, so the edge
    //                  of the world stays hidden.
    //   chunkBudgetMs: max time per frame spent building new chunks. Smaller =
    //                  smoother, but new land appears a little more slowly.
    //   starLayers:    2 = lots of faint stars + bright ones, 1 = bright ones only
    //   galaxy:        'full' or 'simple' (less detail in the galaxy band's clouds)
    //   clouds:        'full' or 'simple' (same shapes, simpler lighting)
    //   blackHole:     'full' or 'simple' (smoother, less churning gas)
    //   antialias:     smooth jagged edges. Only changes when the page is reloaded.
    //   mobScale:      how many creatures can be around at once, times each
    //                  creature's own limit in mobTypes.js (1 = the full amount)
    //   glowLights:    how many glowing creatures (the nearest ones) really light
    //                  up the blocks around them. Each one costs a little on every
    //                  pixel of land, so lower levels use fewer. The soft glow
    //                  around every glowing creature is always there.
    levels: {
      high:   { pixelRatio: 2,   drawRadius: 5, haze: [45, 78], chunkBudgetMs: 4, starLayers: 2, galaxy: 'full',   clouds: 'full',   blackHole: 'full',   antialias: true,  mobScale: 1,    glowLights: 2 },
      medium: { pixelRatio: 1.5, drawRadius: 4, haze: [36, 62], chunkBudgetMs: 3, starLayers: 2, galaxy: 'simple', clouds: 'full',   blackHole: 'full',   antialias: true,  mobScale: 0.75, glowLights: 1 },
      low:    { pixelRatio: 1,   drawRadius: 3, haze: [27, 46], chunkBudgetMs: 2, starLayers: 1, galaxy: 'simple', clouds: 'simple', blackHole: 'simple', antialias: false, mobScale: 0.5,  glowLights: 0 },
    },
  },

  // Soft painted clouds, drawn into the sky (sky.js). Their colours come from
  // cloudLit / cloudShade in the keyframes above.
  clouds: {
    coverage: 0.5,             // 0 = clear sky, 1 = almost overcast
    size: 1.5,                 // bigger = bigger, puffier clouds
    softness: 0.18,            // how soft their edges are (small = crisp)
    thinOverhead: 0.3,         // how much thinner they are straight overhead than near the horizon
    driftSpeed: 0.02,          // how fast they drift across the sky (0 = still)
    driftDirection: 70,        // which way they drift, in compass degrees
    atNight: 0.3,              // how much cloud shows at night (0 = none, 1 = same as day),
                               // kept low so the stars and galaxy still show
    blackHolePull: 1.2,        // how strongly the black hole twists them into streaks (0 = not at all)
  },

  // ---- Things in the sky (drawn in sky.js) ----
  // Other planets hanging in the sky. Home has none; each planet can list its
  // own in THEME.planets (see the water world for every setting).
  skyPlanets: [],

  // The two suns rise and set together. The first one is the big one that
  // lights the world; the second trails a little behind on a slightly
  // different path, so it sets a moment later.
  suns: [
    {
      size: 40,                // how big it looks (the old sun was 40)
      core: '#fff4d6',         // middle of the disc
      rim: '#ffd27a',          // outer ring of the disc
      glow: '#ffe2a0',         // soft halo around it
      lag: 0,                  // how far behind the big sun it travels (0 = it IS the big sun)
      tilt: 0,                 // pushes its path a little north (+) or south (-)
    },
    {
      size: 20,
      core: '#f2f8ff',
      rim: '#a9cfff',
      glow: '#bcd8ff',
      lag: 0.16,               // about 9 degrees behind
      tilt: 0.12,
    },
  ],
  // The black hole every planet orbits, drawn into the sky in sky.js.
  // It looks like a hole: a big sharp-edged black centre with only a thin
  // fiery ring hugging its edge (swirling gas, seen almost face-on, white-hot
  // inside and dark red outside). Stars and the galaxy band are bent around
  // it, with a faint beaded ring of bent starlight just outside the fire. By
  // day the sky around it darkens, as if it's swallowing the daylight. It
  // sits high in the northern sky; at night the stars wheel around it.
  // It looks the same from every planet, just bigger from closer ones:
  // each planet only sets its `size` (and maybe `brightness`) in THEME.planets.
  blackHole: {
    height: 40,                // degrees above the horizon
    viewAngle: 80,             // how far above the whirlpool we see it from
                               // (90 = straight down on it, 0 = edge-on). Near face-on,
                               // so the thin ring shows all the way round.
    tilt: 15,                  // degrees the whirlpool is turned on the sky
    swirlSize: 1.25,           // outer edge of the fiery ring, in hole radii (1.25 = the
                               // black centre is about 80% of the width)
    swirlFadeStart: 0.9,       // the ring fades out from this share of swirlSize to its edge
                               // (bigger = it stays bright further out, then stops sooner)
    edgeSoftness: 0.05,        // how blurry the hole's edge is, in hole radii (small = sharp edge)
    gasFadeIn: [1.02, 1.05],   // the gas fades in between these distances (in hole radii):
                               // right at the edge, so there's no gap and no gas over the black.
                               // Starting below 1 = on the near side it spills over the
                               // hole's edge, covering part of the black.
    armCount: 3,               // number of spiral arms
    armTwist: 1.6,             // how tightly the arms wind (bigger = more coiled)
    turbulence: 0.9,           // how ragged and churning the arms are (0 = smooth)
    swirlSpeed: 0.6,           // how fast it turns (bigger = faster, 0 = still)
    inflowSpeed: 0.35,         // how fast clumps of gas get sucked inwards
    shadow: '#000000',         // the hole
    gasOuter: '#5e0f08',       // dark red at the outside
    gasMiddle: '#ff5a14',      // orange in the middle
    gasInner: '#fff1d6',       // white-hot where it falls in
    glow: '#ff6a2a',           // soft glow spreading into the sky
    nightBoost: 0.6,           // how much brighter the gas and glow get at night (0 = same as day)
    dayDarkening: 0.7,         // by day, how much the sky around it darkens (0 = not at all)
    dayDarkColor: '#1e0e16',   // the colour that patch of sky darkens towards
    bendStrength: 1.7,         // how strongly it bends the light of stars behind it. The faint
                               // ring of bent starlight sits at the square root of this, in
                               // hole radii (1.7 = just outside the fiery ring).
    brightness: 1.8,           // 1 = normal, higher = more blazing
    glowAmount: 0.03,          // how strongly its glow tints the sky around it (0 = none).
                               // The glow grows with `size`: keep it low, or a big black
                               // hole turns the whole night sky red.

    // How it looks from home, the farthest planet: the smallest view (the
    // black centre is about 10 degrees across, 13 with its ring). Closer
    // planets set a bigger size in THEME.planets.
    size: 5.2,                 // radius of the black centre, in degrees of sky. The ring
                               // reaches swirlSize times further.
  },
  // Night sky (drawn into the sky in sky.js). Stars fade in through dusk.
  starfield: {
    color: '#ffffff',
    density: 1,                // 1 = normal, 2 = twice as many stars, 0.5 = half
    galaxyBand: 0.35,          // brightness of the faint galaxy band (0 = none)
    galaxyColor: '#cfc4ee',
    galaxyWidth: 0.12,         // how wide the band is (0.1 = narrow, 0.3 = wide)
    galaxyTilt: 30,            // degrees the band is tipped as it passes the black hole
  },

  // ---- Easter egg: curved world (press B in game, see curve.js) ----
  // Draws the world as if you're inside a giant spinning cylinder.
  // Only the drawing bends; walking, building and saving stay flat.
  curve: {
    startsOn: false,      // true = curved when the game starts (B still toggles it)
    // The ground near you stays flat, then curves up more and more with distance.
    flatZone: 0,          // blocks around you that stay completely flat
    curveRamp: 0,         // blocks over which the curve grows from nothing to full strength
    curveRadius: 75,      // how tight the full-strength curve is (smaller = more dramatic)
    curveGroundLevel: 48, // the height that sits exactly on the curved ground line
                          // (average ground level, see terrain.baseHeight above)
  },

  // ---- Creatures (shapes and behaviour in mobTypes.js, logic in mobs.js) ----
  // Each creature's parts use these colour names (see `color:` in mobTypes.js).
  mobs: {
    hitFlash: '#fff4ea',     // colour a creature flashes when you hit it (pale, so it shows on any colour)
    underCover: 0.45,        // how dark creatures look with no open sky above (1 = not darker)
    grazer: {                // chunky six-legged herbivore of the golden meadows
      body: '#b5562b',       // rusty orange
      belly: '#d98a52',
      plates: '#2f7a6a',     // teal plates along its back
      legs: '#6e3320',
      head: '#a24a24',
      snout: '#c97a4e',
      stalks: '#6e3320',     // the stalks its eyes sit on
      eyes: '#141018',
    },
    glowCritter: {           // small, shy night creature with glowing antennae
      body: '#3a3263',       // dusky violet fur
      legs: '#221c3c',
      antennae: '#3a3263',
      eyes: '#0a0812',       // big dark eyes...
      shine: '#e8fff8',      // ...with a tiny glint (glows)
      glow: '#7ff5d8',       // antenna tips, belly and tail tip (these glow)
      light: '#a6ece0',      // colour of the light it casts, its halo and the pool of light under it
    },
    kevin: {                 // the player's robot companion (kevin.js), brushed blue-grey metal
      body: '#7d8ea3',
      panel: '#4b5868',      // the panel on his chest
      belt: '#3c4552',       // hips and neck
      legs: '#5f6d7e',
      arms: '#6c7b8d',
      head: '#8a9bb0',       // the TV box
      bezel: '#1e232b',      // dark frame round the screen
      rivet: '#c9d3de',      // rivets and the knobs on the side of his head
      antenna: '#3c4552',
      tip: '#ff6b4a',        // glowing antenna tip
      buildSparkle: '#8affd0', // the beam and sparkle when he places a block (kevinBuild.js)
      ghostGood: '#8affd0',  // see-through preview of a build, where it can go (kevinGhost.js)
      ghostBad: '#ff5a4a',   // ...and where it can't
      // His face (kevinFace.js). The screen always shines, even at night.
      screenBg: '#0b2320',   // dark green-black screen
      screenLines: '#0f2b27', // faint TV lines across it
      screenPixel: '#8affd0', // his eyes and mouth
      screenAngry: '#ffb04a', // eyes and mouth when he's annoyed
    },
  },

  // ---- The spaceship (shape in ship.js) ----
  // A stubby old explorer rocket that's seen a lot of travel: cream body with
  // a red band and fins, a rust band, a mismatched replacement panel, and
  // scorch marks round the engine. Parts marked "glows" in ship.js (window
  // band, porthole, engine, door lights, nose light) shine at night.
  ship: {
    hull: '#d8cfb6',       // cream body
    band: '#b8402c',       // red band near the top, and the fins
    rust: '#8f4a26',       // rust band near the bottom, and rust spots
    patch: '#7f9a86',      // a replacement panel that doesn't match
    scorch: '#3a332c',     // burnt metal round the bottom
    metal: '#55585e',      // nose tip, porthole rim, ramp
    legs: '#5f6268',       // landing legs
    feet: '#33353a',       // landing pads
    engineBell: '#2a2b30', // the dark engine bell
    door: '#2e3136',
    window: '#7ff5e8',     // glowing window band and porthole (glows)
    engine: '#ffa040',     // glowing engine nozzle (glows)
    light: '#ffe9a0',      // lights by the door (glow)
    beacon: '#ff4a3a',     // blinking light on the nose (glows)
    flame: '#ff7a20',      // engine flame during takeoff and landing
    flameCore: '#fff0b0',  // its white-hot middle
    smoke: '#d8d2c6',      // smoke and dust puffs at the base
  },

  // ---- Item pictures (see itemIcons.js for the patterns) ----
  // Lists like base: [...] are picked from at random, pixel by pixel.
  items: {
    grazerFleece: {          // a fluffy tuft, the same rusty orange as the grazer
      base: ['#bf5f33', '#c9693b', '#b5562b', '#c46536'],
      light: '#f0b07a',      // lit tops of the puffs
      dark: '#7c3419',       // shadowed undersides and creases
      outline: '#3a170b',
    },
    glowDust: {              // a little heap of glittering teal dust
      base: ['#4fcfb4', '#5ad9be', '#46c1a8', '#62e0c6'],
      light: '#a8fff0',
      dark: '#2a8a7a',
      sparkle: '#f2fffb',
      outline: '#123d38',
    },
  },

  // ---- In the world ----
  blockOutline: '#000000', // box around the block you're aiming at

  // How dark caves get where no sunlight reaches. Blocks are tinted from this
  // colour (no light at all) up to full brightness (open sky). An alien theme
  // could make this a faint glow, e.g. '#183020'.
  caveLight: '#2e2a30',

  // Warm light that spills from glowing blocks (ember cracks, glow lamps) onto
  // the blocks around them, even in the open and at night. Logic in chunkMesh.js.
  //   strength: 0 = off (home), bigger = brighter
  //   reach:    how many blocks away it fades to nothing
  glowLight: { color: '#ff7a3a', strength: 0, reach: 6 },

  // How see-through water is (0 = invisible, 1 = solid colour).
  waterOpacity: 0.7,

  // With your head under water, the view turns this colour and fades out
  // after `distance` blocks. It gets darker at night along with the light.
  underwater: { color: '#1d8f88', distance: 14 },

  // Ambient occlusion: corners and edges where blocks meet get slightly
  // darker, like real soft shadows. 0 = off, 0.5 = strong.
  ambientOcclusion: 0.35,

  // ---- Trees: shape and placement (logic in trees.js) ----
  // Colours come from the trunk/leaf blocks' textures below. For alien trees,
  // change the numbers here, or point trunkBlock/leafBlock at other blocks.
  trees: {
    chance: 0.45,          // how many possible spots get a tree (0 = none, 1 = as many as fit)
    spacing: 3,            // extra room between trees (bigger = more spread out)
    trunkBlock: 'wood',    // block names from blocks.js
    leafBlock: 'leaves',
    trunkHeight: [7, 9],   // random between these (inclusive)
    // Leaf layers, measured from the top block of the trunk (y: 0).
    // radius 3 = 7 blocks across, 2 = 5, 1 = 3, 0 = a single block.
    // Gaps between the y values leave bare trunk showing: a tiered "pagoda" tree.
    canopy: [
      { y: -4, radius: 3 },  // wide bottom tier
      { y: -2, radius: 2 },  // middle tier
      { y: 0, radius: 1 },   // small top tier
      { y: 1, radius: 0 },   // tip
    ],
    roundLayers: true,     // true = round tiers, false = square
  },

  // ---- Block textures (see textures.js for the patterns) ----
  // Lists like base: [...] are picked from at random, pixel by pixel.
  // Keep each list the same length if you want the same pattern with new colours.
  textures: {
    dirt: {                // reddish clay soil in horizontal layers
      base: ['#8f4e36', '#9a5840', '#844630', '#94533a'],
      band: '#6e3a28',     // darker layer lines
      bandLight: '#a8664a',// thin lighter line just above each layer
      pebble: '#c08a68',
      pebbleDark: '#5e3022',
    },
    grassTop: {            // golden meadow, seen from above
      base: ['#a3ad4c', '#98a344', '#acb656', '#9aa648'],
      tuft: '#c2ca66',     // lit tip of each little tuft
      tuftShadow: '#7f8a36',
      flower: ['#e8c95a', '#f2e6b0'],
    },
    grassSide: {           // the whole side is a thick mat of moss and roots (no soil showing)
      edge: '#acb656',     // top row, where the meadow top meets the side
      base: ['#7c8a3a', '#71802f', '#86943f'],
      streak: '#5f6c28',   // darker vertical fibres
      root: '#5e5a2c',     // tangled roots near the bottom
    },
    stone: {               // warm layered rock
      base: ['#9b8d7b', '#a59784', '#8f8170', '#a09280'],
      layer: '#85776a',    // bedding lines running across
      layerLight: '#b3a592',
      crack: '#6f6356',
      fleck: '#b8ab98',
    },
    woodSide: {            // red-brown bark with rings around the trunk
      base: ['#7a3e2a', '#743a27', '#80442e'],
      ring: '#5e2e20',
      ringLight: '#94543a',
      knot: '#4a2418',
    },
    woodTop: {             // cut log end
      bark: ['#5e2e20', '#6a3424'],
      ringLight: '#c48a5e',
      ringDark: '#a8704a',
      heart: '#8a5236',
    },
    leaves: {              // deep teal-green needle clusters
      shadow: ['#1f4a37', '#23513c'],
      needle: ['#2f6b4f', '#3a7a5a'],
      lit: '#4a8c68',      // needle tips catching the light
    },
    sand: {
      base: ['#e8dcb8', '#dfd2ac', '#ece2c2'],
      ripple: '#d2c49e',
      speckDark: '#c2b28a',
      speckLight: '#f6eed6',
    },
    planks: {
      board: '#a8643f',    // each board is this, made slightly lighter or darker
      seam: '#5a2e1c',     // dark line between boards
      joint: '#6e3a24',    // where two boards meet end to end
    },
    core: {                // unbreakable rock at the bottom of the world
      base: ['#2e2a2a', '#34302f', '#292626', '#383332'],
      vein: '#4d4542',     // pale streaks running across it
      speck: '#1c1a19',
    },
    // ---- Crafted-only blocks ----
    stoneBricks: {
      base: ['#a69884', '#9f917d', '#ad9f8a'],
      highlight: '#bcae98', // top row of each brick
      mortar: '#6a5e52',    // lines between bricks
      chip: '#8a7d6c',
    },
    glowLamp: {
      frame: '#4a2a1c',     // outer edge
      frameLight: '#7a4a30',// inner edge and the cross between panes
      glow: ['#ffcc5a', '#ffd46e', '#f7c050'],
      core: '#fff1b8',      // brightest middle
    },
    glass: {
      frame: '#eae4d4',     // top and left edges
      frameShade: '#bcb39c',// bottom and right edges
      shine: '#fffaf0',     // streaks of reflection (the rest of the pane is see-through)
    },
    felt: {                // pressed grazer fleece: soft rusty-orange quilted panels
      base: ['#a9532b', '#b0592f', '#a4502a', '#b35c32'],
      fiberLight: '#c3703f',// fuzzy fibres
      fiberDark: '#8e4320',
      seam: '#7a3517',      // top and left edges of each panel
      seamShade: '#62290f', // bottom and right edges
      stitch: '#ecc596',    // the ring of pale stitches
    },
    // ---- Lava planet blocks ----
    blackGlass: {          // glassy black rock with a faint purple sheen
      base: ['#36303e', '#3c3644', '#322c3a', '#403a48'],
      sheen: '#5a5068',    // soft diagonal streaks of reflection
      glint: '#b0a0d0',    // a few bright sparkles
    },
    emberCrack: {          // molten rock glowing up through the cracks (always lit, even at night)
      glow: ['#ff7a1e', '#f26a16', '#ff8a2a'], // the orange glow
      edge: '#b8380e',     // cooler dark red swirls
      core: '#ffd36a',     // white-hot spots
      crust: ['#1a1418', '#2a1a16'], // flakes of black crust floating on it
    },
    // ---- Water (only on planets with a sea) ----
    water: {               // shallow teal sea with soft ripples (how see-through: waterOpacity)
      base: ['#2fb3a6', '#33bbad', '#2aa99d', '#36c0b2'],
      ripple: '#6fe0d2',   // lighter wavy lines
      deep: '#23978c',     // darker patches between ripples
    },
  },

  // ---- Interface (pause screen, FPS box, hotbar...) ----
  // These become CSS variables (e.g. var(--panel-bg)) when the game starts.
  ui: {
    '--page-bg': '#9fc0d0',                      // behind everything while the game loads
    '--text': '#ffffff',
    '--overlay-bg': 'rgba(0, 0, 0, 0.5)',        // dims the screen when paused
    '--panel-bg': 'rgba(0, 0, 0, 0.5)',          // FPS box and "Saved" message
    '--crosshair': '#ffffff',
    '--crosshair-shadow': '#000000',
    '--button-bg': 'rgba(160, 40, 40, 0.85)',    // "Reset world" button
    '--button-bg-hover': 'rgba(190, 50, 50, 0.95)',
    '--button-border': 'rgba(255, 255, 255, 0.4)',
    '--choice-bg': 'rgba(255, 255, 255, 0.1)',          // Graphics buttons on the pause screen
    '--choice-bg-hover': 'rgba(255, 255, 255, 0.22)',
    '--choice-selected-bg': 'rgba(255, 255, 255, 0.85)', // the one that's switched on
    '--choice-selected-text': '#1a1a1a',
    '--notice-bg': 'rgba(0, 0, 0, 0.6)',                 // "Graphics lowered..." message

    '--hotbar-text': '#ffffff',
    '--hotbar-bg': 'rgba(0, 0, 0, 0.45)',
    '--hotbar-border': 'rgba(255, 255, 255, 0.3)',
    '--hotbar-selected-bg': 'rgba(255, 255, 255, 0.12)',
    '--hotbar-selected-border': '#ffffff',
    '--hotbar-selected-glow': '0 0 10px rgba(255, 255, 255, 0.55)',
    '--hotbar-name-bg': 'rgba(0, 0, 0, 0.55)',
    '--hotbar-count-shadow': '1px 1px 0 #000000', // outline so counts are readable on any block

    '--creative-badge-bg': 'rgba(240, 180, 40, 0.9)', // "CREATIVE" label at the top of the screen
    '--creative-badge-text': '#2a1c00',

    '--inv-backdrop': 'rgba(0, 0, 0, 0.45)',      // dims the game behind the inventory
    '--inv-panel-bg': 'rgba(24, 26, 32, 0.92)',
    '--inv-panel-border': 'rgba(255, 255, 255, 0.25)',
    '--inv-title': '#ffffff',
    '--inv-slot-bg': 'rgba(255, 255, 255, 0.06)',
    '--inv-slot-border': 'rgba(255, 255, 255, 0.18)',
    '--inv-slot-hover': 'rgba(255, 255, 255, 0.16)',
    '--inv-slot-selected-border': '#ffffff',      // the hotbar slot in your hand

    '--recipe-bg': 'rgba(255, 255, 255, 0.04)',   // recipe you can't craft yet (also faded)
    '--recipe-border': 'rgba(255, 255, 255, 0.12)',
    '--recipe-ready-bg': 'rgba(120, 200, 120, 0.14)', // recipe you can craft
    '--recipe-ready-border': 'rgba(140, 220, 140, 0.6)',
    '--recipe-hover-bg': 'rgba(120, 200, 120, 0.28)',
    '--recipe-missing-text': '#ff8a7a',           // ingredient you don't have enough of

    '--kevin-tag-text': '#ffffff',                // Kevin's floating name tag
    '--kevin-tag-bg': 'rgba(0, 0, 0, 0.5)',       // dark behind the text, so it reads by day and night
    '--kevin-tag-border': 'rgba(138, 255, 208, 0.55)', // a hint of his screen green
    '--kevin-tag-shadow': '1px 1px 0 #000000',
    '--kevin-bubble-bg': 'rgba(12, 20, 24, 0.85)', // Kevin's speech bubble
    '--kevin-bubble-text': '#ffffff',
    '--kevin-bubble-name': '#8affd0',             // his name on top of the bubble (screen green)
    '--kevin-bubble-border': 'rgba(138, 255, 208, 0.45)',
    '--kevin-caption-bg': 'rgba(0, 0, 0, 0.6)',  // his line at the bottom of the screen when he's out of sight
    '--kevin-caption-text': '#ffffff',
    '--kevin-caption-name': '#8affd0',
    '--kevin-chat-bg': 'rgba(12, 20, 24, 0.88)',  // the chat box (press Enter)
    '--kevin-chat-border': 'rgba(138, 255, 208, 0.45)',
    '--kevin-chat-input-bg': 'rgba(255, 255, 255, 0.08)',
    '--kevin-chat-you': '#ffd27a',                // "You:" in the chat
    '--kevin-chat-kevin': '#8affd0',              // his name in the chat
    '--kevin-rename-bg': 'rgba(24, 26, 32, 0.92)', // the "Rename your robot" box (press N)
    '--kevin-rename-border': 'rgba(138, 255, 208, 0.45)',
    '--kevin-rename-input-bg': 'rgba(255, 255, 255, 0.08)',
    '--kevin-pick-ring': '#8affd0',               // the "hold steady" ring by the crosshair (kevinGhost.js)
    '--kevin-pick-ring-bad': '#ff6b5a',           // ...when the spot won't work
    '--kevin-pick-track': 'rgba(255, 255, 255, 0.25)',
    '--kevin-pick-text': '#ffffff',

    '--ship-hint-bg': 'rgba(0, 0, 0, 0.55)',      // "Press R to board" near the ship's ramp
    '--ship-hint-text': '#ffffff',
    '--ship-hint-key': '#7ff5e8',                 // the R (the ship's window colour)
    '--picker-card-bg': 'rgba(255, 255, 255, 0.06)', // a planet card in the ship's planet picker
    '--picker-card-border': 'rgba(255, 255, 255, 0.2)',
    '--picker-card-hover': 'rgba(255, 255, 255, 0.16)',
    '--picker-card-hover-border': '#7ff5e8',
    '--picker-slip-text': '#ffd27a',              // the time slip line
    '--picker-here-text': '#8affd0',              // "You are here"
  },
};

// ---- Which planet are we on? ----
// The planet is remembered in the browser. Travelling saves the new planet
// and reloads the page (see planets.js), and the game starts up as that planet.
// This runs before any other file reads THEME, so every file sees the
// planet's settings without needing to know about planets.
export const PLANET_SAVE_KEY = 'voxelgame.planet';

function loadPlanetName() {
  try {
    const saved = localStorage.getItem(PLANET_SAVE_KEY);
    if (saved && THEME.planets[saved]) return saved;
  } catch (err) {
    console.warn('Could not load which planet you were on:', err);
  }
  return 'home';
}

// Copy every setting in `changes` over the same setting in `target`.
// Groups of settings ({ ... }) are merged one setting at a time, so a planet
// can change one number without repeating the rest. Lists ([ ... ]) and single
// values are replaced whole.
function applyChanges(target, changes) {
  for (const [key, value] of Object.entries(changes)) {
    const isGroup = value && typeof value === 'object' && !Array.isArray(value);
    if (isGroup && target[key] && typeof target[key] === 'object') applyChanges(target[key], value);
    else target[key] = value;
  }
}

THEME.planet = loadPlanetName();
applyChanges(THEME, THEME.planets[THEME.planet].changes);

// The settings of the planet you're on (name, seed...).
export const PLANET = THEME.planets[THEME.planet];

// Turn the interface colours into CSS variables. Call once at startup.
export function applyUiTheme() {
  for (const [name, value] of Object.entries(THEME.ui)) {
    document.documentElement.style.setProperty(name, value);
  }
}

// '#79553a' -> [121, 85, 58]   (used where code needs the numbers, e.g. textures)
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

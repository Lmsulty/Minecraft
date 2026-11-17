// ==========================================================
//  THEME: every colour in the game lives in this file.
//  To reskin the game, edit only this file.
//
//  Colours are written as '#rrggbb' (red, green, blue in hex).
//  Interface colours may also use 'rgba(r, g, b, alpha)' for see-through.
// ==========================================================

export const THEME = {
  // Which planet you're on. Picks per-planet settings, e.g. blackHole.perPlanet.
  planet: 'home',

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
    levels: {
      high:   { pixelRatio: 2,   drawRadius: 5, haze: [45, 78], chunkBudgetMs: 4, starLayers: 2, galaxy: 'full',   clouds: 'full',   blackHole: 'full',   antialias: true,  mobScale: 1 },
      medium: { pixelRatio: 1.5, drawRadius: 4, haze: [36, 62], chunkBudgetMs: 3, starLayers: 2, galaxy: 'simple', clouds: 'full',   blackHole: 'full',   antialias: true,  mobScale: 0.75 },
      low:    { pixelRatio: 1,   drawRadius: 3, haze: [27, 46], chunkBudgetMs: 2, starLayers: 1, galaxy: 'simple', clouds: 'simple', blackHole: 'simple', antialias: false, mobScale: 0.5 },
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
  // A soft-edged dark hole at the centre of a big fiery whirlpool: thick
  // spiral arms of gas, seen from above at an angle, swirling round and being
  // sucked in. Dark red outside, orange in the middle, white-hot where it
  // falls in. A soft glow spreads into the sky, and by day the sky around it
  // darkens, as if it's swallowing the daylight. Stars and the galaxy band
  // are bent around it. It sits high in the northern sky; at night the stars
  // wheel around it.
  blackHole: {
    height: 40,                // degrees above the horizon
    viewAngle: 55,             // how far above the whirlpool we see it from
                               // (90 = straight down on it, 0 = edge-on)
    tilt: 15,                  // degrees the whirlpool is turned on the sky
    swirlSize: 2.5,            // outer edge of the whirlpool, in hole radii
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
    bendStrength: 5,           // how strongly it bends the light of stars behind it

    // How it looks from each planet. The closer the planet, the bigger it looks.
    //   size:       radius of the hole, in degrees of sky. The whirlpool
    //               reaches swirlSize times further, the glow further still.
    //   brightness: 1 = normal, higher = more blazing
    // Later planets get their own line here, e.g. waterWorld: { size: 12, brightness: 1.6 }.
    perPlanet: {
      home: { size: 2.6, brightness: 1 }, // the farthest planet: smallest view (about 23 degrees across)
    },
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
                          // (average ground level, see BASE_HEIGHT in terrain.js)
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
  },

  // ---- In the world ----
  blockOutline: '#000000', // box around the block you're aiming at

  // How dark caves get where no sunlight reaches. Blocks are tinted from this
  // colour (no light at all) up to full brightness (open sky). An alien theme
  // could make this a faint glow, e.g. '#183020'.
  caveLight: '#2e2a30',

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
  },
};

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

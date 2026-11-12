// ==========================================================
//  THEME: every colour in the game lives in this file.
//  To reskin the game (e.g. an alien world), edit only this file.
//
//  Colours are written as '#rrggbb' (red, green, blue in hex).
//  Interface colours may also use 'rgba(r, g, b, alpha)' for see-through.
// ==========================================================

export const THEME = {
  // ---- Sky, fog and light through the day ----
  // The game clock runs 0:00 -> 24:00 (one full day takes about 6 real minutes).
  // Each keyframe is a snapshot of the sky at a certain hour. The game blends
  // smoothly between the keyframes on either side of the current time.
  //
  //   sky:           sky colour (the fog uses the same colour so far terrain fades into it)
  //   light:         colour of the sun by day, or the moon by night
  //   lightStrength: how bright that sun/moon light is
  //   ambientSky:    soft light coming from above
  //   ambientGround: soft light bouncing up from below (shades the undersides)
  //   ambientStrength: how bright the soft light is
  //   stars:         0 = no stars, 1 = fully visible stars
  skyKeyframes: [
    { hour: 4,  name: 'night',   sky: '#0b1026', light: '#8fa6d8', lightStrength: 0.45, ambientSky: '#3a4a78', ambientGround: '#141820', ambientStrength: 0.45, stars: 1 },
    { hour: 5,  name: 'dawn',    sky: '#5b4a7a', light: '#c49ac0', lightStrength: 0.5,  ambientSky: '#7a6a9a', ambientGround: '#2a2430', ambientStrength: 0.55, stars: 0.5 },
    { hour: 6,  name: 'sunrise', sky: '#f2a46b', light: '#ffc58a', lightStrength: 1.0,  ambientSky: '#ffd9b0', ambientGround: '#5a4a40', ambientStrength: 0.85, stars: 0 },
    { hour: 8,  name: 'day',     sky: '#87ceeb', light: '#ffffff', lightStrength: 1.8,  ambientSky: '#ffffff', ambientGround: '#666666', ambientStrength: 1.2,  stars: 0 },
    { hour: 18, name: 'day',     sky: '#87ceeb', light: '#ffffff', lightStrength: 1.8,  ambientSky: '#ffffff', ambientGround: '#666666', ambientStrength: 1.2,  stars: 0 },
    { hour: 19.5, name: 'sunset', sky: '#f08a4b', light: '#ff9a50', lightStrength: 1.0, ambientSky: '#ffbf8f', ambientGround: '#4f3f38', ambientStrength: 0.8,  stars: 0 },
    { hour: 21, name: 'dusk',    sky: '#3e3463', light: '#9b8bc8', lightStrength: 0.45, ambientSky: '#5a5080', ambientGround: '#1e1a26', ambientStrength: 0.5,  stars: 0.6 },
    { hour: 22, name: 'night',   sky: '#0b1026', light: '#8fa6d8', lightStrength: 0.45, ambientSky: '#3a4a78', ambientGround: '#141820', ambientStrength: 0.45, stars: 1 },
  ],

  // ---- Things in the sky ----
  sun: {
    core: '#fff6c8',  // middle of the disc
    rim: '#ffd25a',   // outer ring of the disc
    glow: '#ffe08a',  // soft halo around it
  },
  moon: {
    core: '#e8ecf4',
    crater: '#b8c0d0',
    glow: '#a8b8e0',
  },
  stars: '#ffffff',

  // ---- In the world ----
  blockOutline: '#000000', // box around the block you're aiming at

  // ---- Block textures (see textures.js for the patterns) ----
  // Lists like base: [...] are picked from at random, pixel by pixel.
  // Keep each list the same length if you want the same pattern with new colours.
  textures: {
    dirt: {
      base: ['#79553a', '#866042', '#6e4c34', '#805a3e'],
      pebbleDark: '#5a3e2c',
      pebbleLight: '#9e7c5c',
    },
    grassTop: {
      base: ['#56963c', '#5c9e40', '#508e38', '#62a644'],
      bladeTip: '#80c056',
      bladeShadow: '#42782e',
    },
    grassSide: {           // the dirt part uses the dirt colours above
      bandTop: '#68ae48',  // very top row of the grass band
      band: ['#56963c', '#508e38'],
      bandEdge: '#3e702c', // where grass meets dirt
      tuft: '#467a30',
    },
    stone: {
      base: ['#7d7d83', '#84848a', '#77777d', '#8a8a90'],
      crack: '#5c5c62',
      crackEdge: '#96969c',
      fleck: '#98989e',
    },
    woodSide: {            // bark
      base: ['#684a30', '#62462d', '#6e4f33'],
      groove: '#463120',
      ridge: '#78583a',
    },
    woodTop: {             // cut log end
      bark: ['#563c27', '#4a3422'],
      ringLight: '#ba9462',
      ringDark: '#a27c4f',
      heart: '#8a6640',
    },
    leaves: {
      shadow: ['#1e441c', '#244e20'],
      clump: ['#36722a', '#3c7a2e'],
      lit: '#4e9238',
    },
    sand: {
      base: ['#decc94', '#d8c68e', '#e3d29c'],
      ripple: '#ccba82',
      speckDark: '#baa672',
      speckLight: '#f0e4b8',
    },
    planks: {
      board: '#b08250',    // each board is this, made slightly lighter or darker
      seam: '#624428',     // dark line between boards
      joint: '#704f2f',    // where two boards meet end to end
    },
  },

  // ---- Interface (pause screen, FPS box, hotbar...) ----
  // These become CSS variables (e.g. var(--panel-bg)) when the game starts.
  ui: {
    '--page-bg': '#87ceeb',                      // behind everything while the game loads
    '--text': '#ffffff',
    '--overlay-bg': 'rgba(0, 0, 0, 0.5)',        // dims the screen when paused
    '--panel-bg': 'rgba(0, 0, 0, 0.5)',          // FPS box and "Saved" message
    '--crosshair': '#ffffff',
    '--crosshair-shadow': '#000000',
    '--button-bg': 'rgba(160, 40, 40, 0.85)',    // "Reset world" button
    '--button-bg-hover': 'rgba(190, 50, 50, 0.95)',
    '--button-border': 'rgba(255, 255, 255, 0.4)',

    '--hotbar-text': '#ffffff',
    '--hotbar-bg': 'rgba(0, 0, 0, 0.45)',
    '--hotbar-border': 'rgba(255, 255, 255, 0.3)',
    '--hotbar-selected-bg': 'rgba(255, 255, 255, 0.12)',
    '--hotbar-selected-border': '#ffffff',
    '--hotbar-selected-glow': '0 0 10px rgba(255, 255, 255, 0.55)',
    '--hotbar-name-bg': 'rgba(0, 0, 0, 0.55)',
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

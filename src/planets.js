import { THEME, PLANET_SAVE_KEY } from './theme.js';

// ==========================================================
//  PLANETS: travelling between them.
//  Each planet's settings (seed, terrain, colours...) live in theme.js
//  (THEME.planets). theme.js also works out which planet you're on when
//  the game starts.
//
//  Travelling = remember the new planet, then reload the page. The game
//  starts up fresh as that planet: its own terrain, sky and save. Your
//  inventory and Kevin come with you. Your changes on each planet are saved
//  on their own, so they're still there when you come back.
// ==========================================================

// ---- Debug key ----
// true = press P to jump straight to the next planet (for testing).
// Set this to false before the game is judged.
export const DEBUG_PLANET_KEY = true;

// Go to planet `name` (a key in THEME.planets, e.g. 'water').
// World edits and the inventory save themselves as the page reloads.
export function travelTo(name) {
  if (!THEME.planets[name]) throw new Error(`theme.js: no planet called "${name}"`);
  try {
    localStorage.setItem(PLANET_SAVE_KEY, name);
  } catch (err) {
    console.warn('Could not save which planet you travelled to:', err);
    return; // without the save, the reload would land you back here
  }
  location.reload();
}

// The planet after the one you're on, going round the list in theme.js.
function nextPlanet() {
  const names = Object.keys(THEME.planets);
  return names[(names.indexOf(THEME.planet) + 1) % names.length];
}

// Call once at startup. Does nothing unless DEBUG_PLANET_KEY is true.
export function setupDebugPlanetKey() {
  if (!DEBUG_PLANET_KEY) return;
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP' || e.repeat) return;
    // Typing a "p" in Kevin's chat or the rename box shouldn't send you to space.
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    travelTo(nextPlanet());
  });
}

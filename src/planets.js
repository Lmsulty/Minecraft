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

// Remembered for just this one reload: "we're arriving by ship", so the
// landing cutscene plays (cutscene.js). The debug key travels without it.
const ARRIVAL_KEY = 'voxelgame.arrivingByShip';

// Go to planet `name` (a key in THEME.planets, e.g. 'water').
// byShip = true: play the landing cutscene when you get there.
// World edits and the inventory save themselves as the page reloads.
export function travelTo(name, { byShip = false } = {}) {
  if (!THEME.planets[name]) throw new Error(`theme.js: no planet called "${name}"`);
  try {
    if (byShip) sessionStorage.setItem(ARRIVAL_KEY, '1');
    localStorage.setItem(PLANET_SAVE_KEY, name);
  } catch (err) {
    console.warn('Could not save which planet you travelled to:', err);
    return; // without the save, the reload would land you back here
  }
  location.reload();
}

// Did we just arrive by ship? (Only true once: it's forgotten straight away.)
export function takeArrival() {
  try {
    const arriving = sessionStorage.getItem(ARRIVAL_KEY) === '1';
    sessionStorage.removeItem(ARRIVAL_KEY);
    return arriving;
  } catch {
    return false;
  }
}

// The planet after the one you're on, going round the list in theme.js.
function nextPlanet() {
  const names = Object.keys(THEME.planets);
  return names[(names.indexOf(THEME.planet) + 1) % names.length];
}

// Call once at startup. Does nothing unless DEBUG_PLANET_KEY is true.
// isBlocked() = true while it shouldn't work (during a cutscene).
export function setupDebugPlanetKey(isBlocked = () => false) {
  if (!DEBUG_PLANET_KEY) return;
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP' || e.repeat || isBlocked()) return;
    // Typing a "p" in Kevin's chat or the rename box shouldn't send you to space.
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    travelTo(nextPlanet());
  });
}

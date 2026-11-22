import './shipPicker.css';
import { THEME } from './theme.js';

// ==========================================================
//  BOARDING THE SHIP and picking a planet on the STAR MAP.
//
//  Stand near the foot of the ship's ramp and a hint says "Press R to board".
//  R opens the star map: the black hole in the middle, each planet drifting
//  on its own orbit ring (THEME.planets in theme.js: `orbit`, `color`), and
//  an info panel on the right for the selected planet.
//
//    Hover, click or press a number   select a planet
//    LAUNCH button or Enter           go there (not the planet you're on)
//    Esc                              close and pause; R closes and plays on
//
//  Launching plays the takeoff cutscene (cutscene.js), then travels there.
//  You and Kevin land at the ship's ramp there.
// ==========================================================

const BOARD_DISTANCE = 3;   // blocks from the foot of the ramp where you can board
const BOARD_HEIGHT = 3;     // ...and at most this far above or below it

// ---- The star map (sizes in map units: the map is 310 wide, 230 tall, the black hole in the middle) ----
const ORBIT_RADII = [0, 40, 58, 76, 94];   // ring 1 (closest), 2, 3, 4
const ORBIT_SPEED = 0.35;                  // how fast planets drift (ring 1 goes round in about 18 seconds)
const START_ANGLES = [0, 0.7, 2.8, 4.6, 1.6]; // where each ring's planet starts (radians)
const PLANET_SIZE = 5;                     // radius of a planet's dot
const HOLE_SIZE = 17;                      // the black hole, ring included

// "1 min here = 1 hour at home" from a time slip number.
function slipText(slip) {
  if (slip <= 1) return 'No time slip: home time runs normally';
  const homeMinutes = slip;
  const amount = homeMinutes >= 60 && homeMinutes % 60 === 0
    ? `${homeMinutes / 60} hour${homeMinutes === 60 ? '' : 's'}`
    : `${homeMinutes} min`;
  return `1 min here = ${amount} at home`;
}

export class ShipPicker {
  // hint:   the empty <div> for "Press R to board"
  // root:   the empty <div> to build the star map in
  // player: the Player (where you are, and freeing/recapturing the mouse)
  // door:   the block column { x, z } at the foot of the ship's ramp
  // onPick: called with the chosen planet's name (starts the takeoff, cutscene.js)
  constructor(hint, root, player, door, onPick) {
    this.onPick = onPick;
    this.hint = hint;
    this.root = root;
    this.player = player;
    this.door = door;
    this.isOpen = false;
    this.nearShip = false;
    this.names = Object.keys(THEME.planets);
    this.selected = this.names.find((name) => name !== THEME.planet) ?? this.names[0];
    this.time = 0;

    this.hint.innerHTML = 'Press <span class="ship-hint-key">R</span> to board';
    this.build();
    this.setupControls();
  }

  // ---- Building the screen ----
  build() {
    this.root.classList.add('picker-screen');
    const bh = THEME.blackHole;
    const planets = this.names.map((name) => {
      const planet = THEME.planets[name];
      const here = name === THEME.planet;
      return `
        <g class="map-planet${here ? ' is-here' : ''}" data-planet="${name}" style="--planet-color: ${planet.color}">
          <circle class="map-planet-glow" r="${PLANET_SIZE * 2.4}"></circle>
          <circle class="map-planet-dot" r="${PLANET_SIZE}"></circle>
          <circle class="map-planet-hit" r="${PLANET_SIZE * 3}"></circle>
          <text class="map-planet-name" x="${PLANET_SIZE + 5}" y="1">${planet.name}</text>
          ${here ? `<text class="map-planet-here" x="${PLANET_SIZE + 5}" y="10">you are here</text>` : ''}
        </g>`;
    }).join('');
    const orbits = this.names.map((name) => `
      <circle class="map-orbit" data-orbit="${name}" r="${ORBIT_RADII[THEME.planets[name].orbit]}"></circle>`).join('');

    this.root.innerHTML = `
      <div class="map-room">
        <h2 class="map-title">STAR MAP</h2>
        <div class="map-layout">
          <svg class="map-chart" viewBox="-155 -115 310 230" role="img" aria-label="Star map">
            <defs>
              <radialGradient id="map-hole">
                <stop offset="0.74" stop-color="#000000"></stop>
                <stop offset="0.79" stop-color="${bh.gasInner}"></stop>
                <stop offset="0.87" stop-color="${bh.gasMiddle}"></stop>
                <stop offset="0.95" stop-color="${bh.gasOuter}"></stop>
                <stop offset="1" stop-color="${bh.gasOuter}" stop-opacity="0"></stop>
              </radialGradient>
              <radialGradient id="map-hole-glow">
                <stop offset="0.5" stop-color="${bh.glow}" stop-opacity="0.35"></stop>
                <stop offset="1" stop-color="${bh.glow}" stop-opacity="0"></stop>
              </radialGradient>
            </defs>
            ${orbits}
            <circle r="${HOLE_SIZE * 1.8}" fill="url(#map-hole-glow)"></circle>
            <circle r="${HOLE_SIZE}" fill="url(#map-hole)"></circle>
            <text class="map-hole-label" y="${HOLE_SIZE + 10}">BLACK HOLE</text>
            ${planets}
          </svg>
          <div class="map-info">
            <div class="map-destination"></div>
            <div class="map-name"></div>
            <p class="map-description"></p>
            <div class="map-slip"></div>
            <div class="map-clocks">
              <div class="map-clock"><span class="map-clock-label">SHIP TIME</span><span class="map-clock-value">--</span></div>
              <div class="map-clock"><span class="map-clock-label">HOME TIME</span><span class="map-clock-value">--</span></div>
            </div>
            <button class="map-launch" type="button"></button>
          </div>
        </div>
        <p class="map-help">Click a planet or press 1–${this.names.length} · Enter to launch · Esc to stay</p>
      </div>`;

    this.planetEls = new Map([...this.root.querySelectorAll('.map-planet')].map((el) => [el.dataset.planet, el]));
    this.orbitEls = new Map([...this.root.querySelectorAll('.map-orbit')].map((el) => [el.dataset.orbit, el]));
    this.launchButton = this.root.querySelector('.map-launch');

    // Hover or click a planet: select it. LAUNCH: go there.
    for (const [name, el] of this.planetEls) {
      el.addEventListener('pointerenter', () => this.select(name));
      el.addEventListener('click', () => this.select(name));
    }
    this.launchButton.addEventListener('click', () => this.launch());
    this.select(this.selected);
    this.placePlanets();
  }

  // Show planet `name` in the info panel, and light it up on the map.
  select(name) {
    this.selected = name;
    const planet = THEME.planets[name];
    const here = name === THEME.planet;
    const q = (selector) => this.root.querySelector(selector);
    q('.map-destination').textContent = `DESTINATION ${this.names.indexOf(name) + 1}`;
    q('.map-name').textContent = planet.name;
    q('.map-description').textContent = planet.description;
    q('.map-slip').textContent = slipText(planet.timeSlip);
    this.launchButton.textContent = here ? 'YOU ARE HERE' : 'LAUNCH ▸';
    this.launchButton.disabled = here;
    for (const [other, el] of this.planetEls) el.classList.toggle('is-selected', other === name);
    for (const [other, el] of this.orbitEls) el.classList.toggle('is-selected', other === name);
  }

  // Move each planet to where it is on its orbit now. Inner planets go round faster.
  placePlanets() {
    for (const [name, el] of this.planetEls) {
      const ring = THEME.planets[name].orbit;
      const r = ORBIT_RADII[ring];
      const angle = START_ANGLES[ring] + this.time * ORBIT_SPEED * (ORBIT_RADII[1] / r) ** 1.5;
      el.setAttribute('transform', `translate(${(Math.cos(angle) * r).toFixed(2)} ${(Math.sin(angle) * r).toFixed(2)})`);
    }
  }

  // The drifting: only runs while the star map is open.
  animate() {
    let last = performance.now();
    const step = (now) => {
      if (!this.isOpen) return;
      this.time += Math.min(0.1, (now - last) / 1000);
      last = now;
      this.placePlanets();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  launch() {
    this.go(this.selected);
  }

// ---- Opening, closing, travelling ----
  open() {
    this.isOpen = true;
    this.root.classList.add('is-open');
    this.animate();
    this.hint.classList.remove('is-shown');
    this.player.openMenu(); // frees the mouse without showing the pause screen
  }

  close({ resume = true } = {}) {
    this.isOpen = false;
    this.root.classList.remove('is-open');
    this.player.closeMenu({ resume });
  }

  go(name) {
    if (name === THEME.planet) return;
    // Hide the picker, but keep the mouse free (no pause screen): the takeoff
    // cutscene plays now, then travels there.
    this.isOpen = false;
    this.root.classList.remove('is-open');
    this.onPick(name);
  }

  setupControls() {
    document.addEventListener('keydown', (e) => {
      // Typing an "r" in Kevin's chat or the rename box doesn't board the ship.
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (this.isOpen) {
        if (e.code === 'Escape') this.close({ resume: false }); // Esc = pause, like the inventory
        else if (e.code === 'KeyR' && !e.repeat) this.close();
        else if (e.code.startsWith('Digit')) {
          e.stopImmediatePropagation(); // selects a planet, doesn't also change your hotbar slot
          const name = this.names[Number(e.code.slice(5)) - 1];
          if (name) this.select(name);
        } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) {
          e.preventDefault();
          e.stopImmediatePropagation(); // doesn't also open Kevin's chat
          this.launch();
        }
      } else if (e.code === 'KeyR' && !e.repeat && this.player.locked && this.nearShip) {
        this.open();
      }
    }, true); // `true` = hear keys before the rest of the game, so number keys can be kept from the hotbar
  }

  // Call every frame: shows the hint while you're near the ramp.
  update() {
    const p = this.player.position;
    const dx = p.x - (this.door.x + 0.5);
    const dz = p.z - (this.door.z + 0.5);
    const ground = this.door.y ?? p.y;
    this.nearShip = Math.hypot(dx, dz) <= BOARD_DISTANCE && Math.abs(p.y - ground) <= BOARD_HEIGHT;
    this.hint.classList.toggle('is-shown', this.nearShip && this.player.locked && !this.isOpen);
  }
}

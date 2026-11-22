import './shipPicker.css';
import { THEME } from './theme.js';

// ==========================================================
//  BOARDING THE SHIP and picking a planet.
//
//  Stand near the foot of the ship's ramp and a hint says "Press R to board".
//  R opens the planet picker: one card per planet (THEME.planets in theme.js)
//  with its name, a short description and its time slip. The planet you're
//  on is greyed out. Click a card (or press its number) to travel there.
//  Esc (or R again) closes it.
//
//  Picking a planet plays the takeoff cutscene (cutscene.js), then travels
//  there. You and Kevin land at the ship's ramp there.
// ==========================================================

const BOARD_DISTANCE = 3;   // blocks from the foot of the ramp where you can board
const BOARD_HEIGHT = 3;     // ...and at most this far above or below it

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
  // root:   the empty <div> to build the picker screen in
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

    this.hint.innerHTML = 'Press <span class="ship-hint-key">R</span> to board';
    this.build();
    this.setupControls();
  }

  // ---- The cards ----
  build() {
    this.root.classList.add('picker-screen');
    const cards = this.names.map((name, i) => {
      const planet = THEME.planets[name];
      const here = name === THEME.planet;
      return `
        <button class="picker-card${here ? ' is-here' : ''}" type="button" data-planet="${name}"
          ${here ? 'disabled' : ''} style="--planet-color: ${planet.color}">
          <span class="picker-stripe"></span>
          <span class="picker-number">${i + 1}</span>
          <span class="picker-name">${planet.name}</span>
          <span class="picker-description">${planet.description}</span>
          <span class="picker-slip">${slipText(planet.timeSlip)}</span>
          ${here ? '<span class="picker-here">You are here</span>' : ''}
        </button>`;
    }).join('');
    this.root.innerHTML = `
      <div class="picker-panel">
        <h2 class="picker-title">Where to?</h2>
        <div class="picker-cards">${cards}</div>
        <p class="picker-help">Click a planet or press its number. Esc to stay.</p>
      </div>`;
    this.root.addEventListener('click', (e) => {
      const card = e.target.closest('.picker-card');
      if (card && !card.disabled) this.go(card.dataset.planet);
    });
  }

  // ---- Opening, closing, travelling ----
  open() {
    this.isOpen = true;
    this.root.classList.add('is-open');
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
          e.stopImmediatePropagation(); // picks a planet, doesn't also change your hotbar slot
          const name = this.names[Number(e.code.slice(5)) - 1];
          if (name) this.go(name);
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

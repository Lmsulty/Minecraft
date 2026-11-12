import './hotbar.css';
import { BLOCK, BLOCK_TYPES } from './blocks.js';
import { makeBlockIcon } from './blockIcons.js';

// The row of 9 block slots at the bottom of the screen.
// Number keys 1-9 or the scroll wheel pick a slot.
// Other code reads `hotbar.selectedBlock` to know what to place.

// What's in each slot. null = empty. Edit this list to change the hotbar.
const SLOTS = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.WOOD,
  BLOCK.LEAVES, BLOCK.SAND, BLOCK.PLANKS, null, null,
];

// ---- Scroll wheel tuning ----
// Trackpads send lots of tiny scroll events per swipe; a mouse wheel sends one big one
// per click. Adding them up and moving one slot per WHEEL_STEP, with a short pause
// after each move, makes both feel sensible.
const WHEEL_STEP = 50;         // scroll amount needed to move one slot
const WHEEL_COOLDOWN_MS = 90;  // ignore scrolling for this long after moving
const WHEEL_RESET_MS = 200;    // forget a half-finished scroll after this long

const NAME_SHOW_MS = 1500;     // how long the block name stays up after switching

export class Hotbar {
  // container: the empty <div> to build the hotbar in
  // isActive:  function that says whether the game is being played (mouse captured)
  constructor(container, isActive) {
    this.isActive = isActive;
    this.slots = SLOTS.slice();
    this.selected = 0;

    this.wheelTotal = 0;
    this.lastWheel = 0;
    this.cooldownUntil = 0;
    this.nameTimer = null;

    this.build(container);
    this.select(0, { showName: false });
    this.setupControls();
  }

  // The block id in the selected slot, or null if that slot is empty.
  get selectedBlock() {
    return this.slots[this.selected];
  }

  // ---- Building the HTML ----

  build(container) {
    container.classList.add('hotbar');
    this.slotElements = this.slots.map((blockId, i) => {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';

      if (blockId !== null) {
        const icon = makeBlockIcon(blockId);
        icon.className = 'hotbar-icon';
        slot.appendChild(icon);
      }

      const key = document.createElement('span');
      key.className = 'hotbar-key';
      key.textContent = i + 1;
      slot.appendChild(key);

      container.appendChild(slot);
      return slot;
    });

    this.nameElement = document.createElement('div');
    this.nameElement.className = 'hotbar-name';
    container.appendChild(this.nameElement);
  }

  // ---- Choosing a slot ----

  select(index, { showName = true } = {}) {
    // Wrap around: past slot 9 goes back to 1, and before 1 goes to 9.
    const count = this.slots.length;
    this.selected = ((index % count) + count) % count;

    this.slotElements.forEach((el, i) => el.classList.toggle('is-selected', i === this.selected));
    if (showName) this.showName();
  }

  showName() {
    const id = this.selectedBlock;
    const name = id === null ? 'Empty' : BLOCK_TYPES[id].name;
    this.nameElement.textContent = name[0].toUpperCase() + name.slice(1);
    this.nameElement.classList.add('is-visible');
    clearTimeout(this.nameTimer);
    this.nameTimer = setTimeout(() => this.nameElement.classList.remove('is-visible'), NAME_SHOW_MS);
  }

  // ---- Input ----

  setupControls() {
    document.addEventListener('keydown', (e) => {
      // e.code is "Digit1" ... "Digit9"
      if (!e.code.startsWith('Digit')) return;
      const index = Number(e.code.slice(5)) - 1;
      if (index >= 0 && index < this.slots.length) this.select(index);
    });

    document.addEventListener('wheel', (e) => this.onWheel(e), { passive: true });
  }

  onWheel(e) {
    if (!this.isActive()) return;
    const now = performance.now();
    if (now < this.cooldownUntil) return;
    if (now - this.lastWheel > WHEEL_RESET_MS) this.wheelTotal = 0;
    this.lastWheel = now;

    // Some browsers report scrolling in lines or pages instead of pixels.
    let amount = e.deltaY;
    if (e.deltaMode === 1) amount *= 16;   // lines
    if (e.deltaMode === 2) amount *= 400;  // pages
    this.wheelTotal += amount;

    if (Math.abs(this.wheelTotal) >= WHEEL_STEP) {
      // Scroll down = next slot (right), scroll up = previous slot (left).
      this.select(this.selected + Math.sign(this.wheelTotal));
      this.wheelTotal = 0;
      this.cooldownUntil = now + WHEEL_COOLDOWN_MS;
    }
  }
}

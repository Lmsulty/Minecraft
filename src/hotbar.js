import './hotbar.css';
import { BLOCK_TYPES } from './blocks.js';
import { makeBlockIcon } from './blockIcons.js';
import { HOTBAR_SIZE } from './inventory.js';

// The row of 9 block slots at the bottom of the screen.
// Number keys 1-9 or the scroll wheel pick a slot.
// What's IN each slot comes from the inventory (inventory.js): the hotbar is
// just a view of the inventory's first 9 slots, with a count on each.

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
  // inventory: the Inventory whose first 9 slots this shows
  // isActive:  function that says whether the game is being played (mouse captured)
  constructor(container, inventory, isActive) {
    this.inventory = inventory;
    this.isActive = isActive;

    this.wheelTotal = 0;
    this.lastWheel = 0;
    this.cooldownUntil = 0;
    this.nameTimer = null;

    this.build(container);
    this.refresh();
    // Redraw whenever the inventory changes (block picked up, placed, ...).
    inventory.onChange(() => this.refresh());
    this.setupControls();
  }

  // The selected slot number (0-8).
  get selected() {
    return this.inventory.selected;
  }

  // The block id in the selected slot, or null if that slot is empty.
  get selectedBlock() {
    return this.inventory.selectedStack?.block ?? null;
  }

  // ---- Building the HTML ----

  build(container) {
    container.classList.add('hotbar');
    this.slotElements = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';

      const key = document.createElement('span');
      key.className = 'hotbar-key';
      key.textContent = i + 1;

      const count = document.createElement('span');
      count.className = 'hotbar-count';

      slot.append(key, count);
      container.appendChild(slot);
      // shownBlock remembers which icon is drawn, so we only redraw icons that changed.
      this.slotElements.push({ slot, count, icon: null, shownBlock: null });
    }

    this.nameElement = document.createElement('div');
    this.nameElement.className = 'hotbar-name';
    container.appendChild(this.nameElement);
  }

  // Make every slot match the inventory: icon, count, and highlight.
  refresh() {
    this.slotElements.forEach((el, i) => {
      const stack = this.inventory.get(i);
      const blockId = stack ? stack.block : null;

      // Swap the icon only if the block in this slot changed.
      if (blockId !== el.shownBlock) {
        el.icon?.remove();
        el.icon = null;
        if (blockId !== null) {
          el.icon = makeBlockIcon(blockId);
          el.icon.className = 'hotbar-icon';
          el.slot.prepend(el.icon);
        }
        el.shownBlock = blockId;
      }

      // Show the count (blank for an empty slot, ∞ in creative mode).
      if (!stack) el.count.textContent = '';
      else el.count.textContent = this.inventory.creative ? '∞' : stack.count;
      el.slot.classList.toggle('is-selected', i === this.selected);
    });
  }

  // ---- Choosing a slot ----

  select(index, { showName = true } = {}) {
    // Wrap around: past slot 9 goes back to 1, and before 1 goes to 9.
    this.inventory.select(((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE);
    this.refresh(); // in case the slot didn't change (no change event)
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
      if (index >= 0 && index < HOTBAR_SIZE) this.select(index);
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

import './inventory.css';
import { BLOCK_TYPES, isBreakableId } from './blocks.js';
import { getBlockIconURL } from './blockIcons.js';
import { HOTBAR_SIZE, INVENTORY_SIZE, MAX_STACK } from './inventory.js';

// The full inventory screen. Press E (or Tab) to open and close it.
//
//   Left click        pick up / put down / swap a stack
//   Right click       pick up half a stack, or put down one block
//   Shift + click     send a stack between the hotbar and the backpack
//
// In creative mode a palette of every block is shown on the right:
// click one to pick up a full stack. Clicking the palette while holding
// something throws the held stack away.
//
// This file only draws and handles clicks. The rules for moving stacks
// live in inventory.js.

// What goes inside anything that shows a stack: a slot, a palette entry,
// and the stack following the mouse. drawStack() expects exactly this.
const STACK_MARKUP = '<img class="inv-icon" alt=""><span class="inv-count"></span>';

export class InventoryScreen {
  // root:      the empty <div> to build the screen in
  // inventory: the Inventory to show
  // player:    the Player (to free and recapture the mouse)
  constructor(root, inventory, player) {
    this.root = root;
    this.inventory = inventory;
    this.player = player;
    this.isOpen = false;

    this.build();
    inventory.onChange(() => { if (this.isOpen) this.refresh(); });
    this.setupControls();
  }

  // ---- Opening and closing ----

  open() {
    this.isOpen = true;
    this.refresh();
    this.root.classList.add('is-open');
    this.player.openMenu(); // frees the mouse without showing the pause screen
  }

  // resume = true: go straight back to playing. false: show the pause screen.
  close({ resume = true } = {}) {
    this.isOpen = false;
    this.inventory.returnHeld(); // nothing stays stuck to the mouse
    this.root.classList.remove('is-open');
    this.player.closeMenu({ resume });
  }

  // ---- Building the HTML ----

  build() {
    this.root.classList.add('inv-screen');
    this.root.innerHTML = `
      <div class="inv-panel">
        <div class="inv-main">
          <h2 class="inv-title">Inventory</h2>
          <div class="inv-grid inv-backpack"></div>
          <div class="inv-label">Hotbar</div>
          <div class="inv-grid inv-hotbar"></div>
        </div>
        <div class="inv-side">
          <h2 class="inv-title">All blocks</h2>
          <p class="inv-hint">Click to take a stack.<br>Click while holding to discard.</p>
          <div class="inv-grid inv-palette"></div>
        </div>
      </div>
      <div class="inv-held"></div>
    `;

    // One element per inventory slot. Backpack first on screen, hotbar underneath.
    const backpack = this.root.querySelector('.inv-backpack');
    const hotbar = this.root.querySelector('.inv-hotbar');
    this.slotElements = [];
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const el = this.makeSlot();
      el.addEventListener('mousedown', (e) => this.onSlotClick(i, e));
      (i < HOTBAR_SIZE ? hotbar : backpack).appendChild(el);
      this.slotElements.push(el);
    }

    // Creative palette: every block you could place (not air, not core rock).
    this.side = this.root.querySelector('.inv-side');
    const palette = this.root.querySelector('.inv-palette');
    for (const type of BLOCK_TYPES) {
      if (!type.textures || !isBreakableId(type.id)) continue;
      const el = this.makeSlot();
      this.drawStack(el, { block: type.id, count: 0 });
      el.addEventListener('mousedown', (e) => this.onPaletteClick(type.id, e));
      palette.appendChild(el);
    }

    // The stack that follows the mouse pointer.
    this.heldElement = this.root.querySelector('.inv-held');
    this.heldElement.innerHTML = STACK_MARKUP;
    document.addEventListener('mousemove', (e) => {
      if (!this.isOpen) return;
      this.heldElement.style.left = `${e.clientX}px`;
      this.heldElement.style.top = `${e.clientY}px`;
    });

    // Don't let clicks on the screen fall through to the game.
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  makeSlot() {
    const el = document.createElement('div');
    el.className = 'inv-slot';
    el.innerHTML = STACK_MARKUP;
    return el;
  }

  // Show a stack (or nothing) in a slot element. count 0 = don't show a number.
  drawStack(el, stack) {
    const img = el.querySelector('.inv-icon');
    const count = el.querySelector('.inv-count');
    if (stack) {
      const src = getBlockIconURL(stack.block);
      if (img.getAttribute('src') !== src) img.src = src;
      img.style.visibility = 'visible';
      count.textContent = stack.count > 1 ? stack.count : '';
      el.title = blockName(stack.block);
    } else {
      img.style.visibility = 'hidden';
      count.textContent = '';
      el.title = '';
    }
  }

  // Make the screen match the inventory.
  refresh() {
    this.slotElements.forEach((el, i) => {
      this.drawStack(el, this.inventory.get(i));
      el.classList.toggle('is-selected', i === this.inventory.selected);
    });
    this.drawStack(this.heldElement, this.inventory.held);
    this.heldElement.classList.toggle('is-visible', !!this.inventory.held);
    this.side.classList.toggle('is-visible', this.inventory.creative);
  }

  // ---- Clicks ----

  onSlotClick(index, e) {
    if (e.button === 0 && e.shiftKey && !this.inventory.held) this.inventory.quickMove(index);
    else if (e.button === 0) this.inventory.leftClick(index);
    else if (e.button === 2) this.inventory.rightClick(index);
  }

  onPaletteClick(blockId, e) {
    if (e.button !== 0) return;
    if (this.inventory.held) {
      this.inventory.setHeld(null); // throw away what you're holding
    } else if (e.shiftKey) {
      this.inventory.add(blockId, MAX_STACK); // straight into the inventory
    } else {
      this.inventory.setHeld({ block: blockId, count: MAX_STACK });
    }
  }

  // ---- Keys ----

  setupControls() {
    document.addEventListener('keydown', (e) => {
      const toggleKey = e.code === 'KeyE' || e.code === 'Tab';
      if (toggleKey && (this.isOpen || this.player.locked)) {
        e.preventDefault(); // stop Tab jumping between page buttons
        if (e.repeat) return;
        if (this.isOpen) this.close();
        else this.open();
      } else if (e.code === 'Escape' && this.isOpen) {
        this.close({ resume: false }); // Esc = pause, like in the game
      }
    });
  }
}

function blockName(id) {
  const name = BLOCK_TYPES[id].name;
  return name[0].toUpperCase() + name.slice(1);
}

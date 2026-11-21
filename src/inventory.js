import { isCarryableId } from './items.js';
import { THEME } from './theme.js';

// Everything the player is carrying. This file only holds the DATA
// (which block is in which slot, and how many). Drawing it on screen is
// done by hotbar.js and inventoryScreen.js.
//
// Slots 0-8 are the hotbar. Slots 9-35 are the backpack (shown on the
// inventory screen). Each slot is either null (empty) or { block, count }.
// `block` can also be an item id (items.js): items stack and move around
// exactly like blocks; they just can't be placed in the world.
//
// `held` is the stack stuck to your mouse pointer while you move things
// around on the inventory screen (null = nothing held).
//
// Saved to localStorage, like world edits, so it survives a refresh.
// There's ONE inventory for every planet: you carry it with you when you travel.

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36; // 9 hotbar + 27 backpack
export const MAX_STACK = 99;      // most of one block a single slot can hold

const SAVE_DELAY_MS = 1000; // save this long after the last change, not on every click

export class Inventory {
  // onSaved: called after each successful save (for the "Saved" message)
  constructor(onSaved) {
    // The same save on every planet (not tied to a planet's seed, like world edits are).
    this.storageKey = 'voxelgame.inventory.shared.v1';
    this.onSaved = onSaved;
    this.slots = new Array(INVENTORY_SIZE).fill(null);
    this.held = null;        // stack on the mouse pointer (inventory screen only)
    this.selected = 0;       // which hotbar slot is in your hand (0-8)
    this.creative = false;   // creative mode: unlimited blocks (see creative.js)
    this.listeners = [];
    this.dirty = false;      // true = there are changes not saved yet
    this.saveTimer = null;
    this.disabled = false;   // set by clear(), so nothing gets saved during a reset

    this.load();

    // Save straight away if the page is being closed, refreshed, or hidden.
    window.addEventListener('pagehide', () => this.saveNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveNow();
    });
  }

  // ---- Reading ----

  // The stack in a slot ({ block, count }) or null if it's empty.
  get(index) {
    return this.slots[index];
  }

  // The stack in the hotbar slot you're holding, or null.
  get selectedStack() {
    return this.slots[this.selected];
  }

  // How many of a block you have in total (all slots added up).
  countOf(blockId) {
    let total = 0;
    for (const stack of this.slots) {
      if (stack && stack.block === blockId) total += stack.count;
    }
    return total;
  }

  // ---- Changing ----

  // Pick which hotbar slot is in your hand.
  select(index) {
    if (index === this.selected) return;
    this.selected = index;
    this.changed();
  }

  // Turn creative mode on or off.
  setCreative(on) {
    if (on === this.creative) return;
    this.creative = on;
    this.changed();
  }

  // Put blocks into the inventory: first topping up stacks of the same
  // block, then using the first empty slot (hotbar first, then backpack).
  // Returns how many actually fitted (less than `count` if it's full).
  add(blockId, count = 1) {
    const left = this.fillRange(blockId, count, 0, INVENTORY_SIZE);
    const added = count - left;
    if (added > 0) this.changed();
    return added;
  }

  // Take blocks out of one slot. An emptied slot becomes null.
  // Returns how many were actually taken.
  removeFromSlot(index, count = 1) {
    const stack = this.slots[index];
    if (!stack) return 0;
    const taken = Math.min(count, stack.count);
    stack.count -= taken;
    if (stack.count === 0) this.slots[index] = null;
    this.changed();
    return taken;
  }

  // ---- Moving stacks around (used by the inventory screen) ----

  // Click a slot with the LEFT button:
  //   holding nothing      -> pick up the whole stack
  //   slot empty           -> put the held stack down
  //   same block           -> add as much as fits; the rest stays held
  //   different block      -> swap them
  leftClick(index) {
    const slot = this.slots[index];
    const held = this.held;
    if (!held && !slot) return;
    if (!held) {
      this.held = slot;
      this.slots[index] = null;
    } else if (!slot) {
      this.slots[index] = held;
      this.held = null;
    } else if (slot.block === held.block) {
      const moved = Math.min(held.count, MAX_STACK - slot.count);
      slot.count += moved;
      held.count -= moved;
      if (held.count === 0) this.held = null;
    } else {
      this.slots[index] = held;
      this.held = slot;
    }
    this.changed();
  }

  // Click a slot with the RIGHT button:
  //   holding nothing      -> pick up half the stack (the bigger half)
  //   slot empty/same block-> put down just one
  //   different block      -> swap them
  rightClick(index) {
    const slot = this.slots[index];
    const held = this.held;
    if (!held && !slot) return;
    if (!held) {
      const half = Math.ceil(slot.count / 2);
      this.held = { block: slot.block, count: half };
      slot.count -= half;
      if (slot.count === 0) this.slots[index] = null;
    } else if (!slot) {
      this.slots[index] = { block: held.block, count: 1 };
      held.count -= 1;
      if (held.count === 0) this.held = null;
    } else if (slot.block === held.block) {
      if (slot.count >= MAX_STACK) return;
      slot.count += 1;
      held.count -= 1;
      if (held.count === 0) this.held = null;
    } else {
      this.slots[index] = held;
      this.held = slot;
    }
    this.changed();
  }

  // Shift-click: send a whole stack across, hotbar -> backpack or backpack -> hotbar.
  quickMove(index) {
    const slot = this.slots[index];
    if (!slot) return;
    const inHotbar = index < HOTBAR_SIZE;
    const [from, to] = inHotbar ? [HOTBAR_SIZE, INVENTORY_SIZE] : [0, HOTBAR_SIZE];
    const left = this.fillRange(slot.block, slot.count, from, to);
    if (left === slot.count) return; // nowhere to put it
    slot.count = left;
    if (left === 0) this.slots[index] = null;
    this.changed();
  }

  // Replace whatever is held (creative palette: pick up a fresh stack,
  // or pass null to throw the held stack away).
  setHeld(stack) {
    this.held = stack;
    this.changed();
  }

  // Put the held stack back into the inventory (when the screen closes).
  // If there's no room, whatever doesn't fit is lost.
  returnHeld() {
    if (!this.held) return;
    const { block, count } = this.held;
    this.held = null;
    this.fillRange(block, count, 0, INVENTORY_SIZE);
    this.changed();
  }

  // ---- Trading (used by crafting) ----

  // Swap some blocks for others, all or nothing:
  //   take: [{ block, count }, ...]  what gets used up
  //   then `giveCount` of block `giveBlock` is added.
  // Returns 'ready' if it worked, 'missing' if you don't have enough,
  // or 'full' if the result wouldn't fit. dryRun = only check, change nothing.
  trade(take, giveBlock, giveCount, { dryRun = false } = {}) {
    const result = this.tradeOnce(take, giveBlock, giveCount, dryRun);
    if (result === 'ready' && !dryRun) this.changed();
    return result;
  }

  // Do the same trade up to `times` times. Returns how many times it worked.
  tradeMany(take, giveBlock, giveCount, times) {
    let done = 0;
    while (done < times && this.tradeOnce(take, giveBlock, giveCount, false) === 'ready') done++;
    if (done > 0) this.changed();
    return done;
  }

  // One trade, without announcing the change.
  tradeOnce(take, giveBlock, giveCount, dryRun) {
    for (const { block, count } of take) {
      if (this.countOf(block) < count) return 'missing';
    }
    // Copy every stack so we can undo if the result doesn't fit.
    const before = this.slots.map((stack) => stack && { ...stack });
    for (const { block, count } of take) this.removeBlock(block, count);
    const left = this.fillRange(giveBlock, giveCount, 0, INVENTORY_SIZE);
    if (left > 0 || dryRun) this.slots = before;
    return left > 0 ? 'full' : 'ready';
  }

  // Take `count` of a block from anywhere, backpack first so your hotbar
  // stays stocked. (Doesn't announce the change; the caller does.)
  removeBlock(blockId, count) {
    let left = count;
    const order = [];
    for (let i = INVENTORY_SIZE - 1; i >= 0; i--) order.push(i); // backpack end first, hotbar last
    for (const i of order) {
      const stack = this.slots[i];
      if (!stack || stack.block !== blockId) continue;
      const taken = Math.min(left, stack.count);
      stack.count -= taken;
      left -= taken;
      if (stack.count === 0) this.slots[i] = null;
      if (left === 0) break;
    }
  }

  // Put `count` of a block into slots from..to-1: top up matching stacks
  // first, then use empty slots. Returns how many didn't fit.
  // (Doesn't announce the change; the caller does.)
  fillRange(blockId, count, from, to) {
    let left = count;
    for (let i = from; i < to && left > 0; i++) {
      const stack = this.slots[i];
      if (stack && stack.block === blockId && stack.count < MAX_STACK) {
        const moved = Math.min(left, MAX_STACK - stack.count);
        stack.count += moved;
        left -= moved;
      }
    }
    for (let i = from; i < to && left > 0; i++) {
      if (this.slots[i] === null) {
        const moved = Math.min(left, MAX_STACK);
        this.slots[i] = { block: blockId, count: moved };
        left -= moved;
      }
    }
    return left;
  }

  // ---- Telling other code about changes ----

  // fn() is called every time anything in the inventory changes.
  onChange(fn) {
    this.listeners.push(fn);
  }

  changed() {
    for (const fn of this.listeners) fn();
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DELAY_MS);
  }

  // ---- Saving and loading ----

  // Before planets, the inventory was saved under home's seed. The first time
  // the game runs with planets, move that save over to the shared one, so
  // nothing is lost. (It's moved, not copied, so "Reset world" can't bring it back.)
  moveOldSave() {
    const oldKey = `voxelgame.inventory.seed${THEME.planets.home.seed}.v1`;
    try {
      if (localStorage.getItem(this.storageKey) !== null) return; // already moved
      const old = localStorage.getItem(oldKey);
      if (old === null) return; // nothing to move
      localStorage.setItem(this.storageKey, old);
      localStorage.removeItem(oldKey); // only after the copy worked
    } catch (err) {
      console.warn('Could not move the old inventory save:', err);
    }
  }

  load() {
    this.moveOldSave();
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(this.storageKey));
    } catch (err) {
      console.warn('Could not load saved inventory:', err);
    }
    if (!saved) return;

    // Only keep stacks that still make sense (e.g. a block or item that was
    // removed from the game, or a broken save, is skipped instead of crashing).
    const isValid = (stack) =>
      stack && isCarryableId(stack.block) &&
      Number.isInteger(stack.count) && stack.count > 0;

    (saved.slots ?? []).forEach((stack, i) => {
      if (i < INVENTORY_SIZE && isValid(stack)) {
        this.slots[i] = { block: stack.block, count: Math.min(stack.count, MAX_STACK) };
      }
    });
    // A stack that was on the mouse pointer when the page closed goes back in.
    if (isValid(saved.held)) this.fillRange(saved.held.block, saved.held.count, 0, INVENTORY_SIZE);

    if (Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < HOTBAR_SIZE) {
      this.selected = saved.selected;
    }
    if (typeof saved.creative === 'boolean') this.creative = saved.creative;
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    if (!this.dirty || this.disabled) return;
    const data = { slots: this.slots, held: this.held, selected: this.selected, creative: this.creative };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      this.dirty = false;
      this.onSaved?.();
    } catch (err) {
      // Private browsing or storage full: keep playing, just don't save.
      console.warn('Could not save inventory:', err);
    }
  }

  // Empty everything and forget the save (used by the "Reset world" button).
  clear() {
    clearTimeout(this.saveTimer);
    this.slots.fill(null);
    this.held = null;
    this.selected = 0;
    this.creative = false;
    this.dirty = false;
    this.disabled = true;
    try {
      localStorage.removeItem(this.storageKey);
    } catch (err) {
      console.warn('Could not clear saved inventory:', err);
    }
  }
}

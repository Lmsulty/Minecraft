import { BLOCK_TYPES } from './blocks.js';

// Everything the player is carrying. This file only holds the DATA
// (which block is in which slot, and how many). Drawing it on screen is
// done by hotbar.js (and later the inventory screen).
//
// Slots 0-8 are the hotbar. Slots 9-35 are the backpack (shown later on the
// inventory screen). Each slot is either null (empty) or { block, count }.
//
// Saved to localStorage, like world edits, so it survives a refresh.

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36; // 9 hotbar + 27 backpack
export const MAX_STACK = 99;      // most of one block a single slot can hold

const SAVE_DELAY_MS = 1000; // save this long after the last change, not on every click

export class Inventory {
  // onSaved: called after each successful save (for the "Saved" message)
  constructor(seed, onSaved) {
    // One inventory per world (seed), like the world edits.
    this.storageKey = `voxelgame.inventory.seed${seed}.v1`;
    this.onSaved = onSaved;
    this.slots = new Array(INVENTORY_SIZE).fill(null);
    this.selected = 0;       // which hotbar slot is in your hand (0-8)
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

  // ---- Changing ----

  // Pick which hotbar slot is in your hand.
  select(index) {
    if (index === this.selected) return;
    this.selected = index;
    this.changed();
  }

  // Put blocks into the inventory: first topping up stacks of the same
  // block, then using the first empty slot (hotbar first, then backpack).
  // Returns how many actually fitted (less than `count` if it's full).
  add(blockId, count = 1) {
    let left = count;
    // 1. Top up stacks that already hold this block.
    for (let i = 0; i < INVENTORY_SIZE && left > 0; i++) {
      const stack = this.slots[i];
      if (stack && stack.block === blockId && stack.count < MAX_STACK) {
        const moved = Math.min(left, MAX_STACK - stack.count);
        stack.count += moved;
        left -= moved;
      }
    }
    // 2. Start new stacks in empty slots.
    for (let i = 0; i < INVENTORY_SIZE && left > 0; i++) {
      if (this.slots[i] === null) {
        const moved = Math.min(left, MAX_STACK);
        this.slots[i] = { block: blockId, count: moved };
        left -= moved;
      }
    }
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

  load() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(this.storageKey));
    } catch (err) {
      console.warn('Could not load saved inventory:', err);
    }
    if (!saved) return;

    // Only keep stacks that still make sense (e.g. a block that was removed
    // from blocks.js, or a broken save, is skipped instead of crashing).
    (saved.slots ?? []).forEach((stack, i) => {
      if (i >= INVENTORY_SIZE || !stack) return;
      const validBlock = BLOCK_TYPES[stack.block]?.textures;
      const validCount = Number.isInteger(stack.count) && stack.count > 0;
      if (validBlock && validCount) {
        this.slots[i] = { block: stack.block, count: Math.min(stack.count, MAX_STACK) };
      }
    });
    if (Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < HOTBAR_SIZE) {
      this.selected = saved.selected;
    }
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    if (!this.dirty || this.disabled) return;
    const data = { slots: this.slots, selected: this.selected };
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
    this.selected = 0;
    this.dirty = false;
    this.disabled = true;
    try {
      localStorage.removeItem(this.storageKey);
    } catch (err) {
      console.warn('Could not clear saved inventory:', err);
    }
  }
}

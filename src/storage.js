// Remembers every block the player changes, and keeps that list in the
// browser's localStorage so changes survive a page refresh.
//
// Only CHANGES are stored, not whole chunks. Untouched terrain can always be
// rebuilt from the seed, so storing it would just waste space.
//
// In memory:  Map  chunkKey ("cx,cz")  ->  Map  "lx,y,lz"  ->  block id
// On disk:    the same thing as JSON:  { "cx,cz": { "lx,y,lz": id, ... }, ... }

const SAVE_DELAY_MS = 1000; // save this long after the last change, not on every click

export class EditStore {
  constructor(seed, onSaved) {
    // The seed is part of the name, so edits never land on different terrain.
    this.storageKey = `voxelgame.edits.seed${seed}.v1`;
    this.onSaved = onSaved; // called after each successful save (for the "Saved" message)
    this.edits = new Map();
    this.dirty = false;     // true = there are changes not saved yet
    this.saveTimer = null;
    this.disabled = false;  // set by clear(), so nothing gets saved during a reset

    this.load();

    // Save straight away if the page is being closed, refreshed, or hidden.
    window.addEventListener('pagehide', () => this.saveNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveNow();
    });
  }

  load() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(this.storageKey));
    } catch (err) {
      console.warn('Could not load saved world changes:', err);
    }
    if (!saved) return;
    for (const [chunkKey, blocks] of Object.entries(saved)) {
      this.edits.set(chunkKey, new Map(Object.entries(blocks)));
    }
  }

  // All saved changes for one chunk (or undefined if it has none).
  forChunk(chunkKey) {
    return this.edits.get(chunkKey);
  }

  // Remember that a block changed. If it was changed back to what the terrain
  // originally had there, forget it instead (nothing to remember).
  record(chunkKey, lx, y, lz, id, originalId) {
    const pos = `${lx},${y},${lz}`;
    let chunkEdits = this.edits.get(chunkKey);
    if (id === originalId) {
      if (!chunkEdits?.has(pos)) return;
      chunkEdits.delete(pos);
      if (chunkEdits.size === 0) this.edits.delete(chunkKey);
    } else {
      if (!chunkEdits) {
        chunkEdits = new Map();
        this.edits.set(chunkKey, chunkEdits);
      }
      chunkEdits.set(pos, id);
    }
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DELAY_MS);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    if (!this.dirty || this.disabled) return;
    const data = {};
    for (const [chunkKey, blocks] of this.edits) {
      data[chunkKey] = Object.fromEntries(blocks);
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      this.dirty = false;
      this.onSaved?.();
    } catch (err) {
      // Private browsing or storage full: keep playing, just don't save.
      console.warn('Could not save world changes:', err);
    }
  }

  // Wipe every saved change (used by the "Reset world" button).
  clear() {
    clearTimeout(this.saveTimer);
    this.edits.clear();
    this.dirty = false;
    this.disabled = true;
    try {
      localStorage.removeItem(this.storageKey);
    } catch (err) {
      console.warn('Could not clear saved world changes:', err);
    }
  }
}

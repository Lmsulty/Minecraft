// Kevin's name: what the player has called their robot companion.
//
// It starts as "Kevin", and the player can rename him: look at him and press
// N, type a new name, Enter saves it, Escape cancels. The name is saved in
// the browser (localStorage), so it stays after a reload. "Reset world" on
// the pause screen puts it back to "Kevin".
//
// Anything that shows or says his name (the name tag now, his speech bubbles
// and chat later) should use getKevinName(), and onKevinNameChange() to hear
// about renames.

const STORAGE_KEY = 'kevinName';
export const DEFAULT_NAME = 'Kevin';
export const MAX_NAME_LENGTH = 16;

let name = load();
const listeners = [];

// His current name.
export function getKevinName() {
  return name;
}

// Call `listener(newName)` whenever he's renamed.
export function onKevinNameChange(listener) {
  listeners.push(listener);
}

// Rename him. Extra spaces are tidied up. Returns false (and changes
// nothing) if the new name is empty.
export function setKevinName(newName) {
  const clean = newName.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  if (!clean) return false;
  name = clean;
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch (err) {
    console.warn('Could not save Kevin\'s name:', err);
  }
  for (const listener of listeners) listener(name);
  return true;
}

// Back to "Kevin" (used by "Reset world").
export function resetKevinName() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Could not clear Kevin\'s name:', err);
  }
  name = DEFAULT_NAME;
  for (const listener of listeners) listener(name);
}

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim().slice(0, MAX_NAME_LENGTH);
  } catch (err) {
    console.warn('Could not load Kevin\'s name:', err);
  }
  return DEFAULT_NAME;
}

// ---- The rename box ----
// Press N while looking at him (`isLookingAtHim()` says whether you are).
// The mouse is freed while you type (like the inventory screen), and the
// game ignores your typing, so typing "b" or "t" doesn't toggle anything.
export class RenameBox {
  constructor(element, player, isLookingAtHim) {
    this.element = element;
    this.player = player;
    this.isOpen = false;

    element.innerHTML = `
      <label for="kevin-rename-input">Rename your robot</label>
      <input id="kevin-rename-input" type="text" maxlength="${MAX_NAME_LENGTH}" autocomplete="off" spellcheck="false" />
      <small>Enter to save · Esc to cancel</small>`;
    this.input = element.querySelector('input');

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyN' || e.repeat || this.isOpen) return;
      if (!player.locked || !isLookingAtHim()) return;
      e.preventDefault(); // so the "n" doesn't get typed into the box
      this.open();
    });

    this.input.addEventListener('keydown', (e) => {
      // Keep the game from seeing these keys (B, T, E, 1-9 ...) while typing.
      e.stopPropagation();
      if (e.code === 'Enter') {
        setKevinName(this.input.value);
        this.close();
      } else if (e.code === 'Escape') {
        this.close();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.player.openMenu(); // free the mouse, but don't pause
    this.element.classList.add('is-open');
    this.input.value = getKevinName();
    this.input.focus();
    this.input.select(); // so typing replaces the old name straight away
  }

  close() {
    this.isOpen = false;
    this.element.classList.remove('is-open');
    this.input.blur();
    this.player.closeMenu({ resume: true }); // back to playing
  }
}

import { getKevinName } from './kevinName.js';

// Subtitles for Kevin: when he says something and you can't see his speech
// bubble (he's behind you, off to the side, or far away), his line shows at
// the bottom of the screen instead, like a caption: "Kevin: ...".
// It follows the bubble: same line, same time on screen, and it hides as
// soon as the bubble comes into view. Colours: THEME.ui (--kevin-caption-...).

export class KevinCaption {
  constructor(element) {
    this.element = element;
    element.innerHTML = '<span class="kevin-caption-name"></span> <span class="kevin-caption-text"></span>';
    this.nameElement = element.querySelector('.kevin-caption-name');
    this.textElement = element.querySelector('.kevin-caption-text');
    this.text = null;
  }

  // Every frame: show the bubble's line here only while the bubble itself can't be seen.
  update(bubble) {
    const show = bubble.isShowing() && !bubble.onScreen;
    if (show && bubble.text !== this.text) {
      this.text = bubble.text;
      this.nameElement.textContent = `${getKevinName()}:`; // plain text, never HTML
      this.textElement.textContent = bubble.text;
    }
    this.element.classList.toggle('is-visible', show);
  }
}

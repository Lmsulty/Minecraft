import { toScreen } from './kevinTag.js';
import { getKevinName } from './kevinName.js';

// The speech bubble over Kevin's head: shows what he's saying, with his
// (current) name on top. Like the name tag, it's a web page element moved
// every frame to where his head is on screen, so it follows the curved view.
// It sits just above the name tag, stays up long enough to read, then fades.
// Colours: THEME.ui (--kevin-bubble-...).

const MIN_TIME = 3;          // seconds a line stays up, at least...
const TIME_PER_LETTER = 0.06; // ...plus this much per letter...
const MAX_TIME = 10;          // ...but never longer than this
const AFTER_SPEAKING = 1.5;   // stays at least this long after he finishes saying it
const HIDE_BEYOND = 20;       // blocks: too far away to read (the caption shows instead)

export class KevinBubble {
  constructor(element) {
    this.element = element;
    element.innerHTML = '<div class="kevin-bubble-name"></div><div class="kevin-bubble-text"></div>';
    this.nameElement = element.querySelector('.kevin-bubble-name');
    this.textElement = element.querySelector('.kevin-bubble-text');
    this.timeLeft = 0;
    this.text = '';        // the line being shown
    this.onScreen = false; // can you see the bubble right now? (if not, kevinCaption.js shows the line)
    this.screen = { x: 0, y: 0 };
  }

  // Is there a line up right now (whether or not you can see it)?
  isShowing() {
    return this.timeLeft > 0;
  }

  // Show a line. `speakingFor` = roughly how long he'll take to say it.
  show(text, speakingFor) {
    this.text = text;
    this.nameElement.textContent = getKevinName();
    this.textElement.textContent = text; // plain text, never HTML
    const readingTime = Math.min(MAX_TIME, Math.max(MIN_TIME, text.length * TIME_PER_LETTER));
    this.timeLeft = Math.max(readingTime, speakingFor + AFTER_SPEAKING);
    this.element.classList.add('is-visible');
  }

  hide() {
    this.timeLeft = 0;
    this.onScreen = false;
    this.element.classList.remove('is-visible');
  }

  // Every frame: count down, and follow his head. `point` = just above his
  // head in the flat world (where the name tag is).
  update(dt, point, camera) {
    if (this.timeLeft <= 0) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.hide();
      return;
    }
    const far = point.distanceTo(camera.position) > HIDE_BEYOND;
    // On screen = in front of you, and not off past the edges.
    const onScreen = !far && !!toScreen(point, camera, this.screen) &&
      this.screen.x > 0 && this.screen.x < window.innerWidth &&
      this.screen.y > 0 && this.screen.y < window.innerHeight;
    this.onScreen = onScreen;
    this.element.style.display = onScreen ? 'block' : 'none';
    if (onScreen) {
      this.element.style.transform =
        `translate(${this.screen.x.toFixed(1)}px, ${this.screen.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}

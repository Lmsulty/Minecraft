import { askKevin, isOnlineBrainConfigured } from './kevinReply.js';
import { getKevinName } from './kevinName.js';
import { displayName } from './items.js';

// The chat box: talk to Kevin.
//
//   Enter    open the box (while playing)
//   Enter    send your message (the box closes and you keep playing)
//   Escape   close the box without sending
//
// While the box is open the mouse is free and the game ignores your typing
// (like the rename box), and your view is put back exactly where it was
// when it closes (player.js). While Kevin works out his reply his screen
// shows his thinking face; then he says it like any other line (speech
// bubble, caption if he's out of sight, and voice), through kevinTalk.js.
//
// The reply itself comes from askKevin() in kevinReply.js.

const MAX_MESSAGE_LENGTH = 300;
const LOG_LENGTH = 6; // messages shown in the box

export class KevinChat {
  constructor(element, { player, kevin, talk, hotbar, inventory, mobs, dayNight }) {
    this.element = element;
    this.player = player;
    this.kevin = kevin;
    this.talk = talk;
    this.hotbar = hotbar;
    this.inventory = inventory;
    this.mobs = mobs;
    this.dayNight = dayNight;
    this.isOpen = false;
    this.waiting = false; // waiting for Kevin's reply
    this.log = [];        // [{ who, text }]

    element.innerHTML = `
      <div class="kevin-chat-log"></div>
      <input type="text" maxlength="${MAX_MESSAGE_LENGTH}" autocomplete="off" spellcheck="false" />
      <small class="kevin-chat-help"></small>`;
    this.logElement = element.querySelector('.kevin-chat-log');
    this.input = element.querySelector('input');
    this.help = element.querySelector('.kevin-chat-help');

    document.addEventListener('keydown', (e) => {
      if ((e.code !== 'Enter' && e.code !== 'NumpadEnter') || e.repeat || this.isOpen) return;
      if (!player.locked) return; // only while playing (not paused, not in another menu)
      e.preventDefault();
      this.open();
    });

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // keep the game from seeing your typing (B, T, E, M, 1-9 ...)
      if (e.isComposing) return; // still typing an accented letter etc.
      if (e.code === 'Enter' || e.code === 'NumpadEnter') this.send();
      else if (e.code === 'Escape') this.close();
    });
  }

  open() {
    this.isOpen = true;
    this.player.openMenu(); // free the mouse, but don't pause (and remember where you were looking)
    this.element.classList.add('is-open');
    this.input.placeholder = this.waiting ? `${getKevinName()} is thinking...` : `Say something to ${getKevinName()}...`;
    this.help.textContent = `Enter to send · Esc to close · ${isOnlineBrainConfigured() ? 'online brain' : 'offline brain'}`;
    this.renderLog();
    this.input.focus();
  }

  close() {
    this.isOpen = false;
    this.element.classList.remove('is-open');
    this.input.blur();
    this.player.closeMenu({ resume: true }); // back to playing, view put back where it was
  }

  send() {
    const message = this.input.value.trim();
    if (!message) {
      this.close();
      return;
    }
    if (this.waiting) return; // one question at a time: he's still thinking about the last one
    this.input.value = '';
    this.addToLog('You', message);
    this.close();

    this.waiting = true;
    this.kevin.mood = 'thinking';
    askKevin(message, this.gameContext())
      .catch(() => ({ text: '...I lost my train of thought. Ask me again.', mood: 'talking' }))
      .then((answer) => {
        this.waiting = false;
        this.kevin.mood = 'idle';
        this.addToLog(getKevinName(), answer.text);
        this.talk.say(answer); // bubble, caption and voice, like his other lines
      });
  }

  addToLog(who, text) {
    this.log.push({ who, text });
    if (this.log.length > LOG_LENGTH) this.log.shift();
    if (this.isOpen) this.renderLog();
  }

  renderLog() {
    this.logElement.replaceChildren(...this.log.map(({ who, text }) => {
      const line = document.createElement('div');
      const name = document.createElement('b');
      name.className = who === 'You' ? 'kevin-chat-you' : 'kevin-chat-kevin';
      name.textContent = `${who}: `;
      line.append(name, text); // text is added as plain text, never HTML
      return line;
    }));
    this.logElement.style.display = this.log.length ? 'block' : 'none';
  }

  // A few facts about the game right now, sent along with your message so
  // Kevin's online brain can mention them.
  gameContext() {
    const hour = this.dayNight.hour;
    const clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
    const part = hour >= 20 || hour < 6 ? 'night' : hour < 9 ? 'morning' : hour < 17 ? 'day' : 'evening';

    const held = this.hotbar.selectedBlock;

    // Creatures within 24 blocks, counted by kind: "3 Grazer, 1 Glow critter".
    const p = this.player.position;
    const counts = {};
    for (const mob of this.mobs.list) {
      if (mob.dying || Math.hypot(mob.position.x - p.x, mob.position.z - p.z) > 24) continue;
      counts[mob.type.name] = (counts[mob.type.name] ?? 0) + 1;
    }
    const creatures = Object.entries(counts).map(([name, n]) => `${n} ${name}`).join(', ');

    return {
      timeOfDay: `${part} (${clock})`,
      holding: held === null ? 'nothing' : displayName(held),
      nearbyCreatures: creatures || 'none',
      recentEvents: this.talk.recentEventsText() || 'nothing much',
      mode: this.inventory.creative ? 'creative (unlimited blocks)' : 'survival',
    };
  }
}

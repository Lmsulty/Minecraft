import { THEME } from './theme.js';

// Graphics quality: Auto / Low / Medium / High, chosen on the pause screen.
//
// What each level does is set in theme.js (THEME.graphics.levels). This file:
//  - remembers the player's choice in the browser (localStorage)
//  - applies a level: sharpness, draw distance, haze, sky detail and how many creatures
//  - in Auto mode, watches the FPS box's "Slowest" number and steps down a
//    level if the game keeps stuttering, with a small message. Auto never
//    steps back up on its own (that would make the picture flicker between
//    levels). It remembers the level it settled on for next time; choosing
//    Auto again on the pause screen starts it from High.

const STORAGE_KEY = 'voxel-graphics';
const LEVELS = ['low', 'medium', 'high']; // lowest first
const NAMES = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High' };
const NOTICE_SECONDS = 3;

export class GraphicsSettings {
  // Made before the renderer, because edge smoothing (antialias) has to be
  // decided when the renderer is created.
  constructor() {
    const saved = loadSaved();
    this.choice = saved.choice in NAMES ? saved.choice : 'auto';
    this.autoLevel = LEVELS.includes(saved.autoLevel) ? saved.autoLevel : 'high';
    this.levelName = this.choice === 'auto' ? this.autoLevel : this.choice;
    this.startedWithAntialias = this.level.antialias;

    // Auto mode: recent readings (true = too slow), and seconds to wait
    // before judging (the world is still loading at the start).
    this.readings = [];
    this.waitSeconds = THEME.graphics.auto.warmupSeconds;
  }

  // The settings for the current level (from theme.js).
  get level() {
    return THEME.graphics.levels[this.levelName];
  }

  // e.g. "Auto (High)" or "Low"
  label() {
    const name = NAMES[this.levelName];
    return this.choice === 'auto' ? `Auto (${name})` : name;
  }

  // Connect to the rest of the game and apply the starting level.
  // The sky was already built with this level's detail, so it's skipped here.
  attach({ renderer, world, scene, dayNight, player, fps, mobs, buttons, notice }) {
    Object.assign(this, { renderer, world, scene, dayNight, player, mobs, notice });
    this.apply({ sky: false });

    // The FPS box gives us each new "Slowest" reading, and shows our label.
    fps.onReading = (slowestMs, seconds) => this.onReading(slowestMs, seconds);
    fps.graphicsText = () => this.label();

    // Pause screen buttons. Clicks here must not also count as "click to play".
    this.buttons = [...buttons.querySelectorAll('button[data-choice]')];
    buttons.addEventListener('click', (e) => {
      e.stopPropagation();
      const button = e.target.closest('button[data-choice]');
      if (!button) return;
      button.blur(); // otherwise pressing Space later would click it again
      this.choose(button.dataset.choice);
    });
    this.updateButtons();

    // Moving the window to another screen can change how sharp it is.
    window.addEventListener('resize', () => this.applyPixelRatio());
  }

  // ---- Applying a level ----

  apply({ sky = true } = {}) {
    const level = this.level;
    this.applyPixelRatio();
    this.world.setDrawRadius(level.drawRadius, level.chunkBudgetMs);
    this.scene.fog.near = level.haze[0];
    this.scene.fog.far = level.haze[1];
    this.mobs.setGraphics(level);
    if (sky) this.dayNight.setSkyDetail(level);
  }

  // Sharp screens have more pixels per screen pixel (devicePixelRatio, 2 on
  // a Retina Mac). Draw at most `pixelRatio` of them.
  applyPixelRatio() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.level.pixelRatio));
  }

  // ---- The player picks a level on the pause screen ----

  choose(choice) {
    // Picking the same fixed level again does nothing. Picking Auto again
    // starts Auto over from High.
    if (choice === this.choice && choice !== 'auto') return;
    this.choice = choice;
    if (choice === 'auto') this.autoLevel = 'high';
    this.switchTo(choice === 'auto' ? this.autoLevel : choice);
    // Edge smoothing can only change when the page loads.
    if (this.level.antialias !== this.startedWithAntialias) {
      this.showNotice('Edge smoothing will change when you reload the page');
    }
  }

  switchTo(levelName) {
    const changed = levelName !== this.levelName;
    this.levelName = levelName;
    this.save();
    if (changed) this.apply();
    this.updateButtons();
    // Give the new level a few seconds to settle before Auto judges it.
    this.readings = [];
    this.waitSeconds = Math.max(this.waitSeconds, THEME.graphics.auto.settleSeconds);
  }

  updateButtons() {
    for (const button of this.buttons) {
      const choice = button.dataset.choice;
      button.classList.toggle('selected', choice === this.choice);
      // The Auto button also shows which level Auto is on.
      button.textContent = choice === 'auto' && this.choice === 'auto'
        ? `Auto (${NAMES[this.levelName]})` : NAMES[choice];
    }
  }

  // ---- Auto mode ----

  // Called by the FPS box every half second with the slowest frame (ms)
  // since the last reading, and how many seconds that reading covers.
  onReading(slowestMs, seconds) {
    if (this.choice !== 'auto') return;
    const rules = THEME.graphics.auto;

    // Only judge while actually playing. When paused or in a menu, start
    // over, and skip the first reading after coming back (it includes the
    // moment the game resumed).
    if (!this.player.locked) {
      this.readings = [];
      this.waitSeconds = Math.max(this.waitSeconds, seconds);
      return;
    }
    if (this.waitSeconds > 0) {
      this.waitSeconds -= seconds;
      return;
    }
    if (slowestMs > rules.ignoreOverMs) return; // e.g. the tab was hidden for a moment

    this.readings.push(slowestMs > rules.slowestMs);
    if (this.readings.length > rules.outOf) this.readings.shift();
    const tooSlow = this.readings.filter((slow) => slow).length;
    if (tooSlow < rules.badReadings) return;

    const lower = LEVELS[LEVELS.indexOf(this.levelName) - 1];
    if (!lower) return; // already on the lowest level
    this.autoLevel = lower;
    this.switchTo(lower);
    this.showNotice('Graphics lowered for smoother play');
  }

  // ---- Small message near the top of the screen ----

  showNotice(text) {
    this.notice.textContent = text;
    this.notice.classList.add('show');
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.classList.remove('show'), NOTICE_SECONDS * 1000);
  }

  // ---- Saving ----

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice: this.choice, autoLevel: this.autoLevel }));
    } catch {
      // Storage can be full or switched off (e.g. private browsing). The
      // setting still works, it just won't be remembered.
    }
  }
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

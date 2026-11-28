// Kevin's voice: the browser's built-in text-to-speech (speechSynthesis)
// says his lines out loud. No sound files, nothing downloaded.
//
// He prefers a British English voice, tuned to sound like a slightly prim,
// proper little robot. If the browser has no voices at all he stays silent
// (you still get his speech bubble, captions and moving mouth).
//
// Mute: press M, or use the "Robot voice" button on the pause screen. The
// choice is saved in the browser. When muted he still "talks" on screen.
//
// Only one line at a time: speak() always stops the previous line first.
// (kevinTalk.js decides whether a new line waits or cuts in.)
//
// Chrome's speech can get stuck, so every line has safety checks: see
// "Keeping Chrome's speech from getting stuck" below.

// ==========================================================
//  VOICE SETTINGS: tweak these to change how he sounds.
// ==========================================================
const SPEECH = {
  pitch: 0.9,     // 0 to 2. Normal is 1. A little higher = prim little robot.
  rate: 1.0,      // 0.1 to 10. Normal is 1. Speaking speed.
  volume: 1.0,    // 0 to 1.
};

// Voices to use if this computer has them, best first (names differ between
// computers and browsers). If none of these are there, he uses any British
// English (en-GB) voice, then any English voice at all.
const PREFERRED_VOICES = [
  'Google UK English Male',   // Chrome (the favourite, picked with the voice tester)
  'Daniel',                   // Mac / iPhone, British
  'Microsoft Ryan',           // Windows / Edge, British
  'Microsoft George',         // Windows, British
  'Oliver', 'Arthur',         // newer Mac British voices
];
// ==========================================================

const STORAGE_KEY = 'kevinMuted';

// How long a line takes to say, roughly (used when muted, when there's no
// voice, and as a backup if the browser never says it finished).
export function speakingTime(text) {
  const words = text.split(/\s+/).length;
  return Math.max(1.2, (words * 0.36) / SPEECH.rate);
}

// ---- Keeping Chrome's speech from getting stuck ----
// Chrome's speech (especially the online Google voices) sometimes hangs: a
// line never starts, never finishes, or stops after about 15 seconds. These
// safety checks catch that, and every one of them is logged in the console
// (look for "[Kevin voice]").
const START_TIMEOUT = 3;       // seconds a line gets to start making sound
const FINISH_SPARE = 3;        // seconds a line may run over its expected length
const TRIES = 2;               // try a stuck line once more, then give up on it
const FAILS_BEFORE_SWITCH = 2; // a voice that fails this many times in a row is swapped out
const KEEP_ALIVE_EVERY = 10;   // seconds between "keep talking" nudges (Chrome cuts off at ~15)
const GAP_AFTER_CANCEL = 60;   // ms to wait after clearing the queue (Chrome can drop a line spoken instantly after)

const log = (...args) => console.info('[Kevin voice]', ...args);
const warn = (...args) => console.warn('[Kevin voice]', ...args);
const describe = (voice) => voice ? `"${voice.name}" (${voice.lang}, ${voice.localService ? 'on this computer' : 'online'})` : 'the browser default';

export class KevinVoice {
  constructor(button, showMessage) {
    this.supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    this.button = button;
    this.showMessage = showMessage; // shows "Robot voice: off" etc. above the hotbar
    this.muted = loadMuted();
    this.voice = null;
    this.line = null;           // the line he's saying now (see speak())
    this.lineNumber = 0;
    this.badVoices = new Set(); // voices that kept failing: not used again this session
    this.failsInARow = 0;       // how many times the current voice has failed in a row
    this.unlocked = false;      // Chrome only allows speech after the player's first click or key press
    this.toldLocked = false;

    if (this.supported) {
      // A reload doesn't always clear Chrome's speech queue: a line stuck
      // from before can block every new one. Clear it out first.
      if (speechSynthesis.speaking || speechSynthesis.pending) log('cleared a line left stuck from before the reload');
      speechSynthesis.cancel();

      this.pickVoice();
      // The list of voices often arrives a moment after the page loads
      // (Chrome's Google voices come last).
      speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());

      // Speech only works once the player has clicked or pressed a key. Some
      // browsers (Safari) also want something spoken during that first press,
      // so say nothing, silently.
      const unlock = () => {
        this.unlocked = true;
        const silent = new SpeechSynthesisUtterance(' ');
        silent.volume = 0;
        speechSynthesis.speak(silent);
        log('speech allowed now (first click or key press)');
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
      };
      document.addEventListener('pointerdown', unlock);
      document.addEventListener('keydown', unlock);
    } else {
      log('this browser has no speech at all, so he only talks on screen');
    }

    // M toggles mute (not while typing in a text box: those keys don't reach here).
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat) return;
      this.setMuted(!this.muted);
      this.showMessage(`Robot voice: ${this.muted ? 'off' : 'on'} (M)`);
    });
    button.addEventListener('click', (e) => {
      e.stopPropagation(); // don't also count as "click to play"
      this.setMuted(!this.muted);
    });
    this.updateButton();
  }

  // Best voice available: a preferred one, else any British one, else any
  // English one. Voices that kept failing (badVoices) are skipped, so this
  // also finds "the next one on the list" after a switch.
  pickVoice() {
    const voices = speechSynthesis.getVoices().filter((v) => !this.badVoices.has(v.name));
    const lang = (v) => v.lang.toLowerCase().replace('_', '-');
    const british = voices.filter((v) => lang(v) === 'en-gb');
    const english = voices.filter((v) => lang(v).startsWith('en'));
    const before = this.voice;
    this.voice =
      PREFERRED_VOICES.map((name) => english.find((v) => v.name.startsWith(name))).find(Boolean) ??
      british.find((v) => v.localService) ??
      british[0] ??
      english[0] ??
      null;
    if (this.voice?.name !== before?.name) {
      log(`using ${describe(this.voice)}, ${speechSynthesis.getVoices().length} voices available`);
    }
  }

  // Can he actually speak? (Supported, and at least one voice.)
  hasVoice() {
    return this.supported && speechSynthesis.getVoices().length > 0;
  }

  setMuted(muted) {
    this.muted = muted;
    // Silence the current line, but let it "finish" on time as normal (so
    // his mouth stops at the right moment).
    if (muted && this.supported) {
      const line = this.line;
      if (line) {
        this.clearTimers(line);
        line.attempt = 0; // so the cancelled line's events are ignored
        line.timer = setTimeout(() => this.finish(line), line.time * 1000);
      }
      speechSynthesis.cancel();
    }
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch (err) {
      console.warn('Could not save the mute setting:', err);
    }
    this.updateButton();
  }

  updateButton() {
    this.button.textContent = `Robot voice: ${this.muted ? 'Off' : 'On'} (M)`;
    this.button.classList.toggle('selected', !this.muted);
  }

  // Say a line out loud, stopping whatever he was saying. `onDone` is called
  // once when he finishes (after the expected speaking time if muted or silent,
  // or if the browser couldn't say it).
  speak(text, onDone) {
    this.stop();
    const line = { number: ++this.lineNumber, text, onDone, time: speakingTime(text), attempt: 0, finished: false };
    this.line = line;

    const silent = this.muted || !this.hasVoice() || !this.unlocked;
    if (!this.unlocked && !this.muted && this.supported && !this.toldLocked) {
      this.toldLocked = true;
      log('waiting for your first click before speaking out loud (Chrome blocks speech until then)');
    }
    if (silent) {
      line.timer = setTimeout(() => this.finish(line), line.time * 1000);
      return;
    }
    this.attempt(line, 1);
  }

  // One go at saying a line. The watchdog timers catch it getting stuck.
  attempt(line, attempt) {
    this.clearTimers(line);
    line.attempt = attempt;
    line.started = false;
    // Is this still the go we're waiting on? (Not a newer line or retry, not finished.)
    const current = () => this.line === line && line.attempt === attempt && !line.finished;

    // Clear the queue first, so nothing stuck in it blocks this line.
    speechSynthesis.cancel();

    const voice = this.voice;
    const utterance = new SpeechSynthesisUtterance(line.text);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-GB';
    }
    utterance.pitch = SPEECH.pitch;
    utterance.rate = SPEECH.rate;
    utterance.volume = SPEECH.volume;
    line.utterance = utterance; // kept, so Chrome doesn't throw it away halfway through

    utterance.onstart = () => {
      if (!current()) return;
      line.started = true;
      clearTimeout(line.timer);
      // Watchdog 2: it should finish a little after its expected length.
      line.timer = setTimeout(() => this.failed(line, attempt, voice,
        `still talking ${FINISH_SPARE}s after it should have finished`), (line.time + FINISH_SPARE) * 1000);
      this.keepAlive(line, voice);
    };
    utterance.onend = () => {
      if (!current()) return;
      if (!line.started) {
        this.failed(line, attempt, voice, 'ended without ever starting');
        return;
      }
      this.failsInARow = 0; // this voice works
      this.finish(line);
    };
    utterance.onerror = (e) => {
      if (!current()) return;
      // "interrupted" / "canceled" = we stopped it ourselves, nothing went wrong.
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      this.failed(line, attempt, voice, `error "${e.error}"`);
    };

    // Watchdog 1: it should start making sound within a few seconds.
    line.timer = setTimeout(() => this.failed(line, attempt, voice,
      `didn't start within ${START_TIMEOUT}s`), START_TIMEOUT * 1000);

    setTimeout(() => {
      if (!current()) return;
      speechSynthesis.resume(); // in case the browser left speech paused
      speechSynthesis.speak(utterance);
    }, GAP_AFTER_CANCEL);
  }

  // A go at a line got stuck or failed: log it, try once more, and swap out
  // a voice that keeps failing.
  failed(line, attempt, voice, reason) {
    if (this.line !== line || line.attempt !== attempt || line.finished) return;
    this.clearTimers(line);
    line.attempt = 0; // ignore anything else this go reports
    speechSynthesis.cancel();
    warn(`${describe(voice)} ${reason} (try ${attempt} of ${TRIES}): "${line.text.slice(0, 60)}"`);

    this.failsInARow++;
    if (voice && this.failsInARow >= FAILS_BEFORE_SWITCH) {
      this.badVoices.add(voice.name);
      this.failsInARow = 0;
      this.pickVoice();
      warn(`${describe(voice)} failed ${FAILS_BEFORE_SWITCH} times in a row; switching to ${describe(this.voice)} for the rest of this visit`);
    }

    if (attempt < TRIES) {
      log('trying that line again');
      this.attempt(line, attempt + 1);
    } else {
      warn('giving up on that line (he still says it on screen)');
      this.finish(line);
    }
  }

  // Chrome quietly stops speech after about 15 seconds (its online voices
  // especially). A pause + resume every few seconds keeps it going. Only for
  // online voices: on built-in ones the nudge can cause a tiny stutter, and
  // they don't have the problem. Any voice that's found paused is resumed.
  keepAlive(line, voice) {
    clearInterval(line.keepAlive);
    let nudges = 0;
    line.keepAlive = setInterval(() => {
      if (this.line !== line || line.finished) {
        clearInterval(line.keepAlive);
        return;
      }
      if (speechSynthesis.paused) {
        log('speech was paused mid-line; resuming');
        speechSynthesis.resume();
      } else if (voice && !voice.localService) {
        speechSynthesis.pause();
        speechSynthesis.resume();
        if (++nudges === 1) log('long line: nudging Chrome to keep talking past 15 seconds');
      }
    }, KEEP_ALIVE_EVERY * 1000);
  }

  clearTimers(line) {
    clearTimeout(line.timer);
    clearInterval(line.keepAlive);
  }

  // The line is over (said, given up on, or silent): tell kevinTalk.js, once.
  finish(line) {
    if (line.finished) return;
    line.finished = true;
    this.clearTimers(line);
    if (this.line === line) this.line = null;
    line.onDone();
  }

  // Stop talking right now. (The stopped line never reports "finished":
  // kevinTalk.js only stops him to start a newer line.)
  stop() {
    const line = this.line;
    if (!line) return;
    this.clearTimers(line);
    line.attempt = 0;
    this.line = null;
    if (this.supported) speechSynthesis.cancel();
  }
}

function loadMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

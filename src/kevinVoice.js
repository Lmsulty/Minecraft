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

export class KevinVoice {
  constructor(button, showMessage) {
    this.supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    this.button = button;
    this.showMessage = showMessage; // shows "Robot voice: off" etc. above the hotbar
    this.muted = loadMuted();
    this.voice = null;
    this.current = null;    // the line being spoken (kept so the browser doesn't drop it halfway)
    this.lineNumber = 0;

    if (this.supported) {
      this.pickVoice();
      // The list of voices often arrives a moment after the page loads.
      speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());

      // Some browsers (Safari) only allow speech once something has been
      // spoken during a click or key press, so say nothing, silently, on the first one.
      const unlock = () => {
        const silent = new SpeechSynthesisUtterance(' ');
        silent.volume = 0;
        speechSynthesis.speak(silent);
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
      };
      document.addEventListener('pointerdown', unlock);
      document.addEventListener('keydown', unlock);
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

  // Best voice available: a preferred one, else any British one, else any English one.
  pickVoice() {
    const voices = speechSynthesis.getVoices();
    const lang = (v) => v.lang.toLowerCase().replace('_', '-');
    const british = voices.filter((v) => lang(v) === 'en-gb');
    const english = voices.filter((v) => lang(v).startsWith('en'));
    this.voice =
      PREFERRED_VOICES.map((name) => english.find((v) => v.name.startsWith(name))).find(Boolean) ??
      british.find((v) => v.localService) ??
      british[0] ??
      english[0] ??
      null;
  }

  // Can he actually speak? (Supported, and at least one voice.)
  hasVoice() {
    return this.supported && speechSynthesis.getVoices().length > 0;
  }

  setMuted(muted) {
    this.muted = muted;
    // Silence the current line, but let it "finish" as normal (so his mouth
    // stops at the right time): the browser reports it ended, or the backup
    // timer does.
    if (muted && this.supported) speechSynthesis.cancel();
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
  // once when he finishes (after the expected speaking time if muted or silent).
  speak(text, onDone) {
    this.stop();
    const number = ++this.lineNumber;
    let finished = false;
    const done = () => {
      if (finished || number !== this.lineNumber) return; // already done, or a newer line took over
      finished = true;
      clearTimeout(this.backupTimer);
      onDone();
    };
    const time = speakingTime(text);

    if (this.muted || !this.hasVoice()) {
      this.backupTimer = setTimeout(done, time * 1000);
      return;
    }

    // Backup, in case the browser never says it finished.
    this.backupTimer = setTimeout(done, (time + 2) * 1000);
    const line = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      line.voice = this.voice;
      line.lang = this.voice.lang;
    } else {
      line.lang = 'en-GB';
    }
    line.pitch = SPEECH.pitch;
    line.rate = SPEECH.rate;
    line.volume = SPEECH.volume;
    line.onend = done;
    line.onerror = done;
    this.current = line;

    // Chrome sometimes silently drops a line spoken straight after stopping
    // another one, so leave a tiny gap if something was just cut off.
    const start = () => {
      if (number !== this.lineNumber) return;
      speechSynthesis.resume(); // in case the browser left speech paused
      speechSynthesis.speak(line);
    };
    if (this.justCancelled) setTimeout(start, 80);
    else start();
  }

  // Stop talking right now.
  stop() {
    this.lineNumber++; // so the old line's "finished" doesn't count
    clearTimeout(this.backupTimer);
    this.justCancelled = false;
    if (this.supported && (speechSynthesis.speaking || speechSynthesis.pending)) {
      speechSynthesis.cancel();
      this.justCancelled = true;
    }
    this.current = null;
  }
}

function loadMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

// Kevin's voice.
//
//  1. SPEECH: the browser's built-in text-to-speech (speechSynthesis) says
//     his lines out loud, tuned to sound like a small robot.
//  2. BLEEPS: little electronic blips made in code (Web Audio, no sound
//     files), played quietly underneath the speech. If the browser has no
//     speech voices at all, the bleeps are his whole voice, a bit louder.
//
// Mute: press M, or use the "Robot voice" button on the pause screen. That
// silences both. The choice is saved in the browser. When muted he still
// "talks" (speech bubble, captions and moving mouth), just silently.
//
// Only one line at a time: speak() always stops the previous line first.
// (kevinTalk.js decides whether a new line waits or cuts in.)

// ==========================================================
//  VOICE SETTINGS: tweak these to change how he sounds.
// ==========================================================
const SPEECH = {
  pitch: 1.5,     // 0 to 2. Normal is 1. Higher = smaller robot.
  rate: 1.1,      // 0.1 to 10. Normal is 1. Speaking speed.
  volume: 0.9,    // 0 to 1.
};

// English voices to use if this computer has them, best first (names
// differ between computers and browsers). If none of these are there, any
// English voice is used. Try putting 'Fred' first on a Mac for an old-school
// robot sound.
const PREFERRED_VOICES = [
  'Google US English', 'Samantha', 'Microsoft Zira', 'Microsoft David',
  'Alex', 'Daniel', 'Karen', 'Google UK English Female',
];

const BLEEPS = {
  under: 0.03,    // volume of bleeps underneath the speech (0 = no bleeps; try up to 0.08)
  alone: 0.1,     // volume when bleeps are his only voice (no speech voices available)
  low: 500,       // lowest bleep pitch (Hz)
  high: 1300,     // highest bleep pitch (Hz)
  length: 0.06,   // seconds each bleep lasts
  every: 0.11,    // seconds between bleeps (roughly)
  wave: 'square', // 'square' = buzzy, 'triangle' = softer, 'sine' = smooth
};
// ==========================================================

const STORAGE_KEY = 'kevinMuted';

// How long a line takes to say, roughly (used when muted, for the bleeps-only
// voice, and as a backup if the browser never says it finished).
export function speakingTime(text) {
  const words = text.split(/\s+/).length;
  return Math.max(1.2, (words * 0.36) / SPEECH.rate);
}

export class KevinVoice {
  constructor(button, showMessage) {
    this.speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    this.button = button;
    this.showMessage = showMessage; // shows "Robot voice: off" etc. above the hotbar
    this.muted = loadMuted();
    this.voice = null;
    this.current = null;    // the line being spoken (kept so the browser doesn't drop it halfway)
    this.audio = null;      // Web Audio, made on the first click or key press (browsers require that)
    this.bleepTimer = null;
    this.lineNumber = 0;

    if (this.speechSupported) {
      this.pickVoice();
      // The list of voices often arrives a moment after the page loads.
      speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());
    }

    // Browsers only allow sound after the player has clicked or pressed a
    // key, so get sound ready on the first one.
    const unlock = () => {
      this.unlockSound();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);

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

  pickVoice() {
    const voices = speechSynthesis.getVoices();
    const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    this.voice =
      PREFERRED_VOICES.map((name) => english.find((v) => v.name.startsWith(name))).find(Boolean) ??
      english.find((v) => v.lang.toLowerCase() === 'en-us' && v.localService) ??
      english[0] ??
      null;
  }

  // Can he use real speech right now? (Supported, and at least one voice.)
  hasSpeech() {
    return this.speechSupported && speechSynthesis.getVoices().length > 0;
  }

  unlockSound() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext && !this.audio) {
      this.audio = new AudioContext();
      this.output = this.audio.createGain();
      this.output.connect(this.audio.destination);
    }
    this.audio?.resume();
    // Some browsers (Safari) only allow speech once something has been
    // spoken during a click or key press, so say nothing, silently.
    if (this.speechSupported) {
      const silent = new SpeechSynthesisUtterance(' ');
      silent.volume = 0;
      speechSynthesis.speak(silent);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) {
      // Silence the current line, but let it "finish" as normal (so his
      // mouth stops at the right time): the browser reports it ended, or
      // the backup timer does.
      this.stopBleeps();
      if (this.speechSupported) speechSynthesis.cancel();
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
  // once when he finishes (after the expected speaking time if muted).
  speak(text, onDone) {
    this.stop();
    const number = ++this.lineNumber;
    let finished = false;
    const done = () => {
      if (finished || number !== this.lineNumber) return; // already done, or a newer line took over
      finished = true;
      clearTimeout(this.backupTimer);
      this.stopBleeps();
      onDone();
    };
    const time = speakingTime(text);

    if (this.muted) {
      this.backupTimer = setTimeout(done, time * 1000);
      return;
    }

    if (!this.hasSpeech()) {
      // No speech voices: bleeps are his voice, for about as long as the words would take.
      this.startBleeps(BLEEPS.alone);
      this.backupTimer = setTimeout(done, time * 1000);
      return;
    }

    // Backup, in case the browser never says it finished.
    this.backupTimer = setTimeout(done, (time + 2) * 1000);
    const line = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      line.voice = this.voice;
      line.lang = this.voice.lang;
    }
    line.pitch = SPEECH.pitch;
    line.rate = SPEECH.rate;
    line.volume = SPEECH.volume;
    line.onstart = () => {
      if (number === this.lineNumber) this.startBleeps(BLEEPS.under);
    };
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
    this.stopBleeps();
    this.justCancelled = false;
    if (this.speechSupported && (speechSynthesis.speaking || speechSynthesis.pending)) {
      speechSynthesis.cancel();
      this.justCancelled = true;
    }
    this.current = null;
  }

  // ---- Bleeps ----

  // Blip now and then (at `volume`) until stopBleeps().
  startBleeps(volume) {
    this.stopBleeps();
    if (!this.audio || volume <= 0) return;
    const next = () => {
      this.bleep(volume);
      // Uneven gaps sound more like chatter than a steady beat.
      this.bleepTimer = setTimeout(next, BLEEPS.every * (0.6 + Math.random() * 0.9) * 1000);
    };
    next();
  }

  stopBleeps() {
    clearTimeout(this.bleepTimer);
    this.bleepTimer = null;
  }

  // One short blip at a random pitch, with a quick fade in and out so it doesn't click.
  bleep(volume) {
    const a = this.audio;
    const now = a.currentTime;
    const tone = a.createOscillator();
    const gain = a.createGain();
    tone.type = BLEEPS.wave;
    tone.frequency.value = BLEEPS.low + Math.random() * (BLEEPS.high - BLEEPS.low);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.linearRampToValueAtTime(0, now + BLEEPS.length);
    tone.connect(gain).connect(this.output);
    tone.start(now);
    tone.stop(now + BLEEPS.length + 0.02);
  }
}

function loadMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

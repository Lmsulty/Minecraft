import './timeSlip.css';
import { THEME, PLANET } from './theme.js';
import { DAY_LENGTH_SECONDS, START_HOUR, FAST_SPEED } from './dayNight.js';
import { pickLine } from './kevinBrain.js';

// ==========================================================
//  THE TIME SLIP CLOCKS: a trip timer (step 6).
//
//  A trip starts when you take off from home, with both clocks at zero:
//    SHIP: how long you've really played on this trip ("1:48").
//    HOME: how much time has passed at home meanwhile. Each second of play
//          adds that many seconds times the time slip of the planet you're
//          on (theme.js, `timeSlip`), so it races ahead near the black hole:
//          1 minute on the water world is an hour at home. Shown as time
//          passed in home's game days ("+3 hours", "+2 days 4 hours").
//  Hopping between planets (water -> lava) keeps the trip going, just with
//  the new planet's slip. Landing back home ends it: Kevin says the totals,
//  and both clocks are back to zero for the next trip.
//
//  Separately, it keeps home's own date running (`homeTotal`), so the home
//  sky can follow it: after a long trip you land back home at a different
//  time of day. One game day = DAY_LENGTH_SECONDS of home time (dayNight.js).
//
//  Away from home, a cockpit-style readout in the corner shows the trip
//  (colours: --clock-* in THEME.ui). Kevin warns you now and then on planets
//  with a big time slip.
//
//  The clocks only run while you're actually playing, or during the takeoff
//  and landing cutscenes. They stop while you're paused, in the inventory or
//  on the star map (and while the browser tab is hidden). At home the sky
//  follows home time, so it stands still while paused too.
// ==========================================================

// ---- Timings ----
const SAVE_EVERY = 5;        // seconds between saves (it also saves as the page closes)
const WARN_FROM_SLIP = 10;   // Kevin warns you on planets with at least this much time slip
const WARN_EVERY = 90;       // ...every this many seconds of play there
const HOLD_WARNING = 15;     // a warning that's due waits up to this long for Kevin to stop talking

const SAVE_KEY = 'voxelgame.clocks.v2'; // v2: the trip timer (v1 was a running total)

// Home time (seconds) -> game hours at home.
const gameHours = (homeSeconds) => (homeSeconds * 24) / DAY_LENGTH_SECONDS;

// ---- Turning seconds into words (for Kevin) ----

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = (n) => NUMBER_WORDS[n] ?? String(n);
// "a minute", "four minutes", "12 days"... small numbers as words, so Kevin sounds natural.
function amount(n, unit) {
  if (n === 1) return `${unit === 'hour' ? 'an' : 'a'} ${unit}`;
  return `${numberWord(n)} ${unit}s`;
}

// Real time, e.g. "40 seconds", "four minutes", "an hour and ten minutes".
export function realTimeWords(seconds) {
  if (seconds < 60) return amount(Math.max(1, Math.round(seconds)), 'second');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return amount(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${amount(hours, 'hour')} and ${amount(rest, 'minute')}` : amount(hours, 'hour');
}

// Home time (in home seconds) in game time, e.g. "five hours",
// "two and a half days", "half a day", "six weeks".
export function homeTimeWords(homeSeconds) {
  const hours = gameHours(homeSeconds);
  if (hours < 1) return amount(Math.max(1, Math.round(hours * 60)), 'minute');
  if (hours < 12) return amount(Math.round(hours), 'hour');
  if (hours >= 14 * 24) return amount(Math.round(hours / (7 * 24)), 'week');
  const halves = Math.round(hours / 12); // days, to the nearest half
  const days = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (days === 0) return 'half a day';
  if (!half) return amount(days, 'day');
  return days === 1 ? 'a day and a half' : `${numberWord(days)} and a half days`;
}

// ---- And into clock faces (the readout and the star map) ----

// Ship time: "1:48", or "1:04:12" after an hour.
function shipClock(seconds) {
  const s = Math.floor(seconds);
  const two = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

// Home time passed, the two biggest units: "+40 min", "+3 hours 20 min",
// "+2 days 4 hours", "+5 weeks 3 days".
function homeClock(homeSeconds) {
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  const totalMinutes = Math.floor(gameHours(homeSeconds) * 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const totalDays = Math.floor(totalHours / 24);
  const days = totalDays % 7;
  const weeks = Math.floor(totalDays / 7);
  let text;
  if (weeks) text = plural(weeks, 'week') + (days ? ` ${plural(days, 'day')}` : '');
  else if (totalDays) text = plural(totalDays, 'day') + (hours ? ` ${plural(hours, 'hour')}` : '');
  else if (totalHours) text = plural(totalHours, 'hour') + (minutes ? ` ${minutes} min` : '');
  else text = `${minutes} min`;
  return `+${text}`;
}

export class TimeSlip {
  // readout: the empty <div> for the corner display
  // dayNight: so it knows when T (fast time) is on at home
  constructor(readout, dayNight) {
    this.readout = readout;
    this.dayNight = dayNight;
    this.atHome = THEME.planet === 'home';
    this.slip = PLANET.timeSlip;
    this.homeTotal = 0; // home's own clock, for its sky (home seconds since the game began)
    this.trip = null;   // the trip so far: { ship, home } seconds, or null (no trip running)
    this.load();

    // Away from home with no trip running (e.g. arrived with the debug P key): it starts now.
    if (!this.atHome && !this.trip) this.startTrip();

    this.saveTimer = SAVE_EVERY;
    this.warnTimer = WARN_EVERY;
    this.talk = null;  // Kevin's voice (setTalk), for the warnings
    this.player = null;
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
    });

    this.buildReadout();
    // At home, the sky follows home's own clock.
    if (this.atHome) dayNight.followClock(() => this.homeHour());
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!saved) return;
      this.homeTotal = Number(saved.homeTotal) || 0;
      if (saved.trip) this.trip = { ship: Number(saved.trip.ship) || 0, home: Number(saved.trip.home) || 0 };
    } catch (err) {
      console.warn('Could not load the clocks:', err);
    }
  }

  save() {
    if (this.disabled) return; // wiped by "Reset everything": don't save it back as the page reloads
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ homeTotal: this.homeTotal, trip: this.trip }));
    } catch (err) {
      console.warn('Could not save the clocks:', err);
    }
  }

  // Both clocks and home's date back to the very start, and the save
  // forgotten ("Reset everything" on the pause screen, which then reloads).
  clear() {
    this.disabled = true;
    this.homeTotal = 0;
    this.trip = null;
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {
      console.warn('Could not clear the clocks:', err);
    }
  }

  // So Kevin can warn you about the time slip. player: to only talk while you're playing.
  setTalk(talk, player) {
    this.talk = talk;
    this.player = player;
  }

  // ---- Trips ----

  // Taking off from home (cutscene.js): both clocks back to zero.
  startTrip() {
    this.trip = { ship: 0, home: 0 };
    this.save();
  }

  // The trip so far in words, for Kevin: { away, aged }, or null if there isn't one.
  tripWords() {
    if (!this.trip) return null;
    return { away: realTimeWords(this.trip.ship), aged: homeTimeWords(this.trip.home) };
  }

  // Back home: the trip's totals in words (for Kevin's landing line), and
  // the trip is over. null if there wasn't one.
  endTrip() {
    const words = this.tripWords();
    this.trip = null;
    this.save();
    return words;
  }

  // ---- Reading the clocks ----

  // The hour of the day at home (0-24), for the home sky.
  homeHour() {
    return (START_HOUR + gameHours(this.homeTotal)) % 24;
  }

  // The trip clocks for the readout and the star map ("Ready" with no trip running).
  shipText() {
    return this.trip ? shipClock(this.trip.ship) : 'Ready';
  }

  homeText() {
    return this.trip ? homeClock(this.trip.home) : 'Ready';
  }

  // ---- Every frame ----
  // counting = are the clocks running right now? (main.js: playing, or in a cutscene)
  update(dt, counting) {
    if (!counting) return;
    // At home, T (fast time) speeds up home time too, so the sky can follow it.
    const fast = this.atHome && this.dayNight.fast ? FAST_SPEED : 1;
    const homeTime = dt * this.slip * fast;
    this.homeTotal += homeTime;
    if (this.trip) {
      this.trip.ship += dt;
      this.trip.home += homeTime;
    }

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = SAVE_EVERY;
      this.save();
    }
    this.updateWarning(dt);
    this.updateReadout();
  }

  // Now and then on a big-slip planet, Kevin reminds you home is racing ahead.
  updateWarning(dt) {
    if (this.slip < WARN_FROM_SLIP || !this.talk || !this.player?.locked) return;
    this.warnTimer -= dt;
    if (this.warnTimer > 0) return;
    if (this.talk.speaking && this.warnTimer > -HOLD_WARNING) return; // let him finish first
    this.warnTimer = WARN_EVERY;
    const words = this.tripWords();
    if (!words) return;
    this.talk.note(`Kevin warned the player that home has aged ${words.aged} while they've been away`);
    this.talk.say(pickLine('slipWarning', 0, words), { interrupt: false });
  }

  // ---- The corner readout (away from home only) ----
  buildReadout() {
    if (this.atHome) return; // hidden at home
    this.readout.innerHTML = `
      <div class="clock-row">
        <span class="clock-label">SHIP</span><span class="clock-value clock-ship"></span>
      </div>
      <div class="clock-row clock-row-home">
        <span class="clock-label">HOME</span><span class="clock-value clock-home"></span>
      </div>
      <div class="clock-slip">TIME SLIP ×${this.slip}</div>`;
    this.shipEl = this.readout.querySelector('.clock-ship');
    this.homeEl = this.readout.querySelector('.clock-home');
    // The faster home races, the faster its light pulses.
    this.readout.style.setProperty('--clock-pulse', `${Math.max(0.25, 2 / Math.sqrt(this.slip))}s`);
    this.readout.classList.add('is-shown');
    this.updateReadout();
  }

  updateReadout() {
    if (this.atHome) return;
    const ship = this.shipText();
    const home = this.homeText();
    if (ship !== this.lastShip) this.shipEl.textContent = this.lastShip = ship;
    if (home !== this.lastHome) this.homeEl.textContent = this.lastHome = home;
  }
}

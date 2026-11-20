import * as THREE from 'three';
import { pickLine } from './kevinBrain.js';
import { speakingTime } from './kevinVoice.js';

// Kevin talking: decides WHEN he says something on his own, and makes him
// say it (speech bubble + voice + moving mouth, all at once).
//
// He speaks up when:
//   - you start playing (hello)
//   - you hit him (more annoyed the more you do it)
//   - he falls behind and teleports to you
//   - you fall out of the bottom of the world
//   - the sun sets, or comes up
//   - you stare at the black hole for a couple of seconds
//   - nothing has happened for a while (a random idle remark)
// He only speaks up while you're playing (not paused or in a menu).
//
// What he says comes from the offline brain (kevinBrain.js).
// say() is also what the chat (step 3) will use for his replies.
//
// Lines never overlap. Important ones (being hit, falling) cut in straight
// away. Others wait until he's finished the current line (and are dropped if
// they'd be stale by then). If you can't see his speech bubble, the line
// also shows as a caption at the bottom of the screen (kevinCaption.js).

const HELLO_DELAY = 2.5;          // seconds after you first start playing
const IDLE_EVERY = [60, 120];     // seconds between idle remarks (random in this range)
const QUIET_BEFORE_IDLE = 20;     // an idle remark waits until he's been quiet this long
const HIT_TALK_GAP = 1.2;         // seconds between remarks about being hit
const STARE_TIME = 2;             // seconds of staring at the black hole before he comments
const STARE_ANGLE = 0.97;         // how close to dead-centre counts as staring (1 = exactly)
const BLACK_HOLE_COOLDOWN = 180;  // seconds before he'll comment on it again
const NIGHT_FROM = 20;            // hour the night starts...
const NIGHT_UNTIL = 6;            // ...and ends (same as mobs.js)
const MAX_WAIT = 6;               // a line waiting its turn is dropped if it waits longer than this

const look = new THREE.Vector3();

function randomBetween([a, b]) {
  return a + Math.random() * (b - a);
}

export class KevinTalk {
  constructor(kevin, player, dayNight, camera, bubble, caption, voice) {
    this.kevin = kevin;
    this.player = player;
    this.dayNight = dayNight;
    this.camera = camera;
    this.bubble = bubble;
    this.caption = caption;
    this.voice = voice;
    this.waiting = null;     // a line waiting for him to finish the current one: { line, age }
    // Where the black hole is in the sky (it never moves, see dayNight.js).
    this.blackHole = dayNight.dome.material.uniforms.holeDirection.value;

    this.saidHello = false;
    this.helloTimer = HELLO_DELAY;
    this.idleTimer = randomBetween(IDLE_EVERY);
    this.sinceSpoke = 0;     // seconds since he last said anything
    this.speaking = false;
    this.lineNumber = 0;     // counts lines, so an old line finishing doesn't end a newer one
    this.hitGap = 0;
    this.stare = 0;
    this.blackHoleCooldown = 0;
    this.wasNight = this.isNight();
    this.falls = player.falls;
  }

  // Say a line: { text, mood } (from kevinBrain.js, or later the server).
  // interrupt = true: cut off whatever he's saying.
  // interrupt = false: if he's already talking, wait until he's finished
  // (only the newest waiting line is kept).
  // Returns true if he said it or it's waiting its turn.
  say(line, { interrupt = true } = {}) {
    if (!interrupt && this.speaking) {
      this.waiting = { line, age: 0 };
      return true;
    }
    if (interrupt) this.waiting = null; // something more important came up
    const { text, mood } = line;
    const number = ++this.lineNumber;
    this.speaking = true;
    this.kevin.talking = true;
    this.sinceSpoke = 0;
    const time = speakingTime(text);
    if (mood === 'annoyed') this.kevin.annoyedTimer = Math.max(this.kevin.annoyedTimer, time + 1);
    this.bubble.show(text, time);
    this.voice.speak(text, () => {
      if (number !== this.lineNumber) return; // a newer line has taken over
      this.speaking = false;
      this.kevin.talking = false;
    });
    return true;
  }

  isNight() {
    const hour = this.dayNight.hour;
    return hour >= NIGHT_FROM || hour < NIGHT_UNTIL;
  }

  // ---- Every frame (after Kevin has moved) ----

  update(dt) {
    const playing = this.player.locked;
    this.sinceSpoke += dt;
    this.hitGap -= dt;
    this.blackHoleCooldown -= dt;
    this.bubble.update(dt, this.kevin.headPoint, this.camera);
    this.caption.update(this.bubble);

    // A line waiting its turn: say it once he's finished (unless it's gone stale).
    if (this.waiting) {
      this.waiting.age += dt;
      if (this.waiting.age > MAX_WAIT) this.waiting = null;
      else if (!this.speaking) {
        const { line } = this.waiting;
        this.waiting = null;
        this.say(line);
      }
    }

    // Hello, a moment after you first start playing.
    if (!this.saidHello && playing) {
      this.helloTimer -= dt;
      if (this.helloTimer <= 0) {
        this.saidHello = true;
        this.say(pickLine('hello'), { interrupt: false });
      }
    }

    // Things that happened to Kevin (kevin.js).
    for (const event of this.kevin.takeEvents()) {
      if (event === 'hit' && this.hitGap <= 0) {
        this.hitGap = HIT_TALK_GAP;
        const streak = this.kevin.hitStreak;
        this.say(streak >= 3 ? pickLine('hitStreak', streak) : pickLine('hit'));
      } else if (event === 'teleport') {
        this.say(pickLine('teleport'), { interrupt: false });
      }
    }

    // You fell out of the world (player.js counts it).
    if (this.player.falls !== this.falls) {
      this.falls = this.player.falls;
      this.say(pickLine('fell'));
    }

    // Sunset and sunrise.
    const night = this.isNight();
    if (night !== this.wasNight) {
      this.wasNight = night;
      if (playing) this.say(pickLine(night ? 'nightfall' : 'dawn'), { interrupt: false });
    }

    // Staring at the black hole.
    const staring = playing && this.camera.getWorldDirection(look).dot(this.blackHole) > STARE_ANGLE;
    this.stare = staring ? this.stare + dt : 0;
    if (this.stare > STARE_TIME && this.blackHoleCooldown <= 0) {
      if (this.say(pickLine('blackHole'), { interrupt: false })) this.blackHoleCooldown = BLACK_HOLE_COOLDOWN;
    }

    // Now and then, an idle remark (night has its own).
    this.idleTimer -= dt;
    if (this.idleTimer <= 0 && playing && !this.speaking && this.sinceSpoke > QUIET_BEFORE_IDLE) {
      this.idleTimer = randomBetween(IDLE_EVERY);
      this.say(pickLine(night ? 'idleNight' : 'idle'), { interrupt: false });
    }
  }
}

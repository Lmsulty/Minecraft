import * as THREE from 'three';
import { pickLine } from './kevinBrain.js';
import { speakingTime } from './kevinVoice.js';

// Kevin talking: decides WHEN he says something on his own, and makes him
// say it (speech bubble + voice + moving mouth, all at once).
//
// He's "speak when spoken to": he mostly talks when you talk to him (chat,
// building jobs) or at big moments. On his own he speaks up when:
//   Always (each with its own cooldown, if any):
//   - you start playing (hello)
//   - you stare at the black hole for a couple of seconds
//   - you hit him (more annoyed the more you do it; cuts in if he's talking)
//   Only if he's been quiet for QUIET_GAP, and each with its own cooldown too:
//   - he falls behind and teleports to you
//   - you fall out of the bottom of the world
//   - the sun sets, or comes up (only sometimes)
//   - nothing has happened for ages (a rare idle remark)
// Rocket, time slip, chat and building lines come from other files and
// always play. He only speaks up while you're playing (not paused or in a menu).
//
// What he says comes from the offline brain (kevinBrain.js).
// say() is also how the chat (kevinChat.js) makes him say his replies.
//
// Lines never overlap. Some (chat replies, a job going wrong) cut in straight
// away. Others wait until he's finished the current line (and are dropped if
// they'd be stale by then). Gameplay remarks are simply skipped if he's busy. If you can't see his speech bubble, the line
// also shows as a caption at the bottom of the screen (kevinCaption.js).

// ==========================================================
//  HOW CHATTY KEVIN IS: tweak these.
// ==========================================================
// The overall rule: after he finishes ANY line, he stays quiet for at least
// this many seconds before saying something on his own (idle remarks, hits,
// teleports, falls, sunset/sunrise). Hello, being hit, the black hole, the
// rocket, time slip warnings, chat replies and building lines ignore this rule.
const QUIET_GAP = 60;

const IDLE_CHATTER = true;        // false = no idle remarks at all
const IDLE_EVERY = [180, 300];    // seconds between idle remarks (random, 3 to 5 minutes)
const DAY_NIGHT_CHANCE = 0.25;    // chance he mentions sunset/sunrise (0 = never, 1 = every time)
const HIT_COOLDOWN = 8;           // seconds before he'll comment on being hit again (ignores QUIET_GAP)
const TELEPORT_COOLDOWN = 180;    // seconds before he'll comment on catching up with you again
const FELL_COOLDOWN = 60;         // seconds before he'll comment on you falling out of the world again
// ==========================================================

const HELLO_DELAY = 2.5;          // seconds after you first start playing
const STARE_TIME = 2;             // seconds of staring at the black hole before he comments
const STARE_ANGLE = 0.97;         // how close to dead-centre counts as staring (1 = exactly)
const BLACK_HOLE_COOLDOWN = 180;  // seconds before he'll comment on it again
const NIGHT_FROM = 20;            // hour the night starts...
const NIGHT_UNTIL = 6;            // ...and ends (same as mobs.js)
const MAX_WAIT = 6;               // a line waiting its turn is dropped if it waits longer than this
const EVENT_MEMORY = 180;         // seconds he remembers recent events for (sent with chat messages)
const EVENT_COUNT = 5;            // ...and at most this many

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
    this.cooldowns = {};     // seconds left before each kind of gameplay remark can play again
    this.stare = 0;
    this.blackHoleCooldown = 0;
    this.wasNight = this.isNight();
    this.falls = player.falls;
    this.clock = 0;
    this.events = [];        // recent happenings, for the chat's game context: [{ text, key, time }]
  }

  // Remember something that happened (for chat replies, see kevinChat.js).
  // A note with the same `key` as the last one replaces it (e.g. a hit streak).
  note(text, key = text) {
    const last = this.events[this.events.length - 1];
    if (last?.key === key) this.events.pop();
    this.events.push({ text, key, time: this.clock });
    if (this.events.length > EVENT_COUNT) this.events.shift();
  }

  // The recent events as one line, e.g. "night fell; the player hit Kevin 3 times in a row".
  recentEventsText() {
    return this.events
      .filter((e) => this.clock - e.time < EVENT_MEMORY)
      .map((e) => e.text)
      .join('; ');
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

  // A remark from normal gameplay (teleport, fall, sunset, idle): only
  // if he's been quiet for QUIET_GAP and this kind's own cooldown is over.
  // Returns true if he said it.
  remark(kind, line, cooldown, options) {
    if (this.speaking || this.waiting || this.sinceSpoke < QUIET_GAP) return false;
    if ((this.cooldowns[kind] ?? 0) > 0) return false;
    this.cooldowns[kind] = cooldown;
    return this.say(line, options);
  }

  isNight() {
    const hour = this.dayNight.hour;
    return hour >= NIGHT_FROM || hour < NIGHT_UNTIL;
  }

  // ---- Every frame (after Kevin has moved) ----

  update(dt) {
    const playing = this.player.locked;
    this.clock += dt;
    // Counts from when he stops talking, so a long line doesn't eat into the quiet time.
    this.sinceSpoke = this.speaking ? 0 : this.sinceSpoke + dt;
    for (const kind in this.cooldowns) this.cooldowns[kind] -= dt;
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
      if (event === 'hit') {
        const streak = this.kevin.hitStreak;
        this.note(streak > 1 ? `the player hit Kevin ${streak} times in a row` : 'the player hit Kevin', 'hit');
        // Hits always get a reaction (cutting in if he's talking), just not every single punch.
        if ((this.cooldowns.hit ?? 0) <= 0) {
          this.cooldowns.hit = HIT_COOLDOWN;
          this.say(streak >= 3 ? pickLine('hitStreak', streak) : pickLine('hit'));
        }
      } else if (event === 'teleport') {
        this.note('Kevin fell behind and teleported back to the player');
        this.remark('teleport', pickLine('teleport'), TELEPORT_COOLDOWN);
      }
    }

    // You fell out of the world (player.js counts it).
    if (this.player.falls !== this.falls) {
      this.falls = this.player.falls;
      this.note('the player fell out of the bottom of the world');
      this.remark('fell', pickLine('fell'), FELL_COOLDOWN);
    }

    // Sunset and sunrise.
    const night = this.isNight();
    if (night !== this.wasNight) {
      this.wasNight = night;
      this.note(night ? 'night fell' : 'the sun came up');
      // Only sometimes (DAY_NIGHT_CHANCE), and only if he's been quiet a while.
      if (playing && Math.random() < DAY_NIGHT_CHANCE) this.remark('dayNight', pickLine(night ? 'nightfall' : 'dawn'), 0);
    }

    // Staring at the black hole.
    const staring = playing && this.camera.getWorldDirection(look).dot(this.blackHole) > STARE_ANGLE;
    this.stare = staring ? this.stare + dt : 0;
    if (this.stare > STARE_TIME && this.blackHoleCooldown <= 0) {
      this.note('the player stared at the black hole');
      if (this.say(pickLine('blackHole'), { interrupt: false })) this.blackHoleCooldown = BLACK_HOLE_COOLDOWN;
    }

    // Once in a long while, an idle remark (night has its own). Switch off with IDLE_CHATTER.
    if (IDLE_CHATTER && playing) {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0 && this.remark('idle', pickLine(night ? 'idleNight' : 'idle'), 0)) {
        this.idleTimer = randomBetween(IDLE_EVERY);
      }
    }
  }
}

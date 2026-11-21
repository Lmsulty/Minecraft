import { pickLine } from './kevinBrain.js';
import { sortOrders, LIST_NAMES, NEXT_NAMES, DONE_NAMES } from './kevinActions.js';
import { NEEDS_SPOT, SPOT_PROBLEMS } from './kevinBuild.js';

// ==========================================================
//  PICKING A SPOT: tweak these.
// ==========================================================
const CONFIRM_HOLD = 3;   // seconds to keep pointing at the same spot to confirm it
const PICK_TIMEOUT = 20;    // seconds he waits for you to pick a spot before skipping the job
const SAME_SPOT = 1;        // pointing within this many blocks still counts as "the same spot"
const PREVIEW_EVERY = 0.15; // seconds between updates of the ghost preview
const F_COMPLAINT_GAP = 2;  // seconds between "that won't work" remarks when you press F on a bad spot
// ==========================================================

// Kevin's TO-DO LIST: the actions you asked for in the chat, done one after
// another. You can ask for up to 3 at once ("build a hut, then light it up,
// then make a bridge").
//
//   - Before each build or dig he ASKS where you want it ("Right, where do
//     you want the bridge?") and waits. While he waits:
//        a ghost of the build shows where you're pointing (kevinGhost.js),
//        green if it can go there, red if it can't
//        keep pointing at the same spot for CONFIRM_HOLD seconds (a ring
//        fills up by the crosshair), or press F, to confirm
//        no spot after PICK_TIMEOUT seconds: he skips that job
//     (The bridge goes from where you STAND, the way you face, so walk and
//     turn to aim it.)
//   - You have to actually point at something (up to about 8 blocks away);
//     pointing at the sky doesn't count. Except the bridge: that goes from
//     where you stand.
//   - He always asks, even for the first job or a single build, so you
//     always see the ghost before anything changes.
//   - Lamps, stay and follow don't need a spot: they just happen.
//   - Between jobs he says a short line: "Hut done. Now the bridge."
//   - If a job is refused or fails, he says why and moves on to the next one.
//     (Walking away doesn't stop the list: he keeps working wherever he is.)
//   - Survival: before starting a list, he checks you can afford ALL of it.
//     If not, he says which job you can't afford, and doesn't start any.
//   - "stop" cancels the current job, the spot he's waiting for, AND
//     everything left in the list.
//   - New orders replace the old list. Except a plain "stay here" or
//     "follow me": that doesn't interrupt his work.
//   - More than 3? He does the first 3 and says so.
//
// The jobs themselves are done by kevinBuild.js (building and digging).

const MAX_ORDERS = 3;

export class KevinOrders {
  constructor({ kevin, builder, talk, player, ghost }) {
    this.kevin = kevin;
    this.builder = builder;
    this.talk = talk;
    this.player = player;
    this.ghost = ghost;   // KevinGhost (kevinGhost.js)
    this.queue = [];      // actions still to do, in order (not counting the current one)
    this.asking = null;   // waiting for you to pick a spot: { action, time, dwell, spot, preview, previewTimer }
    this.complainTimer = 0;
    builder.onJobEnd = (end) => this.jobEnded(end);

    // F: "put it here".
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyF' || e.repeat || !this.asking || !player.locked) return;
      this.confirmWithF();
    });
  }

  // Is he working on something, waiting for a spot, or about to start?
  get busy() {
    return this.builder.busy || this.asking !== null || this.queue.length > 0;
  }

  // What he's doing, for the online brain ("building a hut, then 2 more jobs").
  describe() {
    const now = this.asking
      ? `waiting for the player to point at a spot for ${NEXT_NAMES[this.asking.action]}`
      : this.builder.describe();
    const more = this.queue.length;
    if (!more) return now;
    const rest = `${more} more job${more > 1 ? 's' : ''} to do`;
    return now ? `${now}, then ${rest}` : rest;
  }

  // ---- New orders from the chat ----

  // `actions` = what the brain picked, in order (e.g. ['hut', 'light']).
  // Returns { note, line, prefix }, all optional:
  //   note    a note for his memory of recent events (kevinTalk.js)
  //   line    something he should say INSTEAD of his chat reply (it can't be done)
  //   prefix  something to say just BEFORE his reply ("Three at a time, please.")
  run(actions) {
    const { stop, jobs, tooMany } = sortOrders(actions, MAX_ORDERS);
    const prefix = tooMany ? pickLine('tooMany') : null;

    // "stop" cancels everything; anything after it is a fresh list.
    const hadWork = stop && this.cancelAll();
    if (jobs.length === 0) {
      return { prefix, note: hadWork ? 'the player told Kevin to stop, so he dropped everything' : null };
    }

    // Only "stay" / "follow"? Do that, but carry on with any work.
    if (jobs.every((a) => a === 'stay' || a === 'follow')) {
      let note = null;
      for (const a of jobs) note = this.doNow(a).note;
      return { prefix, note };
    }

    // New orders replace whatever he was doing.
    this.cancelAll();

    // Several: check you can afford them all first (survival).
    if (jobs.length > 1) {
      const cantAfford = this.builder.checkAfford(jobs.filter((a) => a !== 'stay' && a !== 'follow'));
      if (cantAfford) return { prefix, line: cantAfford, note: 'Kevin could not afford everything the player asked for' };
    }
    const note = jobs.length > 1
      ? `the player asked Kevin for: ${jobs.map((a) => LIST_NAMES[a]).join(', then ')}`
      : `the player asked Kevin for ${LIST_NAMES[jobs[0]]}`;

    // Builds and digs ALWAYS wait for you to pick a spot (they start next
    // frame, after his reply, by asking where). But a single order that can't
    // be done wherever you point (not enough blocks, no lamps) gets "why not"
    // INSTEAD of his reply, rather than a pointless "where do you want it?".
    this.queue = jobs.slice();
    const first = this.queue[0];
    if (NEEDS_SPOT.includes(first)) {
      const plan = this.builder.plan(first);
      if (!plan.ok && jobs.length === 1 && !SPOT_PROBLEMS.includes(plan.reason)) {
        this.queue = [];
        return { prefix, line: plan.line, note: `Kevin couldn't do the ${NEXT_NAMES[first]} the player asked for` };
      }
    } else if (jobs.length === 1) {
      this.queue = [];
      return { prefix, ...this.doNow(first) };
    }
    return { prefix, note };
  }

  // Do one action right now. Returns { note, line } (line = why it can't be done).
  doNow(action) {
    if (action === 'stay') {
      this.kevin.stay();
      return { note: 'the player told Kevin to stay put' };
    }
    if (action === 'follow') {
      this.kevin.follow();
      return { note: 'the player told Kevin to follow them again' };
    }
    const plan = this.builder.plan(action);
    if (!plan.ok) return { line: plan.line, note: `Kevin couldn't do the ${NEXT_NAMES[action]} the player asked for` };
    this.builder.start(plan.job);
    return { note: `the player asked Kevin for ${LIST_NAMES[action]}` };
  }

  // Drop the current job, the spot he's waiting for, and the rest of the
  // list. Returns true if there was anything.
  cancelAll() {
    const had = this.busy;
    this.queue = [];
    this.stopAsking();
    this.builder.stop();
    return had;
  }

  // ---- Working through the list ----

  // Every frame (after the builder).
  update(dt) {
    this.complainTimer -= dt;
    if (this.asking) {
      this.updateAsking(dt);
      return;
    }
    if (this.builder.busy) return;
    while (this.queue.length > 0) {
      const action = this.queue.shift();
      // Builds and digs: ask where first.
      if (NEEDS_SPOT.includes(action)) {
        this.startAsking(action);
        return;
      }
      // Lamps, stay, follow: just do it. (If it can't be done, say why and move on.)
      const { line } = this.doNow(action);
      if (line) this.talk.say(this.withNext(line), { interrupt: false });
      else if (this.builder.busy) return;
    }
  }

  // A job finished (kevinBuild.js). Decide what he says.
  jobEnded({ kind, result, line, success }) {
    if (result === 'stopped') return; // you said stop: his chat reply covers it
    if (this.queue.length === 0) {
      // The last (or only) job: his normal "done" line, or why it went wrong.
      if (line) this.talk.say(line, { interrupt: !success });
      return;
    }
    // More to do.
    const next = NEXT_NAMES[this.queue[0]];
    if (success) this.talk.say(pickLine('nextJob', 0, { done: DONE_NAMES[kind], next }), { interrupt: false });
    else this.talk.say(this.withNext(line));
  }

  // `line`, plus "On to the bridge." if there's more in the list.
  withNext(line) {
    if (this.queue.length === 0) return line;
    const onTo = pickLine('movingOn', 0, { next: NEXT_NAMES[this.queue[0]] });
    return { ...line, text: `${line.text} ${onTo.text}` };
  }

  // ---- Asking where you want it ----

  startAsking(action) {
    this.asking = { action, time: 0, dwell: 0, spot: null, preview: null, previewTimer: 0 };
    this.talk.say(pickLine('askWhere', 0, { thing: NEXT_NAMES[action] }), { interrupt: false });
    this.talk.note(`Kevin asked the player where to put ${NEXT_NAMES[action]}`);
  }

  stopAsking() {
    this.asking = null;
    this.ghost.hide();
  }

  updateAsking(dt) {
    const a = this.asking;
    a.time += dt;

    // Waited long enough: skip it.
    if (a.time > PICK_TIMEOUT) {
      this.stopAsking();
      this.talk.note(`the player never picked a spot, so Kevin skipped ${NEXT_NAMES[a.action]}`);
      this.talk.say(this.withNext(pickLine('skipped', 0, { thing: NEXT_NAMES[a.action] })));
      return;
    }

    // Update the ghost every so often (working out a build takes a moment).
    a.previewTimer -= dt;
    if (a.previewTimer <= 0 || !a.preview) {
      a.previewTimer = PREVIEW_EVERY;
      a.preview = this.builder.preview(a.action);

      // A problem that pointing elsewhere won't fix (not enough blocks, no
      // lamps): say why and move on, instead of waiting.
      if (!a.preview.ok && !SPOT_PROBLEMS.includes(a.preview.plan.reason)) {
        this.stopAsking();
        this.talk.say(this.withNext(a.preview.plan.line));
        return;
      }
      this.ghost.show(a.preview.cells, a.preview.ok);

      // Moved to a different spot (or turned)? Start the hold again.
      const s = a.preview.spot;
      const same = a.spot && s.fx === a.spot.fx && s.fz === a.spot.fz &&
        Math.max(Math.abs(s.x - a.spot.x), Math.abs(s.y - a.spot.y), Math.abs(s.z - a.spot.z)) <= SAME_SPOT;
      if (!same) {
        a.spot = s;
        a.dwell = 0;
      }
    }

    // Holding steady on a good spot (while playing, not in the chat or a menu).
    const ok = a.preview.ok;
    a.dwell = ok && this.player.locked ? a.dwell + dt : 0;
    const left = Math.ceil(PICK_TIMEOUT - a.time);
    const pointing = a.preview.plan.reason !== 'pointAtSpot';
    const hint = ok ? 'F to confirm' : pointing ? "Can't go there" : 'Point at a spot';
    this.ghost.showRing(a.dwell / CONFIRM_HOLD, ok, `${hint} · ${left}s`);
    if (a.dwell >= CONFIRM_HOLD) this.confirm();
  }

  // Put it here. Plans again right now (things may have changed since the preview).
  confirm() {
    if (!this.asking || !this.builder.hasSpot(this.asking.action)) return false;
    const plan = this.builder.plan(this.asking.action);
    if (!plan.ok) {
      this.asking.dwell = 0;
      this.asking.previewTimer = 0;
      return false;
    }
    this.stopAsking();
    this.builder.start(plan.job);
    return true;
  }

  // F pressed: confirm, or say why it can't go there.
  confirmWithF() {
    if (!this.asking || this.confirm()) return;
    if (this.complainTimer > 0) return;
    this.complainTimer = F_COMPLAINT_GAP;
    const action = this.asking.action;
    if (!this.builder.hasSpot(action)) {
      this.talk.say(pickLine('pointAtSpot', 0, { thing: NEXT_NAMES[action] }));
      return;
    }
    const plan = this.builder.plan(action);
    if (!plan.ok) this.talk.say(plan.line);
  }
}

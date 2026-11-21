import { pickLine } from './kevinBrain.js';
import { sortOrders, LIST_NAMES, NEXT_NAMES, DONE_NAMES } from './kevinActions.js';

// Kevin's TO-DO LIST: the actions you asked for in the chat, done one after
// another. You can ask for up to 3 at once ("build a hut, then light it up,
// then make a bridge").
//
//   - Each job picks its spot when it STARTS, using where you're pointing at
//     that moment, so you can aim at the next spot while he works.
//   - stay / follow can be in the list too; they happen instantly when
//     their turn comes ("build a wall then follow me").
//   - Between jobs he says a short line: "Hut done. Now the bridge."
//   - If a job is refused or fails, he says why and moves on to the next one.
//     (If you walk away mid-job, he gives up on the whole list.)
//   - Survival: before starting a list, he checks you can afford ALL of it.
//     If not, he says which job you can't afford, and doesn't start any.
//   - "stop" cancels the current job AND everything left in the list.
//   - New orders replace the old list (and whatever job he's on). Except a
//     plain "stay here" or "follow me": that doesn't interrupt his work.
//   - More than 3? He does the first 3 and says so.
//
// The jobs themselves are done by kevinBuild.js (building and digging).

const MAX_ORDERS = 3;

export class KevinOrders {
  constructor({ kevin, builder, talk }) {
    this.kevin = kevin;
    this.builder = builder;
    this.talk = talk;
    this.queue = [];  // actions still to do, in order (not counting the job he's on)
    builder.onJobEnd = (end) => this.jobEnded(end);
  }

  // Is he working on something, or about to?
  get busy() {
    return this.builder.busy || this.queue.length > 0;
  }

  // What he's doing, for the online brain ("building a hut, then 2 more jobs").
  describe() {
    const now = this.builder.describe();
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

    // Just one: do it now, so if it can't be done he says why INSTEAD of his reply.
    if (jobs.length === 1) {
      const result = this.doNow(jobs[0]);
      return { prefix, ...result };
    }

    // Several: check you can afford them all first (survival), then queue them.
    // They start next frame, after he's said his reply.
    const cantAfford = this.builder.checkAfford(jobs.filter((a) => a !== 'stay' && a !== 'follow'));
    if (cantAfford) return { prefix, line: cantAfford, note: 'Kevin could not afford everything the player asked for' };
    this.queue = jobs.slice();
    return { prefix, note: `the player asked Kevin for: ${jobs.map((a) => LIST_NAMES[a]).join(', then ')}` };
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
    return { note: `the player asked Kevin to make ${LIST_NAMES[action]}` };
  }

  // Drop the current job and the rest of the list. Returns true if there was anything.
  cancelAll() {
    const had = this.busy;
    this.queue = [];
    this.builder.stop();
    return had;
  }

  // ---- Working through the list ----

  // Every frame (after the builder).
  update() {
    if (this.builder.busy) return;
    // Start the next job. stay / follow happen at once; refused jobs are skipped (he says why).
    while (this.queue.length > 0) {
      const action = this.queue.shift();
      const { line } = this.doNow(action);
      if (!line) {
        if (this.builder.busy) return; // a job's started
        continue;                      // stay / follow: straight on to the next
      }
      this.talk.say(this.withNext(line), { interrupt: false });
    }
  }

  // A job finished (kevinBuild.js). Decide what he says.
  jobEnded({ kind, result, line, success }) {
    if (result === 'stopped') return; // you said stop: his chat reply covers it
    if (result === 'abandoned') {
      this.queue = []; // you walked off: forget the rest too
      if (line) this.talk.say(line);
      return;
    }
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
}

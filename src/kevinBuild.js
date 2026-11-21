import * as THREE from 'three';
import { BLOCK, isBreakableId, isEmptyId, dropId } from './blocks.js';
import { isPlaceableId, displayName } from './items.js';
import { THEME } from './theme.js';
import { bendMaterial } from './curve.js';
import { blueprint, structure, facing, wantedSpot, at, MAIN } from './kevinBlueprints.js';
import { NEXT_NAMES, LIST_NAMES } from './kevinActions.js';
import { findSite } from './kevinSite.js';
import { digPlan } from './kevinDig.js';
import { pickLine } from './kevinBrain.js';

// Kevin BUILDING things you ask for in the chat (wall, tower, hut, bridge,
// lamps), and DIGGING them (tunnel, staircase down: kevinDig.js plans those,
// and they're done just like clearing a spot, with lamps placed after).
// kevinBlueprints.js says where the blocks go; this file:
//
//   1. picks the block to build with:
//        the block you're holding, if it's a block
//        else in creative: planks
//        else in survival: the building block you have most of
//   2. walls, towers and huts: finds a spot near where you're aiming, and
//      what has to be cleared there first (kevinSite.js)
//   3. checks it can be done BEFORE starting, or he says no:
//        survival: you need enough blocks in your inventory (lamps for
//        lamps), counting floors and foundations
//        there has to be at least one empty spot to fill
//   4. clears the spot: natural blocks pop out one at a time
//   5. places the blocks one at a time, with a little sparkle and a beam
//      from his antenna, while he stands still and watches his work.
//
// SAFETY: he only ever removes NATURAL blocks (never one you placed), and
// only puts blocks into empty air. He skips any spot you're standing in.
//
// In survival every block he places comes out of your inventory, and every
// block he clears goes into it (like when you place or mine one yourself;
// if your inventory is full, the extra is lost). In creative it's all free.
//
// He stops if: the build is finished, you say "stop", you run out of blocks
// halfway (e.g. you dropped some), or the place he's working in unloads
// because you went so far away (then he gives up and teleports back to you).
// Walking away doesn't stop him otherwise: he stays put and finishes the job.

// ==========================================================
const PLACE_EVERY = 0.15;   // seconds between blocks
const CLEAR_EVERY = 0.08;   // seconds between blocks while clearing (a tree is a lot of leaves)
const POP_TIME = 0.3;       // seconds the sparkle round a new block lasts
const BEAM_TIME = 0.12;     // seconds the beam from his antenna lasts
const POP_COUNT = 6;        // sparkles that can show at once
const AIM_REACH = 8;        // how far away he looks for the block you're pointing at
const MOSTLY_DONE = 0.5;    // changed fewer than this share of the planned blocks: he admits it didn't work
const LAMPS_ESTIMATE = 4;   // lamps a "light this up" will need, if he can't tell yet
// ==========================================================

// Names for his lines ("One {thing}, coming up").
export const THINGS = {
  wall: 'wall', tower: 'tower', hut: 'hut', bridge: 'bridge', light: 'lamps',
  tunnel: 'tunnel', stairs: 'staircase',
};
export const BUILDS = Object.keys(THINGS);

// Jobs that need you to pick a spot (kevinOrders.js asks you where).
export const NEEDS_SPOT = ['wall', 'tower', 'hut', 'bridge', 'tunnel', 'stairs'];
// Reasons a job can't be done that are about the SPOT (pointing somewhere
// else might fix them). Anything else (not enough blocks...) won't be fixed
// by picking another spot.
export const SPOT_PROBLEMS = ['noRoom', 'tooBumpy', 'yoursInTheWay', 'noGap', 'pointAtHill', 'nothingToDig', 'pointAtSpot'];
const SITE_BUILDS = ['wall', 'tower', 'hut']; // these need a spot found (and maybe cleared) first
const DIGS = ['tunnel', 'stairs'];            // these are dug (kevinDig.js)

function blockName(id) {
  return displayName(id).toLowerCase();
}

// A job: blocks to clear (dig out) first, then blocks to place.
// `changed` counts the blocks he really removed or placed, so he never says
// "done" when nothing (or hardly anything) happened.
function newJob(kind, clear, blocks, doneLine = null) {
  return {
    kind, clear, nextClear: 0, blocks, next: 0, timer: 0, doneLine,
    changed: 0, planned: clear.length + blocks.length,
  };
}

export class KevinBuilder {
  // `aim(reach)` = the block you're pointing at, up to `reach` away, with the
  // face you hit (interaction.js raycast), or null.
  constructor({ kevin, world, player, inventory, talk, scene, aim }) {
    this.aimAt = () => aim?.(AIM_REACH) ?? null;
    this.kevin = kevin;
    this.world = world;
    this.player = player;
    this.inventory = inventory;
    this.talk = talk;
    this.job = null; // what he's building (see newJob)
    this.onJobEnd = null; // ({ kind, result, line, success }) when a job ends (set by kevinOrders.js)

    // The sparkles: a bright outline round each new block that shrinks onto it.
    const color = THEME.mobs.kevin.buildSparkle;
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.pops = [];
    for (let i = 0; i < POP_COUNT; i++) {
      const line = new THREE.LineSegments(edges,
        bendMaterial(new THREE.LineBasicMaterial({ color, transparent: true })));
      line.visible = false;
      line.age = POP_TIME;
      scene.add(line);
      this.pops.push(line);
    }
    this.nextPop = 0;

    // The beam: a line from his antenna to the block he just placed.
    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    this.beam = new THREE.Line(beamGeometry,
      bendMaterial(new THREE.LineBasicMaterial({ color, transparent: true })));
    this.beam.frustumCulled = false; // it moves about, so don't let it be skipped
    this.beam.visible = false;
    this.beam.age = BEAM_TIME;
    scene.add(this.beam);
  }

  get busy() {
    return this.job !== null;
  }

  // What he's doing, for the online brain ("building a hut").
  describe() {
    if (!this.job) return null;
    if (this.job.kind === 'light') return 'putting up glow lamps';
    return `${DIGS.includes(this.job.kind) ? 'digging' : 'building'} a ${THINGS[this.job.kind]}`;
  }

  // ---- 1 and 2: plan it, and check it can be done ----

  // The block he builds with (see the top of this file), or null if you have none.
  chooseBlock() {
    const inv = this.inventory;
    const held = inv.selectedStack?.block;
    if (held != null && isPlaceableId(held) && held !== BLOCK.CORE) return held;
    if (inv.creative) return BLOCK.PLANKS;
    let best = null;
    for (let i = 0; i < inv.slots.length; i++) {
      const id = inv.get(i)?.block;
      if (id == null || !isPlaceableId(id) || id === BLOCK.CORE || id === BLOCK.GLOW_LAMP) continue;
      if (best === null || inv.countOf(id) > inv.countOf(best)) best = id;
    }
    return best;
  }

  // Work out a build. Returns { ok: true, job } or { ok: false, reason, line }
  // (reason = e.g. 'noRoom' or 'notEnough', see SPOT_PROBLEMS; line = what he
  // says instead, explaining why not).
  plan(kind) {
    const inv = this.inventory;
    const refuse = (reason, count = 0, fill = {}) => ({ ok: false, reason, line: pickLine(reason, count, fill) });
    const aim = this.aimAt(); // the block you're pointing at right now (up to AIM_REACH away), or null

    // Digging: nothing needed but lamps, and those are optional (as many as you have).
    if (DIGS.includes(kind)) {
      const lamps = inv.creative ? Infinity : inv.countOf(BLOCK.GLOW_LAMP);
      const dig = digPlan(kind, { world: this.world, player: this.player, aim, lamps });
      if (!dig.ok) return refuse(dig.reason);
      // What he says when he's done: stopped at your blocks > no lamps > all good.
      const doneLine = dig.short ? 'dugShort' : dig.lamps.length === 0 ? 'dugDark' : 'dug';
      return { ok: true, job: newJob(kind, dig.dig, dig.lamps, doneLine) };
    }

    // Walls, towers and huts: find (and maybe clear) a spot. Bridges and lamps: no clearing.
    const onSite = SITE_BUILDS.includes(kind);
    let planned;
    let clear = [];
    if (onSite) {
      const site = findSite(kind, { world: this.world, player: this.player, aim });
      if (!site.ok) return refuse(site.reason);
      planned = site.blocks;
      clear = site.clear;
    } else {
      planned = blueprint(kind, { world: this.world, player: this.player });
      if (kind === 'bridge' && planned.length === 0) return refuse('noGap');
    }

    const usesMain = planned.some((b) => b.id === MAIN);
    const main = usesMain ? this.chooseBlock() : null;
    if (usesMain && main === null) return refuse('noBlocks');

    // The tower's lamp on top: in survival without a lamp, just another block.
    const lampOnTop = inv.creative || inv.countOf(BLOCK.GLOW_LAMP) > 0;
    let blocks = planned.map((b) => {
      if (b.id === MAIN || (kind === 'tower' && !lampOnTop)) return { ...b, id: main };
      return b;
    });

    // Only spots that are empty (or will be, once he's cleared them): he never replaces anything.
    const cleared = new Set(clear.map((c) => `${c.x},${c.y},${c.z}`));
    blocks = blocks.filter((b) =>
      isEmptyId(this.world.getBlock(b.x, b.y, b.z)) || cleared.has(`${b.x},${b.y},${b.z}`));
    if (blocks.length === 0) return refuse('noRoom');

    // Survival: enough of each block?
    if (!inv.creative) {
      const needs = new Map();
      for (const b of blocks) needs.set(b.id, (needs.get(b.id) ?? 0) + 1);
      for (const [id, need] of needs) {
        const have = inv.countOf(id);
        if (have >= need) continue;
        if (id === BLOCK.GLOW_LAMP && have === 0) return refuse('noLamps', need);
        return refuse('notEnough', need, { block: blockName(id), have });
      }
    }

    return { ok: true, job: newJob(kind, clear, blocks) };
  }

  // ---- 3: building it ----

  // Start a planned job (replacing any job he was doing).
  start(job) {
    this.job = job;
    this.kevin.startWork();
    // Standing where the build goes? Hop out of the way first. (Not for
    // lamps: they're dotted around you, so he'd always be "in the area".)
    if (job.kind !== 'light' && this.kevinInArea([...job.clear, ...job.blocks])) this.kevin.teleport({ quiet: true });
  }

  // Stop building. Returns true if he was building something.
  stop() {
    if (!this.job) return false;
    this.finish('stopped');
    return true;
  }

  // Is all the ground the job touches still loaded? (Checking the corners of
  // the box around it is enough: a job is never wider than a chunk.)
  areaLoaded(job) {
    if (!job.area) {
      const all = [...job.clear, ...job.blocks];
      job.area = {
        minX: Math.min(...all.map((b) => b.x)), maxX: Math.max(...all.map((b) => b.x)),
        minZ: Math.min(...all.map((b) => b.z)), maxZ: Math.max(...all.map((b) => b.z)),
      };
    }
    const { minX, maxX, minZ, maxZ } = job.area;
    return this.world.isLoadedAt(minX, minZ) && this.world.isLoadedAt(maxX, minZ) &&
      this.world.isLoadedAt(minX, maxZ) && this.world.isLoadedAt(maxX, maxZ);
  }

  // Is Kevin standing inside the box around these blocks?
  kevinInArea(blocks) {
    const p = this.kevin.body.position;
    const r = this.kevin.body.halfWidth;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of blocks) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + 1);
      minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z + 1);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y + 1);
    }
    return p.x + r > minX && p.x - r < maxX && p.z + r > minZ && p.z - r < maxZ &&
      p.y + this.kevin.body.height > minY && p.y < maxY;
  }

  // Every frame (after Kevin has moved).
  update(dt) {
    this.updateEffects(dt);
    const job = this.job;
    if (!job) return;

    // The place he's working in has unloaded (you went very far away): give up.
    if (!this.areaLoaded(job)) {
      this.finish('abandoned');
      return;
    }

    job.timer -= dt;
    if (job.timer > 0) return;

    // Clearing the spot first.
    if (this.clearNext(job)) {
      job.timer = CLEAR_EVERY;
      return;
    }
    job.timer = PLACE_EVERY;

    if (job.next >= job.blocks.length) {
      this.finish('done');
      return;
    }

    // Place the next block that can still go in.
    while (job.next < job.blocks.length) {
      const b = job.blocks[job.next++];
      if (!isEmptyId(this.world.getBlock(b.x, b.y, b.z))) continue; // something's there now: leave it be
      if (this.player.overlapsBlock(b.x, b.y, b.z)) continue;         // you're standing there
      if (this.kevin.overlapsBlock(b.x, b.y, b.z)) this.kevin.teleport({ quiet: true });
      if (!this.inventory.creative && this.inventory.countOf(b.id) < 1) {
        this.finish('outOfBlocks', { block: blockName(b.id) });
        return;
      }
      if (!this.world.setBlock(b.x, b.y, b.z, b.id)) continue; // ground not loaded
      if (!this.inventory.creative) {
        this.inventory.removeBlock(b.id, 1);
        this.inventory.changed();
      }
      job.changed++;
      this.kevin.workAt(b);
      this.sparkle(b);
      return;
    }
  }

  // Remove the next block that needs clearing. Returns true if he removed
  // one, false once there's nothing left to clear.
  clearNext(job) {
    while (job.nextClear < job.clear.length) {
      const c = job.clear[job.nextClear++];
      const id = this.world.getBlock(c.x, c.y, c.z);
      // Check again: still the same natural block? (You might have changed it since.)
      if (id !== c.id || !this.world.isNatural(c.x, c.y, c.z) || !isBreakableId(id)) continue;
      if (!this.world.setBlock(c.x, c.y, c.z, this.world.emptyAt(c.x, c.y, c.z))) continue; // ground not loaded
      if (!this.inventory.creative) this.inventory.add(dropId(id)); // like mining it yourself
      job.changed++;
      this.kevin.workAt(c);
      this.sparkle(c, { out: true });
      return true;
    }
    return false;
  }

  // The job's over. `result`: 'done', 'stopped', 'outOfBlocks' or 'abandoned'.
  // Works out what he should say, then hands it to onJobEnd (kevinOrders.js,
  // which may say something else if there are more jobs to do), or just says it.
  finish(result, fill = {}) {
    const { kind, doneLine, changed, planned } = this.job;
    const thing = THINGS[kind];
    this.job = null;
    this.kevin.stopWork();

    let line = null;      // what he says (null = nothing: you told him to stop)
    let success = false;  // did it actually work?
    if (result === 'done' && changed < planned * MOSTLY_DONE) {
      // Never claim success for nothing: if hardly anything actually changed
      // (things got in the way, you stood in the spot, the ground unloaded...),
      // he says so instead of his "done" line.
      this.talk.note(`Kevin tried to make a ${thing} but only managed ${changed} of ${planned} blocks`);
      line = changed === 0
        ? pickLine('jobFailed', 0, { thing })
        : pickLine('jobPartial', changed, { thing, planned });
    } else if (result === 'done') {
      const dug = DIGS.includes(kind);
      this.talk.note(kind === 'light' ? 'Kevin put up glow lamps for the player'
        : `Kevin ${dug ? 'dug' : 'built'} the player a ${thing}`);
      line = pickLine(doneLine ?? (kind === 'light' ? 'litUp' : 'built'), 0, { thing });
      success = true;
    } else if (result === 'outOfBlocks') {
      this.talk.note(`Kevin ran out of ${fill.block} halfway through a ${thing}`);
      line = pickLine('outOfBlocks', 0, fill);
    } else if (result === 'abandoned') {
      this.talk.note(`the player went so far away that Kevin gave up on the ${thing}`);
      line = pickLine('abandoned', 0, { what: LIST_NAMES[kind] });
      // Back to you (unless you told him to stay put).
      if (!this.kevin.staying) this.kevin.teleport({ quiet: true });
    }

    if (this.onJobEnd) this.onJobEnd({ kind, result, line, success });
    else if (line) this.talk.say(line, { interrupt: !success });
  }

  // ---- Previews, while you pick a spot (kevinOrders.js / kevinGhost.js) ----

  // What a job would look like if he started it right now. Returns
  //   { ok, cells, spot, plan }
  //   ok     can it go here?
  //   cells  boxes for the ghost: the blocks he'd place (or dig, for tunnels
  //          and stairs); if it can't go here, roughly where it would have gone
  //   spot   where you're pointing, and which way you face (for "hold steady")
  //   plan   what plan() said
  preview(kind) {
    const dir = facing(this.player);
    const aim = this.aimAt();
    const p = this.player.position;
    const feet = { x: Math.floor(p.x), y: Math.floor(p.y + 0.01), z: Math.floor(p.z) };
    // The bridge goes from where you stand, so that's its spot; the rest go where you point.
    const where = kind === 'bridge' || !aim ? feet : aim;
    const spot = { x: where.x, y: where.y, z: where.z, fx: dir.fx, fz: dir.fz };
    // Not pointing at anything (the sky, or too far away)? Nothing to show yet.
    if (!this.hasSpot(kind)) {
      return { ok: false, cells: [], spot, plan: { ok: false, reason: 'pointAtSpot' } };
    }
    const plan = this.plan(kind);
    if (plan.ok) {
      const job = plan.job;
      return { ok: true, cells: DIGS.includes(kind) ? job.clear : job.blocks, spot, plan };
    }
    return { ok: false, cells: this.roughShape(kind, dir, aim, feet), spot, plan };
  }

  // Are you pointing somewhere he could put it? (The bridge goes from where
  // you stand, so it doesn't need you to point.)
  hasSpot(kind) {
    return kind === 'bridge' || this.aimAt() !== null;
  }

  // Roughly where a job would go, for a red ghost when it can't go there.
  roughShape(kind, dir, aim, feet) {
    if (SITE_BUILDS.includes(kind)) {
      return structure(kind, wantedSpot(kind, this.world, this.player, aim, dir), dir);
    }
    if (kind === 'bridge') {
      const cells = [];
      for (let along = 1; along <= 6; along++) cells.push(at({ ...feet, y: feet.y - 1 }, dir, along, 0, 0));
      return cells;
    }
    if (kind === 'tunnel') return aim ? [aim, { x: aim.x, y: aim.y + 1, z: aim.z }] : [];
    if (kind === 'stairs') return [aim ?? at({ ...feet, y: feet.y - 1 }, dir, 1, 0, 0)];
    return [];
  }

  // ---- Survival: can you afford several jobs at once? ----

  // Roughly how many of each block a job will use, as a Map id -> count.
  // (Floors are included; foundations depend on the ground, so each job
  // still checks exactly when it starts.) `main` = the block he builds with.
  estimateNeeds(kind, main) {
    const needs = new Map();
    const add = (id, n) => { if (n > 0) needs.set(id, (needs.get(id) ?? 0) + n); };
    if (SITE_BUILDS.includes(kind)) {
      // The tower's lamp is optional (a plain block if you have no lamps), so it isn't counted.
      const blocks = structure(kind, { x: 0, y: 0, z: 0 }, { fx: 0, fz: -1, rx: 1, rz: 0 });
      add(main, blocks.filter((b) => b.id === MAIN).length);
    } else if (kind === 'bridge') {
      add(main, blueprint(kind, { world: this.world, player: this.player }).length);
    } else if (kind === 'light') {
      add(BLOCK.GLOW_LAMP, blueprint(kind, { world: this.world, player: this.player }).length || LAMPS_ESTIMATE);
    }
    // Tunnels and stairs need nothing (their lamps are optional).
    return needs;
  }

  // Can you afford ALL these jobs together? Returns null if so (or in
  // creative), or what he says if not, naming the job that tips it over.
  checkAfford(kinds) {
    const inv = this.inventory;
    if (inv.creative) return null;
    const main = this.chooseBlock();
    const total = new Map();
    for (const kind of kinds) {
      for (const [id, n] of this.estimateNeeds(kind, main)) {
        if (id === null) return pickLine('noBlocks');
        const sum = (total.get(id) ?? 0) + n;
        total.set(id, sum);
        const have = inv.countOf(id);
        if (sum > have) {
          return pickLine('cantAffordList', sum, { thing: NEXT_NAMES[kind], block: blockName(id), have });
        }
      }
    }
    return null;
  }

  // ---- The sparkle and the beam ----

  // A sparkle round block b: shrinking onto it (placed), or growing away
  // from it (out = true: removed).
  sparkle(b, { out = false } = {}) {
    const pop = this.pops[this.nextPop];
    this.nextPop = (this.nextPop + 1) % this.pops.length;
    pop.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
    pop.age = 0;
    pop.out = out;
    pop.visible = true;

    // From his antenna tip to the middle of the block.
    const k = this.kevin.body.position;
    const points = this.beam.geometry.attributes.position;
    points.setXYZ(0, k.x, k.y + 2.2, k.z);
    points.setXYZ(1, b.x + 0.5, b.y + 0.5, b.z + 0.5);
    points.needsUpdate = true;
    this.beam.age = 0;
    this.beam.visible = true;
  }

  updateEffects(dt) {
    for (const pop of this.pops) {
      if (!pop.visible) continue;
      pop.age += dt;
      const t = pop.age / POP_TIME;
      if (t >= 1) {
        pop.visible = false;
        continue;
      }
      pop.scale.setScalar(pop.out ? 1 + 0.45 * t : 1.4 - 0.38 * t); // shrinks onto the block (or grows away)...
      pop.material.opacity = 1 - t;        // ...and fades away
    }
    if (this.beam.visible) {
      this.beam.age += dt;
      this.beam.material.opacity = 1 - this.beam.age / BEAM_TIME;
      if (this.beam.age >= BEAM_TIME) this.beam.visible = false;
    }
  }
}

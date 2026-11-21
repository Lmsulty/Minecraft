import * as THREE from 'three';
import { BLOCK, isBreakableId, dropId } from './blocks.js';
import { isPlaceableId, displayName } from './items.js';
import { THEME } from './theme.js';
import { bendMaterial } from './curve.js';
import { blueprint, MAIN } from './kevinBlueprints.js';
import { findSite } from './kevinSite.js';
import { pickLine } from './kevinBrain.js';

// Kevin BUILDING things you ask for in the chat (wall, tower, hut, bridge,
// lamps). kevinBlueprints.js says where the blocks go; this file:
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
// halfway (e.g. you dropped some), or you walk more than 24 blocks away.

// ==========================================================
const PLACE_EVERY = 0.15;   // seconds between blocks
const CLEAR_EVERY = 0.08;   // seconds between blocks while clearing (a tree is a lot of leaves)
const GIVE_UP_DISTANCE = 24; // you walked this far away: he stops
const POP_TIME = 0.3;       // seconds the sparkle round a new block lasts
const BEAM_TIME = 0.12;     // seconds the beam from his antenna lasts
const POP_COUNT = 6;        // sparkles that can show at once
// ==========================================================

// Names for his lines ("One {thing}, coming up").
const THINGS = { wall: 'wall', tower: 'tower', hut: 'hut', bridge: 'bridge', light: 'lamps' };
export const BUILDS = Object.keys(THINGS);
const SITE_BUILDS = ['wall', 'tower', 'hut']; // these need a spot found (and maybe cleared) first

function blockName(id) {
  return displayName(id).toLowerCase();
}

export class KevinBuilder {
  constructor({ kevin, world, player, inventory, talk, scene }) {
    this.kevin = kevin;
    this.world = world;
    this.player = player;
    this.inventory = inventory;
    this.talk = talk;
    this.job = null; // what he's building: { kind, blocks, next, timer }

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
    return this.job.kind === 'light' ? 'putting up glow lamps' : `building a ${THINGS[this.job.kind]}`;
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

  // Work out a build. Returns { ok: true, job } or { ok: false, line }
  // (line = what he says instead, explaining why not).
  plan(kind) {
    const inv = this.inventory;
    const refuse = (lineKind, count = 0, fill = {}) => ({ ok: false, line: pickLine(lineKind, count, fill) });

    // Walls, towers and huts: find (and maybe clear) a spot. Bridges and lamps: no clearing.
    const onSite = SITE_BUILDS.includes(kind);
    let planned;
    let clear = [];
    if (onSite) {
      const site = findSite(kind, { world: this.world, player: this.player, aim: this.kevin.aim });
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
      this.world.getBlock(b.x, b.y, b.z) === BLOCK.AIR || cleared.has(`${b.x},${b.y},${b.z}`));
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

    return { ok: true, job: { kind, clear, nextClear: 0, blocks, next: 0, timer: 0 } };
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

    const k = this.kevin.body.position;
    const p = this.player.position;
    if (Math.hypot(p.x - k.x, p.z - k.z) > GIVE_UP_DISTANCE) {
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
      if (this.world.getBlock(b.x, b.y, b.z) !== BLOCK.AIR) continue; // something's there now: leave it be
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
      if (!this.world.setBlock(c.x, c.y, c.z, BLOCK.AIR)) continue; // ground not loaded
      if (!this.inventory.creative) this.inventory.add(dropId(id)); // like mining it yourself
      this.kevin.workAt(c);
      this.sparkle(c, { out: true });
      return true;
    }
    return false;
  }

  // The job's over. `result`: 'done', 'stopped', 'outOfBlocks' or 'abandoned'.
  finish(result, fill = {}) {
    const { kind } = this.job;
    const thing = THINGS[kind];
    this.job = null;
    this.kevin.stopWork();
    if (result === 'done') {
      this.talk.note(kind === 'light' ? 'Kevin put up glow lamps for the player' : `Kevin built the player a ${thing}`);
      this.talk.say(pickLine(kind === 'light' ? 'litUp' : 'built', 0, { thing }), { interrupt: false });
    } else if (result === 'outOfBlocks') {
      this.talk.note(`Kevin ran out of ${fill.block} halfway through a ${thing}`);
      this.talk.say(pickLine('outOfBlocks', 0, fill));
    } else if (result === 'abandoned') {
      this.talk.note(`the player walked off while Kevin was building a ${thing}`);
      this.talk.say(pickLine('abandoned', 0, { thing }));
    }
    // 'stopped': you told him to, and his chat reply already said so.
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

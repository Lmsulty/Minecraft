import * as THREE from 'three';
import { THEME } from './theme.js';
import { BLOCK } from './blocks.js';
import { travelTo } from './planets.js';
import { pickLine, hasLines } from './kevinBrain.js';

// ==========================================================
//  CUTSCENES: the rocket taking off and landing (step 5).
//
//  Takeoff (after picking a planet in the ship): you and Kevin go aboard
//  and the door shuts, the camera moves out to the side, the engine fires
//  with smoke and a little shake, the rocket lifts off and speeds up into a
//  darkening sky, and the screen fades to black. Then travelTo() reloads
//  the game as the new planet.
//
//  Landing (when the game starts after travelling by ship): it fades in
//  looking up, the rocket comes down slowing as it gets close, touches down
//  in a puff of dust, settles, and the door opens. Then you're back in
//  control at the ramp, with Kevin.
//
//  During a cutscene you can't move or open menus. Space skips it.
//  The debug P key (planets.js) still travels instantly, with no cutscene.
// ==========================================================

// ---- Timings (seconds from the start of each cutscene) ----
const TAKEOFF = {
  doorShut: 0.4,        // the door shuts and the ramp tucks away
  ignite: 0.7,          // the engine starts: flame, smoke, shaking
  kevinLine: 0.9,       // Kevin says his takeoff line
  liftOff: 1.9,         // the rocket starts to rise
  skyDarkStart: 2.2,    // the sky starts fading to black and stars
  fadeOutStart: 4.3,    // the screen starts fading to black...
  end: 5.0,             // ...and is black: travel now
};
const LANDING = {
  fadeInEnd: 0.8,       // the screen has faded in from black
  touchdown: 3.0,       // the rocket touches the ground
  engineOff: 3.4,       // the flame goes out
  doorOpen: 3.5,        // the door opens, Kevin steps out and says his line
  end: 4.2,             // back in control
};

// ---- How it moves ----
const LIFT_HEIGHT = 75;     // how high the rocket climbs before the fade (blocks)
const LIFT_CURVE = 2.4;     // bigger = starts slower, then speeds up more
const DROP_HEIGHT = 60;     // how high the rocket starts when landing (blocks)
const DROP_CURVE = 2.2;     // bigger = slows down more near the ground
const SETTLE_DIP = 0.15;    // the legs squash this much at touchdown (blocks)
const SETTLE_TIME = 0.35;   // ...and spring back over this long
const TRAIL_LENGTH = 6;     // extra flame length at full speed (blocks)

// ---- Camera ----
const CAMERA_DISTANCE = 18;            // blocks from the rocket (tries a few nearby too)
const CAMERA_DIRECTIONS = 16;          // directions tried around the rocket
const CAMERA_EYE = 1.6;                // height above the ground at its spot
const LOOK_HEIGHT = 5;                 // aims this far up the rocket (its middle)
const SKY_CHECKS = [0.25, 0.5, 0.75, 1]; // spots up the landing path (shares of DROP_HEIGHT) that
                                         // the camera should see, so a frozen cloud (ice planet)
                                         // doesn't hide the rocket on its way down
const SHAKE_IGNITION = 0.06;           // camera shake while the engine fires on the ground (blocks)
const SHAKE_TOUCHDOWN = 0.12;          // ...and at touchdown
const SHAKE_FADE = 0.4;                // the touchdown shake dies away over this long

// ---- Sky (takeoff) ----
const SKY_DARKEN = 0.85;               // how far the sky fades towards black (1 = all the way)
const HOLE_GROWTH = 0.8;               // the black hole grows by this much (0.8 = 80% bigger)

// ---- Smoke and dust ----
const PUFFS = 40;                      // puffs made once at the start and reused
const SMOKE_RATE = 18;                 // puffs per second while the engine is near the ground
const SMOKE_NEAR_GROUND = 10;          // smoke only while the rocket is this close to the ground (blocks)
const TOUCHDOWN_PUFFS = 22;            // puffs in the burst at touchdown
const PUFF_LIFE = [0.9, 1.6];          // how long a puff lasts (seconds). All gone within 2 seconds.
const PUFF_SIZE = [1.2, 2.0];          // how big it starts, then grows to about 3 times that
const PUFF_GROWTH = 2;                 // grows by this many times its size as it fades
const PUFF_SPEED = [3, 6];             // how fast it spreads out from the base (blocks per second)
const PUFF_OPACITY = 0.9;

// A soft, lumpy cloud: a few overlapping blurry circles, white with see-through
// edges (the colour comes from THEME.ship.smoke). Drawn once, in code.
function makePuffTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const blobs = [[32, 34, 22], [22, 30, 14], [42, 28, 15], [30, 22, 13], [38, 40, 13]]; // x, y, radius
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const between = ([lo, hi]) => lo + Math.random() * (hi - lo);

// "an hour", "10 minutes": home time per minute on a planet with this slip.
function slipWords(slip) {
  if (slip % 60 === 0) return slip === 60 ? 'an hour' : `${slip / 60} hours`;
  return `${slip} minutes`;
}

export class Cutscene {
  // opts: { scene, camera, player, kevin, talk, ship, world, dayNight, getHaze,
  //         fade, skipHint, cover (index.html's black arrival cover), stepOut,
  //         timeSlip (the trip clocks: started on takeoff from home, and
  //         Kevin's "home aged..." line when you land back) }
  constructor(opts) {
    Object.assign(this, opts);
    this.active = null; // 'takeoff', 'landing' or null
    this.time = 0;
    this.lookTarget = new THREE.Vector3();
    this.cameraSpot = null;
    this.baseHoleSize = this.dayNight.dome.material.uniforms.holeSize.value;
    this.black = new THREE.Color(0x000000);
    this.makePuffs();

    // Space skips (only while a cutscene is playing).
    document.addEventListener('keydown', (e) => {
      if (!this.active || e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      if (this.active === 'takeoff') this.travel();
      else this.finishLanding();
    });
  }

  // ---- Smoke puffs: made now and kept, so nothing new is made mid-cutscene ----
  // Each puff is a soft round cloud picture that always faces the camera.
  makePuffs() {
    const texture = makePuffTexture();
    this.smokeColor = new THREE.Color(THEME.ship.smoke);
    this.puffs = [];
    for (let i = 0; i < PUFFS; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture, color: this.smokeColor.clone(), transparent: true, opacity: 0, depthWrite: false,
      });
      const mesh = new THREE.Sprite(material);
      mesh.scale.setScalar(0.0001); // in the scene from the start (so it's ready to draw), but invisible
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.puffs.push({ mesh, age: 0, life: 0, size: 0, velocity: new THREE.Vector3(), alive: false });
    }
    this.nextPuff = 0;
    this.smokeDue = 0;
  }

  // One puff at the base of the rocket, spreading outwards along the ground.
  puff(upwards = 0.6) {
    const p = this.puffs[this.nextPuff];
    this.nextPuff = (this.nextPuff + 1) % PUFFS;
    const { origin } = this.ship.site;
    const angle = Math.random() * Math.PI * 2;
    const speed = between(PUFF_SPEED);
    p.mesh.position.set(origin.x + Math.cos(angle) * 1.2, origin.y + 0.4, origin.z + Math.sin(angle) * 1.2);
    p.velocity.set(Math.cos(angle) * speed, upwards + Math.random() * 0.8, Math.sin(angle) * speed);
    p.mesh.material.rotation = Math.random() * Math.PI * 2; // so they don't all look the same
    p.age = 0;
    p.life = between(PUFF_LIFE);
    p.size = between(PUFF_SIZE);
    p.alive = true;
  }

  updatePuffs(dt) {
    // Darker at night, like everything else lit by the sky.
    const light = Math.min(1, 0.25 + this.dayNight.ambientLight.intensity / 1.2);
    for (const p of this.puffs) {
      if (!p.alive) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.alive = false;
        p.mesh.material.opacity = 0;
        p.mesh.scale.setScalar(0.0001);
        continue;
      }
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.multiplyScalar(Math.max(0, 1 - dt * 2.2)); // slows down as it spreads
      p.mesh.scale.setScalar(p.size * (1 + t * PUFF_GROWTH));
      p.mesh.material.opacity = PUFF_OPACITY * (1 - t) ** 1.5 * Math.min(1, t * 8);
      p.mesh.material.color.copy(this.smokeColor).multiplyScalar(light);
    }
  }

  // ---- Where the camera watches from ----
  // A spot about CAMERA_DISTANCE blocks to the side of the rocket, on dry
  // ground, with a clear view of it, base and all (so you see the smoke and
  // dust), and of its whole path up into the sky (nothing like a frozen cloud
  // in the way). Lower spots win, so the rocket looks big. If nowhere can see
  // all that, it gives up the sky view first, then the base.
  findCameraSpot() {
    return this.searchCameraSpot(true, true) ?? this.searchCameraSpot(true, false) ??
      this.searchCameraSpot(false, false) ?? this.fallbackSpot();
  }

  fallbackSpot() {
    // (Never expected: nowhere clear. Hover a little above the ground instead.)
    const { origin } = this.ship.site;
    return new THREE.Vector3(origin.x + CAMERA_DISTANCE, origin.y + 4, origin.z);
  }

  searchCameraSpot(needBase, needSky) {
    const { origin } = this.ship.site;
    const target = new THREE.Vector3(origin.x, origin.y + LOOK_HEIGHT, origin.z);
    const base = new THREE.Vector3(origin.x, origin.y + 0.6, origin.z);
    const sky = SKY_CHECKS.map((share) => target.clone().setY(target.y + DROP_HEIGHT * share));
    const world = this.world;
    let best = null;
    for (const distance of [CAMERA_DISTANCE, CAMERA_DISTANCE - 3, CAMERA_DISTANCE + 4, CAMERA_DISTANCE - 6]) {
      for (let i = 0; i < CAMERA_DIRECTIONS; i++) {
        const angle = (i / CAMERA_DIRECTIONS) * Math.PI * 2;
        const x = origin.x + Math.cos(angle) * distance;
        const z = origin.z + Math.sin(angle) * distance;
        if (!world.isLoadedAt(x, z)) continue;
        // The real ground (on the ice planet, not the top of a frozen cloud).
        const ground = world.getGroundY(Math.floor(x), Math.floor(z));
        const under = world.getBlock(x, ground - 1, z);
        if (under === BLOCK.WATER || under === BLOCK.SHIP_HULL) continue;
        if (world.getBlock(x, ground, z) === BLOCK.WATER) continue; // standing in the sea
        const eye = new THREE.Vector3(x, ground + CAMERA_EYE, z);
        if (!this.canSee(eye, target)) continue;
        if (needBase && !this.canSee(eye, base)) continue;
        if (needSky && !sky.every((spot) => this.canSee(eye, spot))) continue;
        const score = (eye.y - origin.y) + Math.abs(distance - CAMERA_DISTANCE) * 0.3;
        if (!best || score < best.score) best = { score, eye };
      }
      if (best) break; // happy with the first distance that works
    }
    return best?.eye ?? null;
  }

  // Is the straight line from a to b clear of the ground (and trees, and
  // frozen clouds)? Checked every half block, so even a thin cloud is caught.
  canSee(a, b) {
    const steps = Math.max(30, Math.ceil(a.distanceTo(b) * 2));
    const p = new THREE.Vector3();
    for (let i = 1; i < steps * 0.9; i++) { // stop short of the rocket itself
      p.lerpVectors(a, b, i / steps);
      if (this.world.isSolid(p.x, p.y, p.z) && this.world.getBlock(p.x, p.y, p.z) !== BLOCK.SHIP_HULL) return false;
    }
    return true;
  }

  // ---- Starting ----
  takeoff(planetName) {
    this.planetName = planetName;
    // Leaving home: a new trip starts, both time slip clocks at zero (timeSlip.js).
    if (THEME.planet === 'home') this.timeSlip?.startTrip();
    this.start('takeoff');
    this.kevin.hidden = true;   // you're both aboard
    this.talk.saidHello = true; // no "hello" cutting over his takeoff line
    this.fade.style.opacity = '0';
  }

  landing() {
    this.start('landing');
    this.kevin.hidden = true;   // still aboard
    this.talk.saidHello = true; // he says his landing line instead of hello
    this.ship.setDoorOpen(false);
    this.ship.setLift(DROP_HEIGHT);
    this.ship.setEngine(1, TRAIL_LENGTH * 0.5);
    this.fade.style.opacity = '1';
    // index.html kept the page black from the very start; the fade (black
    // too) takes over from here.
    this.cover.remove();
    document.documentElement.classList.remove('arriving');
  }

  start(kind) {
    this.active = kind;
    this.time = 0;
    this.saidLine = false;
    this.touched = false;
    this.player.openMenu();      // frees the mouse: you can't move or open menus...
    this.player.locked = false;  // (counts as not playing straight away, before the browser confirms)
    this.player.updateOverlay(); // ...and no "Click to play" screen over the cutscene
    this.cameraSpot = this.findCameraSpot();
    this.skipHint.classList.add('is-shown');
    document.body.classList.add('in-cutscene'); // hides the crosshair, hotbar and hints (shipPicker.css)
  }

  // ---- Every frame: call BEFORE dayNight.update() (moves the camera and rocket) ----
  update(dt) {
    // Puffs keep spreading and fading even after the cutscene ends, until they're gone.
    this.updatePuffs(dt);
    if (!this.active) return;
    this.time += dt;
    if (this.active === 'takeoff') this.updateTakeoff(dt);
    else this.updateLanding(dt);
  }

  updateTakeoff(dt) {
    const t = this.time;
    const T = TAKEOFF;
    if (t >= T.doorShut) this.ship.setDoorOpen(false);
    if (t >= T.kevinLine && !this.saidLine) {
      this.saidLine = true;
      this.talk.say(pickLine('takeoff'));
    }
    // Rising: slow at first, then faster and faster.
    const flying = Math.max(0, t - T.liftOff) / (T.end - T.liftOff);
    const lift = LIFT_HEIGHT * flying ** LIFT_CURVE;
    this.ship.setLift(lift);
    // Engine: builds up after ignition; the trail grows as it speeds up.
    const power = t < T.ignite ? 0 : smooth((t - T.ignite) / (T.liftOff - T.ignite)) * 0.7 + (flying > 0 ? 0.3 : 0);
    this.ship.setEngine(power, TRAIL_LENGTH * Math.min(1, flying * 2));
    // Smoke while the engine is near the ground.
    if (power > 0 && lift < SMOKE_NEAR_GROUND) this.emitSmoke(dt, 1 - lift / SMOKE_NEAR_GROUND);
    // Shaking: while the engine fires on the ground, fading as it climbs.
    const shake = power > 0 ? SHAKE_IGNITION * power * Math.max(0, 1 - lift / 15) : 0;
    this.placeCamera(lift, shake);
    // The screen fades to black, then we travel.
    this.fade.style.opacity = String(smooth((t - T.fadeOutStart) / (T.end - T.fadeOutStart)));
    if (t >= T.end) this.travel();
  }

  updateLanding(dt) {
    const t = this.time;
    const T = LANDING;
    // Coming down: fast at first, slowing as it gets close.
    const left = Math.max(0, 1 - t / T.touchdown); // 1 = just started, 0 = touched down
    let lift = DROP_HEIGHT * left ** DROP_CURVE;
    if (t >= T.touchdown) {
      if (!this.touched) {
        this.touched = true;
        for (let i = 0; i < TOUCHDOWN_PUFFS; i++) this.puff(0.3);
      }
      // The legs squash a little and spring back.
      const settle = (t - T.touchdown) / SETTLE_TIME;
      lift = settle < 1 ? -SETTLE_DIP * Math.sin(settle * Math.PI) : 0;
    }
    this.ship.setLift(lift);
    const power = t < T.engineOff ? 1 - 0.5 * smooth((t - (T.touchdown - 0.6)) / 0.6) : 0;
    this.ship.setEngine(power, TRAIL_LENGTH * 0.5 * left);
    // Smoke on the way down; after touchdown only the one burst of dust.
    if (!this.touched && lift < SMOKE_NEAR_GROUND) this.emitSmoke(dt, 1 - lift / SMOKE_NEAR_GROUND);
    // A small shake at touchdown.
    const sinceTouch = t - T.touchdown;
    const shake = sinceTouch >= 0 ? SHAKE_TOUCHDOWN * Math.max(0, 1 - sinceTouch / SHAKE_FADE) : 0;
    this.placeCamera(lift, shake);
    this.fade.style.opacity = String(1 - smooth(t / T.fadeInEnd));
    if (t >= T.doorOpen && !this.saidLine) {
      this.saidLine = true;
      this.ship.setDoorOpen(true);
      this.kevin.hidden = false;
      this.talk.say(this.landingLine());
    }
    if (t >= T.end) this.finishLanding();
  }

  emitSmoke(dt, amount) {
    this.smokeDue += dt * SMOKE_RATE * amount;
    while (this.smokeDue >= 1) {
      this.smokeDue -= 1;
      this.puff();
    }
  }

  // Camera at its spot (shaken a little), looking at the middle of the rocket.
  placeCamera(lift, shake) {
    const { origin } = this.ship.site;
    this.camera.position.copy(this.cameraSpot);
    if (shake > 0) {
      this.camera.position.x += (Math.random() * 2 - 1) * shake;
      this.camera.position.y += (Math.random() * 2 - 1) * shake;
      this.camera.position.z += (Math.random() * 2 - 1) * shake;
    }
    this.lookTarget.set(origin.x, origin.y + LOOK_HEIGHT + lift, origin.z);
    this.camera.lookAt(this.lookTarget);
    // Keep the haze from swallowing the rocket high up (it's normally set
    // for the land around you). The camera looks up, so far land stays hidden.
    const [near, far] = this.getHaze();
    const distance = this.cameraSpot.distanceTo(this.lookTarget) + 15;
    this.scene.fog.near = near;
    this.scene.fog.far = Math.max(far, distance);
  }

  // ---- Every frame: call AFTER dayNight.update() (it sets the sky colours) ----
  // During takeoff, the sky fades towards black and stars, and the black hole grows.
  updateSky() {
    if (this.active !== 'takeoff') return;
    const dark = smooth((this.time - TAKEOFF.skyDarkStart) / (TAKEOFF.end - TAKEOFF.skyDarkStart)) * SKY_DARKEN;
    if (dark <= 0) return;
    const dome = this.dayNight.dome.material.uniforms;
    this.scene.fog.color.lerp(this.black, dark);
    this.scene.background.copy(this.scene.fog.color);
    dome.horizon.value.lerp(this.black, dark);
    dome.top.value.lerp(this.black, dark);
    dome.starsVisible.value = Math.max(dome.starsVisible.value, dark);
    dome.holeSize.value = this.baseHoleSize * (1 + HOLE_GROWTH * dark);
  }

  // Kevin's line as the door opens. A planet can have its own lines in
  // kevinBrain.js, called "landing" + its name (e.g. landingIce for `ice`).
  landingLine() {
    const planet = THEME.planets[THEME.planet];
    if (planet.timeSlip <= 1) {
      // Back home: how long were we gone, and how much did home age? (timeSlip.js)
      const trip = this.timeSlip?.endTrip();
      return trip ? pickLine('backHome', 0, trip) : pickLine('landingHome');
    }
    const own = 'landing' + THEME.planet[0].toUpperCase() + THEME.planet.slice(1);
    return pickLine(hasLines(own) ? own : 'landing', 0, { planet: planet.name, slip: slipWords(planet.timeSlip) });
  }

  // ---- Ending ----
  travel() {
    this.active = null; // stop: the page is about to reload
    this.fade.style.opacity = '1';
    travelTo(this.planetName, { byShip: true });
  }

  finishLanding() {
    this.ship.setLift(0);
    this.ship.setEngine(0);
    this.ship.setDoorOpen(true);
    if (!this.saidLine) {
      this.saidLine = true;
      this.talk.say(this.landingLine());
    }
    this.kevin.hidden = false;
    this.fade.style.opacity = '0';
    this.skipHint.classList.remove('is-shown');
    document.body.classList.remove('in-cutscene');
    [this.scene.fog.near, this.scene.fog.far] = this.getHaze();
    this.active = null;
    // Back to your own eyes, at the ramp, with "Click to step out" over the
    // view. (After a reload the browser only hands the mouse back to the
    // game after a click, so this is that click, as part of arriving.)
    this.player.restoreLook();
    this.player.updateCamera();
    this.stepOut.classList.add('is-shown');
    this.stepOut.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stepOut.classList.remove('is-shown');
      this.player.closeMenu({ resume: true }); // captures the mouse: you're playing
    }, { once: true });
  }
}

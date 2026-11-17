import * as THREE from 'three';
import { THEME } from './theme.js';
import { makeSkyDome, makeSuns, setSkyDetail } from './sky.js';

// Day/night cycle: a game clock, the two suns moving across the sky, the
// black hole with the stars wheeling around it at night, and the sky, haze
// and lights fading between the keyframes in theme.js. (The pictures
// themselves are drawn in sky.js.) Press T to speed time up (and T again to go back).

// ---- Timing ----
const DAY_LENGTH_SECONDS = 360; // one full 24-hour day = 6 real minutes
const START_HOUR = 9;           // the game starts mid-morning
const FAST_SPEED = 20;          // speed when T is on (a whole day in ~18 seconds)
const SUNRISE_HOUR = 6;         // sun crosses the horizon going up
const SUNSET_HOUR = 20;         // sun crosses the horizon going down

// ---- Sky objects ----
const SUN_TILT = 0.35;      // tilts the suns' path a little toward the south, so walls get different shading
const SKY_DISTANCE = 200;   // how far away the suns are drawn (always this far from you)
const STAR_TURN_SPEED = 0.5; // how fast the stars wheel around the black hole (turns per day)

// Eases a 0..1 value so changes start and end gently instead of abruptly.
function smooth(t) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

export class DayNight {
  // skyDetail = the graphics level (THEME.graphics.levels) the sky starts with.
  constructor(scene, camera, ambientLight, mainLight, skyDetail) {
    this.scene = scene;
    this.camera = camera;
    this.ambientLight = ambientLight; // soft light from sky + ground
    this.mainLight = mainLight;       // the big sun by day, starlight by night
    this.hour = START_HOUR;
    this.fast = false;

    // Theme keyframes, with colours turned into Three.js colours once up front.
    this.keyframes = THEME.skyKeyframes
      .map((k) => ({
        ...k,
        sky: new THREE.Color(k.sky),
        skyTop: new THREE.Color(k.skyTop),
        cloudLit: new THREE.Color(k.cloudLit),
        cloudShade: new THREE.Color(k.cloudShade),
        light: new THREE.Color(k.light),
        ambientSky: new THREE.Color(k.ambientSky),
        ambientGround: new THREE.Color(k.ambientGround),
      }))
      .sort((a, b) => a.hour - b.hour);

    this.sunDirection = new THREE.Vector3(); // the big sun: where the light comes from
    this.direction = new THREE.Vector3();    // scratch space for the other sun

    // The sky dome draws the sky colours, the stars and the black hole (sky.js).
    this.dome = makeSkyDome(skyDetail);
    this.suns = makeSuns();
    scene.add(this.dome, ...this.suns);

    // The black hole stays still, high in the northern sky (north = -z).
    // Also work out "up" and "right" across it, for drawing its disc.
    const height = THREE.MathUtils.degToRad(THEME.blackHole.height);
    const dome = this.dome.material.uniforms;
    dome.holeDirection.value.set(0, Math.sin(height), -Math.cos(height));
    dome.holeUp.value.set(0, Math.cos(height), Math.sin(height));
    dome.holeRight.value.crossVectors(dome.holeDirection.value, dome.holeUp.value);
    // The galaxy band passes through the black hole, tipped by galaxyTilt.
    const tilt = THREE.MathUtils.degToRad(THEME.starfield.galaxyTilt);
    dome.galaxyNormal.value.copy(dome.holeUp.value).multiplyScalar(Math.cos(tilt))
      .addScaledVector(dome.holeRight.value, Math.sin(tilt));

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyT' && !e.repeat) this.fast = !this.fast;
    });

    this.update(0); // set the starting colours straight away
  }

  // Draw the sky with another graphics level's detail (graphics.js).
  setSkyDetail(detail) {
    setSkyDetail(this.dome, detail);
  }

  // Call every frame. dt = seconds since the last frame.
  update(dt) {
    const speed = this.fast ? FAST_SPEED : 1;
    this.hour = (this.hour + (Math.max(0, dt) * speed * 24) / DAY_LENGTH_SECONDS) % 24;

    this.dome.material.uniforms.time.value += Math.max(0, dt); // real seconds: the black hole's gas keeps swirling
    this.blendKeyframes();
    this.moveSkyObjects();
  }

  // ---- Colours: blend between the keyframes either side of the current hour ----
  blendKeyframes() {
    const frames = this.keyframes;
    let i = frames.length - 1;
    for (let k = 0; k < frames.length; k++) {
      if (frames[k].hour <= this.hour) i = k;
    }
    const a = frames[i];
    const b = frames[(i + 1) % frames.length];

    // Handle wrapping past midnight (e.g. from 22:00 to 4:00).
    let start = a.hour;
    let end = b.hour;
    let now = this.hour;
    if (end <= start) end += 24;
    if (now < start) now += 24;
    const t = smooth((now - start) / (end - start));

    // Horizon colour = haze colour, so distant land fades into the sky.
    this.scene.fog.color.lerpColors(a.sky, b.sky, t);
    this.scene.background.copy(this.scene.fog.color);
    const dome = this.dome.material.uniforms;
    dome.horizon.value.copy(this.scene.fog.color);
    dome.top.value.lerpColors(a.skyTop, b.skyTop, t);
    dome.cloudLit.value.lerpColors(a.cloudLit, b.cloudLit, t);
    dome.cloudShade.value.lerpColors(a.cloudShade, b.cloudShade, t);
    this.ambientLight.color.lerpColors(a.ambientSky, b.ambientSky, t);
    this.ambientLight.groundColor.lerpColors(a.ambientGround, b.ambientGround, t);
    this.ambientLight.intensity = a.ambientStrength + (b.ambientStrength - a.ambientStrength) * t;
    this.mainLight.color.lerpColors(a.light, b.light, t);
    this.lightStrength = a.lightStrength + (b.lightStrength - a.lightStrength) * t;
    dome.starsVisible.value = a.stars + (b.stars - a.stars) * t;
  }

  // ---- Where the suns, black hole and stars are ----
  moveSkyObjects() {
    // Angle around the sky: 0 = rising in the east, half a turn = setting in the west.
    // Daytime (6:00-20:00) is the top half of the circle, night the bottom half.
    let angle;
    if (this.hour >= SUNRISE_HOUR && this.hour < SUNSET_HOUR) {
      angle = ((this.hour - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR)) * Math.PI;
    } else {
      const nightHours = 24 - (SUNSET_HOUR - SUNRISE_HOUR);
      const sinceSunset = (this.hour - SUNSET_HOUR + 24) % 24;
      angle = Math.PI + (sinceSunset / nightHours) * Math.PI;
    }
    const cam = this.camera.position;

    // The suns, always the same distance from you, each fading out as it sets.
    // The first (big) sun is also where the light comes from.
    THEME.suns.forEach((settings, i) => {
      const a = angle - settings.lag;
      const dir = (i === 0 ? this.sunDirection : this.direction)
        .set(Math.cos(a), Math.sin(a), SUN_TILT + settings.tilt).normalize();
      this.suns[i].position.copy(cam).addScaledVector(dir, SKY_DISTANCE);
      this.suns[i].material.opacity = smooth((dir.y + 0.05) / 0.1);
    });
    const sunHeight = this.sunDirection.y; // above 0 = day, below 0 = night

    // The main light shines from the big sun by day, and from the opposite
    // side of the sky by night (dim blue starlight). It fades to nothing right
    // at the horizon, so the swap is never visible.
    const lightFrom = sunHeight >= 0 ? 1 : -1;
    this.mainLight.position.copy(cam).addScaledVector(this.sunDirection, 100 * lightFrom);
    this.mainLight.target.position.copy(cam);
    this.mainLight.intensity = this.lightStrength * smooth(Math.abs(sunHeight) / 0.15);

    // Warm glow in the sky around the sun: strongest while it's low, and it
    // lingers a little after sunset.
    const dome = this.dome.material.uniforms;
    dome.sunDirection.value.copy(this.sunDirection);
    dome.sunGlow.value.copy(this.mainLight.color);
    dome.sunGlowStrength.value = smooth((sunHeight + 0.25) / 0.25) * (1 - 0.6 * smooth(sunHeight / 0.5));

    // The dome follows you; the stars turn slowly around the black hole.
    this.dome.position.copy(cam);
    dome.starTurn.value = (this.hour / 24) * Math.PI * 2 * STAR_TURN_SPEED;
  }

  // e.g. "14:30" or "14:30 (x20)"
  clockText() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return this.fast ? `${time} (x${FAST_SPEED})` : time;
  }
}

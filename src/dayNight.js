import * as THREE from 'three';
import { THEME, hexToRgb } from './theme.js';
import { makeRandom } from './random.js';

// Day/night cycle: a game clock, the sun and moon moving across the sky,
// stars at night, and the sky, fog and lights fading between the
// keyframes in theme.js. Press T to speed time up (and T again to go back).

// ---- Timing ----
const DAY_LENGTH_SECONDS = 360; // one full 24-hour day = 6 real minutes
const START_HOUR = 9;           // the game starts mid-morning
const FAST_SPEED = 20;          // speed when T is on (a whole day in ~18 seconds)
const SUNRISE_HOUR = 6;         // sun crosses the horizon going up
const SUNSET_HOUR = 20;         // sun crosses the horizon going down

// ---- Sky objects ----
const SUN_TILT = 0.35;      // tilts the sun's path a little toward the south, so walls get different shading
const SKY_DISTANCE = 200;   // how far away the sun and moon are drawn (always this far from you)
const SUN_SIZE = 40;
const MOON_SIZE = 30;
const STAR_COUNT = 400;
const STAR_DISTANCE = 250;
const STAR_SIZE = 2;        // in screen pixels

// Eases a 0..1 value so changes start and end gently instead of abruptly.
function smooth(t) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

export class DayNight {
  constructor(scene, camera, ambientLight, mainLight) {
    this.scene = scene;
    this.camera = camera;
    this.ambientLight = ambientLight; // soft light from sky + ground
    this.mainLight = mainLight;       // the sun by day, the moon by night
    this.hour = START_HOUR;
    this.fast = false;

    // Theme keyframes, with colours turned into Three.js colours once up front.
    this.keyframes = THEME.skyKeyframes
      .map((k) => ({
        ...k,
        sky: new THREE.Color(k.sky),
        light: new THREE.Color(k.light),
        ambientSky: new THREE.Color(k.ambientSky),
        ambientGround: new THREE.Color(k.ambientGround),
      }))
      .sort((a, b) => a.hour - b.hour);

    this.sunDirection = new THREE.Vector3();

    this.sun = makeSkySprite(drawSun, SUN_SIZE);
    this.moon = makeSkySprite(drawMoon, MOON_SIZE);
    this.stars = makeStars();
    scene.add(this.stars, this.sun, this.moon);

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyT' && !e.repeat) this.fast = !this.fast;
    });

    this.update(0); // set the starting colours straight away
  }

  // Call every frame. dt = seconds since the last frame.
  update(dt) {
    const speed = this.fast ? FAST_SPEED : 1;
    this.hour = (this.hour + (dt * speed * 24) / DAY_LENGTH_SECONDS) % 24;

    this.blendKeyframes();
    this.moveSunAndMoon();
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

    this.scene.background.lerpColors(a.sky, b.sky, t);
    this.scene.fog.color.copy(this.scene.background); // fog always matches the sky
    this.ambientLight.color.lerpColors(a.ambientSky, b.ambientSky, t);
    this.ambientLight.groundColor.lerpColors(a.ambientGround, b.ambientGround, t);
    this.ambientLight.intensity = a.ambientStrength + (b.ambientStrength - a.ambientStrength) * t;
    this.mainLight.color.lerpColors(a.light, b.light, t);
    this.lightStrength = a.lightStrength + (b.lightStrength - a.lightStrength) * t;
    this.stars.material.opacity = a.stars + (b.stars - a.stars) * t;
  }

  // ---- Sun and moon positions ----
  moveSunAndMoon() {
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
    const sun = this.sunDirection.set(Math.cos(angle), Math.sin(angle), SUN_TILT).normalize();
    const sunHeight = sun.y; // above 0 = sun is up, below 0 = moon is up

    // The main light shines from whichever of sun/moon is up. It fades to nothing
    // right at the horizon, so swapping from sun to moon is never visible.
    const cam = this.camera.position;
    const lightFrom = sunHeight >= 0 ? 1 : -1;
    this.mainLight.position.copy(cam).addScaledVector(sun, 100 * lightFrom);
    this.mainLight.target.position.copy(cam);
    this.mainLight.intensity = this.lightStrength * smooth(Math.abs(sunHeight) / 0.15);

    // The visible discs, always the same distance from you, fading out as they set.
    this.sun.position.copy(cam).addScaledVector(sun, SKY_DISTANCE);
    this.moon.position.copy(cam).addScaledVector(sun, -SKY_DISTANCE);
    this.sun.material.opacity = smooth((sunHeight + 0.05) / 0.1);
    this.moon.material.opacity = smooth((-sunHeight + 0.05) / 0.1);

    // Stars follow you and turn slowly with the sky.
    this.stars.position.copy(cam);
    this.stars.rotation.z = angle;
  }

  // e.g. "14:30" or "14:30 (x20)"
  clockText() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return this.fast ? `${time} (x${FAST_SPEED})` : time;
  }
}

// ---- Drawing the sun and moon (pixel art, in code) ----

// Paints a 32 x 32 pixel image using draw(x, y, distanceFromCentre) -> [r, g, b, alpha] or null.
function paintSkyTexture(draw) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixel = draw(x, y, Math.hypot(x - 15.5, y - 15.5));
      if (!pixel) continue;
      image.data.set(pixel, (y * size + x) * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter; // chunky pixels, like the blocks
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Soft halo in a few hard steps (keeps the pixel-art look).
function glow(color, distance, from, to, strength) {
  if (distance < from || distance > to) return null;
  const fade = 1 - (distance - from) / (to - from);
  const stepped = Math.ceil(fade * 4) / 4;
  return [...color, Math.round(255 * strength * stepped * stepped)];
}

function drawSun(x, y, d) {
  const { core, rim, glow: halo } = THEME.sun;
  if (d <= 6) return [...hexToRgb(core), 255];
  if (d <= 8) return [...hexToRgb(rim), 255];
  return glow(hexToRgb(halo), d, 8, 15.5, 0.6);
}

const CRATERS = [[13, 12], [14, 12], [18, 15], [12, 17], [13, 17], [17, 19]];
function drawMoon(x, y, d) {
  const { core, crater, glow: halo } = THEME.moon;
  if (d <= 6.5) {
    const isCrater = CRATERS.some(([cx, cy]) => cx === x && cy === y);
    return [...hexToRgb(isCrater ? crater : core), 255];
  }
  return glow(hexToRgb(halo), d, 6.5, 12, 0.35);
}

function makeSkySprite(draw, size) {
  const material = new THREE.SpriteMaterial({
    map: paintSkyTexture(draw),
    fog: false,        // fog would hide it: it's far away on purpose
    depthWrite: false, // never blocks anything behind it
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}

// ---- Stars ----
function makeStars() {
  const rand = makeRandom(4242); // same sky every time
  const positions = [];
  const colors = [];
  const base = new THREE.Color(THEME.stars);
  for (let i = 0; i < STAR_COUNT; i++) {
    // A random point on a big sphere around the player.
    const around = rand() * Math.PI * 2;
    const up = Math.asin(rand() * 2 - 1);
    positions.push(
      Math.cos(up) * Math.cos(around) * STAR_DISTANCE,
      Math.sin(up) * STAR_DISTANCE,
      Math.cos(up) * Math.sin(around) * STAR_DISTANCE,
    );
    const brightness = 0.4 + rand() * 0.6; // some stars dimmer than others
    colors.push(base.r * brightness, base.g * brightness, base.b * brightness);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: STAR_SIZE,
    sizeAttenuation: false, // same size no matter how far
    vertexColors: true,
    fog: false,
    transparent: true,
    depthWrite: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.renderOrder = -1; // behind the sun and moon
  return stars;
}

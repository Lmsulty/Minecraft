import * as THREE from 'three';
import { THEME, hexToRgb } from './theme.js';
import { makeRandom } from './random.js';

// Everything drawn in the sky, made in code: the sky dome (colour fading
// from the horizon to overhead), the two suns, the black hole and the stars.
// dayNight.js moves them and sets their colours through the day.

const STAR_COUNT = 400;
const STAR_SIZE = 2;        // in screen pixels
export const SKY_DOME_RADIUS = 400; // must stay inside the camera's view distance (500)

// ---- Sky dome ----
// A huge ball around the player, seen from inside. Its colour fades from
// the horizon colour (the same as the distance haze, so far land blends in)
// to the overhead colour, with a warm glow around the big sun.
export function makeSkyDome() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      horizon: { value: new THREE.Color() },
      top: { value: new THREE.Color() },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      sunGlow: { value: new THREE.Color() },
      sunGlowStrength: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position; // the ball is centred on the player, so this points out into the sky
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 horizon;
      uniform vec3 top;
      uniform vec3 sunDirection;
      uniform vec3 sunGlow;
      uniform float sunGlowStrength;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        // 0 at (and below) the horizon, 1 from about 37 degrees up.
        float up = clamp(direction.y / 0.6, 0.0, 1.0);
        // The power keeps the sky near the horizon close to the haze colour,
        // so hills in the distance never stand out against it.
        vec3 color = mix(horizon, top, pow(up, 1.5));
        // Warm glow around the sun, strongest low in the sky.
        float towardSun = pow(max(dot(direction, sunDirection), 0.0), 6.0);
        color = mix(color, sunGlow, towardSun * sunGlowStrength * (1.0 - up * 0.6));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide, // we're inside the ball
    depthWrite: false,    // never hides anything
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 16), material);
  dome.renderOrder = -2;      // drawn first, behind everything
  dome.frustumCulled = false; // always around you
  return dome;
}

// ---- Pixel-art sky pictures ----

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

// Blend two [r, g, b] colours: t = 0 gives a, t = 1 gives b.
function mixRgb(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

// A sun from THEME.suns: bright core, coloured rim, soft halo.
function sunPainter(sun) {
  const core = hexToRgb(sun.core);
  const rim = hexToRgb(sun.rim);
  const halo = hexToRgb(sun.glow);
  return (x, y, d) => {
    if (d <= 6) return [...core, 255];
    if (d <= 8) return [...rim, 255];
    return glow(halo, d, 8, 15.5, 0.6);
  };
}

// The black hole: a pure black middle, a thin blazing ring hugging it, and a
// flat glowing disc seen almost edge-on. The near half of the disc passes in
// front of the black middle; the far half is hidden behind it. One side of
// the disc is brighter than the other (it's spinning towards us there).
function drawBlackHole(x, y, d) {
  const B = THEME.blackHole;
  const inner = hexToRgb(B.ringInner);
  const outer = hexToRgb(B.ringOuter);
  const dx = x - 15.5;
  const dy = y - 15.5;

  const discDistance = Math.hypot(dx, dy * 3.2); // squashed: a flat disc tipped towards us
  const inDisc = discDistance >= 7 && discDistance <= 14.5;
  const inFront = dy > 0; // lower half of the picture = near side of the disc
  if (inDisc && (inFront || d > 5.5)) {
    const color = mixRgb(inner, outer, (discDistance - 7) / 7.5);
    const brightness = 0.7 + 0.3 * (-dx / 14.5); // brighter on the left
    return [...color.map((v) => Math.min(255, Math.round(v * brightness))), 255];
  }
  if (d <= 5) return [...hexToRgb(B.shadow), 255];
  if (d <= 6.3) return [...inner, 255];         // blazing ring right at the edge
  if (d <= 7.5) return [...outer, 170];
  return glow(hexToRgb(B.glow), d, 7.5, 15.5, 0.35);
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

export function makeSuns() {
  return THEME.suns.map((sun) => makeSkySprite(sunPainter(sun), sun.size));
}

export function makeBlackHole() {
  return makeSkySprite(drawBlackHole, THEME.blackHole.size);
}

// ---- Stars ----
export function makeStars(distance) {
  const rand = makeRandom(4242); // same sky every time
  const positions = [];
  const colors = [];
  const base = new THREE.Color(THEME.stars);
  for (let i = 0; i < STAR_COUNT; i++) {
    // A random point on a big sphere around the player.
    const around = rand() * Math.PI * 2;
    const up = Math.asin(rand() * 2 - 1);
    positions.push(
      Math.cos(up) * Math.cos(around) * distance,
      Math.sin(up) * distance,
      Math.cos(up) * Math.sin(around) * distance,
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
  stars.renderOrder = -1; // behind the suns and black hole
  return stars;
}

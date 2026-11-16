import * as THREE from 'three';
import { THEME, hexToRgb } from './theme.js';

// Everything drawn in the sky, made in code:
//  - the sky dome: colour fading from the horizon to overhead, a glow around
//    the big sun, the stars, and the black hole (with the stars and sky bent
//    around it)
//  - the two suns (small pixel-art pictures)
// dayNight.js moves things and sets their colours through the day.

export const SKY_DOME_RADIUS = 400; // must stay inside the camera's view distance (500)

// ---- Stars ----
// Stars are painted by the sky dome, not as separate dots, so they can be bent
// around the black hole. The sky is cut into a 3D grid of little boxes; a few
// boxes (chosen by a fixed random number) hold one star each.
const STAR_GRID = 60;        // more = smaller boxes = more stars
const STAR_CHANCE = 0.012;   // share of boxes with a star in them
const STAR_RADIUS = 0.0022;  // how big each star is (an angle; about 1-2 pixels)

// ---- Black hole shape (sizes are in "centre radii": 1 = edge of the black centre) ----
const LENS_STRENGTH = 3.0;   // how strongly light is bent around it (bigger = stronger warp)
const LENS_REACH = 14;       // the warp fades out by this distance
const DISC_INNER = 1.5;      // where the flat disc starts
const DISC_OUTER = 4.5;      // where it ends
const DISC_FLATNESS = 0.18;  // how edge-on we see the disc (smaller = flatter)

const holeView = THEME.blackHole.perPlanet[THEME.planet];
if (!holeView) throw new Error(`theme.js: no blackHole.perPlanet entry for planet "${THEME.planet}"`);

// ---- Sky dome ----
// A huge ball around the player, seen from inside.
export function makeSkyDome() {
  const B = THEME.blackHole;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      horizon: { value: new THREE.Color() },
      top: { value: new THREE.Color() },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      sunGlow: { value: new THREE.Color() },
      sunGlowStrength: { value: 0 },
      starColor: { value: new THREE.Color(THEME.stars) },
      starsVisible: { value: 0 },  // 0 by day, 1 at night
      starTurn: { value: 0 },      // how far the stars have turned around the black hole
      // The black hole: which way it is, plus "right" and "up" across it.
      holeDirection: { value: new THREE.Vector3(0, 1, 0) },
      holeRight: { value: new THREE.Vector3(1, 0, 0) },
      holeUp: { value: new THREE.Vector3(0, 0, -1) },
      holeSize: { value: THREE.MathUtils.degToRad(holeView.size) },
      holeBrightness: { value: holeView.brightness },
      holeShadow: { value: new THREE.Color(B.shadow) },
      ringInner: { value: new THREE.Color(B.ringInner) },
      ringOuter: { value: new THREE.Color(B.ringOuter) },
      holeGlow: { value: new THREE.Color(B.glow) },
      discTilt: { value: THREE.MathUtils.degToRad(B.discTilt) },
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
      uniform vec3 starColor;
      uniform float starsVisible;
      uniform float starTurn;
      uniform vec3 holeDirection;
      uniform vec3 holeRight;
      uniform vec3 holeUp;
      uniform float holeSize;
      uniform float holeBrightness;
      uniform vec3 holeShadow;
      uniform vec3 ringInner;
      uniform vec3 ringOuter;
      uniform vec3 holeGlow;
      uniform float discTilt;
      varying vec3 vDirection;

      // Three random numbers (0..1) from a position. Same input, same output.
      vec3 hash3(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.xxy + p.yxx) * p.zyx);
      }

      // Brightness of any star in this direction (0 = none).
      float stars(vec3 direction) {
        vec3 p = direction * ${STAR_GRID.toFixed(1)};
        vec3 box = floor(p);
        vec3 roll = hash3(box);
        if (roll.x > ${STAR_CHANCE}) return 0.0;
        // The star sits somewhere in the middle of its box.
        vec3 star = normalize(box + 0.25 + 0.5 * hash3(box + 17.0));
        float distance = length(direction - star);
        return (1.0 - smoothstep(0.0, ${STAR_RADIUS}, distance)) * (0.4 + 0.6 * roll.y);
      }

      // Turn vector v around axis by angle (keeps the axis itself still).
      vec3 turnAround(vec3 v, vec3 axis, float angle) {
        return v * cos(angle) + cross(axis, v) * sin(angle) + axis * dot(axis, v) * (1.0 - cos(angle));
      }

      void main() {
        vec3 direction = normalize(vDirection);

        // ---- Where we are relative to the black hole ----
        // q = position across the black hole, measured in black-centre radii.
        float facing = dot(direction, holeDirection);
        vec2 q = vec2(dot(direction, holeRight), dot(direction, holeUp)) / holeSize;
        float r = length(q);
        bool nearHole = facing > 0.0 && r < ${(LENS_REACH + 4).toFixed(1)};

        // ---- Bent light ----
        // Light passing close to the black hole is bent, so the sky we see
        // there really comes from further out: stars get pushed outwards and
        // stretched into arcs. The bend fades away with distance.
        vec3 skyDirection = direction;
        if (nearHole) {
          float fade = 1.0 - smoothstep(${(LENS_REACH * 0.5).toFixed(1)}, ${LENS_REACH.toFixed(1)}, r);
          vec2 source = q * (1.0 - ${LENS_STRENGTH.toFixed(2)} / max(r * r, 0.0001));
          source = mix(q, source, fade);
          skyDirection = normalize(holeDirection * facing + (holeRight * source.x + holeUp * source.y) * holeSize);
        }

        // ---- Sky colour ----
        // 0 at (and below) the horizon, 1 from about 37 degrees up. The power keeps
        // the sky near the horizon close to the haze colour, so far hills blend in.
        float up = clamp(skyDirection.y / 0.6, 0.0, 1.0);
        vec3 color = mix(horizon, top, pow(up, 1.5));
        // Warm glow around the sun, strongest low in the sky.
        float towardSun = pow(max(dot(direction, sunDirection), 0.0), 6.0);
        color = mix(color, sunGlow, towardSun * sunGlowStrength * (1.0 - up * 0.6));

        // ---- Stars (turning slowly around the black hole) ----
        if (starsVisible > 0.0) {
          vec3 starDirection = turnAround(skyDirection, holeDirection, starTurn);
          color += starColor * stars(starDirection) * starsVisible;
        }

        // ---- The black hole ----
        if (nearHole) {
          // Brighter at night.
          float power = holeBrightness * (1.0 + ${THEME.blackHole.nightBoost.toFixed(2)} * starsVisible);

          // Soft glow spreading into the sky.
          // It fades to nothing well before the edge of the area we draw in.
          float glow = (0.45 * exp(-(r - 1.0) / 1.8) + 0.12 * exp(-r / 4.0))
                     * (1.0 - smoothstep(${(LENS_REACH * 0.6).toFixed(1)}, ${(LENS_REACH + 3).toFixed(1)}, r));
          color += holeGlow * glow * power * mix(0.6, 1.0, starsVisible);

          // The flat disc, tipped a little, seen nearly edge-on.
          vec2 d = vec2(q.x * cos(discTilt) + q.y * sin(discTilt), -q.x * sin(discTilt) + q.y * cos(discTilt));
          float discDistance = length(vec2(d.x, d.y / ${DISC_FLATNESS}));
          float disc = smoothstep(${DISC_INNER.toFixed(1)}, ${(DISC_INNER + 0.3).toFixed(1)}, discDistance)
                     * (1.0 - smoothstep(${(DISC_OUTER - 1.5).toFixed(1)}, ${DISC_OUTER.toFixed(1)}, discDistance));
          // Hotter and brighter towards the middle; one side brighter as it
          // spins towards us.
          vec3 discColor = mix(ringInner, ringOuter, smoothstep(${DISC_INNER.toFixed(1)}, ${DISC_OUTER.toFixed(1)}, discDistance));
          float discLight = pow(${DISC_INNER.toFixed(1)} / discDistance, 0.8) * (1.0 - 0.45 * d.x / max(discDistance, 0.001));
          discColor *= discLight * power;

          // The far side of the disc, bent up over the top of the black
          // centre and down under it, as arcs hugging it.
          float arc = smoothstep(1.08, 1.2, r) * (1.0 - smoothstep(1.5, 1.95, r));
          float overOrUnder = smoothstep(0.25, 0.85, abs(d.y) / max(r, 0.001));
          arc *= overOrUnder * (d.y > 0.0 ? 1.0 : 0.6);
          color = mix(color, mix(ringInner, ringOuter, 0.35) * power, clamp(arc, 0.0, 1.0));

          // Back half of the disc (above the middle line) goes behind the centre...
          if (d.y > 0.0) color = mix(color, discColor, disc);

          // ...the black centre...
          float shadow = 1.0 - smoothstep(0.96, 1.0, r);
          color = mix(color, holeShadow, shadow);

          // ...a thin ring of light hugging it...
          float ring = exp(-pow((r - 1.04) / 0.045, 2.0));
          color += ringInner * ring * 1.4 * power;

          // ...and the front half of the disc crosses in front of it.
          if (d.y <= 0.0) color = mix(color, discColor, disc);
        }

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide, // we're inside the ball
    depthWrite: false,    // never hides anything
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 16), material);
  // Drawn AFTER the land (but before see-through things like the suns): any
  // pixel already covered by land is skipped, so the sky's maths only runs
  // where you can actually see sky.
  dome.renderOrder = 1;
  dome.frustumCulled = false; // always around you
  return dome;
}

// ---- The suns (pixel art) ----

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

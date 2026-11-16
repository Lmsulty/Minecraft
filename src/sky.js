import * as THREE from 'three';
import { THEME, hexToRgb } from './theme.js';

// Everything drawn in the sky, made in code:
//  - the sky dome: colour fading from the horizon to overhead, a glow around
//    the big sun, the stars and galaxy band, and the black hole (a fiery
//    whirlpool being sucked into a hole, with the stars bent around it)
//  - the two suns (small pixel-art pictures)
// dayNight.js moves things and sets their colours through the day.

export const SKY_DOME_RADIUS = 400; // must stay inside the camera's view distance (500)

// ---- Stars ----
// Stars are painted by the sky dome, not as separate dots, so they can be bent
// around the black hole. The sky is cut into a 3D grid of little boxes; a few
// boxes (chosen by a fixed random number) hold one star each. Two grids: lots
// of faint small stars, and fewer bright ones.
const SF = THEME.starfield;
const FAINT_GRID = 120;      // more = smaller boxes = more stars
const FAINT_CHANCE = 0.022 * SF.density;
const BRIGHT_GRID = 55;
const BRIGHT_CHANCE = 0.02 * SF.density;
const STAR_RADIUS = 0.0019;  // how big a faint star is (an angle; about 1-2 pixels)

// ---- Black hole shape (sizes are in "centre radii": 1 = edge of the black centre) ----
const BH = THEME.blackHole;
const LENS_REACH = 16;       // the bending of light fades out by this distance
const SWIRL = BH.swirlSize;  // outer edge of the whirlpool
// Seen from above at an angle, the round whirlpool looks squashed top to bottom.
const SQUASH = Math.sin(THREE.MathUtils.degToRad(BH.viewAngle));

const holeView = BH.perPlanet[THEME.planet];
if (!holeView) throw new Error(`theme.js: no blackHole.perPlanet entry for planet "${THEME.planet}"`);

// Write a JS number into shader code (shaders need a decimal point).
const f = (n) => n.toFixed(4);

// ---- Sky dome ----
// A huge ball around the player, seen from inside.
export function makeSkyDome() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },          // seconds, for the swirling gas
      horizon: { value: new THREE.Color() },
      top: { value: new THREE.Color() },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      sunGlow: { value: new THREE.Color() },
      sunGlowStrength: { value: 0 },
      starColor: { value: new THREE.Color(SF.color) },
      galaxyColor: { value: new THREE.Color(SF.galaxyColor) },
      galaxyNormal: { value: new THREE.Vector3(0, 0, 1) }, // the band is the great circle facing away from this
      starsVisible: { value: 0 },  // 0 by day, 1 at night
      starTurn: { value: 0 },      // how far the stars have turned around the black hole
      // The black hole: which way it is, plus "right" and "up" across it.
      holeDirection: { value: new THREE.Vector3(0, 1, 0) },
      holeRight: { value: new THREE.Vector3(1, 0, 0) },
      holeUp: { value: new THREE.Vector3(0, 0, -1) },
      holeSize: { value: THREE.MathUtils.degToRad(holeView.size) },
      holeBrightness: { value: holeView.brightness },
      holeShadow: { value: new THREE.Color(BH.shadow) },
      gasOuter: { value: new THREE.Color(BH.gasOuter) },
      gasMiddle: { value: new THREE.Color(BH.gasMiddle) },
      gasInner: { value: new THREE.Color(BH.gasInner) },
      holeGlow: { value: new THREE.Color(BH.glow) },
      dayDarkColor: { value: new THREE.Color(BH.dayDarkColor) },
      swirlTilt: { value: THREE.MathUtils.degToRad(BH.tilt) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position; // the ball is centred on the player, so this points out into the sky
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 horizon;
      uniform vec3 top;
      uniform vec3 sunDirection;
      uniform vec3 sunGlow;
      uniform float sunGlowStrength;
      uniform vec3 starColor;
      uniform vec3 galaxyColor;
      uniform vec3 galaxyNormal;
      uniform float starsVisible;
      uniform float starTurn;
      uniform vec3 holeDirection;
      uniform vec3 holeRight;
      uniform vec3 holeUp;
      uniform float holeSize;
      uniform float holeBrightness;
      uniform vec3 holeShadow;
      uniform vec3 gasOuter;
      uniform vec3 gasMiddle;
      uniform vec3 gasInner;
      uniform vec3 holeGlow;
      uniform vec3 dayDarkColor;
      uniform float swirlTilt;
      varying vec3 vDirection;

      // ---- Random numbers and smooth noise (same input, same output) ----
      vec3 hash3(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.xxy + p.yxx) * p.zyx);
      }
      float hash1(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      // Smooth random hills and valleys between 0 and 1 (for gas and the galaxy band).
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 t = fract(x);
        t = t * t * (3.0 - 2.0 * t);
        return mix(mix(mix(hash1(i), hash1(i + vec3(1, 0, 0)), t.x),
                       mix(hash1(i + vec3(0, 1, 0)), hash1(i + vec3(1, 1, 0)), t.x), t.y),
                   mix(mix(hash1(i + vec3(0, 0, 1)), hash1(i + vec3(1, 0, 1)), t.x),
                       mix(hash1(i + vec3(0, 1, 1)), hash1(i + vec3(1, 1, 1)), t.x), t.y), t.z);
      }

      // ---- Stars ----
      // Brightness of the star (if any) in this direction, on one grid.
      float starGrid(vec3 direction, float grid, float chance, float radius) {
        vec3 p = direction * grid;
        vec3 box = floor(p);
        vec3 roll = hash3(box);
        if (roll.x > chance) return 0.0;
        // The star sits somewhere in the middle of its box.
        vec3 star = normalize(box + 0.25 + 0.5 * hash3(box + 17.0));
        float distance = length(direction - star);
        return (1.0 - smoothstep(0.0, radius, distance)) * (0.3 + 0.7 * roll.y);
      }

      // Turn vector v around axis by angle (keeps the axis itself still).
      vec3 turnAround(vec3 v, vec3 axis, float angle) {
        return v * cos(angle) + cross(axis, v) * sin(angle) + axis * dot(axis, v) * (1.0 - cos(angle));
      }

      // ---- The whirlpool of gas ----
      // How much gas there is at distance rho from the centre (in hole radii,
      // measured flat across the whirlpool) and angle phi around it.
      // Thick spiral arms, roughed up by churning noise. The whole pattern
      // turns; because the arms are wound this way round, turning makes them
      // look like they're pouring inwards. The churning also slides inwards.
      float whirlpool(float rho, float phi) {
        float logR = log(rho);
        float spin = phi - ${f(BH.armTwist)} * 2.0 * logR - time * ${f(BH.swirlSpeed)};
        vec3 p = vec3(cos(spin) * 2.0, sin(spin) * 2.0, logR * 3.0 + time * ${f(BH.inflowSpeed)} * 3.0);
        float churn = noise(p) * 0.6 + noise(p * 2.7 + 7.0) * 0.4;
        float arms = 0.5 + 0.5 * cos(${f(BH.armCount)} * spin + (churn - 0.5) * 7.0 * ${f(BH.turbulence)});
        arms = pow(arms, 1.5);
        float gas = (0.3 + 0.7 * arms) * mix(1.0, 0.4 + 1.2 * churn, ${f(BH.turbulence)});
        // Denser and brighter towards the middle; it pours over the edge of
        // the hole and vanishes, and thins out at the outside.
        float profile = pow(1.3 / rho, 0.9)
                      * smoothstep(0.82, 1.15, rho)
                      * (1.0 - smoothstep(${f(SWIRL * 0.6)}, ${f(SWIRL)}, rho));
        return gas * profile;
      }

      // Colour of the gas at distance rho: white-hot where it falls in,
      // orange in the middle, dark red at the outside.
      vec3 gasColor(float rho) {
        float outward = clamp((rho - 1.0) / ${f(SWIRL - 1)}, 0.0, 1.0);
        vec3 color = mix(gasInner, gasMiddle, smoothstep(0.0, 0.3, outward));
        return mix(color, gasOuter, smoothstep(0.3, 0.85, outward));
      }

      // Lay glowing gas over the colour behind it.
      vec3 addGas(vec3 behind, float rho, float amount, float power) {
        float cover = clamp(amount * 1.6, 0.0, 0.97);
        return behind * (1.0 - cover) + gasColor(rho) * amount * power * 1.3;
      }

      void main() {
        vec3 direction = normalize(vDirection);

        // ---- Where we are relative to the black hole ----
        // q = position across the black hole, measured in black-centre radii.
        float facing = dot(direction, holeDirection);
        vec2 q = vec2(dot(direction, holeRight), dot(direction, holeUp)) / holeSize;
        float r = length(q);
        bool nearHole = facing > 0.0 && r < ${f(LENS_REACH + 4.0)};

        // ---- Bent light ----
        // Light passing close to the black hole is bent, so the sky we see
        // there really comes from further out: stars get pushed outwards and
        // smeared into arcs around it. The bend fades away with distance.
        vec3 skyDirection = direction;
        if (nearHole) {
          float fade = 1.0 - smoothstep(${f(LENS_REACH * 0.5)}, ${f(LENS_REACH)}, r);
          vec2 source = q * (1.0 - ${f(BH.bendStrength)} / max(r * r, 0.0001));
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

        // ---- Night sky: galaxy band and stars, turning slowly around the black hole ----
        if (starsVisible > 0.0) {
          vec3 starDirection = turnAround(skyDirection, holeDirection, starTurn);
          float fromBand = dot(starDirection, galaxyNormal) / ${f(SF.galaxyWidth)};
          float band = 0.0;
          if (abs(fromBand) < 3.0) {
            band = exp(-fromBand * fromBand);
            // Cloudy, with a darker dust lane running down the middle.
            float clouds = noise(starDirection * 9.0) * 0.6 + noise(starDirection * 23.0) * 0.4;
            float dust = 1.0 - 0.6 * exp(-fromBand * fromBand * 9.0) * smoothstep(0.35, 0.7, noise(starDirection * 14.0 + 3.0));
            color += galaxyColor * ${f(SF.galaxyBand)} * band * (0.3 + 0.9 * clouds) * dust * starsVisible;
          }
          // More stars inside the galaxy band.
          float stars = starGrid(starDirection, ${f(FAINT_GRID)}, ${f(FAINT_CHANCE)} * (1.0 + 3.0 * band), ${f(STAR_RADIUS)}) * 0.7
                      + starGrid(starDirection, ${f(BRIGHT_GRID)}, ${f(BRIGHT_CHANCE)}, ${f(STAR_RADIUS * 1.6)});
          color += starColor * stars * starsVisible;
        }

        // ---- The black hole ----
        if (nearHole) {
          // Brighter at night.
          float power = holeBrightness * (1.0 + ${f(BH.nightBoost)} * starsVisible);

          // By day, the sky around it darkens, as if it's swallowing the daylight.
          float dusk = exp(-pow(r / ${f(SWIRL * 1.25)}, 2.0)) * ${f(BH.dayDarkening)} * (1.0 - starsVisible);
          color = mix(color, dayDarkColor, dusk);

          // Soft glow spreading into the sky (fades to nothing before the edge of this area).
          float glow = (0.40 * exp(-(r - 1.0) / 1.8) + 0.10 * exp(-r / 4.0))
                     * (1.0 - smoothstep(${f(LENS_REACH * 0.6)}, ${f(LENS_REACH + 3.0)}, r));
          color += holeGlow * glow * power * mix(0.6, 1.0, starsVisible);

          // ---- The whirlpool, seen from above at an angle ----
          // Turn to the whirlpool's own tilt, then un-squash to measure
          // distances flat across it.
          vec2 d = vec2(q.x * cos(swirlTilt) + q.y * sin(swirlTilt), -q.x * sin(swirlTilt) + q.y * cos(swirlTilt));
          float depth = d.y / ${f(SQUASH)};     // > 0 = far side (behind the hole), < 0 = near side
          float rho = max(length(vec2(d.x, depth)), 0.001);
          float gas = 0.0;
          if (rho < ${f(SWIRL)}) {
            gas = whirlpool(rho, atan(depth, d.x));
            gas *= 1.0 - 0.25 * d.x / rho; // the side swirling towards us is a little brighter
          }

          // Far half of the whirlpool goes behind the hole...
          if (depth > 0.0) color = addGas(color, rho, gas, power);

          // ...then the hole itself, with a soft edge...
          float hole = 1.0 - smoothstep(0.7, 1.05, r);
          color = mix(color, holeShadow, hole);

          // ...and the near half pours over its edge, eating into the
          // bottom of the hole.
          if (depth <= 0.0) color = addGas(color, rho, gas, power);

          // Faint, sparkly ring of bent starlight, where light from stars
          // right behind it ends up. Hidden wherever the gas is thick.
          float einstein = sqrt(${f(BH.bendStrength)});
          float around = atan(q.y, q.x);
          float beads = smoothstep(0.55, 0.85, noise(vec3(cos(around) * 9.0, sin(around) * 9.0, 0.0)));
          color += starColor * (0.05 + 0.45 * beads) * exp(-pow((r - einstein) / 0.06, 2.0))
                 * starsVisible * (1.0 - clamp(gas * 1.6, 0.0, 1.0));
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

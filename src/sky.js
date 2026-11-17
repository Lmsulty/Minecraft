import * as THREE from 'three';
import { THEME, hexToRgb } from './theme.js';
import { makeRandom } from './random.js';

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

// ---- Clouds ----
const CL = THEME.clouds;
const driftAngle = THREE.MathUtils.degToRad(CL.driftDirection);
// Compass degrees -> a direction across the sky (0 = north = -z, 90 = east = +x).
const DRIFT = [Math.sin(driftAngle) * CL.driftSpeed, -Math.cos(driftAngle) * CL.driftSpeed];

// The cloud pattern is worked out once at startup into a small image that
// repeats seamlessly, so the sky only has to look it up (much faster than
// working out noise for every pixel, every frame).
const CLOUD_MAP_SIZE = 128;
const CLOUD_MAP_CELLS = 4; // big puffs across one copy of the image
function makeCloudMap() {
  const rand = makeRandom(777);
  const size = CLOUD_MAP_SIZE;
  const values = new Float32Array(size * size);
  // Layers of smooth noise, big to small, each one wrapping around the edges.
  let amount = 0.5;
  for (let cells = CLOUD_MAP_CELLS; cells <= CLOUD_MAP_CELLS * 8; cells *= 2) {
    const grid = Array.from({ length: cells * cells }, () => rand());
    const at = (x, y) => grid[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)];
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const gx = (px / size) * cells;
        const gy = (py / size) * cells;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        let tx = gx - x0;
        let ty = gy - y0;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        values[py * size + px] += amount * (top + (bottom - top) * ty);
      }
    }
    amount *= 0.5;
  }
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) pixels[i * 4] = Math.round((values[i] / 0.9375) * 255);
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter; // smooth in the distance (no shimmering)
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const holeView = BH.perPlanet[THEME.planet];
if (!holeView) throw new Error(`theme.js: no blackHole.perPlanet entry for planet "${THEME.planet}"`);

// Write a JS number into shader code (shaders need a decimal point).
const f = (n) => n.toFixed(4);

// ---- Sky dome ----
// A huge ball around the player, seen from inside.
// `detail` is a graphics level from THEME.graphics.levels (starLayers,
// galaxy, clouds, blackHole): lower levels leave out some of the maths.
export function makeSkyDome(detail) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },          // seconds, for the swirling gas
      horizon: { value: new THREE.Color() },
      top: { value: new THREE.Color() },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      sunGlow: { value: new THREE.Color() },
      sunGlowStrength: { value: 0 },
      cloudMap: { value: makeCloudMap() },
      cloudLit: { value: new THREE.Color() },   // set through the day by dayNight.js
      cloudShade: { value: new THREE.Color() },
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
    fragmentShader: skyFragmentShader(detail),
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

// Switch the sky to another graphics level's detail. The graphics card
// rebuilds the sky's program, which causes one short hitch.
export function setSkyDetail(dome, detail) {
  dome.material.fragmentShader = skyFragmentShader(detail);
  dome.material.needsUpdate = true;
}

// The sky's pixel program, with only the parts this level of detail uses.
function skyFragmentShader(detail) {
  const fullStars = detail.starLayers >= 2;
  const fullGalaxy = detail.galaxy === 'full';
  const fullClouds = detail.clouds === 'full';
  const fullHole = detail.blackHole === 'full';
  return /* glsl */ `
      uniform float time;
      uniform vec3 horizon;
      uniform vec3 top;
      uniform vec3 sunDirection;
      uniform vec3 sunGlow;
      uniform float sunGlowStrength;
      uniform sampler2D cloudMap;
      uniform vec3 cloudLit;
      uniform vec3 cloudShade;
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

      // Cloud pattern (0..1) at a spot on the cloud layer: the big puffy
      // shapes, plus a second, smaller copy for extra detail (which also
      // hides the fact that the pattern repeats).
      float cloudNoise(vec2 p) {
        float big = texture2D(cloudMap, p * ${f(1 / CLOUD_MAP_CELLS)}).r;
        float detail = texture2D(cloudMap, p * ${f(2.7 / CLOUD_MAP_CELLS)} + vec2(0.37, 0.61)).r;
        return big * 0.75 + detail * 0.25;
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
        ${fullHole
          ? 'float churn = noise(p) * 0.6 + noise(p * 2.7 + 7.0) * 0.4;'
          : 'float churn = noise(p); // simple: one layer of churning instead of two'}
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
            ${fullGalaxy ? `
            float clouds = noise(starDirection * 9.0) * 0.6 + noise(starDirection * 23.0) * 0.4;
            float dust = 1.0 - 0.6 * exp(-fromBand * fromBand * 9.0) * smoothstep(0.35, 0.7, noise(starDirection * 14.0 + 3.0));` : `
            float clouds = noise(starDirection * 9.0) * 0.8 + 0.1; // simple: one layer of cloudiness
            float dust = 1.0 - 0.35 * exp(-fromBand * fromBand * 9.0); // and a smooth dust lane`}
            color += galaxyColor * ${f(SF.galaxyBand)} * band * (0.3 + 0.9 * clouds) * dust * starsVisible;
          }
          // More stars inside the galaxy band.
          ${fullStars ? `
          float stars = starGrid(starDirection, ${f(FAINT_GRID)}, ${f(FAINT_CHANCE)} * (1.0 + 3.0 * band), ${f(STAR_RADIUS)}) * 0.7
                      + starGrid(starDirection, ${f(BRIGHT_GRID)}, ${f(BRIGHT_CHANCE)}, ${f(STAR_RADIUS * 1.6)});` : `
          // One layer only (half the work): the bright stars, a few more of
          // them than usual, so the sky doesn't look empty.
          float stars = starGrid(starDirection, ${f(BRIGHT_GRID)}, ${f(BRIGHT_CHANCE * 1.8)} * (1.0 + 1.5 * band), ${f(STAR_RADIUS * 1.6)});`}
          color += starColor * stars * starsVisible;
        }

        // ---- Clouds ----
        // Painted onto an imaginary flat layer high above you, so they bunch
        // up towards the horizon and look bigger overhead. Near the black hole
        // they're bent like the stars, and twisted into streaks curving in.
        float cloudAmount = ${f(CL.coverage)} * mix(1.0, ${f(CL.atNight)}, starsVisible);
        if (cloudAmount > 0.0 && skyDirection.y > 0.0) {
          vec3 cloudDirection = skyDirection;
          float pulled = 0.0;
          if (nearHole) {
            pulled = exp(-r / ${f(SWIRL * 0.8)}) * ${f(CL.blackHolePull)};
            cloudDirection = turnAround(cloudDirection, holeDirection, pulled * 2.5);
          }
          vec2 layer = cloudDirection.xz / (cloudDirection.y + 0.12);
          vec2 uv = layer * ${f(0.9 / CL.size)} + vec2(${f(DRIFT[0])}, ${f(DRIFT[1])}) * time;
          float lumps = cloudNoise(uv);
          // Higher threshold overhead = thinner clouds there.
          float threshold = 1.0 - cloudAmount + smoothstep(0.15, 0.9, cloudDirection.y) * ${f(CL.thinOverhead * 0.4)};
          float cloud = smoothstep(threshold, threshold + ${f(CL.softness)}, lumps);
          if (cloud > 0.0) {
            ${fullClouds ? `
            // Light: compare with a spot a little towards the sun. If it's
            // thinner there, this side faces the sun and is lit.
            vec2 toSun = normalize(sunDirection.xz + vec2(0.0001)) * 0.12;
            float towardsSunLumps = texture2D(cloudMap, (uv + toSun) * ${f(1 / CLOUD_MAP_CELLS)}).r * 0.75 + lumps * 0.25;
            float lit = clamp((lumps - towardsSunLumps) * 6.0 + 0.5, 0.0, 1.0);` : `
            // Simple light: thin edges are bright, thick middles are shaded.
            float lit = 1.0 - 0.7 * smoothstep(threshold, threshold + 0.35, lumps);`}
            vec3 cloudColor = mix(cloudShade, cloudLit, lit);
            cloudColor = mix(cloudColor, sunGlow, towardSun * sunGlowStrength * 0.6); // glowing near a low sun
            // Fade into the haze at the horizon, and get swallowed near the black hole.
            cloud *= smoothstep(0.0, 0.1, cloudDirection.y);
            if (nearHole) cloud *= smoothstep(1.2, ${f(SWIRL * 1.1)}, r);
            cloud *= mix(1.0, 0.6, starsVisible); // see-through at night
            color = mix(color, cloudColor, cloud);
          }
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
          // The ring is very thin, so only work it out right next to it (and
          // only when the stars are out): further away it adds nothing.
          float einstein = sqrt(${f(BH.bendStrength)});
          if (starsVisible > 0.0 && abs(r - einstein) < 0.3) {
            float around = atan(q.y, q.x);
            float beads = smoothstep(0.55, 0.85, noise(vec3(cos(around) * 9.0, sin(around) * 9.0, 0.0)));
            color += starColor * (0.05 + 0.45 * beads) * exp(-pow((r - einstein) / 0.06, 2.0))
                   * starsVisible * (1.0 - clamp(gas * 1.6, 0.0, 1.0));
          }
        }

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `;
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

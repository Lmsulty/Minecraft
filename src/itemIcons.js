import { makeRandom } from './random.js';
import { THEME, hexToRgb } from './theme.js';

// Pixel-art pictures for items (items.js), drawn in code, 16 x 16 pixels.
// Unlike block tiles, these have a see-through background and a dark
// outline, so they read clearly as small objects in a slot.
// Colours come from theme.js (THEME.items).

const SIZE = 16;

// '#rrggbb' -> [r, g, b], keeping the shape of THEME.items.
function toRgb(value) {
  if (typeof value === 'string') return hexToRgb(value);
  if (Array.isArray(value)) return value.map(toRgb);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toRgb(v)]));
}
const C = toRgb(THEME.items);

function pick(rand, colors) {
  return colors[Math.floor(rand() * colors.length)];
}

// A 16 x 16 picture. Pixels never set stay fully see-through.
class Sprite {
  constructor() {
    this.pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  }

  set(x, y, [r, g, b]) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    this.pixels.set([r, g, b, 255], (y * SIZE + x) * 4);
  }

  isFilled(x, y) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
    return this.pixels[(y * SIZE + x) * 4 + 3] > 0;
  }

  // Draw a 1-pixel dark line round everything drawn so far.
  outline(color) {
    const edge = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (this.isFilled(x, y)) continue;
        if (this.isFilled(x - 1, y) || this.isFilled(x + 1, y) ||
            this.isFilled(x, y - 1) || this.isFilled(x, y + 1)) edge.push([x, y]);
      }
    }
    for (const [x, y] of edge) this.set(x, y, color);
  }
}

// ---- The painters: one per item ----

function paintGrazerFleece(s, rand) {
  // A fluffy tuft of rusty-orange fleece: round puffs squashed together.
  // Each puff is lit from the top-left, with a shadowy crease where it meets
  // the next, so it looks lumpy and soft.
  // Small puffs round the edge give it a bumpy, cloud-like outline.
  const puffs = [
    [8, 9.5, 3.6],   // centre x, centre y, radius
    [3.8, 10.2, 2.3],
    [5.6, 6.6, 2.3],
    [9, 4.6, 2.3],
    [12.2, 7.2, 2.3],
    [12.3, 11, 2.2],
    [9.2, 12.8, 2.2],
    [5.6, 12.8, 2.1],
  ];
  const c = C.grazerFleece;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Which puff is this pixel deepest inside (and how deep in the next one)?
      let best = null;
      let depth = 0;
      let nextDepth = 0;
      for (const [px, py, r] of puffs) {
        const d = r - Math.hypot(x + 0.5 - px, y + 0.5 - py);
        if (d > depth) { nextDepth = depth; depth = d; best = [px, py, r]; }
        else if (d > nextDepth) nextDepth = d;
      }
      if (!best) continue;
      const [px, py, r] = best;
      // Where on that puff: negative = top-left (lit), positive = bottom-right (shadow).
      const side = ((x + 0.5 - px) + (y + 0.5 - py)) / r;
      let color = pick(rand, c.base);
      if (side < -0.6) color = c.light;
      else if (side > 0.7) color = c.dark;
      // Where two puffs meet (about equally deep in both): a shadowy crease.
      if (nextDepth > 0 && depth - nextDepth < 0.7 && side > -0.6) color = c.dark;
      s.set(x, y, color);
    }
  }
  s.outline(c.outline);
}

function paintGlowDust(s, rand) {
  // A small heap of glittering teal dust, with a few sparks floating above.
  const c = C.glowDust;
  for (let x = 2; x <= 13; x++) {
    const across = (x + 0.5 - 8) / 6.2; // -1 at the left edge, 1 at the right
    const height = Math.round(5.5 * Math.sqrt(Math.max(0, 1 - across * across)));
    const top = 14 - height;
    for (let y = top; y <= 13; y++) {
      let color = pick(rand, c.base);
      if (y === top) color = c.light;              // lit top of the heap
      else if (y === 13 || across > 0.6) color = c.dark; // shadowed bottom and right side
      s.set(x, y, color);
    }
  }
  // Glitter in the heap.
  for (let i = 0; i < 7; i++) {
    const x = 3 + Math.floor(rand() * 10);
    const y = 9 + Math.floor(rand() * 4);
    if (s.isFilled(x, y)) s.set(x, y, c.sparkle);
  }
  s.outline(c.outline);
  // Floating sparks (drawn after the outline, so they have none): little plus shapes and a dot.
  for (const [x, y] of [[4, 3], [11, 2]]) {
    s.set(x, y, c.sparkle);
    s.set(x - 1, y, c.light);
    s.set(x + 1, y, c.light);
    s.set(x, y - 1, c.light);
    s.set(x, y + 1, c.light);
  }
  s.set(8, 5, c.sparkle);
}

const PAINTERS = {
  grazer_fleece: paintGrazerFleece,
  glow_dust: paintGlowDust,
};

// Draw one item picture and return its raw pixels (RGBA, 16 x 16).
// Each has its own fixed seed, so it looks the same every time.
export function paintItem(name) {
  const painter = PAINTERS[name];
  if (!painter) throw new Error(`itemIcons.js: no picture called "${name}"`);
  const sprite = new Sprite();
  painter(sprite, makeRandom(5000 + Object.keys(PAINTERS).indexOf(name) * 7919));
  return sprite.pixels;
}

export const ITEM_ICON_SIZE = SIZE;

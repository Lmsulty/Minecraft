import { BLOCK_TYPES } from './blocks.js';
import { paintTile } from './textures.js';

// Draws a small 3D-looking cube icon for a block, using the same pixel-art
// tiles as the world. The cube is seen from slightly above: its top face plus
// two side faces, each drawn as a slanted (skewed) copy of the 16 x 16 tile.
//
//          /\          <- top face (diamond)
//         /  \
//        |\  /|
//        | \/ |        <- left side (lighter) and right side (darker)
//         \ | /
//          \|/

const ICON_SIZE = 64;   // pixels inside the icon canvas (CSS decides how big it looks)
const HALF_WIDTH = 28;  // half the cube's width in the icon
const SLOPE = 14;       // how much the top edges tilt (half of HALF_WIDTH = classic 2:1 look)
const SIDE_HEIGHT = 30; // height of the side faces
const TOP_Y = (ICON_SIZE - (SLOPE * 2 + SIDE_HEIGHT)) / 2; // centres the cube vertically
const CENTER_X = ICON_SIZE / 2;
const OVERLAP = 0.3;    // faces overlap a hair so no background peeks through the seams

// Darkening per face, like the sun shading in the 3D world.
const LEFT_SHADE = 0.18;
const RIGHT_SHADE = 0.38;

// Each tile as a tiny 16 x 16 canvas, made once and reused.
const tileCanvases = new Map();
function getTileCanvas(name) {
  if (!tileCanvases.has(name)) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    canvas.getContext('2d').putImageData(new ImageData(paintTile(name), 16, 16), 0, 0);
    tileCanvases.set(name, canvas);
  }
  return tileCanvases.get(name);
}

// Draw one tile, bent into a face shape by `transform`, then darken it.
// transform = [a, b, c, d, e, f]: where the tile's x axis, y axis and corner end up.
function drawFace(ctx, tileName, transform, darkness) {
  const unit = 1 / 16; // the transforms below are "per whole tile"; the tile is 16 px
  const [a, b, c, d, e, f] = transform;
  ctx.setTransform(a * unit, b * unit, c * unit, d * unit, e, f);
  const tile = getTileCanvas(tileName);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(tile, -OVERLAP, -OVERLAP, 16 + OVERLAP * 2, 16 + OVERLAP * 2);
  if (darkness > 0) {
    // 'source-atop' only darkens pixels that were just drawn, so see-through
    // pixels (e.g. future leaves) stay see-through.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0, 0, 0, ${darkness})`;
    ctx.fillRect(-OVERLAP, -OVERLAP, 16 + OVERLAP * 2, 16 + OVERLAP * 2);
  }
}

// Returns a <canvas> with the block's icon on it.
export function makeBlockIcon(blockId) {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; // keep the pixel art crisp

  const textures = BLOCK_TYPES[blockId]?.textures;
  if (!textures) return canvas; // nothing to draw (e.g. air)

  const w = HALF_WIDTH;
  const s = SLOPE;
  const h = SIDE_HEIGHT;

  // Left side: from the diamond's left corner down to the front corner.
  drawFace(ctx, textures.side, [w, s, 0, h, CENTER_X - w, TOP_Y + s], LEFT_SHADE);
  // Right side: from the front corner up to the diamond's right corner.
  drawFace(ctx, textures.side, [w, -s, 0, h, CENTER_X, TOP_Y + s * 2], RIGHT_SHADE);
  // Top: a diamond starting at the back corner. Drawn last so it sits on top.
  drawFace(ctx, textures.top, [w, s, -w, s, CENTER_X, TOP_Y], 0);

  return canvas;
}

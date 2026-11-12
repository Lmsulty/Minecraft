// Every block type in the game lives here.
// The world stores only the number (id) of each block; this file says what each number means.

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAVES: 5,
  SAND: 6,
  PLANKS: 7,
};

// Indexed by block id.
// - solid:      do you bump into it? (collision, and what the crosshair can target)
// - opaque:     does it completely hide the faces of blocks behind it?
//               Something like see-through leaves would be solid but NOT opaque.
// - renderType: 'opaque' = every pixel is solid colour.
//               'cutout' = some pixels are fully see-through (e.g. gaps between leaves).
// - textures:   which tile in the atlas (textures.js) each face uses: top, side, bottom.
export const BLOCK_TYPES = [
  { id: BLOCK.AIR,   name: 'air',   solid: false, opaque: false, color: null },
  {
    id: BLOCK.GRASS, name: 'grass', solid: true, opaque: true, renderType: 'opaque',
    color: 0x5fae3c,
    textures: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' },
  },
  {
    id: BLOCK.DIRT,  name: 'dirt',  solid: true, opaque: true, renderType: 'opaque',
    color: 0x8b5a2b,
    textures: { top: 'dirt', side: 'dirt', bottom: 'dirt' },
  },
  {
    id: BLOCK.STONE, name: 'stone', solid: true, opaque: true, renderType: 'opaque',
    color: 0x8a8a8a,
    textures: { top: 'stone', side: 'stone', bottom: 'stone' },
  },
  {
    id: BLOCK.WOOD,  name: 'wood',  solid: true, opaque: true, renderType: 'opaque',
    color: 0x6b4a2b,
    textures: { top: 'wood_top', side: 'wood_side', bottom: 'wood_top' },
  },
  {
    // To make leaves see-through later: set opaque: false, renderType: 'cutout',
    // and give the leaves texture some transparent pixels in textures.js.
    id: BLOCK.LEAVES, name: 'leaves', solid: true, opaque: true, renderType: 'opaque',
    color: 0x3d8b2f,
    textures: { top: 'leaves', side: 'leaves', bottom: 'leaves' },
  },
  {
    id: BLOCK.SAND,  name: 'sand',  solid: true, opaque: true, renderType: 'opaque',
    color: 0xdfcf8e,
    textures: { top: 'sand', side: 'sand', bottom: 'sand' },
  },
  {
    id: BLOCK.PLANKS, name: 'planks', solid: true, opaque: true, renderType: 'opaque',
    color: 0xb98a52,
    textures: { top: 'planks', side: 'planks', bottom: 'planks' },
  },
];

export function isSolidId(id) {
  return BLOCK_TYPES[id]?.solid ?? false;
}

export function isOpaqueId(id) {
  return BLOCK_TYPES[id]?.opaque ?? false;
}

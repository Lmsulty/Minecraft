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
  CORE: 8,   // unbreakable floor at the bottom of the world
  // Crafted only (never generated in the world, see recipes.js):
  STONE_BRICKS: 9,
  GLOW_LAMP: 10,
  GLASS: 11,
};

// Indexed by block id.
// - solid:      do you bump into it? (collision, and what the crosshair can target)
// - opaque:     does it completely hide the faces of blocks behind it?
//               Something like see-through leaves would be solid but NOT opaque.
// - renderType: 'opaque' = every pixel is solid colour.
//               'cutout' = some pixels are fully see-through (e.g. gaps between leaves, glass).
//               'glow'   = always fully bright, even at night (e.g. the glow lamp).
// - blocksLight: does it stop sunlight from spreading into caves? (leaves let light through)
// - breakable:  can the player break it? (missing = yes)
// - drops:      which block you collect when you break it (missing = the block itself)
// - emitsLight: lights up dark places around it, like caves (missing = no)
// - textures:   which tile in the atlas (textures.js) each face uses: top, side, bottom.
export const BLOCK_TYPES = [
  { id: BLOCK.AIR,   name: 'air',   solid: false, opaque: false, blocksLight: false },
  {
    id: BLOCK.GRASS, name: 'grass', solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    drops: BLOCK.DIRT,
    textures: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' },
  },
  {
    id: BLOCK.DIRT,  name: 'dirt',  solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    textures: { top: 'dirt', side: 'dirt', bottom: 'dirt' },
  },
  {
    id: BLOCK.STONE, name: 'stone', solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    textures: { top: 'stone', side: 'stone', bottom: 'stone' },
  },
  {
    id: BLOCK.WOOD,  name: 'wood',  solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    textures: { top: 'wood_top', side: 'wood_side', bottom: 'wood_top' },
  },
  {
    // To make leaves see-through later: set opaque: false, renderType: 'cutout',
    // and give the leaves texture some transparent pixels in textures.js.
    id: BLOCK.LEAVES, name: 'leaves', solid: true, opaque: true, renderType: 'opaque', blocksLight: false,
    textures: { top: 'leaves', side: 'leaves', bottom: 'leaves' },
  },
  {
    id: BLOCK.SAND,  name: 'sand',  solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    textures: { top: 'sand', side: 'sand', bottom: 'sand' },
  },
  {
    id: BLOCK.PLANKS, name: 'planks', solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    textures: { top: 'planks', side: 'planks', bottom: 'planks' },
  },
  {
    // The floor of the world: can't be broken, so nobody falls out.
    id: BLOCK.CORE, name: 'core rock', solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    breakable: false,
    textures: { top: 'core', side: 'core', bottom: 'core' },
  },
  {
    id: BLOCK.STONE_BRICKS, name: 'stone bricks', solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    textures: { top: 'stone_bricks', side: 'stone_bricks', bottom: 'stone_bricks' },
  },
  {
    // Lights up caves around it, and stays bright at night.
    id: BLOCK.GLOW_LAMP, name: 'glow lamp', solid: true, opaque: true, renderType: 'glow', blocksLight: true,
    emitsLight: true,
    textures: { top: 'glow_lamp', side: 'glow_lamp', bottom: 'glow_lamp' },
  },
  {
    // See-through: you can look through the middle of each face, and sunlight passes through.
    id: BLOCK.GLASS, name: 'glass', solid: true, opaque: false, renderType: 'cutout', blocksLight: false,
    textures: { top: 'glass', side: 'glass', bottom: 'glass' },
  },
];

export function isSolidId(id) {
  return BLOCK_TYPES[id]?.solid ?? false;
}

export function isOpaqueId(id) {
  return BLOCK_TYPES[id]?.opaque ?? false;
}

export function blocksLightId(id) {
  return BLOCK_TYPES[id]?.blocksLight ?? false;
}

export function isBreakableId(id) {
  return BLOCK_TYPES[id]?.breakable ?? true;
}

// The block you collect when you break block `id`.
export function dropId(id) {
  return BLOCK_TYPES[id]?.drops ?? id;
}

// A block's name for showing on screen: 'planks' -> 'Planks'.
export function blockDisplayName(id) {
  const name = BLOCK_TYPES[id].name;
  return name[0].toUpperCase() + name.slice(1);
}

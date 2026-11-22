// Every block type in the game lives here. (Things you carry but can't
// place, like grazer fleece, are items: see items.js.)
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
  FELT: 12,
  // Made by the world on planets with a sea (never carried or placed):
  WATER: 13,
  // Made by the world on the lava planet:
  BLACK_GLASS: 14,
  EMBER_CRACK: 15,
  // Invisible, fills the spaceship's shape (ship.js). Never saved.
  SHIP_HULL: 16,
  // Made by the world on the ice planet:
  SNOW: 17,
  PACKED_ICE: 18,
  CRYSTAL_ICE: 19,
  CLOUD_ICE: 20,  // the frozen cloud shelves floating high above the ground
};

// Indexed by block id.
// - solid:      do you bump into it? (collision, and what the crosshair can target)
// - opaque:     does it completely hide the faces of blocks behind it?
//               Something like see-through leaves would be solid but NOT opaque.
// - renderType: 'opaque' = every pixel is solid colour.
//               'cutout' = some pixels are fully see-through (e.g. gaps between leaves, glass).
//               'glow'   = always fully bright, even at night (e.g. the glow lamp).
//               'water'  = see-through all over (how much: THEME.waterOpacity).
//               'crystal' = see-through all over (each pixel has its own
//                          see-through-ness) AND always bright, even at night.
// - blocksLight: does it stop sunlight from spreading into caves? (leaves let light through)
// - breakable:  can the player break it? (missing = yes)
// - drops:      which block you collect when you break it (missing = the block itself)
// - emitsLight: lights up dark places around it, like caves (missing = no)
// - liquid:     you walk (wade) through it, and it fills holes you dig next to
//               it below sea level. It can't be carried or placed. (missing = no)
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
  {
    // Soft quilted panels, made from grazer fleece (see recipes.js).
    id: BLOCK.FELT, name: 'felt block', solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    textures: { top: 'felt', side: 'felt', bottom: 'felt' },
  },
  {
    // The sea on the water world. Not solid, so you wade through it and aim
    // straight through it at the sea floor.
    id: BLOCK.WATER, name: 'water', solid: false, opaque: false, renderType: 'water', blocksLight: false,
    liquid: true, breakable: false,
    textures: { top: 'water', side: 'water', bottom: 'water' },
  },
  {
    // The ground of the lava planet: glassy black rock.
    id: BLOCK.BLACK_GLASS, name: 'black glass', solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    textures: { top: 'black_glass', side: 'black_glass', bottom: 'black_glass' },
  },
  {
    // Black glass split by glowing orange cracks. Always bright (even at night)
    // and lights up the dark around it, like the glow lamp.
    id: BLOCK.EMBER_CRACK, name: 'ember crack', solid: true, opaque: true, renderType: 'glow', blocksLight: true,
    emitsLight: true,
    textures: { top: 'ember_crack', side: 'ember_crack', bottom: 'ember_crack' },
  },
  {
    // The spaceship's invisible shape: solid, so you, Kevin and creatures bump
    // into the ship, and nothing can be built or dug there. It's never drawn,
    // and it doesn't change how anything around it looks: not opaque (blocks
    // touching it keep all their faces and get no soft shadows from it) and
    // it doesn't block sunlight. No textures = can't be carried or placed.
    id: BLOCK.SHIP_HULL, name: 'ship hull', solid: true, opaque: false, blocksLight: false,
    breakable: false,
  },
  {
    // The ice planet's ground: soft, rolling snow.
    id: BLOCK.SNOW, name: 'snow', solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    textures: { top: 'snow', side: 'snow', bottom: 'snow' },
  },
  {
    // Cracked blue ice, in the ice planet's low ground and deep down.
    id: BLOCK.PACKED_ICE, name: 'packed ice', solid: true, opaque: true, renderType: 'opaque', blocksLight: true,
    textures: { top: 'packed_ice', side: 'packed_ice', bottom: 'packed_ice' },
  },
  {
    // Glowing crystal ice: see-through like glass, always faintly lit, and it
    // lights up the ground around it at night (like the lava planet's cracks).
    id: BLOCK.CRYSTAL_ICE, name: 'crystal ice', solid: true, opaque: false, renderType: 'crystal', blocksLight: false,
    emitsLight: true,
    textures: { top: 'crystal_ice', side: 'crystal_ice', bottom: 'crystal_ice' },
  },
  {
    // Pale frosted ice: what the frozen clouds are made of. Solid, so you can
    // build up and walk on them. Lets sunlight through, so the ground
    // underneath doesn't go cave-dark.
    id: BLOCK.CLOUD_ICE, name: 'cloud ice', solid: true, opaque: true, renderType: 'opaque', blocksLight: false,
    textures: { top: 'cloud_ice', side: 'cloud_ice', bottom: 'cloud_ice' },
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

// Can a block be put here? True for empty space: air, or water (building in
// the sea pushes the water out of the way).
export function isEmptyId(id) {
  return id === BLOCK.AIR || (BLOCK_TYPES[id]?.liquid ?? false);
}

// The block you collect when you break block `id`.
export function dropId(id) {
  return BLOCK_TYPES[id]?.drops ?? id;
}

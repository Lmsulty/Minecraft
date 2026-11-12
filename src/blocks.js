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

// Indexed by block id. `textures` is not used yet — it names the faces
// the texture atlas will draw later (top, side, bottom).
export const BLOCK_TYPES = [
  { id: BLOCK.AIR,   name: 'air',   solid: false, color: null },
  {
    id: BLOCK.GRASS, name: 'grass', solid: true, color: 0x5fae3c,
    textures: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' },
  },
  {
    id: BLOCK.DIRT,  name: 'dirt',  solid: true, color: 0x8b5a2b,
    textures: { top: 'dirt', side: 'dirt', bottom: 'dirt' },
  },
  {
    id: BLOCK.STONE, name: 'stone', solid: true, color: 0x8a8a8a,
    textures: { top: 'stone', side: 'stone', bottom: 'stone' },
  },
  {
    id: BLOCK.WOOD,  name: 'wood',  solid: true, color: 0x6b4a2b,
    textures: { top: 'wood_top', side: 'wood_side', bottom: 'wood_top' },
  },
  {
    // Solid for now so you can stand on it. Could become see-through once textures exist.
    id: BLOCK.LEAVES, name: 'leaves', solid: true, color: 0x3d8b2f,
    textures: { top: 'leaves', side: 'leaves', bottom: 'leaves' },
  },
  {
    id: BLOCK.SAND,  name: 'sand',  solid: true, color: 0xdfcf8e,
    textures: { top: 'sand', side: 'sand', bottom: 'sand' },
  },
  {
    id: BLOCK.PLANKS, name: 'planks', solid: true, color: 0xb98a52,
    textures: { top: 'planks', side: 'planks', bottom: 'planks' },
  },
];

export function isSolidId(id) {
  return BLOCK_TYPES[id]?.solid ?? false;
}

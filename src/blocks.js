// Every block type in the game lives here.
// The world stores only the number (id) of each block; this file says what each number means.

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
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
];

export function isSolidId(id) {
  return BLOCK_TYPES[id]?.solid ?? false;
}

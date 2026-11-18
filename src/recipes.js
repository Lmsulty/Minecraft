// ==========================================================
//  RECIPES: everything the player can craft.
//  To add a recipe, copy a line and change it. Use the NAMES of blocks
//  (blocks.js, e.g. 'wood', 'planks') or items (items.js, e.g. 'glow dust').
//  Names with a space need quotes: { 'stone bricks': 1 }.
//
//    makes: the block or item you get
//    count: how many you get each time you craft
//    needs: what it uses up, and how many of each
//
//  Two recipes can make the same thing in different ways (like the two
//  glow lamp recipes below): each shows up as its own card.
//
//  The order here is the order they appear in the crafting list
//  (recipes you can make right now are moved to the top).
// ==========================================================

export const RECIPES = [
  { makes: 'planks', count: 4, needs: { wood: 1 } },
  { makes: 'stone bricks', count: 4, needs: { stone: 4 } },
  { makes: 'glass', count: 1, needs: { sand: 3 } },
  { makes: 'glow lamp', count: 1, needs: { planks: 2, 'stone bricks': 1, leaves: 4 } },
  { makes: 'glow lamp', count: 1, needs: { planks: 2, 'stone bricks': 1, 'glow dust': 1 } }, // glow dust instead of leaves
  { makes: 'felt block', count: 1, needs: { 'grazer fleece': 2 } },
];

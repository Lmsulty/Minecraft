// ==========================================================
//  RECIPES: everything the player can craft.
//  To add a recipe, copy a line and change it. Use the block NAMES
//  from blocks.js (the `name` of each block, e.g. 'wood', 'planks').
//  Names with a space need quotes: { 'stone bricks': 1 }.
//
//    makes: the block you get
//    count: how many you get each time you craft
//    needs: which blocks it uses up, and how many of each
//
//  The order here is the order they appear in the crafting list
//  (recipes you can make right now are moved to the top).
// ==========================================================

export const RECIPES = [
  { makes: 'planks', count: 4, needs: { wood: 1 } },
  { makes: 'stone bricks', count: 4, needs: { stone: 4 } },
  { makes: 'glass', count: 1, needs: { sand: 3 } },
  { makes: 'glow lamp', count: 1, needs: { planks: 2, 'stone bricks': 1, leaves: 4 } },
];

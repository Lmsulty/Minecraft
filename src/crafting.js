import { idByName } from './items.js';
import { RECIPES } from './recipes.js';

// Crafting rules: turns the recipes in recipes.js (written with block and
// item names) into ids, and works out whether each one can be crafted right
// now. Drawing the recipe list is done by craftingPanel.js.

// 'planks' -> 7. Stops the game with a clear message if a recipe has a typo.
function blockIdByName(name, recipeIndex) {
  const id = idByName(name);
  if (id === null) throw new Error(`recipes.js, recipe ${recipeIndex + 1}: no block or item called "${name}"`);
  return id;
}

// The recipes with block ids instead of names:
//   { makes: 7, count: 4, needs: [{ block: 4, count: 1 }] }
export const CRAFTING_RECIPES = RECIPES.map((recipe, i) => ({
  makes: blockIdByName(recipe.makes, i),
  count: recipe.count,
  needs: Object.entries(recipe.needs).map(([name, count]) => ({
    block: blockIdByName(name, i),
    count,
  })),
}));

// Can this recipe be crafted right now?
//   'ready'   -> yes
//   'missing' -> not enough of some ingredient
//   'full'    -> you have the ingredients, but there's no room for the result
export function recipeStatus(inventory, recipe) {
  return inventory.trade(recipe.needs, recipe.makes, recipe.count, { dryRun: true });
}

// Craft it `times` times (or as many as possible, if fewer).
// Returns how many times it was actually crafted.
export function craft(inventory, recipe, times = 1) {
  return inventory.tradeMany(recipe.needs, recipe.makes, recipe.count, times);
}

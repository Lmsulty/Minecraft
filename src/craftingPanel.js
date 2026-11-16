import { blockDisplayName } from './blocks.js';
import { getBlockIconURL } from './blockIcons.js';
import { CRAFTING_RECIPES, recipeStatus, craft } from './crafting.js';

// The recipe list on the right of the inventory screen (normal mode only).
// One card per recipe:
//
//   [icon] Planks ×4
//          Wood  1 / 1
//
// Cards you can craft are bright and sorted to the top. Cards you can't are
// greyed out, with the missing ingredients highlighted.
//   Click        craft once
//   Shift-click  craft as many as you can

const CRAFT_ALL_LIMIT = 999; // safety cap for shift-click

export class CraftingPanel {
  // list: the empty <div> to put the recipe cards in
  constructor(list, inventory) {
    this.list = list;
    this.inventory = inventory;
  }

  // Rebuild the cards so they match what's in the inventory now.
  refresh() {
    const cards = CRAFTING_RECIPES.map((recipe) => ({
      recipe,
      status: recipeStatus(this.inventory, recipe),
    }));
    // Craftable first; otherwise keep the order from recipes.js (sort is stable).
    cards.sort((a, b) => (b.status === 'ready') - (a.status === 'ready'));

    this.list.replaceChildren(...cards.map(({ recipe, status }) => this.makeCard(recipe, status)));
  }

  makeCard(recipe, status) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'recipe';
    card.classList.toggle('is-ready', status === 'ready');
    card.disabled = status !== 'ready';

    const icon = document.createElement('img');
    icon.className = 'recipe-icon';
    icon.src = getBlockIconURL(recipe.makes);
    icon.alt = '';

    const info = document.createElement('div');
    info.className = 'recipe-info';

    const title = document.createElement('div');
    title.className = 'recipe-name';
    title.textContent = `${blockDisplayName(recipe.makes)} ×${recipe.count}`;
    info.appendChild(title);

    // One line per ingredient: "Wood  1 / 1" (have / need).
    for (const need of recipe.needs) {
      const have = this.inventory.countOf(need.block);
      const line = document.createElement('div');
      line.className = 'recipe-need';
      line.classList.toggle('is-missing', have < need.count);
      line.textContent = `${blockDisplayName(need.block)}  ${have} / ${need.count}`;
      info.appendChild(line);
    }

    if (status === 'full') {
      const full = document.createElement('div');
      full.className = 'recipe-need is-missing';
      full.textContent = 'Inventory full';
      info.appendChild(full);
    }

    card.append(icon, info);
    card.addEventListener('click', (e) => {
      craft(this.inventory, recipe, e.shiftKey ? CRAFT_ALL_LIMIT : 1);
      // The inventory change redraws the whole screen, including this list.
    });
    return card;
  }
}

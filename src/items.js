import { BLOCK_TYPES } from './blocks.js';

// ==========================================================
//  ITEMS: things you can carry and craft with, but not place in the world
//  (unlike blocks). For now they come from defeated creatures (the
//  `drops` in mobTypes.js).
//
//  Items share the inventory with blocks: a slot holds a number (id)
//  and a count either way. Item ids start at 100, so they can never
//  clash with block ids (blocks.js).
//
//  To add an item: give it a new id in ITEM, add a line to ITEM_TYPES,
//  a painter in itemIcons.js and its colours in theme.js (THEME.items).
//  Recipes (recipes.js) and drops (mobTypes.js) use the item's `name`.
// ==========================================================

export const ITEM = {
  GRAZER_FLEECE: 100,
  GLOW_DUST: 101,
};

//  name: what it's called (in recipes, drops, and on screen)
//  icon: which picture in itemIcons.js
export const ITEM_TYPES = [
  { id: ITEM.GRAZER_FLEECE, name: 'grazer fleece', icon: 'grazer_fleece' },
  { id: ITEM.GLOW_DUST, name: 'glow dust', icon: 'glow_dust' },
];

const ITEMS_BY_ID = new Map(ITEM_TYPES.map((item) => [item.id, item]));

// ---- Helpers that work for both blocks and items ----

// Is this id an item (not a block)?
export function isItemId(id) {
  return ITEMS_BY_ID.has(id);
}

// The item with this id, or undefined.
export function itemType(id) {
  return ITEMS_BY_ID.get(id);
}

// Can it be put down in the world? (Blocks with a look can; items can't.)
export function isPlaceableId(id) {
  return !!BLOCK_TYPES[id]?.textures;
}

// Can it sit in the inventory? (Any real block or item. Used when loading a
// save, so a broken or outdated save can't put junk in your slots.)
export function isCarryableId(id) {
  return isPlaceableId(id) || isItemId(id);
}

// Block or item name -> id, e.g. 'planks' -> 7, 'glow dust' -> 101.
// Returns null if there's nothing with that name.
export function idByName(name) {
  const block = BLOCK_TYPES.find((type) => type.name === name);
  if (block) return block.id;
  const item = ITEM_TYPES.find((type) => type.name === name);
  return item ? item.id : null;
}

// A name for showing on screen: 'glow dust' -> 'Glow dust'.
export function displayName(id) {
  const name = itemType(id)?.name ?? BLOCK_TYPES[id]?.name ?? '?';
  return name[0].toUpperCase() + name.slice(1);
}

// Creative mode: press C to switch it on or off.
// While it's on, placing blocks doesn't use them up and breaking blocks
// doesn't collect them, so you can build freely. The hotbar shows ∞.
// The on/off setting is stored in the inventory, so it's saved too.

export class CreativeToggle {
  // badge:    the "CREATIVE" label shown while the mode is on
  // isActive: function that says whether the game is being played (mouse captured)
  constructor(badge, inventory, isActive) {
    this.badge = badge;
    this.inventory = inventory;

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyC' || e.repeat || !isActive()) return;
      inventory.setCreative(!inventory.creative);
    });

    inventory.onChange(() => this.refresh());
    this.refresh(); // show the badge straight away if a saved game was in creative
  }

  refresh() {
    this.badge.classList.toggle('show', this.inventory.creative);
  }
}

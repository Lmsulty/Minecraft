import * as THREE from 'three';
import { THEME } from './theme.js';
import { bendMaterial } from './curve.js';

// While Kevin waits for you to pick a spot for a build (kevinOrders.js):
//
//   - a GHOST of the build: faint see-through boxes where the blocks would
//     go. Mint green if the spot works, red if it doesn't.
//   - a RING next to the crosshair that fills up while you hold steady on
//     a spot, with a hint ("F to confirm · 17s").
//
// This file only draws them. kevinOrders.js decides what to show.

const MAX_BOXES = 300;   // most boxes the ghost can show (a hut with foundations is ~110)
const OPACITY = 0.22;    // how see-through the boxes are (0 = invisible, 1 = solid)
const GROW = 1.02;       // boxes a touch bigger than a block, so they don't flicker against real blocks
const RING_SIZE = 10;    // radius of the ring (in the SVG's own units)

const matrix = new THREE.Matrix4();

export class KevinGhost {
  constructor(scene) {
    this.good = new THREE.Color(THEME.mobs.kevin.ghostGood);
    this.bad = new THREE.Color(THEME.mobs.kevin.ghostBad);

    const material = bendMaterial(new THREE.MeshBasicMaterial({
      color: this.good, transparent: true, opacity: OPACITY, depthWrite: false,
    }));
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(GROW, GROW, GROW), material, MAX_BOXES);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // it moves about (and the view curves)
    this.mesh.renderOrder = 1;       // after the world, so you can see blocks through it
    this.mesh.visible = false;
    scene.add(this.mesh);

    // The ring and hint by the crosshair.
    const circumference = 2 * Math.PI * RING_SIZE;
    this.circumference = circumference;
    this.element = document.createElement('div');
    this.element.id = 'kevin-pick';
    this.element.innerHTML = `
      <svg viewBox="0 0 26 26">
        <circle class="track" cx="13" cy="13" r="${RING_SIZE}" />
        <circle class="fill" cx="13" cy="13" r="${RING_SIZE}"
          stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" />
      </svg>
      <span></span>`;
    this.fill = this.element.querySelector('.fill');
    this.hint = this.element.querySelector('span');
    document.body.append(this.element);
  }

  // Show boxes at `cells` ([{ x, y, z }]), green if `ok`, red if not.
  show(cells, ok) {
    const count = Math.min(cells.length, MAX_BOXES);
    for (let i = 0; i < count; i++) {
      const c = cells[i];
      matrix.makeTranslation(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      this.mesh.setMatrixAt(i, matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.material.color.copy(ok ? this.good : this.bad);
    this.mesh.visible = count > 0;
  }

  // The ring: `progress` 0..1, red if the spot won't work, and a hint.
  showRing(progress, ok, hint) {
    this.element.classList.add('is-visible');
    this.element.classList.toggle('is-bad', !ok);
    this.fill.setAttribute('stroke-dashoffset', String(this.circumference * (1 - Math.min(1, progress))));
    this.hint.textContent = hint;
  }

  hide() {
    this.mesh.visible = false;
    this.mesh.count = 0;
    this.element.classList.remove('is-visible');
  }
}

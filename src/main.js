import * as THREE from 'three';
import { World } from './world.js';
import { SPAWN } from './terrain.js';
import { BLOCK } from './blocks.js';
import { Player } from './player.js';
import { Interaction } from './interaction.js';
import { FpsCounter } from './fps.js';
import { EditStore } from './storage.js';
import { Hotbar } from './hotbar.js';
import { Inventory } from './inventory.js';
import { CreativeToggle } from './creative.js';
import { applyUiTheme } from './theme.js';
import { DayNight } from './dayNight.js';

// Interface colours (CSS variables) from theme.js, before anything is shown.
applyUiTheme();

// ---- Renderer: draws the 3D scene onto a <canvas> ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---- Scene: sky colour and distance fog ----
// The actual colours are set by the day/night cycle (dayNight.js + theme.js).
const scene = new THREE.Scene();
scene.background = new THREE.Color();
// Fades out before the edge of the loaded chunks (about 80 blocks away),
// so the world seems to go on forever.
scene.fog = new THREE.Fog(0xffffff, 45, 78);

// ---- Lights: soft sky light + a sun/moon, so each cube face gets a different shade ----
const ambientLight = new THREE.HemisphereLight();
const mainLight = new THREE.DirectionalLight();
scene.add(ambientLight, mainLight, mainLight.target); // target = the spot the light points at

// ---- Saving: remembers the player's block changes between visits ----
const SEED = 12345;
const savedMessage = document.getElementById('saved');
let hideSavedTimer = null;
function flashSaved() {
  // Flash "Saved" in the corner for a second.
  savedMessage.classList.add('show');
  clearTimeout(hideSavedTimer);
  hideSavedTimer = setTimeout(() => savedMessage.classList.remove('show'), 1000);
}
const editStore = new EditStore(SEED, flashSaved);
// What the player is carrying. A new world starts with an empty inventory.
const inventory = new Inventory(SEED, flashSaved);

// ---- World: chunks load and unload around the player as they move ----
const world = new World(SEED, editStore);
scene.add(world.group);

// ---- Camera + player: the player moves the camera around ----
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const player = new Player(camera, world, renderer.domElement, document.getElementById('overlay'));

// ---- Day/night cycle (press T to speed it up) ----
const dayNight = new DayNight(scene, camera, ambientLight, mainLight);

// Spawn near the middle of chunk (0, 0). Build the ground around it right away
// so there's something to stand on; the rest streams in over the next second.
world.loadAroundNow(SPAWN.x + 0.5, SPAWN.z + 0.5);
const spawn = findSpawn(SPAWN.x, SPAWN.z);
player.spawn(spawn.x, spawn.y, spawn.z);
// Start looking at the starter sinkhole, so a new player sees a cave straight away.
const starter = world.terrain.starter;
const toStarter = Math.hypot(starter.x - spawn.x, starter.z - spawn.z);
player.yaw = Math.atan2(-(starter.x - spawn.x), -(starter.z - spawn.z));
player.pitch = -Math.atan2(spawn.y + 1.62 - starter.top, toStarter); // aim at the middle of the hole
player.updateCamera();

// Find a safe spot to stand: untouched grass with two blocks of air above
// (not inside a cave opening). Searches in growing squares around (x, z).
function findSpawn(x, z) {
  for (let r = 0; r <= 12; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // only the ring's edge
        const h = world.terrain.height(x + dx, z + dz);
        if (world.getBlock(x + dx, h, z + dz) === BLOCK.GRASS &&
            !world.isSolid(x + dx, h + 1, z + dz) &&
            !world.isSolid(x + dx, h + 2, z + dz)) {
          return { x: x + dx + 0.5, y: h + 1, z: z + dz + 0.5 };
        }
      }
    }
  }
  return { x: x + 0.5, y: world.getSurfaceY(x, z), z: z + 0.5 }; // fallback
}

// ---- Breaking and placing blocks ----
// The hotbar's scroll wheel only works while playing (mouse captured).
const hotbar = new Hotbar(document.getElementById('hotbar'), inventory, () => player.locked);
const interaction = new Interaction(camera, world, player, scene, hotbar, inventory);

// ---- Creative mode: press C for unlimited blocks ----
new CreativeToggle(document.getElementById('creative-badge'), inventory, () => player.locked);

// ---- Performance readout in the top-left corner ----
const fps = new FpsCounter(document.getElementById('fps'), renderer, world, dayNight, player);

// ---- "Reset world" button on the pause screen ----
document.getElementById('reset').addEventListener('click', (e) => {
  e.stopPropagation(); // don't also count as "click to play"
  if (!confirm('Reset the world? All your changes and your inventory will be lost.')) return;
  editStore.clear();
  inventory.clear();
  location.reload(); // start fresh: the world regenerates from the seed
});

// ---- Keep the picture the right shape when the window resizes ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Game loop: runs about 60 times per second ----
let lastTime = performance.now();
function loop(now) {
  // dt = seconds since last frame. Capped so a long pause (e.g. switching
  // tabs) doesn't make the player teleport or fall through the floor.
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  world.update(player.position.x, player.position.z); // load/unload chunks, a few ms at most
  player.update(dt);
  interaction.update();
  dayNight.update(dt); // after the player moves, so the sky is centred on the camera
  renderer.render(scene, camera);
  fps.update(); // after render, so it can read this frame's draw calls
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Interaction } from './interaction.js';
import { FpsCounter } from './fps.js';
import { EditStore } from './storage.js';
import { Hotbar } from './hotbar.js';
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
const editStore = new EditStore(SEED, () => {
  // Flash "Saved" in the corner for a second.
  savedMessage.classList.add('show');
  clearTimeout(hideSavedTimer);
  hideSavedTimer = setTimeout(() => savedMessage.classList.remove('show'), 1000);
});

// ---- World: chunks load and unload around the player as they move ----
const world = new World(SEED, editStore);
scene.add(world.group);

// ---- Camera + player: the player moves the camera around ----
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const player = new Player(camera, world, renderer.domElement, document.getElementById('overlay'));

// ---- Day/night cycle (press T to speed it up) ----
const dayNight = new DayNight(scene, camera, ambientLight, mainLight);

// Spawn in the middle of chunk (0, 0). Build the ground around it right away
// so there's something to stand on; the rest streams in over the next second.
const spawnX = 8.5;
const spawnZ = 8.5;
world.loadAroundNow(spawnX, spawnZ);
player.spawn(spawnX, world.getSurfaceY(spawnX, spawnZ), spawnZ);

// ---- Breaking and placing blocks ----
// The hotbar's scroll wheel only works while playing (mouse captured).
const hotbar = new Hotbar(document.getElementById('hotbar'), () => player.locked);
const interaction = new Interaction(camera, world, player, scene, hotbar);

// ---- Performance readout in the top-left corner ----
const fps = new FpsCounter(document.getElementById('fps'), renderer, world, dayNight);

// ---- "Reset world" button on the pause screen ----
document.getElementById('reset').addEventListener('click', (e) => {
  e.stopPropagation(); // don't also count as "click to play"
  if (!confirm('Reset the world? All your changes will be lost.')) return;
  editStore.clear();
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

import * as THREE from 'three';
import { World } from './world.js';
import { SPAWN } from './terrain.js';
import { BLOCK_TYPES } from './blocks.js';
import { Player } from './player.js';
import { Interaction } from './interaction.js';
import { FpsCounter } from './fps.js';
import { EditStore } from './storage.js';
import { Hotbar } from './hotbar.js';
import { Inventory } from './inventory.js';
import { CreativeToggle } from './creative.js';
import { InventoryScreen } from './inventoryScreen.js';
import { applyUiTheme, THEME, PLANET } from './theme.js';
import { setupDebugPlanetKey } from './planets.js';
import { Ship, chooseShipSite } from './ship.js';
import { ShipPicker } from './shipPicker.js';
import { DayNight } from './dayNight.js';
import { Underwater } from './underwater.js';
import { updateCurve, cullBentChunks } from './curve.js';
import { GraphicsSettings } from './graphics.js';
import { Mobs } from './mobs.js';
import { Kevin } from './kevin.js';
import { RenameBox, resetKevinName } from './kevinName.js';
import { KevinVoice } from './kevinVoice.js';
import { KevinBubble } from './kevinBubble.js';
import { KevinCaption } from './kevinCaption.js';
import { KevinTalk } from './kevinTalk.js';
import { KevinChat } from './kevinChat.js';
import { KevinBuilder } from './kevinBuild.js';
import { KevinOrders } from './kevinOrders.js';
import { KevinGhost } from './kevinGhost.js';

// Interface colours (CSS variables) from theme.js, before anything is shown.
applyUiTheme();

// ---- Graphics quality (Low / Medium / High / Auto, see graphics.js) ----
// Loaded first: edge smoothing (antialias) must be decided before the renderer is made.
const graphics = new GraphicsSettings();

// ---- Renderer: draws the 3D scene onto a <canvas> ----
// Sharpness (pixel ratio) is set by the graphics level, further down.
const renderer = new THREE.WebGLRenderer({ antialias: graphics.level.antialias });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---- Scene: sky and distance haze ----
// The actual colours are set by the day/night cycle (dayNight.js + theme.js).
// The haze fades land out before the edge of the loaded chunks, so the world
// seems to go on forever. Where it starts and ends depends on the draw
// distance, so the graphics level sets it. How it fades: curve.js.
const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0xffffff, graphics.level.haze[0], graphics.level.haze[1]);

// ---- Lights: soft sky light + the big sun (or starlight at night), so each cube face gets a different shade ----
const ambientLight = new THREE.HemisphereLight();
const mainLight = new THREE.DirectionalLight();
scene.add(ambientLight, mainLight, mainLight.target); // target = the spot the light points at

// ---- Saving: remembers the player's block changes between visits ----
// Each planet has its own seed (theme.js), and so its own terrain and its own save.
const SEED = PLANET.seed;
const savedMessage = document.getElementById('saved');
let hideSavedTimer = null;
function flashSaved() {
  // Flash "Saved" in the corner for a second.
  savedMessage.classList.add('show');
  clearTimeout(hideSavedTimer);
  hideSavedTimer = setTimeout(() => savedMessage.classList.remove('show'), 1000);
}
const editStore = new EditStore(SEED, flashSaved);
// What the player is carrying. The same inventory on every planet.
const inventory = new Inventory(flashSaved);

// ---- World: chunks load and unload around the player as they move ----
const world = new World(SEED, editStore);
scene.add(world.group);

// ---- Camera + player: the player moves the camera around ----
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const player = new Player(camera, world, renderer.domElement, document.getElementById('overlay'));

// ---- Day/night cycle (press T to speed it up) ----
const dayNight = new DayNight(scene, camera, ambientLight, mainLight, graphics.level);
// Sea-coloured view with your head under water (underwater.js).
const underwater = new Underwater(scene, camera, world, ambientLight, () => graphics.level.haze);

// ---- The spaceship, parked near where you start (ship.js) ----
// Near the middle of chunk (0, 0), or on the nearest island if that's sea.
// Its spot is chosen before any land loads, so its invisible hull is in
// place from the start.
const land = world.terrain.findLand(SPAWN.x, SPAWN.z);
const shipSite = chooseShipSite(world.terrain, editStore, land);
world.setShipCells(shipSite.cells);
const ship = new Ship(scene, shipSite);

// You (and Kevin) start beside the ship's ramp. Build the ground around it
// right away so there's something to stand on; the rest streams in over the
// next second.
world.loadAroundNow(shipSite.door.x + 0.5, shipSite.door.z + 0.5);
const spawn = findSpawn(shipSite.door.x, shipSite.door.z);
player.spawn(spawn.x, spawn.y, spawn.z);
// Start looking at the starter sinkhole, so a new player sees a cave straight
// away. (Planets with no caves don't have one.)
const starter = world.terrain.starter;
if (starter) {
  const toStarter = Math.hypot(starter.x - spawn.x, starter.z - spawn.z);
  player.yaw = Math.atan2(-(starter.x - spawn.x), -(starter.z - spawn.z));
  player.pitch = -Math.atan2(spawn.y + 1.62 - starter.top, toStarter); // aim at the middle of the hole
}
player.updateCamera();

// Find a safe spot to stand: untouched ground (grass at home, see
// terrain.spawnOn in theme.js) with two blocks of air above (not inside a
// cave opening). Searches in growing squares around (x, z).
function findSpawn(x, z) {
  const ground = BLOCK_TYPES.findIndex((type) => type.name === THEME.terrain.spawnOn);
  for (let r = 0; r <= 12; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // only the ring's edge
        const h = world.terrain.height(x + dx, z + dz);
        if (world.getBlock(x + dx, h, z + dz) === ground &&
            !world.isSolid(x + dx, h + 1, z + dz) &&
            !world.isSolid(x + dx, h + 2, z + dz)) {
          return { x: x + dx + 0.5, y: h + 1, z: z + dz + 0.5 };
        }
      }
    }
  }
  return { x: x + 0.5, y: world.getSurfaceY(x, z), z: z + 0.5 }; // fallback
}

// ---- Creatures: spawn near the player, wander, and can be hit (mobs.js) ----
const mobs = new Mobs(scene, world, player, camera, dayNight);

// ---- Kevin, your robot companion: follows you everywhere (kevin.js) ----
const kevin = new Kevin(scene, world, player, camera, document.getElementById('kevin-tag'));

// ---- Breaking and placing blocks (and hitting creatures) ----
// The hotbar's scroll wheel only works while playing (mouse captured).
const hotbar = new Hotbar(document.getElementById('hotbar'), inventory, () => player.locked);
const interaction = new Interaction(camera, world, player, scene, hotbar, inventory, mobs, kevin);

// ---- Renaming Kevin: look at him and press N (kevinName.js) ----
new RenameBox(document.getElementById('kevin-rename'), player, () => interaction.lookingAtKevin);

// ---- Kevin talking: speech bubble, captions, voice (M to mute) and remarks (kevinTalk.js) ----
const kevinVoice = new KevinVoice(document.getElementById('kevin-voice'), (text) => hotbar.showText(text));
const kevinTalk = new KevinTalk(kevin, player, dayNight, camera,
  new KevinBubble(document.getElementById('kevin-bubble')),
  new KevinCaption(document.getElementById('kevin-caption')), kevinVoice);

// ---- Kevin building things you ask for in the chat (kevinBuild.js) ----
const kevinBuilder = new KevinBuilder({
  kevin, world, player, inventory, talk: kevinTalk, scene,
  aim: (reach) => interaction.raycast(reach), // where you're pointing (he looks further than you can reach)
});

// ---- Kevin's to-do list: up to 3 jobs from one message (kevinOrders.js) ----
// He asks where each build goes, showing a ghost preview where you point (kevinGhost.js).
const kevinOrders = new KevinOrders({
  kevin, builder: kevinBuilder, talk: kevinTalk, player, ghost: new KevinGhost(scene),
});

// ---- Chatting with Kevin: press Enter (kevinChat.js; replies from askKevin() in kevinReply.js) ----
new KevinChat(document.getElementById('kevin-chat'), {
  player, kevin, orders: kevinOrders, talk: kevinTalk, hotbar, inventory, mobs, dayNight,
});

// ---- Creative mode: press C for unlimited blocks ----
// ---- Inventory screen: press E or Tab ----
const inventoryScreen = new InventoryScreen(document.getElementById('inventory'), inventory, player);

// ---- Creative mode: press C for unlimited blocks (works in the inventory screen too) ----
new CreativeToggle(document.getElementById('creative-badge'), inventory,
  () => player.locked || inventoryScreen.isOpen);

// ---- Performance readout in the top-left corner ----
const fps = new FpsCounter(document.getElementById('fps'), renderer, world, dayNight, player, mobs);

// ---- Graphics buttons on the pause screen, and Auto mode ----
graphics.attach({
  renderer, world, scene, dayNight, player, fps, mobs,
  buttons: document.getElementById('graphics'),
  notice: document.getElementById('notice'),
});

// ---- Boarding the ship: near its ramp, press R to pick a planet (shipPicker.js) ----
const shipPicker = new ShipPicker(document.getElementById('ship-hint'),
  document.getElementById('ship-picker'), player, shipSite.door);

// ---- Debug: press P to jump to the next planet (switch off in planets.js) ----
setupDebugPlanetKey();

// ---- "Reset world" button on the pause screen ----
document.getElementById('reset').addEventListener('click', (e) => {
  e.stopPropagation(); // don't also count as "click to play"
  if (!confirm('Reset the world? All your changes and your inventory will be lost.')) return;
  editStore.clear();
  inventory.clear();
  resetKevinName(); // back to "Kevin"
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
  mobs.update(dt);     // after the player moves, so they react to where you are now
  kevin.update(dt);    // same for Kevin
  ship.update(dt);     // blinks the light on its nose
  shipPicker.update(); // "Press R to board" near the ramp
  kevinBuilder.update(dt); // places his next block, if he's building something
  kevinOrders.update(dt);  // starts his next job, or waits for you to pick a spot
  kevinTalk.update(dt); // after Kevin moves, so his speech bubble follows him
  interaction.update();
  dayNight.update(dt); // after the player moves, so the sky is centred on the camera
  underwater.update();  // after dayNight, which sets the haze colour every frame
  updateCurve(camera);                   // the cylinder bend starts at the camera
  cullBentChunks(world.group, camera);   // skip chunks that are off-screen (after bending)
  renderer.render(scene, camera);
  fps.update(); // after render, so it can read this frame's draw calls
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

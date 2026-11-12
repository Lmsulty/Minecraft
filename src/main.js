import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';

// ---- Renderer: draws the 3D scene onto a <canvas> ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---- Scene: sky colour and distance fog ----
const SKY_COLOR = 0x87ceeb;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(SKY_COLOR, 60, 140);

// ---- Lights: soft sky light + a sun, so each cube face gets a different shade ----
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(30, 80, 20);
scene.add(sun);

// ---- World ----
const world = new World(12345);
world.generate();
scene.add(world.group);

// ---- Camera + player: the player moves the camera around ----
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const player = new Player(camera, world, renderer.domElement, document.getElementById('overlay'));

// Start standing on the ground in the middle of the world.
const spawnX = 32.5;
const spawnZ = 32.5;
player.spawn(spawnX, world.getSurfaceY(spawnX, spawnZ), spawnZ);

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

  player.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

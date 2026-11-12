import * as THREE from 'three';
import { World } from './world.js';

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

// ---- Camera: fixed overview for now (the player controls it in step 3) ----
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(-20, 45, -20);
camera.lookAt(32, 12, 32); // centre of the 64 x 64 world

// ---- Keep the picture the right shape when the window resizes ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Game loop: runs about 60 times per second ----
function loop() {
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();

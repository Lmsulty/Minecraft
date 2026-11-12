// Small readout in the corner for measuring performance:
// - FPS:        frames drawn per second (averaged over half a second so it doesn't flicker)
// - Slowest:    the longest single frame in that half second. This is the stutter
//               detector: an average hides one slow frame, this doesn't.
//               Under ~17 ms means smooth at 60 FPS.
// - Draw calls: how many separate batches the graphics card was asked to draw
// - Triangles:  how many triangles were drawn in the last frame
// - Chunks:     loaded (have block data) / drawn / still waiting in the queue
// - Time:       the in-game clock (shows x20 while time is sped up with T)
// - Position:   where you are standing (X and Z across the ground, Y = height)

const UPDATE_EVERY_MS = 500;

export class FpsCounter {
  constructor(element, renderer, world, dayNight, player) {
    this.element = element;
    this.renderer = renderer;
    this.world = world;
    this.dayNight = dayNight;
    this.player = player;
    this.frames = 0;
    this.lastUpdate = performance.now();
    this.lastFrame = this.lastUpdate;
    this.slowest = 0;
  }

  // Call once per frame, right after renderer.render().
  update() {
    const now = performance.now();
    this.slowest = Math.max(this.slowest, now - this.lastFrame);
    this.lastFrame = now;
    this.frames++;

    const elapsed = now - this.lastUpdate;
    if (elapsed < UPDATE_EVERY_MS) return;

    const fps = Math.round((this.frames * 1000) / elapsed);
    const info = this.renderer.info.render; // filled in by the last render() call
    const chunks = this.world.stats();
    this.element.textContent =
      `FPS        ${fps}\n` +
      `Slowest    ${this.slowest.toFixed(1)} ms\n` +
      `Draw calls ${info.calls}\n` +
      `Triangles  ${info.triangles.toLocaleString()}\n` +
      `Chunks     ${chunks.loaded} loaded / ${chunks.drawn} drawn / ${chunks.queued} queued\n` +
      `Time       ${this.dayNight.clockText()}\n` +
      `Position   ${this.positionText()}`;

    this.frames = 0;
    this.slowest = 0;
    this.lastUpdate = now;
  }

  // e.g. "X 12  Y 50  Z -30" (the block you're standing in)
  positionText() {
    const p = this.player.position;
    return `X ${Math.floor(p.x)}  Y ${Math.floor(p.y)}  Z ${Math.floor(p.z)}`;
  }
}

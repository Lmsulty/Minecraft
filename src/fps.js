// Small readout in the corner for measuring performance:
// - FPS: frames drawn per second (averaged over half a second so it doesn't flicker)
// - Draw calls: how many separate batches the graphics card was asked to draw
// - Triangles: how many triangles were drawn in the last frame

const UPDATE_EVERY_MS = 500;

export class FpsCounter {
  constructor(element, renderer) {
    this.element = element;
    this.renderer = renderer;
    this.frames = 0;
    this.lastUpdate = performance.now();
  }

  // Call once per frame, right after renderer.render().
  update() {
    this.frames++;
    const now = performance.now();
    const elapsed = now - this.lastUpdate;
    if (elapsed < UPDATE_EVERY_MS) return;

    const fps = Math.round((this.frames * 1000) / elapsed);
    const info = this.renderer.info.render; // filled in by the last render() call
    this.element.textContent =
      `FPS        ${fps}\n` +
      `Draw calls ${info.calls}\n` +
      `Triangles  ${info.triangles.toLocaleString()}`;

    this.frames = 0;
    this.lastUpdate = now;
  }
}

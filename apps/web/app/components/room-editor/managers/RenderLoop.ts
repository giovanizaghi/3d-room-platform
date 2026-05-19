import * as THREE from "three";
import type { CameraManager } from "./CameraManager";
import type { WallObjectManager } from "./WallObjectManager";

export class RenderLoop {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cameraManager: CameraManager;
  private wallObjects: WallObjectManager;
  private container: HTMLDivElement;
  private animId: number | null = null;
  private resizeObs: ResizeObserver;
  private running = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    container: HTMLDivElement,
    cameraManager: CameraManager,
    wallObjects: WallObjectManager,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.cameraManager = cameraManager;
    this.wallObjects = wallObjects;

    this.resizeObs = new ResizeObserver(this.onResize);
    this.resizeObs.observe(container);
    this.onResize();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.animId !== null) cancelAnimationFrame(this.animId);
    this.animId = null;
  }

  dispose(): void {
    this.stop();
    this.resizeObs.disconnect();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private tick = (): void => {
    if (!this.running) return;
    this.animId = requestAnimationFrame(this.tick);

    // Sims-style wall hide based on camera
    this.wallObjects.updateWallVisibility(this.camera.position.x, this.camera.position.z);

    // Update camera controls
    this.cameraManager.update();

    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };
}

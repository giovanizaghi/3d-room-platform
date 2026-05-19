import * as THREE from "three";
import type { WallId } from "../domain/types";
import type { SelectionManager } from "./SelectionManager";
import type { FurnitureManager } from "./FurnitureManager";
import type { WallObjectManager } from "./WallObjectManager";
import type { LightManager } from "./LightManager";
import type { TransformManager } from "./TransformManager";

export class EventManager {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private selection: SelectionManager;
  private furniture: FurnitureManager;
  private wallObjects: WallObjectManager;
  private lights: LightManager;
  private transform: TransformManager;
  private floor: THREE.Mesh;

  private pdX = 0;
  private pdY = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    floor: THREE.Mesh,
    selection: SelectionManager,
    furniture: FurnitureManager,
    wallObjects: WallObjectManager,
    lights: LightManager,
    transform: TransformManager,
  ) {
    this.renderer = renderer;
    this.camera = camera;
    this.floor = floor;
    this.selection = selection;
    this.furniture = furniture;
    this.wallObjects = wallObjects;
    this.lights = lights;
    this.transform = transform;

    renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
  }

  // ── Private handlers ────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    this.pdX = e.clientX;
    this.pdY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.transform.wasJustDragged) return;
    if (Math.hypot(e.clientX - this.pdX, e.clientY - this.pdY) > 6) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      ((e.clientY - rect.top) / rect.height) * -2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);

    // Priority 1: Furniture & lights
    const furnitureHits = ray.intersectObjects(this.furniture.getVisibleItems(), false);
    if (furnitureHits.length > 0) {
      const hitMesh = furnitureHits[0].object as THREE.Mesh;
      if (hitMesh.userData.isLight) {
        const entry = this.lights.findByProxy(hitMesh);
        if (entry) {
          const lp = this.lights.getProps(entry);
          this.selection.selectLight(entry, lp);
          this.lights.attachHelper(entry);
          this.transform.applyAxisConstraints();
        }
      } else {
        this.selection.selectObject(hitMesh);
        this.transform.applyAxisConstraints(hitMesh);
      }
      return;
    }

    // Priority 2: Walls
    const visibleWalls = this.wallObjects.getVisibleWalls();
    const wallHits = ray.intersectObjects(visibleWalls, false);
    if (wallHits.length > 0) {
      const hitMesh = wallHits[0].object as THREE.Mesh;
      const wallId = this.wallObjects.findWallId(hitMesh);
      if (wallId) {
        this.selection.toggleWall(wallId, hitMesh);
      }
      return;
    }

    // Priority 3: Floor
    const floorHits = ray.intersectObjects([this.floor], false);
    if (floorHits.length > 0) {
      this.selection.toggleFloor(this.floor);
      return;
    }

    // Empty space — deselect
    this.selection.clearAll();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this.selection.clearAll();
    }
  };
}

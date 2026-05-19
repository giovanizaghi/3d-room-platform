import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { ToolMode, WallId } from "../domain/types";
import type { SelectionManager } from "./SelectionManager";
import type { WallObjectManager } from "./WallObjectManager";
import type { FurnitureManager } from "./FurnitureManager";
import type { CameraManager } from "./CameraManager";

export class TransformManager {
  private tc: TransformControls;
  private currentTool: ToolMode = "translate";
  private justDragged = false;
  private scene: THREE.Scene;
  private selection: SelectionManager;
  private wallObjects: WallObjectManager;
  private furniture: FurnitureManager;
  private cameraManager: CameraManager;

  constructor(
    tc: TransformControls,
    scene: THREE.Scene,
    selection: SelectionManager,
    wallObjects: WallObjectManager,
    furniture: FurnitureManager,
    cameraManager: CameraManager,
  ) {
    this.scene = scene;
    this.selection = selection;
    this.wallObjects = wallObjects;
    this.furniture = furniture;
    this.cameraManager = cameraManager;

    this.tc = tc;

    this.tc.addEventListener("dragging-changed", this.onDraggingChanged as any);
    this.tc.addEventListener("objectChange", this.onObjectChange as any);
  }

  get controls(): TransformControls {
    return this.tc;
  }

  get wasJustDragged(): boolean {
    return this.justDragged;
  }

  setTool(mode: ToolMode): void {
    this.currentTool = mode;
    this.tc.setMode(mode);
    this.applyAxisConstraints();
  }

  applyAxisConstraints(mesh?: THREE.Mesh | null): void {
    const target = mesh ?? this.selection.selectedMesh;
    if (target?.userData.isWallObject) {
      const wallId = target.userData.wallId as WallId;
      const isXWall = wallId === "front" || wallId === "back";
      if (this.currentTool === "translate") {
        this.tc.showX = isXWall; this.tc.showY = true; this.tc.showZ = !isXWall;
      } else {
        this.tc.showX = false; this.tc.showY = true; this.tc.showZ = false;
      }
    } else if (this.selection.selectedLight) {
      this.tc.showX = true; this.tc.showY = true; this.tc.showZ = true;
      const lp = this.selection.selectedLight.light.userData;
      if (this.currentTool === "rotate" && lp.type !== "spotLight") {
        this.tc.showX = false; this.tc.showY = false; this.tc.showZ = false;
      }
    } else {
      this.tc.showX = true; this.tc.showY = true; this.tc.showZ = true;
    }
  }

  dispose(): void {
    this.tc.removeEventListener("dragging-changed", this.onDraggingChanged as any);
    this.tc.removeEventListener("objectChange", this.onObjectChange as any);
    this.tc.dispose();
  }

  // ── Private handlers ────────────────────────────────────────────────────

  private onDraggingChanged = (e: { value: unknown }): void => {
    const dragging = !!e.value;
    this.cameraManager.setEnabled(!dragging);
    if (!dragging) {
      this.justDragged = true;
      Promise.resolve().then(() => { this.justDragged = false; });
    }
  };

  private onObjectChange = (): void => {
    const lightEntry = this.selection.selectedLight;
    if (lightEntry) {
      if (lightEntry.light instanceof THREE.SpotLight) {
        const p = lightEntry.proxy.position;
        lightEntry.light.target.position.set(p.x, 0, p.z);
        lightEntry.light.target.updateMatrixWorld();
      }
      return;
    }

    const mesh = this.selection.selectedMesh;
    if (!mesh) return;

    if (mesh.userData.isWallObject) {
      this.wallObjects.constrainToWall(mesh);
    } else if (this.currentTool === "translate") {
      this.furniture.snapToSurface(mesh);
    }

    this.selection.broadcastCurrent();
  };
}

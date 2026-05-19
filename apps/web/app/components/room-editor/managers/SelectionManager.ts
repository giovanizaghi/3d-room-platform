import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { Selection, LightEntry, LightProps, WallId } from "../domain/types";
import { InspectorBridge, readMaterial, readTransform } from "./InspectorBridge";

const EMISSIVE_SEL = new THREE.Color(0x2255cc);
const EMISSIVE_NONE = new THREE.Color(0x000000);
const WIRE_COLOR = new THREE.Color(0xff8800);

export class SelectionManager {
  private current: Selection = null;
  private wireframe: THREE.LineSegments | null = null;
  private wallWireframes: Partial<Record<WallId, THREE.LineSegments>> = {};
  private tc: TransformControls;
  private inspector: InspectorBridge;
  private onWallSelect: (wallId: WallId | null) => void;
  private lightCleanupCallback: ((entry: LightEntry) => void) | null = null;

  constructor(
    tc: TransformControls,
    inspector: InspectorBridge,
    onWallSelect: (wallId: WallId | null) => void,
  ) {
    this.tc = tc;
    this.inspector = inspector;
    this.onWallSelect = onWallSelect;
  }

  get selection(): Selection {
    return this.current;
  }

  get selectedMesh(): THREE.Mesh | null {
    return this.current?.kind === "object" ? this.current.mesh : null;
  }

  get selectedWallId(): WallId | null {
    return this.current?.kind === "wall" ? this.current.wallId : null;
  }

  get selectedLight(): LightEntry | null {
    return this.current?.kind === "light" ? this.current.entry : null;
  }

  get isFloorSelected(): boolean {
    return this.current?.kind === "floor";
  }

  /**
   * Register a callback invoked when a light selection is cleared.
   * Used by LightManager to detach helpers without creating a circular dependency.
   */
  setLightCleanupCallback(cb: (entry: LightEntry) => void): void {
    this.lightCleanupCallback = cb;
  }

  selectObject(mesh: THREE.Mesh): void {
    if (this.current?.kind === "object" && this.current.mesh === mesh) return;
    this.clearAll();
    this.current = { kind: "object", mesh };
    this.applyEmissive(mesh, true);
    this.attachWireframe(mesh);
    this.tc.attach(mesh);
    this.inspector.broadcast({
      type: "furniture",
      subType: mesh.userData.type as string,
      material: readMaterial(mesh),
      transform: readTransform(mesh),
    }, true);
  }

  selectWall(wallId: WallId, mesh: THREE.Mesh): void {
    if (this.current?.kind === "wall" && this.current.wallId === wallId) return;
    this.clearAll();
    this.current = { kind: "wall", wallId, mesh };
    this.attachWallWireframe(wallId, mesh);
    this.onWallSelect(wallId);
    this.inspector.broadcast({
      type: "wall",
      subType: wallId,
      material: readMaterial(mesh),
    }, true);
  }

  selectFloor(mesh: THREE.Mesh): void {
    if (this.current?.kind === "floor") return;
    this.clearAll();
    this.current = { kind: "floor", mesh };
    this.attachWireframe(mesh);
    this.inspector.broadcast({ type: "floor", material: readMaterial(mesh) }, true);
  }

  selectLight(entry: LightEntry, props: LightProps): void {
    if (this.current?.kind === "light" && this.current.entry === entry) return;
    this.clearAll();
    this.current = { kind: "light", entry };
    (entry.proxy.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
    this.tc.attach(entry.proxy);
    this.inspector.broadcast({ type: "light", subType: props.type, light: { ...props } }, true);
  }

  toggleWall(wallId: WallId, mesh: THREE.Mesh): void {
    if (this.current?.kind === "wall" && this.current.wallId === wallId) {
      this.clearAll();
    } else {
      this.selectWall(wallId, mesh);
    }
  }

  toggleFloor(mesh: THREE.Mesh): void {
    if (this.current?.kind === "floor") {
      this.clearAll();
    } else {
      this.selectFloor(mesh);
    }
  }

  clearAll(): void {
    if (!this.current) return;

    switch (this.current.kind) {
      case "object":
        this.applyEmissive(this.current.mesh, false);
        this.detachWireframe(this.current.mesh);
        this.tc.detach();
        break;
      case "wall":
        this.detachWallWireframe(this.current.wallId);
        this.onWallSelect(null);
        break;
      case "floor":
        this.detachWireframe(this.current.mesh);
        break;
      case "light":
        (this.current.entry.proxy.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
        this.tc.detach();
        this.lightCleanupCallback?.(this.current.entry);
        break;
    }

    this.current = null;
    this.inspector.broadcast(null, true);
  }

  /**
   * Rebuild wireframe after wall geometry has changed.
   */
  refreshWallWireframe(wallId: WallId, mesh: THREE.Mesh): void {
    if (this.current?.kind === "wall" && this.current.wallId === wallId) {
      this.detachWallWireframe(wallId);
      this.current = { kind: "wall", wallId, mesh };
      this.attachWallWireframe(wallId, mesh);
    }
  }

  /**
   * Broadcast current selection info (e.g., after transform change).
   */
  broadcastCurrent(force = false): void {
    if (!this.current) {
      this.inspector.broadcast(null, force);
      return;
    }
    switch (this.current.kind) {
      case "object":
        this.inspector.broadcast({
          type: "furniture",
          subType: this.current.mesh.userData.type as string,
          material: readMaterial(this.current.mesh),
          transform: readTransform(this.current.mesh),
        }, force);
        break;
      case "wall":
        this.inspector.broadcast({
          type: "wall",
          subType: this.current.wallId,
          material: readMaterial(this.current.mesh),
        }, force);
        break;
      case "floor":
        this.inspector.broadcast({
          type: "floor",
          material: readMaterial(this.current.mesh),
        }, force);
        break;
      case "light":
        // Light broadcasting is handled by LightManager
        break;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private applyEmissive(mesh: THREE.Mesh, on: boolean): void {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.emissive.copy(on ? EMISSIVE_SEL : EMISSIVE_NONE);
    mat.emissiveIntensity = on ? 0.2 : 0;
  }

  private attachWireframe(mesh: THREE.Mesh): void {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 5);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: WIRE_COLOR, linewidth: 1, depthTest: false }),
    );
    line.renderOrder = 10;
    mesh.add(line);
    this.wireframe = line;
  }

  private detachWireframe(mesh: THREE.Mesh): void {
    if (this.wireframe) {
      mesh.remove(this.wireframe);
      this.wireframe.geometry.dispose();
      (this.wireframe.material as THREE.Material).dispose();
      this.wireframe = null;
    }
  }

  private attachWallWireframe(wallId: WallId, mesh: THREE.Mesh): void {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 5);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: WIRE_COLOR, linewidth: 1, depthTest: false }),
    );
    line.renderOrder = 10;
    mesh.add(line);
    this.wallWireframes[wallId] = line;
  }

  private detachWallWireframe(wallId: WallId): void {
    const line = this.wallWireframes[wallId];
    if (line) {
      const parent = line.parent;
      parent?.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      delete this.wallWireframes[wallId];
    }
  }
}

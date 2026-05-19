import * as THREE from "three";
import type { MaterialProps } from "../domain/types";
import type { SelectionManager } from "./SelectionManager";
import type { InspectorBridge } from "./InspectorBridge";
import { readMaterial, readTransform } from "./InspectorBridge";

export class MaterialManager {
  private selection: SelectionManager;
  private inspector: InspectorBridge;
  private floor: THREE.Mesh;
  private getWallMesh: (wallId: string) => THREE.Mesh;

  constructor(
    selection: SelectionManager,
    inspector: InspectorBridge,
    floor: THREE.Mesh,
    getWallMesh: (wallId: string) => THREE.Mesh,
  ) {
    this.selection = selection;
    this.inspector = inspector;
    this.floor = floor;
    this.getWallMesh = getWallMesh;
  }

  update(props: Partial<MaterialProps>): void {
    const sel = this.selection.selection;
    if (!sel) return;

    let target: THREE.Mesh | null = null;
    if (sel.kind === "object") target = sel.mesh;
    else if (sel.kind === "floor") target = this.floor;
    else if (sel.kind === "wall") target = sel.mesh;
    if (!target) return;

    const mat = target.material as THREE.MeshStandardMaterial;
    if (props.color !== undefined) mat.color.set(props.color);
    if (props.roughness !== undefined) mat.roughness = props.roughness;
    if (props.metalness !== undefined) mat.metalness = props.metalness;
    if (props.opacity !== undefined) mat.opacity = props.opacity;
    if (props.transparent !== undefined) mat.transparent = props.transparent;
    mat.needsUpdate = true;

    this.selection.broadcastCurrent(true);
  }
}

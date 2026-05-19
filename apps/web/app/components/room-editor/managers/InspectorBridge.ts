import * as THREE from "three";
import type { MaterialProps, TransformData, SelectionInfo } from "../domain/types";

/**
 * Read material properties from a MeshStandardMaterial.
 */
export function readMaterial(mesh: THREE.Mesh): MaterialProps {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  return {
    color: "#" + mat.color.getHexString(),
    roughness: mat.roughness,
    metalness: mat.metalness,
    opacity: mat.opacity,
    transparent: mat.transparent,
  };
}

/**
 * Read transform data from a mesh (position in metres, rotation in degrees).
 */
export function readTransform(mesh: THREE.Mesh): TransformData {
  return {
    position: {
      x: +mesh.position.x.toFixed(3),
      y: +mesh.position.y.toFixed(3),
      z: +mesh.position.z.toFixed(3),
    },
    rotation: {
      x: +THREE.MathUtils.radToDeg(mesh.rotation.x).toFixed(1),
      y: +THREE.MathUtils.radToDeg(mesh.rotation.y).toFixed(1),
      z: +THREE.MathUtils.radToDeg(mesh.rotation.z).toFixed(1),
    },
  };
}

/**
 * Throttled broadcaster for inspector state.
 * Avoids flooding React with state updates during continuous drag.
 */
export class InspectorBridge {
  private lastBroadcast = 0;
  private minInterval = 50; // ~20fps

  constructor(private callback: (info: SelectionInfo | null) => void) {}

  broadcast(info: SelectionInfo | null, force = false): void {
    const now = Date.now();
    if (!force && now - this.lastBroadcast < this.minInterval) return;
    this.lastBroadcast = now;
    this.callback(info);
  }

  setCallback(cb: (info: SelectionInfo | null) => void): void {
    this.callback = cb;
  }
}

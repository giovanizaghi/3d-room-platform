import * as THREE from "three";

/**
 * Recursively dispose geometries and materials from an object graph.
 */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }
    if (child instanceof THREE.LineSegments) {
      child.geometry?.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
    }
  });
}

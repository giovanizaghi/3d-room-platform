import * as THREE from "three";
import type { ObjectType, WallId, LightEntry } from "../domain/types";
import { HALF_H, PALETTE, WALL_HEIGHT, THICKNESS } from "../domain/constants";
import { buildGeometry } from "../scene/RoomFactory";

export class FurnitureManager {
  private scene: THREE.Scene;
  private floor: THREE.Mesh;
  readonly items: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, floor: THREE.Mesh) {
    this.scene = scene;
    this.floor = floor;
  }

  create(type: ObjectType): THREE.Mesh {
    const mesh = new THREE.Mesh(
      buildGeometry(type),
      new THREE.MeshStandardMaterial({ color: PALETTE[type], roughness: 0.7, metalness: 0.05 }),
    );
    mesh.userData.isFurniture = true;
    mesh.userData.halfHeight = HALF_H[type];
    mesh.userData.type = type;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(0, 0, 0);
    this.scene.add(mesh);
    this.items.push(mesh);
    this.snapToSurface(mesh);
    return mesh;
  }

  remove(mesh: THREE.Mesh): void {
    this.scene.remove(mesh);
    const idx = this.items.indexOf(mesh);
    if (idx !== -1) this.items.splice(idx, 1);
  }

  /**
   * Raycast downward from above WALL_HEIGHT to find the surface below the object.
   */
  snapToSurface(mesh: THREE.Mesh): void {
    const halfH = mesh.userData.halfHeight as number;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(mesh.position.x, WALL_HEIGHT + 1, mesh.position.z),
      new THREE.Vector3(0, -1, 0),
    );
    const targets = [this.floor, ...this.items.filter(f => f !== mesh && !f.userData.isWallObject)];
    const hits = ray.intersectObjects(targets, false);
    mesh.position.y = hits.length > 0 ? hits[0].point.y + halfH : halfH;
  }

  /**
   * Get all visible furniture for raycast hit testing.
   */
  getVisibleItems(): THREE.Mesh[] {
    return this.items.filter(f => f.visible);
  }
}

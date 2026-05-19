import * as THREE from "three";
import type { WallId, WallInfo, ObjectType } from "../domain/types";
import { WALL_HEIGHT, THICKNESS, WALL_OBJ_DEFS, PALETTE } from "../domain/constants";
import { buildWallWithHoles } from "../scene/RoomFactory";
import type { SelectionManager } from "./SelectionManager";
import type { FurnitureManager } from "./FurnitureManager";

export class WallObjectManager {
  private scene: THREE.Scene;
  private wallMeshes: Record<WallId, THREE.Mesh>;
  private wallInfo: Record<WallId, WallInfo>;
  private wallObjects: THREE.Mesh[] = [];
  private furniture: FurnitureManager;
  private selection: SelectionManager;
  private width: number;
  private depth: number;

  constructor(
    scene: THREE.Scene,
    wallMeshes: Record<WallId, THREE.Mesh>,
    width: number,
    depth: number,
    furniture: FurnitureManager,
    selection: SelectionManager,
  ) {
    this.scene = scene;
    this.wallMeshes = wallMeshes;
    this.width = width;
    this.depth = depth;
    this.furniture = furniture;
    this.selection = selection;

    const hw = width / 2;
    const hd = depth / 2;
    this.wallInfo = {
      front: { normal: new THREE.Vector3(0, 0, 1), innerZ: -hd, axis: "x", sign: 1 },
      back: { normal: new THREE.Vector3(0, 0, -1), innerZ: hd, axis: "x", sign: -1 },
      left: { normal: new THREE.Vector3(1, 0, 0), innerZ: -hw, axis: "z", sign: 1 },
      right: { normal: new THREE.Vector3(-1, 0, 0), innerZ: hw, axis: "z", sign: -1 },
    };
  }

  getWallMesh(id: WallId): THREE.Mesh {
    return this.wallMeshes[id];
  }

  getWallMeshes(): Record<WallId, THREE.Mesh> {
    return this.wallMeshes;
  }

  getVisibleWalls(): THREE.Mesh[] {
    return (Object.entries(this.wallMeshes) as [WallId, THREE.Mesh][])
      .filter(([, m]) => !m.userData.simHidden)
      .map(([, m]) => m);
  }

  findWallId(mesh: THREE.Mesh): WallId | null {
    return (Object.entries(this.wallMeshes) as [WallId, THREE.Mesh][])
      .find(([, m]) => m === mesh)?.[0] ?? null;
  }

  createWallObject(type: ObjectType, wallId: WallId): THREE.Mesh {
    const def = WALL_OBJ_DEFS[type];
    const geo = new THREE.BoxGeometry(def.w, def.h, THICKNESS);
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE[type],
      roughness: 0.5,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    mesh.userData.type = type;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.placeOnWall(mesh, wallId);
    this.scene.add(mesh);
    this.wallObjects.push(mesh);
    this.furniture.items.push(mesh);
    if (type === "window" || type === "door") {
      this.syncWallLocal(mesh);
      this.rebuildWall(wallId);
    }
    return mesh;
  }

  remove(mesh: THREE.Mesh): void {
    const idx = this.wallObjects.indexOf(mesh);
    if (idx !== -1) this.wallObjects.splice(idx, 1);
    const wallId = mesh.userData.wallId as WallId;
    if (mesh.userData.type === "window" || mesh.userData.type === "door") {
      this.rebuildWall(wallId);
    }
  }

  constrainToWall(mesh: THREE.Mesh): void {
    const wallId = mesh.userData.wallId as WallId;
    const isXWall = wallId === "front" || wallId === "back";
    const info = this.wallInfo[wallId];
    const offset = info.sign * THICKNESS / 2;

    if (isXWall) {
      mesh.position.z = info.innerZ + offset;
    } else {
      mesh.position.x = info.innerZ + offset;
    }

    const def = WALL_OBJ_DEFS[mesh.userData.type as string];
    mesh.position.y = Math.max(def.h / 2, Math.min(WALL_HEIGHT - def.h / 2, mesh.position.y));
    this.syncWallLocal(mesh);
    this.rebuildWall(wallId);
  }

  /**
   * Sims-style wall hide. Toggles colorWrite/depthWrite based on camera position.
   * Returns true if selection should be cleared for a wall/object that was hidden.
   */
  updateWallVisibility(cameraX: number, cameraZ: number): void {
    const vis: Record<WallId, boolean> = {
      front: cameraZ >= 0,
      back: cameraZ <= 0,
      left: cameraX >= 0,
      right: cameraX <= 0,
    };

    (Object.keys(vis) as WallId[]).forEach(id => {
      const wall = this.wallMeshes[id];
      const mat = wall.material as THREE.MeshStandardMaterial;
      mat.colorWrite = vis[id];
      mat.depthWrite = vis[id];
      wall.userData.simHidden = !vis[id];

      // Auto-deselect hidden wall
      if (!vis[id] && this.selection.selectedWallId === id) {
        this.selection.clearAll();
      }

      // Hide/show wall objects
      this.wallObjects.filter(o => o.userData.wallId === id).forEach(o => {
        o.visible = vis[id];
        if (!vis[id] && this.selection.selectedMesh === o) {
          this.selection.clearAll();
        }
      });
    });
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private placeOnWall(mesh: THREE.Mesh, wallId: WallId): void {
    const info = this.wallInfo[wallId];
    const isXWall = wallId === "front" || wallId === "back";
    const def = WALL_OBJ_DEFS[mesh.userData.type as string];
    const offset = info.sign * (THICKNESS / 2);
    mesh.userData.wallId = wallId;
    mesh.userData.isWallObject = true;
    if (isXWall) {
      mesh.position.set(0, def.defaultY, info.innerZ + offset);
      mesh.rotation.set(0, 0, 0);
    } else {
      mesh.position.set(info.innerZ + offset, def.defaultY, 0);
      mesh.rotation.set(0, Math.PI / 2, 0);
    }
    mesh.userData.wallLocal = { x: 0, z: 0 };
  }

  private syncWallLocal(mesh: THREE.Mesh): void {
    const wallId = mesh.userData.wallId as WallId;
    const isXWall = wallId === "front" || wallId === "back";
    mesh.userData.wallLocal = isXWall
      ? { x: mesh.position.x, z: 0 }
      : { x: 0, z: mesh.position.z };
  }

  private rebuildWall(wallId: WallId): void {
    const isXWall = wallId === "front" || wallId === "back";
    const wallW = isXWall ? this.width : this.depth + THICKNESS * 2;
    const wallH = WALL_HEIGHT;
    const objs = this.wallObjects.filter(o => o.userData.wallId === wallId);

    const holes = objs
      .filter(o => o.userData.type === "window" || o.userData.type === "door")
      .map(o => {
        const def = WALL_OBJ_DEFS[o.userData.type as string];
        const localX = isXWall ? o.userData.wallLocal.x : -o.userData.wallLocal.z;
        const localY = o.position.y - WALL_HEIGHT / 2;
        return { cx: localX, cy: localY, w: def.w, h: def.h };
      });

    const oldMesh = this.wallMeshes[wallId];
    const geo = buildWallWithHoles(wallW, wallH, THICKNESS, holes);
    const newMesh = new THREE.Mesh(geo, (oldMesh.material as THREE.MeshStandardMaterial).clone());
    newMesh.position.copy(oldMesh.position);
    if (!isXWall) newMesh.rotation.y = Math.PI / 2;
    newMesh.castShadow = true;
    newMesh.receiveShadow = true;
    newMesh.userData = { ...oldMesh.userData, isWall: true, wallId };
    this.scene.remove(oldMesh);
    this.scene.add(newMesh);
    this.wallMeshes[wallId] = newMesh;

    this.selection.refreshWallWireframe(wallId, newMesh);
    objs.forEach(o => { o.visible = !newMesh.userData.simHidden; });
  }
}

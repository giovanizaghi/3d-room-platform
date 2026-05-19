import * as THREE from "three";
import { WALL_HEIGHT, THICKNESS } from "../domain/constants";
import type { ObjectType } from "../domain/types";

export function buildGeometry(type: ObjectType): THREE.BufferGeometry {
  switch (type) {
    case "cube": return new THREE.BoxGeometry(0.6, 0.6, 0.6);
    case "sphere": return new THREE.SphereGeometry(0.35, 32, 16);
    case "cylinder": return new THREE.CylinderGeometry(0.3, 0.3, 0.8, 32);
    default: return new THREE.BoxGeometry(0.1, 0.1, 0.1);
  }
}

export function buildWallWithHoles(
  wallW: number,
  wallH: number,
  thickness: number,
  holes: { cx: number; cy: number; w: number; h: number }[],
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const hw = wallW / 2;
  const hh = wallH / 2;
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  for (const { cx, cy, w, h } of holes) {
    const hole = new THREE.Path();
    hole.moveTo(cx - w / 2, cy - h / 2);
    hole.lineTo(cx + w / 2, cy - h / 2);
    hole.lineTo(cx + w / 2, cy + h / 2);
    hole.lineTo(cx - w / 2, cy + h / 2);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

export interface RoomGeometry {
  floor: THREE.Mesh;
  grid: THREE.GridHelper;
  walls: Record<"front" | "back" | "left" | "right", THREE.Mesh>;
  shadowCeiling: THREE.Mesh;
}

export function createRoomGeometry(width: number, depth: number): RoomGeometry {
  const hw = width / 2;
  const hd = depth / 2;

  // Floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width + THICKNESS * 2, THICKNESS, depth + THICKNESS * 2),
    new THREE.MeshStandardMaterial({ color: 0xc8b99a, roughness: 0.9, metalness: 0.0 }),
  );
  floor.position.y = -THICKNESS / 2;
  floor.receiveShadow = true;

  // Grid
  const span = Math.max(width, depth);
  const grid = new THREE.GridHelper(span, span, 0x9a8a72, 0x9a8a72);
  grid.position.y = 0.002;
  (grid.material as THREE.Material).opacity = 0.25;
  (grid.material as THREE.Material).transparent = true;

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.85 });

  const makeXWall = () =>
    new THREE.Mesh(new THREE.BoxGeometry(width, WALL_HEIGHT, THICKNESS), wallMat.clone());
  const makeZWall = () =>
    new THREE.Mesh(new THREE.BoxGeometry(THICKNESS, WALL_HEIGHT, depth + THICKNESS * 2), wallMat.clone());

  const front = makeXWall();
  front.position.set(0, WALL_HEIGHT / 2, -(hd + THICKNESS / 2));
  front.castShadow = true; front.receiveShadow = true;

  const back = makeXWall();
  back.position.set(0, WALL_HEIGHT / 2, hd + THICKNESS / 2);
  back.castShadow = true; back.receiveShadow = true;

  const left = makeZWall();
  left.position.set(-(hw + THICKNESS / 2), WALL_HEIGHT / 2, 0);
  left.castShadow = true; left.receiveShadow = true;

  const right = makeZWall();
  right.position.set(hw + THICKNESS / 2, WALL_HEIGHT / 2, 0);
  right.castShadow = true; right.receiveShadow = true;

  // Shadow ceiling
  const shadowCeiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width + THICKNESS * 2, depth + THICKNESS * 2),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }),
  );
  shadowCeiling.rotation.x = Math.PI / 2;
  shadowCeiling.position.y = WALL_HEIGHT;
  shadowCeiling.castShadow = true;
  shadowCeiling.receiveShadow = false;
  shadowCeiling.raycast = () => {};
  shadowCeiling.userData.excludeFromExport = true;

  return {
    floor,
    grid,
    walls: { front, back, left, right },
    shadowCeiling,
  };
}

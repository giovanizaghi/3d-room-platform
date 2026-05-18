"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

export type ObjectType    = "cube" | "sphere" | "cylinder" | "frame" | "window" | "door";
export type WallId        = "front" | "back" | "left" | "right";
export type ToolMode      = "translate" | "rotate";
export type CameraPreset  = "perspective" | "top" | "front" | "left" | "right";

export interface RoomSceneProps {
  size: number;
  tool: ToolMode;
  addObjectRef:         React.MutableRefObject<((type: ObjectType) => void) | null>;
  deleteSelectedRef:    React.MutableRefObject<(() => void) | null>;
  setCameraPresetRef:   React.MutableRefObject<((preset: CameraPreset) => void) | null>;
  onSelectionChange:    (name: string | null) => void;
  onWallSelect:         (wallId: WallId | null) => void;
  onCameraChange:       (label: string) => void;
}

const WALL_HEIGHT = 2.7;
const THICKNESS   = 0.15;

// --- Floor-object catalogue -----------------------------------------------
const PALETTE: Record<string, number> = {
  cube:     0x7b9e87,
  sphere:   0xb07b9e,
  cylinder: 0x7b8fb0,
  // wall objects
  frame:    0xa67c52,
  window:   0x8ecae6,
  door:     0x6b4c35,
};
const HALF_H: Record<string, number> = {
  cube:     0.3,
  sphere:   0.35,
  cylinder: 0.4,
};

const WALL_OBJ_DEFS: Record<string, { w: number; h: number; defaultY: number }> = {
  frame:  { w: 0.5,  h: 0.6,  defaultY: WALL_HEIGHT * 0.6 },
  window: { w: 1.0,  h: 1.2,  defaultY: WALL_HEIGHT * 0.5 },
  door:   { w: 0.9,  h: 2.1,  defaultY: 2.1 / 2           },  // bottom at floor
};

const FLOOR_TYPES = new Set(["cube", "sphere", "cylinder"]);
const WALL_TYPES  = new Set(["frame", "window", "door"]);

function buildGeometry(type: ObjectType): THREE.BufferGeometry {
  switch (type) {
    case "cube":     return new THREE.BoxGeometry(0.6, 0.6, 0.6);
    case "sphere":   return new THREE.SphereGeometry(0.35, 32, 16);
    case "cylinder": return new THREE.CylinderGeometry(0.3, 0.3, 0.8, 32);
    default:         return new THREE.BoxGeometry(0.1, 0.1, 0.1); // placeholder
  }
}

// Build an extruded wall with a rectangular cutout (for window / door).
// `wallW` and `wallH` are the full wall interior dimensions.
// `holes` is a list of {x, y, w, h} in local wall-face coordinates
// (x/y = center, w/h = full extent).
function buildWallWithHoles(
  wallW: number,
  wallH: number,
  thickness: number,
  holes: { cx: number; cy: number; w: number; h: number }[],
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const hw = wallW / 2;
  const hh = wallH / 2;
  shape.moveTo(-hw, -hh);
  shape.lineTo( hw, -hh);
  shape.lineTo( hw,  hh);
  shape.lineTo(-hw,  hh);
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

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });
  // Center on Z so the wall sits symmetrically (depth goes 0→thickness → shift by -thickness/2)
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

export function RoomScene({
  size,
  tool,
  addObjectRef,
  deleteSelectedRef,
  setCameraPresetRef,
  onSelectionChange,
  onWallSelect,
  onCameraChange,
}: RoomSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref so the tool-sync effect can reach into the live scene
  const applyToolRef = useRef<((mode: ToolMode) => void) | null>(null);

  // Sync tool prop changes into the running scene without rebuilding it
  useEffect(() => {
    applyToolRef.current?.(tool);
  }, [tool]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ---- Renderer --------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // ---- Scene -----------------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16213e);

    // ---- Camera ----------------------------------------------------------
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(size * 0.9, size * 0.6, size * 0.9);

    // ---- Lighting --------------------------------------------------------
    scene.add(new THREE.AmbientLight(0xdce8ff, 0.9));

    const sunLight = new THREE.DirectionalLight(0xfff4e0, 3.5);
    sunLight.position.set(size * 1.8, size * 2.4, size * 0.6);
    sunLight.target.position.set(0, 0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = size * 8;
    const sc = size * 1.5;
    sunLight.shadow.camera.left   = -sc;
    sunLight.shadow.camera.right  =  sc;
    sunLight.shadow.camera.top    =  sc;
    sunLight.shadow.camera.bottom = -sc;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // ---- Room geometry ---------------------------------------------------
    const half = size / 2;

    // Floor slab — 15 cm thick, top face at y = 0
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(size + THICKNESS * 2, THICKNESS, size + THICKNESS * 2),
      new THREE.MeshStandardMaterial({ color: 0xc8b99a, roughness: 0.9, metalness: 0.0 }),
    );
    floor.position.y = -THICKNESS / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid
    const grid = new THREE.GridHelper(size, size, 0x9a8a72, 0x9a8a72);
    grid.position.y = 0.002;
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Wall material
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.85 });

    const makeXWall = () =>
      new THREE.Mesh(new THREE.BoxGeometry(size + THICKNESS * 2, WALL_HEIGHT, THICKNESS), wallMat.clone());
    const makeZWall = () =>
      new THREE.Mesh(new THREE.BoxGeometry(THICKNESS, WALL_HEIGHT, size), wallMat.clone());

    const frontWall = makeXWall();
    frontWall.position.set(0, WALL_HEIGHT / 2, -(half + THICKNESS / 2));
    frontWall.castShadow = true; frontWall.receiveShadow = true;
    scene.add(frontWall);

    const backWall = makeXWall();
    backWall.position.set(0, WALL_HEIGHT / 2, half + THICKNESS / 2);
    backWall.castShadow = true; backWall.receiveShadow = true;
    scene.add(backWall);

    const leftWall = makeZWall();
    leftWall.position.set(-(half + THICKNESS / 2), WALL_HEIGHT / 2, 0);
    leftWall.castShadow = true; leftWall.receiveShadow = true;
    scene.add(leftWall);

    const rightWall = makeZWall();
    rightWall.position.set(half + THICKNESS / 2, WALL_HEIGHT / 2, 0);
    rightWall.castShadow = true; rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Invisible ceiling for shadows
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.ShadowMaterial({ opacity: 0.45, transparent: true }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT;
    ceiling.receiveShadow = true;
    scene.add(ceiling);

    // Wall meshes by id — kept as refs so we can rebuild them with holes
    type WallMeshMap = Record<WallId, THREE.Mesh>;

    // Selected wall tracking
    let selectedWall: WallId | null = null;
    const WALL_WIRE_COLOR = new THREE.Color(0xff8800); // Blender-style orange
    const wallWireframes: Partial<Record<WallId, THREE.LineSegments>> = {};

    const attachWireframe = (wallId: WallId) => {
      const mesh = wallMeshes[wallId];
      const edges = new THREE.EdgesGeometry(mesh.geometry, 5);
      const line  = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: WALL_WIRE_COLOR, linewidth: 1, depthTest: false }),
      );
      line.renderOrder = 10;
      mesh.add(line);
      wallWireframes[wallId] = line;
    };

    const detachWireframe = (wallId: WallId) => {
      const line = wallWireframes[wallId];
      if (line) {
        wallMeshes[wallId].remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        delete wallWireframes[wallId];
      }
    };

    const setWallSelection = (wallId: WallId | null) => {
      if (selectedWall) detachWireframe(selectedWall);
      selectedWall = wallId;
      if (wallId) attachWireframe(wallId);
      onWallSelect(wallId);
    };

    const wallMeshes: WallMeshMap = {
      front: frontWall, back: backWall, left: leftWall, right: rightWall,
    };

    // Wall inner-face world position and normal for each wall
    const wallInfo: Record<WallId, { normal: THREE.Vector3; innerZ: number; axis: "x" | "z"; sign: 1 | -1 }> = {
      front: { normal: new THREE.Vector3(0, 0,  1), innerZ: -half, axis: "x", sign:  1 },
      back:  { normal: new THREE.Vector3(0, 0, -1), innerZ:  half, axis: "x", sign: -1 },
      left:  { normal: new THREE.Vector3( 1, 0, 0), innerZ: -half, axis: "z", sign:  1 },
      right: { normal: new THREE.Vector3(-1, 0, 0), innerZ:  half, axis: "z", sign: -1 },
    };

    // Rebuild a wall's geometry to include all cutout holes from windows/doors on it
    const wallObjects: THREE.Mesh[] = [];  // wall-attached objects

    const rebuildWall = (wallId: WallId) => {
      const info  = wallInfo[wallId];
      const isXWall = wallId === "front" || wallId === "back";
      const wallW = isXWall ? size + THICKNESS * 2 : size;
      const wallH = WALL_HEIGHT;

      const objs = wallObjects.filter(o => o.userData.wallId === wallId);

      // Collect holes (only window and door cut through)
      const holes = objs
        .filter(o => o.userData.type === "window" || o.userData.type === "door")
        .map(o => {
          const def = WALL_OBJ_DEFS[o.userData.type as string];
          // The shape is built in XY plane, then for Z-walls rotated by rotation.y = π/2.
          // That rotation maps shape local +X → world -Z, so we negate Z-wall positions
          // to keep the hole aligned with the mesh instead of mirrored.
          const localX = isXWall ? o.userData.wallLocal.x : -o.userData.wallLocal.z;
          const localY = o.position.y - WALL_HEIGHT / 2;
          return { cx: localX, cy: localY, w: def.w, h: def.h };
        });

      const oldMesh = wallMeshes[wallId];
      const geo = buildWallWithHoles(wallW, wallH, THICKNESS, holes);
      const newMesh = new THREE.Mesh(geo, (oldMesh.material as THREE.MeshStandardMaterial).clone());
      newMesh.position.copy(oldMesh.position);
      // ExtrudeGeometry extrudes along local Z. Front/back walls are already Z-facing
      // (no rotation needed). Left/right walls face along X, so rotate 90° around Y.
      if (!isXWall) newMesh.rotation.y = Math.PI / 2;
      newMesh.castShadow    = true;
      newMesh.receiveShadow = true;
      newMesh.userData      = { ...oldMesh.userData, isWall: true, wallId };
      scene.remove(oldMesh);
      scene.add(newMesh);
      wallMeshes[wallId] = newMesh;

      // Re-attach wireframe overlay if this wall is currently selected
      if (selectedWall === wallId) {
        // The old mesh was removed; the old LineSegments was a child of it, already gone.
        // Delete the stale reference and attach a fresh one to the new mesh.
        delete wallWireframes[wallId];
        attachWireframe(wallId);
      }

      // Keep wall-object visibility in sync
      objs.forEach(o => { o.visible = newMesh.visible; });
    };

    // ---- OrbitControls ---------------------------------------------------
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, WALL_HEIGHT * 0.3, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = size * 0.5;
    controls.maxDistance = size * 2.8;
    controls.minPolarAngle = Math.PI * 0.08;
    controls.maxPolarAngle = Math.PI * 0.58;
    controls.update();

    // ---- Camera preset API -----------------------------------------------
    const TARGET = new THREE.Vector3(0, WALL_HEIGHT * 0.3, 0);

    // Snap tolerance: position must be within this fraction of size to be considered a preset
    const PRESET_SNAPS: Array<{ label: string; pos: THREE.Vector3 }> = [
      { label: "Perspective", pos: new THREE.Vector3( size * 0.9,  size * 0.6,  size * 0.9) },
      { label: "Top",         pos: new THREE.Vector3( 0,           size * 2.5,  0.001)       },
      { label: "Front",       pos: new THREE.Vector3( 0,           size * 0.5,  size * 1.8)  },
      { label: "Left",        pos: new THREE.Vector3(-size * 1.8,  size * 0.5,  0)           },
      { label: "Right",       pos: new THREE.Vector3( size * 1.8,  size * 0.5,  0)           },
    ];

    let lastCameraLabel = "Perspective";

    const detectCameraLabel = () => {
      const p = camera.position;
      const threshold = size * 0.25;
      for (const snap of PRESET_SNAPS) {
        if (p.distanceTo(snap.pos) < threshold) return snap.label;
      }
      return "User Perspective";
    };

    setCameraPresetRef.current = (preset: CameraPreset) => {
      controls.target.copy(TARGET);
      const snap = PRESET_SNAPS[["perspective","top","front","left","right"].indexOf(preset)];
      camera.position.copy(snap.pos);
      controls.update();
      lastCameraLabel = snap.label;
      onCameraChange(snap.label);
    };

    // Detect user orbit and update label
    controls.addEventListener("change", () => {
      const label = detectCameraLabel();
      if (label !== lastCameraLabel) {
        lastCameraLabel = label;
        onCameraChange(label);
      }
    });

    // Fire initial label
    onCameraChange("Perspective");

    // ---- Furniture tracking ----------------------------------------------
    const furniture: THREE.Mesh[] = [];
    let selected: THREE.Mesh | null = null;

    const EMISSIVE_SEL  = new THREE.Color(0x2255cc);
    const EMISSIVE_NONE = new THREE.Color(0x000000);

    // ---- Surface snap (floor objects) ------------------------------------
    const snapToSurface = (mesh: THREE.Mesh) => {
      const halfH = mesh.userData.halfHeight as number;
      const ray = new THREE.Raycaster(
        new THREE.Vector3(mesh.position.x, WALL_HEIGHT + 1, mesh.position.z),
        new THREE.Vector3(0, -1, 0),
      );
      const targets = [floor, ...furniture.filter(f => f !== mesh && !f.userData.isWallObject)];
      const hits = ray.intersectObjects(targets, false);
      mesh.position.y = hits.length > 0 ? hits[0].point.y + halfH : halfH;
    };

    // ---- Wall-object placement ------------------------------------------
    // (nearestWall removed — wall objects are placed on selectedWall only)

    // Place a wall object onto a specific wall, centered horizontally
    const placeOnWall = (mesh: THREE.Mesh, wallId: WallId) => {
      const info   = wallInfo[wallId];
      const isXWall = wallId === "front" || wallId === "back";
      const def    = WALL_OBJ_DEFS[mesh.userData.type as string];
      const offset = info.sign * (isXWall ? THICKNESS / 2 : THICKNESS / 2);

      mesh.userData.wallId    = wallId;
      mesh.userData.isWallObject = true;

      if (wallId === "front" || wallId === "back") {
        mesh.position.set(0, def.defaultY, info.innerZ + offset);
        mesh.rotation.set(0, 0, 0);
        mesh.userData.wallLocal = { x: 0, z: 0 };
      } else {
        mesh.position.set(info.innerZ + offset, def.defaultY, 0);
        mesh.rotation.set(0, Math.PI / 2, 0);
        mesh.userData.wallLocal = { x: 0, z: 0 };
      }
    };

    // Keep wall-local position cached for hole calculations
    const syncWallLocal = (mesh: THREE.Mesh) => {
      const wallId  = mesh.userData.wallId as WallId;
      const isXWall = wallId === "front" || wallId === "back";
      mesh.userData.wallLocal = isXWall
        ? { x: mesh.position.x, z: 0 }
        : { x: 0, z: mesh.position.z };
    };

    // ---- TransformControls -----------------------------------------------
    const tc = new TransformControls(camera, renderer.domElement);
    const tcHelper = tc.getHelper();
    tc.size = 1.2;
    scene.add(tcHelper);

    let currentTool: ToolMode = tool;

    const applyTool = (mode: ToolMode, mesh?: THREE.Mesh | null) => {
      currentTool = mode;
      tc.setMode(mode);

      const target = mesh ?? selected;
      if (target?.userData.isWallObject) {
        // Wall objects: constrain to slide along the wall only
        const wallId  = target.userData.wallId as WallId;
        const isXWall = wallId === "front" || wallId === "back";
        if (mode === "translate") {
          // X-walls: slide X (lateral) + Y (height); Z is locked (stays on wall)
          // Z-walls: slide Z (lateral) + Y (height); X is locked
          tc.showX = isXWall;
          tc.showY = true;
          tc.showZ = !isXWall;
        } else {
          tc.showX = false; tc.showY = true; tc.showZ = false;
        }
      } else {
        tc.showX = true; tc.showY = true; tc.showZ = true;
      }
    };

    applyTool(tool);
    applyToolRef.current = applyTool;

    // Disable orbit while dragging gizmo
    let justDragged = false;
    tc.addEventListener("dragging-changed", (e) => {
      controls.enabled = !(e as unknown as { value: boolean }).value;
      if (!(e as unknown as { value: boolean }).value) {
        justDragged = true;
        Promise.resolve().then(() => { justDragged = false; });
      }
    });

    tc.addEventListener("objectChange", () => {
      if (!selected) return;
      if (selected.userData.isWallObject) {
        // Lock the axis perpendicular to the wall
        const wallId  = selected.userData.wallId as WallId;
        const isXWall = wallId === "front" || wallId === "back";
        const info    = wallInfo[wallId];
        const offset  = info.sign * THICKNESS / 2;
        if (isXWall) {
          selected.position.z = info.innerZ + offset;
        } else {
          selected.position.x = info.innerZ + offset;
        }
        // Clamp Y
        const def = WALL_OBJ_DEFS[selected.userData.type as string];
        selected.position.y = Math.max(def.h / 2, Math.min(WALL_HEIGHT - def.h / 2, selected.position.y));
        // Update local cache and rebuild the wall with new hole position
        syncWallLocal(selected);
        rebuildWall(wallId);
      } else if (currentTool === "translate") {
        snapToSurface(selected);
      }
    });

    // ---- Selection highlight + axis setup --------------------------------
    const OBJ_WIRE_COLOR = new THREE.Color(0xff8800);
    let selectionWireframe: THREE.LineSegments | null = null;

    const attachObjectWireframe = (mesh: THREE.Mesh) => {
      const edges = new THREE.EdgesGeometry(mesh.geometry, 5);
      const line  = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: OBJ_WIRE_COLOR, linewidth: 1, depthTest: false }),
      );
      line.renderOrder = 10;
      mesh.add(line);
      selectionWireframe = line;
    };

    const detachObjectWireframe = (mesh: THREE.Mesh) => {
      if (selectionWireframe) {
        mesh.remove(selectionWireframe);
        selectionWireframe.geometry.dispose();
        (selectionWireframe.material as THREE.Material).dispose();
        selectionWireframe = null;
      }
    };

    const setSelection = (mesh: THREE.Mesh | null) => {
      if (selected === mesh) return;

      if (selected) {
        const mat = selected.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(EMISSIVE_NONE);
        mat.emissiveIntensity = 0;
        detachObjectWireframe(selected);
        tc.detach();
      }

      selected = mesh;

      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(EMISSIVE_SEL);
        mat.emissiveIntensity = 0.2;
        attachObjectWireframe(mesh);
        tc.attach(mesh);
        applyTool(currentTool, mesh);
      }

      onSelectionChange(mesh ? (mesh.userData.type as string) : null);
    };

    // ---- Add object API --------------------------------------------------
    addObjectRef.current = (type: ObjectType) => {
      if (FLOOR_TYPES.has(type)) {
        const mesh = new THREE.Mesh(
          buildGeometry(type),
          new THREE.MeshStandardMaterial({ color: PALETTE[type], roughness: 0.7, metalness: 0.05 }),
        );
        mesh.userData.isFurniture = true;
        mesh.userData.halfHeight  = HALF_H[type];
        mesh.userData.type        = type;
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        mesh.position.set(0, 0, 0);
        scene.add(mesh);
        furniture.push(mesh);
        snapToSurface(mesh);
        setSelection(mesh);
        return;
      }

      if (WALL_TYPES.has(type)) {
        if (!selectedWall) return; // guarded in UI but safety check here too
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
        mesh.castShadow    = true;
        mesh.receiveShadow = true;

        const wallId = selectedWall;
        placeOnWall(mesh, wallId);
        scene.add(mesh);
        wallObjects.push(mesh);
        furniture.push(mesh);  // also raycasted for selection

        if (type === "window" || type === "door") {
          syncWallLocal(mesh);
          rebuildWall(wallId);
        }

        setSelection(mesh);
      }
    };

    // ---- Delete API ------------------------------------------------------
    deleteSelectedRef.current = () => {
      if (!selected) return;
      tc.detach();
      scene.remove(selected);

      const fi = furniture.indexOf(selected);
      if (fi !== -1) furniture.splice(fi, 1);

      const wi = wallObjects.indexOf(selected);
      if (wi !== -1) {
        const wallId = selected.userData.wallId as WallId;
        wallObjects.splice(wi, 1);
        if (selected.userData.type === "window" || selected.userData.type === "door") {
          rebuildWall(wallId);
        }
      }

      selected = null;
      onSelectionChange(null);
    };

    // ---- Pointer-based click selection -----------------------------------
    // Distinguish a click (barely moved) from a camera drag
    let pdX = 0, pdY = 0;
    const onPointerDown = (e: PointerEvent) => { pdX = e.clientX; pdY = e.clientY; };
    const onPointerUp   = (e: PointerEvent) => {
      if (justDragged) return;
      if (Math.hypot(e.clientX - pdX, e.clientY - pdY) > 6) return;

      const rect  = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, camera);

      // 1. Check furniture first (higher priority)
      const furnitureHits = ray.intersectObjects(furniture, false);
      if (furnitureHits.length > 0) {
        setWallSelection(null);       // clicking a furniture item clears wall selection
        setSelection(furnitureHits[0].object as THREE.Mesh);
        return;
      }

      // 2. Check visible walls
      const visibleWalls = (Object.entries(wallMeshes) as [WallId, THREE.Mesh][])
        .filter(([, m]) => m.visible)
        .map(([, m]) => m);
      const wallHits = ray.intersectObjects(visibleWalls, false);
      if (wallHits.length > 0) {
        setSelection(null);           // deselect any furniture
        const hitMesh = wallHits[0].object as THREE.Mesh;
        const hitId   = (Object.entries(wallMeshes) as [WallId, THREE.Mesh][])
          .find(([, m]) => m === hitMesh)?.[0] ?? null;
        // Toggle: clicking the same wall again deselects it
        setWallSelection(hitId === selectedWall ? null : hitId);
        return;
      }

      // 3. Click on empty space — clear both
      setSelection(null);
      setWallSelection(null);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup",   onPointerUp);

    // ---- ESC to deselect -------------------------------------------------
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelection(null); setWallSelection(null); }
    };
    window.addEventListener("keydown", onKeyDown);

    // ---- Wall hiding (Sims-style) + wall-object visibility sync ----------
    const updateWalls = () => {
      const cx = camera.position.x;
      const cz = camera.position.z;
      const vis: Record<WallId, boolean> = {
        front: cz >= 0,
        back:  cz <= 0,
        left:  cx >= 0,
        right: cx <= 0,
      };
      (Object.keys(vis) as WallId[]).forEach(id => {
        wallMeshes[id].visible = vis[id];
        wallObjects
          .filter(o => o.userData.wallId === id)
          .forEach(o => { o.visible = vis[id]; });
      });
    };

    // ---- Animation loop --------------------------------------------------
    let rafId: number;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      updateWalls();
      renderer.render(scene, camera);
    };
    animate();

    // ---- Resize observer -------------------------------------------------
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup",   onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      addObjectRef.current      = null;
      deleteSelectedRef.current = null;
      setCameraPresetRef.current = null;
      applyToolRef.current      = null;
      tc.dispose();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [size]); // only rebuild scene when room size changes

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-4 rounded-xl bg-black/50 backdrop-blur-sm px-4 py-2 text-xs text-white/60 pointer-events-none select-none">
        <span>Drag to rotate</span>
        <span className="opacity-40">·</span>
        <span>Scroll to zoom</span>
        <span className="opacity-40">·</span>
        <span>Click to select</span>
        <span className="opacity-40">·</span>
        <span>Esc to deselect</span>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

export type ObjectType    = "cube" | "sphere" | "cylinder" | "frame" | "window" | "door" | "pointLight" | "spotLight";
export type WallId        = "front" | "back" | "left" | "right";
export type ToolMode      = "translate" | "rotate";
export type CameraPreset  = "perspective" | "top" | "front" | "left" | "right";

/**
 * Convert a color temperature in Kelvin (1000–40000) to a hex color string.
 * Uses the Tanner Helland approximation algorithm.
 */
export function kelvinToHex(kelvin: number): string {
  const t = Math.min(Math.max(kelvin, 1000), 40000) / 100;
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = t <= 66 ? 255 : clamp(329.698727446 * Math.pow(t - 60, -0.1332047592));
  const g = t <= 66
    ? clamp(99.4708025861 * Math.log(t) - 161.1195681661)
    : clamp(288.1221695283 * Math.pow(t - 60, -0.0755148492));
  const b = t >= 66 ? 255 : t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export interface LightProps {
  type: "pointLight" | "spotLight";
  intensity: number;
  distance: number;
  castShadow: boolean;
  colorTemp: number;   // Kelvin, e.g. 2700 = warm white, 6500 = cool daylight
  angle?: number;      // spot only, radians
  penumbra?: number;   // spot only, 0–1
}

export interface MaterialProps {
  color:     string;   // hex, e.g. "#f0ece4"
  roughness: number;   // 0–1
  metalness: number;   // 0–1
  opacity:   number;   // 0–1
  transparent: boolean;
}

export interface TransformData {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // degrees
}

export interface SelectionInfo {
  type:      "floor" | "wall" | "furniture" | "light";
  subType?:  string;          // wallId, ObjectType, or light type
  material?: MaterialProps;
  transform?: TransformData;
  light?:    LightProps;
}

export interface MaterialPreset {
  label:     string;
  color:     string;
  roughness: number;
  metalness: number;
  opacity:   number;
  transparent: boolean;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { label: "Paint",    color: "#f0ece4", roughness: 0.7,  metalness: 0.0, opacity: 1, transparent: false },
  { label: "Concrete", color: "#8b8b8b", roughness: 0.9,  metalness: 0.0, opacity: 1, transparent: false },
  { label: "Brick",    color: "#a0522d", roughness: 0.85, metalness: 0.0, opacity: 1, transparent: false },
  { label: "Wood",     color: "#8b4513", roughness: 0.6,  metalness: 0.0, opacity: 1, transparent: false },
  { label: "Marble",   color: "#e8e0d5", roughness: 0.15, metalness: 0.05,opacity: 1, transparent: false },
  { label: "Metal",    color: "#cccccc", roughness: 0.1,  metalness: 1.0, opacity: 1, transparent: false },
  { label: "Glass",    color: "#cce8ff", roughness: 0.05, metalness: 0.0, opacity: 0.35, transparent: true },
  { label: "Ceramic",  color: "#f5f0e8", roughness: 0.25, metalness: 0.1, opacity: 1, transparent: false },
];

export interface RoomSceneProps {
  width:  number;
  depth:  number;
  tool:   ToolMode;
  addObjectRef:         React.MutableRefObject<((type: ObjectType) => void) | null>;
  deleteSelectedRef:    React.MutableRefObject<(() => void) | null>;
  deselectRef:          React.MutableRefObject<(() => void) | null>;
  setCameraPresetRef:   React.MutableRefObject<((preset: CameraPreset) => void) | null>;
  updateLightRef:       React.MutableRefObject<((props: Partial<LightProps>) => void) | null>;
  updateMaterialRef:    React.MutableRefObject<((props: Partial<MaterialProps>) => void) | null>;
  updateTransformRef:   React.MutableRefObject<((props: Partial<TransformData>) => void) | null>;
  onInspectorChange:    (info: SelectionInfo | null) => void;
  onWallSelect:         (wallId: WallId | null) => void;
  onCameraChange:       (label: string) => void;
}

const WALL_HEIGHT = 2.7;
const THICKNESS   = 0.15;

const PALETTE: Record<string, number> = {
  cube:       0x7b9e87,
  sphere:     0xb07b9e,
  cylinder:   0x7b8fb0,
  frame:      0xa67c52,
  window:     0x8ecae6,
  door:       0x6b4c35,
  pointLight: 0xffdd55,
  spotLight:  0xffaa33,
};
const HALF_H: Record<string, number> = {
  cube:     0.3,
  sphere:   0.35,
  cylinder: 0.4,
};
const WALL_OBJ_DEFS: Record<string, { w: number; h: number; defaultY: number }> = {
  frame:  { w: 0.5, h: 0.6,  defaultY: WALL_HEIGHT * 0.6 },
  window: { w: 1.0, h: 1.2,  defaultY: WALL_HEIGHT * 0.5 },
  door:   { w: 0.9, h: 2.1,  defaultY: 2.1 / 2           },
};

const FLOOR_TYPES = new Set(["cube", "sphere", "cylinder"]);
const WALL_TYPES  = new Set(["frame", "window", "door"]);
const LIGHT_TYPES = new Set(["pointLight", "spotLight"]);

function buildGeometry(type: ObjectType): THREE.BufferGeometry {
  switch (type) {
    case "cube":     return new THREE.BoxGeometry(0.6, 0.6, 0.6);
    case "sphere":   return new THREE.SphereGeometry(0.35, 32, 16);
    case "cylinder": return new THREE.CylinderGeometry(0.3, 0.3, 0.8, 32);
    default:         return new THREE.BoxGeometry(0.1, 0.1, 0.1);
  }
}

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

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

export function RoomScene({
  width,
  depth,
  tool,
  addObjectRef,
  deleteSelectedRef,
  deselectRef,
  setCameraPresetRef,
  updateLightRef,
  updateMaterialRef,
  updateTransformRef,
  onInspectorChange,
  onWallSelect,
  onCameraChange,
}: RoomSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const applyToolRef = useRef<((mode: ToolMode) => void) | null>(null);

  useEffect(() => { applyToolRef.current?.(tool); }, [tool]);

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

    // ---- Scene & camera --------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16213e);

    const span = Math.max(width, depth);
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(span * 0.9, span * 0.6, span * 0.9);

    // ---- Lighting --------------------------------------------------------
    scene.add(new THREE.HemisphereLight(0xdce8ff, 0x9e8a70, 1.2));
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.5);
    sunLight.position.set(span * 1.8, span * 2.4, span * 0.6);
    sunLight.target.position.set(0, 0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far  = span * 8;
    const sc = span * 1.5;
    sunLight.shadow.camera.left = -sc; sunLight.shadow.camera.right  =  sc;
    sunLight.shadow.camera.top  =  sc; sunLight.shadow.camera.bottom = -sc;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // ---- Room geometry ---------------------------------------------------
    const hw = width / 2;   // half-width (X axis)
    const hd = depth / 2;   // half-depth (Z axis)

    // Floor slab
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(width + THICKNESS * 2, THICKNESS, depth + THICKNESS * 2),
      new THREE.MeshStandardMaterial({ color: 0xc8b99a, roughness: 0.9, metalness: 0.0 }),
    );
    floor.position.y = -THICKNESS / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid
    const gridHelper = new THREE.GridHelper(Math.max(width, depth), Math.max(width, depth), 0x9a8a72, 0x9a8a72);
    gridHelper.position.y = 0.002;
    (gridHelper.material as THREE.Material).opacity = 0.25;
    (gridHelper.material as THREE.Material).transparent = true;
    scene.add(gridHelper);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.85 });

    // Front/back walls span plan width (X axis); left/right overlap covers corners
    const makeXWall = () =>
      new THREE.Mesh(new THREE.BoxGeometry(width, WALL_HEIGHT, THICKNESS), wallMat.clone());
    // Left/right walls span full outer depth (Z axis), extending through corners
    const makeZWall = () =>
      new THREE.Mesh(new THREE.BoxGeometry(THICKNESS, WALL_HEIGHT, depth + THICKNESS * 2), wallMat.clone());

    const frontWall = makeXWall();
    frontWall.position.set(0, WALL_HEIGHT / 2, -(hd + THICKNESS / 2));
    frontWall.castShadow = true; frontWall.receiveShadow = true;
    scene.add(frontWall);

    const backWall = makeXWall();
    backWall.position.set(0, WALL_HEIGHT / 2, hd + THICKNESS / 2);
    backWall.castShadow = true; backWall.receiveShadow = true;
    scene.add(backWall);

    const leftWall = makeZWall();
    leftWall.position.set(-(hw + THICKNESS / 2), WALL_HEIGHT / 2, 0);
    leftWall.castShadow = true; leftWall.receiveShadow = true;
    scene.add(leftWall);

    const rightWall = makeZWall();
    rightWall.position.set(hw + THICKNESS / 2, WALL_HEIGHT / 2, 0);
    rightWall.castShadow = true; rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Invisible shadow-casting ceiling (blocks sunlight like a real ceiling;
    // colorWrite/depthWrite=false makes it invisible — shadow pass uses its own
    // depth material override so the geometry still occludes light)
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
    scene.add(shadowCeiling);

    // ---- Wall mesh map ---------------------------------------------------
    type WallMeshMap = Record<WallId, THREE.Mesh>;

    // Wall selection & wireframe
    let selectedWall: WallId | null = null;
    const WALL_WIRE_COLOR = new THREE.Color(0xff8800);
    const wallWireframes: Partial<Record<WallId, THREE.LineSegments>> = {};
    let floorWireframe: THREE.LineSegments | null = null;

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
      // Clear other selection types first
      if (selectedLight) {
        detachLightHelper(selectedLight);
        (selectedLight.proxy.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
        selectedLight = null;
        tc.detach();
      }
      if (selected) {
        const mat = selected.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(EMISSIVE_NONE); mat.emissiveIntensity = 0;
        detachObjectWireframe(selected); tc.detach(); selected = null;
      }
      if (selectedFloor) {
        if (floorWireframe) { floor.remove(floorWireframe); floorWireframe.geometry.dispose(); (floorWireframe.material as THREE.Material).dispose(); floorWireframe = null; }
        selectedFloor = false;
      }
      if (selectedWall) detachWireframe(selectedWall);
      selectedWall = wallId;
      if (wallId) {
        attachWireframe(wallId);
        broadcastInspector({ type: "wall", subType: wallId, material: readMaterial(wallMeshes[wallId]) }, true);
      } else {
        broadcastInspector(null, true);
      }
      onWallSelect(wallId);
    };

    const wallMeshes: WallMeshMap = {
      front: frontWall, back: backWall, left: leftWall, right: rightWall,
    };

    // Wall inner-face info (wall local axes differ per orientation)
    const wallInfo: Record<WallId, { normal: THREE.Vector3; innerZ: number; axis: "x" | "z"; sign: 1 | -1 }> = {
      front: { normal: new THREE.Vector3(0, 0,  1), innerZ: -hd, axis: "x", sign:  1 },
      back:  { normal: new THREE.Vector3(0, 0, -1), innerZ:  hd, axis: "x", sign: -1 },
      left:  { normal: new THREE.Vector3( 1, 0, 0), innerZ: -hw, axis: "z", sign:  1 },
      right: { normal: new THREE.Vector3(-1, 0, 0), innerZ:  hw, axis: "z", sign: -1 },
    };

    const wallObjects: THREE.Mesh[] = [];

    const rebuildWall = (wallId: WallId) => {
      const isXWall = wallId === "front" || wallId === "back";
      const wallW   = isXWall ? width : depth + THICKNESS * 2;
      const wallH   = WALL_HEIGHT;
      const objs    = wallObjects.filter(o => o.userData.wallId === wallId);

      const holes = objs
        .filter(o => o.userData.type === "window" || o.userData.type === "door")
        .map(o => {
          const def    = WALL_OBJ_DEFS[o.userData.type as string];
          const localX = isXWall ? o.userData.wallLocal.x : -o.userData.wallLocal.z;
          const localY = o.position.y - WALL_HEIGHT / 2;
          return { cx: localX, cy: localY, w: def.w, h: def.h };
        });

      const oldMesh = wallMeshes[wallId];
      const geo     = buildWallWithHoles(wallW, wallH, THICKNESS, holes);
      const newMesh = new THREE.Mesh(geo, (oldMesh.material as THREE.MeshStandardMaterial).clone());
      newMesh.position.copy(oldMesh.position);
      if (!isXWall) newMesh.rotation.y = Math.PI / 2;
      newMesh.castShadow = true; newMesh.receiveShadow = true;
      newMesh.userData   = { ...oldMesh.userData, isWall: true, wallId };
      scene.remove(oldMesh);
      scene.add(newMesh);
      wallMeshes[wallId] = newMesh;

      if (selectedWall === wallId) {
        delete wallWireframes[wallId];
        attachWireframe(wallId);
      }

      objs.forEach(o => { o.visible = !newMesh.userData.simHidden; });
    };

    // ---- OrbitControls ---------------------------------------------------
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, WALL_HEIGHT * 0.3, 0);
    controls.enablePan   = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = span * 0.5;
    controls.maxDistance = span * 2.8;
    controls.minPolarAngle = Math.PI * 0.08;
    controls.maxPolarAngle = Math.PI * 0.58;
    controls.update();

    // ---- Camera preset API -----------------------------------------------
    const TARGET = new THREE.Vector3(0, WALL_HEIGHT * 0.3, 0);
    const PRESET_SNAPS: Array<{ label: string; pos: THREE.Vector3 }> = [
      { label: "Perspective", pos: new THREE.Vector3( span * 0.9,  span * 0.6,  span * 0.9) },
      { label: "Top",         pos: new THREE.Vector3( 0,           span * 2.5,  0.001)       },
      { label: "Front",       pos: new THREE.Vector3( 0,           span * 0.5,  span * 1.8)  },
      { label: "Left",        pos: new THREE.Vector3(-span * 1.8,  span * 0.5,  0)           },
      { label: "Right",       pos: new THREE.Vector3( span * 1.8,  span * 0.5,  0)           },
    ];
    let lastCameraLabel = "Perspective";

    const detectCameraLabel = () => {
      const p = camera.position;
      const threshold = span * 0.25;
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
      // Toggle ceiling shadow when jumping directly to/from Top preset
      const isTop = preset === "top";
      if (shadowCeiling.castShadow !== !isTop) {
        shadowCeiling.castShadow = !isTop;
        renderer.shadowMap.needsUpdate = true;
      }
    };

    controls.addEventListener("change", () => {
      const label = detectCameraLabel();
      if (label !== lastCameraLabel) {
        lastCameraLabel = label;
        onCameraChange(label);
        // Disable ceiling shadow in top-down view (would make floor completely dark)
        const isTop = label === "Top";
        if (shadowCeiling.castShadow !== !isTop) {
          shadowCeiling.castShadow = !isTop;
          renderer.shadowMap.needsUpdate = true;
        }
      }
    });

    onCameraChange("Perspective");

    // ---- Furniture tracking ----------------------------------------------
    const furniture: THREE.Mesh[] = [];
    let selected: THREE.Mesh | null = null;
    let selectedFloor = false;
    const EMISSIVE_SEL  = new THREE.Color(0x2255cc);
    const EMISSIVE_NONE = new THREE.Color(0x000000);

    // ---- Inspector helpers -----------------------------------------------
    const readMaterial = (mesh: THREE.Mesh): MaterialProps => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      return {
        color:       "#" + mat.color.getHexString(),
        roughness:   mat.roughness,
        metalness:   mat.metalness,
        opacity:     mat.opacity,
        transparent: mat.transparent,
      };
    };

    const readTransform = (mesh: THREE.Mesh): TransformData => ({
      position: { x: +mesh.position.x.toFixed(3), y: +mesh.position.y.toFixed(3), z: +mesh.position.z.toFixed(3) },
      rotation: {
        x: +(THREE.MathUtils.radToDeg(mesh.rotation.x)).toFixed(1),
        y: +(THREE.MathUtils.radToDeg(mesh.rotation.y)).toFixed(1),
        z: +(THREE.MathUtils.radToDeg(mesh.rotation.z)).toFixed(1),
      },
    });

    // Throttle inspector broadcasts during drag to avoid flooding React
    let lastBroadcast = 0;
    const broadcastInspector = (info: SelectionInfo | null, force = false) => {
      const now = Date.now();
      if (!force && now - lastBroadcast < 50) return; // ~20fps max
      lastBroadcast = now;
      onInspectorChange(info);
    };

    // ---- Light proxy tracking --------------------------------------------
    // Each light is represented by a small proxy mesh (for raycasting/TC) that
    // parents the actual Three.js light. Visual helper lines are shown on select.
    type LightEntry = {
      proxy: THREE.Mesh;
      light: THREE.PointLight | THREE.SpotLight;
      helperLines: THREE.LineSegments | null;
    };
    const lightEntries: LightEntry[] = [];
    let selectedLight: LightEntry | null = null;

    const LIGHT_WIRE = new THREE.LineBasicMaterial({ color: 0xffdd55, depthTest: false });

    const buildPointHelper = (distance: number): THREE.LineSegments => {
      // Wireframe sphere showing light range
      const geo = new THREE.WireframeGeometry(new THREE.SphereGeometry(distance, 16, 8));
      return new THREE.LineSegments(geo, LIGHT_WIRE.clone());
    };

    const buildSpotHelper = (distance: number, angle: number): THREE.LineSegments => {
      // Cone outline: 1 circle at the base + 4 lines from tip to rim
      const r = distance * Math.tan(angle);
      const segments = 32;
      const positions: number[] = [];
      // Rim circle
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        positions.push(Math.cos(a) * r, -distance, Math.sin(a) * r);
      }
      // 4 lines from origin to rim
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        positions.push(0, 0, 0, Math.cos(a) * r, -distance, Math.sin(a) * r);
      }
      // Line downward (axis)
      positions.push(0, 0, 0, 0, -distance, 0);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      return new THREE.LineSegments(geo, LIGHT_WIRE.clone());
    };

    const attachLightHelper = (entry: LightEntry) => {
      const ld = entry.light.userData as LightProps;
      let helper: THREE.LineSegments;
      if (ld.type === "spotLight") {
        helper = buildSpotHelper(ld.distance, ld.angle ?? Math.PI / 6);
      } else {
        helper = buildPointHelper(ld.distance);
      }
      helper.renderOrder = 10;
      entry.proxy.add(helper);
      entry.helperLines = helper;
    };

    const detachLightHelper = (entry: LightEntry) => {
      if (entry.helperLines) {
        entry.proxy.remove(entry.helperLines);
        entry.helperLines.geometry.dispose();
        (entry.helperLines.material as THREE.Material).dispose();
        entry.helperLines = null;
      }
    };

    const getLightProps = (entry: LightEntry): LightProps => {
      return { ...(entry.light.userData as LightProps) };
    };

    // ---- Surface snap ----------------------------------------------------
    const snapToSurface = (mesh: THREE.Mesh) => {
      const halfH = mesh.userData.halfHeight as number;
      const ray = new THREE.Raycaster(
        new THREE.Vector3(mesh.position.x, WALL_HEIGHT + 1, mesh.position.z),
        new THREE.Vector3(0, -1, 0),
      );
      const targets = [floor, ...furniture.filter(f => f !== mesh && !f.userData.isWallObject)];
      const hits    = ray.intersectObjects(targets, false);
      mesh.position.y = hits.length > 0 ? hits[0].point.y + halfH : halfH;
    };

    // ---- Wall-object placement ------------------------------------------
    const placeOnWall = (mesh: THREE.Mesh, wallId: WallId) => {
      const info    = wallInfo[wallId];
      const isXWall = wallId === "front" || wallId === "back";
      const def     = WALL_OBJ_DEFS[mesh.userData.type as string];
      const offset  = info.sign * (THICKNESS / 2);
      mesh.userData.wallId      = wallId;
      mesh.userData.isWallObject = true;
      if (isXWall) {
        mesh.position.set(0, def.defaultY, info.innerZ + offset);
        mesh.rotation.set(0, 0, 0);
      } else {
        mesh.position.set(info.innerZ + offset, def.defaultY, 0);
        mesh.rotation.set(0, Math.PI / 2, 0);
      }
      mesh.userData.wallLocal = { x: 0, z: 0 };
    };

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
        const wallId  = target.userData.wallId as WallId;
        const isXWall = wallId === "front" || wallId === "back";
        if (mode === "translate") {
          tc.showX = isXWall; tc.showY = true; tc.showZ = !isXWall;
        } else {
          tc.showX = false; tc.showY = true; tc.showZ = false;
        }
      } else {
        tc.showX = true; tc.showY = true; tc.showZ = true;
      }
    };

    applyTool(tool);
    applyToolRef.current = applyTool;

    let justDragged = false;
    tc.addEventListener("dragging-changed", (e) => {
      controls.enabled = !(e as unknown as { value: boolean }).value;
      if (!(e as unknown as { value: boolean }).value) {
        justDragged = true;
        Promise.resolve().then(() => { justDragged = false; });
      }
    });

    tc.addEventListener("objectChange", () => {
      // Light proxy dragged — keep spot target below proxy
      if (selectedLight) {
        if (selectedLight.light instanceof THREE.SpotLight) {
          const p = selectedLight.proxy.position;
          selectedLight.light.target.position.set(p.x, 0, p.z);
          selectedLight.light.target.updateMatrixWorld();
        }
        return;
      }
      if (!selected) return;
      if (selected.userData.isWallObject) {
        const wallId  = selected.userData.wallId as WallId;
        const isXWall = wallId === "front" || wallId === "back";
        const info    = wallInfo[wallId];
        const offset  = info.sign * THICKNESS / 2;
        if (isXWall) {
          selected.position.z = info.innerZ + offset;
        } else {
          selected.position.x = info.innerZ + offset;
        }
        const def = WALL_OBJ_DEFS[selected.userData.type as string];
        selected.position.y = Math.max(def.h / 2, Math.min(WALL_HEIGHT - def.h / 2, selected.position.y));
        syncWallLocal(selected);
        rebuildWall(wallId);
      } else if (currentTool === "translate") {
        snapToSurface(selected);
      }
      // Re-broadcast transform so inspector stays in sync (throttled)
      broadcastInspector({
        type: "furniture",
        subType: selected.userData.type as string,
        material: readMaterial(selected),
        transform: readTransform(selected),
      });
    });

    // ---- Selection + wireframe -------------------------------------------
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
      // Clear light selection
      if (selectedLight) {
        detachLightHelper(selectedLight);
        (selectedLight.proxy.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
        selectedLight = null;
      }
      // Clear floor selection
      if (selectedFloor) {
        if (floorWireframe) { floor.remove(floorWireframe); floorWireframe.geometry.dispose(); (floorWireframe.material as THREE.Material).dispose(); floorWireframe = null; }
        selectedFloor = false;
      }
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
        broadcastInspector({
          type: "furniture",
          subType: mesh.userData.type as string,
          material: readMaterial(mesh),
          transform: readTransform(mesh),
        }, true);
      } else {
        broadcastInspector(null, true);
      }
    };

    const setFloorSelection = (active: boolean) => {
      if (selectedFloor === active) return;
      // Clear other selections
      if (selectedLight) {
        detachLightHelper(selectedLight);
        (selectedLight.proxy.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
        selectedLight = null;
      }
      if (selected) {
        const mat = selected.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(EMISSIVE_NONE); mat.emissiveIntensity = 0;
        detachObjectWireframe(selected); tc.detach(); selected = null;
      }
      if (selectedWall) { detachWireframe(selectedWall); selectedWall = null; onWallSelect(null); }
      selectedFloor = active;
      if (active) {
        const edges = new THREE.EdgesGeometry(floor.geometry, 5);
        floorWireframe = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: WALL_WIRE_COLOR, depthTest: false }));
        floorWireframe.renderOrder = 10;
        floor.add(floorWireframe);
        broadcastInspector({ type: "floor", material: readMaterial(floor) }, true);
      } else {
        if (floorWireframe) { floor.remove(floorWireframe); floorWireframe.geometry.dispose(); (floorWireframe.material as THREE.Material).dispose(); floorWireframe = null; }
        broadcastInspector(null, true);
      }
    };

    const setLightSelection = (entry: LightEntry | null) => {
      if (selectedLight === entry) return;
      // Clear mesh selection
      if (selected) {
        const mat = selected.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(EMISSIVE_NONE);
        mat.emissiveIntensity = 0;
        detachObjectWireframe(selected);
        tc.detach();
        selected = null;
      }
      // Clear floor selection
      if (selectedFloor) {
        if (floorWireframe) { floor.remove(floorWireframe); floorWireframe.geometry.dispose(); (floorWireframe.material as THREE.Material).dispose(); floorWireframe = null; }
        selectedFloor = false;
      }
      // Clear previous light
      if (selectedLight) {
        detachLightHelper(selectedLight);
        (selectedLight.proxy.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
      }
      selectedLight = entry;
      if (entry) {
        attachLightHelper(entry);
        (entry.proxy.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
        tc.attach(entry.proxy);
        const lp = getLightProps(entry);
        applyTool(currentTool);
        tc.showX = true; tc.showY = true; tc.showZ = true;
        if (currentTool === "rotate" && lp.type !== "spotLight") {
          tc.showX = false; tc.showY = false; tc.showZ = false;
        }
        broadcastInspector({ type: "light", subType: lp.type, light: lp }, true);
      } else {
        tc.detach();
        broadcastInspector(null, true);
      }
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
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.position.set(0, 0, 0);
        scene.add(mesh);
        furniture.push(mesh);
        snapToSurface(mesh);
        setSelection(mesh);
        return;
      }

      if (WALL_TYPES.has(type)) {
        if (!selectedWall) return;
        const def = WALL_OBJ_DEFS[type];
        const geo = new THREE.BoxGeometry(def.w, def.h, THICKNESS);
        const mat = new THREE.MeshStandardMaterial({
          color: PALETTE[type], roughness: 0.5, metalness: 0.05,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 1;
        mesh.userData.type = type;
        mesh.castShadow = true; mesh.receiveShadow = true;
        placeOnWall(mesh, selectedWall);
        scene.add(mesh);
        wallObjects.push(mesh);
        furniture.push(mesh);
        if (type === "window" || type === "door") {
          syncWallLocal(mesh);
          rebuildWall(selectedWall);
        }
        setSelection(mesh);
        return;
      }

      if (LIGHT_TYPES.has(type) && (type === "pointLight" || type === "spotLight")) {
        const isSpot = type === "spotLight";
        // Default light props stored on userData for the inspector
        const defaultProps: LightProps = {
          type,
          intensity:  isSpot ? 3 : 2,
          distance:   isSpot ? 4 : 3,
          castShadow: true,
          colorTemp:  3000,   // halogen warm white
          ...(isSpot ? { angle: Math.PI / 6, penumbra: 0.2 } : {}),
        };

        // Proxy mesh — small octahedron the user can click and drag
        const proxyColor = kelvinToHex(defaultProps.colorTemp);
        const proxy = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.12),
          new THREE.MeshStandardMaterial({
            color: proxyColor,
            emissive: new THREE.Color(proxyColor),
            emissiveIntensity: 0.3,
            roughness: 0.3, metalness: 0.1,
          }),
        );
        proxy.userData.type    = type;
        proxy.userData.isLight = true;
        proxy.castShadow       = false;
        proxy.receiveShadow    = false;

        // Actual Three.js light, parented to proxy
        let light: THREE.PointLight | THREE.SpotLight;
        if (isSpot) {
          const sl = new THREE.SpotLight(
            kelvinToHex(defaultProps.colorTemp), defaultProps.intensity, defaultProps.distance,
            defaultProps.angle, defaultProps.penumbra,
          );
          sl.castShadow = defaultProps.castShadow;
          sl.shadow.mapSize.set(1024, 1024);
          // Spot target stays at world origin — attach target to scene
          scene.add(sl.target);
          sl.target.position.set(proxy.position.x, 0, proxy.position.z);
          light = sl;
        } else {
          const pl = new THREE.PointLight(
            kelvinToHex(defaultProps.colorTemp), defaultProps.intensity, defaultProps.distance,
          );
          pl.castShadow = defaultProps.castShadow;
          pl.shadow.mapSize.set(512, 512);
          light = pl;
        }
        light.userData = { ...defaultProps };
        proxy.add(light);

        proxy.position.set(0, WALL_HEIGHT * 0.75, 0);
        scene.add(proxy);
        furniture.push(proxy);
        lightEntries.push({ proxy, light, helperLines: null });
        setLightSelection(lightEntries[lightEntries.length - 1]);
      }
    };

    // ---- Deselect API ---------------------------------------------------
    deselectRef.current = () => {
      setSelection(null);
      setWallSelection(null);
      setLightSelection(null);
      setFloorSelection(false);
    };

    // ---- Delete API ------------------------------------------------------
    deleteSelectedRef.current = () => {
      // Delete selected light
      if (selectedLight) {
        const entry = selectedLight;
        detachLightHelper(entry);
        tc.detach();
        // Remove spot target from scene if applicable
        if ((entry.light as THREE.SpotLight).target) {
          scene.remove((entry.light as THREE.SpotLight).target);
        }
        scene.remove(entry.proxy);
        const fi = furniture.indexOf(entry.proxy);
        if (fi !== -1) furniture.splice(fi, 1);
        const li = lightEntries.indexOf(entry);
        if (li !== -1) lightEntries.splice(li, 1);
        selectedLight = null;
        broadcastInspector(null, true);
        return;
      }
      if (!selected) return;
      tc.detach();
      scene.remove(selected);
      const fi = furniture.indexOf(selected);
      if (fi !== -1) furniture.splice(fi, 1);
      const wi = wallObjects.indexOf(selected);
      if (wi !== -1) {
        const wallId = selected.userData.wallId as WallId;
        wallObjects.splice(wi, 1);
        if (selected.userData.type === "window" || selected.userData.type === "door") rebuildWall(wallId);
      }
      selected = null;
      broadcastInspector(null, true);
    };

    // ---- Update light API ------------------------------------------------
    updateLightRef.current = (props: Partial<LightProps>) => {
      if (!selectedLight) return;
      const { light, proxy } = selectedLight;
      const current = light.userData as LightProps;
      const next = { ...current, ...props };
      light.userData = next;

      if (props.colorTemp !== undefined) light.color.set(kelvinToHex(props.colorTemp));
      if (props.intensity !== undefined) light.intensity = props.intensity;
      if (props.castShadow !== undefined) light.castShadow = props.castShadow;
      if (props.distance !== undefined) {
        if (light instanceof THREE.PointLight) light.distance = props.distance;
        if (light instanceof THREE.SpotLight)  light.distance = props.distance;
      }
      if (light instanceof THREE.SpotLight) {
        if (props.angle    !== undefined) light.angle    = props.angle;
        if (props.penumbra !== undefined) light.penumbra = props.penumbra;
      }

      // Tint the proxy mesh to match the computed light color
      const hex = kelvinToHex(next.colorTemp);
      (proxy.material as THREE.MeshStandardMaterial).color.set(hex);
      (proxy.material as THREE.MeshStandardMaterial).emissive.set(hex);

      // Rebuild helper lines to reflect new distance/angle
      detachLightHelper(selectedLight);
      attachLightHelper(selectedLight);

      broadcastInspector({ type: "light", subType: next.type, light: { ...next } }, true);
    };

    // ---- Update material API ---------------------------------------------
    updateMaterialRef.current = (props: Partial<MaterialProps>) => {
      // Determine which mesh holds the material to update
      let target: THREE.Mesh | null = null;
      let infoType: SelectionInfo["type"] | null = null;
      let infoSubType: string | undefined;
      if (selected) { target = selected; infoType = "furniture"; infoSubType = selected.userData.type as string; }
      else if (selectedFloor) { target = floor; infoType = "floor"; }
      else if (selectedWall) { target = wallMeshes[selectedWall]; infoType = "wall"; infoSubType = selectedWall; }
      if (!target || !infoType) return;

      const mat = target.material as THREE.MeshStandardMaterial;
      if (props.color       !== undefined) mat.color.set(props.color);
      if (props.roughness   !== undefined) mat.roughness   = props.roughness;
      if (props.metalness   !== undefined) mat.metalness   = props.metalness;
      if (props.opacity     !== undefined) mat.opacity     = props.opacity;
      if (props.transparent !== undefined) mat.transparent = props.transparent;
      mat.needsUpdate = true;

      const newInfo: SelectionInfo = { type: infoType, subType: infoSubType, material: readMaterial(target) };
      if (selected) newInfo.transform = readTransform(selected);
      broadcastInspector(newInfo, true);
    };

    // ---- Update transform API --------------------------------------------
    updateTransformRef.current = (props: Partial<TransformData>) => {
      if (!selected) return;
      if (props.position) {
        if (props.position.x !== undefined) selected.position.x = props.position.x;
        if (props.position.y !== undefined) selected.position.y = props.position.y;
        if (props.position.z !== undefined) selected.position.z = props.position.z;
        if (!selected.userData.isWallObject) snapToSurface(selected);
        if (selected.userData.isWallObject) {
          const wallId = selected.userData.wallId as WallId;
          syncWallLocal(selected);
          rebuildWall(wallId);
        }
      }
      if (props.rotation) {
        if (props.rotation.x !== undefined) selected.rotation.x = THREE.MathUtils.degToRad(props.rotation.x);
        if (props.rotation.y !== undefined) selected.rotation.y = THREE.MathUtils.degToRad(props.rotation.y);
        if (props.rotation.z !== undefined) selected.rotation.z = THREE.MathUtils.degToRad(props.rotation.z);
      }
      broadcastInspector({
        type: "furniture",
        subType: selected.userData.type as string,
        material: readMaterial(selected),
        transform: readTransform(selected),
      }, true);
    };

    // ---- Click selection -------------------------------------------------
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

      const furnitureHits = ray.intersectObjects(furniture.filter(f => f.visible), false);
      if (furnitureHits.length > 0) {
        setWallSelection(null);
        setFloorSelection(false);
        const hitMesh = furnitureHits[0].object as THREE.Mesh;
        if (hitMesh.userData.isLight) {
          const entry = lightEntries.find(e => e.proxy === hitMesh) ?? null;
          setLightSelection(entry);
        } else {
          setLightSelection(null);
          setSelection(hitMesh);
        }
        return;
      }

      const visibleWalls = (Object.entries(wallMeshes) as [WallId, THREE.Mesh][])
        .filter(([, m]) => !m.userData.simHidden).map(([, m]) => m);
      const wallHits = ray.intersectObjects(visibleWalls, false);
      if (wallHits.length > 0) {
        setSelection(null);
        setFloorSelection(false);
        const hitMesh = wallHits[0].object as THREE.Mesh;
        const hitId   = (Object.entries(wallMeshes) as [WallId, THREE.Mesh][])
          .find(([, m]) => m === hitMesh)?.[0] ?? null;
        setWallSelection(hitId === selectedWall ? null : hitId);
        return;
      }

      // Floor hit
      const floorHits = ray.intersectObjects([floor], false);
      if (floorHits.length > 0) {
        setSelection(null);
        setWallSelection(null);
        setLightSelection(null);
        setFloorSelection(!selectedFloor);
        return;
      }

      setSelection(null);
      setWallSelection(null);
      setFloorSelection(false);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup",   onPointerUp);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelection(null); setWallSelection(null); setLightSelection(null); setFloorSelection(false); }
    };
    window.addEventListener("keydown", onKeyDown);

    // ---- Wall hide (Sims-style) ------------------------------------------
    const updateWalls = () => {
      const cx = camera.position.x;
      const cz = camera.position.z;
      const vis: Record<WallId, boolean> = {
        front: cz >= 0, back: cz <= 0, left: cx >= 0, right: cx <= 0,
      };
      (Object.keys(vis) as WallId[]).forEach(id => {
        const wall = wallMeshes[id];
        // Use colorWrite/depthWrite instead of visible=false so the wall stays in
        // the shadow pass (Three.js skips shadow casting for visible=false objects)
        const mat = wall.material as THREE.MeshStandardMaterial;
        mat.colorWrite = vis[id];
        mat.depthWrite = vis[id];
        wall.userData.simHidden = !vis[id];
        // Auto-deselect wall if it becomes hidden while selected
        if (!vis[id] && selectedWall === id) setWallSelection(null);
        wallObjects.filter(o => o.userData.wallId === id).forEach(o => {
          o.visible = vis[id];
          // If the selected object just became hidden, deselect it
          if (!vis[id] && o === selected) setSelection(null);
        });
      });
    };

    // ---- Animate ---------------------------------------------------------
    let rafId: number;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      updateWalls();
      renderer.render(scene, camera);
    };
    animate();

    // ---- Resize ----------------------------------------------------------
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
      addObjectRef.current       = null;
      deleteSelectedRef.current  = null;
      deselectRef.current        = null;
      setCameraPresetRef.current = null;
      applyToolRef.current       = null;
      updateLightRef.current     = null;
      updateMaterialRef.current  = null;
      updateTransformRef.current = null;
      tc.dispose();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [width, depth]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full" />;
}

import * as THREE from "three";

// ── Enums & literals ────────────────────────────────────────────────────────

export type ObjectType = "cube" | "sphere" | "cylinder" | "frame" | "window" | "door" | "pointLight" | "spotLight";
export type WallId = "front" | "back" | "left" | "right";
export type ToolMode = "translate" | "rotate";
export type CameraPreset = "perspective" | "top" | "front" | "left" | "right";

// ── Selection ───────────────────────────────────────────────────────────────

export type Selection =
  | { kind: "object"; mesh: THREE.Mesh }
  | { kind: "wall"; wallId: WallId; mesh: THREE.Mesh }
  | { kind: "floor"; mesh: THREE.Mesh }
  | { kind: "light"; entry: LightEntry }
  | null;

// ── Inspector ───────────────────────────────────────────────────────────────

export interface LightProps {
  type: "pointLight" | "spotLight";
  intensity: number;
  distance: number;
  castShadow: boolean;
  colorTemp: number;
  angle?: number;
  penumbra?: number;
}

export interface MaterialProps {
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
  transparent: boolean;
}

export interface TransformData {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

export interface SelectionInfo {
  type: "floor" | "wall" | "furniture" | "light";
  subType?: string;
  material?: MaterialProps;
  transform?: TransformData;
  light?: LightProps;
}

// ── Material presets ────────────────────────────────────────────────────────

export interface MaterialPreset {
  label: string;
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
  transparent: boolean;
}

// ── Light entry ─────────────────────────────────────────────────────────────

export interface LightEntry {
  proxy: THREE.Mesh;
  light: THREE.PointLight | THREE.SpotLight;
  helperLines: THREE.LineSegments | null;
}

// ── Wall info ───────────────────────────────────────────────────────────────

export interface WallInfo {
  normal: THREE.Vector3;
  innerZ: number;
  axis: "x" | "z";
  sign: 1 | -1;
}

// ── Wall object definition ──────────────────────────────────────────────────

export interface WallObjectDef {
  w: number;
  h: number;
  defaultY: number;
}

// ── Editor callbacks (from React) ───────────────────────────────────────────

export interface EditorCallbacks {
  onInspectorChange: (info: SelectionInfo | null) => void;
  onWallSelect: (wallId: WallId | null) => void;
  onCameraChange: (label: string) => void;
}

// ── Editor config ───────────────────────────────────────────────────────────

export interface EditorConfig {
  width: number;
  depth: number;
  container: HTMLDivElement;
}

// ── Scene export / render DTOs ──────────────────────────────────────────────

export interface LightExport {
  type: "pointLight" | "spotLight";
  position: { x: number; y: number; z: number };
  intensity: number;
  distance: number;
  colorTemp: number;
  castShadow: boolean;
  angle?: number;
  penumbra?: number;
}

export interface SceneMetadata {
  camera: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    fov: number;
  };
  lights: LightExport[];
  roomDimensions: { width: number; depth: number };
  hiddenWalls: WallId[];
  ceilingHeight: number;
}

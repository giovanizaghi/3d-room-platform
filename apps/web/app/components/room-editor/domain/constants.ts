import type { MaterialPreset, WallObjectDef } from "./types";

export const WALL_HEIGHT = 2.7;
export const THICKNESS = 0.15;

export const PALETTE: Record<string, number> = {
  cube: 0x7b9e87,
  sphere: 0xb07b9e,
  cylinder: 0x7b8fb0,
  frame: 0xa67c52,
  window: 0x8ecae6,
  door: 0x6b4c35,
  pointLight: 0xffdd55,
  spotLight: 0xffaa33,
};

export const HALF_H: Record<string, number> = {
  cube: 0.3,
  sphere: 0.35,
  cylinder: 0.4,
};

export const WALL_OBJ_DEFS: Record<string, WallObjectDef> = {
  frame: { w: 0.5, h: 0.6, defaultY: WALL_HEIGHT * 0.6 },
  window: { w: 1.0, h: 1.2, defaultY: WALL_HEIGHT * 0.5 },
  door: { w: 0.9, h: 2.1, defaultY: 2.1 / 2 },
};

export const FLOOR_TYPES = new Set(["cube", "sphere", "cylinder"]);
export const WALL_TYPES = new Set(["frame", "window", "door"]);
export const LIGHT_TYPES = new Set(["pointLight", "spotLight"]);

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { label: "Paint", color: "#f0ece4", roughness: 0.7, metalness: 0.0, opacity: 1, transparent: false },
  { label: "Concrete", color: "#8b8b8b", roughness: 0.9, metalness: 0.0, opacity: 1, transparent: false },
  { label: "Brick", color: "#a0522d", roughness: 0.85, metalness: 0.0, opacity: 1, transparent: false },
  { label: "Wood", color: "#8b4513", roughness: 0.6, metalness: 0.0, opacity: 1, transparent: false },
  { label: "Marble", color: "#e8e0d5", roughness: 0.15, metalness: 0.05, opacity: 1, transparent: false },
  { label: "Metal", color: "#cccccc", roughness: 0.1, metalness: 1.0, opacity: 1, transparent: false },
  { label: "Glass", color: "#cce8ff", roughness: 0.05, metalness: 0.0, opacity: 0.35, transparent: true },
  { label: "Ceramic", color: "#f5f0e8", roughness: 0.25, metalness: 0.1, opacity: 1, transparent: false },
];

"use client";

import { useEffect, useRef } from "react";
import { EditorEngine } from "./core/EditorEngine";

// ── Re-exports for backwards compatibility ──────────────────────────────────
// All types, constants, and utilities that other components import from RoomScene
export type {
  ObjectType,
  WallId,
  ToolMode,
  CameraPreset,
  LightProps,
  MaterialProps,
  TransformData,
  SelectionInfo,
  MaterialPreset,
  SceneMetadata,
  LightExport,
} from "./domain/types";
export { MATERIAL_PRESETS } from "./domain/constants";
export { kelvinToHex } from "./utils/kelvinToHex";

// Re-export the types for use in props below
import type {
  ObjectType,
  WallId,
  ToolMode,
  CameraPreset,
  LightProps,
  MaterialProps,
  TransformData,
  SelectionInfo,
  SceneMetadata,
} from "./domain/types";

// ── Props ───────────────────────────────────────────────────────────────────

export interface RoomSceneProps {
  width: number;
  depth: number;
  tool: ToolMode;
  addObjectRef: React.MutableRefObject<((type: ObjectType) => void) | null>;
  deleteSelectedRef: React.MutableRefObject<(() => void) | null>;
  deselectRef: React.MutableRefObject<(() => void) | null>;
  setCameraPresetRef: React.MutableRefObject<((preset: CameraPreset) => void) | null>;
  updateLightRef: React.MutableRefObject<((props: Partial<LightProps>) => void) | null>;
  updateMaterialRef: React.MutableRefObject<((props: Partial<MaterialProps>) => void) | null>;
  updateTransformRef: React.MutableRefObject<((props: Partial<TransformData>) => void) | null>;
  captureScreenshotRef: React.MutableRefObject<(() => string) | null>;
  exportSceneRef: React.MutableRefObject<(() => Promise<{ glb: ArrayBuffer; metadata: SceneMetadata }>) | null>;
  onInspectorChange: (info: SelectionInfo | null) => void;
  onWallSelect: (wallId: WallId | null) => void;
  onCameraChange: (label: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

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
  captureScreenshotRef,
  exportSceneRef,
  onInspectorChange,
  onWallSelect,
  onCameraChange,
}: RoomSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EditorEngine | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = new EditorEngine(
      { width, depth, container },
      { onInspectorChange, onWallSelect, onCameraChange },
    );
    engineRef.current = engine;

    // Wire imperative refs
    addObjectRef.current = (type) => engine.addObject(type);
    deleteSelectedRef.current = () => engine.deleteSelected();
    deselectRef.current = () => engine.clearSelection();
    setCameraPresetRef.current = (preset) => engine.setCameraPreset(preset);
    updateLightRef.current = (props) => engine.updateLight(props);
    updateMaterialRef.current = (props) => engine.updateMaterial(props);
    updateTransformRef.current = (props) => engine.updateTransform(props);
    captureScreenshotRef.current = () => engine.captureScreenshot();
    exportSceneRef.current = () => engine.exportScene();

    return () => {
      engine.dispose();
      engineRef.current = null;
      addObjectRef.current = null;
      deleteSelectedRef.current = null;
      deselectRef.current = null;
      setCameraPresetRef.current = null;
      updateLightRef.current = null;
      updateMaterialRef.current = null;
      updateTransformRef.current = null;
      captureScreenshotRef.current = null;
      exportSceneRef.current = null;
    };
  }, [width, depth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync tool mode reactively
  useEffect(() => {
    engineRef.current?.setTool(tool);
  }, [tool]);

  return <div ref={containerRef} className="w-full h-full" />;
}

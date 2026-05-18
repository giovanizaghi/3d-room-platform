"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { RoomScene, type ObjectType, type ToolMode, type WallId, type CameraPreset } from "./RoomScene";
import { ObjectPanel } from "./ObjectPanel";

export default function RoomsPage() {
  const [inputSize, setInputSize]   = useState(5);
  const [activeSize, setActiveSize] = useState<number | null>(null);
  const [tool, setTool]                 = useState<ToolMode>("translate");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedWall, setSelectedWall] = useState<WallId | null>(null);
  const [cameraLabel, setCameraLabel]   = useState("Perspective");

  const addObjectRef        = useRef<((type: ObjectType) => void) | null>(null);
  const deleteSelectedRef   = useRef<(() => void) | null>(null);
  const setCameraPresetRef  = useRef<((preset: CameraPreset) => void) | null>(null);

  const handleGenerate = () => {
    setActiveSize(inputSize);
  };

  return (
    <main className="min-h-screen flex flex-col p-8">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl flex flex-col gap-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-accent/20 flex items-center justify-center">
                <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                </svg>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-text-primary">My Rooms</h1>
            </div>
            <p className="text-text-secondary text-sm leading-relaxed max-w-lg">
              Define your room size in m² and generate it as an interactive 3D view.
            </p>
          </div>

          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors duration-150 mt-1"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to models
          </Link>
        </div>

        {/* Controls card */}
        <div className="flex flex-wrap items-end gap-5 rounded-2xl border border-border bg-bg-card p-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-size" className="text-xs text-text-muted font-medium uppercase tracking-wider">
              Room size
            </label>
            <div className="flex items-center gap-2">
              <input
                id="room-size"
                type="number"
                min={2}
                max={50}
                value={inputSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 2 && v <= 50) setInputSize(v);
                }}
                className="w-24 rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/60"
              />
              <span className="text-sm text-text-secondary font-mono">
                × {inputSize} m&nbsp;&nbsp;=&nbsp;&nbsp;{inputSize * inputSize} m²
              </span>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            className="ml-auto rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent/90 active:scale-95 transition-all duration-150"
          >
            {activeSize === null ? "Generate Room" : "Regenerate"}
          </button>
        </div>

        {/* Editor layout: sidebar + canvas */}
        {activeSize !== null && (
          <div
            className="flex gap-3"
            style={{ height: "calc(100vh - 300px)", minHeight: 460 }}
          >
            {/* Object panel sidebar */}
            <div className="w-36 shrink-0">
              <ObjectPanel onAdd={(type) => addObjectRef.current?.(type)} selectedWall={selectedWall} />
            </div>

            {/* Canvas area */}
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              {/* Toolbar */}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-card px-3 py-2">
                {/* Move tool */}
                <button
                  onClick={() => setTool("translate")}
                  title="Move (T)"
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                    tool === "translate"
                      ? "bg-accent text-white"
                      : "text-text-muted hover:text-text-primary hover:bg-bg-primary"
                  }`}
                >
                  {/* Arrows icon */}
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v12M2 8h12M8 2L6 4m2-2l2 2M8 14l-2-2m2 2l2-2M2 8l2-2M2 8l2 2M14 8l-2-2m2 2l-2 2"/>
                  </svg>
                  Move
                </button>

                {/* Rotate tool */}
                <button
                  onClick={() => setTool("rotate")}
                  title="Rotate (R)"
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                    tool === "rotate"
                      ? "bg-accent text-white"
                      : "text-text-muted hover:text-text-primary hover:bg-bg-primary"
                  }`}
                >
                  {/* Circular arrows icon */}
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 5A6 6 0 1 0 14 9"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h-2.5V2.5"/>
                  </svg>
                  Rotate
                </button>

                {/* Separator */}
                <div className="h-5 w-px bg-border mx-1" />

                {/* Delete — only visible when something is selected */}
                <button
                  onClick={() => deleteSelectedRef.current?.()}
                  disabled={!selectedName}
                  title="Delete selected"
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                    selectedName
                      ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      : "text-text-muted/30 cursor-not-allowed"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/>
                  </svg>
                  Delete
                </button>

                <div className="ml-auto text-xs text-text-muted/50 font-mono">
                  {activeSize}×{activeSize} m
                </div>
              </div>

              {/* 3D canvas + overlays */}
              <div className="relative flex-1 rounded-2xl border border-border overflow-hidden min-h-0">

                <RoomScene
                  size={activeSize}
                  tool={tool}
                  addObjectRef={addObjectRef}
                  deleteSelectedRef={deleteSelectedRef}
                  setCameraPresetRef={setCameraPresetRef}
                  onSelectionChange={setSelectedName}
                  onWallSelect={setSelectedWall}
                  onCameraChange={setCameraLabel}
                />

                {/* Top-left: selected object name */}
                <div className="pointer-events-none absolute top-2.5 left-3 flex items-center gap-1.5">
                  {(selectedName || selectedWall) ? (
                    <span className="rounded-lg bg-black/55 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white/90 select-none">
                      {selectedName
                        ? selectedName.charAt(0).toUpperCase() + selectedName.slice(1)
                        : `Wall: ${selectedWall}`}
                    </span>
                  ) : null}
                </div>

                {/* Top-right: camera label + preset buttons */}
                <div className="absolute top-2.5 right-3 flex items-center gap-1">
                  {/* Current view label (Blender-style) */}
                  <span className="rounded-lg bg-black/55 backdrop-blur-sm px-2.5 py-1 text-[11px] font-semibold text-white/90 select-none mr-1">
                    {cameraLabel}
                  </span>
                  <div className="w-px h-4 bg-white/20 mx-0.5" />
                  {(["perspective", "top", "front", "left", "right"] as CameraPreset[]).map((p) => {
                    const label = p === "perspective" ? "Persp" : p.charAt(0).toUpperCase() + p.slice(1);
                    const active = cameraLabel.toLowerCase() === (p === "perspective" ? "perspective" : p);
                    return (
                      <button
                        key={p}
                        onClick={() => setCameraPresetRef.current?.(p)}
                        className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors select-none ${
                          active
                            ? "bg-white/20 text-white"
                            : "bg-black/55 backdrop-blur-sm text-white/60 hover:text-white hover:bg-black/75"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {activeSize === null && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-card/40 py-24 gap-4">
            <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg className="h-8 w-8 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-secondary">No room generated yet</p>
              <p className="text-xs text-text-muted mt-1">Choose a size above and click Generate Room</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

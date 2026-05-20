"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { RoomScene, type ObjectType, type ToolMode, type WallId, type CameraPreset, type LightProps, type MaterialProps, type TransformData, type SelectionInfo, type SceneMetadata } from "../../../../components/room-editor/RoomScene";
import { Inspector } from "../../../../components/room-editor/Inspector";
import { RenderModal, type RenderPhase } from "../../../../components/room-editor/RenderModal";
import { MOCK_ROOMS } from "../../../../lib/mock-data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ---- Camera preset icon definitions -------------------------------------
const CAMERA_PRESETS: { preset: CameraPreset; label: string; icon: React.ReactNode }[] = [
  {
    preset: "perspective",
    label: "Perspective",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={1.5}>
        <rect x="6" y="6" width="8" height="8" rx="0.5"/>
        <line x1="6" y1="6" x2="2" y2="2"/><line x1="14" y1="6" x2="18" y2="2"/>
        <line x1="6" y1="14" x2="2" y2="18"/><line x1="14" y1="14" x2="18" y2="18"/>
        <rect x="1" y="1" width="4" height="4" rx="0.5" strokeWidth={1}/>
        <rect x="15" y="1" width="4" height="4" rx="0.5" strokeWidth={1}/>
        <rect x="1" y="15" width="4" height="4" rx="0.5" strokeWidth={1}/>
        <rect x="15" y="15" width="4" height="4" rx="0.5" strokeWidth={1}/>
      </svg>
    ),
  },
  {
    preset: "top",
    label: "Top",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="3" width="14" height="14" rx="1"/>
        <path d="M10 3v14M3 10h14" strokeWidth={0.75} strokeDasharray="2 1.5"/>
        <circle cx="10" cy="10" r="2" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    preset: "front",
    label: "Front",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="4" width="14" height="12" rx="1"/>
        <line x1="3" y1="13" x2="17" y2="13"/>
        <path d="M8 4v9M12 4v9" strokeWidth={0.75} strokeDasharray="2 1.5"/>
      </svg>
    ),
  },
  {
    preset: "left",
    label: "Left",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="4" width="14" height="12" rx="1"/>
        <line x1="10" y1="4" x2="10" y2="16"/>
        <path d="M3 8h14M3 13h14" strokeWidth={0.75} strokeDasharray="2 1.5"/>
        <path d="M7 10l-3-3m0 0l3 3M4 7v6" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    preset: "right",
    label: "Right",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="4" width="14" height="12" rx="1"/>
        <line x1="10" y1="4" x2="10" y2="16"/>
        <path d="M3 8h14M3 13h14" strokeWidth={0.75} strokeDasharray="2 1.5"/>
        <path d="M13 10l3-3m0 0l-3 3m3-3v6" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

// ---- Floor objects -------------------------------------------------------
const FLOOR_ITEMS: { type: ObjectType; label: string; icon: React.ReactNode }[] = [
  {
    type: "cube",
    label: "Cube",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <polygon points="16,3 29,10 29,22 16,29 3,22 3,10" fill="#7b9e87" fillOpacity={0.25} stroke="#7b9e87" strokeWidth={1.5}/>
        <polyline points="16,3 16,15 3,22" stroke="#7b9e87" strokeWidth={1.5} fill="none"/>
        <line x1="16" y1="15" x2="29" y2="22" stroke="#7b9e87" strokeWidth={1.5}/>
        <line x1="16" y1="15" x2="16" y2="29" stroke="#7b9e87" strokeWidth={1.5}/>
      </svg>
    ),
  },
  {
    type: "sphere",
    label: "Sphere",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <circle cx="16" cy="16" r="12" fill="#b07b9e" fillOpacity={0.25} stroke="#b07b9e" strokeWidth={1.5}/>
        <ellipse cx="16" cy="16" rx="12" ry="5" stroke="#b07b9e" strokeWidth={1} strokeDasharray="3 2"/>
        <line x1="16" y1="4" x2="16" y2="28" stroke="#b07b9e" strokeWidth={1} strokeDasharray="3 2"/>
      </svg>
    ),
  },
  {
    type: "cylinder",
    label: "Cylinder",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <ellipse cx="16" cy="8" rx="11" ry="4" fill="#7b8fb0" fillOpacity={0.35} stroke="#7b8fb0" strokeWidth={1.5}/>
        <rect x="5" y="8" width="22" height="16" fill="#7b8fb0" fillOpacity={0.15}/>
        <line x1="5" y1="8" x2="5" y2="24" stroke="#7b8fb0" strokeWidth={1.5}/>
        <line x1="27" y1="8" x2="27" y2="24" stroke="#7b8fb0" strokeWidth={1.5}/>
        <ellipse cx="16" cy="24" rx="11" ry="4" fill="#7b8fb0" fillOpacity={0.25} stroke="#7b8fb0" strokeWidth={1.5}/>
      </svg>
    ),
  },
];

const WALL_ITEMS: { type: ObjectType; label: string; icon: React.ReactNode }[] = [
  {
    type: "frame",
    label: "Frame",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <rect x="6" y="4" width="20" height="24" rx="2" fill="#a67c52" fillOpacity={0.2} stroke="#a67c52" strokeWidth={2}/>
        <rect x="10" y="8" width="12" height="16" rx="1" fill="#a67c52" fillOpacity={0.15} stroke="#a67c52" strokeWidth={1} strokeDasharray="3 2"/>
      </svg>
    ),
  },
  {
    type: "window",
    label: "Window",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <rect x="4" y="6" width="24" height="20" rx="2" fill="#8ecae6" fillOpacity={0.2} stroke="#8ecae6" strokeWidth={2}/>
        <line x1="16" y1="6" x2="16" y2="26" stroke="#8ecae6" strokeWidth={1.5}/>
        <line x1="4" y1="16" x2="28" y2="16" stroke="#8ecae6" strokeWidth={1.5}/>
      </svg>
    ),
  },
  {
    type: "door",
    label: "Door",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <rect x="8" y="3" width="16" height="26" rx="2" fill="#6b4c35" fillOpacity={0.2} stroke="#6b4c35" strokeWidth={2}/>
        <circle cx="21" cy="16" r="1.5" fill="#6b4c35" fillOpacity={0.8}/>
        <path d="M8 9 Q16 3 24 9" stroke="#6b4c35" strokeWidth={1} fill="none" strokeDasharray="3 2"/>
      </svg>
    ),
  },
];

const LIGHT_ITEMS: { type: ObjectType; label: string; icon: React.ReactNode }[] = [
  {
    type: "pointLight",
    label: "Point Light",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <circle cx="16" cy="16" r="4" fill="#ffdd55" fillOpacity={0.9}/>
        <circle cx="16" cy="16" r="4" stroke="#ffdd55" strokeWidth={1.5}/>
        <line x1="16" y1="4" x2="16" y2="8" stroke="#ffdd55" strokeWidth={1.5} strokeLinecap="round"/>
        <line x1="16" y1="24" x2="16" y2="28" stroke="#ffdd55" strokeWidth={1.5} strokeLinecap="round"/>
        <line x1="4" y1="16" x2="8" y2="16" stroke="#ffdd55" strokeWidth={1.5} strokeLinecap="round"/>
        <line x1="24" y1="16" x2="28" y2="16" stroke="#ffdd55" strokeWidth={1.5} strokeLinecap="round"/>
        <line x1="7.5" y1="7.5" x2="10.3" y2="10.3" stroke="#ffdd55" strokeWidth={1.5} strokeLinecap="round"/>
        <line x1="21.7" y1="21.7" x2="24.5" y2="24.5" stroke="#ffdd55" strokeWidth={1.5} strokeLinecap="round"/>
        <line x1="24.5" y1="7.5" x2="21.7" y2="10.3" stroke="#ffdd55" strokeWidth={1.5} strokeLinecap="round"/>
        <line x1="10.3" y1="21.7" x2="7.5" y2="24.5" stroke="#ffdd55" strokeWidth={1.5} strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    type: "spotLight",
    label: "Spot Light",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <circle cx="16" cy="8" r="3" fill="#ffaa33" fillOpacity={0.9} stroke="#ffaa33" strokeWidth={1.5}/>
        <path d="M10 28 L16 11 L22 28" stroke="#ffaa33" strokeWidth={1.5} strokeLinejoin="round" fill="#ffaa33" fillOpacity={0.15}/>
        <line x1="10" y1="28" x2="22" y2="28" stroke="#ffaa33" strokeWidth={1.5} strokeLinecap="round"/>
      </svg>
    ),
  },
];

// ---- Object bar section icon (for collapsed state) -----------------------
function SectionIcon({ icon, label, active, onClick, disabled, disabledLabel }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150
          ${active    ? "bg-accent/20 text-accent" : "text-white/60 hover:text-white hover:bg-white/10"}
          ${disabled  ? "opacity-35 cursor-not-allowed" : "cursor-pointer"}`}
      >
        {icon}
      </button>
      {/* Tooltip */}
      <div className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover:flex items-center">
        <span className="rounded-lg bg-gray-900 text-white text-[10px] font-medium px-2.5 py-1.5 whitespace-nowrap shadow-lg border border-white/10">
          {disabled && disabledLabel ? disabledLabel : label}
        </span>
        <div className="w-0 h-0 border-y-[5px] border-y-transparent border-l-[5px] border-l-gray-900 -mr-1" />
      </div>
    </div>
  );
}

export default function RoomEditorPage() {
  const { id, roomId } = useParams<{ id: string; roomId: string }>();
  const searchParams    = useSearchParams();

  // Resolve room from mock data or from query params (new rooms)
  const mockRoom = MOCK_ROOMS.find(r => r.id === roomId);
  const roomName = mockRoom?.name  ?? searchParams.get("name") ?? "Room";
  const width    = mockRoom?.width  ?? parseFloat(searchParams.get("w") ?? "5");
  const depth    = mockRoom?.depth  ?? parseFloat(searchParams.get("d") ?? "5");

  const [tool, setTool]           = useState<ToolMode>("translate");
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [cameraLabel, setCameraLabel]     = useState("Perspective");

  // Derived from selectionInfo for convenience
  const selectedWall = selectionInfo?.type === "wall" ? (selectionInfo.subType as WallId) : null;
  const hasSelection = selectionInfo !== null && (selectionInfo.type === "furniture" || selectionInfo.type === "light");

  // Object bar: which section flyout is open (null = closed)
  const [openSection, setOpenSection] = useState<"floor" | "wall" | "light" | null>(null);

  const addObjectRef        = useRef<((type: ObjectType) => void) | null>(null);
  const deleteSelectedRef   = useRef<(() => void) | null>(null);
  const deselectRef         = useRef<(() => void) | null>(null);
  const setCameraPresetRef  = useRef<((preset: CameraPreset) => void) | null>(null);
  const updateLightRef      = useRef<((props: Partial<LightProps>) => void) | null>(null);
  const updateMaterialRef   = useRef<((props: Partial<MaterialProps>) => void) | null>(null);
  const updateTransformRef  = useRef<((props: Partial<TransformData>) => void) | null>(null);
  const captureScreenshotRef = useRef<(() => string) | null>(null);
  const exportSceneRef       = useRef<(() => Promise<{ glb: ArrayBuffer; metadata: SceneMetadata }>) | null>(null);

  // ── Render modal state ─────────────────────────────────────────────────
  const [renderModalOpen, setRenderModalOpen]   = useState(false);
  const [renderPhase, setRenderPhase]           = useState<RenderPhase>("capturing");
  const [screenshotUrl, setScreenshotUrl]       = useState<string | null>(null);
  const [blenderImageUrl, setBlenderImageUrl]   = useState<string | null>(null);
  const [finalImageUrl, setFinalImageUrl]       = useState<string | null>(null);
  const [renderError, setRenderError]           = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const handleCloseRenderModal = useCallback(() => {
    stopPolling();
    setRenderModalOpen(false);
  }, [stopPolling]);

  const handleRender = useCallback(async () => {
    if (!captureScreenshotRef.current || !exportSceneRef.current) return;

    // Reset state
    setBlenderImageUrl(null);
    setFinalImageUrl(null);
    setRenderError(null);
    setRenderPhase("capturing");
    setRenderModalOpen(true);

    // 1. Capture screenshot for immediate preview
    const screenshot = captureScreenshotRef.current();
    setScreenshotUrl(screenshot);

    let glb: ArrayBuffer;
    let metadata: SceneMetadata;
    try {
      ({ glb, metadata } = await exportSceneRef.current());
    } catch (err) {
      setRenderPhase("error");
      setRenderError(err instanceof Error ? err.message : "Failed to export scene.");
      return;
    }

    // 2. Send to API
    setRenderPhase("rendering");
    const formData = new FormData();
    formData.append("scene", new Blob([glb], { type: "model/gltf-binary" }), "scene.glb");
    formData.append("metadata", JSON.stringify(metadata));

    let jobId: string;
    try {
      const res = await fetch(`${API_BASE}/render-scene`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      ({ jobId } = await res.json() as { jobId: string });
    } catch (err) {
      setRenderPhase("error");
      setRenderError(err instanceof Error ? err.message : "Failed to start render job.");
      return;
    }

    // 3. Poll for status
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/render-scene/${jobId}`);
        if (!res.ok) throw new Error(`Poll error ${res.status}`);
        const data = await res.json() as { status: string; error?: string };

        if (data.status === "enhancing") {
          setRenderPhase("enhancing");
          setBlenderImageUrl(`${API_BASE}/render-scene/${jobId}/image?t=${Date.now()}`);
          pollTimerRef.current = setTimeout(poll, 2000);
        } else if (data.status === "done") {
          setRenderPhase("done");
          setFinalImageUrl(`${API_BASE}/render-scene/${jobId}/image?t=${Date.now()}`);
        } else if (data.status === "error") {
          setRenderPhase("error");
          setRenderError(data.error ?? "Rendering failed.");
        } else {
          // still rendering
          pollTimerRef.current = setTimeout(poll, 2000);
        }
      } catch (err) {
        setRenderPhase("error");
        setRenderError(err instanceof Error ? err.message : "Lost connection to render server.");
      }
    };
    pollTimerRef.current = setTimeout(poll, 2000);
  }, [stopPolling]);

  // Stop polling when component unmounts
  useEffect(() => stopPolling, [stopPolling]);

  const handleAddObject = (type: ObjectType) => {
    addObjectRef.current?.(type);
    setOpenSection(null);
  };

  return (
    <div className="fixed inset-0 bg-[#16213e] overflow-hidden">

      {/* ── 3D Canvas (full screen) ────────────────────────────────────── */}
      <div className="absolute inset-0">
        <RoomScene
          width={width}
          depth={depth}
          tool={tool}
          addObjectRef={addObjectRef}
          deleteSelectedRef={deleteSelectedRef}
          deselectRef={deselectRef}
          setCameraPresetRef={setCameraPresetRef}
          updateLightRef={updateLightRef}
          updateMaterialRef={updateMaterialRef}
          updateTransformRef={updateTransformRef}
          captureScreenshotRef={captureScreenshotRef}
          exportSceneRef={exportSceneRef}
          onInspectorChange={setSelectionInfo}
          onWallSelect={() => {}}
          onCameraChange={setCameraLabel}
        />
      </div>

      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-md border-b border-white/10 z-10">
        {/* Back */}
        <Link
          href={`/projects/${id}`}
          className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-xs font-medium">Back</span>
        </Link>

        {/* Room name */}
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-white">{roomName}</span>
          <span className="text-[10px] text-white/40 font-mono">{width} × {depth} m</span>
        </div>

        {/* Camera presets — horizontal */}
        <div className="flex items-center gap-0.5">
          <span className="text-[11px] font-medium text-white/40 mr-1.5 select-none">{cameraLabel}</span>
          <div className="w-px h-3.5 bg-white/20 mr-0.5" />
          {CAMERA_PRESETS.map(({ preset, label, icon }) => {
            const isActive = cameraLabel === label;
            return (
              <div key={preset} className="relative group">
                <button
                  onClick={() => setCameraPresetRef.current?.(preset)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150
                    ${isActive ? "bg-accent text-white shadow-sm" : "text-white/60 hover:text-white hover:bg-white/10"}`}
                >
                  {icon}
                </button>
                <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover:flex flex-col items-center z-20">
                  <div className="w-0 h-0 border-x-[5px] border-x-transparent border-b-[5px] border-b-gray-900" />
                  <span className="rounded-lg bg-gray-900 text-white text-[10px] font-medium px-2.5 py-1.5 whitespace-nowrap shadow-lg border border-white/10">{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tool bar — center-left vertical ───────────────────────────── */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 px-2 py-2.5">
        {/* Move */}
        <div className="relative group">
          <button
            onClick={() => setTool("translate")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150
              ${tool === "translate" ? "bg-accent text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16M12 4L10 6m2-2l2 2M12 20l-2-2m2 2l2-2M4 12l2-2M4 12l2 2M20 12l-2-2m2 2l-2 2"/>
            </svg>
          </button>
          <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:flex items-center">
            <div className="w-0 h-0 border-y-[5px] border-y-transparent border-r-[5px] border-r-gray-900 -ml-1" />
            <span className="rounded-lg bg-gray-900 text-white text-[10px] font-medium px-2.5 py-1.5 whitespace-nowrap shadow-lg border border-white/10">Move (T)</span>
          </div>
        </div>

        {/* Rotate */}
        <div className="relative group">
          <button
            onClick={() => setTool("rotate")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150
              ${tool === "rotate" ? "bg-accent text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8A7.5 7.5 0 1 0 20 12"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 8h-2.5V5.5"/>
            </svg>
          </button>
          <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:flex items-center">
            <div className="w-0 h-0 border-y-[5px] border-y-transparent border-r-[5px] border-r-gray-900 -ml-1" />
            <span className="rounded-lg bg-gray-900 text-white text-[10px] font-medium px-2.5 py-1.5 whitespace-nowrap shadow-lg border border-white/10">Rotate (R)</span>
          </div>
        </div>

        <div className="w-6 h-px bg-white/15 my-1" />

        {/* Delete */}
        <div className="relative group">
          <button
            onClick={() => deleteSelectedRef.current?.()}
            disabled={!hasSelection}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150
              ${hasSelection ? "text-red-400 hover:bg-red-500/15 cursor-pointer" : "text-white/20 cursor-not-allowed"}`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6"/>
            </svg>
          </button>
          {hasSelection && (
            <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:flex items-center">
              <div className="w-0 h-0 border-y-[5px] border-y-transparent border-r-[5px] border-r-gray-900 -ml-1" />
              <span className="rounded-lg bg-gray-900 text-white text-[10px] font-medium px-2.5 py-1.5 whitespace-nowrap shadow-lg border border-white/10">Delete</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Object bar — right vertical ───────────────────────────────── */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 px-2 py-2.5">
        {/* Floor objects section icon */}
        <SectionIcon
          label="Floor Objects"
          active={openSection === "floor"}
          onClick={() => setOpenSection(openSection === "floor" ? null : "floor")}
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.6}>
              <rect x="3" y="10" width="18" height="11" rx="1.5"/>
              <path d="M7 10V7a5 5 0 0 1 10 0v3" strokeLinecap="round"/>
            </svg>
          }
        />

        <div className="w-6 h-px bg-white/15 my-0.5" />

        {/* Wall objects section icon */}
        <SectionIcon
          label="Wall Objects"
          active={openSection === "wall"}
          disabled={!selectedWall}
          disabledLabel="Select a wall first"
          onClick={() => !selectedWall ? undefined : setOpenSection(openSection === "wall" ? null : "wall")}
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.6}>
              <rect x="3" y="4" width="18" height="16" rx="1.5"/>
              <rect x="7" y="8" width="10" height="8" rx="1" strokeDasharray="2.5 1.5"/>
            </svg>
          }
        />

        <div className="w-6 h-px bg-white/15 my-0.5" />

        {/* Lights section icon */}
        <SectionIcon
          label="Lights"
          active={openSection === "light"}
          onClick={() => setOpenSection(openSection === "light" ? null : "light")}
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.6}>
              <circle cx="12" cy="12" r="3"/>
              <path strokeLinecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
            </svg>
          }
        />

        <div className="w-6 h-px bg-white/15 my-0.5" />

        {/* Render button */}
        <SectionIcon
          label="Render"
          active={false}
          onClick={handleRender}
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/>
            </svg>
          }
        />
      </div>

      {/* Object flyout panels */}
      {openSection === "floor" && (
        <div className="absolute right-20 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 p-2.5">
          {FLOOR_ITEMS.map(({ type, label, icon }) => (
            <button
              key={type}
              onClick={() => handleAddObject(type)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/10 transition-colors group min-w-32"
            >
              <span className="shrink-0">{icon}</span>
              <span className="text-xs font-medium text-white/80 group-hover:text-white">{label}</span>
            </button>
          ))}
        </div>
      )}

      {openSection === "wall" && selectedWall && (
        <div className="absolute right-20 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 p-2.5">
          {WALL_ITEMS.map(({ type, label, icon }) => (
            <button
              key={type}
              onClick={() => handleAddObject(type)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/10 transition-colors group min-w-32"
            >
              <span className="shrink-0">{icon}</span>
              <span className="text-xs font-medium text-white/80 group-hover:text-white">{label}</span>
            </button>
          ))}
        </div>
      )}

      {openSection === "light" && (
        <div className="absolute right-20 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 p-2.5">
          {LIGHT_ITEMS.map(({ type, label, icon }) => (
            <button
              key={type}
              onClick={() => handleAddObject(type)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/10 transition-colors group min-w-36"
            >
              <span className="shrink-0">{icon}</span>
              <span className="text-xs font-medium text-white/80 group-hover:text-white">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Inspector — draggable floating window ────────────────────── */}
      <Inspector
        info={selectionInfo}
        updateMaterialRef={updateMaterialRef}
        updateLightRef={updateLightRef}
        updateTransformRef={updateTransformRef}
        onClose={() => { deselectRef.current?.(); setSelectionInfo(null); }}
        initialPos={{ x: 16, y: 64 }}
      />



      {/* ── Bottom hints ──────────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-4 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 px-4 py-2 text-[11px] text-white/50 pointer-events-none select-none">
        <span>Drag to rotate</span>
        <span className="opacity-40">·</span>
        <span>Scroll to zoom</span>
        <span className="opacity-40">·</span>
        <span>Click to select</span>
        <span className="opacity-40">·</span>
        <span>Esc to deselect</span>
      </div>

      {/* ── Render modal ───────────────────────────────────────────────── */}
      <RenderModal
        open={renderModalOpen}
        phase={renderPhase}
        screenshotUrl={screenshotUrl}
        blenderImageUrl={blenderImageUrl}
        finalImageUrl={finalImageUrl}
        errorMessage={renderError}
        onClose={handleCloseRenderModal}
      />

    </div>
  );
}

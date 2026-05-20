"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

export type RenderPhase = "capturing" | "rendering" | "enhancing" | "done" | "error";

export interface RenderModalProps {
  open: boolean;
  phase: RenderPhase;
  screenshotUrl: string | null;
  blenderImageUrl: string | null;
  finalImageUrl: string | null;
  errorMessage?: string | null;
  onClose: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function phaseLabel(phase: RenderPhase): string {
  switch (phase) {
    case "capturing":  return "Preparing scene…";
    case "rendering":  return "Blender is rendering…";
    case "enhancing":  return "AI is enhancing…";
    case "done":       return "Render complete";
    case "error":      return "Render failed";
  }
}

function phaseDescription(phase: RenderPhase): string {
  switch (phase) {
    case "capturing":  return "Capturing scene and sending to the renderer.";
    case "rendering":  return "Blender Cycles is rendering on CPU — this takes 3–10 min.";
    case "enhancing":  return "Applying AI photorealistic enhancement.";
    case "done":       return "Your render is ready.";
    case "error":      return "Something went wrong during rendering.";
  }
}

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RenderModal({
  open,
  phase,
  screenshotUrl,
  blenderImageUrl,
  finalImageUrl,
  errorMessage,
  onClose,
}: RenderModalProps) {
  const isProcessing = phase !== "done" && phase !== "error";

  // Elapsed timer — starts fresh each time we enter a long-running phase
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase === "rendering" || phase === "enhancing") {
      setElapsed(0);
      const id = setInterval(() => setElapsed(s => s + 1), 1000);
      return () => clearInterval(id);
    }
  }, [phase]);

  const showTimer = (phase === "rendering" || phase === "enhancing") && elapsed > 0;

  // Determine which image to show — prefer the most advanced available
  const displayUrl = finalImageUrl ?? blenderImageUrl ?? screenshotUrl;

  // Close on Escape
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className="relative z-10 w-130 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl animate-slide-up overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            {/* Camera icon */}
            <div className="w-8 h-8 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-accent" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{phaseLabel(phase)}</p>
              <p className="text-[11px] text-white/50">
                {phaseDescription(phase)}
                {showTimer && <span className="ml-1.5 font-mono text-white/40">{fmtElapsed(elapsed)}</span>}
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Image area */}
        <div className="relative aspect-4/3 bg-black/60 overflow-hidden">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Render preview"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
            </div>
          )}

          {/* Animated light sweep — shown while processing */}
          {isProcessing && displayUrl && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
                animation: "render-sweep 2s linear infinite",
              }}
            />
          )}

          {/* Phase badge */}
          {isProcessing && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 px-3 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[11px] text-white/80 font-medium whitespace-nowrap">
                {phaseLabel(phase)}
              </span>
            </div>
          )}

          {/* Error overlay */}
          {phase === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-red-400" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
                </svg>
              </div>
              <p className="text-sm text-red-300 text-center px-6 max-w-xs">
                {errorMessage ?? "An error occurred during rendering."}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10">
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {(["capturing", "rendering", "enhancing", "done"] as RenderPhase[]).map((p, i) => (
              <div
                key={p}
                className={`h-1 rounded-full transition-all duration-500 ${
                  p === phase
                    ? "w-6 bg-accent"
                    : (["capturing", "rendering", "enhancing", "done"] as RenderPhase[]).indexOf(phase) > i
                      ? "w-1.5 bg-accent/60"
                      : "w-1.5 bg-white/15"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {phase === "done" && finalImageUrl && (
              <a
                href={finalImageUrl}
                download="render.png"
                className="flex items-center gap-1.5 rounded-xl bg-accent text-white text-xs font-medium px-4 py-2 hover:bg-accent/80 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                </svg>
                Download
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-xl bg-white/8 text-white/70 text-xs font-medium px-4 py-2 hover:bg-white/15 hover:text-white transition-colors"
            >
              {phase === "done" ? "Close" : "Dismiss"}
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe for the light sweep animation */}
      <style>{`
        @keyframes render-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

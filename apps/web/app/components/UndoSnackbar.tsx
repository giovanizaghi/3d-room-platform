"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRenderQueue, type SnackbarEntry } from "./RenderQueueContext";

const UNDO_WINDOW_MS = 10_000;

// ---------------------------------------------------------------------------
// Container — stacks individual snackbars
// ---------------------------------------------------------------------------

export function UndoSnackbar() {
  const { snackbars, undoDismiss, dismissSnackbar } = useRenderQueue();

  if (snackbars.length === 0) return null;

  return (
    // Mobile: bottom-left (avoids FAB which is at bottom-right)
    // sm+: bottom-center
    <div
      className="fixed bottom-6 left-4 z-60 flex flex-col-reverse gap-2 sm:left-1/2 sm:-translate-x-1/2"
      aria-live="polite"
      aria-atomic="false"
    >
      {snackbars.map((snackbar) => (
        <SnackbarItem
          key={snackbar.batchId}
          snackbar={snackbar}
          onUndo={() => undoDismiss(snackbar.batchId)}
          onDismiss={() => dismissSnackbar(snackbar.batchId)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single snackbar — countdown progress bar + undo action
// ---------------------------------------------------------------------------

function SnackbarItem({
  snackbar,
  onUndo,
  onDismiss,
}: {
  snackbar: SnackbarEntry;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const [progress, setProgress] = useState(100);
  const [exiting, setExiting] = useState(false);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number>(0);
  // Stable ref so the RAF callback never closes over a stale onDismiss
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const expire = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setExiting(true);
    setTimeout(() => onDismissRef.current(), 300);
  }, []);

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / UNDO_WINDOW_MS) * 100);
      setProgress(pct);
      if (pct <= 0) {
        expire();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [expire]);

  const handleUndo = () => {
    cancelAnimationFrame(rafRef.current);
    onUndo();
  };

  return (
    <div
      role="status"
      className="relative flex min-w-72 max-w-sm items-center gap-3 overflow-hidden rounded-xl px-4 py-3 shadow-2xl sm:min-w-80"
      style={{
        background: "rgba(22, 22, 34, 0.97)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        animation: exiting
          ? "snackbar-out 0.3s ease-in forwards"
          : "snackbar-in 0.35s cubic-bezier(0.34, 1.4, 0.64, 1) forwards",
      }}
    >
      {/* Message */}
      <span className="flex-1 text-sm text-text-secondary">{snackbar.label}</span>

      {/* Undo button */}
      <button
        onClick={handleUndo}
        className="shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 hover:text-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Undo
      </button>

      {/* Countdown progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
        <div
          className="h-full bg-accent/60"
          style={{ width: `${progress}%`, transition: "width 100ms linear" }}
        />
      </div>
    </div>
  );
}

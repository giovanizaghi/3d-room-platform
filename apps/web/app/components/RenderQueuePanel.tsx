"use client";

import { useCallback, useState } from "react";
import { useRenderQueue, type QueueEntry } from "./RenderQueueContext";
import { RenderStatus, TERMINAL_RENDER_STATUSES } from "@repo/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin-slow shrink-0 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
    </svg>
  );
}

function XCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  );
}

function AlertIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  );
}

function RetryIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Real progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/8">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(2, progress)}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single render item
// ---------------------------------------------------------------------------

function RenderItem({ item }: { item: QueueEntry }) {
  const { hydrateRender, dismissItem } = useRenderQueue();
  const [retrying, setRetrying] = useState(false);

  const isDone     = item.status === RenderStatus.done;
  const isProcessing = item.status === RenderStatus.processing;
  const isQueued   = item.status === RenderStatus.queued;
  const isFailed   = item.status === RenderStatus.failed;
  const isStalled  = item.status === RenderStatus.stalled;
  const isActive   = isQueued || isProcessing;
  const isRetryable = isFailed || isStalled;

  const timeAgo = (() => {
    const diffMs = Date.now() - new Date(item.createdAt).getTime();
    const s = Math.floor(diffMs / 1_000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  })();

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      const res = await fetch(`${API_BASE}/render/${item.id}/retry`, { method: "POST" });
      if (!res.ok) return;
      const newRender = await res.json();
      hydrateRender(newRender);
    } finally {
      setRetrying(false);
    }
  }, [item.id, hydrateRender]);

  const borderColor = isDone
    ? "rgba(16,185,129,0.25)"
    : isProcessing
    ? "rgba(59,130,246,0.25)"
    : isFailed
    ? "rgba(239,68,68,0.25)"
    : isStalled
    ? "rgba(251,146,60,0.25)"
    : "rgba(255,255,255,0.06)";

  const bgGradient = isDone
    ? "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(18,18,26,0.95) 100%)"
    : isProcessing
    ? "linear-gradient(135deg, rgba(59,130,246,0.07) 0%, rgba(18,18,26,0.95) 100%)"
    : isFailed
    ? "linear-gradient(135deg, rgba(239,68,68,0.07) 0%, rgba(18,18,26,0.95) 100%)"
    : isStalled
    ? "linear-gradient(135deg, rgba(251,146,60,0.07) 0%, rgba(18,18,26,0.95) 100%)"
    : "rgba(18,18,26,0.8)";

  const badgeColor = isDone
    ? { color: "#10b981", bg: "rgba(16,185,129,0.12)" }
    : isProcessing
    ? { color: "#60a5fa", bg: "rgba(59,130,246,0.12)" }
    : isFailed
    ? { color: "#f87171", bg: "rgba(239,68,68,0.12)" }
    : isStalled
    ? { color: "#fb923c", bg: "rgba(251,146,60,0.12)" }
    : { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };

  const iconBg = isDone
    ? "rgba(16,185,129,0.15)"
    : isProcessing
    ? "rgba(59,130,246,0.15)"
    : isFailed
    ? "rgba(239,68,68,0.15)"
    : isStalled
    ? "rgba(251,146,60,0.15)"
    : "rgba(245,158,11,0.12)";

  return (
    <div
      className="group rounded-xl border p-4 transition-all duration-300"
      style={{
        borderColor,
        background: bgGradient,
        animation: item.exiting
          ? "fade-out-up 0.45s ease-in forwards"
          : isDone
          ? "completion-flash 0.7s ease-out"
          : undefined,
      }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: iconBg }}
        >
          {isDone     && <CheckIcon   className="h-3.5 w-3.5 text-success" />}
          {isProcessing && <Spinner   className="h-3.5 w-3.5 text-accent" />}
          {isQueued   && <ClockIcon   className="h-3.5 w-3.5 text-warning" />}
          {isFailed   && <XCircleIcon className="h-3.5 w-3.5 text-danger" />}
          {isStalled  && <AlertIcon   className="h-3.5 w-3.5 text-orange-400" />}
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{item.modelName}</p>
          <p className="mt-0.5 font-mono text-[10px] text-text-muted">{item.id.slice(0, 8)}</p>
        </div>

        {/* Badge */}
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: badgeColor.color, background: badgeColor.bg }}
        >
          {item.status}
        </span>

        {/* Dismiss — only enabled for terminal items */}
        <button
          onClick={() => dismissItem(item.id)}
          disabled={isActive}
          aria-label="Dismiss render"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-white/8 hover:text-text-primary disabled:pointer-events-none disabled:opacity-0"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Progress bar for active renders */}
      {isActive && (
        <div>
          <ProgressBar progress={item.progress} />
          {item.progressLabel && (
            <div className="mt-1 flex justify-between text-[10px] text-text-muted">
              <span className="truncate">{item.progressLabel}</span>
              {item.progress > 0 && <span className="ml-2 shrink-0 font-mono">{item.progress}%</span>}
            </div>
          )}
        </div>
      )}

      {/* Error/stall details for terminal failures */}
      {isRetryable && (
        <div className="mt-2 space-y-1.5">
          {item.errorMessage && (
            <p className="text-[10px] text-text-muted opacity-80 line-clamp-2">{item.errorMessage}</p>
          )}
          {item.lastLogLine && (
            <p className="font-mono text-[9px] text-text-muted opacity-50 truncate">
              {item.lastLogLine}
            </p>
          )}
          {/* Retry button */}
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-white/8 hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {retrying ? (
              <><Spinner className="h-3 w-3" /><span>Retrying…</span></>
            ) : (
              <><RetryIcon className="h-3 w-3" /><span>Retry</span></>
            )}
          </button>
        </div>
      )}

      {/* Footer: time + lineage */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
        <span>{timeAgo}</span>
        {item.retriedFromId && (
          <span className="font-mono opacity-50">retry of {item.retriedFromId.slice(0, 6)}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function RenderQueuePanel() {
  const { isOpen, items, close, dismissAllTerminal } = useRenderQueue();

  const terminalCount = items.filter(
    (i) => !i.exiting && TERMINAL_RENDER_STATUSES.includes(i.status as RenderStatus),
  ).length;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          style={{ animation: "fade-in 0.2s ease-out" }}
          onClick={close}
        />
      )}

      {/* Drawer */}
      <aside
        className="fixed right-0 top-0 z-50 flex h-screen w-80 flex-col border-l bg-bg-primary shadow-2xl"
        style={{
          borderColor: "rgba(255,255,255,0.07)",
          willChange: "transform",
          animation: isOpen
            ? "slide-in-right 0.35s cubic-bezier(0.32, 0.72, 0, 1) forwards"
            : "slide-out-right 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards",
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2.5">
            <svg className="h-4 w-4 text-accent" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h7a1 1 0 110 2H4a1 1 0 01-1-1z" />
            </svg>
            <h2 className="text-sm font-semibold text-text-primary">Render Queue</h2>
          </div>
          <div className="flex items-center gap-1">
          {terminalCount > 0 && (
            <button
              onClick={dismissAllTerminal}
              className="rounded-md px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-white/5 hover:text-text-secondary"
            >
              Clear all
            </button>
          )}
          <button
            onClick={close}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/8 hover:text-text-primary"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {items.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/4">
                <svg className="h-6 w-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75a2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
              </div>
              <p className="text-sm text-text-muted">No renders yet</p>
              <p className="text-xs text-text-muted/60">Trigger a render from a model page</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <RenderItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div
            className="px-5 py-3 text-center"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-[10px] text-text-muted">
              Showing last {items.length} render{items.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </aside>
    </>
  );
}


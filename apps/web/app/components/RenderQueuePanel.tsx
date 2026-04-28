"use client";

import { useRenderQueue } from "./RenderQueueContext";
import { RenderStatus } from "@repo/types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin-slow shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Shimmer progress bar
function ShimmerBar() {
  return (
    <div className="relative mt-2.5 h-0.75 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className="absolute inset-y-0 w-[60%] rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.6) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.6s ease-in-out infinite",
        }}
      />
    </div>
  );
}

// Single render item row
function RenderItem({
  item,
}: {
  item: ReturnType<typeof useRenderQueue>["items"][number];
}) {
  const isDone       = item.status === RenderStatus.done;
  const isProcessing = item.status === RenderStatus.processing;
  const isPending    = item.status === RenderStatus.pending;

  const timeAgo = (() => {
    const diffMs = Date.now() - new Date(item.createdAt).getTime();
    const s = Math.floor(diffMs / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  })();

  return (
    <div
      className="rounded-xl border p-4 transition-all duration-300"
      style={{
        borderColor: isDone
          ? "rgba(16,185,129,0.25)"
          : isProcessing
          ? "rgba(59,130,246,0.25)"
          : "rgba(255,255,255,0.06)",
        background: isDone
          ? "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(18,18,26,0.95) 100%)"
          : isProcessing
          ? "linear-gradient(135deg, rgba(59,130,246,0.07) 0%, rgba(18,18,26,0.95) 100%)"
          : "rgba(18,18,26,0.8)",
        animation: isDone && !item.exiting ? "completion-flash 0.7s ease-out" : undefined,
        ...(item.exiting
          ? { animation: "fade-out-up 0.45s ease-in forwards" }
          : undefined),
      }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: isDone
              ? "rgba(16,185,129,0.15)"
              : isProcessing
              ? "rgba(59,130,246,0.15)"
              : "rgba(245,158,11,0.12)",
          }}
        >
          {isDone ? (
            <CheckIcon className="h-3.5 w-3.5 text-success" />
          ) : isProcessing ? (
            <Spinner className="h-3.5 w-3.5 text-accent" />
          ) : (
            <ClockIcon className="h-3.5 w-3.5 text-warning" />
          )}
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{item.modelName}</p>
          <p className="mt-0.5 font-mono text-[10px] text-text-muted">{item.id.slice(0, 8)}</p>
        </div>

        {/* Badge */}
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            color: isDone ? "#10b981" : isProcessing ? "#60a5fa" : "#f59e0b",
            background: isDone
              ? "rgba(16,185,129,0.12)"
              : isProcessing
              ? "rgba(59,130,246,0.12)"
              : "rgba(245,158,11,0.12)",
          }}
        >
          {item.status}
        </span>
      </div>

      {/* Shimmer progress bar for active jobs */}
      {(isPending || isProcessing) && <ShimmerBar />}

      {/* Footer */}
      <p className="mt-2 text-[10px] text-text-muted">{timeAgo}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function RenderQueuePanel() {
  const { isOpen, items, close } = useRenderQueue();

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
            {/* Queue icon */}
            <svg className="h-4 w-4 text-accent" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h7a1 1 0 110 2H4a1 1 0 01-1-1z" />
            </svg>
            <h2 className="text-sm font-semibold text-text-primary">Render Queue</h2>
          </div>

          <button
            onClick={close}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/8 hover:text-text-primary"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Items list */}
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

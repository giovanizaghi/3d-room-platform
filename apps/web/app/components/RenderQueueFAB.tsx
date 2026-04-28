"use client";

import { useRenderQueue } from "./RenderQueueContext";

export function RenderQueueFAB() {
  const { toggle, activeCount, isOpen } = useRenderQueue();

  return (
    <button
      onClick={toggle}
      aria-label="Toggle render queue"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
      style={{
        background: isOpen
          ? "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
          : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
        boxShadow: activeCount > 0
          ? "0 0 0 0 rgba(59,130,246,0.4), 0 8px 32px rgba(59,130,246,0.35)"
          : "0 8px 24px rgba(0,0,0,0.5)",
        animation: activeCount > 0 && !isOpen ? "glow-pulse 2s ease-in-out infinite" : undefined,
        border: isOpen ? "1px solid rgba(255,255,255,0.12)" : "none",
      }}
    >
      {/* Layers / queue icon */}
      <svg
        className="h-6 w-6 text-white transition-transform duration-200"
        style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        {isOpen ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        ) : (
          <>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 17l10 5 10-5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 12l10 5 10-5" />
          </>
        )}
      </svg>

      {/* Active renders badge */}
      {activeCount > 0 && (
        <span
          key={activeCount}
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            boxShadow: "0 2px 8px rgba(245,158,11,0.5)",
            animation: "badge-bounce 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {activeCount}
        </span>
      )}
    </button>
  );
}

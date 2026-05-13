"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  RenderStatus,
  ACTIVE_RENDER_STATUSES,
  TERMINAL_RENDER_STATUSES,
  type RenderQueueItem,
} from "@repo/types";

// Polling intervals (ms)
const POLL_PROCESSING_MS = 3_000;  // at least one render is processing
const POLL_QUEUED_MS     = 5_000;  // only queued renders (not yet running)
const POLL_HIDDEN_MS     = 15_000; // browser tab is in background
const DONE_LINGER_MS     = 5_000;  // how long completed items stay visible
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueueEntry extends RenderQueueItem {
  /** Drives the fade-out-up CSS animation before removal */
  exiting?: boolean;
}

interface RenderQueueContextValue {
  isOpen: boolean;
  items: QueueEntry[];
  activeCount: number;
  toggle: () => void;
  open: () => void;
  close: () => void;
  /** Returns the most recent active (queued/processing) render for a given model, if any. */
  getActiveRender: (modelId: string) => QueueEntry | undefined;
  /** Merges a known render into context state — used on page mount to hydrate from DB. */
  hydrateRender: (render: RenderQueueItem) => void;
  /** Call immediately after POST /render to show the job in the panel before the first poll. */
  addOptimistic: (partial: { id: string; modelId: string; modelName: string }) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RenderQueueContext = createContext<RenderQueueContextValue>({
  isOpen: false,
  items: [],
  activeCount: 0,
  toggle: () => {},
  open: () => {},
  close: () => {},
  getActiveRender: () => undefined,
  hydrateRender: () => {},
  addOptimistic: () => {},
});

export function useRenderQueue() {
  return useContext(RenderQueueContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function RenderQueueProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<QueueEntry[]>([]);

  // Track already-terminal IDs to detect done/failed/stalled transitions.
  const terminalRef = useRef<Set<string>>(new Set());
  // Linger timers: terminal items stay visible for DONE_LINGER_MS then animate out.
  const lingerTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDelayRef = useRef<number>(POLL_PROCESSING_MS);

  // Derived counts
  const activeCount = items.filter(
    (i) =>
      !i.exiting &&
      ACTIVE_RENDER_STATUSES.includes(i.status as RenderStatus),
  ).length;

  const hasProcessing = items.some(
    (i) => !i.exiting && i.status === RenderStatus.processing,
  );

  // ------------------------------------------------------------------
  // Schedule removal of a terminal item after a linger delay.
  // ------------------------------------------------------------------
  const scheduleLinger = useCallback((id: string) => {
    if (lingerTimers.current.has(id)) return;
    const timer = setTimeout(() => {
      setItems((cur) => cur.map((i) => (i.id === id ? { ...i, exiting: true } : i)));
      setTimeout(() => {
        setItems((cur) => cur.filter((i) => i.id !== id));
        lingerTimers.current.delete(id);
      }, 500);
    }, DONE_LINGER_MS);
    lingerTimers.current.set(id, timer);
  }, []);

  // ------------------------------------------------------------------
  // Fetch + merge latest renders from API.
  // ------------------------------------------------------------------
  const fetchRenders = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/renders`);
      if (!res.ok) return;
      const fresh: RenderQueueItem[] = await res.json();

      setItems((prev) => {
        const prevById = new Map(prev.map((i) => [i.id, i]));
        const freshById = new Map(fresh.map((i) => [i.id, i]));

        // Detect transitions to terminal status.
        fresh.forEach((f) => {
          const wasActive =
            !terminalRef.current.has(f.id) &&
            ACTIVE_RENDER_STATUSES.includes(
              prevById.get(f.id)?.status as RenderStatus,
            );

          if (TERMINAL_RENDER_STATUSES.includes(f.status as RenderStatus)) {
            if (wasActive) scheduleLinger(f.id);
            terminalRef.current.add(f.id);
          }
        });

        // Merge: keep exiting state, update everything else from fresh.
        const merged: QueueEntry[] = prev
          .filter((p) => freshById.has(p.id) || p.exiting)
          .map((p) => {
            const f = freshById.get(p.id);
            if (!f) return p;
            return { ...f, exiting: p.exiting };
          });

        // Add brand-new items not yet in local state.
        fresh.forEach((f) => {
          if (!prevById.has(f.id)) merged.push({ ...f, exiting: false });
        });

        merged.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        return merged;
      });
    } catch {
      // Silently ignore network errors — next poll will retry.
    }
  }, [scheduleLinger]);

  // ------------------------------------------------------------------
  // Adaptive polling: adjust interval based on render state + tab visibility.
  // ------------------------------------------------------------------
  const getTargetInterval = useCallback((): number => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return POLL_HIDDEN_MS;
    }
    if (hasProcessing) return POLL_PROCESSING_MS;
    if (activeCount > 0) return POLL_QUEUED_MS;
    return 0; // nothing active — stop polling
  }, [hasProcessing, activeCount]);

  const restartPoll = useCallback(
    (intervalMs: number) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      if (intervalMs > 0) {
        pollDelayRef.current = intervalMs;
        pollRef.current = setInterval(fetchRenders, intervalMs);
      }
    },
    [fetchRenders],
  );

  // Re-evaluate poll interval when active state changes.
  useEffect(() => {
    const target = isOpen || activeCount > 0 ? getTargetInterval() : 0;
    if (target !== pollDelayRef.current || (target === 0 && pollRef.current)) {
      if (target === 0) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      } else {
        restartPoll(target);
      }
    }
  }, [isOpen, activeCount, hasProcessing, getTargetInterval, restartPoll]);

  // Adjust polling when tab visibility changes.
  useEffect(() => {
    const handleVisibility = () => {
      if (activeCount > 0 || isOpen) {
        restartPoll(getTargetInterval());
        if (document.visibilityState === "visible") fetchRenders();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isOpen, activeCount, getTargetInterval, restartPoll, fetchRenders]);

  // Initial fetch on mount so the badge count is populated immediately.
  useEffect(() => {
    fetchRenders();
  }, [fetchRenders]);

  // Cleanup timers on unmount.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      lingerTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  const getActiveRender = useCallback(
    (modelId: string): QueueEntry | undefined =>
      items.find(
        (i) =>
          i.modelId === modelId &&
          !i.exiting &&
          ACTIVE_RENDER_STATUSES.includes(i.status as RenderStatus),
      ),
    [items],
  );

  const hydrateRender = useCallback((render: RenderQueueItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.id === render.id)) {
        // Update existing entry (e.g. stale data from a prior optimistic insert).
        return prev.map((i) => (i.id === render.id ? { ...render, exiting: i.exiting } : i));
      }
      return [{ ...render, exiting: false }, ...prev];
    });
  }, []);

  const addOptimistic = useCallback(
    (partial: { id: string; modelId: string; modelName: string }) => {
      setItems((prev) => {
        if (prev.some((i) => i.id === partial.id)) return prev;
        const entry: QueueEntry = {
          id: partial.id,
          status: RenderStatus.queued,
          modelId: partial.modelId,
          modelName: partial.modelName,
          imageUrl: null,
          createdAt: new Date().toISOString(),
          queuedAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
          lastHeartbeatAt: null,
          progress: 0,
          progressLabel: null,
          lastLogLine: null,
          errorMessage: null,
          attempts: 0,
          retriedFromId: null,
          exiting: false,
        };
        return [entry, ...prev];
      });
    },
    [],
  );

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const open   = useCallback(() => setIsOpen(true), []);
  const close  = useCallback(() => setIsOpen(false), []);

  return (
    <RenderQueueContext.Provider
      value={{
        isOpen,
        items,
        activeCount,
        toggle,
        open,
        close,
        getActiveRender,
        hydrateRender,
        addOptimistic,
      }}
    >
      {children}
    </RenderQueueContext.Provider>
  );
}


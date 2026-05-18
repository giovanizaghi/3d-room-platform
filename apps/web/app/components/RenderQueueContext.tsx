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
const POLL_PROCESSING_MS = 3_000;   // at least one render is processing
const POLL_QUEUED_MS     = 5_000;   // only queued renders (not yet running)
const POLL_HIDDEN_MS     = 15_000;  // browser tab is in background
const UNDO_WINDOW_MS     = 10_000;  // how long undo is available after dismiss
const EXIT_ANIM_MS       = 500;     // dismiss fade-out animation duration
const DISMISSED_LS_KEY   = "rq-dismissed";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueueEntry extends RenderQueueItem {
  exiting?: boolean;
}

export interface SnackbarEntry {
  batchId: string;
  count: number;
  label: string;
}

interface PendingBatch {
  items: QueueEntry[];
  removeTimer: ReturnType<typeof setTimeout>;
  undoTimer: ReturnType<typeof setTimeout>;
}

interface RenderQueueContextValue {
  isOpen: boolean;
  items: QueueEntry[];
  activeCount: number;
  snackbars: SnackbarEntry[];
  toggle: () => void;
  open: () => void;
  close: () => void;
  getActiveRender: (modelId: string) => QueueEntry | undefined;
  hydrateRender: (render: RenderQueueItem) => void;
  addOptimistic: (partial: { id: string; modelId: string; modelName: string }) => void;
  dismissItem: (id: string) => void;
  dismissAllTerminal: () => void;
  undoDismiss: (batchId: string) => void;
  dismissSnackbar: (batchId: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RenderQueueContext = createContext<RenderQueueContextValue>({
  isOpen: false,
  items: [],
  activeCount: 0,
  snackbars: [],
  toggle: () => {},
  open: () => {},
  close: () => {},
  getActiveRender: () => undefined,
  hydrateRender: () => {},
  addOptimistic: () => {},
  dismissItem: () => {},
  dismissAllTerminal: () => {},
  undoDismiss: () => {},
  dismissSnackbar: () => {},
});

export function useRenderQueue() {
  return useContext(RenderQueueContext);
}

// ---------------------------------------------------------------------------
// localStorage helpers — track dismissed render IDs across page reloads
// ---------------------------------------------------------------------------

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_LS_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function addDismissedIds(ids: string[]): void {
  try {
    const set = getDismissedIds();
    ids.forEach((id) => set.add(id));
    localStorage.setItem(DISMISSED_LS_KEY, JSON.stringify([...set]));
  } catch {}
}

function removeDismissedIds(ids: string[]): void {
  try {
    const set = getDismissedIds();
    ids.forEach((id) => set.delete(id));
    localStorage.setItem(DISMISSED_LS_KEY, JSON.stringify([...set]));
  } catch {}
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function RenderQueueProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<QueueEntry[]>([]);
  const [snackbars, setSnackbars] = useState<SnackbarEntry[]>([]);
  const pendingDismissals = useRef<Map<string, PendingBatch>>(new Map());

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
  // Fetch + merge latest renders from API, filtering out dismissed IDs.
  // ------------------------------------------------------------------
  const fetchRenders = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/renders`);
      if (!res.ok) return;
      const fresh: RenderQueueItem[] = await res.json();

      const dismissed = getDismissedIds();
      const visible = fresh.filter((f) => !dismissed.has(f.id));

      setItems((prev) => {
        const prevById = new Map(prev.map((i) => [i.id, i]));
        const freshById = new Map(visible.map((i) => [i.id, i]));

        // Merge: keep exiting state, update everything else from fresh.
        const merged: QueueEntry[] = prev
          .filter((p) => freshById.has(p.id) || p.exiting)
          .map((p) => {
            const f = freshById.get(p.id);
            if (!f) return p;
            return { ...f, exiting: p.exiting };
          });

        // Add brand-new items not yet in local state.
        visible.forEach((f) => {
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
  }, []);

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
      pendingDismissals.current.forEach((batch) => {
        clearTimeout(batch.removeTimer);
        clearTimeout(batch.undoTimer);
      });
    };
  }, []);

  // ------------------------------------------------------------------
  // Dismiss + undo
  // ------------------------------------------------------------------

  const dismissItems = useCallback(
    (ids: string[]) => {
      const toRemove = items.filter(
        (i) =>
          !i.exiting &&
          ids.includes(i.id) &&
          TERMINAL_RENDER_STATUSES.includes(i.status as RenderStatus),
      );
      if (toRemove.length === 0) return;

      const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const toRemoveIds = new Set(toRemove.map((i) => i.id));

      // Write to localStorage immediately so next poll filters these IDs.
      addDismissedIds([...toRemoveIds]);

      // Trigger exit animation.
      setItems((cur) =>
        cur.map((i) => (toRemoveIds.has(i.id) ? { ...i, exiting: true } : i)),
      );

      // Remove from visible state after animation completes.
      const removeTimer = setTimeout(() => {
        setItems((cur) => cur.filter((i) => !toRemoveIds.has(i.id)));
      }, EXIT_ANIM_MS);

      // After undo window expires, clean up the pending batch.
      const undoTimer = setTimeout(() => {
        pendingDismissals.current.delete(batchId);
        setSnackbars((cur) => cur.filter((s) => s.batchId !== batchId));
      }, UNDO_WINDOW_MS);

      pendingDismissals.current.set(batchId, { items: toRemove, removeTimer, undoTimer });

      const count = toRemove.length;
      setSnackbars((cur) => [
        ...cur,
        { batchId, count, label: `${count} render${count !== 1 ? "s" : ""} cleared` },
      ]);
    },
    [items],
  );

  const dismissItem = useCallback(
    (id: string) => dismissItems([id]),
    [dismissItems],
  );

  const dismissAllTerminal = useCallback(() => {
    const terminalIds = items
      .filter(
        (i) =>
          !i.exiting &&
          TERMINAL_RENDER_STATUSES.includes(i.status as RenderStatus),
      )
      .map((i) => i.id);
    dismissItems(terminalIds);
  }, [items, dismissItems]);

  const undoDismiss = useCallback((batchId: string) => {
    const batch = pendingDismissals.current.get(batchId);
    if (!batch) return;

    clearTimeout(batch.removeTimer);
    clearTimeout(batch.undoTimer);
    pendingDismissals.current.delete(batchId);

    removeDismissedIds(batch.items.map((i) => i.id));

    setItems((cur) => {
      const existingIds = new Set(cur.map((i) => i.id));
      const restored = batch.items
        .filter((i) => !existingIds.has(i.id))
        .map((i) => ({ ...i, exiting: false }));
      return [...restored, ...cur].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    });

    setSnackbars((cur) => cur.filter((s) => s.batchId !== batchId));
  }, []);

  const dismissSnackbar = useCallback((batchId: string) => {
    setSnackbars((cur) => cur.filter((s) => s.batchId !== batchId));
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
        snackbars,
        toggle,
        open,
        close,
        getActiveRender,
        hydrateRender,
        addOptimistic,
        dismissItem,
        dismissAllTerminal,
        undoDismiss,
        dismissSnackbar,
      }}
    >
      {children}
    </RenderQueueContext.Provider>
  );
}


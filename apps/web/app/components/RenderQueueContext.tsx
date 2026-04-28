"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { RenderStatus, type RenderQueueItem } from "@repo/types";

const POLL_INTERVAL_MS = 3000;
const DONE_LINGER_MS = 5000;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueueEntry extends RenderQueueItem {
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
  /** Call immediately after POST /render returns to show the job in the panel */
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

  // Track which IDs were already completed so we can detect transitions
  const completedRef = useRef<Set<string>>(new Set());
  // Timer IDs for each item's linger delay
  const lingerTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived
  const activeCount = items.filter(
    (i) => !i.exiting && (i.status === RenderStatus.pending || i.status === RenderStatus.processing)
  ).length;

  // ------------------------------------------------------------------
  // Fetch + merge latest renders from API
  // ------------------------------------------------------------------
  const fetchRenders = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/renders`);
      if (!res.ok) return;
      const fresh: RenderQueueItem[] = await res.json();

      setItems((prev) => {
        const prevById = new Map(prev.map((i) => [i.id, i]));
        const freshById = new Map(fresh.map((i) => [i.id, i]));

        // Detect newly completed items and schedule their removal
        fresh.forEach((f) => {
          const wasActive =
            !completedRef.current.has(f.id) &&
            (prevById.get(f.id)?.status === RenderStatus.pending ||
              prevById.get(f.id)?.status === RenderStatus.processing);

          if (f.status === RenderStatus.done) {
            if (wasActive && !lingerTimers.current.has(f.id)) {
              // Give DONE_LINGER_MS, then trigger exit animation, then remove
              const timer = setTimeout(() => {
                setItems((cur) =>
                  cur.map((i) => (i.id === f.id ? { ...i, exiting: true } : i))
                );
                // Remove from state after animation completes (~450ms)
                setTimeout(() => {
                  setItems((cur) => cur.filter((i) => i.id !== f.id));
                  lingerTimers.current.delete(f.id);
                }, 500);
              }, DONE_LINGER_MS);
              lingerTimers.current.set(f.id, timer);
            }
            completedRef.current.add(f.id);
          }
        });

        // Merge: preserve exiting state from prev, update status/imageUrl from fresh
        const merged: QueueEntry[] = prev
          .filter((p) => freshById.has(p.id) || p.exiting) // keep exiting items even if dropped from API
          .map((p) => {
            const f = freshById.get(p.id);
            if (!f) return p;
            return { ...f, exiting: p.exiting };
          });

        // Add items that are new from the API (not in prev)
        fresh.forEach((f) => {
          if (!prevById.has(f.id)) {
            merged.push({ ...f, exiting: false });
          }
        });

        // Sort by createdAt desc
        merged.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return merged;
      });
    } catch {
      // silently ignore network errors
    }
  }, []);

  // ------------------------------------------------------------------
  // Polling: run when panel is open OR when there are active renders
  // ------------------------------------------------------------------
  useEffect(() => {
    const shouldPoll = isOpen || activeCount > 0;

    if (shouldPoll && !pollRef.current) {
      fetchRenders(); // immediate fetch on open
      pollRef.current = setInterval(fetchRenders, POLL_INTERVAL_MS);
    } else if (!shouldPoll && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isOpen, activeCount, fetchRenders]);

  // Initial fetch on mount so the badge count is populated immediately
  useEffect(() => {
    fetchRenders();
  }, [fetchRenders]);

  // Cleanup linger timers on unmount
  useEffect(() => {
    return () => {
      lingerTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // ------------------------------------------------------------------
  // Optimistic insert: add a render immediately after triggering it
  // ------------------------------------------------------------------
  const addOptimistic = useCallback(
    (partial: { id: string; modelId: string; modelName: string }) => {
      setItems((prev) => {
        if (prev.some((i) => i.id === partial.id)) return prev;
        const entry: QueueEntry = {
          id: partial.id,
          status: RenderStatus.pending,
          modelId: partial.modelId,
          modelName: partial.modelName,
          imageUrl: null,
          createdAt: new Date().toISOString(),
          exiting: false,
        };
        return [entry, ...prev];
      });
    },
    []
  );

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const open   = useCallback(() => setIsOpen(true), []);
  const close  = useCallback(() => setIsOpen(false), []);

  return (
    <RenderQueueContext.Provider
      value={{ isOpen, items, activeCount, toggle, open, close, addOptimistic }}
    >
      {children}
    </RenderQueueContext.Provider>
  );
}

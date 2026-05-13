"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  RenderStatus,
  ACTIVE_RENDER_STATUSES,
  type Model3D,
  type RenderQueueItem,
} from "@repo/types";
import { useRenderQueue } from "../../components/RenderQueueContext";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ModelSummary = Pick<Model3D, "id" | "name" | "description"> & {
  thumbnailUrl: string | null;
  createdAt: string;
};

function Spinner() {
  return (
    <svg className="animate-spin-slow h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function StatusDot({ status }: { status: RenderStatus }) {
  const color = {
    [RenderStatus.queued]: "bg-warning",
    [RenderStatus.processing]: "bg-accent animate-pulse",
    [RenderStatus.done]: "bg-success",
    [RenderStatus.failed]: "bg-danger",
    [RenderStatus.stalled]: "bg-orange-400",
  }[status] ?? "bg-border";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(2, progress)}%` }}
      />
    </div>
  );
}

export default function ModelPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { addOptimistic, open: openQueue, hydrateRender, items } = useRenderQueue();

  const [model, setModel] = useState<ModelSummary | null>(null);
  const [aiEnhance, setAiEnhance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ID of the render we're tracking on this page (set by submit or by mount recovery).
  const [currentRenderId, setCurrentRenderId] = useState<string | null>(null);

  // Elapsed timer while rendering is in progress.
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derive the live render state from the global context.
  const currentRender: RenderQueueItem | undefined = useMemo(
    () => items.find((i) => i.id === currentRenderId),
    [items, currentRenderId],
  );

  const isActive =
    currentRender != null &&
    ACTIVE_RENDER_STATUSES.includes(currentRender.status as RenderStatus);

  // ------------------------------------------------------------------
  // Elapsed timer: runs while the render is active.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isActive) {
      if (!timerRef.current) {
        setElapsed(0);
        timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1_000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [isActive]);

  // ------------------------------------------------------------------
  // Load model metadata.
  // ------------------------------------------------------------------
  useEffect(() => {
    fetch(`${apiBase}/models/${id}`)
      .then((r) => r.json())
      .then((data: ModelSummary) => setModel(data))
      .catch(() => {});
  }, [id]);

  // ------------------------------------------------------------------
  // Refresh recovery: on mount check if there is an active render for
  // this model and hydrate it into the global context so loading state
  // persists across page refreshes.
  // ------------------------------------------------------------------
  useEffect(() => {
    const recover = async () => {
      try {
        const res = await fetch(
          `${apiBase}/models/${id}/renders?status=queued,processing&limit=1`,
        );
        if (!res.ok) return;
        const data = await res.json() as { renders: RenderQueueItem[]; total: number };
        if (data.renders.length > 0) {
          const active = data.renders[0];
          hydrateRender(active);
          setCurrentRenderId(active.id);
        }
      } catch {
        // Best-effort — non-fatal.
      }
    };
    recover();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ------------------------------------------------------------------
  // Submit a new render.
  // ------------------------------------------------------------------
  const onGenerateRender = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: id, aiEnhance }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; existingRenderId?: string };
        if (body.error === "ACTIVE_RENDER_EXISTS" && body.existingRenderId) {
          // Race condition: a render was created between check and submit.
          setCurrentRenderId(body.existingRenderId);
          openQueue();
          return;
        }
        throw new Error(body.error ?? `Render request failed (${res.status})`);
      }

      const created = await res.json() as { id: string; status: RenderStatus };
      setCurrentRenderId(created.id);
      addOptimistic({ id: created.id, modelId: id, modelName: model?.name ?? "Model" });
      openQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }, [id, aiEnhance, model, addOptimistic, openQueue]);

  // ------------------------------------------------------------------
  // Retry a failed/stalled render.
  // ------------------------------------------------------------------
  const onRetry = useCallback(async () => {
    if (!currentRenderId) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/render/${currentRenderId}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Retry failed (${res.status})`);
      }
      const newRender = await res.json() as RenderQueueItem;
      setCurrentRenderId(newRender.id);
      hydrateRender(newRender);
      openQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }, [currentRenderId, hydrateRender, openQueue]);

  // ------------------------------------------------------------------
  // Derived display state.
  // ------------------------------------------------------------------
  const hasActiveRender = currentRender != null && isActive;
  const canSubmit = !submitting && !hasActiveRender;

  const statusLabel = currentRender
    ? {
        [RenderStatus.queued]: "Waiting in queue…",
        [RenderStatus.processing]: currentRender.progressLabel ?? "Rendering…",
        [RenderStatus.done]: "Render complete",
        [RenderStatus.failed]: "Render failed",
        [RenderStatus.stalled]: "Render stalled",
      }[currentRender.status as RenderStatus] ?? currentRender.status
    : null;

  return (
    <main className="min-h-screen p-8">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-2xl animate-slide-up space-y-4">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All models
        </Link>

        <div className="rounded-2xl border border-border bg-bg-card/80 backdrop-blur-sm p-8 shadow-2xl">
          {/* Model info */}
          {model && (
            <div className="mb-6 flex items-start gap-5">
              <div className="h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-black/30 flex items-center justify-center">
                {model.thumbnailUrl ? (
                  <img
                    src={`${apiBase}${model.thumbnailUrl}`}
                    alt={model.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <svg className="h-8 w-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                )}
              </div>
              <div>
                <h1 className="text-xl font-semibold text-text-primary">{model.name}</h1>
                {model.description && (
                  <p className="mt-1 text-sm text-text-secondary">{model.description}</p>
                )}
                <p className="mt-1.5 text-xs text-text-muted font-mono">
                  Added {new Date(model.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}

          {/* AI Enhancement toggle */}
          <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-bg-card/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text-primary">AI Enhancement</p>
              <p className="text-xs text-text-muted mt-0.5">Uses EEVEE + OpenAI to improve the output</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={aiEnhance}
              onClick={() => setAiEnhance((v) => !v)}
              disabled={!canSubmit}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                aiEnhance ? "bg-accent" : "bg-border"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${
                  aiEnhance ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Generate / active render button */}
          {hasActiveRender ? (
            <div className="w-full flex items-center gap-3 rounded-xl px-6 py-3.5 text-sm font-medium bg-accent/20 text-accent-light border border-accent/30 animate-glow-pulse">
              <Spinner />
              <span className="flex-1">{statusLabel}</span>
              <span className="font-mono text-xs text-accent/60">{elapsed}s</span>
            </div>
          ) : (
            <button
              onClick={onGenerateRender}
              disabled={!canSubmit}
              className={`group relative w-full flex items-center justify-center gap-3 rounded-xl px-6 py-3.5 text-sm font-medium transition-all duration-200 cursor-pointer bg-accent text-white hover:bg-accent-light hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-accent/25 hover:shadow-accent/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:scale-100`}
            >
              {submitting ? (
                <><Spinner /><span>Submitting…</span></>
              ) : (
                <>
                  <svg className="h-4 w-4 transition-transform group-hover:rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Generate Render</span>
                </>
              )}
            </button>
          )}

          {/* Progress bar during active render */}
          {hasActiveRender && currentRender.progress > 0 && (
            <div className="mt-3 animate-fade-in">
              <ProgressBar progress={currentRender.progress} />
              <div className="mt-1 flex justify-between text-xs text-text-muted">
                <span>{currentRender.progressLabel ?? "Working…"}</span>
                <span className="font-mono">{currentRender.progress}%</span>
              </div>
            </div>
          )}

          {/* Status row */}
          {currentRender && (
            <div className="mt-6 flex items-center gap-2.5 animate-fade-in">
              <StatusDot status={currentRender.status as RenderStatus} />
              <span className="text-sm text-text-secondary">{statusLabel}</span>
              <span className="ml-auto font-mono text-xs text-text-muted">{currentRender.id.slice(0, 8)}</span>
            </div>
          )}

          {/* Rendered image */}
          {currentRender?.status === RenderStatus.done && (
            <div className="mt-6 animate-fade-in">
              <div className="rounded-xl border border-border bg-black/30 p-4 shadow-inner">
                <img
                  src={
                    currentRender.imageUrl?.startsWith("http")
                      ? currentRender.imageUrl
                      : `${apiBase}/render/${currentRender.id}/image`
                  }
                  alt="Rendered output"
                  className="w-full rounded-lg shadow-lg shadow-accent/10"
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                <span>{model?.name ?? "Model"} · 800×600</span>
                {currentRender.startedAt && currentRender.completedAt && (
                  <span className="font-mono">
                    Rendered in {Math.round(
                      (new Date(currentRender.completedAt).getTime() -
                        new Date(currentRender.startedAt).getTime()) / 1_000,
                    )}s
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Failed / stalled feedback + retry */}
          {(currentRender?.status === RenderStatus.failed ||
            currentRender?.status === RenderStatus.stalled) && (
            <div className="mt-5 animate-fade-in space-y-3">
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  currentRender.status === RenderStatus.failed
                    ? "border-danger/30 bg-danger/10 text-danger"
                    : "border-orange-400/30 bg-orange-400/10 text-orange-300"
                }`}
              >
                <p className="font-medium">
                  {currentRender.status === RenderStatus.failed ? "Render failed" : "Render stalled"}
                </p>
                {currentRender.errorMessage && (
                  <p className="mt-1 text-xs opacity-80">{currentRender.errorMessage}</p>
                )}
                {currentRender.lastLogLine && (
                  <p className="mt-1 font-mono text-xs opacity-60 truncate">
                    Last output: {currentRender.lastLogLine}
                  </p>
                )}
              </div>
              <button
                onClick={onRetry}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-bg-card/50 px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <><Spinner /><span>Retrying…</span></> : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Retry Render</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Submission error */}
          {error && (
            <div className="mt-5 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger animate-fade-in">
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}


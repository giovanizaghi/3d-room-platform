"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RenderStatus, type Model3D, type RenderJob } from "@repo/types";
import { useRenderQueue } from "../../components/RenderQueueContext";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ModelSummary = Pick<Model3D, "id" | "name" | "description"> & {
  thumbnailUrl: string | null;
  createdAt: string;
};

const LOADING_MESSAGES = [
  "Submitting render job…",
  "Rendering in Cycles engine…",
  "Blender rendering in progress…",
  "Compositing final image…",
  "Almost there, finalizing output…",
];

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
    [RenderStatus.pending]: "bg-warning",
    [RenderStatus.processing]: "bg-accent animate-pulse",
    [RenderStatus.done]: "bg-success",
  }[status];
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

export default function ModelPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { addOptimistic, open: openQueue } = useRenderQueue();

  const [model, setModel] = useState<ModelSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finalElapsed, setFinalElapsed] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/models/${id}`)
      .then((r) => r.json())
      .then((data: ModelSummary) => setModel(data))
      .catch(() => {});
  }, [id]);

  const startTimer = useCallback(() => {
    setElapsed(0);
    setFinalElapsed(null);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const loadingMessage = useMemo(() => {
    const idx = Math.min(Math.floor(elapsed / 10), LOADING_MESSAGES.length - 1);
    return LOADING_MESSAGES[idx];
  }, [elapsed]);

  async function pollStatus(renderId: string) {
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`${apiBase}/render/${renderId}`);
      if (!res.ok) throw new Error(`Status request failed with ${res.status}`);
      const data = (await res.json()) as RenderJob;
      setJob(data);
      if (data.status === RenderStatus.done) return;
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error("Timed out while waiting for render to finish");
  }

  async function onGenerateRender() {
    setLoading(true);
    setError(null);
    setJob(null);
    startTimer();

    try {
      const res = await fetch(`${apiBase}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Render request failed with ${res.status}`);
      }
      const created = (await res.json()) as { id: string; status: RenderStatus };
      setJob({ id: created.id, status: created.status, items: null, imageUrl: null, modelId: id, createdAt: new Date().toISOString() });
      // Register in global render queue immediately
      addOptimistic({ id: created.id, modelId: id, modelName: model?.name ?? "Model" });
      openQueue();
      await pollStatus(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setFinalElapsed(elapsed);
      stopTimer();
      setLoading(false);
    }
  }

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

          {/* Generate render button */}
          <button
            onClick={onGenerateRender}
            disabled={loading}
            className={`group relative w-full flex items-center justify-center gap-3 rounded-xl px-6 py-3.5 text-sm font-medium transition-all duration-200 cursor-pointer ${
              loading
                ? "bg-accent/20 text-accent-light border border-accent/30 animate-glow-pulse"
                : "bg-accent text-white hover:bg-accent-light hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-accent/25 hover:shadow-accent/40"
            } disabled:cursor-not-allowed disabled:opacity-60 disabled:scale-100`}
          >
            {loading ? (
              <><Spinner /><span>{loadingMessage}</span></>
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

          {/* Loading info */}
          {loading && (
            <div className="mt-5 flex items-center justify-between text-xs animate-fade-in">
              <span className="font-mono text-text-muted">Elapsed: {elapsed}s</span>
              <span className="text-text-muted font-mono">Estimated: ~15–30s</span>
            </div>
          )}

          {/* Status */}
          {job && (
            <div className="mt-6 flex items-center gap-2.5 animate-fade-in">
              <StatusDot status={job.status} />
              <span className="text-sm text-text-secondary">
                {job.status === RenderStatus.done
                  ? "Render complete"
                  : job.status === RenderStatus.processing
                  ? "Processing"
                  : "Pending"}
              </span>
              <span className="ml-auto font-mono text-xs text-text-muted">{job.id.slice(0, 8)}</span>
            </div>
          )}

          {/* Rendered image */}
          {job?.status === RenderStatus.done && (
            <div className="mt-6 animate-fade-in">
              <div className="rounded-xl border border-border bg-black/30 p-4 shadow-inner">
                <img
                  src={`${apiBase}/render/${job.id}/image`}
                  alt="Rendered output"
                  className="w-full rounded-lg shadow-lg shadow-accent/10"
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                <span>{model?.name ?? "Model"} · 800×600 · 32 samples</span>
                <span className="font-mono">Rendered in {finalElapsed ?? elapsed}s</span>
              </div>
            </div>
          )}

          {/* Error */}
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

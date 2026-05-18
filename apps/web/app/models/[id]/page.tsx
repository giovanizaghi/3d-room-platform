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
import { ModelViewer } from "../../components/ModelViewer";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ModelSummary = Pick<Model3D, "id" | "name" | "description"> & {
  thumbnailUrl: string | null;
  gltfReady: boolean;
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
  const [gltfConverting, setGltfConverting] = useState(false);

  // Edit model state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editBlend, setEditBlend] = useState<File | null>(null);
  const [editThumb, setEditThumb] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ID of the render we're tracking on this page (set by submit or by mount recovery).
  const [currentRenderId, setCurrentRenderId] = useState<string | null>(null);

  // Persisted completed render — survives the queue context's linger removal.
  const [completedRender, setCompletedRender] = useState<RenderQueueItem | null>(null);
  // Completed renders for this model — loaded on mount, prepended on new completions.
  const [renderHistory, setRenderHistory] = useState<RenderQueueItem[]>([]);

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
  // Capture completed render into local state so it persists after the
  // global queue context removes the item via its linger timer.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (currentRender?.status === RenderStatus.done) {
      setCompletedRender(currentRender);
      setRenderHistory((prev) =>
        prev.some((r) => r.id === currentRender.id)
          ? prev
          : [currentRender, ...prev],
      );
    }
  }, [currentRender]);

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
        // Recover any in-progress render for this model.
        const activeRes = await fetch(
          `${apiBase}/models/${id}/renders?status=queued,processing&limit=1`,
        );
        if (activeRes.ok) {
          const activeData = await activeRes.json() as { renders: RenderQueueItem[]; total: number };
          if (activeData.renders.length > 0) {
            const active = activeData.renders[0];
            hydrateRender(active);
            setCurrentRenderId(active.id);
          }
        }

        // Load render history and auto-select the most recent completed render.
        const histRes = await fetch(
          `${apiBase}/models/${id}/renders?status=done&limit=20`,
        );
        if (histRes.ok) {
          const histData = await histRes.json() as { renders: RenderQueueItem[]; total: number };
          setRenderHistory(histData.renders);
          if (histData.renders.length > 0) {
            setCompletedRender(histData.renders[0]);
          }
        }
      } catch {
        // Best-effort — non-fatal.
      }
    };
    recover();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ------------------------------------------------------------------
  // Trigger a (re-)conversion of the .blend to .glb.
  // ------------------------------------------------------------------
  const onTriggerConversion = useCallback(async () => {
    setGltfConverting(true);
    try {
      await fetch(`${apiBase}/models/${id}/convert`, { method: "POST" });
    } catch {
      // Best-effort — worker logs will surface errors.
    } finally {
      setGltfConverting(false);
    }
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
  // Open edit form — pre-fill with current model values.
  // ------------------------------------------------------------------
  const onOpenEdit = useCallback(() => {
    if (!model) return;
    setEditName(model.name);
    setEditDesc(model.description ?? "");
    setEditBlend(null);
    setEditThumb(null);
    setEditError(null);
    setEditing(true);
  }, [model]);

  // ------------------------------------------------------------------
  // Save edited model data.
  // ------------------------------------------------------------------
  const onSaveEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditError("Name is required");
      return;
    }
    setEditSaving(true);
    setEditError(null);

    try {
      const form = new FormData();
      form.append("name", editName.trim());
      form.append("description", editDesc.trim());
      if (editBlend) form.append("blendFile", editBlend);
      if (editThumb) form.append("thumbnail", editThumb);

      const res = await fetch(`${apiBase}/models/${id}`, { method: "PUT", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Update failed (${res.status})`);
      }
      const updated = await res.json() as ModelSummary;
      setModel(updated);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setEditSaving(false);
    }
  }, [id, editName, editDesc, editBlend, editThumb]);

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

        {/* 3D Viewer */}
        <div className="rounded-2xl border border-border bg-bg-card/80 backdrop-blur-sm overflow-hidden shadow-2xl">
          {model?.gltfReady ? (
            <ModelViewer glbUrl={`${apiBase}/models/${id}/gltf`} />
          ) : (
            <div className="h-72 flex flex-col items-center justify-center gap-4 bg-black/20">
              <svg className="h-12 w-12 text-text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-text-secondary">3D preview not available</p>
                <p className="text-xs text-text-muted">The GLB file hasn&apos;t been generated yet</p>
              </div>
              <button
                onClick={onTriggerConversion}
                disabled={gltfConverting}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card/60 px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {gltfConverting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Queuing…</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Generate 3D Preview</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-bg-card/80 backdrop-blur-sm p-8 shadow-2xl">
          {/* Model info / edit form */}
          {model && (
            editing ? (
              <form onSubmit={onSaveEdit} className="mb-6 space-y-4 animate-fade-in">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-medium text-text-secondary uppercase tracking-widest">Edit model</h2>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-widest">Name *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-widest">Description</label>
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Blend file */}
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-widest">.blend File</label>
                  <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${editBlend ? "border-accent bg-accent/5" : "border-border bg-black/30 hover:border-accent/40"}` }>
                    <svg className="h-4 w-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-sm text-text-secondary truncate">
                      {editBlend ? editBlend.name : "Keep current file"}
                    </span>
                    <input
                      type="file"
                      accept=".blend"
                      className="sr-only"
                      onChange={(e) => setEditBlend(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>

                {/* Thumbnail */}
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-widest">Preview Image</label>
                  <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${editThumb ? "border-accent bg-accent/5" : "border-border bg-black/30 hover:border-accent/40"}`}>
                    {!editThumb && model.thumbnailUrl ? (
                      <img
                        src={`${apiBase}${model.thumbnailUrl}`}
                        alt=""
                        className="h-6 w-6 rounded object-cover shrink-0"
                      />
                    ) : (
                      <svg className="h-4 w-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                    <span className="text-sm text-text-secondary truncate">
                      {editThumb ? editThumb.name : "Keep current image"}
                    </span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg"
                      className="sr-only"
                      onChange={(e) => setEditThumb(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>

                {editError && (
                  <p className="text-sm text-danger animate-fade-in">{editError}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={editSaving}
                    className="flex-1 flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm text-text-secondary hover:border-accent/40 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {editSaving ? <><Spinner /><span>Saving…</span></> : "Save"}
                  </button>
                </div>
              </form>
            ) : (
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-semibold text-text-primary">{model.name}</h1>
                    {model.gltfReady ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        3D ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                        Converting…
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={onOpenEdit}
                      disabled={hasActiveRender}
                      title="Edit model"
                      className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-text-muted hover:border-accent/50 hover:text-text-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </button>
                  </div>
                  {model.description && (
                    <p className="mt-1 text-sm text-text-secondary">{model.description}</p>
                  )}
                  <p className="mt-1.5 text-xs text-text-muted font-mono">
                    Added {new Date(model.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )
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

          {/* Rendered image — persisted in local state so it survives queue context linger removal */}
          {completedRender != null && (
            <div className="mt-6 animate-fade-in">
              <div className="rounded-xl border border-border bg-black/30 p-4 shadow-inner">
                <img
                  src={
                    completedRender.imageUrl?.startsWith("http")
                      ? completedRender.imageUrl
                      : `${apiBase}/render/${completedRender.id}/image`
                  }
                  alt="Rendered output"
                  className="w-full rounded-lg shadow-lg shadow-accent/10"
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                <span>{model?.name ?? "Model"} · 800×600</span>
                {completedRender.startedAt && completedRender.completedAt && (
                  <span className="font-mono">
                    Rendered in {Math.round(
                      (new Date(completedRender.completedAt).getTime() -
                        new Date(completedRender.startedAt).getTime()) / 1_000,
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

        {/* Render history */}
        {renderHistory.length >= 2 && (
          <div className="rounded-2xl border border-border bg-bg-card/80 backdrop-blur-sm p-6 shadow-2xl">
            <h2 className="mb-4 text-sm font-medium text-text-secondary">Render History</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {renderHistory.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setCompletedRender(r)}
                  className={`group relative rounded-xl overflow-hidden border transition-all duration-150 hover:scale-[1.03] hover:shadow-lg ${
                    completedRender?.id === r.id
                      ? "border-accent shadow-lg shadow-accent/20 ring-1 ring-accent/50"
                      : "border-border hover:border-accent/40"
                  }`}
                >
                  <img
                    src={
                      r.imageUrl?.startsWith("http")
                        ? r.imageUrl
                        : `${apiBase}/render/${r.id}/image`
                    }
                    alt={`Render ${r.id.slice(0, 8)}`}
                    className="aspect-4/3 w-full object-cover bg-black/30"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                    <p className="font-mono text-[10px] text-white/70 truncate">
                      {r.completedAt
                        ? new Date(r.completedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : r.id.slice(0, 8)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


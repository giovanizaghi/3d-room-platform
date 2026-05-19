"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function NewRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [name,  setName]  = useState("");
  const [w,     setW]     = useState("5");
  const [d,     setD]     = useState("4");

  const width = parseFloat(w)  || 0;
  const depth = parseFloat(d) || 0;
  const valid = name.trim() && width >= 1 && depth >= 1;

  const handleCreate = () => {
    if (!valid) return;
    // In production this will persist to DB; for now just navigate with query params
    const roomId = `r${Date.now()}`;
    router.push(`/projects/${id}/rooms/${roomId}?name=${encodeURIComponent(name.trim())}&w=${width}&d=${depth}`);
  };

  return (
    <main className="min-h-screen p-8 flex items-center justify-center">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Back */}
        <Link
          href={`/projects/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-6 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to project
        </Link>

        <div className="rounded-2xl border border-border bg-bg-card p-8 flex flex-col gap-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">New Room</h1>
            <p className="text-sm text-text-muted mt-1">Set the name and dimensions of your room.</p>
          </div>

          {/* Room name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Room Name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
              placeholder="e.g. Living Room"
              className="rounded-xl border border-border bg-bg-primary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/60 transition-colors"
            />
          </div>

          {/* Dimensions */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Dimensions</label>
            <div className="flex items-center gap-3">
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-[10px] text-text-muted text-center">Width (m)</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={0.5}
                  value={w}
                  onChange={e => setW(e.target.value)}
                  className="rounded-xl border border-border bg-bg-primary px-3.5 py-2.5 text-sm text-text-primary text-center outline-none focus:border-accent/60 transition-colors"
                />
              </div>
              <span className="text-text-muted font-bold text-lg mt-4">×</span>
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-[10px] text-text-muted text-center">Depth (m)</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={0.5}
                  value={d}
                  onChange={e => setD(e.target.value)}
                  className="rounded-xl border border-border bg-bg-primary px-3.5 py-2.5 text-sm text-text-primary text-center outline-none focus:border-accent/60 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-border bg-bg-primary p-4 flex flex-col items-center gap-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider">Preview</p>
            {/* Room outline preview */}
            <div className="relative" style={{ width: 120, height: 96 }}>
              <div
                className="absolute inset-0 border-2 border-accent/60 rounded-sm bg-accent/5"
                style={{
                  width:  Math.min(width / Math.max(width, depth) * 120, 120),
                  height: Math.min(depth / Math.max(width, depth) * 96, 96),
                  margin: "auto",
                  top: 0, left: 0, right: 0, bottom: 0,
                  position: "absolute",
                }}
              />
            </div>
            <p className="text-sm font-mono text-text-primary">
              {width > 0 && depth > 0 ? `${width} × ${depth} m` : "—"}
            </p>
          </div>

          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={!valid}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Create Room
          </button>
        </div>
      </div>
    </main>
  );
}

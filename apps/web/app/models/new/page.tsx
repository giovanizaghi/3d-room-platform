"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function Spinner() {
  return (
    <svg className="animate-spin-slow h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function NewModelPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [blendFile, setBlendFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !blendFile) {
      setError("Name and .blend file are required");
      return;
    }
    setUploading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("name", name.trim());
      if (desc.trim()) form.append("description", desc.trim());
      form.append("blendFile", blendFile);
      if (thumbFile) form.append("thumbnail", thumbFile);

      const res = await fetch(`${apiBase}/models`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Upload failed with ${res.status}`);
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-lg animate-slide-up space-y-4">
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
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center">
                <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-text-primary">Upload 3D Model</h1>
            </div>
            <p className="text-sm text-text-secondary">Add a .blend file to the platform for rendering.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-widest">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Living Room Chair"
                className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-widest">Description</label>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Blend file */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-widest">.blend File *</label>
              <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${blendFile ? "border-accent bg-accent/5" : "border-border bg-black/30 hover:border-accent/40"}`}>
                <svg className="h-4 w-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-sm text-text-secondary truncate">
                  {blendFile ? blendFile.name : "Choose .blend file"}
                </span>
                <input
                  type="file"
                  accept=".blend"
                  className="sr-only"
                  onChange={(e) => setBlendFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {/* Thumbnail */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-widest">Preview Image</label>
              <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${thumbFile ? "border-accent bg-accent/5" : "border-border bg-black/30 hover:border-accent/40"}`}>
                <svg className="h-4 w-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-text-secondary truncate">
                  {thumbFile ? thumbFile.name : "Choose image (optional)"}
                </span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  className="sr-only"
                  onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {error && (
              <p className="text-sm text-danger animate-fade-in">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <Link
                href="/"
                className="flex-1 flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm text-text-secondary hover:border-accent/40 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {uploading ? <><Spinner /><span>Uploading…</span></> : "Upload"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

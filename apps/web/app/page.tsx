"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Model3D } from "@repo/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ModelSummary = Pick<Model3D, "id" | "name" | "description"> & {
  thumbnailUrl: string | null;
  createdAt: string;
};

export default function HomePage() {
  const [models, setModels] = useState<ModelSummary[]>([]);

  useEffect(() => {
    fetch(`${apiBase}/models`)
      .then((r) => r.json())
      .then((data: ModelSummary[]) => setModels(data))
      .catch(() => {});
  }, []);

  return (
    <main className="min-h-screen p-8">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-5xl animate-slide-up">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-accent/20 flex items-center justify-center">
              <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary">3D Room Platform</h1>
          </div>
          <p className="text-text-secondary text-sm leading-relaxed max-w-lg">
            Select a model to render it with Blender Cycles, or upload a new .blend file.
          </p>
        </div>

        {/* Model grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {models.map((model) => (
            <Link
              key={model.id}
              href={`/models/${model.id}`}
              className="group rounded-2xl border border-border bg-bg-card hover:bg-bg-card-hover hover:border-accent/40 transition-all duration-200 overflow-hidden"
            >
              {/* Thumbnail */}
              <div className="aspect-square w-full bg-black/30 flex items-center justify-center overflow-hidden">
                {model.thumbnailUrl ? (
                  <img
                    src={`${apiBase}${model.thumbnailUrl}`}
                    alt={model.name}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <svg className="h-10 w-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <p className="text-sm font-medium text-text-primary truncate">{model.name}</p>
                {model.description && (
                  <p className="mt-1 text-xs text-text-muted line-clamp-2">{model.description}</p>
                )}
                <p className="mt-2 text-xs text-text-muted font-mono">
                  {new Date(model.createdAt).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}

          {/* Add new model card */}
          <Link
            href="/models/new"
            className="group rounded-2xl border border-dashed border-border hover:border-accent/60 bg-bg-card hover:bg-bg-card-hover transition-all duration-200 flex flex-col items-center justify-center aspect-square sm:aspect-auto min-h-[200px]"
          >
            <div className="h-12 w-12 rounded-full border border-border group-hover:border-accent/60 flex items-center justify-center transition-colors duration-200 mb-3">
              <svg className="h-6 w-6 text-text-muted group-hover:text-accent transition-colors duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="text-sm text-text-muted group-hover:text-text-secondary transition-colors duration-200">Add model</p>
          </Link>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { RoomScene } from "./RoomScene";

export default function RoomsPage() {
  const [inputSize, setInputSize] = useState(5);
  const [activeSize, setActiveSize] = useState<number | null>(null);

  const handleGenerate = () => {
    setActiveSize(inputSize);
  };

  return (
    <main className="min-h-screen flex flex-col p-8">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl flex flex-col gap-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-accent/20 flex items-center justify-center">
                <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                </svg>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-text-primary">My Rooms</h1>
            </div>
            <p className="text-text-secondary text-sm leading-relaxed max-w-lg">
              Define your room size in m² and generate it as an interactive 3D view.
            </p>
          </div>

          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors duration-150 mt-1"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to models
          </Link>
        </div>

        {/* Controls card */}
        <div className="flex flex-wrap items-end gap-5 rounded-2xl border border-border bg-bg-card p-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-size" className="text-xs text-text-muted font-medium uppercase tracking-wider">
              Room size
            </label>
            <div className="flex items-center gap-2">
              <input
                id="room-size"
                type="number"
                min={2}
                max={50}
                value={inputSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 2 && v <= 50) setInputSize(v);
                }}
                className="w-24 rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/60"
              />
              <span className="text-sm text-text-secondary font-mono">
                × {inputSize} m&nbsp;&nbsp;=&nbsp;&nbsp;{inputSize * inputSize} m²
              </span>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            className="ml-auto rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent/90 active:scale-95 transition-all duration-150"
          >
            {activeSize === null ? "Generate Room" : "Regenerate"}
          </button>
        </div>

        {/* 3D canvas */}
        {activeSize !== null && (
          <div
            className="rounded-2xl border border-border overflow-hidden"
            style={{ height: "calc(100vh - 340px)", minHeight: 420 }}
          >
            <RoomScene size={activeSize} />
          </div>
        )}

        {/* Empty state */}
        {activeSize === null && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-card/40 py-24 gap-4">
            <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg className="h-8 w-8 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-secondary">No room generated yet</p>
              <p className="text-xs text-text-muted mt-1">Choose a size above and click Generate Room</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

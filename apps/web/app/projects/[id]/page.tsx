"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MOCK_PROJECTS, MOCK_ROOMS, type Room } from "../../lib/mock-data";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const project = MOCK_PROJECTS.find(p => p.id === id);
  const [rooms, setRooms] = useState<Room[]>(MOCK_ROOMS.filter(r => r.projectId === id));

  if (!project) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-muted mb-4">Project not found</p>
          <Link href="/projects" className="text-accent text-sm hover:underline">Back to projects</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-5xl animate-slide-up">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/projects" className="h-9 w-9 rounded-lg border border-border bg-bg-card hover:bg-bg-card-hover flex items-center justify-center transition-colors">
              <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
              <p className="text-sm text-text-muted">{rooms.length} room{rooms.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          <Link
            href={`/projects/${id}/rooms/new`}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Room
          </Link>
        </div>

        {/* Room grid */}
        {rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-card/40 py-24 gap-4">
            <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg className="h-8 w-8 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
              </svg>
            </div>
            <p className="text-text-muted text-sm">No rooms yet — create one above</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map(room => (
              <Link
                key={room.id}
                href={`/projects/${id}/rooms/${room.id}`}
                className="group rounded-2xl border border-border bg-bg-card hover:bg-bg-card-hover hover:border-accent/40 transition-all duration-200 p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  {/* Room thumbnail placeholder */}
                  <div className="h-16 w-full rounded-xl bg-[#16213e] flex items-center justify-center mb-1">
                    <svg className="h-8 w-8 text-accent/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="font-semibold text-text-primary group-hover:text-accent transition-colors">{room.name}</h2>
                    <p className="text-xs text-text-muted font-mono mt-0.5">{room.width} × {room.depth} m</p>
                  </div>
                  <svg className="h-4 w-4 text-text-muted group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

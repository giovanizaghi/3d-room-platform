"use client";

import { useState } from "react";
import Link from "next/link";
import { MOCK_PROJECTS, MOCK_ROOMS, type Project } from "../lib/mock-data";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    setProjects(prev => [...prev, { id: `p${Date.now()}`, name }]);
    setNewName("");
    setCreating(false);
  };

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
            <Link href="/" className="h-9 w-9 rounded-lg border border-border bg-bg-card hover:bg-bg-card-hover flex items-center justify-center transition-colors">
              <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">My Projects</h1>
              <p className="text-sm text-text-muted">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>

        {/* New project inline form */}
        {creating && (
          <div className="mb-6 flex items-center gap-2 rounded-2xl border border-accent/40 bg-bg-card p-4">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
              placeholder="Project name…"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 hover:bg-accent/80 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Project grid */}
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-card/40 py-24 gap-4">
            <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg className="h-8 w-8 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </div>
            <p className="text-text-muted text-sm">No projects yet — create one above</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(project => {
              const roomCount = MOCK_ROOMS.filter(r => r.projectId === project.id).length;
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group rounded-2xl border border-border bg-bg-card hover:bg-bg-card-hover hover:border-accent/40 transition-all duration-200 p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center group-hover:bg-accent/25 transition-colors">
                      <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                      </svg>
                    </div>
                    <svg className="h-4 w-4 text-text-muted group-hover:text-accent transition-colors mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-semibold text-text-primary group-hover:text-accent transition-colors">{project.name}</h2>
                    <p className="text-xs text-text-muted mt-0.5">{roomCount} room{roomCount !== 1 ? "s" : ""}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

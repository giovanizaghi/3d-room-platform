"use client";

import { useMemo, useState } from "react";
import { RenderStatus, type RenderJob } from "@repo/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = useMemo(() => {
    if (!job) return "No job started yet";
    return `Status: ${job.status}`;
  }, [job]);

  async function pollStatus(renderId: string) {
    const maxAttempts = 30;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(`${apiBase}/render/${renderId}`);

      if (!response.ok) {
        throw new Error(`Status request failed with ${response.status}`);
      }

      const data = (await response.json()) as RenderJob;
      setJob(data);

      if (data.status === RenderStatus.done) {
        console.log("[render] image URL:", `${apiBase}/render/${renderId}/image`);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    throw new Error("Timed out while waiting for render to finish");
  }

  async function onGenerateRoom() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { sku: "sofa-modern", quantity: 1, color: "sand" },
            { sku: "lamp-tube", quantity: 2, color: "matte-black" }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Render request failed with ${response.status}`);
      }

      const created = (await response.json()) as { id: string; status: RenderStatus };
      setJob({
        id: created.id,
        status: created.status,
        items: [],
        imageUrl: null,
        createdAt: new Date().toISOString()
      });

      await pollStatus(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <section className="card">
        <h1>3D Room Rendering</h1>
        <p>
          Submit a room composition and watch async rendering progress in near real
          time.
        </p>
        <button onClick={onGenerateRoom} disabled={loading}>
          {loading ? "Generating..." : "Generate Room"}
        </button>
        <p className="status">{statusLabel}</p>
        {job?.status === RenderStatus.done && job?.imageUrl ? (
          <div className="image-container">
            <img
              src={`${apiBase}/render/${job.id}/image`}
              alt="Rendered room"
              className="rendered-image"
            />
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}

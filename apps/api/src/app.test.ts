import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock external dependencies before importing the app ──────────────────────

vi.mock("@repo/db", () => ({
  prisma: {
    model3D: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    render: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn().mockResolvedValue([[], 0]),
  },
  RenderStatus: {
    queued: "queued",
    processing: "processing",
    done: "done",
    failed: "failed",
    stalled: "stalled",
  },
}));

vi.mock("@repo/queue", () => ({
  createRenderQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  createConvertQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("@repo/storage", () => ({
  isConfigured: () => false,
  isStorageKey: (v: string) => !!v && !v.startsWith("/") && !v.startsWith("http"),
  upload: vi.fn(),
}));

import request from "supertest";
import { app } from "./app.js";

// ── Health ─────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 with ok: true", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ── Models ─────────────────────────────────────────────────────────────────

describe("GET /models", () => {
  it("returns an empty array when no models exist", async () => {
    const res = await request(app).get("/models");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /models/:id", () => {
  it("returns 404 when model does not exist", async () => {
    const res = await request(app).get("/models/non-existent-id");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "model not found" });
  });
});

describe("POST /models", () => {
  it("returns 400 when name is missing", async () => {
    const res = await request(app).post("/models").field("description", "test");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "name is required" });
  });

  it("returns 400 when blendFile is missing", async () => {
    const res = await request(app).post("/models").field("name", "My Model");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "blendFile (.blend) is required" });
  });
});

// ── Renders ────────────────────────────────────────────────────────────────

describe("POST /render", () => {
  it("returns 400 when modelId is missing", async () => {
    const res = await request(app).post("/render").send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "modelId is required" });
  });

  it("returns 404 when the referenced model does not exist", async () => {
    const res = await request(app)
      .post("/render")
      .send({ modelId: "non-existent-model" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "model not found" });
  });
});

describe("GET /render/:id", () => {
  it("returns 404 when render does not exist", async () => {
    const res = await request(app).get("/render/non-existent-id");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "render not found" });
  });
});

describe("GET /renders", () => {
  it("returns an empty array when no renders exist", async () => {
    const res = await request(app).get("/renders");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /render/:id/retry", () => {
  it("returns 404 when render does not exist", async () => {
    const res = await request(app).post("/render/non-existent/retry");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "render not found" });
  });
});

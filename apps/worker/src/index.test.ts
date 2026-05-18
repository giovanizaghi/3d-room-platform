import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock all external side-effect imports ────────────────────────────────────

vi.mock("@repo/db", () => ({
  prisma: {
    render: {
      update: vi.fn().mockResolvedValue(undefined),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
  RenderStatus: {
    queued: "queued",
    processing: "processing",
    done: "done",
    failed: "failed",
    stalled: "stalled",
  },
}));

vi.mock("@repo/storage", () => ({
  isConfigured: () => false,
  isStorageKey: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
}));

vi.mock("ioredis", () => {
  const Redis = vi.fn().mockImplementation(() => ({ on: vi.fn() }));
  return { Redis, default: Redis };
});

vi.mock("bullmq", () => {
  function Queue() {}
  function Worker(this: { on: ReturnType<typeof vi.fn> }) {
    this.on = vi.fn();
  }
  return { Queue, Worker };
});

vi.mock("@repo/queue", () => ({
  RENDER_QUEUE_NAME: "render-jobs",
  CONVERT_QUEUE_NAME: "convert-jobs",
  queueConnection: { on: vi.fn() },
}));

// Import the function under test after mocks are set up.
import { buildCommand } from "./index.js";

describe("buildCommand — blender mode", () => {
  beforeEach(() => {
    process.env.OUTPUT_DIR = "/tmp/output";
  });

  it("uses blender binary by default", () => {
    const { bin } = buildCommand("render-1", [], "/models/chair.blend", false);
    // Module reads BLENDER_BIN at import time; default is "blender"
    expect(bin).toBe("blender");
  });

  it("includes the renderId in the args", () => {
    const { args } = buildCommand("my-render-id", [], "/models/chair.blend", false);
    expect(args).toContain("my-render-id");
  });

  it("includes the model blend file in the args", () => {
    const { args } = buildCommand("r1", [], "/models/my.blend", false);
    expect(args).toContain("/models/my.blend");
  });

  it("does not include --ai-enhance when aiEnhance is false", () => {
    const { args } = buildCommand("r1", [], "/models/chair.blend", false);
    expect(args).not.toContain("--ai-enhance");
  });

  it("includes --ai-enhance when aiEnhance is true", () => {
    const { args } = buildCommand("r1", [], "/models/chair.blend", true);
    expect(args).toContain("--ai-enhance");
  });

  it("serialises items as JSON in the args", () => {
    const items = [{ sku: "chair-red", quantity: 2, color: "red" }];
    const { args } = buildCommand("r1", items, "/models/chair.blend", false);
    const itemsIndex = args.indexOf("--items");
    expect(itemsIndex).toBeGreaterThan(-1);
    expect(JSON.parse(args[itemsIndex + 1])).toEqual(items);
  });

  it("includes --output pointing to the renderId png", () => {
    const { args } = buildCommand("render-abc", [], "/models/chair.blend", false);
    const outIndex = args.indexOf("--output");
    expect(outIndex).toBeGreaterThan(-1);
    expect(args[outIndex + 1]).toMatch(/render-abc\.png$/);
  });
});

describe("buildCommand — python mode (USE_BLENDER=false at load time)", () => {
  it("still returns a bin and structured args array", () => {
    // USE_BLENDER is read at module-load time; we can only verify the shape.
    const result = buildCommand("r1", [], "/models/chair.blend", false);
    expect(result).toHaveProperty("bin");
    expect(result).toHaveProperty("args");
    expect(Array.isArray(result.args)).toBe(true);
  });
});

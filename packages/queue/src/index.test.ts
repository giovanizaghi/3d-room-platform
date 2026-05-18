import { vi, describe, it, expect } from "vitest";

// ── Mock ioredis and bullmq before the module under test is imported ──────────

vi.mock("ioredis", () => {
  function Redis(this: { on: ReturnType<typeof vi.fn> }) {
    this.on = vi.fn();
  }
  return { Redis, default: Redis };
});

const MockQueue = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: { name: string }, name: string) {
    this.name = name;
  })
);
vi.mock("bullmq", () => ({ Queue: MockQueue }));

import {
  RENDER_QUEUE_NAME,
  CONVERT_QUEUE_NAME,
  createRenderQueue,
  createConvertQueue,
} from "./index.js";

describe("queue constants", () => {
  it("RENDER_QUEUE_NAME is 'render-jobs'", () => {
    expect(RENDER_QUEUE_NAME).toBe("render-jobs");
  });

  it("CONVERT_QUEUE_NAME is 'convert-jobs'", () => {
    expect(CONVERT_QUEUE_NAME).toBe("convert-jobs");
  });
});

describe("createRenderQueue", () => {
  it("instantiates a Queue with RENDER_QUEUE_NAME", () => {
    createRenderQueue();
    expect(MockQueue).toHaveBeenCalledWith(
      RENDER_QUEUE_NAME,
      expect.objectContaining({ connection: expect.anything() })
    );
  });
});

describe("createConvertQueue", () => {
  it("instantiates a Queue with CONVERT_QUEUE_NAME", () => {
    createConvertQueue();
    expect(MockQueue).toHaveBeenCalledWith(
      CONVERT_QUEUE_NAME,
      expect.objectContaining({ connection: expect.anything() })
    );
  });
});

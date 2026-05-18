import { describe, it, expect } from "vitest";
import {
  RenderStatus,
  ACTIVE_RENDER_STATUSES,
  TERMINAL_RENDER_STATUSES,
} from "./index.js";

describe("RenderStatus", () => {
  it("has all expected string values", () => {
    expect(RenderStatus.queued).toBe("queued");
    expect(RenderStatus.processing).toBe("processing");
    expect(RenderStatus.done).toBe("done");
    expect(RenderStatus.failed).toBe("failed");
    expect(RenderStatus.stalled).toBe("stalled");
  });
});

describe("ACTIVE_RENDER_STATUSES", () => {
  it("contains queued and processing", () => {
    expect(ACTIVE_RENDER_STATUSES).toContain(RenderStatus.queued);
    expect(ACTIVE_RENDER_STATUSES).toContain(RenderStatus.processing);
  });

  it("does not contain terminal statuses", () => {
    for (const status of TERMINAL_RENDER_STATUSES) {
      expect(ACTIVE_RENDER_STATUSES).not.toContain(status);
    }
  });

  it("has exactly 2 entries", () => {
    expect(ACTIVE_RENDER_STATUSES).toHaveLength(2);
  });
});

describe("TERMINAL_RENDER_STATUSES", () => {
  it("contains done, failed and stalled", () => {
    expect(TERMINAL_RENDER_STATUSES).toContain(RenderStatus.done);
    expect(TERMINAL_RENDER_STATUSES).toContain(RenderStatus.failed);
    expect(TERMINAL_RENDER_STATUSES).toContain(RenderStatus.stalled);
  });

  it("does not contain active statuses", () => {
    for (const status of ACTIVE_RENDER_STATUSES) {
      expect(TERMINAL_RENDER_STATUSES).not.toContain(status);
    }
  });

  it("has exactly 3 entries", () => {
    expect(TERMINAL_RENDER_STATUSES).toHaveLength(3);
  });
});

describe("status sets are exhaustive", () => {
  it("every RenderStatus appears in exactly one set", () => {
    const all = Object.values(RenderStatus);
    for (const status of all) {
      const inActive = ACTIVE_RENDER_STATUSES.includes(status);
      const inTerminal = TERMINAL_RENDER_STATUSES.includes(status);
      expect(inActive || inTerminal).toBe(true);
      expect(inActive && inTerminal).toBe(false);
    }
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { RenderQueueFAB } from "./RenderQueueFAB";
import * as ContextModule from "./RenderQueueContext";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockQueue(overrides: Partial<ReturnType<typeof ContextModule.useRenderQueue>> = {}) {
  vi.spyOn(ContextModule, "useRenderQueue").mockReturnValue({
    isOpen: false,
    items: [],
    activeCount: 0,
    snackbars: [],
    toggle: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    getActiveRender: () => undefined,
    hydrateRender: vi.fn(),
    addOptimistic: vi.fn(),
    dismissItem: vi.fn(),
    dismissAllTerminal: vi.fn(),
    undoDismiss: vi.fn(),
    dismissSnackbar: vi.fn(),
    ...overrides,
  });
}

describe("RenderQueueFAB", () => {
  it("renders a button with the correct aria-label", () => {
    mockQueue();
    render(<RenderQueueFAB />);
    expect(screen.getByRole("button", { name: "Toggle render queue" })).toBeTruthy();
  });

  it("calls toggle when clicked", () => {
    const toggle = vi.fn();
    mockQueue({ toggle });
    render(<RenderQueueFAB />);
    fireEvent.click(screen.getByRole("button"));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it("does not show the badge when activeCount is 0", () => {
    mockQueue({ activeCount: 0 });
    render(<RenderQueueFAB />);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("shows a badge with the active count when activeCount > 0", () => {
    mockQueue({ activeCount: 3 });
    render(<RenderQueueFAB />);
    expect(screen.getByText("3")).toBeTruthy();
  });
});

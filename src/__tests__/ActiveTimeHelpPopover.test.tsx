import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveTimeHelpPopover } from "../components/ActiveTimeHelpPopover";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function openInClippingContainer(buttonRect: DOMRect) {
  render(
    <div data-testid="clip" style={{ overflow: "auto", height: 40 }}>
      <ActiveTimeHelpPopover />
    </div>,
  );
  const button = screen.getByRole("button", { name: "什么是活跃时长" });
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue(buttonRect);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === button) return buttonRect;
    if (this.classList.contains("active-help-popover")) return rect(0, 0, 280, 138);
    return rect(0, 0, 0, 0);
  });
  fireEvent.click(button);
  return screen.getByRole("dialog", { name: "什么是活跃时长？" });
}

describe("ActiveTimeHelpPopover", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders outside clipping containers so the whole explanation stays visible", () => {
    const popover = openInClippingContainer(rect(600, 100, 16, 16));

    expect(screen.getByTestId("clip")).not.toContainElement(popover);
    expect(popover.parentElement).toBe(document.body);
    expect(popover.style.position).toBe("fixed");
  });

  it("opens below the button, aligned to its right edge", () => {
    const popover = openInClippingContainer(rect(600, 100, 16, 16));

    expect(popover.style.top).toBe("124px");
    expect(popover.style.left).toBe(`${616 + 8 - 280}px`);
  });

  it("flips above the button and stays inside the window near the edges", () => {
    const popover = openInClippingContainer(rect(2, window.innerHeight - 30, 16, 16));

    expect(popover.style.top).toBe(`${window.innerHeight - 30 - 8 - 138}px`);
    expect(popover.style.left).toBe("8px");
  });

  it("closes on Escape and on a click outside", () => {
    openInClippingContainer(rect(600, 100, 16, 16));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "什么是活跃时长" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

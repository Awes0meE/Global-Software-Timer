import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveTimeHelpPopover, HelpPopover } from "../components/ActiveTimeHelpPopover";
import { allRules } from "./support/css";

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

  it("closes on a second click of its button", () => {
    openInClippingContainer(rect(600, 100, 16, 16));
    const button = screen.getByRole("button", { name: "什么是活跃时长" });
    expect(button).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});

describe("HelpPopover", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function openHelp(buttonRect: DOMRect, align?: "start" | "end") {
    render(
      <HelpPopover label="什么是示例" title="什么是示例？" align={align}>
        <p>示例说明。</p>
      </HelpPopover>,
    );
    const button = screen.getByRole("button", { name: "什么是示例" });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this === button) return buttonRect;
      if (this.classList.contains("active-help-popover")) return rect(0, 0, 280, 120);
      return rect(0, 0, 0, 0);
    });
    fireEvent.click(button);
    return screen.getByRole("dialog", { name: "什么是示例？" });
  }

  it("shows its own title and explanation in the shared bubble", () => {
    const popover = openHelp(rect(600, 100, 16, 16));

    expect(popover).toHaveClass("active-help-popover");
    expect(popover).toHaveTextContent("什么是示例？");
    expect(popover).toHaveTextContent("示例说明。");
    expect(screen.getByRole("button", { name: "什么是示例" })).toHaveClass("active-help-button");
  });

  it("can grow rightwards from a title near the left edge of a panel", () => {
    const popover = openHelp(rect(300, 100, 16, 16), "start");

    expect(popover.style.top).toBe("124px");
    expect(popover.style.left).toBe(`${300 - 8}px`);
  });

  it("still stays inside the window when growing rightwards", () => {
    const width = document.documentElement.clientWidth || window.innerWidth;
    const popover = openHelp(rect(width - 20, 100, 16, 16), "start");

    expect(popover.style.left).toBe(`${width - 280 - 8}px`);
  });
});

// The ? sits 6px from its title on every page, as beside 隐藏软件列表 (.software-panel-title): one shared rule
// takes 4px off .panel-head's 10px gap, and no page spaces it on its own.
describe("help button spacing", () => {
  const topLevel = (selector: string): Record<string, string> =>
    Object.assign(
      {},
      ...allRules()
        .filter((rule) => rule.atRules.length === 0 && rule.selectors.includes(selector))
        .map((rule) => rule.declarations),
    );

  it("sits 6px from a panel title on every page", () => {
    const px = (value: string | undefined) => Number.parseFloat(value ?? "NaN");
    const shared = ".panel-head h2 + .active-help";
    expect(px(topLevel(".panel-head").gap) + px(topLevel(shared)["margin-left"])).toBe(px(topLevel(".software-panel-title").gap));
    const ownSpacing = allRules().flatMap((rule) =>
      rule.selectors
        .filter((selector) => /\.active-help$/.test(selector) && selector !== shared && "margin-left" in rule.declarations)
        .map((selector) => `${rule.file}: ${selector}`),
    );
    expect(ownSpacing).toEqual([]);
    const headGaps = allRules().flatMap((rule) =>
      rule.selectors
        .filter((selector) => /\.panel-head$/.test(selector) && selector !== ".panel-head")
        .filter(() => ["gap", "column-gap"].some((property) => property in rule.declarations))
        .map((selector) => `${rule.file}: ${selector}`),
    );
    expect(headGaps).toEqual([]);
  });
});
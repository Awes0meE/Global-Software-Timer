import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allRules } from "./support/css";

// The whole app runs on the browser preview's synthetic data.
vi.mock("@tauri-apps/api/core", () => import("../../scripts/ui-preview/tauri-core"));
vi.mock("@tauri-apps/api/window", () => import("../../scripts/ui-preview/tauri-window"));
vi.mock("@tauri-apps/plugin-autostart", () => import("../../scripts/ui-preview/autostart"));

import App from "../App";

// Built from pieces so a repo-wide search for the property finds only real uses.
const BLUR_PROPERTY = "backdrop" + "-filter";

// Spec「玻璃面板配方与上限」: only the sidebar and the top-level page panels blur, plus the
// existing light blur behind dialogs.
const BLURRED: Record<string, string> = {
  ".sidebar": "var(--glass-filter)",
  ".panel": "var(--glass-filter)",
  ".readout": "var(--glass-filter)",
  ".software-panel": "var(--glass-filter)",
  ".modal-backdrop": "blur(2px)",
};

const GLASS_LAYERS = ".sidebar, .panel, .readout, .software-panel";
const MAX_LAYERS = 6;

describe("blurred surfaces in the stylesheets", () => {
  it("are only the sidebar, the top-level panels and the dialog backdrop", () => {
    const blurred: Record<string, string> = {};
    for (const rule of allRules()) {
      const value = rule.declarations[BLUR_PROPERTY];
      if (value === undefined) continue;
      for (const selector of rule.selectors) {
        blurred[[...rule.atRules, selector].join(" ")] = value.replace(/\s+/g, " ");
      }
    }

    expect(blurred).toEqual(BLURRED);
  });
});

const normalize = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/** Declarations of every top-level rule that lists `selector`, merged in source order. */
function topLevel(selector: string): Record<string, string> {
  return Object.assign(
    {},
    ...allRules()
      .filter((rule) => rule.atRules.length === 0 && rule.selectors.includes(selector))
      .map((rule) => rule.declarations),
  );
}

// Decisions confirmed by the user on 2026-11-23 after comparing rendered options.
describe("glass panel edge (decision 2A)", () => {
  it.each([".panel", ".readout", ".software-panel"])(
    "%s draws its edge as an inset outline, so neither the frame nor the content moves",
    (selector) => {
      const declarations = topLevel(selector);
      expect(declarations.border, selector).toBe("0");
      expect(normalize(declarations.outline), selector).toBe("1px solid var(--edge)");
      expect(declarations["outline-offset"], selector).toBe("-1px");
      // The outline covers the top row of the panel, so the highlight is two rows tall.
      expect(normalize(declarations["box-shadow"]), selector).toBe("var(--glass-shadow), inset 0 2px 0 var(--glass-hi)");
    },
  );

  // Sticky heads are positioned and opaque, so they paint over the outline and must redraw the edge.
  it.each([
    [".focused-table-head", "inset 1px 0 0 var(--edge), inset -1px 0 0 var(--edge)"],
    [".background-table th:first-child", "inset 1px 0 0 var(--edge)"],
    [".background-table th:last-child", "inset -1px 0 0 var(--edge)"],
  ])("%s redraws the panel edge it covers", (selector, shadow) => {
    expect(normalize(topLevel(selector)["box-shadow"]), selector).toBe(shadow);
  });
});

describe("unavailable buttons (decision 1B)", () => {
  const DISABLED = [
    '.header-button[aria-disabled="true"]',
    '.header-button[aria-disabled="true"]:is(:hover, :active)',
    '.panel-link[aria-disabled="true"]',
  ];

  it.each(DISABLED)("%s keeps the --glass-2 key with an --ink-2 label", (selector) => {
    const declarations = topLevel(selector);
    expect(declarations.background, selector).toBe("var(--glass-2)");
    expect(declarations.color, selector).toBe("var(--ink-2)");
    // The resting 1px --edge line comes from the shared button rule and is not taken away.
    expect(declarations["box-shadow"], selector).toBeUndefined();
  });

  it("keeps the inset --edge line on header buttons", () => {
    expect(normalize(topLevel(".header-button")["box-shadow"])).toBe("inset 0 0 0 1px var(--edge)");
  });
});

describe("controls inside glass panels (decision 3C)", () => {
  const IN_PANEL = ":where(.panel, .software-panel, .readout) :is(.panel-link, .text-action, .button:not(.button-primary))";

  it.each([".panel-link", ".text-action", ".button"])("%s rests on --glass-2", (selector) => {
    expect(topLevel(selector).background, selector).toBe("var(--glass-2)");
  });

  it("draws a 1px --edge-strong line inside panels and keeps it under the focus ring", () => {
    expect(normalize(topLevel(IN_PANEL)["box-shadow"])).toBe("inset 0 0 0 1px var(--edge-strong)");
    expect(normalize(topLevel(`${IN_PANEL}:focus-visible`)["box-shadow"])).toBe(
      "inset 0 0 0 1px var(--edge-strong), var(--focus)",
    );
  });
});

describe("glass layers on every page", () => {
  beforeEach(() => {
    // Pin the synthetic day (it scales with the wall clock) to the visual baseline's moment.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 22, 22, 1));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function glassLayers(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(GLASS_LAYERS));
  }

  function expectWithinLimitAndFlat(container: HTMLElement, page: string): HTMLElement[] {
    const layers = glassLayers(container);
    expect(layers.length, `${page}: ${layers.length} blurred layers`).toBeLessThanOrEqual(MAX_LAYERS);
    for (const layer of layers) {
      expect(layer.parentElement?.closest(GLASS_LAYERS) ?? null, `${page}: ${layer.className} is nested`).toBeNull();
    }
    return layers;
  }

  it("stay within six and never nest", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const visit = async (label: string) => {
      await user.click(screen.getByRole("button", { name: label }));
    };
    const ready = (selector: string, count = 1) =>
      waitFor(() => expect(container.querySelectorAll(selector).length).toBeGreaterThanOrEqual(count), {
        timeout: 5000,
      });

    await ready(".usage-panel");
    expectWithinLimitAndFlat(container, "概览");

    await visit("软件");
    await ready(".discovered-panel");
    expectWithinLimitAndFlat(container, "软件");

    await visit("后台");
    await ready(".table-panel");
    expectWithinLimitAndFlat(container, "后台");

    await visit("统计");
    await ready(".stats-panel", 5);
    // The statistics page is at the limit: the sidebar and five panels.
    expect(expectWithinLimitAndFlat(container, "统计")).toHaveLength(MAX_LAYERS);

    await visit("成就");
    await ready(".ach-comings");
    expectWithinLimitAndFlat(container, "成就");

    await visit("设置");
    await ready(".settings-privacy");
    expectWithinLimitAndFlat(container, "设置");
  }, 20000);
});

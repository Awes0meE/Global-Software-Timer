import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allRules, parseColor, token } from "./support/css";

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

// Plan task 6: the software and background pages, the dialogs and the alert colours.
describe("software and background pages, dialogs", () => {
  // Built from pieces so a repo-wide search for the token finds only real uses.
  const SIGNAL = "var(--" + "signal";

  // Trade-off 6: the rows scroll under the sticky heads, so the heads must not be translucent.
  // Decision E-B (2026-11-23) moved them from --glass-solid to --head-solid, its slightly lifted twin.
  it.each([".focused-table-head", ".background-table th"])("%s is opaque", (selector) => {
    expect(topLevel(selector).background, selector).toBe("var(--head-solid)");
  });

  // Plan「口径」浮层: dialogs and the help bubble float over the glass, so they are opaque too.
  it.each([".dialog", ".add-software-dialog", ".active-help-popover"])("%s floats on --glass-solid", (selector) => {
    expect(topLevel(selector).background, selector).toBe("var(--glass-solid)");
  });

  // These controls set their own box-shadow, which would otherwise hide the global focus ring.
  it.each([".software-panel.is-editing .text-action", ".software-remove-button", ".active-help-button"])(
    "%s keeps its line under the focus ring",
    (selector) => {
      const resting = normalize(topLevel(selector)["box-shadow"]);
      expect(resting, selector).not.toBe("");
      expect(normalize(topLevel(`${selector}:focus-visible`)["box-shadow"]), selector).toBe(`${resting}, var(--focus)`);
    },
  );

  // Spec「信号橙与强调色」and 已定 3: errors, warnings and removal use the alert colours …
  it.each([".warning", ".dialog-error", ".software-remove-button"])("%s uses the alert colours", (selector) => {
    const declarations = topLevel(selector);
    expect(declarations.color, selector).toBe("var(--alert-ink)");
    expect(Object.values(declarations).join(" "), selector).not.toContain(SIGNAL);
  });

  // … and search hits, the selected row and the sort control use the accent.
  it.each([
    "mark",
    ".add-software-row.is-selected",
    ".background-table .sort-button:focus-visible",
    ".background-table .sort-button.is-active .sort-icon",
  ])("%s uses the accent", (selector) => {
    const values = Object.values(topLevel(selector)).join(" ");
    expect(values, selector).toContain("var(--accent)");
    expect(values, selector).not.toContain(SIGNAL);
  });

  // The close dialog's body-text colour must not outrank the error line's alert colour.
  it("leaves the close dialog's error line in the alert colour", () => {
    for (const rule of allRules()) {
      if (rule.atRules.length > 0 || rule.declarations.color === undefined) continue;
      for (const selector of rule.selectors.filter((s) => s.startsWith(".close-dialog p"))) {
        expect(selector).toContain(":not(.dialog-error)");
      }
    }
  });

  // The inset accent outline is the sort button's whole focus mark; the global ring would double it.
  it("draws one focus mark on the background table's sort buttons", () => {
    expect(topLevel(".background-table .sort-button:focus-visible")["box-shadow"]).toBe("none");
  });
});

// Round-2 decisions confirmed by the user on 2026-11-23 after comparing rendered options.
describe("dialog secondary controls (decision D-A)", () => {
  const SECONDARY = ":is(.dialog, .add-software-dialog) .button:not(.button-primary)";
  const LINE = "inset 0 0 0 1px var(--edge-strong)";

  it.each([SECONDARY, ".add-software-search"])("%s draws the 1px --edge-strong line", (selector) => {
    expect(normalize(topLevel(selector)["box-shadow"]), selector).toBe(LINE);
  });

  it.each([SECONDARY, ".add-software-search"])("%s keeps the line under the focus ring", (selector) => {
    expect(normalize(topLevel(`${selector}:focus-visible`)["box-shadow"]), selector).toBe(`${LINE}, var(--focus)`);
  });

  it("keeps the fills: --glass-2 keys, the --chip search box", () => {
    expect(topLevel(SECONDARY).background).toBeUndefined();
    expect(topLevel(".button").background).toBe("var(--glass-2)");
    expect(normalize(topLevel(".add-software-search").background)).toMatch(/, var\(--chip\)$/);
  });

  // One declaration per state, so the line does not depend on which rule comes later.
  it("sets the add dialog search box's line in exactly one rule per state", () => {
    const lines = allRules()
      .filter((rule) => rule.atRules.length === 0 && rule.declarations["box-shadow"] !== undefined)
      .filter((rule) => rule.selectors.some((s) => s.startsWith(".add-software-search")))
      .map((rule) => normalize(rule.declarations["box-shadow"]));
    expect(lines).toEqual([LINE, `${LINE}, var(--focus)`]);
  });

  it("leaves the software page's own search box on its --edge line", () => {
    expect(normalize(topLevel(".discovered-search")["box-shadow"])).toBe("inset 0 0 0 1px var(--edge)");
    expect(normalize(topLevel(".discovered-search:focus-visible")["box-shadow"])).toBe("var(--focus)");
  });
});

describe("sticky table heads (decision E-B)", () => {
  it("--head-solid equals --glass-solid in the light theme", () => {
    expect(parseColor(token("light", "--head-solid"))).toEqual(parseColor(token("light", "--glass-solid")));
  });

  it("--head-solid is the panel's average dark colour, a step above --glass-solid", () => {
    expect(parseColor(token("dark", "--head-solid"))).toEqual({ r: 33, g: 32, b: 39, a: 1 });
    expect(parseColor(token("dark", "--glass-solid"))).toEqual({ r: 30, g: 30, b: 34, a: 1 });
  });
});

// Plan task 7: switches, segmented controls and the settings rows.
describe("switches and segmented controls", () => {
  const SIGNAL = "var(--" + "signal";

  // Spec migration table「开关」: a white knob with a soft shadow, the accent track when on.
  it("draws a switched-off toggle as a chip track with a --muted outline", () => {
    const declarations = topLevel(".toggle");
    expect(declarations.background).toBe("var(--chip)");
    // Trade-off 9: the outline gives the off switch its 3:1 edge on glass.
    expect(normalize(declarations["box-shadow"])).toBe("inset 0 0 0 1px var(--muted)");
  });

  it("fills a switched-on toggle with the accent", () => {
    const declarations = topLevel(".toggle.is-on");
    expect(declarations.background).toBe("var(--accent)");
    expect(declarations["box-shadow"]).toBe("none");
  });

  it("gives the toggle a white knob with a soft shadow", () => {
    const declarations = topLevel(".toggle-knob");
    expect(declarations.background).toBe("#fff");
    expect(normalize(declarations["box-shadow"])).toBe("0 1px 3px var(--shade-deep)");
  });

  // Trade-off 9: the signal-orange lamp window inside the switch is gone.
  it("has no lamp window and no signal orange", () => {
    for (const rule of allRules()) {
      for (const selector of rule.selectors.filter((s) => s.startsWith(".toggle"))) {
        expect(selector).not.toContain("::before");
        expect(Object.values(rule.declarations).join(" "), selector).not.toContain(SIGNAL);
      }
    }
  });

  // Spec migration table「分段选择器」: a --chip track, the selected option on --on with an --edge line.
  it("lays the segmented track on --chip without the recess", () => {
    const declarations = topLevel(".segmented");
    expect(declarations.background).toBe("var(--chip)");
    expect(declarations["--muted"]).toBe("var(--ink-2)");
    expect(declarations["box-shadow"]).toBeUndefined();
  });

  it("labels the options in --ink-2 on the chip track", () => {
    expect(topLevel(".segmented-option").color).toBe("var(--ink-2)");
    expect(topLevel(".segmented-option:hover:not(:disabled)").color).toBe("var(--ink)");
  });

  it("marks the selected option with --on and an --edge line", () => {
    const declarations = topLevel(".segmented-option.is-selected");
    expect(declarations.background).toBe("var(--on)");
    expect(declarations["--muted"]).toBe("var(--ink-2)");
    expect(declarations.color).toBe("var(--ink)");
    expect(normalize(declarations["box-shadow"])).toBe("inset 0 0 0 1px var(--edge)");
  });

  // These controls set their own box-shadow, which would otherwise hide the global focus ring.
  it.each([
    [".segmented-option.is-selected", "inset 0 0 0 1px var(--edge), var(--focus)"],
    [".toggle", "inset 0 0 0 1px var(--muted), var(--focus)"],
    [".toggle.is-on", "var(--focus)"],
  ])("%s keeps the focus ring", (selector, shadow) => {
    expect(normalize(topLevel(`${selector}:focus-visible`)["box-shadow"]), selector).toBe(shadow);
  });

  // The options sit 2px apart, so a later selected sibling would paint its --on fill over the ring.
  it("lifts a focused segmented option above its neighbours", () => {
    const declarations = topLevel(".segmented-option:focus-visible");
    expect(declarations.position).toBe("relative");
    expect(declarations["z-index"]).toBe("1");
  });

  it("sets the settings row icons on --chip without the recess", () => {
    const declarations = topLevel(".settings-row-icon");
    expect(declarations.background).toBe("var(--chip)");
    expect(declarations["--muted"]).toBe("var(--ink-2)");
    expect(declarations.color).toBe("var(--ink-2)");
    expect(declarations["box-shadow"]).toBeUndefined();
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

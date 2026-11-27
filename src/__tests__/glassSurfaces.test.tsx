import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allRules, parseColor, resolve, themeTokens, token } from "./support/css";

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

const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";
const MOTION_REDUCED = ':root[data-motion="reduced"]';

/** Declarations of every rule directly inside `media` that lists `selector`, merged in source order. */
function inMedia(media: string, selector: string): Record<string, string> {
  return Object.assign(
    {},
    ...allRules()
      .filter((rule) => rule.atRules.length === 1 && normalize(rule.atRules[0]) === media && rule.selectors.includes(selector))
      .map((rule) => rule.declarations),
  );
}

/** True when a timing function leaves the 0–1 output range (a cubic-bezier with y1 or y2 outside it). */
function overshoots(easing: string): boolean {
  const bezier = /^cubic-bezier\(([^)]*)\)$/.exec(normalize(easing));
  if (!bezier) {
    if (["ease", "ease-in", "ease-out", "ease-in-out", "linear"].includes(normalize(easing))) return false;
    throw new Error(`Unsupported easing ${easing}`);
  }
  const [, y1, , y2] = bezier[1].split(",").map(Number);
  return [y1, y2].some((y) => y < 0 || y > 1);
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

  // Sticky heads are positioned and opaque, so they paint over the outline and must redraw the edge,
  // ahead of the raised-key lines (v0.4.1 variant B).
  const KEY = "inset 0 1px 0 var(--head-hi), inset 0 -1px 0 var(--head-rule)";
  it.each([
    [".focused-table-head", `inset 1px 0 0 var(--edge), inset -1px 0 0 var(--edge), ${KEY}`],
    [".background-table th:first-child", `inset 1px 0 0 var(--edge), ${KEY}`],
    [".background-table th:last-child", `inset -1px 0 0 var(--edge), ${KEY}`],
  ])("%s redraws the panel edge it covers", (selector, shadow) => {
    expect(normalize(topLevel(selector)["box-shadow"]), selector).toBe(shadow);
  });
});

// v0.4.2 removed the header's placeholder buttons; an unavailable in-panel link keeps decision 1B.
describe("unavailable buttons (decision 1B)", () => {
  it('.panel-link[aria-disabled="true"] keeps the --glass-2 key with an --ink-2 label', () => {
    const declarations = topLevel('.panel-link[aria-disabled="true"]');
    expect(declarations.background).toBe("var(--glass-2)");
    expect(declarations.color).toBe("var(--ink-2)");
    // The resting 1px --edge line comes from the shared button rule and is not taken away.
    expect(declarations["box-shadow"]).toBeUndefined();
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
  // Decision E-B (2026-11-23) moved them from --glass-solid to --head-solid, its slightly lifted twin;
  // v0.4.1 variant B lays the opaque top-lit --head-fill over it.
  it.each([".focused-table-head", ".background-table th"])("%s is opaque", (selector) => {
    expect(normalize(topLevel(selector).background), selector).toBe("var(--head-fill), var(--head-solid)");
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

  // Apple HIG: pointer hit targets are 28×28 by default (20×20 minimum). The ? key stays 16px to look at
  // and reaches 28px through an invisible ring, so the title it sits 6px from keeps its own clicks.
  it("gives the 16px ? key a 28px hit area", () => {
    const key = topLevel(".active-help-button");
    expect(key.width).toBe("16px");
    expect(key.position).toBe("relative");
    const ring = topLevel(".active-help-button::before");
    expect(ring.content).toBe('""');
    expect(ring.position).toBe("absolute");
    expect(ring.inset).toBe("-6px");
  });

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

  // v0.4.1: the light theme's mid-grey well showed around round or transparent-edged icons. A loaded icon now
  // gets only a hairline that follows its own alpha, so white icons stay visible on light glass and the
  // transparent margins stay glass; the initial-letter tile and the dark theme are unchanged.
  it("edges loaded light-theme icons along their own shape, with no grey well", () => {
    const light = topLevel(':root[data-theme="light"] .software-icon:has(img:not([hidden]))');
    expect(light.background).toBeUndefined();
    expect(normalize(light.filter)).toMatch(/^drop-shadow\(0 0 0\.5px rgba\(20, 30, 60, 0\.\d+\)\)/);
    expect(topLevel(".software-icon").background).toBeUndefined();
    expect(topLevel(".software-icon").filter).toBeUndefined();
    expect(themeTokens("light")["--icon-well"]).toBeUndefined();
    expect(themeTokens("dark")["--icon-well"]).toBeUndefined();
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

  // v0.4.1 variant B (raised key strip, user 2026-11-24): in the dark theme the old #212027 head read as
  // near-black, so it now sits one key step above the panel.
  it("--head-solid is a key step above --glass-solid in the dark theme", () => {
    expect(parseColor(token("dark", "--head-solid"))).toEqual({ r: 42, g: 42, b: 49, a: 1 });
    expect(parseColor(token("dark", "--glass-solid"))).toEqual({ r: 30, g: 30, b: 34, a: 1 });
  });

  it.each([
    ["light", "--head-fill", "linear-gradient(to bottom, #fcfcfd, #f1f3f6)"],
    ["dark", "--head-fill", "linear-gradient(to bottom, #2e2e36, #27272e)"],
    ["light", "--head-hi", "rgba(255, 255, 255, 0.9)"],
    ["dark", "--head-hi", "rgba(255, 255, 255, 0.07)"],
    ["light", "--head-rule", "rgba(20, 30, 60, 0.1)"],
    ["dark", "--head-rule", "rgba(0, 0, 0, 0.45)"],
    ["light", "--head-drop", "rgba(20, 30, 60, 0.12)"],
    ["dark", "--head-drop", "rgba(0, 0, 0, 0.35)"],
  ] as const)("%s %s is the approved raised-key value", (theme, name, value) => {
    expect(normalize(themeTokens(theme)[name])).toBe(value);
  });

  it("draws the middle 后台 head cells with the key lines and no panel edge", () => {
    expect(normalize(topLevel(".background-table th")["box-shadow"])).toBe(
      "inset 0 1px 0 var(--head-hi), inset 0 -1px 0 var(--head-rule)",
    );
  });

  // Per-cell drop shadows tapered at every 后台 head cell's sides (gaps under the head, seams over the
  // neighbours), so the drop is a full-width strip under each head, 1px in from the panel's sides.
  it("drops the heads onto the rows with a seamless strip, not a box-shadow", () => {
    for (const selector of [".focused-table-head", ".background-table th"]) {
      expect(normalize(topLevel(selector)["box-shadow"]), selector).not.toContain("--head-drop");
      const strip = topLevel(`${selector}::after`);
      expect(strip.content, selector).toBe('""');
      expect(strip.position, selector).toBe("absolute");
      expect(strip.top, selector).toBe("100%");
      expect(strip["pointer-events"], selector).toBe("none");
      expect(normalize(strip.background), selector).toBe("linear-gradient(to bottom, var(--head-drop), transparent)");
    }
    expect(topLevel(".background-table th::after").left).toBe("0");
    expect(topLevel(".background-table th::after").right).toBe("0");
    expect(topLevel(".background-table th:first-child::after").left).toBe("1px");
    expect(topLevel(".background-table th:last-child::after").right).toBe("1px");
    expect(topLevel(".focused-table-head::after").left).toBe("1px");
    expect(topLevel(".focused-table-head::after").right).toBe("1px");
  });

  // The key's own bottom hairline replaces the first row's top rule, so the two do not double up.
  it("hides the first 特别关注 row's top rule under the key", () => {
    expect(topLevel(".focused-table-head + .focused-table-row")["border-top-color"]).toBe("transparent");
  });
});

// Plan task 7: switches, segmented controls and the settings rows.
describe("switches and segmented controls", () => {
  const SIGNAL = "var(--" + "signal";

  // Plan task 7「用户已确认（2026-11-23）」: a three-dimensional slider, V1 凹槽 + 圆钮 with the pale
  // outline L1 and the ball knob S1. Theme values are --tg-* tokens; --toggle-* carry the state.
  it("recesses the switched-off track: --chip with a faint well gradient and a pale --edge-strong rim", () => {
    const declarations = topLevel(".toggle");
    expect(declarations.width).toBe("52px");
    expect(declarations.height).toBe("28px");
    expect(declarations["background-color"]).toBe("var(--chip)");
    expect(normalize(declarations["background-image"])).toBe(
      "linear-gradient(to bottom, rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.06))",
    );
    expect(declarations["--toggle-rim"]).toBe("var(--tg-rim-off)");
    expect(declarations["--toggle-well"]).toBe("var(--tg-well-off)");
    expect(normalize(declarations["box-shadow"])).toBe("inset 0 0 0 1px var(--toggle-rim), var(--toggle-well)");
  });

  it("fills a switched-on track with the accent inside its darker rim and well", () => {
    const declarations = topLevel(".toggle.is-on");
    expect(declarations["--toggle-fill"]).toBe("var(--accent)");
    expect(declarations["background-color"]).toBe("var(--toggle-fill)");
    expect(declarations["--toggle-rim"]).toBe("var(--tg-rim-on)");
    expect(declarations["--toggle-well"]).toBe("var(--tg-well-on)");
    expect(declarations["--toggle-ring"]).toBe("var(--tg-knob-rim-on)");
  });

  it("lightens the track rim on hover when off and the accent fill when on", () => {
    expect(topLevel(".toggle:not(.is-on):hover:not(:disabled)")["--toggle-rim"]).toBe("var(--tg-rim-off-hover)");
    expect(normalize(topLevel(".toggle.is-on:hover:not(:disabled)")["--toggle-fill"])).toBe(
      "color-mix(in srgb, var(--accent) 90%, #fff)",
    );
  });

  // The pale off rims (L1), and the two F-B contrast cues: a darker accent rim on the light on-track,
  // a dark ring on the dark on-knob.
  it.each([
    ["light", "--tg-rim-off", "var(--edge-strong)"],
    ["dark", "--tg-rim-off", "var(--edge-strong)"],
    ["light", "--tg-rim-off-hover", "color-mix(in srgb, var(--muted) 45%, transparent)"],
    ["dark", "--tg-rim-off-hover", "color-mix(in srgb, var(--muted) 45%, transparent)"],
    ["light", "--tg-rim-on", "color-mix(in srgb, var(--accent) 70%, var(--ink))"],
    ["dark", "--tg-rim-on", "color-mix(in srgb, var(--accent) 78%, #000)"],
    ["light", "--tg-knob-rim", "rgba(20, 30, 60, 0.16)"],
    ["light", "--tg-knob-rim-on", "rgba(20, 30, 60, 0.16)"],
    ["dark", "--tg-knob-rim", "rgba(0, 0, 0, 0.22)"],
    ["dark", "--tg-knob-rim-on", "rgba(0, 0, 0, 0.5)"],
  ] as const)("%s %s is %s", (theme, name, value) => {
    expect(normalize(themeTokens(theme)[name])).toBe(value);
  });

  // The S1 ball face lit from the top left, the recessed wells and the knob lifts, as approved.
  it.each([
    [
      "light",
      "--tg-knob",
      "linear-gradient(to top, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0) 24%), " +
        "radial-gradient(circle at 32% 26%, #ffffff 0%, #f6f7f9 14%, #e3e6ea 40%, #c9ced5 68%, #b8bec7 80%, #b8bec7 100%)",
    ],
    [
      "dark",
      "--tg-knob",
      "linear-gradient(to top, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 24%), " +
        "radial-gradient(circle at 32% 26%, #ffffff 0%, #f6f7f9 14%, #e4e7eb 40%, #cbd0d7 68%, #bcc2ca 80%, #bcc2ca 100%)",
    ],
    ["light", "--tg-well-off", "inset 0 2px 3px -1px rgba(20, 30, 60, 0.34), inset 0 -1px 0 rgba(255, 255, 255, 0.75)"],
    ["dark", "--tg-well-off", "inset 0 2px 3px -1px rgba(0, 0, 0, 0.7), inset 0 -1px 0 rgba(255, 255, 255, 0.1)"],
    // v0.4.4 spec §B: the switched-on well is built from the accent instead of a fixed navy.
    [
      "light",
      "--tg-well-on",
      "inset 0 2px 3px -1px color-mix(in srgb, color-mix(in srgb, var(--accent) 30%, #000) 50%, transparent), " +
        "inset 0 -1px 0 rgba(255, 255, 255, 0.32)",
    ],
    [
      "dark",
      "--tg-well-on",
      "inset 0 2px 3px -1px color-mix(in srgb, color-mix(in srgb, var(--accent) 22%, #000) 60%, transparent), " +
        "inset 0 -1px 0 rgba(255, 255, 255, 0.28)",
    ],
    ["light", "--tg-lift", "0 1px 1px rgba(20, 30, 60, 0.3), 0 2px 5px rgba(20, 30, 60, 0.22)"],
    ["dark", "--tg-lift", "0 1px 1px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.45)"],
    ["light", "--tg-lift-hover", "0 1px 1px rgba(20, 30, 60, 0.3), 0 3px 7px rgba(20, 30, 60, 0.28)"],
    ["dark", "--tg-lift-hover", "0 1px 1px rgba(0, 0, 0, 0.55), 0 3px 8px rgba(0, 0, 0, 0.55)"],
    ["light", "--tg-lift-press", "0 0.5px 1px rgba(20, 30, 60, 0.34), 0 1px 2px rgba(20, 30, 60, 0.16)"],
    ["dark", "--tg-lift-press", "0 0.5px 1px rgba(0, 0, 0, 0.6), 0 1px 2px rgba(0, 0, 0, 0.35)"],
  ] as const)("%s %s is the approved value", (theme, name, value) => {
    expect(normalize(themeTokens(theme)[name])).toBe(value);
  });

  it("draws the 22px knob with its rim, a state-driven lift and a specular hotspot", () => {
    const knob = topLevel(".toggle-knob");
    expect(knob.width).toBe("22px");
    expect(knob.height).toBe("22px");
    expect(knob.background).toBe("var(--tg-knob)");
    expect(normalize(knob["box-shadow"])).toBe("0 0 0 1px var(--toggle-ring), var(--toggle-lift)");
    expect(topLevel(".toggle")["--toggle-ring"]).toBe("var(--tg-knob-rim)");
    expect(topLevel(".toggle")["--toggle-lift"]).toBe("var(--tg-lift)");
    expect(topLevel(".toggle:hover:not(:disabled)")["--toggle-lift"]).toBe("var(--tg-lift-hover)");
    expect(topLevel(".toggle:active:not(:disabled)")["--toggle-lift"]).toBe("var(--tg-lift-press)");
    const hotspot = topLevel(".toggle-knob::after");
    expect(hotspot.content).toBe('""');
    expect(hotspot.background).toMatch(/^radial-gradient\(/);
  });

  it("slides the knob with a slight overshoot and fades the track", () => {
    expect(normalize(topLevel(".toggle-knob").transition)).toBe(
      "transform 240ms cubic-bezier(0.3, 1.5, 0.5, 1), width 150ms cubic-bezier(0.2, 0.8, 0.3, 1), box-shadow 150ms ease-out",
    );
    expect(overshoots("cubic-bezier(0.3, 1.5, 0.5, 1)")).toBe(true);
    expect(normalize(topLevel(".toggle").transition)).toBe("background-color 220ms ease-out, box-shadow 220ms ease-out");
  });

  it("stretches a pressed knob to 26px toward its travel direction", () => {
    expect(topLevel(".toggle.is-on .toggle-knob").transform).toBe("translateX(24px)");
    expect(topLevel(".toggle:active:not(:disabled) .toggle-knob").width).toBe("26px");
    // 20px + 3px + 26px = 49px, the right end of the resting on knob (3px + 24px + 22px).
    expect(topLevel(".toggle.is-on:active:not(:disabled) .toggle-knob").transform).toBe("translateX(20px)");
  });

  it.each([
    ["Windows reduced motion", (selector: string) => inMedia(REDUCED_MOTION, selector)],
    ["the 减少动画 setting", (selector: string) => topLevel(`${MOTION_REDUCED} ${selector}`)],
  ])("neither stretches nor overshoots under %s", (_source, reduced) => {
    expect(reduced(".toggle:active:not(:disabled) .toggle-knob").width).toBe("22px");
    expect(reduced(".toggle.is-on:active:not(:disabled) .toggle-knob").transform).toBe("translateX(24px)");
    const easing = reduced(".toggle-knob")["transition-timing-function"];
    expect(easing).toBeDefined();
    expect(overshoots(resolve(easing, themeTokens("light")))).toBe(false);
  });

  // v0.4.4 spec §F: 减少动画 adds a sibling of the media block with identical rules under data-motion.
  it("keeps the 减少动画 block identical to the reduced-motion media block", () => {
    const inBlock = allRules()
      .filter((rule) => rule.atRules.length === 1 && normalize(rule.atRules[0]) === REDUCED_MOTION)
      .map((rule) => ({ selectors: rule.selectors, declarations: rule.declarations }));
    const prefix = `${MOTION_REDUCED} `;
    const scoped = allRules()
      .filter((rule) => rule.atRules.length === 0 && rule.selectors.some((selector) => selector.includes("data-motion")))
      .map((rule) => {
        rule.selectors.forEach((selector) => expect(selector.startsWith(prefix), selector).toBe(true));
        return { selectors: rule.selectors.map((selector) => selector.slice(prefix.length)), declarations: rule.declarations };
      });
    expect(inBlock.length).toBeGreaterThan(0);
    expect(scoped).toEqual(inBlock);
  });

  it("keeps a disabled switch at half opacity", () => {
    expect(topLevel(".toggle:disabled").opacity).toBe("0.5");
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
    [".toggle", "inset 0 0 0 1px var(--toggle-rim), var(--toggle-well), var(--focus)"],
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

// Plan task 8: the statistics page outside the paper recorder.
describe("statistics range bar and ledgers", () => {
  const SIGNAL = "var(--" + "signal";

  // Trade-off 23: the range bar sits straight on the glow background, where --muted is too faint.
  it.each([".stats-custom-range", ".stats-range-caption", ".stats-hidden-toggle"])(
    "%s labels the range bar in --ink-2",
    (selector) => {
      expect(topLevel(selector).color, selector).toBe("var(--ink-2)");
    },
  );

  // Spec「信号橙与强调色」: the range error is an alert, on an opaque wash (trade-off 23).
  it("shows the range error in the alert colours on an opaque wash", () => {
    const declarations = topLevel(".stats-range-error");
    expect(declarations.color).toBe("var(--alert-ink)");
    expect(normalize(declarations.background)).toBe(
      "linear-gradient(var(--alert-wash), var(--alert-wash)), var(--glass-solid)",
    );
    expect(declarations.padding).toBe("2px 8px");
    expect(declarations["border-radius"]).toBe("var(--radius-tag)");
    expect(Object.values(declarations).join(" ")).not.toContain(SIGNAL);
  });

  it("lays the missing-detail note on --chip without the recess", () => {
    const declarations = topLevel(".stats-note");
    expect(declarations.background).toBe("var(--chip)");
    expect(declarations["--muted"]).toBe("var(--ink-2)");
    expect(declarations["box-shadow"]).toBeUndefined();
    expect(declarations.color).toBe("var(--ink-2)");
  });

  it("hovers ledger rows on --chip like the other tables", () => {
    const declarations = topLevel(".stats-row:not(.stats-head):hover");
    expect(declarations.background).toBe("var(--chip)");
    expect(declarations["--muted"]).toBe("var(--ink-2)");
  });

  // Trade-off 6: heads that do not stick lose their fill and keep the --rule line and --muted text.
  it("leaves the ledger heads unfilled", () => {
    expect(topLevel(".stats-head").background).toBeUndefined();
  });

  it("letters the new-entry tag in --glass-solid", () => {
    expect(topLevel(".rank-new").color).toBe("var(--glass-solid)");
  });

  it("lays the idle and rhythm tracks on --chip without the recess", () => {
    const idle = topLevel(".idle-bar");
    expect(idle.background).toBe("var(--chip)");
    expect(idle["box-shadow"]).toBeUndefined();

    const rhythm = topLevel(".rhythm-track");
    expect(rhythm["background-color"]).toBe("var(--chip)");
    expect(rhythm.background).toBeUndefined();
    expect(rhythm["background-image"]).toContain("var(--edge-strong)");
    expect(rhythm["box-shadow"]).toBeUndefined();
  });

  // Plan「口径」浮层: the trend hover card floats over the glass; its small shadow stays (trade-off 24).
  it("floats the trend hover card on --glass-solid", () => {
    const declarations = topLevel(".trend-tip");
    expect(declarations.background).toBe("var(--glass-solid)");
    expect(normalize(declarations["box-shadow"])).toBe("0 0 0 1px var(--edge-strong), 0 4px 10px var(--shade)");
  });
});

// Plan task 9: the achievements page outside the heatmap, and the milestone plates.
describe("achievement records, milestone plates and comings", () => {
  // Built from pieces so a repo-wide search for the tokens finds only real uses.
  const RETIRED = ["highlight", "knob-", "faint", "panel)", "panel-raised", "panel-sunken", "shade", "signal"].map(
    (name) => "var(--" + name,
  );
  const achievementRules = () => allRules().filter((rule) => rule.file.includes("AchievementsPage"));

  it("leaves no engraving, knob, faint, recess, shade or signal tokens in the achievements stylesheet", () => {
    for (const rule of achievementRules()) {
      const text = Object.values(rule.declarations).join(" ");
      for (const name of RETIRED) expect(text, rule.selectors.join(", ")).not.toContain(name);
    }
  });

  // Spec 迁移表「刻字效果」.
  it.each([".ach-readout-head h2", ".ach-plate-tier b", ".ach-plate .ach-plate-rule.is-titled"])(
    "%s has no engraved text shadow",
    (selector) => {
      expect(topLevel(selector)["text-shadow"], selector).toBeUndefined();
    },
  );

  it.each([
    ".ach-scope-rule",
    ".ach-plate-rule",
    ".ach-plate .ach-plate-rule.is-titled",
    ".ach-plate-rule.is-titled::before",
    ".ach-record + .ach-record",
  ])("%s draws its rule without a highlight shadow", (selector) => {
    expect(topLevel(selector)["box-shadow"], selector).toBeUndefined();
  });

  // Plan「口径」: the scope strip sits straight on the glow background, where --muted is too faint.
  it("labels the scope strip in --ink-2", () => {
    expect(topLevel(".ach-scope").color).toBe("var(--ink-2)");
  });

  // Spec 迁移表「里程碑铭牌」: a --glass-2 sub-plate, without the raised bevel or shadows.
  it("lays reached plates on --glass-2 with an --edge line", () => {
    const declarations = topLevel(".ach-plate.is-reached");
    expect(declarations.background).toBe("var(--glass-2)");
    expect(normalize(declarations["box-shadow"])).toBe("inset 0 0 0 1px var(--edge)");
  });

  // Trade-off 7: the light --edge is invisible on glass, so unlit plates use a dashed --edge-strong.
  // 用户已确认（2026-11-23）: an inset outline instead of a border, so the unlit plate's content sits where
  // a lit plate's does (no 1px border pushing it in) and the outer box stays the same.
  it("draws unlit plates as a dashed --edge-strong inset outline, without a border", () => {
    const declarations = topLevel(".ach-plate.is-slot");
    expect(declarations.background).toBe("transparent");
    expect(declarations["box-shadow"]).toBe("none");
    expect(declarations.border).toBe("0");
    expect(normalize(declarations.outline)).toBe("1px dashed var(--edge-strong)");
    expect(declarations["outline-offset"]).toBe("-1px");
    expect(topLevel(".ach-plate.is-slot .ach-plate-tier b").color).toBe("var(--muted)");
  });

  // Spec 已定 2: the 6666-hour plate takes the accent outline once reached.
  it("outlines the reached 6666-hour plate in the accent", () => {
    expect(normalize(topLevel(".ach-plate.is-reached.is-ultimate")["box-shadow"])).toBe(
      "inset 0 0 0 1.5px var(--accent)",
    );
  });

  it("has no screw rules", () => {
    expect(achievementRules().filter((rule) => rule.selectors.some((selector) => selector.includes(".ach-screw")))).toEqual(
      [],
    );
  });

  it("separates the coming names with --muted dots", () => {
    expect(topLevel(".ach-coming-names i").color).toBe("var(--muted)");
  });

  // 查看名单 is the only enabled .panel-link; under decision 3C it looks like a key, so it reacts like one.
  it("gives enabled panel links the key hover and press fills", () => {
    const hover = topLevel('.panel-link:not([aria-disabled="true"]):hover');
    expect(hover.background).toBe("var(--on)");
    expect(hover["--muted"]).toBe("var(--ink-2)");

    const active = topLevel('.panel-link:not([aria-disabled="true"]):active');
    expect(active.background).toBe("var(--chip)");
    expect(active["--muted"]).toBe("var(--ink-2)");
  });
});

// Plan task 10: the e-ink screen recipe (spec「墨水屏配方」) on the overview readout, the settings
// screen and the achievements readout. The dial and the heatmap keep their own inks until tasks 11 and 13.
describe("e-ink screen", () => {
  // Built from pieces so a repo-wide search for the retired tokens finds only real uses.
  const OLD_SIZE = "--" + "lcd-display-size";
  const OLD_INK = "var(--" + "lcd";
  const DARK = ':root[data-theme="dark"] ';
  const styleRules = () => allRules().filter((rule) => rule.file.includes("styles.css"));
  // The screen surface, its text and its icons; the dial is task 11.
  const isScreenSelector = (selector: string) => /^\.lcd(?![\w-])|^\.lcd-(?!ring|dial|midnight)/.test(selector);

  it("lays the screen on matte paper in printed ink, without a glow", () => {
    const declarations = topLevel(".lcd");
    expect(declarations.background).toBe("var(--eink-paper)");
    expect(declarations.color).toBe("var(--eink-ink)");
    expect(declarations["border-radius"]).toBe("var(--radius-screen)");
    expect(declarations["font-family"]).toBe("var(--font-pixel)");
    expect(normalize(declarations["box-shadow"])).toBe(
      "inset 0 1px 3px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(0, 0, 0, 0.1), 0 1px 0 var(--glass-hi)",
    );
    expect(declarations["text-shadow"]).toBeUndefined();
  });

  // Task 14 adds .paper to the paint rules, so they carry no grid layout.
  it("keeps the paper paint apart from the readout grid", () => {
    const paint = styleRules().filter(
      (rule) => rule.atRules.length === 0 && rule.declarations.background === "var(--eink-paper)",
    );
    // v0.4.4: the 设置 墨水屏配色 chips are paper samples too, each with its own palette's tokens.
    expect(paint.map((rule) => rule.selectors)).toEqual([[".lcd", ".paper"], [".lcd-chip"]]);
    for (const property of ["display", "grid-template-columns", "gap", "min-height", "padding"]) {
      expect(paint[0].declarations[property], property).toBeUndefined();
    }
  });

  it("covers the paper with fractal-noise grain instead of the dot matrix", () => {
    const declarations = topLevel(".lcd::before");
    expect(declarations.content).toBe('""');
    expect(declarations.position).toBe("absolute");
    expect(declarations.inset).toBe("0");
    expect(declarations["pointer-events"]).toBe("none");
    expect(declarations.opacity).toBe("var(--eink-grain)");
    expect(declarations["mix-blend-mode"]).toBe("var(--eink-grain-blend)");
    expect(declarations["background-size"]).toBeUndefined();
    expect(declarations["background-image"]).toBeUndefined();

    const grain = normalize(declarations.background);
    expect(grain).toMatch(/^url\("data:image\/svg\+xml;utf8,<svg /);
    for (const part of [
      "width='220' height='220'",
      "<feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/>",
      "<feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0'/>",
      "filter='url(%23n)'",
    ]) {
      expect(grain).toContain(part);
    }
    // A raw '#' would end the data URL.
    expect(grain).not.toContain("#");
  });

  it("dulls the paper with a matte wash instead of the glass reflection", () => {
    const declarations = topLevel(".lcd::after");
    expect(declarations.content).toBe('""');
    expect(declarations.position).toBe("absolute");
    expect(declarations.inset).toBe("0");
    expect(declarations["pointer-events"]).toBe("none");
    expect(normalize(declarations.background)).toBe(
      "linear-gradient(180deg, rgba(255, 255, 255, 0.1), transparent 30%, rgba(0, 0, 0, 0.015))",
    );
  });

  it("prints labels and notes in --eink-dim and the legend keys in their rings' inks", () => {
    expect(topLevel(".lcd-label").color).toBe("var(--eink-dim)");
    expect(topLevel(".lcd-note").color).toBe("var(--eink-dim)");
    // Each key is a solid swatch of the ring it names: 今日记录 the outer ring, 今日活跃 the inner one.
    expect(topLevel(".lcd-key").background).toBe(topLevel(".lcd-ring-recorded path.is-lit").fill);
    expect(topLevel(".lcd-key-active").background).toBe(topLevel(".lcd-ring-active path.is-lit").fill);
    expect(topLevel(".lcd-key-active").background).toBe("var(--eink-mid)");
  });

  // v0.4.8: icons on the screen (最常用, the settings clock) keep their own colours; they were half desaturated.
  it("prints every image on the screen in its own colours, without filter or blending", () => {
    const imageRules = allRules().filter((rule) => rule.selectors.some((selector) => /\.lcd\b.*\bimg\b/.test(selector)));
    for (const rule of imageRules) {
      expect(rule.declarations.filter, rule.selector).toBeUndefined();
      expect(rule.declarations["mix-blend-mode"], rule.selector).toBeUndefined();
      expect(rule.declarations.opacity, rule.selector).toBeUndefined();
    }
    const old = allRules().filter((rule) => rule.selectors.some((selector) => selector.endsWith(".lcd-most .software-icon")));
    expect(old.map((rule) => rule.selectors.join(", "))).toEqual([]);
  });

  it("dashes the narrow layout's divider in --eink-dim", () => {
    expect(normalize(inMedia("@media (max-width: 1320px)", ".lcd-cell-most")["border-top"])).toBe(
      "1px dashed color-mix(in srgb, var(--eink-dim) 45%, transparent)",
    );
  });

  it("uses one recipe in both themes, with no glow or LCD ink on the screen", () => {
    for (const rule of styleRules()) {
      const screen = rule.selectors.filter(isScreenSelector);
      if (screen.length === 0) continue;
      const label = `${rule.atRules.join(" ")} ${screen.join(", ")}`;
      expect(rule.declarations["text-shadow"], label).toBeUndefined();
      expect(Object.values(rule.declarations).join(" "), label).not.toContain(OLD_INK);
    }
    const darkScreen = allRules().flatMap((rule) =>
      rule.selectors.filter((selector) => selector.startsWith(DARK) && isScreenSelector(selector.slice(DARK.length))),
    );
    expect(darkScreen).toEqual([]);
  });

  // Spec Token 架构: the pixel display size is renamed, its per-dppx values unchanged.
  it("sizes the pixel digits with --pixel-display-size", () => {
    expect(topLevel(".lcd-value b")["font-size"]).toBe("var(--pixel-display-size, 60px)");
    expect(inMedia("@media (resolution: 1.25dppx)", ".lcd")["--pixel-display-size"]).toBe("57.6px");
    expect(inMedia("@media (resolution: 1.5dppx)", ".lcd")["--pixel-display-size"]).toBe("64px");
    // v0.4.1: the streak readings sit in the bottom strip at the size of the other dial readings.
    expect(topLevel(".lcd.ach-dial")["--pixel-display-size"]).toBe("24px");
    for (const rule of allRules()) {
      const text = Object.entries(rule.declarations).flat().join(" ");
      expect(text, rule.selectors.join(", ")).not.toContain(OLD_SIZE);
    }
  });

  // The pixel font is drawn on a 12px grid, so a reading is crisp only when each font pixel spans a whole number
  // of physical pixels: size × dppx / 12 must be an integer at 100%, 125% and 150%, wide and narrow.
  describe("secondary readings on whole physical pixels", () => {
    const holds = (prelude: string, width: number, dppx: number) =>
      normalize(prelude)
        .replace(/^@media /, "")
        .split(" and ")
        .every((feature) => {
          const maxWidth = /^\(max-width: (\d+)px\)$/.exec(feature);
          if (maxWidth) return width <= Number(maxWidth[1]);
          const resolution = /^\(resolution: ([\d.]+)dppx\)$/.exec(feature);
          if (resolution) return dppx === Number(resolution[1]);
          return false;
        });
    /** The cascaded value of `property` on `selector` (same specificity, so source order decides). */
    const cascaded = (selector: string, property: string, width: number, dppx: number) => {
      let value: string | undefined;
      for (const rule of allRules()) {
        if (!rule.selectors.includes(selector) || !(property in rule.declarations)) continue;
        if (rule.atRules.every((prelude) => holds(prelude, width, dppx))) value = rule.declarations[property];
      }
      return value;
    };

    it.each([
      [".lcd.ach-dial", "--pixel-display-size"],
      [".background-summary", "--background-reading-size"],
    ])("sizes %s on the pixel grid", (selector, property) => {
      for (const width of [1440, 1180]) {
        for (const dppx of [1, 1.25, 1.5]) {
          const size = Number.parseFloat(cascaded(selector, property, width, dppx) ?? "NaN");
          const perFontPixel = (size * dppx) / 12;
          expect(Math.abs(perFontPixel - Math.round(perFontPixel)), `${width}px at ${dppx}dppx: ${size}px`).toBeLessThan(1e-9);
        }
      }
    });

    // The sizes above only hold if every digit rule reads them.
    it.each([
      [".ach-dial .lcd-value b", "line-height", "--pixel-display-size"],
      [".ach-dial-stat", "font-size", "--pixel-display-size"],
      [".ach-dial-stat", "line-height", "--pixel-display-size"],
      [".background-reading b", "font-size", "--background-reading-size"],
      [".background-reading > p", "line-height", "--background-reading-size"],
    ])("sets %s %s from %s everywhere", (selector, property, token) => {
      const values = allRules()
        .filter((rule) => rule.selectors.includes(selector) && property in rule.declarations)
        .map((rule) => rule.declarations[property]);
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) expect(value).toBe(`var(${token})`);
    });
  });

  // Spec「字体」: GST Pixel only on the screen.
  it("keeps the pixel font on the screen", () => {
    const users = allRules().filter((rule) => Object.values(rule.declarations).some((value) => value.includes("var(--font-pixel)")));
    expect(users.length).toBeGreaterThan(0);
    for (const rule of users) {
      for (const selector of rule.selectors) expect(selector).toMatch(/^\.lcd/);
    }
  });

  // Spec 迁移表「设置页」: the settings screen only takes the shared paper (no ghost).
  it("lets the settings screen inherit the paper", () => {
    const declarations = topLevel(".settings-lcd");
    for (const property of ["background", "color", "box-shadow", "border-radius"]) {
      expect(declarations[property], property).toBeUndefined();
    }
  });

  // Spec 墨水屏配方「残影」, plan trade-off 14: the previous reading in --eink-ghost, 2px down and right,
  // beneath the current one and never animated.
  it("prints the ghost of the previous reading 2px down and right, beneath the reading", () => {
    expect(topLevel(".lcd-value").position).toBe("relative");

    const ghost = topLevel(".lcd-value.lcd-ghost");
    expect(ghost.position).toBe("absolute");
    expect(ghost.top).toBe("2px");
    expect(ghost.left).toBe("2px");
    expect(ghost.width).toBe("100%");
    expect(ghost.color).toBe("var(--eink-ghost)");
    expect(ghost["z-index"]).toBe("0");
    expect(ghost["pointer-events"]).toBe("none");

    expect(topLevel(".lcd-ghost b::before").content).toBe("attr(data-text)");
    expect(topLevel(".lcd-ghost small::before").content).toBe("attr(data-text)");

    const reading = topLevel(".lcd-value:not(.lcd-ghost) > span:not(.lcd-ghost)");
    expect(reading.position).toBe("relative");
    expect(reading["z-index"]).toBe("1");

    for (const rule of allRules()) {
      if (!rule.selectors.some((selector) => selector.includes(".lcd-ghost"))) continue;
      const label = `${rule.atRules.join(" ")} ${rule.selector}`;
      expect(rule.declarations.transition, label).toBeUndefined();
      expect(rule.declarations.animation, label).toBeUndefined();
      expect(rule.declarations.color ?? "var(--eink-ghost)", label).toBe("var(--eink-ghost)");
    }
  });
});

// Plan task 13, spec 迁移表「成就热力图」: the same ink levels printed in --eink-ink, one grading for
// both themes and no glow.
describe("achievements heatmap ink", () => {
  // Built from pieces so a repo-wide search for the retired tokens finds only real uses.
  const OLD_INK = "var(--" + "lcd";
  const DARK = ':root[data-theme="dark"] ';
  const achievementRules = () => allRules().filter((rule) => rule.file.includes("AchievementsPage"));
  const mix = (percent: number) => `color-mix(in srgb, var(--eink-ink) ${percent}%, transparent)`;

  it("leaves no LCD ink in the achievements stylesheet", () => {
    for (const rule of achievementRules()) {
      const text = Object.values(rule.declarations).join(" ");
      expect(text, `${rule.atRules.join(" ")} ${rule.selector}`).not.toContain(OLD_INK);
    }
  });

  it("dots the month and reading rules in --eink-ink at 22%", () => {
    expect(normalize(topLevel(".lcd.ach-dial")["--ach-rule"])).toBe(`2px dotted ${mix(22)}`);
  });

  it.each([
    [".ach-cell.l0", "background", mix(9)],
    [".ach-cell.l0", "box-shadow", `inset 0 0 0 1px ${mix(20)}`],
    [".ach-cell.is-used", "background", "color-mix(in srgb, var(--eink-ink) var(--heat, 100%), transparent)"],
    [".ach-cell.is-future", "outline", `1px dashed ${mix(42)}`],
    [".ach-cell.is-norecord::after", "background", mix(34)],
    [".ach-cell.is-outside::after", "background", mix(18)],
    [".ach-cell.is-today", "outline", "1px solid var(--eink-ink)"],
  ])("prints %s %s as %s", (selector, property, value) => {
    expect(normalize(topLevel(selector)[property])).toBe(value);
  });

  // Any stylesheet, any at-rule: a cell may only carry the l0 hairline ring (an unblurred inset), never a glow.
  it("draws no cell with a glow", () => {
    const cellRules = allRules().filter((rule) => rule.selectors.some((selector) => selector.includes(".ach-cell")));
    expect(cellRules.length).toBeGreaterThan(0);
    for (const rule of cellRules) {
      const label = `${rule.atRules.join(" ")} ${rule.selector}`;
      const shadow = normalize(rule.declarations["box-shadow"] ?? "none");
      expect(shadow, label).toMatch(/^(none|inset 0 0 0 1px color-mix\(in srgb, var\(--eink-ink\) \d+%, transparent\))$/);
      expect(rule.declarations.filter, label).toBeUndefined();
      expect(rule.declarations["text-shadow"], label).toBeUndefined();
    }
  });

  it.each([".ach-weekday", ".ach-dial-stat small", ".ach-legend"])(
    "prints %s in --eink-dim without a text shadow override",
    (selector) => {
      const declarations = topLevel(selector);
      expect(declarations.color).toBe("var(--eink-dim)");
      expect(declarations["text-shadow"]).toBeUndefined();
    },
  );

  it("shares one grading between the themes", () => {
    const heatmap = /\.ach-(cell|dial|legend|weekday|month|readings|rule-top|pair|caption)/;
    const darkHeatmap = allRules().flatMap((rule) =>
      rule.selectors.filter((selector) => selector.startsWith(DARK) && heatmap.test(selector)),
    );
    expect(darkHeatmap).toEqual([]);
  });
});

// Plan task 14: the statistics recorder prints on the shared e-ink paper; only colours change.
describe("statistics recorder on e-ink paper", () => {
  // Built from pieces so a repo-wide search for the signal token finds only real uses.
  const SIGNAL = "var(--" + "signal";
  const RECORDER = [
    ".recorder", ".paper", ".recorder-svg", ".recorder-svg text", ".recorder-svg .day", ".recorder-svg .vals",
    ".rule-major", ".rule-minor", ".rule-day", ".rule-tick", ".scale", ".day", ".vals", ".vals-strong", ".vals-dim",
    ".hover-band", ".needle-rec", ".needle-cap", ".needle-act", ".gap", ".avg", ".avg-mark", ".trace", ".trace-dot",
    ".trace-label", ".pen", ".pen-arm",
  ];
  const recorderRules = () =>
    allRules().filter(
      (rule) => rule.file.includes("StatisticsPage") && rule.selectors.some((selector) => RECORDER.includes(selector)),
    );
  const mix = (name: string, percent: number) => `color-mix(in srgb, var(--${name}) ${percent}%, transparent)`;

  it.each([
    [".paper", ".lcd"],
    [".paper::before", ".lcd::before"],
    [".paper::after", ".lcd::after"],
  ])("paints %s with the screen's own rule", (paper, screen) => {
    const shared = allRules().filter((rule) => rule.atRules.length === 0 && rule.selectors.includes(paper));
    expect(shared.some((rule) => rule.selectors.includes(screen) && rule.file.includes("styles.css"))).toBe(true);
  });

  it("lays the paper on the screen recipe instead of the raised panel and its shadows", () => {
    const declarations = topLevel(".paper");
    expect(declarations.background).toBe("var(--eink-paper)");
    expect(declarations.color).toBe("var(--eink-ink)");
    expect(declarations["border-radius"]).toBe("var(--radius-screen)");
    expect(normalize(declarations["box-shadow"])).toBe(
      "inset 0 1px 3px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(0, 0, 0, 0.1), 0 1px 0 var(--glass-hi)",
    );
    expect(declarations.position).toBe("relative");
    expect(declarations.overflow).toBe("hidden");
    // The pixel font stays on .lcd: the recorder keeps its fonts (trade-off 15).
    expect(declarations["font-family"]).toBeUndefined();
  });

  it("lifts the chart above the grain and the matte wash", () => {
    const declarations = topLevel(".paper > .recorder-svg");
    expect(declarations.position).toBe("relative");
    expect(declarations["z-index"]).toBe("1");
    // The hover card sits inside the paper as well, so it must stay above the raised chart.
    expect(Number(topLevel(".trend-tip")["z-index"])).toBeGreaterThan(Number(declarations["z-index"]));
  });

  // v0.4.1: the two grey roller strips at the ends are gone; the paper fills the panel with the plate inset.
  it("drops the recessed tray and the rollers, insetting the paper like the other plates", () => {
    const declarations = topLevel(".recorder");
    expect(declarations.background).toBeUndefined();
    expect(declarations["box-shadow"]).toBeUndefined();
    expect(declarations.display).toBeUndefined();
    expect(declarations["grid-template-columns"]).toBeUndefined();
    expect(declarations.padding).toBeUndefined();
    expect(declarations.margin).toBe("0 var(--screen-inset) var(--screen-inset)");
    expect(allRules().filter((rule) => rule.selectors.some((selector) => selector.includes(".roller")))).toEqual([]);
  });

  it.each([
    [".rule-major", "stroke", "var(--eink-track)"],
    [".rule-day", "stroke", "var(--eink-track)"],
    [".rule-minor", "stroke", "var(--eink-track)"],
    [".rule-minor", "opacity", "0.7"],
    [".rule-tick", "stroke", "var(--eink-mid)"],
    [".avg", "stroke", "var(--eink-mid)"],
    [".avg-mark", "fill", "var(--eink-mid)"],
    // 用户已确认（2026-11-23）: the full --eink-mid, so the no-record box clears 3:1 on every paper stop.
    [".gap", "stroke", "var(--eink-mid)"],
    [".scale", "fill", "var(--eink-dim)"],
    [".day", "fill", "var(--eink-dim)"],
    [".vals-dim", "fill", "var(--eink-dim)"],
    [".vals-strong", "fill", "var(--eink-ink)"],
    [".needle-act", "fill", "var(--eink-ink)"],
    [".pen", "fill", "var(--eink-ink)"],
    [".needle-rec", "fill", mix("eink-ink", 16)],
    [".needle-cap", "stroke", "var(--eink-dim)"],
    [".trace", "stroke", "var(--eink-dim)"],
    [".trace-label", "fill", "var(--eink-dim)"],
    [".trace-dot", "fill", "var(--eink-paper-solid)"],
    [".trace-dot", "stroke", "var(--eink-dim)"],
    [".hover-band", "fill", mix("eink-ink", 10)],
    [".pen-arm", "stroke", "var(--eink-mid)"],
  ])("prints %s %s as %s", (selector, property, value) => {
    expect(normalize(topLevel(selector)[property])).toBe(value);
  });

  it("keeps the recording lamp in signal orange", () => {
    const declarations = topLevel(".pen-lamp");
    expect(declarations.fill).toBe(`${SIGNAL})`);
    expect(normalize(declarations.filter)).toBe(`drop-shadow(0 0 3px ${SIGNAL}))`);
  });

  it("keeps the recorder's fonts", () => {
    // Dates and the 活跃 / 记录 values use the number font like the scales; nothing switches back to the UI font.
    expect(topLevel(".recorder-svg text")["font-family"]).toBe("var(--font-num)");
    expect(topLevel(".recorder-svg .day")["font-family"]).toBeUndefined();
    expect(topLevel(".recorder-svg .vals")["font-family"]).toBeUndefined();
  });

  it("paints the recorder only with e-ink tokens, in one recipe for both themes", () => {
    const rules = recorderRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      const label = `${rule.atRules.join(" ")} ${rule.selector}`;
      const tokens = Object.values(rule.declarations).join(" ").match(/var\(--[\w-]+/g) ?? [];
      for (const used of tokens) expect(used, label).toMatch(/^var\(--(eink-|font-|radius-|screen-inset)/);
    }
    // Any dark-theme selector naming a recorder class anywhere (compound, descendant or pseudo-element).
    const classes = [...new Set(RECORDER.flatMap((selector) => selector.match(/\.[\w-]+/g) ?? []))];
    const recorderClass = new RegExp(`(?:${classes.map((name) => `\\${name}`).join("|")})(?![\\w-])`);
    const darkRecorder = allRules().flatMap((rule) =>
      rule.selectors.filter((selector) => /data-theme=["']?dark/.test(selector) && recorderClass.test(selector)),
    );
    expect(darkRecorder).toEqual([]);
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

  function expectWithinLimitAndFlat(container: HTMLElement, page: string, limit = MAX_LAYERS): HTMLElement[] {
    const layers = glassLayers(container);
    expect(layers.length, `${page}: ${layers.length} blurred layers`).toBeLessThanOrEqual(limit);
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
    // The sidebar, the 本机状态 readout and six groups (v0.4.4 §A's five plus v0.4.6 关于与反馈), two over
    // DESIGN.md's limit of six. At 1440×900 only five are on screen at once; the added group sits at the
    // bottom with 隐私, below the fold. 设置 is the only page allowed these two extra layers.
    expect(expectWithinLimitAndFlat(container, "设置", MAX_LAYERS + 2)).toHaveLength(MAX_LAYERS + 2);
  }, 20000);
});

// v0.4.1: in the dark theme each segment's own-colour glow hugged its top and bottom edges, so bright
// segments read 1-2px taller than dim ones. The bar now draws flat segments of one height.
describe("today distribution bar", () => {
  it("draws every segment flat, with nothing that changes its edges", () => {
    const segment = topLevel(".mix-segment");
    for (const property of ["box-shadow", "filter", "transform", "margin", "border", "outline", "height"]) {
      expect(segment[property], property).toBeUndefined();
    }
    const segmentRules = allRules().filter((rule) => rule.selectors.some((selector) => selector.includes(".mix-segment")));
    for (const rule of segmentRules) {
      expect(rule.declarations["box-shadow"], `${rule.atRules.join(" ")} ${rule.selector}`).toBeUndefined();
    }
    expect(topLevel(".mix-bar").display).toBe("flex");
    expect(topLevel(".mix-bar")["align-items"] ?? "stretch").toBe("stretch");
  });

  it("keeps neither the old caption nor the dropped total (v0.4.7)", () => {
    const mixRules = (name: string) => allRules().filter((rule) => rule.selectors.some((selector) => selector.includes(name)));
    expect(mixRules(".mix-caption")).toEqual([]);
    expect(mixRules(".mix-total")).toEqual([]);
  });

  it("drops the glow token from both themes", () => {
    expect(themeTokens("light")["--mix-glow"]).toBeUndefined();
    expect(themeTokens("dark")["--mix-glow"]).toBeUndefined();
  });
});

// v0.4.1 (variant A, user-approved): the current page is a raised key like the toggle knob, not a flat
// --on fill with a 3px --accent side bar. States only set --nav-fill / --nav-sheen / --nav-shadow; one
// rule paints them, so the focus ring can be appended to whatever the state draws.
describe("sidebar nav keys", () => {
  const ENABLED = '.nav-key:not([aria-disabled="true"])';
  const navRules = () => allRules().filter((rule) => rule.selectors.some((selector) => /\.nav-key(?![\w-])/.test(selector)));
  /** Rules that style the key itself (no descendant part). */
  const keyRules = () => navRules().filter((rule) => rule.selectors.every((selector) => /^\.nav-key(?![\w-])\S*$/.test(selector)));

  it("draws no side bar and uses the accent only on the current page's icon", () => {
    for (const rule of navRules()) {
      const where = `${rule.atRules.join(" ")} ${rule.selector}`;
      expect(normalize(rule.declarations["box-shadow"]), where).not.toMatch(/inset -?\d+px 0 0/);
      const usesAccent = Object.values(rule.declarations).some((value) => value.includes("--accent"));
      expect(usesAccent ? rule.selector : "", where).toBe(usesAccent ? ".nav-key.is-active svg" : "");
    }
    expect(topLevel(".nav-key.is-active svg").color).toBe("var(--accent)");
  });

  it("keeps the key box and never moves it in any state", () => {
    const key = topLevel(".nav-key");
    expect(key.height).toBe("44px");
    expect(key.padding).toBe("0 12px");
    expect(key.border).toBe("0");
    expect(key["border-radius"]).toBe("var(--radius-key)");
    for (const rule of keyRules().filter((rule) => rule.selector !== ".nav-key")) {
      for (const property of ["height", "padding", "margin", "border", "border-width", "transform", "translate", "top"]) {
        expect(rule.declarations[property], `${rule.selector} ${property}`).toBeUndefined();
      }
    }
  });

  it("paints every enabled key and the current one from the state variables", () => {
    const paint = allRules().find(
      (rule) =>
        rule.atRules.length === 0 &&
        rule.selectors.length === 2 &&
        rule.selectors.includes(ENABLED) &&
        rule.selectors.includes(".nav-key.is-active"),
    );
    expect(paint?.declarations["background-color"]).toBe("var(--nav-fill)");
    expect(paint?.declarations["background-image"]).toBe("var(--nav-sheen)");
    expect(paint?.declarations["box-shadow"]).toBe("var(--nav-shadow)");

    const rest = topLevel(".nav-key");
    expect(rest["--nav-fill"]).toBe("transparent");
    expect(rest["--nav-sheen"]).toBe("none");
  });

  it("raises the current key with a rim, lit top, dark bottom and a lift, both at rest and hovered", () => {
    for (const selector of [".nav-key.is-active", ".nav-key.is-active:hover"]) {
      const declarations = topLevel(selector);
      expect(declarations["--nav-fill"], selector).toBe("var(--nk-fill)");
      expect(declarations["--nav-sheen"], selector).toBe("var(--nk-sheen)");
      expect(normalize(declarations["--nav-shadow"]), selector).toBe(
        "0 0 0 1px var(--nk-rim), inset 0 1px 0 var(--nk-hi), inset 0 -1px 0 var(--nk-lo), var(--nk-lift)",
      );
      expect(declarations.color, selector).toBe("var(--ink)");
      expect(declarations["--muted"], selector).toBe("var(--ink-2)");
    }
  });

  it("pushes a pressed key in", () => {
    expect(normalize(topLevel(".nav-key.is-active:active")["--nav-shadow"])).toBe(
      "0 0 0 1px var(--nk-rim), inset 0 1px 2px var(--nk-lo), var(--nk-lift-press)",
    );
    const press = topLevel(`${ENABLED}:active`);
    expect(press["--nav-fill"]).toBe("var(--chip)");
    expect(normalize(press["--nav-shadow"])).toBe("0 0 0 1px var(--nk-hover-rim), inset 0 1px 2px var(--nk-lo)");
    expect(press["--muted"]).toBe("var(--ink-2)");
  });

  it("outlines a hovered key flat and faint", () => {
    const hover = topLevel(`${ENABLED}:hover`);
    expect(hover["--nav-fill"]).toBe("var(--nk-hover-fill)");
    expect(normalize(hover["--nav-shadow"])).toBe("0 0 0 1px var(--nk-hover-rim)");
    expect(hover["--muted"]).toBe("var(--ink-2)");
  });

  it("appends the focus ring to the state's own shadows", () => {
    expect(normalize(topLevel(`${ENABLED}:focus-visible`)["box-shadow"])).toBe("var(--nav-shadow), var(--focus)");
    expect(topLevel(".nav-key.is-active:focus-visible")["box-shadow"]).toBeUndefined();
  });

  it.each(["light", "dark"] as const)("defines every key token in the %s theme", (theme) => {
    const tokens = themeTokens(theme);
    for (const name of ["--nk-fill", "--nk-sheen", "--nk-rim", "--nk-hi", "--nk-lo", "--nk-lift", "--nk-lift-press", "--nk-hover-fill", "--nk-hover-rim"]) {
      expect(tokens[name], `${theme} ${name}`).toBeDefined();
    }
    expect(parseColor(resolve("var(--nk-fill)", tokens)).a).toBeGreaterThan(0);
  });
});

// Apple HIG scroll edge effect: a list that continues past an edge fades out there instead of being cut hard.
// Driven by each list's own scroll position, so a list that fits shows no fade.
describe("scroll edges", () => {
  const SUPPORTS = "@supports (animation-timeline: scroll())";
  const LISTS = [
    ".usage-scroll",
    ".mix-scroll",
    ".recent-scroll",
    ".discovered-scroll",
    ".ach-coming-list",
    ".poster-list",
    ".add-software-results",
  ];

  it.each(LISTS)("%s fades at the edges it scrolls past", (selector) => {
    const declarations = inMedia(SUPPORTS, selector);
    expect(normalize(declarations["mask-image"]), selector).toBe(
      "linear-gradient(to bottom, transparent 0, #000 var(--fade-top), #000 calc(100% - var(--fade-bottom)), transparent 100%)",
    );
    expect(declarations["animation-name"] ?? normalize(declarations.animation), selector).toContain("scroll-edge-fade");
    expect(declarations["animation-timeline"], selector).toBe("scroll(self)");
  });

  it("keeps the sticky 后台 table head clear by fading only the bottom", () => {
    expect(inMedia(SUPPORTS, ".usage-scroll:has(.background-table)")["animation-name"]).toBe("scroll-edge-fade-bottom");
  });

  it.each([".stats-page", ".achievements-page", ".settings-page"])(
    "%s fades only at the top, under the page title",
    (selector) => {
      const declarations = inMedia(SUPPORTS, selector);
      expect(normalize(declarations["mask-image"]), selector).toBe("linear-gradient(to bottom, transparent 0, #000 var(--fade-top))");
      expect(normalize(declarations.animation), selector).toContain("scroll-edge-fade-top");
      expect(declarations["animation-timeline"], selector).toBe("scroll(self)");
      expect(inMedia("@media (forced-colors: active)", selector)["mask-image"], selector).toBe("none");
    },
  );

  it("drops the fade while the list has keyboard focus, so its focus ring stays whole", () => {
    expect(inMedia(SUPPORTS, ".usage-scroll:focus-visible")["mask-image"]).toBe("none");
  });

  it("drops the fade in contrast themes", () => {
    expect(inMedia("@media (forced-colors: active)", ".usage-scroll")["mask-image"]).toBe("none");
  });
});

// Apple HIG: one or two prominent buttons per view. 软件 keeps the dark 添加… key on 特别关注 only; the hidden
// list's 添加… is a secondary key, drawn like the 编辑 key beside it.
describe("secondary add key", () => {
  it("draws the hidden list's 添加… like the panel's other secondary keys", () => {
    const key = topLevel(".panel-add-button.is-secondary");
    expect(key.background).toBe("var(--glass-2)");
    expect(key.color).toBe("var(--ink-2)");
    expect(normalize(key["box-shadow"])).toBe("inset 0 0 0 1px var(--edge-strong)");
    expect(normalize(topLevel(".panel-add-button.is-secondary:focus-visible")["box-shadow"])).toBe(
      "inset 0 0 0 1px var(--edge-strong), var(--focus)",
    );
    expect(topLevel(".panel-add-button.is-secondary:hover").background).toBe("var(--on)");
  });
});

// Glass decision C (user, 2026-11-26): the content panels keep their glass, and the sidebar floats as a glass
// card inset from the window, as in Apple's floating sidebars, with the glow running beneath it.
describe("floating sidebar", () => {
  it("insets the sidebar from the window as a glass card on the panel recipe", () => {
    const sidebar = topLevel(".sidebar");
    expect(sidebar.margin).toBe("10px 0 10px 12px");
    expect(sidebar["border-radius"]).toBe("var(--radius-panel)");
    expect(sidebar["border-right"]).toBeUndefined();
    expect(sidebar.outline).toBe("1px solid var(--edge)");
    expect(sidebar["outline-offset"]).toBe("-1px");
    expect(normalize(sidebar["box-shadow"])).toBe("var(--glass-shadow), inset 0 2px 0 var(--glass-hi)");
    expect(sidebar.background).toBe("var(--side-surface)");
  });

  it("keeps the sidebar 232px (196px under 1200px) inside its wider column", () => {
    expect(topLevel(".app-shell")["grid-template-columns"]).toBe("244px minmax(0, 1fr)");
    expect(inMedia("@media (max-width: 1200px)", ".app-shell")["grid-template-columns"]).toBe("208px minmax(0, 1fr)");
  });
});

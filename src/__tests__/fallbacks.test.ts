import { describe, expect, it } from "vitest";
import { allCss, parseRules, type CssRule } from "./support/css";

// Built from pieces so a repo-wide search for the property finds only real uses.
const BLUR_PROPERTY = "backdrop" + "-filter";

const rules = parseRules(allCss()["styles.css"]).rules;

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** Rules whose enclosing at-rules are exactly `atRules` and that list `selector`. */
function rulesFor(selector: string, atRules: string[] = []): CssRule[] {
  const wanted = atRules.map(normalize);
  return rules.filter(
    (rule) =>
      rule.atRules.length === wanted.length &&
      rule.atRules.every((prelude, index) => normalize(prelude) === wanted[index]) &&
      rule.selectors.includes(selector),
  );
}

/** Declarations of every matching rule merged in source order. */
function declarationsFor(selector: string, atRules: string[] = []): Record<string, string> {
  return Object.assign({}, ...rulesFor(selector, atRules).map((rule) => rule.declarations));
}

const SWITCH_TOKENS = ["--glass-surface", "--side-surface", "--glass-filter"];
const FORCED = ["@media (forced-colors: active)"];

describe("glass switch tokens", () => {
  it("default to the translucent glass and the 30px blur", () => {
    const root = rules.filter(
      (rule) =>
        rule.atRules.length === 0 &&
        rule.selectors.length === 1 &&
        rule.selectors[0] === ":root" &&
        SWITCH_TOKENS.some((name) => name in rule.declarations),
    );
    expect(root).toHaveLength(1);
    expect(root[0].declarations["--glass-surface"]).toBe("var(--glass)");
    expect(root[0].declarations["--side-surface"]).toBe("var(--side)");
    expect(normalize(root[0].declarations["--glass-filter"])).toBe("blur(30px) saturate(1.4)");
  });

  it.each([
    ["Windows transparency off", ':root[data-glass="off"]', []],
    ["reduced transparency", ":root", ["@media (prefers-reduced-transparency: reduce)"]],
    ["no blur support", ":root", [`@supports not (${BLUR_PROPERTY}: blur(1px))`]],
  ])("switch to opaque panels without blur for %s", (_label, selector, atRules) => {
    const declarations = declarationsFor(selector, atRules);
    expect(declarations["--glass-surface"]).toBe("var(--glass-solid)");
    expect(declarations["--side-surface"]).toBe("var(--glass-solid)");
    expect(declarations["--glass-filter"]).toBe("none");
  });
});

describe("forced colors", () => {
  it("keeps a visible focus outline", () => {
    const outline = declarationsFor(":focus-visible", FORCED).outline;
    expect(outline).toBeDefined();
    expect(outline).toMatch(/Highlight/);
  });

  it("marks the current nav item and selected option with a thin outline", () => {
    for (const selector of [".nav-key.is-active", ".segmented-option.is-selected"]) {
      expect(normalize(declarationsFor(selector, FORCED).outline ?? ""), selector).toBe("1px solid Highlight");
    }
  });

  it("keeps focus on a marked item thicker than the marker", () => {
    const declarations = declarationsFor(":is(.nav-key.is-active, .segmented-option.is-selected):focus-visible", FORCED);
    expect(declarations["outline-width"]).toBe("2px");
    expect(declarations["outline-offset"]).toBe("2px");
  });

  it("fills a switched-on toggle with Highlight", () => {
    const declarations = declarationsFor(".toggle.is-on", FORCED);
    expect(declarations["forced-color-adjust"]).toBe("none");
    expect(declarations.background).toBe("Highlight");
    expect(declarationsFor(".toggle.is-on .toggle-knob", FORCED).background).toBe("HighlightText");
  });

  it("keeps a switched-off toggle visible", () => {
    const track = declarationsFor(".toggle", FORCED);
    expect(track.outline).toBe("1px solid ButtonText");
    expect(track["outline-offset"]).toBe("-1px");
    const knob = declarationsFor(".toggle-knob", FORCED);
    expect(knob["forced-color-adjust"]).toBe("none");
    expect(knob.background).toBe("ButtonText");
  });

  // The switch opts out of forced colours, so its own shadows would still be drawn in theme colours:
  // the knob's soft shadow and the glass focus ring under the Highlight outline.
  it("draws the toggle in system colours only", () => {
    expect(declarationsFor(".toggle-knob", FORCED)["box-shadow"]).toBe("none");
    expect(declarationsFor(".toggle.is-on:focus-visible", FORCED)["box-shadow"]).toBe("none");
  });

  it("drops the screen texture layers", () => {
    expect(declarationsFor(".lcd::before", FORCED).display).toBe("none");
    expect(declarationsFor(".lcd::after", FORCED).display).toBe("none");
  });

  it("paints the page in Canvas without the glow", () => {
    const background = declarationsFor("body", FORCED).background;
    expect(background).toBe("Canvas");
    expect(background).not.toContain("var(--glow)");
  });

  it("draws panels in system colours", () => {
    for (const selector of [".sidebar", ".panel", ".readout", ".software-panel", ".lcd", ".dialog", ".add-software-dialog"]) {
      const declarations = declarationsFor(selector, FORCED);
      expect(declarations.background, selector).toBe("Canvas");
      expect(declarations.color, selector).toBe("CanvasText");
    }
    for (const selector of [".sidebar", ".lcd", ".dialog", ".add-software-dialog"]) {
      expect(normalize(declarationsFor(selector, FORCED).border ?? ""), selector).toBe("1px solid CanvasText");
    }
    // Glass panels keep their inset outline (decision 2A), so a border would move their content.
    for (const selector of [".panel", ".readout", ".software-panel"]) {
      const declarations = declarationsFor(selector, FORCED);
      expect(declarations.border, selector).toBeUndefined();
      expect(normalize(declarations.outline ?? ""), selector).toBe("1px solid CanvasText");
    }
  });

  // The opaque sticky heads paint over the panel outline, and forced colours drop the box-shadow
  // that redraws it, so the head draws the edge with a border at its two ends.
  it.each([
    [".focused-table-head", "border-inline"],
    [".background-table th:first-child", "border-left"],
    [".background-table th:last-child", "border-right"],
  ])("keeps the panel edge beside the sticky head %s", (selector, property) => {
    expect(normalize(declarationsFor(selector, FORCED)[property] ?? ""), selector).toBe("1px solid CanvasText");
  });
});

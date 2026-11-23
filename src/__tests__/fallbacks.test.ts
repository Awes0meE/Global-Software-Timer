import { describe, expect, it } from "vitest";
import { allCss, allRules, parseRules, type CssRule } from "./support/css";

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
  // The statistics date fields inherit the app theme's color-scheme outside contrast themes.
  it("lets the date fields' calendar icon follow the contrast palette", () => {
    expect(declarationsFor(".stats-date", FORCED)["color-scheme"]).toBe("light dark");
  });

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

  // The 3D slider (plan task 7, 2026-11-23): the well gradient, the rim and well shadows and the knob's
  // specular hotspot are theme paint, which the switched-on track and the knob would otherwise keep.
  it("removes the slider's gradients, shadows and hotspot", () => {
    const track = declarationsFor(".toggle", FORCED);
    expect(track["background-image"]).toBe("none");
    expect(track["box-shadow"]).toBe("none");
    const onTrack = declarationsFor(".toggle.is-on", FORCED);
    // The background shorthand also resets the well gradient image.
    expect(onTrack.background).toBe("Highlight");
    expect(onTrack["box-shadow"]).toBe("none");
    expect(declarationsFor(".toggle-knob::after", FORCED).display).toBe("none");
  });

  // The forced rules above are plain class selectors. A hover, press or focus rule that set paint
  // directly would outrank them (a hover lift on the knob, the lighter on-track), so those states may
  // only swap --toggle-* custom properties; just these rules paint the switch. Every stylesheet counts,
  // and so does any selector whose last compound is the track or the knob (".bar .toggle:hover").
  it("paints the switch only from rules the forced block outranks", () => {
    const PAINT = ["background", "background-color", "background-image", "box-shadow"];
    const SWITCH = /\.toggle(?:-knob)?(?![\w-])/;
    const lastCompound = (selector: string) => selector.trim().split(/\s*[>+~]\s*|\s+/).pop() ?? "";
    const painting = allRules()
      .filter((rule) => !rule.atRules.map(normalize).includes(FORCED[0]))
      .filter((rule) => PAINT.some((property) => property in rule.declarations))
      .flatMap((rule) => rule.selectors.filter((selector) => SWITCH.test(lastCompound(selector))));
    expect([...new Set(painting)].sort()).toEqual(
      [".toggle", ".toggle-knob", ".toggle-knob::after", ".toggle.is-on", ".toggle:focus-visible"].sort(),
    );
    // The switched-on track and the knob opt out of forced colours, so their paint rules have later
    // forced counterparts of at least their specificity. The off track's focus shadow is removed by the
    // browser, since the off track keeps forced-color-adjust: auto.
    expect(declarationsFor(".toggle-knob", FORCED).background).toBe("ButtonText");
    expect(declarationsFor(".toggle.is-on", FORCED).background).toBe("Highlight");
    expect(declarationsFor(".toggle.is-on:focus-visible", FORCED)["box-shadow"]).toBe("none");
  });

  it("drops the screen texture layers", () => {
    expect(declarationsFor(".lcd::before", FORCED).display).toBe("none");
    expect(declarationsFor(".lcd::after", FORCED).display).toBe("none");
  });

  // Plan task 14: the recorder paper is an e-ink screen too, so it leaves contrast themes the same way.
  it("drops the recorder paper's texture layers with the screen's", () => {
    for (const layer of ["::before", "::after"]) {
      const shared = rulesFor(`.paper${layer}`, FORCED);
      expect(shared.length, layer).toBeGreaterThan(0);
      for (const rule of shared) expect(rule.selectors, layer).toContain(`.lcd${layer}`);
      expect(declarationsFor(`.paper${layer}`, FORCED).display, layer).toBe("none");
    }
  });

  // The paper is an e-ink screen, so it takes the same Canvas / CanvasText reset and inset outline
  // (decision G-B) as .lcd, from the same rules; the panel checks below cover the values.
  it("resets the recorder paper in the screen's own forced-colour rules", () => {
    const shared = rulesFor(".paper", FORCED);
    expect(shared.length).toBeGreaterThan(0);
    for (const rule of shared) expect(rule.selectors).toContain(".lcd");
  });

  it("drops the readout ghost", () => {
    // As specific as the ghost's own rule, so the drop does not rest on source order alone.
    expect(declarationsFor(".lcd-value.lcd-ghost", FORCED).display).toBe("none");
  });

  it("paints the page in Canvas without the glow", () => {
    const background = declarationsFor("body", FORCED).background;
    expect(background).toBe("Canvas");
    expect(background).not.toContain("var(--glow)");
  });

  it("draws panels in system colours", () => {
    for (const selector of [".sidebar", ".panel", ".readout", ".software-panel", ".lcd", ".paper", ".dialog", ".add-software-dialog"]) {
      const declarations = declarationsFor(selector, FORCED);
      expect(declarations.background, selector).toBe("Canvas");
      expect(declarations.color, selector).toBe("CanvasText");
    }
    for (const selector of [".sidebar", ".dialog", ".add-software-dialog"]) {
      expect(normalize(declarationsFor(selector, FORCED).border ?? ""), selector).toBe("1px solid CanvasText");
    }
    // Glass panels keep their inset outline (decision 2A), so a border would move their content. The
    // e-ink screens take the same inset outline (decision G-B), so the readout keeps its v0.3.1 height.
    for (const selector of [".panel", ".readout", ".software-panel", ".lcd", ".paper"]) {
      const declarations = declarationsFor(selector, FORCED);
      expect(declarations.border, selector).toBeUndefined();
      expect(normalize(declarations.outline ?? ""), selector).toBe("1px solid CanvasText");
    }
  });

  // One forced-colours rule sets the -1px offset for the panels and the screens alike; the screens are
  // the selectors with no outline outside that block.
  it("insets the outline of the glass panels and the e-ink screen (decisions 2A, G-B)", () => {
    for (const selector of [".panel", ".readout", ".software-panel", ".lcd", ".paper"]) {
      expect(declarationsFor(selector, FORCED)["outline-offset"], selector).toBe("-1px");
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

  // Forced colours drop the box-shadow lines of reached plates but keep the unlit plates' dashed border,
  // so reached plates (and the 6666-hour one in Highlight) get inset outlines that leave the box alone.
  it.each([
    [".ach-plate.is-reached", "1px solid CanvasText", "-1px"],
    [".ach-plate.is-reached.is-ultimate", "2px solid Highlight", "-2px"],
  ])("outlines the milestone plate %s", (selector, outline, offset) => {
    const declarations = declarationsFor(selector, FORCED);
    expect(normalize(declarations.outline ?? ""), selector).toBe(outline);
    expect(declarations["outline-offset"], selector).toBe(offset);
  });
});

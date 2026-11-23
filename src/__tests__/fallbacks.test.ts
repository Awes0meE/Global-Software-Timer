import { describe, expect, it } from "vitest";
import { allCss, allRules, parseRules, resolve, type CssRule } from "./support/css";

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

/** Rules of a component stylesheet inside the forced-colours block that list `selector`. */
function forcedRulesIn(file: string, selector: string): CssRule[] {
  return parseRules(allCss()[file]).rules.filter(
    (rule) =>
      rule.atRules.length === 1 && normalize(rule.atRules[0]) === FORCED[0] && rule.selectors.includes(selector),
  );
}

function forcedIn(file: string, selector: string): Record<string, string> {
  return Object.assign({}, ...forcedRulesIn(file, selector).map((rule) => rule.declarations));
}

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

  // Forced colours drop the box-shadow lines of reached plates but keep the unlit plates' dashed inset outline,
  // so reached plates (and the 6666-hour one in Highlight) get inset outlines that leave the box alone.
  it.each([
    [".ach-plate.is-reached", "1px solid CanvasText", "-1px"],
    [".ach-plate.is-reached.is-ultimate", "2px solid Highlight", "-2px"],
  ])("outlines the milestone plate %s", (selector, outline, offset) => {
    const declarations = declarationsFor(selector, FORCED);
    expect(normalize(declarations.outline ?? ""), selector).toBe(outline);
    expect(declarations["outline-offset"], selector).toBe(offset);
  });

  // An unlit plate's dashed inset outline is forced to CanvasText but keeps its dashes, so it stays apart from
  // the reached plates' solid one; no forced rule in any stylesheet may restyle the outline of a plate selector
  // that does not require .is-reached (".ach-plate", ".ach-plate.is-slot", ...).
  it("leaves the unlit plate's dashed outline to the forced palette", () => {
    const OUTLINE = ["outline", "outline-style", "outline-color", "outline-width"];
    const lastCompound = (selector: string) => selector.trim().split(/\s*[>+~]\s*|\s+/).pop() ?? "";
    const restyling = allRules()
      .filter((rule) => rule.atRules.map(normalize).includes(FORCED[0]))
      .filter((rule) => OUTLINE.some((property) => property in rule.declarations))
      .flatMap((rule) =>
        rule.selectors
          .filter((selector) => /\.ach-plate(?![\w-])/.test(lastCompound(selector)))
          .filter((selector) => !/\.is-reached(?![\w-])/.test(lastCompound(selector)))
          .map((selector) => `${rule.file}: ${selector}`),
      );
    expect(restyling).toEqual([]);
  });

  // Task 16 acceptance: the search boxes and the 特别关注 / 已隐藏 tags draw their edge with box-shadow on
  // border 0, which forced colours drop; an inset outline draws it without changing the box. It sits before
  // the plain :focus-visible rule of the same specificity, so the 2px Highlight ring still wins on focus.
  it.each([".discovered-search", ".add-software-search", ".software-mark"])(
    "outlines %s, whose only edge is a shadow, inside its box",
    (selector) => {
      const declarations = declarationsFor(selector, FORCED);
      expect(normalize(declarations.outline ?? ""), selector).toBe("1px solid CanvasText");
      expect(declarations["outline-offset"], selector).toBe("-1px");
      const forced = rules.filter((rule) => rule.atRules.length === 1 && normalize(rule.atRules[0]) === FORCED[0]);
      const at = (wanted: string) => forced.findIndex((rule) => rule.selectors.includes(wanted));
      expect(at(selector), selector).toBeLessThan(at(":focus-visible"));
    },
  );
});

// Plan task 16 (验收 7): forced colours leave SVG fill / stroke and opted-out paint as authored, so the e-ink
// inks (the light theme's near-black ones on a dark contrast palette), the legend keys, the heatmap cells and
// the buttons' glass keys vanish. These rules redraw them in system colours and change no box.
describe("forced colors: e-ink inks, keys, buttons and scrollers", () => {
  const COMPONENT_FILES = ["AchievementsPage.css", "StatisticsPage.css"];
  const PAINT_ONLY = [
    "fill",
    "stroke",
    "background",
    "box-shadow",
    "outline",
    "outline-offset",
    "forced-color-adjust",
    "filter",
    "--eink-ink",
    "border-color",
    "border-top-color",
  ];
  const SYSTEM_COLOUR = /\b(Canvas|CanvasText|GrayText|Highlight)\b/;
  const THEME_COLOUR = /#|\brgba?\(/;
  const forcedTopLevel = () =>
    rules.filter((rule) => rule.atRules.length === 1 && normalize(rule.atRules[0]) === FORCED[0]);

  // The dial's own rules (and the tick yield under the pointer, which LcdDial.test keeps in one place) stay
  // as they are; inside the dial the ink tokens become system colours.
  const DIAL_TOKENS: Record<string, string> = {
    "--eink-ink": "CanvasText",
    "--eink-mid": "CanvasText",
    "--eink-dim": "CanvasText",
    "--eink-track": "GrayText",
    "--eink-dial-paper": "Canvas",
  };

  it("swaps the dial's ink tokens for system colours", () => {
    const declarations = declarationsFor(".lcd-dial", FORCED);
    for (const [name, value] of Object.entries(DIAL_TOKENS)) {
      expect(declarations[name], name).toBe(value);
    }
  });

  // Every fill and stroke of a dial part must resolve to system colours through those tokens alone (an
  // unknown token throws), so the pointer is CanvasText on a Canvas halo and passed ticks are CanvasText.
  it("draws every dial part in system colours", () => {
    const DIAL_PART = /^\.(lcd-ring|lcd-tick|lcd-dial-now|lcd-dial-hour|lcd-midnight-mark)(?![\w-])/;
    const painted = rules.filter(
      (rule) =>
        rule.atRules.length === 0 &&
        rule.selectors.some((selector) => DIAL_PART.test(selector)) &&
        ("fill" in rule.declarations || "stroke" in rule.declarations),
    );
    expect(painted.length).toBeGreaterThanOrEqual(8);
    for (const rule of painted) {
      for (const property of ["fill", "stroke"].filter((name) => name in rule.declarations)) {
        const value = resolve(rule.declarations[property], DIAL_TOKENS);
        expect(value, `${rule.selector} ${property}`).toMatch(SYSTEM_COLOUR);
        expect(value, `${rule.selector} ${property}`).not.toMatch(THEME_COLOUR);
      }
    }
    expect(resolve(declarationsFor(".lcd-dial-now", []).fill, DIAL_TOKENS)).toBe("CanvasText");
    expect(resolve(declarationsFor(".lcd-dial-now", []).stroke, DIAL_TOKENS)).toBe("Canvas");
  });

  it("draws the rings as a hollow GrayText track with filled lit segments", () => {
    const track = declarationsFor(".lcd-ring path", FORCED);
    expect(track.fill).toBe("Canvas");
    expect(track.stroke).toBe("GrayText");
    for (const lit of [".lcd-ring-recorded path.is-lit", ".lcd-ring-active path.is-lit"]) {
      expect(declarationsFor(lit, FORCED).stroke, lit).toBe("CanvasText");
      // The lit fill is the swapped --eink-ink / --eink-mid.
      expect(resolve(declarationsFor(lit, []).fill, DIAL_TOKENS), lit).toBe("CanvasText");
    }
  });

  it("keeps the readout legend keys, solid and striped, in CanvasText with their 12x6 box", () => {
    const key = declarationsFor(".lcd-key", FORCED);
    expect(key["forced-color-adjust"]).toBe("none");
    expect(key.background).toBe("CanvasText");
    expect(normalize(declarationsFor(".lcd-key-active", FORCED).background ?? "")).toBe(
      "repeating-linear-gradient(90deg, CanvasText 0 2px, transparent 2px 3px)",
    );
    const forced = forcedTopLevel();
    const at = (selector: string) => forced.findIndex((rule) => rule.selectors.includes(selector));
    expect(at(".lcd-key-active")).toBeGreaterThan(at(".lcd-key"));
    for (const selector of [".lcd-key", ".lcd-key-active"]) {
      for (const property of ["width", "height"]) {
        expect(declarationsFor(selector, FORCED)[property], `${selector} ${property}`).toBeUndefined();
      }
    }
  });

  // The cells (legend included) keep their own colours and print the usual ink levels in CanvasText.
  it("prints the heatmap levels, the legend and the day marks in system colours", () => {
    const file = "AchievementsPage.css";
    const cell = forcedIn(file, ".ach-cell");
    expect(cell["forced-color-adjust"]).toBe("none");
    expect(cell["--eink-ink"]).toBe("CanvasText");
    const tokens = { "--eink-ink": "CanvasText" };
    const cellRules = parseRules(allCss()[file]).rules.filter(
      (rule) => rule.atRules.length === 0 && rule.selectors.some((selector) => selector.startsWith(".ach-cell")),
    );
    for (const rule of cellRules) {
      for (const property of ["background", "box-shadow", "outline"].filter((name) => name in rule.declarations)) {
        const value = resolve(rule.declarations[property], tokens);
        expect(value, `${rule.selector} ${property}`).not.toMatch(THEME_COLOUR);
      }
    }
    // The unused-day cell is too faint at 9% / 20%, so it gets an inset GrayText ring; today keeps its own.
    const unused = forcedIn(file, ".ach-cell.l0:not(.is-today)");
    expect(normalize(unused.outline ?? "")).toBe("1px solid GrayText");
    expect(unused["outline-offset"]).toBe("-1px");
  });

  it.each([
    [".rule-major", "stroke", "GrayText"],
    [".rule-minor", "stroke", "GrayText"],
    [".rule-day", "stroke", "GrayText"],
    [".rule-tick", "stroke", "GrayText"],
    [".gap", "stroke", "GrayText"],
    [".avg", "stroke", "GrayText"],
    [".avg-mark", "fill", "GrayText"],
    [".pen-arm", "stroke", "GrayText"],
    [".needle-rec", "fill", "GrayText"],
    [".needle-cap", "stroke", "CanvasText"],
    [".needle-act", "fill", "CanvasText"],
    [".scale", "fill", "CanvasText"],
    [".day", "fill", "CanvasText"],
    [".vals-strong", "fill", "CanvasText"],
    [".vals-dim", "fill", "CanvasText"],
    [".trace", "stroke", "CanvasText"],
    [".trace-dot", "fill", "Canvas"],
    [".trace-dot", "stroke", "CanvasText"],
    [".trace-label", "fill", "CanvasText"],
    [".pen", "fill", "CanvasText"],
    [".pen-lamp", "fill", "Highlight"],
    [".pen-lamp", "filter", "none"],
  ])("prints the recorder's %s %s in %s", (selector, property, value) => {
    expect(forcedIn("StatisticsPage.css", selector)[property]).toBe(value);
  });

  // A guard for recorder rules added later: every fill and stroke (other than none) has a forced system colour.
  it("gives every recorder fill and stroke a forced system colour", () => {
    const inked = (rule: CssRule) =>
      ["fill", "stroke"].filter((name) => name in rule.declarations && rule.declarations[name] !== "none");
    const painted = parseRules(allCss()["StatisticsPage.css"]).rules.filter(
      (rule) => rule.atRules.length === 0 && inked(rule).length > 0,
    );
    expect(painted.length).toBeGreaterThan(0);
    for (const rule of painted) {
      for (const selector of rule.selectors) {
        for (const property of inked(rule)) {
          expect(forcedIn("StatisticsPage.css", selector)[property] ?? "", `${selector} ${property}`).toMatch(
            SYSTEM_COLOUR,
          );
        }
      }
    }
  });

  it("keeps the recorder's legend keys in the paper's system colours", () => {
    const recorded = forcedIn("StatisticsPage.css", ".key-rec");
    expect(recorded["forced-color-adjust"]).toBe("none");
    expect(recorded.background).toBe("GrayText");
    expect(normalize(recorded["box-shadow"] ?? "")).toBe("inset 0 2px 0 CanvasText");
    const active = forcedIn("StatisticsPage.css", ".key-act");
    expect(active["forced-color-adjust"]).toBe("none");
    expect(active.background).toBe("CanvasText");
  });

  // The component sheets load after styles.css and their forced rules repeat the normal selectors, so each
  // must come after the rules it overrides; and it may only repaint, never resize.
  it.each(COMPONENT_FILES)("orders %s's forced rules after the rules they repaint, and only repaints", (file) => {
    const all = parseRules(allCss()[file]).rules;
    const forced = all
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => rule.atRules.length === 1 && normalize(rule.atRules[0]) === FORCED[0]);
    expect(forced.length).toBeGreaterThan(0);
    for (const { rule, index } of forced) {
      for (const selector of rule.selectors) {
        let last = -1;
        all.forEach((other, otherIndex) => {
          if (other.atRules.length === 0 && other.selectors.includes(selector)) last = otherIndex;
        });
        expect(index, selector).toBeGreaterThan(last);
      }
      for (const property of Object.keys(rule.declarations)) {
        expect(PAINT_ONLY, `${rule.selector} ${property}`).toContain(property);
      }
    }
  });

  const BUTTONS =
    ":is(.header-button, .button, .panel-link, .text-action, .panel-add-button, .active-help-button, .software-remove-button)";

  it("outlines the buttons and round keys, whose fill and edge forced colours remove", () => {
    const declarations = declarationsFor(BUTTONS, FORCED);
    expect(normalize(declarations.outline ?? "")).toBe("1px solid ButtonText");
    expect(declarations["outline-offset"]).toBe("-1px");
    // Before the plain :focus-visible rule of the same specificity, so the focus outline still wins.
    const forced = forcedTopLevel();
    const at = (selector: string) => forced.findIndex((rule) => rule.selectors.includes(selector));
    expect(at(BUTTONS)).toBeGreaterThanOrEqual(0);
    expect(at(BUTTONS)).toBeLessThan(at(":focus-visible"));
  });

  // An unavailable button's edge is GrayText, but never over the focus ring (aria-disabled keys take focus).
  it("draws an unavailable button's edge in GrayText unless it is focused", () => {
    const disabled =
      ':is(.header-button, .button, .panel-link, .text-action, .panel-add-button):is(:disabled, [aria-disabled="true"]):not(:focus-visible)';
    const declarations = declarationsFor(disabled, FORCED);
    expect(declarations["outline-color"]).toBe("GrayText");
    expect(Object.keys(declarations)).toEqual(["outline-color"]);
  });

  // The scrollers that end their panel reach its 16px bottom curve whenever they fill it, where the last row's
  // hover fill and the scrollbar are square (and, in forced colours, the scrollbar is a bordered Canvas box over
  // the outline). A clip-path to the outline's inner edge and curve (no box change) keeps them inside, in every mode.
  const SCROLLERS = ":is(.usage-scroll, .recent-scroll, .software-table-scroll, .hidden-software-scroll, .discovered-scroll)";
  const PANEL_END = [SCROLLERS, ".ach-coming:last-child .ach-coming-list"];
  const PANEL_END_CLIP = "inset(-1px 1px 1px round 0 0 calc(var(--radius-panel) - 1px) calc(var(--radius-panel) - 1px))";
  // Every scroller takes focus (tabIndex, or as a scroller with nothing focusable inside). Of their focusable
  // contents only the 后台 table's sort buttons reach the clip: flush with the sides, their 2px inset ring would
  // be halved. The 特别关注 help and remove buttons sit well inside it.
  const FOCUSED = [
    `${SCROLLERS}:focus-visible`,
    ".usage-scroll:has(:focus-visible)",
    ".ach-coming:last-child .ach-coming-list:focus-visible",
  ];
  const MID_PANEL = ".ach-coming:not(:last-child) .ach-coming-list:not(:focus-visible)";

  it("clips the scrollers that end a panel to its outline and curve in every mode, top left open", () => {
    for (const selector of PANEL_END) {
      expect(normalize(declarationsFor(selector)["clip-path"] ?? ""), selector).toBe(PANEL_END_CLIP);
      expect(rulesFor(selector, FORCED), selector).toEqual([]);
    }
    // No rule in any stylesheet clips every name list, mid-panel ones included.
    expect(
      allRules().some((rule) => rule.selectors.includes(".ach-coming-list") && "clip-path" in rule.declarations),
    ).toBe(false);
  });

  // A ring inside the scroller would sit under the sticky heads and be cut by the curve, so focus drops the
  // clip and keeps the plain outward ring; the selectors must not outrank :focus-visible's offset either.
  it("drops the clip while a scroller or a sort button in it is focused, so the ring shows whole", () => {
    for (const selector of FOCUSED) {
      const focused = declarationsFor(selector);
      expect(focused["clip-path"], selector).toBe("none");
      expect(focused["outline-offset"], selector).toBeUndefined();
      expect(rulesFor(selector, FORCED), selector).toEqual([]);
    }
    expect(declarationsFor(":focus-visible", FORCED)["outline-offset"]).toBe("2px");
  });

  // Forced colours only: a name list above the last one sits mid-panel, where its bordered scrollbar would
  // cover the outline; it keeps off the sides only, and not while focused.
  it("clips a mid-panel name list at its sides in forced colours only", () => {
    expect(normalize(declarationsFor(MID_PANEL, FORCED)["clip-path"] ?? "")).toBe("inset(-1px 1px)");
    const scrollerClips = allRules().filter(
      (rule) =>
        "clip-path" in rule.declarations &&
        rule.selectors.some((selector) =>
          /(usage|recent|software-table|hidden-software|discovered)-scroll|ach-coming-list/.test(selector),
        ),
    );
    // Outside @media only the panel-end clip and its focus exceptions; inside, only the mid-panel one, forced.
    expect(scrollerClips.filter((rule) => rule.atRules.length === 0).flatMap((rule) => rule.selectors).sort()).toEqual(
      [...PANEL_END, ...FOCUSED].sort(),
    );
    const scopedClips = scrollerClips.filter((rule) => rule.atRules.length > 0);
    expect(scopedClips.map((rule) => rule.selector)).toEqual([MID_PANEL]);
    expect(normalize(scopedClips[0].atRules.join(" "))).toBe(FORCED[0]);
  });

  // 今日分布: identity colours are the only link between the bar and its list, so they stay, framed.
  it("keeps the mix segments and swatches in their colours inside a CanvasText frame", () => {
    for (const selector of [".mix-segment", ".mix-row i"]) {
      const declarations = declarationsFor(selector, FORCED);
      expect(declarations["forced-color-adjust"], selector).toBe("none");
      expect(normalize(declarations.outline ?? ""), selector).toBe("1px solid CanvasText");
      expect(declarations["outline-offset"], selector).toBe("-1px");
    }
  });

  // The lamps carry state (in the usage list, alone), so each keeps a distinct system-colour mark.
  it("keeps every lamp state apart in system colours", () => {
    const lamp = declarationsFor(".lamp", FORCED);
    expect(lamp["forced-color-adjust"]).toBe("none");
    expect(lamp.background).toBe("GrayText");
    const lit = declarationsFor(".lamp.is-lit", FORCED);
    expect(lit).toEqual(declarationsFor(".status-badge.running .lamp", FORCED));
    expect(lit.background).toBe("Highlight");
    expect(lit["box-shadow"]).toBe("none");
    expect(lit.animation).toBe("none");
    const tray = declarationsFor(".status-badge.tray .lamp", FORCED);
    expect(tray.background).toBe("Canvas");
    expect(normalize(tray["box-shadow"] ?? "")).toBe("inset 0 0 0 2px Highlight");
    const background = declarationsFor(".status-badge.background .lamp", FORCED);
    expect(background.background).toBe("Canvas");
    expect(normalize(background["box-shadow"] ?? "")).toBe("inset 0 0 0 1.5px CanvasText");
    // Same selector as the normal tray rule, which sits after the main forced block, so it must come later.
    const index = (forced: boolean) =>
      rules.findIndex(
        (rule) =>
          rule.selectors.includes(".status-badge.tray .lamp") &&
          (forced ? rule.atRules.length === 1 && normalize(rule.atRules[0]) === FORCED[0] : rule.atRules.length === 0),
      );
    expect(index(true)).toBeGreaterThan(index(false));
  });

  it("matches the recorder's avg and gap keys to their GrayText marks and frames the hover card", () => {
    expect(forcedIn("StatisticsPage.css", ".key-avg")["border-top-color"]).toBe("GrayText");
    expect(forcedIn("StatisticsPage.css", ".key-gap")["border-color"]).toBe("GrayText");
    const tip = forcedIn("StatisticsPage.css", ".trend-tip");
    expect(normalize(tip.outline ?? "")).toBe("1px solid CanvasText");
    expect(tip["outline-offset"]).toBe("-1px");
  });

  it("draws the idle meters and their keys in system colours", () => {
    const file = "StatisticsPage.css";
    expect(normalize(forcedIn(file, ".idle-bar").outline ?? "")).toBe("1px solid GrayText");
    for (const selector of [".idle-bar i", ".idle-key i"]) {
      expect(forcedIn(file, selector)["forced-color-adjust"], selector).toBe("none");
    }
    for (const selector of [".idle-win", ".idle-key.is-light i"]) {
      expect(forcedIn(file, selector).background, selector).toBe("GrayText");
      expect(forcedIn(file, selector)["box-shadow"], selector).toBe("none");
    }
    for (const selector of [".idle-focus", ".idle-key i"]) {
      expect(forcedIn(file, selector).background, selector).toBe("CanvasText");
    }
  });

  it("prints the heatmap's no-record dot in GrayText", () => {
    expect(forcedIn("AchievementsPage.css", ".ach-cell.is-norecord::after").background).toBe("GrayText");
  });
});

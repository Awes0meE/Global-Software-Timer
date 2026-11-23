import { describe, expect, it } from "vitest";
import trendRecorderSource from "../components/TrendRecorder.tsx?raw";
import lcdDialSource from "../components/LcdDial.tsx?raw";
import { allCss, allRules, parseRules, stripComments } from "./support/css";

// Plan task 15: the old instrument-case and LCD tokens are gone and the glass / e-ink
// rules stay inside their limits. Every forbidden literal is built from pieces (plan
// constraint 6), so a repo-wide search finds only real uses.
// import.meta.glob already leaves out the importing file (asserted below); the retired-token
// scan still excludes it explicitly, as plan Step 1 asks.
const SELF = "./designTokens.test.ts";
const sources = import.meta.glob<string>("../**/*.{css,ts,tsx}", { query: "?raw", import: "default", eager: true });

const RETIRED = [
  "--" + "lcd-",
  "--" + "lcd(?![\\w-])",
  "--" + "knob-",
  "--" + "case\\b",
  "--" + "radius-case",
  "--" + "panel(?![\\w-])",
  "--" + "panel-raised",
  "--" + "panel-sunken",
  "var\\(--" + "panel[,)]",
  "--" + "highlight\\b",
];

const BLUR_PROPERTY = "backdrop" + "-filter";
const SIGNAL = "var(--" + "signal";
const SHADE = "var(--" + "shade";
const FAINT = "var(--" + "faint)";
const EINK_MID = "var(--" + "eink-mid)";
const PIXEL_FONT = "var(--" + "font-pixel)";
const PIXEL_FAMILY = "GST " + "Pixel";

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const TOKEN_BLOCKS = [":root", ':root[data-theme="light"]', ':root[data-theme="dark"]'];
const isTokenBlock = (rule: { atRules: string[]; selectors: string[] }) =>
  rule.atRules.length === 0 && rule.selectors.every((selector) => TOKEN_BLOCKS.includes(selector));

/** Selectors of every rule (outside the token blocks) whose declarations mention `needle`. */
function selectorsUsing(needle: string): string[] {
  return allRules()
    .filter((rule) => !isTokenBlock(rule) && Object.values(rule.declarations).some((value) => value.includes(needle)))
    .flatMap((rule) => rule.selectors);
}

/** Names of the token-block custom properties whose values mention `needle` (an alias would dodge the whitelists). */
function tokensUsing(needle: string): string[] {
  return allRules()
    .filter(isTokenBlock)
    .flatMap((rule) => Object.entries(rule.declarations))
    .filter(([, value]) => value.includes(needle))
    .map(([name]) => name);
}

/** Class names in a selector, without the leading dot. */
const classesOf = (selector: string) => [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]);

/** Name → body of every `@keyframes` block in a stylesheet. */
function keyframeBodies(css: string): Record<string, string> {
  const text = stripComments(css);
  const bodies: Record<string, string> = {};
  for (const match of text.matchAll(/@(?:-webkit-)?keyframes\s+([^\s{]+)\s*\{/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let level = 0;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === "{") level += 1;
      if (text[i] === "}") level -= 1;
      if (level === 0) {
        bodies[match[1]] = text.slice(open + 1, i);
        break;
      }
    }
  }
  return bodies;
}

// SVG text classes, from the components' <text className=…> (checked against the source below),
// and the HTML text classes printed on the e-ink screens.
const SVG_TEXT_CLASSES = ["scale", "vals", "vals-dim", "vals-strong", "day", "trace-label", "lcd-dial-hour"];
const SCREEN_TEXT_CLASSES = [
  "lcd-label",
  "lcd-note",
  "lcd-value",
  "lcd-dial-clock",
  "ach-weekday",
  "ach-legend",
  "ach-dial-stat",
];
const TEXT_CLASSES = [...SVG_TEXT_CLASSES, ...SCREEN_TEXT_CLASSES];

/**
 * Class names given to `<text>` elements in a component's source (string or template literal),
 * and how many `<text>` tags were parsed, so a tag the pattern cannot read fails loudly.
 */
function svgTextClasses(source: string): { names: string[]; parsed: number } {
  const names: string[] = [];
  let parsed = 0;
  for (const match of source.matchAll(/<text\b[^>]*?className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    parsed += 1;
    const value = match[1] ?? match[2].replace(/\$\{([^}]*)\}/g, (_, expression: string) =>
      [...expression.matchAll(/"([^"]*)"/g)].map((literal) => literal[1]).join(" "),
    );
    names.push(...value.split(/\s+/).filter(Boolean));
  }
  return { names, parsed };
}

describe("retired tokens (spec Token 架构, 验收 1)", () => {
  it("scans every stylesheet and source file under src", () => {
    const files = Object.keys(sources);
    expect(files).toContain("../styles.css");
    expect(files).toContain("../components/LcdDial.tsx");
    expect(files).toContain("./contrast.test.ts");
    expect(files).not.toContain(SELF);
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(RETIRED)("leaves no %s in src", (pattern) => {
    const regex = new RegExp(pattern);
    const hits = Object.entries(sources)
      .filter(([file]) => file !== SELF)
      .flatMap(([file, text]) =>
        text
          .split(/\r?\n/)
          .map((line, index) => ({ line, at: `${file}:${index + 1}` }))
          .filter(({ line }) => regex.test(line))
          .map(({ at, line }) => `${at}: ${line.trim()}`),
      );
    expect(hits).toEqual([]);
  });
});

describe("glass and e-ink limits", () => {
  // Same set as the task 5 test in glassSurfaces: only the sidebar and the top-level panels blur.
  it("blurs only the sidebar, the top-level panels and the dialog backdrop", () => {
    const blurred: Record<string, string> = {};
    for (const rule of allRules()) {
      const value = rule.declarations[BLUR_PROPERTY];
      if (value === undefined) continue;
      for (const selector of rule.selectors) blurred[[...rule.atRules, selector].join(" ")] = normalize(value);
    }
    expect(blurred).toEqual({
      ".sidebar": "var(--glass-filter)",
      ".panel": "var(--glass-filter)",
      ".readout": "var(--glass-filter)",
      ".software-panel": "var(--glass-filter)",
      ".modal-backdrop": "blur(2px)",
    });
  });

  // Spec「信号橙与强调色」: signal orange only marks what is happening now.
  it("keeps signal orange on the live lamps", () => {
    const allowed = [".lamp.is-lit", ".status-badge.running .lamp", ".status-badge.tray .lamp", ".pen-lamp"];
    const users = selectorsUsing(SIGNAL);
    expect(users.length).toBeGreaterThan(0);
    for (const selector of users) expect(allowed, selector).toContain(selector);
    expect(tokensUsing(SIGNAL)).toEqual([]);

    const inKeyframes = Object.values(allCss()).flatMap((css) =>
      Object.entries(keyframeBodies(css))
        .filter(([, body]) => body.includes(SIGNAL))
        .map(([name]) => name),
    );
    expect(inKeyframes).toEqual(["lamp-breathe"]);
  });

  // Spec「动效」: no new animations.
  it("has exactly the three existing keyframes", () => {
    const names = Object.values(allCss()).flatMap((css) => parseRules(css).keyframes);
    expect(names.sort()).toEqual(["backdrop-in", "dialog-in", "lamp-breathe"]);
  });

  // Spec「字体」: GST Pixel only on the e-ink screens.
  it("uses the pixel font only in .lcd rules", () => {
    const users = selectorsUsing(PIXEL_FONT);
    expect(users.length).toBeGreaterThan(0);
    for (const selector of users) expect(selector).toMatch(/^\.lcd/);
    expect(tokensUsing(PIXEL_FONT)).toEqual([]);
    // Naming the family directly would bypass the token; only --font-pixel and @font-face may.
    expect(selectorsUsing(PIXEL_FAMILY)).toEqual([]);
    expect(tokensUsing(PIXEL_FAMILY)).toEqual(["--font-pixel"]);
  });

  // Plan「迁移表：深色选择器覆盖」: dark values live in the token block; the only theme-scoped rules
  // left are trade-off 1 (--muted on dark sub-plates) and the light icon hairline.
  it("has no dark-theme selector overrides outside the token block", () => {
    const themed = allRules().flatMap((rule) =>
      rule.selectors
        .filter((selector) => selector.includes("data-theme"))
        .map((selector) => [...rule.atRules, selector].join(" ")),
    );
    expect(themed.sort()).toEqual(
      [
        ":root[data-theme=\"light\"]",
        ":root[data-theme=\"dark\"]",
        ':root[data-theme="dark"] :is(.mix-plate, .ach-plate.is-reached)',
        ':root[data-theme="light"] .software-icon:has(img:not([hidden]))',
      ].sort(),
    );
  });

  it("lists every SVG text class the components draw", () => {
    const drawn = new Set<string>();
    for (const source of [trendRecorderSource, lcdDialSource]) {
      const { names, parsed } = svgTextClasses(source);
      expect(parsed).toBe([...source.matchAll(/<text\b/g)].length);
      for (const name of names) drawn.add(name);
    }
    expect([...drawn].sort()).toEqual([...SVG_TEXT_CLASSES].sort());
  });

  // Spec Token 架构: --faint stays, but only for graphics.
  it("never sets text in --faint", () => {
    for (const rule of allRules()) {
      expect(rule.declarations.color ?? "", rule.selector).not.toContain(FAINT);
      if (rule.selectors.some((selector) => classesOf(selector).some((name) => SVG_TEXT_CLASSES.includes(name)))) {
        expect(rule.declarations.fill ?? "", rule.selector).not.toContain(FAINT);
      }
    }
  });

  // Spec 墨水屏配方「文字」: --eink-mid only draws graphics.
  it("never sets text in --eink-mid", () => {
    const fills: string[] = [];
    for (const rule of allRules()) {
      expect(rule.declarations.color ?? "", rule.selector).not.toContain(EINK_MID);
      if ((rule.declarations.fill ?? "").includes(EINK_MID)) fills.push(...rule.selectors);
    }
    expect(fills.length).toBeGreaterThan(0);
    for (const selector of fills) {
      expect(classesOf(selector).filter((name) => TEXT_CLASSES.includes(name)), selector).toEqual([]);
    }
  });

  // Plan「口径：投影颜色」, trade-off 24: --shade / --shade-deep only under the skip link, the knob
  // and the three floating cards.
  it("keeps the shade colours on the whitelisted floating surfaces", () => {
    const allowed = [".skip-link", ".toggle-knob", ".unavailable-tooltip-bubble", ".active-help-popover", ".trend-tip"];
    const users = selectorsUsing(SHADE);
    expect(users.length).toBeGreaterThan(0);
    for (const selector of users) expect(allowed, selector).toContain(selector);
    // The toggle's own --tg-* depth tokens are the only aliases trade-off 24 allows.
    expect(tokensUsing(SHADE).filter((name) => !name.startsWith("--tg-"))).toEqual([]);
  });
});

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
    const allowed = [".lamp.is-lit", ".status-badge.running .lamp", ".status-badge.background .lamp", ".pen-lamp"];
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

  // Spec「动效」: no new animations, except the v0.4.2 header popovers' pop-in and the v0.4.7 toast's rise in and
  // sink out (the user asked for a toast that is seen arriving and leaving).
  it("has exactly the known keyframes", () => {
    const names = Object.values(allCss()).flatMap((css) => parseRules(css).keyframes);
    expect(names.sort()).toEqual(["backdrop-in", "dialog-in", "lamp-breathe", "pop-in", "scroll-edge-fade", "scroll-edge-fade-bottom", "scroll-edge-fade-top", "stats-early", "stats-late", "swap-in", "swap-out", "toast-in", "toast-out"]);
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
  // left are trade-off 1 (--muted on dark sub-plates) and the light icon hairline, plus that hairline's
  // forced-colours reset. v0.4.4 adds the theme-scoped token overrides of spec §B (the accent-built glow
  // and its per-choice glow alphas) and §C (the four e-ink palettes besides 极光).
  const APPEARANCE_OVERRIDES = [
    ':root:not([data-theme="dark"])[data-accent]:not([data-accent="blue"])',
    ':root[data-theme="dark"][data-accent]:not([data-accent="blue"])',
    ...["cyan", "green", "violet", "rose", "amber", "graphite"].flatMap((accent) => [
      `:root:not([data-theme="dark"])[data-accent="${accent}"]`,
      `:root[data-theme="dark"][data-accent="${accent}"]`,
    ]),
    ...["graphite", "night", "warm", "forest"].flatMap((palette) => [
      `:root:not([data-theme="dark"])[data-eink="${palette}"]`,
      `:root[data-theme="dark"][data-eink="${palette}"]`,
    ]),
  ];

  // The 设置 主题色 swatches show the theme's half of each pair, and every 墨水屏配色 chip carries its own
  // palette's paper and ink for the theme (settingsPage.test.tsx checks those against the palettes).
  const SETTINGS_CONTROL_OVERRIDES = [
    ':root[data-theme="dark"] .swatch',
    ...["aurora", "graphite", "night", "warm", "forest"].flatMap((palette) => [
      `:root:not([data-theme="dark"]) [data-eink-chip="${palette}"]`,
      `:root[data-theme="dark"] [data-eink-chip="${palette}"]`,
    ]),
  ];

  it("keeps the settings control overrides to custom properties", () => {
    const overrides = allRules().filter((rule) =>
      rule.selectors.some((selector) => SETTINGS_CONTROL_OVERRIDES.includes(selector)),
    );
    expect(overrides.flatMap((rule) => rule.selectors).sort()).toEqual([...SETTINGS_CONTROL_OVERRIDES].sort());
    for (const rule of overrides) {
      expect(rule.atRules, rule.selector).toEqual([]);
      expect(Object.keys(rule.declarations).filter((name) => !name.startsWith("--")), rule.selector).toEqual([]);
    }
  });

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
        '@media (forced-colors: active) :root[data-theme="light"] .software-icon:has(img:not([hidden]))',
        ...APPEARANCE_OVERRIDES,
        ...SETTINGS_CONTROL_OVERRIDES,
      ].sort(),
    );
  });

  // The appearance overrides only set tokens, never a property, so they cannot restyle a component.
  it("keeps the appearance overrides to custom properties", () => {
    const overrides = allRules().filter((rule) => rule.selectors.some((selector) => APPEARANCE_OVERRIDES.includes(selector)));
    expect(overrides.flatMap((rule) => rule.selectors).sort()).toEqual([...APPEARANCE_OVERRIDES].sort());
    for (const rule of overrides) {
      expect(rule.atRules, rule.selector).toEqual([]);
      expect(rule.selectors, rule.selector).toHaveLength(1);
      expect(Object.keys(rule.declarations).filter((name) => !name.startsWith("--")), rule.selector).toEqual([]);
    }
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

  // Spec 墨水屏配方「文字」: --eink-mid only draws graphics. One exception, decision A4 (user, 2026-11-24):
  // the calendar prints the pickable days of the next or previous month in --eink-mid.
  const EINK_MID_TEXT = [".lcd-cal .rdp-outside .rdp-day_button"];
  it("never sets text in --eink-mid", () => {
    const fills: string[] = [];
    for (const rule of allRules()) {
      if (rule.atRules.length === 0 && rule.selectors.every((selector) => EINK_MID_TEXT.includes(selector))) continue;
      expect(rule.declarations.color ?? "", rule.selector).not.toContain(EINK_MID);
      if ((rule.declarations.fill ?? "").includes(EINK_MID)) fills.push(...rule.selectors);
    }
    expect(fills.length).toBeGreaterThan(0);
    for (const selector of fills) {
      expect(classesOf(selector).filter((name) => TEXT_CLASSES.includes(name)), selector).toEqual([]);
    }
  });

  // Plan「口径：投影颜色」, trade-off 24: --shade / --shade-deep only under the skip link, the knob
  // and the floating cards (since v0.4.2 also the header popovers and the toast).
  it("keeps the shade colours on the whitelisted floating surfaces", () => {
    const allowed = [
      ".skip-link",
      ".toggle-knob",
      ".unavailable-tooltip-bubble",
      // The sidebar's name bubbles (toggle, icon rail) are drawn like the unavailable bubble.
      ".sidebar-toggle[data-label]::after",
      ".is-rail .nav-key[data-label]::after",
      ".active-help-popover",
      ".trend-tip",
      ".glass-pop",
      // The calendar popover restates the .glass-pop lift over .paper (its surface is the e-ink paper).
      ".glass-pop.hk-cal-pop",
      ".toast",
    ];
    const users = selectorsUsing(SHADE);
    expect(users.length).toBeGreaterThan(0);
    for (const selector of users) expect(allowed, selector).toContain(selector);
    // The toggle's own --tg-* depth tokens are the only aliases trade-off 24 allows.
    expect(tokensUsing(SHADE).filter((name) => !name.startsWith("--tg-"))).toEqual([]);
  });
});

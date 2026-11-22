import { describe, expect, it } from "vitest";
import {
  allCss,
  allRules,
  contrast,
  over,
  paperStops,
  parseColor,
  parseRules,
  radialLayers,
  resolve,
  splitTopLevel,
} from "./support/css";

// Built from pieces so a repo-wide search for the property finds only real uses.
const BLUR_PROPERTY = "backdrop" + "-filter";

describe("CSS test support: parser", () => {
  it("reads the three stylesheets as raw text", () => {
    for (const [file, css] of Object.entries(allCss())) {
      expect(css.length, file).toBeGreaterThan(1000);
    }
    expect(allRules().length).toBeGreaterThan(100);
  });

  it("keeps a data URL with ';' and ',' as one declaration value", () => {
    const grain =
      `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>` +
      `<filter id='n'><feTurbulence baseFrequency='.9' numOctaves='2'/></filter>` +
      `<rect width='100%' height='100%' filter='url(%23n)' style='opacity:.5;fill:red'/></svg>")`;
    const { rules } = parseRules(`.lcd::before { background-image: ${grain}; opacity: 0.06; }`);

    expect(rules).toHaveLength(1);
    expect(rules[0].declarations).toEqual({ "background-image": grain, opacity: "0.06" });
  });

  it("splits selector lists only at top-level commas", () => {
    const { rules } = parseRules(
      `a:is(.x, .y) b, c {} ` +
        `.t :is(th, td), .n:is(:hover, :focus-visible), .r:not(:first-child, :last-child) {} ` +
        `.f:has(img:not([hidden])), :is(.mix-plate, .ach-plate.is-reached), [data-x="a, b"] {}`,
    );

    expect(rules.map((rule) => rule.selectors)).toEqual([
      ["a:is(.x, .y) b", "c"],
      [".t :is(th, td)", ".n:is(:hover, :focus-visible)", ".r:not(:first-child, :last-child)"],
      [".f:has(img:not([hidden]))", ":is(.mix-plate, .ach-plate.is-reached)", '[data-x="a, b"]'],
    ]);
  });

  it("keeps a multi-line, comma-separated value whole", () => {
    const glow = [
      "radial-gradient(820px 600px at 8% -6%, rgba(90, 160, 255, 0.34), transparent 62%),",
      "    radial-gradient(760px 640px at 98% 10%, rgba(240, 120, 190, 0.26), transparent 60%),",
      "    radial-gradient(860px 600px at 52% 110%, rgba(160, 130, 255, 0.3), transparent 62%)",
    ].join("\n");
    const { rules } = parseRules(`:root {\n  --glow:\n    ${glow};\n  --base: #eceef3;\n}`);

    expect(rules[0].declarations["--glow"]).toBe(glow);
    expect(rules[0].declarations["--base"]).toBe("#eceef3");
    expect(radialLayers(glow).map((layer) => layer.shape)).toEqual([
      "820px 600px at 8% -6%",
      "760px 640px at 98% 10%",
      "860px 600px at 52% 110%",
    ]);
  });

  it("records conditional at-rules verbatim and recurses into them", () => {
    const condition = `@supports not (${BLUR_PROPERTY}: blur(1px))`;
    const { rules } = parseRules(
      `${condition} { :root { --glass-filter: none; } }\n` +
        `@media (max-width: 900px) { @supports (display: grid) { .a { color: red; } } }\n` +
        `@container (max-width: 760px) { .b { gap: 0; } }`,
    );

    expect(rules.map((rule) => [rule.atRules, rule.selector])).toEqual([
      [[condition], ":root"],
      [["@media (max-width: 900px)", "@supports (display: grid)"], ".a"],
      [["@container (max-width: 760px)"], ".b"],
    ]);
    expect(rules[0].declarations).toEqual({ "--glass-filter": "none" });
  });

  it("records @keyframes by name without treating frames as rules", () => {
    const { rules, keyframes } = parseRules(
      `@keyframes lamp-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }\n` +
        `.lamp { animation: lamp-breathe 2s infinite; }\n` +
        `@media (prefers-reduced-motion: reduce) { @keyframes dialog-in { from { opacity: 0; } } }`,
    );

    expect(keyframes).toEqual(["lamp-breathe", "dialog-in"]);
    expect(rules.map((rule) => rule.selector)).toEqual([".lamp"]);
  });

  it("records @font-face apart from style rules and refuses unknown block at-rules", () => {
    const { rules, descriptorBlocks } = parseRules(
      `@font-face { font-family: "Ark Pixel"; src: url("a.woff2") format("woff2"); }\n.lcd { color: red; }`,
    );

    expect(descriptorBlocks).toEqual(["@font-face"]);
    expect(rules.map((rule) => rule.selector)).toEqual([".lcd"]);
    expect(allRules().some((rule) => rule.selector.startsWith("@"))).toBe(false);
    expect(() => parseRules(`@layer base { .a { color: red; } }`)).toThrow(/Unsupported at-rule/);
  });

  it("ignores comments and braces inside strings", () => {
    const { rules } = parseRules(
      `/* .ghost { color: red; } */ .q::before { content: "} { ; /* not a comment */"; color: red }`,
    );

    expect(rules).toHaveLength(1);
    expect(rules[0].declarations).toEqual({
      content: '"} { ; /* not a comment */"',
      color: "red",
    });
  });

  it("refuses nested style rules instead of mis-parsing them", () => {
    expect(() => parseRules(`.a { color: red; .b { color: blue; } }`)).toThrow(/Nested/);
  });

  it("splits on top-level whitespace without breaking functions", () => {
    expect(splitTopLevel("rgba(1, 2, 3, 0.5) 45%", /\s/)).toEqual(["rgba(1, 2, 3, 0.5)", "45%"]);
  });
});

describe("CSS test support: tokens and colour", () => {
  it("resolves var() chains and fallbacks", () => {
    const tokens = { "--a": "var(--b)", "--b": "#fff", "--c": "0 0 0 2px var(--a), 0 0 0 4px var(--missing, red)" };

    expect(resolve("var(--a)", tokens)).toBe("#fff");
    expect(resolve(tokens["--c"], tokens)).toBe("0 0 0 2px #fff, 0 0 0 4px red");
    expect(() => resolve("var(--nope)", tokens)).toThrow(/Unknown token/);
  });

  it("parses hex, rgb() and rgba() in comma and slash syntax", () => {
    expect(parseColor("#abc")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor("#17191D")).toEqual({ r: 23, g: 25, b: 29, a: 1 });
    expect(parseColor("rgba(255,255,255,.5)")).toEqual({ r: 255, g: 255, b: 255, a: 0.5 });
    expect(parseColor("rgb(0 0 0 / 45%)")).toEqual({ r: 0, g: 0, b: 0, a: 0.45 });
    expect(parseColor("rgb(20, 30, 60)")).toEqual({ r: 20, g: 30, b: 60, a: 1 });
    expect(parseColor("transparent").a).toBe(0);
  });

  it("parses color-mix with transparent as a reduced alpha", () => {
    const mixed = parseColor("color-mix(in srgb, #2f7de1 30%, transparent)");

    expect(mixed.r).toBeCloseTo(0x2f, 6);
    expect(mixed.g).toBeCloseTo(0x7d, 6);
    expect(mixed.b).toBeCloseTo(0xe1, 6);
    expect(mixed.a).toBeCloseTo(0.3, 6);
  });

  it("scales color-mix alpha when the percentages add up to less than 100%", () => {
    const mixed = parseColor("color-mix(in srgb, #fff 20%, #000 30%)");

    expect(mixed.r).toBeCloseTo(102, 6);
    expect(mixed.g).toBeCloseTo(102, 6);
    expect(mixed.b).toBeCloseTo(102, 6);
    expect(mixed.a).toBeCloseTo(0.5, 6);
  });

  it("composites and measures contrast like WCAG", () => {
    const white = parseColor("#fff");
    const black = parseColor("#000");

    expect(contrast(black, white)).toBeCloseTo(21, 6);
    expect(contrast(white, white)).toBeCloseTo(1, 6);
    expect(contrast(parseColor("#767676"), white)).toBeCloseTo(4.54, 2);
    const half = over(parseColor("rgba(0, 0, 0, 0.5)"), white);
    expect(half).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(() => contrast(black, parseColor("rgba(255, 255, 255, 0.5)"))).toThrow(/opaque/);
  });

  it("reads both theme papers as colour stops", () => {
    expect(paperStops("light")).toEqual([parseColor("#fafaf7")]);
    expect(paperStops("dark")).toEqual(["#1f2d40", "#281f40", "#401f40"].map(parseColor));
  });
});

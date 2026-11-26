// Test helpers that read the app's CSS source, split it into rules, resolve
// theme tokens and compute WCAG contrast. Not a test file itself (no `.test`).
//
// The parser is deliberately small: it understands comments, quoted strings,
// parentheses and brackets, conditional group at-rules (@media, @supports,
// @container), @keyframes and descriptor at-rules such as @font-face (recorded
// by prelude, never returned as style rules). It does not support CSS nesting
// or other block at-rules (@layer, @scope, …) and throws when it meets one, so
// a silent mis-parse cannot pass.
import styles from "../../styles.css?raw";
import achievementsCss from "../../components/AchievementsPage.css?raw";
import statisticsCss from "../../components/StatisticsPage.css?raw";
import headerControlsCss from "../../components/HeaderControls.css?raw";
import { resolveAccent, type AccentPair } from "../../accent";
import type { AccentId, EinkId } from "../../appearancePresets";

export type Theme = "light" | "dark";

export interface CssRule {
  /** Preludes of the enclosing @media / @supports / @container, outermost first. */
  atRules: string[];
  selector: string;
  selectors: string[];
  declarations: Record<string, string>;
}

export interface ParsedCss {
  rules: CssRule[];
  /** Names of every @keyframes block, in source order. */
  keyframes: string[];
  /** Preludes of descriptor at-rules such as `@font-face`, in source order. */
  descriptorBlocks: string[];
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** The stylesheets the app ships, keyed by file name. */
export function allCss(): Record<string, string> {
  return {
    "styles.css": styles,
    "AchievementsPage.css": achievementsCss,
    "StatisticsPage.css": statisticsCss,
    "HeaderControls.css": headerControlsCss,
  };
}

/** Every style rule of every stylesheet, tagged with its file. */
export function allRules(): (CssRule & { file: string })[] {
  return Object.entries(allCss()).flatMap(([file, css]) =>
    parseRules(css).rules.map((rule) => ({ ...rule, file })),
  );
}

// ---------------------------------------------------------------------------
// Scanning

/**
 * Walks `text` and calls `visit(char, index)` only for characters that are
 * outside quotes and at parenthesis / bracket depth 0. Returning a number from
 * `visit` jumps the scan to that index.
 */
function scanTopLevel(text: string, visit: (char: string, index: number) => number | void) {
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === "\\") {
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) {
      const jump = visit(char, i);
      if (typeof jump === "number") {
        i = jump;
      }
    }
  }
}

/** Splits on `separator` outside quotes and parentheses; trims and drops empty parts. */
export function splitTopLevel(text: string, separator: string | RegExp): string[] {
  const matches = (char: string) =>
    typeof separator === "string" ? char === separator : separator.test(char);
  const parts: string[] = [];
  let start = 0;
  scanTopLevel(text, (char, index) => {
    if (matches(char)) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  });
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

export function stripComments(css: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (quote) {
      out += char;
      if (char === "\\" && i + 1 < css.length) {
        out += css[i + 1];
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      out += char;
      continue;
    }
    if (char === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 1;
      out += " ";
      continue;
    }
    out += char;
  }
  return out;
}

/** Index of the `}` matching the `{` at `open`, ignoring braces in quotes and parentheses. */
function matchingBrace(text: string, open: number): number {
  let level = 0;
  let close = -1;
  const rest = text.slice(open);
  scanTopLevel(rest, (char, index) => {
    if (close !== -1) {
      return rest.length;
    }
    if (char === "{") {
      level += 1;
    } else if (char === "}") {
      level -= 1;
      if (level === 0) {
        close = open + index;
        return rest.length;
      }
    }
  });
  if (close === -1) {
    throw new Error(`Unbalanced "{" at offset ${open}`);
  }
  return close;
}

function parseDeclarations(body: string, selector: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  scanTopLevel(body, (char) => {
    if (char === "{" || char === "}") {
      throw new Error(`Nested blocks are not supported (in "${selector}")`);
    }
  });
  for (const part of splitTopLevel(body, ";")) {
    let colon = -1;
    scanTopLevel(part, (char, index) => {
      if (char === ":" && colon === -1) {
        colon = index;
        return part.length;
      }
    });
    if (colon === -1) {
      throw new Error(`Declaration without ":" in "${selector}": ${part}`);
    }
    declarations[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
  }
  return declarations;
}

const GROUP_AT_RULE = /^@(media|supports|container)\b/i;
const KEYFRAMES = /^@(?:-webkit-)?keyframes\s+([^\s{]+)/i;
const DESCRIPTOR_AT_RULE = /^@(font-face|font-feature-values|font-palette-values|counter-style|property|page)\b/i;

function parseBlock(css: string, atRules: string[], out: ParsedCss) {
  let start = 0;
  let i = 0;
  while (i < css.length) {
    let found: { char: string; index: number } | null = null;
    scanTopLevel(css.slice(i), (char, index) => {
      if (char === "{" || char === ";" || char === "}") {
        found = { char, index: i + index };
        return css.length;
      }
    });
    if (!found) {
      break;
    }
    const { char, index } = found as { char: string; index: number };
    if (char === "}") {
      throw new Error(`Unexpected "}" at offset ${index}`);
    }
    const prelude = css.slice(start, index).trim().replace(/\s+/g, " ");
    if (char === ";") {
      // Statement at-rules such as @import or @charset carry no declarations.
      i = index + 1;
      start = i;
      continue;
    }
    const close = matchingBrace(css, index);
    const body = css.slice(index + 1, close);
    const keyframes = KEYFRAMES.exec(prelude);
    if (keyframes) {
      out.keyframes.push(keyframes[1]);
    } else if (GROUP_AT_RULE.test(prelude)) {
      parseBlock(body, [...atRules, prelude], out);
    } else if (DESCRIPTOR_AT_RULE.test(prelude)) {
      out.descriptorBlocks.push(prelude);
    } else if (prelude.startsWith("@")) {
      throw new Error(`Unsupported at-rule "${prelude}"`);
    } else {
      out.rules.push({
        atRules,
        selector: prelude,
        selectors: splitTopLevel(prelude, ","),
        declarations: parseDeclarations(body, prelude),
      });
    }
    i = close + 1;
    start = i;
  }
  if (css.slice(start).trim().length > 0) {
    throw new Error(`Trailing text without a block: ${css.slice(start).trim().slice(0, 80)}`);
  }
}

export function parseRules(css: string): ParsedCss {
  const out: ParsedCss = { rules: [], keyframes: [], descriptorBlocks: [] };
  parseBlock(stripComments(css), [], out);
  return out;
}

// ---------------------------------------------------------------------------
// Theme tokens

const LIGHT_BLOCK = [":root", ':root[data-theme="light"]'];
const DARK_BLOCK = [':root[data-theme="dark"]'];

/**
 * A v0.4.4 appearance on <html> (spec §B, §C): `data-accent` with the inline `--user-accent-*` that
 * `applyAppearance` sets, and `data-eink`. Omitted fields mean today's look.
 */
export interface Appearance {
  accent?: AccentId;
  /** The Windows accent pair `跟随 Windows` resolves from; null when it cannot be read. */
  windowsAccent?: AccentPair | null;
  eink?: EinkId;
}

// Override selectors are scoped per theme so a light value never leaks into dark (spec §C).
const THEME_SCOPE: Record<Theme, string> = { light: ':root:not([data-theme="dark"])', dark: ':root[data-theme="dark"]' };

/** The rule that swaps today's --glow for the accent-built one: any data-accent but blue. */
export function accentGlowSelector(theme: Theme): string {
  return `${THEME_SCOPE[theme]}[data-accent]:not([data-accent="blue"])`;
}

/** The rule that holds one 主题色 choice's glow alphas (`--glow-alpha-1..3`) for one theme. */
export function accentAlphaSelector(theme: Theme, accent: AccentId): string {
  return `${THEME_SCOPE[theme]}[data-accent="${accent}"]`;
}

/** The rule that holds one e-ink palette's tokens for one theme. */
export function einkSelector(theme: Theme, palette: EinkId): string {
  return `${THEME_SCOPE[theme]}[data-eink="${palette}"]`;
}

let parsedStyles: CssRule[] | null = null;
function styleRules(): CssRule[] {
  parsedStyles ??= parseRules(styles).rules;
  return parsedStyles;
}

function sameSelectors(rule: CssRule, wanted: string[]) {
  return (
    rule.atRules.length === 0 &&
    rule.selectors.length === wanted.length &&
    rule.selectors.every((selector, index) => selector === wanted[index])
  );
}

function customProperties(rule: CssRule): Record<string, string> {
  return Object.fromEntries(
    Object.entries(rule.declarations).filter(([name]) => name.startsWith("--")),
  );
}

/**
 * Raw (unresolved) custom properties of a theme: the
 * `:root, :root[data-theme="light"]` block, and for dark that block overridden
 * by the `:root[data-theme="dark"]` block. With an appearance, the inline accent
 * variables and that theme's accent-glow, glow-alpha and e-ink palette rules apply on top.
 */
export function themeTokens(theme: Theme, appearance: Appearance = {}): Record<string, string> {
  const rules = styleRules();
  const tokens: Record<string, string> = {};
  const apply = (wanted: string[]) => {
    for (const rule of rules.filter((r) => sameSelectors(r, wanted))) {
      Object.assign(tokens, customProperties(rule));
    }
  };
  apply(LIGHT_BLOCK);
  if (theme === "dark") apply(DARK_BLOCK);
  const { accent, eink } = appearance;
  if (accent !== undefined && accent !== "blue") {
    // applyAppearance sets these inline on <html> for every choice but blue.
    const pair = resolveAccent(accent, appearance.windowsAccent ?? null);
    tokens["--user-accent-light"] = pair.light;
    tokens["--user-accent-dark"] = pair.dark;
    apply([accentGlowSelector(theme)]);
    apply([accentAlphaSelector(theme, accent)]);
  }
  if (eink !== undefined) apply([einkSelector(theme, eink)]);
  return tokens;
}

/** Replaces every `var(--x)` / `var(--x, fallback)` recursively. */
export function resolve(value: string, tokens: Record<string, string>, seen: string[] = []): string {
  const start = value.indexOf("var(");
  if (start === -1) {
    return value;
  }
  let close = -1;
  let level = 0;
  for (let i = start + 3; i < value.length; i += 1) {
    if (value[i] === "(") {
      level += 1;
    } else if (value[i] === ")") {
      level -= 1;
      if (level === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) {
    throw new Error(`Unbalanced var() in ${value}`);
  }
  const [name, ...fallback] = splitTopLevel(value.slice(start + 4, close), ",");
  if (seen.includes(name)) {
    throw new Error(`Cyclic token ${[...seen, name].join(" -> ")}`);
  }
  let replacement: string;
  if (name in tokens) {
    replacement = resolve(tokens[name], tokens, [...seen, name]);
  } else if (fallback.length > 0) {
    replacement = resolve(fallback.join(", "), tokens, seen);
  } else {
    throw new Error(`Unknown token ${name}`);
  }
  return resolve(value.slice(0, start) + replacement + value.slice(close + 1), tokens, seen);
}

/** Resolved value of one token in a theme. */
export function token(theme: Theme, name: string, appearance: Appearance = {}): string {
  const tokens = themeTokens(theme, appearance);
  if (!(name in tokens)) {
    throw new Error(`Token ${name} is not defined for the ${theme} theme`);
  }
  return resolve(tokens[name], tokens);
}

// ---------------------------------------------------------------------------
// Colour

const NAMED: Record<string, Rgba> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
};

function channel(text: string, scale: number): number {
  const trimmed = text.trim();
  if (trimmed.endsWith("%")) {
    return (Number.parseFloat(trimmed) / 100) * scale;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    throw new Error(`Bad colour channel "${text}"`);
  }
  return value;
}

function parseHex(hex: string): Rgba {
  const digits = hex.slice(1);
  const expand = digits.length <= 4 ? digits.split("").map((d) => d + d) : digits.match(/../g) ?? [];
  if (![3, 4, 6, 8].includes(digits.length) || !/^[0-9a-f]+$/i.test(digits)) {
    throw new Error(`Bad hex colour ${hex}`);
  }
  const [r, g, b, a] = expand.map((pair) => Number.parseInt(pair, 16));
  return { r, g, b, a: a === undefined ? 1 : a / 255 };
}

function parseRgbFunction(args: string): Rgba {
  let parts: string[];
  let alpha: string | undefined;
  if (args.includes(",")) {
    parts = args.split(",").map((p) => p.trim());
    alpha = parts[3];
    parts = parts.slice(0, 3);
  } else {
    const [colour, slashAlpha] = args.split("/");
    parts = colour.trim().split(/\s+/);
    alpha = slashAlpha?.trim();
  }
  if (parts.length !== 3) {
    throw new Error(`Bad rgb() arguments "${args}"`);
  }
  const [r, g, b] = parts.map((p) => channel(p, 255));
  return { r, g, b, a: alpha === undefined ? 1 : channel(alpha, 1) };
}

/** `color-mix(in srgb, A p%, B q%)` with premultiplied interpolation. */
function parseColorMix(args: string): Rgba {
  const [space, ...items] = splitTopLevel(args, ",");
  if (space.replace(/\s+/g, " ").toLowerCase() !== "in srgb" || items.length !== 2) {
    throw new Error(`Only color-mix(in srgb, A, B) is supported: ${args}`);
  }
  const stops = items.map((item) => {
    const words = splitTopLevel(item, /\s/);
    const percent = words.find((word) => /^-?[\d.]+%$/.test(word));
    const colour = words.filter((word) => word !== percent).join(" ");
    return { colour: parseColor(colour), p: percent === undefined ? undefined : Number.parseFloat(percent) / 100 };
  });
  let [p1, p2] = [stops[0].p, stops[1].p];
  if (p1 === undefined && p2 === undefined) {
    p1 = 0.5;
    p2 = 0.5;
  } else if (p1 === undefined) {
    p1 = 1 - (p2 as number);
  } else if (p2 === undefined) {
    p2 = 1 - p1;
  }
  const sum = (p1 as number) + (p2 as number);
  const multiplier = Math.min(sum, 1);
  const w1 = (p1 as number) / sum;
  const w2 = (p2 as number) / sum;
  const [c1, c2] = [stops[0].colour, stops[1].colour];
  const a = c1.a * w1 + c2.a * w2;
  const mix = (k: "r" | "g" | "b") => (a === 0 ? 0 : (c1[k] * c1.a * w1 + c2[k] * c2.a * w2) / a);
  return { r: mix("r"), g: mix("g"), b: mix("b"), a: a * multiplier };
}

/** Parses `#rgb`, `#rrggbb`, `rgb()` / `rgba()` (comma or slash syntax), named basics and `color-mix(in srgb, …)`. */
export function parseColor(text: string): Rgba {
  const value = text.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NAMED, value)) {
    return { ...NAMED[value] };
  }
  if (value.startsWith("#")) {
    return parseHex(value);
  }
  const fn = /^([a-z-]+)\((.*)\)$/s.exec(value);
  if (fn && (fn[1] === "rgb" || fn[1] === "rgba")) {
    return parseRgbFunction(fn[2]);
  }
  if (fn && fn[1] === "color-mix") {
    return parseColorMix(fn[2]);
  }
  throw new Error(`Unsupported colour "${text}"`);
}

/** Source-over compositing of `fg` on `bg`. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const mix = (k: "r" | "g" | "b") => (fg[k] * fg.a + bg[k] * bg.a * (1 - fg.a)) / a;
  return { r: mix("r"), g: mix("g"), b: mix("b"), a };
}

/** WCAG relative luminance of an opaque colour. */
export function luminance(colour: Rgba): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(colour.r) + 0.7152 * linear(colour.g) + 0.0722 * linear(colour.b);
}

/** WCAG contrast ratio; a translucent `fg` is composited on the (opaque) `bg` first. */
export function contrast(fg: Rgba, bg: Rgba): number {
  if (Math.abs(bg.a - 1) > 1e-6) {
    throw new Error("contrast() needs an opaque background");
  }
  const [l1, l2] = [luminance(over(fg, bg)), luminance(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// ---------------------------------------------------------------------------
// Gradients

/** `name(args)` → args, or null when `value` is not a single call of `name`. */
function callArgs(value: string, name: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith(`${name}(`) || !trimmed.endsWith(")")) {
    return null;
  }
  return trimmed.slice(name.length + 1, -1);
}

/** Colour part of a gradient colour stop such as `rgba(…) 0%` or `#1f2d40 45%`. */
function stopColour(stop: string): Rgba {
  const words = splitTopLevel(stop, /\s/);
  return parseColor(words[0]);
}

export interface RadialLayer {
  /** Size and position, e.g. `820px 600px at 8% -6%`. */
  shape: string;
  /** Colour stops as written. */
  stops: string[];
}

/** Splits a comma-separated list of `radial-gradient(…)` layers. */
export function radialLayers(value: string): RadialLayer[] {
  return splitTopLevel(value, ",").map((layer) => {
    const args = callArgs(layer, "radial-gradient");
    if (args === null) {
      throw new Error(`Not a radial-gradient: ${layer}`);
    }
    const [shape, ...stops] = splitTopLevel(args, ",");
    return { shape: shape.replace(/\s+/g, " "), stops };
  });
}

/** First colour of every `--glow` layer, in source order. */
export function glowCenters(theme: Theme, appearance: Appearance = {}): Rgba[] {
  return radialLayers(token(theme, "--glow", appearance)).map((layer) => stopColour(layer.stops[0]));
}

/** Centre of the first `--glow` layer: the top-left (accent) glow. */
export function glowCenter(theme: Theme, appearance: Appearance = {}): Rgba {
  return glowCenters(theme, appearance)[0];
}

/** Worst-case backdrop: the first glow centre over `--base`. */
export function backdrop(theme: Theme, appearance: Appearance = {}): Rgba {
  return over(glowCenter(theme, appearance), parseColor(token(theme, "--base", appearance)));
}

/** `--eink-paper` as colours: itself, or each stop of its linear-gradient. */
export function paperStops(theme: Theme, appearance: Appearance = {}): Rgba[] {
  return fillStops(theme, "--eink-paper", appearance);
}

/** A fill token as colours: itself, or each stop of its linear-gradient. */
export function fillStops(theme: Theme, name: string, appearance: Appearance = {}): Rgba[] {
  const paper = token(theme, name, appearance);
  const args = callArgs(paper, "linear-gradient");
  if (args === null) {
    return [parseColor(paper)];
  }
  const parts = splitTopLevel(args, ",");
  const first = parts[0].toLowerCase();
  const stops = /^-?[\d.]+(deg|turn|rad|grad)$/.test(first) || first.startsWith("to ") ? parts.slice(1) : parts;
  return stops.map(stopColour);
}

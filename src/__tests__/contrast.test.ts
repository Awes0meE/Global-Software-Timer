import { describe, expect, it } from "vitest";
import {
  allRules,
  backdrop,
  contrast,
  fillStops,
  glowCenters,
  over,
  paperStops,
  parseColor,
  parseRules,
  radialLayers,
  resolve,
  themeTokens,
  splitTopLevel,
  token,
  accentAlphaSelector,
  accentGlowSelector,
  einkSelector,
  type Appearance,
  type CssRule,
  type Rgba,
  type Theme,
} from "./support/css";
import { resolveAccent } from "../accent";
import { GLOW_ALPHA_CAPS, glowAlphas, windowsGlowAlphas, type GlowAlphas } from "../glow";
import { ACCENT_PRESETS, EINK_PALETTES, type AccentId, type EinkId } from "../appearancePresets";

// Worst-case surfaces (spec「对比度目标」): translucent layers are composited on
// the blue glow centre over --base, without saturate().
interface Surfaces {
  theme: Theme;
  appearance: Appearance;
  colour: (name: string) => Rgba;
  /** Bare backdrop B: the first (accent) glow centre over --base. */
  B: Rgba;
  /** Glass panel G = --glass over B. */
  G: Rgba;
  /** Sidebar S = --side over B. */
  S: Rgba;
  /** Opaque floating surface. */
  solid: Rgba;
}

/**
 * The surfaces of a theme under an appearance. `glowFrom` picks whose --glow the backdrop is taken from:
 * the appearance itself by default, or `{}` for today's glow.
 */
function surfaces(theme: Theme, appearance: Appearance = {}, glowFrom: Appearance = appearance): Surfaces {
  return surfacesOver(theme, appearance, backdrop(theme, glowFrom));
}

/** The surfaces of a theme under an appearance, with the opaque backdrop `B` given. */
function surfacesOver(theme: Theme, appearance: Appearance, B: Rgba): Surfaces {
  const tokens = themeTokens(theme, appearance);
  const colours = new Map<string, Rgba>();
  const colour = (name: string) => {
    if (!(name in tokens)) throw new Error(`Token ${name} is not defined for the ${theme} theme`);
    if (!colours.has(name)) colours.set(name, parseColor(resolve(tokens[name], tokens)));
    return { ...(colours.get(name) as Rgba) };
  };
  return {
    theme,
    appearance,
    colour,
    B,
    G: over(colour("--glass"), B),
    S: over(colour("--side"), B),
    solid: colour("--glass-solid"),
  };
}

function accentAt(s: Surfaces, alpha: number): Rgba {
  return { ...s.colour("--accent"), a: alpha };
}

// Plan trade-off 1 (local re-point): on the dark --glass-2 sub-plates the global --muted is too
// faint, so this one rule points --muted at --ink-2 there. Read --muted as the plates see it.
const SUB_PLATE_REPOINT = ':root[data-theme="dark"] :is(.mix-plate, .ach-plate.is-reached)';

const subPlateRepoint = allRules().find((rule) => rule.atRules.length === 0 && rule.selector === SUB_PLATE_REPOINT);

function subPlateMuted(s: Surfaces): Rgba {
  const value = s.theme === "dark" ? subPlateRepoint?.declarations["--muted"] : undefined;
  return value ? parseColor(resolve(value, themeTokens("dark", s.appearance))) : s.colour("--muted");
}

interface Combo {
  name: string;
  threshold: number;
  themes?: Theme[];
  pair: (s: Surfaces) => [Rgba, Rgba];
}

const TEXT = 4.5;
const GRAPHIC = 3;

const COMBOS: Combo[] = [
  // Text straight on the glow background (statistics range bar, loading notes, page titles).
  { name: "--ink on B", threshold: TEXT, pair: (s) => [s.colour("--ink"), s.B] },
  { name: "--ink-2 on B", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), s.B] },
  { name: "--ink-2 on chip over B", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), over(s.colour("--chip"), s.B)] },
  // The statistics range bar's date fields (task 8).
  { name: "--ink on chip over B", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(s.colour("--chip"), s.B)] },
  { name: "--ink on glass-2 over B", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(s.colour("--glass-2"), s.B)] },
  // Keys on the glass-2 surface straight on the background (decision 1B, 2026-11-23).
  { name: "--ink-2 on glass-2 over B", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), over(s.colour("--glass-2"), s.B)] },
  { name: "--ink-2 on --on over B", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), over(s.colour("--on"), s.B)] },
  { name: "--ink on --on over B", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(s.colour("--on"), s.B)] },
  {
    name: "--alert-ink on alert-wash over glass-solid",
    threshold: TEXT,
    pair: (s) => [s.colour("--alert-ink"), over(s.colour("--alert-wash"), s.solid)],
  },
  // Glass panels and the sidebar.
  { name: "--ink on G", threshold: TEXT, pair: (s) => [s.colour("--ink"), s.G] },
  { name: "--ink-2 on G", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), s.G] },
  { name: "--muted on G", threshold: TEXT, pair: (s) => [s.colour("--muted"), s.G] },
  { name: "--muted on S", threshold: TEXT, pair: (s) => [s.colour("--muted"), s.S] },
  { name: "--ink-2 on chip over G", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), over(s.colour("--chip"), s.G)] },
  // Also the in-panel control labels (编辑, 查看名单) on their --glass-2 key (decision 3C, 2026-11-23).
  { name: "--ink-2 on glass-2 over G", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), over(s.colour("--glass-2"), s.G)] },
  { name: "--ink-2 on --on over G", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), over(s.colour("--on"), s.G)] },
  {
    name: "--muted inside the sub-plates on glass-2 over G",
    threshold: TEXT,
    pair: (s) => [subPlateMuted(s), over(s.colour("--glass-2"), s.G)],
  },
  { name: "--ink on --on over G", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(s.colour("--on"), s.G)] },
  // Sidebar nav keys (v0.4.1 raised key): the current page's label and accent icon on the key face,
  // hovered and pressed labels, over the glass sidebar and over the opaque one (glass off).
  { name: "--ink on nav key over S", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(s.colour("--nk-fill"), s.S)] },
  { name: "--ink on nav key over glass-solid", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(s.colour("--nk-fill"), s.solid)] },
  { name: "--accent on nav key over S", threshold: GRAPHIC, pair: (s) => [s.colour("--accent"), over(s.colour("--nk-fill"), s.S)] },
  {
    name: "--accent on nav key over glass-solid",
    threshold: GRAPHIC,
    pair: (s) => [s.colour("--accent"), over(s.colour("--nk-fill"), s.solid)],
  },
  {
    name: "--ink-2 on hovered nav key over S",
    threshold: TEXT,
    pair: (s) => [s.colour("--ink-2"), over(s.colour("--nk-hover-fill"), s.S)],
  },
  { name: "--ink-2 on chip over S (pressed nav key)", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), over(s.colour("--chip"), s.S)] },
  // v0.4.2 raised header keys straight on the background: the date and labels in --ink, 周X, the caret and
  // the format tag in --ink-2; pressed, on --chip.
  { name: "--ink on header key over B", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(s.colour("--nk-fill"), s.B)] },
  { name: "--ink-2 on header key over B", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), over(s.colour("--nk-fill"), s.B)] },
  // Their popovers: menu rows and calendar caption keys raised on the opaque popover.
  { name: "--ink on popover key over glass-solid", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(s.colour("--nk-fill"), s.solid)] },
  { name: "--signal-ink on G", threshold: TEXT, pair: (s) => [s.colour("--signal-ink"), s.G] },
  { name: "--alert-ink on G", threshold: TEXT, pair: (s) => [s.colour("--alert-ink"), s.G] },
  {
    name: "--alert-ink on alert-wash over G",
    threshold: TEXT,
    pair: (s) => [s.colour("--alert-ink"), over(s.colour("--alert-wash"), s.G)],
  },
  // Accent is a graphic colour (focus ring, selection marks).
  { name: "--accent on G", threshold: GRAPHIC, pair: (s) => [s.colour("--accent"), s.G] },
  { name: "--accent on glass-solid", threshold: GRAPHIC, pair: (s) => [s.colour("--accent"), s.solid] },
  { name: "--ink on accent 30% over G (selection)", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(accentAt(s, 0.3), s.G)] },
  { name: "--ink on accent 16% over G (mark)", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(accentAt(s, 0.16), s.G)] },
  // --muted on chip in the settings panels (G) and in the statistics and achievements bars straight on the
  // background (B). These were the flat switch's off outline (trade-off 9); the 3D slider (task 7,
  // 2026-11-23) no longer draws one, and the pairs stay as a guard for --muted on --chip.
  {
    name: "--muted on chip over G",
    threshold: GRAPHIC,
    pair: (s) => [s.colour("--muted"), over(s.colour("--chip"), s.G)],
  },
  {
    name: "--muted on chip over B",
    threshold: GRAPHIC,
    pair: (s) => [s.colour("--muted"), over(s.colour("--chip"), s.B)],
  },
  // The 3D slider's F-B cues (task 7, 2026-11-23). Light: the switched-on track's darker accent rim
  // against the glass panel (settings) and the bare background (statistics, achievements bars).
  // The switched-off track's pale --edge-strong rim (L1, about 2.6:1 light, 1.6:1 dark) is below 3:1
  // on purpose: the user chose it over the 3.4–3.9:1 L2 outline, so it is not asserted here.
  { name: "on-track rim on G (switch on)", threshold: GRAPHIC, themes: ["light"], pair: (s) => [s.colour("--tg-rim-on"), s.G] },
  { name: "on-track rim on B (switch on)", threshold: GRAPHIC, themes: ["light"], pair: (s) => [s.colour("--tg-rim-on"), s.B] },
  // Dark: the knob's 1px ring is a box-shadow outside the knob, so it lies over the accent track, at rest
  // and on the lighter hover fill.
  {
    name: "knob ring over the on-track (switch on)",
    threshold: GRAPHIC,
    themes: ["dark"],
    pair: (s) => [s.colour("--tg-knob-rim-on"), s.colour("--accent")],
  },
  {
    name: "knob ring over the hovered on-track (switch on)",
    threshold: GRAPHIC,
    themes: ["dark"],
    pair: (s) => [
      s.colour("--tg-knob-rim-on"),
      parseColor(`color-mix(in srgb, ${token(s.theme, "--accent", s.appearance)} 90%, #fff)`),
    ],
  },
  // Opaque floating surfaces.
  { name: "--ink on glass-solid", threshold: TEXT, pair: (s) => [s.colour("--ink"), s.solid] },
  { name: "--ink-2 on glass-solid", threshold: TEXT, pair: (s) => [s.colour("--ink-2"), s.solid] },
  { name: "--muted on glass-solid", threshold: TEXT, pair: (s) => [s.colour("--muted"), s.solid] },
  // The statistics ranking's 新上榜 tag (task 8): --glass-solid letters on an --ink-2 tag.
  { name: "--glass-solid on ink-2 (rank-new tag)",threshold: TEXT, pair: (s) => [s.solid, s.colour("--ink-2")] },
  // Sticky table heads on --head-solid (decision E-B, 2026-11-23): --muted labels, --ink when sorted.
  { name: "--muted on head-solid", threshold: TEXT, pair: (s) => [s.colour("--muted"), s.colour("--head-solid")] },
  { name: "--ink on head-solid", threshold: TEXT, pair: (s) => [s.colour("--ink"), s.colour("--head-solid")] },
  // The add-software dialog (task 6): its error line, search hits and the selected row's path; also the
  // v0.4.2 toast on --glass-solid (已保存 in --ink, 保存失败 in --alert-ink).
  { name: "--alert-ink on glass-solid", threshold: TEXT, pair: (s) => [s.colour("--alert-ink"), s.solid] },
  // The toast's lit top edge: --glass-hi over --glass-solid.
  { name: "--ink on toast top", threshold: TEXT, pair: (s) => [s.colour("--ink"), over(s.colour("--glass-hi"), s.solid)] },
  {
    name: "--alert-ink on toast top",
    threshold: TEXT,
    pair: (s) => [s.colour("--alert-ink"), over(s.colour("--glass-hi"), s.solid)],
  },
  {
    name: "--ink on accent 16% over glass-solid (mark)",
    threshold: TEXT,
    pair: (s) => [s.colour("--ink"), over(accentAt(s, 0.16), s.solid)],
  },
  {
    name: "--muted on accent 14% over glass-solid (selected row)",
    threshold: TEXT,
    pair: (s) => [s.colour("--muted"), over(accentAt(s, 0.14), s.solid)],
  },
];

function measure(combo: Combo, s: Surfaces): number {
  const [fg, bg] = combo.pair(s);
  return contrast(fg, bg);
}

const THEMES: Theme[] = ["light", "dark"];

describe.each(THEMES)("contrast in the %s theme", (theme) => {
  const combos = COMBOS.filter((combo) => !combo.themes || combo.themes.includes(theme));

  it.each(combos.map((combo) => [combo.name, combo] as const))("%s", (_name, combo) => {
    const ratio = measure(combo, surfaces(theme));
    expect(ratio, `${theme}: ${combo.name} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(combo.threshold);
  });

  // Plan「口径」: B is the worst of the three glow centres; --muted on B is too low for
  // text (trade-off 23), --ink-2 is what text straight on the background uses.
  it("pins the worst-case backdrop B", () => {
    const s = surfaces(theme);
    expect(contrast(s.colour("--muted"), s.B), `${theme}: --muted on B`).toBeCloseTo(theme === "light" ? 4.15 : 4.14, 2);
    expect(contrast(s.colour("--ink-2"), s.B), `${theme}: --ink-2 on B`).toBeCloseTo(theme === "light" ? 7.86 : 7.71, 2);
  });

  it.each(["--ink", "--ink-2", "--muted"])("B is the lowest-contrast glow centre for %s", (name) => {
    const s = surfaces(theme);
    const base = s.colour("--base");
    const onB = contrast(s.colour(name), s.B);
    glowCenters(theme).forEach((centre, index) => {
      const ratio = contrast(s.colour(name), over(centre, base));
      expect(ratio, `${theme}: ${name} on glow layer ${index} = ${ratio.toFixed(2)}, on B = ${onB.toFixed(2)}`).toBeGreaterThanOrEqual(onB);
    });
  });

  it.each(["--ink", "--ink-2", "--muted"])("%s on glass-solid is not lower than on glass", (name) => {
    const s = surfaces(theme);
    const onSolid = contrast(s.colour(name), s.solid);
    const onGlass = contrast(s.colour(name), s.G);
    expect(onSolid, `${theme}: ${name} on glass-solid ${onSolid.toFixed(2)} vs on G ${onGlass.toFixed(2)}`).toBeGreaterThanOrEqual(
      onGlass,
    );
  });

  // v0.4.1 variant B: the sticky heads are a top-lit --head-fill key over --head-solid, so their labels
  // clear the text target on every stop of the fill, not only on the solid colour beneath it.
  it.each(["--muted", "--ink"])("%s on every sticky head fill stop", (name) => {
    const text = parseColor(token(theme, name));
    fillStops(theme, "--head-fill").forEach((stop, index) => {
      const ratio = contrast(text, stop);
      expect(ratio, `${theme}: ${name} on head fill stop ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(TEXT);
    });
  });

  it.each([
    ["--eink-ink", TEXT],
    ["--eink-dim", TEXT],
    ["--eink-mid", GRAPHIC],
  ] as const)("%s on every paper stop", (name, threshold) => {
    const ink = parseColor(token(theme, name));
    paperStops(theme).forEach((stop, index) => {
      const ratio = contrast(ink, stop);
      expect(ratio, `${theme}: ${name} on paper stop ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(threshold);
    });
  });

  // v0.4.2 calendar (a plain date picker on the e-ink paper): the picked day's digits on solid ink, and the
  // range band's digits over every stop of the paper. Plain and today digits are --eink-ink on the paper,
  // and pickable outside-month digits --eink-mid, both covered above.
  it.each([
    ["picked day and range ends", "--eink-paper-solid", "var(--eink-ink)", TEXT],
    ["range middle", "--eink-ink", "color-mix(in srgb, var(--eink-ink) 12%, transparent)", TEXT],
    ["range middle under the pointer", "--eink-ink", "color-mix(in srgb, var(--eink-ink) 24%, transparent)", TEXT],
    // --eink-mid on the band drops to about 2.6:1 on the dark paper, so outside-month middles take --eink-dim.
    ["outside-month range middle", "--eink-dim", "color-mix(in srgb, var(--eink-ink) 12%, transparent)", TEXT],
  ] as const)("prints the calendar's %s digits legibly", (_state, digits, cell, threshold) => {
    const tokens = themeTokens(theme);
    const text = parseColor(token(theme, digits));
    const fill = parseColor(resolve(cell, tokens));
    paperStops(theme).forEach((stop, index) => {
      const ratio = contrast(text, over(fill, stop));
      expect(ratio, `${theme}: ${digits} on ${cell} over paper stop ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(threshold);
    });
  });

  // Pickable outside-month days (--eink-mid) must read apart from disabled days (--eink-off) on the paper:
  // in the dark theme 28% ink sat too close to --eink-mid, so --eink-off is lighter there.
  it("keeps pickable outside-month days apart from disabled days", () => {
    const mid = parseColor(token(theme, "--eink-mid"));
    const off = parseColor(token(theme, "--eink-off"));
    paperStops(theme).forEach((stop, index) => {
      const ratio = contrast(mid, over(off, stop));
      expect(ratio, `${theme}: --eink-mid against --eink-off over paper stop ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(1.9);
    });
    const disabled = (selector: string) =>
      allRules().find((rule) => rule.atRules.length === 0 && rule.selectors.includes(selector))?.declarations.color;
    expect(disabled(".lcd-cal .rdp-day_button:disabled")).toBe("var(--eink-off)");
    expect(disabled(".cal-month:disabled")).toBe("var(--eink-off)");
  });

  // react-day-picker marks a range's middle days selected too, so the middles must not take the picked
  // day's solid ink, and the band tints are the ones measured above.
  it("keeps range middles off the picked day's solid ink", () => {
    const rules = allRules().filter((rule) => rule.file === "HeaderControls.css" && rule.atRules.length === 0);
    const selected = rules.filter((rule) => /\.rdp-selected/.test(rule.selector) && rule.declarations.background === "var(--eink-ink)");
    expect(selected.length).toBeGreaterThan(0);
    selected.forEach((rule) => rule.selectors.forEach((selector) => expect(selector).toContain(":not(.rdp-range_middle)")));

    const grid = rules.find((rule) => rule.selector === ".lcd-cal");
    expect(grid?.declarations["--cal-band"]).toBe("color-mix(in srgb, var(--eink-ink) 12%, transparent)");
    expect(grid?.declarations["--cal-band-hover"]).toBe("color-mix(in srgb, var(--eink-ink) 24%, transparent)");
    const middle = rules.find((rule) => rule.selectors.includes(".lcd-cal .rdp-range_middle .rdp-day_button"));
    expect(middle?.declarations.background).toBe("var(--cal-band)");
    expect(middle?.declarations.color).toBe("var(--eink-ink)");
    const outside = rules.find((rule) => rule.selectors.includes(".lcd-cal .rdp-range_middle.rdp-outside .rdp-day_button"));
    expect(outside?.declarations.color).toBe("var(--eink-dim)");
  });

  // The calendar is a plain picker: no rule paints per-day data (heat levels, record dots, dashed days).
  it("paints no per-day data in the calendar", () => {
    const rules = allRules().filter((rule) => rule.file === "HeaderControls.css");
    rules.forEach((rule) => expect(rule.selector).not.toMatch(/cal-lv|cal-future|cal-before-data/));
    rules.forEach((rule) => Object.values(rule.declarations).forEach((value) => expect(value).not.toMatch(/dashed|eink-heat/)));
  });

  // Plan trade-off 3, P-b (user, 2026-11-23): passed ticks under the pointer are mixed half way to the
  // track. The hour ticks stay above 3:1 on the dial paper; the minor ones drop to about 2.2 / 2.3:1,
  // a recorded deviation that comes with the user's choice, so they are pinned rather than held to 3:1.
  it("pins the passed ticks that yield to the pointer on the dial paper", () => {
    const tokens = themeTokens(theme);
    const paper = parseColor(token(theme, "--eink-dial-paper"));
    const stroke = (selector: string) => {
      const rule = allRules().find((candidate) => candidate.atRules.length === 0 && candidate.selector === selector);
      return parseColor(resolve(rule?.declarations.stroke ?? "(missing)", tokens));
    };
    const hour = contrast(stroke(".lcd-tick.is-hour.is-past.is-near-now"), paper);
    const minor = contrast(stroke(".lcd-tick.is-past.is-near-now"), paper);

    expect(hour, `${theme}: yielded hour tick = ${hour.toFixed(2)}`).toBeGreaterThanOrEqual(GRAPHIC);
    expect(minor, `${theme}: yielded minor tick = ${minor.toFixed(2)}`).toBeCloseTo(theme === "light" ? 2.17 : 2.32, 1);
  });

  // 用户已确认（2026-11-23）: the recorder's dashed no-record box is a graphic on the paper, so its stroke
  // clears 3:1 on every paper stop (light 4.06, dark 3.69 to 4.09 with the plain --eink-mid).
  it("keeps the no-record box above 3:1 on every paper stop", () => {
    const rule = allRules().find((candidate) => candidate.atRules.length === 0 && candidate.selector === ".gap");
    const gap = parseColor(resolve(rule?.declarations.stroke ?? "(missing)", themeTokens(theme)));
    paperStops(theme).forEach((stop, index) => {
      const ratio = contrast(gap, stop);
      expect(ratio, `${theme}: .gap on paper stop ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(GRAPHIC);
    });
  });
});

// ---------------------------------------------------------------------------
// Spec「新 token 取值」, written as the spec writes it.

function normalise(value: string): string {
  return value
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/\d*\.\d+/g, (number) => String(Number(number)).replace(/^0\./, ".").replace(/^-0\./, "-."));
}

const SPEC_TOKENS: Record<string, [light: string, dark: string]> = {
  "--base": ["#eceef3", "#17171a"],
  "--ink": ["#17191d", "#f1f3f7"],
  "--ink-2": ["#33373e", "#d5d9e0"],
  "--muted": ["#5a606c", "#98a0ad"],
  "--glass": ["rgba(255,255,255,.50)", "rgba(40,40,46,.42)"],
  "--glass-solid": ["#f6f7f9", "#1e1e22"],
  // v0.4.1 variant B (user, 2026-11-24): the dark head moved off near-black to a key step above the panel.
  "--head-solid": ["var(--glass-solid)", "#2a2a31"],
  "--glass-2": ["rgba(255,255,255,.55)", "rgba(255,255,255,.06)"],
  "--chip": ["rgba(20,30,60,.06)", "rgba(255,255,255,.07)"],
  "--on": ["rgba(255,255,255,.75)", "rgba(255,255,255,.10)"],
  "--side": ["rgba(255,255,255,.38)", "rgba(30,30,34,.55)"],
  "--edge": ["rgba(255,255,255,.75)", "rgba(255,255,255,.11)"],
  // Plan trade-off 4: not in the spec table, chosen with the user on 2026-11-23.
  "--edge-strong": ["rgba(20,30,60,.18)", "rgba(255,255,255,.18)"],
  "--rule": ["rgba(20,30,60,.07)", "rgba(255,255,255,.07)"],
  "--glass-hi": ["rgba(255,255,255,.8)", "rgba(255,255,255,.07)"],
  "--glass-shadow": ["0 18px 46px rgba(60,70,110,.14), 0 0 0 1px rgba(20,30,60,.06)", "0 24px 60px rgba(0,0,0,.35)"],
  // v0.4.4 spec §B: the accent reads the inline 主题色 variables, falling back to today's pair.
  "--accent": ["var(--user-accent-light, #2f7de1)", "var(--user-accent-dark, #5aa9ff)"],
  "--alert-ink": ["#b42318", "#ff8a80"],
  "--alert-wash": ["rgba(180,35,24,.10)", "rgba(255,138,128,.08)"],
  "--eink-paper": ["#fafaf7", "linear-gradient(105deg, #1f2d40 0%, #281f40 45%, #401f40 100%)"],
  "--eink-paper-solid": ["#fafaf7", "#281f40"],
  // Plan trade-off 3, R-2 (user, 2026-11-23): the paper behind the dial, for the pointer's rim.
  "--eink-dial-paper": ["var(--eink-paper-solid)", "#293244"],
  "--eink-ink": ["#0b0b0a", "#f7f7f9"],
  "--eink-dim": ["#45443f", "#c4c1ca"],
  "--eink-mid": ["#7c7b76", "#85828b"],
  "--eink-track": ["rgba(11,11,10,.12)", "rgba(247,247,249,.14)"],
  "--eink-ghost": ["rgba(11,11,10,.04)", "rgba(247,247,249,.05)"],
  "--eink-grain": [".06", ".45"],
  "--eink-grain-blend": ["multiply", "soft-light"],
  "--radius-panel": ["16px", "16px"],
  "--radius-key": ["9px", "9px"],
  "--radius-screen": ["11px", "11px"],
  "--radius-dialog": ["16px", "16px"],
};

const SPEC_MIX: Record<Theme, string> = {
  light: "#2f7de1 #e2536a #1fa874 #7d5ce0 #d99a0b #0f9fb8 #7b8594",
  dark: "#5aa9ff #ff6b81 #3ddc97 #a78bfa #fbbf24 #22d3ee #94a3b8",
};

// Spec「背景光晕层」: same structure in both themes, light positions from the mockup.
const SPEC_GLOW: Record<Theme, string[]> = {
  light: [
    "radial-gradient(820px 600px at 8% -6%, rgba(90,160,255,.34), transparent 62%)",
    "radial-gradient(760px 640px at 98% 10%, rgba(240,120,190,.26), transparent 60%)",
    "radial-gradient(860px 600px at 52% 110%, rgba(160,130,255,.30), transparent 62%)",
  ],
  dark: [
    "radial-gradient(820px 600px at 10% -4%, rgba(80,150,255,.30), transparent 62%)",
    "radial-gradient(760px 640px at 96% 14%, rgba(236,92,170,.24), transparent 60%)",
    "radial-gradient(860px 600px at 52% 108%, rgba(150,110,255,.28), transparent 62%)",
  ],
};

describe("design tokens", () => {
  it("matches the spec's token table", () => {
    THEMES.forEach((theme, column) => {
      const tokens = themeTokens(theme);
      for (const [name, values] of Object.entries(SPEC_TOKENS)) {
        expect(normalise(tokens[name] ?? "(missing)"), `${theme} ${name}`).toBe(normalise(values[column]));
      }
      SPEC_MIX[theme].split(" ").forEach((hex, index) => {
        const name = `--mix-${index + 1}`;
        expect(normalise(tokens[name] ?? "(missing)"), `${theme} ${name}`).toBe(hex);
      });
      const glow = radialLayers(tokens["--glow"] ?? "");
      const expected = SPEC_GLOW[theme].flatMap((layer) => radialLayers(layer));
      expect(glow.map((layer) => normalise(layer.shape)), `${theme} --glow positions`).toEqual(
        expected.map((layer) => normalise(layer.shape)),
      );
      expect(glow.map((layer) => layer.stops.map(normalise)), `${theme} --glow colours`).toEqual(
        expected.map((layer) => layer.stops.map(normalise)),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Plan「口径」: any rule painting --chip or --on also points --muted at --ink-2.

const NO_TEXT = /^\.(toggle|mix-bar|idle-bar|rhythm-track)(::?[\w-]+(\([^)]*\))?)*$/;
const CHIP_OR_ON = /var\(\s*--(chip|on)\s*[,)]/;

function missingMutedRepoint(rules: CssRule[]): string[] {
  return rules
    .filter((rule) =>
      ["background", "background-color"].some((property) => CHIP_OR_ON.test(rule.declarations[property] ?? "")),
    )
    .filter((rule) => !rule.selectors.every((selector) => NO_TEXT.test(selector)))
    .filter((rule) => (rule.declarations["--muted"] ?? "").replace(/\s+/g, "") !== "var(--ink-2)")
    .map((rule) => [...rule.atRules, rule.selector].join(" "));
}

describe("surfaces that lower --muted", () => {
  it("re-points --muted on chip and on surfaces", () => {
    expect(missingMutedRepoint(allRules())).toEqual([]);
  });

  it("the guard catches a chip rule without the re-point and allows the text-free list", () => {
    const { rules } = parseRules(`
      .a { background: var(--chip); }
      .b:hover { background-color: var(--on); --muted: var(--ink-2); }
      @media (max-width: 900px) { .c { background: linear-gradient(var(--on), var(--on)); } }
      .toggle, .toggle:hover, .mix-bar::after { background: var(--chip); }
      .toggle, .row { background: var(--chip); }
      .d { background: var(--on-strong, red); }
      .e { background-color: var(--chip); }
    `);

    expect(missingMutedRepoint(rules)).toEqual([".a", "@media (max-width: 900px) .c", ".toggle, .row", ".e"]);
  });
});

// ---------------------------------------------------------------------------
// v0.4.4 主题色 (spec §B) and 墨水屏配色 (spec §C).

const windowsCase = (label: string, light: string, dark = light): [string, Appearance] => [
  `system: ${label}`,
  { accent: "system", windowsAccent: { light, dark } },
];

/** Every 主题色 choice, and 跟随 Windows with real Windows accents put through the clamp. */
const ACCENT_CASES: [label: string, appearance: Appearance][] = [
  ...ACCENT_PRESETS.map((preset): [string, Appearance] => [
    preset.id === "system" ? "system: unreadable" : preset.id,
    { accent: preset.id },
  ]),
  windowsCase("default blue palette", "#0067c0", "#4cc2ff"),
  windowsCase("default blue base", "#0078d4"),
  windowsCase("yellow", "#ffb900"),
  windowsCase("teal", "#00b7c3"),
  windowsCase("orange", "#ff8c00"),
  windowsCase("near-white", "#f8f8f8"),
  windowsCase("near-black", "#101010"),
];

describe.each(ACCENT_CASES)("contrast with the %s accent", (_label, appearance) => {
  describe.each(THEMES)("in the %s theme", (theme) => {
    const combos = COMBOS.filter((combo) => !combo.themes || combo.themes.includes(theme));

    // The accent and every token built from it, on the surfaces over today's glow: how spec §B measures
    // the presets ("as measured in the mock README"). The accent-built glow itself is checked below.
    it.each(combos.map((combo) => [combo.name, combo] as const))("%s", (_name, combo) => {
      const ratio = measure(combo, surfaces(theme, appearance, {}));
      expect(ratio, `${theme}: ${combo.name} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(combo.threshold);
    });

    // 蓝 shows today's glow, where B stays the worst glow centre. Every other choice is measured over each
    // centre of its own glow instead (below).
    if (appearance.accent === "blue") {
      it.each(["--ink", "--ink-2", "--muted"])("B is the lowest-contrast glow centre for %s", (name) => {
        const s = surfaces(theme, appearance);
        const base = s.colour("--base");
        const onB = contrast(s.colour(name), s.B);
        glowCenters(theme, appearance).forEach((centre, index) => {
          const ratio = contrast(s.colour(name), over(centre, base));
          expect(ratio, `${theme}: ${name} on glow layer ${index} = ${ratio.toFixed(2)}, on B = ${onB.toFixed(2)}`).toBeGreaterThanOrEqual(onB);
        });
      });
    }
  });
});

/** Every COMBOS check that fails with `centre` (a translucent glow centre) over --base as the backdrop. */
function centreFailures(theme: Theme, appearance: Appearance, centre: Rgba): string[] {
  const base = parseColor(token(theme, "--base", appearance));
  const s = surfacesOver(theme, appearance, over(centre, base));
  return COMBOS.filter((combo) => !combo.themes || combo.themes.includes(theme)).flatMap((combo) => {
    const ratio = measure(combo, s);
    return ratio < combo.threshold ? [`${combo.name} = ${ratio.toFixed(2)}`] : [];
  });
}

/**
 * Spec §B: readability over the glow a choice really shows. Every check that fails there, with its ratio: the
 * COMBOS, at today's thresholds, over each of the three centres of the choice's own glow in turn (text
 * straight on the glow, on the glass, on the sidebar and on their keys; the accent at 3:1 on the glass over
 * each centre), and in light the accent at 3:1 on the glass over the bare base.
 */
function ownGlowFailures(theme: Theme, appearance: Appearance): string[] {
  const failures = glowCenters(theme, appearance).flatMap((centre, index) =>
    centreFailures(theme, appearance, centre).map((failure) => `glow layer ${index}: ${failure}`),
  );
  if (theme === "light") {
    const s = surfaces(theme, appearance);
    const ratio = contrast(s.colour("--accent"), over(s.colour("--glass"), s.colour("--base")));
    if (ratio < GRAPHIC) failures.push(`--accent on the glass over the base = ${ratio.toFixed(2)}`);
  }
  return failures;
}

describe.each(ACCENT_CASES)("the %s accent over its own glow", (_label, appearance) => {
  it.each(THEMES)("passes every readability check in the %s theme", (theme) => {
    expect(ownGlowFailures(theme, appearance)).toEqual([]);
  });
});

/** `#rrggbb` for an OKLCH colour, the channels clipped: a Windows accent can be any colour. */
function oklchHex(l: number, c: number, h: number): string {
  const [a, b] = [c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  const srgb = (x: number) => {
    const v = Math.min(1, Math.max(0, x));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  };
  return `#${linear.map((x) => srgb(x).toString(16).padStart(2, "0")).join("")}`;
}

// sRGB channel levels 0, 16, …, 240, 255: the cube's grid reaches the gamut corners an OKLCH sweep misses.
const CUBE_LEVELS = [...Array.from({ length: 16 }, (_, step) => step * 16), 255];
const rgbHex = (r: number, g: number, b: number) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

// Windows accents for the sweep: every 10° of hue at four chromas and four lightnesses, the greys, and the
// 17³ sRGB grid.
const WINDOWS_SWEEP: string[] = [
  ...Array.from({ length: 36 }, (_, step) =>
    [0.05, 0.12, 0.2, 0.3].flatMap((c) => [0.1, 0.4, 0.7, 0.95].map((l) => oklchHex(l, c, step * 10))),
  ).flat(),
  ...Array.from({ length: 11 }, (_, step) => oklchHex(step / 10, 0, 0)),
  ...CUBE_LEVELS.flatMap((r) => CUBE_LEVELS.flatMap((g) => CUBE_LEVELS.map((b) => rgbHex(r, g, b)))),
];

// 跟随 Windows computes its glow alphas from the clamped pair at runtime, and the stylesheet falls back to
// one set while no readable pair is known: both must hold for whatever accent the clamp returns. Each Windows accent is
// clamped once here, the clamp keeps a clamped pair as it is, and a theme only reads its own half of the
// pair, so each theme checks one pair per distinct clamped accent.
const CLAMPED_PAIRS = WINDOWS_SWEEP.map((hex) => resolveAccent("system", { light: hex, dark: hex }));
const clampedSweep = (theme: Theme) => [...new Map(CLAMPED_PAIRS.map((pair) => [pair[theme], pair])).values()];

describe.each(THEMES)("跟随 Windows over its own glow in the %s theme", (theme) => {
  it.each([
    ["its runtime alphas", true],
    ["the stylesheet's fallback alphas", false],
  ] as const)(
    "passes every readability check for every clamped Windows accent with %s",
    (_alphas, inlineGlow) => {
      const sweep = clampedSweep(theme);
      expect(sweep.length).toBeGreaterThan(3000);
      const failures = sweep.flatMap((pair) =>
        ownGlowFailures(theme, { accent: "system", windowsAccent: pair, inlineGlow }).map((failure) => `${pair[theme]}: ${failure}`),
      );
      expect(failures).toEqual([]);
    },
    120_000,
  );
});

/** Every paper an e-ink surface prints on: each paper stop, the solid paper and the dial paper. */
function allPapers(theme: Theme, appearance: Appearance): Rgba[] {
  return [
    ...paperStops(theme, appearance),
    parseColor(token(theme, "--eink-paper-solid", appearance)),
    parseColor(token(theme, "--eink-dial-paper", appearance)),
  ];
}

/** The colour of a calendar focus outline (`2px solid <colour>`), resolved for an appearance. */
function focusOutline(selector: string, theme: Theme, appearance: Appearance): Rgba {
  const rule = allRules().find((candidate) => candidate.atRules.length === 0 && candidate.selectors.includes(selector));
  const words = splitTopLevel(rule?.declarations.outline ?? "(missing)", /\s/);
  return parseColor(resolve(words[words.length - 1], themeTokens(theme, appearance)));
}

const PALETTES = EINK_PALETTES.map((palette) => palette.id);

describe.each(PALETTES)("the %s e-ink palette", (eink) => {
  describe.each(THEMES)("in the %s theme", (theme) => {
    const appearance: Appearance = { eink };

    it.each([
      ["--eink-ink", TEXT],
      ["--eink-dim", TEXT],
      ["--eink-mid", GRAPHIC],
    ] as const)("%s on every paper stop, the solid paper and the dial paper", (name, threshold) => {
      const ink = parseColor(token(theme, name, appearance));
      allPapers(theme, appearance).forEach((paper, index) => {
        const ratio = contrast(ink, paper);
        expect(ratio, `${eink} ${theme}: ${name} on paper ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(threshold);
      });
    });

    it.each([
      ["picked day and range ends", "--eink-paper-solid", "var(--eink-ink)"],
      ["range middle", "--eink-ink", "color-mix(in srgb, var(--eink-ink) 12%, transparent)"],
      ["range middle under the pointer", "--eink-ink", "color-mix(in srgb, var(--eink-ink) 24%, transparent)"],
      ["outside-month range middle", "--eink-dim", "color-mix(in srgb, var(--eink-ink) 12%, transparent)"],
    ] as const)("prints the calendar's %s digits legibly", (_state, digits, cell) => {
      const text = parseColor(token(theme, digits, appearance));
      const fill = parseColor(resolve(cell, themeTokens(theme, appearance)));
      paperStops(theme, appearance).forEach((stop, index) => {
        const ratio = contrast(text, over(fill, stop));
        expect(ratio, `${eink} ${theme}: ${digits} on ${cell} over paper stop ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          TEXT,
        );
      });
    });

    it("keeps pickable outside-month days apart from disabled days", () => {
      const mid = parseColor(token(theme, "--eink-mid", appearance));
      const off = parseColor(token(theme, "--eink-off", appearance));
      paperStops(theme, appearance).forEach((stop, index) => {
        const ratio = contrast(mid, over(off, stop));
        expect(ratio, `${eink} ${theme}: --eink-mid against --eink-off over paper stop ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          1.9,
        );
      });
    });

    // As for 极光: the yielded hour ticks stay above 3:1 on the dial paper; the minor ones are the recorded
    // deviation pinned above (about 2.2:1), held here to a 2:1 floor.
    it("keeps the dial's ticks that yield to the pointer readable on the dial paper", () => {
      const tokens = themeTokens(theme, appearance);
      const paper = parseColor(token(theme, "--eink-dial-paper", appearance));
      const stroke = (selector: string) => {
        const rule = allRules().find((candidate) => candidate.atRules.length === 0 && candidate.selector === selector);
        return parseColor(resolve(rule?.declarations.stroke ?? "(missing)", tokens));
      };
      const hour = contrast(stroke(".lcd-tick.is-hour.is-past.is-near-now"), paper);
      const minor = contrast(stroke(".lcd-tick.is-past.is-near-now"), paper);
      expect(hour, `${eink} ${theme}: yielded hour tick = ${hour.toFixed(2)}`).toBeGreaterThanOrEqual(GRAPHIC);
      expect(minor, `${eink} ${theme}: yielded minor tick = ${minor.toFixed(2)}`).toBeGreaterThanOrEqual(2);
    });

    it("keeps the no-record box above 3:1 on every paper stop", () => {
      const rule = allRules().find((candidate) => candidate.atRules.length === 0 && candidate.selector === ".gap");
      const gap = parseColor(resolve(rule?.declarations.stroke ?? "(missing)", themeTokens(theme, appearance)));
      paperStops(theme, appearance).forEach((stop, index) => {
        const ratio = contrast(gap, stop);
        expect(ratio, `${eink} ${theme}: .gap on paper stop ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(GRAPHIC);
      });
    });

    // Spec §C: the calendar's focus outline on the paper clears 3:1 for every 主题色 choice.
    it.each(ACCENT_CASES)("draws the calendar focus outline at 3:1 or more with the %s accent", (_label, accent) => {
      const combined: Appearance = { ...accent, eink };
      for (const selector of [".lcd-cal .rdp-day_button:focus-visible", ".cal-month:focus-visible"]) {
        const outline = focusOutline(selector, theme, combined);
        [...paperStops(theme, combined), parseColor(token(theme, "--eink-paper-solid", combined))].forEach((paper, index) => {
          const ratio = contrast(outline, paper);
          expect(ratio, `${eink} ${theme}: ${selector} on paper ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(GRAPHIC);
        });
      }
    });
  });
});

// Spec §C table「墨水屏配色」: every palette but 极光 sets all 11 tokens per theme; 极光 is today's look.
const EINK_TOKEN_NAMES = ["paper", "paper-solid", "dial-paper", "ink", "dim", "mid", "off", "track", "ghost", "grain", "grain-blend"];

const SPEC_EINK: Record<Exclude<EinkId, "aurora">, Record<Theme, string[]>> = {
  graphite: {
    light: ["#e3e3e1", "#e3e3e1", "#e3e3e1", "#111111", "#434346", "#6e6e72", "rgba(17,17,17,.28)", "rgba(17,17,17,.12)", "rgba(17,17,17,.04)", ".06", "multiply"],
    dark: ["linear-gradient(105deg, #22252b, #2a2c33)", "#26282e", "#2c2f36", "#ededf0", "#b4b5bb", "#85868d", "rgba(237,237,240,.2)", "rgba(237,237,240,.14)", "rgba(237,237,240,.05)", ".4", "soft-light"],
  },
  night: {
    light: ["#e2ebf6", "#e2ebf6", "#e2ebf6", "#0b1422", "#30435e", "#5d7392", "rgba(11,20,34,.28)", "rgba(11,20,34,.12)", "rgba(11,20,34,.04)", ".06", "multiply"],
    dark: ["linear-gradient(105deg, #14233a, #1a2f4d)", "#172943", "#1d3150", "#e7eef8", "#a9bad0", "#6f84a1", "rgba(231,238,248,.2)", "rgba(231,238,248,.14)", "rgba(231,238,248,.05)", ".4", "soft-light"],
  },
  warm: {
    light: ["#f4eee1", "#f4eee1", "#f4eee1", "#2a2218", "#5a4d3c", "#857660", "rgba(42,34,24,.28)", "rgba(42,34,24,.13)", "rgba(42,34,24,.05)", ".08", "multiply"],
    dark: ["linear-gradient(105deg, #2a231b, #3a2c20)", "#322719", "#3a2e22", "#f4ead8", "#cdbfa6", "#958670", "rgba(244,234,216,.2)", "rgba(244,234,216,.14)", "rgba(244,234,216,.05)", ".42", "soft-light"],
  },
  forest: {
    light: ["#e1ede4", "#e1ede4", "#e1ede4", "#0e1a14", "#31503f", "#5e7a6b", "rgba(14,26,20,.28)", "rgba(14,26,20,.12)", "rgba(14,26,20,.04)", ".06", "multiply"],
    dark: ["linear-gradient(105deg, #16302a, #1d3b33)", "#1a352e", "#1f3d35", "#e8f2ec", "#aac3b6", "#6f9183", "rgba(232,242,236,.2)", "rgba(232,242,236,.14)", "rgba(232,242,236,.05)", ".4", "soft-light"],
  },
};

// Spec §B variant B: the mock formula, with each blob's alpha read from a --glow-alpha-* custom property.
// Every choice but 蓝 and 跟随 Windows sets its own (GLOW_ALPHAS); 跟随 Windows reads the inline
// --user-glow-<theme>-* alphas, and the innermost fallbacks are its first-frame and unreadable values.
const ACCENT_GLOW: Record<Theme, string[]> = {
  light: [
    "radial-gradient(820px 600px at 8% -6%, color-mix(in srgb, var(--accent) var(--glow-alpha-1, var(--user-glow-light-1, 16%)), transparent), transparent 62%)",
    "radial-gradient(760px 640px at 98% 10%, color-mix(in srgb, color-mix(in srgb, var(--accent) 40%, rgb(240,120,190)) var(--glow-alpha-2, var(--user-glow-light-2, 18%)), transparent), transparent 60%)",
    "radial-gradient(860px 600px at 52% 110%, color-mix(in srgb, color-mix(in srgb, var(--accent) 65%, rgb(160,130,255)) var(--glow-alpha-3, var(--user-glow-light-3, 17%)), transparent), transparent 62%)",
  ],
  dark: [
    "radial-gradient(820px 600px at 10% -4%, color-mix(in srgb, var(--accent) var(--glow-alpha-1, var(--user-glow-dark-1, 23%)), transparent), transparent 62%)",
    "radial-gradient(760px 640px at 96% 14%, color-mix(in srgb, color-mix(in srgb, var(--accent) 40%, rgb(236,92,170)) var(--glow-alpha-2, var(--user-glow-dark-2, 20%)), transparent), transparent 60%)",
    "radial-gradient(860px 600px at 52% 108%, color-mix(in srgb, color-mix(in srgb, var(--accent) 65%, rgb(150,110,255)) var(--glow-alpha-3, var(--user-glow-dark-3, 22%)), transparent), transparent 62%)",
  ],
};

// Blob alphas in whole percent: for each choice, the largest up to the mock's 45 / 26 / 30 light and
// 50 / 24 / 28 dark at which every COMBOS check passes over that blob's centre (src/glow.ts derives them).
const GLOW_ALPHAS: Record<Exclude<AccentId, "blue" | "system">, Record<Theme, GlowAlphas>> = {
  cyan: { light: [26, 26, 29], dark: [27, 24, 28] },
  green: { light: [25, 26, 28], dark: [27, 24, 28] },
  violet: { light: [25, 26, 28], dark: [32, 24, 28] },
  rose: { light: [22, 26, 26], dark: [31, 24, 28] },
  amber: { light: [27, 26, 30], dark: [25, 24, 28] },
  graphite: { light: [25, 26, 28], dark: [27, 24, 28] },
};

// 跟随 Windows's first-frame and unreadable alphas, the innermost fallbacks of ACCENT_GLOW.
const SYSTEM_FALLBACK_ALPHAS: Record<Theme, GlowAlphas> = { light: [16, 18, 17], dark: [23, 20, 22] };

/** The custom properties of the one top-level rule with exactly `selector`. */
function overrideBlock(selector: string): Record<string, string> {
  const rules = allRules().filter((rule) => rule.atRules.length === 0 && rule.selectors.length === 1 && rule.selectors[0] === selector);
  expect(rules, selector).toHaveLength(1);
  return rules[0].declarations;
}

describe("appearance tokens", () => {
  it.each(Object.entries(SPEC_EINK))("sets every e-ink token of the %s palette per theme, as the spec table", (id, values) => {
    THEMES.forEach((theme) => {
      const block = overrideBlock(einkSelector(theme, id as EinkId));
      expect(Object.keys(block).sort(), `${id} ${theme}`).toEqual(EINK_TOKEN_NAMES.map((name) => `--eink-${name}`).sort());
      EINK_TOKEN_NAMES.forEach((name, index) => {
        expect(normalise(block[`--eink-${name}`]), `${id} ${theme} --eink-${name}`).toBe(normalise(values[theme][index]));
      });
    });
  });

  it("has no rule for 极光, which is today's tokens", () => {
    THEMES.forEach((theme) => {
      expect(allRules().filter((rule) => rule.selectors.includes(einkSelector(theme, "aurora")))).toEqual([]);
      expect(themeTokens(theme, { eink: "aurora" })).toEqual(themeTokens(theme));
    });
  });

  it("reads the accent from the inline variables, with today's pair as the fallback", () => {
    expect(normalise(themeTokens("light")["--accent"])).toBe(normalise("var(--user-accent-light, #2f7de1)"));
    expect(normalise(themeTokens("dark")["--accent"])).toBe(normalise("var(--user-accent-dark, #5aa9ff)"));
    expect(token("light", "--accent")).toBe("#2f7de1");
    expect(token("dark", "--accent")).toBe("#5aa9ff");
    ACCENT_PRESETS.forEach((preset) => {
      expect(token("light", "--accent", { accent: preset.id }), preset.id).toBe(preset.light);
      expect(token("dark", "--accent", { accent: preset.id }), preset.id).toBe(preset.dark);
    });
  });

  it("keeps today's glow for 蓝 and builds the glow from the accent for every other choice", () => {
    THEMES.forEach((theme) => {
      const today = token(theme, "--glow");
      expect(token(theme, "--glow", { accent: "blue" })).toBe(today);
      const built = radialLayers(overrideBlock(accentGlowSelector(theme))["--glow"]);
      const expected = ACCENT_GLOW[theme].flatMap((layer) => radialLayers(layer));
      expect(built.map((layer) => normalise(layer.shape)), `${theme} positions`).toEqual(
        radialLayers(today).map((layer) => normalise(layer.shape)),
      );
      expect(built.map((layer) => layer.stops.map(normalise)), `${theme} colours`).toEqual(
        expected.map((layer) => layer.stops.map(normalise)),
      );
      const others = ACCENT_PRESETS.map((preset) => preset.id).filter((id): id is AccentId => id !== "blue");
      for (const choice of others) {
        expect(token(theme, "--glow", { accent: choice }), `${theme} ${choice}`).not.toBe(today);
      }
    });
  });

  // Every choice but 蓝 and 跟随 Windows has one rule per theme.
  it.each(Object.entries(GLOW_ALPHAS))("sets the %s glow alphas per theme, as GLOW_ALPHAS", (id, alphas) => {
    THEMES.forEach((theme) => {
      expect(overrideBlock(accentAlphaSelector(theme, id as AccentId)), `${id} ${theme}`).toEqual({
        "--glow-alpha-1": `${alphas[theme][0]}%`,
        "--glow-alpha-2": `${alphas[theme][1]}%`,
        "--glow-alpha-3": `${alphas[theme][2]}%`,
      });
      glowCenters(theme, { accent: id as AccentId }).forEach((centre, index) => {
        expect(centre.a, `${id} ${theme} blob ${index + 1}`).toBeCloseTo(alphas[theme][index] / 100, 6);
      });
    });
  });

  // The table is the search's output, and each value is the largest that passes the COMBOS here: one more
  // percent fails a check over that centre, unless the value is the mock's.
  it.each(Object.entries(GLOW_ALPHAS))("holds the largest passing %s alphas up to the mock's", (id, alphas) => {
    const preset = ACCENT_PRESETS.find((candidate) => candidate.id === id)!;
    const appearance: Appearance = { accent: id as AccentId };
    THEMES.forEach((theme) => {
      expect(glowAlphas(theme, preset[theme]), `${id} ${theme}`).toEqual(alphas[theme]);
      glowCenters(theme, appearance).forEach((centre, blob) => {
        expect(centreFailures(theme, appearance, centre), `${id} ${theme} blob ${blob + 1}`).toEqual([]);
        if (alphas[theme][blob] < GLOW_ALPHA_CAPS[theme][blob]) {
          const stronger = { ...centre, a: (alphas[theme][blob] + 1) / 100 };
          expect(centreFailures(theme, appearance, stronger), `${id} ${theme} blob ${blob + 1} + 1%`).not.toEqual([]);
        }
      });
    });
  });

  // 跟随 Windows has no alpha rule: with a readable pair it shows the alphas computed from the clamped pair,
  // inline; without a readable pair (a first frame with none cached, or an unreadable accent), the fallbacks.
  it("shows 跟随 Windows's runtime alphas, and the fallbacks without them", () => {
    const windows = { light: "#0067c0", dark: "#4cc2ff" };
    const runtime = windowsGlowAlphas(windows)!;
    THEMES.forEach((theme) => {
      expect(allRules().filter((rule) => rule.selectors.includes(accentAlphaSelector(theme, "system")))).toEqual([]);
      const alphasOf = (appearance: Appearance) => glowCenters(theme, appearance).map((centre) => Math.round(centre.a * 100));
      expect(alphasOf({ accent: "system", windowsAccent: windows }), theme).toEqual(runtime[theme]);
      expect(alphasOf({ accent: "system", windowsAccent: windows, inlineGlow: false }), theme).toEqual(SYSTEM_FALLBACK_ALPHAS[theme]);
      expect(alphasOf({ accent: "system", windowsAccent: null }), theme).toEqual(SYSTEM_FALLBACK_ALPHAS[theme]);
    });
  });

  // The runtime alphas are the largest that pass the COMBOS here too, for every Windows sample.
  it.each(ACCENT_CASES.filter(([, appearance]) => appearance.windowsAccent))(
    "holds the largest passing runtime alphas for %s",
    (_label, appearance) => {
      const runtime = windowsGlowAlphas(appearance.windowsAccent ?? null)!;
      THEMES.forEach((theme) => {
        glowCenters(theme, appearance).forEach((centre, blob) => {
          expect(Math.round(centre.a * 100), `${theme} blob ${blob + 1}`).toBe(runtime[theme][blob]);
          expect(centreFailures(theme, appearance, centre), `${theme} blob ${blob + 1}`).toEqual([]);
          if (runtime[theme][blob] < GLOW_ALPHA_CAPS[theme][blob]) {
            const stronger = { ...centre, a: (runtime[theme][blob] + 1) / 100 };
            expect(centreFailures(theme, appearance, stronger), `${theme} blob ${blob + 1} + 1%`).not.toEqual([]);
          }
        });
      });
    },
  );

  it("sets no glow alphas for 蓝", () => {
    THEMES.forEach((theme) => {
      expect(allRules().filter((rule) => rule.selectors.includes(accentAlphaSelector(theme, "blue")))).toEqual([]);
    });
  });

  // Spec §B: the switched-on well is rebuilt from the accent; no hard-coded navy.
  it.each([
    ["light", "inset 0 2px 3px -1px color-mix(in srgb, color-mix(in srgb, var(--accent) 30%, #000) 50%, transparent), inset 0 -1px 0 rgba(255,255,255,.32)"],
    ["dark", "inset 0 2px 3px -1px color-mix(in srgb, color-mix(in srgb, var(--accent) 22%, #000) 60%, transparent), inset 0 -1px 0 rgba(255,255,255,.28)"],
  ] as const)("builds the %s switch well from the accent", (theme, value) => {
    expect(normalise(themeTokens(theme)["--tg-well-on"])).toBe(normalise(value));
  });
});

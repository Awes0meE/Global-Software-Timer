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
  token,
  type CssRule,
  type Rgba,
  type Theme,
} from "./support/css";

// Worst-case surfaces (spec「对比度目标」): translucent layers are composited on
// the blue glow centre over --base, without saturate().
interface Surfaces {
  theme: Theme;
  colour: (name: string) => Rgba;
  /** Bare backdrop B: blue glow centre over --base. */
  B: Rgba;
  /** Glass panel G = --glass over B. */
  G: Rgba;
  /** Sidebar S = --side over B. */
  S: Rgba;
  /** Opaque floating surface. */
  solid: Rgba;
}

function surfaces(theme: Theme): Surfaces {
  const colour = (name: string) => parseColor(token(theme, name));
  const B = backdrop(theme);
  return {
    theme,
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

function subPlateMuted(s: Surfaces): Rgba {
  const repoint = allRules().find((rule) => rule.atRules.length === 0 && rule.selector === SUB_PLATE_REPOINT);
  const value = s.theme === "dark" ? repoint?.declarations["--muted"] : undefined;
  return value ? parseColor(resolve(value, themeTokens("dark"))) : s.colour("--muted");
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
    pair: (s) => [s.colour("--tg-knob-rim-on"), parseColor(`color-mix(in srgb, ${token(s.theme, "--accent")} 90%, #fff)`)],
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

  // v0.4.2 calendar: each heat level's digits on its cell, over every stop of the e-ink paper.
  it.each([
    ["level 0", "--eink-dim", "color-mix(in srgb, var(--eink-ink) 9%, transparent)"],
    ["level 1", "--eink-ink", "var(--eink-heat-1)"],
    ["level 2", "--eink-paper-solid", "color-mix(in srgb, var(--eink-ink) 70%, transparent)"],
    ["level 3 and the shown day", "--eink-paper-solid", "var(--eink-ink)"],
    // Range mode: every middle day on --chip; outside-month middle days in dim digits.
    ["range middle", "--eink-ink", "var(--chip)"],
    ["outside-month range middle", "--eink-dim", "var(--chip)"],
  ])("prints the calendar's %s digits legibly", (_level, digits, cell) => {
    const tokens = themeTokens(theme);
    const text = parseColor(token(theme, digits));
    const fill = parseColor(resolve(cell, tokens));
    paperStops(theme).forEach((stop, index) => {
      const ratio = contrast(text, over(fill, stop));
      expect(ratio, `${theme}: ${digits} on ${cell} over paper stop ${index} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(TEXT);
    });
  });

  // react-day-picker marks a range's middle days selected too, so the middles must not take the shown
  // day's solid ink, and their own rule must print the digits measured above.
  it("keeps range middles off the shown day's solid ink", () => {
    const rules = allRules().filter((rule) => rule.file === "HeaderControls.css" && rule.atRules.length === 0);
    const selected = rules.filter((rule) => /\.rdp-selected/.test(rule.selector) && rule.declarations.background === "var(--eink-ink)");
    expect(selected.length).toBeGreaterThan(0);
    selected.forEach((rule) => rule.selectors.forEach((selector) => expect(selector).toContain(":not(.rdp-range_middle)")));

    const middle = rules.find((rule) => rule.selectors.includes(".lcd-cal .rdp-range_middle .rdp-day_button"));
    expect(middle?.declarations.background).toBe("var(--chip)");
    expect(middle?.declarations.color).toBe("var(--eink-ink)");
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
  "--accent": ["#2f7de1", "#5aa9ff"],
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

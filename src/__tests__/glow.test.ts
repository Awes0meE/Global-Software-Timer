import { describe, expect, it } from "vitest";
import { resolveAccent } from "../accent";
import { ACCENT_PRESETS, type AccentId } from "../appearancePresets";
import {
  GLOW_ALPHA_CAPS,
  GLOW_SURFACES,
  glowAlphas,
  glowCentre,
  glowCentreFailures,
  windowsGlowAlphas,
  type GlowAlphas,
} from "../glow";
import { glowCenters, parseColor, token, type Theme } from "./support/css";

const THEMES: Theme[] = ["light", "dark"];

// Spec §B: the preset table in styles.css (GLOW_ALPHAS), as the search derives it. contrast.test.ts holds the
// stylesheet to this table and checks it with its own measurements.
const PRESET_GLOW_ALPHAS: Record<Exclude<AccentId, "blue" | "system">, Record<Theme, GlowAlphas>> = {
  cyan: { light: [26, 26, 29], dark: [27, 24, 28] },
  green: { light: [25, 26, 28], dark: [27, 24, 28] },
  violet: { light: [25, 26, 28], dark: [32, 24, 28] },
  rose: { light: [22, 26, 26], dark: [31, 24, 28] },
  amber: { light: [27, 26, 30], dark: [25, 24, 28] },
  graphite: { light: [25, 26, 28], dark: [27, 24, 28] },
};

// The stylesheet's 跟随 Windows fallbacks, while no readable pair is known: a first frame without a cached
// pair, or an unreadable Windows accent.
const FALLBACKS: Record<Theme, GlowAlphas> = { light: [16, 18, 17], dark: [23, 20, 22] };

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("the glow module's copies of the stylesheet", () => {
  it.each(THEMES)("match the %s tokens", (theme) => {
    for (const [name, copy] of Object.entries(GLOW_SURFACES[theme])) {
      const sheet = parseColor(token(theme, name));
      expect(
        (["r", "g", "b", "a"] as const).every((k) => close(sheet[k], copy[k])),
        `${theme} ${name}: ${JSON.stringify(copy)} vs ${JSON.stringify(sheet)}`,
      ).toBe(true);
    }
  });

  it.each(THEMES)("build the same blob colours as the %s stylesheet", (theme) => {
    for (const id of Object.keys(PRESET_GLOW_ALPHAS) as (keyof typeof PRESET_GLOW_ALPHAS)[]) {
      const preset = ACCENT_PRESETS.find((candidate) => candidate.id === id)!;
      glowCenters(theme, { accent: id }).forEach((sheet, blob) => {
        const built = glowCentre(theme, preset[theme], blob, PRESET_GLOW_ALPHAS[id][theme][blob]);
        expect(
          (["r", "g", "b", "a"] as const).every((k) => close(sheet[k], built[k])),
          `${id} ${theme} blob ${blob + 1}`,
        ).toBe(true);
      });
    }
  });
});

describe("glowAlphas", () => {
  it.each(Object.entries(PRESET_GLOW_ALPHAS))("derives the %s row of the preset table", (id, row) => {
    const preset = ACCENT_PRESETS.find((candidate) => candidate.id === id)!;
    THEMES.forEach((theme) => expect(glowAlphas(theme, preset[theme]), `${id} ${theme}`).toEqual(row[theme]));
  });

  // Each value is the largest whole percent that passes, capped at the mock's.
  it.each(ACCENT_PRESETS.map((preset) => [preset.id, preset] as const))("picks the largest passing alphas for %s", (_id, preset) => {
    THEMES.forEach((theme) => {
      glowAlphas(theme, preset[theme]).forEach((alpha, blob) => {
        const cap = GLOW_ALPHA_CAPS[theme][blob];
        expect(alpha).toBeLessThanOrEqual(cap);
        expect(glowCentreFailures(theme, preset[theme], glowCentre(theme, preset[theme], blob, alpha))).toEqual([]);
        if (alpha < cap) {
          expect(glowCentreFailures(theme, preset[theme], glowCentre(theme, preset[theme], blob, alpha + 1))).not.toEqual([]);
        }
      });
    });
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

// Every 5° of hue at five chromas and three lightnesses, and the greys.
const HUE_SWEEP: string[] = [
  ...Array.from({ length: 72 }, (_, step) =>
    [0, 0.05, 0.1, 0.18, 0.28].flatMap((c) => [0.3, 0.6, 0.85].map((l) => oklchHex(l, c, step * 5))),
  ).flat(),
];

describe("windowsGlowAlphas", () => {
  it("passes every glow check for every clamped Windows accent, never fainter than the fallbacks", () => {
    const failures: string[] = [];
    for (const hex of HUE_SWEEP) {
      const windows = { light: hex, dark: hex };
      const pair = resolveAccent("system", windows);
      const alphas = windowsGlowAlphas(windows)!;
      THEMES.forEach((theme) => {
        alphas[theme].forEach((alpha, blob) => {
          if (alpha > GLOW_ALPHA_CAPS[theme][blob]) failures.push(`${hex} ${theme} blob ${blob + 1} over the cap`);
          if (alpha < FALLBACKS[theme][blob]) failures.push(`${hex} ${theme} blob ${blob + 1} = ${alpha}, under the fallback`);
          glowCentreFailures(theme, pair[theme], glowCentre(theme, pair[theme], blob, alpha)).forEach((failure) =>
            failures.push(`${hex} ${theme} blob ${blob + 1} at ${alpha}%: ${failure}`),
          );
        });
      });
    }
    expect(failures).toEqual([]);
  }, 60_000);

  // The default Windows blue (AccentDark1 #0067c0 / AccentLight2 #4cc2ff) gets its own largest alphas: far
  // stronger than the fallbacks, but not everywhere as strong as the 蓝 accent's own search (light #2f7de1
  // 27 / 26 / 29, dark #5aa9ff 30 / 24 / 28). Light blobs 1 and 3 and dark blob 1 stay under it. In light
  // #0067c0 is darker and --alert-ink on --alert-wash over the glass is the bound; the tint shown is about the
  // same (OKLab distance from --base about 0.102 against 0.110 for blob 1). In dark --muted on the glass is
  // the bound.
  it("gives the default Windows blue far stronger alphas than the fallbacks", () => {
    const alphas = windowsGlowAlphas({ light: "#0067c0", dark: "#4cc2ff" })!;
    expect(alphas).toEqual({ light: [21, 26, 25], dark: [27, 24, 28] });
    THEMES.forEach((theme) =>
      alphas[theme].forEach((alpha, blob) => expect(alpha).toBeGreaterThan(FALLBACKS[theme][blob])),
    );
    const blue = ACCENT_PRESETS.find((preset) => preset.id === "blue")!;
    expect({ light: glowAlphas("light", blue.light), dark: glowAlphas("dark", blue.dark) }).toEqual({
      light: [27, 26, 29],
      dark: [30, 24, 28],
    });
  });

  it("is null when the Windows accent cannot be read, so the fallbacks apply", () => {
    expect(windowsGlowAlphas(null)).toBeNull();
    expect(windowsGlowAlphas({ light: "blue", dark: "#4cc2ff" })).toBeNull();
    expect(windowsGlowAlphas({ light: "#0067c0" } as never)).toBeNull();
  });
});

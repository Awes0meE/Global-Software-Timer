// Spec §B 主题色: resolves a 主题色 choice to its light and dark `--accent`, and clamps a Windows accent
// into the same contrast rules every preset meets. Pure: no DOM, no storage.
import { ACCENT_PRESETS, type AccentId } from "./appearancePresets";

export type AccentTheme = "light" | "dark";

export interface AccentPair {
  light: string;
  dark: string;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// The surfaces the rules are measured on: copies of the styles.css tokens (accent.test.ts measures the
// clamp's output against the stylesheet itself, so a drift fails there). Only the light accent is measured
// on the glass and the glow; the dark rules need --muted and --glass-solid alone.
const LIGHT = {
  base: rgb(0xec, 0xee, 0xf3),
  glass: rgb(255, 255, 255, 0.5),
  solid: rgb(0xf6, 0xf7, 0xf9),
  muted: rgb(0x5a, 0x60, 0x6c),
  // Today's --glow centres (the 蓝 glow), where spec §B measures every preset.
  todayGlow: [rgb(90, 160, 255, 0.34), rgb(240, 120, 190, 0.26), rgb(160, 130, 255, 0.3)],
  // Spec §B variant B glow built from the accent: the accent share and the colour mixed in, per blob, at the
  // mock's alphas, the ceiling of the alphas glow.ts computes for 跟随 Windows. This is a stricter stand-in
  // for the glow styles.css really shows; contrast.test.ts checks the clamped accents over that real glow.
  // Keeping the mock alphas here also keeps today's clamp results.
  glow: [
    { share: 1, mixWith: rgb(0, 0, 0), alpha: 0.45 },
    { share: 0.4, mixWith: rgb(240, 120, 190), alpha: 0.26 },
    { share: 0.65, mixWith: rgb(160, 130, 255), alpha: 0.3 },
  ],
};

const DARK = {
  solid: rgb(0x1e, 0x1e, 0x22),
  muted: rgb(0x98, 0xa0, 0xad),
};

const KNOB_RING = rgb(0, 0, 0, 0.5);
const WHITE = rgb(255, 255, 255);
const GRAPHIC = 3;
const TEXT = 4.5;
// The clamp aims a hair above each target, so rounding in another measurement cannot tip a result under it.
const MARGIN = 0.02;
const STEP = 0.002;

const HEX = /^#[0-9a-f]{6}$/i;

export function rgb(r: number, g: number, b: number, a = 1): Rgba {
  return { r, g, b, a };
}

export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function parseHex(hex: string): Rgba {
  return rgb(...([1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as [number, number, number]));
}

function toHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** Source-over, as in the contrast tests. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  const mix = (k: "r" | "g" | "b") => (a === 0 ? 0 : (fg[k] * fg.a + bg[k] * bg.a * (1 - fg.a)) / a);
  return { r: mix("r"), g: mix("g"), b: mix("b"), a };
}

/** `color-mix(in srgb, a share, b)` of two opaque colours. */
export function mix(a: Rgba, share: number, b: Rgba): Rgba {
  const channel = (k: "r" | "g" | "b") => a[k] * share + b[k] * (1 - share);
  return rgb(channel("r"), channel("g"), channel("b"));
}

function luminance({ r, g, b }: Rgba): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast of `fg` composited on the opaque `bg`. */
export function contrast(fg: Rgba, bg: Rgba): number {
  const [l1, l2] = [luminance(over(fg, bg)), luminance(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Centres of the light glow this accent builds (spec §B variant B), as translucent colours. */
function accentGlowCentres(accent: Rgba): Rgba[] {
  return LIGHT.glow.map(({ share, mixWith, alpha }) => ({ ...mix(accent, share, mixWith), a: alpha }));
}

/** Lowest contrast of the accent on the light glass over the bare base and over each of `centres`. */
function onGlass(accent: Rgba, centres: Rgba[]): number {
  const { base, glass } = LIGHT;
  return Math.min(...[base, ...centres.map((centre) => over(centre, base))].map((bg) => contrast(accent, over(glass, bg))));
}

/**
 * Spec §B rules, measured as the mock README measures the presets. Light: at least 3:1 on --glass-solid and
 * on the glass over the base and over every centre of today's glow. Dark: the knob ring at least 3:1 over the
 * accent, at rest and on the hovered track (the accent 90% mixed with white, styles.css --toggle-fill).
 * Both: --muted on a 14% accent tint over --glass-solid at least 4.5:1 (the spec names it for dark; in light
 * it only bites a near-black accent).
 *
 * `ownGlow` also holds the light accent to 3:1 over the centres of the mock's variant B glow built from it.
 * The clamp asks for it as a stricter stand-in for the glow 跟随 Windows really shows (its alphas are
 * capped at the mock's), which contrast.test.ts measures.
 */
export function accentMeetsRules(theme: AccentTheme, hex: string, { margin = 0, ownGlow = false } = {}): boolean {
  const accent = parseHex(hex);
  const s = theme === "light" ? LIGHT : DARK;
  const mutedOnTint = contrast(s.muted, over({ ...accent, a: 0.14 }, s.solid));
  if (theme === "light") {
    const todays = Math.min(contrast(accent, LIGHT.solid), onGlass(accent, LIGHT.todayGlow));
    const own = ownGlow ? onGlass(accent, accentGlowCentres(accent)) : Infinity;
    // The selected-row tint bounds a near-black accent too; every preset clears it (contrast.test.ts).
    return Math.min(todays, own) >= GRAPHIC + margin && mutedOnTint >= TEXT + margin;
  }
  const ring = Math.min(contrast(KNOB_RING, accent), contrast(KNOB_RING, mix(accent, 0.9, WHITE)));
  return ring >= GRAPHIC + margin && mutedOnTint >= TEXT + margin;
}

// ---------------------------------------------------------------------------
// OKLab (Björn Ottosson), sRGB D65.

interface Oklab {
  l: number;
  a: number;
  b: number;
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklabOf(hex: string): Oklab {
  const { r, g, b } = parseHex(hex);
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function linearRgbOf({ l, a, b }: Oklab): [number, number, number] {
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

const inGamut = (lab: Oklab) => linearRgbOf(lab).every((c) => c >= -1e-6 && c <= 1 + 1e-6);

/**
 * `#rrggbb` for an OKLab colour. Where the hue cannot be shown at this chroma, the chroma is reduced
 * (the hue and lightness are kept) instead of clipping the channels, which would shift the hue.
 */
function hexOf(lab: Oklab): string {
  let scale = 1;
  if (!inGamut(lab)) {
    let [lo, hi] = [0, 1];
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (inGamut({ l: lab.l, a: lab.a * mid, b: lab.b * mid })) lo = mid;
      else hi = mid;
    }
    scale = lo;
  }
  const [r, g, b] = linearRgbOf({ l: lab.l, a: lab.a * scale, b: lab.b * scale }).map(fromLinear);
  return toHex(rgb(r, g, b));
}

/** OKLCH lightness (0–1), chroma and hue (degrees) of a `#rrggbb` colour. */
export function toOklch(hex: string): { l: number; c: number; h: number } {
  const { l, a, b } = oklabOf(hex);
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

// ---------------------------------------------------------------------------

const BLUE = ACCENT_PRESETS.find((preset) => preset.id === "blue") as AccentPair;

/**
 * A colour that meets the theme's rules, the light mock glow built from it included: `hex` itself when it does,
 * otherwise the nearest OKLab lightness that does, with the hue and chroma kept. Light accents are tried
 * darker first, dark ones lighter. Falls back to 蓝 in the unexpected case that no lightness passes.
 */
export function clampAccent(theme: AccentTheme, hex: string): string {
  const colour = hex.toLowerCase();
  if (accentMeetsRules(theme, colour, { ownGlow: true })) return colour;
  const lab = oklabOf(colour);
  const directions = theme === "light" ? [-1, 1] : [1, -1];
  for (let step = 1; step * STEP <= 1; step += 1) {
    for (const direction of directions) {
      const l = lab.l + direction * step * STEP;
      if (l < 0 || l > 1) continue;
      const candidate = hexOf({ ...lab, l });
      if (accentMeetsRules(theme, candidate, { margin: MARGIN, ownGlow: true })) return candidate;
    }
  }
  return BLUE[theme];
}

/**
 * Light and dark `--accent` for a choice. Presets use the spec table as is; 跟随 Windows clamps the Windows
 * pair, or uses 蓝 when the pair is missing or malformed.
 */
export function resolveAccent(choice: AccentId, windows: AccentPair | null): AccentPair {
  const preset = ACCENT_PRESETS.find((candidate) => candidate.id === choice) ?? BLUE;
  if (choice !== "system") return { light: preset.light, dark: preset.dark };
  if (!windows || !isHexColour(windows.light) || !isHexColour(windows.dark)) {
    return { light: BLUE.light, dark: BLUE.dark };
  }
  return { light: clampAccent("light", windows.light), dark: clampAccent("dark", windows.dark) };
}

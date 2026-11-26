// Spec §B 主题色 variant B: the blob alphas of the glow built from an accent. One pure search, used by
// appearance.ts for 跟随 Windows at runtime and by the tests that generate and verify the preset table in
// styles.css. No DOM, no storage.
import {
  contrast,
  isHexColour,
  mix,
  over,
  parseHex,
  resolveAccent,
  rgb,
  type AccentPair,
  type AccentTheme,
  type Rgba,
} from "./accent";

/** Blob 1 / 2 / 3 alphas in whole percent. */
export type GlowAlphas = [number, number, number];

/** The approved mock's alphas: the ceiling of the search. */
export const GLOW_ALPHA_CAPS: Record<AccentTheme, GlowAlphas> = { light: [45, 26, 30], dark: [50, 24, 28] };

const TEXT = 4.5;
const GRAPHIC = 3;

/**
 * Copies of the styles.css tokens the glow checks read (glow.test.ts measures them against the stylesheet,
 * so a drift fails there).
 */
export const GLOW_SURFACES: Record<AccentTheme, Record<string, Rgba>> = {
  light: {
    "--base": rgb(0xec, 0xee, 0xf3),
    "--ink": rgb(0x17, 0x19, 0x1d),
    "--ink-2": rgb(0x33, 0x37, 0x3e),
    "--muted": rgb(0x5a, 0x60, 0x6c),
    "--signal-ink": rgb(0xb2, 0x3f, 0x00),
    "--alert-ink": rgb(0xb4, 0x23, 0x18),
    "--alert-wash": rgb(180, 35, 24, 0.1),
    "--glass": rgb(255, 255, 255, 0.5),
    "--side": rgb(255, 255, 255, 0.38),
    "--chip": rgb(20, 30, 60, 0.06),
    "--glass-2": rgb(255, 255, 255, 0.55),
    "--on": rgb(255, 255, 255, 0.75),
    "--nk-fill": rgb(255, 255, 255, 0.92),
    "--nk-hover-fill": rgb(255, 255, 255, 0.42),
  },
  dark: {
    "--base": rgb(0x17, 0x17, 0x1a),
    "--ink": rgb(0xf1, 0xf3, 0xf7),
    "--ink-2": rgb(0xd5, 0xd9, 0xe0),
    "--muted": rgb(0x98, 0xa0, 0xad),
    "--signal-ink": rgb(0xff, 0x9e, 0x63),
    "--alert-ink": rgb(0xff, 0x8a, 0x80),
    "--alert-wash": rgb(255, 138, 128, 0.08),
    "--glass": rgb(40, 40, 46, 0.42),
    "--side": rgb(30, 30, 34, 0.55),
    "--chip": rgb(255, 255, 255, 0.07),
    "--glass-2": rgb(255, 255, 255, 0.06),
    "--on": rgb(255, 255, 255, 0.1),
    "--nk-fill": rgb(255, 255, 255, 0.1),
    "--nk-hover-fill": rgb(255, 255, 255, 0.05),
  },
};

/** Each blob's colour: the accent's share mixed into a fixed colour (blob 1 is the accent itself). */
const BLOBS: Record<AccentTheme, { share: number; mixWith: Rgba }[]> = {
  light: [
    { share: 1, mixWith: rgb(0, 0, 0) },
    { share: 0.4, mixWith: rgb(240, 120, 190) },
    { share: 0.65, mixWith: rgb(160, 130, 255) },
  ],
  dark: [
    { share: 1, mixWith: rgb(0, 0, 0) },
    { share: 0.4, mixWith: rgb(236, 92, 170) },
    { share: 0.65, mixWith: rgb(150, 110, 255) },
  ],
};

/**
 * One readability check over a glow centre: `fg` on the `layers` (bottom first) over the centre, at `min`
 * or more. Besides the token names, `fg` can be `accent` or `rim-on` (light --tg-rim-on, the accent 70%
 * mixed with --ink), and a layer can be `accent@<alpha>`. These are contrast.test.ts's checks that sit over
 * the glow: text and graphics straight on it (B), on the glass panel (G) and on the sidebar (S).
 */
interface Check {
  fg: string;
  layers: string[];
  min: number;
  theme?: AccentTheme;
}

const G = ["--glass"];
const S = ["--side"];

const CHECKS: Check[] = [
  // Straight on the glow, and on the keys and chips there.
  { fg: "--ink", layers: [], min: TEXT },
  { fg: "--ink-2", layers: [], min: TEXT },
  ...(["--chip", "--glass-2", "--on", "--nk-fill"] as const).flatMap((layer) =>
    ["--ink", "--ink-2"].map((fg) => ({ fg, layers: [layer], min: TEXT })),
  ),
  { fg: "--muted", layers: ["--chip"], min: GRAPHIC },
  { fg: "rim-on", layers: [], min: GRAPHIC, theme: "light" },
  // The glass panel.
  ...["--ink", "--ink-2", "--muted", "--signal-ink", "--alert-ink"].map((fg) => ({ fg, layers: G, min: TEXT })),
  ...["--ink", "--ink-2"].flatMap((fg) => ["--on", "--glass-2"].map((layer) => ({ fg, layers: [...G, layer], min: TEXT }))),
  { fg: "--ink-2", layers: [...G, "--chip"], min: TEXT },
  // --muted inside the sub-plates; the dark theme points it at --ink-2 there.
  { fg: "--muted", layers: [...G, "--glass-2"], min: TEXT, theme: "light" },
  { fg: "--alert-ink", layers: [...G, "--alert-wash"], min: TEXT },
  { fg: "--ink", layers: [...G, "accent@0.3"], min: TEXT },
  { fg: "--ink", layers: [...G, "accent@0.16"], min: TEXT },
  { fg: "--muted", layers: [...G, "--chip"], min: GRAPHIC },
  { fg: "accent", layers: G, min: GRAPHIC },
  { fg: "rim-on", layers: G, min: GRAPHIC, theme: "light" },
  // The sidebar and its nav keys.
  { fg: "--muted", layers: S, min: TEXT },
  { fg: "--ink", layers: [...S, "--nk-fill"], min: TEXT },
  { fg: "accent", layers: [...S, "--nk-fill"], min: GRAPHIC },
  { fg: "--ink-2", layers: [...S, "--nk-hover-fill"], min: TEXT },
  { fg: "--ink-2", layers: [...S, "--chip"], min: TEXT },
];

/** The centre colour of one blob of the glow built from `accent`, at `alpha` percent. */
export function glowCentre(theme: AccentTheme, accent: string, blob: number, alpha: number): Rgba {
  const { share, mixWith } = BLOBS[theme][blob];
  return { ...mix(parseHex(accent), share, mixWith), a: alpha / 100 };
}

/**
 * The checks that fail with this centre over --base as the backdrop, each with its ratio; empty when the
 * centre is readable.
 */
export function glowCentreFailures(theme: AccentTheme, accent: string, centre: Rgba): string[] {
  const tokens = GLOW_SURFACES[theme];
  const colour = parseHex(accent);
  const paintOf = (name: string): Rgba => {
    if (name === "accent") return colour;
    if (name === "rim-on") return mix(colour, 0.7, tokens["--ink"]);
    if (name.startsWith("accent@")) return { ...colour, a: Number(name.slice("accent@".length)) };
    return tokens[name];
  };
  const backdrop = over(centre, tokens["--base"]);
  return CHECKS.flatMap((check) => {
    if (check.theme && check.theme !== theme) return [];
    const bg = check.layers.reduce((under, layer) => over(paintOf(layer), under), backdrop);
    const ratio = contrast(paintOf(check.fg), bg);
    return ratio >= check.min ? [] : [`${check.fg} on ${["centre", ...check.layers].join(" + ")} = ${ratio.toFixed(2)}`];
  });
}

/**
 * The largest whole-percent alpha of each blob, up to the mock's, at which every check passes over that
 * blob's centre. Each blob is searched on its own, from the cap down; 0 (the bare base) if none passes.
 */
export function glowAlphas(theme: AccentTheme, accent: string): GlowAlphas {
  return GLOW_ALPHA_CAPS[theme].map((cap, blob) => {
    for (let alpha = cap; alpha > 0; alpha -= 1) {
      if (glowCentreFailures(theme, accent, glowCentre(theme, accent, blob, alpha)).length === 0) return alpha;
    }
    return 0;
  }) as GlowAlphas;
}

export type GlowAlphaPair = Record<AccentTheme, GlowAlphas>;

/**
 * 跟随 Windows: the alphas for the clamped Windows pair, or null when the pair cannot be read (the
 * stylesheet's conservative fallbacks then apply, with the 蓝 pair).
 */
export function windowsGlowAlphas(windows: AccentPair | null): GlowAlphaPair | null {
  if (!windows || !isHexColour(windows.light) || !isHexColour(windows.dark)) return null;
  const pair = resolveAccent("system", windows);
  return { light: glowAlphas("light", pair.light), dark: glowAlphas("dark", pair.dark) };
}

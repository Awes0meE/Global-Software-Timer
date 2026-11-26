import { describe, expect, it } from "vitest";
import { accentMeetsRules, clampAccent, resolveAccent, toOklch } from "../accent";
import { ACCENT_PRESETS } from "../appearancePresets";
import { contrast, glowCenters, over, parseColor, token, type Appearance, type Rgba, type Theme } from "./support/css";

// Spec §B: the clamp's rules, measured here from the stylesheet's own tokens so the module's copy of the
// surfaces cannot drift from styles.css. The spec measures every preset "as measured in the mock README":
// the light accent on the glass over the base and over each centre of today's --glow. `glowOf`, when given,
// is the appearance whose own --glow (spec §B variant B) the light accent is also measured over.
function measured(theme: Theme, hex: string, glowOf?: Appearance) {
  const colour = (name: string) => parseColor(token(theme, name));
  const accent = parseColor(hex);
  const base = colour("--base");
  const solid = colour("--glass-solid");
  const onGlassOver = (centres: Rgba[]) =>
    Math.min(...[base, ...centres.map((centre) => over(centre, base))].map((bg) => contrast(accent, over(colour("--glass"), bg))));
  return {
    onSolid: contrast(accent, solid),
    onGlass: onGlassOver(glowCenters(theme)),
    onOwnGlowGlass: glowOf ? onGlassOver(glowCenters("light", glowOf)) : undefined,
    ring: contrast(parseColor("rgba(0,0,0,.5)"), accent),
    mutedOnTint: contrast(colour("--muted"), over({ ...accent, a: 0.14 }, solid)),
  };
}

function expectRules(theme: Theme, hex: string, { ownGlow = false } = {}) {
  // 跟随 Windows's glow, built from this accent (a clamped one, so the clamp keeps it as it is).
  const glowOf: Appearance = { accent: "system", windowsAccent: { light: hex, dark: hex } };
  if (theme === "light" && ownGlow) expect(token("light", "--accent", glowOf), `${hex} is a clamped accent`).toBe(hex);
  const m = measured(theme, hex, theme === "light" && ownGlow ? glowOf : undefined);
  if (theme === "light") {
    expect(m.onSolid, `${hex} on glass-solid`).toBeGreaterThanOrEqual(3);
    expect(m.onGlass, `${hex} on the glass over today's glow`).toBeGreaterThanOrEqual(3);
    if (ownGlow) expect(m.onOwnGlowGlass, `${hex} on the glass over its own glow`).toBeGreaterThanOrEqual(3);
  } else {
    expect(m.ring, `knob ring over ${hex}`).toBeGreaterThanOrEqual(3);
  }
  expect(m.mutedOnTint, `${theme}: --muted on 14% ${hex}`).toBeGreaterThanOrEqual(4.5);
}

const HEX = /^#[0-9a-f]{6}$/;
const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

// Windows accents: the default blue's palette (AccentDark1 / AccentLight2), and accents from the Windows
// colour grid read through the AccentColor fallback, where both themes start from one base.
const WINDOWS: [name: string, light: string, dark: string][] = [
  ["default blue palette", "#0067c0", "#4cc2ff"],
  ["default blue base", "#0078d4", "#0078d4"],
  ["yellow", "#ffb900", "#ffb900"],
  ["teal", "#00b7c3", "#00b7c3"],
  ["orange", "#ff8c00", "#ff8c00"],
  ["red", "#e81123", "#e81123"],
  ["green", "#107c10", "#107c10"],
  ["purple", "#881798", "#881798"],
  ["near-white", "#f8f8f8", "#f8f8f8"],
  ["near-black", "#101010", "#101010"],
];

describe("accent presets", () => {
  it("lists the spec's choices in swatch order with the exact hex pairs", () => {
    expect(ACCENT_PRESETS.map((preset) => [preset.id, preset.name, preset.light, preset.dark])).toEqual([
      ["system", "跟随 Windows", "#2f7de1", "#5aa9ff"],
      ["blue", "蓝", "#2f7de1", "#5aa9ff"],
      ["cyan", "青", "#0e8a9e", "#3cc8dc"],
      ["green", "绿", "#048f54", "#4fd18b"],
      ["violet", "紫", "#7d5ce0", "#a78bfa"],
      ["rose", "玫红", "#d6336c", "#ff7aa2"],
      ["amber", "琥珀", "#ad6d15", "#f5b94a"],
      ["graphite", "石墨", "#5f6b7a", "#aab4c3"],
    ]);
  });

  it.each(ACCENT_PRESETS.map((preset) => [preset.id, preset] as const))("%s passes the rules as it is", (_id, preset) => {
    expectRules("light", preset.light);
    expectRules("dark", preset.dark);
    expect(accentMeetsRules("light", preset.light)).toBe(true);
    expect(accentMeetsRules("dark", preset.dark)).toBe(true);
    expect(clampAccent("dark", preset.dark)).toBe(preset.dark);
  });

  // Spec §B: readability is unchanged over the glow each choice shows (蓝: today's; 跟随 Windows unread: the
  // 蓝 pair on the 跟随 Windows glow), so the light accent stays at 3:1 on the glass over its own glow too.
  it.each(ACCENT_PRESETS.map((preset) => [preset.id, preset] as const))("%s keeps 3:1 on the light glass over its own glow", (id, preset) => {
    const own = measured("light", preset.light, { accent: id }).onOwnGlowGlass;
    expect(own, `${id} on the glass over its own glow`).toBeGreaterThanOrEqual(3);
  });
});

describe("resolveAccent", () => {
  it("uses the preset table for every preset, whatever Windows says", () => {
    for (const preset of ACCENT_PRESETS.filter((candidate) => candidate.id !== "system")) {
      expect(resolveAccent(preset.id, { light: "#ffb900", dark: "#ffb900" })).toEqual({ light: preset.light, dark: preset.dark });
      expect(resolveAccent(preset.id, null)).toEqual({ light: preset.light, dark: preset.dark });
    }
  });

  it("falls back to 蓝 for 跟随 Windows when the accent cannot be read or is malformed", () => {
    const blue = { light: "#2f7de1", dark: "#5aa9ff" };
    expect(resolveAccent("system", null)).toEqual(blue);
    expect(resolveAccent("system", { light: "blue", dark: "#4cc2ff" })).toEqual(blue);
    expect(resolveAccent("system", { light: "#0067c0" } as never)).toEqual(blue);
    expect(resolveAccent("system", "#0067c0" as never)).toEqual(blue);
  });

  it("keeps the Windows default blue's palette unchanged, lower-cased", () => {
    expect(resolveAccent("system", { light: "#0067C0", dark: "#4CC2FF" })).toEqual({ light: "#0067c0", dark: "#4cc2ff" });
  });

  it.each(WINDOWS)("clamps the Windows %s accent into the rules", (_name, light, dark) => {
    const pair = resolveAccent("system", { light, dark });
    expect(pair.light).toMatch(HEX);
    expect(pair.dark).toMatch(HEX);
    expectRules("light", pair.light, { ownGlow: true });
    expectRules("dark", pair.dark);
    // Idempotent: a clamped colour is a passing colour.
    expect(clampAccent("light", pair.light)).toBe(pair.light);
    expect(clampAccent("dark", pair.dark)).toBe(pair.dark);
  });
});

describe("clampAccent", () => {
  it.each([
    ["light", "#ffb900"],
    ["light", "#00b7c3"],
    ["light", "#ff8c00"],
    ["dark", "#0078d4"],
    ["dark", "#e81123"],
    ["dark", "#881798"],
  ] as const)("only moves the %s lightness of %s, keeping its hue", (theme, hex) => {
    expect(accentMeetsRules(theme, hex)).toBe(false);
    const clamped = clampAccent(theme, hex);
    const [before, after] = [toOklch(hex), toOklch(clamped)];
    expect(after.l, `${hex} -> ${clamped}`).not.toBeCloseTo(before.l, 2);
    expect(hueGap(after.h, before.h), `${hex} -> ${clamped} hue`).toBeLessThan(4);
    expectRules(theme, clamped, { ownGlow: true });
  });

  it("darkens a too-light light accent and lightens a too-dark dark accent", () => {
    for (const [theme, hex] of [["light", "#ffb900"], ["dark", "#0078d4"]] as const) {
      const clamped = clampAccent(theme, hex);
      const { l } = toOklch(clamped);
      expect(theme === "light" ? l < toOklch(hex).l : l > toOklch(hex).l).toBe(true);
    }
  });

  it("keeps a too-light dark accent from washing out the selected row", () => {
    // Windows AccentLight3 of the default blue: --muted on its 14% tint is only 4.38:1.
    expect(accentMeetsRules("dark", "#99ebff")).toBe(false);
    const clamped = clampAccent("dark", "#99ebff");
    expect(toOklch(clamped).l).toBeLessThan(toOklch("#99ebff").l);
    expectRules("dark", clamped);
  });

  it("turns a near-white or near-black accent into a passing grey", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const hex of ["#ffffff", "#f8f8f8", "#101010", "#000000"]) {
        const clamped = clampAccent(theme, hex);
        expect(clamped).toMatch(HEX);
        expect(toOklch(clamped).c).toBeLessThan(0.02);
        expectRules(theme, clamped, { ownGlow: true });
      }
    }
  });
});

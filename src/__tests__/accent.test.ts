import { describe, expect, it } from "vitest";
import { accentMeetsRules, clampAccent, resolveAccent, toOklch } from "../accent";
import { accentPresets } from "../appearancePresets";
import { contrast, glowCenters, over, parseColor, token, type Rgba, type Theme } from "./support/css";

// Spec §B: the clamp's rules, measured here from the stylesheet's own tokens so the module's copy of the
// surfaces cannot drift from styles.css. The spec measures every preset "as measured in the mock README":
// the light accent on the glass over the base and over each centre of today's --glow.
function measured(theme: Theme, hex: string) {
  const colour = (name: string) => parseColor(token(theme, name));
  const accent = parseColor(hex);
  const mix = (p: number, b: string) => parseColor(`color-mix(in srgb, ${hex} ${p * 100}%, ${b})`);
  // Spec §B variant B: the glow this accent builds.
  const ownGlow =
    theme === "light"
      ? [{ ...accent, a: 0.45 }, { ...mix(0.4, "rgb(240,120,190)"), a: 0.26 }, { ...mix(0.65, "rgb(160,130,255)"), a: 0.3 }]
      : [{ ...accent, a: 0.5 }, { ...mix(0.4, "rgb(236,92,170)"), a: 0.24 }, { ...mix(0.65, "rgb(150,110,255)"), a: 0.28 }];
  const base = colour("--base");
  const solid = colour("--glass-solid");
  const onGlassOver = (centres: Rgba[]) =>
    Math.min(...[base, ...centres.map((centre) => over(centre, base))].map((bg) => contrast(accent, over(colour("--glass"), bg))));
  return {
    onSolid: contrast(accent, solid),
    onGlass: onGlassOver(glowCenters(theme)),
    onOwnGlowGlass: onGlassOver(ownGlow),
    ring: contrast(parseColor("rgba(0,0,0,.5)"), accent),
    mutedOnTint: contrast(colour("--muted"), over({ ...accent, a: 0.14 }, solid)),
  };
}

function expectRules(theme: Theme, hex: string, { ownGlow = false } = {}) {
  const m = measured(theme, hex);
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
    expect(accentPresets.map((preset) => [preset.id, preset.name, preset.light, preset.dark])).toEqual([
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

  it.each(accentPresets.map((preset) => [preset.id, preset] as const))("%s passes the rules as it is", (_id, preset) => {
    expectRules("light", preset.light);
    expectRules("dark", preset.dark);
    expect(accentMeetsRules("light", preset.light)).toBe(true);
    expect(accentMeetsRules("dark", preset.dark)).toBe(true);
    expect(clampAccent("dark", preset.dark)).toBe(preset.dark);
  });

  // Recorded, not a rule the spec states: on the glass over the centre of the glow a light accent builds
  // itself (variant B), the spec's 青, 绿 and the 蓝 fallback of 跟随 Windows sit just under 3:1 (2.94 to
  // 2.97). The worst centre is blob 1, which lies above the window's top edge. Pinned so it cannot slide.
  it("pins the light presets on the glass over their own glow", () => {
    const own = Object.fromEntries(accentPresets.map((preset) => [preset.id, Number(measured("light", preset.light).onOwnGlowGlass.toFixed(2))]));
    expect(own).toEqual({ system: 2.96, blue: 2.96, cyan: 2.94, green: 2.97, violet: 3.34, rose: 3.17, amber: 3.06, graphite: 3.83 });
  });
});

describe("resolveAccent", () => {
  it("uses the preset table for every preset, whatever Windows says", () => {
    for (const preset of accentPresets.filter((candidate) => candidate.id !== "system")) {
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

import { describe, expect, it } from "vitest";
import {
  ACCENT_IDS,
  ACCENT_PRESETS,
  accentPreset,
  DEFAULT_ACCENT,
  DEFAULT_EINK,
  DEFAULT_START_PAGE,
  EINK_IDS,
  EINK_PALETTES,
  einkPalette,
  START_PAGE_IDS,
  START_PAGE_NAMES,
} from "../appearancePresets";

describe("appearance presets", () => {
  it("lists the eight accents in swatch order with the spec's names and colours", () => {
    expect(ACCENT_PRESETS.map((preset) => [preset.id, preset.name, preset.light, preset.dark])).toEqual([
      // 跟随 Windows falls back to 蓝 until (or when) the Windows accent cannot be read.
      ["system", "跟随 Windows", "#2f7de1", "#5aa9ff"],
      ["blue", "蓝", "#2f7de1", "#5aa9ff"],
      ["cyan", "青", "#0e8a9e", "#3cc8dc"],
      ["green", "绿", "#048f54", "#4fd18b"],
      ["violet", "紫", "#7d5ce0", "#a78bfa"],
      ["rose", "玫红", "#d6336c", "#ff7aa2"],
      ["amber", "琥珀", "#ad6d15", "#f5b94a"],
      ["graphite", "石墨", "#5f6b7a", "#aab4c3"],
    ]);
    expect(ACCENT_IDS).toEqual(ACCENT_PRESETS.map((preset) => preset.id));
    expect(DEFAULT_ACCENT).toBe("blue");
    expect(accentPreset("rose").name).toBe("玫红");
  });

  it("lists the five e-ink palettes in chip order", () => {
    expect(EINK_PALETTES.map((palette) => [palette.id, palette.name])).toEqual([
      ["aurora", "极光"],
      ["graphite", "石墨"],
      ["night", "夜蓝"],
      ["warm", "暖纸"],
      ["forest", "墨绿"],
    ]);
    expect(EINK_IDS).toEqual(EINK_PALETTES.map((palette) => palette.id));
    expect(DEFAULT_EINK).toBe("aurora");
    expect(einkPalette("warm").name).toBe("暖纸");
  });

  it("names the start pages as the sidebar does, without 设置 or 时间轴", () => {
    expect(START_PAGE_IDS).toEqual(["overview", "software", "background", "statistics", "achievements"]);
    expect(START_PAGE_IDS.map((id) => START_PAGE_NAMES[id])).toEqual(["概览", "软件", "后台", "统计", "成就"]);
    expect(DEFAULT_START_PAGE).toBe("overview");
  });
});

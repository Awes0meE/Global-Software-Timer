// v0.4.4 display presets: the ids stored in SQLite (`ui.accent`, `ui.eink`, `ui.start_page`) with
// their Chinese names. The Rust enums in commands.rs hold the same ids; keep both in step.

/** 主题色 ids in swatch order. */
export const ACCENT_IDS = ["system", "blue", "cyan", "green", "violet", "rose", "amber", "graphite"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
export const DEFAULT_ACCENT: AccentId = "blue";

export interface AccentPreset {
  id: AccentId;
  name: string;
  /** `--accent` in the light theme. */
  light: string;
  /** `--accent` in the dark theme. */
  dark: string;
}

const BLUE_LIGHT = "#2f7de1";
const BLUE_DARK = "#5aa9ff";

/** In swatch order. `system` carries the 蓝 values: its fallback when the Windows accent cannot be read. */
export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: "system", name: "跟随 Windows", light: BLUE_LIGHT, dark: BLUE_DARK },
  { id: "blue", name: "蓝", light: BLUE_LIGHT, dark: BLUE_DARK },
  { id: "cyan", name: "青", light: "#0e8a9e", dark: "#3cc8dc" },
  { id: "green", name: "绿", light: "#048f54", dark: "#4fd18b" },
  { id: "violet", name: "紫", light: "#7d5ce0", dark: "#a78bfa" },
  { id: "rose", name: "玫红", light: "#d6336c", dark: "#ff7aa2" },
  { id: "amber", name: "琥珀", light: "#ad6d15", dark: "#f5b94a" },
  { id: "graphite", name: "石墨", light: "#5f6b7a", dark: "#aab4c3" },
];

export function accentPreset(id: AccentId): AccentPreset {
  return ACCENT_PRESETS.find((preset) => preset.id === id) ?? ACCENT_PRESETS[1];
}

/** 墨水屏配色 ids in chip order. `aurora` is the v0.4.3 look. */
export const EINK_IDS = ["aurora", "graphite", "night", "warm", "forest"] as const;
export type EinkId = (typeof EINK_IDS)[number];
export const DEFAULT_EINK: EinkId = "aurora";

export interface EinkPalette {
  id: EinkId;
  name: string;
}

/** In chip order. The colours themselves are the `--eink-*` tokens in styles.css. */
export const EINK_PALETTES: readonly EinkPalette[] = [
  { id: "aurora", name: "极光" },
  { id: "graphite", name: "石墨" },
  { id: "night", name: "夜蓝" },
  { id: "warm", name: "暖纸" },
  { id: "forest", name: "墨绿" },
];

export function einkPalette(id: EinkId): EinkPalette {
  return EINK_PALETTES.find((palette) => palette.id === id) ?? EINK_PALETTES[0];
}

/**
 * 启动时打开 ids in sidebar order. 设置 is never a start page; 时间轴 joins when it becomes available.
 * The 设置 control lists the ones whose sidebar entry is available.
 */
export const START_PAGE_IDS = ["overview", "software", "background", "statistics", "achievements"] as const;
export type StartPage = (typeof START_PAGE_IDS)[number];
export const DEFAULT_START_PAGE: StartPage = "overview";

export const START_PAGE_NAMES: Record<StartPage, string> = {
  overview: "概览",
  software: "软件",
  background: "后台",
  statistics: "统计",
  achievements: "成就",
};

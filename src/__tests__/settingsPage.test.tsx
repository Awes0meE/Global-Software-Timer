import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: () => Promise.resolve(() => {}) }),
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: vi.fn(async () => {}),
  enable: vi.fn(async () => {}),
  isEnabled: vi.fn(async () => true),
}));
// 当日分布 is replaced by a probe of the week start App provides (spec §D).
vi.mock("../components/TodayMix", async () => {
  const { useWeekStart } = await import("../weekStart");
  return { TodayMix: () => <span data-testid="week-start">{useWeekStart()}</span> };
});

import App from "../App";
import { resolveAccent } from "../accent";
import { paintInitialAppearance } from "../appearance";
import { ACCENT_PRESETS, EINK_IDS, EINK_PALETTES, START_PAGE_IDS, type EinkId } from "../appearancePresets";
import { formatFileSize } from "../components/RestoreDialog";
import { parseRules, themeTokens, type Theme } from "./support/css";
import styles from "../styles.css?raw";

const TODAY = "2026-11-24";
type Handler = (args: Record<string, unknown> | undefined) => unknown;

let settings: Record<string, unknown>;
let overrides: Record<string, Handler>;

const preview = {
  restore_id: "restore-1",
  file_name: "GST-数据备份-2026-11-20.db",
  first_day: "2026-05-28",
  last_day: "2026-11-20",
  software_count: 142,
  file_size_bytes: 196 * 1024 * 1024,
};

const defaults: Record<string, Handler> = {
  get_app_settings: () => settings,
  get_calendar_summary: () => ({ today: TODAY, data_start_date: "2026-09-03" }),
  get_transparency_effects_enabled: () => true,
  get_windows_accent: () => ({ light: "#0067c0", dark: "#4cc2ff" }),
  get_restore_status: () => "none",
  get_dashboard_summary: () => ({
    last_scan_succeeded: true,
    product_title: "全局软件计时器",
    locale: "zh-CN",
    usage_date: TODAY,
    is_today: true,
    most_used: null,
    recorded_today_seconds: 0,
    active_today_seconds: 0,
    apps: [],
  }),
  get_background_page_summary: () => ({ logical_cores: 8, running_count: 0, rows: [], usage_date: TODAY, is_today: true }),
  get_software_page_summary: () => ({ focused: [], hidden: [], discovered: [] }),
  set_ui_preference: (args) => {
    settings = { ...settings, [String(args?.key)]: args?.value, [`${String(args?.key)}_configured`]: true };
    return undefined;
  },
  pick_restore_backup: () => preview,
  apply_restore: () => undefined,
  discard_restore: () => undefined,
  open_data_folder: () => undefined,
};

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 24, 22, 1), toFake: ["Date"] });
  settings = {
    close_behavior: "minimize_to_tray",
    close_behavior_configured: true,
    autostart_enabled: true,
    autostart_configured: true,
    duration_format: "decimal_hours",
    duration_format_configured: true,
    theme: "light",
    theme_configured: true,
  };
  overrides = {};
  mockInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    const handler = overrides[command] ?? defaults[command];
    return handler ? handler(args) : undefined;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mockInvoke.mockReset();
  window.localStorage.clear();
  paintInitialAppearance();
});

const calls = (command: string) => mockInvoke.mock.calls.filter(([name]) => name === command);
const uiSaves = () => calls("set_ui_preference").map(([, args]) => args);
const root = () => document.documentElement;

async function openSettings() {
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "设置" }));
  // Settings have loaded once the 主题色 swatches are enabled.
  await waitFor(() => expect(screen.getByRole("radio", { name: "蓝" })).toBeEnabled());
}

function group(title: string) {
  return screen.getByRole("heading", { name: title, level: 3 }).closest("section") as HTMLElement;
}

function rowOf(title: string) {
  return screen.getByText(title, { selector: "strong" }).closest(".settings-row") as HTMLElement;
}

describe("设置 layout (spec §A)", () => {
  it("orders the groups and rows, with each new row's one-line description", async () => {
    await openSettings();
    const main = document.getElementById("settings-content") as HTMLElement;
    const groups = Array.from(main.querySelectorAll("section.settings-group")).map((section) => ({
      title: section.querySelector("h3")?.textContent,
      rows: Array.from(section.querySelectorAll(".settings-row-copy strong")).map((strong) => strong.textContent),
    }));
    expect(groups).toEqual([
      { title: "运行", rows: ["开机自启动", "关闭窗口时最小化到后台", "启动时打开"] },
      { title: "显示", rows: ["显示分钟数", "每周起始日", "文字大小", "减少动画"] },
      { title: "外观", rows: ["主题", "主题色", "墨水屏配色"] },
      { title: "数据", rows: ["数据文件夹", "从备份恢复"] },
      { title: "隐私", rows: [] },
    ]);

    const descriptions: Record<string, string> = {
      启动时打开: "启动 GST 后先显示的页面",
      每周起始日: "日历、热力图和“本周”从哪天开始",
      文字大小: "放大界面里的文字和图标",
      减少动画: "关闭开关滑动、弹窗和指示灯呼吸等动效",
      主题: "默认跟随 Windows 的浅色或深色模式",
      主题色: "开关、选中项、导航图标和背景光晕的颜色",
      墨水屏配色: "读数屏和日历弹窗的纸色与墨色",
      数据文件夹: "数据库和恢复前的自动备份都在这里",
      从备份恢复: "用一份完整备份替换当前数据，完成后自动重启",
    };
    for (const [title, description] of Object.entries(descriptions)) {
      expect(rowOf(title).querySelector(".settings-row-copy span")?.textContent, title).toBe(description);
    }

    const options = (name: string) =>
      within(screen.getByRole("radiogroup", { name })).getAllByRole("radio").map((radio) => radio.textContent);
    expect(options("启动时打开")).toEqual(["概览", "软件", "后台", "统计", "成就"]);
    expect(options("每周起始日")).toEqual(["周一", "周日"]);
    expect(options("文字大小")).toEqual(["标准", "大"]);
    expect(options("主题")).toEqual(["跟随系统", "浅色", "深色"]);
    expect(within(rowOf("数据文件夹")).getByRole("button", { name: "打开" })).toBeEnabled();
    expect(within(rowOf("从备份恢复")).getByRole("button", { name: "选择备份…" })).toBeEnabled();
    // No 玻璃透明度 row (spec: dropped).
    expect(screen.queryByText("玻璃透明度")).toBeNull();
  });

  it("keeps the new controls disabled until settings load", async () => {
    let release!: () => void;
    overrides.get_app_settings = () => new Promise((resolve) => (release = () => resolve(settings)));
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "设置" }));

    const radios = [
      ...within(screen.getByRole("radiogroup", { name: "主题色" })).getAllByRole("radio"),
      ...within(screen.getByRole("radiogroup", { name: "墨水屏配色" })).getAllByRole("radio"),
      ...within(screen.getByRole("radiogroup", { name: "启动时打开" })).getAllByRole("radio"),
      ...within(screen.getByRole("radiogroup", { name: "每周起始日" })).getAllByRole("radio"),
      ...within(screen.getByRole("radiogroup", { name: "文字大小" })).getAllByRole("radio"),
    ];
    for (const radio of radios) expect(radio).toBeDisabled();
    expect(screen.getByRole("switch", { name: "减少动画" })).toBeDisabled();

    await act(async () => release());
    for (const radio of radios) expect(radio).toBeEnabled();
    expect(screen.getByRole("switch", { name: "减少动画" })).toBeEnabled();
  });

  // One keyboard model for every radio group on the page: Tab reaches the chosen option, the arrow keys,
  // Home and End move to another one and choose it.
  it("moves and selects 启动时打开, 每周起始日, 文字大小 and 主题 with the arrow keys, Home and End", async () => {
    await openSettings();
    const radios = (name: string) => within(screen.getByRole("radiogroup", { name })).getAllByRole("radio");
    expect(radios("启动时打开").map((radio) => radio.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    expect(radios("每周起始日").map((radio) => radio.tabIndex)).toEqual([0, -1]);
    expect(radios("文字大小").map((radio) => radio.tabIndex)).toEqual([0, -1]);
    expect(radios("主题").map((radio) => radio.tabIndex)).toEqual([-1, 0, -1]);

    const start = radios("启动时打开");
    start[0].focus();
    fireEvent.keyDown(start[0], { key: "ArrowRight" });
    expect(start[1]).toHaveFocus();
    expect(start[1]).toHaveAttribute("aria-checked", "true");
    expect(start[1].tabIndex).toBe(0);
    fireEvent.keyDown(start[1], { key: "End" });
    expect(start[4]).toHaveFocus();
    fireEvent.keyDown(start[4], { key: "ArrowDown" });
    expect(start[0]).toHaveFocus();
    fireEvent.keyDown(start[0], { key: "Home" });
    await waitFor(() => expect(uiSaves().map((save) => save?.value)).toEqual(["software", "achievements", "overview"]));

    const week = radios("每周起始日");
    week[0].focus();
    fireEvent.keyDown(week[0], { key: "ArrowLeft" });
    expect(week[1]).toHaveFocus();
    await waitFor(() => expect(uiSaves().slice(-1)[0]).toEqual({ key: "week_start", value: "sunday" }));

    const size = radios("文字大小");
    size[0].focus();
    fireEvent.keyDown(size[0], { key: "End" });
    expect(size[1]).toHaveFocus();
    expect(size[1]).toHaveAttribute("aria-checked", "true");
    expect(size[1].tabIndex).toBe(0);
    await waitFor(() => expect(uiSaves().slice(-1)[0]).toEqual({ key: "text_size", value: "large" }));
    fireEvent.keyDown(size[1], { key: "ArrowRight" });
    expect(size[0]).toHaveFocus();
    await waitFor(() => expect(uiSaves().slice(-1)[0]).toEqual({ key: "text_size", value: "standard" }));

    const theme = radios("主题");
    theme[1].focus();
    fireEvent.keyDown(theme[1], { key: "ArrowUp" });
    expect(theme[0]).toHaveFocus();
    expect(theme[0]).toHaveAttribute("aria-checked", "true");
  });
});

describe("主题色 swatches (spec §A, §B)", () => {
  it("names the eight swatches in order and shows the stored choice", async () => {
    settings.accent = "violet";
    settings.accent_configured = true;
    await openSettings();

    const swatches = within(screen.getByRole("radiogroup", { name: "主题色" })).getAllByRole("radio");
    expect(swatches.map((swatch) => swatch.getAttribute("aria-label"))).toEqual(ACCENT_PRESETS.map((preset) => preset.name));
    expect(swatches.map((swatch) => swatch.getAttribute("title"))).toEqual(ACCENT_PRESETS.map((preset) => preset.name));
    expect(swatches.filter((swatch) => swatch.getAttribute("aria-checked") === "true")).toEqual([
      screen.getByRole("radio", { name: "紫" }),
    ]);
    // Roving tabindex: only the chosen swatch is a Tab stop.
    expect(swatches.map((swatch) => swatch.tabIndex)).toEqual(ACCENT_PRESETS.map((preset) => (preset.id === "violet" ? 0 : -1)));
    expect(within(rowOf("主题色")).getByText("紫")).toHaveClass("settings-status");
    expect(screen.getByRole("radio", { name: "紫" })).toHaveClass("is-selected");
    expect(root().dataset.accent).toBe("violet");
    expect(root().style.getPropertyValue("--user-accent-light")).toBe("#7d5ce0");
  });

  it("moves and selects with the arrow keys, Home and End", async () => {
    await openSettings();
    const blue = screen.getByRole("radio", { name: "蓝" });
    blue.focus();

    fireEvent.keyDown(blue, { key: "ArrowRight" });
    const cyan = screen.getByRole("radio", { name: "青" });
    expect(cyan).toHaveFocus();
    expect(cyan).toHaveAttribute("aria-checked", "true");
    expect(cyan.tabIndex).toBe(0);
    fireEvent.keyDown(cyan, { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: "绿" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
    expect(cyan).toHaveFocus();
    fireEvent.keyDown(cyan, { key: "End" });
    expect(within(screen.getByRole("radiogroup", { name: "主题色" })).getByRole("radio", { name: "石墨" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "跟随 Windows" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
    expect(within(screen.getByRole("radiogroup", { name: "主题色" })).getByRole("radio", { name: "石墨" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
    expect(screen.getByRole("radio", { name: "跟随 Windows" })).toHaveAttribute("aria-checked", "true");

    await waitFor(() => expect(uiSaves().slice(-1)[0]).toEqual({ key: "accent", value: "system" }));
    expect(uiSaves().map((save) => save?.value)).toEqual(["cyan", "green", "cyan", "graphite", "system", "graphite", "system"]);
    expect(within(rowOf("主题色")).getByText("跟随 Windows")).toHaveClass("settings-status");
  });

  it("fills 跟随 Windows with the resolved Windows accent while another accent is chosen", async () => {
    const pair = resolveAccent("system", { light: "#0067c0", dark: "#4cc2ff" });
    await openSettings();
    const windows = screen.getByRole("radio", { name: "跟随 Windows" });
    // One read-only read for the swatch (§A); painting 蓝 ignores the pair (§B).
    await waitFor(() => expect(windows.style.getPropertyValue("--swatch-light")).toBe(pair.light));
    expect(windows.style.getPropertyValue("--swatch-dark")).toBe(pair.dark);
    expect(calls("get_windows_accent")).toHaveLength(1);
    expect(windows.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("radio", { name: "玫红" }).style.getPropertyValue("--swatch-light")).toBe("#d6336c");
    expect(root().dataset.accent).toBeUndefined();
    expect(root().style.getPropertyValue("--user-accent-light")).toBe("");

    await userEvent.click(windows);

    await waitFor(() => expect(root().dataset.accent).toBe("system"));
    expect(root().style.getPropertyValue("--user-accent-light")).toBe(pair.light);
  });

  it("fills 跟随 Windows with 蓝 when the Windows accent cannot be read", async () => {
    overrides.get_windows_accent = () => null;
    await openSettings();
    const windows = screen.getByRole("radio", { name: "跟随 Windows" });
    await waitFor(() => expect(calls("get_windows_accent")).toHaveLength(1));
    expect(windows.style.getPropertyValue("--swatch-light")).toBe("#2f7de1");
    expect(windows.style.getPropertyValue("--swatch-dark")).toBe("#5aa9ff");
  });

  it("rolls the choice back with 主题色保存失败 when the save fails", async () => {
    overrides.set_ui_preference = () => Promise.reject(new Error("locked"));
    await openSettings();

    await userEvent.click(screen.getByRole("radio", { name: "绿" }));

    expect(await screen.findByText("主题色保存失败")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "蓝" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "绿" })).toHaveAttribute("aria-checked", "false");
    expect(root().dataset.accent).toBeUndefined();
  });

  it("keeps the latest choice when an earlier save fails", async () => {
    let failFirst!: () => void;
    overrides.set_ui_preference = (args) =>
      args?.value === "green" ? new Promise((_, reject) => (failFirst = () => reject(new Error("locked")))) : undefined;
    await openSettings();

    await userEvent.click(screen.getByRole("radio", { name: "绿" }));
    await userEvent.click(screen.getByRole("radio", { name: "紫" }));
    await act(async () => failFirst());

    await waitFor(() => expect(uiSaves().map((save) => save?.value)).toEqual(["green", "violet"]));
    expect(screen.getByRole("radio", { name: "紫" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("主题色保存失败")).toBeNull();
  });
});

describe("墨水屏配色 chips (spec §A, §C)", () => {
  it("paints five chips by palette and saves the chosen one", async () => {
    await openSettings();
    const chips = within(screen.getByRole("radiogroup", { name: "墨水屏配色" })).getAllByRole("radio");
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual(EINK_PALETTES.map((palette) => palette.name));
    expect(chips.map((chip) => chip.getAttribute("title"))).toEqual(EINK_PALETTES.map((palette) => palette.name));
    expect(chips.map((chip) => chip.dataset.einkChip)).toEqual([...EINK_IDS]);
    expect(chips.map((chip) => chip.textContent)).toEqual(["8", "8", "8", "8", "8"]);
    expect(within(rowOf("墨水屏配色")).getByText("极光")).toHaveClass("settings-status");

    await userEvent.click(screen.getByRole("radio", { name: "夜蓝" }));

    expect(screen.getByRole("radio", { name: "夜蓝" })).toHaveAttribute("aria-checked", "true");
    expect(within(rowOf("墨水屏配色")).getByText("夜蓝")).toHaveClass("settings-status");
    expect(root().dataset.eink).toBe("night");
    await waitFor(() => expect(uiSaves()).toEqual([{ key: "eink", value: "night" }]));

    const night = screen.getByRole("radio", { name: "夜蓝" });
    fireEvent.keyDown(night, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "暖纸" })).toHaveFocus();
    expect(root().dataset.eink).toBe("warm");
  });

  it("rolls the palette back with 墨水屏配色保存失败 when the save fails", async () => {
    overrides.set_ui_preference = () => Promise.reject(new Error("locked"));
    await openSettings();

    await userEvent.click(screen.getByRole("radio", { name: "墨绿" }));

    expect(await screen.findByText("墨水屏配色保存失败")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "极光" })).toHaveAttribute("aria-checked", "true");
    expect(root().dataset.eink).toBeUndefined();
  });

  // 外观 sits below the fold at 1440×900: the message at the top of the page is announced and brought into view.
  it("announces a failed save and scrolls its message into view", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    try {
      overrides.set_ui_preference = () => Promise.reject(new Error("locked"));
      await openSettings();

      await userEvent.click(screen.getByRole("radio", { name: "墨绿" }));

      const message = await screen.findByText("墨水屏配色保存失败");
      expect(message).toHaveAttribute("role", "alert");
      expect(scrolled.mock.contexts).toContain(message);
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it("dims the swatches and chips until settings load, as a toggle", () => {
    const rules = parseRules(styles).rules.filter((rule) => rule.atRules.length === 0);
    const look = (selector: string) => rules.find((rule) => rule.selectors.includes(selector))?.declarations;
    expect(look(":is(.swatch, .lcd-chip):disabled")).toMatchObject({ opacity: look(".toggle:disabled")?.opacity });
  });

  // Forced colours: the chosen swatch or chip is ringed in Highlight like every other chosen option, and
  // focus is a second Highlight ring outside it, so a focused choice still differs from an unfocused one.
  it("rings the chosen swatch or chip in Highlight and focus outside it in forced colours", () => {
    const forced = parseRules(styles).rules.filter((rule) => rule.atRules.join(" ") === "@media (forced-colors: active)");
    const look = (selector: string) =>
      Object.assign({}, ...forced.filter((rule) => rule.selectors.includes(selector)).map((rule) => rule.declarations));
    expect(look(":is(.swatch, .lcd-chip).is-selected")).toMatchObject({ "outline-color": "Highlight" });
    expect(look(":is(.swatch, .lcd-chip):focus-visible")).toMatchObject({ outline: "none" });
    expect(look(":is(.swatch, .lcd-chip).is-selected:focus-visible")).toMatchObject({
      outline: "2px solid Highlight",
      "outline-offset": "2px",
    });
    for (const [kind, rim] of [
      ["swatch", "var(--swatch-rim)"],
      ["lcd-chip", "var(--edge-strong)"],
    ]) {
      for (const selector of [`.${kind}:focus-visible`, `.${kind}.is-selected:focus-visible`]) {
        expect(look(selector)["box-shadow"], selector).toBe(`inset 0 0 0 1px ${rim}, 0 0 0 6px Canvas, 0 0 0 8px Highlight`);
      }
    }
  });

  // The chips paint with the palette tokens themselves, per theme, so they cannot drift from §C.
  it("gives every chip its palette's paper and ink in both themes", () => {
    const rules = parseRules(styles).rules;
    const scope: Record<Theme, string> = { light: ':root:not([data-theme="dark"])', dark: ':root[data-theme="dark"]' };
    for (const theme of ["light", "dark"] as Theme[]) {
      for (const palette of EINK_IDS as readonly EinkId[]) {
        const selector = `${scope[theme]} [data-eink-chip="${palette}"]`;
        const rule = rules.find((candidate) => candidate.atRules.length === 0 && candidate.selectors.includes(selector));
        const tokens = themeTokens(theme, { eink: palette });
        expect(rule?.declarations, selector).toEqual({
          "--eink-paper": tokens["--eink-paper"],
          "--eink-ink": tokens["--eink-ink"],
        });
      }
    }
  });
});

describe("每周起始日 and 减少动画 (spec §D, §F)", () => {
  it("saves 周日 and provides the week start from the setting", async () => {
    settings.week_start = "sunday";
    settings.week_start_configured = true;
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("week-start")).toHaveTextContent("0"));

    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    const monday = screen.getByRole("radio", { name: "周一" });
    await waitFor(() => expect(monday).toBeEnabled());
    expect(screen.getByRole("radio", { name: "周日" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(monday);

    await waitFor(() => expect(uiSaves()).toEqual([{ key: "week_start", value: "monday" }]));
    await userEvent.click(screen.getByRole("button", { name: "概览" }));
    expect(screen.getByTestId("week-start")).toHaveTextContent("1");
  });

  it("rolls 每周起始日 back with 每周起始日保存失败", async () => {
    overrides.set_ui_preference = () => Promise.reject(new Error("locked"));
    await openSettings();

    await userEvent.click(screen.getByRole("radio", { name: "周日" }));

    expect(await screen.findByText("每周起始日保存失败")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "周一" })).toHaveAttribute("aria-checked", "true");
  });

  it("turns 减少动画 on as reduce and marks the root", async () => {
    await openSettings();
    const motion = screen.getByRole("switch", { name: "减少动画" });
    expect(motion).toHaveAttribute("aria-checked", "false");
    expect(within(rowOf("减少动画")).getByText("已关闭")).toBeInTheDocument();

    await userEvent.click(motion);

    expect(motion).toHaveAttribute("aria-checked", "true");
    expect(within(rowOf("减少动画")).getByText("已开启")).toBeInTheDocument();
    expect(root().dataset.motion).toBe("reduced");
    await waitFor(() => expect(uiSaves()).toEqual([{ key: "reduce_motion", value: "reduce" }]));

    await userEvent.click(motion);
    expect(root().dataset.motion).toBeUndefined();
    await waitFor(() => expect(uiSaves().slice(-1)[0]).toEqual({ key: "reduce_motion", value: "system" }));
  });

  it("rolls 减少动画 back with 减少动画保存失败", async () => {
    overrides.set_ui_preference = () => Promise.reject(new Error("locked"));
    await openSettings();

    await userEvent.click(screen.getByRole("switch", { name: "减少动画" }));

    expect(await screen.findByText("减少动画保存失败")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "减少动画" })).toHaveAttribute("aria-checked", "false");
    expect(root().dataset.motion).toBeUndefined();
  });
});

describe("文字大小", () => {
  it("shows the stored size and saves 大 through set_ui_preference", async () => {
    await openSettings();
    const standard = screen.getByRole("radio", { name: "标准" });
    expect(standard).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("radio", { name: "大" }));

    expect(screen.getByRole("radio", { name: "大" })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(uiSaves()).toEqual([{ key: "text_size", value: "large" }]));
  });

  it("opens on 大 when it is stored", async () => {
    settings.text_size = "large";
    settings.text_size_configured = true;
    await openSettings();

    expect(screen.getByRole("radio", { name: "大" })).toHaveAttribute("aria-checked", "true");
  });

  it("rolls 文字大小 back with 文字大小保存失败", async () => {
    overrides.set_ui_preference = () => Promise.reject(new Error("locked"));
    await openSettings();

    await userEvent.click(screen.getByRole("radio", { name: "大" }));

    expect(await screen.findByText("文字大小保存失败")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "标准" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("启动时打开 (spec §E)", () => {
  it("opens the cached start page on the first render", async () => {
    window.localStorage.setItem("gst.startPage", "background");
    overrides.get_app_settings = () => new Promise(() => {});
    render(<App />);

    expect(screen.getByRole("heading", { name: "后台", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "后台" })).toHaveAttribute("aria-current", "page");
  });

  it("switches once to the stored page when it differs from the cache", async () => {
    settings.start_page = "background";
    settings.start_page_configured = true;
    render(<App />);

    expect(await screen.findByRole("heading", { name: "后台", level: 2 })).toBeInTheDocument();
    expect(window.localStorage.getItem("gst.startPage")).toBe("background");
  });

  it("does not move a user who has already navigated", async () => {
    let release!: () => void;
    settings.start_page = "background";
    overrides.get_app_settings = () => new Promise((resolve) => (release = () => resolve(settings)));
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "设置" }));
    await act(async () => release());

    await waitFor(() => expect(window.localStorage.getItem("gst.startPage")).toBe("background"));
    expect(screen.getByRole("heading", { name: "设置", level: 2 })).toBeInTheDocument();
  });

  it("saves and caches a new start page without leaving 设置", async () => {
    await openSettings();
    const group = screen.getByRole("radiogroup", { name: "启动时打开" });
    expect(within(group).getByRole("radio", { name: "概览" })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(within(group).getByRole("radio", { name: "统计" }));

    await waitFor(() => expect(uiSaves()).toEqual([{ key: "start_page", value: "statistics" }]));
    expect(within(group).getByRole("radio", { name: "统计" })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("gst.startPage")).toBe("statistics");
    expect(screen.getByRole("heading", { name: "设置", level: 2 })).toBeInTheDocument();
  });

  it("rolls the start page back with 启动时打开保存失败", async () => {
    overrides.set_ui_preference = () => Promise.reject(new Error("locked"));
    await openSettings();
    const group = screen.getByRole("radiogroup", { name: "启动时打开" });

    await userEvent.click(within(group).getByRole("radio", { name: "成就" }));

    expect(await screen.findByText("启动时打开保存失败")).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "概览" })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("gst.startPage")).toBe("overview");
  });

  it("offers exactly the start page ids", async () => {
    await openSettings();
    const labels = within(screen.getByRole("radiogroup", { name: "启动时打开" }))
      .getAllByRole("radio")
      .map((radio) => radio.textContent);
    expect(labels).toHaveLength(START_PAGE_IDS.length);
  });
});

describe("settings import (spec §I)", () => {
  it("applies all six imported preferences without navigating", async () => {
    overrides.pick_settings_import = () => ({
      import_id: "import-1",
      changes: [{ key: "accent", from: "blue", to: "rose" }],
      focused_added: 0,
      hidden_added: 0,
      unmatched: 0,
      conflicts: 0,
    });
    overrides.apply_settings_import = () => {
      settings = {
        ...settings,
        accent: "rose",
        eink: "forest",
        week_start: "sunday",
        start_page: "achievements",
        reduce_motion: "reduce",
        text_size: "large",
      };
      return { focused_added: 0, hidden_added: 0, unmatched: 0, conflicts: 0 };
    };
    await openSettings();

    await userEvent.click(screen.getByRole("button", { name: "迁移与备份" }));
    await userEvent.click(within(screen.getByRole("menu", { name: "迁移与备份" })).getByRole("menuitem", { name: /导入设置/ }));
    const dialog = await screen.findByRole("dialog", { name: "导入设置" });
    await userEvent.click(within(dialog).getByRole("button", { name: "导入" }));

    await waitFor(() => expect(screen.getByRole("radio", { name: "玫红" })).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByRole("radio", { name: "墨绿" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "周日" })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByRole("radiogroup", { name: "启动时打开" })).getByRole("radio", { name: "成就" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: "减少动画" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "大" })).toHaveAttribute("aria-checked", "true");
    expect(root().dataset.accent).toBe("rose");
    expect(root().dataset.eink).toBe("forest");
    expect(root().dataset.motion).toBe("reduced");
    expect(window.localStorage.getItem("gst.startPage")).toBe("achievements");
    expect(screen.getByRole("heading", { name: "设置", level: 2 })).toBeInTheDocument();
    expect(uiSaves()).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "概览" }));
    expect(screen.getByTestId("week-start")).toHaveTextContent("0");
  });
});

describe("数据 (spec §G, §H)", () => {
  it("opens the data folder, and says so when it cannot", async () => {
    await openSettings();
    await userEvent.click(screen.getByRole("button", { name: "打开" }));
    expect(calls("open_data_folder")).toHaveLength(1);
    expect(screen.queryByText("无法打开数据文件夹")).toBeNull();

    overrides.open_data_folder = () => Promise.reject("data_folder_open_failed");
    await userEvent.click(screen.getByRole("button", { name: "打开" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("无法打开数据文件夹");
  });

  it("previews the picked backup and cancels with a discard", async () => {
    await openSettings();
    const key = screen.getByRole("button", { name: "选择备份…" });
    await userEvent.click(key);

    const dialog = await screen.findByRole("dialog", { name: "从备份恢复" });
    const facts = Array.from(dialog.querySelectorAll(".import-fact")).map((fact) => [
      fact.querySelector("dt")?.textContent,
      fact.querySelector("dd")?.textContent,
    ]);
    expect(facts).toEqual([
      ["备份文件", "GST-数据备份-2026-11-20.db"],
      ["记录范围", "2026-05-28 至 2026-11-20"],
      ["软件", "142 个"],
      ["文件大小", "196 MB"],
    ]);
    expect(Array.from(dialog.querySelectorAll("p")).map((p) => p.textContent)).toEqual([
      "当前数据会被这份备份替换，备份日期之后的记录将不再保留。",
      "替换前，当前数据会自动另存到数据文件夹的 backups 里。",
    ]);
    expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual(["取消", "恢复并重启"]);
    expect(within(dialog).getByRole("button", { name: "恢复并重启" })).toHaveClass("button-primary");
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();
    // The warning is read with the dialog, not the facts.
    expect(dialog).toHaveAccessibleDescription(
      "当前数据会被这份备份替换，备份日期之后的记录将不再保留。 替换前，当前数据会自动另存到数据文件夹的 backups 里。",
    );
    expect(document.querySelector(".app-shell")?.closest("[inert]")).not.toBeNull();

    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog", { name: "从备份恢复" })).toBeNull();
    expect(calls("discard_restore").map(([, args]) => args)).toEqual([{ restoreId: "restore-1" }]);
    expect(calls("apply_restore")).toHaveLength(0);
    await waitFor(() => expect(key).toHaveFocus());
  });

  // Checking a large backup can take seconds: the key says it is busy, and a second press does nothing.
  it("marks 选择备份… busy while the backup is picked and checked", async () => {
    let finish!: (value: unknown) => void;
    overrides.pick_restore_backup = () => new Promise((resolve) => (finish = resolve));
    await openSettings();
    const key = screen.getByRole("button", { name: "选择备份…" });
    expect(key).not.toHaveAttribute("aria-busy");

    await userEvent.click(key);
    expect(key).toHaveAttribute("aria-busy", "true");
    // Unavailable but still focusable, so focus stays on the key.
    expect(key).toHaveAttribute("aria-disabled", "true");
    expect(key).toBeEnabled();
    await userEvent.click(key);
    expect(calls("pick_restore_backup")).toHaveLength(1);

    await act(async () => finish(null));
    expect(key).not.toHaveAttribute("aria-busy");
    expect(key).not.toHaveAttribute("aria-disabled");
  });

  it("discards on Escape too", async () => {
    await openSettings();
    await userEvent.click(screen.getByRole("button", { name: "选择备份…" }));
    await screen.findByRole("dialog", { name: "从备份恢复" });

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "从备份恢复" })).toBeNull();
    expect(calls("discard_restore")).toHaveLength(1);
  });

  it("does nothing when the file dialog is cancelled", async () => {
    overrides.pick_restore_backup = () => null;
    await openSettings();
    await userEvent.click(screen.getByRole("button", { name: "选择备份…" }));

    await waitFor(() => expect(calls("pick_restore_backup")).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("restores and restarts, busy while the call runs", async () => {
    let finish!: () => void;
    overrides.apply_restore = () => new Promise<void>((resolve) => (finish = resolve));
    await openSettings();
    await userEvent.click(screen.getByRole("button", { name: "选择备份…" }));
    const dialog = await screen.findByRole("dialog", { name: "从备份恢复" });

    await userEvent.click(within(dialog).getByRole("button", { name: "恢复并重启" }));

    expect(calls("apply_restore").map(([, args]) => args)).toEqual([{ restoreId: "restore-1" }]);
    expect(within(dialog).getByRole("button", { name: "恢复并重启" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    expect(dialog).toHaveAttribute("aria-busy", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "从备份恢复" })).toBeInTheDocument();
    await act(async () => finish());
    expect(calls("discard_restore")).toHaveLength(0);
  });

  it("shows a failed restart in the error dialog", async () => {
    overrides.apply_restore = () => Promise.reject("restore_failed");
    await openSettings();
    await userEvent.click(screen.getByRole("button", { name: "选择备份…" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "从备份恢复" })).getByRole("button", { name: "恢复并重启" }));

    const dialog = await screen.findByRole("dialog", { name: "从备份恢复" });
    await waitFor(() => expect(dialog).toHaveTextContent("恢复失败，当前数据没有改动。"));
    expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual(["关闭"]);
  });

  it.each([
    ["restore_invalid", "这个文件不是有效的 GST 备份。"],
    ["restore_newer", "这份备份来自更新版本的 GST，无法在当前版本恢复。"],
    ["restore_live_database", "不能选择正在使用的数据库。"],
    ["restore_no_space", "磁盘空间不足，无法恢复。"],
    ["something else", "恢复失败，当前数据没有改动。"],
  ])("explains a %s pick in the error dialog", async (code, message) => {
    overrides.pick_restore_backup = () => Promise.reject(code);
    await openSettings();
    const key = screen.getByRole("button", { name: "选择备份…" });
    await userEvent.click(key);

    const dialog = await screen.findByRole("dialog", { name: "从备份恢复" });
    expect(Array.from(dialog.querySelectorAll("p")).map((p) => p.textContent)).toEqual([message]);
    const close = within(dialog).getByRole("button", { name: "关闭" });
    expect(within(dialog).getAllByRole("button")).toEqual([close]);
    expect(close).toHaveFocus();

    await userEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls("discard_restore")).toHaveLength(0);
    await waitFor(() => expect(key).toHaveFocus());
  });

  it("formats the backup size as the spec says", () => {
    const MB = 1024 * 1024;
    expect(formatFileSize(196 * MB)).toBe("196 MB");
    expect(formatFileSize(10 * MB)).toBe("10 MB");
    expect(formatFileSize(10.6 * MB)).toBe("11 MB");
    expect(formatFileSize(9.44 * MB)).toBe("9.4 MB");
    expect(formatFileSize(1 * MB)).toBe("1.0 MB");
    expect(formatFileSize(512 * 1024)).toBe("512 KB");
    expect(formatFileSize(300)).toBe("1 KB");
  });
});

describe("restore status at start (spec §H)", () => {
  it("says 已从备份恢复 once after a restore", async () => {
    overrides.get_restore_status = () => "restored";
    render(<App />);

    await waitFor(() => expect(document.querySelector(".toast")).toHaveTextContent("已从备份恢复"));
    expect(calls("get_restore_status")).toHaveLength(1);
  });

  it("says the restore did not finish after a rollback", async () => {
    overrides.get_restore_status = () => "rolled_back";
    render(<App />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("恢复没有完成，已保留原来的数据"));
  });

  it("shows nothing without a restore", async () => {
    render(<App />);
    await waitFor(() => expect(calls("get_restore_status")).toHaveLength(1));
    expect(document.querySelector(".toast")).toHaveClass("is-idle");
  });
});

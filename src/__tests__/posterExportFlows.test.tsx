import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
const renderPosterPng = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: () => Promise.resolve(() => {}), setTheme: () => Promise.resolve() }),
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: vi.fn(async () => {}),
  enable: vi.fn(async () => {}),
  isEnabled: vi.fn(async () => true),
}));
// jsdom cannot paint: the capture itself is stubbed, everything around it (models, the off-screen mount,
// saveBinaryExport, the toast) runs for real.
vi.mock("../posters/renderPosterPng", () => ({ renderPosterPng }));

import App from "../App";
import type { MilestoneSoftware } from "../api";
import {
  AchievementPosterDialog,
  defaultMilestoneKey,
  orderMilestoneSoftware,
  TYPEAHEAD_RESET_MS,
} from "../components/AchievementPosterDialog";

const TODAY = "2026-11-24";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const H = 3600;
type Handler = (args: unknown, options?: { headers?: Record<string, string> }) => unknown;

let overrides: Record<string, Handler>;

function milestone(key: string, name: string, tier: number, reached: string, focusHours: number): MilestoneSoftware {
  return {
    identity_key: key,
    display_name: name,
    process_name: `${key}.exe`,
    icon_url: null,
    tier_hours: tier,
    reached_on: reached,
    total_focused_seconds: focusHours * H,
    used_days: Math.round(focusHours / 2),
  };
}

// Unsorted on purpose: the dialog orders by tier, then total focus.
const MILESTONES: MilestoneSoftware[] = [
  milestone("typora", "Typora", 50, "2026-11-02", 62),
  milestone("code", "Visual Studio Code", 6666, "2026-11-20", 6702),
  milestone("excel", "Microsoft Excel", 100, "2026-11-22", 100.3),
  milestone("matlab", "MATLAB", 50, "2026-09-20", 55),
  milestone("chrome", "Google Chrome", 500, "2026-10-12", 640),
  milestone("terminal", "Windows Terminal", 10, "2026-11-16", 14),
];
const HIDDEN_MILESTONE = milestone("steam", "Steam", 1000, "2026-11-23", 1200);

function dashboard(date: string) {
  return {
    last_scan_succeeded: true,
    product_title: "全局软件计时器",
    locale: "zh-CN",
    usage_date: date,
    is_today: date === TODAY,
    most_used: null,
    recorded_today_seconds: 9.6 * H,
    active_today_seconds: 6.3 * H,
    apps: [
      {
        app_id: 1,
        display_name: "Visual Studio Code",
        process_name: "Code.exe",
        icon_url: null,
        total_seconds: 36000,
        today_seconds: 19440,
        active_today_seconds: 8640,
        status: date === TODAY ? "foreground" : "closed",
        is_running: date === TODAY,
      },
    ],
  };
}

function achievements(args: { heatmapDays: number; includeHidden: boolean }) {
  return {
    today: TODAY,
    heatmap_days: args.heatmapDays,
    heatmap: [{ date: TODAY, active_seconds: H }],
    streak_threshold_seconds: 300,
    current_streak_days: 1,
    current_streak_start: TODAY,
    longest_streak_days: 1,
    longest_streak_start: TODAY,
    longest_streak_end: TODAY,
    best_active_day: null,
    best_software_day: null,
    milestone_hours: [10, 50, 100, 500, 1000, 6666],
    milestones: [],
    new_software: [],
    dormant_software: [],
  };
}

const defaults: Record<string, Handler> = {
  get_app_settings: () => ({
    close_behavior: "minimize_to_tray",
    close_behavior_configured: true,
    autostart_enabled: true,
    autostart_configured: true,
    duration_format: "decimal_hours",
    duration_format_configured: true,
    theme: "light",
    theme_configured: true,
  }),
  get_calendar_summary: () => ({ today: TODAY, data_start_date: "2026-09-03" }),
  get_transparency_effects_enabled: () => true,
  get_dashboard_summary: (args) => {
    const date = (args as { date?: string } | undefined)?.date;
    return dashboard(typeof date === "string" ? date : TODAY);
  },
  get_achievements_summary: (args) => achievements(args as { heatmapDays: number; includeHidden: boolean }),
  get_milestone_software: (args) =>
    (args as { includeHidden: boolean }).includeHidden ? [...MILESTONES, HIDDEN_MILESTONE] : MILESTONES,
  save_binary_export: (_body, options) =>
    `C:\\Users\\demo\\Downloads\\${decodeURIComponent(options?.headers?.["x-gst-file-name"] ?? "")}`,
  reveal_saved_file: () => undefined,
};

beforeEach(() => {
  // Only Date is faked, so polling and the toast keep real timers.
  vi.useFakeTimers({ now: new Date(2026, 10, 24, 22, 1), toFake: ["Date"] });
  overrides = {};
  renderPosterPng.mockResolvedValue(PNG);
  mockInvoke.mockImplementation(async (command: string, args?: unknown, options?: { headers?: Record<string, string> }) => {
    const handler = overrides[command] ?? defaults[command];
    return handler ? handler(args, options) : undefined;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mockInvoke.mockReset();
  renderPosterPng.mockReset();
});

const calls = (command: string) => mockInvoke.mock.calls.filter(([name]) => name === command);

/** The suggested name a save_binary_export call carried. */
const savedName = (index = 0) => decodeURIComponent(calls("save_binary_export")[index][2].headers["x-gst-file-name"]);

/** The poster element the (stubbed) capture was given. */
const capturedPoster = (index = 0) => renderPosterPng.mock.calls[index][0] as HTMLElement;

async function openAchievements() {
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "成就" }));
  return screen.findByRole("button", { name: "导出成就 PNG" });
}

async function openPicker() {
  const key = await openAchievements();
  await waitFor(() => expect(key).not.toHaveAttribute("aria-busy"));
  await userEvent.click(key);
  const dialog = await screen.findByRole("dialog", { name: "成就海报" });
  return { key, dialog, list: within(dialog).getByRole("listbox", { name: "成就海报" }) };
}

const optionNames = (list: HTMLElement) => within(list).getAllByRole("option").map((option) => option.getAttribute("aria-label"));
const selectedName = (list: HTMLElement) =>
  within(list)
    .getAllByRole("option")
    .find((option) => option.getAttribute("aria-selected") === "true")
    ?.getAttribute("aria-label");

describe("日报海报", () => {
  it("renders the viewed day's poster in the app's theme and saves it as a PNG", async () => {
    render(<App />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));

    await userEvent.click(await screen.findByRole("button", { name: "导出日报" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /日报海报/ }));

    await waitFor(() => expect(calls("save_binary_export")).toHaveLength(1));
    const poster = capturedPoster();
    expect(poster).toHaveClass("gst-poster", "is-light");
    expect(poster).toHaveAttribute("aria-label", "日报海报 11月24日 周二 今日活跃 6.3 小时");
    // The off-screen mount is gone again once the PNG is made.
    expect(poster.isConnected).toBe(false);
    const [, body] = calls("save_binary_export")[0];
    expect(body).toBe(PNG);
    expect(savedName()).toBe("GST-日报-2026-11-24.png");
    expect(await screen.findByRole("status")).toHaveTextContent("已保存");

    await userEvent.click(screen.getByRole("button", { name: "在文件夹中显示" }));
    expect(mockInvoke).toHaveBeenCalledWith("reveal_saved_file", { path: "C:\\Users\\demo\\Downloads\\GST-日报-2026-11-24.png" });
  });

  it("names a past day's poster and labels it 当日活跃", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "前一天" }));
    await userEvent.click(screen.getByRole("button", { name: "导出日报" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /日报海报/ }));

    await waitFor(() => expect(calls("save_binary_export")).toHaveLength(1));
    expect(mockInvoke).toHaveBeenCalledWith("get_dashboard_summary", { date: "2026-11-23" });
    expect(capturedPoster()).toHaveAttribute("aria-label", "日报海报 11月23日 周一 当日活跃 6.3 小时");
    expect(savedName()).toBe("GST-日报-2026-11-23.png");
  });

  it("shows nothing when the save dialog is cancelled, and 保存失败 when the render fails", async () => {
    overrides.save_binary_export = () => null;
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "导出日报" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /日报海报/ }));
    await waitFor(() => expect(calls("save_binary_export")).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "导出日报" })).not.toHaveAttribute("aria-busy"));
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.getByRole("alert")).toHaveTextContent("");

    renderPosterPng.mockRejectedValueOnce(new Error("poster_render_failed"));
    await userEvent.click(screen.getByRole("button", { name: "导出日报" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /日报海报/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("保存失败"));
    expect(calls("save_binary_export")).toHaveLength(1);
  });
});

describe("成就海报 list order", () => {
  it("orders by tier, then total focus, and defaults to the latest reached", () => {
    const ordered = orderMilestoneSoftware(MILESTONES);
    expect(ordered.map((row) => row.identity_key)).toEqual(["code", "chrome", "excel", "typora", "matlab", "terminal"]);
    expect(defaultMilestoneKey(ordered)).toBe("excel");
    // A tie on the date goes to the row listed first.
    const tied = orderMilestoneSoftware([milestone("a", "A", 10, "2026-11-01", 11), milestone("b", "B", 50, "2026-11-01", 60)]);
    expect(defaultMilestoneKey(tied)).toBe("b");
    expect(defaultMilestoneKey([])).toBeNull();
  });
});

describe("导出成就", () => {
  it("opens the 成就海报 dialog with the ordered list, the latest milestone selected and the list focused", async () => {
    const { dialog, list } = await openPicker();

    expect(optionNames(list)).toEqual([
      "Visual Studio Code 6666 小时",
      "Google Chrome 500 小时",
      "Microsoft Excel 100 小时",
      "Typora 50 小时",
      "MATLAB 50 小时",
      "Windows Terminal 10 小时",
    ]);
    expect(selectedName(list)).toBe("Microsoft Excel 100 小时");
    expect(list).toHaveFocus();
    expect(list.getAttribute("aria-activedescendant")).toBe(
      within(list).getByRole("option", { name: "Microsoft Excel 100 小时" }).id,
    );
    // The live preview is the real poster for the selection.
    expect(within(dialog).getByRole("img", { name: "成就海报 Microsoft Excel 专注里程碑 100 小时" })).toHaveClass("gst-poster");
    expect(document.querySelector(".app-shell")).toHaveAttribute("inert");
    // The toast stays live (under the scrim), so what a save says is still announced.
    expect(document.querySelector(".toast")).not.toHaveAttribute("inert");
    expect(mockInvoke).toHaveBeenCalledWith("get_milestone_software", { includeHidden: false });
  });

  it("moves the selection with the arrow keys, Home, End, typing and the mouse, keeping it in view", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const { dialog, list } = await openPicker();

    await userEvent.keyboard("{ArrowDown}");
    expect(selectedName(list)).toBe("Typora 50 小时");
    expect(within(dialog).getByRole("img", { name: /成就海报 Typora/ })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(selectedName(list)).toBe("Google Chrome 500 小时");
    await userEvent.keyboard("{End}");
    expect(selectedName(list)).toBe("Windows Terminal 10 小时");
    await userEvent.keyboard("{ArrowDown}");
    expect(selectedName(list)).toBe("Windows Terminal 10 小时");
    await userEvent.keyboard("{Home}");
    expect(selectedName(list)).toBe("Visual Studio Code 6666 小时");
    expect(scrolled).toHaveBeenLastCalledWith({ block: "nearest" });

    // Typeahead: a letter finds the next name starting with it, more letters narrow the search.
    await userEvent.keyboard("m");
    expect(selectedName(list)).toBe("Microsoft Excel 100 小时");
    await userEvent.keyboard("m");
    expect(selectedName(list)).toBe("MATLAB 50 小时");
    // Only Date is faked here: a pause is the clock moving on.
    vi.setSystemTime(Date.now() + TYPEAHEAD_RESET_MS + 50);
    await userEvent.keyboard("go");
    expect(selectedName(list)).toBe("Google Chrome 500 小时");

    await userEvent.click(within(list).getByRole("option", { name: "Typora 50 小时" }));
    expect(selectedName(list)).toBe("Typora 50 小时");
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("saves the selection on Enter, closes, shows the toast and returns focus to the key", async () => {
    const { key } = await openPicker();

    await userEvent.keyboard("{ArrowUp}{Enter}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "成就海报" })).not.toBeInTheDocument());
    expect(calls("save_binary_export")).toHaveLength(1);
    expect(savedName()).toBe("GST-成就-Google Chrome-2026-10-12.png");
    expect(capturedPoster()).toHaveAttribute("aria-label", "成就海报 Google Chrome 专注里程碑 500 小时");
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    expect(document.querySelector(".app-shell")).not.toHaveAttribute("inert");
    expect(key).toHaveFocus();
  });

  it("saves with 保存图片 and on a double-click, stripping characters Windows forbids in the name", async () => {
    overrides.get_milestone_software = () => [milestone("odd", 'A/B: "C"?', 10, "2026-11-01", 12), ...MILESTONES];
    const { dialog, list } = await openPicker();

    await userEvent.dblClick(within(list).getByRole("option", { name: 'A/B: "C"? 10 小时' }));
    await waitFor(() => expect(calls("save_binary_export")).toHaveLength(1));
    expect(savedName()).toBe("GST-成就-AB C-2026-11-01.png");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "导出成就 PNG" }));
    const reopened = await screen.findByRole("dialog", { name: "成就海报" });
    await userEvent.click(within(reopened).getByRole("button", { name: "保存图片" }));
    await waitFor(() => expect(calls("save_binary_export")).toHaveLength(2));
    expect(savedName(1)).toBe("GST-成就-Microsoft Excel-2026-11-22.png");
  });

  it("closes on Esc or 取消 without saving and returns focus to the key", async () => {
    const { key } = await openPicker();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "成就海报" })).not.toBeInTheDocument();
    expect(key).toHaveFocus();

    await userEvent.click(key);
    const dialog = await screen.findByRole("dialog", { name: "成就海报" });
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "成就海报" })).not.toBeInTheDocument();
    expect(key).toHaveFocus();
    expect(calls("save_binary_export")).toHaveLength(0);
    expect(renderPosterPng).not.toHaveBeenCalled();
  });

  it("keeps Tab inside the dialog", async () => {
    const { dialog, list } = await openPicker();

    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "保存图片" })).toHaveFocus();
    await userEvent.tab();
    expect(list).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "保存图片" })).toHaveFocus();
  });

  it("stays open when the save dialog is cancelled, and says 保存失败 when the save fails", async () => {
    overrides.save_binary_export = () => null;
    const { dialog } = await openPicker();

    await userEvent.click(within(dialog).getByRole("button", { name: "保存图片" }));
    await waitFor(() => expect(calls("save_binary_export")).toHaveLength(1));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "保存图片" })).not.toHaveAttribute("aria-busy"));
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");

    overrides.save_binary_export = () => {
      throw "export_too_large";
    };
    await userEvent.click(within(dialog).getByRole("button", { name: "保存图片" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("保存失败"));
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("alert").closest("[inert]")).toBeNull();
  });

  it("ignores a second save while one is under way", async () => {
    let finish: (path: string | null) => void = () => {};
    overrides.save_binary_export = () => new Promise((resolve) => (finish = resolve));
    const { dialog } = await openPicker();
    const save = within(dialog).getByRole("button", { name: "保存图片" });

    await userEvent.click(save);
    await waitFor(() => expect(save).toHaveAttribute("aria-busy", "true"));
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    await userEvent.click(save);
    await userEvent.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    finish(null);

    await waitFor(() => expect(save).not.toHaveAttribute("aria-busy"));
    expect(calls("save_binary_export")).toHaveLength(1);
  });

  it("follows the page's 包含隐藏软件 switch", async () => {
    const key = await openAchievements();

    await userEvent.click(await screen.findByRole("switch", { name: "包含隐藏软件" }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_milestone_software", { includeHidden: true }));
    await waitFor(() => expect(key).not.toHaveAttribute("aria-busy"));
    await userEvent.click(key);

    const list = within(await screen.findByRole("dialog", { name: "成就海报" })).getByRole("listbox");
    expect(optionNames(list)).toContain("Steam 1000 小时");
    expect(selectedName(list)).toBe("Steam 1000 小时");
  });

  it("is unavailable with 暂无里程碑 when no software has reached a milestone", async () => {
    overrides.get_milestone_software = () => [];
    const key = await openAchievements();

    await waitFor(() => expect(key).toHaveAttribute("aria-disabled", "true"));
    await userEvent.hover(key);
    expect(screen.getByRole("tooltip")).toHaveTextContent("暂无里程碑");
    await userEvent.click(key);
    expect(screen.queryByRole("dialog", { name: "成就海报" })).not.toBeInTheDocument();
  });

  it("keeps focus on the key when the list it waited for is empty", async () => {
    let answer: (list: MilestoneSoftware[]) => void = () => {};
    overrides.get_milestone_software = () => new Promise((resolve) => (answer = resolve));
    const key = await openAchievements();
    await waitFor(() => expect(key).toHaveAttribute("aria-busy", "true"));
    act(() => key.focus());

    act(() => answer([]));
    await waitFor(() => expect(key).toHaveAttribute("aria-disabled", "true"));
    expect(key.isConnected).toBe(true);
    expect(key).toHaveFocus();
  });

  it("reads the list again on a click after a failed read, and says 无法读取成就 when that fails too", async () => {
    let fail = true;
    overrides.get_milestone_software = () => {
      if (fail) throw "milestones_unavailable";
      return MILESTONES;
    };
    const key = await openAchievements();
    await waitFor(() => expect(calls("get_milestone_software")).toHaveLength(1));
    await waitFor(() => expect(key).not.toHaveAttribute("aria-busy"));

    await userEvent.click(key);
    await waitFor(() => expect(document.querySelector('.toast [role="alert"]')).toHaveTextContent("无法读取成就"));
    expect(calls("get_milestone_software")).toHaveLength(2);
    expect(screen.queryByRole("dialog", { name: "成就海报" })).not.toBeInTheDocument();

    fail = false;
    await userEvent.click(key);
    expect(await screen.findByRole("dialog", { name: "成就海报" })).toBeInTheDocument();
    expect(calls("get_milestone_software")).toHaveLength(3);
  });

  it("says nothing when a newer read overtakes the click's retry", async () => {
    const answers: { resolve: (list: MilestoneSoftware[]) => void; reject: (error: unknown) => void }[] = [];
    overrides.get_milestone_software = () =>
      new Promise<MilestoneSoftware[]>((resolve, reject) => answers.push({ resolve, reject }));
    const key = await openAchievements();
    await waitFor(() => expect(answers).toHaveLength(1));
    await act(async () => answers[0].reject("milestones_unavailable"));
    await waitFor(() => expect(key).not.toHaveAttribute("aria-busy"));

    await userEvent.click(key);
    await waitFor(() => expect(answers).toHaveLength(2));
    // The window comes back: the poll reads again while the click's read is still out.
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(answers).toHaveLength(3));
    await act(async () => answers[2].resolve(MILESTONES));
    await act(async () => answers[1].reject("milestones_unavailable"));

    expect(document.querySelector('.toast [role="alert"]')).toHaveTextContent("");
    expect(key).not.toHaveAttribute("aria-busy");
    expect(screen.queryByRole("dialog", { name: "成就海报" })).not.toBeInTheDocument();
  });

  it("stays busy while the milestone list loads", async () => {
    let answer: (list: MilestoneSoftware[]) => void = () => {};
    overrides.get_milestone_software = () => new Promise((resolve) => (answer = resolve));
    const key = await openAchievements();

    await waitFor(() => expect(key).toHaveAttribute("aria-busy", "true"));
    await userEvent.click(key);
    expect(screen.queryByRole("dialog", { name: "成就海报" })).not.toBeInTheDocument();

    act(() => answer(MILESTONES));
    await waitFor(() => expect(key).not.toHaveAttribute("aria-busy"));
    expect(key).not.toHaveAttribute("aria-disabled");
  });
});

describe("成就海报 list refresh", () => {
  it("keeps the selection while that software is still listed, and falls back to the default otherwise", async () => {
    const props = { theme: "light" as const, busy: false, onSave: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(<AchievementPosterDialog software={MILESTONES} {...props} />);
    const list = screen.getByRole("listbox", { name: "成就海报" });
    await userEvent.click(within(list).getByRole("option", { name: "Typora 50 小时" }));
    expect(selectedName(list)).toBe("Typora 50 小时");

    // Typora is still listed (Chrome moved on, Word is new): the selection stays.
    const word = milestone("word", "Microsoft Word", 100, "2026-11-23", 120);
    const refreshed = MILESTONES.map((row) => (row.identity_key === "chrome" ? { ...row, tier_hours: 1000 } : row));
    rerender(<AchievementPosterDialog software={[...refreshed, word]} {...props} />);
    expect(selectedName(list)).toBe("Typora 50 小时");

    // Typora is gone: back to the default, the latest milestone (Word).
    rerender(<AchievementPosterDialog software={[...refreshed.filter((row) => row.identity_key !== "typora"), word]} {...props} />);
    expect(selectedName(list)).toBe("Microsoft Word 100 小时");
    expect(screen.getByRole("img", { name: /成就海报 Microsoft Word/ })).toBeInTheDocument();
  });
});

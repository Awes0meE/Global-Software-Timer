import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
const getCurrentWindowMock = vi.hoisted(() => vi.fn());
const autostartMocks = vi.hoisted(() => ({
  disable: vi.fn(),
  enable: vi.fn(),
  isEnabled: vi.fn(),
}));
const closeRequestMock = vi.hoisted(() => ({
  handler: undefined as undefined | ((event: { preventDefault: () => void }) => void | Promise<void>),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: getCurrentWindowMock,
}));

vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: autostartMocks.disable,
  enable: autostartMocks.enable,
  isEnabled: autostartMocks.isEnabled,
}));

import packageJson from "../../package.json";
import App from "../App";
import { paintInitialAppearance } from "../appearance";
import { START_PAGE_IDS, START_PAGE_NAMES } from "../appearancePresets";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe("App", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  beforeEach(() => {
    mockInvoke.mockReset();
    getCurrentWindowMock.mockReset();
    autostartMocks.disable.mockReset();
    autostartMocks.enable.mockReset();
    autostartMocks.isEnabled.mockReset();
    autostartMocks.disable.mockResolvedValue(undefined);
    autostartMocks.enable.mockResolvedValue(undefined);
    autostartMocks.isEnabled.mockResolvedValue(false);
    closeRequestMock.handler = undefined;
    closeRequestMock.unlisten.mockReset();
    getCurrentWindowMock.mockReturnValue({
      onCloseRequested: vi.fn((handler) => {
        closeRequestMock.handler = handler;
        return Promise.resolve(closeRequestMock.unlisten);
      }),
    });
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return Promise.resolve({
          close_behavior: "minimize_to_tray",
          close_behavior_configured: false,
          autostart_enabled: true,
          autostart_configured: false,
        });
      }

      if (command === "set_autostart_preference") {
        return Promise.resolve(undefined);
      }

      if (command === "set_close_behavior_preference") {
        return Promise.resolve(undefined);
      }

      if (command === "apply_window_close_choice") {
        return Promise.resolve(undefined);
      }

      if (command === "get_background_page_summary") {
        return Promise.resolve({ logical_cores: 4, running_count: 0, rows: [] });
      }

      return Promise.resolve({
        last_scan_succeeded: true,
        product_title: "全局软件计时器",
        locale: "zh-CN",
        usage_date: "2026-11-22",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });
  });

  it("renders the Chinese product title and recording status", async () => {
    render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    expect(await screen.findByText("正在记录")).toBeInTheDocument();
  });

  it("reports a failed scan while the tracker retries", async () => {
    mockInvoke.mockImplementation(async (command) => command === "get_dashboard_summary" ? {
      last_scan_succeeded: false, product_title: "全局软件计时器",
      most_used: null, recorded_today_seconds: 0, active_today_seconds: 0, apps: [],
    } : {});
    render(<App />);
    expect(await screen.findByText("采样失败，正在重试")).toBeInTheDocument();
    expect(screen.queryByText("正在记录")).not.toBeInTheDocument();
  });

  it("renders the app version from package metadata", async () => {
    render(<App />);

    expect(await screen.findByText(`V${packageJson.version}`)).toBeInTheDocument();
  });

  it("opens the background page from the sidebar and loads its summary", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "后台" }));

    expect(screen.getByRole("heading", { level: 2, name: "后台" })).toBeInTheDocument();
    expect(await screen.findByText("今天还没有记录到后台进程。")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("get_background_page_summary");
  });

  it.each([
    {
      label: "统计",
      command: "get_statistics_summary",
      args: expect.objectContaining({ includeHidden: false }),
      loading: "正在读取统计…",
      contentId: "statistics-content",
    },
    {
      label: "成就",
      command: "get_achievements_summary",
      args: { heatmapDays: 90, includeHidden: false },
      loading: "正在读取成就…",
      contentId: "achievements-content",
    },
  ])("opens the $label page from the sidebar", async ({ label, command, args, loading, contentId }) => {
    const invokeDefault = mockInvoke.getMockImplementation()!;
    mockInvoke.mockImplementation((name, invokeArgs) =>
      name === command ? new Promise(() => {}) : invokeDefault(name, invokeArgs),
    );
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: label }));

    expect(screen.getByRole("heading", { level: 2, name: label })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith(command, args));
    expect(await screen.findByText(loading)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "跳到内容" })).toHaveAttribute("href", `#${contentId}`);
    expect(document.getElementById(contentId)).toBeInTheDocument();
  });

  it("shows a friendly warning instead of raw Tauri runtime errors", async () => {
    mockInvoke.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'invoke')");
    });

    render(<App />);

    expect(await screen.findByText("无法读取本地数据")).toBeInTheDocument();
    expect(
      screen.queryByText("Cannot read properties of undefined (reading 'invoke')"),
    ).not.toBeInTheDocument();
  });

  it("shows a friendly warning when the dashboard command rejects", async () => {
    mockInvoke.mockRejectedValue(new Error("database is temporarily locked"));

    render(<App />);
    expect(screen.getByText("正在读取概览…")).toHaveAttribute("role", "status");
    expect(screen.queryByText("还没有记录到软件")).not.toBeInTheDocument();
    expect(await screen.findByText(/无法读取本地数据/)).toHaveAttribute("role", "alert");
    expect(screen.queryByText("还没有记录到软件")).not.toBeInTheDocument();
    expect(screen.queryByText("database is temporarily locked")).not.toBeInTheDocument();
  });

  it("refreshes the dashboard after the initial empty summary", async () => {
    vi.useFakeTimers();
    let dashboardCalls = 0;
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return Promise.resolve({
          close_behavior: "minimize_to_tray",
          close_behavior_configured: false,
          autostart_enabled: true,
          autostart_configured: false,
        });
      }

      if (command !== "get_dashboard_summary") {
        return Promise.resolve(undefined);
      }

      dashboardCalls += 1;
      if (dashboardCalls === 1) {
        return Promise.resolve({
          product_title: "全局软件计时器",
          locale: "zh-CN",
          most_used: null,
          recorded_today_seconds: 0,
          active_today_seconds: 0,
          apps: [],
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: {
          app_id: 1,
          display_name: "Codex",
          process_name: "codex.exe",
          icon_url: null,
          total_seconds: 65,
          today_seconds: 65,
          active_today_seconds: 65,
          status: "foreground",
          is_running: true,
        },
        recorded_today_seconds: 65,
        active_today_seconds: 65,
        apps: [
          {
            app_id: 1,
            display_name: "Codex",
            process_name: "codex.exe",
            icon_url: null,
            total_seconds: 65,
            today_seconds: 65,
            active_today_seconds: 65,
            status: "foreground",
            is_running: true,
          },
        ],
      });
    });

    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("暂无数据")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(screen.getAllByText("Codex").length).toBeGreaterThan(0);
    expect(dashboardCalls).toBe(2);
  });

  it("renders the overview workspace chrome and dashboard panels", async () => {
    mockInvoke.mockResolvedValue({
      product_title: "全局软件计时器",
      locale: "zh-CN",
      most_used: {
        app_id: 1,
        display_name: "Visual Studio Code",
        process_name: "Code.exe",
        icon_url: "data:image/png;base64,AAAA",
        total_seconds: 482 * 3600 + 36 * 60,
        today_seconds: 3 * 3600 + 15 * 60,
        active_today_seconds: 22 * 60,
        status: "foreground",
        is_running: true,
      },
      recorded_today_seconds: 8 * 3600 + 47 * 60,
      active_today_seconds: 27 * 60,
      apps: [
        {
          app_id: 1,
          display_name: "Visual Studio Code",
          process_name: "Code.exe",
          icon_url: "data:image/png;base64,AAAA",
          total_seconds: 482 * 3600 + 36 * 60,
          today_seconds: 3 * 3600 + 15 * 60,
          active_today_seconds: 22 * 60,
          status: "foreground",
          is_running: true,
        },
        {
          app_id: 2,
          display_name: "Chrome",
          process_name: "chrome.exe",
          icon_url: null,
          total_seconds: 115 * 3600 + 47 * 60,
          today_seconds: 45 * 60,
          active_today_seconds: 5 * 60,
          status: "tray",
          is_running: true,
        },
      ],
    });

    const { container } = render(<App />);

    expect(await screen.findByRole("heading", { name: "全局软件计时器" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "概览" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("软件使用情况")).toBeInTheDocument();
    expect(container.querySelector(".window-control-group")).not.toBeInTheDocument();
    expect(container.querySelector(".usage-scroll")).toBeInTheDocument();
    expect(container.querySelector(".mix-scroll")).toBeInTheDocument();
    expect(container.querySelector(".recent-scroll")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /查看全部/ })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "今日分布" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "正在运行" })).toBeInTheDocument();
    const recentPanel = screen.getByRole("complementary", { name: "正在运行" });
    expect(await within(recentPanel).findByText("3.3小时")).toBeInTheDocument();
    expect(within(recentPanel).getByText("0.8小时")).toBeInTheDocument();
    expect(within(recentPanel).getByRole("img", { name: "前台运行" })).toHaveClass("running");
    expect(within(recentPanel).getByRole("img", { name: "托盘运行" })).toHaveClass("tray");
    expect(screen.getByRole("button", { name: "导出日报" })).toHaveAttribute("aria-haspopup", "menu");
    const readout = screen.getByRole("region", { name: "今日总览" });
    expect(within(readout).getByText("今日记录")).toBeInTheDocument();
    expect(within(readout).getByText("今日活跃")).toBeInTheDocument();
    expect(within(readout).getByText("8.8")).toBeInTheDocument();
    expect(within(readout).getByText("0.5")).toBeInTheDocument();
    expect(within(readout).getByText("今日活跃 0.4小时")).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /^满圈 24 小时，今日已过 \d{2}:\d{2}$/ })).toBeInTheDocument();
    expect(container.querySelectorAll(".lcd-ring-recorded path.is-lit")).toHaveLength(17);
    expect(container.querySelectorAll(".lcd-ring-active path.is-lit")).toHaveLength(0);
  });

  it("uses the selected duration format across overview duration displays", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return Promise.resolve({
          close_behavior: "minimize_to_tray",
          close_behavior_configured: false,
          autostart_enabled: true,
          autostart_configured: false,
          duration_format: "hours_minutes",
          duration_format_configured: true,
        });
      }

      if (command === "set_autostart_preference") {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: {
          app_id: 1,
          display_name: "Visual Studio Code",
          process_name: "Code.exe",
          icon_url: null,
          total_seconds: 8 * 3600 + 35 * 60,
          today_seconds: 90 * 60,
          active_today_seconds: 42 * 60,
          status: "foreground",
          is_running: true,
        },
        recorded_today_seconds: 8 * 3600 + 35 * 60,
        active_today_seconds: 42 * 60,
        apps: [
          {
            app_id: 1,
            display_name: "Visual Studio Code",
            process_name: "Code.exe",
            icon_url: null,
            total_seconds: 8 * 3600 + 35 * 60,
            today_seconds: 90 * 60,
            active_today_seconds: 42 * 60,
            status: "foreground",
            is_running: true,
          },
        ],
      });
    });

    render(<App />);

    expect(await screen.findAllByText("8小时35分钟")).not.toHaveLength(0);
    expect(screen.getAllByText("1小时30分钟").length).toBeGreaterThan(0);
    expect(screen.getAllByText("42分钟").length).toBeGreaterThan(0);
  });

  it("removes duplicated settings and statistics actions from the top right header", async () => {
    const { container } = render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    const windowActions = container.querySelector(".window-actions");

    expect(windowActions).toBeInTheDocument();
    expect(within(windowActions as HTMLElement).queryByRole("button", { name: "设置" })).not.toBeInTheDocument();
    expect(within(windowActions as HTMLElement).queryByRole("button", { name: "统计" })).not.toBeInTheDocument();
    expect(within(windowActions as HTMLElement).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "导出日报",
    ]);
  });

  it.each([
    { label: "概览", shown: true },
    { label: "后台", shown: true },
    { label: "软件", shown: false },
    { label: "统计", shown: false },
    { label: "成就", shown: false },
    { label: "设置", shown: false },
  ])("shows the header date key on $label: $shown", async ({ label, shown }) => {
    const invokeDefault = mockInvoke.getMockImplementation()!;
    mockInvoke.mockImplementation((name, invokeArgs) =>
      name === "get_statistics_summary" || name === "get_achievements_summary"
        ? new Promise(() => {})
        : invokeDefault(name, invokeArgs),
    );
    const { container } = render(<App />);

    if (label !== "概览") {
      await userEvent.click(await screen.findByRole("button", { name: label }));
    }

    expect(await screen.findByRole("heading", { level: 2, name: label })).toBeInTheDocument();
    const header = container.querySelector(".page-header") as HTMLElement;
    expect(within(header).queryByRole("group", { name: "查看日期" }) !== null).toBe(shown);
  });

  it.each([
    { label: "概览", keys: ["导出日报"] },
    { label: "软件", keys: ["导出软件清单… CSV"] },
    { label: "后台", keys: ["导出后台记录… CSV"] },
    { label: "统计", keys: ["导出报表"] },
    { label: "成就", keys: ["导出成就… PNG"] },
    { label: "设置", keys: ["迁移与备份"] },
  ])("gives $label its export key and no 更多 or placeholder buttons", async ({ label, keys }) => {
    const invokeDefault = mockInvoke.getMockImplementation()!;
    mockInvoke.mockImplementation((name, invokeArgs) =>
      name === "get_statistics_summary" || name === "get_achievements_summary" || name === "get_milestone_software"
        ? new Promise(() => {})
        : name === "get_software_page_summary"
          ? Promise.resolve({ focused: [], hidden: [], discovered: [] })
          : invokeDefault(name, invokeArgs),
    );
    const { container } = render(<App />);

    if (label !== "概览") {
      await userEvent.click(await screen.findByRole("button", { name: label }));
    }

    expect(await screen.findByRole("heading", { level: 2, name: label })).toBeInTheDocument();
    const actions = container.querySelector(".page-header .window-actions") as HTMLElement;
    expect(within(actions).queryAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual(keys);
    const header = container.querySelector(".page-header") as HTMLElement;
    expect(header.querySelector('[aria-disabled="true"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /更多/ })).not.toBeInTheDocument();
  });

  it("keeps the viewed date at today until another day is picked", async () => {
    render(<App />);

    const group = await screen.findByRole("group", { name: "查看日期" });
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(within(group).getByRole("button", { name: /，打开日历$/ })).toHaveTextContent(iso);
    expect(within(group).getByRole("button", { name: "后一天" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "今天" })).not.toBeInTheDocument();
  });

  it("shows and hides an unfinished-feature tooltip on unavailable controls", async () => {
    render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    const unavailableButtons = [
      screen.getByRole("button", { name: "时间轴" }),
    ];

    for (const button of unavailableButtons) {
      const trigger = button.closest("[data-tooltip='该功能暂未完成']");
      expect(trigger).not.toBeNull();
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute("aria-disabled", "true");
    }

    for (const name of ["统计", "成就"]) {
      const button = screen.getByRole("button", { name });
      expect(button.closest("[data-tooltip='该功能暂未完成']")).toBeNull();
      expect(button).toHaveAttribute("aria-disabled", "false");
    }

    const timelineTrigger = unavailableButtons[0].closest("[data-tooltip='该功能暂未完成']");
    expect(timelineTrigger).not.toBeNull();

    fireEvent.mouseEnter(timelineTrigger as Element);
    expect(screen.getByRole("tooltip")).toHaveTextContent("该功能暂未完成");

    fireEvent.mouseLeave(timelineTrigger as Element);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(unavailableButtons[0]);
    const focusedTooltip = screen.getByRole("tooltip");
    expect(focusedTooltip).toHaveTextContent("该功能暂未完成");
    expect(unavailableButtons[0]).toHaveAttribute("aria-describedby", focusedTooltip.id);

    fireEvent.blur(unavailableButtons[0]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens the software page with three panels", async () => {
    const pending = createDeferred<{ focused: never[]; hidden: never[]; discovered: never[] }>();
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return pending.promise;
      }

      if (command === "get_app_settings") {
        return Promise.resolve({
          close_behavior: "minimize_to_tray",
          close_behavior_configured: false,
          autostart_enabled: true,
          autostart_configured: false,
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "软件" }));

    expect(await screen.findByRole("heading", { name: "特别关注" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "隐藏软件列表" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "已发现软件" })).toBeInTheDocument();
    expect(screen.getAllByText("正在读取软件列表")).toHaveLength(3);
    await act(async () => pending.resolve({ focused: [], hidden: [], discovered: [] }));
    expect(await screen.findByText("还没有特别关注的软件")).toBeInTheDocument();
    expect(screen.queryByText("正在读取软件列表")).not.toBeInTheDocument();
    expect(screen.getByText("还没有隐藏的软件")).toBeInTheDocument();
    expect(screen.getByText("还没有发现软件")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("shows active time help from the software page", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [
            {
              identity_key: "app:code",
              display_name: "Visual Studio Code",
              process_name: "Code.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_foreground_seconds: 2400,
              today_background_seconds: 1200,
              today_focused_seconds: 1800,
              total_runtime_seconds: 7200,
              total_foreground_seconds: 5400,
              total_background_seconds: 1800,
              total_focused_seconds: 3600,
              last_opened_at: "2026-06-05T09:00:00Z",
              status: "foreground",
              mark: "focused",
            },
          ],
          hidden: [],
          discovered: [],
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));

    expect(await screen.findByText("今日前台")).toBeInTheDocument();
    expect(screen.getByText("今日后台")).toBeInTheDocument();
    expect(screen.getByText("今日活跃")).toBeInTheDocument();
    expect(screen.getByText("共计前台")).toBeInTheDocument();
    expect(screen.getByText("共计后台")).toBeInTheDocument();
    expect(screen.getByText("共计活跃")).toBeInTheDocument();
    expect(screen.queryByText("今日运行")).not.toBeInTheDocument();
    expect(screen.queryByText("共计运行")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "什么是活跃时长" }));

    expect(screen.getByRole("dialog", { name: "什么是活跃时长？" })).toBeInTheDocument();
    expect(screen.getByText(/运行时长表示软件被 GST 记录为正在运行的时间/)).toBeInTheDocument();
  });

  it("uses the selected duration format on the focused software page", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return Promise.resolve({
          close_behavior: "minimize_to_tray",
          close_behavior_configured: false,
          autostart_enabled: true,
          autostart_configured: false,
          duration_format: "hours_minutes",
          duration_format_configured: true,
        });
      }

      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [
            {
              identity_key: "app:code",
              display_name: "Visual Studio Code",
              process_name: "Code.exe",
              icon_url: null,
              today_runtime_seconds: 90 * 60,
              today_foreground_seconds: 60 * 60,
              today_background_seconds: 30 * 60,
              today_focused_seconds: 90 * 60,
              total_runtime_seconds: 8 * 3600 + 35 * 60,
              total_foreground_seconds: 8 * 3600,
              total_background_seconds: 35 * 60,
              total_focused_seconds: 90 * 60,
              last_opened_at: "2026-06-05T09:00:00Z",
              status: "foreground",
              mark: "focused",
            },
          ],
          hidden: [],
          discovered: [],
        });
      }

      if (command === "set_autostart_preference") {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));

    expect(await screen.findAllByText("1小时30分钟")).not.toHaveLength(0);
    expect(screen.getByText("8小时")).toBeInTheDocument();
    expect(screen.getByText("35分钟")).toBeInTheDocument();
  });

  it("explains hidden software in a help bubble instead of a line under every row", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [],
          hidden: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T09:00:00Z",
              status: "background",
              mark: "hidden",
            },
          ],
          discovered: [],
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));

    expect(await screen.findByText("已隐藏")).toBeInTheDocument();
    expect(screen.getByText("BitDock")).toBeInTheDocument();
    expect(screen.queryByText("BitDock.exe")).not.toBeInTheDocument();
    expect(screen.queryByText(/不参与排行/)).not.toBeInTheDocument();

    const hiddenPanel = screen.getByRole("region", { name: "隐藏软件列表" });
    const help = within(hiddenPanel).getByRole("button", { name: "什么是隐藏软件" });
    expect(help.closest(".software-panel-head")).not.toBeNull();
    fireEvent.click(help);
    const bubble = screen.getByRole("dialog", { name: "什么是隐藏软件？" });
    expect(bubble).toHaveTextContent("仍照常记录");
    fireEvent.click(help);
    expect(screen.queryByRole("dialog", { name: "什么是隐藏软件？" })).not.toBeInTheDocument();
  });

  it("keeps discovered search quiet when no rows match", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:code",
              display_name: "Visual Studio Code",
              process_name: "Code.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 1800,
              total_runtime_seconds: 7200,
              total_focused_seconds: 3600,
              last_opened_at: "2026-06-05T09:00:00Z",
              status: "closed",
              mark: "none",
            },
          ],
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    expect(await screen.findByText("Visual Studio Code")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索已发现软件" }), {
      target: { value: "Photoshop" },
    });

    expect(screen.queryByText("Visual Studio Code")).not.toBeInTheDocument();
    expect(screen.queryByText("没有匹配的软件")).not.toBeInTheDocument();
  });

  it("opens a shared add dialog with target-specific title and multi-selects rows", async () => {
    let summaryCalls = 0;
    mockInvoke.mockImplementation((command, args) => {
      if (command === "get_software_page_summary") {
        summaryCalls += 1;
        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T08:10:00Z",
              status: "background",
              mark: summaryCalls > 1 ? "hidden" : "none",
            },
            {
              identity_key: "app:wallpaper",
              display_name: "Wallpaper Engine",
              process_name: "wallpaper64.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T08:08:00Z",
              status: "background",
              mark: summaryCalls > 1 ? "hidden" : "none",
            },
          ],
        });
      }

      if (command === "add_hidden_software_identities") {
        expect(args).toEqual({ identityKeys: ["app:bitdock", "app:wallpaper"] });
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加隐藏软件" }));

    const dialog = screen.getByRole("dialog", { name: "添加隐藏软件" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("搜索已发现软件")).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "添加" })).toBeDisabled();
    fireEvent.click(within(dialog).getByText("BitDock"));
    fireEvent.click(within(dialog).getByText("Wallpaper Engine"));
    expect(within(dialog).getByRole("button", { name: "添加 2 个" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "添加 2 个" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "添加隐藏软件" })).not.toBeInTheDocument(),
    );
    expect(await screen.findAllByText("已隐藏")).not.toHaveLength(0);
  });

  it("refreshes overview data after hidden software changes", async () => {
    let softwareCalls = 0;
    let dashboardCalls = 0;
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        softwareCalls += 1;
        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T08:10:00Z",
              status: "background",
              mark: "none",
            },
          ],
        });
      }

      if (command === "add_hidden_software_identities") {
        return Promise.resolve(undefined);
      }

      if (command === "get_dashboard_summary") {
        dashboardCalls += 1;
        return Promise.resolve({
          product_title: "全局软件计时器",
          locale: "zh-CN",
          most_used: null,
          recorded_today_seconds: 0,
          active_today_seconds: 0,
          apps: [],
        });
      }

      return Promise.resolve({
        close_behavior: "minimize_to_tray",
        close_behavior_configured: false,
        autostart_enabled: true,
        autostart_configured: false,
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加隐藏软件" }));
    const dialog = screen.getByRole("dialog", { name: "添加隐藏软件" });
    fireEvent.click(within(dialog).getByText("BitDock"));
    fireEvent.click(within(dialog).getByRole("button", { name: "添加 1 个" }));

    await waitFor(() => expect(softwareCalls).toBeGreaterThan(1));
    expect(dashboardCalls).toBeGreaterThan(1);
  });

  it("shows a conflict prompt for mutually exclusive software in the add dialog", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T08:10:00Z",
              status: "background",
              mark: "hidden",
            },
          ],
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加特别关注" }));
    const dialog = screen.getByRole("dialog", { name: "添加特别关注" });
    fireEvent.click(within(dialog).getByText("BitDock"));

    expect(within(dialog).getByText("该软件已加入隐藏列表哦！请先移出再尝试")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "添加" })).toBeDisabled();
  });

  it("keeps add dialog search no-results quiet with the primary action disabled", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T08:10:00Z",
              status: "background",
              mark: "none",
            },
          ],
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加特别关注" }));
    const dialog = screen.getByRole("dialog", { name: "添加特别关注" });

    expect(within(dialog).getByText("BitDock")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "搜索已发现软件" }), {
      target: { value: "Photoshop" },
    });

    expect(within(dialog).queryByText("BitDock")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("没有匹配的软件")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "添加" })).toBeDisabled();
  });

  it("exits focused edit mode before opening the add dialog", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [
            {
              identity_key: "app:code",
              display_name: "Visual Studio Code",
              process_name: "Code.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 1800,
              total_runtime_seconds: 7200,
              total_focused_seconds: 3600,
              last_opened_at: "2026-06-05T09:00:00Z",
              status: "foreground",
              mark: "focused",
            },
          ],
          hidden: [],
          discovered: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T08:10:00Z",
              status: "background",
              mark: "none",
            },
          ],
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑特别关注" }));

    expect(screen.getByRole("button", { name: "完成特别关注" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移出 Visual Studio Code" })).toBeInTheDocument();

    // Apple HIG: a button that opens another window ends its title with an ellipsis.
    expect(screen.getByRole("button", { name: "添加特别关注" })).toHaveTextContent(/^添加…$/);
    // Only one prominent 添加… per page: the hidden list's is a secondary key.
    expect(screen.getByRole("button", { name: "添加特别关注" })).not.toHaveClass("is-secondary");
    expect(screen.getByRole("button", { name: "添加隐藏软件" })).toHaveClass("panel-add-button", "is-secondary");
    fireEvent.click(screen.getByRole("button", { name: "添加特别关注" }));
    expect(screen.getByRole("dialog", { name: "添加特别关注" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移出 Visual Studio Code" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("button", { name: "编辑特别关注" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "完成特别关注" })).not.toBeInTheDocument();
  });

  it("closes the add dialog on Escape and returns focus to the opener", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T08:10:00Z",
              status: "background",
              mark: "none",
            },
          ],
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    const opener = screen.getByRole("button", { name: "添加特别关注" });
    opener.focus();
    fireEvent.click(opener);

    expect(screen.getByRole("dialog", { name: "添加特别关注" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "添加特别关注" })).not.toBeInTheDocument(),
    );
    expect(opener).toHaveFocus();
  });

  it("closes the add dialog from the close button and returns focus to the opener", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T08:10:00Z",
              status: "background",
              mark: "none",
            },
          ],
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    const opener = screen.getByRole("button", { name: "添加特别关注" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "添加特别关注" });

    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "添加特别关注" })).not.toBeInTheDocument(),
    );
    expect(opener).toHaveFocus();
  });

  it("closes the add dialog and shows a list warning when refresh fails after add succeeds", async () => {
    let summaryCalls = 0;
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        summaryCalls += 1;

        if (summaryCalls > 1) {
          return Promise.reject(new Error("summary refresh failed"));
        }

        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:code",
              display_name: "Visual Studio Code",
              process_name: "Code.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 1800,
              total_runtime_seconds: 7200,
              total_focused_seconds: 3600,
              last_opened_at: "2026-06-05T09:00:00Z",
              status: "foreground",
              mark: "none",
            },
          ],
        });
      }

      if (command === "add_focused_software_identities") {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加特别关注" }));
    const dialog = screen.getByRole("dialog", { name: "添加特别关注" });
    fireEvent.click(within(dialog).getByText("Visual Studio Code"));
    fireEvent.click(within(dialog).getByRole("button", { name: "添加 1 个" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "添加特别关注" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("无法读取软件列表")).toBeInTheDocument();
    expect(screen.queryByText("添加失败，请重试。")).not.toBeInTheDocument();
  });

  it("traps Tab focus inside the add dialog", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T08:10:00Z",
              status: "background",
              mark: "none",
            },
          ],
        });
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加特别关注" }));
    const dialog = screen.getByRole("dialog", { name: "添加特别关注" });
    fireEvent.click(within(dialog).getByText("BitDock"));
    const primaryButton = within(dialog).getByRole("button", { name: "添加 1 个" });
    primaryButton.focus();

    await userEvent.tab();

    expect(within(dialog).getByRole("button", { name: "关闭" })).toHaveFocus();
  });

  it("keeps the add dialog open with the exact conflict prompt when add rejects with a list conflict", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 0,
              total_runtime_seconds: 7200,
              total_focused_seconds: 0,
              last_opened_at: "2026-06-05T08:10:00Z",
              status: "background",
              mark: "none",
            },
          ],
        });
      }

      if (command === "add_focused_software_identities") {
        return Promise.reject("software_conflict_hidden");
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加特别关注" }));
    const dialog = screen.getByRole("dialog", { name: "添加特别关注" });
    fireEvent.click(within(dialog).getByText("BitDock"));
    fireEvent.click(within(dialog).getByRole("button", { name: "添加 1 个" }));

    expect(
      await within(dialog).findByText("该软件已加入隐藏列表哦！请先移出再尝试"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "添加特别关注" })).toBeInTheDocument();
    expect(within(dialog).queryByText("添加失败，请重试。")).not.toBeInTheDocument();
  });

  it("keeps the add dialog open and shows a retry message when add rejects", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [],
          hidden: [],
          discovered: [
            {
              identity_key: "app:code",
              display_name: "Visual Studio Code",
              process_name: "Code.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 1800,
              total_runtime_seconds: 7200,
              total_focused_seconds: 3600,
              last_opened_at: "2026-06-05T09:00:00Z",
              status: "foreground",
              mark: "none",
            },
          ],
        });
      }

      if (command === "add_focused_software_identities") {
        return Promise.reject(new Error("conflict"));
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加特别关注" }));
    const dialog = screen.getByRole("dialog", { name: "添加特别关注" });
    fireEvent.click(within(dialog).getByText("Visual Studio Code"));
    fireEvent.click(within(dialog).getByRole("button", { name: "添加 1 个" }));

    expect(await within(dialog).findByText("添加失败，请重试。")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "添加特别关注" })).toBeInTheDocument();
  });

  it("shows list-load warning when remove succeeds but refresh fails", async () => {
    let softwareSummaryCalls = 0;
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        softwareSummaryCalls += 1;

        if (softwareSummaryCalls > 1) {
          return Promise.reject(new Error("summary refresh failed"));
        }

        return Promise.resolve({
          focused: [
            {
              identity_key: "app:code",
              display_name: "Visual Studio Code",
              process_name: "Code.exe",
              icon_url: null,
              today_runtime_seconds: 3600,
              today_focused_seconds: 1800,
              total_runtime_seconds: 7200,
              total_focused_seconds: 3600,
              last_opened_at: "2026-06-05T09:00:00Z",
              status: "foreground",
              mark: "focused",
            },
          ],
          hidden: [],
          discovered: [],
        });
      }

      if (command === "remove_focused_software_identity") {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "软件" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑特别关注" }));
    fireEvent.click(await screen.findByRole("button", { name: "移出 Visual Studio Code" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("remove_focused_software_identity", {
        identityKey: "app:code",
      }),
    );
    expect(await screen.findByText("无法读取软件列表")).toBeInTheDocument();
    expect(screen.queryByText("移出软件失败")).not.toBeInTheDocument();
    expect(screen.getByText("Visual Studio Code")).toBeInTheDocument();
  });

  it("opens the settings page while keeping the existing left navigation", async () => {
    render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
    const status = within(screen.getByRole("region", { name: "本机状态" }));
    expect(status.getByText(`V${packageJson.version}`)).toBeVisible();
    expect(status.getByText("仅本机")).toBeVisible();
    expect(screen.getByRole("button", { name: "概览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "软件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "统计" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "时间轴" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "成就" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "日报" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toHaveAttribute("aria-current", "page");
    const startupSwitch = screen.getByRole("switch", { name: "开机自启动" });
    const closeSwitch = screen.getByRole("switch", { name: "关闭窗口时最小化到后台" });
    await waitFor(() => expect(startupSwitch).not.toBeDisabled());
    await waitFor(() => expect(closeSwitch).not.toBeDisabled());
    expect(startupSwitch).toHaveAttribute("aria-checked", "true");
    expect(closeSwitch).toHaveAttribute("aria-checked", "true");
  });

  it("enables startup at login by default without a permission dialog", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const startupSwitch = screen.getByRole("switch", { name: "开机自启动" });
    await waitFor(() => expect(autostartMocks.enable).toHaveBeenCalledTimes(1));
    expect(startupSwitch).not.toBeDisabled();
    expect(startupSwitch).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("dialog", { name: /管理员权限/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/本软件不会使用管理员权限/)).not.toBeInTheDocument();
  });

  it("does not re-enable startup at login when saved settings cannot be read", async () => {
    autostartMocks.isEnabled.mockResolvedValue(false);
    const defaultImplementation = mockInvoke.getMockImplementation();
    mockInvoke.mockImplementation((command, args) => {
      if (command === "get_app_settings") {
        return Promise.reject(new Error("database is locked"));
      }
      return defaultImplementation?.(command, args);
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const startupSwitch = screen.getByRole("switch", { name: "开机自启动" });
    await waitFor(() => expect(startupSwitch).not.toBeDisabled());
    expect(startupSwitch).toHaveAttribute("aria-checked", "false");
    expect(autostartMocks.enable).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalledWith("set_autostart_preference", expect.anything());
  });

  it("disables startup at login directly when the startup switch is turned off", async () => {
    autostartMocks.isEnabled.mockResolvedValue(true);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const startupSwitch = screen.getByRole("switch", { name: "开机自启动" });
    await waitFor(() => expect(startupSwitch).toHaveAttribute("aria-checked", "true"));
    expect(startupSwitch).not.toBeDisabled();

    fireEvent.click(startupSwitch);

    await waitFor(() => expect(autostartMocks.disable).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("set_autostart_preference", { enabled: false });
    expect(startupSwitch).toHaveAttribute("aria-checked", "false");
  });

  it("saves the close-window behavior from the settings switch", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const closeSwitch = screen.getByRole("switch", { name: "关闭窗口时最小化到后台" });
    await waitFor(() => expect(closeSwitch).not.toBeDisabled());
    expect(closeSwitch).toHaveAttribute("aria-checked", "true");

    fireEvent.click(closeSwitch);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_close_behavior_preference", {
        choice: "exit",
      }),
    );
    expect(closeSwitch).toHaveAttribute("aria-checked", "false");
  });

  it("renders the duration minutes switch off by default", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const durationSwitch = screen.getByRole("switch", { name: "显示分钟数" });

    await waitFor(() => expect(durationSwitch).not.toBeDisabled());
    expect(durationSwitch).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("开启后将会显示具体分钟数，如“8小时35分钟”")).toBeInTheDocument();
    expect(screen.getAllByText("已关闭").length).toBeGreaterThan(0);
  });

  it("saves hours-minutes duration display from the settings switch", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const durationSwitch = screen.getByRole("switch", { name: "显示分钟数" });
    await waitFor(() => expect(durationSwitch).not.toBeDisabled());

    fireEvent.click(durationSwitch);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_duration_format_preference", {
        durationFormat: "hours_minutes",
      }),
    );
    expect(durationSwitch).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByText("已开启").length).toBeGreaterThan(0);
  });

  it("follows the system theme by default and saves a chosen theme", async () => {
    const emptyDashboard = {
      product_title: "全局软件计时器",
      locale: "zh-CN",
      most_used: null,
      recorded_today_seconds: 0,
      active_today_seconds: 0,
      apps: [],
    };
    const setTheme = vi.fn().mockResolvedValue(undefined);
    getCurrentWindowMock.mockReturnValue({
      onCloseRequested: vi.fn().mockResolvedValue(vi.fn()),
      setTheme,
    });
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return Promise.resolve({ theme: "system", theme_configured: false });
      }

      return Promise.resolve(command === "get_dashboard_summary" ? emptyDashboard : undefined);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const themeGroup = screen.getByRole("radiogroup", { name: "主题" });
    const darkOption = within(themeGroup).getByRole("radio", { name: "深色" });
    await waitFor(() => expect(darkOption).not.toBeDisabled());
    expect(within(themeGroup).getByRole("radio", { name: "跟随系统" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(darkOption);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_theme_preference", { theme: "dark" }),
    );
    expect(darkOption).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(setTheme).toHaveBeenLastCalledWith("dark");
  });

  it("keeps the latest theme when an older save fails", async () => {
    const pending = createDeferred<void>();
    const invokeDefault = mockInvoke.getMockImplementation()!;
    mockInvoke.mockImplementation((command, args) => {
      if (command === "set_theme_preference" && args.theme === "light") return pending.promise;
      if (command === "set_theme_preference") return Promise.resolve();
      return invokeDefault(command, args);
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const light = screen.getByRole("radio", { name: "浅色" });
    await waitFor(() => expect(light).toBeEnabled());
    fireEvent.click(light);
    const dark = screen.getByRole("radio", { name: "深色" });
    fireEvent.click(dark);
    expect(dark).toHaveAttribute("aria-checked", "true");
    await act(async () => pending.reject(new Error("write failed")));
    expect(mockInvoke).toHaveBeenCalledWith("set_theme_preference", { theme: "dark" });
    expect(dark).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("主题设置保存失败")).toBeNull();
  });

  it("rolls back the theme when saving fails", async () => {
    const emptyDashboard = {
      product_title: "全局软件计时器",
      locale: "zh-CN",
      most_used: null,
      recorded_today_seconds: 0,
      active_today_seconds: 0,
      apps: [],
    };
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return Promise.resolve({ theme: "light", theme_configured: true });
      }

      if (command === "set_theme_preference") {
        return Promise.reject(new Error("database is temporarily locked"));
      }

      return Promise.resolve(command === "get_dashboard_summary" ? emptyDashboard : undefined);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const lightOption = screen.getByRole("radio", { name: "浅色" });
    await waitFor(() => expect(lightOption).toHaveAttribute("aria-checked", "true"));

    fireEvent.click(screen.getByRole("radio", { name: "深色" }));

    expect(await screen.findByText("主题设置保存失败")).toBeInTheDocument();
    expect(lightOption).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("prevents concurrent duration display saves", async () => {
    const durationSave = createDeferred<void>();
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return Promise.resolve({
          close_behavior: "minimize_to_tray",
          close_behavior_configured: false,
          autostart_enabled: true,
          autostart_configured: false,
          duration_format: "decimal_hours",
          duration_format_configured: false,
        });
      }

      if (command === "set_duration_format_preference") {
        return durationSave.promise;
      }

      if (command === "set_autostart_preference") {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const durationSwitch = screen.getByRole("switch", { name: "显示分钟数" });
    await waitFor(() => expect(durationSwitch).not.toBeDisabled());

    fireEvent.click(durationSwitch);

    await waitFor(() => expect(durationSwitch).toBeDisabled());
    fireEvent.click(durationSwitch);
    expect(
      mockInvoke.mock.calls.filter(([command]) => command === "set_duration_format_preference"),
    ).toHaveLength(1);
    expect(mockInvoke).toHaveBeenCalledWith("set_duration_format_preference", {
      durationFormat: "hours_minutes",
    });

    durationSave.resolve(undefined);
    await waitFor(() => expect(durationSwitch).not.toBeDisabled());
    expect(durationSwitch).toHaveAttribute("aria-checked", "true");
  });

  it("rolls back the duration display switch when saving fails", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return Promise.resolve({
          close_behavior: "minimize_to_tray",
          close_behavior_configured: false,
          autostart_enabled: true,
          autostart_configured: false,
          duration_format: "decimal_hours",
          duration_format_configured: false,
        });
      }

      if (command === "set_duration_format_preference") {
        return Promise.reject(new Error("locked"));
      }

      if (command === "set_autostart_preference") {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const durationSwitch = screen.getByRole("switch", { name: "显示分钟数" });
    await waitFor(() => expect(durationSwitch).not.toBeDisabled());

    fireEvent.click(durationSwitch);

    await waitFor(() => expect(screen.getByText("时间显示设置保存失败")).toBeInTheDocument());
    expect(durationSwitch).toHaveAttribute("aria-checked", "false");
  });

  it("keeps settings switches disabled until startup and settings state load", async () => {
    const appSettings = createDeferred<{
      close_behavior: "exit";
      close_behavior_configured: true;
      autostart_enabled: true;
      autostart_configured: false;
    }>();
    const startupEnabled = createDeferred<boolean>();
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return appSettings.promise;
      }

      if (command === "set_close_behavior_preference" || command === "apply_window_close_choice") {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });
    autostartMocks.isEnabled.mockReturnValue(startupEnabled.promise);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    const startupSwitch = screen.getByRole("switch", { name: "开机自启动" });
    const closeSwitch = screen.getByRole("switch", { name: "关闭窗口时最小化到后台" });
    expect(startupSwitch).toBeDisabled();
    expect(closeSwitch).toBeDisabled();

    appSettings.resolve({
      close_behavior: "exit",
      close_behavior_configured: true,
      autostart_enabled: true,
      autostart_configured: false,
    });
    startupEnabled.resolve(true);

    await waitFor(() => expect(startupSwitch).not.toBeDisabled());
    expect(closeSwitch).not.toBeDisabled();
    expect(startupSwitch).toHaveAttribute("aria-checked", "true");
    expect(closeSwitch).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the dashboard shell visible when the Tauri window API is unavailable", async () => {
    getCurrentWindowMock.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'metadata')");
    });

    render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出日报" })).toBeInTheDocument();
  });

  it("shows software-specific icons for known applications", async () => {
    mockInvoke.mockResolvedValue({
      product_title: "全局软件计时器",
      locale: "zh-CN",
      most_used: null,
      recorded_today_seconds: 0,
      active_today_seconds: 0,
      apps: [
        {
          app_id: 1,
          display_name: "Visual Studio Code",
          process_name: "Code.exe",
          icon_url: "data:image/png;base64,AAAA",
          total_seconds: 3600,
          today_seconds: 1800,
          active_today_seconds: 1200,
          status: "foreground",
          is_running: true,
        },
        {
          app_id: 2,
          display_name: "Chrome",
          process_name: "chrome.exe",
          icon_url: null,
          total_seconds: 1800,
          today_seconds: 900,
          active_today_seconds: 600,
          status: "background",
          is_running: false,
        },
        {
          app_id: 3,
          display_name: "Microsoft Edge",
          process_name: "msedge.exe",
          icon_url: null,
          total_seconds: 1200,
          today_seconds: 600,
          active_today_seconds: 300,
          status: "closed",
          is_running: false,
        },
        {
          app_id: 4,
          display_name: "Steam",
          process_name: "steam.exe",
          icon_url: null,
          total_seconds: 900,
          today_seconds: 300,
          active_today_seconds: 200,
          status: "closed",
          is_running: false,
        },
        {
          app_id: 5,
          display_name: "WPS Office",
          process_name: "wps.exe",
          icon_url: null,
          total_seconds: 600,
          today_seconds: 300,
          active_today_seconds: 120,
          status: "closed",
          is_running: false,
        },
      ],
    });

    render(<App />);

    const vscodeIcon = (await screen.findAllByLabelText("Visual Studio Code 图标"))[0];
    expect(vscodeIcon.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(screen.getAllByLabelText("Chrome 图标").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Microsoft Edge 图标")[0]).toHaveTextContent("M");
    expect(screen.getAllByLabelText("Steam 图标")[0]).toHaveTextContent("S");
    expect(screen.getAllByLabelText("WPS Office 图标")[0]).toHaveTextContent("W");
    expect(screen.getAllByText("前台运行").length).toBeGreaterThan(0);
    expect(screen.getAllByText("后台运行").length).toBeGreaterThan(0);
    expect(screen.getAllByText("未运行").length).toBeGreaterThan(0);
    expect(screen.getByText("后台运行").closest(".status-badge")).toHaveClass("background");
    expect(screen.getAllByText("未运行")[0].closest(".status-badge")).toHaveClass("closed");
  });

  it("asks whether to exit or minimize to tray on the first window close", async () => {
    render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    const preventDefault = vi.fn();
    await act(async () => {
      await closeRequestMock.handler?.({ preventDefault });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "关闭全局软件计时器" })).toBeInTheDocument();
    expect(screen.getByText("后续可在设置中更改。")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "记住本次选择" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "最小化到状态栏" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("apply_window_close_choice", {
        choice: "minimize_to_tray",
        remember: true,
      }),
    );
  });

  it("keeps the first-close dialog open when saving the choice fails", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return Promise.resolve({
          close_behavior: "minimize_to_tray",
          close_behavior_configured: false,
          autostart_enabled: true,
          autostart_configured: false,
        });
      }

      if (command === "set_autostart_preference" || command === "set_close_behavior_preference") {
        return Promise.resolve(undefined);
      }

      if (command === "apply_window_close_choice") {
        return Promise.reject(new Error("hide failed"));
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    await act(async () => {
      await closeRequestMock.handler?.({ preventDefault: vi.fn() });
    });

    fireEvent.click(screen.getByRole("button", { name: "最小化到状态栏" }));

    expect(await screen.findByText("关闭操作失败，请重试。")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "关闭全局软件计时器" })).toBeInTheDocument();
  });

  it("uses the persisted close behavior from app settings", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_app_settings") {
        return Promise.resolve({
          close_behavior: "exit",
          close_behavior_configured: true,
          autostart_enabled: true,
          autostart_configured: false,
        });
      }

      if (command === "set_autostart_preference") {
        return Promise.resolve(undefined);
      }

      if (command === "set_close_behavior_preference") {
        return Promise.resolve(undefined);
      }

      if (command === "apply_window_close_choice") {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
        most_used: null,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: [],
      });
    });

    render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    const preventDefault = vi.fn();
    await act(async () => {
      await closeRequestMock.handler?.({ preventDefault });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "关闭全局软件计时器" })).not.toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("apply_window_close_choice", {
      choice: "exit",
      remember: false,
    });
  });

  it("asks Windows whether transparency effects are on", async () => {
    render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_transparency_effects_enabled"));
  });

  // §E: the 启动时打开 options are the available sidebar pages other than 设置, in sidebar order.
  it("lists the start pages exactly as the sidebar's available pages", async () => {
    const { container } = render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    const availablePages = Array.from(container.querySelectorAll<HTMLButtonElement>(".side-nav button"))
      .filter((button) => button.getAttribute("aria-disabled") !== "true")
      .map((button) => button.querySelector("span")?.textContent)
      .filter((label) => label !== "设置");
    expect(availablePages).toEqual(START_PAGE_IDS.map((id) => START_PAGE_NAMES[id]));
  });

  // Spec §B: the watch reads the Windows accent only while 主题色 is 跟随 Windows (main.tsx paints the cache
  // before App renders).
  describe("Windows accent watch", () => {
    afterEach(() => {
      window.localStorage.removeItem("gst.appearance");
      paintInitialAppearance();
    });

    it("reads the Windows accent when the cached 主题色 is 跟随 Windows", async () => {
      window.localStorage.setItem("gst.appearance", JSON.stringify({ accent: "system" }));
      paintInitialAppearance();
      render(<App />);

      expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_windows_accent"));
    });

    it("does not read the Windows accent for a preset 主题色", async () => {
      window.localStorage.setItem("gst.appearance", JSON.stringify({ accent: "green" }));
      paintInitialAppearance();
      render(<App />);

      expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_transparency_effects_enabled"));
      expect(mockInvoke).not.toHaveBeenCalledWith("get_windows_accent");
    });
  });

  it("still marks the timeline entry as unavailable", async () => {
    const { container } = render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    const timeline = Array.from(container.querySelectorAll<HTMLButtonElement>(".side-nav button")).find(
      (button) => button.querySelector("span")?.textContent === "时间轴",
    );
    expect(timeline).toBeDefined();
    expect(timeline).toHaveAttribute("aria-disabled", "true");
    const badge = timeline?.querySelector("em");
    expect(badge?.textContent).toBe("未开放");
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });
});

// v0.4.2 decision H: 概览 and 后台 browse past days; today stays live and follows midnight.
describe("App date browsing", () => {
  const dataStartDate = "2026-09-03";
  type DayArgs = { date?: string } | undefined;
  let dashboardCalls: Array<string | undefined> = [];
  let pastDayAnswer: (date: string) => Promise<unknown> = async (date) => pastDashboard(date);

  function usageRow(id: number, name: string, active: number, status: string) {
    return {
      app_id: id,
      display_name: name,
      process_name: `${name.toLowerCase()}.exe`,
      icon_url: null,
      total_seconds: 40 * 3600,
      today_seconds: 2 * 3600,
      active_today_seconds: active,
      status,
      is_running: status !== "closed",
    };
  }

  function todayDashboard() {
    const app = usageRow(1, "Codex", 3600, "foreground");
    return {
      last_scan_succeeded: true,
      product_title: "全局软件计时器",
      locale: "zh-CN",
      usage_date: localDate(new Date()),
      is_today: true,
      most_used: app,
      recorded_today_seconds: 2 * 3600,
      active_today_seconds: 3600,
      apps: [app],
    };
  }

  function pastDashboard(date: string, apps = [usageRow(2, "Word", 30 * 60, "closed")]) {
    return {
      ...todayDashboard(),
      usage_date: date,
      is_today: false,
      most_used: apps[0] ?? null,
      recorded_today_seconds: apps.length * 2 * 3600,
      active_today_seconds: apps.reduce((sum, app) => sum + app.active_today_seconds, 0),
      apps,
    };
  }

  function localDate(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function shiftDays(value: string, days: number) {
    const [year, month, day] = value.split("-").map(Number);
    return localDate(new Date(year, month - 1, day + days));
  }

  const dateKey = () => screen.getByRole("button", { name: /，打开日历$/ });

  /** Lets pending reads settle; under fake timers it also runs the timers due within `ms`. */
  async function flush(ms = 0) {
    await act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(ms);
      else await Promise.resolve();
    });
  }

  beforeEach(() => {
    dashboardCalls = [];
    pastDayAnswer = async (date) => pastDashboard(date);
    mockInvoke.mockReset();
    getCurrentWindowMock.mockReset();
    getCurrentWindowMock.mockReturnValue({ onCloseRequested: vi.fn(() => Promise.resolve(vi.fn())) });
    autostartMocks.isEnabled.mockResolvedValue(true);
    mockInvoke.mockImplementation(async (command: string, args: DayArgs) => {
      if (command === "get_app_settings") {
        return {
          close_behavior: "minimize_to_tray",
          close_behavior_configured: true,
          autostart_enabled: true,
          autostart_configured: true,
        };
      }
      if (command === "get_calendar_summary") {
        return { today: localDate(new Date()), data_start_date: dataStartDate };
      }
      if (command === "get_dashboard_summary") {
        dashboardCalls.push(args?.date);
        return args?.date ? pastDayAnswer(args.date) : todayDashboard();
      }
      if (command === "get_background_page_summary") {
        return {
          logical_cores: 8,
          running_count: 0,
          rows: [],
          usage_date: args?.date ?? localDate(new Date()),
          is_today: !args?.date,
        };
      }
      return undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("steps the day with Ctrl+← / Ctrl+→ and switches pages with Ctrl+digits", async () => {
    render(<App />);
    expect(await screen.findByRole("complementary", { name: "正在运行" })).toBeInTheDocument();
    const today = localDate(new Date());
    const yesterday = shiftDays(today, -1);
    await waitFor(() => expect(screen.getByRole("button", { name: "前一天" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "前一天" })).toHaveAttribute("aria-keyshortcuts", "Control+ArrowLeft");
    expect(screen.getByRole("button", { name: "概览" })).toHaveAttribute("aria-keyshortcuts", "Control+1");
    expect(screen.getByRole("button", { name: "设置" })).toHaveAttribute("aria-keyshortcuts", "Control+6 Control+,");

    fireEvent.keyDown(document.body, { key: "ArrowLeft", ctrlKey: true });
    await waitFor(() => expect(dateKey()).toHaveTextContent(yesterday));
    fireEvent.keyDown(document.body, { key: "ArrowRight", ctrlKey: true });
    await waitFor(() => expect(dateKey()).toHaveTextContent(today));
    // Today is the last day: another Ctrl+→ stays put.
    fireEvent.keyDown(document.body, { key: "ArrowRight", ctrlKey: true });
    expect(dateKey()).toHaveTextContent(today);

    fireEvent.keyDown(document.body, { key: "3", ctrlKey: true });
    expect(screen.getByRole("button", { name: "后台" })).toHaveAttribute("aria-current", "page");
  });

  // Apple HIG: people can hide the sidebar. The icon rail keeps every page's name for screen readers.
  it("folds the sidebar into its icon rail and back from the key under the nav", async () => {
    const { container } = render(<App />);
    expect(await screen.findByRole("complementary", { name: "正在运行" })).toBeInTheDocument();
    const shell = container.querySelector(".app-shell");
    expect(shell).not.toHaveClass("is-rail");

    fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));
    expect(shell).toHaveClass("is-rail");
    expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "统计" })).toHaveAttribute("data-label", "统计");
    expect(window.localStorage.getItem("gst.sidebar-collapsed")).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }));
    expect(shell).not.toHaveClass("is-rail");
    expect(window.localStorage.getItem("gst.sidebar-collapsed")).toBeNull();
  });

  it("shows a past day in 当日 wording, with 当日分布 filling the rail", async () => {
    const { container } = render(<App />);
    expect(await screen.findByRole("complementary", { name: "正在运行" })).toBeInTheDocument();
    const yesterday = shiftDays(localDate(new Date()), -1);

    await waitFor(() => expect(screen.getByRole("button", { name: "前一天" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "前一天" }));

    expect(await screen.findByRole("region", { name: "当日总览" })).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("get_dashboard_summary", { date: yesterday });
    expect(dateKey()).toHaveTextContent(yesterday);
    const readout = screen.getByRole("region", { name: "当日总览" });
    expect(within(readout).getByText("当日记录")).toBeInTheDocument();
    expect(within(readout).getByText("当日活跃")).toBeInTheDocument();
    expect(within(readout).getByText("当日活跃 0.5小时")).toBeInTheDocument();
    const [year, month, day] = yesterday.split("-").map(Number);
    const weekday = `周${"日一二三四五六"[new Date(year, month - 1, day).getDay()]}`;
    expect(container.querySelector(".lcd-dial-clock")).toHaveTextContent(`${weekday}${day}日`);
    expect(screen.getByRole("figure", { name: "满圈 24 小时" })).toBeInTheDocument();

    expect(screen.queryByRole("complementary", { name: "正在运行" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "当日分布" })).toBeInTheDocument();
    expect(container.querySelector(".right-rail")).toHaveClass("is-past");
    expect(container.querySelector(".right-rail")?.children).toHaveLength(1);

    const head = container.querySelector(".usage-head") as HTMLElement;
    expect([...head.children].map((cell) => cell.textContent)).toEqual(["软件", "累计", "当日", "当日活跃"]);
    const table = screen.getByRole("region", { name: "应用时长列表" });
    expect(within(table).getByText("1 个软件")).toBeInTheDocument();
    expect(within(table).getAllByText("0.5小时").length).toBeGreaterThan(0);
    expect(within(table).queryByText(/运行/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "今天" }));
    expect(await screen.findByRole("complementary", { name: "正在运行" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "今日总览" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "今天" })).not.toBeInTheDocument();
  });

  it("says when a past day recorded nothing", async () => {
    pastDayAnswer = async (date) => pastDashboard(date, []);
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "前一天" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "前一天" }));

    expect(await screen.findByText("这一天没有记录到软件")).toBeInTheDocument();
    expect(screen.getByText("这一天没有活跃记录。")).toBeInTheDocument();
    expect(screen.queryByText("还没有记录到软件")).not.toBeInTheDocument();
    expect(screen.queryByText(/保持 GST 在托盘运行/)).not.toBeInTheDocument();
  });

  it("reads a past day once and polls today again back on today", async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 24, 10, 0, 0) });
    render(<App />);
    await flush(10000);
    expect(dashboardCalls).toEqual([undefined, undefined, undefined]);

    fireEvent.click(screen.getByRole("button", { name: "前一天" }));
    await flush(30000);
    // The page reads the past day once; the undated reads only feed the sidebar lamp.
    expect(dashboardCalls.slice(3).filter((date) => date !== undefined)).toEqual(["2026-11-23"]);
    expect(screen.getByRole("region", { name: "当日总览" })).toBeInTheDocument();

    const backOnToday = dashboardCalls.length;
    fireEvent.click(screen.getByRole("button", { name: "今天" }));
    await flush(5000);
    expect(dashboardCalls.slice(backOnToday)).toEqual([undefined, undefined]);
    expect(screen.getByRole("region", { name: "今日总览" })).toBeInTheDocument();
  });

  it("keeps the sidebar lamp live while a past day is shown", async () => {
    let liveScanSucceeded: boolean | null = true;
    const invokeDefault = mockInvoke.getMockImplementation()!;
    mockInvoke.mockImplementation(async (command: string, args: DayArgs) => {
      const answer = await invokeDefault(command, args);
      return command === "get_dashboard_summary" && !args?.date
        ? { ...(answer as object), last_scan_succeeded: liveScanSucceeded }
        : answer;
    });
    vi.useFakeTimers({ now: new Date(2026, 10, 24, 10, 0, 0) });
    const { container } = render(<App />);
    const lamp = () => container.querySelector(".live-status");
    await flush();
    expect(lamp()).toHaveTextContent("正在记录");

    fireEvent.click(screen.getByRole("button", { name: "前一天" }));
    await flush();
    expect(screen.getByRole("region", { name: "当日总览" })).toBeInTheDocument();

    liveScanSucceeded = false;
    await flush(5000);
    expect(lamp()).toHaveTextContent("采样失败，正在重试");
    expect(screen.getByRole("region", { name: "当日总览" })).toBeInTheDocument();

    liveScanSucceeded = true;
    await flush(5000);
    expect(lamp()).toHaveTextContent("正在记录");
  });

  it("keeps the lamp and drops the other day's figures when a past day cannot be read", async () => {
    pastDayAnswer = () => Promise.reject(new Error("database is temporarily locked"));
    const { container } = render(<App />);
    expect(await screen.findByRole("region", { name: "今日总览" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "前一天" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "前一天" }));

    expect(await screen.findByText("无法读取本地数据")).toHaveAttribute("role", "alert");
    expect(screen.queryByRole("region", { name: "今日总览" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "当日总览" })).not.toBeInTheDocument();
    expect(container.querySelector(".live-status")).toHaveTextContent("正在记录");
  });

  it("marks the other day's figures busy until the picked day's read lands", async () => {
    let answerPastDay!: () => void;
    pastDayAnswer = (date) => new Promise((resolve) => {
      answerPastDay = () => resolve(pastDashboard(date));
    });
    const { container } = render(<App />);
    expect(await screen.findByRole("region", { name: "今日总览" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "前一天" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "前一天" }));

    const page = container.querySelector("#overview-content");
    expect(page).toHaveAttribute("aria-busy", "true");
    expect(page).toHaveClass("is-stale");
    expect(screen.getByRole("region", { name: "今日总览" })).toBeInTheDocument();

    await act(async () => {
      answerPastDay();
    });
    expect(screen.getByRole("region", { name: "当日总览" })).toBeInTheDocument();
    expect(page).not.toHaveAttribute("aria-busy");
    expect(page).not.toHaveClass("is-stale");
  });

  it("follows midnight to the new day while on today", async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 24, 23, 59, 58) });
    render(<App />);
    await flush();
    expect(dateKey()).toHaveTextContent("2026-11-24");
    const before = dashboardCalls.length;

    await flush(3000);
    expect(dateKey()).toHaveTextContent("2026-11-25");
    expect(dashboardCalls.length).toBeGreaterThan(before);
    expect(mockInvoke.mock.calls.filter(([command]) => command === "get_calendar_summary")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "今日总览" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "今天" })).not.toBeInTheDocument();
  });

  it("reads the calendar bounds again after a failed read", async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 24, 10, 0, 0) });
    const answer = mockInvoke.getMockImplementation()!;
    let calendarReads = 0;
    mockInvoke.mockImplementation(async (command: string, args: DayArgs) => {
      if (command === "get_calendar_summary" && ++calendarReads === 1) throw new Error("database is busy");
      return answer(command, args);
    });
    render(<App />);
    await flush();
    expect(screen.getByRole("button", { name: "前一天" })).toBeDisabled();

    await flush(30000);
    expect(calendarReads).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "前一天" })).toBeEnabled();

    // A successful read is not repeated.
    const reads = calendarReads;
    await flush(120000);
    expect(calendarReads).toBe(reads);
  });

  it("stays on a picked past day across midnight", async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 24, 23, 59, 50) });
    render(<App />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "前一天" }));
    await flush();
    expect(dateKey()).toHaveTextContent("2026-11-23");

    await flush(15000);
    expect(dateKey()).toHaveTextContent("2026-11-23");
    expect(screen.getByRole("button", { name: "今天" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "当日总览" })).toBeInTheDocument();
    expect(new Set(dashboardCalls.filter((date) => date !== undefined))).toEqual(new Set(["2026-11-23"]));
  });

  it("returns to today when the backend refuses the day", async () => {
    pastDayAnswer = () => Promise.reject("day_invalid_date");
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "前一天" })).toBeEnabled());
    const todayCalls = dashboardCalls.length;
    fireEvent.click(screen.getByRole("button", { name: "前一天" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "今天" })).not.toBeInTheDocument());
    expect(dateKey()).toHaveTextContent(localDate(new Date()));
    // The past day, the lamp's live read beside it, then today's read.
    await waitFor(() =>
      expect(dashboardCalls.slice(todayCalls)).toEqual([shiftDays(localDate(new Date()), -1), undefined, undefined]),
    );
    expect(screen.queryByText("无法读取本地数据")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "今日总览" })).toBeInTheDocument();
  });

  it("drops a late answer for today once a past day is picked", async () => {
    let answerToday!: (value: unknown) => void;
    const invokeDefault = mockInvoke.getMockImplementation()!;
    let held = false;
    mockInvoke.mockImplementation((command: string, args: DayArgs) => {
      if (command === "get_dashboard_summary" && !args?.date && dashboardCalls.length === 1 && !held) {
        held = true;
        dashboardCalls.push(undefined);
        return new Promise((resolve) => {
          answerToday = resolve;
        });
      }
      return invokeDefault(command, args);
    });
    vi.useFakeTimers({ now: new Date(2026, 10, 24, 10, 0, 0) });
    render(<App />);
    await flush(5000);
    expect(held).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "前一天" }));
    await flush();
    expect(screen.getByRole("region", { name: "当日总览" })).toBeInTheDocument();

    await act(async () => {
      answerToday(todayDashboard());
    });
    expect(screen.getByRole("region", { name: "当日总览" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "正在运行" })).not.toBeInTheDocument();
  });

  it("shows the viewed past day on 后台 too", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "前一天" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "前一天" }));
    const yesterday = shiftDays(localDate(new Date()), -1);
    fireEvent.click(screen.getByRole("button", { name: "后台" }));

    expect(await screen.findByText("这一天没有后台记录。")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("get_background_page_summary", { date: yesterday });
    expect(dateKey()).toHaveTextContent(yesterday);
  });
});
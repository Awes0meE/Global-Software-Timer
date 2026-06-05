import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

      return Promise.resolve({
        product_title: "全局软件计时器",
        locale: "zh-CN",
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
    expect(screen.getByText("正在记录")).toBeInTheDocument();
  });

  it("renders the app version from package metadata", async () => {
    render(<App />);

    expect(await screen.findByText(`v${packageJson.version}`)).toBeInTheDocument();
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

    expect(await screen.findByText("无法读取本地数据")).toBeInTheDocument();
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
          icon_data_url: null,
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
            icon_data_url: null,
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
        icon_data_url: "data:image/png;base64,AAAA",
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
          icon_data_url: "data:image/png;base64,AAAA",
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
          icon_data_url: null,
          total_seconds: 115 * 3600 + 47 * 60,
          today_seconds: 45 * 60,
          active_today_seconds: 5 * 60,
          status: "foreground",
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
    expect(screen.getByRole("complementary", { name: "当前前台运行" })).toBeInTheDocument();
    const recentPanel = screen.getByRole("complementary", { name: "当前前台运行" });
    expect(await within(recentPanel).findByText("3.3小时")).toBeInTheDocument();
    expect(within(recentPanel).getByText("0.8小时")).toBeInTheDocument();
    expect(within(recentPanel).queryByText("前台运行")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出" })).toBeInTheDocument();
    expect(container.querySelector(".trophy-visual svg")).toHaveAttribute("fill", "currentColor");
    expect(container.querySelector(".trophy-visual .trophy-base")).toHaveAttribute("fill", "currentColor");
    expect(container.querySelector(".trophy-visual span")).not.toBeInTheDocument();
  });

  it("removes duplicated settings and statistics actions from the top right header", async () => {
    const { container } = render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    const windowActions = container.querySelector(".window-actions");

    expect(windowActions).toBeInTheDocument();
    expect(within(windowActions as HTMLElement).queryByRole("button", { name: "设置" })).not.toBeInTheDocument();
    expect(within(windowActions as HTMLElement).queryByRole("button", { name: "统计" })).not.toBeInTheDocument();
    expect(within(windowActions as HTMLElement).getByRole("button", { name: "更多" })).toBeInTheDocument();
  });

  it("shows and hides an unfinished-feature tooltip on unavailable controls", async () => {
    render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    const unavailableButtons = [
      screen.getByRole("button", { name: "统计" }),
      screen.getByRole("button", { name: "时间轴" }),
      screen.getByRole("button", { name: "日报" }),
      screen.getByRole("button", { name: "更多" }),
      screen.getByRole("button", { name: /查看更多今日分布/ }),
      screen.getByRole("button", { name: /查看更多当前前台运行/ }),
      screen.getByRole("button", { name: /\d{4}-\d{2}-\d{2}/ }),
      screen.getByRole("button", { name: "导出" }),
    ];

    for (const button of unavailableButtons) {
      const trigger = button.closest("[data-tooltip='该功能暂未完成']");
      expect(trigger).not.toBeNull();
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute("aria-disabled", "true");
    }

    const statisticsTrigger = unavailableButtons[0].closest("[data-tooltip='该功能暂未完成']");
    expect(statisticsTrigger).not.toBeNull();

    fireEvent.mouseEnter(statisticsTrigger as Element);
    expect(screen.getByRole("tooltip")).toHaveTextContent("该功能暂未完成");

    fireEvent.mouseLeave(statisticsTrigger as Element);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(unavailableButtons[0]);
    const focusedTooltip = screen.getByRole("tooltip");
    expect(focusedTooltip).toHaveTextContent("该功能暂未完成");
    expect(unavailableButtons[0]).toHaveAttribute("aria-describedby", focusedTooltip.id);

    fireEvent.blur(unavailableButtons[0]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens the software page with three panels", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({ focused: [], hidden: [], discovered: [] });
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

    expect(screen.getByRole("heading", { name: "特别关注" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "隐藏软件列表" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "已发现软件" })).toBeInTheDocument();
    expect(screen.getByText("还没有特别关注的软件")).toBeInTheDocument();
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
              icon_data_url: null,
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
    fireEvent.click(await screen.findByRole("button", { name: "什么是活跃时长" }));

    expect(screen.getByRole("dialog", { name: "什么是活跃时长？" })).toBeInTheDocument();
    expect(screen.getByText(/运行时长表示软件被 GST 记录为正在运行的时间/)).toBeInTheDocument();
  });

  it("shows the approved hidden row secondary copy", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_software_page_summary") {
        return Promise.resolve({
          focused: [],
          hidden: [
            {
              identity_key: "app:bitdock",
              display_name: "BitDock",
              process_name: "BitDock.exe",
              icon_data_url: null,
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

    expect(await screen.findByText("概览隐藏 · 不参与排行 · 仍正常记录")).toBeInTheDocument();
    expect(screen.getByText("已隐藏")).toBeInTheDocument();
    expect(screen.queryByText("BitDock.exe")).not.toBeInTheDocument();
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
              icon_data_url: null,
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
              icon_data_url: null,
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
              icon_data_url: null,
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
              icon_data_url: null,
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
              icon_data_url: null,
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
              icon_data_url: null,
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
              icon_data_url: null,
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
              icon_data_url: null,
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
              icon_data_url: null,
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
              icon_data_url: null,
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
              icon_data_url: null,
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

    fireEvent.keyDown(primaryButton, { key: "Tab" });

    expect(within(dialog).getByRole("button", { name: "关闭" })).toHaveFocus();
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
              icon_data_url: null,
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
              icon_data_url: null,
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
    expect(screen.getByRole("button", { name: "概览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "软件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "统计" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "时间轴" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日报" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "更多" })).toBeInTheDocument();
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
          icon_data_url: "data:image/png;base64,AAAA",
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
          icon_data_url: null,
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
          icon_data_url: null,
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
          icon_data_url: null,
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
          icon_data_url: null,
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
});

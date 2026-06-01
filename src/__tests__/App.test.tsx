import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
const getCurrentWindowMock = vi.hoisted(() => vi.fn());
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

import packageJson from "../../package.json";
import App from "../App";

describe("App", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  beforeEach(() => {
    mockInvoke.mockReset();
    getCurrentWindowMock.mockReset();
    closeRequestMock.handler = undefined;
    closeRequestMock.unlisten.mockReset();
    getCurrentWindowMock.mockReturnValue({
      onCloseRequested: vi.fn((handler) => {
        closeRequestMock.handler = handler;
        return Promise.resolve(closeRequestMock.unlisten);
      }),
    });
    mockInvoke.mockImplementation((command) => {
      if (command === "get_close_behavior_preference") {
        return Promise.resolve(null);
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
      if (command === "get_close_behavior_preference") {
        return Promise.resolve(null);
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
      screen.getByRole("button", { name: "软件" }),
      screen.getByRole("button", { name: "统计" }),
      screen.getByRole("button", { name: "时间轴" }),
      screen.getByRole("button", { name: "日报" }),
      screen.getByRole("button", { name: "设置" }),
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

    const softwareTrigger = unavailableButtons[0].closest("[data-tooltip='该功能暂未完成']");
    expect(softwareTrigger).not.toBeNull();

    fireEvent.mouseEnter(softwareTrigger as Element);
    expect(screen.getByRole("tooltip")).toHaveTextContent("该功能暂未完成");

    fireEvent.mouseLeave(softwareTrigger as Element);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(unavailableButtons[0]);
    const focusedTooltip = screen.getByRole("tooltip");
    expect(focusedTooltip).toHaveTextContent("该功能暂未完成");
    expect(unavailableButtons[0]).toHaveAttribute("aria-describedby", focusedTooltip.id);

    fireEvent.blur(unavailableButtons[0]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "退出软件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "最小化到状态栏" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "记住本次选择" }));
    fireEvent.click(screen.getByRole("button", { name: "最小化到状态栏" }));

    expect(mockInvoke).toHaveBeenCalledWith("apply_window_close_choice", {
      choice: "minimize_to_tray",
      remember: true,
    });
  });

  it("uses the remembered close choice without showing the dialog", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_close_behavior_preference") {
        return Promise.resolve("minimize_to_tray");
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
      choice: "minimize_to_tray",
      remember: false,
    });
  });
});

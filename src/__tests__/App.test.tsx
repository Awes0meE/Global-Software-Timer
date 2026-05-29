import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
const closeRequestMock = vi.hoisted(() => ({
  handler: undefined as undefined | ((event: { preventDefault: () => void }) => void | Promise<void>),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn((handler) => {
      closeRequestMock.handler = handler;
      return Promise.resolve(closeRequestMock.unlisten);
    }),
  }),
}));

import App from "../App";

describe("App", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  beforeEach(() => {
    mockInvoke.mockReset();
    closeRequestMock.handler = undefined;
    closeRequestMock.unlisten.mockReset();
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
          is_running: true,
        },
        {
          app_id: 2,
          display_name: "Chrome",
          process_name: "chrome.exe",
          icon_data_url: null,
          total_seconds: 115 * 3600 + 47 * 60,
          today_seconds: 45 * 60,
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
    expect(screen.getByRole("complementary", { name: "当前运行" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出" })).toBeInTheDocument();
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
          is_running: true,
        },
        {
          app_id: 2,
          display_name: "Chrome",
          process_name: "chrome.exe",
          icon_data_url: null,
          total_seconds: 1800,
          today_seconds: 900,
          is_running: false,
        },
        {
          app_id: 3,
          display_name: "Microsoft Edge",
          process_name: "msedge.exe",
          icon_data_url: null,
          total_seconds: 1200,
          today_seconds: 600,
          is_running: false,
        },
        {
          app_id: 4,
          display_name: "Steam",
          process_name: "steam.exe",
          icon_data_url: null,
          total_seconds: 900,
          today_seconds: 300,
          is_running: false,
        },
        {
          app_id: 5,
          display_name: "WPS Office",
          process_name: "wps.exe",
          icon_data_url: null,
          total_seconds: 600,
          today_seconds: 300,
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

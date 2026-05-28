import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockAutostart = vi.hoisted(() => ({
  disable: vi.fn(),
  enable: vi.fn(),
  isEnabled: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/plugin-autostart", () => mockAutostart);

import App from "../App";

describe("App", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({
      product_title: "全局软件计时器",
      locale: "zh-CN",
      most_used: null,
      recorded_today_seconds: 0,
      active_today_seconds: 0,
      apps: [],
      hidden_apps: [],
    });
    mockAutostart.disable.mockReset();
    mockAutostart.enable.mockReset();
    mockAutostart.isEnabled.mockReset();
    mockAutostart.isEnabled.mockResolvedValue(false);
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

  it("shows settings controls for startup, app rename, hide, and restore", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      product_title: "全局软件计时器",
      locale: "zh-CN",
      most_used: null,
      recorded_today_seconds: 0,
      active_today_seconds: 0,
      apps: [
        {
          app_id: 7,
          display_name: "Visual Studio Code",
          process_name: "code.exe",
          total_seconds: 120,
          today_seconds: 60,
          is_running: false,
        },
      ],
      hidden_apps: [
        {
          app_id: 9,
          display_name: "Microsoft Word",
          process_name: "winword.exe",
          total_seconds: 60,
          today_seconds: 0,
          is_running: false,
        },
      ],
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(await screen.findByLabelText("开机自动启动")).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "隐藏 Visual Studio Code" }));
    expect(mockInvoke).toHaveBeenCalledWith("hide_app_group", { appId: 7 });

    await user.clear(screen.getByLabelText("重命名 Visual Studio Code"));
    await user.type(screen.getByLabelText("重命名 Visual Studio Code"), "Code Studio");
    await user.click(screen.getByRole("button", { name: "保存 Visual Studio Code 名称" }));
    expect(mockInvoke).toHaveBeenCalledWith("rename_app_group", {
      appId: 7,
      displayName: "Code Studio",
    });

    await user.click(screen.getByRole("button", { name: "恢复 Microsoft Word" }));
    expect(mockInvoke).toHaveBeenCalledWith("unhide_app_group", { appId: 9 });
  });

  it("does not show raw autostart plugin errors in browser preview", async () => {
    mockAutostart.isEnabled.mockRejectedValue(new Error("plugin autostart unavailable"));

    render(<App />);

    expect(await screen.findByText("无法读取启动设置")).toBeInTheDocument();
    expect(screen.queryByText("plugin autostart unavailable")).not.toBeInTheDocument();
  });
});

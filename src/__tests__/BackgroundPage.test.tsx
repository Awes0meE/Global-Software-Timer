import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackgroundPageSummary } from "../api";
import {
  BackgroundPage,
  formatBytes,
  formatCpuTime,
  formatPercent,
} from "../components/BackgroundPage";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

const summary: BackgroundPageSummary = {
  logical_cores: 8,
  running_count: 1,
  rows: [
    {
      family_key: "razer",
      display_name: "RazerCentralService",
      process_name: "razercentralservice.exe",
      icon_data_url: null,
      is_running: true,
      process_count: 2,
      cpu_percent: 3.25,
      memory_bytes: 64 * 1024 * 1024,
      today_running_seconds: 7200,
      today_cpu_seconds: 150,
    },
    {
      family_key: "updater",
      display_name: "Updater",
      process_name: "updater.exe",
      icon_data_url: null,
      is_running: false,
      process_count: 1,
      cpu_percent: null,
      memory_bytes: 2 * 1024 * 1024 * 1024,
      today_running_seconds: 60,
      today_cpu_seconds: 0.4,
    },
  ],
};

describe("BackgroundPage", () => {
  it("lists background software with live and daily usage", async () => {
    invoke.mockResolvedValue(summary);
    await act(async () => {
      render(<BackgroundPage />);
    });

    const list = screen.getByRole("region", { name: "后台进程列表" });
    const running = within(list).getByText("RazerCentralService").closest(".background-row");
    expect(running).not.toBeNull();
    const cells = within(running as HTMLElement);
    expect(cells.getByText("3.3%")).toBeInTheDocument();
    expect(cells.getByText("64 MB")).toBeInTheDocument();
    expect(cells.getByText("2.0小时")).toBeInTheDocument();
    expect(cells.getByText("3分钟")).toBeInTheDocument();
    expect(cells.getByText("运行中")).toBeInTheDocument();

    const exited = within(list).getByText("Updater").closest(".background-row");
    expect(within(exited as HTMLElement).getByText("已退出")).toBeInTheDocument();
    expect(within(exited as HTMLElement).getByText("2.0 GB")).toBeInTheDocument();

    const overview = screen.getByRole("region", { name: "后台概况" });
    expect(within(overview).getByText("1 个")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("get_background_page_summary");
  });

  it("shows an error and an empty state when nothing can be read", async () => {
    invoke.mockRejectedValue(new Error("locked"));
    await act(async () => {
      render(<BackgroundPage />);
    });

    expect(screen.getByText("无法读取后台进程")).toBeInTheDocument();
    expect(screen.getByText("今天还没有记录到后台进程。")).toBeInTheDocument();
  });

  it("formats small and large values readably", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.04)).toBe("<0.1%");
    expect(formatBytes(512 * 1024 * 1024)).toBe("512 MB");
    expect(formatCpuTime(0)).toBe("0秒");
    expect(formatCpuTime(0.5)).toBe("<1秒");
    expect(formatCpuTime(42)).toBe("42秒");
    expect(formatCpuTime(5400)).toBe("1.5小时");
  });
});

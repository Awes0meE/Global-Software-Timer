import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackgroundPageSummary } from "../api";
import {
  BackgroundPage,
  formatBytes,
  formatCpuSeconds,
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
    expect(cells.getByText("2分钟")).toBeInTheDocument();
    expect(cells.queryByText("0.0小时")).not.toBeInTheDocument();
    expect(cells.getByText("运行中")).toBeInTheDocument();

    const exited = within(list).getByText("Updater").closest(".background-row");
    expect(within(exited as HTMLElement).getByText("已退出")).toBeInTheDocument();
    expect(within(exited as HTMLElement).getByText("<1秒")).toBeInTheDocument();
    expect(within(exited as HTMLElement).getByText("2.0 GB")).toBeInTheDocument();

    const overview = screen.getByRole("region", { name: "后台概况" });
    expect(within(overview).getByText("1 个")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("get_background_page_summary");
  });

  it("shows only the error if the initial request fails", async () => {
    invoke.mockRejectedValue(new Error("locked"));
    await act(async () => {
      render(<BackgroundPage />);
    });

    expect(screen.getByText("无法读取后台进程")).toBeInTheDocument();
    expect(screen.queryByText("今天还没有记录到后台进程。")).not.toBeInTheDocument();
  });

  it("waits for the first result and honors duration preferences near an hour", async () => {
    const rows = [{ ...summary.rows[0], today_cpu_seconds: 3599 }];
    invoke.mockResolvedValue({ ...summary, rows });
    const view = render(<BackgroundPage durationFormat="hours_minutes" />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取");
    expect(screen.queryByText("今天还没有记录到后台进程。")).not.toBeInTheDocument();
    expect(await screen.findByText("59分钟")).toBeInTheDocument();
    view.rerender(<BackgroundPage durationFormat="decimal_hours" />);
    expect(screen.getByText("1.0小时")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveAccessibleDescription(/已退出的进程显示今日峰值/);
  });

  it("formats CPU time without misleading zeros", () => {
    const cases: Array<[number, string, string]> = [
      // [seconds, decimal_hours, hours_minutes]
      [0, "0秒", "0秒"],
      [0.4, "<1秒", "<1秒"],
      [1, "1秒", "1秒"],
      [59.6, "59秒", "59秒"],
      [60, "1分钟", "1分钟"],
      [359, "5分钟", "5分钟"],
      [360, "0.1小时", "6分钟"],
      [3599, "1.0小时", "59分钟"],
      [3600, "1.0小时", "1小时"],
      [7260, "2.0小时", "2小时1分钟"],
      [Number.NaN, "0秒", "0秒"],
      [Number.POSITIVE_INFINITY, "0秒", "0秒"],
      [-5, "0秒", "0秒"],
    ];
    for (const [seconds, decimal, hoursMinutes] of cases) {
      expect(formatCpuSeconds(seconds, "decimal_hours")).toBe(decimal);
      expect(formatCpuSeconds(seconds, "hours_minutes")).toBe(hoursMinutes);
    }
    expect(formatCpuSeconds(150)).toBe("2分钟");
  });

  it("formats small and large values readably", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.04)).toBe("<0.1%");
    expect(formatBytes(512 * 1024 * 1024)).toBe("512 MB");
  });
});

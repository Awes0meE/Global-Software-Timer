import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AppUsageRow, DashboardSummary } from "../api";
import { TodayReadout } from "../components/TodayReadout";

function appRow(todaySeconds: number, activeTodaySeconds: number): AppUsageRow {
  return {
    app_id: 1,
    display_name: "Visual Studio Code",
    process_name: "Code.exe",
    icon_url: null,
    total_seconds: 500 * 3600,
    today_seconds: todaySeconds,
    active_today_seconds: activeTodaySeconds,
    status: "foreground",
    is_running: true,
  };
}

function summaryWith(mostUsed: AppUsageRow | null): DashboardSummary {
  return {
    last_scan_succeeded: true,
    product_title: "全局软件计时器",
    locale: "zh-CN",
    most_used: mostUsed,
    recorded_today_seconds: 4 * 3600,
    active_today_seconds: 3600,
    apps: mostUsed ? [mostUsed] : [],
  };
}

const now = new Date(2026, 10, 21, 12, 0, 0);

describe("TodayReadout", () => {
  afterEach(() => {
    cleanup();
  });

  it("notes today's active time used to pick the most used app", () => {
    render(<TodayReadout summary={summaryWith(appRow(3 * 3600, 42 * 60))} now={now} />);

    expect(screen.getByText("今日活跃 0.7小时")).toBeInTheDocument();
    expect(screen.queryByText(/累计/)).not.toBeInTheDocument();
  });

  it("falls back to today's runtime when the most used app has no active time", () => {
    render(
      <TodayReadout
        summary={summaryWith(appRow(90 * 60, 0))}
        durationFormat="hours_minutes"
        now={now}
      />,
    );

    expect(screen.getByText("今日 1小时30分钟")).toBeInTheDocument();
  });

  it("formats the active note with the selected duration format", () => {
    render(
      <TodayReadout
        summary={summaryWith(appRow(3 * 3600, 42 * 60))}
        durationFormat="hours_minutes"
        now={now}
      />,
    );

    expect(screen.getByText("今日活跃 42分钟")).toBeInTheDocument();
  });
});

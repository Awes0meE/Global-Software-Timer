import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppUsageRow, DashboardSummary, DurationFormat } from "../api";
import { forgetShownReadings, TodayReadout } from "../components/TodayReadout";

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

function readings(recorded: number, active: number): DashboardSummary {
  return { ...summaryWith(null), recorded_today_seconds: recorded, active_today_seconds: active };
}

function readout(recorded: number, active: number, durationFormat: DurationFormat = "decimal_hours") {
  return <TodayReadout summary={readings(recorded, active)} durationFormat={durationFormat} now={now} />;
}

function cell(label: "今日记录" | "今日活跃"): HTMLElement {
  const element = screen.getByText(label).closest<HTMLElement>(".lcd-cell");
  if (!element) throw new Error(`no readout cell for ${label}`);
  return element;
}

/** The ghost's number/unit pairs as [data-text of b, data-text of small]. */
function ghostParts(label: "今日记录" | "今日活跃"): string[][] {
  const ghost = cell(label).querySelector(".lcd-ghost");
  if (!ghost) return [];
  return Array.from(ghost.querySelectorAll(":scope > span"), (pair) => [
    pair.querySelector("b")?.getAttribute("data-text") ?? "",
    pair.querySelector("small")?.getAttribute("data-text") ?? "",
  ]);
}

// Spec 墨水屏配方「残影」, plan trade-off 14: the previously shown reading, drawn behind the current one.
describe("TodayReadout ghost", () => {
  // The shown readings are remembered for the whole window, so each test starts as a new window.
  beforeEach(() => {
    forgetShownReadings();
  });

  afterEach(() => {
    cleanup();
  });

  it("draws no ghost before the reading has changed", () => {
    const { container, rerender } = render(readout(4 * 3600, 3600));
    expect(container.querySelector(".lcd-ghost")).toBeNull();

    rerender(readout(4 * 3600, 3600));
    expect(container.querySelector(".lcd-ghost")).toBeNull();

    // The seconds changed but the shown 4.0 did not.
    rerender(readout(4 * 3600 + 60, 3600 + 60));
    expect(container.querySelector(".lcd-ghost")).toBeNull();
  });

  it("leaves the previously shown reading behind the one that changed", () => {
    const { container, rerender } = render(readout(4 * 3600, 3600));
    rerender(readout(14760, 3600));

    const ghosts = container.querySelectorAll(".lcd-ghost");
    expect(ghosts).toHaveLength(1);
    const ghost = cell("今日记录").querySelector(".lcd-ghost");
    expect(ghost).not.toBeNull();
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    expect(ghost).toHaveClass("lcd-value");
    expect(ghost?.parentElement).toHaveClass("lcd-value");
    expect(ghostParts("今日记录")).toEqual([["4.0", "小时"]]);
    for (const element of Array.from(ghost?.querySelectorAll("b, small") ?? [])) {
      expect(element.textContent).toBe("");
    }
    expect(cell("今日记录").querySelector(".lcd-value:not(.lcd-ghost) > span:not(.lcd-ghost) b")).toHaveTextContent("4.1");
    expect(cell("今日活跃").querySelector(".lcd-ghost")).toBeNull();
  });

  it("keeps only the last reading", () => {
    const { rerender } = render(readout(4 * 3600, 3600));
    rerender(readout(14760, 3600));
    rerender(readout(15120, 3600));

    expect(ghostParts("今日记录")).toEqual([["4.1", "小时"]]);
  });

  it("keeps both number/unit pairs in hours and minutes", () => {
    const { rerender } = render(readout(90 * 60, 3600, "hours_minutes"));
    rerender(readout(91 * 60, 3600, "hours_minutes"));

    expect(ghostParts("今日记录")).toEqual([
      ["1", "小时"],
      ["30", "分钟"],
    ]);
  });

  it("clears both ghosts when the duration format changes", () => {
    const { container, rerender } = render(readout(4 * 3600, 3600));
    rerender(readout(14760, 3960));
    expect(container.querySelectorAll(".lcd-ghost")).toHaveLength(2);

    rerender(readout(14760, 3960, "hours_minutes"));
    expect(container.querySelector(".lcd-ghost")).toBeNull();
  });

  it("adds no text nodes, so the shown reading is still found by its text", () => {
    const { rerender } = render(readout(4 * 3600, 3600));
    rerender(readout(14760, 3600));

    expect(screen.getByText("4.1")).toBeInTheDocument();
    expect(screen.queryAllByText("4.0")).toHaveLength(0);
  });

  it("keeps the ghost when the overview is left and shown again", () => {
    const first = render(readout(4 * 3600, 3600));
    first.rerender(readout(14760, 3600));
    first.unmount();

    const again = render(readout(14760, 3600));
    expect(ghostParts("今日记录")).toEqual([["4.0", "小时"]]);
    expect(again.container.querySelectorAll(".lcd-ghost")).toHaveLength(1);
  });

  it("leaves the last reading seen before leaving when it changed meanwhile", () => {
    const first = render(readout(4 * 3600, 3600));
    first.unmount();

    render(readout(14760, 3960));
    expect(ghostParts("今日记录")).toEqual([["4.0", "小时"]]);
    expect(ghostParts("今日活跃")).toEqual([["1.0", "小时"]]);
  });

  it("draws no ghost after coming back in another duration format", () => {
    const first = render(readout(4 * 3600, 3600));
    first.rerender(readout(14760, 3600));
    first.unmount();

    const again = render(readout(14760, 3600, "hours_minutes"));
    expect(again.container.querySelector(".lcd-ghost")).toBeNull();
  });

  it("remembers each change once under StrictMode", () => {
    const strict = (recorded: number) => <StrictMode>{readout(recorded, 3600)}</StrictMode>;
    const { rerender } = render(strict(4 * 3600));
    rerender(strict(14760));
    rerender(strict(14760));

    expect(ghostParts("今日记录")).toEqual([["4.0", "小时"]]);
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AppUsageRow } from "../api";
import { TodayMix } from "../components/TodayMix";
import { allCss, parseRules } from "./support/css";

function appRow(id: number, todaySeconds: number, activeTodaySeconds: number): AppUsageRow {
  return {
    app_id: id,
    display_name: `App ${id}`,
    process_name: `app-${id}.exe`,
    icon_url: null,
    total_seconds: todaySeconds,
    today_seconds: todaySeconds,
    active_today_seconds: activeTodaySeconds,
    status: "foreground",
    is_running: true,
  };
}

describe("TodayMix", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses foreground active time for the shares and ordering", () => {
    const apps = [
      appRow(1, 3600, 10),
      appRow(2, 65, 125),
      appRow(3, 65, 0),
    ];

    render(<TodayMix apps={apps} />);

    expect(screen.getByText("App 2")).toBeInTheDocument();
    expect(screen.queryByText("App 3")).not.toBeInTheDocument();
    expect(screen.queryByText("1.0小时")).not.toBeInTheDocument();
    expect(screen.queryByText("其他")).not.toBeInTheDocument();
  });

  it("uses the selected duration format for the rows", () => {
    const apps = [
      appRow(1, 3600, 10),
      appRow(2, 65, 125),
    ];

    render(<TodayMix apps={apps} durationFormat="hours_minutes" />);

    expect(screen.getAllByText("2分钟").length).toBeGreaterThan(0);
  });

  it("paints each bar segment in its identity colour, with no glow colour left inline", () => {
    const apps = [
      appRow(1, 3600, 300),
      appRow(2, 65, 125),
    ];

    const { container } = render(<TodayMix apps={apps} />);
    const segments = container.querySelectorAll<HTMLElement>(".mix-segment");

    expect(segments).toHaveLength(2);
    expect(segments[0].style.backgroundColor).toBe("var(--mix-1)");
    expect(segments[1].style.backgroundColor).toBe("var(--mix-2)");
    for (const segment of segments) {
      expect(segment.style.getPropertyValue("--mix-color")).toBe("");
    }
  });

  it("names a past day's mix 当日分布 and says when that day had no active time", () => {
    render(<TodayMix apps={[appRow(1, 3600, 0)]} pastDay />);

    const panel = screen.getByRole("complementary", { name: "当日分布" });
    expect(panel.querySelector("h2")).toHaveTextContent("当日分布");
    expect(screen.getByRole("region", { name: "当日分布列表" })).toHaveTextContent("这一天没有活跃记录。");
    expect(screen.queryByText(/今日|今天/)).not.toBeInTheDocument();
  });

  // v0.4.7: no total, which fell short of 今日活跃 and read as a contradicting figure; the plate follows the head.
  it("puts the bar straight under the head, with no total and no caption", () => {
    const { container } = render(<TodayMix apps={[appRow(1, 3600, 300)]} />);

    expect(container.querySelector(".mix-total")).toBeNull();
    expect(container.querySelector(".mix-caption")).toBeNull();
    expect(screen.queryByText(/按前台软件拆分/)).not.toBeInTheDocument();
    expect(container.querySelector(".panel-head")?.nextElementSibling).toHaveClass("mix-plate");
  });

  it("keeps each row's share at every window width", () => {
    const rules = parseRules(allCss()["styles.css"]).rules;
    const hidden = rules.filter(
      (rule) => rule.selectors.includes(".mix-row strong") && rule.declarations.display === "none",
    );
    expect(hidden).toEqual([]);
    render(<TodayMix apps={[appRow(1, 3600, 300), appRow(2, 65, 100)]} />);
    expect(screen.getByText("75.0%")).toBeInTheDocument();
  });
});

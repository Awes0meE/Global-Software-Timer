import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AppUsageRow } from "../api";
import { TodayMix } from "../components/TodayMix";

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

  it("uses foreground active time for the total and ordering", () => {
    const apps = [
      appRow(1, 3600, 10),
      appRow(2, 65, 125),
      appRow(3, 65, 0),
    ];

    const { container } = render(<TodayMix apps={apps} />);

    expect(container.querySelector(".mix-total")).toHaveTextContent("0.0小时");
    expect(screen.getByText("App 2")).toBeInTheDocument();
    expect(screen.queryByText("App 3")).not.toBeInTheDocument();
    expect(screen.queryByText("1.0小时")).not.toBeInTheDocument();
    expect(screen.queryByText("其他")).not.toBeInTheDocument();
  });

  it("uses the selected duration format for the total and rows", () => {
    const apps = [
      appRow(1, 3600, 10),
      appRow(2, 65, 125),
    ];

    const { container } = render(<TodayMix apps={apps} durationFormat="hours_minutes" />);

    expect(container.querySelector(".mix-total")).toHaveTextContent("2分钟");
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

  // v0.4.1: no explanatory line under the total; the plate follows the figure directly.
  it("puts the bar straight under the total, with no caption", () => {
    const { container } = render(<TodayMix apps={[appRow(1, 3600, 300)]} />);

    expect(container.querySelector(".mix-caption")).toBeNull();
    expect(screen.queryByText(/按前台软件拆分/)).not.toBeInTheDocument();
    expect(container.querySelector(".mix-total")?.nextElementSibling).toHaveClass("mix-plate");
  });
});

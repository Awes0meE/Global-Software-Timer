import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppUsageRow } from "../api";
import { TodayMix } from "../components/TodayMix";

function appRow(id: number, todaySeconds: number, activeTodaySeconds: number): AppUsageRow {
  return {
    app_id: id,
    display_name: `App ${id}`,
    process_name: `app-${id}.exe`,
    icon_data_url: null,
    total_seconds: todaySeconds,
    today_seconds: todaySeconds,
    active_today_seconds: activeTodaySeconds,
    is_running: true,
  };
}

describe("TodayMix", () => {
  it("uses foreground active time for the total and ordering", () => {
    const apps = [
      appRow(1, 3600, 10),
      appRow(2, 65, 125),
      appRow(3, 65, 0),
    ];

    const { container } = render(<TodayMix apps={apps} />);

    expect(container.querySelector(".mix-total")).toHaveTextContent("2分钟");
    expect(screen.getByText("App 2")).toBeInTheDocument();
    expect(screen.queryByText("App 3")).not.toBeInTheDocument();
    expect(screen.queryByText("1小时0分钟")).not.toBeInTheDocument();
    expect(screen.queryByText("其他")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppUsageRow } from "../api";
import { TodayMix } from "../components/TodayMix";

function appRow(id: number, todaySeconds: number): AppUsageRow {
  return {
    app_id: id,
    display_name: `App ${id}`,
    process_name: `app-${id}.exe`,
    icon_data_url: null,
    total_seconds: todaySeconds,
    today_seconds: todaySeconds,
    is_running: true,
  };
}

describe("TodayMix", () => {
  it("uses recorded wall-clock time as the total and does not synthesize an other bucket", () => {
    const apps = Array.from({ length: 8 }, (_, index) => appRow(index + 1, 65));

    const { container } = render(<TodayMix apps={apps} recordedTodaySeconds={65} />);

    expect(container.querySelector(".mix-total")).toHaveTextContent("1分钟");
    expect(screen.queryByText("8分钟")).not.toBeInTheDocument();
    expect(screen.queryByText("其他")).not.toBeInTheDocument();
    expect(screen.getByText("App 8")).toBeInTheDocument();
  });
});

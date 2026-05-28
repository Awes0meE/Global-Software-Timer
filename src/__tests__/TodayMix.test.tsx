import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TodayMix } from "../components/TodayMix";
import type { AppUsageRow } from "../api";

function appUsageRow(
  app_id: number,
  display_name: string,
  total_seconds: number,
  today_seconds: number,
): AppUsageRow {
  return {
    app_id,
    display_name,
    process_name: `${display_name}.exe`,
    total_seconds,
    today_seconds,
    is_running: false,
  };
}

describe("TodayMix", () => {
  it("orders top apps by today's usage instead of all-time usage", () => {
    const apps = [
      appUsageRow(1, "AllTimeWinner", 10_000, 10),
      appUsageRow(2, "TodayWinner", 100, 90),
    ];

    const { container } = render(<TodayMix apps={apps} />);
    const mixListText = container.querySelector(".mix-list")?.textContent ?? "";

    expect(mixListText.indexOf("TodayWinner")).toBeLessThan(
      mixListText.indexOf("AllTimeWinner"),
    );
  });
});

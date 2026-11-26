import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeekStartContext, useWeekStart, weekOffset, weekStartFromSetting } from "../weekStart";

function Probe() {
  return <span>{useWeekStart()}</span>;
}

describe("weekStart", () => {
  it("maps the stored setting to a getDay() index", () => {
    expect(weekStartFromSetting("monday")).toBe(1);
    expect(weekStartFromSetting("sunday")).toBe(0);
  });

  it("counts days since the first day of the week", () => {
    // getDay(): Sunday 0 … Saturday 6.
    expect([0, 1, 2, 3, 4, 5, 6].map((day) => weekOffset(day, 1))).toEqual([6, 0, 1, 2, 3, 4, 5]);
    expect([0, 1, 2, 3, 4, 5, 6].map((day) => weekOffset(day, 0))).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("defaults to Monday without a provider", () => {
    render(<Probe />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("reads the provided week start", () => {
    render(
      <WeekStartContext.Provider value={0}>
        <Probe />
      </WeekStartContext.Provider>,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

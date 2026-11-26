import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANGE_PRESET,
  formatLocalDate,
  percentChange,
  presetRange,
  splitWeekdayWeekend,
  validateCustomRange,
} from "../statisticsRange";

// 2026-11-21 is a Saturday. Built with the local-time constructor so the tests
// do not depend on the machine's time zone or the real clock.
const now = new Date(2026, 10, 21, 15, 30);
const dataStartDate = "2026-05-29";

describe("statisticsRange presets", () => {
  it("defaults to the last 7 days", () => {
    expect(DEFAULT_RANGE_PRESET).toBe("last7");
    expect(presetRange("last7", now, dataStartDate)).toEqual({
      start: "2026-11-15",
      end: "2026-11-21",
    });
  });

  it("starts this week on Monday", () => {
    expect(presetRange("thisWeek", now, dataStartDate)).toEqual({
      start: "2026-11-16",
      end: "2026-11-21",
    });
    // Sunday still belongs to the week that started on the previous Monday.
    expect(presetRange("thisWeek", new Date(2026, 10, 22, 9), dataStartDate)).toEqual({
      start: "2026-11-16",
      end: "2026-11-22",
    });
    // Monday is the first day of its own week.
    expect(presetRange("thisWeek", new Date(2026, 10, 16, 9), dataStartDate)).toEqual({
      start: "2026-11-16",
      end: "2026-11-16",
    });
  });

  it("starts this week on Sunday when the week starts on Sunday", () => {
    // Saturday is the last day of the week that started on Sunday 11-15.
    expect(presetRange("thisWeek", now, dataStartDate, 0)).toEqual({
      start: "2026-11-15",
      end: "2026-11-21",
    });
    // Sunday is the first day of its own week.
    expect(presetRange("thisWeek", new Date(2026, 10, 22, 9), dataStartDate, 0)).toEqual({
      start: "2026-11-22",
      end: "2026-11-22",
    });
    // Monday belongs to the week that started the day before.
    expect(presetRange("thisWeek", new Date(2026, 10, 16, 9), dataStartDate, 0)).toEqual({
      start: "2026-11-15",
      end: "2026-11-16",
    });
  });

  it("covers this month, the last 30 days and this year", () => {
    expect(presetRange("thisMonth", now, dataStartDate)).toEqual({
      start: "2026-11-01",
      end: "2026-11-21",
    });
    expect(presetRange("last30", now, dataStartDate)).toEqual({
      start: "2026-10-23",
      end: "2026-11-21",
    });
    expect(presetRange("thisYear", now, null)).toEqual({
      start: "2026-01-01",
      end: "2026-11-21",
    });
  });

  it("does not start this year before the data start date", () => {
    expect(presetRange("thisYear", now, dataStartDate)).toEqual({
      start: "2026-05-29",
      end: "2026-11-21",
    });
    expect(presetRange("thisYear", now, "2025-12-01")).toEqual({
      start: "2026-01-01",
      end: "2026-11-21",
    });
  });

  it("uses the local calendar date, not the UTC date", () => {
    const justAfterMidnight = new Date(2026, 10, 21, 0, 5);
    const justBeforeMidnight = new Date(2026, 10, 21, 23, 55);

    expect(formatLocalDate(justAfterMidnight)).toBe("2026-11-21");
    expect(formatLocalDate(justBeforeMidnight)).toBe("2026-11-21");
    expect(presetRange("last7", justAfterMidnight, dataStartDate).end).toBe("2026-11-21");
  });
});

describe("statisticsRange custom validation", () => {
  it("accepts a valid range inside the data", () => {
    expect(validateCustomRange("2026-06-01", "2026-11-21", now, dataStartDate)).toBeNull();
    expect(validateCustomRange("2026-11-21", "2026-11-21", now, dataStartDate)).toBeNull();
  });

  it("rejects malformed dates", () => {
    expect(validateCustomRange("", "2026-11-21", now, dataStartDate)).toBe("请选择开始和结束日期");
    expect(validateCustomRange("2026-02-30", "2026-11-21", now, dataStartDate)).toBe(
      "请选择开始和结束日期",
    );
  });

  it("rejects reversed ranges", () => {
    expect(validateCustomRange("2026-11-21", "2026-11-20", now, dataStartDate)).toBe(
      "开始日期不能晚于结束日期",
    );
  });

  it("rejects ranges ending after today", () => {
    expect(validateCustomRange("2026-11-20", "2026-11-22", now, dataStartDate)).toBe(
      "结束日期不能晚于今天",
    );
  });

  it("rejects ranges starting before the data start date", () => {
    expect(validateCustomRange("2026-05-28", "2026-06-10", now, dataStartDate)).toBe(
      "开始日期不能早于数据起点 2026-05-29",
    );
  });

  it("rejects ranges longer than 366 days", () => {
    // 2025-11-20 .. 2026-11-21 is 367 days; 2025-11-21 .. 2026-11-21 is 366.
    expect(validateCustomRange("2025-11-20", "2026-11-21", now, null)).toBe(
      "区间最长 366 天",
    );
    expect(validateCustomRange("2025-11-21", "2026-11-21", now, null)).toBeNull();
  });
});

describe("percentChange", () => {
  it("returns null when there is nothing to compare against", () => {
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(3600, 0)).toBeNull();
  });

  it("rounds to a whole percent in both directions", () => {
    expect(percentChange(115, 100)).toBe(15);
    expect(percentChange(85, 100)).toBe(-15);
    expect(percentChange(1, 3)).toBe(-67);
    expect(percentChange(1005, 1000)).toBe(1);
    expect(percentChange(995, 1000)).toBe(-1);
    expect(percentChange(100, 100)).toBe(0);
    expect(Object.is(percentChange(999, 1000), 0)).toBe(true);
  });
});

describe("splitWeekdayWeekend", () => {
  it("averages each group over every day in the range, including blank days", () => {
    // 2026-11-16 (Mon) .. 2026-11-22 (Sun)
    const days = [
      { date: "2026-11-16", active_seconds: 3600 },
      { date: "2026-11-17", active_seconds: 0 }, // computer off: still counts
      { date: "2026-11-18", active_seconds: 7200 },
      { date: "2026-11-19", active_seconds: 0 },
      { date: "2026-11-20", active_seconds: 1800 },
      { date: "2026-11-21", active_seconds: 900 }, // Saturday
      { date: "2026-11-22", active_seconds: 0 }, // Sunday, blank
    ];

    expect(splitWeekdayWeekend(days)).toEqual({
      weekdayAverageSeconds: (3600 + 7200 + 1800) / 5,
      weekendAverageSeconds: 450,
    });
  });

  it("returns null for a group with no days in the range", () => {
    expect(
      splitWeekdayWeekend([
        { date: "2026-11-17", active_seconds: 600 },
        { date: "2026-11-18", active_seconds: 1200 },
      ]),
    ).toEqual({ weekdayAverageSeconds: 900, weekendAverageSeconds: null });

    expect(splitWeekdayWeekend([{ date: "2026-11-22", active_seconds: 60 }])).toEqual({
      weekdayAverageSeconds: null,
      weekendAverageSeconds: 60,
    });
    expect(splitWeekdayWeekend([])).toEqual({
      weekdayAverageSeconds: null,
      weekendAverageSeconds: null,
    });
  });

  it("rounds averages to whole seconds", () => {
    expect(
      splitWeekdayWeekend([
        { date: "2026-11-16", active_seconds: 1 },
        { date: "2026-11-17", active_seconds: 0 },
        { date: "2026-11-18", active_seconds: 1 },
      ]).weekdayAverageSeconds,
    ).toBe(1);
  });
});

import { weekOffset, type WeekStart } from "./weekStart";

export type RangePreset = "last7" | "thisWeek" | "thisMonth" | "last30" | "thisYear" | "custom";
export type FixedRangePreset = Exclude<RangePreset, "custom">;

export interface DateRange {
  /** Local date, `YYYY-MM-DD`, inclusive. */
  start: string;
  /** Local date, `YYYY-MM-DD`, inclusive. */
  end: string;
}

export interface WeekdayWeekendSplit {
  weekdayAverageSeconds: number | null;
  weekendAverageSeconds: number | null;
}

export const DEFAULT_RANGE_PRESET: RangePreset = "last7";
/** Same limit as `MAX_RANGE_DAYS` in `src-tauri/src/statistics.rs`. */
export const MAX_RANGE_DAYS = 366;

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  last7: "近 7 天",
  thisWeek: "本周",
  thisMonth: "本月",
  last30: "近 30 天",
  thisYear: "今年",
  custom: "自定义",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function presetRange(
  preset: FixedRangePreset,
  now: Date,
  dataStartDate: string | null,
  weekStart: WeekStart = 1,
): DateRange {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const end = formatLocalDate(now);

  switch (preset) {
    case "last7":
      return { start: formatLocalDate(new Date(year, month, day - 6)), end };
    case "thisWeek": {
      const daysSinceWeekStart = weekOffset(now.getDay(), weekStart);
      return { start: formatLocalDate(new Date(year, month, day - daysSinceWeekStart)), end };
    }
    case "thisMonth":
      return { start: formatLocalDate(new Date(year, month, 1)), end };
    case "last30":
      return { start: formatLocalDate(new Date(year, month, day - 29)), end };
    case "thisYear": {
      const yearStart = formatLocalDate(new Date(year, 0, 1));
      const start = dataStartDate && dataStartDate > yearStart ? dataStartDate : yearStart;
      return { start, end };
    }
  }
}

/** Returns a Chinese error message, or `null` when the custom range is usable. */
export function validateCustomRange(
  start: string,
  end: string,
  now: Date,
  dataStartDate: string | null,
): string | null {
  const startDay = dayNumber(start);
  const endDay = dayNumber(end);

  if (startDay === null || endDay === null) {
    return "请选择开始和结束日期";
  }

  if (startDay > endDay) {
    return "开始日期不能晚于结束日期";
  }

  if (end > formatLocalDate(now)) {
    return "结束日期不能晚于今天";
  }

  if (dataStartDate && start < dataStartDate) {
    return `开始日期不能早于数据起点 ${dataStartDate}`;
  }

  if (endDay - startDay + 1 > MAX_RANGE_DAYS) {
    return `区间最长 ${MAX_RANGE_DAYS} 天`;
  }

  return null;
}

/** Whole-percent change from `previous` to `current`; `null` when `previous` is 0 (无对比). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }

  const change = ((current - previous) * 100) / previous;
  const rounded = Math.sign(change) * Math.round(Math.abs(change));

  return rounded === 0 ? 0 : rounded;
}

/**
 * Daily average active seconds for weekdays and weekends (Saturday, Sunday).
 * Every day in `days` counts toward its group's denominator, including blank
 * days with no activity; a group with no days in the range is `null`.
 */
export function splitWeekdayWeekend(
  days: ReadonlyArray<{ date: string; active_seconds: number }>,
): WeekdayWeekendSplit {
  const weekday = { total: 0, count: 0 };
  const weekend = { total: 0, count: 0 };

  for (const day of days) {
    const number = dayNumber(day.date);

    if (number === null) {
      continue;
    }

    // Day 0 (1970-01-01) was a Thursday; shift so 0 is Sunday.
    const weekdayIndex = (number + 4) % 7;
    const group = weekdayIndex === 0 || weekdayIndex === 6 ? weekend : weekday;
    group.total += day.active_seconds;
    group.count += 1;
  }

  return {
    weekdayAverageSeconds: average(weekday),
    weekendAverageSeconds: average(weekend),
  };
}

/** Formats the local calendar date as `YYYY-MM-DD` (never via `toISOString`). */
export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function average(group: { total: number; count: number }): number | null {
  return group.count === 0 ? null : Math.round(group.total / group.count);
}

/** Days since 1970-01-01 for a valid `YYYY-MM-DD` calendar date, otherwise `null`. */
function dayNumber(value: string): number | null {
  const match = DATE_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }

  return utc.getTime() / DAY_MS;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
